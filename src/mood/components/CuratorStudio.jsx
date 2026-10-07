import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { approve, decideReview, dismissReview, listReviewRequests, myApprovals, revoke, verifiedCuratorIds } from "../library.js";

const fmt = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

// Tags that let an approved image find its way onto future boards: the story's
// keywords plus the board title's words. Pins saved to boards carry a snapshot
// of their story, used when the exploration itself is gone.
export const tagsFor = (board, pin) => {
  const story = (board.stories || []).find((s) => s.id === pin.storyId);
  const keywords = story?.keywords?.length ? story.keywords : pin.storyKeywords || [];
  return [...keywords, ...String(board.title || pin.storyName || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)];
};

// decisions are stored per curator: { [curatorId]: { [imageId]: { verdict, note } } }.
// (Older rows used { [imageId]: { verdict, note, by? } } — read them as the
// reviewer's.)
export function decisionsBy(req, curatorId) {
  const d = req.decisions || {};
  if (d[curatorId] && typeof d[curatorId] === "object" && !("verdict" in d[curatorId])) return d[curatorId];
  if (req.reviewed_by === curatorId) return Object.fromEntries(Object.entries(d).filter(([, v]) => v && "verdict" in v && (!v.by || v.by === curatorId)));
  return {};
}
export function approvedCount(req, verifiedIds) {
  const d = req.decisions || {};
  const ids = new Set();
  for (const [k, v] of Object.entries(d)) {
    if (v && "verdict" in v) { if (v.verdict === "approved" && (!verifiedIds || verifiedIds.has(v.by || req.reviewed_by))) ids.add(k); continue; }
    if (verifiedIds && !verifiedIds.has(k)) continue; // that curator is no longer verified
    for (const [img, dv] of Object.entries(v || {})) if (dv?.verdict === "approved") ids.add(img);
  }
  return ids.size;
}

function ReviewRequest({ req, me, onBack, onDone, toast }) {
  const board = req.board || {};
  const pins = Array.isArray(board.pins) ? board.pins.slice(0, 60) : [];
  // Only this curator's own earlier verdicts are pre-filled: another curator's
  // choices are never re-submitted under this curator's name.
  const mine = decisionsBy(req, me);
  const [verdicts, setVerdicts] = useState(() => Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, v.verdict])));
  const [notes, setNotes] = useState(() => Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, v.note || ""])));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState({}); // { [imageId]: reason }
  const decidedCount = pins.filter((p) => verdicts[p.id]).length;

  const submit = async () => {
    setBusy(true);
    const problems = {};
    const next = {};
    try {
      for (const p of pins) {
        const v = verdicts[p.id];
        const before = mine[p.id]?.verdict;
        if (v === "approved") {
          const story = (board.stories || []).find((s) => s.id === p.storyId);
          try {
            await approve(p, { note: notes[p.id] || "", tags: tagsFor(board, p), story: story?.name || board.title || "" });
            next[p.id] = { verdict: "approved", note: notes[p.id] || "" };
          } catch (e) {
            problems[p.id] = String(e?.message || e);
          }
        } else {
          // Switching away from Approve withdraws this curator's approval.
          if (before === "approved") { try { await revoke(p.id); } catch {} }
          if (v) next[p.id] = { verdict: v, note: "" };
        }
      }
      const decisions = { ...(req.decisions || {}) };
      // Drop legacy flat entries this curator made, then store theirs per curator.
      for (const k of Object.keys(mine)) if (decisions[k] && "verdict" in decisions[k]) delete decisions[k];
      decisions[me] = next;
      await decideReview(req.id, decisions);
      setFailed(problems);
      const approvedNow = Object.values(next).filter((d) => d.verdict === "approved").length;
      if (Object.keys(problems).length) {
        toast(`Saved — ${approvedNow} approved; ${Object.keys(problems).length} couldn't be verified at the source and were not approved.`);
      } else {
        toast(`Review saved — ${approvedNow} approved.`);
        onDone();
      }
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
        <div className="board-season">{board.season && <span className="pill">{String(board.season).slice(0, 12)}</span>}<span>Requested {fmt(req.created_at)}</span></div>
        <h1 className="board-title" style={{ fontSize: "clamp(2.4rem, 7vw, 5rem)" }}>{String(board.title || "Untitled").slice(0, 80)}</h1>
        {board.concept && <p className="board-tagline" style={{ fontSize: 16 }}>{String(board.concept).slice(0, 1400)}</p>}
        {req.message && <div className="notice">From the requester: “{req.message}”</div>}
        <p className="story-desc" style={{ margin: 0 }}>Approving checks each image against its source first; what gets stored — and credited — is what the source says, not what the request says.</p>
      </div>
      <div className="studio-grid">
        {pins.map((p) => (
          <div key={p.id} className="review-card">
            <img src={p.thumb} alt={p.alt || p.title || ""} loading="lazy" referrerPolicy="no-referrer" style={{ background: p.color || undefined }} />
            <div className="rc-body">
              {p.note && <div style={{ color: "#3b3a38" }}><b style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>AI note (from the request)</b><br />{String(p.note).slice(0, 300)}</div>}
              <div className="seg" role="group" aria-label="Decision">
                <button type="button" className="yes" aria-pressed={verdicts[p.id] === "approved"} onClick={() => setVerdicts((v) => ({ ...v, [p.id]: v[p.id] === "approved" ? undefined : "approved" }))}>Approve</button>
                <button type="button" className="no" aria-pressed={verdicts[p.id] === "rejected"} onClick={() => setVerdicts((v) => ({ ...v, [p.id]: v[p.id] === "rejected" ? undefined : "rejected" }))}>Pass</button>
              </div>
              {verdicts[p.id] === "approved" && (
                <input className="field" style={{ padding: "8px 10px", fontSize: 13 }} value={notes[p.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} placeholder="Your note (optional)" maxLength={500} aria-label="Your note" />
              )}
              {failed[p.id] && <div className="status-line err" style={{ margin: 0 }}>{failed[p.id]}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="more-row" style={{ position: "sticky", bottom: 16 }}>
        <button type="button" className="btn btn-dark btn-lg" disabled={busy || (!decidedCount && !Object.keys(mine).length)} onClick={submit}>
          {busy ? "Verifying & saving…" : `Submit ${decidedCount} decision${decidedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

export default function CuratorStudio({ enabled, signedIn, curator, onSignIn, toast }) {
  const [tab, setTab] = useState("queue");
  const [requests, setRequests] = useState(null);
  const [verified, setVerified] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const isCurator = Boolean(curator?.verified);

  const load = useCallback(async () => {
    setError("");
    try {
      const [reqs, ids] = await Promise.all([listReviewRequests(), verifiedCuratorIds()]);
      setRequests(reqs);
      setVerified(ids);
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
  if (open) return <ReviewRequest req={open} me={curator.user_id} onBack={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} toast={toast} />;

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
            const approved = approvedCount(r, verified);
            return (
              <div key={r.id} className="request-row">
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  {r.board?.pins?.[0]?.thumb && <img className="pop-thumb" style={{ width: 52, height: 52 }} src={r.board.pins[0].thumb} alt="" />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{r.board?.title || "Untitled"} {r.board?.season && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {r.board.season}</span>}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{n} images · {fmt(r.created_at)} · {r.status === "done" ? `reviewed — ${approved} approved` : "awaiting review"}</div>
                  </div>
                </div>
                {isCurator && (
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(r)}>{decisionsBy(r, curator.user_id) && Object.keys(decisionsBy(r, curator.user_id)).length ? "Revisit" : "Review"}</button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { if (!window.confirm("Dismiss this request? It's removed for everyone.")) return; try { await dismissReview(r.id); setRequests((l) => l.filter((x) => x.id !== r.id)); toast("Request dismissed."); } catch (e) { toast(String(e.message || e)); } }}>Dismiss</button>
                  </span>
                )}
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
