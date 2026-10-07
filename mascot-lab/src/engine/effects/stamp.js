// "Rubber Stamp" — the logo cut into rubber and stamped in one ink, in the spirit of the
// Stamp Kit (7 ink textures), Dirty / Vintage / Misprint stamp and Low Ink packs:
//
//   the plate: a one-ink cut of the logo (dark and saturated inks are raised rubber,
//   white and pale inks are cut away; a white logo stamps its silhouette), optionally
//   framed by a badge (double ring or double rectangle) that is part of the same rubber,
//   tilted as a whole → coverage = plate × pressure × ink texture, thresholded:
//     pressure — a tilt across the stamp (one side pressed harder) × slow mottling;
//     texture  — mottled (blotchy fbm), starved (horizontal streaks + low-ink banding),
//                dry (coarse grain), heavy (near-solid, ink pooled at the rim and a faint
//                squash halo outside);
//   ink pools at the rim of every shape (stamps print their edges darkest) → optional
//   double hit: a faint second impression a few units off.
//
// Per-pixel work at W = min(S, 1024), noise in unit space (same stamp at 384 and 2048).
// Transparent background, deterministic.
import {
  createCanvas, ctx2d, clamp, smoothstep, hexToRgb, insideDistance, outsideDistance, rng, hashSeed,
  maskToCanvas, darken,
} from "../core.js";
import {
  readLogo, inkDensity, noiseMap, grainMap, bounds, toSize, workSize, paintMask, shift,
} from "../fx/press.js";

const TAU = Math.PI * 2;
const FIT = 0.465;        // the stamp (with its badge) stays inside this fraction of the canvas
const RING_IN = 5, RING_OUT = 14, RING_GAP = 6, CLEAR = 12;   // badge strokes, units

/** Farthest ink pixel from (cx, cy), px. */
function reach(mask, W, cx, cy) {
  let r2 = 0;
  for (let y = 0; y < W; y++) {
    const row = y * W, dy = y + 0.5 - cy;
    for (let x = 0; x < W; x++) {
      if (mask[row + x] < 0.3) continue;
      const dx = x + 0.5 - cx, d = dx * dx + dy * dy;
      if (d > r2) r2 = d;
    }
  }
  return Math.sqrt(r2);
}

export default {
  id: "stamp",
  name: "Rubber Stamp",
  category: "texture",
  blurb: "Inked by hand: uneven pressure, starved ink, badge.",
  method: "Screen print",
  stage: "paper",
  params: [
    {
      key: "texture", label: "Ink texture", type: "select", default: "mottled",
      options: [
        { value: "mottled", label: "Mottled" },
        { value: "starved", label: "Starved" },
        { value: "dry", label: "Dry" },
        { value: "heavy", label: "Heavy" },
      ],
    },
    { key: "pressure", label: "Pressure", type: "range", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    {
      key: "badge", label: "Badge frame", type: "select", default: "none",
      options: [
        { value: "none", label: "None" },
        { value: "ring", label: "Ring" },
        { value: "rect", label: "Box" },
      ],
    },
    { key: "double", label: "Double hit", type: "toggle", default: false },
    { key: "tilt", label: "Tilt", type: "range", min: -12, max: 12, step: 1, default: -4, unit: "°" },
    { key: "ink", label: "Ink", type: "color", default: "primary" },
  ],
  presets: [
    { name: "Rubber stamp", params: { texture: "mottled", pressure: 60, badge: "none", double: false, tilt: -4, ink: "primary" } },
    { name: "Badge", params: { texture: "heavy", pressure: 60, badge: "ring", double: false, tilt: -6, ink: "primary" } },
    { name: "Low ink", params: { texture: "starved", pressure: 35, badge: "none", double: false, tilt: -4, ink: "primary" } },
    { name: "Double hit", params: { texture: "dry", pressure: 60, badge: "none", double: true, tilt: -4, ink: "primary" } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const W = workSize(S);
    const u = ctx.scale * (W / S);
    const n = W * W;
    const seed = ctx.seed >>> 0;
    const r = rng(hashSeed("stamp", seed));
    const out = createCanvas(W, W);

    /* ── 1. the plate: a one-ink cut of the logo ── */
    const logo = readLogo(src, W);
    const bb = bounds(logo.alpha, W, 0.1);
    if (bb.empty) return toSize(out, S);
    const { ink } = inkDensity(logo, { chromaWeight: 0.6, lo: 0.2, hi: 0.5 });
    const plateSrc = new Float32Array(n);
    for (let i = 0; i < n; i++) plateSrc[i] = smoothstep(0.35, 0.65, ink[i]);
    // where two inks of different value meet (gold letters on a navy ring), the stamp maker
    // cuts a thin channel between them so the one-ink stamp keeps the two-ink detail
    {
      const { lum } = logo;
      const d = Math.max(1, Math.round(2.2 * u));
      const cut = new Uint8Array(n);
      for (let y = d; y < W - d; y++) {
        for (let x = d; x < W - d; x++) {
          const i = y * W + x;
          if (plateSrc[i] < 0.5) continue;
          const L = lum[i] - 0.22, a = i - d, b = i + d, c = i - d * W, e = i + d * W;
          if ((plateSrc[a] >= 0.5 && lum[a] < L) || (plateSrc[b] >= 0.5 && lum[b] < L) ||
            (plateSrc[c] >= 0.5 && lum[c] < L) || (plateSrc[e] >= 0.5 && lum[e] < L)) cut[i] = 1;
        }
      }
      // only the lighter side of each boundary is cut back (the dark ink keeps its edge)
      for (let i = 0; i < n; i++) if (cut[i]) plateSrc[i] = 0;
    }
    const pb = bounds(plateSrc, W, 0.3);
    const cx = pb.empty ? bb.cx : pb.cx, cy = pb.empty ? bb.cy : pb.cy;

    /* ── 2. badge geometry + fit (the whole stamp is rotated by tilt) ── */
    const th = (p.tilt * Math.PI) / 180;
    const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
    let k = 1, ring = null, rect = null;
    if (p.badge === "ring") {
      const R = reach(plateSrc, W, cx, cy);
      const r1 = R + CLEAR * u + (RING_IN / 2) * u;
      const r2 = r1 + (RING_IN / 2 + RING_GAP + RING_OUT / 2) * u;
      k = Math.min(1, (FIT * W) / (r2 + (RING_OUT / 2) * u));
      ring = { r1, r2 };
    } else if (p.badge === "rect") {
      const hx1 = (pb.w / 2) + CLEAR * u + (RING_IN / 2) * u, hy1 = (pb.h / 2) + CLEAR * u + (RING_IN / 2) * u;
      const g = (RING_IN / 2 + RING_GAP + RING_OUT / 2) * u;
      const hx2 = hx1 + g, hy2 = hy1 + g;
      const ex = hx2 + (RING_OUT / 2) * u, ey = hy2 + (RING_OUT / 2) * u;
      k = Math.min(1, (FIT * W) / (ex * ca + ey * sa), (FIT * W) / (ex * sa + ey * ca));
      rect = { hx1, hy1, hx2, hy2 };
    } else {
      const ex = pb.w / 2, ey = pb.h / 2;
      k = Math.min(1, (FIT * W) / (ex * ca + ey * sa), (FIT * W) / (ex * sa + ey * ca));
    }
    const plateCanvas = maskToCanvas(plateSrc, W, W, "#000000");
    const plate = paintMask(W, (c) => {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.translate(W / 2, W / 2);
      c.rotate(th);
      c.scale(k, k);
      c.translate(-cx, -cy);
      c.drawImage(plateCanvas, 0, 0);
      c.strokeStyle = "#000";
      if (ring) {
        c.lineWidth = RING_IN * u;
        c.beginPath(); c.arc(cx, cy, ring.r1, 0, TAU); c.stroke();
        c.lineWidth = RING_OUT * u;
        c.beginPath(); c.arc(cx, cy, ring.r2, 0, TAU); c.stroke();
      } else if (rect) {
        const rr = (x, y, w, h, rad) => {
          c.beginPath();
          c.moveTo(x + rad, y);
          c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad);
          c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad);
          c.closePath();
          c.stroke();
        };
        c.lineJoin = "round";
        c.lineWidth = RING_IN * u;
        rr(cx - rect.hx1, cy - rect.hy1, rect.hx1 * 2, rect.hy1 * 2, 4 * u);
        c.lineWidth = RING_OUT * u;
        rr(cx - rect.hx2, cy - rect.hy2, rect.hx2 * 2, rect.hy2 * 2, 8 * u);
      }
    });
    const sb = bounds(plate, W, 0.3);
    if (sb.empty) return toSize(out, S);

    /* ── 3. pressure: a tilt across the stamp × slow mottling ── */
    const pr = p.pressure / 100;
    const pa = r() * TAU;
    const pc = Math.cos(pa), ps = Math.sin(pa);
    // projection range over the stamp's bounding box corners
    let pmin = Infinity, pmax = -Infinity;
    for (const [x, y] of [[sb.x0, sb.y0], [sb.x1, sb.y0], [sb.x0, sb.y1], [sb.x1, sb.y1]]) {
      const v = x * pc + y * ps;
      if (v < pmin) pmin = v;
      if (v > pmax) pmax = v;
    }
    const low = noiseMap(W, u, 140, hashSeed("stamp-low", seed), { octaves: 2 });

    /* ── 4. ink texture ── */
    const tex = p.texture;
    let T1, T2 = null;
    if (tex === "starved") {
      // streaks along the stamp's horizontal (noise stretched ×20 along x)
      T1 = noiseMap(W, u, 40, hashSeed("stamp-streak", seed), { octaves: 3, sx: 0.05, sy: 1, angle: th });
      T2 = noiseMap(W, u, 30, hashSeed("stamp-band", seed), { octaves: 1 });
    } else if (tex === "dry") {
      T1 = grainMap(W, u, 2.6, hashSeed("stamp-dry", seed));
      T2 = noiseMap(W, u, 26, hashSeed("stamp-dry2", seed), { octaves: 2 });
    } else {
      T1 = noiseMap(W, u, 11, hashSeed("stamp-mottle", seed), { octaves: 3, grid: Math.max(1, 11 * u / 2.6) });
      T2 = grainMap(W, u, 1.6, hashSeed("stamp-grain", seed));
    }
    const inside = insideDistance(plate, W, W, 0.5);
    const heavy = tex === "heavy";
    const outside = heavy ? outsideDistance(plate, W, W, 0.5) : null;

    /** ink coverage of an impression at pixel i (x, y), before the plate's own edge AA */
    const sinT = Math.sin(th), cosT = Math.cos(th);
    const bandP = 15 * u;
    const coverage = (i, x, y, ghost) => {
      const ramp = ((x * pc + y * ps) - pmin) / Math.max(1, pmax - pmin);
      const P = (0.55 + 0.45 * ramp) * (1 + 0.22 * low[i]);
      const rim = Math.exp(-inside[i] / (2.2 * u));   // ink pools at the rim
      let c;
      switch (tex) {
        case "starved": {
          const yy = -x * sinT + y * cosT;     // stamp-space y
          const band = 0.5 + 0.5 * Math.sin(TAU * yy / bandP + 2.2 * T2[i]);
          c = P * (0.52 + 0.5 * pr) + 0.55 * T1[i] - 0.18 * band + 0.3 * rim;
          break;
        }
        case "dry":
          c = P * (0.6 + 0.45 * pr) + 0.75 * (T1[i] - 0.5) + 0.16 * T2[i] + 0.28 * rim;
          break;
        case "heavy":
          c = P * (0.8 + 0.4 * pr) + 0.14 * T1[i] + 0.4 * (T2[i] - 0.5) + 0.42 * rim;
          break;
        default:
          c = P * (0.6 + 0.42 * pr) + 0.36 * T1[i] + 0.32 * (T2[i] - 0.5) + 0.3 * rim;
      }
      if (ghost) c -= 0.16;
      return smoothstep(0.46, 0.54, c);
    };

    /* ── 5. print ── */
    const img = ctx2d(out).createImageData(W, W);
    const od = img.data;
    const inkRGB = hexToRgb(p.ink);
    const deep = hexToRgb(darken(p.ink, 0.16));
    const ghostMask = p.double ? (() => {
      const ga = r() * TAU, gd = (6 + 4 * r()) * u;
      return shift(plate, W, Math.cos(ga) * gd, Math.sin(ga) * gd);
    })() : null;
    const pad = Math.ceil(14 * u);
    const x0 = Math.max(0, sb.x0 - pad), x1 = Math.min(W, sb.x1 + pad);
    const y0 = Math.max(0, sb.y0 - pad), y1 = Math.min(W, sb.y1 + pad);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const pl = plate[i];
        let a = 0, pool = 0;
        if (pl > 0.02) {
          a = coverage(i, x, y, false) * smoothstep(0.15, 0.85, pl);
          pool = heavy ? Math.exp(-inside[i] / (1.6 * u)) : 0;
        } else if (heavy && outside[i] < 2.6 * u) {
          // squashed ink: a faint halo just outside the rubber
          a = 0.2 * (1 - outside[i] / (2.6 * u)) * (0.6 + 0.4 * T2[i]);
        }
        if (ghostMask && ghostMask[i] > 0.02) {
          const g = 0.5 * coverage(i, x, y, true) * ghostMask[i];
          a = a + g * (1 - a);
        }
        if (a <= 0.004) continue;
        const j = i * 4;
        // a touch of density variation: the ink is thinner where the stamp was pressed lightly
        const dens = 0.9 + 0.1 * clamp(0.5 + 0.5 * low[i]);
        od[j] = inkRGB[0] + (deep[0] - inkRGB[0]) * pool;
        od[j + 1] = inkRGB[1] + (deep[1] - inkRGB[1]) * pool;
        od[j + 2] = inkRGB[2] + (deep[2] - inkRGB[2]) * pool;
        od[j + 3] = a * dens * 255 + 0.5;
      }
    }
    ctx2d(out).putImageData(img, 0, 0);
    return toSize(out, S);
  },
};
