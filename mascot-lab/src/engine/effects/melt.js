// "Melt" — the logo goes liquid. The lower part of the artwork sags (a vertical stretch that
// grows toward the bottom, uneven from column to column), the whole mark wobbles gently like
// heat haze, and seeded drips run off the lowest points of the silhouette: rounded tubes with
// a teardrop bulb and the odd detached droplet, filleted into the edge they hang from.
//
// The drips are built from the logo's own pixels: a drip pixel takes the colour found at the
// same distance inside the edge it hangs from, so an outlined mark keeps its outline wrapped
// around every drip and the fill colour runs down the core. Each drip gets a glossy liquid
// shading (soft side shade + a crisp specular streak and bulb highlight).
//
// Structure (after halftone.js):
//   1. one getImageData of the source; the warp (sag + wobble) is a backward map whose
//      displacement lives on a coarse grid, sampled premultiplied-bilinear → crisp at any S;
//   2. drip roots / sizes are chosen in artwork-relative units from rng(seed), so a 384
//      preview and a 2048 export drip in the same places;
//   3. the drip union (logo ∪ drips) is closed near each root (fillet) and distance-mapped
//      in a cropped band at S with core.js EDTs; one putImageData.
//   Transparent background; drips always end inside the canvas.
import {
  createCanvas, ctx2d, getPixels, rng, hashSeed, makeNoise2D, clamp, smoothstep,
  distanceField, resizeCanvas, hexToRgb, nearestColorIndex,
} from "../core.js";
import { extractPalette } from "../image.js";

const PAD = 0.022;          // keep everything this far (× S) from the canvas edge
const GRID = 8;             // displacement grid step (px at S)

/* ───────────────────────────── warp ───────────────────────────── */

/** Bounds of alpha ≥ thr in RGBA data (S×S). */
function alphaBounds(d, S, thr = 24) {
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (let y = 0; y < S; y++) {
    let row = y * S * 4 + 3;
    for (let x = 0; x < S; x++, row += 4) {
      if (d[row] >= thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Backward-map warp: out(x, y) = src(x + dx, y + dy), with (dx, dy) bilinear from a coarse
 * grid, premultiplied bilinear taps (no dark fringes). Only rows/cols in [x0,x1)×[y0,y1).
 */
function warpInto(sd, out, S, dxg, dyg, gw, x0, x1, y0, y1) {
  for (let y = y0; y < y1; y++) {
    const gy = y / GRID, iy = gy | 0, fy = gy - iy;
    const ra = iy * gw, rb = ra + gw;
    let o = (y * S + x0) * 4;
    for (let x = x0; x < x1; x++, o += 4) {
      const gx = x / GRID, ix = gx | 0, fx = gx - ix;
      const a = ra + ix, b = rb + ix;
      const dx = (dxg[a] + (dxg[a + 1] - dxg[a]) * fx) * (1 - fy) + (dxg[b] + (dxg[b + 1] - dxg[b]) * fx) * fy;
      const dy = (dyg[a] + (dyg[a + 1] - dyg[a]) * fx) * (1 - fy) + (dyg[b] + (dyg[b + 1] - dyg[b]) * fx) * fy;
      const px = x + dx, py = y + dy;
      const ix0 = Math.floor(px), iy0 = Math.floor(py);
      const tx = px - ix0, ty = py - iy0;
      let R = 0, G = 0, B = 0, A = 0;
      for (let k = 0; k < 4; k++) {
        const xx = ix0 + (k & 1), yy = iy0 + (k >> 1);
        if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
        const w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty);
        const j = (yy * S + xx) * 4;
        const aw = sd[j + 3] * w;
        if (aw === 0) continue;
        R += sd[j] * aw; G += sd[j + 1] * aw; B += sd[j + 2] * aw; A += aw;
      }
      if (A > 0.5) {
        out[o] = R / A; out[o + 1] = G / A; out[o + 2] = B / A; out[o + 3] = A;
      }
    }
  }
}

/* ───────────────────────────── drips ───────────────────────────── */

/** Lowest opaque point of every column (sub-pixel y of the 50% alpha crossing), −1 if empty. */
function bottomProfile(d, S) {
  const B = new Float32Array(S).fill(-1);
  for (let x = 0; x < S; x++) {
    for (let y = S - 1; y >= 0; y--) {
      const a = d[(y * S + x) * 4 + 3];
      if (a >= 128) {
        const below = y + 1 < S ? d[((y + 1) * S + x) * 4 + 3] : 0;
        B[x] = y + 0.5 + (a - 128) / Math.max(1, a - below);
        break;
      }
    }
  }
  return B;
}

/** Opaque run (alpha ≥ 128) length going up from row y in column x. */
function runUp(d, S, x, y, max) {
  let n = 0;
  for (let yy = y; yy >= 0 && n < max; yy--, n++) if (d[(yy * S + x) * 4 + 3] < 128) break;
  return n;
}
/** Opaque run width through (x, y) in its row. */
function runAcross(d, S, x, y, max) {
  if (y < 0 || y >= S || d[(y * S + x) * 4 + 3] < 128) return 0;
  let l = x, r = x;
  while (l > 0 && x - l < max && d[(y * S + l - 1) * 4 + 3] >= 128) l--;
  while (r < S - 1 && r - x < max && d[(y * S + r + 1) * 4 + 3] >= 128) r++;
  return r - l + 1;
}

/** Polynomial smooth minimum (k = blend radius). */
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}

/** Signed distance (px, negative inside) of one drip: tapered tube + teardrop bulb. */
function dripSD(dr, x, y) {
  const ax = Math.abs(x - dr.cx);
  const s = clamp((y - dr.root) / Math.max(1, dr.yb - dr.root));
  const h = dr.hw * (1 - 0.2 * Math.pow(s, 0.8));
  const body = Math.max(ax - h, dr.top - y, y - dr.yb);
  const bulb = Math.hypot(x - dr.cx, y - dr.yb) - dr.rb;
  return smin(body, bulb, dr.hw * 0.7);
}

/** Choose drip roots on the lowest points of the silhouette. */
function planDrips(d, S, B, n, p, seed, sc) {
  if (n <= 0) return [];
  let bx0 = -1, bx1 = -1, bmin = Infinity, bmax = -Infinity;
  for (let x = 0; x < S; x++) {
    if (B[x] < 0) continue;
    if (bx0 < 0) bx0 = x;
    bx1 = x;
    if (B[x] < bmin) bmin = B[x];
    if (B[x] > bmax) bmax = B[x];
  }
  if (bx0 < 0 || bx1 - bx0 < 4) return [];
  // smoothed profile → "lowness" (liquid gathers at local low points)
  const win = Math.max(2, Math.round(S * 0.035));
  const pre = new Float64Array(S + 1), cnt = new Int32Array(S + 1);
  for (let x = 0; x < S; x++) { pre[x + 1] = pre[x] + (B[x] >= 0 ? B[x] : 0); cnt[x + 1] = cnt[x] + (B[x] >= 0 ? 1 : 0); }
  const lowness = new Float32Array(S);
  for (let x = bx0; x <= bx1; x++) {
    if (B[x] < 0) continue;
    const a = Math.max(0, x - win), b = Math.min(S, x + win + 1);
    const c = cnt[b] - cnt[a];
    lowness[x] = c ? (B[x] - (pre[b] - pre[a]) / c) / (S * 0.02) : 0;
  }
  const span = bx1 - bx0;
  const inset = span * 0.06;
  const lo = bx0 + inset, hi = bx1 - inset;
  const hw0 = 17 * sc;
  const drips = [];
  const room = S * (1 - PAD);
  const melt = p.melt / 100;
  const Lmax = Math.min(S * 0.2, (bmax - (S * 0.14)) * 0.3 + S * 0.05) * (0.3 + 0.7 * melt);
  const slopeD = Math.max(2, Math.round(4 * sc));
  for (let k = 0; k < n; k++) {
    // one stream per stratum: a drip skipped at one size can't reshuffle the others
    const R = rng(hashSeed("melt-drip", seed, n, k));
    const s0 = lo + ((hi - lo) * k) / n, s1 = lo + ((hi - lo) * (k + 1)) / n;
    let best = -1, bestScore = -Infinity;
    const jitter = R();
    for (let x = Math.ceil(s0); x < s1; x++) {
      if (B[x] < 0) continue;
      const xl = Math.max(0, x - slopeD), xr = Math.min(S - 1, x + slopeD);
      if (B[xl] < 0 || B[xr] < 0) continue;
      const slope = Math.abs(B[xr] - B[xl]) / (xr - xl);
      if (slope > 1.4) continue;
      const depth = bmax > bmin ? (B[x] - bmin) / (bmax - bmin) : 1;
      const pos = (x - s0) / Math.max(1, s1 - s0);
      const score = clamp(lowness[x], -1, 2) * 0.9 + depth * 0.8 - slope * 0.5
        - Math.abs(pos - (0.25 + 0.5 * jitter)) * 1.2;
      if (score > bestScore) { bestScore = score; best = x; }
    }
    if (best < 0) continue;
    const cx = best + 0.5;
    const root = B[best];
    const ry = Math.floor(root - 0.5);
    let hw = hw0 * (0.55 + 0.9 * R());
    // fit the drip to the stroke it hangs from
    const thick = runUp(d, S, best, ry, Math.ceil(hw * 4));
    hw = Math.min(hw, thick * 0.85);
    const across = runAcross(d, S, best, Math.max(0, Math.round(ry - Math.min(hw, thick * 0.5))), Math.ceil(hw * 4));
    hw = Math.min(hw, across * 0.42);
    if (hw < 1.2 * sc) continue;            // 1024-units, so a preview drips where the export does
    if (drips.some((o) => Math.abs(o.cx - cx) < (o.hw + hw) * 1.6)) continue;
    const rb = hw * 1.22;
    const low = clamp(lowness[best], 0, 1.5);
    let L = Lmax * (0.32 + 0.68 * Math.pow(R(), 0.8)) * (1 + 0.35 * low);
    const drop = R() < 0.4;
    const dropR = rb * (0.42 + 0.18 * R());
    const dropGap = rb * (0.5 + 0.5 * R());
    const need = drop ? dropGap + dropR * 2 : 0;
    L = Math.min(L, room - root - need);
    if (L < rb * 1.6) {
      if (room - root < rb * 2.2) continue;
      L = Math.min(rb * 2.2, room - root);
    }
    const yb = root + L - rb;
    drips.push({
      cx, root, hw, rb, yb, end: root + L, col: best, top: root - Math.max(1, Math.min(hw * 2.2, thick * 0.8)),
      drop: drop && root + L + need <= room ? { y: root + L + dropGap + dropR, r: dropR } : null,
    });
  }
  return drips;
}

/** Premultiplied bilinear colour of RGBA data at (x, y) in index space → [r, g, b, a]. */
function sampleRGBA(d, S, x, y, out) {
  const ix0 = Math.floor(x), iy0 = Math.floor(y);
  const tx = x - ix0, ty = y - iy0;
  let R = 0, G = 0, B = 0, A = 0, W = 0;
  for (let k = 0; k < 4; k++) {
    const xx = ix0 + (k & 1), yy = iy0 + (k >> 1);
    if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
    const w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty);
    const j = (yy * S + xx) * 4;
    const aw = d[j + 3] * w;
    R += d[j] * aw; G += d[j + 1] * aw; B += d[j + 2] * aw; A += aw; W += w;
  }
  if (A > 0) { out[0] = R / A; out[1] = G / A; out[2] = B / A; out[3] = W > 0 ? A / W : 0; }
  else { out[3] = 0; }
  return out;
}

/**
 * Colour bands going up column x from row y (the drip root): → { start, len } of the longest
 * band (depth in px where the fill starts, and its length) within `max` px.
 */
function coreBand(d, S, x, y, max, minLen, major) {
  const bands = [];
  let segStart = 0, ref = false, pr = 0, pg = 0, pb = 0;
  const lim = Math.max(1, Math.min(max, y + 1));
  for (let k = 0; k < lim; k++) {
    const j = ((y - k) * S + x) * 4;
    const r = d[j], g = d[j + 1], b = d[j + 2];
    if (!ref) { pr = r; pg = g; pb = b; ref = true; continue; }
    const dd = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
    if (dd > 2400) {
      bands.push({ start: segStart, len: k - segStart });
      segStart = k; pr = r; pg = g; pb = b;
    }
  }
  bands.push({ start: segStart, len: lim - segStart });
  // a band's colour must be one of the logo's major inks (not a highlight or shading tone)
  const ok = (b) => {
    const j = ((y - Math.min(lim - 1, b.start + (b.len >> 1))) * S + x) * 4;
    return major(d[j], d[j + 1], d[j + 2]);
  };
  // the outermost band is the outline / shadow, unless it is most of the reach (a one-ink
  // mark); the fill is the first substantial band inside it (thin keylines are skipped)
  if (bands.length === 1 || bands[0].len >= lim * 0.5) return bands[0];
  const big = bands.find((b, i) => i > 0 && b.len >= minLen && ok(b));
  return big || bands.slice(1).reduce((a, b) => (b.len > a.len ? b : a));
}

/**
 * Glossy liquid shading of a drip at (x, y) → [shade multiplier, highlight 0..1]: the tube is
 * darker on its right, a crisp highlight streak runs down its left third, the bulb gets a
 * round shine at its upper left.
 */
function glossAt(dr, x, y, gloss) {
  const s = clamp((y - dr.root) / Math.max(1, dr.yb - dr.root));
  const h = Math.max(0.8, dr.hw * (1 - 0.2 * Math.pow(s, 0.8)));
  const bulbW = smoothstep(dr.yb - dr.rb * 1.1, dr.yb - dr.rb * 0.25, y);
  // tube
  const nx = (x - dr.cx) / h;
  const tubeShade = 1 - 0.3 * smoothstep(0.05, 1.05, nx) - 0.1 * smoothstep(-0.6, -1.05, nx);
  const aa = 0.7 / h; // ~1 px of anti-aliasing in normalized units
  const stripe = smoothstep(0.17 + aa, 0.17 - aa, Math.abs(nx + 0.45))
    * smoothstep(dr.root + dr.hw * 0.4, dr.root + dr.hw * 1.6, y)
    * (1 - smoothstep(dr.yb - dr.rb * 1.4, dr.yb - dr.rb * 0.7, y));
  // bulb
  const bx = (x - dr.cx) / dr.rb, by = (y - dr.yb) / dr.rb;
  const bulbShade = 1 - 0.32 * smoothstep(-0.1, 1.1, bx * 0.6 + by * 0.8);
  const ex = (bx + 0.38) / 0.2, ey = (by + 0.36) / 0.27;
  const ed = Math.sqrt(ex * ex + ey * ey);
  const baa = 1 / (dr.rb * 0.22);
  const dot = smoothstep(1 + baa, 1 - baa, ed);
  const shade = tubeShade + (bulbShade - tubeShade) * bulbW;
  const hi = Math.max(stripe * (1 - bulbW), dot * bulbW);
  return [1 - gloss * (1 - shade), hi * gloss * 0.9];
}

/** Shade + highlight a colour in place (premultiplied write into layer at o, coverage cov). */
function put(layer, o, r, g, b, cov, shade, hi) {
  r *= shade; g *= shade; b *= shade;
  layer[o] = (r + (255 - r) * hi) * cov;
  layer[o + 1] = (g + (255 - g) * hi) * cov;
  layer[o + 2] = (b + (255 - b) * hi) * cov;
  layer[o + 3] = cov;
}

/**
 * Paint drips under the warped logo in `wd` (RGBA at S). Each drip is smooth-unioned with the
 * logo's signed distance field (a fillet where it leaves the edge, nothing anywhere else), and
 * coloured by mapping its inside distance to a depth in the root column.
 */
function paintDrips(wd, S, drips, gloss, sc, major) {
  if (!drips.length) return;
  // band holding every drip: rows [by0, by1)
  let by0 = S, by1 = 0;
  for (const dr of drips) {
    by0 = Math.min(by0, Math.floor(dr.top - dr.hw * 2));
    by1 = Math.max(by1, Math.ceil((dr.drop ? dr.drop.y + dr.drop.r : dr.end) + 3));
  }
  by0 = Math.max(0, by0); by1 = Math.min(S, by1);
  const bh = by1 - by0, bw = S, n = bw * bh;
  if (bh <= 2) return;
  const A = new Float32Array(n);
  for (let i = 0, j = by0 * S * 4 + 3; i < n; i++, j += 4) A[i] = wd[j] / 255;
  const { inside, outside } = distanceField(A, bw, bh);
  const reach = Math.ceil(80 * sc + 4);
  const tmp = [0, 0, 0, 0];
  const layer = new Float32Array(n * 4); // premultiplied RGBA of the drip layer (0..255)
  for (const dr of drips) {
    // edge of the root column (lowest opaque pixel near the root level) and its opaque depth
    let found = -1;
    for (let y = Math.min(S - 1, Math.ceil(dr.root + 1)); y >= Math.max(0, dr.root - dr.hw * 3); y--) {
      if (wd[(y * S + dr.col) * 4 + 3] >= 128) { found = y; break; }
    }
    if (found < 0) continue;
    const rootE = found + 1;
    const depMax = runUp(wd, S, dr.col, found, reach);
    const rootDep = Math.max(0, depMax - 1.2);
    // the drip's core colour = the fill band right inside the outline; the bands outside it
    // (outline, keyline, shadow) are compressed into thin rings around the core
    const core = coreBand(wd, S, dr.col, found, depMax, Math.max(2, 10 * sc), major);
    const kq = clamp(core.start / Math.max(1, dr.hw * 0.42), 1, 8);
    const coreMax = core.start + Math.max(1, core.len * 0.5);
    const mapDepth = (e) => Math.min(e * kq < core.start ? e * kq : core.start + (e - core.start / kq), coreMax, rootDep);
    const k = Math.max(1.5, dr.hw * 0.9);
    const xa = Math.max(0, Math.floor(dr.cx - dr.rb - k - 2)), xb = Math.min(bw, Math.ceil(dr.cx + dr.rb + k + 2));
    const ya = Math.max(by0, Math.floor(dr.top - k)), yb = Math.min(by1, Math.ceil(dr.end + 2));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y - by0) * bw + x;
        if (A[i] >= 0.999) continue;                 // the logo covers it
        const sd = dripSD(dr, x + 0.5, y + 0.5);
        if (sd > k + 1) continue;
        const sl = outside[i] > 0 ? outside[i] - 0.5 : 0.5 - inside[i];
        const su = smin(sl, sd, k);
        const cov = clamp(0.5 - su);
        const o = i * 4;
        if (cov <= layer[o + 3]) continue;
        sampleRGBA(wd, S, dr.col, rootE - 1 - mapDepth(Math.max(0, -su)), tmp);
        if (tmp[3] < 1) sampleRGBA(wd, S, dr.col, rootE - 1, tmp);
        let shade = 1, hi = 0;
        if (gloss > 0 && sd < 0.5) {
          const w = clamp(0.5 - sd);
          [shade, hi] = glossAt(dr, x + 0.5, y + 0.5, gloss);
          shade = 1 + (shade - 1) * w; hi *= w;
        }
        put(layer, o, tmp[0], tmp[1], tmp[2], cov, shade, hi);
      }
    }
    // detached droplet: a small glossy bead in the drip's core colour
    if (dr.drop) {
      const { y: dy, r: dR } = dr.drop;
      sampleRGBA(wd, S, dr.col, rootE - 1 - Math.min(rootDep, core.start + core.len * 0.3), tmp);
      if (tmp[3] < 1) sampleRGBA(wd, S, dr.col, rootE - 1, tmp);
      const cr = tmp[0], cg = tmp[1], cb = tmp[2];
      const bead = { cx: dr.cx, root: dy - dR * 3, hw: dR * 0.8, yb: dy, rb: dR };
      for (let y = Math.max(by0, Math.floor(dy - dR - 2)); y < Math.min(by1, Math.ceil(dy + dR + 2)); y++) {
        for (let x = Math.max(0, Math.floor(dr.cx - dR - 2)); x < Math.min(bw, Math.ceil(dr.cx + dR + 2)); x++) {
          const cov = clamp(dR + 0.5 - Math.hypot(x + 0.5 - dr.cx, y + 0.5 - dy));
          if (cov <= 0) continue;
          const [shade, hi] = gloss > 0 ? glossAt(bead, x + 0.5, y + 0.5, gloss) : [1, 0];
          put(layer, ((y - by0) * bw + x) * 4, cr, cg, cb, cov, shade, hi);
        }
      }
    }
  }
  // composite: warped logo OVER the drip layer
  for (let i = 0, o = 0, j = by0 * S * 4; i < n; i++, o += 4, j += 4) {
    const la = layer[o + 3];
    if (la <= 0) continue;
    const a = wd[j + 3] / 255;
    const outA = a + la * (1 - a);
    const kk = 1 - a;
    wd[j] = (wd[j] * a + layer[o] * kk) / outA;
    wd[j + 1] = (wd[j + 1] * a + layer[o + 1] * kk) / outA;
    wd[j + 2] = (wd[j + 2] * a + layer[o + 2] * kk) / outA;
    wd[j + 3] = outA * 255;
  }
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "melt",
  name: "Melt",
  category: "digital",
  blurb: "Your logo going liquid: sagging, wobbling, dripping.",
  method: "Sublimation",
  stage: "mid",
  params: [
    { key: "melt", label: "Melt", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    { key: "drips", label: "Drips", type: "range", min: 0, max: 12, step: 1, default: 7 },
    { key: "wobble", label: "Wobble", type: "range", min: 0, max: 100, step: 1, default: 25, unit: "%" },
    { key: "gloss", label: "Gloss", type: "range", min: 0, max: 100, step: 1, default: 70, unit: "%" },
  ],
  presets: [
    { name: "Melt", params: { melt: 55, drips: 7, wobble: 25, gloss: 70 } },
    { name: "Slow drip", params: { melt: 85, drips: 4, wobble: 10, gloss: 80 } },
    { name: "Heat wave", params: { melt: 20, drips: 0, wobble: 85, gloss: 0 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const sd = getPixels(src).data;
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const bb = alphaBounds(sd, S);
    if (!bb) return out;
    const nz = makeNoise2D(hashSeed("melt-noise", ctx.seed));
    const melt = p.melt / 100, wob = p.wobble / 100;
    const H = bb.y1 - bb.y0;

    // sag at the bottom of the artwork, uneven across columns
    const A = melt * Math.min(S * 0.075, H * 0.28);
    // lift the artwork a little when drips need room below it
    const wantDrip = p.drips > 0 ? Math.min(S * 0.2, H * 0.3 + S * 0.05) * (0.3 + 0.7 * melt) * 0.8 : 0;
    const lift = clamp(bb.y1 + A * 1.4 + wantDrip - S * (1 - PAD), 0, S * 0.06);
    const W = wob * S * 0.02;

    const gw = Math.ceil(S / GRID) + 2, gh = gw;
    const dxg = new Float32Array(gw * gh), dyg = new Float32Array(gw * gh);
    const top = bb.y0 - lift;
    const lx = S * 0.2, wbx = S * 0.24, wby = S * 0.075, wb2 = S * 0.16;
    const colVar = new Float32Array(gw);
    for (let gx = 0; gx < gw; gx++) colVar[gx] = 1 + 0.45 * nz((gx * GRID) / lx, 3.7);
    for (let gy = 0; gy < gh; gy++) {
      const y = gy * GRID;
      const t = (y - top) / Math.max(1, H);
      const g = t <= 0.2 ? 0 : t >= 1 ? 1 : Math.pow(smoothstep(0.2, 1, t), 1.5);
      const prof = 0.35 + 0.65 * smoothstep(0, 1, t);
      for (let gx = 0; gx < gw; gx++) {
        const x = gx * GRID, i = gy * gw + gx;
        const sag = A * g * colVar[gx];
        dxg[i] = -W * prof * nz(x / wbx + 11.3, y / wby);
        dyg[i] = lift - sag - 0.45 * W * prof * nz(x / wb2 - 7.1, y / wb2 + 5.3);
      }
    }
    const img = o.createImageData(S, S);
    const wd = img.data;
    const m = Math.ceil(W * 1.2 + 3);
    warpInto(sd, wd, S, dxg, dyg, gw,
      Math.max(0, bb.x0 - m), Math.min(S, bb.x1 + m),
      Math.max(0, Math.floor(bb.y0 - lift - m)), Math.min(S, Math.ceil(bb.y1 - lift + A * 1.5 + m)));

    if (p.drips > 0) {                       // melt 0 still drips (short drips, no sag)
      const B = bottomProfile(wd, S);
      const drips = planDrips(wd, S, B, Math.round(p.drips), p, ctx.seed, sc);
      // major inks of the artwork (≥ 7% of its area): drip cores only take these
      const pal = extractPalette(resizeCanvas(src, Math.min(S, 256)), 6, { maxSamples: 8000 }).filter((c) => c.weight >= 0.07);
      const palRGB = pal.map((c) => hexToRgb(c.hex));
      const major = (r, g, b) => {
        if (!palRGB.length) return true;
        const c = palRGB[nearestColorIndex(r, g, b, palRGB)];
        return (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2 < 1600;
      };
      paintDrips(wd, S, drips, p.gloss / 100, sc, major);
    }
    o.putImageData(img, 0, 0);
    return out;
  },
};
