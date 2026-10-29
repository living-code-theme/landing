// Behavior shared by every page. Listeners on document are added once (the header persists across pages);
// anything tied to a page's own elements is set up again on each astro:page-load and torn down before the swap.
import { FLAVORS, currentFlavor, flavorData, onFlavor, setFlavor, syncFlavorUi } from "./flavor";
import { createField, type Field } from "./living/field";
import { interruptOnScroll, prepareFlavorTransition, preparePortTransition } from "./transitions";
import { captureHomeView, restoreHomeChoices, type HomeView } from "./home-view";
import { appShowcases, languagePreviews } from "./language-preview";
import { showcaseImages } from "./showcase-images";
import { faqAccordions } from "./faq";
import { cancelFinderClose, closeFinder } from "./finder-dialog";
import { loadPortFinder } from "./port-finder";

const root = document.documentElement;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Clicks ---------------------------------------------------------------------------------------------

const setNavOpen = (open: boolean) => {
  root.classList.toggle("nav-open", open);
  const toggle = document.querySelector<HTMLElement>("[data-nav-toggle]");
  toggle?.setAttribute("aria-expanded", String(open));
  toggle?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.querySelectorAll<HTMLElement>("body > main, body > footer, body > a[href='#main']").forEach((el) => { el.inert = open; });
};

const closeMenus = (except?: Element) => {
  document.querySelectorAll<HTMLElement>("[data-flavor-toggle], [data-nav-toggle]").forEach((b) => {
    if (b === except) return;
    b.setAttribute("aria-expanded", "false");
    if (b.hasAttribute("data-flavor-toggle")) document.getElementById("flavor-list")!.hidden = true;
  });
  if (except?.hasAttribute("data-nav-toggle") !== true) setNavOpen(false);
};

// A full-screen mobile menu: resize and outside focus must also release its scroll and focus lock.
matchMedia("(min-width: 64rem)").addEventListener("change", () => closeMenus());
document.addEventListener("focusin", (e) => {
  if (!(e.target instanceof Element)) return;
  if (root.classList.contains("nav-open") && e.target.closest("header")) return;
  if (!e.target.closest(".flavor-menu, .site-nav, [data-nav-toggle]")) closeMenus();
});

function openPortFinder() {
  const dialog = document.querySelector<HTMLDialogElement>("#port-finder");
  if (!dialog || typeof dialog.showModal !== "function") return false;
  const input = dialog.querySelector<HTMLInputElement>("[data-port-filter]")!;
  cancelFinderClose(dialog);
  if (!dialog.open) {
    closeMenus();
    input.value = "";
    input.dispatchEvent(new Event("input"));
    dialog.showModal();
    dialog.querySelector<HTMLElement>(".port-finder__results")!.scrollTop = 0;
  }
  input.focus({ preventScroll: true });
  input.select();
  void loadPortFinder(dialog);
  return true;
}

document.addEventListener("click", async (e) => {
  const el = e.target instanceof Element ? e.target : null;
  if (!el) return;

  // Finder links opt out of Astro routing so this can prevent navigation, retaining a plain-link fallback.
  if (el.closest("[data-port-finder-open]") && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && openPortFinder()) {
    e.preventDefault();
    return;
  }
  const dialog = document.querySelector<HTMLDialogElement>("#port-finder");
  if (dialog?.open) {
    if (el.closest("#port-finder a")) closeFinder(dialog);
    if (el === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeFinder(dialog);
      return;
    }
  }

  const toggle = el.closest<HTMLElement>("[data-flavor-toggle]");
  if (toggle) {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    closeMenus(toggle);
    toggle.setAttribute("aria-expanded", String(open));
    document.getElementById("flavor-list")!.hidden = !open;
    if (open) document.querySelector<HTMLElement>('#flavor-list [aria-pressed="true"]')?.focus();
    return;
  }
  const nav = el.closest<HTMLElement>("[data-nav-toggle]");
  if (nav) {
    const open = nav.getAttribute("aria-expanded") !== "true";
    closeMenus(nav);
    setNavOpen(open);
    if (open && e.detail === 0) document.querySelector<HTMLElement>(".site-nav a")?.focus();
    return;
  }

  const pick = el.closest<HTMLElement>("[data-set-flavor]");
  if (pick) {
    // Keep the mobile swatches available while comparing palettes, without opening a second menu.
    if (!pick.closest(".site-nav")) closeMenus();
    setFlavor(pick.dataset.setFlavor!);
    return;
  }

  const adopt = el.closest<HTMLElement>("[data-adopt-flavor]");
  if (adopt) {
    try { localStorage.setItem("living-code-flavor", adopt.dataset.adoptFlavor!); } catch {}
    adopt.textContent = adopt.dataset.done!;
    return;
  }

  const copy = el.closest<HTMLButtonElement>("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy!);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Select and copy";
    }
    copy.classList.add("is-done");
    setTimeout(() => { copy.textContent = "Copy"; copy.classList.remove("is-done"); }, 1600);
    return;
  }

  if (!el.closest(".flavor-menu, .site-nav")) closeMenus();
  if (el.closest(".site-nav a")) closeMenus();

  // A click on the page itself, not on anything you can use or select, sends a wave through the glyphs (or, near
  // the hero's chameleon, drops it a fly).
  const selection = getSelection();
  if (e.detail > 0 && !el.closest("a, button, input, label, select, textarea, summary, pre, code, table, [role=tab], header, dialog") && (!selection || selection.isCollapsed)) {
    field?.burst(e.clientX, e.clientY);
  }
});

// Native method="dialog" submissions and platform dismissals must use the same exit as Escape.
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || form.method !== "dialog") return;
  const dialog = form.closest<HTMLDialogElement>("#port-finder");
  if (dialog) { e.preventDefault(); closeFinder(dialog); }
});
document.addEventListener("cancel", (e) => {
  const dialog = e.target;
  if (dialog instanceof HTMLDialogElement && dialog.id === "port-finder") {
    e.preventDefault();
    closeFinder(dialog);
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && root.classList.contains("nav-open")) {
    const controls = [...document.querySelectorAll<HTMLElement>("header a[href], header button:not([disabled])")].filter((el) => el.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k" && openPortFinder()) {
    e.preventDefault();
    return;
  }
  if (e.key === "Escape") {
    const dialog = document.querySelector<HTMLDialogElement>("#port-finder");
    if (dialog?.open) {
      e.preventDefault();
      closeFinder(dialog);
      return;
    }
    const open = document.querySelector<HTMLElement>('[data-flavor-toggle][aria-expanded="true"], [data-nav-toggle][aria-expanded="true"]');
    closeMenus();
    open?.focus();
  }
  if (e.key === "ArrowDown" && e.target instanceof Element && e.target.closest("[data-nav-toggle]")) {
    e.preventDefault();
    const toggle = e.target.closest<HTMLElement>("[data-nav-toggle]")!;
    closeMenus(toggle);
    setNavOpen(true);
    document.querySelector<HTMLElement>(".site-nav a")?.focus();
  }
  // Arrow keys move between the flavor tabs, as a tablist should.
  const tab = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[role="tab"][data-set-flavor]') : null;
  if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    const i = FLAVORS.indexOf(tab.dataset.setFlavor as never);
    const next = e.key === "Home" ? 0 : e.key === "End" ? FLAVORS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + FLAVORS.length) % FLAVORS.length;
    const target = tab.parentElement!.querySelector<HTMLElement>(`[data-set-flavor="${FLAVORS[next]}"]`)!;
    target.focus();
    setFlavor(FLAVORS[next]);
  }
});

// --- Per page -------------------------------------------------------------------------------------------

let teardown: (() => void)[] = [];

// Parts of each section rise into place the first time they scroll into view. Content is visible without
// script: the hidden start state only applies once html.js is set and the observer is running.
function reveals() {
  const items = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)")];
  if (still()) { items.forEach((el) => el.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  items.forEach((el) => io.observe(el));
  root.classList.add("reveals");
  teardown.push(() => io.disconnect());
}

// The palette story, scrubbed: scroll drives one timeline through the pinned stage and never just triggers a step.
// The travel runs hold, pass, hold, pass… A hold shows one step at rest while its text reads. A pass sends the scan
// line through the file to exactly where the scroll has reached, recoloring each line it crosses, while the glyphs
// beside it re-form into the next token at the same pace; scroll back and it all runs backwards. The file is a plane
// in 3D and a camera moves over it: at rest on each step's shot, laid down and riding the scan line in a pass. The
// shown point trails the scroll a little, so a flick still reads as motion; under reduced motion it snaps, the file
// stays square to the screen, and the glyphs jump from token to token instead of flying.
type Shot = { line: number; x: number; zoom: number; rx: number; ry: number; rz: number };
function story() {
  const track = document.querySelector<HTMLElement>("[data-story-track]");
  const box = track?.querySelector<HTMLElement>("[data-story]");
  const token = track?.querySelector<HTMLElement>("[data-story-token]");
  const scene = track?.querySelector<HTMLElement>("[data-story-scene]");
  const editor = track?.querySelector<HTMLElement>("[data-story-editor]");
  if (!track || !box || !token || !scene || !editor) return;
  const shots: Shot[] = JSON.parse(track.dataset.shots!);
  const flight: Pick<Shot, "rx" | "zoom" | "x"> = JSON.parse(track.dataset.flight!);
  const lines = [...box.querySelectorAll<HTMLElement>(".ln")];
  const copies = [...track.querySelectorAll<HTMLElement>("[data-story-copy]")];
  const stops = [...track.querySelectorAll<HTMLButtonElement>("[data-story-go]")];
  const n = copies.length, hold = Number(track.dataset.hold), pass = Number(track.dataset.pass);
  const span = hold + pass, total = n * hold + (n - 1) * pass, rows = lines.length;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const smooth = (x: number) => (x = clamp(x), x * x * (3 - 2 * x));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  track.dataset.scrub = "";

  // The file's measurements, untransformed, and the scene's: read once and again whenever either changes size.
  let w = 0, h = 0, fileW = 0, top = 0, lh = 0, fit = 1, boost = 1, mobile = false;
  const measure = () => {
    w = scene.clientWidth; h = scene.clientHeight;
    fileW = editor.offsetWidth;
    const wrap = lines[0].offsetParent as HTMLElement;
    top = wrap.offsetTop + lines[0].offsetTop;
    lh = rows > 1 ? (lines[rows - 1].offsetTop - lines[0].offsetTop) / (rows - 1) : lines[0].offsetHeight;
    // Mobile uses the full-bleed scene and closer detail shots, not a miniature desktop composition.
    // The first and final wide shots still fit the file; only the zoomed shots receive the extra boost.
    mobile = matchMedia("(max-width: 1023px)").matches;
    fit = Math.min((w * (mobile ? 0.96 : 0.88)) / fileW, (h * (mobile ? 0.9 : 0.86)) / editor.offsetHeight);
    boost = Math.min(mobile ? 1.6 : 1.35, Math.max(1, 0.6 / fit));
  };

  // Where the camera is: the step's shot at rest, drifting a little as the hold scrolls by; in a pass, a blend from
  // one shot to the next with the flight laid over the middle, its center on the scan line. The final shot stays flat.
  const camera = (k: number, passing: boolean, t: number, front: number, rest: number) => {
    if (still()) return { L: rows / 2, x: 0.5, zoom: 1, rx: 0, ry: 0, rz: 0, lift: 0 };
    const a = shots[k], b = shots[Math.min(k + 1, shots.length - 1)];
    const u = passing ? smooth(t) : 0;
    const p = { L: mix(a.line, b.line, u) - 0.5, x: mix(a.x, b.x, u), zoom: mix(a.zoom, b.zoom, u), rx: mix(a.rx, b.rx, u), ry: mix(a.ry, b.ry, u), rz: mix(a.rz, b.rz, u), lift: 0 };
    if (!passing) {
      const drift = k < n - 1 ? rest - 0.5 : 0;
      p.ry += drift * 6;
      p.rx -= drift * 3;
      return p;
    }
    const f = smooth(t / 0.3) * smooth((1 - t) / 0.3);
    return {
      L: mix(p.L, front * rows, f), x: mix(p.x, flight.x, f), zoom: mix(p.zoom, flight.zoom, f),
      // A shallower mobile scan keeps the code readable in a portrait frame instead of flattening it to a strip.
      rx: mix(p.rx, mobile ? Math.min(flight.rx, 44) : flight.rx, f), ry: mix(p.ry, p.ry * 0.3, f), rz: mix(p.rz, 0, f), lift: f,
    };
  };
  const place = (c: ReturnType<typeof camera>) => {
    const s = fit * (c.zoom > 1 ? c.zoom * boost ** Math.min(1, (c.zoom - 1) / 0.3) : c.zoom);
    const cx = w * (w > 700 ? 0.54 : 0.5), cy = h * (0.46 + (mobile ? 0.08 : 0.14) * c.lift);
    editor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) rotateZ(${c.rz.toFixed(2)}deg) scale(${s.toFixed(4)}) translate(${(-c.x * fileW).toFixed(1)}px, ${(-(top + c.L * lh)).toFixed(1)}px)`;
  };

  // How far the scroll is through the travel, from the moment the stage pins to the moment it lets go.
  const goal = () => {
    const r = track.getBoundingClientRect();
    const run = track.offsetHeight - box.offsetHeight;
    return run > 0 ? clamp((parseFloat(getComputedStyle(box).top) - r.top) / run) * total : 0;
  };

  let step = 0;
  const render = (at: number, dir: number) => {
    const k = Math.min(n - 1, Math.floor(at / span));
    const x = at - k * span;
    const passing = k < n - 1 && x > hold;
    const t = passing ? (x - hold) / pass : 0;
    const front = passing ? clamp((t - 0.12) / 0.76) : 0;
    const now = passing && t >= 0.5 ? k + 2 : k + 1;
    place(camera(k, passing, t, front, clamp(x / hold)));

    lines.forEach((line, i) => {
      const s = String(passing && i + 0.5 < front * rows ? k + 2 : k + 1);
      if (line.dataset.s !== s) line.dataset.s = s;
    });
    const band = passing ? Math.min(1, front * 12, (1 - front) * 12) : 0;
    box.style.setProperty("--front", String(front * rows));
    box.style.setProperty("--band", band.toFixed(3));
    box.style.setProperty("--dir", String(dir));
    box.dataset.dir = dir > 0 ? "down" : "up";
    box.toggleAttribute("data-passing", band > 0);

    // The leaving step fades and lifts over the first part of a pass, the arriving one over the last.
    copies.forEach((copy, j) => {
      const fade = j === k ? (passing ? smooth(1 - t / 0.4) : 1) : j === k + 1 && passing ? smooth((t - 0.6) / 0.4) : 0;
      copy.style.opacity = fade.toFixed(3);
      copy.style.transform = still() || fade === 1 ? "" : `translateY(${((j === k ? -1 : 1) * (1 - fade) * 18).toFixed(1)}px)`;
      copy.style.pointerEvents = fade > 0.5 ? "" : "none";
      copy.inert = fade <= 0.5;
      copy.setAttribute("aria-hidden", String(fade <= 0.5));
    });

    if (passing && !still()) {
      token.dataset.glyph = `story:${k + 1}`;
      token.dataset.glyphTo = `story:${k + 2}`;
      token.dataset.glyphMix = clamp((t - 0.05) / 0.9).toFixed(4);
    } else {
      token.dataset.glyph = `story:${now}`;
      delete token.dataset.glyphTo;
      delete token.dataset.glyphMix;
    }

    track.style.setProperty("--story-p", (at / total).toFixed(4));
    if (now !== step) {
      step = now;
      box.dataset.step = String(now);
      stops.forEach((b, j) => (j === now - 1 ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    }
  };

  let shown = goal(), dir = 1, last = 0, raf = 0;
  const tick = (time: number) => {
    raf = 0;
    const want = goal();
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0.016;
    const before = shown;
    shown = still() ? want : shown + (want - shown) * (1 - Math.exp(-dt / 0.1));
    if (Math.abs(want - shown) < 0.0005) shown = want;
    if (shown !== before) dir = shown > before ? 1 : -1;
    render(shown, dir);
    if (shown !== want) { last = time; raf = requestAnimationFrame(tick); } else last = 0;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

  // A stop on the rail scrolls to the middle of its step's hold.
  const go = (e: Event) => {
    const j = Number((e.currentTarget as HTMLElement).dataset.storyGo) - 1;
    const run = track.offsetHeight - box.offsetHeight;
    const top = scrollY + track.getBoundingClientRect().top - parseFloat(getComputedStyle(box).top);
    scrollTo({ top: top + ((j * span + hold / 2) / total) * run, behavior: still() ? "auto" : "smooth" });
  };

  const controller = new AbortController();
  addEventListener("scroll", wake, { passive: true, signal: controller.signal });
  addEventListener("resize", wake, { passive: true, signal: controller.signal });
  stops.forEach((b) => b.addEventListener("click", go, { signal: controller.signal }));
  const sizes = new ResizeObserver(() => { measure(); render(shown, dir); });
  sizes.observe(scene);
  sizes.observe(editor);
  measure();
  render(shown, 1);
  teardown.push(() => { controller.abort(); cancelAnimationFrame(raf); sizes.disconnect(); });
}

// Astro restores window scroll on history traversal, but not the filter that determines the list's height.
// Keep that filter on its history entry; the explicit “All ports” link also restores the last index visit.
type PortListState = { query: string; scrollX: number; scrollY: number };
let lastPortIndex: PortListState | undefined;
let returningToPorts = false;
let lastHomeView: HomeView | undefined;
let returningToHome = false;
let traversingHome = false;
let scrolledDuringPreparation = false;
let cancelPreparationScroll = () => {};

function rememberHome() {
  lastHomeView = captureHomeView(document, scrollX, scrollY);
  history.replaceState({ ...history.state, homeView: lastHomeView, scrollX, scrollY }, "");
}

const pagePortInput = () => document.querySelector<HTMLInputElement>("main [data-port-filter]");

document.addEventListener("astro:before-preparation", (event) => {
  cancelPreparationScroll();
  scrolledDuringPreparation = false;
  const tracking = new AbortController();
  cancelPreparationScroll = () => tracking.abort();
  addEventListener("scroll", () => { scrolledDuringPreparation = true; }, { passive: true, signal: tracking.signal });
  event.signal.addEventListener("abort", cancelPreparationScroll, { once: true, signal: tracking.signal });
  if (event.from.pathname === "/" && event.to.pathname !== "/" && event.navigationType !== "traverse") rememberHome();
  returningToHome = event.navigationType !== "traverse" && event.to.pathname === "/" &&
    !!event.sourceElement?.closest("[data-flavor-return]");
  traversingHome = event.navigationType === "traverse" && event.to.pathname === "/";
  // Both documents must be prepared before the old snapshot, not during the swap.
  const loader = event.loader;
  event.loader = async () => {
    await loader();
    if (!event.signal.aborted && !event.defaultPrevented) {
      preparePortTransition(document, event.newDocument);
      prepareFlavorTransition(document, event.newDocument);
    }
  };
  const input = pagePortInput();
  if (input && event.from.pathname === "/ports/") {
    lastPortIndex = { query: input.value, scrollX, scrollY };
  }
  returningToPorts = event.navigationType !== "traverse" &&
    !!event.sourceElement?.closest("[data-port-return]") && event.to.pathname === "/ports/";
});

function restorePageLayout() {
  const entry = history.state;
  const saved = returningToPorts ? lastPortIndex : entry?.portList as PortListState | undefined;
  const position = returningToPorts ? saved : entry;
  const home = !!document.querySelector("#hero");
  const homeView: HomeView | undefined = home ? returningToHome ? lastHomeView : entry?.homeView : undefined;
  const input = pagePortInput();
  if (input && saved) input.value = saved.query;
  // Collapse no-script panels and restore their selection before measuring the story or restoring scroll.
  // Doing this on page-load changes the page's height after Astro has already taken the new snapshot.
  teardown.push(languagePreviews(), appShowcases(() => {
    syncFlavorUi();
    if (homeView) restoreHomeChoices(document, homeView);
    field?.refresh();
  }));
  if (homeView) restoreHomeChoices(document, homeView);
  teardown.push(showcaseImages());
  story();
  portFilter();
  if (input && saved) {
    scrollTo({ left: position.scrollX, top: position.scrollY, behavior: "instant" });
    history.replaceState({ ...history.state, portList: saved, scrollX, scrollY }, "");
  }
  const homePosition = returningToHome ? homeView : traversingHome ? entry : undefined;
  if (home && homePosition) {
    scrollTo({ left: homePosition.scrollX, top: homePosition.scrollY, behavior: "instant" });
    history.replaceState({ ...history.state, homeView: captureHomeView(document, scrollX, scrollY), scrollX, scrollY }, "");
  } else if (home && location.hash && !traversingHome) {
    // Direct links still land on the requested section, after the page has its enhanced dimensions.
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: "instant" });
  }
  returningToPorts = returningToHome = traversingHome = false;
}

// The port filter: type an app, the list narrows to the ports that match its name or a common alias.
function portFilter() {
  document.querySelectorAll<HTMLElement>("[data-port-list]").forEach((list) => {
    const input = list.querySelector<HTMLInputElement>("[data-port-filter]")!;
    let rows = [...list.querySelectorAll<HTMLElement>("[data-port-keys]")];
    let groups = [...list.querySelectorAll<HTMLElement>("[data-port-group]")];
    const none = list.querySelector<HTMLElement>("[data-port-none]")!;
    const count = list.querySelector<HTMLElement>("[data-port-count]")!;
    const picker = input.getAttribute("role") === "combobox";
    const toolbar = list.querySelector<HTMLElement>("[data-port-toolbar]");
    if (toolbar) {
      const measure = () => list.style.setProperty("--port-toolbar-height", `${toolbar.getBoundingClientRect().height}px`);
      const sizes = new ResizeObserver(measure);
      sizes.observe(toolbar);
      measure();
      teardown.push(() => sizes.disconnect());
    }
    let visible: HTMLAnchorElement[] = [];
    let active: HTMLAnchorElement | undefined;
    // The input keeps DOM focus; assistive technology follows the selected result through aria-activedescendant.
    const select = (option?: HTMLAnchorElement, scroll = false) => {
      if (option === active) return;
      active?.setAttribute("aria-selected", "false");
      active = option;
      if (active) {
        active.setAttribute("aria-selected", "true");
        input.setAttribute("aria-activedescendant", active.id);
        if (scroll) active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    };
    const run = (event?: Event) => {
      if (list.hasAttribute("data-port-catalog") && !list.dataset.portReady) return;
      // Return to the catalog before shrinking it, or the browser can leave the empty state above the viewport.
      // Only typing moves the page; initialization and history restoration retain their saved scroll position.
      if (event?.type === "input" && toolbar && list.getBoundingClientRect().top < parseFloat(getComputedStyle(root).scrollPaddingTop)) {
        list.scrollIntoView({ block: "start", behavior: "instant" });
      }
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      for (const row of rows) {
        const hit = !q || row.dataset.portKeys!.split("|").some((k) => k.includes(q));
        row.hidden = !hit;
        if (hit) shown++;
      }
      groups.forEach((group) => {
        const matches = group.querySelectorAll("[data-port-keys]:not([hidden])").length;
        group.hidden = matches === 0;
        const groupCount = group.querySelector("[data-port-group-count]");
        if (groupCount) groupCount.textContent = String(matches);
      });
      none.hidden = shown > 0;
      none.querySelector("[data-query]")!.textContent = input.value.trim();
      count.textContent = q ? `${shown} of ${rows.length}` : `${rows.length} ${rows.length === 1 ? "port" : "ports"}`;
      visible = rows.filter((row) => !row.hidden).map((row) => row.querySelector<HTMLAnchorElement>("a")!);
      if (picker) select(visible[0]);
      if (list.closest("main")) {
        history.replaceState({ ...history.state, portList: { query: input.value, scrollX, scrollY } }, "");
      }
    };
    const jump = (e: KeyboardEvent) => {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || !visible.length) return;
      if (e.key === "Enter") {
        e.preventDefault();
        (active ?? visible[0]).click();
      } else if (picker && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const i = active ? visible.indexOf(active) : -1;
        const next = (i + (e.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length;
        select(visible[next], true);
      } else if (!picker && e.key === "ArrowDown") {
        e.preventDefault();
        visible[0].focus();
      }
    };
    const point = (e: PointerEvent) => {
      if (!picker || e.pointerType !== "mouse") return;
      const option = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('[role="option"]') : null;
      if (option && option !== active && visible.includes(option)) select(option);
    };
    const loaded = () => {
      rows = [...list.querySelectorAll<HTMLElement>("[data-port-keys]")];
      groups = [...list.querySelectorAll<HTMLElement>("[data-port-group]")];
      run();
    };
    input.addEventListener("input", run);
    input.addEventListener("keydown", jump);
    list.addEventListener("pointermove", point);
    list.addEventListener("ports:loaded", loaded);
    run();
    teardown.push(() => {
      input.removeEventListener("input", run);
      input.removeEventListener("keydown", jump);
      list.removeEventListener("pointermove", point);
      list.removeEventListener("ports:loaded", loaded);
    });
  });
}

// The living field. Its canvas persists across page changes, so it is made once, after the code face has loaded
// (the glyphs and the lettered shapes are drawn in it) and the page has painted and gone quiet, so the hero comes
// in without a stall; afterwards it is only told about each new page's anchors.
let field: Field | null = null;
let starting: Promise<void> | undefined;
function living() {
  starting ??= (async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-living-field]");
    try {
      // taste-skill-ignore: the field's glyphs are drawn in the code face
      await Promise.all([document.fonts.load('700 220px "JetBrains Mono"'), document.fonts.load('600 46px "JetBrains Mono"')]);
    } catch {}
    await new Promise<void>((resolve) => (window.requestIdleCallback ? requestIdleCallback(() => resolve(), { timeout: 500 }) : setTimeout(resolve, 60)));
    try {
      field = canvas ? await createField(canvas, flavorData() as never, currentFlavor()) : null;
    } catch (error) {
      console.warn("Living field unavailable:", error);
      field = null;
    }
    root.dataset.glyphs = field ? "live" : "off";
  })();
  starting.then(() => {
    field?.flavor(currentFlavor());
    field?.refresh();
  });
}
onFlavor((id) => field?.flavor(id));

// after-swap runs inside the view transition, before the new page is painted.
restorePageLayout();
document.addEventListener("astro:after-swap", restorePageLayout);

// The title's cursor blinks on a timer: two style changes a second, where a CSS animation restyles every frame.
function blink() {
  const cursors = [...document.querySelectorAll<HTMLElement>(".cursor")];
  if (!cursors.length || still()) return () => {};
  const timer = setInterval(() => cursors.forEach((c) => c.classList.toggle("is-off")), 550);
  return () => clearInterval(timer);
}

document.addEventListener("astro:page-load", () => {
  syncFlavorUi();
  reveals();
  teardown.push(blink());
  teardown.push(faqAccordions());
  document.querySelectorAll("[data-port-shortcut]").forEach((el) => {
    el.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";
  });
  living();
});

document.addEventListener("astro:before-swap", (event) => {
  cancelPreparationScroll();
  if (event.from.pathname === "/" && event.to.pathname !== "/" && event.navigationType !== "traverse") rememberHome();
  interruptOnScroll(event.viewTransition);
  if (scrolledDuringPreparation) event.viewTransition.skipTransition();
  teardown.forEach((fn) => fn());
  teardown = [];
  const dialog = document.querySelector<HTMLDialogElement>("#port-finder");
  if (dialog) { cancelFinderClose(dialog); dialog.close(); }
  closeMenus();
});
