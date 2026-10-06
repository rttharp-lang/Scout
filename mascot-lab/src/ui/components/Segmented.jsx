import React, { useRef } from "react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * Segmented — single choice from a few options (radiogroup, roving tabindex,
 * arrow keys / Home / End). options: [{ value, label, icon?, disabled? }].
 * size: "sm" | "md"; mono: spec-style labels; block: stretch to full width.
 */
export function Segmented({ options = [], value, onChange, label, size = "md", mono = false, block = false, className, ...rest }) {
  const refs = useRef([]);
  const enabled = options.map((o, i) => (!o.disabled ? i : -1)).filter((i) => i >= 0);
  const cur = options.findIndex((o) => o.value === value);
  const move = (from, dir) => {
    if (!enabled.length) return;
    let pos = enabled.indexOf(from);
    if (pos < 0) pos = 0;
    const next = dir === "first" ? enabled[0] : dir === "last" ? enabled[enabled.length - 1] : enabled[(pos + dir + enabled.length) % enabled.length];
    onChange?.(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("ml-seg", size === "sm" && "ml-seg--sm", mono && "ml-seg--mono", block && "ml-seg--block", className)}
      {...rest}
    >
      {options.map((o, i) => {
        const on = i === cur;
        return (
          <button
            key={String(o.value)}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (cur < 0 && i === enabled[0]) ? 0 : -1}
            disabled={o.disabled}
            className="ml-seg__opt"
            title={o.title}
            onClick={() => onChange?.(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
              else if (e.key === "Home") { e.preventDefault(); move(i, "first"); }
              else if (e.key === "End") { e.preventDefault(); move(i, "last"); }
            }}
          >
            {o.icon}
            {o.label != null && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
