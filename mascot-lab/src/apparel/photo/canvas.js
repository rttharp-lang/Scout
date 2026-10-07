// photo engine · canvas + colour utilities.
//
// OffscreenCanvas-first so the whole engine runs unchanged in a Worker; a DOM canvas is
// only created when OffscreenCanvas is missing (old Safari). Nothing in this folder may
// touch `document` except through the fallbacks below.

/** createCanvas(w, h = w) → OffscreenCanvas (or an HTMLCanvasElement where unavailable). */
export function createCanvas(w, h = w) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = globalThis.document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** 2D context; `read` = true for canvases we read back with getImageData. */
export const ctx2d = (c, read = false) => c.getContext("2d", read ? { willReadFrequently: true } : undefined);

export const now = () => (globalThis.performance ? performance.now() : Date.now());

/* ───────────────────────────── blur ───────────────────────────── */

let blurOK = null;
/** Does `ctx.filter = "blur()"` work here? (Chromium, Firefox: yes; older Safari: no.) */
export function canvasBlurWorks() {
  if (blurOK !== null) return blurOK;
  try {
    const c = createCanvas(8, 8);
    const x = ctx2d(c, true);
    x.filter = "blur(2px)";
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 8, 4);
    blurOK = x.filter === "blur(2px)" && x.getImageData(4, 5, 1, 1).data[3] > 0;
  } catch {
    blurOK = false;
  }
  return blurOK;
}
/** Test hook: force the no-filter fallback (harness ?blur=js). */
export function forceJsBlur(on) { blurOK = on ? false : null; }

/** In-place 3-pass box blur (≈ gaussian σ) of every channel of an ImageData. */
function boxBlurImageData(img, sigma) {
  const { width: w, height: h, data } = img;
  // three box widths that approximate a gaussian (Kovesi)
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const radii = [0, 1, 2].map((i) => ((i < m ? wl : wl + 2) - 1) / 2);
  const tmp = new Float32Array(Math.max(w, h));
  for (let ch = 0; ch < 4; ch++) {
    for (const r of radii) {
      if (r < 1) continue;
      const span = 2 * r + 1;
      for (let y = 0; y < h; y++) {                     // horizontal
        const row = y * w;
        let acc = data[row * 4 + ch] * (r + 1);
        for (let i = 1; i <= r; i++) acc += data[(row + Math.min(w - 1, i)) * 4 + ch];
        for (let x = 0; x < w; x++) {
          tmp[x] = acc / span;
          acc += data[(row + Math.min(w - 1, x + r + 1)) * 4 + ch] - data[(row + Math.max(0, x - r)) * 4 + ch];
        }
        for (let x = 0; x < w; x++) data[(row + x) * 4 + ch] = tmp[x];
      }
      for (let x = 0; x < w; x++) {                     // vertical
        let acc = data[x * 4 + ch] * (r + 1);
        for (let i = 1; i <= r; i++) acc += data[(Math.min(h - 1, i) * w + x) * 4 + ch];
        for (let y = 0; y < h; y++) {
          tmp[y] = acc / span;
          acc += data[(Math.min(h - 1, y + r + 1) * w + x) * 4 + ch] - data[(Math.max(0, y - r) * w + x) * 4 + ch];
        }
        for (let y = 0; y < h; y++) data[(y * w + x) * 4 + ch] = tmp[y];
      }
    }
  }
}

/**
 * drawBlurred(ctx, src, sigmaPx, dx, dy, dw, dh) — draw `src` gaussian-blurred by σ (in
 * DESTINATION pixels). Uses the canvas filter when it works, else a JS box blur of a copy
 * (only used on the small, low-resolution light layers, so the fallback stays fast).
 */
export function drawBlurred(ctx, src, sigma, dx = 0, dy = 0, dw = src.width, dh = src.height) {
  if (sigma < 0.25) { ctx.drawImage(src, dx, dy, dw, dh); return; }
  if (canvasBlurWorks()) {
    const f = ctx.filter;
    ctx.filter = `blur(${sigma.toFixed(2)}px)`;
    ctx.drawImage(src, dx, dy, dw, dh);
    ctx.filter = f || "none";
    return;
  }
  // fallback: blur at the source's own resolution (σ rescaled), with a margin for the tails
  const k = src.width / dw;
  const s = sigma * k, pad = Math.ceil(s * 3);
  const c = createCanvas(src.width + pad * 2, src.height + pad * 2);
  const x = ctx2d(c, true);
  x.drawImage(src, pad, pad);
  const img = x.getImageData(0, 0, c.width, c.height);
  boxBlurImageData(img, s);
  x.putImageData(img, 0, 0);
  ctx.drawImage(c, dx - pad / k, dy - pad / k, dw + (2 * pad) / k, dh + (2 * pad) / k);
}

/**
 * softStroke(ctx, path, width, blurPx) — stroke `path` with the current strokeStyle,
 * softened by `blurPx` device pixels. Without canvas filters the softness is faked with
 * three nested strokes of falling alpha (seams and fold grooves stay soft, not wiry).
 */
export function softStroke(ctx, path, width, blurPx) {
  if (canvasBlurWorks() || blurPx < 0.5) {
    const f = ctx.filter;
    if (blurPx >= 0.3) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
    ctx.lineWidth = width;
    ctx.stroke(path);
    ctx.filter = f || "none";
    return;
  }
  const a = ctx.globalAlpha;
  const k = ctx.getTransform().a || 1;                  // units → px
  const bu = blurPx / k;
  for (const [grow, aMul] of [[0, 0.5], [0.9, 0.3], [1.8, 0.18]]) {
    ctx.globalAlpha = a * aMul;
    ctx.lineWidth = width + bu * grow * 2;
    ctx.stroke(path);
  }
  ctx.globalAlpha = a;
}

/** Path2D from a polyline (artboard units). */
export function polyPath(pts, closed = true) {
  const p = new Path2D();
  if (!pts?.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
}

/* ───────────────────────────── caches ───────────────────────────── */

/** Small count-bounded LRU. */
export class LRU {
  constructor(max) { this.max = max; this.map = new Map(); }
  get(k) {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return v;
  }
  clear() { this.map.clear(); }
}

/** LRU bounded by a cost (bytes); the newest entry always survives. */
export class CostLRU {
  constructor(maxCost) { this.maxCost = maxCost; this.cost = 0; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    this.map.delete(k);
    this.map.set(k, e);
    return e.v;
  }
  set(k, v, cost) {
    const old = this.map.get(k);
    if (old) { this.cost -= old.cost; this.map.delete(k); }
    this.map.set(k, { v, cost });
    this.cost += cost;
    while (this.cost > this.maxCost && this.map.size > 1) {
      const [ok, oe] = this.map.entries().next().value;
      this.map.delete(ok);
      this.cost -= oe.cost;
    }
    return v;
  }
  clear() { this.map.clear(); this.cost = 0; }
}

/* ───────────────────────────── colour ───────────────────────────── */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHex = (v) => typeof v === "string" && HEX_RE.test(v.trim());
/** hex(v, fallback) → "#RRGGBB" (accepts #RGB, with or without #). */
export function hex(v, fallback = "#808080") {
  if (typeof v !== "string") return fallback;
  const m = v.trim().match(HEX_RE);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toUpperCase();
}
export function rgbOf(h) {
  const n = parseInt(hex(h).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Relative luminance (WCAG), 0–1. */
export function relLum(h) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgbOf(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function mixHex(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0");
  return ("#" + c(0) + c(1) + c(2)).toUpperCase();
}
/** tonalOf(baseHex) → a shade of the base for understated prints (dark → lighter, light → darker). */
export function tonalOf(base) {
  const L = relLum(base);
  if (L < 0.05) return mixHex(base, "#FFFFFF", 0.16);
  if (L < 0.22) return mixHex(base, "#FFFFFF", 0.13);
  if (L < 0.5) return mixHex(base, "#000000", 0.16);
  return mixHex(base, "#000000", 0.12);
}
