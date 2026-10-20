// Local tab sets: the page ships every panel visible, so without script nothing is lost. Enhancement reveals
// the controls, shows one panel at a time and gives the tabs roving focus with arrows, Home and End.
type TabSet = {
  root: string;
  list: string;
  tab: string;
  panel: string;
  // The dataset keys that name a tab's panel, and the id prefix of each tab.
  tabKey: string;
  panelKey: string;
  tabId: string;
  // A vertical list also answers Up and Down.
  vertical?: boolean;
  // Carry the selected sample through Astro's flavor-page navigation.
  remember?: boolean;
};

const rememberedTabs = new Map<string, string>();

export function tabSets(set: TabSet) {
  const cleanups: (() => void)[] = [];
  document.querySelectorAll<HTMLElement>(set.root).forEach((root) => {
    const list = root.querySelector<HTMLElement>(set.list)!;
    const tabs = [...list.querySelectorAll<HTMLButtonElement>(set.tab)];
    const panels = [...root.querySelectorAll<HTMLElement>(set.panel)];
    const prev = set.vertical ? ["ArrowLeft", "ArrowUp"] : ["ArrowLeft"];
    const next = set.vertical ? ["ArrowRight", "ArrowDown"] : ["ArrowRight"];
    const select = (tab: HTMLButtonElement) => {
      for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel.dataset[set.panelKey] !== tab.dataset[set.tabKey];
      if (set.remember) rememberedTabs.set(set.tabId, tab.dataset[set.tabKey]!);
    };
    for (const panel of panels) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `${set.tabId}${panel.dataset[set.panelKey]}`);
    }
    const click = (event: MouseEvent) => {
      const tab = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(set.tab) : null;
      if (tab && tabs.includes(tab)) select(tab);
    };
    const keydown = (event: KeyboardEvent) => {
      const index = tabs.indexOf(event.target as HTMLButtonElement);
      if (index < 0 || ![...prev, ...next, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const to = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (next.includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[to]);
      tabs[to].focus({ preventScroll: true });
      tabs[to].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    };
    const saved = set.remember ? rememberedTabs.get(set.tabId) : undefined;
    select(tabs.find((tab) => tab.dataset[set.tabKey] === saved) ?? tabs[0]);
    list.hidden = false;
    list.addEventListener("click", click);
    list.addEventListener("keydown", keydown);
    cleanups.push(() => {
      list.removeEventListener("click", click);
      list.removeEventListener("keydown", keydown);
    });
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}
