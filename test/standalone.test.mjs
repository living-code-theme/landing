import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import snapshot from "../data/theme.json" with { type: "json" };
import captures from "../data/legacy-images.json" with { type: "json" };
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

test("legacy captures are real local PNGs and the index does not point outside the landing", () => {
  assert.equal(captures.schemaVersion, 1);
  for (const [port, images] of Object.entries(captures.images)) {
    assert.equal(new Set(images.map((image) => image.flavor)).size, images.length, port);
    for (const image of images) {
      assert.match(image.src, /^(shots|stores)\/[\w-]+\.png$/);
      const bytes = readFileSync(join(root, "src/assets/legacy", image.src));
      assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), image.src);
    }
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
