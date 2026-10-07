// proto-a · geometry kit (pure math, no DOM). Garments are authored in INCHES with
// x → viewer's right, y ↓, origin at the centre-front, high-point-shoulder level.
// Polylines are arrays of [x, y]; closed polygons repeat nothing (closure is implied).

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Sample a cubic bezier p0→p3 into n+1 points. */
export function cubic(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

/** Centripetal-ish Catmull-Rom spline through points (open), `per` samples per span. */
export function spline(pts, per = 10) {
  if (pts.length < 3) return line(pts[0], pts[pts.length - 1], per);
  const out = [];
  const P = (i) => pts[clamp(i, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    // tangent-scaled bezier handles (uniform CR, tension 0.5)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const seg = cubic(p1, c1, c2, p2, per);
    if (i > 0) seg.shift();
    out.push(...seg);
  }
  return out;
}

/** Closed Catmull-Rom spline (loop through all points). */
export function splineClosed(pts, per = 10) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const seg = cubic(p1, c1, c2, p2, per);
    seg.pop();
    out.push(...seg);
  }
  return out;
}

export const line = (a, b, n = 2) => {
  const out = [];
  for (let i = 0; i <= n; i++) out.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  return out;
};

/** Join polylines end to start, dropping duplicated joint points. */
export function join(...segs) {
  const out = [];
  for (const s of segs) for (const p of s) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-4) out.push(p);
  }
  return out;
}
export const rev = (pts) => [...pts].reverse();
export const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
export const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const norm = (v) => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
export const perp = (v) => [-v[1], v[0]];            // rotate +90° (screen: right of travel when y down → use −perp)
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const dirDeg = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)]; // angle from vertical (down)

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i], pts[i - 1]);
  return L;
}

/** Point + unit tangent at arc-length fraction t. */
export function along(pts, t) {
  const total = polyLength(pts);
  let want = clamp(t, 0, 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = dist(a, b);
    if (want <= L || i === pts.length - 1) {
      const k = L ? Math.min(1, want / L) : 0;
      return { p: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], t: norm(sub(b, a)) };
    }
    want -= L;
  }
  return { p: pts[pts.length - 1], t: [0, 1] };
}

/** Sub-polyline between arc fractions t0..t1. */
export function slice(pts, t0, t1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(along(pts, lerp(t0, t1, i / n)).p);
  return out;
}

/** Resample to n+1 evenly spaced points. */
export const resample = (pts, n) => slice(pts, 0, 1, n);

/**
 * Parallel offset by d (positive = LEFT of travel on screen when y points down,
 * i.e. along (dy, −dx)… we use normal (−ty, tx) rotated so +d is to the right of travel).
 * Convention here: +d moves to the right-hand side of the direction of travel as seen
 * on screen (y down). Corners are mitred (limited).
 */
export function offset(pts, d) {
  const n = pts.length;
  const nrm = [];
  for (let i = 0; i < n - 1; i++) {
    const t = norm(sub(pts[i + 1], pts[i]));
    nrm.push([-t[1], t[0]]);               // right of travel on a y-down screen
  }
  return pts.map((p, i) => {
    const a = nrm[Math.max(0, i - 1)], b = nrm[Math.min(nrm.length - 1, i)];
    let m = norm([a[0] + b[0], a[1] + b[1]]);
    const dot = Math.max(0.4, m[0] * b[0] + m[1] * b[1]);
    return [p[0] + (m[0] * d) / dot, p[1] + (m[1] * d) / dot];
  });
}

/** Ellipse / arc polygon. */
export function ellipse(cx, cy, rx, ry = rx, n = 32, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Band of width w around a centre polyline (closed outline). */
export function ribbon(pts, w0, w1 = w0) {
  const n = pts.length - 1;
  const side = (s) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
    const t = norm(sub(b, a));
    const w = lerp(w0, w1, i / n) / 2;
    return [p[0] - t[1] * w * s, p[1] + t[0] * w * s];
  });
  return join(side(1), rev(side(-1)));
}

/** Tube outline from a spine and a radius function r(t ∈ 0..1) (closed polygon, flat ends). */
export function tubeOutline(spine, rOf) {
  const n = spine.length - 1;
  const L = polyLength(spine);
  let acc = 0;
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    if (i) acc += dist(spine[i], spine[i - 1]);
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n, i + 1)];
    const t = norm(sub(b, a));
    const r = rOf(acc / L);
    left.push([spine[i][0] - t[1] * r, spine[i][1] + t[0] * r]);
    right.push([spine[i][0] + t[1] * r, spine[i][1] - t[0] * r]);
  }
  return { left, right, outline: join(left, rev(right)) };
}

/** Piecewise-linear knots [[t, v], …] → function. */
export function knots(list) {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) {
        const [t0, v0] = list[i - 1], [t1, v1] = list[i];
        const u = (t - t0) / (t1 - t0 || 1);
        const s = u * u * (3 - 2 * u);                  // smooth between knots
        return lerp(v0, v1, s);
      }
    }
    return list[list.length - 1][1];
  };
}

export function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pts of polys) for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** Horizontal extent of a closed polygon at height y (min/max crossing x), or null. */
export function spanAtY(poly, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
      const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

/** Nearest point on a polyline: { d, t (arc fraction), side (+1 right of travel / −1), p }. */
export function nearestOnPolyline(p, pts) {
  let best = Infinity, bt = 0, bs = 1, bp = pts[0];
  const total = polyLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2);
    const u = clamp(((p[0] - ax) * dx + (p[1] - ay) * dy) / L2, 0, 1);
    const qx = ax + dx * u, qy = ay + dy * u;
    const d = Math.hypot(p[0] - qx, p[1] - qy);
    if (d < best) {
      best = d; bt = (acc + u * L) / total; bp = [qx, qy];
      bs = (dx * (p[1] - ay) - dy * (p[0] - ax)) >= 0 ? 1 : -1;
    }
    acc += L;
  }
  return { d: best, t: bt, side: bs, p: bp };
}
