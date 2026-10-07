import React, { useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { STEPS } from "../../brand.js";
import { cx } from "./cx.js";
import "./components.css";

/**
 * StepNav — the 3-step flow (1 Remix → 2 Collection → 3 Order) as minimal tabs with a
 * thin team-coloured indicator that slides to the current step.
 * current: 0 (before the flow) … 3; 4 = finished (all done).
 * variant: "full" (tabs) | "compact" (current step + three segments, for phones).
 */
export function StepNav({ current = 0, steps = STEPS, variant = "full", className }) {
  const state = (n) => (n < current ? "done" : n === current ? "current" : "todo");
  if (variant === "compact") {
    if (current < 1) return null; // before the flow (home, owner inbox): nothing to show
    const s = steps.find((x) => x.n === current);
    const n = current >= 1 && current <= steps.length ? `${current}/${steps.length}` : null;
    const label = s ? s.label : current > steps.length ? "Complete" : null;
    return (
      <nav className={cx("ml-steps", "ml-steps--compact", className)} aria-label="Progress">
        {label && (
          <div className="ml-steps__compact-text">
            <span className="ml-steps__compact-label">{label}</span>
            {n && <span className="ml-steps__compact-n"><span aria-hidden="true">{n}</span><span className="visually-hidden">{`, step ${current} of ${steps.length}`}</span></span>}
          </div>
        )}
        <div className="ml-steps__ticks" aria-hidden="true">
          {steps.map((x) => <span key={x.n} className={cx("ml-steps__tick", `is-${state(x.n)}`)} />)}
        </div>
      </nav>
    );
  }
  return <FullSteps steps={steps} current={current} state={state} className={className} />;
}

function FullSteps({ steps, current, state, className }) {
  const listRef = useRef(null);
  const [ind, setInd] = useState({ x: 0, w: 0, on: false, ready: false });

  // measure the current tab → indicator position; animate only after the first paint
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    let raf = 0;
    const measure = () => {
      const el = list.querySelector('[aria-current="step"]');
      if (!el) { setInd((s) => ({ ...s, on: false })); return; }
      const lb = (list.parentElement || list).getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const pad = 14; // the link's side padding: the bar spans the text, not the hit area
      const next = { x: b.left - lb.left + pad, w: Math.max(0, b.width - pad * 2) };
      setInd((s) => (s.on && Math.abs(s.x - next.x) < 0.5 && Math.abs(s.w - next.w) < 0.5 ? s : { ...s, ...next, on: true }));
      if (!raf) raf = requestAnimationFrame(() => setInd((s) => (s.ready ? s : { ...s, ready: true })));
    };
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(list); }
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => { ro?.disconnect(); cancelAnimationFrame(raf); };
  }, [current, steps]);

  return (
    <nav className={cx("ml-steps", className)} aria-label="Progress">
      <ol className="ml-steps__list" ref={listRef}>
        {steps.map((x) => {
          const st = state(x.n);
          return (
            <li key={x.n} className={cx("ml-steps__item", `is-${st}`)}>
              <a className="ml-steps__link" href={`#${x.route}`} aria-current={st === "current" ? "step" : undefined} title={x.hint}>
                <span className="ml-steps__num" aria-hidden="true">{st === "done" ? <Check /> : x.n}</span>
                <span className="ml-steps__label">{x.label}</span>
                <span className="visually-hidden">{st === "done" ? " (done)" : st === "current" ? " (current step)" : ""}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <span
        className={cx("ml-steps__indicator", ind.on && "is-on", ind.ready && "is-ready")}
        style={{ transform: `translateX(${ind.x}px)`, width: `${ind.w}px` }}
        aria-hidden="true"
      />
    </nav>
  );
}

export default StepNav;
