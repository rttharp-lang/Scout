// Landing page render plumbing: ONE render queue for every effect render and garment
// mockup on the page, a small result cache shared by all landing components, and
// ref-counted requests so a tile that scrolls away (or unmounts) cancels its pending
// job without cancelling a twin that still wants the same render.
//
//   request(key, job, priority) → { promise, release() }
//   peek(key)                    → canvas | Error | undefined (sync, from the cache)
//   artKey / artJob              → effect render at ART_SIZE, quality "preview"
//   mockKey / mockJob            → renderMockup at MOCK_SIZE with art + clean logo
import { createRenderQueue, renderEffect } from "../../engine/render.js";
import { fontsReady, renderMockup } from "../../apparel/renderMockup.js";
import { resolveColors } from "../../apparel/collection.js";

export const ART_SIZE = 384;   // gallery-size effect renders (contract: 384, "preview")
export const MOCK_SIZE = 560;  // one mockup size for the whole page → shading layers are shared

/** Priorities: higher runs first. Hero first frame → hero garment → rest of the page. */
export const PRIORITY = {
  clean: 42,      // ~1 ms: the logo in its SAFE box
  cleanMock: 41,  // the hero garment wearing the clean logo (pays the garment's first-render cost)
  heroArt: 40,
  heroMock: 36,
  heroRest: 30,
  visible: 20,
  lookbook: 16,
  steps: 12,
  cta: 8,
};

const queue = createRenderQueue();

class LRU {
  constructor(max) { this.max = max; this.map = new Map(); }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k); this.map.set(k, v);
    return v;
  }
  has(k) { return this.map.has(k); }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

const done = new LRU(72);    // key → canvas
const failed = new LRU(48);  // key → Error
const refs = new Map();      // key → number of live requests

// dev-only timing log for the landing QA scripts: window.__lpRenders = [{ key, ms, at }]
function devLog(key, t0) {
  if (typeof window === "undefined") return;
  const log = (window.__lpRenders ||= []);
  log.push({ key: key.split("|").slice(0, 3).join("|"), ms: Math.round(performance.now() - t0), at: Math.round(performance.now()) });
  if (log.length > 200) log.shift();
}

export const isCanvas = (c) => !!c && typeof c.getContext === "function" && c.width > 0;

/** peek(key) → finished canvas, the Error it failed with, or undefined. */
export function peek(key) {
  return done.get(key) ?? failed.get(key);
}

/**
 * request(key, job, priority) — enqueue a render (deduped by key). release() drops this
 * caller's interest; when nobody wants a pending job any more it is cancelled.
 */
export function request(key, job, priority = 0) {
  refs.set(key, (refs.get(key) || 0) + 1);
  const promise = queue.enqueue(key, async () => {
    const t0 = performance.now();
    try {
      const out = await job();
      done.set(key, out);
      if (import.meta.env?.DEV) devLog(key, t0);
      return out;
    } catch (err) {
      if (err?.name !== "AbortError") {
        failed.set(key, err instanceof Error ? err : new Error(String(err)));
        console.warn("[landing] render failed:", err?.message || err);
      }
      throw err;
    }
  }, priority);
  let released = false;
  return {
    promise,
    release() {
      if (released) return;
      released = true;
      const n = (refs.get(key) || 1) - 1;
      if (n > 0) { refs.set(key, n); return; }
      refs.delete(key);
      if (!done.has(key)) queue.cancel((k) => k === key);
    },
  };
}

/* ───────────────────────────── keys + jobs ───────────────────────────── */

const ROLES = ["primary", "secondary", "accent", "dark", "light"];
export const paletteSig = (p) => ROLES.map((r) => p?.[r] || "").join(",");
const stable = (o) => JSON.stringify(Object.keys(o || {}).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));

/**
 * artKey(effectId, logo, palette, { params, seed, size }) — logo is useLogoCanvas()'s
 * result: its own `key` (never state.logo.key) names the pixels.
 */
export function artKey(effectId, logo, palette, { params = {}, seed = 7, size = ART_SIZE } = {}) {
  return `art|${logo.key}|${effectId}|${size}|${seed}|${paletteSig(palette)}|${stable(params)}`;
}

export function artJob(effect, logo, palette, { params = {}, seed = 7, size = ART_SIZE } = {}) {
  const canvas = logo.canvas;
  const logoKey = logo.key;
  return () => renderEffect(effect, canvas, params, palette, { size, seed, quality: "preview", logoKey });
}

/** Lettering for jersey / shooting-shirt mockups: the first roster player, else CARTER 23. */
export function letteringFor(roster) {
  const row = Array.isArray(roster) ? roster.find((r) => r && (r.name || r.number)) : null;
  const last = String(row?.name || "").trim().split(/\s+/).pop() || "";
  const name = last.replace(/[^\p{L}'-]/gu, "").toUpperCase().slice(0, 12) || "CARTER";
  const number = String(row?.number ?? "").replace(/\D/g, "").slice(0, 2) || "23";
  return { name, number };
}

export function mockKey(garmentId, view, item, palette, artK, cleanK, lettering) {
  const t = item?.text ? `${item.text.name ? lettering.name : ""}/${item.text.number ? lettering.number : ""}` : "";
  return `mock|${garmentId}|${view}|${MOCK_SIZE}|${paletteSig(palette)}|${artK}|${cleanK}|${t}|${JSON.stringify({ c: item?.colors, p: item?.[view] })}`;
}

export function mockJob(garment, view, item, palette, art, clean, lettering) {
  return async () => {
    await fontsReady();
    const colors = resolveColors(item.colors, palette);
    const graphics = (item[view] || []).map((p) => ({ ...p, canvas: p.source === "logo" ? clean || art : art }));
    const text = item.text && (item.text.name || item.text.number)
      ? { name: item.text.name ? lettering.name : null, number: item.text.number ? lettering.number : null, fill: colors.accent, outline: colors.trim }
      : null;
    return renderMockup(garment, view, { size: MOCK_SIZE, colors, graphics, text, detail: "full" });
  };
}

/** The view that carries the effect graphic (for one-view thumbnails). */
export function effectView(item) {
  if (!item) return "front";
  const has = (v) => (item[v] || []).some((p) => p.source === "effect");
  return has("front") || !has("back") ? "front" : "back";
}
