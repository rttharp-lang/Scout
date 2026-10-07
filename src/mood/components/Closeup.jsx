import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Download, ExternalLink, Sparkles, X } from "lucide-react";
import Masonry from "./Masonry.jsx";
import Tile, { ratioOf } from "./Tile.jsx";

export function LicensePill({ license }) {
  if (!license) return null;
  const cls = license.commercial === true ? "ok" : license.code === "reference-only" ? "ref" : "";
  return license.url
    ? <a className={`license ${cls}`} href={license.url} target="_blank" rel="noopener noreferrer">{license.label}</a>
    : <span className={`license ${cls}`}>{license.label}</span>;
}

// "Photo by Name on Unsplash" with the links the source's guidelines require.
export function Credit({ pin }) {
  const who = pin.creator
    ? (pin.creatorUrl ? <a href={pin.creatorUrl} target="_blank" rel="noopener noreferrer">{pin.creator}</a> : pin.creator)
    : null;
  const where = pin.sourceHome
    ? <a href={pin.sourceHome} target="_blank" rel="noopener noreferrer">{pin.sourceLabel}</a>
    : pin.sourceLabel;
  const photo = pin.source === "unsplash" || pin.source === "pexels";
  return (
    <div className="credit">
      {pin.title && <p className="closeup-title">{pin.title}{pin.date ? `, ${pin.date}` : ""}</p>}
      <span>
        {photo ? <>Photo by {who || "unknown"} on {where}</> : pin.attribution || <>{who ? <>{who} · </> : null}{where}</>}
      </span>
      <span><a href={pin.pageUrl} target="_blank" rel="noopener noreferrer">View at source <ExternalLink size={12} aria-hidden="true" style={{ verticalAlign: -1 }} /></a></span>
      <LicensePill license={pin.license} />
    </div>
  );
}

function ApprovalBox({ pin, approvals, curator, libraryEnabled, signedIn, onApprove, onRevoke, onSignIn }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = curator?.verified ? approvals.find((a) => a.curatorId === curator.user_id) : null;
  const act = async (fn) => { setBusy(true); try { await fn(); setNote(""); } finally { setBusy(false); } };

  return (
    <div className={`approval-box${approvals.length ? " approved" : ""}`}>
      {approvals.length ? (
        <>
          <b><BadgeCheck size={16} aria-hidden="true" style={{ verticalAlign: -3, marginRight: 4 }} />Designer-approved</b>
          {approvals.map((a) => (
            <div key={a.id} style={{ marginTop: 6 }}>
              <div className="who">{a.by}{a.title ? `, ${a.title}` : ""}{a.house ? ` — ${a.house}` : ""}</div>
              {a.note && <div style={{ marginTop: 2 }}>“{a.note}”</div>}
            </div>
          ))}
        </>
      ) : (
        <>
          <b>AI-curated · not yet designer-reviewed</b>
          <span className="who">
            {libraryEnabled
              ? "Picked by the AI curator against the brief. It earns the Approved badge only when a verified designer-curator signs off."
              : "Picked by the AI curator against the brief. Designer approval isn't set up on this deployment yet."}
          </span>
        </>
      )}
      {libraryEnabled && curator?.verified && (
        mine ? (
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => onRevoke(pin))}>Withdraw my approval</button>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <label className="sr-only" htmlFor="approve-note">Your note</label>
            <textarea id="approve-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your note for the team (optional) — what to take from it" maxLength={500} />
            <button type="button" className="btn btn-dark btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => act(() => onApprove(pin, note))}>
              <BadgeCheck size={15} aria-hidden="true" /> Approve as {curator.display_name}
            </button>
          </div>
        )
      )}
      {libraryEnabled && !signedIn && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="more-toggle" onClick={onSignIn}>Designer-curators: sign in to review</button>
        </div>
      )}
      {libraryEnabled && signedIn && curator && !curator.verified && (
        <div className="who" style={{ marginTop: 8 }}>Your curator account is pending verification.</div>
      )}
    </div>
  );
}

export default function Closeup({
  pin, story, approvals = [], curator, libraryEnabled, signedIn, saved,
  related, approvalsMap = {}, savedIds,
  onClose, onPrev, onNext, onSave, onDownload, onMore, onOpen, onApprove, onRevoke, onSignIn, onBroken, onMeasure,
}) {
  const closeRef = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    lastFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.("textarea, input")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const scrollerRef = useRef(null);
  useEffect(() => { scrollerRef.current?.scrollTo?.(0, 0); }, [pin.id]);

  return (
    <div className="modal-backdrop" ref={scrollerRef} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={pin.alt || pin.title || "Image"}>
        <button ref={closeRef} type="button" className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="closeup">
          <div className="closeup-media" style={{ background: pin.color || "#111" }}>
            <img src={pin.src || pin.thumb} alt={pin.alt || pin.title || ""} />
          </div>
          <div className="closeup-body">
            <div className="closeup-actions">
              <button type="button" className={`btn ${saved ? "btn-dark" : "btn-primary"}`} onClick={(e) => onSave(pin, e.currentTarget)}>{saved ? "Saved" : "Save"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => onDownload(pin)}><Download size={16} aria-hidden="true" />Download</button>
              {onMore && <button type="button" className="btn btn-ghost" onClick={() => onMore(pin)}><Sparkles size={16} aria-hidden="true" />More like this</button>}
            </div>
            <div>
              {story && <div className="closeup-story">{story.name}{pin.role ? ` · ${pin.role}` : ""}</div>}
              {pin.note && <p className="closeup-note">{pin.note}</p>}
            </div>
            <ApprovalBox pin={pin} approvals={approvals} curator={curator} libraryEnabled={libraryEnabled} signedIn={signedIn} onApprove={onApprove} onRevoke={onRevoke} onSignIn={onSignIn} />
            <Credit pin={pin} />
            {(onPrev || onNext) && (
              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <button type="button" className="btn btn-quiet btn-sm" onClick={onPrev} disabled={!onPrev}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={onNext} disabled={!onNext}>Next<ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            )}
          </div>
        </div>
        {related && related.status !== "idle" && (
          <section className="related" aria-live="polite">
            <h3>More like this</h3>
            {related.status === "loading" && <p className="status-line"><span><span className="dot" />Searching and curating images that share this one's colour, material and light…</span></p>}
            {related.status === "error" && <div className="notice err">{related.error}</div>}
            {related.status === "done" && !related.pins.length && <p className="status-line">Nothing else cleared the bar for this one — try another image.</p>}
            {related.pins.length > 0 && (
              <Masonry
                items={related.pins}
                getKey={(p) => p.id}
                getRatio={ratioOf}
                renderItem={(p) => (
                  <Tile pin={p} approved={approvalsMap[p.id]?.[0]} saved={savedIds?.has(p.id)} onOpen={onOpen} onSave={onSave} onDownload={onDownload} onBroken={onBroken} onMeasure={onMeasure} />
                )}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
