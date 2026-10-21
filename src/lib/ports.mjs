// Index-only imports keep the catalog independent of each port's documentation.
import snapshot from "../../data/ports.json" with { type: "json" };
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

// Astro uses lazy, raw imports; plain Node tests read the same local bytes. Neither path uses GitHub or core.
const documents = import.meta.env?.SSR ? import.meta.glob("../../data/ports/*.json", { query: "?raw", import: "default" }) : null;

export function portCatalog(snapshot) {
  if (![1, 2].includes(snapshot.schemaVersion) || !Array.isArray(snapshot.ports)) throw new Error("Unsupported port snapshot schema");
  const ports = snapshot.ports;
  if (new Set(ports.map((p) => p.id)).size !== ports.length) throw new Error("Duplicate slug in port snapshot");
  if (snapshot.schemaVersion === 2 && ports.some((p) => "readme" in p || "guide" in p || "files" in p)) throw new Error("Port index must not contain documentation");
  const groups = [], byGroup = new Map();
  for (const port of ports) {
    const key = port.group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let group = byGroup.get(key);
    if (!group) { group = { title: port.group, ports: [] }; byGroup.set(key, group); groups.push(group); }
    group.ports.push(port);
  }
  return { ports, groups };
}
export const { ports, groups } = portCatalog(snapshot);

export function decodePortDocument(entry, raw) {
  const match = /^ports\/([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-f0-9]{64})\.json$/.exec(entry.content ?? "");
  if (!match || match[1] !== entry.id) throw new Error("Invalid port document reference");
  if (Buffer.byteLength(raw) > 512 * 1024 || createHash("sha256").update(raw).digest("hex") !== match[2]) throw new Error(`Port document fingerprint mismatch: ${entry.id}`);
  const body = JSON.parse(raw);
  if (body.schemaVersion !== 1 || body.port?.guide?.schemaVersion !== 1) throw new Error("Unsupported port document schema");
  for (const [key, value] of Object.entries(entry)) if (key !== "content") assert.deepEqual(body.port[key], value, `Port index/document mismatch: ${entry.id}.${key}`);
  return body.port;
}

/** Only a port page loads its pinned document. Global navigation, search and screenshots use the small index. */
export async function readPort(port) {
  if (typeof port === "string") port = ports.find((entry) => entry.id === port);
  if (!port) throw new Error("Unknown port");
  if (snapshot.schemaVersion === 1) return port; // Format transition, not a legacy-port fallback.
  if (!/^ports\/[a-z0-9]+(?:-[a-z0-9]+)*\.[a-f0-9]{64}\.json$/.test(port.content ?? "")) throw new Error("Invalid port document reference");
  let raw;
  if (documents) {
    const load = documents[`../../data/${port.content}`];
    if (!load) throw new Error(`Missing port document: ${port.id}`);
    raw = await load();
  } else {
    const path = new URL(`../../data/${port.content}`, import.meta.url);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024) throw new Error(`Invalid port document: ${port.id}`);
    raw = await readFile(path, "utf8");
  }
  return decodePortDocument(port, raw);
}
