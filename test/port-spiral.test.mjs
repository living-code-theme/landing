import test from "node:test";
import assert from "node:assert/strict";
import { SPIRAL, SPIRAL_IDS, spiralLayout } from "../src/lib/port-spiral.mjs";
import { portIcon } from "../src/lib/icons.mjs";
import { ports } from "../src/lib/ports.mjs";

const icons = spiralLayout(SPIRAL_IDS.flatMap((id) => {
  const port = ports.find((p) => p.id === id);
  return port ? [{ id, ...portIcon(port) }] : [];
}));

test("the spiral uses real app silhouettes, with no missing or duplicate ports", () => {
  assert.equal(new Set(SPIRAL_IDS).size, SPIRAL_IDS.length);
  for (const icon of icons) assert.match(icon.path, /^[Mm]/, icon.id);
});

test("the spiral fits its frame and leaves each icon and the central mark clear", () => {
  for (const icon of icons) {
    assert.ok(icon.x - icon.size / 2 > 0 && icon.x + icon.size / 2 < SPIRAL.width, icon.id);
    assert.ok(icon.y - icon.size / 2 > 0 && icon.y + icon.size / 2 < SPIRAL.height, icon.id);
    assert.ok(Math.abs(icon.x - 450) > icon.size / 2 + 60 || Math.abs(icon.y - 350) > icon.size / 2 + 24, `${icon.id}: clear of mark`);
    for (const other of icons) {
      if (other === icon) continue;
      const clearance = (icon.size + other.size) / 2 + 12;
      assert.ok(Math.hypot(icon.x - other.x, icon.y - other.y) > clearance, `${icon.id} / ${other.id}`);
    }
  }
});
