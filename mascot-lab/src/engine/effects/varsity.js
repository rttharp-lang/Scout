// "Varsity" — classic athletic lettering applied to the whole logo: stacked outlines
// (outline 1 in the secondary, outline 2 in white/accent, a dark keyline), a crisp 3-D
// block extrusion with lit/shaded side faces, and an optional tackle-twill finish
// (diagonal twill weave on every layer, zigzag stitching straddling each layer edge,
// a hairline of shadow where a layer sits on the one below).
//
// How it is built (same structure as halftone.js):
//   1. one signed distance field of the logo at W ≤ 1024 → every outline is a level set;
//   2. the extrusion is a directional min-filter of that field (exact distance to the
//      swept shape, so its edges anti-alias), its faces come from a ray-march DP that
//      carries the normal of the first edge each ray meets (correct face visibility);
//   3. one per-pixel pass at S samples the fields bilinearly (crisp edges at 2048) and
//      composites extrusion → keyline → outline 2 → outline 1 → the logo itself;
//   4. stitches are vector zigzags along traced level-set contours.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, alphaMask, signedDistance, traceContours,
  clamp, smoothstep, hexToRgb, lighten, darken, mix, luminance, contrastRatio, makeNoise2D, hashSeed,
} from "../core.js";

const KEYLINE = 7;      // dark outer keyline width (px @1024)
const BIG = 1e6;

/* ───────────────────────────── fields ───────────────────────────── */

/** out[p] = min(a[p], a(p − (dx, dy))) with a bilinear sample (constant weights); outside → BIG. */
function shiftMin(a, W, dx, dy, out) {
  const ox = Math.floor(-dx), oy = Math.floor(-dy);
  const tx = -dx - ox, ty = -dy - oy;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  for (let y = 0; y < W; y++) {
    const y0 = y + oy, y1 = y0 + 1;
    const r0 = y0 >= 0 && y0 < W ? y0 * W : -1;
    const r1 = y1 >= 0 && y1 < W ? y1 * W : -1;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const x0 = x + ox, x1 = x0 + 1;
      const okx0 = x0 >= 0 && x0 < W, okx1 = x1 >= 0 && x1 < W;
      const v00 = r0 >= 0 && okx0 ? a[r0 + x0] : BIG;
      const v10 = r0 >= 0 && okx1 ? a[r0 + x1] : BIG;
      const v01 = r1 >= 0 && okx0 ? a[r1 + x0] : BIG;
      const v11 = r1 >= 0 && okx1 ? a[r1 + x1] : BIG;
      const s = v00 * w00 + v10 * w10 + v01 * w01 + v11 * w11;
      const v = a[row + x];
      out[row + x] = s < v ? s : v;
    }
  }
  return out;
}

/** e(p) = min over t ∈ [0, len] of f(p − t·u): distance field of the shape swept along u. */
function sweepMin(f, W, ux, uy, len) {
  let cur = new Float32Array(f);
  if (!(len > 0.25)) return cur;
  let nxt = new Float32Array(f.length);
  let span = 0, step = 1;
  while (span < len - 1e-3) {
    const sh = Math.min(step, len - span, Math.max(1, span));
    shiftMin(cur, W, ux * sh, uy * sh, nxt);
    const t = cur; cur = nxt; nxt = t;
    span += sh;
    step = span;
  }
  return cur;
}

/**
 * Visible side faces of the extrusion: march every ray backwards (−u) until it enters
 * the shape (sd < 0) and carry that edge's outward normal. Raster DP, one pass.
 * → { nx, ny } (0,0 where no face).
 */
function faceNormals(sd, W, ux, uy, len) {
  const n = W * W;
  const t = new Float32Array(n).fill(BIG);
  const nx = new Float32Array(n), ny = new Float32Array(n);
  const m = Math.max(Math.abs(ux), Math.abs(uy));
  const vx = ux / m, vy = uy / m, vl = 1 / m; // step with a unit major component
  const sx = vx >= 0 ? 1 : -1, sy = vy >= 0 ? 1 : -1;
  const yMajor = Math.abs(vy) >= Math.abs(vx);
  const xs = sx > 0 ? 0 : W - 1, xe = sx > 0 ? W : -1;
  const ys = sy > 0 ? 0 : W - 1, ye = sy > 0 ? W : -1;
  const limit = len + 2;
  for (let y = ys; y !== ye; y += sy) {
    for (let x = xs; x !== xe; x += sx) {
      const i = y * W + x;
      if (sd[i] < 0) {
        t[i] = 0;
        const xa = x > 0 ? x - 1 : x, xb = x < W - 1 ? x + 1 : x;
        const ya = y > 0 ? y - 1 : y, yb = y < W - 1 ? y + 1 : y;
        let gx = sd[y * W + xb] - sd[y * W + xa], gy = sd[yb * W + x] - sd[ya * W + x];
        const gl = Math.hypot(gx, gy) || 1;
        nx[i] = gx / gl; ny[i] = gy / gl;
        continue;
      }
      // previous sample along the ray: p − v
      let ia, ib, f;
      if (yMajor) {
        const py = y - sy;
        if (py < 0 || py >= W) continue;
        const fx = x - vx, x0 = Math.floor(fx);
        f = fx - x0;
        if (x0 < 0 || x0 + 1 >= W) continue;
        ia = py * W + x0; ib = ia + 1;
      } else {
        const px = x - sx;
        if (px < 0 || px >= W) continue;
        const fy = y - vy, y0 = Math.floor(fy);
        f = fy - y0;
        if (y0 < 0 || y0 + 1 >= W) continue;
        ia = y0 * W + px; ib = ia + W;
      }
      const ta = t[ia], tb = t[ib];
      if (ta >= BIG && tb >= BIG) continue;
      let k;
      if (ta >= BIG) k = ib; else if (tb >= BIG) k = ia; else k = f < 0.5 ? ia : ib;
      const tt = (ta < BIG && tb < BIG ? ta + (tb - ta) * f : t[k]) + vl;
      if (tt > limit) continue;
      t[i] = tt;
      if (ta < BIG && tb < BIG) {
        const ax = nx[ia] + (nx[ib] - nx[ia]) * f, ay = ny[ia] + (ny[ib] - ny[ia]) * f;
        const al = Math.hypot(ax, ay) || 1;
        nx[i] = ax / al; ny[i] = ay / al;
      } else { nx[i] = nx[k]; ny[i] = ny[k]; }
    }
  }
  return { nx, ny };
}

/** Average color of the logo's outermost band (what a twill stitch on its edge would match). */
function edgeColor(data, sd, W, kS, S) {
  let r = 0, g = 0, b = 0, c = 0;
  for (let y = 0; y < W; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const d = sd[y * W + x];
      if (d > -0.5 || d < -4) continue;
      const xs = Math.min(S - 1, Math.round(x / kS)), ys = Math.min(S - 1, Math.round(y / kS));
      const j = (ys * S + xs) * 4;
      if (data[j + 3] < 200) continue;
      r += data[j]; g += data[j + 1]; b += data[j + 2]; c++;
    }
  }
  return c ? [r / c, g / c, b / c] : [20, 20, 20];
}

/* ───────────────────────────── stitches ───────────────────────────── */

/** Zigzag stitch path along closed polylines (W px → S px by `k`). */
function zigzagPath(contours, k, amp, pitch) {
  const p = new Path2D();
  const half = pitch / 2;
  for (const c0 of contours) {
    const m = c0.length;
    if (m < 3) continue;
    const c = c0.map(([x, y]) => [x * k, y * k]);
    let L = 0;
    const seg = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const a = c[i], b = c[(i + 1) % m];
      seg[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L += seg[i];
    }
    if (L < pitch * 5) continue;
    const steps = Math.max(6, Math.round(L / half) & ~1); // even → closes cleanly
    const h = L / steps;
    let si = 0, acc = 0;
    for (let s = 0; s < steps; s++) {
      const at = s * h;
      while (si < m - 1 && acc + seg[si] < at) { acc += seg[si]; si++; }
      const a = c[si], b = c[(si + 1) % m];
      const ln = seg[si] || 1;
      const u = clamp((at - acc) / ln);
      // local normal from a smoothed tangent (neighbouring segments)
      const pa = c[(si - 1 + m) % m], pb = c[(si + 2) % m];
      const tx = (b[0] - a[0]) / ln + (pb[0] - pa[0]) * 0.15 / ln, ty = (b[1] - a[1]) / ln + (pb[1] - pa[1]) * 0.15 / ln;
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const side = s & 1 ? amp : -amp;
      const x = a[0] + (b[0] - a[0]) * u + nx * side, y = a[1] + (b[1] - a[1]) * u + ny * side;
      if (s === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
  }
  return p;
}

/** Draw thread stitches: soft shadow, thread body, a thin sheen line toward the light. */
function drawStitches(o, path, color, lw, scale) {
  const [r, g, b] = color;
  const hex = "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  o.save();
  o.lineJoin = "round";
  o.lineCap = "round";
  o.translate(0.45 * scale + 0.2, 0.65 * scale + 0.25);
  o.strokeStyle = "rgba(0,0,0,0.3)";
  o.lineWidth = lw * 1.15;
  o.stroke(path);
  o.restore();
  o.save();
  o.lineJoin = "round";
  o.lineCap = "round";
  o.strokeStyle = lum > 0.75 ? darken(hex, 0.08) : lum < 0.2 ? lighten(hex, 0.08) : hex;
  o.lineWidth = lw;
  o.stroke(path);
  o.translate(-0.22 * lw, -0.28 * lw);
  o.strokeStyle = lum > 0.6 ? "rgba(255,255,255,0.8)" : `rgba(255,255,255,${0.2 + 0.25 * (1 - lum)})`;
  o.lineWidth = lw * 0.4;
  o.stroke(path);
  o.restore();
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "varsity",
  name: "Varsity",
  category: "retro",
  blurb: "Stacked athletic outlines with a crisp 3-D block shadow.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "outline1", label: "Outline 1", type: "range", min: 0, max: 32, step: 1, default: 14, unit: "px" },
    { key: "outline2", label: "Outline 2", type: "range", min: 0, max: 24, step: 1, default: 10, unit: "px" },
    { key: "depth", label: "3-D depth", type: "range", min: 0, max: 60, step: 1, default: 30, unit: "px" },
    { key: "angle", label: "3-D angle", type: "range", min: 0, max: 180, step: 5, default: 45, unit: "°" },
    { key: "color1", label: "Outline 1 color", type: "color", default: "secondary" },
    { key: "color2", label: "Outline 2 color", type: "color", default: "accent" },
    { key: "twill", label: "Tackle twill", type: "toggle", default: false },
  ],
  presets: [
    { name: "Varsity", params: { outline1: 14, outline2: 10, depth: 30, angle: 45, color1: "secondary", color2: "accent", twill: false } },
    { name: "Pro block", params: { outline1: 0, outline2: 12, depth: 54, angle: 40, color1: "secondary", color2: "accent", twill: false } },
    { name: "Tackle twill", params: { outline1: 16, outline2: 14, depth: 14, angle: 45, color1: "secondary", color2: "accent", twill: true } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const scale = ctx.scale;
    const W = Math.min(S, 1024);
    const kS = W / S;            // S px → W px
    const toS = S / W;

    const small = W === S ? src : resizeCanvas(src, W, W);
    const mask = alphaMask(small);
    const sd = signedDistance(mask, W, W); // W px, negative inside

    // band radii (S px) — outline widths are in px @1024
    const r1 = p.outline1 * scale;
    const r2 = r1 + p.outline2 * scale;
    const r3 = r2 + KEYLINE * scale;
    const depth = p.depth * scale;
    const th = (p.angle * Math.PI) / 180;
    const ux = Math.cos(th), uy = Math.sin(th);

    // the outer shape (everything incl. keyline) at W, its swept version and side faces
    const n = W * W;
    const r3W = r3 * kS;
    const outer = new Float32Array(n);
    for (let i = 0; i < n; i++) outer[i] = sd[i] - r3W;
    const depthW = depth * kS;
    const swept = depthW > 0.25 ? sweepMin(outer, W, ux, uy, depthW) : outer;
    const faces = depthW > 0.25 ? faceNormals(outer, W, ux, uy, depthW) : null;

    // colors
    const dark = ctx.palette.dark || "#0B0D10";
    // smart outlines: if outline 1 would vanish against the logo's own edge color, swap the
    // two outline colors (white logo + white outline 1 would read as one blob)
    const srcImg = getPixels(src);
    const sdat = srcImg.data;
    const edge = edgeColor(sdat, sd, W, kS, S);
    let col1 = p.color1, col2 = p.color2;
    // a near-black outline 1 (a red/black team's "secondary") would merge with the black
    // 3-D face and the team colour would never show: the team's primary takes it instead
    const prim = ctx.palette?.primary;
    if (luminance(col1) < 0.05 && contrastRatio(col1, dark) < 1.3 && prim && contrastRatio(prim, dark) >= 1.6) col1 = prim;
    const edgeHex = "#" + edge.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const firstIs1 = p.outline1 > 0;
    const first = firstIs1 ? col1 : col2, other = firstIs1 ? col2 : col1;
    if ((p.outline1 > 0 || p.outline2 > 0) && contrastRatio(edgeHex, first) < 1.3 && contrastRatio(edgeHex, other) >= 1.3) [col1, col2] = [col2, col1];
    const c1 = hexToRgb(col1), c2 = hexToRgb(col2), c3 = hexToRgb(dark);
    const darkIsDark = luminance(dark) < 0.25;
    const faceLo = hexToRgb(darkIsDark ? dark : darken(dark, 0.18));
    const faceHi = hexToRgb(darkIsDark ? mix(lighten(dark, 0.16), col1, 0.08) : dark);
    // light for the side faces: from the upper right, so right-facing faces read lighter
    const FLx = 0.78, FLy = -0.62;

    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const d = img.data;

    // twill weave (per pixel, phase LUT) + layer shadow offset
    const twill = !!p.twill;
    const P = Math.max(2.6, 4.8 * scale);
    const LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const ph = i / 256;
      // asymmetric rib: a soft ridge with a sharper fall, like a 2/1 twill wale
      const v = Math.sin(ph * Math.PI * 2) * 0.6 + Math.sin(ph * Math.PI * 4 + 0.6) * 0.25;
      LUT[i] = v;
    }
    const twAmp = twill ? (S < 600 ? 0.045 : 0.065) : 0;
    const noise = twill ? makeNoise2D(hashSeed("varsity-twill", ctx.seed)) : null;
    const nf = 1 / Math.max(6, 18 * scale);
    const offx = Math.max(1, 2.2 * scale) * kS, offy = Math.max(1, 2.8 * scale) * kS;

    const fast = W === S;
    const sample = (map, xw, yw) => {
      if (xw < 0) xw = 0; else if (xw > W - 1) xw = W - 1;
      if (yw < 0) yw = 0; else if (yw > W - 1) yw = W - 1;
      const x0 = xw | 0, y0 = yw | 0;
      const x1 = x0 < W - 1 ? x0 + 1 : x0, y1 = y0 < W - 1 ? y0 + 1 : y0;
      const fx = xw - x0, fy = yw - y0;
      const a = map[y0 * W + x0], b = map[y0 * W + x1], c = map[y1 * W + x0], e = map[y1 * W + x1];
      return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
    };
    const layerOf = (dd) => (dd < 0 ? 4 : dd < r1 ? 3 : dd < r2 ? 2 : dd < r3 ? 1 : 0);

    for (let y = 0; y < S; y++) {
      const yw = (y + 0.5) * kS - 0.5;
      for (let x = 0; x < S; x++) {
        const i = y * S + x, j = i * 4;
        const xw = (x + 0.5) * kS - 0.5;
        let dd, ee, iw = 0;
        if (fast) { iw = i; dd = sd[i]; ee = swept[i] + r3W; }
        else { dd = sample(sd, xw, yw) * toS; ee = (sample(swept, xw, yw) + r3W) * toS; }
        if (!fast) dd = dd; // (S px already)
        const sa = sdat[j + 3] / 255;
        const aExt = clamp(r3 - ee + 0.5);
        if (aExt <= 0 && sa <= 0) continue;
        // premultiplied accumulation, bottom layer first
        let R = 0, G = 0, B = 0, A = 0;
        if (aExt > 0) {
          let fr = faceLo[0], fg = faceLo[1], fb = faceLo[2];
          if (faces) {
            let fxn, fyn;
            if (fast) { fxn = faces.nx[iw]; fyn = faces.ny[iw]; }
            else {
              const xi = Math.min(W - 1, Math.max(0, Math.round(xw))), yi = Math.min(W - 1, Math.max(0, Math.round(yw)));
              fxn = faces.nx[yi * W + xi]; fyn = faces.ny[yi * W + xi];
            }
            const s = smoothstep(-0.35, 0.75, fxn * FLx + fyn * FLy);
            fr += (faceHi[0] - fr) * s; fg += (faceHi[1] - fg) * s; fb += (faceHi[2] - fb) * s;
          }
          R = fr * aExt; G = fg * aExt; B = fb * aExt; A = aExt;
        }
        const a3 = clamp(r3 - dd + 0.5), a2 = clamp(r2 - dd + 0.5), a1 = clamp(r1 - dd + 0.5);
        if (a3 > 0) { const q = 1 - a3; R = R * q + c3[0] * a3; G = G * q + c3[1] * a3; B = B * q + c3[2] * a3; A = A * q + a3; }
        if (a2 > 0 && r2 > r1) { const q = 1 - a2; R = R * q + c2[0] * a2; G = G * q + c2[1] * a2; B = B * q + c2[2] * a2; A = A * q + a2; }
        if (a1 > 0 && r1 > 0) { const q = 1 - a1; R = R * q + c1[0] * a1; G = G * q + c1[1] * a1; B = B * q + c1[2] * a1; A = A * q + a1; }
        if (sa > 0) { const q = 1 - sa; R = R * q + sdat[j] * sa; G = G * q + sdat[j + 1] * sa; B = B * q + sdat[j + 2] * sa; A = A * q + sa; }
        if (A <= 0) continue;
        let m = 1 / A;
        if (twill) {
          // fabric: diagonal twill wale + a little slub noise; each layer casts a hairline
          // shadow onto the one below it (down-right)
          const ph = ((x + y) / P) % 1;
          const slub = noise(x * nf, y * nf * 0.35);
          m *= 1 + twAmp * LUT[(ph * 256) | 0] + 0.035 * slub;
          const here = layerOf(dd);
          const ddo = (fast ? sample(sd, x - offx, y - offy) : sample(sd, xw - offx, yw - offy) * toS);
          const above = layerOf(ddo);
          if (above > here) m *= here === 0 ? 0.86 : 0.8;
        }
        d[j] = R * m; d[j + 1] = G * m; d[j + 2] = B * m;
        d[j + 3] = A * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);

    if (twill) {
      // zigzag stitches straddling each layer's edge, in that layer's thread color
      const neg = new Float32Array(n);
      for (let i = 0; i < n; i++) neg[i] = -sd[i];
      const lw = Math.max(0.8, 1.4 * scale);
      const amp = Math.max(1.1, 2.8 * scale), pitch = Math.max(2.4, 4.6 * scale);
      const levels = [
        { at: 0, color: edge, room: Infinity },
        { at: r1, color: c1, room: p.outline1 },
        { at: r2, color: c2, room: p.outline2 },
      ];
      for (const L of levels) {
        if (L.room < 5) continue;
        const contours = traceContours(neg, W, W, -(L.at - 0.5 * scale) * kS, 0.6);
        drawStitches(o, zigzagPath(contours, toS, Math.min(amp, (L.room * scale) * 0.42), pitch), L.color, lw, scale);
      }
      // the outer edge of the dark layer (keyline + block shadow)
      const negE = new Float32Array(n);
      for (let i = 0; i < n; i++) negE[i] = -swept[i];
      const contours = traceContours(negE, W, W, 2.4 * scale * kS, 0.6);
      drawStitches(o, zigzagPath(contours, toS, Math.min(amp, 2.6 * scale), pitch), c3, lw, scale);
    }
    return out;
  },
};
