// "How it works": Remix → Collection → Order, each with a small live visual built
// from the same renders as the rest of the page (shared cache, rendered when in view).
import React, { useMemo, useRef } from "react";
import { CanvasImage, SpecLabel, cx } from "../components/index.js";
import { ALL_SIZES } from "../../order/catalog.js";
import { SectionHead } from "./SectionHead.jsx";
import { STEPS } from "./copy.js";
import { useArt, useInView, useLanding, useMockups } from "./hooks.js";
import { PRIORITY, effectView, isCanvas } from "./renders.js";
import { collectionGarments, currentLook, pickCycle } from "./picks.js";

export function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref);
  return (
    <section className="lp-section lp-how" aria-labelledby="lp-how-title" ref={ref}>
      <div className="container">
        <SectionHead
          n="01"
          kicker="How it works"
          aside="Remix · Collection · Order"
          id="lp-how-title"
          title="Three steps. No designer."
          lead="You bring the logo. Mascot Lab does the design work, and you approve a proof of every piece before anything prints."
        />
        <ol className="lp-steps" role="list">
          {STEPS.map((s, i) => (
            <li key={s.n} className="lp-step">
              <div className="lp-step__visual">
                {i === 0 && <RemixVisual active={inView} />}
                {i === 1 && <KitVisual active={inView} />}
                {i === 2 && <SizeRunVisual />}
              </div>
              <div className="lp-step__text">
                <div className="lp-step__head">
                  <span className="lp-step__n" aria-hidden="true">{s.n}</span>
                  <h3 className="lp-step__title"><span className="visually-hidden">Step {i + 1}: </span>{s.title}</h3>
                </div>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Contact sheet: the logo in, five looks out. */
function RemixVisual({ active }) {
  const { state, effects, logo } = useLanding();
  const looks = useMemo(() => pickCycle(effects, state.effect.id, 5), [effects, state.effect.id]);
  const arts = useArt(
    looks.map((e) => ({ effect: e, params: e.id === state.effect.id ? state.effect.params : {}, seed: state.effect.seed, priority: PRIORITY.steps })),
    active,
  );
  const slots = effects === null ? Array.from({ length: 5 }, () => null) : arts;
  return (
    <div className="lp-remix">
      <figure className="lp-remix__cell lp-remix__cell--in">
        <CanvasImage canvas={logo.canvas} stage="paper" ratio={1} padding={0.06} alt="Your logo" />
        <SpecLabel variant="solid" className="lp-remix__tag">In</SpecLabel>
      </figure>
      {slots.map((a, i) => (
        <figure key={a?.key || i} className="lp-remix__cell">
          <CanvasImage canvas={isCanvas(a?.result) ? a.result : null} stage={a?.effect.stage || "paper"} ratio={1} alt={a ? `${a.effect.name} effect` : ""} error={a?.result instanceof Error ? "Unavailable" : null} />
          {a && <figcaption className="lp-remix__name">{a.effect.name}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** Three pieces of the kit wearing the current look, fanned out. */
function KitVisual({ active }) {
  const { state, effects, garments } = useLanding();
  const look = currentLook(effects, state.effect);
  const original = effects?.find((e) => e.id === "original") || null;
  const [art] = useArt([look.effect && { effect: look.effect, params: look.params, seed: look.seed, priority: PRIORITY.steps }], active);
  const [clean] = useArt([original && { effect: original, priority: PRIORITY.clean }], active);
  const pieces = collectionGarments(garments, state.collection).slice(0, 3);
  const mocks = useMockups(
    pieces.map((g) => {
      const item = state.collection.items[g.id];
      return { garment: g, view: effectView(item), item, art, clean: clean || null, priority: PRIORITY.steps };
    }),
    active,
  );
  const slots = garments === null ? [null, null, null] : mocks;
  return (
    <div className={cx("lp-kit", `lp-kit--n${Math.max(1, slots.length)}`)}>
      {slots.map((m, i) => (
        <div key={m?.garment.id || i} className="lp-kit__piece">
          <CanvasImage canvas={isCanvas(m?.result) ? m.result : null} stage="none" ratio={1} alt={m ? `${m.garment.name}, ${m.view}` : ""} />
        </div>
      ))}
      {garments && !slots.length && <p className="lp-kit__empty">The garment mockups didn't load. Reload the page to try again.</p>}
    </div>
  );
}

/** The roster's size run (tops), from the order page's roster. */
function SizeRunVisual() {
  const { state } = useLanding();
  const rows = (state.roster || []).filter(Boolean);
  const counts = ALL_SIZES.map((s) => rows.filter((r) => r.top === s).length);
  const max = Math.max(1, ...counts);
  const example = rows.some((r) => r.example);
  const summary = ALL_SIZES.map((s, i) => (counts[i] ? `${s}: ${counts[i]}` : null)).filter(Boolean).join(", ");
  return (
    <figure className="lp-run">
      <div className="lp-run__head">
        <SpecLabel k="Size run" v="Tops" />
        <SpecLabel>{rows.length} {rows.length === 1 ? "player" : "players"}{example ? " · example" : ""}</SpecLabel>
      </div>
      <div className="lp-run__plot" role="img" aria-label={`Tops by size for ${rows.length} players. ${summary || "No sizes yet."}`}>
        {ALL_SIZES.map((s, i) => (
          <div key={s} className={cx("lp-run__col", counts[i] === 0 && "is-zero")} title={`${s}: ${counts[i]}`}>
            <span className="lp-run__track">
              {counts[i] > 0 && (
                <span className="lp-run__bar" style={{ height: `${(counts[i] / max) * 100}%` }}>
                  <span className="lp-run__val">{counts[i]}</span>
                </span>
              )}
            </span>
            <span className="lp-run__size">{s}</span>
          </div>
        ))}
      </div>
      <figcaption className="lp-run__foot">
        <SpecLabel>Youth</SpecLabel>
        <SpecLabel>Adult</SpecLabel>
      </figcaption>
    </figure>
  );
}

export default HowItWorks;
