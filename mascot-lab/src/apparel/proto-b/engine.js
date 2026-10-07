// proto-b · "painted light" garment photo engine.
//
// A garment view is authored as
//   · PANELS   — closed polygons filled by colour role (base / trim / accent / #hex),
//                painted in order; `over` panels (drawcords) land on top of prints
//   · LIGHT    — many authored soft shapes (core shadows, cast shadows, occlusion pools,
//                broad highlights, fold ridges/valleys as tapered brush strokes) each with
//                a blur radius, an opacity, a layer ("dark" = multiply, "light" = screen /
//                sheen) and a clip (the panels it may fall on) — plus procedural detail
//                the engine generates: seam grooves, twin-needle stitching, rib knit,
//                fleece grain, braided cords, metal hardware
//   · ZONES    — the placement boxes of CONTRACTS.md (scale/dx/dy/rotate/tile/tint/…)
//
// prepare(view, size) BAKES everything that does not depend on colour or graphics:
//   shade  (Uint8)  1 − Π(1 − a) of every dark stroke          → multiplicative light
//   light  (Uint8)  1 − Π(1 − a) of every light stroke         → diffuse lift + sheen
//   print  (Uint8)  coverage where the TOPMOST panel is printable
//   disp   (Int16)  print displacement = −∇(blurred fold relief) + cylinder wrap
//   metal  (RGBA)   eyelets / aglets, fully lit (colour-independent)
//   drop   (RGBA)   soft drop shadow
// render() then only fills the panel polygons with the team colours, lays the graphics
// into a print layer, and runs ONE per-pixel pass:
//   albedo ← lerp(panel colour, displaced print sample, print coverage · ink grain)
//   linear ← sRGB→linear(albedo) · (E·shade + Kd·light) + sheen·light      (hue-true)
//   out    ← filmic shoulder → sRGB
// so recolouring or swapping the graphic never re-bakes. No DOM access: OffscreenCanvas.

import { createCanvas, ctx2d, drawBlurred, polyPath, LRU, hex, rgbOf, isHex, relLum, mixHex } from "./canvas.js";
import { signedArea, rev, normals } from "./geom.js";

export const ARTBOARD = 1000;
export const SAFE = 0.72;

/* ───────────────────────────── colour science LUTs ───────────────────────────── */

const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
// linear (0 … 2) → sRGB byte, with a soft filmic shoulder above KNEE so highlights on
// white / gold cloth roll off instead of clipping flat.
const LUT_N = 8192, LUT_MAX = 2;
const TO_SRGB = new Uint8ClampedArray(LUT_N + 1);
{
  const KNEE = 0.78;
  for (let i = 0; i <= LUT_N; i++) {
    let v = (i / LUT_N) * LUT_MAX;
    if (v > KNEE) v = KNEE + (1 - KNEE) * (1 - Math.exp(-(v - KNEE) / (1 - KNEE)));
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    TO_SRGB[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
}
const LUT_K = LUT_N / LUT_MAX;

/**
 * Light-map transfer: the dark map is 1 − Π(1 − aᵢ) of every shadow stroke, so raising
 * the transmittance to a power γ scales the optical density of EVERY stroke at once —
 * a global "shadow strength" knob that keeps the painted relationships intact.
 * shadeLUT[v] = E · (1 − v/255)^γd,  lightLUT[v] = KD · (1 − (1 − v/255)^γl).
 */
const lutCache = new Map();
function lightLUTs(L) {
  const E = L.exposure ?? 1.0, KD = L.diffuse ?? 1.2, gd = L.shadowGain ?? 1.6, gl = L.lightGain ?? 1.5;
  const key = `${E}|${KD}|${gd}|${gl}`;
  let hit = lutCache.get(key);
  if (hit) return hit;
  const shadeLUT = new Float32Array(256), lightLUT = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    shadeLUT[v] = E * (1 - v / 255) ** gd;
    lightLUT[v] = KD * (1 - (1 - v / 255) ** gl);
  }
  hit = { shadeLUT, lightLUT };
  lutCache.set(key, hit);
  return hit;
}

/* ───────────────────────────── compile a view ───────────────────────────── */

const compiled = new WeakMap();

function normPoly(pts) {
  // consistent winding → nonzero unions of several panels behave as real unions
  return signedArea(pts) < 0 ? rev(pts) : pts;
}

function compileView(def, viewId) {
  let views = compiled.get(def);
  if (!views) { views = new Map(); compiled.set(def, views); }
  let cv = views.get(viewId);
  if (cv) return cv;
  const view = def.views?.[viewId];
  if (!view) return null;
  const parts = view.parts.map((p, index) => ({ ...p, index, pts: normPoly(p.pts), path: polyPath(normPoly(p.pts)) }));
  const byId = new Map(parts.map((p) => [p.id, p]));
  const unionCache = new Map();
  const union = (ids) => {
    const list = ids === "all" || !ids ? parts.filter((p) => !p.noShade).map((p) => p.id)
      : typeof ids === "string" ? (view.clipSets?.[ids] || [ids]) : ids;
    const key = list.join(",");
    let u = unionCache.get(key);
    if (u) return u;
    u = new Path2D();
    for (const id of list) { const p = byId.get(id); if (p) u.addPath(p.path); }
    unionCache.set(key, u);
    return u;
  };
  // garment bounds (artboard units)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const printIds = parts.filter((p) => p.print).map((p) => p.id);
  cv = {
    def, view, viewId, key: `${def.id}:${viewId}`,
    parts, byId, union,
    bounds: { x0, y0, x1, y1 },
    printIds,
    printUnion: union(view.printDefault || (printIds.length ? printIds : "all")),
    zones: view.zones || {},
  };
  views.set(viewId, cv);
  return cv;
}

/* ───────────────────────────── procedural tiles ───────────────────────────── */

let fleeceTiles = null;
/** 256² tileable fleece grain: { dark, light } canvases + raw Uint8 grain for the ink pass. */
function fleece() {
  if (fleeceTiles) return fleeceTiles;
  const N = 256;
  const lattice = (seed, G) => {
    const g = new Float32Array(G * G);
    let a = seed >>> 0;
    for (let i = 0; i < g.length; i++) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      g[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return (x, y) => {
      const fx = (x / N) * G, fy = (y / N) * G;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % G + G) % G) * G + ((i % G + G) % G)];
      const a0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const a1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a0 + (a1 - a0) * sy;
    };
  };
  const fine = lattice(11, 160), mid = lattice(23, 56), coarse = lattice(37, 12);
  const dark = createCanvas(N), light = createCanvas(N);
  const dx = ctx2d(dark, true), lx = ctx2d(light, true);
  const di = dx.createImageData(N, N), li = lx.createImageData(N, N);
  const grain = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = fine(x, y) * 0.5 + mid(x, y) * 0.35 + coarse(x, y) * 0.15;   // 0..1, mean ≈ .5
    const i = y * N + x, o = i * 4;
    const d = Math.max(0, 0.5 - v) * 2, l = Math.max(0, v - 0.5) * 2;
    di.data[o + 3] = Math.round(Math.min(1, d * 1.6) * 255);
    li.data[o] = li.data[o + 1] = li.data[o + 2] = 255;
    li.data[o + 3] = Math.round(Math.min(1, l * 1.6) * 255);
    grain[i] = Math.round(Math.min(1, Math.max(0, (fine(x * 1.7 + 13, y * 1.7 + 7) - 0.5) * 2.4 + 0.5)) * 255);
  }
  dx.putImageData(di, 0, 0);
  lx.putImageData(li, 0, 0);
  fleeceTiles = { dark, light, grain, N };
  return fleeceTiles;
}

/** Rib-knit stripe tiles (dark grooves / light wales) for a period in px. */
function ribTiles(periodPx) {
  const reps = Math.max(1, Math.ceil(24 / periodPx));
  const W = Math.max(2, Math.round(periodPx * reps));
  const per = W / reps;
  const dark = createCanvas(W, 4), light = createCanvas(W, 4);
  const dx = ctx2d(dark), lx = ctx2d(light);
  for (let x = 0; x < W; x++) {
    const ph = ((x + 0.5) / per) * Math.PI * 2;
    const s = Math.sin(ph);
    const d = Math.max(0, -s) ** 1.6, l = Math.max(0, s) ** 2.2;
    dx.fillStyle = `rgba(0,0,0,${d.toFixed(3)})`; dx.fillRect(x, 0, 1, 4);
    lx.fillStyle = `rgba(255,255,255,${l.toFixed(3)})`; lx.fillRect(x, 0, 1, 4);
  }
  return { dark, light };
}

/* ───────────────────────────── bake (color-independent) ───────────────────────────── */

const bakeCache = new LRU(10);

/**
 * prepare(def, viewId, size) → bake. Cached per (garment, view, size); the first call
 * pays the full cost (shading layers, displacement, hardware), every later render
 * (recolour, new graphic) only runs the composite.
 */
export function prepare(def, viewId, size = 1200, timings = null) {
  size = Math.max(64, Math.round(size));
  const cv = compileView(def, viewId);
  if (!cv) throw new Error(`proto-b: no view "${viewId}" on ${def?.id}`);
  const key = `${cv.key}|${size}`;
  const hit = bakeCache.get(key);
  if (hit) return hit;
  const t0 = now();
  const k = size / ARTBOARD;
  const view = cv.view;

  // pixel box around the garment (+ room for hardware shadows)
  const pad = 6;
  const box = {
    x0: Math.max(0, Math.floor(cv.bounds.x0 * k) - pad),
    y0: Math.max(0, Math.floor(cv.bounds.y0 * k) - pad),
    x1: Math.min(size, Math.ceil(cv.bounds.x1 * k) + pad),
    y1: Math.min(size, Math.ceil(cv.bounds.y1 * k) + pad),
  };
  box.w = box.x1 - box.x0; box.h = box.y1 - box.y0;

  const D = createCanvas(size), L = createCanvas(size);
  const dctx = ctx2d(D, true), lctx = ctx2d(L, true);
  // relief (height) map for print displacement, low-res
  const HR = Math.max(96, Math.min(320, Math.round(size / 4)));
  const H = createCanvas(HR);
  const hctx = ctx2d(H, true);
  hctx.fillStyle = "rgb(128,128,128)";
  hctx.fillRect(0, 0, HR, HR);

  const layers = { dark: dctx, light: lctx };
  const bc = makeBC(cv, size);
  const t1 = now();

  // 1 · authored soft light, grouped by (layer, clip, exclude, blur bucket)
  paintSoft(bc, view.paint || [], layers, hctx, HR);
  const t2 = now();

  // 1b · cloth undulation: low-frequency, gravity-elongated relief over every fabric panel
  paintUndulation(bc, view, layers, hctx, HR);

  // 2 · procedural surface detail (sharp, full resolution)
  paintRibs(bc, view.ribs || [], layers);
  paintFleece(bc, view, layers);
  paintSeams(bc, view.seams || [], layers);
  paintStitches(bc, view.stitches || [], layers);
  paintCords(cv, view.cords || [], layers, size);
  paintEdgeLight(bc, view.edges || [], layers);
  const metal = paintMetal(cv, view.metal || [], layers, size);
  const t3 = now();

  // 3 · read back the light maps (box only)
  const shade = alphaOf(dctx, box);
  const light = alphaOf(lctx, box);

  // 4 · print coverage: topmost panel printable?
  const M = createCanvas(size);
  const mctx = ctx2d(M, true);
  mctx.setTransform(k, 0, 0, k, 0, 0);
  for (const p of cv.parts) {
    if (p.print) { mctx.globalCompositeOperation = "source-over"; mctx.fillStyle = "#fff"; }
    else mctx.globalCompositeOperation = "destination-out";
    mctx.fill(p.path);
  }
  const print = alphaOf(mctx, box);
  let pb = { x0: box.w, y0: box.h, x1: 0, y1: 0 };
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    if (print[y * box.w + x]) { if (x < pb.x0) pb.x0 = x; if (x > pb.x1) pb.x1 = x; if (y < pb.y0) pb.y0 = y; if (y > pb.y1) pb.y1 = y; }
  }
  if (pb.x1 < pb.x0) pb = null;

  // 5 · displacement from the painted folds (+ cylinder wraps)
  const disp = buildDisplacement(cv, view, hctx, HR, size, box, print);
  const t4 = now();

  // 6 · drop shadow (soft, color-independent)
  const drop = dropShadow(cv, view, size);
  const t5 = now();

  const bake = {
    key, cv, size, k, box, printBox: pb,
    shade, light, print, dispX: disp.x, dispY: disp.y,
    metal, drop,
    albedo: createCanvas(size), printLayer: createCanvas(size), out: createCanvas(box.w, box.h),
    ms: t5 - t0,
  };
  bake.albedoCtx = ctx2d(bake.albedo, true);
  bake.printCtx = ctx2d(bake.printLayer, true);
  bake.outCtx = ctx2d(bake.out);
  if (timings) Object.assign(timings, { bakeSetup: t1 - t0, bakeSoft: t2 - t1, bakeDetail: t3 - t2, bakeMaps: t4 - t3, bakeDrop: t5 - t4, bake: t5 - t0 });
  return bakeCache.set(key, bake);
}

const now = () => (globalThis.performance ? performance.now() : Date.now());

function alphaOf(ctx, box) {
  const img = ctx.getImageData(box.x0, box.y0, box.w, box.h).data;
  const n = box.w * box.h, out = new Uint8Array(n);
  for (let i = 0, j = 3; i < n; i++, j += 4) out[i] = img[j];
  return out;
}

/* ── bake context: visibility masks + one scratch canvas ── */

/**
 * A clip is a set of panels; its mask is where one of THOSE panels is the topmost
 * panel (painting order), so light painted "on the hood shell" never lands on the lining
 * drawn over it. Masks and all masked work are limited to the clip's pixel rect.
 */
function makeBC(cv, size) {
  const scratch = createCanvas(size);
  return { cv, size, k: size / ARTBOARD, masks: new Map(), scratch, sx: ctx2d(scratch) };
}
function clipIds(cv, clip) {
  if (clip === "all" || clip === undefined) return null;
  if (typeof clip === "string") return cv.view.clipSets?.[clip] || [clip];
  return clip;
}
function partRect(cv, p) {
  if (!p.rect) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    p.rect = { x0, y0, x1, y1 };
  }
  return p.rect;
}
function visMask(bc, clip) {
  const ids = clipIds(bc.cv, clip);
  const key = ids ? ids.join(",") : "*";
  let m = bc.masks.get(key);
  if (m) return m;
  const { cv, size, k } = bc;
  const set = ids ? new Set(ids) : null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of cv.parts) {
    if (set && !set.has(p.id)) continue;
    const r = partRect(cv, p);
    x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
  }
  if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
  const pad = 3;
  const r = {
    x: Math.max(0, Math.floor(x0 * k) - pad), y: Math.max(0, Math.floor(y0 * k) - pad),
  };
  r.w = Math.max(1, Math.min(size, Math.ceil(x1 * k) + pad) - r.x);
  r.h = Math.max(1, Math.min(size, Math.ceil(y1 * k) + pad) - r.y);
  const c = createCanvas(r.w, r.h);
  const x = ctx2d(c);
  x.setTransform(k, 0, 0, k, -r.x, -r.y);
  x.fillStyle = "#fff";
  for (const p of cv.parts) {
    const inSet = !set || set.has(p.id);
    if (!inSet) {
      const pr = partRect(cv, p);
      if (pr.x1 * k < r.x || pr.x0 * k > r.x + r.w || pr.y1 * k < r.y || pr.y0 * k > r.y + r.h) continue;
    }
    x.globalCompositeOperation = inSet ? "source-over" : "destination-out";
    x.fill(p.path);
  }
  m = { canvas: c, r };
  bc.masks.set(key, m);
  return m;
}

/** Draw into the scratch canvas, keep the clip's visible pixels (minus `exclude`), add to target. */
function masked(bc, target, clip, draw, exclude) {
  const { sx, size, k } = bc;
  const m = clip === null ? null : visMask(bc, clip);
  const r = m ? m.r : { x: 0, y: 0, w: size, h: size };
  sx.save();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalCompositeOperation = "source-over";
  sx.globalAlpha = 1;
  sx.filter = "none";
  sx.clearRect(r.x, r.y, r.w, r.h);
  sx.beginPath();
  sx.rect(r.x, r.y, r.w, r.h);
  sx.clip();
  draw(sx);
  sx.restore();
  sx.save();
  if (exclude) {
    sx.globalCompositeOperation = "destination-out";
    sx.setTransform(k, 0, 0, k, 0, 0);
    sx.fillStyle = "#000";
    sx.fill(bc.cv.union(exclude));
    sx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (m) {
    sx.globalCompositeOperation = "destination-in";
    sx.drawImage(m.canvas, r.x, r.y);
  }
  sx.restore();
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = "source-over";
  target.globalAlpha = 1;
  target.drawImage(bc.scratch, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  target.restore();
}
const clipKey = (clip) => (clip === null ? "-" : Array.isArray(clip) ? clip.join(",") : String(clip ?? "all"));
function groupBy(list, keyFn) {
  const m = new Map();
  for (const it of list) { const kk = keyFn(it); if (!m.has(kk)) m.set(kk, []); m.get(kk).push(it); }
  return m;
}

/* ── soft light ── */

function blurBucket(b) {
  if (b <= 0.3) return 0;
  // ~12% steps: groups merge, a step is invisible
  return Math.round(Math.log(b) / Math.log(1.12));
}

function paintSoft(bc, items, layers, hctx, HR) {
  const { size, k } = bc;
  const groups = new Map();
  for (const it of items) {
    if (!it || !it.pts?.length) continue;
    const layer = it.layer === "light" ? "light" : "dark";
    const clip = it.clip === undefined ? "all" : it.clip;
    const exKey = it.exclude ? it.exclude.join(",") : "";
    const bb = blurBucket(it.blur || 0);
    const g = `${layer}|${clipKey(clip)}|${exKey}|${bb}`;
    if (!groups.has(g)) groups.set(g, { layer, clip, exclude: it.exclude, blur: bb ? 1.12 ** bb : 0, items: [] });
    groups.get(g).items.push(it);
  }
  for (const g of groups.values()) {
    const sigmaPx = g.blur * k;
    // blurry groups render at reduced resolution: ~3 px of blur in the small canvas
    const f = sigmaPx > 3 ? Math.max(1 / 12, 3 / sigmaPx) : 1;
    const S = Math.max(8, Math.round(size * f));
    const tmp = createCanvas(S);
    const tx = ctx2d(tmp);
    const kk = S / ARTBOARD;
    tx.setTransform(kk, 0, 0, kk, 0, 0);
    for (const it of g.items) fillItem(tx, it, g.layer);
    let src = tmp;
    if (f < 1) {
      src = createCanvas(S);
      drawBlurred(ctx2d(src), tmp, sigmaPx * f);
    }
    masked(bc, layers[g.layer], g.clip, (x) => {
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "low";
      if (f < 1) x.drawImage(src, 0, 0, size, size);
      else drawBlurred(x, tmp, sigmaPx);
    }, g.exclude);

    // relief for print displacement: folds only, low-res, extra blur
    const relief = g.items.filter((it) => it.fold);
    if (relief.length) {
      const hk = HR / ARTBOARD;
      const r = createCanvas(HR);
      const rx = ctx2d(r);
      rx.setTransform(hk, 0, 0, hk, 0, 0);
      for (const it of relief) {
        rx.globalAlpha = Math.min(1, (it.alpha ?? 0.3) * it.fold);
        rx.fillStyle = g.layer === "light" ? "#fff" : "#000";
        rx.fill(polyPath(it.pts));
      }
      hctx.save();
      hctx.globalAlpha = 1;
      drawBlurred(hctx, r, Math.max(1, (g.blur + 6) * hk));
      hctx.restore();
    }
  }
}

function fillItem(x, it, layer) {
  const col = layer === "light" ? "255,255,255" : "0,0,0";
  const a = it.alpha ?? 0.3;
  const path = polyPath(it.pts);
  if (it.grad) {
    const g = it.grad;
    const gr = g.type === "radial"
      ? x.createRadialGradient(g.x0, g.y0, g.r0 || 0, g.x1 ?? g.x0, g.y1 ?? g.y0, g.r1)
      : x.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
    for (const [t, ga] of g.stops) gr.addColorStop(t, `rgba(${col},${(ga * a).toFixed(4)})`);
    x.fillStyle = gr;
  } else x.fillStyle = `rgba(${col},${a})`;
  x.fill(path);
}

/* ── cloth undulation ── */

/**
 * Real cloth is never a perfect gradient: heavyweight fleece hangs in soft, irregular
 * swells and hollows elongated along gravity. A warped value-noise field at low
 * resolution, split into a dark and a light part, blurred, masked to the fabric panels;
 * it also feeds the relief map so prints undulate with it.
 */
function paintUndulation(bc, view, layers, hctx, HR) {
  const u = view.undulation;
  if (!u || !(u.amount > 0)) return;
  const { cv, size } = bc;
  const N = Math.max(64, Math.min(256, Math.round(size / 5)));
  const k = N / ARTBOARD;
  const lat = (seed, G) => {
    const g = new Float32Array((G + 1) * (G + 1));
    let a = seed >>> 0;
    for (let i = 0; i < g.length; i++) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      g[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
    }
    return (x, y) => {
      x = Math.max(0, Math.min(G - 1e-3, x)); y = Math.max(0, Math.min(G - 1e-3, y));
      const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[j * (G + 1) + i];
      const a0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const a1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a0 + (a1 - a0) * sy;
    };
  };
  const G = 64, seed = u.seed ?? 5;
  const n1 = lat(seed, G), n2 = lat(seed + 17, G), w1 = lat(seed + 31, G);
  const sc = u.scale || 60;                       // artboard units per feature (across)
  const stretch = u.stretch ?? 2.2;               // elongated along gravity
  const dk = createCanvas(N), lt = createCanvas(N), hh = createCanvas(N);
  const dx = ctx2d(dk, true), lx = ctx2d(lt, true), hx = ctx2d(hh, true);
  const di = dx.createImageData(N, N), li = lx.createImageData(N, N), hi = hx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ax = x / k, ay = y / k;
    // drape waves: vertical swells whose phase wanders slowly down the garment, their
    // strength breathing in and out — hanging cloth, not blotches
    const ph1 = w1(ax / (sc * 4) + 3, ay / (sc * stretch) + 5) * 2.4;
    const ph2 = n2(ax / (sc * 5) + 11, ay / (sc * stretch * 1.3) + 1) * 2.0;
    const env = 0.55 + 0.45 * n1(ax / (sc * 2.5) + 7, ay / (sc * stretch * 0.8) + 2);
    let v = (Math.sin((ax / sc) * 2.1 + ph1) * 0.65 + Math.sin((ax / sc) * 3.7 + ph2 + 1.3) * 0.35) * env;
    v = Math.max(-1, Math.min(1, v));
    const o = (y * N + x) * 4;
    di.data[o + 3] = Math.round(Math.max(0, -v) * 255);
    li.data[o] = li.data[o + 1] = li.data[o + 2] = 255;
    li.data[o + 3] = Math.round(Math.max(0, v) * 255);
    const hv = Math.round(128 + v * 100);
    hi.data[o] = hi.data[o + 1] = hi.data[o + 2] = hv;
    hi.data[o + 3] = 255;
  }
  dx.putImageData(di, 0, 0); lx.putImageData(li, 0, 0); hx.putImageData(hi, 0, 0);
  const ids = cv.parts.filter((p) => p.texture !== false && !p.noShade && !(u.skip || []).includes(p.id)).map((p) => p.id);
  const blurPx = (u.blur ?? 10) * k;
  for (const [layer, src, a] of [["dark", dk, u.amount], ["light", lt, u.amount * (u.lightRatio ?? 0.8)]]) {
    const b = createCanvas(N);
    drawBlurred(ctx2d(b), src, blurPx);
    masked(bc, layers[layer], ids, (x) => {
      x.globalAlpha = a;
      x.imageSmoothingEnabled = true;
      x.drawImage(b, 0, 0, size, size);
    });
  }
  hctx.save();
  hctx.globalAlpha = u.relief ?? 0.5;
  hctx.imageSmoothingEnabled = true;
  drawBlurred(hctx, hh, Math.max(1, blurPx * (HR / N)), 0, 0, HR, HR);
  hctx.restore();
}

/* ── procedural detail ── */

function paintRibs(bc, ribs, layers) {
  const { cv, size, k } = bc;
  for (const r of ribs) {
    if (!cv.byId.get(r.part)) continue;
    const periodPx = (r.period || 4) * k;
    // band-limit: below ~1.6 px the wale cannot be drawn without aliasing → fade it out
    const amp = Math.min(1, Math.max(0, (periodPx - 1.4) / 1.6));
    if (amp <= 0) continue;
    const t = ribTiles(periodPx);
    for (const [layerName, tile, a] of [["dark", t.dark, (r.depth ?? 0.35) * amp], ["light", t.light, (r.depth ?? 0.35) * 0.55 * amp]]) {
      masked(bc, layers[layerName], [r.part], (x) => {
        const pat = x.createPattern(tile, "repeat");
        pat.setTransform(new DOMMatrix().rotate((r.angle ?? 90) - 90));
        x.globalAlpha = a;
        x.fillStyle = pat;
        x.fillRect(0, 0, size, size);
      });
    }
  }
}

function paintFleece(bc, view, layers) {
  const { cv, size } = bc;
  const f = fleece();
  // fleece grain is a physical texture: at thumbnail scale it averages out
  const amt = Math.min(1, Math.max(0, (size - 380) / 700)) * (view.fleece ?? 1);
  if (amt <= 0) return;
  const ids = cv.parts.filter((p) => p.texture !== false && !p.noShade).map((p) => p.id);
  for (const [name, tile, a] of [["dark", f.dark, 0.05 * amt], ["light", f.light, 0.03 * amt]]) {
    masked(bc, layers[name], ids, (x) => {
      const pat = x.createPattern(tile, "repeat");
      const s = Math.max(0.75, size / 1400);
      pat.setTransform(new DOMMatrix().scale(s).rotate(name === "dark" ? 0 : 90));
      x.globalAlpha = a;
      x.fillStyle = pat;
      x.fillRect(0, 0, size, size);
    });
  }
}

/** Light direction in image space (towards the light): upper left. */
export const LIGHT = (() => { const L = Math.hypot(-0.62, -0.78); return [-0.62 / L, -0.78 / L]; })();

function strokePoly(x, pts) {
  x.beginPath();
  x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
}

/** Offset towards the light side of a polyline (per point). */
function litOffset(pts, d) {
  const nr = normals(pts);
  let s = 0;
  for (const n of nr) s += n[0] * LIGHT[0] + n[1] * LIGHT[1];
  const sign = s >= 0 ? 1 : -1;
  return pts.map((p, i) => [p[0] + nr[i][0] * d * sign, p[1] + nr[i][1] * d * sign]);
}

/** Seams: a soft groove (dark core) with a lit ridge on the side facing the light. */
function paintSeams(bc, seams, layers) {
  const { size, k } = bc;
  const fade = Math.min(1, Math.max(0.35, (size - 200) / 600));
  for (const list of groupBy(seams.filter((s) => s.pts?.length > 1), (s) => clipKey(s.clip)).values()) {
    const clip = list[0].clip ?? "all";
    masked(bc, layers.dark, clip, (x) => {
      x.setTransform(k, 0, 0, k, 0, 0);
      x.lineCap = "round"; x.lineJoin = "round";
      for (const s of list) {
        const w = s.w ?? 1.5, depth = (s.depth ?? 0.5) * fade;
        for (const [lw, a, blur] of [[w, depth, 0.6], [w * 3.2, depth * 0.35, 2.2]]) {
          x.filter = `blur(${Math.max(0.35, blur * k * 0.9).toFixed(2)}px)`;
          x.strokeStyle = `rgba(0,0,0,${a})`;
          x.lineWidth = lw;
          strokePoly(x, s.pts);
          x.stroke();
        }
      }
    });
    masked(bc, layers.light, clip, (x) => {
      x.setTransform(k, 0, 0, k, 0, 0);
      x.lineCap = "round"; x.lineJoin = "round";
      for (const s of list) {
        const w = s.w ?? 1.5, depth = (s.depth ?? 0.5) * fade;
        x.filter = `blur(${Math.max(0.35, 0.5 * k * 0.9).toFixed(2)}px)`;
        x.strokeStyle = `rgba(255,255,255,${depth * 0.55})`;
        x.lineWidth = w * 0.9;
        strokePoly(x, litOffset(s.pts, w * 1.25));
        x.stroke();
      }
    });
  }
}

/** Twin-needle cover stitching: per row a thread highlight dash + a needle-hole shadow dash. */
function paintStitches(bc, stitches, layers) {
  const { k } = bc;
  for (const list of groupBy(stitches.filter((s) => s.pts?.length > 1), (s) => clipKey(s.clip)).values()) {
    const clip = list[0].clip ?? "all";
    for (const name of ["dark", "light"]) {
      masked(bc, layers[name], clip, (x) => {
        x.setTransform(k, 0, 0, k, 0, 0);
        x.lineCap = "butt";
        for (const s of list) {
          const len = s.len ?? 2.6, gapLen = s.space ?? 1.5;
          const visible = Math.min(1, Math.max(0, (len * k - 1.2) / 2.2));
          if (visible <= 0) continue;
          const rows = s.twin === false ? [0] : [-(s.gap ?? 4.5) / 2, (s.gap ?? 4.5) / 2];
          const a = (s.alpha ?? 1) * visible;
          x.setLineDash([len, gapLen]);
          x.lineDashOffset = s.phase ?? 0;
          for (const off of rows) {
            const pts = off ? offsetPts(s.pts, off) : s.pts;
            if (name === "dark") {
              x.strokeStyle = `rgba(0,0,0,${0.42 * a})`;
              x.lineWidth = 1.15;
              strokePoly(x, pts.map(([px, py]) => [px - LIGHT[0] * 0.55, py - LIGHT[1] * 0.55]));
            } else {
              x.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
              x.lineWidth = 0.95;
              strokePoly(x, pts);
            }
            x.stroke();
          }
        }
      });
    }
  }
}
function offsetPts(pts, d) {
  const nr = normals(pts);
  return pts.map((p, i) => [p[0] + nr[i][0] * d, p[1] + nr[i][1] * d]);
}

/**
 * Braided round cords: cast shadow onto what lies beneath (offset away from the light),
 * cylinder shading across the cord, and a herringbone braid along it.
 */
function paintCords(cv, cords, layers, size) {
  const k = size / ARTBOARD;
  for (const c of cords) {
    const part = cv.byId.get(c.part);
    if (!part) continue;
    const w = c.w;
    // cast shadow (blurred, cut out of the cord itself)
    const sh = createCanvas(size);
    const sx = ctx2d(sh);
    sx.setTransform(k, 0, 0, k, 0, 0);
    sx.filter = `blur(${(w * 0.55 * k).toFixed(2)}px)`;
    sx.strokeStyle = "rgba(0,0,0,0.62)";
    sx.lineWidth = w * 1.05;
    sx.lineCap = "round";
    strokePoly(sx, c.pts.map(([x, y]) => [x - LIGHT[0] * w * 0.9, y - LIGHT[1] * w * 0.9]));
    sx.stroke();
    sx.filter = `blur(${(w * 1.4 * k).toFixed(2)}px)`;
    sx.strokeStyle = "rgba(0,0,0,0.22)";
    sx.lineWidth = w * 1.6;
    strokePoly(sx, c.pts.map(([x, y]) => [x - LIGHT[0] * w * 1.8, y - LIGHT[1] * w * 1.8]));
    sx.stroke();
    sx.filter = "none";
    sx.globalCompositeOperation = "destination-out";
    sx.fill(part.path);
    layers.dark.save();
    layers.dark.setTransform(1, 0, 0, 1, 0, 0);
    layers.dark.drawImage(sh, 0, 0);
    layers.dark.restore();

    // cylinder shading across the cord
    const lit = litOffset(c.pts, w * 0.22), dark = litOffset(c.pts, -w * 0.3);
    for (const [name, pts, lw, a, b] of [
      ["dark", dark, w * 0.5, 0.5, 0.18],
      ["dark", litOffset(c.pts, -w * 0.48), w * 0.16, 0.55, 0.06],
      ["light", lit, w * 0.26, 0.42, 0.1],
    ]) {
      const x = layers[name];
      x.save();
      x.setTransform(k, 0, 0, k, 0, 0);
      x.clip(part.path);
      x.filter = `blur(${Math.max(0.3, w * b * k).toFixed(2)}px)`;
      x.strokeStyle = name === "light" ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      x.lineWidth = lw;
      x.lineCap = "round";
      strokePoly(x, pts);
      x.stroke();
      x.restore();
    }
    // braid: short slanted ridges alternating direction (herringbone), along the cord
    const pitch = c.pitch ?? w * 0.62;
    if (pitch * k < 1.6) continue;
    const L = arcLength(c.pts);
    const nr = normals(c.pts);
    for (const name of ["dark", "light"]) {
      const x = layers[name];
      x.save();
      x.setTransform(k, 0, 0, k, 0, 0);
      x.clip(part.path);
      x.lineCap = "round";
      x.lineWidth = w * (name === "dark" ? 0.16 : 0.11);
      x.strokeStyle = name === "dark" ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.32)";
      x.beginPath();
      let i = 0;
      for (let s = pitch * 0.5; s < L; s += pitch, i++) {
        const { p, t, n } = atLen(c.pts, nr, s);
        const side = i % 2 ? 1 : -1;
        const sl = pitch * 0.55;
        // a chevron arm from the centre to the edge, slanted along the cord
        const off = name === "dark" ? -pitch * 0.18 : pitch * 0.12;
        const a0 = [p[0] + t[0] * off, p[1] + t[1] * off];
        const a1 = [a0[0] + n[0] * side * w * 0.5 + t[0] * sl, a0[1] + n[1] * side * w * 0.5 + t[1] * sl];
        x.moveTo(a0[0], a0[1]);
        x.lineTo(a1[0], a1[1]);
      }
      x.stroke();
      x.restore();
    }
  }
}
function arcLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
function atLen(pts, nr, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === pts.length - 1) {
      const f = L ? Math.min(1, s / L) : 0;
      const t = [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)];
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t, n: nr[i] };
    }
    s -= L;
  }
  return { p: pts.at(-1), t: [0, 1], n: nr.at(-1) };
}

/** Thin rim light along contours facing the key light, falloff on the far side. */
function paintEdgeLight(bc, edges, layers) {
  const { k } = bc;
  for (const e of edges) {
    const dark = e.layer === "dark";
    masked(bc, layers[dark ? "dark" : "light"], e.clip ?? "all", (x) => {
      x.setTransform(k, 0, 0, k, 0, 0);
      x.filter = `blur(${Math.max(0.4, (e.blur ?? 1.5) * k).toFixed(2)}px)`;
      x.strokeStyle = dark ? `rgba(0,0,0,${e.alpha ?? 0.3})` : `rgba(255,255,255,${e.alpha ?? 0.25})`;
      x.lineWidth = e.w ?? 3;
      x.lineCap = "round"; x.lineJoin = "round";
      strokePoly(x, e.pts);
      x.stroke();
    });
  }
}

/**
 * Metal hardware (aglets, eyelets): fully lit, colour-independent RGBA layer composited
 * last; their contact shadows go into the dark map.
 */
function paintMetal(cv, items, layers, size) {
  if (!items.length) return null;
  const k = size / ARTBOARD;
  const m = createCanvas(size);
  const x = ctx2d(m);
  x.setTransform(k, 0, 0, k, 0, 0);
  const tone = (items.tone || "gunmetal");
  for (const it of items) {
    if (it.type === "aglet") {
      const [p0, p1] = it.pts;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const r = it.w / 2;
      // contact shadow
      shadowBlob(layers.dark, k, (c) => {
        c.translate(p0[0] - LIGHT[0] * r * 1.4, p0[1] - LIGHT[1] * r * 1.4);
        c.rotate(ang);
        roundRect(c, -r * 0.2, -r * 1.05, L + r * 0.6, r * 2.1, r);
      }, r * 0.9, 0.5);
      x.save();
      x.translate(p0[0], p0[1]);
      x.rotate(ang);
      // body: brushed metal across the tube (lit edge toward the light)
      const g = x.createLinearGradient(0, -r, 0, r);
      const litTop = Math.sin(ang) * LIGHT[0] - Math.cos(ang) * LIGHT[1] < 0;   // which side faces the light
      const stops = [[0, "#3c3f44"], [0.16, "#9aa0a8"], [0.3, "#f4f6f8"], [0.42, "#b9bec5"], [0.62, "#6d737b"], [0.86, "#2c2f33"], [1, "#4a4e54"]];
      for (const [t, c] of stops) g.addColorStop(litTop ? t : 1 - t, c);
      x.fillStyle = g;
      roundRect(x, 0, -r, L, r * 2, r * 0.35);
      x.fill();
      // crimp rings near the cord end + rounded tip
      x.fillStyle = "rgba(0,0,0,0.28)";
      x.fillRect(L * 0.1, -r, L * 0.035, r * 2);
      x.fillRect(L * 0.17, -r, L * 0.025, r * 2);
      const tip = x.createLinearGradient(L - r * 0.6, 0, L, 0);
      tip.addColorStop(0, "rgba(0,0,0,0)");
      tip.addColorStop(1, "rgba(0,0,0,0.35)");
      x.fillStyle = tip;
      roundRect(x, 0, -r, L, r * 2, r * 0.35);
      x.fill();
      // specular glint
      x.fillStyle = "rgba(255,255,255,0.9)";
      x.beginPath();
      x.ellipse(L * 0.42, litTop ? -r * 0.4 : r * 0.4, L * 0.16, r * 0.1, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    } else if (it.type === "eyelet") {
      const [cx, cy] = it.c;
      const R = it.r, ri = it.ri ?? R * 0.58;
      shadowBlob(layers.dark, k, (c) => { c.beginPath(); c.arc(cx - LIGHT[0] * R * 0.35, cy - LIGHT[1] * R * 0.35, R * 1.08, 0, Math.PI * 2); }, R * 0.35, 0.55);
      x.save();
      // ring: conical-ish lighting via two linear gradients
      const g = x.createLinearGradient(cx + LIGHT[0] * R, cy + LIGHT[1] * R, cx - LIGHT[0] * R, cy - LIGHT[1] * R);
      g.addColorStop(0, "#f2f4f6"); g.addColorStop(0.35, "#a9afb7"); g.addColorStop(0.7, "#5d636b"); g.addColorStop(1, "#2a2d31");
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.arc(cx, cy, ri, 0, Math.PI * 2, true); x.fill("evenodd");
      // inner bevel (reversed lighting)
      const g2 = x.createLinearGradient(cx + LIGHT[0] * ri, cy + LIGHT[1] * ri, cx - LIGHT[0] * ri, cy - LIGHT[1] * ri);
      g2.addColorStop(0, "#33373c"); g2.addColorStop(1, "#d8dce0");
      x.strokeStyle = g2;
      x.lineWidth = Math.max(0.35, R * 0.16);
      x.beginPath(); x.arc(cx, cy, ri + R * 0.08, 0, Math.PI * 2); x.stroke();
      // glint
      x.fillStyle = "rgba(255,255,255,0.85)";
      x.beginPath(); x.ellipse(cx + LIGHT[0] * R * 0.62, cy + LIGHT[1] * R * 0.62, R * 0.2, R * 0.09, Math.atan2(LIGHT[1], LIGHT[0]) + Math.PI / 2, 0, Math.PI * 2); x.fill();
      x.restore();
      // the hole (shadowed opening — the cord lies inside it, so only darken the ring's inner edge)
      if (it.hole !== false) {
        x.save();
        x.globalAlpha = 0.75;
        const h = x.createRadialGradient(cx - LIGHT[0] * ri * 0.3, cy - LIGHT[1] * ri * 0.3, 0, cx, cy, ri);
        h.addColorStop(0.55, "rgba(10,10,12,0)");
        h.addColorStop(1, "rgba(10,10,12,0.9)");
        x.fillStyle = h;
        x.beginPath(); x.arc(cx, cy, ri, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
  }
  return m;
}
function shadowBlob(dctx, k, build, blur, alpha) {
  dctx.save();
  dctx.setTransform(k, 0, 0, k, 0, 0);
  dctx.filter = `blur(${Math.max(0.4, blur * k).toFixed(2)}px)`;
  dctx.fillStyle = `rgba(0,0,0,${alpha})`;
  build(dctx);
  dctx.fill();
  dctx.restore();
}
function roundRect(x, X, Y, W, H, r) {
  r = Math.min(r, W / 2, H / 2);
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

/* ── displacement ── */

function buildDisplacement(cv, view, hctx, HR, size, box, print) {
  const n = box.w * box.h;
  const dxA = new Int16Array(n), dyA = new Int16Array(n);
  const hk = HR / ARTBOARD, k = size / ARTBOARD;
  // relief: blurred fold luminance, centred on 0
  const Hb = createCanvas(HR);
  const hb = ctx2d(Hb, true);
  drawBlurred(hb, hctx.canvas, Math.max(1, 5 * hk));
  const hd = hb.getImageData(0, 0, HR, HR).data;
  const h = new Float32Array(HR * HR);
  for (let i = 0; i < HR * HR; i++) h[i] = (hd[i * 4] - 128) / 128;
  // gradient (per artboard unit) at the low-res grid
  const gx = new Float32Array(HR * HR), gy = new Float32Array(HR * HR);
  for (let y = 1; y < HR - 1; y++) for (let x = 1; x < HR - 1; x++) {
    const i = y * HR + x;
    gx[i] = (h[i + 1] - h[i - 1]) * hk * 0.5;
    gy[i] = (h[i + HR] - h[i - HR]) * hk * 0.5;
  }
  const strength = view.foldDisplace ?? 220;     // artboard units per unit slope
  const wraps = view.wraps || [];
  const SUB = 16;                                // Int16 in 1/16 px
  for (let y = 0; y < box.h; y++) {
    const ay = (box.y0 + y + 0.5) / k;
    const fy = ay * hk - 0.5;
    const y0 = Math.max(0, Math.min(HR - 2, Math.floor(fy))), ty = Math.min(1, Math.max(0, fy - y0));
    for (let x = 0; x < box.w; x++) {
      const i = y * box.w + x;
      if (!print[i]) continue;
      const ax = (box.x0 + x + 0.5) / k;
      const fx = ax * hk - 0.5;
      const x0 = Math.max(0, Math.min(HR - 2, Math.floor(fx))), tx = Math.min(1, Math.max(0, fx - x0));
      const j = y0 * HR + x0;
      const bil = (A) => (A[j] * (1 - tx) + A[j + 1] * tx) * (1 - ty) + (A[j + HR] * (1 - tx) + A[j + HR + 1] * tx) * ty;
      let ddx = -bil(gx) * strength, ddy = -bil(gy) * strength;
      // cylinder wrap: the flat print is sampled at arc length, so it compresses where
      // the body turns away (sides of the torso)
      for (const w of wraps) {
        if (ay < w.y0 || ay > w.y1) continue;
        const u = (ax - w.cx) / w.r;
        if (Math.abs(u) >= 0.999) continue;
        const arc = w.r * Math.asin(u);
        const fade = Math.min(1, (ay - w.y0) / (w.feather || 1), (w.y1 - ay) / (w.feather || 1));
        ddx += (arc - (ax - w.cx)) * (w.amount ?? 1) * fade;
      }
      dxA[i] = Math.max(-32000, Math.min(32000, Math.round(ddx * k * SUB)));
      dyA[i] = Math.max(-32000, Math.min(32000, Math.round(ddy * k * SUB)));
    }
  }
  return { x: dxA, y: dyA };
}

/* ── drop shadow ── */

function dropShadow(cv, view, size) {
  const k = size / ARTBOARD;
  const ds = view.drop || {};
  const S = Math.max(64, Math.round(size / 3));
  const kk = S / ARTBOARD;
  const sil = cv.union("all");
  const out = createCanvas(size);
  const ox = ctx2d(out);
  ox.imageSmoothingEnabled = true;
  for (const [offX, offY, blur, alpha] of ds.passes || [[9, 16, 20, 0.26], [3, 6, 6, 0.2], [1, 2, 1.6, 0.16]]) {
    const small = blur * kk > 2.5;
    const W = small ? S : size, kw = small ? kk : k;
    const t = createCanvas(W);
    const tx = ctx2d(t);
    tx.setTransform(kw, 0, 0, kw, offX * kw, offY * kw);
    tx.fillStyle = `rgba(14,18,26,${alpha})`;
    tx.fill(sil);
    const b = createCanvas(W);
    drawBlurred(ctx2d(b), t, blur * kw);
    ox.drawImage(b, 0, 0, size, size);
  }
  // floor contact pool under the hem (ghost mannequin hangs in front of a sweep)
  if (ds.floor) {
    const [cx, cy, rx, ry, a] = ds.floor;
    const t = createCanvas(S);
    const tx = ctx2d(t);
    tx.setTransform(kk, 0, 0, kk, 0, 0);
    const g = tx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(14,18,26,${a})`);
    g.addColorStop(1, "rgba(14,18,26,0)");
    tx.fillStyle = g;
    tx.translate(cx, cy); tx.scale(1, ry / rx); tx.translate(-cx, -cy);
    tx.beginPath(); tx.arc(cx, cy, rx, 0, Math.PI * 2); tx.fill();
    ox.drawImage(t, 0, 0, size, size);
  }
  return out;
}

/* ───────────────────────────── backdrop ───────────────────────────── */

const backdropCache = new LRU(8);
function backdropCanvas(size, backdrop) {
  const key = `${size}|${backdrop}`;
  const hit = backdropCache.get(key);
  if (hit) return hit;
  const c = createCanvas(size);
  const x = ctx2d(c);
  if (backdrop === "studio") {
    // seamless paper sweep, key from the upper left: lighter behind the garment,
    // gently falling off to the corners, a touch warmer/darker toward the floor
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, "#E4E6E9");
    g.addColorStop(0.62, "#EDEEF0");
    g.addColorStop(1, "#E2E3E5");
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const r = x.createRadialGradient(size * 0.44, size * 0.38, size * 0.05, size * 0.5, size * 0.5, size * 0.78);
    r.addColorStop(0, "rgba(255,255,255,0.62)");
    r.addColorStop(0.55, "rgba(255,255,255,0.12)");
    r.addColorStop(1, "rgba(120,126,136,0.22)");
    x.fillStyle = r;
    x.fillRect(0, 0, size, size);
    // fine paper noise to avoid banding
    const f = fleece();
    const pat = x.createPattern(f.dark, "repeat");
    x.globalAlpha = 0.018;
    x.fillStyle = pat;
    x.fillRect(0, 0, size, size);
    x.globalAlpha = 1;
  } else {
    x.fillStyle = hex(backdrop, "#EEEEEE");
    x.fillRect(0, 0, size, size);
  }
  return backdropCache.set(key, c);
}

/* ───────────────────────────── graphics (CONTRACTS placement model) ───────────────────────────── */

export function tonalOf(base) {
  const L = relLum(base);
  if (L < 0.05) return mixHex(base, "#FFFFFF", 0.16);
  if (L < 0.22) return mixHex(base, "#FFFFFF", 0.13);
  if (L < 0.5) return mixHex(base, "#000000", 0.16);
  return mixHex(base, "#000000", 0.12);
}
function resolveTint(tint, colors) {
  if (!tint) return null;
  if (tint === "tonal") return tonalOf(colors.base);
  if (tint === "base" || tint === "trim" || tint === "accent") return colors[tint];
  return isHex(tint) ? hex(tint) : null;
}

const tintCache = new WeakMap();
/** One-ink separation (same rule as renderMockup: density follows the art's luminance). */
function tinted(canvas, tint, lighterInk = true, knockout = true) {
  let m = tintCache.get(canvas);
  if (!m) { m = new Map(); tintCache.set(canvas, m); }
  const key = `${tint}|${knockout ? (lighterInk ? "L" : "D") : "S"}`;
  let t = m.get(key);
  if (t) return t;
  t = createCanvas(canvas.width, canvas.height);
  const x = ctx2d(t, true);
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
        hist[Math.min(63, (Y * 64) | 0)] += a; wsum += a;
      }
      const pct = (q) => { let acc = 0; for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc >= q * wsum) return (b + 0.5) / 64; } return 1; };
      const lo = pct(0.05), hi = pct(0.95);
      if (wsum > 0 && hi - lo >= 0.22) {
        const [r, g, b] = rgbOf(tint);
        for (let i = 0; i < n; i++) {
          const o = i * 4, a = d[o + 3];
          if (!a) continue;
          const Y = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;
          let v = Math.min(1, Math.max(0, (Y - lo) / (hi - lo)));
          if (!lighterInk) v = 1 - v;
          let dens = Math.min(1, Math.max(0, (v - 0.2) / 0.42));
          dens = dens * dens * (3 - 2 * dens);
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(a * dens);
        }
        x.putImageData(img, 0, 0);
        done = true;
      }
    } catch { /* tainted → flat silhouette */ }
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

const tileCache = new LRU(16);
const ids = new WeakMap();
let idSeq = 0;
const idOf = (c) => { let i = ids.get(c); if (!i) { i = ++idSeq; ids.set(c, i); } return i; };
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

/* ───────────────────────────── render ───────────────────────────── */

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

/**
 * render(def, viewId, opts) → canvas (size × size).
 *   opts = { size = 1200, colors: {base, trim, accent}, graphics = [], backdrop = null |
 *            "studio" | "#hex", shadow = true, timings? }
 */
export function render(def, viewId, opts = {}) {
  const size = Math.max(64, Math.round(opts.size || 1200));
  const timings = opts.timings || null;
  const t0 = now();
  const bake = prepare(def, viewId, size, timings);
  const t1 = now();
  const { cv, k, box } = bake;
  const colors = {
    base: hex(opts.colors?.base, "#13294B"),
    trim: hex(opts.colors?.trim, "#F2A900"),
    accent: hex(opts.colors?.accent, "#FFFFFF"),
  };

  // panels → albedo (under parts first)
  const A = bake.albedoCtx;
  A.setTransform(1, 0, 0, 1, 0, 0);
  A.clearRect(box.x0, box.y0, box.w, box.h);
  A.setTransform(k, 0, 0, k, 0, 0);
  for (const p of cv.parts) {
    if (p.over) continue;
    A.fillStyle = fillFor(p.role, colors);
    A.fill(p.path);
  }

  // graphics → print layer (albedo copy + ink), each placement clipped to its panels
  const graphics = (opts.graphics || []).filter((g) => g?.canvas?.width && g.canvas.height);
  let printData = null;
  const pb = bake.printBox;
  if (graphics.length && pb) {
    const P = bake.printCtx;
    P.setTransform(1, 0, 0, 1, 0, 0);
    P.globalCompositeOperation = "copy";
    P.drawImage(bake.albedo, 0, 0);
    P.globalCompositeOperation = "source-over";
    P.setTransform(k, 0, 0, k, 0, 0);
    P.imageSmoothingEnabled = true;
    P.imageSmoothingQuality = "high";
    const zoneIds = Object.keys(cv.zones);
    for (const pl of graphics) {
      const tint = resolveTint(pl.tint, colors);
      const lighter = tint ? relLum(tint) >= relLum(colors.base) : true;
      const src = tint ? tinted(pl.canvas, tint, lighter, pl.knockout !== false) : pl.canvas;
      const zone = pl.mode === "tile" ? null : (cv.zones[pl.zone] || cv.zones.center || cv.zones["back-center"] || cv.zones[zoneIds[0]]);
      P.save();
      P.clip(zone?.clip ? cv.union(zone.clip) : cv.printUnion);
      P.globalAlpha = Number.isFinite(pl.opacity) ? Math.max(0, Math.min(1, pl.opacity)) : 1;
      P.globalCompositeOperation = pl.blend === "multiply" || pl.blend === "screen" ? pl.blend : "source-over";
      if (pl.mode === "tile") drawTiled(P, pl, src, cv, k, tint ? `${tint}|${lighter}|${pl.knockout !== false}` : "-");
      else if (zone) drawSingle(P, pl, src, zone, k);
      P.restore();
    }
    printData = P.getImageData(box.x0, box.y0, box.w, box.h).data;
  }

  // over parts (drawcords…) after the print
  for (const p of cv.parts) {
    if (!p.over) continue;
    A.fillStyle = fillFor(p.role, colors);
    A.fill(p.path);
  }
  const t2 = now();

  const img = A.getImageData(box.x0, box.y0, box.w, box.h);
  const d = img.data;
  const { shade, light, print, dispX, dispY } = bake;
  const L = cv.view.lightModel || {};
  const KS = L.sheen ?? 0.085, KSP = L.printSheen ?? 0.05;
  const INK = L.inkGrain ?? 0.16;
  const { shadeLUT, lightLUT } = lightLUTs(L);
  const grain = fleece().grain, GN = fleece().N;
  const W = box.w, Hh = box.h;
  const lin = TO_LIN, srgb = TO_SRGB;
  for (let y = 0; y < Hh; y++) {
    let i = y * W;
    for (let x = 0; x < W; x++, i++) {
      const o = i * 4;
      const a = d[o + 3];
      if (!a) continue;
      let r = lin[d[o]], g = lin[d[o + 1]], b = lin[d[o + 2]];
      let sheen = KS;
      const pm = print[i];
      if (pm && printData) {
        // displaced bilinear sample of the print layer
        const sx = x + dispX[i] / 16, sy = y + dispY[i] / 16;
        let ix = Math.floor(sx), iy = Math.floor(sy);
        if (ix < 0) ix = 0; else if (ix > W - 2) ix = W - 2;
        if (iy < 0) iy = 0; else if (iy > Hh - 2) iy = Hh - 2;
        const fx = Math.min(1, Math.max(0, sx - ix)), fy = Math.min(1, Math.max(0, sy - iy));
        const q = (iy * W + ix) * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const q1 = q + 4, q2 = q + W * 4, q3 = q2 + 4;
        const pa0 = printData[q + 3] * w00, pa1 = printData[q1 + 3] * w10, pa2 = printData[q2 + 3] * w01, pa3 = printData[q3 + 3] * w11;
        const pa = pa0 + pa1 + pa2 + pa3;
        if (pa > 0) {
          const pr = (lin[printData[q]] * pa0 + lin[printData[q1]] * pa1 + lin[printData[q2]] * pa2 + lin[printData[q3]] * pa3) / pa;
          const pg = (lin[printData[q + 1]] * pa0 + lin[printData[q1 + 1]] * pa1 + lin[printData[q2 + 1]] * pa2 + lin[printData[q3 + 1]] * pa3) / pa;
          const pbb = (lin[printData[q + 2]] * pa0 + lin[printData[q1 + 2]] * pa1 + lin[printData[q2 + 2]] * pa2 + lin[printData[q3 + 2]] * pa3) / pa;
          // ink lays into the fleece: a little of the cloth shows through the print
          const gv = grain[((box.y0 + y) % GN) * GN + ((box.x0 + x) % GN)] / 255;
          const t = (pm / 255) * (pa / 255) * (1 - INK * gv);
          const diff = Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pbb - b);
          r += (pr - r) * t; g += (pg - g) * t; b += (pbb - b) * t;
          if (diff > 0.02) sheen = KS + (KSP - KS) * t;
        }
      }
      const l = lightLUT[light[i]];
      const irr = shadeLUT[shade[i]] + l;
      const sh = sheen * l;
      r = r * irr + sh; g = g * irr + sh; b = b * irr + sh;
      d[o] = srgb[r >= LUT_MAX ? LUT_N : (r * LUT_K) | 0];
      d[o + 1] = srgb[g >= LUT_MAX ? LUT_N : (g * LUT_K) | 0];
      d[o + 2] = srgb[b >= LUT_MAX ? LUT_N : (b * LUT_K) | 0];
    }
  }
  bake.outCtx.putImageData(img, 0, 0);
  const t3 = now();

  const out = opts.target || createCanvas(size);
  if (out.width !== size) { out.width = size; out.height = size; }
  const ox = ctx2d(out);
  ox.setTransform(1, 0, 0, 1, 0, 0);
  ox.clearRect(0, 0, size, size);
  if (opts.backdrop) ox.drawImage(backdropCanvas(size, opts.backdrop), 0, 0);
  if (opts.shadow !== false) {
    if (opts.backdrop) ox.globalCompositeOperation = "multiply";
    ox.drawImage(bake.drop, 0, 0);
    ox.globalCompositeOperation = "source-over";
  }
  ox.drawImage(bake.out, box.x0, box.y0);
  if (bake.metal) ox.drawImage(bake.metal, 0, 0);
  const t4 = now();
  if (timings) Object.assign(timings, { prepare: t1 - t0, fill: t2 - t1, composite: t3 - t2, output: t4 - t3, total: t4 - t0 });
  return out;
}

export function clearCaches() {
  bakeCache.map.clear();
  backdropCache.map.clear();
}
