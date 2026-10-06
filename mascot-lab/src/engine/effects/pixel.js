// "8-Bit" — the logo redrawn as pixel art on a clean grid: every cell takes ONE colour
// from a small palette (the logo's own inks minus anti-aliasing blends, the team colours +
// black + white, or a 4-shade handheld ramp). Dark key lines win ties so outlines, pupils
// and teeth stay readable; hairlines are rescued from the cell centre and cleaned to
// pixel-perfect (no L-elbows); 1–2 cell specks that are fragments of detail lost on the
// grid merge into their surroundings while compact features (pupils, collar spikes)
// stay — the way a pixel artist would clean it up. An optional 1-cell outline wraps the
// sprite; optional dither = ordered dither on real gradients + retro shading (a shadow
// row and a 50% checker row on the lower-right of big flat areas). Cells are drawn as
// crisp squares, LED dots on a dark stepped board (reads on any fabric) or ironed beads.
//
// Structure (after halftone.js):
//   1. the grid is G cells across the canvas at every size (G = 1024 / pixel size, denser
//      for short wordmarks), so a 384 preview and a 2048 export are the same sprite;
//   2. cell statistics come from one resample of the source at ≥4×4 samples per cell;
//   3. all decisions run on G×G typed arrays; drawing is one Path2D per ink — filled flat
//      (squares) or with that ink's dot / bead sprite as a cell-sized pattern.
//      Transparent background; no randomness (seed-independent).
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, hexToRgb, rgbToHex, rgbToHsl, hslToRgb,
  nearestColorIndex, mix, normalizeHex, blurCanvas,
} from "../core.js";
import { extractPalette } from "../image.js";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const BOARD = "#111317";              // LED board backing
const SHADE_EDGES = [0.18, 0.44, 0.74];   // luma boundaries of the 4-shade ramp
const lumOf = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/* ───────────────────────────── palettes ───────────────────────────── */

/** dedupe colours closer than `tol` (weighted RGB distance²) — keeps the first. */
function dedupe(list, tol = 900) {
  const out = [];
  for (const hex of list) {
    const c = hexToRgb(hex);
    if (out.some((o) => { const q = hexToRgb(o); return (c[0] - q[0]) ** 2 * 2 + (c[1] - q[1]) ** 2 * 4 + (c[2] - q[2]) ** 2 * 3 < tol; })) continue;
    out.push(hex);
  }
  return out;
}

function paletteFor(mode, small, pal) {
  if (mode === "team") {
    // team inks + black + white, and one light tint of the primary for shading
    return dedupe([pal.dark, pal.primary, pal.secondary, pal.accent, "#FFFFFF", mix(pal.primary, pal.light, 0.78)].map(normalizeHex).filter(Boolean), 1400);
  }
  if (mode === "shades") {
    // a handheld-console ramp in the team's main hue (primary, or the most colourful team
    // ink when the primary is black/grey; a neutral ramp for black-and-white teams)
    const inks = [pal.primary, pal.secondary, pal.accent].map((hex) => rgbToHsl(...hexToRgb(hex)));
    let pick = inks[0];
    if (pick[1] < 0.15) pick = inks.reduce((a, b) => (b[1] > a[1] ? b : a), inks[0]);
    const h = pick[0];
    const sat = pick[1] < 0.15 ? 0.04 : clamp(pick[1], 0.35, 0.8);
    return [[h, sat, 0.1], [h, sat * 0.9, 0.3], [h, sat * 0.8, 0.58], [h, sat * 0.6, 0.86]].map(([hh, ss, ll]) => rgbToHex(...hslToRgb(hh, ss, ll)));
  }
  const ext = extractPalette(small, 8, { maxSamples: 8000 }).filter((c) => c.weight >= 0.012);
  // drop minor colours that are just the anti-aliased blend of two bigger inks
  const keep = ext.filter((c) => {
    if (c.weight >= 0.12) return true;
    const q = hexToRgb(c.hex);
    for (const a of ext) for (const b of ext) {
      if (a === b || a === c || b === c || a.weight < c.weight || b.weight < c.weight) continue;
      const A = hexToRgb(a.hex), B = hexToRgb(b.hex);
      const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
      const t = ((q[0] - A[0]) * d[0] + (q[1] - A[1]) * d[1] + (q[2] - A[2]) * d[2]) / len2;
      if (t < 0.12 || t > 0.88) continue;
      const e = Math.hypot(A[0] + d[0] * t - q[0], A[1] + d[1] * t - q[1], A[2] + d[2] * t - q[2]);
      if (e < 42) return false;
    }
    return true;
  });
  const list = dedupe(keep.map((c) => c.hex), 1100);
  return list.length ? list : [pal.primary];
}

/* ───────────────────────────── sprites ───────────────────────────── */

/** One cell's worth of LED / bead, pre-rendered at size c (px) for a colour. */
function cellSprite(shape, hex, c, unlit = false) {
  const n = Math.max(2, Math.ceil(c));
  const cv = createCanvas(n, n);
  const x = ctx2d(cv);
  const m = n / 2;
  const [r, g, b] = hexToRgb(hex);
  const L = lumOf([r, g, b]);
  const lighter = (k) => `rgb(${r + (255 - r) * k | 0},${g + (255 - g) * k | 0},${b + (255 - b) * k | 0})`;
  const darker = (k) => `rgb(${r * (1 - k) | 0},${g * (1 - k) | 0},${b * (1 - k) | 0})`;
  if (shape === "led") {
    const rad = n * 0.42;
    if (unlit) {
      x.fillStyle = hex;
      x.beginPath(); x.arc(m, m, n * 0.3, 0, Math.PI * 2); x.fill();
      return cv;
    }
    const gr = x.createRadialGradient(m - rad * 0.25, m - rad * 0.3, rad * 0.05, m, m, rad);
    gr.addColorStop(0, lighter(0.7));
    gr.addColorStop(0.5, lighter(0.12));
    gr.addColorStop(1, darker(L > 0.5 ? 0.12 : 0.04));
    x.fillStyle = gr;
    x.beginPath(); x.arc(m, m, rad, 0, Math.PI * 2); x.fill();
    return cv;
  }
  // bead: fused ring with a hole, lit from the top left
  const ro = n * 0.5, ri = n * 0.11;
  const gr = x.createLinearGradient(0, 0, n, n);
  gr.addColorStop(0, lighter(0.22));
  gr.addColorStop(0.55, hex);
  gr.addColorStop(1, darker(0.16));
  x.fillStyle = gr;
  x.beginPath(); x.arc(m, m, ro, 0, Math.PI * 2); x.arc(m, m, ri, 0, Math.PI * 2, true); x.fill("evenodd");
  // inner lip shadow + rim highlight
  x.lineWidth = Math.max(0.6, n * 0.05);
  x.strokeStyle = darker(0.35);
  x.beginPath(); x.arc(m, m, ri + x.lineWidth / 2, Math.PI * 1.0, Math.PI * 1.75); x.stroke();
  x.strokeStyle = lighter(0.45);
  x.beginPath(); x.arc(m, m, ro - x.lineWidth, Math.PI * 1.05, Math.PI * 1.55); x.stroke();
  return cv;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "pixel",
  name: "8-Bit",
  category: "digital",
  blurb: "Your mascot as crisp pixel art, LED board or perler beads.",
  method: "Heat transfer",
  stage: "dark",
  params: [
    { key: "size", label: "Pixel size", type: "range", min: 8, max: 40, step: 1, default: 14, unit: "px" },
    {
      key: "palette", label: "Palette", type: "select", default: "logo",
      options: [
        { value: "logo", label: "Logo colors" },
        { value: "team", label: "Team colors" },
        { value: "shades", label: "4-shade" },
      ],
    },
    {
      key: "shape", label: "Pixel shape", type: "select", default: "square",
      options: [
        { value: "square", label: "Square" },
        { value: "led", label: "LED dots" },
        { value: "bead", label: "Perler beads" },
      ],
    },
    { key: "outline", label: "Outline", type: "toggle", default: true },
    { key: "outlineColor", label: "Outline color", type: "color", default: "dark" },
    { key: "dither", label: "Dither", type: "toggle", default: false },
  ],
  presets: [
    { name: "8-bit", params: { size: 14, palette: "logo", shape: "square", outline: true, outlineColor: "dark", dither: false } },
    { name: "LED board", params: { size: 16, palette: "team", shape: "led", outline: false, dither: false } },
    { name: "Perler beads", params: { size: 16, palette: "team", shape: "bead", outline: true, outlineColor: "dark", dither: false } },
    { name: "Handheld", params: { size: 16, palette: "shades", shape: "square", outline: true, outlineColor: "dark", dither: true } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    // short / thin artwork (wordmarks) gets a denser grid so letters keep their shape
    const probe = resizeCanvas(src, 128, 128);
    const pa = getPixels(probe).data;
    let px0 = 128, py0 = 128, px1 = -1, py1 = -1;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      if (pa[(y * 128 + x) * 4 + 3] < 40) continue;
      if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y;
    }
    const minSide = px1 < 0 ? 0.72 : Math.min(px1 - px0 + 1, py1 - py0 + 1) / 128;
    const dense = clamp(minSide / 0.5, 0.5, 1);
    const G = Math.max(8, Math.round(1024 / (p.size * dense)));     // cells across the canvas
    const cell = S / G;
    // samples per cell side: ≥ 4, and enough that a hairline still registers in big cells
    const SUB = Math.max(4, Math.min(12, Math.ceil(256 / G)));
    const cLo = SUB >> 2, cHi = SUB - 1 - cLo;            // the cell's central samples
    const M = G * SUB;
    const n = G * G;
    const small = resizeCanvas(src, M, M);
    const sd = getPixels(small).data;

    const colors = paletteFor(p.palette, small, ctx.palette);
    const rgbs = colors.map(hexToRgb);
    const K = colors.length;
    const lums = rgbs.map(lumOf);
    const byLum = p.palette === "shades";
    // darker inks win ties: key lines, pupils and mouths stay continuous
    const weight = lums.map((l) => 1 + 0.9 * (1 - l));
    const cache = new Int16Array(32768).fill(-1);
    const classify = (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let k = cache[key];
      if (k < 0) {
        if (byLum) {
          const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          k = l < SHADE_EDGES[0] ? 0 : l < SHADE_EDGES[1] ? 1 : l < SHADE_EDGES[2] ? 2 : 3;
        } else k = nearestColorIndex(r, g, b, rgbs);
        cache[key] = k;
      }
      return k;
    };

    /* ── per-cell statistics ── */
    const cov = new Float32Array(n), amax = new Float32Array(n), core = new Float32Array(n);
    const hist = new Float32Array(n * K);
    const avg = new Float32Array(n * 3);
    for (let y = 0; y < M; y++) {
      const cy = (y / SUB) | 0;
      for (let x = 0; x < M; x++) {
        const j = (y * M + x) * 4;
        const a = sd[j + 3] / 255;
        if (a <= 0) continue;
        const ci = cy * G + ((x / SUB) | 0);
        cov[ci] += a;
        if (a > amax[ci]) amax[ci] = a;
        const ux = x % SUB, uy = y % SUB;
        if (ux >= cLo && ux <= cHi && uy >= cLo && uy <= cHi && a > core[ci]) core[ci] = a;
        if (a < 0.3) continue;
        hist[ci * K + classify(sd[j], sd[j + 1], sd[j + 2])] += a;
        avg[ci * 3] += sd[j] * a; avg[ci * 3 + 1] += sd[j + 1] * a; avg[ci * 3 + 2] += sd[j + 2] * a;
      }
    }
    const inv = 1 / (SUB * SUB);
    for (let i = 0; i < n; i++) cov[i] *= inv;

    /* ── which cells are on ── */
    const on = new Uint8Array(n), thin = new Uint8Array(n);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        const c = cov[i];
        if (c >= 0.42) { on[i] = 1; continue; }
        if (c < 0.06) continue;
        // thin line work: keep cells a hairline runs through (near the cell centre) when
        // the neighbourhood is sparse
        let s = 0, m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
          s += cov[yy * G + xx]; m++;
        }
        if (s / m < 0.34 && (core[i] >= 0.45 || (amax[i] >= 0.75 && c >= 0.22))) { on[i] = 1; thin[i] = 1; }
      }
    }

    /* ── colour per cell ── */
    const col = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      let best = 0, bs = -1;
      for (let k = 0; k < K; k++) {
        const s = hist[i * K + k] * weight[k];
        if (s > bs) { bs = s; best = k; }
      }
      if (bs <= 0) {
        // only faint samples: use the average colour
        const w = cov[i] * SUB * SUB || 1;
        best = classify(avg[i * 3] / w | 0, avg[i * 3 + 1] / w | 0, avg[i * 3 + 2] / w | 0);
      }
      col[i] = best;
    }

    /* ── pixel-perfect lines: drop the elbow cell of every L in thin line work ── */
    for (let y = 1; y < G - 1; y++) {
      for (let x = 1; x < G - 1; x++) {
        const i = y * G + x;
        if (!on[i] || !thin[i]) continue;
        const l = on[i - 1], r = on[i + 1], u = on[i - G], d = on[i + G];
        if (l + r + u + d !== 2 || (l && r) || (u && d)) continue;
        const h = l ? -1 : 1, v = u ? -G : G;
        // the two arms touch diagonally: the elbow is redundant (unless it is the only path)
        if (!on[i + h + v] && (on[i + h] && on[i + v])) { on[i] = 0; col[i] = -1; }
      }
    }

    /* ── clean-up: lonely specks and pinholes ── */
    const nb8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const votes = new Float32Array(K);
    for (let pass = 0; pass < 2; pass++) {
      const prev = col.slice();
      const prevOn = on.slice();
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const i = y * G + x;
          let onN = 0, same = 0, orth = 0;
          votes.fill(0);
          for (const [dx, dy] of nb8) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
            const k = yy * G + xx;
            if (!prevOn[k]) continue;
            onN++;
            if (dx === 0 || dy === 0) orth++;
            votes[prev[k]] += dx === 0 || dy === 0 ? 1.5 : 1;
            if (prev[k] === prev[i]) same++;
          }
          if (prevOn[i]) {
            if (onN === 0 && cov[i] < 0.75) { on[i] = 0; col[i] = -1; continue; }   // stray cell
          } else if (orth === 4 && cov[i] >= 0.12) {
            let mk = 0;
            for (let k = 1; k < K; k++) if (votes[k] > votes[mk]) mk = k;
            on[i] = 1; col[i] = mk;                                                   // pinhole
          }
        }
      }
    }

    /* ── islands: 1–2 cell specks of a colour merge into what surrounds them, unless they
          are a real feature that fills its cells (a pupil, a collar spike) ── */
    {
      const seen = new Uint8Array(n);
      const q = new Int32Array(n);
      const maxIsland = G > 90 ? 3 : 2;
      for (let s0 = 0; s0 < n; s0++) {
        if (!on[s0] || seen[s0]) continue;
        const c = col[s0];
        let head = 0, tail = 0;
        q[tail++] = s0; seen[s0] = 1;
        while (head < tail) {
          const i = q[head++], x = i % G, y = (i / G) | 0;
          for (const [dx, dy] of nb8) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
            const k = yy * G + xx;
            if (on[k] && !seen[k] && col[k] === c) { seen[k] = 1; q[tail++] = k; }
          }
        }
        if (tail > maxIsland) continue;
        votes.fill(0);
        let own = 0, lost = 0;
        for (let t = 0; t < tail; t++) {
          const i = q[t], x = i % G, y = (i / G) | 0;
          own += hist[i * K + c];
          for (const [dx, dy] of nb8) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
            const k = yy * G + xx;
            if (on[k] && col[k] !== c) votes[col[k]] += dx === 0 || dy === 0 ? 1.5 : 1;
          }
          // how much of this ink lies unclaimed around it (5×5)?
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
            const k = yy * G + xx;
            if (col[k] !== c) lost += hist[k * K + c];
          }
        }
        let mk = -1;
        for (let k = 0; k < K; k++) if (votes[k] > 0 && (mk < 0 || votes[k] > votes[mk])) mk = k;
        if (mk < 0) continue;
        // a compact feature (pupil, collar spike) owns its ink; a fragment of a structure
        // that broke up on the grid (thin lettering, hairline creases) is mostly unclaimed ink
        if (lost < own * 0.9) continue;
        for (let t = 0; t < tail; t++) col[q[t]] = mk;
      }
    }

    /* ── dither: smooth tones between inks + dithered shading on big flat areas ── */
    const inks = colors.slice();            // shadow tones get appended
    if (p.dither) {
      const base = col.slice();
      const cr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        if (!on[i]) continue;
        let w = 0;
        for (let k = 0; k < K; k++) w += hist[i * K + k];
        if (w > 0) { cr[i * 3] = avg[i * 3] / w; cr[i * 3 + 1] = avg[i * 3 + 1] / w; cr[i * 3 + 2] = avg[i * 3 + 2] / w; }
        else { const c = rgbs[base[i]]; cr[i * 3] = c[0]; cr[i * 3 + 1] = c[1]; cr[i * 3 + 2] = c[2]; }
      }
      // (1) real gradients in the source (raster logos): ordered dither between the two
      //     nearest inks — only where all four neighbours are close in colour (never on edges)
      const smoothAt = (x, y) => {
        const i = y * G + x;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= G || yy >= G) return false;
          const k = yy * G + xx;
          if (!on[k]) return false;
          const d = Math.abs(cr[i * 3] - cr[k * 3]) + Math.abs(cr[i * 3 + 1] - cr[k * 3 + 1]) + Math.abs(cr[i * 3 + 2] - cr[k * 3 + 2]);
          if (d > 30) return false;
        }
        return true;
      };
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const i = y * G + x;
          if (!on[i] || !smoothAt(x, y)) continue;
          const r = cr[i * 3], g = cr[i * 3 + 1], b = cr[i * 3 + 2];
          let k1 = -1, k2 = -1, d1 = Infinity, d2 = Infinity;
          if (byLum) {
            // only tones right at a shade boundary get dithered between its two shades
            const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            let bi = 0;
            for (let q = 1; q < SHADE_EDGES.length; q++) if (Math.abs(l - SHADE_EDGES[q]) < Math.abs(l - SHADE_EDGES[bi])) bi = q;
            const dist = Math.abs(l - SHADE_EDGES[bi]);
            if (dist > 0.06) continue;
            const t = 0.5 - dist / 0.12;
            const lo = bi, hi = bi + 1;                  // shades either side of the boundary
            const near = l < SHADE_EDGES[bi] ? lo : hi, far = near === lo ? hi : lo;
            col[i] = t * 2 > BAYER[(y & 3) * 4 + (x & 3)] ? far : near;
            continue;
          } else {
            for (let k = 0; k < K; k++) {
              const c = rgbs[k];
              const d = Math.sqrt((r - c[0]) ** 2 * 2 + (g - c[1]) ** 2 * 4 + (b - c[2]) ** 2 * 3);
              if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k; } else if (d < d2) { d2 = d; k2 = k; }
            }
          }
          if (k2 < 0) continue;
          const t = d1 / (d1 + d2 + 1e-6);              // 0 = exactly ink 1, 0.5 = halfway
          if (t < 0.25) continue;
          col[i] = t * 2 > BAYER[(y & 3) * 4 + (x & 3)] ? k2 : k1;
        }
      }
      // (2) retro shading: big flat areas get a solid shadow row on their lower-right edge
      //     and a 50% dither row inside it (light from the top left)
      const darkest = lums.indexOf(Math.min(...lums));
      const shadowOf = new Int16Array(K).fill(-1);
      for (let k = 0; k < K; k++) {
        if (byLum) { shadowOf[k] = k > 0 ? k - 1 : -1; continue; }
        if (k === darkest || lums[k] < 0.12) continue;
        shadowOf[k] = inks.length;
        inks.push(mix(colors[k], colors[darkest], lums[k] > 0.7 ? 0.24 : 0.34));
      }
      const inR = (x, y, c) => x >= 0 && y >= 0 && x < G && y < G && on[y * G + x] && base[y * G + x] === c;
      const run = (x, y, dx, dy, c) => { let t = 0; while (t < 3 && inR(x + dx * (t + 1), y + dy * (t + 1), c)) t++; return t; };
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const i = y * G + x;
          if (!on[i]) continue;
          const c = base[i], sh = shadowOf[c];
          if (sh < 0 || col[i] !== c) continue;
          const fx = run(x, y, 1, 0, c), fy = run(x, y, 0, 1, c);
          const bx = run(x, y, -1, 0, c), by = run(x, y, 0, -1, c);
          const edgeX = fx === 0 && bx >= 3, edgeY = fy === 0 && by >= 3;
          if (edgeX || edgeY) { col[i] = sh; continue; }
          const nearX = fx === 1 && bx >= 2, nearY = fy === 1 && by >= 2;
          if ((nearX || nearY) && ((x + y) & 1)) col[i] = sh;
        }
      }
    }

    /* ── outline ring ── */
    const ring = new Uint8Array(n);
    if (p.outline) {
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const i = y * G + x;
          if (on[i]) continue;
          if ((x > 0 && on[i - 1]) || (x < G - 1 && on[i + 1]) || (y > 0 && on[i - G]) || (y < G - 1 && on[i + G])) ring[i] = 1;
        }
      }
    }

    /* ── draw ── */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const edge = new Float64Array(G + 1);
    for (let i = 0; i <= G; i++) edge[i] = Math.round(i * cell);
    const outlineHex = p.outlineColor;
    const KI = inks.length;

    if (p.shape === "square") {
      const paths = inks.map(() => new Path2D());
      const ringPath = new Path2D();
      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const i = y * G + x;
          const path = on[i] ? paths[col[i]] : ring[i] ? ringPath : null;
          if (!path) continue;
          path.rect(edge[x], edge[y], edge[x + 1] - edge[x], edge[y + 1] - edge[y]);
        }
      }
      o.fillStyle = outlineHex;
      o.fill(ringPath);
      for (let k = 0; k < KI; k++) { o.fillStyle = inks[k]; o.fill(paths[k]); }
      return out;
    }

    // dots / beads: every cell of one ink is a rect in one Path2D, filled with that ink's
    // sprite as a pattern tiled at exactly one cell — one fill per ink, not one draw per cell
    const fillCells = (c2, sprite, test) => {
      const path = new Path2D();
      let any = false;
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        if (!test(y * G + x)) continue;
        path.rect(edge[x], edge[y], edge[x + 1] - edge[x], edge[y + 1] - edge[y]);
        any = true;
      }
      if (!any) return;
      const pat = c2.createPattern(sprite, "repeat");
      pat.setTransform(new DOMMatrix().scale(cell / sprite.width));
      c2.fillStyle = pat;
      c2.fill(path);
    };

    if (p.shape === "led") {
      // an LED can't show a dark ink: dark cells stay unlit (unless the logo is mostly dark,
      // then its inks are lifted so the board still lights up)
      const inkL = inks.map((h) => lumOf(hexToRgb(h)));
      let lit = 0, total = 0;
      for (let i = 0; i < n; i++) if (on[i]) { total++; if (inkL[col[i]] >= 0.2) lit++; }
      const mostlyDark = lit < total * 0.35;
      const ledHex = inks.map((h, k) => {
        if (inkL[k] >= 0.2) return h;
        if (!mostlyDark) return null;
        const [r, g, b] = hexToRgb(h);
        const [hh, ss] = rgbToHsl(r, g, b);
        return rgbToHex(...hslToRgb(hh, Math.max(ss, 0.5), 0.6));
      });
      const sprites = ledHex.map((h) => (h ? cellSprite("led", h, cell) : null));
      const unlit = cellSprite("led", "#2A2F38", cell, true);
      // the board: unlit LEDs under the sprite and in a two-cell band around it
      const board = new Uint8Array(n);
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        if (!on[y * G + x]) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 5) continue;
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < G && yy < G) board[yy * G + xx] = 1;
        }
      }
      // the board itself prints as a dark backing (stepped, like the pixels) so the lit
      // LEDs read on any fabric — a scoreboard patch, not white dots lost on a white tee
      const backing = new Path2D();
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        if (board[y * G + x]) backing.rect(edge[x], edge[y], edge[x + 1] - edge[x], edge[y + 1] - edge[y]);
      }
      o.fillStyle = BOARD;
      o.fill(backing);
      const glow = createCanvas(S, S);
      const gx = ctx2d(glow);
      fillCells(o, unlit, (i) => board[i] && !(on[i] && sprites[col[i]]));
      for (let k = 0; k < sprites.length; k++) if (sprites[k]) fillCells(gx, sprites[k], (i) => on[i] && col[i] === k);
      // a tight bloom (well inside a cell) so the board reads lit without smudging the fabric
      o.globalAlpha = 0.55;
      o.drawImage(blurCanvas(glow, cell * 0.28), 0, 0);
      o.globalAlpha = 1;
      o.drawImage(glow, 0, 0);
      return out;
    }

    // perler beads
    const sprites = inks.map((hex) => cellSprite("bead", hex, cell));
    const ringSprite = cellSprite("bead", outlineHex, cell);
    fillCells(o, ringSprite, (i) => ring[i]);
    for (let k = 0; k < sprites.length; k++) fillCells(o, sprites[k], (i) => on[i] && col[i] === k);
    return out;
  },
};
