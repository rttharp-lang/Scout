// proto-a · 2.5-D height-field garment photo renderer.
//
// bakeView(garment, viewId, size)  →  colour-independent maps for one view at one size:
//   1. LOW-RES HEIGHT MODEL (≈ size/2): per layer, smooth-max of its volumes
//      ("inflate" = distance-field pillow, "tube" = spine + radius, "cavity" = bowl),
//      plus authored folds (ridges, creases, edge rolls), optionally sitting on the
//      blurred surface below ("on"). Layers stack into a composite height (backdrop −12").
//   2. per layer: gradient (→ normals), cavity AO from multi-scale blurred composite height,
//      soft key-light shadow by marching the composite toward the light, print displacement
//      from the fold relief, and a "no print" field for tagged volumes (sleeves over body).
//   3. FULL-RES: rasterise each layer's parts (role weights, material, fixed colours),
//      composite bottom → top with the low-res fields bilinearly upsampled; draw a detail
//      height map (seams, twin-needle cover stitching, rib wales, braid, bar tacks), and
//      run one lighting pass (key / fill / rim / sky, wrapped diffuse, fleece sheen,
//      Blinn spec, metal env reflections) → diffuse multiplier D and additive spec S.
//   4. drop shadow + contact shadow alpha for the backdrop.
// renderBaked(baked, opts) → canvas: colourise parts in linear light, print graphics INTO
// the fabric (displaced by the fold relief, lit by the same D/S, faint ink texture),
// composite over the backdrop. Recolour / new graphic ≈ one pass over the pixels.
//
// No DOM: OffscreenCanvas when available (worker-friendly), a DOM canvas only as fallback.
import { clamp, smoothstep, bbox as polyBBox } from "./geom.js";

/* ───────────────────────────── canvas & colour utils ───────────────────────────── */

export function makeCanvas(w, h = w) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = globalThis.document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
const ctxRead = (c) => c.getContext("2d", { willReadFrequently: true });

const HEX_RE = /^#?([0-9a-f]{6})$/i;
export function hexRgb(h, fb = [128, 128, 128]) {
  const m = typeof h === "string" && h.trim().match(HEX_RE);
  if (!m) return fb;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export const srgbToLinear = (v) => S2L[v | 0];
// linear → display: soft highlight shoulder then sRGB encode, LUT over [0, 2]
const L2S_N = 8192, L2S_MAX = 2;
const L2S = new Uint8ClampedArray(L2S_N + 1);
{
  const knee = 0.82;
  for (let i = 0; i <= L2S_N; i++) {
    let x = (i / L2S_N) * L2S_MAX;
    if (x > knee) x = knee + (1 - knee) * (1 - Math.exp(-(x - knee) / (1 - knee)));
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    L2S[i] = Math.round(clamp(s, 0, 1) * 255);
  }
}
const L2S_K = L2S_N / L2S_MAX;

/* ───────────────────────────── grid ops ───────────────────────────── */

const BIG = 1e20;
function edt1d(f, d, v, z, n) {
  let k = 0;
  v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}
/** Squared EDT: distance² from each pixel to the nearest pixel where feat[i] is true. */
function edt2(feat, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const out = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = feat[y * w + x] ? 0 : BIG;
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = out[o + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) out[o + x] = d[x];
  }
  return out;
}
/** Signed distance (px), positive inside, from an alpha mask (Uint8 0..255 or Float 0..1). */
function signedDistance(alpha, w, h, isFloat = false) {
  const N = w * h, inside = new Uint8Array(N), outside = new Uint8Array(N);
  const thr = isFloat ? 0.5 : 128;
  for (let i = 0; i < N; i++) { const a = alpha[i] >= thr; inside[i] = a ? 1 : 0; outside[i] = a ? 0 : 1; }
  const dIn = edt2(outside, w, h), dOut = edt2(inside, w, h);
  const sd = new Float32Array(N);
  for (let i = 0; i < N; i++) sd[i] = inside[i] ? Math.sqrt(dIn[i]) - 0.5 : -(Math.sqrt(dOut[i]) - 0.5);
  return sd;
}

function boxH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = src[o] * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[o + Math.min(w - 1, i)];
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc * inv;
      acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
}
function boxV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = src[x] * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[Math.min(h - 1, i) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
}
/** ≈ gaussian blur (3 box passes), sigma in px. Returns a new array. */
export function blur(src, w, h, sigma) {
  const a = Float32Array.from(src);
  if (!(sigma > 0.4)) return a;
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const b = new Float32Array(w * h);
  for (let i = 0; i < 3; i++) { boxH(a, b, w, h, r); boxV(b, a, w, h, r); }
  return a;
}

function sampleBilinear(g, w, h, x, y) {
  x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
}

const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

/* ───────────────────────────── polyline nearest (px space) ───────────────────────────── */

function prepPolyline(pts, closed = false) {
  const P = closed ? pts.concat([pts[0]]) : pts;
  const n = P.length - 1, seg = new Float64Array(n * 6);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ax = P[i][0], ay = P[i][1], dx = P[i + 1][0] - ax, dy = P[i + 1][1] - ay;
    const L = Math.hypot(dx, dy) || 1e-6;
    seg.set([ax, ay, dx, dy, L, total], i * 6);
    total += L;
  }
  return { seg, n, total, closed };
}
/** → [dist, arcFraction, side] ; ends extended as straight lines when `extend`. */
function nearestSeg(pl, px, py, extend, out) {
  const { seg, n, total } = pl;
  let best = Infinity, bt = 0, bs = 1;
  const exStart = extend === true || extend === "start", exEnd = extend === true || extend === "end";
  for (let i = 0; i < n; i++) {
    const o = i * 6, ax = seg[o], ay = seg[o + 1], dx = seg[o + 2], dy = seg[o + 3], L = seg[o + 4];
    let u = ((px - ax) * dx + (py - ay) * dy) / (L * L);
    const lo = exStart && i === 0 ? -1e9 : 0, hi = exEnd && i === n - 1 ? 1e9 : 1;
    if (u < lo) u = lo; else if (u > hi) u = hi;
    const qx = ax + dx * u, qy = ay + dy * u;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < best) {
      best = d2;
      bt = (seg[o + 5] + clamp(u, 0, 1) * L) / total;
      bs = dx * (py - ay) - dy * (px - ax) >= 0 ? 1 : -1;
    }
  }
  out[0] = Math.sqrt(best); out[1] = bt; out[2] = bs;
  return out;
}

/* ───────────────────────────── materials ───────────────────────────── */

const MATERIALS = {
  fleece:   { spec: 0.085, sheen: 0.26, alb: 1.0 },
  rib:      { spec: 0.06, sheen: 0.2, alb: 0.965 },
  lining:   { spec: 0.07, sheen: 0.22, alb: 0.97 },
  interior: { spec: 0.03, sheen: 0.12, alb: 0.84 },
  tape:     { spec: 0.08, sheen: 0.18, alb: 0.93 },
  cord:     { spec: 0.15, sheen: 0.18, alb: 1.0 },
  label:    { spec: 0.04, sheen: 0.04, alb: 1.0 },
  metal:    { spec: 0, sheen: 0, alb: 1, metal: 1 },
};
const SPEC_MAX = 0.25, SHEEN_MAX = 0.5;

/* ───────────────────────────── light rig ───────────────────────────── */

const nrm3 = (x, y, z) => { const L = Math.hypot(x, y, z); return [x / L, y / L, z / L]; };
const KEY = nrm3(-0.5, -0.66, 0.62), FILL = nrm3(0.66, -0.12, 0.74), RIM = nrm3(0.62, -0.58, -0.5);
const KEY_I = 0.96, FILL_I = 0.3, RIM_I = 0.34;
const HKEY = nrm3(KEY[0], KEY[1], KEY[2] + 1), HFILL = nrm3(FILL[0], FILL[1], FILL[2] + 1);
const wrap = (d, w) => { const v = (d + w) / (1 + w); return v > 0 ? v : 0; };
function lightDiffuse(nx, ny, nz, sh) {
  const amb = 0.15 + 0.07 * -ny + 0.03 * nz;
  return amb
    + KEY_I * wrap(nx * KEY[0] + ny * KEY[1] + nz * KEY[2], 0.28) * sh
    + FILL_I * wrap(nx * FILL[0] + ny * FILL[1] + nz * FILL[2], 0.55)
    + RIM_I * wrap(nx * RIM[0] + ny * RIM[1] + nz * RIM[2], 0.05);
}
const D_FLAT = lightDiffuse(0, 0, 1, 1);
const EXPOSURE = 0.92 / D_FLAT;                     // a camera-facing, unoccluded panel = 92 % of its colour

/** Studio environment seen in a mirror direction (metal). */
function envAt(rx, ry, rz) {
  const box = smoothstep(0.72, 0.95, rx * KEY[0] + ry * KEY[1] + rz * KEY[2]);
  const strip = smoothstep(0.82, 0.97, rx * 0.86 + ry * -0.1 + rz * 0.5);
  const sky = smoothstep(-0.3, 0.9, -ry);
  const floor = smoothstep(0.1, 0.8, ry);
  const front = smoothstep(0.55, 0.98, rz);
  return 0.42 + 1.9 * box + 0.9 * strip + 0.35 * sky + 0.45 * front - 0.18 * floor;
}

/* ───────────────────────────── noise tiles ───────────────────────────── */

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Tileable value noise (N×N), smooth, octaves summed; normalised to [-1, 1]. */
function noiseTile(N, cells, octaves, seed) {
  const out = new Float32Array(N * N);
  const R = rng(seed);
  let amp = 1, c = cells, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const g = new Float32Array(c * c);
    for (let i = 0; i < g.length; i++) g[i] = R() * 2 - 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = (x / N) * c, fy = (y / N) * c;
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % c) * c + (x0 % c)], b = g[(y0 % c) * c + ((x0 + 1) % c)];
      const cc = g[((y0 + 1) % c) * c + (x0 % c)], d = g[((y0 + 1) % c) * c + ((x0 + 1) % c)];
      out[y * N + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (cc + (d - cc) * sx) * sy);
    }
    norm += amp; amp *= 0.55; c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
const TILE = 256;
let tiles = null;
function getTiles() {
  if (tiles) return tiles;
  const grain = noiseTile(TILE, 64, 2, 11);      // fine knit grain
  const mottle = noiseTile(TILE, 6, 4, 23);      // heather / brushing mottling
  const ink = noiseTile(TILE, 48, 3, 37);        // ink film
  tiles = { grain, mottle, ink };
  return tiles;
}

/* ───────────────────────────── rasterising ───────────────────────────── */

function tracePolys(ctx, polys, T) {
  for (const poly of polys) {
    if (!poly || poly.length < 2) continue;
    const [x0, y0] = T(poly[0]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < poly.length; i++) { const [x, y] = T(poly[i]); ctx.lineTo(x, y); }
    ctx.closePath();
  }
}
const polysOf = (part) => part.polys || [part.poly];

/** Rasterise parts → { a: Uint8 coverage, roles?: RGBA, mat?: RGBA, fix?: RGBA }. */
function rasterLayer(layer, T, x0, y0, w, h, withAttrs) {
  const Tl = (p) => { const q = T(p); return [q[0] - x0, q[1] - y0]; };
  const draw = (fillFor, skipFixed = false) => {
    const c = makeCanvas(w, h), x = ctxRead(c);
    for (const part of layer.parts) {
      x.save();
      if (part.clip) { x.beginPath(); tracePolys(x, [part.clip], Tl); x.clip(); }
      x.beginPath(); tracePolys(x, polysOf(part), Tl);
      const f = fillFor(part);
      if (f === "erase") { x.globalCompositeOperation = "destination-out"; x.fillStyle = "#000"; }
      else x.fillStyle = f;
      x.fill(part.rule || "nonzero");
      x.restore();
    }
    if (layer.holes) {
      x.globalCompositeOperation = "destination-out";
      x.beginPath(); tracePolys(x, layer.holes, Tl); x.fillStyle = "#000"; x.fill();
    }
    return x.getImageData(0, 0, w, h).data;
  };
  const roles = draw((p) => {
    const m = MATERIALS[p.material] || MATERIALS.fleece;
    const v = Math.round(255 * m.alb);
    return p.role === "trim" ? `rgb(0,${v},0)` : p.role === "accent" ? `rgb(0,0,${v})` : p.role === "fixed" ? "rgb(0,0,0)" : `rgb(${v},0,0)`;
  });
  if (!withAttrs) return { roles };
  const mat = draw((p) => {
    const m = MATERIALS[p.material] || MATERIALS.fleece;
    return `rgb(${Math.round((m.spec / SPEC_MAX) * 255)},${Math.round((m.sheen / SHEEN_MAX) * 255)},${m.metal ? 255 : 0})`;
  });
  const hasFixed = layer.parts.some((p) => p.role === "fixed");
  const fix = hasFixed ? draw((p) => (p.role === "fixed" ? p.color || "#808080" : "erase")) : null;
  return { roles, mat, fix };
}

/* ───────────────────────────── low-res layer heights ───────────────────────────── */

function layerBounds(layer) {
  const polys = [];
  for (const p of layer.parts) polys.push(...polysOf(p));
  return polyBBox(polys);
}

function evalVolume(vol, grid, ctx) {
  const { lw, lh, lx0, ly0 } = grid;
  const { T, ppi } = ctx;
  const out = new Float32Array(lw * lh).fill(-BIG);
  if (vol.type === "inflate" || vol.type === "cavity") {
    const c = makeCanvas(lw, lh), x = ctxRead(c);
    x.beginPath(); tracePolys(x, [vol.shape], (p) => { const q = T(p); return [q[0] - lx0, q[1] - ly0]; });
    x.fillStyle = "#fff"; x.fill();
    const a = x.getImageData(0, 0, lw, lh).data;
    const al = new Uint8Array(lw * lh);
    for (let i = 0; i < al.length; i++) al[i] = a[i * 4 + 3];
    let sd = signedDistance(al, lw, lh);
    sd = blur(sd, lw, lh, Math.max(0.6, 0.12 * vol.R * ppi));
    const R = vol.R * ppi, D = vol.D, z = vol.z || 0, sgn = vol.type === "cavity" ? -1 : 1;
    const tilt = vol.tilt, sb = tilt ? polyBBox([vol.shape]) : null;
    for (let i = 0; i < out.length; i++) {
      const s = sd[i] / R;
      let p;
      if (s >= 1) p = 1;
      else if (s >= 0) { const u = 1 - s; p = Math.sqrt(1 - u * u); }
      else p = -Math.sqrt(s * s - 2 * s);
      let zz = z;
      if (tilt) {
        const [xi, yi] = ctx.toIn((i % lw) + lx0 + 0.5, ((i / lw) | 0) + ly0 + 0.5);
        zz += tilt[0] * (xi - (sb.x0 + sb.x1) / 2) + tilt[1] * (yi - (sb.y0 + sb.y1) / 2);
      }
      out[i] = zz + sgn * D * p;
    }
    return out;
  }
  if (vol.type === "tube") {
    const spine = vol.spine.map((p) => { const q = T(p); return [q[0] - lx0, q[1] - ly0]; });
    const pl = prepPolyline(spine, !!vol.closed);
    let rMax = 0;
    for (let i = 0; i <= 40; i++) rMax = Math.max(rMax, vol.r(i / 40));
    const rPx = rMax * ppi;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [x, y] of spine) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const m = rPx * 1.8 + 3;
    const X0 = Math.max(0, Math.floor(bx0 - m)), X1 = Math.min(lw - 1, Math.ceil(bx1 + m));
    const Y0 = Math.max(0, Math.floor(by0 - m)), Y1 = Math.min(lh - 1, Math.ceil(by1 + m));
    const nr = [0, 0, 0];
    const aspect = vol.aspect ?? 1;
    const zf = vol.z || (() => 0);
    // r(t), z(t) lookup tables
    const LUT = 256, rL = new Float32Array(LUT + 1), zL = new Float32Array(LUT + 1);
    for (let i = 0; i <= LUT; i++) { rL[i] = vol.r(i / LUT); zL[i] = zf(i / LUT); }
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      nearestSeg(pl, x + 0.5, y + 0.5, vol.closed ? false : vol.extend ?? true, nr);
      const ti = Math.round(nr[1] * LUT);
      const r = rL[ti], zz = zL[ti];
      const d = nr[0] / ppi;
      out[y * lw + x] = d < r ? zz + aspect * Math.sqrt(r * r - d * d) : zz - aspect * Math.sqrt(d * d - r * r);
    }
    return out;
  }
  return out;
}

function applyFold(H, f, grid, ctx, dom = null) {
  const { lw, lh, lx0, ly0 } = grid;
  const { T, ppi } = ctx;
  const pts = f.pts.map((p) => { const q = T(p); return [q[0] - lx0, q[1] - ly0]; });
  const pl = prepPolyline(pts, false);
  const w = f.w * ppi;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x, y] of pts) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  const X0 = Math.max(0, Math.floor(bx0 - w - 1)), X1 = Math.min(lw - 1, Math.ceil(bx1 + w + 1));
  const Y0 = Math.max(0, Math.floor(by0 - w - 1)), Y1 = Math.min(lh - 1, Math.ceil(by1 + w + 1));
  const [ta, tb] = f.taper || [0.25, 0.25];
  const nr = [0, 0, 0];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    nearestSeg(pl, x + 0.5, y + 0.5, false, nr);
    const s = nr[0] / w;
    if (s >= 1) continue;
    if (f.side && nr[2] !== f.side) continue;
    const t = nr[1];
    const tp = (ta > 0 ? smoothstep(0, ta, t) : 1) * (tb > 0 ? smoothstep(0, tb, 1 - t) : 1);
    if (tp <= 0) continue;
    let p;
    if (f.profile === "crease" || f.profile === "edge") { const u = 1 - s; p = u * u; }
    else p = 0.5 + 0.5 * Math.cos(Math.PI * s);
    const i = y * lw + x;
    const wd = !dom || !f.on ? 1 : f.on === "sleeve" ? dom[i] : 1 - dom[i];
    H[i] += f.d * p * tp * wd;
  }
}

/* ───────────────────────────── bake ───────────────────────────── */

export function bakeView(garment, viewId, size, { timings } = {}) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let t0 = now();
  const mark = (k) => { if (timings) { const t = now(); timings[k] = (timings[k] || 0) + t - t0; t0 = t; } };
  const view = garment.views[viewId];
  if (!view) throw new Error(`proto-a: no view "${viewId}"`);
  const { k: K, ox, oy } = view.fit;
  const S = size;
  const s = S / 1000;
  const L = Math.min(S, Math.max(300, Math.round(S * 0.5)));   // low-res grid
  const sl = L / 1000;
  const ppiL = K * sl, ppiF = K * s;
  const TL = (p) => [(p[0] * K + ox) * sl, (p[1] * K + oy) * sl];
  const TF = (p) => [(p[0] * K + ox) * s, (p[1] * K + oy) * s];
  const lctx = { T: TL, ppi: ppiL, toIn: (px, py) => [(px / sl - ox) / K, (py / sl - oy) / K] };

  /* ── 1. low-res heights, bottom → top ── */
  const BACKDROP_Z = -12;
  const Hc = new Float32Array(L * L).fill(BACKDROP_Z);
  const layers = [];
  for (const layer of view.layers) {
    const bb = layerBounds(layer);
    const mIn = 1.2;
    const [ax, ay] = TL([bb.x0 - mIn, bb.y0 - mIn]), [bx, by] = TL([bb.x1 + mIn, bb.y1 + mIn]);
    const lx0 = Math.max(0, Math.floor(ax)), ly0 = Math.max(0, Math.floor(ay));
    const lx1 = Math.min(L, Math.ceil(bx)), ly1 = Math.min(L, Math.ceil(by));
    const grid = { lx0, ly0, lw: lx1 - lx0, lh: ly1 - ly0 };
    const N = grid.lw * grid.lh;
    const blendK = layer.blendK ?? 0.9;
    let Hb = null, Hn = null;
    for (const vol of layer.volumes || []) {
      const v = evalVolume(vol, grid, lctx);
      const tagged = layer.noprintTags && vol.tag && layer.noprintTags.includes(vol.tag);
      if (tagged) { if (!Hn) Hn = v; else for (let i = 0; i < N; i++) Hn[i] = smax(Hn[i], v[i], blendK); }
      else { if (!Hb) Hb = v; else for (let i = 0; i < N; i++) Hb[i] = smax(Hb[i], v[i], blendK); }
    }
    const H = new Float32Array(N);
    let noprint = null;
    if (Hn && Hb) {
      noprint = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = Hb[i], b = Hn[i];
        H[i] = a < -1e9 ? b : b < -1e9 ? a : smax(a, b, blendK);
        noprint[i] = smoothstep(-0.05, 0.05, b - a);
      }
    } else H.set(Hb || Hn || new Float32Array(N));
    for (let i = 0; i < N; i++) if (H[i] < -50) H[i] = -50;
    if (layer.wrinkle !== 0) {
      const { mottle, grain } = getTiles();
      // gravity drape: soft undulations stretched vertically
      const amp = layer.wrinkle ?? 0.07, sx = 256 / (5.5 * ppiL), sy = 256 / (16 * ppiL), sx2 = 256 / (2.6 * ppiL), sy2 = 256 / (7 * ppiL);
      for (let y = 0; y < grid.lh; y++) for (let x = 0; x < grid.lw; x++) {
        const X = x + grid.lx0, Y = y + grid.ly0;
        const a = mottle[(((Y * sy) | 0) & 255) * 256 + (((X * sx) | 0) & 255)];
        const b = mottle[(((Y * sy2 + 97) | 0) & 255) * 256 + (((X * sx2 + 31) | 0) & 255)];
        H[y * grid.lw + x] += amp * (a * 0.9 + b * 0.3);
      }
    }
    for (const f of layer.folds || []) applyFold(H, f, grid, lctx, noprint);
    if (layer.on) {
      const below = blur(Hc, L, L, Math.max(0.6, (layer.on.blur ?? 0.6) * ppiL));
      for (let y = 0; y < grid.lh; y++) for (let x = 0; x < grid.lw; x++) {
        const v = below[(y + ly0) * L + x + lx0];
        H[y * grid.lw + x] += Math.max(v, -3);
      }
    }
    // visible coverage at low res → composite
    const { roles } = rasterLayer(layer, TL, lx0, ly0, grid.lw, grid.lh, false);
    const cov = new Float32Array(N);
    for (let i = 0; i < N; i++) cov[i] = roles[i * 4 + 3] / 255;
    for (let y = 0; y < grid.lh; y++) for (let x = 0; x < grid.lw; x++) {
      const i = y * grid.lw + x;
      if (cov[i] >= 0.5) Hc[(y + ly0) * L + x + lx0] = H[i];
    }
    layers.push({ layer, grid, H, noprint, cov });
  }
  mark("heights");

  /* ── 2. per-layer fields: gradient, AO, key shadow, displacement ── */
  const B1 = blur(Hc, L, L, 0.22 * ppiL), B2 = blur(Hc, L, L, 0.9 * ppiL), B3 = blur(Hc, L, L, 2.6 * ppiL);
  mark("ao-blur");
  const lxy = Math.hypot(KEY[0], KEY[1]);
  const dirX = KEY[0] / lxy, dirY = KEY[1] / lxy, rise = KEY[2] / lxy;   // inches of rise per inch
  const stepPx = Math.max(1, ppiL * 0.07), maxIn = 1.4, nSteps = Math.ceil((maxIn * ppiL) / stepPx);
  for (const Ly of layers) {
    const { grid, H } = Ly;
    const { lw, lh, lx0, ly0 } = grid;
    const N = lw * lh;
    const F = new Float32Array(N * 7);      // gx, gy, ao, sh, noprint, dx, dy (interleaved)
    const printable = !!Ly.layer.printable;
    let relief = null, smooth = null;
    if (printable) { smooth = blur(H, lw, lh, 1.0 * ppiL); relief = new Float32Array(N); for (let i = 0; i < N; i++) relief[i] = H[i] - smooth[i]; }
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const i = y * lw + x, o = i * 7;
      const xm = x > 0 ? i - 1 : i, xp = x < lw - 1 ? i + 1 : i, ym = y > 0 ? i - lw : i, yp = y < lh - 1 ? i + lw : i;
      const gx = ((H[xp] - H[xm]) / ((xp - xm) || 1)) * ppiL;
      const gy = ((H[yp] - H[ym]) / ((yp - ym) / lw || 1)) * ppiL;
      F[o] = clamp(gx, -14, 14); F[o + 1] = clamp(gy, -14, 14);
      const gi = (y + ly0) * L + x + lx0, h = H[i];
      const c = 1.1 * Math.max(0, B1[gi] - h) + 0.55 * Math.max(0, B2[gi] - h) + 0.22 * Math.max(0, B3[gi] - h);
      F[o + 2] = Math.exp(-c * 1.15);
      // key-light shadow: march toward the light through the composite
      let occ = 0;
      const gxp = x + lx0 + 0.5, gyp = y + ly0 + 0.5;
      for (let st = 1; st <= nSteps; st++) {
        const dpx = st * stepPx;
        const qx = (gxp + dirX * dpx) | 0, qy = (gyp + dirY * dpx) | 0;
        if (qx < 0 || qy < 0 || qx >= L || qy >= L) break;
        const ray = h + 0.02 + (dpx / ppiL) * rise;
        const dh = Hc[qy * L + qx] - ray;
        if (dh > occ) occ = dh;
      }
      F[o + 3] = 1 - smoothstep(0, 0.45, occ) * 0.55;
      F[o + 4] = Ly.noprint ? Ly.noprint[i] : 0;
      if (printable) {
        const rxm = relief[xm], rxp = relief[xp], rym = relief[ym], ryp = relief[yp];
        const rgx = ((rxp - rxm) / ((xp - xm) || 1)) * ppiL, rgy = ((ryp - rym) / ((yp - ym) / lw || 1)) * ppiL;
        const sgx = clamp(((smooth[xp] - smooth[xm]) / ((xp - xm) || 1)) * ppiL, -1.5, 1.5);
        const sgy = clamp(((smooth[yp] - smooth[ym]) / ((yp - ym) / lw || 1)) * ppiL, -1.5, 1.5);
        // inches: fold relief bends the print, the overall volume wraps it slightly
        F[o + 5] = clamp(-0.18 * rgx - 0.22 * sgx * Math.abs(sgx), -0.6, 0.6);
        F[o + 6] = clamp(-0.18 * rgy - 0.12 * sgy * Math.abs(sgy), -0.6, 0.6);
      }
    }
    // soften the shadow terminator a touch
    const sh = new Float32Array(N);
    for (let i = 0; i < N; i++) sh[i] = F[i * 7 + 3];
    const shb = blur(sh, lw, lh, 0.08 * ppiL);
    for (let i = 0; i < N; i++) F[i * 7 + 3] = shb[i];
    Ly.F = F;
  }
  mark("fields");

  /* ── 3. full-res composite ── */
  // garment bounds at full res (lr = low-res px per full-res px)
  const lr = L / S;
  let gx0 = S, gy0 = S, gx1 = 0, gy1 = 0;
  for (const Ly of layers) {
    const g = Ly.grid;
    gx0 = Math.min(gx0, Math.floor(g.lx0 / lr)); gy0 = Math.min(gy0, Math.floor(g.ly0 / lr));
    gx1 = Math.max(gx1, Math.ceil((g.lx0 + g.lw) / lr)); gy1 = Math.max(gy1, Math.ceil((g.ly0 + g.lh) / lr));
  }
  gx0 = clamp(gx0, 0, S); gy0 = clamp(gy0, 0, S); gx1 = clamp(gx1, 0, S); gy1 = clamp(gy1, 0, S);
  const W = gx1 - gx0, Hh = gy1 - gy0, NF = W * Hh;
  const A = new Float32Array(NF), WB = new Float32Array(NF), WT = new Float32Array(NF), WA = new Float32Array(NF);
  const WF = new Float32Array(NF), FR = new Float32Array(NF), FG = new Float32Array(NF), FB = new Float32Array(NF);
  const GX = new Float32Array(NF), GY = new Float32Array(NF), AO = new Float32Array(NF).fill(1), SH = new Float32Array(NF).fill(1);
  const SPK = new Float32Array(NF), SHN = new Float32Array(NF), MET = new Float32Array(NF);
  const PR = new Float32Array(NF), PG = new Uint8Array(NF), DXb = new Float32Array(NF), DYb = new Float32Array(NF);

  // print area mask (full res, garment bbox)
  const printMask = (() => {
    const c = makeCanvas(W, Hh), x = ctxRead(c);
    const Tl = (p) => { const q = TF(p); return [q[0] - gx0, q[1] - gy0]; };
    x.fillStyle = "#fff";
    for (const poly of view.printArea || []) { x.beginPath(); tracePolys(x, [poly], Tl); x.fill(); }   // union, winding-independent
    if (view.printHoles?.length) { x.globalCompositeOperation = "destination-out"; x.beginPath(); tracePolys(x, view.printHoles, Tl); x.fill(); }
    const d = x.getImageData(0, 0, W, Hh).data;
    const m = new Float32Array(NF);
    for (let i = 0; i < NF; i++) m[i] = d[i * 4 + 3] / 255;
    return m;
  })();
  mark("print-mask");

  for (const Ly of layers) {
    const { grid, F, layer } = Ly;
    const fx0 = Math.max(gx0, Math.floor(grid.lx0 / lr)), fy0 = Math.max(gy0, Math.floor(grid.ly0 / lr));
    const fx1 = Math.min(gx1, Math.ceil((grid.lx0 + grid.lw) / lr)), fy1 = Math.min(gy1, Math.ceil((grid.ly0 + grid.lh) / lr));
    const w = fx1 - fx0, h = fy1 - fy0;
    if (w <= 0 || h <= 0) continue;
    const { roles, mat, fix } = rasterLayer(layer, TF, fx0, fy0, w, h, true);
    const printable = !!layer.printable, group = layer.printGroup || 0;
    const { lw, lh } = grid;
    for (let y = 0; y < h; y++) {
      // low-res sample coordinates (pixel centres)
      const ly = (fy0 + y + 0.5) * lr - 0.5 - grid.ly0;
      const lyc = clamp(ly, 0, lh - 1.001), ly0i = lyc | 0, fyy = lyc - ly0i;
      for (let x = 0; x < w; x++) {
        const ri = (y * w + x) * 4;
        const a = roles[ri + 3] / 255;
        if (a <= 0) continue;
        const gi = (fy0 + y - gy0) * W + (fx0 + x - gx0);
        const lx = (fx0 + x + 0.5) * lr - 0.5 - grid.lx0;
        const lxc = clamp(lx, 0, lw - 1.001), lx0i = lxc | 0, fxx = lxc - lx0i;
        const i00 = (ly0i * lw + lx0i) * 7, i10 = i00 + 7, i01 = i00 + lw * 7, i11 = i01 + 7;
        const w00 = (1 - fxx) * (1 - fyy), w10 = fxx * (1 - fyy), w01 = (1 - fxx) * fyy, w11 = fxx * fyy;
        const smp = (c) => F[i00 + c] * w00 + F[i10 + c] * w10 + F[i01 + c] * w01 + F[i11 + c] * w11;
        const ia = 1 - a;
        A[gi] = a + A[gi] * ia;
        WB[gi] = WB[gi] * ia + a * (roles[ri] / 255);
        WT[gi] = WT[gi] * ia + a * (roles[ri + 1] / 255);
        WA[gi] = WA[gi] * ia + a * (roles[ri + 2] / 255);
        const fa = fix ? fix[ri + 3] / 255 : 0;
        WF[gi] = WF[gi] * ia + a * fa;
        if (fix) {
          FR[gi] = FR[gi] * ia + a * fa * S2L[fix[ri]];
          FG[gi] = FG[gi] * ia + a * fa * S2L[fix[ri + 1]];
          FB[gi] = FB[gi] * ia + a * fa * S2L[fix[ri + 2]];
        } else { FR[gi] *= ia; FG[gi] *= ia; FB[gi] *= ia; }
        GX[gi] = GX[gi] * ia + a * smp(0);
        GY[gi] = GY[gi] * ia + a * smp(1);
        AO[gi] = AO[gi] * ia + a * smp(2);
        SH[gi] = SH[gi] * ia + a * smp(3);
        SPK[gi] = SPK[gi] * ia + a * (mat[ri] / 255) * SPEC_MAX;
        SHN[gi] = SHN[gi] * ia + a * (mat[ri + 1] / 255) * SHEEN_MAX;
        MET[gi] = MET[gi] * ia + a * (mat[ri + 2] / 255);
        let pr = 0;
        if (printable) {
          const np = smp(4);
          pr = printMask[gi] * (1 - smoothstep(0.35, 0.65, np));
          DXb[gi] = DXb[gi] * ia + a * smp(5) * ppiF;
          DYb[gi] = DYb[gi] * ia + a * smp(6) * ppiF;
          if (pr > 0.5) PG[gi] = group;
        }
        PR[gi] = PR[gi] * ia + a * pr;
      }
    }
  }
  mark("composite");

  /* ── detail height map (full res) ── */
  const { height: detail, ao: aoDetail } = drawDetails(view, TF, gx0, gy0, W, Hh, ppiF);
  mark("details");

  /* ── 4. lighting pass ── */
  const { grain, mottle } = getTiles();
  const Dm = new Float32Array(NF), Sp = new Float32Array(NF);
  const FX = new Float32Array(NF * 3);        // lit fixed colour (linear, premultiplied by WF)
  const kDetail = 0.0016 * ppiF;              // gray level → inches of height, × px/inch
  const grainAmp = 0.013 * smoothstep(8, 20, ppiF);
  const grainScale = Math.max(1, Math.round(ppiF / 24 * 2)) ;
  const mottleScale = 256 / (5.5 * ppiF);     // ~5.5" per tile period
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (A[i] <= 0) continue;
      // detail gradient (central differences on the 8-bit detail map)
      const xm = x > 0 ? i - 1 : i, xp = x < W - 1 ? i + 1 : i, ym = y > 0 ? i - W : i, yp = y < Hh - 1 ? i + W : i;
      let gx = GX[i] + (detail[xp] - detail[xm]) * 0.5 * kDetail;
      let gy = GY[i] + (detail[yp] - detail[ym]) * 0.5 * kDetail;
      // knit grain
      const tx = ((x + gx0) / grainScale) & (TILE - 1), ty = ((y + gy0) / grainScale) & (TILE - 1);
      const ti = ty * TILE + tx;
      gx += (grain[ti] - grain[ty * TILE + ((tx + 1) & (TILE - 1))]) * grainAmp * 6;
      gy += (grain[ti] - grain[((ty + 1) & (TILE - 1)) * TILE + tx]) * grainAmp * 6;
      const il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * il, ny = -gy * il, nz = il;
      const ao = aoDetail ? AO[i] * aoDetail[i] : AO[i], sh = SH[i];
      let d = lightDiffuse(nx, ny, nz, sh) * EXPOSURE * (0.25 + 0.75 * ao);
      // brushed-fleece heather: very low-frequency albedo breathing
      const mx = ((x + gx0) * mottleScale) & (TILE - 1), my = ((y + gy0) * mottleScale) & (TILE - 1);
      d *= 1 + mottle[my * TILE + mx] * 0.025;
      // spec + sheen (fleece: broad, low; sheen brightens grazing angles)
      const nh = Math.max(0, nx * HKEY[0] + ny * HKEY[1] + nz * HKEY[2]);
      const nh2 = Math.max(0, nx * HFILL[0] + ny * HFILL[1] + nz * HFILL[2]);
      const spec = (Math.pow(nh, 9) * sh + 0.35 * Math.pow(nh2, 7)) * (0.4 + 0.6 * ao);
      const graze = 1 - nz;
      const sheen = graze * graze * (0.45 + 0.55 * wrap(nx * KEY[0] + ny * KEY[1] + nz * KEY[2], 0.5)) * ao;
      Dm[i] = d;
      Sp[i] = spec * SPK[i] + sheen * SHN[i];
      const wf = WF[i];
      if (wf > 0) {
        const met = MET[i];
        let r = FR[i], g = FG[i], b = FB[i];          // premultiplied by wf
        if (met > 0) {
          // mirror reflection of the studio
          const rz = 2 * nz * nz - 1, rx = 2 * nz * nx, ry = 2 * nz * ny;
          const e = envAt(rx, ry, rz) * (0.35 + 0.65 * ao) * (0.55 + 0.45 * sh);
          const fres = 0.85 + 0.15 * Math.pow(1 - nz, 3);
          const em = e * fres;
          r = r * (1 - met) * d + r * met * em; g = g * (1 - met) * d + g * met * em; b = b * (1 - met) * d + b * met * em;
        } else { r *= d; g *= d; b *= d; }
        FX[i * 3] = r; FX[i * 3 + 1] = g; FX[i * 3 + 2] = b;
      }
    }
  }
  mark("lighting");

  /* ── 5. drop + contact shadow (low res, upsampled at render) ── */
  const shadowL = (() => {
    const a = new Float32Array(L * L);
    for (const Ly of layers) {
      const { grid, cov } = Ly;
      for (let y = 0; y < grid.lh; y++) for (let x = 0; x < grid.lw; x++) {
        const gi = (y + grid.ly0) * L + x + grid.lx0;
        a[gi] = Math.max(a[gi], cov[y * grid.lw + x]);
      }
    }
    const shift = (src, dx, dy) => {
      const out = new Float32Array(L * L);
      const ix = Math.round(dx), iy = Math.round(dy);
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        const sx = x - ix, sy = y - iy;
        if (sx >= 0 && sy >= 0 && sx < L && sy < L) out[y * L + x] = src[sy * L + sx];
      }
      return out;
    };
    const near = blur(shift(a, 0.35 * ppiL, 0.6 * ppiL), L, L, 0.55 * ppiL);
    const far = blur(shift(a, 0.9 * ppiL, 1.7 * ppiL), L, L, 2.4 * ppiL);
    const out = new Float32Array(L * L);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(0.9, near[i] * 0.3 + far[i] * 0.2);
    return out;
  })();
  mark("shadow");

  // pack what the colour pass needs
  const baked = {
    garmentId: garment.id, viewId, size: S, L,
    box: { x0: gx0, y0: gy0, w: W, h: Hh },
    A, WB, WT, WA, WF, FX, D: Dm, SP: Sp, PR, PG, DX: DXb, DY: DYb,
    shadowL, zones: view.zones, fit: view.fit, printBounds: printBoundsOf(view),
    debug: { Hc, layers: layers.map((l) => ({ id: l.layer.id, grid: l.grid })), detail, AO, SH, GX, GY },
  };
  return baked;
}

function printBoundsOf(view) {
  const b = polyBBox(view.printArea || []);
  const { k, ox, oy } = view.fit;
  return { x: b.x0 * k + ox, y: b.y0 * k + oy, w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k };
}

/* ───────────────────────────── detail map ───────────────────────────── */

function drawDetails(view, TF, gx0, gy0, W, H, ppi) {
  const main = makeCanvas(W, H), mx = ctxRead(main);
  const T = (p) => { const q = TF(p); return [q[0] - gx0, q[1] - gy0]; };
  mx.fillStyle = "rgb(128,128,128)";
  mx.fillRect(0, 0, W, H);
  const det = view.details || {};
  const canBlur = typeof mx.filter === "string";
  // strokes are grouped by blur radius: each group is drawn sharp on its own canvas and
  // composited once with a canvas blur (one filter pass per group, not per stroke)
  const group = (blurPx, fn, target = mx) => {
    const c = makeCanvas(W, H), x = c.getContext("2d");
    x.lineCap = "round"; x.lineJoin = "round";
    fn(x);
    if (canBlur && blurPx > 0.3) target.filter = `blur(${blurPx.toFixed(2)}px)`;
    target.drawImage(c, 0, 0);
    target.filter = "none";
  };
  const path = (x, pts) => {
    const [a0, b0] = T(pts[0]); x.moveTo(a0, b0);
    for (let i = 1; i < pts.length; i++) { const [a, b] = T(pts[i]); x.lineTo(a, b); }
  };
  const stroke = (x, pts, width, color, dash = null) => {
    if (!pts || pts.length < 2) return;
    x.strokeStyle = color; x.lineWidth = Math.max(0.6, width);
    x.setLineDash(dash || []);
    x.beginPath(); path(x, pts); x.stroke();
  };
  const offsetPts = (pts, d) => {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      out.push([pts[i][0] - (dy / L) * d, pts[i][1] + (dx / L) * d]);
    }
    return out;
  };

  /* rib wales: compressed toward the edges like a cylinder seen from the front */
  const ribFade = smoothstep(2.2, 4.5, 0.15 * ppi);
  if (ribFade > 0 && det.ribs?.length) {
    const pitch0 = det.ribs[0].pitch;
    group(Math.max(0, pitch0 * ppi * 0.16), (x) => {
      for (const rb of det.ribs) {
        x.save();
        x.beginPath(); tracePolys(x, [rb.poly], T); x.clip();
        const b = polyBBox([rb.poly]);
        const dir = rb.dir, nx = dir[1], ny = -dir[0];
        const cx = rb.cylinder?.cx ?? (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const span = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 1;
        const R = rb.cylinder?.r || span;
        const halfArc = Math.min((Math.PI / 2) * 0.985, span / R) * R;
        const nW = Math.floor((2 * halfArc) / rb.pitch);
        const sink = Math.round(34 * ribFade), lift = Math.round(64 * ribFade);
        x.fillStyle = `rgb(${128 - sink},${128 - sink},${128 - sink})`;
        x.fillRect(0, 0, W, H);
        const lw = Math.max(0.7, rb.pitch * ppi * 0.44);
        for (let i = 0; i <= nW; i++) {
          const arc = -halfArc + i * rb.pitch;
          const ang = arc / R;
          const u = R * Math.sin(ang), fs = Math.cos(ang);
          const ox = cx + nx * u, oy = cy + ny * u;
          const wob = 0.03 * Math.sin(i * 2.3);
          const v = 128 + Math.round(lift * (0.5 + 0.5 * fs));
          stroke(x, [[ox - dir[0] * span + nx * wob, oy - dir[1] * span + ny * wob], [ox + dir[0] * span - nx * wob, oy + dir[1] * span - ny * wob]], lw * (0.4 + 0.6 * fs), `rgb(${v},${v},${v})`);
        }
        x.restore();
      }
    });
  }

  /* seams: puffed seam allowance either side, then the groove */
  const sf = smoothstep(4, 12, ppi);
  group(0.06 * ppi, (x) => {
    for (const sm of det.seams || []) {
      stroke(x, offsetPts(sm, 0.1), 0.1 * ppi, `rgba(205,205,205,${0.6 * sf})`);
      stroke(x, offsetPts(sm, -0.1), 0.1 * ppi, `rgba(205,205,205,${0.6 * sf})`);
    }
  });
  group(0.022 * ppi, (x) => {
    for (const sm of det.seams || []) stroke(x, sm, 0.055 * ppi, "rgba(18,18,18,0.92)");
    for (const ed of det.edges || []) stroke(x, ed, 0.045 * ppi, "rgba(30,30,30,0.85)");
  });

  /* twin-needle cover stitching: needle-hole valley + raised thread dashes */
  const stf = smoothstep(10, 22, ppi);
  if (stf > 0 && det.stitches?.length) {
    const lines = [];
    for (const st of det.stitches) for (const o of st.offsets) lines.push(o ? offsetPts(st.pts, o) : st.pts);
    group(0.02 * ppi, (x) => { for (const l of lines) stroke(x, l, 0.05 * ppi, `rgba(70,70,70,${0.45 * stf})`); });
    group(0, (x) => {
      const dash = [0.085 * ppi, 0.04 * ppi];
      for (const l of lines) stroke(x, l, Math.max(0.55, 0.034 * ppi), `rgba(238,238,238,${0.85 * stf})`, dash);
      for (const [a, b] of det.tacks || []) stroke(x, [a, b], 0.07 * ppi, `rgba(230,230,230,${0.8 * sf})`);
    });
  }

  /* braided cords: herringbone */
  const bf = smoothstep(9, 20, ppi);
  if (bf > 0 && det.braids?.length) {
    group(0, (x) => {
      x.strokeStyle = `rgba(55,55,55,${0.8 * bf})`;
      x.lineWidth = Math.max(0.6, 0.03 * ppi);
      x.beginPath();
      for (const br of det.braids) {
        const pts = br.pts, r = br.r, pitch = 0.11;
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const n = Math.floor(total / pitch);
        let seg = 1, acc = 0;
        const segLen = (j) => Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        for (let k = 1; k < n; k++) {
          const want = k * pitch;
          while (seg < pts.length - 1 && acc + segLen(seg) < want) { acc += segLen(seg); seg++; }
          const a = pts[seg - 1], b = pts[seg], L = segLen(seg) || 1, u = (want - acc) / L;
          const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
          const t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nn = [-t[1], t[0]];
          const sgn = k % 2 ? 1 : -1;
          const [x0, y0] = T([p[0] + nn[0] * r * 0.85 * sgn, p[1] + nn[1] * r * 0.85 * sgn]);
          const [x1, y1] = T([p[0] + t[0] * pitch * 0.9, p[1] + t[1] * pitch * 0.9]);
          x.moveTo(x0, y0); x.lineTo(x1, y1);
        }
      }
      x.stroke();
    });
  }
  const d = mx.getImageData(0, 0, W, H).data;
  const height = new Float32Array(W * H);
  for (let i = 0; i < height.length; i++) height[i] = d[i * 4];

  /* AO strokes (pocket hand openings, under-edge gaps): white canvas, dark soft strokes */
  let ao = null;
  if (det.aoStrokes?.length) {
    const c = makeCanvas(W, H), x = ctxRead(c);
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    for (const st of det.aoStrokes) {
      group(st.blur * ppi, (g) => stroke(g, st.pts, st.w * ppi, `rgba(0,0,0,${st.k})`), x);
    }
    const a = x.getImageData(0, 0, W, H).data;
    ao = new Float32Array(W * H);
    for (let i = 0; i < ao.length; i++) ao[i] = a[i * 4] / 255;
  }
  return { height, ao };
}

/* ───────────────────────────── graphics (placements) ───────────────────────────── */

const SAFE = 0.72;
const tintCache = new WeakMap();
function lumHex(h) { const [r, g, b] = hexRgb(h); return 0.2126 * S2L[r] + 0.7152 * S2L[g] + 0.0722 * S2L[b]; }
export function tonalOf(base) {
  const L = lumHex(base);
  const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase(); };
  if (L < 0.05) return mixHex(base, "#FFFFFF", 0.16);
  if (L < 0.22) return mixHex(base, "#FFFFFF", 0.13);
  if (L < 0.5) return mixHex(base, "#000000", 0.16);
  return mixHex(base, "#000000", 0.12);
}
function resolveTint(tint, colors) {
  if (!tint) return null;
  if (tint === "tonal") return tonalOf(colors.base);
  if (tint === "base" || tint === "trim" || tint === "accent") return colors[tint];
  return HEX_RE.test(tint) ? (tint[0] === "#" ? tint : "#" + tint).toUpperCase() : null;
}
/** One-colour screen separation (same rule as renderMockup). */
function tinted(canvas, tint, lighterInk, knockout = true) {
  let m = tintCache.get(canvas);
  if (!m) { m = new Map(); tintCache.set(canvas, m); }
  const key = `${tint}|${knockout ? (lighterInk ? "L" : "D") : "S"}`;
  if (m.has(key)) return m.get(key);
  const t = makeCanvas(canvas.width, canvas.height), x = ctxRead(t);
  x.drawImage(canvas, 0, 0);
  let done = false;
  if (knockout) {
    try {
      const img = x.getImageData(0, 0, t.width, t.height), d = img.data, n = t.width * t.height;
      const hist = new Float64Array(64); let wsum = 0;
      for (let i = 0; i < n; i++) { const a = d[i * 4 + 3]; if (a < 8) continue; const Y = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; hist[Math.min(63, (Y * 64) | 0)] += a; wsum += a; }
      const pct = (q) => { let acc = 0; for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc >= q * wsum) return (b + 0.5) / 64; } return 1; };
      const lo = pct(0.05), hi = pct(0.95);
      if (wsum > 0 && hi - lo >= 0.22) {
        const [r, g, b] = hexRgb(tint), span = hi - lo;
        for (let i = 0; i < n; i++) {
          const o = i * 4, a = d[o + 3]; if (!a) continue;
          let v = clamp(((0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255 - lo) / span, 0, 1);
          if (!lighterInk) v = 1 - v;
          let dens = clamp((v - 0.2) / 0.42, 0, 1); dens = dens * dens * (3 - 2 * dens);
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(a * dens);
        }
        x.putImageData(img, 0, 0); done = true;
      }
    } catch { /* tainted */ }
  }
  if (!done) { x.globalCompositeOperation = "source-in"; x.fillStyle = tint; x.fillRect(0, 0, t.width, t.height); }
  m.set(key, t);
  return t;
}
function fitSize(canvas, box, scale) {
  const fit = Math.min(box.w / (canvas.width * SAFE), box.h / (canvas.height * SAFE)) * scale;
  return { w: canvas.width * fit, h: canvas.height * fit };
}
function drawPlacements(ctx, placements, zones, colors, k, printBounds, offX = 0, offY = 0) {
  const ids = Object.keys(zones);
  for (const pl of placements) {
    const src0 = pl?.canvas;
    if (!src0 || !src0.width) continue;
    const tint = resolveTint(pl.tint, colors);
    const src = tint ? tinted(src0, tint, lumHex(tint) >= lumHex(colors.base), pl.knockout !== false) : src0;
    const scale = Number.isFinite(pl.scale) && pl.scale > 0 ? pl.scale : 1;
    ctx.save();
    ctx.globalAlpha = Number.isFinite(pl.opacity) ? clamp(pl.opacity, 0, 1) : 1;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (pl.mode === "tile") {
      const tile = Number.isFinite(pl.tile) && pl.tile > 20 ? pl.tile : 220;
      const { w, h } = fitSize(src, { w: tile, h: tile }, scale);
      const b = printBounds, cx = b.x + b.w / 2 + (pl.dx || 0) * tile, cy = b.y + b.h / 2 + (pl.dy || 0) * tile;
      ctx.setTransform(k, 0, 0, k, -offX, -offY);
      ctx.translate(cx, cy); ctx.rotate(((pl.rotate || 0) * Math.PI) / 180);
      const nx = Math.ceil(b.w / tile) + 3, ny = Math.ceil(b.h / tile) + 3;
      for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
        const ox = i * tile + (j & 1 ? tile / 2 : 0), oy = j * tile;
        ctx.drawImage(src, ox - w / 2, oy - h / 2, w, h);
      }
    } else {
      const zone = zones[pl.zone] || zones.center || zones["back-center"] || zones[ids[0]];
      if (!zone) { ctx.restore(); continue; }
      const { w, h } = fitSize(src, zone, scale);
      const cx = zone.x + zone.w / 2 + (pl.dx || 0) * zone.w, cy = zone.y + zone.h / 2 + (pl.dy || 0) * zone.h;
      ctx.setTransform(k, 0, 0, k, -offX, -offY);
      ctx.translate(cx, cy);
      if (pl.rotate) ctx.rotate((pl.rotate * Math.PI) / 180);
      ctx.drawImage(src, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
}

/* ───────────────────────────── backdrop ───────────────────────────── */

const bgCache = new Map();
function backdropPixels(size, backdrop) {
  const key = `${size}|${backdrop}`;
  if (bgCache.has(key)) return bgCache.get(key);
  const px = new Float32Array(size * size * 3);       // linear
  if (backdrop === "studio") {
    // seamless sweep: soft light from the upper left, gentle falloff to the corners
    const c0 = [0.905, 0.902, 0.892], c1 = [0.70, 0.705, 0.712];
    const { mottle } = getTiles();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size - 0.42, v = y / size - 0.36;
      const r = Math.min(1, Math.sqrt(u * u * 0.9 + v * v * 0.75) / 0.78);
      const t = r * r * (3 - 2 * r) * 0.85 + 0.12 * smoothstep(0.55, 1, y / size);
      const n = mottle[((y * 256 / size) | 0) * 256 + ((x * 256 / size) | 0)] * 0.006;
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = (c0[c] + (c1[c] - c0[c]) * t) * (1 + n);
    }
  } else {
    const [r, g, b] = hexRgb(backdrop, [255, 255, 255]);
    for (let i = 0; i < size * size; i++) { px[i * 3] = S2L[r]; px[i * 3 + 1] = S2L[g]; px[i * 3 + 2] = S2L[b]; }
  }
  if (bgCache.size > 6) bgCache.delete(bgCache.keys().next().value);
  bgCache.set(key, px);
  return px;
}

/* ───────────────────────────── colour pass ───────────────────────────── */

export function renderBaked(bk, { colors = {}, graphics = [], backdrop = null, shadow = true, target = null, timings = null } = {}) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let t0 = now();
  const mark = (k) => { if (timings) { const t = now(); timings[k] = (timings[k] || 0) + t - t0; t0 = t; } };
  const S = bk.size;
  const col = { base: colors.base || "#13294B", trim: colors.trim || "#F2A900", accent: colors.accent || "#FFFFFF" };
  const lin = (h) => hexRgb(h).map((v) => S2L[v]);
  const Cb = lin(col.base), Ct = lin(col.trim), Ca = lin(col.accent);
  const out = target || makeCanvas(S, S);
  if (out.width !== S) { out.width = S; out.height = S; }
  const octx = out.getContext("2d");
  const img = octx.createImageData(S, S);
  const o = img.data;

  /* backdrop + shadow (cached per baked view × backdrop × shadow) */
  const bgKey = `${backdrop || "none"}|${shadow ? 1 : 0}`;
  bk.bgCache = bk.bgCache || new Map();
  let bgPx = bk.bgCache.get(bgKey);
  if (!bgPx) {
    bgPx = new Uint8ClampedArray(S * S * 4);
    const bg = backdrop ? backdropPixels(S, backdrop) : null;
    const sl = bk.L / S;
    const shL = bk.shadowL, L = bk.L;
    for (let y = 0; y < S; y++) {
      const ly = clamp((y + 0.5) * sl - 0.5, 0, L - 1.001), y0 = ly | 0, fy = ly - y0;
      for (let x = 0; x < S; x++) {
        const p = y * S + x, q = p * 4;
        let sa = 0;
        if (shadow) {
          const lx = clamp((x + 0.5) * sl - 0.5, 0, L - 1.001), x0 = lx | 0, fx = lx - x0, i = y0 * L + x0;
          sa = (shL[i] * (1 - fx) + shL[i + 1] * fx) * (1 - fy) + (shL[i + L] * (1 - fx) + shL[i + L + 1] * fx) * fy;
        }
        if (bg) {
          const kk = 1 - sa, j = p * 3;
          bgPx[q] = L2S[(bg[j] * kk * L2S_K) | 0]; bgPx[q + 1] = L2S[(bg[j + 1] * kk * L2S_K) | 0]; bgPx[q + 2] = L2S[(bg[j + 2] * kk * L2S_K) | 0]; bgPx[q + 3] = 255;
        } else bgPx[q + 3] = Math.round(sa * 255);
      }
    }
    if (bk.bgCache.size > 3) bk.bgCache.delete(bk.bgCache.keys().next().value);
    bk.bgCache.set(bgKey, bgPx);
  }
  o.set(bgPx);
  mark("backdrop");

  /* graphics → one canvas per print group (body / hood) */
  const k = S / 1000;
  const groups = [[], []];
  for (const g of graphics || []) {
    if (!g?.canvas) continue;
    groups[g.zone === "hood" && bk.zones.hood ? 1 : 0].push(g);
  }
  const { x0: bx, y0: by, w: BW, h: BH } = bk.box;
  const G = groups.map((list) => {
    if (!list.length) return null;
    const c = makeCanvas(BW, BH), x = ctxRead(c);
    drawPlacements(x, list, bk.zones, col, k, bk.printBounds, bx, by);
    return x.getImageData(0, 0, BW, BH).data;
  });
  mark("graphics");

  /* garment */
  const { A, WB, WT, WA, WF, FX, D, SP, PR, PG, DX, DY } = bk;
  const { ink } = getTiles();
  const hasG = !!(G[0] || G[1]);
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const i = y * BW + x;
      const a = A[i];
      if (a <= 0.002) continue;
      const wb = WB[i], wt = WT[i], wa = WA[i];
      let r = wb * Cb[0] + wt * Ct[0] + wa * Ca[0];
      let g = wb * Cb[1] + wt * Ct[1] + wa * Ca[1];
      let b = wb * Cb[2] + wt * Ct[2] + wa * Ca[2];
      let sp = SP[i];
      const pr = PR[i];
      if (hasG && pr > 0.002) {
        const Gi = G[PG[i]];
        if (Gi) {
          // print displaced by the fold relief (bilinear)
          const sx = clamp(x + DX[i], 0, BW - 1.001), sy = clamp(y + DY[i], 0, BH - 1.001);
          const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
          const q00 = (y0 * BW + x0) * 4, q10 = q00 + 4, q01 = q00 + BW * 4, q11 = q01 + 4;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          const ga = (Gi[q00 + 3] * w00 + Gi[q10 + 3] * w10 + Gi[q01 + 3] * w01 + Gi[q11 + 3] * w11) / 255;
          if (ga > 0.002) {
            // straight-alpha colour; weight by alpha so transparent texels don't darken edges
            const a00 = Gi[q00 + 3] * w00, a10 = Gi[q10 + 3] * w10, a01 = Gi[q01 + 3] * w01, a11 = Gi[q11 + 3] * w11;
            const as = a00 + a10 + a01 + a11 || 1;
            const gr = S2L[((Gi[q00] * a00 + Gi[q10] * a10 + Gi[q01] * a01 + Gi[q11] * a11) / as) | 0];
            const gg = S2L[((Gi[q00 + 1] * a00 + Gi[q10 + 1] * a10 + Gi[q01 + 1] * a01 + Gi[q11 + 1] * a11) / as) | 0];
            const gb = S2L[((Gi[q00 + 2] * a00 + Gi[q10 + 2] * a10 + Gi[q01 + 2] * a01 + Gi[q11 + 2] * a11) / as) | 0];
            // ink film: a whisper of fabric showing through
            const n = ink[((y + by) & 255) * 256 + ((x + bx) & 255)];
            const ia = ga * pr * clamp(0.955 + n * 0.09, 0, 1);
            const wsum = wb + wt + wa;              // ink sits on cloth regions only
            const m = ia * Math.min(1, wsum * 1.04);
            r += (gr * 0.96 - r) * m; g += (gg * 0.96 - g) * m; b += (gb * 0.96 - b) * m;
            sp *= 1 - 0.45 * m;
          }
        }
      }
      const d = D[i];
      r = r * d + sp; g = g * d + sp; b = b * d + sp;
      const wf = WF[i];
      if (wf > 0) { r = r * (1 - wf) + FX[i * 3] + 0; g = g * (1 - wf) + FX[i * 3 + 1]; b = b * (1 - wf) + FX[i * 3 + 2]; }
      const p = ((y + by) * S + (x + bx)) * 4;
      const cr = L2S[Math.min(L2S_N, (r * L2S_K) | 0)], cg = L2S[Math.min(L2S_N, (g * L2S_K) | 0)], cb = L2S[Math.min(L2S_N, (b * L2S_K) | 0)];
      if (a >= 0.998) { o[p] = cr; o[p + 1] = cg; o[p + 2] = cb; o[p + 3] = 255; }
      else {
        const ba = o[p + 3] / 255, oa = a + ba * (1 - a);
        o[p] = (cr * a + o[p] * ba * (1 - a)) / oa; o[p + 1] = (cg * a + o[p + 1] * ba * (1 - a)) / oa; o[p + 2] = (cb * a + o[p + 2] * ba * (1 - a)) / oa;
        o[p + 3] = Math.round(oa * 255);
      }
    }
  }
  mark("garment");
  octx.putImageData(img, 0, 0);
  mark("put");
  return out;
}
