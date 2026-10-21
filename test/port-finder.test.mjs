import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APPS, keys, ports } from "../src/lib/data.mjs";
import { portIcon } from "../src/lib/icons.mjs";
import { finderPayload, finderUrl } from "../src/lib/port-finder-data.mjs";
import { validateFinderCatalog } from "../src/scripts/port-finder.ts";

test("the finder keeps its grid layout throughout the native close transition", () => {
  const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");
  const base = css.match(/\.port-finder \{([\s\S]*?)\n\}/)[1];
  assert.match(base, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(base, /grid-template-rows: auto auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(base, /(?:display|overlay) \d+ms/);
  assert.match(css, /\.port-finder\[data-closing\]::backdrop \{ opacity: 0;/);
});

test("one content-addressed finder asset retains every port's icons, aliases and labels", () => {
  const catalog = validateFinderCatalog(JSON.parse(finderPayload));
  const found = catalog.groups.flatMap((group) => group.ports);
  assert.equal(found.length, ports.length);
  for (const port of ports) {
    const entry = found.find((p) => p.id === port.id);
    assert.deepEqual(entry, { id: port.id, name: port.name, keys: keys(port), icon: portIcon(port) });
    assert.equal(entry.readme, undefined);
    assert.equal(entry.guide, undefined);
  }
  assert.match(finderUrl, /^\/port-finder\/[a-f0-9]{64}\.json$/);
  assert.equal(readFileSync(new URL(`../dist${finderUrl}`, import.meta.url), "utf8"), finderPayload);
});

for (const path of ["", "ports/"]) test(`${path || "home"}: finder defers results without losing the native dialog or fallback`, () => {
  const html = readFileSync(new URL(`../dist/${path}index.html`, import.meta.url), "utf8");
  const finder = html.match(/<dialog[^>]*id="port-finder"[\s\S]*?<\/dialog>/)[0];
  assert.ok(finder.includes(`data-port-catalog="${finderUrl}"`));
  assert.match(finder, /role="combobox"/);
  assert.match(finder, /role="listbox"/);
  assert.doesNotMatch(finder, /role="option"/);
  assert.match(finder, /href="\/ports\/">Browse all ports/);
});

test("untrusted finder metadata rejects bad versions, duplicate routes and executable URL shapes", () => {
  for (const data of [null, {}, { schemaVersion: 2, groups: [] }, { schemaVersion: 1, groups: [{ id: "x", title: "X", ports: [{ id: "../../escape" }] }] }]) assert.throws(() => validateFinderCatalog(data));
  const one = { id: "test", name: "Test", keys: "test", icon: { text: "Te" } };
  assert.throws(() => validateFinderCatalog({ schemaVersion: 1, groups: [{ id: "x", title: "X", ports: [one, one] }] }), /Invalid/);
});

test("the homepage showcase stays bounded without truncating the catalog or finder", () => {
  const home = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.equal([...home.matchAll(/data-app-panel=/g)].length, Math.min(5, APPS.length));
  for (const app of APPS) assert.ok(ports.find((p) => p.id === app.port)?.images.length);
  assert.equal(JSON.parse(finderPayload).groups.flatMap((g) => g.ports).length, ports.length);
});
