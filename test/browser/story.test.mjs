import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { browserHarness, until } from "./harness.mjs";

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });

const track = "document.querySelector('[data-story-track]')";
const stage = "document.querySelector('[data-story]')";
const token = "document.querySelector('[data-story-token]')";
async function seek(page, step, pass = 0) {
  await page.evaluate(`(() => {
    const track = ${track}, box = ${stage};
    const hold = Number(track.dataset.hold), scan = Number(track.dataset.pass);
    const total = 4 * hold + 3 * scan;
    const at = (${step} - 1) * (hold + scan) + (${pass} ? hold + scan * ${pass} : hold / 2);
    scrollTo({top: scrollY + track.getBoundingClientRect().top - parseFloat(getComputedStyle(box).top) + at / total * (track.offsetHeight - box.offsetHeight), behavior: 'instant'});
  })()`);
  if (!pass) await until(() => page.evaluate(`${stage}.dataset.step === '${step}' && Number(document.querySelector('[data-story-copy="${step}"]').style.opacity) === 1`), `story step ${step}`);
}
async function capture(page, name) {
  const result = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(tmpdir(), `palette-${name}.png`), Buffer.from(result.data, "base64"));
}

for (const [name, width, height, mobile] of [
  ["mobile", 390, 844, true],
  ["small-mobile", 320, 568, true],
  ["landscape", 844, 390, true],
  ["desktop", 1440, 900, false],
]) test(`${name}: palette display fits the pinned viewport with usable, named steps`, { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { mobile });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await until(() => page.evaluate(`!!${track}?.hasAttribute('data-scrub')`), "scrubbed story");
  // Let font metrics, the new viewport and its ResizeObservers settle before calculating the scroll target.
  await page.evaluate("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  await seek(page, 2);
  const layout = await page.evaluate(`(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return {top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height}; };
    const copy = document.querySelector('[data-story-copy="2"]');
    return {
      stage: rect(${stage}), scene: rect(document.querySelector('[data-story-scene]')),
      details: rect(document.querySelector('.story-details')), token: rect(${token}),
      stops: [...document.querySelectorAll('[data-story-go]')].map(b => ({
        ...rect(b), nameVisible:getComputedStyle(b.querySelector('.story-rail__name')).display !== 'none',
        number:b.firstElementChild.textContent.trim(), numberVisible:getComputedStyle(b.firstElementChild).display !== 'none',
      })),
      description: getComputedStyle(copy.querySelector('.story-copy__description')).display,
      summary: getComputedStyle(copy.querySelector('.story-copy__summary')).display,
      proof: getComputedStyle(copy.querySelector('.story-proof')).display,
      accessibleCopies: [...document.querySelectorAll('[data-story-copy]')].filter(c => !c.inert && c.getAttribute('aria-hidden') !== 'true').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      transform: getComputedStyle(document.querySelector('[data-story-editor]')).transform,
    };
  })()`);
  assert.equal(layout.overflow, false);
  assert.ok(layout.stage.top >= 0 && layout.stage.bottom <= height + 1, JSON.stringify(layout));
  assert.ok(layout.details.bottom <= height + 1 && layout.details.top >= layout.stage.top, JSON.stringify(layout));
  assert.equal(layout.accessibleCopies, 1, "only the visible caption is exposed to assistive technology");
  assert.ok(layout.stops.every(stop => stop.nameVisible), "steps remain named, not just numbered");
  assert.deepEqual(layout.stops.map(stop => stop.number), ["01", "02", "03", "04"]);
  assert.ok(layout.stops.every(stop => stop.numberVisible), "step numbers stay visible at every viewport size");
  if (mobile) {
    assert.ok(layout.stops.every(stop => stop.height >= 44), "touch targets are at least 44px tall");
    assert.equal(layout.description, "none");
    assert.equal(layout.proof, "none");
    assert.notEqual(layout.summary, "none");
    assert.ok(layout.token.height >= 64);
    if (height > width) {
      assert.ok(layout.scene.width >= width - 1, "the camera fills the screen width");
      assert.ok(layout.scene.height > layout.stage.height * (height > 700 ? 0.6 : 0.5), "the animation gets most of the viewport");
      assert.ok(layout.token.height >= 80, "glyph display stays substantial on short phones");
    } else assert.ok(layout.scene.right <= layout.details.left + 1, "landscape gives the scene its own column");
  } else {
    assert.notEqual(layout.description, "none");
    assert.notEqual(layout.proof, "none");
    assert.equal(layout.summary, "none");
  }
  assert.ok(layout.transform.startsWith("matrix("), "reduced motion keeps the file flat");
  assert.equal(await page.evaluate(`${token}.hasAttribute('data-glyph-to')`), false);
  await capture(page, name);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});

test("mobile: touch scrolling scrubs the scanner and glyphs in both directions; tapping a named stop seeks", { timeout: 45_000 }, async (t) => {
  const page = await harness.page(t, { mobile: true });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await seek(page, 1, 0.5);
  await until(() => page.evaluate(`${stage}.hasAttribute('data-passing') && Math.abs(Number(${token}.dataset.glyphMix) - 0.5) < 0.01`), "scanner and glyph flight");
  assert.deepEqual(await page.evaluate(`[...new Set([...${stage}.querySelectorAll('.ln')].map(line => line.dataset.s))].sort()`), ["1", "2"]);
  await until(() => page.evaluate("document.querySelector('[data-living-field]').dataset.shape === 'story:2'"), "glyph field follows the scanner");
  await new Promise(resolve => setTimeout(resolve, 700));
  await capture(page, "mobile-scanning");

  const start = await page.evaluate("scrollY");
  const touch = (type, y) => page.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }] });
  await touch("touchStart", 390);
  for (let y = 370; y >= 190; y -= 20) { await touch("touchMove", y); await new Promise(resolve => setTimeout(resolve, 20)); }
  await touch("touchEnd");
  await until(() => page.evaluate(`scrollY > ${start} + 50`), "page scrolls when swiping across the animation");
  await seek(page, 2);
  await seek(page, 1, 0.5);
  await until(() => page.evaluate(`${stage}.dataset.dir === 'up' && ${stage}.hasAttribute('data-passing') && Math.abs(Number(${token}.dataset.glyphMix) - 0.5) < 0.01`), "reverse scan");
  const stop = await page.evaluate(`(() => { const r=document.querySelector('[data-story-go="4"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [stop] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await until(() => page.evaluate(`${stage}.dataset.step === '4' && Number(document.querySelector('[data-story-copy="4"]').style.opacity) === 1`), "tapped Signals stop");
  assert.equal(await page.evaluate(`document.querySelector('[data-story-go="4"]').getAttribute('aria-current')`), "step");
  await capture(page, "mobile-signals");
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});

test("without JavaScript, mobile keeps the finished file and all four full explanations", { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { mobile: true, scripting: false });
  assert.equal(await page.evaluate(`${track}.hasAttribute('data-scrub')`), false);
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.story-rail')).display"), "none");
  assert.equal(await page.evaluate("[...document.querySelectorAll('.story-copy__description')].filter(el => getComputedStyle(el).display !== 'none').length"), 4);
  assert.equal(await page.evaluate("[...document.querySelectorAll('.story-copy__summary')].filter(el => getComputedStyle(el).display !== 'none').length"), 0);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
});
