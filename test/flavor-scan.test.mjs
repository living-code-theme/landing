import assert from "node:assert/strict";
import test from "node:test";
import { cancelFlavorScan, scanFlavor } from "../src/scripts/flavor-scan.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function browser(t, { viewTransitions = false } = {}) {
  const events = new EventTarget();
  const root = { dataset: {} };
  const scans = [], animations = [], transitions = [];
  const node = () => ({
    setAttribute() {}, append() {},
    remove() { if (scans.includes(this)) scans.splice(scans.indexOf(this), 1); },
    animate(keyframes, options) {
      let resolve, reject;
      const animation = {
        keyframes, options, cancelled: false,
        finished: new Promise((done, fail) => { resolve = done; reject = fail; }),
        finish: () => resolve(),
        cancel() { this.cancelled = true; reject(new Error("cancelled")); },
      };
      animations.push(animation);
      return animation;
    },
  });
  const document = {
    documentElement: root,
    body: { append: (scan) => scans.push(scan) },
    createElement: node,
  };
  if (viewTransitions) document.startViewTransition = (update) => {
    const ready = deferred(), updated = deferred(), finished = deferred();
    const transition = {
      ready: ready.promise, updateCallbackDone: updated.promise, finished: finished.promise,
      skipped: false,
      paint() {
        update();
        updated.resolve();
        if (!this.skipped) ready.resolve();
      },
      skipTransition() {
        this.skipped = true;
        ready.reject(new DOMException("Transition was skipped", "AbortError"));
        finished.resolve();
      },
    };
    transitions.push(transition);
    return transition;
  };
  const globals = {
    document, addEventListener: events.addEventListener.bind(events), scrollX: 0, scrollY: 0,
    Element: class extends EventTarget { closest() { return null; } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  t.after(cancelFlavorScan);
  return { root, scans, animations, transitions, events };
}

test("browsers without view transitions keep the full live scan as a fallback", async (t) => {
  const b = browser(t);
  let updates = 0;
  scanFlavor("paper", () => updates++);
  assert.equal(updates, 1, "the theme is applied exactly once, synchronously");
  assert.equal(b.scans.length, 1);
  assert.equal(b.root.dataset.flavorSwitch, "");
  const animation = b.animations[0];
  assert.equal(animation.options.duration, 1000);
  assert.equal(animation.keyframes[1].transform, "translateY(100dvh)");
  // Scrolling input is never intercepted; there is no frozen viewport to skip.
  for (const type of ["wheel", "touchmove", "scroll", "keydown"]) {
    const event = new Event(type, { cancelable: true });
    b.events.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(animation.cancelled, false);
  }
  animation.finish();
  await Promise.resolve();
  assert.equal(b.scans.length, 0);
  assert.equal(b.root.dataset.flavorSwitch, undefined);
});

test("rapid flavor changes replace the scan without stale cleanup removing the new one", async (t) => {
  const b = browser(t);
  scanFlavor("paper", () => {});
  const previous = b.animations[0];
  scanFlavor("frost", () => {});
  assert.equal(previous.cancelled, true);
  assert.equal(b.scans.length, 1);
  await Promise.resolve(); // The cancelled animation's rejected finished promise.
  assert.equal(b.scans.length, 1);
  assert.equal(b.root.dataset.flavorSwitch, "");
  assert.equal(b.animations[1].cancelled, false);
  b.animations[1].finish();
  await Promise.resolve();
  assert.equal(b.scans.length, 0);
});

test("navigation or reduced motion can cleanly cancel the live scan", async (t) => {
  const b = browser(t);
  scanFlavor("signal", () => {});
  cancelFlavorScan();
  cancelFlavorScan();
  assert.equal(b.animations[0].cancelled, true);
  assert.equal(b.scans.length, 0);
  assert.equal(b.root.dataset.flavorSwitch, undefined);
  await Promise.resolve();
  assert.equal(b.scans.length, 0);
});

test("the old palette is captured before repainting, and the scan starts with the reveal", async (t) => {
  const b = browser(t, { viewTransitions: true });
  let updates = 0;
  scanFlavor("paper", () => updates++);
  assert.equal(updates, 0, "do not repaint before the old palette's snapshot");
  assert.equal(b.root.dataset.flavorTarget, "paper", "remember the selection while capture is pending");
  assert.equal(b.scans.length, 0, "the old palette must not capture the new scan line");
  assert.equal(b.animations.length, 0);
  b.transitions[0].paint();
  await Promise.resolve();
  assert.equal(updates, 1);
  assert.equal(b.scans.length, 1);
  assert.equal(b.animations.length, 1);
  assert.equal(b.animations[0].options.duration, 1000);
  assert.equal(b.animations[0].options.easing, "cubic-bezier(0.65, 0, 0.35, 1)");
  b.animations[0].finish();
  await Promise.resolve();
  assert.equal(b.transitions[0].skipped, true, "no snapshot is left over the finished live page");
  assert.equal(b.scans.length, 0);
  assert.equal(b.root.dataset.flavorTarget, undefined);
  assert.equal(b.root.dataset.flavorSwitch, undefined);
  assert.equal(updates, 1);
});

test("scrolling drops frozen palette snapshots without cutting the live scan short", async (t) => {
  const b = browser(t, { viewTransitions: true });
  scanFlavor("paper", () => {});
  b.transitions[0].paint();
  await Promise.resolve();
  globalThis.scrollY = 200;
  const event = new Event("scroll", { cancelable: true });
  b.events.dispatchEvent(event);
  await Promise.resolve();
  assert.equal(event.defaultPrevented, false);
  assert.equal(b.transitions[0].skipped, true);
  assert.equal(b.animations[0].cancelled, false);
  assert.equal(b.scans.length, 1);
  b.animations[0].finish();
  await Promise.resolve();
  assert.equal(b.scans.length, 0);
});

test("a snapshot skipped before capture still applies the flavor before starting the live fallback", async (t) => {
  const b = browser(t, { viewTransitions: true });
  let updates = 0;
  scanFlavor("signal", () => updates++);
  b.events.dispatchEvent(new Event("wheel"));
  await Promise.resolve();
  assert.equal(b.animations.length, 0, "wait for the skipped transition's DOM update");
  b.transitions[0].paint();
  await Promise.resolve();
  assert.equal(updates, 1);
  assert.equal(b.scans.length, 1);
  assert.equal(b.animations.length, 1);
});

test("rapid changes during capture cannot let stale callbacks repaint or clean up the next scan", async (t) => {
  const b = browser(t, { viewTransitions: true });
  const updates = [];
  scanFlavor("paper", () => updates.push("paper"));
  scanFlavor("frost", () => updates.push("frost"));
  assert.deepEqual(updates, ["paper"], "commit the previous selection before replacing it");
  assert.equal(b.transitions[0].skipped, true);
  assert.equal(b.root.dataset.flavorTarget, "frost");
  b.transitions[0].paint();
  b.transitions[1].paint();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(updates, ["paper", "frost"]);
  assert.equal(b.scans.length, 1);
  assert.equal(b.animations.length, 1);
  assert.equal(b.animations[0].cancelled, false);
  assert.equal(b.root.dataset.flavorTarget, "frost");
});

test("cancelling before capture commits the flavor exactly once and leaves no delayed scan", async (t) => {
  const b = browser(t, { viewTransitions: true });
  let updates = 0;
  scanFlavor("paper", () => updates++);
  cancelFlavorScan();
  b.transitions[0].paint();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(updates, 1);
  assert.equal(b.scans.length, 0);
  assert.equal(b.animations.length, 0);
  assert.equal(b.root.dataset.flavorTarget, undefined);
  assert.equal(b.root.dataset.flavorSwitch, undefined);
});
