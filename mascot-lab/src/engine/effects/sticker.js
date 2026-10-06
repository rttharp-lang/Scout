// "Sticker" — a die-cut vinyl sticker / slap tag. The logo sits on a smooth die-cut border
// (a morphological closing of the logo: grown, concavities bridged, holes filled), with a
// crisp cut edge, a soft drop shadow, a glossy diagonal highlight band across the whole
// sticker, an optional holographic border, an optional peeled corner (the lower-right of
// the border curls back to show the white backing, casting a shadow) and an optional tilt
// (auto-fitted so nothing leaves the canvas).
//
// Structure as halftone.js: distance fields at A (≈ W/2, upsampled — they interpolate
// cleanly), masks/colour at W = min(S, 1024), composition with canvas transforms at S.
// Transparent background, deterministic.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, hexToRgb, hslToRgb, mix,
  luminance, contrastRatio, insideDistance, outsideDistance, maskBounds, makeNoise2D, hashSeed,
  blurCanvas,
} from "../core.js";

const MARGIN = 10;         // units kept clear of the canvas edge

function upsample(m, A, W, mul = 1) {
  if (A === W && mul === 1) return m;
  const out = new Float32Array(W * W);
  const k = A / W;
  const xi = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const f = clamp((x + 0.5) * k - 0.5, 0, A - 1.001);
    xi[x] = f | 0; xf[x] = f - (f | 0);
  }
  for (let y = 0; y < W; y++) {
    const fy = clamp((y + 0.5) * k - 0.5, 0, A - 1.001);
    const y0 = fy | 0, ty = fy - y0, r0 = y0 * A, r1 = r0 + A, row = y * W;
    for (let x = 0; x < W; x++) {
      const i0 = xi[x], tx = xf[x];
      const a = m[r0 + i0], b = m[r0 + i0 + 1], c = m[r1 + i0], d = m[r1 + i0 + 1];
      out[row + x] = ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * mul;
    }
  }
  return out;
}

/** Fill enclosed holes (areas not connected to the border) of a binary-ish mask. */
function fillHoles(m, A) {
  const n = A * A;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && m[i] < 0.5) { out[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < A; x++) { push(x); push((A - 1) * A + x); }
  for (let y = 0; y < A; y++) { push(y * A); push(y * A + A - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % A;
    if (x > 0) push(i - 1);
    if (x < A - 1) push(i + 1);
    if (i >= A) push(i - A);
    if (i < n - A) push(i + A);
  }
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = out[i] ? m[i] : 1;
  return f;
}

/** Canvas whose alpha is `mask` (W×W) and colour `rgb` (or per-pixel `colorAt`). */
function paint(mask, W, rgb, colorAt) {
  const c = createCanvas(W, W);
  const x = ctx2d(c);
  const img = x.createImageData(W, W);
  const d = img.data;
  for (let i = 0, j = 0; i < W * W; i++, j += 4) {
    const a = mask[i];
    if (a <= 0.002) continue;
    if (colorAt) colorAt(i, d, j);
    else { d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; }
    d[j + 3] = a >= 1 ? 255 : a * 255 + 0.5;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export default {
  id: "sticker",
  name: "Sticker",
  category: "street",
  blurb: "Die-cut vinyl slap with a glossy finish and a peel.",
  method: "Heat transfer",
  stage: "mid",
  params: [
    { key: "border", label: "Border", type: "range", min: 6, max: 60, step: 1, default: 24, unit: "px" },
    { key: "edge", label: "Border color", type: "color", default: "accent" },
    { key: "holo", label: "Holo edge", type: "toggle", default: false },
    { key: "gloss", label: "Gloss", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "shadow", label: "Shadow", type: "range", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    { key: "peel", label: "Peeled corner", type: "toggle", default: false },
    { key: "tilt", label: "Tilt", type: "range", min: -15, max: 15, step: 1, default: 0, unit: "°" },
  ],
  presets: [
    { name: "Die-cut", params: { border: 24, edge: "accent", holo: false, gloss: 60, shadow: 50, peel: false, tilt: 0 } },
    { name: "Slap tag", params: { border: 40, edge: "accent", holo: false, gloss: 70, shadow: 60, peel: true, tilt: -8 } },
    { name: "Holo edge", params: { border: 30, edge: "accent", holo: true, gloss: 80, shadow: 45, peel: false, tilt: 0 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const W = Math.min(S, 1024);
    const A = W > 400 ? Math.round(W / 2) : Math.min(W, 256);
    const kW = W / S, kA = A / W;
    const u = sc * kW, uA = u * kA;
    const n = W * W, nA = A * A;

    /* ── 1. the die-cut shape: grow by border + c, fill holes, shrink by c ── */
    const small = W === S ? src : resizeCanvas(src, W, W);
    const smallA = A === W ? small : resizeCanvas(small, A, A);
    const ad = getPixels(smallA).data;
    const alphaA = new Float32Array(nA);
    for (let i = 0, j = 3; i < nA; i++, j += 4) alphaA[i] = ad[j] / 255;
    const r = p.border * uA;
    const c = (16 + p.border * 0.5) * uA;          // closing radius: bridges narrow gaps
    const d1 = outsideDistance(alphaA, A, A, 0.5);
    const grown = new Float32Array(nA);
    for (let i = 0; i < nA; i++) grown[i] = d1[i] - 0.5 <= r + c ? 1 : 0;
    const solid = fillHoles(grown, A);
    const d2 = upsample(insideDistance(solid, A, A, 0.5), A, W, 1 / kA); // W px from the outside
    const cW = c / kA;
    const shape = new Float32Array(n);
    for (let i = 0; i < n; i++) shape[i] = clamp(d2[i] - 0.5 - cW + 0.5);
    const sb = maskBounds(shape, W, W, 0.5);
    if (sb.empty) return createCanvas(S, S);

    /* ── 2. border colour (kept readable against the logo) + holo foil ── */
    let edgeHex = p.edge;
    {
      // average colour of the logo's outer rim: if the border would swallow it, swap
      const sd = getPixels(small).data;
      const near = upsample(d1, A, W, 1 / kA);
      let R = 0, G = 0, B = 0, wsum = 0;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const a = sd[j + 3] / 255;
        if (a < 0.5) continue;
        // rim = opaque pixels near the silhouette edge
        if (near[i] > 0) continue;
        const x = i % W, y = (i / W) | 0;
        const edge = (x > 2 && sd[j - 8 + 3] < 128) || (x < W - 3 && sd[j + 8 + 3] < 128) ||
          (y > 2 && sd[j - 8 * W + 3] < 128) || (y < W - 3 && sd[j + 8 * W + 3] < 128);
        if (!edge) continue;
        R += sd[j] * a; G += sd[j + 1] * a; B += sd[j + 2] * a; wsum += a;
      }
      if (wsum > 0 && !p.holo) {
        const rim = "#" + [R, G, B].map((v) => Math.round(v / wsum).toString(16).padStart(2, "0")).join("");
        if (contrastRatio(rim, edgeHex) < 1.45) {
          // first team colour that clearly separates from the rim, else the best of them
          const cands = [ctx.palette.primary, ctx.palette.secondary, ctx.palette.dark, "#FFFFFF"].filter(Boolean);
          edgeHex = cands.find((h) => contrastRatio(rim, h) >= 3) ||
            cands.sort((a, b) => contrastRatio(rim, b) - contrastRatio(rim, a))[0];
        }
      }
    }
    const edgeRGB = hexToRgb(edgeHex);
    const cx0 = (sb.x0 + sb.x1) / 2, cy0 = (sb.y0 + sb.y1) / 2;
    let colorAt = null;
    if (p.holo) {
      // iridescent foil: pastel hue sweeping around the sticker with a shimmering noise
      const noise = makeNoise2D(hashSeed("sticker-holo", ctx.seed));
      const hueLUT = new Uint8Array(360 * 3);
      for (let h = 0; h < 360; h++) {
        const rgb = hslToRgb(h, 0.72, 0.76);
        hueLUT[h * 3] = rgb[0]; hueLUT[h * 3 + 1] = rgb[1]; hueLUT[h * 3 + 2] = rgb[2];
      }
      colorAt = (i, d, j) => {
        const x = i % W, y = (i / W) | 0;
        const ang = Math.atan2(y - cy0, x - cx0);
        const nv = noise(x / (90 * u), y / (90 * u));
        let h = (ang * 57.2958 * 1.5 + (x + y) / u * 0.35 + nv * 80) % 360;
        if (h < 0) h += 360;
        const k = (h | 0) * 3;
        const sheen = 0.5 + 0.5 * Math.sin((x - y) / (7 * u) + nv * 3);
        d[j] = hueLUT[k] + (255 - hueLUT[k]) * sheen * 0.35;
        d[j + 1] = hueLUT[k + 1] + (255 - hueLUT[k + 1]) * sheen * 0.35;
        d[j + 2] = hueLUT[k + 2] + (255 - hueLUT[k + 2]) * sheen * 0.35;
      };
    }
    const base = paint(shape, W, edgeRGB, colorAt);

    // crisp cut edge: a hairline just inside the border edge
    const cut = new Float32Array(n);
    const lw = Math.max(0.8, 1.6 * u);
    for (let i = 0; i < n; i++) {
      const e = d2[i] - 0.5 - cW;               // px inside the cut
      if (e > 0 && e < lw + 1) cut[i] = clamp(e) * clamp(lw + 0.5 - e);
    }
    const edgeLine = paint(cut, W, hexToRgb(mix(edgeHex, "#000000", luminance(edgeHex) > 0.5 ? 0.22 : 0.45)));

    /* ── 3. the flat sticker at S: border, logo, cut line ── */
    const flat = createCanvas(S, S);
    const fx = ctx2d(flat);
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = "high";
    fx.drawImage(base, 0, 0, S, S);
    fx.drawImage(src, 0, 0);
    fx.drawImage(edgeLine, 0, 0, S, S);
    const silhouette = createCanvas(S, S);  // the sticker's outline (for shadow / gloss)
    const sx = ctx2d(silhouette);
    sx.imageSmoothingEnabled = true;
    sx.imageSmoothingQuality = "high";
    sx.drawImage(base, 0, 0, S, S);

    /* ── 4. peeled corner: fold the lower-right of the sticker back over itself ── */
    let flapLayer = null;
    if (p.peel) {
      const k = 1 / kW;
      // fold line perpendicular to the diagonal, ~a border's worth in from the corner
      // …folding mostly border: it may only reach a little way into the artwork
      let far = -Infinity, artFar = -Infinity;
      const sdA = getPixels(small).data;
      for (let y = sb.y0; y < sb.y1; y += 2) {
        for (let x = sb.x0; x < sb.x1; x += 2) {
          const i = y * W + x;
          if (shape[i] > 0.5) far = Math.max(far, x + y);
          if (sdA[i * 4 + 3] > 128) artFar = Math.max(artFar, x + y);
        }
      }
      const depth = Math.min((p.border * 1.5 + 70) * u, Math.max(far - artFar + 34 * u, 52 * u));
      const t = (far - depth) * k;                 // fold line: x + y = t (S px)
      // remove the corner from the sticker + its silhouette
      const cutCorner = (cv) => {
        const x = ctx2d(cv);
        x.save();
        x.globalCompositeOperation = "destination-out";
        // half-plane x + y > t
        x.beginPath();
        x.moveTo(t, 0); x.lineTo(S * 2, 0); x.lineTo(S * 2, S * 2); x.lineTo(0, S * 2); x.lineTo(0, t);
        x.closePath();
        x.fill();
        x.restore();
      };
      // the flap = the removed corner reflected across the fold line, foreshortened (curl)
      const flapShape = createCanvas(S, S);
      const fl = ctx2d(flapShape);
      // reflection across x + y = t: (x, y) → (t − y, t − x); then squash toward the fold
      const sq = 0.82;
      fl.save();
      // then squash toward the fold along n = (1,1)/√2 (q = a·p' + b·p'ᵀ + e):
      const a = 1 - (1 - sq) * 0.5, b = -(1 - sq) * 0.5, e = (1 - sq) * 0.5 * t;
      fl.setTransform(-b, -a, -a, -b, a * t + b * t + e, b * t + a * t + e);
      fl.drawImage(silhouette, 0, 0);
      fl.restore();
      // keep only what lands on the sticker side of the fold
      fl.globalCompositeOperation = "destination-in";
      fl.beginPath();
      fl.moveTo(0, 0); fl.lineTo(t, 0); fl.lineTo(0, t); fl.closePath();
      fl.fill();
      cutCorner(flat);
      cutCorner(silhouette);
      // backing paper look: white with a curl highlight band parallel to the fold
      flapLayer = createCanvas(S, S);
      const fz = ctx2d(flapLayer);
      // shadow the flap casts on the sticker, just inside the fold
      fz.save();
      const sh = blurCanvas(flapShape, 6 * sc);
      fz.globalAlpha = 0.45;
      fz.drawImage(sh, -5 * sc, -2 * sc);
      fz.globalCompositeOperation = "destination-in";
      fz.globalAlpha = 1;
      fz.drawImage(silhouette, 0, 0);
      fz.restore();
      const back = createCanvas(S, S);
      const bk = ctx2d(back);
      bk.drawImage(flapShape, 0, 0);
      bk.globalCompositeOperation = "source-in";
      const g = bk.createLinearGradient(t / 2, t / 2, (t - depth * k) / 2, (t - depth * k) / 2);
      g.addColorStop(0, "#C9CDD3");
      g.addColorStop(0.18, "#FFFFFF");
      g.addColorStop(0.45, "#F1F2F4");
      g.addColorStop(1, "#D6D9DE");
      bk.fillStyle = g;
      bk.fillRect(0, 0, S, S);
      bk.globalCompositeOperation = "source-over";
      // a fine edge on the flap so it reads on white garments
      const edgeC = createCanvas(S, S);
      const ec = ctx2d(edgeC);
      ec.drawImage(flapShape, 0, 0);
      ec.globalCompositeOperation = "source-in";
      ec.fillStyle = "rgba(0,0,0,0.25)";
      ec.fillRect(0, 0, S, S);
      fz.drawImage(edgeC, 0.8 * sc, 0.8 * sc);
      fz.drawImage(back, 0, 0);
    }

    /* ── 5. tilt + auto-fit, shadow, gloss ── */
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    const th = (p.tilt * Math.PI) / 180;
    const ccx = (cx0 / kW), ccy = (cy0 / kW);
    // rotated bounding box of the sticker → scale so it (and its shadow) stays inside
    const hw = (sb.x1 - sb.x0) / kW / 2, hh = (sb.y1 - sb.y0) / kW / 2;
    const rw = Math.abs(hw * Math.cos(th)) + Math.abs(hh * Math.sin(th));
    const rh = Math.abs(hw * Math.sin(th)) + Math.abs(hh * Math.cos(th));
    const shadowReach = (6 + 20 * p.shadow / 100) * sc;
    const room = S / 2 - MARGIN * sc - shadowReach;
    const fit = Math.min(1, room / Math.max(rw, rh, 1));
    const place = (x) => {
      x.translate(S / 2, S / 2);
      x.rotate(th);
      x.scale(fit, fit);
      x.translate(-ccx, -ccy);
    };
    const drawPlaced = (dst, cv) => {
      const x = ctx2d(dst);
      x.save();
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "high";
      place(x);
      x.drawImage(cv, 0, 0);
      x.restore();
    };
    const sil = createCanvas(S, S);
    drawPlaced(sil, silhouette);
    if (flapLayer) {
      const fsil = createCanvas(S, S);
      drawPlaced(fsil, flapLayer);
      ctx2d(sil).drawImage(fsil, 0, 0);
    }
    if (p.shadow > 0) {
      const amt = p.shadow / 100;
      // soft drop shadow + a tighter contact shadow
      const soft = blurCanvas(sil, (4 + 9 * amt) * sc);
      const tight = blurCanvas(sil, 2.2 * sc);
      const tint = (cv) => {
        const x = ctx2d(cv);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = "#06080B";
        x.fillRect(0, 0, S, S);
        return cv;
      };
      o.globalAlpha = 0.42 * amt + 0.08;
      o.drawImage(tint(soft), (3 + 4 * amt) * sc, (5 + 8 * amt) * sc);
      o.globalAlpha = 0.3 * amt + 0.1;
      o.drawImage(tint(tight), 1.2 * sc, 2 * sc);
      o.globalAlpha = 1;
    }
    drawPlaced(out, flat);
    if (flapLayer) drawPlaced(out, flapLayer);

    if (p.gloss > 0) {
      const amt = p.gloss / 100;
      const gl = createCanvas(S, S);
      const gx = ctx2d(gl);
      // a broad diagonal band through the upper-left third + a thin sharp streak beside it
      const x0 = S * 0.18, y0 = S * 0.18, x1 = S * 0.62, y1 = S * 0.62;
      const g = gx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.2, `rgba(255,255,255,${0.12 * amt})`);
      g.addColorStop(0.29, `rgba(255,255,255,${0.55 * amt})`);
      g.addColorStop(0.42, `rgba(255,255,255,${0.4 * amt})`);
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(0.565, "rgba(255,255,255,0)");
      g.addColorStop(0.585, `rgba(255,255,255,${0.5 * amt})`);
      g.addColorStop(0.61, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      gx.fillStyle = g;
      gx.fillRect(0, 0, S, S);
      // vinyl sheen: a touch lighter top-left, a touch darker bottom-right
      const v = gx.createLinearGradient(0, 0, S, S);
      v.addColorStop(0, `rgba(255,255,255,${0.1 * amt})`);
      v.addColorStop(0.5, "rgba(255,255,255,0)");
      v.addColorStop(1, `rgba(0,0,0,${0.12 * amt})`);
      gx.fillStyle = v;
      gx.fillRect(0, 0, S, S);
      gx.globalCompositeOperation = "destination-in";
      const only = createCanvas(S, S);
      drawPlaced(only, silhouette);
      gx.drawImage(only, 0, 0);
      o.drawImage(gl, 0, 0);
    }
    return out;
  },
};
