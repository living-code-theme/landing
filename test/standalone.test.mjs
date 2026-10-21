import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import snapshot from "../data/theme.json" with { type: "json" };
import discovered from "../data/ports.json" with { type: "json" };
import { ports, readPort } from "../src/lib/ports.mjs";
import { ACCENT_ORDER, ANSI_ORDER, GLYPHS, NEUTRAL_ORDER, TEXT_ROLES, flavors } from "../src/lib/theme.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("landing theme data, CSS and glyphs are complete without a palette compiler", () => {
  assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.source.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(flavors.map((f) => f.id), ["night", "frost", "paper", "signal"]);
  assert.equal(ANSI_ORDER.length, 8);
  assert.equal(snapshot.minimumContrast, 4.5);
  const css = read("src/styles/theme.css");
  for (const f of flavors) {
    assert.ok(css.includes(`[data-theme="${f.slug}"]`));
    for (const name of [...NEUTRAL_ORDER, ...ACCENT_ORDER]) {
      assert.ok(css.includes(`--lc-${name}: ${f.colors[name].css};`));
      assert.equal(f.c(name), f.colors[name].hex);
      assert.ok(Number.isFinite(f.contrastToBase[name]));
    }
    for (const role of TEXT_ROLES) {
      assert.ok(f.contrastToBase[f.roles[role]] >= 4.5, `${f.id}.${role}`);
      assert.equal(f.r(role), f.colors[f.roles[role]].hex);
      assert.deepEqual(f.rr(role), f.raw[f.roles[role]]);
    }
    assert.equal(f.ansi.normal.length, 8);
    assert.equal(f.ansi.bright.length, 8);
  }
  for (const character of "[lc]") assert.match(GLYPHS[character], /^M/);
  for (const path of ["LICENSE", "public/fonts/OFL-JetBrainsMono.txt", "public/fonts/OFL-Geist.txt"]) assert.ok(read(path).trim());
});

test("port inputs and real captures are local and pinned to published repository revisions", async () => {
  assert.ok([1, 2].includes(discovered.schemaVersion));
  for (const entry of ports) {
    const port = await readPort(entry);
    assert.equal(port.repository, `https://github.com/${port.repositoryName}`);
    assert.match(port.revision, /^[a-f0-9]{40}$/);
    assert.equal(port.readmeUrl, `${port.repository}/blob/${port.revision}/README.md`);
    for (const path of port.files) assert.ok(port.fileUrls[path].startsWith(`${port.repository}/blob/${port.revision}/`));
    assert.equal(new Set(port.images.map((image) => image.flavor)).size, port.images.length, port.id);
    for (const image of [...port.images, ...Object.values(port.guideImages ?? port.readmeImages)]) {
      const base = image.src.startsWith("/port-images/") ? "/port-images/" : discovered.assets?.base;
      assert.ok(base === "/port-images/" || /^https:\/\//.test(base), "only an explicit immutable asset origin");
      assert.ok(image.src.startsWith(base));
      const name = image.src.slice(base.length);
      assert.match(name, /^[a-f0-9]{64}\.webp$/);
      if (base !== "/port-images/") {
        assert.ok(discovered.assets.files[name] > 0, "external captures have checked-in size/integrity metadata, not build-time fetches");
        continue;
      }
      const bytes = readFileSync(join(root, "public", image.src));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), image.src.split("/").at(-1).replace(/\.webp$/, ""));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, image.width);
      assert.equal(metadata.height, image.height);
    }
  }
});

test("retired catalogs and captures cannot silently return as a fallback", () => {
  for (const path of ["data/legacy-ports.json", "data/legacy-images.json", "src/assets/legacy"]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
});

test("source, config and tests never import files outside the landing", () => {
  const paths = ["astro.config.mjs", ...["src", "test"].flatMap((directory) => readdirSync(join(root, directory), { recursive: true }).filter((path) => /\.(?:astro|mjs|ts|css)$/.test(path)).map((path) => join(directory, path)))];
  for (const path of paths) {
    const source = read(path);
    assert.doesNotMatch(source, /(?:from|import)\s*["']@theme\//, path);
    const references = [
      ...[...source.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g)].map((match) => match[1]),
      ...[...source.matchAll(/new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g)].map((match) => match[1]),
      ...[...source.matchAll(/import\.meta\.glob[\s\S]*?\);/g)].flatMap(([glob]) => [...glob.matchAll(/["'](\.[^"']+)["']/g)].map((match) => match[1])),
    ];
    for (const reference of references) {
      assert.ok(!isAbsolute(reference) && !reference.startsWith("file:"), `${path}: absolute import ${reference}`);
      if (!reference.startsWith(".")) continue;
      const target = resolve(dirname(join(root, path)), reference);
      const local = relative(root, target);
      assert.ok(local !== ".." && !local.startsWith("../") && !local.startsWith("..\\") && !isAbsolute(local), `${path}: ${reference} escapes the landing`);
    }
  }
  const config = read("astro.config.mjs");
  assert.doesNotMatch(config, /@theme\/|fs:\s*\{|external:/, "no parent filesystem allowances or compiler externals");
  assert.doesNotMatch(read("src/lib/data.mjs").replace(/^\s*\/\/.*$/gm, ""), /existsSync|process\.cwd\(\)/, "capture selection uses the local manifest");
  const pkg = JSON.parse(read("package.json"));
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) assert.doesNotMatch(version, /^(?:file:|link:|workspace:)/, name);
  assert.ok(existsSync(join(root, "pnpm-lock.yaml")));
});

test("landing contains only website commands, not port-maintenance tooling", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.scripts).sort(), ["build", "deploy", "dev", "preview", "test"]);
  assert.equal(pkg.dependencies.ajv, undefined, "manifest validation belongs to core");
  for (const directory of ["scripts", "templates", "schemas"]) assert.equal(existsSync(join(root, directory)), false, directory);
  assert.doesNotMatch(read("src/lib/readme.mjs"), /validateReadmeTemplate|readmeImagePaths|readme-template/);
});
