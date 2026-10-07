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
  createCanvas, ctx2d, getPixels, resizeCanvas, hexToRgb, hslToRgb, maskToCanvas, makeNoise2D, fbm, lerp,
} from "../core.js";
import {
  envLUT, teamTint, analyseRelief, pixelHash, drawGlints, norm3, V_MIN, V_MAX, LUT_N, valueNoise,
  microScratches,
} from "../fx/light.js";

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
  // Purple chrome (Kuro / Pixelbuddha): violet sky over a deep plum ground, white spec
  purple: {
    ground: [[-1.25, "#1A0B2E"], [-0.8, "#3E1F73"], [-0.5, "#9C7AD8"], [-0.36, "#B9A0E8"], [-0.2, "#4A2A86"], [-0.07, "#160A28"], [-0.004, "#08040F"]],
    sky: [[0.004, "#D9C8FF"], [0.06, "#FFFFFF"], [0.22, "#E9D8FF"], [0.5, "#A57CF0"], [0.85, "#7B3FE4"], [1.25, "#4A2399"]],
    spec: "#FFFFFF", rim: "#D8C2FF", lo: 0.22, ink: "#0B0414",
  },
  // rose gold: blush sky, copper-brown ground
  rose: {
    ground: [[-1.25, "#3B1F1A"], [-0.8, "#7A4645"], [-0.5, "#C99A92"], [-0.36, "#DDB3A8"], [-0.2, "#86504F"], [-0.07, "#2A1512"], [-0.004, "#120807"]],
    sky: [[0.004, "#F2CFC2"], [0.06, "#FFF6F1"], [0.22, "#F7D7C9"], [0.5, "#D69A98"], [0.85, "#B76E79"], [1.25, "#8A4A55"]],
    spec: "#FFF4EE", rim: "#FFD6CC", lo: 0.24, ink: "#140806",
  },
  // gunmetal: blue-grey steel, cool spec
  gunmetal: {
    ground: [[-1.25, "#0E1114"], [-0.8, "#262D35"], [-0.5, "#5D6874"], [-0.36, "#77838F"], [-0.2, "#2C343C"], [-0.07, "#0D1013"], [-0.004, "#050607"]],
    sky: [[0.004, "#AEB9C4"], [0.06, "#E3EAF0"], [0.22, "#C9D2DA"], [0.5, "#7D8995"], [0.85, "#4A5560"], [1.25, "#2E363F"]],
    spec: "#DCE8F5", rim: "#9FB6CF", lo: 0.28,
  },
};
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
        { value: "purple", label: "Purple" },
        { value: "rose", label: "Rose gold" },
        { value: "gunmetal", label: "Gunmetal" },
      ],
    },
    { key: "bevel", label: "Bevel", type: "range", min: 8, max: 64, step: 1, default: 26, unit: "px" },
    { key: "smooth", label: "Smoothness", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "contrast", label: "Contrast", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "horizon", label: "Horizon", type: "range", min: 20, max: 80, step: 1, default: 52, unit: "%" },
    { key: "tint", label: "Team tint", type: "range", min: 0, max: 100, step: 1, default: 0, unit: "%" },
    { key: "grain", label: "Grain", type: "range", min: 0, max: 100, step: 1, default: 0, unit: "%" },
  ],
  presets: [
    { name: "Liquid silver", params: { finish: "silver", bevel: 26, smooth: 45, contrast: 60, horizon: 52, tint: 0 } },
    { name: "Gold", params: { finish: "gold", bevel: 26, smooth: 45, contrast: 58, horizon: 50, tint: 0 } },
    { name: "Team chrome", params: { finish: "team", bevel: 28, smooth: 50, contrast: 62, horizon: 50, tint: 60 } },
    { name: "Black chrome", params: { finish: "black", bevel: 24, smooth: 40, contrast: 70, horizon: 48, tint: 0 } },
    { name: "Purple chrome", params: { finish: "purple", bevel: 26, smooth: 50, contrast: 62, horizon: 50, tint: 0, grain: 0 } },
    { name: "Mercury grain", params: { finish: "silver", bevel: 44, smooth: 72, contrast: 58, horizon: 52, tint: 0, grain: 45 } },
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
    if (!memo || memo.key !== key) memo = { key, a: analyseRelief(srcD, data0, S, D, sc, p.bevel, smooth) };
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
    // Mercury grain: fine two-octave value noise (cells ≈ 1.6 and 4.5 units), multiplicative
    const grainK = (p.grain || 0) / 100;
    const gi1 = 1 / Math.max(0.8, 1.6 * ctx.scale), gi2 = 1 / Math.max(1.6, 4.5 * ctx.scale);
    const gSeed = (ctx.seed | 0) * 7919 + 101;
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
        if (grainK > 0) {
          const gN = (valueNoise(x * gi1, y * gi1, gSeed) - 0.5) * 0.7 + (valueNoise(x * gi2, y * gi2, gSeed + 17) - 0.5) * 0.45;
          const gf = 1 + gN * grainK * 0.62;
          r *= gf; g *= gf; bb *= gf;
        }
        od[j] = r > 255 ? 255 : r;
        od[j + 1] = g > 255 ? 255 : g;
        od[j + 2] = bb > 255 ? 255 : bb;
        od[j + 3] = a;
      }
    }
    const metal = createCanvas(S, S);
    ctx2d(metal).putImageData(img, 0, 0);
    if (grainK > 0) microScratches(ctx2d(metal), { x0: b.x0 / kD, y0: b.y0 / kD, x1: b.x1 / kD, y1: b.y1 / kD }, ctx.scale, gSeed + 3, grainK);

    /* thin dark outline under the metal */
    const olC = maskToCanvas(ol, D, D, p.finish === "gold" ? "#140B03" : env.ink || "#07080B");
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    o.drawImage(olC, 0, 0, S, S);
    o.drawImage(metal, 0, 0);
    drawGlints(o, glintV, glintP, S, Math.sqrt(span * big), specRGB);
    return out;
  },
};
