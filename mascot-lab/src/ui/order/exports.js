// Mascot Lab — files the coach takes away: the logo thumbnail stored with an order,
// the printable order sheet (HTML with embedded mockups), the roster CSV and the
// design pack (.zip). Every render goes through the shared queue, one job at a time,
// so a 2048 px export never freezes the page for long.
import { canvasToBlob } from "../../engine/render.js";
import { darken } from "../../engine/core.js";
import { orderSheetHtml, rosterCsv, orderText } from "../../order/orderSheet.js";
import { buildOrder } from "../../order/orderService.js";
import { countedRows } from "../../order/pricing.js";
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

/** orderForExport(state, ctx) → the order body with the submitted ref/date (or a draft ref). */
export function orderForExport(state, { garments, ids, effect, logoCanvas }) {
  return buildOrder(state, {
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

/**
 * sheetImages(state, ctx) → { look, logo, garments: { [id]: { front, back } } } as JPEG data URLs,
 * for the HTML order sheet (560 px garments on the sheet's figure grey).
 */
export async function sheetImages(state, { byId, ids, logo, onStep }) {
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
      const c = await queue.enqueue(jobKey(`sheet|${id}|${view}`), async () => renderGarmentView(g, view, item, state.palette, kit, { size: 560, detail: "full", lettering }), 6);
      images.garments[id][view] = flatten(c, 560, "#F3F4F6").toDataURL("image/jpeg", 0.85);
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
export const fileBase = (state) => `${slug(`${state.team.school} ${state.team.mascot}`)}-${String(state.order.ref || "draft").toLowerCase()}`;

/**
 * makeDesignPack(state, ctx, onProgress(done, total, label)) → Promise<Blob> (zip):
 *   artwork/<effect>-2048.png   the look, transparent
 *   garments/<id>-front.png / -back.png at 1600 px, transparent
 *   order-sheet.html, roster.csv, order.json, README.txt
 */
export async function makeDesignPack(state, ctx, onProgress) {
  const { byId, ids, logo } = ctx;
  const garmentJobs = ids.filter((id) => byId[id] && state.collection.items[id]).length * 2;
  const total = 1 + garmentJobs + 1 + garmentJobs + 1; // art, garments, sheet look, sheet garments, zip
  let done = 0;
  const step = (label) => { done += 1; onProgress?.(Math.min(done, total), total, label); };
  onProgress?.(0, total, "Rendering the artwork at 2048 px");

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const base = fileBase(state);

  const kit = await renderArt(state, logo, { size: 2048, priority: 8 });
  const STORE = { compression: "STORE" }; // PNGs are already compressed
  zip.file(`artwork/${slug(kit.effect?.name || state.effect.id)}-2048.png`, await canvasToBlob(kit.art), STORE);
  step("Rendering garments at 1600 px");

  const lettering = firstLettering(state);
  for (const id of ids) {
    const g = byId[id];
    const item = state.collection.items[id];
    if (!g || !item) continue;
    for (const view of ["front", "back"]) {
      const c = await queue.enqueue(jobKey(`pack|${id}|${view}`), async () => renderGarmentView(g, view, item, state.palette, kit, { size: 1600, detail: "full", lettering, shadow: false }), 8);
      zip.file(`garments/${id}-${view}.png`, await canvasToBlob(c), STORE);
      step(`${g.name} ${view}`);
    }
  }

  const order = orderForExport(state, ctx);
  const images = await sheetImages(state, { ...ctx, onStep: () => step("Building the order sheet") });
  zip.file("order-sheet.html", orderSheetHtml(order, images));
  zip.file("roster.csv", rosterCsv(order));
  zip.file("order.json", JSON.stringify(order, null, 2));
  zip.file("README.txt", [
    `Mascot Lab design pack · ${order.team.school} ${order.team.mascot} · order ${order.ref}`,
    "",
    "artwork/   the chosen look on a transparent background, 2048 px square",
    "garments/  every garment in the kit, front and back, 1600 px, transparent",
    "order-sheet.html  open in any browser to view or print the full order",
    "roster.csv        players, numbers, sizes and pieces, plus extras",
    "order.json        the same order as data",
    "",
    orderText(order),
  ].join("\n"));
  onProgress?.(total - 1, total, "Compressing");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  onProgress?.(total, total, "Ready");
  return { blob, filename: `${base}-design-pack.zip` };
}
