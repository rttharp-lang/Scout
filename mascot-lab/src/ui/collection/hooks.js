// Collection page — React hooks: loaded garments, the look's art (effect + clean
// logo), queued/cached mockups, visibility and media queries.
import { useEffect, useRef, useState } from "react";
import { loadGarments } from "../../apparel/garments/index.js";
import { getEffect } from "../../engine/effects/index.js";
import { renderEffect } from "../../engine/render.js";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { PRIORITY, cachedMockup, queue, requestMockup, want } from "./render.js";

/* ───────────────────────────── garments ───────────────────────────── */

let garmentsCache = null;

/** useGarments() → { garments: Garment[] | null, error } — every garment the registry loaded. */
export function useGarments() {
  const [res, setRes] = useState(() => ({ garments: garmentsCache, error: null }));
  useEffect(() => {
    let alive = true;
    loadGarments().then(
      (list) => { garmentsCache = list; if (alive) setRes({ garments: list, error: null }); },
      (error) => { if (alive) setRes({ garments: [], error }); },
    );
    return () => { alive = false; };
  }, []);
  return res;
}

/* ───────────────────────────── the look's art ───────────────────────────── */

// last art per input key, so coming back to the page shows finished art at once
const artMemo = new Map();
const ART_MEMO_MAX = 6;
const FINAL_SETTLE_MS = 220;
const EMPTY_ART = { key: null, art: null, clean: null, final: false, error: null };

/**
 * useLookArt() → { effect, original, art, clean, final, status, error, logo }
 *   effect   — the chosen effect module (null while loading / if it failed to load)
 *   art      — the effect render used for "effect" placements: a 384 preview first,
 *              then the 1024 final (final = true). Falls back to the clean logo if the
 *              effect fails, so the collection always shows something.
 *   clean    — the "original" (clean logo) render at 1024, for "logo" placements.
 */
const modsMemo = new Map(); // effectId → { id, effect, original, loaded }

export function useLookArt() {
  const { state } = useStore();
  const logo = useLogoCanvas();
  const effectId = state.effect.id;
  const [mods, setMods] = useState(() => modsMemo.get(effectId) || { id: null, effect: null, original: null, loaded: false });

  useEffect(() => {
    let alive = true;
    Promise.all([getEffect(effectId), getEffect("original")]).then(
      ([effect, original]) => {
        const m = { id: effectId, effect, original, loaded: true };
        if (effect) modsMemo.set(effectId, m);
        if (alive) setMods(m);
      },
      () => alive && setMods({ id: effectId, effect: null, original: null, loaded: true }),
    );
    return () => { alive = false; };
  }, [effectId]);

  const paramsKey = JSON.stringify(state.effect.params || {});
  const paletteKey = JSON.stringify(state.palette);
  const seed = state.effect.seed;
  const usable = mods.loaded && mods.id === effectId;
  const lookEffect = usable ? mods.effect || mods.original : null;
  const key = logo.canvas && lookEffect
    ? [logo.key, lookEffect.id, paramsKey, paletteKey, seed].join("|")
    : null;

  const [art, setArt] = useState(() => (key && artMemo.get(key)) || EMPTY_ART);

  useEffect(() => {
    if (!key) return;
    const memo = artMemo.get(key);
    if (memo?.final) { setArt(memo); return; }
    let alive = true;
    const palette = JSON.parse(paletteKey);
    const params = JSON.parse(paramsKey);
    const canvas = logo.canvas;
    const opts = (size, quality) => ({ size, seed, quality, logoKey: logo.key });
    const publish = (next) => {
      artMemo.set(key, next);
      while (artMemo.size > ART_MEMO_MAX) artMemo.delete(artMemo.keys().next().value);
      if (alive) setArt(next);
    };
    const original = mods.original;
    const effect = lookEffect;
    (async () => {
      let clean = null;
      try {
        clean = original
          ? await queue.enqueue(`clean|${logo.key}|1024`, () => renderEffect(original, canvas, {}, palette, opts(1024, "final")), PRIORITY.art)
          : canvas;
      } catch (err) {
        if (err?.name === "AbortError") return;
        clean = canvas;
      }
      if (!alive) return;
      // a quick preview first (often already cached by the studio gallery), then the final
      let preview = null;
      try {
        preview = await queue.enqueue(`art|${key}|384`, () => renderEffect(effect, canvas, params, palette, opts(384, "preview")), PRIORITY.art);
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
      if (!alive) return;
      if (preview) setArt({ key, art: preview, clean, final: false, error: null });
      // only start the expensive final once the inputs have held still for a moment
      // (a color drag changes the key every few frames; each tick gets a preview)
      await new Promise((r) => setTimeout(r, FINAL_SETTLE_MS));
      if (!alive) return;
      try {
        const final = await queue.enqueue(`art|${key}|1024`, () => renderEffect(effect, canvas, params, palette, opts(1024, "final")), PRIORITY.art);
        publish({ key, art: final, clean, final: true, error: null });
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.warn("[collection] look render failed:", err?.message || err);
        publish({ key, art: clean, clean, final: true, error: err });
      }
    })();
    return () => {
      alive = false;
      // a newer look supersedes this one: drop its renders that haven't started yet
      // (dragging a color picker would otherwise queue one 1024 px render per tick)
      queue.cancel((k) => k === `art|${key}|384` || k === `art|${key}|1024`);
    };
    // key captures logo + effect + params + palette + seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = art.key === key ? art : art.key ? art : EMPTY_ART; // stale art while the new one renders
  const status = logo.status === "error" ? "error"
    : !key ? "loading"
    : current.key !== key ? "updating"
    : current.final ? "ready" : "preview";
  return {
    effect: usable ? mods.effect : null,
    original: usable ? mods.original : null,
    effectMissing: usable && !mods.effect,
    art: current.art,
    clean: current.clean,
    final: current.final && current.key === key,
    error: current.key === key ? current.error : null,
    status,
    logo,
  };
}

/* ───────────────────────────── mockups ───────────────────────────── */

/**
 * useMockup(input | null, priority) → { canvas, pending, error }.
 * input comes from mockupInput(); null = nothing to draw yet. Keeps showing the previous
 * canvas while a new signature renders (pending = true).
 */
export function useMockup(input, priority = PRIORITY.offscreen) {
  const sig = input?.sig || null;
  const [res, setRes] = useState(() => ({ sig, canvas: sig ? cachedMockup(sig) : null, error: null }));
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!sig) return;
    const hit = cachedMockup(sig);
    if (hit) {
      setRes((r) => (r.sig === sig && r.canvas === hit ? r : { sig, canvas: hit, error: null }));
      return;
    }
    let alive = true;
    want(sig, +1);
    requestMockup(inputRef.current, priority).then(
      (canvas) => { if (alive && canvas) setRes({ sig, canvas, error: null }); },
      (error) => {
        if (!alive || error?.name === "AbortError") return;
        console.warn("[collection] mockup failed:", error?.message || error);
        setRes((r) => ({ ...r, sig, error }));
      },
    );
    return () => { alive = false; want(sig, -1); };
  }, [sig, priority]);

  return {
    canvas: res.canvas,
    pending: !!sig && res.sig !== sig,
    error: res.sig === sig ? res.error : null,
  };
}

/* ───────────────────────────── visibility / media ───────────────────────────── */

/** useInView(ref, rootMargin) → true once the element is within rootMargin of the viewport. */
export function useInView(ref, rootMargin = "200px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setInView(e.isIntersecting);
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** useMediaQuery(query) → boolean. */
export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return match;
}
