import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Exercise the shape builder with a simple filled raster in place of browser canvas drawing.
// This checks the spare-glyph budget and ripple settings, not SVG rasterization.
test("the spiral uses the standard app-icon glyph budget and shared interactions", () => {
  const module = new URL("../src/scripts/living/shapes.ts", import.meta.url).href;
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import { portSpiral } from ${JSON.stringify(module)};
    const ctx = {
      canvas: {}, save() {}, restore() {}, translate() {}, scale() {}, fill() {},
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 300; y < 400; y++) for (let x = 300; x < 600; x++) data[(y * w + x) * 4 + 3] = 255;
        return { data };
      },
    };
    globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
    const shape = portSpiral([], [], 6400);
    const spare = [...shape.alpha].filter(a => a > 0 && a < 0.2).length;
    console.log(JSON.stringify({ spare, sizePx: shape.sizePx ?? null, flat: !!shape.flat, calm: !!shape.calm }));
  `], { encoding: "utf8" }));
  assert.ok(result.spare >= 4900, "the standard 1500-glyph icon budget leaves the rest as visible dust");
  assert.equal(result.sizePx, null, "glyph sizing comes from the shared outline sampler");
  assert.equal(result.flat, false, "use the same rendering as the existing app icons");
  assert.equal(result.calm, false, "the shared pointer interaction stays enabled");
});
