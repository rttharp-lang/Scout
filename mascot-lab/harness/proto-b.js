// proto-b harness (dev-only).
//
//   /harness/proto-b.html?mode=single&views=front,back&size=900&look=graffiti|clean|none
//        &colors=13294B,F2A900,FFFFFF&zone=oversized&scale=1&dx=0&dy=0&bg=studio|none|%23hex
//   ?mode=showcase   3 rows (navy/graffiti, white/clean, gold/plain) × front, back @1100 → 2200×3300
//   ?mode=thumbs     the same six @320 in one row on the studio backdrop → 1920×320
//   ?mode=perf       first render (bake) + recolour + graphic swap timings @320 and @1200
//   ?mode=maps       the baked shade / light / print / displacement maps
//   ?mode=crop&view=front&size=2400&x=..&y=..&w=..&h=..   a 1:1 crop of a big render
//
// window.__RESULTS / window.__READY for scripts/shoot.mjs --ready.
import { renderGarmentPhoto, prepareGarmentPhoto, measureHoodie, clearCaches, GARMENTS } from "../src/apparel/proto-b/index.js";
import { getEffect } from "../src/engine/effects/index.js";
import { renderEffect } from "../src/engine/render.js";
import { prepareLogo } from "../src/engine/image.js";
import { getSample } from "../src/assets/samples/index.js";

const q = new URLSearchParams(location.search);
const MODE = q.get("mode") || "single";
const results = [];
window.__RESULTS = results;
window.__READY = false;
const $ = (s) => document.querySelector(s);
const status = (t) => { $("#status").textContent = t; };
const hexes = (s, d) => {
  const a = (s || "").split(",").map((v) => v.trim().replace(/^#/, "")).filter((v) => /^[0-9a-f]{6}$/i.test(v)).map((v) => "#" + v.toUpperCase());
  return { base: a[0] || d.base, trim: a[1] || d.trim, accent: a[2] || d.accent };
};
const NAVY = "#13294B", GOLD = "#F2A900", WHITE = "#FFFFFF";
const PALETTE = { primary: NAVY, secondary: GOLD, accent: WHITE, dark: "#0B0D10", light: "#F4F5F7" };

async function loadArt() {
  const sample = getSample(q.get("logo") || "bulldog");
  const logo = (await prepareLogo(sample.url)).canvas;
  const [graffiti, original] = await Promise.all([getEffect(q.get("effect") || "graffiti"), getEffect("original")]);
  const [art, clean] = await Promise.all([
    renderEffect(graffiti, logo, {}, PALETTE, { size: 1024, seed: 7, logoKey: sample.id }),
    renderEffect(original, logo, {}, PALETTE, { size: 1024, seed: 7, logoKey: sample.id }),
  ]);
  return { art, clean };
}

function show(canvas, css) {
  // OffscreenCanvas → visible canvas
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  if (css) Object.assign(c.style, css);
  return c;
}

const SHOWCASE = [
  {
    name: "navy-graffiti",
    colors: { base: NAVY, trim: GOLD, accent: WHITE },
    front: (g) => [{ canvas: g.art, zone: "oversized", scale: 0.96, dx: -0.08, dy: -0.02 }],
    back: (g) => [{ canvas: g.art, zone: "back-center", scale: 1.04, dy: -0.025 }],
  },
  {
    name: "white-clean",
    colors: { base: WHITE, trim: NAVY, accent: GOLD },
    front: (g) => [{ canvas: g.clean, zone: "chest-left", scale: 1 }],
    back: (g) => [{ canvas: g.clean, zone: "back-yoke", scale: 1 }],
  },
  { name: "gold-plain", colors: { base: GOLD, trim: NAVY, accent: WHITE }, front: () => [], back: () => [] },
];

async function single() {
  const g = await loadArt();
  const views = (q.get("views") || "front,back").split(",");
  const size = +(q.get("size") || 900);
  const look = q.get("look") || "graffiti";
  const colors = hexes(q.get("colors"), { base: NAVY, trim: GOLD, accent: WHITE });
  const bgq = q.get("bg") ?? "studio";
  const backdrop = bgq === "none" ? null : bgq;
  for (const view of views) {
    let graphics = [];
    if (look !== "none") {
      const pl = { canvas: look === "clean" ? g.clean : g.art };
      const zone = q.get(view === "front" ? "zone" : "bzone") || (view === "front" ? "oversized" : "back-center");
      Object.assign(pl, { zone, scale: +(q.get("scale") || (zone === "oversized" ? 0.96 : 1)), dx: +(q.get("dx") || (zone === "oversized" ? -0.08 : 0)), dy: +(q.get("dy") || 0), rotate: +(q.get("rotate") || 0) });
      if (q.get("mode2") === "tile") Object.assign(pl, { mode: "tile", tile: +(q.get("tile") || 200) });
      if (q.get("tint")) pl.tint = q.get("tint");
      graphics = [pl];
    }
    const timings = {};
    const c = renderGarmentPhoto(view, { size, colors, graphics, backdrop, shadow: true, timings });
    $("#stage").append(show(c));
    results.push({ view, size, timings: round(timings) });
  }
  specTable();
}

function specTable() {
  const rows = measureHoodie();
  $("#info").innerHTML = "<table><tr><th>measurement</th><th>spec</th><th>drawn</th></tr>" +
    rows.map(([k, s, v]) => `<tr><td>${k}</td><td>${s}</td><td>${v}</td></tr>`).join("") + "</table>";
  results.push({ spec: rows });
}

async function showcase() {
  document.body.classList.add("bare");
  const g = await loadArt();
  const S = +(q.get("size") || 1100);
  const big = document.createElement("canvas");
  big.width = S * 2; big.height = S * 3;
  const x = big.getContext("2d");
  for (let r = 0; r < SHOWCASE.length; r++) {
    const v = SHOWCASE[r];
    for (const [ci, view] of [[0, "front"], [1, "back"]]) {
      const timings = {};
      const c = renderGarmentPhoto(view, { size: S, colors: v.colors, graphics: v[view](g), backdrop: "studio", shadow: true, timings });
      x.drawImage(c, ci * S, r * S);
      results.push({ variant: v.name, view, timings: round(timings) });
    }
  }
  // hairline gutters so the six frames read as separate shots
  x.fillStyle = "#ffffff";
  x.fillRect(S - 2, 0, 4, S * 3);
  x.fillRect(0, S - 2, S * 2, 4);
  x.fillRect(0, 2 * S - 2, S * 2, 4);
  $("#stage").append(big);
}

async function thumbs() {
  document.body.classList.add("bare");
  const g = await loadArt();
  const S = 320;
  const row = document.createElement("canvas");
  row.width = S * 6; row.height = S;
  const x = row.getContext("2d");
  let i = 0;
  for (const v of SHOWCASE) {
    for (const view of ["front", "back"]) {
      const c = renderGarmentPhoto(view, { size: S, colors: v.colors, graphics: v[view](g), backdrop: "studio", shadow: true });
      x.drawImage(c, i * S, 0);
      i++;
    }
  }
  x.fillStyle = "#ffffff";
  for (let k = 1; k < 6; k++) x.fillRect(k * S - 1, 0, 2, S);
  $("#stage").append(row);
}

async function perf() {
  const g = await loadArt();
  const out = [];
  for (const size of [320, 1200]) {
    for (const view of ["front", "back"]) {
      clearCaches();
      const t0 = performance.now();
      renderGarmentPhoto(view, { size, colors: SHOWCASE[0].colors, graphics: SHOWCASE[0][view](g), backdrop: "studio" });
      const first = performance.now() - t0;
      const rec = [];
      const cols = [SHOWCASE[1].colors, SHOWCASE[2].colors, SHOWCASE[0].colors, { base: "#7A1F2B", trim: "#C9CDD3", accent: "#FFFFFF" }];
      for (let i = 0; i < 8; i++) {
        const t = {};
        const t1 = performance.now();
        renderGarmentPhoto(view, { size, colors: cols[i % cols.length], graphics: SHOWCASE[0][view](g), backdrop: "studio", timings: t });
        rec.push(performance.now() - t1);
      }
      const swap = [];
      for (let i = 0; i < 4; i++) {
        const t1 = performance.now();
        renderGarmentPhoto(view, { size, colors: SHOWCASE[0].colors, graphics: (i % 2 ? SHOWCASE[0] : SHOWCASE[1])[view](g), backdrop: "studio" });
        swap.push(performance.now() - t1);
      }
      const plain = [];
      for (let i = 0; i < 4; i++) {
        const t1 = performance.now();
        renderGarmentPhoto(view, { size, colors: cols[i], graphics: [], backdrop: null });
        plain.push(performance.now() - t1);
      }
      const bt = {};
      clearCaches();
      prepareGarmentPhoto(view, { size, timings: bt });
      const med = (a) => [...a].sort((p, q2) => p - q2)[Math.floor(a.length / 2)];
      out.push({ size, view, firstRender: r1(first), recolorMedian: r1(med(rec.slice(1))), graphicSwapMedian: r1(med(swap)), plainRecolor: r1(med(plain)), bake: round(bt) });
    }
  }
  results.push(...out);
  $("#info").innerHTML = "<table><tr><th>size</th><th>view</th><th>first render</th><th>recolor</th><th>graphic swap</th><th>plain recolor</th><th>bake phases</th></tr>" +
    out.map((r) => `<tr><td>${r.size}</td><td>${r.view}</td><td>${r.firstRender}</td><td>${r.recolorMedian}</td><td>${r.graphicSwapMedian}</td><td>${r.plainRecolor}</td><td>${JSON.stringify(r.bake)}</td></tr>`).join("") + "</table>";
}

async function maps() {
  const view = q.get("view") || "front";
  const size = +(q.get("size") || 700);
  const b = prepareGarmentPhoto(view, { size });
  const { box } = b;
  const mk = (fn) => {
    const c = document.createElement("canvas");
    c.width = box.w; c.height = box.h;
    const x = c.getContext("2d");
    const img = x.createImageData(box.w, box.h);
    for (let i = 0; i < box.w * box.h; i++) {
      const [r, g2, bl] = fn(i);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g2; img.data[i * 4 + 2] = bl; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  };
  $("#stage").append(
    mk((i) => { const v = 255 - b.shade[i]; return [v, v, v]; }),
    mk((i) => { const v = b.light[i]; return [v, v, v]; }),
    mk((i) => [b.print[i], b.print[i], b.print[i]]),
    mk((i) => [128 + b.dispX[i] / 4, 128 + b.dispY[i] / 4, 128]),
  );
}

async function crop() {
  document.body.classList.add("bare");
  const g = await loadArt();
  const view = q.get("view") || "front";
  const size = +(q.get("size") || 2000);
  const v = SHOWCASE[+(q.get("v") || 0)];
  const c = renderGarmentPhoto(view, { size, colors: v.colors, graphics: v[view](g), backdrop: "studio" });
  const X = +(q.get("x") || 0), Y = +(q.get("y") || 0), W = +(q.get("w") || 800), H = +(q.get("h") || 800);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  out.getContext("2d").drawImage(c, X, Y, W, H, 0, 0, W, H);
  $("#stage").append(out);
}

const r1 = (v) => Math.round(v * 10) / 10;
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r1(v) : v]));

const MODES = { single, showcase, thumbs, perf, maps, crop };
(MODES[MODE] || single)()
  .then(() => { status(`Done · ${MODE}`); })
  .catch((e) => { console.error(e); status(`Failed: ${e.message}`); results.push({ error: e.message }); })
  .finally(() => { window.__READY = true; });
