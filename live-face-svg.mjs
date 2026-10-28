#!/usr/bin/env node
// live-face-svg: the live face of rossark-motion-skill (gliding pupils, blinks, happy squint,
// talking mouth, head tilt) as ONE self-playing SVG. No React Native, no Reanimated, no SwiftUI.
// Engine and face follow templates/react-native/{motion.ts,liveFace.tsx} (MIT, rossark0).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---- engine (same math as motion.ts) ----

/** CSS-style cubic-bezier(x1, y1, x2, y2) easing, solved for x like Reanimated's Easing.bezierFn. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = p;
    for (let i = 0; i < 8; i++) {
      const d = dX(s), e = X(s) - p;
      if (Math.abs(e) < 1e-7) break;
      if (Math.abs(d) < 1e-6) { s = NaN; break; }
      s -= e / d;
    }
    if (!(s >= 0 && s <= 1)) { // Newton failed: bisect
      let lo = 0, hi = 1;
      s = p;
      for (let i = 0; i < 40; i++) { if (X(s) < p) lo = s; else hi = s; s = (lo + hi) / 2; }
    }
    return ((ay * s + by) * s + cy) * s;
  };
}

/** Things that travel (gaze, sway, a lid closing). */
export const EASE_IN_OUT = bezier(0.77, 0, 0.175, 1);
/** Things that open or arrive (a mouth, a lid reopening). */
export const EASE_OUT = bezier(0.23, 1, 0.32, 1);

/** Keys [ms, value, 'out'?]; each segment eases in-out, or eases out when the arriving key says 'out'. */
export function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (t <= k1[0]) {
      const k0 = keys[i - 1], span = k1[0] - k0[0];
      const p = span > 0 ? (t - k0[0]) / span : 1;
      return k0[1] + (k1[1] - k0[1]) * (k1[2] === "out" ? EASE_OUT(p) : EASE_IN_OUT(p));
    }
  }
  return keys[keys.length - 1][1];
}

/** A monotone cubic through key poses [ms, value]: continuous speed, never overshoots a key. */
export function flow(t, k) {
  const n = k.length;
  if (t <= k[0][0]) return k[0][1];
  if (t >= k[n - 1][0]) return k[n - 1][1];
  let i = 0;
  while (k[i + 1][0] < t) i++;
  const slope = (j) => (k[j + 1][1] - k[j][1]) / (k[j + 1][0] - k[j][0]);
  const tangent = (j) => {
    if (j === 0 || j === n - 1) return 0;
    const a = slope(j - 1), b = slope(j);
    if (a * b <= 0) return 0;
    const h0 = k[j][0] - k[j - 1][0], h1 = k[j + 1][0] - k[j][0];
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  };
  const h = k[i + 1][0] - k[i][0], s = (t - k[i][0]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * k[i][1] + (s3 - 2 * s2 + s) * h * tangent(i) +
    (-2 * s3 + 3 * s2) * k[i + 1][1] + (s3 - s2) * h * tangent(i + 1);
}

export const seg = (t, a, b, curve = "out") =>
  t <= a ? 0 : t >= b ? 1 : (curve === "out" ? EASE_OUT : EASE_IN_OUT)((t - a) / (b - a));
export const wave = (t, period, phase = 0) => Math.sin((t / period + phase) * Math.PI * 2);
export const loop = (t, period, phase = 0) => { const p = (t / period + phase) % 1; return p < 0 ? p + 1 : p; };
export const bell = (p) => Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
export const seeded = (i, salt = 0) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };

// ---- moods: the feelings table of SKILL.md section 4 as choreographies ----

const blink = (at, close = 110, hold = 40, open = 190, rest = 0) =>
  [[at, rest], [at + close, 1], [at + close + hold, 1], [at + close + hold + open, rest, "out"]];
const still = (v, period) => [[0, v], [period, v]];
const syllables = (from, count, period, rest = 6) => {
  const k = [[0, rest], [from, rest]];
  for (let i = 0; i < count; i++) k.push([from + 180 * i + 90, 8 + Math.round(seeded(i, 1) * 6)], [from + 180 * (i + 1), rest + 1, "out"]);
  k[k.length - 1] = [k[k.length - 1][0], rest, "out"];
  return [...k, [period, rest]];
};

export const MOODS = {
  happy: {
    period: 7000,
    lookX: [[0, 0], [1800, 0], [2300, 5], [3800, 5], [4300, 0], [7000, 0]],
    lookY: still(0, 7000),
    lid: [[0, 0], ...blink(2900), ...blink(6100), [7000, 0]],
    cheek: [[0, 0], [4400, 0], [4800, 1, "out"], [5500, 1], [5900, 0], [7000, 0]],
    mouth: [[0, 9], [4400, 9], [4800, 15, "out"], [5500, 15], [5900, 9], [7000, 9]],
    tilt: [[0, 0], [1800, 0], [2300, 4], [3800, 4], [4300, 0], [7000, 0]],
  },
  talking: {
    period: 6000,
    lookX: still(0, 6000),
    lookY: still(0, 6000),
    lid: [[0, 0], ...blink(3700), [6000, 0]],
    mouth: syllables(400, 12, 6000),
    tilt: [[0, 0], [1500, 2], [3000, 0], [4500, -2], [6000, 0]],
  },
  tired: {
    period: 8000,
    lookX: [[0, -2], [3500, -2], [4000, 2], [6000, 2], [6500, -2], [8000, -2]],
    lookY: still(4, 8000),
    lid: [[0, 0.35], ...blink(2500, 130, 50, 260, 0.35), [5200, 0.35], [5700, 1], [6200, 1], [6800, 0.35, "out"], [8000, 0.35]],
    mouth: still(6, 8000),
    tilt: [[0, -3], [4000, -4], [8000, -3]],
  },
  sad: {
    period: 8000,
    lookX: still(-4, 8000),
    lookY: [[0, 4], [3500, 4], [4300, -3], [5500, -3], [6300, 4], [8000, 4]],
    lid: [[0, 0.1], ...blink(2000, 140, 50, 260, 0.1), ...blink(6800, 140, 50, 260, 0.1), [8000, 0.1]],
    mouth: still(4, 8000),
    tilt: [[0, -4], [4300, -2], [6300, -4], [8000, -4]],
  },
  focused: {
    period: 7000,
    lookX: [[0, -3], [1200, -3], [1300, -1], [2600, -1], [2700, -3], [4200, -3], [4300, 1], [5600, 1], [5700, -3], [7000, -3]],
    lookY: still(3, 7000),
    lid: [[0, 0.1], ...blink(4800, 110, 40, 190, 0.1), [7000, 0.1]],
    mouth: still(5, 7000),
    tilt: still(1, 7000),
  },
  sleepless: {
    period: 9000,
    lookX: [[0, 0], [4000, 0], [4500, 5], [6500, 5], [7000, 0], [9000, 0]],
    lookY: [[0, -5], [4000, -5], [4500, 0], [6500, 0], [7000, -5], [9000, -5]],
    lid: [[0, 0], [7000, 0], [7800, 0.85], [8300, 0.85], [8800, 0, "out"], [9000, 0]],
    mouth: still(7, 9000),
    tilt: [[0, 0], [4000, 0], [4500, 3], [6500, 3], [7000, 0], [9000, 0]],
  },
  wink: {
    period: 5000,
    lookX: [[0, 0], [1400, 0], [1800, 3], [3400, 3], [3800, 0], [5000, 0]],
    lookY: still(0, 5000),
    lid: still(0, 5000),
    lidRight: [[0, 0], [2000, 0], [2130, 1], [2500, 1], [2760, 0, "out"], [5000, 0]],
    cheek: [[0, 0], [1900, 0], [2200, 0.6, "out"], [2600, 0.6], [2900, 0], [5000, 0]],
    mouth: [[0, 9], [1900, 9], [2200, 13, "out"], [2700, 13], [3000, 9], [5000, 9]],
    tilt: [[0, 0], [1800, 3], [3400, 3], [3800, 0], [5000, 0]],
  },
};

// ---- the face ----

/** A demo head in a 240 x 240 drawing. Swap any part with --face face.json. */
export const DEFAULT_FACE = {
  size: [240, 240],
  pivot: [120, 205], // neck: the head tilts around it
  art: '<circle cx="120" cy="124" r="86" fill="#f2c6a0"/><path d="M38 110C40 50 84 26 124 28C170 30 204 60 202 112C186 84 160 70 120 72C88 72 60 84 38 110Z" fill="#3b2a3f"/>',
  front: '<path d="M116 132Q120 144 126 138" fill="none" stroke="#c98d6c" stroke-width="4" stroke-linecap="round"/>',
  ink: { white: "#ffffff", pupil: "#2b2340", skin: "#f2c6a0", line: "#5a3b2e", lineWidth: 5, mouth: "#6b2234", tongue: "#e8707e", teeth: "#ffffff" },
  eyes: [
    { cx: 88, cy: 114, w: 30, h: 40, pupilW: 15, pupilH: 22, pupilTop: 9, shine: 3 },
    { cx: 152, cy: 114, w: 30, h: 40, pupilW: 15, pupilH: 22, pupilTop: 9, shine: 3 },
  ],
  mouth: { x0: 100, x1: 140, top: 160, tilt: 2 },
};

/** A rounded pill (stadium) path centred on (cx, cy). */
export function pill(cx, cy, w, h) {
  const r = Math.min(w, h) / 2, x = cx - w / 2, y = cy - h / 2;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

const r2 = (v) => (typeof v === "number" ? +v.toFixed(2) : v);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Render the face. opts.at = ms gives a still frame; otherwise one <animate> per moving attribute. */
export function face(f, c, { fps = 60, at } = {}) {
  const n = Math.round((c.period / 1000) * fps) + 1;
  const times = at === undefined ? Array.from({ length: n }, (_, i) => (i * c.period) / (n - 1)) : [at];
  const dur = `dur="${c.period}ms" repeatCount="indefinite" calcMode="linear"`;
  // An element whose `moving` attributes are functions of t: a still value, or an <animate> each.
  const el = (tag, fixed, moving = {}, inner = "") => {
    let attrs = Object.entries(fixed).map(([k, v]) => ` ${k}="${r2(v)}"`).join("");
    let anims = "";
    for (const [k, fn] of Object.entries(moving)) {
      const vals = times.map((t) => String(r2(fn(t))));
      if (vals.every((v) => v === vals[0])) attrs += ` ${k}="${vals[0]}"`;
      else anims += `<animate attributeName="${k}" ${dur} values="${vals.join(";")}"/>`;
    }
    return `<${tag}${attrs}>${anims}${inner}</${tag}>`;
  };
  const tr = (keys, d = 0) => (t) => (keys ? track(t, keys) : d);
  const { ink } = f, lw = ink.lineWidth ?? 5;
  const lookX = tr(c.lookX), lookY = tr(c.lookY), cheek = tr(c.cheek);

  const eye = (e, side, id) => {
    const { cx, cy, w, h, pupilW: pw, pupilH: ph } = e;
    const lid = tr(side === 1 && c.lidRight ? c.lidRight : c.lid);
    const top = cy - h / 2 + e.pupilTop, lidH = h + 4;
    const closedD = `M${cx - side * w * 0.37} ${cy}H${cx + side * w * 0.13}Q${cx + side * w * 0.33} ${cy} ${cx + side * w * 0.37} ${r2(cy + h * 0.17)}`;
    const happyD = `M${r2(cx - w * 0.4)} ${r2(cy - h * 0.1)}Q${cx} ${r2(cy - h * 0.7)} ${r2(cx + w * 0.4)} ${r2(cy - h * 0.1)}`;
    const lashOn = (l) => Math.min(1, l / 0.06) * clamp01((0.95 - l) / 0.08);
    return `<clipPath id="${id}"><path d="${pill(cx, cy, w, h)}"/></clipPath>` +
      `<clipPath id="${id}Skin"><path d="${pill(cx, cy, w + 2, h + 2)}"/></clipPath>` +
      `<path d="${pill(cx, cy, w, h)}" fill="${ink.white}"/>` +
      `<g clip-path="url(#${id})">` +
      el("rect", { width: pw, height: ph, rx: pw / 2, fill: ink.pupil }, { x: (t) => cx + lookX(t) - pw / 2, y: (t) => top + lookY(t) }) +
      (e.shine > 0 ? el("circle", { r: e.shine, fill: ink.white }, { cx: (t) => cx + lookX(t) - pw * 0.22, cy: (t) => top + lookY(t) + e.shine + 1.6 }) : "") +
      `</g><g clip-path="url(#${id}Skin)">` +
      el("rect", { x: cx - w / 2 - 2, y: cy - h / 2 - 2, width: w + 4, fill: ink.skin }, { height: (t) => lid(t) * lidH }) +
      el("line", { x1: cx - w / 2 - 2, x2: cx + w / 2 + 2, stroke: ink.line, "stroke-width": lw * 0.6 },
        { y1: (t) => cy - h / 2 - 2 + lid(t) * lidH, y2: (t) => cy - h / 2 - 2 + lid(t) * lidH, "stroke-opacity": (t) => lashOn(lid(t)) }) +
      (c.cheek ? el("rect", { x: cx - w / 2 - 2, width: w + 4, fill: ink.skin }, { y: (t) => cy + h / 2 + 2 - cheek(t) * lidH, height: (t) => cheek(t) * lidH }) : "") +
      `</g>` +
      el("path", { d: closedD, stroke: ink.line, "stroke-width": lw, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" },
        { "stroke-opacity": (t) => clamp01((lid(t) - 0.88) / 0.12) }) +
      (c.cheek ? el("path", { d: happyD, stroke: ink.line, "stroke-width": lw, "stroke-linecap": "round", fill: "none" },
        { "stroke-opacity": (t) => clamp01((cheek(t) - 0.86) / 0.14) }) : "");
  };

  const { x0, x1, top, tilt = 0 } = f.mouth, mid = (x0 + x1) / 2;
  const depth = tr(c.mouth, 11);
  const mouth =
    el("path", { fill: ink.mouth }, { d: (t) => { const d = r2(top + depth(t)); return `M${x0} ${top}L${x1} ${top - tilt}Q${x1 + 2} ${d} ${mid} ${d}Q${x0 - 2} ${d} ${x0} ${top}Z`; } }) +
    el("circle", { cx: mid + 1, fill: ink.tongue }, {
      cy: (t) => top + depth(t) - Math.min(depth(t) * 0.36, (x1 - x0) * 0.22) - 1.5,
      r: (t) => Math.min(depth(t) * 0.36, (x1 - x0) * 0.22),
    }) +
    (ink.teeth ? `<path d="M${x0 + 1} ${top}L${x1 - 1} ${top - tilt}L${x1 - 1.5} ${top - tilt + 5}L${x0 + 1.5} ${top + 5}Z" fill="${ink.teeth}"/>` : "");

  const [px, py] = f.pivot ?? [f.size[0] / 2, f.size[1]];
  const tiltAt = tr(c.tilt);
  const tiltVals = times.map((t) => `${r2(tiltAt(t))} ${px} ${py}`);
  const head = tiltVals.every((v) => v === tiltVals[0])
    ? `<g transform="rotate(${tiltVals[0]})">`
    : `<g><animateTransform attributeName="transform" type="rotate" ${dur} values="${tiltVals.join(";")}"/>`;

  const [W, H] = f.size;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    head + (f.art ?? "") + eye(f.eyes[0], -1, "lfL") + eye(f.eyes[1], 1, "lfR") + (f.front ?? "") + mouth + `</g></svg>\n`;
}

// ---- CLI ----

function main(argv) {
  const arg = (name, d) => { const i = argv.indexOf(name); return i < 0 ? d : argv[i + 1]; };
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node live-face-svg.mjs [--mood happy] [--face face.json] [--choreo choreo.json] [--fps 60] [--at ms] [-o out.svg]\n       node live-face-svg.mjs --all docs/   (one SVG per mood)\n       node live-face-svg.mjs --list");
    return;
  }
  if (argv.includes("--list")) {
    for (const [k, c] of Object.entries(MOODS)) console.log(`${k.padEnd(10)} ${c.period} ms loop`);
    return;
  }
  const f = argv.includes("--face") ? { ...DEFAULT_FACE, ...JSON.parse(fs.readFileSync(arg("--face"), "utf8")) } : DEFAULT_FACE;
  const fps = Number(arg("--fps", 60));
  const at = argv.includes("--at") ? Number(arg("--at")) : undefined;
  const all = arg("--all");
  if (all) {
    fs.mkdirSync(all, { recursive: true });
    for (const [k, c] of Object.entries(MOODS)) {
      const file = path.join(all, `${k}.svg`);
      fs.writeFileSync(file, face(f, c, { fps, at }));
      console.log(`${file}  ${fs.statSync(file).size} bytes`);
    }
    return;
  }
  const mood = arg("--mood", "happy");
  const c = argv.includes("--choreo") ? JSON.parse(fs.readFileSync(arg("--choreo"), "utf8")) : MOODS[mood];
  if (!c) { console.error(`unknown mood "${mood}"; try --list`); process.exit(1); }
  const svg = face(f, c, { fps, at });
  const out = arg("-o");
  if (out) { fs.writeFileSync(out, svg); console.log(`${out}  ${svg.length} bytes, ${c.period} ms loop`); }
  else process.stdout.write(svg);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
