// photo engine · player lettering ("Graduate"), drawn flat into the print layer so the
// composite lights and displaces it like any print (twill numbers sit IN the folds).
//
// Same layout rules as the vector renderer: numbers tall, slightly condensed, outline
// under the fill, auto-fit to the box; names in tracked caps on a gentle arch.
import { createCanvas, ctx2d, LRU, rgbOf } from "./canvas.js";

export const LETTERING_FONT = "Graduate";
const FONT = `"${LETTERING_FONT}", "Rockwell", "Courier New", serif`;
const fontSet = () => globalThis.document?.fonts || globalThis.fonts || null;
const fontLoaded = () => { try { return !!fontSet()?.check?.(`400 100px "${LETTERING_FONT}"`); } catch { return false; } };

const metricCache = new Map();
function glyphMetrics(ctx, str) {
  const ok = fontLoaded();
  let m = metricCache.get(str);
  if (m && m.font === ok) return m;
  ctx.save();
  ctx.font = `400 100px ${FONT}`;
  const t = ctx.measureText(str);
  ctx.restore();
  m = { width: t.width, ascent: t.actualBoundingBoxAscent || 72, descent: t.actualBoundingBoxDescent || 0, font: ok };
  metricCache.set(str, m);
  if (metricCache.size > 200) metricCache.delete(metricCache.keys().next().value);
  return m;
}
export function clearLetteringMetrics() { metricCache.clear(); }

function layoutNumber(ctx, box, str) {
  const m = glyphMetrics(ctx, str);
  const capH = m.ascent + m.descent;
  const outlineFrac = 0.062;
  let fs = (box.h / (capH / 100)) / (1 + (2 * outlineFrac * 100) / capH);
  let sx = 0.86;
  const tracking = -0.02;
  const widthAt = (f, s) => (m.width / 100) * f * s + (str.length - 1) * tracking * f * s + 2 * outlineFrac * f;
  if (widthAt(fs, sx) > box.w) {
    sx = Math.max(0.72, (sx * box.w) / widthAt(fs, sx));
    if (widthAt(fs, sx) > box.w) fs *= box.w / widthAt(fs, sx);
  }
  const cx = box.x + box.w / 2;
  const baseline = box.y + box.h / 2 + (((m.ascent - m.descent) / 100) * fs) / 2;
  const font = `400 ${fs.toFixed(2)}px ${FONT}`;
  return {
    ow: outlineFrac * fs, em: fs, box,
    draw(c, op) {
      c.save();
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.translate(cx, baseline);
      c.scale(sx, 1);
      c.lineWidth /= sx;
      try { c.letterSpacing = `${(tracking * fs).toFixed(2)}px`; } catch { /* older engines */ }
      if (op === "fill") c.fillText(str, 0, 0); else c.strokeText(str, 0, 0);
      c.restore();
    },
  };
}

function layoutName(ctx, box, str) {
  const text = String(str).toUpperCase();
  const m = glyphMetrics(ctx, text);
  const capH = m.ascent + m.descent || 72;
  const tracking = 0.12, outlineFrac = 0.075, n = text.length;
  ctx.save();
  ctx.font = `400 100px ${FONT}`;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  ctx.restore();
  const total100 = widths.reduce((a, b) => a + b, 0) + (n - 1) * tracking * 100;
  const arch = 0.2;
  let fs = (box.h * (1 - arch)) / (capH / 100) / (1 + (2 * outlineFrac * 100) / capH);
  const maxW = box.w * 0.97;
  if ((total100 / 100) * fs > maxW) fs = (maxW / total100) * 100;
  const totalW = (total100 / 100) * fs;
  const sag = Math.min(box.h * arch, totalW * 0.055);
  const R = sag > 0.5 ? (totalW * totalW) / (8 * sag) + sag / 2 : 1e6;
  const capPx = (capH / 100) * fs;
  const cx = box.x + box.w / 2;
  const topY = box.y + (box.h - (capPx + sag)) / 2;
  const centerY = topY + (m.ascent / 100) * fs + R;
  const glyphs = [];
  let s = -totalW / 2;
  for (let i = 0; i < n; i++) {
    const w = (widths[i] / 100) * fs;
    glyphs.push({ ch: text[i], a: (s + w / 2) / R });
    s += w + tracking * fs;
  }
  const font = `400 ${fs.toFixed(2)}px ${FONT}`;
  return {
    ow: outlineFrac * fs, em: fs, box,
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

/** Enclosed background specks smaller than maxArea(px, py) get filled with `color`. */
function fillSmallHoles(ctx, W, H, maxArea, color) {
  let img;
  try { img = ctx.getImageData(0, 0, W, H); } catch { return; }
  const d = img.data, n = W * H;
  const bg = new Uint8Array(n);
  for (let i = 0; i < n; i++) bg[i] = d[i * 4 + 3] < 224 ? 1 : 0;
  const seen = new Uint8Array(n), stack = new Int32Array(n);
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
  const [cr, cg, cb] = rgbOf(color);
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
 * letteringLayer(cv, text, fill, outline, k) → { canvas, x, y } (canvas in px at scale k,
 * x/y its artboard origin) or null. Outline = stroke under the fill; counters narrower
 * than the twill outline are filled the way a cutter would round them off.
 */
export function letteringLayer(cv, text, fill, outline, k) {
  if (!cv.text || !text) return null;
  const nameStr = cv.text.name && text.name != null ? String(text.name).trim().slice(0, 18) : "";
  const numStr = cv.text.number && text.number != null ? String(text.number).trim().slice(0, 3) : "";
  if (!nameStr && !numStr) return null;
  const key = [cv.key, nameStr, numStr, fill, outline, k.toFixed(4), fontLoaded() ? 1 : 0].join("|");
  const hit = letterCache.get(key);
  if (hit) return hit;
  const boxes = [];
  if (nameStr) boxes.push(cv.text.name);
  if (numStr) boxes.push(cv.text.number);
  const pad = 14;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  const W = Math.ceil((x1 - x0) * k), H = Math.ceil((y1 - y0) * k);
  const layer = createCanvas(W, H);
  const lx = ctx2d(layer, !!outline);
  lx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  const items = [];
  if (nameStr) items.push(layoutName(lx, cv.text.name, nameStr));
  if (numStr) items.push(layoutNumber(lx, cv.text.number, numStr));
  if (outline) {
    lx.lineJoin = "round";
    lx.strokeStyle = lx.fillStyle = outline;
    for (const it of items) { lx.lineWidth = 2 * it.ow; it.draw(lx, "stroke"); it.draw(lx, "fill"); }
    fillSmallHoles(lx, W, H, (px, py) => {
      const ux = x0 + px / k, uy = y0 + py / k;
      const it = items.find((t) => ux >= t.box.x - pad && ux <= t.box.x + t.box.w + pad && uy >= t.box.y - pad && uy <= t.box.y + t.box.h + pad) || items[0];
      return (0.034 * it.em * k) ** 2;
    }, outline);
  }
  lx.fillStyle = fill;
  for (const it of items) it.draw(lx, "fill");
  return letterCache.set(key, { canvas: layer, x: x0, y: y0 });
}
