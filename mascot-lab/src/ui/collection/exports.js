// Collection page — downloads: the lookbook line sheet (2400 × 3000 PNG) and a
// per-garment image (front + back side by side, 1600 px each). Every heavy step is
// its own queue job, so the page keeps breathing between renders.
import { canvasToBlob, renderEffect } from "../../engine/render.js";
import { getDropStyle } from "../../apparel/collection.js";
import { PRODUCTS } from "../../order/catalog.js";
import { saveFile } from "../../platform/files.js";
import { PRIORITY, cachedMockup, drawMockup, letteringFontReady, mockupInput, queue } from "./render.js";
import { POSTER, composeLineSheet, posterFontsReady } from "./lineSheet.js";
import { slug } from "./format.js";
import { teamFields, teamLabel } from "../../order/team.js";

/** Team name for file names and labels (the contact school stands in for a blank name). */
const teamName = (state) => teamLabel(state.team, state.contact, "Your team");

let exportSeq = 0;

/**
 * lookAt(size, ctx) → { art, clean } rendered at `size` with quality "final".
 * ctx = { state, logo: { canvas, key }, effect, original }.
 */
async function lookAt(size, { state, logo, effect, original }) {
  const opts = { size, seed: state.effect.seed, quality: "final", logoKey: logo.key };
  let clean = logo.canvas;
  if (original) {
    clean = await queue.enqueue(`clean|${logo.key}|${size}`, () => renderEffect(original, logo.canvas, {}, state.palette, opts), PRIORITY.export)
      .catch(() => logo.canvas);
  }
  let art = clean;
  let failed = false;
  if (effect) {
    const key = `art-x|${logo.key}|${effect.id}|${JSON.stringify(state.effect.params)}|${JSON.stringify(state.palette)}|${state.effect.seed}|${size}`;
    art = await queue.enqueue(key, () => renderEffect(effect, logo.canvas, state.effect.params, state.palette, opts), PRIORITY.export)
      .catch((err) => { console.warn("[collection] export look render failed:", err?.message || err); failed = true; return clean; });
  }
  return { art, clean, failed };
}

function mockupJob(input) {
  return queue.enqueue(`x${++exportSeq}|${input.sig}`, async () => {
    if (input.text) await letteringFontReady();
    return cachedMockup(input.sig) || drawMockup(input);
  }, PRIORITY.export);
}

/** What saveFile said, as a toast (shared with every download button). */
export { saveToast } from "../pages/saveNotice.js";

/**
 * downloadLineSheet(ctx) → { result, filename }.
 * ctx = { state, logo, effect, original, garments (loaded, in order), preview }.
 */
export async function downloadLineSheet(ctx) {
  const { state, garments, preview } = ctx;
  const { art, clean, failed } = await lookAt(1024, ctx);
  await Promise.all([letteringFontReady(), posterFontsReady()]);
  const pieces = [];
  for (const g of garments) {
    const item = state.collection.items[g.id];
    if (!item || item.enabled === false) continue;
    const views = {};
    for (const view of ["front", "back"]) {
      const input = mockupInput({ garment: g, view, item, palette: state.palette, art, clean, size: 800, preview });
      views[view] = await mockupJob(input);
    }
    pieces.push({
      name: g.name,
      styleCode: g.styleCode,
      spec: g.spec,
      price: PRODUCTS[g.id]?.price,
      front: views.front,
      back: views.back,
    });
  }
  // if the look didn't render, the sheet shows (and names) the clean logo instead
  const effect = (failed ? null : ctx.effect) || ctx.original;
  const canvas = await queue.enqueue(`x${++exportSeq}|linesheet`, async () => composeLineSheet({
    team: teamFields(state.team, state.contact),
    palette: state.palette,
    effect: effect ? { name: effect.name, method: effect.method, stage: effect.stage } : null,
    dropStyle: getDropStyle(state.collection.dropStyle),
    art,
    pieces,
  }), PRIORITY.export);
  const blob = await canvasToBlob(canvas, "image/png");
  const filename = `${slug(teamName(state))}-line-sheet.png`;
  const result = await saveFile(filename, blob);
  return { result, filename, detail: `${POSTER.width} × ${POSTER.height} px`, pieces: pieces.length };
}

// the per-garment image is a product shot, not UI: fixed backdrop + label colors
const SHOT_BG = "#E9ECF0";
const SHOT_INK = "#0E1116";
const SHOT_MUTED = "#5B6470";

/**
 * downloadGarment(ctx, garment) → { result, filename } — front + back side by side,
 * 1600 px each (3200 × 1600), effect rendered at 2048 for the larger print.
 */
export async function downloadGarment(ctx, garment) {
  const { state, preview } = ctx;
  const item = state.collection.items[garment.id];
  const { art, clean } = await lookAt(2048, ctx);
  const S = 1600;
  const views = {};
  for (const view of ["front", "back"]) {
    views[view] = await mockupJob(mockupInput({ garment, view, item, palette: state.palette, art, clean, size: S, preview }));
  }
  await posterFontsReady();
  const canvas = await queue.enqueue(`x${++exportSeq}|garment`, async () => {
    // two 1600 px views side by side, plus a caption strip underneath
    const STRIP = 120;
    const c = document.createElement("canvas");
    c.width = S * 2; c.height = S + STRIP;
    const x = c.getContext("2d");
    x.fillStyle = SHOT_BG;
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(views.front, 0, 0);
    x.drawImage(views.back, S, 0);
    x.fillStyle = "rgba(14,17,22,0.12)";
    x.fillRect(S - 1, 120, 2, S - 160);
    x.fillRect(56, S + 8, S * 2 - 112, 2);
    x.textBaseline = "alphabetic";
    const y = S + 74;
    x.font = '500 28px "IBM Plex Mono", ui-monospace, monospace';
    x.fillStyle = SHOT_MUTED;
    x.fillText("FRONT", 56, y);
    x.fillText("BACK", S + 56, y);
    x.textAlign = "right";
    x.font = '600 30px "IBM Plex Mono", ui-monospace, monospace';
    x.fillStyle = SHOT_INK;
    x.fillText(`${teamName(state).toUpperCase()}  ·  ${garment.name.toUpperCase()}  ·  ${garment.styleCode}`, S * 2 - 56, y);
    x.textAlign = "left";
    return c;
  }, PRIORITY.export);
  const blob = await canvasToBlob(canvas, "image/png");
  const filename = `${slug(teamName(state))}-${slug(garment.name, garment.id)}.png`;
  const result = await saveFile(filename, blob);
  return { result, filename, detail: `${S * 2} × ${S + 120} px` };
}
