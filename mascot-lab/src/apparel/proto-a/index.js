// proto-a · public API.
//
//   prepareGarmentPhoto(viewId, { size, garment })        → baked maps (cached, colour-independent)
//   renderGarmentPhoto(viewId, { size, colors: { base, trim, accent }, graphics: Placement[],
//                                backdrop: null | "studio" | "#hex", shadow: true, garment,
//                                target?: canvas, timings?: {} })   → canvas (size × size)
//
// Placements are CONTRACTS.md placements (canvas, zone, scale, dx, dy, rotate, mode, tile,
// opacity, tint, knockout). Zones are artboard units (1000 × 1000) like the flat garments.
// The cache key is (garment, view, size); a recolour or a new graphic only re-runs the
// colour pass. No DOM in here: works on OffscreenCanvas in a worker.
import hoodie from "./hoodie.js";
import { bakeView, renderBaked } from "./engine.js";

export { hoodie };
const cache = new Map();          // key → baked (LRU, ~30 MB per 1200 px view)
const MAX = 8;

export function prepareGarmentPhoto(viewId, { size = 1200, garment = hoodie, timings } = {}) {
  size = Math.max(64, Math.round(size));
  const key = `${garment.id}|${viewId}|${size}`;
  let bk = cache.get(key);
  if (bk) { cache.delete(key); cache.set(key, bk); return bk; }
  bk = bakeView(garment, viewId, size, { timings });
  cache.set(key, bk);
  while (cache.size > MAX) cache.delete(cache.keys().next().value);
  return bk;
}

export function renderGarmentPhoto(viewId, {
  size = 1200, colors, graphics = [], backdrop = null, shadow = true, garment = hoodie, target = null, timings = null,
} = {}) {
  const bk = prepareGarmentPhoto(viewId, { size, garment, timings });
  return renderBaked(bk, { colors, graphics, backdrop, shadow, target, timings });
}

export function clearGarmentPhotoCache() { cache.clear(); }
