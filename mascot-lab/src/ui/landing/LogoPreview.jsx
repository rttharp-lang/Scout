// LogoPreview — the team logo, shown as early as possible: the decoded canvas once it is
// ready, before that the logo file itself as an <img> (samples and SVG uploads are
// transparent already, so the picture matches what the decode produces), else a skeleton.
// `padding` insets it like the effect source (SAFE: the logo sits in the central 72%).
import React from "react";
import { CanvasImage, cx } from "../components/index.js";

/** quickLogoSrc(logo) → a src safe to show before decoding (no background to cut), or null. */
export function quickLogoSrc(logo) {
  const src = logo?.src;
  if (!src || typeof src !== "string") return null;
  if (logo.sampleId) return src;
  return /^data:image\/svg\+xml/i.test(src) ? src : null;
}

export function LogoPreview({ canvas, src = null, stage = "paper", padding = 0, alt = "", className }) {
  if (canvas || !src) {
    return <CanvasImage canvas={canvas || null} stage={stage} ratio={1} padding={padding} alt={alt} className={className} />;
  }
  return (
    <div
      className={cx("ml-canvas", `ml-stage--${stage}`, "lp-logo-img", className)}
      style={{ aspectRatio: "1", "--pad": `${Math.max(0, Math.min(0.4, padding)) * 100}%` }}
      role="img"
      aria-label={alt}
    >
      <img src={src} alt="" decoding="async" draggable="false" />
    </div>
  );
}

export default LogoPreview;
