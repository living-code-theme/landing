import snapshot from "../../data/ports.json" with { type: "json" };

/** Only repository-owned snapshots are published. Discovery runs in core, never during a site build. */
export function portCatalog(snapshot) {
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.ports)) throw new Error("Unsupported port snapshot schema");
  const ports = snapshot.ports;
  if (new Set(ports.map((p) => p.id)).size !== ports.length) throw new Error("Duplicate slug in port snapshot");
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

export const { ports, groups } = portCatalog(snapshot);
