// Mascot Lab — core pixel / mask / noise / color helpers shared by every effect.
//
// Conventions
//   • Masks are Float32Array(w*h) in 0..1, row-major (i = y*w + x).
//   • Pixel-like arguments are in *output* pixels (callers multiply by ctx.scale).
//   • Nothing here allocates per pixel; hot loops run on typed arrays.
//   • Colors are "#RRGGBB" strings (uppercase on output). Functions that return
//     RGB/HSL tuples return arrays that ALSO carry named props, so both
//     `const [r, g, b] = hexToRgb(x)` and `hexToRgb(x).r` work.

/* ───────────────────────────── small math ───────────────────────────── */

/** clamp(v, lo = 0, hi = 1) */
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
/** lerp(a, b, t) — linear interpolation */
export const lerp = (a, b, t) => a + (b - a) * t;
/** smoothstep(e0, e1, x) — Hermite 0..1 ramp (e0 may be > e1 for a falling ramp) */
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/* ─────────────────────────────── canvas ─────────────────────────────── */

/** createCanvas(w, h = w) — new transparent canvas (DOM canvas, OffscreenCanvas in workers). */
export function createCanvas(w, h = w) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** ctx2d(canvas) — 2D context with willReadFrequently (CPU-backed, fast getImageData). */
export function ctx2d(canvas) {
  return canvas.getContext("2d", { willReadFrequently: true });
}

/** cloneCanvas(c) — pixel-exact copy of a canvas. */
export function cloneCanvas(c) {
  const out = createCanvas(c.width, c.height);
  ctx2d(out).drawImage(c, 0, 0);
  return out;
}

/** getPixels(canvas) — ImageData of the whole canvas. */
export function getPixels(canvas) {
  return ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

/** canvasFromImageData(imageData) — new canvas holding the ImageData. */
export function canvasFromImageData(img) {
  const c = createCanvas(img.width, img.height);
  ctx2d(c).putImageData(img, 0, 0);
  return c;
}

/** resizeCanvas(c, w, h = w) — high-quality resample (progressive halving when shrinking a lot). */
export function resizeCanvas(c, w, h = w) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let cur = c;
  // step down by halves so large reductions don't alias
  while (cur.width / 2 >= w * 1.05 && cur.height / 2 >= h * 1.05) {
    const half = createCanvas(Math.max(w, Math.round(cur.width / 2)), Math.max(h, Math.round(cur.height / 2)));
    const hx = ctx2d(half);
    hx.imageSmoothingEnabled = true;
    hx.imageSmoothingQuality = "high";
    hx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = createCanvas(w, h);
  const ox = ctx2d(out);
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = "high";
  ox.drawImage(cur, 0, 0, w, h);
  return out;
}

/* ─────────────────────────────── random ─────────────────────────────── */

/** rng(seed) — mulberry32 PRNG → () => float in [0, 1). Deterministic. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hashSeed(...parts) — stable uint32 hash of any strings/numbers (FNV-1a + avalanche). */
export function hashSeed(...parts) {
  const s = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p) ?? String(p))).join("␟");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/* ─────────────────────────────── noise ──────────────────────────────── */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1,
  0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071]);

/** makeNoise2D(seed) — seeded 2-D simplex noise: (x, y) => [-1, 1], ~1 feature per unit. */
export function makeNoise2D(seed = 1) {
  const r = rng(hashSeed("noise2d", seed));
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permG = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permG[i] = (perm[i] % 12);
  }
  return function noise2D(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = permG[ii + perm[jj]] * 2;
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = permG[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = permG[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    const v = 70 * n;
    return v < -1 ? -1 : v > 1 ? 1 : v;
  };
}

/** fbm(noise2D, x, y, octaves, lacunarity, gain) — fractal sum, normalized to [-1, 1]. */
export function fbm(noise2D, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    // offset each octave so lattice artifacts don't line up
    sum += amp * noise2D(x * f + o * 17.31, y * f - o * 9.73);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return norm ? sum / norm : 0;
}

/* ─────────────────────────────── color ──────────────────────────────── */

function tuple3(a, b, c, ka, kb, kc) {
  const t = [a, b, c];
  t[ka] = a; t[kb] = b; t[kc] = c;
  return t;
}
function rgbArgs(r, g, b) {
  if (Array.isArray(r)) return [r[0], r[1], r[2]];
  if (r && typeof r === "object") return [r.r, r.g, r.b];
  if (typeof r === "string") { const t = hexToRgb(r); return [t[0], t[1], t[2]]; }
  return [r, g, b];
}

/** normalizeHex(any) — "#abc" / "abc" / "#aabbccdd" → "#AABBCC", or null if not a color. */
export function normalizeHex(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  else if (/^[0-9a-f]{8}$/i.test(h)) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return "#" + h.toUpperCase();
}

/** hexToRgb(hex) → [r, g, b] 0–255 (also .r .g .b). Invalid input → black. */
export function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) return tuple3(0, 0, 0, "r", "g", "b");
  const v = parseInt(n.slice(1), 16);
  return tuple3((v >> 16) & 255, (v >> 8) & 255, v & 255, "r", "g", "b");
}

/** rgbToHex(r, g, b) — also accepts ([r,g,b]) or ({r,g,b}); → "#RRGGBB". */
export function rgbToHex(r, g, b) {
  [r, g, b] = rgbArgs(r, g, b);
  const h = (v) => Math.round(clamp(v || 0, 0, 255)).toString(16).padStart(2, "0");
  return ("#" + h(r) + h(g) + h(b)).toUpperCase();
}

/** rgbToHsl(r, g, b) → [h 0–360, s 0–1, l 0–1] (also .h .s .l). Accepts array/object/hex too. */
export function rgbToHsl(r, g, b) {
  [r, g, b] = rgbArgs(r, g, b);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return tuple3(h, s, l, "h", "s", "l");
}

/** hslToRgb(h 0–360, s 0–1, l 0–1) → [r, g, b] 0–255 (also .r .g .b). */
export function hslToRgb(h, s, l) {
  if (Array.isArray(h)) [h, s, l] = h;
  else if (h && typeof h === "object") ({ h, s, l } = h);
  h = (((h % 360) + 360) % 360) / 360;
  s = clamp(s); l = clamp(l);
  if (s === 0) { const v = l * 255; return tuple3(v, v, v, "r", "g", "b"); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return tuple3(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, "r", "g", "b");
}

/** hslToHex(h, s, l) — convenience: HSL → "#RRGGBB". */
export const hslToHex = (h, s, l) => rgbToHex(hslToRgb(h, s, l));

/** mix(hexA, hexB, t) — sRGB blend, t=0 → A, t=1 → B. */
export function mix(a, b, t = 0.5) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

/** lighten(hex, amt) — raise HSL lightness by amt (0–1, Sass-style). */
export function lighten(hex, amt = 0.1) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex(h, s, clamp(l + amt));
}

/** darken(hex, amt) — lower HSL lightness by amt (0–1, Sass-style). */
export function darken(hex, amt = 0.1) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex(h, s, clamp(l - amt));
}

/** saturate(hex, amt) — add amt (−1..1) to HSL saturation (negative desaturates). */
export function saturate(hex, amt = 0.1) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex(h, clamp(s + amt), l);
}

const SRGB_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** srgbToLinear LUT: Float32Array(256) of linear-light values for 8-bit sRGB. */
export const SRGB_TO_LINEAR = SRGB_LIN;

/** luminance(hex) — WCAG relative luminance 0–1. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * SRGB_LIN[r | 0] + 0.7152 * SRGB_LIN[g | 0] + 0.0722 * SRGB_LIN[b | 0];
}

/** contrastRatio(hexA, hexB) — WCAG contrast ratio 1–21. */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** contrastText(hex) → "#000000" | "#FFFFFF", whichever contrasts more. */
export function contrastText(hex) {
  const L = luminance(hex);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000000" : "#FFFFFF";
}

/* ─────────────────────────────── masks ──────────────────────────────── */

/** alphaMask(canvas) → Float32Array(w*h) of alpha 0–1. */
export function alphaMask(canvas) {
  const { data } = getPixels(canvas);
  const n = canvas.width * canvas.height;
  const m = new Float32Array(n);
  for (let i = 0, j = 3; i < n; i++, j += 4) m[i] = data[j] / 255;
  return m;
}

/** maskToCanvas(mask, w, h, color = "#FFFFFF") — flat color canvas whose alpha = mask. */
export function maskToCanvas(mask, w, h, color = "#FFFFFF") {
  const c = createCanvas(w, h);
  const x = ctx2d(c);
  const img = x.createImageData(w, h);
  const d = img.data;
  const [r, g, b] = hexToRgb(color);
  const n = w * h;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    d[j] = r; d[j + 1] = g; d[j + 2] = b;
    const a = mask[i];
    d[j + 3] = a <= 0 ? 0 : a >= 1 ? 255 : (a * 255 + 0.5) | 0;
  }
  x.putImageData(img, 0, 0);
  return c;
}

const EDT_INF = 1e20;
// 1-D squared distance transform (Felzenszwalb & Huttenlocher) of f (stride-addressed)
// into d. Only finite samples become parabolas; an all-INF line stays INF.
function edt1d(f, d, off, stride, n, v, z, tmp) {
  let k = -1;
  for (let q = 0; q < n; q++) {
    const fq = f[off + q * stride];
    if (fq > 1e19) continue; // INF (Float32 storage rounds 1e20 slightly)
    tmp[q] = fq;
    if (k < 0) { k = 0; v[0] = q; z[0] = -EDT_INF; z[1] = EDT_INF; continue; }
    let s;
    for (;;) {
      const p = v[k];
      s = ((fq + q * q) - (tmp[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) { k--; if (k < 0) break; } else break;
    }
    k++;
    v[k] = q;
    z[k] = k === 0 ? -EDT_INF : s;
    z[k + 1] = EDT_INF;
  }
  if (k < 0) {
    for (let q = 0; q < n; q++) d[off + q * stride] = EDT_INF;
    return;
  }
  let j = 0;
  for (let q = 0; q < n; q++) {
    while (z[j + 1] < q) j++;
    const p = v[j];
    const dq = q - p;
    d[off + q * stride] = dq * dq + tmp[p];
  }
}

// Euclidean distance to the nearest seed pixel (seed = (mask ≥ threshold) === seedInside).
// Pass 1 (columns) is a row-major two-scan 1-D distance, exact for binary seeds; pass 2
// (rows) is the Felzenszwalb–Huttenlocher lower envelope of parabolas.
function edtFrom(mask, w, h, threshold, seedInside) {
  const n = w * h;
  const out = new Float32Array(n);
  const g = new Float32Array(n);
  const BIG = 1e10; // squared → 1e20 = "no seed"
  let seeds = 0;
  // forward scan (top → bottom)
  for (let x = 0; x < w; x++) {
    const isSeed = (mask[x] >= threshold) === seedInside;
    g[x] = isSeed ? 0 : BIG;
    if (isSeed) seeds++;
  }
  for (let y = 1; y < h; y++) {
    const row = y * w, prev = row - w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if ((mask[i] >= threshold) === seedInside) { g[i] = 0; seeds++; } else g[i] = g[prev + x] + 1;
    }
  }
  if (seeds === 0) { out.fill(w + h); return out; }
  if (seeds === n) return out;
  // backward scan (bottom → top), then square
  for (let y = h - 2; y >= 0; y--) {
    const row = y * w, next = row + w;
    for (let x = 0; x < w; x++) {
      const v = g[next + x] + 1;
      if (v < g[row + x]) g[row + x] = v;
    }
  }
  for (let i = 0; i < n; i++) { const v = g[i]; g[i] = v >= BIG ? EDT_INF : v * v; }
  const v = new Int32Array(w);
  const z = new Float64Array(w + 1);
  const tmp = new Float64Array(w);
  for (let y = 0; y < h; y++) edt1d(g, out, y * w, 1, w, v, z, tmp);
  for (let i = 0; i < n; i++) out[i] = Math.sqrt(out[i]);
  return out;
}

/** insideDistance(mask, w, h, threshold = 0.5) → Float32Array: inside px → distance to nearest outside px center (0 outside). */
export function insideDistance(mask, w, h, threshold = 0.5) {
  return edtFrom(mask, w, h, threshold, false);
}

/** outsideDistance(mask, w, h, threshold = 0.5) → Float32Array: outside px → distance to nearest inside px center (0 inside). */
export function outsideDistance(mask, w, h, threshold = 0.5) {
  return edtFrom(mask, w, h, threshold, true);
}

/**
 * distanceField(mask, w, h, threshold = 0.5) → { inside, outside } Float32Arrays (px).
 * Exact Euclidean (Felzenszwalb–Huttenlocher, separable). inside[i] = distance from an
 * inside pixel (mask ≥ threshold) to the nearest outside pixel center (0 for outside
 * pixels); outside[i] = distance from an outside pixel to the nearest inside pixel
 * center (0 for inside pixels). The geometric edge lies ≈0.5 px before either value.
 * Use insideDistance / outsideDistance when you only need one side (half the cost).
 */
export function distanceField(mask, w, h, threshold = 0.5) {
  return { inside: insideDistance(mask, w, h, threshold), outside: outsideDistance(mask, w, h, threshold) };
}

/**
 * signedDistance(mask, w, h, threshold = 0.5) → Float32Array of distance to the shape
 * edge in px: negative inside, positive outside (pixel-center EDT corrected by ½ px).
 */
export function signedDistance(mask, w, h, threshold = 0.5) {
  const { inside, outside } = distanceField(mask, w, h, threshold);
  const n = w * h;
  const sd = new Float32Array(n);
  for (let i = 0; i < n; i++) sd[i] = outside[i] > 0 ? outside[i] - 0.5 : 0.5 - inside[i];
  return sd;
}

/** dilateMask(mask, w, h, r) — grow the shape by r px (round corners, 1 px anti-aliased edge). */
export function dilateMask(mask, w, h, r) {
  const n = w * h;
  const out = new Float32Array(n);
  if (!(r > 0)) { out.set(mask); return out; }
  const outside = outsideDistance(mask, w, h, 0.5);
  for (let i = 0; i < n; i++) {
    const o = outside[i];
    let a;
    if (o === 0) a = 1;
    else {
      const e = o - 0.5 - r; // signed distance to the dilated edge
      a = e <= -0.5 ? 1 : e >= 0.5 ? 0 : smoothstep(0.5, -0.5, e);
    }
    out[i] = a > mask[i] ? a : mask[i];
  }
  return out;
}

/** erodeMask(mask, w, h, r) — shrink the shape by r px (1 px anti-aliased edge). */
export function erodeMask(mask, w, h, r) {
  const n = w * h;
  const out = new Float32Array(n);
  if (!(r > 0)) { out.set(mask); return out; }
  const inside = insideDistance(mask, w, h, 0.5);
  for (let i = 0; i < n; i++) {
    const d = inside[i];
    let a;
    if (d === 0) a = 0;
    else {
      const e = d - 0.5 - r; // positive = still inside the eroded shape
      a = e >= 0.5 ? 1 : e <= -0.5 ? 0 : smoothstep(-0.5, 0.5, e);
    }
    out[i] = a < mask[i] ? a : mask[i];
  }
  return out;
}

// box sizes for an n-pass box approximation of a gaussian with std-dev sigma
function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes.map((s) => Math.max(0, (s - 1) / 2)); // radii
}

// horizontal + vertical running-sum box blur of src into dst (radius r, edges clamp to 0)
function boxBlurH(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < w) acc += src[row + x];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * iarr;
      const add = x + r + 1, sub = x - r;
      if (add < w) acc += src[row + add];
      if (sub >= 0) acc -= src[row + sub];
    }
  }
}
function boxBlurV(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < h) acc += src[y * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * iarr;
      const add = y + r + 1, sub = y - r;
      if (add < h) acc += src[add * w + x];
      if (sub >= 0) acc -= src[sub * w + x];
    }
  }
}

/** blurMask(mask, w, h, r) — ≈gaussian blur (3 box passes), r = std-dev in px like CSS blur(). */
export function blurMask(mask, w, h, r) {
  const out = new Float32Array(mask);
  if (!(r > 0.2)) return out;
  const tmp = new Float32Array(w * h);
  for (const br of boxesForGauss(r, 3)) {
    const ri = Math.round(br);
    if (ri < 1) continue;
    boxBlurH(out, tmp, w, h, ri);
    boxBlurV(tmp, out, w, h, ri);
  }
  return out;
}

const FILTER_OK = {}; // canvas kind → boolean ("dom" on the page, "offscreen" in a worker)
let filterOff = false;
/**
 * supportsCanvasFilter() — true when ctx.filter = "blur()" works on the canvases
 * createCanvas() makes HERE (checked once per kind: a worker's OffscreenCanvas context
 * may differ from the page's canvas element), and blurs haven't been pinned to the
 * fallback with disableCanvasFilter().
 */
export function supportsCanvasFilter() {
  if (filterOff) return false;
  const kind = typeof document !== "undefined" ? "dom" : "offscreen";
  if (kind in FILTER_OK) return FILTER_OK[kind];
  let ok = false;
  try {
    const c = createCanvas(8, 8);
    const x = ctx2d(c);
    if (x && "filter" in x) {
      x.filter = "blur(2px)";
      if (x.filter === "blur(2px)") {
        // make sure it actually blurs (some engines accept the property but ignore it)
        x.fillStyle = "#fff";
        x.fillRect(0, 0, 8, 4);
        const below = x.getImageData(4, 5, 1, 1).data[3]; // 1.5 px outside the rect
        const inside = x.getImageData(4, 2, 1, 1).data[3];
        ok = below > 0 && inside < 255;
      }
    }
  } catch {
    ok = false;
  }
  return (FILTER_OK[kind] = ok);
}

/**
 * disableCanvasFilter(off = true) — blurCanvas() uses the box-blur fallback on this thread
 * even where ctx.filter works. The effect worker pool pins both sides to the fallback when
 * only one of them (page canvas vs a worker's OffscreenCanvas) can filter, so an effect
 * renders the same pixels in a worker and on the main thread.
 */
export function disableCanvasFilter(off = true) {
  filterOff = !!off;
}

/** blurCanvas(canvas, r) → new canvas blurred by r px (std-dev); ctx.filter or 3× box fallback. */
export function blurCanvas(canvas, r) {
  const w = canvas.width, h = canvas.height;
  const out = createCanvas(w, h);
  const ox = ctx2d(out);
  if (!(r > 0.2)) { ox.drawImage(canvas, 0, 0); return out; }
  if (supportsCanvasFilter()) {
    ox.filter = `blur(${r}px)`;
    ox.drawImage(canvas, 0, 0);
    ox.filter = "none";
    return out;
  }
  // fallback: premultiplied 3-pass box blur per channel
  const img = getPixels(canvas);
  const d = img.data;
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = d[j + 3] / 255;
    ch[0][i] = d[j] * a; ch[1][i] = d[j + 1] * a; ch[2][i] = d[j + 2] * a; ch[3][i] = a;
  }
  const bl = ch.map((c) => blurMask(c, w, h, r));
  const o = ox.createImageData(w, h);
  const od = o.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = bl[3][i];
    if (a > 1e-4) {
      od[j] = bl[0][i] / a; od[j + 1] = bl[1][i] / a; od[j + 2] = bl[2][i] / a;
      od[j + 3] = a * 255 + 0.5;
    }
  }
  ox.putImageData(o, 0, 0);
  return out;
}

/** luminanceMap(canvas) → Float32Array(w*h) of perceptual luma 0–1 (Rec.709 on sRGB, alpha ignored). */
export function luminanceMap(canvas) {
  const { data } = getPixels(canvas);
  const n = canvas.width * canvas.height;
  const m = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    m[i] = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
  }
  return m;
}

/**
 * heightFromMask(mask, w, h, bevel) → Float32Array 0..1: smooth rounded "pillow" height.
 * Rises with a circular profile over `bevel` px from the edge, flat beyond; edges keep the
 * mask's anti-aliasing (height × mask).
 */
export function heightFromMask(mask, w, h, bevel) {
  const n = w * h;
  bevel = Math.max(0.5, bevel);
  const inside = insideDistance(mask, w, h, 0.5);
  let ht = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = inside[i];
    if (d <= 0) continue;
    const t = clamp((d - 0.5) / bevel);
    const u = 1 - t;
    ht[i] = Math.sqrt(1 - u * u);
  }
  // soften medial-axis creases a little
  const soft = Math.min(bevel * 0.18, 6);
  if (soft > 0.6) ht = blurMask(ht, w, h, soft);
  for (let i = 0; i < n; i++) ht[i] *= mask[i];
  return ht;
}

/** normalsFromHeight(height, w, h, strength = 1) → { nx, ny, nz } unit normals (central differences). */
export function normalsFromHeight(height, w, h, strength = 1) {
  const n = w * h;
  const nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
      const dx = (height[y * w + x1] - height[y * w + x0]) * strength * 0.5;
      const dy = (height[y1 * w + x] - height[y0 * w + x]) * strength * 0.5;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = y * w + x;
      nx[i] = -dx * inv; ny[i] = -dy * inv; nz[i] = inv;
    }
  }
  return { nx, ny, nz };
}

/* ───────────────────────────── contours ─────────────────────────────── */

// Ramer–Douglas–Peucker on an open polyline pts[a..b] (inclusive) → keep flags.
function rdp(pts, a, b, eps2, keep) {
  const stack = [a, b];
  while (stack.length) {
    const j = stack.pop(), i = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let best = -1, bestD = eps2;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d2 = ex * ex + ey * ey;
      if (d2 > bestD) { bestD = d2; best = k; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push(i, best, best, j);
    }
  }
}

/** simplifyPolyline(closedPts, eps) — RDP simplification of a closed polyline. */
export function simplifyPolyline(pts, eps = 1) {
  const n = pts.length;
  if (n < 5 || !(eps > 0)) return pts;
  // split at point 0 and the point farthest from it
  let far = 0, fd = -1;
  for (let k = 1; k < n; k++) {
    const dx = pts[k][0] - pts[0][0], dy = pts[k][1] - pts[0][1];
    const d = dx * dx + dy * dy;
    if (d > fd) { fd = d; far = k; }
  }
  const ring = pts.concat([pts[0]]);
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  rdp(ring, 0, far, eps * eps, keep);
  rdp(ring, far, n, eps * eps, keep);
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[k]);
  return out.length >= 3 ? out : pts;
}

/**
 * traceContours(mask, w, h, threshold = 0.5, simplify = 1) → Array<Array<[x, y]>>.
 * Marching squares with sub-pixel interpolation; every polyline is closed (last point
 * connects to first). Coordinates are canvas px (pixel centers at +0.5), so filling the
 * paths reproduces the shape. Outer contours run clockwise on screen, holes
 * counter-clockwise — fill with either "nonzero" or "evenodd". `simplify` = RDP epsilon px.
 */
export function traceContours(mask, w, h, threshold = 0.5, simplify = 1) {
  const W2 = w + 2, H2 = h + 2;
  const VOFF = W2 * H2;
  const val = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  const ins = new Uint8Array(W2 * H2); // padded binary grid
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (mask[y * w + x] >= threshold) ins[(y + 1) * W2 + x + 1] = 1;
  }
  const next = new Map();
  // edge ids: H(x,y) joins grid (x,y)-(x+1,y); V(x,y) joins (x,y)-(x,y+1); grid x∈[-1,w], y∈[-1,h]
  const Hid = (x, y) => (y + 1) * W2 + (x + 1);
  const Vid = (x, y) => VOFF + (y + 1) * W2 + (x + 1);
  for (let cy = -1; cy < h; cy++) {
    const r0 = (cy + 1) * W2, r1 = (cy + 2) * W2;
    for (let cx = -1; cx < w; cx++) {
      const tl = ins[r0 + cx + 1], tr = ins[r0 + cx + 2], br = ins[r1 + cx + 2], bl = ins[r1 + cx + 1];
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const T = Hid(cx, cy), B = Hid(cx, cy + 1), L = Vid(cx, cy), R = Vid(cx + 1, cy);
      switch (c) {
        case 1: next.set(L, B); break;
        case 2: next.set(B, R); break;
        case 3: next.set(L, R); break;
        case 4: next.set(R, T); break;
        case 5: {
          const centre = (val(cx, cy) + val(cx + 1, cy) + val(cx + 1, cy + 1) + val(cx, cy + 1)) / 4;
          if (centre >= threshold) { next.set(L, T); next.set(R, B); }
          else { next.set(R, T); next.set(L, B); }
          break;
        }
        case 6: next.set(B, T); break;
        case 7: next.set(L, T); break;
        case 8: next.set(T, L); break;
        case 9: next.set(T, B); break;
        case 10: {
          const centre = (val(cx, cy) + val(cx + 1, cy) + val(cx + 1, cy + 1) + val(cx, cy + 1)) / 4;
          if (centre >= threshold) { next.set(T, R); next.set(B, L); }
          else { next.set(T, L); next.set(B, R); }
          break;
        }
        case 11: next.set(T, R); break;
        case 12: next.set(R, L); break;
        case 13: next.set(R, B); break;
        case 14: next.set(B, L); break;
      }
    }
  }
  const point = (id) => {
    let x0, y0, x1, y1;
    if (id >= VOFF) {
      const k = id - VOFF;
      x0 = (k % W2) - 1; y0 = Math.floor(k / W2) - 1; x1 = x0; y1 = y0 + 1;
    } else {
      x0 = (id % W2) - 1; y0 = Math.floor(id / W2) - 1; x1 = x0 + 1; y1 = y0;
    }
    const v0 = val(x0, y0), v1 = val(x1, y1);
    let t = v1 !== v0 ? (threshold - v0) / (v1 - v0) : 0.5;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [x0 + (x1 - x0) * t + 0.5, y0 + (y1 - y0) * t + 0.5];
  };
  const contours = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const pts = [];
    let id = start;
    let guard = next.size + 2;
    while (guard-- > 0) {
      const nx = next.get(id);
      if (nx === undefined) break;
      next.delete(id);
      pts.push(point(id));
      id = nx;
      if (id === start) break;
    }
    if (pts.length >= 3) contours.push(simplify > 0 ? simplifyPolyline(pts, simplify) : pts);
  }
  return contours;
}

/** contoursToPath(contours) → Path2D of the closed polylines (handy for fill/stroke). */
export function contoursToPath(contours, scale = 1, dx = 0, dy = 0) {
  const p = new Path2D();
  for (const c of contours) {
    if (c.length < 3) continue;
    p.moveTo(c[0][0] * scale + dx, c[0][1] * scale + dy);
    for (let i = 1; i < c.length; i++) p.lineTo(c[i][0] * scale + dx, c[i][1] * scale + dy);
    p.closePath();
  }
  return p;
}

/* ──────────────────────────── compositing ───────────────────────────── */

/** tintCanvas(canvas, hex) → new canvas: flat `hex` with the source alpha. */
export function tintCanvas(canvas, hex) {
  const out = createCanvas(canvas.width, canvas.height);
  const x = ctx2d(out);
  x.drawImage(canvas, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = normalizeHex(hex) || "#000000";
  x.fillRect(0, 0, out.width, out.height);
  return out;
}

/** gradientLUT(stops) → Uint8Array(256*3) RGB lookup for stops [{ at, color }]. */
export function gradientLUT(stops) {
  const s = (stops && stops.length ? stops : [{ at: 0, color: "#000000" }, { at: 1, color: "#FFFFFF" }])
    .map((st) => ({ at: clamp(+st.at || 0), rgb: hexToRgb(st.color) }))
    .sort((a, b) => a.at - b.at);
  const lut = new Uint8Array(256 * 3);
  const last = s.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let A = s[0].rgb, B = s[0].rgb, u = 0;
    if (t >= s[last].at) { A = B = s[last].rgb; }
    else if (t > s[0].at) {
      let k = 0;
      while (k < last - 1 && s[k + 1].at <= t) k++;
      A = s[k].rgb; B = s[k + 1].rgb;
      const span = s[k + 1].at - s[k].at;
      u = span > 0 ? clamp((t - s[k].at) / span) : 1;
    }
    lut[i * 3] = lerp(A[0], B[0], u) + 0.5;
    lut[i * 3 + 1] = lerp(A[1], B[1], u) + 0.5;
    lut[i * 3 + 2] = lerp(A[2], B[2], u) + 0.5;
  }
  return lut;
}

/** applyGradientMap(canvas, stops) → new canvas: luminance mapped through stops [{at, color}], alpha kept. */
export function applyGradientMap(canvas, stops) {
  const lut = gradientLUT(stops);
  const img = getPixels(canvas);
  const d = img.data;
  for (let j = 0; j < d.length; j += 4) {
    if (d[j + 3] === 0) continue;
    const l = (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2] + 0.5) | 0;
    const k = (l > 255 ? 255 : l) * 3;
    d[j] = lut[k]; d[j + 1] = lut[k + 1]; d[j + 2] = lut[k + 2];
  }
  return canvasFromImageData(img);
}

/** clipToMask(canvas, mask) → new canvas keeping `canvas` only where mask (a canvas's alpha, or a Float32Array) is opaque. */
export function clipToMask(canvas, maskCanvas) {
  const w = canvas.width, h = canvas.height;
  const m = maskCanvas instanceof Float32Array ? maskToCanvas(maskCanvas, w, h) : maskCanvas;
  const out = createCanvas(w, h);
  const x = ctx2d(out);
  x.drawImage(canvas, 0, 0);
  x.globalCompositeOperation = "destination-in";
  x.drawImage(m, 0, 0, w, h);
  return out;
}

/** posterize(canvas, levels) → new canvas with each RGB channel quantized to `levels` steps. */
export function posterize(canvas, levels = 4) {
  const L = Math.max(2, Math.round(levels));
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.round((i / 255) * (L - 1)) * (255 / (L - 1)));
  const img = getPixels(canvas);
  const d = img.data;
  for (let j = 0; j < d.length; j += 4) {
    d[j] = lut[d[j]]; d[j + 1] = lut[d[j + 1]]; d[j + 2] = lut[d[j + 2]];
  }
  return canvasFromImageData(img);
}

/** nearestColorIndex(r, g, b, rgbList) — index of the perceptually nearest color (weighted RGB). */
export function nearestColorIndex(r, g, b, list) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    const rm = (r + c[0]) * 0.5;
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** quantizeToPalette(canvas, hexes) → new canvas with every pixel snapped to the nearest palette color (alpha kept). */
export function quantizeToPalette(canvas, hexes) {
  const list = (hexes || []).map(hexToRgb);
  if (!list.length) return cloneCanvas(canvas);
  const img = getPixels(canvas);
  const d = img.data;
  const cache = new Int16Array(32768).fill(-1); // 15-bit color → palette index
  for (let j = 0; j < d.length; j += 4) {
    if (d[j + 3] === 0) continue;
    const key = ((d[j] >> 3) << 10) | ((d[j + 1] >> 3) << 5) | (d[j + 2] >> 3);
    let k = cache[key];
    if (k < 0) k = cache[key] = nearestColorIndex(d[j], d[j + 1], d[j + 2], list);
    const c = list[k];
    d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2];
  }
  return canvasFromImageData(img);
}

/** compose(dst, src, { op = "source-over", alpha = 1, x = 0, y = 0, w?, h? }) — draw src onto dst; returns dst. */
export function compose(dst, src, { op = "source-over", alpha = 1, x = 0, y = 0, w, h } = {}) {
  const c = ctx2d(dst);
  c.save();
  c.globalCompositeOperation = op;
  c.globalAlpha = alpha;
  if (w != null && h != null) c.drawImage(src, x, y, w, h);
  else c.drawImage(src, x, y);
  c.restore();
  return dst;
}

/** maskBounds(mask, w, h, threshold = 0.02) → { x0, y0, x1, y1, empty } bounding box of mask > threshold. */
export function maskBounds(mask, w, h, threshold = 0.02) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0, empty: true } : { x0, y0, x1: x1 + 1, y1: y1 + 1, empty: false };
}

/** sampleBilinear(map, w, h, x, y) — bilinear lookup in a Float32Array map (clamped). */
export function sampleBilinear(map, w, h, x, y) {
  x = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = map[y0 * w + x0], b = map[y0 * w + x1], c = map[y1 * w + x0], d = map[y1 * w + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
