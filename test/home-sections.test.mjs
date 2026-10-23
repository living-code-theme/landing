import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import snapshot from "../data/theme.json" with { type: "json" };
import { documentationAnchors, flavors, TEXT_ROLES } from "../src/lib/theme.mjs";
import { ports } from "../src/lib/ports.mjs";
import { shotsOf, short } from "../src/lib/data.mjs";
import { appShowcases } from "../src/scripts/language-preview.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../dist/index.html");
const main = home.match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const section = (id) => main.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?(?=<section[^>]*id="(?!app-panel)|$)`))?.[0];
const APPS = [...home.matchAll(/data-app-tab="([^"]+)"/g)].map((m) => m[1]);

test("the app showcase follows the hero and comes before the palette story", () => {
  const at = main.indexOf('id="in-use"');
  assert.ok(at > main.indexOf('aria-labelledby="hero-title"'));
  assert.ok(at < main.indexOf("data-story-track"));
  assert.match(main, /<h2[^>]*id="in-use-title"[^>]*>See it where<br[^>]*><span[^>]*>you work\./);
});

test("every captured app has a tab, a real screenshot panel and a link to install it", () => {
  const showcase = section("in-use");
  assert.match(showcase, /role="tablist"[^>]*data-app-tabs hidden/, "tabs appear only once script can drive them");
  for (const id of APPS) {
    assert.ok(showcase.includes(`data-app-tab="${id}"`), id);
    const panel = showcase.match(new RegExp(`<section[^>]*id="app-panel-${id}"[^>]*>`))[0];
    assert.doesNotMatch(panel, /\shidden/, `${id}: visible without script`);
    assert.ok(showcase.includes(`href="/ports/${id}/"`), `${id}: install link`);
  }
  assert.ok([...showcase.matchAll(/<img[^>]*alt="[^"]+"/g)].length >= APPS.length);
  assert.doesNotMatch(showcase, /loading="eager"/, "screenshots below the hero never hold up navigation");
});

test("the gallery app selector uses decorative, small responsive screenshot thumbnails", () => {
  const showcase = section("in-use");
  const tabs = showcase.match(/<div[^>]*data-app-tabs[\s\S]*?<\/button>\s*<\/div>/)[0];
  assert.ok(showcase.indexOf("data-app-tabs") < showcase.indexOf("data-app-panel="), "choose an app before its full preview");
  assert.equal([...tabs.matchAll(/class="app-showcase__thumbnail"/g)].length, APPS.length);
  for (const [, button] of tabs.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const fallback = [...button.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)];
    assert.equal(fallback.length, flavors.length);
    const images = [...button.replace(/<noscript>[\s\S]*?<\/noscript>/g, "").matchAll(/<img\b[^>]*>/g)].map(([image]) => image);
    assert.equal(images.length, flavors.length);
    assert.ok(images.every((image) => !/\ssrc(?:set)?=/.test(image)), "unselected fallback images cannot start native lazy requests");
    assert.ok(fallback.every(([, html]) => /\ssrc=/.test(html)), "real images remain available without JavaScript");
    for (const image of images) {
      assert.match(image, /\salt(?:=""|(?=\s|>))/, "thumbnail does not repeat the tab's accessible name");
      assert.match(image, /240w/);
      assert.match(image, /480w/);
      assert.doesNotMatch(image, /(?:640|960|1280|1920|2560)w/, "contact sheet never downloads full-sized captures");
    }
    assert.doesNotMatch(button, /<figure|<figcaption/, "tab contents remain phrasing content");
  }
});

test("the gallery exposes every flavor and labels screenshot fallbacks honestly", () => {
  const showcase = section("in-use");
  assert.match(showcase, /role="group" aria-label="Preview flavor"/);
  for (const f of flavors) {
    assert.match(showcase, new RegExp(`data-set-flavor="${f.id}" aria-pressed="${f.id === "night"}"`));
    assert.match(showcase, new RegExp(`class="app-showcase__swatch" data-theme="${f.slug}" aria-hidden="true"`));
  }
  assert.equal([...showcase.matchAll(/class="bg-keyword"/g)].length, flavors.length, "square chips show each flavor's syntax palette");
  for (const app of APPS) {
    const panel = showcase.match(new RegExp(`<section[^>]*id="app-panel-${app}"[\\s\\S]*?<\\/section>`))[0];
    const shots = shotsOf(app);
    const fallback = shots.find((shot) => shot.f.id === "night") ?? shots[0];
    for (const flavor of flavors) {
      const own = shots.some((shot) => shot.f.id === flavor.id);
      const rendered = panel.match(new RegExp(`<p[^>]*data-only="${flavor.id}"[^>]*>([^<]*)</p>`))?.[1];
      assert.equal(rendered, own ? undefined : `No ${short(flavor)} capture yet, showing ${short(fallback.f)}.`, `${app}: ${flavor.id} capture note`);
    }
  }
});

test("the FAQ sits after the port catalog, at the end of the page content", () => {
  const faq = section("faq");
  assert.ok(faq);
  assert.ok(main.indexOf('id="faq"') > main.indexOf("data-port-results"));
  assert.match(main, /id="faq"[\s\S]*<\/section>\s*$/);
  assert.match(faq, /A few things<br[^>]*><span[^>]*>before you switch\./);
  const heading = faq.match(/<h2\b[^>]*id="faq-title"[^>]*>/)?.[0];
  assert.ok(heading);
  assert.doesNotMatch(heading, /sticky|fixed|(?:\w+:)?top-/, "FAQ heading scrolls normally at every breakpoint");
  const items = [...faq.matchAll(/<details\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(items.length, 5);
  assert.equal([...faq.matchAll(/<summary\b/g)].length, 5);
  assert.equal([...faq.matchAll(/d="M4 10h12"/g)].length, 5, "each disclosure has a horizontal stroke");
  assert.equal([...faq.matchAll(/d="M10 4v12"/g)].length, 5, "a vertical stroke makes the collapsed icon a plus");
  assert.doesNotMatch(faq, /class="arrow\b/, "FAQ disclosures do not use arrow icons");
  for (const tag of items) {
    assert.doesNotMatch(tag, /\sopen(?:\s|=|>)/, "answers are collapsed by default");
    assert.match(tag, /name="faq"/, "native grouping keeps at most one answer open");
  }
});

test("the FAQ's flavor coverage claim matches the port registry", () => {
  const faq = section("faq");
  const partial = ports.filter((p) => p.flavors.length < flavors.length);
  const claim = ports.length === 0 ? "No ports are published yet." : partial.length
    ? `${ports.length - partial.length} of ${ports.length} do.`
    : ports.length === 1 ? "Yes. The published port includes all four." : `All ${ports.length} do.`;
  assert.ok(faq.includes(claim));
  const browserException = partial.length > 0 && partial.every((p) => ["firefox", "chrome"].includes(p.id) && p.flavors.join() === partial[0].flavors.join());
  assert.equal(faq.includes("browser themes ship"), browserException);
  assert.match(faq, /Each port's page lists the flavors it ships\./);
});

test("the FAQ's contrast answer matches the shipped theme audit", () => {
  assert.equal(snapshot.minimumContrast, 4.5);
  assert.ok(section("faq").includes(`${TEXT_ROLES.length} roles in all`));
  for (const f of flavors) for (const role of TEXT_ROLES) assert.ok(f.contrastToBase[f.roles[role]] >= 4.5, `${f.id}.${role}`);
  for (const role of ["lineNumber", "selection", "border"]) assert.ok(!TEXT_ROLES.includes(role), `${role} is not held to 4.5:1`);
});

test("the FAQ's core README links match the exported documentation contract", () => {
  const anchors = new Set(documentationAnchors);
  const links = [...section("faq").matchAll(/living-code-theme\/core#([\w-]+)"/g)].map(([, anchor]) => anchor);
  assert.deepEqual(links.sort(), ["contributing-a-port", "using-the-palette-in-something-else"]);
  for (const anchor of links) assert.ok(anchors.has(anchor), anchor);
});

test("requests and reports go to the organization's issue forms, never the retired monorepo", () => {
  const faq = section("faq");
  assert.ok(faq.includes('href="https://github.com/living-code-theme/core/issues/new?template=port-request.yml"'));
  for (const page of ["index.html", "ports/index.html"]) assert.doesNotMatch(read(`../dist/${page}`), /ElliotLuque\/living-code(?!-)/, page);
});

for (const count of [1, 2, 7]) test(`the app contact sheet supports keyboard and click selection with ${count} captured ports`, (t) => {
  const apps = Array.from({ length: count }, (_, i) => `app-${i}`);
  const handlers = new Map();
  class Element {
    constructor(id) { this.dataset = { appTab: id }; this.attributes = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    closest() { return this; }
    focus() {}
    scrollIntoView() {}
  }
  const candidates = apps.map((id) => new Element(id));
  const panels = apps.map((id) => ({ dataset: { appPanel: id }, setAttribute() {} }));
  const list = { hidden: true, querySelectorAll: () => candidates, addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: (type) => handlers.delete(type) };
  const root = { querySelector: () => list, querySelectorAll: () => panels };
  for (const [key, value] of Object.entries({ Element, document: { querySelectorAll: () => [root] } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const cleanup = appShowcases();
  const tabs = candidates.filter((tab) => !tab.hidden);
  assert.equal(tabs.length, Math.min(5, count));
  const key = (tab, k) => handlers.get("keydown")({ target: tab, key: k, preventDefault() {} });
  const shown = () => tabs.findIndex((tab) => tab.dataset.appTab === panels.find((p) => !p.hidden)?.dataset.appPanel);
  assert.equal(list.hidden, false);
  assert.equal(shown(), 0);
  key(tabs[0], "ArrowDown");
  assert.equal(shown(), 1 % tabs.length);
  key(tabs[1 % tabs.length], "ArrowUp");
  assert.equal(shown(), 0);
  key(tabs[0], "ArrowUp");
  assert.equal(shown(), tabs.length - 1, "wraps around");
  key(tabs.at(-1), "ArrowRight");
  assert.equal(shown(), 0);
  key(tabs[0], "End");
  assert.equal(shown(), tabs.length - 1);
  key(tabs.at(-1), "Home");
  assert.equal(shown(), 0);
  key(tabs[0], "ArrowLeft");
  assert.equal(shown(), tabs.length - 1);
  const selected = Math.min(2, tabs.length - 1);
  handlers.get("click")({ target: tabs[selected] });
  assert.equal(shown(), selected);
  assert.equal(tabs[selected].attributes["aria-selected"], "true");
  assert.equal(tabs[selected].tabIndex, 0);
  assert.ok(tabs.filter((_, i) => i !== selected).every((tab) => tab.tabIndex === -1));
  cleanup();
  assert.equal(handlers.size, 0);
});
