import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { indexablePaths } from "../src/lib/seo.mjs";

const dist = new URL("../dist/", import.meta.url);
const read = path => readFileSync(new URL(path, dist), "utf8");
const pages = readdirSync(dist, { recursive: true }).filter(path => path.endsWith(".html"));

test("sitemap contains every canonical HTML page exactly once, never fragments or the 404", () => {
  const xml = read("sitemap.xml");
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(urls.sort(), indexablePaths.map(path => `https://living-code.dev${path}`).sort());
  const built = pages.filter(path => path !== "404.html").map(path => `/${path.replace(/index\.html$/, "")}`);
  assert.deepEqual([...indexablePaths].sort(), built.sort());
  assert.doesNotMatch(xml, /404|\.json|app-previews|port-finder/);
  assert.match(read("robots.txt"), /^User-agent: \*\nAllow: \/\n\nSitemap: https:\/\/living-code\.dev\/sitemap.xml\s*$/);
});

test("all indexable pages have unique titles, descriptions and absolute self-canonicals", () => {
  const titles = new Set();
  for (const path of pages) {
    const html = read(path);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title?.trim(), path);
    assert.equal(titles.has(title), false, `duplicate title: ${title}`);
    titles.add(title);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, path);
    assert.match(html, /<html lang="en"/);
    assert.equal([...html.matchAll(/<meta name="description"/g)].length, 1, path);
    if (path === "404.html") {
      assert.match(html, /<meta name="robots" content="noindex, follow">/);
      assert.doesNotMatch(html, /rel="canonical"/);
    } else {
      const expected = `https://living-code.dev/${path.replace(/index\.html$/, "")}`;
      assert.equal(html.match(/<link rel="canonical" href="([^"]+)">/)?.[1], expected, path);
      assert.doesNotMatch(html, /name="robots" content="noindex/);
    }
    assert.match(html, /property="og:site_name" content="Living Code"/);
    assert.match(html, /property="og:image" content="https:\/\/living-code\.dev\/social\//);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  }
});

test("homepage structured data describes the existing website, without invented product ratings", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const data = JSON.parse(scripts[0][1]);
  assert.equal(data["@context"], "https://schema.org");
  assert.equal(data["@type"], "WebSite");
  assert.equal(data.name, "Living Code");
  assert.equal(data.url, "https://living-code.dev/");
  assert.equal(data.aggregateRating, undefined);
});

test("generated headings and ARIA ID references are unique and resolve on all pages", () => {
  for (const path of pages) {
    const html = read(path).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${path}: duplicate ID`);
    for (const [, refs] of html.matchAll(/\saria-(?:labelledby|describedby|controls)="([^"]+)"/g)) {
      for (const id of refs.split(/\s+/)) assert.ok(ids.includes(id), `${path}: missing ARIA target ${id}`);
    }
    for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ids.includes(decodeURIComponent(target)), `${path}: broken local anchor ${target}`);
    }
  }
});
