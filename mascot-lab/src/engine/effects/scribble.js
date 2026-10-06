// "Scribble" — the logo redrawn by hand with a marker: every colour area is filled with
// loose zig-zag hatching (the pen goes back and forth across the shape, lifts now and
// then, never quite reaches the edge), thin detail (keylines, pupils, small lettering) is
// redrawn with a hand wobble, the silhouette is traced two or three times with jitter and
// uneven pressure, and a few doodles (stars, sparkles, an underline scribble) sit in the
// margin. The tool sets the texture: felt marker (translucent overlaps), ballpoint (thin,
// dense, cross-hatched) or crayon (waxy, toothy).
//
// Structure as halftone.js: colour regions + thickness at A (≈ W/2) with core.js distance
// fields; strokes are vector paths in 1024-units × ctx.scale (crisp at any size); thin
// detail is a noise-warped copy of the source at W. Transparent background, deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, lerp, hexToRgb, luminance,
  nearestColorIndex, insideDistance, outsideDistance, traceContours, maskBounds, rng, hashSeed,
  makeNoise2D, smoothstep, mix as mixHex,
} from "../core.js";
import { extractPalette } from "../image.js";

const TOOLS = {
  //           ink opacity, paper tooth, width ×, hatch spacing ×, tooth scale
  marker:    { alpha: 0.82, grain: 0.1, wmul: 1, spacing: 1.35 },
  ballpoint: { alpha: 0.9, grain: 0.05, wmul: 0.45, spacing: 1.9 },
  crayon:    { alpha: 0.94, grain: 0.42, wmul: 1.15, spacing: 1.25, tooth: 2.2 },
};

/* ───────────────────────────── analysis ───────────────────────────── */

/** Region labels (palette index per pixel, −1 = transparent) and thick/thin split at A. */
function regions(img, A, palRGB, rThin) {
  const { data } = getPixels(img);
  const n = A * A;
  const label = new Int8Array(n).fill(-1);
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (data[j + 3] < 128) continue;
    const key = ((data[j] >> 3) << 10) | ((data[j + 1] >> 3) << 5) | (data[j + 2] >> 3);
    let k = cache[key];
    if (k < 0) k = cache[key] = nearestColorIndex(data[j], data[j + 1], data[j + 2], palRGB);
    label[i] = k;
  }
  // per-region edge distance in one pass: interior = pixels whose 4-neighbours share the label
  const interior = new Float32Array(n);
  for (let y = 1; y < A - 1; y++) {
    for (let x = 1; x < A - 1; x++) {
      const i = y * A + x, l = label[i];
      if (l < 0 || label[i - 1] !== l || label[i + 1] !== l || label[i - A] !== l || label[i + A] !== l) continue;
      interior[i] = 1;
    }
  }
  const edge = insideDistance(interior, A, A, 0.5);
  const core = new Float32Array(n);
  for (let i = 0; i < n; i++) core[i] = edge[i] + 0.5 > rThin ? 1 : 0;
  const toCore = outsideDistance(core, A, A, 0.5);
  const thick = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && toCore[i] <= rThin) thick[i] = 1;
  return { label, thick, data };
}

/**
 * Zig-zag hatching of mask (A×A Uint8 / test fn) at `angle`, line spacing `sp` (A px).
 * → polylines in A px. The pen sweeps a span, steps to the next scanline on the same
 * side, sweeps back… and lifts after a few turns.
 */
function hatch(inside, A, bounds, angle, sp, rand, jitter, segLen) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
  const R = Math.hypot(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) / 2 + 2;
  const strokes = [];
  let active = [];
  const step = 0.9;
  for (let v = -R + rand() * sp; v <= R; v += sp * (0.88 + rand() * 0.24)) {
    // spans along this scanline
    const spans = [];
    let start = null;
    for (let t = -R; t <= R + step; t += step) {
      const x = cx + t * ca - v * sa, y = cy + t * sa + v * ca;
      const xi = x | 0, yi = y | 0;
      const ins = t <= R && xi >= 0 && yi >= 0 && xi < A && yi < A && inside(yi * A + xi);
      if (ins && start === null) start = t;
      else if (!ins && start !== null) {
        if (t - start > 1.2) spans.push([start, t - step]);
        start = null;
      }
    }
    const next = [];
    for (const [a0, b0] of spans) {
      // the pen stops short of / overshoots the edge a little
      const a = a0 + (rand() - 0.35) * jitter, b = b0 - (rand() - 0.35) * jitter;
      if (b - a < 0.8) continue;
      const P = (t) => [cx + t * ca - v * sa, cy + t * sa + v * ca];
      // a sweep with intermediate points, so the hand wobble can bend it
      const sweep = (s, from, to) => {
        const m = Math.max(1, Math.round(Math.abs(to - from) / segLen));
        for (let q = 1; q <= m; q++) s.pts.push(P(lerp(from, to, q / m)));
      };
      let link = -1;
      for (let k = 0; k < active.length; k++) {
        const s = active[k];
        if (s.used || s.turns > s.maxTurns) continue;
        if (a < s.b + sp * 0.5 && b > s.a - sp * 0.5) { link = k; break; }
      }
      if (link >= 0) {
        const s = active[link];
        s.used = true;
        // continue from the side the pen is on
        if (s.endAtB) { s.pts.push(P(b)); sweep(s, b, a); s.endAtB = false; } else { s.pts.push(P(a)); sweep(s, a, b); s.endAtB = true; }
        s.a = a; s.b = b; s.turns++;
        next.push(s);
      } else {
        const s = { pts: [P(a)], a, b, endAtB: true, turns: 0, maxTurns: 5 + ((rand() * 9) | 0), used: true };
        sweep(s, a, b);
        strokes.push(s);
        next.push(s);
      }
    }
    for (const s of next) s.used = false;
    active = next;
  }
  return strokes.map((s) => s.pts);
}

/* ───────────────────────────── drawing ───────────────────────────── */

/** Stroke a polyline with smoothing (midpoint quadratics) after a wobble displacement. */
function wobblyPath(pts, k, warp, closed) {
  const p = new Path2D();
  const m = pts.length;
  if (m < 2) return p;
  const q = pts.map(([x, y]) => warp(x * k, y * k));
  if (m === 2) { p.moveTo(q[0][0], q[0][1]); p.lineTo(q[1][0], q[1][1]); return p; }
  if (closed) {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let s = mid(q[m - 1], q[0]);
    p.moveTo(s[0], s[1]);
    for (let i = 0; i < m; i++) {
      const c = q[i], e = mid(q[i], q[(i + 1) % m]);
      p.quadraticCurveTo(c[0], c[1], e[0], e[1]);
    }
    p.closePath();
  } else {
    p.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < m - 1; i++) p.lineTo(q[i][0], q[i][1]);
    p.lineTo(q[m - 1][0], q[m - 1][1]);
  }
  // (sweeps are sampled densely enough that straight segments read as a smooth hand line)
  return p;
}

/** Resample a closed polyline every `d` px (so wobble noise applies smoothly). */
function resample(pts, d) {
  const out = [];
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % m];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const nseg = Math.max(1, Math.ceil(L / d));
    for (let s = 0; s < nseg; s++) out.push([lerp(x0, x1, s / nseg), lerp(y0, y1, s / nseg)]);
  }
  return out;
}

function starPath(p, x, y, R, rot, wob, rand) {
  for (let i = 0; i <= 10; i++) {
    const r = (i % 2 ? R * 0.42 : R) * (1 + (rand() - 0.5) * wob);
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
}

function sparklePath(p, x, y, L) {
  const w = L * 0.16;
  p.moveTo(x, y - L);
  p.quadraticCurveTo(x + w, y - w, x + L * 0.8, y);
  p.quadraticCurveTo(x + w, y + w, x, y + L);
  p.quadraticCurveTo(x - w, y + w, x - L * 0.8, y);
  p.quadraticCurveTo(x - w, y - w, x, y - L);
  p.closePath();
}

/** Paper-tooth alpha tile (256², repeat), cached per seed + grain: deterministic. */
const TOOTH = new Map();
function toothTile(seed, grain) {
  const key = seed + "|" + grain;
  let tile = TOOTH.get(key);
  if (tile) return tile;
  const T = 256;
  tile = createCanvas(T, T);
  const tx = ctx2d(tile);
  const ti = tx.createImageData(T, T);
  const td = ti.data;
  const g = makeNoise2D(seed + 1);
  const r = rng(seed + 2);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      // fine tooth, slightly streaked
      const v = 0.55 * g(x / 2.2, y / 4.5) + 0.45 * g(x / 7 + 40, y / 3 - 20);
      const a = smoothstep(0.15, 0.85, v * 0.5 + 0.5 + (r() - 0.5) * 0.5);
      td[(y * T + x) * 4 + 3] = clamp(a * grain * 1.6) * 255;
    }
  }
  tx.putImageData(ti, 0, 0);
  if (TOOTH.size > 6) TOOTH.delete(TOOTH.keys().next().value);
  TOOTH.set(key, tile);
  return tile;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "scribble",
  name: "Scribble",
  category: "street",
  blurb: "Hand-drawn marker: zig-zag fills, wobbly outlines, doodles.",
  method: "Screen print",
  stage: "paper",
  params: [
    {
      key: "tool", label: "Tool", type: "select", default: "marker",
      options: [
        { value: "marker", label: "Marker" },
        { value: "ballpoint", label: "Ballpoint" },
        { value: "crayon", label: "Crayon" },
      ],
    },
    { key: "width", label: "Stroke width", type: "range", min: 3, max: 18, step: 1, default: 9, unit: "px" },
    { key: "density", label: "Density", type: "range", min: 20, max: 100, step: 1, default: 60, unit: "%" },
    { key: "wobble", label: "Wobble", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "passes", label: "Outline passes", type: "range", min: 1, max: 3, step: 1, default: 2 },
    {
      key: "mode", label: "Color", type: "select", default: "logo",
      options: [
        { value: "logo", label: "Logo colors" },
        { value: "ink", label: "One ink" },
      ],
    },
    { key: "ink", label: "Ink", type: "color", default: "primary" },
  ],
  presets: [
    { name: "Marker", params: { tool: "marker", width: 9, density: 60, wobble: 45, passes: 2, mode: "logo" } },
    { name: "Ballpoint", params: { tool: "ballpoint", width: 6, density: 80, wobble: 30, passes: 3, mode: "ink", ink: "primary" } },
    { name: "Crayon", params: { tool: "crayon", width: 13, density: 55, wobble: 60, passes: 2, mode: "logo" } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const W = Math.min(S, 1024);
    const A = W > 400 ? Math.round(W / 2) : Math.min(W, 256);
    const kW = W / S;
    const uA = sc * kW * (A / W);              // A px per unit
    const kS = S / A;                          // S px per A px
    const n = A * A;
    const tool = TOOLS[p.tool] || TOOLS.marker;
    const seed = hashSeed("scribble", ctx.seed);
    const rand = rng(seed);
    const noise = makeNoise2D(seed);
    const wob = p.wobble / 100;
    const oneInk = p.mode === "ink";

    const w = p.width * tool.wmul;             // stroke width (units)
    const spU = w * lerp(2.3, 0.95, (p.density - 20) / 80) * tool.spacing; // hatch spacing (units)

    /* ── 1. colour regions at A ── */
    const small = W === S ? src : resizeCanvas(src, W, W);
    const img = A === W ? small : resizeCanvas(small, A, A);
    const pal = extractPalette(img, 6, { maxSamples: 3000 });
    const colors = pal.length ? pal.map((c) => c.hex) : [p.ink];
    const palRGB = colors.map(hexToRgb);
    const rThin = Math.max(1.2, Math.max(spU * 0.55, w * 1.1) * uA); // too narrow to hatch → drawn solid
    const { label, thick } = regions(img, A, palRGB, rThin);
    const lumOf = colors.map((h) => luminance(h));
    const bounds = maskBounds(Float32Array.from(label, (l) => (l >= 0 ? 1 : 0)), A, A, 0.5);
    if (bounds.empty) return createCanvas(S, S);

    // the darkest logo colour draws the outlines (or the ink, if the logo has no dark)
    let darkest = 0;
    for (let k = 1; k < colors.length; k++) if (lumOf[k] < lumOf[darkest]) darkest = k;
    const lineInk = oneInk ? p.ink : lumOf[darkest] < 0.3 ? colors[darkest] : luminance(p.ink) < 0.3 ? p.ink : "#15171B";

    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.lineCap = "round";
    o.lineJoin = "round";

    // hand wobble: a smooth displacement field (S px)
    const amp = (0.6 + 5 * wob) * sc;
    const f = 1 / (55 * sc);
    const warpWith = (salt) => (x, y) => [
      x + amp * noise(x * f + salt * 7.1, y * f - salt * 3.3),
      y + amp * noise(x * f - 11.7 - salt * 5.9, y * f + 4.2 + salt * 2.1),
    ];

    /* ── 2. hatching per colour region (light colours first, dark on top) ── */
    const order = colors.map((_, k) => k).sort((a, b) => lumOf[b] - lumOf[a]);
    const area = new Int32Array(colors.length);
    for (let i = 0; i < n; i++) if (label[i] >= 0 && thick[i]) area[label[i]]++;
    const minArea = (spU * uA) * (spU * uA) * 1.5;
    const baseAngle = (-35 + (rand() - 0.5) * 16) * (Math.PI / 180);
    let ri = 0;
    for (const k of order) {
      if (area[k] < minArea) continue;
      // one ink: tone decides how much hatching (white → none, dark → cross-hatched)
      const L = lumOf[k];
      let layers = 1, color = colors[k], densMul = 1;
      if (oneInk) {
        if (L > 0.86) continue;
        color = p.ink;
        densMul = L > 0.6 ? 0.55 : 1;
        layers = L < 0.35 ? 2 : 1;
      } else if (p.tool === "ballpoint" && L < 0.4) layers = 2;
      // logo colours: a near-white area also gets a loose shading pass in a cool grey
      // marker, so it reads as drawn (not as bare paper) on light paper and light shirts
      const shadePass = !oneInk && L > 0.8;
      const shadeInk = shadePass ? mixHex("#FFFFFF", lineInk, 0.36) : null;
      const inside = (i) => label[i] === k && thick[i] === 1;
      for (let layer = 0; layer < layers + (shadePass ? 1 : 0); layer++) {
        const shading = layer >= layers;
        const ang = baseAngle + (rand() - 0.5) * 0.8 + (ri % 2 ? 0.35 : 0) + layer * (Math.PI / 2.3);
        const sp = (spU / densMul) * uA * (shading ? 1.7 : 1);
        const lines = hatch(inside, A, bounds, ang, sp, rand, sp * 0.45 * (0.4 + wob), 16 * uA);
        const warp = warpWith(ri * 3 + layer + 1);
        o.strokeStyle = shading ? shadeInk : color;
        for (const pts of lines) {
          const press = 0.78 + rand() * 0.4;               // uneven pressure
          o.lineWidth = w * sc * press * (shading ? 0.7 : 1);
          o.globalAlpha = tool.alpha * (0.85 + rand() * 0.15) * (shading ? 0.75 : 1);
          o.stroke(wobblyPath(pts, kS, warp, false));
        }
      }
      ri++;
    }
    o.globalAlpha = 1;

    /* ── 3. thin detail, redrawn by hand: the source's thin parts through the wobble ── */
    {
      const thinM = new Float32Array(A * A);
      for (let i = 0; i < n; i++) if (label[i] >= 0 && !thick[i]) thinM[i] = 1;
      // the thin mask, a touch generous, at W
      const sd = getPixels(small).data;
      const k = A / W;
      const layerImg = ctx2d(createCanvas(1, 1)).createImageData(W, W);
      const ld = layerImg.data;
      const inkRGB = hexToRgb(p.ink);
      const ampW = amp * kW * 1.3, fW = f / kW;
      // the wobble field is smooth: evaluate it on a coarse grid, interpolate per pixel
      const G = 8, gw = Math.ceil(W / G) + 2;
      const gx = new Float32Array(gw * gw), gy = new Float32Array(gw * gw);
      for (let r = 0; r < gw; r++) {
        for (let q = 0; q < gw; q++) {
          const x = q * G, y = r * G;
          gx[r * gw + q] = ampW * noise(x * fW + 7.1, y * fW - 3.3);
          gy[r * gw + q] = ampW * noise(x * fW - 17.6, y * fW + 6.3);
        }
      }
      // summed-area table of the thin mask (A) → skip blocks with nothing thin nearby
      const sat = new Int32Array((A + 1) * (A + 1));
      for (let y = 0; y < A; y++) {
        let row = 0;
        for (let x = 0; x < A; x++) {
          row += thinM[y * A + x];
          sat[(y + 1) * (A + 1) + x + 1] = sat[y * (A + 1) + x + 1] + row;
        }
      }
      const pad = Math.ceil(ampW) + 2;
      for (let by = 0; by < W; by += G) {
        for (let bx = 0; bx < W; bx += G) {
          const ax0 = clamp(Math.floor((bx - pad) * k), 0, A), ay0 = clamp(Math.floor((by - pad) * k), 0, A);
          const ax1 = clamp(Math.ceil((bx + G + pad) * k), 0, A), ay1 = clamp(Math.ceil((by + G + pad) * k), 0, A);
          const cnt = sat[ay1 * (A + 1) + ax1] - sat[ay0 * (A + 1) + ax1] - sat[ay1 * (A + 1) + ax0] + sat[ay0 * (A + 1) + ax0];
          if (!cnt) continue;
          const q0 = bx / G, r0 = by / G;
          const g00 = r0 * gw + q0;
          for (let y = by; y < Math.min(W, by + G); y++) {
            const ty = (y - by) / G;
            for (let x = bx; x < Math.min(W, bx + G); x++) {
              const tx = (x - bx) / G;
              const dx = (gx[g00] * (1 - tx) + gx[g00 + 1] * tx) * (1 - ty) + (gx[g00 + gw] * (1 - tx) + gx[g00 + gw + 1] * tx) * ty;
              const dy = (gy[g00] * (1 - tx) + gy[g00 + 1] * tx) * (1 - ty) + (gy[g00 + gw] * (1 - tx) + gy[g00 + gw + 1] * tx) * ty;
              const xi = clamp(Math.round(x + dx), 0, W - 1), yi = clamp(Math.round(y + dy), 0, W - 1);
              const ai = Math.min(A - 1, (yi * k) | 0) * A + Math.min(A - 1, (xi * k) | 0);
              if (!thinM[ai]) continue;
              const j = (yi * W + xi) * 4;
              const a = sd[j + 3];
              if (!a) continue;
              const o4 = (y * W + x) * 4;
              if (oneInk) {
                const L = (0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2]) / 255;
                const t = smoothstep(0.86, 0.45, L);
                if (t <= 0) continue;
                ld[o4] = inkRGB[0]; ld[o4 + 1] = inkRGB[1]; ld[o4 + 2] = inkRGB[2];
                ld[o4 + 3] = a * t;
              } else {
                ld[o4] = sd[j]; ld[o4 + 1] = sd[j + 1]; ld[o4 + 2] = sd[j + 2]; ld[o4 + 3] = a;
              }
            }
          }
        }
      }
      const c = createCanvas(W, W);
      ctx2d(c).putImageData(layerImg, 0, 0);
      o.imageSmoothingEnabled = true;
      o.imageSmoothingQuality = "high";
      o.globalAlpha = Math.min(1, tool.alpha + 0.12);
      o.drawImage(c, 0, 0, S, S);
      o.globalAlpha = 1;
    }

    /* ── 4. the silhouette, traced 1–3 times with jitter and uneven pressure ── */
    {
      const sil = new Float32Array(n);
      for (let i = 0; i < n; i++) sil[i] = label[i] >= 0 ? 1 : 0;
      // tiny shapes (letters, stars in a crest) are not traced: a fat pen would blot them
      const minSpan = 70 * uA;
      const contours = traceContours(sil, A, A, 0.5, 0.6)
        .filter((c) => {
          if (c.length <= 6) return false;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const [x, y] of c) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          return Math.max(x1 - x0, y1 - y0) >= minSpan;
        })
        .map((c) => resample(c, Math.max(1.5, 9 * uA)));
      const lw = Math.max(1.2, (p.tool === "ballpoint" ? 3 : w * 0.55) * sc);
      o.strokeStyle = lineInk;
      for (let pass = 0; pass < p.passes; pass++) {
        const warp = warpWith(40 + pass * 13);
        const off = pass * (1.2 + 2.4 * wob) * sc;
        for (const c of contours) {
          if (c.length < 4) continue;
          // each pass starts somewhere else and overshoots its start a little (hand-drawn)
          const m = c.length;
          const s0 = (rand() * m) | 0;
          const over = Math.max(2, Math.round(m * (0.03 + rand() * 0.05)));
          const pts = [];
          for (let q = 0; q < m + over; q++) pts.push(c[(s0 + q) % m]);
          const shifted = (x, y) => {
            const [a, b] = warp(x, y);
            return [a + off * Math.cos(pass * 2.1), b + off * Math.sin(pass * 2.1)];
          };
          o.lineWidth = lw * (0.85 + rand() * 0.35);
          o.globalAlpha = pass === 0 ? 0.95 : 0.6 + rand() * 0.2;
          o.stroke(wobblyPath(pts, kS, shifted, false));
        }
      }
      o.globalAlpha = 1;
    }

    /* ── 5. doodles in the margin: a star, sparkles, an underline scribble ── */
    {
      const rand = rng(hashSeed("scribble-doodles", ctx.seed)); // own stream: same doodles at any size
      const od = outsideDistance(Float32Array.from(label, (l) => (l >= 0 ? 1 : 0)), A, A, 0.5);
      const free = (x, y, r) => {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi - r < 6 * uA || yi - r < 6 * uA || xi + r > A - 6 * uA || yi + r > A - 6 * uA) return false;
        return od[yi * A + xi] > r + 10 * uA;
      };
      // doodles in a team colour that reads on paper and on most garments (not near-white)
      const pal = ctx.palette || {};
      const doodle = [pal.secondary, pal.primary, pal.accent].find((h) => h && luminance(h) > 0.04 && luminance(h) < 0.75) || lineInk;
      const accentA = oneInk ? p.ink : doodle;
      const accentB = oneInk ? p.ink : doodle;
      const dl = Math.max(1.2, (p.tool === "ballpoint" ? 2.6 : w * 0.5) * sc);
      const bx0 = bounds.x0, bx1 = bounds.x1, by0 = bounds.y0, by1 = bounds.y1;
      // star: top-right corner region
      const tryPlace = (cands, r) => cands.find(([x, y]) => free(x, y, r));
      const starR = 34 * uA;
      const st = tryPlace([[bx1 + 8 * uA, by0 - 4 * uA], [bx1 - 10 * uA, by0 - 30 * uA], [bx1 + 30 * uA, by0 + 30 * uA], [bx1 + 20 * uA, (by0 + by1) / 2]], starR);
      o.strokeStyle = accentB;
      o.lineWidth = dl;
      if (st) {
        for (let pass = 0; pass < 2; pass++) {
          const path = new Path2D();
          starPath(path, st[0] * kS + pass * 2 * sc, st[1] * kS + pass * 1.5 * sc, starR * kS, 0.15 + pass * 0.08, 0.12 * (0.3 + wob), rand);
          o.globalAlpha = pass ? 0.65 : 0.95;
          o.stroke(path);
        }
      }
      // sparkles: top-left
      o.fillStyle = accentA;
      const sp1 = tryPlace([[bx0 - 6 * uA, by0 + 10 * uA], [bx0 + 10 * uA, by0 - 22 * uA], [bx0 - 20 * uA, by0 + 50 * uA]], 22 * uA);
      if (sp1) {
        const path = new Path2D();
        sparklePath(path, sp1[0] * kS, sp1[1] * kS, 24 * uA * kS);
        sparklePath(path, (sp1[0] + 30 * uA) * kS, (sp1[1] + 26 * uA) * kS, 11 * uA * kS);
        o.globalAlpha = 0.95;
        o.fill(path);
      }
      // underline scribble: a loopy line under the artwork
      const uy = by1 + 26 * uA;
      if (uy < A - 16 * uA) {
        const x0 = lerp(bx0, bx1, 0.18), x1 = lerp(bx0, bx1, 0.82);
        const path = new Path2D();
        // a quick back-and-forth zig-zag, each stroke a little different
        const zz = Math.max(5, Math.round((x1 - x0) / (16 * uA)));
        const hgt = 10 * uA;
        let x = x0, y = uy;
        path.moveTo(x * kS, y * kS);
        for (let i = 0; i < zz; i++) {
          const dx = ((x1 - x0) / zz) * (0.7 + rand() * 0.6);
          x = Math.min(x1, x + dx);
          y = uy + (i % 2 ? -1 : 1) * hgt * (0.35 + rand() * 0.35) + (rand() - 0.5) * 2 * uA;
          path.lineTo(x * kS, y * kS);
        }
        o.strokeStyle = oneInk ? p.ink : doodle;
        o.lineWidth = dl;
        o.globalAlpha = 0.9;
        o.stroke(path);
      }
      o.globalAlpha = 1;
    }

    /* ── 6. tooth: the paper texture breaks up the ink ── */
    if (tool.grain > 0) {
      const tile = toothTile(seed, tool.grain);
      o.save();
      o.globalCompositeOperation = "destination-out";
      const pat = o.createPattern(tile, "repeat");
      // tooth size in units, so a preview and an export match
      const k = Math.max(0.35, sc * 1.1 * (tool.tooth || 1));
      pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      o.fillStyle = pat;
      o.fillRect(0, 0, S, S);
      o.restore();
    }
    return out;
  },
};
