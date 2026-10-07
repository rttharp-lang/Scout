import React, { useState } from "react";
import { BadgeCheck, Download, ExternalLink, Sparkles } from "lucide-react";

export const ratioOf = (pin) => (pin.width > 0 && pin.height > 0 ? Math.min(2.4, Math.max(0.42, pin.height / pin.width)) : 1.25);

// One pin on the board. Image-first: the chrome (Save, More like this,
// download, source) appears on hover/focus, and stays reachable by keyboard.
export default function Tile({ pin, approved, saved, onOpen, onSave, onMore, onDownload, onBroken, onMeasure }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = pin.alt || pin.title || `${pin.role || "Image"} from ${pin.sourceLabel || pin.source}`;
  const known = pin.width > 0 && pin.height > 0;
  if (failed) return null; // a dead image link never leaves a hole in the board
  return (
    <div className="tile" style={{ background: pin.color || undefined }}>
      <button type="button" className="tile-open" onClick={() => onOpen(pin)} aria-label={`Open: ${label}`}>
        <img
          className={`tile-img${loaded ? " loaded" : ""}`}
          src={pin.thumb}
          alt={label}
          loading="lazy"
          decoding="async"
          width={known ? pin.width : undefined}
          height={known ? pin.height : undefined}
          // Unknown size (some museum APIs): let the image set its own height,
          // then report it so the masonry can re-balance.
          style={known ? { aspectRatio: `1 / ${ratioOf(pin)}` } : { minHeight: loaded ? 0 : 160 }}
          onLoad={(e) => {
            setLoaded(true);
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
        <button type="button" className={`tile-save${saved ? " saved" : ""}`} onClick={(e) => onSave(pin, e.currentTarget)} aria-haspopup="dialog">
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <div className="tile-bottom">
        <span className="tile-source">{[pin.role, pin.sourceLabel || pin.source].filter(Boolean).join(" · ")}</span>
        <span style={{ display: "inline-flex", gap: 6 }}>
          {onMore && (
            <button type="button" className="tile-fab" onClick={() => onMore(pin)} aria-label="More like this" title="More like this">
              <Sparkles size={16} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="tile-fab" onClick={() => onDownload(pin)} aria-label="Download image" title="Download">
            <Download size={16} aria-hidden="true" />
          </button>
          <a className="tile-fab" href={pin.pageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open source page on ${pin.sourceLabel || pin.source}`} title="Source">
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        </span>
      </div>
    </div>
  );
}

export function SkeletonTile({ ratio = 1.25 }) {
  return <div className="skeleton" style={{ aspectRatio: `1 / ${ratio}` }} aria-hidden="true" />;
}
