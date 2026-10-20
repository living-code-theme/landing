// Each flavor page's code samples. Keep the language selected when navigating between flavors.
import { tabSets } from "./tabs.ts";

export const languagePreviews = () => tabSets({
  root: "[data-language-preview]", list: "[data-language-tabs]", tab: "[data-language-tab]", panel: "[data-language-panel]",
  tabKey: "languageTab", panelKey: "languagePanel", tabId: "language-tab-", remember: true,
});

// The real-app screenshots under the hero, listed vertically on wide screens.
export const appShowcases = () => tabSets({
  root: "[data-app-showcase]", list: "[data-app-tabs]", tab: "[data-app-tab]", panel: "[data-app-panel]",
  tabKey: "appTab", panelKey: "appPanel", tabId: "app-tab-", vertical: true,
});
