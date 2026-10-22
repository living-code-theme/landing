// Adapt single-flavor examples, not the repository snapshot or multi-flavor appearance settings.
// Links, images, raw HTML, and explicit lists of flavors remain authored content.
import { walkTokens } from "marked";

const ids = "night|frost|paper|signal";
const assignment = new RegExp(`\\bflavor\\s*=\\s*["']?(?:${ids})\\b`);
const references = new RegExp(`living-code-(${ids})\\b|Living Code (Night|Frost|Paper|Signal)\\b`, "g");

export function hasFlavorExample(installation) {
  return assignment.test(installation) || /living-code-night\b|Living Code Night\b|palette\.night\b/.test(installation);
}

export function selectGuideFlavor(tokens, flavor) {
  if (!new RegExp(`^(?:${ids})$`).test(flavor)) throw new Error("Invalid guide flavor");
  const name = flavor[0].toUpperCase() + flavor.slice(1);
  for (const block of tokens) {
    const mentioned = new Set([...block.raw.matchAll(references)].map((m) => (m[1] ?? m[2]).toLowerCase()));
    // E.g. Pi's light/dark pair must not become paper/paper. Preserve availability lists too.
    if (mentioned.size > 1 || block.type === "html") continue;
    walkTokens([block], (token) => {
      if (!["code", "codespan", "text"].includes(token.type)) return;
      token.text = token.text
        .replace(/living-code-night\b/g, `living-code-${flavor}`)
        .replace(/Living Code Night\b/g, `Living Code ${name}`)
        .replace(/palette\.night\b/g, `palette.${flavor}`)
        .replace(new RegExp(`(\\bflavor\\s*=\\s*["']?)(?:${ids})\\b`, "g"), `$1${flavor}`);
      // Stylix's explicit appearance must agree with its selected single-flavor scheme.
      if (token.type === "code" && token.lang === "nix" && /stylix\.base16Scheme/.test(token.text)) {
        token.text = token.text.replace(/(stylix\.polarity\s*=\s*")(?:dark|light)(")/, `$1${flavor === "paper" ? "light" : "dark"}$2`);
      }
    });
  }
  return tokens;
}
