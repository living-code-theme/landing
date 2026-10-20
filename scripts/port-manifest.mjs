import { readFileSync } from "node:fs";
import Ajv from "ajv";

const schema = JSON.parse(readFileSync(new URL("../public/port.schema.json", import.meta.url), "utf8"));
const validate = new Ajv({ allErrors: true }).compile(schema);
const RESERVED = new Set(["index", "new", "search", "favicon", "404"]);
export const FLAVORS = ["night", "frost", "paper", "signal"];

/** A relative repository file, never a URL, traversal, encoded path or filesystem escape. */
export function repositoryPath(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-][A-Za-z0-9_./ -]*$/.test(value) || value.length > 240 || value.split("/").some((s) => !s || s === "." || s === "..")) {
    throw new Error(`Invalid repository path: ${JSON.stringify(value)}`);
  }
  return value;
}

export function validateManifest(value, repositoryName) {
  if (!validate(value)) throw new Error(`port.json: ${validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ")}`);
  const manifest = { ...value, slug: value.slug ?? repositoryName };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug) || manifest.slug.length > 64 || RESERVED.has(manifest.slug)) throw new Error("port.json: invalid or reserved slug");
  if (!manifest.name.trim() || !manifest.group.trim() || (manifest.quick !== undefined && !manifest.quick.trim()) || (manifest.aliases ?? []).some((alias) => !alias.trim())) throw new Error("port.json: text fields cannot be blank");
  if (manifest.emoji !== undefined && ([...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(manifest.emoji)].length !== 1 || !/\p{Extended_Pictographic}|^\p{Regional_Indicator}{2}$|^[0-9#*]\uFE0F?\u20E3$/u.test(manifest.emoji))) throw new Error("port.json: emoji must be a single emoji, not text or multiple emojis");
  if (manifest.description !== undefined && manifest.description.trim().length < 40) throw new Error("port.json: description must contain at least 40 characters");
  if (manifest.homepage) {
    const url = new URL(manifest.homepage);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("port.json: homepage must be an HTTPS URL without credentials");
  }
  for (const file of manifest.files ?? []) repositoryPath(file);
  const seen = new Set();
  for (const image of manifest.images) {
    repositoryPath(image.path);
    if (!/\.(png|jpe?g|webp)$/i.test(image.path)) throw new Error("port.json: screenshots must be PNG, JPEG or WebP");
    if (!manifest.flavors.includes(image.flavor)) throw new Error(`port.json: screenshot flavor ${image.flavor} is not shipped`);
    if (seen.has(image.flavor)) throw new Error(`port.json: duplicate ${image.flavor} screenshot`);
    if (!image.alt.trim()) throw new Error("port.json: screenshot alt text cannot be blank");
    seen.add(image.flavor);
  }
  return manifest;
}
