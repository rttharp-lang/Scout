// proto-b · geometry kit (pure math, no canvas, no DOM).
//
// Garments are authored in INCHES (x right of centre front, y down from the high point
// shoulder) so the pattern can be checked against a spec sheet; `inchFrame()` maps them
// onto the 1000×1000 artboard the renderer and the placement model use.
//
// Everything is a polyline: Array<[x, y]>. Smooth curves are sampled densely so they can
// be offset, sliced, mirrored and measured like any other polyline.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Cubic bezier p0→p3 sampled into n+1 points. */
export function cubic(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

/**
 * Centripetal Catmull-Rom spline through `pts` (open unless `closed`), `seg` samples per
 * span. The workhorse for authoring: give it the key points of a contour, get a smooth curve.
 */
export function spline(pts, seg = 12, closed = false) {
  const n = pts.length;
  if (n < 3) return pts.map((p) => [...p]);
  const P = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i >= n) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
    return pts[i];
  };
  const out = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d = (a, b) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let j = 0; j < seg; j++) {
      const t = t1 + ((t2 - t1) * j) / seg;
      const A1 = mixp(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
      const A2 = mixp(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
      const A3 = mixp(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
      const B1 = mixp(A1, A2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
      const B2 = mixp(A2, A3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
      out.push(mixp(B1, B2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)));
    }
  }
  if (!closed) out.push([...pts[n - 1]]);
  return out;
}
const mixp = (a, b, wa, wb) => [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];

export const line = (a, b, n = 2) => {
  const out = [];
  for (let i = 0; i <= n; i++) out.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  return out;
};

/** Join polylines end to start, dropping duplicated joints. */
export function join(...segs) {
  const out = [];
  for (const s of segs) for (const p of s) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-4) out.push([p[0], p[1]]);
  }
  return out;
}
export const rev = (pts) => [...pts].reverse();
/** Mirror across the centre line x = 0 (inch space). */
export const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
export const mirrorPt = ([x, y]) => [-x, y];
export const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const add = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k];

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Point + unit tangent at fraction t of the length. */
export function along(pts, t) {
  const total = polyLength(pts);
  let want = clamp(t, 0, 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (want <= L || i === pts.length - 1) {
      const k = L ? Math.min(1, want / L) : 0;
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)] };
    }
    want -= L;
  }
  return { p: pts.at(-1), t: [0, 1] };
}

/** Evenly re-sample a polyline into n+1 points. */
export function resample(pts, n = 32) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(along(pts, i / n).p);
  return out;
}
/** Sub-polyline between fractions t0..t1 of the length. */
export function slice(pts, t0, t1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(along(pts, lerp(t0, t1, i / n)).p);
  return out;
}

/** Per-point unit normals (left of travel in y-down space = (ty, -tx)). */
export function normals(pts) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [dy / L, -dx / L];
  });
}

/** Parallel offset (positive = along normals()). Mitre-limited. */
export function offset(pts, d) {
  const nr = normals(pts);
  return pts.map((p, i) => [p[0] + nr[i][0] * d, p[1] + nr[i][1] * d]);
}

/**
 * Variable-width ribbon around a centre line → closed polygon. `w` is a width profile:
 * a number, or an array of widths spread evenly along the length (interpolated), or a
 * function t → width. Used for brush strokes (folds), cords, bands, rims.
 */
export function ribbon(pts, w, bias = 0) {
  const n = pts.length - 1;
  const W = profile(w);
  const nr = normals(pts);
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0, hw = W(t) / 2, c = bias * hw;
    L.push([pts[i][0] + nr[i][0] * (hw + c), pts[i][1] + nr[i][1] * (hw + c)]);
    R.push([pts[i][0] - nr[i][0] * (hw - c), pts[i][1] - nr[i][1] * (hw - c)]);
  }
  return join(L, rev(R));
}
export function profile(w) {
  if (typeof w === "function") return w;
  if (typeof w === "number") return () => w;
  const k = w.length - 1;
  return (t) => {
    const x = clamp(t, 0, 1) * k, i = Math.min(k - 1, Math.floor(x)), f = x - i;
    return lerp(w[i], w[i + 1], f);
  };
}
/** Brush taper: 0 → full → 0 with soft (sin) ends; `a`/`b` = fraction of length tapering. */
export const taper = (w, a = 0.3, b = 0.3) => (t) =>
  w * (t < a ? Math.sin((t / a) * Math.PI / 2) : t > 1 - b ? Math.sin(((1 - t) / b) * Math.PI / 2) : 1);

/** Ellipse polygon (optionally rotated, radians). */
export function ellipse(cx, cy, rx, ry = rx, rot = 0, n = 48) {
  const c = Math.cos(rot), s = Math.sin(rot), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

export function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** Horizontal extent of a closed polygon at height y: [xmin, xmax] or null. */
export function spanAtY(poly, y) {
  const xs = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
    if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  }
  if (!xs.length) return null;
  return [Math.min(...xs), Math.max(...xs)];
}

/** Point where a polyline first crosses y = Y (or null). */
export function atY(pts, Y) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if ((y0 - Y) * (y1 - Y) <= 0 && y0 !== y1) return [x0 + ((Y - y0) / (y1 - y0)) * (x1 - x0), Y];
  }
  return null;
}

/** Nearest distance from p to a polyline. */
export function distTo(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((p[0] - ax) * dx + (p[1] - ay) * dy) / L2, 0, 1);
    best = Math.min(best, Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t)));
  }
  return best;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * inchFrame({ unit, cx, y0 }) → helpers that map inch-space geometry to artboard units:
 *   P(pts) maps a polyline, p(pt) one point, u(v) a length; box(x, y, w, h) a zone.
 */
export function inchFrame({ unit = 20, cx = 500, y0 = 300 } = {}) {
  const p = ([x, y]) => [cx + x * unit, y0 + y * unit];
  return {
    unit, cx, y0,
    p,
    P: (pts) => pts.map(p),
    u: (v) => v * unit,
    box: (x, y, w, h, label) => ({ x: Math.round(cx + x * unit), y: Math.round(y0 + y * unit), w: Math.round(w * unit), h: Math.round(h * unit), label }),
    toInch: ([x, y]) => [(x - cx) / unit, (y - y0) / unit],
  };
}
