import legacy from "../../data/legacy-ports.json" with { type: "json" };
import discovered from "../../data/ports.json" with { type: "json" };

/** The snapshot is the landing's interface. No port generator executes during a site build. */
export function portCatalog(fallback, snapshot) {
  if (fallback.schemaVersion !== 1 || snapshot.schemaVersion !== 1) throw new Error("Unsupported port snapshot schema");
  const byId = new Map(snapshot.ports.map((p) => [p.id, p]));
  if (byId.size !== snapshot.ports.length) throw new Error("Duplicate slug in port snapshot");
  const migrated = new Set(snapshot.migratedSlugs);
  const legacyIds = new Set(fallback.ports.map((p) => p.id));
  const ports = [
    ...fallback.ports.flatMap((p) => byId.has(p.id) ? [byId.get(p.id)] : migrated.has(p.id) ? [] : [p]),
    ...snapshot.ports.filter((p) => !legacyIds.has(p.id)),
  ];
  const groups = [];
  const byGroup = new Map();
  for (const port of ports) {
    const key = port.group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let group = byGroup.get(key);
    if (!group) { group = { title: port.group, ports: [] }; byGroup.set(key, group); groups.push(group); }
    group.ports.push(port);
  }
  return { ports, groups };
}

export const { ports, groups } = portCatalog(legacy, discovered);
