// "Glow" (aura) — dreamy light around the logo, from a soft Pro-Mist bloom to a big
// grainy two-colour aura (the gradient-aura look), a Glow FX style patterned halo and a
// halftone-dot glow. The logo itself stays crisp on top (with a hair of edge diffusion).
//
//   halo = the silhouette, dilated, blurred wide and domain-warped by low-frequency noise
//          (organic, not a circle) on a small grid, faded out well before the canvas edge;
//   aura     → mapped white-hot → colour → colour 2 → transparent, dithered with grain;
//   pattern  → the same light seen through horizontal scan lines plus grit (Glow FX);
//   halftone → the halo re-screened as round dots whose size follows the light;
//   bloom    → the logo's own colours, lifted toward the glow colour, blurred twice and
//              screened around and over the art (soft-focus diffusion).
//
// Colours are team roles; dark or neutral picks are lifted to something that can glow
// (navy → electric blue, black → an analogous hot tone), so every palette produces light.
// Transparent background, deterministic (seeded noise / grain).
import {
  createCanvas, ctx2d, resizeCanvas, clamp, smoothstep, hexToRgb, rgbToHsl, hslToHex,
  mix, makeNoise2D, fbm, outsideDistance, blurMask, blurCanvas, gradientLUT, sampleBilinear, hashSeed,
  maskBounds,
} from "../core.js";
import { alphaAt, hash01, luminousHex, isNeutral, squircleWindow } from "../fx/light.js";

const TAU = Math.PI * 2;

/* ───────────────────────────── colour ───────────────────────────── */

/**
 * The two glow colours actually used: each lifted to a luminous version of itself; a
 * neutral DARK pick (black, charcoal) is replaced by an analogous hot partner of the
 * other colour, a neutral light (white) stays white light.
 */
function glowPair(c1, c2) {
  const lift = (hex) => (isNeutral(hex) ? hex : luminousHex(hex, { minL: 0.55, maxL: 0.68 }));
  const darkNeutral = (hex) => isNeutral(hex) && rgbToHsl(hexToRgb(hex))[2] < 0.5;
  const partner = (hex) => {
    const [h, s] = rgbToHsl(hexToRgb(hex));
    if (s < 0.16) return "#FFFFFF";
    return luminousHex(hslToHex((h + 34) % 360, Math.max(0.9, s), 0.58), { minL: 0.58, maxL: 0.66 });
  };
  let a = c1, b = c2;
  if (darkNeutral(a) && darkNeutral(b)) return ["#FFFFFF", "#9EC5FF"];
  if (darkNeutral(a)) a = partner(b);
  if (darkNeutral(b)) b = partner(a);
  a = lift(a); b = lift(b);
  if (a === b) b = partner(a);
  return [a, b];
}

/* ───────────────────────────── fields ───────────────────────────── */

/**
 * The halo on an N×N grid, 0–1: a gaussian-ish falloff of the distance to the art (so
 * hairline art glows as much as a solid badge), brighter in concave pockets where light
 * pools (blurred coverage), with the distance domain-warped by smooth low-frequency
 * noise so the aura breathes instead of tracing the outline. Faded by a squircle window
 * (0 by 92% of the canvas). R in grid px.
 */
function haloField(mask, N, R, seed, organic) {
  const dist = outsideDistance(mask, N, N, 0.14);   // low threshold: hairlines survive the small grid
  const cov = blurMask(mask, N, N, R * 0.7);
  let cmax = 1e-6;
  for (let i = 0; i < cov.length; i++) if (cov[i] > cmax) cmax = cov[i];
  const noise = makeNoise2D(seed);
  const out = new Float32Array(N * N);
  const win = squircleWindow(N, 0.74, 0.985);
  const f = 1 / Math.max(8, R * 3);
  const amp = R * 0.75 * organic;
  const inv = 1 / (R * 0.9);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (win[i] <= 0) continue;
      const wx = fbm(noise, x * f, y * f, 2) * amp;
      const wy = fbm(noise, x * f + 31.7, y * f - 12.9, 2) * amp;
      const d = Math.max(0, sampleBilinear(dist, N, N, x + wx, y + wy) - 0.5);

      const t = d * inv;
      const base = Math.exp(-0.5 * t * t) * (0.85 + 0.15 * Math.exp(-t * 3));
      const pool = 0.8 + 0.28 * (cov[i] / cmax);
      // soft lobes of extra light (never holes)
      const lobe = 1 + 0.28 * organic * fbm(noise, x * f * 0.8 - 7.3, y * f * 0.8 + 3.1, 2);
      out[i] = clamp(base * pool * lobe) * win[i];
    }
  }
  return out;
}

/** Bilinear N×N → per-output-pixel lookup tables (pixel centres aligned). */
function axisMap(S, N) {
  const i0 = new Int32Array(S), fr = new Float32Array(S);
  const k = N / S;
  for (let x = 0; x < S; x++) {
    const f = clamp((x + 0.5) * k - 0.5, 0, N - 1.001);
    i0[x] = f | 0; fr[x] = f - (f | 0);
  }
  return { i0, fr };
}

/* ───────────────────────────── layers ───────────────────────────── */

/** aura / pattern: halo → LUT colour with grain dithering, at full S. */
function lightLayer(halo, N, S, lut, k, grain, seed, pattern, scale) {
  const out = createCanvas(S, S);
  const o = ctx2d(out);
  const img = o.createImageData(S, S);
  const d = img.data;
  const { i0, fr } = axisMap(S, N);
  const gCell = Math.max(1, Math.round(1.25 * scale));
  const gAmp = 0.04 + 0.32 * grain;                       // luminance grain
  const period = Math.max(3, 9 * scale);                   // scan-line period (pattern)
  const gritK = 0.25 + 0.6 * grain;
  for (let y = 0; y < S; y++) {
    const y0 = i0[y], wy = fr[y], r0 = y0 * N, r1 = r0 + N;
    const gy = (y / gCell) | 0;
    let line = 1;
    if (pattern) {
      const ph = (y % period) / period;                    // bright line, soft shoulders, dark gap
      line = smoothstep(0.62, 0.08, Math.abs(ph - 0.5) * 2);
    }
    for (let x = 0; x < S; x++) {
      const x0 = i0[x], wx = fr[x];
      const a = halo[r0 + x0], b = halo[r0 + x0 + 1], c = halo[r1 + x0], e = halo[r1 + x0 + 1];
      let v = (a + (b - a) * wx) * (1 - wy) + (c + (e - c) * wx) * wy;
      if (v <= 0.004) continue;
      const nz = hash01((x / gCell) | 0, gy, seed) - 0.5;
      if (v > 1) v = 1;
      // smooth light falloff; grain is a film texture on the light, not holes in it
      let al = Math.min(1, Math.pow(v, 1.15) * k * 1.3) * (1 + nz * grain * 0.25);
      const lum = 1 + nz * gAmp;
      if (pattern) {
        // scan lines + grit: lines carry the light, grit nibbles them
        const grit = hash01(((x / gCell) | 0) + 7, gy * 3 + 1, seed ^ 0x9e3779b9);
        al *= line * (grit < 0.18 * gritK ? 0.15 : 1) * (0.75 + 0.5 * v);
        al = Math.min(1, al * 1.35);
      }
      if (al <= 0.003) continue;
      const li = ((v * 255) | 0) * 3;
      const j = (y * S + x) * 4;
      d[j] = lut[li] * lum; d[j + 1] = lut[li + 1] * lum; d[j + 2] = lut[li + 2] * lum;
      d[j + 3] = al > 1 ? 255 : al * 255;
    }
  }
  o.putImageData(img, 0, 0);
  return out;
}

/** halftone: round dots on a 45° screen, area ∝ light, colour from the LUT. */
function halftoneLayer(halo, N, S, lut, k, scale, grain, seed) {
  const out = createCanvas(S, S);
  const o = ctx2d(out);
  const cell = Math.max(3.2, 17 * scale);
  const ca = Math.cos(Math.PI / 4), sa = Math.sin(Math.PI / 4);
  const reach = Math.ceil((S * 1.5) / cell);
  const kN = N / S;
  const cols = new Map();
  for (let gy = -reach; gy <= reach; gy++) {
    for (let gx = -reach; gx <= reach; gx++) {
      const u = gx * cell, w = gy * cell;
      const x = S / 2 + u * ca - w * sa, y = S / 2 + u * sa + w * ca;
      if (x < -cell || y < -cell || x > S + cell || y > S + cell) continue;
      let v = sampleBilinear(halo, N, N, x * kN - 0.5, y * kN - 0.5);
      if (v < 0.03) continue;
      v = clamp(v + (hash01(gx, gy, seed) - 0.5) * 0.12 * grain);
      const tone = Math.min(1, smoothstep(0.02, 0.9, v) * (0.35 + 0.75 * k));
      const r = cell * 0.5 * Math.sqrt(tone) * 1.12;
      if (r < 0.35) continue;
      const li = ((v * 255) | 0) * 3;
      const key = (lut[li] << 16) | (lut[li + 1] << 8) | lut[li + 2];
      // batch dots of (nearly) the same colour into one path
      const q = key & 0xf0f0f0;
      let p = cols.get(q);
      if (!p) { p = { path: new Path2D(), rgb: [lut[li], lut[li + 1], lut[li + 2]] }; cols.set(q, p); }
      p.path.moveTo(x + r, y);
      p.path.arc(x, y, r, 0, TAU);
    }
  }
  for (const { path, rgb } of cols.values()) {
    o.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    o.fill(path);
  }
  return out;
}

/** bloom: the logo's colours lifted toward the glow colour, on a small grid. */
function bloomSource(src, N, c1, lift) {
  const small = resizeCanvas(src, N, N);
  const x = ctx2d(small);
  const img = x.getImageData(0, 0, N, N);
  const d = img.data;
  const [tr, tg, tb] = hexToRgb(c1);
  for (let j = 0; j < d.length; j += 4) {
    if (d[j + 3] === 0) continue;
    // toward the glow colour, then screened up so dark inks still emit light
    let r = d[j] + (tr - d[j]) * 0.55, g = d[j + 1] + (tg - d[j + 1]) * 0.55, b = d[j + 2] + (tb - d[j + 2]) * 0.55;
    r = 255 - (255 - r) * lift; g = 255 - (255 - g) * lift; b = 255 - (255 - b) * lift;
    d[j] = r; d[j + 1] = g; d[j + 2] = b;
  }
  x.putImageData(img, 0, 0);
  return small;
}

/** Fade a canvas (N×N) to zero outside the squircle window (destination-in). */
function windowed(c, N) {
  const win = squircleWindow(N, 0.74, 0.985);
  const x = ctx2d(c);
  const img = x.getImageData(0, 0, N, N);
  const d = img.data;
  for (let i = 0, j = 3; i < win.length; i++, j += 4) d[j] *= win[i];
  x.putImageData(img, 0, 0);
  return c;
}

let memo = null;   // { key, halo } — last halo field (one entry: the logo being tuned)

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "aura",
  name: "Glow",
  category: "metal",
  blurb: "A dreamy aura of team-coloured light around the logo.",
  method: "Sublimation",
  stage: "dark",
  params: [
    {
      key: "mode", label: "Glow", type: "select", default: "aura",
      options: [
        { value: "aura", label: "Aura" },
        { value: "bloom", label: "Soft bloom" },
        { value: "pattern", label: "Glow FX lines" },
        { value: "halftone", label: "Halftone glow" },
      ],
    },
    { key: "radius", label: "Radius", type: "range", min: 10, max: 160, step: 1, default: 60, unit: "px" },
    { key: "strength", label: "Strength", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    { key: "color", label: "Inner light", type: "color", default: "secondary" },
    { key: "color2", label: "Outer light", type: "color", default: "primary" },
    { key: "grain", label: "Grain", type: "range", min: 0, max: 100, step: 1, default: 30, unit: "%" },
  ],
  presets: [
    { name: "Aura", params: { mode: "aura", radius: 110, strength: 60, color: "secondary", color2: "primary", grain: 40 } },
    { name: "Soft glow", params: { mode: "bloom", radius: 60, strength: 60, color: "secondary", color2: "primary", grain: 15 } },
    { name: "Glow FX", params: { mode: "pattern", radius: 70, strength: 70, color: "secondary", color2: "primary", grain: 45 } },
    { name: "Halftone glow", params: { mode: "halftone", radius: 80, strength: 60, color: "secondary", color2: "primary", grain: 20 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const k = p.strength / 100, grain = p.grain / 100;
    const [c1, c2] = glowPair(p.color, p.color2);
    const N = Math.max(96, Math.min(320, Math.round(S / 3.2)));
    const u = N / 1024;                                  // 1024-units → grid px
    const R = Math.max(1.2, p.radius * u);
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";

    const mask = alphaAt(src, N);
    if (maskBounds(mask, N, N, 0.1).empty) return out;

    if (p.mode === "bloom") {
      // two soft copies of the lifted logo (σ = R/4 and R) screened around and over the art
      const lit = bloomSource(src, N, c1, 0.7);
      const wide = windowed(blurCanvas(lit, R), N);
      const tight = windowed(blurCanvas(lit, R * 0.25), N);
      const halo2 = windowed(blurCanvas(bloomSource(src, N, c2, 0.62), R * 1.6), N);
      o.save();
      o.globalCompositeOperation = "screen";
      o.globalAlpha = Math.min(1, 0.55 * k + 0.1);
      o.drawImage(halo2, 0, 0, S, S);
      o.globalAlpha = Math.min(1, 0.9 * k + 0.15);
      o.drawImage(wide, 0, 0, S, S);
      o.globalAlpha = Math.min(1, 1.1 * k);
      o.drawImage(tight, 0, 0, S, S);
      o.restore();
      drawLogo(o, src, sc);
      // diffusion over the art: highlights lifted, edges melt into the glow
      o.save();
      o.globalCompositeOperation = "screen";
      o.globalAlpha = 0.18 + 0.32 * k;
      o.drawImage(tight, 0, 0, S, S);
      o.restore();
      if (grain > 0) grainOver(o, S, sc, grain * 0.5, hashSeed("aura-grain", ctx.seed));
      return out;
    }

    const key = `${N}|${p.radius}|${ctx.seed}|${p.mode === "aura" ? 1 : 0.6}|${maskHash(mask)}`;
    if (!memo || memo.key !== key) memo = { key, halo: haloField(mask, N, R, (ctx.seed >>> 0) + 4111, p.mode === "aura" ? 1 : 0.6) };
    const halo = memo.halo;
    // white-hot at the art → colour → colour 2 → (alpha) transparent
    const lut = gradientLUT([
      { at: 0, color: mix(c2, "#000000", 0.1) },
      { at: 0.25, color: c2 },
      { at: 0.48, color: mix(c2, c1, 0.5) },
      { at: 0.72, color: c1 },
      { at: 0.92, color: mix(c1, "#FFFFFF", 0.3) },
      { at: 1, color: mix(c1, "#FFFFFF", 0.55) },
    ]);
    const seed = hashSeed("aura", ctx.seed) | 0;
    let layer;
    if (p.mode === "halftone") layer = halftoneLayer(halo, N, S, lut, k, sc, grain, seed);
    else layer = lightLayer(halo, N, S, lut, 0.3 + 1.1 * k, grain, seed, p.mode === "pattern", sc);
    o.drawImage(layer, 0, 0);
    drawLogo(o, src, sc);
    if (p.mode === "aura") {
      // the aura's light wraps a little onto the art's edges
      const wrap = blurCanvas(src, Math.max(0.8, 6 * sc));
      const wx = ctx2d(wrap);
      wx.globalCompositeOperation = "source-in";
      wx.fillStyle = c1;
      wx.fillRect(0, 0, S, S);
      const rim = createCanvas(S, S);
      const rx = ctx2d(rim);
      rx.drawImage(src, 0, 0);
      rx.globalCompositeOperation = "source-in";
      rx.globalAlpha = 0.3 * k;
      rx.drawImage(wrap, 0, 0);
      o.save();
      o.globalCompositeOperation = "screen";
      o.drawImage(rim, 0, 0);
      o.restore();
    }
    return out;
  },
};

/** The logo, crisp, over a faint 1-unit blur of itself (edge diffusion). */
function drawLogo(o, src, sc) {
  const r = 1.4 * sc;
  if (r > 0.3) {
    o.save();
    o.globalAlpha = 0.5;
    o.drawImage(blurCanvas(src, r), 0, 0);
    o.restore();
  }
  o.drawImage(src, 0, 0);
}

/** Monochrome film grain over what is already drawn (source-atop, soft-light-ish). */
function grainOver(o, S, sc, k, seed) {
  const N = Math.max(64, Math.round(S / Math.max(1, Math.round(1.3 * sc))));
  const g = createCanvas(N, N);
  const x = ctx2d(g);
  const img = x.createImageData(N, N);
  const d = img.data;
  for (let i = 0, j = 0; i < N * N; i++, j += 4) {
    const v = hash01(i % N, (i / N) | 0, seed);
    const c = v > 0.5 ? 255 : 0;
    d[j] = d[j + 1] = d[j + 2] = c;
    d[j + 3] = Math.abs(v - 0.5) * 2 * 255 * k * 0.22;
  }
  x.putImageData(img, 0, 0);
  o.save();
  o.globalCompositeOperation = "source-atop";
  o.imageSmoothingEnabled = false;
  o.drawImage(g, 0, 0, S, S);
  o.restore();
}

/** Cheap content key of a small mask. */
function maskHash(m) {
  let h = 0x811c9dc5;
  for (let i = 0; i < m.length; i += 3) h = Math.imul(h ^ ((m[i] * 255) | 0), 0x01000193);
  return (h >>> 0).toString(36);
}

