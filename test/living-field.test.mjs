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
  // A page taller than the screen; anchors keep their place in it and their rectangles follow the scroll.
  const page = { height: 5000, scroll: 0 };
  document.body = { getBoundingClientRect: () => ({ top: -page.scroll, bottom: page.height - page.scroll }) };
  document.hidden = false;
  let anchors = [];
  document.querySelectorAll = () => anchors;
  document.createElement = () => ({ getContext: () => ({ fillText() {} }) });
  const uniforms = {};
  const gl = new Proxy({
    ALIASED_POINT_SIZE_RANGE: 1, LINK_STATUS: 2,
    getUniformLocation: (program, name) => name,
    uniform4fv: (name, value) => { uniforms[name] = [...value]; },
    getExtension: () => null,
    getParameter: () => new Float32Array([1, 64]),
    getProgramParameter: () => true,
  }, { get: (object, key) => key in object ? object[key] : () => ({}) });
  const canvas = { getContext: () => gl, clientWidth: 1000, clientHeight: 800, dataset: {}, style: {}, addEventListener() {} };
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
    getComputedStyle: (el) => ({ position: el.pinned ? "sticky" : "static", top: "64px" }),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  for (const key of ["scrollY", "scrollX"]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, get: () => (key === "scrollY" ? page.scroll : 0) });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  // An anchor at `top` in the page; or (pinned) `top` below the top of a sticky stage that sticks 64px from the top
  // of the screen while the page scrolls through `pinned` ([from, to], in page pixels; the stage starts at from + 64).
  const anchor = (glyph, { top = 0, height = 800, pinned = null } = {}) => {
    const stageTop = () => {
      if (!pinned) return 0;
      const [from, to] = pinned;
      return Math.min(Math.max(page.scroll, from), to) + 64 - page.scroll;
    };
    return {
      dataset: { glyph }, isConnected: true, setAttribute() {}, removeAttribute() {},
      parentElement: pinned ? { pinned: true, parentElement: null, getBoundingClientRect: () => ({ top: stageTop() }) } : null,
      getBoundingClientRect: () => {
        const y = pinned ? stageTop() + top : top - page.scroll;
        return { left: 0, top: y, width: 1000, height, bottom: y + height };
      },
    };
  };
  anchors = [anchor("chameleon")];
  const flavor = { colors: { teal: "#55aaaa" }, roles: { fg: "#eeeeee", comment: "#888888" } };
  return {
    document, events, canvas,
    start: async () => (field = await createField(canvas, { night: flavor }, "night")),
    target: (glyph, options) => { anchors = [anchor(glyph, options)]; },
    uniforms,
    scroll(y) { page.scroll = y; events.dispatchEvent(new Event("scroll")); },
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

test("a shape on an anchor that scrolls with the page is drawn in a canvas that scrolls with it", async (t) => {
  const b = browser(t);
  const field = await b.start();
  b.target("chameleon", { top: 1200, height: 1400 });
  b.scroll(1000);
  field.refresh();
  for (let i = 0; i < 3; i++) b.tick();
  assert.equal(b.canvas.style.position, "absolute", "laid in the page, so the browser scrolls it");
  const top = parseFloat(b.canvas.style.top), box = b.uniforms.u_toBox;
  // Where the anchor's middle is in the page: the canvas's top plus the box's middle.
  assert.equal(top + box[1], 1900);
  // Scrolling within the canvas changes nothing that is drawn: the page carries it.
  for (const y of [1060, 1120, 980]) {
    b.scroll(y);
    b.tick();
    assert.equal(parseFloat(b.canvas.style.top), top);
    assert.deepEqual(b.uniforms.u_toBox, box, `at scroll ${y}`);
  }
  // Far enough on, the canvas moves on, and the shape stays where it is in the page.
  b.scroll(1700);
  b.tick();
  const moved = parseFloat(b.canvas.style.top);
  assert.notEqual(moved, top);
  assert.equal(b.canvas.dataset.shape, "chameleon");
  assert.equal(moved + b.uniforms.u_toBox[1], 1900);
  assert.ok(moved <= 1700 && moved + 1600 >= 1700 + 800, "the canvas covers the screen");
});

test("screen-wide shapes, and shapes in a sticky stage while it is stuck, keep a canvas fixed to the screen", async (t) => {
  const b = browser(t);
  const field = await b.start();
  // The stage is stuck while the page scrolls from 1000 to 3000.
  b.target("story:1", { top: 100, height: 300, pinned: [1000, 3000] });
  b.scroll(2000);
  field.refresh();
  b.tick();
  b.tick();
  assert.equal(b.canvas.style.position, "fixed");
  assert.equal(b.uniforms.u_toBox[1], 64 + 100 + 150, "drawn where it is on the screen");
  // Before it sticks, and after it lets go, the stage scrolls with the page, and so does the canvas.
  for (const y of [800, 3200]) {
    b.scroll(y);
    b.tick();
    assert.equal(b.canvas.style.position, "absolute", `at scroll ${y}`);
    const pageY = parseFloat(b.canvas.style.top) + b.uniforms.u_toBox[1];
    assert.equal(pageY, (y < 1000 ? 1000 : 3000) + 64 + 100 + 150, `at scroll ${y}`);
  }
  b.target("field", { top: -9000, height: 10 });
  field.refresh();
  b.tick();
  assert.equal(b.canvas.style.position, "fixed");
  assert.equal(b.canvas.dataset.shape, "field");
});

test("the canvas keeps its size while a phone's toolbars come and go", async (t) => {
  const b = browser(t);
  await b.start();
  const size = [b.canvas.width, b.canvas.height];
  for (const h of [760, 800, 720, 800]) {
    globalThis.innerHeight = h;
    b.events.dispatchEvent(new Event("resize"));
    b.tick();
  }
  assert.deepEqual([b.canvas.width, b.canvas.height], size);
});
