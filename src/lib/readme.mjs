// Repository README content is untrusted data, never MDX or executable HTML.
import { Lexer, Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { codeBlock } from "./markdown.mjs";
import { flavors } from "./theme.mjs";
import { hasFlavorExample, selectGuideFlavor } from "./guide-flavors.mjs";

const PORT_FLAVORS = flavors.map((flavor) => flavor.id);

const anchor = (s) => s.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
const attributes = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
function parseReadme(source, headings = new Map(), namespace = "readme") {
  const parser = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) { return codeBlock(text, (lang ?? "").split(/\s/)[0]); },
      heading({ tokens, depth, text }) {
        const level = Math.min(depth + 1, 6);
        const slug = anchor(text);
        const count = headings.get(slug) ?? 0;
        headings.set(slug, count + 1);
        return `<h${level} id="${namespace}-${slug}${count ? `-${count}` : ""}">${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
    },
  });
  return typeof source === "string" ? parser.parse(source) : parser.parser(source);
}

/** Match repository-relative links to captures already supplied in the snapshot. */
function relativeImagePath(href) {
  if (!href || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(href)) return null;
  try { return decodeURIComponent(href.replace(/^\.\//, "").split(/[?#]/)[0]); } catch { return null; }
}

/** The landing is an installation guide, not a second copy of the GitHub repository page. */
export function renderPortGuide(source, context) {
  if (context.flavor && !PORT_FLAVORS.includes(context.flavor)) throw new Error("Invalid guide flavor");
  const installation = typeof source === "string" ? source : source?.installation ?? "";
  const selected = context.flavor && hasFlavorExample(installation) ? context.flavor : null;
  const select = (tokens, key) => selected && key !== "compatibility" ? selectGuideFlavor(tokens, selected) : tokens;
  if (typeof source !== "string") {
    if (source?.schemaVersion !== 1 || !["installation", "configuration", "compatibility"].every((key) => typeof source[key] === "string") || !source.links || typeof source.links !== "object" || Array.isArray(source.links)) throw new Error("Unsupported published guide schema");
    for (const link of Object.values(source.links)) if (!link || typeof link.href !== "string" || typeof link.title !== "string") throw new Error("Invalid published guide reference");
    const headings = new Map();
    return Object.fromEntries(["installation", "configuration", "compatibility"].map((key) => {
      const lexer = new Lexer({ gfm: true });
      lexer.tokens.links = Object.assign(Object.create(null), source.links);
      const tokens = lexer.lex(source[key]);
      return [key, renderContent(select(tokens, key), context, { headings, pinAnchors: true }).trim()];
    }));
  }
  // Read compatibility for the existing catalog; new discovery publishes the versioned guide directly.
  const tokens = new Marked({ gfm: true }).lexer(source);
  const sections = new Map(["installation", "configuration", "compatibility"].map((key) => [key, []]));
  let current;
  for (const token of tokens) {
    if (token.type === "heading" && token.depth <= 2) {
      current = token.depth === 2 ? sections.get(token.text.toLowerCase()) : undefined;
    } else if (current) current.push(token);
  }
  const headings = new Map();
  return Object.fromEntries([...sections].map(([key, content]) => {
    // Keep reference-style links, even when their definitions live in an omitted section.
    content.links = tokens.links;
    return [key, renderContent(select(content, key), context, { headings, pinAnchors: true }).trim()];
  }));
}

export function renderReadme(source, context) {
  return renderContent(source, context);
}

function renderContent(source, { repository, revision, images = {}, flavor }, { headings, pinAnchors = false } = {}) {
  const root = `${repository}/blob/${revision}/`;
  const hrefFor = (href) => {
    if (!href) return undefined;
    if (href.startsWith("#")) {
      const target = href.slice(1).replace(/^user-content-/, "");
      // A shortened guide may omit the target section; the pinned README always has the original anchors.
      return pinAnchors ? `${root}README.md#${target}` : `#readme-${target}`;
    }
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
  return sanitizeHtml(parseReadme(source, headings, flavor ? `readme-${flavor}` : "readme"), {
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
