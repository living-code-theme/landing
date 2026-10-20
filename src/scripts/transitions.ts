// Capture only the name shared by a port detail and a catalog. Giving every grid name its own
// snapshot makes unrelated names animate on return instead of staying in the page's static grid.
export function preparePortTransition(current: Document, incoming: Document) {
  const outgoingTitle = current.querySelector<HTMLElement>("h1 [data-port-name]");
  const incomingTitle = incoming.querySelector<HTMLElement>("h1 [data-port-name]");
  const returning = !!outgoingTitle && !!incoming.querySelector("[data-port-list]");
  const opening = !!incomingTitle && !!current.querySelector("[data-port-list]");
  const id = returning ? outgoingTitle.dataset.portName : opening ? incomingTitle!.dataset.portName : undefined;
  for (const doc of [current, incoming]) {
    doc.documentElement.toggleAttribute("data-port-return-transition", returning);
    doc.querySelectorAll<HTMLElement>("[data-port-name]").forEach((name) => {
      name.style.viewTransitionName = id && name.dataset.portName === id ? `port-${id}` : "none";
    });
  }
}

// Flavor titles are shared only with the matching homepage title, never with every flavor at once. On return,
// leave the restored homepage still rather than sliding its whole viewport beneath the shared title.
export function prepareFlavorTransition(current: Document, incoming: Document) {
  const outgoing = current.documentElement.dataset.flavorPage;
  const arriving = incoming.documentElement.dataset.flavorPage;
  const returning = !!outgoing && !!incoming.querySelector("#flavors");
  const opening = !!arriving && !!current.querySelector("#flavors");
  const id = returning ? outgoing : opening ? arriving : undefined;
  for (const doc of [current, incoming]) {
    doc.documentElement.toggleAttribute("data-flavor-return-transition", returning);
    doc.querySelectorAll<HTMLElement>("[data-flavor-title]").forEach((title) => {
      title.style.viewTransitionName = title.dataset.flavorTitle === id ? `flavor-${id}` : "none";
    });
  }
}

// A view transition is a frozen viewport. Yield to scrolling rather than leaving that snapshot over a moving page.
export function interruptOnScroll(transition: ViewTransition) {
  // Skipping intentionally rejects ready, not the DOM update. Do not surface that as an unhandled error.
  transition.ready?.catch(() => {});
  const controller = new AbortController();
  const options = { passive: true, signal: controller.signal };
  const skip = () => transition.skipTransition();
  addEventListener("wheel", skip, options);
  addEventListener("touchmove", skip, options);
  addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable], [role=combobox]")) return;
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) skip();
  }, { signal: controller.signal });
  // Astro's own scroll restoration happens inside the update callback. Only subsequent movement should skip.
  transition.updateCallbackDone.then(() => {
    if (controller.signal.aborted) return;
    const x = scrollX, y = scrollY;
    addEventListener("scroll", () => {
      if (scrollX !== x || scrollY !== y) skip();
    }, options);
  }, () => {});
  const cleanup = () => controller.abort();
  transition.finished.then(cleanup, cleanup);
}

// Decode the incoming port's visible screenshot while the old page is still usable, before taking a snapshot.
export async function prepareScreenshots(doc: Document) {
  const flavor = doc.documentElement.dataset.theme?.replace("living-code-", "");
  const images = [...doc.querySelectorAll<HTMLImageElement>("[data-shot-eager] img")]
    .filter((image) => !image.dataset.only || image.dataset.only === flavor);
  await Promise.all(images.map(async (image) => {
    image.loading = "eager";
    const preload = new Image();
    preload.sizes = image.sizes;
    preload.srcset = image.getAttribute("srcset") ?? "";
    preload.src = image.getAttribute("src")!;
    try { await preload.decode(); } catch { /* A missing image must not prevent navigation. */ }
  }));
}
