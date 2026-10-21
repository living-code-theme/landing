import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const page = (path = "") => readFileSync(new URL(`../dist/${path ? `${path}/` : ""}index.html`, import.meta.url), "utf8");
const cameo = (html, pose) => html.match(new RegExp(`<svg[^>]*data-chameleon-cameo="${pose}"[\\s\\S]*?<\\/svg>`))?.[0];
const source = readFileSync(new URL("../src/components/ChameleonCameo.astro", import.meta.url), "utf8");

test("the flavor section has no chameleon while the hero and sleeping footer companion remain", () => {
  const html = page();
  const flavors = html.match(/<section[^>]*id="flavors"[\s\S]*?<\/section>/)[0];
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.doesNotMatch(flavors, /data-chameleon-cameo|data-glyph="chameleon"/);
  assert.match(flavors, /role="tablist"/);
  assert.ok(cameo(footer, "sleeping"));
  assert.match(html, /data-glyph="chameleon"/, "the hero keeps its original living-field shape");
  assert.match(footer, /data-glyph="mark"/, "the footer keeps its existing mark");
  assert.equal([...html.matchAll(/data-chameleon-cameo=/g)].length, 1);
});

test("the small sleeping cameo sits directly above the footer colorscheme command", () => {
  const footer = page().match(/<footer[\s\S]*?<\/footer>/)[0].replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const sleeping = footer.indexOf('data-chameleon-cameo="sleeping"');
  assert.ok(sleeping > footer.lastIndexOf("</nav>"), "the mascot follows the navigation, not the title");
  assert.ok(sleeping < footer.indexOf(":colorscheme"), "the command follows the small mascot");
  assert.match(footer, /data-chameleon-cameo="sleeping"[\s\S]*?<\/svg>\s*<p[^>]*><code[^>]*>:colorscheme/);
  assert.match(cameo(footer, "sleeping"), /w-\[clamp\(128px,12vw,160px\)\]/);
});

test("cameos use the hero's surface model instead of a separate silhouette or glyph mask", () => {
  assert.match(source, /import \{ chameleonPortrait \} from "\.\.\/scripts\/living\/chameleon"/);
  const html = page();
  const poses = new Set([...html.matchAll(/data-chameleon-cameo="([^"]+)"/g)].map((match) => match[1]));
  for (const pose of poses) {
    const svg = cameo(html, pose);
    assert.match(svg, /aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(svg, /data-glyph=|<canvas|<script|<image|<mask|<clipPath|<path|tabindex=/);
    for (const part of ["body", "feet", "tail", "eye"]) assert.match(svg, new RegExp(`data-cameo-part="${part}"`));
    const runs = [...svg.matchAll(/<text x="([\d. ]+)" y="([\d. ]+)" fill="var\(--lc-[\w-]+\)" opacity="([\d.]+)" font-size="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)];
    assert.ok(runs.length > 10 && runs.length < 300, "glyphs grouped by material, shading and depth");
    let glyphs = 0;
    for (const [, x, y, , , encoded] of runs) {
      const chars = encoded.replace(/&(?:quot|apos|lt|gt|amp|#39);/g, "_");
      assert.equal(x.split(" ").length, chars.length);
      assert.equal(y.split(" ").length, chars.length);
      glyphs += chars.length;
    }
    assert.ok(glyphs > 500 && glyphs < 1600, `${pose}: bounded glyph count, no scene or dust`);
    assert.ok(new Set(runs.map((run) => run[3])).size >= 4, "surface-facing shading, not a flat text fill");
    assert.ok(new Set(runs.map((run) => run[4])).size > 1, "depth affects glyph size");
    assert.match(svg, /fill="var\(--lc-keyword\)"/, "skin follows the site's flavor");
  }
});

test("cameo movement is subtle, visibility-gated, cleaned up on navigation, and reduced-motion aware", () => {
  assert.match(source, /@keyframes cameo-breathe/);
  assert.match(source, /@keyframes cameo-tail/);
  assert.match(source, /@keyframes cameo-blink/);
  assert.match(source, /animation-play-state: paused/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /animation: none/);
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /visible\.has\(el\) && !document\.hidden/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /removeEventListener\("visibilitychange", sync\)/);
  assert.match(source, /"astro:before-swap", \(\) => stop\(\)/);
  assert.doesNotMatch(source, /requestAnimationFrame|setInterval|setTimeout/, "no extra rendering loop");
});

test("every page has one sleeping chameleon above the footer colorscheme command", () => {
  const dist = new URL("../dist/", import.meta.url);
  const pages = readdirSync(dist, { recursive: true }).filter((path) => path.endsWith(".html"));
  assert.ok(pages.length > 0);
  for (const path of pages) {
    const html = readFileSync(new URL(path, dist), "utf8");
    // Astro emits the cameo's module script at its first use, between the SVG and the command.
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0].replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    assert.ok(footer, `${path}: shared footer exists`);
    assert.equal([...footer.matchAll(/data-chameleon-cameo="sleeping"/g)].length, 1, path);
    assert.match(footer, /data-chameleon-cameo="sleeping"[\s\S]*?<\/svg>\s*<p[^>]*><code[^>]*>:colorscheme/, path);
  }
});
