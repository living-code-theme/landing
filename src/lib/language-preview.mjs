// Small, comparable files for the flavor section. Highlighted at build time; CSS role variables do the repainting.
import { escapeHtml, highlight } from "./highlight.mjs";

export const PREVIEWS = [
  {
    id: "typescript", label: "TypeScript", file: "theme.ts", lang: "ts",
    source: `// A quiet ground. Color with a job.
type Theme = { name: string; contrast: number };

export function chooseTheme(light: boolean): Theme {
  const name = light ? "paper" : "night";

  return {
    name,
    contrast: 4.5,
  };
}

const active = chooseTheme(false);
console.log(active.name);`,
  },
  {
    id: "python", label: "Python", file: "theme.py", lang: "python",
    source: `# A quiet ground. Color with a job.
from dataclasses import dataclass

@dataclass
class Theme:
    name: str
    contrast: float = 4.5


def choose_theme(light: bool) -> Theme:
    name = "paper" if light else "night"
    return Theme(name, contrast=4.5)

active = choose_theme(False)
print(active.name)`,
  },
  {
    id: "rust", label: "Rust", file: "theme.rs", lang: "rust",
    source: `// A quiet ground. Color with a job.
struct Theme {
    name: String,
    contrast: f64,
}

fn choose_theme(light: bool) -> Theme {
    let name = if light { "paper" } else { "night" };
    Theme { name: name.to_string(), contrast: 4.5 }
}

fn main() {
    let active = choose_theme(false);
    println!("{}", active.name);
}`,
  },
  {
    id: "html-css", label: "HTML / CSS", file: "theme.html / theme.css", lang: "html-css",
    source: `<main class="workspace" data-theme="night">
  <h1>Color with a job.</h1>
  <p>A quiet ground for your next idea.</p>
  <a href="/ports/">Find your app</a>
</main>

/* The same roles, on the web. */
.workspace {
  background: var(--lc-bg);
  color: var(--lc-fg);
  padding: 24px;
}

.workspace a { color: var(--lc-link); }`,
  },
  {
    id: "diff", label: "Diff", file: "theme.ts · working tree", lang: "diff",
    source: `diff --git a/theme.ts b/theme.ts
--- a/theme.ts
+++ b/theme.ts
@@ -1,7 +1,7 @@
 export const workspace = {
-  name: "default",
-  background: "#181818",
-  foreground: "#cccccc",
+  name: "living-code",
+  background: "var(--lc-bg)",
+  foreground: "var(--lc-fg)",
   contrast: 4.5,
   quiet: true,
 };`,
  },
];

export function previewLines(sample) {
  let html;
  if (sample.lang === "html-css") {
    const split = sample.source.indexOf("\n\n");
    html = highlight(sample.source.slice(0, split), "html") + "\n\n" + highlight(sample.source.slice(split + 2), "css");
  } else if (sample.lang === "diff") {
    return sample.source.split("\n").map((line) => ({
      html: escapeHtml(line),
      kind: line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("@@") ? "meta"
        : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "context",
    }));
  } else html = highlight(sample.source, sample.lang);
  return html.split("\n").map((line) => ({ html: line || " ", kind: "context" }));
}
