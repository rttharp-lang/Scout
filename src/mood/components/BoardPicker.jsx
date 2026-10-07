import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus } from "lucide-react";

// Pinterest's board picker: a small floating panel anchored to the Save button
// (or centred when opened from a toast). Each board is a checkbox, so one image
// can go to several boards in one pass; "Done" closes. Rendered in a portal so
// tile corners (overflow: hidden) never clip it.
export default function BoardPicker({ anchor, pin, boards, onToggle, onCreate, onClose }) {
  const ref = useRef(null);
  const [name, setName] = useState("");
  const [pos, setPos] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      const w = Math.min(320, window.innerWidth - 32);
      const h = ref.current?.offsetHeight || 340;
      const r = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
      if (!r || (!r.width && !r.height)) {
        setPos({ left: Math.round((window.innerWidth - w) / 2), top: Math.max(12, Math.round((window.innerHeight - h) / 3)), width: w });
        return;
      }
      const left = Math.min(Math.max(16, r.right - w), window.innerWidth - w - 16);
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8;
      setPos({ left, top: Math.max(12, Math.min(top, window.innerHeight - h - 12)), width: w });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place); };
  }, [anchor, boards.length]);

  useEffect(() => {
    const last = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains?.(e.target)) closeRef.current(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    // Focus the panel itself (not the input) so phones don't pop the keyboard.
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      if (last?.isConnected) last.focus?.();
    };
  }, [anchor]);

  const create = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onCreate(n, pin);
    setName("");
  };
  const suggested = boards.length === 0 ? "e.g. SU28 Final selects" : "New board name";

  return createPortal(
    <div ref={ref} tabIndex={-1} className="popover picker" role="dialog" aria-label="Save to boards" style={{ position: "fixed", right: "auto", ...(pos || { left: -9999, top: 0 }) }}>
      <h4>Save to boards</h4>
      <div className="pop-list" role="group" aria-label="Your boards">
        {boards.length === 0 && <div style={{ padding: "4px 8px 8px", fontSize: 13.5, color: "var(--text-muted)" }}>No boards yet — name your first one below.</div>}
        {boards.map((b) => {
          const has = b.pins.some((p) => p.id === pin.id);
          const cover = b.pins[0]?.thumb;
          return (
            <button key={b.id} type="button" role="checkbox" aria-checked={has} className={`pop-item${has ? " on" : ""}`} onClick={() => onToggle(b.id, pin)}>
              {cover ? <img className="pop-thumb" src={cover} alt="" /> : <span className="pop-thumb" />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                <small>{b.pins.length} pin{b.pins.length === 1 ? "" : "s"}</small>
              </span>
              <span className="pop-check" aria-hidden="true">{has && <Check size={14} />}</span>
            </button>
          );
        })}
      </div>
      <form className="pop-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} aria-label="New board name" maxLength={80} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!name.trim()}><Plus size={15} aria-hidden="true" />Create</button>
      </form>
      <div className="pop-done">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => closeRef.current()}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
