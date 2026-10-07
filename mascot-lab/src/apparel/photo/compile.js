// photo engine · compile a garment view (validate, build Path2D objects, resolve clips).
//
// A compiled view is cached per garment object and view id; garments are immutable once
// loaded, so nothing here is ever invalidated.
import { polyPath } from "./canvas.js";
import { signedArea, rev } from "./geom.js";

export const ARTBOARD = 1000;

const ROLES = new Set(["base", "trim", "accent", "white", "black"]);
const isPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPoly = (pts, min = 3) => Array.isArray(pts) && pts.length >= min && pts.every(isPt);
export const isBox = (b) => b && ["x", "y", "w", "h"].every((k) => Number.isFinite(b[k])) && b.w > 0 && b.h > 0;

function rectOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

const compiled = new WeakMap();
const warned = new Set();
function warn(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[photo] ${msg}`);
}

/** compileView(garment, viewId) → compiled view, or null when the view is missing. */
export function compileView(garment, viewId) {
  let views = compiled.get(garment);
  if (!views) { views = new Map(); compiled.set(garment, views); }
  if (views.has(viewId)) return views.get(viewId);
  const view = garment?.views?.[viewId];
  if (!view || !Array.isArray(view.parts)) { views.set(viewId, null); return null; }
  const gid = garment.id || "garment";

  const parts = [];
  for (const [i, p] of view.parts.entries()) {
    if (!p || typeof p.id !== "string" || !isPoly(p.pts)) { warn(`${gid}.${viewId}: dropped parts[${i}] (${p?.id || "no id"}) — needs id + pts (≥3 points)`); continue; }
    const pts = signedArea(p.pts) < 0 ? rev(p.pts) : p.pts;   // same winding → nonzero unions are real unions
    const role = p.role ?? p.fill ?? "base";
    parts.push({
      ...p,
      role: ROLES.has(role) || /^#[0-9a-f]{6}$/i.test(role) ? role : "base",
      index: parts.length,
      pts,
      path: polyPath(pts),
      rect: rectOf(pts),
    });
  }
  if (!parts.length) { views.set(viewId, null); return null; }
  const byId = new Map(parts.map((p) => [p.id, p]));
  const allIds = parts.map((p) => p.id);

  const clipCache = new Map();
  /** resolveClip(clip, exclude) → part ids (existing parts only, paint order). */
  const resolveClip = (clip, exclude) => {
    const key = `${Array.isArray(clip) ? clip.join(",") : clip ?? "all"}|${exclude ? exclude.join(",") : ""}`;
    let hit = clipCache.get(key);
    if (hit) return hit;
    let ids;
    if (clip === undefined || clip === null || clip === "all") ids = allIds;
    else if (typeof clip === "string") ids = view.clipSets?.[clip] || [clip];
    else ids = clip.flatMap((c) => view.clipSets?.[c] || [c]);
    const set = new Set(ids.filter((id) => byId.has(id)));
    if (exclude) for (const e of exclude) set.delete(e);
    hit = allIds.filter((id) => set.has(id));
    clipCache.set(key, hit);
    return hit;
  };

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) { x0 = Math.min(x0, p.rect.x0); y0 = Math.min(y0, p.rect.y0); x1 = Math.max(x1, p.rect.x1); y1 = Math.max(y1, p.rect.y1); }

  const light = [];
  for (const [i, it] of (view.light || []).entries()) {
    if (!it || !isPoly(it.pts)) { warn(`${gid}.${viewId}: dropped light[${i}] — needs pts`); continue; }
    const ids = resolveClip(it.clip, it.exclude);
    if (!ids.length) continue;
    light.push({ ...it, layer: it.layer === "light" ? "light" : "dark", path: polyPath(it.pts), ids, blur: Math.max(0, +it.blur || 0), alpha: Number.isFinite(it.alpha) ? it.alpha : 0.3 });
  }

  const lines = (list, kind) => (list || []).filter((s, i) => {
    const ok = s && isPoly(s.pts, 2);
    if (!ok) warn(`${gid}.${viewId}: dropped ${kind}[${i}] — needs pts (≥2 points)`);
    return ok;
  }).map((s) => ({ ...s, ids: resolveClip(s.clip), path: polyPath(s.pts, false) }));

  // printSet: every part ink may land on (print coverage, tiles, lettering);
  // printIds: where a single placement prints when its zone names no clip (view.print)
  const printSet = new Set(parts.filter((p) => p.print).map((p) => p.id));
  const printIds = Array.isArray(view.print) ? view.print.filter((id) => byId.has(id)) : [...printSet];
  for (const id of printIds) printSet.add(id);
  const zones = {};
  for (const [z, box] of Object.entries(view.zones || {})) {
    if (!isBox(box)) { warn(`${gid}.${viewId}: dropped zone ${z}`); continue; }
    zones[z] = { ...box, ids: box.clip ? resolveClip(box.clip) : printIds };
  }
  const unionCache = new Map();
  /** Path2D union of parts (nonzero; all parts share one winding). */
  const union = (ids) => {
    const k = ids.join(",");
    let u = unionCache.get(k);
    if (!u) { u = new Path2D(); for (const id of ids) u.addPath(byId.get(id).path); unionCache.set(k, u); }
    return u;
  };

  const cv = {
    key: `${gid}:${viewId}`,
    garment, view, viewId,
    parts, byId, allIds, resolveClip, union,
    bounds: { x0, y0, x1, y1 },
    light,
    seams: lines(view.seams, "seams"),
    stitches: lines(view.stitches, "stitches"),
    edges: lines(view.edges, "edges"),
    ribs: (view.ribs || []).filter((r) => r && byId.has(r.part)).map((r) => ({ ...r, followPath: isPoly(r.follow, 2) ? polyPath(r.follow, false) : null })),
    cords: (view.cords || []).filter((c) => c && byId.has(c.part) && isPoly(c.pts, 2) && c.w > 0),
    metal: (view.metal || []).filter(Boolean),
    printIds, printSet,
    printUnion: union(printSet.size ? cvOrder(parts, printSet) : allIds),
    zones,
    text: view.text || null,
    model: view.lightModel || null,
  };
  views.set(viewId, cv);
  return cv;
}

const cvOrder = (parts, set) => parts.filter((p) => set.has(p.id)).map((p) => p.id);

/** Bounding box of a photo view in artboard units ({ x, y, w, h }), or null. */
export function photoViewBounds(garment, viewId) {
  const cv = compileView(garment, viewId);
  if (!cv) return null;
  const b = cv.bounds;
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}
