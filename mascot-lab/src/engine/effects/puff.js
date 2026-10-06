// "Puff" — puff-print / inflated 3-D. Every colour region of the logo swells up like
// foamed puff ink: its height follows the region's own distance field (rounded
// profile), so where two colours meet the surface dips into a crease. Soft matte shading
// from an adjustable light, a gentle (or glossy) highlight, darker creases, a fine foam
// grain and a soft contact shadow — and the logo keeps its own colours. An optional
// keyline puffs up as its own border, sticker style.
//
// Structure (same as halftone.js):
//   1. analysis at D = min(S, 1024): palette regions → per-region + silhouette distance
//      → height → normals, crease occlusion; contact shadow from the blurred silhouette;
//   2. shading at full S with bilinear maps, colours and alpha from the full-res source;
//   3. transparent background (the shadow is the only thing outside), deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, clamp, hexToRgb, nearestColorIndex,
  insideDistance, dilateMask, maskToCanvas, maskBounds, normalsFromHeight, hashSeed,
} from "../core.js";
import { extractPalette } from "../image.js";

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

/** Inflated profile 0..1 over t = depth / radius: steep rounded shoulder, soft dome. */
const inflate = (t) => { const u = 1 - (t < 0 ? 0 : t > 1 ? 1 : t); return Math.sqrt(1 - u * u * u * u); };

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

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "puff",
  name: "Puff",
  category: "retro",
  blurb: "Raised puff-print ink, every color inflated.",
  method: "Puff print",
  stage: "mid",
  params: [
    { key: "puff", label: "Puffiness", type: "range", min: 4, max: 44, step: 1, default: 18, unit: "px" },
    { key: "angle", label: "Light angle", type: "range", min: 0, max: 360, step: 5, default: 120, unit: "°" },
    { key: "gloss", label: "Gloss", type: "range", min: 0, max: 100, step: 1, default: 25, unit: "%" },
    { key: "shadow", label: "Shadow", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "outline", label: "Puffed outline", type: "toggle", default: false },
    { key: "outlineColor", label: "Outline color", type: "color", default: "accent" },
  ],
  presets: [
    { name: "Puff print", params: { puff: 18, angle: 120, gloss: 25, shadow: 45, outline: false } },
    { name: "Balloon", params: { puff: 34, angle: 120, gloss: 95, shadow: 60, outline: true, outlineColor: "accent" } },
    { name: "Clay", params: { puff: 24, angle: 135, gloss: 0, shadow: 30, outline: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const D = Math.min(S, 1024);
    const kD = D / S;
    const sc = ctx.scale * kD;          // 1024-units → D px
    const n = D * D;
    const gloss = p.gloss / 100, shadowAmt = p.shadow / 100;

    /* the print: the logo, optionally on a puffed keyline border */
    let art = src;
    if (p.outline) {
      const small = D === S ? src : resizeCanvas(src, D, D);
      const am = new Float32Array(n);
      const d0 = getPixels(small).data;
      for (let i = 0, j = 3; i < n; i++, j += 4) am[i] = d0[j] / 255;
      const ring = maskToCanvas(dilateMask(am, D, D, Math.max(1, 13 * sc)), D, D, p.outlineColor);
      art = createCanvas(S, S);
      const ax = ctx2d(art);
      ax.imageSmoothingEnabled = true;
      ax.imageSmoothingQuality = "high";
      ax.drawImage(ring, 0, 0, S, S);
      ax.drawImage(src, 0, 0);
    }

    /* analysis at D */
    const artD = D === S ? art : resizeCanvas(art, D, D);
    const dataD = getPixels(artD).data;
    const small = resizeCanvas(artD, Math.min(D, 160), Math.min(D, 160));
    const pal = extractPalette(small, 7, { maxSamples: 4000 }).filter((c) => c.weight > 0.006);
    const palRGB = (pal.length ? pal : [{ hex: "#808080" }]).map((c) => hexToRgb(c.hex));
    const label = labelMap(dataD, D, palRGB);
    const alpha = new Float32Array(n);
    for (let i = 0, j = 3; i < n; i++, j += 4) alpha[i] = dataD[j] / 255;
    const bb = maskBounds(alpha, D, D, 0.5);
    if (bb.empty) return createCanvas(S, S);

    const R = Math.max(1.5, p.puff * sc);
    let dOut = insideDistance(alpha, D, D, 0.5);
    // line art is fattened to a puffable stroke (hairlines can't hold foam ink)
    let opaque = 0, thick = 0;
    for (let i = 0; i < n; i++) if (alpha[i] >= 0.5) { opaque++; if (dOut[i] > 4 * sc) thick++; }
    let alphaS = null;
    if (opaque > 0 && thick < opaque * 0.12) {
      alpha.set(dilateMask(alpha, D, D, Math.max(1, 3 * sc)));
      for (let i = 0; i < n; i++) label[i] = alpha[i] >= 0.5 ? 0 : -1;
      dOut = insideDistance(alpha, D, D, 0.5);
      alphaS = upsampleAlpha(alpha, D, S);
    }
    const dReg = regionDistance(label, D);
    let H = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (dOut[i] <= 0) continue;
      // the whole print is a raised layer; each colour region swells on top of it, and
      // big regions keep rising gently toward their middle like a balloon
      H[i] = 0.3 * inflate((dOut[i] - 0.5) / (R * 1.4)) + 0.55 * inflate(dReg[i] / R) + 0.3 * inflate(dReg[i] / (R * 4.5));
    }
    const soft = Math.max(0.7, R * (0.1 + 0.2 * (1 - gloss) * (1 - gloss)));     // clay is softer
    H = blurMask(H, D, D, soft);
    for (let i = 0; i < n; i++) if (alpha[i] <= 0) H[i] = 0;
    const { nx, ny, nz } = normalsFromHeight(H, D, D, R * 1.5);
    // crease occlusion: how far a pixel sits below its neighbourhood
    const Hb = blurMask(H, D, D, R * 0.6);
    const ao = new Float32Array(n);
    for (let i = 0; i < n; i++) ao[i] = clamp((Hb[i] - H[i]) * 2.4);

    /* contact shadow: blurred silhouette pushed away from the light */
    const th = (p.angle * Math.PI) / 180;
    const Lx = Math.cos(th), Ly = -Math.sin(th);
    const L = norm3(Lx * 0.75, Ly * 0.75, 0.66);
    const Hh = norm3(L[0], L[1], L[2] + 1);                      // Blinn half vector (V = +z)
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    if (shadowAmt > 0) {
      const sh = blurMask(alpha, D, D, Math.max(1, (5 + p.puff * 0.35) * sc));
      const sc2 = createCanvas(D, D);
      const sx = ctx2d(sc2);
      const si = sx.createImageData(D, D);
      for (let i = 0, j = 3; i < n; i++, j += 4) si.data[j] = Math.min(1, sh[i] * 1.15) * 255 * (0.2 + 0.45 * shadowAmt);
      sx.putImageData(si, 0, 0);
      const off = (3 + p.puff * 0.25) * ctx.scale;
      o.drawImage(sc2, -Lx * off, -Ly * off, S, S);
    }

    /* shade at S */
    const sd = getPixels(art).data;
    const img = o.createImageData(S, S);
    const od = img.data;
    const ix0 = new Int32Array(S), ix1 = new Int32Array(S), fxa = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      let fx = (x + 0.5) * kD - 0.5;
      fx = fx < 0 ? 0 : fx > D - 1 ? D - 1 : fx;
      ix0[x] = fx | 0; ix1[x] = Math.min(D - 1, ix0[x] + 1); fxa[x] = fx - ix0[x];
    }
    const expo = 6 + gloss * 70;                    // highlight tightness
    const specK = 0.12 + gloss * 0.75;
    const grainCell = Math.max(1, (1.4 + 1.4 * (1 - gloss)) * ctx.scale);
    const grainK = 0.025 + 0.03 * (1 - gloss);
    const seed = hashSeed("puff-grain", ctx.seed) | 0;
    const flat = L[2];
    const contrastK = 0.55 + 0.3 * gloss;          // matte clay = softer light
    const lineRGB = palRGB[0];
    for (let y = 0; y < S; y++) {
      let fy = (y + 0.5) * kD - 0.5;
      fy = fy < 0 ? 0 : fy > D - 1 ? D - 1 : fy;
      const y0 = fy | 0, y1 = Math.min(D - 1, y0 + 1), wy = fy - y0;
      const r0 = y0 * D, r1 = y1 * D;
      const gyI = Math.floor(y / grainCell);
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
        const occ = ao[i00] * w00 + ao[i01] * w01 + ao[i10] * w10 + ao[i11] * w11;
        // matte light relative to a flat surface: flat keeps the ink colour exactly
        const ndl = Nx * L[0] + Ny * L[1] + Nz * L[2];
        let shade = 1 + (ndl / flat - 1) * contrastK;
        shade = shade < 0.3 ? 0.3 : shade;
        shade *= 1 - occ * 0.55;
        // foam grain
        shade *= 1 + (hash2(Math.floor(x / grainCell), gyI, seed) - 0.5) * grainK;
        let r = sd[j], g = sd[j + 1], b = sd[j + 2];
        if (alphaS && sd[j + 3] < 250) { const k = sd[j + 3] / 255; r = r * k + lineRGB[0] * (1 - k); g = g * k + lineRGB[1] * (1 - k); b = b * k + lineRGB[2] * (1 - k); }
        if (shade <= 1) { r *= shade; g *= shade; b *= shade; }
        else { const k = Math.min(1, (shade - 1) * 0.9); r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
        // highlight (Blinn)
        let nh = Nx * Hh[0] + Ny * Hh[1] + Nz * Hh[2];
        nh = nh > 0 ? nh : 0;
        let spec = Math.pow(nh, expo) * specK * (1 - occ);
        if (gloss > 0.4) {
          // glossy: a hot pin highlight and a reflective rim, like an inflated balloon
          const g2 = (gloss - 0.4) / 0.6;
          let pin = nh * nh; pin *= pin; pin *= pin; pin *= pin; pin *= pin; pin *= pin;   // ^64
          const rimE = 1 - Nz;
          spec += (pin * pin * 0.9 + rimE * rimE * 0.55) * g2 * (1 - occ);
          spec = spec > 1 ? 1 : spec;
        }
        r += (255 - r) * spec; g += (255 - g) * spec; b += (255 - b) * spec;
        od[j] = r > 255 ? 255 : r; od[j + 1] = g > 255 ? 255 : g; od[j + 2] = b > 255 ? 255 : b;
        od[j + 3] = a;
      }
    }
    const top = createCanvas(S, S);
    ctx2d(top).putImageData(img, 0, 0);
    o.drawImage(top, 0, 0);
    return out;
  },
};

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
