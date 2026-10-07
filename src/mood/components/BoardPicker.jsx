import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus } from "lucide-react";

// Pinterest's "Save" flow: a small floating panel anchored to the button you
// pressed — pick one of your boards, or name a new one. Rendered in a portal so
// tile corners (overflow: hidden) never clip it.
export default function BoardPicker({ anchor, pin, boards, onPick, onCreate, onClose }) {
  const ref = useRef(null);
  const [name, setName] = useState("");
  const [pos, setPos] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      if (!anchor?.getBoundingClientRect) return;
      const r = anchor.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 32);
      const h = ref.current?.offsetHeight || 320;
      let left = Math.min(Math.max(16, r.right - w), window.innerWidth - w - 16);
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8;
      setPos({ left, top: Math.max(12, Math.min(top, window.innerHeight - h - 12)), width: w });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place); };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains?.(e.target)) closeRef.current(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    // Focus the panel itself (not the input) so phones don't pop the keyboard.
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [anchor]);

  const create = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (n) onCreate(n, pin);
  };

  return createPortal(
    <div ref={ref} tabIndex={-1} className="popover" role="dialog" aria-label="Save to board" style={{ position: "fixed", right: "auto", ...(pos || { left: -9999, top: 0 }) }}>
      <h4>Save to board</h4>
      <div className="pop-list">
        {boards.length === 0 && <div style={{ padding: "4px 8px 8px", fontSize: 13.5, color: "var(--text-muted)" }}>No boards yet — name your first one below.</div>}
        {boards.map((b) => {
          const has = b.pins.some((p) => p.id === pin.id);
          const cover = b.pins[0]?.thumb;
          return (
            <button key={b.id} type="button" className="pop-item" onClick={() => onPick(b.id, pin)} aria-pressed={has}>
              {cover ? <img className="pop-thumb" src={cover} alt="" /> : <span className="pop-thumb" />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                <small>{b.pins.length} pin{b.pins.length === 1 ? "" : "s"}</small>
              </span>
              {has && <Check size={16} aria-label="Already saved here" />}
            </button>
          );
        })}
      </div>
      <form className="pop-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" aria-label="New board name" maxLength={80} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}><Plus size={15} aria-hidden="true" />Create</button>
      </form>
    </div>,
    document.body,
  );
}
