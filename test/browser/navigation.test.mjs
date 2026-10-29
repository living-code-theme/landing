import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { browserHarness, until } from "./harness.mjs";

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });

const toggle = "document.querySelector('[data-nav-toggle]')";
const expanded = `${toggle}.getAttribute('aria-expanded') === 'true'`;
const frame = (page) => page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
async function resize(page, width, height, mobile = true) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await frame(page);
}
async function tap(page, selector) {
  const point = await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await frame(page);
}
async function key(page, key, code, windowsVirtualKeyCode) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}
async function capture(page, name) {
  await page.evaluate("Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
  await frame(page);
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(tmpdir(), `landing-navigation-${name}.png`), Buffer.from(data, "base64"));
}

for (const [width, height] of [[320, 568], [320, 700], [390, 844], [768, 1024], [844, 390], [1023, 800]]) {
  test(`${width}×${height}: full-screen touch navigation and compact hero actions`, { timeout: 30_000 }, async (t) => {
    const page = await harness.page(t, { mobile: true });
    await page.evaluate("document.fonts.ready");
    await resize(page, width, height);
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "no horizontal overflow");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.flavor-menu')).display"), "none", "appearance leaves the crowded header");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#site-nav')).display"), "none");
    assert.ok(await page.evaluate(`(() => {
      const brand = document.querySelector('header a[aria-label="Living Code, home"]');
      const install = document.querySelector('header [data-port-finder-open]');
      const menu = ${toggle};
      const b = brand.getBoundingClientRect(), i = install.getBoundingClientRect(), m = menu.getBoundingClientRect();
      return b.right <= i.left && i.right <= m.left && m.right <= innerWidth && [b,i,m].every(r => r.height >= 44);
    })()`), "the brand and both actions fit with touch-sized targets");
    assert.ok(await page.evaluate(`(() => {
      const art = document.querySelector('#hero [data-glyph="chameleon"]').getBoundingClientRect();
      const description = document.querySelector('[data-hero-description]').getBoundingClientRect();
      const action = document.querySelector('#hero [data-port-finder-open]').getBoundingClientRect();
      return action.bottom <= art.top && description.top >= art.bottom + 20;
    })()`), "installation stays first, followed by the animation and its description");
    assert.ok(await page.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.hero-actions a')].map(el => el.getBoundingClientRect());
      return Math.abs(buttons[0].top - buttons[1].top) < 1 && buttons[0].right <= buttons[1].left && buttons.every(r => r.height >= 44 && r.height < 52);
    })()`), "both smaller hero actions stay on one row");
    assert.equal(await page.evaluate("document.querySelector('header [data-port-finder-open]').innerText.trim()"), "Ports");
    assert.equal(await page.evaluate(`${toggle}.textContent.trim()`), "", "the menu is icon-only with an accessible label");
    assert.equal(await page.evaluate(`${toggle}.getAttribute('aria-label')`), "Open menu");
    assert.equal(await page.evaluate("[...document.querySelectorAll('[data-port-filter]')].every(input => input.placeholder === 'Search ports')"), true);
    assert.ok(await page.evaluate(`(() => {
      const copyright=document.querySelector('.footer-copyright').getBoundingClientRect();
      const command=document.querySelector('.footer-command').getBoundingClientRect();
      return Math.abs(copyright.bottom-command.bottom) < 1 && copyright.right + 7 <= command.left && command.right <= innerWidth;
    })()`), "copyright and the full colorscheme command fit side by side, even on a small phone");
    if (width === 390) {
      const hero = await page.evaluate(`(() => {
        const art=document.querySelector('.hero-chameleon').getBoundingClientRect();
        const copy=document.querySelector('[data-hero-description]').getBoundingClientRect();
        return {artHeight:art.height, artWidth:art.width, bottom:copy.bottom};
      })()`);
      assert.ok(hero.artHeight > 280 && hero.artWidth > width, "the chameleon has a larger mobile stage");
      assert.ok(hero.bottom >= height - 48 && hero.bottom <= height - 32, "description sits a little above the foot of the first screen");
      await capture(page, "mobile");
    }

    await tap(page, "[data-nav-toggle]");
    await until(() => page.evaluate(expanded), "mobile menu opens by touch");
    assert.ok(await page.evaluate(`(() => {
      const nav = document.querySelector('#site-nav').getBoundingClientRect();
      const head = document.querySelector('header').getBoundingClientRect();
      return nav.top === head.bottom && Math.abs(nav.bottom - innerHeight) < 1 && nav.left === 0 && nav.right === innerWidth;
    })()`), "the menu covers the whole viewport below the header");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#site-nav')).backgroundColor === getComputedStyle(document.documentElement).backgroundColor"), true, "menu uses the current page background");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('header')).backgroundColor === getComputedStyle(document.documentElement).backgroundColor"), true);
    assert.equal(await page.evaluate("getComputedStyle(document.documentElement).overflowY"), "hidden");
    assert.equal(await page.evaluate("document.querySelector('main').inert && document.querySelector('footer').inert"), true);
    assert.equal(await page.evaluate(`${toggle}.getAttribute('aria-label')`), "Close menu");
    assert.ok(await page.evaluate("[...document.querySelectorAll('#site-nav a, #site-nav button')].every(el => el.getBoundingClientRect().height >= 44)"));
    assert.ok(await page.evaluate(`(() => {
      const source=document.querySelector('#site-nav a[href^="https://github.com/"]');
      return parseFloat(getComputedStyle(source).fontSize) >= 24 && source.getBoundingClientRect().height >= 44;
    })()`), "GitHub is a full-sized navigation destination");
    assert.ok(await page.evaluate(`(() => {
      const options=[...document.querySelectorAll('[data-mobile-flavors] button')];
      return options.length === 4 && options.every(button => {
        const r=button.getBoundingClientRect();
        const swatch=button.querySelector('.mobile-flavor__swatch').getBoundingClientRect();
        return r.width >= 120 && r.height >= 92 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && swatch.width >= 20 && button.querySelector('.mobile-flavor__description').textContent.length > 15;
      });
    })()`), "all four described flavor choices and their icons are usable without scrolling");
    assert.equal(await page.evaluate("[...document.querySelectorAll('[data-mobile-flavors] button')].filter(button => getComputedStyle(button.querySelector('.mobile-flavor__check')).opacity === '1').length"), 1, "one flavor has a visible selected check");
    if (width === 390 || height === 390 || height === 568) await capture(page, height === 390 ? "landscape-open" : height === 568 ? "small-open" : "mobile-open");

    await tap(page, '#site-nav [data-set-flavor="paper"]');
    await until(() => page.evaluate("document.documentElement.dataset.theme === 'living-code-paper'"), "mobile flavor selection");
    assert.equal(await page.evaluate(expanded), true, "palette comparison does not require reopening the menu");
    assert.equal(await page.evaluate("document.querySelector('#site-nav [data-set-flavor=paper]').getAttribute('aria-pressed')"), "true");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#site-nav [data-set-flavor=paper] .mobile-flavor__check')).opacity"), "1");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#site-nav')).backgroundColor === getComputedStyle(document.documentElement).backgroundColor"), true, "open menu follows the new Paper theme");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#site-nav a')).color === getComputedStyle(document.documentElement).color"), true, "menu text also follows Paper");
    if (width === 390) await capture(page, "mobile-paper-open");
    await key(page, "Escape", "Escape", 27);
    assert.equal(await page.evaluate(expanded), false);
    assert.equal(await page.evaluate(`document.activeElement === ${toggle}`), true, "Escape returns focus to the menu icon");
    assert.equal(await page.evaluate("document.querySelector('main').inert || document.querySelector('footer').inert"), false);
    assert.equal(await page.evaluate("document.querySelector('header').hasAttribute('data-theme')"), false);
    assert.notEqual(await page.evaluate("getComputedStyle(document.documentElement).overflowY"), "hidden");
    assert.deepEqual(page.errors, []);
    assert.deepEqual(await page.evaluate("window.violations"), []);
  });
}

test("full-screen menu supports focus containment, dismissal, navigation and breakpoint changes", { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { mobile: true });
  await page.evaluate(`${toggle}.focus()`);
  await key(page, "ArrowDown", "ArrowDown", 40);
  assert.equal(await page.evaluate(expanded), true);
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('#site-nav a')"), true);
  await key(page, "Tab", "Tab", 9);
  assert.equal(await page.evaluate("document.activeElement === document.querySelectorAll('#site-nav a')[1]"), true);
  await page.evaluate("document.querySelector('header a').focus()");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  assert.equal(await page.evaluate(`document.activeElement === ${toggle}`), true, "Shift+Tab wraps inside the full-screen header");
  await key(page, "Tab", "Tab", 9);
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('header a')"), true, "Tab cannot reach the obscured page");
  await tap(page, "[data-nav-toggle]");
  assert.equal(await page.evaluate(expanded), false, "the close icon dismisses the menu");

  await tap(page, "[data-nav-toggle]");
  await resize(page, 1440, 900, false);
  assert.equal(await page.evaluate(expanded), false, "resizing clears stale overlay state");
  assert.notEqual(await page.evaluate("getComputedStyle(document.querySelector('#site-nav')).display"), "none", "desktop links remain visible");
  await capture(page, "desktop");
  assert.ok(await page.evaluate(`(() => {
    const art = document.querySelector('#hero [data-glyph="chameleon"]').getBoundingClientRect();
    const description = document.querySelector('[data-hero-description]').getBoundingClientRect();
    const action = document.querySelector('#hero [data-port-finder-open]').getBoundingClientRect();
    return description.bottom <= art.top && description.right <= action.left;
  })()`), "desktop keeps the original two-column introduction");
  await resize(page, 390, 844);
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#site-nav')).display"), "none");

  await tap(page, "[data-nav-toggle]");
  await tap(page, '#site-nav a[href="/#flavors"]');
  await until(() => page.evaluate("location.hash === '#flavors'"), "section link navigates");
  assert.equal(await page.evaluate(expanded), false);
  await tap(page, "[data-nav-toggle]");
  await tap(page, "header [data-port-finder-open]");
  assert.equal(await page.evaluate("document.querySelector('#port-finder').open"), true);
  assert.equal(await page.evaluate(expanded), false, "installation closes the menu before opening the finder");
  assert.deepEqual(page.errors, []);
  assert.deepEqual(await page.evaluate("window.violations"), []);
});

test("mobile navigation still exposes section links without JavaScript", { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t, { scripting: false, mobile: true });
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('[data-nav-toggle]')).display"), "none");
  assert.ok(await page.evaluate("[...document.querySelectorAll('#site-nav > ul a')].every(a => a.getBoundingClientRect().height >= 44)"));
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
});
