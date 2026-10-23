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
  let observer: IntersectionObserver | undefined;
  if (root?.dataset?.appCatalog) {
    root.dataset.appPending = "true";
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer!.disconnect();
      void chosenPreviews(root.dataset.appCatalog!).then((choices) => {
        if (disposed || !root.isConnected) return;
        cleanup();
        root.querySelector("[data-app-tabs]")!.replaceChildren(...choices.map((p) => p.tab));
        root.querySelector(".app-showcase__panels")!.replaceChildren(...choices.map((p) => p.panel));
        cleanup = tabSets(appTabs);
      }).catch(() => {
        // Activate the static selection on failure, never both selections on a successful visit.
      }).finally(() => {
        if (disposed || !root.isConnected) return;
        delete root.dataset.appPending;
        onReady?.();
        root.dispatchEvent(new Event("showcase:ready"));
      });
    }, { rootMargin: "400px" });
    observer.observe(root);
  }
  return () => { disposed = true; observer?.disconnect(); cleanup(); };
};
