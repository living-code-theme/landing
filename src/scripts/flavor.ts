// The site's flavor: one data-theme attribute on <html>, chosen by the visitor and kept in localStorage.
// Switching reveals the new palette behind a scan line, the way a terminal redraws,
// carrying the :colorscheme command that would do the same in Neovim.
import { navigate } from "astro:transitions/client";
import { prepareScreenshots } from "./transitions";
import { cancelFlavorScan, scanFlavor } from "./flavor-scan";

export const FLAVORS = ["night", "frost", "paper", "signal"] as const;
type Data = Record<string, { name: string; light: boolean; base: string; roles: Record<string, string> }>;

const KEY = "living-code-flavor";
const root = document.documentElement;
const listeners = new Set<(id: string) => void>();
let data: Data | undefined;

export const flavorData = (): Data => (data ??= JSON.parse(document.getElementById("flavor-data")!.textContent!));
export const currentFlavor = () => root.dataset.theme!.replace("living-code-", "");
export const onFlavor = (fn: (id: string) => void) => { listeners.add(fn); return () => listeners.delete(fn); };

const stored = () => {
  try {
    const id = localStorage.getItem(KEY);
    return FLAVORS.includes(id as never) ? id! : "night";
  } catch {
    return "night";
  }
};

// Everything on the page that names or marks the current flavor.
export function syncFlavorUi(id = currentFlavor()) {
  const d = flavorData()[id];
  document.querySelectorAll("[data-flavor-name]").forEach((el) => (el.textContent = d.name));
  document.querySelectorAll("[data-flavor-id]").forEach((el) => (el.textContent = id));
  document.querySelectorAll("[data-set-flavor]").forEach((el) => el.setAttribute("aria-pressed", String(el.getAttribute("data-set-flavor") === id)));
  document.querySelectorAll('[role="tab"][data-set-flavor]').forEach((el) => el.setAttribute("aria-selected", String(el.getAttribute("data-set-flavor") === id)));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", d.base);
}

const apply = (id: string) => {
  root.dataset.theme = `living-code-${id}`;
  syncFlavorUi(id);
  listeners.forEach((fn) => fn(id));
};

export function setFlavor(id: string) {
  if (!FLAVORS.includes(id as never) || id === (root.dataset.flavorTarget ?? currentFlavor())) return;
  try { localStorage.setItem(KEY, id); } catch {}

  // A flavor page is that flavor; picking another one goes to its page.
  if (root.dataset.flavorPage) { navigate(`/flavors/${id}/`); return; }

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !Element.prototype.animate) { cancelFlavorScan(); apply(id); return; }
  scanFlavor(id, () => apply(id));
}

// Prepare the selected flavor's screenshot before Astro starts the view transition, not after its snapshot.
document.addEventListener("astro:before-preparation", (event) => {
  cancelFlavorScan();
  const loader = event.loader;
  event.loader = async () => {
    await loader();
    if (event.signal.aborted || event.defaultPrevented) return;
    const next = event.newDocument.documentElement;
    if (!next.dataset.flavorPage) next.dataset.theme = `living-code-${stored()}`;
    await prepareScreenshots(event.newDocument);
  };
});

// Carry browser capabilities into the incoming document before the swap.
document.addEventListener("astro:before-swap", (e) => {
  const next = e.newDocument.documentElement;
  if (!next.dataset.flavorPage) next.dataset.theme = `living-code-${stored()}`;
  // What the scripts learned about this browser carries over: that script runs, and whether the field is live.
  next.classList.add("js");
  if (root.dataset.glyphs) next.dataset.glyphs = root.dataset.glyphs;
});
document.addEventListener("astro:after-swap", () => syncFlavorUi());
