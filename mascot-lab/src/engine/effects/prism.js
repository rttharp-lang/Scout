// "Prism" — the logo shot through a cut crystal (the Prizm look). Ghost copies of the
// logo slide off along one direction, each split into three spectral copies (chromatic
// dispersion: red / green / blue fringes, or a warm / cool / team spectrum), added as
// light. With facets on, the plane is cut into convex wedges around the logo's centre and
// every wedge throws its copies a different distance (the crystal's faces), with faint
// white facet edges; a spectral flare streak crosses the art. The original logo stays
// sharp on top.
//
// Structure: ghosts are drawn with canvas transforms on a W = min(S, 1024) layer (they
// are light, not detail), faded by a squircle window so nothing reaches the canvas edge;
// the flare is a small blurred field; the logo is drawn last at full S. Transparent
// background, deterministic (seeded facets).
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, smoothstep, hexToRgb, rng, hashSeed,
  dilateMask, blurMask, maskToCanvas, maskBounds, gradientLUT,
} from "../core.js";
import { alphaAt, squircleWindow, SPECTRA, teamLights } from "../fx/light.js";

const TAU = Math.PI * 2;

/* ───────────────────────────── spectra ───────────────────────────── */

// three channel tints per spectrum (they add up to a warm/cool/neutral white where the
// copies overlap) + the flare's spectrum
const CHANNELS = {
  rainbow: [[255, 30, 40], [40, 255, 90], [50, 70, 255]],
  warm: [[255, 40, 70], [255, 170, 30], [150, 70, 255]],
  cool: [[150, 50, 255], [30, 200, 255], [60, 255, 160]],
};

function teamChannels(palette) {
  const [a, b] = teamLights(palette);
  const A = hexToRgb(a), B = hexToRgb(b);
  // the third channel completes the pair toward white so overlaps stay luminous
  const C = [255 - (A[0] + B[0]) / 2, 255 - (A[1] + B[1]) / 2, 255 - (A[2] + B[2]) / 2].map((v) => clamp(v * 1.2 + 60, 0, 255));
  return [[A[0], A[1], A[2]], [B[0], B[1], B[2]], C];
}

/* ───────────────────────────── layers ───────────────────────────── */

/** The ghost source at W: logo luminance lifted (dark inks still emit light), alpha kept. */
function ghostChannels(srcW, W, tints) {
  const d0 = getPixels(srcW).data;
  return tints.map((t) => {
    const c = createCanvas(W, W);
    const x = ctx2d(c);
    const img = x.createImageData(W, W);
    const d = img.data;
    for (let j = 0; j < d.length; j += 4) {
      const a = d0[j + 3];
      if (!a) continue;
      const L = (0.299 * d0[j] + 0.587 * d0[j + 1] + 0.114 * d0[j + 2]) / 255;
      const l = 0.42 + 0.58 * L;
      d[j] = t[0] * l; d[j + 1] = t[1] * l; d[j + 2] = t[2] * l; d[j + 3] = a;
    }
    x.putImageData(img, 0, 0);
    return c;
  });
}

/** Seeded convex wedges around the centre: [{ a0, a1, mul, turn, bright }]. */
function wedges(rand, n) {
  const start = rand() * TAU;
  const w = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = 0.6 + rand(); w.push(v); sum += v; }
  const out = [];
  let a = start;
  for (let i = 0; i < n; i++) {
    const span = (w[i] / sum) * TAU;
    out.push({
      a0: a, a1: a + span,
      mul: [1.2, 0.7, 1, 0.82, 1.32, 0.76, 1.1][i % 7] * (0.92 + 0.16 * rand()),
      turn: (rand() - 0.5) * 0.5,
      bright: 0.72 + 0.28 * rand(),
    });
    a += span;
  }
  return out;
}

/** Spectral flare band across the art on an N grid: → canvas (blurred, coloured). */
function flareLayer(N, cx, cy, ang, width, lut, k) {
  const c = createCanvas(N, N);
  const x = ctx2d(c);
  const img = x.createImageData(N, N);
  const d = img.data;
  const nx = -Math.sin(ang), ny = Math.cos(ang);   // band normal
  const half = width / 2;
  for (let y = 0; y < N; y++) {
    for (let xx = 0; xx < N; xx++) {
      const u = (xx + 0.5 - cx) * nx + (y + 0.5 - cy) * ny;
      if (u < -half * 1.6 || u > half * 1.6) continue;
      const t = clamp((u / half + 1) / 2);
      // brightest just off-centre, a hot white core line
      const bell = Math.exp(-((u / half) ** 2) * 1.6);
      const core = Math.exp(-((u / (half * 0.12)) ** 2));
      const li = ((t * 255) | 0) * 3;
      const j = (y * N + xx) * 4;
      d[j] = lut[li] + (255 - lut[li]) * core;
      d[j + 1] = lut[li + 1] + (255 - lut[li + 1]) * core;
      d[j + 2] = lut[li + 2] + (255 - lut[li + 2]) * core;
      d[j + 3] = clamp(bell * k) * 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** Multiply a canvas's alpha by a float mask of the same size. */
function maskAlpha(c, m) {
  const x = ctx2d(c);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0, j = 3; i < m.length; i++, j += 4) d[j] *= m[i];
  x.putImageData(img, 0, 0);
  return c;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "prism",
  name: "Prism",
  category: "metal",
  blurb: "Your logo through a crystal: rainbow ghosts and a flare.",
  method: "Sublimation",
  stage: "dark",
  params: [
    { key: "copies", label: "Copies", type: "range", min: 1, max: 5, step: 1, default: 3 },
    { key: "offset", label: "Offset", type: "range", min: 0, max: 120, step: 1, default: 44, unit: "px" },
    { key: "angle", label: "Angle", type: "range", min: 0, max: 360, step: 1, default: 30, unit: "°" },
    { key: "dispersion", label: "Dispersion", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "facets", label: "Crystal facets", type: "toggle", default: true },
    { key: "flare", label: "Flare", type: "range", min: 0, max: 100, step: 1, default: 45, unit: "%" },
    {
      key: "spectrum", label: "Spectrum", type: "select", default: "rainbow",
      options: [
        { value: "rainbow", label: "Rainbow" },
        { value: "warm", label: "Warm leak" },
        { value: "cool", label: "Cool" },
        { value: "team", label: "Team" },
      ],
    },
  ],
  presets: [
    { name: "Prizm", params: { copies: 3, offset: 44, angle: 30, dispersion: 60, facets: true, flare: 45, spectrum: "rainbow" } },
    { name: "Rainbow split", params: { copies: 2, offset: 34, angle: 0, dispersion: 95, facets: false, flare: 20, spectrum: "rainbow" } },
    { name: "Crystal", params: { copies: 5, offset: 16, angle: 300, dispersion: 40, facets: true, flare: 30, spectrum: "cool" } },
    { name: "Light leak", params: { copies: 3, offset: 34, angle: 20, dispersion: 60, facets: true, flare: 90, spectrum: "warm" } },
    { name: "Team prism", params: { copies: 3, offset: 36, angle: 330, dispersion: 55, facets: true, flare: 40, spectrum: "team" } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = Math.min(S, 1024);
    const kW = W / S;
    const u = ctx.scale * kW;                    // 1024-units → W px
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";

    const N = Math.max(96, Math.min(256, Math.round(S / 3)));   // mask grid
    const kN = N / S;
    const mask = alphaAt(src, N);
    const bb = maskBounds(mask, N, N, 0.2);
    if (bb.empty) return out;
    const cxN = (bb.x0 + bb.x1) / 2, cyN = (bb.y0 + bb.y1) / 2;
    const cx = cxN / kN * kW, cy = cyN / kN * kW;     // centre in W px
    const spanW = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / kN * kW;

    const spec = p.spectrum in CHANNELS ? p.spectrum : p.spectrum === "team" ? "team" : "rainbow";
    const tints = spec === "team" ? teamChannels(ctx.palette) : CHANNELS[spec];
    const flareStops = spec === "team" ? null : SPECTRA[spec === "cool" ? "cool" : spec === "warm" ? "warm" : "rainbow"];
    const rand = rng(hashSeed("prism", ctx.seed));

    /* ── ghosts ── */
    const ghost = createCanvas(W, W);
    const g = ctx2d(ghost);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const off = p.offset * u, copies = Math.round(p.copies), disp = (p.dispersion / 100) * 16 * u;
    const ang = (p.angle * Math.PI) / 180;
    const srcW = W === S ? src : resizeCanvas(src, W, W);
    const facets = p.facets ? wedges(rand, 5 + Math.floor(rand() * 2)) : [{ a0: 0, a1: TAU, mul: 1, turn: 0, bright: 1 }];
    if (off > 0.2 || disp > 0.2) {
      const chans = ghostChannels(srcW, W, tints);
      // per-copy channel weights: copy 1 at the warm end of the spectrum → the last at the cool end
      const copyW = [];
      for (let k = 1; k <= copies; k++) {
        const t = copies > 1 ? (k - 1) / (copies - 1) : 0.5;
        const sp = [Math.max(0, 1 - 1.7 * t), Math.max(0, 1 - Math.abs(t - 0.5) * 2.4), Math.max(0, 1.7 * t - 0.7)];
        copyW.push(sp.map((v) => 0.22 + 0.78 * Math.min(1, v * 1.15)));
      }
      const R = W * 1.5;
      // each facet's copies go to a scratch layer that is then cut to the wedge with a
      // FILLED mask (destination-in): a clip() path rasterizes differently on a page
      // canvas and on a worker's OffscreenCanvas, a fill does not
      const layer = p.facets ? createCanvas(W, W) : null;
      const lx = layer ? ctx2d(layer) : null;
      if (lx) { lx.imageSmoothingEnabled = true; lx.imageSmoothingQuality = "high"; }
      for (const f of facets) {
        const t = lx || g;
        if (lx) { lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = "source-over"; lx.globalAlpha = 1; lx.clearRect(0, 0, W, W); }
        const da = ang + f.turn;
        const dx = Math.cos(da), dy = Math.sin(da);
        t.globalCompositeOperation = "lighter";
        for (let k = copies; k >= 1; k--) {
          const sh = off * k * f.mul;
          const s = 1 + 0.025 * k * (f.mul > 1 ? 1 : -0.6);
          const alpha = (0.68 / Math.pow(k, 0.5)) * f.bright;
          // dispersion along the trail: each copy takes its own band of the spectrum
          const wch = copyW[k - 1];
          for (let ch = 0; ch < 3; ch++) {
            const pp = disp * (0.6 + 0.4 * k) * (ch - 1);
            t.setTransform(s, 0, 0, s, cx + dx * sh - dy * pp - cx * s, cy + dy * sh + dx * pp - cy * s);
            t.globalAlpha = alpha * wch[ch];
            t.drawImage(chans[ch], 0, 0);
          }
        }
        t.setTransform(1, 0, 0, 1, 0, 0);
        t.globalAlpha = 1;
        if (lx) {
          lx.globalCompositeOperation = "destination-in";
          lx.fillStyle = "#FFFFFF";
          lx.beginPath();
          lx.moveTo(cx, cy);
          const steps = Math.max(2, Math.ceil((f.a1 - f.a0) / 0.3));
          for (let q = 0; q <= steps; q++) {
            const a = f.a0 + ((f.a1 - f.a0) * q) / steps;
            lx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
          }
          lx.closePath();
          lx.fill();
          g.globalCompositeOperation = "lighter";
          g.drawImage(layer, 0, 0);
        }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      // facet edges: thin white lines, visible only where the crystal carries light
      if (p.facets) {
        g.globalCompositeOperation = "source-atop";
        g.globalAlpha = 1;
        g.lineWidth = Math.max(0.8, 1.5 * u);
        for (const f of facets) {
          const c0 = Math.cos(f.a0), s0 = Math.sin(f.a0);
          const x0 = cx + c0 * spanW * 0.25, y0 = cy + s0 * spanW * 0.25;
          const x1 = cx + c0 * spanW * 1.1, y1 = cy + s0 * spanW * 1.1;
          const gr = g.createLinearGradient(x0, y0, x1, y1);
          gr.addColorStop(0, "rgba(255,255,255,0.7)");
          gr.addColorStop(0.7, "rgba(255,255,255,0.55)");
          gr.addColorStop(1, "rgba(255,255,255,0)");
          g.strokeStyle = gr;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
      }
      const reach = Math.min(140 * u, off * copies * 1.2 + 26 * u);
      const rN = (reach / kW) * kN;
      const hull = blurMask(dilateMask(mask, N, N, rN), N, N, rN * 0.35);
      const win = squircleWindow(N, 0.8, 0.975);
      for (let i = 0; i < hull.length; i++) hull[i] = smoothstep(0.05, 0.6, hull[i]) * win[i];
      const hc = maskToCanvas(hull, N, N);
      g.globalCompositeOperation = "destination-in";
      g.globalAlpha = 1;
      g.drawImage(hc, 0, 0, W, W);
      g.globalCompositeOperation = "source-over";
    }

    o.drawImage(ghost, 0, 0, S, S);

    /* ── flare streak ── */
    const fk = p.flare / 100;
    let flareC = null;
    if (fk > 0) {
      const lut = flareStops
        ? gradientLUT(flareStops.map((c, i) => ({ at: i / (flareStops.length - 1), color: c })))
        : gradientLUT(tints.map((t, i) => ({ at: i / 2, color: "#" + t.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") })));
      const NF = Math.max(96, Math.min(384, Math.round(S / 2.5)));
      const kF = NF / S;
      const fang = ang + Math.PI / 2 + 0.35;
      const fcx = (cxN / kN) * kF + Math.cos(ang) * spanW * 0.08 / kW * kF;
      const fcy = (cyN / kN) * kF + Math.sin(ang) * spanW * 0.08 / kW * kF;
      flareC = flareLayer(NF, fcx, fcy, fang, 64 * ctx.scale * kF, lut, 0.35 + 0.75 * fk);
      // a long streak through the art, fading along its length and before the edge
      const near = new Float32Array(NF * NF);
      const along = spanW / kW * kF * 0.62;
      const ex = Math.cos(fang), ey = Math.sin(fang);
      const win = squircleWindow(NF, 0.8, 0.96);
      for (let y = 0; y < NF; y++) {
        for (let x = 0; x < NF; x++) {
          const v = ((x + 0.5 - fcx) * ex + (y + 0.5 - fcy) * ey) / along;
          near[y * NF + x] = Math.exp(-v * v * 1.4) * win[y * NF + x];
        }
      }
      maskAlpha(flareC, near);
      o.save();
      o.globalCompositeOperation = "lighter";
      o.globalAlpha = Math.min(1, 0.5 + 0.6 * fk);
      o.drawImage(flareC, 0, 0, S, S);
      o.restore();
    }

    /* ── the logo, sharp, on top; the crystal's ghosts and facets play over it ── */
    o.drawImage(src, 0, 0);
    if (off > 0.2 || disp > 0.2) {
      const over = createCanvas(S, S);
      const vx = ctx2d(over);
      vx.imageSmoothingEnabled = true;
      vx.drawImage(ghost, 0, 0, S, S);
      if (p.facets) {
        // each face of the crystal catches a little more or less light
        const ks = S / W;
        for (const f of facets) {
          vx.beginPath();
          vx.moveTo(cx * ks, cy * ks);
          vx.arc(cx * ks, cy * ks, S, f.a0, f.a1);
          vx.closePath();
          vx.fillStyle = `rgba(255,255,255,${(f.bright - 0.7) * 0.32})`;
          vx.fill();
        }
        vx.strokeStyle = "rgba(255,255,255,0.4)";
        vx.lineWidth = Math.max(0.7, 1.2 * ctx.scale);
        vx.beginPath();
        for (const f of facets) {
          vx.moveTo(cx * ks, cy * ks);
          vx.lineTo((cx + Math.cos(f.a0) * spanW) * ks, (cy + Math.sin(f.a0) * spanW) * ks);
        }
        vx.stroke();
      }
      vx.globalCompositeOperation = "destination-in";
      vx.drawImage(src, 0, 0);
      o.save();
      o.globalCompositeOperation = "screen";
      o.globalAlpha = 0.3;
      o.drawImage(over, 0, 0);
      o.restore();
    }
    if (flareC) {
      const over = createCanvas(S, S);
      const vx = ctx2d(over);
      vx.drawImage(flareC, 0, 0, S, S);
      vx.globalCompositeOperation = "destination-in";
      vx.drawImage(src, 0, 0);
      o.save();
      o.globalCompositeOperation = "screen";
      o.globalAlpha = 0.18 + 0.5 * fk;
      o.drawImage(over, 0, 0);
      o.restore();
    }
    return out;
  },
};
