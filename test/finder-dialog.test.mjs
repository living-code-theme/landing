import assert from "node:assert/strict";
import test from "node:test";
import { cancelFinderClose, closeFinder } from "../src/scripts/finder-dialog.ts";

function fixture(t, reduced = false) {
  for (const [key, value] of Object.entries({
    matchMedia: () => ({ matches: reduced }),
    getComputedStyle: () => ({ opacity: "0.8", transform: "matrix(1, 0, 0, 1, 0, 3)" }),
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  const animations = [];
  const dialog = {
    open: true, dataset: {}, closes: 0,
    close() { this.open = false; this.closes++; },
    animate(frames, options) {
      let finish, reject;
      const finished = new Promise((resolve, fail) => { finish = resolve; reject = fail; });
      const animation = { finished, finish, frames, options, cancel() { reject(new Error("cancelled")); } };
      animations.push(animation);
      return animation;
    },
  };
  return { dialog, animations };
}

test("finder remains a native modal until the exit animation finishes", async (t) => {
  const { dialog, animations } = fixture(t);
  closeFinder(dialog);
  assert.equal(dialog.open, true);
  assert.equal(dialog.dataset.closing, "");
  assert.equal(animations[0].frames[0].opacity, "0.8", "exit starts at the current entrance pose");
  assert.equal(animations[0].frames[1].opacity, 0);
  assert.equal(animations[0].options.duration, 180);
  closeFinder(dialog);
  assert.equal(animations.length, 1, "repeated dismissal does not restart the exit");
  animations[0].finish();
  await animations[0].finished;
  assert.equal(dialog.open, false);
  assert.equal(dialog.closes, 1);
  assert.equal(dialog.dataset.closing, undefined);
});

test("reopening cancels an exit without its stale completion closing the finder", async (t) => {
  const { dialog, animations } = fixture(t);
  closeFinder(dialog);
  cancelFinderClose(dialog);
  await animations[0].finished.catch(() => {});
  assert.equal(dialog.open, true);
  assert.equal(dialog.closes, 0);
  assert.equal(dialog.dataset.closing, undefined);
  closeFinder(dialog);
  assert.equal(animations.length, 2, "a subsequent exit still works");
  animations[1].finish();
  await animations[1].finished;
  assert.equal(dialog.closes, 1);
});

test("reduced motion closes immediately", (t) => {
  const { dialog, animations } = fixture(t, true);
  closeFinder(dialog);
  assert.equal(dialog.open, false);
  assert.equal(animations.length, 0);
});

test("browsers without Web Animations still close normally", (t) => {
  const { dialog } = fixture(t);
  delete dialog.animate;
  closeFinder(dialog);
  assert.equal(dialog.open, false);
});

test("closing an already closed finder does nothing", (t) => {
  const { dialog, animations } = fixture(t);
  dialog.open = false;
  closeFinder(dialog);
  assert.equal(dialog.closes, 0);
  assert.equal(animations.length, 0);
});
