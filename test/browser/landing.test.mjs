import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { browserHarness, until } from "./harness.mjs";
import { APPS, shotsOf } from "../../src/lib/data.mjs";

const noCaptures = APPS.length ? false : "no captured ports in this snapshot";
const smallOriginals = new Set(APPS.flatMap((app) => shotsOf(app.port)).filter((shot) => shot.width < 1600).map((shot) => shot.src));

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });

const galleryReady = `!document.querySelector('[data-app-showcase]').dataset.appPending && document.querySelector('[data-app-panel]:not([hidden]) .app-showcase__capture')?.dataset.imageState === 'ready'`;
const screenshotRequest = (request) => /\/(?:image-variants|port-images)\//.test(request.url);
async function showGallery(page) {
  await page.evaluate("document.getElementById('in-use').scrollIntoView({behavior:'instant'})");
  await until(() => page.evaluate(galleryReady), "selected screenshot");
  await until(() => page.evaluate(`[...document.querySelectorAll('[data-app-tab]:not([hidden]) img')].filter(i=>i.dataset.only===document.documentElement.dataset.theme.replace('living-code-','')).every(i=>i.complete && i.naturalWidth>0)`), "thumbnails");
}

for (const mobile of [false, true]) test(`${mobile ? "mobile" : "desktop"}: no discarded screenshot downloads; CSP permits navigation and controls`, { timeout: 60_000, skip: noCaptures }, async (t) => {
  const page = await harness.page(t, { mobile });
  await page.evaluate(`Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`);
  const capture = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(tmpdir(), `landing-fixed-${mobile ? "mobile" : "desktop"}.png`), Buffer.from(capture.data, "base64"));
  await showGallery(page);
  const allowed = await page.evaluate(`[...document.querySelectorAll('[data-app-showcase] img[data-only="night"]')].flatMap(i=>(i.srcset||i.dataset.imageSrcset||'').split(', ').map(s=>new URL(s.split(' ')[0],location.href).href))`);
  const requests = page.requests.filter(screenshotRequest);
  assert.ok(requests.length <= 6, `expected five thumbnails and one full capture, got ${requests.length}: ${requests.map((r) => r.url).join(", ")}`);
  for (const request of requests) assert.ok(allowed.includes(request.url), `discarded screenshot requested: ${request.url}`);
  assert.ok(requests.every((request) => new URL(request.url).pathname.startsWith("/image-variants/") || smallOriginals.has(request.url)), "these viewports never need the 2560px original");
  t.diagnostic(`Screenshot requests: ${requests.length}; transferred bytes: ${requests.reduce((n, r) => n + (page.sizes.get(r.id) ?? 0), 0)}`);
  assert.deepEqual(await page.evaluate("window.violations"), []);

  // Same-document routing must retain the first document's CSP and authorize destination scripts.
  await page.evaluate(`window.routeMarker=true; document.querySelector('a[href="/flavors/night/"]').click()`);
  await until(() => page.evaluate("location.pathname === '/flavors/night/' && !!document.querySelector('[data-language-preview]')"), "flavor route");
  assert.equal(await page.evaluate("window.routeMarker"), true);
  await page.evaluate(`document.querySelector('[data-language-tab="python"]').click()`);
  assert.equal(await page.evaluate(`document.querySelector('[data-language-panel="python"]').hidden`), false);
  await page.evaluate(`document.querySelector('[data-port-finder-open]').click()`);
  await until(() => page.evaluate("document.querySelector('#port-finder')?.dataset.portReady === 'true'"), "finder catalog");
  assert.ok(await page.evaluate("document.querySelectorAll('#port-finder [role=option]').length > 0"));
  const portPath = `/ports/${APPS[0].port}/`;
  await page.evaluate(`document.querySelector('#port-finder a[href="${portPath}"]').click()`);
  await until(() => page.evaluate(`location.pathname === ${JSON.stringify(portPath)}`), "port route");
  await page.evaluate(`document.querySelector('[data-set-flavor="paper"]').click()`);
  await until(() => page.evaluate("document.documentElement.dataset.theme === 'living-code-paper'"), "flavor switch");
  await page.evaluate(`document.querySelector('a[aria-label="Living Code, home"]').click()`);
  await until(() => page.evaluate("location.pathname === '/' && !!document.querySelector('#hero')"), "return home");
  await showGallery(page);
  assert.equal(await page.evaluate("window.routeMarker"), true);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);

  // An unapproved inline script must actually be blocked, not just absent from our templates.
  await page.evaluate(`const script=document.createElement('script');script.textContent='window.unapprovedScriptRan=true';document.body.append(script)`);
  await until(() => page.evaluate("window.violations.length > 0"), "CSP enforcement");
  assert.equal(await page.evaluate("window.unapprovedScriptRan === true"), false);
});

test("personalization failure activates only the usable static fallback", { timeout: 30_000, skip: noCaptures }, async (t) => {
  const page = await harness.page(t, { failPreviews: true });
  await showGallery(page);
  const ids = await page.evaluate(`[...document.querySelectorAll('[data-app-tab]')].map(t=>t.dataset.appTab)`);
  assert.deepEqual(ids, APPS.slice(0, 5).map((app) => app.port));
  assert.ok(page.requests.filter(screenshotRequest).length <= 6);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});

test("without JavaScript, real screenshots and installation links remain available", { timeout: 30_000, skip: noCaptures }, async (t) => {
  const page = await harness.page(t, { scripting: false, mobile: true });
  await page.evaluate("document.getElementById('in-use').scrollIntoView({behavior:'instant'})");
  await until(() => page.evaluate(`!!document.querySelector('[data-app-panel] noscript img[data-only="night"]')?.naturalWidth`), "noscript image");
  assert.equal(await page.evaluate("document.documentElement.classList.contains('js')"), false);
  assert.equal(await page.evaluate("document.querySelectorAll('[data-app-panel] a[href^=\"/ports/\"]').length"), Math.min(5, APPS.length));
  assert.equal(page.requests.filter((request) => request.url.includes("/app-previews/")).length, 0);
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('img[data-image-src]')).display"), "none");
});
