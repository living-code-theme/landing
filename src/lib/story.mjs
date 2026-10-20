// The palette story's glyph studies, in the colors each step adds. The first two are code tokens; Data and
// Signals are shapes made from code characters, like the hero. Each path takes the matching role's color.
// The same paths draw the still stand-ins where there is no WebGL.
export const ART = { width: 600, height: 200, stroke: 20 };
const valueBlock = (x) => `M${x} 28l64 36v72l-64 36-64-36V64zM${x - 64} 64l64 36 64-36M${x} 100v72M${x - 46} 94l28 16M${x - 46} 118l28 16M${x + 18} 110l28-16M${x + 18} 134l28-16`;
export const TOKENS = [
  { text: "//", roles: ["fgMuted", "comment", "overlay", "lineNumber"] },
  { text: "fn", roles: ["keyword", "function", "type"] },
  {
    label: "Strings, numbers and constants as three blocks of code glyphs",
    roles: ["string", "number", "constant"],
    paths: [100, 300, 500].map(valueBlock),
  },
  {
    label: "Error, warning, info and hint as a cross, a warning triangle, an info circle and a light bulb",
    roles: ["error", "warning", "info", "hint"],
    paths: [
      "M75 42a58 58 0 1 0 0 116a58 58 0 1 0 0-116zM55 80l40 40M95 80l-40 40",
      "M225 36l64 122H161zM225 82v36M225 140v1",
      "M375 42a58 58 0 1 0 0 116a58 58 0 1 0 0-116zM375 94v34M375 72v1",
      "M505 142v-15a42 42 0 1 1 40 0v15zM507 160h36M513 178h24M525 14v12M468 34l10 10M582 34l-10 10",
    ],
  },
];

// How much scroll the story takes, in screen heights: each step holds still for `hold` while its text reads, and
// the pass from one step to the next (the scan through the file, the token re-forming) takes `pass`.
// Only the passes are extended; the pauses keep their original half-screen length.
export const PACE = { hold: 0.5, pass: 1.8 };

// The camera on the file. Each step rests on the lines it colors: `line` is the line at the middle of the frame
// (from 1, halves allowed), `x` how far across the file, `zoom` against the whole file fitting, and the tilt in
// degrees (rx leans the top away, ry turns the right side toward you, rz rolls). Between steps the camera lays the
// file down flat as a floor (`FLIGHT`) and rides the scan line along it, then rises into the next step's shot.
export const SHOTS = [
  { line: 9, x: 0.42, zoom: 0.94, rx: 34, ry: -18, rz: 4 }, // the whole file, still slate, lying on the desk
  { line: 7.5, x: 0.3, zoom: 1.45, rx: 8, ry: 22, rz: -2 }, // @flavor, export class, extends
  { line: 8, x: 0.36, zoom: 1.4, rx: -6, ry: -16, rz: 1.5 }, // ground's numbers, the flavor's name
  { line: 9, x: 0.5, zoom: 0.98, rx: 0, ry: 0, rz: 0 }, // Signals: the finished file, square to the screen
];
export const FLIGHT = { rx: 58, zoom: 1.55, x: 0.45 };
export const travel = () => TOKENS.length * PACE.hold + (TOKENS.length - 1) * PACE.pass;
