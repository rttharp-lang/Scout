// Proto A harness (dev-only): height-field garment photo renderer.
//
//   /harness/proto-a.html?mode=showcase            3 looks × (front, back) at 1100 px → 3300 × 2200
//   /harness/proto-a.html?mode=thumbs              the same six at 320 px in one row (studio)
//   /harness/proto-a.html?mode=single&look=1&view=front&size=1400&bg=studio|none|%23hex
//        &crop=x,y,w  (artboard units: show only that square, scaled to fill `size`)
//   /harness/proto-a.html?mode=debug&view=front&size=800&map=height|ao|shadow|diffuse|detail|print|normals
//   /harness/proto-a.html?mode=perf                first render / recolour / new graphic timings
// window.__READY / window.__RESULTS like the other harness pages.
import { renderGarmentPhoto, prepareGarmentPhoto, clearGarmentPhotoCache, hoodie } from "../src/apparel/proto-a/index.js";
import { renderEffect } from "../src/engine/render.js";
import { getEffect } from "../src/engine/effects/index.js";
import { getSample } from "../src/assets/samples/index.js";
import { prepareLogo, makeSource } from "../src/engine/image.js";

const q = new URLSearchParams(location.search);
const MODE = q.get("mode") || "showcase";
const root = document.getElementById("root");
const meta = document.getElementById("meta");
window.__READY = false;
window.__RESULTS = null;

const NAVY = "#13294B", GOLD = "#F2A900", WHITE = "#FFFFFF";

async function loadGraphics() {
  const sample = getSample("bulldog");
  const { canvas: logoCanvas } = await prepareLogo(sample.url);
  const logo = makeSource(logoCanvas, 1024);
  const eff = await getEffect(q.get("effect") || "graffiti");
  const graffiti = await renderEffect(eff, logoCanvas, {}, sample.palette, { size: 1024, seed: 7, logoKey: "bulldog" });
  return { logo, graffiti };
}

function looks(gfx) {
  return [
    {
      name: "Navy / gold · graffiti statement",
      colors: { base: NAVY, trim: GOLD, accent: WHITE },
      front: [{ canvas: gfx.graffiti, zone: "oversized", scale: 0.96, dx: -0.08, dy: -0.02 }],
      back: [{ canvas: gfx.graffiti, zone: "back-center", scale: 1.04, dy: -0.025 }],
    },
    {
      name: "White / navy · clean crest",
      colors: { base: WHITE, trim: NAVY, accent: NAVY },
      front: [{ canvas: gfx.logo, zone: "chest-left", scale: 1 }],
      back: [{ canvas: gfx.logo, zone: "back-yoke", scale: 1 }],
    },
    {
      name: "Gold / navy · blank",
      colors: { base: GOLD, trim: NAVY, accent: WHITE },
      front: [], back: [],
    },
  ];
}

const bgOf = () => { const b = q.get("bg"); return b === "none" ? null : b || "studio"; };
const now = () => performance.now();

async function showcase(gfx, size = 1100) {
  const L = looks(gfx);
  const c = document.createElement("canvas");
  c.width = size * 3; c.height = size * 2;
  const x = c.getContext("2d");
  const res = [];
  for (let col = 0; col < 3; col++) {
    for (const [row, view] of [[0, "front"], [1, "back"]]) {
      const t = now();
      const img = renderGarmentPhoto(view, { size, colors: L[col].colors, graphics: L[col][view], backdrop: "studio" });
      res.push({ look: col + 1, view, ms: Math.round(now() - t) });
      x.drawImage(img, col * size, row * size);
    }
  }
  root.appendChild(c);
  return res;
}

async function thumbs(gfx, size = 320) {
  const L = looks(gfx);
  const c = document.createElement("canvas");
  c.width = size * 6; c.height = size;
  const x = c.getContext("2d");
  let i = 0;
  const res = [];
  for (let col = 0; col < 3; col++) for (const view of ["front", "back"]) {
    const t = now();
    const img = renderGarmentPhoto(view, { size, colors: L[col].colors, graphics: L[col][view], backdrop: "studio" });
    res.push({ look: col + 1, view, ms: Math.round(now() - t) });
    x.drawImage(img, i++ * size, 0);
  }
  root.appendChild(c);
  return res;
}

async function single(gfx) {
  const L = looks(gfx)[(+q.get("look") || 1) - 1];
  const view = q.get("view") || "front";
  const size = +q.get("size") || 1100;
  const crop = q.get("crop");
  const t = now();
  const timings = {};
  if (crop) {
    const [cx, cy, cw] = crop.split(",").map(Number);
    const full = Math.round((size * 1000) / cw);
    const img = renderGarmentPhoto(view, { size: full, colors: L.colors, graphics: q.get("plain") ? [] : L[view], backdrop: bgOf(), timings });
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    c.getContext("2d").drawImage(img, (cx / 1000) * full, (cy / 1000) * full, (cw / 1000) * full, (cw / 1000) * full, 0, 0, size, size);
    root.appendChild(c);
  } else {
    const img = renderGarmentPhoto(view, { size, colors: L.colors, graphics: q.get("plain") ? [] : L[view], backdrop: bgOf(), timings });
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    c.getContext("2d").drawImage(img, 0, 0);
    root.appendChild(c);
  }
  return { ms: Math.round(now() - t), timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])) };
}

function debug() {
  const view = q.get("view") || "front";
  const size = +q.get("size") || 800;
  const map = q.get("map") || "height";
  const bk = prepareGarmentPhoto(view, { size });
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  const img = x.createImageData(size, size);
  const { x0, y0, w, h } = bk.box;
  const put = (fn) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx, p = ((yy + y0) * size + xx + x0) * 4;
      const v = fn(i);
      if (v == null) continue;
      const [r, g, b] = Array.isArray(v) ? v : [v, v, v];
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
  };
  if (map === "height") {
    const L = bk.L, Hc = bk.debug.Hc;
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
      const v = Hc[Math.min(L - 1, (yy * L / size) | 0) * L + Math.min(L - 1, (xx * L / size) | 0)];
      const p = (yy * size + xx) * 4;
      const t = Math.max(0, Math.min(1, (v + 6) / 12));
      img.data[p] = t * 255; img.data[p + 1] = t * 255; img.data[p + 2] = t * 255; img.data[p + 3] = 255;
    }
  } else if (map === "ao") put((i) => (bk.A[i] > 0 ? bk.debug.AO[i] * 255 : null));
  else if (map === "shadow") put((i) => (bk.A[i] > 0 ? bk.debug.SH[i] * 255 : null));
  else if (map === "diffuse") put((i) => (bk.A[i] > 0 ? Math.min(255, bk.D[i] * 200 + bk.SP[i] * 400) : null));
  else if (map === "roles") put((i) => (bk.A[i] > 0 ? [bk.WB[i] * 255, bk.WT[i] * 255, bk.WA[i] * 255 + bk.WF[i] * 128] : null));
  else if (map === "detail") put((i) => (bk.A[i] > 0 ? bk.debug.detail[i] : null));
  else if (map === "print") put((i) => (bk.A[i] > 0 ? [bk.PR[i] * 255, bk.PG[i] * 255, 128 + bk.DX[i] * 20] : null));
  else if (map === "normals") put((i) => {
    if (!(bk.A[i] > 0)) return null;
    const gx = bk.debug.GX[i], gy = bk.debug.GY[i], il = 1 / Math.hypot(gx, gy, 1);
    return [(-gx * il * 0.5 + 0.5) * 255, (-gy * il * 0.5 + 0.5) * 255, il * 255];
  });
  x.putImageData(img, 0, 0);
  root.appendChild(c);
  return { map };
}

async function perf(gfx) {
  const L = looks(gfx);
  const out = [];
  for (const size of [320, 1200]) {
    for (const view of ["front", "back"]) {
      clearGarmentPhotoCache();
      const tm = {};
      let t = now();
      renderGarmentPhoto(view, { size, colors: L[0].colors, graphics: L[0][view], backdrop: "studio", timings: tm });
      const first = now() - t;
      // warm: recolour (same graphic), new graphic, blank
      const rec = [];
      for (let i = 0; i < 4; i++) {
        t = now();
        renderGarmentPhoto(view, { size, colors: L[i % 2 ? 1 : 2].colors, graphics: [], backdrop: "studio" });
        rec.push(now() - t);
      }
      const gr = [];
      for (let i = 0; i < 4; i++) {
        t = now();
        renderGarmentPhoto(view, { size, colors: L[i % 3].colors, graphics: L[i % 2 ? 0 : 1][view], backdrop: "studio" });
        gr.push(now() - t);
      }
      const med = (a) => [...a].sort((p, q2) => p - q2)[a.length >> 1];
      out.push({
        size, view, firstMs: Math.round(first), recolorMs: +med(rec).toFixed(1), withGraphicMs: +med(gr).toFixed(1),
        phases: Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, Math.round(v)])),
      });
    }
  }
  const tbl = document.createElement("table");
  tbl.innerHTML = "<tr><th>size</th><th>view</th><th>first render</th><th>recolour</th><th>recolour + graphic</th><th>phases</th></tr>" +
    out.map((r) => `<tr><td>${r.size}</td><td>${r.view}</td><td>${r.firstMs} ms</td><td>${r.recolorMs} ms</td><td>${r.withGraphicMs} ms</td><td>${JSON.stringify(r.phases)}</td></tr>`).join("");
  root.appendChild(tbl);
  return out;
}

(async () => {
  try {
    let res;
    if (MODE === "debug") res = debug();
    else {
      const gfx = await loadGraphics();
      if (MODE === "thumbs") { document.body.classList.add("bare"); res = await thumbs(gfx); }
      else if (MODE === "single") res = await single(gfx);
      else if (MODE === "perf") res = await perf(gfx);
      else { document.body.classList.add("bare"); res = await showcase(gfx, +q.get("size") || 1100); }
    }
    if (MODE !== "showcase" && MODE !== "thumbs") meta.textContent = JSON.stringify(res, null, 1);
    window.__RESULTS = res;
  } catch (e) {
    console.error(e);
    meta.textContent = String(e?.stack || e);
    window.__RESULTS = { error: String(e?.message || e) };
  }
  window.__READY = true;
})();
