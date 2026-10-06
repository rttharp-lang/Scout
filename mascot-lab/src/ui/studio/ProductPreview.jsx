// Mascot Lab — "On product": the selected look on the game jersey (front), using
// the jersey recipe from state.collection (the current drop style), so the coach
// sees the effect on apparel before leaving the Studio.
//
//   const mock = useJerseyMockup({ art, state, logo });   // one render, shared
//   <JerseyThumb mock={mock} effect={effect} />            // inspector header
//   <ProductPreview mock={mock} effect={effect} />         // block with the collection link
import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, CanvasImage, SpecLabel, Spinner, cx, navigate } from "../components/index.js";
import { getEffect } from "../../engine/effects/index.js";
import { getGarment, loadGarments } from "../../apparel/garments/index.js";
import { renderMockup, fontsReady } from "../../apparel/renderMockup.js";
import { resolveColors, getDropStyle } from "../../apparel/collection.js";
import { canvasId, paletteSig, scheduler, useEffectRender, isAbort } from "./renderKit.js";

const MOCKUP_SIZE = 560;
const EMPTY = Object.freeze({});

function useAsync(fn, deps) {
  const [v, setV] = useState(undefined);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(fn).then((r) => alive && setV(r ?? null), () => alive && setV(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

/**
 * useJerseyMockup({ art, effectId, state, logo, enabled }) → { canvas, pending, available, garmentCount, drop }.
 * `art` is the inspector's render of `effectId`; only a full-size (≥1024) canvas is printed
 * on the jersey. A mockup of another effect is never shown (the thumb goes blank instead).
 */
export function useJerseyMockup({ art, effectId, state, logo, enabled = true }) {
  const garment = useAsync(() => getGarment("jersey"), []);
  const garmentCount = useAsync(() => loadGarments().then((l) => l.length), []);
  const clean = useAsync(() => getEffect("original"), []);
  const item = state.collection?.items?.jersey;
  const drop = getDropStyle(state.collection?.dropStyle);
  const needsClean = !!item?.front?.some((p) => p.source === "logo");
  const cleanRender = useEffectRender({
    effect: clean || null, logo, params: EMPTY, palette: state.palette, seed: 7,
    size: 1024, quality: "final", priority: 14, enabled: enabled && needsClean && !!clean,
  });
  const artOk = art && art.width >= 1024 ? art : null;
  const cleanOk = needsClean ? cleanRender.canvas : null;
  const ready = !!(enabled && garment && item && artOk && (!needsClean || cleanOk));
  const key = ready
    ? `mock|jersey|front|${canvasId(artOk)}|${canvasId(cleanOk)}|${JSON.stringify(item.front)}|${JSON.stringify(item.colors)}|${item.text?.number ? 1 : 0}|${paletteSig(state.palette)}`
    : null;

  const [mock, setMock] = useState({ canvas: null, key: null, fx: null });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const palette = state.palette;
    const t = scheduler.request(key, async () => {
      await fontsReady();
      const colors = resolveColors(item.colors, palette);
      const graphics = item.front.map((p) => ({ ...p, canvas: p.source === "logo" ? cleanOk : artOk }));
      const text = item.text?.number ? { name: null, number: "23", fill: colors.accent, outline: colors.trim } : null;
      return renderMockup(garment, "front", { size: MOCKUP_SIZE, colors, graphics, text, detail: "full" });
    }, 15);
    t.promise.then(
      (canvas) => alive && setMock({ canvas, key, fx: effectId }),
      (error) => { if (alive && !isAbort(error)) console.warn("[studio] mockup:", error?.message || error); },
    );
    return () => { alive = false; t.release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = enabled && mock.fx === effectId ? mock.canvas : null;
  return {
    canvas: shown,
    pending: !shown || mock.key !== key,
    // hide only once we KNOW there's no jersey (registry loaded without it)
    available: !!item && !(garment === null && garmentCount !== undefined),
    garmentCount: garmentCount || 0,
    drop,
  };
}

/** Small jersey in the inspector header: the look on apparel, always in view. */
export function JerseyThumb({ mock, effect, className }) {
  if (!mock?.available) return null;
  return (
    <figure className={cx("st-jthumb", className)}>
      <span className="st-jthumb__img ml-stage--surface">
        <CanvasImage canvas={mock.canvas} ratio={1} alt={effect ? `${effect.name} on the game jersey` : "Game jersey"} />
        {mock.pending && mock.canvas && <span className="st-jthumb__busy" aria-hidden="true"><Spinner /></span>}
      </span>
      <figcaption>On jersey</figcaption>
    </figure>
  );
}

export function ProductPreview({ mock, effect }) {
  if (!mock?.available) return null;
  const drop = mock.drop;
  const pieces = mock.garmentCount > 1 ? `See all ${mock.garmentCount} pieces` : "See the collection";
  return (
    <div className="st-product">
      <div className="st-product__img ml-stage--surface">
        <CanvasImage canvas={mock.canvas} ratio={1} alt={effect ? `Game jersey, front, with ${effect.name}` : "Game jersey"} />
        {mock.pending && mock.canvas && <span className="st-product__busy" aria-hidden="true"><Spinner /></span>}
      </div>
      <div className="st-product__text">
        <SpecLabel>On product</SpecLabel>
        <h3 className="st-product__title">Game jersey</h3>
        <p className="st-product__blurb">{drop ? `${drop.name} drop. ${drop.blurb}` : "How this look prints on the jersey front."}</p>
        <Button size="sm" variant="ghost" iconRight={<ArrowRight aria-hidden="true" />} onClick={() => navigate("collection")} className="st-product__link">
          {pieces}
        </Button>
      </div>
    </div>
  );
}

export default ProductPreview;
