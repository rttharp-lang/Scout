// photo engine · authoring kit for garment files (pure: no canvas, no DOM).
//
//   import { authorKit } from "../photo/author.js";
//   const F = inchFrame({ unit: 21, cx: 500, y0: 300 });
//   const { dark, lite, blob, rect, brush, fold, tube, flat, S } = authorKit(F);
//
// Every helper takes INCH-space geometry and returns light items in ARTBOARD units, ready
// for `view.light`. A light item is
//   { layer: "dark" | "light", pts, blur, alpha, clip, fold, exclude?, grad? }
// (see GARMENTS.md "Light"). Blur is in inches here, artboard units in the item.
import { spline, ribbon, taper, ellipse, normals, resample, clamp, lerp } from "./geom.js";
import { LIGHT } from "./light.js";

export function authorKit(F) {
  const S = (pts, seg = 10) => spline(pts, seg);

  function mapGrad(g) {
    if (!g) return undefined;
    const p0 = F.p([g.x0, g.y0]), p1 = F.p([g.x1 ?? g.x0, g.y1 ?? g.y0]);
    return { type: g.type || "linear", x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], r0: F.u(g.r0 || 0), r1: F.u(g.r1 || 1), stops: g.stops };
  }

  /**
   * item(layer, poly, opts) — one soft shape. opts: blur (in), alpha (0–1), clip (part id,
   * clip-set name, array of ids, or "all"), fold (0–1: how much this shape bends prints),
   * exclude (part ids it must not fall on), grad ({ type, x0, y0, x1, y1, r0, r1, stops:
   * [[t, alphaMul]] } in inches — the alpha ramps across the shape).
   */
  function item(layer, poly, { blur = 0.5, alpha = 0.3, clip = "all", fold = 0, exclude, grad } = {}) {
    return { layer, pts: F.P(poly), blur: F.u(blur), alpha, clip, fold, exclude, grad: mapGrad(grad) };
  }
  const dark = (poly, o) => item("dark", poly, o);
  const lite = (poly, o) => item("light", poly, o);
  /** Soft ellipse; rotDeg clockwise. */
  const blob = (layer, cx, cy, rx, ry, rotDeg, o) => item(layer, ellipse(cx, cy, rx, ry, (rotDeg * Math.PI) / 180, 40), o);
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  /** Tapered brush stroke along a spline through `pts`; width = number (tapered) or t → width. */
  function brush(layer, pts, width, o = {}) {
    const cl = S(pts, 10);
    const w = typeof width === "number" ? taper(width, o.ta ?? 0.35, o.tb ?? 0.35) : width;
    return item(layer, ribbon(cl, w), o);
  }

  /** +1 when a polyline's normals() side faces the key light. */
  function litSign(cl) {
    let s = 0;
    for (const n of normals(cl)) s += n[0] * LIGHT[0] + n[1] * LIGHT[1];
    return s >= 0 ? 1 : -1;
  }

  /**
   * fold(pts, width, opts) — a fold the way a painter paints one: a highlight on the flank
   * facing the key light and a shadow on the far flank, each a tapered stroke with a soft
   * halo and a tighter core (crisp at the crest, soft where it dies out).
   * opts: hi, lo (alphas), blur, clip, relief (how much it bends prints), sep (flank
   * offset as a fraction of width), valley (a crease: flanks swapped), ta/tb (taper).
   */
  function fold(pts, width, { hi = 0.22, lo = 0.3, blur = 0.4, clip = "all", relief = 1, sep = 0.34, valley = false, ta = 0.38, tb = 0.38 } = {}) {
    const cl = S(pts, 10);
    const nr = normals(cl);
    const sg = litSign(cl) * (valley ? -1 : 1);
    const off = (d) => cl.map((p, i) => [p[0] + nr[i][0] * d * sg, p[1] + nr[i][1] * d * sg]);
    const W = taper(width, ta, tb);
    const out = [];
    if (hi > 0) {
      out.push(item("light", ribbon(off(width * sep), (t) => W(t) * 0.95), { blur, alpha: hi * 0.75, clip, fold: relief }));
      out.push(item("light", ribbon(off(width * sep * 0.7), (t) => W(t) * 0.35), { blur: blur * 0.4, alpha: hi * 0.5, clip }));
    }
    if (lo > 0) {
      out.push(item("dark", ribbon(off(-width * sep), (t) => W(t) * 1.1), { blur: blur * 1.25, alpha: lo * 0.7, clip, fold: relief }));
      out.push(item("dark", ribbon(off(-width * sep * 0.5), (t) => W(t) * 0.4), { blur: blur * 0.4, alpha: lo * 0.6, clip }));
    }
    return out;
  }

  /**
   * tube(A, B, opts) — cylinder shading between two contours running the same way (a
   * sleeve, a rolled rim, a cuff): highlight a third in from the lit contour, core shadow
   * two thirds across, a little reflected light near the far edge. Which contour is lit
   * is decided per sample from the key light, so mirrored geometry lights itself.
   */
  function tube(A, B, { clip, hi = 0.18, core = 0.3, refl = 0.05, blur = 0.7, n = 28, hiW = 0.28, coreW = 0.34, relief = 0.6 } = {}) {
    const a = resample(A, n), b = resample(B, n);
    const H = [], C = [], R = [], wH = [], wC = [], f = [];
    for (let i = 0; i <= n; i++) {
      const dx = b[i][0] - a[i][0], dy = b[i][1] - a[i][1], w = Math.hypot(dx, dy) || 1e-3;
      const facingA = clamp(((-dx / w) * LIGHT[0] + (-dy / w) * LIGHT[1]) * 2.2, -1, 1);
      const th = 0.5 - 0.3 * facingA, tc = 0.5 + 0.27 * facingA, tr = 0.5 + 0.44 * facingA;
      H.push([lerp(a[i][0], b[i][0], th), lerp(a[i][1], b[i][1], th)]);
      C.push([lerp(a[i][0], b[i][0], tc), lerp(a[i][1], b[i][1], tc)]);
      R.push([lerp(a[i][0], b[i][0], tr), lerp(a[i][1], b[i][1], tr)]);
      wH.push(w * hiW); wC.push(w * coreW); f.push(Math.abs(facingA));
    }
    const prof = (arr) => (t) => {
      const k = clamp(t, 0, 1) * (arr.length - 1);
      const i = Math.min(arr.length - 2, Math.floor(k));
      return lerp(arr[i], arr[i + 1], k - i) * Math.max(0, Math.min(1, t / 0.06, (1 - t) / 0.06));
    };
    const out = [
      item("light", ribbon(H, (t) => prof(wH)(t) * (0.6 + 0.4 * prof(f)(t))), { blur, alpha: hi, clip, fold: relief }),
      item("dark", ribbon(C, (t) => prof(wC)(t) * (0.7 + 0.3 * prof(f)(t))), { blur: blur * 1.2, alpha: core, clip, fold: relief }),
    ];
    if (refl > 0) out.push(item("light", ribbon(R, (t) => prof(wH)(t) * 0.45), { blur: blur * 0.8, alpha: refl, clip }));
    return out;
  }

  /** Flatten nested arrays of items, dropping falsy entries. */
  const flat = (arr) => arr.flat(Infinity).filter(Boolean);

  return { S, item, dark, lite, blob, rect, brush, fold, tube, flat, litSign };
}
