// The living field: one WebGL canvas behind every page, a few thousand code glyphs drawn as points in a single
// draw call. Elements marked data-glyph="<shape>" are anchors. The glyphs gather into the shape of the anchor
// nearest the middle of the screen, and when another anchor takes over (you scroll, a story step changes, you
// follow a link) every glyph flies from where it is to its place in the new shape. The canvas persists across
// page transitions, so the flight carries on from one page into the next.
//
// Colors are the current flavor's roles. A flavor switch follows the page's palette wipe, or eases every glyph
// into its new color outside a scan. The hue wheel rebuilds itself, so its glyphs fly to the new flavor's accents.
//
// An anchor can also scrub a flight instead of starting one: with data-glyph-to and data-glyph-mix (0 to 1) its
// glyphs hold a point on the way from its shape to the next, so scroll drives the flight, both ways.
//
// A shape can be alive (the hero's chameleon): it then lays itself out again every frame while it is the target,
// can take a click for itself, and can be drawn flat, as text on a character grid.
//
// With reduced motion the glyphs still take each shape, at once and at rest: no flight, drift, turning, bursts or life.
//
// Cost, for slow phones as much as fast desktops:
// - Starting up never holds the page: the shaders compile in the background, and the atlas, the buffers and the
//   first shape each get a task of their own, so the page stays free to answer between them.
// - The frame loop never reads layout. Anchors are measured when the page scrolls or something changes size (and
//   once a second besides), and every frame works from those measurements.
// - Per frame, a living shape sends its positions and one packed byte each for glyph, color and alpha; nothing
//   else goes to the GPU, and nothing is reallocated.
// - A glyph that would not show is not drawn at all (no point, no pixels).
// - At rest (nothing flying, nothing alive, no wave) the field draws at half rate.
// - It adapts: fewer glyphs and a lower resolution on low-memory devices, the resolution steps down if frames
//   start to drop, and a living shape moves at half rate if its own work runs over budget.
// - Scrolling never waits on it. A phone (Safari above all) scrolls the page on its own, ahead of the page's
//   script, so a canvas fixed to the screen and redrawn to follow a scrolling anchor always trails it and judders.
//   While the glyphs rest on an anchor that scrolls with the page, the canvas is laid in the page instead, taller
//   than the screen, and scrolls with it as the page's own content does; their positions then do not depend on the
//   scroll at all. Only as the screen nears one of its ends is it moved on (and redrawn, in the same frame). Shapes
//   that belong to the screen (the faint field) or to something pinned to it (a sticky stage, while it is stuck)
//   keep a canvas fixed to the screen.
//   The canvas keeps its size when a phone's toolbars come and go, so scrolling never reallocates or clears it.
import { COLORS, colorIndex, field, icon, lettering, mark, portSpiral, story, wheel, type Shape } from "./shapes";
import { chameleon } from "./chameleon";

type Flavor = { roles: Record<string, string>; colors: Record<string, string>; accents: [string, number, number][]; light: boolean };

const ATTRS = ["a_from", "a_to", "a_prev", "a_next"];
const VERTEX = `
precision highp float;
attribute vec3 a_from;
attribute vec3 a_to;
attribute vec4 a_prev;   // before: glyph, color index, alpha, arc
attribute vec4 a_next;   // after, as bytes: glyph, color index, alpha (0 to 255), delay (0 to 255)
uniform vec2 u_view;
uniform float u_dpr;
uniform vec4 u_fromBox;  // center x, center y, pixels per unit across, down
uniform vec4 u_toBox;
uniform vec2 u_fromTurn; // spin, tilt
uniform vec2 u_toTurn;
uniform vec2 u_size;     // glyph size in pixels, before and after
uniform vec2 u_flat;     // drawn on a text grid (1) or in depth (0), before and after
uniform float u_progress;
uniform float u_time;
uniform float u_wobble;
uniform vec3 u_pointer;  // x, y, attention
uniform vec4 u_bursts[4];
uniform vec3 u_colors[${COLORS.length}];
varying vec3 v_color;
varying float v_alpha;
varying float v_glyph;
const float SPREAD = 0.42;
vec3 place(vec3 p, vec4 box, vec2 t) {
  float c = cos(t.x), s = sin(t.x);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  c = cos(t.y); s = sin(t.y);
  p = vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
  float k = 3.2 / (3.2 + p.z);
  return vec3(box.x + p.x * box.z * k, box.y - p.y * box.w * k, k);
}
float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(2.0 - 2.0 * t, 3.0) * 0.5; }
void main() {
  float delay = a_next.w / 255.0;
  float e = ease(clamp((u_progress - delay * SPREAD) / (1.0 - SPREAD), 0.0, 1.0));
  vec3 A = place(a_from, u_fromBox, u_fromTurn);
  vec3 B = place(a_to, u_toBox, u_toTurn);
  vec2 travel = B.xy - A.xy;
  vec2 pos = mix(A.xy, B.xy, e) + vec2(-travel.y, travel.x) * sin(3.14159 * e) * (a_prev.w - 0.5) * 0.7;
  float phase = delay * 6.2832 + a_prev.w * 17.0;
  pos += vec2(sin(u_time * 0.8 + phase), cos(u_time * 0.63 + phase * 1.3)) * u_wobble;
  float k = mix(A.z, B.z, e);

  vec2 d = pos - u_pointer.xy;
  float dist = length(d);
  vec2 dir = d / max(dist, 0.001);
  float force = exp(-dist * dist / 7800.0) * u_pointer.z;
  pos += (dir * 36.0 + vec2(-dir.y, dir.x) * 12.0 * sin(dist * 0.08 - u_time * 3.0)) * force;

  float light = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 b = u_bursts[i];
    float age = u_time - b.z;
    if (b.w <= 0.0 || age < 0.0) continue;
    vec2 o = pos - b.xy;
    float r = length(o);
    float wave = exp(-pow((r - age * 760.0) / 120.0, 2.0)) * (1.0 - smoothstep(0.2, 1.6, age)) * b.w;
    pos += o / max(r, 0.001) * wave * 80.0 + vec2(-o.y, o.x) / max(r, 0.001) * wave * 18.0;
    light += wave;
  }

  float grid = mix(u_flat.x, u_flat.y, e);
  float depth = mix(0.45 + 0.55 * smoothstep(0.72, 1.3, k), 1.0, grid);
  v_alpha = clamp(mix(a_prev.z, a_next.z / 255.0, e) * depth + light * 0.5 + force * 0.2, 0.0, 1.0);
  // A glyph too faint to show is not drawn: no point, so no pixels to fill.
  if (v_alpha < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec2 clip = pos / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = mix(u_size.x, u_size.y, e) * mix(k, 1.0, grid) * u_dpr * (1.0 + force * 0.3);
  v_glyph = floor((e < 0.5 ? a_prev.x : a_next.x) + 0.5);
  v_color = mix(u_colors[int(a_prev.y + 0.5)], u_colors[int(a_next.y + 0.5)], e);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_atlas;
varying vec3 v_color;
varying float v_alpha;
varying float v_glyph;
void main() {
  vec2 cell = vec2(mod(v_glyph, 16.0), floor(v_glyph / 16.0));
  float a = texture2D(u_atlas, (cell + gl_PointCoord) / vec2(16.0, 8.0)).a * v_alpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(v_color * a, a);
}`;

const SPREAD = 0.42;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// The same projection as the vertex shader, for taking a snapshot of the glyphs mid-flight.
function place(out: number[], x: number, y: number, z: number, box: number[], turn: number[]) {
  let c = Math.cos(turn[0]), s = Math.sin(turn[0]);
  [x, z] = [c * x + s * z, -s * x + c * z];
  c = Math.cos(turn[1]); s = Math.sin(turn[1]);
  [y, z] = [c * y - s * z, s * y + c * z];
  const k = 3.2 / (3.2 + z);
  out[0] = box[0] + x * box[2] * k;
  out[1] = box[1] - y * box[3] * k;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// The glyphs, white on clear, one 64-pixel cell each. Power-of-two sized so it can be mipmapped: a glyph drawn
// small reads a smaller copy, which is both sharper and cheaper for the GPU than sampling the big one.
function atlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 46px "JetBrains Mono", ui-monospace, monospace`; // taste-skill-ignore: the glyphs are code characters
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 94; i++) ctx.fillText(String.fromCharCode(33 + i), (i % 16) * 64 + 32, Math.floor(i / 16) * 64 + 34);
  return canvas;
}

// Give the page a turn: the next task, or the scheduler's own yield where there is one.
const yieldTask = () => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export interface Field {
  refresh(): void;
  burst(x: number, y: number): void;
  flavor(id: string): void;
  destroy(): void;
}

export async function createField(canvas: HTMLCanvasElement, flavors: Record<string, Flavor>, initial: string): Promise<Field | null> {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) return null;

  // Compile and link without asking how it went: asking makes the page wait for the driver. With the parallel
  // compile extension the program is polled, frame by frame, while the rest is set up.
  const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  const shader = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const program = gl.createProgram()!;
  const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  ATTRS.forEach((name, i) => gl.bindAttribLocation(program, i, name));
  gl.linkProgram(program);
  await yieldTask();

  // How much this device should be asked to do. A low-memory device (most low-end phones) gets fewer glyphs and
  // a lower resolution from the start; the rest adapts as it runs.
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 2;
  const small = Math.min(innerWidth, innerHeight) < 640 || innerWidth < 760;
  const N = small ? (weak ? 2000 : 2800) : weak ? 4400 : 6400;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] || 64;
  const minDpr = 1;
  let dpr = Math.max(minDpr, Math.min(devicePixelRatio || 1, weak ? 1.25 : small ? 1.5 : 1.75));

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gl.ALPHA, gl.UNSIGNED_BYTE, atlas());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  await yieldTask();

  // Particle state. "from" is always a snapshot in screen pixels; "to" is a shape in its own units. "prev" is what
  // each glyph was (glyph, color, alpha, and the arc of its flight), "next" what it becomes (glyph, color, alpha,
  // and its delay), packed into bytes so a living shape sends little each frame.
  const from = new Float32Array(N * 3);
  const prev = new Float32Array(N * 4);
  const next = new Uint8ClampedArray(N * 4);
  const delay = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    next[i * 4 + 3] = Math.round(Math.random() * 255);
    delay[i] = next[i * 4 + 3] / 255;
    prev[i * 4 + 3] = Math.random();
  }
  const buffers = [
    [3, gl.FLOAT, from.byteLength], [3, gl.FLOAT, N * 12], [4, gl.FLOAT, prev.byteLength], [4, gl.UNSIGNED_BYTE, next.byteLength],
  ].map(([size, type, bytes], loc) => {
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, false, 0, 0);
    return buffer;
  });
  const upload = (k: number, data: ArrayBufferView) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[k]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  };
  const FROM = 0, TO = 1, PREV = 2, NEXT = 3;
  // What a glyph becomes: its glyph, color and alpha in the packed bytes.
  const become = (s: Shape) => {
    for (let i = 0; i < N; i++) {
      next[i * 4] = s.glyph[i];
      next[i * 4 + 1] = s.role[i];
      next[i * 4 + 2] = s.alpha[i] * 255;
    }
  };

  // --- Colors -------------------------------------------------------------------------------------------------

  let flavorId = initial;
  const palette = (id: string) => {
    const f = flavors[id];
    return COLORS.flatMap((name) => hex(name === "brandTeal" ? flavors.night.colors.teal : f.roles[name] ?? f.colors[name] ?? f.roles.fg));
  };
  const colors = new Float32Array(palette(flavorId));
  let colorGoal = palette(flavorId);

  // --- Shapes -------------------------------------------------------------------------------------------------

  const shapes = new Map<string, Shape>();
  const accentsOf = (id: string) => flavors[id].accents;
  const build = (spec: string, el: HTMLElement | null): Shape => {
    const [kind, ...rest] = spec.split(":");
    const arg = rest.join(":");
    if (kind === "mark") return mark(N);
    if (kind === "chameleon") return chameleon(N, small);
    // Short words in small frames: fewer, larger glyphs read better than a fine dust.
    if (kind === "text") return lettering(arg, N, { seed: arg.length, fill: 0.62 });
    if (kind === "story") return story(Number(arg) || 1, N, small);
    // A port's own icon: the anchor carries the logo's path, or the word to letter where there is no logo.
    if (kind === "icon") {
      const text = el?.dataset.glyphText;
      if (el?.dataset.glyphPath) return icon(el.dataset.glyphPath, N, { count: small ? 900 : 1500, seed: arg.length, reach: 1.3, haze: 0.1 });
      if (text) return lettering(text, N, { count: Math.round((small ? 260 : 420) * Math.sqrt(text.length)), seed: arg.length, reach: 1.25, haze: 0.1 });
    }
    if (kind === "wheel") return wheel(accentsOf(arg || flavorId), N);
    if (kind === "port-spiral" && el?.dataset.spiralIcons && el.dataset.spiralMark) {
      return portSpiral(JSON.parse(el.dataset.spiralIcons), JSON.parse(el.dataset.spiralMark), N, small);
    }
    return field(N, small);
  };
  // The plain wheel follows the site's flavor; "wheel:paper" is always Paper.
  const resolve = (spec: string) => (spec === "wheel" ? `wheel:${flavorId}` : spec);
  const shape = (key: string, el: HTMLElement | null = null) => {
    let s = shapes.get(key);
    if (!s) shapes.set(key, (s = build(key, el)));
    return s;
  };

  // --- Where the anchors are ----------------------------------------------------------------------------------
  // Measured on scroll (when the page has just laid itself out, so measuring costs nothing), when something
  // changes size, and once a second in case something moved without either. Frames only read the measurements.

  let anchors: HTMLElement[] = [];
  const rects = new Map<HTMLElement, DOMRect>(), stuck = new Map<HTMLElement, boolean>();
  // The scroll the rectangles were measured at, and the page's height (its content's, never the canvas's).
  let stale = true, measuredAt = 0, measuredScroll = 0, pageH = 0;
  const measure = () => {
    rects.clear();
    stuck.clear();
    for (const el of anchors) {
      if (!el.isConnected) continue;
      rects.set(el, el.getBoundingClientRect());
      // Inside a sticky stage, whether the stage is stuck to the screen right now, or still scrolling with the
      // page on its way in or out.
      const h = holderOf(el);
      if (h) stuck.set(el, h.fixed || Math.abs(h.el.getBoundingClientRect().top - h.top) < 1);
    }
    measuredScroll = scrollY;
    pageH = (document.body.getBoundingClientRect?.().bottom ?? 0) + scrollY;
    stale = false;
    measuredAt = performance.now();
  };
  const rectOf = (el: HTMLElement) => {
    let r = rects.get(el);
    if (!r) rects.set(el, (r = el.getBoundingClientRect()));
    return r;
  };
  const sizes = new ResizeObserver(() => { stale = true; wake(); });

  // --- Targets ------------------------------------------------------------------------------------------------

  let target: { el: HTMLElement | null; key: string; shape: Shape } = { el: null, key: "field", shape: shape("field") };
  let fromBox = [0, 0, 1, -1], fromTurn = [0, 0], fromSize = 12, fromFlat = 0;
  let progress = 0, clock = 0, last = 0, raf = 0, alive = true, ready = false, visible = !document.hidden;
  // A scrubbed flight: from `pair` to the target, both in the target's anchor, held at `mixGoal` by the page.
  let pair: { key: string; shape: Shape } | null = null, mixGoal = 0;
  // The canvas's size and the screen's, in CSS pixels.
  const view = { w: 1, h: 1 }, screen = { w: 1, h: 1 };
  // Where the canvas is. "screen": fixed to it at its top. "page": laid in the page with its top at `base`, so
  // it scrolls with the page. Every position the glyphs are drawn at is in the canvas's own pixels.
  let frameMode: "screen" | "page" = "screen", base = 0;
  const canvasTop = () => (frameMode === "screen" ? 0 : base - scrollY);
  // Anchors inside something pinned to the screen stay put on it as the page scrolls: always, inside something
  // fixed; inside a sticky stage only while it is stuck (at its `top`), not while it scrolls in or out.
  type Holder = { el: HTMLElement; fixed: boolean; top: number } | null;
  let holders = new WeakMap<HTMLElement, Holder>();
  const holderOf = (el: HTMLElement): Holder => {
    if (holders.has(el)) return holders.get(el)!;
    let h: Holder = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === "fixed") { h = { el: p, fixed: true, top: 0 }; break; }
      if (cs.position === "sticky") { h = { el: p, fixed: false, top: parseFloat(cs.top) || 0 }; break; }
    }
    holders.set(el, h);
    return h;
  };
  const pinned = (el: HTMLElement) => stuck.get(el) ?? false;
  const pointer = { x: -1e4, y: -1e4, attention: 0, goal: 0, at: 0 };
  const bursts = new Float32Array(16);
  let nextBurst = 0, burstAt = -10;

  const boxOf = (t: typeof target) => {
    if (!t.el || t.shape.viewport) return [screen.w / 2, screen.h / 2 - canvasTop(), screen.w / 2, screen.h / 2];
    const r = rectOf(t.el);
    const s = Math.min(r.width / (2 * t.shape.hw), r.height / (2 * t.shape.hh)) * 0.92;
    // On the page, the anchor's place in the page: the same however far it has scrolled since.
    const y = r.top + r.height / 2 + (frameMode === "page" ? measuredScroll - base : 0);
    return [r.left + r.width / 2, y, s, s];
  };

  // Move the canvas, keeping every glyph where it is on the screen now.
  const reframe = (mode: typeof frameMode, top: number) => {
    const before = canvasTop();
    if (mode !== frameMode) canvas.style.position = mode === "screen" ? "fixed" : "absolute";
    frameMode = mode; base = top;
    canvas.style.top = `${mode === "screen" ? 0 : top}px`;
    const dy = before - canvasTop();
    if (!dy) return;
    for (let k = 0; k < 4; k++) bursts[k * 4 + 1] += dy;
    // A scrubbed flight starts from a shape in the anchor's box, which moves with the canvas by itself.
    if (pair) return;
    for (let i = 0; i < N; i++) from[i * 3 + 1] += dy;
    upload(FROM, from);
  };
  // The canvas the target wants: on the page under an anchor that scrolls with it (moved on when the screen nears
  // either end of it), on the screen otherwise, or where the page is too short to hold it.
  const anchorCanvas = () => {
    const el = target.el;
    if (!el || target.shape.viewport || pinned(el) || pageH < view.h + 1) {
      if (frameMode !== "screen") reframe("screen", 0);
      return;
    }
    const slack = view.h - screen.h, edge = slack * 0.2;
    // (Or the page has grown shorter under it: it must never reach past the page's end and lengthen it.)
    const near = frameMode !== "page" || scrollY - base < edge || base + view.h - (scrollY + screen.h) < edge || base + view.h > pageH;
    const next = Math.round(Math.max(0, Math.min(pageH - view.h, scrollY - slack / 2)));
    if (near && (frameMode !== "page" || Math.abs(next - base) > 1)) reframe("page", next);
  };
  const sizeOf = (t: { shape: Shape }, box: number[]) => Math.min(maxPoint / dpr, t.shape.sizePx ?? t.shape.size * box[2]);
  const turnOf = (t: typeof target) => [clock * t.shape.spin, t.shape.tilt];

  // In a scrubbed flight both shapes sit in the same anchor, so the start moves with it.
  const follow = (box: number[]) => {
    if (!pair) return;
    fromBox = box;
    fromTurn = [clock * pair.shape.spin, pair.shape.tilt];
    fromSize = sizeOf(pair, box);
    fromFlat = pair.shape.flat ? 1 : 0;
  };

  // Freeze every glyph where it is now, in screen pixels, as the start of the next flight.
  const snapshot = () => {
    const box = boxOf(target), turn = turnOf(target), p = [0, 0], q = [0, 0];
    follow(box);
    const wobble = motion() ? wobbleOf(target) : 0;
    const s = target.shape;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3, i4 = i * 4, arcR = prev[i4 + 3];
      const e = ease(clamp01((progress - delay[i] * SPREAD) / (1 - SPREAD)));
      sum += e;
      place(p, from[i3], from[i3 + 1], from[i3 + 2], fromBox, fromTurn);
      place(q, s.pos[i3], s.pos[i3 + 1], s.pos[i3 + 2], box, turn);
      const tx = q[0] - p[0], ty = q[1] - p[1], arc = Math.sin(Math.PI * e) * (arcR - 0.5) * 0.7;
      const phase = delay[i] * 6.2832 + arcR * 17;
      from[i3] = p[0] + tx * e - ty * arc + Math.sin(clock * 0.8 + phase) * wobble;
      from[i3 + 1] = p[1] + ty * e + tx * arc + Math.cos(clock * 0.63 + phase * 1.3) * wobble;
      from[i3 + 2] = 0;
      if (e >= 0.5) { prev[i4] = next[i4]; prev[i4 + 1] = next[i4 + 1]; }
      prev[i4 + 2] += (next[i4 + 2] / 255 - prev[i4 + 2]) * e;
    }
    fromSize = fromSize + (sizeOf(target, box) - fromSize) * (sum / N);
    fromFlat = fromFlat + ((target.shape.flat ? 1 : 0) - fromFlat) * (sum / N);
    fromBox = [0, 0, 1, -1];
    fromTurn = [0, 0];
  };

  const retarget = (el: HTMLElement | null, key: string) => {
    snapshot();
    pair = null;
    const s = shape(key, el);
    target.el?.removeAttribute("data-glyph-active");
    el?.setAttribute("data-glyph-active", "");
    target = { el, key, shape: s };
    anchorCanvas();
    become(s);
    upload(FROM, from);
    upload(TO, s.pos);
    upload(PREV, prev);
    upload(NEXT, next);
    progress = motion() ? 0 : 1;
    canvas.dataset.shape = key;
    wake();
  };

  // Lay out a scrubbed flight from shape a to shape b in the current anchor, starting at `at` (0 is a, 1 is b).
  const scrub = (a: string, b: string, at: number) => {
    const el = target.el, A = shape(a, el), B = shape(b, el);
    from.set(A.pos);
    for (let i = 0; i < N; i++) {
      prev[i * 4] = A.glyph[i];
      prev[i * 4 + 1] = A.role[i];
      prev[i * 4 + 2] = A.alpha[i];
    }
    become(B);
    upload(FROM, from);
    upload(TO, B.pos);
    upload(PREV, prev);
    upload(NEXT, next);
    target = { el, key: b, shape: B };
    pair = { key: a, shape: A };
    anchorCanvas();
    progress = mixGoal = at;
    follow(boxOf(target));
    canvas.dataset.shape = b;
    wake();
  };

  // The shape the glyphs are resting in, or null while they fly.
  const resting = () => {
    // A scrubbed flight that has all but arrived counts as there (the easing has long gone flat), so the next pass of
    // a quick scroll picks up at once instead of waiting for the last of it to settle and then rushing to catch up.
    if (pair) return progress >= 0.98 ? target.key : progress <= 0.02 ? pair.key : null;
    return progress >= 1 ? target.key : null;
  };

  // A scrubbing anchor asks for a point between two shapes, or (between scrubs) for one of them. Keep to the
  // current scrubbed flight while it covers the request; start one from wherever the glyphs rest; and otherwise
  // fly there in time, as for any anchor, and pick the scrub up once they arrive.
  const scrubbed = (el: HTMLElement, key: string) => {
    const to = el.dataset.glyphTo;
    if (el !== target.el || !motion()) return false;
    if (to) {
      const mix = clamp01(Number(el.dataset.glyphMix) || 0);
      if (pair?.key === key && target.key === to) { mixGoal = mix; return true; }
      const at = resting();
      if (at === key || at === to) { scrub(key, to, at === to ? 1 : 0); mixGoal = mix; return true; }
      if (at !== null) return false;
      // Still on the way from the last request: finish toward whichever end this one shares.
      if (target.key === key || target.key === to) { mixGoal = 1; return true; }
      if (pair && (pair.key === key || pair.key === to)) { mixGoal = 0; return true; }
      return false;
    }
    if (pair && (key === pair.key || key === target.key)) { mixGoal = key === target.key ? 1 : 0; return true; }
    return false;
  };

  // The anchor nearest the middle of the screen that is at least half in view; the faint field otherwise. An anchor
  // can move its own "middle" with data-glyph-focus (a share of the screen's height), for when something sticky
  // covers the top of the screen.
  const pick = () => {
    let best: HTMLElement | null = null, score = 0;
    for (const el of anchors) {
      const r = rects.get(el);
      if (!r || !r.height) continue;
      const seen = Math.max(0, Math.min(r.bottom, screen.h) - Math.max(r.top, 0)) / Math.min(r.height, screen.h);
      const focus = Number(el.dataset.glyphFocus) || 0.5;
      const centered = 1 - Math.min(1, Math.abs(r.top + r.height / 2 - view.h * focus) / view.h);
      const value = seen + centered * 0.25 + (el === target.el ? 0.15 : 0);
      if (seen > 0.42 && value > score) { best = el; score = value; }
    }
    return best;
  };
  const choose = () => {
    const best = pick();
    const key = resolve(best ? best.dataset.glyph || "mark" : "field");
    if (best && scrubbed(best, key)) return;
    if (best !== target.el || key !== target.key || pair) retarget(best, key);
  };

  // A living shape lays itself out again every frame; its glyphs keep flying to wherever it has moved. Only its
  // positions and the packed glyph, color and alpha go to the GPU.
  const live = (box: number[]) => {
    const s = target.shape;
    if (!s.animate) return;
    s.animate(clock, { x: (pointer.x - box[0]) / box[2], y: (box[1] - (pointer.y - canvasTop())) / box[3], on: pointer.attention });
    for (let i = 0; i < N; i++) {
      next[i * 4] = s.glyph[i];
      next[i * 4 + 1] = s.role[i];
      next[i * 4 + 2] = s.alpha[i] * 255;
    }
    upload(TO, s.pos);
    upload(NEXT, next);
  };

  const wobbleOf = (t: typeof target) => (t.shape.viewport ? 7 : t.shape.flat ? 0 : 0.9);
  const motion = () => !still.matches;

  // --- Drawing ------------------------------------------------------------------------------------------------

  // The canvas: as wide as the page and taller than the screen (by its whole height on a touch screen, which
  // flings further between frames), sized from the tallest the screen has been at this width, so a phone's
  // toolbars sliding away and back never resize it. A new width (the phone turned) starts again.
  const coarse = matchMedia("(pointer: coarse)").matches;
  let tallest = 0;
  const resize = (force = false) => {
    const w = document.documentElement.clientWidth || innerWidth;
    if (w !== screen.w) tallest = 0;
    screen.w = w;
    screen.h = innerHeight;
    tallest = Math.max(tallest, innerHeight);
    const h = Math.ceil(tallest * (coarse ? 2 : 1.6));
    if (!force && w === view.w && h === view.h) return;
    view.w = w;
    view.h = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  let u: (name: string) => WebGLUniformLocation | null = () => null;
  const draw = (box: number[]) => {
    follow(box);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u("u_view"), view.w, view.h);
    gl.uniform1f(u("u_dpr"), dpr);
    gl.uniform4fv(u("u_fromBox"), fromBox);
    gl.uniform4fv(u("u_toBox"), box);
    gl.uniform2fv(u("u_fromTurn"), fromTurn);
    gl.uniform2fv(u("u_toTurn"), turnOf(target));
    gl.uniform2f(u("u_size"), fromSize, sizeOf(target, box));
    gl.uniform2f(u("u_flat"), fromFlat, target.shape.flat ? 1 : 0);
    gl.uniform1f(u("u_progress"), progress);
    gl.uniform1f(u("u_time"), clock);
    gl.uniform1f(u("u_wobble"), motion() ? wobbleOf(target) : 0);
    gl.uniform3f(u("u_pointer"), pointer.x, pointer.y - canvasTop(), target.shape.calm ? 0 : pointer.attention);
    gl.uniform4fv(u("u_bursts[0]"), bursts);
    gl.uniform3fv(u("u_colors[0]"), colors);
    gl.drawArrays(gl.POINTS, 0, N);
  };

  // How the device is keeping up: the time between frames, and the time the frame's own work takes, both eased.
  // Frames that come late for a second step the resolution down (to no lower than 1); a living shape whose work
  // runs long moves at half rate.
  let gap = 16.7, work = 2, late = 0, count = 0, halfLife = false;
  const pace = (now: number, began: number) => {
    const interval = now - last;
    if (last && interval < 100) gap += (interval - gap) * 0.05;
    work += (performance.now() - began - work) * 0.05;
    late = gap > 24 && clock > 2 ? late + 1 : 0;
    if (late > 60 && dpr > minDpr) {
      dpr = Math.max(minDpr, dpr - 0.25);
      resize(true);
      late = 0;
      gap = 16.7;
    }
    halfLife = halfLife ? work > 3 : work > 7;
  };

  const frame = (now: number) => {
    // Keep ownership of the loop while drawing: choose() can retarget or scrub,
    // both of which call wake(). Clearing raf here would fork another loop.
    if (!alive || !visible) { raf = 0; return; }
    const began = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    const moving = motion();
    if (moving) clock += dt;
    count++;
    if (stale || began - measuredAt > 1000) measure();
    choose();
    // Under an anchor that scrolls with the page, the canvas is moved on as the screen nears its ends.
    anchorCanvas();
    if (pair) {
      // A scrubbed flight trails the scroll a little, so a flick still reads as a flight rather than a cut.
      progress += (mixGoal - progress) * (1 - Math.exp(-dt / 0.12));
      if (Math.abs(mixGoal - progress) < 0.002) progress = mixGoal;
    } else progress = moving ? Math.min(1, progress + dt / 1.7) : 1;
    pointer.attention += (pointer.goal - pointer.attention) * (1 - Math.exp(-dt / 0.12));
    const box = boxOf(target);
    if (moving && !pair && (!halfLife || count % 2 === 0)) live(box);
    let settling = false;
    const mix = moving ? 1 - Math.exp(-dt / 0.22) : 1;
    for (let i = 0; i < colors.length; i++) {
      const d = colorGoal[i] - colors[i];
      if (Math.abs(d) > 0.002) settling = true;
      colors[i] += d * mix;
    }
    // At rest (nothing alive, flying, waving or easing, and no recent pointer) every other frame is enough.
    const busy = !!target.shape.animate || !!pair || progress < 1 || settling || clock - burstAt < 1.8 || now - pointer.at < 400;
    if (busy || count % 2 === 0) draw(box);
    pace(now, began);
    last = now;
    raf = moving || settling || progress < 1 ? requestAnimationFrame(frame) : 0;
  };
  const wake = () => {
    if (!raf && alive && ready && visible) { last = 0; raf = requestAnimationFrame(frame); }
  };

  // --- Input --------------------------------------------------------------------------------------------------

  const controller = new AbortController();
  const on = { signal: controller.signal, passive: true } as const;
  // On scroll the page has just been laid out: measure the anchors now, while it is free to.
  addEventListener("scroll", () => { measure(); wake(); }, on);
  addEventListener("resize", () => { resize(); holders = new WeakMap(); stale = true; wake(); }, on);
  // A new page replaces this one under the canvas: hold the glyphs on the screen while it does, so they fly on
  // from where they were seen, whatever the new page's scroll.
  document.addEventListener("astro:before-swap", () => reframe("screen", 0), on);
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || !motion()) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.goal = 1;
    pointer.at = performance.now();
  }, on);
  document.documentElement.addEventListener("pointerleave", () => { pointer.goal = 0; pointer.at = performance.now(); }, on);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; wake(); }, on);
  still.addEventListener("change", () => { progress = 1; wake(); }, on);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); api.destroy(); document.documentElement.dataset.glyphs = "off"; }, { signal: controller.signal });

  const api: Field = {
    // Anchors come and go with pages; look for them again, and watch them (and the page) for changes in size.
    refresh() {
      anchors = [...document.querySelectorAll<HTMLElement>("[data-glyph]")];
      holders = new WeakMap();
      sizes.disconnect();
      sizes.observe(document.body);
      anchors.forEach((el) => sizes.observe(el));
      stale = true;
      wake();
    },
    burst(x, y) {
      if (!motion()) return;
      // A living shape may take the click for itself (the chameleon drops a fly there) instead of a wave.
      // From the screen to the canvas.
      y -= canvasTop();
      const s = target.shape;
      if (s.touch && !pair) {
        const box = boxOf(target);
        if (s.touch((x - box[0]) / box[2], (box[1] - y) / box[3])) { wake(); return; }
      }
      bursts.set([x, y, clock, 1], nextBurst * 4);
      nextBurst = (nextBurst + 1) % 4;
      burstAt = clock;
      wake();
    },
    flavor(id) {
      if (!flavors[id] || id === flavorId) return;
      flavorId = id;
      colorGoal = palette(id);
      if (document.documentElement.dataset.flavorSwitch !== undefined) {
        // The reveal needs a fully recolored new frame, not a snapshot mid-ease.
        colors.set(colorGoal);
        draw(boxOf(target));
      }
      wake();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      controller.abort();
      sizes.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };

  // The first shape, built in a task of its own while the shaders finish compiling.
  await yieldTask();
  anchors = [...document.querySelectorAll<HTMLElement>("[data-glyph]")];
  resize();
  measure();
  const first = pick();
  if (first) shape(resolve(first.dataset.glyph || "mark"), first);
  await yieldTask();
  if (parallel) while (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) await nextFrame();
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getShaderInfoLog(vs) || gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(program) || "link");
  }
  gl.useProgram(program);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  u = (name) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name)!;
  };
  gl.uniform1i(u("u_atlas"), 0);

  // The first flight: glyphs rise from below the fold into the first shape, fading in as they come.
  for (let i = 0; i < N; i++) {
    from[i * 3] = Math.random() * view.w;
    from[i * 3 + 1] = screen.h * (0.55 + Math.random() * 0.9);
    prev[i * 4] = Math.floor(Math.random() * 94);
    prev[i * 4 + 1] = colorIndex("comment");
    prev[i * 4 + 2] = 0;
  }
  upload(FROM, from);
  ready = true;
  api.refresh();
  measure();
  retarget(null, "field");
  choose();
  return api;
}
