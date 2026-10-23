import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { inlineScriptHashes } from "../src/lib/security-headers.mjs";

const headers = readFileSync(new URL("../dist/_headers", import.meta.url), "utf8");

test("CSP hashes the exact executable inline script bytes, not JSON or external scripts", () => {
  const code = "\nconsole.log('hello');\n";
  const expected = `'sha256-${createHash("sha256").update(code).digest("base64")}'`;
  assert.deepEqual(inlineScriptHashes(`<script>${code}</script><script type="application/json">{}</script><script src="/app.js"></script><script type="module">${code}</script>`), [expected, expected]);
});

test("one built policy authorizes every page's scripts, including client-router destinations", () => {
  assert.doesNotMatch(headers, /__SCRIPT_HASHES__|unsafe-eval/);
  const directive = headers.match(/script-src ([^;]+)/)[1];
  assert.doesNotMatch(directive, /unsafe-inline/);
  const dist = new URL("../dist/", import.meta.url);
  for (const path of readdirSync(dist, { recursive: true }).filter((path) => path.endsWith(".html"))) {
    for (const hash of inlineScriptHashes(readFileSync(new URL(path, dist), "utf8"))) assert.ok(directive.includes(hash), path);
  }
  for (const rule of ["default-src 'self'", "script-src-attr 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "connect-src 'self'"]) assert.ok(headers.includes(rule));
  // Mirrors the zone's Cloudflare HSTS setting, so the policy holds on any host.
  assert.match(headers, /Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\n/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.ok(headers.split("\n").every((line) => line.length <= 2000));
});

test("fingerprinted scripts, styles, fonts, and image variants are immutable; HTML is not", () => {
  for (const path of ["/_astro/*", "/image-variants/*", "/port-finder/*", "/app-previews/*"]) {
    assert.ok(headers.includes(`${path}\n  Cache-Control: public, max-age=31536000, immutable`));
  }
  assert.doesNotMatch(headers.split("/_astro/*")[0], /Cache-Control/);
  const home = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const fonts = [...home.matchAll(/rel="preload" href="([^"]+)" as="font"/g)].map((match) => match[1]);
  assert.equal(fonts.length, 2);
  for (const font of fonts) {
    assert.match(font, /^\/_astro\/.+\.[\w-]+\.woff2$/);
    assert.ok(readFileSync(new URL(`../dist${font}`, import.meta.url)).length > 0);
  }
});

test("static assets are served without a Worker script; HTTPS is enforced by the zone and the .dev preload list", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.main, undefined, "no per-request Worker invocation for static assets");
  assert.equal(config.assets.run_worker_first, undefined);
  assert.equal(config.assets.directory, "./dist");
});
