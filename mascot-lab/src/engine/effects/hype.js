// "Neon Chrome" (hype) — Studio 2am's flagship look: liquid chrome whose environment is
// a vivid neon gradient instead of a grey studio. The logo is the same sculpted relief as
// Chrome (silhouette bevel + a pillow per colour region, so features keep their own
// bevels), but the hard horizon it reflects separates a hot sky (white-hot at the horizon
// → saturated colour → deep violet) from a complementary neon ground (bright band → ink),
// with white Blinn speculars, a wide two-colour outer glow, film grain and a few
// scratches. Optional "HUD": a dashed contour hovering off the artwork with an
// out-of-focus duplicate behind it and corner brackets (the Cyber look).
//
// Structure (same as chrome.js, whose relief + environment math it shares via fx/light.js):
//   1. relief analysis at D = min(S, 1024) (memoized per logo / bevel);
//   2. shading at full S with bilinear normals; glow on a small grid, windowed so it
//      fades out before the canvas edge;
//   3. transparent background, deterministic (seeded warp / grain / scratches).
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, hexToRgb, rgbToHsl, hslToHex, mix, maskToCanvas,
  makeNoise2D, fbm, clamp, rng, hashSeed, dilateMask, blurMask, blurCanvas, traceContours,
} from "../core.js";
import {
  envLUT, analyseRelief, pixelHash, drawGlints, norm3, hash01, V_MIN, V_MAX, LUT_N, teamLights,
  edgeWindow, alphaAt,
} from "../fx/light.js";

/* ───────────────────────────── neon environments ───────────────────────────── */

// sky: just above the horizon (v → 0+) white-hot, then the hot colour, then deep space;
// ground: a near-black horizon line, a bright complementary band, then ink.
const GRADS = {
  hype: {
    ground: [[-1.25, "#0C0532"], [-0.82, "#1B0B4A"], [-0.5, "#00B8F0"], [-0.36, "#8AF9FF"], [-0.22, "#2058D8"], [-0.08, "#1A0948"], [-0.004, "#0A0322"]],
    sky: [[0.004, "#FFD6F2"], [0.04, "#FFFFFF"], [0.11, "#FFF0FA"], [0.22, "#FF8FD6"], [0.42, "#FF2E97"], [0.78, "#9A1BD6"], [1.25, "#2A0068"]],
    glow: ["#FF2E97", "#00E5FF"], ink: "#12002B", rim: "#7FF8FF",
  },
  cyber: {
    ground: [[-1.25, "#021410"], [-0.82, "#06382A"], [-0.5, "#5CFF2E"], [-0.36, "#DBFF8A"], [-0.22, "#14A050"], [-0.08, "#03261A"], [-0.004, "#010A07"]],
    sky: [[0.004, "#D6FFFA"], [0.04, "#FFFFFF"], [0.11, "#F0FFFD"], [0.22, "#7CFFF2"], [0.42, "#00E5FF"], [0.78, "#0050F0"], [1.25, "#060048"]],
    glow: ["#00E5FF", "#6BFF3A"], ink: "#01120E", rim: "#B6FF6A",
  },
  futurist: {
    ground: [[-1.25, "#12002E"], [-0.82, "#2E0866"], [-0.5, "#A24BFF"], [-0.36, "#E2B8FF"], [-0.22, "#6A1FC8"], [-0.08, "#1E0544"], [-0.004, "#0C0220"]],
    sky: [[0.004, "#FFE8CC"], [0.04, "#FFFFFF"], [0.11, "#FFF6EA"], [0.22, "#FFB866"], [0.42, "#FF7A1A"], [0.78, "#E0245E"], [1.25, "#4A0A4E"]],
    glow: ["#FF7A1A", "#A24BFF"], ink: "#14002A", rim: "#D8A6FF",
  },
  synth: {
    ground: [[-1.25, "#0A0636"], [-0.82, "#1A0E68"], [-0.5, "#2EE6FF"], [-0.36, "#B8FBFF"], [-0.22, "#4A3BE0"], [-0.08, "#160A4A"], [-0.004, "#08041E"]],
    sky: [[0.004, "#FFF6C8"], [0.04, "#FFFFFF"], [0.11, "#FFFBE6"], [0.22, "#FFE45C"], [0.42, "#FF6B3D"], [0.78, "#FF1F8E"], [1.25, "#4E0B8C"]],
    glow: ["#FF3D8B", "#2EE6FF"], ink: "#0E0530", rim: "#8AF4FF",
  },
};

const hsl = (hex) => rgbToHsl(hexToRgb(hex));
const shade = (hex, l, sMul = 1) => { const [h, s] = hsl(hex); return hslToHex(h, clamp(s * sMul), l); };

/** Neon environment built from the team palette: the brighter team light is the sky, the other the ground. */
function teamGrad(palette) {
  const [a, b] = teamLights(palette);
  return {
    ground: [[-1.25, shade(b, 0.07)], [-0.82, shade(b, 0.16)], [-0.5, b], [-0.36, mix(b, "#FFFFFF", 0.55)], [-0.22, shade(b, 0.36)], [-0.08, shade(b, 0.1)], [-0.004, shade(b, 0.05)]],
    sky: [[0.004, mix(a, "#FFFFFF", 0.75)], [0.04, "#FFFFFF"], [0.11, mix(a, "#FFFFFF", 0.88)], [0.22, mix(a, "#FFFFFF", 0.4)], [0.42, a], [0.78, shade(mix(a, b, 0.45), 0.34, 1.05)], [1.25, shade(b, 0.12)]],
    glow: [a, b], ink: shade(b, 0.06), rim: mix(b, "#FFFFFF", 0.4),
  };
}

let memo = null;   // { key, a } — last relief analysis (one entry: the logo being tuned)

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "hype",
  name: "Neon Chrome",
  category: "metal",
  blurb: "Liquid chrome reflecting a neon sky, with a hot glow.",
  method: "Sublimation",
  stage: "dark",
  params: [
    {
      key: "gradient", label: "Gradient", type: "select", default: "hype",
      options: [
        { value: "hype", label: "Hype pink" },
        { value: "cyber", label: "Cyber" },
        { value: "futurist", label: "Futurist" },
        { value: "synth", label: "Synthwave" },
        { value: "team", label: "Team neon" },
      ],
    },
    { key: "bevel", label: "Bevel", type: "range", min: 8, max: 60, step: 1, default: 24, unit: "px" },
    { key: "glow", label: "Glow", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "grain", label: "Grain", type: "range", min: 0, max: 100, step: 1, default: 35, unit: "%" },
    { key: "horizon", label: "Horizon", type: "range", min: 20, max: 80, step: 1, default: 50, unit: "%" },
    { key: "hud", label: "HUD frame", type: "toggle", default: false },
  ],
  presets: [
    { name: "Hype", params: { gradient: "hype", bevel: 24, glow: 60, grain: 35, horizon: 50, hud: false } },
    { name: "Cyber", params: { gradient: "cyber", bevel: 22, glow: 75, grain: 40, horizon: 48, hud: true } },
    { name: "Futurist", params: { gradient: "futurist", bevel: 34, glow: 60, grain: 30, horizon: 52, hud: false } },
    { name: "Synthwave", params: { gradient: "synth", bevel: 28, glow: 65, grain: 25, horizon: 58, hud: false } },
    { name: "Team neon", params: { gradient: "team", bevel: 26, glow: 60, grain: 30, horizon: 50, hud: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const D = Math.min(S, 1024);
    const kD = D / S;
    const sc = ctx.scale * kD;           // 1024-units → D px
    const grainK = p.grain / 100, glowK = p.glow / 100;

    /* relief at D (memoized) */
    const srcD = D === S ? src : resizeCanvas(src, D, D);
    const data0 = getPixels(srcD).data;
    const key = `${S}|${D}|${p.bevel}|${pixelHash(data0)}`;
    if (!memo || memo.key !== key) memo = { key, a: analyseRelief(srcD, data0, S, D, sc, p.bevel, 0.5) };
    const A = memo.a;
    if (!A) return createCanvas(S, S);
    const { b, alphaS, nx, ny, nz, nvy, nvz, spanD, ol } = A;

    const env = p.gradient === "team" ? teamGrad(ctx.palette) : GRADS[p.gradient] || GRADS.hype;

    /* liquid warp: low-frequency noise on a coarse grid (bilinear at S) */
    const span = Math.max(8, b.y1 - b.y0) / kD;     // logo height, output px
    const big = spanD / kD;                           // logo's long side, output px
    const G = 64;
    const warp = new Float32Array(G * G);
    const noise = makeNoise2D((ctx.seed >>> 0) + 1777);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const X = (gx / (G - 1)) * S, Y = (gy / (G - 1)) * S;
        warp[gy * G + gx] = fbm(noise, X / big * 1.6, Y / big * 1.6, 3) * 0.3;
      }
    }

    const POS = 1.75;                                  // v swing from logo top to bottom
    const aa = (1.5 * POS) / span;                     // ≈1.5 px horizon ramp at any S
    const lut = envLUT(env, aa, 0.62, null, 0, false);
    const rimRGB = hexToRgb(env.rim);
    const yH = (b.y0 + (b.y1 - b.y0) * (p.horizon / 100)) / kD;
    const lutK = (LUT_N - 1) / (V_MAX - V_MIN);
    const detail = 0.62, lo = 0.16;
    // key light upper-left: Blinn half vector with the viewer (0, 0, 1)
    const L1 = norm3(-0.42, -0.72, 0.55);
    const H1 = norm3(L1[0], L1[1], L1[2] + 1);
    const L2 = norm3(0.3, -0.9, 0.35);
    const H2 = norm3(L2[0], L2[1], L2[2] + 1);
    // grain: per-cell hash noise, cell ≈ 1.4 units so it reads the same at any size
    const gCell = Math.max(1, Math.round(1.4 * ctx.scale));
    const gAmp = grainK * 0.12 * 255 * 2;          // ± around 0 (hash − 0.5)
    const gSeed = hashSeed("hype-grain", ctx.seed) | 0;
    // HUD: the metal reads as a display — fine horizontal scanlines over it
    const scanP = p.hud ? Math.max(2, Math.round(4.5 * ctx.scale)) : 0;
    const GC = 12;
    const cellOf = new Int32Array(S);
    for (let x = 0; x < S; x++) cellOf[x] = Math.min(GC - 1, ((x * GC) / S) | 0);
    const glintV = new Float32Array(GC * GC), glintP = new Int32Array(GC * GC);

    /* shade at S */
    const srcImg = getPixels(src);
    const sd = srcImg.data;
    const metal = createCanvas(S, S);
    const mx = ctx2d(metal);
    const img = mx.createImageData(S, S);
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
      const pos = ((yH - y) / span) * POS;
      const gyf = Math.min(G - 1.001, y * gk), gy0 = gyf | 0, gwy = gyf - gy0;
      const gyc = (y / gCell) | 0;
      const scan = scanP ? 1 - 0.2 * Math.max(0, Math.sin(((y % scanP) / scanP) * Math.PI * 2)) : 1;
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
        const wv = (warp[gi] * (1 - gwx) + warp[gi + 1] * gwx) * (1 - gwy) + (warp[gi + G] * (1 - gwx) + warp[gi + G + 1] * gwx) * gwy;
        // reflected elevation (as chrome.js): calm surface near the horizon, detail away from it
        const Vy = nvy[i00] * w00 + nvy[i01] * w01 + nvy[i10] * w10 + nvy[i11] * w11;
        const Vz = nvz[i00] * w00 + nvz[i01] * w01 + nvz[i10] * w10 + nvz[i11] * w11;
        const vm = pos - 1.9 * Vz * Vy + wv;
        const avm = vm < 0 ? -vm : vm;
        const tw = avm >= 0.4 ? 1 : avm <= 0.05 ? 0 : (avm - 0.05) / 0.35;
        const wd = 0.12 + 0.62 * tw * tw * (3 - 2 * tw);
        let v = vm + 1.9 * wd * (Vz * Vy - Nz * Ny);
        v = v < V_MIN ? V_MIN : v > V_MAX ? V_MAX : v;
        const li = ((v - V_MIN) * lutK + 0.5) | 0;
        let r = lut[li * 3], g = lut[li * 3 + 1], bb = lut[li * 3 + 2];
        // logo detail: dark inks become deep-coloured inlays (the mascot keeps its face)
        const L = alphaS ? 1 : (0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2]) / 255;
        const f = (1 - detail * (1 - (lo + (1 - lo) * L))) * scan;
        r *= f; g *= f; bb *= f;
        // Blinn speculars (exp ≈ 60 key + a broad top fill)
        let h1 = Nx * H1[0] + Ny * H1[1] + Nz * H1[2];
        h1 = h1 > 0 ? h1 : 0;
        const hh2 = h1 * h1, h4 = hh2 * hh2, h8 = h4 * h4, h16 = h8 * h8;
        const h64 = h16 * h16 * h16 * h8 * h4;            // h^60
        let h2 = Nx * H2[0] + Ny * H2[1] + Nz * H2[2];
        h2 = h2 > 0 ? h2 : 0;
        let t16 = h2 * h2; t16 *= t16; t16 *= t16; t16 *= t16;
        const spec = (h64 * 1.25 + h8 * 0.1 + t16 * 0.22) * (0.5 + 0.5 * f);
        if (h64 > 0.6 && a > 250) {
          const c = ((y * GC) / S | 0) * GC + cellOf[x];
          if (h64 > glintV[c]) { glintV[c] = h64; glintP[c] = y * S + x; }
        }
        // coloured rim on grazing normals facing lower-right
        const edge = 1 - Nz;
        const rimF = edge * edge * Math.max(0, Nx * 0.55 + Ny * 0.83) * 1.5;
        r += spec * 255 + rimF * rimRGB[0];
        g += spec * 255 + rimF * rimRGB[1];
        bb += spec * 255 + rimF * rimRGB[2];
        // monochrome film grain
        if (gAmp > 0) {
          const nG = (hash01((x / gCell) | 0, gyc, gSeed) - 0.5) * gAmp;
          r += nG; g += nG; bb += nG;
        }
        od[j] = r > 255 ? 255 : r < 0 ? 0 : r;
        od[j + 1] = g > 255 ? 255 : g < 0 ? 0 : g;
        od[j + 2] = bb > 255 ? 255 : bb < 0 ? 0 : bb;
        od[j + 3] = a;
      }
    }
    mx.putImageData(img, 0, 0);
    // scratches: a few short bright streaks, clipped to the metal
    if (grainK > 0) drawScratches(mx, b, kD, ctx, grainK);

    /* compose: glow → HUD → dark keyline outline → metal → glints */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    if (glowK > 0) drawGlow(o, alphaS ? maskToCanvas(A.alpha, D, D) : src, S, env.glow, glowK);
    if (p.hud) drawHud(o, A.alpha, D, S, sc, kD, env.glow, b);
    o.drawImage(maskToCanvas(ol, D, D, env.ink), 0, 0, S, S);
    o.drawImage(metal, 0, 0);
    drawGlints(o, glintV, glintP, S, Math.sqrt(span * big), [255, 255, 255], 3, 0.95);
    return out;
  },
};

/* ───────────────────────────── layers ───────────────────────────── */

/**
 * Wide two-colour outer glow: the silhouette (dilated 4 units) blurred at 18 and 60
 * units on a small grid, the tight one in the hot colour, the wide one in the cool one,
 * added with "lighter" (≤ 0.8 alpha) and windowed to zero before the canvas edge.
 */
function drawGlow(o, shapeC, S, cols, k) {
  const N = Math.max(96, Math.min(384, Math.round(S / 4)));
  const u = N / 1024;                                  // 1024-units → grid px
  const m = dilateMask(alphaAt(shapeC, N), N, N, 4 * u);
  const b1 = blurMask(m, N, N, 18 * u);
  const b2 = blurMask(m, N, N, 60 * u);
  const win = edgeWindow(N, N * 0.015, N * 0.1);
  const cA = hexToRgb(cols[0]), cB = hexToRgb(cols[1]);
  const c = createCanvas(N, N);
  const x = ctx2d(c);
  const img = x.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) {
    for (let xx = 0; xx < N; xx++) {
      const i = y * N + xx;
      const w = win[xx] * win[y];
      if (w <= 0) continue;
      const a1 = Math.min(1, b1[i] * 2.1) * 0.85 * k * w;           // tight hot halo
      const a2 = Math.min(1, b2[i] * 1.9) * 0.6 * k * w;            // wide cool bloom
      const t = a1 + a2 * (1 - a1);                                  // hot over cool
      if (t < 0.003) continue;
      const wb = a2 * (1 - a1);
      const j = i * 4;
      d[j] = (cA[0] * a1 + cB[0] * wb) / t;
      d[j + 1] = (cA[1] * a1 + cB[1] * wb) / t;
      d[j + 2] = (cA[2] * a1 + cB[2] * wb) / t;
      d[j + 3] = Math.min(0.8, t) * 255;
    }
  }
  x.putImageData(img, 0, 0);
  o.save();
  o.globalCompositeOperation = "lighter";
  o.drawImage(c, 0, 0, S, S);
  o.restore();
}

/** 6–12 short scratches (seeded), light streaks clipped to the metal (source-atop). */
function drawScratches(mx, b, kD, ctx, k) {
  const r = rng(hashSeed("hype-scratch", ctx.seed));
  const sc = ctx.scale;
  const x0 = b.x0 / kD, y0 = b.y0 / kD, w = (b.x1 - b.x0) / kD, h = (b.y1 - b.y0) / kD;
  const n = Math.round(6 + 6 * k);
  mx.save();
  mx.globalCompositeOperation = "source-atop";
  mx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const cx = x0 + w * (0.1 + 0.8 * r()), cy = y0 + h * (0.1 + 0.8 * r());
    const ang = -0.5 + r() * 1.0 + (r() < 0.3 ? Math.PI / 2 : 0);
    const len = (18 + r() * 60) * sc;
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
    mx.strokeStyle = `rgba(255,255,255,${(0.18 + 0.3 * r()) * (0.4 + 0.6 * k)})`;
    mx.lineWidth = Math.max(0.6, (0.8 + r() * 0.9) * sc);
    mx.beginPath();
    mx.moveTo(cx - dx, cy - dy);
    mx.quadraticCurveTo(cx + dy * 0.08, cy - dx * 0.08, cx + dx, cy + dy);
    mx.stroke();
  }
  mx.restore();
}

/**
 * HUD frame: a dashed contour 14 units off the artwork (outer contours only), an
 * out-of-focus duplicate behind it (depth of field) and four corner brackets.
 */
function drawHud(o, alpha, D, S, sc, kD, cols, b) {
  const N = Math.min(D, 384);
  const u = N / D;                                     // D px → grid px
  const small = N === D ? alpha : alphaAt(maskToCanvas(alpha, D, D), N);
  const grown = dilateMask(small, N, N, 22 * sc * u);
  const contours = traceContours(grown, N, N, 0.5, 0.6).filter((c) => signedArea(c) > (N * N) * 0.002);
  const k = S / N;
  const path = new Path2D();
  for (const c of contours) {
    path.moveTo(c[0][0] * k, c[0][1] * k);
    for (let i = 1; i < c.length; i++) path.lineTo(c[i][0] * k, c[i][1] * k);
    path.closePath();
  }
  const s1 = sc / kD;                                  // 1024-units → output px
  const col = cols[0];
  // brackets around the artwork bbox
  const pad = 34 * s1;
  const bx0 = Math.max(6 * s1, b.x0 / kD - pad), by0 = Math.max(6 * s1, b.y0 / kD - pad);
  const bx1 = Math.min(S - 6 * s1, b.x1 / kD + pad), by1 = Math.min(S - 6 * s1, b.y1 / kD + pad);
  const arm = Math.min(bx1 - bx0, by1 - by0) * 0.09;
  const brackets = new Path2D();
  for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
    brackets.moveTo(x, y + sy * arm); brackets.lineTo(x, y); brackets.lineTo(x + sx * arm, y);
  }
  // blurred, slightly larger duplicate behind (depth of field)
  const dof = createCanvas(S, S);
  const dx = ctx2d(dof);
  dx.translate(S / 2, S / 2); dx.scale(1.035, 1.035); dx.translate(-S / 2, -S / 2);
  dx.strokeStyle = cols[1];
  dx.lineWidth = 3.6 * s1;
  dx.setLineDash([22 * s1, 12 * s1]);
  dx.stroke(path);
  o.save();
  o.globalCompositeOperation = "lighter";
  o.globalAlpha = 0.75;
  o.drawImage(blurCanvas(dof, 4.5 * s1), 0, 0);
  o.restore();
  // crisp dashes + brackets
  o.save();
  o.strokeStyle = col;
  o.shadowColor = col;
  o.shadowBlur = 6 * s1;
  o.lineWidth = Math.max(1, 2.6 * s1);
  o.setLineDash([20 * s1, 11 * s1]);
  o.stroke(path);
  o.setLineDash([]);
  o.lineWidth = Math.max(1, 3 * s1);
  o.lineCap = "square";
  o.globalAlpha = 0.9;
  o.stroke(brackets);
  o.restore();
}

/** Signed area of a closed polyline (positive = clockwise on screen = an outer contour). */
function signedArea(c) {
  let s = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) s += (c[j][0] - c[i][0]) * (c[j][1] + c[i][1]);
  return s / 2;
}

