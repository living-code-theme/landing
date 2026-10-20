import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ports } from "../src/lib/ports.mjs";
import { portIcon } from "../src/lib/icons.mjs";

test("the finder keeps its grid layout throughout the native close transition", () => {
  const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");
  const base = css.match(/\.port-finder \{([\s\S]*?)\n\}/)[1];
  assert.match(base, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(base, /grid-template-rows: auto auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(base, /(?:display|overlay) \d+ms/, "closing does not depend on discrete-transition support");
  assert.match(css, /\.port-finder\[data-closing\]::backdrop \{ opacity: 0;/);
});

for (const path of ["", "ports/"]) {
  test(`${path || "home"}: Ctrl+K results share the catalog icons and clear selection labels`, () => {
    const html = readFileSync(new URL(`../dist/${path}index.html`, import.meta.url), "utf8");
    const finder = html.match(/<dialog[^>]*id="port-finder"[\s\S]*?<\/dialog>/)[0];
    const options = [...finder.matchAll(/<a class="port-link\b[^>]*id="finder-port-([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.equal(options.length, ports.length);
    for (const [anchor, id, content] of options) {
      const port = ports.find((p) => p.id === id);
      const icon = portIcon(port);
      assert.match(content, /data-port-icon aria-hidden="true"/);
      assert.match(content, /class="[^"]*text-muted"/);
      assert.match(content, /class="port-name\b/);
      assert.doesNotMatch(content, /class="[^"]*\bdraw\b/, `${id}: dialog results have no animated underline`);
      if (icon.path) assert.ok(content.includes(`d="${icon.path}"`), `${id}: same logo as the catalog and glyph artwork`);
      else assert.match(content, /class="font-mono\b/, `${id}: shared wordmark fallback`);
      assert.doesNotMatch(anchor.split(">")[0], /transition-colors/, `${id}: selection changes immediately without fading old highlights`);
      assert.doesNotMatch(content, /class="arrow\b/, `${id}: no redundant arrow`);
    }
  });
}
