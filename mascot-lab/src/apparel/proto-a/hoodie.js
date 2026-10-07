// proto-a · Oversized heavyweight warm-up hoodie, size L, authored for the height-field
// photo renderer (engine.js). Pure data + math: no DOM, importable in a worker or Node.
//
// Everything is authored in INCHES (x → viewer's right, y ↓, origin = centre front at
// high-point-shoulder height) against the flat spec:
//   chest 25" (1" below armhole) · body 27.5" HPS→hem incl. 3" rib band · dropped shoulder,
//   seam 3.5" past the natural shoulder, across-shoulder 23.5" · sleeve 23" from the shoulder
//   seam incl. a 4" × 3.25" rib cuff, bicep 10.5" flat · hood 14.5" × 11", double layer ·
//   kangaroo pocket 14" × 7.5" with angled openings · drawcords hang 9" below the neckline,
//   1" aglets.
// Ghost-mannequin front: arms hang ~19° out (axis shoulder → cuff) with a slight elbow bend,
// the hood stands behind the neck, its opening shows the lining and the inside back neck.
// Back: the hood lies flat down the upper back.
//
// A view = layers (bottom → top). Each layer has
//   parts    painted regions (role base|trim|accent|fixed, material) — the visible mask
//   volumes  the height model: "inflate" (distance-field pillow of a shape), "tube" (spine +
//            radius, e.g. sleeves/cords), "cavity" (concave bowl, e.g. hood interior)
//   folds    authored relief: ridges, creases, rolls, ripples (inches)
//   on       sit on top of the (blurred) surface below (pocket, cords, hood rims)
// plus details (seams, cover stitching, rib, braid), printArea, zones (artboard units).
import {
  cubic, spline, splineClosed, line, join, rev, mirror, shift, add, sub, norm, dist, offset,
  ellipse, ribbon, tubeOutline, knots, along, slice, polyLength, resample, lerp, dirDeg, bbox,
} from "./geom.js";

/* ───────────────────────────── key measurements (inches) ───────────────────────────── */

export const SPEC = {
  chest: 25, bodyLength: 27.5, acrossShoulder: 23.5, sleeve: 23, bicepFlat: 10.5,
  cuffW: 4, cuffH: 3.25, band: 3, hoodH: 14.5, hoodW: 11, pocketW: 14, pocketH: 7.5,
  cordDrop: 9, aglet: 1,
};

const HPS = [-3.6, 0];
const NS = [-8.3, 1.8];                // natural shoulder (mannequin)
const SP = [-11.75, 3.45];             // dropped shoulder seam point (3.45" past NS)
const HEM_Y = 27.5;                    // HPS → hem incl. band (at the HPS line)
const BAND_TOP = HEM_Y - 3;            // rib band seam
const BAND_HALF_TOP = 11.35, BAND_HALF_BOT = 11.2;
const CHEST_HALF = 12.5;               // 25" chest, 1" below the underarm
const UA_Y = 11.0;                     // underarm (armhole depth ≈ 11")
const FRONT_NECK_Y = 3.7;              // hood edges cross at the centre-front neck
const BACK_NECK_Y = 1.0;

/* ── sleeve (viewer's left; mirrored for the right) ──
 * Spine from inside the shoulder to the cuff end. Upper arm 22° out, forearm 17° (slight
 * elbow bend). Visible radii are the tube's half widths on the mannequin: a 10.5" flat
 * bicep is a 21" tube → ~6.9" across when round; fleece holds a slightly oval section.
 */
const P0 = [-8.85, 4.6];
const ELBOW = add(P0, dirDeg(-22), 10.4);          // dirDeg(-a): down and to the viewer's left
const CUFF_SEAM_C = add(ELBOW, dirDeg(-17), 8.25);
const CUFF_END_C = add(CUFF_SEAM_C, dirDeg(-17), 3.25);
const SLEEVE_SPINE = spline([P0, add(P0, dirDeg(-22), 5.2), ELBOW, add(ELBOW, dirDeg(-17), 4.2), CUFF_SEAM_C, CUFF_END_C], 10);
const SPINE_LEN = polyLength(SLEEVE_SPINE);
const T_CUFF = (SPINE_LEN - 3.25) / SPINE_LEN;     // arc fraction of the cuff seam

// bunching: ring folds above the cuff (arc fractions on the spine) + their bulge
const BUNCH = [
  { t: T_CUFF - 0.028, a: 0.15 },
  { t: T_CUFF - 0.074, a: 0.19 },
  { t: T_CUFF - 0.118, a: 0.1 },
];
const sleeveBase = knots([
  [0, 3.15], [0.12, 3.3], [0.3, 3.18], [0.47, 2.98], [0.62, 2.78], [T_CUFF - 0.17, 2.74],
  [T_CUFF - 0.09, 2.95], [T_CUFF - 0.03, 2.85], [T_CUFF - 0.004, 2.25], [T_CUFF + 0.006, 2.02],
  [1, 1.94],
]);
const bunchBump = (t) => {
  let b = 0;
  for (const f of BUNCH) b += f.a * Math.exp(-(((t - f.t) / 0.012) ** 2));
  return t < T_CUFF ? b : 0;
};
const sleeveR = (t) => sleeveBase(t) + bunchBump(t);
const SLEEVE_TUBE = tubeOutline(SLEEVE_SPINE, sleeveR);   // left = outer edge, right = inner edge

const at = (t) => along(SLEEVE_SPINE, t);
const across = (t, k) => { const { p, t: d } = at(t); return [p[0] - d[1] * k, p[1] + d[0] * k]; }; // k>0 → outer side

/* ───────────────────────────── outline pieces (viewer's left) ───────────────────────────── */

const shoulderLine = spline([HPS, [-6.0, 0.75], NS, [-10.2, 2.55], SP], 8);
// the shoulder rolls over the dropped seam into the sleeve's outer edge
const outerStart = across(0.13, 0.98 * sleeveR(0.13));
const shoulderRoll = cubic(SP, add(SP, [-0.6, 0.3]), add(outerStart, [0.18, -0.7]), outerStart, 10);
function sleeveOuterFrom(t0, t1, n = 60) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = lerp(t0, t1, i / n); out.push(across(t, sleeveR(t))); }
  return out;
}
function sleeveInnerFrom(t0, t1, n = 60) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = lerp(t0, t1, i / n); out.push(across(t, -sleeveR(t))); }
  return out;
}
// cuff end: a soft curve (the rib opening seen slightly from below)
const cuffEndCurve = (() => {
  const o = across(1, sleeveR(1)), i = across(1, -sleeveR(1));
  const d = at(1).t;
  return cubic(o, add(add(o, d, 0.22), [d[1] * -0.9, -d[0] * -0.9]), add(add(i, d, 0.22), [d[1] * 0.9, -d[0] * 0.9]), i, 10);
})();

const sideSeam = spline([[-CHEST_HALF + 0.05, UA_Y], [-CHEST_HALF, 13.5], [-12.45, 18.5], [-12.3, 23.2], [-12.05, 24.05]], 8);
const blouse = cubic([-12.05, 24.05], [-11.95, 24.4], [-11.7, 24.55], [-BAND_HALF_TOP, BAND_TOP + 0.02], 6);
const bandSide = spline([[-BAND_HALF_TOP, BAND_TOP], [-11.18, 25.9], [-BAND_HALF_BOT, HEM_Y - 0.35]], 6);
const hemCorner = cubic([-BAND_HALF_BOT, HEM_Y - 0.35], [-BAND_HALF_BOT + 0.02, HEM_Y - 0.15], [-10.9, HEM_Y - 0.08], [-10.6, HEM_Y - 0.06], 4);
const hemLine = cubic([-10.6, HEM_Y - 0.06], [-7.5, HEM_Y + 0.03], [-3, HEM_Y + 0.1], [0, HEM_Y + 0.1], 12); // slight smile
const bandSeam = cubic([-BAND_HALF_TOP - 0.4, BAND_TOP - 0.1], [-7.5, BAND_TOP + 0.04], [-3, BAND_TOP + 0.1], [0, BAND_TOP + 0.1], 12);

// neckline (front): HPS → centre-front crossover (hidden under the hood rims)
const frontNeck = cubic(HPS, [-3.45, 1.6], [-2.1, FRONT_NECK_Y], [0, FRONT_NECK_Y + 0.05], 10);
const backNeckBody = cubic(HPS, [-3.0, 0.55], [-1.6, BACK_NECK_Y], [0, BACK_NECK_Y], 10);

/* torso panel outline (left half, from the neck around to the band seam) */
function torsoHalf(neck) {
  return join(rev(neck), shoulderLine, [[-12.15, 5.0], [-12.45, 7.7], [-CHEST_HALF + 0.05, UA_Y]], sideSeam, blouse);
}
const closeHalf = (half) => join(half, rev(mirror(half)));

/* ───────────────────────────── shared shell (body + sleeves + band + cuffs) ───────────────────────────── */

function sleevePoly() {
  // outer: shoulder seam → roll → outer edge → cuff seam; inner edge back up; armhole seam
  const outer = join(shoulderRoll, sleeveOuterFrom(0.13, T_CUFF + 0.004));
  const inner = sleeveInnerFrom(0.07, T_CUFF + 0.004);
  const seamBottom = (() => {
    const o = outer[outer.length - 1], i = inner[inner.length - 1];
    const d = at(T_CUFF).t;
    return cubic(o, add(o, d, 0.28), add(i, d, 0.28), i, 8);   // sleeve blouses over the cuff
  })();
  return join(outer, seamBottom, rev(inner), [[-9.6, 6.0], [-10.6, 4.4]]);
}
function cuffPoly() {
  const o = sleeveOuterFrom(T_CUFF - 0.012, 1, 12), i = sleeveInnerFrom(T_CUFF - 0.012, 1, 12);
  return join(o, cuffEndCurve.slice(1, -1), rev(i));
}
const bandPoly = join(
  [[-BAND_HALF_TOP - 0.45, BAND_TOP - 0.25]], bandSide, hemCorner, hemLine,
  rev(mirror(hemLine)), rev(mirror(hemCorner)), rev(mirror(bandSide)), [[BAND_HALF_TOP + 0.45, BAND_TOP - 0.25]],
);

const SLEEVE_L = sleevePoly(), SLEEVE_R = mirror(SLEEVE_L);
const CUFF_L = cuffPoly(), CUFF_R = mirror(CUFF_L);

/** Armhole seam (front & back): shoulder seam point sweeping down/in to the armpit crease. */
const ARMHOLE = spline([SP, [-11.5, 5.6], [-10.85, 7.8], [-10.0, 9.7]], 8);

/* ───────────────────────────── hood (front view) ───────────────────────────── */

const HOOD_FOOT = [-6.3, 0.72];
const hoodOuterL = spline([HOOD_FOOT, [-6.7, -1.9], [-6.55, -5.1], [-5.75, -8.6], [-3.75, -10.95], [0, -11.75]], 10);
// left rim spine: from past the centre front (it crosses over the right rim) up to the crown
const RIM_L = spline([[1.15, 3.85], [-0.55, 3.2], [-2.35, 1.6], [-3.8, -0.95], [-4.55, -4.15], [-4.42, -7.3], [-3.35, -9.35], [-1.7, -10.3], [0, -10.55]], 8);
const RIM_R = mirror(spline([[1.05, 3.95], [-0.55, 3.2], [-2.35, 1.6], [-3.8, -0.95], [-4.55, -4.15], [-4.42, -7.3], [-3.35, -9.35], [-1.7, -10.3], [0, -10.55]], 8));
const RIM_W = 1.22;
const OPENING = join(slice(RIM_L, 0.03, 1, 40), rev(slice(RIM_R, 0.03, 1, 40)));
const backNeckInside = cubic([-3.6, 0.35], [-2.2, 1.35], [2.2, 1.35], [3.6, 0.35], 16); // seen through the opening

/* ───────────────────────────── pocket ───────────────────────────── */

const POCKET_TOP = BAND_TOP - 7.5;
const pocketHalf = join(
  line([0, POCKET_TOP], [-4.25, POCKET_TOP], 6),
  cubic([-4.25, POCKET_TOP], [-4.45, POCKET_TOP + 0.02], [-4.55, POCKET_TOP + 0.12], [-4.62, POCKET_TOP + 0.3], 4),
  cubic([-4.62, POCKET_TOP + 0.3], [-5.05, 18.9], [-6.55, 21.0], [-7.0, 22.0], 16),     // angled hand opening
  line([-7.0, 22.0], [-7.02, BAND_TOP + 0.08], 4),
);
const POCKET = join(pocketHalf, rev(mirror(pocketHalf)));
const POCKET_OPENING_L = slice(pocketHalf, 0.36, 0.8, 20);

/* ───────────────────────────── drawcords ───────────────────────────── */

const CORD_R = 0.17;
const EYE_L = [-1.98, 2.02], EYE_R = [1.98, 2.02];
const CORD_L = spline([EYE_L, [-2.08, 4.2], [-2.3, 7.2], [-2.38, 9.7], [-2.32, 11.62]], 10);
const CORD_R_PTS = spline([EYE_R, [2.12, 4.3], [2.42, 7.2], [2.62, 9.4], [2.66, 11.22]], 10);
function agletSpine(cord) {
  const a = cord[cord.length - 2], b = cord[cord.length - 1];
  const d = norm(sub(b, a));
  return line(b, add(b, d, 1.0), 8);
}

/* ───────────────────────────── fit: inches → artboard ───────────────────────────── */

export const UNITS_PER_INCH = 22.6;
function fitFor(polys, biasY = 0) {
  const b = bbox(polys);
  const k = UNITS_PER_INCH;
  const ox = 500 - ((b.x0 + b.x1) / 2) * k;
  const oy = 500 - ((b.y0 + b.y1) / 2) * k + biasY;
  return { k, ox, oy };
}

/* ───────────────────────────── folds (authored relief, inches) ─────────────────────────────
 * { pts, w (half width), d (depth: + ridge / − valley), profile, taper:[in,out], side? }
 */
const F = (pts, w, d, profile = "round", taper = [0.25, 0.25], extra = {}) => ({ pts, w, d, profile, taper, ...extra });
const M = (f) => ({ ...f, pts: mirror(f.pts), side: f.side ? -f.side : undefined });   // mirroring flips travel handedness
const both = (f, k = 1) => [f, M({ ...f, d: f.d * k })];

function sleeveFolds() {
  const out = [];
  const A = (t, k) => across(t, k);
  const T = T_CUFF;
  // upper arm: a long soft drape down the front from the dropped shoulder
  out.push(F([A(0.09, 0.7), A(0.22, 1.25), A(0.36, 1.0)], 1.05, 0.2, "round", [0.3, 0.5]));
  out.push(F([A(0.1, -0.9), A(0.2, -0.55), A(0.33, -0.3)], 0.75, -0.14, "round", [0.3, 0.5]));
  // inner upper arm: soft valley where the sleeve turns toward the body
  out.push(F([A(0.12, -2.3), A(0.25, -2.45), A(0.38, -2.2)], 0.55, -0.18, "round", [0.25, 0.4]));
  // inner elbow: diagonal folds rising from the inner edge, fading toward the outer side
  const elbow = [
    { a: [0.505, -3.05], b: [0.475, -1.6], c: [0.448, -0.3], w: 0.46, d: 0.27 },
    { a: [0.565, -2.95], b: [0.538, -1.35], c: [0.512, 0.25], w: 0.42, d: 0.21 },
    { a: [0.428, -2.95], b: [0.414, -2.05], c: [0.398, -1.2], w: 0.36, d: 0.14 },
  ];
  for (const e of elbow) {
    out.push(F([A(...e.a), A(...e.b), A(...e.c)], e.w, e.d, "round", [0.12, 0.6]));
    out.push(F([A(e.a[0] + 0.019, e.a[1]), A(e.b[0] + 0.018, e.b[1]), A(e.c[0] + 0.016, e.c[1] - 0.1)], e.w * 0.5, -e.d * 0.95, "crease", [0.12, 0.65]));
  }
  // outer elbow: one shallow wrinkle
  out.push(F([A(0.478, 3.0), A(0.471, 2.2), A(0.462, 1.3)], 0.32, -0.1, "crease", [0.1, 0.6]));
  // forearm: a long soft twist
  out.push(F([A(0.6, -1.3), A(0.68, -0.2), A(0.765, 0.9)], 0.75, 0.14, "round", [0.3, 0.3]));
  // bunching above the cuff: irregular, partly diagonal stacked folds
  out.push(F([A(T - 0.036, 3.0), A(T - 0.028, 0.6), A(T - 0.018, -3.0)], 0.4, 0.3, "round", [0.06, 0.06]));
  out.push(F([A(T - 0.014, 3.0), A(T - 0.008, 0.4), A(T - 0.002, -3.0)], 0.17, -0.26, "crease", [0.06, 0.06]));
  out.push(F([A(T - 0.064, 3.05), A(T - 0.078, 1.0), A(T - 0.07, -1.2)], 0.4, 0.26, "round", [0.04, 0.45]));
  out.push(F([A(T - 0.045, 3.05), A(T - 0.056, 1.1), A(T - 0.05, -0.9)], 0.18, -0.24, "crease", [0.04, 0.5]));
  out.push(F([A(T - 0.125, -3.05), A(T - 0.112, -1.0), A(T - 0.118, 0.9)], 0.36, 0.2, "round", [0.04, 0.5]));
  out.push(F([A(T - 0.104, -3.05), A(T - 0.093, -1.1), A(T - 0.098, 0.6)], 0.16, -0.18, "crease", [0.04, 0.55]));
  out.push(F([A(T - 0.17, 2.7), A(T - 0.135, 0.6), A(T - 0.1, -2.7)], 0.34, 0.12, "round", [0.2, 0.2]));
  // blouse roll right above the cuff seam
  out.push(F([A(T - 0.004, 2.4), A(T - 0.004, 0), A(T - 0.004, -2.4)], 0.22, -0.22, "crease", [0.05, 0.05]));
  // rib cuff: slight compression ripple + the rolled opening edge
  out.push(F([A(T + 0.05, 2.1), A(T + 0.052, 0), A(T + 0.05, -2.1)], 0.28, -0.06, "round", [0.05, 0.05]));
  out.push(F([A(0.997, 2.1), A(0.997, 0), A(0.997, -2.1)], 0.22, -0.22, "round", [0.04, 0.04]));
  return out.map((f) => ({ ...f, on: "sleeve" }));
}

function torsoFoldsFront() {
  const f = [];
  // chest: gentle volume, centre slightly fuller
  f.push(F(spline([[-5.5, 5.5], [-4.5, 8.5], [-4.2, 12.0]], 6), 3.2, 0.32, "round", [0.4, 0.4]));
  f.push(M(F(spline([[-5.5, 5.5], [-4.5, 8.5], [-4.2, 12.0]], 6), 3.2, 0.3, "round", [0.4, 0.4])));
  // under-arm drape: diagonal folds sweeping from the armpit toward the centre
  const drapeA = spline([[-8.6, 9.6], [-7.6, 11.6], [-6.6, 13.8], [-6.0, 15.6]], 6);
  const drapeB = spline([[-9.4, 13.4], [-8.5, 15.2], [-7.9, 17.0]], 6);
  f.push(...both(F(drapeA, 0.8, 0.24, "round", [0.2, 0.55])));
  f.push(...both(F(shift(drapeA, -0.7, 0.45), 0.32, -0.22, "crease", [0.2, 0.6])));
  f.push(...both(F(drapeB, 0.7, 0.16, "round", [0.25, 0.5])));
  f.push(...both(F(shift(drapeB, 0.5, -0.35), 0.28, -0.14, "crease", [0.25, 0.6])));
  // side: fabric falls straight from the dropped shoulder past the arm
  f.push(...both(F(spline([[-11.9, 15.0], [-11.75, 18.5], [-11.6, 22.5]], 6), 0.7, -0.18, "round", [0.3, 0.3])));
  // lower body blouses over the rib band: soft vertical folds + compression ripples
  const vf = [-9.3, -6.6, -3.2, 0.6, 3.9, 7.4, 9.9];
  vf.forEach((x, i) => {
    const L = [3.6, 2.6, 2.2, 1.9, 2.4, 2.9, 3.4][i];
    f.push(F(spline([[x + 0.2, BAND_TOP - L], [x - 0.05, BAND_TOP - L * 0.45], [x - 0.25, BAND_TOP - 0.1]], 6), 0.55, 0.2, "round", [0.6, 0.1]));
    f.push(F(spline([[x + 0.95, BAND_TOP - L * 0.7], [x + 0.85, BAND_TOP - 0.15]], 4), 0.24, -0.18, "crease", [0.6, 0.1]));
  });
  // blouse roll: the body's edge rolls over the band seam
  f.push(F(spline([[-12.1, BAND_TOP - 0.15], [-6, BAND_TOP - 0.05], [0, BAND_TOP], [6, BAND_TOP - 0.05], [12.1, BAND_TOP - 0.15]], 10), 0.5, -0.32, "edge", [0.02, 0.02], { side: -1 }));
  // band: slight bulge + rolled hem
  f.push(F(spline([[-11.2, HEM_Y - 0.05], [0, HEM_Y + 0.1], [11.2, HEM_Y - 0.05]], 10), 0.45, -0.32, "edge", [0.02, 0.02], { side: -1 }));
  f.push(F(spline([[-11.4, BAND_TOP + 0.12], [0, BAND_TOP + 0.22], [11.4, BAND_TOP + 0.12]], 10), 0.3, -0.18, "edge", [0.02, 0.02], { side: 1 }));
  // neck: fabric gathers under the hood crossover
  f.push(...both(F(spline([[-3.4, 2.6], [-4.4, 4.6], [-4.9, 6.6]], 6), 0.5, -0.14, "crease", [0.2, 0.6])));
  // shoulders: drape from the neck over the shoulder point
  f.push(...both(F(spline([[-6.5, 1.6], [-8.6, 3.2], [-10.0, 5.6]], 6), 0.8, 0.14, "round", [0.3, 0.4])));
  return f.map((x) => ({ ...x, on: "body" }));
}

function torsoFoldsBack() {
  const f = [];
  // shoulder blades
  f.push(...both(F(spline([[-6.0, 7.0], [-5.2, 10.0], [-5.0, 13.0]], 6), 3.0, 0.3, "round", [0.4, 0.4])));
  // centre back hollow
  f.push(F(spline([[0, 13.5], [0, 17.0], [0, 21.0]], 6), 1.6, -0.14, "round", [0.4, 0.4]));
  const drapeA = spline([[-8.8, 10.2], [-7.9, 12.6], [-7.0, 15.6]], 6);
  f.push(...both(F(drapeA, 0.8, 0.22, "round", [0.2, 0.5])));
  f.push(...both(F(shift(drapeA, -0.7, 0.45), 0.3, -0.2, "crease", [0.2, 0.55])));
  f.push(...both(F(spline([[-9.6, 14.2], [-8.9, 16.2], [-8.4, 18.4]], 6), 0.6, 0.15, "round", [0.25, 0.5])));
  f.push(...both(F(spline([[-11.9, 15.0], [-11.75, 18.5], [-11.6, 22.5]], 6), 0.7, -0.18, "round", [0.3, 0.3])));
  const vf = [-9.6, -6.0, -2.4, 1.4, 5.0, 8.2, 10.2];
  vf.forEach((x, i) => {
    const L = [3.4, 2.4, 2.0, 2.2, 2.6, 3.0, 3.6][i];
    f.push(F(spline([[x - 0.2, BAND_TOP - L], [x + 0.05, BAND_TOP - L * 0.45], [x + 0.25, BAND_TOP - 0.1]], 6), 0.55, 0.2, "round", [0.6, 0.1]));
    f.push(F(spline([[x - 0.95, BAND_TOP - L * 0.7], [x - 0.85, BAND_TOP - 0.15]], 4), 0.24, -0.18, "crease", [0.6, 0.1]));
  });
  f.push(F(spline([[-12.1, BAND_TOP - 0.15], [-6, BAND_TOP - 0.05], [0, BAND_TOP], [6, BAND_TOP - 0.05], [12.1, BAND_TOP - 0.15]], 10), 0.5, -0.32, "edge", [0.02, 0.02], { side: -1 }));
  f.push(F(spline([[-11.2, HEM_Y - 0.05], [0, HEM_Y + 0.1], [11.2, HEM_Y - 0.05]], 10), 0.45, -0.32, "edge", [0.02, 0.02], { side: -1 }));
  f.push(F(spline([[-11.4, BAND_TOP + 0.12], [0, BAND_TOP + 0.22], [11.4, BAND_TOP + 0.12]], 10), 0.3, -0.18, "edge", [0.02, 0.02], { side: 1 }));
  f.push(...both(F(spline([[-6.5, 1.6], [-8.6, 3.2], [-10.0, 5.6]], 6), 0.8, 0.14, "round", [0.3, 0.4])));
  return f.map((x) => ({ ...x, on: "body" }));
}

/* ───────────────────────────── details: seams, stitching, rib ───────────────────────────── */

function ribBands(front) {
  const cuffDir = at(0.98).t;
  return [
    // hem band: vertical wales, foreshortened like a cylinder
    { poly: bandPoly, dir: [0, 1], pitch: 0.15, cylinder: { cx: 0, r: 12.6 } },
    { poly: CUFF_L, dir: cuffDir, pitch: 0.14, cylinder: { r: 2.1 } },
    { poly: CUFF_R, dir: [-cuffDir[0], cuffDir[1]], pitch: 0.14, cylinder: { r: 2.1 } },
  ];
}

function cuffSeamLine() {
  const o = across(T_CUFF + 0.004, sleeveR(T_CUFF + 0.004) + 0.1), i = across(T_CUFF + 0.004, -sleeveR(T_CUFF + 0.004) - 0.1);
  const d = at(T_CUFF).t;
  return cubic(o, add(o, d, 0.16), add(i, d, 0.16), i, 10);
}

/* ───────────────────────────── views ───────────────────────────── */

const SHELL_ROLES = (torso) => [
  { poly: bandPoly, role: "trim", material: "rib" },
  { poly: torso, role: "base", material: "fleece" },
  { poly: CUFF_L, role: "trim", material: "rib" },
  { poly: CUFF_R, role: "trim", material: "rib" },
  { poly: SLEEVE_L, role: "base", material: "fleece" },
  { poly: SLEEVE_R, role: "base", material: "fleece" },
];

function shellVolumes(torso) {
  // torso: one broad pillow; the volume shape runs past the hem so only the sides and
  // shoulders round off (the hem roll is an authored fold)
  const torsoVol = join(
    torsoHalf(frontNeck).slice(0, -1),
    [[-BAND_HALF_TOP, BAND_TOP + 0.1], [-BAND_HALF_BOT, HEM_Y + 11]],
    [[BAND_HALF_BOT, HEM_Y + 11], [BAND_HALF_TOP, BAND_TOP + 0.1]],
    rev(mirror(torsoHalf(frontNeck).slice(0, -1))),
  );
  const sleeveTube = (spine) => ({
    type: "tube", spine, r: sleeveR, z: knots([[0, 0.9], [0.18, 2.7], [0.45, 3.4], [1, 3.1]]), aspect: 0.74, tag: "sleeve", extend: "end",
  });
  return [
    { type: "inflate", shape: torsoVol, R: 11, D: 5.0, z: 0, tag: "body" },
    sleeveTube(SLEEVE_SPINE),
    sleeveTube(mirror(SLEEVE_SPINE)),
  ];
}

function buildFront() {
  const torso = closeHalf(torsoHalf(frontNeck));
  const hoodOuter = join(hoodOuterL, rev(mirror(hoodOuterL)).slice(1), [[6.3, 6], [-6.3, 6]]);
  const insideBack = join(backNeckInside, [[3.0, 4.6], [-3.0, 4.6]]);
  const labelX = 0, labelY = 1.95;

  const layers = [
    {
      id: "hood-shell",
      parts: [{ poly: hoodOuter, role: "base", material: "fleece" }],
      volumes: [{ type: "inflate", shape: hoodOuter, R: 2.6, D: 2.1, z: -3.3 }],
      printGroup: 1,                               // only the "hood" zone prints here
      folds: [
        ...both(F(spline([[-5.6, -2.0], [-6.0, -5.2], [-5.3, -8.4]], 6), 0.45, 0.14, "round")),
        ...both(F(spline([[-5.9, 0.3], [-5.2, -1.4], [-5.0, -3.0]], 6), 0.3, -0.14, "crease")),
      ],
      printable: true,
    },
    {
      id: "hood-interior",
      parts: [
        { poly: OPENING, role: "trim", material: "lining" },
        { poly: insideBack, role: "base", material: "interior", clip: OPENING },
        { poly: ribbon(backNeckInside, 0.42), role: "trim", material: "tape", clip: OPENING },
        { poly: rectPts(labelX - 0.55, labelY - 0.05, 1.1, 0.72, 0.06), role: "fixed", color: "#EDEDEA", material: "label", clip: OPENING },
        { poly: rectPts(labelX - 0.32, labelY + 0.12, 0.64, 0.12, 0.02), role: "fixed", color: "#2B2F36", material: "label", clip: OPENING },
        { poly: rectPts(labelX - 0.22, labelY + 0.36, 0.44, 0.07, 0.02), role: "fixed", color: "#7A8089", material: "label", clip: OPENING },
      ],
      volumes: [
        { type: "cavity", shape: OPENING, R: 3.6, D: 4.4, z: -1.0, tilt: [0, 0.16] },
      ],
      folds: [
        F(line([0, -10.2], [0, -2.0], 8), 0.35, -0.2, "crease", [0.2, 0.5]),     // lining centre seam
        ...both(F(spline([[-3.3, -2.8], [-2.6, -0.6], [-2.2, 1.2]], 6), 0.55, 0.2, "round")),
        F(cubic([-3.3, 0.7], [-2.0, 1.6], [2.0, 1.6], [3.3, 0.7], 12), 0.32, 0.18, "round", [0.1, 0.1]),  // neck tape ridge
      ],
      printable: false,
    },
    {
      id: "shell",
      parts: SHELL_ROLES(torso),
      volumes: shellVolumes(torso),
      folds: [...torsoFoldsFront(), ...sleeveFolds(), ...sleeveFolds().map(M)],
      printable: true,
      noprintTags: ["sleeve"],
      blendK: 0.35,
    },
    {
      id: "pocket",
      parts: [{ poly: POCKET, role: "base", material: "fleece" }],
      volumes: [{ type: "inflate", shape: POCKET, R: 1.6, D: 0.32, z: 0.12 }],
      on: { blur: 0.5 },
      folds: [
        ...both(F(POCKET_OPENING_L, 0.32, 0.16, "edge", [0.05, 0.05], { side: -1 })),
        ...both(F(spline([[-4.0, POCKET_TOP + 1.2], [-4.8, 20.0], [-5.3, 23.6]], 6), 0.7, 0.12, "round")),
        ...both(F(spline([[-1.8, POCKET_TOP + 1.6], [-2.2, 21.0], [-2.4, 23.8]], 6), 0.45, -0.07, "round")),
        F(line([-4.3, POCKET_TOP + 0.05], [4.3, POCKET_TOP + 0.05], 8), 0.3, 0.1, "edge", [0.04, 0.04], { side: 1 }),
      ],
      printable: true,
      gap: POCKET_OPENING_L,                     // hand openings stand off the body
    },
    {
      id: "rim-right",
      parts: [{ poly: ribbon(RIM_R, RIM_W), role: "base", material: "fleece" }],
      volumes: [{ type: "tube", spine: RIM_R, r: () => RIM_W / 2, z: () => 0.05, aspect: 0.75 }],
      on: { blur: 0.9 },
      folds: [],
      printable: false,
    },
    {
      id: "rim-left",
      parts: [{ poly: ribbon(RIM_L, RIM_W), role: "base", material: "fleece" }],
      volumes: [{ type: "tube", spine: RIM_L, r: () => RIM_W / 2, z: () => 0.15, aspect: 0.75 }],
      on: { blur: 0.9 },
      folds: [],
      printable: false,
    },
    {
      id: "eyelets",
      parts: [EYE_L, EYE_R].map((c) => ({ poly: ellipse(c[0], c[1], 0.21, 0.21, 24), role: "fixed", color: "#9EA4AC", material: "metal" })),
      volumes: [EYE_L, EYE_R].map((c) => ({ type: "tube", spine: ellipse(c[0], c[1], 0.15, 0.15, 24), r: () => 0.065, z: () => 0, aspect: 1, closed: true })),
      on: { blur: 0.25 },
      holes: [EYE_L, EYE_R].map((c) => ellipse(c[0], c[1], 0.085, 0.085, 16)),
      printable: false,
    },
    ...[["cord-left", CORD_L], ["cord-right", CORD_R_PTS]].map(([id, spine]) => ({
      id,
      parts: [{ poly: ribbon(spine, CORD_R * 2), role: "accent", material: "cord" }],
      volumes: [{ type: "tube", spine, r: () => CORD_R, z: knots([[0, 0.05], [0.15, 0.3], [1, 0.35]]), aspect: 1 }],
      on: { blur: 0.6 },
      printable: false,
    })),
    ...[["aglet-left", agletSpine(CORD_L)], ["aglet-right", agletSpine(CORD_R_PTS)]].map(([id, spine]) => ({
      id,
      parts: [{ poly: agletPoly(spine), role: "fixed", color: "#A7ADB5", material: "metal" }],
      volumes: [{ type: "tube", spine, r: knots([[0, 0.2], [0.08, 0.2], [0.1, 0.185], [0.16, 0.19], [0.86, 0.19], [1, 0.12]]), z: () => 0.36, aspect: 1 }],
      on: { blur: 0.6 },
      folds: [
        F(acrossLine(spine, 0.09, 0.22), 0.035, -0.05, "crease", [0, 0]),
        F(acrossLine(spine, 0.16, 0.22), 0.03, -0.04, "crease", [0, 0]),
      ],
      printable: false,
    })),
  ];

  const details = {
    seams: [
      ARMHOLE, mirror(ARMHOLE), cuffSeamLine(), mirror(cuffSeamLine()),
      join([[-BAND_HALF_TOP - 0.3, BAND_TOP + 0.02]], bandSeam.slice(1), rev(mirror(bandSeam)).slice(1), [[BAND_HALF_TOP + 0.3, BAND_TOP + 0.02]]),
      offset(shoulderLine, 0.1).slice(2), mirror(offset(shoulderLine, 0.1).slice(2)),
      line([0, -10.2], [0, -2.2], 6),
    ],
    stitches: [
      { pts: ARMHOLE, offsets: [0.22, 0.45] }, { pts: mirror(ARMHOLE), offsets: [-0.22, -0.45] },
      { pts: cuffSeamLine(), offsets: [-0.2, -0.42] }, { pts: mirror(cuffSeamLine()), offsets: [0.2, 0.42] },
      { pts: join(bandSeam, rev(mirror(bandSeam)).slice(1)), offsets: [-0.2, -0.42] },
      { pts: slice(RIM_L, 0.06, 1, 60), offsets: [0.48] }, { pts: slice(RIM_R, 0.06, 1, 60), offsets: [-0.48] },
      { pts: join(slice(pocketHalf, 0, 0.82, 40)), offsets: [0.22] },
      { pts: mirror(join(slice(pocketHalf, 0, 0.82, 40))), offsets: [-0.22] },
      { pts: line([-4.25, POCKET_TOP + 0.36], [4.25, POCKET_TOP + 0.36], 8), offsets: [0], single: true },
    ],
    edges: [   // fine seam lines where two panels meet (drawn as a crisp groove)
      POCKET.concat([POCKET[0]]),
    ],
    ribs: ribBands(true),
    braids: [{ pts: CORD_L, r: CORD_R }, { pts: CORD_R_PTS, r: CORD_R }],
    aoStrokes: [
      { pts: offset(POCKET_OPENING_L, 0.1), w: 0.14, blur: 0.05, k: 0.75 },
      { pts: mirror(offset(POCKET_OPENING_L, 0.1)), w: 0.14, blur: 0.05, k: 0.75 },
      { pts: offset(POCKET_OPENING_L, 0.25), w: 0.3, blur: 0.18, k: 0.3 },
      { pts: mirror(offset(POCKET_OPENING_L, 0.25)), w: 0.3, blur: 0.18, k: 0.3 },
    ],
    tacks: [
      [add(POCKET_OPENING_L[0], [0.05, 0.06]), add(POCKET_OPENING_L[0], [0.38, 0.12])],
      [mirror([add(POCKET_OPENING_L[0], [0.05, 0.06])])[0], mirror([add(POCKET_OPENING_L[0], [0.38, 0.12])])[0]],
      [[-7.0, 22.05], [-6.55, 22.05]], [[7.0, 22.05], [6.55, 22.05]],
    ],
  };

  const silhouetteParts = [hoodOuterL];
  const fit = fitFor([join(hoodOuterL, mirror(hoodOuterL)), SLEEVE_L, SLEEVE_R, CUFF_L, CUFF_R, bandPoly], -4);
  const Z = zoneMaker(fit);
  return {
    fit,
    layers,
    details,
    printArea: [torso, POCKET, hoodOuter],
    printHoles: [OPENING.concat(), ribbon(RIM_L, RIM_W), ribbon(RIM_R, RIM_W)],
    zones: {
      "chest-left": Z(5.35, 7.4, 3.9, 3.9, "Left chest"),
      "chest-center": Z(0, 7.7, 8.4, 5.4, "Center chest"),
      center: Z(0, 10.6, 16.5, 11.2, "Full front"),
      oversized: Z(3.6, 10.2, 30, 30, "Oversized · crops right"),
      hood: Z(5.95, -4.6, 1.3, 4.4, "Hood side"),
      pouch: Z(0, 20.7, 10.4, 5.4, "Pouch"),
    },
    measure: { torso, sleeve: SLEEVE_L, cuff: CUFF_L, band: bandPoly, pocket: POCKET, hood: hoodOuterL, cords: [CORD_L, CORD_R_PTS] },
  };
}

function buildBack() {
  const torso = closeHalf(torsoHalf(backNeckBody));
  // the hood lies flat down the upper back: shell + the opening edge rolled over the neck
  const hoodHalf = join(
    spline([[0, -1.05], [-2.2, -0.85], [-4.2, -0.2], [-5.25, 0.75]], 8),
    spline([[-5.25, 0.75], [-6.75, 2.6], [-7.3, 5.4], [-6.55, 9.0], [-4.0, 11.9], [-1.3, 13.0], [0, 13.25]], 10),
  );
  const HOOD = join(hoodHalf, rev(mirror(hoodHalf)).slice(1));
  // lining shows along the top where the opening edge folds back over the neck
  const liningTop = join(
    spline([[-5.1, 0.7], [-4.1, -0.12], [-2.2, -0.75], [0, -0.93]], 8),
    spline([[0, -0.93], [2.2, -0.75], [4.1, -0.12], [5.1, 0.7]], 8).slice(1),
    spline([[5.1, 0.7], [3.6, 0.42], [1.8, 0.05], [0, -0.02]], 8).slice(1),
    spline([[0, -0.02], [-1.8, 0.05], [-3.6, 0.42], [-5.1, 0.7]], 8).slice(1),
  );
  const layers = [
    {
      id: "shell",
      parts: SHELL_ROLES(torso),
      volumes: shellVolumes(torso),
      folds: [...torsoFoldsBack(), ...sleeveFolds(), ...sleeveFolds().map(M)],
      printable: true,
      noprintTags: ["sleeve"],
      blendK: 0.35,
    },
    {
      id: "hood",
      parts: [
        { poly: HOOD, role: "base", material: "fleece" },
        { poly: liningTop, role: "trim", material: "lining" },
      ],
      volumes: [{ type: "inflate", shape: HOOD, R: 3.2, D: 0.85, z: 0.2 }],
      on: { blur: 1.2 },
      folds: [
        F(line([0, -0.6], [0, 13.0], 10), 0.32, -0.16, "crease", [0.05, 0.05]),        // centre seam
        ...both(F(spline([[-1.3, 0.6], [-3.0, 4.5], [-3.4, 9.5], [-1.6, 12.5]], 8), 1.5, 0.32, "round", [0.2, 0.2])),
        F(spline([[-4.8, 0.65], [-2.4, 0.2], [0, 0.1], [2.4, 0.2], [4.8, 0.65]], 10), 0.45, 0.22, "round", [0.05, 0.05]),  // the fold over the neck
        F(spline([[-4.9, 1.05], [-2.4, 0.62], [0, 0.55], [2.4, 0.62], [4.9, 1.05]], 10), 0.25, -0.18, "crease", [0.05, 0.05]),
        ...both(F(spline([[-5.6, 2.2], [-5.4, 4.6], [-4.4, 7.0]], 6), 0.5, -0.14, "crease")),
        ...both(F(spline([[-6.4, 5.0], [-5.6, 8.6], [-3.6, 11.0]], 6), 0.6, 0.12, "round")),
      ],
      printable: false,
    },
  ];
  const details = {
    seams: [
      ARMHOLE, mirror(ARMHOLE), cuffSeamLine(), mirror(cuffSeamLine()),
      join([[-BAND_HALF_TOP - 0.3, BAND_TOP + 0.02]], bandSeam.slice(1), rev(mirror(bandSeam)).slice(1), [[BAND_HALF_TOP + 0.3, BAND_TOP + 0.02]]),
      offset(shoulderLine, -0.05).slice(5), mirror(offset(shoulderLine, -0.05).slice(5)),
      line([0, -0.75], [0, 13.05], 12),
    ],
    stitches: [
      { pts: ARMHOLE, offsets: [0.22, 0.45] }, { pts: mirror(ARMHOLE), offsets: [-0.22, -0.45] },
      { pts: cuffSeamLine(), offsets: [-0.2, -0.42] }, { pts: mirror(cuffSeamLine()), offsets: [0.2, 0.42] },
      { pts: join(bandSeam, rev(mirror(bandSeam)).slice(1)), offsets: [-0.2, -0.42] },
      { pts: line([0, -0.6], [0, 12.9], 12), offsets: [-0.2, 0.2] },
    ],
    edges: [],
    ribs: ribBands(false),
    braids: [],
    tacks: [],
  };
  const fit = fitFor([join(hoodOuterL, mirror(hoodOuterL)), SLEEVE_L, SLEEVE_R, CUFF_L, CUFF_R, bandPoly], -4);
  // the back has no standing hood: centre the garment in the frame
  const bb = bbox([HOOD, SLEEVE_L, SLEEVE_R, CUFF_L, CUFF_R, bandPoly]);
  fit.oy = 500 - ((bb.y0 + bb.y1) / 2) * fit.k - 4;
  const Z = zoneMaker(fit);
  return {
    fit,
    layers,
    details,
    printArea: [torso],
    printHoles: [],
    zones: {
      "back-yoke": Z(0, 15.1, 7.0, 2.8, "Back yoke"),
      "back-center": Z(0, 18.6, 17.5, 10.4, "Full back"),
      oversized: Z(-4.2, 16.4, 30, 30, "Oversized · crops left"),
    },
    measure: { torso, hood: HOOD },
  };
}

/* ───────────────────────────── helpers ───────────────────────────── */

function rectPts(x, y, w, h, r) {
  const q = (cx, cy, a0) => ellipse(cx, cy, r, r, 4, a0, a0 + Math.PI / 2);
  return join(q(x + w - r, y + r, -Math.PI / 2), q(x + w - r, y + h - r, 0), q(x + r, y + h - r, Math.PI / 2), q(x + r, y + r, Math.PI));
}
function agletPoly(spine) {
  const r = knots([[0, 0.2], [0.08, 0.2], [0.1, 0.185], [0.16, 0.19], [0.86, 0.19], [1, 0.12]]);
  const { outline } = tubeOutline(resample(spine, 20), r);
  return outline;
}
function acrossLine(spine, t, w) {
  const { p, t: d } = along(spine, t);
  return [[p[0] - d[1] * w, p[1] + d[0] * w], [p[0] + d[1] * w, p[1] - d[0] * w]];
}
function zoneMaker(fit) {
  return (cx, cy, w, h, label) => ({
    x: Math.round(fit.ox + (cx - w / 2) * fit.k), y: Math.round(fit.oy + (cy - h / 2) * fit.k),
    w: Math.round(w * fit.k), h: Math.round(h * fit.k), label,
  });
}

/* ───────────────────────────── garment ───────────────────────────── */

export default {
  id: "hoodie",
  name: "Warm-up Hoodie",
  styleCode: "ML-H01",
  fabric: "fleece",
  spec: "Heavyweight brushed-back fleece · double-layer hood · dropped shoulder · 450 gsm",
  views: { front: buildFront(), back: buildBack() },
  defaultColors: { base: "dark", trim: "primary", accent: "secondary" },
  // geometry facts for the measurement report
  facts: {
    HPS, NS, SP, HEM_Y, BAND_TOP, CHEST_HALF, UA_Y, FRONT_NECK_Y,
    sleeveSpine: SLEEVE_SPINE, cuffSeamC: CUFF_SEAM_C, cuffEndC: CUFF_END_C, P0, ELBOW,
    sleeveR, T_CUFF, RIM_W, EYE_L, CORD_L, CORD_R: CORD_R_PTS, POCKET_TOP, shoulderRoll,
  },
};
