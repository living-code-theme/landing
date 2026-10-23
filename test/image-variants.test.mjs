import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { prepareImages, r2Variants } from "../src/lib/prepare-images.mjs";
import { shotSources } from "../src/lib/shot-sources.mjs";
import manifest from "../data/image-variants.json" with { type: "json" };
import discovered from "../data/ports.json" with { type: "json" };
import { ports } from "../src/lib/ports.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const BASE = "https://assets.example.test/port-images/";
async function fixture(t, local = false) {
  const root = await mkdtemp(join(tmpdir(), "landing-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  await mkdir(join(root, "public/port-images"), { recursive: true });
  const bytes = await sharp({ create: { width: 1000, height: 625, channels: 3, background: "#00a692" } }).webp().toBuffer();
  const name = `${sha(bytes)}.webp`;
  const image = { src: `${local ? "/port-images/" : BASE}${name}`, width: 1000, height: 625 };
  const snapshot = { ports: [{ images: [image, image] }], assets: local ? { base: "/port-images/", files: {} } : { base: BASE, files: { [name]: bytes.length } } };
  await writeFile(join(root, "data/ports.json"), JSON.stringify(snapshot));
  if (local) await writeFile(join(root, "public/port-images", name), bytes);
  return { root, bytes, image, snapshot };
}
const read = async (root) => JSON.parse(await readFile(join(root, "data/image-variants.json"), "utf8"));

test("R2 mode: real resized, content-addressed variants are uploaded beside the originals, never written to Git", async (t) => {
  const f = await fixture(t);
  const uploads = new Map();
  let downloads = 0;
  const fetcher = async (url, options) => {
    assert.equal(url, f.image.src);
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error"); assert.ok(options.signal);
    downloads++;
    return new Response(f.bytes);
  };
  const upload = async (name, bytes) => uploads.set(name, bytes);
  assert.deepEqual(await prepareImages(f.root, { fetcher, upload }), { captures: 1, variants: 3, downloaded: 1, uploaded: 3 });
  const variants = (await read(f.root)).images[sha(f.bytes)].variants;
  assert.deepEqual(variants.map((image) => image.width), [240, 480, 960]);
  for (const image of variants) {
    const name = image.src.split("/").at(-1);
    assert.equal(image.src, `https://assets.example.test/image-variants/${name}`);
    const bytes = uploads.get(name);
    assert.equal(name, `${sha(bytes)}.webp`);
    const metadata = await sharp(bytes).metadata();
    assert.deepEqual([metadata.width, metadata.height, bytes.length], [image.width, image.height, image.bytes]);
  }
  assert.deepEqual(await readdir(join(f.root, "public")), ["port-images"], "no derivative binaries in the repository");
  // Unchanged: no network, no credentials.
  const before = await readFile(join(f.root, "data/image-variants.json"), "utf8");
  assert.deepEqual(await prepareImages(f.root, { fetcher, upload() { assert.fail("re-uploaded"); } }), { captures: 1, variants: 3, downloaded: 0, uploaded: 0 });
  assert.equal(downloads, 1);
  assert.equal(await readFile(join(f.root, "data/image-variants.json"), "utf8"), before);
});

test("R2 mode: credentials are required only when a new capture must be published", async (t) => {
  const f = await fixture(t);
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  for (const key of ["R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) delete process.env[key];
  await assert.rejects(prepareImages(f.root, { fetcher: async () => new Response(f.bytes) }), /configure R2_ACCOUNT_ID/);
  await assert.rejects(readFile(join(f.root, "data/image-variants.json")), { code: "ENOENT" }, "no manifest references unpublished variants");
});

test("R2 uploads are signed PUTs to the captures bucket with immutable caching and integrity metadata", async () => {
  const calls = [];
  const put = r2Variants({ accountId: "a".repeat(32), bucket: "living-code-captures", accessKeyId: "key", secretAccessKey: "secret",
    now: () => new Date("2026-01-02T03:04:05Z"), fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(null, { status: 200 }); } });
  const name = `${"b".repeat(64)}.webp`;
  await put(name, Buffer.from("x"));
  const [{ url, options }] = calls;
  assert.equal(url, `https://${"a".repeat(32)}.r2.cloudflarestorage.com/living-code-captures/image-variants/${name}`);
  assert.equal(options.method, "PUT"); assert.equal(options.redirect, "error");
  assert.equal(options.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(options.headers["content-type"], "image/webp");
  assert.match(options.headers.authorization, /^AWS4-HMAC-SHA256 Credential=key\/20260102\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-meta-sha256, Signature=[a-f0-9]{64}$/);
  await assert.rejects(put("../escape.webp", Buffer.from("x")), /Invalid variant name/);
  await assert.rejects(r2Variants({ fetchImpl: async () => new Response(null, { status: 403 }), accountId: "a".repeat(32), bucket: "b-b", accessKeyId: "k", secretAccessKey: "s" })(name, Buffer.from("x")), /R2 PUT failed \(403\)/);
});

test("Git mode: local captures produce local variants without network access, and obsolete ones are pruned", async (t) => {
  const f = await fixture(t, true);
  await prepareImages(f.root, { fetcher() { assert.fail("local capture fetched"); }, upload() { assert.fail("local mode uploaded"); } });
  const variants = (await read(f.root)).images[sha(f.bytes)].variants;
  assert.ok(variants.every((image) => /^\/image-variants\/[a-f0-9]{64}\.webp$/.test(image.src)));
  assert.equal((await readdir(join(f.root, "public/image-variants"))).length, 3);
  f.snapshot.ports = [];
  await writeFile(join(f.root, "data/ports.json"), JSON.stringify(f.snapshot));
  await prepareImages(f.root);
  assert.deepEqual(await readdir(join(f.root, "public/image-variants")), []);
});

test("bad hashes, oversized bodies, and failed downloads cannot publish a partial manifest", async (t) => {
  const f = await fixture(t);
  const before = '{"schemaVersion":1,"images":{}}\n';
  await writeFile(join(f.root, "data/image-variants.json"), before);
  const upload = async () => {};
  for (const body of [Buffer.alloc(f.bytes.length), Buffer.alloc(f.bytes.length + 1)]) {
    await assert.rejects(prepareImages(f.root, { fetcher: async () => new Response(body), upload }), /fingerprint|pinned size/);
    assert.equal(await readFile(join(f.root, "data/image-variants.json"), "utf8"), before);
  }
  await assert.rejects(prepareImages(f.root, { fetcher: async () => new Response(null, { status: 302 }), upload }), /unavailable/);
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

test("prepared screenshots reference variants beside their originals with distinct, truthful descriptors", (t) => {
  const shots = ports.flatMap((port) => port.images);
  const key = (shot) => shot.src.split("/").at(-1).slice(0, -5);
  const prepared = shots.filter((shot) => manifest.images[key(shot)]);
  // CI prepares (and commits) every capture before building; isolated fixtures may legitimately have none.
  if (prepared.length < shots.length) t.diagnostic(`${shots.length - prepared.length} unprepared captures use their originals`);
  const base = discovered.assets.base === "/port-images/" ? "/image-variants/" : new URL("../image-variants/", discovered.assets.base).href;
  for (const shot of prepared) {
    const entry = manifest.images[key(shot)];
    assert.equal(entry.width, shot.width); assert.equal(entry.height, shot.height);
    for (const image of entry.variants) {
      assert.ok(image.src.startsWith(base) && /^[a-f0-9]{64}\.webp$/.test(image.src.slice(base.length)), image.src);
      assert.ok(image.width < shot.width && image.height === Math.round(shot.height * image.width / shot.width) && image.bytes > 0);
    }
    for (const thumbnail of [false, true]) {
      const candidates = shotSources(shot, thumbnail).srcset.split(", ").map((item) => item.split(" "));
      assert.equal(new Set(candidates.map(([url]) => url)).size, candidates.length);
      if (thumbnail) assert.ok(candidates.every(([, width]) => parseInt(width) <= 480));
    }
  }
});
