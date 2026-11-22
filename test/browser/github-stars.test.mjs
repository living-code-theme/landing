import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import snapshot from "../../data/github-stars.json" with { type: "json" };
import { summarizeGitHubStars } from "../../src/lib/github-stars.mjs";
import { browserHarness } from "./harness.mjs";

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });
const { totalStars } = summarizeGitHubStars(snapshot);

async function metrics(page, selector) {
  return page.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el=>el.getBoundingClientRect().width>0).map(el=>{
    const rect=el.getBoundingClientRect();
    return {text:el.querySelector('span').textContent,name:el.closest('a').textContent,href:el.closest('a').href,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,height:innerHeight};
  })`);
}
function assertMetric(metric, width) {
  assert.ok(metric);
  assert.equal(metric.text, totalStars.toLocaleString("en-US"));
  assert.equal(metric.href, "https://github.com/living-code-theme");
  assert.match(metric.name, /GitHub[\s\S]*stars? across all \d+ public repositor/);
  assert.ok(metric.left >= 0 && metric.right <= width && metric.top >= 0 && metric.bottom <= metric.height, JSON.stringify(metric));
}
async function capture(page, name) {
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(tmpdir(), `living-code-stars-${name}.png`), Buffer.from(data, "base64"));
}

for (const width of [320, 390, 1440]) test(`${width}px: header and footer stars work without JavaScript or API requests`, { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { scripting: false, mobile: width < 768 });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  await page.evaluate("document.fonts.ready");
  const visible = await metrics(page, "header [data-github-stars]");
  assert.equal(visible.length, 1);
  assertMetric(visible[0], width);
  assert.equal(await page.evaluate("document.querySelector('#hero [data-github-stars]')"), null);
  await page.evaluate("document.querySelector('footer [data-github-stars]').scrollIntoView({behavior:'instant',block:'center'})");
  assertMetric((await metrics(page, "footer [data-github-stars]"))[0], width);
  assert.equal(page.requests.some(request => new URL(request.url).hostname === "api.github.com"), false);
  assert.deepEqual(page.errors, []);
  await capture(page, width);
});

for (const [width, height] of [[320, 568], [390, 844], [1024, 900], [1440, 900]]) test(`${width}px: the header counter fits its responsive navigation and leaves the hero unchanged`, { timeout: 30_000 }, async (t) => {
  const mobile = width < 1024;
  const page = await harness.page(t, { mobile });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await page.evaluate("document.fonts.ready");
  await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await page.evaluate("document.querySelector('#hero [data-github-stars]')"), null);
  const header = await metrics(page, "header [data-github-stars]");
  assert.equal(header.length, mobile ? 0 : 1);
  if (!mobile) assertMetric(header[0], width);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  if (mobile) {
    await page.evaluate("document.querySelector('[data-nav-toggle]').click()");
    const expanded = await metrics(page, "header [data-github-stars]");
    assert.equal(expanded.length, 1);
    assertMetric(expanded[0], width);
  }
  await capture(page, `header-${width}`);
  assert.equal(page.requests.some(request => new URL(request.url).hostname === "api.github.com"), false);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});
