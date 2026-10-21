// One cacheable search asset, generated from metadata only; never send every port's documentation to a visitor.
import { createHash } from "node:crypto";
import { groups, keys, slug } from "./data.mjs";
import { portIcon } from "./icons.mjs";

export const finderPayload = JSON.stringify({
  schemaVersion: 1,
  groups: groups.map((group) => ({
    id: slug(group.title), title: group.title,
    ports: group.ports.map((port) => ({ id: port.id, name: port.name, keys: keys(port), icon: portIcon(port) })),
  })),
});
export const finderHash = createHash("sha256").update(finderPayload).digest("hex");
export const finderUrl = `/port-finder/${finderHash}.json`;
