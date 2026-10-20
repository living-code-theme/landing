import assert from "node:assert/strict";
import test from "node:test";
import { captureHomeView, restoreHomeChoices } from "../src/scripts/home-view.ts";

function home() {
  const input = { value: "code" };
  const tabs = [
    { dataset: { appTab: "vscode" } }, { dataset: { appTab: "obsidian" }, selected: true },
    { dataset: { languageTab: "typescript" } }, { dataset: { languageTab: "rust" }, selected: true },
  ];
  for (const tab of tabs) tab.click = () => { tab.clicked = true; };
  return {
    tabs, input,
    querySelector: (selector) => selector.includes("data-app-tab") ? tabs[1] : selector.includes("data-language-tab") ? tabs[3] : input,
    querySelectorAll: () => tabs,
  };
}

test("homepage state records exact scroll, app, language and catalog filter", () => {
  const doc = home();
  assert.deepEqual(captureHomeView(doc, 0, 11444), { scrollX: 0, scrollY: 11444, app: "obsidian", language: "rust", query: "code" });
});

test("homepage choices are restored through the tab controls before scroll restoration", () => {
  const doc = home();
  restoreHomeChoices(doc, { scrollX: 0, scrollY: 11444, app: "obsidian", language: "rust", query: "kitty" });
  assert.deepEqual(doc.tabs.map((tab) => !!tab.clicked), [false, true, false, true]);
  assert.equal(doc.input.value, "kitty");
});

test("missing saved choices fall back to the page's defaults without clicking unrelated tabs", () => {
  const doc = home();
  restoreHomeChoices(doc, { scrollX: 0, scrollY: 0, query: "" });
  assert.ok(doc.tabs.every((tab) => !tab.clicked));
  assert.equal(doc.input.value, "");
});
