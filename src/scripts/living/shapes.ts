// The shapes the living field can take. A shape gives every glyph a target: a position in the shape's own units
// (y up, z away from the viewer), the character it shows, the role that colors it and how strongly it shows.
// Glyphs a shape does not need drift around it as dust, so every shape uses the whole field.
import { ART, TOKENS } from "../../lib/story.mjs";
import { SPIRAL } from "../../lib/port-spiral.mjs";

// Every color a glyph can take: roles first, then palette names. The index is what the GPU reads.
export const COLORS = [
  "fgMuted", "comment", "lineNumber", "fg", "keyword", "builtin", "function", "type", "string", "number",
  "constant", "variable", "property", "parameter", "operator", "punctuation", "decorator", "attribute", "tag", "escape",
  "regex", "namespace", "error", "warning", "info", "hint", "success", "accent", "overlay", "surface2",
  "teal", "mint", "aqua", "steel", "amber", "copper", "flare", "moss", "orchid", "rose",
  "brandTeal", // The footer mark keeps Night's teal in every flavor.
] as const;
export type Color = (typeof COLORS)[number];
export const C = Object.fromEntries(COLORS.map((c, i) => [c, i])) as Record<Color, number>;
export const colorIndex = (name: string) => C[name as Color] ?? C.fg;

// The atlas holds printable ASCII, so a glyph is its character code less 33.
export const glyphOf = (ch: string) => {
  const code = ch.charCodeAt(0) - 33;
  return code >= 0 && code < 94 ? code : 13; // "."
};

export interface Shape {
  n: number;
  pos: Float32Array;
  glyph: Float32Array;
  role: Float32Array;
  alpha: Float32Array;
  // Half the shape's width and height in its units, for fitting it into a box on the page.
  hw: number;
  hh: number;
  // Glyph size in shape units, or in CSS pixels when the shape fills the viewport.
  size: number;
  sizePx?: number;
  // Turning speed around the vertical axis (rad/s) and a fixed tilt toward the viewer.
  spin: number;
  tilt: number;
  // The shape stretches to the viewport instead of keeping its proportions in an anchor.
  viewport?: boolean;
  // A living shape moves on its own: called every frame while it is the target, it rewrites pos, glyph, role and
  // alpha in place. `look` is the pointer in the shape's units, with how present it is (0 to 1).
  animate?: (t: number, look: { x: number; y: number; on: number }) => void;
  // Drawn as text on a character grid: every glyph the same size, no perspective in the glyphs and no drift.
  flat?: boolean;
  // A click at (x, y) in the shape's units. A shape that takes it returns true, and the field sends no wave.
  touch?: (x: number, y: number) => boolean;
  // The pointer does not push its glyphs aside (it answers the pointer in its own way).
  calm?: boolean;
}

// A small seeded generator, so a shape comes out the same every time it is built.
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const empty = (n: number, hw: number, hh: number, size: number): Shape => ({
  n, hw, hh, size, spin: 0, tilt: 0,
  pos: new Float32Array(n * 3), glyph: new Float32Array(n), role: new Float32Array(n), alpha: new Float32Array(n),
});

const set = (s: Shape, i: number, x: number, y: number, z: number, ch: string | number, role: number, alpha: number) => {
  s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z;
  s.glyph[i] = typeof ch === "number" ? ch : glyphOf(ch);
  s.role[i] = role;
  s.alpha[i] = alpha;
};

const shuffle = <T>(list: T[], rnd: () => number) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// Code characters by role, and how much of a lettered shape each role covers.
const INK: [Color, string, number][] = [
  ["keyword", "{}()[]<>", 0.26],
  ["function", "fnxyz", 0.12],
  ["type", "TSKV", 0.08],
  ["string", "\"'abcs", 0.17],
  ["number", "0123456789", 0.12],
  ["constant", "TF01", 0.07],
  ["operator", "=+-*/%&|!", 0.1],
  ["decorator", "@#$", 0.08],
];
const CUT = INK.map((_, i) => INK.slice(0, i + 1).reduce((sum, r) => sum + r[2], 0));
const pick = (s: string, rnd: () => number) => s[Math.floor(rnd() * s.length)];

// Which role a point falls in: three slow waves summed and cut into bands, so color runs through a shape in
// streaks the way it runs through a file.
const band = (x: number, y: number) => {
  const v = (Math.sin(x * 2.1) + Math.sin(y * 3.3 + 1.2) + Math.sin((x + y) * 1.3 + 0.4)) / 3;
  const u = Math.asin(Math.max(-1, Math.min(1, v))) / Math.PI + 0.5;
  const i = CUT.findIndex((c) => u <= c);
  return i < 0 ? INK.length - 1 : i;
};

// Spare glyphs: a faint cloud around the shape that travels with it.
export function dust(s: Shape, from: number, rnd: () => number, reach = 1.5, strength = 0.14) {
  for (let i = from; i < s.n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * reach;
    const quiet = rnd() < 0.8;
    set(s, i, Math.cos(a) * r * s.hw, Math.sin(a) * r * s.hh, (rnd() - 0.5) * 0.6,
      Math.floor(rnd() * 94), quiet ? C.comment : C[INK[Math.floor(rnd() * INK.length)][0]], strength * (0.3 + 0.7 * rnd()));
  }
}

// --- Outlines: lettering in the code face, or an app's icon, filled with code glyphs --------------------------

// How a filled outline is colored. Without `roles` the default streaks of code color run through it; with `roles`
// the streaks use only those; with `perChar` each character of a word takes its own color.
interface Ink { roles?: Color[]; perChar?: Color[] }
interface Fill extends Ink {
  // The share of the field's glyphs the outline takes, or, with `count`, how many; the rest drift around it.
  fill?: number;
  count?: number;
  seed?: number;
  // How far the spare glyphs drift (in half-heights) and how much they show.
  reach?: number;
  haze?: number;
  // Keep the drawing's full canvas frame instead of cropping to the filled outline.
  frame?: boolean;
}

const FACE = (px: number) => `700 ${px}px "JetBrains Mono", ui-monospace, monospace`; // taste-skill-ignore: lettering in the code face

// Draw something white on a canvas, then lay a monospace grid of glyphs over whatever was drawn.
function outline(draw: (ctx: CanvasRenderingContext2D) => [w: number, h: number], n: number, opts: Fill, column?: (x: number) => number): Shape {
  const { fill = 0.84, count, seed = 7, reach = 1.35, haze = 0.16 } = opts;
  const rnd = random(seed);
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const [w, h] = draw(probe);
  const data = probe.getImageData(0, 0, w, h).data;
  const inside = (x: number, y: number) => data[((y | 0) * w + (x | 0)) * 4 + 3] > 128;

  let area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) {
    area++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (opts.frame) { x0 = 0; x1 = w - 1; y0 = 0; y1 = h - 1; }
  const unit = 2 / Math.max(y1 - y0, 1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const target = Math.min(n, count ?? Math.floor(n * fill));
  // A code grid: columns closer than rows, as in a monospace file.
  const step = Math.sqrt(area / (0.72 * target));
  const points: [number, number][] = [];
  for (let y = y0 + step / 2; y <= y1; y += step) {
    for (let x = x0 + step * 0.36; x <= x1; x += step * 0.72) if (inside(x, y)) points.push([x, y]);
  }
  shuffle(points, rnd);
  const used = Math.min(points.length, target);
  const s = empty(n, ((x1 - x0) / 2) * unit, 1, step * unit * 1.55);
  const streaks = opts.roles ? INK.filter(([role]) => opts.roles!.includes(role)) : INK;
  for (let i = 0; i < used; i++) {
    const [x, y] = points[i];
    const lx = (x - cx) * unit, ly = (cy - y) * unit;
    const muted = rnd() < 0.14;
    let role: Color, chars: string;
    if (opts.perChar && column) {
      role = opts.perChar[Math.min(opts.perChar.length - 1, column(x))];
      chars = CHARS[role] ?? "{}";
    } else if (streaks.length) {
      [role, chars] = streaks[Math.floor((band(lx, ly) / INK.length) * streaks.length)];
    } else {
      role = opts.roles![Math.floor(((Math.sin(lx * 2.1) + Math.sin(ly * 3.3 + 1.2) + 2) / 4) * opts.roles!.length) % opts.roles!.length];
      chars = CHARS[role] ?? "/*-.";
    }
    set(s, i, lx, ly, (rnd() - 0.5) * 0.08, pick(chars, rnd), muted ? C.comment : C[role], muted ? 0.6 : 1);
  }
  dust(s, used, rnd, reach, haze);
  return s;
}

// Characters for colors the code streaks do not cover.
export const CHARS: Partial<Record<Color, string>> = {
  ...Object.fromEntries(INK.map(([role, chars]) => [role, chars])),
  fgMuted: "abcxyz;.", comment: "/*-", lineNumber: "0123456789", overlay: ".:", surface2: ".:",
  error: "E!x", warning: "W!?", info: "Ii", hint: "H?", success: "+=", accent: "{}",
};

export function lettering(text: string, n: number, opts: Fill = {}): Shape {
  const px = 220;
  let advance = 0;
  return outline((ctx) => {
    ctx.font = FACE(px);
    advance = ctx.measureText("M").width;
    const w = Math.ceil(ctx.measureText(text).width) + 40, h = Math.ceil(px * 1.4);
    ctx.canvas.width = w;
    ctx.canvas.height = h;
    ctx.font = FACE(px);
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, 20, h / 2);
    return [w, h];
  }, n, opts, (x) => Math.floor((x - 20) / advance));
}

// The portfolio's livingCode.ts mark motion: independent, slow XY drift and a deeper breathing wave.
export function mark(n: number): Shape {
  const s = lettering("[lc]", n);
  const home = s.pos.slice();
  const phase = new Float32Array(n);
  const rnd = random(29);
  for (let i = 0; i < n; i++) phase[i] = rnd() * Math.PI * 2;
  // The surrounding dust belongs to the mark too; neither it nor the letters follows the flavor.
  s.role.fill(C.brandTeal);
  s.animate = (t) => {
    for (let i = 0; i < n; i++) {
      const p = i * 3, a = phase[i];
      s.pos[p] = home[p] + Math.sin(t * 0.27 + a) * 0.018;
      s.pos[p + 1] = home[p + 1] + Math.cos(t * 0.32 + a * 4 / (Math.PI * 2)) * 0.02;
      s.pos[p + 2] = home[p + 2] + Math.sin(t * 0.36 + a) * 0.16;
    }
  };
  return s;
}

// An app's icon, from a 24 by 24 SVG path (Simple Icons).
export function icon(path: string, n: number, opts: Fill = {}): Shape {
  const px = 360, pad = 20;
  return outline((ctx) => {
    ctx.canvas.width = ctx.canvas.height = px + pad * 2;
    ctx.translate(pad, pad);
    ctx.scale(px / 24, px / 24);
    ctx.fillStyle = "#fff";
    ctx.fill(new Path2D(path));
    return [px + pad * 2, px + pad * 2];
  }, n, opts);
}

// --- The palette story: code tokens and glyph-built forms, in the colors that step adds ---------------------

export function story(step: number, n: number, small: boolean): Shape {
  const token = TOKENS[Math.max(0, Math.min(TOKENS.length - 1, step - 1))];
  if ("paths" in token) {
    // One column per role: the data blocks and diagnostic signs keep their own color as the glyphs re-form.
    return outline((ctx) => {
      ctx.canvas.width = ART.width;
      ctx.canvas.height = ART.height;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = ART.stroke;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      token.paths.forEach((path) => ctx.stroke(new Path2D(path)));
      return [ART.width, ART.height];
    }, n, {
      perChar: token.roles as Color[], count: token.paths.length * (small ? 150 : 300),
      seed: 13 + step, reach: 1.08, haze: 0.035,
    }, (x) => Math.floor(x / (ART.width / token.paths.length)));
  }
  const { text, ...ink } = token as { text: string } & Ink;
  // Few enough glyphs that each one reads as a character, and a faint haze close around the word.
  return lettering(text, n, { ...ink, count: Math.round((small ? 300 : 520) * Math.sqrt(text.length)), seed: 13 + step, reach: 1.15, haze: 0.07 });
}

// --- The accents on an OKLCH hue wheel: angle is hue, distance from the middle is chroma ---------------------

export type Accent = [name: string, chroma: number, hue: number];
const MAX_CHROMA = 0.17;

export function wheel(accents: Accent[], n: number): Shape {
  const rnd = random(23);
  const s = empty(n, 1.12, 1.12, 0.05);
  let i = 0;
  // Rings at chroma 0.05, 0.10 and 0.15, drawn in dots.
  const rings = [0.05, 0.1, 0.15].map((c) => c / MAX_CHROMA);
  const ringGlyphs = Math.floor(n * 0.2);
  const total = rings.reduce((a, r) => a + r, 0);
  for (const r of rings) {
    const m = Math.floor((ringGlyphs * r) / total);
    for (let k = 0; k < m; k++) {
      const a = (k / m) * Math.PI * 2;
      set(s, i++, Math.cos(a) * r, Math.sin(a) * r, 0, k % 6 ? "." : ":", C.overlay, 0.75);
    }
  }
  // The gray center every flavor shares.
  const core = Math.floor(n * 0.04);
  for (let k = 0; k < core; k++) {
    const r = 0.06 * Math.sqrt(k / core), a = k * 2.39996;
    set(s, i++, Math.cos(a) * r, Math.sin(a) * r, 0, pick("01", rnd), C.comment, 0.9); // taste-skill-ignore: binary digits as glyphs
  }
  // Each accent: a disc of code glyphs at its hue and chroma, in its own color.
  const per = Math.floor((n * 0.56) / accents.length);
  for (const [name, chroma, hue] of accents) {
    const r = Math.min(1, chroma / MAX_CHROMA), h = (hue * Math.PI) / 180;
    const ax = Math.cos(h) * r, ay = Math.sin(h) * r;
    for (let k = 0; k < per; k++) {
      const d = 0.085 * Math.sqrt((k + 0.5) / per), a = k * 2.39996;
      set(s, i++, ax + Math.cos(a) * d, ay + Math.sin(a) * d, (rnd() - 0.5) * 0.04,
        pick(INK[k % INK.length][1], rnd), colorIndex(name), 1);
    }
  }
  dust(s, i, rnd, 1.25, 0.1);
  return s;
}

// --- Ports: upright app silhouettes along an open spiral ----------------------------------------------------

interface SpiralIcon { path: string; x: number; y: number; size: number; role: Color }
interface SpiralMark { path: string; x: number }

export function portSpiral(icons: SpiralIcon[], mark: SpiralMark[], n: number, small = false): Shape {
  const s = outline((ctx) => {
    ctx.canvas.width = SPIRAL.width;
    ctx.canvas.height = SPIRAL.height;
    ctx.fillStyle = "#fff";
    for (const { path, x, y, size } of icons) {
      ctx.save();
      ctx.translate(x - size / 2, y - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.fill(new Path2D(path));
      ctx.restore();
    }
    ctx.save();
    ctx.translate(390, 368);
    ctx.scale(0.05, -0.05);
    for (const { path, x } of mark) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.fill(new Path2D(path));
      ctx.restore();
    }
    ctx.restore();
    return [SPIRAL.width, SPIRAL.height];
  }, n, { count: small ? 900 : 1500, reach: 1.3, haze: 0.1, seed: 41, frame: true });
  // The same outline, dust and interactions as the individual app icons; only the composition differs.
  for (let i = 0; i < n; i++) {
    const x = s.pos[i * 3] * (SPIRAL.height - 1) / 2 + (SPIRAL.width - 1) / 2;
    const y = (SPIRAL.height - 1) / 2 - s.pos[i * 3 + 1] * (SPIRAL.height - 1) / 2;
    const nearest = icons.find((icon) => Math.abs(x - icon.x) <= icon.size / 2 && Math.abs(y - icon.y) <= icon.size / 2);
    s.role[i] = C[nearest?.role ?? "accent"];
    s.pos[i * 3 + 2] = 0;
  }
  return s;
}

// --- Between anchors: the glyphs loosen into a faint field across the whole screen ---------------------------

export function field(n: number, small: boolean): Shape {
  const rnd = random(5);
  const s = empty(n, 1, 1, 0);
  s.viewport = true;
  s.sizePx = small ? 10 : 12;
  for (let i = 0; i < n; i++) {
    const colored = rnd() < 0.16;
    set(s, i, rnd() * 2.2 - 1.1, rnd() * 2.2 - 1.1, (rnd() - 0.5) * 1.2, Math.floor(rnd() * 94),
      colored ? C[INK[Math.floor(rnd() * INK.length)][0]] : C.comment, rnd() < 0.45 ? 0 : (colored ? 0.13 : 0.075) * (0.35 + 0.65 * rnd()));
  }
  return s;
}
