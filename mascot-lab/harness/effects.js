// Effects contact sheet (dev-only). Rows = effects, columns = logos (or presets).
//
//   /harness/effects.html?effects=halftone,chrome|all&logos=bulldog,monogram|all
//     &size=384&seed=7&params={"dot":24}&preset=Mono%20ink&mode=presets|core
//     &bg=stage|checker|white|black|paper|dark|mid|team|RRGGBB&palette=13294B,F2A900,FFFFFF,0B0D10,F4F5F7
//     &perf=1&quality=preview|final
//
// window.__RESULTS = [{ effect, logo, size, ms, ms1024?, ms2048?, error, preset? }]
// window.__READY = true when everything has finished.
import "@fontsource/ibm-plex-mono/500";
import "@fontsource/archivo/400";
import "@fontsource/archivo/600";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import { loadEffects, validateEffect, lintEffect, EFFECT_ORDER } from "../src/engine/effects/index.js";
import { renderEffect, resolveParams, defaultParams, createRenderQueue, getSource } from "../src/engine/render.js";
import {
  prepareLogo, makeSource, removeBackground, extractPalette, suggestPalette, trimTransparent, loadImageFromFile, SAFE,
} from "../src/engine/image.js";
import * as core from "../src/engine/core.js";

const q = new URLSearchParams(location.search);
const SIZE = clampInt(q.get("size"), 384, 64, 2048);
const SEED = clampInt(q.get("seed"), 7, 0, 2 ** 31);
const MODE = q.get("mode") || "grid";
const BG = q.get("bg") || "stage";
const PERF = q.get("perf") === "1";
const QUALITY = q.get("quality") === "preview" ? "preview" : "final";
const PRESET = q.get("preset");
const PALETTE = parsePalette(q.get("palette"));
let OVERRIDES = {};
try { OVERRIDES = q.get("params") ? JSON.parse(q.get("params")) : {}; } catch (e) { console.warn("bad params JSON", e); }

const BUDGET = { 384: 150, 1024: 1500, 2048: 6000 };
const results = [];
window.__RESULTS = results;
window.__READY = false;
const queue = createRenderQueue();
const $ = (sel) => document.querySelector(sel);
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
function parsePalette(s) {
  const def = { primary: "#13294B", secondary: "#F2A900", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" };
  if (!s) return def;
  const hx = s.split(",").map((x) => core.normalizeHex(x));
  const keys = ["primary", "secondary", "accent", "dark", "light"];
  const out = { ...def };
  keys.forEach((k, i) => { if (hx[i]) out[k] = hx[i]; });
  return out;
}
function stageColor(stage) {
  switch (stage) {
    case "dark": return "#101216";
    case "mid": return "#7D838C";
    case "team": return core.darken(PALETTE.primary, 0.06);
    default: return "#ECEBE6";
  }
}
function backdrop(frame, effect) {
  if (BG === "checker") { frame.classList.add("checker"); return; }
  if (BG === "white" || BG === "black") frame.style.background = BG === "white" ? "#FFFFFF" : "#000000";
  else if (["paper", "dark", "mid", "team"].includes(BG)) frame.style.background = stageColor(BG); // force a stage
  else if (/^[0-9a-f]{6}$/i.test(BG)) frame.style.background = "#" + BG;                        // any hex
  else frame.style.background = stageColor(effect?.stage);
}
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
const budgetClass = (ms, size) => {
  const b = BUDGET[size] ?? (size <= 384 ? BUDGET[384] : size <= 1024 ? BUDGET[1024] : BUDGET[2048]);
  return ms > b ? "over" : ms > b * 0.7 ? "slow" : "";
};

/* ───────────────────────────── synthetic logos ───────────────────────────── */

const NAVY = "#13294B", GOLD = "#F2A900", WHITE = "#FFFFFF", RED = "#C8102E";
const DISPLAY = '"Big Shoulders Display", "Archivo", sans-serif';

function starPath(ctx, cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = rot + (i * Math.PI) / n;
    ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

const SYNTHETIC = {
  "synthetic-badge"() {
    const c = core.createCanvas(1024);
    const x = core.ctx2d(c);
    x.fillStyle = GOLD; x.beginPath(); x.arc(512, 512, 480, 0, Math.PI * 2); x.fill();
    x.fillStyle = NAVY; x.beginPath(); x.arc(512, 512, 430, 0, Math.PI * 2); x.fill();
    x.strokeStyle = WHITE; x.lineWidth = 14; x.beginPath(); x.arc(512, 512, 392, 0, Math.PI * 2); x.stroke();
    x.fillStyle = RED; starPath(x, 512, 250, 110, 46); x.fill();
    x.lineJoin = "round"; x.strokeStyle = WHITE; x.lineWidth = 10; starPath(x, 512, 250, 110, 46); x.stroke();
    x.font = `900 300px ${DISPLAY}`; x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.lineWidth = 26; x.strokeStyle = GOLD; x.strokeText("NHS", 512, 690);
    x.fillStyle = WHITE; x.fillText("NHS", 512, 690);
    x.fillStyle = GOLD; x.fillRect(300, 735, 424, 22);
    return c;
  },
  "synthetic-white"() {
    const c = core.createCanvas(1024);
    const x = core.ctx2d(c);
    x.fillStyle = WHITE;
    x.beginPath();
    x.moveTo(512, 70); x.lineTo(880, 190); x.lineTo(860, 560);
    x.quadraticCurveTo(820, 820, 512, 960); x.quadraticCurveTo(204, 820, 164, 560); x.lineTo(144, 190); x.closePath();
    x.fill();
    x.globalCompositeOperation = "destination-out";
    x.beginPath(); x.arc(512, 430, 190, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = "source-over";
    starPath(x, 512, 430, 150, 62); x.fill();
    x.globalCompositeOperation = "destination-out";
    x.fillRect(300, 700, 424, 34);
    x.beginPath(); x.arc(512, 820, 40, 0, Math.PI * 2); x.fill();
    return c;
  },
  "synthetic-thin"() {
    const c = core.createCanvas(1024);
    const x = core.ctx2d(c);
    x.strokeStyle = NAVY; x.lineCap = "round"; x.lineJoin = "round";
    x.lineWidth = 5;
    x.beginPath(); x.arc(512, 512, 440, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 3;
    x.beginPath(); x.arc(512, 512, 410, 0, Math.PI * 2); x.stroke();
    // paw print in line art
    x.lineWidth = 6;
    x.beginPath(); x.ellipse(512, 590, 150, 125, 0, 0, Math.PI * 2); x.stroke();
    for (const [dx, dy, r] of [[-170, -120, 62], [-62, -215, 66], [62, -215, 66], [170, -120, 62]]) {
      x.beginPath(); x.ellipse(512 + dx, 512 + dy, r * 0.82, r, dx * 0.002, 0, Math.PI * 2); x.stroke();
    }
    x.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      x.beginPath(); x.moveTo(400 + i * 28, 560); x.lineTo(380 + i * 32, 660); x.stroke();
    }
    x.font = `800 54px ${DISPLAY}`; x.textAlign = "center"; x.fillStyle = NAVY;
    x.fillText("EST · 1962", 512, 840);
    return c;
  },
  "synthetic-wide"() {
    const c = core.createCanvas(1600, 480);
    const x = core.ctx2d(c);
    x.save();
    x.translate(800, 340); x.transform(1, 0, -0.16, 1, 0, 0);
    x.font = `900 300px ${DISPLAY}`; x.textAlign = "center";
    x.lineJoin = "round";
    x.lineWidth = 44; x.strokeStyle = NAVY; x.strokeText("BULLDOGS", 0, 0);
    x.lineWidth = 18; x.strokeStyle = WHITE; x.strokeText("BULLDOGS", 0, 0);
    x.fillStyle = GOLD; x.fillText("BULLDOGS", 0, 0);
    x.restore();
    return c;
  },
};

const SAMPLE_URLS = import.meta.glob("../src/assets/samples/*.{svg,png,jpg}", { query: "?url", import: "default" });
const SAMPLES = {};
for (const [path, load] of Object.entries(SAMPLE_URLS)) {
  SAMPLES[path.split("/").pop().replace(/\.(svg|png|jpg)$/, "")] = load;
}

async function loadLogo(id) {
  if (SAMPLES[id]) {
    const url = await SAMPLES[id]();
    const r = await prepareLogo(url);
    return { id, canvas: r.canvas, info: r.bgRemoved ? "bg removed" : r.hadAlpha ? "alpha" : "" };
  }
  if (SYNTHETIC[id]) {
    const r = await prepareLogo(SYNTHETIC[id]());
    return { id, canvas: r.canvas, info: "synthetic" };
  }
  throw new Error(`unknown logo "${id}"`);
}

function pickLogoIds() {
  const want = q.get("logos");
  if (want === "all") return [...Object.keys(SAMPLES), ...Object.keys(SYNTHETIC)];
  if (want) return want.split(",").map((s) => s.trim()).filter(Boolean);
  const preferred = ["bulldog", "monogram", "crest"].filter((id) => SAMPLES[id]);
  return preferred.length ? preferred : Object.keys(SYNTHETIC);
}

/* ─────────────────────────────── grid UI ─────────────────────────────── */

function rowHeader(effect) {
  const h = el("div", "rowhead");
  h.append(el("h2", null, effect.name));
  const tags = el("div", "tags");
  for (const t of [effect.id, effect.category, effect.method, `stage: ${effect.stage}`]) tags.append(el("span", "tag mono", t));
  h.append(tags);
  h.append(el("p", "blurb", effect.blurb || ""));
  const ps = (effect.params || []).map((p) => `${p.key}=${typeof p.default === "string" ? p.default : JSON.stringify(p.default)}`).join(" · ");
  h.append(el("div", "params mono", ps));
  if (effect.presets?.length) h.append(el("div", "params mono", "presets: " + effect.presets.map((p) => p.name).join(" / ")));
  const lint = lintEffect(effect);
  if (lint.length) h.append(el("div", "params mono lint", "contract: " + lint.join(" · ")));
  return h;
}

function makeCell(effect, label) {
  const fig = el("figure", "cell");
  const frame = el("div", "frame");
  frame.style.width = frame.style.height = `${SIZE}px`;
  backdrop(frame, effect);
  frame.append(el("div", "pending mono", "queued"));
  const cap = el("figcaption", "mono");
  cap.append(el("span", null, `${effect.id} · ${label}`));
  fig.append(frame, cap);
  return { fig, frame, cap };
}

function showResult(cell, canvas, ms) {
  cell.frame.textContent = "";
  const view = core.createCanvas(SIZE, SIZE);
  view.style.width = view.style.height = `${SIZE}px`;
  core.ctx2d(view).drawImage(canvas, 0, 0, SIZE, SIZE);
  cell.frame.append(view);
  const t = el("span", `ms ${budgetClass(ms, SIZE)}`, fmtMs(ms));
  cell.cap.append(t);
}

function showError(cell, err) {
  cell.frame.textContent = "";
  cell.frame.append(el("div", "err", err?.message || String(err)));
  cell.cap.classList.add("error");
  cell.cap.append(el("span", null, "error"));
}

function withTimeout(promise, ms, message) {
  let t;
  return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); })])
    .finally(() => clearTimeout(t));
}

async function timeAt(effect, logo, params, size) {
  const src = makeSource(logo.canvas, size);
  const p = resolveParams(effect, params, PALETTE);
  const ctx = { size, scale: size / 1024, palette: PALETTE, seed: SEED, quality: QUALITY };
  const t0 = performance.now();
  await withTimeout(Promise.resolve(effect.render(src, p, ctx)), 60000, `render at ${size} timed out`);
  return performance.now() - t0;
}

function paramsFor(effect, presetName) {
  let base = {};
  if (presetName) {
    const pr = effect.presets.find((p) => p.name.toLowerCase() === presetName.toLowerCase());
    if (pr) base = pr.params;
  }
  return { ...base, ...OVERRIDES };
}

async function runCell(effect, logo, cell, { params, preset } = {}) {
  const key = `${effect.id}|${logo.id}|${preset || ""}`;
  const rec = { effect: effect.id, logo: logo.id, size: SIZE, ms: null, error: null };
  if (preset) rec.preset = preset;
  results.push(rec);
  await queue.enqueue(key, async () => {
    try {
      getSource(logo.canvas, SIZE, logo.id); // build the source outside the timing
      const t0 = performance.now();
      const out = await withTimeout(renderEffect(effect, logo.canvas, params, PALETTE,
        { size: SIZE, seed: SEED, quality: QUALITY, logoKey: logo.id }), 60000, `${effect.name}: render timed out (60 s)`);
      rec.ms = Math.round(performance.now() - t0);
      showResult(cell, out, rec.ms);
    } catch (err) {
      rec.error = err?.message || String(err);
      showError(cell, err);
      console.warn(`[harness] ${key}:`, err);
    }
  });
  if (PERF && !rec.error) {
    await queue.enqueue(`${key}|perf`, async () => {
      try {
        rec.ms1024 = Math.round(await timeAt(effect, logo, params, 1024));
        rec.ms2048 = Math.round(await timeAt(effect, logo, params, 2048));
        const perf = el("span", "perf");
        perf.innerHTML = `1k <b class="ms ${budgetClass(rec.ms1024, 1024)}">${fmtMs(rec.ms1024)}</b> · 2k <b class="ms ${budgetClass(rec.ms2048, 2048)}">${fmtMs(rec.ms2048)}</b>`;
        cell.cap.append(perf);
      } catch (err) {
        rec.error = `perf: ${err?.message || err}`;
        cell.cap.append(el("span", "error", "perf error"));
      }
    }, -1);
  }
}

function setStatus(text, done = false, bad = false) {
  const s = $("#status");
  s.textContent = text;
  s.classList.toggle("done", done);
  s.classList.toggle("bad", bad);
}

async function runGrid() {
  let effects = await loadEffects();
  const want = q.get("effects");
  let missing = [];
  if (want && want !== "all") {
    const ids = want.split(",").map((s) => s.trim()).filter(Boolean);
    effects = ids.map((id) => effects.find((e) => e.id === id)).filter(Boolean);
    missing = ids.filter((id) => !effects.some((e) => e.id === id));
    if (missing.length) console.warn("[harness] effects not loaded (missing file or failed validation — see warnings above):", missing.join(", "));
  }
  for (const e of effects) {           // soft contract checks (name/blurb length, method, param & preset counts…)
    const lint = lintEffect(e);
    if (lint.length) console.warn(`[lint] ${e.id}: ${lint.join("; ")}`);
  }
  const logoIds = pickLogoIds();
  setStatus("Loading logos…");
  const logos = [];
  for (const id of logoIds) {
    try { logos.push(await loadLogo(id)); } catch (e) { console.warn(`[harness] logo ${id}:`, e); }
  }
  $("#query").textContent = [
    `${effects.length} effects`, MODE === "presets" ? `presets · ${logos[0]?.id}` : `${logos.length} logos`,
    `${SIZE}px`, `seed ${SEED}`, QUALITY, `bg ${BG}`, PERF ? "perf" : "", PRESET ? `preset ${PRESET}` : "",
    Object.keys(OVERRIDES).length ? `params ${JSON.stringify(OVERRIDES)}` : "",
  ].filter(Boolean).join(" · ");

  const sheet = el("div", "sheet");
  $("#main").append(sheet);
  const jobs = [];
  if (MODE === "presets") {
    const logo = logos[0];
    const cols = Math.max(1, ...effects.map((e) => e.presets.length));
    sheet.style.gridTemplateColumns = `240px repeat(${cols}, ${SIZE + 12}px)`;
    for (const effect of effects) {
      sheet.append(rowHeader(effect));
      for (let i = 0; i < cols; i++) {
        const pr = effect.presets[i];
        if (!pr) { sheet.append(el("div", "cell")); continue; }
        const cell = makeCell(effect, pr.name);
        sheet.append(cell.fig);
        if (logo) jobs.push(runCell(effect, logo, cell, { params: { ...pr.params, ...OVERRIDES }, preset: pr.name }));
      }
    }
  } else {
    sheet.style.gridTemplateColumns = `240px repeat(${logos.length}, ${SIZE + 12}px)`;
    sheet.append(el("div", "colhead mono", ""));
    for (const logo of logos) sheet.append(el("div", "colhead mono", `${logo.id}${logo.info ? " · " + logo.info : ""} · ${logo.canvas.width}×${logo.canvas.height}`));
    for (const effect of effects) {
      sheet.append(rowHeader(effect));
      for (const logo of logos) {
        const cell = makeCell(effect, logo.id);
        sheet.append(cell.fig);
        jobs.push(runCell(effect, logo, cell, { params: paramsFor(effect, PRESET), preset: PRESET || undefined }));
      }
    }
  }
  for (const id of missing) {
    const h = el("div", "rowhead");
    h.append(el("h2", null, id));
    sheet.append(h);
    const msg = el("figure", "cell");
    msg.style.gridColumn = "2 / -1";
    msg.append(el("figcaption", "mono error", `"${id}" did not load — missing file, import error, or failed validation (see console warnings).`));
    sheet.append(msg);
    results.push({ effect: id, logo: null, size: SIZE, ms: null, error: "effect not loaded" });
  }
  const total = jobs.length;
  let doneN = 0;
  jobs.forEach((j) => j.finally(() => setStatus(`Rendering ${++doneN}/${total}`)));
  setStatus(`Rendering 0/${total}`);
  await Promise.allSettled(jobs);
  const errs = results.filter((r) => r.error).length;
  setStatus(errs ? `Done · ${errs} error${errs > 1 ? "s" : ""}` : `Done · ${total} renders`, !errs, !!errs);
}

/* ─────────────────────────── core sanity checks ─────────────────────────── */

async function runCore() {
  $("#query").textContent = "core helpers · sanity checks";
  const main = el("div", "core");
  $("#main").append(main);
  const checks = el("div", "checks");
  const section = (title) => { main.append(el("h2", null, title)); const t = el("div", "tiles"); main.append(t); return t; };
  const check = (name, ok, detail = "") => {
    const line = el("div", ok ? "pass" : "fail", `${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
    checks.append(line);
    results.push({ effect: "core", logo: name, size: 0, ms: 0, error: ok ? null : detail || "failed" });
  };
  const tile = (parent, canvas, caption, bg = "checker", px = 256) => {
    const f = el("figure");
    const fr = el("div", "frame");
    if (bg === "checker") fr.classList.add("checker"); else fr.style.background = bg;
    const v = core.createCanvas(px, px * (canvas.height / canvas.width));
    v.style.width = `${px}px`;
    core.ctx2d(v).drawImage(canvas, 0, 0, v.width, v.height);
    fr.append(v);
    f.append(fr, el("figcaption", "mono", caption));
    parent.append(f);
  };
  main.append(el("h2", null, "Checks"), checks);
  const time = (fn) => { const t = performance.now(); const r = fn(); return [r, performance.now() - t]; };

  // distance field exactness
  {
    const w = 64, h = 48;
    const m = new Float32Array(w * h);
    m[10 * w + 10] = 1;
    const { inside, outside } = core.distanceField(m, w, h);
    check("EDT single seed (3,4,5)", Math.abs(outside[14 * w + 13] - 5) < 1e-5, `got ${outside[14 * w + 13]}`);
    check("EDT far corner", Math.abs(outside[(h - 1) * w + (w - 1)] - Math.hypot(w - 1 - 10, h - 1 - 10)) < 1e-4);
    check("EDT inside of seed = 1", Math.abs(inside[10 * w + 10] - 1) < 1e-6, `got ${inside[10 * w + 10]}`);
    // brute-force comparison on a random-ish mask
    const r = core.rng(3);
    const m2 = new Float32Array(w * h);
    for (let i = 0; i < m2.length; i++) m2[i] = r() < 0.03 ? 1 : 0;
    const df = core.distanceField(m2, w, h);
    let maxErr = 0;
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
      let best = Infinity;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (m2[yy * w + xx] >= 0.5) best = Math.min(best, Math.hypot(xx - x, yy - y));
      const got = m2[y * w + x] >= 0.5 ? 0 : df.outside[y * w + x];
      maxErr = Math.max(maxErr, Math.abs(got - best));
    }
    check("EDT matches brute force", maxErr < 1e-4, `max err ${maxErr.toExponential(2)}`);
    // both sides on a dense blobby mask
    const m3 = new Float32Array(w * h);
    const nz = core.makeNoise2D(5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m3[y * w + x] = nz(x / 9, y / 9) > 0 ? 1 : 0;
    const d3 = core.distanceField(m3, w, h);
    let e3 = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const inside = m3[y * w + x] >= 0.5;
      let best = Infinity;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if ((m3[yy * w + xx] >= 0.5) !== inside) best = Math.min(best, Math.hypot(xx - x, yy - y));
      const got = inside ? d3.inside[y * w + x] : d3.outside[y * w + x];
      e3 = Math.max(e3, Math.abs(got - best));
    }
    check("EDT inside/outside match brute force", e3 < 1e-4, `max err ${e3.toExponential(2)}`);
  }

  // test shape: ring + bar + dot, 512²
  const S = 512;
  const shape = core.createCanvas(S);
  {
    const x = core.ctx2d(shape);
    x.fillStyle = NAVY;
    x.beginPath(); x.arc(200, 220, 140, 0, Math.PI * 2); x.arc(200, 220, 70, 0, Math.PI * 2, true); x.fill();
    x.fillRect(330, 120, 120, 260);
    x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(390, 250, 30, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = "source-over";
    x.beginPath(); x.arc(120, 440, 26, 0, Math.PI * 2); x.fill();
    x.lineWidth = 3; x.strokeStyle = NAVY; x.beginPath(); x.moveTo(300, 430); x.bezierCurveTo(360, 380, 420, 480, 480, 420); x.stroke();
  }
  const mask = core.alphaMask(shape);
  {
    const t = section("Distance field · dilate / erode · contours");
    const [df, msDF] = time(() => core.distanceField(mask, S, S));
    const vis = core.createCanvas(S);
    const vx = core.ctx2d(vis);
    const img = vx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = df.outside[i] > 0 ? df.outside[i] : -df.inside[i];
      const band = 0.5 + 0.5 * Math.cos(v * 0.35);
      const j = i * 4;
      if (v > 0) { img.data[j] = 40 + 120 * band; img.data[j + 1] = 90 + 120 * band; img.data[j + 2] = 200; }
      else { img.data[j] = 230; img.data[j + 1] = 120 + 100 * band; img.data[j + 2] = 30; }
      img.data[j + 3] = 255;
    }
    vx.putImageData(img, 0, 0);
    tile(t, vis, `distanceField ${S}² · ${fmtMs(msDF)}`, "#fff");

    const [dil, msD] = time(() => core.dilateMask(mask, S, S, 14));
    const [ero, msE] = time(() => core.erodeMask(mask, S, S, 10));
    const de = core.createCanvas(S);
    const dx = core.ctx2d(de);
    dx.drawImage(core.maskToCanvas(dil, S, S, GOLD), 0, 0);
    dx.drawImage(shape, 0, 0);
    dx.drawImage(core.maskToCanvas(ero, S, S, "#E8EEF8"), 0, 0);
    tile(t, de, `dilate 14 (${fmtMs(msD)}) · erode 10 (${fmtMs(msE)})`);
    // zoomed crop to judge anti-aliasing
    const zoom = core.createCanvas(256);
    const zx = core.ctx2d(zoom);
    zx.imageSmoothingEnabled = false;
    zx.drawImage(de, 300, 92, 64, 64, 0, 0, 256, 256);
    tile(t, zoom, "dilate/erode edge · 4× zoom", "#fff");

    const [contours, msC] = time(() => core.traceContours(mask, S, S, 0.5, 0.75));
    const cc = core.createCanvas(S);
    const cx = core.ctx2d(cc);
    cx.fillStyle = "rgba(19,41,75,.12)"; cx.fill(core.contoursToPath(contours), "nonzero");
    cx.lineWidth = 1.5;
    contours.forEach((c, i) => {
      let area = 0;
      for (let k = 0; k < c.length; k++) { const a = c[k], b = c[(k + 1) % c.length]; area += a[0] * b[1] - b[0] * a[1]; }
      cx.strokeStyle = area > 0 ? "#C8102E" : "#2B6CB0";
      cx.beginPath(); c.forEach(([px, py], k) => cx[k ? "lineTo" : "moveTo"](px, py)); cx.closePath(); cx.stroke();
    });
    const pts = contours.reduce((a, c) => a + c.length, 0);
    tile(t, cc, `traceContours: ${contours.length} loops, ${pts} pts · ${fmtMs(msC)} (red=outer, blue=hole)`, "#fff");
    const signs = contours.map((c) => { let a = 0; for (let k = 0; k < c.length; k++) { const p = c[k], n = c[(k + 1) % c.length]; a += p[0] * n[1] - n[0] * p[1]; } return Math.sign(a); });
    check("contours: 3 outer + 2 holes", signs.filter((s) => s > 0).length === 3 && signs.filter((s) => s < 0).length === 2, `outer ${signs.filter((s) => s > 0).length}, holes ${signs.filter((s) => s < 0).length}`);
    const filled = core.createCanvas(S);
    const fx = core.ctx2d(filled);
    fx.fillStyle = "#000"; fx.fill(core.contoursToPath(contours, 1, 0, 0), "nonzero");
    const fm = core.alphaMask(filled);
    let diff = 0;
    for (let i = 0; i < S * S; i++) diff += Math.abs(fm[i] - mask[i]);
    check("contour fill reproduces mask", diff / (S * S) < 0.004, `mean |Δ| ${(diff / (S * S)).toFixed(4)}`);

    const [ht, msH] = time(() => core.heightFromMask(mask, S, S, 18));
    const { nx, ny, nz } = core.normalsFromHeight(ht, S, S, 40);
    const lit = core.createCanvas(S);
    const lx = core.ctx2d(lit);
    const li = lx.createImageData(S, S);
    const L = [-0.5, -0.6, 0.62];
    for (let i = 0; i < S * S; i++) {
      const d = Math.max(0, nx[i] * L[0] + ny[i] * L[1] + nz[i] * L[2]);
      const j = i * 4;
      li.data[j] = li.data[j + 1] = li.data[j + 2] = 30 + 225 * d;
      li.data[j + 3] = mask[i] * 255;
    }
    lx.putImageData(li, 0, 0);
    tile(t, lit, `heightFromMask + normals · ${fmtMs(msH)}`, "#2a2f38");
  }

  // blur + noise + gradient map
  {
    const t = section("Blur · noise · gradient map · quantize");
    const [b, msB] = time(() => core.blurCanvas(shape, 8));
    tile(t, b, `blurCanvas 8px (${core.supportsCanvasFilter() ? "ctx.filter" : "box"}) · ${fmtMs(msB)}`);
    const [bm, msBM] = time(() => core.blurMask(mask, S, S, 8));
    tile(t, core.maskToCanvas(bm, S, S, NAVY), `blurMask 8px · ${fmtMs(msBM)}`);
    const nz = core.makeNoise2D(42);
    const nc = core.createCanvas(256);
    const nxx = core.ctx2d(nc);
    const ni = nxx.createImageData(256, 256);
    let lo = 1, hi = -1;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = core.fbm(nz, x / 48, y / 48, 5);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      const j = (y * 256 + x) * 4;
      ni.data[j] = ni.data[j + 1] = ni.data[j + 2] = 128 + 127 * v; ni.data[j + 3] = 255;
    }
    nxx.putImageData(ni, 0, 0);
    tile(t, nc, `fbm(simplex) range ${lo.toFixed(2)}…${hi.toFixed(2)}`);
    check("noise deterministic", core.makeNoise2D(42)(1.3, 2.7) === nz(1.3, 2.7));
    check("noise in [-1,1]", lo >= -1 && hi <= 1 && hi - lo > 0.8, `${lo.toFixed(2)}…${hi.toFixed(2)}`);
    const gm = core.applyGradientMap(nc, [{ at: 0, color: NAVY }, { at: 0.5, color: "#C8102E" }, { at: 1, color: GOLD }]);
    tile(t, gm, "applyGradientMap navy→red→gold");
    tile(t, core.quantizeToPalette(gm, [NAVY, GOLD, WHITE]), "quantizeToPalette(navy, gold, white)");
    tile(t, core.posterize(nc, 4), "posterize 4");
  }

  // background removal + palette
  {
    const t = section("removeBackground · extractPalette · suggestPalette");
    const onWhite = core.createCanvas(900, 700);
    const ox = core.ctx2d(onWhite);
    ox.fillStyle = "#FFFFFF"; ox.fillRect(0, 0, 900, 700);
    // a little "mascot": navy head with white eyes + teeth, gold collar, letters with counters
    ox.fillStyle = NAVY; ox.beginPath(); ox.ellipse(330, 330, 230, 210, 0, 0, Math.PI * 2); ox.fill();
    ox.fillStyle = "#FFFFFF";
    ox.beginPath(); ox.ellipse(250, 280, 46, 34, 0, 0, Math.PI * 2); ox.fill();
    ox.beginPath(); ox.ellipse(410, 280, 46, 34, 0, 0, Math.PI * 2); ox.fill();
    ox.fillStyle = "#0B0D10"; ox.beginPath(); ox.arc(262, 284, 16, 0, 7); ox.fill(); ox.beginPath(); ox.arc(398, 284, 16, 0, 7); ox.fill();
    ox.fillStyle = "#FFFFFF"; for (let i = 0; i < 5; i++) { ox.beginPath(); ox.moveTo(250 + i * 40, 410); ox.lineTo(270 + i * 40, 450); ox.lineTo(290 + i * 40, 410); ox.fill(); }
    ox.fillStyle = GOLD; ox.fillRect(150, 520, 360, 60);
    ox.font = `900 230px ${DISPLAY}`; ox.fillStyle = NAVY; ox.fillText("O", 600, 420);
    const [rb, msR] = time(() => removeBackground(onWhite, 28));
    tile(t, onWhite, "input: logo on white", "#fff", 300);
    tile(t, rb.canvas, `removeBackground · removed=${rb.removed} · ${fmtMs(msR)}`, "checker", 300);
    const rbd = core.ctx2d(rb.canvas).getImageData(0, 0, 900, 700).data;
    const a = (x, y) => rbd[(y * 900 + x) * 4 + 3];
    check("bg removed at corner", a(5, 5) === 0);
    check("white eye kept (enclosed detail)", a(240, 275) === 255, `alpha ${a(240, 275)}`);
    check("tooth kept", a(270, 420) > 200, `alpha ${a(270, 420)}`);
    check("letter counter (multicolor logo) kept", a(670, 340) > 200, `alpha ${a(670, 340)}`);
    // JPEG round trip
    const jpg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = onWhite.toDataURL("image/jpeg", 0.72); });
    const jc = core.createCanvas(900, 700); core.ctx2d(jc).drawImage(jpg, 0, 0);
    const rj = removeBackground(jc, 28);
    tile(t, rj.canvas, `JPEG q72 · removed=${rj.removed}`, "#13294B", 300);
    const rjd = core.ctx2d(rj.canvas).getImageData(0, 0, 900, 700).data;
    let fringe = 0, edge = 0;
    for (let i = 0; i < 900 * 700; i++) {
      const al = rjd[i * 4 + 3];
      if (al > 0 && al < 255) { edge++; if (rjd[i * 4] > 200 && rjd[i * 4 + 1] > 200 && rjd[i * 4 + 2] > 200) fringe++; }
    }
    check("JPEG: no white fringe on edges", fringe < edge * 0.15, `${fringe}/${edge} light edge px`);
    // single-ink wordmark → counters cleared
    const ink = core.createCanvas(700, 300);
    const ix = core.ctx2d(ink);
    ix.fillStyle = "#fff"; ix.fillRect(0, 0, 700, 300);
    ix.font = `900 240px ${DISPLAY}`; ix.fillStyle = "#111"; ix.fillText("BOAR", 40, 255);
    const ri = removeBackground(ink, 28);
    tile(t, ri.canvas, "single-ink wordmark: counters cleared", "#C8102E", 300);
    const zeros = (c) => { const dd = core.ctx2d(c).getImageData(0, 0, c.width, c.height).data; let z = 0; for (let j = 3; j < dd.length; j += 4) if (dd[j] === 0) z++; return z; };
    const kept = removeBackground(ink, 28, { holes: "keep" });
    check("single-ink counters cleared", zeros(ri.canvas) > zeros(kept.canvas) + 200, `${zeros(ri.canvas)} vs keep ${zeros(kept.canvas)} transparent px`);
    const no = core.createCanvas(200, 200); const nx2 = core.ctx2d(no);
    const grd = nx2.createLinearGradient(0, 0, 200, 0); grd.addColorStop(0, "#f00"); grd.addColorStop(1, "#00f");
    nx2.fillStyle = grd; nx2.fillRect(0, 0, 200, 200);
    check("non-uniform border → removed=false", removeBackground(no).removed === false);

    const trimmed = trimTransparent(rb.canvas);
    check("trimTransparent bbox", trimmed.width < 900 && trimmed.height < 700, `${trimmed.width}×${trimmed.height}`);
    const [pal, msP] = time(() => extractPalette(trimmed, 6));
    const sug = suggestPalette(trimmed);
    const sw = el("div", "swatches");
    for (const p of pal) { const s = el("div", "sw"); const i = el("i"); i.style.background = p.hex; s.append(i, el("span", "mono", `${p.hex} ${(p.weight * 100).toFixed(0)}%`)); sw.append(s); }
    main.append(el("div", "mono muted", `extractPalette · ${fmtMs(msP)}`), sw);
    const sw2 = el("div", "swatches");
    for (const [k, v] of Object.entries(sug)) { const s = el("div", "sw"); const i = el("i"); i.style.background = v; s.append(i, el("span", "mono", `${k} ${v}`)); sw2.append(s); }
    main.append(el("div", "mono muted", "suggestPalette"), sw2);
    check("palette hexes uppercase", pal.every((p) => /^#[0-9A-F]{6}$/.test(p.hex)));
    check("suggest primary is navy-ish", core.hexToRgb(sug.primary)[2] > core.hexToRgb(sug.primary)[0] + 30, sug.primary);
    // samples too
    for (const id of Object.keys(SAMPLES)) {
      try {
        const lg = await loadLogo(id);
        const sp = suggestPalette(lg.canvas);
        const row = el("div", "swatches");
        row.append(el("span", "mono", `${id} (${lg.canvas.width}×${lg.canvas.height}${lg.info ? ", " + lg.info : ""})  `));
        for (const p of extractPalette(lg.canvas, 6)) { const s = el("div", "sw"); const i = el("i"); i.style.background = p.hex; s.append(i, el("span", "mono", `${p.hex} ${(p.weight * 100).toFixed(0)}%`)); row.append(s); }
        row.append(el("span", "mono", "  → "));
        for (const [k, v] of Object.entries(sp)) { const s = el("div", "sw"); const i = el("i"); i.style.background = v; s.append(i, el("span", "mono", k)); row.append(s); }
        main.append(row);
        const tl = el("div", "tiles"); main.append(tl);
        tile(tl, lg.canvas, `${id} prepared`, "checker", 220);
      } catch (e) { check(`sample ${id}`, false, e.message); }
    }
  }

  // queue behaviour
  {
    const qq = createRenderQueue();
    const order = [];
    const p1 = qq.enqueue("a", async () => order.push("a"), 0);
    const p2 = qq.enqueue("b", async () => order.push("b"), 5);
    const p3 = qq.enqueue("b", async () => order.push("b2"), 0);
    const p4 = qq.enqueue("c", async () => order.push("c"), 1);
    qq.cancel((k) => k === "c");
    let cancelled = false;
    try { await p4; } catch (e) { cancelled = e.name === "AbortError"; }
    await Promise.all([p1, p2, p3]);
    check("queue priority + dedupe + cancel", order.join(",") === "b,a" && p2 === p3 && cancelled, order.join(","));
  }
  // registry validation, param resolution, render wrapper, SVG files
  {
    const ok = { id: "x", name: "X", category: "print", stage: "paper", params: [{ key: "a", label: "A", type: "range", min: 0, max: 10, default: 5 }], presets: [], render: () => null };
    check("validate: good effect", validateEffect({ ...ok }, "x") === null);
    check("validate: id must match filename", !!validateEffect({ ...ok }, "y"));
    check("validate: render must be a function", !!validateEffect({ ...ok, render: 1 }, "x"));
    check("validate: bad select default", !!validateEffect({ ...ok, params: [{ key: "s", label: "S", type: "select", options: [{ value: 1, label: "one" }], default: 2 }] }, "x"));
    check("validate: duplicate keys", !!validateEffect({ ...ok, params: [ok.params[0], ok.params[0]] }, "x"));
    const fx = {
      id: "t", name: "Tester", params: [
        { key: "n", label: "N", type: "range", min: 0, max: 10, default: 5 },
        { key: "c", label: "C", type: "color", default: "secondary" },
        { key: "s", label: "S", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], default: "a" },
        { key: "t", label: "T", type: "toggle", default: true },
      ],
    };
    const rp = resolveParams(fx, { n: 99, c: "#abc", s: "zzz", t: "false", extra: 1 }, PALETTE);
    check("resolveParams clamps/normalizes", rp.n === 10 && rp.c === "#AABBCC" && rp.s === "a" && rp.t === false && !("extra" in rp), JSON.stringify(rp));
    const rd = resolveParams(fx, {}, PALETTE);
    check("resolveParams roles → hex", rd.c === PALETTE.secondary && rd.n === 5 && rd.t === true, JSON.stringify(rd));
    check("defaultParams keeps roles", defaultParams(fx).c === "secondary");
    const logoC = core.createCanvas(200, 100);
    core.ctx2d(logoC).fillRect(0, 0, 200, 100);
    const src = makeSource(logoC, 500);
    const sb = core.maskBounds(core.alphaMask(src), 500, 500, 0.5);
    check("makeSource fits the SAFE box", Math.abs(sb.x1 - sb.x0 - 500 * SAFE) <= 1 && Math.abs((sb.x0 + sb.x1) / 2 - 250) <= 1, JSON.stringify(sb));
    let calls = 0;
    const counting = { ...fx, id: "count", render: (s) => { calls++; return core.cloneCanvas(s); } };
    const a1 = await renderEffect(counting, logoC, {}, PALETTE, { size: 128, logoKey: "k" });
    const a2 = await renderEffect(counting, logoC, {}, PALETTE, { size: 128, logoKey: "k" });
    check("renderEffect caches results", a1 === a2 && calls === 1, `calls ${calls}`);
    const thrower = { ...fx, id: "boom", name: "Boom", render: () => { throw new Error("kaput"); } };
    let msg = "";
    const pr = renderEffect(thrower, logoC, {}, PALETTE, { size: 64 });
    try { await pr; } catch (e) { msg = e.message; }
    check("renderEffect wraps errors with the effect name", msg === "Boom: kaput", msg);
    // SVG File → rasterized at 2048 on the long side
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect x="10" y="10" width="100" height="40" fill="#13294B"/></svg>';
    const fc = await loadImageFromFile(new File([svgText], "wide.svg", { type: "image/svg+xml" }));
    check("SVG file rasterized at 2048 long side", fc.width === 2048 && fc.height === 1024, `${fc.width}×${fc.height}`);
    check("EFFECT_ORDER starts with original", EFFECT_ORDER[0] === "original" && EFFECT_ORDER.length === 22);
  }

  const fails = results.filter((r) => r.error).length;
  setStatus(fails ? `${fails} check(s) failed` : `All ${results.length} checks passed`, !fails, !!fails);
}

/* ──────────────────────────────── boot ──────────────────────────────── */

(async () => {
  try {
    await document.fonts.load(`900 100px "Big Shoulders Display"`).catch(() => {});
    await document.fonts.load(`800 100px "Big Shoulders Display"`).catch(() => {});
    if (MODE === "core") await runCore();
    else await runGrid();
  } catch (err) {
    console.error(err);
    setStatus(`Harness error: ${err.message}`);
  } finally {
    window.__READY = true;
  }
})();
