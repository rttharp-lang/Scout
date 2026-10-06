// Mascot Lab — Warm-up Hoodie.
//
// An oversized, boxy heavyweight pullover hoodie (the hero warm-up piece) drawn as a
// technical flat on the 1000 × 1000 artboard, in the same language as jersey.js:
//
//   1. geometry kit (the jersey's, plus helpers for hardware, cords and cutting lines)
//   2. MEASUREMENTS — every key point of the pattern, in design units
//   3. the left half of the outline as joined curves, mirrored for the right
//   4. derived construction: hood, pouch, ribs, stitching = offsets of the outline
//   5. views { front, back } → silhouette, parts, printArea, zones, overlays
//
// The flat is drawn in design units and fitted to the artboard at the end (FIT): the
// angled sleeves make the hoodie width-limited, so the fit scales it to span x 40–960
// and centres it vertically.
//
// Build notes:
//   · dropped shoulders, wide boxy body, slightly cropped rib hem band, full sleeves
//     with stacked (long, bunched) rib cuffs
//   · double-layer hood: the front shows the opening with its lining (trim) and the
//     hood sides standing behind the neck; the back shows the hood's centre seam with
//     its base lying on the shoulders
//   · braided drawcords with metal aglets through metal eyelets (`over` parts) — every
//     seam/stitch line is cut where a cord lies on top of it, because overlays are
//     painted above `over` parts
//   · kangaroo pouch with scooped hand openings, bar tacks and twin-needle stitching
//   · printArea = body panels (+ pouch) + hood shell; sleeves, ribs, lining and the hood
//     rim stay unprinted, so big hits crop hard at the armhole seams
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

/** Keep the part of a polyline before it first crosses x = X at/after segment `from` (crossing included). */
function untilX(pts, X, from = 1) {
  const out = pts.slice(0, from);
  for (let i = from; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if ((x0 - X) * (x1 - X) <= 0 && x0 !== x1) {
      const t = (X - x0) / (x1 - x0);
      out.push([X, y0 + (y1 - y0) * t]);
      return out;
    }
    out.push(pts[i]);
  }
  return out;
}
/** Keep the part of a polyline AFTER it first crosses x = X (crossing included). */
function fromX(pts, X) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if ((x0 - X) * (x1 - X) <= 0 && x0 !== x1) {
      const t = (X - x0) / (x1 - x0);
      return join([[X, y0 + (y1 - y0) * t]], pts.slice(i));
    }
  }
  return pts;
}
/** Point on a polyline where it first crosses x = X. */
const atX = (pts, X) => untilX(pts, X).at(-1);
function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
/** Point at fraction t of a polyline's length, plus the unit tangent there. */
function along(pts, t) {
  const total = polyLength(pts);
  let want = Math.max(0, Math.min(1, t)) * total;
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
/** Sub-polyline between fractions t0 and t1 of the length. */
function slice(pts, t0, t1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(along(pts, t0 + ((t1 - t0) * i) / n).p);
  return out;
}
/** Polygon of a rounded rectangle (design units). */
function rrectPts(x, y, w, h, r) {
  const q = (cx, cy, a0) => ellipsePts(cx, cy, r, r, 4, a0, a0 + Math.PI / 2);
  return join(q(x + w - r, y + r, -Math.PI / 2), q(x + w - r, y + h - r, 0), q(x + r, y + h - r, Math.PI / 2), q(x + r, y + r, Math.PI));
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
/** Band of constant width w around a centre polyline (closed outline points). */
function ribbon(pts, w) {
  return join(offset(pts, w / 2), rev(offset(pts, -w / 2)));
}
/** Side edge of a stacked cuff: straight p0→p1 with `bumps` soft outward bulges. */
function bumpy(p0, p1, out, bumps = 3, amp = 3) {
  const pts = [];
  const n = bumps * 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = amp * Math.abs(Math.sin(Math.PI * bumps * t)) ** 0.7;
    pts.push([p0[0] + (p1[0] - p0[0]) * t + out[0] * k, p0[1] + (p1[1] - p0[1]) * t + out[1] * k]);
  }
  return pts;
}

/** Densify a polyline so no step is longer than `step`. */
function densify(pts, step = 2) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let j = 1; j <= n; j++) out.push([x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n]);
  }
  return out;
}
function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2));
    const d = Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}
/**
 * Cut a polyline wherever it passes under something painted on top of it (a drawcord):
 * corridors = [{ pts, r }]. Returns the visible runs.
 */
function cutAround(pts, corridors) {
  if (!corridors.length) return [pts];
  const runs = [];
  let cur = [];
  for (const p of densify(pts, 1.5)) {
    if (corridors.some((c) => distToPolyline(p, c.pts) < c.r)) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

/* ───────────────────────────── measurements ─────────────────────────────
 * Oversized boxy warm-up hoodie, size L, in design units (≈ 7.7 per cm before the fit):
 * chest (pit to pit) 508 ≈ 66 cm; body length HPS→hem 546 ≈ 71 cm (length/chest ≈ 1.07:
 * boxy, a touch cropped); dropped shoulder point 22 past the chest line with a 30 slope;
 * low underarm (armhole 245 deep); sleeve ≈ 470 from the shoulder point incl. an 82
 * stacked rib cuff (cuff 82 wide vs a 122 sleeve end, so the sleeve blouses over it);
 * rib hem band 60 ≈ 8 cm; hood standing 158 above the HPS, 340 wide; pouch 224 wide at
 * the top, 340 at the band, 180 deep.
 */
const HOOD_TOP = 140;              // crown of the standing hood
const HPS_Y = 298;                 // high point shoulder (hood seam at the shoulder)
const HEM_Y = 844;                 // bottom of the rib hem band
const BAND_H = 60;                 // rib hem band
const BAND_Y = HEM_Y - BAND_H;     // band seam
const NECK_HALF = 90;              // hood seam half width at the HPS
const CHEST_HALF = 254;            // boxy body
const SHOULDER_HALF = 276;         // dropped shoulder point
const SHOULDER_DROP = 30;
const PIT_Y = 572;                 // underarm
const BAND_HALF = 241;             // rib band pulls in a touch: the body blouses over it
const HOOD_HALF = 170;             // widest point of the standing hood
const HOOD_FOOT_X = CX - 198;      // where the hood's outer edge lands on the shoulder
const RIM = 20;                    // double-layer hood rim (drawcord channel)
const FRONT_NECK_Y = 402;          // hood edges meet at the centre-front neck

// sleeve: axis angle at the cuff, cuff opening centre, stacked cuff, sleeve end
const SLEEVE_DEG = 22;
const CUFF_END = [92, 796];
const CUFF_LEN = 82;
const CUFF_HALF = 41;
const SLEEVE_END_HALF = 61;

// kangaroo pouch
const POUCH_TOP = 604;
const POUCH_TOP_HALF = 112;
const POUCH_SIDE_HALF = 170;
const POUCH_OPEN_Y = 742;          // lower end of the scooped hand opening

const HPS = [CX - NECK_HALF, HPS_Y];
const SP = [CX - SHOULDER_HALF, HPS_Y + SHOULDER_DROP];
const UA = [CX - CHEST_HALF, PIT_Y];
const shoulderY = (x) => HPS_Y + ((HPS[0] - x) / (HPS[0] - SP[0])) * SHOULDER_DROP;
const HJ = [HOOD_FOOT_X, shoulderY(HOOD_FOOT_X)];

const SA = (SLEEVE_DEG * Math.PI) / 180;
const AX = [-Math.sin(SA), Math.cos(SA)];          // sleeve axis at the cuff (down & out)
const NX = [Math.cos(SA), Math.sin(SA)];           // across the sleeve, toward the body
const CB_O = add(CUFF_END, NX, -CUFF_HALF);        // cuff opening, outer corner
const CB_I = add(CUFF_END, NX, CUFF_HALF);         // …inner corner
const CS = add(CUFF_END, AX, -CUFF_LEN);           // cuff seam centre
const SO = add(CS, NX, -SLEEVE_END_HALF);          // sleeve end (blouses over the cuff)
const SI = add(CS, NX, SLEEVE_END_HALF);
const CT_O = add(add(CS, NX, -CUFF_HALF - 1), AX, 4);
const CT_I = add(add(CS, NX, CUFF_HALF + 1), AX, 4);
const at2 = (p, a, n) => add(add(p, AX, a), NX, n);   // move along / across the sleeve

/* ───────────────────────────── outline curves (viewer's left half) ─────────────
 * Traversal: hood crown → hood side → shoulder → sleeve top → cuff → underarm seam →
 * side seam → hem band → centre. With that direction, offset(…, +d) moves INWARD.
 */
const HOOD_W = [CX - HOOD_HALF, 256];
const hoodSide = join(
  cubic([CX, HOOD_TOP], [CX - 82, HOOD_TOP], [HOOD_W[0] + 14, HOOD_W[1] - 112], HOOD_W, 26),
  cubic(HOOD_W, [HOOD_W[0] - 1, HOOD_W[1] + 28], [HJ[0] + 20, HJ[1] - 8], HJ, 14),
);
const shoulder = cubic(HJ, [HJ[0] - 30, HJ[1] + 5], [SP[0] + 30, SP[1] - 4], SP, 10);
const sleeveTop = cubic(SP, [SP[0] - 50, SP[1] + 34], add(SO, AX, -175), SO, 32);
const blouseOut = cubic(SO, add(SO, AX, 7), add(CT_O, AX, -6), CT_O, 6);
const cuffOuter = bumpy(CT_O, add(CB_O, NX, 2), [-NX[0], -NX[1]], 3, 2.4);
const cuffEnd = cubic(add(CB_O, NX, 2), at2(CB_O, 3, 8), at2(CB_I, 3, -8), add(CB_I, NX, -2), 10);
const cuffInner = bumpy(add(CB_I, NX, -2), CT_I, NX, 3, 2.4);
const blouseIn = cubic(CT_I, add(CT_I, AX, -6), add(SI, AX, 7), SI, 6);
const sleeveUnder = cubic(SI, add(SI, AX, -70), [UA[0] - 8, UA[1] + 60], UA, 24);
const sideSeam = cubic(UA, [UA[0] - 1, 660], [UA[0] - 2, BAND_Y - 40], [UA[0] + 3, BAND_Y], 24);
const BAND_X = CX - BAND_HALF;
const bandSide = join([[UA[0] + 3, BAND_Y], [BAND_X, BAND_Y + 3]], cubic([BAND_X, BAND_Y + 3], [BAND_X + 0.5, 810], [BAND_X, 830], [BAND_X + 1.5, HEM_Y - 1], 6));
const hemLine = cubic([BAND_X + 1.5, HEM_Y - 1], [BAND_X + 6, HEM_Y + 0.5], [CX - 120, HEM_Y + 1], [CX, HEM_Y + 1], 16);

const halfOutline = join(hoodSide, shoulder, sleeveTop, blouseOut, cuffOuter, cuffEnd, cuffInner, blouseIn, sleeveUnder, sideSeam, bandSide, hemLine);
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

/** SVG path data (fitted): open polyline / closed polygon / several open runs. */
const open = (pts) => "M" + pts.map((p) => { const q = T(p); return `${r1(q[0])} ${r1(q[1])}`; }).join(" L");
const closed = (pts) => open(pts) + " Z";
const multi = (runs) => runs.filter((r) => r.length > 1).map(open).join(" ");
const lens = (pts, w) => closed(lensPts(pts, w));

/** Soft overlay with its blur snapped to a few radii (each distinct radius costs a blur pass). */
const RADII = [2.5, 5, 9, 14, 22];
const snap = (w) => RADII.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
const soft = (kind, d, opacity, width) => ({ kind, d, opacity, width: snap(width) });

/* ───────────────────────────── construction ───────────────────────────── */

// armhole seam (dropped shoulder): shoulder point → underarm, easing in toward the body
const armhole = cubic(SP, [SP[0] + 1, 400], [UA[0] - 5, 500], UA, 24);
// cuff seam (where the sleeve blouses into the rib)
const cuffSeam = cubic(CT_O, at2(CT_O, 2, 30), at2(CT_I, 2, -30), CT_I, 10);
const sleeveHalf = join(sleeveTop, blouseOut, cuffSeam, blouseIn, sleeveUnder, rev(armhole));
// cuff region — overshoots outward; parts are clipped to the silhouette
const cuffRegion = join(cuffSeam, [add(CT_I, NX, 10), at2(CB_I, 12, 10), at2(CB_O, 12, -10), add(CT_O, NX, -10)]);

// hood rim centre line, left half: crown → widest → down to the centre-front neck
const RIM_TOP = HOOD_TOP + 32;
const RIM_W = [CX - 108, 262];
const rimUpper = cubic([CX, RIM_TOP], [CX - 64, RIM_TOP], [RIM_W[0], RIM_W[1] - 68], RIM_W, 22);
const rimLower = cubic(RIM_W, [RIM_W[0], RIM_W[1] + 70], [CX - 62, FRONT_NECK_Y - 30], [CX, FRONT_NECK_Y - RIM / 2], 22);
const rimMid = join(rimUpper, rimLower);
const rimOuter = offset(rimMid, -RIM / 2);
const rimInner = offset(rimMid, RIM / 2);
// the inner edge crosses the centre line above the V — clip both edges there
const rimInnerL = untilX(rimInner, CX, 4);
const rimOuterL = untilX(rimOuter, CX, 4);
const rimLowerOuter = offset(rimLower, -RIM / 2);
const LINING = join(rimInnerL, rev(mirror(rimInnerL)));

// hood foot (front): hood shell meets the body — from the shoulder in to the rim
const footMeet = atX(rimLowerOuter, CX - 74);
const hoodFoot = cubic(HJ, [HJ[0] + 40, HJ[1] + 9], [footMeet[0] - 40, footMeet[1] - 14], footMeet, 20);
const rimFromFoot = fromX(rimLowerOuter, CX - 74);
const frontNeckL = untilX(join(hoodFoot, rimFromFoot), CX, 3);
// hood foot (back): the hood's base lies on the shoulders and sags at the centre back
const BACK_FOOT_Y = HPS_Y + 54;
const backFoot = cubic(HJ, [HJ[0] + 46, HJ[1] + 22], [CX - 70, BACK_FOOT_Y - 2], [CX, BACK_FOOT_Y], 22);

// drawcords: eyelets on the rim near the bottom, cords hang over the chest
const EYELET_R = 7.5;
const eyeL = atX(rimLower, CX - 46);
const eyeR = [mx(eyeL[0]), eyeL[1]];
const CORD_W = 9.5;
const cordL = cubic(eyeL, [eyeL[0] - 2, eyeL[1] + 60], [eyeL[0] - 11, eyeL[1] + 120], [eyeL[0] - 7, eyeL[1] + 176], 28);
const cordR = cubic(eyeR, [eyeR[0] + 3, eyeR[1] + 50], [eyeR[0] + 13, eyeR[1] + 104], [eyeR[0] + 9, eyeR[1] + 160], 28);
const AGLET_LEN = 34;
const AGLET_HALF = 5.8;
function agletAxis(cord) {
  const a = cord.at(-2), b = cord.at(-1);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
}
const CORD_CORRIDORS = [cordL, cordR].map((c) => ({ pts: join(c, [add(c.at(-1), agletAxis(c), AGLET_LEN)]), r: CORD_W / 2 + 2.6 }))
  .concat([eyeL, eyeR].map((e) => ({ pts: [e, [e[0], e[1] + 0.1]], r: EYELET_R + 2 })));

// kangaroo pouch, left half: top centre → corner → scooped hand opening → side → band seam
const POUCH_C = [CX - POUCH_TOP_HALF, POUCH_TOP];
const pouchTop = line([CX, POUCH_TOP], [POUCH_C[0] + 6, POUCH_TOP], 8);
const pouchCorner = cubic([POUCH_C[0] + 6, POUCH_TOP], [POUCH_C[0] + 2, POUCH_TOP], [POUCH_C[0] - 1, POUCH_TOP + 1.5], [POUCH_C[0] - 4, POUCH_TOP + 4], 4);
const pouchOpening = cubic([POUCH_C[0] - 4, POUCH_TOP + 4], [POUCH_C[0] - 9, POUCH_TOP + 70], [CX - POUCH_SIDE_HALF + 22, POUCH_OPEN_Y - 6], [CX - POUCH_SIDE_HALF, POUCH_OPEN_Y], 26);
const pouchSide = line([CX - POUCH_SIDE_HALF, POUCH_OPEN_Y], [CX - POUCH_SIDE_HALF - 1, BAND_Y], 6);
const pouchHalf = join(pouchTop, pouchCorner, pouchOpening, pouchSide);
const POUCH = join(pouchHalf, rev(mirror(pouchHalf)));   // bottom edge = the band seam

// hem band region (overshoots the silhouette at the sides and bottom), clockwise
const HEM_BAND = [[UA[0] - 10, BAND_Y], [mx(UA[0] - 10), BAND_Y], [mx(UA[0] - 10), HEM_Y + 10], [UA[0] - 10, HEM_Y + 10]];

/* ───────────────────────────── hardware ───────────────────────────── */

/** Metal eyelet: ring, lower shade, upper highlight, hole (all `over`, untextured). */
function eyelet(c, id) {
  const [x, y] = c;
  const arcBand = (r0, r1, a0, a1) => closed(join(ellipsePts(x, y, r0, r0, 14, a0, a1), rev(ellipsePts(x, y, r1, r1, 14, a0, a1))));
  return [
    { id: `${id}-ring`, d: closed(ellipsePts(x, y, EYELET_R)), fill: "#A9AFB7", over: true, texture: false },
    { id: `${id}-shade`, d: arcBand(EYELET_R - 0.5, 4.4, 0.15, Math.PI * 0.95), fill: "#6F757E", over: true },
    { id: `${id}-hi`, d: arcBand(EYELET_R - 1.3, 4.9, Math.PI * 1.1, Math.PI * 1.75), fill: "#EEF1F4", over: true },
    { id: `${id}-hole`, d: closed(ellipsePts(x, y, 3.8)), fill: "#14171C", over: true },
  ];
}

/** Aglet (metal cord tip) along the cord's end direction: parts + outline. */
function aglet(cord, id) {
  const ax = agletAxis(cord);
  const nx = [-ax[1], ax[0]];
  const p0 = cord.at(-1);
  const W = AGLET_HALF;
  const pt = (s, w) => [p0[0] + ax[0] * s + nx[0] * w, p0[1] + ax[1] * s + nx[1] * w];
  const tip = AGLET_LEN;
  const arc = ellipsePts(0, 0, 1, 1, 10, Math.PI, 0).map(([u, v]) => pt(tip - 4 + 4 * v, u * W));
  const body = join([pt(-2, -W)], arc, [pt(-2, W)]);
  const strip = (w0, w1, s0, s1) => closed([pt(s0, w0), pt(s1, w0), pt(s1, w1), pt(s0, w1)]);
  return {
    parts: [
      { id, d: closed(body), fill: "#A3A9B2", over: true, texture: false },
      { id: `${id}-shade`, d: strip(W * 0.22, W - 0.4, 1, tip - 4), fill: "#737A84", over: true },
      { id: `${id}-hi`, d: strip(-W * 0.62, -W * 0.22, 1, tip - 5), fill: "#EEF1F4", over: true },
      { id: `${id}-collar`, d: strip(-W - 0.3, W + 0.3, -2, 3.5), fill: "#5E646D", over: true },
      { id: `${id}-collar2`, d: strip(-W - 0.2, W + 0.2, 8, 10), fill: "#7E858F", over: true },
    ],
    outline: { kind: "seam", d: closed(body), opacity: 0.55, width: 0.9 },
  };
}

/** Braided cord: ribbon + chevron braid marks + outline + cast shadow. */
function cordGraphics(cord, id) {
  const poly = ribbon(cord, CORD_W);
  const marks = [];
  const n = Math.floor(polyLength(cord) / 4.4);
  for (let i = 1; i < n; i++) {
    const { p, t } = along(cord, i / n);
    const nrm = [-t[1], t[0]];
    const h = CORD_W / 2 - 0.9;
    marks.push([add(add(p, nrm, -h), t, -1.7), add(p, t, 1.5), add(add(p, nrm, h), t, -1.7)]);
  }
  return {
    parts: [{ id, d: closed(poly), fill: "accent", over: true }],
    lines: [
      { kind: "seam", d: multi(marks), opacity: 0.3, width: 0.75 },
      { kind: "seam", d: closed(poly), opacity: 0.5, width: 0.9 },
    ],
    // cast shadow on the body: the cord nudged down-right, minus the cord itself (nonzero)
    shadow: soft("shadow", closed(shift(poly, 2.6, 3.6)) + " " + closed(rev(poly)), 0.34, 2.5),
  };
}

/* ───────────────────────────── views ───────────────────────────── */

function buildView(kind) {
  const isFront = kind === "front";
  const corridors = isFront ? CORD_CORRIDORS : [];
  const cut = (pts) => multi(cutAround(pts, corridors));

  /* ── regions ── */
  const footL = isFront ? frontNeckL : backFoot;
  const hoodRegion = closed(join(hoodSide, footL, rev(mirror(footL)), rev(mirror(hoodSide))));
  const bodyL = join(rev(footL), shoulder, armhole, sideSeam);
  const bodyPanel = closed(join(bodyL, rev(mirror(bodyL))));
  // printable: body panel + hood shell (minus the opening and its rim on the front)
  const opening = closed(join(rimOuterL, rev(mirror(rimOuterL))));
  const printArea = isFront ? `${bodyPanel} ${hoodRegion} ${opening}` : `${bodyPanel} ${hoodRegion}`;

  /* ── shading (soft, blurred regions) ── */
  const S = [];
  // body rolls away at the sides
  const sideShadeL = cubic([UA[0] + 18, PIT_Y + 20], [UA[0] + 14, 640], [UA[0] + 16, 720], [UA[0] + 22, BAND_Y - 6], 14);
  S.push(soft("shadow", lens(sideShadeL, 20), 0.12, 14), soft("shadow", lens(mirror(sideShadeL), 20), 0.14, 14));
  // armpit: the sleeve folds into the body at the low underarm
  const pit = cubic([UA[0] - 26, UA[1] - 60], [UA[0] - 6, UA[1] - 26], [UA[0] + 4, UA[1] - 4], [UA[0] + 6, UA[1] + 26], 10);
  S.push(soft("shadow", lens(pit, 9), 0.16, 9), soft("shadow", lens(mirror(pit), 9), 0.18, 9));
  // under-arm drape: fabric pulls from the low armpit toward the chest
  const drapeA = cubic([UA[0] + 30, PIT_Y - 50], [UA[0] + 60, PIT_Y - 10], [UA[0] + 86, PIT_Y + 40], [UA[0] + 96, PIT_Y + 110], 14);
  S.push(
    soft("shadow", lens(drapeA, 10), 0.1, 9),
    soft("shadow", lens(mirror(drapeA), 10), 0.12, 9),
    soft("highlight", lens(shift(drapeA, 16, -4), 8), 0.04, 9),
  );
  // the boxy body blouses over the rib band: soft vertical folds in the lower body
  const lowFold = cubic([304, 640], [300, 700], [302, 740], [308, BAND_Y - 4], 12);
  S.push(
    soft("shadow", lens(lowFold, 7), 0.08, 5),
    soft("highlight", lens(shift(lowFold, 12, 0), 6), 0.035, 5),
    soft("shadow", lens(mirror(shift(lowFold, 14, 20)), 6), 0.07, 5),
  );
  // chest catches the light
  S.push(soft("highlight", lens(cubic([380, 410], [395, 480], [405, 540], [410, 600], 12), 70), 0.035, 22));
  // dropped shoulder: the seam sits down the arm, the fabric folds over the shoulder point
  const shoulderFold = cubic([SP[0] + 14, SP[1] + 8], [SP[0] + 34, SP[1] + 50], [SP[0] + 38, SP[1] + 110], [SP[0] + 30, SP[1] + 190], 14);
  S.push(soft("shadow", lens(shoulderFold, 12), 0.08, 9), soft("shadow", lens(mirror(shoulderFold), 12), 0.1, 9));

  // sleeves: outer roll, inner shade, elbow folds, blousing over the cuff, stacked cuff
  for (const side of [1, -1]) {
    const M = (pts) => (side === 1 ? pts : mirror(pts));
    const o = side === 1 ? 1 : 1.15;          // light from the upper left
    S.push(
      soft("shadow", lens(M(slice(offset(sleeveTop, 15), 0.14, 0.95)), 13), 0.1 * o, 9),
      soft("shadow", lens(M(slice(offset(sleeveUnder, 13), 0.04, 0.95)), 12), 0.13 * o, 9),
      soft("highlight", lens(M(slice(offset(sleeveTop, 48), 0.08, 0.8)), 18), 0.045, 14),
    );
    // elbow: two diagonal folds across the sleeve, light above, shade below
    const at = (t, d) => along(offset(sleeveTop, d), t).p;
    const fold1 = cubic(at(0.58, 8), at(0.6, 40), at(0.645, 76), at(0.69, 108), 10);
    const fold2 = cubic(at(0.715, 14), at(0.73, 46), at(0.755, 80), at(0.78, 110), 10);
    S.push(
      soft("shadow", lens(M(fold1), 7), 0.15 * o, 5),
      soft("highlight", lens(M(shift(fold1, 3, -9)), 6), 0.06, 5),
      soft("shadow", lens(M(fold2), 6), 0.12 * o, 5),
      soft("highlight", lens(M(shift(fold2, 3, -8)), 5), 0.05, 5),
    );
    // blousing: the sleeve end gathers into the cuff
    S.push(soft("shadow", lens(M(offset(cuffSeam, -6)), 6), 0.18, 5));
    // stacked cuff: ridges and creases
    for (const [f, a] of [[0.3, 0.17], [0.56, 0.15], [0.8, 0.13]]) {
      const c = cubic(at2(CT_O, CUFF_LEN * f, 2), at2(CT_O, CUFF_LEN * f + 3, 34), at2(CT_I, CUFF_LEN * f + 3, -34), at2(CT_I, CUFF_LEN * f, -2), 10);
      S.push(soft("shadow", lens(M(c), 3.4), a, 2.5), soft("highlight", lens(M(shift(c, 0, -4.5)), 2.6), 0.07, 2.5));
    }
  }
  // hem band: the body blouses over it and casts a soft shadow on the rib
  S.push(soft("edge", open([[UA[0] + 4, BAND_Y + 3], [mx(UA[0] + 4), BAND_Y + 3]]), 0.22, 2.5));

  if (isFront) {
    // inside of the hood: the lining recedes into shadow toward the crown
    // (bands of the lining itself, clamped from below, so nothing spills onto the shell)
    const liningAbove = (y, inset) => closed(offset(LINING, inset).map(([x, yy]) => [x, Math.min(yy, y)]));
    const wall = slice(offset(rimInnerL, 8), 0.04, 0.86);
    S.push(
      soft("shadow", closed(LINING), 0.12, 5),
      soft("shadow", liningAbove(RIM_TOP + 120, 4), 0.26, 14),
      soft("shadow", liningAbove(RIM_TOP + 64, 6), 0.3, 9),
      soft("shadow", lens(wall, 11), 0.3, 9),
      soft("shadow", lens(mirror(wall), 11), 0.34, 9),
      soft("highlight", lens(cubic([CX - 44, 344], [CX - 20, 362], [CX + 20, 362], [CX + 44, 344], 10), 14), 0.07, 14),
    );
    // hood shell: rounds away at its sides; the rim catches the light
    const hoodEdge = slice(offset(hoodSide, 10), 0.18, 0.9);
    S.push(
      soft("shadow", lens(hoodEdge, 12), 0.11, 9),
      soft("shadow", lens(mirror(hoodEdge), 12), 0.14, 9),
      soft("highlight", lens(slice(rimOuter, 0.06, 0.5), 6), 0.07, 5),
      soft("highlight", lens(mirror(slice(rimOuter, 0.06, 0.5)), 6), 0.055, 5),
    );
    // the hood's foot casts a shadow onto the shoulders and chest
    S.push(soft("edge", open(offset(hoodFoot, -3)), 0.24, 5), soft("edge", open(mirror(offset(hoodFoot, -3))), 0.26, 5));
    // pouch: its free edges stand off the body; the top edge rolls
    const openShade = slice(offset(pouchOpening, -2.5), 0.04, 0.98);
    S.push(
      soft("shadow", lens(openShade, 3.5), 0.3, 2.5),
      soft("shadow", lens(mirror(openShade), 3.5), 0.33, 2.5),
      soft("shadow", lens(slice(offset(pouchOpening, 10), 0.1, 0.9), 8), 0.08, 5),
      soft("shadow", lens(mirror(slice(offset(pouchOpening, 10), 0.1, 0.9)), 8), 0.09, 5),
      soft("edge", open(shift(join(pouchTop, rev(mirror(pouchTop))), 0, 3)), 0.12, 2.5),
      soft("highlight", lens(cubic([CX - 90, POUCH_TOP + 40], [CX - 40, POUCH_TOP + 50], [CX + 40, POUCH_TOP + 50], [CX + 90, POUCH_TOP + 40], 12), 16), 0.035, 14),
    );
    // drawcords lie on the chest
    S.push(cordGraphics(cordL, "x").shadow, cordGraphics(cordR, "x").shadow);
  } else {
    // back of the hood: two panels round over the crown; the base lies on the shoulders
    const hoodEdge = slice(offset(hoodSide, 14), 0.1, 0.95);
    const panelHi = cubic([CX - 30, HOOD_TOP + 34], [CX - 72, HOOD_TOP + 74], [CX - 84, HOOD_TOP + 124], [CX - 76, HPS_Y + 2], 12);
    S.push(
      soft("shadow", lens(hoodEdge, 18), 0.15, 14),
      soft("shadow", lens(mirror(hoodEdge), 18), 0.18, 14),
      soft("highlight", lens(panelHi, 30), 0.06, 14),
      soft("highlight", lens(mirror(panelHi), 26), 0.045, 14),
      soft("shadow", lens(line([CX, HOOD_TOP + 16], [CX, BACK_FOOT_Y - 6], 12), 7), 0.08, 5),
      // the hood's base curls onto the back, and casts a shadow on the upper back
      soft("shadow", lens(cubic([HJ[0] + 30, HJ[1] + 6], [CX - 80, BACK_FOOT_Y - 16], [CX + 80, BACK_FOOT_Y - 16], [mx(HJ[0] + 30), HJ[1] + 6], 20), 12), 0.12, 9),
      soft("edge", open(join(offset(backFoot, -4), rev(mirror(offset(backFoot, -4))))), 0.32, 5),
    );
  }

  /* ── lines ── */
  const lines = [];
  // ribs: hem band (vertical wales) and the stacked cuffs (wales along the sleeve axis)
  const cuffAngle = 90 + SLEEVE_DEG;
  lines.push(
    { kind: "rib", d: closed(HEM_BAND), opacity: 0.2 },
    { kind: "rib", d: closed(cuffRegion), angle: cuffAngle, opacity: 0.2 },
    { kind: "rib", d: closed(mirror(cuffRegion)), angle: 180 - cuffAngle, opacity: 0.2 },
  );
  // seams
  const seams = [armhole, mirror(armhole), cuffSeam, mirror(cuffSeam), [[UA[0] + 3, BAND_Y], [mx(UA[0] + 3), BAND_Y]]];
  if (isFront) seams.push(hoodFoot, mirror(hoodFoot), rimOuterL, mirror(rimOuterL), rimInnerL, mirror(rimInnerL));
  else seams.push(backFoot, mirror(backFoot), [[CX, HOOD_TOP + 1], [CX, BACK_FOOT_Y]]);
  for (const s of seams) lines.push({ kind: "seam", d: cut(s) });
  // the shoulder seam rolls a touch to the front on a dropped shoulder
  lines.push({ kind: "seam", d: cut(offset(shoulder, isFront ? 7 : 5)), opacity: 0.22 });

  // twin-needle stitching (one opacity → composited as one group)
  const stitches = [
    offset(armhole, 5), mirror(offset(armhole, 5)),
    offset(cuffSeam, -5), mirror(offset(cuffSeam, -5)),
    [[UA[0] + 6, BAND_Y - 5], [mx(UA[0] + 6), BAND_Y - 5]],
  ];
  if (isFront) {
    stitches.push(
      offset(hoodFoot, -5), mirror(offset(hoodFoot, -5)),
      slice(rimMid, 0, 0.995, 60), mirror(slice(rimMid, 0, 0.995, 60)),
      offset(join(pouchTop, pouchCorner), 7), mirror(offset(join(pouchTop, pouchCorner), 7)),
      offset(pouchOpening, 7), mirror(offset(pouchOpening, 7)),
    );
  } else {
    stitches.push(
      offset(backFoot, -5), mirror(offset(backFoot, -5)),
      [[CX - 5, HOOD_TOP + 3], [CX - 5, BACK_FOOT_Y - 3]], [[CX + 5, HOOD_TOP + 3], [CX + 5, BACK_FOOT_Y - 3]],
    );
  }
  for (const s of stitches) lines.push({ kind: "stitch", d: cut(s), gap: 3.4 });

  if (isFront) {
    // pouch outline seams + bar tacks at both ends of each hand opening
    const pouchEdge = join(pouchTop, pouchCorner, pouchOpening);
    lines.push({ kind: "seam", d: cut(pouchEdge) }, { kind: "seam", d: cut(mirror(pouchEdge)) });
    lines.push({ kind: "seam", d: cut(pouchSide), opacity: 0.3 }, { kind: "seam", d: cut(mirror(pouchSide)), opacity: 0.3 });
    const tack = (p, q) => ({ kind: "seam", d: open([p, q]), opacity: 0.55, width: 2.2 });
    const o0 = pouchOpening[0], o1 = pouchOpening.at(-1);
    lines.push(
      tack([o0[0] - 1, o0[1] + 1], [o0[0] + 8, o0[1] + 6]), tack([mx(o0[0] - 1), o0[1] + 1], [mx(o0[0] + 8), o0[1] + 6]),
      tack([o1[0] - 1, o1[1] - 1], [o1[0] + 10, o1[1] - 1]), tack([mx(o1[0] - 1), o1[1] - 1], [mx(o1[0] + 10), o1[1] - 1]),
    );
    // hood: lining centre seam fading into the shadow; bar tack where the rims meet
    lines.push({ kind: "seam", d: open([[CX, RIM_TOP + RIM / 2 + 2], [CX, RIM_TOP + 74]]), opacity: 0.2 });
    lines.push({ kind: "seam", d: cut([[CX - 9, FRONT_NECK_Y - 13], [CX + 9, FRONT_NECK_Y - 13]]), opacity: 0.45, width: 1.8 });
  }

  /* ── parts ── */
  const parts = [
    { id: "body", d: closed(OUTLINE), fill: "base" },
    { id: "sleeve-left", d: closed(sleeveHalf), fill: "base" },
    { id: "sleeve-right", d: closed(mirror(sleeveHalf)), fill: "base" },
    { id: "hood", d: hoodRegion, fill: "base" },
    { id: "cuff-left", d: closed(cuffRegion), fill: "trim" },
    { id: "cuff-right", d: closed(mirror(cuffRegion)), fill: "trim" },
    { id: "hem-band", d: closed(HEM_BAND), fill: "trim" },
  ];
  const tail = [];               // overlays drawn after everything (hardware outlines)

  if (isFront) {
    parts.push(
      { id: "hood-lining", d: closed(LINING), fill: "trim" },
      { id: "pouch", d: closed(POUCH), fill: "base" },
    );
    // hardware + cords, painted above graphics
    const cL = cordGraphics(cordL, "drawcord-left"), cR = cordGraphics(cordR, "drawcord-right");
    const aL = aglet(cordL, "aglet-left"), aR = aglet(cordR, "aglet-right");
    parts.push(...eyelet(eyeL, "eyelet-left"), ...eyelet(eyeR, "eyelet-right"), ...cL.parts, ...cR.parts, ...aL.parts, ...aR.parts);
    tail.push(...cL.lines, ...cR.lines, aL.outline, aR.outline);
    for (const e of [eyeL, eyeR]) tail.push({ kind: "seam", d: closed(ellipsePts(e[0], e[1], EYELET_R)), opacity: 0.45, width: 0.8 });

    // woven label on the lower left front, above the band
    const tx = 274, ty = 734, tw = 44, th = 30;
    parts.push(
      { id: "woven-label", d: closed(rrectPts(tx, ty, tw, th, 2.5)), fill: "white", over: true, texture: false },
      { id: "woven-label-band", d: closed(rrectPts(tx, ty + th - 7, tw, 7, 1)), fill: "trim", over: true },
      { id: "woven-label-mark", d: closed(rrectPts(tx + 6, ty + 6, 13, 13, 1.5)), fill: "trim", over: true },
      { id: "woven-label-text", d: closed(rrectPts(tx + 23, ty + 8, 15, 3, 0.5)) + " " + closed(rrectPts(tx + 23, ty + 14, 11, 3, 0.5)), fill: "#9AA1AC", over: true },
    );
    S.push(soft("shadow", closed(rrectPts(tx + 1, ty + 2.5, tw, th, 2.5)), 0.18, 2.5));
    tail.push({ kind: "seam", d: closed(rrectPts(tx + 2.2, ty + 2.2, tw - 4.4, th - 4.4, 1.5)), opacity: 0.22, width: 0.7 });
  }

  const zones = isFront ? {
    "chest-left": zone(592, 412, 98, 90, "Left chest"),
    "chest-center": zone(404, 414, 192, 132, "Center chest"),
    center: zone(296, 404, 408, 226, "Full front"),
    oversized: zone(336, 360, 720, 720, "Oversized · crops right"),
    hood: zone(622, 196, 44, 96, "Hood side"),
    pouch: zone(352, 626, 296, 150, "Pouch"),
  } : {
    "back-yoke": zone(404, 376, 192, 70, "Back yoke"),
    "back-center": zone(268, 390, 464, 388, "Full back"),
    oversized: zone(-60, 340, 720, 720, "Oversized · crops left"),
  };

  return {
    silhouette: closed(OUTLINE),
    parts,
    printArea,
    zones,
    overlays: [...S, ...lines, ...tail],
  };
}

export default {
  id: "hoodie",
  name: "Warm-up Hoodie",
  styleCode: "ML-H01",
  category: "warmup",
  fabric: "fleece",
  spec: "Heavyweight brushed-back fleece · double-layer hood · dropped shoulder · 450 gsm",
  views: { front: buildView("front"), back: buildView("back") },
  defaultColors: { base: "dark", trim: "primary", accent: "secondary" },
};
