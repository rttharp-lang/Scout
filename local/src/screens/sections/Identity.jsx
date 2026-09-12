import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StoryGrid } from "../../components/Stories.jsx";
import { Label, Empty, Drawer, Demo } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { useWorkspace } from "../../lib/store.jsx";

const STATUS = { established_theory: "Established theory", locally_supported: "Locally supported explanation", untested: "Untested hypothesis" };

export default function Identity({ d, open, reload }) {
  const { wid } = useParams(); const ws = useWorkspace(wid); const editor = ["editor", "admin"].includes(ws?.role);
  const [sel, setSel] = useState(null);
  const codeCounts = {}; for (const c of d.claims) for (const k of c.codes || []) if (k.node_id.startsWith("mot.")) codeCounts[k.node_id] = (codeCounts[k.node_id] || 0) + 1;
  const setStatus = async (p, status) => { await api.patch(`/workspaces/${wid}/entities/fan_profile/${p.id}`, { status }); reload(); };
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}>
      <div className="eyebrow">Fan identity</div><h2 className="section">What this team gives people</h2>
      <p className="lede">Profiles are revisable research summaries of participation patterns, not invented people or population segments. A person can belong to several, and change. No percentages are shown because none are measured.</p>
      {d.profiles.length ? <div className="grid cols-3" style={{ marginTop: 20 }}>{d.profiles.map((p) => <button key={p.id} className="card" style={{ textAlign: "left" }} onClick={() => setSel(p)}><div className="row"><span className="chip state">{p.status.replace(/_/g, " ")}</span><Demo on={p.data.demo} /></div><h3 style={{ marginTop: 8, fontSize: 26 }}>{p.title}</h3><p className="small">{p.data.participation_pattern}</p><p style={{ fontSize: 14 }}>{p.data.values_and_feelings}</p><div className="small">Entry: {(p.data.entry_routes || []).join(", ")}</div></button>)}</div> : <Empty>No fan profiles yet. Profiles are synthesized from reviewed claims after a research run.</Empty>}
    </section>
    <section className="wrap block">
      <div className="grid cols-2">
        <div><h3 className="headline">Motivation → expression</h3><p className="small">How often each proposed motivation is coded on this team's claims (coding counts, not prevalence among fans).</p>
          <table className="data" style={{ marginTop: 8 }}><tbody>{Object.entries(codeCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => <tr key={k}><td><Link to={`/w/${wid}/taxonomy?node=${k}`}>{k}</Link></td><td><div className="bar" style={{ width: 160 }}><i style={{ width: `${Math.min(100, n * 20)}%` }} /></div></td><td>{n} claim{n === 1 ? "" : "s"}</td><td className="small">{d.claims.filter((c) => (c.codes || []).some((x) => x.node_id === k)).flatMap((c) => (c.codes || []).filter((x) => x.node_id.startsWith("exp.")).map((x) => x.node_id.replace("exp.", ""))).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</td></tr>)}{!Object.keys(codeCounts).length && <tr><td className="small">No motivation codes yet.</td></tr>}</tbody></table></div>
        <div><h3 className="headline">Motivation hypotheses</h3><p className="small">Each states whether it rests on established theory, a locally supported explanation, or an untested hypothesis, and what would disconfirm it.</p>
          {d.motivation_hypotheses.length ? <ul className="list-plain">{d.motivation_hypotheses.map((h) => <li key={h.id}><div className="row"><span className="chip hypothesis">{STATUS[h.data.explanation_status] || h.data.explanation_status}</span><span className="chip state">{h.status.replace(/_/g, " ")}</span><Link className="small" to={`/w/${wid}/taxonomy?node=${h.data.motivation_node}`}>{h.data.motivation_node}</Link></div><b>{h.title}</b><div>{h.data.hypothesis}</div><div className="small">Disconfirm: {h.data.disconfirm}</div>{h.data.claim_ids?.length > 0 && <div className="small">{h.data.claim_ids.map((id) => { const c = d.claims.find((x) => x.id === id); return c ? <a key={id} href="#" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); open(id); }}>{c.headline}</a> : null; })}</div>}</li>)}</ul> : <Empty>No motivation hypotheses yet.</Empty>}</div>
      </div>
    </section>
    <section className="wrap block"><h3 className="headline">Identity findings</h3><div style={{ marginTop: 14 }}><StoryGrid claims={d.claims.filter((c) => c.section === "identity")} onOpen={open} /></div></section>
    <section className="wrap block"><h3 className="headline">Validation</h3><p className="small">Direct links from profiles to human research. Agents never simulate respondents.</p>{d.validation.length ? <ul className="list-plain">{d.validation.map((v) => <li key={v.id}><b>{v.title}</b> <span className="chip state">{v.status.replace(/_/g, " ")}</span><div className="small">{(v.data.questions || []).length} neutral questions · {v.data.sampling}</div><Link className="small" to={`/w/${wid}/taxonomy?study=${v.id}`}>Open in Taxonomy & Validation →</Link></li>)}</ul> : <Empty>No validation studies yet.</Empty>}</section>
    <Drawer open={Boolean(sel)} onClose={() => setSel(null)} title={sel?.title}>{sel && <div className="stack">
      <div className="row"><span className="chip state">{sel.status.replace(/_/g, " ")}</span><Demo on={sel.data.demo} /></div>
      <dl className="kv">{[["First entry into fandom", (sel.data.entry_routes || []).join("; ")], ["Relationships that give it meaning", sel.data.relationships], ["Values, aspirations, feelings", sel.data.values_and_feelings], ["Participation habits", sel.data.participation_pattern], ["Aesthetic preferences and why", sel.data.aesthetic], ["Barriers and frustrations", sel.data.barriers], ["Important moments", sel.data.moments], ["Uniform details valued / rejected", sel.data.uniform_details], ["Sample and recruitment context", sel.data.sample_note]].filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
      <div><div className="eyebrow">Competing explanations</div><ul>{(sel.data.competing_explanations || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      <div><div className="eyebrow">Unanswered questions</div><ul>{(sel.data.open_questions || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      <div><div className="eyebrow">Evidence-backed claims</div><ul>{(sel.data.claim_ids || []).map((id) => { const c = d.claims.find((x) => x.id === id); return c ? <li key={id}><Label kind={c.label} /> <a href="#" onClick={(e) => { e.preventDefault(); open(id); }}>{c.headline}</a></li> : null; })}</ul></div>
      {editor && <div className="row"><span className="small">Validation status:</span>{["draft", "needs_validation", "validated", "archived"].map((s) => <button key={s} className={`btn sm ${sel.status === s ? "" : "ghost"}`} onClick={() => { setStatus(sel, s); setSel({ ...sel, status: s }); }}>{s.replace(/_/g, " ")}</button>)}</div>}
    </div>}</Drawer>
  </>);
}
