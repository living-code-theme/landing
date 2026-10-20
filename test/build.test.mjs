// Checks the built site in dist/ (run `pnpm build` first) against the palette and the port registry.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { flavors } from "../src/lib/theme.mjs";
import { ports } from "../src/lib/ports.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const page = (path) => readFileSync(join(dist, path, "index.html"), "utf8");
const main = (html) => html.match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pages = [];
const walk = (dir) => {
  for (const entry of readdirSync(join(dist, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name));
    else if (entry.name.endsWith(".html")) pages.push(join(dir, entry.name));
  }
};
walk("");

test("every port has a page with its name and every install command", () => {
  for (const p of ports) {
    const html = main(page(`ports/${p.id}`));
    assert.match(html, new RegExp(`<h1[^>]*>[\\s\\S]*?${escape(p.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), p.id);
    for (const [, code] of (p.readme ?? p.install).matchAll(/```\w*\n([\s\S]*?)\n```/g)) {
      assert.ok(html.includes(`data-copy="${escape(code)}"`), `copy text for ${p.id}`);
    }
  }
});

test("port pages omit file excerpts while retaining installation", () => {
  for (const p of ports) {
    const html = main(page(`ports/${p.id}`));
    assert.doesNotMatch(html, /The first 20 lines|class="ln"|class="ln__n"/, p.id);
    assert.match(html, /id="install-h"/, `${p.id}: installation remains available`);
    if (html.includes("data-shot")) {
      const install = html.match(/<section[^>]*aria-labelledby="install-h"[\s\S]*?<\/section>/)[0];
      assert.ok(html.indexOf("data-shot") > html.indexOf(install) + install.length, `${p.id}: screenshot follows all install steps`);
      assert.doesNotMatch(html, /data-shot-eager/, `${p.id}: below-install screenshots do not block navigation`);
    }
  }
});

test("the home page and the port index link every port", () => {
  for (const path of ["", "ports"]) {
    const html = main(page(path));
    for (const p of ports) assert.ok(html.includes(`href="/ports/${p.id}/"`), `${path || "home"} links ${p.id}`);
  }
  assert.match(page(""), new RegExp(`${ports.length} ports\\.`));
});

test("both port catalogs separate sticky search from responsive result grids", () => {
  for (const path of ["", "ports"]) {
    const html = main(page(path));
    const toolbar = html.match(/<div[^>]*data-port-toolbar[\s\S]*?<\/div>/)?.[0];
    assert.ok(toolbar, `${path || "home"}: catalog search toolbar`);
    assert.match(toolbar, /<label[^>]*for="port-filter"/);
    assert.match(toolbar, /id="port-filter"[^>]*type="search"/);
    assert.match(toolbar, /data-port-count[^>]*aria-live="polite"/);
    assert.doesNotMatch(toolbar, /data-reveal|data-rise/, "sticky search must not be inside an entrance animation");
    assert.ok(html.indexOf("data-port-results") > html.indexOf("data-port-toolbar"), "results follow the search sidebar in reading order");
    assert.ok(html.indexOf("data-port-group ") > html.indexOf("data-port-results"), "categories live in the results column");
    const groups = [...html.matchAll(/data-port-group\s/g)].length;
    assert.ok(groups > 0);
    assert.equal([...html.matchAll(/class="port-result-grid"/g)].length, groups, "each category has its own responsive results grid");
    assert.equal([...html.matchAll(/data-port-group-count/g)].length, groups, "every group exposes its filtered count");
  }
});

test("the home page removes the Apps and Install sections and offers installation before the animation", () => {
  const html = page("");
  const content = main(html);
  assert.doesNotMatch(html, /aria-labelledby="(?:apps|install)-title"|href="(?:\/)?#(?:apps|install)"|data-install-tab/);
  const action = content.indexOf("data-port-finder-open");
  assert.ok(action >= 0 && action < content.indexOf('data-glyph="chameleon"'), "the install shortcut comes before the hero art");
  assert.ok(action < content.indexOf("data-story-track"), "installation never needs the palette story");
});

test("the header brand targets the homepage hero without forcing a reload", () => {
  assert.match(main(page("")), /<section[^>]*id="hero"[^>]*aria-labelledby="hero-title"/);
  for (const path of pages) {
    const header = readFileSync(join(dist, path), "utf8").match(/<header[\s\S]*?<\/header>/)[0];
    const brand = header.match(/<a[^>]*aria-label="Living Code, home"[^>]*>/)?.[0];
    assert.match(brand, /href="\/#hero"/, path);
    assert.doesNotMatch(brand, /data-astro-reload/, `${path}: same-page anchor navigation`);
  }
});

test("the home page credits the creator in the hero, not only the footer", () => {
  const hero = main(page("")).match(/<section[^>]*aria-labelledby="hero-title"[\s\S]*?<\/section>/)[0];
  assert.match(hero, /Made by <a[^>]*href="https:\/\/elliotluque\.com"[^>]*>ElliotLuque/);
  assert.ok(hero.indexOf("Made by") < hero.indexOf('data-glyph="chameleon"'), "the credit comes before the hero art");
});

test("every page has an immediately available finder with direct port links and a no-script fallback", () => {
  for (const path of pages) {
    const html = readFileSync(join(dist, path), "utf8");
    const header = html.match(/<header[\s\S]*?<\/header>/)[0];
    assert.match(header, /href="\/ports\/#port-filter" data-port-finder-open aria-haspopup="dialog" aria-controls="port-finder" data-astro-reload/, path);
    assert.doesNotMatch(header, /head-hidden|\/#apps|\/#install/, `${path}: lookup stays accessible while scrolling`);
    const finder = html.match(/<dialog[^>]*id="port-finder"[\s\S]*?<\/dialog>/)?.[0];
    assert.ok(finder, path);
    assert.match(finder, /aria-labelledby="port-finder-title" aria-describedby="port-finder-help"/, path);
    assert.match(finder, /id="port-finder-input"[^>]*data-port-filter[^>]*autofocus/, path);
    assert.doesNotMatch(finder, /data-reveal|data-rise/, `${path}: no delayed results`);
    assert.doesNotMatch(finder, /<details|<summary|data-copy=/, `${path}: results navigate instead of expanding installation steps`);
    for (const p of ports) {
      assert.ok(finder.includes(`href="/ports/${p.id}/"`), `${path}: direct link to ${p.id}`);
    }
  }
});

test("the finder exposes a labelled combobox and selectable options for assistive technology", () => {
  const finder = page("").match(/<dialog[^>]*id="port-finder"[\s\S]*?<\/dialog>/)[0];
  assert.match(finder, /id="port-finder-input"[^>]*role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="port-finder-results" aria-describedby="port-finder-keys"/);
  assert.match(finder, /id="port-finder-results" role="listbox" aria-label="Available ports"/);
  assert.match(finder, /id="port-finder-keys"/);
  assert.match(finder, /class="port-finder__results[^"]*" tabindex="-1"/, "the scroll container does not introduce an extra tab stop");
  assert.equal([...finder.matchAll(/role="option"/g)].length, ports.length);
  for (const p of ports) {
    assert.ok(finder.includes(`id="finder-port-${p.id}" role="option" aria-selected="false" tabindex="-1"`), `${p.id}: named selection target, outside the tab order`);
  }
});

test("each flavor page is shown in its own flavor", () => {
  for (const f of flavors) {
    const html = page(`flavors/${f.id}`);
    assert.match(html, new RegExp(`<html lang="en" data-theme="${f.slug}" data-flavor-page="${f.id}">`));
    assert.ok(html.includes(f.colors.base.css), `${f.id} lists its ground`);
    assert.match(html, /href="\/#flavors" data-flavor-return/, `${f.id}: explicit return restores the previous homepage viewport`);
    assert.ok(html.includes(`data-flavor-title="${f.id}"`), `${f.id}: shared title is identified independently of the page animation`);
    assert.match(html, /aria-labelledby="language-preview-title"/, `${f.id} has the language-switchable preview`);
  }
});

test("every footer mark uses the same main teal regardless of page flavor", () => {
  const teal = flavors.find((f) => f.id === "night").colors.teal.hex;
  for (const path of pages) {
    const footer = readFileSync(join(dist, path), "utf8").match(/<footer[\s\S]*?<\/footer>/)[0];
    const mark = footer.match(/<div[^>]*data-glyph="mark"[^>]*>/)?.[0];
    assert.ok(mark?.includes(`style="color: ${teal}"`), `${path}: fixed teal fallback`);
    assert.doesNotMatch(footer, /text-surface-1/, `${path}: fallback inherits the fixed teal`);
    assert.doesNotMatch(footer, /id="(?:your-workspace|workspace-title)"/, `${path}: the workspace pitch has been removed`);
  }
});

test("the flavor data the scripts read matches the palette", () => {
  const data = JSON.parse(page("").match(/<script type="application\/json" id="flavor-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(Object.keys(data), flavors.map((f) => f.id));
  for (const f of flavors) {
    assert.equal(data[f.id].base, f.c("base"));
    assert.equal(data[f.id].roles.string, f.colors[f.roles.string].hex);
  }
});

test("every local link and asset resolves to a built file", () => {
  for (const path of pages) {
    const html = readFileSync(join(dist, path), "utf8");
    for (const [, ref] of html.matchAll(/(?:href|src|srcset)="(\/[^"#?\s,]*)/g)) {
      const file = join(dist, ref);
      assert.ok(existsSync(ref.endsWith("/") ? join(file, "index.html") : file), `${path}: ${ref}`);
    }
  }
});

test("copy follows the repo's writing rules and the mark is [lc]", () => {
  const source = fileURLToPath(new URL("../src/", import.meta.url));
  for (const file of readdirSync(source, { recursive: true }).filter((f) => f.endsWith(".astro"))) {
    const template = readFileSync(join(source, file), "utf8");
    assert.doesNotMatch(template, /—/, `${file}: house copy has no em dashes; port READMEs keep their own writing style`);
    assert.doesNotMatch(template, /\[el\]/, `${file}: the mark is [lc]`);
  }
  for (const path of pages) {
    const html = readFileSync(join(dist, path), "utf8");
    assert.match(html, /<meta name="description" content="[^"]{40,}">/, `${path}: description`);
  }
  assert.match(readFileSync(join(dist, "favicon.svg"), "utf8"), /<title id="title">Living Code Night: \[lc\]<\/title>/);
});

test("every page advertises the SVG favicon, raster fallbacks and touch icon", () => {
  for (const path of pages) {
    const html = readFileSync(join(dist, path), "utf8");
    assert.match(html, /rel="icon" href="\/favicon\.ico" sizes="16x16 32x32 48x48"/, path);
    assert.match(html, /rel="icon" href="\/favicon-32\.png" type="image\/png" sizes="32x32"/, path);
    assert.match(html, /rel="icon" href="\/favicon\.svg" type="image\/svg\+xml" sizes="any"/, path);
    assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/, path);
  }
});

test("every page has the living field, and each page's anchors name shapes it can draw", () => {
  const shapes = /^(mark|chameleon|wheel(:(night|frost|paper|signal))?|port-spiral|story:[1-4]|icon:[\w-]+|text:.+)$/;
  for (const path of pages) {
    const html = readFileSync(join(dist, path), "utf8");
    assert.match(html, /<canvas[^>]*data-living-field/, path);
    for (const [, shape] of html.matchAll(/data-glyph="([^"]*)"/g)) assert.match(shape, shapes, `${path}: ${shape}`);
  }
  const home = page("");
  for (const shape of ["chameleon", "story:4", "wheel", "port-spiral"]) assert.ok(home.includes(`data-glyph="${shape}"`), shape);
  for (const f of flavors) assert.ok(page(`flavors/${f.id}`).includes(`data-glyph="wheel:${f.id}"`), f.id);
  // The editor in the palette story is text you can read and select, not glyphs.
  assert.match(home, /data-story[^>]*>[\s\S]*?<pre[^>]*><code><span class="ln" style="--n:0">/);
});

test("the palette story has four steps ending in Signals, a stop and camera shot for each, and the travel to scroll them", async () => {
  const { FLIGHT, PACE, SHOTS, TOKENS, travel } = await import("../src/lib/story.mjs");
  const home = page("");
  const track = home.match(/<div data-story-track data-hold="([\d.]+)" data-pass="([\d.]+)" data-shots="([^"]+)" data-flight="([^"]+)" style="--travel:([\d.]+)"/);
  assert.ok(track, "track");
  const json = (s) => JSON.parse(s.replace(/&quot;/g, '"'));
  assert.deepEqual([track[1], track[2], track[5]].map(Number), [PACE.hold, PACE.pass, travel()]);
  assert.deepEqual(json(track[3]), SHOTS);
  assert.deepEqual(json(track[4]), FLIGHT);
  assert.equal(TOKENS.length, 4);
  assert.deepEqual(TOKENS[2].roles, ["string", "number", "constant"]);
  assert.deepEqual(TOKENS[3].roles, ["error", "warning", "info", "hint"]);
  for (const [i, token] of TOKENS.entries()) {
    if (i < 2) { assert.equal(typeof token.text, "string"); continue; }
    assert.equal(token.paths.length, token.roles.length, "each glyph-built form has its own semantic color");
    assert.equal(new Set(token.paths).size, token.paths.length, "each form has its own outline");
    assert.ok(token.label.length > 20, "the shapes have an accessible description");
    assert.match(home, new RegExp(`<svg[^>]*data-story-word="${i + 1}"[^>]*aria-label="${escape(token.label)}"`));
    for (const path of token.paths) assert.ok(home.includes(`d="${path}"`), "the fallback shares the living field's outlines");
  }
  assert.doesNotMatch(home, /EWIH/, "diagnostics use symbols instead of initial letters");
  assert.equal(SHOTS.length, TOKENS.length);
  const final = SHOTS.at(-1);
  assert.deepEqual([final.rx, final.ry, final.rz], [0, 0, 0], "Signals finishes on a flat, front-facing editor");
  assert.equal(final.x, 0.5, "the finished file is horizontally centered");
  assert.ok(final.zoom <= 1, "the final shot fits the whole file rather than a close-up");
  assert.deepEqual([...home.matchAll(/class="story-rail__name">([^<]+)<\/span>/g)].map((m) => m[1]), ["Slate", "Structure", "Data", "Signals"]);
  assert.match(home, /data-story data-step="4"/);
  assert.doesNotMatch(home, /data-story-(?:copy|go|msg|word)="5"|data-glyph="story:5"|Checked on every build\./);
  // The camera stays on the file: every shot looks at a line it has, and at no more than a quarter turn.
  const rows = home.match(/data-story[^>]*>[\s\S]*?<\/pre>/)[0].match(/class="ln"/g).length;
  for (const s of SHOTS) {
    assert.ok(s.line >= 1 && s.line <= rows && s.x >= 0 && s.x <= 1 && s.zoom > 0, JSON.stringify(s));
    assert.ok([s.rx, s.ry, s.rz].every((d) => Math.abs(d) < 90), JSON.stringify(s));
  }
  assert.equal(travel(), TOKENS.length * PACE.hold + (TOKENS.length - 1) * PACE.pass);
  assert.equal(PACE.hold, 0.5, "pauses keep their original pace; only scanner transitions are extended");
  assert.equal(PACE.pass, 1.8, "scanner transitions take 1.8 screens of scrolling");
  for (let i = 1; i <= TOKENS.length; i++) {
    assert.ok(home.includes(`data-story-copy="${i}"`), `copy ${i}`);
    assert.ok(home.includes(`data-story-go="${i}"`), `stop ${i}`);
    assert.ok(home.includes(`data-story-msg="${i}"`), `status ${i}`);
    assert.ok(home.includes(`data-story-word="${i}"`), `token fallback ${i}`);
  }
});

test("each port page draws its own icon: a logo path, or a word where there is none", () => {
  for (const p of ports) {
    const html = page(`ports/${p.id}`);
    const anchor = html.match(new RegExp(`<div data-glyph="icon:${p.id}"(?:[^>"]|"[^"]*")*>`))?.[0];
    assert.ok(anchor, p.id);
    assert.match(anchor, /data-glyph-(path="[Mm][^"]+"|text="[^"]+")/, p.id);
  }
  if (ports.some((p) => p.id === "neovim" && !p.icon)) assert.match(page("ports/neovim"), /<div data-glyph="icon:neovim"[^>]*data-glyph-path="[Mm]/);
  if (ports.some((p) => p.id === "fzf" && !p.icon)) assert.match(page("ports/fzf"), /<div data-glyph="icon:fzf"[^>]*data-glyph-text="fzf"/);
});
