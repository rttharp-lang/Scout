import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, fmtDate } from "../../lib/api.js";
import { useWorkspace, useApp } from "../../lib/store.jsx";
import { Label, Confidence, Empty, Drawer, Demo } from "../../components/ui.jsx";

const SCORE_KEYS = ["locality", "emotional_meaning", "distinctiveness", "longevity", "feasibility", "evidence_strength"];

export default function UniformLab({ d, open, reload }) {
  const { wid } = useParams(); const ws = useWorkspace(wid); const { user } = useApp(); const editor = ["editor", "admin"].includes(ws?.role);
  const [params, setParams] = useSearchParams();
  const [sel, setSel] = useState(null); const [compare, setCompare] = useState([]); const [showScores, setShowScores] = useState(false);
  useEffect(() => { const id = params.get("open"); if (id) api.get(`/workspaces/${wid}/entities/opportunity/${id}`).then(setSel).catch(() => {}); }, [params.get("open")]);
  const openT = (o) => { const p = new URLSearchParams(params); p.set("open", o.id); setParams(p, { replace: true }); };
  const closeT = () => { setSel(null); const p = new URLSearchParams(params); p.delete("open"); setParams(p, { replace: true }); };
  const toggleCompare = (id) => setCompare((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3));
  const claim = (id) => d.claims.find((c) => c.id === id);
  const cmp = compare.map((id) => d.opportunities.find((o) => o.id === id)).filter(Boolean);
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}>
      <div className="row between"><div><div className="eyebrow">Uniform opportunities · Uniform Lab</div><h2 className="section">Territories with traceable reasoning</h2></div><label className="row small"><input type="checkbox" checked={showScores} onChange={(e) => setShowScores(e.target.checked)} /> Show optional scoring</label></div>
      <p className="lede">Three to five differentiated territories per sufficiently researched team; none forced when evidence is weak. Each traces motivation → local context → community → expression → moment → proposed response and passes a name-swap test. Design implications are proposals, clearly labeled.</p>
      {d.opportunities.length ? <div className="grid cols-3" style={{ marginTop: 20 }}>{d.opportunities.map((o) => <div key={o.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row"><Label kind="proposal" /><span className="chip state">{o.status.replace(/_/g, " ")}</span><span className="chip state">{o.data.durability === "uniform" ? "future uniform" : o.data.durability === "activation" ? "faster activation" : "durability unclear"}</span><Demo on={o.data.demo} /></div>
        <div style={{ aspectRatio: "16/9", background: "var(--team)", color: "var(--team-ink)", borderRadius: 4, display: "flex", alignItems: "flex-end", padding: 12 }}><span className="display" style={{ fontSize: 34 }}>{o.title}</span></div>
        <p style={{ margin: 0 }}>{o.data.proposition}</p>
        <div className="small">Serves: {o.data.community} · Target: {o.data.target_season || "undetermined"} · Deadline: {o.data.decision_deadline ? fmtDate(o.data.decision_deadline) : "unset"}{o.data.decision_deadline && o.data.decision_deadline < new Date().toISOString().slice(0, 10) ? " (passed)" : ""}</div>
        {showScores && o.data.scoring && <div className="row small">{SCORE_KEYS.map((k) => <span key={k} className="pill">{k.replace("_", " ")} {o.data.scoring[k] ?? "–"}</span>)}</div>}
        <div className="row"><button className="btn sm" onClick={() => openT(o)}>Open</button><button className={`btn sm ${compare.includes(o.id) ? "" : "ghost"}`} onClick={() => toggleCompare(o.id)}>{compare.includes(o.id) ? "In comparison" : "Compare"}</button></div>
      </div>)}</div> : <Empty>No territories yet. Territories follow reviewed research; the synthesizer withholds them when evidence is weak.</Empty>}
    </section>
    {cmp.length > 1 && <section className="wrap block"><h3 className="headline">Side-by-side evidence comparison</h3><div className="scroll" style={{ overflowX: "auto" }}><table className="data" style={{ marginTop: 10, minWidth: 900 }}><thead><tr><th></th>{cmp.map((o) => <th key={o.id}>{o.title}</th>)}</tr></thead><tbody>
      {[["Human truth", (o) => o.data.human_truth], ["Community served", (o) => o.data.community], ["Why this team", (o) => o.data.why_this_team], ["Name-swap test", (o) => o.data.name_swap_test], ["Supporting findings", (o) => (o.data.supporting_claim_ids || []).map((id) => claim(id)?.headline).filter(Boolean).join("; ")], ["Conflicting findings", (o) => (o.data.conflicting_claim_ids || []).map((id) => claim(id)?.headline).filter(Boolean).join("; ") || "none"], ["Evidence strength (computed)", (o) => { const cs = (o.data.supporting_claim_ids || []).map((id) => claim(id)?.confidence).filter(Boolean); return cs.length ? cs.join(", ") : "no linked claims"; }], ["Existing vs new fans", (o) => `${o.data.existing_fan_value} / ${o.data.new_fan_relevance}`], ["Tension", (o) => o.data.tension], ["Durability", (o) => o.data.durability], ["Preserve / avoid / validate", (o) => o.data.preserve_avoid_validate], ["Next question", (o) => o.data.next_question]].map(([k, f]) => <tr key={k}><th>{k}</th>{cmp.map((o) => <td key={o.id}>{f(o)}</td>)}</tr>)}
      {showScores && SCORE_KEYS.map((k) => <tr key={k}><th>{k.replace("_", " ")} (editable)</th>{cmp.map((o) => <td key={o.id}>{o.data.scoring?.[k] ?? "–"}</td>)}</tr>)}
    </tbody></table></div></section>}
    <Territory sel={sel} onClose={closeT} d={d} open={open} editor={editor} wid={wid} user={user} reload={reload} showScores={showScores} />
  </>);
}

function Territory({ sel, onClose, d, open, editor, wid, user, reload, showScores }) {
  const [tab, setTab] = useState("story"); const [brief, setBrief] = useState(""); const [comment, setComment] = useState(""); const [scores, setScores] = useState({});
  const [detail, setDetail] = useState(null);
  const load = () => sel && api.get(`/workspaces/${wid}/entities/opportunity/${sel.id}`).then((x) => { setDetail(x); setScores(x.data.scoring || {}); setBrief(x.versions?.[0]?.data?.summary || ""); });
  useEffect(() => { setDetail(null); if (sel) load(); }, [sel?.id]);
  if (!sel) return null;
  const o = detail || sel; const claim = (id) => d.claims.find((c) => c.id === id) || o.claims?.find((c) => c.id === id);
  const setStatus = async (status) => { const note = ["approved_for_brief", "validated"].includes(status) ? window.prompt("Decision note (recorded with your name):") : null; await api.patch(`/workspaces/${wid}/entities/opportunity/${o.id}`, { status, decision_note: note }); load(); reload(); };
  const saveBrief = async () => { await api.post(`/workspaces/${wid}/entities/brief_version`, { team_id: o.team_id, parent_id: o.id, title: `Brief: ${o.title}`, status: "draft", data: { summary: brief, opportunity_id: o.id, target_season: o.data.target_season, unresolved: o.data.preserve_avoid_validate, contradictions: (o.data.conflicting_claim_ids || []).map((id) => claim(id)?.headline).filter(Boolean) } }); load(); };
  const saveScores = async () => { await api.patch(`/workspaces/${wid}/entities/opportunity/${o.id}`, { data: { scoring: { ...scores, edited_by: user?.name, edited_at: new Date().toISOString() } } }); load(); reload(); };
  const addComment = async () => { if (!comment.trim()) return; await api.post(`/workspaces/${wid}/entities/comment`, { team_id: o.team_id, parent_id: o.id, data: { body: comment, target_type: "opportunity", target_id: o.id } }); setComment(""); load(); };
  const assignValidation = async () => { const q = window.prompt("Validation question to assign (neutral, behavior-based):", o.data.next_question || ""); if (!q) return; await api.post(`/workspaces/${wid}/entities/validation_study`, { team_id: o.team_id, title: `Validate: ${o.title}`, status: "draft", parent_id: o.id, data: { kind: "discussion_guide", questions: [q], sampling: "to define", limitations: "to define", opportunity_id: o.id, human_collection_required: true } }); alert("Validation study created."); };
  const chain = o.data.chain || {};
  return (
    <Drawer open={Boolean(sel)} onClose={onClose} title={o.title} width="min(900px, 100%)">
      <div className="row"><Label kind="proposal" /><span className="chip state">{o.status.replace(/_/g, " ")}</span><span className="chip state">{o.data.durability}</span><Demo on={o.data.demo} /><span className="small">Owner: {o.data.owner || "unassigned"} · Target {o.data.target_season || "undetermined"} · Deadline {o.data.decision_deadline ? fmtDate(o.data.decision_deadline) : "unset"}</span></div>
      <div className="row" style={{ margin: "12px 0" }}>{[["story", "Story & chain"], ["evidence", "Evidence"], ["design", "Design implications"], ["brief", "Brief & decisions"]].map(([k, l]) => <button key={k} className={`btn sm ${tab === k ? "" : "ghost"}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "story" && <div className="stack">
        <p className="lede" style={{ fontSize: 17 }}>{o.data.proposition}</p>
        <div className="panel"><div className="eyebrow">Local human truth</div><p style={{ margin: "6px 0 0" }}>{o.data.human_truth}</p><div className="small">Observed behavior, stated motivation and interpretation are kept distinct in the linked findings.</div></div>
        <div className="chain">{["motivation", "local_context", "community", "expression", "moment", "response"].map((k) => <div key={k}><b>{k.replace("_", " ")}</b>{chain[k] || "—"}</div>)}</div>
        <dl className="kv">{[["Why this team, not any city", o.data.why_this_team], ["Name-swap test", o.data.name_swap_test], ["Existing-fan value", o.data.existing_fan_value], ["New-fan relevance", o.data.new_fan_relevance], ["Tension between the two", o.data.tension], ["Growth contribution and limits", o.data.growth_contribution], ["Relevant moments and durability", `${o.data.moments || ""} ${o.data.durability ? `· ${o.data.durability}` : ""}`], ["Existing uniform overlap", o.data.existing_overlap], ["Preserve / avoid / validate / develop", o.data.preserve_avoid_validate], ["Constraints", o.data.constraints ? Object.entries(o.data.constraints).map(([k, v]) => `${k}: ${v}`).join(" · ") : "unknown (unresolved)"], ["Next research question", o.data.next_question]].filter(([, v]) => v && v.trim()).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        {showScores && <div><div className="eyebrow">Optional transparent scoring (editable; creative judgment stays visible)</div><div className="scores">{SCORE_KEYS.map((k) => <div key={k}><label>{k.replace("_", " ")}</label><input type="range" min="0" max="5" value={scores[k] ?? 0} disabled={!editor} onChange={(e) => setScores({ ...scores, [k]: Number(e.target.value) })} /><span className="small">{scores[k] ?? "–"}</span></div>)}</div>{editor && <button className="btn sm" style={{ marginTop: 8 }} onClick={saveScores}>Save scores</button>}<p className="small">Scores never rank territories automatically; they sit beside the evidence comparison.</p></div>}
      </div>}
      {tab === "evidence" && <div className="stack">
        <div><div className="eyebrow">Supporting findings</div>{(o.data.supporting_claim_ids || []).map((id) => { const c = claim(id); return c ? <div key={id} className="evidence-item"><div className="stance supports">supports</div><div><Label kind={c.label} /> <Confidence level={c.confidence} /> <a href="#" onClick={(e) => { e.preventDefault(); open(id); }}><b>{c.headline}</b></a><div className="small">{c.statement}</div></div></div> : null; })}</div>
        <div><div className="eyebrow">Conflicting findings</div>{(o.data.conflicting_claim_ids || []).length ? (o.data.conflicting_claim_ids || []).map((id) => { const c = claim(id); return c ? <div key={id} className="evidence-item"><div className="stance contradicts">conflicts</div><div><Label kind={c.label} /> <a href="#" onClick={(e) => { e.preventDefault(); open(id); }}><b>{c.headline}</b></a><div className="small">{c.statement}</div></div></div> : null; }) : <p className="small">None recorded.</p>}</div>
        <div><div className="eyebrow">Linked moments</div><ul>{(o.data.moment_ids || []).map((id) => { const m = d.moments.find((x) => x.id === id); return m ? <li key={id}>{m.title} · {fmtDate(m.starts_at)} · <span className={`chip ${m.data.date_kind}`}>{m.data.date_kind}</span></li> : null; })}</ul></div>
        {o.data.review_flag && <div className="notice bad">Flagged for review: {o.data.review_flag}</div>}
      </div>}
      {tab === "design" && <div className="stack"><div className="notice">Proposals, not findings. Design implications are labeled as creative proposals and remain editable by the design team.</div><dl className="kv">{Object.entries(o.data.design_implications || {}).map(([k, v]) => <React.Fragment key={k}><dt>{k.replace("_", " ")}</dt><dd>{v}</dd></React.Fragment>)}</dl>{!Object.keys(o.data.design_implications || {}).length && <p className="small">No design implications proposed.</p>}</div>}
      {tab === "brief" && <div className="stack">
        <div><div className="eyebrow">Brief versions</div>{(o.versions || []).length ? <ul className="list-plain">{o.versions.map((v) => <li key={v.id}><b>v{v.version}</b> · <span className="chip state">{v.status.replace(/_/g, " ")}</span> · <span className="small">{fmtDate(v.created_at)} · {v.data.author}</span><div>{v.data.summary}</div>{v.data.change_note && <div className="small">Change: {v.data.change_note}</div>}{v.data.contradictions?.length > 0 && <div className="small">Contradictions retained: {v.data.contradictions.join("; ")}</div>}<div className="small">Target season: {v.data.target_season || "undetermined"} · Unresolved: {Array.isArray(v.data.unresolved) ? v.data.unresolved.join("; ") : v.data.unresolved}</div></li>)}</ul> : <p className="small">No brief yet.</p>}</div>
        {editor && <div><label className="field">New brief version (summary)</label><textarea className="input" value={brief} onChange={(e) => setBrief(e.target.value)} /><div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={saveBrief}>Save new version</button><button className="btn ghost sm" onClick={assignValidation}>Assign validation</button><a className="btn ghost sm" href={`/api/workspaces/${wid}/teams/${o.team_id}/export/briefs`} target="_blank" rel="noreferrer">Export briefs (JSON)</a></div></div>}
        <div><div className="eyebrow">Decisions</div>{(o.decisions || []).length ? <ul className="list-plain">{o.decisions.map((x) => <li key={x.id}><b>{x.title}</b> <span className="small">{x.data.by || x.data.decided_by} · {fmtDate(x.data.at || x.created_at)}</span><div className="small">{x.data.rationale || x.data.note}</div></li>)}</ul> : <p className="small">No decisions recorded.</p>}</div>
        <div><div className="eyebrow">Comments</div>{(o.comments || []).length ? <ul className="list-plain">{o.comments.map((m) => <li key={m.id}><b>{m.data.author}</b> <span className="small">{fmtDate(m.created_at)}</span><div>{m.data.body}</div></li>)}</ul> : <p className="small">No comments.</p>}{editor && <div className="row" style={{ marginTop: 8 }}><input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment" /><button className="btn sm" onClick={addComment}>Post</button></div>}</div>
        {editor && <div className="row"><span className="small">Review state:</span>{["draft", "needs_validation", "validated", "approved_for_brief", "archived"].map((s) => <button key={s} className={`btn sm ${o.status === s ? "" : "ghost"}`} onClick={() => setStatus(s)}>{s.replace(/_/g, " ")}</button>)}</div>}
        <p className="small">Approval is recorded as a human decision with a name and note; it never follows from an agent confidence label.</p>
      </div>}
    </Drawer>
  );
}
