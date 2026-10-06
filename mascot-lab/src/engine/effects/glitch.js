// "Glitch" — datamosh / broken-signal look. Every edge of the logo picks up a two-colour
// chromatic split (bright fringes on both sides, internal edges included), seeded horizontal
// slices tear sideways with a stronger split inside them, a few slices drop to a single
// channel, macro-block corruption and pixel-sort streaks bleed out of the artwork, and CRT
// scanlines are cut into the ink so the garment shows through.
//
// Structure:
//   1. one getImageData of the source, a luma plane, per-row art extents (all typed arrays);
//   2. the slice layout is generated in artwork-relative units from rng(seed), so a 384
//      preview and a 2048 export tear in the same places;
//   3. a single compose pass at S does the split, the fringes and the slices;
//   4. corruption (blocks, streaks, grain) and scanlines are written into the same buffer,
//      then one putImageData. Transparent background; nothing leaves the canvas.
import {
  createCanvas, ctx2d, getPixels, rng, hashSeed, makeNoise2D, clamp, hexToRgb, rgbToHsl, hslToRgb, rgbToHex,
} from "../core.js";

// fringe pairs: [left ghost, right ghost]
const PAIRS = {
  rgb: ["#FF2B4A", "#00E0FF"],
  vapor: ["#FF3FD2", "#29F0FF"],
};

/* ───────────────────────────── colours ───────────────────────────── */

/** A team colour pushed bright enough to read as a light fringe on dark and mid fabrics. */
function lift(hex) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.18) return l < 0.6 ? "#E9EDF2" : hex;          // greys/black → near-white fringe
  return rgbToHex(...hslToRgb(h, Math.max(s, 0.75), clamp(l, 0.5, 0.66)));
}

/** Two fringe colours from the team palette: the two most saturated inks, lifted. */
function teamPair(pal) {
  const cands = [pal.primary, pal.secondary, pal.accent].filter(Boolean).map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    return { hex, h, s: s * (1 - Math.abs(l - 0.5) * 0.8), l };
  });
  cands.sort((a, b) => b.s - a.s);
  const a = cands[0];
  let b = cands.find((c) => c !== a && c.s > 0.12 && Math.min(Math.abs(c.h - a.h), 360 - Math.abs(c.h - a.h)) > 35);
  const A = lift(a ? a.hex : "#FF2B4A");
  let B = b ? lift(b.hex) : "#E9EDF2";
  if (B === A) B = "#8A929C";            // black-and-white teams: a white / steel split
  return [A, B];
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "glitch",
  name: "Glitch",
  category: "digital",
  blurb: "Broken-signal datamosh: RGB split, torn slices, scanlines.",
  method: "Sublimation",
  stage: "dark",
  params: [
    { key: "split", label: "RGB split", type: "range", min: 0, max: 40, step: 1, default: 12, unit: "px" },
    { key: "slices", label: "Slices", type: "range", min: 0, max: 24, step: 1, default: 12 },
    { key: "shift", label: "Slice shift", type: "range", min: 0, max: 120, step: 1, default: 44, unit: "px" },
    {
      key: "colors", label: "Split colors", type: "select", default: "rgb",
      options: [
        { value: "rgb", label: "RGB" },
        { value: "vapor", label: "Vapor" },
        { value: "team", label: "Team colors" },
      ],
    },
    { key: "scanlines", label: "Scanlines", type: "toggle", default: true },
    { key: "noise", label: "Corruption", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
  ],
  presets: [
    { name: "VHS", params: { split: 12, slices: 12, shift: 44, colors: "rgb", scanlines: true, noise: 40 } },
    { name: "Datamosh", params: { split: 18, slices: 14, shift: 100, colors: "vapor", scanlines: false, noise: 90 } },
    { name: "Team split", params: { split: 16, slices: 7, shift: 36, colors: "team", scanlines: true, noise: 20 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const n = S * S;
    const R = rng(hashSeed("glitch", ctx.seed));
    const sd = getPixels(src).data;
    const noiseAmt = p.noise / 100;

    // luma plane + per-row art extents
    const lum = new Uint8Array(n);
    const rowMin = new Int32Array(S).fill(S), rowMax = new Int32Array(S).fill(-1);
    let bx0 = S, by0 = S, bx1 = -1, by1 = -1;
    for (let y = 0; y < S; y++) {
      const row = y * S;
      for (let x = 0; x < S; x++) {
        const i = row + x, j = i * 4;
        const a = sd[j + 3];
        if (!a) continue;
        lum[i] = (sd[j] * 54 + sd[j + 1] * 183 + sd[j + 2] * 19) >> 8;
        if (a > 24) {
          if (x < rowMin[y]) rowMin[y] = x;
          if (x > rowMax[y]) rowMax[y] = x;
        }
      }
      if (rowMax[y] >= 0) {
        if (y < by0) by0 = y;
        by1 = y;
        if (rowMin[y] < bx0) bx0 = rowMin[y];
        if (rowMax[y] > bx1) bx1 = rowMax[y];
      }
    }
    const out = createCanvas(S, S);
    if (bx1 < 0) return out;
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const pad = Math.max(2, Math.round(6 * sc));

    // fringe colours
    const pair = p.colors === "team" ? teamPair(ctx.palette) : PAIRS[p.colors] || PAIRS.rgb;
    const [F1r, F1g, F1b] = hexToRgb(pair[0]);
    const [F2r, F2g, F2b] = hexToRgb(pair[1]);

    /* ── slice layout (artwork-relative, so every size tears identically) ── */
    const split = Math.round(p.split * sc);
    const rowShift = new Int32Array(S);
    const rowSplit = new Int32Array(S).fill(split);
    const rowMode = new Uint8Array(S);      // 0 normal, 1/2 = single-channel slice in F1/F2
    // short artwork (wordmarks) gets proportionally fewer slices so it stays legible
    const tall = clamp(bh / (0.55 * S), 0.35, 1);
    const nSlices = Math.round(p.slices * tall);
    const span = (a, b) => [Math.max(0, Math.floor(a)), Math.min(S - 1, Math.ceil(b))];
    const bandExtent = (y0, y1) => {
      let lo = S, hi = -1;
      for (let y = y0; y <= y1; y++) if (rowMax[y] >= 0) { if (rowMin[y] < lo) lo = rowMin[y]; if (rowMax[y] > hi) hi = rowMax[y]; }
      return [lo, hi];
    };
    // a few decisive tears (major) and a scatter of thin slivers around them (minor)
    const nMajor = nSlices ? Math.min(4, Math.max(1, Math.round(nSlices / 5))) : 0;
    const majors = [];
    const addBand = (yc, hPx, dx, s, drop) => {
      const [y0, y1] = span(yc - hPx / 2, yc + hPx / 2);
      const [lo, hi] = bandExtent(y0, y1);
      if (hi >= 0) dx = clamp(dx, pad + s - lo, S - 1 - pad - s - hi);
      dx = Math.round(dx);
      for (let y = y0; y <= y1; y++) { rowShift[y] = dx; rowSplit[y] = s; rowMode[y] = drop; }
    };
    for (let k = 0; k < nMajor; k++) {
      const hPx = clamp((0.05 + 0.07 * R()) * bh, 10 * sc, 80 * sc);
      const yc = by0 + ((k + 0.15 + 0.7 * R()) / nMajor) * bh;
      const dx = (R() < 0.5 ? -1 : 1) * (0.55 + 0.45 * R()) * p.shift * sc;
      majors.push(yc);
      addBand(yc, hPx, dx, Math.round(split * (1.6 + 0.8 * R())), 0);
    }
    for (let k = nMajor; k < nSlices; k++) {
      const hPx = Math.max(1, (2 + R() * R() * 14) * sc);
      const near = majors.length && R() < 0.7;
      const yc = near ? majors[k % majors.length] + (R() - 0.5) * 0.24 * bh : by0 + (0.04 + 0.92 * R()) * bh;
      const dx = (R() < 0.5 ? -1 : 1) * (0.08 + 0.6 * R()) * p.shift * sc;
      const drop = R() < 0.1 + 0.3 * noiseAmt ? (R() < 0.5 ? 1 : 2) : 0;
      addBand(yc, hPx, dx, Math.round(split * (1 + R())), drop);
    }
    // VHS tracking: a band low in the frame where rows wobble sideways
    if (p.scanlines && nSlices > 0) {
      const th = Math.max(6 * sc, 0.07 * bh);
      const ty0 = Math.round(by0 + (0.62 + 0.2 * R()) * bh - th / 2);
      const amp = (3 + 4 * R()) * sc * (0.5 + p.shift / 120);
      const ph = R() * 6.28;
      for (let y = Math.max(0, ty0); y < Math.min(S, ty0 + th); y++) {
        const t = (y - ty0) / th;
        const w = Math.round(Math.sin(t * Math.PI) * Math.sin(ph + t * 9.4) * amp);
        if (rowMax[y] < 0) continue;
        rowShift[y] = clamp(rowShift[y] + w, pad + rowSplit[y] - rowMin[y], S - 1 - pad - rowSplit[y] - rowMax[y]);
      }
    }
    // keep the un-sliced rows' fringes inside the canvas too
    for (let y = 0; y < S; y++) {
      if (rowMax[y] < 0) continue;
      const maxS = Math.max(0, Math.min(rowMin[y] - pad, S - 1 - pad - rowMax[y]));
      if (rowShift[y] === 0 && rowSplit[y] > maxS) rowSplit[y] = maxS;
    }

    /* ── compose: split + fringes + slices ── */
    const img = ctx2d(out).createImageData(S, S);
    const od = img.data;
    const K = 1.1 / (255 * 255);   // internal fringe gain (luma step × alpha)
    const FMAX = 0.72;             // internal fringes tint, never replace, the linework
    const GH = 0.92;               // ghost opacity
    for (let y = 0; y < S; y++) {
      const sh = rowShift[y], s = rowSplit[y], mode = rowMode[y];
      const si = Math.max(1, Math.round(s * 0.5)); // internal fringes stay thinner than the ghosts
      const row = y * S;
      // skip rows the slices and ghosts can't reach
      let xa = 0, xb = S - 1;
      if (rowMax[y] < 0) continue;
      xa = Math.max(0, rowMin[y] + sh - s - 1); xb = Math.min(S - 1, rowMax[y] + sh + s + 1);
      for (let x = xa; x <= xb; x++) {
        const xc = x - sh;
        let ca = 0, cr = 0, cg = 0, cb = 0, cl = 0;
        if (xc >= 0 && xc < S) {
          const j = (row + xc) * 4;
          ca = sd[j + 3];
          if (ca) { cr = sd[j]; cg = sd[j + 1]; cb = sd[j + 2]; cl = lum[row + xc]; }
        }
        const xl = xc + s, xr = xc - s;
        const la = xl >= 0 && xl < S ? sd[(row + xl) * 4 + 3] : 0;
        const ra = xr >= 0 && xr < S ? sd[(row + xr) * 4 + 3] : 0;
        if (!ca && !la && !ra) continue;
        // ghosts: additive, premultiplied
        const g1 = (la / 255) * GH, g2 = (ra / 255) * GH;
        let ga = g1 + g2;
        if (ga > 1) ga = 1;
        let gr = F1r * g1 + F2r * g2, gg = F1g * g1 + F2g * g2, gb = F1b * g1 + F2b * g2;
        const gmax = 255 * ga;
        if (gr > gmax) gr = gmax;
        if (gg > gmax) gg = gmax;
        if (gb > gmax) gb = gmax;
        // main art with internal fringes
        const a = ca / 255;
        if (a > 0) {
          if (mode) {
            // single-channel slice: the art as a duotone in that fringe colour
            const t = cl / 255;
            const fr = mode === 1 ? F1r : F2r, fg = mode === 1 ? F1g : F2g, fb = mode === 1 ? F1b : F2b;
            const k = 0.35 + 0.65 * t;
            cr = fr * k + 255 * t * t * 0.35; cg = fg * k + 255 * t * t * 0.35; cb = fb * k + 255 * t * t * 0.35;
          } else {
            const il = xc + si, ir = xc - si;
            const ila = il < S ? sd[(row + il) * 4 + 3] : 0;
            const ira = ir >= 0 ? sd[(row + ir) * 4 + 3] : 0;
            if (ila) {
              const d = (lum[row + il] - cl) * ila * K;
              if (d > 0) { const t = d > FMAX ? FMAX : d; cr += (F1r - cr) * t; cg += (F1g - cg) * t; cb += (F1b - cb) * t; }
            }
            if (ira) {
              const d = (lum[row + ir] - cl) * ira * K;
              if (d > 0) { const t = d > FMAX ? FMAX : d; cr += (F2r - cr) * t; cg += (F2g - cg) * t; cb += (F2b - cb) * t; }
            }
          }
        }
        const oa = a + ga * (1 - a);
        const inv = 1 / oa;
        const o = (row + x) * 4;
        od[o] = (cr * a + gr * (1 - a)) * inv;
        od[o + 1] = (cg * a + gg * (1 - a)) * inv;
        od[o + 2] = (cb * a + gb * (1 - a)) * inv;
        od[o + 3] = oa * 255 + 0.5;
      }
    }

    /* ── corruption: runs of macro-blocks on the codec grid, holding motion-shifted,
          blocky (and sometimes chroma-shifted) content inside the artwork's silhouette ── */
    const snap = od.slice();
    const MB = Math.max(4, Math.round(16 * sc));        // macro-block
    const q = Math.max(2, MB >> 1);                     // its blocky sub-cells
    const nRuns = Math.round(noiseAmt * 5 * tall);
    for (let k = 0; k < nRuns; k++) {
      const len = 2 + Math.floor(R() * 5);
      const gy = Math.floor((by0 + R() * bh) / MB) * MB;
      const gx = Math.floor((bx0 + R() * Math.max(1, bw - len * MB)) / MB) * MB;
      const mvx = Math.round((R() - 0.5) * 4) * q, mvy = Math.round((R() - 0.5) * 2) * q;
      const tint = R() < 0.4 ? (R() < 0.5 ? 1 : 2) : 0;
      const tr = tint === 1 ? F1r : F2r, tg = tint === 1 ? F1g : F2g, tb = tint === 1 ? F1b : F2b;
      for (let blk = 0; blk < len; blk++) {
        if (R() < 0.25) continue;                       // ragged runs
        const blocky = R() < 0.65;
        const x0 = gx + blk * MB;
        for (let yy = 0; yy < MB; yy++) {
          const ty = gy + yy;
          if (ty < 0 || ty >= S) continue;
          for (let xx = 0; xx < MB; xx++) {
            const tx = x0 + xx;
            if (tx < 0 || tx >= S) continue;
            const tj = (ty * S + tx) * 4;
            if (snap[tj + 3] < 8) continue;             // keep the silhouette
            let sx = tx + mvx, sy = ty + mvy;
            if (blocky) { sx = Math.floor(sx / q) * q + (q >> 1); sy = Math.floor(sy / q) * q + (q >> 1); }
            sx = clamp(sx, 0, S - 1); sy = clamp(sy, 0, S - 1);
            let fj = (sy * S + sx) * 4;
            if (snap[fj + 3] < 128) fj = tj;            // nothing to borrow: own pixels
            let r = snap[fj], g = snap[fj + 1], b = snap[fj + 2];
            if (tint) { r += (tr - r) * 0.55; g += (tg - g) * 0.55; b += (tb - b) * 0.55; }
            od[tj] = r; od[tj + 1] = g; od[tj + 2] = b;
          }
        }
      }
    }

    /* ── pixel-sort streaks: rows of the art sorted by brightness and dragged out ── */
    const nStreaks = Math.round(noiseAmt * 5 * tall);
    const nz = makeNoise2D(hashSeed("glitch-streak", ctx.seed));
    const runR = new Uint8Array(S), runG = new Uint8Array(S), runB = new Uint8Array(S), runA = new Uint8Array(S);
    const order = new Uint16Array(S), keys = new Float64Array(S);
    for (let k = 0; k < nStreaks; k++) {
      const hPx = Math.min((8 + R() * 34) * sc, 0.12 * bh);
      const yc = by0 + (0.15 + 0.7 * R()) * bh;
      const dir = R() < 0.5 ? -1 : 1;
      const len = (60 + R() * 120) * sc * (0.5 + noiseAmt);
      const [y0, y1] = span(yc - hPx / 2, yc + hPx / 2);
      for (let y = y0; y <= y1; y++) {
        // find the art in this (already composed) row
        let lo = -1, hi = -1;
        const row = y * S;
        for (let x = 0; x < S; x++) if (od[(row + x) * 4 + 3] > 160) { if (lo < 0) lo = x; hi = x; }
        if (lo < 0) continue;
        const v = 0.5 + 0.5 * nz(y / (6 * sc), k * 7.3);
        const run = Math.round(Math.min((hi - lo) * 0.3, (30 + 90 * v) * sc));
        if (run < 2) continue;
        // sort a run that ends at the art's edge, then drag its last pixel outward
        const a0 = dir > 0 ? hi - run : lo, a1 = dir > 0 ? hi : lo + run;
        let m = 0;
        for (let x = a0; x <= a1; x++, m++) {
          const j = (row + x) * 4;
          runR[m] = od[j]; runG[m] = od[j + 1]; runB[m] = od[j + 2]; runA[m] = od[j + 3];
          order[m] = m;
          keys[m] = runA[m] < 128 ? -1 : runR[m] * 0.3 + runG[m] * 0.59 + runB[m] * 0.11;
        }
        const ord = Array.from(order.subarray(0, m)).sort((u, w) => (dir > 0 ? keys[u] - keys[w] : keys[w] - keys[u]));
        for (let t = 0; t < m; t++) {
          const s = ord[t], j = (row + a0 + t) * 4;
          if (runA[s] < 128) continue;
          od[j] = runR[s]; od[j + 1] = runG[s]; od[j + 2] = runB[s]; od[j + 3] = runA[s];
        }
        const edge = dir > 0 ? hi : lo;
        const ej = (row + edge) * 4;
        const L = Math.round(len * (0.25 + 0.75 * (0.5 + 0.5 * nz(y / (3 * sc), 40 + k))));
        for (let t = 1; t <= L; t++) {
          const x = edge + dir * t;
          if (x < pad || x >= S - pad) break;
          const j = (row + x) * 4;
          const fade = 1 - t / (L + 1);
          const al = od[ej + 3] * (0.35 + 0.65 * fade);
          if (al <= od[j + 3]) continue;
          od[j] = od[ej]; od[j + 1] = od[ej + 1]; od[j + 2] = od[ej + 2]; od[j + 3] = al;
        }
      }
    }

    /* ── grain + scanlines ── */
    const grain = noiseAmt * 26;
    const g = Math.max(1, Math.round(1.5 * sc));
    const pitch = Math.max(3, Math.round(7 * sc));
    const gap = Math.max(1, Math.round(pitch * 0.3));
    const seedMix = hashSeed("glitch-grain", ctx.seed) | 0;
    for (let y = 0; y < S; y++) {
      const scan = p.scanlines && y % pitch < gap;
      const gy = (y / g) | 0;
      const row = y * S;
      for (let x = 0; x < S; x++) {
        const j = (row + x) * 4;
        if (!od[j + 3]) continue;
        if (grain > 0) {
          let h = Math.imul(((x / g) | 0) ^ seedMix, 0x27d4eb2d) ^ Math.imul(gy, 0x165667b1);
          h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
          const v = ((h & 1023) / 1023 - 0.5) * grain;
          od[j] += v; od[j + 1] += v; od[j + 2] += v;
        }
        if (scan) od[j + 3] *= 0.5;
      }
    }
    ctx2d(out).putImageData(img, 0, 0);
    return out;
  },
};
