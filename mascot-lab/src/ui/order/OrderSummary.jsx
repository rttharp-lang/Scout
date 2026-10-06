// OrderSummary — the running receipt: per-garment units × price, subtotal, volume
// discount with a tier meter and the next-tier hint, total, the minimum-order gate and
// lead time. Sticky beside the roster on desktop; a bottom bar on smaller screens.
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { Button, CanvasImage, SpecLabel, cx } from "../components/index.js";
import { ALL_SIZES, LEAD_TIME, MIN_ORDER_UNITS, PROOF_TIME, VOLUME_TIERS } from "../../order/catalog.js";
import { UNSIZED, formatMoney, formatPercent, tierHint } from "../../order/pricing.js";
import { plural, productName } from "./util.js";

const STOPS = [0, 24, 48, 96, 144];
function meterPos(u) {
  const n = Math.max(0, u);
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (n < STOPS[i + 1]) return ((i + (n - STOPS[i]) / (STOPS[i + 1] - STOPS[i])) / (STOPS.length - 1)) * 100;
  }
  return 100;
}

/** TierMeter — where the order sits on the volume tiers (and the minimum). */
export function TierMeter({ units }) {
  const tiers = VOLUME_TIERS.filter((t) => t.off > 0);
  return (
    <div className="ord-meter" aria-hidden="true">
      <div className="ord-meter__track">
        <span className="ord-meter__fill" style={{ width: `${meterPos(units)}%` }} />
        <span className={cx("ord-meter__min", units >= MIN_ORDER_UNITS && "is-met")} style={{ left: `${meterPos(MIN_ORDER_UNITS)}%` }} />
        {tiers.map((t) => <span key={t.min} className={cx("ord-meter__tick", units >= t.min && "is-met")} style={{ left: `${meterPos(t.min)}%` }} />)}
      </div>
      <div className="ord-meter__labels">
        <span style={{ left: `${meterPos(MIN_ORDER_UNITS)}%` }} className={cx(units >= MIN_ORDER_UNITS && "is-met")}>Min {MIN_ORDER_UNITS}</span>
        {tiers.map((t) => (
          <span key={t.min} style={{ left: `${meterPos(t.min)}%` }} className={cx(units >= t.min && "is-met")}>
            {t.min}<b>−{formatPercent(t.off)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function sizeLine(q) {
  if (!q) return "";
  const parts = ALL_SIZES.filter((z) => q[z]).map((z) => `${z} ${q[z]}`);
  if (q[UNSIZED]) parts.push(`${UNSIZED} ${q[UNSIZED]}`);
  return parts.join(" · ");
}

/** useScrollCue(ref) → adds is-scroll / is-end on a scrollable list (for the fade). */
function useScrollCue(ref, deps) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const scroll = el.scrollHeight > el.clientHeight + 2;
      el.classList.toggle("is-scroll", scroll);
      el.classList.toggle("is-end", scroll && el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); window.removeEventListener("resize", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function OrderSummary({ t, q, ids, byId, mockups = {}, blockers = [], warnings = [], onContinue, continueLabel = "Review order", locked = false, summaryRef }) {
  const hint = tierHint(t.units);
  const linesRef = useRef(null);
  useScrollCue(linesRef, [ids.length]);
  return (
    <section className="ord-summary" aria-labelledby="ord-sum-h" ref={summaryRef}>
      <header className="ord-summary__head">
        <h2 id="ord-sum-h">Order summary</h2>
        <SpecLabel>{plural(t.units, "item")} · {plural(t.players, "player")}</SpecLabel>
      </header>

      {ids.length === 0 ? (
        <p className="muted small">No garments in the kit yet.</p>
      ) : (
        <ul className="ord-lines" role="list" ref={linesRef} tabIndex={0} aria-label="Garments in the order">
          {t.lines.map((l) => {
            const m = mockups[l.garmentId]?.front;
            return (
              <li key={l.garmentId} className={cx("ord-line", !l.units && "is-zero")}>
                <CanvasImage canvas={m || null} ratio={1} stage="none" padding={0.04} className="ord-line__thumb ord-gstage" alt="" />
                <div className="ord-line__main">
                  <span className="ord-line__name">{productName(l.garmentId, byId[l.garmentId])}</span>
                  <span className="ord-line__calc">{l.units} × {formatMoney(l.price)}</span>
                  {l.units > 0 && <span className="ord-line__sizes">{sizeLine(q[l.garmentId])}</span>}
                </div>
                <span className="ord-line__amt">{formatMoney(l.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="ord-money">
        <div><dt>Subtotal</dt><dd>{formatMoney(t.subtotal)}</dd></div>
        <div className={cx(!t.discount && "is-muted")}>
          <dt>Volume discount{t.discount ? ` · ${formatPercent(t.tier.off)}` : ""}</dt>
          <dd>{t.discount ? `−${formatMoney(t.discount)}` : "$0"}</dd>
        </div>
        <div className="is-muted"><dt>Printing &amp; setup</dt><dd>{t.decorationFee ? formatMoney(t.decorationFee) : "Included"}</dd></div>
      </dl>

      <TierMeter units={t.units} />
      <p className={cx("ord-hint", !hint && "is-top")}>
        {hint || `Top volume tier: ${formatPercent(t.tier.off)} off the whole order.`}
        {hint && t.discount > 0 && <span> You're saving {formatMoney(t.discount)} now.</span>}
      </p>

      <div className="ord-total">
        <span>Estimated total</span>
        <strong>{formatMoney(t.total)}</strong>
      </div>
      {t.players > 0 && <p className="ord-kit small muted">Full kit per player {formatMoney(t.kitPrice)} before discount.</p>}

      {blockers.length > 0 && (
        <ul className="ord-block" role="list">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {warnings.length > 0 && blockers.length === 0 && (
        <ul className="ord-warn" role="list">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {onContinue && (
        <Button variant="team" size="lg" block onClick={onContinue} disabled={blockers.length > 0 || locked} iconRight={<ArrowRight aria-hidden="true" />}>
          {continueLabel}
        </Button>
      )}
      <p className="ord-lead">
        <Clock aria-hidden="true" />
        <span>Proof in {PROOF_TIME}. Production: {LEAD_TIME}. Prices are estimates until you approve the proof.</span>
      </p>
    </section>
  );
}

/** MobileBar — total + continue, fixed to the bottom while the full summary is off screen. */
export function MobileBar({ t, blocked, reason, onContinue, watchRef, locked }) {
  const [hidden, setHidden] = useState(false);
  const io = useRef(null);
  useEffect(() => {
    const el = watchRef?.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    io.current = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0.15 });
    io.current.observe(el);
    return () => io.current?.disconnect();
  }, [watchRef]);
  return (
    <div className={cx("ord-bar", hidden && "is-hidden")} aria-hidden={hidden || undefined}>
      <div className="ord-bar__inner">
        <div className="ord-bar__total">
          <strong>{formatMoney(t.total)}</strong>
          <span>{blocked && reason ? reason : `${plural(t.units, "item")}${t.discount ? ` · ${formatPercent(t.tier.off)} off` : ""}`}</span>
        </div>
        <Button variant="team" onClick={onContinue} disabled={blocked || locked} tabIndex={hidden ? -1 : undefined} iconRight={<ArrowRight aria-hidden="true" />}>Review order</Button>
      </div>
    </div>
  );
}

export default OrderSummary;
