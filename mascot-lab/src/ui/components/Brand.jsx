import React from "react";
import { cx } from "./cx.js";
import "./components.css";

/** RegMark — the printer's registration target (circle + crosshair), drawn inline. */
export function RegMark({ size = 14, className, strokeWidth = 1.25, title }) {
  return (
    <svg
      className={cx("ml-reg", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth * (24 / size)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 0v24M0 12h24" />
    </svg>
  );
}

/**
 * Wordmark — MASCOT [LAB]: heavy condensed caps, LAB knocked out of an ink tag with
 * a one-colour "misregistration" offset in the team's second colour (screen-print nod).
 * size: "sm" | "md" | "lg" | "xl". href (default "#home"); pass href={null} for plain text.
 */
export function Wordmark({ size = "md", href = "#home", reg = false, className, ...rest }) {
  const inner = (
    <>
      <span className="ml-wordmark__mascot">Mascot</span>
      <span className="ml-wordmark__lab">Lab</span>
      {reg && <RegMark className="ml-wordmark__reg" size={12} />}
    </>
  );
  const cls = cx("ml-wordmark", size !== "md" && `ml-wordmark--${size}`, className);
  if (href == null) return <span className={cls} aria-label="Mascot Lab" {...rest}>{inner}</span>;
  return <a className={cls} href={href} aria-label="Mascot Lab — home" {...rest}>{inner}</a>;
}

export default Wordmark;
