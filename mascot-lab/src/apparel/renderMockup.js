// Mascot Lab — garment mockup renderer (public API for every page).
//
// renderMockup(garment, viewId, opts) dispatches on the garment's format:
//   · garment.format === "photo" → the painted-light engine in ./photo/ (studio-lit
//     product render; see GARMENTS.md). This is the production path.
//   · anything else              → the LEGACY vector renderer below (technical flats with
//     outline strokes). Kept only until every garment is converted; delete everything
//     from "LEGACY VECTOR RENDERER" down (and textures.js) once none is left.
//
// Both paths share one option set and return an HTMLCanvasElement (size × size):
//   { size = 800, colors: { base, trim, accent }, graphics: Placement[], text,
//     backdrop: null | "#hex" | "studio", shadow = true, detail = "full" | "fast", timings }
// "studio" is a lit paper sweep (photo garments; legacy garments get a flat #ECEDEF).
//
// ─── LEGACY VECTOR RENDERER ───
// Draws one view of a garment (a technical flat on a 1000×1000 artboard):
//
//   drop shadow → parts (filled by colour role) → graphics (clipped to printArea ∩
//   silhouette) → lettering (Graduate, outline under fill) → parts marked `over`
//   (labels, drawcords…) → fabric texture → overlays (seams, stitching, rib, soft
//   folds) → silhouette outline.
//
// Everything that does not depend on colours or graphics is cached:
//   · Path2D objects per garment view
//   · blurred soft shading + drop shadow: rendered once per view at 400 px, shared by all sizes
//   · the "finish" layer (texture + volume + overlays + outline) per view/size/detail,
//     in a pixel-budget LRU (~110 MB max)
//   · fabric tiles, tinted / pre-scaled graphics, brick-repeat tiles, lettering layers
// So a recolour or a new effect re-renders in ~2 ms at 600 px and ~7 ms at 1600 px;
// the first render of a view at a new size pays ~55–70 ms (600) / ~110–130 ms (1600).
// Pass `timings: {}` to get per-phase milliseconds.
//
// Additive extensions to CONTRACTS.md (all optional, backwards compatible):
//   part.over = true          paint this part after graphics + text (jock tag, drawcords)
//   part.texture = false      keep the fabric texture off this part (woven labels, tapes)
//   overlay.follow = "M…"     rib: rib lines are drawn perpendicular to this centre line
//                             (curved bindings) instead of vertical
//   overlay.width             seam/stitch: line width (units); shadow/highlight/edge: blur radius
//   overlay.angle             rib: rib direction in degrees when no `follow` (default 90 = vertical)
//   overlay.gap               stitch: distance between the twin needles (units, default 4)
//   placement.tint = "tonal"  tint computed from colors.base (lighter on dark bases, darker on light)
//   placement.knockout=false  tint as a flat silhouette instead of a one-colour separation
//   printArea is clipped with the even-odd rule, so an inner subpath cuts a hole.
import "@fontsource/graduate/400.css";
import { fabricPattern } from "./textures.js";
import { renderPhoto, isPhotoGarment, photoViewBounds, clearLetteringMetrics } from "./photo/index.js";

export const ARTBOARD = 1000;
export const SAFE = 0.72;
export const LETTERING_FONT = "Graduate";
export { isPhotoGarment };

/* ───────────────────────────── utilities ───────────────────────────── */

function makeCanvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
/** 2D context for canvases we read back with getImageData. */
const readableCtx = (c) => c.getContext("2d", { willReadFrequently: true });

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
function hex(v, fallback = "#808080") {
  if (typeof v !== "string") return fallback;
  const m = v.trim().match(HEX_RE);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toUpperCase();
}
function rgb(h) {
  const n = parseInt(hex(h).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r, g, b) {
  const c = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}
function lum(h) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** tonalOf(baseHex) → a shade/tint of the base for understated prints (dark → lighter, light → darker). */
export function tonalOf(base) {
  const L = lum(base);
  if (L < 0.05) return mixHex(base, "#FFFFFF", 0.16);
  if (L < 0.22) return mixHex(base, "#FFFFFF", 0.13);
  if (L < 0.5) return mixHex(base, "#000000", 0.16);
  return mixHex(base, "#000000", 0.12);
}

/** Small LRU used by the caches below. */
class LRU {
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
}

/** LRU bounded by total pixel count (for full-size cached layers). */
class PixelLRU {
  constructor(maxPx) { this.maxPx = maxPx; this.px = 0; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    this.map.delete(k); this.map.set(k, e);
    return e.v;
  }
  set(k, v, px) {
    const old = this.map.get(k);
    if (old) { this.px -= old.px; this.map.delete(k); }
    this.map.set(k, { v, px });
    this.px += px;
    while (this.px > this.maxPx && this.map.size > 1) {
      const [ok, oe] = this.map.entries().next().value;
      this.map.delete(ok); this.px -= oe.px;
    }
    return v;
  }
}

let blurOK = null;
function canvasBlurWorks() {
  if (blurOK !== null) return blurOK;
  try {
    const c = makeCanvas(8, 8);
    const x = c.getContext("2d");
    x.filter = "blur(2px)";
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 8, 4);
    blurOK = x.filter === "blur(2px)" && x.getImageData(4, 5, 1, 1).data[3] > 0;
  } catch { blurOK = false; }
  return blurOK;
}

/* ─────────────────────────── compiled views ─────────────────────────── */

// garment object → Map(viewId → compiled view with Path2D objects)
const compiled = new WeakMap();

/**
 * bboxOfPath(d) → { x, y, w, h } bounds of an SVG path string (control points
 * included, so it is a slight over-estimate for curves). Handles absolute and
 * relative M L H V C S Q T A Z.
 */
function bboxOfPath(d) {
  const full = { x: 0, y: 0, w: ARTBOARD, h: ARTBOARD };
  if (typeof d !== "string") return full;
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return full;
  const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = null, i = 0;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) { cmd = tokens[i++]; if (/z/i.test(cmd)) { cx = sx; cy = sy; continue; } }
    if (!cmd) return full;
    const lc = cmd.toLowerCase(), rel = cmd !== cmd.toUpperCase(), n = ARGS[lc];
    const a = tokens.slice(i, i + n).map(Number);
    if (a.length < n || a.some((v) => !Number.isFinite(v))) break;
    i += n;
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (lc === "h") { cx = ox + a[0]; add(cx, cy); }
    else if (lc === "v") { cy = oy + a[0]; add(cx, cy); }
    else if (lc === "a") {
      const ex = ox + a[5], ey = oy + a[6], r = Math.max(Math.abs(a[0]), Math.abs(a[1]));
      add(cx, cy); add(ex, ey);
      add(Math.min(cx, ex) - r * 0.5, Math.min(cy, ey) - r * 0.5); add(Math.max(cx, ex) + r * 0.5, Math.max(cy, ey) + r * 0.5);
      cx = ex; cy = ey;
    } else {
      for (let j = 0; j < n; j += 2) add(ox + a[j], oy + a[j + 1]);
      cx = ox + a[n - 2]; cy = oy + a[n - 1];
      if (lc === "m") { sx = cx; sy = cy; cmd = rel ? "l" : "L"; }
    }
  }
  if (!Number.isFinite(x0)) return full;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function compileView(garment, viewId) {
  let views = compiled.get(garment);
  if (!views) { views = new Map(); compiled.set(garment, views); }
  let cv = views.get(viewId);
  if (cv) return cv;
  const view = garment?.views?.[viewId];
  if (!view) return null;
  const P = (d) => (typeof d === "string" && d.trim() ? new Path2D(d) : null);
  cv = {
    view,
    silhouette: P(view.silhouette),
    printArea: P(view.printArea) || P(view.silhouette),
    printBounds: bboxOfPath(view.printArea || view.silhouette || ""),
    bounds: bboxOfPath(view.silhouette || ""),
    parts: (view.parts || []).map((p) => ({ ...p, path: P(p.d) })).filter((p) => p.path),
    overlays: (view.overlays || []).map((o) => ({ ...o, path: P(o.d), followPath: P(o.follow) })).filter((o) => o.path),
    zones: view.zones || {},
    text: view.text || null,
    noTexture: null,
    key: `${garment.id || "garment"}:${viewId}`,
  };
  // parts with texture: false (woven labels, tapes) are cut out of the fabric texture
  const plain = cv.parts.filter((p) => p.texture === false);
  if (plain.length) {
    const nt = new Path2D();
    nt.rect(-ARTBOARD, -ARTBOARD, ARTBOARD * 3, ARTBOARD * 3);
    for (const p of plain) nt.addPath(p.path);
    cv.noTexture = nt;
  }
  views.set(viewId, cv);
  return cv;
}

/* ─────────────────────────── colour roles ─────────────────────────── */

function fillFor(role, colors) {
  switch (role) {
    case "base": return colors.base;
    case "trim": return colors.trim;
    case "accent": return colors.accent;
    case "white": return "#FFFFFF";
    case "black": return "#111317";
    default: return hex(role, colors.base);
  }
}

/* ─────────────────────── cached soft layers (blurred) ─────────────────────── */

const softCache = new LRU(64);
// Soft layers are low-frequency, so they are rendered ONCE per garment view at a fixed
// resolution and shared by every output size (thumbnail, editor, 1600px export).
const SOFT_RES = 400;

/** Blur `src` into `dst` by rPx: canvas filter when available, else a down/up-sample blur. */
function blurInto(dst, src, rPx) {
  if (rPx < 0.3) { dst.drawImage(src, 0, 0); return; }
  if (canvasBlurWorks()) {
    dst.save();
    dst.filter = `blur(${rPx.toFixed(2)}px)`;
    dst.drawImage(src, 0, 0);
    dst.restore();
    return;
  }
  const f = Math.max(1, rPx / 1.4);
  const w = Math.max(1, Math.round(src.width / f)), h = Math.max(1, Math.round(src.height / f));
  const small = makeCanvas(w, h);
  const sx = small.getContext("2d");
  sx.imageSmoothingQuality = "high";
  sx.drawImage(src, 0, 0, w, h);
  dst.save();
  dst.imageSmoothingEnabled = true;
  dst.imageSmoothingQuality = "high";
  dst.drawImage(small, 0, 0, src.width, src.height);
  dst.restore();
}

const softBlur = (o) => o.width ?? (o.kind === "edge" ? 4 : 12);
function softPaint(x, o) {
  const op = o.opacity ?? (o.kind === "highlight" ? 0.1 : o.kind === "edge" ? 0.2 : 0.14);
  const color = o.kind === "highlight" ? `rgba(255,255,255,${op})` : `rgba(8,10,14,${op})`;
  if (o.kind === "edge") {
    x.strokeStyle = color;
    x.lineWidth = softBlur(o) * 1.6;
    x.lineJoin = "round"; x.lineCap = "round";
    x.stroke(o.path);
  } else {
    x.fillStyle = color;
    x.fill(o.path);
  }
}

/** Layer for a run of soft overlays (shadow / highlight / edge): one blur per distinct radius. */
function softLayer(cv, run, runIndex) {
  const key = `${cv.key}|soft${runIndex}`;
  const hit = softCache.get(key);
  if (hit) return hit;
  const k = SOFT_RES / ARTBOARD;
  const c = makeCanvas(SOFT_RES);
  const x = c.getContext("2d");
  const groups = new Map();
  for (const o of run) {
    const r = Math.round(softBlur(o) * 2) / 2;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(o);
  }
  const tmp = makeCanvas(SOFT_RES);
  const tx = tmp.getContext("2d");
  for (const [r, list] of groups) {
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.clearRect(0, 0, SOFT_RES, SOFT_RES);
    tx.setTransform(k, 0, 0, k, 0, 0);
    for (const o of list) softPaint(tx, o);
    blurInto(x, tmp, r * k);
  }
  return softCache.set(key, c);
}

/** Soft drop shadow under the garment (fixed resolution, blurred, shared across sizes). */
function dropShadowLayer(cv) {
  const key = `${cv.key}|drop`;
  const hit = softCache.get(key);
  if (hit) return hit;
  const k = SOFT_RES / ARTBOARD;
  const c = makeCanvas(SOFT_RES);
  const x = c.getContext("2d");
  const tmp = makeCanvas(SOFT_RES);
  const tx = tmp.getContext("2d");
  const pass = (blur, dy, alpha) => {
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.clearRect(0, 0, SOFT_RES, SOFT_RES);
    tx.setTransform(k, 0, 0, k, 0, dy * k);
    tx.fillStyle = `rgba(16,20,28,${alpha})`;
    tx.fill(cv.silhouette);
    blurInto(x, tmp, blur * k);
  };
  pass(16, 14, 0.2);
  pass(4, 4, 0.16);
  return softCache.set(key, c);
}

/* ─────────────────────────── graphics ─────────────────────────── */

const tintCache = new WeakMap();   // canvas → Map(tint → canvas)
const scaledCache = new WeakMap(); // canvas → Map(px → canvas)
const tileCache = new LRU(24);
let canvasIds = new WeakMap(), canvasSeq = 0;
const idOf = (c) => { let i = canvasIds.get(c); if (!i) { i = ++canvasSeq; canvasIds.set(c, i); } return i; };

/**
 * tinted(canvas, tint, lighterInk, knockout) → the graphic as ONE flat ink colour.
 * With knockout (default) it behaves like a one-colour screen separation: ink density
 * follows the artwork's own (normalised) luminance, so linework survives — a lighter
 * ink than the garment prints the light areas and knocks out the dark lines, a darker
 * ink prints the dark linework. Flat single-colour marks just become a silhouette.
 */
function tinted(canvas, tint, lighterInk = true, knockout = true) {
  let m = tintCache.get(canvas);
  if (!m) { m = new Map(); tintCache.set(canvas, m); }
  const key = `${tint}|${knockout ? (lighterInk ? "L" : "D") : "S"}`;
  let t = m.get(key);
  if (t) return t;
  t = makeCanvas(canvas.width, canvas.height);
  const x = knockout ? readableCtx(t) : t.getContext("2d");
  x.drawImage(canvas, 0, 0);
  let done = false;
  if (knockout) {
    try {
      const img = x.getImageData(0, 0, t.width, t.height);
      const d = img.data, n = t.width * t.height;
      // alpha-weighted luminance histogram → 5th / 95th percentiles
      const hist = new Float64Array(64);
      let wsum = 0;
      for (let i = 0; i < n; i++) {
        const a = d[i * 4 + 3];
        if (a < 8) continue;
        const Y = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
        hist[Math.min(63, (Y * 64) | 0)] += a;
        wsum += a;
      }
      const pct = (q) => { let acc = 0; for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc >= q * wsum) return (b + 0.5) / 64; } return 1; };
      const lo = pct(0.05), hi = pct(0.95);
      if (wsum > 0 && hi - lo >= 0.22) {
        const [r, g, b] = rgb(tint);
        const span = hi - lo;
        for (let i = 0; i < n; i++) {
          const o = i * 4, a = d[o + 3];
          if (!a) continue;
          const Y = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;
          let v = (Y - lo) / span;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          if (!lighterInk) v = 1 - v;
          // smoothstep(0.2, 0.62): clean separation, slight tone in the mids
          let dens = (v - 0.2) / 0.42;
          dens = dens <= 0 ? 0 : dens >= 1 ? 1 : dens * dens * (3 - 2 * dens);
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(a * dens);
        }
        x.putImageData(img, 0, 0);
        done = true;
      }
    } catch { /* tainted canvas → flat silhouette */ }
  }
  if (!done) {
    x.globalCompositeOperation = "source-in";
    x.fillStyle = tint;
    x.fillRect(0, 0, t.width, t.height);
  }
  if (m.size > 8) m.delete(m.keys().next().value);
  m.set(key, t);
  return t;
}

/** Downscale a big graphic in halving steps (crisper than one huge bilinear jump). */
function scaledTo(canvas, px) {
  const target = Math.max(8, Math.round(px));
  if (target >= canvas.width * 0.7) return canvas;
  let m = scaledCache.get(canvas);
  if (!m) { m = new Map(); scaledCache.set(canvas, m); }
  const bucketPx = Math.ceil(target / 32) * 32;
  let s = m.get(bucketPx);
  if (s) return s;
  let cur = canvas;
  while (cur.width / 2 > bucketPx) {
    const half = makeCanvas(cur.width / 2, cur.height / 2);
    const hx = half.getContext("2d");
    hx.imageSmoothingQuality = "high";
    hx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  s = makeCanvas(bucketPx, Math.round((bucketPx * canvas.height) / canvas.width));
  const sx = s.getContext("2d");
  sx.imageSmoothingQuality = "high";
  sx.drawImage(cur, 0, 0, s.width, s.height);
  if (m.size > 6) m.delete(m.keys().next().value);
  m.set(bucketPx, s);
  return s;
}

function resolveTint(tint, colors) {
  if (!tint) return null;
  if (tint === "tonal") return tonalOf(colors.base);
  if (tint === "base" || tint === "trim" || tint === "accent") return colors[tint];
  return HEX_RE.test(tint) ? hex(tint) : null;
}

/** Fit the graphic's SAFE box (contain) into `box` × scale; returns drawn size in units. */
function fitSize(canvas, box, scale) {
  const sw = canvas.width * SAFE, sh = canvas.height * SAFE;
  const fit = Math.min(box.w / sw, box.h / sh) * scale;
  return { w: canvas.width * fit, h: canvas.height * fit };
}

function drawSingle(ctx, pl, src, zone, k) {
  const scale = Number.isFinite(pl.scale) && pl.scale > 0 ? pl.scale : 1;
  const { w, h } = fitSize(src, zone, scale);
  const cx = zone.x + zone.w / 2 + (pl.dx || 0) * zone.w;
  const cy = zone.y + zone.h / 2 + (pl.dy || 0) * zone.h;
  const img = scaledTo(src, w * k);
  ctx.save();
  ctx.translate(cx, cy);
  if (pl.rotate) ctx.rotate((pl.rotate * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Brick-repeat tile: one cell wide, two rows tall, motif wrapped across edges. */
function brickTile(src, tile, scale, k, tintKey) {
  const key = `${idOf(src)}|${tintKey}|${tile}|${scale}|${k.toFixed(3)}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const W = Math.max(4, Math.round(tile * k)), H = W * 2;
  const c = makeCanvas(W, H);
  const x = c.getContext("2d");
  const cell = { w: W, h: W };
  const { w, h } = fitSize(src, cell, scale);
  const img = scaledTo(src, w);
  x.imageSmoothingQuality = "high";
  const centers = [[W / 2, W / 2], [0, W * 1.5]];
  for (const [cx, cy] of centers) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const px = cx + i * W, py = cy + j * H;
      if (px + w / 2 < 0 || px - w / 2 > W || py + h / 2 < 0 || py - h / 2 > H) continue;
      x.drawImage(img, px - w / 2, py - h / 2, w, h);
    }
  }
  const out = { canvas: c, unitsPerPx: tile / W };
  return tileCache.set(key, out);
}

function drawTiled(ctx, pl, src, cv, k, tintKey) {
  const tile = Number.isFinite(pl.tile) && pl.tile > 20 ? pl.tile : 220;
  const scale = Number.isFinite(pl.scale) && pl.scale > 0 ? pl.scale : 1;
  const t = brickTile(src, tile, scale, k, tintKey);
  const pattern = ctx.createPattern(t.canvas, "repeat");
  if (!pattern) return;
  const b = cv.printBounds;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const m = new DOMMatrix()
    .translate(cx + (pl.dx || 0) * tile, cy + (pl.dy || 0) * tile)
    .rotate(pl.rotate || 0)
    .translate(-tile / 2, -tile / 2)
    .scale(t.unitsPerPx);
  pattern.setTransform(m);
  ctx.fillStyle = pattern;
  ctx.fillRect(b.x - 50, b.y - 50, b.w + 100, b.h + 100);
}

function drawGraphics(ctx, cv, graphics, colors, k) {
  if (!graphics?.length) return;
  ctx.save();
  if (cv.silhouette) ctx.clip(cv.silhouette);
  ctx.clip(cv.printArea, "evenodd");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const zoneIds = Object.keys(cv.zones);
  for (const pl of graphics) {
    const canvas = pl?.canvas;
    if (!canvas || !canvas.width || !canvas.height) continue;
    const tint = resolveTint(pl.tint, colors);
    const src = tint ? tinted(canvas, tint, lum(tint) >= lum(colors.base), pl.knockout !== false) : canvas;
    ctx.save();
    ctx.globalAlpha = Number.isFinite(pl.opacity) ? Math.max(0, Math.min(1, pl.opacity)) : 1;
    ctx.globalCompositeOperation = pl.blend === "multiply" || pl.blend === "screen" ? pl.blend : "source-over";
    if (pl.mode === "tile") {
      drawTiled(ctx, pl, src, cv, k, tint ? `${tint}|${lum(tint) >= lum(colors.base)}|${pl.knockout !== false}` : "-");
    } else {
      // unknown zone → the view's main zone, so a recipe for another garment still lands sensibly
      const zone = cv.zones[pl.zone] || cv.zones.center || cv.zones["back-center"] || cv.zones[zoneIds[0]];
      if (zone) drawSingle(ctx, pl, src, zone, k);
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ─────────────────────────── lettering ─────────────────────────── */

const FONT = `"${LETTERING_FONT}", "Rockwell", "Courier New", serif`;
const metricCache = new Map();

function glyphMetrics(ctx, str) {
  const key = str;
  let m = metricCache.get(key);
  if (m && m.font === document.fonts?.check?.(`400 100px ${FONT}`)) return m;
  ctx.save();
  ctx.font = `400 100px ${FONT}`;
  const t = ctx.measureText(str);
  ctx.restore();
  m = {
    width: t.width,
    ascent: t.actualBoundingBoxAscent || 72,
    descent: t.actualBoundingBoxDescent || 0,
    font: document.fonts?.check?.(`400 100px ${FONT}`),
  };
  metricCache.set(key, m);
  if (metricCache.size > 200) metricCache.delete(metricCache.keys().next().value);
  return m;
}

/*
 * Layout functions return { ow, draw(ctx, op) } in artboard units: `op` is "fill" or
 * "stroke" (the caller sets lineWidth/fill/stroke styles; ow = outline width).
 */

/** Jersey number: tall, slightly condensed, outline under the fill, auto-fit to box. */
function layoutNumber(ctx, box, str) {
  const m = glyphMetrics(ctx, str);
  const capH = m.ascent + m.descent;
  const outlineFrac = 0.062;              // outline width per font-size (tackle-twill weight)
  // fit height first (leaving room for the outline), then condense to fit width
  let fs = (box.h / (capH / 100)) / (1 + 2 * outlineFrac * 100 / capH);
  let sx = 0.86;                            // athletic numbers run a touch condensed
  const tracking = -0.02;
  const widthAt = (f, s) => (m.width / 100) * f * s + (str.length - 1) * tracking * f * s + 2 * outlineFrac * f;
  if (widthAt(fs, sx) > box.w) {
    sx = Math.max(0.72, sx * box.w / widthAt(fs, sx));
    if (widthAt(fs, sx) > box.w) fs *= box.w / widthAt(fs, sx);
  }
  const cx = box.x + box.w / 2;
  const baseline = box.y + box.h / 2 + ((m.ascent - m.descent) / 100) * fs / 2;
  const font = `400 ${fs.toFixed(2)}px ${FONT}`;
  return {
    ow: outlineFrac * fs,
    em: fs,
    box,
    draw(c, op) {
      c.save();
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.translate(cx, baseline);
      c.scale(sx, 1);
      c.lineWidth /= sx;                    // keep the outline even after condensing
      try { c.letterSpacing = `${(tracking * fs).toFixed(2)}px`; } catch {}
      if (op === "fill") c.fillText(str, 0, 0); else c.strokeText(str, 0, 0);
      c.restore();
    },
  };
}

/** Player name: tracked caps on a gentle arch, auto-fit to box. */
function layoutName(ctx, box, str) {
  const text = String(str).toUpperCase();
  const m = glyphMetrics(ctx, text);
  const capH = m.ascent + m.descent || 72;
  const tracking = 0.12;                    // em
  const outlineFrac = 0.075;
  const n = text.length;
  ctx.save();
  ctx.font = `400 100px ${FONT}`;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  ctx.restore();
  const total100 = widths.reduce((a, b) => a + b, 0) + (n - 1) * tracking * 100;
  const arch = 0.2;                         // max sagitta as a fraction of box height
  let fs = (box.h * (1 - arch)) / (capH / 100) / (1 + 2 * outlineFrac * 100 / capH);
  const maxW = box.w * 0.97;
  if ((total100 / 100) * fs > maxW) fs = (maxW / total100) * 100;
  const totalW = (total100 / 100) * fs;
  const sag = Math.min(box.h * arch, totalW * 0.055);
  const R = sag > 0.5 ? (totalW * totalW) / (8 * sag) + sag / 2 : 1e6;   // chord + sagitta → radius
  const capPx = (capH / 100) * fs;
  const cx = box.x + box.w / 2;
  const topY = box.y + (box.h - (capPx + sag)) / 2;    // top of the highest letter
  const centerY = topY + (m.ascent / 100) * fs + R;    // arc centre below the apex baseline
  const glyphs = [];
  let s = -totalW / 2;
  for (let i = 0; i < n; i++) {
    const w = (widths[i] / 100) * fs;
    glyphs.push({ ch: text[i], a: (s + w / 2) / R });
    s += w + tracking * fs;
  }
  const font = `400 ${fs.toFixed(2)}px ${FONT}`;
  return {
    ow: outlineFrac * fs,
    em: fs,
    box,
    draw(c, op) {
      c.save();
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      for (const g of glyphs) {
        c.save();
        c.translate(cx, centerY);
        c.rotate(g.a);
        c.translate(0, -R);
        if (op === "fill") c.fillText(g.ch, 0, 0); else c.strokeText(g.ch, 0, 0);
        c.restore();
      }
      c.restore();
    },
  };
}


/**
 * fillSmallHoles(ctx, W, H, maxArea(px, py) → px², color): background components of
 * the layer that are fully enclosed (not reachable from the border) and smaller than
 * maxArea are painted solid `color`. Used to close specks in lettering outlines.
 */
function fillSmallHoles(ctx, W, H, maxArea, color) {
  let img;
  try { img = ctx.getImageData(0, 0, W, H); } catch { return; }
  const d = img.data, n = W * H;
  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) bg[i] = d[i * 4 + 3] < 224 ? 1 : 0;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  // flood from the border: everything reachable is open background
  let sp = 0;
  const push = (i) => { if (bg[i] && !seen[i]) { seen[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const i = stack[--sp], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < n - W) push(i + W);
  }
  const [cr, cg, cb] = rgb(color);
  let changed = false;
  const comp = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (!bg[s0] || seen[s0]) continue;
    comp.length = 0;
    seen[s0] = 1; stack[0] = s0; sp = 1;
    while (sp) {
      const i = stack[--sp], x = i % W;
      comp.push(i);
      if (x > 0 && bg[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < W - 1 && bg[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (i >= W && bg[i - W] && !seen[i - W]) { seen[i - W] = 1; stack[sp++] = i - W; }
      if (i < n - W && bg[i + W] && !seen[i + W]) { seen[i + W] = 1; stack[sp++] = i + W; }
    }
    if (comp.length < maxArea(s0 % W, (s0 / W) | 0)) {
      for (const i of comp) { const o = i * 4; d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255; }
      changed = true;
    }
  }
  if (changed) ctx.putImageData(img, 0, 0);
}

const letterCache = new LRU(24);

/**
 * Lettering layer (device px, covering the text boxes). Outline = exact stroke ∪ a
 * morphological close of it, so counters narrower than the twill outline fill in
 * the way a cutter would round them off, instead of leaving pin-prick specks.
 */
function letteringLayer(cv, text, fill, outline, k) {
  const items = [];
  const nameStr = cv.text.name && text.name != null ? String(text.name).trim().slice(0, 18) : "";
  const numStr = cv.text.number && text.number != null ? String(text.number).trim().slice(0, 3) : "";
  if (!nameStr && !numStr) return null;
  const fontOK = !!document.fonts?.check?.(`400 100px "${LETTERING_FONT}"`);
  const key = [cv.key, nameStr, numStr, fill, outline, k.toFixed(4), fontOK ? 1 : 0].join("|");
  const hit = letterCache.get(key);
  if (hit) return hit;

  const boxes = [];
  if (nameStr) boxes.push(cv.text.name);
  if (numStr) boxes.push(cv.text.number);
  const pad = 14;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  const W = Math.ceil((x1 - x0) * k), H = Math.ceil((y1 - y0) * k);
  const layer = makeCanvas(W, H);
  const lx = outline ? readableCtx(layer) : layer.getContext("2d");
  const toUnits = (c) => c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  toUnits(lx);
  if (nameStr) items.push(layoutName(lx, cv.text.name, nameStr));
  if (numStr) items.push(layoutNumber(lx, cv.text.number, numStr));

  if (outline) {
    lx.lineJoin = "round";
    lx.strokeStyle = lx.fillStyle = outline;
    for (const it of items) { lx.lineWidth = 2 * it.ow; it.draw(lx, "stroke"); it.draw(lx, "fill"); }
    // counters narrower than the outline leave pin-prick specks; a cutter would fill them
    fillSmallHoles(lx, W, H, (px, py) => {
      const ux = x0 + px / k, uy = y0 + py / k;
      const it = items.find((t) => ux >= t.box.x - pad && ux <= t.box.x + t.box.w + pad && uy >= t.box.y - pad && uy <= t.box.y + t.box.h + pad) || items[0];
      return (0.034 * it.em * k) ** 2;
    }, outline);
  }
  lx.fillStyle = fill;
  for (const it of items) it.draw(lx, "fill");
  return letterCache.set(key, { canvas: layer, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

function drawText(ctx, cv, text, colors, k) {
  if (!text || !cv.text) return;
  const fill = hex(text.fill, colors.accent);
  const outline = text.outline ? hex(text.outline, colors.trim) : null;
  const L = letteringLayer(cv, text, fill, outline, k);
  if (!L) return;
  ctx.save();
  if (cv.silhouette) ctx.clip(cv.silhouette);
  ctx.drawImage(L.canvas, L.x, L.y, L.canvas.width / k, L.canvas.height / k);
  ctx.restore();
}

/** fontsReady() → resolves once the lettering font is loaded (never rejects). */
export function fontsReady() {
  try {
    if (!document.fonts?.load) return Promise.resolve();
    return document.fonts.load(`400 120px "${LETTERING_FONT}"`).then(() => { metricCache.clear(); clearLetteringMetrics(); }, () => {});
  } catch { return Promise.resolve(); }
}

/* ─────────────────────────── overlays ─────────────────────────── */

const LINE_DARK = "rgba(10,12,16,";
const LINE_LIGHT = "rgba(255,255,255,";

function drawSeam(ctx, o) {
  const w = o.width ?? 1.2;
  const a = o.opacity ?? 0.35;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // a hairline of light on one side reads as the ridge of the seam on dark fabrics
  ctx.save();
  ctx.translate(0.9, 1.1);
  ctx.strokeStyle = LINE_LIGHT + (a * 0.32).toFixed(3) + ")";
  ctx.lineWidth = w * 0.8;
  ctx.stroke(o.path);
  ctx.restore();
  ctx.strokeStyle = LINE_DARK + a.toFixed(3) + ")";
  ctx.lineWidth = w;
  ctx.stroke(o.path);
}

/** A run of consecutive stitch overlays, composited as one layer. */
function drawStitches(ctx, group, k, size) {
  const a = group[0].opacity ?? 0.5;
  // only touch the device-px box the stitches occupy
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const o of group) {
    const b = bboxOfPathCached(o), m = (o.gap ?? 4) + 3;
    bx0 = Math.min(bx0, b.x - m); by0 = Math.min(by0, b.y - m);
    bx1 = Math.max(bx1, b.x + b.w + m); by1 = Math.max(by1, b.y + b.h + m);
  }
  const rx = Math.max(0, Math.floor(bx0 * k)), ry = Math.max(0, Math.floor(by0 * k));
  const rw = Math.min(size, Math.ceil(bx1 * k)) - rx, rh = Math.min(size, Math.ceil(by1 * k)) - ry;
  if (rw <= 0 || rh <= 0) return;
  // Twin needle = a dashed band with its middle cut away, built on a scratch layer
  // so the cut never touches the garment underneath.
  const layer = scratch(size, rx, ry, rw, rh);
  const x = layer.getContext("2d");
  x.setTransform(k, 0, 0, k, 0, 0);
  x.lineJoin = "round"; x.lineCap = "butt";
  x.strokeStyle = "#000";
  for (const o of group) {
    const gap = o.gap ?? 4;                 // twin-needle spacing (units)
    const t = o.width ?? 0.9;               // thread width (units)
    x.globalCompositeOperation = "source-over";
    x.setLineDash([3.2, 2.2]);
    x.lineWidth = gap + t;
    x.stroke(o.path);
    x.setLineDash([]);
    x.globalCompositeOperation = "destination-out";
    x.lineWidth = Math.max(0.1, gap - t);
    x.stroke(o.path);
  }
  x.globalCompositeOperation = "source-over";
  const off = Math.max(0.6, 0.7 * k);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a * 0.45;               // light thread sheen, nudged down-right
  ctx.drawImage(tintedScratch(layer, "#FFFFFF", rx, ry, rw, rh), rx, ry, rw, rh, rx + off, ry + off, rw, rh);
  ctx.globalAlpha = a;
  ctx.drawImage(layer, rx, ry, rw, rh, rx, ry, rw, rh);
  ctx.restore();
}

// one reusable scratch canvas per size (the used box is cleared on each use)
const scratchBySize = new Map();
function scratch(size, rx, ry, rw, rh) {
  let c = scratchBySize.get(size);
  if (!c) {
    c = makeCanvas(size, size);
    scratchBySize.set(size, c);
    if (scratchBySize.size > 3) scratchBySize.delete(scratchBySize.keys().next().value);
  }
  const x = c.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = "source-over";
  x.clearRect(rx, ry, rw, rh);
  return c;
}
let scratch2 = null;
function tintedScratch(layer, color, rx, ry, rw, rh) {
  if (!scratch2 || scratch2.width !== layer.width) scratch2 = makeCanvas(layer.width, layer.height);
  const x = scratch2.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = "copy";
  x.drawImage(layer, rx, ry, rw, rh, rx, ry, rw, rh);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(rx, ry, rw, rh);
  x.globalCompositeOperation = "source-over";
  return scratch2;
}

function drawRib(ctx, o) {
  const a = o.opacity ?? 0.22;
  const pitch = 2.6;                         // rib wale pitch (units)
  ctx.save();
  ctx.clip(o.path);
  ctx.lineCap = "butt";
  if (o.followPath) {
    // wales perpendicular to the band: dash a wide stroke along its centre line
    const wide = 40;                         // covers bands up to ~36 units wide
    ctx.setLineDash([pitch * 0.42, pitch * 0.58]);
    ctx.strokeStyle = LINE_DARK + a.toFixed(3) + ")";
    ctx.lineWidth = wide;
    ctx.stroke(o.followPath);
    ctx.lineDashOffset = -pitch * 0.5;
    ctx.setLineDash([pitch * 0.22, pitch * 0.78]);
    ctx.strokeStyle = LINE_LIGHT + (a * 0.55).toFixed(3) + ")";
    ctx.stroke(o.followPath);
  } else {
    const ang = ((o.angle ?? 90) * Math.PI) / 180;
    const b = bboxOfPathCached(o);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const r = Math.hypot(b.w, b.h) / 2 + 2;
    ctx.translate(cx, cy);
    ctx.rotate(ang - Math.PI / 2);
    for (let xx = -r; xx <= r; xx += pitch) {
      ctx.fillStyle = LINE_DARK + a.toFixed(3) + ")";
      ctx.fillRect(xx, -r, pitch * 0.42, 2 * r);
      ctx.fillStyle = LINE_LIGHT + (a * 0.55).toFixed(3) + ")";
      ctx.fillRect(xx + pitch * 0.55, -r, pitch * 0.2, 2 * r);
    }
  }
  ctx.restore();
}
const ribBounds = new WeakMap();
function bboxOfPathCached(o) {
  let b = ribBounds.get(o);
  if (!b) { b = bboxOfPath(o.d); ribBounds.set(o, b); }
  return b;
}

function drawOverlays(ctx, cv, size, k, mark) {
  const list = cv.overlays;
  let i = 0, run = 0;
  while (i < list.length) {
    const o = list[i];
    if (o.kind === "shadow" || o.kind === "highlight" || o.kind === "edge") {
      const group = [];
      while (i < list.length && ["shadow", "highlight", "edge"].includes(list[i].kind)) group.push(list[i++]);
      mark?.("overlays");
      const layer = softLayer(cv, group, run++);
      mark?.("soft");
      ctx.save();
      if (cv.silhouette) ctx.clip(cv.silhouette);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";      // bilinear is plenty for already-blurred content
      ctx.drawImage(layer, 0, 0, ARTBOARD, ARTBOARD);
      ctx.restore();
      mark?.("softDraw");
      continue;
    }
    if (o.kind === "stitch") {
      const group = [];
      while (i < list.length && list[i].kind === "stitch" && (list[i].opacity ?? 0.5) === (o.opacity ?? 0.5)) group.push(list[i++]);
      ctx.save();
      if (cv.silhouette) ctx.clip(cv.silhouette);
      mark?.("overlays");
      drawStitches(ctx, group, k, size);
      ctx.restore();
      mark?.("stitch");
      continue;
    }
    ctx.save();
    if (cv.silhouette) ctx.clip(cv.silhouette);
    if (o.kind === "seam") drawSeam(ctx, o);
    else if (o.kind === "rib") drawRib(ctx, o);
    ctx.restore();
    i++;
  }
}

/* ─────────────────────────── volume shading ─────────────────────────── */

function drawVolume(ctx, cv) {
  const b = cv.bounds;
  ctx.save();
  ctx.clip(cv.silhouette);
  // sides roll away from the light
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, "rgba(8,10,14,0.13)");
  g.addColorStop(0.16, "rgba(8,10,14,0.03)");
  g.addColorStop(0.42, "rgba(255,255,255,0.025)");
  g.addColorStop(0.6, "rgba(8,10,14,0)");
  g.addColorStop(0.84, "rgba(8,10,14,0.03)");
  g.addColorStop(1, "rgba(8,10,14,0.15)");
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  // light from above, slight falloff toward the hem
  const v = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  v.addColorStop(0, "rgba(255,255,255,0.035)");
  v.addColorStop(0.45, "rgba(255,255,255,0)");
  v.addColorStop(1, "rgba(8,10,14,0.07)");
  ctx.fillStyle = v;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}

/* ─────────────────────────── main entry ─────────────────────────── */

/**
 * renderMockup(garment, viewId, { size, colors, graphics, text, backdrop, shadow, detail })
 * → HTMLCanvasElement (size × size). Never throws for bad placements; throws only if
 * the garment/view is missing.
 */
export function renderMockup(garment, viewId, {
  size = 800,
  colors,
  graphics = [],
  text = null,
  backdrop = null,
  shadow = true,
  detail = "full",
  timings = null,                      // optional {} → per-phase ms (dev/perf tooling)
} = {}) {
  if (isPhotoGarment(garment)) {
    // painted-light engine: draws into a DOM canvas so every consumer (CanvasImage,
    // toBlob exports, drawImage) gets the same element type as before
    const target = makeCanvas(Math.max(16, Math.round(size)));
    return renderPhoto(garment, viewId, { size, colors, graphics, text, backdrop, shadow, detail, timings, target });
  }
  if (backdrop === "studio") backdrop = "#ECEDEF";
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let tPrev = now();
  const mark = (name) => { if (timings) { const t = now(); timings[name] = (timings[name] || 0) + (t - tPrev); tPrev = t; } };
  const cv = compileView(garment, viewId);
  if (!cv || !cv.silhouette) throw new Error(`renderMockup: ${garment?.id || "garment"} has no "${viewId}" view`);
  size = Math.max(16, Math.round(size));
  const k = size / ARTBOARD;
  const col = {
    base: hex(colors?.base, "#13294B"),
    trim: hex(colors?.trim, "#F2A900"),
    accent: hex(colors?.accent, "#FFFFFF"),
  };
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");

  if (backdrop) {
    ctx.fillStyle = hex(backdrop, "#FFFFFF");
    ctx.fillRect(0, 0, size, size);
  }
  mark("setup");
  if (shadow) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.drawImage(dropShadowLayer(cv), 0, 0, size, size);
  }
  mark("shadow");

  ctx.setTransform(k, 0, 0, k, 0, 0);

  // parts — base fill under everything so part seams never show hairline gaps;
  // parts are clipped to the silhouette so bands may overshoot the outline
  ctx.fillStyle = col.base;
  ctx.fill(cv.silhouette);
  const over = [];
  ctx.save();
  ctx.clip(cv.silhouette);
  for (const p of cv.parts) {
    if (p.over) { over.push(p); continue; }
    ctx.fillStyle = fillFor(p.fill, col);
    ctx.fill(p.path, p.rule === "evenodd" ? "evenodd" : "nonzero");
  }
  ctx.restore();
  mark("parts");

  drawGraphics(ctx, cv, graphics, col, k);
  mark("graphics");
  drawText(ctx, cv, text, col, k);
  mark("text");

  if (over.length) {
    ctx.save();
    ctx.clip(cv.silhouette);
    for (const p of over) {
      ctx.fillStyle = fillFor(p.fill, col);
      ctx.fill(p.path, p.rule === "evenodd" ? "evenodd" : "nonzero");
    }
    ctx.restore();
  }

  // texture, volume, overlays and outline don't depend on colours or graphics:
  // one cached "finish" layer per garment view, size and detail level
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(finishLayer(garment, cv, size, detail, timings ? mark : null), 0, 0);
  // dark seams vanish on near-black cloth: there the light catching each seam ridge is
  // what you see, so lift seams + stitching with a light pass (fades out by mid-navy)
  const dark = DARK_SEAM_L - lum(col.base);
  if (dark > 0) {
    ctx.globalAlpha = Math.min(1, dark / 0.03) * 0.5;
    ctx.drawImage(lightLineLayer(cv, size), 0, 0);
    ctx.globalAlpha = 1;
  }
  mark("finish");
  return canvas;
}

const DARK_SEAM_L = 0.04;    // base luminance below which seams get the light pass

/** Seams + stitching only, in white (cached per view and size, like the finish layer). */
function lightLineLayer(cv, size) {
  const key = `${cv.key}|${size}|light-lines`;
  const hit = finishCache.get(key);
  if (hit) return hit;
  const k = size / ARTBOARD;
  const layer = makeCanvas(size);
  const ctx = layer.getContext("2d");
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.save();
  ctx.clip(cv.silhouette);
  const list = cv.overlays;
  for (let i = 0; i < list.length;) {
    const o = list[i];
    if (o.kind === "stitch") {
      const group = [];
      while (i < list.length && list[i].kind === "stitch" && (list[i].opacity ?? 0.5) === (o.opacity ?? 0.5)) group.push(list[i++]);
      drawStitches(ctx, group, k, size);
      continue;
    }
    if (o.kind === "seam") {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = LINE_DARK + Math.min(1, (o.opacity ?? 0.35) * 1.3).toFixed(3) + ")";
      ctx.lineWidth = (o.width ?? 1.2) * 0.9;
      ctx.stroke(o.path);
    }
    i++;
  }
  ctx.restore();
  // everything drawn above becomes white, keeping its alpha
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);
  return finishCache.set(key, layer, size * size);
}

const finishCache = new PixelLRU(28e6);   // ≈ 110 MB of RGBA at most

function finishLayer(garment, cv, size, detail, mark) {
  const key = `${cv.key}|${size}|${detail}`;
  const hit = finishCache.get(key);
  if (hit) return hit;
  const k = size / ARTBOARD;
  const layer = makeCanvas(size);
  const ctx = layer.getContext("2d");
  ctx.setTransform(k, 0, 0, k, 0, 0);

  // fabric texture over everything printed (it is printed ON the cloth)
  if (detail !== "fast") {
    const { pattern, strength } = fabricPattern(ctx, garment.fabric, k);
    if (pattern) {
      ctx.save();
      ctx.clip(cv.silhouette);
      if (cv.noTexture) ctx.clip(cv.noTexture, "evenodd");   // labels/tapes stay crisp
      ctx.globalAlpha = strength;
      ctx.fillStyle = pattern;
      const b = cv.bounds;
      ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.restore();
    }
  }
  mark?.("texture");
  drawVolume(ctx, cv);
  drawOverlays(ctx, cv, size, k, mark);

  // outline
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(14,17,22,0.92)";
  ctx.lineWidth = 2.2;
  ctx.stroke(cv.silhouette);
  ctx.restore();
  mark?.("outline");
  return finishCache.set(key, layer, size * size);
}

/** Bounding box (artboard units) of a view's silhouette — handy for cropping thumbnails. */
export function viewBounds(garment, viewId) {
  if (isPhotoGarment(garment)) return photoViewBounds(garment, viewId);
  const cv = compileView(garment, viewId);
  return cv ? { ...cv.bounds } : null;
}
