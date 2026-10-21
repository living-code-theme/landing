// The native dialog opens immediately; its shared, versioned metadata loads only on demand.
type FinderPort = { id: string; name: string; keys: string; icon: { path?: string; text?: string } };
type FinderGroup = { id: string; title: string; ports: FinderPort[] };
type Catalog = { schemaVersion: 1; groups: FinderGroup[] };
const catalogs = new Map<string, Promise<Catalog>>();
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateFinderCatalog(value: Catalog): Catalog {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.groups) || value.groups.length > 1000) throw new Error("Unsupported finder catalog");
  const ids = new Set<string>(), groups = new Set<string>();
  for (const group of value.groups) {
    if (typeof group.id !== "string" || !/^[a-z0-9-]*$/.test(group.id) || groups.has(group.id) || typeof group.title !== "string" || group.title.length > 200 || !Array.isArray(group.ports)) throw new Error("Invalid finder group");
    groups.add(group.id);
    for (const port of group.ports) {
      if (!slug.test(port.id) || port.id.length > 64 || ids.has(port.id) || typeof port.name !== "string" || port.name.length > 200 || typeof port.keys !== "string" || port.keys.length > 16384 || !port.icon || (typeof port.icon.path !== "string" && typeof port.icon.text !== "string") || (port.icon.path?.length ?? 0) > 65536 || (port.icon.text?.length ?? 0) > 200) throw new Error("Invalid finder port");
      ids.add(port.id);
    }
  }
  if (ids.size > 1000) throw new Error("Finder catalog exceeds 1000 ports");
  return value;
}

async function catalog(url: string) {
  if (!/^\/port-finder\/[a-f0-9]{64}\.json$/.test(url)) throw new Error("Invalid finder asset URL");
  let pending = catalogs.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url, { credentials: "omit", redirect: "error" });
      if (!response.ok || Number(response.headers.get("content-length")) > 2 * 1024 * 1024) throw new Error("Finder asset unavailable");
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) throw new Error("Finder asset too large");
      return validateFinderCatalog(JSON.parse(text));
    })();
    if (catalogs.size >= 3) catalogs.delete(catalogs.keys().next().value!);
    catalogs.set(url, pending);
    pending.catch(() => catalogs.delete(url)); // A later open can retry; failed requests are never cached forever.
  }
  return pending;
}

function results(groups: FinderGroup[], doc: Document) {
  const fragment = doc.createDocumentFragment();
  for (const group of groups) {
    const section = doc.createElement("section");
    section.className = "not-first:mt-6"; section.dataset.portGroup = "";
    section.setAttribute("role", "group"); section.setAttribute("aria-labelledby", `finder-${group.id}`);
    const heading = doc.createElement("h3");
    heading.className = "mb-2 text-sm font-medium text-muted"; heading.id = `finder-${group.id}`;
    heading.setAttribute("aria-hidden", "true"); heading.textContent = group.title;
    const list = doc.createElement("ul"); list.setAttribute("role", "presentation");
    for (const port of group.ports) {
      const row = doc.createElement("li"); row.className = "border-b border-line";
      row.dataset.portKeys = port.keys; row.setAttribute("role", "presentation");
      const link = doc.createElement("a");
      link.className = "port-link flex min-h-14 items-center gap-4 px-3 py-3 font-medium no-underline";
      link.href = `/ports/${port.id}/`; link.id = `finder-port-${port.id}`;
      link.setAttribute("role", "option"); link.setAttribute("aria-selected", "false"); link.tabIndex = -1;
      const icon = doc.createElement("span");
      icon.className = "grid size-6 shrink-0 place-items-center text-muted"; icon.dataset.portIcon = ""; icon.setAttribute("aria-hidden", "true");
      if (port.icon.path) {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "size-6"); svg.setAttribute("focusable", "false");
        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", "currentColor"); path.setAttribute("d", port.icon.path); svg.append(path); icon.append(svg);
      } else {
        const text = doc.createElement("span"); text.className = "font-mono text-[10px] font-semibold";
        text.textContent = port.icon.text!; icon.append(text);
      }
      const name = doc.createElement("span"); name.className = "port-name inline-block min-w-0 [overflow-wrap:anywhere]";
      name.textContent = port.name; link.append(icon, name); row.append(link); list.append(row);
    }
    section.append(heading, list); fragment.append(section);
  }
  return fragment;
}

export async function loadPortFinder(dialog: HTMLDialogElement) {
  if (dialog.dataset.portReady || dialog.dataset.portLoading) return;
  dialog.dataset.portLoading = "true";
  const target = dialog.querySelector<HTMLElement>("#port-finder-results")!;
  const loading = dialog.querySelector<HTMLElement>("[data-port-loading]")!;
  const error = dialog.querySelector<HTMLElement>("[data-port-error]")!;
  loading.hidden = false; error.hidden = true; target.setAttribute("aria-busy", "true");
  try {
    const data = await catalog(dialog.dataset.portCatalog!);
    if (!dialog.isConnected) return;
    target.replaceChildren(results(data.groups, dialog.ownerDocument));
    dialog.dataset.portReady = "true";
    dialog.dispatchEvent(new Event("ports:loaded"));
  } catch {
    if (dialog.isConnected) error.hidden = false;
  } finally {
    loading.hidden = true; target.removeAttribute("aria-busy"); delete dialog.dataset.portLoading;
  }
}
