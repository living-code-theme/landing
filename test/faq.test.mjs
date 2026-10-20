import assert from "node:assert/strict";
import test from "node:test";
import { faqAccordions } from "../src/scripts/faq.ts";

function setup(t, reduced = false) {
  const preference = { matches: reduced, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } };
  const animation = () => ({ cancel() { this.cancelled = true; }, onfinish: null });
  const items = Array.from({ length: 2 }, () => {
    const attributes = new Map([["name", "faq"]]);
    const summary = {
      attributes: new Map(), listeners: new Map(),
      getBoundingClientRect: () => ({ height: 76 }),
      setAttribute(key, value) { this.attributes.set(key, value); },
      removeAttribute(key) { this.attributes.delete(key); },
      addEventListener(type, fn) { this.listeners.set(type, fn); },
      removeEventListener(type) { this.listeners.delete(type); },
    };
    const answer = { getBoundingClientRect: () => ({ height: 120 }), animate: () => animation() };
    return {
      open: false, attributes, summary, answer, style: { overflow: "" }, motions: [],
      getAttribute: (key) => attributes.get(key) ?? null,
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: (key) => attributes.delete(key),
      toggleAttribute: (key, on) => on ? attributes.set(key, "") : attributes.delete(key),
      querySelector: (selector) => selector === "summary" ? summary : answer,
      getBoundingClientRect() { return { height: this.open ? 197 : 77 }; },
      animate(frames, options) { const motion = Object.assign(animation(), { frames, options }); this.motions.push(motion); return motion; },
    };
  });
  for (const [key, value] of Object.entries({
    matchMedia: () => preference,
    document: { querySelectorAll: () => items },
    getComputedStyle: () => ({ opacity: "1", borderTopWidth: "0", borderBottomWidth: "1" }),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const cleanup = faqAccordions();
  const click = (item) => item.summary.listeners.get("click")({ preventDefault() {} });
  return { items, preference, cleanup, click };
}

test("FAQ animates measured heights, retaining native open until the closing animation finishes", (t) => {
  const { items: [item], click, cleanup } = setup(t);
  assert.equal(item.getAttribute("name"), null, "enhancement coordinates sibling exits");
  click(item);
  assert.equal(item.open, true);
  assert.equal(item.summary.attributes.get("aria-expanded"), "true");
  assert.deepEqual(item.motions[0].frames, [{ height: "77px" }, { height: "197px" }]);
  assert.equal(item.motions[0].options.duration, 420);
  item.motions[0].onfinish();
  assert.equal(item.style.overflow, "");
  click(item);
  assert.equal(item.open, true, "answer remains rendered for its exit");
  assert.equal(item.summary.attributes.get("aria-expanded"), "false");
  assert.ok(item.attributes.has("data-closing"));
  assert.equal(item.motions[1].options.duration, 300);
  item.motions[1].onfinish();
  assert.equal(item.open, false);
  assert.equal(item.attributes.has("data-closing"), false);
  cleanup();
  assert.equal(item.getAttribute("name"), "faq");
  assert.equal(item.summary.listeners.size, 0);
});

test("FAQ sibling changes and rapid reversal cancel in-flight animations", (t) => {
  const { items: [first, second], click, cleanup } = setup(t);
  click(first);
  const entrance = first.motions[0];
  click(second);
  assert.equal(entrance.cancelled, true);
  assert.equal(first.open, true, "first item exits while second enters");
  assert.equal(first.summary.attributes.get("aria-expanded"), "false");
  assert.equal(second.summary.attributes.get("aria-expanded"), "true");
  const exit = first.motions[1];
  click(first);
  assert.equal(exit.cancelled, true);
  first.motions.at(-1).onfinish();
  second.motions.at(-1).onfinish();
  assert.equal(first.open, true);
  assert.equal(second.open, false);
  cleanup();
});

test("reduced motion settles immediately, including a preference change during an animation", (t) => {
  const { items: [item], preference, click, cleanup } = setup(t, true);
  click(item);
  assert.equal(item.open, true);
  assert.equal(item.motions.length, 0);
  click(item);
  assert.equal(item.open, false);
  preference.matches = false;
  click(item);
  preference.matches = true;
  preference.listeners.forEach((fn) => fn());
  assert.equal(item.open, true);
  assert.equal(item.motions[0].cancelled, true);
  assert.equal(item.style.overflow, "");
  cleanup();
  assert.equal(preference.listeners.size, 0);
});
