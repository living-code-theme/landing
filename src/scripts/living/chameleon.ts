// The hero: a chameleon in the round, built from code glyphs, walking a branch. Every glyph sits on a surface (the
// body and head, the tail, the legs, the turret eyes) and shows as strongly as its surface faces you and the light,
// so the glyphs read as a solid animal. The skin is rough: bumps and scattered tubercles, a ragged crest down the
// spine, a ridge on the casque and a pale serrated crest under the throat.
//
// It is drawn as a terminal would draw it: text on a character grid, shaded with an ASCII ramp, its stripes a hex
// dump and a run of bits.
//
// It moves like a chameleon: in holds and snaps, never a drift. It walks one leg at a time, each foot gripping the
// branch while the others carry it on, hesitating between steps; the branch slides past beneath it, so it stays in
// the frame. Then it stops to hunt: its head jerks round to the bug, its eyes jump about on their own, one to the
// pointer, then both lock on, the tongue shoots out and takes the bug, it gulps, and a new coat is written down it
// from the snout to the tip of the tail. A click near it drops a fly there, and it eats that at once, spinning round
// first if the fly is behind it and turning back afterwards to walk on.
//
// The model is in its own units: x along the body (snout at +x), y up, z away from you. Each frame it is turned a
// little toward you and tipped so you look down on it, then centered for the anchor.
import { C, CHARS, COLORS, dust, empty, glyphOf, random, type Color, type Shape } from "./shapes";

type P2 = [number, number];
type P3 = [number, number, number];

// A smooth curve through points, taken evenly by point index.
function catmull(points: P2[]) {
  const n = points.length - 1;
  return (s: number): P2 => {
    const f = Math.min(n - 1e-6, Math.max(0, s * n)), i = Math.floor(f), t = f - i;
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(n, i + 2)];
    const k = (p: number, q: number, r: number, w: number) =>
      0.5 * (2 * q + (-p + r) * t + (2 * p - 5 * q + 4 * r - w) * t * t + (-p + 3 * q - 3 * r + w) * t * t * t);
    return [k(a[0], b[0], c[0], d[0]), k(a[1], b[1], c[1], d[1])];
  };
}

// A value along the body, eased between knots.
function profile(knots: P2[]) {
  return (s: number) => {
    let i = 0;
    while (i < knots.length - 2 && s > knots[i + 1][0]) i++;
    const [a, va] = knots[i], [b, vb] = knots[i + 1];
    let t = Math.max(0, Math.min(1, (s - a) / (b - a)));
    t = t * t * (3 - 2 * t);
    return va + (vb - va) * t;
  };
}

const frac = (x: number) => x - Math.floor(x);
// A cheap, steady hash of a number to [0, 1): integer mixing, no trigonometry (it runs thousands of times a frame).
const hash = (k: number) => {
  let h = Math.imul(Math.floor(k * 1024) ^ 0x27d4eb2d, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// Fast out of the blocks, settling at the end: how a chameleon puts a foot down or turns its head.
const snap = (p: number) => 1 - (1 - clamp(p)) ** 3;
// A row of teeth along s, each its own height.
const teeth = (s: number, count: number, seed: number) => {
  const f = s * count;
  return (1 - 2 * Math.abs(frac(f) - 0.5)) * (0.45 + 0.55 * hash(Math.floor(f) + seed));
};

// --- The animal ----------------------------------------------------------------------------------------------

// The spine from the root of the tail (s = 0) to the tip of the snout (s = 1), and the body's reach from it: up to
// the back (the casque rises behind the eye), down to the belly, and out to each side (a chameleon is narrow).
const SPINE = catmull([[-1.0, 0.0], [-0.6, 0.16], [-0.1, 0.24], [0.4, 0.26], [0.75, 0.3], [1.05, 0.28], [1.38, 0.14]]);
const UP = profile([[0, 0.15], [0.15, 0.36], [0.38, 0.47], [0.58, 0.43], [0.68, 0.3], [0.73, 0.33], [0.79, 0.5], [0.9, 0.29], [1, 0.04]]);
const DOWN = profile([[0, 0.13], [0.2, 0.3], [0.42, 0.39], [0.6, 0.33], [0.7, 0.24], [0.8, 0.25], [0.9, 0.17], [1, 0.04]]);
const WIDE = profile([[0, 0.11], [0.4, 0.21], [0.62, 0.17], [0.72, 0.14], [0.82, 0.18], [0.92, 0.11], [1, 0.03]]);
const gular = (s: number, sn: number) => sn < -0.9 && s > 0.58 && s < 0.97;

// A point on the body at s, a turn th around the spine (th = pi faces you), pushed out by `rough`, and its normal.
function bodyAt(s: number, th: number, rough: number, center: P3, offset: P3, normal: P3) {
  const [x, y] = SPINE(s);
  const [x0, y0] = SPINE(Math.max(0, s - 0.004)), [x1, y1] = SPINE(Math.min(1, s + 0.004));
  const tl = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / tl, ny = (x1 - x0) / tl;
  const sn = Math.sin(th), cs = Math.cos(th);
  let h: number;
  if (sn >= 0) {
    h = UP(s);
    const top = (sn - 0.88) / 0.12;
    if (top > 0 && s > 0.06 && s < 0.68) h += 0.08 * teeth(s, 44, 1) * top;
    else if (top > 0 && s > 0.7 && s < 0.86) h += 0.045 * teeth(s, 30, 7) * top;
  } else {
    h = DOWN(s);
    if (gular(s, sn)) h += 0.055 * teeth(s, 50, 3) * ((-sn - 0.9) / 0.1);
  }
  // The back drawn in to a ridge.
  const w = WIDE(s) * (1 - 0.45 * Math.max(0, sn) ** 3);
  center[0] = x; center[1] = y; center[2] = 0;
  offset[0] = nx * h * sn * rough; offset[1] = ny * h * sn * rough; offset[2] = w * cs * rough;
  const gx = (nx * sn) / h, gy = (ny * sn) / h, gz = cs / w, gl = Math.hypot(gx, gy, gz) || 1;
  normal[0] = gx / gl; normal[1] = gy / gl; normal[2] = gz / gl;
}

// The tail: a sweep back and down out of the body into a spiral, wound tighter or looser by `curl` (-1 to 1).
const TAIL_M = 120;
function tailLine(curl: number, out: Float32Array) {
  const [rx, ry] = SPINE(0);
  const turns = 1.38 + 0.16 * curl, R = 0.4 - 0.03 * curl;
  const cx = -1.62, cy = -0.1 - R, lead = 0.22;
  for (let i = 0; i < TAIL_M; i++) {
    const u = i / (TAIL_M - 1);
    if (u < lead) {
      const q = u / lead, p = 1 - q;
      out[i * 2] = p * p * rx + 2 * p * q * -1.35 + q * q * cx;
      out[i * 2 + 1] = p * p * ry + 2 * p * q * -0.12 + q * q * (cy + R);
    } else {
      const v = (u - lead) / (1 - lead), a = Math.PI / 2 + v * turns * Math.PI * 2, r = R * (1 - 0.8 * v ** 0.9);
      out[i * 2] = cx + Math.cos(a) * r;
      out[i * 2 + 1] = cy + Math.sin(a) * r;
    }
  }
}
const tailRadius = (u: number) => 0.112 * (1 - u) + 0.014;

// The branch it walks, and the legs: shoulder, elbow, foot, on the near side (z < 0) and the far side.
const BRANCH_Y = (x: number) => -0.66 + 0.025 * x + 0.02 * Math.sin(x * 0.9);
const BRANCH_R = 0.085, BARK_FROM = -5, BARK_SPAN = 8.3;
const LEGS: P3[][] = [
  [[0.5, 0.04, -0.11], [0.7, -0.26, -0.2], [0.6, BRANCH_Y(0.6) + 0.05, -0.08]],
  [[0.47, 0.04, 0.11], [0.62, -0.27, 0.2], [0.74, BRANCH_Y(0.74) + 0.05, 0.08]],
  [[-0.55, 0.0, -0.11], [-0.78, -0.28, -0.2], [-0.63, BRANCH_Y(-0.63) + 0.05, -0.08]],
  [[-0.55, 0.0, 0.11], [-0.4, -0.3, 0.2], [-0.5, BRANCH_Y(-0.5) + 0.05, 0.08]],
];
const LEG_S = [0.6, 0.6, 0.2, 0.2];
const LEG_R = [0.064, 0.05];
// A diagonal gait: near front, far hind, far front, near hind.
const GAIT = [0, 3, 1, 2];
const STRIDE = 0.3, STEP = 0.36;
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: P3): P3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const BONES = LEGS.map(([s, e, f]) => {
  const u = unit(sub(f, s)), m = sub(e, s), along = dot(m, u);
  return { l1: Math.hypot(...sub(e, s)), l2: Math.hypot(...sub(f, e)), bend: unit([m[0] - u[0] * along, m[1] - u[1] * along, m[2] - u[2] * along]) };
});

// The head turns about the neck; the eyes stand out of either side of it; the tongue leaves from the snout.
const PIVOT: P3 = [...SPINE(0.66), 0] as P3;
const headShare = (s: number) => smooth(0.6, 0.72, s);
const EYE_S = 0.86, EYE_R = 0.118;
function eyeCenter(side: -1 | 1): P3 {
  const c: P3 = [0, 0, 0], o: P3 = [0, 0, 0], n: P3 = [0, 0, 0];
  bodyAt(EYE_S, Math.PI, 1, c, o, n);
  return [c[0] + 0.01, c[1] + 0.07, side * (WIDE(EYE_S) * 0.82)];
}
const SNOUT: P3 = [...SPINE(0.995), 0] as P3;

// Where the bugs it waits for fly, in front of the snout.
const BUGS: P3[] = [[1.78, 0.62, 0.05], [1.9, 0.3, -0.05], [1.72, 0.82, 0.12], [1.95, 0.5, 0.0]];

// The coats it wears, one after another: a broad color, a stripe beside it and a thin third.
const COATS: [Color, Color, Color][] = [
  ["keyword", "string", "function"],
  ["number", "decorator", "string"],
  ["function", "type", "keyword"],
  ["decorator", "number", "type"],
];

const YAW = 0.42, TILT = -0.17;

const enum K { Body, Leg, Foot, Tail, Eye, Mouth, Branch, Leaf, Tongue, Fly }

// --- How it is drawn ---------------------------------------------------------------------------------------------
// In depth (GRID false): glyphs in the round, each as faint as its surface faces away from you and the light, so
// the animal is solid but you see into it. On a text grid (GRID true): every glyph lands in a cell of a monospace
// grid, the nearest in each cell is the one you see, shaded with an ASCII ramp and outlined in line characters.
// Either way the coat's stripes are a hex dump and a run of bits.
const GRID = false;
const RAMP = ".:-=+*%#@";
const HEX = "0123456789abcdef";
const GW = 512, GH = 224, NEIGHBORS = [1, -1, GW, -GW];
// The line along a surface that faces left, down-left, down, down-right, right, up-right, up, up-left, left.
const EDGE = ["|", "\\", "_", "/", "|", "\\", "-", "/", "|"];
// The bark's characters: grain along it, and a knot.
const BARK = ["=", "-", "@"];
// How many leaves the branch carries, and how many flies can be in the air at once.
const LEAVES = 6, FLIES = 4, FLY_PARTS = 6;

// `turned`: the chameleon has already turned round for this fly, and will not again (it eats it from there).
interface Fly { on: boolean; born: number; home: P3; eatAt: number; seed: number; wild: boolean; turned: boolean }
const TURN_X = 0.12, TURN_TIME = 0.42;

type PortraitPose = "perched" | "sleeping";

function buildChameleon(n: number, small: boolean, pose: "hero" | PortraitPose) {
  const portrait = pose !== "hero";
  const sleeping = pose === "sleeping";
  const rnd = random(77);
  const tongueCount = small ? 34 : 56;

  // --- Sampling: lay glyphs over every surface at an even spacing that spends the budget ----------------------
  // Per glyph: its kind, a center, an offset and a normal (fixed parts), up to four numbers that place it on a moving
  // part, where its coat starts (0 at the snout, 1 at the tail's tip), its stripe, and its own random numbers.
  const kind: number[] = [], cen: number[] = [], off: number[] = [], nor: number[] = [];
  const a0: number[] = [], a1: number[] = [], a2: number[] = [], a3: number[] = [];
  const paint: number[] = [], stripe: number[] = [], seedA: number[] = [], seedB: number[] = [], bump: number[] = [];
  const leafAt: number[] = [];
  const ZERO: P3 = [0, 0, 0];
  // While the spacing is being found the sampler only counts, and skips the work of placing anything.
  let counting = false, counted = 0;
  const push = (k: K, c: P3, o: P3, nn: P3, p: number[], coat = 0, v = 0, b = 0) => {
    if (counting) { counted++; return; }
    kind.push(k); cen.push(...c); off.push(...o); nor.push(...nn);
    a0.push(p[0] ?? 0); a1.push(p[1] ?? 0); a2.push(p[2] ?? 0); a3.push(p[3] ?? 0);
    paint.push(coat); stripe.push(v); seedA.push(rnd()); seedB.push(rnd()); bump.push(b);
  };
  // The skin: a little uneven everywhere, with now and then a raised tubercle.
  const skin = () => (rnd() < 0.08 ? 1.1 + rnd() * 0.05 : 1 + (rnd() - 0.5) * 0.08);

  const sample = (d: number, count = false) => {
    for (const list of [kind, cen, off, nor, a0, a1, a2, a3, paint, stripe, seedA, seedB, bump, leafAt]) list.length = 0;
    counting = count;
    counted = 0;
    const c: P3 = [0, 0, 0], o: P3 = [0, 0, 0], nn: P3 = [0, 0, 0];
    // Body and head, ring by ring along the spine, each glyph knocked a little off the ring.
    const rows = Math.round(2.65 / d);
    for (let j = 0; j < rows; j++) {
      const s0 = (j + 0.5) / rows, a = (UP(s0) + DOWN(s0)) / 2, b = WIDE(s0);
      const per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      const m = Math.max(3, Math.round(per / d));
      for (let k = 0; k < m; k++) {
        const s = clamp(s0 + ((rnd() - 0.5) * 0.7) / rows), th = ((k + 0.5 + (rnd() - 0.5) * 0.7) / m) * Math.PI * 2;
        // The grid only ever shows the near side; there the glyphs go where they can be seen.
        if (GRID && Math.cos(th) > 0.55) continue;
        const r = skin();
        if (!counting) bodyAt(s, th, r, c, o, nn);
        push(K.Body, c, o, nn, [s, th], (1 - s) * 0.55, s * 8 + 0.15 * Math.sin(th), r - 1);
      }
    }
    // A mouth line back from the snout, on the near side.
    for (let s = 0.87; s < 0.995; s += d * 0.5) {
      if (!counting) bodyAt(s, Math.PI + 0.22, 1.04, c, o, nn);
      push(K.Mouth, c, o, nn, [s]);
    }
    // The tail, ring by ring; each frame lays the rings on the tail's current line.
    const line = new Float32Array(TAIL_M * 2);
    tailLine(0, line);
    let length = 0;
    for (let i = 1; i < TAIL_M; i++) length += Math.hypot(line[i * 2] - line[i * 2 - 2], line[i * 2 + 1] - line[i * 2 - 1]);
    const trows = Math.round(length / d);
    for (let j = 0; j < trows; j++) {
      const u0 = (j + 0.5) / trows, m = Math.max(3, Math.round((Math.PI * 2 * tailRadius(u0)) / d));
      for (let k = 0; k < m; k++) {
        const u = clamp(u0 + ((rnd() - 0.5) * 0.7) / trows), r = skin(), q = ((k + 0.5 + (rnd() - 0.5) * 0.7) / m) * Math.PI * 2;
        if (GRID && Math.sin(q) > 0.55) continue;
        push(K.Tail, ZERO, ZERO, ZERO, [u, q, r], 0.55 + u * 0.45, -u * 11, r - 1);
      }
    }
    // Legs: a tube down each bone, laid on the bones' current pose each frame, and a closed foot.
    LEGS.forEach((leg, li) => {
      for (let g = 0; g < 2; g++) {
        const l = g ? BONES[li].l2 : BONES[li].l1, r = LEG_R[g];
        const lr = Math.max(1, Math.round(l / d)), m = Math.max(3, Math.round((Math.PI * 2 * r) / d));
        for (let j = 0; j < lr; j++) for (let k = 0; k < m; k++) {
          const f = clamp((j + 0.5 + (rnd() - 0.5) * 0.7) / lr), rr = skin();
          push(K.Leg, ZERO, ZERO, ZERO, [li, g, f, ((k + rnd() * 0.5) / m) * Math.PI * 2], (1 - LEG_S[li]) * 0.55 + 0.04, (g + f) * 1.5 + li, rr - 1);
        }
      }
      const r = 0.056, m = Math.max(6, Math.round((4 * Math.PI * r * r) / (d * d)));
      for (let k = 0; k < m; k++) {
        const y = 1 - (2 * (k + 0.5)) / m, rr = Math.sqrt(1 - y * y), a = k * 2.39996;
        const nv: P3 = [Math.cos(a) * rr * 1.25, y * 0.8, Math.sin(a) * rr];
        push(K.Foot, ZERO, [nv[0] * r, nv[1] * r, nv[2] * r], unit(nv), [li], (1 - LEG_S[li]) * 0.55 + 0.05, 3 + li);
      }
    });
    // The eyes: the outer part of a ball standing out of each side of the head.
    for (const side of (GRID ? [-1] : [-1, 1]) as (-1 | 1)[]) {
      const m = Math.max(24, Math.round((4 * Math.PI * EYE_R * EYE_R) / (d * d * 0.55)));
      for (let k = 0; k < m; k++) {
        const y = 1 - (2 * (k + 0.5)) / m, rr = Math.sqrt(1 - y * y), a = k * 2.39996;
        const nv: P3 = [Math.cos(a) * rr, y, Math.sin(a) * rr];
        if (nv[2] * side < -0.25) continue;
        push(K.Eye, ZERO, [nv[0] * EYE_R, nv[1] * EYE_R, nv[2] * EYE_R], nv, [side], 0.12);
      }
    }
    // Portraits keep the animal, not a miniature copy of the hero's whole scene.
    if (portrait) return counting ? counted : kind.length;
    // The branch, longer than the frame; it slides along under the feet as the chameleon walks.
    const bd = d * 1.2;
    for (let x = 0; x < BARK_SPAN; x += bd) {
      const m = Math.round((Math.PI * 2 * BRANCH_R) / bd);
      for (let k = 0; k < m; k++) {
        const q = ((k + rnd() * 0.6) / m) * Math.PI * 2;
        // Its bark, fixed once: a knot here and there, grain that runs along it.
        const bx = x + (rnd() - 0.5) * bd * 0.6;
        const knot = hash(Math.floor(bx * 1.4) + 9) > 0.86 && Math.abs(frac(bx * 1.4) - 0.5) < 0.1;
        if (!GRID || Math.cos(q) < 0.5) push(K.Branch, ZERO, ZERO, ZERO, [bx, q, 0, knot ? 2 : hash(Math.floor(bx * 9) + Math.floor(q * 2)) > 0.5 ? 0 : 1]);
      }
    }
    // Leaves, scattered along the branch at no even spacing; each one's size, angle and side change every time
    // the branch brings it round again.
    for (let slot = 0; slot < LEAVES; slot++) {
      leafAt.push((slot + 0.1 + rnd() * 0.8) * (BARK_SPAN / LEAVES));
      const m = Math.round(0.075 / (d * d));
      for (let k = 0; k < m; k++) {
        const r = Math.sqrt((k + 0.5) / m), a = k * 2.39996;
        push(K.Leaf, ZERO, ZERO, ZERO, [slot, Math.cos(a) * r, Math.sin(a) * r, k / m]);
      }
    }
    for (let k = 0; k < tongueCount; k++) push(K.Tongue, ZERO, ZERO, [0, 0, -1], [k / (tongueCount - 1)]);
    for (let f = 0; f < FLIES; f++) for (let k = 0; k < FLY_PARTS; k++) push(K.Fly, ZERO, ZERO, [0, 0, -1], [f, k]);
    return counting ? counted : kind.length;
  };

  // Find the spacing that fills most of the field's glyphs; the rest drift around as dust.
  const budget = Math.floor(n * (GRID ? (small ? 0.92 : 0.9) : small ? 0.84 : 0.8));
  let d = 0.05;
  for (let pass = 0; pass < 3; pass++) d *= Math.sqrt(sample(d, true) / budget);
  const used = Math.min(n, sample(d));
  // The character cell: as wide as the spacing, about twice as tall, and the glyph sized to fill it as a
  // terminal's font fills its cells.
  const CW = d * 0.85, CH = d * 1.65;
  const s = empty(n, 1, 1, GRID ? CW / 0.42 : d * 1.5);
  s.flat = GRID;
  dust(s, used, rnd, 1.3, GRID ? 0.035 : 0.07);

  // --- Behavior -----------------------------------------------------------------------------------------------
  const tail = new Float32Array(TAIL_M * 2);
  const L = unit([-0.4, 0.8, -0.45]);
  let last = 0, offX = 0, offY = 0;
  // The walk and the hunt: walk a few steps, stop, wait for a bug, eat it, change coat, walk on.
  type Phase = "walk" | "hunt" | "gone";
  let phase: Phase = "walk", phaseAt = 0, bugs = 0, stepsLeft = 5;
  // The walk: how far the branch has slid, each foot's grip on it (in branch units), and the step under way.
  let slid = 0, step = -1, stepAt = 0, stepFrom = 0, stepTo = 0, slidFrom = 0, nextStep = 0.4, gait = 0;
  const grip = LEGS.map((leg, i) => leg[2][0] + STRIDE / 2 - (3 - GAIT.indexOf(i)) * (STRIDE / 4));
  // The flies: the bug it waits for while it hunts, and any you drop in. The tongue takes one at a time.
  const flies: Fly[] = Array.from({ length: FLIES }, () => ({ on: false, born: 0, home: [0, 0, 0] as P3, eatAt: 0, seed: 0, wild: false, turned: false }));
  const tongue = { state: 0, fly: -1, at: 0 };
  // Turning round: to face a fly that comes behind it, and back again to walk on once it has eaten. The body turns
  // about an upright axis through its middle; `now` is how far round it is (0 facing on, pi facing back).
  const turn = { now: 0, from: 0, goal: 0, at: -1, backAt: -1 };
  let hc = 1, hs = 0, hop = 0;
  // From the chameleon's own frame (as if it faced on) to the model's, and back.
  const spin3 = (p: P3, c: number, sn: number, isDir: boolean, out: P3): P3 => {
    const x = isDir ? p[0] : p[0] - TURN_X, X = c * x + sn * p[2], Z = -sn * x + c * p[2];
    out[0] = isDir ? X : X + TURN_X; out[1] = p[1]; out[2] = Z;
    return out;
  };
  const toWorld = (p: P3, isDir = false, out: P3 = [0, 0, 0]) => spin3(p, hc, hs, isDir, out);
  const toBody = (p: P3, out: P3 = [0, 0, 0]) => spin3(p, hc, -hs, false, out);
  let gulpAt = -1;
  // The head, the eyes, the tail: each holds a goal for a moment, then snaps to the next.
  const head = { yaw: 0, pitch: sleeping ? -0.16 : 0, goalYaw: 0, goalPitch: 0, next: 0 };
  const gaze: P3[] = [[0.3, 0, -1], [0.3, 0.1, 1]], gazeGoal: P3[] = [[0.3, 0, -1], [0.3, 0.1, 1]], gazeNext = [0, 0];
  const curl = { now: sleeping ? 0.7 : 0, goal: sleeping ? 0.7 : 0, next: 1 };
  let blinkAt = 1.8;
  let coat = 0, nextCoat = 1, wave = -1;
  // Where the frame's floor is: the branch and its leaves fade out before they reach it, so nothing spills
  // out of the frame where the branch runs toward you and down.
  let floor = -1e9;
  // The branch is laid out again only when it has moved; each leaf's look for this time round.
  let sceneSlid = NaN, sceneTurn = NaN;
  const leaf = new Float32Array(LEAVES * 8);
  // The grid: which glyph holds each cell this frame, and how near it is.
  const owner = new Int32Array(GW * GH), stamp = new Int32Array(GW * GH), depth = new Float32Array(GW * GH);
  const cell = new Int32Array(used), spare = new Int32Array(used), kindNow = new Uint8Array(used);
  const cellK = new Float32Array(used), faceX = new Float32Array(used), faceY = new Float32Array(used);
  let frame = 0;

  const spawn = (home: P3, delay: number, wild: boolean, t: number) => {
    let k = flies.findIndex((f) => !f.on);
    if (k < 0) k = flies.reduce((best, f, i) => (i !== tongue.fly && (best < 0 || f.born < flies[best].born) ? i : best), -1);
    flies[k] = { on: true, born: t, home, eatAt: t + delay, seed: rnd() * 10, wild, turned: false };
    return k;
  };
  // Where a fly is: a quick zigzag buzz on a slow loop.
  const flyAt = (f: Fly, t: number): P3 => {
    const w = t * 2.3 + f.seed, big = f.wild ? 1.6 : 0.7, b = f.home;
    return [
      b[0] + Math.sin(w) * 0.09 * big + Math.sin(t * 19 + f.seed * 5) * 0.025,
      b[1] + Math.sin(w * 1.6 + 1) * 0.07 * big + Math.sin(t * 27 + f.seed * 3) * 0.022,
      b[2] + Math.sin(w * 0.7) * 0.06 * big,
    ];
  };
  // The head's pose, applied to a point or a direction in the model.
  let hcY = 1, hsY = 0, hcP = 1, hsP = 0;
  const turnHead = (p: P3, share: number, isDir = false, out: P3 = [0, 0, 0]): P3 => {
    const x = isDir ? p[0] : p[0] - PIVOT[0], y = isDir ? p[1] : p[1] - PIVOT[1], z = p[2];
    const cP = 1 + (hcP - 1) * share, sP = hsP * share, cY = 1 + (hcY - 1) * share, sY = hsY * share;
    const x1 = cP * x - sP * y, y1 = sP * x + cP * y;
    const x2 = cY * x1 + sY * z, z2 = -sY * x1 + cY * z;
    out[0] = isDir ? x2 : x2 + PIVOT[0]; out[1] = isDir ? y1 : y1 + PIVOT[1]; out[2] = z2;
    return out;
  };
  const EYES = [eyeCenter(-1), eyeCenter(1)];
  // Which of a coat's three colors a stripe value falls in: the broad one, the hex stripe or the run of bits.
  const band = (v: number) => { const x = frac(v); return x < 0.56 ? 0 : x < 0.68 ? 1 : x < 0.74 ? 2 : 0; };
  // A point on the screen (shape units) back into the model, at depth z in front of the chameleon.
  // The view: turned a little to show the chameleon's near side; when it turns round, the view swings with it, so
  // it is seen the same way facing back as facing on.
  const yaw = portrait ? (sleeping ? 0.24 : 0.18) : YAW;
  let cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ct = Math.cos(TILT), st = Math.sin(TILT);
  const fromScreen = (x: number, y: number, wz: number): P3 => {
    const k = 3.2 / (3.2 + wz), wx = x / k + offX, wy = y / k + offY;
    const y1 = ct * wy + st * wz, z1 = -st * wy + ct * wz;
    return [cy * wx - sy * z1, y1, sy * wx + cy * z1];
  };

  const live = (t: number, look: { x: number; y: number; on: number }) => {
    const dt = clamp(t - last, 0, 0.05);
    last = t;
    frame++;
    const go = (p: Phase) => { phase = p; phaseAt = t; };

    // --- The walk: one foot at a time, a pause between, the branch sliding on as each foot comes down ---------
    if (!portrait && phase === "walk" && step < 0 && t > nextStep && turn.now === 0 && turn.at < 0) {
      if (stepsLeft <= 0) {
        go("hunt");
        spawn(BUGS[bugs++ % BUGS.length], 3.2 + rnd() * 3, true, t);
      } else {
        step = GAIT[gait % 4]; gait++; stepsLeft--; stepAt = t;
        slidFrom = slid;
        stepFrom = grip[step];
        stepTo = LEGS[step][2][0] + STRIDE / 2 + slid + STRIDE / 4;
      }
    }
    let stepP = 0;
    if (step >= 0) {
      stepP = clamp((t - stepAt) / STEP);
      slid = slidFrom + (STRIDE / 4) * snap(stepP);
      grip[step] = stepFrom + (stepTo - stepFrom) * snap(stepP * 1.1);
      if (stepP >= 1) { step = -1; nextStep = t + 0.08 + rnd() * rnd() * 0.7; }
    }
    if (phase === "gone" && t - phaseAt > 1.2) { go("walk"); stepsLeft = 3 + Math.floor(rnd() * 4); nextStep = t + 0.25; }

    // --- Turning round: a fly behind it (in its own frame) and it spins to face it, a little hop as it goes; ----
    // with nothing left to eat it waits a moment and turns back to walk on.
    if (turn.at >= 0) {
      const p = clamp((t - turn.at) / TURN_TIME);
      turn.now = turn.from + (turn.goal - turn.from) * snap(p);
      hop = 0.06 * Math.sin(Math.PI * p);
      if (p >= 1) { turn.now = turn.goal; turn.at = -1; hop = 0; }
    }
    hc = Math.cos(turn.now); hs = Math.sin(turn.now);
    cy = Math.cos(yaw * hc); sy = Math.sin(yaw * hc);
    const anyFly = flies.some((f) => f.on);
    if (turn.at < 0 && tongue.state === 0 && step < 0) {
      let next = -1;
      flies.forEach((f, i) => { if (f.on && (next < 0 || f.eatAt < flies[next].eatAt)) next = i; });
      // How far in front of its neck the fly is now, and would be if it turned round (turning mirrors its own frame
      // about the turning axis). It turns only when that puts the fly clearly in front: a fly over its back is
      // behind the neck either way, and it rears its head up to it instead of spinning back and forth.
      const ahead = next >= 0 ? toBody(flyAt(flies[next], t))[0] - PIVOT[0] : 0;
      const aheadTurned = 2 * TURN_X - (ahead + PIVOT[0]) - PIVOT[0];
      if (next >= 0 && !flies[next].turned && ahead < -0.1 && aheadTurned > 0.05 && aheadTurned > ahead + 0.4) {
        flies[next].turned = true;
        turn.from = turn.now; turn.goal = turn.now < Math.PI / 2 ? Math.PI : 0; turn.at = t; turn.backAt = -1;
        flies[next].eatAt = Math.max(flies[next].eatAt, t + TURN_TIME + 0.08);
      } else if (!anyFly && turn.now !== 0) {
        if (turn.backAt < 0) turn.backAt = t + 0.45;
        else if (t > turn.backAt) { turn.from = turn.now; turn.goal = 0; turn.at = t; turn.backAt = -1; }
      }
    }

    // --- The tongue: out at the first fly that is due, back with it, and a gulp -------------------------------
    if (tongue.state === 0 && turn.at < 0) {
      let due = -1;
      flies.forEach((f, i) => { if (f.on && f.eatAt <= t && (due < 0 || f.eatAt < flies[due].eatAt)) due = i; });
      if (due >= 0) { tongue.state = 1; tongue.fly = due; tongue.at = t; }
    } else if (tongue.state === 1 && t - tongue.at > 0.085) { tongue.state = 2; tongue.at = t; }
    else if (tongue.state === 2 && t - tongue.at > 0.22) {
      const f = flies[tongue.fly];
      f.on = false;
      tongue.state = 0;
      gulpAt = t;
      // Each catch puts on a new coat; one already running down finishes at once.
      if (wave >= 0) coat = nextCoat;
      wave = t; nextCoat = (coat + 1) % COATS.length;
      if (f.wild && phase === "hunt") go("gone");
    }
    const tAge = t - tongue.at;
    const reach = tongue.state === 1 ? snap(tAge / 0.085) : tongue.state === 2 ? 1 - clamp(tAge / 0.22) ** 2 : 0;
    // What it is watching: the fly on the tongue, else the one due soonest.
    let focus = tongue.state ? tongue.fly : -1;
    if (focus < 0) flies.forEach((f, i) => { if (f.on && (focus < 0 || f.eatAt < flies[focus].eatAt)) focus = i; });
    // Everything it aims at, in its own frame (it may have turned round).
    const target = focus >= 0 ? toBody(flyAt(flies[focus], t)) : null;
    const intent = focus >= 0 && (tongue.state > 0 || flies[focus].eatAt - t < 0.9);

    // --- The head: hold, then jerk round to the next thing ----------------------------------------------------
    const pointerAt = toBody(fromScreen(look.x, look.y, -0.7));
    if (t > head.next || (intent && head.next - t > 0.1)) {
      let aim: P3 | null = null;
      if (intent || (target && rnd() < 0.7)) aim = target;
      else if (look.on > 0.3 && rnd() < 0.6) aim = pointerAt;
      const rest = sub(SNOUT, PIVOT);
      if (aim) {
        const to = sub(aim, PIVOT);
        // Up to something over its back it rears its head right up; it does not twist round to look behind.
        head.goalPitch = clamp(Math.atan2(to[1], to[0]) - Math.atan2(rest[1], rest[0]), -0.32, 0.75);
        head.goalYaw = clamp(-(Math.atan2(to[2], Math.max(to[0], 0.25)) - Math.atan2(rest[2], rest[0])), -0.45, 0.45);
      } else {
        head.goalPitch = phase === "walk" ? -0.06 + rnd() * 0.08 : (rnd() - 0.4) * 0.3;
        head.goalYaw = (rnd() - 0.5) * 0.4;
      }
      head.next = t + (intent ? 0.08 : 0.45 + rnd() * 1.2);
    }
    const hk = 1 - Math.exp(-dt / (intent ? 0.035 : 0.055));
    head.yaw += (head.goalYaw - head.yaw) * hk;
    head.pitch += (head.goalPitch - head.pitch) * hk;
    hcY = Math.cos(head.yaw); hsY = Math.sin(head.yaw); hcP = Math.cos(head.pitch); hsP = Math.sin(head.pitch);
    const snout = turnHead(SNOUT, 1);
    const eyes = [turnHead(EYES[0], 1), turnHead(EYES[1], 1)];
    const tip: P3 = target ? [snout[0] + (target[0] - snout[0]) * reach, snout[1] + (target[1] - snout[1]) * reach, snout[2] + (target[2] - snout[2]) * reach] : snout;

    // --- The eyes: each jumps on its own; when a fly is due both lock on it ----------------------------------
    for (let e = 0; e < 2; e++) {
      const c = eyes[e], side = e ? 1 : -1;
      let goal: P3 | null = null;
      if (intent && target) goal = sub(target, c);
      else if (e === 0 && look.on > 0.3) goal = sub(pointerAt, c);
      else if (t > gazeNext[e]) {
        goal = target && rnd() < 0.6 ? sub(target, c) : [0.5 + rnd() * 0.8 - 0.4, (rnd() - 0.5) * 1.2, side * (0.4 + rnd())];
        gazeNext[e] = t + 0.25 + rnd() * 1.1;
      }
      if (goal) {
        if (goal[2] * side < 0.15) goal[2] = side * 0.15;
        gazeGoal[e] = unit(goal);
      }
      const k = 1 - Math.exp(-dt / 0.03);
      gaze[e] = unit([0, 1, 2].map((i) => gaze[e][i] + (gazeGoal[e][i] - gaze[e][i]) * k) as P3);
    }
    if (t > blinkAt + 0.14) blinkAt = t + 2.2 + rnd() * 3.5;
    const blink = sleeping ? 1 : t > blinkAt ? Math.sin(Math.PI * clamp((t - blinkAt) / 0.14)) : 0;

    // --- The tail twitches to a new curl now and then, the body rocks on each step, breathes and gulps -------
    if (t > curl.next) { curl.goal = rnd() * 2 - 1; curl.next = t + 0.8 + rnd() * 2.2; }
    curl.now += (curl.goal - curl.now) * (1 - Math.exp(-dt / 0.12));
    tailLine(curl.now, tail);
    const rocking = step >= 0 ? 0.03 * Math.sin(stepP * Math.PI * 2) : 0;
    const bob = step >= 0 ? 0.012 * Math.sin(stepP * Math.PI) : 0;
    const breath = 0.02 * Math.sin(t * 2.1);
    const gulp = gulpAt >= 0 ? Math.sin(Math.PI * clamp((t - gulpAt) / 0.4)) : 0;

    // --- The legs: each foot where it grips the branch (or in the air, mid-step), the elbow found from there --
    const joints = LEGS.map((leg, i) => {
      const S: P3 = [leg[0][0] + rocking, leg[0][1] + bob, leg[0][2]];
      const fx = grip[i] - slid;
      const lift = i === step ? Math.sin(Math.PI * clamp(stepP * 1.1)) : 0;
      const F: P3 = [fx, BRANCH_Y(TURN_X + (fx - TURN_X) * hc) + 0.05 + lift * 0.11, leg[2][2] * (1 + lift * 0.8)];
      const { l1, l2, bend } = BONES[i];
      const toF = sub(F, S), dist = Math.min(Math.hypot(...toF), (l1 + l2) * 0.995), u = unit(toF);
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const b = unit([bend[0] - u[0] * dot(bend, u), bend[1] - u[1] * dot(bend, u), bend[2] - u[2] * dot(bend, u)]);
      const E: P3 = [S[0] + u[0] * a + b[0] * h, S[1] + u[1] * a + b[1] * h, S[2] + u[2] * a + b[2] * h];
      const Fr: P3 = [S[0] + u[0] * dist, S[1] + u[1] * dist, S[2] + u[2] * dist];
      const across = [[S, E], [E, Fr]].map(([A, B]) => {
        const T = unit(sub(B, A));
        let x = cross(T, [0, 0, 1]);
        if (Math.hypot(...x) < 0.1) x = cross(T, [1, 0, 0]);
        x = unit(x);
        return { A, B, x, y: cross(T, x) };
      });
      return { across, F: Fr };
    });

    // --- The coat being rewritten down the body, and the tear ------------------------------------------------
    let front = -1;
    if (wave >= 0) {
      front = ((t - wave) / 1.2) * 1.25 - 0.1;
      if (front > 1.15) { coat = nextCoat; wave = -1; front = -1; }
    }

    // --- The branch and its leaves: laid out again only when the branch has slid or the view has swung --------
    const scenery = GRID || slid !== sceneSlid || turn.now !== sceneTurn;
    sceneSlid = slid; sceneTurn = turn.now;
    if (scenery && !portrait) for (let slot = 0; slot < LEAVES; slot++) {
      const at = (leafAt[slot] - slid - BARK_FROM) / BARK_SPAN, lap = Math.floor(at), x = BARK_FROM + frac(at) * BARK_SPAN;
      // This time round: how long, how wide, which way it hangs, and whether it is there at all.
      const h1 = hash(slot * 13.7 + lap * 7.1), h2 = hash(slot * 5.3 + lap * 11.9), h3 = hash(slot * 2.1 + lap * 3.7);
      const up = h3 > 0.72, ang = up ? Math.PI / 2 + (h1 - 0.5) * 1.3 : -Math.PI / 2 + (h1 - 0.5) * 2.2;
      const ax = Math.cos(ang), ay = Math.sin(ang), o = slot * 8;
      leaf[o] = x + ax * BRANCH_R; leaf[o + 1] = BRANCH_Y(x) + ay * BRANCH_R; leaf[o + 2] = ax; leaf[o + 3] = ay;
      leaf[o + 4] = 0.18 + 0.22 * h2; leaf[o + 5] = 0.05 + 0.05 * h1; leaf[o + 6] = up ? 0.1 : h2 > 0.5 ? -0.1 : 0.06;
      leaf[o + 7] = (h3 < 0.12 ? 0 : 1) * smooth(BARK_FROM, BARK_FROM + 0.9, x) * (1 - smooth(BARK_FROM + BARK_SPAN - 0.8, BARK_FROM + BARK_SPAN, x));
    }

    // --- Every glyph: where it is, which way it faces, what it shows ------------------------------------------
    const P: P3 = [0, 0, 0], N: P3 = [0, 0, 0], Q: P3 = [0, 0, 0], M: P3 = [0, 0, 0];
    // Screen-space direction of the tongue, for the character that draws it.
    const tdx = (cy * (tip[0] - snout[0]) + sy * (tip[2] - snout[2])), tdy = tip[1] - snout[1];
    const tongueChar = Math.abs(tdy) < Math.abs(tdx) * 0.4 ? "-" : Math.abs(tdx) < Math.abs(tdy) * 0.4 ? "|" : tdx * tdy > 0 ? "/" : "\\";
    for (let i = 0; i < used; i++) {
      const k = kind[i], i3 = i * 3;
      if (!scenery && (k === K.Branch || k === K.Leaf)) continue;
      let role: Color = "fg", chars = "", alpha = 1, lit = true, share = 0, bias = 0, mode = 0, flat = false;
      let fx = 0;
      const fy = 0;
      const wear = COATS[front >= 0 && paint[i] < front ? nextCoat : coat];
      if (k === K.Body || k === K.Mouth) {
        const sv = a0[i], sn = Math.sin(a1[i]);
        let puff = k === K.Body ? 1 + breath * Math.sin(Math.PI * clamp(sv / 0.7)) : 1;
        // The gulp swells the throat.
        if (gulp > 0 && sn < 0) puff += 0.3 * gulp * Math.exp(-(((sv - 0.74) / 0.06) ** 2));
        for (let a = 0; a < 3; a++) { P[a] = cen[i3 + a] + off[i3 + a] * puff; N[a] = nor[i3 + a]; }
        P[0] += rocking * (1 - headShare(sv) * 0.3); P[1] += bob;
        share = headShare(sv);
        if (k === K.Mouth) { role = "comment"; chars = "_"; bias = -0.05; }
        else {
          mode = band(stripe[i]); role = wear[mode];
          if (gular(sv, sn)) { role = "fgMuted"; chars = "vV"; mode = 3; }
          // A dashed line along the flank.
          else if (sv > 0.12 && sv < 0.62 && Math.abs(sn + 0.28) < 0.05) { role = wear[2]; chars = "="; mode = 3; }
        }
      } else if (k === K.Tail) {
        const u = a0[i], f = u * (TAIL_M - 1), j = Math.min(TAIL_M - 2, Math.floor(f)), r = f - j;
        const x = tail[j * 2] + (tail[j * 2 + 2] - tail[j * 2]) * r, y = tail[j * 2 + 1] + (tail[j * 2 + 3] - tail[j * 2 + 1]) * r;
        const tx = tail[j * 2 + 2] - tail[j * 2], ty = tail[j * 2 + 3] - tail[j * 2 + 1], tl = Math.hypot(tx, ty) || 1;
        const q = a1[i], rad = tailRadius(u) * a2[i];
        N[0] = (-ty / tl) * Math.cos(q); N[1] = (tx / tl) * Math.cos(q); N[2] = Math.sin(q);
        P[0] = x + N[0] * rad + rocking * (1 - u); P[1] = y + N[1] * rad + bob * (1 - u); P[2] = N[2] * rad;
        mode = band(stripe[i]); role = wear[mode];
      } else if (k === K.Leg) {
        const bone = joints[a0[i]].across[a1[i]], f = a2[i], q = a3[i], r = LEG_R[a1[i]] * (1 + bump[i]);
        const cq = Math.cos(q), sq = Math.sin(q);
        for (let a = 0; a < 3; a++) {
          N[a] = bone.x[a] * cq + bone.y[a] * sq;
          P[a] = bone.A[a] + (bone.B[a] - bone.A[a]) * f + N[a] * r;
        }
        mode = band(stripe[i]); role = wear[mode];
      } else if (k === K.Foot) {
        const F = joints[a0[i]].F;
        for (let a = 0; a < 3; a++) { P[a] = F[a] + off[i3 + a]; N[a] = nor[i3 + a]; }
        mode = band(stripe[i]); role = wear[mode];
      } else if (k === K.Eye) {
        const e = a0[i] > 0 ? 1 : 0, c = eyes[e];
        Q[0] = off[i3]; Q[1] = off[i3 + 1] * (1 - 0.7 * blink); Q[2] = off[i3 + 2];
        const o = turnHead(Q, 1, true, Q);
        M[0] = nor[i3]; M[1] = nor[i3 + 1]; M[2] = nor[i3 + 2];
        const nn = turnHead(M, 1, true, M);
        P[0] = c[0] + o[0] + rocking * 0.7; P[1] = c[1] + o[1] + bob; P[2] = c[2] + o[2];
        N[0] = nn[0]; N[1] = nn[1]; N[2] = nn[2];
        const sees = dot(nn, gaze[e]);
        bias = -0.06;
        if (blink < 0.35 && sees > 0.94) { role = "fg"; chars = "@"; mode = 3; }
        else if (blink < 0.35 && sees > 0.78) { role = "amber"; chars = "O0"; mode = 3; }
        // The turret: rings of skin round the pupil, the way a chameleon's eye is built.
        else if (blink >= 0.35) { role = wear[0]; chars = "-"; mode = 3; }
        else { role = wear[band(1 - sees * 2.2)]; chars = band(1 - sees * 2.2) ? "()" : ""; mode = chars ? 3 : 0; }
      } else if (k === K.Branch) {
        const x = BARK_FROM + frac((a0[i] - slid - BARK_FROM) / BARK_SPAN) * BARK_SPAN, q = a1[i];
        N[0] = 0; N[1] = Math.sin(q); N[2] = Math.cos(q);
        P[0] = x; P[1] = BRANCH_Y(x) + N[1] * BRANCH_R; P[2] = N[2] * BRANCH_R;
        // The bark (fixed when it was laid down), the ends fading out.
        role = "copper"; chars = BARK[a3[i]]; mode = 3;
        alpha = smooth(BARK_FROM, BARK_FROM + 0.9, x) * (1 - smooth(BARK_FROM + BARK_SPAN - 0.8, BARK_FROM + BARK_SPAN, x));
        bias = 0.02;
      } else if (k === K.Leaf) {
        // A narrow leaf off a short stalk, as this leaf is this time round.
        const o = a0[i] * 8, ax = leaf[o + 2], ay = leaf[o + 3];
        const along = (a2[i] + 1) / 2, wide = a1[i] * leaf[o + 5] * Math.sin(Math.PI * along ** 0.8);
        P[0] = leaf[o] + ax * along * leaf[o + 4] - ay * wide; P[1] = leaf[o + 1] + ay * along * leaf[o + 4] + ax * wide;
        P[2] = leaf[o + 6] + (along - 0.5) * 0.05;
        N[0] = 0; N[1] = 0.3; N[2] = -1;
        role = a3[i] < 0.08 ? "comment" : Math.abs(a1[i]) < 0.15 ? "string" : "success";
        alpha = leaf[o + 7];
      } else if (k === K.Tongue) {
        const u = a0[i];
        for (let a = 0; a < 3; a++) P[a] = snout[a] + (tip[a] - snout[a]) * u;
        P[0] += rocking * 0.7 * (1 - u);
        role = "rose"; chars = u > 0.97 ? "@" : tongueChar; mode = 3; alpha = reach > 0.03 ? 1 : 0; lit = false; bias = -10;
      } else {
        // A fly, drawn the way a terminal would: a body and two wings that beat, and a faint trail behind it.
        const slot = a0[i], part = a1[i], f = flies[slot];
        const riding = tongue.state === 2 && tongue.fly === slot;
        const age = t - f.born;
        const at = riding ? toWorld(tip) : flyAt(f, part >= 3 ? t - 0.045 * (part - 2) : t);
        P[0] = at[0]; P[1] = at[1]; P[2] = at[2];
        const beat = Math.floor(t * 24 + f.seed) % 2 === 0;
        if (part === 0) { chars = age < 0.1 ? "+" : "*"; role = "error"; }
        else if (part === 1) { chars = beat ? "\\" : "/"; role = "error"; fx = -1; }
        else if (part === 2) { chars = beat ? "/" : "\\"; role = "error"; fx = 1; }
        else { chars = part === 3 ? "." : "`"; role = "fgMuted"; alpha = riding ? 0 : 0.6 - (part - 3) * 0.18; }
        if (age < 0.1 && part > 0) alpha = 0;
        if (!f.on) alpha = 0;
        mode = 3; lit = false; bias = part === 0 ? -30 : -20; flat = true;
      }
      if (share > 0) { turnHead(P, share, false, P); turnHead(N, share, true, N); }
      // The whole animal, turned round if it has turned.
      if (k !== K.Branch && k !== K.Leaf && k !== K.Fly && (turn.now !== 0 || hop)) { toWorld(P, false, P); toWorld(N, true, N); P[1] += hop; }
      const living = k === K.Body || k === K.Tail || k === K.Leg || k === K.Foot;
      if (living && bump[i] > 0.09 && mode === 0) { chars = GRID ? "o" : "oO@"; mode = 3; if (!GRID) alpha *= 1.3; }

      // Turn toward the viewer and tip down; shade by how the surface faces you and the light.
      const x1 = cy * P[0] + sy * P[2], z1 = -sy * P[0] + cy * P[2];
      const y2 = ct * P[1] - st * z1, z2 = st * P[1] + ct * z1;
      let lum = 1;
      if (lit) {
        const nx1 = cy * N[0] + sy * N[2], nz1 = -sy * N[0] + cy * N[2];
        const ny2 = ct * N[1] - st * nz1, nz2 = st * N[1] + ct * nz1;
        const facing = clamp(0.5 - 0.5 * nz2);
        faceX[i] = nx1; faceY[i] = ny2;
        const light = Math.max(0, nx1 * L[0] + ny2 * L[1] + nz2 * L[2]);
        const grain = frac(seedA[i] * 7.31);
        if (GRID) {
          lum = clamp(facing ** 0.8 * (0.25 + 0.8 * light) * (0.85 + 0.3 * grain));
          alpha *= 0.4 + 0.6 * lum;
        } else alpha *= (0.06 + 0.94 * facing ** 1.3) * (0.6 + 0.55 * light) * (0.66 + 0.34 * grain);
      }
      // The new coat is written in as a band of bits.
      if (front >= 0 && living && Math.abs(paint[i] - front) < 0.035) { role = wear[0]; chars = "01"; mode = 3; alpha = 1; }
      // Now and then a cell shows the wrong character for a frame.
      if (living && hash(i * 0.37 + frame) > 0.997) { chars = "#$%&?!<>"; mode = 3; }

      let glyph: string;
      if (mode === 0 && GRID) glyph = RAMP[Math.round(lum * (RAMP.length - 1))];
      else if (mode === 0) { const set = CHARS[role] ?? "{}"; glyph = set[Math.floor(seedA[i] * set.length) % set.length]; }
      else if (mode === 1) glyph = HEX[Math.floor(hash(i + Math.floor(t * 1.7 + seedA[i] * 9)) * 16)];
      else if (mode === 2) glyph = hash(i * 1.3 + Math.floor(t * 2.3 + seedB[i] * 5)) > 0.5 ? "1" : "0";
      else glyph = chars[Math.floor(seedA[i] * chars.length) % chars.length];

      // Onto the screen, and on the grid snapped to a cell, keeping the nearest glyph in each.
      const kk = 3.2 / (3.2 + z2);
      const sx = ((x1 - offX) * kk) / CW + fx * (GRID ? 1 : 0.7), sy2 = ((y2 - offY) * kk) / CH + fy;
      const gx = GRID ? Math.round(sx) : sx, gy = GRID ? Math.round(sy2) : sy2;
      if (k === K.Branch || k === K.Leaf) alpha *= smooth(floor, floor + 0.14, (y2 - offY) * kk);
      s.pos[i3] = (gx * CW) / kk; s.pos[i3 + 1] = (gy * CH) / kk; s.pos[i3 + 2] = z2;
      if (!lit) { faceX[i] = 0; faceY[i] = 0; }
      cellK[i] = living || k === K.Branch || k === K.Leaf || k === K.Eye ? kk : 0;
      s.glyph[i] = glyphOf(glyph);
      s.role[i] = C[role];
      s.alpha[i] = Math.min(1, alpha);
      cell[i] = -1;
      kindNow[i] = k;
      const cx = gx + (GW >> 1), cyy = gy + (GH >> 1);
      if (GRID && alpha > 0.01 && cx >= 0 && cx < GW && cyy >= 0 && cyy < GH) {
        const key = cyy * GW + cx, zb = z2 + bias;
        if (stamp[key] !== frame || zb < depth[key]) { stamp[key] = frame; depth[key] = zb; owner[key] = i; }
        cell[i] = key;
      }
    }
    // Holes: a cell left empty between two held ones (no glyph happened to land there) takes a spare glyph, one
    // that lost its own cell, in its neighbor's character and color. Only the nearest glyph in each cell shows.
    if (!GRID) return;
    const held = (key: number) => key >= 0 && key < GW * GH && stamp[key] === frame;
    let pool = 0;
    for (let i = 0; i < used; i++) if (cell[i] >= 0 && owner[cell[i]] !== i && cellK[i]) spare[pool++] = i;
    for (let i = 0; i < used && pool > 0; i++) {
      const key = cell[i];
      if (key < 0 || owner[key] !== i || !cellK[i]) continue;
      for (const step of NEIGHBORS) {
        const to = key + step;
        if (held(to) || !held(to + step) || pool === 0) continue;
        const j = spare[--pool], kk = cellK[i], gx = (to % GW) - (GW >> 1), gy = Math.floor(to / GW) - (GH >> 1);
        stamp[to] = frame; owner[to] = j; cell[j] = to;
        s.pos[j * 3] = (gx * CW) / kk; s.pos[j * 3 + 1] = (gy * CH) / kk; s.pos[j * 3 + 2] = s.pos[i * 3 + 2];
        s.glyph[j] = s.glyph[i]; s.role[j] = s.role[i]; s.alpha[j] = s.alpha[i];
        faceX[j] = faceX[i]; faceY[j] = faceY[i]; kindNow[j] = kind[i];
      }
    }
    for (let i = 0; i < used; i++) if (cell[i] >= 0 && owner[cell[i]] !== i) s.alpha[i] = 0;
    // The outline, drawn the way ASCII art draws it: a cell on the edge of the animal (open to the outside, not
    // to a hole) takes the line character that runs along its surface there, from how the surface faces you.
    const open = (key: number, step: number) => !held(key + step) && !held(key + step * 2);
    for (let i = 0; i < used; i++) {
      const key = cell[i], k = kindNow[i];
      if (key < 0 || owner[key] !== i || !(k === K.Body || k === K.Tail || k === K.Leg || k === K.Foot)) continue;
      if (!(open(key, 1) || open(key, -1) || open(key, GW) || open(key, -GW))) continue;
      const sector = Math.round(Math.atan2(faceY[i], faceX[i]) / (Math.PI / 4));
      s.glyph[i] = glyphOf(EDGE[sector + 4]);
      s.alpha[i] = Math.max(s.alpha[i], 0.92);
    }
  };

  // Frame it: lay it out once, then center the animal (and where the bugs fly) in the anchor.
  live(0, { x: 0, y: 0, on: 0 });
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < used; i++) {
    if (kind[i] === K.Branch || kind[i] === K.Leaf || kind[i] === K.Tongue || kind[i] === K.Fly) continue;
    const z = s.pos[i * 3 + 2], k = 3.2 / (3.2 + z), x = s.pos[i * 3] * k, y = s.pos[i * 3 + 1] * k;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  for (const b of portrait ? [] : BUGS) {
    x1 = Math.max(x1, (cy * (b[0] + 0.16) + sy * b[2]) * 1.3);
    y1 = Math.max(y1, b[1] + 0.15);
  }
  offX = (x0 + x1) / 2;
  offY = (y0 + y1) / 2;
  s.hw = ((x1 - x0) / 2) * 1.05;
  s.hh = ((y1 - y0) / 2) * 1.06;
  floor = -s.hh * 1.02;
  // Now framed. In depth the first layout only needs moving by the offsets (no second pass: this runs while the
  // page loads); on the grid it is laid out again so every glyph lands in its cell. The branch is laid out again on
  // the first frame either way, to fade at the frame's floor.
  sceneSlid = NaN;
  if (GRID) {
    last = 0; phaseAt = 0; nextStep = 0.4; frame = 0;
    live(0, { x: 0, y: 0, on: 0 });
  } else for (let i = 0; i < used; i++) { s.pos[i * 3] -= offX; s.pos[i * 3 + 1] -= offY; }
  last = 0;
  // The dust keeps to the grid too.
  // The dust drifts inside the frame, not over the page below it.
  for (let i = used; i < n; i++) s.pos[i * 3 + 1] = Math.max(-s.hh * 0.92, Math.min(s.hh * 0.92, s.pos[i * 3 + 1]));
  for (let i = used; GRID && i < n; i++) {
    const z = s.pos[i * 3 + 2], k = 3.2 / (3.2 + z);
    s.pos[i * 3] = (Math.round((s.pos[i * 3] * k) / CW) * CW) / k;
    s.pos[i * 3 + 1] = (Math.round((s.pos[i * 3 + 1] * k) / CH) * CH) / k;
  }

  s.animate = live;
  s.calm = true;
  // A click near it drops a fly where you clicked, and the chameleon has it at once (turning round for it if it
  // is behind). The hero never sends the wave: a click further off does nothing.
  s.touch = (x, y) => {
    if (Math.abs(x) > s.hw * 1.2 || Math.abs(y) > s.hh * 1.35) return true;
    const t = last, queued = flies.filter((f) => f.on && !f.wild && f.eatAt > t).length;
    spawn(fromScreen(x, y, -0.25), 0.32 + queued * 0.45, false, t);
    return true;
  };
  return { shape: s, kind, used };
}

// The hero keeps its original scene and behavior. The small portraits below sample the same animal, with no
// scenery or hunting, rather than maintaining a second, increasingly different drawing of the mascot.
export function chameleon(n: number, small: boolean): Shape {
  return buildChameleon(n, small, "hero").shape;
}

export function chameleonPortrait(pose: PortraitPose) {
  const { shape: s, kind, used } = buildChameleon(1600, false, pose);
  const mirror = pose === "perched" ? -1 : 1;
  const unit = 130, pad = 14;
  const width = Math.ceil(s.hw * 2 * unit + pad * 2), height = Math.ceil(s.hh * 2 * unit + pad * 2);
  type Run = { role: Color; opacity: number; size: number; x: number[]; y: number[]; text: string };
  const parts = new Map<string, Map<string, Run>>();
  let eyeX = 0, eyeY = 0, eyes = 0;
  // Far surfaces first, just as in the hero's projection; quantized shading keeps the SVG small without losing
  // the rounded body, turret eye, rough crest and tapered spiral. Text is placed, never clipped to an outline.
  const order = Array.from({ length: used }, (_, i) => i).sort((a, b) => s.pos[b * 3 + 2] - s.pos[a * 3 + 2]);
  for (const i of order) {
    if (s.alpha[i] < 0.12) continue;
    const k = 3.2 / (3.2 + s.pos[i * 3 + 2]);
    const x = Math.round((pad + (s.hw + mirror * s.pos[i * 3] * k) * unit) * 10) / 10;
    let y = pad + (s.hh - s.pos[i * 3 + 1] * k) * unit;
    // The resting animal crouches, with the feet tucked closer to the belly. Its eye is already closed by the model.
    if (pose === "sleeping" && (kind[i] === K.Leg || kind[i] === K.Foot)) {
      y -= 0.36 * Math.max(0, y - (pad + s.hh * unit + 12));
    }
    y = Math.round(y * 10) / 10;
    const part = kind[i] === K.Tail ? "tail" : kind[i] === K.Eye ? "eye" : kind[i] === K.Leg || kind[i] === K.Foot ? "feet" : "body";
    if (part === "eye") { eyeX += x; eyeY += y; eyes++; }
    const role = COLORS[s.role[i]];
    const opacity = Math.min(1, Math.ceil(s.alpha[i] * 5) / 5);
    const size = Math.round(s.size * k * unit * 0.72 * 2) / 2;
    const key = `${role}:${opacity}:${size}`;
    if (!parts.has(part)) parts.set(part, new Map());
    const runs = parts.get(part)!;
    if (!runs.has(key)) runs.set(key, { role, opacity, size, x: [], y: [], text: "" });
    const run = runs.get(key)!;
    run.x.push(x); run.y.push(y); run.text += String.fromCharCode(s.glyph[i] + 33);
  }
  return {
    width, height, eyeX: eyeX / Math.max(1, eyes), eyeY: eyeY / Math.max(1, eyes),
    parts: ["tail", "feet", "body", "eye"].map((name) => ({ name, runs: [...(parts.get(name)?.values() ?? [])] })),
  };
}
