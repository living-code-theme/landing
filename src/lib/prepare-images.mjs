// Website presentation assets, not port discovery. Only this explicit refresh may download pinned captures.
// Variants live next to their originals: in R2 (beside port-images/) when captures are external, otherwise in
// public/image-variants/ as Git-mode captures are. Git only ever receives the small JSON manifest in R2 mode.
import { createHash, createHmac } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const WIDTHS = [240, 480, 960, 1600];
const RECIPE = `webp-q82-${WIDTHS.join("-")}-sharp-${sharp.versions.sharp}`;
const MAX_BYTES = 20 * 1024 * 1024;
const LOCAL_BASE = "/image-variants/";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const filename = /^[a-f0-9]{64}\.webp$/;

async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function download(url, size, fetcher) {
  const response = await fetcher(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || Number(response.headers.get("content-length")) > size) throw new Error(`Capture unavailable or oversized: ${url}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > size) throw new Error(`Capture exceeds its pinned size: ${url}`);
    chunks.push(chunk);
  }
  if (length !== size) throw new Error(`Capture size mismatch: ${url}`);
  return Buffer.concat(chunks);
}

/** Immutable, content-addressed uploads to the captures bucket. Same signing scheme as core's capture store. */
export function r2Variants({ accountId, bucket, accessKeyId, secretAccessKey, fetchImpl = fetch, now = () => new Date() }) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? "") || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket ?? "") || !accessKeyId || !secretAccessKey) {
    throw new Error("New screenshot variants must be uploaded: configure R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
  }
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
  return async (name, bytes) => {
    if (!filename.test(name)) throw new Error("Invalid variant name");
    const date = now().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = date.slice(0, 8), scope = `${day}/auto/s3/aws4_request`, bodyHash = hash(bytes);
    const path = `/${bucket}/image-variants/${name}`;
    const headers = { host, "x-amz-date": date, "x-amz-content-sha256": bodyHash, "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-amz-meta-sha256": name.slice(0, 64) };
    const keys = Object.keys(headers).sort();
    const canonical = `PUT\n${path}\n\n${keys.map((key) => `${key}:${headers[key]}\n`).join("")}\n${keys.join(";")}\n${bodyHash}`;
    const signing = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), "auto"), "s3"), "aws4_request");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${keys.join(";")}, Signature=${hmac(signing, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).toString("hex")}`;
    const response = await fetchImpl(`https://${host}${path}`, { method: "PUT", headers, body: bytes, redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`R2 PUT failed (${response.status}): ${name}`);
  };
}

const envUpload = () => r2Variants({
  accountId: process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID, bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
});

/**
 * Unchanged captures reuse the manifest without network access or credentials. New captures are downloaded,
 * verified, resized and uploaded before the manifest can reference them; the manifest is written atomically last.
 */
export async function prepareImages(root, { fetcher = fetch, upload } = {}) {
  const snapshot = JSON.parse(await readFile(join(root, "data/ports.json"), "utf8"));
  const manifestPath = join(root, "data/image-variants.json");
  const directory = join(root, "public/image-variants");
  const previous = await optionalJson(manifestPath);
  const remoteBase = snapshot.assets?.base && snapshot.assets.base !== "/port-images/" ? snapshot.assets.base : null;
  if (remoteBase) {
    const url = new URL(remoteBase);
    if (url.protocol !== "https:" || url.username || url.password || !url.pathname.endsWith("/port-images/")) throw new Error(`Unsupported capture origin: ${remoteBase}`);
  }
  const base = remoteBase ? new URL("../image-variants/", remoteBase).href : LOCAL_BASE;
  const sources = new Map();
  for (const image of snapshot.ports.flatMap((port) => port.images ?? [])) {
    const local = image.src.startsWith("/port-images/");
    const prefix = local ? "/port-images/" : remoteBase;
    const name = prefix && image.src.startsWith(prefix) ? image.src.slice(prefix.length) : "";
    if (!filename.test(name)) throw new Error(`Unpinned capture: ${image.src}`);
    if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > 40_000_000) throw new Error("Invalid capture dimensions");
    const key = name.slice(0, -5);
    const known = sources.get(key);
    if (known && (known.width !== image.width || known.height !== image.height)) throw new Error("Conflicting capture dimensions");
    sources.set(key, { ...image, local, name });
  }
  if (!remoteBase) await mkdir(directory, { recursive: true });
  let put = upload;
  const store = async (name, bytes) => {
    if (!remoteBase) return writeFile(join(directory, name), bytes);
    put ??= envUpload(); // Credentials are only required when something new must be published.
    return put(name, bytes);
  };
  const reusable = async (cached, image, widths) => {
    if (!cached || cached.width !== image.width || cached.height !== image.height || cached.variants.length !== widths.length) return false;
    if (!cached.variants.every((variant, i) => variant.width === widths[i] && variant.src.startsWith(base) && filename.test(variant.src.slice(base.length)))) return false;
    // Remote variants are uploaded before their manifest entry is written and are immutable by content address.
    if (remoteBase) return true;
    for (const variant of cached.variants) {
      try {
        const path = join(directory, variant.src.slice(base.length));
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size !== variant.bytes || hash(await readFile(path)) !== variant.src.slice(-69, -5)) return false;
      } catch (error) { if (error.code === "ENOENT") return false; throw error; }
    }
    return true;
  };
  const images = {};
  const jobs = [...sources].sort(([a], [b]) => a.localeCompare(b));
  let index = 0, downloaded = 0, uploaded = 0;
  const work = async () => {
    while (index < jobs.length) {
      const [key, image] = jobs[index++];
      const widths = WIDTHS.filter((width) => width < image.width);
      const cached = previous?.recipe === RECIPE && previous.images?.[key];
      if (await reusable(cached, image, widths)) { images[key] = cached; continue; }
      let bytes;
      if (image.local) {
        const path = join(root, "public/port-images", image.name);
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error("Invalid local capture");
        bytes = await readFile(path);
      } else {
        const size = snapshot.assets.files?.[image.name];
        if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) throw new Error("Invalid pinned capture size");
        bytes = await download(image.src, size, fetcher);
        downloaded++;
      }
      if (hash(bytes) !== key) throw new Error(`Capture fingerprint mismatch: ${image.src}`);
      const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
      if (metadata.format !== "webp" || metadata.width !== image.width || metadata.height !== image.height || (metadata.pages ?? 1) !== 1) throw new Error(`Capture dimensions/format mismatch: ${image.src}`);
      const variants = [];
      for (const width of widths) {
        const result = await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        const name = `${hash(result.data)}.webp`;
        await store(name, result.data);
        if (remoteBase) uploaded++;
        variants.push({ src: `${base}${name}`, width: result.info.width, height: result.info.height, bytes: result.data.length });
      }
      images[key] = { width: image.width, height: image.height, variants };
    }
  };
  // Wait for all workers even on failure, so callers never race outstanding writes or uploads.
  const outcomes = await Promise.allSettled(Array.from({ length: 4 }, work));
  const failed = outcomes.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  const manifest = { schemaVersion: 1, recipe: RECIPE, images: Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b))) };
  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);
  const keep = new Set(Object.values(images).flatMap((image) => image.variants.map((variant) => variant.src.split("/").at(-1))));
  // Local derivatives are pruned; remote objects are immutable and never deleted here (old deploys may use them).
  try {
    for (const name of await readdir(directory)) if (filename.test(name) && (remoteBase || !keep.has(name))) await rm(join(directory, name));
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return { captures: jobs.length, variants: keep.size, downloaded, uploaded };
}
