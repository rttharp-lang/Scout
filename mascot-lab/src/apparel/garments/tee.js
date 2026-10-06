// Mascot Lab — Practice Tee.
//
// An oversized, boxy heavyweight tee drawn as a technical flat on the 1000 × 1000
// artboard, in the same language as jersey.js (the reference garment):
//
//   1. geometry kit (the jersey's, plus a few helpers)
//   2. MEASUREMENTS — every key point of the pattern, in design units (≈ mm, size L)
//   3. the left half of the outline as joined curves, mirrored for the right
//   4. derived construction: collar, armholes, hems, stitching = offsets of the outline
//   5. views { front, back } → silhouette, parts, printArea, zones, overlays
//
// The flat is drawn in design units and fitted to the artboard at the end (FIT): the
// sleeves make a tee wider than it is tall, so the fit spans x 40–960 and centres it.
//
// Build notes:
//   · dropped shoulders (the armhole seam sits ~10 cm down the arm), wide straight
//     body, sleeves to just above the elbow, length/chest ≈ 1.16 (boxy)
//   · rib crew collar in the trim colour; the front view shows the inside of the back
//     collar through the neck opening, the way a real flat lays
//   · twin-needle coverstitch at the collar, sleeve hems and body hem; single-needle
//     topstitch on the body side of the dropped armhole seams; back-neck tape row
//   · printArea = the body panels only (sleeves and rib stay unprinted), so oversized
//     hits crop hard at the armhole seams like a real screen-printed tee
//   · small woven label caught in the front hem (wearer's right, viewer's left)
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
/** Straight segment as points (so it can be offset/joined like a curve). */
const line = (a, b, n = 2) => cubic(a, a, b, b, n);
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
 * Oversized boxy heavyweight tee, size L, in design units (≈ 1 per mm before the fit):
 * chest (pit to pit) 624 ≈ 62 cm; body length HPS→hem 740 (length/chest ≈ 1.19 — boxy);
 * neck 204 wide at the HPS with a 26 rib; front neck drop 92, back 20; dropped shoulder
 * point 300 from the centre (shoulder 60 cm) on a 44 slope; deep armhole (300 below the
 * HPS); sleeve top edge 246 from the shoulder point at 36° below horizontal; bicep ≈ 207
 * across vs a 190 opening, so the short wide sleeve still tapers and ends just above the
 * elbow; 24 twin-needle hems.
 */
const HPS_Y = 160;                 // high point shoulder (collar meets the shoulder)
const NECK_HALF = 102;             // half neck opening at the HPS
const COLLAR = 26;                 // rib collar width
const FRONT_NECK_Y = HPS_Y + 92;   // centre-front neck edge
const BACK_NECK_Y = HPS_Y + 20;    // centre-back neck edge
const SHOULDER_HALF = 300;         // dropped shoulder point
const SHOULDER_DROP = 44;
const CHEST_HALF = 312;            // underarm, half chest
const PIT_Y = HPS_Y + 300;         // underarm height (deep: dropped shoulder)
const HEM_HALF = 309;              // straight, boxy body
const HEM_Y = HPS_Y + 740;
const HEM_TURN = 24;               // twin-needle body hem
const SLEEVE_DEG = 36;             // sleeve axis below horizontal
const SLEEVE_LEN = 246;            // sleeve top edge, shoulder point → opening
const SLEEVE_OPEN = 190;           // sleeve opening (flat) — a little under the bicep: the sleeve tapers
const SLEEVE_TURN = 22;            // twin-needle sleeve hem

const HPS = [CX - NECK_HALF, HPS_Y];
const SP = [CX - SHOULDER_HALF, HPS_Y + SHOULDER_DROP];
const UA = [CX - CHEST_HALF, PIT_Y];
const SA = (SLEEVE_DEG * Math.PI) / 180;
const AX = [-Math.cos(SA), Math.sin(SA)];      // along the sleeve, out & down
const NX = [Math.sin(SA), Math.cos(SA)];       // across the opening, top edge → under edge
const SO = add(SP, AX, SLEEVE_LEN);            // sleeve opening, top corner
const SI = add(SO, NX, SLEEVE_OPEN);           // …under corner

/* ───────────────────────────── outline curves (viewer's left half) ─────────────
 * Traversal: back-neck centre → HPS → shoulder → sleeve top → opening → sleeve under →
 * underarm → side seam → hem → centre. With that direction, offset(…, +d) moves INWARD.
 * Both views share this outline: the top edge between the HPS points is the back
 * collar (it stands higher than the front neckline).
 */
const backNeck = cubic([CX, BACK_NECK_Y], [CX - 64, BACK_NECK_Y], [HPS[0] + 22, HPS_Y + 0.5], HPS, 24);
const frontNeck = cubic([CX, FRONT_NECK_Y], [CX - 68, FRONT_NECK_Y], [HPS[0] + 2, HPS_Y + 54], HPS, 30);
const shoulder = cubic(HPS, [HPS[0] - 40, HPS_Y + 4], [SP[0] + 70, SP[1] - 13], SP, 14);
const capDir = (() => { const d = [-0.93, 0.36]; const L = Math.hypot(...d); return [d[0] / L, d[1] / L]; })();
const sleeveTop = cubic(SP, add(SP, capDir, 60), add(SO, AX, -90), SO, 20);
const opening = cubic(SO, add(add(SO, NX, 70), AX, 3), add(add(SI, NX, -70), AX, 3), SI, 12);
const sleeveUnder = cubic(SI, [SI[0] + (UA[0] - SI[0]) * 0.35, SI[1] + (UA[1] - SI[1]) * 0.35 + 2], [UA[0] - 14, UA[1] + 5], UA, 14);
const sideSeam = cubic(UA, [UA[0] + 1, UA[1] + 130], [CX - HEM_HALF - 1, HEM_Y - 170], [CX - HEM_HALF, HEM_Y - 7], 24);
const hemCorner = cubic([CX - HEM_HALF, HEM_Y - 7], [CX - HEM_HALF, HEM_Y - 2], [CX - HEM_HALF + 2, HEM_Y], [CX - HEM_HALF + 7, HEM_Y], 4);
const hemL = cubic([CX - HEM_HALF + 7, HEM_Y], [CX - HEM_HALF + 120, HEM_Y + 1.5], [CX - 150, HEM_Y + 3], [CX, HEM_Y + 3], 20);

const halfOutline = join(backNeck, shoulder, sleeveTop, opening, sleeveUnder, sideSeam, hemCorner, hemL);
const OUTLINE = join(halfOutline, rev(mirror(halfOutline)));

/* ───────────────────── fit to the artboard (design units → artboard) ───────────────────── */

const FIT = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of OUTLINE) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.min(920 / (x1 - x0), 940 / (y1 - y0));
  return { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
})();
const T = ([x, y]) => [500 + (x - FIT.cx) * FIT.k, 500 + (y - FIT.cy) * FIT.k];
/** Zone box in design units → artboard units. */
function zone(x, y, w, h, label) {
  const [ax, ay] = T([x, y]);
  return { x: Math.round(ax), y: Math.round(ay), w: Math.round(w * FIT.k), h: Math.round(h * FIT.k), label };
}
/** Zone box from its centre (design units). */
const zoneC = (cx, cy, w, h, label) => zone(cx - w / 2, cy - h / 2, w, h, label);

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

// inside of the back neck, seen through the front opening: below the back collar's
// seam, above the front collar's edge
const insideNeck = (() => {
  const half = Math.floor(frontEdge.length / 2);
  const l = cross(frontEdge.slice(0, half + 1), backSeam);
  const r = cross(frontEdge.slice(half), backSeam);
  if (!l || !r) return null;
  const fe = join([l.p], frontEdge.slice(l.i, half + r.i), [r.p]);
  const bs = backSeam.filter(([x]) => x > l.p[0] && x < r.p[0]);
  return join(fe, rev(bs));
})();

// dropped armhole seam: shoulder point → underarm, a gentle outward bow
const armhole = cubic(SP, [SP[0] - 3, SP[1] + 80], [UA[0] - 2, UA[1] - 90], UA, 20);

// sleeve hem: parallel to the opening, overshooting both edges (clipped to the silhouette)
const openLine = join([add(SO, NX, -16)], opening, [add(SI, NX, 16)]);
const sleeveHem = offset(openLine, SLEEVE_TURN);

// body hem: parallel to the hem across the whole width
const hemFull = join(hemL, rev(mirror(hemL)));
const hemOver = join([[CX - HEM_HALF - 20, HEM_Y]], hemFull, [[mx(CX - HEM_HALF - 20), HEM_Y]]);
const hemStitch = offset(hemOver, HEM_TURN);   // traversed left → right: inside (up) is +

/** Body panel (print area) for a given collar seam: inside the armholes, overshooting the hem. */
function bodyPanel(seam) {
  const below = SI[1] + 12;
  const side = untilY(sideSeam, below);
  const leftEdge = join([[SP[0] - 2, TOP]], armhole, side, [[side.at(-1)[0] - 40, below], [side.at(-1)[0] - 40, HEM_Y + 80]]);
  return closed(join(up(seam), mirror(leftEdge), rev(leftEdge)));
}

/* ───────────────────────────── shading (shared by both views) ───────────────────────────── */

function bodyShading() {
  const sideShade = cubic([UA[0] + 30, UA[1] + 36], [UA[0] + 28, 620], [CX - HEM_HALF + 28, 760], [CX - HEM_HALF + 28, HEM_Y - 24], 16);
  const drag1 = cubic([UA[0] + 12, UA[1] + 6], [UA[0] + 50, UA[1] + 34], [UA[0] + 92, UA[1] + 78], [UA[0] + 130, UA[1] + 132], 14);
  const drag2 = cubic([UA[0] + 10, UA[1] + 44], [UA[0] + 40, UA[1] + 88], [UA[0] + 66, UA[1] + 140], [UA[0] + 86, UA[1] + 206], 14);
  const drape1 = cubic([316, 600], [308, 700], [304, 790], [308, HEM_Y - 34], 14);
  const drape2 = cubic([402, 680], [398, 760], [396, 820], [400, HEM_Y - 30], 12);
  const capFold = offset(slice(armhole, 0.06, 0.94), -16);           // sleeve side of the armhole
  const underShade = offset(slice(sleeveUnder, 0.08, 0.96), 16);     // inside the sleeve, along the under edge
  const sleeveFold = cubic(along(sleeveTop, 0.42), add(along(sleeveTop, 0.42), NX, 50), add(along(opening, 0.42), AX, -60), add(along(opening, 0.45), AX, -14), 12);
  const topLight = offset(slice(sleeveTop, 0.12, 0.92), 44);
  const both = (pts, w, op, blur, kind = "shadow", opR = op) => [soft(kind, lens(pts, w), op, blur), soft(kind, lens(mirror(pts), w), opR, blur)];
  return [
    // body rolls away at the sides
    ...both(sideShade, 26, 0.12, 14, "shadow", 0.14),
    // drag folds out of the dropped underarm
    ...both(drag1, 11, 0.11, 9, "shadow", 0.12),
    ...both(drag1.map(([x, y]) => [x + 12, y - 10]), 8, 0.04, 9, "highlight", 0.035),
    ...both(drag2, 9, 0.07, 9, "shadow", 0.08),
    // sleeves: cap eases into the seam, shade along the under edge, one soft fold, lit top
    ...both(capFold, 10, 0.1, 9),
    ...both(underShade, 16, 0.12, 9, "shadow", 0.14),
    ...both(sleeveFold, 9, 0.08, 9),
    ...both(sleeveFold.map((p) => add(p, AX, 14)), 7, 0.035, 9, "highlight", 0.03),
    ...both(topLight, 22, 0.045, 14, "highlight", 0.035),
    // heavy jersey hangs in soft vertical drape below the chest
    soft("shadow", lens(drape1, 9), 0.08, 9),
    soft("highlight", lens(shift(drape1, 14, 0), 7), 0.035, 9),
    soft("shadow", lens(mirror(drape2), 8), 0.07, 9),
    soft("shadow", lens(mirror(drape1).map(([x, y]) => [x + 6, y + 30]), 8), 0.06, 9),
    // chest catches the light
    soft("highlight", lens(cubic([370, 330], [394, 420], [410, 500], [420, 620], 12), 80), 0.035, 22),
    // the turned-up hems sit a hair proud of the body
    soft("edge", open(offset(hemOver, HEM_TURN + 6)), 0.09, 2.5),
    soft("edge", open(offset(openLine, SLEEVE_TURN + 5)), 0.09, 2.5),
    soft("edge", open(rev(mirror(offset(openLine, SLEEVE_TURN + 5)))), 0.09, 2.5),
  ];
}

/* ───────────────────────────── views ───────────────────────────── */

function buildView(kind) {
  const isFront = kind === "front";
  const seam = isFront ? frontSeam : backSeam;
  const parts = [{ id: "body", d: closed(OUTLINE), fill: "base" }];
  const overlays = [];

  if (isFront) {
    // inside of the back collar shows through the opening; the front panel covers it below
    parts.push({ id: "back-collar-inside", d: backBand, fill: "trim" });
    const frontPanel = closed(join([[HPS[0] - 1, TOP]], frontEdge, [[mx(HPS[0]) + 1, TOP], [1300, TOP], [1300, 1300], [-300, 1300], [-300, TOP]]));
    parts.push({ id: "front-panel", d: frontPanel, fill: "base" });
    parts.push({ id: "collar", d: frontBand, fill: "trim" });
  } else {
    parts.push({ id: "collar", d: backBand, fill: "trim" });
  }

  overlays.push(...bodyShading());
  if (isFront && insideNeck) {
    overlays.push(
      soft("shadow", closed(insideNeck), 0.3, 2.5),             // inside of the garment, in shade
      soft("shadow", backBand, 0.1, 2.5),                       // back collar's inner face
      soft("edge", open(slice(frontEdge, 0.1, 0.9)), 0.3, 5),   // front collar casts onto the inside
      soft("edge", open(slice(backSeam, 0.2, 0.8)), 0.16, 2.5), // and the back collar seam
    );
  }
  overlays.push(soft("edge", open(seam), 0.18, 2.5));            // collar casts a little onto the body

  // ── lines ──
  const edge = isFront ? frontEdge : backEdge;
  const ribFollow = (e) => open(join([add(e[0], [0, -40])], offset(e, -COLLAR / 2), [add(e.at(-1), [0, -40])]));
  if (isFront) overlays.push({ kind: "rib", d: backBand, follow: ribFollow(backEdge), opacity: 0.18 });
  overlays.push({ kind: "rib", d: isFront ? frontBand : backBand, follow: ribFollow(edge), opacity: 0.2 });
  if (isFront) overlays.push({ kind: "seam", d: open(slice(frontEdge, 0.02, 0.98, 40)), opacity: 0.22, width: 0.9 });
  overlays.push(
    { kind: "seam", d: open(seam) },
    { kind: "seam", d: open(armhole) },
    { kind: "seam", d: open(mirror(armhole)) },
  );
  if (isFront && insideNeck) overlays.push({ kind: "seam", d: open(backSeam), opacity: 0.25, width: 0.9 });
  // twin-needle coverstitch under the collar (on the back it runs shoulder to shoulder:
  // the back-neck tape), single-needle topstitch beside the armholes, twin-needle hems
  const collarStitch = isFront ? offset(edge, -COLLAR - 5) : join([add(HPS, [-34, 12])], offset(edge, -COLLAR - 5), [add([mx(HPS[0]), HPS[1]], [34, 12])]);
  overlays.push(
    { kind: "stitch", d: open(collarStitch), gap: 3.6 },
    { kind: "stitch", d: open(offset(armhole, 5)), gap: 1.1 },
    { kind: "stitch", d: open(mirror(offset(armhole, 5))), gap: 1.1 },
    { kind: "stitch", d: open(sleeveHem), gap: 4 },
    { kind: "stitch", d: open(mirror(sleeveHem)), gap: 4 },
    { kind: "stitch", d: open(hemStitch), gap: 4.4 },
  );

  if (isFront) {
    // woven label caught in the hem at the wearer's right (viewer's left): trim-colour
    // ground (always reads on the base) with a light woven mark
    const lx = CX - HEM_HALF + 58, lw = 50, lh = 36, ly = HEM_Y - HEM_TURN + 5 - lh;
    parts.push(
      { id: "woven-label", d: closed(rrectPts(lx, ly, lw, lh, 2.5)), fill: "trim", over: true, texture: false },
      { id: "woven-label-mark", d: closed(rrectPts(lx + 7, ly + 7, 13, 13, 1.5)), fill: "white", over: true, texture: false },
      { id: "woven-label-text", d: closed(rrectPts(lx + 25, ly + 9, 17, 3, 0.8)) + " " + closed(rrectPts(lx + 25, ly + 15, 12, 3, 0.8)), fill: "#C9CED6", over: true, texture: false },
    );
    overlays.push(
      soft("shadow", closed(rrectPts(lx + 1, ly + 2.5, lw, lh, 2.5)), 0.2, 2.5),
      { kind: "stitch", d: closed(rrectPts(lx + 3, ly + 3, lw - 6, lh - 6, 1.5)), gap: 0.8, width: 0.7, opacity: 0.35 },
    );
    // inside the back neck: the brand's woven neck label, seen through the opening
    if (insideNeck) {
      const nb = backSeam[Math.floor(backSeam.length / 2)];
      const nw = 52, nh = 22, ny = nb[1] - 1;
      parts.push(
        { id: "neck-label", d: closed(rrectPts(CX - nw / 2, ny, nw, nh, 2)), fill: "white", texture: false },
        { id: "neck-label-mark", d: closed(rrectPts(CX - nw / 2 + 6, ny + 5, 10, 10, 1.2)), fill: "trim" },
        { id: "neck-label-text", d: closed(rrectPts(CX - nw / 2 + 21, ny + 6, 22, 2.6, 0.8)) + " " + closed(rrectPts(CX - nw / 2 + 21, ny + 11.5, 15, 2.6, 0.8)), fill: "#9AA1AC" },
      );
    }
  }

  // zones (design units → artboard)
  const front = {
    "chest-left": zoneC(mx(CX - 106), HPS_Y + 204, 112, 104, "Left chest"),
    "chest-center": zoneC(CX, HPS_Y + 236, 196, 144, "Center chest"),
    center: zoneC(CX, HPS_Y + 368, 440, 420, "Full front"),
    oversized: zoneC(CX + 250, HPS_Y + 610, 800, 800, "Oversized · crops right"),
  };
  const back = {
    "back-yoke": zoneC(CX, BACK_NECK_Y + COLLAR + 50, 170, 66, "Back yoke"),
    "back-center": zoneC(CX, HPS_Y + 340, 450, 440, "Full back"),
    oversized: zoneC(CX - 250, HPS_Y + 610, 800, 800, "Oversized · crops left"),
  };

  return {
    silhouette: closed(OUTLINE),
    parts,
    printArea: bodyPanel(seam),
    zones: isFront ? front : back,
    overlays,
  };
}

export default {
  id: "tee",
  name: "Practice Tee",
  styleCode: "ML-T01",
  category: "warmup",
  fabric: "knit",
  spec: "Heavyweight cotton jersey · boxy drop-shoulder cut · rib crew · 260 gsm",
  views: { front: buildView("front"), back: buildView("back") },
  defaultColors: { base: "light", trim: "primary", accent: "accent" },
};
