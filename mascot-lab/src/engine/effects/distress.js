// "Distressed" — a beaten-up print in the spirit of Studio 2am's Distress (and the worn /
// grunge print packs): grain, halftone breakdown and edge distortion at light, medium or
// heavy damage. Scuffed and broken rather than cracked (that is Vintage Print):
//
//   edge distortion (the ink edge pushed around by an fbm vector field, then re-cut hard) →
//   erosion: worn-off patches (noise threshold calibrated to 5 / 15 / 30 % of the ink,
//   biased toward the edges), scuff scratches (random-walk strokes clustered at 2–3
//   angles) and speckle holes → halftone breakdown: in a second noise region the solid
//   ink turns into a 45° dot screen whose dots shrink as the ink fades → ±8 % grain.
//
// "Logo colors" keeps the logo's inks; "One ink" separates it into one ink (dark → solid,
// mid tones → dots, light → knocked out; a white logo prints its silhouette).
// Per-pixel work at W = min(S, 1024) on unit-anchored noise. Transparent, deterministic.
import {
  createCanvas, ctx2d, clamp, smoothstep, hexToRgb, insideDistance, rng, hashSeed, sampleBilinear,
  blurMask,
} from "../core.js";
import {
  readLogo, noiseMap, grainMap, bounds, quantileOf, toSize, workSize, paintMask, hash01,
} from "../fx/press.js";

const TAU = Math.PI * 2;
// per damage level: worn coverage, scratch / halftone / roughness / speckle multipliers
const DAMAGE = {
  light: { wear: 0.05, scratch: 0.5, half: 0.6, rough: 0.65, speck: 0.45 },
  medium: { wear: 0.15, scratch: 1, half: 1, rough: 1, speck: 1 },
  heavy: { wear: 0.3, scratch: 1.6, half: 1.4, rough: 1.4, speck: 1.8 },
};
const CELL = 14;        // halftone cell, units (≈5 px dots in a 384 gallery tile)

export default {
  id: "distress",
  name: "Distressed",
  category: "texture",
  blurb: "Scuffed, scratched and broken down to halftone dots.",
  method: "Screen print",
  stage: "mid",
  params: [
    {
      key: "damage", label: "Damage", type: "select", default: "medium",
      options: [
        { value: "light", label: "Light" },
        { value: "medium", label: "Medium" },
        { value: "heavy", label: "Heavy" },
      ],
    },
    { key: "scratches", label: "Scratches", type: "range", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    { key: "halftone", label: "Halftone", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    { key: "roughness", label: "Rough edges", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    {
      key: "ink", label: "Ink", type: "select", default: "logo",
      options: [
        { value: "logo", label: "Logo colors" },
        { value: "mono", label: "One ink" },
      ],
    },
    { key: "color", label: "Ink color", type: "color", default: "dark" },
  ],
  presets: [
    { name: "Medium", params: { damage: "medium", scratches: 50, halftone: 40, roughness: 45, ink: "logo" } },
    { name: "Heavy", params: { damage: "heavy", scratches: 60, halftone: 55, roughness: 55, ink: "logo" } },
    { name: "Light", params: { damage: "light", scratches: 40, halftone: 30, roughness: 35, ink: "logo" } },
    { name: "Mono grunge", params: { damage: "heavy", scratches: 70, halftone: 35, roughness: 50, ink: "mono", color: "primary" } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = workSize(S);
    const u = ctx.scale * (W / S);
    const n = W * W;
    const seed = ctx.seed >>> 0;
    const dm = DAMAGE[p.damage] || DAMAGE.medium;
    const mono = p.ink === "mono";

    const logo = readLogo(src, W);
    const out = createCanvas(W, W);
    const bb = bounds(logo.alpha, W, 0.1);
    if (bb.empty) return toSize(out, S);

    /* ── (a) edge distortion: sample the logo through an fbm displacement field ── */
    const amp = (p.roughness / 100) * 6 * dm.rough * u + 0.6 * u;
    const dx1 = noiseMap(W, u, 22, hashSeed("distress-dx", seed), { octaves: 3 });
    const dy1 = noiseMap(W, u, 22, hashSeed("distress-dy", seed), { octaves: 3 });
    // fine edge chatter: cheap value noise is plenty at this scale
    const dx2 = grainMap(W, u, 3.5, hashSeed("distress-dx2", seed));
    const dy2 = grainMap(W, u, 3.5, hashSeed("distress-dy2", seed));
    const { alpha: A0, data: D0 } = logo;
    // per-channel float maps for bilinear sampling
    const R0 = new Float32Array(n), G0 = new Float32Array(n), B0 = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) { R0[i] = D0[j]; G0[i] = D0[j + 1]; B0[i] = D0[j + 2]; }
    const alpha = new Float32Array(n), R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    const pad = Math.ceil(amp * 1.6) + 2;
    const x0 = Math.max(0, bb.x0 - pad), x1 = Math.min(W, bb.x1 + pad);
    const y0 = Math.max(0, bb.y0 - pad), y1 = Math.min(W, bb.y1 + pad);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const sx = x + (dx1[i] + 0.6 * (dx2[i] - 0.5)) * amp, sy = y + (dy1[i] + 0.6 * (dy2[i] - 0.5)) * amp;
        const a = sampleBilinear(A0, W, W, sx, sy);
        if (a <= 0.02) continue;
        // re-cut the edge hard (a printed edge, not a blur)
        alpha[i] = smoothstep(0.32, 0.68, a);
        const xi = Math.min(W - 1, Math.max(0, Math.round(sx))), yi = Math.min(W - 1, Math.max(0, Math.round(sy)));
        const k = yi * W + xi;
        // colour from the nearest opaque sample (no dark fringes from transparent black)
        if (A0[k] > 0.5) { R[i] = R0[k]; G[i] = G0[k]; B[i] = B0[k]; }
        else { R[i] = sampleBilinear(R0, W, W, sx, sy) / Math.max(a, 0.05); G[i] = sampleBilinear(G0, W, W, sx, sy) / Math.max(a, 0.05); B[i] = sampleBilinear(B0, W, W, sx, sy) / Math.max(a, 0.05); }
      }
    }

    /* ── one-ink separation (mono): dark → solid, mid → screened, light → knocked out ── */
    let tone = null;
    if (mono) {
      tone = new Float32Array(n);
      let inked = 0, opaque = 0;
      for (let i = 0; i < n; i++) {
        if (alpha[i] <= 0) continue;
        const L = (0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]) / 255;
        const ch = (Math.max(R[i], G[i], B[i]) - Math.min(R[i], G[i], B[i])) / 255;
        tone[i] = clamp((1 - L - 0.12) / 0.5 + 0.6 * ch);   // dark or saturated → ink
        inked += tone[i] * alpha[i]; opaque += alpha[i];
      }
      if (inked < opaque * 0.12) tone.fill(1);  // a white / pale logo: print its shape
    }

    /* ── (b) erosion: worn patches + scratches + speckle, heavier near the edges ── */
    const inside = insideDistance(alpha, W, W, 0.5);
    const edgeU = 8 * u;
    const P1 = noiseMap(W, u, 120, hashSeed("distress-wear", seed), { octaves: 4, gain: 0.55 });
    const P2 = noiseMap(W, u, 14, hashSeed("distress-wear2", seed), { octaves: 2 });
    // wear concentrates: one or two areas of the print took most of the beating
    const P0 = noiseMap(W, u, 320, hashSeed("distress-wear0", seed), { octaves: 2 });
    const grain = grainMap(W, u, 1.4, hashSeed("distress-grain", seed));
    // stroke thickness nearby (mean inside distance of the surrounding ink): a hairline
    // or thin line-art stroke is protected, or the edge bias would erase it
    const bIn = blurMask(inside, W, W, 6 * u), bA = blurMask(alpha, W, W, 6 * u);
    const keepThin = new Float32Array(n);
    const wearF = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (alpha[i] <= 0) continue;
      const thick = bIn[i] / Math.max(0.05, bA[i]);
      const pk = smoothstep(1.4 * u, 4.5 * u, thick);
      keepThin[i] = pk;
      const edge = (1 - smoothstep(0, edgeU, inside[i])) * pk;
      wearF[i] = P1[i] + 0.3 * P2[i] + 0.55 * P0[i] + 0.4 * edge - 0.7 * (1 - pk);
    }
    const wth = quantileOf(wearF, alpha, 1 - dm.wear, 3);

    // scuff scratches: random-walk strokes clustered around 2–3 dominant directions
    const r = rng(hashSeed("distress-scratch", seed));
    const nScr = Math.round((30 + 150 * (p.scratches / 100)) * dm.scratch * (p.scratches > 0 ? 1 : 0));
    const angles = [r() * Math.PI, 0, 0].map((a, k) => (k ? a : a));
    angles[1] = angles[0] + 0.5 + r() * 0.7;
    angles[2] = angles[0] - 0.4 - r() * 0.9;
    const nAng = 2 + (r() < 0.5 ? 1 : 0);
    const clusters = [];
    for (let k = 0; k < 4; k++) clusters.push([bb.x0 + bb.w * (0.15 + 0.7 * r()), bb.y0 + bb.h * (0.15 + 0.7 * r())]);
    const scratch = nScr > 0 ? paintMask(W, (c) => {
      c.strokeStyle = "#000";
      c.lineCap = "round";
      c.lineJoin = "round";
      for (let k = 0; k < nScr; k++) {
        const cl = clusters[k % clusters.length];
        const spread = (r() < 0.35 ? 0.5 : 0.22) * Math.max(bb.w, bb.h);
        let x = cl[0] + (r() + r() - 1) * spread, y = cl[1] + (r() + r() - 1) * spread;
        let a = angles[Math.floor(r() * nAng)] + (r() - 0.5) * 0.25;
        const len = (20 + Math.pow(r(), 1.4) * 150) * u;
        const step = 5 * u;
        c.lineWidth = Math.max(0.8, (1.1 + Math.pow(r(), 2) * 2.4) * u);
        c.globalAlpha = 0.65 + 0.35 * r();
        c.beginPath();
        c.moveTo(x, y);
        for (let t = 0; t < len; t += step) {
          a += (r() - 0.5) * 0.09;
          x += Math.cos(a) * step; y += Math.sin(a) * step;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      // speckle holes: chips and pinholes, more of them near the edges (placed below)
      c.globalAlpha = 1;
    }) : null;

    // speckle holes: tiny chips, denser near the edges
    const nSpk = Math.round((bb.w * bb.h) / (u * u) / 900 * dm.speck);
    const speck = paintMask(W, (c) => {
      c.fillStyle = "#000";
      c.beginPath();
      for (let k = 0; k < nSpk; k++) {
        const x = bb.x0 + r() * bb.w, y = bb.y0 + r() * bb.h;
        const i = (y | 0) * W + (x | 0);
        if (alpha[i] < 0.5) continue;
        const nearEdge = inside[i] < edgeU * 1.5;
        if (!nearEdge && r() < 0.55) continue;
        const rad = (0.5 + Math.pow(r(), 2.5) * 3.2) * u;
        c.moveTo(x + rad, y);
        c.ellipse(x, y, rad, rad * (0.5 + 0.5 * r()), r() * Math.PI, 0, TAU);
      }
      c.fill();
    });

    /* ── (c) halftone breakdown region ── */
    const half = clamp((p.halftone / 100) * dm.half, 0, 1);
    const H = noiseMap(W, u, 85, hashSeed("distress-half", seed), { octaves: 3 });
    const hth = half > 0 ? quantileOf(H, alpha, 1 - 0.7 * half, 3) : Infinity;
    const cellPx = CELL * u;
    const kAA = cellPx / 2.3;
    const c45 = Math.SQRT1_2;

    /* ── composite ── */
    const img = ctx2d(out).createImageData(W, W);
    const od = img.data;
    const ink = hexToRgb(p.color);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        let a = alpha[i];
        if (a <= 0.004) continue;
        // worn patches (ragged, speckled fringe)
        // dry-brush fringe: the rim of a worn patch breaks up into grain before it clears
        const wv = wearF[i] + (grain[i] - 0.5) * 0.22;
        a *= 1 - smoothstep(wth - 0.02, wth + 0.02, wv);
        const thin = 0.35 + 0.65 * keepThin[i];
        if (scratch) a *= 1 - scratch[i] * thin;
        a *= 1 - speck[i] * thin;
        if (a <= 0.004) continue;
        // ink coverage to screen: halftone region (and mono mid tones)
        let cov = 1;
        if (H[i] > hth - 0.12) cov = 1 - 0.88 * smoothstep(hth - 0.12, hth + 0.3, H[i]);
        if (tone) {
          // one ink: pale shading knocks out clean, real mid tones screen, darks print solid
          const tv = tone[i];
          cov *= tv < 0.22 ? 0 : tv < 0.55 ? 0.12 + 0.68 * ((tv - 0.22) / 0.33) : 1;
        }
        if (cov < 0.999) {
          const xr = (x + y) * c45 / cellPx, yr = (y - x) * c45 / cellPx;
          const f = 0.5 + 0.25 * (Math.cos(TAU * xr) + Math.cos(TAU * yr));
          a *= clamp((f - (1 - cov)) * kAA + 0.5);
          if (a <= 0.004) continue;
        }
        // grain ±8 % luminance
        const g = 1 + 0.16 * (hash01(x, y, seed) - 0.5) + 0.08 * (grain[i] - 0.5);
        const j = i * 4;
        if (mono) { od[j] = ink[0] * g; od[j + 1] = ink[1] * g; od[j + 2] = ink[2] * g; }
        else { od[j] = R[i] * g; od[j + 1] = G[i] * g; od[j + 2] = B[i] * g; }
        od[j + 3] = a * 255 + 0.5;
      }
    }
    ctx2d(out).putImageData(img, 0, 0);
    return toSize(out, S);
  },
};
