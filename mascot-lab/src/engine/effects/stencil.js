// "Stencil" — a cut-and-sprayed street stencil. The logo is thresholded into a hard-edged
// key ink, cut like a real stencil (enclosed islands get thin bridges so the sheet would
// hold together; islands too small to cut fall out and print solid), then "sprayed":
// paint builds up at the stencil edges and thins to a speckled grit in the middle, a soft
// overspray fuzz leaks just outside the edges, a few mist spots drift around, and thin
// drips run from the lower edges. An optional under-layer in a second ink (the whole
// silhouette, slightly out of register) makes it a two-layer stencil that reads on dark
// and light garments alike.
//
// Structure as halftone.js: analysis fields at A (≈ W/2), the sprayed texture per pixel at
// W = min(S, 1024), vector drips at S. Transparent background, deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, lerp, smoothstep, hexToRgb,
  insideDistance, outsideDistance, rng, hashSeed, makeNoise2D, fbm, contrastRatio,
} from "../core.js";

const BRIDGE = 4.5;        // bridge width (1024-units)
const MARGIN = 8;          // keep clear of the canvas edge
const OFFSET = [7, 6];     // under-layer registration offset (units)
const GRAIN = 2.2;         // spray grain cell (units)

/* ───────────────────────────── helpers ───────────────────────────── */

function upsample(m, A, W) {
  if (A === W) return m;
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
      out[row + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Integer hash → [0, 1) for per-pixel grain (deterministic, no allocation). */
function hash01(x, y, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Stencil islands: connected non-ink areas that don't touch the border. Tiny ones fall out
 * (become ink); the rest get up to two bridges (vertical first, horizontal if that fails).
 * Returns { fallout: Uint8Array (A²), bridges: [{ x0, y0, x1, y1 }] in A px }.
 */
function stencilIslands(ink, A, uA) {
  const n = A * A;
  const comp = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const isInk = (i) => ink[i] >= 0.5;
  const islands = [];
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0 || isInk(s)) continue;
    let head = 0, tail = 0, border = false;
    let minY = A, maxY = -1, minX = A, maxX = -1;
    queue[tail++] = s; comp[s] = id;
    while (head < tail) {
      const i = queue[head++], x = i % A, y = (i / A) | 0;
      if (x === 0 || y === 0 || x === A - 1 || y === A - 1) border = true;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (x > 0 && comp[i - 1] < 0 && !isInk(i - 1)) { comp[i - 1] = id; queue[tail++] = i - 1; }
      if (x < A - 1 && comp[i + 1] < 0 && !isInk(i + 1)) { comp[i + 1] = id; queue[tail++] = i + 1; }
      if (y > 0 && comp[i - A] < 0 && !isInk(i - A)) { comp[i - A] = id; queue[tail++] = i - A; }
      if (y < A - 1 && comp[i + A] < 0 && !isInk(i + A)) { comp[i + A] = id; queue[tail++] = i + A; }
    }
    if (!border) islands.push({ id, area: tail, minY, maxY, minX, maxX, seed: s });
    id++;
  }
  const fallout = new Uint8Array(n);
  const minArea = Math.max(4, (7 * uA) * (7 * uA));
  const maxLen = 46 * uA;
  const bridges = [];
  // walk from (x, y) in direction (dx, dy) across ink until non-ink of another component
  const walk = (x, y, dx, dy, own) => {
    let len = 0;
    x += dx; y += dy;
    while (x >= 0 && y >= 0 && x < A && y < A) {
      const i = y * A + x;
      if (!isInk(i)) return comp[i] !== own && len > 0 ? { x, y, len } : null;
      if (++len > maxLen) return null;
      x += dx; y += dy;
    }
    return null;
  };
  // islands are sorted big → small so the important ones get bridges within the cap
  islands.sort((a, b) => b.area - a.area);
  const tiny = new Uint8Array(id + 1);
  for (const isl of islands) if (isl.area < minArea) tiny[isl.id] = 1;
  for (let i = 0; i < n; i++) if (comp[i] >= 0 && tiny[comp[i]]) fallout[i] = 1;
  for (const isl of islands) {
    if (isl.area < minArea) continue;
    if (bridges.length >= 40) continue;
    // extreme pixels: middle of the top row, middle of the bottom row, etc.
    const ext = (row, isRow) => {
      const xs = [];
      for (let t = 0; t < A; t++) {
        const i = isRow ? row * A + t : t * A + row;
        if (comp[i] === isl.id) xs.push(t);
      }
      return xs.length ? xs[(xs.length / 2) | 0] : -1;
    };
    const tries = [
      () => { const x = ext(isl.minY, true); return x < 0 ? null : [x, isl.minY, walk(x, isl.minY, 0, -1, isl.id)]; },
      () => { const x = ext(isl.maxY, true); return x < 0 ? null : [x, isl.maxY, walk(x, isl.maxY, 0, 1, isl.id)]; },
      () => { const y = ext(isl.minX, false); return y < 0 ? null : [isl.minX, y, walk(isl.minX, y, -1, 0, isl.id)]; },
      () => { const y = ext(isl.maxX, false); return y < 0 ? null : [isl.maxX, y, walk(isl.maxX, y, 1, 0, isl.id)]; },
    ];
    let made = 0;
    for (const t of tries) {
      if (made >= 2) break;
      const r = t();
      if (!r || !r[2]) continue;
      bridges.push({ x0: r[0] + 0.5, y0: r[1] + 0.5, x1: r[2].x + 0.5, y1: r[2].y + 0.5 });
      made++;
    }
  }
  return { fallout, bridges };
}

/** The silhouette with enclosed transparent areas filled (flood fill from the border). */
function fillEnclosed(alpha, W) {
  const n = W * W;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && alpha[i] < 0.3) { out[i] = 1; queue[tail++] = i; } };
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
  for (let i = 0; i < n; i++) f[i] = out[i] ? alpha[i] : 1;
  return f;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "stencil",
  name: "Stencil",
  category: "street",
  blurb: "Hand-cut spray stencil: hard edges, grit and overspray.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "cut", label: "Cut level", type: "range", min: 20, max: 80, step: 1, default: 50, unit: "%" },
    { key: "ink", label: "Ink", type: "color", default: "dark" },
    { key: "under", label: "Under layer", type: "toggle", default: true },
    { key: "ink2", label: "Under ink", type: "color", default: "secondary" },
    { key: "spray", label: "Overspray", type: "range", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    { key: "grit", label: "Grit", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "drips", label: "Drips", type: "toggle", default: true },
  ],
  presets: [
    { name: "Street stencil", params: { cut: 50, ink: "dark", under: true, ink2: "secondary", spray: 50, grit: 45, drips: true } },
    { name: "One ink", params: { cut: 50, ink: "dark", under: false, spray: 60, grit: 50, drips: true } },
    { name: "Two-layer", params: { cut: 42, ink: "primary", under: true, ink2: "secondary", spray: 35, grit: 30, drips: false } },
    { name: "Clean cut", params: { cut: 50, ink: "dark", under: true, ink2: "secondary", spray: 0, grit: 0, drips: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = Math.min(S, 1024);
    const A = W > 400 ? Math.round(W / 2) : Math.min(W, 256);
    const kW = W / S, kA = A / W;
    const u = ctx.scale * kW, uA = u * kA;
    const n = W * W, nA = A * A;
    const seed = hashSeed("stencil", ctx.seed);
    const rand = rng(seed);                                  // mists
    const dripRand = rng(hashSeed("stencil-drips", ctx.seed)); // own stream: same drips at any size
    const thr = lerp(0.2, 0.8, p.cut / 100);
    const lumOf = (d, j) => (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;

    /* ── 1. threshold the logo (W for crisp edges, A for analysis) ── */
    const small = W === S ? src : resizeCanvas(src, W, W);
    const sd = getPixels(small).data;
    const smallA = A === W ? small : resizeCanvas(small, A, A);
    const ad = A === W ? sd : getPixels(smallA).data;
    // adaptive fallback: a light-only logo (white mark) would cut to nothing → stencil
    // the silhouette instead; a mostly-light one cuts at its own darker half
    const hist = new Float32Array(64);
    let opaque = 0;
    for (let j = 0; j < ad.length; j += 4) {
      const a = ad[j + 3] / 255;
      if (a < 0.5) continue;
      hist[Math.min(63, (lumOf(ad, j) * 64) | 0)] += 1;
      opaque++;
    }
    let below = 0;
    for (let b = 0; b < 64 && (b + 0.5) / 64 < thr; b++) below += hist[b];
    let t = thr, silhouette = false;
    if (opaque && below < opaque * 0.1) {
      let acc = 0, b = 0;
      for (; b < 64; b++) { acc += hist[b]; if (acc >= opaque * 0.35) break; }
      const lt = (b + 1) / 64;
      if (lt > 0.97 || b >= 63) silhouette = true; else t = Math.min(0.97, lt + 0.02);
    }
    // a stencil is binary: if the cut level sits on one of the logo's inks (it would print
    // half-transparent), slide it to the emptiest luminance nearby
    if (!silhouette && opaque) {
      const massNear = (v) => {
        let m = 0;
        for (let b = Math.max(0, Math.floor((v - 0.03) * 64)); b <= Math.min(63, Math.floor((v + 0.03) * 64)); b++) m += hist[b];
        return m;
      };
      if (massNear(t) > opaque * 0.02) {
        let best = t, bm = massNear(t);
        for (let dv = -0.1; dv <= 0.1; dv += 0.01) {
          const m = massNear(t + dv);
          if (m < bm - 1e-6 || (m === bm && Math.abs(dv) < Math.abs(best - t))) { bm = m; best = t + dv; }
        }
        t = clamp(best, 0.05, 0.97);
      }
    }
    const inkAt = (d, j) => {
      const a = d[j + 3] / 255;
      if (a <= 0) return 0;
      return silhouette ? a : a * smoothstep(t + 0.035, t - 0.035, lumOf(d, j));
    };
    const ink = new Float32Array(n), sil = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) { ink[i] = inkAt(sd, j); sil[i] = sd[j + 3] / 255; }
    const inkA = new Float32Array(nA);
    for (let i = 0, j = 0; i < nA; i++, j += 4) inkA[i] = inkAt(ad, j);

    /* ── 2. cut it like a stencil: fall-out islands + bridges ── */
    const { fallout, bridges } = stencilIslands(inkA, A, uA);
    const fallW = upsample(Float32Array.from(fallout), A, W);
    for (let i = 0; i < n; i++) if (fallW[i] > 0.5) ink[i] = Math.max(ink[i], sil[i]);
    for (let i = 0; i < nA; i++) if (fallout[i]) inkA[i] = Math.max(inkA[i], 1);
    let bridgeCanvas = null;
    if (bridges.length) {
      bridgeCanvas = createCanvas(W, W);
      const bx = ctx2d(bridgeCanvas);
      bx.strokeStyle = "#000";
      bx.lineWidth = BRIDGE * u;
      bx.lineCap = "butt";
      bx.beginPath();
      const k = W / A;
      for (const b of bridges) {
        // extend a touch into both openings so the cut is clean
        const dx = Math.sign(b.x1 - b.x0), dy = Math.sign(b.y1 - b.y0);
        bx.moveTo((b.x0 - dx) * k, (b.y0 - dy) * k);
        bx.lineTo((b.x1 + dx) * k, (b.y1 + dy) * k);
      }
      bx.stroke();
      const bd = getPixels(bridgeCanvas).data;
      for (let i = 0, j = 3; i < n; i++, j += 4) if (bd[j]) ink[i] *= 1 - bd[j] / 255;
    }

    /* ── 3. distance fields at A for edge build-up and fuzz ── */
    const inA = upsample(insideDistance(inkA, A, A, 0.5), A, W);      // A px
    const outA = upsample(outsideDistance(inkA, A, A, 0.5), A, W);
    const offX = OFFSET[0] * u, offY = OFFSET[1] * u;
    let under = null, underOut = null;
    if (p.under) {
      // line art (a ring, an outlined paw…) prints its enclosed areas on the under layer
      let base = sil;
      const filled = fillEnclosed(sil, W);
      let a0 = 0, a1 = 0;
      for (let i = 0; i < n; i++) { a0 += sil[i]; a1 += filled[i]; }
      if (a1 > a0 * 2.2) base = filled;
      under = new Float32Array(n);
      const ox = Math.round(offX), oy = Math.round(offY);
      for (let y = oy; y < W; y++) for (let x = ox; x < W; x++) under[y * W + x] = base[(y - oy) * W + x - ox];
      const silA = new Float32Array(nA);
      if (base === sil) for (let i = 0, j = 3; i < nA; i++, j += 4) silA[i] = ad[j] / 255;
      else {
        const k = W / A;
        for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) silA[y * A + x] = base[Math.min(W - 1, Math.round((y + 0.5) * k)) * W + Math.min(W - 1, Math.round((x + 0.5) * k))];
      }
      const oA = outsideDistance(silA, A, A, 0.5);
      // shift the A field by the same offset
      const sh = new Float32Array(nA).fill(1e6);
      const oxA = Math.round(offX * kA), oyA = Math.round(offY * kA);
      for (let y = oyA; y < A; y++) for (let x = oxA; x < A; x++) sh[y * A + x] = oA[(y - oyA) * A + x - oxA];
      underOut = upsample(sh, A, W);
    }

    /* ── 4. spray texture at W ── */
    const noise = makeNoise2D(seed);
    const spray = p.spray / 100, grit = p.grit / 100;
    const cellU = 1 / kA;                       // W px per A px
    // mist spots: a few drifting clouds of fine spray near the edges
    const mists = [];
    if (spray > 0) {
      const nm = Math.round(2 + spray * 4);
      for (let tries = 0; mists.length < nm && tries < 400; tries++) {
        const x = (0.1 + rand() * 0.8) * W, y = (0.1 + rand() * 0.8) * W;
        const d = outA[(y | 0) * W + (x | 0)] * cellU / u;
        if (d < 6 || d > 40) continue;
        mists.push({ x, y, r: (24 + rand() * 40) * u, k: 0.12 + rand() * 0.18 });
      }
    }
    const edge = MARGIN * u;
    const nearMist = (x, y) => {
      for (const m of mists) if (Math.abs(x - m.x) < m.r && Math.abs(y - m.y) < m.r) return true;
      return false;
    };
    const layer = (cov, inside, outside, rgb, salt) => {
      const img = ctx2d(createCanvas(1, 1)).createImageData(W, W);
      const d = img.data;
      const fuzz = spray * 0.55, fall = 4.5 * u;
      const reach = 30 * u;                          // fuzz is negligible beyond this
      // spray grain cells are GRAIN units wide (big enough to read in a gallery tile); when
      // a pixel spans several cells it takes their expected coverage instead
      const cellPx = GRAIN * u;
      const cellsPerPx = 1 / (cellPx * cellPx), coarse = cellsPerPx > 1.6, sdN = 1 / Math.sqrt(cellsPerPx);
      const cellK = cellPx >= 1 ? 1 / cellPx : 1;
      // blotchy coverage varies slowly: evaluate it on a coarse grid, interpolate
      const G = 8, gw = Math.ceil(W / G) + 2;
      const blotG = new Float32Array(gw * gw);
      if (grit > 0) {
        for (let r = 0; r < gw; r++) for (let q = 0; q < gw; q++) {
          blotG[r * gw + q] = 0.5 + 0.5 * fbm(noise, (q * G) / (70 * u) + salt * 0.01, (r * G) / (70 * u), 3);
        }
      }
      for (let y = 0; y < W; y++) {
        const gy = y / G, r0 = gy | 0, ty = gy - r0;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          let a = cov[i];
          if (a <= 0.004 && (!outside || spray <= 0 || (outside[i] * cellU > reach && !nearMist(x, y)))) continue;
          // the grain lattice is rotated so the specks don't line up with the pixel grid
          const h = hash01(Math.floor((x * 0.866 - y * 0.5) * cellK), Math.floor((x * 0.5 + y * 0.866) * cellK), salt);
          if (a > 0.004) {
            if (grit > 0) {
              // paint builds up at the cut edge; the middle thins to a speckled grit
              const din = inside ? inside[i] * cellU : 99;
              const mid = smoothstep(2 * u, 12 * u, din);
              const gx = x / G, q0 = gx | 0, tx = gx - q0, g0 = r0 * gw + q0;
              const blot = (blotG[g0] * (1 - tx) + blotG[g0 + 1] * tx) * (1 - ty) + (blotG[g0 + gw] * (1 - tx) + blotG[g0 + gw + 1] * tx) * ty;
              const holeP = grit * mid * (0.06 + 0.5 * blot * blot);
              const thin = 1 - grit * mid * 0.18 * blot;
              if (!coarse) {
                if (h < holeP) a *= 0.15 + 0.5 * (h / Math.max(holeP, 1e-6));
                else a *= thin;
              } else {
                // a pixel spans several grain cells: its expected coverage, with the
                // matching (smaller) cell-to-cell variation
                const mean = holeP * 0.4 + (1 - holeP) * thin;
                const sd = Math.sqrt(holeP * (1 - holeP)) * 0.6 * sdN;
                a *= clamp(mean + (h - 0.5) * 3.46 * sd, 0.1, 1);
              }
            }
          } else if (outside && spray > 0) {
            // overspray fuzz: speckles that thin out within a few units of the edge
            const dd = (outside[i] * cellU) - 0.5;
            let pr = fuzz * Math.exp(-dd / fall) + 0.07 * spray * Math.exp(-dd / (1.6 * u));
            for (const m of mists) {
              const r = Math.hypot(x - m.x, y - m.y) / m.r;
              if (r < 1) pr += m.k * spray * (1 - r) * (1 - r);
            }
            if (x < edge || y < edge || x > W - edge || y > W - edge) pr = 0;
            if (!coarse) a = h < pr ? 0.35 + 0.6 * (h / pr) : 0;
            else {
              const q = Math.min(1, pr);
              a = Math.max(0, q * 0.65 + (h - 0.5) * 3.46 * Math.sqrt(q * (1 - q)) * 0.65 * sdN);
            }
          }
          if (a <= 0.004) continue;
          const j = i * 4;
          d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2];
          d[j + 3] = clamp(a) * 255 + 0.5;
        }
      }
      const c = createCanvas(W, W);
      ctx2d(c).putImageData(img, 0, 0);
      return c;
    };

    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    // the two layers must separate: if the under ink is (nearly) the key ink — a black
    // secondary under a black key, say — the under layer takes another team colour
    let ink2 = p.ink2;
    if (under && contrastRatio(ink2, p.ink) < 2) {
      const pal = ctx.palette || {};
      ink2 = [pal.secondary, pal.primary, pal.accent, pal.light, "#FFFFFF"].find((h) => h && contrastRatio(h, p.ink) >= 3) || "#FFFFFF";
    }
    if (under) o.drawImage(layer(under, null, underOut, hexToRgb(ink2), 977), 0, 0, S, S);
    const inkHex = p.ink;
    o.drawImage(layer(ink, inA, outA, hexToRgb(inkHex), 131), 0, 0, S, S);

    /* ── 5. drips from the lower edges of the key ink ── */
    if (p.drips) {
      const sites = [];
      const step = Math.max(1, Math.round(3 * uA));
      for (let x = 2; x < A - 2; x += step) {
        for (let y = 2; y < A - 3; y++) {
          const i = y * A + x;
          if (inkA[i] < 0.5 || inkA[i + A] >= 0.5) continue;
          // flat-ish floor with open air below
          if (inkA[i - 1] < 0.5 || inkA[i + 1] < 0.5) continue;
          const below = Math.min(A - 1, y + Math.round(10 * uA));
          if (inkA[below * A + x] >= 0.5) continue;
          sites.push([x, y, y / A + hash01(Math.round(x / uA / 4), Math.round(y / uA / 4), 53) * 0.5]);
        }
      }
      sites.sort((a, b) => b[2] - a[2]);
      const picks = [];
      const want = 4 + Math.round(spray * 4);
      for (const s of sites) {
        if (picks.length >= want) break;
        if (picks.some((q) => Math.abs(q[0] - s[0]) < 40 * uA)) continue;
        picks.push(s);
      }
      const kS = S / A, sc = ctx.scale;
      o.fillStyle = inkHex;
      const path = new Path2D();
      for (const [x, y] of picks) {
        const X = (x + 0.5) * kS, Y = (y + 0.5) * kS;
        const w = (3.2 + dripRand() * 3.2) * sc;
        let len = (18 + Math.pow(dripRand(), 1.5) * 85) * sc;
        len = Math.min(len, S - MARGIN * sc - Y - w);
        if (len < 6 * sc) continue;
        const bead = w * 0.75;
        path.moveTo(X - w * 1.2, Y - w);
        path.quadraticCurveTo(X - w * 0.5, Y, X - w * 0.5, Y + w);
        path.lineTo(X - w * 0.38, Y + len - bead);
        path.arc(X, Y + len - bead, bead, Math.PI, 0, true);
        path.lineTo(X + w * 0.5, Y + w);
        path.quadraticCurveTo(X + w * 0.5, Y, X + w * 1.2, Y - w);
        path.closePath();
      }
      o.fill(path);
    }
    return out;
  },
};
