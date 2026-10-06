import React from "react";
import { Field } from "./Field.jsx";
import "./components.css";

/**
 * Select — labelled native <select>. options: [{ value, label, disabled? }] or strings.
 * onChange(value) receives the option's original value (numbers stay numbers).
 */
export function Select({ label, value, options = [], onChange, hint, error, id, disabled, placeholder, className, ...rest }) {
  const opts = options.map((o) => (typeof o === "object" ? o : { value: o, label: String(o) }));
  const idx = opts.findIndex((o) => o.value === value);
  const control = (
    <select
      value={idx >= 0 ? String(idx) : ""}
      disabled={disabled}
      onChange={(e) => {
        const o = opts[Number(e.target.value)];
        if (o) onChange?.(o.value);
      }}
      {...rest}
    >
      {(idx < 0 || placeholder) && <option value="" disabled>{placeholder || "Choose…"}</option>}
      {opts.map((o, i) => (
        <option key={i} value={String(i)} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
  if (!label) return control;
  return <Field label={label} hint={hint} error={error} id={id} className={className}>{control}</Field>;
}

export default Select;
