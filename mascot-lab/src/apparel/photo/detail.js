// photo engine · procedural surface detail, drawn sharp at the bake size.
//
// Every painter draws into a light map context whose transform maps artboard units to
// bake pixels. "dark" contexts collect shadow (black, alpha = density), "light" contexts
// collect light (white, alpha = amount). Nothing here depends on colour.
import { createCanvas, ctx2d, softStroke, polyPath } from "./canvas.js";
import { normals } from "./geom.js";
import { LIGHT } from "./light.js";

/* ───────────────────────────── tiles ───────────────────────────── */

let fleece = null;
/**
 * Fleece grain (256² tileable). Borrowed from the height-field prototype: a fine,
 * slightly vertical (knit-wale) relief LIT by the key light — its slope towards the
 * light becomes a light/dark speckle — so the grain reads as brushed cloth catching
 * light, not as random noise. `grain` (0–255) is the raw relief, used for ink texture.
 */
export function fleeceTiles() {
  if (fleece) return fleece;
  const N = 256;
  const lattice = (seed, GX, GY) => {
    const g = new Float32Array(GX * GY);
    let a = seed >>> 0;
    for (let i = 0; i < g.length; i++) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      g[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return (x, y) => {
      const fx = (x / N) * GX, fy = (y / N) * GY;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[(((j % GY) + GY) % GY) * GX + (((i % GX) + GX) % GX)];
      const a0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const a1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a0 + (a1 - a0) * sy;
    };
  };
  // fine wales (taller than wide), a finer fuzz, and a soft mid octave
  const wale = lattice(11, 176, 112), fuzz = lattice(29, 256, 256), mid = lattice(23, 48, 40);
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    h[y * N + x] = wale(x, y) * 0.5 + fuzz(x, y) * 0.3 + mid(x, y) * 0.2;
  }
  const dark = createCanvas(N), light = createCanvas(N);
  const dx = ctx2d(dark, true), lx = ctx2d(light, true);
  const di = dx.createImageData(N, N), li = lx.createImageData(N, N);
  const grain = new Uint8Array(N * N);
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    // slope towards the light (central differences) + a little albedo fuzz
    const s = ((at(x + 1, y) - at(x - 1, y)) * -LIGHT[0] + (at(x, y + 1) - at(x, y - 1)) * -LIGHT[1]) * 3.2
      + (fuzz(x * 1.9 + 31, y * 1.9 + 7) - 0.5) * 0.5;
    // s > 0: the facet tilts towards the light (brightness ∝ −∇h · LIGHT)
    di.data[o + 3] = Math.round(Math.min(1, Math.max(0, -s)) * 255);
    li.data[o] = li.data[o + 1] = li.data[o + 2] = 255;
    li.data[o + 3] = Math.round(Math.min(1, Math.max(0, s)) * 255);
    grain[i] = Math.round(Math.min(1, Math.max(0, (h[i] - 0.5) * 2.6 + 0.5)) * 255);
  }
  dx.putImageData(di, 0, 0);
  lx.putImageData(li, 0, 0);
  fleece = { dark, light, grain, N };
  return fleece;
}

const ribCache = new Map();
/** Rib-knit stripe tiles (dark grooves / light wales) for a wale period in px. */
function ribTiles(periodPx) {
  const key = Math.round(periodPx * 8) / 8;
  let t = ribCache.get(key);
  if (t) return t;
  const reps = Math.max(1, Math.ceil(24 / key));
  const W = Math.max(2, Math.round(key * reps));
  const per = W / reps;
  const dark = createCanvas(W, 4), light = createCanvas(W, 4);
  const dx = ctx2d(dark), lx = ctx2d(light);
  for (let x = 0; x < W; x++) {
    const s = Math.sin(((x + 0.5) / per) * Math.PI * 2);
    dx.fillStyle = `rgba(0,0,0,${(Math.max(0, -s) ** 1.6).toFixed(3)})`;
    dx.fillRect(x, 0, 1, 4);
    lx.fillStyle = `rgba(255,255,255,${(Math.max(0, s) ** 2.2).toFixed(3)})`;
    lx.fillRect(x, 0, 1, 4);
  }
  t = { dark, light };
  ribCache.set(key, t);
  return t;
}

/* ───────────────────────────── per-part textures ───────────────────────────── */

/**
 * Rib knit on one part (ctx already clipped to the part, transform = units → px).
 * Straight ribs: wales at `angle` degrees (90 = vertical). `follow` ribs: wales
 * perpendicular to a centre line (curved bindings, collars).
 */
export function paintRib(dctx, lctx, rib, k) {
  const periodPx = (rib.period || 3) * k;
  // band-limit: below ~1.6 px a wale cannot be drawn without aliasing → fade it out
  const amp = Math.min(1, Math.max(0, (periodPx - 1.4) / 1.6));
  if (amp <= 0) return;
  const depth = (rib.depth ?? 0.35) * amp;
  if (rib.followPath) {
    const pitch = rib.period || 3;
    for (const [x, col, a, on, phase] of [[dctx, "0,0,0", depth, 0.42, 0], [lctx, "255,255,255", depth * 0.55, 0.22, 0.5]]) {
      x.save();
      x.lineCap = "butt";
      x.setLineDash([pitch * on, pitch * (1 - on)]);
      x.lineDashOffset = -pitch * phase;
      x.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
      x.lineWidth = rib.width || 40;
      x.stroke(rib.followPath);
      x.restore();
    }
    return;
  }
  const t = ribTiles(periodPx);
  for (const [x, tile, a] of [[dctx, t.dark, depth], [lctx, t.light, depth * 0.55]]) {
    x.save();
    const m = x.getTransform();
    x.setTransform(1, 0, 0, 1, 0, 0);
    const pat = x.createPattern(tile, "repeat");
    pat.setTransform(new DOMMatrix().rotate((rib.angle ?? 90) - 90));
    x.globalAlpha = a;
    x.fillStyle = pat;
    x.fillRect(0, 0, x.canvas.width, x.canvas.height);
    x.setTransform(m);
    x.restore();
  }
}

/** Fleece grain on one part (ctx clipped). `amt` fades it with output size. */
export function paintGrain(dctx, lctx, amt, scale) {
  if (amt <= 0) return;
  const f = fleeceTiles();
  for (const [x, tile, a] of [[dctx, f.dark, 0.075 * amt], [lctx, f.light, 0.05 * amt]]) {
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    const pat = x.createPattern(tile, "repeat");
    pat.setTransform(new DOMMatrix().scale(scale));
    x.globalAlpha = a;
    x.fillStyle = pat;
    x.fillRect(0, 0, x.canvas.width, x.canvas.height);
    x.restore();
  }
}

/* ───────────────────────────── line details ───────────────────────────── */

/** Offset a polyline towards the side that faces the key light. */
function litOffset(pts, d) {
  const nr = normals(pts);
  let s = 0;
  for (const n of nr) s += n[0] * LIGHT[0] + n[1] * LIGHT[1];
  const sign = s >= 0 ? 1 : -1;
  return pts.map((p, i) => [p[0] + nr[i][0] * d * sign, p[1] + nr[i][1] * d * sign]);
}
function offsetPts(pts, d) {
  const nr = normals(pts);
  return pts.map((p, i) => [p[0] + nr[i][0] * d, p[1] + nr[i][1] * d]);
}

/**
 * Seams: a soft groove (dark core + wider shade) with a lit ridge on the side facing the
 * light. `w` = groove width (units), `depth` = 0–1.
 */
export function paintSeams(dctx, lctx, list, k) {
  const fade = Math.min(1, Math.max(0.35, (k * 1000 - 200) / 600));
  for (const x of [dctx, lctx]) { x.lineCap = "round"; x.lineJoin = "round"; }
  for (const s of list) {
    const w = s.w ?? 1.5, depth = (s.depth ?? 0.5) * fade;
    dctx.strokeStyle = `rgba(0,0,0,${depth})`;
    softStroke(dctx, s.path, w, Math.max(0.35, 0.55 * k));
    dctx.strokeStyle = `rgba(0,0,0,${depth * 0.35})`;
    softStroke(dctx, s.path, w * 3.2, Math.max(0.5, 2 * k));
    lctx.strokeStyle = `rgba(255,255,255,${depth * 0.55})`;
    softStroke(lctx, polyPath(litOffset(s.pts, w * 1.25), false), w * 0.9, Math.max(0.35, 0.45 * k));
  }
}

/** Twin-needle cover stitching: per row a thread highlight dash + a needle-hole shadow dash. */
export function paintStitches(dctx, lctx, list, k) {
  for (const s of list) {
    const len = s.len ?? 2.6, space = s.space ?? 1.5;
    const visible = Math.min(1, Math.max(0, (len * k - 1.2) / 2.2));
    if (visible <= 0) continue;
    const rows = s.twin === false ? [0] : [-(s.gap ?? 4.5) / 2, (s.gap ?? 4.5) / 2];
    const a = (s.alpha ?? 1) * visible;
    for (const off of rows) {
      const pts = off ? offsetPts(s.pts, off) : s.pts;
      for (const [x, dark] of [[dctx, true], [lctx, false]]) {
        x.save();
        x.lineCap = "butt";
        x.setLineDash([len, space]);
        x.lineDashOffset = s.phase ?? 0;
        if (dark) {
          x.strokeStyle = `rgba(0,0,0,${0.42 * a})`;
          x.lineWidth = s.thread ? s.thread * 1.2 : 1.15;
          x.stroke(polyPath(pts.map(([px, py]) => [px - LIGHT[0] * 0.55, py - LIGHT[1] * 0.55]), false));
        } else {
          x.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
          x.lineWidth = s.thread || 0.95;
          x.stroke(polyPath(pts, false));
        }
        x.restore();
      }
    }
  }
}

/** Soft contour light/shade (a rim light on edges facing the key, falloff on the far side). */
export function paintEdges(dctx, lctx, list, k) {
  for (const e of list) {
    const dark = e.layer === "dark";
    const x = dark ? dctx : lctx;
    x.save();
    x.lineCap = "round"; x.lineJoin = "round";
    x.strokeStyle = dark ? `rgba(0,0,0,${e.alpha ?? 0.3})` : `rgba(255,255,255,${e.alpha ?? 0.25})`;
    softStroke(x, e.path, e.w ?? 3, Math.max(0.4, (e.blur ?? 1.5) * k));
    x.restore();
  }
}

/* ───────────────────────────── cords ───────────────────────────── */

/** The cord's shadow on whatever lies beneath (drawn BEFORE the cord's own light). */
export function paintCordCast(dctx, c, k) {
  const w = c.w;
  dctx.save();
  dctx.lineCap = "round";
  dctx.strokeStyle = "rgba(0,0,0,0.6)";
  softStroke(dctx, polyPath(c.pts.map(([x, y]) => [x - LIGHT[0] * w * 0.9, y - LIGHT[1] * w * 0.9]), false), w * 1.05, w * 0.55 * k);
  dctx.strokeStyle = "rgba(0,0,0,0.22)";
  softStroke(dctx, polyPath(c.pts.map(([x, y]) => [x - LIGHT[0] * w * 1.8, y - LIGHT[1] * w * 1.8]), false), w * 1.6, w * 1.4 * k);
  dctx.restore();
}

/** Round braided cord: cylinder shading across it and a herringbone braid along it. */
export function paintCordShade(dctx, lctx, c, k) {
  const w = c.w;
  for (const [x, pts, lw, a, b, light] of [
    [dctx, litOffset(c.pts, -w * 0.3), w * 0.5, 0.5, 0.18, false],
    [dctx, litOffset(c.pts, -w * 0.48), w * 0.16, 0.55, 0.06, false],
    [lctx, litOffset(c.pts, w * 0.22), w * 0.26, 0.42, 0.1, true],
  ]) {
    x.save();
    x.lineCap = "round";
    x.strokeStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    softStroke(x, polyPath(pts, false), lw, Math.max(0.3, w * b * k));
    x.restore();
  }
  const pitch = c.pitch ?? w * 0.62;
  if (pitch * k < 1.6) return;
  const nr = normals(c.pts);
  let L = 0;
  for (let i = 1; i < c.pts.length; i++) L += Math.hypot(c.pts[i][0] - c.pts[i - 1][0], c.pts[i][1] - c.pts[i - 1][1]);
  for (const [x, dark] of [[dctx, true], [lctx, false]]) {
    x.save();
    x.lineCap = "round";
    x.lineWidth = w * (dark ? 0.16 : 0.11);
    x.strokeStyle = dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.32)";
    x.beginPath();
    let i = 0;
    for (let s = pitch * 0.5; s < L; s += pitch, i++) {
      const { p, t, n } = atLen(c.pts, nr, s);
      const side = i % 2 ? 1 : -1;
      const sl = pitch * 0.55;
      const off = dark ? -pitch * 0.18 : pitch * 0.12;
      const a0 = [p[0] + t[0] * off, p[1] + t[1] * off];
      x.moveTo(a0[0], a0[1]);
      x.lineTo(a0[0] + n[0] * side * w * 0.5 + t[0] * sl, a0[1] + n[1] * side * w * 0.5 + t[1] * sl);
    }
    x.stroke();
    x.restore();
  }
}
function atLen(pts, nr, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === pts.length - 1) {
      const f = L ? Math.min(1, s / L) : 0;
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)], n: nr[i] };
    }
    s -= L;
  }
  return { p: pts.at(-1), t: [0, 1], n: nr.at(-1) };
}

/* ───────────────────────────── metal hardware ───────────────────────────── */

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

/** Bounding rect (units) of the metal items, or null. */
export function metalRect(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const it of items) {
    if (it.type === "aglet") for (const p of it.pts) add(p[0], p[1], it.w * 1.5);
    else if (it.type === "eyelet") add(it.c[0], it.c[1], it.r * 1.5);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/**
 * Metal hardware (aglets, eyelets): fully lit, colour-independent RGBA drawn last over the
 * garment (mctx); their contact shadows go into the dark map (dctx).
 */
export function paintMetal(mctx, dctx, items, k) {
  const blob = (build, blur, alpha) => {
    dctx.save();
    dctx.filter = `blur(${Math.max(0.4, blur * k).toFixed(2)}px)`;
    dctx.fillStyle = `rgba(0,0,0,${alpha})`;
    build(dctx);
    dctx.fill();
    dctx.restore();
  };
  const x = mctx;
  for (const it of items) {
    if (it.type === "aglet") {
      const [p0, p1] = it.pts;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx), r = it.w / 2;
      blob((c) => {
        c.translate(p0[0] - LIGHT[0] * r * 1.4, p0[1] - LIGHT[1] * r * 1.4);
        c.rotate(ang);
        roundRect(c, -r * 0.2, -r * 1.05, L + r * 0.6, r * 2.1, r);
      }, r * 0.9, 0.5);
      x.save();
      x.translate(p0[0], p0[1]);
      x.rotate(ang);
      const g = x.createLinearGradient(0, -r, 0, r);
      const litTop = Math.sin(ang) * LIGHT[0] - Math.cos(ang) * LIGHT[1] < 0;
      for (const [t, c] of [[0, "#3c3f44"], [0.16, "#9aa0a8"], [0.3, "#f4f6f8"], [0.42, "#b9bec5"], [0.62, "#6d737b"], [0.86, "#2c2f33"], [1, "#4a4e54"]]) g.addColorStop(litTop ? t : 1 - t, c);
      x.fillStyle = g;
      roundRect(x, 0, -r, L, r * 2, r * 0.35);
      x.fill();
      x.fillStyle = "rgba(0,0,0,0.28)";                 // crimp rings near the cord end
      x.fillRect(L * 0.1, -r, L * 0.035, r * 2);
      x.fillRect(L * 0.17, -r, L * 0.025, r * 2);
      const tip = x.createLinearGradient(L - r * 0.6, 0, L, 0);
      tip.addColorStop(0, "rgba(0,0,0,0)");
      tip.addColorStop(1, "rgba(0,0,0,0.35)");
      x.fillStyle = tip;
      roundRect(x, 0, -r, L, r * 2, r * 0.35);
      x.fill();
      x.fillStyle = "rgba(255,255,255,0.9)";             // specular glint
      x.beginPath();
      x.ellipse(L * 0.42, litTop ? -r * 0.4 : r * 0.4, L * 0.16, r * 0.1, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    } else if (it.type === "eyelet") {
      const [cx, cy] = it.c;
      const R = it.r, ri = it.ri ?? R * 0.58;
      blob((c) => { c.beginPath(); c.arc(cx - LIGHT[0] * R * 0.35, cy - LIGHT[1] * R * 0.35, R * 1.08, 0, Math.PI * 2); }, R * 0.35, 0.55);
      x.save();
      const g = x.createLinearGradient(cx + LIGHT[0] * R, cy + LIGHT[1] * R, cx - LIGHT[0] * R, cy - LIGHT[1] * R);
      g.addColorStop(0, "#f2f4f6"); g.addColorStop(0.35, "#a9afb7"); g.addColorStop(0.7, "#5d636b"); g.addColorStop(1, "#2a2d31");
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.arc(cx, cy, ri, 0, Math.PI * 2, true); x.fill("evenodd");
      const g2 = x.createLinearGradient(cx + LIGHT[0] * ri, cy + LIGHT[1] * ri, cx - LIGHT[0] * ri, cy - LIGHT[1] * ri);
      g2.addColorStop(0, "#33373c"); g2.addColorStop(1, "#d8dce0");
      x.strokeStyle = g2;
      x.lineWidth = Math.max(0.35, R * 0.16);
      x.beginPath(); x.arc(cx, cy, ri + R * 0.08, 0, Math.PI * 2); x.stroke();
      x.fillStyle = "rgba(255,255,255,0.85)";
      x.beginPath(); x.ellipse(cx + LIGHT[0] * R * 0.62, cy + LIGHT[1] * R * 0.62, R * 0.2, R * 0.09, Math.atan2(LIGHT[1], LIGHT[0]) + Math.PI / 2, 0, Math.PI * 2); x.fill();
      x.restore();
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
}
