import assert from "node:assert/strict";
import test from "node:test";
import { decodePortDocument, portCatalog, ports, readPort } from "../src/lib/ports.mjs";
import { createHash } from "node:crypto";
import discovered from "../data/ports.json" with { type: "json" };

const snapshot = (ports = [], migratedSlugs = []) => ({ schemaVersion: 1, organization: "living-code-theme", ports, migratedSlugs });
const neovim = { id: "neovim", name: "Neovim", group: "Editors", repositoryName: "living-code-theme/nvim" };
const kitty = { id: "kitty", name: "Kitty", group: "Terminals", repositoryName: "living-code-theme/kitty" };

test("the production catalog contains exactly the discovered ports, with local documents", async () => {
  assert.deepEqual(ports, discovered.ports);
  for (const port of ports) {
    const content = await readPort(port);
    assert.ok(content.repository && (content.guide || content.readme) && content.revision);
  }
});

test("an empty snapshot publishes no placeholder ports or groups", () => {
  assert.deepEqual(portCatalog(snapshot()), { ports: [], groups: [] });
});

test("ports appear incrementally without any website registry change", () => {
  const first = portCatalog(snapshot([neovim]));
  assert.deepEqual(first.ports, [neovim]);
  assert.deepEqual(first.groups, [{ title: "Editors", ports: [neovim] }]);
  const next = portCatalog(snapshot([neovim, kitty]));
  assert.deepEqual(next.ports, [neovim, kitty]);
  assert.deepEqual(next.groups, [
    { title: "Editors", ports: [neovim] },
    { title: "Terminals", ports: [kitty] },
  ]);
});

test("category order is fixed regardless of discovery order, without reordering ports", () => {
  const titles = ["Editors", "AI & Agents", "Terminals", "CLI & TUI", "Browsers", "Apps", "Web", "Theme systems"];
  const entries = titles.map((group, id) => ({ id: String(id), group }));
  for (const input of [entries, [...entries].reverse(), [...entries.slice(3), ...entries.slice(0, 3)]]) {
    const result = portCatalog(snapshot(input));
    assert.deepEqual(result.groups.map((g) => g.title), titles);
    assert.deepEqual(result.ports, input);
  }
});

test("partial catalogs sort known categories first and retain new categories in discovery order", () => {
  const result = portCatalog(snapshot([
    { id: "music", group: "Music players" },
    { id: "systems", group: "Theme systems" },
    { id: "web", group: "Web & code" },
    { id: "other", group: "Other" },
    kitty,
    { id: "editor", group: "editors" },
    neovim,
  ]));
  assert.deepEqual(result.groups.map((g) => g.title), ["editors", "Terminals", "Web & code", "Theme systems", "Music players", "Other"]);
  assert.deepEqual(result.groups[0].ports.map((p) => p.id), ["editor", "neovim"]);
});

test("removed ports stay absent even when discovery retains migration history", () => {
  assert.deepEqual(portCatalog(snapshot([kitty], ["neovim", "kitty"])).ports, [kitty]);
  assert.deepEqual(portCatalog(snapshot([], ["neovim", "kitty"])).ports, []);
});

test("a new port group appears without a website code change", () => {
  const result = portCatalog(snapshot([neovim, { id: "music", group: "Music players" }]));
  assert.deepEqual(result.groups.map((g) => g.title), ["Editors", "Music players"]);
  assert.equal(result.groups[1].ports[0].id, "music");
});

test("group labels sharing a route are grouped together, not rendered as duplicate anchors", () => {
  const result = portCatalog(snapshot([neovim, { id: "editor", group: "editors" }]));
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].ports.map((p) => p.id), ["neovim", "editor"]);
});

test("unsupported snapshots and duplicate routes are rejected", () => {
  assert.throws(() => portCatalog({ ...snapshot(), schemaVersion: 3 }), /Unsupported/);
  assert.throws(() => portCatalog({ schemaVersion: 1 }), /Unsupported/);
  assert.throws(() => portCatalog(snapshot([{ id: "a" }, { id: "a" }])), /Duplicate slug/);
});

test("the version-2 index contains metadata, not embedded documentation", () => {
  assert.deepEqual(portCatalog({ schemaVersion: 2, ports: [neovim] }).ports, [neovim]);
  for (const field of ["guide", "readme", "files"]) assert.throws(() => portCatalog({ schemaVersion: 2, ports: [{ ...neovim, [field]: "not index data" }] }), /must not contain documentation/);
});

test("pinned documents are decoded independently and verified against their metadata and content hash", () => {
  const body = { schemaVersion: 1, port: { ...kitty, guide: { schemaVersion: 1, installation: "Install.", configuration: "", compatibility: "", links: {} }, files: ["theme.conf"] } };
  const raw = JSON.stringify(body) + "\n";
  const entry = { ...kitty, content: `ports/kitty.${createHash("sha256").update(raw).digest("hex")}.json` };
  assert.deepEqual(decodePortDocument(entry, raw), body.port);
  assert.throws(() => decodePortDocument(entry, raw + " "), /fingerprint mismatch/);
  assert.throws(() => decodePortDocument({ ...entry, name: "Mismatch" }, raw), /index\/document mismatch/);
  assert.throws(() => decodePortDocument({ ...entry, content: "ports/../../secret.json" }, raw), /Invalid port document reference/);
});
