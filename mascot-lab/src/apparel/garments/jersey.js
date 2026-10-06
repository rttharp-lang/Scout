// Mascot Lab — Game Jersey (the reference garment).
//
// A modern basketball game tank, drawn as a technical flat on the 1000 × 1000
// artboard. Other garment files copy this structure:
//
//   1. a tiny geometry kit (bezier sampling, parallel offsets, mirroring, cutting)
//   2. MEASUREMENTS — every key point of the pattern, in artboard units
//   3. the left half of the outline as joined curves, mirrored for the right
//   4. derived construction: bindings, panels, stitching = offsets of the outline
//   5. views { front, back } → silhouette, parts, printArea, zones, overlays, text
//
// Conventions (see renderMockup.js):
//   · parts are clipped to the silhouette, so bands may overshoot the outline
//   · part.over = true paints the part above graphics + lettering (jock tag)
//   · part.texture = false keeps the fabric texture off it (woven labels, tapes)
//   · overlay "rib" with `follow` draws wales perpendicular to that centre line
//   · overlay "shadow"/"highlight"/"edge" `width` = blur radius in units
//   · printArea is clipped even-odd: a subpath inside another cuts a hole
//   · "chest-left" is the WEARER's left chest = the viewer's right on a front flat

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
/** Point on a polyline where it first crosses x = X. */
const atX = (pts, X) => untilX(pts, X).at(-1);

/** SVG path data: open polyline / closed polygon / several closed polygons. */
const open = (pts) => "M" + pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join(" L");
const closed = (pts) => open(pts) + " Z";
const rect = (x, y, w, h) => closed([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
/** Rounded rectangle as path data. */
function rrect(x, y, w, h, r) {
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}
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

/* ───────────────────────────── measurements ─────────────────────────────
 * Real NBA-cut tank proportions: chest (pit to pit) 720, body length 920 (≈1.28×),
 * shoulder strap 120 (1/6 chest), armhole drops to ~38% of body length.
 */
const HPS_Y = 42;                 // high point shoulder (top of strap at the neck)
const NECK_HALF = 150;            // half neck opening at HPS
const STRAP = 120;                // shoulder strap width
const SHOULDER_DROP = 15;         // strap top slopes down toward the armhole
const CHEST_HALF = 360;           // underarm, half chest
const PIT_Y = 396;                // underarm height
const HEM_HALF = 368;             // slight A-line to the hem
const HEM_SIDE_Y = 944;           // front hem at the side (split hem: front shorter)
const HEM_CENTER_Y = 962;         // front hem dips at centre
const BACK_HEM_SIDE_Y = 954;      // back panel runs a little longer
const BACK_HEM_CENTER_Y = 968;
const FRONT_NECK_Y = 226;         // V point
const BACK_NECK_Y = 98;           // back neck sits high
const NECK_BIND = 24;             // rib-knit neck binding width
const ARM_BIND = 20;              // armhole binding width
const PANEL_TOP_X = 190;          // side panel seam meets the armhole binding here
const PANEL_HEM_X = 180;          // …and the hem here
const HEM_STITCH = 15;            // coverstitch distance from the hem edge
const VENT_TOP = 900;             // side vent (split hem) height

const HPS = [CX - NECK_HALF, HPS_Y];
const TIP = [CX - NECK_HALF - STRAP, HPS_Y + SHOULDER_DROP];
const PIT = [CX - CHEST_HALF, PIT_Y];

/* ───────────────────────────── outline curves (viewer's left half) ─────────────
 * Traversal: neck centre → HPS → shoulder tip → armhole → underarm → side → hem → centre.
 * With that direction, offset(…, +d) moves INTO the garment.
 */
const shoulder = cubic(HPS, [HPS[0] - 40, HPS_Y + 4], [TIP[0] + 40, TIP[1] - 4], TIP, 8);
const armhole = cubic(TIP, [TIP[0] - 7, 212], [PIT[0] + 50, PIT_Y - 5], PIT, 40);

const VENT_STEP = 4;               // the vent edge sits just inside the side seam line
function sideSeam(hemY) {
  const seam = cubic(PIT, [PIT[0] - 2, 560], [CX - HEM_HALF - 1, 760], [CX - HEM_HALF, VENT_TOP], 28);
  // split-hem vent: below VENT_TOP front and back separate, so the edge steps in
  const vent = [[CX - HEM_HALF + VENT_STEP, VENT_TOP + 5], [CX - HEM_HALF + VENT_STEP + 0.5, hemY - 6], [CX - HEM_HALF + VENT_STEP + 3, hemY - 0.6]];
  return join(seam, vent);
}
function hemCurve(sideY, centerY) {
  const x0 = CX - HEM_HALF + VENT_STEP + 6;
  return cubic([x0, sideY], [x0 + 104, sideY + 10], [CX - 120, centerY], [CX, centerY], 30);
}
const frontNeck = cubic([CX, FRONT_NECK_Y], [CX - 60, FRONT_NECK_Y - 26], [HPS[0] + 7, 132], HPS, 36);
const backNeck = cubic([CX, BACK_NECK_Y], [CX - 74, BACK_NECK_Y], [HPS[0] + 8, 84], HPS, 30);

/** Full closed outline from a neck curve + hem heights. */
function outline(neck, hemSideY, hemCenterY) {
  const half = join(neck, shoulder, armhole, sideSeam(hemSideY), hemCurve(hemSideY, hemCenterY));
  return join(half, rev(mirror(half)));
}

/* ───────────────────────────── construction ───────────────────────────── */

function buildView(kind) {
  const isFront = kind === "front";
  const neck = isFront ? frontNeck : backNeck;
  const hemSideY = isFront ? HEM_SIDE_Y : BACK_HEM_SIDE_Y;
  const hemCenterY = isFront ? HEM_CENTER_Y : BACK_HEM_CENTER_Y;
  const sil = outline(neck, hemSideY, hemCenterY);

  // neck edge, left HPS → centre → right HPS; the body is on the −offset side
  const neckFull = join(rev(neck), mirror(neck));
  const neckUp = (pts) => join([[pts[0][0] - 4, 10]], pts, [[pts.at(-1)[0] + 4, 10]]);
  const neckSeam = offset(neckFull, -NECK_BIND);
  const neckBand = closed(join(neckUp(neckFull), rev(neckUp(neckSeam))));

  // armhole bindings (left, then mirrored right); overshoot past shoulder and side
  const armSeamL = offset(armhole, ARM_BIND);
  const armBandPts = join([[TIP[0], 10], [TIP[0] + ARM_BIND + 4, 10]], armSeamL, [[80, PIT_Y + ARM_BIND], [80, PIT_Y - 30]], rev(armhole));
  const armBandL = closed(armBandPts);
  const armBandR = closed(mirror(armBandPts));

  // side panels: seam from the binding down to the hem, gently following the body
  const panelTop = atX(armSeamL, PANEL_TOP_X);
  const panelSeamL = cubic(panelTop, [PANEL_TOP_X - 6, 600], [PANEL_HEM_X - 2, 790], [PANEL_HEM_X, 990], 30);
  const panelL = closed(join(panelSeamL, [[60, 990], [60, panelTop[1] - 40], [panelTop[0], panelTop[1] - 40]]));
  const panelR = closed(mirror(join(panelSeamL, [[60, 990], [60, panelTop[1] - 40], [panelTop[0], panelTop[1] - 40]])));

  // hem: twin-needle coverstitch parallel to the hem edge, across the whole width
  const hemL = hemCurve(hemSideY, hemCenterY);
  const hemFull = join(hemL, rev(mirror(hemL)));
  const hemStitch = offset(hemFull, HEM_STITCH);   // traversed left → right: inside (up) is +

  // print area = body panel inside bindings and side panels (overshoots top/bottom)
  const armInnerL = untilX(armSeamL, PANEL_TOP_X);   // tip → panel top
  const leftEdge = join(rev(panelSeamL), rev(armInnerL), [[armInnerL[0][0], 10]]);
  const printArea = closed(join([[neckSeam[0][0] - 4, 10]], neckSeam, [[neckSeam.at(-1)[0] + 4, 10]], rev(mirror(leftEdge)), leftEdge));

  // ── shading (soft, blurred regions) ──
  const underArmL = cubic([PIT[0] + 66, PIT_Y + 30], [PIT[0] + 92, PIT_Y + 80], [PIT[0] + 120, PIT_Y + 140], [PIT[0] + 132, PIT_Y + 230], 16);
  const drapeL = cubic([270, 600], [262, 700], [258, 800], [262, 925], 16);
  const drapeL2 = cubic([350, 700], [346, 780], [344, 860], [348, 935], 12);
  const sideShadeL = cubic([PANEL_TOP_X + 4, PIT_Y + 40], [PANEL_TOP_X - 2, 600], [PANEL_HEM_X + 6, 780], [PANEL_HEM_X + 8, 950], 16);
  const shading = [
    // body rolls away at the sides, just inside the side panels
    { kind: "shadow", d: lens(sideShadeL, 22), opacity: 0.13, width: 14 },
    { kind: "shadow", d: lens(mirror(sideShadeL), 22), opacity: 0.15, width: 14 },
    // under-arm drape pulling toward the centre
    { kind: "shadow", d: lens(underArmL, 11), opacity: 0.1, width: 10 },
    { kind: "shadow", d: lens(mirror(underArmL), 11), opacity: 0.12, width: 10 },
    { kind: "highlight", d: lens(underArmL.map(([x, y]) => [x + 18, y - 3]), 8), opacity: 0.035, width: 10 },
    { kind: "highlight", d: lens(mirror(underArmL).map(([x, y]) => [x - 18, y - 3]), 8), opacity: 0.03, width: 10 },
    // soft vertical drape in the lower body
    { kind: "shadow", d: lens(drapeL, 8), opacity: 0.09, width: 7 },
    { kind: "highlight", d: lens(drapeL.map(([x, y]) => [x + 13, y]), 6), opacity: 0.035, width: 7 },
    { kind: "shadow", d: lens(mirror(drapeL2), 7), opacity: 0.07, width: 7 },
    // chest catches the light
    { kind: "highlight", d: lens(cubic([360, 280], [390, 380], [410, 480], [420, 600], 12), 80), opacity: 0.035, width: 40 },
    // bindings cast a little shadow onto the body
    { kind: "edge", d: open(neckSeam), opacity: 0.2, width: 3 },
    { kind: "edge", d: open(armSeamL), opacity: 0.2, width: 3 },
    { kind: "edge", d: open(mirror(armSeamL)), opacity: 0.2, width: 3 },
  ];

  // ── lines ──
  const neckRib = { kind: "rib", d: neckBand, follow: open(offset(neckFull, -NECK_BIND / 2)), opacity: 0.2 };
  const armRibL = { kind: "rib", d: armBandL, follow: open(join([[TIP[0] + ARM_BIND / 2, 20]], offset(armhole, ARM_BIND / 2), [[90, PIT_Y + ARM_BIND / 2]])), opacity: 0.2 };
  const armRibR = { ...armRibL, d: armBandR, follow: open(mirror(join([[TIP[0] + ARM_BIND / 2, 20]], offset(armhole, ARM_BIND / 2), [[90, PIT_Y + ARM_BIND / 2]]))) };
  const lines = [
    neckRib, armRibL, armRibR,
    { kind: "seam", d: open(neckSeam) },
    { kind: "seam", d: open(armSeamL) },
    { kind: "seam", d: open(mirror(armSeamL)) },
    { kind: "seam", d: open(panelSeamL) },
    { kind: "seam", d: open(mirror(panelSeamL)) },
    // twin-needle on the body side of every binding, flatlock along the panels, hem coverstitch
    { kind: "stitch", d: open(offset(neckFull, -NECK_BIND - 4.5)), gap: 3.6 },
    { kind: "stitch", d: open(offset(armhole, ARM_BIND + 4.5)), gap: 3.6 },
    { kind: "stitch", d: open(mirror(offset(armhole, ARM_BIND + 4.5))), gap: 3.6 },
    { kind: "stitch", d: open(offset(panelSeamL, -4)), gap: 3.2 },
    { kind: "stitch", d: open(mirror(offset(panelSeamL, -4))), gap: 3.2 },
    { kind: "stitch", d: open(hemStitch), gap: 4 },
  ];
  if (isFront) {
    // V-neck mitre where the binding crosses at the centre
    lines.push({ kind: "seam", d: open([[CX, FRONT_NECK_Y], neckSeam[Math.floor(neckSeam.length / 2)]]), opacity: 0.3 });
  }
  // split-hem vents: bar-tack across the top of each slit
  const ventL = [[CX - HEM_HALF + 1, VENT_TOP + 1], [CX - HEM_HALF + 16, VENT_TOP + 1]];
  lines.push({ kind: "seam", d: open(ventL), opacity: 0.5, width: 1.6 });
  lines.push({ kind: "seam", d: open(mirror(ventL)), opacity: 0.5, width: 1.6 });

  const parts = [
    { id: "body", d: closed(sil), fill: "base" },
    { id: "side-panel-left", d: panelL, fill: "trim" },
    { id: "side-panel-right", d: panelR, fill: "trim" },
    { id: "armhole-binding-left", d: armBandL, fill: "trim" },
    { id: "armhole-binding-right", d: armBandR, fill: "trim" },
    { id: "neck-binding", d: neckBand, fill: "trim" },
    // hem tape: a little woven tab sealing the top of each split-hem vent
    { id: "hem-tape-left", d: rrect(CX - HEM_HALF + 2, VENT_TOP - 9, 15, 9, 1.5), fill: "accent", texture: false },
    { id: "hem-tape-right", d: rrect(mx(CX - HEM_HALF + 2) - 15, VENT_TOP - 9, 15, 9, 1.5), fill: "accent", texture: false },
  ];

  const overlays = [...shading, ...lines];

  if (isFront) {
    // jock tag: woven label at the front lower-left, above the hem stitching
    const tx = 206, ty = 840, tw = 78, th = 58;
    parts.push(
      { id: "jock-tag", d: rrect(tx, ty, tw, th, 3), fill: "white", over: true, texture: false },
      { id: "jock-tag-band", d: rect(tx, ty + th - 9, tw, 9), fill: "trim", over: true },
      { id: "jock-tag-mark", d: rrect(tx + 9, ty + 9, 22, 24, 2), fill: "trim", over: true },
      { id: "jock-tag-size", d: closed([[tx + 40, ty + 13], [tx + 69, ty + 13], [tx + 69, ty + 17], [tx + 40, ty + 17]]) + " " +
          closed([[tx + 40, ty + 23], [tx + 62, ty + 23], [tx + 62, ty + 27], [tx + 40, ty + 27]]), fill: "#9AA1AC", over: true },
    );
    overlays.push(
      { kind: "shadow", d: rrect(tx + 1, ty + 3, tw, th, 3), opacity: 0.18, width: 2.5 },
      { kind: "seam", d: rrect(tx + 2.5, ty + 2.5, tw - 5, th - 5, 2), opacity: 0.22, width: 0.8 },
    );
  }

  const front = {
    "chest-left": { x: 574, y: 240, w: 118, h: 108, label: "Left chest" },
    "chest-center": { x: 410, y: 264, w: 180, h: 132, label: "Center chest" },
    center: { x: 245, y: 300, w: 510, h: 480, label: "Full front" },
    oversized: { x: 214, y: 250, w: 860, h: 860, label: "Oversized · crops right" },
  };
  const back = {
    "back-yoke": { x: 420, y: 128, w: 160, h: 64, label: "Back yoke" },
    "back-center": { x: 270, y: 262, w: 460, h: 470, label: "Full back" },
    oversized: { x: -74, y: 250, w: 860, h: 860, label: "Oversized · crops left" },
  };

  return {
    silhouette: closed(sil),
    parts,
    printArea,
    zones: isFront ? front : back,
    overlays,
    text: isFront
      ? { number: { x: 404, y: 408, w: 192, h: 168 } }
      : { name: { x: 286, y: 140, w: 428, h: 70 }, number: { x: 296, y: 228, w: 408, h: 330 } },
  };
}

export default {
  id: "jersey",
  name: "Game Jersey",
  styleCode: "ML-J01",
  category: "uniform",
  fabric: "mesh",
  spec: "Sublimated poly mesh · rib-knit V binding · split hem · 160 gsm",
  views: { front: buildView("front"), back: buildView("back") },
  defaultColors: { base: "primary", trim: "secondary", accent: "accent" },
};
