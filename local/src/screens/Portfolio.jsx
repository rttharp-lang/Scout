import React from "react";
import { Link, useParams } from "react-router-dom";
import { useFetch } from "../lib/store.jsx";
import { fmtDate } from "../lib/api.js";
import { Loading, ErrorBox } from "../components/ui.jsx";

export default function Portfolio() {
  const { wid } = useParams();
  const { data, error, loading } = useFetch(`/workspaces/${wid}/portfolio`, [wid]);
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} />;
  const researched = data.teams.filter((t) => t.researched); const not = data.teams.filter((t) => !t.researched);
  return (
    <main className="wrap" style={{ paddingTop: 30 }}>
      <div className="eyebrow">Portfolio</div>
      <h2 className="section">Where the research stands</h2>
      <div className="grid cols-3" style={{ marginTop: 24 }}>
        <div className="card"><div className="eyebrow">Researched teams</div><div className="display" style={{ fontSize: 56 }}>{researched.length}<span className="small" style={{ fontFamily: "var(--sans)" }}> / {data.teams.length}</span></div><p className="small">Teams with at least one evidence-backed claim. Others are marked honestly in the directory.</p></div>
        <div className="card"><div className="eyebrow">Decisions due</div>{data.milestones.length ? <ul className="list-plain">{data.milestones.map((m) => <li key={m.id}><b>{m.label}</b> <span className={`small ${m.passed ? "" : ""}`}>{fmtDate(m.on)}{m.passed ? " · passed" : ""}</span></li>)}</ul> : <p className="small">No product milestones configured. Add them in Settings.</p>}</div>
        <div className="card"><div className="eyebrow">Notable changes</div>{data.notifications.length ? <ul className="list-plain">{data.notifications.slice(0, 6).map((n) => <li key={n.id}><b>{n.title}</b>{n.data.items && <ul className="small">{n.data.items.map((i, k) => <li key={k}>{i}</li>)}</ul>}</li>)}</ul> : <p className="small">Nothing new since last review.</p>}</div>
      </div>
      <h3 style={{ marginTop: 36 }}>Coverage and freshness</h3>
      <table className="data" style={{ marginTop: 10 }}>
        <thead><tr><th>Team</th><th>League</th><th>Claims</th><th>Profiles</th><th>Growth</th><th>Territories</th><th>Runs</th><th>Last update</th><th>Gaps</th></tr></thead>
        <tbody>{[...researched, ...not].map((t) => <tr key={t.id}><td><Link to={`/w/${wid}/teams/${t.id}`}>{t.name}</Link></td><td>{t.league_id.toUpperCase()}</td><td>{t.claims}</td><td>{t.profiles}</td><td>{t.growth}</td><td>{t.opportunities}</td><td>{t.runs}{t.active_runs ? ` (${t.active_runs} active)` : ""}</td><td>{t.last_updated ? fmtDate(t.last_updated) : "—"}</td><td className="small">{t.researched ? (t.gaps.length ? t.gaps.join(", ") : "none") : "not researched"}</td></tr>)}</tbody>
      </table>
      <h3 style={{ marginTop: 36 }}>Upcoming moments across teams</h3>
      {data.upcoming.length ? <ul className="list-plain">{data.upcoming.map((m, i) => <li key={i}><b>{m.title}</b> · <Link to={`/w/${wid}/teams/${m.team_id}/season`}>{m.team_id}</Link> · {fmtDate(m.starts_at)} · <span className={`chip ${m.data.date_kind}`}>{m.data.date_kind}</span></li>)}</ul> : <p className="small">No upcoming moments recorded.</p>}
    </main>
  );
}
