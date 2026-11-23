import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { flavorSeo, homeSeo, portSeo, portsSeo } from "../../src/lib/seo.mjs";
import { flavors, ports } from "../../src/lib/data.mjs";
import { browserHarness, until } from "./harness.mjs";

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });

// Google and social crawlers receive static HTML (covered by the build tests). The client router must also
// replace the head, rather than retaining the homepage's schema or a previous page's canonical.
test("client navigation updates search metadata, schema and canonicals without stale entities", { timeout: 60_000 }, async (t) => {
  const page = await harness.page(t);
  const check = async (path, seo, type, hasBreadcrumbs) => {
    await until(() => page.evaluate(`location.pathname === ${JSON.stringify(path)} && document.title === ${JSON.stringify(seo.title)}`), path);
    const head = await page.evaluate(`(() => {
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      return {
        canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map(link => link.href),
        description: document.querySelector('meta[name="description"]').content,
        twitterTitle: document.querySelector('meta[name="twitter:title"]').content,
        graphs: scripts.map(script => JSON.parse(script.textContent)),
      };
    })()`);
    assert.deepEqual(head.canonicals, [`https://living-code.dev${path}`]);
    assert.equal(head.description, seo.description);
    assert.equal(head.twitterTitle, seo.title);
    assert.equal(head.graphs.length, 1);
    const graph = head.graphs[0]["@graph"];
    const entity = graph.find(node => node["@id"] === `https://living-code.dev${path}#webpage`);
    assert.equal(entity["@type"], type);
    assert.equal(entity.description, seo.description);
    assert.equal(graph.some(node => node["@type"] === "BreadcrumbList"), hasBreadcrumbs);
    return entity;
  };
  const click = path => page.evaluate(`document.querySelector('a[href=${JSON.stringify(path)}]').click()`);

  await check("/", homeSeo, "WebPage", false);
  await click("/ports/");
  await check("/ports/", portsSeo, "CollectionPage", true);
  const port = ports.find(port => port.id === "vscode") ?? ports[0];
  if (port) {
    await click(`/ports/${port.id}/`);
    const entity = await check(`/ports/${port.id}/`, portSeo(port), "ItemPage", true);
    assert.equal(entity.mainEntity.codeRepository, port.repository);
  }
  await click("/#hero");
  await check("/", homeSeo, "WebPage", false);
  const flavor = flavors[0];
  await click(`/flavors/${flavor.id}/`);
  await check(`/flavors/${flavor.id}/`, flavorSeo(flavor), "WebPage", true);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});
