import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderPortReadme } from "../scripts/readme-template.mjs";
import { localPortSnapshot } from "../scripts/preview-port.mjs";
import { emptySnapshot } from "../scripts/sync-ports.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "living-code-local-port-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "kitty");
  await mkdir(directory);
  const manifest = { schemaVersion: 1, name: "Kitty", slug: "kitty", group: "Terminals", emoji: "🐈", flavors: ["night"], images: [], files: ["living-code-night.conf"] };
  await writeFile(join(directory, "port.json"), JSON.stringify(manifest));
  await writeFile(join(directory, "README.md"), renderPortReadme(manifest, {
    installation: "Install this test theme.", configuration: "Use your terminal settings.", compatibility: "Kitty.", flavorUsage: { night: "Select Night." },
  }));
  await writeFile(join(directory, "living-code-night.conf"), "background #05080b\n");
  return { root, directory };
}

test("local preview validates a complete draft through discovery without changing existing ports", async (t) => {
  const { directory } = await fixture(t);
  const previous = emptySnapshot();
  const existing = { id: "neovim", group: "Editors", repositoryName: "living-code-theme/nvim", revision: "a".repeat(40) };
  previous.ports.push(existing);
  const before = structuredClone(previous);
  const result = await localPortSnapshot(directory, previous);
  assert.deepEqual(previous, before);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.slug, "kitty");
  assert.match(result.revision, /^[a-f0-9]{40}$/);
  assert.equal(result.snapshot.ports.find((port) => port.id === "neovim"), existing);
  const kitty = result.snapshot.ports.find((port) => port.id === "kitty");
  assert.equal(kitty.repository, "https://github.com/living-code-theme/kitty");
  assert.ok(kitty.fileUrls["living-code-night.conf"].includes(result.revision));
});

test("local content fingerprints are stable and change when a theme file changes", async (t) => {
  const { directory } = await fixture(t);
  const first = await localPortSnapshot(directory, emptySnapshot());
  assert.equal((await localPortSnapshot(directory, emptySnapshot())).revision, first.revision);
  await writeFile(join(directory, "living-code-night.conf"), "background #ffffff\n");
  assert.notEqual((await localPortSnapshot(directory, emptySnapshot())).revision, first.revision);
});

test("broken draft documentation is reported, not silently shown as the old port", async (t) => {
  const { directory } = await fixture(t);
  const previous = (await localPortSnapshot(directory, emptySnapshot())).snapshot;
  const path = join(directory, "README.md");
  await writeFile(path, (await readFile(path, "utf8")).replace("## Installation", "## Missing"));
  await assert.rejects(localPortSnapshot(directory, previous), /README.md sections/);
});

test("local preview rejects missing implementation files and links outside the port", async (t) => {
  const { directory, root } = await fixture(t);
  const path = join(directory, "living-code-night.conf");
  await rm(path);
  await assert.rejects(localPortSnapshot(directory, emptySnapshot()), /ENOENT/);
  const outside = join(root, "private.conf");
  await writeFile(outside, "not part of the port");
  await symlink(outside, path);
  await assert.rejects(localPortSnapshot(directory, emptySnapshot()), /escapes its repository/);
});
