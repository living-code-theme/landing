// Renders the Markdown subset used by each port's `install` text (scripts/ports/*): paragraphs, fenced code,
// ordered and unordered lists, inline code, bold, italic and links. Code blocks go through the site's highlighter.
import { escapeHtml, highlight } from "./highlight.mjs";

const REPO = "https://github.com/ElliotLuque/living-code";

// `#port-id` links point at that port's page; repo-relative links point at GitHub.
export const linkTarget = (href, portIds) => {
  if (href.startsWith("#")) return portIds.has(href.slice(1)) ? `/ports/${href.slice(1)}/` : `${REPO}${href}`;
  if (/^[a-z]+:/i.test(href)) return href;
  return `${REPO}/tree/main/${href.replace(/^\.?\//, "")}`;
};

const emphasis = (s) => s
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[\s(→])\*([^*\s][^*]*?)\*(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");

export function inline(text, portIds = new Set()) {
  // Code spans and links are set aside first so their contents are neither escaped twice nor emphasized.
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  const restore = (s) => s.replace(/\u0000(\d+)\u0000/g, (_, n) => restore(held[n]));
  let s = text.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
    hold(`<a href="${escapeHtml(linkTarget(href, portIds))}">${emphasis(escapeHtml(label))}</a>`));
  return restore(emphasis(escapeHtml(s)));
}

// A highlighted code block with a copy button; `data-copy` holds the raw text for the copy script.
export const codeBlock = (code, lang) =>
  `<div class="snippet" data-ui><pre><code data-lang="${escapeHtml(lang || "text")}">${highlight(code, lang)}</code></pre>` +
  `<button class="copy" type="button" data-copy="${escapeHtml(code)}">Copy</button></div>`;

export function markdown(src, portIds = new Set()) {
  const out = [];
  const lines = src.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(codeBlock(body.join("\n"), fence[1]));
    } else if (/^\s*$/.test(line)) {
      i++;
    } else if (/^(\d+\.|[-*]) /.test(line)) {
      const ordered = /^\d+\./.test(line), items = [];
      for (; i < lines.length && /^(\d+\.|[-*]) /.test(lines[i]); i++) items.push(lines[i].replace(/^(\d+\.|[-*]) /, ""));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t, portIds)}</li>`).join("")}</${tag}>`);
    } else {
      const para = [];
      for (; i < lines.length && !/^\s*$/.test(lines[i]) && !/^```/.test(lines[i]) && !/^(\d+\.|[-*]) /.test(lines[i]); i++) para.push(lines[i].trim());
      out.push(`<p>${inline(para.join(" "), portIds)}</p>`);
    }
  }
  return out.join("\n");
}
