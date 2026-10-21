// Shared by the catalog, finder and glyph artwork: real app logos rendered in the site's muted color.
// Emoji belong to the source READMEs, not web icons. Use lettering only where no logo is available.
import * as simpleIcons from "simple-icons";
import { portAppIcons } from "./port-app-icons.mjs";

const bySlug = new Map(Object.values(simpleIcons).filter((i) => i?.slug).map((i) => [i.slug, i]));

const LOGOS = {
  neovim: "neovim", jetbrains: "jetbrains", zed: "zedindustries", helix: "helix", sublime: "sublimetext",
  ghostty: "ghostty", alacritty: "alacritty", wezterm: "wezterm", iterm2: "iterm2", warp: "warp", konsole: "kde",
  tmux: "tmux", starship: "starship", fish: "fishshell", firefox: "firefoxbrowser", chrome: "googlechrome",
  obsidian: "obsidian", css: "css", tailwind: "tailwindcss", json: "javascript", tmtheme: "bat",
  delta: "git-delta", // The Simple Icons slug "delta" belongs to Delta Air Lines, not the diff viewer.
};
// Retained Simple Icons paths (CC0), plus upstream app marks normalized to a 24 × 24 monochrome outline.
const LOCAL_LOGOS = {
  ...portAppIcons,
  // https://github.com/kovidgoyal/kitty/blob/master/logo/kitty.svg
  // Keep the cat, paws, whiskers and terminal cutouts; omit the original colored backing rectangle.
  kitty: {
    title: "Kitty",
    path: "M6.79 21.735h10.42a0.707 0.707 0 0 0 0.707-0.707V10.607a0.707 0.707 0 0 0-0.707-0.706H6.79a0.707 0.707 0 0 0-0.707 0.706v10.421a0.707 0.707 0 0 0 0.707 0.707m5.581-3.835h3.744a0.424 0.424 0 0 1 0 0.848H12.371a0.424 0.424 0 0 1 0-0.848m-4.503-4.571a0.424 0.424 0 0 1 0.599-0.599l2.648 2.646a0.424 0.424 0 0 1 0 0.599l-2.648 2.648a0.424 0.424 0 0 1-0.599-0.599l2.348-2.348z M9.608 8.578c0.188 0 0.339-0.357 0.339-0.817 0-0.46-0.15-0.817-0.339-0.817-0.188 0-0.339 0.357-0.338 0.817 0 0.46 0.15 0.817 0.338 0.817 M19.313 2.452c-0.46-0.485-2.553 0.102-3.83 0.894-0.996-0.511-2.196-0.817-3.472-0.817-1.302 0-2.502 0.306-3.497 0.817-1.277-0.791-3.396-1.404-3.83-0.894-0.46 0.511 0.332 2.63 1.277 3.804-0.077 0.306-0.128 0.613-0.128 0.945 0 1.021 0.434 1.966 1.174 2.732h4.213c-0.128-0.255 0.051-0.409 0.817-0.409 0.766 0.026 0.919 0.153 0.817 0.409h4.212c0.74-0.766 1.174-1.736 1.175-2.732 0-0.332-0.051-0.638-0.128-0.945 0.894-1.174 1.659-3.319 1.2-3.804m-9.702 6.74c-0.894 0-1.634-0.74-1.634-1.634s0.74-1.634 1.634-1.633 1.634 0.74 1.634 1.634-0.74 1.634-1.634 1.633m4.8 0c-0.894 0-1.634-0.74-1.634-1.634s0.74-1.634 1.634-1.633 1.634 0.74 1.634 1.634-0.715 1.634-1.634 1.633 M16.851 9.09c1.532-1.915 4.672-2.834 6.765-1.506-2.451-0.383-4.672 0.255-6.765 1.506 M16.749 8.631c0.868-2.042 3.447-3.37 5.514-2.655-2.17 0.281-3.932 1.123-5.514 2.655m-0.026 0.995c1.583-1.506 5.081-2.017 6.153-0.434-2.17-0.689-4.059-0.383-6.153 0.434 M7.149 9.09c-1.532-1.915-4.672-2.834-6.765-1.506 2.451-0.383 4.672 0.255 6.765 1.506 M7.251 8.631c-0.868-2.042-3.447-3.37-5.514-2.655 2.17 0.281 3.932 1.123 5.514 2.655m0.026 0.995c-1.583-1.506-5.081-2.017-6.153-0.434 2.17-0.689 4.059-0.383 6.153 0.434 M5.26 8.12c-0.638 0-1.174 0.332-1.43 0.843h-0.076c-0.689 0-1.277 0.511-1.277 1.149 0 0.894 0.919 1.379 1.762 1.072 0.511 0.74 1.608 0.792 2.017 0 0.613-0.026 1.608-0.128 1.761-1.072 0.102-0.638-0.562-1.149-1.276-1.149h-0.077c-0.204-0.511-0.766-0.843-1.404-0.843m13.48 0c0.638 0 1.174 0.332 1.43 0.843h0.076c0.357 0 1.277 0.511 1.277 1.149 0 0.894-0.919 1.379-1.762 1.072-0.511 0.74-1.608 0.792-2.017 0-0.613-0.026-1.608-0.128-1.761-1.072-0.102-0.638 0.919-1.149 1.276-1.149h0.077c0.204-0.511 0.766-0.843 1.404-0.843 M14.354 8.578c0.188 0 0.339-0.357 0.339-0.817 0-0.46-0.15-0.817-0.339-0.817-0.188 0-0.339 0.357-0.338 0.817 0 0.46 0.15 0.817 0.338 0.817",
  },
  // https://raw.githubusercontent.com/simple-icons/simple-icons/11.15.0/icons/visualstudiocode.svg
  vscode: {
    title: "Visual Studio Code",
    path: "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z",
  },
  // https://raw.githubusercontent.com/simple-icons/simple-icons/11.15.0/icons/windowsterminal.svg
  "windows-terminal": {
    title: "Windows Terminal",
    path: "M8.165 6V3h7.665v3H8.165zm-.5-3H1c-.55 0-1 .45-1 1v2h7.665V3zM23 3h-6.67v3H24V4c0-.55-.45-1-1-1zM0 6.5h24V20c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V6.5zM11.5 18c0 .3.2.5.5.5h8c.3 0 .5-.2.5-.5v-1.5c0-.3-.2-.5-.5-.5h-8c-.3 0-.5.2-.5.5V18zm-5.2-4.55l-3.1 3.1c-.25.25-.25.6 0 .8l.9.9c.25.25.6.25.8 0l4.4-4.4a.52.52 0 0 0 0-.8l-4.4-4.4c-.2-.2-.6-.2-.8 0l-.9.9c-.25.2-.25.55 0 .8l3.1 3.1z",
  },
  // https://github.com/modem-dev/hunk/blob/main/website/public/brand/logo-mark.svg
  // Reverse the inner contour to retain its cutout with the default nonzero fill rule.
  hunk: {
    title: "Hunk",
    path: "M0 .12h24v23.76H0zM1.44 1.32V22.44H11.04V16.92H12.96V22.44H22.56V6.84H11.04V1.32z",
  },
  // https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/slack.svg
  slack: {
    title: "Slack",
    path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  },
};
const WORDS = { lazygit: "lg", delta: "delta", yazi: "yazi", eza: "eza", base16: "b16" };

// { path, title } for a logo, { text } for lettering.
export function portIcon(p) {
  const logo = LOCAL_LOGOS[p.id] ?? bySlug.get(p.icon ?? LOGOS[p.id] ?? p.id);
  if (logo) return { path: logo.path, title: logo.title };
  return { text: WORDS[p.id] ?? p.name.slice(0, 2) };
}
