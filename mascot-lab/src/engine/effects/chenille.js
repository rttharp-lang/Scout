// "Chenille" — a sewn letterman-jacket patch, built the way a patch maker builds one:
//
//   • the logo's big colour areas become loop-pile chenille: thousands of tiny yarn curls
//     (a real height field of open loops, lit from the upper left, dark in the gaps), each
//     area puffed up like a pillow with a dark groove where two yarn colours meet, and
//     loose fibres + loops spilling over the edge where the chenille meets the felt;
//   • the logo's thin detail (keylines, pupils, small lettering) is satin-stitched on top
//     in flat glossy thread — chenille can't hold a 3 mm line, so real patches embroider it;
//   • everything sits on a cut felt backing (the silhouette dilated + closed, holes filled,
//     matte fibre texture, zigzag-stitched edge), optionally on a second felt layer, with
//     a soft contact shadow under every layer.
//
// Structure (see halftone.js): analysis fields at W = min(S, 1024) (thread labels, region
// distances, chenille/satin split, felt shapes, puff light, shadows) → the pile height field
// splatted at S in 1024-units × ctx.scale → one per-pixel composite at S → vector satin
// stitches, fibres and felt stitching at S. Transparent background, deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, alphaMask, signedDistance, insideDistance, outsideDistance,
  blurMask, blurCanvas, tintCanvas, traceContours, maskToCanvas, clamp, smoothstep, hexToRgb, rgbToHex,
  nearestColorIndex, rng, hashSeed, luminance, contrastRatio,
} from "../core.js";
import { extractPalette } from "../image.js";

const TAU = Math.PI * 2;
// light from the upper left
const LX = -0.5, LY = -0.62, LZ = 0.6;
const LN = Math.hypot(LX, LY, LZ);
const L0 = LX / LN, L1 = LY / LN, L2 = LZ / LN;
// half vector for the yarn sheen (viewer straight above)
const HN = Math.hypot(L0, L1, L2 + 1);
const H0 = L0 / HN, H1 = L1 / HN, H2 = (L2 + 1) / HN;

/* ───────────────────────────── analysis ───────────────────────────── */

/** Yarn/thread labels at W: palette quantization + a 3×3 majority filter (no 1-px slivers). */
function threadLabels(small, mask, W) {
  const tiny = resizeCanvas(small, Math.min(W, 200), Math.min(W, 200));
  let pal = extractPalette(tiny, 6, { maxSamples: 8000 }).filter((c) => c.weight > 0.004);
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
  const K = colors.length;
  const cnt = new Int32Array(K);
  // on a coarse grid a 3×3 majority would erase small lettering: one gentle pass there
  const passes = W < 400 ? 1 : 2, keep = W < 400 ? 3 : 9;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Int8Array(label);
    for (let y = 1; y < W - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, l = label[i];
        if (l < 0) continue;
        if (label[i - 1] === l && label[i + 1] === l && label[i - W] === l && label[i + W] === l) continue;
        cnt.fill(0);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const v = label[i + oy * W + ox]; if (v >= 0) cnt[v]++; }
        if (cnt[l] >= keep) continue;
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

/** Distance (W px) of every labelled pixel to the edge of its own colour region. */
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

/** Opening of the regions whose label passes `use`: pixels within r of a core pixel (rd > r). */
function opening(label, rd, W, r, minArea, use) {
  const n = W * W;
  const core = new Float32Array(n);
  let any = 0;
  for (let i = 0; i < n; i++) if (label[i] >= 0 && use[label[i]] && rd[i] > r) { core[i] = 1; any++; }
  const out = new Float32Array(n);
  if (!any) return out;
  // drop tiny cores so a lone loop or two never appears
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!core[s] || seen[s]) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % W;
      if (x > 0 && core[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < W - 1 && core[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= W && core[i - W] && !seen[i - W]) { seen[i - W] = 1; queue[tail++] = i - W; }
      if (i < n - W && core[i + W] && !seen[i + W]) { seen[i + W] = 1; queue[tail++] = i + W; }
    }
    if (tail < minArea) for (let q = 0; q < tail; q++) core[queue[q]] = 0;
  }
  const toCore = outsideDistance(core, W, W);
  for (let i = 0; i < n; i++) {
    if (label[i] < 0 || !use[label[i]]) continue;
    const t = toCore[i];
    out[i] = t === 0 ? 1 : smoothstep(r + 0.6, r - 0.4, t);
  }
  return out;
}

/**
 * Chenille areas: pixels covered by a disc of radius r that fits inside their own colour
 * region (a morphological opening; a core pixel's disc lies inside its own region, so the
 * opening never leaks into a neighbouring colour). Dark inks — keylines — need a wider
 * disc (they stay satin unless they are real areas), and a colour region that would only
 * get a sliver of pile is satin-stitched whole, so an outline never flips between the two.
 */
function chenilleAreas(label, rd, W, r, minArea, colors) {
  const n = W * W;
  const dark = colors.map((c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 < 0.2);
  const light = dark.map((v) => !v);
  const chen = opening(label, rd, W, r, minArea, light);
  if (dark.some(Boolean)) {
    const cd = opening(label, rd, W, r * 2.3, minArea * 3, dark);
    for (let i = 0; i < n; i++) if (cd[i] > chen[i]) chen[i] = cd[i];
  }
  // per connected colour region: mostly satin → all satin
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    const l = label[s];
    if (l < 0 || seen[s]) continue;
    let head = 0, tail = 0, sum = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % W;
      sum += chen[i];
      if (x > 0 && !seen[i - 1] && label[i - 1] === l) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < W - 1 && !seen[i + 1] && label[i + 1] === l) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= W && !seen[i - W] && label[i - W] === l) { seen[i - W] = 1; queue[tail++] = i - W; }
      if (i < n - W && !seen[i + W] && label[i + W] === l) { seen[i + W] = 1; queue[tail++] = i + W; }
    }
    // mostly satin → all satin; mostly pile → all pile (its thin bits get loops too, rather
    // than a comb of same-colour satin next to the chenille)
    const f = sum / tail;
    if (sum > 0 && f < (dark[l] ? 0.5 : 0.3)) for (let q = 0; q < tail; q++) chen[queue[q]] = 0;
    else if (!dark[l] && f >= 0.45) for (let q = 0; q < tail; q++) chen[queue[q]] = 1;
  }
  return chen;
}

/** Fill enclosed holes of a 0..1 shape (flood fill of the outside from the border). */
function fillHoles(m, W) {
  const n = W * W;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && m[i] < 0.5) { out[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((W - 1) * W + x); }
  for (let y = 0; y < W; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < n - W) push(i + W);
  }
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = out[i] ? m[i] : 1;
  return f;
}

/** shiftMap(a, W, dx, dy) → a sampled at (p − (dx, dy)), bilinear, 0 outside. */
function shiftMap(a, W, dx, dy) {
  const out = new Float32Array(a.length);
  const ox = Math.floor(-dx), oy = Math.floor(-dy);
  const tx = -dx - ox, ty = -dy - oy;
  for (let y = 0; y < W; y++) {
    const y0 = y + oy, y1 = y0 + 1;
    if (y1 < 0 || y0 >= W) continue;
    for (let x = 0; x < W; x++) {
      const x0 = x + ox, x1 = x0 + 1;
      if (x1 < 0 || x0 >= W) continue;
      const v00 = y0 >= 0 && x0 >= 0 ? a[y0 * W + x0] : 0, v10 = y0 >= 0 && x1 < W ? a[y0 * W + x1] : 0;
      const v01 = y1 < W && x0 >= 0 ? a[y1 * W + x0] : 0, v11 = y1 < W && x1 < W ? a[y1 * W + x1] : 0;
      out[y * W + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
  }
  return out;
}

/** Value-noise lattice (G×G of [-1,1]) for cheap, deterministic felt texture. */
function lattice(G, seed) {
  const r = rng(seed);
  const g = new Float32Array(G * G);
  for (let i = 0; i < g.length; i++) g[i] = r() * 2 - 1;
  return g;
}
function vnoise(g, G, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let fx = x - x0, fy = y - y0;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % G) + G) % G, ya = ((y0 % G) + G) % G;
  const xb = (xa + 1) % G, yb = (ya + 1) % G;
  const a = g[ya * G + xa], b = g[ya * G + xb], c = g[yb * G + xa], d = g[yb * G + xb];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Bilinear lookup (W map, W px coords, clamped). */
function bil(map, W, x, y) {
  if (x < 0) x = 0; else if (x > W - 1.001) x = W - 1.001;
  if (y < 0) y = 0; else if (y > W - 1.001) y = W - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
  return (map[i] * (1 - fx) + map[i + 1] * fx) * (1 - fy) + (map[i + W] * (1 - fx) + map[i + W + 1] * fx) * fy;
}

/* ───────────────────────────── pile ───────────────────────────── */

/**
 * Splat the loop pile into H (S×S height 0..1) and OWN (label + 1 of the loop on top).
 * One open yarn curl per jittered grid cell whose centre lies in the chenille: a ring
 * (tube profile) squashed and rotated at random, open on one side, tilted toward its
 * closed end, at a random base height so neighbours tuck under each other.
 */
function splatPile(H, OWN, S, box, loopR, chen, label, W, seed) {
  const kW = W / S;
  const sp = loopR * 1.12;
  const R = rng(seed);
  const gx0 = Math.floor(box.x0 / sp), gx1 = Math.ceil(box.x1 / sp);
  const gy0 = Math.floor(box.y0 / sp), gy1 = Math.ceil(box.y1 / sp);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      // a fixed number of draws per cell keeps the pattern stable whatever gets skipped
      const j1 = R(), j2 = R(), rr = R(), tt = R(), ee = R(), ro = R(), op = R(), bb = R();
      const cx = (gx + 0.5 + (j1 - 0.5) * 0.95) * sp, cy = (gy + 0.5 + (j2 - 0.5) * 0.95) * sp;
      const wx = Math.min(W - 1, Math.max(0, (cx * kW) | 0)), wy = Math.min(W - 1, Math.max(0, (cy * kW) | 0));
      const wi = wy * W + wx;
      if (chen[wi] < 0.5) continue;
      const lab = label[wi];
      if (lab < 0) continue;
      const r = loopR * (0.62 + 0.42 * rr);
      const t = r * (0.4 + 0.16 * tt);
      const ex = 0.7 + 0.3 * ee;
      const rot = ro * Math.PI;
      const ca = Math.cos(rot), sa = Math.sin(rot);
      const oa = Math.cos(op * TAU), ob = Math.sin(op * TAU);
      const base = 0.68 + 0.32 * bb;
      const ext = r + t + 1;
      const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(S - 1, Math.ceil(cx + ext));
      const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(S - 1, Math.ceil(cy + ext));
      const it = 1 / t, iex = 1 / ex;
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        const row = y * S;
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          const u = dx * ca + dy * sa, v = (-dx * sa + dy * ca) * iex;
          const d = Math.sqrt(u * u + v * v);
          const q = (d - r) * it;
          if (q >= 1 || q <= -1) continue;
          const cr = d > 1e-3 ? (u * oa + v * ob) / d : 0; // 1 at the open end of the curl
          if (cr > 0.86) continue;
          let h = base * Math.sqrt(1 - q * q) * (0.86 - 0.14 * cr);
          if (cr > 0.5) h *= (0.86 - cr) / 0.36;
          const k = row + x;
          if (h > H[k]) { H[k] = h; OWN[k] = lab + 1; }
        }
      }
    }
  }
}

/* ───────────────────────────── satin ───────────────────────────── */

/**
 * Satin stitches for the thin (embroidered) part of one thread colour: walk the outline,
 * and at every step throw a stitch straight across the stroke to its far side (slightly
 * slanted, like a digitized satin column). Both sides of a stroke emit, so each keeps every
 * other stitch. → segments [ax, ay, bx, by, …] in S px.
 */
function satinSegments(k, label, thin, W, toS, box, sp, maxSpan) {
  const pad = 3;
  const cx0 = Math.max(0, box.x0 - pad), cy0 = Math.max(0, box.y0 - pad);
  const cw = Math.min(W, box.x1 + 1 + pad) - cx0, ch = Math.min(W, box.y1 + 1 + pad) - cy0;
  const side = Math.max(cw, ch);
  const mk = new Float32Array(side * side);
  for (let y = 0; y < ch; y++) {
    const row = (cy0 + y) * W + cx0;
    for (let x = 0; x < cw; x++) if (label[row + x] === k && thin[row + x] >= 0.5) mk[y * side + x] = 1;
  }
  const contours = traceContours(blurMask(mk, side, side, 0.6), side, side, 0.5, 0.5);
  const inK = (x, y) => {
    const xi = (x / toS) | 0, yi = (y / toS) | 0;
    if (xi < 0 || yi < 0 || xi >= W || yi >= W) return false;
    const i = yi * W + xi;
    return label[i] === k && thin[i] >= 0.35;
  };
  const segs = [];
  const step = Math.max(0.5, 0.45 * toS);
  const probe = Math.max(1, 1.2 * toS);
  for (const c0 of contours) {
    const m = c0.length;
    if (m < 3) continue;
    const c = c0.map(([x, y]) => [(x + cx0) * toS, (y + cy0) * toS]);
    const seg = new Float32Array(m);
    let L = 0;
    for (let i = 0; i < m; i++) { const a = c[i], b = c[(i + 1) % m]; seg[i] = Math.hypot(b[0] - a[0], b[1] - a[1]); L += seg[i]; }
    if (L < sp * 4) continue;
    const steps = Math.max(4, Math.round(L / sp));
    const h = L / steps;
    let si = 0, acc = 0;
    for (let q = 0; q < steps; q++) {
      const at = q * h;
      while (si < m - 1 && acc + seg[si] < at) { acc += seg[si]; si++; }
      const a = c[si], b = c[(si + 1) % m];
      const u = clamp((at - acc) / (seg[si] || 1));
      const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
      const pa = c[(si - 1 + m) % m], pb = c[(si + 2) % m];
      let tx = pb[0] - pa[0], ty = pb[1] - pa[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      let nx = -ty, ny = tx;
      if (!inK(px + nx * probe, py + ny * probe)) { nx = -nx; ny = -ny; }
      if (!inK(px + nx * probe, py + ny * probe)) continue;
      // a stroke is stitched from ONE side (the two sides' inward normals are opposite), so
      // stitches never cross; the slant follows a fixed direction for the same reason
      const dA = nx * 0.6 + ny * 0.8, dB = nx * 0.8 - ny * 0.6;
      if (Math.abs(dA) > 0.2 ? dA < 0 : dB < 0) continue;
      let s = step;
      while (s < maxSpan && inK(px + nx * s, py + ny * s)) s += step;
      const len = s;
      const sx = -ny, sy = nx; // slant axis: the normal turned a quarter, same way on every stroke
      segs.push(px - nx * 0.4, py - ny * 0.4, px + nx * len + sx * len * 0.12, py + ny * len + sy * len * 0.12);
    }
  }
  return segs;
}

/** Stroke satin threads: body + a sheen line whose strength follows the angle to the light. */
function drawSatin(o, segs, rgb, tw, sheen) {
  if (!segs.length) return;
  const lum = luminance(rgbToHex(rgb));
  const body = rgbToHex(rgb.map((v) => v * 0.97));
  const sheenCol = rgbToHex(rgb.map((v) => v + (255 - v) * (lum > 0.7 ? 1 : 0.55)));
  const bodyP = new Path2D();
  const B = 4;
  const sheenP = Array.from({ length: B }, () => new Path2D());
  for (let q = 0; q < segs.length; q += 4) {
    const ax = segs[q], ay = segs[q + 1], bx = segs[q + 2], by = segs[q + 3];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (L < 0.3) continue;
    const tx = dx / L, ty = dy / L;
    let nx = -ty, ny = tx;
    if (nx * L0 + ny * L1 < 0) { nx = -nx; ny = -ny; }
    bodyP.moveTo(ax, ay); bodyP.lineTo(bx, by);
    const across = Math.abs(tx * L1 - ty * L0) / Math.hypot(L0, L1);
    const p = sheenP[Math.min(B - 1, (across * B) | 0)];
    const cut = Math.min(L * 0.25, tw * 1.2), sh = tw * 0.15;
    p.moveTo(ax + tx * cut + nx * sh, ay + ty * cut + ny * sh);
    p.lineTo(bx - tx * cut + nx * sh, by - ty * cut + ny * sh);
  }
  o.lineCap = "butt";
  o.strokeStyle = body;
  o.lineWidth = tw * 0.82;
  o.stroke(bodyP);
  o.lineCap = "round";
  o.strokeStyle = sheenCol;
  o.lineWidth = tw * 0.34;
  for (let b = 0; b < B; b++) {
    const a = sheen * (0.15 + 0.85 * Math.pow((b + 0.5) / B, 1.5)) * (lum < 0.15 ? 0.75 : 1);
    if (a < 0.02) continue;
    o.globalAlpha = Math.min(1, a);
    o.stroke(sheenP[b]);
  }
  o.globalAlpha = 1;
}

/**
 * Tatami (fill stitch) texture as a canvas pattern, rotated 45°: rows `sp` apart of stitches
 * `len` long, staggered by a third per row; dark between rows, a sheen on each row. It is
 * colour-free (black/white alpha) so it textures every thread colour it is composited onto.
 */
function tatami(sp, len) {
  const tw = Math.max(4, Math.round(len)), th = Math.max(3, Math.round(sp * 3));
  const rowH = th / 3;
  const c = createCanvas(tw, th);
  const x = ctx2d(c);
  for (let r = 0; r < 3; r++) {
    const y = r * rowH;
    x.fillStyle = "rgba(0,0,0,0.42)";                 // gap below the row
    x.fillRect(0, y + rowH * 0.78, tw, Math.max(0.6, rowH * 0.22));
    x.fillStyle = "rgba(255,255,255,0.14)";           // sheen along the row top
    x.fillRect(0, y + rowH * 0.12, tw, Math.max(0.5, rowH * 0.22));
    const cut = ((r * tw) / 3) % tw;                  // needle penetration, staggered
    x.fillStyle = "rgba(0,0,0,0.38)";
    x.fillRect(cut, y, Math.max(0.6, sp * 0.3), rowH);
  }
  const pat = ctx2d(createCanvas(1, 1)).createPattern(c, "repeat");
  if (pat && typeof DOMMatrix !== "undefined" && pat.setTransform) pat.setTransform(new DOMMatrix().rotateSelf(45));
  return pat || "rgba(0,0,0,0.3)";
}

/* ───────────────────────────── felt stitching ───────────────────────────── */

/** Zigzag (or running) stitch path along closed polylines (W px → S px by k). */
function stitchPath(contours, k, amp, pitch, running) {
  const p = new Path2D();
  const half = pitch / 2;
  for (const c0 of contours) {
    const m = c0.length;
    if (m < 3) continue;
    const c = c0.map(([x, y]) => [x * k, y * k]);
    const seg = new Float32Array(m);
    let L = 0;
    for (let i = 0; i < m; i++) {
      const a = c[i], b = c[(i + 1) % m];
      seg[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L += seg[i];
    }
    if (L < pitch * 6) continue;
    const steps = Math.max(6, Math.round(L / half) & ~1);
    const h = L / steps;
    let si = 0, acc = 0;
    for (let s = 0; s < steps; s++) {
      const at = s * h;
      while (si < m - 1 && acc + seg[si] < at) { acc += seg[si]; si++; }
      const a = c[si], b = c[(si + 1) % m];
      const ln = seg[si] || 1;
      const u = clamp((at - acc) / ln);
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      if (running) {
        if (s & 1) p.lineTo(x, y); else p.moveTo(x, y);
        continue;
      }
      const pa = c[(si - 1 + m) % m], pb = c[(si + 2) % m];
      const tx = pb[0] - pa[0], ty = pb[1] - pa[1];
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const side = s & 1 ? amp : -amp;
      if (s === 0) p.moveTo(x + nx * side, y + ny * side); else p.lineTo(x + nx * side, y + ny * side);
    }
    if (!running) p.closePath();
  }
  return p;
}

function drawThread(o, path, rgb, lw, scale) {
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const f = (v) => Math.round(clamp(lum < 0.35 ? v + (255 - v) * 0.18 : v * 0.9, 0, 255));
  o.save();
  o.lineJoin = "round"; o.lineCap = "round";
  o.translate(0.5 * scale + 0.2, 0.7 * scale + 0.25);
  o.strokeStyle = "rgba(0,0,0,0.3)";
  o.lineWidth = lw * 1.2;
  o.stroke(path);
  o.restore();
  o.save();
  o.lineJoin = "round"; o.lineCap = "round";
  o.strokeStyle = `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
  o.lineWidth = lw;
  o.stroke(path);
  o.translate(-0.2 * lw, -0.26 * lw);
  o.strokeStyle = `rgba(255,255,255,${lum > 0.6 ? 0.75 : 0.32})`;
  o.lineWidth = lw * 0.38;
  o.stroke(path);
  o.restore();
}

/** First palette colour (preferred first) that separates from `edge`; else the best one. */
function feltFor(preferred, edge, palette) {
  if (contrastRatio(edge, preferred) >= 1.45) return preferred;
  const cands = [palette.secondary, palette.primary, palette.accent, palette.light, palette.dark].filter(Boolean);
  let best = preferred, bc = contrastRatio(edge, preferred);
  for (const c of cands) {
    const cr = contrastRatio(edge, c);
    if (cr >= 1.6) return c;
    if (cr > bc) { bc = cr; best = c; }
  }
  return best;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "chenille",
  name: "Chenille",
  category: "retro",
  blurb: "Fuzzy letterman-jacket patch on stitched felt.",
  method: "Chenille patch",
  stage: "team",
  params: [
    { key: "felt", label: "Felt color", type: "color", default: "accent" },
    { key: "border", label: "Felt border", type: "range", min: 8, max: 44, step: 1, default: 22, unit: "px" },
    { key: "double", label: "Second felt", type: "toggle", default: false },
    { key: "felt2", label: "Second felt color", type: "color", default: "secondary" },
    { key: "fuzz", label: "Fuzz", type: "range", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    { key: "loop", label: "Loop size", type: "range", min: 8, max: 22, step: 1, default: 13, unit: "px" },
  ],
  presets: [
    { name: "Letterman", params: { felt: "accent", border: 22, double: false, fuzz: 50, loop: 13 } },
    { name: "Double felt", params: { felt: "accent", border: 18, double: true, felt2: "secondary", fuzz: 40, loop: 13 } },
    { name: "Fuzzy", params: { felt: "accent", border: 24, double: false, fuzz: 100, loop: 18 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const scale = ctx.scale;
    // analysis grid: everything here is either smooth (felt distances, puff, shadows) or a
    // classification (chenille vs satin); crisp shapes come from the source at S
    const W = S <= 400 ? Math.min(S, 256) : Math.min(S, S <= 1100 ? 512 : 704);
    const kW = W / S, toS = S / W;
    const n = W * W;
    const u = scale * kW; // W px per 1024-unit
    const seed = hashSeed("chenille", ctx.seed);
    let _t = performance.now();
    const mark = (k) => { const P = globalThis.__prof; if (P) { const t = performance.now(); P[k] = Math.round(t - _t); _t = t; } };

    /* ── 1. labels, chenille / satin split ── */
    const small = W === S ? src : resizeCanvas(src, W, W);
    const mask = alphaMask(small);
    const maskB = new Float32Array(n); // hairlines survive thresholding
    for (let i = 0; i < n; i++) maskB[i] = mask[i] * 2 > 1 ? 1 : mask[i] * 2;
    const { label, colors } = threadLabels(small, maskB, W);
    const rd = regionDistance(label, W);
    const loopR = Math.max(0.8, p.loop * 0.5 * scale);      // S px
    const rThick = Math.max(4.5, p.loop * 0.42) * u;        // W px: half-width that holds pile
    const chen = chenilleAreas(label, rd, W, rThick, rThick * rThick * 2.5, colors);
    // satin = logo minus chenille (a hair of overlap: the satin is drawn on top)
    const chenGrow = blurMask(chen, W, W, Math.max(0.5, 0.8 * u));
    const thin = new Float32Array(n), thinCls = new Float32Array(n);
    let chenArea = 0;
    for (let i = 0; i < n; i++) {
      chenArea += chen[i];
      const g = chenGrow[i] > chen[i] ? chenGrow[i] : chen[i];
      thinCls[i] = clamp(1 - g * 1.6);
      thin[i] = maskB[i] * thinCls[i];
    }

    mark("labels");
    /* ── 2. felt shapes ── */
    const sd = signedDistance(maskB, W, W);
    const b1 = p.border * u;
    const close = (0.55 * p.border + 12) * u;
    const m1 = new Float32Array(n);
    for (let i = 0; i < n; i++) m1[i] = clamp(b1 + close - sd[i] + 0.5);
    const sdF1 = blurMask(signedDistance(fillHoles(m1, W), W, W), W, W, 0.9);
    for (let i = 0; i < n; i++) sdF1[i] += close;
    const b2 = p.double ? Math.max(6, 0.72 * p.border) * u : 0;
    const sdOut = b2 > 0 ? sdF1.map((v) => v - b2) : sdF1;

    // felt colours: the felt must separate from the logo's outer edge
    let er = 0, eg = 0, eb = 0, ec = 0;
    {
      const { data } = getPixels(small);
      for (let i = 0; i < n; i += 2) {
        const v = sd[i];
        if (v > -0.5 || v < -3.5 * Math.max(1, u)) continue;
        const j = i * 4;
        if (data[j + 3] < 160) continue;
        er += data[j]; eg += data[j + 1]; eb += data[j + 2]; ec++;
      }
    }
    const edgeHex = ec ? rgbToHex(er / ec, eg / ec, eb / ec) : "#202020";
    const feltHex = feltFor(p.felt, edgeHex, ctx.palette);
    const felt2Hex = b2 > 0 ? (contrastRatio(p.felt2, feltHex) >= 1.25 ? p.felt2 : feltFor(p.felt2, feltHex, ctx.palette)) : p.felt2;
    const felt1 = hexToRgb(feltHex), felt2 = hexToRgb(felt2Hex);

    mark("felt");
    /* ── 3. puff: a pillow per yarn area, grooves where colours meet → light (W) ── */
    const bevel = Math.max(2, (10 + p.loop * 0.9) * u);
    const pil = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (chen[i] <= 0) continue;
      const t = clamp(rd[i] / bevel), q = 1 - t;
      pil[i] = Math.sqrt(1 - q * q) * chen[i];
    }
    const ph = blurMask(pil, W, W, Math.max(0.7, 2.2 * u));
    const puff = new Float32Array(n).fill(1);
    const pStr = bevel * 0.5;
    for (let y = 1; y < W - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (ph[i] <= 0 && chenGrow[i] <= 0) continue;
        const dx = (ph[i + 1] - ph[i - 1]) * 0.5 * pStr, dy = (ph[i + W] - ph[i - W]) * 0.5 * pStr;
        const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        puff[i] = ((-dx * L0 - dy * L1 + L2) * nl) / L2;
      }
    }
    // the pile may spill past the chenille edge onto the felt, but never across a satin line
    const dC = outsideDistance(chen, W, W), dT = outsideDistance(thin, W, W);
    const spill = new Float32Array(n);
    for (let i = 0; i < n; i++) spill[i] = chen[i] > 0.5 ? 1 : thin[i] > 0.5 ? 0 : clamp(dT[i] - dC[i] + 0.5);
    const chenSoft = blurMask(chen, W, W, Math.max(0.6, loopR * 0.3 * kW));

    mark("puff");
    /* ── 4. shadows (W), pre-shifted down-right ── */
    const logoSh = shiftMap(blurMask(maskB, W, W, Math.max(0.7, 3.4 * u)), W, 2.6 * u, 3.4 * u);
    const f1cov = new Float32Array(n);
    for (let i = 0; i < n; i++) f1cov[i] = clamp(0.5 - sdF1[i]);
    const feltSh = b2 > 0 ? shiftMap(blurMask(f1cov, W, W, Math.max(0.6, 1.8 * u)), W, 2 * u, 2.6 * u) : null;
    const outCov = b2 > 0 ? sdOut.map((v) => clamp(0.5 - v)) : f1cov;
    const patchSh = shiftMap(blurMask(outCov, W, W, Math.max(0.8, 4.5 * u)), W, 3.2 * u, 4.2 * u);
    const shReach = 18 * scale + 2;

    mark("shadows");
    /* ── 5. pile height field at S ── */
    let H = null, OWN = null;
    const box = { x0: S, y0: S, x1: -1, y1: -1 };
    if (chenArea > 4) {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (chen[y * W + x] > 0.01) {
        if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; box.y1 = y;
      }
      const ext = loopR * 2;
      box.x0 = Math.max(0, box.x0 * toS - ext); box.y0 = Math.max(0, box.y0 * toS - ext);
      box.x1 = Math.min(S, (box.x1 + 1) * toS + ext); box.y1 = Math.min(S, (box.y1 + 1) * toS + ext);
      H = new Float32Array(S * S);
      OWN = new Uint8Array(S * S);
      splatPile(H, OWN, S, box, loopR, chen, label, W, hashSeed("chenille-loops", ctx.seed));
    }

    mark("splat");
    /* ── 6. composite at S: patch shadow → felt(s) → chenille ── */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const d = img.data;
    const G = 64;
    const n1 = lattice(G, seed + 1), n2 = lattice(G, seed + 2);
    const fCell1 = 1 / Math.max(1.1, 2.0 * scale), fCell2 = 1 / Math.max(4, 14 * scale);
    const yarn = colors.map((c) => {
      const lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
      // pale yarn gets more ambient: white chenille should read white (with texture), not grey
      return { c, lum, ao: 0.5 + 0.3 * lum, base: 0.42 + 0.12 * lum * lum, sheen: 0.12 + 0.2 * (1 - lum) };
    });
    const hScale = loopR * 0.85; // pile relief in S px
    const cx0 = new Int32Array(S), cfx = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      const xw = clamp((x + 0.5) * kW - 0.5, 0, W - 1.001);
      cx0[x] = xw | 0; cfx[x] = xw - (xw | 0);
    }
    for (let y = 0; y < S; y++) {
      const yw = clamp((y + 0.5) * kW - 0.5, 0, W - 1.001);
      const y0 = yw | 0, fy = yw - y0;
      const inBoxY = H && y >= box.y0 && y < box.y1;
      for (let x = 0; x < S; x++) {
        const fx = cfx[x];
        const i00 = y0 * W + cx0[x], i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const dOut = (sdOut[i00] * w00 + sdOut[i10] * w10 + sdOut[i01] * w01 + sdOut[i11] * w11) * toS;
        if (dOut > shReach) continue;
        const k = y * S + x, j = k * 4;
        const aOut = clamp(0.5 - dOut);
        const shA = aOut < 1 ? 0.36 * (patchSh[i00] * w00 + patchSh[i10] * w10 + patchSh[i01] * w01 + patchSh[i11] * w11) : 0;
        let R = 0, Gc = 0, B = 0, A = shA; // premultiplied; the shadow is black
        if (aOut > 0) {
          const ft = 0.965 + 0.045 * vnoise(n1, G, x * fCell1, y * fCell1) + 0.03 * vnoise(n2, G, x * fCell2 + 7.3, y * fCell2 - 3.1);
          if (b2 > 0) {
            const s = 1 - 0.32 * (feltSh[i00] * w00 + feltSh[i10] * w10 + feltSh[i01] * w01 + feltSh[i11] * w11);
            const kk = ft * s, q = 1 - aOut;
            R = R * q + felt2[0] * kk * aOut; Gc = Gc * q + felt2[1] * kk * aOut; B = B * q + felt2[2] * kk * aOut; A = A * q + aOut;
          }
          const dF1 = b2 > 0 ? (sdF1[i00] * w00 + sdF1[i10] * w10 + sdF1[i01] * w01 + sdF1[i11] * w11) * toS : dOut;
          const a1 = clamp(0.5 - dF1);
          if (a1 > 0) {
            const edge = 1 - 0.08 * (1 - smoothstep(0, 2.5 * scale + 0.5, -dF1));
            const s = 1 - 0.45 * (logoSh[i00] * w00 + logoSh[i10] * w10 + logoSh[i01] * w01 + logoSh[i11] * w11);
            const kk = ft * s * edge, q = 1 - a1;
            R = R * q + felt1[0] * kk * a1; Gc = Gc * q + felt1[1] * kk * a1; B = B * q + felt1[2] * kk * a1; A = A * q + a1;
          }
        }
        // chenille pile
        if (inBoxY && x >= box.x0 && x < box.x1) {
          const h = H[k];
          const cs = chenSoft[i00] * w00 + chenSoft[i10] * w10 + chenSoft[i01] * w01 + chenSoft[i11] * w11;
          let pa = smoothstep(0.62, 0.9, cs);
          if (h > 0.02) {
            const sp = spill[i00] * w00 + spill[i10] * w10 + spill[i01] * w01 + spill[i11] * w11;
            const la = smoothstep(0.03, 0.2, h) * sp;
            if (la > pa) pa = la;
          }
          if (pa > 0) {
            let lab = OWN[k] - 1;
            if (lab < 0) {
              const wi = (fy < 0.5 ? (fx < 0.5 ? i00 : i10) : (fx < 0.5 ? i01 : i11));
              lab = label[wi];
              if (lab < 0) { const l2 = label[i00] >= 0 ? label[i00] : label[i11]; lab = l2 >= 0 ? l2 : 0; }
            }
            const Y = yarn[lab] || yarn[0];
            const xa = x > 0 ? k - 1 : k, xb = x < S - 1 ? k + 1 : k;
            const ya = y > 0 ? k - S : k, yb = y < S - 1 ? k + S : k;
            const dx = (H[xb] - H[xa]) * 0.5 * hScale, dy = (H[yb] - H[ya]) * 0.5 * hScale;
            const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            const nx = -dx * nl, ny = -dy * nl, nz = nl;
            const diff = nx * L0 + ny * L1 + nz * L2;
            const ao = Y.ao + (1 - Y.ao) * h;
            const pf = puff[i00] * w00 + puff[i10] * w10 + puff[i01] * w01 + puff[i11] * w11;
            const rdv = rd[i00] * w00 + rd[i10] * w10 + rd[i01] * w01 + rd[i11] * w11;
            const groove = 0.58 + 0.42 * smoothstep(0, loopR * 1.3 * kW + 0.5, rdv);
            const v = ao * (Y.base + 0.92 * (diff < 0 ? 0 : diff)) * clamp(pf, 0.55, 1.35) * groove;
            const nh = nx * H0 + ny * H1 + nz * H2;
            const sp = nh > 0.85 ? Math.pow((nh - 0.85) / 0.15, 3) * Y.sheen * h : 0;
            const c = Y.c;
            let cr = c[0] * v, cg = c[1] * v, cb = c[2] * v;
            if (v > 1) { const e = (v - 1) * 0.6; cr = c[0] + (255 - c[0]) * e; cg = c[1] + (255 - c[1]) * e; cb = c[2] + (255 - c[2]) * e; }
            cr += (255 - cr) * sp; cg += (255 - cg) * sp; cb += (255 - cb) * sp;
            const q = 1 - pa;
            R = R * q + cr * pa; Gc = Gc * q + cg * pa; B = B * q + cb * pa; A = A * q + pa;
          }
        }
        if (A <= 0) continue;
        const m = 1 / A;
        d[j] = R * m; d[j + 1] = Gc * m; d[j + 2] = B * m; d[j + 3] = A * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);

    mark("composite");
    /* ── 7. loose fibres over the chenille edge (where it meets felt) ── */
    const fuzz = p.fuzz / 100;
    if (H && fuzz > 0) {
      const R = rng(hashSeed("chenille-fibres", ctx.seed));
      const paths = colors.map(() => new Path2D());
      const st = loopR * 0.55;
      for (let yy = box.y0; yy < box.y1; yy += st) {
        for (let xx = box.x0; xx < box.x1; xx += st) {
          const qx = Math.min(W - 1, (xx * kW) | 0), qy = Math.min(W - 1, (yy * kW) | 0);
          const q0 = chenSoft[qy * W + qx];
          if (q0 < 0.08 || q0 > 0.95) continue; // cheap reject: not near the chenille edge
          const r0 = R(), r1 = R(), r2 = R(), r3 = R(), r4 = R(), r5 = R();
          const px = xx + (r4 - 0.5) * st, py = yy + (r5 - 0.5) * st;
          const xw = px * kW - 0.5, yw = py * kW - 0.5;
          const cs = bil(chenSoft, W, xw, yw);
          if (cs < 0.25 || cs > 0.8 || r0 > fuzz * 0.75) continue;
          if (bil(spill, W, xw, yw) < 0.5) continue;
          const wi = Math.min(W - 1, Math.max(0, Math.round(yw))) * W + Math.min(W - 1, Math.max(0, Math.round(xw)));
          let lab = label[wi];
          if (lab < 0 || chen[wi] < 0.3) { const o2 = OWN[Math.min(S - 1, py | 0) * S + Math.min(S - 1, px | 0)] - 1; lab = o2; }
          if (lab < 0) continue;
          const gx = bil(chenSoft, W, xw + 1, yw) - bil(chenSoft, W, xw - 1, yw);
          const gy = bil(chenSoft, W, xw, yw + 1) - bil(chenSoft, W, xw, yw - 1);
          const ga = Math.atan2(-gy, -gx) + (r1 - 0.5) * 2.2;     // outward, fanned
          const len = loopR * (0.5 + 1.4 * r2 * r2) * (0.55 + 0.75 * fuzz);
          const bend = (r3 - 0.5) * len * 0.9;
          const ca = Math.cos(ga), sa = Math.sin(ga);
          const f = paths[lab];
          f.moveTo(px - ca * loopR * 0.3, py - sa * loopR * 0.3);
          f.quadraticCurveTo(px + ca * len * 0.5 - sa * bend, py + sa * len * 0.5 + ca * bend, px + ca * len, py + sa * len);
        }
      }
      o.lineCap = "round";
      o.lineWidth = Math.max(0.55, loopR * 0.2);
      colors.forEach((c, k) => {
        const lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
        o.strokeStyle = rgbToHex(c.map((v) => (lum < 0.3 ? v + (255 - v) * 0.15 : v * 0.92)));
        o.globalAlpha = 0.85;
        o.stroke(paths[k]);
      });
      o.globalAlpha = 1;
    }

    mark("fibres");
    /* ── 8. satin-stitched detail on top (thin strokes, keylines, small lettering) ── */
    let thinArea = 0;
    for (let i = 0; i < n; i++) thinArea += thin[i];
    if (thinArea > 2) {
      const layer = createCanvas(S, S);
      const lx = ctx2d(layer);
      lx.drawImage(src, 0, 0);
      lx.globalCompositeOperation = "destination-in";
      lx.imageSmoothingEnabled = true;
      lx.imageSmoothingQuality = "high";
      lx.drawImage(maskToCanvas(thinCls, W, W, "#000"), 0, 0, S, S);
      lx.globalCompositeOperation = "source-atop";
      const sp = Math.max(1.15, 2.6 * scale);
      if (sp >= 2) {
        // big renders: a tatami fill texture under the satin columns, so a detail wider than
        // a satin column still reads as stitched (a digitizer fills those)
        lx.fillStyle = tatami(sp, Math.max(6, 9 * scale));
        lx.fillRect(0, 0, S, S);
      } else {
        lx.fillStyle = "rgba(0,0,0,0.3)"; // the gaps between stitches
        lx.fillRect(0, 0, S, S);
      }
      // per-thread satin columns
      const K = colors.length;
      const bx0 = new Int32Array(K).fill(W), by0 = new Int32Array(K).fill(W), bx1 = new Int32Array(K).fill(-1), by1 = new Int32Array(K).fill(-1);
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x, l = label[i];
          if (l < 0 || thin[i] < 0.5) continue;
          if (x < bx0[l]) bx0[l] = x; if (x > bx1[l]) bx1[l] = x;
          if (y < by0[l]) by0[l] = y; if (y > by1[l]) by1[l] = y;
        }
      }
      const maxSpan = (rThick * 4.6 + 3 * u) * toS;
      for (let kk = 0; kk < K; kk++) {
        if (bx1[kk] < 0) continue;
        const segs = satinSegments(kk, label, thin, W, toS, { x0: bx0[kk], y0: by0[kk], x1: bx1[kk], y1: by1[kk] }, sp, maxSpan);
        drawSatin(lx, segs, colors[kk], sp, 0.75);
      }
      // raised thread: a tight shadow under the satin
      const sh = blurCanvas(tintCanvas(layer, "#000000"), Math.max(0.6, 1.3 * scale));
      o.save();
      o.globalAlpha = 0.5;
      o.drawImage(sh, 0.9 * scale, 1.3 * scale);
      o.restore();
      o.drawImage(layer, 0, 0);
    }

    mark("satin");
    /* ── 9. felt stitching: zigzag over the inner felt's edge, running stitch on the outer ── */
    const lw = Math.max(0.8, 1.8 * scale);
    const pitch = Math.max(2.8, 6.4 * scale);
    const negF1 = new Float32Array(n);
    for (let i = 0; i < n; i++) negF1[i] = -sdF1[i];
    if (b2 > 0) {
      const c1 = traceContours(negF1, W, W, 0.3 * u, 0.5);
      drawThread(o, stitchPath(c1, toS, Math.max(1.2, 3.2 * scale), pitch, false), felt1, lw, scale);
      const negO = sdOut.map((v) => -v);
      const c2 = traceContours(negO, W, W, Math.min(b2 * 0.45, 5 * u), 0.5);
      drawThread(o, stitchPath(c2, toS, 0, Math.max(3, 7 * scale), true), felt2, lw, scale);
    } else {
      const inset = Math.min(b1 * 0.42, 6.5 * u);
      const c1 = traceContours(negF1, W, W, inset, 0.5);
      drawThread(o, stitchPath(c1, toS, Math.max(1.2, 3.2 * scale), pitch, false), felt1, lw, scale);
    }
    mark("stitch");
    return out;
  },
};
