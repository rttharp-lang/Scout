// Mascot Lab — shared helpers for the "Chrome & light" effects (chrome, hype, aura, prism,
// fire, filmburn). NOT an effect module: it lives outside effects/ so the registry and the
// render worker never try to load it as one.
//
//   • chrome relief: palette regions + silhouette distance → height → detail normals and
//     the calm "reflection" normals (analyseRelief), plus the 1-D environment LUT with a
//     hard anti-aliased horizon (envLUT) — the reflection math of Chrome, reused by Hype;
//   • light helpers: luminous colour lifting, team colour pairs, spectra, smooth edge
//     windows (glows fade out before the canvas edge), low-res field → canvas, hashing.
//
// Everything is OffscreenCanvas-safe (core.createCanvas / ctx2d only, no DOM, no text).
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, clamp, hexToRgb, rgbToHsl, hslToRgb,
  nearestColorIndex, insideDistance, dilateMask, maskToCanvas, maskBounds, normalsFromHeight,
  lerp, smoothstep, gradientLUT,
} from "../core.js";
import { extractPalette } from "../image.js";

/* ───────────────────────────── environment LUT ───────────────────────────── */

// v = elevation of what the surface reflects: +1.2 zenith … 0 horizon … −1.2 deep ground.
export const V_MIN = -1.25, V_MAX = 1.25, LUT_N = 2048;

/**
 * Environment LUT (LUT_N × RGB floats 0–255) over v ∈ [V_MIN, V_MAX]. `env` =
 * { ground: [[v, hex]…], sky: [[v, hex]…] } (the jump between the last ground stop and
 * the first sky stop is the horizon). `aa` = horizon ramp width in v units (≈ 1.5 output
 * px), `contrast` 0–1 pushes tones away from mid grey, `tint` = [h, s] team hue colorized
 * in at `tintAmt` (anodized / candy metal), only above v = 0.1 when `skyOnly`.
 */
export function envLUT(env, aa, contrast, tint, tintAmt, skyOnly) {
  const stops = [...env.ground, ...env.sky].map(([v, c]) => [v, hexToRgb(c)]);
  const lut = new Float32Array(LUT_N * 3);
  const span = V_MAX - V_MIN;
  const g = 0.85 + 0.5 * contrast;  // tone spread around mid grey
  for (let i = 0; i < LUT_N; i++) {
    const v = V_MIN + (span * i) / (LUT_N - 1);
    // horizon ramp: widen the 0.004 gap to the AA width
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1][0] <= v) k++;
    let [va, A] = stops[k], [vb, B] = stops[k + 1];
    if (va < 0 && vb > 0) { va = -aa * 0.5; vb = aa * 0.5; }
    const t = clamp((v - va) / (vb - va || 1));
    let r = lerp(A[0], B[0], t), gg = lerp(A[1], B[1], t), b = lerp(A[2], B[2], t);
    if (tint && tintAmt > 0 && (!skyOnly || v > 0.1)) {
      const l = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
      // colorize: team hue at the metal's lightness; whites stay white-hot
      const c = hslToRgb(tint[0], Math.min(1, tint[1] * 1.05 + 0.15), clamp(l * 0.96));
      const ta = skyOnly ? tintAmt * clamp((v - 0.1) / 0.3) : tintAmt;
      r = lerp(r, c[0], ta); gg = lerp(gg, c[1], ta); b = lerp(b, c[2], ta);
    }
    // contrast around mid grey (keeps hue)
    const l = (0.299 * r + 0.587 * gg + 0.114 * b);
    const nl = clamp(128 + (l - 128) * g, 0, 255);
    const f = l > 0.5 ? nl / l : 1;
    lut[i * 3] = clamp(r * f, 0, 255); lut[i * 3 + 1] = clamp(gg * f, 0, 255); lut[i * 3 + 2] = clamp(b * f, 0, 255);
  }
  return lut;
}

/** The team hue to tint with: primary, or secondary when primary is a neutral (black/white/grey). */
export function teamTint(palette) {
  for (const hex of [palette?.primary, palette?.secondary]) {
    if (!hex) continue;
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    if (s > 0.18 && l > 0.08 && l < 0.92) return [h, s];
  }
  return null;
}

/* ───────────────────────────── relief analysis ───────────────────────────── */

/**
 * Palette label per pixel (−1 = transparent) with 1-px anti-aliasing slivers folded into
 * the neighbouring region (a grey AA pixel between black and white must not become its
 * own "navy" region with its own bevel).
 */
export function labelMap(data, D, palRGB) {
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
  // majority clean-up of thin slivers (2 passes)
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

/** Distance (px) of every opaque pixel to the edge of its own color region. */
export function regionDistance(label, D) {
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

/**
 * Colour-independent chrome relief at D (the source resized to D×D, `data0` its pixels):
 * palette regions, distance fields → height → detail normals + the calm reflection
 * normals, and a thin outline mask. `bevelP` in 1024-units, `sc` = 1024-units → D px,
 * `smooth` 0–1. Line art is inflated to a minimum stroke (then `alphaS` is the S×S alpha
 * of the inflated shape). → { b, alphaS, nx, ny, nz, nvy, nvz, spanD, ol } or null (empty).
 */
export function analyseRelief(srcD, data0, S, D, sc, bevelP, smooth) {
  const n = D * D;
  const dataD = data0;
  const small = resizeCanvas(srcD, Math.min(D, 192), Math.min(D, 192));
  const pal = extractPalette(small, 7, { maxSamples: 6000 }).filter((c) => c.weight > 0.006);
  const palRGB = (pal.length ? pal : [{ hex: "#808080" }]).map((c) => hexToRgb(c.hex));
  const label = labelMap(dataD, D, palRGB);
  const alpha = new Float32Array(n);
  const lum = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    alpha[i] = dataD[j + 3] / 255;
    lum[i] = (0.299 * dataD[j] + 0.587 * dataD[j + 1] + 0.114 * dataD[j + 2]) / 255;
  }
  const b = maskBounds(alpha, D, D, 0.5);
  if (b.empty) return null;

  const bevel = Math.max(1.5, bevelP * sc);
  const inner = Math.max(1.2, bevel * 0.42);
  let dOut = insideDistance(alpha, D, D, 0.5);
  // line art (nothing thicker than a hairline) is inflated to a minimum stroke so the
  // metal has a body to reflect in; its alpha then comes from the inflated mask
  let opaque = 0, thick = 0;
  for (let i = 0; i < n; i++) if (alpha[i] >= 0.5) { opaque++; if (dOut[i] > 4 * sc) thick++; }
  const lineArt = opaque > 0 && thick < opaque * 0.12;
  let alphaS = null;
  if (lineArt) {
    const grown = dilateMask(alpha, D, D, Math.max(1, 3.4 * sc));
    alpha.set(grown);
    for (let i = 0; i < n; i++) { lum[i] = 1; label[i] = alpha[i] >= 0.5 ? 0 : -1; }
    dOut = insideDistance(alpha, D, D, 0.5);
    alphaS = upsampleAlpha(alpha, D, S);
  }
  const dReg = regionDistance(label, D);
  const lumS = blurMask(lum, D, D, Math.max(0.6, 1.2 * sc));
  const ampR = 0.4 - 0.16 * smooth;          // interior relief, softer when smoother
  let H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (dOut[i] <= 0) continue;
    const ho = circ((dOut[i] - 0.5) / bevel);
    const hr = circ(dReg[i] / inner);
    H[i] = ho * (0.36 + ampR * hr + 0.3 * lumS[i]);
  }
  H = blurMask(H, D, D, Math.max(0.7, bevel * (0.03 + 0.14 * smooth)));
  for (let i = 0; i < n; i++) H[i] *= alpha[i] > 0 ? 1 : 0;
  const { nx, ny, nz } = normalsFromHeight(H, D, D, bevel * 1.25);
  // what the metal REFLECTS follows a calmer surface: the detail height blurred (small
  // features only ripple the horizon instead of shattering it) plus a broad dome over
  // the whole body, so big flat faces sweep through the sky gradient like poured metal
  const spanD = Math.max(8, Math.max(b.x1 - b.x0, b.y1 - b.y0));
  const domeR = Math.max(bevel * 2.5, spanD * 0.16);
  const HV = blurMask(H, D, D, Math.max(0.8, bevel * 0.32));
  for (let i = 0; i < n; i++) if (dOut[i] > 0) HV[i] += 0.45 * circ((dOut[i] - 0.5) / domeR) * (bevel / domeR) * 2.2;
  const nv = normalsFromHeight(HV, D, D, bevel * 1.25);
  const nvy = nv.ny, nvz = nv.nz;

  const ol = dilateMask(alpha, D, D, Math.max(0.8, 3.5 * sc));
  return { b, alphaS, nx, ny, nz, nvy, nvz, spanD, ol, alpha };
}

/** FNV-1a over the RGBA words: a cheap content key for analysis memos. */
export function pixelHash(data) {
  const u = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
  return (h >>> 0).toString(36) + ":" + u.length;
}

/** D×D float mask → S×S Uint8 alpha (smooth upscale). */
export function upsampleAlpha(mask, D, S) {
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

/** Up to `count` 4-point star flares on the strongest, well separated specular peaks. */
export function drawGlints(o, val, pos, S, span, rgb, count = 3, sizeK = 1) {
  const order = Array.from(val.keys()).filter((c) => val[c] > 0.75).sort((a, b) => val[b] - val[a] || a - b);
  const picks = [];
  for (const c of order) {
    const x = (pos[c] % S) + 0.5, y = Math.floor(pos[c] / S) + 0.5;
    if (picks.every((q) => Math.hypot(q[0] - x, q[1] - y) > span * 0.3)) picks.push([x, y]);
    if (picks.length >= count) break;
  }
  const col = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;
  o.save();
  picks.forEach(([x, y], k) => {
    const R = span * (k === 0 ? 0.075 : 0.05) * sizeK;
    const glow = o.createRadialGradient(x, y, 0, x, y, R * 0.45);
    glow.addColorStop(0, `rgba(${col},0.95)`);
    glow.addColorStop(0.25, `rgba(${col},0.45)`);
    glow.addColorStop(1, `rgba(${col},0)`);
    o.fillStyle = glow;
    o.beginPath(); o.arc(x, y, R * 0.45, 0, Math.PI * 2); o.fill();
    o.fillStyle = `rgba(${col},0.95)`;
    for (const [dx, dy, len] of [[1, 0, 1], [0, 1, 0.8]]) {
      const w = R * 0.045;
      o.beginPath();
      o.moveTo(x - dx * R * len, y - dy * R * len);
      o.quadraticCurveTo(x + dy * w, y + dx * w, x + dx * R * len, y + dy * R * len);
      o.quadraticCurveTo(x - dy * w, y - dx * w, x - dx * R * len, y - dy * R * len);
      o.fill();
    }
  });
  o.restore();
}

export function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/* ───────────────────────────── light helpers ───────────────────────────── */

/** Integer hash → [0, 1): stable per-pixel / per-cell noise. */
export function hash01(x, y, s = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (s | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** True for a colour with no usable hue: near-black / near-white / grey. */
export function isNeutral(hex) {
  const [, s, l] = rgbToHsl(hexToRgb(hex));
  return s < 0.16 || l < 0.06 || l > 0.95;
}

/**
 * luminous(hex, { minL, sat }) → [r, g, b] the colour as LIGHT: hue kept, saturation pushed
 * up, lightness raised to at least minL (navy → electric blue, maroon → hot red). Neutral
 * darks become a cool white, neutral lights stay white.
 */
export function luminous(hex, { minL = 0.56, maxL = 0.72, sat = 0.95 } = {}) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (s < 0.14) return l < 0.5 ? [232, 240, 255] : [255, 255, 255];
  // blues/violets need more lightness to read as light; yellows less to stay saturated
  const lift = h >= 200 && h <= 290 ? 0.06 : h >= 40 && h <= 75 ? -0.04 : 0;
  return hslToRgb(h, Math.max(s, sat), clamp(Math.max(l, minL + lift), 0, maxL + lift));
}

/** luminousHex — luminous() as "#RRGGBB". */
export function luminousHex(hex, opts) {
  const [r, g, b] = luminous(hex, opts);
  const t = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return ("#" + t(r) + t(g) + t(b)).toUpperCase();
}

/**
 * teamLights(palette) → [hexA, hexB]: two glowing team colours with distinct hues, the
 * brighter first. Saturated roles are preferred (primary, secondary, accent); a team with
 * only one hue gets an analogous partner (+38°) so a gradient still has two ends.
 */
export function teamLights(palette) {
  const roles = ["primary", "secondary", "accent", "light", "dark"].map((k) => palette?.[k]).filter(Boolean);
  const sat = [];
  for (const hex of roles) {
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    if (s < 0.2 || l < 0.05 || l > 0.93) continue;
    if (sat.some((q) => Math.min(Math.abs(q.h - h), 360 - Math.abs(q.h - h)) < 22)) continue;
    sat.push({ hex, h, s, l });
  }
  let a, b;
  if (sat.length >= 2) { a = luminousHex(sat[0].hex); b = luminousHex(sat[1].hex); }
  else if (sat.length === 1) {
    const { h, s } = sat[0];
    a = luminousHex(sat[0].hex);
    const [r, g, bb] = hslToRgb((h + 38) % 360, Math.max(0.85, s), 0.6);
    b = luminousHex("#" + [r, g, bb].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""));
  } else { a = "#E8F0FF"; b = "#8FA6C8"; }
  const L = (hx) => { const [r, g, bb] = hexToRgb(hx); return 0.299 * r + 0.587 * g + 0.114 * bb; };
  return L(a) >= L(b) ? [a, b] : [b, a];
}

/** Visible-spectrum stops (red → violet), optionally warm- or cool-shifted. */
export const SPECTRA = {
  rainbow: ["#FF2A2A", "#FF8A1F", "#FFE43B", "#4BFF6B", "#29D9FF", "#3B5BFF", "#A63BFF"],
  warm: ["#FF1F3D", "#FF5A1F", "#FF9A1F", "#FFD23B", "#FFF1A6", "#FF8FB0", "#E040A0"],
  cool: ["#7B3BFF", "#3B5BFF", "#29B6FF", "#29F0E0", "#7BFFB0", "#E8FFF4", "#C69BFF"],
};

/** spectrumLUT(hexes) → Uint8Array(256×3) (gradientLUT over evenly spaced stops). */
export function spectrumLUT(hexes) {
  return gradientLUT(hexes.map((c, i) => ({ at: i / (hexes.length - 1), color: c })));
}

/**
 * edgeWindow(S, inset, soft) → Float32Array(S) 1-D window: 0 within `inset` px of either
 * end, rising smoothly to 1 over `soft` px. A glow multiplied by win[x]·win[y] is
 * guaranteed to be gone before the canvas edge.
 */
export function edgeWindow(S, inset, soft) {
  const w = new Float32Array(S);
  for (let i = 0; i < S; i++) {
    const d = Math.min(i + 0.5, S - i - 0.5);
    w[i] = smoothstep(inset, inset + soft, d);
  }
  return w;
}

/**
 * radialWindow(W, H, cx, cy, r0, r1) → Float32Array: 1 inside radius r0 (px), 0 beyond r1,
 * squircle-shaped (|dx|⁴ + |dy|⁴) so it fills a square canvas without hard corners.
 */
export function squircleWindow(N, r0, r1) {
  const w = new Float32Array(N * N);
  const c = N / 2;
  for (let y = 0; y < N; y++) {
    const dy = (y + 0.5 - c) / c, dy4 = dy * dy * dy * dy;
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - c) / c;
      const r = Math.sqrt(Math.sqrt(dx * dx * dx * dx + dy4));
      w[y * N + x] = smoothstep(r1, r0, r);
    }
  }
  return w;
}

/** Alpha of `canvas` resampled to N×N (smooth) → Float32Array mask 0–1. */
export function alphaAt(canvas, N) {
  const c = canvas.width === N && canvas.height === N ? canvas : resizeCanvas(canvas, N, N);
  const d = getPixels(c).data;
  const m = new Float32Array(N * N);
  for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = d[j] / 255;
  return m;
}

/**
 * fieldCanvas(field, N, rgbOf) → N×N canvas: colour/alpha per cell from a scalar field.
 * `rgbOf(v, i)` returns [r, g, b, a(0–1)] or null (transparent). Draw it scaled with
 * smoothing for a soft layer.
 */
export function fieldCanvas(field, N, rgbOf) {
  const c = createCanvas(N, N);
  const x = ctx2d(c);
  const img = x.createImageData(N, N);
  const d = img.data;
  for (let i = 0, j = 0; i < field.length; i++, j += 4) {
    const v = field[i];
    if (!(v > 0.001)) continue;
    const q = rgbOf(v, i);
    if (!q) continue;
    d[j] = q[0]; d[j + 1] = q[1]; d[j + 2] = q[2];
    d[j + 3] = clamp(q[3]) * 255 + 0.5;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** drawScaled(o, canvas, S, { op, alpha }) — draw a low-res layer over the whole S×S canvas (smooth). */
export function drawScaled(o, c, S, { op = "source-over", alpha = 1 } = {}) {
  o.save();
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.globalCompositeOperation = op;
  o.globalAlpha = alpha;
  o.drawImage(c, 0, 0, S, S);
  o.restore();
}

/** valueNoise(x, y, seed) → [0, 1): smooth (smoothstep-bilinear) value noise on the integer lattice. */
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash01(xi, yi, seed), b = hash01(xi + 1, yi, seed);
  const c = hash01(xi, yi + 1, seed), d = hash01(xi + 1, yi + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/**
 * microScratches(x2d, box, scale, seed, k) — sparse 1-px light/dark scratches drawn with
 * "source-atop" (only on what is already painted). box = { x0, y0, x1, y1 } output px.
 */
export function microScratches(x2d, box, scale, seed, k) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = Math.round(12 + 60 * k);
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  const base = r() * Math.PI;
  x2d.save();
  x2d.globalCompositeOperation = "source-atop";
  x2d.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const cx = box.x0 + w * r(), cy = box.y0 + h * r();
    const a = base + (r() - 0.5) * 0.9 + (r() < 0.25 ? Math.PI / 2 : 0);
    const len = (8 + 46 * r() * r()) * scale;
    const light = r() < 0.7;
    x2d.strokeStyle = light ? `rgba(255,255,255,${(0.16 + 0.26 * r()) * (0.5 + 0.5 * k)})` : `rgba(0,0,0,${(0.12 + 0.2 * r()) * (0.5 + 0.5 * k)})`;
    x2d.lineWidth = Math.max(0.5, 0.75 * scale);
    x2d.beginPath();
    x2d.moveTo(cx - Math.cos(a) * len / 2, cy - Math.sin(a) * len / 2);
    x2d.lineTo(cx + Math.cos(a) * len / 2, cy + Math.sin(a) * len / 2);
    x2d.stroke();
  }
  x2d.restore();
}
