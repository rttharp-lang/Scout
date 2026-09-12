import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { StoryGrid } from "../../components/Stories.jsx";
import { Label, Empty, Drawer, Demo } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { useWorkspace } from "../../lib/store.jsx";

const STAGES = ["relevance", "access", "welcome", "reward", "continuity", "advocacy", "disengagement", "reactivation"];

export default function Growth({ d, open, reload }) {
  const { wid } = useParams(); const ws = useWorkspace(wid); const editor = ["editor", "admin"].includes(ws?.role);
  const [sel, setSel] = useState(null); const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", target_community: "", unmet_motivation_or_barrier: "", mechanism: "", stage: "access", outcome_metric: "", alternative_explanations: "", potential_action: "", validation_plan: "", product_can_influence: "" });
  const byStage = (s) => d.growth.filter((g) => String(g.data.stage || "").toLowerCase().includes(s));
  const save = async () => { await api.post(`/workspaces/${wid}/entities/growth_hypothesis`, { team_id: d.team.id, title: form.title, status: "draft", data: { ...form, alternative_explanations: form.alternative_explanations.split("\n").filter(Boolean), claim_ids: [] } }); setAdding(false); reload(); };
  return (<>
    <section className="wrap block" style={{ borderTop: 0 }}>
      <div className="eyebrow">Fandom growth</div><h2 className="section">What attracts, converts, retains, loses</h2>
      <p className="lede">Growth is defined before it is measured. Each hypothesis names a target community, a barrier or unmet motivation, a mechanism, an outcome metric, alternatives, and a validation plan. Plausible drivers are never reported as demonstrated causes.</p>
      <h3 className="headline" style={{ marginTop: 24 }}>Outcome definitions</h3>
      {d.outcomes.length ? <table className="data" style={{ marginTop: 8 }}><thead><tr><th>Outcome</th><th>Population</th><th>Geography</th><th>Horizon</th><th>Metric definition</th><th>Baseline</th><th>Measurement</th></tr></thead><tbody>{d.outcomes.map((o) => <tr key={o.id}><td><b>{o.title}</b><div className="small">{o.data.outcome}</div></td><td>{o.data.population}</td><td>{o.data.geography}</td><td>{o.data.horizon}</td><td>{o.data.metric_definition}</td><td>{o.data.baseline}</td><td className="small">{o.data.measurement_status}</td></tr>)}</tbody></table> : <Empty>No outcome definitions yet. Define the primary outcome, population, geography, horizon, metric and baseline before measuring anything.</Empty>}
    </section>
    <section className="wrap block">
      <div className="row between"><h3 className="headline">Growth-driver map by journey stage</h3>{editor && <button className="btn sm" onClick={() => setAdding(true)}>Add hypothesis</button>}</div>
      <p className="small">Non-linear: people skip, loop and leave. Insider codes can strengthen established fandom while making entry difficult.</p>
      <div className="grid cols-4" style={{ marginTop: 14 }}>{STAGES.map((s) => <div key={s} className="card flat" style={{ borderStyle: byStage(s).length ? "solid" : "dashed" }}><div className="eyebrow">{s}</div>{byStage(s).length ? byStage(s).map((g) => <button key={g.id} className="card" style={{ textAlign: "left", marginTop: 8, width: "100%" }} onClick={() => setSel(g)}><div className="row"><span className="chip state">{g.status.replace(/_/g, " ")}</span><Demo on={g.data.demo} /></div><b>{g.title}</b><div className="small">{g.data.target_community}</div></button>) : <p className="small">No hypothesis at this stage.</p>}</div>)}</div>
    </section>
    <section className="wrap block"><h3 className="headline">Growth findings</h3><div style={{ marginTop: 14 }}><StoryGrid claims={d.claims.filter((c) => c.section === "growth")} onOpen={open} /></div></section>
    <Drawer open={Boolean(sel)} onClose={() => setSel(null)} title={sel?.title}>{sel && <div className="stack">
      <div className="row"><span className="chip hypothesis">growth hypothesis</span><span className="chip state">{sel.status.replace(/_/g, " ")}</span><span className="chip state">stage: {sel.data.stage}</span></div>
      <dl className="kv">{[["Target community", sel.data.target_community], ["Unmet motivation or barrier", sel.data.unmet_motivation_or_barrier], ["Proposed mechanism", sel.data.mechanism], ["Outcome metric", sel.data.outcome_metric], ["Potential action", sel.data.potential_action], ["What product can influence", sel.data.product_can_influence], ["Owner", sel.data.owner], ["Validation plan", sel.data.validation_plan]].filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
      <div><div className="eyebrow">Alternative explanations</div><ul>{(sel.data.alternative_explanations || []).map((a, i) => <li key={i}>{a}</li>)}</ul></div>
      <div><div className="eyebrow">Supporting and conflicting findings</div><ul>{(sel.data.claim_ids || []).map((id) => { const c = d.claims.find((x) => x.id === id); return c ? <li key={id}><Label kind={c.label} /> <a href="#" onClick={(e) => { e.preventDefault(); open(id); }}>{c.headline}</a>{c.contradictions > 0 ? <span className="small"> · has contradicting evidence</span> : null}</li> : null; })}</ul></div>
      <p className="small">Measured causal effect: none. Without consented cohort or longitudinal data this remains a plausible driver with a validation plan.</p>
      {editor && <div className="row">{["draft", "needs_validation", "validated", "archived"].map((s) => <button key={s} className={`btn sm ${sel.status === s ? "" : "ghost"}`} onClick={async () => { await api.patch(`/workspaces/${wid}/entities/growth_hypothesis/${sel.id}`, { status: s }); setSel({ ...sel, status: s }); reload(); }}>{s.replace(/_/g, " ")}</button>)}</div>}
    </div>}</Drawer>
    <Drawer open={adding} onClose={() => setAdding(false)} title="New growth hypothesis">
      <div className="stack">{[["title", "Title"], ["target_community", "Target community"], ["unmet_motivation_or_barrier", "Unmet motivation or barrier"], ["mechanism", "Proposed mechanism"], ["outcome_metric", "Outcome metric (defined)"], ["potential_action", "Potential action"], ["validation_plan", "Validation plan"], ["product_can_influence", "What product can influence"]].map(([k, l]) => <div key={k}><label className="field">{l}</label><input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>)}
        <div><label className="field">Journey stage</label><select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="field">Alternative explanations (one per line)</label><textarea className="input" value={form.alternative_explanations} onChange={(e) => setForm({ ...form, alternative_explanations: e.target.value })} /></div>
        <button className="btn" onClick={save} disabled={!form.title}>Save hypothesis</button></div>
    </Drawer>
  </>);
}
