// Website presentation assets, not port discovery. Only this explicit refresh may download pinned captures.
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const WIDTHS = [240, 480, 960, 1600];
const RECIPE = `webp-q82-${WIDTHS.join("-")}-sharp-${sharp.versions.sharp}`;
const MAX_BYTES = 20 * 1024 * 1024;
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

/** Refresh atomically; unchanged inputs reuse verified local derivatives without any network access. */
export async function prepareImages(root, { fetcher = fetch } = {}) {
  const snapshot = JSON.parse(await readFile(join(root, "data/ports.json"), "utf8"));
  const manifestPath = join(root, "data/image-variants.json");
  const directory = join(root, "public/image-variants");
  const previous = await optionalJson(manifestPath);
  const sources = new Map();
  for (const image of snapshot.ports.flatMap((port) => port.images ?? [])) {
    const local = image.src.startsWith("/port-images/");
    const base = local ? "/port-images/" : snapshot.assets?.base;
    const name = base && image.src.startsWith(base) ? image.src.slice(base.length) : "";
    if (!filename.test(name) || (!local && (new URL(base).protocol !== "https:" || new URL(base).username || new URL(base).password))) throw new Error(`Unpinned capture: ${image.src}`);
    if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > 40_000_000) throw new Error("Invalid capture dimensions");
    const key = name.slice(0, -5);
    const known = sources.get(key);
    if (known && (known.width !== image.width || known.height !== image.height)) throw new Error("Conflicting capture dimensions");
    sources.set(key, { ...image, local, name });
  }
  await mkdir(directory, { recursive: true });
  const images = {};
  const jobs = [...sources].sort(([a], [b]) => a.localeCompare(b));
  let index = 0, downloaded = 0;
  const work = async () => {
    while (index < jobs.length) {
      const [key, image] = jobs[index++];
      const widths = WIDTHS.filter((width) => width < image.width);
      const cached = previous?.recipe === RECIPE && previous.images?.[key];
      if (cached && cached.width === image.width && cached.height === image.height && cached.variants.length === widths.length) {
        const valid = await Promise.all(cached.variants.map(async (variant, i) => {
          if (variant.width !== widths[i] || !/^\/image-variants\/[a-f0-9]{64}\.webp$/.test(variant.src)) return false;
          try {
            const path = join(root, "public", variant.src);
            const info = await lstat(path);
            if (!info.isFile() || info.isSymbolicLink() || info.size !== variant.bytes) return false;
            return hash(await readFile(path)) === variant.src.split("/").at(-1).slice(0, -5);
          } catch (error) { if (error.code === "ENOENT") return false; throw error; }
        }));
        if (valid.every(Boolean)) { images[key] = cached; continue; }
      }
      let bytes;
      if (image.local) {
        const path = join(root, "public/port-images", image.name);
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error("Invalid local capture");
        bytes = await readFile(path);
      } else {
        const size = snapshot.assets.files[image.name];
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
        await writeFile(join(directory, name), result.data);
        variants.push({ src: `/image-variants/${name}`, width: result.info.width, height: result.info.height, bytes: result.data.length });
      }
      images[key] = { width: image.width, height: image.height, variants };
    }
  };
  // Wait for all workers even on failure, so callers never race outstanding filesystem writes.
  const outcomes = await Promise.allSettled(Array.from({ length: 4 }, work));
  const failed = outcomes.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  const manifest = { schemaVersion: 1, recipe: RECIPE, images: Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b))) };
  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);
  const keep = new Set(Object.values(images).flatMap((image) => image.variants.map((variant) => variant.src.split("/").at(-1))));
  for (const name of await readdir(directory)) if (filename.test(name) && !keep.has(name)) await rm(join(directory, name));
  return { captures: jobs.length, variants: keep.size, downloaded };
}
