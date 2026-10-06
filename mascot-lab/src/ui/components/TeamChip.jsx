import React from "react";
import { CanvasImage } from "./CanvasImage.jsx";
import { cx } from "./cx.js";
import "./components.css";

/**
 * TeamChip — logo thumbnail + the three team colours + school/mascot, with a
 * "Sample" tag while the sample team is loaded. Presentational: pass state in.
 *   team: { school, mascot, isSample }, palette, logoCanvas (decoded) or logoSrc (fallback),
 *   href (renders a link), onClick (renders a button), compact (thumb + dots only).
 */
export function TeamChip({ team = {}, palette = {}, logoCanvas = null, logoSrc = null, href, onClick, compact = false, sampleLabel = "Sample", className, title }) {
  const name = [team.school, team.mascot].filter(Boolean).join(" ") || "Your team";
  const Tag = href ? "a" : onClick ? "button" : "div";
  const props = href ? { href } : onClick ? { type: "button", onClick } : {};
  return (
    <Tag className={cx("ml-teamchip", className)} title={title} aria-label={href || onClick ? `${name}${team.isSample ? ` (${sampleLabel.toLowerCase()})` : ""} — ${title || "team"}` : undefined} {...props}>
      <span className="ml-teamchip__thumb ml-stage--checker" aria-hidden="true">
        {logoCanvas ? (
          <CanvasImage canvas={logoCanvas} ratio={1} alt="" />
        ) : logoSrc ? (
          <img src={logoSrc} alt="" />
        ) : null}
      </span>
      {!compact && (
        <span className="ml-teamchip__text">
          <span className="ml-teamchip__name">
            <span>{name}</span>
          </span>
          <span className="ml-teamchip__meta">
            <span className="ml-teamchip__dots" aria-hidden="true">
              <i style={{ background: palette.primary }} />
              <i style={{ background: palette.secondary }} />
              <i style={{ background: palette.accent }} />
            </span>
            {team.isSample && <span className="ml-teamchip__tag">{sampleLabel}</span>}
          </span>
        </span>
      )}
    </Tag>
  );
}

export default TeamChip;
