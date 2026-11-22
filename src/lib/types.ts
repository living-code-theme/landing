// Build-time contracts for the versioned, repository-owned snapshots. No client-side catalog is bundled here.
import type theme from "../../data/theme.json";

export type FlavorId = "night" | "frost" | "paper" | "signal";
export type ColorName = keyof (typeof theme.flavors)[number]["colors"];
export type RoleName = keyof (typeof theme.flavors)[number]["roles"];
export type ThemeFlavor = Omit<(typeof theme.flavors)[number], "id" | "roles"> & {
  id: FlavorId;
  roles: Record<RoleName, ColorName>;
};
export type Capture = { src: string; width: number; height: number; flavor: FlavorId; alt?: string };
export type PortIndex = {
  id: string; name: string; group: string; description: string; quick: string;
  repository: string; repositoryName: string; revision: string; readmeUrl: string;
  homepage?: string; aliases?: string[]; icon?: string | null;
  flavors: FlavorId[]; images: Capture[]; content?: string;
};
export type GuideSection = "installation" | "configuration" | "compatibility";
export type PortGuide = Record<GuideSection, string> & {
  schemaVersion: 1; links: Record<string, { href: string; title: string }>;
};
export type PortDocument = PortIndex & {
  guide?: PortGuide; files: string[]; fileUrls: Record<string, string>;
  guideImages?: Record<string, Capture>; readme?: string; readmeImages?: Record<string, Capture>;
};
