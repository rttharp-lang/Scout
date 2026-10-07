import React from "react";

// The SCOUT wordmark (same lockup as the trip planner: Druk Wide in the
// electric-blue accent with the swoosh riding the cap line) + the MOOD tag.
export default function Logo({ size = 22, color = "var(--accent)" }) {
  return (
    <span className="mood-brand" aria-label="Scout Mood">
      <span style={{ display: "inline-flex", alignItems: "flex-start", gap: "0.12em", fontSize: size }} aria-hidden="true">
        <span style={{ fontFamily: "var(--font-wordmark)", fontSize: "1em", fontWeight: 400, letterSpacing: "-0.01em", color, textTransform: "uppercase", lineHeight: 1 }}>Scout</span>
        <svg viewBox="0 0 413.62 144.78" style={{ display: "block", height: "0.68em", width: "auto", transform: "translateY(0.06em)" }}>
          <path fill={color} transform="translate(-49.19 -183.61)" d="M462.81,183.61,160.21,312.47Q122.57,328.39,97,328.39q-29,0-42-20.27-8.2-13-4.83-33.06T68,232.35Q80.1,214,107.61,184.09a105.53,105.53,0,0,0-13.51,31.85q-7.24,30.89,13,45.37,9.65,6.76,26.54,6.76a123.37,123.37,0,0,0,30.4-4.34Z" />
        </svg>
      </span>
      <span className="mood-brand-tag" aria-hidden="true">Mood</span>
    </span>
  );
}
