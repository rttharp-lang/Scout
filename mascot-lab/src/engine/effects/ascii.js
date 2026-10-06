// "Type Mosaic" — the logo rebuilt from type on a monospace grid, like a terminal print-out
// of the mascot. Every cell of the grid gets ONE glyph: its ink weight follows the logo's
// coverage and tone under the cell (dense glyphs where the logo is solid and light, light
// glyphs on its edges and dark linework), and its colour is the logo ink underneath (or one
// ink / a two-ink fade). Charsets: the classic density ramp, jersey digits, binary, and
// quadrant blocks (drawn as vector quadrants, so they never depend on a font's coverage).
//
// Structure (after halftone.js):
//   1. the grid is defined in 1024-units (cell = row height, columns at the mono advance
//      0.6 em), centred on the canvas, so a 384 preview and a 2048 export hold the same
//      glyphs in the same cells — dithering is a hash of the cell index, not of pixels;
//   2. ONE pass over the source pixels accumulates coverage / premultiplied colour / peak
//      alpha into a half-cell sub-grid (typed arrays; the quadrants for the block charset);
//   3. glyph ramps are ordered by their MEASURED ink coverage in the font actually used
//      (IBM Plex Mono when loaded, any monospace otherwise), cached per font;
//   4. glyphs are drawn with fillText grouped by colour (one fillStyle per ink).
//   Transparent background, deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, hexToRgb, mix, nearestColorIndex, hashSeed,
  luminance, rgbToHsl, hslToHex,
} from "../core.js";
import { extractPalette } from "../image.js";

const FAMILY = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
const ADV = 0.6;            // mono advance (em) = column width
const LINE = 0.9;           // row height (em): a tight terminal leading so glyph rows knit
const LIFT = 0.085;         // logo-colour mode: inks darker than this (relative luminance) are
                            // lifted to it — a navy key line glows like a screen ink instead
                            // of disappearing into a dark garment or the dark stage
const CHARSETS = {
  density: " .:-=+*#%@",
  numbers: "0123456789",
  binary: "01",
  blocks: null,             // vector quadrants
};
const WEIGHTS = { regular: 500, bold: 600, heavy: 600 };
const JITTER = { density: 0.55, numbers: 2.6, binary: 0.9, blocks: 0 }; // dither, in ramp steps
// digits and binary have nearly equal ink per glyph, so their tone is carried by glyph SIZE
// (a type halftone): light areas print full-size glyphs, dark linework small ones
const SIZED = { numbers: true, binary: true };
const SIZES = [0.5, 0.66, 0.83, 1];
const BAYER2 = [0.12, 0.62, 0.87, 0.37];   // 2×2 ordered-dither thresholds (TL, TR, BL, BR)

/* ───────────────────────────── fonts ───────────────────────────── */

const fontState = new Map(); // weight → Promise<void>
/** Wait (once per weight, ≤ 2.5 s) for IBM Plex Mono; any failure falls back to monospace. */
function fontReady(weight) {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  let pr = fontState.get(weight);
  if (!pr) {
    pr = Promise.race([
      document.fonts.load(`${weight} 20px "IBM Plex Mono"`, "0123456789@#%").catch(() => null),
      new Promise((r) => setTimeout(r, 2500)),
    ]).then(() => undefined);
    fontState.set(weight, pr);
  }
  return pr;
}
const fontLoaded = (weight) => {
  try { return typeof document !== "undefined" && !!document.fonts?.check(`${weight} 20px "IBM Plex Mono"`); } catch { return false; }
};

const rampCache = new Map();
/**
 * Glyphs of a charset ordered by measured ink coverage in the current font (lightest
 * first), plus the cap height (em) used to centre glyphs in their cells.
 */
function measureRamp(chars, weight) {
  const key = `${weight}|${fontLoaded(weight)}|${chars}`;
  let hit = rampCache.get(key);
  if (hit) return hit;
  const P = 64;
  const c = createCanvas(P, P);
  const x = ctx2d(c);
  x.font = `${weight} ${P * 0.8}px ${FAMILY}`;
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  x.fillStyle = "#000";
  const glyphs = [];
  for (const ch of chars) {
    if (ch === " ") continue;
    x.clearRect(0, 0, P, P);
    x.fillText(ch, P / 2, P * 0.75);
    const d = x.getImageData(0, 0, P, P).data;
    let s = 0;
    for (let j = 3; j < d.length; j += 4) s += d[j];
    glyphs.push({ ch, cov: s / 255 / (P * P) });
  }
  // keep the charset's own order for ties (within 4%) so the ramp stays stable
  glyphs.sort((a, b) => (Math.abs(a.cov - b.cov) < 0.004 ? 0 : a.cov - b.cov));
  const m = x.measureText("H");
  const cap = clamp((m.actualBoundingBoxAscent || P * 0.56) / (P * 0.8), 0.5, 0.85);
  hit = { chars: glyphs.map((g) => g.ch), cap };
  rampCache.set(key, hit);
  return hit;
}

/** Raise a very dark ink to luminance ≈ LIFT keeping its hue (neutral blacks → charcoal). */
function liftInk(hex) {
  if (luminance(hex) >= LIFT) return hex;
  const [h, s0, l0] = rgbToHsl(hexToRgb(hex));
  const s = s0 < 0.12 ? s0 * 0.5 : Math.min(1, s0 + 0.12);
  const target = s0 < 0.12 ? LIFT * 0.55 : LIFT;
  let lo = l0, hi = 1;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (luminance(hslToHex(h, s, mid)) < target) lo = mid; else hi = mid;
  }
  return hslToHex(h, s, hi);
}

/* ───────────────────────────── analysis ───────────────────────────── */

/** Cell-index hash → [0, 1) (resolution independent dithering). */
function cellHash(i, j, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ s;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Accumulate the source into a sub-grid of half cells (2·nC × 2·nR): alpha sum, premultiplied
 * RGB sums, pixel counts and peak alpha. One pass over the pixels, typed arrays only.
 */
function accumulate(data, S, x0, y0, colW, rowH, nC, nR) {
  const GX = nC * 2, GY = nR * 2, N = GX * GY;
  const A = new Float32Array(N), R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const cnt = new Float32Array(N), peak = new Float32Array(N);
  const colOf = new Int32Array(S), rowOf = new Int32Array(S);
  const colN = new Float32Array(GX), rowN = new Float32Array(GY);
  const hw = colW / 2, hh = rowH / 2;
  for (let x = 0; x < S; x++) {
    const c = Math.floor((x + 0.5 - x0) / hw);
    colOf[x] = c >= 0 && c < GX ? c : -1;
    if (colOf[x] >= 0) colN[c]++;
  }
  for (let y = 0; y < S; y++) {
    const r = Math.floor((y + 0.5 - y0) / hh);
    rowOf[y] = r >= 0 && r < GY ? r : -1;
    if (rowOf[y] >= 0) rowN[r]++;
  }
  for (let r = 0; r < GY; r++) for (let c = 0; c < GX; c++) cnt[r * GX + c] = rowN[r] * colN[c];
  for (let y = 0; y < S; y++) {
    const r = rowOf[y];
    if (r < 0) continue;
    const base = r * GX;
    for (let x = 0, j = y * S * 4; x < S; x++, j += 4) {
      const a = data[j + 3];
      if (a === 0) continue;
      const c = colOf[x];
      if (c < 0) continue;
      const k = base + c;
      A[k] += a;
      R[k] += data[j] * a; G[k] += data[j + 1] * a; B[k] += data[j + 2] * a;
      if (a > peak[k]) peak[k] = a;
    }
  }
  return { A, R, G, B, cnt, peak, GX, GY };
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "ascii",
  name: "Type Mosaic",
  category: "digital",
  blurb: "Your logo rebuilt from type: ASCII, jersey digits, binary.",
  method: "Screen print",
  stage: "dark",
  params: [
    { key: "cell", label: "Cell size", type: "range", min: 12, max: 44, step: 1, default: 20, unit: "px" },
    {
      key: "charset", label: "Characters", type: "select", default: "density",
      options: [
        { value: "density", label: "ASCII ramp" },
        { value: "numbers", label: "Jersey digits" },
        { value: "binary", label: "Binary" },
        { value: "blocks", label: "Blocks" },
      ],
    },
    {
      key: "color", label: "Color", type: "select", default: "logo",
      options: [
        { value: "logo", label: "Logo colors" },
        { value: "ink", label: "One ink" },
        { value: "fade", label: "Two-ink fade" },
      ],
    },
    { key: "ink", label: "Ink", type: "color", default: "secondary" },
    { key: "ink2", label: "Fade to", type: "color", default: "accent" },
    {
      key: "weight", label: "Weight", type: "select", default: "heavy",
      options: [
        { value: "regular", label: "Regular" },
        { value: "bold", label: "Bold" },
        { value: "heavy", label: "Heavy" },
      ],
    },
  ],
  presets: [
    { name: "ASCII", params: { cell: 20, charset: "density", color: "logo", weight: "heavy" } },
    { name: "Jersey numbers", params: { cell: 24, charset: "numbers", color: "logo", weight: "heavy" } },
    { name: "Binary", params: { cell: 18, charset: "binary", color: "fade", ink: "secondary", ink2: "accent", weight: "bold" } },
    { name: "Blocks", params: { cell: 22, charset: "blocks", color: "logo", weight: "bold" } },
  ],

  async render(src, p, ctx) {
    const S = src.width;
    const blocks = p.charset === "blocks";
    const weight = WEIGHTS[p.weight] || 600;
    if (!blocks) await fontReady(weight);

    const f = Math.max(3, p.cell * ctx.scale);   // font size
    const rowH = f * LINE, colW = f * ADV;
    const nC = 2 * Math.ceil(S / 2 / colW), nR = 2 * Math.ceil(S / 2 / rowH);
    const x0 = S / 2 - (nC / 2) * colW, y0 = S / 2 - (nR / 2) * rowH;

    const { data } = getPixels(src);
    const acc = accumulate(data, S, x0, y0, colW, rowH, nC, nR);
    const { A, R, G, B, cnt, peak, GX } = acc;

    // the logo's inks: logo-colour mode snaps every cell to one of them (flat screen inks)
    const pal = extractPalette(resizeCanvas(src, Math.min(S, 256)), 7, { maxSamples: 9000 }).filter((c) => c.weight >= 0.015);
    const inks = pal.length ? pal.map((c) => c.hex) : ["#FFFFFF"];
    const inkRGB = inks.map(hexToRgb);
    const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    let lmin = 1, lmax = 0;
    pal.forEach((c, i) => {
      if (c.weight < 0.04) return;
      const L = lum(...inkRGB[i]);
      lmin = Math.min(lmin, L); lmax = Math.max(lmax, L);
    });
    const lspan = lmax - lmin;

    const seedH = hashSeed("ascii", ctx.seed) | 0;
    const mode = p.color;
    // tone: coverage (lifted so line art and edges still print) × tone of the ink under the
    // cell, so dark linework reads as lighter glyphs inside dense light areas
    const base = mode === "logo" ? 0.42 : 0.12;
    const gam = mode === "logo" ? 0.8 : 1.35;   // one ink: tone is all there is, so push contrast
    const toneOf = (a, pk, r, g, b) => {
      const cov = Math.max(a, 0.6 * pk);
      const ln = lspan > 0.15 ? clamp((lum(r, g, b) - lmin) / lspan) : 1;
      return cov * (base + (1 - base) * Math.pow(ln, gam));
    };

    // colour index of a cell
    const fadeN = 24;
    const fadeCols = [];
    if (mode === "fade") for (let k = 0; k < fadeN; k++) fadeCols.push(mix(p.ink, p.ink2, k / (fadeN - 1)));
    // vertical extent of the artwork for the fade
    let ry0 = nR, ry1 = -1;
    for (let r = 0; r < acc.GY; r++) {
      for (let c = 0; c < GX; c++) if (A[r * GX + c] > 0) { if (r / 2 < ry0) ry0 = r / 2; ry1 = r / 2; break; }
    }
    const colors = mode === "logo" ? inks.map(liftInk) : mode === "ink" ? [p.ink] : fadeCols;
    const snap = new Int16Array(32768).fill(-1);
    const colorIndex = (j, r, g, b) => {
      if (mode === "ink") return 0;
      if (mode === "fade") return Math.round(clamp((j - ry0) / Math.max(1, ry1 - ry0)) * (fadeN - 1));
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let k = snap[key];
      if (k < 0) k = snap[key] = nearestColorIndex(r, g, b, inkRGB);
      return k;
    };

    const out = createCanvas(S, S);
    const o = ctx2d(out);

    if (blocks) {
      // quadrant blocks: each half-cell is on/off; drawn as one Path2D per ink
      const paths = colors.map(() => new Path2D());
      const gap = { regular: 0.16, bold: 0.08, heavy: 0 }[p.weight] ?? 0.08;
      const gx = colW * gap * 0.5, gy = rowH * gap * 0.5;
      for (let j = 0; j < nR; j++) {
        for (let i = 0; i < nC; i++) {
          const k00 = (2 * j) * GX + 2 * i;
          const ks = [k00, k00 + 1, k00 + GX, k00 + GX + 1];
          let a = 0, rr = 0, gg = 0, bb = 0, n = 0;
          for (const k of ks) { a += A[k]; rr += R[k]; gg += G[k]; bb += B[k]; n += cnt[k]; }
          if (a <= 0) continue;
          const r = rr / a, g = gg / a, b = bb / a;
          const ln = mode === "logo" ? 1 : (lspan > 0.15 ? clamp((lum(r, g, b) - lmin) / lspan) : 1);
          const lf = mode === "logo" ? 1 : 0.35 + 0.65 * ln;
          // quadrant k is inked when its coverage × tone clears an ordered-dither threshold:
          // tone steps through ▘ → ▚ / ▞ → ▙ → █ as a regular pattern (never random speckle);
          // alternate rows mirror the pattern so ▚ and ▞ interleave into a woven texture
          const flip = j & 1;
          let bits = 0;
          for (let q = 0; q < 4; q++) {
            const k = ks[q];
            const cov = cnt[k] > 0 ? Math.max(A[k] / 255 / cnt[k], 0.6 * peak[k] / 255) : 0;
            const qx = (q & 1) ^ flip, qy = q >> 1;
            const thr = BAYER2[qy * 2 + qx];
            if (cov * lf > thr) bits |= 1 << q;
          }
          if (!bits) continue;
          const path = paths[colorIndex(j, r, g, b)];
          const cx = x0 + i * colW, cy = y0 + j * rowH;
          const hw = colW / 2, hh = rowH / 2;
          // merge quadrants into rectangles: full rows / columns first
          const add = (qx, qy, w, hgt) => path.rect(cx + qx * hw + gx * (qx === 0 ? 1 : 0), cy + qy * hh + gy * (qy === 0 ? 1 : 0),
            w * hw - gx * ((qx === 0 ? 1 : 0) + (qx + w === 2 ? 1 : 0)), hgt * hh - gy * ((qy === 0 ? 1 : 0) + (qy + hgt === 2 ? 1 : 0)));
          if (bits === 15) { add(0, 0, 2, 2); continue; }
          if ((bits & 3) === 3) { add(0, 0, 2, 1); bits &= ~3; }
          if ((bits & 12) === 12) { add(0, 1, 2, 1); bits &= ~12; }
          for (let q = 0; q < 4; q++) if (bits & (1 << q)) add(q & 1, q >> 1, 1, 1);
        }
      }
      for (let c = 0; c < colors.length; c++) { o.fillStyle = colors[c]; o.fill(paths[c]); }
      return out;
    }

    const ramp = measureRamp(CHARSETS[p.charset] || CHARSETS.density, weight);
    const glyphs = ramp.chars, ng = glyphs.length;
    const jit = JITTER[p.charset] ?? 0.5;
    const sized = !!SIZED[p.charset];
    const nS = sized ? SIZES.length : 1;
    const groups = [];                    // per ink × size: flat [x, y, glyphIndex, …]
    for (let k = 0; k < colors.length * nS; k++) groups.push([]);
    for (let j = 0; j < nR; j++) {
      for (let i = 0; i < nC; i++) {
        const k00 = (2 * j) * GX + 2 * i;
        const a = A[k00] + A[k00 + 1] + A[k00 + GX] + A[k00 + GX + 1];
        if (a <= 0) continue;
        const n = cnt[k00] + cnt[k00 + 1] + cnt[k00 + GX] + cnt[k00 + GX + 1];
        const pk = Math.max(peak[k00], peak[k00 + 1], peak[k00 + GX], peak[k00 + GX + 1]) / 255;
        const r = (R[k00] + R[k00 + 1] + R[k00 + GX] + R[k00 + GX + 1]) / a;
        const g = (G[k00] + G[k00 + 1] + G[k00 + GX] + G[k00 + GX + 1]) / a;
        const b = (B[k00] + B[k00 + 1] + B[k00 + GX] + B[k00 + GX + 1]) / a;
        const t = toneOf(a / 255 / n, pk, r, g, b);
        if (t < 0.07) continue;
        const h = cellHash(i, j, seedH);
        // tone → ramp position (lightest glyph at t≈0.1, densest at t≈0.9), dithered by cell
        const pos = clamp((t - 0.08) / 0.8) * (ng - 1) + (h - 0.5) * jit;
        const gi = Math.max(0, Math.min(ng - 1, Math.round(pos)));
        const si = sized ? Math.max(0, Math.min(nS - 1, Math.round(clamp((t - 0.1) / 0.72) * (nS - 1)))) : 0;
        groups[colorIndex(j, r, g, b) * nS + si].push(x0 + (i + 0.5) * colW, y0 + (j + 0.5) * rowH, gi);
      }
    }
    o.textAlign = "center";
    o.textBaseline = "alphabetic";
    const heavy = p.weight === "heavy";
    if (heavy) o.lineJoin = "round";
    for (let si = 0; si < nS; si++) {
      const fs = f * (sized ? SIZES[si] : 1);
      o.font = `${weight} ${fs.toFixed(2)}px ${FAMILY}`;
      if (heavy) o.lineWidth = fs * 0.05;
      const dy = (ramp.cap * fs) / 2;
      for (let c = 0; c < colors.length; c++) {
        const gr = groups[c * nS + si];
        if (!gr.length) continue;
        o.fillStyle = colors[c];
        if (heavy) o.strokeStyle = colors[c];
        for (let q = 0; q < gr.length; q += 3) {
          const ch = glyphs[gr[q + 2]];
          o.fillText(ch, gr[q], gr[q + 1] + dy);
          if (heavy) o.strokeText(ch, gr[q], gr[q + 1] + dy);
        }
      }
    }
    return out;
  },
};
