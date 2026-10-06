// Mascot Lab — Shooting Shirt (long-sleeve pregame top).
//
// A long-sleeve raglan shooting shirt drawn as a technical flat on the 1000 × 1000
// artboard, in the same language as jersey.js (the reference garment) and tee.js:
//
//   1. geometry kit (the jersey's, plus a few helpers)
//   2. MEASUREMENTS — every key point of the pattern, in design units (≈ mm, size L)
//   3. the left half of the outline as joined curves, mirrored for the right
//   4. derived construction: raglan seams, collar, cuffs, hems = offsets of the outline
//   5. views { front, back } → silhouette, parts, printArea, zones, overlays, text
//
// The flat is drawn in design units and fitted to the artboard at the end (FIT).
//
// Build notes:
//   · raglan sleeves in the trim colour (the classic two-tone): the seam runs from the
//     collar to the underarm, so the whole shoulder belongs to the sleeve
//   · rib crew collar (front view shows the inside of the back collar), rib cuffs with
//     the sleeve easing into them, twin-needle coverstitch on collar, raglans, cuffs, hem
//   · athletic body, a little longer than the tee (length/chest ≈ 1.4), side seams set
//     a touch forward with flatlock stitching
//   · back: name over number lettering boxes like the jersey (a size down)
//   · printArea = the body panels only (raglan sleeves, rib collar and cuffs stay
//     unprinted), so oversized hits crop at the raglan seams
//   · "chest-left" is the WEARER's left chest = the viewer's right on the front flat

/* ───────────────────────────── geometry kit ───────────────────────────── */

const CX = 500;
const r1 = (v) => Math.round(v * 10) / 10;

/** Sample a cubic bezier p0→p3 into n+1 points. */
function cubic(p0, p1, p2, p3, n = 28) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}
/** Join polylines end to start, dropping duplicated joint points. */
function join(...segs) {
  const out = [];
  for (const s of segs) for (const p of s) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.01) out.push(p);
  }
  return out;
}
const rev = (pts) => [...pts].reverse();
/** Mirror across the centre line x = CX. */
const mirror = (pts) => pts.map(([x, y]) => [2 * CX - x, y]);
/** Mirror a single x. */
const mx = (x) => 2 * CX - x;
const add = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k];
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/**
 * Parallel offset of a polyline by d (positive = to the right of travel when y points
 * down, i.e. normal (dy, −dx)). Corners are mitred (limited to 3·d).
 */
function offset(pts, d) {
  const n = pts.length;
  const nrm = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
    const L = Math.hypot(dx, dy) || 1;
    nrm.push([dy / L, -dx / L]);
  }
  return pts.map((p, i) => {
    const a = nrm[Math.max(0, i - 1)], b = nrm[Math.min(nrm.length - 1, i)];
    let ax = a[0] + b[0], ay = a[1] + b[1];
    const L = Math.hypot(ax, ay) || 1;
    ax /= L; ay /= L;
    const dot = Math.max(1 / 3, ax * b[0] + ay * b[1]);
    return [p[0] + (ax * d) / dot, p[1] + (ay * d) / dot];
  });
}

/** Keep the part of a polyline before it first crosses y = Y (crossing point included). */
function untilY(pts, Y) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if ((y0 - Y) * (y1 - Y) <= 0 && y0 !== y1) {
      const t = (Y - y0) / (y1 - y0);
      out.push([x0 + (x1 - x0) * t, Y]);
      return out;
    }
    out.push(pts[i]);
  }
  return out;
}
function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
/** Point at fraction t of a polyline's length. */
function along(pts, t) {
  let want = Math.max(0, Math.min(1, t)) * polyLength(pts);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (want <= L || i === pts.length - 1) {
      const k = L ? Math.min(1, want / L) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    want -= L;
  }
  return pts.at(-1);
}
/** Sub-polyline between fractions t0 and t1 of the length. */
function slice(pts, t0, t1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(along(pts, t0 + ((t1 - t0) * i) / n));
  return out;
}
/** First crossing of two polylines → { i, j, p } (segment indices + point), or null. */
function cross(A, B) {
  for (let i = 1; i < A.length; i++) {
    const [ax, ay] = A[i - 1], [bx, by] = A[i];
    for (let j = 1; j < B.length; j++) {
      const [cx, cy] = B[j - 1], [dx, dy] = B[j];
      const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (!den) continue;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { i, j, p: [ax + (bx - ax) * t, ay + (by - ay) * t] };
    }
  }
  return null;
}
/** Circle / ellipse arc polygon (clockwise on screen). */
function ellipsePts(cx, cy, rx, ry = rx, n = 28, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}
/** Polygon of a rounded rectangle (design units). */
function rrectPts(x, y, w, h, r) {
  const q = (cx, cy, a0) => ellipsePts(cx, cy, r, r, 4, a0, a0 + Math.PI / 2);
  return join(q(x + w - r, y + r, -Math.PI / 2), q(x + w - r, y + h - r, 0), q(x + r, y + h - r, Math.PI / 2), q(x + r, y + r, Math.PI));
}
/** Soft lens/fold shape along a curve: width tapers to 0 at both ends (points). */
function lensPts(pts, w) {
  const n = pts.length - 1;
  const side = (s) => pts.map((p, i) => {
    const t = i / n, k = Math.sin(Math.PI * t) * w * s;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] + (dy / L) * k, p[1] - (dx / L) * k];
  });
  return join(side(1), rev(side(-1)));
}

/* ───────────────────────────── measurements ─────────────────────────────
 * Athletic-fit raglan shooting shirt, size L, in design units (≈ 1 per mm before the
 * fit): chest (pit to pit) 532 ≈ 53 cm; body length HPS→hem 770 (length/chest ≈ 1.45:
 * longer and slimmer than the boxy tee); neck 192 wide at the HPS with a 22 rib; front
 * neck drop 86, back 18; raglan underarm 262 below the HPS. With the arms hanging, a
 * raglan's shoulder must slope steeply: a 38° shoulder line off the HPS, filleted into
 * a sleeve hanging 12° off vertical; bicep 134 across (≈ 0.25 of the chest, a regular
 * athletic sleeve) tapering to 96 at the cuff seam; 64-long rib cuff, 82 across (the
 * sleeve eases into it), ending just above the hem line; 22 twin-needle hem.
 */
const HPS_Y = 150;                 // high point shoulder (collar meets the shoulder)
const NECK_HALF = 96;
const COLLAR = 22;
const FRONT_NECK_Y = HPS_Y + 86;
const BACK_NECK_Y = HPS_Y + 18;
const CHEST_HALF = 266;
const PIT_Y = HPS_Y + 262;
const HEM_HALF = 258;              // athletic: a touch narrower at the hem
const HEM_Y = HPS_Y + 770;
const HEM_TURN = 22;
const NECK_SLOPE = 38;             // raglan shoulder slope off the neck (° below horizontal)
const SLEEVE_DEG = 12;             // sleeve hangs this far off vertical
const BICEP_W = 134;               // sleeve width across, level with the underarm
const CAP = 84;                    // shoulder rounding (fillet tangent length)
const SLEEVE_END_Y = HPS_Y + 656;  // outer sleeve meets the cuff
const CUFF_LEN = 64;
const CUFF_HALF = 41;
const SLEEVE_END_HALF = 48;        // sleeve at the cuff seam (eases into the rib)
const SIDE_INSET = 9;              // side seams sit a touch forward of the fold

const HPS = [CX - NECK_HALF, HPS_Y];
const UA = [CX - CHEST_HALF, PIT_Y];
const SA = (SLEEVE_DEG * Math.PI) / 180;
const AX = [-Math.sin(SA), Math.cos(SA)];          // along the sleeve, toward the cuff
const NX = [Math.cos(SA), Math.sin(SA)];           // across the sleeve, outer → inner edge
// outer edge = shoulder line off the HPS (L1) + sleeve line BICEP_W outside the underarm
// (L2), joined by a fillet: P is where they meet
const D1 = [-Math.cos((NECK_SLOPE * Math.PI) / 180), Math.sin((NECK_SLOPE * Math.PI) / 180)];
const Q = add(UA, NX, -BICEP_W);
const P = (() => {
  // HPS + t·D1 = Q + s·AX
  const det = D1[0] * -AX[1] - D1[1] * -AX[0];
  const rx = Q[0] - HPS[0], ry = Q[1] - HPS[1];
  const t = (rx * -AX[1] - ry * -AX[0]) / det;
  return add(HPS, D1, t);
})();
const CAP_A = add(P, D1, -CAP);                    // fillet start on the shoulder line
const CAP_B = add(P, AX, CAP);                     // fillet end on the sleeve line
const SO = add(P, AX, (SLEEVE_END_Y - P[1]) / AX[1]);   // sleeve end, outer
const CS = add(SO, NX, SLEEVE_END_HALF);           // cuff seam centre
const SI = add(CS, NX, SLEEVE_END_HALF);           // sleeve end, inner
const CUFF_END = add(CS, AX, CUFF_LEN);            // centre of the cuff opening
const CT_O = add(add(CS, NX, -CUFF_HALF - 1), AX, 3);
const CT_I = add(add(CS, NX, CUFF_HALF + 1), AX, 3);
const CB_O = add(CUFF_END, NX, -CUFF_HALF);
const CB_I = add(CUFF_END, NX, CUFF_HALF);
const at2 = (p, a, n) => add(add(p, AX, a), NX, n);   // move along / across the sleeve

/* ───────────────────────────── outline curves (viewer's left half) ─────────────
 * Traversal: back-neck centre → HPS → raglan shoulder → sleeve → cuff → sleeve under →
 * underarm → side seam → hem → centre. With that direction, offset(…, +d) moves INWARD.
 */
const backNeck = cubic([CX, BACK_NECK_Y], [CX - 60, BACK_NECK_Y], [HPS[0] + 20, HPS_Y + 0.5], HPS, 24);
const frontNeck = cubic([CX, FRONT_NECK_Y], [CX - 64, FRONT_NECK_Y], [HPS[0] + 2, HPS_Y + 50], HPS, 30);
const shoulderLine = cubic(HPS, add(HPS, D1, 60), add(CAP_A, D1, -50), CAP_A, 16);
const shoulderCap = cubic(CAP_A, add(CAP_A, D1, CAP * 0.55), add(CAP_B, AX, -CAP * 0.55), CAP_B, 16);
const sleeveTop = cubic(CAP_B, add(CAP_B, AX, 80), add(SO, AX, -80), SO, 20);
const easeOut = cubic(SO, add(SO, AX, 6), add(CT_O, AX, -5), CT_O, 6);
const cuffOuter = cubic(CT_O, at2(CT_O, 20, -0.6), at2(CB_O, -20, -0.6), add(CB_O, NX, 1.5), 8);
const cuffEnd = cubic(add(CB_O, NX, 1.5), at2(CB_O, 2.5, 10), at2(CB_I, 2.5, -10), add(CB_I, NX, -1.5), 10);
const cuffInner = cubic(add(CB_I, NX, -1.5), at2(CB_I, -20, 0.6), at2(CT_I, 20, 0.6), CT_I, 8);
const easeIn = cubic(CT_I, add(CT_I, AX, -5), add(SI, AX, 6), SI, 6);
const sleeveUnder = cubic(SI, add(SI, AX, -150), add(UA, AX, 60), UA, 24);
const sideSeam = cubic(UA, [UA[0] + 1, UA[1] + 150], [CX - HEM_HALF - 1, HEM_Y - 200], [CX - HEM_HALF, HEM_Y - 7], 24);
const hemCorner = cubic([CX - HEM_HALF, HEM_Y - 7], [CX - HEM_HALF, HEM_Y - 2], [CX - HEM_HALF + 2, HEM_Y], [CX - HEM_HALF + 7, HEM_Y], 4);
const hemL = cubic([CX - HEM_HALF + 7, HEM_Y], [CX - HEM_HALF + 110, HEM_Y + 1.5], [CX - 140, HEM_Y + 3], [CX, HEM_Y + 3], 20);

const halfOutline = join(backNeck, shoulderLine, shoulderCap, sleeveTop, easeOut, cuffOuter, cuffEnd, cuffInner, easeIn, sleeveUnder, sideSeam, hemCorner, hemL);
const OUTLINE = join(halfOutline, rev(mirror(halfOutline)));

/* ───────────────────── fit to the artboard (design units → artboard) ───────────────────── */

const FIT = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of OUTLINE) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.min(920 / (x1 - x0), 940 / (y1 - y0));
  return { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
})();
const T = ([x, y]) => [500 + (x - FIT.cx) * FIT.k, 500 + (y - FIT.cy) * FIT.k];
/** Box in design units → artboard units. */
function box(x, y, w, h) {
  const [ax, ay] = T([x, y]);
  return { x: Math.round(ax), y: Math.round(ay), w: Math.round(w * FIT.k), h: Math.round(h * FIT.k) };
}
/** Zone box from its centre (design units). */
const zoneC = (cx, cy, w, h, label) => ({ ...box(cx - w / 2, cy - h / 2, w, h), label });

/** SVG path data (fitted): open polyline / closed polygon. */
const open = (pts) => "M" + pts.map((p) => { const q = T(p); return `${r1(q[0])} ${r1(q[1])}`; }).join(" L");
const closed = (pts) => open(pts) + " Z";
const lens = (pts, w) => closed(lensPts(pts, w));

/** Soft overlay with its blur snapped to a few radii (each distinct radius costs a blur pass). */
const RADII = [2.5, 5, 9, 14, 22];
const snap = (w) => RADII.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
const soft = (kind, d, opacity, width) => ({ kind, d, opacity, width: snap(width) });

/* ───────────────────────────── construction ───────────────────────────── */

const TOP = HPS_Y - 140;           // "above everything" (parts are clipped to the silhouette)

// collar: edges traversed left HPS → centre → right HPS; the body is on the −offset side
const frontEdge = join(rev(frontNeck), mirror(frontNeck));
const backEdge = join(rev(backNeck), mirror(backNeck));
const frontSeam = offset(frontEdge, -COLLAR);
const backSeam = offset(backEdge, -COLLAR);
const up = (pts) => join([[pts[0][0] - 3, TOP]], pts, [[pts.at(-1)[0] + 3, TOP]]);
const frontBand = closed(join(up(frontEdge), rev(up(frontSeam))));
const backBand = closed(join(up(backEdge), rev(up(backSeam))));

// inside of the back neck, seen through the front opening
const insideNeck = (() => {
  const half = Math.floor(frontEdge.length / 2);
  const l = cross(frontEdge.slice(0, half + 1), backSeam);
  const r = cross(frontEdge.slice(half), backSeam);
  if (!l || !r) return null;
  const fe = join([l.p], frontEdge.slice(l.i, half + r.i), [r.p]);
  const bs = backSeam.filter(([x]) => x > l.p[0] && x < r.p[0]);
  return join(fe, rev(bs));
})();

// raglan seams: from the collar seam down to the underarm. The front one starts further
// round the neck than the back one (the sleeve head is cut asymmetric, as on real raglans).
const seamPoint = (seam, t) => along(seam.slice(0, Math.floor(seam.length / 2) + 1), t);
const R0F = seamPoint(frontSeam, 0.3);
const R0B = seamPoint(backSeam, 0.34);
const raglan = (r0) => cubic(r0, [r0[0] - 46, r0[1] + 44], [UA[0] + 60, UA[1] - 92], UA, 28);
const raglanF = raglan(R0F);
const raglanB = raglan(R0B);

// cuff seam (where the sleeve eases into the rib) and the cuff region (overshoots outward)
const cuffSeam = cubic(CT_O, at2(CT_O, 2, 28), at2(CT_I, 2, -28), CT_I, 10);
const cuffRegion = join(cuffSeam, [add(CT_I, NX, 14), at2(CB_I, 14, 14), at2(CB_O, 14, -14), add(CT_O, NX, -14)]);

// side seams (set forward of the fold) and the hem stitch
const sideLine = offset(slice(sideSeam, 0.03, 0.985, 30), SIDE_INSET);
const hemFull = join(hemL, rev(mirror(hemL)));
const hemOver = join([[CX - HEM_HALF - 20, HEM_Y]], hemFull, [[mx(CX - HEM_HALF - 20), HEM_Y]]);
const hemStitch = offset(hemOver, HEM_TURN);

/** Raglan sleeve region (left), outside the raglan seam; overshoots into empty space. */
function sleeveRegion(rag) {
  const r0 = rag[0];
  return join(rag, [[UA[0] - 1, UA[1] + 4], [UA[0] - 1, 1400], [-500, 1400], [-500, TOP], [r0[0] - 1, TOP]]);
}

/**
 * Body panel (print area): between the raglan seams, the collar seam and the side seams
 * (set forward of the fold, so a front print stops at the seam, not at the fold),
 * overshooting the hem.
 */
function bodyPanel(seam, rag) {
  const r0 = rag[0];
  // collar seam between the two raglan starts
  const s = seam.filter(([x]) => x > r0[0] && x < mx(r0[0]));
  const leftEdge = join(rag, sideLine, [[sideLine.at(-1)[0], HEM_Y + 80]]);
  return closed(join([r0], s, [[mx(r0[0]), r0[1]]], mirror(leftEdge).slice(1), rev(leftEdge)));
}

/* ───────────────────────────── shading ───────────────────────────── */

function shading(rag) {
  const sideShade = cubic([UA[0] + 30, UA[1] + 40], [UA[0] + 28, 640], [CX - HEM_HALF + 26, 780], [CX - HEM_HALF + 26, HEM_Y - 26], 16);
  const drag = cubic([UA[0] + 10, UA[1] + 8], [UA[0] + 44, UA[1] + 40], [UA[0] + 78, UA[1] + 84], [UA[0] + 110, UA[1] + 140], 14);
  const drape1 = cubic([318, 620], [310, 720], [306, 810], [310, HEM_Y - 34], 14);
  const drape2 = cubic([404, 700], [400, 780], [398, 840], [402, HEM_Y - 30], 12);
  // sleeve: shade down the inner edge, light down the outer, soft elbow creases, bunching at the cuff
  const innerShade = offset(slice(sleeveUnder, 0.04, 0.9), 15);
  const outerLight = offset(slice(join(sleeveTop), 0.05, 0.85), 30);
  const elbow = (t, len, tilt) => { const c = lerp(along(sleeveTop, t), along(rev(sleeveUnder), t), 0.5); return [add(c, NX, -len), add(add(c, NX, -len * 0.3), AX, tilt * 0.4), add(add(c, NX, len * 0.3), AX, tilt), add(add(c, NX, len), AX, tilt * 1.2)]; };
  const crease = (t, len, tilt) => cubic(...elbow(t, len, tilt), 12);
  const capShade = offset(slice(rag, 0.08, 0.95), -14);
  const both = (pts, w, op, blur, kind = "shadow", opR = op) => [soft(kind, lens(pts, w), op, blur), soft(kind, lens(mirror(pts), w), opR, blur)];
  return [
    ...both(sideShade, 24, 0.12, 14, "shadow", 0.14),
    ...both(drag, 10, 0.1, 9, "shadow", 0.11),
    ...both(drag.map(([x, y]) => [x + 12, y - 10]), 7, 0.035, 9, "highlight", 0.03),
    // the sleeve head rolls over the raglan seam
    ...both(capShade, 12, 0.09, 9),
    ...both(innerShade, 15, 0.13, 9, "shadow", 0.15),
    ...both(outerLight, 18, 0.05, 14, "highlight", 0.04),
    // elbow: two long, thin creases across the sleeve, each with a lit ridge below it
    ...both(crease(0.47, 46, -10), 3.5, 0.13, 2.5, "shadow", 0.14),
    ...both(crease(0.47, 40, -10).map((p) => add(p, AX, 6)), 3, 0.06, 2.5, "highlight", 0.05),
    ...both(crease(0.56, 34, 7), 3, 0.09, 2.5, "shadow", 0.1),
    ...both(crease(0.56, 30, 7).map((p) => add(p, AX, 5)), 2.5, 0.045, 2.5, "highlight", 0.04),
    // the sleeve stacks a little above the rib cuff
    ...both(crease(0.88, 26, -4), 2.5, 0.1, 2.5, "shadow", 0.11),
    ...both(crease(0.93, 24, 4), 2.5, 0.09, 2.5, "shadow", 0.1),
    soft("shadow", lens(drape1, 9), 0.08, 9),
    soft("highlight", lens(shift(drape1, 14, 0), 7), 0.035, 9),
    soft("shadow", lens(mirror(drape2), 8), 0.07, 9),
    soft("highlight", lens(cubic([372, 330], [394, 420], [410, 500], [420, 620], 12), 76), 0.035, 22),
    // rib cuffs and hem turn sit a hair proud
    soft("edge", open(offset(hemOver, HEM_TURN + 6)), 0.09, 2.5),
    soft("edge", open(cuffSeam), 0.16, 2.5),
    soft("edge", open(rev(mirror(cuffSeam))), 0.16, 2.5),
  ];
}

/* ───────────────────────────── views ───────────────────────────── */

function buildView(kind) {
  const isFront = kind === "front";
  const seam = isFront ? frontSeam : backSeam;
  const rag = isFront ? raglanF : raglanB;
  const parts = [{ id: "body", d: closed(OUTLINE), fill: "base" }];
  const overlays = [];

  if (isFront) {
    // inside of the back collar shows through the opening; the front panel covers it below
    parts.push({ id: "back-collar-inside", d: backBand, fill: "trim" });
    const frontPanel = closed(join([[HPS[0] - 1, TOP]], frontEdge, [[mx(HPS[0]) + 1, TOP], [1300, TOP], [1300, 1400], [-300, 1400], [-300, TOP]]));
    parts.push({ id: "front-panel", d: frontPanel, fill: "base" });
  }
  parts.push(
    { id: "sleeve-left", d: closed(sleeveRegion(rag)), fill: "trim" },
    { id: "sleeve-right", d: closed(mirror(sleeveRegion(rag))), fill: "trim" },
    { id: "cuff-left", d: closed(cuffRegion), fill: "trim" },
    { id: "cuff-right", d: closed(mirror(cuffRegion)), fill: "trim" },
    { id: "collar", d: isFront ? frontBand : backBand, fill: "trim" },
  );

  overlays.push(...shading(rag));
  if (isFront && insideNeck) {
    overlays.push(
      soft("shadow", closed(insideNeck), 0.3, 2.5),
      soft("shadow", backBand, 0.1, 2.5),
      soft("edge", open(slice(frontEdge, 0.1, 0.9)), 0.3, 5),
      soft("edge", open(slice(backSeam, 0.2, 0.8)), 0.16, 2.5),
    );
  }
  overlays.push(soft("edge", open(seam), 0.18, 2.5));

  // ── lines ──
  const edge = isFront ? frontEdge : backEdge;
  const ribFollow = (e) => open(join([add(e[0], [0, -40])], offset(e, -COLLAR / 2), [add(e.at(-1), [0, -40])]));
  const cuffAngle = (Math.atan2(AX[1], AX[0]) * 180) / Math.PI;
  if (isFront) overlays.push({ kind: "rib", d: backBand, follow: ribFollow(backEdge), opacity: 0.18 });
  overlays.push(
    { kind: "rib", d: isFront ? frontBand : backBand, follow: ribFollow(edge), opacity: 0.2 },
    { kind: "rib", d: closed(cuffRegion), angle: cuffAngle, opacity: 0.2 },
    { kind: "rib", d: closed(mirror(cuffRegion)), angle: 180 - cuffAngle, opacity: 0.2 },
  );
  if (isFront) overlays.push({ kind: "seam", d: open(slice(frontEdge, 0.02, 0.98, 40)), opacity: 0.22, width: 0.9 });
  overlays.push(
    { kind: "seam", d: open(seam) },
    { kind: "seam", d: open(rag) },
    { kind: "seam", d: open(mirror(rag)) },
    { kind: "seam", d: open(cuffSeam) },
    { kind: "seam", d: open(mirror(cuffSeam)) },
    { kind: "seam", d: open(sideLine), opacity: 0.28 },
    { kind: "seam", d: open(mirror(sideLine)), opacity: 0.28 },
  );
  if (isFront && insideNeck) overlays.push({ kind: "seam", d: open(backSeam), opacity: 0.25, width: 0.9 });
  const collarStitch = isFront ? offset(edge, -COLLAR - 5) : join([add(HPS, [-30, 12])], offset(edge, -COLLAR - 5), [add([mx(HPS[0]), HPS[1]], [30, 12])]);
  overlays.push(
    { kind: "stitch", d: open(collarStitch), gap: 3.4 },
    // twin-needle coverstitch on the body side of each raglan, sleeve side of each cuff
    { kind: "stitch", d: open(offset(rag, 5)), gap: 3.2 },
    { kind: "stitch", d: open(mirror(offset(rag, 5))), gap: 3.2 },
    { kind: "stitch", d: open(offset(cuffSeam, -5)), gap: 3.2 },
    { kind: "stitch", d: open(mirror(offset(cuffSeam, -5))), gap: 3.2 },
    // flatlock side seams
    { kind: "stitch", d: open(sideLine), gap: 2.6 },
    { kind: "stitch", d: open(mirror(sideLine)), gap: 2.6 },
    { kind: "stitch", d: open(hemStitch), gap: 4.2 },
  );

  if (isFront) {
    // woven label caught in the hem at the wearer's right (viewer's left)
    const lx = CX - HEM_HALF + 50, lw = 46, lh = 34, ly = HEM_Y - HEM_TURN + 5 - lh;
    parts.push(
      { id: "woven-label", d: closed(rrectPts(lx, ly, lw, lh, 2.5)), fill: "trim", over: true, texture: false },
      { id: "woven-label-mark", d: closed(rrectPts(lx + 7, ly + 7, 12, 12, 1.5)), fill: "white", over: true, texture: false },
      { id: "woven-label-text", d: closed(rrectPts(lx + 23, ly + 8.5, 15, 3, 0.8)) + " " + closed(rrectPts(lx + 23, ly + 14.5, 10, 3, 0.8)), fill: "#C9CED6", over: true, texture: false },
    );
    overlays.push(
      soft("shadow", closed(rrectPts(lx + 1, ly + 2.5, lw, lh, 2.5)), 0.2, 2.5),
      { kind: "stitch", d: closed(rrectPts(lx + 3, ly + 3, lw - 6, lh - 6, 1.5)), gap: 0.8, width: 0.7, opacity: 0.35 },
    );
    if (insideNeck) {
      const nb = backSeam[Math.floor(backSeam.length / 2)];
      const nw = 50, nh = 21, ny = nb[1] - 1;
      parts.push(
        { id: "neck-label", d: closed(rrectPts(CX - nw / 2, ny, nw, nh, 2)), fill: "white", texture: false },
        { id: "neck-label-mark", d: closed(rrectPts(CX - nw / 2 + 6, ny + 5, 10, 10, 1.2)), fill: "trim" },
        { id: "neck-label-text", d: closed(rrectPts(CX - nw / 2 + 21, ny + 6, 21, 2.6, 0.8)) + " " + closed(rrectPts(CX - nw / 2 + 21, ny + 11.5, 14, 2.6, 0.8)), fill: "#9AA1AC" },
      );
    }
  }

  const backTop = BACK_NECK_Y + COLLAR;     // centre-back collar seam
  const front = {
    "chest-left": zoneC(mx(CX - 98), HPS_Y + 196, 100, 94, "Left chest"),
    "chest-center": zoneC(CX, HPS_Y + 238, 176, 130, "Center chest"),
    center: zoneC(CX, HPS_Y + 364, 376, 380, "Full front"),
    oversized: zoneC(CX + 230, HPS_Y + 610, 740, 740, "Oversized · crops right"),
  };
  const back = {
    "back-yoke": zoneC(CX, backTop + 34, 140, 50, "Back yoke"),
    "back-center": zoneC(CX, HPS_Y + 380, 380, 396, "Full back"),
    oversized: zoneC(CX - 230, HPS_Y + 610, 740, 740, "Oversized · crops left"),
  };

  return {
    silhouette: closed(OUTLINE),
    parts,
    printArea: bodyPanel(seam, rag),
    zones: isFront ? front : back,
    overlays,
    // lettering ≈ 0.9× the game jersey's in real size (design units ≈ mm): name ≈ 50 mm
    // tall, number ≈ 9 in, same name-over-number stack
    ...(isFront ? {} : { text: { name: box(CX - 150, backTop + 96, 300, 50), number: box(CX - 136, backTop + 160, 272, 230) } }),
  };
}

export default {
  id: "longsleeve",
  name: "Shooting Shirt",
  styleCode: "ML-L01",
  category: "warmup",
  fabric: "knit",
  spec: "Dri-knit poly jersey · raglan two-tone · rib crew + cuffs · 180 gsm",
  views: { front: buildView("front"), back: buildView("back") },
  defaultColors: { base: "primary", trim: "secondary", accent: "accent" },
};
