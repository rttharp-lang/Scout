// Mascot Lab — effect rendering: param resolution, source/result caches, off-main-thread
// rendering (a small Web Worker pool, worker/pool.js, with a main-thread fallback) and a
// progressive, cancellable render queue that keeps the UI responsive.
import { SAFE as IMAGE_SAFE, makeSource } from "./image.js";
import { createCanvas, ctx2d, normalizeHex } from "./core.js";
import { loadEffects } from "./effects/index.js";
import { runInWorker, workerCount, clearWorkerSources, setWorkersEnabled, poolInfo, stats } from "./worker/pool.js";

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

/**
 * LRU bounded by total PIXELS (and an entry count): one 2048² result is 4.2 M px
 * (16 MB), a 384² gallery tile 0.15 M px, so a plain count bound is either useless for
 * tiles or ~1 GB for exports. The newest entry always stays, even when over budget.
 */
class PixelLRU {
  constructor(maxPx, maxEntries = Infinity) { this.maxPx = maxPx; this.maxEntries = maxEntries; this.map = new Map(); this.px = 0; }
  get size() { return this.map.size; }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    this.map.delete(k); this.map.set(k, e);
    return e.v;
  }
  set(k, v, px) {
    this.delete(k);
    this.map.set(k, { v, px });
    this.px += px;
    for (const [ok, oe] of this.map) {
      if ((this.px <= this.maxPx && this.map.size <= this.maxEntries) || ok === k) break;
      this.map.delete(ok);
      this.px -= oe.px;
    }
  }
  delete(k) {
    const e = this.map.get(k);
    if (!e) return;
    this.map.delete(k);
    this.px -= e.px;
  }
  clear() { this.map.clear(); this.px = 0; }
}

const RESULT_BUDGET_PX = 40_000_000;  // ≈160 MB: ~9 exports at 2048, ~38 at 1024, the whole gallery at 384
const SOURCE_BUDGET_PX = 12_000_000;  // a logo at every size in use (160…2048 ≈ 5.6 M px), twice over

const sourceCache = new PixelLRU(SOURCE_BUDGET_PX, 32);   // logoKey|size → source canvas
const resultCache = new PixelLRU(RESULT_BUDGET_PX, 400);  // full key → result canvas
const inflight = new Map();       // full key → Flight (one render shared by every caller of that key)
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
  if (!src) { src = makeSource(logoCanvas, size); sourceCache.set(key, src, src.width * src.height); }
  return src;
}

/** clearRenderCaches() — drop cached sources and results (e.g. after a logo edit with the same key). */
export function clearRenderCaches() {
  sourceCache.clear(); resultCache.clear(); inflight.clear();
  clearWorkerSources();
}

const stableJSON = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));
const isCanvas = (c) => c && typeof c.getContext === "function" && c.width > 0 && c.height > 0;
const abortError = () => { const e = new Error("Render cancelled"); e.name = "AbortError"; return e; };
const isAbortError = (e) => e?.name === "AbortError";

/* ───────────────────────────── where renders run ───────────────────────────── */

// Effects run in the worker pool (worker/pool.js) whenever it is usable; the main thread
// renders exactly as before when it isn't, when an effect opts out (`mainThread: true`),
// and as the retry for any job the pool gives back (worker missing/crashed/timed out,
// effect threw in the worker). An effect that throws in a worker but renders fine on the
// main thread is kept on the main thread for the rest of the session.
const mainOnly = new Set();
const canUseWorker = (effect) => workerCount() > 0 && !effect.mainThread && !mainOnly.has(effect.id);
// A worker runs ITS copy of the module with the effect's id, so only the registry's own
// effect objects go there; an ad-hoc effect (tests, wrappers) renders where it was made.
const isRegistryEffect = (effect) => loadEffects().then((list) => list.includes(effect), () => false);

/** The ImageBitmap a worker transferred, as an ordinary (CPU-backed) canvas. */
function canvasFromBitmap(bitmap, S) {
  const c = createCanvas(S, S);
  ctx2d(c).drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return c;
}

async function renderOnMain({ effect, logoCanvas, lk, S, p, pal, seed, quality }) {
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
  return out;
}

/** One render, worker first, main thread as the fallback; the result lands in the cache. */
async function produce(flight, a) {
  const { effect, S, key } = a;
  let out = null;
  let why = null;
  if (canUseWorker(effect) && await isRegistryEffect(effect)) {
    if (flight.cancelled) throw abortError();
    flight.job = {
      effectId: effect.id, srcKey: `${a.lk}|${S}`, size: S,
      getSource: () => getSource(a.logoCanvas, S, a.lk),
      params: a.p, palette: a.pal, seed: a.seed, quality: a.quality,
    };
    try {
      out = canvasFromBitmap((await runInWorker(flight.job, flight.ctl?.signal)).bitmap, S);
    } catch (err) {
      if (isAbortError(err)) throw err;
      why = err; // the main thread takes over below
    }
  }
  if (!out) {
    if (flight.cancelled) throw abortError(); // everyone who wanted it has gone
    flight.started = true;
    out = await renderOnMain(a);
    stats.main++;
    if (why) {
      stats.fallback++;
      if (why.code === "effect-error" && !mainOnly.has(effect.id)) {
        mainOnly.add(effect.id);
        console.warn(`[render] ${effect.id} failed in the worker (${why.message}); rendering it on the main thread from now on`);
      }
    }
  }
  resultCache.set(key, out, S * S);
  return out;
}

/**
 * Attach a caller to a shared render. Callers that run inside a render-queue job carry
 * that job's AbortSignal; when every such caller has been cancelled (and no plain caller
 * is waiting), the render is dropped if it hasn't reached a worker yet.
 */
function join(flight, key, signal) {
  flight.cancelled = false;
  if (!signal) { flight.pinned = true; return flight.promise; }
  flight.interest++;
  const onAbort = () => {
    if (--flight.interest > 0 || flight.pinned) return;
    flight.cancelled = true;
    flight.ctl?.abort();
    // unless it is already rendering (in a worker, or here), it will end in an AbortError:
    // forget it now, so a new request for this key starts afresh instead of joining it
    const doomed = flight.job ? flight.job.dropped : !flight.started;
    if (doomed && inflight.get(key) === flight) inflight.delete(key);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  const off = () => signal.removeEventListener("abort", onAbort);
  flight.promise.then(off, off);
  return flight.promise;
}

/**
 * renderEffect(effect, logoCanvas, params, palette, { size, seed, quality, logoKey }) →
 * Promise<HTMLCanvasElement> (S×S, transparent bg). Rendered in a worker when possible
 * (see above), cached in a pixel-budgeted LRU; shared result canvases must be treated as
 * read-only. Never throws synchronously; rejects with "<Effect name>: …" (or an
 * AbortError when the render-queue job that asked for it was cancelled first).
 */
export async function renderEffect(effect, logoCanvas, params, palette,
  { size = 1024, seed = 7, quality = "final", logoKey } = {}) {
  const signal = activeJobSignal; // the queue job calling us, if any — read before any await
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
    let flight = inflight.get(key);
    if (!flight) {
      flight = {
        ctl: typeof AbortController === "function" ? new AbortController() : null,
        interest: 0,      // queue-job callers still waiting
        pinned: false,    // a caller outside any queue job is waiting: never drop it
        cancelled: false, // every queue-job caller has been cancelled
        job: null,        // the pool job, once handed over (job.dropped = never reached a worker)
        started: false,   // rendering on this thread
      };
      flight.promise = produce(flight, { effect, logoCanvas, lk, S, p, pal, seed, quality, key });
      flight.promise.catch(() => {}); // a cancelled render nobody awaits isn't "unhandled"
      inflight.set(key, flight);
      const settle = () => { if (inflight.get(key) === flight) inflight.delete(key); };
      flight.promise.then(settle, settle);
    }
    return await join(flight, key, signal);
  } catch (err) {
    if (isAbortError(err)) throw err;
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

// The AbortSignal of the queue job whose job() is being called right now. renderEffect
// reads it synchronously, which ties a render to the job that asked for it.
let activeJobSignal = null;

/**
 * createRenderQueue({ concurrency }?) → { enqueue(key, job, priority = 0), cancel(predicate?), size }.
 * Runs up to `concurrency` jobs at once (default: one per effect worker, 1 when effects
 * render on the main thread), highest priority first (FIFO within a priority), yielding
 * to the event loop before each job starts. Duplicate keys share one promise (and adopt
 * the higher priority). cancel(pred) rejects matching pending jobs with an AbortError
 * and aborts matching running ones: a renderEffect() still waiting for a free worker is
 * dropped (its job rejects with an AbortError), one already in a worker finishes.
 */
export function createRenderQueue({ concurrency } = {}) {
  const pending = [];          // { key, job, priority, seq, resolve, reject, promise }
  const running = new Set();   // started entries (+ ctl: AbortController)
  const byKey = new Map();     // key → entry (pending or running)
  let seq = 0;
  let pumping = false;
  const limit = () => Math.max(1, typeof concurrency === "function" ? concurrency() : concurrency || workerCount() || 1);

  const pickNext = () => {
    let bi = -1;
    for (let i = 0; i < pending.length; i++) {
      const e = pending[i];
      if (bi < 0 || e.priority > pending[bi].priority || (e.priority === pending[bi].priority && e.seq < pending[bi].seq)) bi = i;
    }
    return bi < 0 ? null : pending.splice(bi, 1)[0];
  };

  const start = (e) => {
    running.add(e);
    e.ctl = typeof AbortController === "function" ? new AbortController() : null;
    const outer = activeJobSignal;
    activeJobSignal = e.ctl?.signal || null;
    let p;
    try {
      p = Promise.resolve(e.job());
    } catch (err) {
      p = Promise.reject(err);
    } finally {
      activeJobSignal = outer;
    }
    p.then(e.resolve, e.reject).finally(() => {
      running.delete(e);
      if (byKey.get(e.key) === e) byKey.delete(e.key);
      pump();
    });
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (pending.length && running.size < limit()) {
        await yieldToEventLoop();
        if (running.size >= limit()) break; // a finishing job pumps again
        const e = pickNext();
        if (!e) break;
        start(e);
      }
    } finally {
      pumping = false;
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
          e.reject(abortError());
        }
      }
      // running jobs: abort (drops renders not yet in a worker) and detach the key, so a
      // fresh enqueue of it starts a new entry instead of inheriting this one's AbortError
      for (const e of running) {
        if (predicate && !predicate(e.key)) continue;
        if (byKey.get(e.key) === e) byKey.delete(e.key);
        e.ctl?.abort();
      }
    },
    get size() { return pending.length; },
  };
}

/* ───────────────────────────── debug handle ───────────────────────────── */

// window.__mascotRender — where renders ran (stats.worker vs stats.main), pool state,
// cache occupancy; useWorkers(false) switches the pool off at runtime (or load with ?workers=0).
if (typeof window !== "undefined") {
  window.__mascotRender = {
    stats,
    get pool() { return poolInfo(); },
    get mainThreadEffects() { return [...mainOnly]; },
    get cache() {
      return { results: resultCache.size, resultPx: resultCache.px, sources: sourceCache.size, sourcePx: sourceCache.px, inflight: inflight.size };
    },
    useWorkers: setWorkersEnabled,
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
