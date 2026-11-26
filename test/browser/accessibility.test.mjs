import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { browserHarness, until } from "./harness.mjs";

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });
const key = async (page, key, code, windowsVirtualKeyCode) => {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
};
async function visit(page, path) {
  await page.evaluate("window.auditPreviousDocument = true");
  await page.send("Page.navigate", { url: harness.origin + path });
  await until(() => page.evaluate(`!window.auditPreviousDocument && location.pathname === ${JSON.stringify(path.split("#")[0])} && document.readyState === 'complete' && !document.querySelector('[data-set-flavor]:disabled')`), path);
}

// Axe rounds OKLCH to 8-bit sRGB before calculating contrast. Paper's original
// comment/base pair is 4.50365:1 in CSS but 4.488:1 after that rounding. Recheck
// ONLY this exact pair with the browser's full-precision CSS conversion. Do not
// suppress the contrast rule or change the repository-owned palette to game it.
const scan = `async () => {
  const result = await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice']}});
  const probe = document.createElement('span'); probe.style.transition = 'none'; document.body.append(probe);
  const rgb = color => { probe.style.color = 'color(from ' + color + ' srgb r g b)'; return getComputedStyle(probe).color.match(/^color\\(srgb ([\\d.e+-]+) ([\\d.e+-]+) ([\\d.e+-]+)\\)$/)?.slice(1).map(Number); };
  const lum = rgb => rgb.map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((a,v,i) => a+v*[.2126,.7152,.0722][i],0);
  const reviewed = [], glyphArt = [], violations = [];
  for (const v of result.violations) for (const n of v.nodes) {
    const node = n.target.length === 1 ? document.querySelector(n.target[0]) : null;
    // Code glyphs form a picture, not a human-readable visible label (WCAG 2.5.3).
    // Accept only this named native button with exclusively aria-hidden SVG/canvas
    // children. Any later real text label must still match its accessible name.
    if (v.id === 'label-content-name-mismatch' && node?.matches('button[data-cameo-control]') && node.getAttribute('aria-label') === 'Startle the chameleon' && [...node.childNodes].every(child => child.nodeType === 3 ? !child.textContent.trim() : ['svg','canvas'].includes(child.localName) && child.getAttribute('aria-hidden') === 'true')) {
      glyphArt.push(n.target); continue;
    }
    let precise = false;
    if (v.id === 'color-contrast' && node) {
      const fg = getComputedStyle(node).color;
      let parent = node, bg;
      while (parent && !bg) { const color = getComputedStyle(parent).backgroundColor; if (rgb(color)) bg = color; parent = parent.parentElement; }
      const pair = [fg, bg];
      if (pair.includes('oklch(0.55 0.012 235)') && pair.includes('oklch(0.975 0.004 240)')) {
        const a = lum(rgb(fg)), b = lum(rgb(bg)), ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        precise = ratio >= 4.5;
        reviewed.push({target:n.target,ratio});
      }
    }
    if (!precise) violations.push({id:v.id,target:n.target,summary:n.failureSummary});
  }
  probe.remove(); return {violations,reviewed,glyphArt};
}`;

test("WCAG scans cover every flavor and representative page types, plus the open finder", { timeout: 180_000 }, async (t) => {
  const page = await harness.page(t);
  let reviewed = 0, glyphArt = 0;
  for (const flavor of ["night", "frost", "paper", "signal"]) {
    await page.evaluate(`localStorage.setItem('living-code-flavor', ${JSON.stringify(flavor)})`);
    for (const path of ["/", "/ports/", "/ports/vscode/", "/ports/pi/", `/flavors/${flavor}/`, "/definitely-missing-audit-route/"]) {
      await visit(page, path);
      await page.evaluate(axe + "\n;true");
      const result = await page.evaluate(`(${scan})()`);
      assert.deepEqual(result.violations, [], `${flavor} ${path}`);
      reviewed += result.reviewed.length;
      glyphArt += result.glyphArt.length;
    }
  }
  await visit(page, "/");
  await page.evaluate("document.querySelector('[data-port-finder-open]').click()");
  await until(() => page.evaluate("document.querySelector('#port-finder').dataset.portReady === 'true'"), "finder metadata");
  await page.evaluate(axe + "\n;true");
  assert.deepEqual((await page.evaluate(`(${scan})()`)).violations, []);
  // The APG combobox keeps DOM focus on its input while arrows scroll the active option.
  await key(page, "ArrowUp", "ArrowUp", 38);
  assert.equal(await page.evaluate(`(() => {
    const input=document.querySelector('#port-finder-input'), active=document.getElementById(input.getAttribute('aria-activedescendant'));
    return document.activeElement===input && active?.getAttribute('aria-selected')==='true' && document.querySelector('.port-finder__results').scrollTop>0;
  })()`), true);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
  t.diagnostic(`${reviewed} Paper contrast nodes independently verified at full CSS precision (>=4.5:1); ${glyphArt} glyph-art labels verified as exclusively decorative graphics.`);
});

test("flavor tabs have one keyboard stop, a correctly named panel and no pressed state", async (t) => {
  const page = await harness.page(t);
  await page.evaluate("document.querySelector('#flavors [role=tab]').focus()");
  await key(page, "End", "End", 35);
  await until(() => page.evaluate("document.documentElement.dataset.theme === 'living-code-signal'"), "last flavor tab");
  assert.deepEqual(await page.evaluate(`(() => {
    const tabs=[...document.querySelectorAll('#flavors [role=tab]')], selected=tabs.find(t=>t.getAttribute('aria-selected')==='true');
    return {tabbable:tabs.filter(t=>t.tabIndex===0).length,pressed:tabs.some(t=>t.hasAttribute('aria-pressed')),focused:document.activeElement===selected,panel:document.querySelector('#flavor-panel').getAttribute('aria-labelledby')===selected.id};
  })()`), { tabbable: 1, pressed: false, focused: true, panel: true });
  await page.evaluate("document.querySelector('[data-flavor-toggle]').click(); document.querySelector('#flavor-list [data-set-flavor=paper]').click()");
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('[data-flavor-toggle]')"), true);
});

test("guide snippets scroll with the keyboard and clipboard success/failure are usable", async (t) => {
  const page = await harness.page(t, { mobile: true });
  await visit(page, "/ports/pi/");
  const scrollable = await page.evaluate(`(() => {
    const pre=[...document.querySelectorAll('.snippet pre')].find(p=>p.scrollWidth>p.clientWidth);
    pre.id='audit-scrollable-code'; pre.focus();
    return {tabIndex:pre.tabIndex,role:pre.getAttribute('role'),name:pre.getAttribute('aria-label')};
  })()`);
  assert.equal(scrollable.tabIndex, 0);
  assert.equal(scrollable.role, "region");
  assert.match(scrollable.name, /^Code sample(?: \d+)?$/);
  await key(page, "ArrowRight", "ArrowRight", 39);
  await until(() => page.evaluate("document.querySelector('#audit-scrollable-code').scrollLeft > 0"), "keyboard code scrolling");
  await page.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}});document.querySelector('[data-copy]').click()`);
  await until(() => page.evaluate("document.querySelector('[data-copy]').textContent === 'Copied'"), "copy confirmation");
  assert.equal(await page.evaluate("window.copied === document.querySelector('[data-copy]').dataset.copy"), true);
  await page.evaluate(`navigator.clipboard.writeText=async()=>{throw new Error('permission denied')};document.querySelector('[data-copy]').click()`);
  await until(() => page.evaluate("document.querySelector('[data-copy]').textContent === 'Select and copy'"), "clipboard fallback");
  assert.ok(await page.evaluate("document.querySelector('.snippet pre').textContent.length > 0"));
  assert.deepEqual(page.errors, []);
});

test("finder fetch failure offers the static catalog and can be retried", async (t) => {
  const page = await harness.page(t);
  await page.send("Network.setBlockedURLs", { urls: [harness.origin + "/port-finder/*"] });
  await page.evaluate("document.querySelector('[data-port-finder-open]').click()");
  await until(() => page.evaluate("!document.querySelector('[data-port-error]').hidden"), "finder error state");
  assert.equal(await page.evaluate("document.querySelector('#port-finder-results').hasAttribute('aria-busy')"), false);
  assert.equal(await page.evaluate("document.querySelector('#port-finder [data-port-error] a').getAttribute('href')"), "/ports/");
  await key(page, "Escape", "Escape", 27);
  await until(() => page.evaluate("!document.querySelector('#port-finder').open"), "finder close");
  await page.send("Network.setBlockedURLs", { urls: [] });
  await page.evaluate("document.querySelector('[data-port-finder-open]').click()");
  await until(() => page.evaluate("document.querySelector('#port-finder').dataset.portReady === 'true'"), "finder retry");
  assert.deepEqual(page.errors, []);
});

test("malformed fragments cannot abort enhancement; live reduced motion stops the cursor", async (t) => {
  const page = await harness.page(t);
  await page.send("Page.navigate", { url: harness.origin + "/#%E0%A4%A" });
  await until(() => page.evaluate("document.readyState === 'complete' && !document.querySelector('[data-set-flavor]').disabled"), "malformed-fragment page");
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await until(() => page.evaluate("document.querySelector('.cursor').classList.contains('is-off')"), "cursor blink");
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await until(() => page.evaluate("!document.querySelector('.cursor').classList.contains('is-off')"), "stationary cursor");
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(await page.evaluate("document.querySelector('.cursor').classList.contains('is-off')"), false);
  assert.deepEqual(page.errors, []);
});

test("200% text keeps the narrow header, hero and content within the viewport", async (t) => {
  const page = await harness.page(t);
  // Desktop metrics prevent mobile viewport expansion from hiding a genuine overflow.
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await page.evaluate("document.documentElement.style.fontSize='200%'");
  await page.evaluate("document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))");
  assert.ok(await page.evaluate(`(() => {
    const width=innerWidth, header=document.querySelector('header');
    const controls=[header.querySelector('[aria-label="Living Code, home"]'),header.querySelector('[data-port-finder-open]'),header.querySelector('[data-nav-toggle]')];
    return width===390 && document.documentElement.scrollWidth <= width+1 && controls.every(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=width && r.height>=44;}) && document.querySelector('#hero h1').getBoundingClientRect().right<=width;
  })()`), "text resizing must not push Ports or the menu beyond the viewport");
  assert.deepEqual(page.errors, []);
});

test("without JavaScript, enhancement-only flavor and copy controls are not dead active buttons", async (t) => {
  const page = await harness.page(t, { scripting: false });
  assert.equal(await page.evaluate("[...document.querySelectorAll('[data-set-flavor]')].every(b=>b.disabled)"), true);
  await page.send("Page.navigate", { url: harness.origin + "/ports/pi/" });
  await until(() => page.evaluate("location.pathname === '/ports/pi/' && document.readyState === 'complete'"), "static guide");
  assert.equal(await page.evaluate("[...document.querySelectorAll('[data-copy]')].every(b=>b.disabled)"), true);
  assert.ok(await page.evaluate("document.querySelector('.snippet pre').textContent.length > 0"));
});
