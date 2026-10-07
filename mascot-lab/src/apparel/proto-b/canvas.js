// proto-b · canvas helpers. OffscreenCanvas-first so the whole engine can move into a
// Worker unchanged; falls back to a DOM canvas only when OffscreenCanvas is missing.

export function createCanvas(w, h = w) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = globalThis.document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
export const ctx2d = (c, read = false) => c.getContext("2d", read ? { willReadFrequently: true } : undefined);

let blurOK = null;
/** Does ctx.filter = "blur()" work on this platform's 2D canvases? */
export function canvasBlurWorks() {
  if (blurOK !== null) return blurOK;
  try {
    const c = createCanvas(8, 8);
    const x = ctx2d(c, true);
    x.filter = "blur(2px)";
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 8, 4);
    blurOK = x.filter === "blur(2px)" && x.getImageData(4, 5, 1, 1).data[3] > 0;
  } catch { blurOK = false; }
  return blurOK;
}

/** Gaussian-ish blur of `src` drawn into ctx (filter when available, else down/up sample). */
export function drawBlurred(ctx, src, sigma, dx = 0, dy = 0, dw = src.width, dh = src.height) {
  if (sigma < 0.25) { ctx.drawImage(src, dx, dy, dw, dh); return; }
  if (canvasBlurWorks()) {
    const f = ctx.filter;
    ctx.filter = `blur(${sigma.toFixed(2)}px)`;
    ctx.drawImage(src, dx, dy, dw, dh);
    ctx.filter = f || "none";
    return;
  }
  // fallback: two-step box resample (good enough for soft light)
  const s = Math.max(1, sigma / 1.2);
  const small = createCanvas(Math.max(1, src.width / s), Math.max(1, src.height / s));
  const sx = ctx2d(small);
  sx.imageSmoothingEnabled = true;
  sx.drawImage(src, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, dx, dy, dw, dh);
}

/** Path2D from a closed polygon (artboard units). */
export function polyPath(pts, closed = true) {
  const p = new Path2D();
  if (!pts?.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
}

/** Small LRU. */
export class LRU {
  constructor(max) { this.max = max; this.map = new Map(); }
  get(k) {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k, v) {
    this.map.delete(k); this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return v;
  }
  delete(k) { this.map.delete(k); }
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
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
export const isHex = (v) => typeof v === "string" && HEX_RE.test(v.trim());
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
