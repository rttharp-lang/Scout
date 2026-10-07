// proto-b · public API.
//
//   prepareGarmentPhoto(viewId, { size, garment })     bake the colour-independent layers
//                                                      (cached per garment × view × size)
//   renderGarmentPhoto(viewId, { size, colors: { base, trim, accent }, graphics: Placement[],
//                                backdrop: null | "studio" | "#hex", shadow: true,
//                                garment?, target?, timings? }) → canvas
//
// Placements follow CONTRACTS.md (zone, scale, dx, dy, rotate, mode "single"|"tile",
// tile, opacity, tint, blend, knockout). A zone may carry `clip: [partIds]` (the hood
// zone prints only on the hood shell). Core code is DOM-free (OffscreenCanvas).
import hoodie, { measure as measureHoodie } from "./hoodie.js";
import { prepare, render, clearCaches } from "./engine.js";

export const GARMENTS = { hoodie };
export { measureHoodie, clearCaches };

export function prepareGarmentPhoto(viewId, { size = 1200, garment = hoodie, timings } = {}) {
  return prepare(garment, viewId, size, timings);
}

export function renderGarmentPhoto(viewId, opts = {}) {
  return render(opts.garment || hoodie, viewId, opts);
}
