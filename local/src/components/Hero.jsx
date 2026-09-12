import React, { useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";

export const SECTIONS = [["", "Overview"], ["identity", "Fan Identity"], ["communities", "Communities"], ["culture", "Local Culture"], ["season", "Season Rhythm"], ["growth", "Growth"], ["uniform", "Uniform Opportunities"]];
export const AUX = [["studio", "Research"], ["evidence", "Evidence"], ["ask", "Ask this team"]];

export function Hero({ team, dossier, onOpenClaim }) {
  const { wid } = useParams();
  const [paused, setPaused] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const media = (dossier?.media || []).find((m) => m.data?.kind === "hero" && m.data?.url && m.data?.rights);
  const top = (dossier?.claims || []).find((c) => c.section === "overview") || (dossier?.claims || [])[0];
  const researched = (dossier?.claims || []).length > 0;
  return (
    <section className="hero" aria-label={`${team.name} opening`}>
      {media ? <div className="media">{media.data.type === "video" ? <video src={media.data.url} muted playsInline autoPlay={!paused} loop poster={media.data.poster} aria-label={media.data.caption} /> : <img src={media.data.url} alt={media.data.alt || media.data.caption || ""} loading="eager" />}</div>
        : <div className={`media fallback ${paused ? "paused" : ""}`} aria-hidden="true"><div className="drift" /></div>}
      <div className="scrim" />
      <div className="media-note">{media ? `${media.data.caption || "Approved media"} · ${media.data.credit || ""}` : "No approved imagery yet · editorial fallback"}</div>
      <div className="controls">
        <button onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? "Play motion" : "Pause motion"}</button>
      </div>
      <div className="wrap content">
        <div className="eyebrow" style={{ color: "inherit", opacity: 0.85 }}>{team.league_id.toUpperCase()} · {team.market} · {team.arena}</div>
        <h1 className="title">{team.nickname}</h1>
        <div className="sub"><span>{team.name}</span><span>Since {team.first_season}</span>{team.history?.length ? <span>Formerly {team.history.map((h) => h.name).join(", ")}</span> : null}{dossier?.workspace?.kind === "demo" && <span className="chip demo">demo fixture</span>}</div>
        <p className="intro">{researched ? <>{top?.statement} <span className="small" style={{ color: "inherit", opacity: 0.85 }}>· <a href="#" onClick={(e) => { e.preventDefault(); onOpenClaim(top.id); }}>evidence</a></span></> : <>No research yet for this team. The registry entry is verified; findings, communities and season rhythm appear after a research run. <Link to={`/w/${wid}/teams/${team.id}/studio`} style={{ color: "inherit" }}>Start one in Research Studio →</Link></>}</p>
      </div>
    </section>
  );
}

export function TeamNav({ wid, teamId }) {
  return (
    <nav className="teamnav" aria-label="Team sections">
      <div className="wrap">
        {SECTIONS.map(([s, l]) => <NavLink key={s} to={`/w/${wid}/teams/${teamId}${s ? `/${s}` : ""}`} end={!s}>{l}</NavLink>)}
        <div className="aux">{AUX.map(([s, l]) => <NavLink key={s} to={`/w/${wid}/teams/${teamId}/${s}`}>{l}</NavLink>)}</div>
      </div>
    </nav>
  );
}
