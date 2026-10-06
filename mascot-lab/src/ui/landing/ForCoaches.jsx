// "For coaches": who it's for, what you get, and the order spec sheet (minimum, proofs,
// lead time, sizes, prices, volume tiers), all read from src/order/catalog.js.
import React from "react";
import { Check, HeartHandshake, PenOff, Store, Wallet } from "lucide-react";
import { SpecLabel, cx } from "../components/index.js";
import { DECORATION_FEE, LEAD_TIME, MIN_ORDER_UNITS, PROOF_TIME, SIZES } from "../../order/catalog.js";
import { SectionHead } from "./SectionHead.jsx";
import { AUDIENCE, INCLUDED, PRODUCT_LIST, TIERS, pct, tierRange, usd } from "./copy.js";
import { useLanding } from "./hooks.js";

const ICONS = { designer: PenOff, budget: Wallet, boosters: HeartHandshake, store: Store };

export function ForCoaches() {
  const { garments } = useLanding();
  const codeOf = (id) => garments?.find((g) => g.id === id)?.styleCode || null;
  const maxOff = Math.max(...TIERS.map((t) => t.off), 0.01);
  return (
    <section className="lp-section lp-coaches" aria-labelledby="lp-coaches-title">
      <div className="container">
        <SectionHead
          n="04"
          kicker="For coaches"
          aside={`Min. ${MIN_ORDER_UNITS} pcs · Sizes ${SIZES.youth[0]}–${SIZES.adult[SIZES.adult.length - 1]}`}
          id="lp-coaches-title"
          title="Built for programs without a designer."
          lead="Made for head coaches, assistants, athletic directors and booster parents who want gear that looks like a pro drop on a high-school budget."
        />

        <div className="lp-coaches__top">
          <ul className="lp-who" role="list">
            {AUDIENCE.map((a) => {
              const Icon = ICONS[a.id] || Check;
              return (
                <li key={a.id} className="lp-who__item">
                  <span className="lp-who__icon" aria-hidden="true"><Icon /></span>
                  <div>
                    <h3 className="lp-who__title">{a.title}</h3>
                    <p>{a.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="lp-get">
            <h3 className="lp-get__title">What you get</h3>
            <ul className="lp-get__list" role="list">
              {INCLUDED.map((t) => (
                <li key={t}><Check aria-hidden="true" /><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </div>

        <article className="lp-spec" aria-labelledby="lp-spec-title">
          <header className="lp-spec__bar">
            <h3 id="lp-spec-title" className="lp-spec__title">Order spec</h3>
            <SpecLabel>Team orders · Prices in USD</SpecLabel>
          </header>

          <div className="lp-spec__body">
            <dl className="lp-spec__rows">
              <div className="lp-spec__row">
                <dt>Minimum</dt>
                <dd><strong>{MIN_ORDER_UNITS} pieces</strong>, any mix of styles</dd>
              </div>
              <div className="lp-spec__row">
                <dt>Proof</dt>
                <dd><strong>{PROOF_TIME}</strong> after your order request</dd>
              </div>
              <div className="lp-spec__row">
                <dt>Production</dt>
                <dd><strong>{LEAD_TIME}</strong></dd>
              </div>
              <div className="lp-spec__row">
                <dt>Setup fee</dt>
                <dd>{DECORATION_FEE ? <><strong>{usd(DECORATION_FEE)}</strong> per order</> : <><strong>None</strong>, art setup is included</>}</dd>
              </div>
              <div className="lp-spec__row">
                <dt>Sizes</dt>
                <dd className="lp-sizes">
                  <span className="lp-sizes__group">
                    <SpecLabel className="lp-sizes__k">Youth</SpecLabel>
                    {SIZES.youth.map((s) => <span key={s} className="lp-size">{s}</span>)}
                  </span>
                  <span className="lp-sizes__group">
                    <SpecLabel className="lp-sizes__k">Adult</SpecLabel>
                    {SIZES.adult.map((s) => <span key={s} className="lp-size">{s}</span>)}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="lp-spec__block">
              <SpecLabel className="lp-spec__label">Price per piece, decoration included</SpecLabel>
              <table className="lp-prices">
                <thead className="visually-hidden">
                  <tr><th scope="col">Piece</th><th scope="col">Style code</th><th scope="col">Starting price</th></tr>
                </thead>
                <tbody>
                  {PRODUCT_LIST.map((p) => (
                    <tr key={p.garmentId}>
                      <th scope="row">{p.name}</th>
                      <td className="lp-prices__code">{codeOf(p.garmentId) || ""}</td>
                      <td className="lp-prices__price">{usd(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lp-spec__block">
              <SpecLabel className="lp-spec__label">Volume pricing, whole order</SpecLabel>
              <ol className="lp-tiers" role="list">
                {TIERS.map((t) => (
                  <li key={t.min} className={cx("lp-tier", t.off === 0 && "is-base")}>
                    <span className="lp-tier__bar-wrap" aria-hidden="true">
                      <span className="lp-tier__bar" style={{ height: `${Math.max(5, (t.off / maxOff) * 100)}%` }} />
                    </span>
                    <span className="lp-tier__off">{t.off ? `${pct(t.off)} off` : "List"}</span>
                    <SpecLabel className="lp-tier__range">{tierRange(t)} pcs</SpecLabel>
                  </li>
                ))}
              </ol>
              <p className="lp-spec__note">The discount covers every piece once the order reaches the tier. Final pricing is on your proof.</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export default ForCoaches;
