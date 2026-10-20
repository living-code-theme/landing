// Scaffold once; the resulting README belongs to the port repository, never to a mirror.
// Built-ins only: core's one-time exporters do not need landing dependencies installed.
import { readFileSync } from "node:fs";

export const README_MARKER = "<!-- living-code-readme:1 -->";
export const README_SECTIONS = ["Previews", "Installation", "Flavors", "Configuration", "Compatibility", "Contributing", "License"];
export const FLAVOR_LABELS = {
  night: { name: "Night", description: "Dark · full palette" },
  frost: { name: "Frost", description: "Dark · softer chroma" },
  paper: { name: "Paper", description: "Light · near-white slate" },
  signal: { name: "Signal", description: "Dark · teal accent" },
};
export const PORT_FLAVORS = Object.keys(FLAVOR_LABELS);
const html = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const screenshot = (image, width) => `<a href="${html(encodeURI(image.path))}"><img src="${html(encodeURI(image.path))}" alt="${html(image.alt)}" width="${width}"></a>`;

/** All captures are real, repository-owned files; never fabricate missing flavors. */
export function renderPortReadme(manifest, content = {}) {
  const flavors = PORT_FLAVORS.filter((id) => manifest.flavors.includes(id));
  if (!flavors.length || flavors.length !== manifest.flavors.length) throw new Error("README requires unique, known supported flavors");
  const images = new Map(manifest.images.map((image) => [image.flavor, image]));
  if (images.size !== manifest.images.length || [...images.keys()].some((id) => !flavors.includes(id))) throw new Error("README screenshots must match supported flavors");
  const captures = flavors.filter((id) => images.has(id));
  const cells = captures.map((id) => {
    const flavor = FLAVOR_LABELS[id];
    return `<strong>${flavor.name}</strong><br><sub>${flavor.description}</sub><br><br>\n${screenshot(images.get(id), 640)}`;
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    const pair = cells.slice(i, i + 2);
    rows.push(`<tr>\n${pair.map((cell) => `<td width="${pair.length === 1 ? "100%" : "50%"}"${pair.length === 1 ? ' colspan="2"' : ""} valign="top">\n${cell}\n</td>`).join("\n")}\n</tr>`);
  }
  const missing = flavors.filter((id) => !images.has(id));
  const previews = rows.length ? `<table data-lc-flavors>\n${rows.join("\n")}\n</table>\n\nSelect any preview to view the image at full size.` : "Real application screenshots have not been captured yet.";
  const blocks = {
    PORT_EMOJI: manifest.emoji ? html(manifest.emoji) : "{{PORT_EMOJI}}",
    PORT_NAME: html(manifest.name),
    DESCRIPTION: manifest.description ? html(manifest.description) : `A color theme for ${html(manifest.name)}.`,
    PREVIEWS: previews + (missing.length && rows.length ? `\n\n${missing.map((id) => FLAVOR_LABELS[id].name).join(", ")} ${missing.length === 1 ? "is" : "are"} supported; real captures are not available yet.` : ""),
    INSTALLATION: content.installation ?? "{{INSTALLATION}}",
    FLAVORS: flavors.map((id) => `<details data-lc-flavor="${id}">\n<summary><strong>${FLAVOR_LABELS[id].name}</strong> · ${FLAVOR_LABELS[id].description}</summary>\n\n${images.has(id) ? `<p>${screenshot(images.get(id), 1280)}</p>` : "A real application capture is not available yet."}\n\n${content.flavorUsage?.[id] ?? `{{${id.toUpperCase()}_USAGE}}`}\n\n</details>`).join("\n\n"),
    CONFIGURATION: content.configuration ?? "{{CONFIGURATION}}",
    COMPATIBILITY: content.compatibility ?? "{{COMPATIBILITY}}",
    CONTRIBUTING: content.contributing ?? "Report installation issues and include the application version and selected flavor. For visual changes, include a real application screenshot. Keep this README, `port.json` and `images/` in sync; do not add generated mockups.",
  };
  return readFileSync(new URL("../templates/port/README.md", import.meta.url), "utf8").replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => blocks[key] ?? token);
}
