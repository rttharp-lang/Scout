// Mascot Lab — the effect worker pool (main-thread side). render.js hands it one job
// per effect render; it keeps a few Web Workers (effectWorker.js) busy, ships each
// worker the square source of a logo ONCE per (logoKey, size) as an ImageBitmap, and
// gets the result back as a transferred ImageBitmap.
//
// It never decides anything about pixels and never hangs a caller: every way a job
// can fail here (no worker support, a worker that won't start or crashes, an effect
// that throws in the worker, a job that outlives its timeout) rejects with an Error
// carrying a `code`, and render.js re-runs the job on the main thread.
//   code: "unavailable"  pool disabled / not supported / every worker failed to start
//         "unsupported"  this effect can't run in the worker (not in its registry, no fonts…)
//         "effect-error" the effect threw inside the worker
//         "crash" | "timeout"  the worker died or went silent (it is replaced)
// A job still waiting for a free worker is dropped when its AbortSignal fires.
import { disableCanvasFilter, supportsCanvasFilter } from "../core.js";
import plexMono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url";
import plexMono600 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url";

/** Faces effects with `usesFonts: true` draw with (ascii.js) — registered inside each worker. */
const WORKER_FONTS = [
  { family: "IBM Plex Mono", weight: 500, url: plexMono500 },
  { family: "IBM Plex Mono", weight: 600, url: plexMono600 },
];

const START_TIMEOUT_MS = import.meta.env.DEV ? 10_000 : 6_000; // init → "ready" (dev serves ~30 unbundled modules; a build is one file)
const MAX_RESPAWNS = 2;                 // crashed/timed-out workers replaced, per page load
const SOURCE_BUDGET_PX = 12_000_000;    // per worker: cached sources (2048² ≈ 4.2 M px)
/** Per-job timeout once a worker has it: generous (CPU is shared), it only catches hangs. */
const timeoutFor = (size) => Math.round(3000 + 9000 * (size / 1024) ** 2); // 384 ≈ 4 s, 1024 12 s, 2048 39 s

/** workersSupported() — Worker + OffscreenCanvas + transferToImageBitmap + createImageBitmap. */
export function workersSupported() {
  try {
    return typeof window !== "undefined" && typeof Worker === "function"
      && typeof OffscreenCanvas === "function" && typeof OffscreenCanvas.prototype.transferToImageBitmap === "function"
      && typeof createImageBitmap === "function";
  } catch {
    return false;
  }
}

// `?workers=0` turns the pool off (debugging, before/after comparisons);
// `?canvasFilter=0` pins every blur to the box-blur fallback (parity testing)
const optedOut = (() => {
  try { return /[?&]workers=(0|off|false)\b/.test(window.location.search); } catch { return false; }
})();
try { if (/[?&]canvasFilter=(0|off|false)\b/.test(window.location.search)) disableCanvasFilter(true); } catch { /* no window */ }

/** POOL_SIZE — min(2, cores − 1), at least 1; 0 when workers can't be used at all. */
export const POOL_SIZE = workersSupported() && !optedOut
  ? Math.max(1, Math.min(2, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2) - 1))
  : 0;

/** Counters for window.__mascotRender (render.js adds main / fallback). */
export const stats = { worker: 0, workerMs: 0, main: 0, fallback: 0, timeouts: 0, crashes: 0, effectErrors: 0 };

const pool = {
  state: POOL_SIZE ? "idle" : "dead",  // idle → starting → ready, or dead (everything on main)
  enabled: true,                      // runtime switch (window.__mascotRender.useWorkers)
  slots: [],                          // { w, ready, task, sources: Map(key → px), px, dead, timer }
  waiting: [],                        // jobs not yet sent to a worker, FIFO
  ids: null,                          // effect ids the worker registry has (from "ready")
  respawns: 0,
  Ctor: null,                         // the Worker constructor, once its module loaded
  seq: 0,
  announced: false,
};

/** workerCount() — workers jobs can be spread over right now (0 = main thread only). */
export function workerCount() {
  return pool.enabled && pool.state !== "dead" ? POOL_SIZE : 0;
}

/** poolInfo() — debug snapshot. */
export function poolInfo() {
  return {
    state: pool.enabled ? pool.state : "disabled",
    size: POOL_SIZE,
    live: pool.slots.filter((s) => !s.dead).length,
    ready: pool.slots.filter((s) => s.ready && !s.dead).length,
    busy: pool.slots.filter((s) => s.task).length,
    waiting: pool.waiting.length,
  };
}

/** setWorkersEnabled(bool) — runtime switch; disabled → every job reports "unavailable". */
export function setWorkersEnabled(on) {
  pool.enabled = !!on;
  if (!pool.enabled) failWaiting("unavailable", "workers disabled");
}

/** clearWorkerSources() — workers forget every cached source (render.js clearRenderCaches). */
export function clearWorkerSources() {
  for (const s of pool.slots) {
    if (s.dead) continue;
    s.sources.clear();
    s.px = 0;
    try { s.w.postMessage({ type: "clear" }); } catch { /* replaced on its next job */ }
  }
}

/**
 * runInWorker(job, signal?) → Promise<{ bitmap: ImageBitmap, ms }>.
 *   job = { effectId, srcKey, size, getSource: () => canvas, params, palette, seed, quality }
 * `getSource` is only called when the chosen worker doesn't hold `srcKey` yet. When
 * `signal` aborts before a worker took the job, it is dropped (job.dropped = true) and
 * the promise rejects with an AbortError.
 */
export function runInWorker(job, signal) {
  return new Promise((resolve, reject) => {
    if (!pool.enabled || pool.state === "dead") return reject(failure("unavailable", "effect workers unavailable"));
    if (pool.ids && !pool.ids.has(job.effectId)) return reject(failure("unsupported", `"${job.effectId}" is not in the worker registry`));
    if (signal?.aborted) return reject(abortError());
    const t = { ...job, id: ++pool.seq, job, resolve, reject, signal, dispatched: false, timer: 0 };
    if (signal) {
      t.onAbort = () => {
        if (t.dispatched) return;
        const i = pool.waiting.indexOf(t);
        if (i >= 0) pool.waiting.splice(i, 1);
        job.dropped = true;
        reject(abortError());
      };
      signal.addEventListener("abort", t.onAbort, { once: true });
    }
    pool.waiting.push(t);
    start();
    pump();
  });
}

// dev only: a hot-swapped module (an effect being tuned, core.js…) updates the page but
// not the workers, which would keep rendering the old code — restart them instead; they
// import the fresh files when they start. A hot-swapped pool.js retires its own workers.
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", (p) => {
    if (pool.state === "ready" && p?.updates?.some((u) => u.type === "js-update")) restartWorkers("code update");
  });
  import.meta.hot.dispose(() => restartWorkers("pool module replaced", true));
}

/* ───────────────────────────── internals ───────────────────────────── */

function restartWorkers(reason, retire = false) {
  for (const s of pool.slots) {
    s.dead = true;
    clearTimeout(s.timer);
    try { s.w?.terminate(); } catch { /* gone */ }
    if (s.task) { clearTimeout(s.task.timer); s.task.reject(failure("crash", `workers restarted (${reason})`)); }
  }
  pool.slots = [];
  pool.ids = null;
  if (retire) { pool.state = "dead"; failWaiting("unavailable", reason); return; }
  pool.state = "idle";
  if (pool.waiting.length) start();
}

function failure(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
function abortError() {
  const e = new Error("Render cancelled");
  e.name = "AbortError";
  return e;
}

let ctorPromise = null;
/** The Worker constructor. The single-file Artifact build can only start workers from a
 *  blob: URL, so there the worker is inlined; other builds load it as its own file. */
function workerCtor() {
  ctorPromise ||= (import.meta.env.MODE === "artifact"
    ? import("./effectWorker.js?worker&inline")
    : import("./effectWorker.js?worker")
  ).then((m) => (pool.Ctor = m.default));
  return ctorPromise;
}

function fontList() {
  return WORKER_FONTS.map((f) => {
    let url = f.url;
    try { if (!/^data:/i.test(url)) url = new URL(url, document.baseURI).href; } catch { /* keep as is */ }
    return { ...f, url };
  });
}

function start() {
  if (pool.state !== "idle") return;
  pool.state = "starting";
  // the worker module itself might never arrive (a stalled dev request): jobs must not wait forever
  const guard = setTimeout(() => { if (pool.state === "starting" && !pool.Ctor) die("the worker module did not load in time"); }, START_TIMEOUT_MS);
  workerCtor().then(
    (Ctor) => { clearTimeout(guard); if (pool.state === "starting") for (let i = 0; i < POOL_SIZE; i++) spawn(Ctor); },
    (err) => { clearTimeout(guard); die(`worker module failed to load (${err?.message || err})`); },
  );
}

function spawn(Ctor) {
  const slot = { w: null, ready: false, task: null, sources: new Map(), px: 0, dead: false, timer: 0 };
  pool.slots.push(slot);
  try {
    slot.w = new Ctor({ name: "mascot-lab-effects" });
  } catch (err) {
    // after the caller's loop, so a pool isn't declared dead before its siblings tried
    queueMicrotask(() => lose(slot, "start", `worker blocked (${err?.message || err})`));
    return;
  }
  slot.w.onmessage = (e) => onMessage(slot, e.data || {});
  slot.w.onerror = (e) => {
    e?.preventDefault?.();
    lose(slot, slot.ready ? "crash" : "start", e?.message || "worker error");
  };
  slot.w.onmessageerror = () => lose(slot, "crash", "a worker message could not be decoded");
  slot.timer = setTimeout(() => { if (!slot.ready) lose(slot, "start", "worker did not start in time"); }, START_TIMEOUT_MS);
  slot.w.postMessage({ type: "init", fonts: fontList(), filter: supportsCanvasFilter() });
}

function onMessage(slot, m) {
  if (slot.dead) { m.bitmap?.close?.(); return; }
  if (m.type === "ready") {
    clearTimeout(slot.timer);
    if (!m.canvas2d) { lose(slot, "start", "no 2D OffscreenCanvas in workers"); return; }
    slot.ready = true;
    pool.ids = new Set(m.ids || []);
    // blur parity: ctx.filter on one side only would make worker and main-thread renders
    // of the same effect differ, so both use the fallback then (the worker already does)
    if (!m.filter && supportsCanvasFilter()) {
      disableCanvasFilter(true);
      console.info("[render] workers can't use ctx.filter: blurs use the box-blur fallback on the page too");
    }
    if (pool.state === "starting") pool.state = "ready";
    if (!pool.announced) {
      pool.announced = true;
      console.info(`[render] effects render off the main thread: ${POOL_SIZE} worker(s), ${pool.ids.size} effects, canvas filter ${m.filter ? "on" : "fallback"}`);
    }
    pump();
    return;
  }
  const t = slot.task;
  if (!t || t.id !== m.id) { m.bitmap?.close?.(); return; } // a job we already gave up on
  clearTimeout(t.timer);
  slot.task = null;
  if (m.type === "done") {
    stats.worker++;
    stats.workerMs += m.ms || 0;
    t.resolve({ bitmap: m.bitmap, ms: m.ms });
  } else {
    if (m.code === "no-source") forget(slot, t.srcKey);
    if (m.code === "effect-error") stats.effectErrors++;
    t.reject(failure(m.code || "effect-error", m.message || "worker render failed"));
  }
  pump();
}

/** A worker failed to start, crashed or timed out: fail its job, replace it (bounded). */
function lose(slot, why, message) {
  if (slot.dead) return;
  slot.dead = true;
  clearTimeout(slot.timer);
  try { slot.w?.terminate(); } catch { /* already gone */ }
  pool.slots = pool.slots.filter((s) => s !== slot);
  const t = slot.task;
  slot.task = null;
  if (t) {
    clearTimeout(t.timer);
    t.reject(failure(why === "timeout" ? "timeout" : "crash", message));
  }
  if (why === "timeout") stats.timeouts++;
  else if (why === "crash") stats.crashes++;
  console.warn(`[render] effect worker ${why === "start" ? "failed to start" : why === "timeout" ? "timed out" : "crashed"}: ${message}`);
  if (why !== "start" && pool.respawns < MAX_RESPAWNS && pool.state !== "dead" && pool.Ctor) {
    pool.respawns++;
    spawn(pool.Ctor); // its jobs wait in `waiting` until it says "ready"
  }
  if (!pool.slots.length) die(why === "start" ? "no worker could start" : "workers keep failing");
  else pump();
}

function die(reason) {
  if (pool.state === "dead") return;
  pool.state = "dead";
  console.warn(`[render] effects render on the main thread: ${reason}`);
  failWaiting("unavailable", reason);
}

function failWaiting(code, message) {
  const list = pool.waiting.splice(0);
  for (const t of list) {
    t.signal?.removeEventListener("abort", t.onAbort);
    t.reject(failure(code, message));
  }
}

function pump() {
  while (pool.waiting.length) {
    const t = pool.waiting[0];
    if (pool.ids && !pool.ids.has(t.effectId)) {
      pool.waiting.shift();
      t.signal?.removeEventListener("abort", t.onAbort);
      t.reject(failure("unsupported", `"${t.effectId}" is not in the worker registry`));
      continue;
    }
    const idle = pool.slots.filter((s) => s.ready && !s.dead && !s.task);
    if (!idle.length) return;
    pool.waiting.shift();
    // prefer a worker that already holds this source (no bitmap to ship)
    dispatch(idle.find((s) => s.sources.has(t.srcKey)) || idle[0], t);
  }
}

async function dispatch(slot, t) {
  slot.task = t;
  t.dispatched = true;
  t.signal?.removeEventListener("abort", t.onAbort);
  try {
    if (!slot.sources.has(t.srcKey)) {
      const src = t.getSource();
      const bitmap = await createImageBitmap(src);
      if (slot.dead || slot.task !== t) { bitmap.close?.(); return; } // lost meanwhile (job already failed)
      const drop = makeRoom(slot, t.srcKey, src.width * src.height);
      if (drop.length) slot.w.postMessage({ type: "drop", keys: drop });
      slot.w.postMessage({ type: "source", key: t.srcKey, bitmap }, [bitmap]);
    } else {
      touch(slot, t.srcKey);
    }
    const { effectId, srcKey, params, palette, seed, quality } = t;
    slot.w.postMessage({ type: "render", id: t.id, effectId, srcKey, params, palette, seed, quality });
    t.timer = setTimeout(() => { if (slot.task === t) lose(slot, "timeout", `${effectId} @${t.size}px took over ${Math.round(timeoutFor(t.size) / 1000)} s`); }, timeoutFor(t.size));
  } catch (err) {
    // couldn't hand the job over (createImageBitmap / postMessage failed) → main thread
    if (slot.task === t) slot.task = null;
    forget(slot, t.srcKey);
    t.reject(failure("unsupported", `couldn't send the job to a worker (${err?.message || err})`));
    pump();
  }
}

/* worker-side source cache, mirrored here: the main thread decides what each worker drops */
function touch(slot, key) {
  const px = slot.sources.get(key);
  slot.sources.delete(key);
  slot.sources.set(key, px);
}
function forget(slot, key) {
  if (!slot.sources.has(key)) return;
  slot.px -= slot.sources.get(key);
  slot.sources.delete(key);
}
function makeRoom(slot, key, px) {
  const drop = [];
  for (const [k, kpx] of slot.sources) {
    if (slot.px + px <= SOURCE_BUDGET_PX) break;
    if (k === key) continue;
    slot.sources.delete(k);
    slot.px -= kpx;
    drop.push(k);
  }
  slot.sources.set(key, px);
  slot.px += px;
  return drop;
}
