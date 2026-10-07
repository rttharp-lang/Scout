// photo engine · dev helpers for harness pages (never needed by the app).
import { compileView } from "./compile.js";
import { getBake, sizeBucket } from "./bake.js";

/** debugBake(garment, viewId, size) → the bake ({ box, shade, light, print, dispX, dispY … }) or null. */
export function debugBake(garment, viewId, size = 700) {
  const cv = compileView(garment, viewId);
  return cv ? getBake(cv, sizeBucket(size)) : null;
}
