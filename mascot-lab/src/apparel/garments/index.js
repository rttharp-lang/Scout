// Mascot Lab — garment registry. Every ./<id>.js file (except this one) is a garment
// module (default export, see CONTRACTS.md "Garment module"). Modules are lazy-loaded
// with Promise.allSettled and validated; a broken garment is skipped with a warning
// so one bad file can never take the collection page down.

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

/** validateGarment(garment, id) → error string or null (normalizes soft problems in place). */
function validateGarment(g, id) {
  if (!g || typeof g !== "object") return "no default export";
  if (g.id !== id) return `id "${g.id}" must equal the filename "${id}"`;
  if (typeof g.name !== "string" || !g.name) return "missing name";
  if (!g.views || typeof g.views !== "object") return "missing views";
  for (const v of ["front", "back"]) {
    const err = validateView(g.views[v], v, id);
    if (err) return err;
  }
  if (!FABRICS.includes(g.fabric)) { console.warn(`[garments] ${id}: unknown fabric "${g.fabric}", using "knit"`); g.fabric = "knit"; }
  if (!CATEGORIES.includes(g.category)) g.category = "warmup";
  if (typeof g.styleCode !== "string") g.styleCode = `ML-${id.slice(0, 3).toUpperCase()}`;
  if (typeof g.spec !== "string") g.spec = "";
  const dc = g.defaultColors || {};
  g.defaultColors = { base: dc.base || "primary", trim: dc.trim || "secondary", accent: dc.accent || "accent" };
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
