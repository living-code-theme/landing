// Hash the emitted scripts, not their source templates. One policy covers every page so Astro's client router
// can execute a destination's inline scripts under the original document's policy. No unsafe-inline for JS.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/.test(attributes)) continue;
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (type && !["module", "text/javascript", "application/javascript"].includes(type)) continue;
    hashes.push(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  }
  return hashes;
}

export async function writeSecurityHeaders(directory) {
  const paths = await readdir(directory, { recursive: true });
  const hashes = new Set();
  for (const path of paths.filter((path) => path.endsWith(".html"))) {
    for (const hash of inlineScriptHashes(await readFile(join(directory, path), "utf8"))) hashes.add(hash);
  }
  const path = join(directory, "_headers");
  const template = await readFile(path, "utf8");
  if (!template.includes("__SCRIPT_HASHES__")) throw new Error("Missing CSP hash placeholder");
  const headers = template.replace("__SCRIPT_HASHES__", [...hashes].sort().join(" "));
  if (headers.split("\n").some((line) => line.length > 2000)) throw new Error("Cloudflare header line exceeds 2000 characters");
  await writeFile(path, headers);
}

export default function securityHeaders() {
  return { name: "landing-security-headers", hooks: {
    "astro:build:done": async ({ dir }) => writeSecurityHeaders(fileURLToPath(dir)),
  } };
}
