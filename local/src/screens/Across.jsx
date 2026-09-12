import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp, useFetch } from "../lib/store.jsx";
import { Label, Empty } from "../components/ui.jsx";

export default function Across() {
  const { wid } = useParams(); const { teams } = useApp();
  const [sel, setSel] = useState(["nba-chi", "wnba-min"]);
  const { data } = useFetch(sel.length ? `/workspaces/${wid}/compare?teams=${sel.join(",")}` : null, [sel.join(",")]);
  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4));
  const nodes = data?.nodes || []; const layers = ["motivation", "expression", "growth", "product_role", "local_context"];
  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || id;
  const allCodes = [...new Set((data?.teams || []).flatMap((t) => Object.keys(t.codes)))];
  return (
    <main className="wrap" style={{ paddingTop: 30 }}>
      <div className="eyebrow">Across teams</div><h2 className="section">Shared themes, local meanings</h2>
      <p className="lede">Compare selected markets on shared taxonomy themes while preserving each theme's local meaning. Identify similarities, and stories that should remain exclusive to one team. Counts are coding counts on claims, not fan prevalence, and never rank teams by raw volume.</p>
      <div className="row" style={{ marginTop: 14 }}>{teams.filter((t) => t.status === "active").map((t) => <button key={t.id} className={`btn sm ${sel.includes(t.id) ? "" : "ghost"}`} style={sel.includes(t.id) ? { background: t.colors?.[0], borderColor: t.colors?.[0] } : {}} onClick={() => toggle(t.id)}>{t.nickname}</button>)}</div>
      {data?.teams?.length ? <>
        {layers.map((layer) => { const codes = allCodes.filter((c) => nodes.find((n) => n.id === c)?.layer === layer); if (!codes.length) return null; return <div key={layer} style={{ marginTop: 26 }}><h3 className="headline">{layer.replace("_", " ")}</h3><div style={{ overflowX: "auto" }}><table className="data" style={{ marginTop: 8 }}><thead><tr><th>Theme</th>{data.teams.map((t) => <th key={t.team.id}>{t.team.name}</th>)}</tr></thead><tbody>{codes.map((c) => <tr key={c}><td><b>{nodeName(c)}</b><div className="small mono">{c}</div></td>{data.teams.map((t) => { const local = t.claims.filter((cl) => true); const n = t.codes[c] || 0; return <td key={t.team.id}>{n ? <><span className="pill">{n} claim{n === 1 ? "" : "s"}</span></> : <span className="small">not coded</span>}</td>; })}</tr>)}</tbody></table></div></div>; })}
        <h3 className="headline" style={{ marginTop: 30 }}>Local meaning by team</h3>
        <div className="grid cols-2" style={{ marginTop: 10 }}>{data.teams.map((t) => <div key={t.team.id} className="card"><h3 style={{ color: t.team.colors?.[0] }}>{t.team.name}</h3><ul className="list-plain">{t.claims.slice(0, 6).map((c) => <li key={c.id}><Label kind={c.label} /> <Link to={`/w/${wid}/teams/${t.team.id}?claim=${c.id}`}>{c.headline || c.statement}</Link></li>)}{!t.claims.length && <li className="small">No findings yet.</li>}</ul></div>)}</div>
        <h3 className="headline" style={{ marginTop: 30 }}>Exclusive vs shareable territories</h3>
        <table className="data" style={{ marginTop: 8 }}><thead><tr><th>Team</th><th>Territory</th><th>Exclusive to this team?</th><th>Name-swap test</th></tr></thead><tbody>{data.teams.flatMap((t) => t.opportunities.map((o) => <tr key={o.id}><td>{t.team.name}</td><td><Link to={`/w/${wid}/teams/${t.team.id}/uniform?open=${o.id}`}>{o.title}</Link></td><td>{o.exclusive === true ? "Yes — keep exclusive" : o.exclusive === false ? "Shareable pattern; local meaning differs" : "Unassessed"}</td><td className="small">{o.name_swap}</td></tr>))}</tbody></table>
      </> : <Empty>Select teams to compare.</Empty>}
    </main>
  );
}
