// Mascot Lab — shared helpers for the "press" effects (photocopy, distress, stamp,
// inkbleed, grunge): reading the logo at a work size, one-ink separations that survive
// white / pale logos, unit-anchored noise and grain maps (the same texture at 384 and
// 2048), coverage-calibrated thresholds and small raster utilities.
//
// Conventions (same as core.js): maps are Float32Array(W*W) row-major; "units" are
// 1024-canvas px, so a feature of F units is F·u px at the work size (u = px per unit).
// Not an effect module: lives outside effects/ so the registry never loads it.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, smoothstep, makeNoise2D, fbm, rng,
  hexToRgb, luminance, contrastRatio, insideDistance, outsideDistance,
} from "../core.js";

/* ───────────────────────────── hashing / grain ───────────────────────────── */

/** hash01(x, y, s) — integer lattice hash → [0, 1). Deterministic, allocation-free. */
export function hash01(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bilinearly interpolated uniform noise piles up around 0.5; remap through its CDF so a
// threshold at q really keeps a fraction q of the grain.
let CDF = null;
function grainCDF() {
  if (CDF) return CDF;
  const r = rng(12345);
  const H = new Float64Array(512);
  const N = 120000;
  for (let k = 0; k < N; k++) {
    const a = r(), b = r(), c = r(), d = r(), fx = r(), fy = r();
    const v = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    H[Math.min(511, (v * 512) | 0)]++;
  }
  CDF = new Float32Array(513);
  let acc = 0;
  for (let i = 0; i < 512; i++) { CDF[i] = acc / N; acc += H[i]; }
  CDF[512] = 1;
  return CDF;
}

/**
 * grainMap(W, u, cellU, seed) → Float32Array W² uniform in [0, 1): value noise with one
 * random value every `cellU` units (anchored in unit space), bilinear, CDF-flattened.
 * Cells smaller than a pixel fall back to one hash per pixel.
 */
export function grainMap(W, u, cellU, seed) {
  const out = new Float32Array(W * W);
  const c = cellU * u;
  if (c <= 1.05) {
    for (let y = 0, i = 0; y < W; y++) for (let x = 0; x < W; x++, i++) out[i] = hash01(x, y, seed);
    return out;
  }
  const cdf = grainCDF();
  const gw = Math.ceil(W / c) + 2;
  const g = new Float32Array(gw * gw);
  for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = hash01(i, j, seed);
  const ix = new Int32Array(W), fx = new Float32Array(W);
  for (let x = 0; x < W; x++) { const t = (x + 0.5) / c; ix[x] = t | 0; fx[x] = t - (t | 0); }
  for (let y = 0; y < W; y++) {
    const t = (y + 0.5) / c, j = t | 0, fy = t - j, r0 = j * gw, r1 = r0 + gw, row = y * W;
    for (let x = 0; x < W; x++) {
      const i0 = ix[x], f = fx[x];
      const a = g[r0 + i0], b = g[r0 + i0 + 1], cc = g[r1 + i0], d = g[r1 + i0 + 1];
      const v = ((a + (b - a) * f) * (1 - fy) + (cc + (d - cc) * f) * fy) * 512;
      const vi = v | 0;
      out[row + x] = cdf[vi] + (cdf[vi + 1] - cdf[vi]) * (v - vi);
    }
  }
  return out;
}

/* ───────────────────────────── smooth noise maps ───────────────────────────── */

/**
 * noiseMap(W, u, featU, seed, opts) → Float32Array W² of fbm in ≈[-1, 1]: features of
 * ≈featU units, evaluated on a coarse grid (featU/4 units, ≥ 1 px) and bilinearly
 * interpolated. opts: { octaves = 3, sx = 1, sy = 1, angle = 0 (rad), gain = 0.5 } —
 * sx / sy stretch the noise (sx < 1 = longer along x), angle rotates the stretch.
 */
export function noiseMap(W, u, featU, seed, { octaves = 3, sx = 1, sy = 1, angle = 0, gain = 0.5, grid } = {}) {
  const nz = makeNoise2D(seed);
  const minFeat = featU * Math.min(sx > 0 ? 1 / sx : 1, sy > 0 ? 1 / sy : 1);
  const g = grid || clamp((minFeat * u) / 4, 1, 24);
  const gw = Math.ceil(W / g) + 2;
  const G = new Float32Array(gw * gw);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let j = 0; j < gw; j++) {
    const Y = (j * g) / u;
    for (let i = 0; i < gw; i++) {
      const X = (i * g) / u;
      const rx = X * ca + Y * sa, ry = -X * sa + Y * ca;
      G[j * gw + i] = fbm(nz, (rx * sx) / featU, (ry * sy) / featU, octaves, 2, gain);
    }
  }
  if (g === 1) {
    const out = new Float32Array(W * W);
    for (let y = 0; y < W; y++) out.set(G.subarray(y * gw, y * gw + W), y * W);
    return out;
  }
  return gridUpsample(G, gw, g, W);
}

/** Bilinear upsample of a grid with a point every g px (point 0 at px 0) to W×W. */
function gridUpsample(G, gw, g, W) {
  const out = new Float32Array(W * W);
  const ix = new Int32Array(W), fx = new Float32Array(W);
  for (let x = 0; x < W; x++) { const t = x / g; ix[x] = Math.min(gw - 2, t | 0); fx[x] = t - ix[x]; }
  for (let y = 0; y < W; y++) {
    const t = y / g, j = Math.min(gw - 2, t | 0), fy = t - j, r0 = j * gw, r1 = r0 + gw, row = y * W;
    for (let x = 0; x < W; x++) {
      const i0 = ix[x], f = fx[x];
      const a = G[r0 + i0], b = G[r0 + i0 + 1], c = G[r1 + i0], d = G[r1 + i0 + 1];
      out[row + x] = (a + (b - a) * f) * (1 - fy) + (c + (d - c) * f) * fy;
    }
  }
  return out;
}

/** noise1D(len, u, featU, seed, octaves = 3) → Float32Array(len) fbm along one axis (≈[-1, 1]). */
export function noise1D(len, u, featU, seed, octaves = 3) {
  const nz = makeNoise2D(seed);
  const out = new Float32Array(len);
  for (let k = 0; k < len; k++) out[k] = fbm(nz, (k / u) / featU, 3.7, octaves);
  return out;
}

/* ───────────────────────────── resampling ───────────────────────────── */

/** upsample(m, A, W, mul = 1) — bilinear A×A → W×W (pixel centres aligned), × mul. */
export function upsample(m, A, W, mul = 1) {
  if (A === W) {
    if (mul === 1) return m;
    const o = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) o[i] = m[i] * mul;
    return o;
  }
  const out = new Float32Array(W * W);
  const k = A / W;
  const xi = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const f = clamp((x + 0.5) * k - 0.5, 0, A - 1.001);
    xi[x] = f | 0; xf[x] = f - (f | 0);
  }
  for (let y = 0; y < W; y++) {
    const fy = clamp((y + 0.5) * k - 0.5, 0, A - 1.001);
    const y0 = fy | 0, ty = fy - y0, r0 = y0 * A, r1 = r0 + A, row = y * W;
    for (let x = 0; x < W; x++) {
      const i0 = xi[x], tx = xf[x];
      const a = m[r0 + i0], b = m[r0 + i0 + 1], c = m[r1 + i0], d = m[r1 + i0 + 1];
      out[row + x] = ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * mul;
    }
  }
  return out;
}

/** downsample(m, W, A) — box-average W×W → A×A (A ≤ W). */
export function downsample(m, W, A) {
  if (A === W) return m;
  const out = new Float32Array(A * A);
  const k = W / A;
  for (let y = 0; y < A; y++) {
    const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
    for (let x = 0; x < A; x++) {
      const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += m[yy * W + xx];
      out[y * A + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** toSize(canvas, S) — the W×W work canvas as an S×S result (smooth upscale when W < S). */
export function toSize(canvas, S) {
  if (canvas.width === S) return canvas;
  const out = createCanvas(S, S);
  const o = ctx2d(out);
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.drawImage(canvas, 0, 0, S, S);
  return out;
}

/** Work size for per-pixel passes: the full canvas up to 1024 px. */
export const workSize = (S) => Math.min(S, 1024);

/* ───────────────────────────── reading the logo ───────────────────────────── */

/**
 * readLogo(src, W) → { W, canvas, data, alpha, lum, chroma, opaque }: the source at W
 * with per-pixel alpha, Rec.601 luma (0..1) and chroma (max − min, 0..1).
 */
export function readLogo(src, W) {
  const canvas = W === src.width ? src : resizeCanvas(src, W, W);
  const data = getPixels(canvas).data;
  const n = W * W;
  const alpha = new Float32Array(n), lum = new Float32Array(n), chroma = new Float32Array(n);
  let opaque = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j + 3] / 255;
    if (a <= 0) { lum[i] = 1; continue; }
    alpha[i] = a;
    opaque += a;
    const r = data[j], g = data[j + 1], b = data[j + 2];
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    chroma[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  return { W, canvas, data, alpha, lum, chroma, opaque };
}

/**
 * inkDensity(logo, { chromaWeight = 0.45, lo = 0.12, hi = 0.62 }) → { ink, silhouette }:
 * how much ONE dark ink a pixel would take in a one-colour separation (dark and saturated
 * inks print, white and pale inks knock out). A logo with almost nothing to print (a
 * white mark, a pale wordmark) prints its silhouette instead (silhouette = true).
 */
export function inkDensity(logo, { chromaWeight = 0.45, lo = 0.12, hi = 0.62, minShare = 0.12 } = {}) {
  const { alpha, lum, chroma } = logo;
  const n = alpha.length;
  const ink = new Float32Array(n);
  let inked = 0;
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a <= 0) continue;
    const v = (1 - lum[i]) + chromaWeight * chroma[i];
    const k = smoothstep(lo, hi, v);
    ink[i] = a * k;
    inked += ink[i];
  }
  if (logo.opaque > 0 && inked < logo.opaque * minShare) {
    ink.set(alpha);
    return { ink, silhouette: true };
  }
  return { ink, silhouette: false };
}

/**
 * quantileOf(values, weights, q, step = 1) — the value below which a fraction q of the
 * (weighted) samples lie; samples with weight ≤ 0.5 are ignored. Used to calibrate a
 * noise threshold to an exact coverage over the artwork.
 */
export function quantileOf(values, weights, q, step = 1) {
  // O(n) histogram quantile (2048 bins between the sample min and max, linear inside a bin)
  let lo = Infinity, hi = -Infinity, cnt = 0;
  for (let i = 0; i < values.length; i += step) {
    if (weights && !(weights[i] > 0.5)) continue;
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    cnt++;
  }
  if (!cnt) return 0;
  if (!(hi > lo)) return lo;
  const B = 2048, H = new Uint32Array(B), k = (B - 1) / (hi - lo);
  for (let i = 0; i < values.length; i += step) {
    if (weights && !(weights[i] > 0.5)) continue;
    H[((values[i] - lo) * k) | 0]++;
  }
  const target = clamp(q) * cnt;
  let acc = 0;
  for (let b = 0; b < B; b++) {
    if (acc + H[b] >= target) return lo + (b + (H[b] ? (target - acc) / H[b] : 0)) / k;
    acc += H[b];
  }
  return hi;
}

/** bounds(mask, W, thr = 0.1) → { x0, y0, x1, y1, w, h, cx, cy, empty } of mask > thr. */
export function bounds(mask, W, thr = 0.1) {
  let x0 = W, y0 = W, x1 = -1, y1 = -1;
  for (let y = 0; y < W; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (mask[row + x] > thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: W, y1: W, w: W, h: W, cx: W / 2, cy: W / 2, empty: true };
  x1 += 1; y1 += 1;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, empty: false };
}

/** shift(m, W, dx, dy) → new map with m moved by integer (dx, dy) px (zeros fill in). */
export function shift(m, W, dx, dy) {
  dx = Math.round(dx); dy = Math.round(dy);
  const out = new Float32Array(W * W);
  for (let y = Math.max(0, dy); y < Math.min(W, W + dy); y++) {
    const sy = y - dy;
    const x0 = Math.max(0, dx), x1 = Math.min(W, W + dx);
    out.set(m.subarray(sy * W + x0 - dx, sy * W + x1 - dx), y * W + x0);
  }
  return out;
}

/**
 * distanceNear(mask, W, side, pad, A = W) → Float32Array W² of px distances (W px), from
 * an exact EDT run only on the mask's bounding box grown by `pad` px, at resolution A
 * (≤ W, bilinearly upsampled). side "outside": distance from the shape (0 inside, `far`
 * beyond the box); "inside": distance to the edge (0 outside). Much cheaper than a full
 * canvas EDT for small or downsampled shapes.
 */
export function distanceNear(mask, W, side, pad, A = W) {
  const far = side === "outside" ? 1e6 : 0;
  const m = A === W ? mask : downsample(mask, W, A);
  const k = A / W;
  const b = bounds(m, A, 0.02);
  const out = new Float32Array(W * W);
  if (far) out.fill(far);
  if (b.empty) return out;
  const p = Math.ceil(pad * k) + 2;
  const x0 = Math.max(0, b.x0 - p), y0 = Math.max(0, b.y0 - p);
  const x1 = Math.min(A, b.x1 + p), y1 = Math.min(A, b.y1 + p);
  const cw = x1 - x0, ch = y1 - y0;
  const sub = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) sub.set(m.subarray((y + y0) * A + x0, (y + y0) * A + x1), y * cw);
  const d = side === "outside" ? outsideDistance(sub, cw, ch, 0.5) : insideDistance(sub, cw, ch, 0.5);
  // bilinear upsample of the crop only (pixel centres aligned), distances back in W px
  const mul = W / A;
  const X0 = Math.floor(x0 / k), X1 = Math.min(W, Math.ceil(x1 / k));
  const Y0 = Math.floor(y0 / k), Y1 = Math.min(W, Math.ceil(y1 / k));
  for (let y = Y0; y < Y1; y++) {
    const fy = clamp((y + 0.5) * k - 0.5 - y0, 0, ch - 1.001);
    const yi = fy | 0, ty = fy - yi, r0 = yi * cw, r1 = Math.min(ch - 1, yi + 1) * cw;
    for (let x = X0; x < X1; x++) {
      const fx = clamp((x + 0.5) * k - 0.5 - x0, 0, cw - 1.001);
      const xi = fx | 0, tx = fx - xi, xj = Math.min(cw - 1, xi + 1);
      const a = d[r0 + xi], bb = d[r0 + xj], c = d[r1 + xi], e = d[r1 + xj];
      out[y * W + x] = ((a + (bb - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty) * mul;
    }
  }
  return out;
}

/* ───────────────────────────── inks ───────────────────────────── */

/** The near-black "toner" ink of a palette: its dark role when it really is dark. */
export function tonerOf(palette) {
  const d = palette?.dark;
  return d && luminance(d) < 0.03 ? d : "#111214";
}

/**
 * readableOn(hex, stage, palette, minRatio = 1.6) — `hex` when it shows on `stage`
 * (a backdrop hex); else the palette colour (or near-black) that shows best.
 */
export function readableOn(hex, stage, palette, minRatio = 1.6) {
  if (contrastRatio(hex, stage) >= minRatio) return hex;
  const cands = ["primary", "dark", "secondary", "accent", "light"].map((r) => palette?.[r]).filter(Boolean);
  let best = "#111214", bc = contrastRatio(best, stage);
  for (const c of cands) { const k = contrastRatio(c, stage); if (k > bc + 0.4) { best = c; bc = k; } }
  return best;
}

/** rgb01(hex) → [r, g, b] in 0..1. */
export const rgb01 = (hex) => hexToRgb(hex).map((v) => v / 255);

/** Paper stage of the gallery cards (effects on "paper" are judged against it). */
export const PAPER_STAGE = "#ECEBE6";

/**
 * paintMask(W, fn) → Float32Array alpha of whatever `fn(ctx2d)` strokes / fills (in any
 * colour) on a fresh W×W canvas: lets effects draw vector marks (scratches, hairs, rings)
 * and use them as masks.
 */
export function paintMask(W, fn) {
  const c = createCanvas(W, W);
  const x = ctx2d(c);
  fn(x);
  const d = getPixels(c).data;
  const m = new Float32Array(W * W);
  for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = d[j] / 255;
  return m;
}
