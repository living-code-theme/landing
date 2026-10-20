#!/usr/bin/env node
// Build a draft port in an isolated landing copy. Never modify the production catalog or fetch GitHub.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { LIMITS } from "./github-ports.mjs";
import { repositoryPath, validateManifest } from "./port-manifest.mjs";
import { discoverPorts, saveDiscovery } from "./sync-ports.mjs";
import { readmeImagePaths } from "../src/lib/readme.mjs";

/** Freeze local inputs, then use the same validation/image pipeline as real discovery. */
export async function localPortSnapshot(directory, previous) {
  const root = await realpath(directory);
  const name = basename(resolve(directory));
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("The local directory name must be a valid repository name");
  const full_name = `${previous.organization}/${name}`;
  const read = async (path, limit) => {
    repositoryPath(path);
    const actual = await realpath(join(root, path));
    const within = relative(root, actual);
    if (isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`)) throw new Error(`Local port path escapes its repository: ${path}`);
    const info = await stat(actual);
    if (!info.isFile() || info.size > limit) throw new Error(`Invalid or oversized local port file: ${path}`);
    const bytes = await readFile(actual);
    if (bytes.length > limit) throw new Error(`Oversized local port file: ${path}`);
    return bytes;
  };
  const metadata = await read("port.json", LIMITS.manifest);
  const manifest = validateManifest(JSON.parse(metadata), name);
  const readme = await read("README.md", LIMITS.readme);
  const images = new Set([...manifest.images.map((image) => image.path), ...readmeImagePaths(readme.toString("utf8")).filter((path) => /\.(png|jpe?g|webp)$/i.test(path))]);
  if (images.size > 24) throw new Error("At most 24 local README and gallery images are allowed");
  const paths = new Map([...(manifest.files ?? []).map((path) => [path, 1024 * 1024]), ...[...images].map((path) => [path, LIMITS.image])]);
  const inputs = new Map([["port.json", metadata], ["README.md", readme]]);
  for (const [path, limit] of paths) if (!inputs.has(path)) inputs.set(path, await read(path, limit));
  // This is explicitly a local content fingerprint, NOT a published Git commit.
  const hash = createHash("sha1");
  for (const [path, bytes] of [...inputs].sort(([a], [b]) => a.localeCompare(b))) hash.update(JSON.stringify([path, bytes.length])).update(bytes);
  const revision = hash.digest("hex");
  const existing = previous.ports.filter((port) => port.repositoryName.toLowerCase() !== full_name.toLowerCase());
  const client = {
    repositories: async () => [...existing.map((port) => ({ name: port.repositoryName.split("/")[1], full_name: port.repositoryName })), { name, full_name }],
    revision: async (repo) => repo.full_name === full_name ? revision : existing.find((port) => port.repositoryName === repo.full_name).revision,
    file: async (repo, commit, path, limit) => {
      if (repo.full_name !== full_name || commit !== revision) throw new Error("Unexpected local preview request");
      const bytes = inputs.get(path) ?? null;
      if (bytes && bytes.length > limit) throw new Error(`Oversized local port file: ${path}`);
      return bytes;
    },
  };
  const result = await discoverPorts(client, previous, { organization: previous.organization });
  if (result.warnings.length) throw new Error(result.warnings.join("\n"));
  return { ...result, slug: manifest.slug, revision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: "string", default: "4411" } } });
  if (positionals.length !== 1 || !/^\d+$/.test(values.port) || Number(values.port) < 1024 || Number(values.port) > 65535) throw new Error("Usage: pnpm preview:port <local-port-directory> [--port 4411]");
  const source = fileURLToPath(new URL("../", import.meta.url));
  const previous = JSON.parse(await readFile(join(source, "data/ports.json"), "utf8"));
  const result = await localPortSnapshot(resolve(positionals[0]), previous);
  const directory = await mkdtemp(join(tmpdir(), "living-code-port-preview-"));
  const excluded = new Set(["node_modules", "dist", ".astro", ".git", ".wrangler"]);
  await cp(source, directory, { recursive: true, filter: async (path) => {
    const parts = relative(source, path).split(sep);
    if (parts.some((part) => excluded.has(part) || part.startsWith(".env") || part.startsWith(".dev.vars"))) return false;
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Preview inputs cannot depend on symlinks: ${path}`);
    return true;
  } });
  await saveDiscovery(directory, result);
  const run = (args) => {
    const child = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
      cwd: directory, env: { ...process.env, INIT_CWD: directory, PWD: directory }, stdio: "inherit", shell: process.platform === "win32",
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Preview ${args[0]} failed (${child.signal ?? child.status})`);
  };
  run(["install", "--frozen-lockfile", "--prefer-offline"]);
  run(["build"]);
  const page = join(directory, "dist/ports", result.slug, "index.html");
  const banner = '<aside role="status" data-local-port-preview class="shell" style="padding-block:12px;background:var(--lc-surface0);color:var(--lc-fg);border-bottom:1px solid var(--lc-border);font-size:14px">Local port preview — not published. GitHub and download links require publication.</aside>';
  await writeFile(page, (await readFile(page, "utf8")).replace("<article>", `<article>${banner}`));
  run(["preview", "--host", "127.0.0.1", "--port", values.port]);
  console.log(`\nLocal preview: http://127.0.0.1:${values.port}/ports/${result.slug}/`);
  console.log(`Isolated copy: ${directory}\nThe production catalog is unchanged. Source links use a local content fingerprint, not a published Git commit.`);
  console.log(`Stop: pnpm --dir ${directory} exec astro preview stop\nRe-run preview:port after editing the port.`);
}
