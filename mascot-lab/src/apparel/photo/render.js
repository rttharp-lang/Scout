// photo engine · the per-render COMPOSITE (the only work a recolour or a new graphic pays).
//
//   1  albedo  ← parts filled with the team colours (vector, anti-aliased, exact size)
//   2  print   ← albedo + placements + lettering, drawn flat (then sampled displaced)
//   3  one pass per pixel, in linear light:
//        albedo  ← lerp(cloth, displaced print sample, coverage · ink grain)
//        linear  ← (floor + albedo·(1 − floor)) · (shade + light) + sheen · light
//        out     ← filmic shoulder → sRGB
//   4  backdrop → drop shadow → garment → metal hardware
// The light maps come from the bake (bake.js), cached per garment view × size bucket.
import { createCanvas, ctx2d, hex, LRU, now } from "./canvas.js";
import { compileView, ARTBOARD } from "./compile.js";
import { getBake, sizeBucket } from "./bake.js";
import { getStack } from "./stack.js";
import { fleeceTiles } from "./detail.js";
import { drawPlacements } from "./graphics.js";
import { letteringLayer } from "./lettering.js";
import { DEFAULT_LIGHT_MODEL, TO_LIN, TO_SRGB, LUT_N, LUT_MAX, LUT_K, lightLUTs } from "./light.js";

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

/* scratch canvases per box size (albedo, print, out) — reused across renders */
const scratch = new LRU(4);
function scratchFor(w, h) {
  const key = `${w}x${h}`;
  let s = scratch.get(key);
  if (!s) {
    const albedo = createCanvas(w, h), print = createCanvas(w, h), out = createCanvas(w, h);
    s = { albedo, print, out, actx: ctx2d(albedo, true), pctx: ctx2d(print, true), octx: ctx2d(out) };
    scratch.set(key, s);
  }
  return s;
}

/**
 * renderPhoto(garment, viewId, opts) → canvas (size × size).
 * opts: { size = 800, colors: { base, trim, accent }, graphics = Placement[], text = null,
 *         backdrop = null | "studio" | "#hex", shadow = true, detail = "full" | "fast",
 *         target = canvas to draw into (else a new OffscreenCanvas), timings = {} }
 * Throws only when the garment has no such view.
 */
export function renderPhoto(garment, viewId, opts = {}) {
  const timings = opts.timings || null;
  const t0 = now();
  const cv = compileView(garment, viewId);
  if (!cv) throw new Error(`renderMockup: ${garment?.id || "garment"} has no "${viewId}" view`);
  const size = Math.max(16, Math.round(opts.size || 800));
  const B = sizeBucket(size);
  const bake = getBake(cv, B, timings);
  const t1 = now();
  const { k, box } = bake;
  const colors = {
    base: hex(opts.colors?.base, "#13294B"),
    trim: hex(opts.colors?.trim, "#F2A900"),
    accent: hex(opts.colors?.accent, "#FFFFFF"),
  };
  const S = scratchFor(box.w, box.h);
  const toBox = (x) => x.setTransform(k, 0, 0, k, -box.x0, -box.y0);

  // 1 · albedo (parts under the print)
  const A = S.actx;
  A.setTransform(1, 0, 0, 1, 0, 0);
  A.clearRect(0, 0, box.w, box.h);
  toBox(A);
  for (const p of cv.parts) {
    if (p.over) continue;
    A.fillStyle = fillFor(p.role, colors);
    A.fill(p.path);
  }

  // 2 · print layer: albedo copy + placements + lettering (flat; displaced in the pass)
  const graphics = (opts.graphics || []).filter((g) => g?.canvas?.width && g.canvas.height);
  const text = opts.text && cv.text ? opts.text : null;
  let printData = null;
  const pb = bake.printBox;
  if ((graphics.length || text) && pb) {
    const P = S.pctx;
    P.setTransform(1, 0, 0, 1, 0, 0);
    P.globalCompositeOperation = "copy";
    P.drawImage(S.albedo, 0, 0);
    P.globalCompositeOperation = "source-over";
    toBox(P);
    if (graphics.length) drawPlacements(P, cv, graphics, colors, k);
    if (text) {
      const L = letteringLayer(cv, text, hex(text.fill, colors.accent), text.outline ? hex(text.outline, colors.trim) : null, k);
      if (L) {
        P.save();
        P.clip(cv.printUnion);
        P.drawImage(L.canvas, L.x, L.y, L.canvas.width / k, L.canvas.height / k);
        P.restore();
      }
    }
    P.setTransform(1, 0, 0, 1, 0, 0);
    // sample window: the print box plus room for the largest displacement
    const m = 24;
    const px0 = Math.max(0, pb.x0 - m), py0 = Math.max(0, pb.y0 - m);
    const px1 = Math.min(box.w, pb.x1 + 1 + m), py1 = Math.min(box.h, pb.y1 + 1 + m);
    printData = { data: P.getImageData(px0, py0, px1 - px0, py1 - py0).data, x0: px0, y0: py0, w: px1 - px0, h: py1 - py0 };
  }

  // parts that sit on top of prints (drawcords, labels…)
  for (const p of cv.parts) {
    if (!p.over) continue;
    A.fillStyle = fillFor(p.role, colors);
    A.fill(p.path);
  }
  const t2 = now();

  // 3 · the light pass
  const img = A.getImageData(0, 0, box.w, box.h);
  composite(img.data, bake, printData, cv.model, opts.detail === "fast");
  S.octx.putImageData(img, 0, 0);
  const t3 = now();

  // 4 · output
  let out = opts.target || createCanvas(size, size);
  if (out.width !== size || out.height !== size) { out.width = size; out.height = size; }
  const direct = size === B;
  const stage = direct ? out : stageCanvas(B);
  const ox = ctx2d(stage);
  ox.setTransform(1, 0, 0, 1, 0, 0);
  ox.globalCompositeOperation = "source-over";
  ox.clearRect(0, 0, B, B);
  if (opts.backdrop) ox.drawImage(backdropCanvas(B, opts.backdrop), 0, 0);
  if (opts.shadow !== false) {
    ox.globalCompositeOperation = opts.backdrop ? "multiply" : "source-over";
    ox.imageSmoothingEnabled = true;
    ox.drawImage(getStack(cv).drop, 0, 0, B, B);
    ox.globalCompositeOperation = "source-over";
  }
  ox.drawImage(S.out, box.x0, box.y0);
  if (bake.metal) ox.drawImage(bake.metal.canvas, bake.metal.x, bake.metal.y);
  if (!direct) {
    const fx = ctx2d(out);
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, size, size);
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = "high";
    fx.drawImage(stage, 0, 0, size, size);
  }
  const t4 = now();
  if (timings) Object.assign(timings, { bucket: B, prepare: t1 - t0, fill: t2 - t1, composite: t3 - t2, output: t4 - t3, total: t4 - t0 });
  return out;
}

const stages = new LRU(2);
function stageCanvas(B) {
  let c = stages.get(B);
  if (!c) { c = createCanvas(B); stages.set(B, c); }
  return c;
}

/** The per-pixel light pass (in place on the albedo ImageData). */
function composite(d, bake, pd, model, fast) {
  const M = { ...DEFAULT_LIGHT_MODEL, ...(model || {}) };
  const { shadeLUT, lightLUT } = lightLUTs(M);
  const KS = M.sheen, KSP = M.printSheen, FLOOR = M.floor, KF = 1 - FLOOR;
  const INK = fast ? 0 : M.inkGrain * Math.min(1, Math.max(0, (bake.B - 380) / 640));
  const { shade, light, print, dispX, dispY, box } = bake;
  const f = fleeceTiles(), grain = f.grain, GN = f.N;
  const W = box.w, H = box.h;
  const lin = TO_LIN, srgb = TO_SRGB;
  const P = pd ? pd.data : null;
  const PW = pd ? pd.w : 0, PH = pd ? pd.h : 0, PX = pd ? pd.x0 : 0, PY = pd ? pd.y0 : 0;
  for (let y = 0; y < H; y++) {
    let i = y * W;
    for (let x = 0; x < W; x++, i++) {
      const o = i * 4;
      if (!d[o + 3]) continue;
      let r = lin[d[o]], g = lin[d[o + 1]], b = lin[d[o + 2]];
      let sheen = KS;
      const pm = print[i];
      if (pm && P) {
        // displaced bilinear sample of the print layer (alpha-weighted)
        let sx = x + dispX[i] * 0.0625 - PX, sy = y + dispY[i] * 0.0625 - PY;
        if (sx < 0) sx = 0; else if (sx > PW - 1.001) sx = PW - 1.001;
        if (sy < 0) sy = 0; else if (sy > PH - 1.001) sy = PH - 1.001;
        const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
        const q = (iy * PW + ix) * 4, q1 = q + 4, q2 = q + PW * 4, q3 = q2 + 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const a0 = P[q + 3] * w00, a1 = P[q1 + 3] * w10, a2 = P[q2 + 3] * w01, a3 = P[q3 + 3] * w11;
        const pa = a0 + a1 + a2 + a3;
        if (pa > 0) {
          const inv = 1 / pa;
          const pr = (lin[P[q]] * a0 + lin[P[q1]] * a1 + lin[P[q2]] * a2 + lin[P[q3]] * a3) * inv;
          const pg = (lin[P[q + 1]] * a0 + lin[P[q1 + 1]] * a1 + lin[P[q2 + 1]] * a2 + lin[P[q3 + 1]] * a3) * inv;
          const pbv = (lin[P[q + 2]] * a0 + lin[P[q1 + 2]] * a1 + lin[P[q2 + 2]] * a2 + lin[P[q3 + 2]] * a3) * inv;
          const diff = Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pbv - b);
          if (diff > 0.004) {
            // ink lays into the fleece: the grain modulates its density a little (zero mean)
            const gv = INK ? grain[((box.y0 + y) % GN) * GN + ((box.x0 + x) % GN)] * 0.00784 - 1 : 0;
            let t = (pm / 255) * (pa / 255) * (1 + INK * gv);
            t = t > 1 ? 1 : t;
            r += (pr - r) * t; g += (pg - g) * t; b += (pbv - b) * t;
            if (diff > 0.02) sheen = KS + (KSP - KS) * t;
          }
        }
      }
      const l = lightLUT[light[i]];
      const irr = shadeLUT[shade[i]] + l;
      const sh = sheen * l;
      r = (FLOOR + r * KF) * irr + sh;
      g = (FLOOR + g * KF) * irr + sh;
      b = (FLOOR + b * KF) * irr + sh;
      d[o] = srgb[r >= LUT_MAX ? LUT_N : (r * LUT_K) | 0];
      d[o + 1] = srgb[g >= LUT_MAX ? LUT_N : (g * LUT_K) | 0];
      d[o + 2] = srgb[b >= LUT_MAX ? LUT_N : (b * LUT_K) | 0];
    }
  }
}

/* ───────────────────────────── backdrop ───────────────────────────── */

const backdrops = new LRU(6);
/** "studio" = a seamless paper sweep lit from the upper left; "#hex" = flat. */
export function backdropCanvas(size, backdrop) {
  const key = `${size}|${backdrop}`;
  const hit = backdrops.get(key);
  if (hit) return hit;
  const c = createCanvas(size);
  const x = ctx2d(c);
  if (backdrop === "studio") {
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, "#E6E8EB");
    g.addColorStop(0.6, "#EEEFF1");
    g.addColorStop(1, "#E4E5E8");
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const r = x.createRadialGradient(size * 0.44, size * 0.4, size * 0.05, size * 0.5, size * 0.5, size * 0.8);
    r.addColorStop(0, "rgba(255,255,255,0.6)");
    r.addColorStop(0.55, "rgba(255,255,255,0.1)");
    r.addColorStop(1, "rgba(120,126,136,0.2)");
    x.fillStyle = r;
    x.fillRect(0, 0, size, size);
    // a whisper of paper grain so the sweep never bands
    const pat = x.createPattern(fleeceTiles().dark, "repeat");
    x.globalAlpha = 0.02;
    x.fillStyle = pat;
    x.fillRect(0, 0, size, size);
    x.globalAlpha = 1;
  } else {
    x.fillStyle = hex(backdrop, "#EEEEEE");
    x.fillRect(0, 0, size, size);
  }
  return backdrops.set(key, c);
}

/** preparePhoto(garment, viewId, size) — bake ahead of time (e.g. while the page idles). */
export function preparePhoto(garment, viewId, size = 800, timings = null) {
  const cv = compileView(garment, viewId);
  if (!cv) return false;
  getBake(cv, sizeBucket(size), timings);
  return true;
}

export { ARTBOARD };
