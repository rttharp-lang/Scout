// Mascot Lab — effect render worker. Runs effect.render() on OffscreenCanvas so the
// gallery fill, slider drafts and big exports never block the page.
//
// Protocol (main → worker, all plain data except the transferred bitmap):
//   { type: "init", fonts: [{ family, weight, url }] }   → { type: "ready", ids, filter, canvas2d }
//   { type: "source", key, bitmap }   cache a source (logoKey|size) as a canvas; bitmap transferred
//   { type: "drop", keys }            forget sources (the main thread owns the eviction policy)
//   { type: "clear" }                 forget every source
//   { type: "render", id, effectId, srcKey, params, palette, seed, quality }
//       → { type: "done", id, bitmap, ms }  (bitmap transferred)
//       → { type: "error", id, code: "effect-error" | "unsupported" | "no-source", message }
//
// Every effect module is imported EAGERLY: the production worker is one IIFE bundle
// (a blob: URL in the single-file Artifact build) and IIFE bundles cannot code-split.
// A module that throws while loading therefore stops this worker from starting — the
// pool sees that as a startup failure and every render falls back to the main thread.
import { createCanvas, ctx2d, supportsCanvasFilter } from "../core.js";

const MODULES = import.meta.glob(["../effects/*.js", "!../effects/index.js"], { eager: true });

/** id → effect, for every module that looks like an effect (index.js validates on the main side). */
const EFFECTS = new Map();
for (const [path, mod] of Object.entries(MODULES)) {
  const id = path.replace(/^.*\//, "").replace(/\.js$/, "");
  const eff = mod?.default;
  if (eff && eff.id === id && typeof eff.render === "function" && !eff.mainThread) EFFECTS.set(id, eff);
}

const sources = new Map(); // logoKey|size → OffscreenCanvas

/* ───────────────────────────── fonts ───────────────────────────── */

// Effects that draw text (`usesFonts: true`, e.g. ascii) need the page's bundled faces
// registered in this worker's own FontFaceSet (self.fonts). The main thread sends the
// font file URLs; data: URLs (the Artifact build) are decoded here — no fetch, so a
// strict connect-src can't block them.
let fontsOk = Promise.resolve(false);

function dataUrlBytes(url) {
  const comma = url.indexOf(",");
  const meta = url.slice(5, comma);
  const body = url.slice(comma + 1);
  if (!/;base64/i.test(meta)) return new TextEncoder().encode(decodeURIComponent(body)).buffer;
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function registerFonts(list) {
  if (!Array.isArray(list) || !list.length || typeof FontFace === "undefined" || !self.fonts?.add) return Promise.resolve(false);
  const load = Promise.all(list.map(async ({ family, weight, url }) => {
    const src = String(url).startsWith("data:") ? dataUrlBytes(url) : `url("${url}")`;
    const face = new FontFace(family, src, { weight: String(weight), style: "normal" });
    self.fonts.add(face);
    await face.load();
  })).then(() => true, (err) => {
    console.warn("[render worker] fonts unavailable:", err?.message || err);
    return false;
  });
  // never let a stuck font load hold renders hostage
  return Promise.race([load, new Promise((r) => setTimeout(() => r(false), 4000))]);
}

/* ───────────────────────────── rendering ───────────────────────────── */

const isCanvas = (c) => c && typeof c.getContext === "function" && c.width > 0 && c.height > 0;

async function render(m) {
  const effect = EFFECTS.get(m.effectId);
  if (!effect) return { code: "unsupported", message: `"${m.effectId}" is not in the worker registry` };
  if (effect.usesFonts && !(await fontsOk)) return { code: "unsupported", message: "fonts unavailable in the worker" };
  const src = sources.get(m.srcKey);
  if (!src) return { code: "no-source", message: `source ${m.srcKey} missing` };
  const S = src.width;
  const ctx = { size: S, scale: S / 1024, palette: m.palette, seed: m.seed, quality: m.quality };
  const t0 = performance.now();
  let out = await effect.render(src, m.params, ctx);
  if (!isCanvas(out)) throw new Error("render() did not return a canvas");
  if (out === src) throw new Error("render() returned the source canvas");
  if (out.width !== S || out.height !== S) { // same fit-to-size fix as the main thread
    const fixed = createCanvas(S, S);
    const k = Math.min(S / out.width, S / out.height);
    ctx2d(fixed).drawImage(out, (S - out.width * k) / 2, (S - out.height * k) / 2, out.width * k, out.height * k);
    out = fixed;
  }
  // effects return a NEW canvas (contract), so handing its pixels over is free
  const bitmap = typeof out.transferToImageBitmap === "function" ? out.transferToImageBitmap() : await createImageBitmap(out);
  return { bitmap, ms: performance.now() - t0 };
}

self.onmessage = async (e) => {
  const m = e.data || {};
  switch (m.type) {
    case "init": {
      let canvas2d = false;
      try { canvas2d = !!ctx2d(createCanvas(2, 2)); } catch { /* no 2D OffscreenCanvas */ }
      fontsOk = registerFonts(m.fonts);
      self.postMessage({ type: "ready", ids: [...EFFECTS.keys()], canvas2d, filter: canvas2d && supportsCanvasFilter() });
      break;
    }
    case "source": {
      const c = createCanvas(m.bitmap.width, m.bitmap.height);
      ctx2d(c).drawImage(m.bitmap, 0, 0);
      m.bitmap.close?.();
      sources.set(m.key, c);
      break;
    }
    case "drop":
      for (const k of m.keys || []) sources.delete(k);
      break;
    case "clear":
      sources.clear();
      break;
    case "render": {
      try {
        const r = await render(m);
        if (r.bitmap) self.postMessage({ type: "done", id: m.id, bitmap: r.bitmap, ms: r.ms }, [r.bitmap]);
        else self.postMessage({ type: "error", id: m.id, code: r.code, message: r.message });
      } catch (err) {
        self.postMessage({ type: "error", id: m.id, code: "effect-error", message: err?.message || String(err) });
      }
      break;
    }
  }
};
