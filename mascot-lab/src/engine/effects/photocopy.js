// "xScan" — the logo dragged across a scanner bed / copied to death, in the spirit of
// Studio 2am's xScan and the photocopy packs (Photocopy Machine, CopyCat, Bad Print
// Copier, Dirty Scanner):
//
//   one-ink toner separation (or the logo's own flattened colours for a colour copy) →
//   a crunchy threshold whose edge is jittered by noise at three scales (ragged edges,
//   dropouts, filled-in counters) and by toner grain (mid-tones print as speckle) →
//   uneven roller pressure across the feed → white drum streaks along the feed →
//   the drag: in bands picked by noise across the feed, toner smears out of the artwork
//   into hard striped streaks that dissolve into speckle, plus 1–3 "pull jumps" where
//   the original slipped sideways → copier marks: faint drum lines and toner speckle
//   that hugs the edges.
//
// Everything sized in 1024-units on unit-anchored noise (same copy at 384 and 2048);
// per-pixel work at W = min(S, 1024). Transparent background, deterministic.
import {
  createCanvas, ctx2d, clamp, smoothstep, blurMask, outsideDistance, hexToRgb, rng, hashSeed,
  nearestColorIndex, rgbToHsl, hslToRgb,
} from "../core.js";
import { extractPalette } from "../image.js";
import {
  readLogo, noiseMap, noise1D, grainMap, hash01, bounds, quantileOf, toSize, workSize,
} from "../fx/press.js";

const TAU = Math.PI * 2;
const EDGE = 10;        // keep every mark this many units clear of the canvas edge

/** Line geometry of the four drag directions: pixel index of (cross c, along a). */
function lines(dir, W) {
  switch (dir) {
    case "up": return { start: (c) => (W - 1) * W + c, stride: -W, alongOf: (x, y) => W - 1 - y, crossOf: (x) => x };
    case "right": return { start: (c) => c * W, stride: 1, alongOf: (x) => x, crossOf: (x, y) => y };
    case "left": return { start: (c) => c * W + W - 1, stride: -1, alongOf: (x) => W - 1 - x, crossOf: (x, y) => y };
    default: return { start: (c) => c, stride: W, alongOf: (x, y) => y, crossOf: (x) => x };
  }
}

/** Copier colours: the logo's flattened palette, pushed a little punchier (a colour copy). */
function copyPalette(small) {
  const pal = extractPalette(small, 6, { maxSamples: 5000 });
  return pal.map(({ hex }) => {
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    const l2 = l < 0.3 ? l * 0.85 : l > 0.62 ? l + (1 - l) * 0.15 : l;
    return hslToRgb(h, clamp(s * 1.12), clamp(l2));
  });
}

export default {
  id: "photocopy",
  name: "xScan",
  category: "texture",
  blurb: "Copied to death: crunchy toner, scanner drag, streaks.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "drag", label: "Scanner drag", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    {
      key: "direction", label: "Drag direction", type: "select", default: "down",
      options: [
        { value: "down", label: "Down" },
        { value: "right", label: "Right" },
        { value: "up", label: "Up" },
        { value: "left", label: "Left" },
      ],
    },
    { key: "toner", label: "Toner", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "streaks", label: "Copier marks", type: "range", min: 0, max: 100, step: 1, default: 35, unit: "%" },
    { key: "ink", label: "Toner color", type: "color", default: "dark" },
    { key: "keepColors", label: "Color copy", type: "toggle", default: false },
  ],
  presets: [
    { name: "xScan", params: { drag: 55, direction: "down", toner: 60, streaks: 35, ink: "dark", keepColors: false } },
    { name: "Smear", params: { drag: 95, direction: "down", toner: 60, streaks: 20, ink: "dark", keepColors: false } },
    { name: "Dead copy", params: { drag: 15, direction: "down", toner: 90, streaks: 70, ink: "dark", keepColors: false } },
    { name: "Color copy", params: { drag: 55, direction: "down", toner: 40, streaks: 35, keepColors: true } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = workSize(S);
    const u = ctx.scale * (W / S);                 // px per unit at W
    const n = W * W;
    const seed = ctx.seed >>> 0;
    const drag = p.drag / 100, toner = p.toner / 100, marks = p.streaks / 100;
    const color = !!p.keepColors;

    /* ── 1. what the copier sees ── */
    const logo = readLogo(src, W);
    const { alpha, lum, chroma } = logo;
    const bb = bounds(alpha, W, 0.1);
    const out = createCanvas(W, W);
    if (bb.empty) return toSize(out, S);
    // toner wanted per pixel: dark and saturated inks print, pale inks drop out
    let t = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      if (a <= 0) continue;
      // (a gold prints as a mid grey — grainy toner — so it stays distinct from navy)
      t[i] = color ? a : a * clamp((1 - lum[i] - 0.25) / 0.55 + 0.05 * chroma[i]);
      sum += t[i];
    }
    if (!color && sum < logo.opaque * 0.12) t = Float32Array.from(alpha); // white logo: copy its shape
    // colour copy: every pixel takes the nearest flattened logo colour
    let cIdx = null, cols = null;
    if (color) {
      cols = copyPalette(logo.canvas);
      if (!cols.length) cols = [hexToRgb(p.ink)];
      cIdx = new Uint8Array(n);
      const d = logo.data;
      const cache = new Int16Array(32768).fill(-1);
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        if (d[j + 3] === 0) continue;
        const key = ((d[j] >> 3) << 10) | ((d[j + 1] >> 3) << 5) | (d[j + 2] >> 3);
        let k = cache[key];
        if (k < 0) k = cache[key] = nearestColorIndex(d[j], d[j + 1], d[j + 2], cols);
        cIdx[i] = k;
      }
    }

    const L = lines(p.direction, W);
    const horiz = p.direction === "right" || p.direction === "left";
    // the artwork's span across / along the feed
    const c0 = horiz ? bb.y0 : bb.x0, c1 = horiz ? bb.y1 : bb.x1;
    const aLo = horiz ? (p.direction === "right" ? bb.x0 : W - bb.x1) : (p.direction === "down" ? bb.y0 : W - bb.y1);
    const aLen = horiz ? bb.w : bb.h;

    /* ── 2. pull jumps: the original slipped sideways for a moment ── */
    const jr = rng(hashSeed("xscan-jumps", seed));
    const nJumps = drag > 0.05 ? 1 + Math.floor(drag * 2.2) : 0;
    for (let k = 0; k < nJumps; k++) {
      const a0 = Math.round(aLo + aLen * (0.18 + 0.64 * jr()));
      const h = Math.round((10 + 34 * jr()) * u);
      const off = Math.round((jr() < 0.5 ? -1 : 1) * (6 + 14 * jr()) * u);
      if (!off) continue;
      for (let a = a0; a < Math.min(W, a0 + h); a++) {
        // copy the band of cross-lines at `a`, shifted by `off` across the feed
        const tmp = new Float32Array(W), tmpC = cIdx ? new Uint8Array(W) : null;
        for (let c = 0; c < W; c++) {
          const sc = c - off;
          const i = L.start(c) + a * L.stride;
          if (sc < 0 || sc >= W) continue;
          const si = L.start(sc) + a * L.stride;
          tmp[c] = t[si];
          if (tmpC) tmpC[c] = cIdx[si];
        }
        for (let c = 0; c < W; c++) {
          const i = L.start(c) + a * L.stride;
          t[i] = tmp[c];
          if (tmpC) cIdx[i] = tmpC[c];
        }
      }
    }

    /* ── 3. toner: ragged threshold + grain + roller pressure + drum streaks ── */
    // more toner = a later generation: thin lines thicken, counters fill in
    const soft = blurMask(t, W, W, (0.9 + 2.4 * toner * toner) * u);
    const nLow = noiseMap(W, u, 160, hashSeed("xscan-low", seed), { octaves: 2 });
    const nMid = noiseMap(W, u, 24, hashSeed("xscan-mid", seed), { octaves: 2 });
    const nFine = noiseMap(W, u, 4.5, hashSeed("xscan-fine", seed), { octaves: 2 });
    const grain = grainMap(W, u, 1.5, hashSeed("xscan-grain", seed));
    const press = noise1D(W, u, 130, hashSeed("xscan-press", seed), 2);   // along the feed
    const streak = noise1D(W, u, 2.6, hashSeed("xscan-streak", seed), 1);  // across the feed
    const jit = 0.05 + 0.3 * toner;
    const gAmp = 0.3 + 0.28 * toner;
    const gain = 0.86 + 0.42 * toner;
    const dust = 0.2 * toner * toner;                 // toner haze on the light parts
    const cov = new Float32Array(n);
    for (let c = 0; c < W; c++) {
      // a few hairline white streaks through the toner, along the feed
      const st = streak[c] > 0.62 - 0.12 * marks ? (streak[c] - 0.5) * (0.4 + 0.9 * marks) : 0;
      let i = L.start(c);
      for (let a = 0; a < W; a++, i += L.stride) {
        const sv = soft[i];
        if (sv <= 0.004 && alpha[i] < 0.5) continue;
        const pr = 1 - 0.32 * (0.5 + 0.5 * press[a]);
        const v = sv * gain * pr + jit * (0.55 * nLow[i] + 0.3 * nMid[i] + 0.15 * nFine[i]) +
          gAmp * (grain[i] - 0.5) - st + (alpha[i] > 0.5 ? dust : 0);
        cov[i] = smoothstep(0.44, 0.56, v);
      }
    }

    /* ── 4. the drag: in noise-picked bands across the feed the original moved with the
       scan head — the row under the head is stretched into hard stripes that run past
       the artwork and break up into speckle (a pixel-stretch smear) ── */
    let smear = null, smearCol = null, moved = null;
    if (drag > 0.001) {
      smear = new Float32Array(n);
      moved = new Float32Array(n);   // how much of the original moved away under the head
      if (color) smearCol = new Uint8Array(n);
      const band = noise1D(W, u, 40, hashSeed("xscan-band", seed), 2);
      const stripe = noise1D(W, u, 2.4, hashSeed("xscan-stripe", seed), 2);
      const frac = clamp(0.08 + 0.6 * drag);
      const th = quantileOf(band.subarray(Math.max(0, c0), Math.min(W, c1)), null, 1 - frac);
      const grain2 = grainMap(W, u, 1.3, hashSeed("xscan-grain2", seed));
      const br = rng(hashSeed("xscan-bands", seed));
      const aMax = W - EDGE * 2.5 * u;
      let bandStart = -1, aS = 0, aE = 0;
      for (let c = Math.max(0, c0 - 2); c < Math.min(W, c1 + 2); c++) {
        const bw = smoothstep(th, th + 0.06, band[c]);
        if (bw <= 0.02) { bandStart = -1; continue; }
        if (bandStart < 0) {
          // a new band: where the head caught the original, and how far it dragged it
          bandStart = c;
          aS = aLo + aLen * clamp((0.86 - 0.36 * drag) * (0.86 + 0.28 * br()), 0.2, 0.94);
          aE = Math.min(aMax, aLo + aLen + (12 + 120 * drag) * u * (0.55 + 0.45 * br()));
        }
        const a0 = Math.round(aS), len = Math.max(1, aE - aS);
        // stripe strength: most columns carry the full smear, a few thin out or skip
        const s = (0.35 + 0.65 * smoothstep(-0.5, 0.05, stripe[c])) * bw;
        const i0 = L.start(c) + a0 * L.stride;
        const v0 = cov[i0] * s;
        const col0 = cIdx ? cIdx[i0] : 0;
        const end = Math.min(W, Math.round(aE + (hash01(c, 3, seed) - 0.5) * 8 * u));
        let i = i0;
        for (let a = a0; a < end; a++, i += L.stride) {
          moved[i] = bw;
          if (v0 <= 0.02) continue;
          const k = (a - a0) / len;                       // 0 at the head … 1 at the end
          const v = v0 * (1 - 0.55 * k * k);
          const g = (grain2[i] - 0.5) * (0.25 + 0.9 * k * k);
          const sv = smoothstep(0.4, 0.5, v + g);
          if (sv > smear[i]) { smear[i] = sv; if (smearCol) smearCol[i] = col0; }
        }
      }
    }

    /* ── 5. composite at W ── */
    const img = ctx2d(out).createImageData(W, W);
    const od = img.data;
    const ink = hexToRgb(p.ink);
    const edgeU = EDGE * u;
    const mis = Math.max(1, Math.round(1.6 * u));
    for (let y = 0, i = 0; y < W; y++) {
      for (let x = 0; x < W; x++, i++) {
        let a = cov[i], fromSmear = false;
        if (smear && moved[i] > 0) {
          // the stretched row replaces whatever was under the head
          const e = Math.min(x, y, W - 1 - x, W - 1 - y);
          const sv = smear[i] * smoothstep(edgeU * 0.6, edgeU * 4, e);
          const m = moved[i];
          const keep = a * (1 - m);
          if (sv >= keep) { a = sv + keep * (1 - sv); fromSmear = sv > a * 0.5; } else a = keep + sv * (1 - keep);
        }
        if (a <= 0.004) continue;
        const j = i * 4;
        if (color) {
          const k = fromSmear ? smearCol[i] : cIdx[i];
          const c = cols[k] || ink;
          // toner grain in the colour too, and the red / blue drums slightly off register
          const gk = 0.9 + 0.1 * grain[i];
          const iR = x >= mis ? i - mis : i, iB = x < W - mis ? i + mis : i;
          const cR = fromSmear || cov[iR] < 0.5 ? c : cols[cIdx[iR]] || c;
          const cB = fromSmear || cov[iB] < 0.5 ? c : cols[cIdx[iB]] || c;
          od[j] = cR[0] * gk; od[j + 1] = c[1] * gk; od[j + 2] = cB[2] * gk;
        } else {
          od[j] = ink[0]; od[j + 1] = ink[1]; od[j + 2] = ink[2];
        }
        od[j + 3] = a * 255 + 0.5;
      }
    }
    const o = ctx2d(out);
    o.putImageData(img, 0, 0);

    /* ── 6. copier marks: drum lines along the feed + toner speckle near the edges ── */
    const mr = rng(hashSeed("xscan-marks", seed));
    const inkHex = color ? "#1A1B1E" : p.ink;
    if (marks > 0.02) {
      const nLines = Math.round(1 + marks * 3.2);
      o.fillStyle = inkHex;
      for (let k = 0; k < nLines; k++) {
        const c = c0 + (c1 - c0) * (0.08 + 0.84 * mr());
        const wpx = Math.max(0.7, (1 + mr() * 1.2) * u);
        o.globalAlpha = (0.14 + 0.16 * mr()) * (0.6 + 0.6 * marks);
        // broken along its length
        const a0 = Math.max(edgeU, aLo - 30 * u), a1 = Math.min(W - edgeU, aLo + aLen + 30 * u);
        for (let a = a0; a < a1;) {
          const seg = (20 + mr() * 120) * u, gap = (2 + mr() * 18) * u;
          const e = Math.min(a1, a + seg);
          const ax = (v) => (p.direction === "up" || p.direction === "left" ? W - v - (e - a) : v);
          if (horiz) o.fillRect(ax(a), c, e - a, wpx);
          else o.fillRect(c, ax(a), wpx, e - a);
          a = e + gap;
        }
      }
      o.globalAlpha = 1;
    }
    // toner speckle: dense right at the edges of the print, thinning out within ~12 units
    {
      const solid = new Float32Array(n);
      for (let i = 0; i < n; i++) solid[i] = cov[i] > 0.5 ? 1 : 0;
      const dist = outsideDistance(solid, W, W, 0.5);
      const pad = 40 * u;
      const x0 = Math.max(edgeU, bb.x0 - pad), x1 = Math.min(W - edgeU, bb.x1 + pad);
      const y0 = Math.max(edgeU, bb.y0 - pad), y1 = Math.min(W - edgeU, bb.y1 + pad);
      const areaU = ((x1 - x0) * (y1 - y0)) / (u * u);
      const tries = Math.round(areaU / 260 * (0.4 + 1.4 * marks) * (0.4 + 1.4 * toner * toner));
      const reach = 8 + 14 * toner;
      o.fillStyle = inkHex;
      o.beginPath();
      for (let k = 0; k < tries; k++) {
        const x = x0 + mr() * (x1 - x0), y = y0 + mr() * (y1 - y0);
        const r = (0.35 + mr() * mr() * 1.4) * u;
        const dd = dist[(y | 0) * W + (x | 0)] / u;
        if (dd <= 0.5) continue;
        if (mr() > 0.85 * Math.exp(-dd / reach) + 0.015) continue;
        o.moveTo(x + r, y);
        o.arc(x, y, Math.max(0.45, r), 0, TAU);
      }
      o.fill();
    }
    return toSize(out, S);
  },
};
