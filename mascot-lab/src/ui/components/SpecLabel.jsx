import React from "react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * SpecLabel — the spec-sheet mono label: style codes, hex codes, sizes, print methods.
 *   <SpecLabel>ML-J01</SpecLabel>
 *   <SpecLabel k="Style" v="ML-J01" variant="box" />
 * variant: "plain" | "box" | "solid" | "team" | "warning" | "success"; size: "md" | "lg";
 * wrap: allow line breaks (long legal lines).
 */
export function SpecLabel({ k, v, children, variant = "plain", size = "md", wrap = false, as: Tag = "span", className, ...rest }) {
  return (
    <Tag className={cx("ml-spec", variant !== "plain" && `ml-spec--${variant}`, size === "lg" && "ml-spec--lg", wrap && "ml-spec--wrap", className)} {...rest}>
      {k != null && <span className="ml-spec__k">{k}</span>}
      {v != null ? <span className="ml-spec__v">{v}</span> : children}
    </Tag>
  );
}

export default SpecLabel;
