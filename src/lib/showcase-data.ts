// Render each preview once. Hash the actual payload, not a guessed list of template dependencies.
import { createHash } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import AppPreview from "../components/AppPreview.astro";
import { APPS } from "./data.mjs";

export const showcaseData = (async () => {
  const container = await AstroContainer.create();
  const assets = new Map<string, string>();
  const add = (body: unknown) => {
    const bytes = JSON.stringify(body), hash = createHash("sha256").update(bytes).digest("hex");
    assets.set(hash, bytes);
    return `/app-previews/${hash}.json`;
  };
  const ports = [];
  for (const app of APPS) {
    const html = await container.renderToString(AppPreview, { props: { app } });
    ports.push({ id: app.port, url: add({ schemaVersion: 1, id: app.port, html }) });
  }
  const indexUrl = add({ schemaVersion: 1, ports });
  return { assets, indexUrl };
})();
