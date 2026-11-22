// Only canonical HTML routes belong in search discovery, never the 404 or immutable JSON fragments.
import { flavors, ports } from "./data.mjs";

export const indexablePaths = ["/", "/ports/", ...flavors.map((f) => `/flavors/${f.id}/`), ...ports.map((p) => `/ports/${p.id}/`)];
