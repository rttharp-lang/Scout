#!/usr/bin/env node
// Generates the Northgate Bulldogs sample logos in src/assets/samples/:
//   bulldog.svg   hand-authored mascot head (cubic béziers, mirrored halves)
//   monogram.svg  varsity tackle-twill "N" (glyph outlines via opentype.js)
//   crest.svg     round athletic badge (arc text as paths + bulldog)
//   bulldog-on-white.jpg   (with --jpg) upload fixture: the bulldog at 1200px
//                          on pure white, JPEG q85, rendered by Chromium
//
//   node scripts/gen-samples.mjs          # write the three SVGs
//   node scripts/gen-samples.mjs --jpg    # …and the JPG fixture
//
// Everything is emitted as plain <path>s (no fonts, no external refs) so the
// files render identically as <img>, in canvas, and in every effect.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/assets/samples");
const FONTS = path.join(ROOT, "node_modules/@fontsource");

const C = {
  navy: "#13294B",
  gold: "#F2A900",
  white: "#FFFFFF",
  ink: "#0B0D10",
  grey: "#C9D2DE",
};

// ───────────────────────────── geometry ─────────────────────────────
const f = (n) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
const ang = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const perp = (a) => [-a[1], a[0]];
/** offset each point of a polyline along its local normal (+d = right of travel) */
function inset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const nrm = perp(norm(sub(b, a)));
    return [p[0] + nrm[0] * d, p[1] + nrm[1] * d, p[2]];
  });
}

// A point is [x, y, opts]. opts:
//   c: true        corner (handles aim at the neighbours)
//   a: deg         tangent direction (travel direction, y down, 0 = +x)
//   ai / ao: deg   separate in / out tangent (implies a corner)
//   t, ti, to      handle length as a fraction of the segment chord (default .36)
function tangents(P, closed) {
  const n = P.length;
  return P.map((p, i) => {
    const o = p[2] || {};
    const prev = P[(i - 1 + n) % n];
    const next = P[(i + 1) % n];
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const din = hasPrev ? norm(sub(p, prev)) : null;
    const dout = hasNext ? norm(sub(next, p)) : null;
    let tin, tout;
    if (o.a !== undefined) tin = tout = ang(o.a);
    else if (o.c) {
      tin = din || dout;
      tout = dout || din;
    } else {
      const d = norm(add(din || dout, dout || din));
      tin = tout = d;
    }
    if (o.ai !== undefined) tin = ang(o.ai);
    if (o.ao !== undefined) tout = ang(o.ao);
    return { tin, tout };
  });
}

function segments(P, closed, t = 0.36) {
  const T = tangents(P, closed);
  const segs = [];
  const n = P.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    const oa = a[2] || {};
    const ob = b[2] || {};
    const L = len(sub(b, a));
    const ka = oa.to ?? oa.t ?? t;
    const kb = ob.ti ?? ob.t ?? t;
    const c1 = add(a, mul(T[i].tout, L * ka));
    const c2 = sub(b, mul(T[(i + 1) % n].tin, L * kb));
    segs.push([[a[0], a[1]], c1, c2, [b[0], b[1]]]);
  }
  return segs;
}

function segsToD(segs, closed) {
  if (!segs.length) return "";
  let d = `M${f(segs[0][0][0])} ${f(segs[0][0][1])}`;
  for (const [, c1, c2, b] of segs) d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
  return closed ? d + "Z" : d;
}

/** closed smooth shape through points */
const shape = (pts, t) => segsToD(segments(pts, true, t), true);
/** open smooth curve through points */
const curve = (pts, t) => segsToD(segments(pts, false, t), false);

const AX = 500; // symmetry axis
function mirOpts(o) {
  if (!o) return o;
  const m = { ...o };
  if (o.a !== undefined) m.a = 180 - o.a;
  if (o.ai !== undefined) m.ai = 180 - o.ai;
  if (o.ao !== undefined) m.ao = 180 - o.ao;
  return m;
}
/** mirror a point list across x = AX */
const mir = (pts) => pts.map(([x, y, o]) => [2 * AX - x, y, mirOpts(o)]);

/** symmetric closed shape from a left half running top-centre → bottom-centre */
function symPts(half) {
  const inner = half.slice(1, -1);
  const back = inner
    .slice()
    .reverse()
    .map(([x, y, o]) => {
      if (!o) return [2 * AX - x, y];
      const m = { ...o };
      if (o.a !== undefined) m.a = -o.a;
      if (o.ai !== undefined || o.ao !== undefined) {
        delete m.ai;
        delete m.ao;
        if (o.ao !== undefined) m.ai = -o.ao;
        if (o.ai !== undefined) m.ao = -o.ai;
      }
      if (o.ti !== undefined || o.to !== undefined) {
        delete m.ti;
        delete m.to;
        if (o.to !== undefined) m.ti = o.to;
        if (o.ti !== undefined) m.to = o.ti;
      }
      return [2 * AX - x, y, m];
    });
  return [...half, ...back];
}
const sym = (half, t) => shape(symPts(half), t);

/**
 * Tapered brush stroke along a smooth centreline, returned as a closed fill.
 * widths: one per point (full width, 0 = sharp tip).
 */
function taper(pts, widths, t) {
  const segs = segments(pts, false, t);
  const n = pts.length;
  const T = tangents(pts, false);
  const N = T.map(({ tin, tout }) => perp(norm(add(tin, tout))));
  const W = widths.map((w) => w / 2);
  const side = (s) => {
    const out = [];
    segs.forEach(([a, c1, c2, b], i) => {
      const wa = W[i] * s;
      const wb = W[i + 1] * s;
      const na = N[i];
      const nb = N[i + 1];
      out.push([
        add(a, mul(na, wa)),
        add(c1, mul(na, (2 * wa + wb) / 3)),
        add(c2, mul(nb, (wa + 2 * wb) / 3)),
        add(b, mul(nb, wb)),
      ]);
    });
    return out;
  };
  const L = side(1);
  const R = side(-1)
    .reverse()
    .map(([a, c1, c2, b]) => [b, c2, c1, a]);
  const capEnd = W[n - 1] > 0 ? [[L[L.length - 1][3], L[L.length - 1][3], R[0][0], R[0][0]]] : [];
  const capStart = W[0] > 0 ? [[R[R.length - 1][3], R[R.length - 1][3], L[0][0], L[0][0]]] : [];
  return segsToD([...L, ...capEnd, ...R, ...capStart], true);
}

const P = (d, fill, extra = "") => `<path d="${d}"${fill ? ` fill="${fill}"` : ""}${extra}/>`;
const g = (attrs, kids) => `<g ${attrs}>${kids.flat(Infinity).join("")}</g>`;

// ───────────────────────────── bulldog ─────────────────────────────
// Left halves are authored; everything symmetric is mirrored about x = 500.
// Layering follows a mascot illustrator's file: silhouette keyline → collar →
// ears → head fill → cel shading clipped to the head → features → brush lines.
function bulldogArt(id = "bd") {
  const K = C.ink;
  const both = (pts, fn) => [fn(pts), fn(mir(pts))];
  const line = (w = 10) => `stroke="${K}" stroke-width="${w}" stroke-linejoin="round"`;

  // head base (skull + cheeks + jowls), top-centre → bottom-centre
  const head = [
    [500, 182],
    [400, 184],
    [310, 198],
    [240, 232],
    [196, 284],
    [170, 350],
    [150, 420],
    [126, 486],
    [104, 556],
    [96, 624],
    [110, 688],
    [150, 734],
    [210, 760],
    [280, 768],
    [350, 758],
    [420, 764],
    [500, 770],
  ];

  // rose ear: small flap off the top corner, tip folding down and out
  const ear = [
    [340, 200, { c: true }],
    [284, 158],
    [214, 142],
    [150, 156],
    [112, 196],
    [94, 256, { c: true, ai: 105, ao: -20 }],
    [146, 240],
    [194, 252],
    [238, 278, { c: true }],
  ];
  // white flap folding over the navy burr; clipped to the ear, so only its
  // lower edge (the fold line) shows
  const earFlap = [
    [372, 240, { c: true }],
    [360, 90, { c: true }],
    [40, 90, { c: true }],
    [40, 250, { c: true }],
    [96, 250, { c: true, ai: 0, ao: -40 }],
    [160, 206],
    [236, 186],
    [300, 192],
    [350, 214, { c: true }],
  ];
  const foldShade = [[118, 222], [172, 190], [240, 174], [314, 184]];

  // spiked collar
  const collar = [
    [500, 760],
    [360, 748],
    [230, 728],
    [178, 744, { c: true }],
    [182, 804, { c: true }],
    [300, 842],
    [420, 860],
    [500, 864],
  ];
  const spike = (x, y, a, h = 84, w = 62) => {
    const d = ang(a);
    const n = perp(d);
    const at = (u, v) => add(add([x, y], mul(d, u * h)), mul(n, v * w));
    return {
      body: shape([[...at(0, 0.5), { c: true }], [...at(0.5, 0.3)], [...at(1, 0), { c: true }], [...at(0.5, -0.3)], [...at(0, -0.5), { c: true }]], 0.3),
      lit: taper([at(0.08, 0.2), at(0.5, 0.12), at(0.92, 0.02)], [10, 8, 0]),
    };
  };
  const spikes = [
    [500, 812, 90],
    [388, 802, 100],
    [278, 778, 112],
  ];
  const sp = spikes.flatMap(([x, y, a]) => (x === 500 ? [spike(x, y, a)] : [spike(x, y, a), spike(1000 - x, y, 180 - a)]));

  // ---- cel shading (clipped to the head) ----
  // mid-tone band down the sides, two fur points
  const sideShade = [
    [250, 200, { c: true }],
    [214, 290],
    [200, 360],
    [206, 424],
    [252, 482, { c: true, ai: 50, ao: 188 }],
    [196, 478],
    [176, 530],
    [176, 596],
    [214, 662, { c: true, ai: 60, ao: 185 }],
    [196, 690],
    [236, 710],
    [300, 720],
    [380, 708],
    [460, 701],
    [530, 700, { c: true }],
    [530, 840, { c: true }],
    [40, 840, { c: true }],
    [40, 200, { c: true }],
  ];
  // core shadow: wraps the sides and the underside of the jowls, inset from
  // the contour so a rim of reflected light (mid-tone) separates it from the edge
  const rimPts = inset(head.slice(3, 14), -16).reverse();
  const sideDeep = [
    [226, 240, { c: true }],
    [190, 320],
    [172, 400],
    [184, 474, { c: true, ai: 70, ao: 185 }],
    [150, 498],
    [138, 566],
    [156, 646, { c: true, ai: 65, ao: 185 }],
    [128, 656],
    [138, 700],
    [190, 726],
    [270, 736],
    [336, 732, { c: true }],
    ...rimPts.map(([x, y], i) => (i === rimPts.length - 1 ? [x, y, { c: true }] : [x, y])),
  ];
  // brow top planes
  const browShade = [
    [478, 336],
    [426, 296],
    [352, 270],
    [272, 272, { c: true }],
    [340, 288],
    [412, 316],
    [464, 354, { c: true }],
  ];
  // under the nose roll, beside the muzzle
  const muzzleShade = [
    [372, 444, { c: true }],
    [318, 470],
    [278, 520],
    [262, 590, { c: true }],
    [260, 520],
    [296, 468],
  ];
  // jowls under the flews
  const jowlShade = [
    [330, 700, { c: true }],
    [276, 712],
    [222, 692, { c: true }],
    [236, 740],
    [300, 770],
    [372, 770],
    [380, 720],
  ];
  const underChin = [
    [500, 700],
    [430, 702],
    [372, 694],
    [336, 680, { c: true }],
    [330, 736],
    [420, 772],
    [500, 776],
  ];
  // forehead fold planes below the furrows
  const foreShade = [
    { p: [[312, 262], [384, 264], [452, 310]], w: [0, 16, 0] },
    { p: [[356, 232], [412, 238], [462, 272]], w: [0, 14, 0] },
  ];

  // ---- features ----
  const brow = [
    [484, 392, { c: true }],
    [412, 356],
    [330, 320],
    [244, 294, { c: true }],
    [270, 264],
    [350, 262],
    [426, 290],
    [474, 332],
    [496, 372],
  ];
  const socket = [
    [490, 398, { c: true }],
    [446, 420],
    [378, 424],
    [306, 384],
    [262, 304, { c: true }],
    [360, 334],
  ];
  const eye = [
    [470, 396, { c: true }],
    [432, 404],
    [384, 398],
    [342, 370],
    [314, 328, { c: true }],
    [396, 354],
  ];
  const flew = [
    [500, 500, { c: true }],
    [500, 544, { c: true }],
    [462, 568],
    [412, 602],
    [360, 660],
    [328, 712, { a: 160, t: 0.3 }],
    [290, 694, { t: 0.3 }],
    [268, 640],
    [270, 566, { t: 0.3 }],
    [306, 498, { t: 0.3 }],
    [390, 448, { c: true }],
    [430, 444],
  ];
  const flewShade = [
    [452, 576, { c: true }],
    [412, 602],
    [360, 660],
    [328, 712, { a: 160, t: 0.3 }],
    [290, 694, { t: 0.3 }],
    [268, 640],
    [270, 584, { c: true }],
    [292, 640],
    [328, 672],
    [380, 618],
  ];
  const mouth = [
    [500, 536],
    [440, 590],
    [380, 640],
    [500, 640],
  ];
  const jaw = [
    [500, 600],
    [440, 604],
    [384, 622],
    [336, 652, { c: true }],
    [342, 684],
    [380, 702],
    [440, 710],
    [500, 712],
  ];
  const chinShade = [
    [500, 688],
    [440, 688],
    [388, 680],
    [350, 668, { c: true }],
    [360, 690],
    [394, 704],
    [440, 710],
    [500, 712],
  ];
  const lip = [
    [500, 596],
    [440, 600],
    [384, 618],
    [330, 650, { c: true }],
    [354, 666, { c: true }],
    [420, 636],
    [500, 624],
  ];
  const canine = [
    [364, 648, { c: true }],
    [366, 600],
    [380, 548, { c: true }],
    [402, 594],
    [412, 630, { c: true }],
  ];
  const canineShade = [
    [384, 560, { c: true }],
    [402, 594],
    [412, 630, { c: true }],
    [392, 632, { c: true }],
    [392, 590],
  ];
  const incisor = (x, y) => [
    [x - 18, y + 8, { c: true }],
    [x - 17, y - 14],
    [x - 7, y - 26],
    [x + 7, y - 26],
    [x + 17, y - 14],
    [x + 18, y + 8, { c: true }],
  ];
  const roll = [
    [500, 396],
    [446, 398],
    [404, 418],
    [380, 458, { c: true }],
    [414, 444],
    [456, 430],
    [500, 428],
  ];
  const nose = [
    [500, 428],
    [446, 428],
    [418, 442],
    [410, 470],
    [424, 494],
    [458, 512],
    [500, 504, { c: true }],
  ];
  const noseTop = [
    [500, 438],
    [450, 438],
    [430, 448],
    [428, 464],
    [462, 462],
    [500, 466],
  ];
  const nostril = [
    [474, 476, { c: true }],
    [448, 472],
    [432, 482],
    [448, 492],
    [466, 488],
  ];

  // brush lines: forehead furrows, scowl, chin cleft
  const strokes = [
    { p: [[500, 222], [497, 272], [500, 336]], w: [0, 14, 0] },
    { p: [[296, 254], [380, 252], [456, 300]], w: [0, 11, 0] },
    { p: [[344, 222], [408, 226], [464, 262]], w: [0, 10, 0] },
    { p: [[258, 304], [372, 334], [486, 396]], w: [0, 18, 4] },
    { p: [[500, 690], [500, 700], [500, 712]], w: [0, 8, 0] },
    { p: [[244, 640], [262, 680], [296, 706]], w: [0, 8, 0] },
  ];

  const silhouette = [
    ...both(ear, (p) => P(shape(p))),
    P(sym(head)),
    P(sym(collar)),
    P(sym(jaw)),
    ...sp.map((s) => P(s.body)),
  ];
  const headD = sym(head);

  const layers = [
    `<defs><clipPath id="${id}-head"><path d="${headD}"/></clipPath></defs>`,
    g(`fill="${K}" ${line(40)}`, silhouette),
    g(line(), [P(sym(collar), C.navy), ...sp.map((s) => P(s.body, C.gold))]),
    g(`fill="${C.white}"`, sp.map((s) => P(s.lit))),
    `<defs>${both(ear, (p) => p)
      .map((p, i) => `<clipPath id="${id}-ear${i}"><path d="${shape(p)}"/></clipPath>`)
      .join("")}</defs>`,
    g(line(), both(ear, (p) => P(shape(p), C.navy))),
    ...both(earFlap, (p) => p).map((p, i) =>
      g(`clip-path="url(#${id}-ear${i})"`, [
        P(shape(p), C.white, ` ${line()}`),
        P(taper(i ? mir(foldShade) : foldShade, [0, 16, 14, 0]), C.grey),
      ]),
    ),
    g(`fill="none" ${line()}`, both(ear, (p) => P(shape(p)))),
    P(headD, C.white),
    g(`clip-path="url(#${id}-head)"`, [
      g(`fill="${C.grey}"`, [
        ...[sideShade, browShade, muzzleShade].flatMap((s) => both(s, (p) => P(shape(p)))),
        ...foreShade.flatMap((w) => both(w.p, (p) => P(taper(p, w.w)))),
      ]),
      g(`fill="${C.navy}"`, both(sideDeep, (p) => P(shape(p)))),
    ]),
    P(headD, "none", ` ${line()}`),
    g(line(), [
      ...both(socket, (p) => P(shape(p), C.navy)),
      ...both(eye, (p) => P(shape(p), C.gold)),
    ]),
    ...both([[416, 381]], ([[x, y]]) => `<circle cx="${x}" cy="${y}" r="17" fill="${K}"/><circle cx="${x - 6}" cy="${y - 7}" r="5.5" fill="${C.white}"/>`),
    g(line(), [
      ...both(brow, (p) => P(shape(p), C.white)),
      P(shape(symPts(mouth)), C.navy),
      P(sym(jaw), C.white),
    ]),
    P(sym(chinShade), C.grey),
    P(sym(lip), K, ` ${line()}`),
    g(line(8), [[446, 608], [482, 603]].flatMap(([x, y]) => both(incisor(x, y), (p) => P(shape(p), C.white)))),
    g(line(), both(flew, (p) => P(shape(p), C.white))),
    g(`fill="${C.grey}"`, both(flewShade, (p) => P(shape(p)))),
    g(line(), both(canine, (p) => P(shape(p), C.white))),
    g(`fill="${C.grey}"`, both(canineShade, (p) => P(shape(p)))),
    g(line(), [P(sym(roll), C.white), P(sym(nose), K)]),
    P(sym(noseTop), C.navy),
    ...both(nostril, (p) => P(shape(p), K)),
    g(`fill="${C.white}"`, both([[478, 442], [446, 442], [428, 456]], (p) => P(taper(p, [0, 7, 0])))),
    g(`fill="${K}"`, strokes.flatMap((w) => both(w.p, (p) => P(taper(p, w.w))))),
  ];
  return { layers, silhouette };
}

// ───────────────────────────── type → paths ─────────────────────────────
function loadFont(rel) {
  const buf = fs.readFileSync(path.join(FONTS, rel));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
/** opentype path commands → d string, every point passed through tf([x, y]) */
function cmdsToD(cmds, tf = (p) => p) {
  let d = "";
  for (const c of cmds) {
    if (c.type === "M" || c.type === "L") {
      const [x, y] = tf([c.x, c.y]);
      d += `${c.type}${f(x)} ${f(y)}`;
    } else if (c.type === "C") {
      const a = tf([c.x1, c.y1]);
      const b = tf([c.x2, c.y2]);
      const e = tf([c.x, c.y]);
      d += `C${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(e[0])} ${f(e[1])}`;
    } else if (c.type === "Q") {
      const a = tf([c.x1, c.y1]);
      const e = tf([c.x, c.y]);
      d += `Q${f(a[0])} ${f(a[1])} ${f(e[0])} ${f(e[1])}`;
    } else if (c.type === "Z") d += "Z";
  }
  return d;
}
const rot = ([x, y], deg) => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/**
 * Set `text` on a circle centred (cx, cy). top: baseline radius r, letters
 * standing outward, reading clockwise. bottom: baseline radius r, letters
 * hanging inward (upright at 6 o'clock), reading counter-clockwise.
 * Returns one d string with every glyph converted to outlines.
 */
function arcText(font, text, { cx, cy, r, size, tracking = 0, side = "top", centerDeg = 0 }) {
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const capH = (font.tables.os2.sCapHeight || font.unitsPerEm * 0.7) * scale;
  // measure along the circle at mid cap height so spacing looks even
  const rMid = side === "top" ? r + capH / 2 : r - capH / 2;
  const adv = glyphs.map((gl) => gl.advanceWidth * scale + tracking);
  const total = adv.reduce((a, b) => a + b, 0) - tracking;
  let cursor = -total / 2;
  let d = "";
  glyphs.forEach((gl, i) => {
    const w = gl.advanceWidth * scale;
    const mid = cursor + w / 2;
    const theta = (mid / rMid) * (180 / Math.PI) + centerDeg; // degrees
    const cmds = gl.getPath(-w / 2, 0, size).commands; // baseline at y = 0, centred on x
    let tf;
    if (side === "top") {
      tf = (pt) => {
        const q = rot([pt[0], pt[1] - r], theta);
        return [cx + q[0], cy + q[1]];
      };
    } else {
      tf = (pt) => {
        const q = rot([pt[0], pt[1] + r], -theta);
        return [cx + q[0], cy + q[1]];
      };
    }
    d += cmdsToD(cmds, tf);
    cursor += adv[i];
  });
  return d;
}

function star(cx, cy, R, r = R * 0.42, rotDeg = -90) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = ((rotDeg + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r : R;
    d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
  }
  return d + "Z";
}

// ───────────────────────────── monogram ─────────────────────────────
// Varsity tackle-twill "N": gold twill letter, navy outline, white outline,
// navy outer outline with a short drop shadow, zig-zag stitching on the twill.
function monogramArt() {
  const font = loadFont("graduate/files/graduate-latin-400-normal.woff");
  const gl = font.charToGlyph("N");
  const bb = gl.getBoundingBox();
  const H = 560; // cap height on the artboard
  const k = H / (bb.y2 - bb.y1);
  const w = (bb.x2 - bb.x1) * k;
  const x0 = 500 - w / 2 - bb.x1 * k;
  const y0 = 500 + H / 2 - 12; // baseline (optically a hair high)
  const d = cmdsToD(gl.getPath(x0, y0, font.unitsPerEm * k).commands);
  const J = `stroke-linejoin="miter" stroke-miterlimit="2.2"`;
  const S = (color, width, extra = "") => P(d, color, ` stroke="${color}" stroke-width="${width}" ${J}${extra}`);
  const embolden = 40; // thickens Graduate's stems to twill weight
  const navy1 = embolden + 46;
  const white = navy1 + 36;
  const navy2 = white + 32;
  const sh = 22; // drop shadow offset
  // stitch ring at offset `at` outside the glyph path: dashed band, then
  // the same layer colour re-laid inside it, leaving a thin dashed line
  const stitch = (at, layer, sw = 5) => [
    P(d, "none", ` stroke="${C.navy}" stroke-width="${2 * at + sw}" stroke-dasharray="11 8" ${J}`),
    S(layer, 2 * at - sw),
  ];
  return [
    // outer navy outline + drop shadow (down-right)
    `<g transform="translate(${sh} ${sh})">${S(C.ink, navy2)}</g>`,
    S(C.navy, navy2),
    S(C.white, white),
    S(C.navy, navy1),
    S(C.gold, embolden),
    // twill stitching just inside the gold edge
    ...stitch(embolden / 2 - 9, C.gold, 5),
  ];
}

// ───────────────────────────── crest ─────────────────────────────
function crestArt() {
  const font = loadFont("graduate/files/graduate-latin-400-normal.woff");
  const cx = 500;
  const cy = 500;
  const R = 470; // outer edge of the navy ring
  const rIn = 330; // inner field radius
  const ring = (r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra}/>`;
  const textR = (R + rIn) / 2;
  const size = 90;
  const capH = (font.tables.os2.sCapHeight / font.unitsPerEm) * size;
  const top = arcText(font, "NORTHGATE", { cx, cy, r: textR - capH / 2, size, tracking: 8, side: "top" });
  const bottom = arcText(font, "BULLDOGS", { cx, cy, r: textR + capH / 2, size, tracking: 10, side: "bottom" });
  const est = arcText(loadFont("big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff"), "EST. 1962", {
    cx, cy, r: rIn - 26, size: 36, tracking: 6, side: "bottom",
  });
  // bulldog scaled into the field
  const { layers } = bulldogArt("cr");
  const bs = 0.615;
  const bx = cx - 500 * bs;
  const by = cy - 540 * bs - 4;
  return [
    ring(R + 14, C.ink),
    ring(R, C.navy),
    ring(R - 16, "none", ` stroke="${C.gold}" stroke-width="7"`),
    ring(rIn + 16, C.white),
    ring(rIn + 8, C.ink),
    ring(rIn, C.gold),
    `<g transform="translate(${f(bx)} ${f(by)}) scale(${bs})">${layers.join("")}</g>`,
    P(top, C.gold),
    P(bottom, C.gold),
    P(est, C.navy),
    P(star(cx - textR, cy, 30), C.gold),
    P(star(cx + textR, cy, 30), C.gold),
  ];
}

function svgDoc(viewBox, body, title) {
  const [, , w, h] = viewBox.split(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}"><title>${title}</title>${body}</svg>\n`;
}

function write(name, viewBox, layers, title) {
  const svg = svgDoc(viewBox, layers.join(""), title);
  fs.writeFileSync(path.join(OUT, name), svg);
  return svg;
}

// ───────────────────────────── Chromium passes ─────────────────────────────
async function launch() {
  const { chromium } = await import("playwright");
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  let executablePath;
  try {
    const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-") && !d.includes("headless"));
    if (dir) executablePath = path.join(base, dir, "chrome-linux", "chrome");
  } catch {}
  return chromium.launch({ executablePath, args: ["--disable-gpu"] });
}

/** painted bounds (alpha > 8) of an SVG, in its own user units */
async function paintedBounds(page, svgText) {
  return page.evaluate(async (text) => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("SVG does not parse");
    const vb = doc.documentElement.getAttribute("viewBox").split(/\s+/).map(Number);
    const pad = 200;
    const big = [vb[0] - pad, vb[1] - pad, vb[2] + 2 * pad, vb[3] + 2 * pad];
    const S = 2400 / Math.max(big[2], big[3]);
    const W = Math.round(big[2] * S);
    const H = Math.round(big[3] * S);
    doc.documentElement.setAttribute("viewBox", big.join(" "));
    doc.documentElement.setAttribute("width", W);
    doc.documentElement.setAttribute("height", H);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: "image/svg+xml" }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++)
      for (let i = 0; i < W; i++)
        if (d[(y * W + i) * 4 + 3] > 8) {
          if (i < x0) x0 = i;
          if (i > x1) x1 = i;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return [big[0] + x0 / S, big[1] + y0 / S, big[0] + (x1 + 1) / S, big[1] + (y1 + 1) / S];
  }, svgText);
}

/** square viewBox centred on the painted bounds, `pad` units of air each side */
function squareBox([x0, y0, x1, y1], pad) {
  const side = Math.ceil(Math.max(x1 - x0, y1 - y0) + 2 * pad);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return `${Math.round(cx - side / 2)} ${Math.round(cy - side / 2)} ${side} ${side}`;
}

async function renderJpg(page, svgText, out, px = 1200) {
  const b64 = Buffer.from(svgText).toString("base64");
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<html><body style="margin:0;background:#FFFFFF"><img src="data:image/svg+xml;base64,${b64}" style="display:block;width:${px}px;height:${px}px"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  await page.screenshot({ path: out, type: "jpeg", quality: 85 });
}

fs.mkdirSync(OUT, { recursive: true });
const ART = [
  { name: "bulldog.svg", art: () => bulldogArt("bd").layers, box: "60 90 880 880", pad: 18, title: "Northgate Bulldogs - bulldog head" },
  { name: "monogram.svg", art: monogramArt, box: "0 0 1000 1000", pad: 30, title: "Northgate Bulldogs - N monogram" },
  { name: "crest.svg", art: crestArt, box: "0 0 1000 1000", pad: 10, title: "Northgate Bulldogs - crest" },
];
const svgs = {};
let browser = null;
try {
  browser = await launch();
} catch (e) {
  console.warn("Chromium unavailable — keeping default viewBoxes:", e.message);
}
const page = browser ? await browser.newPage() : null;
for (const a of ART) {
  const layers = a.art();
  let svg = write(a.name, a.box, layers, a.title);
  if (page) {
    const box = squareBox(await paintedBounds(page, svg), a.pad);
    svg = write(a.name, box, layers, a.title);
    console.log(`${a.name.padEnd(14)} viewBox ${box.padEnd(18)} ${(svg.length / 1024).toFixed(1)} KB`);
  } else console.log(`${a.name.padEnd(14)} ${(svg.length / 1024).toFixed(1)} KB`);
  svgs[a.name] = svg;
}
if (page && process.argv.includes("--jpg")) {
  const out = path.join(OUT, "bulldog-on-white.jpg");
  await renderJpg(page, svgs["bulldog.svg"], out, 1200);
  console.log(`bulldog-on-white.jpg ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
}
await browser?.close();
