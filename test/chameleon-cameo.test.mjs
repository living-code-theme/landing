import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const page = (path = "") => readFileSync(new URL(`../dist/${path ? `${path}/` : ""}index.html`, import.meta.url), "utf8");
const cameo = (html, pose = "perched") => html.match(new RegExp(`<svg[^>]*data-chameleon-cameo="${pose}"[\\s\\S]*?<\\/svg>`))?.[0];
const source = readFileSync(new URL("../src/components/ChameleonCameo.astro", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/scripts/chameleon-cameo.ts", import.meta.url), "utf8");
const footerOf = (html) => html.match(/<footer[\s\S]*?<\/footer>/)?.[0].replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

test("the curious footer companion and hero remain, but not in the flavor section", () => {
  const html = page();
  const flavors = html.match(/<section[^>]*id="flavors"[\s\S]*?<\/section>/)[0];
  const footer = footerOf(html);
  assert.doesNotMatch(flavors, /data-chameleon-cameo|data-glyph="chameleon"/);
  assert.match(flavors, /role="tablist"/);
  assert.ok(cameo(footer));
  assert.match(html, /data-glyph="chameleon"/, "the hero keeps its original living-field shape");
  assert.match(footer, /data-glyph="mark"/, "the footer keeps its existing mark");
  assert.equal([...html.matchAll(/data-chameleon-cameo=/g)].length, 1);
});

test("the footer opens with only an accessible living mark", () => {
  const footer = footerOf(page());
  const intro = footer.slice(0, footer.indexOf("<nav"));
  assert.match(intro, /data-glyph="mark"/);
  assert.match(intro, /mx-auto h-\[clamp\(180px,26vw,360px\)\] max-w-\[960px\]/);
  assert.match(intro, /role="img" aria-label="Living Code"/);
  assert.doesNotMatch(intro, /<p\b|<h[1-6]\b|class="[^"]*bleed/);
});

test("the companion is an accessible button in the bottom credits, above the colorscheme command", () => {
  const footer = footerOf(page());
  const mascot = footer.indexOf('data-chameleon-cameo="perched"');
  assert.ok(mascot > footer.lastIndexOf("</nav>"));
  assert.ok(mascot < footer.indexOf("© 2026"), "copyright follows the companion in reading order");
  assert.ok(mascot < footer.indexOf(":colorscheme"));
  const control = footer.match(/<button[^>]*data-cameo-control[^>]*>/)[0];
  assert.match(control, /w-\[clamp\(128px,12vw,160px\)\]/);
  assert.match(control, /type="button"/);
  assert.match(control, /disabled aria-label="Startle the chameleon"/);
  assert.match(footer, /data-cameo-status[^>]*role="status"/);
  assert.doesNotMatch(footer, /built from one palette file|Set in Geist|The background stays quiet|with each port in its own repository/);
  assert.deepEqual([...footer.matchAll(/<nav class="text-left" aria-label="([^"]+)"/g)].map((match) => match[1]), ["Ports", "Flavors", "Source"], "footer groups keep their left alignment and requested order");
  assert.equal([...footer.matchAll(/<ul class="grid justify-items-start gap-2"/g)].length, 3, "footer links align to the start of each list");
  assert.match(footer, /justify-self-end/, "the chameleon and command align right at every width");
  assert.match(footer, /grid-cols-2 justify-start gap-10 sm:grid-cols-\[repeat\(3,max-content\)\]/, "footer navigation groups stay together on the left, with two columns on mobile");
});

test("the fallback still samples the hero's surface, not a separate silhouette or glyph mask", () => {
  assert.match(source, /import \{ chameleonPortrait \} from "\.\.\/scripts\/living\/chameleon"/);
  const svg = cameo(page());
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /focusable="false"/);
  assert.doesNotMatch(svg, /data-glyph=|<script|<image|<mask|<clipPath|<path|tabindex=/);
  for (const part of ["body", "feet", "tail", "head", "eye"])  assert.match(svg, new RegExp(`data-cameo-part="${part}"`));
  const runs = [...svg.matchAll(/<text x="([\d. ]+)" y="([\d. ]+)" fill="var\(--lc-[\w-]+\)" opacity="([\d.]+)" font-size="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)];
  assert.ok(runs.length > 10 && runs.length < 300);
  let glyphs = 0;
  for (const [, x, y, , , encoded] of runs) {
    const chars = encoded.replace(/&(?:quot|apos|lt|gt|amp|#39);/g, "_");
    assert.equal(x.split(" ").length, chars.length);
    assert.equal(y.split(" ").length, chars.length);
    glyphs += chars.length;
  }
  assert.ok(glyphs > 500 && glyphs < 1600, "bounded glyph count, no scene or dust");
  assert.ok(new Set(runs.map((run) => run[3])).size >= 4);
  assert.ok(new Set(runs.map((run) => run[4])).size > 1);
  assert.match(svg, /fill="var\(--lc-keyword\)"/);
});

test("the live companion is the hero's model drawn from a glyph atlas, gated on visibility and torn down", () => {
  assert.match(controller, /createChameleonCompanion/);
  assert.match(controller, /drawImage\(tint/);
  assert.doesNotMatch(controller, /fillText\(String\.fromCharCode\(s\.glyph/, "no per-frame text shaping");
  assert.match(controller, /new IntersectionObserver/);
  assert.match(controller, /ready && visible && !document\.hidden && !motion\.matches/);
  assert.match(controller, /cancelAnimationFrame\(raf\)/);
  assert.match(controller, /observer\.disconnect\(\); resize\.disconnect\(\); theme\.disconnect\(\); events\.abort\(\)/);
  assert.match(controller, /The chameleon blinks at you/);
  assert.match(source, /<canvas class="chameleon-companion__live"/);
  assert.match(source, /"astro:before-swap", \(\) => stop\(\)/);
  assert.doesNotMatch(controller, /setInterval|setTimeout|getContext\("webgl/);
});

test("every page has exactly one companion in the footer's bottom row", () => {
  const dist = new URL("../dist/", import.meta.url);
  const pages = readdirSync(dist, { recursive: true }).filter((path) => path.endsWith(".html"));
  assert.ok(pages.length > 0);
  for (const path of pages) {
    const footer = footerOf(readFileSync(new URL(path, dist), "utf8"));
    assert.ok(footer, `${path}: shared footer exists`);
    assert.equal([...footer.matchAll(/data-chameleon-cameo="perched"/g)].length, 1, path);
    assert.ok(footer.indexOf('data-cameo-control') < footer.indexOf(":colorscheme"), path);
  }
});
