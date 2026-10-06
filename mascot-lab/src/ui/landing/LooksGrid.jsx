// Every available effect as a small live tile (name + print method). Tiles render when
// they scroll near the viewport; clicking one picks that effect and opens the Studio.
import React, { useRef } from "react";
import { ArrowRight, ArrowUpRight, SlidersHorizontal, Upload } from "lucide-react";
import { CanvasImage, SpecLabel, Spinner, cx, navigate } from "../components/index.js";
import { CATEGORIES } from "../../engine/effects/index.js";
import { SectionHead } from "./SectionHead.jsx";
import { useArt, useInView, useLanding } from "./hooks.js";
import { PRIORITY, isCanvas } from "./renders.js";
import { remixes } from "./picks.js";

/**
 * Column counts per breakpoint (must match landing.css): wide ≥1181 px, md 861–1180,
 * sm 601–860, phone ≤600. Rows always fill: the cells left over on the last row become
 * one "your logo here" slot spanning them, and phones show PHONE_CAP tiles plus a
 * "more looks" tile so the grid stays 4 rows instead of 8.
 */
const COLS = { xl: 8, md: 6, sm: 4, xs: 3 };
const PHONE_CAP = 11; // + the "more" tile = 12 = 4 rows of 3
const leftover = (n, c) => (c - (n % c)) % c;

export function LooksGrid({ onUpload, uploading = false }) {
  const { effects, state } = useLanding();
  const list = remixes(effects);
  const methods = new Set(list.map((e) => e.method).filter(Boolean));
  const loading = effects === null;
  const count = list.length;
  const capped = !loading && count > PHONE_CAP + 1;
  const phoneShown = capped ? PHONE_CAP + 1 : count; // the "more" tile counts as a cell
  // per breakpoint: how many cells the "your logo here" slot spans, and whether it shows
  const fill = {};
  for (const [bp, n] of [["xl", count], ["md", count], ["sm", count], ["xs", phoneShown]]) {
    const span = leftover(n, COLS[bp]);
    fill[`--fill-${bp}`] = Math.max(1, span);
    fill[`--fill-${bp}-d`] = span ? "block" : "none";
  }
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
        <ul className={cx("lp-looks__grid", capped && "is-capped")} role="list" style={fill}>
          {loading
            ? Array.from({ length: 24 }, (_, i) => (
                <li key={i} className={cx("lp-look is-skeleton", i >= 12 && "lp-look--extra")} aria-hidden="true">
                  <CanvasImage canvas={null} ratio={1} />
                  <span className="lp-look__meta"><span className="lp-look__name">&nbsp;</span></span>
                </li>
              ))
            : list.map((e, i) => (
                <LookTile key={e.id} effect={e} current={e.id === state.effect.id} extra={capped && i >= PHONE_CAP} />
              ))}
          {!loading && count > 0 && (
            <li className="lp-look lp-look--fill">
              <FillTile isSample={state.team.isSample} count={count} onUpload={onUpload} busy={uploading} />
            </li>
          )}
          {capped && (
            <li className="lp-look lp-look--more">
              <button type="button" className="lp-more" onClick={() => navigate("studio")}>
                <span className="lp-more__n">+{count - PHONE_CAP}</span>
                <span className="lp-more__t">more looks</span>
                <SpecLabel className="lp-more__go">All {count} in the Studio <ArrowRight aria-hidden="true" /></SpecLabel>
              </button>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

/** The slot that fills the last row: upload your own logo (or, after an upload, open the Studio). */
function FillTile({ isSample, count, onUpload, busy = false }) {
  const upload = isSample && typeof onUpload === "function";
  return (
    <button type="button" className="lp-slot" onClick={upload ? onUpload : () => navigate("studio")} disabled={busy} aria-busy={busy || undefined}>
      <span className="lp-slot__icon" aria-hidden="true">{busy ? <Spinner /> : upload ? <Upload /> : <SlidersHorizontal />}</span>
      <span className="lp-slot__title">{upload ? "Your logo here" : "Fine-tune a look"}</span>
      <span className="lp-slot__body">
        {upload
          ? `Upload it and all ${count} looks redraw with your mark.`
          : "Open the Studio to change colors and settings on any look."}
      </span>
      <SpecLabel className="lp-slot__cta">{busy ? "Reading your logo" : upload ? "Upload your logo" : "Open the Studio"} <ArrowRight aria-hidden="true" /></SpecLabel>
    </button>
  );
}

function LookTile({ effect, current, extra = false }) {
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
    <li className={cx("lp-look", current && "is-current", extra && "lp-look--extra")} ref={ref}>
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
