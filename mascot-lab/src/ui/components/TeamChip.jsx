import React from "react";
import { ImageOff } from "lucide-react";
import { CanvasImage } from "./CanvasImage.jsx";
import { Spinner } from "./Button.jsx";
import { cx } from "./cx.js";
import "./components.css";

/**
 * TeamChip — the team pill: round logo thumbnail, school/mascot, the three team colours,
 * and a "Sample" tag while the sample team is loaded. Presentational: pass state in.
 *   team: { school, mascot, isSample }, palette, logoCanvas (decoded) or logoSrc (fallback),
 *   status: the logo decode status from useLogoCanvas() — "loading" keeps the current
 *     thumbnail with a spinner over it, "error" shows a broken-logo thumbnail and tag
 *     (never the previous logo), errorLabel: that tag's text,
 *   href (renders a link), onClick (renders a button), compact (thumb + dots only).
 */
export function TeamChip({
  team = {}, palette = {}, logoCanvas = null, logoSrc = null, status = "ready", href, onClick, compact = false,
  sampleLabel = "Sample", errorLabel = "Logo didn't load", className, title,
}) {
  const name = [team.school, team.mascot].filter(Boolean).join(" ") || "Your team";
  const Tag = href ? "a" : onClick ? "button" : "div";
  const props = href ? { href } : onClick ? { type: "button", onClick } : {};
  const failed = status === "error";
  const busy = status === "loading";
  const tagNote = failed ? errorLabel.toLowerCase() : team.isSample ? sampleLabel.toLowerCase() : "";
  return (
    <Tag
      className={cx("ml-teamchip", compact && "ml-teamchip--compact", failed && "is-error", className)}
      title={failed ? `${errorLabel} — ${title || "team"}` : title}
      aria-label={href || onClick ? `${name}${tagNote ? ` (${tagNote})` : ""} — ${title || "team"}` : undefined}
      aria-busy={busy || undefined}
      {...props}
    >
      <span className={cx("ml-teamchip__thumb", failed ? "ml-teamchip__thumb--error" : "ml-stage--checker")} aria-hidden="true">
        {failed ? (
          <ImageOff />
        ) : logoCanvas ? (
          <CanvasImage canvas={logoCanvas} ratio={1} alt="" />
        ) : logoSrc ? (
          <img src={logoSrc} alt="" />
        ) : null}
        {busy && <span className="ml-teamchip__busy"><Spinner /></span>}
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
            {failed ? (
              <span className="ml-teamchip__tag ml-teamchip__tag--error">{errorLabel}</span>
            ) : (
              team.isSample && <span className="ml-teamchip__tag">{sampleLabel}</span>
            )}
          </span>
        </span>
      )}
    </Tag>
  );
}

export default TeamChip;
