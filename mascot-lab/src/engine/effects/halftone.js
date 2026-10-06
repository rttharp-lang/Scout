// "Halftone" — THE REFERENCE EFFECT. A real AM screen: a rotated grid of vector dots
// whose area follows the logo's local ink coverage (sampled from a softened tone map),
// drawn as anti-aliased arcs / squares / line ribbons.
//
// The screen only takes the parts of the logo that are big enough to hold dots. The key
// line (dark inks: outlines, pupils, lettering strokes) stays solid unless an area is
// ~2.5 dot cells wide; lighter inks are screened as soon as a dot fits; hairline detail
// is always solid — the way a separator keeps the key line on its own plate. That keeps a
// detailed mascot recognizable at gallery size while it still reads as a dot screen.
// Line art (nothing wide enough to screen) gets a dot fill under its linework instead.
//
// Structure other effects copy:
//   1. work at a resolution tied to the feature size (tone maps at ~8 px per dot cell),
//      so a 384 preview and a 2048 export look the same apart from resolution;
//   2. compute float maps with core.js helpers (distance fields, blur, palette);
//   3. draw the artwork with vector primitives / smoothly upsampled masks at S;
//   4. transparent background, deterministic, team palette roles by default.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, sampleBilinear, clamp,
  smoothstep, hexToRgb, nearestColorIndex, maskBounds, insideDistance, outsideDistance, maskToCanvas,
  dilateMask, cloneCanvas,
} from "../core.js";
import { extractPalette } from "../image.js";

const TAU = Math.PI * 2;
const KEY_LUM = 0.4;      // inks darker than this are the key line
const KEY_ROOM = 1.25;    // key-line areas need a disc this many cells in radius to be screened
const INK_ROOM = 0.3;     // other inks are screened as soon as a dot fits
const TONE_LIGHT = 0.85;  // dot area for white / pale inks (color mode)
const TONE_DARK = 0.55;   // dot area for dark inks (color mode)
const GRADIENT = 0.55;    // ± dot-area swing from the top of the artwork to the bottom
const FILL_TONE = 0.42;   // dot area of the line-art fill

/* ───────────────────────────── analysis ───────────────────────────── */

/**
 * Split the logo into "thick" areas (get dots) and "thin" detail (printed solid).
 * Works at resolution D. Returns per-pixel maps at D.
 */
function structure(src, D, rKey, rAny, palRGB, minKey, minAny) {
  const img = D === src.width ? src : resizeCanvas(src, D, D);
  const { data } = getPixels(img);
  const n = D * D;
  const label = new Int8Array(n);
  const alpha = new Float32Array(n);
  const dark = new Float32Array(n);
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j + 3] / 255;
    alpha[i] = a;
    const r = data[j], g = data[j + 1], b = data[j + 2];
    dark[i] = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (a < 0.5) { label[i] = -1; continue; }
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let k = cache[key];
    if (k < 0) k = cache[key] = nearestColorIndex(r, g, b, palRGB);
    label[i] = k;
  }
  // interior = opaque pixels whose 4-neighbours share their label
  const interior = new Float32Array(n);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const i = y * D + x, l = label[i];
      if (l < 0) continue;
      if (x > 0 && label[i - 1] !== l) continue;
      if (x < D - 1 && label[i + 1] !== l) continue;
      if (y > 0 && label[i - D] !== l) continue;
      if (y < D - 1 && label[i + D] !== l) continue;
      interior[i] = 1;
    }
  }
  // distance of every pixel to its own region's edge
  const edge = insideDistance(interior, D, D);
  // the true edge lies half a pixel beyond the last boundary pixel — keeps decisions
  // identical between a 384 preview and a 2048 export
  for (let i = 0; i < n; i++) if (label[i] >= 0) edge[i] += 0.5;
  // dark inks (key line) need room for several dots before they are screened; lighter
  // inks are screened as soon as a dot fits
  const keyOf = palRGB.map(([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255 < KEY_LUM);
  const tKey = opening(edge, label, D, rKey, minKey);
  const tAny = opening(edge, label, D, rAny, minAny);
  const thick = new Float32Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0) thick[i] = keyOf[label[i]] ? tKey[i] : tAny[i];
  // a region is screened as a whole or not at all-ish: if only a sliver of a connected
  // region qualifies (the corners of a thin inline, say) keep the whole region solid
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let opaque = 0, screened = 0;
  for (let s = 0; s < n; s++) {
    const l = label[s];
    if (l < 0 || seen[s]) continue;
    let head = 0, tail = 0, sum = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++];
      sum += thick[i];
      const x = i % D;
      if (x > 0 && !seen[i - 1] && label[i - 1] === l) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < D - 1 && !seen[i + 1] && label[i + 1] === l) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= D && !seen[i - D] && label[i - D] === l) { seen[i - D] = 1; queue[tail++] = i - D; }
      if (i < n - D && !seen[i + D] && label[i + D] === l) { seen[i + D] = 1; queue[tail++] = i + D; }
    }
    if (sum > 0 && sum < tail * 0.3) { for (let q = 0; q < tail; q++) thick[queue[q]] = 0; sum = 0; }
    opaque += tail; screened += sum;
  }
  // line art: almost nothing is wide enough to hold dots (the caller adds a dot fill)
  const lineArt = opaque > 0 && screened < opaque * 0.12;
  return { img, data, label, alpha, dark, thick, edge, lineArt };
}

/**
 * Morphological opening of all regions at once: pixels covered by a disc of radius r that
 * fits inside their own region (edge = per-region edge distance). Cores smaller than
 * minArea px are dropped so no region gets a lonely dot or two. → 0..1 map, AA edge.
 */
function opening(edge, label, D, r, minArea) {
  const n = D * D;
  const core = new Float32Array(n);
  for (let i = 0; i < n; i++) core[i] = edge[i] > r ? 1 : 0;
  minArea = Math.max(4, minArea);
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!core[s] || seen[s]) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % D;
      if (x > 0 && core[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < D - 1 && core[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= D && core[i - D] && !seen[i - D]) { seen[i - D] = 1; queue[tail++] = i - D; }
      if (i < n - D && core[i + D] && !seen[i + D]) { seen[i + D] = 1; queue[tail++] = i + D; }
    }
    if (tail < minArea) for (let q = 0; q < tail; q++) core[queue[q]] = 0;
  }
  const toCore = outsideDistance(core, D, D);
  const thick = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (label[i] < 0) continue;
    const t = toCore[i];
    thick[i] = t === 0 ? 1 : smoothstep(r + 0.75, r - 0.75, t);
  }
  return thick;
}

/** Area-average a D×D float map down to W×W (W ≤ D). */
function downsample(map, D, W) {
  if (D === W) return map;
  const out = new Float32Array(W * W);
  const k = D / W;
  for (let y = 0; y < W; y++) {
    const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += map[yy * D + xx];
      out[y * W + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/**
 * Dot fill for line art (W×W, 0..1): the enclosed areas (holes not connected to the
 * canvas edge), or — for open line work — a soft offset shadow of the lines.
 */
function lineArtFill(alphaW, W, cellW) {
  const n = W * W;
  const outside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!outside[i] && alphaW[i] < 0.5) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((W - 1) * W + x); }
  for (let y = 0; y < W; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < n - W) push(i + W);
  }
  const fill = new Float32Array(n);
  let area = 0, inkArea = 0;
  for (let i = 0; i < n; i++) {
    inkArea += alphaW[i];
    if (!outside[i] && alphaW[i] < 0.5) { fill[i] = 1; area++; }
  }
  if (area > inkArea * 1.5) return fill;
  // open line work: offset shadow
  const grown = dilateMask(alphaW, W, W, cellW * 0.9);
  const dx = Math.round(cellW * 0.7);
  fill.fill(0);
  for (let y = dx; y < W; y++) for (let x = dx; x < W; x++) fill[y * W + x] = grown[(y - dx) * W + x - dx];
  return fill;
}

/* ───────────────────────────── drawing ───────────────────────────── */

/** Visit every screen cell center of a grid rotated by angleDeg, centered on the canvas. */
function eachCell(S, cell, angleDeg, fn) {
  const th = (angleDeg * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const N = Math.ceil(((S * Math.SQRT2) / 2 + cell) / cell);
  const cx = S / 2, cy = S / 2;
  for (let j = -N; j <= N; j++) {
    for (let i = -N; i <= N; i++) {
      const u = i * cell, v = j * cell;
      const x = cx + u * c - v * s, y = cy + u * s + v * c;
      if (x < -cell || y < -cell || x > S + cell || y > S + cell) continue;
      fn(x, y);
    }
  }
}

/**
 * Draw one screen. tone (W×W, 0..1 = dot area fraction) → vector dots grouped into one
 * Path2D per color; colorOf(xW, yW) → index into colors.
 */
function drawScreen(o, S, W, tone, { cell, angle, shape, colorOf, colors, maxCov = 1.2 }) {
  const k = W / S;
  const paths = colors.map(() => new Path2D());
  const th = (angle * Math.PI) / 180;
  const ca = Math.cos(th), sa = Math.sin(th);
  const minCov = 0.008;
  if (shape === "line") {
    // line screen: each grid row is a ribbon whose thickness follows the tone
    const step = cell / 3;
    const reach = (S * Math.SQRT2) / 2 + cell;
    const N = Math.ceil(reach / cell), M = Math.ceil(reach / step);
    for (let j = -N; j <= N; j++) {
      const v = j * cell;
      let run = null;
      const flush = () => {
        if (run && run.top.length > 2) {
          const p = paths[run.ci];
          p.moveTo(run.top[0], run.top[1]);
          for (let q = 2; q < run.top.length; q += 2) p.lineTo(run.top[q], run.top[q + 1]);
          for (let q = run.bot.length - 2; q >= 0; q -= 2) p.lineTo(run.bot[q], run.bot[q + 1]);
          p.closePath();
        }
        run = null;
      };
      for (let i = -M; i <= M; i++) {
        const u = i * step;
        const x = S / 2 + u * ca - v * sa, y = S / 2 + u * sa + v * ca;
        if (x < -cell || y < -cell || x > S + cell || y > S + cell) { flush(); continue; }
        const cov = sampleBilinear(tone, W, W, x * k, y * k);
        if (cov < minCov) {
          if (run) { run.top.push(x, y); run.bot.push(x, y); } // taper to a point
          flush();
          continue;
        }
        const ci = colorOf(x * k, y * k);
        const t = Math.min(cov, 1.02) * cell * 0.5;
        const tx = -sa * t, ty = ca * t;
        if (run && run.ci !== ci) { run.top.push(x + tx, y + ty); run.bot.push(x - tx, y - ty); flush(); }
        if (!run) { run = { ci, top: [], bot: [] }; }
        run.top.push(x + tx, y + ty);
        run.bot.push(x - tx, y - ty);
      }
      flush();
    }
  } else {
    eachCell(S, cell, angle, (x, y) => {
      const cov = sampleBilinear(tone, W, W, x * k, y * k);
      if (cov < minCov) return;
      const p = paths[colorOf(x * k, y * k)];
      if (shape === "square") {
        const h = (cell * Math.sqrt(Math.min(cov, 1.02))) / 2;
        const ax = ca * h, ay = sa * h, bx = -sa * h, by = ca * h;
        p.moveTo(x - ax - bx, y - ay - by);
        p.lineTo(x + ax - bx, y + ay - by);
        p.lineTo(x + ax + bx, y + ay + by);
        p.lineTo(x - ax + bx, y - ay + by);
        p.closePath();
      } else {
        const r = cell * Math.sqrt(Math.min(cov, maxCov) / Math.PI);
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, TAU);
      }
    });
  }
  for (let i = 0; i < colors.length; i++) {
    o.fillStyle = colors[i];
    o.fill(paths[i]);
  }
}

/** The D×D "thin detail" mask (1 − thick) smoothly scaled up to S as a canvas alpha. */
function thinMaskCanvas(st, D, S) {
  const nD = D * D;
  const m = new Float32Array(nD);
  for (let i = 0; i < nD; i++) m[i] = 1 - st.thick[i];
  const small = maskToCanvas(m, D, D, "#000000");
  if (D === S) return small;
  const big = createCanvas(S, S);
  const bx = ctx2d(big);
  bx.imageSmoothingEnabled = true;
  bx.imageSmoothingQuality = "high";
  bx.drawImage(small, 0, 0, S, S);
  return big;
}

/**
 * One ink plate of the source at full resolution: `ink` where the source darkness is in
 * [lo, hi] (soft 0.1 shoulders; hi = 1 means "lo and darker"), alpha from the source.
 */
function inkPlate(src, ink, lo, hi) {
  const S = src.width;
  const img = getPixels(src);
  const d = img.data;
  const [r, g, b] = hexToRgb(ink);
  for (let j = 0; j < d.length; j += 4) {
    if (d[j + 3] === 0) continue;
    const dk = 1 - (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
    const k = smoothstep(lo - 0.05, lo + 0.05, dk) * (hi >= 1 ? 1 : 1 - smoothstep(hi - 0.05, hi + 0.05, dk));
    d[j] = r; d[j + 1] = g; d[j + 2] = b;
    d[j + 3] = d[j + 3] * k;
  }
  const c = createCanvas(S, S);
  ctx2d(c).putImageData(img, 0, 0);
  return c;
}

/** Draw `layer` (S×S, may be modified) onto o, keeping only the thin detail (and the fade's screen). */
function paintSolid(o, layer, thinMask, clip) {
  const lx = ctx2d(layer);
  lx.globalCompositeOperation = "destination-in";
  lx.drawImage(thinMask, 0, 0);
  if (clip) lx.drawImage(clip, 0, 0);
  lx.globalCompositeOperation = "source-over";
  o.drawImage(layer, 0, 0);
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "halftone",
  name: "Halftone",
  category: "print",
  blurb: "Bold comic-book dot screen with crisp key lines.",
  method: "Screen print",
  stage: "mid",
  params: [
    {
      key: "mode", label: "Ink", type: "select", default: "color",
      options: [
        { value: "color", label: "Logo colors" },
        { value: "mono", label: "One ink" },
        { value: "duotone", label: "Two inks" },
      ],
    },
    { key: "dot", label: "Dot size", type: "range", min: 10, max: 48, step: 1, default: 22, unit: "px" },
    { key: "angle", label: "Screen angle", type: "range", min: 0, max: 90, step: 1, default: 45, unit: "°" },
    {
      key: "shape", label: "Dot shape", type: "select", default: "round",
      options: [
        { value: "round", label: "Round" },
        { value: "square", label: "Square" },
        { value: "line", label: "Line" },
      ],
    },
    { key: "ink", label: "Ink color", type: "color", default: "primary" },
    { key: "ink2", label: "Second ink", type: "color", default: "secondary" },
    { key: "fade", label: "Fade", type: "toggle", default: false },
  ],
  presets: [
    { name: "Comic color", params: { mode: "color", dot: 22, angle: 45, shape: "round", fade: false } },
    { name: "Mono ink", params: { mode: "mono", dot: 22, angle: 45, shape: "round", ink: "primary", fade: false } },
    { name: "Fade", params: { mode: "mono", dot: 26, angle: 45, shape: "round", ink: "primary", fade: true } },
    { name: "Duotone", params: { mode: "duotone", dot: 22, angle: 15, shape: "round", ink: "primary", ink2: "secondary", fade: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const cell = Math.max(2, p.dot * ctx.scale);
    // tone maps at ~8 px per dot cell (W); solid detail at up to 1024 px (D)
    const D = Math.min(S, 1024);
    let W = Math.round(clamp((S * 8) / cell, 96, Math.min(S, 768)));
    if (W > D * 0.85) W = D; // close enough: skip the resample
    const kW = W / S, kD = D / S;
    const cellW = cell * kW, cellD = cell * kD;
    const n = W * W;

    const small = resizeCanvas(src, W, W);
    const pal = extractPalette(small, 8, { maxSamples: 6000 });
    const colors = pal.length ? pal.map((c) => c.hex) : [p.ink];
    const palRGB = colors.map(hexToRgb);

    const st = structure(src, D, cellD * KEY_ROOM, cellD * INK_ROOM, palRGB, cellD * cellD * 1.5, cellD * cellD * 0.3);

    // fade: dot area falls off from the top of the artwork to the bottom; the solid detail
    // dissolves through the same screen (solid → holes → dots), like a gradient halftone
    let fadeRow = null;
    if (p.fade) {
      const b = maskBounds(st.alpha, D, D, 0.1);
      const y0 = b.y0 / kD, y1 = b.y1 / kD; // in output px
      fadeRow = new Float32Array(W);
      for (let y = 0; y < W; y++) fadeRow[y] = 1 - 0.95 * smoothstep(y0 + (y1 - y0) * 0.1, y1, (y + 0.5) / kW);
    }
    const thickW = downsample(st.thick, D, W);
    const alphaW = downsample(st.alpha, D, W);
    const darkW = downsample(st.dark, D, W);
    // line art has nothing wide enough to screen: give it a dot fill (enclosed areas, or
    // an offset shadow) printed in the line color, under the solid linework
    const fillW = st.lineArt ? lineArtFill(alphaW, W, cellW) : null;

    // tone gradient: dots grow toward the bottom of the artwork, the classic sports fade
    const gb = maskBounds(alphaW, W, W, 0.1);
    const gw = Math.max(1, gb.x1 - gb.x0), gh = Math.max(1, gb.y1 - gb.y0);
    const finish = (t) => {
      const m = blurMask(t, W, W, cellW * 0.28);
      for (let y = 0; y < W; y++) {
        const f = fadeRow ? fadeRow[y] : 1;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (fadeRow) { m[i] *= f; continue; }
          const g = clamp(((y - gb.y0) / gh) * 0.75 + ((x - gb.x0) / gw) * 0.25);
          m[i] *= 1 + GRADIENT * (g - 0.5) * 2;
        }
      }
      return m;
    };
    const screen = (tone, color, angle = p.angle) =>
      drawScreen(o, S, W, finish(tone), { cell, angle, shape: p.shape, colorOf: () => 0, colors: [color] });

    const out = createCanvas(S, S);
    const o = ctx2d(out);
    // the fade's screen for solid detail: full coverage at the top, dots at the bottom
    let fadeClip = null;
    if (fadeRow) {
      fadeClip = createCanvas(S, S);
      const fm = new Float32Array(n);
      for (let y = 0; y < W; y++) fm.fill(Math.min(1.9, fadeRow[y] * 1.9), y * W, y * W + W);
      drawScreen(ctx2d(fadeClip), S, W, fm, { cell, angle: p.angle, shape: p.shape, colorOf: () => 0, colors: ["#000"], maxCov: 1.9 });
    }

    if (p.mode === "mono" || p.mode === "duotone") {
      const two = p.mode === "duotone";
      const t1 = new Float32Array(n), t2 = two ? new Float32Array(n) : null;
      for (let i = 0; i < n; i++) {
        const a = alphaW[i] * thickW[i], d = darkW[i];
        if (two) {
          t1[i] = a * clamp((d - 0.2) / 0.7) * 0.85;                         // shadows → ink 1
          t2[i] = a * (0.18 + 0.52 * clamp(1 - Math.abs(d - 0.42) * 1.5));   // mids/lights → ink 2
        } else {
          t1[i] = a * (0.12 + 0.7 * Math.pow(clamp((d - 0.04) / 0.86), 0.65));
        }
      }
      if (fillW) {
        const f = new Float32Array(n);
        for (let i = 0; i < n; i++) f[i] = fillW[i] * FILL_TONE * (two ? 1 : 0.75);
        screen(f, two ? p.ink2 : p.ink, p.angle + (two ? 30 : 0));
      }
      if (two) screen(t2, p.ink2, p.angle + 30);
      o.globalCompositeOperation = two ? "multiply" : "source-over";
      screen(t1, p.ink);
      o.globalCompositeOperation = "source-over";
      // solid detail: dark → ink, mid → second ink (duotone), light → knocked out
      const thinMask = thinMaskCanvas(st, D, S);
      if (two) paintSolid(o, inkPlate(src, p.ink2, 0.23, 0.41), thinMask, fadeClip);
      paintSolid(o, inkPlate(src, p.ink, 0.41, 1), thinMask, fadeClip);
      return out;
    }

    // color mode: each dot takes the spot color under it; light inks get the biggest dots
    // so white and pale areas still read on any garment
    const t = new Float32Array(n);
    const sd = getPixels(small).data;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const chroma = (Math.max(sd[j], sd[j + 1], sd[j + 2]) - Math.min(sd[j], sd[j + 1], sd[j + 2])) / 255;
      const weight = TONE_DARK + (TONE_LIGHT - TONE_DARK) * (1 - darkW[i]) + 0.08 * chroma;
      t[i] = alphaW[i] * thickW[i] * weight;
    }
    if (fillW) {
      // line art: the fill prints in the second ink so the linework stays readable
      const f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = fillW[i] * FILL_TONE;
      screen(f, p.ink2);
    }
    // dot color = label of the nearest screened pixel (sampled at structure resolution)
    const reach = Math.max(1, Math.round(cellD * 0.6));
    const stp = Math.max(1, reach >> 2);
    const colorOf = (xw, yw) => {
      const x = Math.min(D - 1, Math.max(0, Math.round((xw / kW) * kD)));
      const y = Math.min(D - 1, Math.max(0, Math.round((yw / kW) * kD)));
      const i = y * D + x;
      if (st.label[i] >= 0 && st.thick[i] > 0.5) return st.label[i];
      let best = 0, bd = Infinity;
      for (let oy = -reach; oy <= reach; oy += stp) {
        const yy = y + oy;
        if (yy < 0 || yy >= D) continue;
        for (let ox = -reach; ox <= reach; ox += stp) {
          const xx = x + ox;
          if (xx < 0 || xx >= D) continue;
          const k = yy * D + xx;
          if (st.label[k] < 0 || st.thick[k] <= 0.5) continue;
          const dd = ox * ox + oy * oy;
          if (dd < bd) { bd = dd; best = st.label[k]; }
        }
      }
      return best;
    };
    drawScreen(o, S, W, finish(t), { cell, angle: p.angle, shape: p.shape, colors, colorOf });
    // solid detail on top, in the logo's own colors, from the full-resolution source
    paintSolid(o, cloneCanvas(src), thinMaskCanvas(st, D, S), fadeClip);
    return out;
  },
};
