// Mascot Lab — Warm-up Pants (ML-P01).
//
// Oversized tapered fleece warm-up trousers in the pro "standard issue" mould: roomy
// through the seat and thigh, tapering hard to rib cuffs so the leg stacks a little
// at the ankle. Drawn as a technical flat on the 1000 × 1000 artboard, built the same
// way as garments/jersey.js (the reference garment):
//
//   1. the geometry kit (bezier sampling, offsets, mirroring, cutting)
//   2. MEASUREMENTS — every key point of the pattern, in artboard units
//   3. the left half of the outline as joined curves, mirrored for the right
//   4. derived construction: rib waistband + cuffs, slant pockets, side seams, knee
//      articulation, J-stitch rise; back yoke + welt pocket
//   5. views { front, back } → silhouette, parts, printArea, zones, overlays
//
// Conventions (see renderMockup.js): parts are clipped to the silhouette (bands may
// overshoot), `over` parts paint above graphics (braided drawcords, metal tips,
// eyelets, woven label), `texture: false` keeps the fleece off hardware and labels.
// "thigh-left" / "leg-left-long" are on the WEARER's left leg = the viewer's RIGHT on
// the front flat; "back-leg" is the wearer's left leg = the viewer's LEFT on the back.

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

/** Ripple a polyline outward (−normal) in `waves` soft bumps: fabric stacking on an edge. */
const ripple = (pts, amp, waves, phase = 0) => offset(pts, (t) => {
  const env = Math.min(1, t / 0.12, (1 - t) / 0.12);           // starts and ends on the line
  return -amp * env * Math.pow(Math.abs(Math.sin(Math.PI * (waves * t + phase))), 0.7);
});

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
 * Oversized warm-up pant, size L at ≈ 22 units per inch: waist 21" (rib, drawn lightly
 * stretched), seat 25.6", thigh 12.7", knee 10", leg 6.9" just above a 5.3" rib cuff
 * (the leg stacks over it), front rise 13.6", inseam 28.5", outseam 42" incl. a 2.5"
 * rib waistband and a 3" cuff.
 */
const WAIST_Y = 38;               // top of the waistband at the sides
const WAIST_HALF = 234;
const WB = 56;                    // wide rib waistband
const WB_Y = WAIST_Y + WB;
const BODY_HALF = 242;            // gathered fleece pokes out under the band
const HIP_Y = 292;                // widest point of the seat
const HIP_HALF = 282;
const CROTCH_Y = 338;
const KNEE_Y = 600;
const CUFF_TOP = 900;             // where the rib cuff disappears under the stacked leg
const CUFF_BOT = 966;
const CUFF_OUT = 292;             // cuff outer x (top), inner x = CUFF_OUT + CUFF_W
const CUFF_W = 116;
const STACK_Y = 764;              // the leg starts to stack above the cuff from here
const LEG_OUT = 272;              // outseam just above the cuff (leg blouses past the cuff)
const LEG_IN = 424;               // inseam just above the cuff

/* ───────────────────────────── outline curves (viewer's left half) ─────────────
 * Traversal: waist centre → band corner → band side → hip flare → outseam (stacking
 * near the ankle) → blouse into the cuff → cuff → blouse → inseam → crotch. With
 * that direction offset(…, +d) moves INTO the garment.
 */
function halfOutline(isFront) {
  const topY = isFront ? WAIST_Y + 2 : WAIST_Y - 3;
  const x0 = CX - WAIST_HALF;
  const waistTop = cubic([CX, topY], [CX - 110, topY], [x0 + 50, WAIST_Y], [x0 + 6, WAIST_Y], 16);
  const corner = cubic([x0 + 6, WAIST_Y], [x0 + 2, WAIST_Y], [x0, WAIST_Y + 2], [x0, WAIST_Y + 6], 4);
  const bandSide = line([x0, WAIST_Y + 6], [x0 - 2, WB_Y], 3);
  const ledge = line([x0 - 2, WB_Y], [CX - BODY_HALF, WB_Y + 2], 2);
  const flare = cubic([CX - BODY_HALF, WB_Y + 2], [CX - BODY_HALF - 24, WB_Y + 30], [CX - HIP_HALF + 1, HIP_Y - 96], [CX - HIP_HALF, HIP_Y], 20);
  const outseamAll = cubic([CX - HIP_HALF, HIP_Y], [CX - HIP_HALF - 6, 430], [LEG_OUT - 34, 690], [LEG_OUT, 884], 48);
  const outseam = join(untilY(outseamAll, STACK_Y), ripple(fromY(outseamAll, STACK_Y), 2, 3, 0));
  const blouseOut = cubic([LEG_OUT, 884], [LEG_OUT + 1, 895], [CUFF_OUT - 10, CUFF_TOP + 1], [CUFF_OUT, CUFF_TOP + 2], 8);
  const cuffOut = line([CUFF_OUT, CUFF_TOP + 2], [CUFF_OUT + 3, CUFF_BOT - 5], 3);
  const cuffBot = join(
    cubic([CUFF_OUT + 3, CUFF_BOT - 5], [CUFF_OUT + 3, CUFF_BOT - 1], [CUFF_OUT + 5, CUFF_BOT], [CUFF_OUT + 9, CUFF_BOT], 4),
    line([CUFF_OUT + 9, CUFF_BOT], [CUFF_OUT + CUFF_W - 9, CUFF_BOT], 2),
    cubic([CUFF_OUT + CUFF_W - 9, CUFF_BOT], [CUFF_OUT + CUFF_W - 5, CUFF_BOT], [CUFF_OUT + CUFF_W - 3, CUFF_BOT - 1], [CUFF_OUT + CUFF_W - 3, CUFF_BOT - 5], 4),
  );
  const cuffIn = line([CUFF_OUT + CUFF_W - 3, CUFF_BOT - 5], [CUFF_OUT + CUFF_W, CUFF_TOP + 2], 3);
  const blouseIn = cubic([CUFF_OUT + CUFF_W, CUFF_TOP + 2], [CUFF_OUT + CUFF_W + 9, CUFF_TOP + 1], [LEG_IN - 1, 895], [LEG_IN, 884], 8);
  const inseamAll = cubic([LEG_IN, 884], [LEG_IN + 10, 700], [CX - 14, 430], [CX, CROTCH_Y], 48);
  const inseam = join(ripple(untilY(inseamAll, STACK_Y), 1.6, 3, 0.5), fromY(inseamAll, STACK_Y));
  return { waistTop, corner, bandSide, ledge, flare, outseam, outseamAll, blouseOut, cuffOut, cuffBot, cuffIn, blouseIn, inseam, inseamAll,
    all: join(waistTop, corner, bandSide, ledge, flare, outseam, blouseOut, cuffOut, cuffBot, cuffIn, blouseIn, inseam) };
}

/* ───────────────────────────── construction ───────────────────────────── */

function buildView(kind) {
  const isFront = kind === "front";
  const H = halfOutline(isFront);
  const sil = join(H.all, rev(mirror(H.all)));
  const legOut = join(H.flare, H.outseam);          // waist → ankle, outer edge (left leg)
  const legIn = rev(H.inseam);                      // crotch → ankle, inner edge (left leg)

  // rib waistband, overshooting the outline (clipped by it)
  const bandLow = cubic([CX - BODY_HALF - 20, WB_Y], [CX - 100, WB_Y + 1], [CX + 100, WB_Y + 1], [CX + BODY_HALF + 20, WB_Y], 16);
  const band = closed(join([[CX - BODY_HALF - 20, 0]], bandLow, [[CX + BODY_HALF + 20, 0]]));

  // rib cuffs: the stacked leg blouses over the cuff top (a soft smile-shaped edge)
  const blouseEdge = cubic([LEG_OUT - 6, 890], [330, CUFF_TOP + 9], [390, CUFF_TOP + 9], [LEG_IN + 6, 890], 20);
  const cuffL = closed(join(blouseEdge, [[LEG_IN + 30, 1000], [LEG_OUT - 30, 1000]]));
  const cuffR = closed(mirror(join(blouseEdge, [[LEG_IN + 30, 1000], [LEG_OUT - 30, 1000]])));

  // print area: everything between the band and the cuffs
  const printArea = closed(join(
    [[-50, WB_Y + 1], [1050, WB_Y + 1], [1050, 884]],
    rev(mirror(blouseEdge)),
    rev(blouseEdge),
    [[-50, 884]],
  ));

  // side seam: set just in from the outer edge, waist to cuff
  const sideSeamFull = offset(legOut, 9);
  // knee articulation: a curved seam across the front of the knee + a short dart below
  const kOut = atY(H.outseamAll, KNEE_Y - 14), kIn = atY(H.inseamAll.slice().reverse(), KNEE_Y - 8);
  const kneeSeam = cubic([kOut[0] + 6, kOut[1]], [kOut[0] + 70, kOut[1] + 26], [kIn[0] - 80, kIn[1] + 24], [kIn[0] - 4, kIn[1]], 24);
  const dOut = atY(H.outseamAll, KNEE_Y + 34);

  /* ── shading ── */
  const shading = [];
  const stackCreases = [];
  for (const s of [1, -1]) {
    const m = (pts) => (s > 0 ? pts : mirror(pts));
    // fleece gathers under the rib waistband
    [36, 84, 132, 178].forEach((dx, i) => {
      const x = CX - dx * 1.0 - (i % 2 ? 4 : 0), len = 30 + ((i * 23) % 18);
      shading.push({ kind: "shadow", d: fold(...m([[x, WB_Y + 2], [x - 3, WB_Y + len]]), 4.5), opacity: 0.09, width: 3.5 });
      shading.push({ kind: "highlight", d: fold(...m([[x - 13, WB_Y + 3], [x - 14, WB_Y + len * 0.7]]), 4), opacity: 0.045, width: 3.5 });
    });
    // crotch: drag lines radiating from the crotch into the thighs
    shading.push({ kind: "shadow", d: lens(m(cubic([CX - 12, CROTCH_Y + 4], [CX - 36, CROTCH_Y + 40], [CX - 70, CROTCH_Y + 82], [CX - 104, CROTCH_Y + 140], 14)), 8), opacity: 0.12, width: 8 });
    shading.push({ kind: "highlight", d: lens(m(cubic([CX - 34, CROTCH_Y - 6], [CX - 60, CROTCH_Y + 28], [CX - 96, CROTCH_Y + 70], [CX - 132, CROTCH_Y + 128], 14)), 8), opacity: 0.045, width: 8 });
    shading.push({ kind: "shadow", d: lens(m(cubic([CX - 6, CROTCH_Y - 80], [CX - 8, CROTCH_Y - 40], [CX - 12, CROTCH_Y - 8], [CX - 20, CROTCH_Y + 24], 10)), 6), opacity: 0.1, width: 6 });
    // roomy thigh: a long soft drape down the front of the leg
    shading.push({ kind: "shadow", d: lens(m(cubic([262, 380], [262, 470], [268, 540], [276, 600], 14)), 12), opacity: 0.08, width: 12 });
    shading.push({ kind: "highlight", d: lens(m(cubic([330, 360], [336, 450], [340, 520], [342, 580], 14)), 26), opacity: 0.045, width: 20 });
    // knee: cap catches the light, soft creases above and below
    shading.push({ kind: "highlight", d: lens(m(cubic([300, KNEE_Y - 40], [330, KNEE_Y - 30], [370, KNEE_Y - 30], [400, KNEE_Y - 40], 12)), 16), opacity: 0.05, width: 12 });
    shading.push({ kind: "shadow", d: lens(m(cubic([kOut[0] + 10, kOut[1] - 50], [300, kOut[1] - 40], [350, kOut[1] - 46], [390, kOut[1] - 62], 12)), 5), opacity: 0.08, width: 5 });
    shading.push({ kind: "shadow", d: lens(m(cubic([dOut[0] + 6, dOut[1] + 26], [300, dOut[1] + 40], [360, dOut[1] + 44], [430, dOut[1] + 30], 14)), 6), opacity: 0.08, width: 6 });
    // shin drape
    shading.push({ kind: "shadow", d: lens(m(cubic([300, 660], [302, 700], [304, 740], [306, 772], 10)), 7), opacity: 0.07, width: 7 });
    shading.push({ kind: "highlight", d: lens(m(cubic([360, 650], [362, 700], [362, 740], [360, 780], 10)), 12), opacity: 0.04, width: 10 });
    // stacking at the ankle: Z-folds that start in the outline's pinches (the ripple
    // valleys) and die out across the leg, alternating from the outseam and the inseam
    const creases = [];
    const across = (y, f) => {
      const o = atY(H.outseamAll, y)[0], i = atY(rev(H.inseamAll), y)[0];
      return o + (i - o) * f;
    };
    [
      [804, 0.02, 0.64, 18, 0.12], [824, 0.98, 0.36, 20, 0.11],
      [846, 0.02, 0.6, 16, 0.12], [786, 0.98, 0.5, 12, 0.07],
    ].forEach(([y, f0, f1, drop, op]) => {
      const a = [across(y, f0), y], b = [across(y + drop, f1), y + drop];
      const c = cubic(a, [a[0] + (b[0] - a[0]) * 0.45, a[1] + drop * 0.9], [b[0] - (b[0] - a[0]) * 0.2, b[1]], b, 14);
      shading.push({ kind: "shadow", d: lens(m(c), 4), opacity: op + 0.03, width: 3 });
      shading.push({ kind: "highlight", d: lens(m(shift(c, 0, -7)), 3.5), opacity: 0.06, width: 3 });
      // the crease itself: a fine line from the pinch, fading out across the leg
      creases.push(m(c.slice(0, 10)));
    });
    stackCreases.push(...creases);
    // gathers where the leg drops into the cuff
    [0.12, 0.3, 0.5, 0.7, 0.88].forEach((t, i) => {
      const x = LEG_OUT + (LEG_IN - LEG_OUT) * t, y = 890 + Math.sin(Math.PI * t) * 9;
      shading.push({ kind: "shadow", d: fold(...m([[x, y - 1], [x + (i % 2 ? 2 : -2), y - 26 - (i % 3) * 6]]), 3.5), opacity: 0.14, width: 2.5 });
    });
    // the stacked leg casts a soft shadow onto the cuff
    shading.push({ kind: "shadow", d: lens(m(shift(blouseEdge, 0, 5)), 6), opacity: 0.3, width: 4 });
    // inner leg turns away
    shading.push({ kind: "shadow", d: lens(m(offset(H.inseamAll, 10)), 9), opacity: 0.09, width: 9 });
  }
  shading.push({ kind: "edge", d: open(bandLow), opacity: 0.22, width: 3 });

  /* ── lines ── */
  const lines = [
    ...ribRows(CX - BODY_HALF - 20, CX + BODY_HALF + 20, [0, WAIST_Y + WB / 2, bandLow], [WAIST_Y + 14, WAIST_Y + WB * 0.75], 0.2),
    ...ribRows(LEG_OUT - 30, LEG_IN + 30, [blouseEdge, 934, 1000], [917, 951], 0.2),
    ...ribRows(mx(LEG_IN + 30), mx(LEG_OUT - 30), [rev(mirror(blouseEdge)), 934, 1000], [917, 951], 0.2),
    { kind: "seam", d: open(bandLow) },
    { kind: "seam", d: open(blouseEdge), opacity: 0.45 },
    { kind: "seam", d: open(mirror(blouseEdge)), opacity: 0.45 },
    { kind: "stitch", d: open(offset(bandLow, -5)), gap: 3.6 },
    ...stackCreases.map((c) => ({ kind: "seam", d: open(c), opacity: 0.2, width: 0.9 })),
  ];

  const parts = [
    { id: "body", d: closed(sil), fill: "base" },
    { id: "waistband", d: band, fill: "trim" },
    { id: "cuff-left", d: cuffL, fill: "trim" },
    { id: "cuff-right", d: cuffR, fill: "trim" },
  ];
  const overlays = [];

  if (isFront) {
    // slanted side pockets: band seam → side seam; front edge topstitched, bar-tacked
    const pTop = [CX - WAIST_HALF + 36, WB_Y + 1];
    const pBotY = 266;
    const pBot = atY(sideSeamFull, pBotY);
    const pocket = cubic(pTop, [pTop[0] - 30, pTop[1] + 60], [pBot[0] + 40, pBotY - 70], pBot, 20);
    const sideSeam = fromY(untilY(sideSeamFull, 884), pBotY);
    shading.push(
      { kind: "shadow", d: lens(offset(pocket, -2.5), 4), opacity: 0.42, width: 2 },
      { kind: "shadow", d: lens(mirror(offset(pocket, -2.5)), 4), opacity: 0.42, width: 2 },
      { kind: "highlight", d: lens(offset(pocket, 5), 3), opacity: 0.06, width: 2 },
      { kind: "highlight", d: lens(mirror(offset(pocket, 5)), 3), opacity: 0.06, width: 2 },
    );
    const tackAt = (p, q) => {   // short bar across the opening line at p (direction p→q)
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
      const n = [dy / L, -dx / L];
      return [[p[0] - n[0] * 7, p[1] - n[1] * 7], [p[0] + n[0] * 7, p[1] + n[1] * 7]];
    };
    const tacks = [tackAt(pocket[2], pocket[3]), tackAt(pocket.at(-3), pocket.at(-2))];
    lines.push(
      { kind: "seam", d: open(pocket), opacity: 0.5 },
      { kind: "seam", d: open(mirror(pocket)), opacity: 0.5 },
      { kind: "stitch", d: open(offset(pocket, 7)), gap: 3.2 },
      { kind: "stitch", d: open(mirror(offset(pocket, 7))), gap: 3.2 },
      { kind: "seam", d: open(sideSeam), opacity: 0.3 },
      { kind: "seam", d: open(mirror(sideSeam)), opacity: 0.3 },
      ...tacks.flatMap((t) => [{ kind: "seam", d: open(t), opacity: 0.6, width: 2.4 }, { kind: "seam", d: open(mirror(t)), opacity: 0.6, width: 2.4 }]),
    );
    // front rise: centre seam + J-stitch (mock fly) on the wearer's left
    const jStitch = join(line([CX + 42, WB_Y + 6], [CX + 42, 238], 3), cubic([CX + 42, 238], [CX + 42, 270], [CX + 24, 286], [CX + 3, 292], 12));
    lines.push(
      { kind: "seam", d: open(line([CX, WB_Y], [CX, CROTCH_Y], 2)), opacity: 0.32 },
      { kind: "stitch", d: open(jStitch), gap: 3.2 },
    );
    shading.push({ kind: "edge", d: open(offset(jStitch, 3)), opacity: 0.06, width: 3 });
    // knee articulation
    lines.push(
      { kind: "seam", d: open(kneeSeam), opacity: 0.32 },
      { kind: "seam", d: open(mirror(kneeSeam)), opacity: 0.32 },
      { kind: "stitch", d: open(offset(kneeSeam, -4.5)), gap: 3.2 },
      { kind: "stitch", d: open(mirror(offset(kneeSeam, -4.5))), gap: 3.2 },
      { kind: "shadow", d: lens(shift(kneeSeam, 0, 5), 6), opacity: 0.1, width: 4 },
      { kind: "shadow", d: lens(mirror(shift(kneeSeam, 0, 5)), 6), opacity: 0.1, width: 4 },
    );
    // braided drawcords from two metal eyelets
    const eyes = [[CX - 19, WAIST_Y + 27], [CX + 19, WAIST_Y + 27]];
    const cordParts = [], cordOverlays = [];
    for (const [ex, ey] of eyes) eyelet(cordParts, cordOverlays, ex, ey, 9.5);
    drawcord(cordParts, cordOverlays, cubic(eyes[0], [CX - 24, WAIST_Y + 100], [CX - 38, WAIST_Y + 170], [CX - 34, WAIST_Y + 252], 30), { w: 11, tipLen: 34, id: 0 });
    drawcord(cordParts, cordOverlays, cubic(eyes[1], [CX + 22, WAIST_Y + 96], [CX + 34, WAIST_Y + 160], [CX + 26, WAIST_Y + 228], 30), { w: 11, tipLen: 34, id: 1 });
    parts.push(...cordParts);
    overlays.push(...cordOverlays);
  } else {
    // back yoke: a shallow V below the band, twin-needled
    const yokeL = cubic([80, WB_Y + 50], [250, WB_Y + 58], [400, WB_Y + 84], [CX, WB_Y + 96], 24);
    const sideSeam = untilY(sideSeamFull, 884);
    lines.push(
      { kind: "seam", d: open(yokeL) }, { kind: "seam", d: open(mirror(yokeL)) },
      { kind: "stitch", d: open(offset(yokeL, -4.5)), gap: 3.2 },
      { kind: "stitch", d: open(mirror(offset(yokeL, -4.5))), gap: 3.2 },
      { kind: "seam", d: open(line([CX, WB_Y + 96], [CX, CROTCH_Y], 2)), opacity: 0.32 },
      { kind: "stitch", d: open(line([CX - 5, WB_Y + 100], [CX - 5, CROTCH_Y - 8], 2)), gap: 3.2 },
      { kind: "seam", d: open(sideSeam), opacity: 0.3 },
      { kind: "seam", d: open(mirror(sideSeam)), opacity: 0.3 },
    );
    shading.push({ kind: "edge", d: open(join(yokeL, rev(mirror(yokeL)))), opacity: 0.1, width: 3 });
    // welt pocket on the wearer's right seat (viewer's right on the back flat)
    const wx = 588, wy = WB_Y + 150, ww = 116, wh = 15;
    shading.push(
      { kind: "shadow", d: rrect(wx + 2, wy + wh / 2 - 1.5, ww - 4, 4, 2), opacity: 0.6, width: 1.5 },
      { kind: "shadow", d: rrect(wx, wy + wh, ww, 5, 2), opacity: 0.16, width: 3 },
      { kind: "highlight", d: rrect(wx + 4, wy + 1, ww - 8, 4, 2), opacity: 0.07, width: 1.5 },
    );
    lines.push(
      { kind: "seam", d: rrect(wx, wy, ww, wh, 2), opacity: 0.45 },
      { kind: "seam", d: open([[wx + 3, wy + wh / 2], [wx + ww - 3, wy + wh / 2]]), opacity: 0.55, width: 1 },
      { kind: "stitch", d: rrect(wx - 5, wy - 5, ww + 10, wh + 10, 4), gap: 0, width: 0.9 },
      { kind: "seam", d: open([[wx + 1, wy - 3], [wx + 1, wy + wh + 3]]), opacity: 0.6, width: 2.6 },
      { kind: "seam", d: open([[wx + ww - 1, wy - 3], [wx + ww - 1, wy + wh + 3]]), opacity: 0.6, width: 2.6 },
    );
    // back of the knee: soft horizontal creases
    for (const s of [1, -1]) {
      const m = (pts) => (s > 0 ? pts : mirror(pts));
      shading.push(
        { kind: "shadow", d: lens(m(cubic([250, KNEE_Y + 10], [300, KNEE_Y + 22], [380, KNEE_Y + 18], [440, KNEE_Y + 2], 14)), 6), opacity: 0.1, width: 6 },
        { kind: "shadow", d: lens(m(cubic([270, KNEE_Y + 44], [320, KNEE_Y + 52], [380, KNEE_Y + 50], [430, KNEE_Y + 38], 14)), 5), opacity: 0.07, width: 5 },
        { kind: "highlight", d: lens(m(cubic([300, 340], [320, 400], [330, 460], [330, 520], 12)), 30), opacity: 0.04, width: 22 },
      );
    }
    // woven label at the centre-back waistband
    const lw = 46, lh = 22, lx = CX - lw / 2, ly = WAIST_Y + 17;
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
      "thigh-left": { x: 598, y: 300, w: 146, h: 138, label: "Left thigh" },
      "leg-left-long": { x: 590, y: 292, w: 160, h: 320, label: "Left leg · hip to knee" },
      "leg-right-long": { x: 250, y: 292, w: 160, h: 320, label: "Right leg · hip to knee" },
      // at scale 1 the mascot runs down the left leg, cropped by the outseam and inseam
      oversized: { x: 426, y: 266, w: 650, h: 650, label: "Oversized · crops left leg" },
    }
    : {
      // wearer's left leg = viewer's left on the back flat: upper calf, under the knee crease
      "back-leg": { x: 272, y: 652, w: 140, h: 130, label: "Back leg" },
      "waist-back": { x: 436, y: WB_Y + 10, w: 128, h: 70, label: "Waist back" },
    };

  return {
    silhouette: closed(sil),
    parts,
    printArea,
    zones,
    overlays: finishOverlays([...shading, ...lines, ...overlays]),
  };
}

export default {
  id: "pants",
  name: "Warm-up Pants",
  styleCode: "ML-P01",
  category: "warmup",
  fabric: "fleece",
  spec: "Brushed-back fleece · 2.5\" rib waist · braided cord, metal tips · rib cuff · 340 gsm",
  views: { front: buildView("front"), back: buildView("back") },
  defaultColors: { base: "dark", trim: "primary", accent: "accent" },
};
