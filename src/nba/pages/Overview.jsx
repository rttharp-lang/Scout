// League overview: what Home Court is, the top plays this month across all
// markets, a teaser of the league read (full read on #/league), and every market as a card.
import React, { useMemo, useState } from "react";
import { markets, league, publishedCount, currentMonth, MONTHS_LONG, MONTHS } from "../data.js";
import { DIVISIONS, TEAM_BY_ID, placeOf, shortLabel } from "../teams.js";
import { ALL_AGENTS } from "../agents/roster.js";
import { Chip, Meter, Priority, TeamBand, href, SectionHead } from "../ui.jsx";

const SORTS = [["opportunity", "Opportunity"], ["fandom", "Fandom"], ["culture", "Culture"], ["retail", "Retail"], ["az", "A–Z"]];

export default function Overview() {
  const [conf, setConf] = useState("All");
  const [division, setDivision] = useState("All");
  const [sort, setSort] = useState("opportunity");
  const [q, setQ] = useState("");
  const now = currentMonth();

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = markets.filter((m) => (conf === "All" || m.team.conference === conf) && (division === "All" || m.team.division === division)
      && (!ql || `${placeOf(m.team)} ${m.team.name} ${m.team.abbr} ${m.archetype?.name || ""} ${m.headline || ""}`.toLowerCase().includes(ql)));
    const score = (m) => (m.scorecard ? m.scorecard[sort] : -1);
    return [...list].sort((a, b) => (sort === "az" ? a.team.city.localeCompare(b.team.city) : score(b) - score(a) || a.team.city.localeCompare(b.team.city)));
  }, [conf, division, sort, q]);

  const thisMonth = useMemo(() => markets.flatMap((m) => (m.calendar || []).filter((c) => c.month === now && c.priority === 1).map((c) => ({ ...c, m }))), [now]);
  const sources = markets.reduce((s, m) => s + (m.sources || 0), 0);
  const checks = markets.reduce((s, m) => s + (m.checks ? m.checks.checked : 0), 0);
  const queued = markets.reduce((s, m) => s + (m.verification ? m.verification.queue : 0), 0);

  return (
    <div>
      <section className="hc-home-hero">
        <div>
          <div className="hc-eyebrow" style={{ marginBottom: 14 }}>Nike Basketball · A guide to local NBA fandom</div>
          <h1 className="hc-display" style={{ fontSize: "clamp(3.6rem, 12vw, 10rem)" }}>Home<br />Court</h1>
          <p className="hc-lede" style={{ marginTop: 22 }}>
            {league ? league.headline : "Every NBA city, researched by a team of agents: its music, art, food and underground, its courts and its fans, its uniforms and its shops. Each city gets a brief on where to show up, when, and what to make."}
          </p>
        </div>
        <div className="hc-card-invert">
          <div className="hc-grid hc-grid-2" style={{ gap: 18 }}>
            <div className="hc-stat"><b>{publishedCount}<span className="hc-muted" style={{ fontSize: "0.5em" }}>/30</span></b><span className="hc-small hc-muted">markets published</span></div>
            <div className="hc-stat"><b>{ALL_AGENTS.length}</b><span className="hc-small hc-muted">agents per market</span></div>
            <div className="hc-stat"><b>{sources.toLocaleString()}</b><span className="hc-small hc-muted">sources cited</span></div>
            <div className="hc-stat"><b>{checks.toLocaleString()}</b><span className="hc-small hc-muted">claims checked by critics</span></div>
            <div className="hc-stat"><b>{queued.toLocaleString()}</b><span className="hc-small hc-muted">claims still to check live</span></div>
            <div className="hc-stat"><b>{markets.filter((m) => m.verification && m.verification.knowledge === 0).length}</b><span className="hc-small hc-muted">markets fully checked live</span></div>
          </div>
          <a href={href("agents")} className="hc-btn" style={{ display: "inline-block", marginTop: 22, textDecoration: "none" }}>How the agents work</a>
        </div>
      </section>

      {/* This month */}
      <section className="hc-section">
        <SectionHead eyebrow={`On now · ${MONTHS_LONG[now - 1]}`} title="This month's top plays">
          <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("calendar")}>The full calendar →</a>
        </SectionHead>
        {thisMonth.length ? (
          <div className="hc-grid hc-grid-3">
            {thisMonth.slice(0, 9).map((c, i) => (
              <a key={i} href={href("m", c.m.id)} className="hc-card hc-stack" style={{ textDecoration: "none", display: "block" }}>
                <div className="hc-row" style={{ justifyContent: "space-between" }}>
                  <span className="hc-row"><span className="hc-dot" style={{ background: c.m.team.colors[0] }} /><b>{placeOf(c.m.team)} {c.m.team.name}</b></span>
                  <Priority p={c.priority} />
                </div>
                <h3 className="hc-h3">{c.moment}</h3>
                <p className="hc-small hc-muted">{c.window}</p>
                <p className="hc-small">{c.play}</p>
                <div className="hc-row">{c.products.slice(0, 3).map((p, k) => <Chip key={k} tone="line">{p}</Chip>)}</div>
              </a>
            ))}
          </div>
        ) : <div className="hc-card hc-muted">No top-priority plays for {MONTHS_LONG[now - 1]} yet.</div>}
      </section>

      {league && <LeagueTeaser />}

      {/* Markets */}
      <section className="hc-section">
        <SectionHead eyebrow="All 30" title="The markets" />
        <div className="hc-row" style={{ marginBottom: 18, gap: 10 }}>
          <input className="hc-input" placeholder="Search a city, team or fan type" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search markets" style={{ flex: "1 1 220px", maxWidth: 320 }} />
          <select className="hc-select" value={conf} onChange={(e) => { setConf(e.target.value); setDivision("All"); }} aria-label="Conference">
            {["All", "East", "West"].map((c) => <option key={c} value={c}>{c === "All" ? "Both conferences" : `${c}ern Conference`}</option>)}
          </select>
          <select className="hc-select" value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
            <option value="All">All divisions</option>
            {DIVISIONS.filter((d) => conf === "All" || markets.some((m) => m.team.division === d && m.team.conference === conf)).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="hc-row" role="group" aria-label="Sort by">
            {SORTS.map(([k, l]) => <button key={k} className="hc-pill-btn" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
          </span>
        </div>
        <div className="hc-grid hc-grid-3">
          {rows.map((m) => <MarketCard key={m.id} m={m} />)}
        </div>
        {!rows.length && <div className="hc-empty">Nothing matches that search.</div>}
      </section>
    </div>
  );
}

function MarketCard({ m }) {
  const t = m.team;
  const top = m.opportunities ? [...m.opportunities].sort((a, b) => a.priority - b.priority)[0] : null;
  return (
    <a href={href("m", t.id)} className="hc-market-card" aria-label={`${placeOf(t)} ${t.name}`}>
      <TeamBand colors={t.colors} />
      <div className="hc-market-body">
        <div className="hc-row" style={{ justifyContent: "space-between" }}>
          <span className="hc-eyebrow">{t.abbr} · {t.division}</span>
          {m.status !== "complete" ? <Chip tone="line">Not researched yet</Chip>
            : m.verification && m.verification.knowledge === 0 ? <Chip tone="pop">Checked live</Chip>
            : m.verification && m.verification.live > 0 ? <Chip tone="line" title={`${m.verification.live} of 11 dossiers checked on the live web`}>Partly checked</Chip>
            : <Chip tone="line" title="Written from the agents' own knowledge, current to mid-2026. Check before you act.">Knowledge draft</Chip>}
        </div>
        <div>
          <h3 className="hc-market-city">{placeOf(t)}</h3>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{t.name}</div>
        </div>
        {m.status === "complete" ? (
          <>
            <Chip tone="ink">{m.archetype.name}</Chip>
            <p className="hc-small">{m.headline}</p>
            <div style={{ display: "grid", gap: 6, marginTop: "auto" }}>
              <Meter label="Opportunity" value={m.scorecard.opportunity} />
              <Meter label="Fandom" value={m.scorecard.fandom} />
              <Meter label="Culture" value={m.scorecard.culture} />
              <Meter label="Retail" value={m.scorecard.retail} />
            </div>
            {top && <div className="hc-small" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}><span className="hc-muted">Top play: </span><b>{top.title}</b> <span className="hc-muted">({top.months.map((x) => MONTHS[x - 1]).slice(0, 3).join(", ")}{top.months.length > 3 ? "…" : ""})</span></div>}
          </>
        ) : <p className="hc-small hc-muted" style={{ marginTop: "auto" }}>{t.focus}</p>}
      </div>
    </a>
  );
}

// Themes and clusters at a glance; the full read lives on the League page.
function LeagueTeaser() {
  const name = (id) => (TEAM_BY_ID[id] ? shortLabel(TEAM_BY_ID[id]) : id);
  return (
    <section className="hc-section">
      <SectionHead eyebrow="The league read" title="Across the league">
        <a className="hc-btn" style={{ textDecoration: "none" }} href={href("league")}>Read the whole thing →</a>
      </SectionHead>
      <div className="hc-grid hc-grid-2">
        <div className="hc-card">
          <div className="hc-eyebrow">{league.themes.length} themes</div>
          <ol className="hc-list" style={{ marginTop: 10 }}>
            {league.themes.map((t, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10 }}>
                <b className="hc-insight-num" style={{ fontSize: 22 }}>{i + 1}</b>
                <span><b>{t.title}</b><div className="hc-small hc-muted">{t.teams.length} markets</div></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hc-card-invert">
          <div className="hc-eyebrow">{league.clusters.length} kinds of fan base</div>
          <ul className="hc-list" style={{ marginTop: 10 }}>
            {league.clusters.map((c, i) => (
              <li key={i}>
                <b>{c.name}</b>
                <div className="hc-row" style={{ marginTop: 6 }}>{c.teams.map((id) => <a key={id} href={href("m", id)} className="hc-chip" style={{ textDecoration: "none" }}>{name(id)}</a>)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
