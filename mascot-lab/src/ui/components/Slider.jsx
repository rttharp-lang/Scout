import React, { useId } from "react";
import { cx } from "./cx.js";
import "./components.css";

function decimalsOf(step) {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/**
 * Slider — native range (keyboard: arrows, PgUp/PgDn, Home/End) with a label and a
 * mono value readout. onChange(number). `format(v)` overrides the readout text.
 * showScale prints min/max under the track.
 */
export function Slider({
  label, value, min = 0, max = 100, step = 1, unit = "", onChange, onCommit, format,
  disabled = false, showScale = false, hint, id: idProp, className, ...rest
}) {
  const autoId = useId();
  const id = idProp || `s${autoId}`;
  const v = Number.isFinite(Number(value)) ? Number(value) : min;
  const fill = max > min ? ((v - min) / (max - min)) * 100 : 0;
  const dec = decimalsOf(step);
  const text = format ? format(v) : v.toFixed(dec);
  return (
    <div className={cx("ml-slider", disabled && "is-disabled", className)}>
      <div className="ml-slider__head">
        <label className="ml-slider__label" htmlFor={id}>{label}</label>
        <output className="ml-slider__value" htmlFor={id} aria-hidden="true">
          {text}{unit && !format && <span className="ml-slider__unit">{unit}</span>}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        aria-valuetext={`${text}${unit && !format ? ` ${unit}` : ""}`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        style={{ "--fill": `${Math.max(0, Math.min(100, fill))}%` }}
        onChange={(e) => onChange?.(Number(e.target.value))}
        onPointerUp={onCommit ? (e) => onCommit(Number(e.currentTarget.value)) : undefined}
        onKeyUp={onCommit ? (e) => onCommit(Number(e.currentTarget.value)) : undefined}
        {...rest}
      />
      {showScale && (
        <div className="ml-slider__scale" aria-hidden="true">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      )}
      {hint && <div className="ml-field__hint" id={`${id}-hint`}>{hint}</div>}
    </div>
  );
}

export default Slider;
