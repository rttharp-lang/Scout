// Mascot Lab — garment registry. Every ./<id>.js file (except this one) is a garment
// module (default export, see CONTRACTS.md "Garment module"). Modules are lazy-loaded
// with Promise.allSettled and validated; a broken garment is skipped with a warning
// so one bad file can never take the collection page down.
//
// Two formats load side by side: `format: "photo"` garments (painted light, see
// GARMENTS.md — rendered by src/apparel/photo/) and legacy vector flats (SVG path data,
// no `format`). renderMockup dispatches on the same flag.

/** Collection order; ids not listed sort after these, by name. */
export const GARMENT_ORDER = ["jersey", "shorts", "hoodie", "pants", "tee", "longsleeve"];

/** Zone ids every garment of a kind must provide (missing ones are warned about, not fatal). */
export const REQUIRED_ZONES = {
  top: { front: ["chest-left", "chest-center", "center", "oversized"], back: ["back-yoke", "back-center", "oversized"] },
  hoodie: { front: ["chest-left", "chest-center", "center", "oversized", "hood", "pouch"], back: ["back-yoke", "back-center", "oversized"] },
  shorts: { front: ["leg-left", "leg-right", "oversized"], back: ["back-leg", "waist-back"] },
  pants: { front: ["thigh-left", "leg-left-long", "leg-right-long", "oversized"], back: ["back-leg", "waist-back"] },
};
const KIND_OF = { jersey: "top", tee: "top", longsleeve: "top", hoodie: "hoodie", shorts: "shorts", pants: "pants" };

const MODULES = import.meta.glob(["./*.js", "!./index.js"]);

const FABRICS = ["mesh", "fleece", "knit", "woven"];
const CATEGORIES = ["uniform", "warmup"];
const OVERLAY_KINDS = ["seam", "stitch", "rib", "shadow", "highlight", "edge"];
const PATH_RE = /^[\s,MLHVCSQTAZmlhvcsqtaz0-9.eE+-]+$/;
const isPath = (d) => typeof d === "string" && d.trim().length > 2 && PATH_RE.test(d) && /^\s*[Mm]/.test(d);
const isBox = (b) => b && ["x", "y", "w", "h"].every((k) => Number.isFinite(b[k])) && b.w > 0 && b.h > 0;

/** validateView(view, name) → error string or null; drops (and warns about) bad parts/overlays/zones. */
function validateView(view, name, id) {
  if (!view || typeof view !== "object") return `${name} view missing`;
  if (!isPath(view.silhouette)) return `${name}.silhouette is not SVG path data`;
  if (!isPath(view.printArea)) {
    console.warn(`[garments] ${id}: ${name}.printArea missing — using the silhouette`);
    view.printArea = view.silhouette;
  }
  if (!Array.isArray(view.parts)) view.parts = [];
  view.parts = view.parts.filter((p, i) => {
    const ok = p && isPath(p.d) && typeof p.fill === "string";
    if (!ok) console.warn(`[garments] ${id}: dropped ${name}.parts[${i}] (${p?.id || "no id"}) — needs d + fill`);
    return ok;
  });
  if (!Array.isArray(view.overlays)) view.overlays = [];
  view.overlays = view.overlays.filter((o, i) => {
    const ok = o && isPath(o.d) && OVERLAY_KINDS.includes(o.kind);
    if (!ok) console.warn(`[garments] ${id}: dropped ${name}.overlays[${i}] — needs d + kind in ${OVERLAY_KINDS.join("/")}`);
    return ok;
  });
  if (!view.zones || typeof view.zones !== "object") return `${name}.zones missing`;
  for (const [z, box] of Object.entries(view.zones)) {
    if (!isBox(box)) { console.warn(`[garments] ${id}: dropped ${name}.zones.${z} — needs numeric x, y, w, h`); delete view.zones[z]; }
    else if (typeof box.label !== "string") box.label = z.replace(/-/g, " ");
  }
  if (!Object.keys(view.zones).length) return `${name} has no valid zones`;
  const need = REQUIRED_ZONES[KIND_OF[id]]?.[name] || [];
  const missing = need.filter((z) => !view.zones[z]);
  if (missing.length) console.warn(`[garments] ${id}: ${name} is missing zone(s) ${missing.join(", ")}`);
  if (view.text) {
    for (const t of ["name", "number"]) if (view.text[t] && !isBox(view.text[t])) delete view.text[t];
  }
  return null;
}

/* ───────────────────────────── display scale ─────────────────────────────
 * Every garment is drawn as large as its own proportions allow, so a sleeveless tank or
 * a pair of shorts fills far more of the artboard than a hoodie whose sleeves set its
 * width. A garment may declare `displayScale` (0.6–1): the registry shrinks its whole
 * drawing (paths, zones, lettering boxes) about the artboard centre once at load time,
 * so a lookbook row has an even visual weight. Line widths, blur radii and stitch gaps
 * are NOT scaled, so seams and outlines keep the same weight across the set.
 */
function scalePath(d, s, c = 500) {
  const out = [];
  for (const m of d.matchAll(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g)) {
    const cmd = m[1], up = cmd.toUpperCase(), abs = cmd === up;
    const n = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
    const f = (v) => Math.round((abs ? c + (v - c) * s : v * s) * 100) / 100;
    let o;
    if (up === "Z") o = [];
    else if (up === "H" || up === "V") o = n.map(f);
    else if (up === "A") o = n.map((v, i) => { const j = i % 7; return j === 0 || j === 1 ? Math.round(v * s * 100) / 100 : j < 5 ? v : f(v); });
    else o = n.map(f);
    out.push(cmd + o.join(" "));
  }
  return out.join(" ");
}
const scaleBox = (b, s, c = 500) => ({ ...b, x: c + (b.x - c) * s, y: c + (b.y - c) * s, w: b.w * s, h: b.h * s });
function applyDisplayScale(g) {
  const s = Number(g.displayScale);
  if (!Number.isFinite(s) || s === 1 || s < 0.6 || s > 1 || g.__scaled) return;
  for (const view of Object.values(g.views)) {
    view.silhouette = scalePath(view.silhouette, s);
    view.printArea = scalePath(view.printArea, s);
    for (const p of view.parts) p.d = scalePath(p.d, s);
    for (const o of view.overlays) { o.d = scalePath(o.d, s); if (typeof o.follow === "string") o.follow = scalePath(o.follow, s); }
    for (const z of Object.keys(view.zones)) view.zones[z] = scaleBox(view.zones[z], s);
    if (view.text) for (const t of Object.keys(view.text)) if (view.text[t]) view.text[t] = scaleBox(view.text[t], s);
  }
  Object.defineProperty(g, "__scaled", { value: true });
}

/* ───────────────────────────── photo format ───────────────────────────── */

const isPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPoly = (pts, min = 3) => Array.isArray(pts) && pts.length >= min && pts.every(isPt);

/** validatePhotoView(view, name, id) → error string or null (structural; the engine is defensive too). */
function validatePhotoView(view, name, id) {
  if (!view || typeof view !== "object") return `${name} view missing`;
  if (!Array.isArray(view.parts)) return `${name}.parts missing`;
  view.parts = view.parts.filter((p, i) => {
    const ok = p && typeof p.id === "string" && isPoly(p.pts);
    if (!ok) console.warn(`[garments] ${id}: dropped ${name}.parts[${i}] (${p?.id || "no id"}) — needs id + pts`);
    return ok;
  });
  if (!view.parts.length) return `${name} has no valid parts`;
  if (!view.parts.some((p) => p.print) && !Array.isArray(view.print)) console.warn(`[garments] ${id}: ${name} has no printable part`);
  if (!view.zones || typeof view.zones !== "object") return `${name}.zones missing`;
  for (const [z, box] of Object.entries(view.zones)) {
    if (!isBox(box)) { console.warn(`[garments] ${id}: dropped ${name}.zones.${z} — needs numeric x, y, w, h`); delete view.zones[z]; }
    else if (typeof box.label !== "string") box.label = z.replace(/-/g, " ");
  }
  if (!Object.keys(view.zones).length) return `${name} has no valid zones`;
  const need = REQUIRED_ZONES[KIND_OF[id]]?.[name] || [];
  const missing = need.filter((z) => !view.zones[z]);
  if (missing.length) console.warn(`[garments] ${id}: ${name} is missing zone(s) ${missing.join(", ")}`);
  if (view.text) {
    for (const t of ["name", "number"]) if (view.text[t] && !isBox(view.text[t])) delete view.text[t];
  }
  return null;
}

/** validateGarment(garment, id) → error string or null (normalizes soft problems in place). */
function validateGarment(g, id) {
  if (!g || typeof g !== "object") return "no default export";
  if (g.id !== id) return `id "${g.id}" must equal the filename "${id}"`;
  if (typeof g.name !== "string" || !g.name) return "missing name";
  if (!g.views || typeof g.views !== "object") return "missing views";
  const photo = g.format === "photo";
  for (const v of ["front", "back"]) {
    const err = photo ? validatePhotoView(g.views[v], v, id) : validateView(g.views[v], v, id);
    if (err) return err;
  }
  if (photo && g.displayScale !== undefined) console.warn(`[garments] ${id}: displayScale is ignored for photo garments — size the inch frame instead`);
  if (!FABRICS.includes(g.fabric)) { console.warn(`[garments] ${id}: unknown fabric "${g.fabric}", using "knit"`); g.fabric = "knit"; }
  if (!CATEGORIES.includes(g.category)) g.category = "warmup";
  if (typeof g.styleCode !== "string") g.styleCode = `ML-${id.slice(0, 3).toUpperCase()}`;
  if (typeof g.spec !== "string") g.spec = "";
  const dc = g.defaultColors || {};
  g.defaultColors = { base: dc.base || "primary", trim: dc.trim || "secondary", accent: dc.accent || "accent" };
  if (!photo) applyDisplayScale(g);
  return null;
}

let loading = null;

/** loadGarments() → Promise<Garment[]> — every valid garment in GARMENT_ORDER (memoized). */
export function loadGarments() {
  if (loading) return loading;
  loading = (async () => {
    const entries = Object.entries(MODULES);
    const settled = await Promise.allSettled(entries.map(([, load]) => load()));
    const garments = [];
    settled.forEach((res, i) => {
      const id = entries[i][0].replace(/^\.\//, "").replace(/\.js$/, "");
      if (res.status === "rejected") {
        console.warn(`[garments] skipped ${id}: failed to load —`, res.reason?.message || res.reason);
        return;
      }
      const g = res.value?.default;
      let err;
      try { err = validateGarment(g, id); } catch (e) { err = e?.message || String(e); }
      if (err) { console.warn(`[garments] skipped ${id}: ${err}`); return; }
      garments.push(g);
    });
    const rank = (g) => { const i = GARMENT_ORDER.indexOf(g.id); return i < 0 ? GARMENT_ORDER.length : i; };
    garments.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return garments;
  })();
  return loading;
}

/** getGarment(id) → Promise<Garment | null>. */
export async function getGarment(id) {
  return (await loadGarments()).find((g) => g.id === id) || null;
}

/** availableGarmentIds() → ids of every garment file present (loaded or not). */
export function availableGarmentIds() {
  return Object.keys(MODULES).map((p) => p.replace(/^\.\//, "").replace(/\.js$/, ""));
}
