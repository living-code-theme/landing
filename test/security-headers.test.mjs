import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { inlineScriptHashes } from "../src/lib/security-headers.mjs";
import worker from "../src/worker.mjs";

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
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/);
  assert.doesNotMatch(headers, /includeSubDomains|preload/);
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

test("HTTP is permanently upgraded before even a cached static asset can be served", async () => {
  for (const path of ["/", "/ports/vscode/?from=search%20box", "/_astro/app.js", "/missing/"]) {
    const response = await worker.fetch(new Request(`http://living-code.dev${path}`), { ASSETS: { fetch() { assert.fail("HTTP must not reach assets"); } } });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://living-code.dev${path}`);
  }
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.main, "src/worker.mjs");
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.binding, "ASSETS");
});

test("HTTPS preserves the asset response, including security/cache headers, redirects and 404s", async () => {
  for (const status of [200, 301, 404]) {
    const request = new Request("https://living-code.dev/ports/");
    const expected = new Response(null, { status, headers: { "x-content-type-options": "nosniff" } });
    const response = await worker.fetch(request, { ASSETS: { fetch(input) { assert.equal(input, request); return expected; } } });
    assert.equal(response, expected);
  }
});
