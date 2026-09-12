import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { useApp, useWorkspace } from "../lib/store.jsx";

export function TeamSwitcher({ wid, currentTeamId }) {
  const { teams } = useApp(); const nav = useNavigate(); const loc = useLocation();
  const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  useEffect(() => { const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen((o) => !o); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const section = useMemo(() => { const m = loc.pathname.match(/\/teams\/[^/]+\/([^/]+)/); return m ? m[1] : ""; }, [loc.pathname]);
  const list = teams.filter((t) => t.status === "active" && `${t.name} ${t.city} ${t.market} ${t.league_id}`.toLowerCase().includes(q.toLowerCase()));
  const go = (t) => { setOpen(false); setQ(""); nav(`/w/${wid}/teams/${t.id}${section ? `/${section}` : ""}`); };
  return (<>
    <button className="btn ghost sm" onClick={() => setOpen(true)} aria-haspopup="dialog">{currentTeamId ? (teams.find((t) => t.id === currentTeamId)?.name || "Switch team") : "Switch team"} <span className="mono" style={{ opacity: 0.6 }}>⌘K</span></button>
    {open && <div className="palette" onClick={() => setOpen(false)}>
      <div className="box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Switch team">
        <input autoFocus className="input" placeholder="Search team or city…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && list[0]) go(list[0]); if (e.key === "Escape") setOpen(false); }} />
        <ul>{list.map((t) => <li key={t.id}><a href="#" onClick={(e) => { e.preventDefault(); go(t); }}><span className="swatch" style={{ background: t.colors?.[0] }} /><b>{t.name}</b><span className="small">{t.market} · {t.league_id.toUpperCase()}</span></a></li>)}</ul>
      </div>
    </div>}
  </>);
}

export function Shell({ children }) {
  const { user, workspaces, logout } = useApp(); const nav = useNavigate(); const { wid, teamId } = useParams();
  const ws = useWorkspace(wid);
  const link = (p) => `/w/${wid}${p}`;
  return (<>
    <header className="topbar">
      <div className="wrap">
        <Link to={link("")} className="brand">LOCAL</Link>
        <nav className="topnav" aria-label="Primary">
          <NavLink to={link("")} end>Teams</NavLink>
          <NavLink to={link("/portfolio")}>Portfolio</NavLink>
          <NavLink to={link("/across")}>Across teams</NavLink>
          <NavLink to={link("/evidence")}>Evidence</NavLink>
          <NavLink to={link("/taxonomy")}>Taxonomy</NavLink>
          <NavLink to={link("/studio")}>Research Studio</NavLink>
          <NavLink to={link("/settings")}>Settings</NavLink>
        </nav>
        <div className="spacer" />
        <TeamSwitcher wid={wid} currentTeamId={teamId} />
        <select className="input" style={{ width: "auto", padding: "5px 8px", fontSize: 13 }} value={wid} onChange={(e) => nav(`/w/${e.target.value}`)} aria-label="Workspace">
          {workspaces.map((w) => <option key={w.workspace_id} value={w.workspace_id}>{w.kind === "demo" ? "DEMO · " : ""}{w.name}</option>)}
        </select>
        <span className="small who" title={`${user?.email} · ${ws?.role}`}>{user?.name} · {ws?.role}</span>
        <button className="btn ghost sm" onClick={() => logout().then(() => nav("/login"))}>Log out</button>
      </div>
    </header>
    {ws?.kind === "demo" && <div className="banner"><div className="wrap"><strong>DEMO WORKSPACE.</strong>{ws.settings?.banner || "Synthetic fixtures only."} Live research happens in the live workspace.</div></div>}
    {children}
    <footer className="wrap small" style={{ padding: "40px 0 30px", borderTop: "1px solid var(--line)", marginTop: 40 }}>LOCAL · NBA & WNBA fandom intelligence · Evidence-first. Labels: observed / interpretation / hypothesis / proposal. Confidence is explained, never decorative.</footer>
  </>);
}
