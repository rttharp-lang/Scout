import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { approve, decideReview, listReviewRequests, myApprovals, revoke } from "../library.js";
import { LicensePill } from "./Closeup.jsx";

const fmt = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

// Tags that let an approved image find its way onto future boards: the story's
// keywords plus the board title's words.
export const tagsFor = (board, pin) => {
  const story = (board.stories || []).find((s) => s.id === pin.storyId);
  return [...(story?.keywords || []), ...String(board.title || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)];
};

function ReviewRequest({ req, onBack, onDone, toast }) {
  const board = req.board || {};
  const pins = board.pins || [];
  const [verdicts, setVerdicts] = useState(() => Object.fromEntries(Object.entries(req.decisions || {}).map(([k, v]) => [k, v.verdict])));
  const [notes, setNotes] = useState(() => Object.fromEntries(Object.entries(req.decisions || {}).map(([k, v]) => [k, v.note || ""])));
  const [busy, setBusy] = useState(false);
  const decidedCount = pins.filter((p) => verdicts[p.id]).length;

  const submit = async () => {
    setBusy(true);
    try {
      const decisions = {};
      for (const p of pins) {
        if (!verdicts[p.id]) continue;
        decisions[p.id] = { verdict: verdicts[p.id], note: notes[p.id] || "" };
        if (verdicts[p.id] === "approved") {
          const story = (board.stories || []).find((s) => s.id === p.storyId);
          await approve(p, { note: notes[p.id] || "", tags: tagsFor(board, p), story: story?.name || board.title || "" });
        }
      }
      await decideReview(req.id, decisions);
      toast(`Review saved — ${Object.values(decisions).filter((d) => d.verdict === "approved").length} approved.`);
      onDone();
    } catch (e) {
      toast(`Couldn't save the review: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className="btn btn-quiet btn-sm" onClick={onBack}>← All requests</button>
      <div className="board-head" style={{ marginTop: 10 }}>
        <div className="board-season">{board.season && <span className="pill">{board.season}</span>}<span>Requested {fmt(req.created_at)}</span></div>
        <h1 className="board-title" style={{ fontSize: "clamp(2.4rem, 7vw, 5rem)" }}>{board.title || "Untitled"}</h1>
        {board.concept && <p className="board-tagline" style={{ fontSize: 16 }}>{board.concept}</p>}
        {req.message && <div className="notice">“{req.message}”</div>}
      </div>
      <div className="studio-grid">
        {pins.map((p) => (
          <div key={p.id} className="review-card">
            <a href={p.pageUrl} target="_blank" rel="noopener noreferrer"><img src={p.thumb} alt={p.alt || p.title || ""} loading="lazy" style={{ background: p.color || undefined }} /></a>
            <div className="rc-body">
              {p.note && <div style={{ color: "#3b3a38" }}><b style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>AI note</b><br />{p.note}</div>}
              <LicensePill license={p.license} />
              <div className="seg" role="group" aria-label="Decision">
                <button type="button" className="yes" aria-pressed={verdicts[p.id] === "approved"} onClick={() => setVerdicts((v) => ({ ...v, [p.id]: v[p.id] === "approved" ? undefined : "approved" }))}>Approve</button>
                <button type="button" className="no" aria-pressed={verdicts[p.id] === "rejected"} onClick={() => setVerdicts((v) => ({ ...v, [p.id]: v[p.id] === "rejected" ? undefined : "rejected" }))}>Pass</button>
              </div>
              {verdicts[p.id] === "approved" && (
                <input className="field" style={{ padding: "8px 10px", fontSize: 13 }} value={notes[p.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} placeholder="Your note (optional)" maxLength={500} aria-label="Your note" />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="more-row" style={{ position: "sticky", bottom: 16 }}>
        <button type="button" className="btn btn-dark btn-lg" disabled={busy || !decidedCount} onClick={submit}>
          {busy ? "Saving…" : `Submit ${decidedCount} decision${decidedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

export default function CuratorStudio({ enabled, signedIn, curator, onSignIn, toast }) {
  const [tab, setTab] = useState("queue");
  const [requests, setRequests] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const isCurator = Boolean(curator?.verified);

  const load = useCallback(async () => {
    setError("");
    try {
      setRequests(await listReviewRequests());
      if (isCurator) setApprovals(await myApprovals());
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [isCurator]);

  useEffect(() => { if (enabled && signedIn) load(); }, [enabled, signedIn, load]);

  if (!enabled) {
    return (
      <div className="empty">
        <h3>Designer review isn't set up yet</h3>
        <p>Approval needs Supabase (run <code>supabase/mood.sql</code>) and verified designer-curator accounts. Until then, Scout Mood labels every image as AI-curated — it never shows an Approved badge it can't back up.</p>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div className="empty">
        <h3>Curator studio</h3>
        <p>Sign in to see your review requests — or, if you're a verified designer-curator, the review queue.</p>
        <button type="button" className="btn btn-primary" onClick={onSignIn}>Sign in</button>
      </div>
    );
  }
  if (open) return <ReviewRequest req={open} onBack={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} toast={toast} />;

  return (
    <div>
      <div className="board-head">
        <h1 className="board-title" style={{ fontSize: "clamp(2.6rem, 8vw, 6rem)" }}>{isCurator ? "Curator studio" : "Review requests"}</h1>
        <p className="board-tagline" style={{ fontSize: 16 }}>
          {isCurator
            ? `Signed in as ${curator.display_name}${curator.title ? `, ${curator.title}` : ""}. Images you approve carry your name and lead future boards that match their tags.`
            : curator ? "Your curator account is pending verification by an admin. Meanwhile, here are the reviews you've requested." : "Boards you've sent to the designer-curators, and their decisions."}
        </p>
        {isCurator && (
          <div className="chip-row">
            <button type="button" className="chip" aria-pressed={tab === "queue"} onClick={() => setTab("queue")}>Review queue</button>
            <button type="button" className="chip" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>My approvals <span className="n">{approvals?.length ?? ""}</span></button>
          </div>
        )}
      </div>
      {error && <div className="notice err">{error}</div>}
      {tab === "queue" && (
        requests === null ? <p className="status-line"><span><span className="dot" />Loading…</span></p> :
        !requests.length ? <div className="empty"><h3>Nothing in the queue</h3><p>{isCurator ? "New review requests will appear here." : "Use “Request designer review” on any board."}</p></div> :
        <div style={{ display: "grid", gap: 10 }}>
          {requests.map((r) => {
            const n = r.board?.pins?.length || 0;
            const approved = Object.values(r.decisions || {}).filter((d) => d.verdict === "approved").length;
            return (
              <div key={r.id} className="request-row">
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  {r.board?.pins?.[0]?.thumb && <img className="pop-thumb" style={{ width: 52, height: 52 }} src={r.board.pins[0].thumb} alt="" />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{r.board?.title || "Untitled"} {r.board?.season && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {r.board.season}</span>}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{n} images · {fmt(r.created_at)} · {r.status === "done" ? `reviewed — ${approved} approved` : "awaiting review"}</div>
                  </div>
                </div>
                {isCurator && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(r)}>{r.status === "done" ? "Revisit" : "Review"}</button>}
              </div>
            );
          })}
        </div>
      )}
      {tab === "mine" && isCurator && (
        approvals === null ? <p className="status-line">Loading…</p> :
        !approvals.length ? <div className="empty"><h3>No approvals yet</h3><p>Approve images from the review queue or from any board's closeup view.</p></div> :
        <div className="studio-grid">
          {approvals.map((a) => (
            <div key={a.id} className="review-card">
              <img src={a.image?.thumb} alt={a.image?.alt || ""} loading="lazy" style={{ background: a.image?.color || undefined }} />
              <div className="rc-body">
                <div><BadgeCheck size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> {a.story || "Approved"} · {fmt(a.at)}</div>
                {a.note && <div>“{a.note}”</div>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { await revoke(a.imageId); setApprovals((l) => l.filter((x) => x.id !== a.id)); toast("Approval withdrawn."); } catch (e) { toast(String(e.message || e)); } }}>Withdraw</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
