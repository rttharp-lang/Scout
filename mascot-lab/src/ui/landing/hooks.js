// Landing page hooks: registries (effects + garments, "not loaded yet" aware),
// render jobs through the shared landing queue, viewport + motion preferences.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadEffects } from "../../engine/effects/index.js";
import { loadGarments } from "../../apparel/garments/index.js";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { artJob, artKey, isCanvas, letteringFor, mockJob, mockKey, peek, request } from "./renders.js";

/* ───────────────────────────── registries ───────────────────────────── */

function useRegistry(load) {
  const [list, setList] = useState(null); // null = loading
  useEffect(() => {
    let alive = true;
    load().then(
      (l) => alive && setList(Array.isArray(l) ? l : []),
      (err) => { console.warn("[landing] registry failed:", err?.message || err); if (alive) setList([]); },
    );
    return () => { alive = false; };
  }, [load]);
  return list;
}

/* ───────────────────────────── page context ───────────────────────────── */

// One context object even if the dev server briefly serves two copies of this module
// (HMR timestamps) — provider and consumers must agree on identity.
const LandingCtx = (globalThis.__mascotLabLandingCtx ||= createContext(null));

/** One logo decode, one registry read and one motion query for the whole page. */
export function LandingProvider({ children }) {
  const { state, actions } = useStore();
  const logo = useLogoCanvas();
  const effects = useRegistry(loadEffects);
  const garments = useRegistry(loadGarments);
  const reduced = useReducedMotion();
  // dev-only timing marks for the landing QA scripts (window.__lpMarks)
  if (import.meta.env?.DEV && typeof window !== "undefined") {
    const m = (window.__lpMarks ||= {});
    const now = () => Math.round(performance.now());
    if (!m.provider) m.provider = now();
    if (logo.canvas && !m.logo) m.logo = now();
    if (effects && !m.effects) m.effects = now();
    if (garments && !m.garments) m.garments = now();
  }
  const value = useMemo(
    () => ({ state, actions, logo, palette: state.palette, effects, garments, reduced }),
    [state, actions, logo, effects, garments, reduced],
  );
  return React.createElement(LandingCtx.Provider, { value }, children);
}

export function useLanding() {
  const ctx = useContext(LandingCtx);
  if (!ctx) throw new Error("useLanding() must be used inside <LandingProvider>.");
  return ctx;
}

/* ───────────────────────────── render jobs ───────────────────────────── */

/**
 * useJobs(jobs, enabled) → get(key) → canvas | Error | null.
 * jobs: [{ key, run: () => Promise<canvas>, priority }] (falsy entries are skipped).
 * Finished renders come from the shared landing cache, so a remount paints at once.
 * Pending jobs are released (and cancelled if nobody else wants them) on change/unmount.
 */
export function useJobs(jobs, enabled = true) {
  const list = jobs.filter(Boolean);
  const sig = enabled ? list.map((j) => `${j.key}#${j.priority || 0}`).join("\n") : "";
  const latest = useRef(list);
  latest.current = list;
  const held = useRef(new Map()); // key → result, pinned while this hook shows it
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!sig) return;
    let alive = true;
    const handles = [];
    const keep = new Set();
    for (const j of latest.current) {
      keep.add(j.key);
      if (held.current.has(j.key)) continue;
      const hit = peek(j.key);
      if (hit) { held.current.set(j.key, hit); continue; }
      const h = request(j.key, j.run, j.priority || 0);
      handles.push(h);
      h.promise.then(
        (c) => { if (alive) { held.current.set(j.key, c); bump(); } },
        (err) => { if (alive && err?.name !== "AbortError") { held.current.set(j.key, err); bump(); } },
      );
    }
    for (const k of [...held.current.keys()]) if (!keep.has(k)) held.current.delete(k);
    return () => { alive = false; handles.forEach((h) => h.release()); };
  }, [sig]);

  return useCallback((key) => (key ? held.current.get(key) ?? peek(key) ?? null : null), []);
}

/* ───────────────────────────── viewport + motion ───────────────────────────── */

/** useInView(ref, { rootMargin, once }) → boolean. Without IntersectionObserver: true. */
export function useInView(ref, { rootMargin = "240px 0px", once = true } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) { setInView(true); if (once) io.disconnect(); }
        else if (!once) setInView(false);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, once]);
  return inView;
}

export function useReducedMotion() {
  const q = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** usePageVisible() → false while the tab is hidden. */
export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/* ───────────────────────────── art + mockups ───────────────────────────── */

/**
 * useArt(entries, enabled) → [{ key, effect, result }] where result is canvas | Error | null.
 * entries: [{ effect, params?, seed?, priority }] (falsy entries skipped). Includes the
 * clean logo ("original") when asked: useArt([{ effect: original, priority }]).
 */
export function useArt(entries, enabled = true) {
  const { logo, palette } = useLanding();
  const ok = enabled && !!logo.canvas;
  const list = entries.filter((e) => e && e.effect);
  const keyed = list.map((e) => ({ ...e, key: artKey(e.effect.id, logo, palette, e) }));
  const get = useJobs(
    keyed.map((e) => ({ key: e.key, run: artJob(e.effect, logo, palette, e), priority: e.priority })),
    ok,
  );
  return keyed.map((e) => ({ key: e.key, effect: e.effect, result: get(e.key) }));
}

/**
 * useMockups(entries, enabled) → [{ key, garment, view, result }].
 * entries: [{ garment, view, item, art: { key, result }, clean: { key, result } | null, priority }].
 * An entry waits (result null) until its art (and the clean logo, when a placement
 * uses it) is ready.
 */
export function useMockups(entries, enabled = true) {
  const { palette, state } = useLanding();
  const lettering = useMemo(() => letteringFor(state.roster), [state.roster]);
  const jobs = [];
  const out = entries.filter(Boolean).map((e) => {
    const art = isCanvas(e.art?.result) ? e.art.result : null;
    const needsClean = (e.item?.[e.view] || []).some((p) => p.source === "logo");
    const clean = isCanvas(e.clean?.result) ? e.clean.result : null;
    const waiting = !art || !e.item || (needsClean && e.clean && !clean && !(e.clean.result instanceof Error));
    if (waiting) return { key: null, garment: e.garment, view: e.view, result: e.art?.result instanceof Error ? e.art.result : null };
    const key = mockKey(e.garment.id, e.view, e.item, palette, e.art.key, clean ? e.clean.key : "", lettering);
    jobs.push({ key, run: mockJob(e.garment, e.view, e.item, palette, art, clean, lettering), priority: e.priority });
    return { key, garment: e.garment, view: e.view };
  });
  const get = useJobs(jobs, enabled);
  return out.map((o) => (o.key ? { ...o, result: get(o.key) } : o));
}
