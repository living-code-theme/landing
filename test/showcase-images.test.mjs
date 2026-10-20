import assert from "node:assert/strict";
import test from "node:test";
import { enhanceShowcaseImages } from "../src/scripts/showcase-images.ts";

function fixture(t, saveData = false) {
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  class Tab { closest() { return this; } }
  const events = new Map();
  const tabs = ["a", "b", "excluded"].map((id) => Object.assign(new Tab(), { dataset: { appTab: id }, hidden: id === "excluded", querySelector: () => ({ currentSrc: `/thumb-${id}.webp` }) }));
  const images = [];
  const captures = tabs.map((tab) => {
    const byFlavor = Object.fromEntries(["night", "paper"].map((flavor) => {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const image = { id: tab.dataset.appTab, flavor, calls: 0, decode() { this.calls++; return promise; }, resolve, reject };
      images.push(image);
      return [flavor, image];
    }));
    const status = {};
    return { dataset: {}, attributes: {}, style: { setProperty() {}, removeProperty() {} },
      querySelector: (selector) => selector === "[data-image-status]" ? status : byFlavor[selector.match(/data-only="(.*?)"/)[1]],
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; }, status };
  });
  const panels = tabs.map((tab, i) => ({ dataset: { appPanel: tab.dataset.appTab }, hidden: i !== 0, querySelector: (selector) => selector === ".app-showcase__capture" ? captures[i] : captures[i].querySelector(selector) }));
  const html = { dataset: { theme: "living-code-night" } };
  const root = {
    querySelectorAll: (selector) => selector === ".app-showcase__capture" ? captures : tabs.filter((tab) => !tab.hidden),
    querySelector(selector) {
      if (selector.includes(":not")) return panels.find((panel) => !panel.hidden);
      const id = selector.match(/="(.*?)"/)[1];
      return (selector.startsWith("[data-app-tab") ? tabs : panels).find((item) => Object.values(item.dataset)[0] === id);
    },
    addEventListener: (type, callback) => events.set(type, callback),
  };
  for (const [key, value] of Object.entries({ document: { documentElement: html }, navigator: { connection: { saveData } }, Element: Tab, MutationObserver: Observer, IntersectionObserver: Observer })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const cleanup = enhanceShowcaseImages(root);
  t.after(cleanup);
  const near = () => observers[2].callback([{ isIntersecting: true }]);
  const select = (index) => { panels.forEach((panel, i) => panel.hidden = i !== index); observers[0].callback(); };
  return { images, captures, tabs, events, observers, html, near, select, cleanup };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("warms only exposed ports in the current flavor near the gallery, prioritizing selection", async (t) => {
  const f = fixture(t);
  assert.ok(f.images.every((image) => !image.calls), "does not compete with initial page loading");
  f.near();
  assert.deepEqual(f.images.filter((image) => image.calls).map((image) => `${image.id}/${image.flavor}`), ["a/night", "b/night"]);
  assert.equal(f.images[0].fetchPriority, "high");
  assert.equal(f.images[2].fetchPriority, "low");
  assert.equal(f.captures[0].dataset.imageState, "loading");
  f.images[0].resolve();
  await settle();
  assert.equal(f.captures[0].dataset.imageState, "ready");
  assert.equal(f.captures[0].attributes["aria-busy"], "false");
  f.select(1);
  assert.equal(f.images[2].fetchPriority, "high");
  assert.equal(f.images[2].calls, 1, "reuses in-flight decode");
});

test("data saving skips speculative requests but hover and focus still warm the intended port", (t) => {
  const f = fixture(t, true);
  f.near();
  assert.equal(f.images.filter((image) => image.calls).length, 1);
  f.events.get("focusin")({ target: f.tabs[1] });
  assert.equal(f.images[2].calls, 1);
  f.events.get("pointerover")({ target: f.tabs[2] });
  assert.equal(f.images[4].calls, 0, "excluded ports never load speculatively");
});

test("theme changes and rapid selections ignore stale completions, failures remain usable, cleanup is safe", async (t) => {
  const f = fixture(t);
  f.near();
  f.html.dataset.theme = "living-code-paper";
  f.observers[1].callback();
  f.images[0].resolve();
  await settle();
  assert.equal(f.captures[0].dataset.imageState, "loading", "old flavor cannot reveal the new image");
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
