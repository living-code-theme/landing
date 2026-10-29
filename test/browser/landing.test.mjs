import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
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
  // The live R2 variants must match the widths the markup advertises.
  // (naturalWidth is density-corrected for srcset images, so measure the actual files.)
  const loaded = await page.evaluate(`[...document.querySelectorAll('[data-app-showcase] img')].filter(i=>i.currentSrc).map(i=>[i.currentSrc, i.srcset.split(', ').find(s=>new URL(s.split(' ')[0],location.href).href===i.currentSrc)?.split(' ')[1]])`);
  for (const [url, descriptor] of loaded.filter(([url]) => url.includes("/image-variants/"))) {
    const metadata = await sharp(Buffer.from(await (await fetch(url)).arrayBuffer())).metadata();
    assert.equal(`${metadata.width}w`, descriptor, url);
  }
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

const cameoButton = `document.querySelector('[data-cameo-control]')`;
const cameoCanvas = `${cameoButton}.querySelector('canvas')`;
const cameoStatus = `document.querySelector('[data-cameo-status]')`;
async function showCompanion(page, animated = true) {
  await page.evaluate(`${cameoButton}.scrollIntoView({behavior:'instant',block:'center'})`);
  if (animated) await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await until(() => page.evaluate(`!${cameoButton}.disabled${animated ? ` && ${cameoButton}.hasAttribute('data-cameo-live')` : ""}`), "footer companion");
}

for (const mobile of [false, true]) test(`${mobile ? "mobile" : "desktop"}: the hero's chameleon idles, runs off on its feet and comes back`, { timeout: 60_000 }, async (t) => {
  const page = await harness.page(t, { mobile });
  await showCompanion(page);
  const before = await page.evaluate(`${cameoCanvas}.toDataURL()`);
  await until(async () => (await page.evaluate(`${cameoCanvas}.toDataURL()`)) !== before, "idle life");
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('footer nav').parentElement).gridTemplateColumns.split(' ').length"), mobile ? 2 : 3, "left-grouped footer columns");
  const rect = await page.evaluate(`(() => {const r=${cameoButton}.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  await page.evaluate(`${cameoButton}.focus({preventScroll:true})`);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  assert.equal(await page.evaluate(`${cameoButton}.dataset.cameoState`), "startled");
  await page.evaluate(`${cameoButton}.click()`); // A second activation does not restart the escape.
  assert.equal(await page.evaluate(`${cameoButton}.getAttribute('aria-disabled')`), "true");
  await until(() => page.evaluate(`${cameoButton}.dataset.cameoState === 'leaving'`), "running off");
  await until(() => page.evaluate(`Math.abs(new DOMMatrix(getComputedStyle(${cameoCanvas}).transform).m41) > 20`), "moves on its own feet");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  assert.equal(await page.evaluate(`document.activeElement === ${cameoButton}`), true);
  await until(() => page.evaluate(`${cameoButton}.dataset.cameoState === 'away'`), "out of sight", 15_000);
  assert.equal(await page.evaluate(`Number(getComputedStyle(${cameoCanvas}).opacity)`), 0);
  await until(() => page.evaluate(`${cameoButton}.dataset.cameoState === 'idle'`), "home again", 25_000);
  assert.equal(await page.evaluate(`${cameoStatus}.textContent`), "The chameleon is back.");
  assert.equal(await page.evaluate(`${cameoButton}.getAttribute('aria-disabled')`), null);
  assert.equal(await page.evaluate(`getComputedStyle(${cameoCanvas}).transform`), "none");
  const after = await page.evaluate(`(() => {const r=${cameoButton}.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  assert.deepEqual(after, rect, "no layout shift");
  await page.evaluate("scrollTo({top:0,behavior:'instant'})");
  await until(() => page.evaluate(`!${cameoButton}.hasAttribute('data-cameo-live') && ${cameoCanvas}.hidden`), "paused offscreen");
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});

test("reduced motion blinks instead, and navigation brings up one fresh companion", { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t);
  await showCompanion(page, false);
  assert.equal(await page.evaluate(`${cameoCanvas}.hidden`), true);
  await page.evaluate(`${cameoButton}.click()`);
  assert.equal(await page.evaluate(`${cameoButton}.dataset.cameoState`), "idle");
  assert.equal(await page.evaluate(`${cameoStatus}.textContent`), "The chameleon blinks at you.");
  await page.evaluate(`document.querySelector('a[href="/ports/"]').click()`);
  await until(() => page.evaluate("location.pathname === '/ports/'"), "ports route");
  await showCompanion(page);
  assert.equal(await page.evaluate("document.querySelectorAll('[data-cameo-control]').length"), 1);
  await page.evaluate(`${cameoButton}.click()`);
  assert.equal(await page.evaluate(`${cameoButton}.dataset.cameoState`), "startled");
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await until(() => page.evaluate(`${cameoCanvas}.hidden && ${cameoButton}.dataset.cameoState === 'idle'`), "motion preference sends it home");
  assert.equal(await page.evaluate(`${cameoButton}.getAttribute('aria-disabled')`), null);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});

test("without JavaScript the footer shows the still model and command, with no dead active control", { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { scripting: false, mobile: true });
  await page.evaluate(`${cameoButton}.scrollIntoView({behavior:'instant'})`);
  assert.equal(await page.evaluate(`${cameoButton}.disabled`), true);
  assert.equal(await page.evaluate(`${cameoCanvas}.hidden`), true);
  assert.equal(await page.evaluate(`getComputedStyle(${cameoButton}.querySelector('svg')).visibility`), "visible");
  assert.ok(await page.evaluate("document.querySelector('footer').textContent.includes(':colorscheme')"));
});
