// "Film Burn" — the logo on a burnt 35 mm frame. Warm light leaks wash in from one side
// (screened over the art, held to a halo around it), red halation glows at the edges,
// dust specks and vertical scratches catch the light, and optionally a charred burn hole
// eats into the art from that side with a glowing ember edge.
//
//   leak     → 2–3 big soft light sources off the chosen side, broken up by fbm, mapped
//              through a leak LUT (golden hour / burn / prism fringe / VHS streak);
//   halation → the silhouette blurred twice, in film red, added behind the art;
//   dust     → seeded specks + a few 1-px vertical scratches, inside the art's halo;
//   burn     → an fbm-ragged front from the side: transparent hole, charred rim, ember edge.
//
// Fields live on a grid of ≈ S/2 and are smoothly upscaled. Transparent background,
// deterministic (seeded noise / dust).
import {
  createCanvas, ctx2d, clamp, smoothstep, makeNoise2D, fbm, gradientLUT, blurMask, dilateMask,
  maskBounds, maskToCanvas, rng, hashSeed,
} from "../core.js";
import { alphaAt, squircleWindow, SPECTRA } from "../fx/light.js";

const TAU = Math.PI * 2;

const LEAKS = {
  golden: { stops: [["#7A0F1E", 0], ["#C8102E", 0.18], ["#FF5E1A", 0.42], ["#FFB347", 0.68], ["#FFE2A8", 0.88], ["#FFF8E8", 1]], hal: "#FF3B1F", warm: "#FFB347" },
  burn: { stops: [["#3A0505", 0], ["#9E0F0F", 0.22], ["#E8350E", 0.45], ["#FF7A1A", 0.68], ["#FFC46B", 0.88], ["#FFF1D6", 1]], hal: "#FF2A12", warm: "#FF6A1A" },
  prism: { stops: [["#5B1AFF", 0], ["#E0309A", 0.25], ["#FF5E3A", 0.45], ["#FFD23B", 0.62], ["#5CFFB0", 0.78], ["#5CD8FF", 0.9], ["#F4F8FF", 1]], hal: "#FF3B6B", warm: "#FF8AD0" },
  vhs: { stops: [["#2A0B6E", 0], ["#B01AFF", 0.25], ["#FF2E97", 0.5], ["#FF9AD5", 0.7], ["#8AF4FF", 0.88], ["#FFFFFF", 1]], hal: "#FF2E6B", warm: "#7ADFFF" },
};

/** Unit direction the light comes FROM, and a perpendicular. */
function sideDir(side) {
  switch (side) {
    case "right": return [1, 0];
    case "top": return [0, -1];
    case "corner": return [-0.7071, -0.7071];
    default: return [-1, 0];
  }
}

/* ───────────────────────────── fields ───────────────────────────── */

/**
 * Leak intensity 0–1 on the N grid: a few large soft sources off the art's `side`,
 * broken up by fbm; VHS stretches them into horizontal streaks.
 */
function leakField(N, bb, side, seed, vhs) {
  const r = rng(seed);
  const noise = makeNoise2D(seed + 5);
  const [dx, dy] = sideDir(side);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
  const px = -dy, py = dx;                                    // along the side
  const src = [];
  const n = 2 + (r() < 0.5 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const along = (r() - 0.5) * span * 0.9;
    const out = span * (0.42 + 0.22 * r());
    src.push({
      x: cx + dx * out + px * along, y: cy + dy * out + py * along,
      R: span * (0.55 + 0.35 * r()), w: 0.65 + 0.45 * r(),
    });
  }
  const f = 2.2 / Math.max(8, span);
  const I = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const s of src) {
        let ex = (x - s.x) / s.R, ey = (y - s.y) / s.R;
        if (vhs) { ex *= 0.45; ey *= 2.4; }
        v += s.w * Math.exp(-(ex * ex + ey * ey) * 1.6);
      }
      const m = 0.7 + 0.55 * fbm(noise, x * f, y * f * (vhs ? 3 : 1), 3);
      I[y * N + x] = clamp(v * m);
    }
  }
  return I;
}

/** Burn front: 0..1 progress toward the side (+ fbm ragged), → value < 0 = burnt. */
function burnField(N, bb, side, seed) {
  const noise = makeNoise2D(seed + 99);
  const [dx, dy] = sideDir(side);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
  const f = 3.2 / Math.max(8, span);
  const B = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // distance from the burnt side, in spans (0 = the art's far edge on that side)
      const t = ((x - cx) * dx + (y - cy) * dy) / span;          // −0.5 … +0.5 across the art
      const rag = fbm(noise, x * f, y * f, 4) * 0.16 + fbm(noise, x * f * 3.1 + 9, y * f * 3.1, 2) * 0.04;
      B[y * N + x] = 0.24 - t + rag;                                // < 0 → burnt away (≈ 26% of the art)
    }
  }
  return B;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "filmburn",
  name: "Film Burn",
  category: "metal",
  blurb: "Your logo on a burnt film frame: light leaks and dust.",
  method: "Sublimation",
  stage: "dark",
  params: [
    {
      key: "leak", label: "Leak", type: "select", default: "golden",
      options: [
        { value: "golden", label: "Golden hour" },
        { value: "burn", label: "Film burn" },
        { value: "prism", label: "Prism leak" },
        { value: "vhs", label: "VHS flare" },
      ],
    },
    { key: "strength", label: "Strength", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    {
      key: "side", label: "Light from", type: "select", default: "left",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
        { value: "top", label: "Top" },
        { value: "corner", label: "Corner" },
      ],
    },
    { key: "dust", label: "Dust", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    { key: "halation", label: "Halation", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    { key: "burn", label: "Burn hole", type: "toggle", default: false },
  ],
  presets: [
    { name: "Golden hour", params: { leak: "golden", strength: 65, side: "left", dust: 40, halation: 50, burn: false } },
    { name: "Film burn", params: { leak: "burn", strength: 70, side: "right", dust: 55, halation: 55, burn: true } },
    { name: "Prism leak", params: { leak: "prism", strength: 60, side: "corner", dust: 30, halation: 40, burn: false } },
    { name: "VHS flare", params: { leak: "vhs", strength: 60, side: "top", dust: 25, halation: 45, burn: false } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const N = Math.max(160, Math.min(512, Math.round(S / 2)));
    const kN = N / S;
    const u = sc * kN;                              // 1024-units → grid px
    const k = p.strength / 100, dust = p.dust / 100, hal = p.halation / 100;
    const L = LEAKS[p.leak] || LEAKS.golden;
    const vhs = p.leak === "vhs";
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";

    const mask = alphaAt(src, N);
    const bb = maskBounds(mask, N, N, 0.3);
    if (bb.empty) return out;
    const seed = hashSeed("filmburn", ctx.seed, p.side) >>> 0;
    const win = squircleWindow(N, 0.8, 0.97);

    /* the art's halo: where leaks, dust and the frame's light live */
    const halo = blurMask(dilateMask(mask, N, N, 20 * u), N, N, 6 * u);
    for (let i = 0; i < halo.length; i++) halo[i] *= win[i];

    /* burn hole */
    let art = src;
    let B = null;
    if (p.burn) {
      B = burnField(N, bb, p.side, seed);
      // keep = smooth step across the front (≈1.5 grid px), so the hole edge is clean
      const keep = new Float32Array(N * N);
      const e = Math.max(0.004, 1.2 / Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0));
      for (let i = 0; i < keep.length; i++) keep[i] = smoothstep(-e, e, B[i]);
      const kc = createCanvas(S, S);
      const kx = ctx2d(kc);
      kx.imageSmoothingEnabled = true;
      kx.drawImage(maskToCanvas(keep, N, N), 0, 0, S, S);
      art = createCanvas(S, S);
      const ax = ctx2d(art);
      ax.drawImage(src, 0, 0);
      ax.globalCompositeOperation = "destination-in";
      ax.drawImage(kc, 0, 0);
      for (let i = 0; i < halo.length; i++) halo[i] *= smoothstep(-0.02, 0.06, B[i]);
    }
    const artMask = p.burn ? alphaAt(art, N) : mask;

    /* halation: film red bleeding around the art */
    if (hal > 0) {
      const h1 = blurMask(artMask, N, N, 10 * u), h2 = blurMask(artMask, N, N, 26 * u);
      const hm = new Float32Array(N * N);
      for (let i = 0; i < hm.length; i++) hm[i] = clamp(h1[i] * 0.8 + h2[i] * 0.55) * win[i];
      o.save();
      o.globalCompositeOperation = "lighter";
      o.globalAlpha = Math.min(1, hal * 0.75);
      o.drawImage(maskToCanvas(hm, N, N, L.hal), 0, 0, S, S);
      o.restore();
    }

    /* the art, lightly film-graded (blacks lifted warm) */
    o.drawImage(art, 0, 0);
    {
      const grade = createCanvas(S, S);
      const gx = ctx2d(grade);
      gx.fillStyle = L.warm;
      gx.fillRect(0, 0, S, S);
      gx.globalCompositeOperation = "destination-in";
      gx.drawImage(art, 0, 0);
      o.save();
      o.globalCompositeOperation = "screen";
      o.globalAlpha = 0.08 + 0.1 * k;
      o.drawImage(grade, 0, 0);
      o.restore();
    }

    /* light leak, screened over the art and its halo */
    if (k > 0) {
      const I = leakField(N, bb, p.side, seed, vhs);
      const lut = gradientLUT(L.stops.map(([c, at]) => ({ at, color: c })));
      const prism = p.leak === "prism";
      const spec = prism ? gradientLUT(SPECTRA.rainbow.map((c, i) => ({ at: i / 6, color: c }))) : null;
      const lc = createCanvas(N, N);
      const lx = ctx2d(lc);
      const img = lx.createImageData(N, N);
      const d = img.data;
      for (let i = 0, j = 0; i < I.length; i++, j += 4) {
        const v = I[i];
        const h = halo[i];
        if (v < 0.01 || h <= 0) continue;
        let li = ((v * 255) | 0) * 3;
        let r = lut[li], g = lut[li + 1], b = lut[li + 2];
        if (prism) {
          // a spectral fringe along the leak's edge band
          const band = Math.exp(-(((v - 0.42) / 0.12) ** 2));
          li = ((clamp((v - 0.2) / 0.5) * 255) | 0) * 3;
          r += (spec[li] - r) * band * 0.85; g += (spec[li + 1] - g) * band * 0.85; b += (spec[li + 2] - b) * band * 0.85;
        }
        d[j] = r; d[j + 1] = g; d[j + 2] = b;
        d[j + 3] = clamp(smoothstep(0.02, 0.9, v) * (0.3 + 0.85 * k)) * h * 255;
      }
      lx.putImageData(img, 0, 0);
      o.save();
      o.globalCompositeOperation = "screen";
      o.drawImage(lc, 0, 0, S, S);
      // the hottest part of the leak burns through as light
      o.globalCompositeOperation = "lighter";
      o.globalAlpha = 0.2 * k;
      o.drawImage(lc, 0, 0, S, S);
      o.restore();
    }

    /* burn: charred rim + glowing ember edge along the front, on the art only */
    if (B) {
      const rim = new Float32Array(N * N), glow = new Float32Array(N * N);
      const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
      const w1 = (7 * u) / span, w2 = (3 * u) / span;
      for (let i = 0; i < rim.length; i++) {
        const b = B[i];
        if (b < -w2 * 2 || b > w1 * 3) continue;
        rim[i] = smoothstep(w1 * 2.6, w1 * 0.4, b) * smoothstep(-w2, w2 * 0.2, b);
        glow[i] = Math.exp(-((b / (w2 * 1.3)) ** 2));
      }
      const am = blurMask(dilateMask(mask, N, N, 1.2 * u), N, N, 0.6);
      for (let i = 0; i < rim.length; i++) { rim[i] *= am[i]; glow[i] *= am[i]; }
      const rc = maskToCanvas(rim, N, N, "#140703");
      o.save();
      o.globalAlpha = 0.92;
      o.drawImage(rc, 0, 0, S, S);
      o.globalCompositeOperation = "lighter";
      o.globalAlpha = 1;
      o.drawImage(maskToCanvas(blurMask(glow, N, N, 3 * u), N, N, "#FF5A0A"), 0, 0, S, S);
      o.drawImage(maskToCanvas(glow, N, N, "#FFB347"), 0, 0, S, S);
      o.restore();
    }

    /* dust + scratches inside the halo */
    if (dust > 0) drawDust(o, S, sc, halo, N, dust, ctx.seed, vhs);
    if (vhs) {
      // VHS: faint scanlines over the art
      const sl = createCanvas(S, S);
      const sx = ctx2d(sl);
      const per = Math.max(2, Math.round(5 * sc));
      sx.fillStyle = "rgba(0,0,0,0.22)";
      for (let y = 0; y < S; y += per) sx.fillRect(0, y, S, Math.max(1, per * 0.4));
      sx.globalCompositeOperation = "destination-in";
      sx.drawImage(art, 0, 0);
      o.drawImage(sl, 0, 0);
    }
    return out;
  },
};

/** Specks (light and dark) and a few vertical scratches, kept to the art's halo. */
function drawDust(o, S, sc, halo, N, k, seed, vhs) {
  const r = rng(hashSeed("filmburn-dust", seed));
  const layer = createCanvas(S, S);
  const x = ctx2d(layer);
  const count = Math.round((60 + 340 * k) * (S >= 600 ? 1 : 0.8));
  const at = (px, py) => halo[Math.min(N - 1, (py * N / S) | 0) * N + Math.min(N - 1, (px * N / S) | 0)];
  for (let i = 0; i < count; i++) {
    const px = r() * S, py = r() * S;
    const h = at(px, py);
    if (h < 0.15 || r() > h) continue;
    const big = r() < 0.08;
    const rad = (big ? 1.6 + 2.4 * r() : 0.5 + 1.1 * r()) * sc * 1.4;
    const light = r() < 0.72;
    x.fillStyle = light ? `rgba(255,248,232,${(0.35 + 0.5 * r()).toFixed(3)})` : `rgba(20,12,8,${(0.4 + 0.4 * r()).toFixed(3)})`;
    x.beginPath();
    if (big && r() < 0.5) {
      // a hair: short curved fibre
      x.lineWidth = Math.max(0.6, 0.9 * sc);
      x.strokeStyle = x.fillStyle;
      const len = (14 + 30 * r()) * sc, a = r() * TAU;
      x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(a + 1) * len * 0.6, py + Math.sin(a + 1) * len * 0.6, px + Math.cos(a) * len, py + Math.sin(a) * len);
      x.stroke();
    } else {
      x.arc(px, py, Math.max(0.4, rad), 0, TAU);
      x.fill();
    }
  }
  // scratches: 1-px vertical lines (horizontal tracking lines for VHS)
  const ns = 3 + Math.round(5 * k);
  for (let i = 0; i < ns; i++) {
    const p0 = S * (0.18 + 0.64 * r());
    const a0 = S * (0.1 + 0.3 * r()), len = S * (0.25 + 0.5 * r());
    x.strokeStyle = `rgba(255,250,238,${(0.22 + 0.18 * r()).toFixed(3)})`;
    x.lineWidth = Math.max(0.7, 1.1 * sc);
    x.beginPath();
    if (vhs) { x.moveTo(a0, p0); x.lineTo(a0 + len, p0 + (r() - 0.5) * 2 * sc); }
    else { x.moveTo(p0, a0); x.lineTo(p0 + (r() - 0.5) * 6 * sc, a0 + len); }
    x.stroke();
  }
  // keep it all to the halo
  const hc = maskToCanvas(halo, N, N);
  x.globalCompositeOperation = "destination-in";
  x.imageSmoothingEnabled = true;
  x.drawImage(hc, 0, 0, S, S);
  o.drawImage(layer, 0, 0);
}

