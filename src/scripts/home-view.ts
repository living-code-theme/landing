// State that affects the homepage's height, plus its exact viewport. Keep it on the history entry so Back and
// Forward restore the page the visitor actually left, not the no-script stack of every screenshot and sample.
export type HomeView = { scrollX: number; scrollY: number; app?: string; language?: string; query: string };

export function captureHomeView(doc: Document, x: number, y: number): HomeView {
  return {
    scrollX: x, scrollY: y,
    app: doc.querySelector<HTMLElement>('[data-app-tab][aria-selected="true"]')?.dataset.appTab,
    language: doc.querySelector<HTMLElement>('[data-language-tab][aria-selected="true"]')?.dataset.languageTab,
    query: doc.querySelector<HTMLInputElement>('main [data-port-filter]')?.value ?? "",
  };
}

export function restoreHomeChoices(doc: Document, view: HomeView) {
  // Tabs have already been enhanced. Clicking restores their whole state (panels, ARIA and roving focus),
  // without focusing the button or scrolling it into view.
  doc.querySelectorAll<HTMLButtonElement>("[data-app-tab], [data-language-tab]").forEach((tab) => {
    if ((view.app && tab.dataset.appTab === view.app) || (view.language && tab.dataset.languageTab === view.language)) tab.click();
  });
  const input = doc.querySelector<HTMLInputElement>('main [data-port-filter]');
  if (input) input.value = view.query;
}
