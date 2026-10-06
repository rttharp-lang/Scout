// Mascot Lab — fabric textures for garment mockups.
//
// Each fabric is a small tileable RGBA tile made of black and white marks with
// alpha. Painted with plain source-over, a black mark at alpha a is exactly a
// multiply by (1 − a) and a white mark at alpha a is exactly a screen by a — so
// one pattern fill both darkens (perforations, grain shadows) and lifts (yarn
// sheen) and reads on navy, gold and white garments alike.
//
// Tiles are rasterised once per fabric per pixel density (px per artboard unit)
// with a seeded RNG, so the texture is deterministic and drawn 1:1 in device
// pixels (no resampling moiré). Feature sizes are in artboard units (1000 = the
// full mockup board), so the cloth looks the same at 300 px and at 1600 px apart
// from resolution.

/** Fabrics the renderer knows; garments pick one with `fabric`. */
export const FABRICS = {
  mesh: { label: "Mesh", note: "Perforated performance mesh", strength: 0.5 },
  fleece: { label: "Fleece", note: "Brushed-back heather fleece", strength: 0.55 },
  knit: { label: "Knit", note: "Fine jersey knit", strength: 0.5 },
  woven: { label: "Woven", note: "Twill-weave warm-up shell", strength: 0.5 },
};

/* ───────────────────────────── helpers ───────────────────────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

const ink = (a) => `rgba(0,0,0,${a.toFixed(3)})`;
const light = (a) => `rgba(255,255,255,${a.toFixed(3)})`;

/** Draw `fn(dx, dy)` at the 9 wrap offsets so marks crossing a tile edge reappear opposite. */
function wrap9(W, H, fn) {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) fn(i * W, j * H);
}

/* ───────────────────────────── generators ────────────────────────────
 * gen(ctx, W, H, k, rand) — W×H px tile; k = px per artboard unit.
 */

// Perforated mesh: hex grid of small holes. Each hole = a soft dark pit with a light
// lip on its lower edge (light catching the far wall), on a faint knit ground.
function genMesh(x, W, H, k, rand) {
  const cols = 10, rows = 10;                 // rows even so the hex offset wraps
  const sx = W / cols, sy = H / rows;
  const r = Math.max(0.45, 0.95 * k);         // hole radius in px
  // knit ground between holes — very faint vertical grain
  for (let i = 0; i < W; i += Math.max(1, 1.6 * k)) {
    x.fillStyle = ink(0.04 + rand() * 0.05);
    x.fillRect(i, 0, Math.max(0.5, 0.45 * k), H);
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = (col + (row % 2 ? 0.5 : 0) + 0.5) * sx;
      const cy = (row + 0.5) * sy;
      const a = 0.24 + rand() * 0.12;
      wrap9(W, H, (dx, dy) => {
        const px = cx + dx, py = cy + dy;
        if (px < -3 * r || py < -3 * r || px > W + 3 * r || py > H + 3 * r) return;
        // light lip just below the hole
        x.fillStyle = light(0.12 + a * 0.4);
        x.beginPath(); x.ellipse(px, py + r * 0.55, r * 1.05, r * 0.8, 0, 0, Math.PI * 2); x.fill();
        // the pit
        x.fillStyle = ink(a);
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      });
    }
  }
}

// Brushed fleece: heather — a dense fuzz of very short fibres, light and dark, plus
// broad low-contrast mottling so a big flat panel never looks like a single fill.
function genFleece(x, W, H, k, rand) {
  // mottling: big, soft, low-contrast blobs (many, so no single blob reads as a repeat)
  const blobs = 70;
  for (let i = 0; i < blobs; i++) {
    const cx = rand() * W, cy = rand() * H, rr = (14 + rand() * 26) * k;
    const dark = rand() < 0.5;
    const a = 0.012 + rand() * 0.02;
    wrap9(W, H, (dx, dy) => {
      const px = cx + dx, py = cy + dy;
      if (px < -rr || py < -rr || px > W + rr || py > H + rr) return;
      const g = x.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, dark ? ink(a) : light(a));
      g.addColorStop(1, dark ? ink(0) : light(0));
      x.fillStyle = g;
      x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    });
  }
  // fibres: short, fine, mostly near-vertical (brushed nap), low contrast
  const area = (W / k) * (H / k);              // artboard units²
  const n = Math.round(area * 0.34);
  x.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const cx = rand() * W, cy = rand() * H;
    const len = (0.5 + rand() * 1.1) * k;
    const ang = Math.PI / 2 + (rand() - 0.5) * 1.6;
    const dark = rand() < 0.5;
    const a = dark ? 0.05 + rand() * 0.09 : 0.04 + rand() * 0.08;
    x.strokeStyle = dark ? ink(a) : light(a);
    x.lineWidth = Math.max(0.5, (0.3 + rand() * 0.25) * k);
    const ex = Math.cos(ang) * len / 2, ey = Math.sin(ang) * len / 2;
    wrap9(W, H, (dx, dy) => {
      const px = cx + dx, py = cy + dy;
      if (px < -len || py < -len || px > W + len || py > H + len) return;
      x.beginPath(); x.moveTo(px - ex, py - ey); x.lineTo(px + ex, py + ey); x.stroke();
    });
  }
}

// Jersey knit: columns of tiny V stitches (wales) with per-wale yarn irregularity.
function genKnit(x, W, H, k, rand) {
  const wales = 24, courses = 28;
  const sx = W / wales, sy = H / courses;
  const lw = Math.max(0.5, 0.42 * k);
  x.lineCap = "round";
  for (let c = 0; c < wales; c++) {
    const wa = 0.08 + rand() * 0.045;         // this wale's yarn tone
    for (let r = 0; r < courses; r++) {
      const cx = (c + 0.5) * sx, cy = (r + 0.5) * sy;
      const a = wa * (0.75 + rand() * 0.5);
      // V: two legs leaning in
      x.strokeStyle = ink(a);
      x.lineWidth = lw;
      x.beginPath();
      x.moveTo(cx - sx * 0.38, cy - sy * 0.42);
      x.lineTo(cx, cy + sy * 0.4);
      x.lineTo(cx + sx * 0.38, cy - sy * 0.42);
      x.stroke();
      // sheen on the loop crown
      x.strokeStyle = light(a * 0.7);
      x.beginPath();
      x.moveTo(cx - sx * 0.2, cy - sy * 0.05);
      x.lineTo(cx, cy + sy * 0.18);
      x.stroke();
    }
  }
}

// Twill: fine diagonal ribs (45°, so they wrap in a square tile) with slub noise.
function genWoven(x, W, H, k, rand) {
  const lines = 18;
  const step = W / lines;
  x.lineCap = "butt";
  for (let i = -lines; i <= lines * 2; i++) {
    const a = 0.07 + rand() * 0.07;
    const off = i * step;
    x.strokeStyle = ink(a);
    x.lineWidth = Math.max(0.5, step * 0.38);
    x.beginPath(); x.moveTo(off, 0); x.lineTo(off + H, H); x.stroke();
    x.strokeStyle = light(a * 0.75);
    x.lineWidth = Math.max(0.4, step * 0.18);
    x.beginPath(); x.moveTo(off + step * 0.5, 0); x.lineTo(off + step * 0.5 + H, H); x.stroke();
  }
  // slubs
  const n = Math.round((W / k) * (H / k) * 0.02);
  for (let i = 0; i < n; i++) {
    const cx = rand() * W, cy = rand() * H, len = (1.5 + rand() * 3) * k;
    x.strokeStyle = rand() < 0.5 ? ink(0.06) : light(0.06);
    x.lineWidth = Math.max(0.5, 0.6 * k);
    wrap9(W, H, (dx, dy) => {
      x.beginPath(); x.moveTo(cx + dx, cy + dy); x.lineTo(cx + dx + len * 0.7, cy + dy + len * 0.7); x.stroke();
    });
  }
}

const GENERATORS = {
  // tile size in artboard units (square-ish; mesh is hex so it is taller than wide)
  mesh: { gen: genMesh, w: 58, h: 50.23, seed: 0x6d657368 },  // 10 cols × 10 hex rows: h = 10 · 5.8 · 0.866
  fleece: { gen: genFleece, w: 220, h: 220, seed: 0x666c6565 },
  knit: { gen: genKnit, w: 60, h: 56, seed: 0x6b6e6974 },
  woven: { gen: genWoven, w: 54, h: 54, seed: 0x776f7665 },
};

/* ───────────────────────────── public API ───────────────────────────── */

const tileCache = new Map(); // `${fabric}|${k}` → canvas

/** Round px-per-unit to a few significant steps so nearby sizes share a tile. */
const bucket = (k) => Math.max(0.05, Math.round(k * 50) / 50);

/**
 * getFabricTile(fabric, k) → tileable canvas (black/white marks with alpha) for
 * `k` device px per artboard unit. Unknown fabrics fall back to "knit".
 */
export function getFabricTile(fabric, k) {
  const f = GENERATORS[fabric] ? fabric : "knit";
  const kb = bucket(k);
  const key = `${f}|${kb}`;
  let tile = tileCache.get(key);
  if (tile) return tile;
  const g = GENERATORS[f];
  const W = Math.max(4, Math.round(g.w * kb));
  const H = Math.max(4, Math.round(g.h * kb));
  tile = makeCanvas(W, H);
  const x = tile.getContext("2d");
  g.gen(x, W, H, kb, mulberry32(g.seed));
  tileCache.set(key, tile);
  if (tileCache.size > 40) tileCache.delete(tileCache.keys().next().value);
  return tile;
}

/**
 * fabricPattern(ctx, fabric, k) → CanvasPattern to fill while ctx's transform is
 * scale(k) (artboard units → px). The pattern is mapped back to device pixels so
 * the tile is painted 1:1. Returns { pattern, strength } (strength = suggested alpha).
 */
export function fabricPattern(ctx, fabric, k) {
  const tile = getFabricTile(fabric, k);
  const pattern = ctx.createPattern(tile, "repeat");
  const kb = bucket(k);
  if (pattern && typeof pattern.setTransform === "function" && typeof DOMMatrix !== "undefined") {
    // ctx transform scales by k; undo it so tile pixels land on device pixels.
    // (tile was drawn at kb ≈ k px/unit, the residual k/kb is < 2%.)
    pattern.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
  }
  const strength = (FABRICS[fabric] || FABRICS.knit).strength * (kb < 0.35 ? 0.7 : 1);
  return { pattern, strength };
}
