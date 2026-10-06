// "Thermal" — the logo seen through a heat camera. Heat comes from three things a real
// body would have: thickness (distance from the edge: hot core, cooling edges), mass (big
// shapes stay warmer than thin strokes) and the logo's own tones (light inks read hot, the
// key line reads cold, so eyes, teeth and lettering stay legible). The heat map runs through
// a gradient (ironbow, a team-colour ramp, or night-vision phosphor), bleeds into a soft
// heat halo around the shape, and picks up a little sensor noise and scan lines.
//
// Structure (after halftone.js):
//   1. heat is computed at W = min(S, 1024) with core.js distance fields and blurs (radii in
//      1024-units × W/1024, so every size gets the same picture);
//   2. one pass maps heat → colour through a 256-entry LUT and composites shape over halo;
//   3. W < S is smoothly upscaled (heat images are soft by nature). Transparent background.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, insideDistance, clamp, smoothstep,
  gradientLUT, hexToRgb, rgbToHsl, hslToHex, hashSeed, makeNoise2D,
} from "../core.js";

const IRONBOW = [
  { at: 0.0, color: "#06031A" },
  { at: 0.14, color: "#24096A" },
  { at: 0.3, color: "#6A0FA0" },
  { at: 0.45, color: "#C21E78" },
  { at: 0.58, color: "#EE4A24" },
  { at: 0.72, color: "#FB960B" },
  { at: 0.86, color: "#FFDB3A" },
  { at: 1.0, color: "#FFFCEB" },
];
const NIGHT = [
  { at: 0.0, color: "#010803" },
  { at: 0.22, color: "#06290F" },
  { at: 0.5, color: "#178A36" },
  { at: 0.76, color: "#5FEA67" },
  { at: 1.0, color: "#E6FFDA" },
];

/** Team ramp: dark → the team inks in order of lightness (dark ones lifted) → white-hot. */
function teamRamp(pal) {
  const inks = [pal.primary, pal.secondary, pal.accent].filter(Boolean).map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    return { hex, h, s, l };
  });
  // chromatic inks carry the ramp; near-greys only as the hot end
  const chroma = inks.filter((c) => c.s > 0.2 && c.l > 0.06 && c.l < 0.92).sort((a, b) => a.l - b.l);
  const stops = [{ at: 0, color: "#07080C" }];
  if (!chroma.length) {
    stops.push({ at: 0.45, color: "#5A6270" }, { at: 0.8, color: "#C9D0DA" });
  } else if (chroma.length === 1) {
    const c = chroma[0];
    stops.push({ at: 0.3, color: hslToHex(c.h, Math.max(c.s, 0.6), 0.22) });
    stops.push({ at: 0.58, color: hslToHex(c.h, Math.max(c.s, 0.7), 0.48) });
    stops.push({ at: 0.82, color: hslToHex(c.h, Math.max(c.s, 0.7), 0.72) });
  } else {
    const [a, b] = [chroma[0], chroma[chroma.length - 1]];
    stops.push({ at: 0.26, color: hslToHex(a.h, Math.max(a.s, 0.6), clamp(a.l, 0.2, 0.3)) });
    stops.push({ at: 0.46, color: hslToHex(a.h, Math.max(a.s, 0.65), clamp(a.l + 0.2, 0.4, 0.52)) });
    stops.push({ at: 0.7, color: hslToHex(b.h, Math.max(b.s, 0.7), clamp(b.l, 0.45, 0.58)) });
    stops.push({ at: 0.86, color: hslToHex(b.h, Math.max(b.s, 0.7), 0.74) });
  }
  stops.push({ at: 1, color: "#FFFFFF" });
  return stops;
}

/** Blur a W×W map at 1/f resolution (box-downsampled) and bilinearly upsample it back. */
function lowBlur(map, W, f, sigma) {
  if (f <= 1) return blurMask(map, W, W, sigma);
  const w = Math.ceil(W / f);
  const small = new Float32Array(w * w);
  const cnt = new Float32Array(w * w);
  for (let y = 0; y < W; y++) {
    const row = ((y / f) | 0) * w;
    for (let x = 0; x < W; x++) {
      const k = row + ((x / f) | 0);
      small[k] += map[y * W + x];
      cnt[k]++;
    }
  }
  for (let k = 0; k < w * w; k++) small[k] /= cnt[k] || 1;
  return upsample(blurMask(small, w, w, sigma / f), w, f, W);
}

/** Bilinear upsample of a w×w map (1/f resolution) to W×W. */
function upsample(b, w, f, W) {
  const out = new Float32Array(W * W);
  const x0 = new Int32Array(W), x1 = new Int32Array(W), fx = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const sx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5));
    x0[x] = sx | 0; x1[x] = Math.min(w - 1, x0[x] + 1); fx[x] = sx - x0[x];
  }
  for (let y = 0; y < W; y++) {
    const sy = Math.min(w - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = sy | 0, y1 = Math.min(w - 1, y0 + 1), fy = sy - y0;
    const r0 = y0 * w, r1 = y1 * w, o = y * W;
    for (let x = 0; x < W; x++) {
      const a = b[r0 + x0[x]] + (b[r0 + x1[x]] - b[r0 + x0[x]]) * fx[x];
      const c = b[r1 + x0[x]] + (b[r1 + x1[x]] - b[r1 + x0[x]]) * fx[x];
      out[o + x] = a + (c - a) * fy;
    }
  }
  return out;
}

export default {
  id: "thermal",
  name: "Thermal",
  category: "digital",
  blurb: "Heat-camera vision: hot core, glowing edges, sensor grain.",
  method: "Sublimation",
  stage: "dark",
  params: [
    {
      key: "palette", label: "Palette", type: "select", default: "iron",
      options: [
        { value: "iron", label: "Thermal" },
        { value: "team", label: "Team heat" },
        { value: "night", label: "Night vision" },
      ],
    },
    { key: "spread", label: "Heat spread", type: "range", min: 10, max: 160, step: 1, default: 70, unit: "px" },
    { key: "contrast", label: "Contrast", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    { key: "halo", label: "Heat halo", type: "range", min: 0, max: 60, step: 1, default: 22, unit: "px" },
    { key: "noise", label: "Sensor noise", type: "range", min: 0, max: 100, step: 1, default: 35, unit: "%" },
  ],
  presets: [
    { name: "Thermal", params: { palette: "iron", spread: 70, contrast: 55, halo: 22, noise: 35 } },
    { name: "Team heat", params: { palette: "team", spread: 80, contrast: 60, halo: 18, noise: 25 } },
    { name: "Night vision", params: { palette: "night", spread: 40, contrast: 65, halo: 14, noise: 70 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = Math.min(S, 1024);
    const u = W / 1024;                         // 1024-units → px at W
    const n = W * W;
    const img = W === S ? src : resizeCanvas(src, W, W);
    const d = getPixels(img).data;
    const night = p.palette === "night";

    /* ── heat ── */
    const A = new Float32Array(n), L = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = d[j + 3] / 255;
      A[i] = a;
      L[i] = a * (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255;
    }
    const D = insideDistance(A, W, W, 0.5);
    // heat spread is relative to the logo's own thickness, so thin line art still glows
    let dMax = 0;
    for (let i = 0; i < n; i++) if (D[i] > dMax) dMax = D[i];
    const spread = Math.max(0.75, Math.min(p.spread * u, dMax * 0.45));
    // body mass: a very wide blur, computed at 1/8 resolution
    const mass = lowBlur(A, W, 8, 90 * u);
    let mMax = 1e-6;
    for (let i = 0; i < n; i++) if (mass[i] > mMax) mMax = mass[i];
    const gain = 0.72 + 1.0 * (p.contrast / 100);
    const wCore = night ? 0.14 : 0.4, wMass = night ? 0.06 : 0.14, wLum = night ? 0.68 : 0.3, base = 0.1;
    // mottled body heat: low-frequency noise, computed coarse and upsampled
    const mf = 8, mw = Math.ceil(W / mf);
    const nzh = makeNoise2D(hashSeed("thermal-mottle", ctx.seed));
    const mot = new Float32Array(mw * mw);
    const ms = (mf / u) / 190;                      // ~190 px (at 1024) blotches
    for (let y = 0; y < mw; y++) for (let x = 0; x < mw; x++) {
      mot[y * mw + x] = nzh(x * ms, y * ms) * 0.7 + nzh(x * ms * 2.3 + 17, y * ms * 2.3) * 0.3;
    }
    const mottle = upsample(mot, mw, mf, W);
    const H = new Float32Array(n);
    const HA = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a <= 0) continue;
      const core = 1 - Math.exp(-D[i] / spread);
      const h = base + wCore * core + wMass * (mass[i] / mMax) + wLum * (L[i] / a) + 0.045 * mottle[i] * core;
      H[i] = clamp(0.5 + (h - 0.5) * gain);
      HA[i] = H[i] * a;
    }
    // heat diffuses a little inside the body (soft, but features stay)
    const hs = blurMask(HA, W, W, 2.2 * u);
    const as = blurMask(A, W, W, 2.2 * u);
    for (let i = 0; i < n; i++) if (A[i] > 0) H[i] = 0.55 * H[i] + 0.45 * (as[i] > 0.02 ? hs[i] / as[i] : H[i]);
    // heat bleed outside the shape (soft by nature: 1/4 resolution)
    const haloR = p.halo * u;
    let bleed = null, bleedA = null;
    if (haloR > 0.5) {
      const f = haloR >= 8 ? 4 : haloR >= 4 ? 2 : 1;
      bleed = lowBlur(HA, W, f, haloR);
      bleedA = lowBlur(A, W, f, haloR);
    }

    /* ── colour ── */
    const stops = p.palette === "team" ? teamRamp(ctx.palette) : night ? NIGHT : IRONBOW;
    const lut = gradientLUT(stops);
    const nz = makeNoise2D(hashSeed("thermal", ctx.seed));
    const amt = p.noise / 100;
    const grainC = Math.max(1, Math.round(1.2 * u));
    const pitch = Math.max(2, Math.round((night ? 4 : 3) * u));
    const seedMix = hashSeed("thermal-grain", ctx.seed) | 0;
    const rowN = new Float32Array(W), colN = new Float32Array(W);
    for (let y = 0; y < W; y++) {
      rowN[y] = (y % pitch === 0 ? -0.05 : 0) * amt * (night ? 1.6 : 1) + nz(0.5, y / (40 * u)) * 0.025 * amt;
    }
    for (let x = 0; x < W; x++) colN[x] = nz(x / (2.5 * u), 7.7) * 0.012 * amt;   // fixed-pattern columns
    const out = createCanvas(W, W);
    const ox = ctx2d(out);
    const oi = ox.createImageData(W, W);
    const od = oi.data;
    for (let y = 0; y < W; y++) {
      const gy = (y / grainC) | 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = A[i];
        let ha = 0, hh = 0;
        if (bleed) {
          const ba = bleedA[i];
          if (ba > 0.004) {
            hh = bleed[i] * 1.05;
            // the halo's opacity follows its heat: only the glowing part prints, the cold
            // tail goes transparent instead of turning into a murky haze on dark fabric
            ha = smoothstep(0.01, 0.42, ba) * smoothstep(0.08, 0.3, hh) * 0.95;
          }
        }
        if (a <= 0 && ha <= 0) continue;
        let gh = Math.imul((x / grainC | 0) ^ seedMix, 0x27d4eb2d) ^ Math.imul(gy, 0x165667b1);
        gh ^= gh >>> 15; gh = Math.imul(gh, 0x85ebca6b); gh ^= gh >>> 13;
        const jitter = ((gh & 1023) / 1023 - 0.5) * 0.09 * amt + rowN[y] + colN[x];
        const hIn = clamp(H[i] + jitter), hOut = clamp(hh + jitter * 0.6);
        const ki = ((hIn * 255 + 0.5) | 0) * 3, ko = ((hOut * 255 + 0.5) | 0) * 3;
        // shape over halo
        const oa = a + ha * (1 - a);
        if (oa <= 0) continue;
        const wi = a / oa, wo = 1 - wi;
        const j = i * 4;
        od[j] = lut[ki] * wi + lut[ko] * wo;
        od[j + 1] = lut[ki + 1] * wi + lut[ko + 1] * wo;
        od[j + 2] = lut[ki + 2] * wi + lut[ko + 2] * wo;
        od[j + 3] = oa * 255 + 0.5;
      }
    }
    ox.putImageData(oi, 0, 0);
    if (W === S) return out;
    const big = createCanvas(S, S);
    const bx = ctx2d(big);
    bx.imageSmoothingEnabled = true;
    bx.imageSmoothingQuality = "high";
    bx.drawImage(out, 0, 0, S, S);
    return big;
  },
};
