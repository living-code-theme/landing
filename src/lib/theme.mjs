// Landing-owned build input, not a runtime import from the theme's source repository.
// Refresh data/theme.json and styles/theme.css together with the core's pnpm build.
// Glyph outlines: JetBrains Mono 2.304 Bold, SIL OFL 1.1; see public/fonts/OFL-JetBrainsMono.txt.
import snapshot from "../../data/theme.json" with { type: "json" };

if (snapshot.schemaVersion !== 1 || snapshot.minimumContrast !== 4.5) throw new Error("Unsupported landing theme snapshot");
for (const f of snapshot.flavors) {
  for (const role of snapshot.textRoles) {
    const ratio = f.contrastToBase[f.roles[role]];
    if (!Number.isFinite(ratio) || ratio < snapshot.minimumContrast) throw new Error(`Theme snapshot is below WCAG AA: ${f.id}.${role}`);
  }
}

export const flavors = snapshot.flavors.map((f) => ({
  ...f,
  c: (name) => f.colors[name].hex,
  r: (role) => f.colors[f.roles[role]].hex,
  rr: (role) => f.raw[f.roles[role]],
}));
export const ACCENT_ORDER = snapshot.accentOrder;
export const ANSI_ORDER = snapshot.ansiOrder;
export const NEUTRAL_ORDER = snapshot.neutralOrder;
export const TEXT_ROLES = snapshot.textRoles;
export const SLOGAN = snapshot.slogan;
export const GLYPHS = snapshot.glyphs;
export const documentationAnchors = snapshot.documentationAnchors;
