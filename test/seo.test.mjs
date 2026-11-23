import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { flavorSeo, homeSeo, indexablePaths, pageStructuredData, portSeo, portsSeo } from "../src/lib/seo.mjs";
import { flavors, ports } from "../src/lib/data.mjs";

const dist = new URL("../dist/", import.meta.url);
const read = path => readFileSync(new URL(path, dist), "utf8");
const pages = readdirSync(dist, { recursive: true }).filter(path => path.endsWith(".html"));
const escape = value => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const structuredData = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));

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
  const descriptions = new Set();
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
      assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
      const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
      assert.ok(description?.trim(), path);
      assert.equal(descriptions.has(description), false, `duplicate description: ${path}`);
      descriptions.add(description);
    }
    assert.match(html, /property="og:site_name" content="Living Code"/);
    assert.match(html, /property="og:image" content="https:\/\/living-code\.dev\/social\//);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  }
});

test("structured data describes each canonical page and its real navigation hierarchy", () => {
  for (const path of pages) {
    const html = read(path);
    const scripts = structuredData(html);
    if (path === "404.html") {
      assert.deepEqual(scripts, [], "the error page is not a search entity");
      continue;
    }
    assert.equal(scripts.length, 1, path);
    const data = scripts[0];
    assert.equal(data["@context"], "https://schema.org");
    assert.doesNotMatch(JSON.stringify(data), /aggregateRating|reviewCount|ratingValue|SearchAction/, "no fabricated ratings or unsupported site search");
    const url = `https://living-code.dev/${path.replace(/index\.html$/, "")}`;
    const page = data["@graph"].find(node => node["@id"] === `${url}#webpage`);
    assert.ok(page, path);
    assert.equal(page.url, url);
    assert.equal(escape(page.name), html.match(/<title>([^<]+)<\/title>/)[1]);
    assert.equal(escape(page.description), html.match(/<meta name="description" content="([^"]+)">/)[1]);
    assert.equal(page.isPartOf["@id"], "https://living-code.dev/#website");
    const website = data["@graph"].find(node => node["@type"] === "WebSite");
    const crumbs = data["@graph"].find(node => node["@type"] === "BreadcrumbList");
    if (path === "index.html") {
      assert.equal(website.name, "Living Code");
      assert.equal(website.url, "https://living-code.dev/");
      assert.deepEqual(website.sameAs, ["https://github.com/living-code-theme"]);
      assert.equal(crumbs, undefined);
    } else {
      assert.equal(website, undefined);
      assert.equal(page.breadcrumb["@id"], crumbs["@id"]);
      assert.equal(crumbs.itemListElement[0].item, "https://living-code.dev/");
      assert.equal(crumbs.itemListElement.at(-1).item, url);
      for (const [i, crumb] of crumbs.itemListElement.entries()) {
        assert.equal(crumb["@type"], "ListItem");
        assert.equal(crumb.position, i + 1);
        assert.ok(crumb.name.trim());
        assert.ok(indexablePaths.some(path => `https://living-code.dev${path}` === crumb.item), crumb.item);
      }
    }
  }
});

test("search and social metadata match the visible themes and installation content", () => {
  const check = (path, seo) => {
    const html = read(path);
    assert.ok(html.includes(`<title>${escape(seo.title)}</title>`), path);
    for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      assert.ok(html.includes(`<meta ${attribute} content="${escape(seo.description)}">`), path);
    }
    for (const attribute of ['property="og:title"', 'name="twitter:title"']) {
      assert.ok(html.includes(`<meta ${attribute} content="${escape(seo.title)}">`), path);
    }
    return html.match(/<main id="main">([\s\S]*?)<\/main>/)[1];
  };
  assert.match(check("index.html", homeSeo), /free, open-source color theme for editors, terminals and the web/);
  assert.match(check("ports/index.html", portsSeo), /Install the Living Code color theme/);
  assert.equal(structuredData(read("ports/index.html"))[0]["@graph"][0]["@type"], "CollectionPage");
  for (const port of ports) {
    const path = `ports/${port.id}/index.html`;
    const seo = portSeo(port);
    const main = check(path, seo);
    assert.ok(main.includes(escape(seo.description)), `${port.id}: description is useful visible content, not hidden keywords`);
    assert.doesNotMatch(seo.description, /Repository-owned/);
    assert.match(seo.title, /Theme & install/);
    const page = structuredData(read(path))[0]["@graph"][0];
    assert.equal(page["@type"], "ItemPage");
    assert.equal(page.mainEntity["@type"], "SoftwareSourceCode");
    assert.equal(page.mainEntity.codeRepository, port.repository);
    assert.equal(page.mainEntity.description, seo.description);
  }
  for (const flavor of flavors) {
    const main = check(`flavors/${flavor.id}/index.html`, flavorSeo(flavor));
    assert.ok(main.includes(`A ${flavor.light ? "light" : "dark"} color theme for editors and terminals.`));
  }
});

test("port metadata preserves repository-specific features and never advertises unsupported flavors", () => {
  const port = { name: "Test app", flavors: ["night", "paper"], description: "Living Code for Test app. Repository-owned theme files, installation instructions and Night and Paper." };
  const seo = portSeo(port);
  assert.match(seo.description, /Night, Paper color schemes/);
  assert.doesNotMatch(seo.description, /Frost|Signal|four/);
  const specific = "Living Code for Test app: native TOML palettes and custom diff backgrounds.";
  assert.equal(portSeo({ ...port, description: specific }).description, specific.replace("Living Code for", "Living Code theme for"));
});

test("structured data resolves URLs against the canonical site, never a preview host", () => {
  const data = pageStructuredData({ url: new URL("https://living-code.dev/ports/test/"), title: "Test", description: "Test theme", breadcrumbs: [{ name: "Home", path: "/" }, { name: "Test", path: "/ports/test/" }] });
  assert.equal(data["@graph"][0].url, "https://living-code.dev/ports/test/");
  assert.equal(data["@graph"][1].itemListElement[1].item, "https://living-code.dev/ports/test/");
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
