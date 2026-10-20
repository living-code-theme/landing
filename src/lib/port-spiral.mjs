// Shared geometry for the SVG fallback and the glyph field. App marks stay upright along an open spiral.
export const SPIRAL = { width: 900, height: 700 };
export const SPIRAL_IDS = ["neovim", "ghostty", "obsidian", "firefox", "zed", "tailwind", "jetbrains", "chrome", "starship", "sublime", "alacritty"];

export function spiralLayout(icons) {
  return icons.map((icon, i) => {
    const t = i / Math.max(icons.length - 1, 1);
    const angle = -0.6 + t * Math.PI * 2.25;
    const radius = 115 + t * 220;
    return {
      ...icon,
      x: 450 + Math.cos(angle) * radius * 1.08,
      y: 350 - Math.sin(angle) * radius * 0.81,
      size: 58 + t * 28,
      role: ["string", "accent", "type", "number", "function", "builtin"][i % 6],
    };
  });
}
