// Mascot Lab — Game Shorts (ML-S01).
//
// Modern basketball game shorts drawn as a technical flat on the 1000 × 1000
// artboard, built the same way as garments/jersey.js (the reference garment):
//
//   1. the geometry kit (bezier sampling, offsets, mirroring, cutting)
//   2. MEASUREMENTS — a knee-length short (≈ 9" inseam look) with a wide elastic
//      waistband, wide straight legs with a touch of flare and a curved side split
//   3. the left half of the outline as joined curves, mirrored for the right
//   4. derived construction: waistband, side panels, pockets, rise + inseams, hems
//   5. views { front, back } → silhouette, parts, printArea, zones, overlays
//
// Conventions (see renderMockup.js): parts are clipped to the silhouette (bands may
// overshoot), `over` parts paint above graphics (drawcords, aglets, eyelets, label),
// `texture: false` keeps the mesh off hardware and labels, "leg-left" is the WEARER's
// left leg = the viewer's RIGHT on the front flat (and the viewer's left on the back).

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
const mx = (x) => 2 * CX - x;
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/**
 * Parallel offset of a polyline by d (positive = to the right of travel when y points
 * down, i.e. normal (dy, −dx)). `d` may be a function of t ∈ [0, 1] along the line
 * (tapered offsets). Corners are mitred (limited to 3·d).
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
    const di = typeof d === "function" ? d(i / Math.max(1, n - 1)) : d;
    const a = nrm[Math.max(0, i - 1)], b = nrm[Math.min(nrm.length - 1, i)];
    let ax = a[0] + b[0], ay = a[1] + b[1];
    const L = Math.hypot(ax, ay) || 1;
    ax /= L; ay /= L;
    const dot = Math.max(1 / 3, ax * b[0] + ay * b[1]);
    return [p[0] + (ax * di) / dot, p[1] + (ay * di) / dot];
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
/** The part of a polyline after it first crosses y = Y. */
const fromY = (pts, Y) => {
  const head = untilY(pts, Y);
  return join([head.at(-1)], pts.slice(head.length - 1));
};
/** Point on a polyline where it first crosses y = Y. */
const atY = (pts, Y) => untilY(pts, Y).at(-1);
/** Sub-polyline between two y levels (pts must run downward through both). */
const betweenY = (pts, y0, y1) => untilY(fromY(pts, y0), y1);

/** Keep the part of a polyline before it first crosses x = X (crossing point included). */
function untilX(pts, X) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
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
const fromX = (pts, X) => {
  const head = untilX(pts, X);
  return join([head.at(-1)], pts.slice(head.length - 1));
};

/** Arc-length resampling helpers (for cords, braids, ticks). */
function lengths(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return L;
}
/** Point + unit tangent at arc length s along pts. */
function along(pts, L, s) {
  s = Math.max(0, Math.min(L.at(-1), s));
  let i = 1;
  while (i < L.length - 1 && L[i] < s) i++;
  const seg = L[i] - L[i - 1] || 1, t = (s - L[i - 1]) / seg;
  const a = pts[i - 1], b = pts[i];
  const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * t, a[1] + dy * t], t: [dx / m, dy / m] };
}

/** SVG path data: open polyline / closed polygon. */
const open = (pts) => "M" + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join(" L");
const closed = (pts) => open(pts) + " Z";
/** Rounded rectangle as path data. */
function rrect(x, y, w, h, r) {
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}
/** Circle as path data. */
const circle = (cx, cy, r) => `M${r1(cx - r)} ${r1(cy)} A${r} ${r} 0 1 0 ${r1(cx + r)} ${r1(cy)} A${r} ${r} 0 1 0 ${r1(cx - r)} ${r1(cy)} Z`;
/** Soft lens/fold shape along a curve: width tapers to 0 at both ends. */
function lens(pts, w) {
  const n = pts.length - 1;
  const side = (s) => pts.map((p, i) => {
    const t = i / n, k = Math.sin(Math.PI * t) * w * s;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] + (dy / L) * k, p[1] - (dx / L) * k];
  });
  return closed(join(side(1), rev(side(-1))));
}
/** A straight fold (lens) between two points. */
const fold = (a, b, w, bow = 0) => {
  const m = [(a[0] + b[0]) / 2 + bow, (a[1] + b[1]) / 2];
  return lens(cubic(a, m, m, b, 12), w);
};
/** Sub-polyline between arc lengths s0 and s1 (end points interpolated). */
function sub(pts, L, s0, s1) {
  const out = [along(pts, L, s0).p];
  for (let i = 0; i < pts.length; i++) if (L[i] > s0 && L[i] < s1) out.push(pts[i]);
  out.push(along(pts, L, s1).p);
  return out;
}
/** A short line across a centre line at arc length s (aglet crimps). */
function crimp(pts, L, s, half) {
  const a = along(pts, L, s), n = [-a.t[1], a.t[0]];
  return open([[a.p[0] + n[0] * half, a.p[1] + n[1] * half], [a.p[0] - n[0] * half, a.p[1] - n[1] * half]]);
}
/** Constant-width tube along a centre line (cords). */
function tube(pts, w) {
  return closed(join(offset(pts, w / 2), rev(offset(pts, -w / 2))));
}

/**
 * Rib-knit texture for a wide band (waistband, cuff) as rows of `follow` ribs: the
 * renderer strokes each row once with wales perpendicular to the row's centre line
 * (one ~40-unit stroke per row). `levels` bound the rows top → bottom (a y, or a
 * polyline running x0 → x1); `centers` are the rows' centre-line heights.
 */
function ribRows(x0, x1, levels, centers, opacity) {
  const edge = (e) => (typeof e === "number" ? [[x0, e], [x1, e]] : e);
  return centers.map((yc, i) => ({
    kind: "rib", d: closed(join(edge(levels[i]), rev(edge(levels[i + 1])))), follow: open([[x0, yc], [x1, yc]]), opacity,
  }));
}

/**
 * Order overlays for the renderer (it pays per overlay for clipping, and blurs once per
 * distinct radius per run of soft overlays):
 *   · every soft overlay (shadow / highlight / edge) first → ONE cached blurred layer,
 *     blur radii snapped to a few steps
 *   · seams / stitches with the same look merged into one multi-subpath overlay
 *   · rib, then seams, then all stitching last (one twin-needle pass)
 */
const SOFT = new Set(["shadow", "highlight", "edge"]);
const BLUR_STEPS = [1.5, 2.5, 4, 7, 12, 22];
function finishOverlays(list) {
  const snap = (w) => BLUR_STEPS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  const soft = list.filter((o) => SOFT.has(o.kind)).map((o) => (o.width != null ? { ...o, width: snap(o.width) } : o));
  const rest = [], merged = new Map();
  for (const o of list) {
    if (SOFT.has(o.kind)) continue;
    if (o.kind === "seam" || o.kind === "stitch") {
      const key = `${o.kind}|${o.opacity ?? ""}|${o.width ?? ""}|${o.gap ?? ""}`;
      const m = merged.get(key);
      if (m) { m.d += " " + o.d; continue; }
      const c = { ...o };
      merged.set(key, c);
      rest.push(c);
    } else rest.push(o);
  }
  const order = { rib: 0, seam: 1, stitch: 2 };
  return [...soft, ...rest.sort((a, b) => order[a.kind] - order[b.kind])];
}

/* ───────────────────────────── trims & hardware ───────────────────────────── */

/**
 * Braided drawcord with a metal tip, hanging from an eyelet: parts (over) + overlays.
 * `c` is the cord centre line from the eyelet down to the tip end.
 */
function drawcord(parts, overlays, c, { w, tipLen, id }) {
  const L = lengths(c), total = L.at(-1);
  const body = sub(c, L, 0, total - tipLen + 1);
  const tip = sub(c, L, total - tipLen, total);
  parts.push(
    { id: `drawcord-${id}`, d: tube(body, w), fill: "accent", over: true, texture: false },
    { id: `cord-tip-${id}`, d: tube(tip, w + 1.6), fill: "#B4BAC3", over: true, texture: false },
    { id: `cord-tip-shade-${id}`, d: tube(offset(tip, w * 0.3), w * 0.4), fill: "#8D949E", over: true, texture: false },
    { id: `cord-tip-shine-${id}`, d: tube(offset(tip, -w * 0.22), 2), fill: "#F2F4F7", over: true, texture: false },
  );
  // braid: interlocking chevrons down the cord
  let ticks = "";
  for (let s = 9; s < total - tipLen - 2; s += w * 0.44) {
    const a = along(c, L, s), b = along(c, L, s + w * 0.26);
    const n = [-a.t[1], a.t[0]];
    const pl = [a.p[0] + n[0] * w * 0.42, a.p[1] + n[1] * w * 0.42];
    const pr = [a.p[0] - n[0] * w * 0.42, a.p[1] - n[1] * w * 0.42];
    ticks += ` M${r1(pl[0])} ${r1(pl[1])} L${r1(b.p[0])} ${r1(b.p[1])} L${r1(pr[0])} ${r1(pr[1])}`;
  }
  overlays.push(
    { kind: "shadow", d: tube(shift(c, 3, 4.5), w), opacity: 0.34, width: 2.5 },
    { kind: "seam", d: ticks.trim(), opacity: 0.3, width: 0.7 },
    { kind: "seam", d: tube(body, w), opacity: 0.38, width: 0.8 },
    { kind: "seam", d: tube(tip, w + 1.6), opacity: 0.6, width: 0.8 },
    { kind: "seam", d: crimp(c, L, total - tipLen + 4.5, w * 0.8 + 0.8), opacity: 0.45, width: 0.9 },
    { kind: "seam", d: crimp(c, L, total - tipLen + 7.5, w * 0.8 + 0.8), opacity: 0.3, width: 0.7 },
  );
}

/** Metal eyelet (custom hardware) set into the waistband. */
function eyelet(parts, overlays, x, y, r) {
  parts.push(
    { id: "eyelet", d: circle(x, y, r) + " " + circle(x, y, r * 0.56), fill: "#B4BAC3", rule: "evenodd", over: true, texture: false },
    { id: "eyelet-shine", d: `M${r1(x - r * 0.86)} ${r1(y - r * 0.2)} A${r * 0.86} ${r * 0.86} 0 0 1 ${r1(x + r * 0.2)} ${r1(y - r * 0.86)} L${r1(x + r * 0.16)} ${r1(y - r * 0.66)} A${r * 0.66} ${r * 0.66} 0 0 0 ${r1(x - r * 0.66)} ${r1(y - r * 0.16)} Z`, fill: "#EEF1F4", over: true, texture: false },
    { id: "eyelet-hole", d: circle(x, y, r * 0.56), fill: "black", over: true, texture: false },
  );
  overlays.push(
    { kind: "edge", d: circle(x + 0.6, y + 0.8, r + 0.4), opacity: 0.28, width: 1.2 },
    { kind: "seam", d: circle(x, y, r), opacity: 0.35, width: 0.7 },
  );
}

/* ───────────────────────────── measurements ─────────────────────────────
 * Basketball-short proportions, size L at ≈ 34 units per inch: waist 18.6" (elastic,
 * drawn lightly stretched as on a spec flat), seat 24", outseam 22.7" incl. a 2"
 * elastic waistband, front rise 12.9", inseam 9.2", hem 12" flat per leg with a slight
 * flare, and a curved side split 3" high.
 */
const WAIST_Y = 112;              // top of the waistband at the sides
const WAIST_HALF = 316;           // half waist (elastic, drawn lightly stretched as on a spec flat)
const WB = 68;                    // waistband height
const WB_Y = WAIST_Y + WB;        // waistband / body join
const WB_FLARE = 3;               // band widens a touch toward its lower edge
const BODY_HALF = WAIST_HALF + 6; // gathered body pokes out under the band
const HIP_Y = 352;                // widest point of the seat
const HIP_HALF = 410;
const VENT_Y = 786;               // top of the curved side split
const SIDE_HALF = 436;            // outer leg at the split (slight flare)
const HEM_Y = 884;                // hem at the side (after the split curve)
const INSEAM_HEM = [474, 866];    // inner hem corner (hem rises toward the inseam)
const CROTCH_Y = 552;             // crotch point (front rise 12.9")
const HEM_STITCH = 16;            // coverstitch distance from the hem edge
const PANEL_TOP_W = 40;           // side panel width at the waistband…
const PANEL_HEM_W = 92;           // …and at the hem (wedge, wider at the hem)

/* ───────────────────────────── outline curves (viewer's left half) ─────────────
 * Traversal: waist centre → band corner → band side → body flare → side seam →
 * split curve → hem → inseam → crotch. With that direction offset(…, +d) moves
 * INTO the garment.
 */
function halfOutline(isFront) {
  const topY = isFront ? WAIST_Y + 3 : WAIST_Y - 3;     // front dips, back rises a touch
  const hemDrop = isFront ? 0 : 6;                      // back panel runs a little longer
  const x0 = CX - WAIST_HALF;
  const waistTop = cubic([CX, topY], [CX - 140, topY], [x0 + 70, WAIST_Y], [x0 + 7, WAIST_Y], 18);
  const corner = cubic([x0 + 7, WAIST_Y], [x0 + 2, WAIST_Y], [x0, WAIST_Y + 2], [x0, WAIST_Y + 7], 4);
  const bandSide = line([x0, WAIST_Y + 7], [x0 - WB_FLARE, WB_Y], 3);
  const ledge = line([x0 - WB_FLARE, WB_Y], [CX - BODY_HALF, WB_Y + 2], 2);
  const flare = cubic([CX - BODY_HALF, WB_Y + 2], [CX - BODY_HALF - 36, WB_Y + 26], [CX - HIP_HALF + 3, HIP_Y - 104], [CX - HIP_HALF, HIP_Y], 20);
  const side = cubic([CX - HIP_HALF, HIP_Y], [CX - HIP_HALF - 6, 470], [CX - SIDE_HALF + 3, 660], [CX - SIDE_HALF, VENT_Y], 26);
  // the outline at the split is the UNDER layer's corner (back panel on the front view);
  // the top layer's rounder corner is drawn inside it (see splitEdge)
  const split = cubic([CX - SIDE_HALF, VENT_Y], [CX - SIDE_HALF + 0.5, VENT_Y + 58], [CX - SIDE_HALF + 5, HEM_Y + hemDrop - 3], [CX - SIDE_HALF + 38, HEM_Y + hemDrop], 18);
  const hem = cubic([CX - SIDE_HALF + 38, HEM_Y + hemDrop], [CX - 250, HEM_Y + hemDrop + 3], [CX - 120, INSEAM_HEM[1] + hemDrop + 8], [INSEAM_HEM[0], INSEAM_HEM[1] + hemDrop], 30);
  const inseam = cubic([INSEAM_HEM[0], INSEAM_HEM[1] + hemDrop], [INSEAM_HEM[0] + 5, 770], [CX - 10, 630], [CX, CROTCH_Y], 24);
  return { waistTop, corner, bandSide, ledge, flare, side, split, hem, inseam,
    all: join(waistTop, corner, bandSide, ledge, flare, side, split, hem, inseam) };
}

/* ───────────────────────────── construction ───────────────────────────── */

function buildView(kind) {
  const isFront = kind === "front";
  const H = halfOutline(isFront);
  const sil = join(H.all, rev(mirror(H.all)));
  const hemDrop = isFront ? 0 : 6;

  // waistband: a band across the top, overshooting the outline (clipped by it)
  const bandLow = cubic([CX - BODY_HALF - 20, WB_Y], [CX - 120, WB_Y + 1], [CX + 120, WB_Y + 1], [CX + BODY_HALF + 20, WB_Y], 16);
  const band = closed(join([[CX - BODY_HALF - 20, 60]], bandLow, [[CX + BODY_HALF + 20, 60]]));

  // side panels: a wedge down the outer leg, wider at the hem
  const sideRun = join(H.flare, H.side);
  const panelSeamL = join(
    offset(sideRun, (t) => PANEL_TOP_W + (PANEL_HEM_W - PANEL_TOP_W) * Math.pow(t, 1.25)),
  );
  // extend: up into the band, and straight on down past the hem
  const pTop = panelSeamL[0], pEnd = panelSeamL.at(-1), pPrev = panelSeamL.at(-6);
  const dir = [pEnd[0] - pPrev[0], pEnd[1] - pPrev[1]];
  const k = (HEM_Y + 40 - pEnd[1]) / dir[1];
  const panelSeam = join([[pTop[0] + 6, WB_Y - 10]], panelSeamL, [[pEnd[0] + dir[0] * k, HEM_Y + 40]]);
  const panelSeamCut = untilY(fromY(panelSeam, WB_Y), HEM_Y + hemDrop + 30);   // visible part
  const panelPts = join(panelSeam, [[0, HEM_Y + 60], [0, WB_Y - 10]]);
  const panelL = closed(panelPts);
  const panelR = closed(mirror(panelPts));

  // hem: twin-needle coverstitch following the split curve and the hem
  // curved split: the top layer's corner rounds off inside the under layer's corner
  const SPLIT_X = CX - SIDE_HALF + 104;
  const hemTail = fromX(H.hem, SPLIT_X);
  const splitEdge = cubic([CX - SIDE_HALF + 1.2, VENT_Y + 4], [CX - SIDE_HALF + 4, VENT_Y + 62], [CX - SIDE_HALF + 34, hemTail[0][1] - 3], hemTail[0], 22);
  const crescent = closed(join(H.split, untilX(H.hem, SPLIT_X), rev(splitEdge)));
  const hemRun = join(splitEdge, hemTail);
  const hemStitch = offset(hemRun, HEM_STITCH).slice(1);
  // bar-tack across the top of the split
  const ventTack = [[CX - SIDE_HALF + 1, VENT_Y + 1], [CX - SIDE_HALF + 15, VENT_Y + 1]];

  // rise + inseams
  const riseSeam = line([CX, WB_Y], [CX, CROTCH_Y], 2);
  const inseamStitch = offset(H.inseam, 6);

  // print area: body inside band + side panels (overshoots the hem and crotch)
  const seamL = fromY(panelSeam, WB_Y + 1);              // left panel seam, top → bottom
  const printArea = closed(join(
    mirror(seamL),                                       // right seam, top → bottom
    [[mx(seamL.at(-1)[0]), HEM_Y + 80], [seamL.at(-1)[0], HEM_Y + 80]],
    rev(seamL),                                          // left seam, bottom → top
  ));

  /* ── shading ── */
  const shading = [];
  // the body rolls away just inside the side panels
  const sideShade = shift(betweenY(panelSeamCut, HIP_Y - 30, HEM_Y - 30), 18, 0);
  shading.push({ kind: "shadow", d: lens(sideShade, 20), opacity: 0.12, width: 14 });
  shading.push({ kind: "shadow", d: lens(mirror(sideShade), 20), opacity: 0.14, width: 14 });
  // elastic gathers: short vertical folds under the band
  const gathers = [-232, -176, -118, -58, 6, 64, 122, 180, 236];
  gathers.forEach((dx, i) => {
    const x = CX + dx + (i % 2 ? 4 : -3), len = 34 + ((i * 37) % 26);
    shading.push({ kind: "shadow", d: fold([x, WB_Y + 2], [x + (dx < 0 ? -4 : 4), WB_Y + len], 4.5), opacity: 0.09, width: 3.5 });
    shading.push({ kind: "highlight", d: fold([x + 13, WB_Y + 3], [x + 14, WB_Y + len * 0.7], 4), opacity: 0.05, width: 3.5 });
  });
  // crotch: drape folds radiating down and out from the crotch point
  for (const s of [1, -1]) {
    const m = (pts) => (s > 0 ? pts : mirror(pts));
    shading.push({ kind: "shadow", d: lens(m(cubic([CX - 18, CROTCH_Y + 6], [CX - 40, CROTCH_Y + 50], [CX - 80, CROTCH_Y + 110], [CX - 104, CROTCH_Y + 190], 14)), 9), opacity: 0.12, width: 8 });
    shading.push({ kind: "highlight", d: lens(m(cubic([CX - 46, CROTCH_Y - 4], [CX - 70, CROTCH_Y + 40], [CX - 108, CROTCH_Y + 96], [CX - 138, CROTCH_Y + 170], 14)), 9), opacity: 0.045, width: 8 });
    shading.push({ kind: "shadow", d: lens(m(cubic([CX - 6, CROTCH_Y - 70], [CX - 10, CROTCH_Y - 30], [CX - 16, CROTCH_Y], [CX - 26, CROTCH_Y + 40], 10)), 7), opacity: 0.1, width: 6 });
    // long vertical drape down each leg
    shading.push({ kind: "shadow", d: lens(m(cubic([300, 470], [292, 600], [284, 720], [282, 846], 16)), 10), opacity: 0.09, width: 9 });
    shading.push({ kind: "highlight", d: lens(m(cubic([318, 480], [312, 600], [306, 720], [304, 840], 16)), 8), opacity: 0.04, width: 9 });
    shading.push({ kind: "shadow", d: lens(m(cubic([400, 640], [394, 720], [390, 790], [392, 850], 12)), 7), opacity: 0.07, width: 7 });
    // inseam turns under
    shading.push({ kind: "shadow", d: lens(m(offset(H.inseam, 12)), 9), opacity: 0.1, width: 8 });
  }
  // seat / front catches the light
  shading.push({ kind: "highlight", d: lens(cubic([300, 230], [330, 300], [350, 380], [360, 470], 12), 60), opacity: 0.035, width: 36 });
  // band casts a soft shadow onto the body; panels cast a little edge
  shading.push({ kind: "edge", d: open(bandLow), opacity: 0.22, width: 3 });
  shading.push({ kind: "edge", d: open(panelSeamCut), opacity: 0.14, width: 3 });
  shading.push({ kind: "edge", d: open(mirror(panelSeamCut)), opacity: 0.14, width: 3 });
  // split: the under layer shows in shadow below the top layer's rounded corner
  shading.push({ kind: "shadow", d: crescent, opacity: 0.24, width: 2.5 });
  shading.push({ kind: "shadow", d: closed(mirror(join(H.split, untilX(H.hem, SPLIT_X), rev(splitEdge)))), opacity: 0.24, width: 2.5 });
  shading.push({ kind: "edge", d: open(splitEdge), opacity: 0.25, width: 2 });
  shading.push({ kind: "edge", d: open(mirror(splitEdge)), opacity: 0.25, width: 2 });

  /* ── lines ── */
  // front: the panel seam opens into a pocket between two bar-tacks
  const POCKET = isFront ? [WB_Y + 22, WB_Y + 212] : null;
  const panelStitch = offset(panelSeamCut, -4.5);
  const panelStitchRuns = POCKET
    ? [untilY(panelStitch, POCKET[0]), fromY(panelStitch, POCKET[1])]
    : [panelStitch];
  const lines = [
    ...ribRows(CX - BODY_HALF - 20, CX + BODY_HALF + 20, [40, WAIST_Y + WB / 2, bandLow], [WAIST_Y + 17, WAIST_Y + WB * 0.75], 0.16),
    { kind: "seam", d: open(bandLow) },
    { kind: "seam", d: open(panelSeamCut) },
    { kind: "seam", d: open(mirror(panelSeamCut)) },
    { kind: "seam", d: open(riseSeam), opacity: 0.3 },
    { kind: "seam", d: open(splitEdge), opacity: 0.5, width: 1.1 },
    { kind: "seam", d: open(mirror(splitEdge)), opacity: 0.5, width: 1.1 },
    // twin-needle: band join, band top edge, panels (flatlock), rise, inseams, hem
    { kind: "stitch", d: open(offset(bandLow, -5)), gap: 3.6 },
    { kind: "stitch", d: open(line([CX - BODY_HALF - 10, WAIST_Y + 8], [CX + BODY_HALF + 10, WAIST_Y + 8], 2)), gap: 3.2 },
    ...panelStitchRuns.flatMap((r) => [{ kind: "stitch", d: open(r), gap: 3.2 }, { kind: "stitch", d: open(mirror(r)), gap: 3.2 }]),
    { kind: "stitch", d: open(line([CX + 5, WB_Y + 6], [CX + 5, CROTCH_Y - 6], 2)), gap: 3.2 },
    { kind: "stitch", d: open(inseamStitch), gap: 3.2 },
    { kind: "stitch", d: open(mirror(inseamStitch)), gap: 3.2 },
    { kind: "stitch", d: open(hemStitch), gap: 4 },
    { kind: "stitch", d: open(mirror(hemStitch)), gap: 4 },
    // split: bar-tack across the top of each side split
    { kind: "seam", d: open(ventTack), opacity: 0.55, width: 2 },
    { kind: "seam", d: open(mirror(ventTack)), opacity: 0.55, width: 2 },
  ];
  if (POCKET) {
    // side-seam pocket: dark slit on the panel side, single-needle lip on the body side,
    // bar-tacks across the seam at both ends
    const pocket = betweenY(panelSeamCut, POCKET[0], POCKET[1]);
    shading.unshift(
      { kind: "shadow", d: lens(shift(pocket, -2.5, 0), 4), opacity: 0.42, width: 2 },
      { kind: "shadow", d: lens(mirror(shift(pocket, -2.5, 0)), 4), opacity: 0.42, width: 2 },
    );
    const lip = offset(pocket, 5);
    lines.push({ kind: "stitch", d: open(lip), gap: 0, width: 0.9 }, { kind: "stitch", d: open(mirror(lip)), gap: 0, width: 0.9 });
    for (const pt of [pocket[0], pocket.at(-1)]) {
      const tack = [[pt[0] - 7, pt[1]], [pt[0] + 7, pt[1]]];
      lines.push({ kind: "seam", d: open(tack), opacity: 0.6, width: 2.4 }, { kind: "seam", d: open(mirror(tack)), opacity: 0.6, width: 2.4 });
    }
  }

  const parts = [
    { id: "body", d: closed(sil), fill: "base" },
    { id: "side-panel-left", d: panelL, fill: "trim" },
    { id: "side-panel-right", d: panelR, fill: "trim" },
    { id: "waistband", d: band, fill: "trim" },
  ];
  const overlays = [...shading, ...lines];

  if (isFront) {
    // drawcord: two metal eyelets in the band, braided cord ends hanging at centre front
    const eyes = [[CX - 20, WAIST_Y + 34], [CX + 20, WAIST_Y + 34]];
    for (const [ex, ey] of eyes) eyelet(parts, overlays, ex, ey, 9.5);
    drawcord(parts, overlays, cubic(eyes[0], [CX - 26, WAIST_Y + 100], [CX - 38, WAIST_Y + 170], [CX - 32, WAIST_Y + 236], 26), { w: 10, tipLen: 28, id: 0 });
    drawcord(parts, overlays, cubic(eyes[1], [CX + 24, WAIST_Y + 110], [CX + 34, WAIST_Y + 190], [CX + 24, WAIST_Y + 262], 26), { w: 10, tipLen: 28, id: 1 });

    // jock tag: woven label on the wearer's right leg (viewer's left), above the hem
    const tx = 180, ty = 782, tw = 54, th = 40;
    parts.push(
      { id: "jock-tag", d: rrect(tx, ty, tw, th, 2.5), fill: "white", over: true, texture: false },
      { id: "jock-tag-band", d: rrect(tx, ty + th - 7, tw, 7, 0.5), fill: "trim", over: true },
      { id: "jock-tag-mark", d: rrect(tx + 7, ty + 7, 15, 17, 1.5), fill: "trim", over: true },
      { id: "jock-tag-size", d: rrect(tx + 27, ty + 9, 20, 3, 1) + " " + rrect(tx + 27, ty + 16, 15, 3, 1), fill: "#9AA1AC", over: true },
    );
    overlays.push(
      { kind: "shadow", d: rrect(tx + 1, ty + 2.5, tw, th, 2.5), opacity: 0.18, width: 2.5 },
      { kind: "seam", d: rrect(tx + 2, ty + 2, tw - 4, th - 4, 1.5), opacity: 0.22, width: 0.8 },
    );
  } else {
    // a shallow back yoke, twin-needled (the back rise seam runs from its point)
    const yoke = cubic([atY(panelSeamCut, WB_Y + 64)[0] - 2, WB_Y + 64], [300, WB_Y + 80], [420, WB_Y + 106], [CX, WB_Y + 116], 20);
    overlays.push(
      { kind: "seam", d: open(yoke) }, { kind: "seam", d: open(mirror(yoke)) },
      { kind: "stitch", d: open(offset(yoke, 4.5)), gap: 3.2 },
      { kind: "stitch", d: open(mirror(offset(yoke, 4.5))), gap: 3.2 },
      { kind: "edge", d: open(join(yoke, rev(mirror(yoke)))), opacity: 0.1, width: 3 },
    );
    // woven label at the centre-back waistband
    const lw = 46, lh = 22, lx = CX - lw / 2, ly = WAIST_Y + 22;
    parts.push(
      { id: "label", d: rrect(lx, ly, lw, lh, 2), fill: "white", over: true, texture: false },
      { id: "label-mark", d: rrect(lx + 6, ly + 5, 12, 12, 1.5), fill: "base", over: true, texture: false },
      { id: "label-lines", d: rrect(lx + 22, ly + 7, 18, 3, 1) + " " + rrect(lx + 22, ly + 12, 13, 3, 1), fill: "#9AA1AC", over: true, texture: false },
    );
    overlays.push(
      { kind: "shadow", d: rrect(lx + 1, ly + 2.5, lw, lh, 2), opacity: 0.2, width: 2 },
      { kind: "seam", d: rrect(lx + 2, ly + 2, lw - 4, lh - 4, 1.5), opacity: 0.2, width: 0.7 },
    );
  }

  const zones = isFront
    ? {
      // wearer's left leg = viewer's right
      "leg-left": { x: 584, y: 616, w: 170, h: 160, label: "Left leg" },
      "leg-right": { x: 246, y: 616, w: 170, h: 160, label: "Right leg" },
      // at scale 1 the mascot rises out of the left leg, cropped by hem, side panel and crotch
      oversized: { x: 366, y: 316, w: 860, h: 860, label: "Oversized · crops left leg" },
    }
    : {
      // wearer's left leg = viewer's left on the back flat
      "back-leg": { x: 246, y: 606, w: 170, h: 164, label: "Back leg" },
      "waist-back": { x: 424, y: WB_Y + 12, w: 152, h: 82, label: "Waist back" },
    };

  return {
    silhouette: closed(sil),
    parts,
    printArea,
    zones,
    overlays: finishOverlays(overlays),
  };
}

export default {
  id: "shorts",
  name: "Game Shorts",
  styleCode: "ML-S01",
  category: "uniform",
  fabric: "mesh",
  spec: "Sublimated poly mesh · 2\" elastic waist · 9\" inseam · split hem · 150 gsm",
  views: { front: buildView("front"), back: buildView("back") },
  defaultColors: { base: "primary", trim: "secondary", accent: "accent" },
};
