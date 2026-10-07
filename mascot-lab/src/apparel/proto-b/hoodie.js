// proto-b · Oversized heavyweight warm-up hoodie, size L — "painted light" photo definition.
//
// Authored in INCHES on the garment (x right of centre front, y down from the high
// point shoulder), mapped to the 1000-unit artboard by FRAME. Front view = ghost
// mannequin with the arms hanging ~17° out and a slight elbow bend; back view = the hood
// lying flat down the upper back.
//
// Spec (flat, size L) → how it is drawn:
//   chest 25" (1" below armhole)      body panel 25.0" wide at y = 12
//   body length 27.5" HPS → hem        hem band bottom at y = 27.5 (centre)
//   across shoulder 23.5"              shoulder seam points at x = ±11.75
//   sleeve 23" from shoulder seam      outer contour SP → cuff end (projected) + bunching
//   bicep 10.5" flat                   a FILLED tube on the mannequin: projected ≈ 6"
//                                      (a 21" circumference seen from the front ≈ 6.7")
//   cuff 4" × 3.25" rib                exact; the sleeve bunches in rings above it
//   hem band 3" rib                    23.5" wide vs 25" body: the body blouses over it
//   hood 14.5" × 11" double layer      stands 12" above the HPS (front view, it leans back),
//                                      the opening shows the lining + the inside back neck
//   kangaroo pocket 14" × 7.5"         exact, angled hand openings
//   drawcords ~9" below the neckline   aglet tips 9" below the centre-front neckline, 1" aglets
//
// Layer recipe per view: parts (panels by colour role) → paint (authored soft light, the
// bulk of this file) → seams / stitches / ribs / cords / metal / edges (procedural detail
// the engine draws from centre lines) → zones (CONTRACTS.md placement boxes).

import { spline, join, rev, mirror, resample, ribbon, taper, ellipse, offset, normals, inchFrame, lerp, clamp, polyLength, spanAtY, atY, slice, line } from "./geom.js";
import { LIGHT } from "./engine.js";

export const FRAME = inchFrame({ unit: 20.5, cx: 500, y0: 318 });
const F = FRAME;

/* ───────────────────────────── authoring helpers ───────────────────────────── */

const S = (pts, seg = 10) => spline(pts, seg);
const mp = (p) => [-p[0], p[1]];

function mapGrad(g) {
  if (!g) return undefined;
  const p0 = F.p([g.x0, g.y0]), p1 = F.p([g.x1 ?? g.x0, g.y1 ?? g.y0]);
  return { type: g.type || "linear", x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], r0: F.u(g.r0 || 0), r1: F.u(g.r1 || 1), stops: g.stops };
}
/** One soft paint item from an inch-space polygon. */
function item(layer, poly, { blur = 0.5, alpha = 0.3, clip = "all", fold = 0, exclude, grad } = {}) {
  return { layer, pts: F.P(poly), blur: F.u(blur), alpha, clip, fold, exclude, grad: mapGrad(grad) };
}
const dark = (poly, o) => item("dark", poly, o);
const lite = (poly, o) => item("light", poly, o);
const blob = (layer, cx, cy, rx, ry, rotDeg, o) => item(layer, ellipse(cx, cy, rx, ry, (rotDeg * Math.PI) / 180, 40), o);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** Tapered brush stroke along a spline through `pts`. */
function brush(layer, pts, width, o = {}) {
  const cl = S(pts, 10);
  const w = typeof width === "number" ? taper(width, o.ta ?? 0.35, o.tb ?? 0.35) : width;
  return item(layer, ribbon(cl, w), o);
}
/** Which way is "toward the light" for a polyline: +1 = along normals(). */
function litSign(cl) {
  let s = 0;
  for (const n of normals(cl)) s += n[0] * LIGHT[0] + n[1] * LIGHT[1];
  return s >= 0 ? 1 : -1;
}
/**
 * A fold as a painter paints it: a highlight on the flank facing the key light and a
 * shadow on the far flank, both tapered brush strokes; a soft halo + a tighter core give
 * the variable softness of real cloth (crisp at the crest, soft where it dies out).
 * valley = a crease (dark on the near flank, light on the far one).
 */
function fold(pts, width, { hi = 0.22, lo = 0.3, blur = 0.4, clip = "torso", relief = 1, sep = 0.34, valley = false, ta = 0.38, tb = 0.38 } = {}) {
  const cl = S(pts, 10);
  const nr = normals(cl);
  const sg = litSign(cl) * (valley ? -1 : 1);
  const off = (d) => cl.map((p, i) => [p[0] + nr[i][0] * d * sg, p[1] + nr[i][1] * d * sg]);
  const W = taper(width, ta, tb);
  const out = [];
  if (hi > 0) {
    out.push(item("light", ribbon(off(width * sep), (t) => W(t) * 0.95), { blur, alpha: hi * 0.75, clip, fold: relief }));
    out.push(item("light", ribbon(off(width * sep * 0.7), (t) => W(t) * 0.35), { blur: blur * 0.4, alpha: hi * 0.5, clip }));
  }
  if (lo > 0) {
    out.push(item("dark", ribbon(off(-width * sep), (t) => W(t) * 1.1), { blur: blur * 1.25, alpha: lo * 0.7, clip, fold: relief }));
    out.push(item("dark", ribbon(off(-width * sep * 0.5), (t) => W(t) * 0.4), { blur: blur * 0.4, alpha: lo * 0.6, clip }));
  }
  return out;
}
/**
 * Cylinder shading between two contours A and B running the same way (a sleeve, a rim,
 * a rolled hood edge): highlight a third in from the lit contour, core shadow two thirds
 * across, a little reflected light near the far edge. Which contour is lit is decided per
 * sample from the key light, so mirrored geometry lights itself correctly.
 */
function tube(A, B, { clip, hi = 0.18, core = 0.3, refl = 0.05, blur = 0.7, n = 28, hiW = 0.28, coreW = 0.34, relief = 0.6 } = {}) {
  const a = resample(A, n), b = resample(B, n);
  const H = [], C = [], R = [], wH = [], wC = [], f = [];
  for (let i = 0; i <= n; i++) {
    const dx = b[i][0] - a[i][0], dy = b[i][1] - a[i][1], w = Math.hypot(dx, dy) || 1e-3;
    const facingA = clamp(((-dx / w) * LIGHT[0] + (-dy / w) * LIGHT[1]) * 2.2, -1, 1);   // +1: A faces the light
    const th = 0.5 - 0.3 * facingA, tc = 0.5 + 0.27 * facingA, tr = 0.5 + 0.44 * facingA;
    H.push([lerp(a[i][0], b[i][0], th), lerp(a[i][1], b[i][1], th)]);
    C.push([lerp(a[i][0], b[i][0], tc), lerp(a[i][1], b[i][1], tc)]);
    R.push([lerp(a[i][0], b[i][0], tr), lerp(a[i][1], b[i][1], tr)]);
    wH.push(w * hiW); wC.push(w * coreW); f.push(Math.abs(facingA));
  }
  const prof = (arr) => (t) => {
    const k = clamp(t, 0, 1) * (arr.length - 1);
    const i = Math.min(arr.length - 2, Math.floor(k));
    return lerp(arr[i], arr[i + 1], k - i) * Math.max(0, Math.min(1, t / 0.06, (1 - t) / 0.06));
  };
  const out = [
    item("light", ribbon(H, (t) => prof(wH)(t) * (0.6 + 0.4 * prof(f)(t))), { blur, alpha: hi, clip, fold: relief }),
    item("dark", ribbon(C, (t) => prof(wC)(t) * (0.7 + 0.3 * prof(f)(t))), { blur: blur * 1.2, alpha: core, clip, fold: relief }),
  ];
  if (refl > 0) out.push(item("light", ribbon(R, (t) => prof(wH)(t) * 0.45), { blur: blur * 0.8, alpha: refl, clip }));
  return out;
}
const flat = (arr) => arr.flat(Infinity).filter(Boolean);

/* ───────────────────────────── key measurements (inches) ───────────────────────────── */

const M = {
  hem: 27.5, bandTop: 24.5,
  shoulderHalf: 11.75, underarmY: 11.0,
  hoodTop: -12.2,
  pocketTop: 17.0, pocketHalf: 7.0, pocketOpenY: 21.4,
  cuffH: 3.25, cordW: 0.3, agletL: 1.0, agletW: 0.36,
};

/* ═════════════════════════════════ SHARED BODY ═════════════════════════════════ */

const HF = [-6.9, 0.72];                         // hood foot on the shoulder
const SP = [-M.shoulderHalf, 2.85];              // dropped shoulder seam point
const UA = [-12.5, M.underarmY];                 // underarm / side-seam top
const shoulderL = S([HF, [-8.7, 1.3], [-10.4, 2.0], SP], 8);
const armholeL = S([SP, [-12.0, 5.6], [-12.3, 8.4], UA], 8);
const sideL = S([UA, [-12.53, 13.5], [-12.6, 18.0], [-12.7, 22.4], [-12.5, 23.85], [-11.85, 24.45]], 8);
const bandSeamL = S([[-11.85, 24.45], [-7.5, 24.56], [-3.5, 24.61], [0, 24.62]], 8);
const necklineL = S([[0, 4.15], [-1.7, 3.75], [-3.7, 2.7], [-5.6, 1.4], HF], 8);
const bodyHalf = join(necklineL, shoulderL, armholeL, sideL, bandSeamL);
const BODY = join(bodyHalf, rev(mirror(bodyHalf)));

// sleeve (left): shoulder seam → outer contour → gathered end over the cuff → inner contour → underarm → armhole
const sleeveOuterL = S([SP, [-14.0, 4.05], [-15.85, 5.95], [-17.3, 8.75], [-18.45, 12.2], [-19.35, 15.6], [-20.0, 18.4], [-20.45, 20.3]], 10);
const sleeveEndL = S([[-20.45, 20.3], [-19.6, 20.62], [-18.5, 20.8], [-17.35, 20.9], [-16.2, 20.88], [-15.25, 20.72]], 8);
const sleeveInnerL = S([[-15.25, 20.72], [-15.05, 19.9], [-14.65, 18.4], [-14.05, 17.0], [-13.3, 15.4], [-12.78, 13.5], [-12.5, 11.6], UA], 10);
const SLEEVE_L = join(sleeveOuterL, sleeveEndL, sleeveInnerL, rev(armholeL));
const SLEEVE_R = mirror(SLEEVE_L);

// rib cuff (left): 4" wide, 3.25" tall, axis 10° out; cp(along, across) = cuff-local coords
const CUFF_AX = [-Math.sin((10 * Math.PI) / 180), Math.cos((10 * Math.PI) / 180)];
const CUFF_N = [CUFF_AX[1], -CUFF_AX[0]];
const CUFF_C = [-17.85, 20.55];
const cp = (along, across) => [CUFF_C[0] + CUFF_AX[0] * along + CUFF_N[0] * across, CUFF_C[1] + CUFF_AX[1] * along + CUFF_N[1] * across];
const cuffOuterL = S([cp(-0.5, -2.08), cp(0.5, -2.05), cp(1.5, -2.1), cp(2.5, -2.04), cp(M.cuffH, -2.0)], 6);
const cuffEndL = S([cp(M.cuffH, -2.0), cp(M.cuffH + 0.13, -1.0), cp(M.cuffH + 0.16, 0), cp(M.cuffH + 0.12, 1.0), cp(M.cuffH, 2.0)], 6);
const cuffInnerL = S([cp(M.cuffH, 2.0), cp(2.5, 2.05), cp(1.5, 2.1), cp(0.5, 2.05), cp(-0.5, 2.08)], 6);
const CUFF_L = join(cuffOuterL, cuffEndL, cuffInnerL);
const CUFF_R = mirror(CUFF_L);
const cuffTopL = S([cp(0.05, -2.06), cp(0.12, 0), cp(0.05, 2.06)], 6);
/** A bunching ring above the cuff, in cuff-local coords (arcs dip toward the camera). */
const ring = (edge, centre, hw) => S([cp(edge, -hw), cp((edge + centre) / 2 - 0.02, -hw * 0.5), cp(centre, 0), cp((edge + centre) / 2 + 0.02, hw * 0.5), cp(edge - 0.05, hw)], 6);

// rib hem band (3"), slightly narrower than the body, hem arcs down toward the camera
const BAND = join(
  S([[-11.86, 24.25], [-6, 24.4], [0, 24.45], [6, 24.4], [11.86, 24.25]], 8),
  S([[11.86, 24.25], [11.8, 25.8], [11.72, 27.22]], 4),
  S([[11.72, 27.22], [6, 27.42], [0, 27.5], [-6, 27.42], [-11.72, 27.22]], 8),
  S([[-11.72, 27.22], [-11.8, 25.8], [-11.86, 24.25]], 4),
);

/* ═════════════════════════════════ FRONT ═════════════════════════════════ */

// kangaroo pocket 14" × 7.5": top edge, angled hand openings, straight sides into the band seam
const pocketOpenL = S([[-4.4, M.pocketTop + 0.05], [-5.15, 18.1], [-6.15, 19.75], [-M.pocketHalf, M.pocketOpenY]], 10);
const pocketTopL = S([[0, M.pocketTop], [-3.6, M.pocketTop], [-4.15, M.pocketTop + 0.01], [-4.4, M.pocketTop + 0.05]], 4);
const pocketSideL = line([-M.pocketHalf, M.pocketOpenY], [-M.pocketHalf - 0.02, 24.62], 4);
const pocketHalf = join(pocketTopL, pocketOpenL, pocketSideL, [[0, 24.65]]);
const POCKET = join(pocketHalf, rev(mirror(pocketHalf)));

// hood — outer contour, rims (double-layer edge = drawcord channel), opening
const hoodOuterL = S([[0, M.hoodTop], [-1.7, -11.95], [-3.8, -11.35], [-5.45, -9.75], [-6.2, -7.3], [-6.42, -4.2], [-6.55, -1.4], [-6.75, 0.0], HF], 10);
const rimInnerL = S([[0, -10.4], [-2.7, -10.0], [-4.1, -8.1], [-4.5, -4.8], [-4.35, -1.6], [-3.35, 0.9], [-1.6, 2.35], [0.62, 3.1]], 10);
const rimOuterL = S([[0, -11.45], [-3.1, -11.0], [-4.95, -8.8], [-5.5, -4.8], [-5.35, -1.2], [-4.25, 1.7], [-2.0, 3.55], [0.95, 4.25]], 10);
const RIM_N = 64;
const rimIn = resample(rimInnerL, RIM_N), rimOut = resample(rimOuterL, RIM_N);
const RIM_L = join(rimOut, rev(rimIn));
const RIM_R = mirror(RIM_L);
const hoodBottom = S([HF, [-5.6, 1.5], [-3.9, 2.9], [-1.8, 4.0], [0, 4.45], [1.8, 4.0], [3.9, 2.9], [5.6, 1.5], mp(HF)], 8);
const HOOD = join(hoodOuterL, hoodBottom.slice(1), rev(mirror(hoodOuterL)).slice(1));
const OPENING = join(rimInnerL, rev(mirror(rimInnerL)).slice(1));

// inside the hood: lining above the inside back-neck seam; back neck tape; woven label
const BN_Y = -0.2;
const bnL = atY(rimInnerL, BN_Y);
const backNeck = S([[bnL[0] - 0.2, BN_Y - 0.4], [-2.2, BN_Y + 0.42], [0, BN_Y + 0.62], [2.2, BN_Y + 0.42], [-bnL[0] + 0.2, BN_Y - 0.4]], 8);
const rimInLow = rimInnerL.filter((p) => p[1] >= BN_Y - 0.5 && p[0] <= 0.05);
const INNER_BACK = join(backNeck, mirror(rimInLow), rev(rimInLow));
const TAPE = ribbon(backNeck.slice(2, -2), 0.42);
const LABEL = join(S([[-0.5, BN_Y + 0.86], [0, BN_Y + 0.92], [0.5, BN_Y + 0.86]], 4), [[0.48, BN_Y + 1.32], [-0.48, BN_Y + 1.32]]);

// drawcords: exit eyelets low on the rims, hang ~9" below the neckline, 1" metal aglets
const eyeletAt = (t) => {
  const i = Math.round(t * RIM_N);
  return [lerp(rimIn[i][0], rimOut[i][0], 0.5), lerp(rimIn[i][1], rimOut[i][1], 0.5)];
};
const EYE_L = eyeletAt(0.83);
const EYE_R = mp(EYE_L);
const NECK_Y = 4.15;                                  // centre-front neckline (under the crossover)
const CORD_END = NECK_Y + 9.0;                        // aglet tips
const cordL = S([EYE_L, [EYE_L[0] - 0.2, EYE_L[1] + 1.5], [-3.95, 5.6], [-3.75, 8.8], [-3.5, 11.2], [-3.42, CORD_END - M.agletL]], 12);
const cordR = S([EYE_R, [EYE_R[0] + 0.15, EYE_R[1] + 1.7], [3.95, 6.2], [4.0, 9.4], [4.02, 11.5], [4.05, CORD_END - M.agletL + 0.28]], 12);
const agletL = [cordL.at(-1), [cordL.at(-1)[0] + 0.05, CORD_END]];
const agletR = [cordR.at(-1), [cordR.at(-1)[0] + 0.03, CORD_END + 0.28]];

const frontParts = [
  { id: "hoodShell", pts: HOOD, role: "base", print: true },
  { id: "lining", pts: OPENING, role: "trim" },
  { id: "innerBack", pts: INNER_BACK, role: "base", texture: false },
  { id: "tape", pts: TAPE, role: "trim", texture: false },
  { id: "label", pts: LABEL, role: "accent", texture: false },
  { id: "band", pts: BAND, role: "base" },
  { id: "cuffL", pts: CUFF_L, role: "base" },
  { id: "cuffR", pts: CUFF_R, role: "base" },
  { id: "body", pts: BODY, role: "base", print: true },
  { id: "pocket", pts: POCKET, role: "base", print: true },
  { id: "sleeveL", pts: SLEEVE_L, role: "base" },
  { id: "sleeveR", pts: SLEEVE_R, role: "base" },
  { id: "rimR", pts: RIM_R, role: "base" },
  { id: "rimL", pts: RIM_L, role: "base" },
  { id: "cordL", pts: ribbon(cordL, M.cordW), role: "trim", over: true },
  { id: "cordR", pts: ribbon(cordR, M.cordW), role: "trim", over: true },
].map((p) => ({ ...p, pts: F.P(p.pts) }));

const TORSO = ["body", "pocket"];
const SLEEVES = ["sleeveL", "sleeveR"];

/* ── light shared by both views: torso key, sleeves, cuffs, hem band ── */

function torsoKey(T, { top = 1 } = {}) {
  return [
    // key from the upper left: one broad diagonal falloff across the whole torso
    dark(rect(-14, top - 1, 14, 26), { blur: 1.2, alpha: 0.34, clip: T, grad: { x0: -9, y0: top + 1, x1: 11, y1: 24, stops: [[0, 0], [0.45, 0.25], [1, 1]] } }),
    // the body turns away at the sides: a NARROW falloff (wide falloff = puffer jacket)
    dark(rect(8.5, top, 14, 25), { blur: 0.9, alpha: 0.42, clip: T, grad: { x0: 9.6, y0: 0, x1: 12.7, y1: 0, stops: [[0, 0], [0.6, 0.45], [1, 1]] } }),
    dark(rect(-14, top, -10, 25), { blur: 0.7, alpha: 0.2, clip: T, grad: { x0: -11.0, y0: 0, x1: -12.7, y1: 0, stops: [[0, 0], [1, 1]] } }),
    // lit chest plane
    blob("light", -4.6, top + 7.2, 6.4, 5.0, -18, { blur: 2.6, alpha: 0.2, clip: T }),
    blob("light", -7.4, top + 3.0, 3.6, 1.6, -14, { blur: 1.2, alpha: 0.14, clip: T }),
    // where the chest turns down into the belly
    dark(rect(-13, 12.5, 13, 16), { blur: 1.6, alpha: 0.08, clip: T }),
    // shoulders catch the key light
    brush("light", [[-7.4, 1.25], [-9.0, 1.7], [-10.6, 2.45], [-11.6, 3.3]], 0.9, { blur: 0.5, alpha: 0.26, clip: T }),
    brush("light", [[7.4, 1.3], [9.0, 1.75], [10.6, 2.5]], 0.6, { blur: 0.5, alpha: 0.1, clip: T }),
  ];
}

function sleevePaint(T, { back = false } = {}) {
  const out = [];
  const inL = slice(sleeveInnerL, 0, 1, 30).reverse();      // armpit → cuff
  const outL = slice(sleeveOuterL, 0.18, 1, 30);
  out.push(...tube(outL, inL, { clip: ["sleeveL"], hi: 0.2, core: 0.24, refl: 0.0, blur: 0.9, hiW: 0.24, coreW: 0.3 }));
  out.push(...tube(mirror(outL), mirror(inL), { clip: ["sleeveR"], hi: 0.13, core: 0.34, refl: 0.0, blur: 0.9, hiW: 0.24, coreW: 0.32 }));
  // the right sleeve sits in the key's falloff
  out.push(dark(rect(12, 2, 22, 25), { blur: 1.0, alpha: 0.22, clip: ["sleeveR", "cuffR"], grad: { x0: 12, y0: 4, x1: 20, y1: 22, stops: [[0, 0], [1, 1]] } }));
  out.push(dark(rect(-22, 12, -12, 25), { blur: 1.0, alpha: 0.12, clip: ["sleeveL", "cuffL"], grad: { x0: 0, y0: 12, x1: 0, y1: 23, stops: [[0, 0], [1, 1]] } }));
  // sleeve → body: the left sleeve throws its shadow right onto the torso; AO at the right
  out.push(
    dark(ribbon(offset(slice(sleeveInnerL, 0.03, 0.97, 22), -0.5), taper(1.4, 0.15, 0.35)), { blur: 0.5, alpha: 0.5, clip: T }),
    dark(ribbon(offset(slice(sleeveInnerL, 0.03, 0.97, 22), -0.18), taper(0.4, 0.1, 0.3)), { blur: 0.16, alpha: 0.4, clip: T }),
    dark(ribbon(offset(slice(mirror(sleeveInnerL), 0.03, 0.97, 22), 0.3), taper(0.8, 0.15, 0.35)), { blur: 0.4, alpha: 0.36, clip: T }),
    dark(ribbon(offset(slice(mirror(sleeveInnerL), 0.03, 0.97, 22), 0.12), taper(0.3, 0.1, 0.3)), { blur: 0.14, alpha: 0.4, clip: T }),
    blob("dark", -12.4, 11.6, 0.8, 1.8, 10, { blur: 0.5, alpha: 0.45, clip: [...T, "sleeveL"] }),
    blob("dark", 12.4, 11.6, 0.8, 1.8, -10, { blur: 0.5, alpha: 0.55, clip: [...T, "sleeveR"] }),
  );
  // sleeve edges turn away sharply (fabric, not a balloon): thin occlusion inside the contour
  out.push(
    dark(ribbon(offset(slice(sleeveInnerL, 0.02, 0.98, 24), 0.1), 0.4), { blur: 0.22, alpha: 0.36, clip: ["sleeveL"] }),
    dark(ribbon(offset(slice(mirror(sleeveInnerL), 0.02, 0.98, 24), -0.1), 0.4), { blur: 0.22, alpha: 0.32, clip: ["sleeveR"] }),
  );
  for (const side of [1, -1]) {
    const m = side === 1 ? (pts) => pts : mirror;
    const clip = [side === 1 ? "sleeveL" : "sleeveR"];
    const lit = side === 1;
    // dropped-shoulder cap: the sleeve rolls over just outside the armhole seam
    out.push(...fold(m(S([[-12.45, 3.7], [-12.8, 6.2], [-13.05, 8.6]], 6)), 1.0, { hi: 0.12, lo: 0.2, blur: 0.4, clip, relief: 0.4 }));
    // underarm: a deep crease where the sleeve gathers into the armhole
    out.push(...fold(m([[-12.9, 9.6], [-13.7, 11.4], [-14.2, 13.4]]), 0.9, { hi: lit ? 0.14 : 0.07, lo: 0.32, blur: 0.35, clip, valley: true, ta: 0.25, tb: 0.5 }));
    // long upper-arm drape folds (vertical-ish, along the sleeve)
    out.push(...fold(m([[-15.4, 6.8], [-16.1, 9.6], [-16.5, 12.8], [-16.7, 14.8]]), 0.9, { hi: lit ? 0.14 : 0.06, lo: 0.16, blur: 0.5, clip }));
    out.push(...fold(m([[-17.4, 9.6], [-18.1, 12.6], [-18.5, 14.6]]), 0.6, { hi: lit ? 0.1 : 0.04, lo: 0.12, blur: 0.45, clip }));
    if (!back) {
      // inner elbow: V folds radiating from the crease
      out.push(...fold(m([[-14.2, 16.6], [-15.5, 16.0], [-17.0, 15.7]]), 0.7, { hi: 0.18, lo: 0.32, blur: 0.28, clip, valley: true, ta: 0.15, tb: 0.55 }));
      out.push(...fold(m([[-14.5, 17.4], [-16.0, 17.45], [-17.6, 17.8]]), 0.62, { hi: 0.16, lo: 0.28, blur: 0.26, clip, valley: true, ta: 0.15, tb: 0.55 }));
      out.push(...fold(m([[-13.7, 15.4], [-14.8, 14.8], [-16.0, 14.5]]), 0.5, { hi: 0.12, lo: 0.2, blur: 0.26, clip, valley: true, ta: 0.15, tb: 0.6 }));
      out.push(blob("light", m([[-19.2, 16.0]])[0][0], 16.0, 0.6, 1.5, side * 12, { blur: 0.5, alpha: lit ? 0.12 : 0.04, clip }));
    } else {
      // back of the elbow: a bulge with short folds radiating from it
      out.push(blob("light", m([[-18.7, 15.6]])[0][0], 15.6, 0.9, 1.8, side * 14, { blur: 0.6, alpha: lit ? 0.14 : 0.05, clip }));
      out.push(...fold(m([[-18.6, 14.8], [-17.4, 13.9], [-16.1, 13.5]]), 0.6, { hi: 0.12, lo: 0.24, blur: 0.3, clip, ta: 0.5, tb: 0.2 }));
      out.push(...fold(m([[-18.7, 16.5], [-17.2, 17.0], [-15.8, 17.1]]), 0.6, { hi: 0.12, lo: 0.24, blur: 0.3, clip, ta: 0.5, tb: 0.2 }));
    }
    // bunching: stacked rings above the cuff, each a ridge (lit top flank, shadow below)
    // the blouse lip right above the cuff, then irregular diagonal Z-folds that die out
    // part-way across (real bunching is never a stack of even rings)
    out.push(...fold(m(ring(-0.48, -0.3, 2.62)), 0.36, { hi: (lit ? 0.24 : 0.14), lo: 0.4, blur: 0.18, clip, relief: 0.8, ta: 0.12, tb: 0.12 }));
    for (const [pts, w, k, ta, tb] of [
      [[cp(-1.55, -2.75), cp(-1.2, -1.6), cp(-0.95, -0.2), cp(-0.9, 0.9)], 0.42, 1, 0.12, 0.6],
      [[cp(-2.05, 2.75), cp(-1.75, 1.5), cp(-1.45, 0.2), cp(-1.35, -0.7)], 0.38, 0.85, 0.12, 0.6],
      [[cp(-2.95, -2.8), cp(-2.6, -1.2), cp(-2.25, 0.6), cp(-2.1, 2.2)], 0.46, 0.7, 0.15, 0.35],
      [[cp(-3.9, 2.85), cp(-3.7, 1.3), cp(-3.5, -0.4)], 0.42, 0.45, 0.12, 0.6],
    ]) out.push(...fold(m(pts), w, { hi: (lit ? 0.24 : 0.13) * k, lo: 0.36 * k, blur: 0.2, clip, relief: 0.8, ta, tb }));
    // the blouse overhang shades the cuff top
    const cTop = side === 1 ? cuffTopL : mirror(cuffTopL);
    out.push(dark(ribbon(offset(cTop, -0.32), 0.75), { blur: 0.26, alpha: 0.6, clip: [side === 1 ? "cuffL" : "cuffR"] }));
  }
  // cuffs: cylinder shading along the forearm axis + shadowed lower edge
  const a = [cp(0, -2.0), cp(M.cuffH, -2.0)], b = [cp(0, 2.0), cp(M.cuffH, 2.0)];
  out.push(...tube(S(a, 4), S(b, 4), { clip: ["cuffL"], hi: 0.2, core: 0.32, refl: 0.05, blur: 0.35, n: 6 }));
  out.push(...tube(mirror(S(a, 4)), mirror(S(b, 4)), { clip: ["cuffR"], hi: 0.14, core: 0.42, refl: 0.05, blur: 0.35, n: 6 }));
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
    lite(ribbon(S([[-11.6, 23.7], [-6, 23.85], [0, 23.9], [6, 23.85], [11.0, 23.7]], 8), taper(0.55, 0.12, 0.2)), { blur: 0.3, alpha: 0.16, clip: T }),
    dark(ribbon(S([[-12, 24.28], [-6, 24.4], [0, 24.45], [6, 24.4], [12, 24.28]], 8), 0.4), { blur: 0.22, alpha: 0.3, clip: T }),
    dark(ribbon(S([[-11.9, 24.6], [-6, 24.72], [0, 24.76], [6, 24.72], [11.9, 24.6]], 8), 0.6), { blur: 0.25, alpha: 0.62, clip: ["band"] }),
  );
  // compression folds where the body blouses into the band (short, frequent)
  const comp = [
    [[[-12.0, 23.3], [-10.8, 23.55], [-9.6, 23.62]], 0.5], [[[-10.4, 22.75], [-9.2, 22.95], [-8.0, 23.15]], 0.42],
    [[[-7.6, 23.5], [-6.2, 23.65], [-4.9, 23.7]], 0.46], [[[-4.4, 23.1], [-2.8, 23.3], [-1.4, 23.4]], 0.4],
    [[[-0.9, 23.75], [0.8, 23.85], [2.4, 23.8]], 0.44], [[[2.8, 23.2], [4.4, 23.35], [5.9, 23.4]], 0.4],
    [[[6.2, 23.85], [7.8, 23.8], [9.3, 23.6]], 0.46], [[[8.8, 23.0], [10.1, 23.1], [11.4, 23.3]], 0.42],
    [[[10.6, 23.8], [11.4, 23.75], [12.2, 23.5]], 0.38],
  ];
  for (const [pts, w] of comp) out.push(...fold(pts, w, { hi: 0.2, lo: 0.34, blur: 0.22, clip: T, relief: 0.7 }));
  // band: a gentle roll (lit top half, darker toward the hem) and side falloff
  out.push(
    dark(rect(-12, 24, 12, 28), { blur: 0.35, alpha: 0.34, clip: ["band"], grad: { x0: 0, y0: 25.3, x1: 0, y1: 27.6, stops: [[0, 0], [0.6, 0.35], [1, 1]] } }),
    lite(ribbon(S([[-11.5, 25.35], [-4, 25.5], [3, 25.5], [10, 25.35]], 8), taper(0.8, 0.2, 0.2)), { blur: 0.4, alpha: 0.14, clip: ["band"] }),
    dark(rect(5, 24, 12.2, 28), { blur: 0.6, alpha: 0.42, clip: ["band"], grad: { x0: 6, y0: 0, x1: 11.9, y1: 0, stops: [[0, 0], [1, 1]] } }),
    dark(rect(-12.2, 24, -9, 28), { blur: 0.6, alpha: 0.18, clip: ["band"], grad: { x0: -9.5, y0: 0, x1: -11.9, y1: 0, stops: [[0, 0], [1, 1]] } }),
    // tiny vertical compression puckers in the rib right under the seam
    ...[-10, -7.4, -4.6, -1.8, 1.2, 4.0, 6.8, 9.6].map((x, i) => dark(ribbon(line([x + (i % 2) * 0.3, 24.75], [x + 0.1, 25.6], 3), taper(0.35, 0.3, 0.6)), { blur: 0.2, alpha: 0.16, clip: ["band"] })),
  );
  return out;
}

/* ── front light ── */
function frontPaint() {
  const T = TORSO;
  const out = [...torsoKey(T)];
  // shadow cast by the hood onto the chest & shoulders (falls down-right of it)
  out.push(
    dark(ribbon(S([[-6.0, 1.4], [-4.0, 3.2], [-1.6, 4.6], [1.6, 4.9], [4.2, 3.7], [6.3, 2.0], [7.4, 1.3]], 8), (t) => 0.9 + 1.2 * t), { blur: 0.75, alpha: 0.46, clip: T }),
    dark(ribbon(S([[5.4, 1.35], [7.0, 1.4], [8.8, 1.8]], 6), 0.9), { blur: 0.6, alpha: 0.3, clip: T }),
    dark(ribbon(S([[-6.6, 1.1], [-5.0, 2.3], [-3.2, 3.5], [-1.2, 4.4], [0.8, 4.6], [3.0, 3.6], [5.0, 2.3], [6.6, 1.2]], 8), 0.35), { blur: 0.18, alpha: 0.42, clip: T }),
  );
  out.push(...sleevePaint(T));
  // underarm drape: the dropped shoulder gathers cloth into diagonal folds toward the centre
  for (const [pts, w, hi, lo] of [
    [[[-12.0, 10.6], [-10.2, 11.7], [-8.2, 13.4], [-6.4, 15.3]], 1.3, 0.26, 0.34],
    [[[-12.1, 13.0], [-10.6, 14.3], [-9.2, 16.1]], 1.05, 0.2, 0.28],
    [[[-11.7, 8.6], [-10.0, 9.6], [-8.4, 11.0]], 0.85, 0.16, 0.2],
    [[[12.0, 10.8], [10.3, 12.0], [8.6, 13.7], [7.1, 15.4]], 1.25, 0.12, 0.4],
    [[[12.1, 13.4], [10.8, 14.6], [9.6, 16.2]], 1.0, 0.08, 0.32],
    [[[11.6, 8.4], [10.0, 9.6], [8.6, 10.8]], 0.8, 0.07, 0.22],
  ]) out.push(...fold(pts, w, { hi, lo, blur: 0.42 }));
  // long vertical drape from the chest toward the hem (the boxy body hangs)
  out.push(...fold([[-10.4, 15.6], [-9.7, 18.0], [-9.6, 20.4], [-10.1, 22.6]], 1.5, { hi: 0.09, lo: 0.1, blur: 0.9, ta: 0.45, tb: 0.5 }));
  out.push(...fold([[10.6, 16.4], [10.0, 18.8], [10.1, 21.6]], 1.4, { hi: 0.04, lo: 0.14, blur: 0.9, ta: 0.45, tb: 0.5 }));
  out.push(...fold([[-2.2, 5.6], [-2.0, 8.6], [-2.3, 11.6]], 1.4, { hi: 0.07, lo: 0.08, blur: 0.8 }));
  out.push(...fold([[2.4, 5.8], [2.6, 9.0], [2.3, 12.0]], 1.4, { hi: 0.05, lo: 0.1, blur: 0.8, valley: true }));
  // where the pocket top pulls the panel
  out.push(...fold([[-7.6, 16.1], [-5.8, 16.5], [-4.0, 16.62]], 0.8, { hi: 0.12, lo: 0.16, blur: 0.4 }));
  out.push(...fold([[4.2, 16.5], [6.0, 16.2], [8.2, 15.7]], 0.75, { hi: 0.07, lo: 0.18, blur: 0.4 }));
  out.push(...bandPaint(T));
  // pocket: puffed volume, rolled top edge, deep hand openings
  out.push(
    blob("light", -2.2, 19.6, 4.6, 2.0, -6, { blur: 1.3, alpha: 0.16, clip: ["pocket"] }),
    dark(rect(-8, 21, 8, 25), { blur: 0.7, alpha: 0.24, clip: ["pocket"], grad: { x0: 0, y0: 21.3, x1: 0, y1: 24.6, stops: [[0, 0], [1, 1]] } }),
    dark(rect(2, 17, 8, 25), { blur: 0.8, alpha: 0.2, clip: ["pocket"], grad: { x0: 2.5, y0: 0, x1: 7.0, y1: 0, stops: [[0, 0], [1, 1]] } }),
    brush("light", [[-4.1, 17.24], [0, 17.2], [4.1, 17.24]], 0.34, { blur: 0.14, alpha: 0.26, clip: ["pocket"], ta: 0.1, tb: 0.1 }),
    dark(ribbon(S([[-4.3, 17.62], [0, 17.6], [4.3, 17.62]], 6), 0.3), { blur: 0.2, alpha: 0.18, clip: ["pocket"] }),
    dark(ribbon(S([[-4.4, 16.88], [0, 16.86], [4.4, 16.88]], 6), 0.26), { blur: 0.16, alpha: 0.36, clip: T, exclude: ["pocket"] }),
  );
  for (const side of [1, -1]) {
    const op = side === 1 ? pocketOpenL : mirror(pocketOpenL);
    const nearLight = side === 1;
    // the opening: a dark slot into the pocket bag, on the body side of the edge
    out.push(dark(ribbon(offset(op, side * 0.2), taper(0.46, 0.1, 0.18)), { blur: 0.16, alpha: 0.8, clip: T, exclude: ["pocket"] }));
    out.push(dark(ribbon(offset(op, side * 0.55), taper(1.1, 0.12, 0.25)), { blur: 0.5, alpha: nearLight ? 0.28 : 0.42, clip: T, exclude: ["pocket"] }));
    // the pocket's edge lip catches light (left) or turns into shade (right)
    out.push((nearLight ? lite : dark)(ribbon(offset(op, -side * 0.14), taper(0.2, 0.1, 0.1)), { blur: 0.12, alpha: nearLight ? 0.32 : 0.24, clip: ["pocket"] }));
    out.push(dark(ribbon(offset(op, -side * 0.6), taper(0.9, 0.2, 0.3)), { blur: 0.5, alpha: 0.1, clip: ["pocket"] }));
  }
  out.push(
    dark(ribbon(line([-7.12, 21.4], [-7.12, 24.6], 4), 0.24), { blur: 0.14, alpha: 0.32, clip: T, exclude: ["pocket"] }),
    dark(ribbon(line([7.2, 21.4], [7.2, 24.6], 4), 0.45), { blur: 0.26, alpha: 0.46, clip: T, exclude: ["pocket"] }),
  );
  // hood shell: dome lit from the upper left, the right side turns into shadow
  out.push(
    dark(rect(0.5, -13, 7.5, 2), { blur: 0.7, alpha: 0.55, clip: ["hoodShell"], grad: { x0: 4.4, y0: 0, x1: 6.6, y1: 0, stops: [[0, 0], [1, 1]] } }),
    dark(rect(-7.5, -2, 7.5, 2), { blur: 0.6, alpha: 0.28, clip: ["hoodShell"], grad: { x0: 0, y0: -2.5, x1: 0, y1: 1.4, stops: [[0, 0], [1, 1]] } }),
    brush("light", [[-5.9, -1.6], [-6.0, -4.6], [-5.6, -8.0], [-4.2, -10.5], [-1.4, -11.75]], 0.75, { blur: 0.4, alpha: 0.24, clip: ["hoodShell"] }),
    dark(ribbon(mirror(offset(slice(hoodOuterL, 0.15, 1, 20), 0.18)), 0.55), { blur: 0.3, alpha: 0.4, clip: ["hoodShell"] }),
    // where the shell meets the rim the cloth folds under the channel
    dark(ribbon(offset(rimOuterL, 0.2), taper(0.4, 0.1, 0.2)), { blur: 0.2, alpha: 0.36, clip: ["hoodShell"] }),
    dark(ribbon(mirror(offset(rimOuterL, 0.2)), taper(0.45, 0.1, 0.2)), { blur: 0.2, alpha: 0.42, clip: ["hoodShell"] }),
    // the hood sides sitting on the shoulders: a soft fold each side
    ...fold([[-6.1, -2.0], [-5.9, -0.2], [-5.2, 1.4]], 0.7, { hi: 0.16, lo: 0.2, blur: 0.3, clip: ["hoodShell"], relief: 0 }),
    ...fold([[6.1, -2.0], [5.9, -0.2], [5.2, 1.4]], 0.7, { hi: 0.08, lo: 0.26, blur: 0.3, clip: ["hoodShell"], relief: 0 }),
  );
  // rims: rolled double-layer edge (tube shading); the left one overlaps the right
  out.push(...tube(rimOut, rimIn, { clip: ["rimL"], hi: 0.36, core: 0.36, refl: 0.1, blur: 0.22, hiW: 0.3, coreW: 0.3, n: 44, relief: 0 }));
  out.push(...tube(mirror(rimOut), mirror(rimIn), { clip: ["rimR"], hi: 0.34, core: 0.44, refl: 0.1, blur: 0.22, hiW: 0.3, coreW: 0.3, n: 44, relief: 0 }));
  out.push(
    // crossover: the left rim casts onto the right rim and the chest
    dark(ribbon(offset(slice(rimOuterL, 0.76, 1, 12), -0.24), taper(0.55, 0.2, 0.1)), { blur: 0.24, alpha: 0.6, clip: ["rimR", ...T] }),
    dark(ribbon(offset(slice(rimInnerL, 0.8, 1, 10), 0.18), taper(0.4, 0.1, 0.1)), { blur: 0.2, alpha: 0.45, clip: ["rimR", "lining", "innerBack"] }),
    // rims lift off the chest: occlusion under their outer edges
    dark(ribbon(offset(slice(rimOuterL, 0.64, 1, 14), -0.3), taper(0.6, 0.2, 0.1)), { blur: 0.35, alpha: 0.36, clip: T }),
    dark(ribbon(mirror(offset(slice(rimOuterL, 0.64, 0.98, 14), -0.36)), taper(0.75, 0.2, 0.1)), { blur: 0.4, alpha: 0.46, clip: T }),
  );
  // lining: deep inside the hood; the crown and the left rim shade it, the right wall is lit
  out.push(
    dark(OPENING, { blur: 0.3, alpha: 0.16, clip: ["lining"] }),
    dark(rect(-5, -11, 5, 3), { blur: 0.8, alpha: 0.5, clip: ["lining", "innerBack"], grad: { type: "radial", x0: 0.6, y0: -6.8, r0: 1.0, x1: -0.4, y1: -1.0, r1: 7.5, stops: [[0, 0.1], [0.55, 0.4], [1, 1]] } }),
    dark(ribbon(offset(slice(rimInnerL, 0.04, 0.9, 30), -0.7), taper(2.0, 0.12, 0.25)), { blur: 0.7, alpha: 0.5, clip: ["lining"] }),
    dark(ribbon(S([[-3.2, -9.1], [0, -9.6], [3.2, -9.1]], 8), taper(1.5, 0.25, 0.25)), { blur: 0.7, alpha: 0.42, clip: ["lining"] }),
    blob("light", 2.7, -4.2, 1.15, 3.6, 4, { blur: 0.9, alpha: 0.26, clip: ["lining"] }),
    lite(ribbon(offset(mirror(slice(rimInnerL, 0.06, 0.8, 24)), 0.16), taper(0.26, 0.1, 0.2)), { blur: 0.12, alpha: 0.32, clip: ["lining"] }),
    lite(ribbon(offset(slice(rimInnerL, 0.2, 0.7, 20), -0.13), taper(0.16, 0.2, 0.2)), { blur: 0.1, alpha: 0.14, clip: ["lining"] }),
    // the lining's centre-back seam runs down the inside of the hood into the dark
    ...fold([[0.05, -9.3], [0.15, -5.0], [0.05, -1.0]], 0.5, { hi: 0.1, lo: 0.2, blur: 0.25, clip: ["lining"], relief: 0, valley: true }),
  );
  out.push(
    dark(INNER_BACK, { blur: 0.25, alpha: 0.8, clip: ["innerBack", "tape", "label"] }),
    dark(rect(-4, BN_Y, 4, 3.5), { blur: 0.4, alpha: 0.6, clip: ["innerBack", "label"], grad: { x0: 0, y0: BN_Y + 0.3, x1: 0, y1: 2.2, stops: [[0, 0.35], [1, 1]] } }),
    dark(ribbon(S([[-3.6, 1.0], [-2.0, 2.2], [0, 2.8], [2.0, 2.2], [3.6, 1.0]], 8), 1.2), { blur: 0.4, alpha: 0.5, clip: ["innerBack"] }),
    dark(ribbon(offset(backNeck, -0.18), 0.5), { blur: 0.3, alpha: 0.45, clip: ["lining"] }),
    lite(ribbon(slice(backNeck, 0.25, 0.75, 10), taper(0.16, 0.3, 0.3)), { blur: 0.1, alpha: 0.22, clip: ["tape"] }),
  );
  // the cords leave the eyelets: occlusion around the exits
  out.push(blob("dark", EYE_L[0] + 0.15, EYE_L[1] + 0.3, 0.45, 0.4, 0, { blur: 0.22, alpha: 0.35, clip: ["rimL"] }));
  out.push(blob("dark", EYE_R[0] + 0.15, EYE_R[1] + 0.3, 0.45, 0.4, 0, { blur: 0.22, alpha: 0.35, clip: ["rimR"] }));
  return flat(out);
}

/** Silhouette edges: thin rim light where the contour faces the key, falloff on the far side. */
function silhouetteEdges(T, withHood) {
  const e = [
    { pts: F.P(slice(sleeveOuterL, 0.1, 1, 30)), clip: ["sleeveL"], w: F.u(0.32), blur: F.u(0.16), alpha: 0.22 },
    { pts: F.P(mirror(slice(sleeveOuterL, 0.1, 1, 30))), clip: ["sleeveR"], layer: "dark", w: F.u(0.55), blur: F.u(0.3), alpha: 0.34 },
    { pts: F.P(slice(sleeveInnerL, 0.0, 0.6, 20)), clip: ["sleeveL"], layer: "dark", w: F.u(0.3), blur: F.u(0.18), alpha: 0.24 },
    { pts: F.P(mirror(slice(sideL, 0.2, 0.95, 20))), clip: T, layer: "dark", w: F.u(0.55), blur: F.u(0.3), alpha: 0.34 },
    { pts: F.P(slice(sideL, 0.2, 0.95, 20)), clip: T, layer: "dark", w: F.u(0.35), blur: F.u(0.2), alpha: 0.18 },
    { pts: F.P(slice(shoulderL, 0.0, 1, 12)), clip: T, w: F.u(0.3), blur: F.u(0.14), alpha: 0.18 },
  ];
  if (withHood) {
    e.push({ pts: F.P(slice(hoodOuterL, 0.05, 0.85, 30)), clip: ["hoodShell"], w: F.u(0.28), blur: F.u(0.14), alpha: 0.22 });
    e.push({ pts: F.P(mirror(slice(hoodOuterL, 0.05, 0.95, 30))), clip: ["hoodShell"], layer: "dark", w: F.u(0.5), blur: F.u(0.26), alpha: 0.3 });
  }
  return e;
}

const RIBS = [
  { part: "band", angle: 90, period: F.u(0.135), depth: 0.42 },
  { part: "cuffL", angle: 100, period: F.u(0.13), depth: 0.4 },
  { part: "cuffR", angle: 80, period: F.u(0.13), depth: 0.4 },
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
    { pts: F.P(S([[0, M.hoodTop], [0, -11.3]], 3)), clip: ["hoodShell"], w: 1.0, depth: 0.4 },
  ];
  const band = join(bandSeamL, rev(mirror(bandSeamL)).slice(1));
  const stitches = [
    // twin-needle cover stitch above the hem band seam
    { pts: F.P(offset(band, 0.42)), clip: ["body", "pocket"], gap: F.u(0.22) },
    // pocket: twin needle along the top hem, single along openings and sides
    { pts: F.P(offset(join(pocketTopL, rev(mirror(pocketTopL)).slice(1)), 0.5)), clip: ["pocket"], gap: F.u(0.2) },
    { pts: F.P(offset(pocketOpenL, -0.16)), clip: ["pocket"], twin: false },
    { pts: F.P(mirror(offset(pocketOpenL, -0.16))), clip: ["pocket"], twin: false },
    { pts: F.P(line([-M.pocketHalf + 0.14, M.pocketOpenY + 0.2], [-M.pocketHalf + 0.14, 24.5], 4)), clip: ["pocket"], twin: false },
    { pts: F.P(line([M.pocketHalf - 0.14, M.pocketOpenY + 0.2], [M.pocketHalf - 0.14, 24.5], 4)), clip: ["pocket"], twin: false },
    // armhole cover stitch (body side)
    { pts: F.P(offset(armholeL, -0.2)), clip: ["body"], gap: F.u(0.22) },
    { pts: F.P(mirror(offset(armholeL, -0.2))), clip: ["body"], gap: F.u(0.22) },
    // drawcord channel stitch on the rims
    { pts: F.P(offset(rimOuterL, -0.12).slice(2, -4)), clip: ["rimL"], twin: false },
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

const frontZones = {
  "chest-left": { ...F.box(4.7, 5.6, 3.6, 3.6, "Left chest") },
  "chest-center": { ...F.box(-3.6, 5.4, 7.2, 4.8, "Center chest") },
  center: { ...F.box(-6.3, 5.4, 12.6, 10.8, "Center") },
  oversized: { ...F.box(-5.0, 1.5, 23.0, 23.0, "Oversized · crops right") },
  hood: { ...F.box(5.5, -8.0, 0.95, 4.6, "Hood side"), clip: ["hoodShell"] },
  pouch: { ...F.box(-6.2, 17.7, 12.4, 6.4, "Pouch") },
};

/* ═════════════════════════════════ BACK ═════════════════════════════════ */

const backNecklineL = S([[0, 0.85], [-2.4, 0.62], [-4.5, 0.1], [-6.0, 0.4], HF], 6);
const backBodyHalf = join(backNecklineL, shoulderL, armholeL, sideL, bandSeamL);
const BACK_BODY = join(backBodyHalf, rev(mirror(backBodyHalf)));

// hood lying flat down the upper back: rounded shield, centre seam, rolled top edge
const hoodBackTopL = S([[0, -0.85], [-2.6, -0.68], [-4.6, -0.05], [-5.95, 0.75], [-6.4, 1.6]], 8);
const hoodBackSideL = S([[-6.4, 1.6], [-6.55, 3.6], [-6.15, 6.6], [-5.0, 9.3], [-3.1, 11.3], [-1.2, 12.25], [0, 12.4]], 10);
const hoodBackHalf = join(hoodBackTopL, hoodBackSideL);
const HOOD_BACK = join(hoodBackHalf, rev(mirror(hoodBackHalf)).slice(1));
const hoodBackSides = join(hoodBackSideL, rev(mirror(hoodBackSideL)).slice(1));
const LIP = join(S([[-4.4, -0.1], [-2.5, -0.63], [0, -0.83], [2.5, -0.63], [4.4, -0.1]], 8), rev(S([[-4.4, -0.1], [-2.4, -0.42], [0, -0.55], [2.4, -0.42], [4.4, -0.1]], 8)));

const backParts = [
  { id: "band", pts: BAND, role: "base" },
  { id: "cuffL", pts: CUFF_L, role: "base" },
  { id: "cuffR", pts: CUFF_R, role: "base" },
  { id: "body", pts: BACK_BODY, role: "base", print: true },
  { id: "sleeveL", pts: SLEEVE_L, role: "base" },
  { id: "sleeveR", pts: SLEEVE_R, role: "base" },
  { id: "hood", pts: HOOD_BACK, role: "base" },
  { id: "lip", pts: LIP, role: "trim" },
].map((p) => ({ ...p, pts: F.P(p.pts) }));

function backPaint() {
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
    dark(ribbon(offset(hoodBackSides, -0.1).map(([x, y]) => [x + 0.45, y + 0.5]), 1.3), { blur: 0.65, alpha: 0.52, clip: T, exclude: ["hood"] }),
    dark(ribbon(offset(hoodBackSides, -0.08), 0.42), { blur: 0.2, alpha: 0.5, clip: T, exclude: ["hood"] }),
  );
  out.push(...sleevePaint(T, { back: true }));
  for (const [pts, w, hi, lo] of [
    [[[-11.9, 11.0], [-10.2, 12.8], [-8.8, 15.0]], 1.15, 0.2, 0.28],
    [[[12.0, 11.2], [10.4, 13.0], [9.2, 15.2]], 1.1, 0.1, 0.34],
    [[[-12.0, 14.4], [-10.8, 16.3], [-10.0, 18.0]], 0.9, 0.14, 0.22],
    [[[12.1, 14.6], [11.0, 16.4], [10.3, 18.0]], 0.85, 0.06, 0.26],
  ]) out.push(...fold(pts, w, { hi, lo, blur: 0.45, clip: T }));
  out.push(...fold([[-10.0, 17.8], [-9.4, 20.0], [-9.7, 22.6]], 1.4, { hi: 0.08, lo: 0.1, blur: 0.9, clip: T, ta: 0.45, tb: 0.5 }));
  out.push(...fold([[10.2, 18.0], [9.7, 20.2], [10.0, 22.4]], 1.3, { hi: 0.04, lo: 0.14, blur: 0.9, clip: T, ta: 0.45, tb: 0.5 }));
  out.push(...bandPaint(T));
  // hood: a soft, fairly flat pillow — rolled sides, centre-seam valley, lit upper left
  out.push(
    blob("light", -2.8, 3.6, 2.8, 4.2, 10, { blur: 1.4, alpha: 0.18, clip: ["hood"] }),
    dark(rect(0.4, -2, 7, 13), { blur: 0.8, alpha: 0.36, clip: ["hood"], grad: { x0: 1.2, y0: 0, x1: 6.0, y1: 0, stops: [[0, 0], [1, 1]] } }),
    dark(rect(-7, 5, 7, 13), { blur: 0.8, alpha: 0.26, clip: ["hood"], grad: { x0: 0, y0: 6.5, x1: 0, y1: 12.4, stops: [[0, 0], [1, 1]] } }),
    // double-layer edge: a rolled rim all the way round
    dark(ribbon(offset(hoodBackSides, 0.16), 0.38), { blur: 0.2, alpha: 0.34, clip: ["hood"] }),
    lite(ribbon(offset(slice(hoodBackSideL, 0.03, 0.75, 24), 0.42), taper(0.42, 0.15, 0.35)), { blur: 0.22, alpha: 0.24, clip: ["hood"] }),
    dark(ribbon(offset(mirror(slice(hoodBackSideL, 0.03, 0.9, 24)), -0.5), taper(0.6, 0.15, 0.3)), { blur: 0.3, alpha: 0.26, clip: ["hood"] }),
    // the rolled top edge where the hood folds over the neck
    lite(ribbon(S([[-5.4, 0.7], [-2.8, -0.28], [0, -0.45], [2.8, -0.28], [5.4, 0.7]], 8), taper(0.42, 0.15, 0.15)), { blur: 0.25, alpha: 0.26, clip: ["hood"] }),
    dark(ribbon(S([[-5.7, 1.5], [-2.8, 0.55], [0, 0.4], [2.8, 0.55], [5.7, 1.5]], 8), taper(0.6, 0.15, 0.15)), { blur: 0.35, alpha: 0.26, clip: ["hood"] }),
    dark(LIP, { blur: 0.2, alpha: 0.42, clip: ["lip"] }),
    lite(ribbon(S([[-3.6, -0.42], [0, -0.72], [3.6, -0.42]], 8), taper(0.1, 0.2, 0.2)), { blur: 0.08, alpha: 0.2, clip: ["lip"] }),
  );
  // gentle folds on the hood fabric fanning from the neck; the centre seam as a valley
  out.push(...fold([[-3.7, 1.8], [-4.0, 4.8], [-3.5, 8.0]], 0.9, { hi: 0.12, lo: 0.16, blur: 0.45, clip: ["hood"], relief: 0 }));
  out.push(...fold([[3.8, 2.0], [4.1, 5.0], [3.6, 7.8]], 0.85, { hi: 0.06, lo: 0.2, blur: 0.45, clip: ["hood"], relief: 0 }));
  out.push(...fold([[0.05, 0.4], [0.15, 6.0], [0.05, 11.8]], 0.8, { hi: 0.14, lo: 0.24, blur: 0.26, clip: ["hood"], valley: true, relief: 0 }));
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
    // hood centre seam: twin-needle cover stitch either side
    { pts: F.P(S([[0, -0.4], [0.03, 6.0], [0, 12.0]], 6)), clip: ["hood"], gap: F.u(0.3) },
    // channel stitch along the hood's rolled edge
    { pts: F.P(offset(hoodBackSides, 0.32).slice(3, -3)), clip: ["hood"], twin: false },
  ];
  const edges = silhouetteEdges(["body"], false);
  edges.push({ pts: F.P(slice(hoodBackSideL, 0.0, 0.8, 24)), clip: ["hood"], w: F.u(0.28), blur: F.u(0.14), alpha: 0.2 });
  return { seams, stitches, ribs: RIBS, edges };
}

const backZones = {
  "back-yoke": { ...F.box(-1.8, 13.2, 3.6, 3.6, "Back yoke") },
  "back-center": { ...F.box(-6.6, 12.4, 13.2, 11.8, "Back center") },
  oversized: { ...F.box(-18.0, 3.0, 23.0, 23.0, "Oversized · crops left") },
};

/* ───────────────────────────── assemble ───────────────────────────── */

const LIGHT_MODEL = { exposure: 1.0, diffuse: 1.25, shadowGain: 1.7, lightGain: 1.6, sheen: 0.1, printSheen: 0.05, inkGrain: 0.16 };
const DROP = { passes: [[9, 15, 22, 0.26], [3, 6, 7, 0.2], [1, 2, 1.8, 0.14]] };
const UNDULATE = { amount: 0.1, scale: F.u(1.6), stretch: 4, blur: F.u(0.6), relief: 0.6, lightRatio: 0.7, seed: 5 };
const WRAP = [{ cx: 500, r: F.u(19), y0: F.p([0, 1])[1], y1: F.p([0, 24.7])[1], feather: F.u(1.5), amount: 1 }];

const hoodie = {
  id: "hoodie",
  name: "Warm-up Hoodie",
  fabric: "fleece",
  frame: FRAME,
  views: {
    front: {
      parts: frontParts, paint: frontPaint(), ...frontDetail(),
      zones: frontZones, printDefault: TORSO, clipSets: { torso: TORSO },
      wraps: WRAP, lightModel: LIGHT_MODEL, drop: DROP, foldDisplace: 420, undulation: { ...UNDULATE, skip: ["innerBack", "tape", "label", "lining", "cordL", "cordR"] },
    },
    back: {
      parts: backParts, paint: backPaint(), ...backDetail(),
      zones: backZones, printDefault: ["body"], clipSets: { torso: ["body"] },
      wraps: WRAP, lightModel: LIGHT_MODEL, drop: DROP, foldDisplace: 420, undulation: { ...UNDULATE, seed: 9, skip: ["lip"] },
    },
  },
};
export default hoodie;

/* ───────────────────────────── spec check ───────────────────────────── */

/** Measurements taken from the actual polygons (inches), for the harness spec table. */
export function measure() {
  const w = (poly, y) => { const s = spanAtY(poly, y); return s ? s[1] - s[0] : null; };
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const sleeveLen = polyLength(sleeveOuterL) + polyLength(cuffOuterL.slice(Math.round(cuffOuterL.length * 0.13)));
  const armDeg = (Math.atan2(-(atY(sleeveOuterL, 15)[0] - atY(sleeveOuterL, 9)[0]), 6) * 180) / Math.PI;
  const bicep = (() => {
    const y = M.underarmY + 1;
    const o = atY(sleeveOuterL, y), i = atY(sleeveInnerL, y);
    return o && i ? Math.abs(i[0] - o[0]) * Math.cos((armDeg * Math.PI) / 180) : null;
  })();
  const hoodTop = Math.min(...hoodOuterL.map((p) => p[1]));
  const hoodHalf = Math.max(...hoodOuterL.filter((p) => p[1] < -1).map((p) => -p[0]));
  return [
    ["Chest width (1\" below armhole)", 25, r2(w(BODY, M.underarmY + 1))],
    ["Body length HPS → hem (CF)", 27.5, r2(27.5 - 0)],
    ["Across shoulder (seam to seam)", 23.5, r2(2 * -SP[0])],
    ["Sleeve, shoulder seam → cuff end (projected)", 23, r2(sleeveLen)],
    ["Bicep (projected filled tube)", "10.5 flat", r2(bicep)],
    ["Cuff width", 4, r2(Math.hypot(cp(M.cuffH, -2)[0] - cp(M.cuffH, 2)[0], cp(M.cuffH, -2)[1] - cp(M.cuffH, 2)[1]))],
    ["Cuff height", 3.25, M.cuffH],
    ["Hem band height", 3, r2(27.5 - 24.5)],
    ["Hem band width / body width", "< 1", r2(w(BAND, 25.5) / w(BODY, 20))],
    ["Hood above HPS (front view, standing)", "14.5 flat", r2(-hoodTop)],
    ["Hood width (front view, standing part)", 11, r2(2 * hoodHalf)],
    ["Hood opening (lining) width × height", "", `${r2(2 * Math.max(...rimInnerL.map((p) => -p[0])))} × ${r2(3.1 + 10.3)}`],
    ["Pocket width", 14, r2(w(POCKET, 23))],
    ["Pocket height", 7.5, r2(24.5 - M.pocketTop)],
    ["Drawcord drop below neckline", 9, r2(CORD_END - NECK_Y)],
    ["Aglet length", 1, M.agletL],
    ["Arm angle (upper sleeve vs vertical, °)", "15–20", r2(armDeg)],
  ];
}
