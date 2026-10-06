// "Vintage Print" — a worn, washed-a-hundred-times screen print.
//
//   logo → 2–4 spot inks picked from the team palette (greedy: each added ink is the one
//   that best explains the logo's colours, so a gold eye survives over a near-duplicate
//   black) → each ink its own screen, slightly off-register, light inks first →
//   plastisol crack network (domain-warped Voronoi edges, wider and denser where the
//   print is worn) + flaked-off chips in the worst spots + speckle wear + ink grain →
//   optional white underbase that cracks less, so it shows through the top colours.
//
// Wear is a field, not a constant: worn patches (low-frequency noise), more wear toward
// the edges of the artwork and toward the outside of the print. All sizes are in
// 1024-units on grids anchored in unit space (same cracks at 384 and 2048).
// Transparent background (cracks show the garment), deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, smoothstep, hexToRgb, luminance,
  contrastRatio, insideDistance, makeNoise2D, fbm, hashSeed, maskBounds,
} from "../core.js";
import { extractPalette } from "../image.js";

const UNDERBASE = "#F3F1EB";
const ROLES = ["primary", "secondary", "accent", "dark", "light"];

/* ───────────────────────────── noise helpers ───────────────────────────── */

function hash01(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bilinear row sampler for a grid with points every `c` px → (y) → Float32Array(S) (reused). */
function rowSampler(grid, gw, gh, c, S) {
  const ix = new Int32Array(S), fx = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    const g = (x + 0.5) / c;
    const i = Math.min(gw - 2, Math.max(0, g | 0));
    ix[x] = i; fx[x] = Math.min(1, g - i);
  }
  const tmp = new Float32Array(gh * S);
  for (let j = 0; j < gh; j++) {
    const go = j * gw, to = j * S;
    for (let x = 0; x < S; x++) {
      const a = grid[go + ix[x]];
      tmp[to + x] = a + (grid[go + ix[x] + 1] - a) * fx[x];
    }
  }
  const row = new Float32Array(S);
  return (y) => {
    const g = (y + 0.5) / c;
    const j = Math.min(gh - 2, Math.max(0, g | 0));
    const f = Math.min(1, g - j);
    const a = j * S, b = a + S;
    for (let x = 0; x < S; x++) row[x] = tmp[a + x] + (tmp[b + x] - tmp[a + x]) * f;
    return row;
  };
}

/** Value-noise grid (0..1) with points every `cellU` units. */
function valueField(S, sc, cellU, seed) {
  const c = Math.max(0.5, cellU * sc);
  const gw = Math.ceil(S / c) + 2;
  const g = new Float32Array(gw * gw);
  for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = hash01(i, j, seed);
  return rowSampler(g, gw, gw, c, S);
}

/** Smooth fbm field (−1..1), grid points every `cellU` units, features ≈ `featU` units. */
function smoothField(S, sc, cellU, featU, seed, octaves = 3) {
  const c = cellU * sc;
  const gw = Math.ceil(S / c) + 2;
  const nz = makeNoise2D(seed);
  const g = new Float32Array(gw * gw);
  for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fbm(nz, (i * cellU) / featU, (j * cellU) / featU, octaves);
  return rowSampler(g, gw, gw, c, S);
}

/* ───────────────────────────── inks ───────────────────────────── */

/**
 * Pick `count` spot inks from the palette that best explain the logo's colours
 * (greedy: start with the largest-area match, then add the ink that removes the most
 * weighted colour error). Returns hexes; fewer if extra inks would explain nothing.
 */
function pickInks(small, palette, count, base = null) {
  const cands = [], team = [];
  for (const r of ROLES) {
    const h = palette?.[r];
    if (!h || cands.some((c) => contrastRatio(c, h) < 1.12)) continue;
    cands.push(h);
    team.push(r === "primary" || r === "secondary");
  }
  const candRGB = cands.map(hexToRgb);
  const pal = extractPalette(small, 10, { maxSamples: 4000 });
  if (!pal.length) return [cands[0]];
  // a saturated logo colour (a gold eye) matters more than its area says: it is identity
  const cols = pal.map((c) => {
    const rgb = hexToRgb(c.hex);
    const chroma = (Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2])) / 255;
    return { rgb, w: c.weight * (1 + 2.5 * chroma) };
  });
  const dist = (a, b) => {
    const rm = (a[0] + b[0]) * 0.5, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  };
  const D = cols.map((c) => candRGB.map((k) => dist(c.rgb, k)));
  const chosen = [];
  // with a white underbase, white parts of the logo are already printed (by the underbase)
  const baseRGB = base ? hexToRgb(base) : null;
  const cur = cols.map((c) => (baseRGB ? dist(c.rgb, baseRGB) : Infinity));
  const errOf = (k) => cols.reduce((s, c, i) => s + c.w * Math.min(cur[i], D[i][k]), 0);
  while (chosen.length < count) {
    let best = -1, bestErr = Infinity;
    for (let k = 0; k < cands.length; k++) {
      if (chosen.includes(k)) continue;
      const e = errOf(k) * (team[k] ? 1 : 1.18); // prefer the team's own colours (navy over black)
      if (e < bestErr) { bestErr = e; best = k; }
    }
    if (best < 0) break;
    const before = chosen.length || base ? cols.reduce((s, c, i) => s + c.w * cur[i], 0) : Infinity;
    // stop when another ink would explain almost nothing (a one-colour mark stays one ink)
    if ((chosen.length || base) && before - bestErr < 6) break;
    chosen.push(best);
    for (let i = 0; i < cols.length; i++) cur[i] = Math.min(cur[i], D[i][best]);
  }
  return chosen.map((k) => cands[k]);
}

/** Luma + colour-difference coordinates: chroma counts more, so a grey anti-aliased edge
 *  between white and navy never snaps to a gold ink just because gold is "in between". */
function toYC(r, g, b) {
  const Y = 0.299 * r + 0.587 * g + 0.114 * b;
  return [Y, (b - Y) * 1.3, (r - Y) * 1.3];
}
function nearestInk(r, g, b, inkYC) {
  const [Y, U, V] = toYC(r, g, b);
  let best = 0, bd = Infinity;
  for (let k = 0; k < inkYC.length; k++) {
    const c = inkYC[k];
    const d = (Y - c[0]) * (Y - c[0]) + (U - c[1]) * (U - c[1]) + (V - c[2]) * (V - c[2]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "screenprint",
  name: "Vintage Print",
  category: "print",
  blurb: "A worn-in vintage tee: cracked spot inks, off-register.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "wear", label: "Wear", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    { key: "crack", label: "Crack size", type: "range", min: 10, max: 60, step: 1, default: 24, unit: "px" },
    { key: "misreg", label: "Misregistration", type: "range", min: 0, max: 16, step: 1, default: 4, unit: "px" },
    { key: "inks", label: "Ink count", type: "range", min: 2, max: 4, step: 1, default: 3 },
    { key: "underbase", label: "White underbase", type: "toggle", default: false },
  ],
  presets: [
    { name: "Vintage", params: { wear: 55, crack: 24, misreg: 4, inks: 3, underbase: false } },
    { name: "Fresh print", params: { wear: 6, crack: 24, misreg: 1, inks: 4, underbase: true } },
    { name: "Thrashed", params: { wear: 86, crack: 34, misreg: 7, inks: 2, underbase: true } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const n = S * S;
    const seed = ctx.seed >>> 0;
    const wear = p.wear / 100;

    /* ── 1. spot inks + separation (nearest ink per pixel) ── */
    const small = resizeCanvas(src, Math.min(S, 192), Math.min(S, 192));
    const underbase = !!p.underbase;
    const inks = pickInks(small, ctx.palette, Math.round(p.inks), underbase ? UNDERBASE : null);
    // print order: light inks first, dark keylines last (they overprint)
    inks.sort((a, b) => luminance(b) - luminance(a));
    const inkRGB = inks.map(hexToRgb);
    // label N = "underbase only": white parts of the logo print as the bare underbase
    const inkYC = [...inkRGB, ...(underbase ? [hexToRgb(UNDERBASE)] : [])].map(([r, g, b]) => toYC(r, g, b));
    const N = inks.length;
    const sd = getPixels(src).data;
    const alpha = new Float32Array(n);
    const label = new Int8Array(n).fill(-1);
    const cache = new Int8Array(32768).fill(-1);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = sd[j + 3];
      if (!a) continue;
      alpha[i] = a / 255;
      const key = ((sd[j] >> 3) << 10) | ((sd[j + 1] >> 3) << 5) | (sd[j + 2] >> 3);
      let k = cache[key];
      if (k < 0) k = cache[key] = nearestInk(sd[j], sd[j + 1], sd[j + 2], inkYC);
      label[i] = k;
    }
    const bb = maskBounds(alpha, S, S, 0.1);
    if (bb.empty) return createCanvas(S, S);

    /* ── 2. wear field ingredients ── */
    // distance from the artwork's edge (A-res, bilinear) and from its centre
    const A = Math.min(S, 384);
    const ad = A === S ? alpha : (() => { const d = getPixels(resizeCanvas(src, A, A)).data; const m = new Float32Array(A * A); for (let i = 0; i < A * A; i++) m[i] = d[i * 4 + 3] / 255; return m; })();
    const inA = insideDistance(ad, A, A, 0.5);
    const kA = A / S;
    const edgeU = 34;                                   // edge wear reaches this far in, units
    const edgeGrid = new Float32Array(A * A);
    for (let i = 0; i < A * A; i++) edgeGrid[i] = 1 - smoothstep(0, edgeU * sc * kA, inA[i]);
    const edgeRow = rowSampler(edgeGrid, A, A, S / A, S);
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const rx = Math.max(1, (bb.x1 - bb.x0) / 2), ry = Math.max(1, (bb.y1 - bb.y0) / 2);

    const patchRow = smoothField(S, sc, 24, 170, hashSeed("vp-patch", seed));
    const midRow = smoothField(S, sc, 10, 55, hashSeed("vp-mid", seed), 2);
    const cellU = p.crack;
    const warpX = smoothField(S, sc, Math.max(4, cellU / 3), cellU * 1.3, hashSeed("vp-wx", seed), 2);
    const warpY = smoothField(S, sc, Math.max(4, cellU / 3), cellU * 1.3, hashSeed("vp-wy", seed), 2);
    const grainRow = valueField(S, sc, 2.2, hashSeed("vp-grain", seed));
    const blotchRow = valueField(S, sc, 7, hashSeed("vp-blotch", seed));

    // Voronoi feature points, one per crack cell (grid in unit space, jittered)
    const cellPx = cellU * sc;
    const GW = Math.ceil(S / cellPx) + 4;
    const fpx = new Float32Array(GW * GW), fpy = new Float32Array(GW * GW), fh = new Float32Array(GW * GW);
    for (let j = 0; j < GW; j++) {
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        fpx[k] = i + 0.12 + 0.76 * hash01(i, j, seed ^ 0x51);
        fpy[k] = j + 0.12 + 0.76 * hash01(i, j, seed ^ 0xa7);
        fh[k] = hash01(i, j, seed ^ 0x3c);
      }
    }

    /* ── 3. misregistration (key ink stays put, the others drift) ── */
    const m = p.misreg * sc;
    const offs = inks.map((_, k) => {
      if (k === N - 1 || m < 0.25) return [0, 0];
      const a = hash01(k, 3, seed) * Math.PI * 2;
      const r = m * (0.6 + 0.4 * hash01(k, 5, seed));
      return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)];
    });
    const UB = hexToRgb(UNDERBASE);

    /* ── 4. print ── */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const od = img.data;
    const crackW = (0.55 + 1.5 * wear) * sc;          // max crack width, px
    const crackAA = Math.max(0.6, 0.7 * Math.min(1, sc * 1.6));
    const flakeMax = 0.3 * smoothstep(0.35, 1, wear);
    const x0 = Math.max(0, bb.x0 - Math.ceil(m) - 2), x1 = Math.min(S, bb.x1 + Math.ceil(m) + 2);
    const y0 = Math.max(0, bb.y0 - Math.ceil(m) - 2), y1 = Math.min(S, bb.y1 + Math.ceil(m) + 2);
    const invCell = 1 / cellPx;
    for (let y = y0; y < y1; y++) {
      const patch = patchRow(y), mid = midRow(y), wxr = warpX(y), wyr = warpY(y);
      const grain = grainRow(y), blotch = blotchRow(y), edge = edgeRow(y);
      const ty = (y - cy) / ry;
      for (let x = x0; x < x1; x++) {
        const i = y * S + x;
        // which inks land here (each from its own shifted screen)?
        let any = alpha[i] > 0;
        for (let k = 0; k < N - 1 && !any; k++) {
          const sx = x - offs[k][0], sy = y - offs[k][1];
          if (sx >= 0 && sy >= 0 && sx < S && sy < S && alpha[sy * S + sx] > 0) any = true;
        }
        if (!any) continue;

        // local wear 0..1
        const tx = (x - cx) / rx;
        const radial = smoothstep(0.55, 1.15, Math.sqrt(tx * tx + ty * ty));
        const pt = 0.5 + 0.5 * patch[x];
        let w = wear * (0.25 + 1.1 * smoothstep(0.3, 0.75, pt) + 0.55 * edge[x] + 0.35 * radial);
        w = w > 0.94 ? 0.94 : w;

        // crack network: distance to the Voronoi edge in warped cell space
        const u = x * invCell + 2 + wxr[x] * 0.42, v = y * invCell + 2 + wyr[x] * 0.42;
        const ci = u | 0, cj = v | 0;
        let d1 = 1e9, d2 = 1e9, p1 = 0, p2 = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = cj + dj;
          if (jj < 0 || jj >= GW) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = ci + di;
            if (ii < 0 || ii >= GW) continue;
            const k = jj * GW + ii;
            const dx = fpx[k] - u, dy = fpy[k] - v;
            const dd = dx * dx + dy * dy;
            if (dd < d1) { d2 = d1; p2 = p1; d1 = dd; p1 = k; } else if (dd < d2) { d2 = dd; p2 = k; }
          }
        }
        const ex = fpx[p2] - fpx[p1], ey = fpy[p2] - fpy[p1];
        const edgeD = ((d2 - d1) / (2 * Math.sqrt(ex * ex + ey * ey) + 1e-6)) * cellPx + (grain[x] - 0.5) * 0.9 * sc;
        // crack strength: only where worn enough, varying along the network
        const cs = clamp((w - 0.12 + 0.3 * mid[x] * Math.min(1, wear * 4)) / 0.45);
        const half = cs * crackW * 0.5;
        let crack = half > 0.05 ? clamp((half - edgeD) / crackAA + 0.5) : 0;
        // flaked-off chips in the worst spots
        if (fh[p1] < flakeMax * smoothstep(0.55, 1, w)) crack = 1;
        // speckle wear: blotchy pinholes
        const sp = 0.55 * grain[x] + 0.45 * blotch[x];
        const speck = clamp((w * 0.38 - sp) * 9 * Math.min(1, sc * 1.4) + 0.5) * (w > 0.05 ? 1 : 0);
        const keep = (1 - crack) * (1 - speck);
        // ink thins out (fades) in worn patches; grain from the fabric under the ink
        const inkA = (1 - 0.3 * w * pt) * (0.9 + 0.1 * grain[x]);

        let al = 0, r = 0, g = 0, b = 0;
        if (underbase && alpha[i] > 0) {
          // the underbase cracks less: only the widest cracks and chips go through it
          const ubCrack = crack * smoothstep(0.55, 0.9, cs) ;
          const ua = alpha[i] * (1 - ubCrack) * (1 - speck * 0.5);
          if (ua > 0) { al = ua; r = UB[0]; g = UB[1]; b = UB[2]; }
        }
        for (let k = 0; k < N; k++) {
          const sx = x - offs[k][0], sy = y - offs[k][1];
          if (sx < 0 || sy < 0 || sx >= S || sy >= S) continue;
          const si = sy * S + sx;
          if (label[si] !== k) continue;
          const as = alpha[si] * keep * inkA;
          if (as <= 0.002) continue;
          const c = inkRGB[k];
          const ao = as + al * (1 - as);
          const wb = (al * (1 - as)) / ao, ws = as / ao;
          r = c[0] * ws + r * wb; g = c[1] * ws + g * wb; b = c[2] * ws + b * wb;
          al = ao;
        }
        if (al <= 0.002) continue;
        const j = i * 4;
        od[j] = r + 0.5; od[j + 1] = g + 0.5; od[j + 2] = b + 0.5; od[j + 3] = al * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);
    return out;
  },
};
