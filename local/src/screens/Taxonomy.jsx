import React, { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, fmtDate } from "../lib/api.js";
import { useApp, useWorkspace, useFetch } from "../lib/store.jsx";
import { Label, Empty, Drawer } from "../components/ui.jsx";

export default function Taxonomy() {
  const { wid } = useParams(); const ws = useWorkspace(wid); const { teams } = useApp(); const editor = ["editor", "admin"].includes(ws?.role); const admin = ws?.role === "admin";
  const [params] = useSearchParams();
  const [version, setVersion] = useState(""); const { data, reload } = useFetch(`/workspaces/${wid}/taxonomy${version ? `?version=${version}` : ""}`, [wid, version]);
  const { data: agreement } = useFetch(`/workspaces/${wid}/coding/agreement`, [wid]);
  const { data: studies, reload: reloadStudies } = useFetch(`/workspaces/${wid}/entities/validation_study`, [wid]);
  const [layer, setLayer] = useState("motivation"); const [sel, setSel] = useState(params.get("node") || null); const [propose, setPropose] = useState(null); const [study, setStudy] = useState(null); const [q, setQ] = useState("");
  const [form, setForm] = useState({ kind: "add", rationale: "", payload: { layer: "motivation", parent_id: "", name: "", definition: "", inclusion: "", exclusion: "", team_id: "" } });
  const nodes = useMemo(() => (data?.nodes || []).filter((n) => n.layer === layer && (!q || `${n.id} ${n.name} ${n.definition}`.toLowerCase().includes(q.toLowerCase()))), [data, layer, q]);
  const node = data?.nodes.find((n) => n.id === sel);
  const submit = async () => { await api.post(`/workspaces/${wid}/taxonomy/changes`, form); setPropose(null); reload(); };
  const review = async (id, decision) => { await api.post(`/workspaces/${wid}/taxonomy/changes/${id}/review`, { decision }); reload(); };
  const tree = (parent, depth = 0) => nodes.filter((n) => (n.parent_id || null) === parent).flatMap((n) => [<li key={n.id} style={{ paddingLeft: depth * 16 }}><a href="#" onClick={(e) => { e.preventDefault(); setSel(n.id); }} style={{ fontWeight: depth ? 500 : 700 }}>{n.name}</a> <span className="small mono">{n.id}</span> <span className="small">· {n.usage} coded{n.status !== "active" ? ` · ${n.status}` : ""}{n.scope !== "shared" ? ` · ${n.scope}` : ""}</span></li>, ...tree(n.id, depth + 1)]);
  const openStudy = async (id) => setStudy(await api.get(`/workspaces/${wid}/entities/validation_study/${id}`));
  return (
    <main className="wrap" style={{ paddingTop: 30 }}>
      <div className="eyebrow">Taxonomy & validation</div><h2 className="section">Shared definitions, local branches</h2>
      <p className="lede">One framework across markets with team-local child nodes. Every node has a definition, inclusion and exclusion criteria, synonyms, examples, evidence requirements, owner and version. Findings retain the version they were coded under; renamed or merged nodes carry migration mappings.</p>
      <div className="row" style={{ marginTop: 16 }}>
        {(data?.layers || []).map((l) => <button key={l.id} className={`btn sm ${layer === l.id ? "" : "ghost"}`} onClick={() => setLayer(l.id)}>{l.label}</button>)}
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 220 }} placeholder="Search nodes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: "auto" }} value={version} onChange={(e) => setVersion(e.target.value)}><option value="">v{data?.current} (current)</option>{(data?.versions || []).map((v) => <option key={v.version} value={v.version}>v{v.version} · {fmtDate(v.created_at)}</option>)}</select>
        {editor && <button className="btn sm" onClick={() => setPropose(true)}>Propose change</button>}
      </div>
      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card"><ul className="list-plain" style={{ fontSize: 14 }}>{tree(null)}</ul></div>
        <div className="stack">
          <div className="card"><div className="eyebrow">Proposed changes (human review)</div>{data?.changes?.length ? <ul className="list-plain">{data.changes.map((c) => <li key={c.id}><div className="row"><span className="chip state">{c.kind}</span><span className={`chip ${c.status === "approved" ? "confirmed" : c.status === "rejected" ? "unavailable" : "predicted"}`}>{c.status}</span><span className="small">{fmtDate(c.created_at)}</span></div><div className="small">{c.rationale}</div><pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(c.payload)}</pre>{admin && c.status === "proposed" && <div className="row"><button className="btn sm" onClick={() => review(c.id, "approved")}>Approve → new version</button><button className="btn ghost sm" onClick={() => review(c.id, "rejected")}>Reject</button></div>}</li>)}</ul> : <p className="small">No proposals.</p>}</div>
          <div className="card"><div className="eyebrow">Coding agreement</div>{agreement ? <><p className="small">{agreement.double_coded} double-coded items · mean agreement {agreement.mean_agreement == null ? "n/a" : `${Math.round(agreement.mean_agreement * 100)}%`}. {agreement.note}</p>{agreement.items.slice(0, 8).map((i) => <div key={i.target_id} className="small">{i.target_type} {i.target_id}: {Math.round(i.agreement * 100)}% · disagreed on {i.disagreed.join(", ") || "nothing"}</div>)}</> : null}<p className="small">Periodically double-code a sample through independent reviewers; refine unclear definitions where disagreement clusters.</p></div>
          <div className="card"><div className="eyebrow">Version history & migrations</div><ul className="list-plain small">{(data?.versions || []).map((v) => <li key={v.version}><b>v{v.version}</b> · {v.note} · {fmtDate(v.created_at)}{v.migrations?.length ? <div>Migrations: {v.migrations.map((m) => `${m.from || "∅"} → ${m.to || "∅"} (${m.kind})`).join("; ")}</div> : null}</li>)}</ul></div>
        </div>
      </div>
      <h3 className="headline" style={{ marginTop: 30 }}>Validation studies</h3>
      <p className="small">Path: question → sampling plan → discussion guide → approved collection or upload → coded findings → challenge → revised explanation → decision. Agents design neutral guides; humans collect. Individual responses are restricted; viewers see aggregates.</p>
      {studies?.length ? <table className="data"><thead><tr><th>Study</th><th>Team</th><th>Kind</th><th>Status</th><th>Questions</th><th></th></tr></thead><tbody>{studies.map((s) => <tr key={s.id}><td><b>{s.title}</b></td><td>{teams.find((t) => t.id === s.team_id)?.name}</td><td>{s.data.kind}</td><td><span className="chip state">{s.status.replace(/_/g, " ")}</span></td><td>{(s.data.questions || []).length}</td><td><button className="btn ghost sm" onClick={() => openStudy(s.id)}>Open</button></td></tr>)}</tbody></table> : <Empty>No validation studies.</Empty>}
      <Drawer open={Boolean(node)} onClose={() => setSel(null)} title={node?.name}>{node && <div className="stack"><div className="row"><span className="pill mono">{node.id}</span><span className="pill">v{node.version}</span><span className="pill">{node.layer}</span><span className="pill">{node.scope}</span><span className="pill">{node.status}</span><span className="pill">owner {node.owner}</span></div><dl className="kv">{[["Definition", node.definition], ["Inclusion", node.inclusion], ["Exclusion", node.exclusion], ["Synonyms / local terms", (node.synonyms || []).join(", ")], ["Examples", (node.examples || []).join("; ")], ["Counterexamples", (node.counterexamples || []).join("; ")], ["Evidence requirements", node.evidence_requirements], ["Parent", node.parent_id], ["Usage in this workspace", `${node.usage} coded items`]].filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>{editor && <button className="btn sm" onClick={() => { setForm({ kind: "edit", rationale: "", payload: { id: node.id, fields: { definition: node.definition, inclusion: node.inclusion, exclusion: node.exclusion } } }); setPropose(true); setSel(null); }}>Propose edit</button>}</div>}</Drawer>
      <Drawer open={Boolean(propose)} onClose={() => setPropose(null)} title="Propose taxonomy change">
        <div className="stack">
          <div><label className="field">Kind</label><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{["add", "edit", "rename", "merge", "retire"].map((k) => <option key={k}>{k}</option>)}</select></div>
          {form.kind === "add" && <>{[["layer", "Layer"], ["parent_id", "Parent node ID"], ["name", "Name"], ["definition", "Plain-language definition"], ["inclusion", "Inclusion criteria"], ["exclusion", "Exclusion criteria"], ["team_id", "Team ID (leave blank for shared)"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={form.payload[k] || ""} onChange={(e) => setForm({ ...form, payload: { ...form.payload, [k]: e.target.value } })} /></div>)}</>}
          {form.kind === "edit" && <>{["definition", "inclusion", "exclusion"].map((k) => <div key={k}><label className="field">{k}</label><textarea className="input" value={form.payload.fields?.[k] || ""} onChange={(e) => setForm({ ...form, payload: { ...form.payload, fields: { ...form.payload.fields, [k]: e.target.value } } })} /></div>)}</>}
          {form.kind === "rename" && <>{[["id", "Node ID"], ["name", "New name"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={form.payload[k] || ""} onChange={(e) => setForm({ ...form, payload: { ...form.payload, [k]: e.target.value } })} /></div>)}</>}
          {form.kind === "merge" && <>{[["from", "From node IDs (comma-separated)"], ["into", "Into node ID"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={Array.isArray(form.payload[k]) ? form.payload[k].join(",") : form.payload[k] || ""} onChange={(e) => setForm({ ...form, payload: { ...form.payload, [k]: k === "from" ? e.target.value.split(",").map((s) => s.trim()) : e.target.value } })} /></div>)}</>}
          {form.kind === "retire" && <>{[["id", "Node ID"], ["replacement", "Replacement node ID (optional)"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={form.payload[k] || ""} onChange={(e) => setForm({ ...form, payload: { ...form.payload, [k]: e.target.value } })} /></div>)}</>}
          <div><label className="field">Rationale</label><textarea className="input" value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} /></div>
          <button className="btn" onClick={submit}>Submit for review</button>
        </div>
      </Drawer>
      <Drawer open={Boolean(study)} onClose={() => setStudy(null)} title={study?.title}>{study && <StudyView study={study} wid={wid} editor={editor} refresh={() => { openStudy(study.id); reloadStudies(); }} />}</Drawer>
    </main>
  );
}

function StudyView({ study, wid, editor, refresh }) {
  const [r, setR] = useState({ label: "", excerpt: "", consent: "", sample: "", coding_decisions: "", dissent: "", changes: "" });
  const add = async () => { await api.post(`/workspaces/${wid}/entities/research_response`, { team_id: study.team_id, parent_id: study.id, title: r.label, status: "restricted", data: { ...r, coding_decisions: r.coding_decisions.split(",").map((s) => s.trim()).filter(Boolean) } }); setR({ label: "", excerpt: "", consent: "", sample: "", coding_decisions: "", dissent: "", changes: "" }); refresh(); };
  return (<div className="stack">
    <div className="row"><span className="chip state">{study.status.replace(/_/g, " ")}</span><span className="pill">{study.data.kind}</span><span className="pill">{study.response_count} response{study.response_count === 1 ? "" : "s"}</span></div>
    <div><div className="eyebrow">Neutral, behavior-based questions</div><ol>{(study.data.questions || []).map((q, i) => <li key={i}>{q}</li>)}</ol></div>
    <dl className="kv">{[["Sampling", study.data.sampling], ["Recruitment", study.data.recruitment], ["Limitations", study.data.limitations]].filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
    <div className="notice">Human collection only. Never simulate respondents or contact people automatically. Outreach requires explicit authorization and permissions.</div>
    <div><div className="eyebrow">Responses</div>{study.responses ? (study.responses.length ? study.responses.map((x) => <div key={x.id} className="card" style={{ marginTop: 8 }}><b>{x.title}</b> <span className="chip state">restricted</span><blockquote style={{ marginTop: 6 }}>{x.data.excerpt}</blockquote><div className="small">Sample: {x.data.sample} · Consent: {x.data.consent} · Coding: {(x.data.coding_decisions || []).join(", ")} · Dissent: {x.data.dissent || "none"} · Resulting change: {x.data.changes}</div></div>) : <p className="small">None yet.</p>) : <p className="small">Aggregate only: {study.response_count} response(s). Individual excerpts are restricted to editors and admins.</p>}</div>
    {editor && <div className="card stack"><div className="eyebrow">Enter a human-collected response (anonymized)</div>{[["label", "Label"], ["excerpt", "Anonymized excerpt"], ["consent", "Consent / use limitation"], ["sample", "Sample context"], ["coding_decisions", "Coding decisions (node IDs, comma-separated)"], ["dissent", "Dissenting cases"], ["changes", "How this changes the explanation (affected claims/briefs)"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} /></div>)}<button className="btn sm" disabled={!r.label || !r.excerpt} onClick={add}>Store response</button></div>}
  </div>);
}
