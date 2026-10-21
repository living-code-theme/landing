import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderPortGuide } from "../src/lib/readme.mjs";
import { ports } from "../src/lib/ports.mjs";

const manifest = {
  schemaVersion: 1, name: "Neovim", slug: "neovim", group: "Editors", emoji: "📝",
  flavors: ["night", "paper"],
  images: ["night", "paper"].map((flavor) => ({ flavor, path: `images/${flavor}.png`, alt: `Neovim in ${flavor}` })),
};
const context = {
  repository: "https://github.com/living-code-theme/nvim", revision: "a".repeat(40),
  images: Object.fromEntries(manifest.images.map((image) => [image.path, { src: `/port-images/${image.flavor}.webp`, width: 1600, height: 1000 }])),
};
const prose = {
  installation: 'Install with your plugin manager.\n\n```lua\n{ "living-code-theme/nvim" }\n```',
  configuration: '```lua\nrequire("living-code").setup({ transparent = true })\n```',
  compatibility: "Requires Neovim and true color.",
  flavorUsage: Object.fromEntries(manifest.flavors.map((flavor) => [flavor, `Activate this flavor:\n\n\`\`\`vim\n:colorscheme living-code-${flavor}\n\`\`\``])),
};

// A committed port README is the input contract; these tests do not scaffold repositories.
const fixture = readFileSync(new URL("./fixtures/port-readme.md", import.meta.url), "utf8");
const readme = (overrides = {}) => {
  let source = fixture;
  for (const [section, content] of Object.entries(overrides)) {
    if (section === "flavorUsage") {
      for (const [flavor, usage] of Object.entries(content)) source = source.replace(prose.flavorUsage[flavor], usage);
    } else source = source.replace(prose[section], content);
  }
  return source;
};

test("the landing guide keeps installation and optional setup, not GitHub's surrounding README", () => {
  const source = readme().replace("## Contributing\n\n", "## Contributing\n\n```sh\ngithub-only-command\n```\n\n");
  const guide = renderPortGuide(source, context);
  assert.deepEqual(Object.keys(guide), ["installation", "configuration", "compatibility"]);
  assert.match(guide.installation, /Install with your plugin manager/);
  assert.match(guide.installation, /data-copy="\{ &quot;living-code-theme\/nvim&quot; \}"/);
  assert.doesNotMatch(guide.installation, /<h[1-3]|<table|<img|Living Code for Neovim/);
  assert.match(guide.configuration, /data-copy="require\(&quot;living-code&quot;\)\.setup/);
  assert.match(guide.compatibility, /Requires Neovim and true color/);
  assert.doesNotMatch(Object.values(guide).join(""), /Contributing|License|One chameleon|full-size preview|github-only-command/);
});

test("the guide omits the README flavor dropdowns and their duplicate previews", () => {
  const guide = renderPortGuide(readme(), context);
  assert.doesNotMatch(Object.values(guide).join(""), /data-lc-flavor|colorscheme living-code-|<img|<table/);
});

test("guide extraction understands Markdown, including fenced headings and reference links outside the guide", () => {
  const source = readme({ installation: "```sh\n## License\nnot a section heading\n```\n\n[Options][options] · [Contributing](#contributing)" })
    + '\n[options]: docs/options.md "All options"\n';
  const guide = renderPortGuide(source, context);
  assert.match(guide.installation, /## License\nnot a section heading/);
  assert.ok(guide.installation.includes(`${context.repository}/blob/${context.revision}/docs/options.md`));
  assert.ok(guide.installation.includes(`${context.repository}/blob/${context.revision}/README.md#contributing`));
  assert.match(guide.installation, /title="All options"/);
  assert.ok(guide.configuration);
  assert.ok(guide.compatibility);
});

test("guide fragments keep unique namespaced heading IDs across sections", () => {
  const guide = renderPortGuide(readme({
    installation: "### Notes\n\nInstall first.", configuration: "### Notes\n\nConfigure next.", compatibility: "### Notes\n\nCheck your version.",
  }), context);
  const ids = [...Object.values(guide).join("").matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["readme-notes", "readme-notes-1", "readme-notes-2"]);
});

test("the guide uses the same sanitization and pinned links as full README rendering", () => {
  const guide = renderPortGuide(readme({
    installation: '<script>globalThis.pwned = true</script>\n\n[Unsafe](javascript:alert%281%29) [Plugin](lua/living-code/init.lua)\n\n<img src="images/night.png" onerror="alert(1)">',
    flavorUsage: { night: '<img src="https://example.com/duplicate.png">\n\nActivate Night.', paper: "Activate Paper." },
  }), context);
  const html = Object.values(guide).join("");
  assert.doesNotMatch(html, /<script|pwned|javascript:|onerror|example.com\/duplicate/);
  assert.ok(guide.installation.includes(`${context.repository}/blob/${context.revision}/lua/living-code/init.lua`));
  assert.match(guide.installation, /src="\/port-images\/night.webp"/, "useful installation images are not removed");
});

test("the published Markdown contract renders identically without inspecting GitHub's README layout", () => {
  const published = { schemaVersion: 1,
    installation: '### Notes\n\n[Settings][settings]\n\n```sh\n## Not a heading\n```',
    configuration: '### Notes\n\n![Capture][capture]\n\n<script>pwned()</script>', compatibility: "Supported.",
    links: { settings: { href: "docs/options.md", title: "All options" }, capture: { href: "images/night.png", title: "Capture" } },
  };
  const authored = `# Port\n\n## Installation\n\n${published.installation}\n\n## Configuration\n\n${published.configuration}\n\n## Compatibility\n\n${published.compatibility}\n\n## License\n\n[settings]: docs/options.md "All options"\n[capture]: images/night.png "Capture"\n`;
  const html = renderPortGuide(published, context);
  assert.deepEqual(html, renderPortGuide(authored, context));
  assert.match(html.installation, /docs\/options.md/);
  assert.match(html.configuration, /src="\/port-images\/night.webp"/);
  assert.doesNotMatch(Object.values(html).join(""), /pwned|<script/);
  assert.throws(() => renderPortGuide({ ...published, schemaVersion: 2 }, context), /Unsupported published guide/);
});

test("empty optional sections do not produce empty controls", () => {
  assert.deepEqual(renderPortGuide("# A port\n\n## Installation\n\nInstall it.\n\n## Configuration\n\n## Constructor\n\nIgnored.\n\n## __proto__\n\nIgnored.\n\n## License\n\nMIT", context), {
    installation: "<p>Install it.</p>", configuration: "", compatibility: "",
  });
});

test("repository-backed port pages show a compact guide and an accessible icon-only repository link", () => {
  for (const port of ports.filter((port) => port.repository)) {
    const page = readFileSync(new URL(`../dist/ports/${port.id}/index.html`, import.meta.url), "utf8");
    const main = page.match(/<main id="main">([\s\S]*?)<\/main>/)[1];
    assert.match(main, /id="install-h">Install<\/h2>/);
    const link = main.match(/<a\b[^>]*data-port-repository[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.ok(link, `${port.id}: GitHub link`);
    assert.ok(link.includes(`href="${port.repository}"`), `${port.id}: links to the repository, not the README`);
    assert.match(link, /aria-label="[^"]+ repository on GitHub"/);
    assert.match(link, /<svg[^>]*aria-hidden="true"/);
    assert.equal(link.replace(/<[^>]*>/g, "").trim(), "", `${port.id}: icon only`);
    assert.doesNotMatch(main, /Read the original README|Choose a flavor|data-lc-flavor|id="readme-(?:previews|contributing|license)"/);
    const metadata = main.match(/<dl\b[^>]*>[\s\S]*?<\/dl>/)?.[0];
    assert.ok(metadata?.includes(link), `${port.id}: GitHub is in the metadata row`);
    assert.match(metadata, /<dt>Source<\/dt>/);
    for (const flavor of port.flavors) {
      assert.ok(metadata.includes(`data-set-flavor="${flavor}"`), `${port.id}: flavor buttons remain available`);
    }
    const controls = [...main.matchAll(/<details\b[^>]*class="port-option"[^>]*>/g)].map((match) => match[0]);
    assert.ok(controls.length, `${port.id}: secondary instructions are still available`);
    assert.ok(controls.every((tag) => !/\sopen(?:[\s=>]|$)/.test(tag)), `${port.id}: secondary details start collapsed`);
  }
});
