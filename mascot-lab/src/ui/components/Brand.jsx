import React from "react";
import { cx } from "./cx.js";
import "./components.css";

/**
 * RegMark — retired with the spec-sheet look. Kept so existing imports don't break;
 * renders nothing. Don't use it in new code.
 */
// eslint-disable-next-line no-unused-vars
export function RegMark(_props) {
  return null;
}

/**
 * Mark — the crest monogram: a team shield with an M cut through it. Ink only
 * (currentColor); the knockout shows whatever is behind it.
 */
export function Mark({ className, title }) {
  return (
    <svg
      className={cx("ml-wordmark__mark", className)}
      viewBox="0 0 30 34"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3.6 1h22.8A2.6 2.6 0 0 1 29 3.6v14.2c0 6.9-5.1 11.9-14 15.2C6.1 29.7 1 24.7 1 17.8V3.6A2.6 2.6 0 0 1 3.6 1Zm4.3 7.4v15.3h3.7v-8.8l3.4 4.6 3.4-4.6v8.8h3.7V8.4h-3.3L15 13.9 11.2 8.4H7.9Z"
      />
    </svg>
  );
}

/**
 * Wordmark — crest mark + MASCOT LAB in the wide display face ("LAB" in the light
 * weight). size: "sm" | "md" | "lg" | "xl". href (default "#home"); href={null} for
 * plain text. mark={false} drops the crest. (`reg` is accepted and ignored.)
 */
// eslint-disable-next-line no-unused-vars
export function Wordmark({ size = "md", href = "#home", mark = true, reg, className, ...rest }) {
  const inner = (
    <>
      {mark && <Mark />}
      <span className="ml-wordmark__type" aria-hidden="true">
        Mascot<span className="ml-wordmark__lab">Lab</span>
      </span>
    </>
  );
  const cls = cx("ml-wordmark", size !== "md" && `ml-wordmark--${size}`, className);
  if (href == null) return <span className={cls} role="img" aria-label="Mascot Lab" {...rest}>{inner}</span>;
  return <a className={cls} href={href} aria-label="Mascot Lab — home" {...rest}>{inner}</a>;
}

export default Wordmark;
