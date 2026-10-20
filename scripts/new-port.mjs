#!/usr/bin/env node
// Initialize once. Never overwrite an existing port's authored content.
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { validateManifest } from "./port-manifest.mjs";
import { FLAVOR_LABELS, PORT_FLAVORS, renderPortReadme } from "./readme-template.mjs";

// Editors fetch the schema from the website for port.json autocomplete; ports need no local copy.
export const PORT_SCHEMA_URL = "https://living-code.dev/port.schema.json";

export async function newPort(directory, manifest) {
  validateManifest(manifest, basename(resolve(directory)));
  const existing = await readdir(directory).catch((error) => { if (error.code !== "ENOENT") throw error; return []; });
  if (existing.length) throw new Error("Choose an empty output directory; existing port documentation must not be overwritten");
  const readme = renderPortReadme(manifest, { repository: `https://github.com/living-code-theme/${basename(resolve(directory))}` });
  await mkdir(join(directory, "images"), { recursive: true });
  await cp(new URL("../templates/port/LICENSE", import.meta.url), join(directory, "LICENSE"));
  await writeFile(join(directory, "port.json"), JSON.stringify({ $schema: PORT_SCHEMA_URL, ...manifest }, null, 2) + "\n");
  await writeFile(join(directory, "README.md"), readme);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    name: { type: "string" }, group: { type: "string" }, emoji: { type: "string" }, slug: { type: "string" },
    flavors: { type: "string", default: PORT_FLAVORS.join(",") }, "no-images": { type: "boolean" },
  } });
  if (positionals.length !== 1 || !values.name || !values.group) throw new Error('Usage: pnpm new:port <empty-directory> --name "Application" --group "Editors" [--emoji "📝"] [--slug name] [--flavors night,paper] [--no-images]');
  const directory = resolve(positionals[0]);
  const flavors = values.flavors.split(",").map((id) => id.trim());
  const manifest = {
    schemaVersion: 1, name: values.name, group: values.group, ...(values.emoji ? { emoji: values.emoji } : {}), ...(values.slug ? { slug: values.slug } : {}), flavors,
    images: values["no-images"] ? [] : flavors.map((flavor) => ({ flavor, path: `images/${flavor}.png`, alt: `${values.name} running Living Code ${FLAVOR_LABELS[flavor]?.name ?? flavor}` })),
  };
  await newPort(directory, manifest);
  console.log(`Port scaffold created at ${directory}. Fill README placeholders, add real captures and theme files, then review before publishing.`);
}
