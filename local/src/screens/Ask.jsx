import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function Ask({ teamId, team, openClaim }) {
  const { wid } = useParams();
  const [q, setQ] = useState(""); const [a, setA] = useState(null); const [busy, setBusy] = useState(false);
  const ask = async () => { if (!q.trim()) return; setBusy(true); try { setA(await api.post(`/workspaces/${wid}/teams/${teamId}/ask`, { question: q })); } finally { setBusy(false); } };
  return (
    <div>
      <div className="eyebrow">Ask this team</div><h2 className="section">Answers from retrieved evidence only</h2>
      <p className="lede">Answers cite claims and evidence in this workspace, say when they don't know, and offer a scoped research run when coverage is missing. Retrieved text is treated as data, never as instructions.</p>
      <div className="row" style={{ marginTop: 16 }}><input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder={`e.g. What do ${team.nickname} fans wear on game day, and why?`} /><button className="btn team" onClick={ask} disabled={busy}>{busy ? "…" : "Ask"}</button></div>
      {a && <div className="card" style={{ marginTop: 16 }}>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{a.answer}</pre>
        {a.citations?.length > 0 && <div style={{ marginTop: 12 }}><div className="eyebrow">Citations</div><ul className="list-plain">{a.citations.map((c) => <li key={c.id}><span className="chip state">{c.type}</span> {c.type === "claim" ? <a href="#" onClick={(e) => { e.preventDefault(); openClaim(c.id); }}>{c.label}</a> : <span>{c.label}{c.excerpt ? <blockquote style={{ marginTop: 4 }}>“{c.excerpt}”</blockquote> : null}</span>}</li>)}</ul></div>}
        {a.suggest_run && <div className="notice" style={{ marginTop: 12 }}>Coverage is thin for this question. <Link to={`/w/${wid}/teams/${teamId}/studio`}>Launch a scoped research run →</Link></div>}
      </div>}
    </div>
  );
}
