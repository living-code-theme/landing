import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { prepareImages } from "../src/lib/prepare-images.mjs";
import { shotSources } from "../src/lib/shot-sources.mjs";
import manifest from "../data/image-variants.json" with { type: "json" };
import { ports } from "../src/lib/ports.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t, local = false) {
  const root = await mkdtemp(join(tmpdir(), "landing-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  await mkdir(join(root, "public/port-images"), { recursive: true });
  const bytes = await sharp({ create: { width: 1000, height: 625, channels: 3, background: "#00a692" } }).webp().toBuffer();
  const name = `${sha(bytes)}.webp`;
  const base = "https://assets.example.test/port-images/";
  const image = { src: `${local ? "/port-images/" : base}${name}`, width: 1000, height: 625 };
  const snapshot = { ports: [{ images: [image, image] }], assets: { base, files: { [name]: bytes.length } } };
  await writeFile(join(root, "data/ports.json"), JSON.stringify(snapshot));
  if (local) await writeFile(join(root, "public/port-images", name), bytes);
  return { root, bytes, image, snapshot };
}

test("explicit refresh produces actual resized, content-addressed images; unchanged refresh is offline", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const fetcher = async (url, options) => {
    assert.equal(url, f.image.src);
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    calls++;
    return new Response(f.bytes);
  };
  assert.deepEqual(await prepareImages(f.root, { fetcher }), { captures: 1, variants: 3, downloaded: 1 });
  const result = JSON.parse(await readFile(join(f.root, "data/image-variants.json"), "utf8"));
  const variants = result.images[sha(f.bytes)].variants;
  assert.deepEqual(variants.map((image) => image.width), [240, 480, 960]);
  for (const image of variants) {
    const bytes = await readFile(join(f.root, "public", image.src));
    assert.equal(image.src, `/image-variants/${sha(bytes)}.webp`);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, image.width); assert.equal(metadata.height, image.height);
    assert.equal(bytes.length, image.bytes);
  }
  const before = await readFile(join(f.root, "data/image-variants.json"), "utf8");
  await prepareImages(f.root, { fetcher });
  assert.equal(calls, 1);
  assert.equal(await readFile(join(f.root, "data/image-variants.json"), "utf8"), before);
  await rm(join(f.root, "public", variants[0].src));
  await prepareImages(f.root, { fetcher });
  assert.equal(calls, 2, "missing derivative is regenerated, not silently published");
});

test("local captures are resized without network access", async (t) => {
  const f = await fixture(t, true);
  await prepareImages(f.root, { fetcher() { assert.fail("local capture fetched"); } });
  assert.equal((await readdir(join(f.root, "public/image-variants"))).length, 3);
});

test("bad hashes, oversized bodies, and failed downloads cannot publish a partial manifest", async (t) => {
  const f = await fixture(t);
  const before = '{"schemaVersion":1,"images":{}}\n';
  await writeFile(join(f.root, "data/image-variants.json"), before);
  for (const body of [Buffer.alloc(f.bytes.length), Buffer.alloc(f.bytes.length + 1)]) {
    await assert.rejects(prepareImages(f.root, { fetcher: async () => new Response(body) }), /fingerprint|pinned size/);
    assert.equal(await readFile(join(f.root, "data/image-variants.json"), "utf8"), before);
  }
  await assert.rejects(prepareImages(f.root, { fetcher: async () => new Response(null, { status: 302 }) }), /unavailable/);
});

test("unreferenced derivatives are pruned only after a successful publication", async (t) => {
  const f = await fixture(t, true);
  await prepareImages(f.root);
  f.snapshot.ports = [];
  await writeFile(join(f.root, "data/ports.json"), JSON.stringify(f.snapshot));
  await prepareImages(f.root);
  assert.deepEqual(await readdir(join(f.root, "public/image-variants")), []);
});

test("unprepared previews and synthetic fixtures build offline without fake responsive widths", () => {
  for (const src of [`/port-images/${"0".repeat(64)}.webp`, `https://synthetic-assets.invalid/port-images/${"1".repeat(64)}.webp`]) {
    const shot = { src, width: 2560, height: 1600 };
    assert.deepEqual(shotSources(shot, true), { src, srcset: `${src} 2560w` });
  }
});

test("every publication path prepares variants before building", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.deploy, /^pnpm images:prepare && pnpm build && /);
  const workflow = readFileSync(new URL("../.github/workflows/sync-ports.yml", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("run: pnpm images:prepare") < workflow.indexOf("run: pnpm build"));
});

test("prepared screenshots have distinct variants with truthful width descriptors", async (t) => {
  const checked = new Set();
  const shots = ports.flatMap((port) => port.images);
  const prepared = shots.filter((shot) => manifest.images[shot.src.split("/").at(-1).slice(0, -5)]);
  // CI prepares (and commits) every capture before building; isolated fixtures may legitimately have none.
  if (prepared.length < shots.length) t.diagnostic(`${shots.length - prepared.length} unprepared captures use their originals`);
  for (const shot of prepared) {
    for (const thumbnail of [false, true]) {
      const sources = shotSources(shot, thumbnail);
      const candidates = sources.srcset.split(", ").map((item) => item.split(" "));
      assert.equal(new Set(candidates.map(([url]) => url)).size, candidates.length);
      if (thumbnail) assert.ok(candidates.every(([, width]) => parseInt(width) <= 480));
    }
    const key = shot.src.split("/").at(-1).slice(0, -5);
    if (checked.has(key)) continue;
    checked.add(key);
    for (const image of manifest.images[key].variants) {
      const bytes = await readFile(new URL(`../public${image.src}`, import.meta.url));
      assert.equal(image.src, `/image-variants/${sha(bytes)}.webp`);
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, image.width);
      assert.equal(metadata.height, image.height);
      assert.equal(bytes.length, image.bytes);
    }
  }
});
