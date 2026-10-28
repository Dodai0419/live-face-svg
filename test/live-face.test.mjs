import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { track, flow, seg, wave, loop, bell, seeded, bezier, pill, face, MOODS, DEFAULT_FACE } from "../live-face-svg.mjs";

const CLI = fileURLToPath(new URL("../live-face-svg.mjs", import.meta.url));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Reference: bisect x(s) = p on the Bernstein form, then read y(s).
const B = (a, b, s) => 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s * s + s ** 3;
function brute(x1, y1, x2, y2, p) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (B(x1, x2, m) < p) lo = m; else hi = m; }
  return B(y1, y2, (lo + hi) / 2);
}

test("bezier matches a brute-force cubic-bezier solve", () => {
  const io = bezier(0.77, 0, 0.175, 1);
  near(io(0), 0); near(io(1), 1);
  for (let p = 0; p <= 1; p += 0.01) near(io(p), brute(0.77, 0, 0.175, 1, p), 1e-5);
  const out = bezier(0.23, 1, 0.32, 1);
  for (let p = 0; p <= 1; p += 0.01) near(out(p), brute(0.23, 1, 0.32, 1, p), 1e-5);
  assert.ok(out(0.3) > 0.8, "ease-out front-loads the motion");
});

test("track passes through every key, holds outside, eases between", () => {
  const keys = [[0, 0], [1000, 10], [2000, 4, "out"], [3000, 0]];
  near(track(-5, keys), 0); near(track(0, keys), 0); near(track(1000, keys), 10);
  near(track(2000, keys), 4); near(track(9999, keys), 0);
  near(track(500, keys), 10 * brute(0.77, 0, 0.175, 1, 0.5), 1e-5); // ease-in-out
  assert.ok(track(1500, keys) < 7, "'out' arrives early: past the halfway value at the halfway time");
});

test("flow passes through keys and never overshoots a hold", () => {
  const k = [[0, 0], [400, 10], [800, 10], [1200, 0]];
  near(flow(400, k), 10); near(flow(800, k), 10);
  for (let t = 0; t <= 1200; t += 5) assert.ok(flow(t, k) <= 10 + 1e-9 && flow(t, k) >= -1e-9);
});

test("shaping helpers", () => {
  near(wave(0, 1000), 0); near(wave(250, 1000), 1);
  near(loop(1500, 1000), 0.5); near(loop(-250, 1000), 0.75);
  near(bell(0), 0); near(bell(0.5), 1); near(bell(2), 0);
  near(seg(50, 100, 200), 0); near(seg(300, 100, 200), 1);
  assert.equal(seeded(3), seeded(3)); assert.ok(seeded(3) >= 0 && seeded(3) < 1);
});

test("pill is a closed stadium path", () => {
  assert.equal(pill(10, 10, 20, 10), "M5 5H15A5 5 0 0 1 20 10V10A5 5 0 0 1 15 15H5A5 5 0 0 1 0 10V10A5 5 0 0 1 5 5Z");
});

test("every mood loops without a jump and starts on a good drawing", () => {
  for (const [name, c] of Object.entries(MOODS)) {
    for (const ch of ["lookX", "lookY", "lid", "lidRight", "cheek", "mouth", "tilt"]) {
      const k = c[ch];
      if (!k) continue;
      assert.equal(k[0][1], k.at(-1)[1], `${name}.${ch} last key equals first`);
      assert.ok(k.at(-1)[0] <= c.period, `${name}.${ch} fits the period`);
    }
    assert.ok(track(0, c.lid) < 0.5, `${name}: eyes open at frame 0`);
  }
});

test("blink timing follows the recipe: close >= 100 ms, reopen slower and eased out", () => {
  const lid = MOODS.happy.lid;
  for (let i = 1; i < lid.length; i++) {
    if (lid[i][1] >= 0.99 && lid[i - 1][1] < 0.5) assert.ok(lid[i][0] - lid[i - 1][0] >= 100, "close long enough");
  }
  assert.ok(lid.some((k) => k[2] === "out"), "reopen uses ease-out");
});

test("face() writes one self-playing SVG with a clip 2 units larger than the white", () => {
  const svg = face(DEFAULT_FACE, MOODS.happy, { fps: 30 });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 240 240"/);
  assert.ok(svg.trim().endsWith("</svg>"));
  const e = DEFAULT_FACE.eyes[0];
  assert.ok(svg.includes(pill(e.cx, e.cy, e.w + 2, e.h + 2)), "skin clip is white + 2");
  const n = Math.round((MOODS.happy.period / 1000) * 30) + 1;
  const anim = svg.match(/<animate [^>]*values="([^"]+)"/);
  assert.equal(anim[1].split(";").length, n, "one value per frame plus the loop end");
  assert.ok(svg.includes(`dur="${MOODS.happy.period}ms"`) && svg.includes('repeatCount="indefinite"'));
});

test("--at renders a still frame with the values at that time", () => {
  const still = face(DEFAULT_FACE, MOODS.happy, { at: 0 });
  assert.ok(!still.includes("<animate"), "a still has no animation");
  const e = DEFAULT_FACE.eyes[0];
  // frame 0: pupil at rest = cx + lookX(0) - pupilW/2
  const x = +(e.cx + track(0, MOODS.happy.lookX) - e.pupilW / 2).toFixed(2);
  assert.ok(still.includes(`x="${x}"`));
});

test("CLI writes SVG to stdout and lists moods", () => {
  const out = execFileSync(process.execPath, [CLI, "--mood", "talking"], { encoding: "utf8" });
  assert.match(out, /^<svg /);
  const list = execFileSync(process.execPath, [CLI, "--list"], { encoding: "utf8" });
  for (const m of Object.keys(MOODS)) assert.ok(list.includes(m));
});
