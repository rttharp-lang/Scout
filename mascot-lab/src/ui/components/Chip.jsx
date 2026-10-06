import React from "react";
import { Check } from "lucide-react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * Chip — filter chip / toggle (aria-pressed). selected shows the team accent and a
 * check (unless icon is given). count: optional mono number. size: "sm" | "md".
 */
export function Chip({ selected = false, onClick, icon, count, size = "md", children, className, showCheck = true, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={!!selected}
      onClick={onClick}
      className={cx("ml-chip", size === "sm" && "ml-chip--sm", className)}
      {...rest}
    >
      {icon || (selected && showCheck ? <Check aria-hidden="true" /> : null)}
      <span>{children}</span>
      {count != null && <span className="ml-chip__count">{count}</span>}
    </button>
  );
}

/** ChipRow — wraps chips; scroll: one horizontally scrolling line (mobile filter bars). */
export function ChipRow({ scroll = false, className, children, label, ...rest }) {
  return (
    <div role="group" aria-label={label} className={cx("ml-chiprow", scroll && "ml-chiprow--scroll", className)} {...rest}>
      {children}
    </div>
  );
}

export default Chip;
