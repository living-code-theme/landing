import assert from "node:assert/strict";
import test from "node:test";
import { interruptOnScroll, prepareFlavorTransition, preparePortTransition, prepareScreenshots } from "../src/scripts/transitions.ts";

function portPage(ids, { title = false, catalog = false } = {}) {
  const names = ids.map((portName) => ({ dataset: { portName }, style: {} }));
  const attributes = new Set();
  return {
    names, attributes,
    documentElement: { toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key) },
    querySelector: (selector) => selector === "h1 [data-port-name]" ? (title ? names[0] : null) : (catalog ? {} : null),
    querySelectorAll: () => names,
  };
}

test("only the selected port gets a shared snapshot on opening and returning", () => {
  const catalog = portPage(["neovim", "vscode", "kitty"], { catalog: true });
  const detail = portPage(["vscode"], { title: true });
  preparePortTransition(catalog, detail);
  assert.deepEqual(catalog.names.map((name) => name.style.viewTransitionName), ["none", "port-vscode", "none"]);
  assert.equal(detail.names[0].style.viewTransitionName, "port-vscode");
  assert.equal(detail.attributes.has("data-port-return-transition"), false);

  preparePortTransition(detail, catalog);
  assert.deepEqual(catalog.names.map((name) => name.style.viewTransitionName), ["none", "port-vscode", "none"]);
  assert.equal(catalog.attributes.has("data-port-return-transition"), true, "the catalog's root must not slide on return");

  const nextDetail = portPage(["kitty"], { title: true });
  preparePortTransition(catalog, nextDetail);
  assert.deepEqual(catalog.names.map((name) => name.style.viewTransitionName), ["none", "none", "port-kitty"]);
  assert.equal(catalog.attributes.has("data-port-return-transition"), false, "return state does not leak to the next navigation");
});

test("catalog-to-catalog and detail-to-detail navigation do not animate unrelated names", () => {
  for (const options of [{ catalog: true }, { title: true }]) {
    const current = portPage(["neovim"], options);
    const incoming = portPage(["kitty"], options);
    preparePortTransition(current, incoming);
    assert.equal(current.names[0].style.viewTransitionName, "none");
    assert.equal(incoming.names[0].style.viewTransitionName, "none");
    assert.equal(incoming.attributes.has("data-port-return-transition"), false);
  }
});

function flavorPage(flavor, home = false) {
  const titles = (home ? ["night", "frost", "paper", "signal"] : [flavor]).map((flavorTitle) => ({ dataset: { flavorTitle }, style: {} }));
  const attributes = new Set();
  return {
    titles, attributes,
    documentElement: { dataset: { flavorPage: flavor }, toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key) },
    querySelector: () => home ? {} : null,
    querySelectorAll: () => titles,
  };
}

test("flavor transitions share only the matching title and leave the restored home viewport still", () => {
  const home = flavorPage(undefined, true);
  const detail = flavorPage("frost");
  prepareFlavorTransition(home, detail);
  assert.deepEqual(home.titles.map((title) => title.style.viewTransitionName), ["none", "flavor-frost", "none", "none"]);
  assert.equal(detail.titles[0].style.viewTransitionName, "flavor-frost");
  assert.equal(home.attributes.has("data-flavor-return-transition"), false);
  prepareFlavorTransition(detail, home);
  assert.equal(home.attributes.has("data-flavor-return-transition"), true);
  prepareFlavorTransition(home, flavorPage("paper"));
  assert.equal(home.attributes.has("data-flavor-return-transition"), false, "return styling does not leak into later navigation");
});

test("switching between flavor detail pages does not animate unrelated titles", () => {
  const night = flavorPage("night"), paper = flavorPage("paper");
  prepareFlavorTransition(night, paper);
  assert.equal(night.titles[0].style.viewTransitionName, "none");
  assert.equal(paper.titles[0].style.viewTransitionName, "none");
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

function browser(t) {
  const events = new EventTarget();
  const globals = {
    addEventListener: events.addEventListener.bind(events),
    scrollX: 0,
    scrollY: 0,
    Element: class extends EventTarget { closest() { return null; } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const update = deferred(), finished = deferred(), ready = deferred();
  let skips = 0;
  interruptOnScroll({
    updateCallbackDone: update.promise,
    finished: finished.promise,
    ready: ready.promise,
    skipTransition: () => skips++,
  });
  return { events, update, finished, ready, skips: () => skips };
}

test("scroll restoration does not interrupt, but subsequent scrolling does", async (t) => {
  const b = browser(t);
  globalThis.scrollY = 9000;
  b.events.dispatchEvent(new Event("scroll"));
  b.update.resolve();
  await Promise.resolve();
  b.events.dispatchEvent(new Event("scroll"));
  assert.equal(b.skips(), 0);
  globalThis.scrollY += 100;
  b.events.dispatchEvent(new Event("scroll"));
  assert.equal(b.skips(), 1);
  b.finished.resolve();
  await Promise.resolve();
  b.events.dispatchEvent(new Event("wheel"));
  assert.equal(b.skips(), 1, "listeners are removed when the transition finishes");
});

test("an intentionally skipped transition does not leave an unhandled ready rejection", async (t) => {
  const b = browser(t);
  b.ready.reject(new DOMException("Transition was skipped", "AbortError"));
  b.update.resolve();
  b.finished.resolve();
  await new Promise((resolve) => setImmediate(resolve));
});

test("wheel, touch and scrolling keys interrupt without blocking the user's input", (t) => {
  const b = browser(t);
  for (const type of ["wheel", "touchmove"]) {
    const event = new Event(type, { cancelable: true });
    b.events.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  b.events.dispatchEvent(Object.assign(new Event("keydown"), { key: "PageDown" }));
  assert.equal(b.skips(), 3);
  b.events.dispatchEvent(Object.assign(new Event("keydown"), { key: "k", ctrlKey: true }));
  assert.equal(b.skips(), 3, "unrelated keyboard shortcuts are left alone");
  b.finished.resolve();
});

test("only the incoming flavor's eager screenshot is decoded, and decoding is awaited", async (t) => {
  const ready = deferred();
  const loaded = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  globalThis.Image = class {
    decode() { loaded.push(this); return ready.promise; }
  };
  t.after(() => original ? Object.defineProperty(globalThis, "Image", original) : delete globalThis.Image);
  const image = (flavor) => ({
    dataset: { only: flavor }, sizes: "100vw", loading: "lazy",
    getAttribute: (name) => name === "src" ? `/${flavor}.webp` : `/${flavor}-640.webp 640w, /${flavor}.webp 1280w`,
  });
  const night = image("night"), paper = image("paper");
  let completed = false;
  const preparing = prepareScreenshots({
    documentElement: { dataset: { theme: "living-code-paper" } },
    querySelectorAll: () => [night, paper],
  }).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].src, "/paper.webp");
  assert.equal(loaded[0].sizes, paper.sizes);
  assert.equal(loaded[0].srcset, paper.getAttribute("srcset"));
  assert.equal(paper.loading, "eager");
  assert.equal(night.loading, "lazy");
  ready.resolve();
  await preparing;
  assert.equal(completed, true);
});

test("a broken screenshot does not prevent navigation", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  globalThis.Image = class { decode() { return Promise.reject(new Error("missing image")); } };
  t.after(() => original ? Object.defineProperty(globalThis, "Image", original) : delete globalThis.Image);
  await prepareScreenshots({
    documentElement: { dataset: { theme: "living-code-night" } },
    querySelectorAll: () => [{ dataset: {}, sizes: "100vw", getAttribute: () => "/missing.webp" }],
  });
});
