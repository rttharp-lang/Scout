// photo engine · the per-size BAKE: colour-independent maps at one size bucket.
//
//   bake = {
//     B, k (px per unit), box { x0, y0, w, h } (px, the garment's pixel rect),
//     shade, light   Uint8(box)   light maps: shadow density / light amount
//     print          Uint8(box)   coverage where the TOPMOST part is printable
//     dispX, dispY   Int16(box)   print displacement in 1/16 px (fold slopes + wraps)
//     printBox       { x0, y0, x1, y1 } in box px (or null)
//     metal          { canvas, x, y } in bake px (or null)
//   }
//
// Light maps are built in PAINT ORDER, one part at a time: each part's soft-light
// accumulator (stack.js) is copied in clipped to the part (so a later part, like the
// pocket over the body or a cuff under the sleeve, replaces what lies beneath it), then
// that part's rib / fleece texture and every seam, stitch and edge whose clip includes
// the part are drawn, clipped to it. Occlusion falls out of the order: nothing needs a
// "visible region" mask.
import { createCanvas, ctx2d, CostLRU, now } from "./canvas.js";
import { ARTBOARD } from "./compile.js";
import { STACK_RES, getStack } from "./stack.js";
import { paintRib, paintGrain, paintSeams, paintStitches, paintEdges, paintCordCast, paintCordShade, paintMetal, metalRect } from "./detail.js";

/** Size buckets: bakes happen at a multiple of 40 px ≥ the requested size. */
export function sizeBucket(size) {
  return Math.max(80, Math.ceil(Math.round(size) / 40) * 40);
}

const bakes = new CostLRU(120e6);
export function clearBakes() { bakes.clear(); }

/** getBake(cv, B, timings) → bake (cached per garment view × size bucket). */
export function getBake(cv, B, timings) {
  const key = `${cv.key}|${B}`;
  const hit = bakes.get(key);
  if (hit) return hit;
  const t0 = now();
  const stack = getStack(cv, timings);
  const t1 = now();
  const b = bake(cv, B, stack);
  if (timings) { timings.bake = now() - t1; timings.prepare = now() - t0; }
  return bakes.set(key, b, b.cost);
}

function bake(cv, B, stack) {
  const k = B / ARTBOARD;
  const pad = 4;
  const box = {
    x0: Math.max(0, Math.floor(cv.bounds.x0 * k) - pad),
    y0: Math.max(0, Math.floor(cv.bounds.y0 * k) - pad),
  };
  box.w = Math.min(B, Math.ceil(cv.bounds.x1 * k) + pad) - box.x0;
  box.h = Math.min(B, Math.ceil(cv.bounds.y1 * k) + pad) - box.y0;
  const toBox = (x) => x.setTransform(k, 0, 0, k, -box.x0, -box.y0);

  const D = createCanvas(box.w, box.h), L = createCanvas(box.w, box.h);
  const dctx = ctx2d(D, true), lctx = ctx2d(L, true);
  toBox(dctx); toBox(lctx);

  // line details, pre-rendered once per clip set (they may span several parts)
  const details = renderDetailGroups(cv, k, box);
  const ribsByPart = new Map();
  for (const r of cv.ribs) { if (!ribsByPart.has(r.part)) ribsByPart.set(r.part, []); ribsByPart.get(r.part).push(r); }
  const cordsByPart = new Map(cv.cords.map((c) => [c.part, c]));
  // fleece grain fades in with size (at thumbnail scale it averages out to nothing)
  const grainAmt = Math.min(1, Math.max(0, (B - 380) / 640)) * (cv.view.grain ?? 1);
  const grainScale = Math.max(0.6, B / 1500);

  for (const p of cv.parts) {
    const cord = cordsByPart.get(p.id);
    if (cord) paintCordCast(dctx, cord, k);
    const a = stack.parts.get(p.id);
    for (const [x, src] of [[dctx, a.dark], [lctx, a.light]]) {
      x.save();
      x.clip(p.path);
      x.globalCompositeOperation = "copy";
      x.imageSmoothingEnabled = true;
      x.drawImage(src, a.x, a.y, src.width / STACK_RES, src.height / STACK_RES);
      x.restore();
    }
    dctx.save(); lctx.save();
    dctx.clip(p.path); lctx.clip(p.path);
    if (p.texture !== false && grainAmt > 0) paintGrain(dctx, lctx, grainAmt * (p.grain ?? 1), grainScale);
    for (const r of ribsByPart.get(p.id) || []) paintRib(dctx, lctx, r, k);
    if (cord) paintCordShade(dctx, lctx, cord, k);
    for (const g of details) {
      if (!g.ids.has(p.id)) continue;
      for (const [x, src] of [[dctx, g.dark], [lctx, g.light]]) {
        x.save();
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.drawImage(src, g.x, g.y);
        x.restore();
      }
    }
    dctx.restore(); lctx.restore();
  }

  // metal hardware: lit RGBA over everything + contact shadows into the dark map
  let metal = null;
  const mr = cv.metal.length ? metalRect(cv.metal) : null;
  if (mr) {
    const mx0 = Math.floor(mr.x0 * k) - 2, my0 = Math.floor(mr.y0 * k) - 2;
    const mc = createCanvas(Math.ceil(mr.x1 * k) + 2 - mx0, Math.ceil(mr.y1 * k) + 2 - my0);
    const mctx = ctx2d(mc);
    mctx.setTransform(k, 0, 0, k, -mx0, -my0);
    paintMetal(mctx, dctx, cv.metal, k);
    metal = { canvas: mc, x: mx0, y: my0 };
  }

  const shade = alphaOf(dctx, box);
  const light = alphaOf(lctx, box);

  // print coverage: where the topmost part is printable
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, box.w, box.h);
  toBox(dctx);
  for (const p of cv.parts) {
    dctx.globalCompositeOperation = cv.printSet.has(p.id) ? "source-over" : "destination-out";
    dctx.fillStyle = "#fff";
    dctx.fill(p.path);
  }
  dctx.globalCompositeOperation = "source-over";
  const print = alphaOf(dctx, box);
  let pb = { x0: box.w, y0: box.h, x1: -1, y1: -1 };
  for (let y = 0; y < box.h; y++) {
    const row = y * box.w;
    for (let x = 0; x < box.w; x++) {
      if (print[row + x]) { if (x < pb.x0) pb.x0 = x; if (x > pb.x1) pb.x1 = x; if (y < pb.y0) pb.y0 = y; if (y > pb.y1) pb.y1 = y; }
    }
  }
  if (pb.x1 < pb.x0) pb = null;
  const disp = displacement(cv, stack.relief, k, box, print, pb);

  const n = box.w * box.h;
  return {
    B, k, box, shade, light, print, dispX: disp.x, dispY: disp.y, printBox: pb, metal,
    cost: n * 7 + (metal ? metal.canvas.width * metal.canvas.height * 4 : 0) + 4096,
  };
}

function alphaOf(ctx, box) {
  const img = ctx.getImageData(0, 0, box.w, box.h).data;
  const n = box.w * box.h, out = new Uint8Array(n);
  for (let i = 0, j = 3; i < n; i++, j += 4) out[i] = img[j];
  return out;
}

/**
 * Seams, stitches and edges grouped by clip set and drawn once, sharp, into small
 * canvases covering just their lines. Each part then stamps the groups it belongs to.
 */
function renderDetailGroups(cv, k, box) {
  const groups = new Map();
  const add = (kind, list) => {
    for (const s of list) {
      const key = s.ids.join(",");
      if (!groups.has(key)) groups.set(key, { ids: new Set(s.ids), seams: [], stitches: [], edges: [] });
      groups.get(key)[kind].push(s);
    }
  };
  add("seams", cv.seams);
  add("stitches", cv.stitches);
  add("edges", cv.edges);
  const out = [];
  for (const g of groups.values()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of [...g.seams, ...g.stitches, ...g.edges]) {
      const m = Math.max(8, (s.w ?? 3) * 4 + (s.blur ?? 0) * 3 + (s.gap ?? 0));
      for (const [x, y] of s.pts) { x0 = Math.min(x0, x - m); y0 = Math.min(y0, y - m); x1 = Math.max(x1, x + m); y1 = Math.max(y1, y + m); }
    }
    const px0 = Math.max(0, Math.floor(x0 * k) - box.x0), py0 = Math.max(0, Math.floor(y0 * k) - box.y0);
    const px1 = Math.min(box.w, Math.ceil(x1 * k) - box.x0), py1 = Math.min(box.h, Math.ceil(y1 * k) - box.y0);
    if (px1 <= px0 || py1 <= py0) continue;
    const dark = createCanvas(px1 - px0, py1 - py0), light = createCanvas(px1 - px0, py1 - py0);
    const dx = ctx2d(dark), lx = ctx2d(light);
    for (const x of [dx, lx]) x.setTransform(k, 0, 0, k, -box.x0 - px0, -box.y0 - py0);
    if (g.edges.length) paintEdges(dx, lx, g.edges, k);
    if (g.seams.length) paintSeams(dx, lx, g.seams, k);
    if (g.stitches.length) paintStitches(dx, lx, g.stitches, k);
    out.push({ ids: g.ids, dark, light, x: px0, y: py0 });
  }
  return out;
}

/**
 * Print displacement per printable pixel: −∇(fold relief) × strength (the print slides
 * off ridges into valleys, as ink on draped cloth appears to) plus cylinder wraps (a flat
 * print sampled at arc length, compressing where the body turns away).
 */
function displacement(cv, relief, k, box, print, pb) {
  const n = box.w * box.h;
  const dxA = new Int16Array(n), dyA = new Int16Array(n);
  if (!pb) return { x: dxA, y: dyA };
  const { gx, gy, HR } = relief;
  const hk = HR / ARTBOARD;
  const strength = cv.view.relief ?? 300;            // artboard units per unit slope
  const wraps = cv.view.wraps || [];
  const SUB = 16;
  for (let y = pb.y0; y <= pb.y1; y++) {
    const ay = (box.y0 + y + 0.5) / k;
    const fy = ay * hk - 0.5;
    const y0 = Math.max(0, Math.min(HR - 2, Math.floor(fy))), ty = Math.min(1, Math.max(0, fy - y0));
    for (let x = pb.x0; x <= pb.x1; x++) {
      const i = y * box.w + x;
      if (!print[i]) continue;
      const ax = (box.x0 + x + 0.5) / k;
      const fx = ax * hk - 0.5;
      const x0 = Math.max(0, Math.min(HR - 2, Math.floor(fx))), tx = Math.min(1, Math.max(0, fx - x0));
      const j = y0 * HR + x0;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      let ddx = -(gx[j] * w00 + gx[j + 1] * w10 + gx[j + HR] * w01 + gx[j + HR + 1] * w11) * strength;
      let ddy = -(gy[j] * w00 + gy[j + 1] * w10 + gy[j + HR] * w01 + gy[j + HR + 1] * w11) * strength;
      for (const w of wraps) {
        if (ay < w.y0 || ay > w.y1) continue;
        const u = (ax - w.cx) / w.r;
        if (Math.abs(u) >= 0.999) continue;
        const fade = Math.min(1, (ay - w.y0) / (w.feather || 1), (w.y1 - ay) / (w.feather || 1));
        ddx += (w.r * Math.asin(u) - (ax - w.cx)) * (w.amount ?? 1) * fade;
      }
      dxA[i] = Math.max(-32000, Math.min(32000, Math.round(ddx * k * SUB)));
      dyA[i] = Math.max(-32000, Math.min(32000, Math.round(ddy * k * SUB)));
    }
  }
  return { x: dxA, y: dyA };
}
