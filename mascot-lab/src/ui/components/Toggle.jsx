import React, { useId } from "react";
import { cx } from "./cx.js";
import "./components.css";

/** Toggle — a switch (role="switch"). onChange(nextBoolean). block: label left, switch right, full width. */
export function Toggle({ checked = false, onChange, label, description, disabled = false, block = false, className, ...rest }) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      className={cx("ml-toggle", block && "ml-toggle--block", className)}
      onClick={() => onChange?.(!checked)}
      {...rest}
    >
      {block && label && (
        <span className="ml-toggle__text">
          <span className="ml-toggle__label">{label}</span>
          {description && <span className="ml-toggle__desc" id={`${id}-d`}>{description}</span>}
        </span>
      )}
      <span className="ml-toggle__track" aria-hidden="true"><span className="ml-toggle__knob" /></span>
      {!block && label && (
        <span className="ml-toggle__text">
          <span className="ml-toggle__label">{label}</span>
          {description && <span className="ml-toggle__desc" id={`${id}-d`}>{description}</span>}
        </span>
      )}
    </button>
  );
}

export default Toggle;
