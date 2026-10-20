import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Run the real field lifecycle with cheap shapes and a no-op GPU. The RAF queue is
// deliberately observable: a retarget must never fork the persistent rendering loop.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const shapes = moduleUrl(`
  export const COLORS = ["fg", "comment"];
  export const colorIndex = () => 0;
  export function field(n) {
    return { pos: new Float32Array(n * 3), glyph: new Uint8Array(n),
      role: new Uint8Array(n), alpha: new Float32Array(n).fill(1),
      hw: 1, hh: 1, size: 0.02, spin: 0, tilt: 0 };
  }
  export const icon = field, lettering = field, mark = field, portSpiral = field, story = field, wheel = field;
  export function chameleon(n) { return { ...field(n), animate() {} }; }
`);
const source = stripTypeScriptTypes(readFileSync(new URL("../src/scripts/living/field.ts", import.meta.url), "utf8"))
  .replace('"./shapes"', JSON.stringify(shapes))
  .replace('"./chameleon"', JSON.stringify(shapes));
const { createField } = await import(moduleUrl(source));

function browser(t, { reducedMotion = false } = {}) {
  let field;
  t.after(() => field?.destroy());
  const events = new EventTarget();
  const document = new EventTarget();
  document.documentElement = new EventTarget();
  document.documentElement.dataset = {};
  document.body = {};
  document.hidden = false;
  let anchors = [];
  document.querySelectorAll = () => anchors;
  document.createElement = () => ({ getContext: () => ({ fillText() {} }) });
  const gl = new Proxy({
    ALIASED_POINT_SIZE_RANGE: 1, LINK_STATUS: 2,
    getExtension: () => null,
    getParameter: () => new Float32Array([1, 64]),
    getProgramParameter: () => true,
  }, { get: (object, key) => key in object ? object[key] : () => ({}) });
  const canvas = { getContext: () => gl, clientWidth: 1000, clientHeight: 800, dataset: {}, addEventListener() {} };
  const frames = new Map();
  let id = 0, now = 0;
  const motion = new EventTarget();
  motion.matches = reducedMotion;
  const globals = {
    document, navigator: { hardwareConcurrency: 8 }, innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
    matchMedia: () => motion,
    ResizeObserver: class { observe() {} disconnect() {} },
    addEventListener: events.addEventListener.bind(events),
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const anchor = (glyph) => ({
    dataset: { glyph }, isConnected: true, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800, bottom: 800 }),
  });
  anchors = [anchor("chameleon")];
  const flavor = { colors: { teal: "#55aaaa" }, roles: { fg: "#eeeeee", comment: "#888888" } };
  return {
    document, events, canvas,
    start: async () => (field = await createField(canvas, { night: flavor }, "night")),
    target: (glyph) => { anchors = [anchor(glyph)]; },
    scrub: (glyph) => { anchors[0].dataset.glyphTo = glyph; anchors[0].dataset.glyphMix = "0.5"; },
    pending: () => frames.size,
    tick() {
      now += 16.7;
      const pending = [...frames];
      frames.clear();
      for (const [, fn] of pending) fn(now);
    },
  };
}

test("repeated navigation and hero retargeting keep exactly one animation loop", async (t) => {
  const b = browser(t);
  const field = await b.start();
  assert.equal(b.pending(), 1);
  for (const glyph of ["mark", "chameleon", "field", "chameleon", "mark", "chameleon"]) {
    b.target(glyph);
    field.refresh();
    b.tick();
    assert.equal(b.canvas.dataset.shape, glyph);
    assert.equal(b.pending(), 1, `retargeting ${glyph} must not schedule a second frame`);
    b.tick();
    assert.equal(b.pending(), 1);
  }
  field.destroy();
  assert.equal(b.pending(), 0, "destroy cancels the entire loop, including after navigation");
});

test("starting a scroll-scrubbed flight does not fork the animation loop", async (t) => {
  const b = browser(t);
  const field = await b.start();
  b.target("mark");
  field.refresh();
  for (let i = 0; i < 110; i++) b.tick();
  b.scrub("field");
  b.tick();
  assert.equal(b.canvas.dataset.shape, "field");
  assert.equal(b.pending(), 1, "scrub() calls wake() from inside the running frame too");
});

test("a reduced-motion retarget draws once and goes idle", async (t) => {
  const b = browser(t, { reducedMotion: true });
  const field = await b.start();
  b.tick();
  assert.equal(b.pending(), 0);
  b.target("mark");
  field.refresh();
  b.tick();
  assert.equal(b.canvas.dataset.shape, "mark");
  assert.equal(b.pending(), 0, "retargeting during a frame must not leave an extra idle frame");
});

test("hiding and resuming the page does not strand or duplicate the loop", async (t) => {
  const b = browser(t);
  const field = await b.start();
  b.document.hidden = true;
  b.document.dispatchEvent(new Event("visibilitychange"));
  b.tick();
  assert.equal(b.pending(), 0);
  b.document.hidden = false;
  b.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(b.pending(), 1);
  b.tick();
  assert.equal(b.pending(), 1);
});
