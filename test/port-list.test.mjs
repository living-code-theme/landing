// The shared catalog stays name-led; installation instructions live on the port pages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ports } from "../src/lib/ports.mjs";
import { flavors } from "../src/lib/theme.mjs";
import { portIcon } from "../src/lib/icons.mjs";

const page = (path) => readFileSync(new URL(`../dist/${path}index.html`, import.meta.url), "utf8");
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").trim();

for (const path of ["", "ports/"]) {
  test(`${path || "home"}: catalog rows pair muted app icons with names, without repeated installation details`, () => {
    const html = page(path);
    const rows = [...html.matchAll(/<a class="port-row\b[^>]*href="\/ports\/([^/]+)\/"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.equal(rows.length, ports.length);
    for (const [anchor, id, row] of rows) {
      const port = ports.find((p) => p.id === id);
      assert.ok(port, id);
      assert.match(row, new RegExp(`class="port-name draw[^\"]*"[^>]*data-port-name="${id}"`));
      assert.match(row, /<span class="[^"]*text-muted"[^>]*data-port-icon aria-hidden="true"/, `${id}: decorative muted icon`);
      const icon = portIcon(port);
      if (icon.path) assert.ok(row.includes(`d="${icon.path}"`), `${id}: the app's own logo`);
      else assert.equal(text(row.match(/<span class="font-mono[^>]*>([\s\S]*?)<\/span>/)[1]), icon.text, `${id}: established wordmark fallback`);
      const content = row.slice(row.indexOf('<span class="flex min-w-0'));
      assert.doesNotMatch(content, /<svg\b|<i\b|<code\b|data-theme=/, `${id}: no arrows, flavor swatches or commands`);
      assert.doesNotMatch(anchor.split(">")[0], /(?:hover|focus-visible):bg-/, `${id}: no interaction background change`);
      const perFlavor = flavors.filter((f) => port.flavors.includes(f.id));
      const limited = perFlavor.length > 0 && perFlavor.length < flavors.length;
      const note = row.match(/<span[^>]*data-port-flavor-note[^>]*>([\s\S]*?)<\/span>/);
      assert.equal(Boolean(note), limited, `${id}: only exceptions need flavor metadata`);
      if (limited) {
        const expected = `${perFlavor.map((f) => f.name.replace("Living Code ", "")).join(" & ")} only`;
        assert.equal(text(note[1]), expected);
        assert.equal(text(content).replace(expected, "").trim(), port.name);
      } else {
        assert.equal(text(content), port.name);
      }
    }
    assert.match(html, /Choose an app for install steps\. All four flavors unless noted\./);
  });
}
