// "Fast Break" — the logo at full speed. The crisp logo leads; behind it a stack of
// onion-skin ghost copies steps back in the team colours, the logo's own inks are pulled
// out into fading speed streaks (each streak band takes an ink from the row of the logo it
// trails from), and a few long tapered speed lines in the ghost colours fly out of it.
// Every layer is cut back by a thin knockout gap around the layer in front of it, the way a
// screen printer separates an echo graphic — so it reads on any garment colour.
//
// Structure (after halftone.js):
//   1. layout: the artwork (logo + trail) is fitted and centred as a whole — the logo shifts
//      forward along the direction of travel and shrinks only when the trail would not fit,
//      so nothing touches the canvas edge at any angle;
//   2. streaks are computed in a "motion frame" (a canvas rotated so travel = +x): one scan
//      per row finds the logo's trailing edge, typed-array writes, one putImageData, then
//      the frame is drawn back with the inverse transform;
//   3. ghosts, knockouts and the crisp logo are canvas draws of the source (no per-pixel
//      work); speed lines are vector paths in frame coordinates;
//   4. band / line layout comes from rng(seed) in 1024-units, so a 384 preview and a 2048
//      export match. Transparent background.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, hexToRgb, nearestColorIndex, rng, hashSeed,
  alphaMask, dilateMask, maskToCanvas,
} from "../core.js";
import { extractPalette } from "../image.js";

const PAD = 0.035;     // keep the artwork this far (× S) from the canvas edge
const TRAIL = 0.42;    // trail length at 100 % (× S, before fitting)
const GAP = 5;         // knockout gap between layers (1024-units)

/** Pixel bounds of alpha ≥ thr (0..255) in RGBA data. */
function alphaBounds(d, w, h, thr = 16) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0, j = y * w * 4 + 3; x < w; x++, j += 4) {
      if (d[j] >= thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Fill the holes of a mask in place (transparent areas not connected to the canvas border):
 * ghosts and knockouts use the outer silhouette, so nothing shows through a logo's
 * counters and line art reads as one solid shape.
 */
function fillHoles(mask, w, h) {
  const n = w * h;
  const outside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!outside[i] && mask[i] < 0.5) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  for (let i = 0; i < n; i++) if (!outside[i]) mask[i] = 1;
  return mask;
}

/** A flat-colour copy of a silhouette canvas. */
function tinted(sil, hex) {
  const c = createCanvas(sil.width, sil.height);
  const x = c.getContext("2d");
  x.drawImage(sil, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = hex;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Streak layer in the motion frame (FW×FH RGBA): for every row the logo's trailing (left)
 * edge is found and a band-coloured streak runs left from it, fading out.
 */
function streakLayer(fd, FW, FH, bands, L, inkAt) {
  const out = new Uint8ClampedArray(FW * FH * 4);
  const edge = new Int32Array(FH).fill(-1);
  const run = new Int32Array(FH);
  for (let y = 0; y < FH; y++) {
    const row = y * FW * 4 + 3;
    let x = 0;
    while (x < FW && fd[row + x * 4] < 128) x++;
    if (x >= FW) continue;
    edge[y] = x;
    let r = x;
    while (r < FW && fd[row + r * 4] >= 128) r++;
    run[y] = r - x;
  }
  for (const b of bands) {
    if (!b.on) continue;
    // the band's ink: sampled once, from the inked row nearest the band's centre
    const yc = Math.round(b.y + b.h / 2);
    let ys = -1;
    for (let k = 0; k <= b.h; k++) {
      if (yc - k >= 0 && yc - k < FH && edge[yc - k] >= 0) { ys = yc - k; break; }
      if (yc + k < FH && edge[yc + k] >= 0) { ys = yc + k; break; }
    }
    if (ys < 0) continue;
    const depth = Math.min(run[ys] - 1, Math.max(1.5, b.depth * Math.min(run[ys], FW * 0.25)));
    const [cr, cg, cb] = inkAt(edge[ys] + depth, ys);
    for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(FH, Math.ceil(b.y + b.h)); y++) {
      if (edge[y] < 0) continue;
      const v = ((y + 0.5 - b.y) / b.h) * 2 - 1;               // −1..1 across the band
      if (v <= -1 || v >= 1) continue;
      const Lr = L * b.len * Math.pow(1 - v * v, 0.35);         // rounded streak ends
      if (Lr < 2) continue;
      const xe = edge[y];
      const cover = clamp((1 - Math.abs(v)) * b.h * 0.5 + 0.25); // soft band edge (~1 px)
      const x0 = Math.max(0, Math.floor(xe - Lr));
      for (let x = xe + 2; x >= x0; x--) {
        const t = (xe - x) / Lr;
        const a = (t <= 0 ? 1 : 1 - Math.pow(t, 0.8)) * b.alpha * cover;
        if (a <= 0.004) continue;
        const o = (y * FW + x) * 4;
        out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; out[o + 3] = a * 255;
      }
    }
  }
  return out;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "speed",
  name: "Fast Break",
  category: "digital",
  blurb: "Your logo at full speed: ghost trail and speed streaks.",
  method: "Sublimation",
  stage: "paper",
  params: [
    { key: "angle", label: "Direction", type: "range", min: 0, max: 355, step: 5, default: 10, unit: "°" },
    { key: "length", label: "Streak length", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "ghosts", label: "Ghosts", type: "range", min: 0, max: 4, step: 1, default: 2 },
    { key: "lines", label: "Speed lines", type: "range", min: 0, max: 12, step: 1, default: 5 },
    { key: "colorA", label: "Ghost color A", type: "color", default: "secondary" },
    { key: "colorB", label: "Ghost color B", type: "color", default: "primary" },
  ],
  presets: [
    { name: "Fast break", params: { angle: 10, length: 60, ghosts: 2, lines: 5 } },
    { name: "Ghost trail", params: { angle: 0, length: 30, ghosts: 4, lines: 0 } },
    { name: "Warp", params: { angle: 0, length: 100, ghosts: 1, lines: 12 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const sd = getPixels(src).data;
    const bb = alphaBounds(sd, S, S);
    if (!bb) return out;
    const R = rng(hashSeed("speed", ctx.seed));

    // ── layout ──────────────────────────────────────────────────────────
    const th = (p.angle * Math.PI) / 180;
    const dx = Math.cos(th), dy = -Math.sin(th);            // direction of travel (canvas)
    const len = p.length / 100;
    const N = Math.round(p.ghosts);
    const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
    const L1 = len * TRAIL * S;
    const g1 = S * (0.026 + 0.03 * len);                    // ghost step
    const sweep1 = Math.max(L1, N * g1);
    const avail = S * (1 - 2 * PAD);
    const k = Math.min(1, avail / (bw + sweep1 * Math.abs(dx)), avail / (bh + sweep1 * Math.abs(dy)));
    const L = L1 * k, g = g1 * k, sweep = sweep1 * k;
    const bcx = (bb.x0 + bb.x1) / 2, bcy = (bb.y0 + bb.y1) / 2;
    let Cx = S / 2 + (sweep * dx) / 2, Cy = S / 2 + (sweep * dy) / 2;
    if (k === 1) { Cx = bcx + Math.round(Cx - bcx); Cy = bcy + Math.round(Cy - bcy); } // pixel-exact logo
    const placeLogo = (x, offX = 0, offY = 0) => {
      x.setTransform(k, 0, 0, k, Cx + offX - bcx * k, Cy + offY - bcy * k);
    };

    // the logo's outer silhouette (holes filled) for ghosts, and the knockout = that
    // silhouette grown by the gap (computed at ≤ 1024 px)
    const sil = maskToCanvas(fillHoles(alphaMask(src), S, S), S, S, "#000");
    const A = Math.min(S, 1024);
    const silA = A === S ? sil : resizeCanvas(sil, A, A);
    const gapA = (GAP * sc * A) / S / Math.max(0.6, k);
    const knock = maskToCanvas(dilateMask(alphaMask(silA), A, A, gapA), A, A, "#000");
    const knockAt = (offX, offY) => {
      o.save();
      o.globalCompositeOperation = "destination-out";
      o.imageSmoothingQuality = "high";
      o.setTransform((k * S) / A, 0, 0, (k * S) / A, Cx + offX - bcx * k, Cy + offY - bcy * k);
      o.drawImage(knock, 0, 0);
      o.restore();
    };

    // ── motion frame: rotated so travel = +x, trail room on the left ─────
    const hw = (bw * k) / 2, hh = (bh * k) / 2;
    const c = Math.abs(dx), s = Math.abs(dy);
    const ex = hw * c + hh * s, ey = hw * s + hh * c;
    const m = Math.ceil(4 * sc + 2);
    const FW = Math.ceil(L + 2 * ex + 2 * m), FH = Math.ceil(2 * ey + 2 * m);
    const fx0 = m + L + ex, fy0 = m + ey;
    // frame ← canvas: translate(fx0, fy0) · rotate(th) · translate(−C)
    const toCanvas = (x) => {   // canvas ← frame (inverse)
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.translate(Cx, Cy);
      x.rotate(-th);
      x.translate(-fx0, -fy0);
    };

    const frame = createCanvas(FW, FH);
    const fxc = ctx2d(frame);
    fxc.translate(fx0, fy0);
    fxc.rotate(th);
    fxc.scale(k, k);
    fxc.translate(-bcx, -bcy);
    fxc.imageSmoothingQuality = "high";
    fxc.drawImage(src, 0, 0);
    const fd = fxc.getImageData(0, 0, FW, FH).data;

    // the logo's major inks: streak colours snap to them (no anti-aliasing blends)
    const pal = extractPalette(resizeCanvas(src, Math.min(S, 256)), 6, { maxSamples: 8000 }).filter((q) => q.weight >= 0.05);
    const inkRGB = pal.map((q) => hexToRgb(q.hex));
    const inkAt = (x, y) => {
      const j = (Math.round(y) * FW + Math.max(0, Math.min(FW - 1, Math.round(x)))) * 4;
      const r = fd[j], gg = fd[j + 1], b = fd[j + 2];
      return inkRGB.length ? inkRGB[nearestColorIndex(r, gg, b, inkRGB)] : [r, gg, b];
    };

    // ── speed lines (back layer, vector, in frame coordinates) ───────────
    const nl = Math.round(p.lines);
    if (nl > 0 && L > 8 * sc) {
      // rows of the frame that carry ink, and their trailing edges
      const edgeOf = (y) => {
        const row = Math.round(y) * FW * 4 + 3;
        for (let x = 0; x < FW; x++) if (fd[row + x * 4] >= 128) return x;
        return -1;
      };
      const yTop = m + ey * 0.12, yBot = FH - m - ey * 0.12;
      const LR = rng(hashSeed("speed-lines", ctx.seed, nl));
      toCanvas(o);
      for (let i = 0; i < nl; i++) {
        const y = yTop + ((i + 0.15 + 0.7 * LR()) / nl) * (yBot - yTop);
        const xe = edgeOf(y);
        if (xe < 0) continue;
        const w = (2.2 + 4.5 * Math.pow(LR(), 1.5)) * sc * k;
        const x1 = xe + w * 3;                                   // starts under the logo
        const x0 = Math.max(m, xe - L * (0.55 + 0.5 * LR()) - S * 0.02 * k);
        o.fillStyle = i % 2 ? p.colorB : p.colorA;
        o.beginPath();
        o.moveTo(x0, y);
        o.lineTo(x1, y - w / 2);
        o.arc(x1, y, w / 2, -Math.PI / 2, Math.PI / 2);
        o.closePath();
        o.fill();
      }
      o.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ── streaks ──────────────────────────────────────────────────────────
    if (L > 4 * sc) {
      const bands = [];
      let y = 0;
      while (y < FH) {
        const h = (4 + 13 * Math.pow(R(), 1.4)) * sc * k;
        bands.push({
          y, h,
          on: R() < 0.66,
          len: 0.35 + 0.65 * Math.pow(R(), 0.6),
          depth: R(),
          alpha: 0.85 + 0.15 * R(),
        });
        y += h + (R() < 0.45 ? 0 : (1.5 + 4 * R()) * sc * k);
      }
      const layer = streakLayer(fd, FW, FH, bands, L, inkAt);
      const sl = createCanvas(FW, FH);
      ctx2d(sl).putImageData(new ImageData(layer, FW, FH), 0, 0);
      toCanvas(o);
      o.imageSmoothingQuality = "high";
      o.drawImage(sl, 0, 0);
      o.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ── ghosts (far → near), each cut back around the one in front ───────
    if (N > 0) {
      for (let j = N; j >= 1; j--) {
        const offX = -dx * g * j, offY = -dy * g * j;
        knockAt(offX, offY);
        // colours alternate A / B like a striped echo (an in-between mix of two team colours
        // is mud); the first two frames print solid, later onion-skin frames fade
        const col = j % 2 ? p.colorA : p.colorB;
        o.save();
        o.globalAlpha = j <= 2 ? 1 : 1 - 0.15 * (j - 2);
        placeLogo(o, offX, offY);
        o.imageSmoothingQuality = "high";
        o.drawImage(tinted(sil, col), 0, 0);
        o.restore();
      }
    }

    // ── the crisp logo on top ───────────────────────────────────────────
    knockAt(0, 0);
    o.save();
    placeLogo(o);
    o.imageSmoothingQuality = "high";
    o.drawImage(src, 0, 0);
    o.restore();
    return out;
  },
};
