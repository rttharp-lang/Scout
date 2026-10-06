// "Chenille" — a sewn letterman-jacket patch. The logo becomes loop-pile chenille
// (thousands of tiny lit yarn loops, soft fibres escaping at the edge, puffy pillow
// shading with grooves where two colors of yarn meet), mounted on a cut felt backing
// (dilated + closed silhouette, matte fibre texture, zigzag-stitched edge) with an
// optional second felt layer, and a soft contact shadow under every layer.
//
// Structure (see halftone.js):
//   1. fields at W ≤ 1024: logo signed distance, felt shapes (dilate + closing), yarn-region
//      distance (grooves), puff height → light map, blurred shadow masks;
//   2. the pile is vector: loops / fibres stroked onto a grey "pile" canvas at S, so it
//      stays crisp at 2048 and loop size scales with ctx.scale;
//   3. one per-pixel pass at S composites shadow → felt(s) → chenille;
//   4. stitches are vector zigzags along traced felt contours.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, alphaMask, signedDistance, insideDistance, blurMask,
  traceContours, clamp, supportsCanvasFilter, smoothstep, hexToRgb, nearestColorIndex, rng, hashSeed,
} from "../core.js";
import { extractPalette } from "../image.js";

const TAU = Math.PI * 2;

/* ───────────────────────────── helpers ───────────────────────────── */

function bilinear(map, W, xw, yw) {
  if (xw < 0) xw = 0; else if (xw > W - 1) xw = W - 1;
  if (yw < 0) yw = 0; else if (yw > W - 1) yw = W - 1;
  const x0 = xw | 0, y0 = yw | 0;
  const x1 = x0 < W - 1 ? x0 + 1 : x0, y1 = y0 < W - 1 ? y0 + 1 : y0;
  const fx = xw - x0, fy = yw - y0;
  const a = map[y0 * W + x0], b = map[y0 * W + x1], c = map[y1 * W + x0], e = map[y1 * W + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
}

/** shiftMap(a, F, dx, dy) → a sampled at (p − (dx, dy)) (constant bilinear weights; 0 outside). */
function shiftMap(a, F, dx, dy) {
  const out = new Float32Array(a.length);
  const ox = Math.floor(-dx), oy = Math.floor(-dy);
  const tx = -dx - ox, ty = -dy - oy;
  for (let y = 0; y < F; y++) {
    const y0 = y + oy, y1 = y0 + 1;
    if (y1 < 0 || y0 >= F) continue;
    for (let x = 0; x < F; x++) {
      const x0 = x + ox, x1 = x0 + 1;
      if (x1 < 0 || x0 >= F) continue;
      const v00 = y0 >= 0 && x0 >= 0 ? a[y0 * F + x0] : 0, v10 = y0 >= 0 && x1 < F ? a[y0 * F + x1] : 0;
      const v01 = y1 < F && x0 >= 0 ? a[y1 * F + x0] : 0, v11 = y1 < F && x1 < F ? a[y1 * F + x1] : 0;
      out[y * F + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
  }
  return out;
}

/** Value-noise lattice (G×G of [-1,1]) for cheap, deterministic fibre/felt texture. */
function lattice(G, seed) {
  const r = rng(seed);
  const g = new Float32Array(G * G);
  for (let i = 0; i < g.length; i++) g[i] = r() * 2 - 1;
  return g;
}
function vnoise(g, G, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let fx = x - x0, fy = y - y0;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % G) + G) % G, ya = ((y0 % G) + G) % G;
  const xb = (xa + 1) % G, yb = (ya + 1) % G;
  const a = g[ya * G + xa], b = g[ya * G + xb], c = g[yb * G + xa], d = g[yb * G + xb];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** RGB of the nearest opaque logo pixel for every pixel within `band` px of the logo (W res). */
function extendColors(small, mask, W, band) {
  const { data } = getPixels(small);
  const n = W * W;
  const rgb = new Uint8ClampedArray(n * 3);
  const dist = new Uint8Array(n).fill(255);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] >= 0.5) {
      rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2];
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  const lim = Math.min(250, Math.ceil(band));
  while (head < tail) {
    const i = queue[head++];
    const dn = dist[i] + 1;
    if (dn > lim) continue;
    const x = i % W;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < n - W ? i + W : -1];
    for (let k = 0; k < 4; k++) {
      const j = nb[k];
      if (j < 0 || dist[j] <= dn) continue;
      dist[j] = dn;
      rgb[j * 3] = rgb[i * 3]; rgb[j * 3 + 1] = rgb[i * 3 + 1]; rgb[j * 3 + 2] = rgb[i * 3 + 2];
      queue[tail++] = j;
    }
  }
  return rgb;
}

/** Distance (W px) of every logo pixel to the edge of its own yarn color region. */
function regionDistance(small, mask, W) {
  const tiny = resizeCanvas(small, Math.min(W, 160), Math.min(W, 160));
  const pal = extractPalette(tiny, 6, { maxSamples: 6000 });
  const list = (pal.length ? pal : [{ hex: "#808080" }]).map((c) => hexToRgb(c.hex));
  const { data } = getPixels(small);
  const n = W * W;
  const label = new Int8Array(n);
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (mask[i] < 0.5) { label[i] = -1; continue; }
    const key = ((data[j] >> 3) << 10) | ((data[j + 1] >> 3) << 5) | (data[j + 2] >> 3);
    let k = cache[key];
    if (k < 0) k = cache[key] = nearestColorIndex(data[j], data[j + 1], data[j + 2], list);
    label[i] = k;
  }
  const interior = new Float32Array(n);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, l = label[i];
      if (l < 0) continue;
      if (x > 0 && label[i - 1] !== l) continue;
      if (x < W - 1 && label[i + 1] !== l) continue;
      if (y > 0 && label[i - W] !== l) continue;
      if (y < W - 1 && label[i + W] !== l) continue;
      interior[i] = 1;
    }
  }
  return insideDistance(interior, W, W);
}

/** Zigzag (or running) stitch path along closed polylines (W px → S px by k). */
function stitchPath(contours, k, amp, pitch, running) {
  const p = new Path2D();
  const half = pitch / 2;
  for (const c0 of contours) {
    const m = c0.length;
    if (m < 3) continue;
    const c = c0.map(([x, y]) => [x * k, y * k]);
    const seg = new Float32Array(m);
    let L = 0;
    for (let i = 0; i < m; i++) {
      const a = c[i], b = c[(i + 1) % m];
      seg[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L += seg[i];
    }
    if (L < pitch * 6) continue;
    const steps = Math.max(6, Math.round(L / half) & ~1);
    const h = L / steps;
    let si = 0, acc = 0;
    for (let s = 0; s < steps; s++) {
      const at = s * h;
      while (si < m - 1 && acc + seg[si] < at) { acc += seg[si]; si++; }
      const a = c[si], b = c[(si + 1) % m];
      const ln = seg[si] || 1;
      const u = clamp((at - acc) / ln);
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      if (running) {
        // dashes: stitch on even steps, gap on odd
        if (s & 1) p.lineTo(x, y); else p.moveTo(x, y);
        continue;
      }
      const nx = -(b[1] - a[1]) / ln, ny = (b[0] - a[0]) / ln;
      const side = s & 1 ? amp : -amp;
      if (s === 0) p.moveTo(x + nx * side, y + ny * side); else p.lineTo(x + nx * side, y + ny * side);
    }
    if (!running) p.closePath();
  }
  return p;
}

function threadHex(rgb, lift) {
  const [r, g, b] = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const t = lum < 0.35 ? lift : -lift * 0.6;
  const f = (v) => Math.round(clamp(t > 0 ? v + (255 - v) * t : v * (1 + t), 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawThread(o, path, rgb, lw, scale) {
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  o.save();
  o.lineJoin = "round"; o.lineCap = "round";
  o.translate(0.5 * scale + 0.2, 0.7 * scale + 0.25);
  o.strokeStyle = "rgba(0,0,0,0.32)";
  o.lineWidth = lw * 1.2;
  o.stroke(path);
  o.restore();
  o.save();
  o.lineJoin = "round"; o.lineCap = "round";
  o.strokeStyle = threadHex(rgb, 0.16);
  o.lineWidth = lw;
  o.stroke(path);
  o.translate(-0.2 * lw, -0.26 * lw);
  o.strokeStyle = `rgba(255,255,255,${lum > 0.6 ? 0.7 : 0.3})`;
  o.lineWidth = lw * 0.38;
  o.stroke(path);
  o.restore();
}

/* ───────────────────────────── pile ───────────────────────────── */

const TILE_CACHE = new Map();

/**
 * A tileable loop-pile tile (T×T, cached per loop size + seed): shade (0 gap … 1 lit loop
 * top) and coverage. Dense overlapping yarn loops on a jittered grid (each with a contact
 * shadow, a body and an upper-left sheen) in three layers so loops tuck under each other,
 * stray hairs on top, then a slight blur — chenille yarn is soft, not wiry.
 */
function pileTile(loopR, seed) {
  const key = `${Math.round(loopR * 8)}|${seed}`;
  const hit = TILE_CACHE.get(key);
  if (hit) return hit;
  const N = 34;
  const T = Math.max(24, Math.round(N * loopR * 0.8));
  const spT = T / N;
  const R = rng(seed ^ 0x5f3759df);
  const layers = [new Path2D(), new Path2D(), new Path2D()];
  const shines = [new Path2D(), new Path2D(), new Path2D()];
  const hairs = new Path2D();
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      // one curl of yarn: a short, open, slightly wobbly arc (never a full ring — the loop's
      // eye is hidden by its neighbours in real pile)
      const px = (gx + 0.5 + (R() - 0.5) * 0.95) * spT, py = (gy + 0.5 + (R() - 0.5) * 0.95) * spT;
      const r = loopR * (0.5 + 0.45 * R());
      const ex = 0.7 + 0.3 * R();
      const a0 = R() * TAU, sweep = TAU * (0.38 + 0.34 * R());
      const L = Math.min(2, (R() * 3) | 0);
      const rot = R() * Math.PI;
      layers[L].moveTo(px + Math.cos(a0) * r * Math.cos(rot) - Math.sin(a0) * r * ex * Math.sin(rot),
        py + Math.cos(a0) * r * Math.sin(rot) + Math.sin(a0) * r * ex * Math.cos(rot));
      layers[L].ellipse(px, py, r, r * ex, rot, a0, a0 + sweep);
      // sheen: the part of the curl that faces the upper left
      const h0 = Math.PI * (1.0 + 0.1 * R()) - rot, h1 = h0 + Math.PI * (0.3 + 0.2 * R());
      shines[L].moveTo(px + Math.cos(h0 + rot) * r * 0.95, py + Math.sin(h0 + rot) * r * 0.95);
      shines[L].ellipse(px, py, r * 0.95, r * 0.95 * ex, rot, h0, h1);
      if (R() < 0.7) {
        const ha = R() * TAU, hl = loopR * (0.6 + 0.9 * R());
        const hx = px + (R() - 0.5) * spT, hy = py + (R() - 0.5) * spT;
        hairs.moveTo(hx, hy);
        hairs.quadraticCurveTo(hx + Math.cos(ha) * hl * 0.5 + (R() - 0.5) * hl * 0.6, hy + Math.sin(ha) * hl * 0.5 + (R() - 0.5) * hl * 0.6,
          hx + Math.cos(ha) * hl, hy + Math.sin(ha) * hl);
      }
    }
  }
  // draw on a 3T canvas (the tile and its 8 neighbours) so strokes and blur wrap seamlessly
  const big = createCanvas(3 * T, 3 * T);
  const x = ctx2d(big);
  const lw = loopR * 0.62;
  x.lineCap = "round"; x.lineJoin = "round";
  const each = (fn) => { for (let oy = 0; oy <= 2 * T; oy += T) for (let ox = 0; ox <= 2 * T; ox += T) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };
  for (let L = 0; L < 3; L++) {
    each(() => {
      x.translate(loopR * 0.16, loopR * 0.22);
      x.strokeStyle = "rgb(52,52,52)";
      x.lineWidth = lw * 1.1;
      x.stroke(layers[L]);
    });
    each(() => {
      x.strokeStyle = L === 2 ? "rgb(158,158,158)" : L === 1 ? "rgb(140,140,140)" : "rgb(124,124,124)";
      x.lineWidth = lw;
      x.stroke(layers[L]);
    });
    if (loopR > 1.2) {
      each(() => {
        x.strokeStyle = "rgba(240,240,240,0.9)";
        x.lineWidth = lw * 0.45;
        x.stroke(shines[L]);
      });
    }
  }
  if (loopR > 1.6) {
    each(() => {
      x.strokeStyle = "rgba(205,205,205,0.55)";
      x.lineWidth = Math.max(0.5, loopR * 0.13);
      x.stroke(hairs);
    });
  }
  const c = createCanvas(T, T);
  const cx = ctx2d(c);
  const soft = loopR * 0.2;
  if (soft > 0.35 && supportsCanvasFilter()) cx.filter = `blur(${soft.toFixed(2)}px)`;
  cx.drawImage(big, -T, -T);
  cx.filter = "none";
  const { data } = getPixels(c);
  const shade = new Float32Array(T * T), cov = new Float32Array(T * T);
  for (let i = 0, j = 0; i < T * T; i++, j += 4) { cov[i] = data[j + 3] / 255; shade[i] = data[j] / 255; }
  const tile = { T, shade, cov };
  TILE_CACHE.set(key, tile);
  if (TILE_CACHE.size > 12) TILE_CACHE.delete(TILE_CACHE.keys().next().value);
  return tile;
}

/** Stray fibres escaping the chenille edge, stroked on a transparent S×S canvas (grey). */
function drawFibres(S, W, sd, kS, loopR, fuzz, seed) {
  const c = createCanvas(S, S);
  if (!(fuzz > 0)) return c;
  const x = ctx2d(c);
  const R = rng(seed ^ 0x9e3779b9);
  const toS = 1 / kS;
  const sp = loopR * 0.62;
  const fibA = new Path2D(), fibB = new Path2D();
  // walk a jittered grid but only keep points in the edge band (cheap reject at W res)
  const band = loopR * 0.8 * kS;
  for (let yy = 0; yy < S; yy += sp) {
    const ywRow = Math.min(W - 1, (yy * kS) | 0) * W;
    for (let xx = 0; xx < S; xx += sp) {
      const q = sd[ywRow + Math.min(W - 1, (xx * kS) | 0)];
      if (q > band + 2 || q < -band - 2) continue;
      const px = xx + (R() - 0.5) * sp, py = yy + (R() - 0.5) * sp;
      const d = bilinear(sd, W, px * kS, py * kS) * toS;
      const r0 = R(), r1 = R(), r2 = R(), r3 = R(), r4 = R();
      if (d > loopR * 0.2 || d < -loopR * 0.7 || r0 > fuzz) continue;
      const gx = bilinear(sd, W, px * kS + 1, py * kS) - bilinear(sd, W, px * kS - 1, py * kS);
      const gy = bilinear(sd, W, px * kS, py * kS + 1) - bilinear(sd, W, px * kS, py * kS - 1);
      const ga = Math.atan2(gy, gx) + (r1 - 0.5) * 2.6;
      const len = loopR * (0.5 + 1.3 * r2 * r2) * (0.5 + fuzz * 0.9);
      const bend = (r3 - 0.5) * len * 0.8;
      const ca = Math.cos(ga), sa = Math.sin(ga);
      const f = r4 < 0.5 ? fibA : fibB;
      f.moveTo(px, py);
      f.quadraticCurveTo(px + ca * len * 0.5 - sa * bend, py + sa * len * 0.5 + ca * bend, px + ca * len, py + sa * len);
    }
  }
  x.lineCap = "round";
  x.strokeStyle = "rgba(150,150,150,0.95)";
  x.lineWidth = Math.max(0.6, loopR * 0.24);
  x.stroke(fibA);
  x.strokeStyle = "rgba(200,200,200,0.8)";
  x.lineWidth = Math.max(0.5, loopR * 0.15);
  x.stroke(fibB);
  return c;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "chenille",
  name: "Chenille",
  category: "retro",
  blurb: "Fuzzy letterman-jacket patch on stitched felt.",
  method: "Chenille patch",
  stage: "team",
  params: [
    { key: "felt", label: "Felt color", type: "color", default: "accent" },
    { key: "border", label: "Felt border", type: "range", min: 8, max: 44, step: 1, default: 22, unit: "px" },
    { key: "double", label: "Second felt", type: "toggle", default: false },
    { key: "felt2", label: "Second felt color", type: "color", default: "secondary" },
    { key: "fuzz", label: "Fuzz", type: "range", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    { key: "loop", label: "Loop size", type: "range", min: 5, max: 16, step: 1, default: 9, unit: "px" },
  ],
  presets: [
    { name: "Letterman", params: { felt: "accent", border: 22, double: false, fuzz: 50, loop: 9 } },
    { name: "Double felt", params: { felt: "accent", border: 18, double: true, felt2: "secondary", fuzz: 45, loop: 9 } },
    { name: "Fuzzy", params: { felt: "accent", border: 24, double: false, fuzz: 100, loop: 13 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const scale = ctx.scale;
    // smooth fields (distances, puff, shadows) at F ≈ S/2; the pile and edges are drawn at S
    const F = Math.min(1024, Math.max(160, Math.round(S / 2)));
    const kS = F / S, toS = S / F;
    const n = F * F;
    const seed = hashSeed("chenille", ctx.seed);
    let _l = performance.now();
    const mark = (k) => { const P = globalThis.__prof; if (P) { const t = performance.now(); P[k] = Math.round(t - _l); _l = t; } };

    const small = resizeCanvas(src, F, F);
    const mask = alphaMask(small);
    // thin line art must survive the half-res fields: boost coverage before thresholding
    for (let i = 0; i < n; i++) mask[i] = mask[i] * 2 > 1 ? 1 : mask[i] * 2;
    const sd = signedDistance(mask, F, F); // F px, negative inside
    mark("sd");

    // ── felt (F px): dilate by the border, then a closing so the cut is smooth like real felt
    const b1 = p.border * scale * kS;
    const close = (0.55 * p.border + 10) * scale * kS;
    const m1 = new Float32Array(n);
    for (let i = 0; i < n; i++) m1[i] = clamp(b1 + close - sd[i] + 0.5);
    // a light blur takes the pixel staircase out of the distance field (smooth felt cut)
    const sdF1 = blurMask(signedDistance(m1, F, F), F, F, 0.9);
    for (let i = 0; i < n; i++) sdF1[i] += close;
    const b2 = p.double ? Math.max(6, 0.72 * p.border) * scale * kS : 0;
    const sdOut = b2 > 0 ? sdF1.map((v) => v - b2) : sdF1; // outermost felt
    mark("felt");

    // ── puff (F): pillow over the whole letter, grooves where two yarn colors meet
    const regD = regionDistance(small, mask, F);
    const loopR = Math.max(0.9, p.loop * 0.5 * scale); // S px
    const bevelG = (16 + p.loop) * scale * kS, bevelR = (5 + p.loop * 0.4) * scale * kS;
    const h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (sd[i] >= 0.5) continue;
      const tg = clamp((-sd[i] + 0.5) / bevelG), ug = 1 - tg;
      const tr = clamp((regD[i] + 0.5) / bevelR), ur = 1 - tr;
      h[i] = Math.sqrt(1 - ug * ug) * (0.6 + 0.4 * Math.sqrt(1 - ur * ur));
    }
    mark("region");
    const hs = blurMask(h, F, F, Math.max(0.6, 1.4 * scale * kS));
    const light = new Float32Array(n).fill(1);
    const strength = (14 + p.loop) * scale * kS * 0.55; // pile height in F px
    const LX = -0.48, LY = -0.62, LZ = 0.62;
    for (let y = 0; y < F; y++) {
      for (let x = 0; x < F; x++) {
        const i = y * F + x;
        if (sd[i] > 3) continue;
        const xa = x > 0 ? i - 1 : i, xb = x < F - 1 ? i + 1 : i;
        const ya = y > 0 ? i - F : i, yb = y < F - 1 ? i + F : i;
        const dx = (hs[xb] - hs[xa]) * 0.5 * strength, dy = (hs[yb] - hs[ya]) * 0.5 * strength;
        const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        light[i] = ((-dx * LX - dy * LY + LZ) * nl) / LZ; // 1 = flat top
      }
    }
    mark("light");

    // ── shadows (F), pre-shifted down-right: chenille on felt, felt on felt, patch on garment
    const chenSh = shiftMap(blurMask(mask, F, F, Math.max(0.7, 3.4 * scale * kS)), F, 3.0 * scale * kS, 3.9 * scale * kS);
    const f1cov = new Float32Array(n);
    for (let i = 0; i < n; i++) f1cov[i] = clamp(0.5 - sdF1[i]);
    const feltSh = b2 > 0 ? shiftMap(blurMask(f1cov, F, F, Math.max(0.6, 1.8 * scale * kS)), F, 2 * scale * kS, 2.6 * scale * kS) : null;
    const outCov = b2 > 0 ? sdOut.map((v) => clamp(0.5 - v)) : f1cov;
    const patchSh = shiftMap(blurMask(outCov, F, F, Math.max(0.8, 4.5 * scale * kS)), F, 3.2 * scale * kS, 4.2 * scale * kS);
    const shReach = 18 * scale + 2;
    mark("shadows");

    // ── pile tile, edge fibres, yarn colors beyond the logo edge
    const fuzz = p.fuzz / 100;
    const tile = pileTile(loopR, seed);
    const { T } = tile;
    const tShade = tile.shade, tCov = tile.cov;
    const fd = getPixels(drawFibres(S, F, sd, kS, loopR, fuzz, seed)).data;
    const reach = loopR * (0.4 + 0.9 * fuzz); // how far loops poke past the edge (S px)
    const ext = extendColors(small, mask, F, (loopR * 2.6 + 3 * scale) * kS + 2);
    const sdat = getPixels(src).data;
    mark("pile");

    const felt1 = hexToRgb(p.felt), felt2 = hexToRgb(p.felt2);
    const G = 64;
    const n1 = lattice(G, seed + 1), n2 = lattice(G, seed + 2);
    const fCell1 = 1 / Math.max(1.2, 2.2 * scale), fCell2 = 1 / Math.max(4, 14 * scale);
    const GAP = 0.34;

    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const d = img.data;
    // per-column bilinear setup (the same for every F-res map)
    const cx0 = new Int32Array(S), cfx = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      const xw = clamp((x + 0.5) * kS - 0.5, 0, F - 1.001);
      cx0[x] = xw | 0; cfx[x] = xw - (xw | 0);
    }
    for (let y = 0; y < S; y++) {
      const yw = clamp((y + 0.5) * kS - 0.5, 0, F - 1.001);
      const y0 = yw | 0, fy = yw - y0;
      const rowT = (y % T) * T;
      for (let x = 0; x < S; x++) {
        const fx = cfx[x];
        const i00 = y0 * F + cx0[x], i10 = i00 + 1, i01 = i00 + F, i11 = i01 + 1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const dOut = (sdOut[i00] * w00 + sdOut[i10] * w10 + sdOut[i01] * w01 + sdOut[i11] * w11) * toS;
        if (dOut > shReach) continue;
        const j = (y * S + x) * 4;
        const dS = (sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11) * toS;
        // pile: tiled loops inside, poking out past the edge; stray fibres beyond
        let pa = 0, ps = GAP;
        if (dS < reach) {
          const ti = rowT + (x % T);
          const tc = tCov[ti];
          ps = GAP + (tShade[ti] - GAP) * tc;
          pa = dS <= -0.2 * loopR ? 1 : tc * (1 - smoothstep(-0.2 * loopR, reach, dS));
          const fa = fd[j + 3] / 255;
          if (fa > 0 && dS > -0.5 * loopR) {
            const w = fa * (dS > 0 ? 1 : 0.6);
            ps += (fd[j] / 255 - ps) * w;
            if (fa > pa) pa = fa;
          }
        }
        const aOut = clamp(0.5 - dOut);
        const shA = aOut < 1 ? 0.34 * (patchSh[i00] * w00 + patchSh[i10] * w10 + patchSh[i01] * w01 + patchSh[i11] * w11) : 0;
        if (aOut <= 0 && shA < 0.004 && pa <= 0) continue;
        let R = 0, Gc = 0, B = 0, A = shA; // premultiplied; the shadow is black
        let ft = 1;
        if (aOut > 0) ft = 0.965 + 0.045 * vnoise(n1, G, x * fCell1, y * fCell1) + 0.03 * vnoise(n2, G, x * fCell2 + 7.3, y * fCell2 - 3.1);
        if (b2 > 0 && aOut > 0) {
          // outer felt, shaded where the inner felt sits on it
          const s = 1 - 0.32 * (feltSh[i00] * w00 + feltSh[i10] * w10 + feltSh[i01] * w01 + feltSh[i11] * w11);
          const k = ft * s, q = 1 - aOut;
          R = R * q + felt2[0] * k * aOut; Gc = Gc * q + felt2[1] * k * aOut; B = B * q + felt2[2] * k * aOut; A = A * q + aOut;
        }
        const dF1 = b2 > 0 ? (sdF1[i00] * w00 + sdF1[i10] * w10 + sdF1[i01] * w01 + sdF1[i11] * w11) * toS : dOut;
        const a1 = clamp(0.5 - dF1);
        if (a1 > 0) {
          // inner felt: slight darkening at the cut edge + the chenille's contact shadow
          const edge = 1 - 0.07 * (1 - smoothstep(0, 2.5 * scale + 0.5, -dF1));
          const s = 1 - 0.42 * (chenSh[i00] * w00 + chenSh[i10] * w10 + chenSh[i01] * w01 + chenSh[i11] * w11);
          const k = ft * s * edge, q = 1 - a1;
          R = R * q + felt1[0] * k * a1; Gc = Gc * q + felt1[1] * k * a1; B = B * q + felt1[2] * k * a1; A = A * q + a1;
        }
        // chenille
        const sa = sdat[j + 3] / 255;
        const ca = sa > pa ? sa : pa;
        if (ca > 0) {
          let cr, cg, cb;
          if (sa >= 0.3) { cr = sdat[j]; cg = sdat[j + 1]; cb = sdat[j + 2]; }
          else {
            const e = (fy < 0.5 ? (fx < 0.5 ? i00 : i10) : (fx < 0.5 ? i01 : i11)) * 3;
            cr = ext[e]; cg = ext[e + 1]; cb = ext[e + 2];
          }
          const lt = light[i00] * w00 + light[i10] * w10 + light[i01] * w01 + light[i11] * w11;
          const puff = lt < 0.35 ? 0.35 : lt > 1.5 ? 1.5 : lt;
          const k = puff * (0.52 + 0.6 * ps);
          const lum = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
          const hi = Math.max(0, ps - 0.6) * (0.3 + 0.5 * (1 - lum)) * (puff < 0.6 ? 0.6 : puff > 1.3 ? 1.3 : puff);
          const rr = cr * k, gg = cg * k, bb = cb * k;
          const q = 1 - ca;
          R = R * q + (rr + (255 - rr) * hi) * ca; Gc = Gc * q + (gg + (255 - gg) * hi) * ca; B = B * q + (bb + (255 - bb) * hi) * ca; A = A * q + ca;
        }
        if (A <= 0) continue;
        const m = 1 / A;
        d[j] = R * m; d[j + 1] = Gc * m; d[j + 2] = B * m; d[j + 3] = A * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);
    mark("composite");

    // ── stitching: zigzag over the inner felt's edge, running stitch near the outer edge
    const lw = Math.max(0.8, 1.8 * scale);
    const pitch = Math.max(2.8, 6.4 * scale);
    const negF1 = new Float32Array(n);
    for (let i = 0; i < n; i++) negF1[i] = -sdF1[i];
    if (b2 > 0) {
      const c1 = traceContours(negF1, F, F, 0.3 * scale * kS, 0.5 * kS * toS);
      drawThread(o, stitchPath(c1, toS, Math.max(1.2, 3.2 * scale), pitch, false), felt1, lw, scale);
      const negO = sdOut.map((v) => -v);
      const c2 = traceContours(negO, F, F, Math.min(b2 * 0.45, 5 * scale * kS), 0.5);
      drawThread(o, stitchPath(c2, toS, 0, Math.max(3, 7 * scale), true), felt2, lw, scale);
    } else {
      const inset = Math.min(b1 * 0.42, 6.5 * scale * kS);
      const c1 = traceContours(negF1, F, F, inset, 0.5);
      drawThread(o, stitchPath(c1, toS, Math.max(1.2, 3.2 * scale), pitch, false), felt1, lw, scale);
    }
    mark("stitch");
    return out;
  },
};
