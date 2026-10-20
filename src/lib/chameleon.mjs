// The Living Code chameleon: side on, facing right, gripping a branch, its tail curled into a spiral. One set of
// outlines in a 1200 by 520 box, drawn twice: filled with code glyphs in the hero (src/scripts/living/shapes.ts),
// and as the still picture shown where there is no WebGL (src/components/Chameleon.astro).
//
// Each part is an SVG path, filled, or stroked at `width` with round ends. "cut" parts are holes in what is under them.
// Parts marked `wide` reach past the chameleon and are left out when the shape is fitted to its frame.

export const CHAMELEON_VIEWBOX = "0 0 1200 520";

const r1 = (n) => Math.round(n * 10) / 10;
const circle = (x, y, r) => `M${r1(x - r)} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;

// The tail: a strip that leaves the body, sweeps left and winds inward, thinning as it goes.
function tail() {
  const line = [];
  // The sweep out of the body: a quadratic from the tail's root to the top of the spiral.
  const [p0, p1, p2] = [[425, 272], [320, 300], [262, 312]];
  for (let i = 0; i < 24; i++) {
    const t = i / 24, u = 1 - t;
    line.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  // The spiral, turning the way the sweep was heading, tighter toward the tip.
  const c = [262, 408], turns = 1.65;
  for (let i = 0; i <= 90; i++) {
    const s = i / 90, a = -Math.PI / 2 - s * turns * Math.PI * 2, r = 96 - 74 * Math.pow(s, 0.9);
    line.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  let total = 0;
  const along = line.map((p, i) => (total += i ? Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0));
  const left = [], right = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const w = 25 - 19 * Math.pow(along[i] / total, 0.7);
    left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
    right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
  });
  const pts = [...left, ...right.reverse()];
  const end = line[line.length - 1];
  return `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}z` + circle(r1(end[0]), r1(end[1]), 6);
}

// The spine, from the tail's root to the neck, and a low crest of spikes standing on it.
const BACK = [[400, 250], [450, 150], [640, 110], [790, 150]];
function crest() {
  const at = (t) => {
    const u = 1 - t, [a, b, c, d] = BACK;
    const x = u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0];
    const y = u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1];
    return [x, y];
  };
  let d = "";
  for (let k = 0; k < 14; k++) {
    const t0 = 0.16 + k * 0.05, [x0, y0] = at(t0), [x1, y1] = at(t0 + 0.05), [xm, ym] = at(t0 + 0.025);
    const nx = (y1 - y0), ny = -(x1 - x0), l = Math.hypot(nx, ny), h = 9 * Math.sin(Math.PI * (k + 0.5) / 14) + 4;
    // Each spike stands on the spine and sinks a little into the body, so the two outlines join.
    d += `M${r1(x0 - (nx / l) * 6)} ${r1(y0 - (ny / l) * 6)}L${r1(xm + (nx / l) * h)} ${r1(ym + (ny / l) * h)}L${r1(x1 - (nx / l) * 6)} ${r1(y1 - (ny / l) * 6)}z`;
  }
  return d;
}

export const CHAMELEON = [
  // The branch runs on past both edges of the frame; a twig and a leaf at the front.
  { part: "branch", wide: true, width: 22, d: "M-400 404Q600 364 1600 396" },
  { part: "branch", width: 9, d: "M1040 382Q1092 352 1128 318" },
  { part: "leaf", d: "M1128 318Q1150 268 1196 252Q1186 306 1128 318z" },
  { part: "body", d: tail() },
  // Body and head in one outline: the arched back, the casque rising behind the eye, the snout, the throat, the belly.
  { part: "body", d: `M${BACK[0].join(" ")}C${BACK.slice(1).map((p) => p.join(" ")).join(" ")}Q815 160 832 148L852 108Q962 148 1022 238Q1030 266 1000 282Q940 312 870 300C840 320 800 324 770 318C680 332 520 332 440 306Q390 290 400 250z` },
  { part: "body", d: crest() },
  // The legs, bent at the elbow, and the feet closed round the branch.
  { part: "body", width: 22, d: "M520 300L462 340L480 382" },
  { part: "body", width: 22, d: "M768 300L824 338L800 382" },
  { part: "body", d: circle(480, 386, 14) + circle(800, 386, 14) },
  // The mouth, a thin line back from the snout.
  { part: "cut", width: 6, d: "M1014 256Q962 288 900 280" },
  // The turret eye: a ring of skin, the iris and the pupil.
  { part: "cut", d: circle(906, 208, 29) },
  { part: "eye", d: circle(906, 208, 23) },
  { part: "pupil", d: circle(912, 206, 9) },
];
