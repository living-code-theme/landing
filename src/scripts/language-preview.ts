// Each flavor page's code samples. Keep the language selected when navigating between flavors.
import { tabSets } from "./tabs.ts";
import { chosenPreviews } from "./showcase-loader.ts";
import { pickShowcasePorts } from "./showcase-selection.ts";

export const languagePreviews = () => tabSets({
  root: "[data-language-preview]", list: "[data-language-tabs]", tab: "[data-language-tab]", panel: "[data-language-panel]",
  tabKey: "languageTab", panelKey: "languagePanel", tabId: "language-tab-", remember: true,
});

// Five real-app ports per browser, refreshed when its anonymous token rotates.
const appTabs = {
  root: "[data-app-showcase]", list: "[data-app-tabs]", tab: "[data-app-tab]", panel: "[data-app-panel]",
  tabKey: "appTab", panelKey: "appPanel", tabId: "app-tab-", vertical: true, pick: pickShowcasePorts,
};
export const appShowcases = (onReady?: () => void) => {
  let cleanup = tabSets(appTabs), disposed = false;
  const root = document.querySelectorAll<HTMLElement>(appTabs.root)[0];
  if (root?.dataset?.appCatalog) void chosenPreviews(root.dataset.appCatalog).then((choices) => {
    if (disposed || !root.isConnected) return;
    cleanup();
    root.querySelector("[data-app-tabs]")!.replaceChildren(...choices.map((p) => p.tab));
    root.querySelector(".app-showcase__panels")!.replaceChildren(...choices.map((p) => p.panel));
    cleanup = tabSets(appTabs);
    onReady?.();
  }).catch(() => { /* The fully usable initial selection remains available when personalization cannot load. */ });
  return () => { disposed = true; cleanup(); };
};
