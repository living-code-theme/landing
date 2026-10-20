// The sample file the site shows in an editor window: a flavor class that fails the build below AA. The palette
// story recolors it step by step; each flavor's page shows it finished. Diagnostics are virtual text, as in Neovim.
import { highlight } from "./highlight.mjs";

// Written for one flavor: its id, its class name and its ground color.
export const code = (id = "night", ground = [0.13, 0.01, 240]) => `// Fails the build when a text role drops below AA.
import { contrast } from "./color.mjs";

const AA = 4.5;
let checked = 0;

@flavor("${id}")
export class ${id[0].toUpperCase() + id.slice(1)} extends Flavor {
  ground = [${ground.join(", ")}];

  check(role: Role, min = AA) {
    const ratio = contrast(this.colour(role), this.ground);
    if (ratio < min) throw new Error("below AA: " + role);
    checked += 1;
    return true;
  }
}`;

// Diagnostics, when asked for: line, kind, the token to underline, the message.
const DIAG = {
  4: ["hint", "AA", "Used once"],
  12: ["error", "colour", "No property colour"],
  13: ["info", null, "Runs at build time"],
  15: ["warning", "true", "Always true"],
};
const SIGN = { error: "E", warning: "W", info: "I", hint: "H" };

export const sampleHtml = ({ id, ground, diagnostics = false, stagger = false } = {}) => highlight(code(id, ground), "ts")
  .replace('@<span class="t-function">flavor</span>', '<span class="t-decorator">@flavor</span>')
  .split("\n")
  .map((line, i) => {
    const n = i + 1, d = diagnostics ? DIAG[n] : undefined;
    let body = line || " ";
    if (d?.[1]) body = body.replace(new RegExp(`(<span class="t-[\\w-]+)(">${d[1]}</span>)(?![\\s\\S]*">${d[1]}</span>)`), `$1 under under--${d[0]}$2`);
    const sign = d ? `<span class="sign sign--${d[0]}">${SIGN[d[0]]}</span>` : `<span class="sign"> </span>`;
    const virt = d ? `  <span class="vt vt--${d[0]}">${d[2]}</span>` : "";
    return `<span class="ln"${stagger ? ` style="--n:${i}"` : ""}>${diagnostics ? sign : ""}<span class="ln__n" aria-hidden="true">${n}</span>${body}${virt}</span>`;
  })
  .join("");

