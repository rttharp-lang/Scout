// "The drop": every garment in the current collection as a lookbook row of real
// mockups (current effect + current drop style), rendered when scrolled into view.
import React, { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, CanvasImage, Segmented, SpecLabel, navigate } from "../components/index.js";
import { DROP_STYLES, getDropStyle } from "../../apparel/collection.js";
import { PRODUCTS } from "../../order/catalog.js";
import { SectionHead } from "./SectionHead.jsx";
import { usd } from "./copy.js";
import { useArt, useInView, useLanding, useMockups } from "./hooks.js";
import { PRIORITY, isCanvas } from "./renders.js";
import { collectionGarments, currentLook } from "./picks.js";

/** Column counts that never leave a lone card on the last row (wide / ≤1100 px). */
function gridCols(n) {
  const wide = n <= 3 ? 3 : n === 4 ? 4 : n === 5 ? 5 : n === 6 ? 3 : 4;
  const md = n === 4 ? 2 : 3;
  return { "--cols": wide, "--cols-md": md };
}

/** "Classic, All-over or Tonal": the drop styles other than the current one. */
function otherStyles(currentId) {
  const names = DROP_STYLES.filter((d) => d.id !== currentId).map((d) => d.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0] || "another style";
}

const NUM_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function Lookbook() {
  const { state, effects, garments } = useLanding();
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: "320px 0px" });
  const [view, setView] = useState("front");
  const drop = getDropStyle(state.collection.dropStyle);
  const look = currentLook(effects, state.effect);
  const original = effects?.find((e) => e.id === "original") || null;
  const pieces = collectionGarments(garments, state.collection);

  const [art] = useArt([look.effect && { effect: look.effect, params: look.params, seed: look.seed, priority: PRIORITY.lookbook }], inView);
  const [clean] = useArt([original && { effect: original, priority: PRIORITY.clean }], inView);
  const mocks = useMockups(
    pieces.map((g, i) => ({
      garment: g,
      view,
      item: state.collection.items[g.id],
      art,
      clean: clean || null,
      priority: PRIORITY.lookbook - i * 0.01,
    })),
    inView,
  );

  const n = pieces.length;
  const title = n > 1 ? `${NUM_WORDS[n] || n} pieces. One look.` : "The kit. One look.";
  const loading = garments === null;

  return (
    <section className="lp-section lp-drop" aria-labelledby="lp-drop-title" ref={ref}>
      <div className="container">
        <SectionHead
          n="03"
          kicker="The drop"
          aside={drop ? `${drop.name} drop · ${look.effect ? look.effect.name : "Loading"}` : null}
          id="lp-drop-title"
          title={title}
          lead={drop ? `${drop.note || drop.blurb} Switch to ${otherStyles(drop.id)} in the Collection step.` : null}
        >
          <Segmented
            size="sm"
            mono
            label="Garment view"
            value={view}
            onChange={setView}
            options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }]}
          />
        </SectionHead>

        <ul className="lp-drop__row" role="list" aria-label={`${drop?.name || "Current"} drop, ${view} view`} style={gridCols(loading ? 6 : n)}>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="lp-piece is-skeleton" aria-hidden="true">
                  <div className="lp-piece__art"><CanvasImage canvas={null} ratio={1} /></div>
                  <div className="lp-piece__meta"><span className="lp-piece__name">&nbsp;</span></div>
                </li>
              ))
            : mocks.map((m) => {
                const p = PRODUCTS[m.garment.id];
                return (
                  <li key={m.garment.id} className="lp-piece">
                    <div className="lp-piece__art">
                      <CanvasImage
                        canvas={isCanvas(m.result) ? m.result : null}
                        stage="none"
                        ratio={1}
                        alt={`${m.garment.name}, ${view}, ${look.effect?.name || ""} graphic`}
                        error={m.result instanceof Error ? "Couldn't draw this piece" : null}
                      />
                    </div>
                    <div className="lp-piece__meta">
                      <SpecLabel className="lp-piece__code">{m.garment.styleCode}</SpecLabel>
                      <h3 className="lp-piece__name">{p?.name || m.garment.name}</h3>
                      {m.garment.spec && <p className="lp-piece__spec">{m.garment.spec}</p>}
                      {p && <SpecLabel className="lp-piece__price" k="From" v={`${usd(p.price)}`} />}
                    </div>
                  </li>
                );
              })}
        </ul>
        {!loading && !n && <p className="lp-drop__empty">The garment mockups didn't load. Reload the page, or open the Collection step to try again.</p>}

        <div className="lp-drop__foot">
          <p className="lp-drop__note">Mockups use your logo and team colors. Prices are per piece, decoration included.</p>
          <Button variant="secondary" iconRight={<ArrowRight aria-hidden="true" />} onClick={() => navigate("collection")}>
            Open the collection
          </Button>
        </div>
      </div>
    </section>
  );
}

export default Lookbook;
