// Only the five exposed ports and the current flavor are warmed, never the whole catalog.
export function enhanceShowcaseImages(root: HTMLElement) {
  const controller = new AbortController();
  const pending = new WeakMap<HTMLImageElement, Promise<boolean>>();
  const captures = [...root.querySelectorAll<HTMLElement>(".app-showcase__capture")];
  let disposed = false;
  let nearby = false;
  let revision = 0;
  const flavor = () => document.documentElement.dataset.theme?.replace("living-code-", "") ?? "night";
  const imageIn = (element: Element | null) => element?.querySelector<HTMLImageElement>(`img[data-only="${flavor()}"]`);
  const panelFor = (tab: HTMLElement) => root.querySelector<HTMLElement>(`[data-app-panel="${tab.dataset.appTab}"]`);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const speculative = !connection?.saveData && !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "");

  function load(image: HTMLImageElement, priority: "high" | "low") {
    image.fetchPriority = priority;
    // Promoting the actual responsive image lets the browser choose the correct srcset candidate.
    image.loading = "eager";
    let work = pending.get(image);
    if (!work) {
      work = image.decode().then(() => true, () => {
        pending.delete(image); // A later selection can retry a transient failure.
        return false;
      });
      pending.set(image, work);
    }
    return work;
  }

  function update() {
    const version = ++revision;
    const panel = root.querySelector<HTMLElement>("[data-app-panel]:not([hidden])");
    const capture = panel?.querySelector<HTMLElement>(".app-showcase__capture");
    const image = imageIn(capture ?? null);
    if (!capture || !image) return;
    const tab = root.querySelector<HTMLElement>(`[data-app-tab="${panel!.dataset.appPanel}"]`);
    const thumbnail = imageIn(tab);
    // Keep a small, already-visible capture behind the full-resolution image while it decodes.
    const preview = thumbnail?.currentSrc || thumbnail?.src;
    if (preview) capture.style.setProperty("--capture-preview", `url(${JSON.stringify(preview)})`);
    capture.dataset.imageState = "loading";
    capture.setAttribute("aria-busy", "true");
    const status = capture.querySelector<HTMLElement>("[data-image-status]");
    if (status) status.textContent = "Loading screenshot…";
    void load(image, "high").then((ready) => {
      if (disposed || version !== revision) return;
      capture.dataset.imageState = ready ? "ready" : "error";
      capture.setAttribute("aria-busy", "false");
      if (status) status.textContent = ready ? "" : "Screenshot unavailable. Try another app or flavor.";
    });
    if (speculative) {
      root.querySelectorAll<HTMLElement>("[data-app-tab]:not([hidden])").forEach((candidate) => {
        const next = imageIn(panelFor(candidate));
        if (next && next !== image) void load(next, "low");
      });
    }
  }

  const intent = (event: Event) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-app-tab]") : null;
    if (!tab || tab.hidden) return;
    const image = imageIn(panelFor(tab));
    if (image) void load(image, "high");
  };
  root.addEventListener("pointerover", intent, { signal: controller.signal });
  root.addEventListener("focusin", intent, { signal: controller.signal });
  // Click prioritizes the selected image immediately, before the mutation observer runs.
  root.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-app-tab]")) update();
  }, { signal: controller.signal });
  const selection = new MutationObserver(() => { if (nearby) update(); });
  selection.observe(root, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  const theme = new MutationObserver(() => { if (nearby) update(); });
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const visibility = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    nearby = true;
    visibility.disconnect();
    update();
  }, { rootMargin: "400px" });
  visibility.observe(root);

  return () => {
    disposed = true;
    controller.abort();
    selection.disconnect();
    theme.disconnect();
    visibility.disconnect();
    captures.forEach((capture) => {
      delete capture.dataset.imageState;
      capture.removeAttribute("aria-busy");
      capture.style.removeProperty("--capture-preview");
    });
  };
}

export function showcaseImages() {
  const cleanups = [...document.querySelectorAll<HTMLElement>("[data-app-showcase]")].map(enhanceShowcaseImages);
  return () => cleanups.forEach((cleanup) => cleanup());
}
