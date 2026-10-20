// Each flavor page's code samples. Keep the language selected when navigating between flavors.
import { tabSets } from "./tabs.ts";
import { pickShowcasePorts } from "./showcase-selection.ts";

export const languagePreviews = () => tabSets({
  root: "[data-language-preview]", list: "[data-language-tabs]", tab: "[data-language-tab]", panel: "[data-language-panel]",
  tabKey: "languageTab", panelKey: "languagePanel", tabId: "language-tab-", remember: true,
});

// Five real-app ports per browser, refreshed when its anonymous token rotates.
export const appShowcases = () => tabSets({
  root: "[data-app-showcase]", list: "[data-app-tabs]", tab: "[data-app-tab]", panel: "[data-app-panel]",
  tabKey: "appTab", panelKey: "appPanel", tabId: "app-tab-", vertical: true, pick: pickShowcasePorts,
});
