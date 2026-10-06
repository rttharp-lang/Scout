// "Neon" — the logo bent into glowing glass tubes. A sign maker traces the drawing, not
// the fill: every thin ink stroke (key lines, outline bands, lettering) becomes ONE tube
// along its centre line, and the big flat shapes get a tube along their edges (the
// silhouette and the boundaries between contrasting colours). Each tube has a white-hot
// core, saturated glass colour and a soft multi-layer glow; the outer tubes and the
// inner detail alternate between two team colours pushed to neon saturation, with a
// dark electrode gap where one tube ends and the next begins. Optional: a faint unlit
// fill and a couple of flickering / dead segments.
//
// Each tube piece takes ONE colour (the outline stays one continuous outer tube), stray
// short dashes are pruned, hairline art is thickened before tracing so it doesn't break
// up, and a tight smoky backing under the glow keeps the glass readable on light shirts.
//
// Structure (same as halftone.js):
//   1. analysis at D = min(S, 768): palette regions → thin strokes vs thick shapes →
//      centre lines (distance-field ridges) + region edges → tube distance fields;
//   2. compositing at full S with bilinear distance fields (smooth tubes at any size);
//   3. transparent background, deterministic (seeded flicker), team palette by default.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, blurCanvas, smoothstep, hexToRgb, rgbToHsl,
  hslToRgb, nearestColorIndex, insideDistance, outsideDistance, maskBounds, rng, hashSeed, lerp,
} from "../core.js";
import { extractPalette } from "../image.js";

/* ───────────────────────────── colour ───────────────────────────── */

/** Push a team colour to neon: full saturation at a luminous lightness; neutrals → ice white. */
export function neonize(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  // near-black with almost no chroma (a palette's "dark", #0B0D10) has no real hue: ice white
  if (s * (1 - Math.abs(2 * l - 1)) < 0.05 && l < 0.2) return [236, 246, 255];
  if (s < 0.14 || l > 0.94 || l < 0.04) return l < 0.5 && s >= 0.14 ? hslToRgb(h, 1, 0.6) : [236, 246, 255];
  // blues/violets need more lightness to glow; yellows less to stay saturated
  const hl = h >= 195 && h <= 290 ? 0.62 : h >= 40 && h <= 75 ? 0.55 : 0.6;
  return hslToRgb(h, 1, hl);
}

/* ───────────────────────────── analysis ───────────────────────────── */

/** Palette label per pixel (−1 = transparent), 1-px anti-aliasing slivers folded into a neighbour. */
function labelMap(data, D, palRGB) {
  const n = D * D;
  const lab = new Int8Array(n);
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (data[j + 3] < 128) { lab[i] = -1; continue; }
    const r = data[j], g = data[j + 1], b = data[j + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let k = cache[key];
    if (k < 0) k = cache[key] = nearestColorIndex(r, g, b, palRGB);
    lab[i] = k;
  }
  const out = new Int8Array(lab);
  const cnt = new Int16Array(16);
  for (let pass = 0; pass < 2; pass++) {
    const srcL = pass ? out.slice() : lab;
    for (let y = 1; y < D - 1; y++) {
      for (let x = 1; x < D - 1; x++) {
        const i = y * D + x, l = srcL[i];
        if (l < 0) continue;
        if (srcL[i - 1] === l && srcL[i + 1] === l && srcL[i - D] === l && srcL[i + D] === l) continue;
        cnt.fill(0);
        let own = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const q = srcL[i + oy * D + ox];
            if (q === l) own++;
            else if (q >= 0) cnt[q]++;
          }
        }
        if (own > 3) continue;
        let best = -1, bc = 0;
        for (let q = 0; q < 16; q++) if (cnt[q] > bc) { bc = cnt[q]; best = q; }
        if (best >= 0 && bc >= 3) out[i] = best;
      }
    }
  }
  return out;
}

/**
 * Tube centre lines at D. Returns { C: Uint8Array (1 = a tube runs here), dThin }.
 *  - thin = pixels of a colour region that no disc of radius T fits in (strokes, bands).
 *    Strokes in a colour that contrasts with what they touch (key lines, outline bands,
 *    lettering) are thinned to a 1-px centre line with the corner spurs pruned;
 *    low-contrast thin shapes (soft shading) are ignored.
 *  - thick shapes contribute their edges against transparency and against other
 *    regions of clearly different colour.
 */
function centreLines(label, palRGB, D, T, w) {
  const n = D * D;
  const K = palRGB.length;
  const lumOf = palRGB.map(([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255);
  const differs = (a, b) => {
    if (a < 0 || b < 0) return true;
    const A = palRGB[a], B = palRGB[b];
    return Math.abs(lumOf[a] - lumOf[b]) > 0.2 || Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) > 120;
  };
  // per-region edge distance + label adjacency counts (transparent = index K)
  const interior = new Float32Array(n);
  const adj = new Float64Array((K + 1) * (K + 1));
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const i = y * D + x, l = label[i];
      if (x < D - 1 && label[i + 1] !== l) { const a = l < 0 ? K : l, b = label[i + 1] < 0 ? K : label[i + 1]; adj[a * (K + 1) + b]++; adj[b * (K + 1) + a]++; }
      if (y < D - 1 && label[i + D] !== l) { const a = l < 0 ? K : l, b = label[i + D] < 0 ? K : label[i + D]; adj[a * (K + 1) + b]++; adj[b * (K + 1) + a]++; }
      if (l < 0) continue;
      if (x > 0 && label[i - 1] !== l) continue;
      if (x < D - 1 && label[i + 1] !== l) continue;
      if (y > 0 && label[i - D] !== l) continue;
      if (y < D - 1 && label[i + D] !== l) continue;
      interior[i] = 1;
    }
  }
  // a label is "line ink" when most of its boundary is against clearly different colours
  const lineInk = new Uint8Array(K);
  for (let a = 0; a < K; a++) {
    let tot = 0, hi = 0;
    for (let b = 0; b <= K; b++) {
      const c = adj[a * (K + 1) + b];
      tot += c;
      if (differs(a, b === K ? -1 : b)) hi += c;
    }
    lineInk[a] = tot > 0 && hi > tot * 0.55 ? 1 : 0;
  }
  const dReg = insideDistance(interior, D, D);
  // opening: thick = within T of a pixel deeper than T in its own region
  const core = new Float32Array(n);
  for (let i = 0; i < n; i++) core[i] = label[i] >= 0 && dReg[i] + 0.5 > T ? 1 : 0;
  dropSmall(core, D, Math.max(6, T * T * 1.5));   // corner blobs of a band are not "shapes"
  const toCore = outsideDistance(core, D, D);
  const thin = new Uint8Array(n);       // 1 = thin line-ink stroke, 2 = thin but ignored
  const thinF = new Float32Array(n);
  let thinCount = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] < 0 || toCore[i] <= T + 0.5) continue;
    if (lineInk[label[i]]) { thin[i] = 1; thinF[i] = 1; thinCount++; } else thin[i] = 2;
  }
  // figure / ground, per connected colour component:
  //  - mostly thin → a stroke (key lines, outline bands, letters), centre-lined;
  //  - mostly thick → a shape: its thin necks (the ring between arched letters, a star's
  //    points) are outlined with the rest of it, not centre-lined;
  //  - small and enclosed by a single STROKE → a counter (inside of an O, B, a pupil
  //    ring): no tube of its own. Letters enclosed by a panel are not counters.
  {
    const comp = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    const area = [], thinN = [], start = [], end = [];
    const order = new Int32Array(n);
    let nc = 0, w0 = 0;
    for (let s0 = 0; s0 < n; s0++) {
      const l = label[s0];
      if (l < 0 || comp[s0] >= 0) continue;
      let head = 0, tail = 0, th = 0;
      queue[tail++] = s0; comp[s0] = nc;
      while (head < tail) {
        const i = queue[head++], x = i % D;
        if (thin[i]) th++;
        if (x > 0 && label[i - 1] === l && comp[i - 1] < 0) { comp[i - 1] = nc; queue[tail++] = i - 1; }
        if (x < D - 1 && label[i + 1] === l && comp[i + 1] < 0) { comp[i + 1] = nc; queue[tail++] = i + 1; }
        if (i >= D && label[i - D] === l && comp[i - D] < 0) { comp[i - D] = nc; queue[tail++] = i - D; }
        if (i < n - D && label[i + D] === l && comp[i + D] < 0) { comp[i + D] = nc; queue[tail++] = i + D; }
      }
      order.set(queue.subarray(0, tail), w0);
      start.push(w0); end.push(w0 + tail); w0 += tail;
      area.push(tail); thinN.push(th); nc++;
    }
    // the single component around each one (-1 = touches air / several / the border)
    const around = new Int32Array(nc).fill(-2);
    for (let c = 0; c < nc; c++) {
      for (let q = start[c]; q < end[c] && around[c] !== -1; q++) {
        const i = order[q], x = i % D;
        for (let k = 0; k < 4; k++) {
          const j = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x < D - 1 ? i + 1 : -1) : k === 2 ? (i >= D ? i - D : -1) : (i < n - D ? i + D : -1);
          const cj = j < 0 ? -1 : label[j] < 0 ? -1 : comp[j];
          if (cj === c) continue;
          if (cj < 0) { around[c] = -1; break; }
          if (around[c] === -2) around[c] = cj;
          else if (around[c] !== cj) { around[c] = -1; break; }
        }
      }
    }
    const isStroke = (c) => thinN[c] >= area[c] * 0.7;
    for (let c = 0; c < nc; c++) {
      const enc = around[c];
      const counter = enc >= 0 && area[c] < T * T * 6 && isStroke(enc);
      const tiny = counter && area[c] < w * w * 4;
      if (isStroke(c) && !counter) continue;
      for (let q = start[c]; q < end[c]; q++) {
        const i = order[q];
        if (thin[i] === 1) { thinF[i] = 0; thinCount--; }
        if (tiny) thin[i] = 3; else if (thin[i] === 1) thin[i] = counter ? 2 : 0;
      }
    }
  }
  const C = new Uint8Array(n);
  const id = new Uint8Array(n);     // which stroke / edge a centre-line pixel belongs to
  let dThin = null;
  if (thinCount) {
    dThin = dReg;   // stroke half-width (a thin stroke is its own colour region)
    // fill pin holes first (AA specks, stitch holes would become loops), then cut a seam
    // so each stroke colour is thinned on its own (adjacent outline bands stay apart)
    const sk = new Uint8Array(n);
    for (let i = 0; i < n; i++) sk[i] = thin[i] === 1 ? 1 : 0;
    fillHoles(sk, D, 3 + 3 * (w / 9) * (w / 9));   // AA specks only — letter counters stay open
    for (let y = 1; y < D - 1; y++) {
      for (let x = 1; x < D - 1; x++) {
        const i = y * D + x, l = label[i];
        if (!sk[i] || thin[i] !== 1) continue;
        for (let oy = -D; oy <= D; oy += D) {
          for (let ox = -1; ox <= 1; ox++) {
            const j = i + oy + ox;
            if (thin[j] === 1 && label[j] !== l && label[j] < l) { sk[i] = 0; oy = 2 * D; break; }
          }
        }
      }
    }
    zhangSuen(sk, D);
    pruneSpurs(sk, D, dThin);
    pruneSpurs(sk, D, dThin);
    for (let i = 0; i < n; i++) if (sk[i]) { C[i] = 1; id[i] = 1 + label[i]; }
  }
  // edges of thick shapes (thin line-ink strokes already carry their own tube)
  for (let y = 0; y < D - 1; y++) {
    for (let x = 0; x < D - 1; x++) {
      const i = y * D + x;
      const la = label[i];
      for (let k = 0; k < 2; k++) {
        const j = k ? i + D : i + 1;
        const lb = label[j];
        if (la === lb) continue;
        if (thin[i] === 1 || thin[j] === 1 || thin[i] === 3 || thin[j] === 3) continue;
        if (!differs(la, lb)) continue;
        const a = la < 0 ? K : la, b = lb < 0 ? K : lb;
        const e = 32 + Math.min(a, b) * (K + 1) + Math.max(a, b);
        if (la >= 0 && !C[i]) { C[i] = 1; id[i] = e; }
        if (lb >= 0 && !C[j]) { C[j] = 1; id[j] = e; }
      }
    }
  }
  return { C, id, dThin };
}

/** Zhang–Suen thinning in place (img: Uint8Array 0/1, D×D) → 1-px 8-connected skeleton. */
function zhangSuen(img, D) {
  // candidate list as a typed array, compacted in place (no per-pass JS arrays → no GC churn)
  let nc = 0;
  for (let y = 1; y < D - 1; y++) for (let x = 1; x < D - 1; x++) if (img[y * D + x]) nc++;
  const cand = new Int32Array(nc);
  nc = 0;
  for (let y = 1; y < D - 1; y++) for (let x = 1; x < D - 1; x++) if (img[y * D + x]) cand[nc++] = y * D + x;
  for (let y = 0; y < D; y++) { img[y * D] = 0; img[y * D + D - 1] = 0; }
  for (let x = 0; x < D; x++) { img[x] = 0; img[(D - 1) * D + x] = 0; }
  const del = new Int32Array(nc);
  for (let iter = 0; iter < 200; iter++) {
    let changed = 0;
    for (let step = 0; step < 2; step++) {
      let nd = 0;
      for (let q = 0; q < nc; q++) {
        const i = cand[q];
        if (!img[i]) continue;
        const p2 = img[i - D], p3 = img[i - D + 1], p4 = img[i + 1], p5 = img[i + D + 1];
        const p6 = img[i + D], p7 = img[i + D - 1], p8 = img[i - 1], p9 = img[i - D - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (A !== 1) continue;
        if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del[nd++] = i;
      }
      for (let q = 0; q < nd; q++) img[del[q]] = 0;
      changed += nd;
    }
    if (!changed) break;
    let k = 0;
    for (let q = 0; q < nc; q++) if (img[cand[q]]) cand[k++] = cand[q];
    nc = k;
  }
}

/**
 * Remove skeleton branches that run from an end point to a junction in less than the
 * local stroke half-width: the spurs thinning grows toward stroke corners. Junctions /
 * end points use the crossing number (0→1 transitions around the pixel), so staircase
 * steps of the 8-connected skeleton don't count as junctions.
 */
function pruneSpurs(sk, D, dThin) {
  const n = D * D;
  const ring = [-D, -D + 1, 1, D + 1, D, D - 1, -1, -D - 1];   // clockwise from north
  const cross = (i) => {
    let c = 0;
    for (let k = 0; k < 8; k++) if (!sk[i + ring[k]] && sk[i + ring[(k + 1) & 7]]) c++;
    return c;
  };
  const mark = new Int32Array(n);
  let stamp = 0;
  const ends = [];
  for (let i = D + 1; i < n - D - 1; i++) if (sk[i] && cross(i) === 1) ends.push(i);
  const path = [];
  for (const e of ends) {
    if (!sk[e]) continue;
    stamp++;
    path.length = 0;
    let cur = e, junction = -1;
    mark[e] = stamp;
    for (let step = 0; step < 300; step++) {
      path.push(cur);
      // prefer a 4-neighbour, then a diagonal; claim all candidates so staircases don't fork
      let next = -1;
      for (let k = 0; k < 8; k += 2) { const j = cur + ring[k]; if (sk[j] && mark[j] !== stamp) { next = j; break; } }
      if (next < 0) for (let k = 1; k < 8; k += 2) { const j = cur + ring[k]; if (sk[j] && mark[j] !== stamp) { next = j; break; } }
      if (next < 0) break;                                   // stroke ended: keep it
      if (cross(next) >= 3) { junction = next; break; }
      for (let k = 0; k < 8; k++) { const j = cur + ring[k]; if (sk[j] && mark[j] !== stamp && j !== next && cross(j) < 3) { mark[j] = stamp; path.push(j); } }
      mark[next] = stamp;
      cur = next;
    }
    if (junction < 0) continue;
    const maxLen = (dThin ? dThin[junction] : 0) * 1.5 + 2;
    if (path.length <= maxLen) for (const i of path) sk[i] = 0;
  }
}

/** Set enclosed 0-components (4-connected, not touching the border) smaller than maxArea to 1. */
function fillHoles(m, D, maxArea) {
  const n = D * D;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (m[s] || seen[s]) continue;
    let head = 0, tail = 0, border = false;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % D;
      if (x === 0 || x === D - 1 || i < D || i >= n - D) border = true;
      if (x > 0 && !m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < D - 1 && !m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= D && !m[i - D] && !seen[i - D]) { seen[i - D] = 1; queue[tail++] = i - D; }
      if (i < n - D && !m[i + D] && !seen[i + D]) { seen[i + D] = 1; queue[tail++] = i + D; }
    }
    if (!border && tail <= maxArea) for (let q = 0; q < tail; q++) m[queue[q]] = 1;
  }
}

/** Faint unlit fill: the logo's own tones pulled toward the inner tube colour, low alpha. */
function fillLayer(src, tint) {
  const S = src.width;
  const img = getPixels(src);
  const d = img.data;
  for (let j = 0; j < d.length; j += 4) {
    if (!d[j + 3]) continue;
    const l = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
    const k = 0.25 + 0.35 * l;
    d[j] = tint[0] * k; d[j + 1] = tint[1] * k; d[j + 2] = tint[2] * k;
    d[j + 3] = d[j + 3] * 0.2;
  }
  const c = createCanvas(S, S);
  ctx2d(c).putImageData(img, 0, 0);
  return c;
}

/** Bilinear upsample of a half-resolution map (H×H, H = ceil(D/2)) into out (D×D). */
function upsampleHalf(m, H, out, D) {
  for (let y = 0; y < D; y++) {
    let fy = (y + 0.5) * 0.5 - 0.5;
    fy = fy < 0 ? 0 : fy > H - 1 ? H - 1 : fy;
    const y0 = fy | 0, y1 = Math.min(H - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < D; x++) {
      let fx = (x + 0.5) * 0.5 - 0.5;
      fx = fx < 0 ? 0 : fx > H - 1 ? H - 1 : fx;
      const x0 = fx | 0, x1 = Math.min(H - 1, x0 + 1), wx = fx - x0;
      out[y * D + x] = (m[y0 * H + x0] * (1 - wx) + m[y0 * H + x1] * wx) * (1 - wy) + (m[y1 * H + x0] * (1 - wx) + m[y1 * H + x1] * wx) * wy;
    }
  }
  return out;
}

/** In-place 3×3 binomial smoothing (1-2-1 separable) of a D×D float map; returns it. */
function smooth3(m, D) {
  const t = new Float32Array(m.length);
  for (let y = 0; y < D; y++) {
    const r = y * D;
    t[r] = (m[r] * 3 + m[r + 1]) * 0.25;
    for (let x = 1; x < D - 1; x++) t[r + x] = (m[r + x - 1] + 2 * m[r + x] + m[r + x + 1]) * 0.25;
    t[r + D - 1] = (m[r + D - 2] + 3 * m[r + D - 1]) * 0.25;
  }
  for (let x = 0; x < D; x++) m[x] = (t[x] * 3 + t[x + D]) * 0.25;
  for (let y = 1; y < D - 1; y++) {
    const r = y * D;
    for (let x = 0; x < D; x++) m[r + x] = (t[r + x - D] + 2 * t[r + x] + t[r + x + D]) * 0.25;
  }
  const L = (D - 1) * D;
  for (let x = 0; x < D; x++) m[L + x] = (t[L + x - D] + 3 * t[L + x]) * 0.25;
  return m;
}

/** Zero 4-connected components of a 0/1 Float32 mask smaller than minArea px. */
function dropSmall(m, D, minArea) {
  const n = D * D;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!m[s] || seen[s]) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % D;
      if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < D - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= D && m[i - D] && !seen[i - D]) { seen[i - D] = 1; queue[tail++] = i - D; }
      if (i < n - D && m[i + D] && !seen[i + D]) { seen[i + D] = 1; queue[tail++] = i + D; }
    }
    if (tail < minArea) for (let q = 0; q < tail; q++) m[queue[q]] = 0;
  }
}

/**
 * Tubes can't overlap. The centre lines are split into pieces (8-connected, same stroke /
 * edge); pieces are placed silhouette edges first, then strokes, then interior edges
 * (longest first within each class). A piece is dropped whole when most of it would run
 * within minSep of a tube already placed — outline bands too tight to bend separately
 * collapse into one tube instead of fusing into a blob, and nothing gets dashed.
 */
function separate(C, id, D, minSep, K) {
  const n = D * D;
  const comp = new Int32Array(n).fill(-1);
  const pieces = [];
  const queue = new Int32Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (!C[s0] || comp[s0] >= 0) continue;
    const me = id[s0], ci = pieces.length;
    let head = 0, tail = 0;
    queue[tail++] = s0; comp[s0] = ci;
    while (head < tail) {
      const i = queue[head++], x = i % D;
      for (let oy = -D; oy <= D; oy += D) {
        for (let ox = -1; ox <= 1; ox++) {
          if ((ox < 0 && x === 0) || (ox > 0 && x === D - 1)) continue;
          const j = i + oy + ox;
          if (j < 0 || j >= n || !C[j] || comp[j] >= 0 || id[j] !== me) continue;
          comp[j] = ci; queue[tail++] = j;
        }
      }
    }
    const silhouette = me >= 32 && (me - 32) % (K + 1) === K;
    pieces.push({ px: queue.slice(0, tail), cls: silhouette ? 0 : me < 32 ? 1 : 2 });
  }
  const order = pieces.map((_, k) => k).sort((a, b) => pieces[a].cls - pieces[b].cls || pieces[b].px.length - pieces[a].px.length || a - b);
  const owner = new Int32Array(n);   // piece index + 1 of the tube claiming this pixel
  const r = Math.ceil(minSep), r2 = minSep * minSep;
  for (const k of order) {
    const px = pieces[k].px;
    let hit = 0;
    for (let q = 0; q < px.length; q++) { const o = owner[px[q]]; if (o && o !== k + 1) hit++; }
    if (hit > px.length * 0.5) { for (let q = 0; q < px.length; q++) C[px[q]] = 0; continue; }
    for (let q = 0; q < px.length; q++) {
      const i = px[q], x = i % D, y = (i / D) | 0;
      for (let oy = -r; oy <= r; oy++) {
        const yy = y + oy;
        if (yy < 0 || yy >= D) continue;
        for (let ox = -r; ox <= r; ox++) {
          const xx = x + ox;
          if (xx < 0 || xx >= D || ox * ox + oy * oy > r2) continue;
          const j = yy * D + xx;
          if (!owner[j]) owner[j] = k + 1;
        }
      }
    }
  }
}

/**
 * Drop short isolated tubes: centre-line groups (pixels within `reach` px count as one
 * group, so a dotted skeleton stays one line) with fewer than minPx pixels. Stray dashes
 * and needles between real tubes read as glitches, not as bent glass.
 */
function pruneShort(C, D, minPx, reach) {
  const n = D * D;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  const R = Math.max(1, Math.round(reach));
  for (let s = 0; s < n; s++) {
    if (!C[s] || seen[s]) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % D, y = (i / D) | 0;
      const y0 = Math.max(0, y - R), y1 = Math.min(D - 1, y + R);
      const x0 = Math.max(0, x - R), x1 = Math.min(D - 1, x + R);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0, j = yy * D + x0; xx <= x1; xx++, j++) {
          if (!C[j] || seen[j]) continue;
          seen[j] = 1; queue[tail++] = j;
        }
      }
    }
    if (tail < minPx) for (let q = 0; q < tail; q++) C[queue[q]] = 0;
  }
}

/** Euclidean distance (px) to the nearest set pixel of C, exact up to R, capped at R beyond. */
function nearDistance(C, D, R) {
  const n = D * D;
  const out = new Float32Array(n).fill(R);
  const ri = Math.ceil(R);
  const offs = [], dist = [];
  for (let oy = -ri; oy <= ri; oy++) {
    for (let ox = -ri; ox <= ri; ox++) {
      const d = Math.hypot(ox, oy);
      if (d < R) { offs.push(ox, oy); dist.push(d); }
    }
  }
  const m = dist.length;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      if (!C[y * D + x]) continue;
      const inner = x >= ri && y >= ri && x < D - ri && y < D - ri;
      for (let k = 0; k < m; k++) {
        const xx = x + offs[2 * k], yy = y + offs[2 * k + 1];
        if (!inner && (xx < 0 || yy < 0 || xx >= D || yy >= D)) continue;
        const j = yy * D + xx;
        if (dist[k] < out[j]) out[j] = dist[k];
      }
    }
  }
  return out;
}

/** Drop connected bits of the centre-line set smaller than minPx (dots, AA noise). */
function pruneSmall(C, D, minPx) {
  const n = D * D;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!C[s] || seen[s]) continue;
    let head = 0, tail = 0;
    queue[tail++] = s; seen[s] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % D;
      for (let oy = -D; oy <= D; oy += D) {
        for (let ox = -1; ox <= 1; ox++) {
          if ((ox < 0 && x === 0) || (ox > 0 && x === D - 1)) continue;
          const j = i + oy + ox;
          if (j < 0 || j >= n || !C[j] || seen[j]) continue;
          seen[j] = 1; queue[tail++] = j;
        }
      }
    }
    if (tail < minPx) for (let q = 0; q < tail; q++) C[queue[q]] = 0;
  }
}


/**
 * The expensive, colour-independent part of a neon render: palette regions → tube centre
 * lines → per-tube colour class, distance to the glass and tube radius at D. Depends only on
 * the source pixels, D and the tube width, so it is memoized (one entry) for slider drags.
 */
function analyse(srcFull, dataFull, DF, sc, width) {
  // work on a padded square around the logo only (the 14% margins hold no tubes); the
  // maps live at (ox, oy) in the D grid. ox / oy are even so they land exactly on the
  // half-resolution glow grid
  const aF = new Float32Array(DF * DF);
  for (let i = 0, j = 3; i < aF.length; i++, j += 4) aF[i] = dataFull[j] / 255;
  const bF = maskBounds(aF, DF, DF, 0.02);
  if (bF.empty) return null;
  const pad = Math.ceil(Math.max(1.6, width * sc) + 12);
  let side = Math.max(bF.x1 - bF.x0, bF.y1 - bF.y0) + 2 * pad + 2;
  side = Math.min(DF, side + (side & 1));
  const ox = Math.max(0, Math.min(DF - side, (bF.x0 + bF.x1 - side) >> 1)) & ~1;
  const oy = Math.max(0, Math.min(DF - side, (bF.y0 + bF.y1 - side) >> 1)) & ~1;
  const D = side;
  const n = D * D;
  let srcD = createCanvas(D, D);
  ctx2d(srcD).drawImage(srcFull, -ox, -oy);
  let dataD = getPixels(srcD).data;
  const alpha = new Float32Array(n);
  for (let i = 0, j = 3; i < n; i++, j += 4) alpha[i] = dataD[j] / 255;
  const bb = maskBounds(alpha, D, D, 0.5);
  if (bb.empty) return null;
  let depth = insideDistance(alpha, D, D, 0.5);
  // hairline art (sub-pixel strokes at this size) is thickened by a pixel all round so
  // the strokes don't break apart when binarized; the tubes follow their centre lines,
  // so the drawing itself doesn't change
  {
    let opaque = 0, thick = 0;
    for (let i = 0; i < n; i++) if (alpha[i] >= 0.5) { opaque++; if (depth[i] > Math.max(1.5, 4 * sc)) thick++; }
    if (opaque > 0 && thick < opaque * 0.12) {
      const g = createCanvas(D, D), gx = ctx2d(g);
      for (const [ox, oy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]]) gx.drawImage(srcD, ox, oy);
      srcD = g;
      dataD = getPixels(g).data;
      for (let i = 0, j = 3; i < n; i++, j += 4) alpha[i] = dataD[j] / 255;
      depth = insideDistance(alpha, D, D, 0.5);
    }
  }
  const small = resizeCanvas(srcD, Math.min(D, 160), Math.min(D, 160));
  const pal = extractPalette(small, 7, { maxSamples: 4000 }).filter((c) => c.weight > 0.006);
  const palRGB = (pal.length ? pal : [{ hex: "#808080" }]).map((c) => hexToRgb(c.hex));
  const label = labelMap(dataD, D, palRGB);
  const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);   // D px

  const w = Math.max(1.6, width * sc);                 // tube width, D px
  const T = Math.max(2, 13 * sc);
  const { C, id, dThin } = centreLines(label, palRGB, D, T, w);
  separate(C, id, D, w * 1.25, palRGB.length);
  pruneSmall(C, D, Math.max(4, w * 1.6));
  pruneShort(C, D, Math.max(6, w * 1.5), Math.max(1.5, w * 0.45));

  // outer tubes (near the silhouette) vs inner detail, split with an electrode gap
  const thr = T * 1.15 + w + 1;
  const CA = new Float32Array(n), CB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!C[i]) continue;
    // outer = near the silhouette, or the centre line of a band that touches the air
    // (an outline stroke: its centre sits half its width in from the edge)
    const outer = depth[i] <= thr || (id[i] < 32 && dThin && depth[i] <= dThin[i] * 1.35 + 1.5);
    if (outer) CA[i] = 1; else CB[i] = 1;
  }
  // majority vote per tube so a colour only changes at a real hand-off; then a
  // narrow class map (half resolution) says which colour each tube pixel is, and where
  // an outer tube hands over to an inner one (class ≈ ½) the glass gets an electrode gap
  const H2 = Math.ceil(D / 2), nH = H2 * H2;
  const cls = new Float32Array(n);
  {
    const hA = new Float32Array(nH), hB = new Float32Array(nH);
    // one colour per tube piece (8-connected run of one stroke / one edge): the
    // outline of a mascot stays one continuous outer tube even where inner detail
    // crowds it
    hA.fill(0); hB.fill(0);
    const seen = new Uint8Array(n), queue = new Int32Array(n);
    for (let s0 = 0; s0 < n; s0++) {
      if (!C[s0] || seen[s0]) continue;
      const me = id[s0];
      let head = 0, tail = 0, va = 0;
      queue[tail++] = s0; seen[s0] = 1;
      while (head < tail) {
        const i = queue[head++], x = i % D;
        va += CA[i];
        for (let oy = -D; oy <= D; oy += D) {
          for (let ox = -1; ox <= 1; ox++) {
            if ((ox < 0 && x === 0) || (ox > 0 && x === D - 1)) continue;
            const j = i + oy + ox;
            if (j < 0 || j >= n || !C[j] || seen[j] || id[j] !== me) continue;
            seen[j] = 1; queue[tail++] = j;
          }
        }
      }
      const a = va >= tail * 0.45;
      for (let q = 0; q < tail; q++) {
        const i = queue[q];
        CA[i] = a ? 1 : 0; CB[i] = a ? 0 : 1;
        const k = ((i / D) >> 1) * H2 + ((i % D) >> 1);
        if (a) hA[k] += 1; else hB[k] += 1;
      }
    }
    const nA = blurMask(hA, H2, H2, Math.max(0.6, w * 0.3)), nB = blurMask(hB, H2, H2, Math.max(0.6, w * 0.3));
    for (let k = 0; k < nH; k++) { const t = nA[k] + nB[k]; nA[k] = t > 1e-4 ? nA[k] / t : 0.5; }
    upsampleHalf(nA, H2, cls, D);
  }
  // distance to the centre lines, softened so the 1-px skeleton's stair steps don't
  // show as a grainy core
  // (only the band the glass and its edge need: stamped discs, far cheaper than an EDT)
  for (let i = 0; i < n; i++) CB[i] += CA[i];
  const dC = smooth3(nearDistance(CB, D, w / 2 + 5), D);
  // tube bodies at D (for the glow) — dim parts don't glow
  // tube radius: the full tube on key lines and edges, but never fatter than the stroke
  // it traces — small lettering is bent from thinner tube so counters stay open
  const half = w / 2;
  let rad = null;
  {
    const rW = new Float32Array(nH), rV = new Float32Array(nH);
    let thinner = 0;
    for (let i = 0; i < n; i++) {
      if (!C[i]) continue;
      const onPanel = id[i] < 32 && dThin && depth[i] > dThin[i] + 1.5;   // stroke edged by other ink, not by air
      const r = onPanel ? Math.min(half, Math.max(0.75, dThin[i] * 1.05 + 0.25)) : half;
      if (r < half - 0.05) thinner++;
      const k = ((i / D) >> 1) * H2 + ((i % D) >> 1);
      rW[k] += 1; rV[k] += r;
    }
    if (thinner) {
      const bw = blurMask(rW, H2, H2, Math.max(0.6, half * 0.5)), bv = blurMask(rV, H2, H2, Math.max(0.6, half * 0.5));
      for (let k = 0; k < nH; k++) bw[k] = bw[k] > 0.02 ? Math.min(half, bv[k] / bw[k]) : half;
      rad = new Float32Array(n);
      upsampleHalf(bw, H2, rad, D);
    }
  }
  return { C, span, w, half, rad, dC, cls, ox, oy, Dc: D };
}

/** FNV-1a over the RGBA words: a cheap content key for the analysis memo. */
function pixelHash(data) {
  const u = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
  return (h >>> 0).toString(36) + ":" + u.length;
}

let memo = null;   // { key, a } — last analysis (one entry: the logo being tuned)

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "neon",
  name: "Neon",
  category: "metal",
  blurb: "Your mascot bent into glowing glass tubes.",
  method: "Heat transfer",
  stage: "dark",
  params: [
    { key: "width", label: "Tube width", type: "range", min: 4, max: 20, step: 1, default: 9, unit: "px" },
    { key: "glow", label: "Glow", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "colorA", label: "Outer tube", type: "color", default: "secondary" },
    { key: "colorB", label: "Inner tubes", type: "color", default: "primary" },
    { key: "fill", label: "Dim fill", type: "toggle", default: false },
    { key: "flicker", label: "Flicker", type: "toggle", default: false },
  ],
  presets: [
    { name: "Team glow", params: { width: 9, glow: 45, colorA: "secondary", colorB: "primary", fill: false, flicker: false } },
    { name: "Hype", params: { width: 10, glow: 70, colorA: "#FF2E97", colorB: "#21E6FF", fill: false, flicker: true } },
    { name: "Ice", params: { width: 8, glow: 50, colorA: "#E8FBFF", colorB: "#4FA8FF", fill: true, flicker: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const D = Math.min(S, 768);
    const kD = D / S;
    const sc = ctx.scale * kD;          // 1024-units → D px

    const srcD = D === S ? src : resizeCanvas(src, D, D);
    const data0 = getPixels(srcD).data;
    const key = `${D}|${p.width}|${pixelHash(data0)}`;
    if (!memo || memo.key !== key) memo = { key, a: analyse(srcD, data0, D, sc, p.width) };
    const A = memo.a;
    if (!A) return createCanvas(S, S);
    const { C, span, w, half, rad, dC, cls, ox, oy, Dc } = A;
    const nC = Dc * Dc;

    // flicker: two dead segments and one half-lit, centred on tube pixels (seeded)
    const dim = new Float32Array(nC);
    if (p.flicker) {
      const r = rng(hashSeed("neon-flicker", ctx.seed));
      const tubes = [];
      for (let i = 0; i < nC; i += 3) if (C[i]) tubes.push(i);
      const R = span * 0.07;
      const picks = [];
      for (let tries = 0; tries < 60 && picks.length < 3 && tubes.length; tries++) {
        const i = tubes[Math.floor(r() * tubes.length)];
        const x = i % Dc, y = (i / Dc) | 0;
        if (picks.every((q) => Math.hypot(q[0] - x, q[1] - y) > span * 0.35)) picks.push([x, y, picks.length < 2 ? 0.85 : 0.5]);
      }
      for (const [px, py, amt] of picks) {
        const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(Dc - 1, Math.ceil(px + R));
        const y0 = Math.max(0, Math.floor(py - R)), y1 = Math.min(Dc - 1, Math.ceil(py + R));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const t = amt * smoothstep(R, R * 0.75, Math.hypot(x - px, y - py));
            const i = y * Dc + x;
            if (t > dim[i]) dim[i] = t;
          }
        }
      }
    }

    // class → sharp colour weight + electrode gap, only near the glass
    const csD = new Float32Array(nC), gapD = new Float32Array(nC);
    const bodyA = new Float32Array(nC), bodyB = new Float32Array(nC);
    for (let i = 0; i < nC; i++) {
      const h = rad ? rad[i] : half;
      if (dC[i] > h + 2) continue;
      const c = cls[i];
      const cs = smoothstep(0.32, 0.68, c);
      csD[i] = cs;
      gapD[i] = smoothstep(0.06, 0.26, Math.abs(c - 0.5));
      const body = smoothstep(h + 0.7, h - 0.7, dC[i]) * (1 - dim[i]) * gapD[i];
      bodyA[i] = body * cs; bodyB[i] = body * (1 - cs);
    }
    const g = p.glow / 100;
    const colA = neonize(p.colorA), colB = neonize(p.colorB);
    const coreA = colA.map((c) => lerp(c, 255, 0.82)), coreB = colB.map((c) => lerp(c, 255, 0.82));

    /* glow: the lit tube bodies as one colour layer at half resolution, blurred by the
       canvas in three widths (tight halo → wide bloom) and laid under the glass */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    if (p.fill) o.drawImage(fillLayer(src, colB), 0, 0);
    if (g > 0) {
      const D2 = Math.ceil(D / 2), n2 = D2 * D2;
      const bA = new Float32Array(n2), bB = new Float32Array(n2);
      for (let y = 0; y < Dc; y++) {
        const r2 = ((y + oy) >> 1) * D2, hx = ox >> 1;
        for (let x = 0; x < Dc; x++) {
          const i = y * Dc + x, k = r2 + hx + (x >> 1);
          bA[k] += bodyA[i] * 0.25; bB[k] += bodyB[i] * 0.25;
        }
      }
      const bc = createCanvas(D2, D2);
      const bx = ctx2d(bc);
      const bi = bx.createImageData(D2, D2);
      for (let i = 0, j = 0; i < n2; i++, j += 4) {
        const a = bA[i], b = bB[i], t = a + b;
        if (t < 0.002) continue;
        bi.data[j] = (colA[0] * a + colB[0] * b) / t;
        bi.data[j + 1] = (colA[1] * a + colB[1] * b) / t;
        bi.data[j + 2] = (colA[2] * a + colB[2] * b) / t;
        bi.data[j + 3] = Math.min(1, t) * 255;
      }
      bx.putImageData(bi, 0, 0);
      // a tight smoky backing in a deep shade of the tube colour: invisible on dark
      // garments, but on white / gold it gives the glass the night it needs to glow in
      const back = createCanvas(D2, D2), kx = ctx2d(back);
      kx.drawImage(bc, 0, 0);
      kx.globalCompositeOperation = "source-atop";
      kx.fillStyle = "rgba(6,8,14,0.86)";
      kx.fillRect(0, 0, D2, D2);
      // a wider smoky "night" under the tight backing: on a white / gold shirt the glow
      // needs a dark aura to read as light (on dark shirts it disappears into the fabric)
      // (a blur of thin tubes is faint, so the blurred coverage is re-thresholded into a
      // solid aura that feathers out ≈ 2 tube widths from the glass)
      {
        const aura = blurCanvas(back, Math.min(Math.max(1.2, w * 1.8), (D2 * 0.14) / 3.2));
        const ax = ctx2d(aura);
        const im = ax.getImageData(0, 0, D2, D2), ad = im.data;
        for (let j = 3; j < ad.length; j += 4) {
          const t = Math.max(0, Math.min(1, (ad[j] / 255 - 0.028) / 0.04));   // short ramp: no muddy rim
          ad[j] = t * t * (3 - 2 * t) * 255;
        }
        ax.putImageData(im, 0, 0);
        o.globalAlpha = 0.8 + 0.2 * g;
        o.drawImage(aura, 0, 0, S, S);
      }
      o.globalAlpha = 0.42 + 0.3 * g;
      o.drawImage(blurCanvas(back, Math.max(0.8, w * 0.6)), 0, 0, S, S);
      // glow: wide bloom → tight halo (half-res canvas, so σ here is 2× in D px)
      const layers = [[w * 2.4, 0.62], [w * 1.0, 0.6], [w * 0.4, 0.55]];
      const sigMax = (D2 * 0.14) / 3.2;   // the bloom fades out inside the 14% margin
      for (const [sig, k] of layers) {
        o.globalAlpha = Math.min(1, k * g * 1.25);
        o.drawImage(blurCanvas(bc, Math.min(sig, sigMax)), 0, 0, S, S);
      }
      o.globalAlpha = 1;
    }

    /* glass tubes at S from the bilinear distance fields */
    const tubes = o.createImageData(S, S);
    const od = tubes.data;
    const ix0 = new Int32Array(S), ix1 = new Int32Array(S), fxa = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      const fx = (x + 0.5) * kD - 0.5 - ox;               // crop-map coordinates
      if (fx < 0 || fx > Dc - 1) { ix0[x] = -1; continue; }  // outside the map: no glass
      ix0[x] = fx | 0; ix1[x] = Math.min(Dc - 1, ix0[x] + 1); fxa[x] = fx - ix0[x];
    }
    const aaD = Math.max(0.5, 0.75 * kD);   // ~0.75 output px edge
    const reach = half + aaD;
    for (let y = 0; y < S; y++) {
      const fy = (y + 0.5) * kD - 0.5 - oy;
      if (fy < 0 || fy > Dc - 1) continue;
      const y0 = fy | 0, y1 = Math.min(Dc - 1, y0 + 1), wy = fy - y0;
      const r0 = y0 * Dc, r1 = y1 * Dc;
      for (let x = 0; x < S; x++) {
        const x0 = ix0[x], x1 = ix1[x];
        if (x0 < 0) continue;
        const i00 = r0 + x0, i01 = r0 + x1, i10 = r1 + x0, i11 = r1 + x1;
        if (dC[i00] > reach + 1 && dC[i11] > reach + 1 && dC[i01] > reach + 1) continue;   // far from glass
        const wx = fxa[x];
        const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
        const d = dC[i00] * w00 + dC[i01] * w01 + dC[i10] * w10 + dC[i11] * w11;
        if (d > reach) continue;
        const hr = rad ? rad[i00] * w00 + rad[i01] * w01 + rad[i10] * w10 + rad[i11] * w11 : half;
        const reachL = hr + aaD;
        if (d > reachL) continue;
        const gapK = gapD[i00] * w00 + gapD[i01] * w01 + gapD[i10] * w10 + gapD[i11] * w11;
        const ta = smoothstep(reachL, hr - aaD, d) * gapK;
        if (ta <= 0.002) continue;
        const cs = csD[i00] * w00 + csD[i01] * w01 + csD[i10] * w10 + csD[i11] * w11;
        const dmv = dim[i00] * w00 + dim[i01] * w01 + dim[i10] * w10 + dim[i11] * w11;
        const u = d / hr;                                 // 0 at the centre line, 1 at the glass edge
        const hot = 1 - smoothstep(0.05, 0.62, u);
        // glass edge a shade deeper than the tube colour: real tubes read that way, and it
        // keeps the tube defined on white / heather garments
        const rim = 1 - smoothstep(0.62, 1, u) * 0.42;
        const c0 = lerp(colB[0], colA[0], cs), c1 = lerp(colB[1], colA[1], cs), c2 = lerp(colB[2], colA[2], cs);
        let cr = lerp(c0, lerp(coreB[0], coreA[0], cs), hot) * rim;
        let cg = lerp(c1, lerp(coreB[1], coreA[1], cs), hot) * rim;
        let cb = lerp(c2, lerp(coreB[2], coreA[2], cs), hot) * rim;
        if (dmv > 0) {   // dead segment: dim smoky glass
          cr = lerp(cr, c0 * 0.28 + 30, dmv); cg = lerp(cg, c1 * 0.28 + 30, dmv); cb = lerp(cb, c2 * 0.28 + 34, dmv);
        }
        const j = (y * S + x) * 4;
        od[j] = cr; od[j + 1] = cg; od[j + 2] = cb;
        od[j + 3] = ta * 255 + 0.5;
      }
    }
    const tc = createCanvas(S, S);
    ctx2d(tc).putImageData(tubes, 0, 0);
    o.drawImage(tc, 0, 0);
    return out;
  },
};
