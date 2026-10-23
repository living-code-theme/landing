import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { siBat, siDelta, siJavascript, siStarship } from "simple-icons";
import { portIcon } from "../src/lib/icons.mjs";
import { finderPayload } from "../src/lib/port-finder-data.mjs";
import { ports } from "../src/lib/ports.mjs";

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

test("bat's shared tmTheme port uses the real bat logo", () => {
  assert.deepEqual(portIcon({ id: "tmtheme", name: "bat" }), { path: siBat.path, title: siBat.title });
});

for (const [id, title] of [
  ["kitty", "Kitty"], ["vscode", "Visual Studio Code"], ["windows-terminal", "Windows Terminal"], ["hunk", "Hunk"],
  ["foot", "foot"], ["btop", "btop++"], ["zellij", "Zellij"], ["expressive-code", "Expressive Code"], ["fzf", "fzf"], ["k9s", "K9s"],
  ["codex", "Codex"], ["aider", "Aider"], ["crush", "Crush"], ["herdr", "Herdr"], ["bottom", "bottom"],
  ["gitui", "GitUI"], ["lazydocker", "Lazydocker"], ["television", "Television"], ["rio", "Rio"], ["posting", "Posting"],
]) {
  test(`${id} uses its own locally retained logo instead of initials`, () => {
    const icon = portIcon({ id, name: title });
    assert.equal(icon.title, title);
    assert.match(icon.path, /^M/);
    assert.equal(icon.text, undefined);
  });
}

test("website icons stay monochrome logo paths, never README emoji", () => {
  for (const port of ports) {
    const icon = portIcon({ ...port, emoji: "🚀" });
    assert.equal(icon.emoji, undefined, port.id);
    assert.doesNotMatch(icon.text ?? "", /\p{Extended_Pictographic}/u, port.id);
    assert.deepEqual(icon, portIcon(port), `${port.id}: README emoji does not affect the web icon`);
  }
  assert.deepEqual(portIcon({ id: "starship", name: "Starship", emoji: "🚀" }), { path: siStarship.path, title: siStarship.title });
});

test("the delta diff viewer never uses the airline logo", () => {
  const icon = portIcon({ id: "delta", name: "delta" });
  assert.notEqual(icon.path, siDelta.path);
  assert.deepEqual(icon, { text: "delta" });
});

test("unrecognized apps retain a readable lettering fallback", () => {
  assert.deepEqual(portIcon({ id: "unrecognized-app", name: "Unknown" }), { text: "Un" });
});

test("the remaining app icons keep their logo silhouettes in the catalog, finder and port artwork", () => {
  const catalog = readFileSync(new URL("../dist/ports/index.html", import.meta.url), "utf8");
  const finder = JSON.parse(finderPayload).groups.flatMap((group) => group.ports);
  for (const id of ["foot", "btop", "zellij", "expressive-code", "fzf", "k9s", "claude-code", "codex", "opencode", "pi", "gemini-cli", "aider", "crush", "herdr", "bottom", "gitui", "lazydocker", "television", "nushell", "rio", "micro", "posting"]) {
    const port = ports.find((p) => p.id === id);
    if (!port) continue;
    const icon = portIcon(port);
    const row = catalog.match(new RegExp(`<a class="port-row[^>]*href="/ports/${id}/"[^>]*>([\\s\\S]*?)</a>`))?.[1];
    assert.ok(row?.includes(`d="${icon.path}"`), `${id}: catalog uses the actual app silhouette`);
    assert.match(row, /data-port-icon aria-hidden="true"/, `${id}: decorative icon retains the accessible app name`);
    assert.deepEqual(finder.find((entry) => entry.id === id)?.icon, icon, `${id}: finder uses the same logo`);
    const html = readFileSync(new URL(`../dist/ports/${id}/index.html`, import.meta.url), "utf8");
    const anchor = html.match(new RegExp(`<div data-glyph="icon:${id}"[^>]*>`))?.[0];
    assert.ok(anchor?.includes(`data-glyph-path="${icon.path}"`), `${id}: glyph artwork uses the same logo`);
    assert.doesNotMatch(anchor, /data-glyph-text=/, `${id}: no lettering fallback`);
  }
});

test("published port glyphs use the same paths as their catalog icons", () => {
  for (const port of ports) {
    const { id } = port;
    const icon = portIcon(port);
    if (!icon.path) continue;
    const html = readFileSync(new URL(`../dist/ports/${id}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes(`data-glyph-path="${icon.path}"`), `${id}: live glyph shape`);
    assert.ok(html.includes(`d="${icon.path}"`), `${id}: no-WebGL SVG fallback`);
    assert.ok(!html.includes('data-glyph-text="#"'), `${id}: no old hash glyph`);
  }
});
