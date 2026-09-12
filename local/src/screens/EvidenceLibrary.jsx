import React, { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, fmtDate } from "../lib/api.js";
import { useApp, useWorkspace, useFetch } from "../lib/store.jsx";
import { Label, Empty, Drawer } from "../components/ui.jsx";
import { ClaimDrawer } from "../components/Stories.jsx";

export default function EvidenceLibrary({ teamId: fixedTeam, embedded }) {
  const { wid } = useParams(); const { teams } = useApp(); const ws = useWorkspace(wid); const editor = ["editor", "admin"].includes(ws?.role);
  const [f, setF] = useState({ team_id: fixedTeam || "", q: "", origin: "", mode: "", stale: "", contradictions: "", status: "" });
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const { data: items, reload } = useFetch(`/workspaces/${wid}/evidence?${qs}`, [qs]);
  const [src, setSrc] = useState(null); const [claim, setClaim] = useState(null); const [upload, setUpload] = useState(false);
  const [u, setU] = useState({ team_id: fixedTeam || "", title: "", text: "", kind: "interview_notes", consent: "", use_limits: "internal research only", retention: "24 months", date: "", confidential: true });
  const openSource = async (id) => setSrc(await api.get(`/workspaces/${wid}/sources/${id}`));
  const doUpload = async () => { await api.post(`/workspaces/${wid}/uploads`, u); setUpload(false); reload(); alert("Stored with provenance. Add evidence excerpts from the source drawer."); };
  const [ex, setEx] = useState(null);
  const addExcerpt = async () => { if (!ex?.excerpt) return; await api.post(`/workspaces/${wid}/evidence`, { source_id: src.id, excerpt: ex.excerpt, evidence_mode: ex.mode || "testimony", geo_relevance: ex.geo || "unknown", local_relevance_reason: ex.why || "", codes: (ex.codes || "").split(",").map((s) => s.trim()).filter(Boolean) }); setEx(null); openSource(src.id); reload(); };
  return (
    <div>
      {!embedded && <><div className="eyebrow">Evidence library</div><h2 className="section">Claims, sources, uploads, contradictions</h2></>}
      {embedded && <h3 className="headline">Evidence for this team</h3>}
      <div className="row" style={{ marginTop: 14 }}>
        {!fixedTeam && <select className="input" style={{ width: "auto" }} value={f.team_id} onChange={(e) => setF({ ...f, team_id: e.target.value })}><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search excerpts, titles, topics" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="input" style={{ width: "auto" }} value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })}><option value="">Any origin</option>{["fan", "team", "paid", "independent", "league", "internal", "unknown"].map((o) => <option key={o}>{o}</option>)}</select>
        <select className="input" style={{ width: "auto" }} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="">Any mode</option>{["behavior", "testimony", "interpretation"].map((o) => <option key={o}>{o}</option>)}</select>
        <label className="row small"><input type="checkbox" checked={f.stale === "1"} onChange={(e) => setF({ ...f, stale: e.target.checked ? "1" : "" })} /> Stale (&gt;2y or undated)</label>
        <label className="row small"><input type="checkbox" checked={f.contradictions === "1"} onChange={(e) => setF({ ...f, contradictions: e.target.checked ? "1" : "" })} /> Contradictions only</label>
        <div className="spacer" />
        {editor && <button className="btn sm" onClick={() => setUpload(true)}>Upload research</button>}
        {f.team_id && <a className="btn ghost sm" href={`/api/workspaces/${wid}/teams/${f.team_id}/export/dossier`} target="_blank" rel="noreferrer">Export dossier (JSON)</a>}
      </div>
      {items?.length ? <table className="data" style={{ marginTop: 14 }}><thead><tr><th>Excerpt</th><th>Source</th><th>Origin / mode / locality</th><th>Dates</th><th>Claims</th></tr></thead><tbody>{items.map((e) => <tr key={e.id}><td style={{ maxWidth: 420 }}><blockquote style={{ fontSize: 14 }}>“{e.excerpt}”</blockquote>{e.codes?.length > 0 && <div className="small">{[...new Set(e.codes.map((c) => c.node_id))].join(", ")}</div>}{e.confidential ? <span className="chip state">restricted</span> : null}</td><td><a href="#" onClick={(ev) => { ev.preventDefault(); openSource(e.source_id); }}>{e.source_title || e.locator || e.url}</a><div className="small">{e.source_type} · {e.publisher || ""}{e.is_duplicate ? " · duplicate (family collapsed)" : ""}</div></td><td className="small">{e.origin} · {e.evidence_mode} · {e.geo_relevance}<div>{e.local_relevance_reason}</div></td><td className="small">pub {fmtDate(e.published_at)}<br />retrieved {fmtDate(e.created_at)}</td><td className="small">{e.claims.map((c) => <div key={c.id}><span className={`stance ${c.stance}`} style={{ fontWeight: 700, color: c.stance === "contradicts" ? "var(--bad)" : c.stance === "supports" ? "var(--ok)" : "var(--mute)" }}>{c.stance}</span> <a href="#" onClick={(ev) => { ev.preventDefault(); setClaim(c.id); }}>{c.headline}</a></div>)}</td></tr>)}</tbody></table> : <Empty>No evidence matches. {editor ? "Upload research or launch a run." : ""}</Empty>}
      <Drawer open={Boolean(src)} onClose={() => setSrc(null)} title={src?.title || "Source"}>{src && <div className="stack">
        <dl className="kv">{[["Locator", src.url ? <a href={src.url} target="_blank" rel="noreferrer noopener">{src.url}</a> : src.locator], ["Type / origin", `${src.source_type} · ${src.origin}`], ["Publisher / author", `${src.publisher || "—"} / ${src.author || "—"}`], ["Published / event / retrieved", `${fmtDate(src.published_at)} / ${fmtDate(src.event_at)} / ${fmtDate(src.retrieved_at)}`], ["Source family", src.family?.length ? `${src.family.length} related (duplicates collapsed)` : "independent"], ["Access limitations", JSON.stringify(src.access)], ["Retention", JSON.stringify(src.retention)], ["Confidential", src.confidential ? "yes (restricted to editors/admins; excluded from viewer exports)" : "no"]].map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        {src.data?.text && <details><summary>Stored text (treated as untrusted data)</summary><pre className="mono" style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto", background: "#fff", padding: 10 }}>{src.data.text}</pre></details>}
        <div><div className="eyebrow">Evidence excerpts from this source ({src.evidence.length})</div>{src.evidence.map((e) => <blockquote key={e.id} style={{ marginTop: 8 }}>“{e.excerpt}” <span className="small">— {e.evidence_mode}, {e.geo_relevance}</span></blockquote>)}</div>
        {editor && (ex ? <div className="stack card"><label className="field">Verbatim excerpt</label><textarea className="input" value={ex.excerpt || ""} onChange={(e) => setEx({ ...ex, excerpt: e.target.value })} /><div className="grid cols-3"><div><label className="field">Mode</label><select className="input" value={ex.mode || "testimony"} onChange={(e) => setEx({ ...ex, mode: e.target.value })}>{["behavior", "testimony", "interpretation"].map((m) => <option key={m}>{m}</option>)}</select></div><div><label className="field">Locality</label><select className="input" value={ex.geo || "unknown"} onChange={(e) => setEx({ ...ex, geo: e.target.value })}>{["verified", "contextual", "unknown"].map((m) => <option key={m}>{m}</option>)}</select></div><div><label className="field">Codes (comma-separated IDs)</label><input className="input" value={ex.codes || ""} onChange={(e) => setEx({ ...ex, codes: e.target.value })} placeholder="mot.connection, exp.ritual" /></div></div><label className="field">Why locally relevant</label><input className="input" value={ex.why || ""} onChange={(e) => setEx({ ...ex, why: e.target.value })} /><div className="row"><button className="btn sm" onClick={addExcerpt}>Save excerpt</button><button className="btn ghost sm" onClick={() => setEx(null)}>Cancel</button></div></div> : <button className="btn sm" onClick={() => setEx({})}>Add evidence excerpt</button>)}
      </div>}</Drawer>
      <Drawer open={upload} onClose={() => setUpload(false)} title="Upload research (with provenance and permissions)">
        <div className="stack">
          <div className="notice">Uploads are confidential by default, stored server-side, and never sent to an external model provider unless the workspace explicitly enables it. Human collection requires consent and authorization; record them here.</div>
          {!fixedTeam && <div><label className="field">Team</label><select className="input" value={u.team_id} onChange={(e) => setU({ ...u, team_id: e.target.value })}><option value="">Select…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
          {[["title", "Title"], ["consent", "Consent / permissions"], ["use_limits", "Use limitations"], ["retention", "Retention"], ["date", "Date (YYYY-MM-DD)"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={u[k]} onChange={(e) => setU({ ...u, [k]: e.target.value })} /></div>)}
          <div><label className="field">Kind</label><select className="input" value={u.kind} onChange={(e) => setU({ ...u, kind: e.target.value })}>{["interview_notes", "fan_council_notes", "survey_export", "historical_deck", "first_party_analytics", "partner_interview", "other"].map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><label className="field">Text (anonymized)</label><textarea className="input" style={{ minHeight: 160 }} value={u.text} onChange={(e) => setU({ ...u, text: e.target.value })} /></div>
          <button className="btn" disabled={!u.team_id || !u.title || !u.text} onClick={doUpload}>Store upload</button>
        </div>
      </Drawer>
      <ClaimDrawer claimId={claim} onClose={() => setClaim(null)} />
    </div>
  );
}
