import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function Dialog({ title, children, onClose, label }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const last = document.activeElement;
    ref.current?.querySelector("textarea, input, button:not([aria-label='Close'])")?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); last?.focus?.(); };
  }, []);
  return (
    <div className="modal-backdrop center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label || title} ref={ref}>
        <button type="button" className="btn btn-quiet btn-icon" style={{ position: "absolute", top: 12, right: 12 }} onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// "Refine": a note to the creative director → a revised brief + a fresh board
// (kept as a new version; the original stays in history).
export function RefineDialog({ busy, onSubmit, onClose }) {
  const [note, setNote] = useState("");
  return (
    <Dialog title="Refine the direction" onClose={onClose}>
      <p>Tell the creative director what to change. You'll get a revised brief and a fresh board as a new version — this one stays in your history.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) onSubmit(note.trim()); }}>
        <label className="sr-only" htmlFor="refine-note">What should change?</label>
        <textarea id="refine-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder="e.g. Less neon, more 70s Japanese workwear. Push the palette warmer. Drop the urban story for a coastal one." />
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!note.trim() || busy}>{busy ? "Rewriting…" : "Refine"}</button>
        </div>
      </form>
    </Dialog>
  );
}

// "Request designer review": submit a board snapshot to the curators' queue.
export function ReviewDialog({ count, enabled, signedIn, onSignIn, busy, done, onSubmit, onClose }) {
  const [msg, setMsg] = useState("");
  return (
    <Dialog title="Designer review" onClose={onClose}>
      {!enabled ? (
        <p>Designer review isn't set up on this deployment. It needs Supabase (see <code>supabase/mood.sql</code>) and at least one verified designer-curator. Until then every image is labelled AI-curated.</p>
      ) : done ? (
        <p>Sent. Verified designer-curators will review the {count} images; anything they approve gets the Approved badge here and joins the shared library for future boards.</p>
      ) : !signedIn ? (
        <>
          <p>Sign in so the curators can send their decisions back to you.</p>
          <div className="dialog-foot"><button type="button" className="btn btn-primary" onClick={onSignIn}>Sign in</button></div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(msg.trim()); }}>
          <p>Send these {count} images to the verified designer-curators. They approve or pass on each one; approved images carry their name.</p>
          <label className="sr-only" htmlFor="review-msg">Note for the curators</label>
          <textarea id="review-msg" className="field" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} placeholder="Context for the curators (optional) — the range, the deadline, what you're unsure about." />
          <div className="dialog-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !count}>{busy ? "Sending…" : "Request review"}</button>
          </div>
        </form>
      )}
      {(done || !enabled) && <div className="dialog-foot"><button type="button" className="btn btn-dark" onClick={onClose}>Done</button></div>}
    </Dialog>
  );
}

export function RenameDialog({ name, onSubmit, onClose }) {
  const [v, setV] = useState(name || "");
  return (
    <Dialog title="Rename board" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}>
        <label className="sr-only" htmlFor="rename">Board name</label>
        <input id="rename" className="field" value={v} onChange={(e) => setV(e.target.value)} maxLength={80} />
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!v.trim()}>Save</button>
        </div>
      </form>
    </Dialog>
  );
}
