import React from "react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * Skeleton — loading placeholder. variant: "rect" | "square" | "text".
 * lines (text): number of lines; the last one is shorter.
 */
export function Skeleton({ variant = "rect", width, height, radius, lines = 1, className, style }) {
  if (variant === "text" && lines > 1) {
    return (
      <span className={cx("ml-skel-lines", className)} aria-hidden="true" style={style}>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ml-skel ml-skel--text" style={{ width: i === lines - 1 ? "62%" : "100%" }} />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx("ml-skel", variant !== "rect" && `ml-skel--${variant}`, className)}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export default Skeleton;
