import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { browserHarness, until } from "./harness.mjs";

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });

async function capture(page, name, selector) {
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:${JSON.stringify(selector === "footer" ? "end" : "start")}})`);
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  if (selector === "#ports") await until(() => page.evaluate("getComputedStyle(document.querySelector('#ports p')).opacity === '1'"), "ports description");
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(tmpdir(), `landing-layout-${name}.png`), Buffer.from(data, "base64"));
}

for (const mobile of [true, false]) test(`${mobile ? "mobile" : "desktop"}: simplified sections and footer keep the intended responsive presentation`, { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { mobile });
  await page.evaluate("document.fonts.ready");
  const layout = await page.evaluate(`(() => {
    const visible = el => getComputedStyle(el).display !== 'none';
    const rect = el => { const r=el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}; };
    const palette = getComputedStyle(document.querySelector('#calm'));
    const signoff = document.querySelector('.footer-signoff');
    return {
      galleryFlavors:visible(document.querySelector('.app-showcase__toolbar')),
      contrast:visible(document.querySelector('#flavors dl')),
      wheelLegend:visible(document.querySelector('#flavors [data-glyph="wheel"] + p')),
      extraPortsCopy:!!document.querySelector('#ports p').querySelector('span'),
      paletteTop:parseFloat(palette.paddingTop), paletteBottom:parseFloat(palette.paddingBottom),
      copyright:rect(signoff.querySelector('.footer-copyright')), command:rect(signoff.querySelector('.footer-command')),
      companion:rect(signoff.querySelector('[data-cameo-control]')),
      signoff:rect(signoff), footerNav:[...document.querySelectorAll('footer nav')].map(rect),
      heroButtons:[...document.querySelectorAll('.hero-actions a')].map(rect),
    };
  })()`);
  for (const key of ["galleryFlavors", "contrast", "wheelLegend"]) assert.equal(layout[key], !mobile, key);
  assert.equal(layout.extraPortsCopy, false, "ports copy has no desktop-only availability disclaimer");
  assert.ok(Math.abs(layout.companion.right - layout.signoff.right) < 1, "companion aligns to the right edge");
  assert.ok(Math.abs(layout.command.right - layout.signoff.right) < 1, "colorscheme command aligns to the right edge");
  assert.ok(Math.abs(layout.heroButtons[0].top - layout.heroButtons[1].top) < 1, "hero actions share one row");
  if (mobile) {
    assert.equal(layout.paletteTop, 64, "palette has less space above");
    assert.equal(layout.paletteBottom, 48, "palette has more space below");
    assert.ok(Math.abs(layout.copyright.bottom - layout.command.bottom) < 1, "copyright and colorscheme share one footer row");
    assert.ok(layout.copyright.right + 7 <= layout.command.left, "both footer texts fit without overlapping");
    assert.ok(layout.footerNav.every(nav => nav.bottom < layout.copyright.top));
    assert.ok(layout.heroButtons.every(button => button.height === 44), "mobile actions are compact but touch sized");
  } else {
    assert.ok(layout.paletteTop >= 112);
    assert.equal(layout.paletteBottom, 0);
    assert.ok(Math.abs(layout.copyright.bottom - layout.command.bottom) < 1, "desktop retains the shared footer baseline");
    assert.ok(layout.heroButtons.every(button => button.height === 52), "desktop actions retain their size");
  }
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await page.evaluate("document.querySelector('#in-use').scrollIntoView({behavior:'instant'})");
  await until(() => page.evaluate("!document.querySelector('[data-app-showcase]').dataset.appPending && document.querySelector('[data-app-panel]:not([hidden]) .app-showcase__capture')?.dataset.imageState === 'ready'"), "selected app capture");
  await capture(page, `${mobile ? "mobile" : "desktop"}-gallery`, "#in-use");
  await capture(page, `${mobile ? "mobile" : "desktop"}-flavors`, "#flavors");
  await capture(page, `${mobile ? "mobile" : "desktop"}-ports`, "#ports");
  await capture(page, `${mobile ? "mobile" : "desktop"}-footer`, "footer");
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});
