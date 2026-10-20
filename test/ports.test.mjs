import assert from "node:assert/strict";
import test from "node:test";
import { portCatalog } from "../src/lib/ports.mjs";

const fallback = { schemaVersion: 1, ports: [
  { id: "neovim", name: "Old Neovim", group: "Editors" },
  { id: "kitty", name: "Kitty", group: "Terminals" },
] };
const snapshot = (ports = [], migratedSlugs = []) => ({ schemaVersion: 1, organization: "living-code-theme", ports, migratedSlugs });

test("discovered ports replace legacy entries without duplicating routes", () => {
  const port = { id: "neovim", name: "Neovim", group: "Editors", repositoryName: "living-code-theme/nvim" };
  const result = portCatalog(fallback, snapshot([port], [port.id]));
  assert.deepEqual(result.ports.map((p) => p.id), ["neovim", "kitty"]);
  assert.equal(result.ports[0], port);
});

test("removing a migrated port never resurrects its legacy entry", () => {
  assert.deepEqual(portCatalog(fallback, snapshot([], ["neovim"])).ports.map((p) => p.id), ["kitty"]);
});

test("a new port group appears without a website code change", () => {
  const result = portCatalog(fallback, snapshot([{ id: "music", group: "Music players" }]));
  assert.deepEqual(result.groups.map((g) => g.title), ["Editors", "Terminals", "Music players"]);
  assert.equal(result.groups[2].ports[0].id, "music");
});

test("group labels sharing a route are grouped together, not rendered as duplicate anchors", () => {
  const result = portCatalog(fallback, snapshot([{ id: "editor", group: "editors" }]));
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups[0].ports.map((p) => p.id), ["neovim", "editor"]);
});

test("unsupported snapshots and duplicate routes are rejected", () => {
  assert.throws(() => portCatalog(fallback, { ...snapshot(), schemaVersion: 2 }), /Unsupported/);
  assert.throws(() => portCatalog({ ...fallback, schemaVersion: 2 }, snapshot()), /Unsupported/);
  assert.throws(() => portCatalog(fallback, snapshot([{ id: "a" }, { id: "a" }])), /Duplicate slug/);
});
