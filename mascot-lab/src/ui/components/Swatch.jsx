import React from "react";
import { Check } from "lucide-react";
import { cx } from "./cx.js";
import "./components.css";

function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#0B0D10" : "#FFFFFF";
}

/**
 * Swatch — a colour chip with optional name + hex. Renders a toggle button when
 * onClick is given (selected → aria-pressed + ring + check).
 * size: "xs" | "sm" | "md" | "lg" | "xl"; shape: "square" | "round".
 */
export function Swatch({ color, name, showHex = false, size = "md", shape = "square", selected, onClick, label, className, ...rest }) {
  const hex = (color || "").toUpperCase();
  const Tag = onClick ? "button" : "span";
  const a11y = onClick
    ? { type: "button", onClick, "aria-pressed": selected === undefined ? undefined : !!selected, "aria-label": label || `${name ? name + " " : ""}${hex}`, title: label || (name ? `${name} · ${hex}` : hex) }
    : name || showHex ? {} : { role: "img", "aria-label": label || hex };
  return (
    <Tag
      className={cx("ml-swatch", size !== "md" && `ml-swatch--${size}`, shape === "round" && "ml-swatch--round", selected && "is-selected", className)}
      style={{ "--sw-color": color, "--sw-ink": inkFor(color) }}
      {...a11y}
      {...rest}
    >
      <span className="ml-swatch__chip" aria-hidden="true">{selected && onClick && size !== "xs" ? <Check /> : null}</span>
      {(name || showHex) && (
        <span className="ml-swatch__text">
          {name && <span className="ml-swatch__name">{name}</span>}
          {showHex && <span className="ml-swatch__hex">{hex}</span>}
        </span>
      )}
    </Tag>
  );
}

export { inkFor };
export default Swatch;
