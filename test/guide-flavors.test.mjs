import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Lexer } from "marked";
import { hasFlavorExample, selectGuideFlavor } from "../src/lib/guide-flavors.mjs";
import { renderPortGuide } from "../src/lib/readme.mjs";
import { ports, readPort, groups } from "../src/lib/ports.mjs";

const flavors = ["night", "frost", "paper", "signal"];
const context = { repository: "https://github.com/living-code-theme/example", revision: "a".repeat(40) };
const guide = (installation, configuration = "") => ({ schemaVersion: 1, installation, configuration, compatibility: "Works with Night and Paper.", links: {} });

test("single-flavor shell commands and activation examples follow the selection, including clipboard payloads", () => {
  const source = guide('```sh\nflavor=night # night, frost, paper, or signal\ncurl -o "living-code-$flavor.json" "https://example.com/living-code-$flavor.json"\n```\n\nSelect **Living Code Night** or set `theme = "living-code-night"`.', '```json\n{"theme":"living-code-night"}\n```');
  for (const flavor of flavors) {
    const rendered = renderPortGuide(source, { ...context, flavor });
    assert.match(rendered.installation, new RegExp(`data-copy="flavor=${flavor} # night, frost, paper, or signal`));
    assert.ok(rendered.installation.includes(`Living Code ${flavor[0].toUpperCase() + flavor.slice(1)}`));
    assert.ok(rendered.installation.includes(`theme = "living-code-${flavor}"`));
    assert.match(rendered.configuration, new RegExp(`data-copy="\\{&quot;theme&quot;:&quot;living-code-${flavor}&quot;\\}"`));
    assert.equal(rendered.compatibility, "<p>Works with Night and Paper.</p>");
  }
  assert.ok(source.installation.includes("flavor=night"), "input document is not modified");
});

test("explicit appearance pairs, flavor lists, links, HTML and images are not rewritten", () => {
  const source = guide('```sh\nflavor=night\n```\n\n`living-code-paper/living-code-night`\n\nAvailable: `living-code-night`, `living-code-frost`, `living-code-paper`, `living-code-signal`.\n\n```conf\ntheme = dark:living-code-night,light:living-code-paper\n```\n\n[Source](living-code-night.json)\n\n![Preview](images/night.png)\n\n<div>living-code-night</div>');
  const rendered = renderPortGuide(source, { ...context, flavor: "paper", images: { "images/night.png": { src: "/images/night.png", width: 2560, height: 1600 } } });
  for (const literal of ["living-code-paper/living-code-night", "Available: <code>living-code-night</code>", "dark:living-code-night,light:living-code-paper", "/living-code-night.json", "/images/night.png", "<div>living-code-night</div>"]) assert.ok(rendered.installation.includes(literal), literal);
  assert.equal(hasFlavorExample("Download the extension with every flavor."), false);
  assert.throws(() => selectGuideFlavor(new Lexer().lex("text"), "invalid"), /Invalid guide flavor/);
});

test("default examples without a flavor variable follow the selection and Stylix polarity agrees", async () => {
  for (const id of ["hunk", "windows-terminal", "wezterm", "base16", "json"]) {
    const p = await readPort(id);
    const rendered = renderPortGuide(p.guide, { ...context, flavor: "paper" });
    const literal = id === "json" ? "palette.paper" : id === "windows-terminal" || id === "wezterm" ? "Living Code Paper" : "living-code-paper";
    assert.ok(rendered.installation.includes(literal), id);
    if (id === "base16") assert.ok(rendered.installation.includes('stylix.polarity = &quot;light&quot;'));
  }
});

test("all catalog download assignments and matching native activation examples agree for every flavor", async () => {
  for (const entry of ports) {
    const p = await readPort(entry);
    for (const flavor of p.flavors) {
      const rendered = renderPortGuide(p.guide, { ...context, flavor });
      if (/\bflavor=night\b/.test(p.guide.installation)) {
        assert.ok(rendered.installation.includes(`data-copy="flavor=${flavor}`), `${p.id}/${flavor}: download`);
      }
      if (p.id === "nushell") {
        assert.ok(rendered.installation.includes(`living-code-${flavor}.nu`));
        assert.ok(rendered.installation.includes(`(living-code-${flavor})`));
      }
      if (p.id === "pi") assert.ok(rendered.configuration.includes("living-code-paper/living-code-night"));
    }
  }
});

test("the site presents AI & Agents second without changing the immutable discovery snapshot", () => {
  assert.deepEqual(groups.slice(0, 2).map((group) => group.title), ["Editors", "AI & Agents"]);
  const page = readFileSync(new URL("../dist/ports/index.html", import.meta.url), "utf8");
  assert.ok(page.indexOf('id="editors"') < page.indexOf('id="ai-agents"'));
  assert.ok(page.indexOf('id="ai-agents"') < page.indexOf('id="terminals"'));
});

test("published install variants keep code and copy payloads together without client-side rewriting", () => {
  const page = readFileSync(new URL("../dist/ports/codex/index.html", import.meta.url), "utf8");
  for (const flavor of flavors) {
    assert.match(page, new RegExp(`data-guide-flavor="${flavor}"[^>]*>[\\s\\S]*?data-copy="flavor=${flavor}`));
  }
  const noOp = readFileSync(new URL("../dist/ports/tailwind/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(noOp, /<div[^>]*data-guide-flavor=/, "identical instructions are not duplicated");
});
