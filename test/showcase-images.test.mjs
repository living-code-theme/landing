import assert from "node:assert/strict";
import test from "node:test";
import { enhanceShowcaseImages } from "../src/scripts/showcase-images.ts";

function fixture(t) {
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  class Tab { closest() { return this; } }
  const events = new Map(), images = [], thumbnails = [];
  const makeImage = (id, flavor, thumbnail = false) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { id, flavor, calls: 0, dataset: { imageSrc: `/${id}-${flavor}${thumbnail ? '-small' : ''}.webp`, imageSrcset: '/small.webp 240w, /large.webp 480w' },
      decode() { this.calls++; return thumbnail ? Promise.resolve() : promise; }, resolve, reject };
  };
  const selectImage = (images, selector) => images[selector.match(/data-only="(.*?)"/)[1]];
  const tabs = ["a", "b", "excluded"].map((id) => {
    const byFlavor = Object.fromEntries(["night", "paper"].map((flavor) => [flavor, makeImage(id, flavor, true)]));
    thumbnails.push(...Object.values(byFlavor));
    return Object.assign(new Tab(), { dataset: { appTab: id }, hidden: id === "excluded", querySelector: (selector) => selectImage(byFlavor, selector) });
  });
  const captures = tabs.map((tab) => {
    const byFlavor = Object.fromEntries(["night", "paper"].map((flavor) => [flavor, makeImage(tab.dataset.appTab, flavor)]));
    images.push(...Object.values(byFlavor));
    const status = {};
    return { dataset: {}, attributes: {}, style: { setProperty() {}, removeProperty() {} },
      querySelector: (selector) => selector === "[data-image-status]" ? status : selectImage(byFlavor, selector),
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; }, status };
  });
  const panels = tabs.map((tab, i) => ({ dataset: { appPanel: tab.dataset.appTab }, hidden: i !== 0, querySelector: (selector) => selector === ".app-showcase__capture" ? captures[i] : captures[i].querySelector(selector) }));
  const html = { dataset: { theme: "living-code-night" } };
  const root = {
    dataset: {},
    querySelectorAll: (selector) => selector === ".app-showcase__capture" ? captures : tabs.filter((tab) => !tab.hidden),
    querySelector(selector) {
      if (selector.includes(":not")) return panels.find((panel) => !panel.hidden);
      const id = selector.match(/="(.*?)"/)[1];
      return (selector.startsWith("[data-app-tab") ? tabs : panels).find((item) => Object.values(item.dataset)[0] === id);
    },
    addEventListener: (type, callback) => events.set(type, callback),
  };
  for (const [key, value] of Object.entries({ document: { documentElement: html }, Element: Tab, MutationObserver: Observer, IntersectionObserver: Observer })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const cleanup = enhanceShowcaseImages(root);
  t.after(cleanup);
  const near = () => observers[2].callback([{ isIntersecting: true }]);
  const select = (index) => { panels.forEach((panel, i) => panel.hidden = i !== index); observers[0].callback(); };
  return { root, images, thumbnails, captures, tabs, events, observers, html, near, select, cleanup };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("loads current-flavor thumbnails and one full capture, never all full previews", async (t) => {
  const f = fixture(t);
  assert.ok([...f.images, ...f.thumbnails].every((image) => !image.calls && !image.src));
  f.near();
  assert.deepEqual(f.images.filter((image) => image.calls).map((image) => `${image.id}/${image.flavor}`), ["a/night"]);
  assert.deepEqual(f.thumbnails.filter((image) => image.calls).map((image) => `${image.id}/${image.flavor}`), ["a/night", "b/night"]);
  assert.equal(f.images[0].fetchPriority, "high");
  assert.equal(f.thumbnails[0].fetchPriority, "low");
  assert.equal(f.images[0].src, "/a-night.webp");
  assert.equal(f.images[0].srcset, "/small.webp 240w, /large.webp 480w");
  assert.equal(f.captures[0].dataset.imageState, "loading");
  f.images[0].resolve();
  await settle();
  assert.equal(f.captures[0].dataset.imageState, "ready");
  f.select(1);
  assert.equal(f.images[2].fetchPriority, "high");
  assert.equal(f.images[2].calls, 1);
});

test("pending personalization cannot activate fallback images, including on hover", (t) => {
  const f = fixture(t);
  f.root.dataset.appPending = "true";
  f.near();
  f.events.get("pointerover")({ target: f.tabs[0] });
  assert.ok([...f.images, ...f.thumbnails].every((image) => !image.calls && !image.src));
  delete f.root.dataset.appPending;
  f.events.get("showcase:ready")();
  assert.equal(f.images[0].calls, 1);
});

test("hover and focus warm the intended full capture but never excluded ports", (t) => {
  const f = fixture(t);
  f.near();
  f.events.get("focusin")({ target: f.tabs[1] });
  assert.equal(f.images[2].calls, 1);
  f.select(1);
  assert.equal(f.images[2].calls, 1, "reuses in-flight decode");
  f.events.get("pointerover")({ target: f.tabs[2] });
  assert.equal(f.images[4].calls, 0);
});

test("theme changes and rapid selections ignore stale completions, failures remain usable, cleanup is safe", async (t) => {
  const f = fixture(t);
  f.near();
  f.html.dataset.theme = "living-code-paper";
  f.observers[1].callback();
  f.images[0].resolve();
  await settle();
  assert.equal(f.captures[0].dataset.imageState, "loading");
  f.select(1);
  f.images[3].reject(new Error("offline"));
  await settle();
  assert.equal(f.captures[1].dataset.imageState, "error");
  assert.match(f.captures[1].status.textContent, /Try another app or flavor/);
  f.cleanup();
  f.images[1].resolve();
  await settle();
  assert.equal(f.captures[0].dataset.imageState, undefined);
  assert.ok(f.observers.every((observer) => observer.disconnected));
});
