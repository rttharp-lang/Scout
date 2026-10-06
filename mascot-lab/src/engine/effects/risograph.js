// "Risograph" — a two-drum riso print in the spirit of "Risoprint" effect packs.
//
//   paper base (the logo's silhouette, warm off-white with fibres) →
//   drum A and drum B: each a grainy stochastic (FM) dither of its own ink coverage,
//   with uneven ink density (low-frequency mottling), a ragged grain fringe at the edges
//   and its own misregistration offset → multiply overprint, so where the drums overlap
//   a third colour appears → dust specks and paper fibres.
//
// Separation (how the logo is split into the two drums):
//   • "color" — every logo colour is matched to the best mix of the two inks on paper
//     (a least-squares search over ink A × ink B coverage), so the team's own inks print
//     where the logo uses them and a black keyline becomes the overprint;
//   • "tone"  — a luminance duotone: the lighter ink carries every tone, the darker ink
//     only the shadows;
//   • "mono"  — one drum (ink A), tones as grain.
//
// Everything that has a size (grain, misregistration, fibres) is in 1024-units on grids
// anchored in unit space, so a 384 preview and a 2048 export print the same grain.
// Transparent background (the paper is cut to the logo, like a white underbase on a
// garment), deterministic.
import {
  createCanvas, ctx2d, getPixels, smoothstep, hexToRgb, luminance, contrastRatio,
  blurMask, makeNoise2D, fbm, hashSeed, rng, maskBounds,
} from "../core.js";

const PAPER = "#F7F4EC";      // riso paper (warm off-white)
const LOW = 150;              // ink-density mottling feature size, units
const TAU = Math.PI * 2;

/* ───────────────────────────── noise helpers ───────────────────────────── */

/** Integer hash → [0, 1). */
function hash01(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The value of a bilinearly interpolated uniform-noise grid is NOT uniform (it piles up
// around 0.5), which would flatten every tint. CDF of that distribution → remap to uniform,
// so "40 % coverage" really inks 40 % of the grain.
let CDF = null;
function grainCDF() {
  if (CDF) return CDF;
  const r = rng(12345);
  const H = new Float64Array(512);
  const N = 160000;
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
 * Bilinear row sampler for a grid whose points sit every `c` px (grid index 0 at px 0).
 * Returns (y) → Float32Array(S) row (reused buffer).
 */
function rowSampler(grid, gw, gh, c, S) {
  const ix = new Int32Array(S), fx = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    const g = (x + 0.5) / c;
    const i = Math.min(gw - 2, Math.max(0, g | 0));
    ix[x] = i; fx[x] = Math.min(1, g - i);
  }
  const tmp = new Float32Array(gh * S);
  for (let j = 0; j < gh; j++) {
    const go = j * gw, to = j * S;
    for (let x = 0; x < S; x++) {
      const a = grid[go + ix[x]];
      tmp[to + x] = a + (grid[go + ix[x] + 1] - a) * fx[x];
    }
  }
  const row = new Float32Array(S);
  return (y) => {
    const g = (y + 0.5) / c;
    const j = Math.min(gh - 2, Math.max(0, g | 0));
    const f = Math.min(1, g - j);
    const a = j * S, b = a + S;
    for (let x = 0; x < S; x++) row[x] = tmp[a + x] + (tmp[b + x] - tmp[a + x]) * f;
    return row;
  };
}

/** Uniform hash grid covering S px with cells of c px. */
function grainGrid(S, c, seed) {
  const gw = Math.ceil(S / c) + 2, gh = gw;
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = hash01(i, j, seed);
  return rowSampler(g, gw, gh, c, S);
}

/** Smooth fbm grid (−1..1) with points every `cellU` units, features ≈ `featU` units. */
function lowGrid(S, sc, cellU, featU, seed) {
  const c = cellU * sc;
  const gw = Math.ceil(S / c) + 2, gh = gw;
  const nz = makeNoise2D(seed);
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fbm(nz, (i * cellU) / featU, (j * cellU) / featU, 3);
  return rowSampler(g, gw, gh, c, S);
}

/* ───────────────────────────── inks ───────────────────────────── */

const ROLE_ORDER = ["secondary", "accent", "primary", "dark", "light"];

/** An ink that actually shows on paper and differs from `other`; else the best palette stand-in. */
function usableInk(hex, other, palette) {
  const ok = (h) => h && contrastRatio(h, PAPER) >= 1.3 && (!other || contrastRatio(h, other) >= 1.15);
  if (ok(hex)) return hex;
  for (const r of ROLE_ORDER) if (ok(palette?.[r])) return palette[r];
  return luminance(other || "#000000") > 0.2 ? "#1A1F2B" : "#E0533D";
}

/**
 * Colour separation LUT for "color" mode: for a source colour, the ink A / ink B coverage
 * (0..1) whose multiply mix on paper is closest (redmean-weighted RGB, with a tiny bias
 * toward less ink so white stays paper).
 */
function makeSeparator(Ahex, Bhex) {
  const P = hexToRgb(PAPER).map((v) => v / 255);
  const A = hexToRgb(Ahex).map((v) => v / 255);
  const B = hexToRgb(Bhex).map((v) => v / 255);
  const STEPS = 12;
  const combos = [];
  for (let ia = 0; ia <= STEPS; ia++) {
    for (let ib = 0; ib <= STEPS; ib++) {
      const a = ia / STEPS, b = ib / STEPS;
      const c = [0, 1, 2].map((k) => P[k] * (1 - a * (1 - A[k])) * (1 - b * (1 - B[k])) * 255);
      combos.push([c[0], c[1], c[2], a, b]);
    }
  }
  const cache = new Map();
  return (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let hit = cache.get(key);
    if (hit) return hit;
    let best = 0, bd = Infinity;
    for (let k = 0; k < combos.length; k++) {
      const c = combos[k];
      const rm = (r + c[0]) * 0.5;
      const dr = r - c[0], dg = g - c[1], db = b - c[2];
      const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db + (c[3] + c[4]) * 900;
      if (d < bd) { bd = d; best = k; }
    }
    // snap: near-solid prints solid, and no stray grains of the other drum inside a solid
    let ka = combos[best][3], kb = combos[best][4];
    if (ka > 0.74) ka = 1;
    if (kb > 0.74) kb = 1;
    if (ka === 1 && kb < 0.2) kb = 0;
    if (kb === 1 && ka < 0.2) ka = 0;
    hit = [ka, kb];
    cache.set(key, hit);
    return hit;
  };
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "risograph",
  name: "Risograph",
  category: "print",
  blurb: "Two-drum riso print: grainy inks, overprint, off-register.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "inkA", label: "Ink A", type: "color", default: "primary" },
    { key: "inkB", label: "Ink B", type: "color", default: "secondary" },
    {
      key: "separation", label: "Separation", type: "select", default: "color",
      options: [
        { value: "color", label: "Logo colors" },
        { value: "tone", label: "Tone split" },
        { value: "mono", label: "One drum" },
      ],
    },
    { key: "misreg", label: "Misregistration", type: "range", min: 0, max: 30, step: 1, default: 11, unit: "px" },
    { key: "grain", label: "Grain", type: "range", min: 0, max: 100, step: 1, default: 65, unit: "%" },
    { key: "density", label: "Ink density", type: "range", min: 30, max: 100, step: 1, default: 78, unit: "%" },
    { key: "paper", label: "Paper base", type: "toggle", default: true },
  ],
  presets: [
    { name: "Team riso", params: { inkA: "primary", inkB: "secondary", separation: "color", misreg: 11, grain: 65, density: 78, paper: true } },
    { name: "Fluoro", params: { inkA: "#0078BF", inkB: "#FF48B0", separation: "tone", misreg: 10, grain: 60, density: 80, paper: true } },
    { name: "Sunburst", params: { inkA: "#FF665E", inkB: "#FFE800", separation: "tone", misreg: 9, grain: 55, density: 82, paper: true } },
    { name: "Mono", params: { inkA: "primary", separation: "mono", misreg: 0, grain: 70, density: 70, paper: true } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const n = S * S;
    const seed = ctx.seed >>> 0;
    const mono = p.separation === "mono";
    const inkA = usableInk(p.inkA, null, ctx.palette);
    const inkB = mono ? inkA : usableInk(p.inkB, inkA, ctx.palette);

    /* ── 1. ink coverage per drum (0..1, × alpha) ── */
    const sd = getPixels(src).data;
    const alpha = new Float32Array(n);
    const cA = new Float32Array(n), cB = mono ? null : new Float32Array(n);
    // tone mode: the darker ink takes the shadows, the lighter one every tone
    const aIsDark = luminance(inkA) <= luminance(inkB);
    const sep = p.separation === "color" && !mono ? makeSeparator(inkA, inkB) : null;
    let opaque = 0, inked = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = sd[j + 3] / 255;
      if (a <= 0) continue;
      alpha[i] = a;
      const r = sd[j], g = sd[j + 1], b = sd[j + 2];
      let ka, kb = 0;
      if (sep) {
        const c = sep(r, g, b);
        ka = c[0]; kb = c[1];
      } else {
        const d = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (mono) ka = Math.pow(smoothstep(0.04, 0.82, d), 0.85);
        else {
          const lightInk = smoothstep(0.03, 0.5, d), darkInk = smoothstep(0.42, 0.86, d);
          ka = aIsDark ? darkInk : lightInk;
          kb = aIsDark ? lightInk : darkInk;
        }
      }
      cA[i] = ka * a;
      if (cB) cB[i] = kb * a;
      opaque += a; inked += (ka + kb) * a;
    }
    if (opaque < 1) return createCanvas(S, S);
    // a white / very pale logo has nothing for the drums: print its shape instead —
    // the lighter ink solid, the darker ink as a classic grainy riso gradient over it
    if (inked < opaque * 0.1) {
      const b = maskBounds(alpha, S, S, 0.3);
      const y0 = b.y0, yh = Math.max(1, b.y1 - b.y0);
      for (let y = 0; y < S; y++) {
        const t = 0.85 * smoothstep(0.15, 1, (y - y0) / yh);
        for (let x = 0; x < S; x++) {
          const i = y * S + x, a = alpha[i];
          if (!a) continue;
          if (mono) cA[i] = a;
          else if (aIsDark) { cA[i] = a * t; cB[i] = a; }
          else { cA[i] = a; cB[i] = a * t; }
        }
      }
    }

    /* ── 2. grain, density, misregistration ── */
    const gt = p.grain / 100;
    const grainU = 1.8 + 3.6 * gt;                     // grain particle, units
    const gPx = Math.max(0.6, grainU * sc);
    const aa = Math.max(1.4, gPx * 0.9);               // threshold sharpness ≈ 1 px AA
    const hT = 0.5 / aa;                               // threshold range [hT, 1 − hT]: solids stay solid
    const fringe = (0.15 + 0.35 * gt) * gPx;           // ragged grain fringe at ink edges
    const dt = p.density / 100;
    const dens = 0.76 + 0.45 * dt;                     // overall ink laydown
    const uneven = 0.04 + 0.5 * (1 - dt);              // low-frequency patchiness
    const cdf = grainCDF();

    const rot = hashSeed("riso-reg", seed);
    const th = (-0.25 - (rot % 1000) / 1000 * 0.5) * Math.PI;   // mostly down/up diagonal
    const m = p.misreg * sc;
    const offA = mono ? [0, 0] : [Math.round(-0.4 * m * Math.cos(th)), Math.round(-0.4 * m * Math.sin(th))];
    const offB = [Math.round(0.6 * m * Math.cos(th)), Math.round(0.6 * m * Math.sin(th))];

    const drums = [{ cov: cA, ink: inkA, off: offA, salt: 1 }];
    if (!mono) drums.push({ cov: cB, ink: inkB, off: offB, salt: 2 });
    const P = hexToRgb(PAPER).map((v) => v / 255);
    for (const d of drums) {
      const blur = fringe > 0.4 ? blurMask(d.cov, S, S, fringe) : d.cov;
      // edges keep their AA (max), the blur adds a ragged grain fringe outside them
      const c = d.cov;
      const e = new Float32Array(n);
      for (let i = 0; i < n; i++) { const bl = blur[i] * 0.75; e[i] = c[i] >= bl ? c[i] : bl; }
      d.eff = e;
      d.grain = grainGrid(S, gPx, hashSeed("riso-grain", seed, d.salt));
      d.low = lowGrid(S, sc, 16, LOW, hashSeed("riso-low", seed, d.salt));
      const rgb = hexToRgb(d.ink).map((v) => v / 255);
      d.rgb = rgb;
      d.thin = rgb.map((v, k) => v + (P[k] - v) * 0.22); // where the drum ran light
    }

    /* ── 3. print: paper, then each drum multiplied on top ── */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const od = img.data;
    const usePaper = !!p.paper;
    const nd = drums.length;
    const rows = new Array(nd), lows = new Array(nd);
    for (let y = 0; y < S; y++) {
      for (let k = 0; k < nd; k++) { rows[k] = drums[k].grain(y); lows[k] = drums[k].low(y); }
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        let al = usePaper ? alpha[i] : 0;
        let r = P[0], g = P[1], b = P[2];
        for (let k = 0; k < nd; k++) {
          const d = drums[k];
          const sx = x - d.off[0], sy = y - d.off[1];
          if (sx < 0 || sy < 0 || sx >= S || sy >= S) continue;
          const cv = d.eff[sy * S + sx];
          if (cv <= 0.003) continue;
          const L = 0.5 + 0.5 * lows[k][x];
          const cov = cv * dens * (1 - uneven * L);
          const tv = rows[k][x] * 512;
          const ti = tv | 0;
          const T = hT + (cdf[ti] + (cdf[ti + 1] - cdf[ti]) * (tv - ti)) * (1 - 2 * hT);
          let as = (cov - T) * aa + 0.5;
          if (as <= 0) continue;
          if (as > 1) as = 1;
          // thinner ink in the light patches
          const t = L * L;
          const Cr = d.rgb[0] + (d.thin[0] - d.rgb[0]) * t;
          const Cg = d.rgb[1] + (d.thin[1] - d.rgb[1]) * t;
          const Cb = d.rgb[2] + (d.thin[2] - d.rgb[2]) * t;
          // multiply blend (W3C separable blend with alpha)
          const ab = al;
          const ao = as + ab * (1 - as);
          const ws = as * (1 - ab), wm = as * ab, wb = (1 - as) * ab;
          r = (ws * Cr + wm * Cr * r + wb * r) / ao;
          g = (ws * Cg + wm * Cg * g + wb * g) / ao;
          b = (ws * Cb + wm * Cb * b + wb * b) / ao;
          al = ao;
        }
        if (al <= 0.002) continue;
        const j = i * 4;
        od[j] = r * 255 + 0.5; od[j + 1] = g * 255 + 0.5; od[j + 2] = b * 255 + 0.5;
        od[j + 3] = al * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);

    /* ── 4. dust specks in the ink, fibres in the paper ── */
    const bb = maskBounds(alpha, S, S, 0.3);
    if (!bb.empty) {
      const rand = rng(hashSeed("riso-fibres", seed));
      const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
      const areaU = (bw * bh) / (sc * sc);
      o.save();
      o.globalCompositeOperation = "source-atop";
      o.lineCap = "round";
      // dust on the drum: tiny paper-coloured voids in the ink
      const nDust = Math.round(areaU / 2600 * (0.4 + gt));
      o.fillStyle = PAPER;
      o.beginPath();
      for (let k = 0; k < nDust; k++) {
        const x = bb.x0 + rand() * bw, y = bb.y0 + rand() * bh, rr = (0.5 + rand() * 1.1) * sc;
        o.moveTo(x + rr, y); o.arc(x, y, Math.max(0.35, rr), 0, TAU);
      }
      o.globalAlpha = 0.85;
      o.fill();
      // paper fibres: short hairline curls, only on the paper
      if (usePaper) {
        const nFib = Math.round(areaU / 9000);
        o.strokeStyle = "#8B7F6E";
        o.lineWidth = Math.max(0.5, 0.75 * sc);
        o.globalAlpha = 0.28;
        o.beginPath();
        for (let k = 0; k < nFib; k++) {
          const x = bb.x0 + rand() * bw, y = bb.y0 + rand() * bh;
          const xi = Math.min(S - 1, x | 0), yi = Math.min(S - 1, y | 0);
          if (alpha[yi * S + xi] < 0.9 || cA[yi * S + xi] > 0.3 || (cB && cB[yi * S + xi] > 0.3)) continue;
          const len = (5 + rand() * 12) * sc, a0 = rand() * TAU, bend = (rand() - 0.5) * 1.6;
          const mx = x + Math.cos(a0 + bend) * len * 0.5, my = y + Math.sin(a0 + bend) * len * 0.5;
          o.moveTo(x, y);
          o.quadraticCurveTo(mx, my, x + Math.cos(a0) * len, y + Math.sin(a0) * len);
        }
        o.stroke();
      }
      o.restore();
    }
    return out;
  },
};
