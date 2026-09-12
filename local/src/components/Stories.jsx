import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtDate } from "../lib/api.js";
import { useApp, useWorkspace } from "../lib/store.jsx";
import { Label, Confidence, Drawer, Empty, Demo } from "./ui.jsx";

// Story tiles: prominence sets size. Each tile = image (or typographic fallback), precise headline, short insight, subtle status label.
export function StoryGrid({ claims, onOpen, emptyText }) {
  if (!claims?.length) return <Empty>{emptyText || "No findings in this section yet."}</Empty>;
  return (
    <div className="stories">
      {claims.map((c, i) => (
        <button key={c.id} className={`story p${Math.min(i === 0 ? 5 : i <= 2 ? 4 : 3, Math.max(1, c.prominence || 1))}`} onClick={() => onOpen(c.id)} aria-label={`Open finding: ${c.headline || c.statement}`}>
          <div className="art">{c.data?.image?.url ? <img src={c.data.image.url} alt={c.data.image.alt || ""} loading="lazy" /> : <div className="fallback"><span className="idx">{c.section || "finding"} · {String(i + 1).padStart(2, "0")}</span>{(c.headline || c.statement).split(" ").slice(0, 3).join(" ")}</div>}</div>
          <div className="body">
            <div className="labels"><Label kind={c.label} /><Confidence level={c.confidence} />{c.contradictions > 0 && <span className="chip" style={{ color: "var(--bad)" }}>{c.contradictions} contradiction{c.contradictions > 1 ? "s" : ""}</span>}<Demo on={c.data?.demo} /></div>
            <h3>{c.headline || c.statement}</h3>
            <p>{c.headline ? c.statement : c.data?.behavior_vs_motive}</p>
            <div className="small">{c.evidence_count} evidence item{c.evidence_count === 1 ? "" : "s"} · {c.review_state.replace(/_/g, " ")}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function ClaimDrawer({ claimId, onClose, onChanged }) {
  const { wid } = useParams(); const ws = useWorkspace(wid); const { user } = useApp();
  const [c, setC] = useState(null); const [err, setErr] = useState(null); const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false);
  const editor = ["editor", "admin"].includes(ws?.role);
  const load = () => claimId && api.get(`/workspaces/${wid}/claims/${claimId}`).then(setC).catch(setErr);
  useEffect(() => { setC(null); setErr(null); load(); }, [claimId]);
  const setState = async (review_state) => { setBusy(true); try { await api.patch(`/workspaces/${wid}/claims/${claimId}`, { review_state }); await load(); onChanged?.(); } finally { setBusy(false); } };
  const addComment = async () => { if (!comment.trim()) return; await api.post(`/workspaces/${wid}/entities/comment`, { team_id: c.team_id, parent_id: c.id, data: { body: comment, target_type: "claim", target_id: c.id } }); setComment(""); load(); };
  const requestResearch = async () => { const q = window.prompt("What should a follow-up run investigate?", `Deepen: ${c.headline || c.statement}`); if (!q) return; await api.post(`/workspaces/${wid}/entities/research_request`, { team_id: c.team_id, title: q, parent_id: c.id, data: { claim_id: c.id, requested_by: user?.name } }); alert("Request recorded. Launch it from Research Studio."); };
  const cc = c?.confidence_computed;
  return (
    <Drawer open={Boolean(claimId)} onClose={onClose} title={c?.headline || "Finding"}>
      {err && <div className="notice bad">{err.message}</div>}
      {!c && !err && <p className="small">Loading…</p>}
      {c && <div className="stack">
        <div className="row"><Label kind={c.label} /><Confidence level={cc?.level} title={cc?.summary} /><span className="chip state">{c.review_state.replace(/_/g, " ")}</span><Demo on={c.data?.demo} /><span className="small">v{c.version} · updated {fmtDate(c.updated_at)}</span></div>
        <p className="lede" style={{ fontSize: 17 }}>{c.statement}</p>
        {c.data?.behavior_vs_motive && <div className="panel"><div className="eyebrow">Behavior vs stated vs inferred</div><p style={{ margin: "6px 0 0" }}>{c.data.behavior_vs_motive}</p></div>}
        <div className="grid cols-2">
          <div><div className="eyebrow">Competing explanations</div>{c.alternatives?.length ? <ul>{c.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="small">None recorded.</p>}</div>
          <div><div className="eyebrow">What would disconfirm this</div><p>{c.disconfirming || <span className="small">Not stated.</span>}</p></div>
        </div>
        <div><div className="eyebrow">Confidence rationale</div><p className="small">{cc?.summary}</p>{cc?.factors && <div className="row small">{["independence", "locality", "recency", "coverage"].map((k) => <span key={k} className="pill">{k}: {cc.factors[k]}</span>)}<span className="pill">{cc.factors.contradiction}</span></div>}</div>
        {c.communities?.length > 0 && <div><div className="eyebrow">Fan communities</div><div className="row">{c.communities.map((x) => <span key={x.id} className="pill">{x.title}</span>)}</div></div>}
        {c.codes?.length > 0 && <div><div className="eyebrow">Taxonomy codes (v{c.taxonomy_version})</div><div className="row">{[...new Set(c.codes.map((k) => k.node_id))].map((n) => <Link key={n} className="pill" to={`/w/${wid}/taxonomy?node=${n}`}>{n}</Link>)}</div></div>}
        {c.data?.uniform_relevance && <div><div className="eyebrow">Uniform relevance</div><p>{c.data.uniform_relevance}</p></div>}
        <div>
          <div className="eyebrow">Evidence ({c.evidence.length})</div>
          {c.evidence.map((e) => <div key={e.id} className="evidence-item">
            <div className={`stance ${e.stance}`}>{e.stance}</div>
            <div>
              <blockquote>“{e.excerpt}”</blockquote>
              <div className="small" style={{ marginTop: 6 }}>{e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener">{e.source_title || e.url}</a> : <span>{e.source_title || e.locator}</span>} · {e.source_type} · origin: {e.origin} · published {fmtDate(e.published_at)}{e.position ? ` · at ${e.position}` : ""}{e.is_duplicate ? " · duplicate of a source family" : ""}{e.source_confidential ? " · restricted" : ""}</div>
              <div className="small">mode: {e.evidence_mode} · locality: {e.geo_relevance} — {e.local_relevance_reason}{e.explanation ? ` · ${e.explanation}` : ""}</div>
            </div>
          </div>)}
        </div>
        {c.opportunities?.length > 0 && <div><div className="eyebrow">Used in territories</div><div className="row">{c.opportunities.map((o) => <Link key={o.id} className="pill" to={`/w/${wid}/teams/${c.team_id}/uniform?open=${o.id}`}>{o.title}</Link>)}</div></div>}
        <div><div className="eyebrow">Comments</div>{c.comments?.length ? <ul className="list-plain">{c.comments.map((m) => <li key={m.id}><b>{m.data.author}</b> <span className="small">{fmtDate(m.created_at)}</span><div>{m.data.body}</div></li>)}</ul> : <p className="small">No comments.</p>}
          {editor && <div className="row" style={{ marginTop: 8 }}><input className="input" placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn sm" onClick={addComment}>Post</button></div>}</div>
        {editor && <div className="row"><span className="small">Review state:</span>{["draft", "needs_validation", "validated", "approved_for_brief", "archived"].map((s) => <button key={s} disabled={busy || c.review_state === s} className={`btn sm ${c.review_state === s ? "" : "ghost"}`} onClick={() => setState(s)}>{s.replace(/_/g, " ")}</button>)}</div>}
        <div className="row"><button className="btn ghost sm" onClick={requestResearch}>Request deeper research</button><Link className="btn ghost sm" to={`/w/${wid}/teams/${c.team_id}/evidence`}>Open evidence library</Link></div>
        <p className="small">Approval is a human workflow state; it never follows automatically from confidence.</p>
      </div>}
    </Drawer>
  );
}
