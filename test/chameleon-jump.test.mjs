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
const { turnJump, TURN_CROUCH, TURN_FLIGHT, TURN_TIME, buildChameleon, chameleonPortrait, createChameleonCompanion, K, LEAVES } = await import(moduleUrl(`${source}
  export { turnJump, TURN_CROUCH, TURN_FLIGHT, TURN_TIME, buildChameleon, K, LEAVES };
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

for (const [small, n] of [[true, 1800], [true, 2800], [false, 3000], [false, 6400]]) {
  test(`${small ? "mobile" : "desktop"}: sparse leaves remain visible along the front and rear branch with ${n} glyphs`, () => {
    const { shape: s, kind, used } = buildChameleon(n, small, "hero");
    const leaves = Array.from({ length: used }, (_, i) => i).filter((i) => kind[i] === K.Leaf);
    assert.ok(LEAVES <= 6, "keep a few leaves, not a continuous fringe");
    assert.equal(leaves.length % LEAVES, 0);
    const perLeaf = leaves.length / LEAVES;
    for (let frame = 0; frame <= 360; frame++) {
      s.animate(frame / 60, { x: 0, y: 0, on: 0 });
      if (frame % 120 !== 0) continue;
      s.fadeRight(s.hw * 0.85, s.hw * 0.3);
      const visible = Array.from({ length: LEAVES }, () => ({ front: 0, rear: 0 }));
      leaves.forEach((i, index) => {
        if (s.alpha[i] <= 0.1) return;
        const x = s.pos[i * 3] * 3.2 / (3.2 + s.pos[i * 3 + 2]);
        if (x < -s.hw || x > s.hw * 0.85) return;
        const leaf = visible[Math.floor(index / perLeaf)];
        if (x > s.hw * 0.25) leaf.front++;
        if (x < -s.hw * 0.25) leaf.rear++;
      });
      assert.ok(visible.some((leaf) => leaf.front >= 3), `a readable leaf ahead of the animal at frame ${frame}`);
      assert.ok(visible.some((leaf) => leaf.rear >= 3), `a readable leaf on the rear branch at frame ${frame}`);
    }
  });
}

for (const small of [false, true]) {
  test(`${small ? "mobile" : "desktop"}: the branch stays visible ahead of the chameleon as it walks`, () => {
    const { shape: s, kind, used } = buildChameleon(small ? 1800 : 3000, small, "hero");
    for (let frame = 0; frame <= 360; frame++) {
      s.animate(frame / 60, { x: 0, y: 0, on: 0 });
      if (frame % 60 !== 0) continue;
      const bands = Array.from({ length: 3 }, () => ({ count: 0, alpha: 0 }));
      for (let i = 0; i < used; i++) if (kind[i] === K.Branch) {
        const x = s.pos[i * 3] * 3.2 / (3.2 + s.pos[i * 3 + 2]);
        const band = x < 0 ? (x > -s.hw ? 0 : -1) : x < s.hw / 2 ? 1 : x < s.hw ? 2 : -1;
        if (band < 0) continue;
        bands[band].count++;
        bands[band].alpha += s.alpha[i];
      }
      const rear = bands[0].alpha / bands[0].count;
      for (const band of bands.slice(1)) {
        assert.ok(band.count >= 10, "bark continues through the front of the scene");
        assert.ok(band.alpha / band.count > rear * 0.65, `forward bark is as legible as the rear at frame ${frame}`);
      }
    }
  });

  test(`${small ? "mobile" : "desktop"}: the margin fade only affects forward scenery and can be resized without accumulating`, () => {
    const { shape: s, kind, used } = buildChameleon(small ? 1800 : 3000, small, "hero");
    for (let frame = 0; frame <= 180; frame++) {
      s.animate(frame / 60, { x: 0, y: 0, on: 0 });
      if (frame % 60 !== 0) continue;
      const alpha = s.alpha.slice(), pos = s.pos.slice(), glyph = s.glyph.slice();
      const right = s.hw * (frame % 120 ? 1.05 : 0.85), width = s.hw * 0.3;
      s.fadeRight(right, width);
      let faded = 0, hidden = 0;
      for (let i = 0; i < used; i++) {
        const x = s.pos[i * 3] * 3.2 / (3.2 + s.pos[i * 3 + 2]);
        const scenery = kind[i] === K.Branch || kind[i] === K.Leaf;
        if (!scenery || x <= right - width) near(s.alpha[i], alpha[i]);
        else if (x >= right) { assert.equal(s.alpha[i], 0); hidden += alpha[i] > 0 ? 1 : 0; }
        else if (alpha[i] > 0) { assert.ok(s.alpha[i] > 0 && s.alpha[i] < alpha[i]); faded++; }
      }
      assert.ok(faded > 5 && hidden > 5, "scenery fades gradually, then disappears before the gutter");
      const once = s.alpha.slice();
      s.fadeRight(right, width);
      assert.deepEqual(s.alpha, once, "redrawing does not compound the fade");
      s.fadeRight(s.hw * 10, width);
      assert.deepEqual(s.alpha, alpha, "moving the margin outward restores the original scenery");
      assert.deepEqual(s.pos, pos);
      assert.deepEqual(s.glyph, glyph, "resizing the fade does not advance the animation");
    }
  });

  test(`${small ? "mobile" : "desktop"}: flies spawn well beyond the previous feeding area, but not arbitrarily far away`, () => {
    const cases = [
      [1.7, 0, true], [-1.7, 0, true], [0, 1.9, true], [0, -1.9, true],
      [1.7, 1.9, true], [-1.7, -1.9, true],
      [2.1, 0, false], [-2.1, 0, false], [0, 2.3, false], [0, -2.3, false],
    ];
    for (const [x, y, expected] of cases) {
      const { shape: s, kind, used } = buildChameleon(small ? 1800 : 3000, small, "hero");
      s.animate(0, { x: 0, y: 0, on: 0 });
      assert.equal(s.touch(x * s.hw, y * s.hh), true, "the hero never falls back to a glyph wave");
      s.animate(1 / 60, { x: 0, y: 0, on: 0 });
      let visibleFly = false;
      for (let i = 0; i < used; i++) if (kind[i] === K.Fly && s.alpha[i] > 0.01) {
        visibleFly = true;
        assert.ok([...s.pos.slice(i * 3, i * 3 + 3)].every(Number.isFinite), "spawned flies have finite positions");
      }
      assert.equal(visibleFly, expected, `feeding position (${x}, ${y})`);
    }
  });
}

test("portrait layers reuse the hero's anatomy with finite neck and eye pivots, computed only at build time", () => {
  for (const pose of ["perched", "sleeping"]) {
    const portrait = chameleonPortrait(pose);
    assert.deepEqual(portrait.parts.map((part) => part.name), ["tail", "feet", "body", "head", "eye"]);
    for (const [value, bound] of [[portrait.neckX, portrait.width], [portrait.neckY, portrait.height], [portrait.eyeX, portrait.width], [portrait.eyeY, portrait.height]]) {
      assert.ok(Number.isFinite(value) && value > 0 && value < bound);
    }
    const counts = portrait.parts.map((part) => part.runs.reduce((sum, run) => sum + run.text.length, 0));
    assert.ok(counts.every((count) => count > 0));
    assert.ok(counts.reduce((sum, count) => sum + count, 0) < 1600);
    for (const part of portrait.parts) for (const run of part.runs) {
      assert.equal(run.x.length, run.text.length);
      assert.equal(run.y.length, run.text.length);
      assert.ok([...run.x, ...run.y].every(Number.isFinite));
    }
  }
});

test("the companion idles like the hero, trots, stops, and hops round on command", () => {
  const c = createChameleonCompanion();
  const { shape: s } = c;
  const look = { x: 0, y: 0, on: 0 };
  const frames = (from, to) => { for (let t = from; t <= to + 1e-9; t += 1 / 60) { s.animate(t, look); assert.ok(s.pos.every(Number.isFinite)); } };
  frames(0, 1);
  const idle = s.pos.slice();
  frames(1, 3);
  assert.notDeepEqual(s.pos, idle, "idle life: head, eyes, tail");
  assert.equal(c.walked, 0, "never wanders off on its own");
  c.run(true);
  frames(3, 5);
  assert.ok(c.walked > 0.8, `trots forward (${c.walked})`);
  c.run(false);
  frames(5, 6);
  assert.equal(c.busy, false, "finishes its step and stops");
  const stopped = c.walked;
  frames(6, 7);
  assert.ok(Math.abs(c.walked - stopped) < 0.01, "stays put");
  c.hop(true);
  assert.equal(c.busy, true);
  frames(7, 8.2);
  assert.equal(c.busy, false);
  assert.equal(c.facingHome, false);
  c.run(true); frames(8.2, 9.5); c.run(false); frames(9.5, 10.5);
  assert.ok(c.walked < stopped - 0.3, "turned round, it trots the other way");
  c.face(false); frames(10.5, 10.6);
  assert.equal(c.facingHome, true);
});
