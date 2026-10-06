// "Embossed" — tonal relief, the understated option. The logo becomes a single-color
// raised (emboss) or pressed (deboss) shape lit from one side: height = a rounded bevel
// from the silhouette plus interior relief from the logo's own light/dark areas (light
// inks stand proud, dark linework sinks), shaded with diffuse light and a soft specular.
// "Rubber patch" puts it on a molded silicone plate with a raised rim, like a PVC patch.
//
// Structure (see halftone.js): height/normal fields at W ≤ 1024 → a shade + specular map
// at W → one per-pixel pass at S through a tone LUT built from the chosen color; alpha
// comes from the full-resolution source (or the plate's distance field), so edges stay crisp.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, alphaMask, insideDistance, signedDistance, blurMask, dilateMask,
  clamp, hexToRgb, lighten, darken, luminance, rgbToHsl, hslToRgb,
} from "../core.js";

/* ───────────────────────────── helpers ───────────────────────────── */

/** shiftMap(a, W, dx, dy) → a sampled at (p − (dx, dy)), bilinear, 0 outside. */
function shiftMap(a, W, dx, dy) {
  const out = new Float32Array(a.length);
  const ox = Math.floor(-dx), oy = Math.floor(-dy);
  const tx = -dx - ox, ty = -dy - oy;
  for (let y = 0; y < W; y++) {
    const y0 = y + oy, y1 = y0 + 1;
    if (y1 < 0 || y0 >= W) continue;
    for (let x = 0; x < W; x++) {
      const x0 = x + ox, x1 = x0 + 1;
      if (x1 < 0 || x0 >= W) continue;
      const v00 = y0 >= 0 && x0 >= 0 ? a[y0 * W + x0] : 0, v10 = y0 >= 0 && x1 < W ? a[y0 * W + x1] : 0;
      const v01 = y1 < W && x0 >= 0 ? a[y1 * W + x0] : 0, v11 = y1 < W && x1 < W ? a[y1 * W + x1] : 0;
      out[y * W + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
  }
  return out;
}

/** Coverage of the shape {sd < 0} with interior holes filled (flood fill from the border). */
function filledCoverage(sd, W) {
  const n = W * W;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && sd[i] >= 0) { out[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((W - 1) * W + x); }
  for (let y = 0; y < W; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < n - W) push(i + W);
  }
  const cov = new Float32Array(n);
  for (let i = 0; i < n; i++) cov[i] = out[i] ? clamp(0.5 - sd[i]) : 1;
  return cov;
}

/** Interior relief 0..1 from the logo's luminance, stretched between its 4th and 96th percentile. */
function lumaRelief(small, mask, W, soft) {
  const { data } = getPixels(small);
  const n = W * W;
  const L = new Float32Array(n);
  const hist = new Uint32Array(256);
  let cnt = 0;
  const ok = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (mask[i] < 0.5 || data[j + 3] < 128) continue; // (a widened hairline has no colour)
    ok[i] = 1;
    const l = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
    L[i] = l / 255;
    hist[l]++; cnt++;
  }
  if (!cnt) return L;
  const pct = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cnt * q) return v / 255; } return 1; };
  const lo = pct(0.04), hi = pct(0.96);
  const span = hi - lo;
  if (span < 0.08) { for (let i = 0; i < n; i++) L[i] = mask[i] >= 0.5 ? 0.5 : 0; return L; }
  // outside pixels take the mean so the blur doesn't drag the edge down
  for (let i = 0; i < n; i++) L[i] = ok[i] ? clamp((L[i] - lo) / span) : 0.5;
  return soft > 0.3 ? blurMask(L, W, W, soft) : L;
}

/** 512-entry tone LUT for shade s ∈ [−1, 1]: shadow color ← base → highlight color. */
function toneLUT(base, depthTone) {
  const lut = new Uint8ClampedArray(512 * 3);
  const [h, sat, l] = rgbToHsl(hexToRgb(base));
  // highlights warm a touch toward white, shadows deepen and keep their hue
  const hiRGB = hslToRgb(h, sat * 0.85, clamp(l + 0.34 * depthTone + 0.06));
  const loRGB = hslToRgb(h, clamp(sat * 1.05), clamp(l - 0.3 * depthTone - 0.04));
  const b = hexToRgb(base);
  for (let i = 0; i < 512; i++) {
    const s = i / 255.5 - 1;
    const t = Math.min(1, Math.abs(s));
    const e = t * (2 - t); // ease-out: small slopes already read
    const tgt = s >= 0 ? hiRGB : loRGB;
    lut[i * 3] = b[0] + (tgt[0] - b[0]) * e;
    lut[i * 3 + 1] = b[1] + (tgt[1] - b[1]) * e;
    lut[i * 3 + 2] = b[2] + (tgt[2] - b[2]) * e;
  }
  return lut;
}

/* ───────────────────────────── effect ───────────────────────────── */

export default {
  id: "emboss",
  name: "Embossed",
  category: "retro",
  blurb: "Tonal raised or pressed relief. Quiet and premium.",
  method: "Heat transfer",
  stage: "paper",       // tonal on the garment; on the gallery card the relief needs a ground that contrasts
  params: [
    {
      key: "mode", label: "Finish", type: "select", default: "emboss",
      options: [
        { value: "emboss", label: "Embossed (raised)" },
        { value: "deboss", label: "Debossed (pressed)" },
        { value: "rubber", label: "Rubber patch" },
      ],
    },
    { key: "depth", label: "Depth", type: "range", min: 2, max: 30, step: 1, default: 12, unit: "px" },
    { key: "detail", label: "Inner detail", type: "range", min: 15, max: 100, step: 1, default: 60, unit: "%" },
    { key: "light", label: "Light angle", type: "range", min: 0, max: 360, step: 5, default: 135, unit: "°" },
    { key: "color", label: "Color", type: "color", default: "primary" },
    { key: "gloss", label: "Gloss", type: "range", min: 0, max: 100, step: 1, default: 40, unit: "%" },
  ],
  presets: [
    { name: "Emboss", params: { mode: "emboss", depth: 12, detail: 60, light: 135, color: "primary", gloss: 40 } },
    { name: "Deboss", params: { mode: "deboss", depth: 10, detail: 50, light: 135, color: "primary", gloss: 20 } },
    { name: "Rubber patch", params: { mode: "rubber", depth: 14, detail: 65, light: 135, color: "primary", gloss: 55 } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const scale = ctx.scale;
    const W = Math.min(S, 1024);
    const kS = W / S, toS = S / W;
    const n = W * W;
    const mode = p.mode;
    const rubber = mode === "rubber", deboss = mode === "deboss";

    let _l = performance.now();
    const mark = (k) => { const P = globalThis.__prof; if (P) { const t = performance.now(); P[k] = Math.round(t - _l); _l = t; } };
    const small = W === S ? src : resizeCanvas(src, W, W);
    let mask = alphaMask(small);
    let bevel = Math.max(1, p.depth * scale * kS);             // W px
    let lineArt = 1;                                            // > 1: strokes thinner than the bevel
    const det = p.detail / 100;

    // ── height (W): rounded bevel from the silhouette + luminance relief inside
    // signed distance, softened so the pixel staircase of the edge can't serrate the bevel;
    // `inside` runs continuously from 0 at the edge (no jump at the anti-aliased pixels)
    const soften = Math.max(0.8, 1.5 * scale * kS);
    let sdl = blurMask(signedDistance(mask, W, W), W, W, soften);
    const inside = new Float32Array(n);
    // 90th percentile of the distance to the edge = how wide the strokes are (W px)
    const strokeP90 = () => {
      for (let i = 0; i < n; i++) inside[i] = sdl[i] < 0 ? -sdl[i] : 0;
      const hist = new Uint32Array(128);
      let cnt = 0;
      for (let i = 0; i < n; i += 2) { const v = inside[i]; if (v > 0) { hist[Math.min(127, (v * 2) | 0)]++; cnt++; } }
      let acc = 0;
      for (let v = 0; v < 128; v++) { acc += hist[v]; if (acc >= cnt * 0.9) return cnt ? (v + 1) / 2 : 0; }
      return 64;
    };
    let p90 = strokeP90();
    // hairline art gets a production minimum line weight (a 1 px raised line can't be pressed)
    const minHalf = 3.6 * scale * kS;
    if (p90 > 0 && p90 < minHalf) {
      mask = dilateMask(mask, W, W, minHalf - p90);
      sdl = blurMask(signedDistance(mask, W, W), W, W, soften);
      p90 = strokeP90();
    }
    // line art can't hold a wide bevel: fit it to the strokes so thin logos still stand up
    if (p90 > 0 && bevel > p90 * 1.15) { lineArt = bevel / Math.max(1, p90 * 1.15); bevel = Math.max(1, p90 * 1.15); }
    mark("sdl");
    const relief = det > 0 ? lumaRelief(small, mask, W, Math.max(0.5, bevel * 0.16)) : null;
    const H = new Float32Array(n);
    let plateSd = null, plateCov = null;
    if (rubber) {
      // molded plate: dilated + closed silhouette (erosion via one inside-distance pass),
      // holes filled, rounded edge, raised rim, logo on top
      const border = (28 + p.depth * 0.8) * scale * kS, close = 34 * scale * kS;
      const m1 = new Float32Array(n);
      for (let i = 0; i < n; i++) m1[i] = clamp(border + close - sdl[i] + 0.5);
      const ins = insideDistance(m1, W, W);
      const closed = new Float32Array(n);
      for (let i = 0; i < n; i++) closed[i] = ins[i] > 0 ? close + 0.5 - ins[i] : close + 1; // sd-like
      plateSd = blurMask(signedDistance(filledCoverage(closed, W), W, W), W, W, 0.8); // no holes
      plateCov = new Float32Array(n);
      const rimIn = 4 * scale * kS, rimW = 7 * scale * kS;
      const edgeB = Math.max(1, 5 * scale * kS);
      for (let i = 0; i < n; i++) {
        const d = -plateSd[i];
        if (d <= -0.5) continue;
        plateCov[i] = clamp(d + 0.5);
        const te = clamp(d / edgeB), ue = 1 - te;
        let h = 0.32 * Math.sqrt(1 - ue * ue);
        const rp = (d - rimIn) / rimW;
        if (rp > -0.6 && rp < 1.6) h += 0.28 * Math.exp(-((rp - 0.5) * (rp - 0.5)) * 5);
        const logo = inside[i] > 0 ? Math.sin(clamp(inside[i] / bevel) * Math.PI * 0.5) : 0;
        h += 0.62 * logo;
        if (relief && logo > 0) h += 0.42 * det * (relief[i] - 0.5) * logo;
        H[i] = h;
      }
    } else {
      for (let i = 0; i < n; i++) {
        if (inside[i] <= 0) continue;
        const t = clamp(inside[i] / bevel);
        let h = Math.sin(t * Math.PI * 0.5);
        if (relief) h += 0.55 * det * (relief[i] - 0.5) * t;
        H[i] = deboss ? -h : h;
      }
    }
    mark("height");
    const Hs = blurMask(H, W, W, Math.max(0.7, 1.2 * scale * kS));

    // ── light (W): diffuse relative to a flat surface + Blinn specular
    const a = (p.light * Math.PI) / 180;
    const el = (38 * Math.PI) / 180;
    const Lx = Math.cos(a) * Math.cos(el), Ly = -Math.sin(a) * Math.cos(el), Lz = Math.sin(el);
    let Hx = Lx, Hy = Ly, Hz = Lz + 1;
    const hl = Math.hypot(Hx, Hy, Hz);
    Hx /= hl; Hy /= hl; Hz /= hl;
    const strength = bevel * (rubber ? 1.1 : 0.95);
    const gloss = p.gloss / 100;
    const shin = 18 + gloss * 70;
    // thin strokes have narrow bevels: push their light/shadow harder so line art still reads
    const contrast = 1.2 * (1 + 0.6 * clamp((lineArt - 1) / 2));
    const shade = new Float32Array(n), spec = new Float32Array(n);
    const flatSpec = Math.pow(Hz, shin);
    // only the rows/columns that hold relief
    let bx0 = W, bx1 = -1, by0 = W, by1 = -1;
    for (let y = 0; y < W; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) if (Hs[row + x] !== 0) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; by1 = y; }
    }
    for (let y = Math.max(0, by0 - 1); y <= Math.min(W - 1, by1 + 1); y++) {
      for (let x = Math.max(0, bx0 - 1); x <= Math.min(W - 1, bx1 + 1); x++) {
        const i = y * W + x;
        const xa = x > 0 ? i - 1 : i, xb = x < W - 1 ? i + 1 : i;
        const ya = y > 0 ? i - W : i, yb = y < W - 1 ? i + W : i;
        const dx = (Hs[xb] - Hs[xa]) * 0.5 * strength, dy = (Hs[yb] - Hs[ya]) * 0.5 * strength;
        if (dx === 0 && dy === 0) continue;
        const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const nx = -dx * nl, ny = -dy * nl, nz = nl;
        shade[i] = ((nx * Lx + ny * Ly + nz * Lz - Lz) / (1 - Lz * 0.35)) * contrast;
        const nh = nx * Hx + ny * Hy + nz * Hz;
        spec[i] = nh > 0.8 ? Math.max(0, Math.pow(nh, shin) - flatSpec) : 0;
      }
    }

    mark("light");
    // ── shadows (W)
    const offX = -Math.cos(a), offY = Math.sin(a); // away from the light
    let cast = null, lip = null;
    if (deboss) {
      // the upper wall shades the pressed floor; the lower outer lip catches light
      const sh = bevel * 0.55 + 1.5 * scale * kS;
      const outsideShift = shiftMap(mask, W, offX * sh, offY * sh);
      cast = new Float32Array(n);
      for (let i = 0; i < n; i++) cast[i] = mask[i] * (1 - outsideShift[i]);
      cast = blurMask(cast, W, W, Math.max(0.6, bevel * 0.35));
      const lipShift = shiftMap(mask, W, offX * 1.6 * scale * kS, offY * 1.6 * scale * kS);
      lip = new Float32Array(n);
      for (let i = 0; i < n; i++) lip[i] = Math.max(0, lipShift[i] - mask[i]);
      lip = blurMask(lip, W, W, Math.max(0.5, 0.8 * scale * kS));
    } else {
      const base = rubber ? plateCov : mask;
      const off = (rubber ? 4 : 2.4) * scale * kS + bevel * 0.12;
      cast = blurMask(shiftMap(base, W, offX * off, offY * off), W, W, Math.max(0.7, (rubber ? 4.5 : 2.6) * scale * kS + bevel * 0.12));
    }

    mark("shadows");
    // ── colors
    let base = p.color;
    const L0 = luminance(base);
    // a tone of the chosen color: raised = a hair lighter, pressed = a hair deeper
    // (near-white gets pulled down a step so its highlights still have somewhere to go)
    if (L0 > 0.7) base = darken(base, 0.08);
    else base = deboss ? darken(base, L0 > 0.5 ? 0.06 : 0.035) : lighten(base, 0.045 + 0.1 * clamp((lineArt - 1) / 2));
    const lut = toneLUT(base, rubber ? 0.9 : 1);
    // rubber: the molded plate sits a shade deeper than the raised artwork (two-tone depth)
    const lutPlate = rubber ? toneLUT(darken(base, luminance(base) > 0.5 ? 0.12 : 0.08), 0.9) : null;
    let logoCov = null;
    if (rubber) { logoCov = new Float32Array(n); for (let i = 0; i < n; i++) logoCov[i] = clamp(inside[i] / 1.5); }
    const shadowDark = L0 > 0.45 ? 0.3 : 0.42;

    // ── composite at S
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const d = img.data;
    const fast = W === S;
    const cx0 = new Int32Array(S), cfx = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      const xw = clamp((x + 0.5) * kS - 0.5, 0, W - 1.001);
      cx0[x] = xw | 0; cfx[x] = xw - (xw | 0);
    }
    const specK = 255 * (0.35 + 0.9 * gloss) * (rubber ? 0.8 : 1);
    // composite only where something is painted: the shape, its cast shadow / lip (W bbox → S)
    const covField = rubber ? plateSd : sdl;
    let qx0 = W, qx1 = -1, qy0 = W, qy1 = -1;
    for (let y = 0; y < W; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (covField[i] < 1 || (cast && cast[i] > 0.004) || (lip && lip[i] > 0.004)) {
          if (x < qx0) qx0 = x; if (x > qx1) qx1 = x; if (y < qy0) qy0 = y; qy1 = y;
        }
      }
    }
    const X0 = Math.max(0, Math.floor((qx0 - 1) * toS)), X1 = Math.min(S, Math.ceil((qx1 + 2) * toS));
    const Y0 = Math.max(0, Math.floor((qy0 - 1) * toS)), Y1 = Math.min(S, Math.ceil((qy1 + 2) * toS));
    for (let y = Y0; y < Y1; y++) {
      const yw = clamp((y + 0.5) * kS - 0.5, 0, W - 1.001);
      const y0 = yw | 0, fy = yw - y0;
      for (let x = X0; x < X1; x++) {
        const j = (y * S + x) * 4;
        let i00, i10, i01, i11, w00 = 1, w10 = 0, w01 = 0, w11 = 0;
        if (fast) { i00 = i10 = i01 = i11 = y * W + x; }
        else {
          const fx = cfx[x];
          i00 = y0 * W + cx0[x]; i10 = i00 + 1; i01 = i00 + W; i11 = i01 + 1;
          w00 = (1 - fx) * (1 - fy); w10 = fx * (1 - fy); w01 = (1 - fx) * fy; w11 = fx * fy;
        }
        // coverage from the same smoothed field the bevel uses, so rim and edge line up
        let A = clamp(0.5 - (covField[i00] * w00 + covField[i10] * w10 + covField[i01] * w01 + covField[i11] * w11) * toS);
        const c = cast ? cast[i00] * w00 + cast[i10] * w10 + cast[i01] * w01 + cast[i11] * w11 : 0;
        if (A <= 0) {
          // outside: soft cast shadow (emboss/rubber) or the light catching the lip (deboss)
          if (deboss) {
            const lv = lip[i00] * w00 + lip[i10] * w10 + lip[i01] * w01 + lip[i11] * w11;
            if (lv > 0.01) { d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = Math.min(255, lv * 70); }
          } else if (c > 0.01) {
            d[j + 3] = c * shadowDark * 255;
          }
          continue;
        }
        let sh = shade[i00] * w00 + shade[i10] * w10 + shade[i01] * w01 + shade[i11] * w11;
        if (deboss) sh -= c * 0.55;
        const li = clamp(Math.round((sh + 1) * 255.5), 0, 511) * 3;
        let r = lut[li], g = lut[li + 1], b = lut[li + 2];
        if (lutPlate) {
          const t = 1 - (logoCov[i00] * w00 + logoCov[i10] * w10 + logoCov[i01] * w01 + logoCov[i11] * w11);
          if (t > 0) { r += (lutPlate[li] - r) * t; g += (lutPlate[li + 1] - g) * t; b += (lutPlate[li + 2] - b) * t; }
        }
        const sp = (spec[i00] * w00 + spec[i10] * w10 + spec[i01] * w01 + spec[i11] * w11) * specK;
        if (sp > 0) { const k = sp > 255 ? 1 : sp / 255; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
        if (A < 1 && !deboss && c > 0.01) {
          // edge pixel: composite over its own cast shadow
          const sa = c * shadowDark * (1 - A);
          const tot = A + sa;
          r = (r * A) / tot; g = (g * A) / tot; b = (b * A) / tot;
          A = tot;
        }
        d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = A * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);
    mark("composite");
    return out;
  },
};
