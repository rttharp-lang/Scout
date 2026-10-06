// "Chrome" — liquid Y2K chrome. The logo becomes a sculpted metal relief: a rounded
// bevel from the silhouette PLUS a smaller pillow on every color region of the logo (so
// eyes, teeth, lettering and outlines keep their own bevels and read as engraved
// detail), lit by a studio environment: cool sky above a hard dark horizon line, a dim
// warm ground below, crisp specular kicks and a cool rim. The horizon is bent by the
// surface normals and a slow liquid warp, which is what makes it read as poured metal
// instead of grey plastic. What the metal reflects follows a calmer copy of the surface
// (blurred detail + a broad dome), with the fine detail damped only near the horizon, so
// the horizon reads as one poured curve while every feature still catches sky / ground.
//
// Structure (same as halftone.js):
//   1. analysis maps at D = min(S, 1024): palette labels, per-region and outer distance
//      fields → one height field → normals;
//   2. shading at full S with the maps bilinearly sampled (crisp alpha from the source);
//   3. transparent background, deterministic (seeded warp), team palette for "Team".
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, blurMask, clamp, hexToRgb, rgbToHsl, hslToRgb,
  nearestColorIndex, insideDistance, dilateMask, maskToCanvas, makeNoise2D, fbm, maskBounds,
  normalsFromHeight, lerp,
} from "../core.js";
import { extractPalette } from "../image.js";

/* ───────────────────────────── environments ───────────────────────────── */

// v = elevation of what the surface reflects: +1.2 zenith … 0 horizon … −1.2 deep ground.
// The jump at v = 0 is the hard horizon line; it is anti-aliased per render (see envLUT).
const ENV = {
  silver: {
    ground: [[-1.25, "#2A2724"], [-0.8, "#5E554C"], [-0.5, "#B3A493"], [-0.36, "#C9BBAA"], [-0.2, "#6A6058"], [-0.07, "#1A1816"], [-0.004, "#060708"]],
    sky: [[0.004, "#D7DEE8"], [0.06, "#FFFFFF"], [0.22, "#F1F5FA"], [0.5, "#B4C1D2"], [0.85, "#7F92AC"], [1.25, "#5D6F8B"]],
    spec: "#FFFFFF", rim: "#CFE2FF", lo: 0.2,
  },
  gold: {
    ground: [[-1.25, "#3E2306"], [-0.8, "#A8661A"], [-0.45, "#D99A3A"], [-0.22, "#8A5210"], [-0.08, "#341C04"], [-0.004, "#1A0D02"]],
    sky: [[0.004, "#F6DC94"], [0.06, "#FFF8DC"], [0.22, "#FCE7A6"], [0.5, "#EDBB55"], [0.85, "#C68A26"], [1.25, "#9C6314"]],
    spec: "#FFFBEA", rim: "#FFE6A3", lo: 0.24,
  },
  black: {
    ground: [[-1.25, "#141517"], [-0.8, "#34353B"], [-0.45, "#4A4A50"], [-0.22, "#232428"], [-0.08, "#0B0C0E"], [-0.004, "#040405"]],
    sky: [[0.004, "#A7B1BF"], [0.06, "#DDE3EB"], [0.2, "#8E98A6"], [0.45, "#454C58"], [0.85, "#262B34"], [1.25, "#1A1E25"]],
    spec: "#FFFFFF", rim: "#B8CCE6", lo: 0.32,
  },
};
const V_MIN = -1.25, V_MAX = 1.25, LUT_N = 2048;

/**
 * Environment LUT (LUT_N × RGB floats 0–255) over v ∈ [V_MIN, V_MAX]. `aa` = horizon ramp
 * width in v units (≈ 1.5 output px), `contrast` 0–1 pushes tones away from mid grey,
 * `tint` = [h, s] team hue colorized in at `tintAmt` (anodized / candy metal).
 */
function envLUT(env, aa, contrast, tint, tintAmt, skyOnly) {
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
function teamTint(palette) {
  for (const hex of [palette?.primary, palette?.secondary]) {
    if (!hex) continue;
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    if (s > 0.18 && l > 0.08 && l < 0.92) return [h, s];
  }
  return null;
}

/* ───────────────────────────── analysis ───────────────────────────── */

/**
 * Palette label per pixel (−1 = transparent) with 1-px anti-aliasing slivers folded into
 * the neighbouring region (a grey AA pixel between black and white must not become its
 * own "navy" region with its own bevel).
 */
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

/**
 * Colour-independent analysis at D: palette regions, distance fields → height → detail
 * normals + the calm reflection normals, and the outline mask. Depends on the source
 * pixels, S, bevel and smoothness only, so finish / contrast / horizon / tint changes
 * re-shade without redoing it (one-entry memo).
 */
function analyse(srcD, data0, S, D, sc, bevelP, smooth) {
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
  return { b, alphaS, nx, ny, nz, nvy, nvz, spanD, ol };
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
  id: "chrome",
  name: "Chrome",
  category: "metal",
  blurb: "Liquid Y2K chrome with a hard horizon and hot highlights.",
  method: "Sublimation",
  stage: "dark",
  params: [
    {
      key: "finish", label: "Finish", type: "select", default: "silver",
      options: [
        { value: "silver", label: "Silver" },
        { value: "gold", label: "Gold" },
        { value: "team", label: "Team" },
        { value: "black", label: "Black chrome" },
      ],
    },
    { key: "bevel", label: "Bevel", type: "range", min: 8, max: 64, step: 1, default: 26, unit: "px" },
    { key: "smooth", label: "Smoothness", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "contrast", label: "Contrast", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "horizon", label: "Horizon", type: "range", min: 20, max: 80, step: 1, default: 52, unit: "%" },
    { key: "tint", label: "Team tint", type: "range", min: 0, max: 100, step: 1, default: 0, unit: "%" },
  ],
  presets: [
    { name: "Liquid silver", params: { finish: "silver", bevel: 26, smooth: 45, contrast: 60, horizon: 52, tint: 0 } },
    { name: "Gold", params: { finish: "gold", bevel: 26, smooth: 45, contrast: 58, horizon: 50, tint: 0 } },
    { name: "Team chrome", params: { finish: "team", bevel: 28, smooth: 50, contrast: 62, horizon: 50, tint: 60 } },
    { name: "Black chrome", params: { finish: "black", bevel: 24, smooth: 40, contrast: 70, horizon: 48, tint: 0 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const D = Math.min(S, 1024);
    const kD = D / S;
    const sc = ctx.scale * kD;           // 1024-units → D px
    const contrast = p.contrast / 100, smooth = p.smooth / 100, tintP = p.tint / 100;

    /* analysis at D (memoized) */
    const srcD = D === S ? src : resizeCanvas(src, D, D);
    const data0 = getPixels(srcD).data;
    const key = `${S}|${D}|${p.bevel}|${p.smooth}|${pixelHash(data0)}`;
    if (!memo || memo.key !== key) memo = { key, a: analyse(srcD, data0, S, D, sc, p.bevel, smooth) };
    const A = memo.a;
    if (!A) return createCanvas(S, S);
    const { b, alphaS, nx, ny, nz, nvy, nvz, spanD, ol } = A;

    /* liquid warp: low-frequency noise on a coarse grid (bilinear at S) */
    const span = Math.max(8, b.y1 - b.y0) / kD;     // logo height in output px
    const big = spanD / kD;                           // logo's long side in output px
    const G = 64;
    const warp = new Float32Array(G * G);
    const noise = makeNoise2D((ctx.seed >>> 0) + 911);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const X = (gx / (G - 1)) * S, Y = (gy / (G - 1)) * S;
        warp[gy * G + gx] = fbm(noise, X / big * 1.5, Y / big * 1.5, 3) * 0.27;
      }
    }

    /* environment */
    const env = ENV[p.finish === "team" ? "silver" : p.finish] || ENV.silver;
    const tint = teamTint(ctx.palette);
    // Team tint: the whole metal for "team" (candy / anodized), the sky reflection for
    // silver and gold, only the rim + glints for black chrome
    const tintAmt = !tint ? 0 : p.finish === "team" ? 0.45 + 0.5 * tintP : p.finish === "gold" ? 0.3 * tintP : p.finish === "black" ? 0.9 * tintP : 0.55 * tintP;
    const POS = 1.7;                                   // v swing from logo top to bottom
    const aa = (1.6 * POS) / span;                     // ≈1.6 px horizon ramp at any S
    const lut = envLUT(env, aa, contrast, tint, p.finish === "black" ? 0 : tintAmt, p.finish !== "team");
    const specRGB = hexToRgb(env.spec), rimRGB = hexToRgb(env.rim);
    const tintRGB = tint && tintAmt > 0 ? hslToRgb(tint[0], Math.min(1, tint[1] + 0.25), 0.72) : null;
    const rimC = tintRGB ? [lerp(rimRGB[0], tintRGB[0], tintAmt), lerp(rimRGB[1], tintRGB[1], tintAmt), lerp(rimRGB[2], tintRGB[2], tintAmt)] : rimRGB;
    const yH = (b.y0 + (b.y1 - b.y0) * (p.horizon / 100)) / kD;
    const lutK = (LUT_N - 1) / (V_MAX - V_MIN);
    const detail = 0.55 + 0.3 * contrast;
    const lo = env.lo;
    // key light (top-left, toward the viewer) and a broad top softbox
    const L1 = norm3(-0.42, -0.72, 0.55), L2 = norm3(0.15, -0.95, 0.3);
    const specK = 1.05 + 0.5 * contrast;
    // window streaks: two diagonal soft bands in the sky, bent by the surface
    const cxL = ((b.x0 + b.x1) / 2) / kD, cyL = ((b.y0 + b.y1) / 2) / kD;
    const streakK = 0.35 + 0.35 * contrast;
    // glints: brightest specular point per coarse cell → a few Y2K star flares
    const GC = 12;
    const cellOf = new Int32Array(S);
    for (let x = 0; x < S; x++) cellOf[x] = Math.min(GC - 1, ((x * GC) / S) | 0);
    const glintV = new Float32Array(GC * GC), glintP = new Int32Array(GC * GC);

    /* shade at S */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const srcImg = getPixels(src);
    const sd = srcImg.data;
    const img = o.createImageData(S, S);
    const od = img.data;
    // bilinear tables (D grid sampled at S pixel centres)
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
      const pos = ((yH - y) / span) * POS;
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
        // liquid warp
        const gxf = Math.min(G - 1.001, x * gk), gx0 = gxf | 0, gwx = gxf - gx0;
        const gi = gy0 * G + gx0;
        const wv = (warp[gi] * (1 - gwx) + warp[gi + 1] * gwx) * (1 - gwy) + (warp[gi + G] * (1 - gwx) + warp[gi + G + 1] * gwx) * gwy;
        // reflected elevation: R = 2(N·V)N − V, V = (0,0,1) → R.y = 2 Nz Ny (screen y down);
        // mostly the calm reflection surface, a little of the detail on top
        const Vy = nvy[i00] * w00 + nvy[i01] * w01 + nvy[i10] * w10 + nvy[i11] * w11;
        const Vz = nvz[i00] * w00 + nvz[i01] * w01 + nvz[i10] * w10 + nvz[i11] * w11;
        // Near the horizon the detail is damped so the line stays one liquid curve; away
        // from it every feature's bevel catches sky / ground at full strength.
        const vm = pos - 1.9 * Vz * Vy + wv;
        const avm = vm < 0 ? -vm : vm;
        const tw = avm >= 0.4 ? 1 : avm <= 0.05 ? 0 : (avm - 0.05) / 0.35;
        const wd = 0.12 + 0.6 * tw * tw * (3 - 2 * tw);
        let v = vm + 1.9 * wd * (Vz * Vy - Nz * Ny);
        v = v < V_MIN ? V_MIN : v > V_MAX ? V_MAX : v;
        const li = ((v - V_MIN) * lutK + 0.5) | 0;
        let r = lut[li * 3], g = lut[li * 3 + 1], bb = lut[li * 3 + 2];
        // logo detail: dark inks become darker chrome inlays
        const L = alphaS ? 1 : (0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2]) / 255;
        const f = 1 - detail * (1 - (lo + (1 - lo) * L));
        r *= f; g *= f; bb *= f;
        if (v > 0.02) {
          const u = (x - cxL) / big + ((y - cyL) / big) * 0.62 + Nz * Nx * 0.6;
          const d1 = 1 - Math.abs(u + 0.3) / 0.075, d2 = 1 - Math.abs(u + 0.14) / 0.022;
          let st = (d1 > 0 ? d1 * d1 * (3 - 2 * d1) : 0) + (d2 > 0 ? 0.7 * d2 * d2 * (3 - 2 * d2) : 0);
          if (st > 0) {
            st *= streakK * (v < 0.14 ? (v - 0.02) / 0.12 : 1);
            r += (255 - r) * st; g += (255 - g) * st; bb += (255 - bb) * st;
          }
        }
        // speculars: R·L = 2 Nz (N·L) − Lz
        let s1 = 2 * Nz * (Nx * L1[0] + Ny * L1[1] + Nz * L1[2]) - L1[2];
        s1 = s1 > 0 ? s1 : 0;
        let s2 = s1 * s1; s2 *= s2; s2 *= s2; // ^8
        const s32 = s2 * s2 * s2 * s2;        // ^32
        let t2 = 2 * Nz * (Nx * L2[0] + Ny * L2[1] + Nz * L2[2]) - L2[2];
        t2 = t2 > 0 ? t2 : 0;
        const t4 = t2 * t2 * t2 * t2;
        const spec = (s32 * 1.1 + s2 * 0.12 + t4 * 0.18) * specK;
        if (s32 > 0.6 && a > 250) {
          const c = ((y * GC) / S | 0) * GC + cellOf[x];
          if (s32 > glintV[c]) { glintV[c] = s32; glintP[c] = y * S + x; }
        }
        // rim light: grazing normals facing lower-right
        const edge = 1 - Nz;
        const rimF = edge * edge * Math.max(0, Nx * 0.55 + Ny * 0.83) * 1.6;
        r += spec * specRGB[0] + rimF * rimC[0];
        g += spec * specRGB[1] + rimF * rimC[1];
        bb += spec * specRGB[2] + rimF * rimC[2];
        od[j] = r > 255 ? 255 : r;
        od[j + 1] = g > 255 ? 255 : g;
        od[j + 2] = bb > 255 ? 255 : bb;
        od[j + 3] = a;
      }
    }
    const metal = createCanvas(S, S);
    ctx2d(metal).putImageData(img, 0, 0);

    /* thin dark outline under the metal */
    const olC = maskToCanvas(ol, D, D, p.finish === "gold" ? "#140B03" : "#07080B");
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    o.drawImage(olC, 0, 0, S, S);
    o.drawImage(metal, 0, 0);
    drawGlints(o, glintV, glintP, S, Math.sqrt(span * big), specRGB);
    return out;
  },
};

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

/** Up to three 4-point star flares on the strongest, well separated specular peaks. */
function drawGlints(o, val, pos, S, span, rgb) {
  const order = Array.from(val.keys()).filter((c) => val[c] > 0.75).sort((a, b) => val[b] - val[a] || a - b);
  const picks = [];
  for (const c of order) {
    const x = (pos[c] % S) + 0.5, y = Math.floor(pos[c] / S) + 0.5;
    if (picks.every((q) => Math.hypot(q[0] - x, q[1] - y) > span * 0.3)) picks.push([x, y]);
    if (picks.length >= 3) break;
  }
  const col = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;
  o.save();
  picks.forEach(([x, y], k) => {
    const R = span * (k === 0 ? 0.075 : 0.05);
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

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
