import assert from "node:assert/strict";
import test from "node:test";
import { cancelFlavorScan, scanFlavor } from "../src/scripts/flavor-scan.ts";

function browser(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  const events = new EventTarget();
  globalThis.addEventListener = events.addEventListener.bind(events);
  const root = { dataset: {} };
  const scans = [], animations = [];
  const node = () => ({
    setAttribute() {}, append() {},
    remove() { scans.splice(scans.indexOf(this), 1); },
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
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    documentElement: root,
    body: { append: (scan) => scans.push(scan) },
    createElement: node,
  } });
  t.after(() => {
    cancelFlavorScan();
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
    if (originalListener) Object.defineProperty(globalThis, "addEventListener", originalListener);
    else delete globalThis.addEventListener;
  });
  return { root, scans, animations, events };
}

test("the flavor scan animates the live page for its full duration without a viewport snapshot", async (t) => {
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
