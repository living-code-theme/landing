// Shared by the catalog and glyph artwork: app logos from Simple Icons (CC0), with a local Slack logo
// from its older collection. Where no logo is available, use the app's name or initials in the code face.
import * as simpleIcons from "simple-icons";

const bySlug = new Map(Object.values(simpleIcons).filter((i) => i?.slug).map((i) => [i.slug, i]));

const LOGOS = {
  neovim: "neovim", jetbrains: "jetbrains", zed: "zedindustries", helix: "helix", sublime: "sublimetext",
  ghostty: "ghostty", alacritty: "alacritty", wezterm: "wezterm", iterm2: "iterm2", warp: "warp", konsole: "kde",
  tmux: "tmux", starship: "starship", fish: "fishshell", firefox: "firefoxbrowser", chrome: "googlechrome",
  obsidian: "obsidian", css: "css", tailwind: "tailwindcss", json: "javascript",
};
// Slack's monochrome logo, retained from Simple Icons v13 (CC0):
// https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/slack.svg
const LOCAL_LOGOS = {
  slack: {
    title: "Slack",
    path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  },
};
const WORDS = {
  vscode: "VS", tmtheme: "bat", kitty: "kitty", foot: "foot", "windows-terminal": ">_", fzf: "fzf", btop: "btop",
  lazygit: "lg", delta: "delta", hunk: "hunk", zellij: "zj", yazi: "yazi", k9s: "k9s", eza: "eza",
  "expressive-code": "EC", base16: "b16",
};

// { path, title } for a logo, { text } for lettering.
export function portIcon(p) {
  const logo = LOCAL_LOGOS[p.id] ?? bySlug.get(p.icon ?? LOGOS[p.id] ?? p.id);
  if (logo) return { path: logo.path, title: logo.title };
  return { text: WORDS[p.id] ?? p.name.slice(0, 2) };
}
