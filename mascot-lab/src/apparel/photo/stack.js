// photo engine · the light STACK: everything soft, baked once per garment view and shared
// by every output size.
//
// Soft light is low-frequency, so it never needs the output resolution. Items are grouped
// by (layer, clip set, blur bucket); each group is rasterised at a resolution where its
// blur is only ~2.5 px, blurred there (cheap), and added into one ACCUMULATOR per panel
// (part) at STACK_RES px per artboard unit. A size bake then just draws each panel's
// accumulator, clipped to the panel, in paint order (see bake.js) — no per-size blurs.
//
//   stack = {
//     parts: Map(partId → { dark, light: canvas, x, y, w, h  (units) }),
//     relief: { gx, gy: Float32Array(HR²), HR }   fold slopes for print displacement
//     drop:   canvas (DROP_RES²)                   soft drop shadow, colour-independent
//     cost:   bytes (for the cache)
//   }
import { createCanvas, ctx2d, drawBlurred, CostLRU, now } from "./canvas.js";
import { ARTBOARD } from "./compile.js";

/** Accumulator resolution in px per artboard unit (1 → a 1000 px artboard). */
export const STACK_RES = 1;
/** Relief map resolution (whole artboard). */
const HR = 256;
/** Drop-shadow resolution (whole artboard). */
const DROP_RES = 500;
/** Blur buckets are 25% apart: invisible on soft light, and few blur passes. */
const BUCKET = 1.25;

const stacks = new CostLRU(160e6);

/** getStack(cv) → stack (cached; size-independent). */
export function getStack(cv, timings) {
  const hit = stacks.get(cv.key);
  if (hit) return hit;
  const t0 = now();
  const s = buildStack(cv);
  if (timings) timings.stack = now() - t0;
  return stacks.set(cv.key, s, s.cost);
}
export function clearStacks() { stacks.clear(); }

function buildStack(cv) {
  const R = STACK_RES;
  // one accumulator pair per part, covering its rect (+ a little margin for AA edges)
  const acc = new Map();
  let cost = 0;
  for (const p of cv.parts) {
    const x = Math.floor(p.rect.x0) - 3, y = Math.floor(p.rect.y0) - 3;
    const w = Math.ceil(p.rect.x1) + 3 - x, h = Math.ceil(p.rect.y1) + 3 - y;
    const dark = createCanvas(w * R, h * R), light = createCanvas(w * R, h * R);
    acc.set(p.id, { dark, light, dctx: ctx2d(dark), lctx: ctx2d(light), x, y, w, h });
    cost += 2 * w * h * R * R * 4;
  }

  paintGroups(cv, acc, R);
  paintUndulation(cv, acc, R);

  const relief = buildRelief(cv);
  const drop = buildDrop(cv);
  cost += HR * HR * 8 + DROP_RES * DROP_RES * 4;
  const parts = new Map();
  for (const [id, a] of acc) parts.set(id, { dark: a.dark, light: a.light, x: a.x, y: a.y, w: a.w, h: a.h });
  return { parts, relief, drop, cost };
}

/* ───────────────────────────── soft items → accumulators ───────────────────────────── */

const bucketOf = (b) => (b <= 0.3 ? 0 : Math.round(Math.log(b) / Math.log(BUCKET)));

function fillItem(x, it) {
  const col = it.layer === "light" ? "255,255,255" : "0,0,0";
  const a = it.alpha;
  if (it.grad) {
    const g = it.grad;
    const gr = g.type === "radial"
      ? x.createRadialGradient(g.x0, g.y0, g.r0 || 0, g.x1 ?? g.x0, g.y1 ?? g.y0, g.r1)
      : x.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
    for (const [t, ga] of g.stops) gr.addColorStop(Math.min(1, Math.max(0, t)), `rgba(${col},${Math.max(0, ga * a).toFixed(4)})`);
    x.fillStyle = gr;
  } else x.fillStyle = `rgba(${col},${a})`;
  x.fill(it.path);
}

function rectOfIds(cv, ids) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const r = cv.byId.get(id).rect;
    x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
  }
  return { x0, y0, x1, y1 };
}

function paintGroups(cv, acc, R) {
  const groups = new Map();
  for (const it of cv.light) {
    const b = bucketOf(it.blur);
    const key = `${it.layer}|${it.ids.join(",")}|${b}`;
    let g = groups.get(key);
    if (!g) { g = { layer: it.layer, ids: it.ids, blur: b ? BUCKET ** b : 0, items: [] }; groups.set(key, g); }
    g.items.push(it);
  }
  for (const g of groups.values()) {
    // resolution where this blur is ~2.5 px (never finer than the accumulators)
    const r = g.blur ? Math.min(R, Math.max(R / 14, 2.5 / g.blur)) : R;
    const m = Math.min(70, g.blur * 3 + 2);
    const cr = rectOfIds(cv, g.ids);
    const gx = Math.floor(cr.x0 - m), gy = Math.floor(cr.y0 - m);
    const gw = Math.ceil(cr.x1 + m) - gx, gh = Math.ceil(cr.y1 + m) - gy;
    const W = Math.max(2, Math.ceil(gw * r)), H = Math.max(2, Math.ceil(gh * r));
    const tmp = createCanvas(W, H);
    const tx = ctx2d(tmp);
    tx.setTransform(r, 0, 0, r, -gx * r, -gy * r);
    for (const it of g.items) fillItem(tx, it);
    let src = tmp;
    if (g.blur) {
      src = createCanvas(W, H);
      drawBlurred(ctx2d(src), tmp, g.blur * r);
    }
    for (const id of g.ids) {
      const a = acc.get(id);
      const x = g.layer === "light" ? a.lctx : a.dctx;
      x.imageSmoothingEnabled = true;
      x.drawImage(src, (gx - a.x) * R, (gy - a.y) * R, gw * R, gh * R);
    }
  }
}

/* ───────────────────────────── cloth undulation + heather ───────────────────────────── */

function lattice(seed, G) {
  const g = new Float32Array((G + 1) * (G + 1));
  let a = seed >>> 0;
  for (let i = 0; i < g.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    g[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
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
}

/** The undulation field (−1…1) on an N² grid over the artboard, cached per view. */
function undulationField(u, N) {
  const k = N / ARTBOARD;
  const G = 64, seed = u.seed ?? 5;
  const n1 = lattice(seed, G), n2 = lattice(seed + 17, G), w1 = lattice(seed + 31, G), m1 = lattice(seed + 47, G);
  const sc = u.scale || 34;                       // artboard units per drape wave (across)
  const stretch = u.stretch ?? 3;                 // waves are elongated along gravity
  const heather = u.heather ?? 0.25;              // isotropic low-frequency mottling (brushed fleece)
  const hs = u.heatherScale || sc * 1.6;
  const f = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ax = x / k, ay = y / k;
    // drape waves: vertical swells whose phase wanders slowly down the garment, their
    // strength breathing in and out — hanging cloth, not blotches
    const ph1 = w1(ax / (sc * 4) + 3, ay / (sc * stretch) + 5) * 2.4;
    const ph2 = n2(ax / (sc * 5) + 11, ay / (sc * stretch * 1.3) + 1) * 2.0;
    const env = 0.55 + 0.45 * n1(ax / (sc * 2.5) + 7, ay / (sc * stretch * 0.8) + 2);
    let v = (Math.sin((ax / sc) * 2.1 + ph1) * 0.65 + Math.sin((ax / sc) * 3.7 + ph2 + 1.3) * 0.35) * env;
    v += heather * m1(ax / hs + 19, ay / hs + 23);
    f[y * N + x] = Math.max(-1, Math.min(1, v));
  }
  return f;
}

function paintUndulation(cv, acc, R) {
  const u = cv.view.undulation;
  if (!u || !(u.amount > 0)) return;
  const N = 200, k = N / ARTBOARD;
  const f = undulationField(u, N);
  cv.undulation = { f, N };                       // reused by the relief map
  const dk = createCanvas(N), lt = createCanvas(N);
  const dx = ctx2d(dk, true), lx = ctx2d(lt, true);
  const di = dx.createImageData(N, N), li = lx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = f[i], o = i * 4;
    di.data[o + 3] = Math.round(Math.max(0, -v) * 255);
    li.data[o] = li.data[o + 1] = li.data[o + 2] = 255;
    li.data[o + 3] = Math.round(Math.max(0, v) * 255);
  }
  dx.putImageData(di, 0, 0);
  lx.putImageData(li, 0, 0);
  const skip = new Set(u.skip || []);
  const blurPx = (u.blur ?? 12) * k;
  for (const [layer, src, a] of [["dark", dk, u.amount], ["light", lt, u.amount * (u.lightRatio ?? 0.8)]]) {
    const b = createCanvas(N);
    drawBlurred(ctx2d(b), src, blurPx);
    for (const p of cv.parts) {
      if (skip.has(p.id) || p.texture === false) continue;
      const A = acc.get(p.id);
      const x = layer === "light" ? A.lctx : A.dctx;
      x.globalAlpha = a;
      x.imageSmoothingEnabled = true;
      x.drawImage(b, -A.x * R, -A.y * R, ARTBOARD * R, ARTBOARD * R);
      x.globalAlpha = 1;
    }
  }
}

/* ───────────────────────────── relief (print displacement) ───────────────────────────── */

/**
 * Fold relief: every light item with `fold > 0` (white = ridge, black = valley) on a mid
 * grey field, blurred, plus the undulation. Its slope is what bends prints.
 */
function buildRelief(cv) {
  const hk = HR / ARTBOARD;
  const H = createCanvas(HR);
  const hx = ctx2d(H, true);
  hx.fillStyle = "rgb(128,128,128)";
  hx.fillRect(0, 0, HR, HR);
  const byBlur = new Map();
  for (const it of cv.light) {
    if (!(it.fold > 0)) continue;
    const b = bucketOf(it.blur);
    if (!byBlur.has(b)) byBlur.set(b, []);
    byBlur.get(b).push(it);
  }
  for (const [b, items] of byBlur) {
    const t = createCanvas(HR);
    const tx = ctx2d(t);
    tx.setTransform(hk, 0, 0, hk, 0, 0);
    for (const it of items) {
      tx.globalAlpha = Math.min(1, it.alpha * it.fold);
      tx.fillStyle = it.layer === "light" ? "#fff" : "#000";
      tx.fill(it.path);
    }
    drawBlurred(hx, t, Math.max(1, ((b ? BUCKET ** b : 0) + 6) * hk));
  }
  const u = cv.view.undulation;
  if (cv.undulation && u) {
    const { f, N } = cv.undulation;
    const g = createCanvas(N);
    const gx = ctx2d(g, true);
    const gi = gx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = Math.round(128 + f[i] * 100), o = i * 4;
      gi.data[o] = gi.data[o + 1] = gi.data[o + 2] = v;
      gi.data[o + 3] = 255;
    }
    gx.putImageData(gi, 0, 0);
    hx.globalAlpha = u.relief ?? 0.5;
    hx.imageSmoothingEnabled = true;
    drawBlurred(hx, g, Math.max(1, (u.blur ?? 12) * hk), 0, 0, HR, HR);
    hx.globalAlpha = 1;
  }
  const Hb = createCanvas(HR);
  const hb = ctx2d(Hb, true);
  drawBlurred(hb, H, Math.max(1, 5 * hk));
  const d = hb.getImageData(0, 0, HR, HR).data;
  const h = new Float32Array(HR * HR);
  for (let i = 0; i < HR * HR; i++) h[i] = (d[i * 4] - 128) / 128;
  const gx = new Float32Array(HR * HR), gy = new Float32Array(HR * HR);
  for (let y = 1; y < HR - 1; y++) for (let x = 1; x < HR - 1; x++) {
    const i = y * HR + x;
    gx[i] = (h[i + 1] - h[i - 1]) * hk * 0.5;      // slope per artboard unit
    gy[i] = (h[i + HR] - h[i - HR]) * hk * 0.5;
  }
  return { gx, gy, HR };
}

/* ───────────────────────────── drop shadow ───────────────────────────── */

function buildDrop(cv) {
  const ds = cv.view.drop || {};
  const S = DROP_RES, k = S / ARTBOARD;
  const sil = cv.union(cv.allIds);
  const out = createCanvas(S);
  const ox = ctx2d(out);
  const t = createCanvas(S);
  const tx = ctx2d(t);
  for (const [offX, offY, blur, alpha] of ds.passes || [[9, 15, 22, 0.24], [3, 6, 7, 0.18], [1, 2, 1.8, 0.14]]) {
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.clearRect(0, 0, S, S);
    tx.setTransform(k, 0, 0, k, offX * k, offY * k);
    tx.fillStyle = `rgba(14,18,26,${alpha})`;
    tx.fill(sil);
    drawBlurred(ox, t, blur * k);
  }
  if (ds.floor) {
    // contact pool under the hem (the ghost mannequin hangs just in front of a sweep)
    const [cx, cy, rx, ry, a] = ds.floor;
    ox.save();
    ox.setTransform(k, 0, 0, k, 0, 0);
    ox.translate(cx, cy);
    ox.scale(1, ry / rx);
    const g = ox.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(14,18,26,${a})`);
    g.addColorStop(1, "rgba(14,18,26,0)");
    ox.fillStyle = g;
    ox.beginPath();
    ox.arc(0, 0, rx, 0, Math.PI * 2);
    ox.fill();
    ox.restore();
  }
  return out;
}
