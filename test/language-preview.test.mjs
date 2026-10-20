import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { highlight } from "../src/lib/highlight.mjs";
import { PREVIEWS, previewLines } from "../src/lib/language-preview.mjs";
import { languagePreviews } from "../src/scripts/language-preview.ts";
import { flavors } from "../src/lib/theme.mjs";

const plain = (html) => html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("every preview preserves its source, including blank lines and the final CSS rule", () => {
  assert.deepEqual(PREVIEWS.map((sample) => sample.label), ["TypeScript", "Python", "Rust", "HTML / CSS", "Diff"]);
  for (const sample of PREVIEWS) {
    const lines = previewLines(sample);
    assert.equal(lines.length, sample.source.split("\n").length, sample.id);
    assert.equal(lines.map((line) => plain(line.html).trimEnd()).join("\n"), sample.source, sample.id);
  }
  const css = previewLines(PREVIEWS.find((sample) => sample.id === "html-css")).at(-1).html;
  assert.match(css, /class="t-type">\.workspace/);
  assert.match(css, /class="t-function">var/);
});

test("Python and Rust use semantic roles and escape markup instead of shipping a runtime grammar", () => {
  for (const [lang, src, keyword, type, func, constant] of [
    ["python", 'def choose(light: bool) -> str:\n    return "<night>" if light else False # calm', "def", "bool", "choose", "False"],
    ["rust", 'fn choose(light: bool) -> String { let active = false; "<night>".to_string() } // calm', "fn", "String", "choose", "false"],
  ]) {
    const html = highlight(src, lang);
    assert.equal(plain(html), src);
    for (const [role, token] of [["keyword", keyword], ["type", type], ["function", func], ["constant", constant]]) {
      assert.ok(html.includes(`<span class="t-${role}">${token}</span>`), `${lang}: ${role}`);
    }
    assert.match(html, /class="t-string">&quot;&lt;night&gt;&quot;/);
    assert.match(html, /class="t-comment">/);
    assert.doesNotMatch(html, /<night>/);
  }
  assert.match(highlight("@dataclass\nclass Theme:", "python"), /class="t-decorator">@dataclass/);
});

test("diff lines have explicit plus/minus signs as well as semantic colors", () => {
  const lines = previewLines(PREVIEWS.find((sample) => sample.id === "diff"));
  assert.equal(lines.filter((line) => line.kind === "added").length, 3);
  assert.equal(lines.filter((line) => line.kind === "removed").length, 3);
  for (const line of lines.filter((line) => ["added", "removed"].includes(line.kind))) {
    assert.ok(line.html.startsWith(line.kind === "added" ? "+" : "-"));
  }
  assert.equal(lines.filter((line) => line.kind === "meta").length, 4);
});

function previewDom(t) {
  class Element {
    constructor(id) { this.dataset = { languageTab: id }; this.attributes = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    closest() { return this; }
    focus() { this.focused = true; }
    scrollIntoView() { this.scrolled = true; }
  }
  const tabs = PREVIEWS.map((sample) => new Element(sample.id));
  const panels = PREVIEWS.map((sample) => ({ dataset: { languagePanel: sample.id }, attributes: {}, setAttribute: Element.prototype.setAttribute }));
  const handlers = new Map();
  const list = {
    hidden: true,
    querySelectorAll: () => tabs,
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type, fn) => { if (handlers.get(type) === fn) handlers.delete(type); },
  };
  const preview = { querySelector: () => list, querySelectorAll: () => panels };
  for (const [key, value] of Object.entries({ Element, document: { querySelectorAll: () => [preview] } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const send = (type, target, key) => {
    let prevented = false;
    handlers.get(type)?.({ target, key, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { tabs, panels, list, handlers, send };
}

test("language tabs enhance static samples with one active panel and roving focus", (t) => {
  const { tabs, panels, list, send, handlers } = previewDom(t);
  const cleanup = languagePreviews();
  const selected = (index) => {
    assert.deepEqual(tabs.map((tab) => tab.attributes["aria-selected"]), tabs.map((_, i) => String(i === index)));
    assert.deepEqual(tabs.map((tab) => tab.tabIndex), tabs.map((_, i) => i === index ? 0 : -1));
    assert.deepEqual(panels.map((panel) => panel.hidden), panels.map((_, i) => i !== index));
  };
  assert.equal(list.hidden, false);
  selected(0);
  panels.forEach((panel, i) => {
    assert.equal(panel.attributes.role, "tabpanel");
    assert.equal(panel.attributes["aria-labelledby"], `language-tab-${PREVIEWS[i].id}`);
  });
  send("click", tabs[1]);
  selected(1);
  assert.equal(send("keydown", tabs[1], "ArrowRight"), true);
  selected(2);
  assert.equal(tabs[2].focused, true);
  assert.equal(tabs[2].scrolled, true);
  send("keydown", tabs[2], "End");
  selected(4);
  send("keydown", tabs[4], "ArrowRight");
  selected(0);
  send("keydown", tabs[0], "ArrowLeft");
  selected(4);
  send("keydown", tabs[4], "Home");
  selected(0);
  assert.equal(send("keydown", tabs[0], "Tab"), false);
  cleanup();
  assert.equal(handlers.size, 0, "Astro page swaps remove listeners");
  const nextCleanup = languagePreviews();
  selected(0);
  assert.equal(handlers.size, 2, "returning to the page initializes one pair of listeners");
  nextCleanup();
});

test("each flavor page includes the preview after its color rings, with a no-script fallback", () => {
  const home = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(home, /data-language-preview|Read it in your language\./, "the preview is not on the homepage");
  for (const flavor of flavors) {
    const html = readFileSync(new URL(`../dist/flavors/${flavor.id}/index.html`, import.meta.url), "utf8");
    const section = html.slice(html.indexOf('aria-labelledby="language-preview-title"'), html.indexOf('aria-labelledby="ramp-title"'));
    assert.match(section, /Read it in your language\./);
    assert.ok(html.indexOf('data-language-preview') > html.indexOf(`data-glyph="wheel:${flavor.id}"`), "preview follows the flavor's color rings");
    assert.match(section, new RegExp(`data-flavor-name[^>]*>${flavor.name.replace("Living Code ", "")}<`), "correct flavor before JavaScript runs");
    assert.match(section, /data-language-tabs hidden/);
    assert.equal([...section.matchAll(/data-language-tab="/g)].length, PREVIEWS.length);
    assert.equal([...section.matchAll(/data-language-panel="/g)].length, PREVIEWS.length);
    for (const sample of PREVIEWS) {
      assert.ok(section.includes(`aria-controls="language-panel-${sample.id}"`));
      const panel = section.match(new RegExp(`<section[^>]*id="language-panel-${sample.id}"[^>]*>`))[0];
      assert.doesNotMatch(panel, /\shidden|data-theme=/, "samples are visible without script and inherit the page's flavor");
    }
  }
});

test("the chosen language survives navigation to another flavor page", (t) => {
  const { tabs, panels, send } = previewDom(t);
  const cleanup = languagePreviews();
  send("click", tabs[2]);
  cleanup();
  const nextCleanup = languagePreviews();
  assert.equal(tabs[2].attributes["aria-selected"], "true");
  assert.equal(panels[2].hidden, false);
  assert.equal(panels.filter((panel) => !panel.hidden).length, 1);
  nextCleanup();
});
