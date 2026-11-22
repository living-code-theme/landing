import { escapeHtml, highlight } from "./highlight.mjs";

// Shared by the sanitized README renderer: highlighted code with raw text for the copy script.
export const codeBlock = (code, lang) =>
  `<div class="snippet" data-ui><pre tabindex="0" role="region" aria-label="Code sample"><code data-lang="${escapeHtml(lang || "text")}">${highlight(code, lang)}</code></pre>` +
  `<button class="copy" type="button" disabled data-copy="${escapeHtml(code)}">Copy</button></div>`;
