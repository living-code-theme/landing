#!/usr/bin/env node
// Exercise the same checkout layout as the future landing repository, without core beside it.
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.slice(2).some((arg) => arg !== "--keep")) throw new Error("Usage: pnpm test:standalone [--keep]");
const keep = process.argv.includes("--keep");
const source = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "living-code-landing-"));
const directory = join(temporary, "landing");
const excluded = new Set(["node_modules", "dist", ".astro", ".git"]);
const env = { ...process.env, CI: "true", INIT_CWD: directory, PWD: directory };
delete env.NODE_PATH;
const run = (args) => {
  console.log(`\nStandalone: pnpm ${args.join(" ")}`);
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, { cwd: directory, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Standalone ${args[0]} failed (${result.signal ?? result.status})`);
};

try {
  await cp(source, directory, { recursive: true, filter: async (path) => {
    if (relative(source, path).split(sep).some((part) => excluded.has(part))) return false;
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Standalone inputs cannot depend on symlinks: ${path}`);
    return true;
  } });
  console.log(`Isolated checkout: ${directory}`);
  run(["install", "--frozen-lockfile", "--prefer-offline"]);
  run(["build"]);
  run(["test"]);
  console.log("\nVerified: landing installs, builds and tests without the parent repository.");
} finally {
  if (keep) console.log(`Kept isolated checkout: ${directory}`);
  else await rm(temporary, { recursive: true, force: true });
}
