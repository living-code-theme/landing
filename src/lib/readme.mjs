// Repository README content is untrusted data, never MDX or executable HTML.
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { codeBlock } from "./markdown.mjs";
import { PORT_FLAVORS, README_MARKER, README_SECTIONS } from "../../scripts/readme-template.mjs";

const anchor = (s) => s.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
const attributes = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
function parseReadme(source) {
  const headings = new Map();
  return new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) { return codeBlock(text, (lang ?? "").split(/\s/)[0]); },
      heading({ tokens, depth, text }) {
        const level = Math.min(depth + 1, 6);
        const slug = anchor(text);
        const count = headings.get(slug) ?? 0;
        headings.set(slug, count + 1);
        return `<h${level} id="readme-${slug}${count ? `-${count}` : ""}">${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
    },
  }).parse(source);
}

/** Only repository-relative images are downloaded; external images are never fetched by the sync job. */
export function relativeImagePath(href) {
  if (!href || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(href)) return null;
  try { return decodeURIComponent(href.replace(/^\.\//, "").split(/[?#]/)[0]); } catch { return null; }
}

export function readmeImagePaths(source) {
  const paths = new Set();
  // Use the same HTML parser as rendering, including Markdown and raw HTML images.
  sanitizeHtml(parseReadme(source), {
    allowedTags: ["img"], allowedAttributes: {},
    transformTags: { img(tagName, attrs) {
      const path = relativeImagePath(attrs.src);
      if (path) paths.add(path);
      return { tagName, attribs: {} };
    } },
  });
  return [...paths];
}

/** The template is shared, but prose and activation instructions stay port-owned. */
export function validateReadmeTemplate(source, manifest) {
  if (!source.trimStart().startsWith(README_MARKER)) throw new Error("README.md must use the Living Code port template v1 (see docs/PORTS.md)");
  const placeholder = source.match(/\{\{(?:INSTALLATION|CONFIGURATION|COMPATIBILITY|PORT_EMOJI|PORT_NAME|DESCRIPTION|PREVIEWS|FLAVORS|(?:NIGHT|FROST|PAPER|SIGNAL)_USAGE)\}\}/);
  if (placeholder) throw new Error(`Complete README.md placeholder ${placeholder[0]} before publishing`);
  const headings = new Marked({ gfm: true }).lexer(source).filter((t) => t.type === "heading");
  if (headings.filter((t) => t.depth === 1).length !== 1 || headings.filter((t) => t.depth === 2).map((t) => t.text).join("\n") !== README_SECTIONS.join("\n")) throw new Error(`README.md sections must be: ${README_SECTIONS.join(", ")}; use ### for additional subsections`);
  if (manifest.emoji && !headings.find((t) => t.depth === 1).text.startsWith(`${manifest.emoji} `)) throw new Error("README.md title must start with the port.json emoji");
  const dropdowns = [];
  const tables = [], details = [];
  const gridPaths = new Set(), flavorPaths = new Map();
  let grids = 0;
  sanitizeHtml(parseReadme(source), {
    allowedTags: ["table", "details", "img"], allowedAttributes: {},
    transformTags: {
      table(tagName, attrs) {
        const grid = "data-lc-flavors" in attrs;
        tables.push(grid);
        if (grid) grids++;
        return { tagName, attribs: {} };
      },
      details(tagName, attrs) {
        const flavor = attrs["data-lc-flavor"];
        details.push(flavor);
        if (flavor) dropdowns.push(flavor);
        return { tagName, attribs: {} };
      },
      img(tagName, attrs) {
        const path = relativeImagePath(attrs.src);
        if (path && tables.includes(true)) gridPaths.add(path);
        const flavor = details.findLast(Boolean);
        if (path && flavor) {
          if (!flavorPaths.has(flavor)) flavorPaths.set(flavor, new Set());
          flavorPaths.get(flavor).add(path);
        }
        return { tagName, attribs: {} };
      },
    },
    exclusiveFilter(frame) {
      if (frame.tag === "table") tables.pop();
      if (frame.tag === "details") details.pop();
      return false;
    },
  });
  const expected = PORT_FLAVORS.filter((id) => manifest.flavors.includes(id));
  if (dropdowns.join(",") !== expected.join(",")) throw new Error("README.md needs one flavor dropdown per supported flavor, in Night, Frost, Paper, Signal order");
  if (manifest.images.length && grids !== 1) throw new Error("README.md needs one comparison grid: <table data-lc-flavors>");
  for (const image of manifest.images) {
    if (!gridPaths.has(image.path)) throw new Error(`README.md comparison grid must include: ${image.path}`);
    if (!flavorPaths.get(image.flavor)?.has(image.path)) throw new Error(`README.md ${image.flavor} dropdown must include: ${image.path}`);
  }
}

export function renderReadme(source, { repository, revision, images = {} }) {
  const root = `${repository}/blob/${revision}/`;
  const hrefFor = (href) => {
    if (!href) return undefined;
    if (href.startsWith("#")) return `#readme-${href.slice(1).replace(/^user-content-/, "")}`;
    const image = images[relativeImagePath(href)];
    if (image?.src) return image.src;
    if (/^(https?:|mailto:)/i.test(href)) return href;
    if (/^(?:[a-z][\w+.-]*:|\/)/i.test(href)) return undefined;
    try { return new URL(href, root).href; } catch { return undefined; }
  };
  const heading = (tagName, attrs) => ({
    tagName: tagName === "h1" ? "h2" : tagName,
    attribs: attrs.id ? { id: attrs.id.startsWith("readme-") ? attrs.id : `readme-${anchor(attrs.id)}` } : {},
  });
  return sanitizeHtml(parseReadme(source), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "details", "summary", "button"],
    allowedAttributes: {
      a: ["href", "title"], img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      div: ["class", "data-ui"], pre: ["class"], code: ["class", "data-lang"], span: ["class"],
      button: ["class", "type", "data-copy"],
      table: ["data-lc-flavors"], td: [{ name: "colspan", values: ["2"] }], details: [{ name: "data-lc-flavor", values: PORT_FLAVORS }],
      h2: ["id"], h3: ["id"], h4: ["id"], h5: ["id"], h6: ["id"],
    },
    allowedClasses: { div: ["snippet"], span: [/^t-[a-z-]+$/], button: ["copy"], pre: [], code: [] },
    allowedSchemes: ["http", "https", "mailto"], allowProtocolRelative: false,
    transformTags: {
      a(tagName, attrs) { return { tagName, attribs: attributes({ href: hrefFor(attrs.href), title: attrs.title }) }; },
      img(tagName, attrs) {
        const path = relativeImagePath(attrs.src);
        const image = path ? images[path] : null;
        const src = image?.src ?? (/^https:\/\//i.test(attrs.src ?? "") ? attrs.src : undefined);
        return { tagName, attribs: attributes({ src, alt: attrs.alt ?? "", title: attrs.title, loading: "lazy", decoding: "async", ...(image ? { width: String(image.width), height: String(image.height) } : {}) }) };
      },
      ...Object.fromEntries(["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => [h, heading])),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
