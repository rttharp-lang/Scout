// "Engraved" — banknote engraving / linocut. One ink; every tone is drawn with lines
// whose thickness follows the darkness (a line screen), light areas stay bare fabric.
//
//   tone map (logo darkness, contrast curve) + engraver's modelling (hatching along the
//   shadow side of every light shape, so a flat white face still reads as a form) →
//   line field per style:
//     • "lines"   — parallel gouges at an angle, a little hand-cut wobble (linocut);
//     • "contour" — parallel lines that bend over every form (displaced by a pillow height
//                   built from the distance field), the classic relief engraving;
//     • "cross"   — parallel lines + a second set crossing them in the shadows;
//     • "wave"    — guilloche waves with cross-waves in the shadows (banknote);
//   → the logo's thin dark linework stays solid (it is the drawing) → bold outline.
//
// A light ink (white on a dark garment) flips the polarity: the lines then draw the
// LIGHT parts, so the image still reads the right way round. Fields at W = min(S, 1024),
// lines evaluated per output pixel (crisp at any size); sizes in 1024-units.
import {
  createCanvas, ctx2d, getPixels, resizeCanvas, clamp, smoothstep, hexToRgb, luminance,
  insideDistance, outsideDistance, blurMask, makeNoise2D, fbm, hashSeed, heightFromMask,
  normalsFromHeight,
} from "../core.js";

const OUTLINE = 7;        // bold outline width, units
const RELIEF = 46;        // modelling bevel: how far the shading reaches into a shape, units

/** Centre-aligned bilinear upsampler of a W×W map to S px, row by row (reused buffer). */
function upRows(map, W, S) {
  if (W === S) {
    const row = new Float32Array(S);
    return (y) => { row.set(map.subarray(y * S, y * S + S)); return row; };
  }
  const k = W / S;
  const ix = new Int32Array(S), fx = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    const g = clamp((x + 0.5) * k - 0.5, 0, W - 1.001);
    ix[x] = g | 0; fx[x] = g - (g | 0);
  }
  const tmp = new Float32Array(W * S);
  for (let j = 0; j < W; j++) {
    const go = j * W, to = j * S;
    for (let x = 0; x < S; x++) { const a = map[go + ix[x]]; tmp[to + x] = a + (map[go + ix[x] + 1] - a) * fx[x]; }
  }
  const row = new Float32Array(S);
  return (y) => {
    const g = clamp((y + 0.5) * k - 0.5, 0, W - 1.001);
    const j = g | 0, f = g - j;
    const a = j * S, b = a + S;
    for (let x = 0; x < S; x++) row[x] = tmp[a + x] + (tmp[b + x] - tmp[a + x]) * f;
    return row;
  };
}

/** The silhouette with enclosed transparent areas (not connected to the border) filled. */
function enclosed(alpha, W) {
  const n = W * W;
  const out = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i) => { if (!out[i] && alpha[i] < 0.3) { out[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((W - 1) * W + x); }
  for (let y = 0; y < W; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < n - W) push(i + W);
  }
  const fill = new Float32Array(n);
  for (let i = 0; i < n; i++) fill[i] = out[i] ? alpha[i] : 1;
  return fill;
}

/** Coverage of a line set: frac phase → distance to the line centre (px) vs half width. */
const lineCov = (phase, spacing, hw) => {
  const t = phase - Math.floor(phase) - 0.5;
  const d = (t < 0 ? -t : t) * spacing;
  const c = hw - d + 0.5;
  return c <= 0 ? 0 : c >= 1 ? 1 : c;
};

export default {
  id: "woodcut",
  name: "Engraved",
  category: "print",
  blurb: "Banknote engraving: tone drawn in lines, one bold ink.",
  method: "Screen print",
  stage: "paper",
  params: [
    {
      key: "style", label: "Line style", type: "select", default: "contour",
      options: [
        { value: "contour", label: "Engraving" },
        { value: "lines", label: "Parallel" },
        { value: "cross", label: "Crosshatch" },
        { value: "wave", label: "Banknote" },
      ],
    },
    { key: "spacing", label: "Line spacing", type: "range", min: 6, max: 24, step: 1, default: 11, unit: "px" },
    { key: "angle", label: "Angle", type: "range", min: 0, max: 180, step: 1, default: 35, unit: "°" },
    { key: "ink", label: "Ink", type: "color", default: "primary" },
    { key: "contrast", label: "Contrast", type: "range", min: 0, max: 100, step: 1, default: 55, unit: "%" },
    { key: "outline", label: "Bold outline", type: "toggle", default: true },
  ],
  presets: [
    { name: "Engraving", params: { style: "contour", spacing: 11, angle: 35, contrast: 55, outline: true } },
    { name: "Linocut", params: { style: "lines", spacing: 18, angle: 28, contrast: 80, outline: true } },
    { name: "Banknote", params: { style: "wave", spacing: 8, angle: 20, contrast: 45, outline: true } },
  ],

  render(src, p, ctx) {
    const S = src.width;
    const sc = ctx.scale;
    const W = Math.min(S, 1024);
    const kW = W / S;
    const n = W * W;
    const sp = Math.max(2.2, p.spacing * sc);          // line spacing, px at S
    const spW = sp * kW;
    const invert = luminance(p.ink) > 0.45;           // light ink: lines draw the lights
    const cst = p.contrast / 100;

    /* ── 1. maps at W ── */
    const small = W === S ? src : resizeCanvas(src, W, W);
    const sd = getPixels(small).data;
    const alpha = new Float32Array(n), dark = new Float32Array(n);
    let opaque = 0, inkSum = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = sd[j + 3] / 255;
      if (a <= 0) continue;
      alpha[i] = a;
      const d = 1 - (0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2]) / 255;
      dark[i] = d;
      opaque += a; inkSum += a * d;
    }
    if (opaque < 1) return createCanvas(S, S);
    // a white / pale mark has no tone of its own: engrave it as a mid-tone form
    const pale = inkSum < opaque * 0.1;
    if (pale) for (let i = 0; i < n; i++) if (alpha[i] > 0) dark[i] = 0.38;

    // smooth fields (keyline classification, modelling, outline distance) at M = W/2:
    // they are all distance-field based and interpolate cleanly
    const M = W > 256 ? Math.round(W / 2) : W;
    const kM = M / S, nM = M * M;
    const md = M === W ? sd : getPixels(resizeCanvas(small, M, M)).data;
    const alphaM = new Float32Array(nM), darkMk = new Float32Array(nM), formM = new Float32Array(nM);
    for (let i = 0, j = 0; i < nM; i++, j += 4) {
      const a = md[j + 3] / 255;
      if (a <= 0) continue;
      alphaM[i] = a;
      const d = pale ? 0.38 : 1 - (0.299 * md[j] + 0.587 * md[j + 1] + 0.114 * md[j + 2]) / 255;
      darkMk[i] = a > 0.5 && d > 0.55 ? 1 : 0;
      formM[i] = a > 0.5 && d < 0.55 ? 1 : 0;
    }

    // the logo's dark linework: thin dark strokes stay solid (they ARE the drawing)
    const rThin = Math.max(1, sp * kM * 0.7);
    const din = insideDistance(darkMk, M, M, 0.5);
    const core = new Float32Array(nM);
    for (let i = 0; i < nM; i++) core[i] = din[i] - 0.5 > rThin ? 1 : 0;
    const toCore = outsideDistance(core, M, M, 0.5);
    const thin = new Float32Array(nM);                // 1 = dark ink that is a keyline
    for (let i = 0; i < nM; i++) if (darkMk[i]) thin[i] = smoothstep(rThin - 0.5, rThin + 1, toCore[i]);

    // engraver's modelling: every light / mid shape is shaded as a rounded form lit from
    // the top-left (pillow height → normals → Lambert), so a flat white face still gets
    // lines that swell along its shadow side and thin out toward the light
    const bevel = RELIEF * sc * kM;
    const height = heightFromMask(formM, M, M, bevel);
    const { nx, ny, nz } = normalsFromHeight(height, M, M, bevel * 0.9);
    // only shapes wide enough to hold a few lines get modelled (letters and thin rings keep
    // their own tone, or they would all go dark and vanish into their surroundings)
    const fin = insideDistance(formM, M, M, 0.5);
    const rr = Math.max(1, bevel * 0.6);
    const thickN = blurMask(fin, M, M, rr), thickD = blurMask(formM, M, M, rr);
    const minWide = Math.max(sp * kM * 2.2, bevel * 0.32);
    const relief = 0.62 + 0.25 * cst;
    const shadeM = new Float32Array(nM);
    for (let i = 0; i < nM; i++) {
      if (!formM[i]) continue;
      const nl = -0.55 * nx[i] - 0.55 * ny[i] + 0.63 * nz[i];      // light from the top-left
      const wide = smoothstep(minWide * 0.6, minWide * 1.3, (thickN[i] / (thickD[i] + 1e-4)) * 2);
      shadeM[i] = clamp((0.74 - nl) * 0.9) * relief * wide;
    }
    const shadeRows = upRows(shadeM, M, W);
    const tone = new Float32Array(n), rawT = new Float32Array(n);
    const lo = 0.06 + 0.14 * cst, hi = 0.97 - 0.25 * cst;
    const edgeU = 1.6;                                  // engraved edge width, units
    const darkCap = p.style === "lines" ? 1 : 0.86;
    for (let y = 0; y < W; y++) {
      const sr = shadeRows(y);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = alpha[i];
        if (a <= 0) continue;
        const shade = dark[i] < 0.6 ? sr[x] : 0;
        const base = clamp((dark[i] - lo) / (hi - lo));
        // gamma: mid-light inks (a gold letter on a navy ring) stay light enough to read
        const t = invert ? clamp(Math.pow(1 - base, 1.5) - shade * 0.8) : clamp(Math.pow(base, 1.5) + shade * (1 - base));
        // big dark masses keep a hairline of paper between the lines (engraved, not
        // flooded); thin keylines are drawn solid separately below
        tone[i] = Math.min(t, darkCap) * (a < 1 ? smoothstep(0, 1, a) : 1);
        rawT[i] = base;
      }
    }
    const toneS = blurMask(tone, W, W, Math.max(0.5, spW * 0.1));
    // every form gets a fine engraved edge where the tone steps (letters on a ring, a gold
    // eye in a navy socket…), so flat logo shapes stay legible inside the hatching
    const edgeW = new Float32Array(n);
    for (let y = 1; y < W - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (alpha[i] < 0.5) continue;
        const t = rawT[i];
        const dmax = Math.max(Math.abs(t - rawT[i - 1]), Math.abs(t - rawT[i + 1]), Math.abs(t - rawT[i - W]), Math.abs(t - rawT[i + W]));
        // one clean line on the lighter side of the step (the darker side is ink already)
        const darker = t > Math.min(rawT[i - 1], rawT[i + 1], rawT[i - W], rawT[i + W]) + 0.02;
        if (darker === invert) edgeW[i] = smoothstep(0.16, 0.34, dmax);
      }
    }
    const edgeK = Math.max(0, edgeU * sc * kW - 1);
    const edgeM = edgeK > 0.3 ? blurMask(edgeW, W, W, edgeK * 0.5) : edgeW;
    for (let i = 0; i < n; i++) edgeM[i] = smoothstep(0.08, 0.3, edgeM[i]);

    // contour style: the parallel lines are displaced by the forms' height, so they bend
    // over every rounded shape like a relief engraving (follows the distance field, but
    // without the cusps a raw distance-to-edge phase makes on the medial axis)
    const contourRows = p.style === "contour" ? upRows(height, M, S) : null;
    // bold outline: distance outside the silhouette
    let outRows = null;
    const olw = OUTLINE * sc;
    const olIn = Math.max(1, 1.5 * sc);               // overlap into the artwork, px
    if (p.outline) {
      // signed distance (px at S, negative inside) so the outline also overlaps the logo's
      // anti-aliased edge — no hairline gap between the outline and the artwork
      const fill = enclosed(alphaM, M);
      const od = outsideDistance(fill, M, M, 0.5), idd = insideDistance(fill, M, M, 0.5);
      for (let i = 0; i < nM; i++) od[i] = (od[i] > 0 ? od[i] - 0.5 : 0.5 - idd[i]) / kM;
      outRows = upRows(od, M, S);
    }
    const toneRows = upRows(toneS, W, S);
    const edgeRows = upRows(edgeM, W, S);
    const thinRows = upRows(thin, M, S);
    // linocut wobble: low-frequency phase drift, so the gouges look hand-cut
    let wobRows = null;
    if (p.style === "lines") {
      const nz = makeNoise2D(hashSeed("woodcut-wob", ctx.seed));
      const G = 64, wob = new Float32Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) wob[j * G + i] = fbm(nz, i / 9, j / 9, 2) * 0.22;
      wobRows = upRows(wob, G, S);
    }

    /* ── 2. draw the lines at S ── */
    const fullSrc = W === S ? sd : getPixels(src).data; // crisp keylines from the full-res source
    const [ir, ig, ib] = hexToRgb(p.ink);
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    const img = o.createImageData(S, S);
    const od = img.data;
    const th = (p.angle * Math.PI) / 180;
    const ca = Math.cos(th), sa = Math.sin(th);
    const th2 = th + (p.style === "wave" ? 1.2 : Math.PI / 2);
    const cb = Math.cos(th2), sb = Math.sin(th2);
    const waveL = sp * 13, waveA = 0.55;              // guilloche wavelength (px) / amplitude (in spacings)
    const cx = S / 2, cy = S / 2;
    const half = sp * 0.5;
    const minHw = 0.18;
    for (let y = 0; y < S; y++) {
      const tr = toneRows(y), kr = thinRows(y), er = edgeRows(y);
      const cr = contourRows ? contourRows(y) : null;
      const orow = outRows ? outRows(y) : null;
      const wr = wobRows ? wobRows(y) : null;
      const yy = y + 0.5 - cy;
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        let cov = 0;
        // outline
        if (orow) {
          const d = orow[x];
          if (d > -olIn - 1 && d < olw + 1) cov = clamp(olw - d + 0.5) * clamp(d + olIn + 0.5);
        }
        const t = tr[x];
        if (t > 0.01) {
          const hw = t * (half + 0.7);              // t = 1 → neighbouring lines fuse (solid)
          if (hw > minHw) {
            const xx = x + 0.5 - cx;
            const u = xx * ca + yy * sa, v = -xx * sa + yy * ca; // along / across set 1
            let c1;
            if (cr) c1 = lineCov(v / sp - cr[x] * 1.6, sp, hw);
            else if (p.style === "wave") c1 = lineCov(v / sp + waveA * Math.sin((u / waveL) * 6.2832), sp, hw);
            else c1 = lineCov(v / sp + (wr ? wr[x] : 0), sp, hw);
            if (c1 > cov) cov = c1;
            // second set in the shadows (cross / wave; contour gets straight cross-lines)
            if ((p.style === "cross" || p.style === "wave" || p.style === "contour") && t > 0.5) {
              const t2 = (t - 0.5) / 0.5;
              const hw2 = t2 * (half + 0.7) * (p.style === "contour" ? 0.75 : 0.9);
              if (hw2 > minHw) {
                const v2 = -xx * sb + yy * cb, u2 = xx * cb + yy * sb;
                const ph = p.style === "wave" ? v2 / sp + waveA * Math.sin((u2 / waveL) * 6.2832 + 1.3) : v2 / sp;
                const c2 = lineCov(ph, sp, hw2);
                if (c2 > cov) cov = c2;
              }
            }
          }
        }
        if (er[x] > cov) cov = er[x];
        // keylines: the logo's thin dark strokes, solid (from the full-res source)
        const kk = kr[x];
        if (kk > 0.02 && !invert) {
          const j = i * 4;
          const d = 1 - (0.299 * fullSrc[j] + 0.587 * fullSrc[j + 1] + 0.114 * fullSrc[j + 2]) / 255;
          const k = kk * (fullSrc[j + 3] / 255) * smoothstep(0.45, 0.62, d);
          if (k > cov) cov = k;
        }
        if (cov <= 0.002) continue;
        const j = i * 4;
        od[j] = ir; od[j + 1] = ig; od[j + 2] = ib; od[j + 3] = cov * 255 + 0.5;
      }
    }
    o.putImageData(img, 0, 0);
    return out;
  },
};
