import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { ports } from "../src/lib/ports.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("port share metadata uses only available local social cards", () => {
  for (const port of ports) {
    const html = read(`dist/ports/${port.id}/index.html`);
    if (!existsSync(new URL(`public/social/${port.id}.jpg`, root))) {
      assert.doesNotMatch(html, /(?:property="og:image"|name="twitter:image")/);
      continue;
    }
    const url = `https://living-code.dev/social/${port.id}.jpg`;
    assert.ok(html.includes(`<meta property="og:image" content="${url}">`), port.id);
    assert.ok(html.includes(`<meta name="twitter:image" content="${url}">`), port.id);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta property="og:image:width" content="1280">/);
    assert.match(html, /<meta property="og:image:height" content="640">/);
    assert.match(html, /<meta property="og:image:alt" content="Living Code for [^"]+">/);
    assert.match(html, /<meta name="twitter:image:alt" content="Living Code for [^"]+">/);
  }
});

test("share cards ship unchanged at their declared dimensions", async () => {
  for (const name of readdirSync(new URL("public/social/", root))) {
    if (!name.endsWith(".jpg")) continue;
    const bytes = readFileSync(new URL(`public/social/${name}`, root));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "jpeg", name);
    assert.equal(metadata.width, 1280, name);
    assert.equal(metadata.height, 640, name);
    assert.deepEqual(readFileSync(new URL(`dist/social/${name}`, root)), bytes, name);
  }
});
