// Every available effect as a small live tile (name + print method). Tiles render when
// they scroll near the viewport; clicking one picks that effect and opens the Studio.
import React, { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { CanvasImage, SpecLabel, cx, navigate } from "../components/index.js";
import { CATEGORIES } from "../../engine/effects/index.js";
import { SectionHead } from "./SectionHead.jsx";
import { useArt, useInView, useLanding } from "./hooks.js";
import { PRIORITY, isCanvas } from "./renders.js";
import { remixes } from "./picks.js";

/** Columns (6–9) for the wide grid that leave the fullest last row. */
function lookCols(n) {
  if (n <= 6) return 6;
  let best = 8, score = -1;
  for (const c of [8, 7, 9, 6]) {
    const r = n % c;
    const sc = r === 0 ? 1 : r / c;
    if (sc > score + 1e-9) { best = c; score = sc; }
  }
  return best;
}

export function LooksGrid() {
  const { effects, state } = useLanding();
  const list = remixes(effects);
  const methods = new Set(list.map((e) => e.method).filter(Boolean));
  const loading = effects === null;
  const count = list.length;
  return (
    <section className="lp-section lp-looks" aria-labelledby="lp-looks-title">
      <div className="container">
        <SectionHead
          n="02"
          kicker="The looks"
          aside={loading ? "Loading effects" : `${count} ${count === 1 ? "effect" : "effects"} · ${methods.size} print ${methods.size === 1 ? "method" : "methods"}`}
          id="lp-looks-title"
          title="Pick a look. Tap to start."
          lead="Every look is labeled with how it gets made on the garment, from screen print to chenille patch. Tap one to open it in the Studio with your logo."
        />
        <ul className="lp-looks__grid" role="list" style={{ "--look-cols": lookCols(loading ? 16 : count) }}>
          {loading
            ? Array.from({ length: 12 }, (_, i) => (
                <li key={i} className="lp-look is-skeleton" aria-hidden="true">
                  <CanvasImage canvas={null} ratio={1} />
                  <span className="lp-look__meta"><span className="lp-look__name">&nbsp;</span></span>
                </li>
              ))
            : list.map((e) => <LookTile key={e.id} effect={e} current={e.id === state.effect.id} />)}
        </ul>
      </div>
    </section>
  );
}

function LookTile({ effect, current }) {
  const { state, actions } = useLanding();
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: "160px 0px" });
  const [art] = useArt(
    [{ effect, params: current ? state.effect.params : {}, seed: state.effect.seed, priority: PRIORITY.visible }],
    inView,
  );
  const cat = CATEGORIES.find((c) => c.id === effect.category);
  const pick = () => { actions.setEffect(effect.id); navigate("studio"); };
  return (
    <li className={cx("lp-look", current && "is-current")} ref={ref}>
      <button type="button" className="lp-look__btn" onClick={pick} aria-label={`${effect.name}, ${effect.method}. Open in the Studio`}>
        <span className="lp-look__art">
          <CanvasImage
            canvas={isCanvas(art?.result) ? art.result : null}
            stage={effect.stage}
            ratio={1}
            alt=""
            error={art?.result instanceof Error ? "Unavailable" : null}
          />
          {current && <SpecLabel variant="team" className="lp-look__flag">Your pick</SpecLabel>}
          <span className="lp-look__go" aria-hidden="true"><ArrowUpRight /></span>
        </span>
        <span className="lp-look__meta">
          <span className="lp-look__name">{effect.name}</span>
          <SpecLabel className="lp-look__method">{effect.method || cat?.label}</SpecLabel>
        </span>
      </button>
    </li>
  );
}

export default LooksGrid;
