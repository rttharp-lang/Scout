import React, { useState } from "react";
import { BadgeCheck, ChevronDown, Download, EyeOff, Sparkles } from "lucide-react";

export const ratioOf = (pin) => (pin.width > 0 && pin.height > 0 ? Math.min(2.4, Math.max(0.42, pin.height / pin.width)) : 1.25);

// One pin. Image-first: chrome (Save, More like this, download, "not this")
// shows on hover/focus. The box size comes from the masonry; the image covers
// it. With focus on a tile: S save · D download · C copy image · M more like
// this · X not this · Enter opens.
export default function Tile({ pin, approved, saved, onOpen, onSave, onPick, onMore, onDownload, onCopy, onHide, onBroken, onMeasure }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = pin.alt || pin.title || `${pin.role || "Image"} from ${pin.sourceLabel || pin.source}`;
  const known = pin.width > 0 && pin.height > 0;
  if (failed) return null; // a dead image link never leaves a hole in the board

  const onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea")) return;
    const k = e.key.toLowerCase();
    const anchor = e.currentTarget.querySelector(".tile-save");
    const act = { s: () => (saved ? onPick : onSave)?.(pin, anchor), d: () => onDownload?.(pin), c: () => onCopy?.(pin), m: () => onMore?.(pin), x: () => onHide?.(pin) }[k];
    if (act) { e.preventDefault(); act(); }
  };

  return (
    <div className="tile" style={{ background: pin.color || undefined }} onKeyDown={onKeyDown}>
      <button type="button" className="tile-open" onClick={() => onOpen(pin)} aria-label={`Open: ${label}`} aria-keyshortcuts="S D C M X">
        <img
          className={`tile-img${loaded ? " loaded" : ""}`}
          src={pin.thumb}
          alt={label}
          loading="lazy"
          decoding="async"
          width={known ? pin.width : undefined}
          height={known ? pin.height : undefined}
          onLoad={(e) => {
            setLoaded(true);
            // Some museum APIs give no pixel size: report it so the masonry re-balances.
            if (!known && onMeasure) onMeasure(pin, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
          }}
          onError={() => { setFailed(true); onBroken?.(pin); }}
        />
      </button>
      <div className="tile-shade" />
      {approved && (
        <span className="tile-badge" title={`Designer-approved by ${approved.by}`}>
          <BadgeCheck size={14} aria-hidden="true" /> Approved
        </span>
      )}
      <div className="tile-top">
        <span className="save-split">
          <button type="button" className={`tile-save${saved ? " saved" : ""}`} onClick={(e) => (saved ? onPick : onSave)(pin, e.currentTarget)} aria-haspopup={saved ? "dialog" : undefined}>
            {saved ? "Saved" : "Save"}
          </button>
          {!saved && onPick && (
            <button type="button" className="tile-save tile-save-caret" onClick={(e) => onPick(pin, e.currentTarget.previousSibling)} aria-label="Choose a board" aria-haspopup="dialog">
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      <div className="tile-bottom">
        <span className="tile-source">{[pin.role, pin.sourceLabel || pin.source].filter(Boolean).join(" · ")}</span>
        <span className="tile-fabs">
          {onMore && (
            <button type="button" className="tile-fab" onClick={() => onMore(pin)} aria-label="More like this" title="More like this (M)">
              <Sparkles size={16} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="tile-fab" onClick={() => onDownload(pin)} aria-label="Download image" title="Download (D)">
            <Download size={16} aria-hidden="true" />
          </button>
          {onHide && (
            <button type="button" className="tile-fab" onClick={() => onHide(pin)} aria-label="Not this — remove from the board" title="Not this (X)">
              <EyeOff size={16} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function SkeletonTile() {
  return <div className="skeleton" aria-hidden="true" />;
}
