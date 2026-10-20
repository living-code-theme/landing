#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { githubPorts, LIMITS } from "./github-ports.mjs";
import { FLAVORS, repositoryPath, validateManifest } from "./port-manifest.mjs";
import { readmeImagePaths, validateReadmeTemplate } from "../src/lib/readme.mjs";

export const ORGANIZATION = "living-code-theme";
export const emptySnapshot = () => ({ schemaVersion: 1, organization: ORGANIZATION, migratedSlugs: [], ports: [] });
const text = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

async function portAtRevision(client, repo, previous, refresh) {
  const revision = await client.revision(repo);
  if (!refresh && previous?.revision === revision) return { port: previous, assets: new Map() };
  const descriptor = await client.file(repo, revision, "port.json", LIMITS.manifest);
  if (descriptor === null) return null; // Removing port.json is an explicit opt-out.
  const meta = validateManifest(JSON.parse(text(descriptor)), repo.name);
  if (previous && previous.id !== meta.slug) throw new Error("Changing a published slug requires an explicit route migration");
  const source = await client.file(repo, revision, "README.md", LIMITS.readme);
  if (!source || !text(source).trim()) throw new Error("A non-empty root README.md is required");
  const readme = text(source);
  validateReadmeTemplate(readme, meta);
  const paths = new Set([...meta.images.map((i) => i.path), ...readmeImagePaths(readme).filter((p) => /\.(png|jpe?g|webp)$/i.test(p))]);
  if (paths.size > 24) throw new Error("At most 24 local README and gallery images are allowed");
  const assets = new Map();
  const images = {};
  for (const path of paths) {
    repositoryPath(path);
    const bytes = await client.file(repo, revision, path, LIMITS.image);
    if (!bytes) throw new Error(`Missing image: ${path}`);
    const input = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
    const metadata = await input.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width > 16_384 || metadata.height > 16_384) throw new Error(`Invalid or oversized raster image: ${path}`);
    // Decode before accepting the update. Corrupt images cannot break a later Astro build.
    const { data, info } = await input.rotate().resize({ width: 2560, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    const name = `${digest(data)}.webp`;
    assets.set(name, data);
    images[path] = { src: `/port-images/${name}`, width: info.width, height: info.height };
  }
  const files = meta.files ?? [];
  for (const path of files) {
    if (await client.file(repo, revision, path, 1024 * 1024) === null) throw new Error(`Missing listed file: ${path}`);
  }
  return {
    port: {
      id: meta.slug, name: meta.name, group: meta.group.trim(),
      description: meta.description ?? `Living Code color scheme for ${meta.name}. Installation instructions and real application screenshots.`,
      homepage: meta.homepage ?? null, quick: meta.quick ?? "See README installation instructions",
      aliases: [...new Set([repo.name, ...(meta.aliases ?? [])])], icon: meta.icon ?? null, emoji: meta.emoji ?? null,
      flavors: FLAVORS.filter((flavor) => meta.flavors.includes(flavor)), files, readme,
      repository: `https://github.com/${repo.full_name}`, repositoryName: repo.full_name,
      revision, readmeUrl: `https://github.com/${repo.full_name}/blob/${revision}/README.md`,
      fileUrls: Object.fromEntries(files.map((path) => [path, `https://github.com/${repo.full_name}/blob/${revision}/${encodePath(path)}`])),
      images: meta.images.map((image) => ({ flavor: image.flavor, alt: image.alt, ...images[image.path] })),
      readmeImages: images,
    }, assets,
  };
}

/** All-or-nothing discovery of each port. A complete listing is required before any removals. */
export async function discoverPorts(client, previous = emptySnapshot(), { organization = ORGANIZATION, refresh = false } = {}) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(organization)) throw new Error("Invalid organization");
  if (previous.schemaVersion !== 1 || previous.organization !== organization || !Array.isArray(previous.ports) || !Array.isArray(previous.migratedSlugs)) throw new Error("Unsupported or mismatched previous snapshot");
  // If this fails (including a failure on page 2), nothing is written and no port disappears.
  const repositories = await client.repositories(organization);
  const previousByRepo = new Map(previous.ports.map((p) => [p.repositoryName.toLowerCase(), p]));
  const candidates = [];
  const warnings = [];
  const assets = new Map();
  for (const repo of repositories) {
    if (repo.private || repo.archived || repo.disabled) continue;
    if (!repo.full_name || repo.full_name.toLowerCase() !== `${organization}/${repo.name}`.toLowerCase() || !/^[A-Za-z0-9_.-]+$/.test(repo.name)) throw new Error("Unexpected repository in GitHub listing");
    const old = previousByRepo.get(repo.full_name.toLowerCase());
    try {
      const result = await portAtRevision(client, repo, old, refresh);
      if (result) candidates.push(result);
    } catch (error) {
      // A rate-limit/authentication failure is global, not evidence that a port has gone away.
      if ([401, 403, 429].includes(error.status)) throw error;
      warnings.push(`${repo.full_name}: ${error.message}${old ? "; keeping last working snapshot" : "; not listed"}`);
      if (old) candidates.push({ port: old, assets: new Map() });
    }
  }
  const bySlug = new Map();
  for (const candidate of candidates) {
    const list = bySlug.get(candidate.port.id) ?? [];
    list.push(candidate);
    bySlug.set(candidate.port.id, list);
  }
  const ports = [];
  for (const [slug, matches] of bySlug) {
    if (matches.length > 1) {
      warnings.push(`Duplicate slug ${slug}: ${matches.map((m) => m.port.repositoryName).join(", ")}; no conflicting updates accepted`);
      const old = previous.ports.find((p) => p.id === slug);
      if (old) ports.push(old);
      continue;
    }
    ports.push(matches[0].port);
    for (const [name, bytes] of matches[0].assets) assets.set(name, bytes);
  }
  ports.sort((a, b) => a.group.localeCompare(b.group, "en") || a.id.localeCompare(b.id, "en"));
  return {
    snapshot: {
      schemaVersion: 1, organization,
      // Once a repository takes ownership, archiving/removing it must not resurrect the legacy entry.
      migratedSlugs: [...new Set([...previous.migratedSlugs, ...previous.ports.map((p) => p.id), ...ports.map((p) => p.id)])].sort(),
      ports,
    },
    assets, warnings,
  };
}

async function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

/** Persist assets first, then atomically replace the snapshot. Never delete existing captures. */
export async function saveDiscovery(directory, { snapshot, assets }) {
  await mkdir(join(directory, "data"), { recursive: true });
  await mkdir(join(directory, "public/port-images"), { recursive: true });
  for (const [name, bytes] of assets) {
    if (!/^[a-f0-9]{64}\.webp$/.test(name)) throw new Error("Invalid generated asset name");
    const path = join(directory, "public/port-images", name);
    const current = await readFile(path).catch((e) => { if (e.code !== "ENOENT") throw e; return null; });
    if (!current?.equals(bytes)) await atomicWrite(path, bytes);
  }
  const path = join(directory, "data/ports.json");
  const content = JSON.stringify(snapshot, null, 2) + "\n";
  if (await readFile(path, "utf8").catch((e) => { if (e.code !== "ENOENT") throw e; return null; }) === content) return false;
  await atomicWrite(path, content);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--dry-run", "--refresh"].includes(arg))) throw new Error("Usage: pnpm sync:ports [--dry-run] [--refresh]");
  const previous = await readFile(join(directory, "data/ports.json"), "utf8").then(JSON.parse).catch((e) => { if (e.code !== "ENOENT") throw e; return emptySnapshot(); });
  const result = await discoverPorts(githubPorts(), previous, { refresh: args.includes("--refresh") });
  for (const warning of result.warnings) console.warn(warning);
  const changed = args.includes("--dry-run") ? JSON.stringify(previous) !== JSON.stringify(result.snapshot) : await saveDiscovery(directory, result);
  console.log(`${result.snapshot.ports.length} discovered ports; ${result.warnings.length} warnings; ${changed ? "snapshot changed" : "no changes"}${args.includes("--dry-run") ? " (dry run)" : ""}`);
}
