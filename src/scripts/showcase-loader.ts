// Keep every captured port eligible for the existing weekly selection, but fetch only the five chosen previews.
import { pickShowcasePorts } from "./showcase-selection.ts";
const cached = new Map<string, Promise<any>>();
async function asset(url: string) {
  if (!/^\/app-previews\/[a-f0-9]{64}\.json$/.test(url)) throw new Error("Invalid preview asset URL");
  let pending = cached.get(url);
  if (!pending) {
    pending = fetch(url, { credentials: "omit", redirect: "error" }).then(async (response) => {
      if (!response.ok || Number(response.headers.get("content-length")) > 1024 * 1024) throw new Error("Preview asset unavailable");
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error("Preview asset too large");
      return JSON.parse(text);
    });
    if (cached.size >= 32) cached.delete(cached.keys().next().value!);
    cached.set(url, pending); pending.catch(() => cached.delete(url));
  }
  return pending;
}

export async function chosenPreviews(url: string) {
  const catalog = await asset(url);
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.ports) || catalog.ports.length > 1000 || catalog.ports.some((p: any) => typeof p.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id) || typeof p.url !== "string") || new Set(catalog.ports.map((p: any) => p.id)).size !== catalog.ports.length) throw new Error("Unsupported preview catalog");
  const wanted = pickShowcasePorts(catalog.ports.map((p: { id: string }) => p.id));
  // Preserve the original catalog ordering, just as the pre-existing tab filter did.
  return Promise.all(catalog.ports.filter((p: { id: string }) => wanted.includes(p.id)).map(async (p: { id: string; url: string }) => {
    const payload = await asset(p.url);
    if (payload?.schemaVersion !== 1 || payload.id !== p.id || typeof payload.html !== "string") throw new Error("Unsupported preview fragment");
    const parsed = new DOMParser().parseFromString(payload.html, "text/html");
    const tab = parsed.querySelector<HTMLButtonElement>("[data-app-tab]");
    const panel = parsed.querySelector<HTMLElement>("[data-app-panel]");
    if (!tab || !panel || tab.dataset.appTab !== p.id || panel.dataset.appPanel !== p.id || parsed.querySelector("script, iframe, object, embed")) throw new Error("Invalid preview fragment");
    return { tab, panel };
  }));
}
