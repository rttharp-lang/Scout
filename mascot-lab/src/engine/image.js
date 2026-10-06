// Mascot Lab — logo loading and preparation: decode (incl. crisp SVG rasterization),
// background removal, trimming, the square effect source, and palette extraction.
import {
  createCanvas, ctx2d, cloneCanvas, resizeCanvas, getPixels, canvasFromImageData,
  rng, rgbToHex, hexToRgb, rgbToHsl, hslToHex, luminance, contrastRatio, clamp,
  SRGB_TO_LINEAR,
} from "./core.js";
import { sanitizeSvg } from "./sanitizeSvg.js";

/** SAFE — the logo is fitted inside the central 72% of every effect source. */
export const SAFE = 0.72;
const SVG_LONG_SIDE = 2048;

/* ─────────────────────────────── loading ────────────────────────────── */

function loadImgElement(url, crossOrigin = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin && !/^(data|blob):/.test(url)) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image file."));
    img.src = url;
  });
}

const parseLen = (v) => {
  if (v == null) return NaN;
  const m = String(v).trim().match(/^([0-9.]+)\s*(px|pt|mm|cm|in)?$/i);
  if (!m) return NaN; // %, em… → unknown
  const n = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  return n * ({ px: 1, pt: 4 / 3, mm: 3.7795, cm: 37.795, in: 96 }[unit] || 1);
};

/** rasterizeSvgText(svgText, longSide = 2048) → canvas: SVG drawn crisply at an explicit size. */
export async function rasterizeSvgText(svgText, longSide = SVG_LONG_SIDE) {
  // sanitized first: an SVG with a <foreignObject> (every Illustrator "preserve editing"
  // export has one inside a <switch>) TAINTS the canvas it is drawn into, so the pixels
  // could never be read back (background removal, palette, every effect)
  const doc = new DOMParser().parseFromString(sanitizeSvg(svgText) ?? String(svgText ?? ""), "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) {
    throw new Error("That SVG file couldn't be read.");
  }
  let w = parseLen(svg.getAttribute("width"));
  let h = parseLen(svg.getAttribute("height"));
  const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const hasVB = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  if (!(w > 0 && h > 0)) {
    if (hasVB) {
      if (w > 0) h = (w * vb[3]) / vb[2];
      else if (h > 0) w = (h * vb[2]) / vb[3];
      else { w = vb[2]; h = vb[3]; }
    } else { w = 1024; h = 1024; }
  }
  if (!hasVB) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const k = longSide / Math.max(w, h);
  const W = Math.max(1, Math.round(w * k));
  const H = Math.max(1, Math.round(h * k));
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  if (!svg.getAttribute("preserveAspectRatio")) svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const text = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const img = await loadImgElement(url, false);
    const c = createCanvas(W, H);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, W, H);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Nothing downstream uses more than 1600 px (prepareLogo) or 2048 px (SVG), so a raster is
// drawn at most this big: a 300 KB PNG can declare 16000×16000 px, and copying that at
// full size (canvas, clone, resize steps) costs gigabytes and kills phone tabs.
const MAX_DECODE_SIDE = 4096;
/**
 * MAX_IMAGE_PIXELS — rasters with more pixels than this are refused BEFORE they are drawn
 * (drawing decodes the whole image: 40 MP is 160 MB of RGBA; a 16000² PNG would be 1 GB).
 * The size check reads only naturalWidth/Height, which the browser has from the file header.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

/** checkImageSize(w, h) — throws an Error with code "too-large" (and width/height) past the limit. */
export function checkImageSize(w, h) {
  if (w * h <= MAX_IMAGE_PIXELS) return;
  const e = new Error(`That image is ${w} × ${h} px (${Math.round((w * h) / 1e6)} megapixels); the limit is ${MAX_IMAGE_PIXELS / 1e6} megapixels.`);
  e.code = "too-large";
  e.width = w;
  e.height = h;
  throw e;
}

function imageToCanvas(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("That image is empty.");
  checkImageSize(w, h);
  const k = Math.min(1, MAX_DECODE_SIDE / Math.max(w, h));
  const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  const c = createCanvas(W, H);
  const x = ctx2d(c);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(img, 0, 0, W, H);
  return c;
}

const isSvgName = (s) => /\.svgz?($|[?#])/i.test(s || "");

/** loadImageFromFile(file) → canvas. png/jpg/webp/gif/svg; SVG rasterized at 2048 on the long side. */
export async function loadImageFromFile(file) {
  if (!file) throw new Error("No file selected.");
  const type = (file.type || "").toLowerCase();
  if (type.includes("svg") || isSvgName(file.name)) return rasterizeSvgText(await file.text());
  if (type && !type.startsWith("image/")) throw new Error("Please choose an image file (PNG, JPG, SVG, WebP).");
  const url = URL.createObjectURL(file);
  try {
    return imageToCanvas(await loadImgElement(url, false));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Text of a data: URL, decoded in JS (no fetch(): an Artifact frame's CSP may block connect-src data:). */
function dataUrlText(url) {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const meta = url.slice(5, comma), body = url.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(body.replace(/\s+/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

/** loadImageFromUrl(url) → canvas (same-origin / data / blob URLs; SVG rasterized crisply). */
export async function loadImageFromUrl(url) {
  const svgData = /^data:image\/svg\+xml/i.test(url);
  if (svgData) {
    // the single-file Artifact build inlines the sample SVGs as data: URLs
    const text = dataUrlText(url);
    if (text != null) return rasterizeSvgText(text);
  }
  if (svgData || isSvgName(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status}).`);
    return rasterizeSvgText(await res.text());
  }
  return imageToCanvas(await loadImgElement(url));
}

/* ───────────────────────────── inspection ───────────────────────────── */

/** hasTransparency(canvas) — true when a meaningful share of pixels is (semi-)transparent. */
export function hasTransparency(canvas) {
  const { data } = getPixels(canvas);
  const n = canvas.width * canvas.height;
  let count = 0;
  const need = Math.max(16, n * 0.001);
  for (let j = 3; j < data.length; j += 4) {
    if (data[j] < 250 && ++count >= need) return true;
  }
  return false;
}

// weighted ("redmean") RGB distance, scaled so greys match plain Euclidean RGB distance
function colorDist(r1, g1, b1, r2, g2, b2) {
  const rm = (r1 + r2) * 0.5;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3);
}

/* ───────────────────────── background removal ───────────────────────── */

/**
 * removeBackground(canvas, tolerance = 28, { holes = "auto" } = {}) → { canvas, removed }.
 * If ≥85% of the 1px border is one near-uniform color, flood-fills (queue, no recursion)
 * from the border through pixels within `tolerance` of it, un-mixes and feathers the
 * boundary 1px. Enclosed regions survive (white eyes/teeth inside a mascot) — except, in
 * "auto", exact-background counters of a single-ink mark (letter holes). holes: "auto" |
 * "keep" | "clear". Returns the input canvas untouched with removed=false otherwise.
 */
export function removeBackground(canvas, tolerance = 28, { holes = "auto" } = {}) {
  const w = canvas.width, h = canvas.height;
  if (w < 3 || h < 3) return { canvas, removed: false };
  const img = getPixels(canvas);
  const d = img.data;
  const n = w * h;

  // 1. border ring → median color + uniformity
  const ring = [];
  for (let x = 0; x < w; x++) ring.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) ring.push(y * w, y * w + w - 1);
  const rs = [], gs = [], bs = [];
  let opaqueBorder = 0;
  for (const i of ring) {
    const j = i * 4;
    if (d[j + 3] >= 200) opaqueBorder++;
    rs.push(d[j]); gs.push(d[j + 1]); bs.push(d[j + 2]);
  }
  if (opaqueBorder < ring.length * 0.85) return { canvas, removed: false };
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const br = med(rs), bg = med(gs), bb = med(bs);
  let near = 0;
  for (const i of ring) {
    const j = i * 4;
    if (colorDist(d[j], d[j + 1], d[j + 2], br, bg, bb) <= tolerance) near++;
  }
  if (near < ring.length * 0.85) return { canvas, removed: false };

  // 2. flood fill from the border through background-like pixels
  const removed = new Uint8Array(n);
  const close = new Uint8Array(n); // within tolerance of the bg color
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (d[j + 3] < 8 || colorDist(d[j], d[j + 1], d[j + 2], br, bg, bb) <= tolerance) close[i] = 1;
  }
  const queue = new Int32Array(n);
  const flood = (seeds) => {
    let head = 0, tail = 0;
    for (const i of seeds) if (close[i] && !removed[i]) { removed[i] = 1; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0 && close[i - 1] && !removed[i - 1]) { removed[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < w - 1 && close[i + 1] && !removed[i + 1]) { removed[i + 1] = 1; queue[tail++] = i + 1; }
      if (i >= w && close[i - w] && !removed[i - w]) { removed[i - w] = 1; queue[tail++] = i - w; }
      if (i < n - w && close[i + w] && !removed[i + w]) { removed[i + w] = 1; queue[tail++] = i + w; }
    }
  };
  flood(ring);

  // 3. enclosed regions: only exact-background counters of a single-ink mark
  if (holes !== "keep") {
    const exactTol = Math.max(6, tolerance * 0.35);
    let clear = holes === "clear";
    if (!clear) {
      // single ink? — ink pixels (kept, clearly not bg) mostly one color
      let cnt = 0, sr = 0, sg = 0, sb = 0;
      const step = Math.max(1, Math.floor(n / 60000));
      for (let i = 0; i < n; i += step) {
        const j = i * 4;
        if (removed[i] || d[j + 3] < 200) continue;
        if (colorDist(d[j], d[j + 1], d[j + 2], br, bg, bb) < tolerance * 3) continue;
        cnt++; sr += d[j]; sg += d[j + 1]; sb += d[j + 2];
      }
      if (cnt > 50) {
        sr /= cnt; sg /= cnt; sb /= cnt;
        let within = 0;
        for (let i = 0; i < n; i += step) {
          const j = i * 4;
          if (removed[i] || d[j + 3] < 200) continue;
          if (colorDist(d[j], d[j + 1], d[j + 2], br, bg, bb) < tolerance * 3) continue;
          if (colorDist(d[j], d[j + 1], d[j + 2], sr, sg, sb) <= 48) within++;
        }
        clear = within >= cnt * 0.92;
      }
    }
    if (clear) {
      const seeds = [];
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        if (!removed[i] && d[j + 3] >= 200 && colorDist(d[j], d[j + 1], d[j + 2], br, bg, bb) <= exactTol) seeds.push(i);
      }
      if (seeds.length) flood(seeds);
    }
  }

  let removedCount = 0;
  for (let i = 0; i < n; i++) removedCount += removed[i];
  if (removedCount === 0 || removedCount === n) return { canvas, removed: false };

  // 4. boundary: un-mix the background out of edge pixels + 1px feather
  const out = new Uint8ClampedArray(d);
  for (let i = 0; i < n; i++) if (removed[i]) out[i * 4 + 3] = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (removed[i]) continue;
      let rn = 0; // removed 8-neighbours
      for (let oy = -1; oy <= 1; oy++) {
        const yy = y + oy;
        if (yy < 0 || yy >= h) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox;
          if ((ox || oy) && xx >= 0 && xx < w && removed[yy * w + xx]) rn++;
        }
      }
      if (!rn) continue;
      const j = i * 4;
      // foreground reference = mean of nearby interior pixels (not touching the bg)
      let fr = 0, fg = 0, fb = 0, fc = 0;
      for (let oy = -2; oy <= 2; oy++) {
        const yy = y + oy;
        if (yy < 1 || yy >= h - 1) continue;
        for (let ox = -2; ox <= 2; ox++) {
          const xx = x + ox;
          if (xx < 1 || xx >= w - 1) continue;
          const k = yy * w + xx;
          if (removed[k] || removed[k - 1] || removed[k + 1] || removed[k - w] || removed[k + w]) continue;
          const kj = k * 4;
          fr += d[kj]; fg += d[kj + 1]; fb += d[kj + 2]; fc++;
        }
      }
      const pr = d[j], pg = d[j + 1], pb = d[j + 2];
      let a;
      let cr = pr, cg = pg, cb = pb;
      if (fc) {
        fr /= fc; fg /= fc; fb /= fc;
        const vx = fr - br, vy = fg - bg, vz = fb - bb;
        const len2 = vx * vx + vy * vy + vz * vz;
        if (len2 > 900) {
          a = clamp(((pr - br) * vx + (pg - bg) * vy + (pb - bb) * vz) / len2);
          if (a > 0.02) { // un-premultiply against the background
            cr = br + (pr - br) / a; cg = bg + (pg - bg) / a; cb = bb + (pb - bb) / a;
          }
        } else a = clamp(colorDist(pr, pg, pb, br, bg, bb) / (tolerance * 3));
      } else {
        a = clamp(colorDist(pr, pg, pb, br, bg, bb) / (tolerance * 3));
      }
      const feather = 0.5 + (8 - rn) / 16; // straight edge ≈ .81, corner ≈ .69, spur ≈ .56
      a = Math.min(a, feather) * (d[j + 3] / 255);
      out[j] = cr; out[j + 1] = cg; out[j + 2] = cb;
      out[j + 3] = a * 255 + 0.5;
    }
  }
  const res = createCanvas(w, h);
  ctx2d(res).putImageData(new ImageData(out, w, h), 0, 0);
  return { canvas: res, removed: true };
}

/* ─────────────────────────────── trimming ───────────────────────────── */

/** trimTransparent(canvas, alphaThreshold = 8) → new canvas cropped to pixels with alpha > threshold. */
export function trimTransparent(canvas, alphaThreshold = 8) {
  const w = canvas.width, h = canvas.height;
  const { data } = getPixels(canvas);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    let j = y * w * 4 + 3;
    for (let x = 0; x < w; x++, j += 4) {
      if (data[j] > alphaThreshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return cloneCanvas(canvas);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = createCanvas(cw, ch);
  ctx2d(out).drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
  return out;
}

/* ─────────────────────────────── prepare ────────────────────────────── */

/**
 * prepareLogo(input, { removeBg = "auto", tolerance = 28, maxSide = 1600 }) →
 *   { canvas, bgRemoved, hadAlpha, width, height }. input: File | URL string | canvas.
 * removeBg: "auto" (only when the image has no transparency) | true | false.
 */
export async function prepareLogo(input, { removeBg = "auto", tolerance = 28, maxSide = 1600 } = {}) {
  let c;
  if (typeof input === "string") c = await loadImageFromUrl(input);
  else if (input && typeof input.getContext === "function") c = cloneCanvas(input);
  else if (input && typeof input.arrayBuffer === "function") c = await loadImageFromFile(input);
  else if (input && (input.naturalWidth || (typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap))) c = imageToCanvas(input);
  else throw new Error("Unsupported logo input.");
  const long = Math.max(c.width, c.height);
  if (long > maxSide) c = resizeCanvas(c, (c.width * maxSide) / long, (c.height * maxSide) / long);
  const hadAlpha = hasTransparency(c);
  let bgRemoved = false;
  const want = removeBg === true || removeBg === "on" || (removeBg === "auto" && !hadAlpha);
  if (want) {
    const r = removeBackground(c, tolerance);
    if (r.removed) { c = r.canvas; bgRemoved = true; }
  }
  c = trimTransparent(c);
  return { canvas: c, bgRemoved, hadAlpha, width: c.width, height: c.height };
}

/** makeSource(logoCanvas, size) → square size×size canvas, logo fitted (contain) in the central SAFE box. */
export function makeSource(logoCanvas, size) {
  const S = Math.max(1, Math.round(size));
  const out = createCanvas(S, S);
  const lw = logoCanvas.width, lh = logoCanvas.height;
  if (!lw || !lh) return out;
  const box = S * SAFE;
  const k = Math.min(box / lw, box / lh);
  const w = Math.max(1, Math.round(lw * k)), h = Math.max(1, Math.round(lh * k));
  const scaled = k < 0.5 ? resizeCanvas(logoCanvas, w, h) : logoCanvas;
  const x = ctx2d(out);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(scaled, Math.round((S - w) / 2), Math.round((S - h) / 2), w, h);
  return out;
}

/* ─────────────────────────────── palette ────────────────────────────── */

// sRGB 8-bit → OKLab (perceptual space for clustering)
function toOklab(r, g, b, out, o) {
  const lr = SRGB_TO_LINEAR[r], lg = SRGB_TO_LINEAR[g], lb = SRGB_TO_LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/**
 * extractPalette(canvas, k = 6, { maxSamples = 20000 }) → [{ hex, weight }] sorted by weight
 * (sums to 1). k-means in OKLab on ≤maxSamples sampled opaque pixels, deterministic k-means++ init,
 * near-duplicate clusters merged. Hexes are the mean sRGB of each cluster.
 */
export function extractPalette(canvas, k = 6, { maxSamples = 20000 } = {}) {
  const { data } = getPixels(canvas);
  const n = canvas.width * canvas.height;
  let opaque = 0;
  for (let j = 3; j < data.length; j += 4) if (data[j] >= 200) opaque++;
  if (!opaque) return [];
  const step = Math.max(1, Math.ceil(opaque / maxSamples));
  const cap = Math.ceil(opaque / step) + 1;
  const lab = new Float32Array(cap * 3);
  const rgb = new Uint8Array(cap * 3);
  let m = 0, seen = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (data[j + 3] < 200) continue;
    if (seen++ % step) continue;
    rgb[m * 3] = data[j]; rgb[m * 3 + 1] = data[j + 1]; rgb[m * 3 + 2] = data[j + 2];
    toOklab(data[j], data[j + 1], data[j + 2], lab, m * 3);
    m++;
  }
  k = Math.max(1, Math.min(k, m));
  const rand = rng(0x5eed + m);
  const cent = new Float32Array(k * 3);
  // k-means++ init
  const dmin = new Float32Array(m).fill(Infinity);
  let first = Math.floor(rand() * m);
  cent.set(lab.subarray(first * 3, first * 3 + 3), 0);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    const px = cent[(c - 1) * 3], py = cent[(c - 1) * 3 + 1], pz = cent[(c - 1) * 3 + 2];
    for (let i = 0; i < m; i++) {
      const dx = lab[i * 3] - px, dy = lab[i * 3 + 1] - py, dz = lab[i * 3 + 2] - pz;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd < dmin[i]) dmin[i] = dd;
      sum += dmin[i];
    }
    let pick = 0;
    if (sum > 0) {
      let t = rand() * sum;
      for (pick = 0; pick < m - 1; pick++) { t -= dmin[pick]; if (t <= 0) break; }
    }
    cent.set(lab.subarray(pick * 3, pick * 3 + 3), c * 3);
  }
  const assign = new Uint8Array(m);
  const acc = new Float64Array(k * 4);
  for (let it = 0; it < 16; it++) {
    let changed = 0;
    acc.fill(0);
    for (let i = 0; i < m; i++) {
      const x = lab[i * 3], y = lab[i * 3 + 1], z = lab[i * 3 + 2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dx = x - cent[c * 3], dy = y - cent[c * 3 + 1], dz = z - cent[c * 3 + 2];
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) { bd = dd; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; changed++; }
      acc[best * 4] += x; acc[best * 4 + 1] += y; acc[best * 4 + 2] += z; acc[best * 4 + 3]++;
    }
    for (let c = 0; c < k; c++) {
      const cnt = acc[c * 4 + 3];
      if (cnt) { cent[c * 3] = acc[c * 4] / cnt; cent[c * 3 + 1] = acc[c * 4 + 1] / cnt; cent[c * 3 + 2] = acc[c * 4 + 2] / cnt; }
    }
    if (it > 0 && changed === 0) break;
  }
  // clusters: mean sRGB + weight
  let clusters = [];
  for (let c = 0; c < k; c++) clusters.push({ r: 0, g: 0, b: 0, n: 0, L: cent[c * 3], A: cent[c * 3 + 1], B: cent[c * 3 + 2] });
  for (let i = 0; i < m; i++) {
    const cl = clusters[assign[i]];
    cl.r += rgb[i * 3]; cl.g += rgb[i * 3 + 1]; cl.b += rgb[i * 3 + 2]; cl.n++;
  }
  clusters = clusters.filter((c) => c.n > 0);
  // merge near-duplicates (OKLab ΔE < 0.05)
  clusters.sort((a, b) => b.n - a.n);
  const merged = [];
  for (const c of clusters) {
    const hit = merged.find((p) => Math.hypot(p.L - c.L, p.A - c.A, p.B - c.B) < 0.05);
    if (hit) {
      const t = hit.n + c.n;
      hit.L = (hit.L * hit.n + c.L * c.n) / t; hit.A = (hit.A * hit.n + c.A * c.n) / t; hit.B = (hit.B * hit.n + c.B * c.n) / t;
      hit.r += c.r; hit.g += c.g; hit.b += c.b; hit.n = t;
    } else merged.push({ ...c });
  }
  return merged
    .map((c) => ({ hex: rgbToHex(c.r / c.n, c.g / c.n, c.b / c.n), weight: c.n / m }))
    .sort((a, b) => b.weight - a.weight);
}

const isNearBlack = ([, s, l]) => l < 0.1 || (l < 0.17 && s < 0.25);
const isNearWhite = ([, s, l]) => l > 0.93 || (l > 0.8 && s < 0.2);
// "saturated" = real chroma (HSL saturation overstates tints like light steel greys)
const chromaOf = (hex) => { const [r, g, b] = hexToRgb(hex); return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
const isSaturated = (hsl, hex) => chromaOf(hex) >= 0.13 && hsl[1] >= 0.22 && !isNearBlack(hsl) && !isNearWhite(hsl);
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * suggestPalette(canvas) → { primary, secondary, accent, dark, light } ("#RRGGBB").
 * primary = most prominent saturated color (not near-black/white); secondary = next most
 * prominent color that contrasts with it (fallback: athletic gold, or primary's complement);
 * accent = white if both are dark (or the logo carries a real white) else near-black.
 */
export function suggestPalette(canvas) {
  const pal = extractPalette(canvas, 7).map((p) => ({ ...p, hsl: rgbToHsl(hexToRgb(p.hex)) }));
  const dark = "#0B0D10", light = "#F4F5F7";
  if (!pal.length) return { primary: "#13294B", secondary: "#F2A900", accent: "#FFFFFF", dark, light };
  const sat = pal.filter((p) => isSaturated(p.hsl, p.hex) && p.weight >= 0.015);
  const mid = pal.filter((p) => !isNearBlack(p.hsl) && !isNearWhite(p.hsl) && p.weight >= 0.02);
  const primaryP = sat[0] || mid[0] || pal.find((p) => !isNearWhite(p.hsl)) || pal[0];
  const primary = primaryP.hex;
  const goodPair = (p) =>
    p !== primaryP && !isNearWhite(p.hsl) && p.weight >= 0.01 &&
    (contrastRatio(p.hex, primary) >= 1.9 || hueDist(p.hsl[0], primaryP.hsl[0]) >= 40 && p.hsl[1] > 0.3) &&
    Math.hypot(...hexToRgb(p.hex).map((v, i) => v - hexToRgb(primary)[i])) > 60;
  let secondaryP = pal.find((p) => isSaturated(p.hsl, p.hex) && goodPair(p)) ||
    pal.find((p) => !isNearBlack(p.hsl) && chromaOf(p.hex) >= 0.08 && goodPair(p));
  let secondary = secondaryP?.hex;
  if (!secondary) {
    const gold = "#F2A900";
    const goldHsl = rgbToHsl(hexToRgb(gold));
    if (contrastRatio(gold, primary) >= 2.2 && hueDist(goldHsl[0], primaryP.hsl[0]) > 30) secondary = gold;
    else {
      const [h, s] = primaryP.hsl;
      const lp = luminance(primary);
      secondary = hslToHex(h + 180, Math.max(0.55, s), lp > 0.3 ? 0.22 : 0.62);
    }
  }
  const isDark = (hex) => luminance(hex) < 0.22;
  const whiteWeight = pal.filter((p) => isNearWhite(p.hsl)).reduce((t, p) => t + p.weight, 0);
  const accent = (isDark(primary) && isDark(secondary)) || (whiteWeight >= 0.06 && isDark(primary)) ? "#FFFFFF" : dark;
  return { primary, secondary, accent, dark, light };
}

/** canvasToDataURL(canvas, maxSide = 1024) → PNG data URL, downscaled to maxSide if larger. */
export function canvasToDataURL(canvas, maxSide = 1024) {
  const long = Math.max(canvas.width, canvas.height);
  const c = long > maxSide ? resizeCanvas(canvas, (canvas.width * maxSide) / long, (canvas.height * maxSide) / long) : canvas;
  return c.toDataURL("image/png");
}
