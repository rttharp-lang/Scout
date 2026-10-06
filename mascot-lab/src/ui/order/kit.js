// Mascot Lab — the order pages' render pipeline (the tested logo → effect → mockup
// pipeline from CONTRACTS.md), shared by Order, Review and Done:
//
//   useOrderGarments()            → { garments, ids, loading } (loaded + enabled + priced)
//   useEffectMeta()               → the chosen effect module (or null while loading / missing)
//   useKitArt({ size })           → { art, clean, effect, fallback, status, error, kind } for placements
//   kitProblem(kit)               → { tone, title, body } when the logo or the effect failed
//   useMockups(ids, opts)         → { [garmentId]: { front, back } } canvases, staggered
//   renderGarmentView(...)        → one mockup canvas (imperative; exports use it)
//
// Every render goes through ONE module-level queue (one job at a time, yielding to the
// event loop between jobs), visible/first items at higher priority, so the main thread
// is never blocked for long. Mockup results are cached by everything that affects them.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { createRenderQueue, renderEffect } from "../../engine/render.js";
import { getEffect, loadEffects } from "../../engine/effects/index.js";
import { availableGarmentIds, loadGarments } from "../../apparel/garments/index.js";
import { fontsReady, renderMockup } from "../../apparel/renderMockup.js";
import { resolveColors } from "../../apparel/collection.js";
import { orderGarmentIds } from "../../order/pricing.js";

export const queue = createRenderQueue();
const isAbort = (e) => e && e.name === "AbortError";

/* ───────────────────────────── garments ───────────────────────────── */

let garmentsCache = null;

/** useOrderGarments() → { garments: Garment[] (loaded, in order), ids: order garment ids, byId, loading }. */
export function useOrderGarments() {
  const { state } = useStore();
  const [garments, setGarments] = useState(garmentsCache);
  useEffect(() => {
    let alive = true;
    loadGarments().then(
      (list) => { garmentsCache = list; if (alive) setGarments(list); },
      () => { if (alive) setGarments([]); },
    );
    return () => { alive = false; };
  }, []);
  const known = garments ? garments.map((g) => g.id) : availableGarmentIds();
  const ids = orderGarmentIds(state, { garmentIds: known });
  const byId = useMemo(() => Object.fromEntries((garments || []).map((g) => [g.id, g])), [garments]);
  return { garments: garments || [], ids, byId, loading: !garments };
}

/* ───────────────────────────── effect + art ───────────────────────────── */

/** useEffectMeta() → the chosen effect module, or null (loading, or its file is missing). */
export function useEffectMeta() {
  const { state } = useStore();
  const [eff, setEff] = useState(null);
  useEffect(() => {
    let alive = true;
    getEffect(state.effect.id).then((e) => alive && setEff(e), () => alive && setEff(null));
    return () => { alive = false; };
  }, [state.effect.id]);
  return eff;
}

async function effectOrClean(id) {
  return (await getEffect(id)) || (await getEffect("original")) || (await loadEffects())[0] || null;
}

/**
 * renderArt(state, logo, size) → Promise<{ art, clean, effect, fallback }> (through the queue).
 * If the chosen effect fails to render, the clean logo stands in for it and `fallback`
 * says so ({ effect: name, message }); it rejects only when the logo itself can't be drawn.
 */
export function renderArt(state, logo, { size = 1024, quality = "final", priority = 5 } = {}) {
  const key = `art|${logo.key}|${state.effect.id}|${JSON.stringify(state.effect.params)}|${Object.values(state.palette).join(",")}|${state.effect.seed}|${size}|${quality}`;
  return queue.enqueue(key, async () => {
    if (!logo?.canvas) throw Object.assign(new Error("The logo isn't loaded."), { kind: "logo" });
    const effect = await effectOrClean(state.effect.id);
    const original = (await getEffect("original")) || effect;
    if (!effect) throw new Error("No effects are available yet.");
    const clean = original
      ? await renderEffect(original, logo.canvas, {}, state.palette, { size, logoKey: logo.key })
      : null;
    if (effect === original) return { art: clean, clean, effect, fallback: null };
    try {
      const art = await renderEffect(effect, logo.canvas, state.effect.params, state.palette, { size, seed: state.effect.seed, quality, logoKey: logo.key });
      return { art, clean: clean || art, effect, fallback: null };
    } catch (e) {
      if (!clean) throw e;
      console.warn(`[order] ${effect.name} didn't render; showing the clean logo —`, e?.message || e);
      return { art: clean, clean, effect, fallback: { effect: effect.name, message: String(e?.message || e) } };
    }
  }, priority);
}

/** kitProblem(kit) → { tone, title, body } for a notice, or null when the art is fine. */
export function kitProblem(kit) {
  if (kit?.status === "error") {
    return kit.kind === "logo"
      ? { tone: "danger", title: "Your logo didn't load", body: "The garment previews need it. Upload the logo again in the studio; your roster, sizes and details stay as they are." }
      : { tone: "danger", title: "The previews couldn't be drawn", body: `${kit.error?.message || "Something went wrong while drawing the artwork."} Your order details are safe. Reload the page, or pick another effect in the studio.` };
  }
  if (kit?.fallback) {
    return { tone: "warning", title: `The ${kit.fallback.effect} effect didn't render`, body: `These previews show your clean logo instead. The order still asks for the ${kit.fallback.effect} effect. Try another effect in the studio if you'd rather see it here.` };
  }
  return null;
}

/** placeholderText(kit) → short text for an image box that won't fill in, or null. */
export const placeholderText = (kit) => (kit?.status === "error" ? (kit.kind === "logo" ? "Logo didn't load" : "Preview unavailable") : null);

/** useKitArt({ size }) → { art, clean, effect, fallback, status: "loading" | "ready" | "error", error, kind: "logo" | "render" | null }. */
export function useKitArt({ size = 1024, quality = "final" } = {}) {
  const { state } = useStore();
  const logo = useLogoCanvas();
  const [res, setRes] = useState({ art: null, clean: null, effect: null, fallback: null, status: "loading", error: null, kind: null });
  const paramsKey = JSON.stringify(state.effect.params);
  const palKey = Object.values(state.palette).join(",");
  useEffect(() => {
    // a logo that fails to decode: say so (the previous logo's canvas would be the wrong art)
    if (logo.status === "error") {
      setRes({ art: null, clean: null, effect: null, fallback: null, status: "error", error: logo.error, kind: "logo" });
      return;
    }
    if (!logo.canvas) return;
    let alive = true;
    setRes((r) => (r.status === "loading" ? r : { ...r, status: "loading" }));
    renderArt(state, logo, { size, quality }).then(
      (out) => alive && setRes({ ...out, status: "ready", error: null, kind: null }),
      (e) => { if (alive && !isAbort(e)) setRes((r) => ({ ...r, status: "error", error: e, kind: e?.kind || "render" })); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo.key, logo.canvas, logo.status, state.effect.id, paramsKey, palKey, state.effect.seed, size, quality]);
  return res;
}

/* ───────────────────────────── mockups ───────────────────────────── */

const mockCache = new Map(); // key → canvas (LRU 72)
function remember(key, canvas) {
  mockCache.set(key, canvas);
  while (mockCache.size > 72) mockCache.delete(mockCache.keys().next().value);
}

let fontsOnce = null;
const fonts = () => (fontsOnce ||= fontsReady());

/** lettering for previews: { name, number } from a roster row (surname, uppercase), or a default. */
export function letteringFor(row) {
  const name = String(row?.name || "").trim();
  const last = name ? name.split(/\s+/).pop().replace(/[^A-Za-z'\-]/g, "").toUpperCase() : "";
  const number = String(row?.number || "").trim();
  return { name: last || "CARTER", number: number || "23" };
}

/**
 * renderGarmentView(garment, view, item, palette, { art, clean }, opts) → canvas.
 * opts: { size, detail, lettering: { name, number }, backdrop }
 */
export function renderGarmentView(garment, view, item, palette, art, { size = 600, detail = "full", lettering, backdrop = null, shadow = true } = {}) {
  const colors = resolveColors(item.colors, palette);
  const graphics = (item[view] || []).map((p) => ({ ...p, canvas: p.source === "logo" ? art.clean : art.art }));
  const L = lettering || letteringFor(null);
  const text = item.text && { name: item.text.name ? L.name : null, number: item.text.number ? L.number : null, fill: colors.accent, outline: colors.trim };
  return renderMockup(garment, view, { size, colors, graphics, text, detail, backdrop, shadow });
}

/**
 * useMockups(ids, { size, detail, views, lettering, priority }) → { [id]: { front?, back? } }.
 * Renders after the art is ready, one view per queue job, first garments first.
 */
export function useMockups(ids, { size = 320, detail = "fast", views = ["front"], lettering = null, priority = 2, artSize = 1024 } = {}) {
  const { state } = useStore();
  const { byId } = useOrderGarments();
  const kit = useKitArt({ size: artSize });
  const [out, setOut] = useState({});
  const gen = useRef(0);
  const idsKey = ids.join(",");
  const viewsKey = views.join(",");
  const letterKey = lettering ? `${lettering.name}|${lettering.number}` : "";
  const itemsKey = JSON.stringify(ids.map((id) => state.collection.items[id]));
  const palKey = Object.values(state.palette).join(",");

  useEffect(() => {
    // the art failed (e.g. the logo didn't decode): drop mockups drawn from the old art
    if (kit.status === "error") { gen.current++; setOut({}); return; }
    if (kit.status !== "ready" || !kit.art) return;
    const my = ++gen.current;
    let alive = true;
    const artId = `${state.effect.id}|${JSON.stringify(state.effect.params)}|${state.effect.seed}|${palKey}|${kit.art.width}`;
    const next = {};
    const jobs = [];
    const mine = new Set();
    ids.forEach((id, gi) => {
      const g = byId[id];
      const item = state.collection.items[id];
      if (!g || !item) return;
      next[id] = {};
      views.forEach((view, vi) => {
        const key = `mock|${artId}|${id}|${view}|${size}|${detail}|${letterKey}|${JSON.stringify(item)}`;
        const hit = mockCache.get(key);
        if (hit) { next[id][view] = hit; return; }
        mine.add(key);
        jobs.push(
          queue.enqueue(key, async () => {
            await fonts();
            const c = renderGarmentView(g, view, item, state.palette, kit, { size, detail, lettering: lettering || undefined });
            remember(key, c);
            return c;
          }, priority - gi * 0.01 - vi * 0.001).then(
            (c) => {
              if (!alive || my !== gen.current) return;
              setOut((o) => ({ ...o, [id]: { ...(o[id] || {}), [view]: c } }));
            },
            (e) => { if (!isAbort(e)) console.warn(`[order] mockup ${id}/${view} failed —`, e?.message || e); },
          ),
        );
      });
    });
    setOut(next);
    return () => {
      alive = false;
      // drop this view's pending (not running) jobs; finished ones stay cached
      queue.cancel((k) => mine.has(k));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.status, kit.art, kit.clean, idsKey, viewsKey, size, detail, letterKey, itemsKey, palKey, byId]);

  return { mockups: out, kit };
}
