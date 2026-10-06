import React, { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * NumberStepper — − [n] + for quantities. Type a number, use the buttons, or
 * ArrowUp/ArrowDown (Shift = ×10). `label` names the quantity for screen readers.
 */
export function NumberStepper({ value = 0, onChange, min = 0, max = 999, step = 1, label = "Quantity", size = "md", disabled = false, id, className }) {
  const v = Number.isFinite(Number(value)) ? Number(value) : min;
  const [text, setText] = useState(String(v));
  useEffect(() => setText(String(v)), [v]);
  const clamp = (n) => Math.max(min, Math.min(max, Math.round(n / step) * step));
  const set = (n) => { const c = clamp(n); if (c !== v) onChange?.(c); else setText(String(v)); };
  const commit = () => {
    const n = parseInt(text, 10);
    set(Number.isFinite(n) ? n : v);
  };
  return (
    <div className={cx("ml-stepper", size === "sm" && "ml-stepper--sm", v === 0 && "is-zero", className)} role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || v <= min} onClick={() => set(v - step)} tabIndex={-1}>
        <Minus aria-hidden="true" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        role="spinbutton"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={v}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          const k = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowUp") { e.preventDefault(); set(v + step * k); }
          else if (e.key === "ArrowDown") { e.preventDefault(); set(v - step * k); }
          else if (e.key === "Enter") commit();
        }}
      />
      <button type="button" aria-label={`Increase ${label}`} disabled={disabled || v >= max} onClick={() => set(v + step)} tabIndex={-1}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

export default NumberStepper;
