// Mascot Lab — "photo" garment engine (painted light). Public API.
//
// Garments in the photo format (garment.format === "photo") are authored as coloured
// PANELS plus authored LIGHT (soft shadow / light shapes), procedural DETAIL (seams,
// stitching, rib knit, fleece grain, braided cords, metal) and placement ZONES. The
// engine bakes the colour-independent light once per garment view and size bucket and
// then only recolours and re-prints per render. See GARMENTS.md for the authoring guide.
//
//   renderPhoto(garment, viewId, opts) → canvas      (renderMockup dispatches here)
//   preparePhoto(garment, viewId, size)              bake ahead of time
//   isPhotoGarment(garment)                          format check
//   photoViewBounds(garment, viewId)                 { x, y, w, h } in artboard units
//   clearPhotoCaches()                               drop every cached stack / bake
//
// Layout of this folder (core is DOM-free; OffscreenCanvas everywhere):
//   canvas.js     canvases, blur (filter or JS fallback), caches, colour helpers
//   geom.js       inch-space polyline kit (splines, ribbons, offsets, measuring)
//   author.js     authoring helpers for garment files (dark / lite / fold / tube …)
//   light.js      the key light, the light model, sRGB ↔ linear LUTs
//   compile.js    validate a view, build Path2D, resolve clip sets
//   stack.js      size-independent soft light per part + fold relief + drop shadow
//   detail.js     sharp procedural detail (ribs, fleece, seams, stitches, cords, metal)
//   bake.js       per size bucket: light maps, print coverage, print displacement
//   graphics.js   placements (single / tile, tint, opacity, blend)
//   lettering.js  Graduate names + numbers
//   render.js     the per-render composite + studio backdrop
import { clearStacks } from "./stack.js";
import { clearBakes } from "./bake.js";

export { renderPhoto, preparePhoto, backdropCanvas } from "./render.js";
export { photoViewBounds, compileView, ARTBOARD } from "./compile.js";
export { sizeBucket } from "./bake.js";
export { SAFE } from "./graphics.js";
export { LETTERING_FONT, clearLetteringMetrics } from "./lettering.js";
export { tonalOf } from "./canvas.js";

/** Is this garment authored in the photo format? */
export const isPhotoGarment = (g) => g?.format === "photo";

export function clearPhotoCaches() {
  clearStacks();
  clearBakes();
}

/** Dev/harness helper: the cached bake (light maps etc.) for a garment view at a size. */
export { debugBake } from "./debug.js";
