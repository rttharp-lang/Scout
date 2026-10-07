// "Fire" — the mascot on fire: flame tongues licking up from every upward-facing edge,
// glowing embers riding the heat, a hot rim where the flames backlight the art — or soft
// rising steam. A team-apparel staple.
//
//   field  → for every pixel, the distance to the art BELOW it in its column (one bottom-up
//            scan per column), sampled through a domain warp so tongues sway and split;
//            intensity = (1 − dy / height)^1.6 broken up by stretched fbm turbulence;
//   colour → a flame LUT (transparent → ember red → orange → yellow → white-hot), a blue
//            LUT, a team LUT (dark → primary → secondary → white) or white steam;
//   rim    → the logo's top-facing edges glow orange (flames behind it);
//   sparks → seeded embers above the art with short upward streaks, added as light.
//
// The field lives on a grid of ≈ S/2 (it is soft) and is smoothly upscaled; it is faded
// out before the canvas edge. Transparent background, deterministic (seeded noise/sparks).
import {
  createCanvas, ctx2d, clamp, smoothstep, hexToRgb, rgbToHsl, hslToHex, mix, makeNoise2D, fbm,
  gradientLUT, blurMask, maskBounds, maskToCanvas, rng, hashSeed,
} from "../core.js";
import { alphaAt, edgeWindow, teamLights } from "../fx/light.js";

const TAU = Math.PI * 2;

/* ───────────────────────────── palettes ───────────────────────────── */

const LUTS = {
  flame: [["#3A0000", 0.0], ["#8E0A12", 0.18], ["#C1121F", 0.32], ["#FF4A00", 0.5], ["#FF7A00", 0.62], ["#FFB000", 0.76], ["#FFD60A", 0.86], ["#FFF4C2", 0.95], ["#FFFFFF", 1]],
  blue: [["#000A2E", 0.0], ["#001A6B", 0.18], ["#0035C8", 0.34], ["#0066FF", 0.5], ["#00A8FF", 0.66], ["#4FD8FF", 0.8], ["#B8F4FF", 0.92], ["#FFFFFF", 1]],
  steam: [["#DDE3EA", 0.0], ["#EEF2F6", 0.4], ["#FFFFFF", 1]],
};
const RIM = { flame: ["#FF6A00", "#FFD23F"], blue: ["#1E7BFF", "#A8EEFF"] };

const shade = (hex, l) => { const [h, s] = rgbToHsl(hexToRgb(hex)); return hslToHex(h, Math.max(0.7, s), l); };

function teamStops(palette) {
  const [a, b] = teamLights(palette);      // a = the brighter team light
  return [[shade(b, 0.08), 0.0], [shade(b, 0.22), 0.2], [b, 0.42], [mix(b, a, 0.5), 0.58], [a, 0.74], [mix(a, "#FFFFFF", 0.55), 0.9], ["#FFFFFF", 1]];
}

/* ───────────────────────────── field ───────────────────────────── */

/**
 * Flame intensity on an N×N grid. `mask` = the art at N; H = flame height (grid px);
 * turb 0–1. → { I: Float32Array (0–1), top } where top = the art's top row.
 */
function flameField(mask, N, H, turb, seed, steam) {
  const n = N * N;
  // distance to the art below, per column (bottom-up scan)
  const below = new Float32Array(n);
  for (let x = 0; x < N; x++) {
    let run = 1e6;
    for (let y = N - 1; y >= 0; y--) {
      const i = y * N + x;
      if (mask[i] > 0.35) run = 0; else run += 1;
      below[i] = run;
    }
  }
  const nT = makeNoise2D(seed);
  const nW = makeNoise2D(seed + 77);
  const nH = makeNoise2D(seed + 151);
  const fs = 1 / Math.max(4, H * 0.34);     // turbulence frequency: a few tongues per flame height
  const fH = 1 / Math.max(3, H * 0.3);      // tongue width
  const warpA = H * (0.12 + 0.3 * turb);
  const winX = edgeWindow(N, N * 0.01, N * 0.07);
  const winY = edgeWindow(N, N * 0.012, N * 0.1);
  // per-column tongue height: some tongues reach high, others stay low
  const tongue = new Float32Array(N);
  for (let x = 0; x < N; x++) {
    const t = 0.5 + 0.5 * fbm(nH, x * fH, 0.37, 3);
    tongue[x] = steam ? 1 : 0.42 + 1.05 * Math.pow(t, 1.25) * (0.55 + 0.45 * turb) + 0.25 * (1 - turb);
  }
  const I = new Float32Array(n);
  for (let y = 0; y < N; y++) {
    const wy = winY[y];
    for (let x = 0; x < N; x++) {
      const w = winX[x] * wy;
      if (w <= 0) continue;
      // sway: horizontal domain warp, stronger with height above the art
      const raw = below[y * N + x];
      const lift = raw < 1e5 ? clamp(raw / H) : 1;
      const wx = fbm(nW, x * fs * 0.6, y * fs * 0.45 + 3.3, 2) * warpA * (0.2 + 1.2 * lift);
      let xs = x + wx;
      xs = xs < 0 ? 0 : xs > N - 1 ? N - 1 : xs;
      const x0 = xs | 0, x1 = x0 < N - 1 ? x0 + 1 : x0, fx = xs - x0;
      const d = below[y * N + x0] * (1 - fx) + below[y * N + x1] * fx;
      const Hx = H * (tongue[x0] * (1 - fx) + tongue[x1] * fx);
      if (d >= Hx) continue;
      const u = d / Hx;                                          // 0 at the art, 1 at the tip
      const base = Math.pow(1 - u, 1.35);
      // stretched turbulence: tall cells so tongues form, split near the tips
      const T = 0.5 + 0.5 * fbm(nT, x * fs * 1.1, y * fs * 0.45, 3);
      let v = base * (1 - turb * (1 - T) * (0.25 + 1.25 * u));
      if (steam) {
        // vapour: thin at the surface, soft plumes stretched upward and curling
        const T2 = 0.5 + 0.5 * fbm(nT, x * fs * 0.55 + wx * fs * 1.2, y * fs * 0.24, 3);
        v = base * smoothstep(0.0, 0.3, u + 0.05) * (0.15 + 1.05 * T2 * T2);
      }
      v = v <= 0 ? 0 : v >= 1 ? 1 : v;
      I[y * N + x] = v * w;
    }
  }
  return I;
}

/** Field → RGBA canvas through the LUT; alpha = smoothstep(a0, a1, I) × aMul. */
function fieldToCanvas(I, N, lut, a0, a1, aMul) {
  const c = createCanvas(N, N);
  const x = ctx2d(c);
  const img = x.createImageData(N, N);
  const d = img.data;
  for (let i = 0, j = 0; i < I.length; i++, j += 4) {
    const v = I[i];
    if (v <= a0) continue;
    const li = ((v * 255) | 0) * 3;
    d[j] = lut[li]; d[j + 1] = lut[li + 1]; d[j + 2] = lut[li + 2];
    d[j + 3] = smoothstep(a0, a1, v) * aMul * 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "fire",
  name: "Fire",
  category: "metal",
  blurb: "Your mascot on fire: flame tongues, embers and a hot rim.",
  method: "Sublimation",
  stage: "dark",
  params: [
    {
      key: "style", label: "Fire", type: "select", default: "flame",
      options: [
        { value: "flame", label: "Flame" },
        { value: "blue", label: "Blue flame" },
        { value: "team", label: "Team fire" },
        { value: "steam", label: "Steam" },
      ],
    },
    { key: "height", label: "Flame height", type: "range", min: 40, max: 300, step: 1, default: 170, unit: "px" },
    { key: "turbulence", label: "Turbulence", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    { key: "sparks", label: "Sparks", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    { key: "rim", label: "Hot rim", type: "toggle", default: true },
  ],
  presets: [
    { name: "On fire", params: { style: "flame", height: 210, turbulence: 65, sparks: 45, rim: true } },
    { name: "Blue flame", params: { style: "blue", height: 180, turbulence: 55, sparks: 35, rim: true } },
    { name: "Team fire", params: { style: "team", height: 190, turbulence: 60, sparks: 40, rim: true } },
    { name: "Steam", params: { style: "steam", height: 240, turbulence: 50, sparks: 0, rim: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const N = Math.max(160, Math.min(640, Math.round(S / 2)));
    const kN = N / S;
    const u = sc * kN;                               // 1024-units → grid px
    const turb = p.turbulence / 100, sparks = p.sparks / 100;
    const steam = p.style === "steam";
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";

    const mask = alphaAt(src, N);
    const bb = maskBounds(mask, N, N, 0.35);
    if (bb.empty) { o.drawImage(src, 0, 0); return out; }
    const H = Math.max(6, p.height * u);
    const seed = (hashSeed("fire", ctx.seed) >>> 0) % 100000;

    let I = flameField(mask, N, H, steam ? turb * 0.6 : turb, seed, steam);
    I = blurMask(I, N, N, steam ? 7 * u : Math.max(0.9, 1.1 * u));
    const stops = p.style === "team" ? teamStops(ctx.palette) : LUTS[p.style] || LUTS.flame;
    const lut = gradientLUT(stops.map(([c, at]) => ({ at, color: c })));

    /* heat glow: the art's silhouette blurred wide, warm, faint (sells the light) */
    if (!steam) {
      const glow = blurMask(mask, N, N, 26 * u);
      const winX = edgeWindow(N, N * 0.01, N * 0.08);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) glow[y * N + x] *= winX[x] * winX[y];
      const gc = maskToCanvas(glow, N, N, stops[Math.floor(stops.length * 0.45)][0]);
      o.globalAlpha = 0.55;
      o.drawImage(gc, 0, 0, S, S);
      o.globalAlpha = 1;
    }

    /* flames (or steam) behind the art */
    const fc = steam ? fieldToCanvas(I, N, lut, 0.02, 0.42, 0.62) : fieldToCanvas(I, N, lut, 0.06, 0.42, 1);
    o.drawImage(fc, 0, 0, S, S);
    if (!steam) {
      // a second, brighter pass of the hottest core added as light
      const hot = fieldToCanvas(I, N, lut, 0.55, 0.9, 0.55);
      o.save();
      o.globalCompositeOperation = "lighter";
      o.drawImage(hot, 0, 0, S, S);
      o.restore();
    }

    /* the art */
    o.drawImage(src, 0, 0);

    /* hot rim on the top-facing edges */
    if (p.rim && !steam) {
      const r = Math.max(1, Math.round(7 * u));
      const rim = new Float32Array(N * N);
      for (let y = r; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const m = mask[i];
          if (m < 0.05) continue;
          rim[i] = m * (1 - mask[i - r * N]);
        }
      }
      const rimB = blurMask(rim, N, N, Math.max(0.6, 2.2 * u));
      const cols = p.style === "team" ? [stops[3][0], stops[5][0]] : RIM[p.style] || RIM.flame;
      const rc = maskToCanvas(rimB, N, N, cols[0]);
      const rimC = createCanvas(S, S);
      const rx = ctx2d(rimC);
      rx.imageSmoothingEnabled = true;
      rx.drawImage(rc, 0, 0, S, S);
      rx.globalCompositeOperation = "destination-in";
      rx.drawImage(src, 0, 0);
      o.save();
      o.globalCompositeOperation = "screen";
      o.globalAlpha = 0.95;
      o.drawImage(rimC, 0, 0);
      o.globalAlpha = 0.6;
      o.drawImage(rimC, 0, 0);
      o.restore();
    }

    /* sparks: embers above the art, short upward streaks, added as light */
    if (sparks > 0 && !steam) {
      const rand = rng(hashSeed("fire-sparks", ctx.seed));
      const count = Math.round(40 + 160 * sparks);
      const x0 = bb.x0 / kN, x1 = bb.x1 / kN, top = bb.y0 / kN, bot = bb.y1 / kN;
      const Hs = H / kN;
      const margin = S * 0.05;
      const cols = p.style === "team" ? [stops[4][0], stops[5][0]] : p.style === "blue" ? ["#4FD8FF", "#E6FBFF"] : ["#FF8A1F", "#FFE27A"];
      const [c0, c1] = cols.map(hexToRgb);
      o.save();
      o.globalCompositeOperation = "lighter";
      o.lineCap = "round";
      let placed = 0;
      for (let t = 0; t < count * 4 && placed < count; t++) {
        const px = x0 + (x1 - x0) * (0.04 + 0.92 * rand());
        // most embers hug the flames, a few drift high
        const h = Math.pow(rand(), 1.6) * (Hs * 1.25 + (bot - top) * 0.15);
        const py = top + (bot - top) * 0.25 * rand() - h;
        const size = (0.9 + 2.6 * Math.pow(rand(), 2.2)) * sc;
        const len = (3 + 9 * rand()) * sc * (0.6 + h / (Hs + 1));
        const bend = (rand() - 0.5) * len * 1.4;
        if (py - len < margin || px < margin || px > S - margin) continue;
        // only above the art or in its flames (not floating on it)
        const gi = Math.min(N - 1, Math.max(0, Math.round(py * kN))) * N + Math.min(N - 1, Math.max(0, Math.round(px * kN)));
        if (mask[gi] > 0.5) continue;
        const k = rand();
        const r = c0[0] + (c1[0] - c0[0]) * k, g = c0[1] + (c1[1] - c0[1]) * k, b = c0[2] + (c1[2] - c0[2]) * k;
        const fade = 1 - 0.6 * clamp(h / (Hs * 1.4));
        o.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${(0.55 * fade).toFixed(3)})`;
        o.lineWidth = size;
        o.beginPath();
        o.moveTo(px, py);
        o.quadraticCurveTo(px + bend, py - len * 0.5, px + bend * 0.4, py - len);
        o.stroke();
        // the ember's hot head
        const gr = o.createRadialGradient(px, py, 0, px, py, size * 2.6);
        gr.addColorStop(0, `rgba(255,250,220,${(0.95 * fade).toFixed(3)})`);
        gr.addColorStop(0.35, `rgba(${r | 0},${g | 0},${b | 0},${(0.6 * fade).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
        o.fillStyle = gr;
        o.beginPath(); o.arc(px, py, size * 2.6, 0, TAU); o.fill();
        placed++;
      }
      o.restore();
    }
    return out;
  },
};
