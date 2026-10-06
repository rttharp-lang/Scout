// "Embroidered" — machine embroidery. The logo is reduced to a small thread palette;
// every color region is digitized like a real file: a fill of parallel thread rows
// (long satin stitches or short staggered tatami stitches, a per-region angle, gently
// curved rows), and a satin column around each region whose stitches turn with the edge.
// Each stitch is drawn as a thread: body, a shadow on its far side and a sheen line whose
// strength follows the thread's angle to the light (that angle-dependent glint is what
// makes embroidery read as embroidery). The whole piece is raised with a soft shadow;
// optionally it sits on a twill patch with a rolled merrow border.
//
// Structure (see halftone.js): fields at W ≤ 1024 (thread labels, per-region edge
// distance, traced region outlines) → vector stitches generated in S px and stroked at S.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, alphaMask, insideDistance, outsideDistance, blurMask,
  traceContours, contoursToPath, maskToCanvas, clamp, hexToRgb, rgbToHex,
  nearestColorIndex, makeNoise2D, hashSeed, luminance, contrastRatio, smoothstep,
} from "../core.js";
import { extractPalette } from "../image.js";

const DEG = Math.PI / 180;
const LIGHT = [-0.6, -0.8];              // direction toward the light (up-left)
const ANGLE_STEPS = [0, 90, 45, -45, 30, -60, 70, -20];

/* ───────────────────────────── analysis ───────────────────────────── */

/** Thread labels at W: palette quantization + a 3×3 majority filter (no 1-px slivers). */
function threadLabels(small, mask, W) {
  const tiny = resizeCanvas(small, Math.min(W, 160), Math.min(W, 160));
  let pal = extractPalette(tiny, 7, { maxSamples: 5000 }).filter((c) => c.weight > 0.004);
  if (!pal.length) pal = [{ hex: "#808080", weight: 1 }];
  const colors = pal.map((c) => hexToRgb(c.hex));
  const { data } = getPixels(small);
  const n = W * W;
  let label = new Int8Array(n);
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (mask[i] < 0.5) { label[i] = -1; continue; }
    const key = ((data[j] >> 3) << 10) | ((data[j + 1] >> 3) << 5) | (data[j + 2] >> 3);
    let k = cache[key];
    if (k < 0) k = cache[key] = nearestColorIndex(data[j], data[j + 1], data[j + 2], colors);
    label[i] = k;
  }
  // majority filter (2 passes): anti-aliased boundary pixels snap to a neighbour's thread
  const K = colors.length;
  const cnt = new Int32Array(K);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Int8Array(label);
    for (let y = 1; y < W - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, l = label[i];
        if (l < 0) continue;
        if (label[i - 1] === l && label[i + 1] === l && label[i - W] === l && label[i + W] === l) continue;
        cnt.fill(0);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const v = label[i + oy * W + ox]; if (v >= 0) cnt[v]++; }
        let best = l, bc = cnt[l];
        for (let k = 0; k < K; k++) if (cnt[k] > bc) { bc = cnt[k]; best = k; }
        out[i] = best;
      }
    }
    label = out;
  }
  // thread colour = mean of each region's interior pixels (AA edges drag cluster means)
  const sum = new Float64Array(K * 4);
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, l = label[i];
      if (l < 0 || label[i - 1] !== l || label[i + 1] !== l || label[i - W] !== l || label[i + W] !== l) continue;
      const j = i * 4;
      sum[l * 4] += data[j]; sum[l * 4 + 1] += data[j + 1]; sum[l * 4 + 2] += data[j + 2]; sum[l * 4 + 3]++;
    }
  }
  for (let k = 0; k < K; k++) {
    const c = sum[k * 4 + 3];
    if (c >= 8) colors[k] = hexToRgb(rgbToHex(sum[k * 4] / c, sum[k * 4 + 1] / c, sum[k * 4 + 2] / c));
  }
  return { label, colors };
}

/** Distance (W px) of every labelled pixel to the edge of its own region. */
function regionDistance(label, W) {
  const n = W * W;
  const interior = new Float32Array(n);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, l = label[i];
      if (l < 0) continue;
      if (x > 0 && label[i - 1] !== l) continue;
      if (x < W - 1 && label[i + 1] !== l) continue;
      if (y > 0 && label[i - W] !== l) continue;
      if (y < W - 1 && label[i + W] !== l) continue;
      interior[i] = 1;
    }
  }
  const d = insideDistance(interior, W, W);
  for (let i = 0; i < n; i++) if (label[i] >= 0) d[i] += 0.5;
  return d;
}

/**
 * Small colour areas enclosed by the logo (stitch dashes, pupils, small lettering — and
 * the anti-aliasing rings around them) are details: a digitizer runs the surrounding fill
 * straight under them and stitches the detail on top. → { base: labels with every detail
 * group merged into its dominant surround, det: labels of the detail pixels only (−1
 * elsewhere), count }.
 */
function splitDetails(label, W, maxArea) {
  const n = W * W;
  const base = new Int8Array(label);
  const det = new Int8Array(n).fill(-1);
  const small = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  const nb = new Int32Array(4);
  const nbs = (i) => {
    const x = i % W;
    nb[0] = x > 0 ? i - 1 : -1; nb[1] = x < W - 1 ? i + 1 : -1; nb[2] = i >= W ? i - W : -1; nb[3] = i < n - W ? i + W : -1;
    return nb;
  };
  // 1. small same-colour components (big ones stop growing once they pass maxArea)
  for (let s = 0; s < n; s++) {
    const l = label[s];
    if (l < 0 || seen[s]) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++];
      nbs(i);
      for (let q = 0; q < 4; q++) { const j = nb[q]; if (j >= 0 && !seen[j] && label[j] === l) { seen[j] = 1; queue[tail++] = j; } }
    }
    if (tail <= maxArea) for (let q = 0; q < tail; q++) small[queue[q]] = 1;
  }
  // 2. groups of touching small components → merged into their dominant surround
  seen.fill(0);
  const K = 128;
  const votes = new Int32Array(K);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (!small[s] || seen[s]) continue;
    let head = 0, tail = 0, open = false;
    votes.fill(0);
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++];
      nbs(i);
      for (let q = 0; q < 4; q++) {
        const j = nb[q];
        if (j < 0) { open = true; continue; }
        if (small[j]) { if (!seen[j]) { seen[j] = 1; queue[tail++] = j; } continue; }
        const lj = label[j];
        if (lj < 0) open = true; else votes[lj]++;
      }
    }
    if (open || tail > maxArea * 3) continue;
    let best = -1, bv = 0, tot = 0;
    for (let k = 0; k < K; k++) { tot += votes[k]; if (votes[k] > bv) { bv = votes[k]; best = k; } }
    if (best < 0 || bv < tot * 0.6) continue;
    count++;
    for (let q = 0; q < tail; q++) {
      const i = queue[q];
      if (label[i] === best) continue; // an AA sliver of the surround's own colour
      base[i] = best; det[i] = label[i];
    }
  }
  return { base, det, count };
}

/** Area-average a W×W map down to P×P. */
function areaDown(m, W, P) {
  const out = new Float32Array(P * P);
  const k = W / P;
  for (let y = 0; y < P; y++) {
    const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
    for (let x = 0; x < P; x++) {
      const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += m[yy * W + xx];
      out[y * P + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** Bilinear upsample of a P×P field to W×W (pixel centres aligned), times mul. */
function bilinearUp(m, P, W, mul) {
  const out = new Float32Array(W * W);
  const k = P / W;
  const xi = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const f = clamp((x + 0.5) * k - 0.5, 0, P - 1.001);
    xi[x] = f | 0; xf[x] = f - (f | 0);
  }
  for (let y = 0; y < W; y++) {
    const fy = clamp((y + 0.5) * k - 0.5, 0, P - 1.001);
    const y0 = fy | 0, ty = fy - y0, r0 = y0 * P, r1 = r0 + P, row = y * W;
    for (let x = 0; x < W; x++) {
      const i0 = xi[x], tx = xf[x];
      const a = m[r0 + i0], b = m[r0 + i0 + 1], c = m[r1 + i0], d = m[r1 + i0 + 1];
      out[row + x] = ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * mul;
    }
  }
  return out;
}

/** Coverage of the shape {sd < 0} with interior holes filled (flood fill from the border). */
function filledCoverage(sd, W) {
  const n = W * W;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && sd[i] >= 0) { out[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((W - 1) * W + x); }
  for (let y = 0; y < W; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < n - W) push(i + W);
  }
  const cov = new Float32Array(n);
  for (let i = 0; i < n; i++) cov[i] = out[i] ? clamp(0.5 - sd[i]) : 1;
  return cov;
}

/* ───────────────────────────── stitches ───────────────────────────── */

/**
 * Fill rows for one region (S px segments [ax, ay, bx, by, …]). Rows run at angle `th`,
 * bend gently with low-frequency noise, and are cut into stitches: satin = long stitches
 * (split when longer than maxLen), tatami = short stitches with a staggered phase per row.
 */
function fillStitches(k, lab, rd, W, kS, box, th, rowSp, minD, satin, stitchLen, noise) {
  const segs = [];
  const c = Math.cos(th), s = Math.sin(th);
  const xs = [box.x0, box.x1, box.x0, box.x1], ys = [box.y0, box.y0, box.y1, box.y1];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let q = 0; q < 4; q++) {
    const u = xs[q] * c + ys[q] * s, v = -xs[q] * s + ys[q] * c;
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  const du = Math.max(0.5, 0.9 / kS);       // ≈ one field pixel
  const bendA = rowSp * 0.9, bf = 1 / (rowSp * 40), bv = 1 / (rowSp * 30);
  const gap = Math.max(0.25, rowSp * 0.12);
  const NS = 8;
  const inside = (u, v) => {
    const x = u * c - v * s, y = u * s + v * c;
    const xi = (x * kS) | 0, yi = (y * kS) | 0;
    if (xi < 0 || yi < 0 || xi >= W || yi >= W) return false;
    const i = yi * W + xi;
    return lab[i] === k && rd[i] >= minD;
  };
  const push = (ua, ub, v) => {
    if (ub - ua < gap * 2.5) return;
    const va = v + bendA * noise(ua * bf, v * bv), vb = v + bendA * noise(ub * bf, v * bv);
    const a = ua + gap, b = ub - gap;
    segs.push(a * c - va * s, a * s + va * c, b * c - vb * s, b * s + vb * c);
  };
  let j = 0;
  for (let v = v0 + rowSp * 0.5; v <= v1; v += rowSp, j++) {
    let start = null;
    const phase = ((j * 0.382) % 1) * stitchLen;
    // the bend is low-frequency: sample its noise every NS steps and interpolate
    let nA = noise(u0 * bf, v * bv), nB = noise((u0 + du * NS) * bf, v * bv), ns = 0;
    for (let u = u0; u <= u1 + du; u += du) {
      if (ns === NS) { ns = 0; nA = nB; nB = noise((u + du * NS) * bf, v * bv); }
      const vb = v + bendA * (nA + (nB - nA) * (ns++ / NS));
      const inn = u <= u1 && inside(u, vb);
      if (inn && start === null) start = u;
      else if (!inn && start !== null) {
        const ua = start, ub = u - du * 0.5;
        if (satin) {
          const L = ub - ua;
          const parts = Math.max(1, Math.ceil(L / stitchLen));
          const off = parts > 1 ? ((j % 2) * 0.5 - 0.25) * (L / parts) : 0;
          let prev = ua;
          for (let q = 1; q <= parts; q++) {
            const cut = q === parts ? ub : ua + (L * q) / parts + off;
            push(prev, cut, v);
            prev = cut;
          }
        } else {
          let prev = ua;
          let cut = ua - ((ua - phase) % stitchLen + stitchLen) % stitchLen + stitchLen;
          while (cut < ub - gap * 3) { push(prev, cut, v); prev = cut; cut += stitchLen; }
          push(prev, ub, v);
        }
        start = null;
      }
    }
  }
  return segs;
}

/**
 * Satin column along a region's outline: stitches from the edge inward, turning with the
 * contour (slight slant), spanning the whole stroke where the region is thinner than the
 * column. → segments in S px.
 */
function borderStitches(contours, k, lab, rd, W, kS, toS, bw, sp, onlyThin = false) {
  const segs = [];
  const slant = 0.24;
  const labAt = (x, y) => {
    const xi = (x * kS) | 0, yi = (y * kS) | 0;
    return xi < 0 || yi < 0 || xi >= W || yi >= W ? -2 : lab[yi * W + xi];
  };
  const rdAt = (x, y) => {
    const xi = (x * kS) | 0, yi = (y * kS) | 0;
    return xi < 0 || yi < 0 || xi >= W || yi >= W ? 0 : rd[yi * W + xi] * toS;
  };
  const stepIn = Math.max(0.5, 0.8 * toS);
  for (const c0 of contours) {
    const m = c0.length;
    if (m < 3) continue;
    const c = c0.map(([x, y]) => [x * toS, y * toS]);
    const seg = new Float32Array(m);
    let L = 0;
    for (let i = 0; i < m; i++) { const a = c[i], b = c[(i + 1) % m]; seg[i] = Math.hypot(b[0] - a[0], b[1] - a[1]); L += seg[i]; }
    if (L < sp * 3) continue;
    const steps = Math.max(3, Math.round(L / sp));
    const h = L / steps;
    let si = 0, acc = 0;
    for (let q = 0; q < steps; q++) {
      const at = q * h;
      while (si < m - 1 && acc + seg[si] < at) { acc += seg[si]; si++; }
      const a = c[si], b = c[(si + 1) % m];
      const ln = seg[si] || 1;
      const u = clamp((at - acc) / ln);
      const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
      // smoothed tangent over neighbouring segments
      const pa = c[(si - 1 + m) % m], pb = c[(si + 2) % m];
      let tx = pb[0] - pa[0], ty = pb[1] - pa[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      let nx = -ty, ny = tx;
      if (labAt(px + nx * 1.5 * toS, py + ny * 1.5 * toS) !== k) { nx = -nx; ny = -ny; }
      if (labAt(px + nx * 1.5 * toS, py + ny * 1.5 * toS) !== k) continue;
      // march inward to find the stroke's half width (peak of the region distance)
      let peak = 0, sPeak = 0, thin = false, exit = Infinity;
      for (let sIn = stepIn; sIn <= bw + stepIn; sIn += stepIn) {
        const qx = px + nx * sIn, qy = py + ny * sIn;
        if (labAt(qx, qy) !== k) { thin = true; exit = sIn - stepIn * 0.5; if (!(peak > 0)) { peak = exit / 2; sPeak = exit / 2; } break; }
        const r = rdAt(qx, qy);
        if (r > peak) { peak = r; sPeak = sIn; } else if (r < peak - stepIn * 0.75) { thin = true; break; }
      }
      let len = Math.min(bw, exit);
      if (onlyThin && !(thin && sPeak < bw)) continue;
      if (thin && sPeak < bw) {
        len = Math.min(bw, exit, Math.max(sPeak, peak) * 2);
        if (q & 1) continue; // both sides of a thin stroke emit: halve each so density stays even
      }
      if (len < 0.8) continue;
      const sx = px - nx * 0.15, sy = py - ny * 0.15;
      segs.push(sx, sy, px + nx * len + tx * len * slant, py + ny * len + ty * len * slant);
    }
  }
  return segs;
}

/** Stroke thread segments: body, far-side shadow, sheen (bucketed by angle to the light). */
function drawThreads(o, segs, rgb, tw, sheen, cap) {
  if (!segs.length) return;
  const lum = luminance(rgbToHex(rgb));
  const body = rgbToHex(rgb.map((v) => v * (1 - (0.03 + 0.05 * lum))));
  const shadowCol = rgbToHex(rgb.map((v) => v * 0.45));
  const sheenCol = rgbToHex(rgb.map((v) => v + (255 - v) * (lum > 0.7 ? 1 : 0.62)));
  const bodyP = new Path2D(), shadeP = new Path2D();
  const shade = tw >= 2.4; // a sub-pixel row shadow costs a stroke and shows nothing
  const B = shade ? 4 : 3;
  const sheenP = Array.from({ length: B }, () => new Path2D());
  for (let q = 0; q < segs.length; q += 4) {
    const ax = segs[q], ay = segs[q + 1], bx = segs[q + 2], by = segs[q + 3];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (L < 0.2) continue;
    const tx = dx / L, ty = dy / L;
    let nx = -ty, ny = tx;
    if (nx * LIGHT[0] + ny * LIGHT[1] < 0) { nx = -nx; ny = -ny; }
    bodyP.moveTo(ax, ay); bodyP.lineTo(bx, by);
    const so = tw * 0.3;
    if (shade) { shadeP.moveTo(ax - nx * so, ay - ny * so); shadeP.lineTo(bx - nx * so, by - ny * so); }
    const across = Math.abs(tx * LIGHT[1] - ty * LIGHT[0]); // |sin| between thread and light
    const bucket = Math.min(B - 1, (across * B) | 0);
    const sh = tw * 0.14, cut = Math.min(L * 0.22, tw * 1.2);
    const p = sheenP[bucket];
    p.moveTo(ax + tx * cut + nx * sh, ay + ty * cut + ny * sh);
    p.lineTo(bx - tx * cut + nx * sh, by - ty * cut + ny * sh);
  }
  o.lineCap = shade ? cap : "butt";
  o.strokeStyle = body;
  o.lineWidth = tw * 0.9;
  o.stroke(bodyP);
  if (shade) {
    o.lineCap = "butt";
    o.globalAlpha = 0.5 - 0.22 * lum; // pale thread: softer row shadows (white reads white)
    o.strokeStyle = shadowCol;
    o.lineWidth = tw * 0.26;
    o.stroke(shadeP);
  }
  o.lineCap = shade ? "round" : "butt"; // round caps on sub-2 px lines cost time, show nothing
  o.strokeStyle = sheenCol;
  o.lineWidth = tw * 0.32;
  for (let b = 0; b < B; b++) {
    const a = sheen * (0.12 + 0.88 * Math.pow((b + 0.5) / B, 1.6));
    if (a < (shade ? 0.02 : 0.08)) continue;
    o.globalAlpha = Math.min(1, a);
    o.stroke(sheenP[b]);
  }
  o.globalAlpha = 1;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "embroidery",
  name: "Embroidered",
  category: "retro",
  blurb: "Stitched thread with satin borders and real sheen.",
  method: "Embroidery",
  stage: "paper",
  params: [
    {
      key: "mode", label: "Stitch", type: "select", default: "satin",
      options: [{ value: "satin", label: "Satin" }, { value: "fill", label: "Fill (tatami)" }],
    },
    { key: "density", label: "Stitch density", type: "range", min: 50, max: 150, step: 5, default: 100, unit: "%" },
    { key: "angle", label: "Stitch angle", type: "range", min: 0, max: 180, step: 5, default: 45, unit: "°" },
    { key: "border", label: "Satin border", type: "range", min: 0, max: 20, step: 1, default: 8, unit: "px" },
    { key: "sheen", label: "Sheen", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "patch", label: "Merrowed patch", type: "toggle", default: false },
    { key: "patchColor", label: "Patch color", type: "color", default: "primary" },
  ],
  presets: [
    { name: "Satin", params: { mode: "satin", density: 100, angle: 45, border: 8, sheen: 60, patch: false } },
    { name: "Fill stitch", params: { mode: "fill", density: 100, angle: 30, border: 6, sheen: 45, patch: false } },
    { name: "Merrowed patch", params: { mode: "satin", density: 100, angle: 45, border: 6, sheen: 55, patch: true, patchColor: "primary" } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const scale = ctx.scale;
    const W = Math.min(S, 1024);
    const kS = W / S, toS = S / W;
    const n = W * W;
    const seed = hashSeed("embroidery", ctx.seed);
    let _l = performance.now();
    const mark = (k) => { const P = globalThis.__prof; if (P) { const t = performance.now(); P[k] = Math.round(t - _l); _l = t; } };

    const small = W === S ? src : resizeCanvas(src, W, W);
    const mask = alphaMask(small);
    mark("mask");
    // keep hairlines: anything ≥ 25% covered counts as thread
    for (let i = 0; i < n; i++) mask[i] = mask[i] * 2 > 1 ? 1 : mask[i] * 2;
    const { label, colors } = threadLabels(small, mask, W);
    mark("tl");
    // details (dashes, pupils, small type) come off the base map and are stitched on top
    const detMax = Math.max(24, Math.pow(30 * scale * kS, 2));
    const { base, det, count: detCount } = splitDetails(label, W, detMax);
    const rd = regionDistance(base, W);
    const rdDet = detCount ? regionDistance(det, W) : null;
    mark("labels");

    // stitch geometry (S px)
    const dens = p.density / 100;
    const rowSp = Math.max(S <= 512 ? 2.1 : 1.5, (4.2 * scale) / dens);
    const tw = rowSp * 1.08;
    const bw = p.border * scale;
    const satin = p.mode === "satin";
    const stitchLen = satin ? 64 * scale : Math.max(5, 15 * scale);
    const noise = makeNoise2D(seed);
    const out = createCanvas(S, S);
    const o = ctx2d(out);

    // ── patch shape (optional): dilate + closing, like a cut twill blank
    let sdP = null;
    const mw = 15 * scale; // merrow width
    if (p.patch) {
      // closing = dilate by (border + close), fill the holes (a merrowed blank has none),
      // erode by close. Euclidean erosion is exact on the inside distance: d(p, E) = d(p, M) − r.
      // The blank is a smooth shape: built on a half-res grid P, its distance field upsampled.
      const P = Math.max(96, Math.round(W / 2)), kP = P / W, nP = P * P;
      const maskP = areaDown(mask, W, P);
      const od = outsideDistance(maskP, P, P);
      const pb = (18 * scale + mw) * kS * kP, close = 48 * scale * kS * kP;
      const m1 = new Float32Array(nP);
      for (let i = 0; i < nP; i++) m1[i] = od[i] === 0 ? 1 : clamp(pb + close - (od[i] - 0.5) + 0.5);
      for (let i = 0; i < nP; i++) m1[i] = 0.5 - m1[i];
      const ins = insideDistance(filledCoverage(m1, P), P, P);
      const sdS = new Float32Array(nP);
      for (let i = 0; i < nP; i++) sdS[i] = ins[i] > 0 ? close + 0.5 - ins[i] : close + 1;
      sdP = bilinearUp(blurMask(sdS, P, P, 0.6), P, W, 1 / kP);
    }

    mark("blank");
    // ── raised shadow under the whole piece
    {
      const cov = new Float32Array(n);
      if (sdP) for (let i = 0; i < n; i++) cov[i] = clamp(0.5 - sdP[i]);
      else cov.set(mask);
      const sh = blurMask(cov, W, W, Math.max(0.8, 3 * scale * kS));
      const shc = maskToCanvas(sh, W, W, "#000000");
      // pale thread on its own (a white logo) needs a deeper raised shadow to read at all
      let lsum = 0, lc = 0;
      for (let i = 0; i < n; i += 5) { const l = label[i]; if (l >= 0) { const c = colors[l]; lsum += (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; lc++; } }
      const pale = sdP ? 0 : smoothstep(0.7, 0.92, lc ? lsum / lc : 0);
      o.save();
      o.globalAlpha = sdP ? 0.42 : 0.34 + 0.2 * pale;
      o.imageSmoothingEnabled = true;
      o.drawImage(shc, 2.2 * scale, 3.2 * scale, S, S);
      o.restore();
    }
    mark("shadow");

    // ── patch twill + merrow base (per pixel at S)
    let merrowRGB = null;
    if (sdP) {
      const pal = ctx.palette;
      // the blank must not swallow the artwork: if the logo's own (area-weighted) color is
      // too close to the chosen patch color, use the palette color that contrasts best
      let pc = p.patchColor;
      {
        let r = 0, g = 0, b = 0, c = 0;
        for (let i = 0; i < n; i += 3) { const l = label[i]; if (l < 0) continue; r += colors[l][0]; g += colors[l][1]; b += colors[l][2]; c++; }
        const avg = c ? rgbToHex([r / c, g / c, b / c]) : "#808080";
        if (contrastRatio(avg, pc) < 1.6) {
          let best = pc, bc = 0;
          for (const role of ["accent", "light", "secondary", "primary", "dark"]) {
            const h = pal[role]; if (!h) continue;
            const cr = contrastRatio(avg, h);
            if (cr > bc + 0.3) { bc = cr; best = h; }
          }
          pc = best;
        }
      }
      const cands = [pal.secondary, pal.accent, pal.primary, pal.dark, pal.light].filter(Boolean);
      merrowRGB = hexToRgb(cands.find((c) => contrastRatio(c, pc) >= 2.6 && c.toUpperCase() !== pc.toUpperCase()) || (luminance(pc) > 0.4 ? "#111111" : "#F4F4F4"));
      const prgb = hexToRgb(pc);
      const img = o.getImageData(0, 0, S, S);
      const d = img.data;
      const P = Math.max(2.4, 4.6 * scale);
      for (let y = 0; y < S; y++) {
        const yw = (y + 0.5) * kS - 0.5;
        for (let x = 0; x < S; x++) {
          const xw = (x + 0.5) * kS - 0.5;
          let v;
          if (W === S) v = sdP[y * W + x];
          else {
            const xi = clamp(xw, 0, W - 1.001), yi = clamp(yw, 0, W - 1.001);
            const x0 = xi | 0, y0 = yi | 0, fx = xi - x0, fy = yi - y0, i0 = y0 * W + x0;
            v = (sdP[i0] * (1 - fx) + sdP[i0 + 1] * fx) * (1 - fy) + (sdP[i0 + W] * (1 - fx) + sdP[i0 + W + 1] * fx) * fy;
          }
          const dS = v * toS;
          const a = clamp(0.5 - dS);
          if (a <= 0) continue;
          let r, g, b;
          if (dS > -mw) {
            // rolled merrow edge: a tube in cross-section (dark at both sides, lit on top)
            const t = clamp(-dS / mw);
            const tube = Math.sin(Math.PI * t);
            const k = 0.42 + 0.62 * tube;
            r = merrowRGB[0] * k; g = merrowRGB[1] * k; b = merrowRGB[2] * k;
          } else {
            // twill: diagonal wale + shadow of the merrow onto the blank
            const ph = ((x - y) / P) % 1;
            const wale = Math.sin((ph < 0 ? ph + 1 : ph) * Math.PI * 2);
            const near = 1 - 0.3 * (1 - smoothstep(0, 6 * scale + 1, -dS - mw));
            const k = (0.97 + 0.04 * wale) * near;
            r = prgb[0] * k; g = prgb[1] * k; b = prgb[2] * k;
          }
          const j = (y * S + x) * 4;
          const da = d[j + 3] / 255;
          const A = a + da * (1 - a);
          d[j] = (r * a + d[j] * da * (1 - a)) / A;
          d[j + 1] = (g * a + d[j + 1] * da * (1 - a)) / A;
          d[j + 2] = (b * a + d[j + 2] * da * (1 - a)) / A;
          d[j + 3] = A * 255 + 0.5;
        }
      }
      o.putImageData(img, 0, 0);
    }
    mark("patch");

    // ── regions: outline, fill stitches, satin border — the base fills first, then details
    const K = colors.length;
    const sheen = p.sheen / 100;
    const minFill = Math.max(0, (bw > 0.5 ? bw : 3.5 * scale) * 0.5 * kS);
    const blurR = Math.max(0.5, 0.7 * kS * toS);
    const buildRegions = (lab, angleOffset, rdm) => {
      const regions = [];
      const bx0 = new Int32Array(K).fill(W), by0 = new Int32Array(K).fill(W), bx1 = new Int32Array(K).fill(-1), by1 = new Int32Array(K).fill(-1);
      const area = new Int32Array(K);
      const deep = new Float32Array(K); // deepest point: can this thread hold a fill row at all?
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const l = lab[y * W + x];
          if (l < 0) continue;
          area[l]++;
          if (rdm[y * W + x] > deep[l]) deep[l] = rdm[y * W + x];
          if (x < bx0[l]) bx0[l] = x; if (x > bx1[l]) bx1[l] = x;
          if (y < by0[l]) by0[l] = y; if (y > by1[l]) by1[l] = y;
        }
      }
      const order = [...Array(K).keys()].filter((k) => area[k] > 0).sort((a, b) => area[b] - area[a]);
      order.forEach((k, idx) => {
        // trace this thread's outline on a crop around its bounding box (cheap for small regions)
        const pad = 4;
        const cx0 = Math.max(0, bx0[k] - pad), cy0 = Math.max(0, by0[k] - pad);
        const cw = Math.min(W, bx1[k] + 1 + pad) - cx0, ch = Math.min(W, by1[k] + 1 + pad) - cy0;
        const mk = new Float32Array(cw * ch);
        for (let y = 0; y < ch; y++) {
          const row = (cy0 + y) * W + cx0;
          for (let x = 0; x < cw; x++) if (lab[row + x] === k) mk[y * cw + x] = 1;
        }
        const soft = blurMask(mk, cw, ch, blurR);
        const contours = traceContours(soft, cw, ch, 0.5, 0.6);
        for (const c of contours) for (const pt of c) { pt[0] += cx0; pt[1] += cy0; }
        const th = (p.angle + angleOffset + ANGLE_STEPS[idx % ANGLE_STEPS.length]) * DEG;
        const box = { x0: bx0[k] * toS, y0: by0[k] * toS, x1: (bx1[k] + 1) * toS, y1: (by1[k] + 1) * toS };
        regions.push({ k, contours, th, box, path: contoursToPath(contours, toS), fill: deep[k] >= minFill });
      });
      return regions;
    };
    // big renders clip every region to its outline (crisp colour boundaries); small ones
    // stitch everything on one layer and clip once to the logo — an AA clip per region
    // costs more than all the stitches, and a sub-pixel cap overlap is what real stitches do
    const perRegionClip = S > 640;
    const layer = perRegionClip ? null : createCanvas(S, S);
    const L = perRegionClip ? o : ctx2d(layer);
    const clipTo = (path) => { L.save(); if (perRegionClip) L.clip(path); };
    const stitchRegions = (regions, lab, rdm) => {
      for (const r of regions) {
        const rgb = colors[r.k];
        const segs = r.fill ? fillStitches(r.k, lab, rdm, W, kS, r.box, r.th, rowSp, minFill, satin, stitchLen, noise) : [];
        clipTo(r.path);
        const o = L;
        // the fabric/underlay between thread rows shows as a darker base
        const lum = luminance(rgbToHex(rgb));
        o.fillStyle = rgbToHex(rgb.map((v) => v * (0.62 + 0.16 * lum)));
        o.fill(r.path);
        drawThreads(o, segs, rgb, tw, sheen, "round");
        o.restore();
      }
      // satin columns: around every region (border width), and always for hairlines and
      // thin strokes — a fill can't hold a 1 mm line, a digitizer would satin it
      const sp = rowSp * 0.85;
      const thinOnly = bw <= 0.5;
      const bwEff = thinOnly ? 7 * scale : bw;
      for (const r of regions) {
        const segs = borderStitches(r.contours, r.k, lab, rdm, W, kS, toS, bwEff, sp, thinOnly);
        clipTo(r.path);
        drawThreads(L, segs, colors[r.k], tw * 0.95, sheen, "butt");
        L.restore();
      }
    };
    const baseRegions = buildRegions(base, 0, rd);
    mark("contours");
    stitchRegions(baseRegions, base, rd);
    mark("fill");
    mark("base");
    if (detCount) {
      // details: a raised satin piece on top of the fill, with a hairline of shadow
      const detRegions = buildRegions(det, 90, rdDet);
      mark("detBuild");
      const shadowP = new Path2D();
      for (const r of detRegions) shadowP.addPath(r.path);
      L.save();
      L.translate(0.6 * scale + 0.2, 0.9 * scale + 0.3);
      L.fillStyle = "rgba(0,0,0,0.35)";
      L.fill(shadowP);
      L.restore();
      stitchRegions(detRegions, det, rdDet);
    }
    mark("details");
    if (layer) {
      L.globalCompositeOperation = "destination-in";
      L.imageSmoothingEnabled = true;
      L.drawImage(maskToCanvas(mask, W, W, "#000"), 0, 0, S, S);
      L.globalCompositeOperation = "source-over";
      o.drawImage(layer, 0, 0);
    }
    mark("border");

    // ── relief: every stitched block domes a little (satin pulls its edges down), so
    // block edges catch light on the upper left and shade on the lower right
    {
      const dome = (5 + p.border * 0.5) * scale * kS;
      const hgt = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (base[i] < 0) continue;
        const t = clamp((det[i] >= 0 ? rdDet[i] : rd[i]) / dome);
        hgt[i] = Math.sqrt(t * (2 - t));
      }
      const hs = blurMask(hgt, W, W, Math.max(0.6, 0.9 * scale * kS));
      const strength = dome * 0.55;
      const sc = createCanvas(W, W);
      const sx = ctx2d(sc);
      const im = sx.createImageData(W, W);
      const sdd = im.data;
      const LX = LIGHT[0] * 0.7, LY = LIGHT[1] * 0.7, LZ = 0.71;
      for (let y = 1; y < W - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (base[i] < 0 && mask[i] <= 0) continue;
          const dx = (hs[i + 1] - hs[i - 1]) * 0.5 * strength, dy = (hs[i + W] - hs[i - W]) * 0.5 * strength;
          const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
          const v = ((-dx * LX - dy * LY + LZ) * nl) / LZ - 1; // 0 on flat tops
          const j = i * 4;
          const a = mask[i];
          if (v < 0) { sdd[j + 3] = Math.min(120, -v * 290) * a; }
          else { sdd[j] = sdd[j + 1] = sdd[j + 2] = 255; sdd[j + 3] = Math.min(90, v * 230) * a; }
        }
      }
      sx.putImageData(im, 0, 0);
      o.save();
      o.globalCompositeOperation = "source-atop";
      o.imageSmoothingEnabled = true;
      o.imageSmoothingQuality = "high";
      o.drawImage(sc, 0, 0, S, S);
      o.restore();
    }
    mark("relief");

    // ── merrow stitches: dense wraps over the rolled edge
    if (sdP) {
      const neg = new Float32Array(n);
      for (let i = 0; i < n; i++) neg[i] = -sdP[i];
      const edge = traceContours(neg, W, W, -0.4 * scale * kS, 0.5);
      const fakeLab = new Int8Array(n);
      for (let i = 0; i < n; i++) fakeLab[i] = sdP[i] < 0 ? 0 : -1;
      const rdP = new Float32Array(n);
      for (let i = 0; i < n; i++) rdP[i] = Math.max(0, -sdP[i]);
      const segs = borderStitches(edge, 0, fakeLab, rdP, W, kS, toS, mw * 1.02, Math.max(1.2, 2.6 * scale));
      const mo = createCanvas(S, S);
      const mx = ctx2d(mo);
      drawThreads(mx, segs, merrowRGB, Math.max(1.4, 3 * scale), Math.max(0.35, sheen), "butt");
      // the tube shading applies to the wraps too
      mx.globalCompositeOperation = "source-atop";
      const tubeImg = mx.getImageData(0, 0, S, S);
      const td = tubeImg.data;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const j = (y * S + x) * 4;
          if (!td[j + 3]) continue;
          const xi = Math.min(W - 1, ((x + 0.5) * kS) | 0), yi = Math.min(W - 1, ((y + 0.5) * kS) | 0);
          const t = clamp((-sdP[yi * W + xi] * toS) / mw);
          const k = 0.55 + 0.6 * Math.sin(Math.PI * clamp(t, 0.02, 0.98));
          td[j] = Math.min(255, td[j] * k); td[j + 1] = Math.min(255, td[j + 1] * k); td[j + 2] = Math.min(255, td[j + 2] * k);
        }
      }
      mx.putImageData(tubeImg, 0, 0);
      o.drawImage(mo, 0, 0);
    }
    mark("merrow");
    return out;
  },
};
