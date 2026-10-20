import assert from "node:assert/strict";
import test from "node:test";
import { pickShowcasePorts, showcaseToken, SHOWCASE_TOKEN_KEY, SHOWCASE_ROTATION_MS } from "../src/scripts/showcase-selection.ts";
import { APPS, ports, shotsOf } from "../src/lib/data.mjs";

test("every port with real captures is eligible", () => {
  assert.deepEqual(APPS.map((app) => app.port).sort(), ports.filter((port) => shotsOf(port.id).length).map((port) => port.id).sort());
});

test("selection is stable, distinct, limited to five, and varies by token", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `port-${i}`);
  const picked = pickShowcasePorts(ids, "browser-a");
  assert.equal(picked.length, 5);
  assert.equal(new Set(picked).size, 5);
  assert.ok(picked.every((id) => ids.includes(id)));
  assert.deepEqual(pickShowcasePorts([...ids].reverse(), "browser-a"), picked);
  assert.notDeepEqual(pickShowcasePorts(ids, "browser-b"), picked);
  assert.deepEqual(pickShowcasePorts(["a", "a", "b"], "small").sort(), ["a", "b"]);
  assert.deepEqual(pickShowcasePorts([], "empty"), []);
});

test("browser token persists, rotates weekly, and tolerates broken storage", (t) => {
  let stored;
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key) { assert.equal(key, SHOWCASE_TOKEN_KEY); return stored ?? null; },
    setItem(key, value) { assert.equal(key, SHOWCASE_TOKEN_KEY); stored = value; },
  } });
  t.after(() => original ? Object.defineProperty(globalThis, "localStorage", original) : delete globalThis.localStorage);
  const now = 1800000000000;
  const first = showcaseToken(now);
  assert.match(first, /^[a-f0-9]{32}$/);
  assert.equal(showcaseToken(now + SHOWCASE_ROTATION_MS - 1), first);
  assert.notEqual(showcaseToken(now + SHOWCASE_ROTATION_MS), first);
  stored = "bad json";
  assert.doesNotThrow(() => showcaseToken(now));
  stored = JSON.stringify({ token: "invalid", created: now });
  assert.match(showcaseToken(now), /^[a-f0-9]{32}$/);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  const fallback = showcaseToken(now);
  assert.equal(showcaseToken(now + 1), fallback);
});
