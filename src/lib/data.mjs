// All build inputs live in the landing. The core exports a versioned theme snapshot; discovered
// repositories own their README, metadata and real screenshots.
import legacyImages from "../../data/legacy-images.json" with { type: "json" };
import { ACCENT_ORDER, ANSI_ORDER, GLYPHS, NEUTRAL_ORDER, SLOGAN, TEXT_ROLES, flavors } from "./theme.mjs";
import { groups, ports } from "./ports.mjs";
import { escapeHtml } from "./highlight.mjs";
import { inline } from "./markdown.mjs";

export const SITE = "https://living-code.dev";
export const REPO = "https://github.com/ElliotLuque/living-code";
export { ACCENT_ORDER, ANSI_ORDER, NEUTRAL_ORDER, SLOGAN, TEXT_ROLES, flavors };

// --- Flavors -------------------------------------------------------------------------------------------

export const flavorIds = flavors.map((f) => f.id);
export const short = (f) => f.name.replace("Living Code ", "");
export const flavorById = Object.fromEntries(flavors.map((f) => [f.id, f]));

const ratio = (r) => r < 10 ? r.toFixed(2) : r.toFixed(1);

// One sentence per flavor for the flavor switcher; the full description is the palette's own.
export const CLAUSES = {
  night: "Dark slate, the full palette.",
  frost: "Night with a third of the chroma taken out.",
  paper: "Daylight, with AA contrast kept.",
  signal: "One accent. Slate does the rest.",
};

export const contrastRange = (f) => {
  const all = TEXT_ROLES.map((r) => [r, f.contrastToBase[f.roles[r]]]).sort((a, b) => a[1] - b[1]);
  return { low: { role: all[0][0], color: f.roles[all[0][0]], ratio: all[0][1] }, high: { role: all.at(-1)[0], color: f.roles[all.at(-1)[0]], ratio: all.at(-1)[1] } };
};

// The accents as points on an OKLCH hue wheel: angle is hue, distance from the middle is chroma, so Frost
// visibly pulls in toward the gray center and Signal collapses onto teal and the slate.
export const wheel = (f) => ACCENT_ORDER.map((name) => {
  const [L, C, h] = f.raw[name];
  return { name, L, C, h, css: f.colors[name].css, hex: f.colors[name].hex };
});

// Roles shown on a flavor's page, in reading order, with what each one colors.
export const ROLE_GROUPS = [
  ["Code", ["keyword", "function", "type", "string", "number", "constant", "decorator", "tag", "property", "parameter", "operator", "comment"]],
  ["Diagnostics", ["error", "warning", "info", "hint", "success"]],
  ["Diff", ["added", "removed", "modified"]],
  ["Interface", ["fg", "fgAlt", "fgMuted", "accent", "cursor", "selection", "lineNumber", "lineNumberActive", "link"]],
];

const camel = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
export const roleVar = (role) => `--lc-${camel(role)}`;

export const roleRow = (f, role) => {
  const name = f.roles[role];
  const color = f.colors[name];
  return { role, name, css: color.css, hex: color.hex, ratio: ratio(f.contrastToBase[name]) };
};

// The data the flavor switcher and the living field read in the browser: role and palette colors per flavor,
// and each accent's chroma and hue for the glyph hue wheel.
export const flavorData = Object.fromEntries(flavors.map((f) => [f.id, {
  name: short(f),
  light: f.light,
  base: f.colors.base.hex,
  roles: Object.fromEntries(Object.keys(f.roles).map((role) => [role, f.colors[f.roles[role]].hex])),
  colors: Object.fromEntries([...NEUTRAL_ORDER, ...ACCENT_ORDER].map((name) => [name, f.colors[name].hex])),
  accents: ACCENT_ORDER.map((name) => [name, +f.raw[name][1].toFixed(4), +f.raw[name][2].toFixed(2)]),
}]));

// --- Ports ---------------------------------------------------------------------------------------------

export { ports, groups };
export const portIds = new Set(ports.map((p) => p.id));
export const groupOf = Object.fromEntries(groups.flatMap((g) => g.ports.map((p) => [p.id, g.title])));

// How you get each port, without the README's pointer to the text below it.
export const route = (id) => {
  const p = ports.find((port) => port.id === id);
  return p.repository ? escapeHtml(p.quick) : inline(p.quick.replace(/,? see below/, "").replace(/ \(.*?\)$/, "").replace(/ today$/, ""), portIds);
};

// Supported flavors are declared by each port, independent of its file layout.
export const shipped = (p) => flavors.filter((f) => p.flavors.includes(f.id));

// Every file a port is made of, as repo paths, for the "what you get" list on its page.
export const files = (p) => p.files;

// Extra words the port filter accepts besides a port's name and id.
export const ALIASES = {
  neovim: ["nvim", "vim", "lazyvim", "lua"],
  vscode: ["code", "visual studio code", "cursor", "vscodium", "windsurf", "open vsx", "shiki"],
  jetbrains: ["intellij", "idea", "pycharm", "webstorm", "goland", "rider", "clion", "rubymine", "phpstorm", "datagrip", "android studio"],
  sublime: ["sublime text", "subl"],
  tmtheme: ["bat", "textmate"],
  "windows-terminal": ["wt", "windows"],
  iterm2: ["iterm", "mac terminal"],
  chrome: ["chromium", "brave", "google chrome", "edge"],
  firefox: ["mozilla", "librewolf", "zen"],
  delta: ["git delta", "git"],
  lazygit: ["git ui"],
  "expressive-code": ["astro", "starlight", "ec"],
  css: ["css variables", "custom properties", "web"],
  tailwind: ["tailwindcss", "tw"],
  json: ["palette", "javascript", "js", "npm", "typescript"],
  base16: ["stylix", "nix", "nixos", "home-manager", "tinted", "tinty"],
  starship: ["prompt"],
  ghostty: ["ghost"],
};
export const keys = (p) => [p.name, p.id, ...(p.aliases ?? []), ...(ALIASES[p.id] ?? [])].join("|").toLowerCase();

// --- Screenshots ---------------------------------------------------------------------------------------

// Discovered captures are cached from their owning repository. Temporary legacy captures and their
// index are committed inside the landing; no process.cwd() or parent filesystem fallback is needed.
export const shotsOf = (app) => {
  const port = ports.find((p) => p.id === app);
  if (port?.repository) return port.images.map((image) => ({ ...image, f: flavorById[image.flavor] }));
  return (legacyImages.images[app] ?? []).map((image) => ({ ...image, f: flavorById[image.flavor] }));
};
const featured = [
  { port: "vscode", name: "VS Code" },
  { port: "jetbrains", name: "IntelliJ IDEA" },
  { port: "sublime", name: "Sublime Text" },
  { port: "obsidian", name: "Obsidian" },
  { port: "chrome", name: "Chromium" },
];
export const APPS = [
  ...featured.filter((app) => ports.some((p) => p.id === app.port) && shotsOf(app.port).length),
  ...ports.filter((p) => p.repository && p.images.length && !featured.some((app) => app.port === p.id)).map((p) => ({ port: p.id, name: p.name })),
];

// --- The mark ------------------------------------------------------------------------------------------

// The [lc] mark as JetBrains Mono Bold outlines, the same glyphs as the marketplace icons.
export const MARK_VIEWBOX = "185 -830 2030 940";
export const markGlyphs = [..."[lc]"].map((ch, i) => ({ d: GLYPHS[ch], x: i * 600 }));

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
