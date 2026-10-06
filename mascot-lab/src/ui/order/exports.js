// Mascot Lab — files the coach takes away: the logo thumbnail stored with an order,
// the printable order sheet (HTML with embedded mockups), the roster CSV and the
// design pack (.zip). Every render goes through the shared queue, one job at a time,
// with a yield between steps.
import { canvasToBlob } from "../../engine/render.js";
import { darken } from "../../engine/core.js";
import { orderSheetHtml, rosterCsv, orderText } from "../../order/orderSheet.js";
import { buildOrder, findLocalOrder, pendingRevision } from "../../order/orderService.js";
import { countedRows } from "../../order/pricing.js";
import { teamLabel } from "../../order/team.js";
import { dataUrlText, sanitizeSvg, svgDataUrl } from "../../engine/sanitizeSvg.js";
import { letteringFor, queue, renderArt, renderGarmentView } from "./kit.js";

let jobSeq = 0;
const jobKey = (k) => `${k}|${++jobSeq}`;
const STAGES = { paper: "#ECEBE6", dark: "#101216", mid: "#7D838C" };

/** stageColor(effect, palette) → the gallery backdrop the effect is designed on. */
export function stageColor(effect, palette) {
  if (effect?.stage === "team") return darken(palette.primary, 0.06);
  return STAGES[effect?.stage] || STAGES.paper;
}

function flatten(canvas, w, bg) {
  const h = Math.round((canvas.height / canvas.width) * w);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

/** logoThumb(canvas) → JPEG data URL ≤ 30 KB (logo contained on a light square), or null. */
export function logoThumb(canvas, maxBytes = 30 * 1024) {
  // maxBytes is compared with the data URL's length (what a stored order carries)
  if (!canvas?.width) return null;
  try {
    for (const [side, q] of [[200, 0.82], [160, 0.75], [128, 0.7], [96, 0.6]]) {
      const out = document.createElement("canvas");
      out.width = out.height = side;
      const ctx = out.getContext("2d");
      ctx.fillStyle = "#F4F5F7";
      ctx.fillRect(0, 0, side, side);
      const pad = side * 0.08;
      const k = Math.min((side - 2 * pad) / canvas.width, (side - 2 * pad) / canvas.height);
      const w = canvas.width * k, h = canvas.height * k;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, (side - w) / 2, (side - h) / 2, w, h);
      const url = out.toDataURL("image/jpeg", q);
      // data URL length ≈ bytes the document stores
      if (url.length <= maxBytes) return url;
    }
  } catch { /* tainted or unsupported */ }
  return null;
}

/**
 * logoFileFor(canvas, name, src) → { dataUrl, width, height, name } | null: the uploaded logo
 * small enough to travel with a db order (≤ 200 KB as a data URL). An SVG upload goes as
 * the original vector, sanitized (engine/sanitizeSvg.js); a raster goes as the cleaned-up
 * logo: PNG at 1024 px when it fits, then WebP (keeps transparency, much smaller), then
 * smaller PNG, then white-backed JPEG.
 */
export function logoFileFor(canvas, name = "logo", src = null, maxChars = 200 * 1024) {
  if (typeof src === "string" && src.startsWith("data:image/svg+xml")) {
    // the vector goes SANITIZED (no scripts, handlers, foreign HTML or external loads)
    // and base64-encoded (what the order inbox accepts); else it travels as a raster below
    const clean = sanitizeSvg(dataUrlText(src));
    const url = clean ? svgDataUrl(clean) : null;
    if (url && url.length <= maxChars) return { dataUrl: url, width: canvas?.width || null, height: canvas?.height || null, name };
  }
  if (!canvas?.width) return null;
  const draw = (side, bg) => {
    const k = Math.min(1, side / Math.max(canvas.width, canvas.height));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(canvas.width * k));
    out.height = Math.max(1, Math.round(canvas.height * k));
    const ctx = out.getContext("2d");
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, out.width, out.height); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  };
  const tries = [[1024, "image/png"], [1024, "image/webp", 0.92], [768, "image/webp", 0.9], [512, "image/png"], [768, "image/jpeg", 0.86, "#FFFFFF"], [512, "image/jpeg", 0.8, "#FFFFFF"]];
  try {
    for (const [side, type, q, bg] of tries) {
      const c = draw(side, bg);
      const url = c.toDataURL(type, q);
      if (!url.startsWith(`data:${type}`)) continue; // e.g. no WebP encoder: the browser fell back to PNG
      if (url.length <= maxChars) return { dataUrl: url, width: c.width, height: c.height, name };
    }
  } catch { /* tainted or unsupported */ }
  return null;
}

/** orderForExport(state, ctx) → the order body with the submitted ref/date (or a draft ref). */
export function orderForExport(state, { garments, ids, effect, logoCanvas }) {
  const sent = state.order.ref ? findLocalOrder(state.order.ref) : null;
  return buildOrder(state, {
    replaces: sent?.order?.replaces || (state.order.ref ? null : pendingRevision()),
    garments,
    garmentIds: ids,
    effect,
    ref: state.order.ref || "DRAFT",
    createdAt: state.order.submittedAt || new Date().toISOString(),
    logoThumb: logoThumb(logoCanvas),
    rightsConfirmed: !!state.contact?.rightsConfirmed,
  });
}

const firstLettering = (state) => letteringFor(countedRows(state.roster).find((r) => String(r.number || "").trim()) || null);

const SHEET_BG = "#F3F4F6";  // the order sheet's figure gray (also the pack's garment backdrop)
const sheetJpeg = (c) => flatten(c, 560, SHEET_BG).toDataURL("image/jpeg", 0.85);
const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));
/** settle() — two frames, so a progress label paints before a long synchronous step. */
const settle = async () => { await nextFrame(); await nextFrame(); };

/**
 * sheetImages(state, ctx) → { look, garments: { [id]: { front, back } } } as JPEG data URLs
 * for the HTML order sheet (560 px garments on the sheet's figure gray). `ctx.ready`
 * ({ [id]: { front, back } } data URLs the design pack already made) are used as they are.
 */
export async function sheetImages(state, { byId, ids, logo, ready = null, onStep }) {
  const kit = await renderArt(state, logo, { size: 1024, priority: 6 });
  const images = { garments: {} };
  images.look = flatten(kit.art, 640, stageColor(kit.effect, state.palette)).toDataURL("image/jpeg", 0.86);
  onStep?.();
  const lettering = firstLettering(state);
  for (const id of ids) {
    const g = byId[id];
    const item = state.collection.items[id];
    if (!g || !item) continue;
    images.garments[id] = {};
    for (const view of ["front", "back"]) {
      const url = ready?.[id]?.[view];
      if (typeof url === "string") { images.garments[id][view] = url; continue; }
      const c = await queue.enqueue(jobKey(`sheet|${id}|${view}`), async () => renderGarmentView(g, view, item, state.palette, kit, { size: 560, detail: "full", lettering }), 6);
      images.garments[id][view] = sheetJpeg(c);
      onStep?.();
    }
  }
  return images;
}

/** makeOrderSheet(state, ctx) → { html, order } (the printable order sheet). */
export async function makeOrderSheet(state, ctx) {
  const order = orderForExport(state, ctx);
  const images = await sheetImages(state, ctx);
  return { html: orderSheetHtml(order, images), order };
}

export function makeRosterCsv(state, ctx) {
  return rosterCsv(orderForExport(state, ctx));
}

export function makeOrderText(state, ctx) {
  return orderText(orderForExport(state, ctx));
}

const slug = (t) => String(t || "team").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
export const fileBase = (state) => `${slug(teamLabel(state.team, state.contact))}-${String(state.order.ref || "draft").toLowerCase()}`;

export const PACK_GARMENT_PX = 1200;
export const PACK_ART_PX = 2048;

/**
 * makeDesignPack(state, ctx, onProgress(done, total, label)) → Promise<{ blob, filename }> (zip):
 *   garments/<id>-front.jpg / -back.jpg   1200 px mockups on a light gray backdrop
 *   artwork/<effect>-2048.png             the look on a transparent background, print size
 *   order-sheet.html, roster.csv, order.json, README.txt
 * Each render is its own queue job and the page yields between steps; images are encoded
 * with the async toBlob(). The 2048 px artwork is one effect render that can hold the page
 * for a few seconds, so it runs last, after its label has painted. Progress is weighted by
 * rough cost (the artwork counts as much as all the garments).
 */
export async function makeDesignPack(state, ctx, onProgress) {
  const { byId, ids, logo } = ctx;
  const todo = ids.filter((id) => byId[id] && state.collection.items[id]);
  const gSteps = todo.length * 2;
  const ART_W = Math.max(4, gSteps);           // the 2048 render ≈ every garment view together
  const total = gSteps + 2 + ART_W + 1;          // garments, order sheet (2), artwork, zip
  let done = 0;
  const report = (label, w = 0) => { done = Math.min(total, done + w); onProgress?.(done, total, label); };
  report("Drawing the garments");
  await settle();

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const base = fileBase(state);
  const STORE = { compression: "STORE" }; // JPEG/PNG are already compressed

  // 1 · garments at 1200 px on the sheet gray, from the 1024 px art the previews already use
  const kit = await renderArt(state, logo, { size: 1024, priority: 8 });
  const lettering = firstLettering(state);
  const ready = {};
  for (const id of todo) {
    const g = byId[id];
    const item = state.collection.items[id];
    ready[id] = {};
    for (const view of ["front", "back"]) {
      const c = await queue.enqueue(jobKey(`pack|${id}|${view}`), async () => renderGarmentView(g, view, item, state.palette, kit, { size: PACK_GARMENT_PX, detail: "full", lettering, backdrop: SHEET_BG }), 8);
      zip.file(`garments/${id}-${view}.jpg`, await canvasToBlob(c, "image/jpeg", 0.88), STORE);
      ready[id][view] = sheetJpeg(c); // the order sheet's copy, so the big canvas can go
      report(`Drawing the garments: ${g.name}, ${view}`, 1);
      await nextFrame();
    }
  }

  // 2 · the order sheet, reusing those renders
  report("Building the order sheet");
  await settle();
  const order = orderForExport(state, ctx);
  const images = await sheetImages(state, { ...ctx, ready });
  zip.file("order-sheet.html", orderSheetHtml(order, images));
  zip.file("roster.csv", rosterCsv(order));
  zip.file("order.json", JSON.stringify(order, null, 2));
  report("Building the order sheet", 2);

  // 3 · the print artwork (one long render)
  report("Rendering the print artwork at 2048 px. The page may pause for a few seconds");
  await settle();
  const big = await renderArt(state, logo, { size: PACK_ART_PX, priority: 8 });
  const artName = `artwork/${slug(big.effect?.name || state.effect.id)}-${PACK_ART_PX}.png`;
  zip.file(artName, await canvasToBlob(big.art), STORE);
  report("Compressing", ART_W);
  await settle();

  zip.file("README.txt", [
    `Mascot Lab design pack · ${teamLabel(order.team, order.contact, "Team")} · order ${order.ref}`,
    "",
    `${artName.padEnd(30)} the chosen look, transparent background, ${PACK_ART_PX} px square`,
    `garments/                      every garment in the kit, front and back, ${PACK_GARMENT_PX} px previews`,
    "order-sheet.html               open in any browser to view or print the full order",
    "roster.csv                     players, numbers, sizes and pieces, plus extras",
    "order.json                     the same order as data",
    ...(big.fallback ? ["", `Note: the ${big.fallback.effect} effect didn't render, so the artwork is the clean logo.`] : []),
    "",
    orderText(order),
  ].join("\n"));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  onProgress?.(total, total, "Ready");
  return { blob, filename: `${base}-design-pack.zip` };
}
