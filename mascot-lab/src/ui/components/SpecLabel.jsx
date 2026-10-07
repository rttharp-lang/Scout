import React from "react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * SpecLabel — quiet metadata text (12 px sans, ink-2; no caps, no tracking), or a small
 * pill badge. Pass `mono` for real codes (hex, style codes, sizes) — the only mono use.
 *   <SpecLabel>Screen print</SpecLabel>
 *   <SpecLabel mono>ML-J01</SpecLabel>
 *   <SpecLabel k="Style" v="ML-J01" />
 * variant: "plain" | "box" (tile pill) | "solid" (ink pill) | "team" | "warning" | "success";
 * size: "md" (12 px) | "lg" (14 px); wrap: allow line breaks (long legal lines).
 */
export function SpecLabel({ k, v, children, variant = "plain", size = "md", mono = false, wrap = false, as: Tag = "span", className, ...rest }) {
  return (
    <Tag className={cx("ml-spec", variant !== "plain" && `ml-spec--${variant}`, size === "lg" && "ml-spec--lg", mono && "ml-spec--mono", wrap && "ml-spec--wrap", className)} {...rest}>
      {k != null && <span className="ml-spec__k">{k}</span>}
      {v != null ? <span className="ml-spec__v">{v}</span> : children}
    </Tag>
  );
}

export default SpecLabel;
