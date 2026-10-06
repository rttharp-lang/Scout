// Mascot Lab — Studio render plumbing.
//
// Every effect render on the Studio page (gallery thumbnails, the inspector's big
// preview, the jersey mockup, the 2048 px download) goes through ONE scheduler
// built on engine/render.js createRenderQueue(): one job at a time, highest
// priority first, yielding to the event loop between jobs. Consumers hold a
// ticket; when the last ticket for a key is released (unmount, logo/palette/params
// changed) the queued job is cancelled before it ever runs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRenderQueue, renderEffect } from "../../engine/render.js";
import { loadEffects } from "../../engine/effects/index.js";

const ROLES = ["primary", "secondary", "accent", "dark", "light"];

/* ───────────────────────────── scheduler ───────────────────────────── */

// dev/test visibility: the last 200 jobs with their timings (window.__studioRenders)
const LOG = [];
function logged(key, job) {
  return async () => {
    const t0 = performance.now();
    try { return await job(); } finally {
      LOG.push({ key: key.slice(0, 90), ms: Math.round(performance.now() - t0), at: Math.round(t0) });
      if (LOG.length > 200) LOG.shift();
    }
  };
}
if (typeof window !== "undefined") window.__studioRenders = LOG;

function createScheduler() {
  const queue = createRenderQueue();
  const live = new Map(); // key → { promise, refs, pending, priority }
  const listeners = new Set();
  let done = 0;
  const notify = () => { for (const fn of listeners) fn(); };

  return {
    /** request(key, job, priority) → { promise, release() } */
    request(key, job, priority = 0) {
      let e = live.get(key);
      if (!e) {
        e = { refs: 0, pending: true, priority, job: logged(key, job) };
        e.promise = queue.enqueue(key, e.job, priority);
        live.set(key, e);
        e.promise.then(
          () => { e.pending = false; done++; if (live.get(key) === e) live.delete(key); notify(); },
          () => { e.pending = false; if (live.get(key) === e) live.delete(key); notify(); },
        );
        notify();
      } else if (priority > e.priority && e.pending) {
        e.priority = priority;
        queue.enqueue(key, e.job, priority); // same key → adopts the higher priority
      }
      e.refs++;
      let released = false;
      return {
        promise: e.promise,
        release() {
          if (released) return;
          released = true;
          e.refs--;
          if (e.refs <= 0 && e.pending) {
            if (live.get(key) === e) live.delete(key);
            queue.cancel((k) => k === key);
          }
        },
      };
    },
    /** bump(key, priority) — raise the priority of a queued job (no-op when not queued). */
    bump(key, priority) {
      const e = live.get(key);
      if (e && e.pending && priority > e.priority) {
        e.priority = priority;
        queue.enqueue(key, e.job, priority); // same key → adopts the higher priority
      }
    },
    cancelAll(pred) { queue.cancel(pred); },
    get pending() { let n = 0; for (const e of live.values()) if (e.pending) n++; return n; },
    get completed() { return done; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** The Studio's single render scheduler. */
export const scheduler = createScheduler();

export const isAbort = (err) => err && (err.name === "AbortError" || /cancel/i.test(err.message || ""));

/** useQueueStatus() → { pending: number | null } re-rendering as jobs come and go (throttled to a frame). */
export function useQueueStatus() {
  // null until the first frame after mount: the tiles queue their jobs in their own
  // effects, so reading the count during this render would briefly report "done"
  const [pending, setPending] = useState(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setPending(scheduler.pending); });
    };
    const un = scheduler.subscribe(update);
    update();
    return () => { un(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return { pending };
}

/* ───────────────────────────── canvas peek cache ───────────────────────────── */

// key → canvas; a pixel budget, so remounts and effect switches show something at once
const PEEK_BUDGET = 14_000_000;
const peekMap = new Map();
let peekPixels = 0;

export function peek(key) {
  if (!key || !peekMap.has(key)) return null;
  const c = peekMap.get(key);
  peekMap.delete(key);
  peekMap.set(key, c);
  return c;
}
export function remember(key, canvas) {
  if (!key || !canvas) return;
  if (peekMap.has(key)) { peekPixels -= pixels(peekMap.get(key)); peekMap.delete(key); }
  peekMap.set(key, canvas);
  peekPixels += pixels(canvas);
  while (peekPixels > PEEK_BUDGET && peekMap.size > 1) {
    const k = peekMap.keys().next().value;
    peekPixels -= pixels(peekMap.get(k));
    peekMap.delete(k);
  }
}
const pixels = (c) => (c?.width || 0) * (c?.height || 0);

/* ───────────────────────────── keys ───────────────────────────── */

export const paletteSig = (palette) => ROLES.map((r) => palette?.[r] || "").join(",");

const stable = (o) => {
  if (!o || typeof o !== "object") return "";
  return JSON.stringify(Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));
};

/** renderKey(...) — the scheduler key of one effect render. */
export function renderKey({ effectId, logoKey, palette, params, seed, size, quality }) {
  if (!effectId || !logoKey) return null;
  return `fx|${effectId}|${logoKey}|${paletteSig(palette)}|${stable(params)}|${seed}|${size}|${quality}`;
}

const canvasIds = new WeakMap();
let canvasSeq = 0;
/** canvasId(canvas) → a stable id for a canvas object (for mockup keys). */
export function canvasId(c) {
  if (!c) return "none";
  let id = canvasIds.get(c);
  if (!id) { id = `c${++canvasSeq}`; canvasIds.set(c, id); }
  return id;
}

/* ───────────────────────────── hooks ───────────────────────────── */

/** useEffects() → { effects, status: "loading" | "ready" | "error", error }. */
export function useEffects() {
  const [s, setS] = useState({ effects: [], status: "loading", error: null });
  useEffect(() => {
    let alive = true;
    loadEffects().then(
      (effects) => alive && setS({ effects: effects || [], status: "ready", error: null }),
      (error) => alive && setS({ effects: [], status: "error", error }),
    );
    return () => { alive = false; };
  }, []);
  return s;
}

/**
 * useEffectRender(opts) → { canvas, status: "idle" | "pending" | "ready" | "error", error, retry, key, fresh, placeholder }.
 *   opts: { effect, logo: { canvas, key }, params, palette, seed, size, quality,
 *           priority, enabled = true, debounce = 0, placeholderKey }
 * While the current inputs render it shows, in order of preference: the placeholder
 * render of the SAME inputs (e.g. the 384 px gallery tile, when it is ready), else the
 * last render of the same effect (stale-while-rendering), else nothing. It never shows
 * another effect's image. `fresh` is true when the shown canvas belongs to the current inputs.
 * `enabled: false` pauses: nothing new is queued and a queued job is released.
 */
export function useEffectRender({
  effect, logo, params, palette, seed = 7, size = 384, quality = "preview",
  priority = 0, enabled = true, debounce = 0, placeholderKey = null,
}) {
  const fx = effect?.id || null;
  const key = effect && logo?.canvas && logo?.key
    ? renderKey({ effectId: effect.id, logoKey: logo.key, palette, params, seed, size, quality })
    : null;
  const [res, setRes] = useState(() => {
    const hit = peek(key);
    return hit ? { canvas: hit, key, fx, status: "ready", error: null } : { canvas: null, key: null, fx, status: "idle", error: null };
  });
  const [nonce, setNonce] = useState(0);
  const inputs = useRef(null);
  inputs.current = { effect, logo, params, palette, seed, size, quality, priority };

  useEffect(() => {
    if (!key || !enabled) return undefined;
    const hit = peek(key);
    if (hit) {
      setRes((r) => (r.key === key && r.canvas === hit && r.status === "ready" ? r : { canvas: hit, key, fx: effect.id, status: "ready", error: null }));
      return undefined;
    }
    // keep this effect's last image (if any) while the new one renders; drop another effect's
    setRes((r) => (r.fx === effect.id
      ? (r.status === "pending" && r.error === null ? r : { ...r, status: "pending", error: null })
      : { canvas: null, key: null, fx: effect.id, status: "pending", error: null }));
    let alive = true;
    let ticket = null;
    const start = () => {
      const i = inputs.current;
      ticket = scheduler.request(
        key,
        // cache inside the job, so anyone notified when it settles can already peek() it
        () => renderEffect(i.effect, i.logo.canvas, i.params, i.palette, { size: i.size, seed: i.seed, quality: i.quality, logoKey: i.logo.key })
          .then((canvas) => { remember(key, canvas); return canvas; }),
        i.priority,
      );
      ticket.promise.then(
        (canvas) => {
          if (alive) setRes({ canvas, key, fx: i.effect.id, status: "ready", error: null });
        },
        (error) => {
          if (!alive || isAbort(error)) return;
          console.warn("[studio] render failed:", error?.message || error);
          setRes((r) => ({ ...(r.fx === i.effect.id ? r : { canvas: null }), key, fx: i.effect.id, status: "error", error }));
        },
      );
    };
    const t = debounce > 0 ? setTimeout(start, debounce) : (start(), 0);
    return () => {
      alive = false;
      clearTimeout(t);
      ticket?.release();
    };
    // inputs are captured through `key` (+ nonce for retries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce]);

  // visibility / selection changes raise the priority of a queued job in place
  useEffect(() => {
    if (key && enabled) scheduler.bump(key, priority);
  }, [key, enabled, priority]);

  const fresh = !!key && res.key === key && res.status === "ready";
  // the placeholder (e.g. the gallery tile of these exact inputs) may land after this
  // render started: listen for finished jobs until it shows up
  const wantPh = !!placeholderKey && !fresh;
  const [, bumpTick] = useState(0);
  useEffect(() => {
    if (!wantPh || peekMap.has(placeholderKey)) return undefined;
    return scheduler.subscribe(() => { if (peekMap.has(placeholderKey)) bumpTick((n) => n + 1); });
  }, [wantPh, placeholderKey]);
  const ph = wantPh ? peek(placeholderKey) : null;
  const own = res.canvas && res.fx === fx ? res.canvas : null;
  const canvas = fresh ? res.canvas : ph || own;
  const status = !key ? "idle" : res.fx === fx ? res.status : "pending";
  return useMemo(() => ({
    canvas,
    fx: canvas ? fx : null,
    status,
    error: status === "error" ? res.error : null,
    key,
    fresh,
    placeholder: !!ph && canvas === ph,
    retry: () => setNonce((n) => n + 1),
  }), [res, key, canvas, fresh, ph, status, fx]);
}

/**
 * useDraftRender(opts) → { canvas, exact, clear } — fast low-res previews while `active`
 * (a slider drag). Unlike useEffectRender it never throws work away: one draft renders
 * at a time, the finished one is shown, and the next starts from the newest params
 * after a breather (so the slider thumb keeps moving between renders). The draft size
 * adapts per effect so a draft costs roughly 40–90 ms on this machine.
 *   opts: { effect, logo, params, palette, seed, active, priority = 50 }
 * A draft is only shown for the effect + logo + palette it was made with.
 */
const DRAFT_SIZES = [160, 208, 256, 320];
const draftSizeOf = new Map(); // effect id → index into DRAFT_SIZES
export function useDraftRender({ effect, logo, params, palette, seed = 7, active, priority = 50 }) {
  const scope = effect && logo?.key ? `${effect.id}|${logo.key}|${paletteSig(palette)}` : null;
  const on = !!(active && effect && logo?.canvas && logo?.key);
  const paramsKey = on ? `${scope}|${stable(params)}|${seed}` : null;
  const [shown, setShown] = useState(null); // { canvas, paramsKey, scope }
  const latest = useRef(null);
  latest.current = { paramsKey, scope, effect, logo, params, palette, seed, priority };
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!paramsKey || busy.current) return;
    const run = () => {
      const i = latest.current;
      if (!mounted.current || !i.paramsKey) return;
      const pk = i.paramsKey;
      const idx = draftSizeOf.get(i.effect.id) ?? 2;
      const size = DRAFT_SIZES[idx];
      const k = renderKey({ effectId: i.effect.id, logoKey: i.logo.key, palette: i.palette, params: i.params, seed: i.seed, size, quality: "preview" });
      const hit = peek(k);
      if (hit) { setShown({ canvas: hit, paramsKey: pk, scope: i.scope }); return; }
      busy.current = true;
      let ms = 0;
      const t = scheduler.request(
        k,
        () => {
          const t0 = performance.now();
          return renderEffect(i.effect, i.logo.canvas, i.params, i.palette, { size, seed: i.seed, quality: "preview", logoKey: i.logo.key })
            .then((c) => { ms = performance.now() - t0; remember(k, c); return c; });
        },
        i.priority,
      );
      t.promise
        .then((c) => {
          if (ms > 95 && idx > 0) draftSizeOf.set(i.effect.id, idx - 1);
          else if (ms && ms < 35 && idx < DRAFT_SIZES.length - 1) draftSizeOf.set(i.effect.id, idx + 1);
          if (mounted.current) setShown({ canvas: c, paramsKey: pk, scope: i.scope });
        }, () => {})
        .finally(() => {
          t.release();
          // breathe (longer after a slow draft), then catch up with the newest params;
          // busy until then, so runs never overlap
          setTimeout(() => {
            busy.current = false;
            const n = latest.current;
            if (mounted.current && n.paramsKey && n.paramsKey !== pk) run();
          }, Math.min(140, Math.max(45, ms * 0.6)));
        });
    };
    run();
  }, [paramsKey]);

  const clear = useCallback(() => setShown(null), []);
  const valid = !!shown && shown.scope === scope;
  return useMemo(() => ({ canvas: valid ? shown.canvas : null, exact: valid && shown.paramsKey === paramsKey, clear }), [valid, shown, paramsKey, clear]);
}

/* ───────────────────────────── interaction hold ───────────────────────────── */

// While the coach drags a slider (pointer held down in the inspector), the big
// 1024 px render waits: one blocking render mid-drag makes the slider stutter. The
// fast 384 px tile keeps the preview current in the meantime.
let held = false;
const holdListeners = new Set();
function setHeld(v) {
  if (held === v) return;
  held = v;
  for (const fn of holdListeners) fn(v);
}
/** holdProps — spread on a container: pointer down inside it holds big renders until release. */
export const holdProps = {
  onPointerDown: (e) => {
    if (e.button !== 0 || !e.target.closest?.('input[type="range"]')) return;
    setHeld(true);
    const release = () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
      setHeld(false);
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
  },
};
/** useHeld() → true while a slider drag is in progress. */
export function useHeld() {
  const [v, setV] = useState(held);
  useEffect(() => {
    holdListeners.add(setV);
    setV(held);
    return () => { holdListeners.delete(setV); };
  }, []);
  return v;
}

/**
 * useInView(ref, { rootMargin }) → boolean: the element is on (or near) screen.
 * Falls back to `true` where IntersectionObserver is missing.
 */
export function useInView(ref, { rootMargin = "160px 0px", initial = false } = {}) {
  const [inView, setInView] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setInView(e.isIntersecting);
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** useDebounced(value, ms) → value, updated once it has been stable for `ms`. */
export function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (Object.is(v, value)) return undefined;
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, v]);
  return v;
}

/** useMediaQuery("(max-width: 759px)") → boolean. */
export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return m;
}
