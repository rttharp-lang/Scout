import React, { forwardRef } from "react";
import { cx } from "./cx.js";
import "./components.css";

export function Spinner({ className, label }) {
  return <span className={cx("ml-spinner", className)} role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

/**
 * Button — variant: "primary" | "secondary" | "ghost" | "danger" | "team";
 * size: "sm" | "md" | "lg"; icon / iconRight: a lucide icon element;
 * loading: shows a spinner, disables, sets aria-busy. Pass `href` to render a link
 * (bare hash routes like "#studio" are fine).
 */
export const Button = forwardRef(function Button(
  { variant = "primary", size = "md", icon = null, iconRight = null, loading = false, block = false,
    disabled = false, href, type = "button", className, children, onClick, ...rest },
  ref,
) {
  const cls = cx("ml-btn", `ml-btn--${variant}`, size !== "md" && `ml-btn--${size}`, block && "ml-btn--block", loading && "is-loading", className);
  const inner = (
    <>
      {loading ? <Spinner /> : icon}
      {children != null && <span className="ml-btn__label">{children}</span>}
      {!loading && iconRight}
    </>
  );
  if (href !== undefined) {
    const inert = disabled || loading;
    return (
      <a
        ref={ref}
        href={inert ? undefined : href}
        className={cls}
        aria-disabled={inert || undefined}
        aria-busy={loading || undefined}
        onClick={inert ? (e) => e.preventDefault() : onClick}
        {...rest}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      {...rest}
    >
      {inner}
    </button>
  );
});

export default Button;
