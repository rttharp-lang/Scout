// League overview: what Home Court is, what to activate this month across all
// markets, the league read (themes + clusters), and every market as a card.
import React, { useMemo, useState } from "react";
import { markets, league, publishedCount, currentMonth, MONTHS_LONG, MONTHS } from "../data.js";
import { DIVISIONS } from "../teams.js";
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
      && (!ql || `${m.team.city} ${m.team.name} ${m.team.abbr} ${m.archetype?.name || ""} ${m.headline || ""}`.toLowerCase().includes(ql)));
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
          <div className="hc-eyebrow" style={{ marginBottom: 14 }}>Nike Basketball · Local fandom intelligence</div>
          <h1 className="hc-display" style={{ fontSize: "clamp(3.6rem, 12vw, 10rem)" }}>Home<br />Court</h1>
          <p className="hc-lede" style={{ marginTop: 22 }}>
            {league ? league.thesis : "Every NBA market, researched by a team of agents — music, art, food, culture, the underground, grassroots hoops, the fan base and its yearly rhythm, uniforms, and retail — then synthesized into where to play, when to activate, and which products to make."}
          </p>
        </div>
        <div className="hc-card-invert">
          <div className="hc-grid hc-grid-2" style={{ gap: 18 }}>
            <div className="hc-stat"><b>{publishedCount}<span className="hc-muted" style={{ fontSize: "0.5em" }}>/30</span></b><span className="hc-small hc-muted">markets published</span></div>
            <div className="hc-stat"><b>{ALL_AGENTS.length}</b><span className="hc-small hc-muted">agents per market</span></div>
            <div className="hc-stat"><b>{sources.toLocaleString()}</b><span className="hc-small hc-muted">sources cited</span></div>
            <div className="hc-stat"><b>{checks.toLocaleString()}</b><span className="hc-small hc-muted">claims audited by critics</span></div>
            <div className="hc-stat"><b>{queued.toLocaleString()}</b><span className="hc-small hc-muted">claims queued to verify live</span></div>
            <div className="hc-stat"><b>{markets.filter((m) => m.verification && m.verification.knowledge === 0).length}</b><span className="hc-small hc-muted">markets fully live-verified</span></div>
          </div>
          <a href={href("agents")} className="hc-btn" style={{ display: "inline-block", marginTop: 22, textDecoration: "none" }}>How the agents work</a>
        </div>
      </section>

      {/* This month */}
      <section className="hc-section">
        <SectionHead eyebrow={`Activate now · ${MONTHS_LONG[now - 1]}`} title="This month's priority plays">
          <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("calendar")}>Full league calendar →</a>
        </SectionHead>
        {thisMonth.length ? (
          <div className="hc-grid hc-grid-3">
            {thisMonth.slice(0, 9).map((c, i) => (
              <a key={i} href={href("m", c.m.id)} className="hc-card hc-stack" style={{ textDecoration: "none", display: "block" }}>
                <div className="hc-row" style={{ justifyContent: "space-between" }}>
                  <span className="hc-row"><span className="hc-dot" style={{ background: c.m.team.colors[0] }} /><b>{c.m.team.city} {c.m.team.name}</b></span>
                  <Priority p={c.priority} />
                </div>
                <h3 className="hc-h3">{c.moment}</h3>
                <p className="hc-small hc-muted">{c.window}</p>
                <p className="hc-small">{c.play}</p>
                <div className="hc-row">{c.products.slice(0, 3).map((p, k) => <Chip key={k} tone="line">{p}</Chip>)}</div>
              </a>
            ))}
          </div>
        ) : <div className="hc-card hc-muted">No priority-1 activations published for {MONTHS_LONG[now - 1]} yet.</div>}
      </section>

      {league && <LeagueRead />}

      {/* Markets */}
      <section className="hc-section">
        <SectionHead eyebrow="30 markets" title="Markets" />
        <div className="hc-row" style={{ marginBottom: 18, gap: 10 }}>
          <input className="hc-input" placeholder="Search a city, team or archetype…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search markets" style={{ flex: "1 1 220px", maxWidth: 320 }} />
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
        {!rows.length && <div className="hc-empty">No markets match.</div>}
      </section>
    </div>
  );
}

function MarketCard({ m }) {
  const t = m.team;
  const top = m.opportunities ? [...m.opportunities].sort((a, b) => a.priority - b.priority)[0] : null;
  return (
    <a href={href("m", t.id)} className="hc-market-card" aria-label={`${t.city} ${t.name}`}>
      <TeamBand colors={t.colors} />
      <div className="hc-market-body">
        <div className="hc-row" style={{ justifyContent: "space-between" }}>
          <span className="hc-eyebrow">{t.abbr} · {t.division}</span>
          {m.status !== "complete" ? <Chip tone="line">Research pending</Chip>
            : m.verification && m.verification.knowledge === 0 ? <Chip tone="pop">Live-verified</Chip>
            : m.verification && m.verification.live > 0 ? <Chip tone="line" title={`${m.verification.live} of 11 dossiers verified on the live web`}>Partly verified</Chip>
            : <Chip tone="line" title="Written from agent knowledge (to mid-2026) — verify before acting">Knowledge draft</Chip>}
        </div>
        <div>
          <h3 className="hc-market-city">{t.city}</h3>
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
            {top && <div className="hc-small" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}><span className="hc-muted">Top play · </span><b>{top.title}</b> <span className="hc-muted">({top.months.map((x) => MONTHS[x - 1]).slice(0, 3).join(", ")}{top.months.length > 3 ? "…" : ""})</span></div>}
          </>
        ) : <p className="hc-small hc-muted" style={{ marginTop: "auto" }}>{t.focus}</p>}
      </div>
    </a>
  );
}

function LeagueRead() {
  const byId = Object.fromEntries(markets.map((m) => [m.id, m.team]));
  const name = (id) => (byId[id] ? (["Los Angeles", "New York"].includes(byId[id].city) ? byId[id].name : byId[id].city) : id);
  return (
    <section className="hc-section">
      <SectionHead eyebrow="Across the league" title={league.headline} />
      <div className="hc-grid hc-grid-2">
        {league.themes.map((t, i) => (
          <article key={i} className="hc-card hc-stack">
            <h3 className="hc-h3">{t.title}</h3>
            <p>{t.insight}</p>
            <p className="hc-implication">{t.implication}</p>
            <div className="hc-row">{t.teams.slice(0, 10).map((id) => <a key={id} href={href("m", id)} className="hc-chip hc-chip-line" style={{ textDecoration: "none" }}>{name(id)}</a>)}</div>
          </article>
        ))}
      </div>
      <h3 className="hc-h2" style={{ marginTop: 36, marginBottom: 14 }}>Fandom clusters</h3>
      <div className="hc-grid hc-grid-3">
        {league.clusters.map((c, i) => (
          <article key={i} className="hc-card-invert hc-stack">
            <h4 className="hc-h3">{c.name}</h4>
            <p className="hc-small hc-muted">{c.description}</p>
            <div className="hc-row">{c.teams.map((id) => <a key={id} href={href("m", id)} className="hc-chip" style={{ textDecoration: "none" }}>{name(id)}</a>)}</div>
            <p className="hc-small" style={{ borderLeft: "3px solid var(--pop)", paddingLeft: 10 }}>{c.playbook}</p>
          </article>
        ))}
      </div>
      <div className="hc-grid hc-grid-2" style={{ marginTop: 36 }}>
        <div className="hc-card">
          <h3 className="hc-h2">League priority board</h3>
          <ol className="hc-list" style={{ marginTop: 12 }}>
            {league.priorities.map((p, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10 }}>
                <b className="hc-insight-num" style={{ fontSize: 22 }}>{i + 1}</b>
                <span><a href={href("m", p.team)} style={{ fontWeight: 700 }}>{name(p.team)}</a> — {p.title}<div className="hc-small hc-muted">{p.why} · {p.months.map((x) => MONTHS[x - 1]).join(", ")}</div></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hc-card-invert">
          <h3 className="hc-h2">Playbook for the Portland team</h3>
          <ul className="hc-list" style={{ marginTop: 12 }}>{league.portland.map((p, i) => <li key={i}><b>{p.title}</b><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{p.detail}</div></li>)}</ul>
          {league.watchlist.length > 0 && (
            <>
              <hr className="hc-divider" style={{ background: "#2a2a2a" }} />
              <div className="hc-eyebrow">Watchlist</div>
              <ul className="hc-list" style={{ marginTop: 8 }}>{league.watchlist.map((w, i) => <li key={i}><b>{w.market}</b><div className="hc-small hc-muted">{w.why}</div></li>)}</ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
