import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp, useFetch } from "../lib/store.jsx";
import { teamStyle } from "../lib/api.js";

export default function Directory() {
  const { wid } = useParams(); const { teams } = useApp();
  const { data: portfolio } = useFetch(`/workspaces/${wid}/portfolio`, [wid]);
  const { data: saved, reload } = useFetch(`/workspaces/${wid}/me/saved`, [wid]);
  const [league, setLeague] = useState("all"); const [q, setQ] = useState(""); const [onlySaved, setOnlySaved] = useState(false);
  const byId = useMemo(() => Object.fromEntries((portfolio?.teams || []).map((t) => [t.id, t])), [portfolio]);
  const list = teams.filter((t) => t.status === "active").filter((t) => league === "all" || t.league_id === league).filter((t) => !onlySaved || (saved || []).includes(t.id))
    .filter((t) => !q || `${t.name} ${t.city} ${t.market} ${(t.search_terms || []).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const announced = teams.filter((t) => t.status === "announced");
  return (
    <main>
      <div className="wrap dir-hero">
        <div className="eyebrow">Choose a team</div>
        <h1>NBA <span style={{ color: "var(--mute)" }}>&</span> WNBA</h1>
        <p className="lede" style={{ marginTop: 14 }}>Every team has its own world. Open one to see who its fans are, what they make and repeat, when the season intensifies, and which stories are strong enough to inspire a uniform. Unresearched teams say so.</p>
        <div className="row" style={{ marginTop: 18 }}>
          <div className="row" role="group" aria-label="League filter">
            {[["all", "All"], ["nba", "NBA"], ["wnba", "WNBA"]].map(([v, l]) => <button key={v} className={`btn sm ${league === v ? "" : "ghost"}`} onClick={() => setLeague(v)}>{l}</button>)}
          </div>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Search by team or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search teams" />
          <label className="row small"><input type="checkbox" checked={onlySaved} onChange={(e) => setOnlySaved(e.target.checked)} /> Saved teams only</label>
          <div className="spacer" />
          <Link className="btn ghost sm" to={`/w/${wid}/portfolio`}>Portfolio status →</Link>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 60 }}>
        <div className="tiles">
          {list.map((t) => { const p = byId[t.id]; const isSaved = (saved || []).includes(t.id); return (
            <Link key={t.id} to={`/w/${wid}/teams/${t.id}`} className={`tile ${p?.researched ? "" : "unresearched"}`} style={teamStyle(t)} aria-label={`${t.name}, ${p?.researched ? `${p.claims} findings` : "not yet researched"}`}>
              <div className="plate" />
              <div className="meta"><span>{t.league_id.toUpperCase()}</span><span>{isSaved ? "★ saved" : ""}</span></div>
              {!p?.researched && <span className="badge">Not yet researched</span>}
              {p?.researched && <span className="badge">{p.claims} findings · {p.opportunities} territories</span>}
              <div className="nick">{t.nickname}</div>
              <div className="city">{t.market}{t.registry?.verification?.status === "needs_verification" ? " · registry check pending" : ""}</div>
            </Link>); })}
        </div>
        {announced.length > 0 && <details style={{ marginTop: 28 }}><summary className="small">Announced expansion (not active): {announced.map((t) => `${t.city} ${t.first_season}`).join(" · ")}</summary><p className="small">Listed for product planning only. No fandom research is generated for teams that have not played.</p></details>}
      </div>
    </main>
  );
}
