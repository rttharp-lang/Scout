// "Ink Bleed" — ink soaking into absorbent paper, in the spirit of Bleeder (Studio 2am's
// Distortion Collection) and the ink-bleed / dirty-print / ultra-ink packs:
//
//   the logo flattened to a few spot inks → each ink is printed on its own, slightly off
//   register, light inks first → around every edge the ink wicks out along the paper
//   fibres: a hairy capillary fringe whose reach follows a ridged, anisotropic fibre field
//   (fibre direction drifts slowly across the sheet) → ink pools darker just inside the
//   edges, with a slow mottle → paper-tooth dot grain; "ultra ink" pooling starves the
//   centres of big shapes into patches.
//
// "One ink" prints a one-colour separation (dark and saturated inks; a white logo prints
// its silhouette). Per-pixel work at W = min(S, 1024), distance fields at A ≤ 512,
// unit-anchored noise. Transparent background, deterministic.
import {
  createCanvas, ctx2d, clamp, smoothstep, hexToRgb, nearestColorIndex, rng, hashSeed, luminance,
  rgbToHex, makeNoise2D,
} from "../core.js";
import { extractPalette } from "../image.js";
import {
  readLogo, inkDensity, noiseMap, grainMap, bounds, toSize, workSize, shift, distanceNear,
} from "../fx/press.js";

const MAX_INKS = 5;

/**
 * Ridged fibre field 0..1, evaluated lazily (only the fringe needs it): thin, short bright
 * hairs from stretched noise, in three orientations (0°, 60°, 120° off a seeded base)
 * blended by slow noise so the fibre direction wanders across the sheet like paper.
 */
function fibreField(W, u, seed, base) {
  const nz = [0, 1, 2].map((k) => makeNoise2D(hashSeed("bleed-fib", seed, k)));
  const cs = [0, 1, 2].map((k) => Math.cos(base + (k * Math.PI) / 3));
  const sn = [0, 1, 2].map((k) => Math.sin(base + (k * Math.PI) / 3));
  const w = [0, 1, 2].map((k) => noiseMap(W, u, 45, hashSeed("bleed-fibw", seed, k), { octaves: 1 }));
  const cache = new Float32Array(W * W).fill(-1);
  const FEAT = 4.5, SX = 0.14;
  return (i, x, y) => {
    let v = cache[i];
    if (v >= 0) return v;
    const X = (x + 0.5) / u, Y = (y + 0.5) / u;
    let acc = 0, ws = 0;
    for (let k = 0; k < 3; k++) {
      const rx = X * cs[k] + Y * sn[k], ry = -X * sn[k] + Y * cs[k];
      const r = 1 - Math.abs(nz[k]((rx * SX) / FEAT, ry / FEAT));
      const e = Math.exp(4 * w[k][i]);
      acc += e * r * r * r;
      ws += e;
    }
    v = acc / ws;
    cache[i] = v;
    return v;
  };
}

export default {
  id: "inkbleed",
  name: "Ink Bleed",
  category: "print",
  blurb: "Ink soaked into paper: hairy fringes, pooled edges.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "spread", label: "Bleed", type: "range", min: 0, max: 40, step: 1, default: 12, unit: "px" },
    { key: "feather", label: "Fibres", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "pooling", label: "Pooling", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    { key: "misreg", label: "Misregistration", type: "range", min: 0, max: 12, step: 1, default: 3, unit: "px" },
    { key: "grain", label: "Paper grain", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    {
      key: "ink", label: "Ink", type: "select", default: "logo",
      options: [
        { value: "logo", label: "Logo colors" },
        { value: "mono", label: "One ink" },
      ],
    },
    { key: "color", label: "Ink color", type: "color", default: "primary" },
  ],
  presets: [
    { name: "Bleeder", params: { spread: 12, feather: 60, pooling: 40, misreg: 3, grain: 40, ink: "logo" } },
    { name: "Soak", params: { spread: 30, feather: 85, pooling: 40, misreg: 3, grain: 40, ink: "logo" } },
    { name: "Dirty print", params: { spread: 12, feather: 60, pooling: 40, misreg: 7, grain: 70, ink: "logo" } },
    { name: "Ultra ink", params: { spread: 8, feather: 60, pooling: 85, misreg: 3, grain: 40, ink: "mono", color: "primary" } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = workSize(S);
    const u = ctx.scale * (W / S);
    const n = W * W;
    const A = W >= 384 ? W >> 1 : W;                 // distance-field grid
    const seed = ctx.seed >>> 0;
    const out = createCanvas(W, W);
    const logo = readLogo(src, W);
    const bb = bounds(logo.alpha, W, 0.1);
    if (bb.empty) return toSize(out, S);

    /* ── 1. spot inks: flatten the logo into ≤ 5 inks (or one) ── */
    const inks = [];          // { rgb, mask }
    if (p.ink === "mono") {
      const { ink } = inkDensity(logo, { chromaWeight: 0.6, lo: 0.18, hi: 0.5 });
      inks.push({ rgb: hexToRgb(p.color), mask: ink });
    } else {
      const pal = extractPalette(logo.canvas, 7, { maxSamples: 6000 });
      // merge near-duplicates, drop specks
      const cols = [];
      for (const c of pal) {
        const rgb = hexToRgb(c.hex);
        if (c.weight < 0.008) continue;
        if (cols.some((k) => Math.abs(k[0] - rgb[0]) + Math.abs(k[1] - rgb[1]) + Math.abs(k[2] - rgb[2]) < 40)) continue;
        cols.push(rgb);
        if (cols.length >= MAX_INKS) break;
      }
      if (!cols.length) cols.push(hexToRgb(p.color));
      const masks = cols.map(() => new Float32Array(n));
      const d = logo.data;
      const cache = new Int16Array(32768).fill(-1);
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const a = logo.alpha[i];
        if (a <= 0) continue;
        const key = ((d[j] >> 3) << 10) | ((d[j + 1] >> 3) << 5) | (d[j + 2] >> 3);
        let k = cache[key];
        if (k < 0) k = cache[key] = nearestColorIndex(d[j], d[j + 1], d[j + 2], cols);
        masks[k][i] = a;
      }
      cols.forEach((rgb, k) => inks.push({ rgb, mask: masks[k] }));
      // a white / pale logo: white ink doesn't exist on paper — print it in the ink colour
      if (cols.every((c) => luminance(rgbToHex(c)) > 0.6)) {
        inks.length = 0;
        inks.push({ rgb: hexToRgb(p.color), mask: Float32Array.from(logo.alpha) });
      }
      // print order: light inks first, the darkest (key) ink last and on register
      inks.sort((a, b) => luminance(rgbToHex(b.rgb)) - luminance(rgbToHex(a.rgb)));
    }

    /* ── 2. shared fields: fibres (direction drifts across the sheet), mottle, grain ── */
    const r = rng(hashSeed("bleed", seed));
    const F = fibreField(W, u, seed, r() * Math.PI);
    const mottle = noiseMap(W, u, 70, hashSeed("bleed-mottle", seed), { octaves: 3 });
    // how far the ink wicked, blot by blot (slow) — the hairs ride on top of this
    const blot = noiseMap(W, u, 16, hashSeed("bleed-blot", seed), { octaves: 3, grid: Math.max(1, 16 * u / 2.2) });
    const tooth = grainMap(W, u, 1.3, hashSeed("bleed-tooth", seed));
    const dots = grainMap(W, u, 3.2, hashSeed("bleed-dots", seed));
    const starveN = noiseMap(W, u, 38, hashSeed("bleed-starve", seed), { octaves: 3 });

    const spread = p.spread * u;
    const fe = p.feather / 100;
    const pool = p.pooling / 100;
    const gr = p.grain / 100;
    const ultra = smoothstep(0.6, 0.95, pool);
    const m = p.misreg * u;

    /* ── 3. print each ink ── */
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), AL = new Float32Array(n);
    const nk = inks.length;
    inks.forEach((ink, k) => {
      const key = k === nk - 1;
      // own misregistration offset (the key ink stays on register)
      let mask = ink.mask;
      if (!key && m >= 0.5) {
        const a = r() * Math.PI * 2, d = m * (0.45 + 0.55 * r());
        mask = shift(mask, W, Math.cos(a) * d, Math.sin(a) * d);
      } else r(); // keep the stream aligned
      const mb = bounds(mask, W, 0.05);
      if (mb.empty) return;
      const light = luminance(rgbToHex(ink.rgb)) > 0.75;      // white / pale: barely wicks
      // pale inks barely wick or pool: skip their distance fields
      const outD = light ? null : distanceNear(mask, W, "outside", spread * 1.6 + 4 * u, A);
      const inD = !light && (pool > 0 || ultra > 0) ? distanceNear(mask, W, "inside", 0, A) : null;
      const [ir, ig, ib] = ink.rgb;
      const reachMax = light ? 0 : spread;
      const reachAll = reachMax * Math.max(0.62, 0.45 + 1.1 * fe) + 0.6 * u;
      const pad = Math.ceil(reachMax * 1.2) + 2;
      const x0 = Math.max(0, mb.x0 - pad), x1 = Math.min(W, mb.x1 + pad);
      const y0 = Math.max(0, mb.y0 - pad), y1 = Math.min(W, mb.y1 + pad);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * W + x;
          let a = mask[i];
          const od = outD ? outD[i] : 0;
          // capillary fringe: a blotchy wicked zone, plus hairs that run out along the fibres
          if (reachMax > 0.3 && od > 0 && od < reachAll) {
            const f = F(i, x, y);
            const bl = 0.5 + 0.5 * blot[i];
            const zone = reachMax * (0.12 + 0.5 * bl) * (0.55 + 0.45 * fe) + 0.6 * u;
            let v = 0;
            if (od < zone) { const t = od / zone; v = 0.92 * (1 - t * t) * (0.8 + 0.25 * tooth[i]); }
            const hk = smoothstep(0.32, 0.75, f);
            const hair = reachMax * (0.45 + 1.1 * fe) * hk;
            if (od < hair) { const t = od / hair; const hv = 0.85 * (1 - t) * hk; if (hv > v) v = hv; }
            if (v > a) a = clamp(v);
          }
          if (a <= 0.004) continue;
          // pooling: darker just inside the edge; mottled density; ultra ink starves centres
          const id = inD ? inD[i] : 99;
          const pooled = pool * (light ? 0.2 : 1) * Math.exp(-id / (4 * u));
          let dens = 0.9 + 0.1 * mottle[i];
          if (ultra > 0 && !light) {
            const deep = smoothstep(4 * u, 14 * u, id);
            const hole = smoothstep(0.05, 0.35, starveN[i] + 0.25 * (tooth[i] - 0.5)) * deep * ultra;
            dens *= 1 - 0.85 * hole;
          }
          // paper tooth: ink skips the high points
          // (solid ink fills the tooth; the thin wicked ink skips it)
          const thinInk = mask[i] > 0.5 ? 0.35 : 1;
          const toothK = 1 - thinInk * (gr * 0.45 * smoothstep(0.6, 1, tooth[i]) + gr * 0.2 * smoothstep(0.75, 1, dots[i]));
          const al = a * clamp(dens * toothK);
          const dk = 1 - 0.5 * pooled - 0.06 * gr * (dots[i] - 0.5);
          const cr = ir * dk, cg = ig * dk, cb = ib * dk;
          // ink over what is printed already
          const ao = al + AL[i] * (1 - al);
          if (ao <= 0) continue;
          const wb = (AL[i] * (1 - al)) / ao, ws = al / ao;
          R[i] = cr * ws + R[i] * wb; G[i] = cg * ws + G[i] * wb; B[i] = cb * ws + B[i] * wb;
          AL[i] = ao;
        }
      }
    });

    /* ── 4. out ── */
    const img = ctx2d(out).createImageData(W, W);
    const od = img.data;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = AL[i];
      if (a <= 0.003) continue;
      od[j] = R[i]; od[j + 1] = G[i]; od[j + 2] = B[i]; od[j + 3] = a * 255 + 0.5;
    }
    ctx2d(out).putImageData(img, 0, 0);
    return toSize(out, S);
  },
};
