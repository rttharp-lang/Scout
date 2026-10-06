// Mascot Lab — effect rendering: param resolution, source/result caches and a
// progressive, cancellable render queue that keeps the UI responsive.
import { SAFE as IMAGE_SAFE, makeSource } from "./image.js";
import { createCanvas, ctx2d, normalizeHex } from "./core.js";

/** SAFE — logo fits the central 72% of every effect source. */
export const SAFE = IMAGE_SAFE;

const ROLES = ["primary", "secondary", "accent", "dark", "light"];
const FALLBACK_PALETTE = { primary: "#13294B", secondary: "#F2A900", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" };

/** defaultParams(effect) → { key: default } for every ParamSpec (colors stay as roles). */
export function defaultParams(effect) {
  const out = {};
  for (const p of effect?.params || []) out[p.key] = p.default;
  return out;
}

/** resolveColor(value, palette) → "#RRGGBB" for a role or hex, or null if neither. */
export function resolveColor(value, palette) {
  if (typeof value !== "string") return null;
  if (ROLES.includes(value)) return normalizeHex(palette?.[value]) || FALLBACK_PALETTE[value];
  return normalizeHex(value);
}

/**
 * resolveParams(effect, params, palette) → every key present: colors as "#RRGGBB",
 * ranges clamped (non-numbers → default), selects validated, toggles boolean.
 */
export function resolveParams(effect, params = {}, palette = FALLBACK_PALETTE) {
  const out = {};
  params = params || {};
  for (const spec of effect?.params || []) {
    const v = params[spec.key];
    switch (spec.type) {
      case "range": {
        let n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
        if (!Number.isFinite(n)) n = Number(spec.default);
        if (!Number.isFinite(n)) n = spec.min;
        out[spec.key] = Math.min(spec.max, Math.max(spec.min, n));
        break;
      }
      case "color":
        out[spec.key] = resolveColor(v, palette) || resolveColor(spec.default, palette) || "#000000";
        break;
      case "select": {
        const ok = (x) => (spec.options || []).some((o) => o.value === x);
        out[spec.key] = ok(v) ? v : ok(spec.default) ? spec.default : spec.options?.[0]?.value;
        break;
      }
      case "toggle":
        out[spec.key] = v === undefined || v === null ? !!spec.default : v === true || v === "true" || v === 1 || v === "1";
        break;
      default:
        out[spec.key] = v === undefined ? spec.default : v;
    }
  }
  return out;
}

/* ─────────────────────────────── caches ─────────────────────────────── */

class LRU {
  constructor(max) { this.max = max; this.map = new Map(); }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k); this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  clear() { this.map.clear(); }
}

const sourceCache = new LRU(16);  // logoKey|size → source canvas
const resultCache = new LRU(60);  // full key → result canvas
const inflight = new Map();       // full key → Promise
const autoKeys = new WeakMap();
let autoKeySeq = 0;
const keyFor = (canvas) => {
  let k = autoKeys.get(canvas);
  if (!k) { k = `canvas#${++autoKeySeq}`; autoKeys.set(canvas, k); }
  return k;
};

/** getSource(logoCanvas, size, logoKey?) — cached makeSource(). */
export function getSource(logoCanvas, size, logoKey) {
  const key = `${logoKey || keyFor(logoCanvas)}|${size}`;
  let src = sourceCache.get(key);
  if (!src) { src = makeSource(logoCanvas, size); sourceCache.set(key, src); }
  return src;
}

/** clearRenderCaches() — drop cached sources and results (e.g. after a logo edit with the same key). */
export function clearRenderCaches() {
  sourceCache.clear(); resultCache.clear(); inflight.clear();
}

const stableJSON = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));
const isCanvas = (c) => c && typeof c.getContext === "function" && c.width > 0 && c.height > 0;

/**
 * renderEffect(effect, logoCanvas, params, palette, { size, seed, quality, logoKey }) →
 * Promise<canvas> (S×S, transparent bg). Cached (LRU 60); shared result canvases must be
 * treated as read-only. Never throws synchronously; rejects with "<Effect name>: …".
 */
export async function renderEffect(effect, logoCanvas, params, palette,
  { size = 1024, seed = 7, quality = "final", logoKey } = {}) {
  const name = effect?.name || effect?.id || "Effect";
  try {
    if (!effect || typeof effect.render !== "function") throw new Error("not a valid effect");
    if (!isCanvas(logoCanvas)) throw new Error("no logo to render");
    const S = Math.max(16, Math.round(size));
    const pal = { ...FALLBACK_PALETTE, ...(palette || {}) };
    const p = resolveParams(effect, params, pal);
    const lk = logoKey || keyFor(logoCanvas);
    const key = [lk, effect.id, stableJSON(p), ROLES.map((r) => pal[r]).join(","), S, seed, quality].join("|");
    const hit = resultCache.get(key);
    if (hit) return hit;
    if (inflight.has(key)) return await inflight.get(key);
    const job = (async () => {
      const src = getSource(logoCanvas, S, lk);
      const ctx = { size: S, scale: S / 1024, palette: pal, seed, quality };
      let out = await effect.render(src, p, ctx);
      if (!isCanvas(out)) throw new Error("render() did not return a canvas");
      if (out === src) throw new Error("render() returned the source canvas");
      if (out.width !== S || out.height !== S) {
        const fixed = createCanvas(S, S);
        const k = Math.min(S / out.width, S / out.height);
        ctx2d(fixed).drawImage(out, (S - out.width * k) / 2, (S - out.height * k) / 2, out.width * k, out.height * k);
        out = fixed;
      }
      resultCache.set(key, out);
      return out;
    })();
    inflight.set(key, job);
    try { return await job; } finally { inflight.delete(key); }
  } catch (err) {
    const e = new Error(`${name}: ${err?.message || err}`);
    e.cause = err;
    e.effect = effect?.id;
    throw e;
  }
}

/* ──────────────────────────── render queue ──────────────────────────── */

// yield a macrotask (MessageChannel beats setTimeout's 4 ms clamp) so input & paint can run
const yieldToEventLoop = (() => {
  if (typeof MessageChannel !== "undefined") {
    const ch = new MessageChannel();
    const waiting = [];
    ch.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
    return () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
  }
  return () => new Promise((r) => setTimeout(r, 0));
})();

/**
 * createRenderQueue() → { enqueue(key, job, priority = 0), cancel(predicate?), size }.
 * Runs one job at a time, highest priority first (FIFO within a priority), yielding to the
 * event loop between jobs. Duplicate keys share one promise (and adopt the higher priority).
 * cancel(pred) rejects pending (not running) jobs whose key matches with an AbortError.
 */
export function createRenderQueue() {
  const pending = [];          // { key, job, priority, seq, resolve, reject, promise }
  const byKey = new Map();     // key → entry (pending or running)
  let seq = 0;
  let running = false;

  const pickNext = () => {
    let bi = -1;
    for (let i = 0; i < pending.length; i++) {
      const e = pending[i];
      if (bi < 0 || e.priority > pending[bi].priority || (e.priority === pending[bi].priority && e.seq < pending[bi].seq)) bi = i;
    }
    return bi < 0 ? null : pending.splice(bi, 1)[0];
  };

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      for (;;) {
        await yieldToEventLoop();
        const e = pickNext();
        if (!e) break;
        try {
          e.resolve(await e.job());
        } catch (err) {
          e.reject(err);
        } finally {
          if (byKey.get(e.key) === e) byKey.delete(e.key);
        }
      }
    } finally {
      running = false;
      if (pending.length) pump();
    }
  };

  return {
    enqueue(key, job, priority = 0) {
      const existing = byKey.get(key);
      if (existing) {
        if (priority > existing.priority) existing.priority = priority;
        return existing.promise;
      }
      const e = { key, job, priority, seq: seq++ };
      e.promise = new Promise((resolve, reject) => { e.resolve = resolve; e.reject = reject; });
      e.promise.catch(() => {}); // cancellations shouldn't surface as unhandled rejections
      pending.push(e);
      byKey.set(key, e);
      pump();
      return e.promise;
    },
    cancel(predicate) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const e = pending[i];
        if (!predicate || predicate(e.key)) {
          pending.splice(i, 1);
          if (byKey.get(e.key) === e) byKey.delete(e.key);
          const err = new Error("Render cancelled");
          err.name = "AbortError";
          e.reject(err);
        }
      }
    },
    get size() { return pending.length; },
  };
}

/** canvasToBlob(canvas, type = "image/png", quality?) → Promise<Blob>. */
export function canvasToBlob(canvas, type = "image/png", quality) {
  if (typeof canvas.convertToBlob === "function" && typeof canvas.toBlob !== "function") {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) return resolve(blob);
        try { // some sandboxes return null — fall back through a data URL
          const url = canvas.toDataURL(type, quality);
          const bin = atob(url.split(",")[1]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type }));
        } catch (e) { reject(e); }
      }, type, quality);
    } catch (e) { reject(e); }
  });
}
