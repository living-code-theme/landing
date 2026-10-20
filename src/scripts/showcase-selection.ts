// Anonymous, browser-local rotation. No user-agent fingerprint or server identifier.
export const SHOWCASE_TOKEN_KEY = "lc-showcase-token";
export const SHOWCASE_ROTATION_MS = 7 * 24 * 60 * 60 * 1000;
let memoryToken: { token: string; created: number } | undefined;

export function showcaseToken(now = Date.now()): string {
  let saved = memoryToken;
  try {
    const value = JSON.parse(localStorage.getItem(SHOWCASE_TOKEN_KEY) ?? "null");
    if (value) saved = value;
  } catch { /* Storage can be unavailable or contain invalid JSON. */ }
  if (!saved || !/^[a-f0-9]{32}$/.test(saved.token) || !Number.isFinite(saved.created)
    || saved.created > now || now - saved.created >= SHOWCASE_ROTATION_MS) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    saved = { token: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""), created: now };
  }
  memoryToken = saved;
  try { localStorage.setItem(SHOWCASE_TOKEN_KEY, JSON.stringify(saved)); } catch { /* Keep it stable in memory instead. */ }
  return saved.token;
}

// Seeded Fisher–Yates: the same token and catalog yield the same five distinct ports.
export function pickShowcasePorts(ids: string[], token = showcaseToken()): string[] {
  let seed = 2166136261;
  for (const char of token) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const pool = [...new Set(ids)].sort();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}
