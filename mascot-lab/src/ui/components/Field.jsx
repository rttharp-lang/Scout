import React, { cloneElement, forwardRef, isValidElement, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * Field — label / hint / error wrapper. The child control gets id, aria-describedby
 * and aria-invalid wired automatically (single element child), or pass a function
 * child: ({ id, describedBy, invalid }) => <input … />.
 */
export function Field({ label, hint, error, required = false, optional = false, id: idProp, className, children, labelExtra }) {
  const autoId = useId();
  const id = idProp || `f${autoId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(" ") || undefined;
  const ctl = { id, describedBy, invalid: !!error };
  let control = children;
  if (typeof children === "function") control = children(ctl);
  else if (isValidElement(children)) {
    control = cloneElement(children, {
      id: children.props.id || id,
      "aria-describedby": children.props["aria-describedby"] || describedBy,
      "aria-invalid": error ? true : children.props["aria-invalid"],
      required: children.props.required ?? (required || undefined),
    });
  }
  return (
    <div className={cx("ml-field", className)}>
      {label && (
        <label className="ml-field__label" htmlFor={id}>
          <span>{label}{required && <span className="ml-field__req" aria-hidden="true"> *</span>}</span>
          {optional && <span className="ml-field__opt">Optional</span>}
          {labelExtra}
        </label>
      )}
      {control}
      {error && (
        <div className="ml-field__error" id={errId} role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {hint && <div className="ml-field__hint" id={hintId}>{hint}</div>}
    </div>
  );
}

/** Input — styled text input (all native props). mono: spec-style uppercase mono. */
export const Input = forwardRef(function Input({ className, mono = false, type = "text", ...rest }, ref) {
  return <input ref={ref} type={type} className={cx("input", mono && "ml-input--mono", className)} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx("input", className)} {...rest} />;
});

export default Field;
