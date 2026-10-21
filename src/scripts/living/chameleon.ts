// The hero: a chameleon in the round, built from code glyphs, walking a branch. Every glyph sits on a surface (the
// body and head, the tail, the legs, the turret eyes) and shows as strongly as its surface faces you and the light,
// so the glyphs read as a solid animal. The skin is rough: bumps and scattered tubercles, a ragged crest down the
// spine, a ridge on the casque and a pale serrated crest under the throat.
//
// It is drawn as a terminal would draw it: text on a character grid, shaded with an ASCII ramp, its stripes a hex
// dump and a run of bits.
//
// It moves like a chameleon: slowly and deliberately, in holds and quick looks, never a drift. Nothing starts or
// stops dead: every motion eases in and settles. It walks one leg at a time. Each foot opens, lifts and reaches, and
// closes round the bark; now and then it stops in the air while the animal rocks on its other feet, as a leaf
// rocks in the wind. The body leans off each foot it lifts and eases on as the foot comes down, keeping its height
// over the bark, so it rises and tips over the branch's bends. The branch slides past beneath it, so it stays in
// the frame. The branch is not a rod: it wanders, swells and narrows, carries knots, and gives under the animal's
// weight, springing a little at each footfall.
//
// Then it stops to hunt: its head turns sharply to the bug (quick, but it starts and settles), its eyes jump about
// on their own, one to the pointer, then both lock on. It leans in and parts its jaws, the tongue shoots out and
// takes the bug, it chews and gulps, and a new coat is written down it from the snout to the tip of the tail. A
// click near it drops a fly there, and it eats that at once, turning round first if the fly is behind it and back
// afterwards to walk on.
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

const TAU = Math.PI * 2;
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
// Fast out of the blocks, settling at the end: how the tongue leaves the mouth.
const snap = (p: number) => 1 - (1 - clamp(p)) ** 3;
// Slow in and slow out, with no jolt at either end: how a foot travels, or the body eases on over it.
const ease = (p: number) => { const x = clamp(p); return x * x * x * (x * (6 * x - 15) + 10); };
// 0 to 1 by way of a pause: up to `at` over a..b, held there until c, then the rest of the way by d.
const paused = (p: number, a: number, b: number, c: number, d: number, at: number) =>
  p < c ? at * ease((p - a) / (b - a)) : at + (1 - at) * ease((p - c) / (d - c));

// A damped spring: `x` is pulled toward a goal and carries on a little by its speed `v`, so a motion gathers and
// settles instead of starting and stopping dead. `w` is how quick it is (radians a second), `z` how damped it is
// (1 settles without overshoot; less rings, the way a branch does).
interface Spring { x: number; v: number }
const spring = (s: Spring, goal: number, w: number, z: number, dt: number) => {
  const n = Math.ceil(dt * 240), h = dt / Math.max(1, n);
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (goal - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
};
const still = (x = 0): Spring => ({ x, v: 0 });

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

// The tail: a sweep back and down out of the body into a spiral.
const TAIL_M = 120;
function tailLine(out: Float32Array) {
  const [rx, ry] = SPINE(0);
  const turns = 1.38, R = 0.4;
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
// The tail at rest, kept as the length of each piece and how far it turns from the last, so it can be wound tighter
// or looser anywhere along its length, the way a tail coils: a change that starts at the root and runs to the tip.
const TAIL_REST = new Float32Array(TAIL_M * 2);
tailLine(TAIL_REST);
const TAIL_SEG = new Float32Array(TAIL_M - 1), TAIL_TURN = new Float32Array(TAIL_M - 1);
for (let i = 0, prev = 0; i < TAIL_M - 1; i++) {
  const dx = TAIL_REST[i * 2 + 2] - TAIL_REST[i * 2], dy = TAIL_REST[i * 2 + 3] - TAIL_REST[i * 2 + 1], a = Math.atan2(dy, dx);
  TAIL_SEG[i] = Math.hypot(dx, dy);
  TAIL_TURN[i] = i ? Math.atan2(Math.sin(a - prev), Math.cos(a - prev)) : a;
  prev = a;
}
// The tail laid along its rest shape, each piece's turn wound by `curl` there (-1 to 1, root to tip), with a faint
// bend running down it (`sway` strong, at `phase`).
// `arch` bends the sweep out of the body by that many radians more, so the root flexes too.
function bendTail(curl: Float32Array, sway: number, phase: number, arch: number, out: Float32Array) {
  let a = 0, x = TAIL_REST[0], y = TAIL_REST[1];
  out[0] = x; out[1] = y;
  const last = curl.length - 1;
  for (let i = 0; i < TAIL_M - 1; i++) {
    const u = i / (TAIL_M - 2), f = u * last, j = Math.min(last - 1, f | 0), c = curl[j] + (curl[j + 1] - curl[j]) * (f - j);
    a += i ? TAIL_TURN[i] * (1 + 0.12 * c * smooth(0.1, 0.3, u)) + (sway * Math.sin(phase - u * 7) * (0.3 + u)) / TAIL_M
      + (u < 0.22 ? (arch * Math.PI * Math.sin((Math.PI * u) / 0.22)) / (0.44 * (TAIL_M - 2)) : 0) : TAIL_TURN[0];
    x += TAIL_SEG[i] * Math.cos(a);
    y += TAIL_SEG[i] * Math.sin(a);
    out[i * 2 + 2] = x; out[i * 2 + 3] = y;
  }
}

// The branch it walks: a line that runs toward you and down (fixed in the view), and the branch's own shape along
// it, which slides past with the bark: it bends up and down and toward and away from you, swells and narrows. Each
// wave is a whole number of turns over the bark's span, so the bark meets itself where it comes round again.
const BRANCH_Y = (x: number) => -0.66 + 0.025 * x + 0.02 * Math.sin(x * 0.9);
const BRANCH_R = 0.085, BARK_FROM = -5, BARK_SPAN = 8.3;
// Amplitude, turns over the span, phase; three to a wave.
const BEND_Y = [0.034, 2, 0.7, 0.022, 4, 2.1, 0.008, 9, 4.0];
const BEND_Z = [0.05, 3, 1.3, 0.02, 7, 0.4];
const THICK = [0.19, 2, 2.5, 0.08, 5, 0.3, 0.04, 13, 1.1];
const waves = (u: number, w: number[]) => {
  let v = 0;
  for (let i = 0; i < w.length; i += 3) v += w[i] * Math.sin((TAU * w[i + 1] * u) / BARK_SPAN + w[i + 2]);
  return v;
};
// Knots: in some twelfths of the bark a swelling on one side, where a twig once grew. They grow on the side toward
// you, from the top's edge round to below the middle, never on top where the feet go.
const KNOTS = 12, KNOT_W = BARK_SPAN / KNOTS;
const knotQ = (k: number) => Math.PI * (0.68 + 0.75 * hash(k + 33));
// How far the bark stands out at u, a turn q round the branch, as a share of the branch's thickness there (its grain
// in low ridges, and the knots), and how much of that is knot.
function barkAt(u: number, q: number): [number, number] {
  const c = Math.floor(u / KNOT_W);
  let knot = 0;
  for (let cc = c - 1; cc <= c + 1; cc++) {
    const k = ((cc % KNOTS) + KNOTS) % KNOTS;
    if (hash(k + 9) < 0.45) continue;
    const du = (u - (cc + 0.25 + 0.5 * hash(k + 21)) * KNOT_W) / 0.07;
    const dq = Math.atan2(Math.sin(q - knotQ(k)), Math.cos(q - knotQ(k))) / 0.65;
    knot = Math.max(knot, (0.35 + 0.5 * hash(k + 45)) * Math.exp(-du * du - dq * dq));
  }
  return [1 + 0.035 * Math.sin(q * 7 + Math.sin(u * 1.3) * 2) + knot, knot];
}
// How far the branch sags under the animal's weight at rest, and over how much of its length.
const SAG = 0.022, SAG_W = 1.5;

// The legs: shoulder, elbow, foot, on the near side (z < 0) and the far side.
const LEGS: P3[][] = [
  [[0.5, 0.04, -0.11], [0.7, -0.26, -0.2], [0.6, BRANCH_Y(0.6) + 0.05, -0.08]],
  [[0.47, 0.04, 0.11], [0.62, -0.27, 0.2], [0.74, BRANCH_Y(0.74) + 0.05, 0.08]],
  [[-0.55, 0.0, -0.11], [-0.78, -0.28, -0.2], [-0.63, BRANCH_Y(-0.63) + 0.05, -0.08]],
  [[-0.55, 0.0, 0.11], [-0.4, -0.3, 0.2], [-0.5, BRANCH_Y(-0.5) + 0.05, 0.08]],
];
const LEG_S = [0.6, 0.6, 0.2, 0.2];
const LEG_R = [0.064, 0.05];
// A foot grips the top of the branch, this share of the branch's thickness above its middle.
const GRIP_UP = 0.59;
// A diagonal gait: near front, far hind, far front, near hind.
const GAIT = [0, 3, 1, 2];
const STRIDE = 0.3;
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: P3): P3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const BONES = LEGS.map(([s, e, f]) => {
  const u = unit(sub(f, s)), m = sub(e, s), along = dot(m, u);
  return { l1: Math.hypot(...sub(e, s)), l2: Math.hypot(...sub(f, e)), bend: unit([m[0] - u[0] * along, m[1] - u[1] * along, m[2] - u[2] * along]) };
});
// Where it stands over the branch: its front feet and hind feet, along the body.
const FORE_X = 0.67, HIND_X = -0.57;

// The head turns about the neck; the eyes stand out of either side of it; the tongue leaves from the snout. The
// lower jaw hinges open below the back of the mouth.
const PIVOT: P3 = [...SPINE(0.66), 0] as P3;
const headShare = (s: number) => smooth(0.6, 0.72, s);
const EYE_S = 0.86, EYE_R = 0.118;
function eyeCenter(side: -1 | 1): P3 {
  const c: P3 = [0, 0, 0], o: P3 = [0, 0, 0], n: P3 = [0, 0, 0];
  bodyAt(EYE_S, Math.PI, 1, c, o, n);
  return [c[0] + 0.01, c[1] + 0.07, side * (WIDE(EYE_S) * 0.82)];
}
const SNOUT: P3 = [...SPINE(0.995), 0] as P3;
const HINGE: P2 = [1.08, 0.21];
const jawShare = (s: number, sn: number) => smooth(0.8, 0.88, s) * clamp(-sn * 4);
// The tail swings from a hinge just inside the body, and the rump goes with it, all of it at the root and none
// by the hips.
const TAIL_HINGE: P2 = SPINE(0.12);
const rumpShare = (s: number) => 1 - smooth(0, 0.14, s);

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
// The bark's characters: grain along it, the heart of a knot and the swelling round it.
const BARK = ["=", "-", "@", "o"];
// How many leaves the branch carries, and how many flies can be in the air at once.
const LEAVES = 6, FLIES = 4, FLY_PARTS = 6;
// The branch's middle and thickness are worked out this many times along its span each frame, and read from there.
const TABLE = 160;

// `turned`: the chameleon has already turned round for this fly, and will not again (it eats it from there).
interface Fly { on: boolean; born: number; home: P3; eatAt: number; seed: number; wild: boolean; turned: boolean }
const TURN_X = 0.12, TURN_TIME = 0.72;
// The strike: the tongue out, held on the fly, and reeled back in.
const SHOOT = 0.065, HOLD = 0.05, REEL = 0.3;

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
      push(K.Mouth, c, o, nn, [s, Math.PI + 0.22]);
    }
    // The tail, ring by ring; each frame lays the rings on the tail's current line.
    let length = 0;
    for (let i = 0; i < TAIL_M - 1; i++) length += TAIL_SEG[i];
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
        // Its bark, fixed once: how far it stands out here, the knots, the grain that runs along it.
        const bx = x + (rnd() - 0.5) * bd * 0.6;
        if (GRID && Math.cos(q) >= 0.5) continue;
        const [r, knot] = counting ? [1, 0] : barkAt(bx, q);
        const ch = knot > 0.42 ? 2 : knot > 0.12 ? 3 : hash(Math.floor(bx * 9) + Math.floor(q * 2)) > 0.5 ? 0 : 1;
        push(K.Branch, ZERO, ZERO, ZERO, [bx, q, r, ch]);
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
  // The walk: where the body is easing to along the branch (`glide`, in branch units) and how far it has got
  // (`slid`: the branch slides back beneath it by as much), each foot's grip on the bark, and the step under way.
  // A hesitant step stops with the foot in the air for a beat before it is put down.
  const slide = still();
  let slid = 0, glide = 0, glideFrom = 0;
  let step = -1, stepAt = 0, stepLen = 1, stepFrom = 0, stepTo = 0, hesitant = false, nextStep = 0.5, gait = 0;
  const grip = LEGS.map((leg, i) => leg[2][0] + STRIDE / 2 - (3 - GAIT.indexOf(i)) * (STRIDE / 4));
  // Each foot's lift off the bark and how far its toes have opened (0 closed round the bark, 1 spread).
  const lifted = new Float32Array(4), opened = new Float32Array(4);
  // The body on its legs: its height and tip over the bark beneath it (`ride`), and how it carries its weight:
  // leaning on or back, sinking, swaying away from you, rolling its back away from you. Rocking is a slow sway
  // back and forth on planted feet, in bouts that end at `rock.until`.
  const ride = { y: still(), pitch: still() };
  const lean = still(), sink = still(), sway = still(), roll = still();
  const rock = { amp: still(), phase: 0, until: 0 };
  // The branch's give: how far it sags under the animal's middle, ringing on after a jolt.
  const sag = still(portrait ? 0 : SAG);
  // The flies: the bug it waits for while it hunts, and any you drop in. The tongue takes one at a time.
  const flies: Fly[] = Array.from({ length: FLIES }, () => ({ on: false, born: 0, home: [0, 0, 0] as P3, eatAt: 0, seed: 0, wild: false, turned: false }));
  const tongue = { state: 0, fly: -1, at: 0 };
  // The jaw: how far open (radians), and when it last swallowed (it chews a few times after).
  const jaw = still();
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
  // Where a point along its own body is along the view, turned round or not.
  const viewX = (x: number) => TURN_X + (x - TURN_X) * hc;
  let gulpAt = -1;
  // The head and the eyes each hold a goal for a moment, then turn quickly to the next; the tail winds tighter or
  // looser now and then, the change running from its root to its tip.
  const head = { goalYaw: 0, goalPitch: 0, next: 0, yaw: still(), pitch: still(sleeping ? -0.16 : 0) };
  const gaze: P3[] = [[0.3, 0, -1], [0.3, 0.1, 1]], gazeGoal: P3[] = [[0.3, 0, -1], [0.3, 0.1, 1]], gazeNext = [0, 0];
  // Between those changes it is never quite still: a slow coiling runs down it, and now and then the tip flicks
  // (`flick`, a curl of the end that springs back), as it does at a footfall.
  const curl = { goal: sleeping ? 0.7 : 0, next: 1, root: still(sleeping ? 0.7 : 0), along: new Float32Array(5).fill(sleeping ? 0.7 : 0) };
  const wound = new Float32Array(9).fill(sleeping ? 0.7 : 0), flick = still();
  let flickAt = 2.5;
  let blinkAt = 1.8;
  let coat = 0, nextCoat = 1, wave = -1;
  // Where the frame's floor is: the branch and its leaves fade out before they reach it, so nothing spills
  // out of the frame where the branch runs toward you and down.
  let floor = -1e9;
  // The branch along the view this frame: its middle's height and depth and its thickness; and each leaf's look.
  const bentness = portrait ? 0 : 1;
  const midY = new Float32Array(TABLE + 1), midZ = new Float32Array(TABLE + 1), thick = new Float32Array(TABLE + 1);
  const leaf = new Float32Array(LEAVES * 8);
  let sagX = 0;
  const branchAt = (x: number, out: P3) => {
    const u = x + slid, g = (x - sagX) / SAG_W;
    out[0] = BRANCH_Y(x) + bentness * waves(u, BEND_Y) - sag.x * Math.exp(-g * g);
    out[1] = bentness * waves(u, BEND_Z);
    out[2] = BRANCH_R * (1 + bentness * waves(u, THICK));
    return out;
  };
  // How far the top of the bark under a point along the body is above where it would be on a straight, unloaded branch.
  const B: P3 = [0, 0, 0];
  const rise = (x: number) => { const vx = viewX(x); branchAt(vx, B); return B[0] + GRIP_UP * B[2] - (BRANCH_Y(vx) + GRIP_UP * BRANCH_R); };
  // The body's pose this frame: a turn (rows of a matrix) and a shift, about the middle of the body.
  const PC: P3 = [0, 0.05, 0];
  const stance = new Float32Array(12);
  stance[0] = stance[4] = stance[8] = 1;
  const posed = (p: P3, isDir: boolean, out: P3): P3 => {
    const x = isDir ? p[0] : p[0] - PC[0], y = isDir ? p[1] : p[1] - PC[1], z = p[2];
    out[0] = stance[0] * x + stance[1] * y + stance[2] * z + (isDir ? 0 : PC[0] + stance[9]);
    out[1] = stance[3] * x + stance[4] * y + stance[5] * z + (isDir ? 0 : PC[1] + stance[10]);
    out[2] = stance[6] * x + stance[7] * y + stance[8] * z + (isDir ? 0 : stance[11]);
    return out;
  };
  // The grid: which glyph holds each cell this frame, and how near it is.
  const owner = new Int32Array(GW * GH), stamp = new Int32Array(GW * GH), depth = new Float32Array(GW * GH);
  const cell = new Int32Array(used), spare = new Int32Array(used), kindNow = new Uint8Array(used);
  const cellK = new Float32Array(used), faceX = new Float32Array(used), faceY = new Float32Array(used);
  let frame = 0;
  // The animal's outline on the screen this frame, in coarse cells: the leaves grow behind it, and a leaf glyph
  // in a cell it covers (or next to one) is hidden, so the animal passes in front of them. The glyphs are drawn
  // without depth, so this is what keeps them behind.
  const SHADE = 0.04, SW = 160, SH = 110;
  const shadeAt = new Int32Array(SW * SH);
  const shadeCell = (x: number, y: number) => {
    const cx = Math.floor(x / SHADE) + (SW >> 1), cy = Math.floor(y / SHADE) + (SH >> 1);
    return cx > 0 && cx < SW - 1 && cy > 0 && cy < SH - 1 ? cy * SW + cx : -1;
  };

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
  // The lower jaw opened by `a` radians about its hinge, for a point or a direction.
  // The tail's root: raised (`lift`, radians) and swung toward or away from you (`wag`) about its hinge.
  const lift = still(), wag = still();
  const swingRoot = (p: P3, share: number, isDir: boolean) => {
    const al = lift.x * share, aw = wag.x * share, cl = Math.cos(al), sl = Math.sin(al), cw = Math.cos(aw), sw = Math.sin(aw);
    const x = isDir ? p[0] : p[0] - TAIL_HINGE[0], y = isDir ? p[1] : p[1] - TAIL_HINGE[1];
    // Raised: the tail turns up about the hinge (it lies behind it, toward -x). Swung: it turns in depth.
    const x1 = cl * x + sl * y, y1 = -sl * x + cl * y, x2 = cw * x1 - sw * p[2], z2 = sw * x1 + cw * p[2];
    p[0] = x2 + (isDir ? 0 : TAIL_HINGE[0]); p[1] = y1 + (isDir ? 0 : TAIL_HINGE[1]); p[2] = z2;
  };
  let jc = 1, js = 0;
  const openJaw = (p: P3, share: number, isDir: boolean) => {
    const c = 1 + (jc - 1) * share, sn = -js * share, x = isDir ? p[0] : p[0] - HINGE[0], y = isDir ? p[1] : p[1] - HINGE[1];
    p[0] = c * x - sn * y + (isDir ? 0 : HINGE[0]);
    p[1] = sn * x + c * y + (isDir ? 0 : HINGE[1]);
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

    // --- The walk: one foot at a time, a pause between, the body easing on over each foot ----------------------
    if (!portrait && phase === "walk" && step < 0 && t > nextStep && turn.now === 0 && turn.at < 0) {
      if (stepsLeft <= 0) {
        go("hunt");
        spawn(BUGS[bugs++ % BUGS.length], 3.2 + rnd() * 3, true, t);
      } else {
        step = GAIT[gait % 4]; gait++; stepsLeft--; stepAt = t;
        hesitant = rnd() < 0.3;
        stepLen = (hesitant ? 1.15 : 0.62) + rnd() * 0.2;
        glideFrom = glide;
        stepFrom = grip[step];
        stepTo = LEGS[step][2][0] + STRIDE / 2 + glide + STRIDE / 4;
      }
    }
    let stepP = 0, weight = 0;
    lifted.fill(0); opened.fill(0);
    if (step >= 0) {
      stepP = clamp((t - stepAt) / stepLen);
      // The foot peels off the bark, travels (or stops short in the air a moment) and is put down; the toes part
      // as it lifts and close round the bark as it lands. The body follows it on, a little behind.
      const reach = hesitant ? paused(stepP, 0.05, 0.42, 0.7, 0.93, 0.72) : ease((stepP - 0.08) / 0.8);
      grip[step] = stepFrom + (stepTo - stepFrom) * reach;
      lifted[step] = smooth(0, 0.22, stepP) * (1 - smooth(hesitant ? 0.82 : 0.7, 0.98, stepP));
      opened[step] = smooth(0.02, 0.2, stepP) * (1 - smooth(0.84, 1, stepP));
      glide = glideFrom + (STRIDE / 4) * (hesitant ? paused(stepP, 0.1, 0.45, 0.68, 1, 0.6) : ease((stepP - 0.12) / 0.88));
      weight = smooth(0, 0.25, stepP) * (1 - smooth(0.7, 1, stepP));
      if (hesitant && stepP > 0.4 && stepP < 0.7) rock.until = t + 0.1;
      if (stepP >= 1) {
        step = -1;
        // The foot coming down jolts the branch, and the tail with it.
        sag.v -= 0.06;
        flick.v += (rnd() - 0.5) * 1.6;
        const rest = rnd() * rnd();
        nextStep = t + 0.12 + rest * 1.2;
        // A long pause: it rocks on its feet.
        if (rest > 0.4) rock.until = nextStep - 0.1;
      }
    }
    if (phase === "gone" && t - phaseAt > 1.2) { go("walk"); stepsLeft = 3 + Math.floor(rnd() * 4); nextStep = t + 0.35; }
    slid = spring(slide, glide, 11, 1, dt);

    // --- Turning round: a fly behind it (in its own frame) and it turns to face it, lifting a little as it goes; --
    // with nothing left to eat it waits a moment and turns back to walk on.
    if (turn.at >= 0) {
      const p = clamp((t - turn.at) / TURN_TIME);
      turn.now = turn.from + (turn.goal - turn.from) * ease(p);
      hop = 0.045 * Math.sin(Math.PI * p) ** 2;
      if (p >= 1) { turn.now = turn.goal; turn.at = -1; hop = 0; sag.v -= 0.3; }
    }
    hc = Math.cos(turn.now); hs = Math.sin(turn.now);
    cy = Math.cos(yaw * hc); sy = Math.sin(yaw * hc);
    sagX = viewX(0);
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
        flies[next].eatAt = Math.max(flies[next].eatAt, t + TURN_TIME + 0.15);
      } else if (!anyFly && turn.now !== 0) {
        if (turn.backAt < 0) turn.backAt = t + 0.6;
        else if (t > turn.backAt) { turn.from = turn.now; turn.goal = 0; turn.at = t; turn.backAt = -1; }
      }
    }

    // --- The tongue: out at the first fly that is due, held on it a moment, reeled back in with it -------------
    if (tongue.state === 0 && turn.at < 0) {
      let due = -1;
      flies.forEach((f, i) => { if (f.on && f.eatAt <= t && (due < 0 || f.eatAt < flies[due].eatAt)) due = i; });
      if (due >= 0) {
        tongue.state = 1; tongue.fly = due; tongue.at = t;
        // The kick of the strike: the head and the body thrown back a little, the branch jolted.
        head.pitch.v += 2.2; lean.v -= 0.35; sag.v += 0.12;
      }
    } else if (tongue.state === 1 && t - tongue.at > SHOOT + HOLD) { tongue.state = 2; tongue.at = t; }
    else if (tongue.state === 2 && t - tongue.at > REEL) {
      const f = flies[tongue.fly];
      f.on = false;
      tongue.state = 0;
      gulpAt = t;
      sag.v -= 0.05;
      // Each catch puts on a new coat; one already running down finishes at once.
      if (wave >= 0) coat = nextCoat;
      wave = t; nextCoat = (coat + 1) % COATS.length;
      if (f.wild && phase === "hunt") go("gone");
    }
    const tAge = t - tongue.at;
    // Out fast, a touch past the fly and back onto it; reeled in gathering speed and slowing into the mouth, the
    // tongue bowing under the fly's weight as it comes.
    let reach = 0, bow = 0;
    if (tongue.state === 1) reach = tAge < SHOOT ? snap(tAge / SHOOT) * (1 + 0.09 * Math.sin(Math.PI * clamp(tAge / SHOOT))) : 1;
    else if (tongue.state === 2) { const p = clamp(tAge / REEL); reach = 1 - ease(p); bow = 0.14 * Math.sin(Math.PI * p); }
    // What it is watching: the fly on the tongue, else the one due soonest.
    let focus = tongue.state ? tongue.fly : -1;
    if (focus < 0) flies.forEach((f, i) => { if (f.on && (focus < 0 || f.eatAt < flies[focus].eatAt)) focus = i; });
    // Everything it aims at, in its own frame (it may have turned round).
    const target = focus >= 0 ? toBody(flyAt(flies[focus], t)) : null;
    const intent = focus >= 0 && (tongue.state > 0 || flies[focus].eatAt - t < 0.9);
    // Just before it strikes it parts its jaws and the tip of the tongue shows; after a catch it chews.
    const gape = !!target && target[0] > PIVOT[0] && tongue.state === 0 && turn.at < 0 && flies[focus].eatAt - t < 0.3;
    if (gape) reach = 0.035;
    const chew = gulpAt >= 0 && t - gulpAt > 0.2 && t - gulpAt < 1.1 ? 0.09 * (0.5 - 0.5 * Math.cos(TAU * 3 * (t - gulpAt - 0.2) / 0.9)) : 0;
    spring(jaw, tongue.state ? 0.34 : gape ? 0.24 : chew, 26, 0.85, dt);
    jc = Math.cos(Math.max(0, jaw.x)); js = Math.sin(Math.max(0, jaw.x));

    // --- The head: hold, then turn quickly to the next thing, gathering and settling ------------------------
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
    spring(head.yaw, head.goalYaw, intent ? 30 : 17, 0.78, dt);
    spring(head.pitch, head.goalPitch, intent ? 30 : 17, 0.78, dt);

    // --- The body on its legs: riding the bark, carrying its weight off a lifted foot, rocking, leaning in -------
    spring(sag, portrait ? 0 : SAG + 0.004 * Math.sin(t * 0.7), 13, 0.16, dt);
    const fore = rise(FORE_X), hind = rise(HIND_X);
    spring(ride.y, (fore + hind) / 2, 15, 0.85, dt);
    spring(ride.pitch, Math.atan2(fore - hind, FORE_X - HIND_X), 15, 0.85, dt);
    const sideOf = step >= 0 && LEGS[step][0][2] > 0 ? 1 : -1, forward = step >= 0 && step < 2 ? 1 : -1;
    spring(lean, (step >= 0 ? -forward * 0.014 * weight : 0) + (intent ? 0.025 : 0), 7, 0.9, dt);
    spring(sink, -0.008 * weight + (hesitant ? -0.006 * weight : 0), 7, 0.9, dt);
    spring(sway, -sideOf * 0.02 * weight, 6, 0.9, dt);
    spring(roll, -sideOf * 0.05 * weight, 6, 0.9, dt);
    // Waiting on a bug it sways now and then too, but holds still to strike.
    if (phase === "hunt" && !intent && t > rock.until + 1.5 && rnd() < dt * 0.3) rock.until = t + 1.2 + rnd() * 1.8;
    spring(rock.amp, t < rock.until && !intent ? 0.017 : 0, 4, 1, dt);
    rock.phase += dt * TAU * 1.25;
    const breath = 0.02 * Math.sin(t * 1.7);
    const gulp = gulpAt >= 0 ? Math.sin(Math.PI * clamp((t - gulpAt) / 0.45)) : 0;
    {
      const pitch = ride.pitch.x, cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll.x), sr = Math.sin(roll.x);
      stance[0] = cp; stance[1] = -sp; stance[2] = 0;
      stance[3] = cr * sp; stance[4] = cr * cp; stance[5] = -sr;
      stance[6] = sr * sp; stance[7] = sr * cp; stance[8] = cr;
      stance[9] = lean.x + rock.amp.x * Math.sin(rock.phase);
      stance[10] = ride.y.x + sink.x;
      stance[11] = sway.x;
    }
    // The head keeps itself level while the body tips beneath it.
    const headPitch = head.pitch.x - ride.pitch.x * 0.75;
    hcY = Math.cos(head.yaw.x); hsY = Math.sin(head.yaw.x); hcP = Math.cos(headPitch); hsP = Math.sin(headPitch);
    const mouth: P3 = [SNOUT[0], SNOUT[1], 0];
    openJaw(mouth, 0.5, false);
    const snout = posed(turnHead(mouth, 1), false, mouth);
    const eyes = [turnHead(EYES[0], 1), turnHead(EYES[1], 1)];
    const tip: P3 = target ? [snout[0] + (target[0] - snout[0]) * reach, snout[1] + (target[1] - snout[1]) * reach, snout[2] + (target[2] - snout[2]) * reach] : snout;
    // The bow is a share of the tongue's length, so a short tongue is near straight.
    bow *= Math.hypot(...sub(tip, snout));

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

    // --- The tail winds to a new curl now and then (looser while it walks), the change running down it -------
    if (t > curl.next) { curl.goal = phase === "walk" ? -0.7 + rnd() * 0.9 : rnd() * 2 - 1; curl.next = t + 1.2 + rnd() * 2.6; }
    curl.along[0] = spring(curl.root, curl.goal, 3.2, 1, dt);
    for (let j = 1; j < curl.along.length; j++) curl.along[j] += (curl.along[j - 1] - curl.along[j]) * (1 - Math.exp(-dt / 0.16));
    if (!portrait && t > flickAt) { flick.v += (rnd() < 0.5 ? -1 : 1) * (2.5 + rnd() * 2.5); flickAt = t + 2 + rnd() * 4.5; }
    spring(flick, 0, 9, 0.45, dt);
    for (let j = 0; j < wound.length; j++) {
      const u = j / (wound.length - 1), f = u * (curl.along.length - 1), k = Math.min(curl.along.length - 2, f | 0);
      const coil = portrait ? 0 : (0.22 * Math.sin(t * 0.85 - u * 3.2) + 0.12 * Math.sin(t * 1.9 - u * 5.5 + 1.3)) * (0.4 + u);
      wound[j] = curl.along[k] + (curl.along[k + 1] - curl.along[k]) * (f - k) + coil + flick.x * u * u;
    }
    // The root: it lifts and swings slowly on its own, raises the tail a little while a foot is up (for balance),
    // swings against the body's sway and gives with each flick.
    spring(lift, portrait ? 0 : 0.1 * Math.sin(t * 0.7) + 0.045 * Math.sin(t * 1.63 + 0.5) + 0.07 * weight + 0.03 * flick.x, 5, 0.9, dt);
    spring(wag, portrait ? 0 : 0.09 * Math.sin(t * 0.53 + 2) + 0.04 * Math.sin(t * 1.31) - 2 * sway.x, 5, 0.9, dt);
    bendTail(wound, portrait ? 0 : 1.4 + 0.6 * Math.sin(t * 0.37), t * 1.6, portrait ? 0 : 0.2 * Math.sin(t * 0.9 + 0.8), tail);

    // --- The legs: each foot where it grips the branch (or in the air, mid-step), the elbow found from there --
    const S0: P3 = [0, 0, 0];
    const joints = LEGS.map((leg, i) => {
      const S = posed(leg[0], false, S0.slice() as P3);
      const fx = grip[i] - slid, lift = lifted[i];
      branchAt(viewX(fx), B);
      // The foot on top of the bark, gripping round it on its own side; lifted, it swings out a little to clear it.
      const F: P3 = [fx, B[0] + GRIP_UP * B[2] + lift * 0.1, hc * B[1] + leg[2][2] * (B[2] / BRANCH_R) * (1 + lift * 0.5)];
      const { l1, l2, bend } = BONES[i];
      const toF = sub(F, S), dist = Math.min(Math.hypot(...toF), (l1 + l2) * 0.995), u = unit(toF);
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const bd = posed(bend, true, [0, 0, 0]);
      const b = unit([bd[0] - u[0] * dot(bd, u), bd[1] - u[1] * dot(bd, u), bd[2] - u[2] * dot(bd, u)]);
      const E: P3 = [S[0] + u[0] * a + b[0] * h, S[1] + u[1] * a + b[1] * h, S[2] + u[2] * a + b[2] * h];
      const Fr: P3 = [S[0] + u[0] * dist, S[1] + u[1] * dist, S[2] + u[2] * dist];
      const across = [[S, E], [E, Fr]].map(([A, Bn]) => {
        const T = unit(sub(Bn, A));
        let x = cross(T, [0, 0, 1]);
        if (Math.hypot(...x) < 0.1) x = cross(T, [1, 0, 0]);
        x = unit(x);
        return { A, B: Bn, x, y: cross(T, x) };
      });
      return { across, F: Fr };
    });

    // --- The coat being rewritten down the body, and the tear ------------------------------------------------
    let front = -1;
    if (wave >= 0) {
      front = ((t - wave) / 1.2) * 1.25 - 0.1;
      if (front > 1.15) { coat = nextCoat; wave = -1; front = -1; }
    }

    // --- The branch and its leaves, as the branch lies this frame ---------------------------------------------
    if (!portrait) {
      for (let j = 0; j <= TABLE; j++) {
        branchAt(BARK_FROM + (j * BARK_SPAN) / TABLE, B);
        midY[j] = B[0]; midZ[j] = B[1]; thick[j] = B[2];
      }
      for (let slot = 0; slot < LEAVES; slot++) {
        const at = (leafAt[slot] - slid - BARK_FROM) / BARK_SPAN, lap = Math.floor(at), x = BARK_FROM + frac(at) * BARK_SPAN;
        // This time round: how long, how wide, which way it hangs, and whether it is there at all. It stirs in
        // the air, each leaf on its own.
        const h1 = hash(slot * 13.7 + lap * 7.1), h2 = hash(slot * 5.3 + lap * 11.9), h3 = hash(slot * 2.1 + lap * 3.7);
        const up = h3 > 0.72, stir = 0.07 * Math.sin(t * 1.1 + slot * 2.3) + 0.03 * Math.sin(t * 2.7 + slot * 1.7);
        const ang = (up ? Math.PI / 2 + (h1 - 0.5) * 1.3 : -Math.PI / 2 + (h1 - 0.5) * 2.2) + stir;
        const ax = Math.cos(ang), ay = Math.sin(ang), o = slot * 8;
        branchAt(x, B);
        leaf[o] = x + ax * B[2]; leaf[o + 1] = B[0] + ay * B[2]; leaf[o + 2] = ax; leaf[o + 3] = ay;
        leaf[o + 4] = 0.18 + 0.22 * h2; leaf[o + 5] = 0.05 + 0.05 * h1; leaf[o + 6] = B[1] + (up ? 0.1 : h2 > 0.5 ? 0.12 : 0.07);
        leaf[o + 7] = (h3 < 0.12 ? 0 : 1) * smooth(BARK_FROM, BARK_FROM + 0.9, x) * (1 - smooth(BARK_FROM + BARK_SPAN - 0.8, BARK_FROM + BARK_SPAN, x));
      }
    }

    // --- Every glyph: where it is, which way it faces, what it shows ------------------------------------------
    const P: P3 = [0, 0, 0], N: P3 = [0, 0, 0], Q: P3 = [0, 0, 0], M: P3 = [0, 0, 0];
    // Screen-space direction of the tongue, for the characters that draw it.
    const tdx = (cy * (tip[0] - snout[0]) + sy * (tip[2] - snout[2])), tdy = tip[1] - snout[1];
    const lineChar = (dx: number, dy: number) => Math.abs(dy) < Math.abs(dx) * 0.4 ? "-" : Math.abs(dx) < Math.abs(dy) * 0.4 ? "|" : dx * dy > 0 ? "/" : "\\";
    for (let i = 0; i < used; i++) {
      const k = kind[i], i3 = i * 3;
      let role: Color = "fg", chars = "", alpha = 1, lit = true, share = 0, bias = 0, mode = 0, flat = false, body = false;
      let fx = 0;
      const fy = 0;
      const wear = COATS[front >= 0 && paint[i] < front ? nextCoat : coat];
      if (k === K.Body || k === K.Mouth) {
        const sv = a0[i], sn = Math.sin(a1[i]);
        let puff = k === K.Body ? 1 + breath * Math.sin(Math.PI * clamp(sv / 0.7)) : 1;
        // The gulp swells the throat.
        if (gulp > 0 && sn < 0) puff += 0.3 * gulp * Math.exp(-(((sv - 0.74) / 0.06) ** 2));
        for (let a = 0; a < 3; a++) { P[a] = cen[i3 + a] + off[i3 + a] * puff; N[a] = nor[i3 + a]; }
        if (js > 0.003 && sv > 0.8 && sn < 0) { const jw = jawShare(sv, sn); openJaw(P, jw, false); openJaw(N, jw, true); }
        if (sv < 0.14 && (lift.x || wag.x)) { const w = rumpShare(sv); swingRoot(P, w, false); swingRoot(N, w, true); }
        share = headShare(sv);
        body = true;
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
        P[0] = x + N[0] * rad; P[1] = y + N[1] * rad; P[2] = N[2] * rad + (portrait ? 0 : u * u * (0.04 * Math.sin(t * 0.9 + 1) + 0.015 * Math.sin(t * 2.3 - u * 4)));
        if (lift.x || wag.x) { swingRoot(P, 1, false); swingRoot(N, 1, true); }
        mode = band(stripe[i]); role = wear[mode];
        body = true;
      } else if (k === K.Leg) {
        const bone = joints[a0[i]].across[a1[i]], f = a2[i], q = a3[i], r = LEG_R[a1[i]] * (1 + bump[i]);
        const cq = Math.cos(q), sq = Math.sin(q);
        for (let a = 0; a < 3; a++) {
          N[a] = bone.x[a] * cq + bone.y[a] * sq;
          P[a] = bone.A[a] + (bone.B[a] - bone.A[a]) * f + N[a] * r;
        }
        mode = band(stripe[i]); role = wear[mode];
      } else if (k === K.Foot) {
        // A foot closes round the bark; lifted, its two bundles of toes part, fore and aft.
        const li = a0[i], F = joints[li].F, op = opened[li], ox = off[i3];
        P[0] = F[0] + ox * (1 + 0.3 * op) + Math.sign(ox) * op * 0.03;
        P[1] = F[1] + off[i3 + 1] + op * 0.025 * Math.abs(nor[i3]);
        P[2] = F[2] + off[i3 + 2];
        N[0] = nor[i3]; N[1] = nor[i3 + 1]; N[2] = nor[i3 + 2];
        mode = band(stripe[i]); role = wear[mode];
      } else if (k === K.Eye) {
        const e = a0[i] > 0 ? 1 : 0, c = eyes[e];
        Q[0] = off[i3]; Q[1] = off[i3 + 1] * (1 - 0.7 * blink); Q[2] = off[i3 + 2];
        const o = turnHead(Q, 1, true, Q);
        M[0] = nor[i3]; M[1] = nor[i3 + 1]; M[2] = nor[i3 + 2];
        const nn = turnHead(M, 1, true, M);
        P[0] = c[0] + o[0]; P[1] = c[1] + o[1]; P[2] = c[2] + o[2];
        N[0] = nn[0]; N[1] = nn[1]; N[2] = nn[2];
        body = true;
        const sees = dot(nn, gaze[e]);
        bias = -0.06;
        if (blink < 0.35 && sees > 0.94) { role = "fg"; chars = "@"; mode = 3; }
        else if (blink < 0.35 && sees > 0.78) { role = "amber"; chars = "O0"; mode = 3; }
        // The turret: rings of skin round the pupil, the way a chameleon's eye is built.
        else if (blink >= 0.35) { role = wear[0]; chars = "-"; mode = 3; }
        else { role = wear[band(1 - sees * 2.2)]; chars = band(1 - sees * 2.2) ? "()" : ""; mode = chars ? 3 : 0; }
      } else if (k === K.Branch) {
        const x = BARK_FROM + frac((a0[i] - slid - BARK_FROM) / BARK_SPAN) * BARK_SPAN, q = a1[i];
        const f = ((x - BARK_FROM) * TABLE) / BARK_SPAN, j = Math.min(TABLE - 1, f | 0), r = f - j;
        const rad = (thick[j] + (thick[j + 1] - thick[j]) * r) * a2[i];
        N[0] = 0; N[1] = Math.sin(q); N[2] = Math.cos(q);
        P[0] = x; P[1] = midY[j] + (midY[j + 1] - midY[j]) * r + N[1] * rad; P[2] = midZ[j] + (midZ[j + 1] - midZ[j]) * r + N[2] * rad;
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
        const u = a0[i], sb = Math.sin(Math.PI * u);
        for (let a = 0; a < 3; a++) P[a] = snout[a] + (tip[a] - snout[a]) * u;
        P[1] -= bow * sb;
        role = "rose"; chars = u > 0.97 ? "@" : lineChar(tdx, tdy - bow * Math.PI * Math.cos(Math.PI * u)); mode = 3;
        alpha = reach > 0.02 ? 1 : 0; lit = false; bias = -10;
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
      // The body, the head, the eyes and the tail carried on the legs.
      if (body) { posed(P, false, P); posed(N, true, N); }
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
      if (!GRID && (living || k === K.Mouth || k === K.Eye)) {
        const c = shadeCell((x1 - offX) * kk, (y2 - offY) * kk);
        if (c >= 0) shadeAt[c] = frame;
      } else if (!GRID && k === K.Leaf && alpha > 0.01) {
        // Hidden where the animal covers it, fading over the cells along its edge.
        const c = shadeCell((x1 - offX) * kk, (y2 - offY) * kk);
        if (c >= 0) {
          let hid = shadeAt[c] === frame ? 4 : 0;
          for (const o of [1, -1, SW, -SW, SW + 1, SW - 1, 1 - SW, -1 - SW]) if (shadeAt[c + o] === frame) hid++;
          alpha *= 1 - clamp(hid / 4);
        }
      }
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
  // page loads); on the grid it is laid out again so every glyph lands in its cell. The branch fades at the
  // frame's floor from the first frame on.
  if (GRID) {
    last = 0; phaseAt = 0; nextStep = 0.5; frame = 0;
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
    spawn(fromScreen(x, y, -0.25), 0.4 + queued * 0.5, false, t);
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
