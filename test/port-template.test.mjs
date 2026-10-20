import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { newPort } from "../scripts/new-port.mjs";
import { PORT_FLAVORS, PORT_REQUEST_URL, README_SECTIONS, renderPortReadme } from "../scripts/readme-template.mjs";
import { readmeImagePaths, renderReadme, validateReadmeTemplate } from "../src/lib/readme.mjs";

const manifest = (flavors = PORT_FLAVORS) => ({ schemaVersion: 1, name: "Neovim", slug: "neovim", group: "Editors", emoji: "📝", flavors, images: flavors.map((flavor) => ({ flavor, path: `images/${flavor}.png`, alt: `Neovim running Living Code ${flavor}` })) });
const prose = {
  installation: 'Install the plugin.\n\n```lua\n{ "living-code-theme/nvim" }\n```',
  configuration: "Configure the theme after installation.", compatibility: "Uses the application's theme settings.",
  flavorUsage: Object.fromEntries(PORT_FLAVORS.map((id) => [id, `Select the ${id} flavor in your application.`])),
};

test("all four flavors use one 2×2 comparison grid and four correctly ordered dropdowns", () => {
  const meta = manifest();
  const source = renderPortReadme(meta, prose);
  validateReadmeTemplate(source, meta);
  assert.deepEqual([...source.matchAll(/^## (.+)$/gm)].map((m) => m[1]), README_SECTIONS);
  assert.equal((source.match(/<table /g) ?? []).length, 1);
  assert.equal((source.match(/<tr>/g) ?? []).length, 2);
  assert.equal((source.match(/<td width="50%"/g) ?? []).length, 4);
  assert.deepEqual([...source.matchAll(/<details data-lc-flavor="([a-z]+)">/g)].map((m) => m[1]), PORT_FLAVORS);
  assert.deepEqual(readmeImagePaths(source), meta.images.map((image) => image.path));
  for (const image of meta.images) assert.equal(source.split(`src="${image.path}"`).length - 1, 2, "comparison and full preview reuse the same real image");
  assert.doesNotMatch(source, /<script|<select|\{\{/);
});

test("each port owns its title emoji while the shared chameleon mascot stays consistent", () => {
  for (const [name, emoji] of [["Neovim", "📝"], ["Kitty", "🐈"], ["Ghostty", "👻"], ["Firefox", "🦊"], ["Obsidian", "💎"]]) {
    const meta = { ...manifest(), name, emoji };
    const source = renderPortReadme(meta, prose);
    assert.ok(source.includes(`# ${emoji} Living Code for ${name}`));
    assert.match(source, /🦎 \*\*One chameleon, many habitats\.\*\*/);
    validateReadmeTemplate(source, meta);
    assert.throws(() => validateReadmeTemplate(source.replace(`# ${emoji} `, "# 🎨 "), meta), /title.*emoji/);
  }
});

test("a missing emoji stays an explicit authoring placeholder, not a shared fallback for every port", () => {
  const meta = manifest();
  delete meta.emoji;
  const source = renderPortReadme(meta, prose);
  assert.match(source, /# \{\{PORT_EMOJI\}\} Living Code for Neovim/);
  assert.throws(() => validateReadmeTemplate(source, meta), /PORT_EMOJI/);
});

test("two-flavor ports do not advertise unshipped flavors, and canonical order ignores input order", () => {
  const meta = manifest(["paper", "night"]);
  const source = renderPortReadme(meta, prose);
  validateReadmeTemplate(source, meta);
  assert.equal((source.match(/<tr>/g) ?? []).length, 1);
  assert.doesNotMatch(source, /data-lc-flavor="(?:signal|frost)"|images\/(?:signal|frost)/);
  assert.ok(source.indexOf('data-lc-flavor="night"') < source.indexOf('data-lc-flavor="paper"'));
});

test("missing captures are honest empty states, never placeholder or invented images", () => {
  const meta = manifest();
  meta.images = meta.images.slice(0, 1);
  const source = renderPortReadme(meta, prose);
  validateReadmeTemplate(source, meta);
  assert.match(source, /Frost, Paper, Signal are supported; real captures are not available yet/);
  assert.deepEqual(readmeImagePaths(source), ["images/night.png"]);
  meta.images = [];
  const empty = renderPortReadme(meta, prose);
  validateReadmeTemplate(empty, meta);
  assert.match(empty, /Real application screenshots have not been captured yet/);
  assert.equal((empty.match(/<details /g) ?? []).length, 4);
  assert.deepEqual(readmeImagePaths(empty), []);
});

test("malformed template updates, unfinished scaffolds and flavor/metadata drift are rejected", () => {
  const meta = manifest();
  const source = renderPortReadme(meta, prose);
  for (const broken of [
    renderPortReadme(meta), source.replace("<!-- living-code-readme:1 -->", "<!-- living-code-readme:2 -->"),
    source.replace("## Installation", "## Setup"), source.replace("## Installation", "### Installation"),
    source.replace('data-lc-flavor="paper"', 'data-lc-flavor="night"'), source.replace("data-lc-flavors", "unrecognized-grid"),
    source.replaceAll("images/paper.png", "images/different.png"),
    source.replace('src="images/paper.png"', 'src="images/different.png"'),
    source.replace(/src="images\/paper.png"([^>]+)width="1280"/, 'src="images/different.png"$1width="1280"'),
    source + "\n# Another title\n",
  ]) assert.throws(() => validateReadmeTemplate(broken, meta), /README/);
  assert.throws(() => renderPortReadme(manifest(["night", "night"])), /unique/);
  assert.throws(() => renderPortReadme({ ...meta, images: [meta.images[0], meta.images[0]] }), /screenshots/);
});

test("full README rendering preserves the comparison grid and native dropdowns, rewrites full-image links, and strips styling/events", () => {
  const meta = manifest();
  const images = Object.fromEntries(meta.images.map((image) => [image.path, { src: `/port-images/${image.flavor}.webp`, width: 1600, height: 1000 }]));
  const source = renderPortReadme(meta, prose).replace("<table data-lc-flavors>", '<table data-lc-flavors style="position:fixed" onclick="alert(1)">');
  const html = renderReadme(source, { repository: "https://github.com/living-code-theme/nvim", revision: "a".repeat(40), images });
  assert.match(html, /<table data-lc-flavors>/);
  for (const id of PORT_FLAVORS) {
    assert.ok(html.includes(`<details data-lc-flavor="${id}">`));
    assert.ok(html.includes(`href="/port-images/${id}.webp"`));
    assert.ok(html.includes(`src="/port-images/${id}.webp"`));
  }
  assert.doesNotMatch(html, /style=|onclick=|<script|<select/);
  assert.match(html, /href="#readme-installation"/);
});

test("metadata text and alt text cannot inject HTML into the template", () => {
  const meta = manifest(["night"]);
  meta.name = 'Editor <script>alert(1)</script>';
  meta.images[0].alt = 'Screenshot " onerror="alert(1)';
  const source = renderPortReadme(meta, prose);
  assert.doesNotMatch(source, /<script>|alt="Screenshot " onerror=/);
  assert.match(source, /&lt;script&gt;/);
  assert.match(source, /&quot; onerror=&quot;/);
});

test("Contributing links the port's issue forms and core's port request form", () => {
  const source = renderPortReadme(manifest(), { repository: "https://github.com/living-code-theme/nvim" });
  const section = source.split("## Contributing\n")[1].split("\n## ")[0];
  assert.ok(section.includes("[Open an issue](https://github.com/living-code-theme/nvim/issues/new/choose)"));
  assert.ok(section.includes(`[Request a port](${PORT_REQUEST_URL})`));
  assert.equal(PORT_REQUEST_URL, "https://github.com/living-code-theme/core/issues/new?template=port-request.yml");
  assert.match(renderPortReadme(manifest()), /Open an issue in this repository/, "no guessed link without a repository");
  for (const repository of ["https://github.com/someone-else/nvim", "javascript:alert(1)", "https://github.com/living-code-theme/nvim/../x"]) {
    assert.throws(() => renderPortReadme(manifest(), { repository }), /living-code-theme GitHub URL/, repository);
  }
});

test("new-port scaffold owns README, metadata, local schema, license and image instructions; never overwrites", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "living-code-port-template-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const meta = manifest();
  await newPort(dir, meta);
  const readme = await readFile(join(dir, "README.md"), "utf8");
  const repository = `https://github.com/living-code-theme/${basename(dir)}`;
  assert.equal(readme, renderPortReadme(meta, { repository }));
  assert.ok(readme.includes(`[Open an issue](${repository}/issues/new/choose)`), "links the scaffolded repository's issue forms");
  assert.throws(() => validateReadmeTemplate(readme, meta), /placeholder/);
  assert.deepEqual(JSON.parse(await readFile(join(dir, "port.json"), "utf8")), { $schema: "https://living-code.dev/port.schema.json", ...meta });
  assert.match(await readFile(join(dir, "LICENSE"), "utf8"), /MIT License/);
  assert.deepEqual((await readdir(dir)).sort(), ["LICENSE", "README.md", "images", "port.json"], "no local schema or image notes");
  assert.deepEqual(await readdir(join(dir, "images")), []);
  await assert.rejects(newPort(dir, meta), /empty output directory/);
  assert.equal(await readFile(join(dir, "README.md"), "utf8"), readme);
});

test("new-port CLI accepts named options and supports a two-flavor port with no captures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "living-code-port-cli-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const directory = join(root, "terminal");
  await promisify(execFile)(process.execPath, [new URL("../scripts/new-port.mjs", import.meta.url).pathname, directory, "--name", "Terminal", "--group", "Terminals", "--emoji", "💻", "--flavors", "night,paper", "--no-images"]);
  const meta = JSON.parse(await readFile(join(directory, "port.json"), "utf8"));
  assert.equal(meta.emoji, "💻");
  assert.deepEqual(meta.flavors, ["night", "paper"]);
  assert.deepEqual(meta.images, []);
  assert.match(await readFile(join(directory, "README.md"), "utf8"), /data-lc-flavor="paper"/);
});
