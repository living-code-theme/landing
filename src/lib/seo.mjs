// Only canonical HTML routes belong in search discovery, never the 404 or immutable JSON fragments.
import { ORG, flavors, ports, short } from "./data.mjs";

export const indexablePaths = ["/", "/ports/", ...flavors.map((f) => `/flavors/${f.id}/`), ...ports.map((p) => `/ports/${p.id}/`)];

export const homeSeo = {
  title: "Living Code | Color themes for editors & terminals",
  description: `Free, open-source color themes for editors, terminals and the web. Explore ${ports.length} app integrations, four dark and light flavors, and installation guides.`,
};
export const portsSeo = {
  title: "Themes & installation guides | Living Code",
  description: `Find the Living Code theme for your editor, terminal or app. Browse ${ports.length} integrations with installation guides, supported flavors and theme files.`,
};

// Website copy stays separate from the immutable, repository-owned snapshots. Preserve a port's specific
// features, but replace discovery boilerplate that says more about the publication pipeline than the theme.
/** @param {import('./types').PortIndex} port */
export function portSeo(port) {
  const names = flavors.filter((f) => port.flavors.includes(f.id)).map(short).join(", ");
  const description = port.description.includes("Repository-owned theme files, installation instructions")
    ? `Install the Living Code theme for ${port.name}. ${names} color schemes with a shared slate palette and app-specific setup instructions.`
    : port.description.startsWith("Living Code for ")
      ? port.description.replace("Living Code for ", "Living Code theme for ")
      : `Living Code theme for ${port.name}. ${port.description}`;
  return { title: `Living Code for ${port.name} | Theme & install`, description };
}

/** @param {import('./types').ThemeFlavor} flavor */
export function flavorSeo(flavor) {
  return {
    title: `${flavor.name} | ${flavor.light ? "Light" : "Dark"} color theme`,
    description: `${flavor.name}: a ${flavor.light ? "light" : "dark"} color theme for editors and terminals. Preview its palette, syntax colors, ANSI colors and measured WCAG AA text contrast.`,
  };
}

/** @typedef {{ name: string, path: string }} Breadcrumb */
/** @param {{ url: URL, title: string, description: string, breadcrumbs?: Breadcrumb[], pageType?: string, mainEntity?: Record<string, unknown> }} options */
export function pageStructuredData({ url, title, description, breadcrumbs = [], pageType = "WebPage", mainEntity }) {
  const website = new URL("/#website", url).href;
  const breadcrumbId = `${url.href}#breadcrumb`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...(url.pathname === "/" ? [{
        "@type": "WebSite", "@id": website, name: "Living Code", url: new URL("/", url).href,
        description, inLanguage: "en", sameAs: [ORG],
      }] : []),
      {
        "@type": pageType, "@id": `${url.href}#webpage`, url: url.href, name: title, description,
        inLanguage: "en", isPartOf: { "@id": website },
        ...(breadcrumbs.length ? { breadcrumb: { "@id": breadcrumbId } } : {}),
        ...(mainEntity ? { mainEntity } : {}),
      },
      ...(breadcrumbs.length ? [{
        "@type": "BreadcrumbList", "@id": breadcrumbId,
        itemListElement: breadcrumbs.map((crumb, i) => ({
          "@type": "ListItem", position: i + 1, name: crumb.name, item: new URL(crumb.path, url).href,
        })),
      }] : []),
    ],
  };
}
