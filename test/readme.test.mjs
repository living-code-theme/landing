import assert from "node:assert/strict";
import test from "node:test";
import { readmeImagePaths, renderReadme } from "../src/lib/readme.mjs";

const context = {
  repository: "https://github.com/living-code-theme/nvim", revision: "a".repeat(40),
  images: { "images/night.png": { src: "/port-images/night.webp", width: 1600, height: 1000 } },
};

test("README renders GFM headings, lists, tables, details and highlighted copyable snippets", () => {
  const html = renderReadme('# Neovim\n\n## Install\n\n- Night\n- Paper\n\n| Flavor | Light |\n|---|---|\n| Paper | yes |\n\n```lua\nrequire("living-code").setup()\n```\n\n<details><summary>More</summary>Notes</details>', context);
  assert.match(html, /<h2 id="readme-neovim">Neovim<\/h2>/);
  assert.match(html, /<h3 id="readme-install">Install<\/h3>/);
  assert.match(html, /<table>/);
  assert.match(html, /<li>Night<\/li>/);
  assert.match(html, /<details><summary>More<\/summary>/);
  assert.match(html, /data-copy="require\(&quot;living-code&quot;\)\.setup\(\)"/);
});

test("README image and file links resolve to local captures and pinned repository files", () => {
  const html = renderReadme('![Night](./images/night.png)\n\n[Source](lua/living-code/init.lua) [Install](#install) [Mail](mailto:test@example.com)', context);
  assert.match(html, /src="\/port-images\/night.webp"/);
  assert.match(html, /alt="Night"/);
  assert.match(html, /width="1600" height="1000"/);
  assert.match(html, /loading="lazy"/);
  assert.ok(html.includes(`${context.repository}/blob/${context.revision}/lua/living-code/init.lua`));
  assert.match(html, /href="#readme-install"/);
  assert.match(html, /href="mailto:test@example.com"/);
});

test("README sanitizes scripts, unsafe URL schemes, forms, event handlers, inline styling and MDX", () => {
  const html = renderReadme('<script>globalThis.pwned = true</script>\n<img src="javascript:alert(1)" onerror="alert(1)">\n<img src="data:image/svg+xml,bad">\n<a href="javascript:alert(1)">Bad</a>\n<a href="//evil.example">Protocol relative</a>\n<form action="https://evil.example"><input autofocus></form>\n<div style="position:fixed" onclick="alert(1)">Text</div>\n\n[Bad](javascript:alert%281%29)\n\n<Component run={process.exit()} />', context);
  assert.doesNotMatch(html, /<script|pwned|javascript:|data:image|onerror|onclick|style=|<form|<input|<Component|href="\/\//i);
  assert.match(html, /Bad/);
});

test("README raw HTML image references use the same safe local mapping", () => {
  const source = '<img src="images/night.png" alt="Night" onerror="alert(1)">\n\n![Second](images/second%20shot.png)\n![Badge](https://example.com/badge.svg)\n![Unsafe](data:image/png,bad)';
  assert.deepEqual(readmeImagePaths(source), ["images/night.png", "images/second shot.png"]);
  const html = renderReadme(source, context);
  assert.match(html, /src="\/port-images\/night.webp"/);
  assert.match(html, /src="https:\/\/example.com\/badge.svg"/);
  assert.doesNotMatch(html, /second%20shot|data:image|onerror/);
});

test("README repeated headings get stable, unique local anchors", () => {
  const html = renderReadme("# Install\n\n# Install\n\n[Second](#install-1)", context);
  assert.match(html, /id="readme-install"/);
  assert.match(html, /id="readme-install-1"/);
  assert.match(html, /href="#readme-install-1"/);
});

test("README headings and raw heading IDs cannot collide with the landing's controls", () => {
  const html = renderReadme('<h1 id="main">Title</h1>\n<h2 id="port-finder">Details</h2>', context);
  assert.match(html, /<h2 id="readme-main">/);
  assert.match(html, /id="readme-port-finder"/);
  assert.doesNotMatch(html, /id="(?:main|port-finder)"|<h1/);
});
