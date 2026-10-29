import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { APPS, ports } from "../src/lib/data.mjs";
import { portIcon } from "../src/lib/icons.mjs";

test("all captured ports remain eligible in an immutable manifest, with only selected preview fragments fetched", () => {
  const root = new URL("../dist/app-previews/", import.meta.url);
  const files = readdirSync(root);
  const manifest = files.map((name) => JSON.parse(readFileSync(new URL(name, root), "utf8"))).find((value) => Array.isArray(value.ports));
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.ports.map((p) => p.id), APPS.map((p) => p.port));
  assert.equal(files.length, APPS.length + 1);
  for (const entry of manifest.ports) {
    assert.match(entry.url, /^\/app-previews\/[a-f0-9]{64}\.json$/);
    const bytes = readFileSync(new URL(entry.url.slice(14), root), "utf8");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.url.split("/").at(-1).replace(".json", ""));
    const payload = JSON.parse(bytes);
    assert.equal(payload.schemaVersion, 1); assert.equal(payload.id, entry.id);
    assert.ok(payload.html.includes(`data-app-tab="${entry.id}"`));
    assert.ok(payload.html.includes(`data-app-panel="${entry.id}"`));
    assert.ok(payload.html.includes(`href="/ports/${entry.id}/"`));
    assert.doesNotMatch(payload.html, /<script\b|<iframe\b|\sonerror=/);
    const icon = portIcon(ports.find((port) => port.id === entry.id));
    if (icon.path) {
      assert.equal([...payload.html.matchAll(/data-port-icon/g)].length, 2, `${entry.id}: real icons in the tab and heading`);
    } else {
      assert.doesNotMatch(payload.html, /data-port-icon/, `${entry.id}: no cramped, duplicate wordmark next to the app name`);
      assert.match(payload.html, /app-showcase__tab-label/);
      assert.match(payload.html, /app-showcase__app-name/);
    }
  }
});
