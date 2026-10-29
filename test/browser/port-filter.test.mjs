import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { browserHarness, until } from "./harness.mjs";

let harness;
before(async () => { harness = await browserHarness(); });
after(async () => { await harness?.stop(); });

const catalog = "document.querySelector('main [data-port-list]')";
const input = `${catalog}.querySelector('[data-port-filter]')`;
const frame = (page) => page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
const clear = (page) => page.evaluate(`${input}.value = ''; ${input}.dispatchEvent(new Event('input'))`);

for (const mobile of [false, true]) for (const path of ["/", "/ports/"]) {
  test(`${mobile ? "mobile" : "desktop"} ${path}: filtering a scrolled catalog returns to its start before results collapse`, { timeout: 30_000 }, async (t) => {
    const page = await harness.page(t, { mobile });
    if (path !== "/") {
      await page.send("Page.navigate", { url: harness.origin + path });
      await until(() => page.evaluate(`location.pathname === '/ports/' && document.readyState === 'complete'`), "ports page");
    }
    await page.evaluate("document.fonts.ready");
    await frame(page);

    for (const query of ["no-such-port-xyz", "neovim"]) {
      await clear(page);
      await page.evaluate(`scrollTo({top: scrollY + ${catalog}.getBoundingClientRect().top + 1000, behavior: 'instant'}); ${input}.focus({preventScroll: true})`);
      await frame(page);
      assert.ok(await page.evaluate(`${catalog}.getBoundingClientRect().top < -500`), "start well down the list with the search still focused");

      await page.send("Input.insertText", { text: query });
      await frame(page);
      const result = await page.evaluate(`(() => {
        const list = ${catalog};
        const none = list.querySelector('[data-port-none]');
        const header = document.querySelector('header').getBoundingClientRect();
        return {
          top: list.getBoundingClientRect().top,
          expectedTop: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
          empty: !none.hidden,
          emptyVisible: none.getBoundingClientRect().top >= header.bottom && none.getBoundingClientRect().bottom <= innerHeight,
          matches: list.querySelectorAll('[data-port-keys]:not([hidden])').length,
          focused: document.activeElement === ${input},
          scroll: scrollY,
          savedScroll: history.state.portList.scrollY,
        };
      })()`);
      assert.ok(Math.abs(result.top - result.expectedTop) <= 1, `catalog is below the sticky header, not lost below the viewport: ${JSON.stringify(result)}`);
      assert.equal(result.empty, query !== "neovim");
      if (result.empty) assert.equal(result.emptyVisible, true, "the entire no-results message is in view");
      else assert.ok(result.matches > 0, "narrowing to a few matches also stays in the section");
      assert.equal(result.focused, true, "typing can continue without refocusing");
      assert.equal(result.savedScroll, result.scroll, "history records the corrected position");
    }

    await clear(page);
    // Dispatch directly: native text insertion would itself reveal an offscreen focused input.
    await page.evaluate(`scrollTo({top: 0, behavior: 'instant'}); ${input}.value = 'no-such-port-xyz'; ${input}.dispatchEvent(new Event('input'))`);
    await frame(page);
    assert.equal(await page.evaluate("scrollY"), 0, "a filter above the catalog does not scroll down into it");
    assert.deepEqual(page.errors, []);
  });
}

test("filtering the dialog does not scroll the underlying page", { timeout: 30_000 }, async (t) => {
  const page = await harness.page(t);
  await page.evaluate(`scrollTo({top: scrollY + ${catalog}.getBoundingClientRect().top + 1000, behavior: 'instant'})`);
  await frame(page);
  await page.evaluate("document.querySelector('header [data-port-finder-open]').click()");
  await until(() => page.evaluate("document.querySelector('#port-finder').dataset.portReady === 'true'"), "finder catalog");
  await page.evaluate("document.fonts.ready");
  await frame(page);
  const position = await page.evaluate("scrollY");
  await page.send("Input.insertText", { text: "no-such-port-xyz" });
  await frame(page);
  assert.equal(await page.evaluate("document.querySelector('#port-finder [data-port-none]').hidden"), false);
  assert.equal(await page.evaluate("scrollY"), position);
  assert.deepEqual(page.errors, []);
});
