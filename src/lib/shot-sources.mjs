// Build-only lookup. Normal builds never fetch images; `pnpm images:prepare` (run by CI and `pnpm deploy` before
// every build) creates these immutable local variants and fails if any capture cannot be prepared.
import manifest from "../../data/image-variants.json" with { type: "json" };

let warned = false;

export function shotSources(shot, thumbnail = false) {
  const key = /\/([a-f0-9]{64})\.webp$/.exec(shot.src)?.[1];
  const prepared = manifest.schemaVersion === 1 ? manifest.images[key] : undefined;
  if (!prepared || prepared.width !== shot.width || prepared.height !== shot.height) {
    // Unprepared inputs (an isolated local-port preview or core's synthetic scale fixture) stay buildable offline
    // with one truthful source. Never advertise widths that do not exist.
    if (!warned) {
      warned = true;
      console.warn("[images] Some screenshots have no prepared variants and use their originals. Run pnpm images:prepare before publishing.");
    }
    return { src: shot.src, srcset: `${shot.src} ${shot.width}w` };
  }
  const variants = thumbnail ? prepared.variants.filter((image) => image.width <= 480) : [...prepared.variants, shot];
  // Tiny source captures do not need resizing.
  if (!variants.length) variants.push(shot);
  const fallback = thumbnail ? variants.at(-1) : variants.find((image) => image.width >= 960) ?? variants.at(-1);
  return { src: fallback.src, srcset: variants.map((image) => `${image.src} ${image.width}w`).join(", ") };
}
