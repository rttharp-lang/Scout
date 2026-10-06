// Garment mockup harness (dev-only). Grid of garment × view cards rendered with the
// mockup engine, using a drop style's placements and a real effect render.
//
//   /harness/garments.html?garments=jersey,hoodie|all&views=front,back
//     &style=statement|classic|allover|tonal&effect=original|halftone|…&logo=bulldog|crest|monogram
//     &logo=synthetic   (built-in badge, no engine needed)
//     &zone=center&scale=1&dx=0&dy=0&rotate=0&tile=220&mode=single|tile&tint=%23FFFFFF|tonal|none
//                       (override the first placement of each view)
//     &colors=13294B,F2A900,FFFFFF   (base,trim,accent — else the drop style's palette roles)
//     &size=560&bg=%23E9ECEF&detail=full|fast
//     &plain=1          no graphics, no lettering (silhouette / construction check)
//     &name=CARTER&number=23&text=0
//     &debug=zones      outline every zone and text box
//     &perf=1           time size 600 and 1600 renders (cold + warm) per garment view
//
// window.__RESULTS = [{ garment, view, ms, error }]; window.__READY = true when done.
import "@fontsource/ibm-plex-mono/500";
import "@fontsource/archivo/400";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import { renderMockup, fontsReady } from "../src/apparel/renderMockup.js";
import { loadGarments, GARMENT_ORDER } from "../src/apparel/garments/index.js";
import { buildCollection, resolveColors, DROP_STYLES } from "../src/apparel/collection.js";

const q = new URLSearchParams(location.search);
const SIZE = clampInt(q.get("size"), 560, 64, 2400);
const BG = q.get("bg") || "#E9ECEF";
const DETAIL = q.get("detail") === "fast" ? "fast" : "full";
const STYLE = DROP_STYLES.some((s) => s.id === q.get("style")) ? q.get("style") : "statement";
const EFFECT_ID = q.get("effect") || "original";
const LOGO_ID = q.get("logo") || "bulldog";
const VIEWS = (q.get("views") || "front,back").split(",").map((s) => s.trim()).filter((v) => v === "front" || v === "back");
const PLAIN = q.get("plain") === "1";
const DEBUG = q.get("debug") || "";
const PERF = q.get("perf") === "1";
const NAME = q.get("name") ?? "CARTER";
const NUMBER = q.get("number") ?? "23";
const SHOW_TEXT = q.get("text") !== "0";

const results = [];
window.__RESULTS = results;
window.__READY = false;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
function clampInt(v, d, lo, hi) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}
const normHex = (v) => {
  const h = String(v || "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(h) ? "#" + h.toUpperCase() : null;
};

/* ───────────── optional modules (other agents build these in parallel) ───────────── */

const OPTIONAL = import.meta.glob([
  "../src/engine/render.js",
  "../src/engine/image.js",
  "../src/engine/effects/index.js",
  "../src/assets/samples/index.js",
]);
async function optional(path) {
  const load = OPTIONAL[path];
  if (!load) return null;
  try { return await load(); } catch (e) { console.warn(`[harness] ${path} failed to load:`, e?.message || e); return null; }
}

const DEFAULT_PALETTE = { primary: "#13294B", secondary: "#F2A900", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" };

/** Synthetic fallback graphic: bold circular badge with a star, logo inside the SAFE box. */
function syntheticBadge(S = 1024, palette = DEFAULT_PALETTE) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  const k = (S * 0.72) / 1000, o = S * 0.14;
  x.translate(o, o); x.scale(k, k);
  const star = (cx, cy, ro, ri) => {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? ri : ro, a = -Math.PI / 2 + (i * Math.PI) / 5;
      x[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    x.closePath();
  };
  x.fillStyle = palette.secondary; x.beginPath(); x.arc(500, 500, 498, 0, Math.PI * 2); x.fill();
  x.fillStyle = palette.primary; x.beginPath(); x.arc(500, 500, 440, 0, Math.PI * 2); x.fill();
  x.strokeStyle = palette.accent; x.lineWidth = 16; x.beginPath(); x.arc(500, 500, 400, 0, Math.PI * 2); x.stroke();
  star(500, 470, 300, 122); x.fillStyle = palette.accent; x.fill();
  x.lineJoin = "round"; x.lineWidth = 22; x.strokeStyle = palette.secondary; x.stroke();
  return c;
}

/** Square S×S source with the logo in the central 72% (same as image.makeSource). */
function squareSource(logo, S) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const box = S * 0.72, k = Math.min(box / logo.width, box / logo.height);
  const w = logo.width * k, h = logo.height * k;
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(logo, (S - w) / 2, (S - h) / 2, w, h);
  return c;
}

async function loadGraphics(notes) {
  let palette = { ...DEFAULT_PALETTE };
  let logoCanvas = null;
  if (LOGO_ID === "synthetic") {
    notes.push("logo=synthetic — built-in fallback badge");
    const badge = syntheticBadge(1024, palette);
    return { palette, logo: badge, effect: badge, effectName: "Synthetic badge" };
  }
  const samples = await optional("../src/assets/samples/index.js");
  const image = await optional("../src/engine/image.js");
  let sample = samples?.getSample?.(LOGO_ID) || null;
  if (!sample && samples) {
    sample = samples.DEFAULT_SAMPLE || null;
    notes.push(`logo "${LOGO_ID}" not found — using ${sample?.id || "the synthetic badge"}`);
  }
  if (sample?.palette) palette = { ...palette, ...sample.palette };
  if (sample && image?.prepareLogo) {
    try { logoCanvas = (await image.prepareLogo(sample.url)).canvas; }
    catch (e) { notes.push(`logo "${LOGO_ID}" failed: ${e.message}`); }
  } else notes.push("samples/image.js not available — using the synthetic badge");

  if (!logoCanvas) {
    const badge = syntheticBadge(1024, palette);
    return { palette, logo: badge, effect: badge, effectName: "Synthetic badge" };
  }
  const logo = image?.makeSource ? image.makeSource(logoCanvas, 1024) : squareSource(logoCanvas, 1024);

  let effectCanvas = logo, effectName = "Clean logo";
  const reg = await optional("../src/engine/effects/index.js");
  const render = await optional("../src/engine/render.js");
  if (reg?.getEffect && render?.renderEffect) {
    const eff = await reg.getEffect(EFFECT_ID);
    if (!eff) notes.push(`effect "${EFFECT_ID}" not found — using the clean logo`);
    else {
      try {
        effectCanvas = await render.renderEffect(eff, logoCanvas, {}, palette, { size: 1024, seed: 7, logoKey: LOGO_ID });
        effectName = eff.name;
      } catch (e) { notes.push(`effect render failed: ${e.message}`); }
    }
  } else notes.push("effect engine not available — using the clean logo");
  return { palette, logo, effect: effectCanvas, effectName };
}

/* ───────────────────────────── placements ───────────────────────────── */

function overrides() {
  const o = {};
  if (q.get("zone")) o.zone = q.get("zone");
  for (const k of ["scale", "dx", "dy", "rotate", "tile", "opacity"]) {
    if (q.get(k) != null && Number.isFinite(Number(q.get(k)))) o[k] = Number(q.get(k));
  }
  if (q.get("mode")) o.mode = q.get("mode");
  if (q.get("tint")) o.tint = q.get("tint") === "none" ? null : q.get("tint");
  if (q.get("blend")) o.blend = q.get("blend");
  return o;
}

function placementsFor(item, viewId, gfx, zones) {
  let specs = (item?.[viewId] || []).map((p) => ({ ...p }));
  const o = overrides();
  if (Object.keys(o).length) {
    // a view with no placements only gets one if the overridden zone exists there
    if (!specs.length && (!o.zone || zones[o.zone])) specs = [{ source: "effect", zone: viewId === "front" ? "center" : "back-center", scale: 1 }];
    if (specs.length) specs[0] = { ...specs[0], ...o };
  }
  return specs.map((p) => ({ ...p, canvas: p.source === "logo" ? gfx.logo : gfx.effect }));
}

/* ───────────────────────────── drawing ───────────────────────────── */

function drawDebug(canvas, garment, viewId) {
  const view = garment.views[viewId];
  const x = canvas.getContext("2d");
  const k = canvas.width / 1000;
  x.save();
  x.scale(k, k);
  x.lineWidth = 1.5;
  x.font = "600 13px monospace";
  for (const [id, z] of Object.entries(view.zones || {})) {
    x.strokeStyle = "rgba(230,40,90,.9)";
    x.setLineDash([6, 4]);
    x.strokeRect(z.x, z.y, z.w, z.h);
    x.fillStyle = "rgba(230,40,90,.95)";
    x.fillText(id, z.x + 4, z.y + 14);
  }
  for (const [id, z] of Object.entries(view.text || {})) {
    x.strokeStyle = "rgba(20,140,220,.95)";
    x.setLineDash([2, 3]);
    x.strokeRect(z.x, z.y, z.w, z.h);
    x.fillStyle = "rgba(20,140,220,.95)";
    x.fillText(`text:${id}`, z.x + 4, z.y + z.h - 5);
  }
  if (DEBUG.includes("print")) {
    x.setLineDash([]);
    x.fillStyle = "rgba(0,200,120,.25)";
    x.fill(new Path2D(view.printArea), "evenodd");
  }
  x.restore();
}

const fmtMs = (ms) => `${ms.toFixed(1)} ms`;

async function main() {
  const notes = [];
  $("#query").textContent = `style=${STYLE} · effect=${EFFECT_ID} · logo=${LOGO_ID} · size=${SIZE} · ${DETAIL}`;
  const [garments, gfx] = await Promise.all([loadGarments(), loadGraphics(notes), fontsReady()]);
  const want = q.get("garments");
  const ids = !want || want === "all" ? garments.map((g) => g.id) : want.split(",").map((s) => s.trim());
  const collection = buildCollection(STYLE, gfx.palette);
  const colorOverride = (q.get("colors") || "").split(",").map(normHex);
  notes.unshift(`graphic: ${gfx.effectName} · palette ${Object.values(gfx.palette).join(" ")} · loaded garments: ${garments.map((g) => g.id).join(", ") || "none"}`);

  const grid = $("#grid");
  const perfRows = [];
  for (const id of ids) {
    const garment = garments.find((g) => g.id === id);
    const item = collection.items[id];
    for (const viewId of VIEWS) {
      const fig = el("figure", "card");
      const frame = el("div", "frame");
      frame.style.width = frame.style.height = `${SIZE}px`;
      frame.style.background = BG;
      fig.append(frame);
      const cap = el("figcaption");
      fig.append(cap);
      grid.append(fig);
      if (!garment) {
        frame.append(el("div", "err", `garment "${id}" not available${GARMENT_ORDER.includes(id) ? " (not built yet)" : ""}`));
        cap.append(el("strong", null, id), el("span", "mono muted", viewId));
        results.push({ garment: id, view: viewId, ms: null, error: "not available" });
        continue;
      }
      try {
        const roles = item?.colors || garment.defaultColors;
        const colors = resolveColors(roles, gfx.palette);
        if (colorOverride[0]) colors.base = colorOverride[0];
        if (colorOverride[1]) colors.trim = colorOverride[1];
        if (colorOverride[2]) colors.accent = colorOverride[2];
        const graphics = PLAIN ? [] : placementsFor(item, viewId, gfx, garment.views[viewId].zones || {});
        const textOn = !PLAIN && SHOW_TEXT && item?.text;
        const text = textOn ? {
          name: item.text.name ? NAME : null,
          number: item.text.number ? NUMBER : null,
          fill: colors.accent,
          outline: colors.trim,
        } : null;
        const opts = { size: SIZE, colors, graphics, text, backdrop: BG, shadow: true, detail: DETAIL };
        const t0 = performance.now();
        const canvas = renderMockup(garment, viewId, opts);
        const ms = performance.now() - t0;
        if (DEBUG) drawDebug(canvas, garment, viewId);
        frame.append(canvas);
        const budget = 60 * (SIZE / 600) ** 1.6;
        const msEl = el("span", `mono ms ${ms > budget ? "over" : ms > budget * 0.7 ? "slow" : ""}`, fmtMs(ms));
        const sw = el("span", "swatches");
        for (const c of [colors.base, colors.trim, colors.accent]) { const i = el("i"); i.style.background = c; i.title = c; sw.append(i); }
        cap.append(el("strong", null, garment.name), el("span", "mono muted", `${viewId} · ${garment.styleCode}`), sw, msEl);
        results.push({ garment: id, view: viewId, ms: Math.round(ms * 10) / 10, error: null });

        if (PERF) {
          const row = { garment: id, view: viewId };
          for (const size of [600, 1600]) {
            const o2 = { ...opts, size, backdrop: null };
            const c0 = performance.now(); renderMockup(garment, viewId, o2); const cold = performance.now() - c0;
            let warm = 0; const N = 5;
            for (let i = 0; i < N; i++) { const t = performance.now(); renderMockup(garment, viewId, o2); warm += performance.now() - t; }
            row[`cold${size}`] = Math.round(cold * 10) / 10;
            row[`warm${size}`] = Math.round((warm / N) * 10) / 10;
          }
          perfRows.push(row);
          Object.assign(results[results.length - 1], row);
        }
      } catch (e) {
        console.error(e);
        frame.append(el("div", "err", `${e.message}`));
        cap.append(el("strong", null, garment.name), el("span", "mono muted", viewId));
        results.push({ garment: id, view: viewId, ms: null, error: e.message });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (perfRows.length) {
    const t = el("table", "perf");
    t.innerHTML = "<tr><th>garment</th><th>view</th><th>600 cold</th><th>600 warm</th><th>1600 cold</th><th>1600 warm</th></tr>" +
      perfRows.map((r) => `<tr><td>${r.garment}</td><td>${r.view}</td><td>${r.cold600}</td><td>${r.warm600}</td><td>${r.cold1600}</td><td>${r.warm1600}</td></tr>`).join("");
    $("#main").append(t);
  }
  const style = DROP_STYLES.find((s) => s.id === STYLE);
  notes.push(`drop style: ${style.name} — ${style.blurb}`);
  $("#notes").innerHTML = notes.map((n) => `<p>${n.replace(/</g, "&lt;")}</p>`).join("");
  const bad = results.filter((r) => r.error && r.error !== "not available").length;
  const status = $("#status");
  status.textContent = bad ? `${bad} error(s)` : `Done · ${results.filter((r) => !r.error).length} renders`;
  status.className = `mono ${bad ? "bad" : "done"}`;
  window.__READY = true;
}

main().catch((e) => {
  console.error(e);
  $("#status").textContent = `Failed: ${e.message}`;
  $("#status").className = "mono bad";
  window.__READY = true;
});
