import React, { forwardRef } from "react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * IconButton — square, icon-only. `label` is required (aria-label + tooltip).
 * variant: "ghost" | "secondary" | "primary"; size: "sm" | "md" | "lg";
 * pressed: true/false renders a toggle button (aria-pressed).
 */
export const IconButton = forwardRef(function IconButton(
  { label, icon, children, variant = "ghost", size = "md", pressed, title, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      className={cx("ml-iconbtn", `ml-iconbtn--${variant}`, size !== "md" && `ml-iconbtn--${size}`, className)}
      {...rest}
    >
      {icon || children}
    </button>
  );
});

export default IconButton;
