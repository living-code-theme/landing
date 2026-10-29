// The footer companion is the hero's chameleon itself: the same model, idle life and hop, drawn the way the living
// field draws it (glyphs stamped from one atlas, sized and faded by depth), only small. A click startles it: it
// watches you, hops round if it must, trots off on its own feet, and comes back the same way.
import { createChameleonCompanion } from "./living/chameleon";
import { COLORS } from "./living/shapes";

const LABEL = "Startle the chameleon";
const OVERHANG = 32; // CSS pixels of canvas around the slot (see .chameleon-companion__live)
const CELL = 32; // atlas cell, device pixels: glyphs are drawn at most ~16 device pixels
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
type State = "idle" | "startled" | "turning" | "leaving" | "away" | "returning" | "settling";

// White glyphs on clear, as the field's atlas, at a size fit for a small drawing.
function glyphAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * 16; canvas.height = CELL * 8;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${Math.round(CELL * 0.72)}px "JetBrains Mono", ui-monospace, monospace`; // taste-skill-ignore: code glyphs
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < 94; i++) ctx.fillText(String.fromCharCode(33 + i), (i % 16) * CELL + CELL / 2, Math.floor(i / 16) * CELL + CELL * 0.53);
  return canvas;
}

function companion(button: HTMLButtonElement) {
  const svg = button.querySelector<SVGElement>("[data-chameleon-cameo]")!;
  const canvas = button.querySelector<HTMLCanvasElement>("canvas");
  const ctx = canvas?.getContext("2d");
  const status = button.nextElementSibling!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  let model: ReturnType<typeof createChameleonCompanion> | undefined;
  let atlas: HTMLCanvasElement | undefined;
  const tints = new Map<number, HTMLCanvasElement>();
  let visible = false, ready = false, raf = 0, last = 0, clock = 0, dt = 0;
  let state: State = "idle", stateAt = 0, exitRight = false, base = 0, walkedAtBase = 0, offset = 0, gone = 0;
  let w = 0, h = 0, dpr = 1, scale = 1;
  const look = { x: 0, y: 0, on: 0 };
  const pointer = { x: 0, y: 0, at: -1e9 };

  const tint = (role: number) => {
    let sheet = tints.get(role);
    if (!sheet) {
      sheet = document.createElement("canvas");
      sheet.width = atlas!.width; sheet.height = atlas!.height;
      const c = sheet.getContext("2d")!;
      c.drawImage(atlas!, 0, 0);
      c.globalCompositeOperation = "source-in";
      const name = COLORS[role].replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      c.fillStyle = getComputedStyle(button).getPropertyValue(`--lc-${name}`).trim() || getComputedStyle(button).color;
      c.fillRect(0, 0, sheet.width, sheet.height);
      tints.set(role, sheet);
    }
    return sheet;
  };
  const size = () => {
    const rect = button.getBoundingClientRect();
    w = rect.width + OVERHANG * 2; h = rect.height + OVERHANG * 2;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas!.width = Math.round(w * dpr); canvas!.height = Math.round(h * dpr);
    if (model) scale = Math.min(rect.width / (model.shape.hw * 2 + 0.2), rect.height / (model.shape.hh * 2 + 0.2));
    if (state !== "idle") home();
  };
  const go = (next: State) => { state = next; stateAt = clock; button.dataset.cameoState = next; };
  const home = () => {
    if (model) { model.run(false); model.face(false); }
    base = 0; offset = 0; walkedAtBase = model?.walked ?? 0;
    if (canvas) { canvas.style.transform = ""; canvas.style.opacity = ""; }
    button.removeAttribute("aria-disabled");
    button.setAttribute("aria-label", LABEL);
    go("idle");
  };

  // --- What it does: idle life comes from the model; this only steers the escape and the way back. ----------
  const steer = () => {
    if (!model) return;
    const age = clock - stateAt, travelled = model.walked - walkedAtBase;
    // Its offset follows its own feet, so the planted ones stay put on the page.
    offset = base - travelled * scale;
    const slot = button.getBoundingClientRect().width;
    if (state === "startled" && age > 0.35) {
      if (exitRight) { model.hop(true); go("turning"); } else { model.run(true); go("leaving"); }
    } else if (state === "turning" && !model.busy) { model.run(true); go("leaving"); }
    else if (state === "leaving") {
      // Off it goes; a body length on it fades from sight.
      gone = Math.abs(offset);
      canvas!.style.opacity = String(1 - smooth(slot * 0.5, slot * 1.1, gone));
      if (gone >= slot * 1.1) { model.run(false); go("away"); }
    } else if (state === "away" && age > 0.5 && !model.busy) {
      // Back from where it went, facing home: from the right it walks in forwards; from the left it comes round.
      model.face(!exitRight);
      base = exitRight ? gone : -gone; walkedAtBase = model.walked; offset = base;
      model.run(true); go("returning");
    } else if (state === "returning") {
      canvas!.style.opacity = String(smooth(0, 0.6, 1 - Math.abs(offset) / gone));
      // Stop a little short: the step under way carries it the rest.
      if (Math.abs(offset) < scale * 0.12 || Math.sign(offset) !== Math.sign(base)) { model.run(false); go("settling"); }
    } else if (state === "settling") {
      // Take up what is left of the gap without a skid, then turn back round if it came in from the left.
      if (!model.busy) {
        base -= offset * Math.min(1, dt * 8 + 0.02);
        if (Math.abs(offset) < 0.5) {
          if (!exitRight && !model.facingHome) { model.hop(false); }
          else if (model.facingHome) { home(); status.textContent = "The chameleon is back."; }
        }
      }
    }
    if (state !== "idle") canvas!.style.transform = `translate3d(${offset}px, 0, 0)`;
  };

  const draw = () => {
    const s = model!.shape;
    // Watch the pointer when it is near and has moved lately, as the hero does; while startled, stare at it.
    const rect = canvas!.getBoundingClientRect();
    const cx = rect.left + w / 2, cy = rect.top + h / 2;
    const near = Math.hypot(pointer.x - cx, pointer.y - cy) < 520 && clock - pointer.at < 2.5;
    const want = state === "startled" || (state === "idle" && near) ? 1 : 0;
    look.on += (want - look.on) * Math.min(1, dt * 4);
    look.x = -(pointer.x - cx) / scale; look.y = -(pointer.y - cy) / scale;
    s.animate!(clock, look);
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    const ox = (w / 2) * dpr, oy = (h / 2) * dpr, px = scale * dpr;
    for (let i = 0; i < model!.used; i++) {
      const k = 3.2 / (3.2 + s.pos[i * 3 + 2]);
      // The field's depth cue: far glyphs fade.
      // Small glyphs are a little larger and stronger than the hero's, so the animal reads as solid at this size.
      const a = 1.3 * s.alpha[i] * (0.45 + 0.55 * smooth(0.72, 1.3, k));
      if (a < 0.01) continue;
      const d = 1.25 * s.size * k * px, g = s.glyph[i] | 0;
      ctx!.globalAlpha = Math.min(1, a);
      ctx!.drawImage(tint(s.role[i] | 0), (g % 16) * CELL, (g >> 4) * CELL, CELL, CELL,
        ox - s.pos[i * 3] * k * px - d / 2, oy - s.pos[i * 3 + 1] * k * px - d / 2, d, d);
    }
  };
  const tick = (now: number) => {
    const t = now / 1000;
    dt = last ? Math.min(t - last, 0.05) : 0;
    clock += dt;
    steer();
    draw();
    last = t;
    raf = requestAnimationFrame(tick);
  };
  const sync = () => {
    const live = ready && visible && !document.hidden && !motion.matches;
    if (live && !raf) {
      model ??= createChameleonCompanion();
      size();
      canvas!.hidden = false;
      button.setAttribute("data-cameo-live", "");
      last = 0;
      raf = requestAnimationFrame(tick);
    } else if (!live && raf) {
      cancelAnimationFrame(raf); raf = 0;
      // Scrolled away mid-escape: it is simply home when you come back.
      if (state !== "idle") home();
    }
    if (!live && canvas) { canvas.hidden = true; button.removeAttribute("data-cameo-live"); }
  };

  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { rootMargin: "64px" });
  observer.observe(button);
  const resize = new ResizeObserver(() => { if (raf) size(); });
  resize.observe(button);
  const theme = new MutationObserver(() => tints.clear());
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.at = clock; }, { passive: true, signal: events.signal });
  button.addEventListener("click", (e) => {
    if (state !== "idle") return;
    if (!raf) {
      // Reduced motion (or no canvas): a blink, no escape.
      svg.querySelector('[data-cameo-part="eye"]')?.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 220 });
      status.textContent = "The chameleon blinks at you.";
      return;
    }
    const rect = button.getBoundingClientRect();
    // Keyboard clicks have no position: it looks up at you from in front.
    if (e.detail > 0) { pointer.x = e.clientX; pointer.y = e.clientY; } else { pointer.x = rect.left - 40; pointer.y = rect.top - 40; }
    pointer.at = clock;
    // It faces left. Leave by the nearer edge, hopping round first if that edge is behind it.
    exitRight = innerWidth - rect.right < rect.left * 0.5;
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-label", "The chameleon will be right back");
    status.textContent = "The chameleon ran off. It will be back in a moment.";
    go("startled");
  }, { signal: events.signal });
  motion.addEventListener("change", sync, { signal: events.signal });
  document.addEventListener("visibilitychange", sync, { signal: events.signal });

  button.dataset.cameoState = "idle";
  button.disabled = false;
  if (ctx) void document.fonts.ready.then(() => { atlas = glyphAtlas(); ready = true; sync(); });
  return () => {
    cancelAnimationFrame(raf); raf = 0;
    observer.disconnect(); resize.disconnect(); theme.disconnect(); events.abort();
    if (canvas) canvas.hidden = true;
    button.removeAttribute("data-cameo-live");
  };
}

export function chameleonCameos() {
  const stops = [...document.querySelectorAll<HTMLButtonElement>("[data-cameo-control]")].map(companion);
  return () => stops.forEach((stop) => stop());
}
