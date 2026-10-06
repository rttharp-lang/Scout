// "Graffiti" — THE HERO EFFECT (the app's default look). Turns the team logo into a
// finished street piece in the spirit of "Chrome Graffiti Street" effect packs:
//
//   overspray halo → 3-D block stepping down-right → second outline (+ drips) →
//   thick black outline → fill (team fade / chrome / flat / bubble) with an airbrushed
//   glow, a thin inner white highlight edge and white "shines" → the logo's own dark
//   linework as crisp black keylines → 4-point sparkle glints.
//
// The logo is NOT turned into a blob: its dark linework (pupils, mouth, stitching,
// lettering strokes…) stays as black keylines, and its other inks are flattened into
// the fill as tone steps (the dominant ink = the fill; darker inks = deeper shades of it;
// lighter inks = pale tints), so a mascot keeps its face and a crest keeps its lettering.
//
// Structure (as halftone.js): distance fields and other smooth fields at an analysis
// grid A (≈ half the work size, bilinearly upsampled — distance fields interpolate
// exactly enough to keep outline edges crisp); masks and the fill at W = min(S, 1024);
// vector work (drips, particles, shines, sparkles) in 1024-units × ctx.scale; keylines
// from the full-resolution source. Transparent background, deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, lerp, smoothstep, hexToRgb, mix,
  lighten, darken, luminance, rgbToHsl, hslToHex, insideDistance, outsideDistance,
  blurMask, dilateMask, maskToCanvas, maskBounds, sampleBilinear, rng, hashSeed, makeNoise2D,
  heightFromMask, normalsFromHeight, gradientLUT,
} from "../core.js";

const TAU = Math.PI * 2;
// widths in 1024-units
const OUTLINE = 15;        // thick black outline
const OUTER = 11;          // second (coloured) outline
const LINE = 3.5;          // thin black line around the second outline
const THIN = 7;            // dark strokes thinner than 2×THIN are keylines
const BUBBLE = 13;         // "Bubble" inflates the silhouette by this much
const MARGIN = 10;         // nothing gets closer than this to the canvas edge

/* ───────────────────────────── colour helpers ───────────────────────────── */

/** Lift a colour until black keylines read on it (relative luminance ≥ minL). */
function liftForKeylines(hex, minL = 0.12) {
  let c = hex;
  for (let k = 0; k < 30 && luminance(c) < minL; k++) c = lighten(c, 0.025);
  return c;
}

/** Near-black ink for keylines / outline / 3-D: the palette's dark if it is really dark. */
function inkOf(palette) {
  const d = palette?.dark;
  return d && luminance(d) < 0.02 ? d : "#0D0F12";
}

/** A near-black, near-neutral colour: as a fill it would swallow the black keylines. */
function isInkLike(hex) {
  const [, s, l] = rgbToHsl(hexToRgb(hex));
  return luminance(hex) < 0.035 && (s < 0.35 || l < 0.08);
}

/**
 * Fill colour actually used for a fill slot: a near-black slot (a red/black team's
 * "secondary") becomes steel silver — the classic red-to-chrome fade — instead of a
 * lifted slate grey that turns the fade's horizon mauve.
 */
function usableFill(hex, other) {
  if (!isInkLike(hex)) return hex;
  return isInkLike(other) ? "#C9CFD8" : "#B4BDC8";
}

/**
 * The 3-D block's colour: the darkest saturated colour among the piece's colours (navy
 * for the sample team), held dark enough to read as the shadow side of the letters.
 * Neutral pieces fall back to charcoal. → { lit, deep } hexes.
 */
function blockColors(cands, ink) {
  let best = null;
  for (const c of cands) {
    const [h, s, l] = rgbToHsl(hexToRgb(c));
    if (s < 0.25 || l > 0.75 || l < 0.04) continue;
    const L = luminance(c);
    if (!best || L < best.L) best = { h, s, l, L };
  }
  if (!best) return { lit: mix(ink, "#565D69", 0.55), deep: mix(ink, "#000000", 0.35) };
  const s = Math.min(1, best.s * 0.95 + 0.05);
  return { lit: hslToHex(best.h, s, clamp(best.l, 0.24, 0.34)), deep: hslToHex(best.h, s * 0.9, 0.07) };
}

/** Tone step of a fill colour: level −2..+2 (deep shade … pale tint). */
function toneOf(hex, level) {
  if (level === 0) return hex;
  if (level > 0) return mix(hex, "#FFFFFF", level > 1 ? 0.72 : 0.42);
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  // deeper shades keep chroma (ochre, not mud) and never reach the keyline black
  return hslToHex(h, clamp(s + 0.08), Math.max(0.1, l - (level === -1 ? 0.17 : 0.3)));
}

/* ───────────────────────────── field helpers ───────────────────────────── */

/** Bilinear upsample of an A×A field to W×W (pixel centres aligned), times mul. */
function upsample(m, A, W, mul = 1) {
  if (A === W) {
    if (mul === 1) return m;
    const o = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) o[i] = m[i] * mul;
    return o;
  }
  const out = new Float32Array(W * W);
  const k = A / W;
  const xi = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const f = clamp((x + 0.5) * k - 0.5, 0, A - 1.001);
    xi[x] = f | 0; xf[x] = f - (f | 0);
  }
  for (let y = 0; y < W; y++) {
    const fy = clamp((y + 0.5) * k - 0.5, 0, A - 1.001);
    const y0 = fy | 0, ty = fy - y0;
    const r0 = y0 * A, r1 = r0 + A, row = y * W;
    for (let x = 0; x < W; x++) {
      const i0 = xi[x], tx = xf[x];
      const a = m[r0 + i0], b = m[r0 + i0 + 1], c = m[r1 + i0], d = m[r1 + i0 + 1];
      out[row + x] = ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * mul;
    }
  }
  return out;
}

/** Area-average a W×W map down to A×A. */
function downsample(m, W, A) {
  if (A === W) return m;
  const out = new Float32Array(A * A);
  const k = W / A;
  for (let y = 0; y < A; y++) {
    const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
    for (let x = 0; x < A; x++) {
      const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += m[yy * W + xx];
      out[y * A + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** Anti-aliased "distance ≤ r" band from a distance field (px). */
function within(dist, n, r) {
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const e = dist[i] - 0.5 - r;
    m[i] = e <= -0.5 ? 1 : e >= 0.5 ? 0 : 0.5 - e;
  }
  return m;
}

/** The silhouette with enclosed transparent areas (not connected to the border) filled. */
function enclosed(alpha, A) {
  const n = A * A;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && alpha[i] < 0.3) { out[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < A; x++) { push(x); push((A - 1) * A + x); }
  for (let y = 0; y < A; y++) { push(y * A); push(y * A + A - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % A;
    if (x > 0) push(i - 1);
    if (x < A - 1) push(i + 1);
    if (i >= A) push(i - A);
    if (i < n - A) push(i + A);
  }
  const fill = new Float32Array(n);
  for (let i = 0; i < n; i++) fill[i] = out[i] ? alpha[i] : 1;
  return fill;
}

/**
 * 1-D k-means (k ≤ 3) on the luminance of the non-keyline inks → sorted centres and the
 * dominant (largest-area) cluster.
 */
function toneClusters(lum, weight, n) {
  const H = new Float32Array(64);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    if (w < 0.05) continue;
    H[Math.min(63, (lum[i] * 64) | 0)] += w;
    total += w;
  }
  const nearest = (cs, v) => { let k = 0; for (let j = 1; j < cs.length; j++) if (Math.abs(v - cs[j]) < Math.abs(v - cs[k])) k = j; return k; };
  let c = [0.15, 0.55, 0.95];
  for (let it = 0; it < 16; it++) {
    const sum = [0, 0, 0], cnt = [0, 0, 0];
    for (let b = 0; b < 64; b++) {
      if (!H[b]) continue;
      const v = (b + 0.5) / 64, k = nearest(c, v);
      sum[k] += v * H[b]; cnt[k] += H[b];
    }
    c = c.map((v, k) => (cnt[k] ? sum[k] / cnt[k] : v));
  }
  let cl = c.map((v) => ({ v, w: 0 }));
  for (let b = 0; b < 64; b++) if (H[b]) cl[nearest(c, (b + 0.5) / 64)].w += H[b];
  cl = cl.filter((x) => x.w > total * 0.03).sort((a, b) => a.v - b.v);
  for (let j = cl.length - 1; j > 0; j--) {
    if (cl[j].v - cl[j - 1].v < 0.12) {
      const a = cl[j - 1], b = cl[j];
      a.v = (a.v * a.w + b.v * b.w) / (a.w + b.w || 1); a.w += b.w;
      cl.splice(j, 1);
    }
  }
  if (!cl.length) cl = [{ v: 0.8, w: 1 }];
  let dom = 0;
  for (let j = 1; j < cl.length; j++) if (cl[j].w > cl[dom].w) dom = j;
  return { centres: cl.map((x) => x.v), dom };
}

/* ───────────────────────────── drips ───────────────────────────── */

/**
 * Drip sites on the downward-facing edges of `mask` (A px). → [{ x, y, w, len }] in A px.
 * Lower edges are preferred; sites are spaced out; runs stop above yMax.
 */
function dripSites(mask, A, u, amount, rand, yMax) {
  if (amount <= 0) return [];
  const soft = blurMask(mask, A, A, Math.max(0.8, 2 * u));
  const cands = [];
  let minX = A, maxX = 0;
  const clearance = Math.max(2, Math.round(6 * u));
  for (let x = 2; x < A - 2; x++) {
    for (let y = 2; y < A - 3; y++) {
      const i = y * A + x;
      if (!(mask[i] >= 0.5 && mask[i + A] < 0.5)) continue;
      const gx = soft[i + 1] - soft[i - 1], gy = soft[i + A] - soft[i - A];
      if (gy > -1e-3 || Math.abs(gx) > Math.abs(gy) * 0.5) continue; // not a floor
      const below = Math.min(A - 1, y + clearance);
      if (mask[below * A + x] >= 0.5) continue;                      // no open air below
      cands.push({ x, y, s: y / A + hash01(x, y, 91) * 0.35 });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (!cands.length) return [];
  cands.sort((a, b) => b.s - a.s);
  const want = Math.round(clamp((maxX - minX) / u / 70, 3, 13) * (0.25 + 0.75 * amount));
  const gap = 34 * u;
  const out = [];
  for (const c of cands) {
    if (out.length >= want) break;
    if (out.some((d) => Math.abs(d.x - c.x) < gap)) continue;
    const w = (10 + rand() * 9) * u;
    const short = rand() < 0.3;
    let len = (short ? 9 + rand() * 12 : (26 + Math.pow(rand(), 1.3) * 120) * (0.35 + 0.85 * amount)) * u;
    len = Math.min(len, yMax - c.y - w * 0.8);
    if (len < 8 * u) continue;
    out.push({ x: c.x + 0.5, y: c.y + 0.5, w, len });
  }
  return out;
}

/** Integer hash → [0, 1): stable tie-breakers that don't depend on how much RNG ran before. */
function hash01(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bilinear resample of an A×A field onto a G×G grid (same canvas extent). */
function resampleTo(m, A, G) {
  const out = new Float32Array(G * G);
  const k = A / G;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) out[y * G + x] = sampleBilinear(m, A, A, (x + 0.5) * k - 0.5, (y + 0.5) * k - 0.5);
  return out;
}

/** Add a drip (k = scale from site px) to a path: meniscus at the top, a round bead below. */
function dripPath(p, d, k) {
  const x = d.x * k, y = d.y * k, w = d.w * k, len = d.len * k;
  const hw = w / 2, bead = hw * 1.3, neck = hw * 0.8;
  const top = y - w * 0.9;            // starts inside the shape it drips from
  const f = w * 0.75;                 // meniscus flare
  const by = y + len - bead;          // bead centre
  const ac = Math.acos(clamp(neck / bead, -1, 1));
  const ay = by - bead * Math.sin(ac);
  p.moveTo(x - hw - f, top);
  p.lineTo(x + hw + f, top);
  p.quadraticCurveTo(x + hw, top + 0.2 * w, x + hw, y + f * 0.6);
  p.bezierCurveTo(x + hw, lerp(y, ay, 0.55), x + neck, lerp(y, ay, 0.8), x + neck, ay);
  p.arc(x, by, bead, -ac, Math.PI + ac, false);
  p.bezierCurveTo(x - neck, lerp(y, ay, 0.8), x - hw, lerp(y, ay, 0.55), x - hw, y + f * 0.6);
  p.quadraticCurveTo(x - hw, top + 0.2 * w, x - hw - f, top);
  p.closePath();
}

/* ───────────────────────────── sparkles ───────────────────────────── */

function sparkle(o, x, y, L) {
  const w = L * 0.13;
  const g = o.createRadialGradient(x, y, 0, x, y, L * 0.55);
  g.addColorStop(0, "rgba(255,255,255,0.75)");
  g.addColorStop(0.35, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  o.fillStyle = g;
  o.beginPath(); o.arc(x, y, L * 0.55, 0, TAU); o.fill();
  o.fillStyle = "#FFFFFF";
  o.beginPath();
  o.moveTo(x, y - L);
  o.quadraticCurveTo(x + w, y - w, x + L * 0.82, y);
  o.quadraticCurveTo(x + w, y + w, x, y + L * 0.9);
  o.quadraticCurveTo(x - w, y + w, x - L * 0.82, y);
  o.quadraticCurveTo(x - w, y - w, x, y - L);
  o.closePath();
  o.fill();
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "graffiti",
  name: "Graffiti",
  category: "street",
  blurb: "A finished street piece: fade fill, 3-D block, drips.",
  method: "Sublimation",
  stage: "mid",
  params: [
    {
      key: "fill", label: "Fill", type: "select", default: "fade",
      options: [
        { value: "fade", label: "Team fade" },
        { value: "chrome", label: "Chrome" },
        { value: "flat", label: "Flat" },
        { value: "bubble", label: "Bubble" },
      ],
    },
    { key: "top", label: "Fill top", type: "color", default: "primary" },
    { key: "bottom", label: "Fill bottom", type: "color", default: "secondary" },
    { key: "outer", label: "Outer outline", type: "color", default: "accent" },
    { key: "depth", label: "3-D depth", type: "range", min: 0, max: 60, step: 1, default: 34, unit: "px" },
    { key: "drips", label: "Drips", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "spray", label: "Overspray", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
  ],
  presets: [
    { name: "Piece", params: { fill: "fade", top: "primary", bottom: "secondary", outer: "accent", depth: 34, drips: 45, spray: 55 } },
    { name: "Chrome bomb", params: { fill: "chrome", top: "primary", bottom: "secondary", outer: "secondary", depth: 32, drips: 25, spray: 45 } },
    { name: "Drip", params: { fill: "fade", top: "secondary", bottom: "primary", outer: "accent", depth: 20, drips: 100, spray: 40 } },
    { name: "Throw-up", params: { fill: "bubble", top: "accent", bottom: "secondary", outer: "primary", depth: 10, drips: 0, spray: 30 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;                       // S px per unit
    const W = Math.min(S, 1024);                // masks + fill
    const A = W > 400 ? Math.round(W * 0.4) : Math.min(W, Math.max(160, Math.round(W * 0.5))); // distance fields + smooth fields
    const kW = W / S, kA = A / W;
    const u = sc * kW, uA = u * kA;             // px per unit at W / at A
    const n = W * W, nA = A * A;
    // one RNG stream per feature, so a 384 preview and a 2048 export place the same drips
    const dripRand = rng(hashSeed("graffiti-drips", ctx.seed));
    const rand = rng(hashSeed("graffiti", ctx.seed));
    const glintRand = rng(hashSeed("graffiti-glints", ctx.seed));
    const ink = inkOf(ctx.palette);
    const inkRGB = hexToRgb(ink);
    // a near-black second outline would vanish into the black one: use the lightest palette colour
    const outerHex = !isInkLike(p.outer) ? p.outer
      : [ctx.palette?.accent, ctx.palette?.light, "#FFFFFF"].find((c) => c && luminance(c) > 0.4);
    const lum709 = (d, j) => (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;

    /* ── 1. read the logo at W (fill) and A (analysis) ── */
    const small = W === S ? src : resizeCanvas(src, W, W);
    const sd = getPixels(small).data;
    const alpha = new Float32Array(n), lum = new Float32Array(n), dark = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = sd[j + 3] / 255;
      if (a <= 0) continue;
      alpha[i] = a;
      const L = lum709(sd, j);
      lum[i] = L;
      dark[i] = a * smoothstep(0.34, 0.24, L);
    }
    const ad = A === W ? sd : getPixels(resizeCanvas(small, A, A)).data;
    const alphaA = new Float32Array(nA), darkA = new Float32Array(nA), inkA = new Float32Array(nA);
    let opaque = 0, inkArea = 0;
    for (let i = 0, j = 0; i < nA; i++, j += 4) {
      const a = ad[j + 3] / 255;
      if (a <= 0) continue;
      alphaA[i] = a;
      const L = lum709(ad, j);
      darkA[i] = a * smoothstep(0.34, 0.24, L);
      inkA[i] = a * smoothstep(0.13, 0.08, L);
      opaque += a; inkArea += inkA[i];
    }
    const inkIsKey = inkArea < opaque * 0.5; // a mostly-black logo: black is its fill

    /* ── 2. keylines = black ink + thin dark strokes (classified at A) ── */
    const rThin = THIN * uA;
    const din = insideDistance(darkA, A, A, 0.5);
    for (let i = 0; i < nA; i++) din[i] = din[i] - 0.5 > rThin ? 1 : 0; // → thick cores
    const toCore = outsideDistance(din, A, A, 0.5);
    const selA = new Float32Array(nA);          // 1 where dark ink is a keyline
    const keyA = new Float32Array(nA);
    let keyArea = 0;
    for (let i = 0; i < nA; i++) {
      let s = toCore[i] === 0 ? 0 : 1 - smoothstep(rThin + 1, rThin - 0.5, toCore[i]);
      if (inkIsKey && inkA[i] > 0.5) s = 1;
      selA[i] = s;
      keyA[i] = darkA[i] * s;
      keyArea += keyA[i];
    }
    const sel = upsample(selA, A, W);
    const key = new Float32Array(n);
    for (let i = 0; i < n; i++) key[i] = dark[i] * sel[i];

    /* ── 3. the solid silhouette (line art: enclosed areas fill in; bubble: inflated) ── */
    const lineArt = keyArea > opaque * 0.55;
    let solid = lineArt ? enclosed(alpha, W) : alpha;   // flood fill at W: hairlines don't leak
    let solidA = lineArt ? downsample(solid, W, A) : alphaA;
    if (p.fill === "bubble") {
      const soft = blurMask(dilateMask(solidA, A, A, BUBBLE * uA), A, A, 5 * uA);
      solidA = new Float32Array(nA);
      for (let i = 0; i < nA; i++) solidA[i] = Math.max(smoothstep(0.4, 0.6, soft[i]), alphaA[i]);
      const softW = upsample(soft, A, W);
      const edge = 0.5 / Math.max(1, 5 * u); // ≈1 px AA ramp at W
      const s2 = new Float32Array(n);
      for (let i = 0; i < n; i++) s2[i] = Math.max(clamp((softW[i] - 0.5) / edge + 0.5), solid[i]);
      solid = s2;
    }
    const sb = maskBounds(solid, W, W, 0.3);
    if (sb.empty) return createCanvas(S, S);
    const y0 = sb.y0, yh = Math.max(1, sb.y1 - sb.y0);
    const x0 = sb.x0, xw = Math.max(1, sb.x1 - sb.x0);

    /* ── 4. fill tones ── */
    const wt = new Float32Array(n);
    for (let i = 0; i < n; i++) wt[i] = alpha[i] * (1 - key[i]);
    const { centres, dom } = toneClusters(lum, wt, n);
    // the dominant ink takes the fill; if that ink is dark (a navy ring with white
    // lettering, say) it takes a deeper shade so the lighter inks keep their contrast
    const anchor = centres[dom] < 0.35 && dom < centres.length - 1 ? dom + 1 : dom;
    const levels = centres.map((_, k) => clamp(k - anchor, -2, 2));
    const chrome = p.fill === "chrome";
    const flat = p.fill === "flat" || p.fill === "bubble";
    const top = chrome ? p.top : liftForKeylines(usableFill(p.top, p.bottom));
    const bot = chrome ? p.bottom : liftForKeylines(usableFill(p.bottom, p.top));
    const lutFor = (level) => {
      if (chrome) {
        // team-tinted chrome: silver-blue sky over a sharp horizon, warm "ground" below
        // a near-black "bottom" would sink the ground into mud: reflect the top colour there
        const sky = liftForKeylines(top, 0.2), ground = isInkLike(bot) ? (isInkLike(top) ? "#8A7A62" : top) : bot;
        const tc = (h) => (level < 0 ? mix(h, "#15181D", level < -1 ? 0.55 : 0.35) : level > 0 ? mix(h, "#FFFFFF", level > 1 ? 0.55 : 0.3) : h);
        return gradientLUT([
          { at: 0.0, color: tc("#FFFFFF") },
          { at: 0.16, color: tc(mix("#EEF3F9", sky, 0.12)) },
          { at: 0.4, color: tc(mix("#8EA0B6", sky, 0.4)) },
          { at: 0.475, color: tc(mix("#2C3542", sky, 0.25)) },
          { at: 0.5, color: tc("#101318") },
          { at: 0.525, color: tc(mix("#4A3D2C", ground, 0.45)) },
          { at: 0.66, color: tc(mix("#E3D3B4", ground, 0.45)) },
          { at: 0.84, color: tc("#FFFBF2") },
          { at: 1.0, color: tc(mix("#A8977A", ground, 0.4)) },
        ]);
      }
      if (flat) {
        // two-colour flat: the dominant ink takes the top colour, darker inks the bottom colour
        const c = level >= 0 ? toneOf(top, level) : toneOf(bot, level + 1);
        return gradientLUT([{ at: 0, color: c }, { at: 1, color: c }]);
      }
      // two team colours meeting at a light "horizon" band (no muddy RGB midpoint)
      const a = toneOf(top, level), b = toneOf(bot, level);
      const band = mix(mix(a, b, 0.5), "#FFFFFF", level < 0 ? 0.12 : 0.42);
      return gradientLUT([
        { at: 0, color: lighten(a, 0.05) }, { at: 0.3, color: a }, { at: 0.45, color: mix(a, band, 0.55) },
        { at: 0.52, color: band }, { at: 0.6, color: mix(b, band, 0.45) }, { at: 0.78, color: b }, { at: 1, color: darken(b, 0.06) },
      ]);
    };
    const luts = levels.map(lutFor);

    // the visible fill (silhouette minus keylines) carries the volume + highlights
    const visA = new Float32Array(nA);
    for (let i = 0; i < nA; i++) visA[i] = solidA[i] * (1 - keyA[i]);
    const blurV = upsample(blurMask(visA, A, A, 7 * uA), A, W);
    const vis = new Float32Array(n);
    for (let i = 0; i < n; i++) vis[i] = solid[i] * (1 - key[i]);

    // chrome: bevelled normals bend the reflection bands
    let nyW = null, nxW = null;
    if (chrome) {
      const nr = normalsFromHeight(heightFromMask(visA, A, A, 16 * uA), A, A, 16 * uA);
      nxW = upsample(nr.nx, A, W);
      nyW = upsample(nr.ny, A, W);
    }
    const noise = makeNoise2D(hashSeed("graffiti-n", ctx.seed));
    const glowAmt = chrome ? 0.25 : 0.55, shadeAmt = chrome ? 0.2 : 0.3;
    const vo = Math.max(1, Math.round(9 * u));
    const fillImg = ctx2d(createCanvas(1, 1)).createImageData(W, W);
    const fd = fillImg.data;
    const nc = centres.length, Ld = centres[dom];
    for (let y = 0; y < W; y++) {
      const ty = (y - y0) / yh;
      const yu = Math.max(0, y - vo) * W, yd = Math.min(W - 1, y + vo) * W;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = solid[i];
        if (a <= 0.002) continue;
        // tone: interpolate between neighbouring cluster levels (AA edges stay smooth)
        const L = alpha[i] > 0.05 ? lum[i] : Ld;
        let k0 = 0;
        while (k0 < nc - 1 && L > centres[k0 + 1]) k0++;
        let k1 = k0, f = 0;
        if (L > centres[k0] && k0 < nc - 1) { k1 = k0 + 1; f = smoothstep(0.3, 0.7, (L - centres[k0]) / (centres[k1] - centres[k0])); }
        let t = ty;
        // chrome: up-facing bevels reflect the sky, down-facing ones the ground
        if (nyW) t = 0.5 + (ty - 0.5) * 0.8 + nyW[i] * 0.55 + nxW[i] * 0.08 + 0.03 * noise(x / (70 * u), y / (70 * u));
        const q = Math.round(clamp(t) * 255) * 3;
        const P = luts[k0], Q = luts[k1];
        const bi = blurV[i];
        let glow = clamp((bi - blurV[yu + Math.max(0, x - vo)]) * 1.7) * glowAmt;
        if (nyW) {
          const nl = -0.55 * nxW[i] - 0.65 * nyW[i];          // light from the top-left
          if (nl > 0.25) glow = Math.max(glow, Math.pow((nl - 0.25) / 0.75, 2) * 0.9);
        }
        const shade = 1 - clamp((bi - blurV[yd + Math.min(W - 1, x + vo)]) * 1.7) * shadeAmt;
        const r = (P[q] + (Q[q] - P[q]) * f) * shade;
        const g = (P[q + 1] + (Q[q + 1] - P[q + 1]) * f) * shade;
        const b = (P[q + 2] + (Q[q + 2] - P[q + 2]) * f) * shade;
        const j = i * 4;
        fd[j] = r + (255 - r) * glow;
        fd[j + 1] = g + (255 - g) * glow;
        fd[j + 2] = b + (255 - b) * glow;
        // no fill under the keylines (black is underneath), so no colour seams at their edges
        fd[j + 3] = a * (1 - key[i]) * 255 + 0.5;
      }
    }

    /* ── 5. thin inner highlight edge (white, inset, top-left of every big fill area) ── */
    const hl = new Float32Array(n);
    {
      const g = 2.4 * u, d = Math.max(0.9, 3.4 * u);
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (vis[i] < 0.02 || blurV[i] < 0.35) continue;
          const a1 = sampleBilinear(vis, W, W, x - g, y - g);
          if (a1 < 0.02) continue;
          hl[i] = vis[i] * a1 * (1 - sampleBilinear(vis, W, W, x - g - d, y - g - d)) * smoothstep(0.35, 0.6, blurV[i]);
        }
      }
    }

    /* ── 6. outlines (distance field at A, upsampled), drips ── */
    const odA = outsideDistance(solidA, A, A, 0.5);
    const od = upsample(odA, A, W, 1 / kA);
    const rBlack = (p.fill === "bubble" ? OUTLINE * 0.8 : OUTLINE) * u;
    const rOuter = rBlack + OUTER * u;
    const rLine = rOuter + LINE * u;            // thin black line around the coloured outline
    const black = within(od, n, rBlack);
    const outer = within(od, n, rOuter);
    const line = within(od, n, rLine);
    const outerA = within(odA, nA, rOuter * kA);
    const lineA = within(odA, nA, rLine * kA);
    // drip sites are chosen on a fixed 256 grid (same picks at every output size)
    const DG = 256, uG = DG / 1024;
    const drips = dripSites(resampleTo(outerA, A, DG), DG, uG, p.drips / 100, dripRand, DG - (MARGIN + LINE + p.depth) * uG)
      .map((d) => ({ x: (d.x * A) / DG, y: (d.y * A) / DG, w: (d.w * A) / DG, len: (d.len * A) / DG }));
    if (drips.length) {
      const raster = (R, mask, nn, stroke) => {
        const c = createCanvas(R, R);
        const cx = ctx2d(c);
        const path = new Path2D();
        for (const d of drips) dripPath(path, d, R / A);
        cx.fillStyle = cx.strokeStyle = "#000";
        cx.fill(path);
        if (stroke) { cx.lineWidth = stroke * 2; cx.lineJoin = "round"; cx.stroke(path); }
        const dd = getPixels(c).data;
        for (let i = 0, j = 3; i < nn; i++, j += 4) if (dd[j]) mask[i] = Math.max(mask[i], dd[j] / 255);
      };
      raster(W, outer, n, 0);
      raster(W, line, n, LINE * u);
      raster(A, lineA, nA, LINE * uA);
    }
    const outerCanvas = maskToCanvas(outer, W, W, outerHex);
    const lineCanvas = maskToCanvas(line, W, W, ink);

    /* ── 7. 3-D block: the outer shape swept 0..depth px down-right ── */
    const dPx = p.depth * u;
    let extCanvas = null;
    if (dPx >= 0.75) {
      // shading at A: distance back along the diagonal + the swept edge's orientation
      const dA = dPx * kA;
      const c = new Float32Array(nA);
      for (let y = 0; y < A; y++) {
        for (let x = 0; x < A; x++) {
          const i = y * A + x;
          c[i] = lineA[i] >= 0.5 ? 0 : x > 0 && y > 0 ? c[i - A - 1] + 1 : 1e9;
        }
      }
      const soft = blurMask(lineA, A, A, Math.max(1, 3 * uA));
      const shadeCanvas = createCanvas(A, A);
      const sx = ctx2d(shadeCanvas);
      const img = sx.createImageData(A, A);
      const ed = img.data;
      const bc = blockColors([p.top, p.bottom, outerHex], ink);
      const lit = hexToRgb(bc.lit);
      const deep = hexToRgb(bc.deep);
      for (let y = 0; y < A; y++) {
        for (let x = 0; x < A; x++) {
          const i = y * A + x;
          const ci = Math.min(c[i], dA + 2);
          if (c[i] > dA + 3) continue;
          let v = 0.5;
          if (ci > 0) {
            const ox = x - Math.min(ci, x), oy = y - Math.min(ci, y);
            const si = Math.min(A - 2, Math.max(1, oy)) * A + Math.min(A - 2, Math.max(1, ox));
            const gx = soft[si + 1] - soft[si - 1], gy = soft[si + A] - soft[si - A];
            const gl = Math.hypot(gx, gy) || 1;
            const face = smoothstep(0.3, 0.7, 0.5 + 0.5 * (-gx + gy) / gl); // 1 = right-facing
            v = clamp((0.12 + face * 0.88) * (1 - 0.45 * clamp(ci / Math.max(1, dA))));
          }
          const j = i * 4;
          ed[j] = deep[0] + (lit[0] - deep[0]) * v;
          ed[j + 1] = deep[1] + (lit[1] - deep[1]) * v;
          ed[j + 2] = deep[2] + (lit[2] - deep[2]) * v;
          ed[j + 3] = 255;
        }
      }
      sx.putImageData(img, 0, 0);
      // crisp alpha at W: union of shifted copies (log-step doubling)
      let cur = createCanvas(W, W), nxt = createCanvas(W, W);
      ctx2d(cur).drawImage(lineCanvas, 0, 0);
      let span = 0;
      while (span < dPx) {
        const s = Math.min(span + 1, dPx - span);
        const nx = ctx2d(nxt);
        nx.clearRect(0, 0, W, W);
        nx.drawImage(cur, 0, 0);
        nx.drawImage(cur, s, s);
        span += s;
        const t = cur; cur = nxt; nxt = t;
      }
      const cx = ctx2d(cur);
      cx.globalCompositeOperation = "source-in";
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = "high";
      cx.drawImage(shadeCanvas, 0, 0, W, W);
      extCanvas = cur;
    }

    /* ── 8. compose at S ── */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    const up = (cv) => o.drawImage(cv, 0, 0, S, S);
    const kS = S / A;

    // overspray: fine particles with a gaussian falloff around the outer outline, in the
    // outline colour — or, when that is dark (it would read as a smudge), the lightest fill
    const lightest = [top, bot].sort((a, b) => luminance(b) - luminance(a))[0];
    const sprayInk = luminance(outerHex) > 0.16 ? outerHex : luminance(lightest) > 0.16 ? lightest : "#FFFFFF";
    if (p.spray > 0) {
      const amt = p.spray / 100;
      const sigma = (10 + 16 * amt) * uA;               // A px
      const peak = (0.05 + 0.13 * amt) * (ctx.quality === "preview" ? 0.75 : 1); // per unit²
      const rO = rLine * kA, reach = rO + sigma * 3.2;
      const edgeLim = MARGIN * uA;
      // only visit coarse cells that touch the halo band
      const cell = Math.max(4, Math.round(sigma));
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      // particles that would be sub-pixel at this size: fewer, a little larger, same coverage
      const radMul = Math.max(1, 0.6 / (0.8 * sc));
      const perCell = ((cell * cell) / (uA * uA)) * peak / (radMul * radMul);
      for (let cy = 0; cy < A; cy += cell) {
        for (let cx = 0; cx < A; cx += cell) {
          const mx = Math.min(A - 1, cx + cell / 2), my = Math.min(A - 1, cy + cell / 2);
          const dc = odA[(my | 0) * A + (mx | 0)];
          if (dc > reach + cell || dc < rO - cell * 1.5) continue;
          let m = Math.floor(perCell) + (rand() < perCell % 1 ? 1 : 0);
          while (m-- > 0) {
            const x = cx + rand() * cell, y = cy + rand() * cell;
            const r1 = rand(), r2 = rand(), r3 = rand();
            if (x < edgeLim || y < edgeLim || x > A - edgeLim || y > A - edgeLim) continue;
            const dd = sampleBilinear(odA, A, A, x, y) - rO;
            if (dd < -1) continue;
            if (r1 > Math.exp(-0.5 * (dd / sigma) * (dd / sigma))) continue;
            const rad = (0.45 + r2 * r2 * 1.1) * sc * radMul;
            const X = x * kS, Y = y * kS;
            const path = paths[(r3 * 3) | 0];
            path.moveTo(X + rad, Y);
            path.arc(X, Y, rad, 0, TAU);
          }
        }
      }
      // a few heavier spatters
      const spat = new Path2D();
      const nSpat = Math.round(6 + 18 * amt);
      const bx0 = Math.max(0, sb.x0 * kA - reach), by0 = Math.max(0, sb.y0 * kA - reach);
      const bx1 = Math.min(A, sb.x1 * kA + reach), by1 = Math.min(A, sb.y1 * kA + reach);
      for (let m = 0, tries = 0; m < nSpat && tries < 4000; tries++) {
        const x = bx0 + rand() * (bx1 - bx0), y = by0 + rand() * (by1 - by0);
        const dd = sampleBilinear(odA, A, A, x, y) - rO;
        if (dd < 4 * uA || dd > sigma * 2.4 || x < edgeLim * 2 || y < edgeLim * 2 || x > A - edgeLim * 2 || y > A - edgeLim * 2) continue;
        const rad = (1.4 + rand() * 2.6) * sc;
        spat.moveTo(x * kS + rad, y * kS);
        spat.arc(x * kS, y * kS, rad, 0, TAU);
        m++;
      }
      o.fillStyle = sprayInk;
      [0.35, 0.6, 0.9].forEach((a, i) => { o.globalAlpha = a; o.fill(paths[i]); });
      o.globalAlpha = 0.9;
      o.fill(spat);
      o.globalAlpha = 1;
    }

    if (extCanvas) up(extCanvas);
    up(lineCanvas);
    up(outerCanvas);
    up(maskToCanvas(black, W, W, ink));
    const fillCanvas = createCanvas(W, W);
    ctx2d(fillCanvas).putImageData(fillImg, 0, 0);
    up(fillCanvas);
    up(maskToCanvas(hl, W, W, "#FFFFFF"));

    // graffiti "shines": a white dash + dot just inside the top-left edge of big fill areas
    if (!chrome) {
      const cands = [];
      const st = Math.max(1, Math.round(3 * u));
      for (let y = 0; y < W; y += st) {
        for (let x = 0; x < W; x += st) {
          if (hl[y * W + x] > 0.6) cands.push([x, y, (x - x0) / xw + (y - y0) / yh + hash01(Math.round(x / u / 6), Math.round(y / u / 6), 17) * 0.6]);
        }
      }
      cands.sort((a, b) => a[2] - b[2]);
      const picks = [];
      const inset = 13 * u;
      for (const [x, y] of cands) {
        if (picks.length >= 2) break;
        const gx = sampleBilinear(blurV, W, W, x + 1, y) - sampleBilinear(blurV, W, W, x - 1, y);
        const gy = sampleBilinear(blurV, W, W, x, y + 1) - sampleBilinear(blurV, W, W, x, y - 1);
        const gl = Math.hypot(gx, gy);
        if (gl < 1e-4) continue;
        const nx = gx / gl, ny = gy / gl;                     // inward normal
        const px = x + nx * inset, py = y + ny * inset;
        const pi = clamp(Math.round(py), 0, W - 1) * W + clamp(Math.round(px), 0, W - 1);
        if (vis[pi] < 0.95 || blurV[pi] < 0.8) continue;
        if (picks.some((q) => Math.hypot(q[0] - px, q[1] - py) < 170 * u)) continue;
        picks.push([px, py, nx, ny]);
      }
      o.strokeStyle = o.fillStyle = "#FFFFFF";
      o.lineCap = "round";
      o.globalAlpha = 0.92;
      for (const [px, py, nx, ny] of picks) {
        const X = px / kW, Y = py / kW, tx = -ny, ty = nx;    // along the edge
        const len = 24 * sc, w = 6.5 * sc;
        o.lineWidth = w;
        o.beginPath();
        o.moveTo(X - tx * len * 0.5, Y - ty * len * 0.5);
        o.lineTo(X + tx * len * 0.5, Y + ty * len * 0.5);
        o.stroke();
        o.beginPath();
        o.arc(X + tx * (len * 0.5 + 9 * sc), Y + ty * (len * 0.5 + 9 * sc), w * 0.55, 0, TAU);
        o.fill();
      }
      o.globalAlpha = 1;
    }

    // keylines from the full-resolution source, kept where the analysis said "keyline"
    {
      const img = getPixels(src);
      const d = img.data;
      for (let j = 0; j < d.length; j += 4) {
        const a = d[j + 3];
        if (!a) continue;
        const L = lum709(d, j);
        d[j] = inkRGB[0]; d[j + 1] = inkRGB[1]; d[j + 2] = inkRGB[2];
        d[j + 3] = a * smoothstep(0.34, 0.24, L);
      }
      const kc = createCanvas(S, S);
      const kx = ctx2d(kc);
      kx.putImageData(img, 0, 0);
      kx.globalCompositeOperation = "destination-in";
      kx.imageSmoothingEnabled = true;
      kx.imageSmoothingQuality = "high";
      kx.drawImage(maskToCanvas(selA, A, A, "#000"), 0, 0, S, S);
      o.drawImage(kc, 0, 0);
    }

    // 4-point sparkle glints sitting on the black outline where it faces the light (top-left)
    {
      const cands = [];
      const rB = rBlack * kA;
      const GG = 300, kg = A / GG;               // a fixed grid: same glints at every size
      for (let gy = 1; gy < GG - 1; gy++) {
        for (let gx = 1; gx < GG - 1; gx++) {
          const x = (gx + 0.5) * kg, y = (gy + 0.5) * kg;
          const dd = sampleBilinear(odA, A, A, x, y);
          if (dd < rB * 0.35 || dd > rB * 0.75) continue;
          const ddx = sampleBilinear(odA, A, A, x + 1, y) - sampleBilinear(odA, A, A, x - 1, y);
          const ddy = sampleBilinear(odA, A, A, x, y + 1) - sampleBilinear(odA, A, A, x, y - 1);
          const gl = Math.hypot(ddx, ddy) || 1;
          if ((ddx + ddy) / gl > -0.9) continue; // outward normal must point up-left
          cands.push([x, y, (x / kA - x0) / xw + (y / kA - y0) / yh + hash01(gx, gy, 29) * 0.9]);
        }
      }
      cands.sort((a, b) => a[2] - b[2]);
      const picks = [];
      for (const c of cands) {
        if (picks.length >= 3) break;
        if (picks.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < 230 * uA)) continue;
        picks.push(c);
      }
      picks.forEach((c, i) => sparkle(o, c[0] * kS, c[1] * kS, (i === 0 ? 44 : 22 + glintRand() * 12) * sc));
    }
    return out;
  },
};
