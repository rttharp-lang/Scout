// "Holo Foil" — iridescent holographic heat-transfer foil. The logo is pressed into a
// rainbow foil whose colour shifts with the surface: a soft bevel from the silhouette and
// each colour region (so features keep a relief), a diagonal sweep across the badge and a
// slow noise field drive the hue through a pastel diffraction spectrum; metallic shading,
// hot speculars and a fine glitter grain sit on top, and the logo's own luminance is
// blended back in so key lines stay dark and the mascot stays readable.
//
// Structure (same as halftone.js):
//   1. analysis maps at D = min(S, 1024): palette regions + silhouette distance → height
//      field → normals; a coarse noise grid;
//   2. shading at full S with bilinear maps; alpha and luminance from the full-res source;
//   3. transparent background, deterministic (seeded noise / glitter).
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, clamp, hexToRgb, nearestColorIndex,
  insideDistance, makeNoise2D, fbm, maskBounds, normalsFromHeight, hashSeed, dilateMask, maskToCanvas,
} from "../core.js";
import { extractPalette } from "../image.js";

/* ───────────────────────────── spectra ───────────────────────────── */

// one full cycle of each foil's diffraction colours (wraps around)
const SPECTRA = {
  silver: ["#FF9AD5", "#FFC3A1", "#FFF1A8", "#B5F7C8", "#8FE9FF", "#9DB2FF", "#D3A6FF"],
  pearl: ["#FFE1F0", "#FFF0DE", "#F6FBE2", "#DDF8F0", "#DDEFFF", "#E9E3FF", "#FBE2FA"],
  black: ["#C2189A", "#5A2BE0", "#1E6BFF", "#0FC2B0", "#7BD63A", "#F2B21B", "#E8542A"],
};
const LUT_N = 1024;

/** Cyclic spectrum LUT: LUT_N × RGB floats. */
function spectrumLUT(hexes) {
  const cols = hexes.map(hexToRgb);
  const m = cols.length;
  const lut = new Float32Array(LUT_N * 3);
  for (let i = 0; i < LUT_N; i++) {
    const t = (i / LUT_N) * m;
    const k = Math.floor(t), f = t - k;
    const a = cols[k % m], b = cols[(k + 1) % m];
    const s = f * f * (3 - 2 * f);
    lut[i * 3] = a[0] + (b[0] - a[0]) * s;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * s;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * s;
  }
  return lut;
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
  for (let y = 1; y < D - 1; y++) {
    for (let x = 1; x < D - 1; x++) {
      const i = y * D + x, l = lab[i];
      if (l < 0) continue;
      if (lab[i - 1] === l && lab[i + 1] === l && lab[i - D] === l && lab[i + D] === l) continue;
      cnt.fill(0);
      let own = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const q = lab[i + oy * D + ox];
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
  return out;
}

/** Distance (px) of every opaque pixel to the edge of its own colour region. */
function regionDistance(label, D) {
  const n = D * D;
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
  const d = insideDistance(interior, D, D);
  for (let i = 0; i < n; i++) if (label[i] >= 0) d[i] += 0.5;
  return d;
}

const circ = (t) => { const u = 1 - (t < 0 ? 0 : t > 1 ? 1 : t); return Math.sqrt(1 - u * u); };

/** D×D float mask → S×S Uint8 alpha (smooth upscale). */
function upsampleAlpha(mask, D, S) {
  const n = S * S;
  const out = new Uint8Array(n);
  if (D === S) {
    for (let i = 0; i < n; i++) out[i] = mask[i] * 255 + 0.5;
    return out;
  }
  const c = createCanvas(S, S);
  const x = ctx2d(c);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(maskToCanvas(mask, D, D), 0, 0, S, S);
  const d = getPixels(c).data;
  for (let i = 0, j = 3; i < n; i++, j += 4) out[i] = d[j];
  return out;
}

/** Integer hash → [0, 1). */
function hash2(x, y, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Analysis at D (palette regions, distance fields → height → normals, ink-darkness map).
 * Independent of every param, so foil / spread / shine / sparkle / detail changes only
 * re-shade (one-entry memo keyed by the source pixels and size).
 */
function analyse(srcD, data0, S, D, sc) {
  const n = D * D;
  const dataD = data0;
  const small = resizeCanvas(srcD, Math.min(D, 160), Math.min(D, 160));
  const pal = extractPalette(small, 7, { maxSamples: 4000 }).filter((c) => c.weight > 0.006);
  const palRGB = (pal.length ? pal : [{ hex: "#808080" }]).map((c) => hexToRgb(c.hex));
  const label = labelMap(dataD, D, palRGB);
  const alpha = new Float32Array(n), lum = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    alpha[i] = dataD[j + 3] / 255;
    lum[i] = (0.299 * dataD[j] + 0.587 * dataD[j + 1] + 0.114 * dataD[j + 2]) / 255;
  }
  const bb = maskBounds(alpha, D, D, 0.5);
  if (bb.empty) return null;
  const bevel = Math.max(1.5, 24 * sc), inner = Math.max(1.2, 9 * sc);
  let dOut = insideDistance(alpha, D, D, 0.5);
  // line art is inflated to a minimum stroke so the foil has a surface to show
  let opaque = 0, thick = 0;
  for (let i = 0; i < n; i++) if (alpha[i] >= 0.5) { opaque++; if (dOut[i] > 4 * sc) thick++; }
  let alphaS = null;
  if (opaque > 0 && thick < opaque * 0.12) {
    alpha.set(dilateMask(alpha, D, D, Math.max(1, 3.4 * sc)));
    for (let i = 0; i < n; i++) { lum[i] = 1; label[i] = alpha[i] >= 0.5 ? 0 : -1; }
    dOut = insideDistance(alpha, D, D, 0.5);
    alphaS = upsampleAlpha(alpha, D, S);
  }
  const dReg = regionDistance(label, D);
  const lumS = blurMask(lum, D, D, Math.max(0.6, 1.5 * sc));
  let H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (dOut[i] <= 0) continue;
    H[i] = circ((dOut[i] - 0.5) / bevel) * (0.5 + 0.3 * circ(dReg[i] / inner) + 0.2 * lumS[i]);
  }
  H = blurMask(H, D, D, Math.max(0.8, 3 * sc));
  // where the logo's darkness is kept: full on linework and region rims, partial deep
  // inside big dark fields (a navy ring stays foil, just a deeper one)
  const dk = new Float32Array(n);
  const r0 = 3 * sc, r1 = 14 * sc;
  for (let i = 0; i < n; i++) { const t = clamp((dReg[i] - r0) / (r1 - r0)); dk[i] = 1 - 0.3 * t * t * (3 - 2 * t); }
  const dkS = blurMask(dk, D, D, Math.max(0.6, 1.5 * sc));
  const { nx, ny, nz } = normalsFromHeight(H, D, D, bevel * 1.1);

  return { bb, alphaS, nx, ny, nz, dkS };
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
  id: "holographic",
  name: "Holo Foil",
  category: "metal",
  blurb: "Rainbow holographic foil that shifts across the logo.",
  method: "Heat transfer",
  stage: "dark",
  params: [
    {
      key: "base", label: "Foil", type: "select", default: "silver",
      options: [
        { value: "silver", label: "Silver holo" },
        { value: "pearl", label: "Pearl" },
        { value: "black", label: "Black holo" },
      ],
    },
    {
      key: "pattern", label: "Pattern", type: "select", default: "liquid",
      options: [
        { value: "liquid", label: "Liquid" },
        { value: "prism", label: "Prism" },
      ],
    },
    { key: "spread", label: "Hue spread", type: "range", min: 10, max: 100, step: 1, default: 55, unit: "%" },
    { key: "shine", label: "Shine", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "sparkle", label: "Sparkle", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    { key: "detail", label: "Logo detail", type: "range", min: 0, max: 100, step: 1, default: 65, unit: "%" },
  ],
  presets: [
    { name: "Holo foil", params: { base: "silver", pattern: "liquid", spread: 55, shine: 60, sparkle: 40, detail: 65 } },
    { name: "Opal", params: { base: "pearl", pattern: "liquid", spread: 35, shine: 70, sparkle: 25, detail: 55 } },
    { name: "Oil slick", params: { base: "black", pattern: "liquid", spread: 80, shine: 55, sparkle: 20, detail: 60 } },
    { name: "Prism", params: { base: "silver", pattern: "prism", spread: 60, shine: 65, sparkle: 55, detail: 65 } },
    { name: "Iridescent chrome", params: { base: "silver", pattern: "liquid", spread: 90, shine: 88, sparkle: 65, detail: 40 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const D = Math.min(S, 1024);
    const kD = D / S;
    const sc = ctx.scale * kD;
    const spread = p.spread / 100, shine = p.shine / 100, sparkle = p.sparkle / 100, detail = p.detail / 100;
    const base = SPECTRA[p.base] ? p.base : "silver";

    /* analysis at D (memoized) */
    const srcD = D === S ? src : resizeCanvas(src, D, D);
    const data0 = getPixels(srcD).data;
    const key = `${S}|${D}|${pixelHash(data0)}`;
    if (!memo || memo.key !== key) memo = { key, a: analyse(srcD, data0, S, D, sc) };
    const A = memo.a;
    if (!A) return createCanvas(S, S);
    const { bb, alphaS, nx, ny, nz, dkS } = A;

    /* coarse fields: slow noise for the liquid swirl */
    const spanS = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / kD;   // logo size, output px
    const cx = ((bb.x0 + bb.x1) / 2) / kD, cy = ((bb.y0 + bb.y1) / 2) / kD;
    const G = 72;
    const nz2 = makeNoise2D((ctx.seed >>> 0) + 4049);
    const field = new Float32Array(G * G);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const X = (gx / (G - 1)) * S, Y = (gy / (G - 1)) * S;
        field[gy * G + gx] = fbm(nz2, (X / spanS) * 1.3, (Y / spanS) * 1.3, 3);
      }
    }

    /* foil look */
    const lut = spectrumLUT(SPECTRA[base]);
    const lutInk = base === "black" ? lut : spectrumLUT(SPECTRA.black);   // dark inks → oil-slick foil
    const dark = base === "black";
    const pearl = base === "pearl";
    // hue cycles across the logo: diagonal sweep + surface tilt + swirl
    const cyc = 0.6 + 1.6 * spread;
    const kDiag = cyc / spanS, kN = 0.5 * cyc, kSw = 0.42 * cyc;
    const phase = hash2(ctx.seed | 0, 17, 91) * 0.3;
    const L1 = norm3(-0.45, -0.7, 0.55);
    const specK = 0.25 + 1.0 * shine;
    const prism = p.pattern === "prism";
    const facet = Math.max(3, 46 * ctx.scale);           // prism facet size, output px
    const fa = Math.cos(0.38), fb = Math.sin(0.38);
    const glit = Math.max(1.5, 5.5 * ctx.scale);          // glitter cell, output px
    const glitDensity = 0.03 + 0.16 * sparkle;
    const GC = 10;
    const cellOf = new Int32Array(S);
    for (let x = 0; x < S; x++) cellOf[x] = Math.min(GC - 1, ((x * GC) / S) | 0);
    const glintV = new Float32Array(GC * GC), glintP = new Int32Array(GC * GC);
    const seedG = hashSeed("holo-glitter", ctx.seed) | 0;
    const lo = dark ? 0.06 : 0.1;
    // shine > 80 %: a chrome horizon (dark line, bright sky above, deeper ground below)
    // bent by the surface, so very shiny foil reads as iridescent CHROME, not foil
    const hb = shine > 0.8 ? Math.min(1, (shine - 0.8) / 0.08) : 0;
    const yHz = cy + (bb.y1 - bb.y0) / kD * 0.02;
    const spanY = Math.max(8, (bb.y1 - bb.y0) / kD);

    const sd = getPixels(src).data;
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const od = img.data;
    const ix0 = new Int32Array(S), ix1 = new Int32Array(S), fxa = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      let fx = (x + 0.5) * kD - 0.5;
      fx = fx < 0 ? 0 : fx > D - 1 ? D - 1 : fx;
      ix0[x] = fx | 0; ix1[x] = Math.min(D - 1, ix0[x] + 1); fxa[x] = fx - ix0[x];
    }
    const gk = (G - 1) / S;
    for (let y = 0; y < S; y++) {
      let fy = (y + 0.5) * kD - 0.5;
      fy = fy < 0 ? 0 : fy > D - 1 ? D - 1 : fy;
      const y0 = fy | 0, y1 = Math.min(D - 1, y0 + 1), wy = fy - y0;
      const r0 = y0 * D, r1 = y1 * D;
      const gyf = Math.min(G - 1.001, y * gk), gy0 = gyf | 0, gwy = gyf - gy0;
      for (let x = 0; x < S; x++) {
        const j = (y * S + x) * 4;
        const a = alphaS ? alphaS[y * S + x] : sd[j + 3];
        if (a === 0) continue;
        const x0 = ix0[x], x1 = ix1[x], wx = fxa[x];
        const i00 = r0 + x0, i01 = r0 + x1, i10 = r1 + x0, i11 = r1 + x1;
        const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
        let Nx = nx[i00] * w00 + nx[i01] * w01 + nx[i10] * w10 + nx[i11] * w11;
        let Ny = ny[i00] * w00 + ny[i01] * w01 + ny[i10] * w10 + ny[i11] * w11;
        let Nz = nz[i00] * w00 + nz[i01] * w01 + nz[i10] * w10 + nz[i11] * w11;
        const il = 1 / Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
        Nx *= il; Ny *= il; Nz *= il;
        const gxf = Math.min(G - 1.001, x * gk), gx0 = gxf | 0, gwx = gxf - gx0;
        const gi = gy0 * G + gx0;
        const sw = (field[gi] * (1 - gwx) + field[gi + 1] * gwx) * (1 - gwy) + (field[gi + G] * (1 - gwx) + field[gi + G + 1] * gwx) * gwy;
        let t = ((x - cx) + (y - cy)) * 0.7071 * kDiag + (Nx * 0.8 - Ny * 0.6) * kN + sw * kSw + phase;
        let tilt = 0;
        if (prism) {
          // triangular facets: each catches the light at its own angle
          const u = ((x - cx) * fa + (y - cy) * fb) / facet, v = (-(x - cx) * fb + (y - cy) * fa) / facet + u * 0.5;
          const fu = Math.floor(u), fv = Math.floor(v);
          const tri = u - fu + (v - fv) > 1 ? 1 : 0;
          const hsh = hash2(fu * 2 + tri, fv, 7331);
          t += (hsh - 0.5) * 0.55 * cyc * 0.5;
          tilt = (hsh - 0.5) * 0.5;
        }
        t -= Math.floor(t);
        const li = (t * LUT_N) | 0;
        let r = lut[li * 3], g = lut[li * 3 + 1], b = lut[li * 3 + 2];
        // metal shading: facing the light → brighter, grazing → deeper colour
        const ndl = Nx * L1[0] + Ny * L1[1] + Nz * L1[2] + tilt;
        const edge = 1 - Nz;
        // a broad diagonal light sweep where the foil flashes silver-white
        const bd = ((x - cx) + (y - cy)) * 0.7071 / spanS + Nx * 0.3 + Ny * 0.25 + sw * 0.08 + 0.22;
        const sweep = Math.exp(-bd * bd * 22) * (0.25 + 0.55 * shine);
        const L = alphaS ? 1 : (0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2]) / 255;
        const inkL = L * 1.25 > 1 ? 1 : L * 1.25;
        if (dark) {
          // black holo: glossy black body, the spectrum lives on the bevels and the sweep
          // (light inks carry a richer film so the mascot reads on a black shirt)
          const film = clamp(0.28 + 0.34 * inkL + edge * 1.5 + sweep * 1.3);
          const sh = 0.42 + 0.74 * clamp(ndl);
          r = (12 + (r - 12) * film) * sh; g = (12 + (g - 12) * film) * sh; b = (16 + (b - 16) * film) * sh;
        } else {
          const sat = 1.12 + edge * 1.7;
          const m = (r + g + b) / 3;
          r = m + (r - m) * sat; g = m + (g - m) * sat; b = m + (b - m) * sat;
          const shade = pearl ? 0.84 + 0.22 * clamp(ndl) : 0.66 + 0.46 * clamp(ndl);
          r *= shade; g *= shade; b *= shade;
          const wk = sweep * (pearl ? 0.5 : 0.65);
          r += (246 - r) * wk; g += (248 - g) * wk; b += (252 - b) * wk;
        }
        // logo detail: dark inks print as a smoked, oil-slick foil (deep body, the spectrum
        // only in its sheen) so key lines stay dark but still read as foil
        const dkv = dkS[i00] * w00 + dkS[i01] * w01 + dkS[i10] * w10 + dkS[i11] * w11;
        const ink = Math.min(1, detail * 1.4) * dkv * (1 - inkL) * Math.sqrt(1 - inkL);
        if (ink > 0.003 && !dark) {
          const film = clamp(0.12 + edge * 1.6 + sweep * 0.9);
          const sh = 0.32 + 0.75 * clamp(ndl);
          const kr = (10 + (lutInk[li * 3] - 10) * film) * sh, kg = (11 + (lutInk[li * 3 + 1] - 11) * film) * sh, kb = (16 + (lutInk[li * 3 + 2] - 16) * film) * sh;
          r += (kr - r) * ink; g += (kg - g) * ink; b += (kb - b) * ink;
        }
        const f = dark ? 1 - detail * dkv * (1 - (lo + (1 - lo) * inkL)) : 1 - 0.55 * ink;
        if (dark) { r *= f; g *= f; b *= f; }
        if (hb > 0) {
          const hv = ((yHz - y) / spanY) * 1.7 - 1.9 * Nz * Ny + sw * 0.3;
          const band = Math.exp(-(hv / 0.07) * (hv / 0.07));
          if (hv > 0) {
            const up = 0.42 * hb * (hv < 0.25 ? hv / 0.25 : 1) * (hv > 0.9 ? Math.max(0, 1 - (hv - 0.9) / 0.6) : 1);
            r += (255 - r) * up; g += (255 - g) * up; b += (255 - b) * up;
          } else {
            const dn = 1 - 0.5 * hb * (hv > -0.3 ? -hv / 0.3 : 1);
            r *= dn; g *= dn; b *= dn;
          }
          const hl = 1 - 0.88 * hb * band;
          r *= hl; g *= hl; b *= hl;
        }
        // specular: R·L = 2 Nz (N·L) − Lz
        let s1 = 2 * Nz * (ndl - tilt) - L1[2];
        s1 = s1 > 0 ? s1 : 0;
        let s8 = s1 * s1; s8 *= s8; s8 *= s8;
        const spec = (s8 * s8 * 0.9 + s8 * 0.18) * specK * (0.4 + 0.6 * f);
        r += spec * 255; g += spec * 255; b += spec * 255;
        // glitter: sparse flecks of varied size, tinted by the spectrum, that flash where
        // the foil catches the light (and stay quiet on dark linework)
        if (sparkle > 0) {
          const gxI = Math.floor(x / glit), gyI = Math.floor(y / glit);
          const hh = hash2(gxI, gyI, seedG);
          if (hh < glitDensity) {
            const u1 = hh / glitDensity;
            const h2 = hash2(gyI, gxI, seedG ^ 0x5bd1e995);
            const fxp = x / glit - gxI - (0.3 + 0.4 * h2), fyp = y / glit - gyI - (0.3 + 0.4 * u1);
            const rad = 0.16 + 0.22 * h2;
            const dd = 1 - Math.sqrt(fxp * fxp + fyp * fyp) / rad;
            if (dd > 0) {
              const catchL = 0.25 + 0.75 * clamp(ndl * 1.4 - 0.1 + sweep);
              const k = Math.min(1, dd * 1.6) * (0.35 + 0.65 * u1) * (0.45 + 0.7 * sparkle) * catchL * (0.25 + 0.75 * f);
              const ci = (h2 * LUT_N) | 0;
              const fr = lut[ci * 3] * 0.55 + 115, fg = lut[ci * 3 + 1] * 0.55 + 115, fb = lut[ci * 3 + 2] * 0.55 + 115;
              r += (fr - r * 0.4) * k; g += (fg - g * 0.4) * k; b += (fb - b * 0.4) * k;
            }
          }
          // track the hottest highlight per coarse cell for a few star twinkles
          if (spec > 0.55 && a > 250) {
            const c = ((y * GC) / S | 0) * GC + cellOf[x];
            if (spec > glintV[c]) { glintV[c] = spec; glintP[c] = y * S + x; }
          }
        }
        od[j] = r > 255 ? 255 : r < 0 ? 0 : r;
        od[j + 1] = g > 255 ? 255 : g < 0 ? 0 : g;
        od[j + 2] = b > 255 ? 255 : b < 0 ? 0 : b;
        od[j + 3] = a;
      }
    }
    o.putImageData(img, 0, 0);
    if (sparkle >= 0.2) drawTwinkles(o, glintV, glintP, S, spanS, Math.round(1 + sparkle * 2.5), lut);
    return out;
  },
};

/** A few small 4-point twinkles on the strongest, well separated highlights. */
function drawTwinkles(o, val, pos, S, span, count, lut) {
  const order = Array.from(val.keys()).filter((c) => val[c] > 0).sort((a, b) => val[b] - val[a] || a - b);
  const picks = [];
  for (const c of order) {
    const x = (pos[c] % S) + 0.5, y = Math.floor(pos[c] / S) + 0.5;
    if (picks.every((q) => Math.hypot(q[0] - x, q[1] - y) > span * 0.28)) picks.push([x, y]);
    if (picks.length >= count) break;
  }
  o.save();
  picks.forEach(([x, y], k) => {
    const R = span * (k === 0 ? 0.05 : 0.035);
    const ci = ((k * 0.37 + 0.11) % 1) * LUT_N | 0;
    const tint = `${Math.round(lut[ci * 3] * 0.3 + 178)},${Math.round(lut[ci * 3 + 1] * 0.3 + 178)},${Math.round(lut[ci * 3 + 2] * 0.3 + 178)}`;
    const glow = o.createRadialGradient(x, y, 0, x, y, R * 0.5);
    glow.addColorStop(0, `rgba(255,255,255,0.95)`);
    glow.addColorStop(0.3, `rgba(${tint},0.4)`);
    glow.addColorStop(1, `rgba(${tint},0)`);
    o.fillStyle = glow;
    o.beginPath(); o.arc(x, y, R * 0.5, 0, Math.PI * 2); o.fill();
    o.fillStyle = "rgba(255,255,255,0.92)";
    for (const [dx, dy, len] of [[1, 0, 1], [0, 1, 0.75]]) {
      const w = R * 0.05;
      o.beginPath();
      o.moveTo(x - dx * R * len, y - dy * R * len);
      o.quadraticCurveTo(x + dy * w, y + dx * w, x + dx * R * len, y + dy * R * len);
      o.quadraticCurveTo(x - dy * w, y - dx * w, x - dx * R * len, y - dy * R * len);
      o.fill();
    }
  });
  o.restore();
}

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
