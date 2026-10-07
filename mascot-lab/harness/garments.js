// Garment mockup harness (dev-only). Renders garments in BOTH formats through the public
// renderMockup() — photo garments (painted light, src/apparel/photo/) and legacy vector
// flats — with a drop style's placements and a real effect render.
//
// Grid (default): garment × view cards
//   /harness/garments.html?garments=jersey,hoodie|all&views=front,back
//     &style=statement|classic|allover|tonal&effect=original|graffiti|…&logo=bulldog|crest|monogram
//     &logo=synthetic   (built-in badge, no engine needed)
//     &zone=center&scale=1&dx=0&dy=0&rotate=0&tile=220&mode=single|tile&tint=%23FFFFFF|tonal|none
//                       (override the first placement of each view)
//     &colors=13294B,F2A900,FFFFFF   (base,trim,accent — else the drop style's palette roles)
//     &size=560&bg=studio|none|%23E9ECEF&detail=full|fast
//     &plain=1          no graphics, no lettering (silhouette / construction check)
//     &name=CARTER&number=23&text=0
//     &debug=zones      outline every zone and text box (debug=zones,print also tints print parts)
//     &perf=1           cold (first render of the view) + warm timings at 320 / 600 / 1200
//     &spec=1           measurement tables (garment modules that export measure())
//
// Matrix:   ?view=matrix&garments=hoodie&size=600     the critique set: navy+gold graffiti
//           statement, white classic chest logo, gold plain, red/black statement, tonal on
//           black, one-ink tile on navy — each front + back
// Maps:     ?view=maps&garments=hoodie&views=front&size=700   baked shade / light / print / displacement
// Crop:     ?view=crop&garments=hoodie&views=front&size=2400&x=..&y=..&w=..&h=..&look=0..5
//
// window.__RESULTS = [{ garment, view, ms, error, … }]; window.__READY = true when done.
import "@fontsource/ibm-plex-mono/500";
import "@fontsource/archivo/400";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import { renderMockup, fontsReady, isPhotoGarment } from "../src/apparel/renderMockup.js";
import { loadGarments, GARMENT_ORDER } from "../src/apparel/garments/index.js";
import { buildCollection, resolveColors, DROP_STYLES } from "../src/apparel/collection.js";
import { clearPhotoCaches, debugBake } from "../src/apparel/photo/index.js";

const q = new URLSearchParams(location.search);
const SIZE = clampInt(q.get("size"), 560, 64, 2400);
const BGQ = q.get("bg") ?? "studio";
const BG = BGQ === "none" ? null : BGQ;
const DETAIL = q.get("detail") === "fast" ? "fast" : "full";
const STYLE = DROP_STYLES.some((s) => s.id === q.get("style")) ? q.get("style") : "statement";
const EFFECT_ID = q.get("effect") || "original";
const LOGO_ID = q.get("logo") || "bulldog";
const VIEWS = (q.get("views") || "front,back").split(",").map((s) => s.trim()).filter((v) => v === "front" || v === "back");
const PLAIN = q.get("plain") === "1";
const DEBUG = q.get("debug") || "";
const PERF = q.get("perf") === "1";
const SPEC = q.get("spec") === "1";
const NAME = q.get("name") ?? "CARTER";
const NUMBER = q.get("number") ?? "23";
const SHOW_TEXT = q.get("text") !== "0";
const MODE = q.get("view") || "grid";

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
const r1 = (v) => Math.round(v * 10) / 10;

/* ───────────── optional modules (other agents build these in parallel) ───────────── */

const OPTIONAL = import.meta.glob([
  "../src/engine/render.js",
  "../src/engine/image.js",
  "../src/engine/effects/index.js",
  "../src/assets/samples/index.js",
]);
const GARMENT_MODULES = import.meta.glob(["../src/apparel/garments/*.js", "!../src/apparel/garments/index.js"]);
async function optional(path) {
  const load = OPTIONAL[path];
  if (!load) return null;
  try { return await load(); } catch (e) { console.warn(`[harness] ${path} failed to load:`, e?.message || e); return null; }
}

const DEFAULT_PALETTE = { primary: "#13294B", secondary: "#F2A900", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" };
const RED_PALETTE = { primary: "#C8102E", secondary: "#111111", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" };

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

let logoMemo = null;
async function loadLogo(notes) {
  if (logoMemo) return logoMemo;
  const samples = await optional("../src/assets/samples/index.js");
  const image = await optional("../src/engine/image.js");
  let sample = samples?.getSample?.(LOGO_ID) || null;
  if (!sample && samples) {
    sample = samples.DEFAULT_SAMPLE || null;
    notes.push(`logo "${LOGO_ID}" not found — using ${sample?.id || "the synthetic badge"}`);
  }
  let canvas = null;
  if (sample && image?.prepareLogo) {
    try { canvas = (await image.prepareLogo(sample.url)).canvas; }
    catch (e) { notes.push(`logo "${LOGO_ID}" failed: ${e.message}`); }
  } else notes.push("samples/image.js not available — using the synthetic badge");
  logoMemo = { sample, canvas, image };
  return logoMemo;
}

/** { palette, logo (clean source), effect (rendered), effectName } for a palette + effect. */
async function loadGraphics(notes, { effectId = EFFECT_ID, palette: forced = null } = {}) {
  if (LOGO_ID === "synthetic") {
    notes.push("logo=synthetic — built-in fallback badge");
    const palette = forced || { ...DEFAULT_PALETTE };
    const badge = syntheticBadge(1024, palette);
    return { palette, logo: badge, effect: badge, effectName: "Synthetic badge" };
  }
  const { sample, canvas: logoCanvas, image } = await loadLogo(notes);
  let palette = forced || { ...DEFAULT_PALETTE, ...(sample?.palette || {}) };
  if (!logoCanvas) {
    const badge = syntheticBadge(1024, palette);
    return { palette, logo: badge, effect: badge, effectName: "Synthetic badge" };
  }
  const logo = image?.makeSource ? image.makeSource(logoCanvas, 1024) : squareSource(logoCanvas, 1024);
  let effectCanvas = logo, effectName = "Clean logo";
  const reg = await optional("../src/engine/effects/index.js");
  const render = await optional("../src/engine/render.js");
  if (reg?.getEffect && render?.renderEffect) {
    const eff = await reg.getEffect(effectId);
    if (!eff) notes.push(`effect "${effectId}" not found — using the clean logo`);
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
    if (!specs.length && (!o.zone || zones[o.zone])) specs = [{ source: "effect", zone: viewId === "front" ? "center" : "back-center", scale: 1 }];
    if (specs.length) specs[0] = { ...specs[0], ...o };
  }
  return specs.map((p) => ({ ...p, canvas: p.source === "logo" ? gfx.logo : gfx.effect }));
}

/* ───────────────────────────── drawing helpers ───────────────────────────── */

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
    if (isPhotoGarment(garment)) {
      for (const p of view.parts) {
        if (!p.print) continue;
        x.beginPath();
        p.pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
        x.closePath();
        x.fill();
      }
    } else x.fill(new Path2D(view.printArea), "evenodd");
  }
  x.restore();
}

function card(title, sub, colors, ms, size = SIZE) {
  const fig = el("figure", "card");
  const frame = el("div", "frame");
  frame.style.width = frame.style.height = `${size}px`;
  if (!BG) frame.classList.add("checker");
  fig.append(frame);
  const cap = el("figcaption");
  const sw = el("span", "swatches");
  for (const c of colors || []) { const i = el("i"); i.style.background = c; i.title = c; sw.append(i); }
  const budget = 60 * (size / 600) ** 1.6;
  cap.append(el("strong", null, title), el("span", "mono muted", sub), sw);
  if (ms != null) cap.append(el("span", `mono ms ${ms > budget ? "over" : ms > budget * 0.7 ? "slow" : ""}`, `${ms.toFixed(1)} ms`));
  fig.append(cap);
  return { fig, frame };
}

/* ───────────────────────────── grid (default) ───────────────────────────── */

async function grid() {
  const notes = [];
  $("#query").textContent = `style=${STYLE} · effect=${EFFECT_ID} · logo=${LOGO_ID} · size=${SIZE} · ${DETAIL} · bg=${BGQ}`;
  const [garments, gfx] = await Promise.all([loadGarments(), loadGraphics(notes), fontsReady()]);
  const want = q.get("garments");
  const ids = !want || want === "all" ? garments.map((g) => g.id) : want.split(",").map((s) => s.trim());
  const collection = buildCollection(STYLE, gfx.palette);
  const colorOverride = (q.get("colors") || "").split(",").map(normHex);
  notes.unshift(`graphic: ${gfx.effectName} · palette ${Object.values(gfx.palette).join(" ")} · loaded: ${garments.map((g) => `${g.id}${isPhotoGarment(g) ? " (photo)" : ""}`).join(", ") || "none"}`);

  const gridEl = $("#grid");
  const perfRows = [];
  for (const id of ids) {
    const garment = garments.find((g) => g.id === id);
    const item = collection.items[id];
    for (const viewId of VIEWS) {
      if (!garment) {
        const { fig, frame } = card(id, viewId, []);
        frame.append(el("div", "err", `garment "${id}" not available${GARMENT_ORDER.includes(id) ? " (not built yet)" : ""}`));
        gridEl.append(fig);
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
        const text = textOn ? { name: item.text.name ? NAME : null, number: item.text.number ? NUMBER : null, fill: colors.accent, outline: colors.trim } : null;
        const opts = { size: SIZE, colors, graphics, text, backdrop: BG, shadow: true, detail: DETAIL };
        const t0 = performance.now();
        const canvas = renderMockup(garment, viewId, opts);
        const ms = performance.now() - t0;
        if (DEBUG) drawDebug(canvas, garment, viewId);
        const { fig, frame } = card(garment.name, `${viewId} · ${garment.styleCode}${isPhotoGarment(garment) ? " · photo" : ""}`, [colors.base, colors.trim, colors.accent], ms);
        frame.append(canvas);
        gridEl.append(fig);
        results.push({ garment: id, view: viewId, format: isPhotoGarment(garment) ? "photo" : "vector", ms: r1(ms), error: null });
        if (PERF) {
          const row = { garment: id, view: viewId };
          for (const size of [320, 600, 1200]) {
            const o2 = { ...opts, size, backdrop: null };
            if (isPhotoGarment(garment)) clearPhotoCaches();
            const tm = {};
            const c0 = performance.now(); renderMockup(garment, viewId, { ...o2, timings: tm }); const cold = performance.now() - c0;
            row[`phases${size}`] = Object.fromEntries(Object.entries(tm).map(([k2, v]) => [k2, r1(v)]));
            if (isPhotoGarment(garment)) {
              // the stack is size-independent: a second size pays only its bake
              const t2 = {};
              renderMockup(garment, viewId, { ...o2, size: size + 40, timings: t2 });
              row[`bakeOnly${size}`] = r1(t2.total);
            }
            const alt = [{ ...colors }, { base: "#FFFFFF", trim: colors.base, accent: colors.trim }, { base: "#C8102E", trim: "#111111", accent: "#FFFFFF" }];
            let warm = 0; const N = 6;
            for (let i = 0; i < N; i++) { const t = performance.now(); renderMockup(garment, viewId, { ...o2, colors: alt[i % 3] }); warm += performance.now() - t; }
            row[`cold${size}`] = r1(cold);
            row[`warm${size}`] = r1(warm / N);
          }
          perfRows.push(row);
          Object.assign(results[results.length - 1], row);
        }
      } catch (e) {
        console.error(e);
        const { fig, frame } = card(garment.name, viewId, []);
        frame.append(el("div", "err", `${e.message}`));
        gridEl.append(fig);
        results.push({ garment: id, view: viewId, ms: null, error: e.message });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (perfRows.length) {
    const t = el("table", "perf");
    t.innerHTML = "<tr><th>garment</th><th>view</th><th>320 cold</th><th>320 warm</th><th>600 cold</th><th>600 warm</th><th>1200 cold</th><th>1200 warm</th></tr>" +
      perfRows.map((r) => `<tr><td>${r.garment}</td><td>${r.view}</td><td>${r.cold320}</td><td>${r.warm320}</td><td>${r.cold600}</td><td>${r.warm600}</td><td>${r.cold1200}</td><td>${r.warm1200}</td></tr>`).join("");
    $("#main").append(t);
  }
  if (SPEC) await specTables(ids);
  const style = DROP_STYLES.find((s) => s.id === STYLE);
  notes.push(`drop style: ${style.name} — ${style.blurb}`);
  finish(notes);
}

async function specTables(ids) {
  for (const id of ids) {
    const load = GARMENT_MODULES[`../src/apparel/garments/${id}.js`];
    const mod = load ? await load() : null;
    if (typeof mod?.measure !== "function") continue;
    const rows = mod.measure();
    const t = el("table", "perf");
    t.innerHTML = `<tr><th>${id}: measurement</th><th>spec</th><th>drawn</th></tr>` +
      rows.map(([k, s, v]) => `<tr><td>${k}</td><td>${s}</td><td>${v}</td></tr>`).join("");
    $("#main").append(t);
    results.push({ spec: id, rows });
  }
}

/* ───────────────────────────── critique matrix ───────────────────────────── */

const LOOKS = [
  { name: "Navy + gold · graffiti statement", palette: "team", colors: { base: "#13294B", trim: "#F2A900", accent: "#FFFFFF" },
    front: (g) => [{ canvas: g.art, zone: "oversized", scale: 0.96, dx: -0.08, dy: -0.02 }], back: (g) => [{ canvas: g.art, zone: "back-center", scale: 1.04, dy: -0.025 }] },
  { name: "White · classic chest logo", palette: "team", colors: { base: "#FFFFFF", trim: "#13294B", accent: "#F2A900" },
    front: (g) => [{ canvas: g.clean, zone: "chest-left", scale: 1 }], back: (g) => [{ canvas: g.clean, zone: "back-yoke", scale: 1.45, dy: 0.12 }] },
  { name: "Gold · plain", palette: "team", colors: { base: "#F2A900", trim: "#13294B", accent: "#FFFFFF" }, front: () => [], back: () => [] },
  { name: "Red / black · statement", palette: "red", colors: { base: "#111111", trim: "#C8102E", accent: "#FFFFFF" },
    front: (g) => [{ canvas: g.art, zone: "oversized", scale: 0.96, dx: -0.08, dy: -0.02 }], back: (g) => [{ canvas: g.art, zone: "back-center", scale: 1.04, dy: -0.025 }] },
  { name: "Near-black · tonal", palette: "team", colors: { base: "#0B0D10", trim: "#13294B", accent: "#F2A900" },
    front: (g) => [{ canvas: g.art, zone: "oversized", scale: 0.96, dx: -0.08, dy: -0.02, tint: "tonal" }], back: (g) => [{ canvas: g.art, zone: "back-center", scale: 1.0, dy: -0.02, tint: "tonal" }] },
  { name: "Navy · one-ink tile", palette: "team", colors: { base: "#13294B", trim: "#F2A900", accent: "#FFFFFF" },
    front: (g) => [{ canvas: g.art, mode: "tile", tile: 200, tint: "#F2A900", opacity: 0.9 }], back: (g) => [{ canvas: g.art, mode: "tile", tile: 200, tint: "#F2A900", opacity: 0.9 }] },
];

async function lookArt(notes) {
  const effectId = q.get("effect") || "graffiti";
  const [team, red, clean] = await Promise.all([
    loadGraphics(notes, { effectId, palette: DEFAULT_PALETTE }),
    loadGraphics(notes, { effectId, palette: RED_PALETTE }),
    loadGraphics(notes, { effectId: "original", palette: DEFAULT_PALETTE }),
  ]);
  return { team: { art: team.effect, clean: clean.effect }, red: { art: red.effect, clean: clean.effect }, name: team.effectName };
}

async function matrix() {
  const notes = [];
  const [garments, art] = await Promise.all([loadGarments(), lookArt(notes), fontsReady()]);
  const id = (q.get("garments") || "hoodie").split(",")[0];
  const garment = garments.find((g) => g.id === id);
  $("#query").textContent = `matrix · ${id} · effect=${art.name} · size=${SIZE} · bg=${BGQ}`;
  const only = q.get("looks") ? q.get("looks").split(",").map(Number) : LOOKS.map((_, i) => i);
  const gridEl = $("#grid");
  gridEl.classList.add("matrix");
  for (const li of only) {
    const look = LOOKS[li];
    if (!look) continue;
    const g = look.palette === "red" ? art.red : art.team;
    for (const viewId of VIEWS) {
      const t0 = performance.now();
      const canvas = renderMockup(garment, viewId, { size: SIZE, colors: look.colors, graphics: look[viewId](g), backdrop: BG, shadow: true, detail: DETAIL });
      const ms = performance.now() - t0;
      const { fig, frame } = card(look.name, viewId, Object.values(look.colors), ms);
      frame.append(canvas);
      gridEl.append(fig);
      results.push({ look: look.name, view: viewId, ms: r1(ms) });
    }
  }
  finish(notes);
}

/* ───────────────────────────── maps + crop ───────────────────────────── */

async function maps() {
  const garments = await loadGarments();
  const id = (q.get("garments") || "hoodie").split(",")[0];
  const garment = garments.find((g) => g.id === id);
  for (const viewId of VIEWS) {
    const b = debugBake(garment, viewId, SIZE);
    if (!b) continue;
    const { box } = b;
    const mk = (label, fn) => {
      const c = document.createElement("canvas");
      c.width = box.w; c.height = box.h;
      const x = c.getContext("2d");
      const img = x.createImageData(box.w, box.h);
      for (let i = 0; i < box.w * box.h; i++) {
        const [r, g2, bl] = fn(i);
        img.data[i * 4] = r; img.data[i * 4 + 1] = g2; img.data[i * 4 + 2] = bl; img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      const { fig, frame } = card(label, viewId, [], null, Math.max(box.w, box.h));
      frame.style.width = `${box.w}px`; frame.style.height = `${box.h}px`;
      frame.append(c);
      $("#grid").append(fig);
    };
    mk("shade", (i) => { const v = 255 - b.shade[i]; return [v, v, v]; });
    mk("light", (i) => { const v = b.light[i]; return [v, v, v]; });
    mk("print", (i) => [b.print[i], b.print[i], b.print[i]]);
    mk("displacement", (i) => [128 + b.dispX[i] / 4, 128 + b.dispY[i] / 4, 128]);
  }
  finish([]);
}

async function crop() {
  const notes = [];
  const [garments, art] = await Promise.all([loadGarments(), lookArt(notes), fontsReady()]);
  const id = (q.get("garments") || "hoodie").split(",")[0];
  const garment = garments.find((g) => g.id === id);
  const look = LOOKS[+(q.get("look") || 0)] || LOOKS[0];
  const g = look.palette === "red" ? art.red : art.team;
  const viewId = VIEWS[0];
  const c = renderMockup(garment, viewId, { size: SIZE, colors: look.colors, graphics: look[viewId](g), backdrop: BG || "studio" });
  const X = +(q.get("x") || 0), Y = +(q.get("y") || 0), W = +(q.get("w") || 800), H = +(q.get("h") || 800);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  out.getContext("2d").drawImage(c, X, Y, W, H, 0, 0, W, H);
  document.body.classList.add("bare");
  $("#grid").append(out);
  finish(notes);
}

function finish(notes) {
  $("#notes").innerHTML = notes.map((n) => `<p>${String(n).replace(/</g, "&lt;")}</p>`).join("");
  const bad = results.filter((r) => r.error && r.error !== "not available").length;
  const status = $("#status");
  status.textContent = bad ? `${bad} error(s)` : `Done · ${results.filter((r) => !r.error && !r.spec).length} renders`;
  status.className = `mono ${bad ? "bad" : "done"}`;
  window.__READY = true;
}

const MODES = { grid, matrix, maps, crop };
(MODES[MODE] || grid)().catch((e) => {
  console.error(e);
  $("#status").textContent = `Failed: ${e.message}`;
  $("#status").className = "mono bad";
  window.__READY = true;
});
