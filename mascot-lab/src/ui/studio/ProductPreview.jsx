// Mascot Lab — "On product": the selected look printed on one piece of the current
// drop, so the coach sees the effect on apparel before leaving the Studio.
//
// The piece is picked from state.collection (the drop style the coach has, custom
// edits included): the garment view where the effect prints biggest and in full
// colour, e.g. the hoodie back for Statement, the hoodie front for Classic, the
// jersey front repeat for All-over. A drop that only prints the clean logo falls back
// to the jersey front.
//
//   const mock = useProductMockup({ art, effectId, state, logo });
//   <InspectorStage … mock={mock} />   (the stage's "On product" view)
import { useEffect, useMemo, useState } from "react";
import { getEffect } from "../../engine/effects/index.js";
import { GARMENT_ORDER, loadGarments } from "../../apparel/garments/index.js";
import { renderMockup, fontsReady } from "../../apparel/renderMockup.js";
import { resolveColors, getDropStyle } from "../../apparel/collection.js";
import { canvasId, paletteSig, scheduler, useEffectRender, isAbort } from "./renderKit.js";

export const MOCKUP_SIZE = 720;
const EMPTY = Object.freeze({});
// the showcase prefers pieces where a big graphic reads well
const PREFER = { hoodie: 0.6, tee: 0.3, jersey: 0.2, longsleeve: 0.1 };
const FULL_ZONES = new Set(["back-center", "center", "chest-center", "pouch"]);

/** score(placements) → how well this view shows the effect (0 = not at all). */
function scoreView(placements = []) {
  let best = 0;
  for (const p of placements) {
    if (p.source !== "effect") continue;
    let s;
    if (p.mode === "tile") s = 8;
    else if (FULL_ZONES.has(p.zone)) s = 10 + (Number(p.scale) || 1);
    else if (p.zone === "oversized") s = 5;
    else s = 3; // small hits: chest, leg, hood
    if (p.tint) s -= 3;
    best = Math.max(best, s);
  }
  return best;
}

/** pickShowcase(garments, collection) → { garment, view, item } | null. */
export function pickShowcase(garments, collection) {
  const items = collection?.items || {};
  let pick = null;
  for (const g of garments) {
    const item = items[g.id];
    if (!item || item.enabled === false) continue;
    for (const view of ["front", "back"]) {
      if (!g.views?.[view]) continue;
      const s = scoreView(item[view]);
      if (!s) continue;
      const total = s + (PREFER[g.id] || 0);
      if (!pick || total > pick.total) pick = { garment: g, view, item, total };
    }
  }
  if (pick) return pick;
  // nothing prints the effect: show the jersey (or the first piece) as the drop has it
  const g = garments.find((x) => x.id === "jersey" && items.jersey) || garments.find((x) => items[x.id]);
  return g ? { garment: g, view: "front", item: items[g.id], total: 0 } : null;
}

function useGarments() {
  const [list, setList] = useState(undefined); // undefined = loading, [] = none loaded
  useEffect(() => {
    let alive = true;
    loadGarments().then((l) => alive && setList(l || []), () => alive && setList([]));
    return () => { alive = false; };
  }, []);
  return list;
}

function useOriginalEffect() {
  const [fx, setFx] = useState(null);
  useEffect(() => {
    let alive = true;
    getEffect("original").then((e) => alive && setFx(e || null), () => {});
    return () => { alive = false; };
  }, []);
  return fx;
}

/**
 * useProductMockup({ art, effectId, state, logo, enabled }) →
 *   { canvas, pending, available, garmentName, view, drop, garmentCount, baseColor, printsEffect }.
 * `art` is the inspector's render of `effectId`; only a full-size (≥1024) canvas is
 * printed. A mockup of another effect is never shown (canvas goes null instead).
 */
export function useProductMockup({ art, effectId, state, logo, enabled = true }) {
  const garments = useGarments();
  const clean = useOriginalEffect();
  const pick = useMemo(
    () => (garments ? pickShowcase([...garments].sort((a, b) => GARMENT_ORDER.indexOf(a.id) - GARMENT_ORDER.indexOf(b.id)), state.collection) : null),
    [garments, state.collection],
  );
  const placements = pick ? pick.item[pick.view] || [] : [];
  const needsClean = placements.some((p) => p.source === "logo");
  const cleanRender = useEffectRender({
    effect: clean, logo, params: EMPTY, palette: state.palette, seed: 7,
    size: 1024, quality: "final", priority: 14, enabled: enabled && needsClean && !!clean,
  });
  const artOk = art && art.width >= 1024 ? art : null;
  const cleanOk = needsClean ? cleanRender.canvas : null;
  const ready = !!(enabled && pick && artOk && (!needsClean || cleanOk));
  const key = ready
    ? `mock|${pick.garment.id}|${pick.view}|${canvasId(artOk)}|${canvasId(cleanOk)}|${JSON.stringify(placements)}|${JSON.stringify(pick.item.colors)}|${JSON.stringify(pick.item.text)}|${paletteSig(state.palette)}`
    : null;

  const [mock, setMock] = useState({ canvas: null, key: null, fx: null });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const palette = state.palette;
    const { garment, view, item } = pick;
    const t = scheduler.request(key, async () => {
      await fontsReady();
      const colors = resolveColors(item.colors, palette);
      const graphics = placements.map((p) => ({ ...p, canvas: p.source === "logo" ? cleanOk : artOk }));
      const text = item.text && (item.text.name || item.text.number)
        ? { name: item.text.name ? "CARTER" : null, number: item.text.number ? "23" : null, fill: colors.accent, outline: colors.trim }
        : null;
      return renderMockup(garment, view, { size: MOCKUP_SIZE, colors, graphics, text, detail: "full" });
    }, 15);
    t.promise.then(
      (canvas) => alive && setMock({ canvas, key, fx: effectId }),
      (error) => { if (alive && !isAbort(error)) console.warn("[studio] mockup:", error?.message || error); },
    );
    return () => { alive = false; t.release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = enabled && mock.fx === effectId ? mock.canvas : null;
  const colors = pick ? resolveColors(pick.item.colors, state.palette) : null;
  return {
    canvas: shown,
    pending: !shown || mock.key !== key,
    // unavailable only once we KNOW no garment loaded (or the drop has none)
    available: garments === undefined || !!pick,
    loading: garments === undefined,
    garmentName: pick?.garment.name || null,
    view: pick?.view || null,
    printsEffect: !!pick && pick.total > 0,
    baseColor: colors?.base || null,
    drop: getDropStyle(state.collection?.dropStyle),
    garmentCount: garments ? garments.filter((g) => state.collection?.items?.[g.id]?.enabled !== false).length : 0,
  };
}
