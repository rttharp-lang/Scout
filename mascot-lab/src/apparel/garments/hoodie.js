// Mascot Lab — Warm-up Hoodie (photo format: painted light). The worked example in
// GARMENTS.md: copy its structure for new garments.
//
// Oversized heavyweight pullover, size L, on a ghost mannequin. Authored in INCHES on
// the garment (x right of centre front as the viewer sees it, y down from the high point
// shoulder) and mapped to the 1000-unit artboard by F (inchFrame). Front view: hood up
// (open, lining and inside back neck visible), arms ~17° out with a slight elbow bend.
// Back view: the hood lies flat down the upper back.
//
// Spec (flat, size L) → how it is drawn (`measure()` checks it against the polygons):
//   chest 25" (1" below armhole)     body half-width 12.5 at y = 12
//   body 27.5" HPS → hem incl. 3" rib band; the body blouses 0.7"/side over the band
//   dropped shoulder: across shoulder 23.5"  → shoulder seam points at x = ±11.75
//   sleeve 23" from shoulder seam (outer contour + cuff), arm 17° out, elbow bend 8°
//   bicep 10.5" flat → a filled tube seen from the front ≈ 6.7" (21" circumference / π)
//   cuff 4" × 3.25" rib, the sleeve bunches in rings above it
//   hood 14.5" × 11" double layer: stands 12.4" above the HPS (front), lining in trim
//   kangaroo pocket 14" × 7.5" with angled hand openings
//   braided drawcords hang 9" below the neckline with 1" metal aglets
//
// Each view = parts (panels by colour role, PAINT ORDER) → light (authored soft light,
// the bulk of this file) → seams / stitches / ribs / cords / metal / edges (procedural
// detail drawn from centre lines) → zones (CONTRACTS.md placement boxes).
import { spline, join, rev, mirror, resample, ribbon, taper, offset, inchFrame, lerp, clamp, polyLength, spanAtY, atY, slice, line, normals, smoothstep } from "../photo/geom.js";
import { authorKit } from "../photo/author.js";

/** Inches → artboard: 21.5 units per inch, centre front at x 500, HPS at y 337. */
export const F = inchFrame({ unit: 21.5, cx: 500, y0: 337 });
const { S, dark, lite, blob, rect, brush, fold, tube, flat } = authorKit(F);
const mp = (p) => [-p[0], p[1]];

/* ───────────────────────────── key measurements (inches) ───────────────────────────── */

const M = {
  hem: 27.5, bandTop: 24.5,
  shoulderHalf: 11.75, underarmY: 11.0, chestHalf: 12.5,
  hoodTop: -12.4,
  pocketTop: 17.0, pocketHalf: 7.0, pocketOpenY: 21.3,
  cuffH: 3.25, cuffHalf: 2.0, cordW: 0.3, agletL: 1.0, agletW: 0.36,
};

/* ═════════════════════════════════ BODY (shared) ═════════════════════════════════ */

const HF = [-6.95, 0.85];                        // hood foot on the shoulder
const SP = [-M.shoulderHalf, 3.15];              // dropped shoulder seam point
const UA = [-12.55, M.underarmY];                // underarm / side-seam top
const shoulderL = S([HF, [-8.6, 1.5], [-10.2, 2.3], SP], 8);
const armholeL = S([SP, [-12.05, 5.8], [-12.35, 8.6], UA], 8);
// the side hangs straight from the chest, drifts in a touch, then blouses over the band
const sideL = S([UA, [-12.58, 13.0], [-12.48, 16.5], [-12.32, 20.0], [-12.3, 22.2], [-12.42, 23.55], [-12.2, 24.2], [-11.8, 24.48]], 8);
const bandSeamL = S([[-11.8, 24.48], [-7.5, 24.56], [-3.5, 24.6], [0, 24.61]], 8);
const necklineL = S([[0, 4.15], [-1.7, 3.75], [-3.7, 2.7], [-5.6, 1.45], HF], 8);
const bodyHalf = join(necklineL, shoulderL, armholeL, sideL, bandSeamL);
const BODY = join(bodyHalf, rev(mirror(bodyHalf)));

/* ── sleeve: built around an arm axis so its light can be authored in sleeve-local coords ── */

const ARM_DEG = 17, FORE_DEG = 9;                // upper arm / forearm angle out from vertical
const A0 = [-13.25, 4.6];                        // axis start (inside the shoulder roll)
const rad = (d) => (d * Math.PI) / 180;
const ELBOW = [A0[0] - Math.sin(rad(ARM_DEG)) * 11.4, A0[1] + Math.cos(rad(ARM_DEG)) * 11.4];
const WRIST = [ELBOW[0] - Math.sin(rad(FORE_DEG)) * 7.3, ELBOW[1] + Math.cos(rad(FORE_DEG)) * 7.3];
const AXIS = resample(spline([A0, [lerp(A0[0], ELBOW[0], 0.55), lerp(A0[1], ELBOW[1], 0.55)], ELBOW, [lerp(ELBOW[0], WRIST[0], 0.5), lerp(ELBOW[1], WRIST[1], 0.5)], WRIST], 16), 160);
const AXIS_L = polyLength(AXIS);
const AXIS_N = normals(AXIS).map(([x, y]) => [-x, -y]);   // outward (towards −x)
/** Half-width of the sleeve along the axis (inches from A0): wide bicep, slim forearm, a
 *  flare where the fabric bunches above the cuff. */
const HW = [[0, 3.35], [4.5, 3.35], [8.5, 3.15], [11.4, 3.0], [14.5, 2.72], [16.4, 2.7], [17.6, 2.82], [AXIS_L, 2.62]];
function hwAt(s) {
  for (let i = 1; i < HW.length; i++) {
    if (s <= HW[i][0]) {
      const t = (s - HW[i - 1][0]) / (HW[i][0] - HW[i - 1][0]);
      return lerp(HW[i - 1][1], HW[i][1], smoothstep(0, 1, t));
    }
  }
  return HW.at(-1)[1];
}
/** Sleeve-local → inch space: s = inches along the arm axis from A0, v = −1 inner … +1 outer. */
function sl(s, v) {
  const f = clamp(s / AXIS_L, 0, 1) * (AXIS.length - 1);
  const i = Math.min(AXIS.length - 2, Math.floor(f)), t = f - i;
  const p = [lerp(AXIS[i][0], AXIS[i + 1][0], t), lerp(AXIS[i][1], AXIS[i + 1][1], t)];
  const n = [lerp(AXIS_N[i][0], AXIS_N[i + 1][0], t), lerp(AXIS_N[i][1], AXIS_N[i + 1][1], t)];
  const w = hwAt(s) * v;
  return [p[0] + n[0] * w, p[1] + n[1] * w];
}
const SL_END = AXIS_L;                            // sleeve end (over the cuff top)
// outer contour: the shoulder slope runs on past the seam, rolls over the arm, hangs down;
// two soft swells where the fabric stacks above the cuff
const sleeveOuterL = S([SP, [-13.6, 4.05], [-15.5, 5.2], sl(2.6, 1), sl(5, 1), sl(8, 1), sl(11.4, 1), sl(14, 1),
  sl(15.7, 1.0), sl(16.5, 1.04), sl(17.2, 0.98), sl(17.9, 1.03), sl(SL_END, 1)], 10);
const SL_END_DIR = (() => { const a = sl(SL_END - 0.5, 0), b = sl(SL_END, 0); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; })();
const sleeveEndL = S([sl(SL_END, 1), [sl(SL_END, 0.5)[0] + SL_END_DIR[0] * 0.22, sl(SL_END, 0.5)[1] + SL_END_DIR[1] * 0.22],
  [sl(SL_END, 0)[0] + SL_END_DIR[0] * 0.3, sl(SL_END, 0)[1] + SL_END_DIR[1] * 0.3],
  [sl(SL_END, -0.5)[0] + SL_END_DIR[0] * 0.2, sl(SL_END, -0.5)[1] + SL_END_DIR[1] * 0.2], sl(SL_END, -1)], 8);
// inner contour: up the forearm, over the body side just below the armpit (the sleeve
// drapes over it), into the underarm
const sleeveInnerL = S([sl(SL_END, -1), sl(17.9, -1.03), sl(17.2, -0.97), sl(16.4, -1.02), sl(14.5, -1), sl(12, -1), sl(9.6, -1), [-12.25, 13.2], [-12.18, 12.0], UA], 10);
const SLEEVE_L = join(sleeveOuterL, sleeveEndL, sleeveInnerL, rev(armholeL));
const SLEEVE_R = mirror(SLEEVE_L);

// rib cuff (left): 4" wide, 3.25" tall, on the forearm axis; cp(along, across) = cuff-local
const CUFF_AX = SL_END_DIR;
const CUFF_N = [CUFF_AX[1], -CUFF_AX[0]];
const CUFF_C = sl(SL_END - 0.42, 0);
const cp = (along, across) => [CUFF_C[0] + CUFF_AX[0] * along + CUFF_N[0] * across, CUFF_C[1] + CUFF_AX[1] * along + CUFF_N[1] * across];
const cuffOuterL = S([cp(-0.4, -2.12), cp(0.5, -2.06), cp(1.5, -2.08), cp(2.5, -2.03), cp(M.cuffH, -2.0)], 6);
const cuffEndL = S([cp(M.cuffH, -2.0), cp(M.cuffH + 0.12, -1.0), cp(M.cuffH + 0.15, 0), cp(M.cuffH + 0.12, 1.0), cp(M.cuffH, 2.0)], 6);
const cuffInnerL = S([cp(M.cuffH, 2.0), cp(2.5, 2.03), cp(1.5, 2.08), cp(0.5, 2.06), cp(-0.4, 2.12)], 6);
const CUFF_L = join(cuffOuterL, cuffEndL, cuffInnerL);
const CUFF_R = mirror(CUFF_L);
const cuffTopL = S([cp(0.42, -2.08), cp(0.5, 0), cp(0.42, 2.08)], 6);
/** A bunching ring above the cuff, in cuff-local coords (arcs dip toward the camera). */
const ring = (edge, centre, hw) => S([cp(edge, -hw), cp((edge + centre) / 2 - 0.02, -hw * 0.5), cp(centre, 0), cp((edge + centre) / 2 + 0.02, hw * 0.5), cp(edge - 0.05, hw)], 6);

// rib hem band (3"), narrower than the body; the hem arcs down toward the camera
const BAND = join(
  S([[-11.86, 24.25], [-6, 24.4], [0, 24.45], [6, 24.4], [11.86, 24.25]], 8),
  S([[11.86, 24.25], [11.78, 25.8], [11.68, 27.2]], 4),
  S([[11.68, 27.2], [6, 27.42], [0, 27.5], [-6, 27.42], [-11.68, 27.2]], 8),
  S([[-11.68, 27.2], [-11.78, 25.8], [-11.86, 24.25]], 4),
);

/* ═════════════════════════════════ FRONT ═════════════════════════════════ */

// kangaroo pocket 14" × 7.5": top edge, angled hand openings, straight sides into the band seam
const pocketOpenL = S([[-4.4, M.pocketTop + 0.05], [-5.15, 18.1], [-6.15, 19.7], [-M.pocketHalf, M.pocketOpenY]], 10);
const pocketTopL = S([[0, M.pocketTop], [-3.6, M.pocketTop], [-4.15, M.pocketTop + 0.01], [-4.4, M.pocketTop + 0.05]], 4);
const pocketSideL = line([-M.pocketHalf, M.pocketOpenY], [-M.pocketHalf - 0.02, 24.6], 4);
const pocketHalf = join(pocketTopL, pocketOpenL, pocketSideL, [[0, 24.63]]);
const POCKET = join(pocketHalf, rev(mirror(pocketHalf)));

// hood — outer contour (a bell: wider where it sits on the shoulders), rims (the
// double-layer edge = drawcord channel), opening
const hoodOuterL = S([[0, M.hoodTop], [-1.8, -12.15], [-3.85, -11.45], [-5.4, -9.85], [-6.15, -7.4], [-6.38, -4.4], [-6.5, -1.7], [-6.75, -0.2], HF], 10);
const rimInnerL = S([[0, -10.55], [-2.75, -10.1], [-4.15, -8.2], [-4.6, -4.9], [-4.45, -1.7], [-3.45, 0.85], [-1.65, 2.35], [0.62, 3.1]], 10);
const rimOuterL = S([[0, -11.55], [-3.15, -11.1], [-5.0, -8.9], [-5.55, -4.9], [-5.4, -1.25], [-4.3, 1.68], [-2.05, 3.55], [0.95, 4.25]], 10);
const RIM_N = 64;
const rimIn = resample(rimInnerL, RIM_N), rimOut = resample(rimOuterL, RIM_N);
const RIM_L = join(rimOut, rev(rimIn));
const RIM_R = mirror(RIM_L);
const hoodBottom = S([HF, [-5.6, 1.5], [-3.9, 2.9], [-1.8, 4.0], [0, 4.45], [1.8, 4.0], [3.9, 2.9], [5.6, 1.5], mp(HF)], 8);
const HOOD = join(hoodOuterL, hoodBottom.slice(1), rev(mirror(hoodOuterL)).slice(1));
const OPENING = join(rimInnerL, rev(mirror(rimInnerL)).slice(1));

// inside the hood: the back-neck facing below the lining's neck seam, a neck tape, a label
const BN_Y = -0.35;
const bnL = atY(rimInnerL, BN_Y);
const backNeck = S([[bnL[0] - 0.2, BN_Y - 0.35], [-2.2, BN_Y + 0.45], [0, BN_Y + 0.62], [2.2, BN_Y + 0.45], [-bnL[0] + 0.2, BN_Y - 0.35]], 8);
const rimInLow = rimInnerL.filter((p) => p[1] >= BN_Y - 0.5 && p[0] <= 0.05);
const INNER_BACK = join(backNeck, mirror(rimInLow), rev(rimInLow));
const TAPE = ribbon(backNeck.slice(2, -2), 0.4);
const LABEL = join(S([[-0.55, BN_Y + 0.88], [0, BN_Y + 0.93], [0.55, BN_Y + 0.88]], 4), [[0.52, BN_Y + 1.45], [-0.52, BN_Y + 1.45]]);

// drawcords: exit eyelets low on the rims, hang 9" below the neckline, 1" metal aglets
const eyeletAt = (t) => {
  const i = Math.round(t * RIM_N);
  return [lerp(rimIn[i][0], rimOut[i][0], 0.5), lerp(rimIn[i][1], rimOut[i][1], 0.5)];
};
const EYE_L = eyeletAt(0.83);
const EYE_R = mp(EYE_L);
const NECK_Y = 4.15;                                // centre-front neckline (under the crossover)
const CORD_END = NECK_Y + 9.0;                      // aglet tips
const cordL = S([EYE_L, [EYE_L[0] - 0.2, EYE_L[1] + 1.5], [-3.95, 5.6], [-3.75, 8.8], [-3.5, 11.2], [-3.42, CORD_END - M.agletL]], 12);
const cordR = S([EYE_R, [EYE_R[0] + 0.15, EYE_R[1] + 1.7], [3.95, 6.2], [4.0, 9.4], [4.02, 11.5], [4.05, CORD_END - M.agletL + 0.28]], 12);
const agletL = [cordL.at(-1), [cordL.at(-1)[0] + 0.05, CORD_END]];
const agletR = [cordR.at(-1), [cordR.at(-1)[0] + 0.03, CORD_END + 0.28]];

const frontParts = [
  { id: "hoodShell", pts: HOOD, role: "base", print: true },
  { id: "lining", pts: OPENING, role: "trim" },
  { id: "innerBack", pts: INNER_BACK, role: "base", texture: false },
  { id: "tape", pts: TAPE, role: "trim", texture: false },
  { id: "label", pts: LABEL, role: "white", texture: false },
  { id: "band", pts: BAND, role: "trim", grain: 0.5 },
  { id: "cuffL", pts: CUFF_L, role: "trim", grain: 0.5 },
  { id: "cuffR", pts: CUFF_R, role: "trim", grain: 0.5 },
  { id: "body", pts: BODY, role: "base", print: true },
  { id: "pocket", pts: POCKET, role: "base", print: true },
  { id: "sleeveL", pts: SLEEVE_L, role: "base" },
  { id: "sleeveR", pts: SLEEVE_R, role: "base" },
  { id: "rimR", pts: RIM_R, role: "base" },
  { id: "rimL", pts: RIM_L, role: "base" },
  { id: "cordL", pts: ribbon(cordL, M.cordW), role: "accent", over: true, texture: false },
  { id: "cordR", pts: ribbon(cordR, M.cordW), role: "accent", over: true, texture: false },
].map((p) => ({ ...p, pts: F.P(p.pts) }));

const TORSO = ["body", "pocket"];
const SLEEVES = ["sleeveL", "sleeveR"];

/* ── light shared by both views: torso key, sleeves, cuffs, hem band ── */

function torsoKey(T, { top = 1 } = {}) {
  return [
    // key from the upper left: one broad diagonal falloff across the whole torso
    dark(rect(-14, top - 1, 14, 26), { blur: 1.2, alpha: 0.32, clip: T, grad: { x0: -9, y0: top + 1, x1: 11, y1: 24, stops: [[0, 0], [0.45, 0.25], [1, 1]] } }),
    // the body turns away at the sides: a NARROW falloff (a wide one reads as a puffer)
    dark(rect(8.5, top, 14, 25), { blur: 0.9, alpha: 0.42, clip: T, grad: { x0: 9.7, y0: 0, x1: 12.7, y1: 0, stops: [[0, 0], [0.6, 0.45], [1, 1]] } }),
    dark(rect(-14, top, -10, 25), { blur: 0.7, alpha: 0.2, clip: T, grad: { x0: -11.0, y0: 0, x1: -12.7, y1: 0, stops: [[0, 0], [1, 1]] } }),
    // lit chest plane
    blob("light", -4.6, top + 7.2, 6.4, 5.0, -18, { blur: 2.6, alpha: 0.2, clip: T }),
    blob("light", -7.4, top + 3.0, 3.6, 1.6, -14, { blur: 1.2, alpha: 0.14, clip: T }),
    // where the chest turns down into the belly
    dark(rect(-13, 12.5, 13, 16), { blur: 1.6, alpha: 0.07, clip: T }),
    // shoulders catch the key light
    brush("light", [[-7.4, 1.4], [-9.0, 1.9], [-10.6, 2.65], [-11.6, 3.4]], 0.9, { blur: 0.5, alpha: 0.24, clip: T }),
    brush("light", [[7.4, 1.45], [9.0, 1.95], [10.6, 2.7]], 0.6, { blur: 0.5, alpha: 0.1, clip: T }),
  ];
}

function sleevePaint(T, { back = false } = {}) {
  const out = [];
  const inL = slice(sleeveInnerL, 0, 0.86, 30).reverse();     // underarm → cuff
  const outL = slice(sleeveOuterL, 0.2, 1, 30);
  // the sleeve as a soft cylinder: the left one faces the key, the right one turns away
  out.push(...tube(outL, inL, { clip: ["sleeveL"], hi: 0.2, core: 0.22, refl: 0.0, blur: 1.0, hiW: 0.24, coreW: 0.3 }));
  out.push(...tube(mirror(outL), mirror(inL), { clip: ["sleeveR"], hi: 0.12, core: 0.32, refl: 0.0, blur: 1.0, hiW: 0.24, coreW: 0.32 }));
  out.push(dark(rect(12, 3, 23, 27), { blur: 1.0, alpha: 0.2, clip: ["sleeveR", "cuffR"], grad: { x0: 12, y0: 5, x1: 21, y1: 25, stops: [[0, 0], [1, 1]] } }));
  out.push(dark(rect(-23, 13, -11, 27), { blur: 1.0, alpha: 0.12, clip: ["sleeveL", "cuffL"], grad: { x0: 0, y0: 13, x1: 0, y1: 25, stops: [[0, 0], [1, 1]] } }));
  // sleeve → body: each sleeve casts a shadow down-right; occlusion where it meets the body
  const innerTop = slice(sleeveInnerL, 0.35, 0.97, 22);       // forearm … underarm
  out.push(
    dark(ribbon(offset(innerTop, -0.5), taper(1.3, 0.2, 0.35)), { blur: 0.5, alpha: 0.42, clip: T }),
    dark(ribbon(offset(innerTop, -0.16), taper(0.36, 0.1, 0.3)), { blur: 0.15, alpha: 0.4, clip: T }),
    dark(ribbon(offset(mirror(innerTop), 0.3), taper(0.8, 0.2, 0.35)), { blur: 0.4, alpha: 0.36, clip: T }),
    dark(ribbon(offset(mirror(innerTop), 0.11), taper(0.3, 0.1, 0.3)), { blur: 0.13, alpha: 0.42, clip: T }),
    blob("dark", -12.35, 11.7, 0.8, 1.9, 8, { blur: 0.5, alpha: 0.42, clip: [...T, "sleeveL"] }),
    blob("dark", 12.35, 11.7, 0.8, 1.9, -8, { blur: 0.5, alpha: 0.52, clip: [...T, "sleeveR"] }),
  );
  // sleeve edges turn away sharply (cloth, not a balloon): thin occlusion inside the contour
  out.push(
    dark(ribbon(offset(slice(sleeveInnerL, 0.02, 0.9, 24), 0.1), 0.4), { blur: 0.22, alpha: 0.34, clip: ["sleeveL"] }),
    dark(ribbon(offset(slice(mirror(sleeveInnerL), 0.02, 0.9, 24), -0.1), 0.4), { blur: 0.22, alpha: 0.3, clip: ["sleeveR"] }),
  );
  for (const side of [1, -1]) {
    const m = side === 1 ? (pts) => pts : mirror;
    const clip = [side === 1 ? "sleeveL" : "sleeveR"];
    const lit = side === 1;
    // dropped-shoulder roll: the sleeve rolls over just outside the armhole seam
    out.push(...fold(m(offset(slice(armholeL, 0.08, 0.75, 8), -0.75)), 1.0, { hi: 0.12, lo: 0.18, blur: 0.4, clip, relief: 0.4 }));
    // underarm: a crease where the sleeve gathers into the armhole
    out.push(...fold(m([sl(4.6, -0.55), sl(6.2, -0.82), sl(7.8, -0.95)]), 0.85, { hi: lit ? 0.12 : 0.06, lo: 0.3, blur: 0.35, clip, valley: true, ta: 0.25, tb: 0.5 }));
    // long upper-arm drape folds running down the sleeve
    out.push(...fold(m([sl(3.6, 0.25), sl(6.5, 0.18), sl(9.4, 0.12), sl(11.0, 0.1)]), 0.9, { hi: lit ? 0.13 : 0.06, lo: 0.15, blur: 0.5, clip }));
    out.push(...fold(m([sl(6.5, 0.7), sl(9.0, 0.62), sl(10.6, 0.58)]), 0.6, { hi: lit ? 0.1 : 0.04, lo: 0.11, blur: 0.45, clip }));
    if (!back) {
      // inner elbow: V folds radiating from the crease on the inner contour
      out.push(...fold(m([sl(11.0, -0.95), sl(10.7, -0.35), sl(10.6, 0.3)]), 0.66, { hi: 0.17, lo: 0.3, blur: 0.28, clip, valley: true, ta: 0.15, tb: 0.55 }));
      out.push(...fold(m([sl(11.7, -0.95), sl(11.8, -0.3), sl(12.1, 0.35)]), 0.6, { hi: 0.15, lo: 0.27, blur: 0.26, clip, valley: true, ta: 0.15, tb: 0.55 }));
      out.push(...fold(m([sl(10.2, -0.92), sl(9.75, -0.45), sl(9.5, 0.0)]), 0.5, { hi: 0.11, lo: 0.19, blur: 0.26, clip, valley: true, ta: 0.15, tb: 0.6 }));
      out.push(blob("light", m([sl(11.2, 0.72)])[0][0], sl(11.2, 0.72)[1], 0.55, 1.4, side * 14, { blur: 0.5, alpha: lit ? 0.11 : 0.04, clip }));
    } else {
      // back of the elbow: a bulge with short folds radiating from it
      out.push(blob("light", m([sl(11.3, 0.6)])[0][0], sl(11.3, 0.6)[1], 0.85, 1.7, side * 14, { blur: 0.6, alpha: lit ? 0.13 : 0.05, clip }));
      out.push(...fold(m([sl(10.6, 0.65), sl(10.1, 0.0), sl(9.9, -0.6)]), 0.6, { hi: 0.11, lo: 0.22, blur: 0.3, clip, ta: 0.5, tb: 0.2 }));
      out.push(...fold(m([sl(12.2, 0.65), sl(12.5, 0.0), sl(12.6, -0.6)]), 0.6, { hi: 0.11, lo: 0.22, blur: 0.3, clip, ta: 0.5, tb: 0.2 }));
    }
    // forearm: a long soft twist fold
    out.push(...fold(m([sl(12.8, -0.55), sl(14.4, -0.1), sl(15.6, 0.4)]), 0.7, { hi: lit ? 0.1 : 0.05, lo: 0.14, blur: 0.4, clip, ta: 0.4, tb: 0.4 }));
    // bunching: the blouse lip right above the cuff, then irregular diagonal Z-folds that
    // die out part-way across (real stacking is never a set of even rings)
    out.push(...fold(m(ring(-0.08, 0.1, 2.75)), 0.36, { hi: lit ? 0.22 : 0.13, lo: 0.38, blur: 0.18, clip, relief: 0.8, ta: 0.12, tb: 0.12 }));
    for (const [pts, w, k, ta, tb] of [
      [[cp(-1.15, -2.8), cp(-0.85, -1.6), cp(-0.6, -0.2), cp(-0.55, 0.9)], 0.42, 1, 0.12, 0.6],
      [[cp(-1.7, 2.8), cp(-1.4, 1.5), cp(-1.1, 0.2), cp(-1.0, -0.7)], 0.38, 0.85, 0.12, 0.6],
      [[cp(-2.6, -2.85), cp(-2.25, -1.2), cp(-1.9, 0.6), cp(-1.75, 2.2)], 0.44, 0.7, 0.15, 0.35],
      [[cp(-3.6, 2.85), cp(-3.35, 1.3), cp(-3.15, -0.4)], 0.4, 0.45, 0.12, 0.6],
    ]) out.push(...fold(m(pts), w, { hi: (lit ? 0.22 : 0.12) * k, lo: 0.34 * k, blur: 0.2, clip, relief: 0.8, ta, tb }));
    // the blouse overhang shades the cuff top
    const cTop = side === 1 ? cuffTopL : mirror(cuffTopL);
    out.push(dark(ribbon(offset(cTop, -0.3), 0.75), { blur: 0.26, alpha: 0.58, clip: [side === 1 ? "cuffL" : "cuffR"] }));
  }
  // cuffs: cylinder shading along the forearm axis + a shadowed lower edge
  const a = [cp(0, -2.0), cp(M.cuffH, -2.0)], b = [cp(0, 2.0), cp(M.cuffH, 2.0)];
  out.push(...tube(S(a, 4), S(b, 4), { clip: ["cuffL"], hi: 0.2, core: 0.3, refl: 0.05, blur: 0.35, n: 6 }));
  out.push(...tube(mirror(S(a, 4)), mirror(S(b, 4)), { clip: ["cuffR"], hi: 0.14, core: 0.4, refl: 0.05, blur: 0.35, n: 6 }));
  for (const side of [1, -1]) {
    const m = side === 1 ? (p) => p : mirror;
    out.push(dark(ribbon(m(S([cp(M.cuffH - 0.22, -2.0), cp(M.cuffH - 0.08, 0), cp(M.cuffH - 0.22, 2.0)], 6)), 0.45), { blur: 0.22, alpha: 0.3, clip: [side === 1 ? "cuffL" : "cuffR"] }));
  }
  return out;
}

function bandPaint(T) {
  const out = [];
  // the blouse: a soft roll right above the band seam, its shadow on the band below
  out.push(
    lite(ribbon(S([[-11.6, 23.65], [-6, 23.82], [0, 23.88], [6, 23.82], [11.0, 23.65]], 8), taper(0.6, 0.12, 0.2)), { blur: 0.32, alpha: 0.16, clip: T }),
    dark(ribbon(S([[-12, 24.28], [-6, 24.4], [0, 24.45], [6, 24.4], [12, 24.28]], 8), 0.42), { blur: 0.22, alpha: 0.3, clip: T }),
    dark(ribbon(S([[-11.9, 24.6], [-6, 24.72], [0, 24.76], [6, 24.72], [11.9, 24.6]], 8), 0.62), { blur: 0.26, alpha: 0.6, clip: ["band"] }),
  );
  // compression folds where the body blouses into the band (short, frequent, uneven)
  const comp = [
    [[[-12.1, 23.25], [-10.9, 23.5], [-9.7, 23.6]], 0.5], [[[-10.4, 22.7], [-9.2, 22.92], [-8.0, 23.12]], 0.42],
    [[[-7.6, 23.48], [-6.2, 23.64], [-4.9, 23.7]], 0.46], [[[-4.4, 23.05], [-2.8, 23.28], [-1.4, 23.38]], 0.38],
    [[[-0.9, 23.74], [0.8, 23.84], [2.4, 23.8]], 0.44], [[[2.8, 23.15], [4.4, 23.32], [5.9, 23.38]], 0.38],
    [[[6.2, 23.84], [7.8, 23.8], [9.3, 23.6]], 0.46], [[[8.8, 22.95], [10.1, 23.08], [11.4, 23.28]], 0.42],
    [[[10.6, 23.78], [11.4, 23.72], [12.25, 23.48]], 0.38],
  ];
  for (const [pts, w] of comp) out.push(...fold(pts, w, { hi: 0.2, lo: 0.32, blur: 0.22, clip: T, relief: 0.7 }));
  // band: a gentle roll (lit top half, darker toward the hem) and side falloff
  out.push(
    dark(rect(-12, 24, 12, 28), { blur: 0.35, alpha: 0.32, clip: ["band"], grad: { x0: 0, y0: 25.3, x1: 0, y1: 27.6, stops: [[0, 0], [0.6, 0.35], [1, 1]] } }),
    lite(ribbon(S([[-11.5, 25.3], [-4, 25.45], [3, 25.45], [10, 25.3]], 8), taper(0.8, 0.2, 0.2)), { blur: 0.4, alpha: 0.14, clip: ["band"] }),
    dark(rect(5, 24, 12.2, 28), { blur: 0.6, alpha: 0.4, clip: ["band"], grad: { x0: 6, y0: 0, x1: 11.9, y1: 0, stops: [[0, 0], [1, 1]] } }),
    dark(rect(-12.2, 24, -9, 28), { blur: 0.6, alpha: 0.18, clip: ["band"], grad: { x0: -9.5, y0: 0, x1: -11.9, y1: 0, stops: [[0, 0], [1, 1]] } }),
    // small vertical compression puckers in the rib right under the seam
    ...[-10, -7.4, -4.6, -1.8, 1.2, 4.0, 6.8, 9.6].map((x, i) => dark(ribbon(line([x + (i % 2) * 0.3, 24.75], [x + 0.1, 25.6], 3), taper(0.35, 0.3, 0.6)), { blur: 0.2, alpha: 0.15, clip: ["band"] })),
  );
  return out;
}

/* ── front light ── */
function frontLight() {
  const T = TORSO;
  const out = [...torsoKey(T)];
  // shadow cast by the hood onto the chest and shoulders (falls down-right of it)
  out.push(
    dark(ribbon(S([[-6.0, 1.5], [-4.0, 3.3], [-1.6, 4.7], [1.6, 5.0], [4.2, 3.8], [6.3, 2.1], [7.4, 1.4]], 8), (t) => 0.9 + 1.2 * t), { blur: 0.75, alpha: 0.44, clip: T }),
    dark(ribbon(S([[5.4, 1.45], [7.0, 1.5], [8.8, 1.9]], 6), 0.9), { blur: 0.6, alpha: 0.28, clip: T }),
    dark(ribbon(S([[-6.6, 1.2], [-5.0, 2.4], [-3.2, 3.6], [-1.2, 4.5], [0.8, 4.7], [3.0, 3.7], [5.0, 2.4], [6.6, 1.3]], 8), 0.35), { blur: 0.18, alpha: 0.4, clip: T }),
  );
  out.push(...sleevePaint(T));
  // underarm drape: the dropped shoulder gathers cloth into diagonal folds toward the centre
  for (const [pts, w, hi, lo] of [
    [[[-11.9, 11.0], [-10.2, 12.1], [-8.3, 13.7], [-6.6, 15.5]], 1.25, 0.24, 0.32],
    [[[-12.0, 13.6], [-10.6, 14.8], [-9.3, 16.4]], 1.0, 0.18, 0.26],
    [[[-11.7, 8.7], [-10.0, 9.7], [-8.4, 11.1]], 0.85, 0.15, 0.19],
    [[[11.9, 11.2], [10.3, 12.4], [8.7, 14.0], [7.2, 15.6]], 1.2, 0.11, 0.38],
    [[[12.0, 13.9], [10.8, 15.0], [9.7, 16.5]], 0.95, 0.07, 0.3],
    [[[11.6, 8.5], [10.0, 9.7], [8.6, 10.9]], 0.8, 0.07, 0.21],
  ]) out.push(...fold(pts, w, { hi, lo, blur: 0.42, clip: T }));
  // long vertical drape from the chest toward the hem (the body hangs from the chest)
  out.push(...fold([[-10.4, 15.8], [-9.8, 18.2], [-9.7, 20.5], [-10.2, 22.6]], 1.5, { hi: 0.09, lo: 0.1, blur: 0.9, clip: T, ta: 0.45, tb: 0.5 }));
  out.push(...fold([[10.6, 16.6], [10.0, 19.0], [10.1, 21.6]], 1.4, { hi: 0.04, lo: 0.13, blur: 0.9, clip: T, ta: 0.45, tb: 0.5 }));
  out.push(...fold([[-2.2, 5.7], [-2.0, 8.7], [-2.3, 11.7]], 1.4, { hi: 0.07, lo: 0.08, blur: 0.8, clip: T }));
  out.push(...fold([[2.4, 5.9], [2.6, 9.1], [2.3, 12.1]], 1.4, { hi: 0.05, lo: 0.1, blur: 0.8, clip: T, valley: true }));
  // where the pocket top pulls the panel
  out.push(...fold([[-7.6, 16.1], [-5.8, 16.5], [-4.0, 16.62]], 0.8, { hi: 0.12, lo: 0.15, blur: 0.4, clip: T }));
  out.push(...fold([[4.2, 16.5], [6.0, 16.2], [8.2, 15.7]], 0.75, { hi: 0.07, lo: 0.17, blur: 0.4, clip: T }));
  out.push(...bandPaint(T));
  // pocket: puffed volume, rolled top edge, deep hand openings
  out.push(
    blob("light", -2.2, 19.6, 4.6, 2.0, -6, { blur: 1.3, alpha: 0.15, clip: ["pocket"] }),
    dark(rect(-8, 21, 8, 25), { blur: 0.7, alpha: 0.22, clip: ["pocket"], grad: { x0: 0, y0: 21.3, x1: 0, y1: 24.6, stops: [[0, 0], [1, 1]] } }),
    dark(rect(2, 17, 8, 25), { blur: 0.8, alpha: 0.2, clip: ["pocket"], grad: { x0: 2.5, y0: 0, x1: 7.0, y1: 0, stops: [[0, 0], [1, 1]] } }),
    brush("light", [[-4.1, 17.24], [0, 17.2], [4.1, 17.24]], 0.34, { blur: 0.14, alpha: 0.24, clip: ["pocket"], ta: 0.1, tb: 0.1 }),
    dark(ribbon(S([[-4.3, 17.62], [0, 17.6], [4.3, 17.62]], 6), 0.3), { blur: 0.2, alpha: 0.17, clip: ["pocket"] }),
    dark(ribbon(S([[-4.4, 16.88], [0, 16.86], [4.4, 16.88]], 6), 0.26), { blur: 0.16, alpha: 0.34, clip: ["body"] }),
  );
  for (const side of [1, -1]) {
    const op = side === 1 ? pocketOpenL : mirror(pocketOpenL);
    const nearLight = side === 1;
    // the opening: a dark slot into the pocket bag, on the body side of the edge
    out.push(dark(ribbon(offset(op, side * 0.2), taper(0.46, 0.1, 0.18)), { blur: 0.16, alpha: 0.78, clip: ["body"] }));
    out.push(dark(ribbon(offset(op, side * 0.55), taper(1.1, 0.12, 0.25)), { blur: 0.5, alpha: nearLight ? 0.26 : 0.4, clip: ["body"] }));
    // the pocket's edge lip catches light (left) or turns into shade (right)
    out.push((nearLight ? lite : dark)(ribbon(offset(op, -side * 0.14), taper(0.2, 0.1, 0.1)), { blur: 0.12, alpha: nearLight ? 0.3 : 0.22, clip: ["pocket"] }));
    out.push(dark(ribbon(offset(op, -side * 0.6), taper(0.9, 0.2, 0.3)), { blur: 0.5, alpha: 0.1, clip: ["pocket"] }));
  }
  out.push(
    dark(ribbon(line([-7.12, 21.4], [-7.12, 24.6], 4), 0.24), { blur: 0.14, alpha: 0.3, clip: ["body"] }),
    dark(ribbon(line([7.2, 21.4], [7.2, 24.6], 4), 0.45), { blur: 0.26, alpha: 0.44, clip: ["body"] }),
  );
  // hood shell: dome lit from the upper left, the right side turns into shadow
  out.push(
    dark(rect(0.5, -13, 7.5, 2), { blur: 0.7, alpha: 0.52, clip: ["hoodShell"], grad: { x0: 4.4, y0: 0, x1: 6.6, y1: 0, stops: [[0, 0], [1, 1]] } }),
    dark(rect(-7.5, -2, 7.5, 2), { blur: 0.6, alpha: 0.26, clip: ["hoodShell"], grad: { x0: 0, y0: -2.5, x1: 0, y1: 1.4, stops: [[0, 0], [1, 1]] } }),
    brush("light", [[-5.95, -1.6], [-6.05, -4.6], [-5.65, -8.0], [-4.2, -10.6], [-1.4, -11.85]], 0.75, { blur: 0.4, alpha: 0.24, clip: ["hoodShell"] }),
    dark(ribbon(mirror(offset(slice(hoodOuterL, 0.15, 1, 20), 0.18)), 0.55), { blur: 0.3, alpha: 0.38, clip: ["hoodShell"] }),
    // where the shell meets the rim the cloth folds under the channel
    dark(ribbon(offset(rimOuterL, 0.2), taper(0.4, 0.1, 0.2)), { blur: 0.2, alpha: 0.34, clip: ["hoodShell"] }),
    dark(ribbon(mirror(offset(rimOuterL, 0.2)), taper(0.45, 0.1, 0.2)), { blur: 0.2, alpha: 0.4, clip: ["hoodShell"] }),
    // the hood sides sitting on the shoulders: a soft fold each side
    ...fold([[-6.1, -2.0], [-5.9, -0.2], [-5.2, 1.4]], 0.7, { hi: 0.15, lo: 0.19, blur: 0.3, clip: ["hoodShell"], relief: 0 }),
    ...fold([[6.1, -2.0], [5.9, -0.2], [5.2, 1.4]], 0.7, { hi: 0.08, lo: 0.25, blur: 0.3, clip: ["hoodShell"], relief: 0 }),
  );
  // rims: rolled double-layer edge (tube shading); the left one overlaps the right
  out.push(...tube(rimOut, rimIn, { clip: ["rimL"], hi: 0.34, core: 0.34, refl: 0.1, blur: 0.22, hiW: 0.3, coreW: 0.3, n: 44, relief: 0 }));
  out.push(...tube(mirror(rimOut), mirror(rimIn), { clip: ["rimR"], hi: 0.32, core: 0.42, refl: 0.1, blur: 0.22, hiW: 0.3, coreW: 0.3, n: 44, relief: 0 }));
  out.push(
    // crossover: the left rim casts onto the right rim and the chest
    dark(ribbon(offset(slice(rimOuterL, 0.76, 1, 12), -0.24), taper(0.55, 0.2, 0.1)), { blur: 0.24, alpha: 0.58, clip: ["rimR", ...T] }),
    dark(ribbon(offset(slice(rimInnerL, 0.8, 1, 10), 0.18), taper(0.4, 0.1, 0.1)), { blur: 0.2, alpha: 0.44, clip: ["rimR", "lining", "innerBack"] }),
    // the rims lift off the chest: occlusion under their outer edges
    dark(ribbon(offset(slice(rimOuterL, 0.64, 1, 14), -0.3), taper(0.6, 0.2, 0.1)), { blur: 0.35, alpha: 0.34, clip: T }),
    dark(ribbon(mirror(offset(slice(rimOuterL, 0.64, 0.98, 14), -0.36)), taper(0.75, 0.2, 0.1)), { blur: 0.4, alpha: 0.44, clip: T }),
  );
  // lining: a cavity — the crown and the rims shade it, its far wall faces the camera
  out.push(
    dark(OPENING, { blur: 0.3, alpha: 0.12, clip: ["lining"] }),
    dark(rect(-5, -11, 5, 3), { blur: 0.8, alpha: 0.46, clip: ["lining", "innerBack"], grad: { type: "radial", x0: 0.4, y0: -5.6, r0: 1.2, x1: -0.3, y1: -2.0, r1: 8.2, stops: [[0, 0.05], [0.5, 0.32], [1, 1]] } }),
    dark(ribbon(offset(slice(rimInnerL, 0.04, 0.9, 30), -0.75), taper(2.1, 0.12, 0.25)), { blur: 0.75, alpha: 0.46, clip: ["lining"] }),
    dark(ribbon(S([[-3.3, -9.2], [0, -9.75], [3.3, -9.2]], 8), taper(1.6, 0.25, 0.25)), { blur: 0.75, alpha: 0.4, clip: ["lining"] }),
    blob("light", 2.6, -4.6, 1.25, 3.5, 4, { blur: 1.0, alpha: 0.22, clip: ["lining"] }),
    blob("light", -1.4, -5.6, 1.0, 2.6, -6, { blur: 1.0, alpha: 0.08, clip: ["lining"] }),
    lite(ribbon(offset(mirror(slice(rimInnerL, 0.06, 0.8, 24)), 0.16), taper(0.26, 0.1, 0.2)), { blur: 0.12, alpha: 0.3, clip: ["lining"] }),
    lite(ribbon(offset(slice(rimInnerL, 0.2, 0.7, 20), -0.13), taper(0.16, 0.2, 0.2)), { blur: 0.1, alpha: 0.12, clip: ["lining"] }),
    // the lining's centre seam runs down the inside of the hood into the dark
    ...fold([[0.05, -9.4], [0.15, -5.0], [0.05, -1.2]], 0.5, { hi: 0.09, lo: 0.18, blur: 0.25, clip: ["lining"], relief: 0, valley: true }),
  );
  // the inside back neck: deep in the cavity, darker toward the bottom of the opening
  out.push(
    dark(INNER_BACK, { blur: 0.25, alpha: 0.55, clip: ["innerBack", "tape", "label"] }),
    dark(rect(-4, BN_Y, 4, 3.5), { blur: 0.4, alpha: 0.62, clip: ["innerBack", "label", "tape"], grad: { x0: 0, y0: BN_Y + 0.4, x1: 0, y1: 2.4, stops: [[0, 0.25], [1, 1]] } }),
    dark(ribbon(S([[-3.6, 1.0], [-2.0, 2.2], [0, 2.8], [2.0, 2.2], [3.6, 1.0]], 8), 1.2), { blur: 0.4, alpha: 0.5, clip: ["innerBack"] }),
    dark(ribbon(offset(backNeck, -0.18), 0.5), { blur: 0.3, alpha: 0.42, clip: ["lining"] }),
    lite(ribbon(slice(backNeck, 0.25, 0.75, 10), taper(0.16, 0.3, 0.3)), { blur: 0.1, alpha: 0.2, clip: ["tape"] }),
    lite(ribbon(S([[-0.4, BN_Y + 0.98], [0, BN_Y + 1.02], [0.4, BN_Y + 0.98]], 4), 0.12), { blur: 0.06, alpha: 0.18, clip: ["label"] }),
  );
  // the cords leave the eyelets: occlusion around the exits
  out.push(blob("dark", EYE_L[0] + 0.15, EYE_L[1] + 0.3, 0.45, 0.4, 0, { blur: 0.22, alpha: 0.33, clip: ["rimL"] }));
  out.push(blob("dark", EYE_R[0] + 0.15, EYE_R[1] + 0.3, 0.45, 0.4, 0, { blur: 0.22, alpha: 0.33, clip: ["rimR"] }));
  return flat(out);
}

/** Silhouette edges: a thin rim light where the contour faces the key, falloff on the far side. */
function silhouetteEdges(T, withHood) {
  const e = [
    { pts: F.P(slice(sleeveOuterL, 0.1, 1, 30)), clip: ["sleeveL"], w: F.u(0.32), blur: F.u(0.16), alpha: 0.2 },
    { pts: F.P(mirror(slice(sleeveOuterL, 0.1, 1, 30))), clip: ["sleeveR"], layer: "dark", w: F.u(0.55), blur: F.u(0.3), alpha: 0.32 },
    { pts: F.P(slice(sleeveInnerL, 0.05, 0.7, 20)), clip: ["sleeveL"], layer: "dark", w: F.u(0.3), blur: F.u(0.18), alpha: 0.22 },
    { pts: F.P(mirror(slice(sideL, 0.25, 0.95, 20))), clip: T, layer: "dark", w: F.u(0.55), blur: F.u(0.3), alpha: 0.32 },
    { pts: F.P(slice(sideL, 0.25, 0.95, 20)), clip: T, layer: "dark", w: F.u(0.35), blur: F.u(0.2), alpha: 0.16 },
    { pts: F.P(slice(shoulderL, 0.0, 1, 12)), clip: T, w: F.u(0.3), blur: F.u(0.14), alpha: 0.18 },
  ];
  if (withHood) {
    e.push({ pts: F.P(slice(hoodOuterL, 0.05, 0.85, 30)), clip: ["hoodShell"], w: F.u(0.28), blur: F.u(0.14), alpha: 0.2 });
    e.push({ pts: F.P(mirror(slice(hoodOuterL, 0.05, 0.95, 30))), clip: ["hoodShell"], layer: "dark", w: F.u(0.5), blur: F.u(0.26), alpha: 0.3 });
  }
  return e;
}

const RIBS = [
  { part: "band", angle: 90, period: F.u(0.135), depth: 0.42 },
  { part: "cuffL", angle: 90 + (Math.atan2(CUFF_AX[0], CUFF_AX[1]) * -180) / Math.PI, period: F.u(0.13), depth: 0.4 },
  { part: "cuffR", angle: 90 + (Math.atan2(CUFF_AX[0], CUFF_AX[1]) * 180) / Math.PI, period: F.u(0.13), depth: 0.4 },
];

function frontDetail() {
  const seams = [
    { pts: F.P(armholeL), clip: [...TORSO, ...SLEEVES], w: 1.2 },
    { pts: F.P(mirror(armholeL)), clip: [...TORSO, ...SLEEVES], w: 1.2 },
    { pts: F.P(bandSeamL.concat(rev(mirror(bandSeamL)))), clip: [...TORSO, "band"], w: 1.3 },
    { pts: F.P(slice(hoodBottom, 0, 0.3, 10)), clip: ["hoodShell", "body"], w: 1.1, depth: 0.4 },
    { pts: F.P(slice(hoodBottom, 0.7, 1, 10)), clip: ["hoodShell", "body"], w: 1.1, depth: 0.4 },
    { pts: F.P(join(pocketTopL, pocketOpenL)), clip: ["pocket", "body"], w: 1.0, depth: 0.45 },
    { pts: F.P(mirror(join(pocketTopL, pocketOpenL))), clip: ["pocket", "body"], w: 1.0, depth: 0.45 },
    { pts: F.P(rimOuterL), clip: ["rimL", "hoodShell"], w: 0.9, depth: 0.35 },
    { pts: F.P(mirror(rimOuterL)), clip: ["rimR", "hoodShell"], w: 0.9, depth: 0.35 },
    { pts: F.P(S([[0, M.hoodTop], [0, -11.45]], 3)), clip: ["hoodShell"], w: 1.0, depth: 0.4 },
  ];
  const band = join(bandSeamL, rev(mirror(bandSeamL)).slice(1));
  const stitches = [
    { pts: F.P(offset(band, 0.42)), clip: TORSO, gap: F.u(0.22) },            // twin needle above the band
    { pts: F.P(offset(join(pocketTopL, rev(mirror(pocketTopL)).slice(1)), 0.5)), clip: ["pocket"], gap: F.u(0.2) },
    { pts: F.P(offset(pocketOpenL, -0.16)), clip: ["pocket"], twin: false },
    { pts: F.P(mirror(offset(pocketOpenL, -0.16))), clip: ["pocket"], twin: false },
    { pts: F.P(line([-M.pocketHalf + 0.14, M.pocketOpenY + 0.2], [-M.pocketHalf + 0.14, 24.5], 4)), clip: ["pocket"], twin: false },
    { pts: F.P(line([M.pocketHalf - 0.14, M.pocketOpenY + 0.2], [M.pocketHalf - 0.14, 24.5], 4)), clip: ["pocket"], twin: false },
    { pts: F.P(offset(armholeL, -0.2)), clip: ["body"], gap: F.u(0.22) },        // armhole cover stitch
    { pts: F.P(mirror(offset(armholeL, -0.2))), clip: ["body"], gap: F.u(0.22) },
    { pts: F.P(offset(rimOuterL, -0.12).slice(2, -4)), clip: ["rimL"], twin: false },   // drawcord channel
    { pts: F.P(mirror(offset(rimOuterL, -0.12)).slice(2, -4)), clip: ["rimR"], twin: false },
  ];
  const cords = [
    { part: "cordL", pts: F.P(cordL), w: F.u(M.cordW) },
    { part: "cordR", pts: F.P(cordR), w: F.u(M.cordW) },
  ];
  const metal = [
    { type: "eyelet", c: F.p(EYE_L), r: F.u(0.27), ri: F.u(0.17) },
    { type: "eyelet", c: F.p(EYE_R), r: F.u(0.27), ri: F.u(0.17) },
    { type: "aglet", pts: F.P(agletL), w: F.u(M.agletW) },
    { type: "aglet", pts: F.P(agletR), w: F.u(M.agletW) },
  ];
  return { seams, stitches, ribs: RIBS, cords, metal, edges: silhouetteEdges(TORSO, true) };
}

// "chest-left" = the WEARER's left chest = the viewer's right on a front view
const frontZones = {
  "chest-left": F.box(4.7, 5.6, 3.6, 3.6, "Left chest"),
  "chest-center": F.box(-3.6, 5.4, 7.2, 4.8, "Center chest"),
  center: F.box(-6.3, 5.4, 12.6, 10.8, "Full front"),
  oversized: F.box(-5.0, 1.5, 23.0, 23.0, "Oversized · crops right"),
  hood: { ...F.box(5.45, -8.0, 0.95, 4.6, "Hood side"), clip: ["hoodShell"] },
  pouch: F.box(-6.2, 17.7, 12.4, 6.4, "Pouch"),
};

/* ═════════════════════════════════ BACK ═════════════════════════════════ */

const backNecklineL = S([[0, 0.85], [-2.4, 0.62], [-4.5, 0.1], [-6.0, 0.45], HF], 6);
const backBodyHalf = join(backNecklineL, shoulderL, armholeL, sideL, bandSeamL);
const BACK_BODY = join(backBodyHalf, rev(mirror(backBodyHalf)));

// the hood lying flat down the upper back: a rounded shield, centre seam, rolled top edge
const hoodBackTopL = S([[0, -0.85], [-2.6, -0.68], [-4.6, -0.05], [-5.95, 0.75], [-6.4, 1.6]], 8);
const hoodBackSideL = S([[-6.4, 1.6], [-6.55, 3.6], [-6.15, 6.6], [-5.0, 9.3], [-3.1, 11.3], [-1.2, 12.25], [0, 12.4]], 10);
const hoodBackHalf = join(hoodBackTopL, hoodBackSideL);
const HOOD_BACK = join(hoodBackHalf, rev(mirror(hoodBackHalf)).slice(1));
const hoodBackSides = join(hoodBackSideL, rev(mirror(hoodBackSideL)).slice(1));
const LIP = join(S([[-4.4, -0.1], [-2.5, -0.63], [0, -0.83], [2.5, -0.63], [4.4, -0.1]], 8), rev(S([[-4.4, -0.1], [-2.4, -0.42], [0, -0.55], [2.4, -0.42], [4.4, -0.1]], 8)));

const backParts = [
  { id: "band", pts: BAND, role: "trim", grain: 0.5 },
  { id: "cuffL", pts: CUFF_L, role: "trim", grain: 0.5 },
  { id: "cuffR", pts: CUFF_R, role: "trim", grain: 0.5 },
  { id: "body", pts: BACK_BODY, role: "base", print: true },
  { id: "sleeveL", pts: SLEEVE_L, role: "base" },
  { id: "sleeveR", pts: SLEEVE_R, role: "base" },
  { id: "hood", pts: HOOD_BACK, role: "base" },
  { id: "lip", pts: LIP, role: "trim" },
].map((p) => ({ ...p, pts: F.P(p.pts) }));

function backLight() {
  const T = ["body"];
  const out = [...torsoKey(T, { top: 0 })];
  // shoulder blades: two soft vertical planes; the spine channel between them
  out.push(
    ...fold([[-6.6, 12.8], [-7.0, 16.4], [-6.8, 20.4]], 1.5, { hi: 0.1, lo: 0.12, blur: 0.9, clip: T }),
    ...fold([[6.8, 13.0], [7.1, 16.6], [6.9, 20.4]], 1.5, { hi: 0.05, lo: 0.15, blur: 0.9, clip: T }),
    ...fold([[0.1, 12.6], [0.2, 17.5], [0.1, 22.0]], 1.6, { hi: 0.06, lo: 0.08, blur: 1.0, clip: T, valley: true }),
  );
  // the hood lies on the back: cast shadow (down-right) + tight contact occlusion
  out.push(
    dark(ribbon(offset(hoodBackSides, -0.1).map(([x, y]) => [x + 0.45, y + 0.5]), 1.3), { blur: 0.65, alpha: 0.5, clip: T }),
    dark(ribbon(offset(hoodBackSides, -0.08), 0.42), { blur: 0.2, alpha: 0.48, clip: T }),
  );
  out.push(...sleevePaint(T, { back: true }));
  for (const [pts, w, hi, lo] of [
    [[[-11.9, 11.0], [-10.2, 12.8], [-8.8, 15.0]], 1.15, 0.2, 0.27],
    [[[12.0, 11.2], [10.4, 13.0], [9.2, 15.2]], 1.1, 0.1, 0.33],
    [[[-12.0, 14.4], [-10.8, 16.3], [-10.0, 18.0]], 0.9, 0.14, 0.21],
    [[[12.1, 14.6], [11.0, 16.4], [10.3, 18.0]], 0.85, 0.06, 0.25],
  ]) out.push(...fold(pts, w, { hi, lo, blur: 0.45, clip: T }));
  out.push(...fold([[-10.0, 17.8], [-9.4, 20.0], [-9.7, 22.6]], 1.4, { hi: 0.08, lo: 0.1, blur: 0.9, clip: T, ta: 0.45, tb: 0.5 }));
  out.push(...fold([[10.2, 18.0], [9.7, 20.2], [10.0, 22.4]], 1.3, { hi: 0.04, lo: 0.13, blur: 0.9, clip: T, ta: 0.45, tb: 0.5 }));
  out.push(...bandPaint(T));
  // hood: a soft, fairly flat pillow — rolled sides, centre-seam valley, lit upper left
  out.push(
    blob("light", -2.8, 3.6, 2.8, 4.2, 10, { blur: 1.4, alpha: 0.17, clip: ["hood"] }),
    dark(rect(0.4, -2, 7, 13), { blur: 0.8, alpha: 0.34, clip: ["hood"], grad: { x0: 1.2, y0: 0, x1: 6.0, y1: 0, stops: [[0, 0], [1, 1]] } }),
    dark(rect(-7, 5, 7, 13), { blur: 0.8, alpha: 0.24, clip: ["hood"], grad: { x0: 0, y0: 6.5, x1: 0, y1: 12.4, stops: [[0, 0], [1, 1]] } }),
    // double-layer edge: a rolled rim all the way round
    dark(ribbon(offset(hoodBackSides, 0.16), 0.38), { blur: 0.2, alpha: 0.32, clip: ["hood"] }),
    lite(ribbon(offset(slice(hoodBackSideL, 0.03, 0.75, 24), 0.42), taper(0.42, 0.15, 0.35)), { blur: 0.22, alpha: 0.22, clip: ["hood"] }),
    dark(ribbon(offset(mirror(slice(hoodBackSideL, 0.03, 0.9, 24)), -0.5), taper(0.6, 0.15, 0.3)), { blur: 0.3, alpha: 0.25, clip: ["hood"] }),
    // the rolled top edge where the hood folds over the neck
    lite(ribbon(S([[-5.4, 0.7], [-2.8, -0.28], [0, -0.45], [2.8, -0.28], [5.4, 0.7]], 8), taper(0.42, 0.15, 0.15)), { blur: 0.25, alpha: 0.24, clip: ["hood"] }),
    dark(ribbon(S([[-5.7, 1.5], [-2.8, 0.55], [0, 0.4], [2.8, 0.55], [5.7, 1.5]], 8), taper(0.6, 0.15, 0.15)), { blur: 0.35, alpha: 0.25, clip: ["hood"] }),
    dark(LIP, { blur: 0.2, alpha: 0.4, clip: ["lip"] }),
    lite(ribbon(S([[-3.6, -0.42], [0, -0.72], [3.6, -0.42]], 8), taper(0.1, 0.2, 0.2)), { blur: 0.08, alpha: 0.2, clip: ["lip"] }),
  );
  // gentle folds on the hood fabric fanning from the neck; the centre seam as a valley
  out.push(...fold([[-3.7, 1.8], [-4.0, 4.8], [-3.5, 8.0]], 0.9, { hi: 0.11, lo: 0.15, blur: 0.45, clip: ["hood"], relief: 0 }));
  out.push(...fold([[3.8, 2.0], [4.1, 5.0], [3.6, 7.8]], 0.85, { hi: 0.06, lo: 0.19, blur: 0.45, clip: ["hood"], relief: 0 }));
  out.push(...fold([[0.05, 0.4], [0.15, 6.0], [0.05, 11.8]], 0.8, { hi: 0.13, lo: 0.23, blur: 0.26, clip: ["hood"], valley: true, relief: 0 }));
  return flat(out);
}

function backDetail() {
  const band = join(bandSeamL, rev(mirror(bandSeamL)).slice(1));
  const seams = [
    { pts: F.P(armholeL), clip: ["body", ...SLEEVES], w: 1.2 },
    { pts: F.P(mirror(armholeL)), clip: ["body", ...SLEEVES], w: 1.2 },
    { pts: F.P(band), clip: ["body", "band"], w: 1.3 },
    { pts: F.P(S([[0, -0.75], [0.03, 6.0], [0, 12.35]], 6)), clip: ["hood"], w: 1.25, depth: 0.55 },
  ];
  const stitches = [
    { pts: F.P(offset(band, 0.42)), clip: ["body"], gap: F.u(0.22) },
    { pts: F.P(offset(armholeL, -0.2)), clip: ["body"], gap: F.u(0.22) },
    { pts: F.P(mirror(offset(armholeL, -0.2))), clip: ["body"], gap: F.u(0.22) },
    { pts: F.P(S([[0, -0.4], [0.03, 6.0], [0, 12.0]], 6)), clip: ["hood"], gap: F.u(0.3) },   // hood centre seam
    { pts: F.P(offset(hoodBackSides, 0.32).slice(3, -3)), clip: ["hood"], twin: false },     // channel stitch
  ];
  const edges = silhouetteEdges(["body"], false);
  edges.push({ pts: F.P(slice(hoodBackSideL, 0.0, 0.8, 24)), clip: ["hood"], w: F.u(0.28), blur: F.u(0.14), alpha: 0.2 });
  return { seams, stitches, ribs: RIBS, edges };
}

const backZones = {
  "back-yoke": F.box(-1.8, 13.2, 3.6, 3.6, "Back yoke"),
  "back-center": F.box(-6.6, 12.6, 13.2, 11.6, "Full back"),
  oversized: F.box(-18.0, 3.0, 23.0, 23.0, "Oversized · crops left"),
};

/* ───────────────────────────── assemble ───────────────────────────── */

const LIGHT_MODEL = { exposure: 1.0, diffuse: 1.25, shadowGain: 1.7, lightGain: 1.6, sheen: 0.1, printSheen: 0.05, inkGrain: 0.12, floor: 0.012 };
const DROP = { passes: [[9, 15, 22, 0.24], [3, 6, 7, 0.18], [1, 2, 1.8, 0.14]] };
const UNDULATE = { amount: 0.1, scale: F.u(1.6), stretch: 4, blur: F.u(0.6), relief: 0.6, lightRatio: 0.7, heather: 0.22, seed: 5 };
const WRAP = [{ cx: 500, r: F.u(19), y0: F.p([0, 1])[1], y1: F.p([0, 24.7])[1], feather: F.u(1.5), amount: 1 }];

export default {
  id: "hoodie",
  name: "Warm-up Hoodie",
  styleCode: "ML-H01",
  category: "warmup",
  fabric: "fleece",
  spec: "Heavyweight brushed-back fleece · double-layer hood · dropped shoulder · 450 gsm",
  format: "photo",
  defaultColors: { base: "dark", trim: "primary", accent: "secondary" },
  views: {
    front: {
      parts: frontParts, light: frontLight(), ...frontDetail(),
      zones: frontZones, print: TORSO, clipSets: { torso: TORSO },
      wraps: WRAP, lightModel: LIGHT_MODEL, drop: DROP, relief: 420,
      undulation: { ...UNDULATE, skip: ["innerBack", "tape", "label", "lining", "cordL", "cordR"] },
    },
    back: {
      parts: backParts, light: backLight(), ...backDetail(),
      zones: backZones, print: ["body"], clipSets: { torso: ["body"] },
      wraps: WRAP, lightModel: LIGHT_MODEL, drop: DROP, relief: 420,
      undulation: { ...UNDULATE, seed: 9, skip: ["lip"] },
    },
  },
};

/* ───────────────────────────── spec check ───────────────────────────── */

/** measure() → [[label, spec, drawn]] taken from the actual polygons (inches). */
export function measure() {
  const w = (poly, y) => { const s = spanAtY(poly, y); return s ? s[1] - s[0] : null; };
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const cuffOut = Math.hypot(cp(M.cuffH, -2)[0] - sleeveEndL[0][0], cp(M.cuffH, -2)[1] - sleeveEndL[0][1]);
  const sleeveLen = polyLength(sleeveOuterL) + cuffOut;
  const armDeg = (Math.atan2(-(sl(11.4, 0)[0] - sl(2, 0)[0]), sl(11.4, 0)[1] - sl(2, 0)[1]) * 180) / Math.PI;
  const foreDeg = (Math.atan2(-(sl(SL_END, 0)[0] - sl(12, 0)[0]), sl(SL_END, 0)[1] - sl(12, 0)[1]) * 180) / Math.PI;
  const hoodTop = Math.min(...hoodOuterL.map((p) => p[1]));
  const hoodHalf = Math.max(...hoodOuterL.filter((p) => p[1] < -1).map((p) => -p[0]));
  const cuffEndY = cp(M.cuffH + 0.15, 0)[1];
  return [
    ["Chest width (1\" below armhole)", 25, r2(w(BODY, M.underarmY + 1))],
    ["Body length HPS → hem (centre)", 27.5, r2(Math.max(...BAND.map((p) => p[1])))],
    ["Hem band height", 3, r2(27.5 - 24.5)],
    ["Hem band width / body width", "< 1 (blouses)", r2(w(BAND, 25.5) / w(BODY, 20))],
    ["Across shoulder (seam to seam)", 23.5, r2(2 * -SP[0])],
    ["Sleeve, shoulder seam → cuff end (outer contour)", 23, r2(sleeveLen)],
    ["Bicep, projected (filled tube ≈ 10.5 × 2 / π)", 6.7, r2(2 * hwAt(4.5))],
    ["Upper arm angle from vertical (°)", "15–20", r2(armDeg)],
    ["Forearm angle from vertical (°, elbow bend)", "< upper arm", r2(foreDeg)],
    ["Cuff width", 4, r2(Math.hypot(cp(M.cuffH, -2)[0] - cp(M.cuffH, 2)[0], cp(M.cuffH, -2)[1] - cp(M.cuffH, 2)[1]))],
    ["Cuff height", 3.25, M.cuffH],
    ["Cuff end (centre) below HPS", "in the hem band (24.5–27.5)", r2(cuffEndY)],
    ["Hood above HPS (front, standing)", "≈ 12–13 (14.5 flat)", r2(-hoodTop)],
    ["Hood width (front, standing part)", "≈ 11–13", r2(2 * hoodHalf)],
    ["Pocket width", 14, r2(w(POCKET, 23))],
    ["Pocket height", 7.5, r2(24.5 - M.pocketTop)],
    ["Drawcord drop below neckline", 9, r2(CORD_END - NECK_Y)],
    ["Aglet length", 1, M.agletL],
  ];
}
