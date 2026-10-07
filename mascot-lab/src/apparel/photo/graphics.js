// photo engine · graphic placements (CONTRACTS.md "Placement"), drawn flat into the print
// layer; the composite then displaces and lights them like the cloth.
//
// Caches key on canvas IDENTITY (tinted / pre-scaled graphics, brick tiles): never redraw
// into a canvas you already passed — pass a new canvas when the content changes.
import { createCanvas, ctx2d, LRU, hex, isHex, rgbOf, relLum, tonalOf } from "./canvas.js";

export const SAFE = 0.72;

export function resolveTint(tint, colors) {
  if (!tint) return null;
  if (tint === "tonal") return tonalOf(colors.base);
  if (tint === "base" || tint === "trim" || tint === "accent") return colors[tint];
  return isHex(tint) ? hex(tint) : null;
}

const tintCache = new WeakMap();
/**
 * tinted(canvas, tint, lighterInk, knockout) → the graphic as ONE ink. With knockout
 * (default) it is a one-colour screen separation: ink density follows the artwork's own
 * (normalised) luminance, so linework survives; flat marks become a silhouette.
 */
function tinted(canvas, tint, lighterInk = true, knockout = true) {
  let m = tintCache.get(canvas);
  if (!m) { m = new Map(); tintCache.set(canvas, m); }
  const key = `${tint}|${knockout ? (lighterInk ? "L" : "D") : "S"}`;
  let t = m.get(key);
  if (t) return t;
  t = createCanvas(canvas.width, canvas.height);
  const x = ctx2d(t, knockout);
  x.drawImage(canvas, 0, 0);
  let done = false;
  if (knockout) {
    try {
      const img = x.getImageData(0, 0, t.width, t.height);
      const d = img.data, n = t.width * t.height;
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
        const [r, g, b] = rgbOf(tint);
        const span = hi - lo;
        for (let i = 0; i < n; i++) {
          const o = i * 4, a = d[o + 3];
          if (!a) continue;
          const Y = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;
          let v = (Y - lo) / span;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          if (!lighterInk) v = 1 - v;
          let dens = (v - 0.2) / 0.42;                 // smoothstep(0.2, 0.62)
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

const scaledCache = new WeakMap();
/** Downscale a big graphic in halving steps (crisper than one big bilinear jump). */
function scaledTo(canvas, px) {
  const target = Math.max(8, Math.round(px));
  if (target >= canvas.width * 0.7) return canvas;
  let m = scaledCache.get(canvas);
  if (!m) { m = new Map(); scaledCache.set(canvas, m); }
  const bucket = Math.ceil(target / 32) * 32;
  let s = m.get(bucket);
  if (s) return s;
  let cur = canvas;
  while (cur.width / 2 > bucket) {
    const half = createCanvas(cur.width / 2, cur.height / 2);
    const hx = ctx2d(half);
    hx.imageSmoothingQuality = "high";
    hx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  s = createCanvas(bucket, Math.round((bucket * canvas.height) / canvas.width));
  const sx = ctx2d(s);
  sx.imageSmoothingQuality = "high";
  sx.drawImage(cur, 0, 0, s.width, s.height);
  if (m.size > 6) m.delete(m.keys().next().value);
  m.set(bucket, s);
  return s;
}

/** Fit the graphic's SAFE box (contain) into `box` × scale → drawn size in units. */
function fitSize(canvas, box, scale) {
  const fit = Math.min(box.w / (canvas.width * SAFE), box.h / (canvas.height * SAFE)) * scale;
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

const tileCache = new LRU(24);
const ids = new WeakMap();
let idSeq = 0;
const idOf = (c) => { let i = ids.get(c); if (!i) { i = ++idSeq; ids.set(c, i); } return i; };
/** Brick-repeat tile: one cell wide, two rows tall, the motif wrapped across the edges. */
function brickTile(src, tile, scale, k, tintKey) {
  const key = `${idOf(src)}|${tintKey}|${tile}|${scale}|${k.toFixed(3)}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const W = Math.max(4, Math.round(tile * k)), H = W * 2;
  const c = createCanvas(W, H);
  const x = ctx2d(c);
  const { w, h } = fitSize(src, { w: W, h: W }, scale);
  const img = scaledTo(src, w);
  x.imageSmoothingQuality = "high";
  for (const [cx, cy] of [[W / 2, W / 2], [0, W * 1.5]]) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const px = cx + i * W, py = cy + j * H;
      if (px + w / 2 < 0 || px - w / 2 > W || py + h / 2 < 0 || py - h / 2 > H) continue;
      x.drawImage(img, px - w / 2, py - h / 2, w, h);
    }
  }
  return tileCache.set(key, { canvas: c, unitsPerPx: tile / W });
}
function drawTiled(ctx, pl, src, cv, k, tintKey) {
  const tile = Number.isFinite(pl.tile) && pl.tile > 20 ? pl.tile : 220;
  const scale = Number.isFinite(pl.scale) && pl.scale > 0 ? pl.scale : 1;
  const t = brickTile(src, tile, scale, k, tintKey);
  const pattern = ctx.createPattern(t.canvas, "repeat");
  if (!pattern) return;
  const b = cv.bounds;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  pattern.setTransform(new DOMMatrix()
    .translate(cx + (pl.dx || 0) * tile, cy + (pl.dy || 0) * tile)
    .rotate(pl.rotate || 0)
    .translate(-tile / 2, -tile / 2)
    .scale(t.unitsPerPx));
  ctx.fillStyle = pattern;
  ctx.fillRect(b.x0 - 50, b.y0 - 50, b.x1 - b.x0 + 100, b.y1 - b.y0 + 100);
}

/**
 * drawPlacements(ctx, cv, graphics, colors, k) — every placement into the print layer
 * (ctx transform = artboard units → px), each clipped to its zone's parts (default: the
 * view's printable parts). Unknown zone → center → back-center → the first zone.
 */
export function drawPlacements(ctx, cv, graphics, colors, k) {
  const zoneIds = Object.keys(cv.zones);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const pl of graphics) {
    const canvas = pl?.canvas;
    if (!canvas || !canvas.width || !canvas.height) continue;
    const tint = resolveTint(pl.tint, colors);
    const lighter = tint ? relLum(tint) >= relLum(colors.base) : true;
    const src = tint ? tinted(canvas, tint, lighter, pl.knockout !== false) : canvas;
    const zone = cv.zones[pl.zone] || cv.zones.center || cv.zones["back-center"] || cv.zones[zoneIds[0]];
    ctx.save();
    ctx.clip(pl.mode !== "tile" && zone?.ids?.length ? cv.union(zone.ids) : cv.printUnion);
    ctx.globalAlpha = Number.isFinite(pl.opacity) ? Math.max(0, Math.min(1, pl.opacity)) : 1;
    ctx.globalCompositeOperation = pl.blend === "multiply" || pl.blend === "screen" ? pl.blend : "source-over";
    if (pl.mode === "tile") drawTiled(ctx, pl, src, cv, k, tint ? `${tint}|${lighter}|${pl.knockout !== false}` : "-");
    else if (zone) drawSingle(ctx, pl, src, zone, k);
    ctx.restore();
  }
}
