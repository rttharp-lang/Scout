// Collection page — rendering plumbing shared by the lookbook grid, the drop-style
// cards, the garment inspector and the exports.
//
// Everything goes through ONE render queue (createRenderQueue), one job at a time,
// highest priority first, yielding to the event loop between jobs. Mockups are keyed
// by a signature of every input (garment, view, size, resolved colors, placements,
// lettering, and the identity of the art canvases), cached in a small LRU, so a card
// only re-renders when something it shows actually changed.
import { createRenderQueue } from "../../engine/render.js";
import { renderMockup, fontsReady } from "../../apparel/renderMockup.js";
import { resolveColors } from "../../apparel/collection.js";

export const queue = createRenderQueue();

/** Queue priorities (higher runs first). */
export const PRIORITY = {
  export: 60,     // the coach clicked a download button and is waiting
  art: 50,        // effect + clean logo renders every mockup needs
  inspector: 40,  // the garment being edited
  visible: 30,    // lookbook cards on screen
  offscreen: 20,  // lookbook cards below the fold
  styles: 15,     // drop-style card previews
  prefetch: 5,    // the other side of each card (so flips are instant)
};

/** Mockup sizes: lookbook cards, inspector, drop-style thumbnails. */
export const SIZES = { card: 600, cardLarge: 800, inspector: 800, style: 320 };

/* ───────────────────────────── canvas identity ───────────────────────────── */

const ids = new WeakMap();
let idSeq = 0;
/** canvasId(canvas) → a stable short id per canvas object (render caches key on identity). */
export function canvasId(c) {
  if (!c) return "0";
  let id = ids.get(c);
  if (!id) { id = (++idSeq).toString(36); ids.set(c, id); }
  return id;
}

/* ───────────────────────────── fonts ───────────────────────────── */

let fontsPromise = null;
/** Lettering font (Graduate) — awaited once before the first mockup with text. */
export function letteringFontReady() {
  if (!fontsPromise) fontsPromise = fontsReady();
  return fontsPromise;
}

/* ───────────────────────────── mockup inputs ───────────────────────────── */

/** Placements of one view with their canvases: "logo" → clean logo, anything else → the look. */
export function buildGraphics(placements, art, clean) {
  const out = [];
  for (const p of placements || []) {
    const canvas = p.source === "logo" ? clean || art : art || clean;
    if (canvas) out.push({ ...p, canvas });
  }
  return out;
}

/** Does this garment view draw lettering at all? */
export function viewHasText(garment, view) {
  const t = garment?.views?.[view]?.text;
  return !!(t && (t.name || t.number));
}

/** Lettering option for renderMockup, or null. preview = { name, number } placeholders. */
export function letteringFor(item, colors, preview) {
  if (!item?.text) return null;
  const name = item.text.name ? String(preview?.name || "").trim().toUpperCase() || null : null;
  const number = item.text.number ? String(preview?.number ?? "").trim() || null : null;
  if (!name && !number) return null;
  return { name, number, fill: colors.accent, outline: colors.trim };
}

/**
 * mockupInput({ garment, view, item, palette, art, clean, size, preview, detail })
 * → { garment, view, size, colors, graphics, text, detail, sig } — everything renderMockup
 * needs plus a signature string that changes exactly when the pixels would.
 */
export function mockupInput({ garment, view, item, palette, art, clean, size, preview, detail = "full", backdrop = null, shadow = true }) {
  const colors = resolveColors(item?.colors, palette);
  const placements = item?.[view] || [];
  const graphics = buildGraphics(placements, art, clean);
  const text = viewHasText(garment, view) ? letteringFor(item, colors, preview) : null;
  const sig = [
    garment.id, view, size, detail, backdrop || "-", shadow ? 1 : 0,
    colors.base, colors.trim, colors.accent,
    canvasId(art), canvasId(clean),
    JSON.stringify(placements),
    text ? `${text.name || ""}#${text.number || ""}` : "-",
  ].join("|");
  return { garment, view, size, colors, graphics, text, detail, backdrop, shadow, sig };
}

/* ───────────────────────────── mockup cache ───────────────────────────── */

const MAX_CACHED = 40;
const cache = new Map();   // sig → canvas (LRU by insertion order)
const wanted = new Map();  // sig → number of mounted consumers

export function cachedMockup(sig) {
  const c = cache.get(sig);
  if (c) { cache.delete(sig); cache.set(sig, c); }
  return c || null;
}
function remember(sig, canvas) {
  cache.set(sig, canvas);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
}

/** Mark a signature as wanted (+1) or not (-1). Jobs nobody wants any more are skipped. */
export function want(sig, delta) {
  const n = (wanted.get(sig) || 0) + delta;
  if (n > 0) wanted.set(sig, n);
  else wanted.delete(sig);
}

/** Render a mockup now (synchronously) — for exports that already hold the queue. */
export function drawMockup(input) {
  return renderMockup(input.garment, input.view, {
    size: input.size,
    colors: input.colors,
    graphics: input.graphics,
    text: input.text,
    detail: input.detail,
    backdrop: input.backdrop,
    shadow: input.shadow,
  });
}

/**
 * requestMockup(input, priority, { force }) → Promise<canvas | null>. Goes through the queue;
 * resolves null if, by the time the job runs, no mounted consumer wants it (unless force).
 */
export function requestMockup(input, priority = PRIORITY.offscreen, { force = false } = {}) {
  const hit = cachedMockup(input.sig);
  if (hit) return Promise.resolve(hit);
  return queue.enqueue(`mock|${input.sig}`, async () => {
    if (!force && !wanted.has(input.sig)) return null;
    const again = cachedMockup(input.sig);
    if (again) return again;
    if (input.text) await letteringFontReady();
    const canvas = drawMockup(input);
    remember(input.sig, canvas);
    return canvas;
  }, priority);
}
