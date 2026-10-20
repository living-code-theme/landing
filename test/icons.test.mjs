import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { siJavascript } from "simple-icons";
import { portIcon } from "../src/lib/icons.mjs";

const slack = portIcon({ id: "slack", name: "Slack" });
const json = portIcon({ id: "json", name: "JSON / JavaScript" });

test("Slack uses its logo instead of a hash wordmark", () => {
  assert.equal(slack.title, "Slack");
  assert.match(slack.path, /^M/);
  assert.equal(slack.text, undefined);
});

test("JSON / JavaScript uses the JavaScript logo", () => {
  assert.deepEqual(json, { path: siJavascript.path, title: siJavascript.title });
});

test("Slack and JavaScript glyphs use the same paths as their catalog icons", () => {
  for (const [id, icon] of [["slack", slack], ["json", json]]) {
    const html = readFileSync(new URL(`../dist/ports/${id}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes(`data-glyph-path="${icon.path}"`), `${id}: live glyph shape`);
    assert.ok(html.includes(`d="${icon.path}"`), `${id}: no-WebGL SVG fallback`);
    assert.ok(!html.includes('data-glyph-text="#"'), `${id}: no old hash glyph`);
  }
});
