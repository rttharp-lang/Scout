import React from "react";
import { Check } from "lucide-react";
import { STEPS } from "../../brand.js";
import { cx } from "./cx.js";
import "./components.css";

const pad = (n) => String(n).padStart(2, "0");

/**
 * StepNav — the 3-step flow (1 Remix → 2 Collection → 3 Order).
 * current: 0 (before the flow) … 3; 4 = finished (all done).
 * variant: "full" (numbered links) | "compact" (Step n of 3 + ticks, for phones).
 */
export function StepNav({ current = 0, steps = STEPS, variant = "full", className }) {
  const state = (n) => (n < current ? "done" : n === current ? "current" : "todo");
  if (variant === "compact") {
    const s = steps.find((x) => x.n === current);
    const text = current >= 1 && current <= steps.length ? `Step ${current} of ${steps.length}` : current > steps.length ? "Complete" : `${steps.length} steps`;
    return (
      <nav className={cx("ml-steps", "ml-steps--compact", className)} aria-label="Progress">
        <div className="ml-steps__compact-text">
          <span className="ml-steps__compact-n">{text}</span>
          {s && <span className="ml-steps__compact-label">{s.label}</span>}
        </div>
        <div className="ml-steps__ticks" aria-hidden="true">
          {steps.map((x) => <span key={x.n} className={cx("ml-steps__tick", `is-${state(x.n)}`)} />)}
        </div>
      </nav>
    );
  }
  return (
    <nav className={cx("ml-steps", className)} aria-label="Progress">
      <ol className="ml-steps__list">
        {steps.map((x) => {
          const st = state(x.n);
          return (
            <li key={x.n} className={cx("ml-steps__item", `is-${st}`)}>
              <a className="ml-steps__link" href={`#${x.route}`} aria-current={st === "current" ? "step" : undefined} title={x.hint}>
                <span className="ml-steps__num" aria-hidden="true">{st === "done" ? <Check /> : pad(x.n)}</span>
                <span className="ml-steps__label">{x.label}</span>
                <span className="visually-hidden">{st === "done" ? " (done)" : st === "current" ? " (current step)" : ""}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default StepNav;
