import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Exercise the real geometry without a browser or GPU; expose motion sampling only inside this test module.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const shapes = moduleUrl(stripTypeScriptTypes(readFileSync(new URL("../src/scripts/living/shapes.ts", import.meta.url), "utf8"))
  .replace('"../../lib/story.mjs"', JSON.stringify(new URL("../src/lib/story.mjs", import.meta.url).href))
  .replace('"../../lib/port-spiral.mjs"', JSON.stringify(new URL("../src/lib/port-spiral.mjs", import.meta.url).href)));
const source = stripTypeScriptTypes(readFileSync(new URL("../src/scripts/living/chameleon.ts", import.meta.url), "utf8"), { mode: "transform" })
  .replace('"./shapes"', JSON.stringify(shapes));
const { turnJump, TURN_CROUCH, TURN_FLIGHT, TURN_TIME, buildChameleon, K } = await import(moduleUrl(`${source}
  export { turnJump, TURN_CROUCH, TURN_FLIGHT, TURN_TIME, buildChameleon, K };
`));
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test("the turn crouches before takeoff and rotates only while airborne", () => {
  const crouch = turnJump(TURN_CROUCH / 2);
  assert.ok(crouch.height < -0.05);
  assert.ok(crouch.load > 1);
  assert.equal(crouch.spin, 0);
  assert.equal(crouch.open, 0);
  assert.equal(crouch.tuck, 0);
  assert.equal(crouch.airborne, false);
  for (let i = 0; i <= 100; i++) {
    const age = TURN_TIME * i / 100, pose = turnJump(age);
    if (pose.spin > 0 && pose.spin < 1) assert.equal(pose.airborne, true);
    if (age >= TURN_CROUCH + TURN_FLIGHT) near(pose.spin, 1);
  }
});

test("the flight follows an arc, tucks the feet and reaches back before landing", () => {
  const apex = turnJump(TURN_CROUCH + TURN_FLIGHT / 2);
  near(apex.height, 0.25);
  near(apex.spin, 0.5);
  assert.ok(apex.tuck > 0.9);
  near(apex.open, 1);
  const reaching = turnJump(TURN_CROUCH + TURN_FLIGHT * 0.95);
  assert.ok(reaching.tuck < 0.05);
  assert.ok(reaching.open < 0.1);
  const landing = turnJump(TURN_CROUCH + TURN_FLIGHT + (TURN_TIME - TURN_CROUCH - TURN_FLIGHT) / 2);
  assert.ok(landing.height < -0.05);
  near(landing.spin, 1);
  near(landing.tuck, 0);
  assert.equal(landing.airborne, false);
});

test("phase boundaries are continuous and the pose settles without residual movement", () => {
  for (const age of [0, TURN_CROUCH, TURN_CROUCH + TURN_FLIGHT, TURN_TIME]) {
    for (const key of ["height", "pitch", "spin", "tuck", "open", "load"]) {
      near(turnJump(age - 1e-7)[key], turnJump(age + 1e-7)[key], 1e-5);
    }
  }
  for (const age of [TURN_TIME, TURN_TIME + 10]) {
    const pose = turnJump(age);
    for (const key of ["height", "pitch", "tuck", "open"]) near(pose[key], 0);
    near(pose.spin, 1);
    near(pose.load, 1);
    assert.equal(pose.airborne, false);
  }
});

for (const [small, fps] of [[false, 60], [true, 30], [true, 15]]) {
  test(`real ${small ? "mobile" : "desktop"} geometry stays grounded, clears the branch and returns at ${fps}fps`, () => {
    const { shape: s, kind, used } = buildChameleon(small ? 1800 : 3000, small, "hero");
    const mean = (part, axis) => {
      let sum = 0, count = 0;
      for (let i = 0; i < used; i++) if (kind[i] === part) { sum += s.pos[i * 3 + axis]; count++; }
      return sum / count;
    };
    const heading = () => mean(K.Eye, 0) - mean(K.Tail, 0);
    s.animate(0, { x: 0, y: 0, on: 0 });
    const initialFeet = mean(K.Foot, 1), initialBody = mean(K.Body, 1);
    assert.ok(heading() > 0);
    s.touch(-s.hw * 0.85, 0); // A fly behind it triggers the hop, without adding a new interaction.
    let apexFeet = -Infinity, turned = false;
    for (let frame = 0; frame <= fps * 5; frame++) {
      const t = frame / fps;
      s.animate(t, { x: 0, y: 0, on: 0 });
      assert.ok(s.pos.every(Number.isFinite), `finite geometry at ${t}`);
      assert.ok(s.alpha.every((a) => a >= 0 && a <= 1));
      if (t > 0.05 && t < TURN_CROUCH * 0.8) {
        assert.ok(Math.abs(mean(K.Foot, 1) - initialFeet) < 0.035, "crouching feet stay on the branch");
        assert.ok(mean(K.Body, 1) < initialBody - 0.025, "the body compresses over planted feet");
      }
      if (t < TURN_CROUCH + TURN_FLIGHT) apexFeet = Math.max(apexFeet, mean(K.Foot, 1));
      if (t > TURN_TIME && t < TURN_TIME + 0.3) turned ||= heading() < 0;
    }
    assert.ok(apexFeet > initialFeet + 0.3, "all feet travel with the jump, rather than dragging on the bark");
    assert.ok(turned, "the hop turns to face the fly");
    assert.ok(heading() > 0, "after the catch it hops back to its original heading");
  });
}
