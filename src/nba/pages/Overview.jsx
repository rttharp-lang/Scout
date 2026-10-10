// The front door: what Home Court is for, a team search, what has and hasn't
// been checked, what's happening this month and what needs action now, a few
// league reads, and every market as a card. How the agents work lives on the
// Method page.
import React, { useMemo, useState } from "react";
import { markets, league, review, today, ymLabel } from "../data.js";
import { DIVISIONS, TEAM_BY_ID, placeOf, shortLabel } from "../teams.js";
import { Chip, Tier, Priority, TeamBand, href, SectionHead, EvidenceTag, When, Certainty, ActBy } from "../ui.jsx";
import { happeningIn, actionIn } from "../plan.js";
import { fmtDate } from "../review.js";

const SORTS = [["opportunity", "Opportunity"], ["fandom", "Fandom"], ["culture", "Culture"], ["retail", "Retail"], ["az", "A–Z"]];

export default function Overview() {
  const now = today();
  const [conf, setConf] = useState("All");
  const [division, setDivision] = useState("All");
  const [sort, setSort] = useState("opportunity");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = markets.filter((m) => (conf === "All" || m.team.conference === conf) && (division === "All" || m.team.division === division)
      && (!ql || `${placeOf(m.team)} ${m.team.name} ${m.team.abbr} ${m.archetype?.name || ""} ${m.headline || ""}`.toLowerCase().includes(ql)));
    const score = (m) => (m.scorecard ? m.scorecard[sort] : -1);
    return [...list].sort((a, b) => (sort === "az" ? a.team.city.localeCompare(b.team.city) : score(b) - score(a) || a.team.city.localeCompare(b.team.city)));
  }, [conf, division, sort, q]);

  const happening = useMemo(() => happeningIn(now.ym), [now.ym]);
  const action = useMemo(() => actionIn(now.ym), [now.ym]);

  return (
    <div>
      <section className="hc-home-hero">
        <div>
          <div className="hc-eyebrow" style={{ marginBottom: 14 }}>Nike Basketball · Local NBA fandom intelligence</div>
          <h1 className="hc-display" style={{ fontSize: "clamp(3.6rem, 12vw, 10rem)" }}>Home<br />Court</h1>
          <p className="hc-lede" style={{ marginTop: 22 }}>What's true about each NBA city's fans, when it matters, and which product ideas are worth testing. Written for the licensed basketball apparel team and its leadership.</p>
          <TeamSearch />
        </div>
        <ResearchStatus />
      </section>

      <ThisMonth now={now} happening={happening} action={action} />

      {league && <LeagueReads />}

      {/* Markets */}
      <section className="hc-section" id="markets">
        <SectionHead eyebrow="All 30" title="The markets" />
        <div className="hc-row" style={{ marginBottom: 18, gap: 10 }}>
          <input className="hc-input" placeholder="Filter by city, team or fan type" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter markets" style={{ flex: "1 1 220px", maxWidth: 320 }} />
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
        <p className="hc-tiny hc-muted" style={{ marginTop: -6, marginBottom: 14 }}>Scores are editorial estimates shown as tiers. <a href={href("method", "scores")}>What they mean</a>.</p>
        <div className="hc-grid hc-grid-3">
          {rows.map((m) => <MarketCard key={m.id} m={m} />)}
        </div>
        {!rows.length && <div className="hc-empty">Nothing matches that search.</div>}
      </section>
    </div>
  );
}

// Jump straight to a market from the top of the page.
function TeamSearch() {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const hits = ql ? markets.filter((m) => `${placeOf(m.team)} ${m.team.city} ${m.team.name} ${m.team.abbr}`.toLowerCase().includes(ql)).slice(0, 6) : [];
  const go = (id) => { window.location.hash = href("m", id); };
  return (
    <form className="hc-search" role="search" onSubmit={(e) => { e.preventDefault(); if (hits[0]) go(hits[0].id); }}>
      <input className="hc-input" placeholder="Find a team or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a team or city" aria-autocomplete="list" aria-controls="hc-team-suggest" />
      <button className="hc-btn" type="submit" disabled={!hits.length}>Open</button>
      {hits.length > 0 && (
        <ul className="hc-suggest" id="hc-team-suggest">
          {hits.map((m) => <li key={m.id}><a href={href("m", m.id)}><span className="hc-dot" style={{ background: m.team.colors[0] }} />{placeOf(m.team)} {m.team.name}</a></li>)}
        </ul>
      )}
    </form>
  );
}

// Every number here is defined in place and on the Method page.
function ResearchStatus() {
  const t = review.totals || {};
  const queued = markets.reduce((s, m) => s + (m.verification ? m.verification.queue : 0), 0);
  const stat = (n, label, def) => (
    <div className="hc-stat">
      <b>{Number(n || 0).toLocaleString()}</b>
      <span className="hc-small">{label}</span>
      <span className="hc-tiny hc-muted">{def}</span>
    </div>
  );
  return (
    <div className="hc-card-invert">
      <div className="hc-row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div className="hc-eyebrow">Research status</div>
        <Chip tone="pop">Shared reviewed build</Chip>
      </div>
      <div className="hc-grid hc-grid-2" style={{ gap: 18 }}>
        {stat(t.claims, "claims checked live", `${t.verified || 0} verified, ${t.contradicted || 0} corrected, ${t.unclear || 0} unsettled. Across ${t.markets || 0} markets.`)}
        {stat(review.corrections.length, "corrections made", "Fixed at the source, so every page that uses the fact changed.")}
        {stat(queued, "claims still unverified", "Dated claims in the desk research that no one has checked live.")}
        {stat(t.checkedSources, "sources retrieved", "Pages a live search returned and the checks relied on.")}
      </div>
      <p className="hc-small hc-muted" style={{ marginTop: 16 }}>The 30 markets were drafted from desk research. Each team's 2026-27 facts were checked live on {fmtDate(review.pulse?.asOf) || "Oct 7, 2026"}, and the league dates on {fmtDate(review.leagueCalendar?.verifiedAt) || "Oct 7, 2026"}. Nothing here is approved: every product idea is a hypothesis.</p>
      <a href={href("method")} className="hc-btn" style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>How it was researched and checked</a>
    </div>
  );
}

function ThisMonth({ now, happening, action }) {
  const label = ymLabel(now.ym, true);
  const card = (c, i, mode) => (
    <li key={i}>
      <a href={href("m", c.m.id)} style={{ textDecoration: "none", display: "block" }}>
        <div className="hc-row" style={{ justifyContent: "space-between" }}>
          <span className="hc-row"><span className="hc-dot" style={{ background: c.m.team.colors[0] }} /><b>{shortLabel(c.m.team)}</b></span>
          <Priority p={c.priority} />
        </div>
        <div style={{ fontWeight: 700, marginTop: 6 }}>{c.moment}</div>
        <div className="hc-row" style={{ marginTop: 6 }}><When timing={c.timing} /><Certainty timing={c.timing} /></div>
        {mode === "act" && c.timing.actBy ? <div style={{ marginTop: 6 }}><ActBy timing={c.timing} /></div> : <p className="hc-small hc-muted" style={{ marginTop: 6 }}>{c.play}</p>}
      </a>
    </li>
  );
  return (
    <section className="hc-section">
      <SectionHead eyebrow={`${label} · season ${now.season}`} title="This month">
        <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("calendar")}>The full calendar →</a>
      </SectionHead>
      <div className="hc-grid hc-grid-2">
        <div className="hc-card">
          <h3 className="hc-h3">Happening in {label}</h3>
          <p className="hc-small hc-muted" style={{ marginTop: 4, marginBottom: 12 }}>Events, launches and seasons dated to this month. Later years are left out.</p>
          {happening.length ? <ul className="hc-list">{happening.slice(0, 6).map((c, i) => card(c, i, "on"))}</ul> : <p className="hc-muted">Nothing dated to {label}.</p>}
          {happening.length > 6 && <a className="hc-small" href={href("calendar")}>{happening.length - 6} more on the calendar →</a>}
        </div>
        <div className="hc-card-invert">
          <h3 className="hc-h3">Act in {label} for later</h3>
          <p className="hc-small hc-muted" style={{ marginTop: 4, marginBottom: 12 }}>Work the briefs say must start now for a moment or launch that comes later.</p>
          {action.calendar.length ? <ul className="hc-list">{action.calendar.slice(0, 6).map((c, i) => card(c, i, "act"))}</ul> : <p className="hc-muted">No action windows open in {label}.</p>}
          {action.opportunities.length > 0 && <a className="hc-small" style={{ display: "inline-block", marginTop: 12, fontWeight: 700 }} href={href("opportunities")}>{action.opportunities.length} opportunities have a first decision due by {label} →</a>}
        </div>
      </div>
    </section>
  );
}

// Three league reads, labelled for what they are: patterns across desk
// research, not findings from fans or sales.
function LeagueReads() {
  const name = (id) => (TEAM_BY_ID[id] ? shortLabel(TEAM_BY_ID[id]) : id);
  const top = [...league.themes].map((t, i) => ({ ...t, i })).sort((a, b) => b.teams.length - a.teams.length).slice(0, 3);
  return (
    <section className="hc-section">
      <SectionHead eyebrow="The league read" title="Three reads to start with">
        <a className="hc-btn" style={{ textDecoration: "none" }} href={href("league")}>The whole league read →</a>
      </SectionHead>
      <p className="hc-small hc-muted" style={{ marginTop: -6, marginBottom: 16, maxWidth: "80ch" }}>{league.headline} Each read below is a pattern across the market briefs. None has been tested with fans or sales data yet.</p>
      <div className="hc-grid hc-grid-3">
        {top.map((t) => (
          <article key={t.i} className="hc-card hc-stack">
            <div className="hc-row"><EvidenceTag kind="interpretation" /><Chip tone="line">{t.teams.length} of 30 briefs</Chip></div>
            <h3 className="hc-h3">{t.title}</h3>
            <p className="hc-small">{t.insight}</p>
            <p className="hc-implication hc-small">{t.implication}</p>
            <div className="hc-row" style={{ gap: 4 }}>{t.teams.slice(0, 8).map((id) => <a key={id} href={href("m", id)} className="hc-chip hc-chip-line" style={{ textDecoration: "none" }}>{name(id)}</a>)}{t.teams.length > 8 && <span className="hc-tiny hc-muted">+{t.teams.length - 8} more</span>}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MarketCard({ m }) {
  const t = m.team;
  const top = m.opportunities ? [...m.opportunities].sort((a, b) => a.priority - b.priority)[0] : null;
  const ev = m.evidence;
  return (
    <a href={href("m", t.id)} className="hc-market-card" aria-label={`${placeOf(t)} ${t.name}`}>
      <TeamBand colors={t.colors} />
      <div className="hc-market-body">
        <div className="hc-row" style={{ justifyContent: "space-between" }}>
          <span className="hc-eyebrow">{t.abbr} · {t.division}</span>
          {m.status !== "complete" ? <Chip tone="line">Not researched yet</Chip>
            : ev ? <Chip tone="line" title={`${ev.verified} verified, ${ev.contradicted} corrected, ${ev.unclear} unsettled on ${fmtDate(ev.checkedOn)}. The rest is desk research.`}>{ev.claims} claims checked live</Chip>
            : <Chip tone="warn" title="Desk research only. Check before you act.">Desk research only</Chip>}
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
              {[["opportunity", "Opportunity"], ["fandom", "Fandom"], ["culture", "Culture"], ["retail", "Retail"]].map(([k, l]) => <Tier key={k} label={l} value={m.scorecard[k]} />)}
            </div>
            {top && <div className="hc-small" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}><span className="hc-muted">Top idea: </span><b>{top.title}</b>{top.handoff ? <span className="hc-muted"> · {top.handoff.targetSeason}</span> : null}</div>}
          </>
        ) : <p className="hc-small hc-muted" style={{ marginTop: "auto" }}>{t.focus}</p>}
      </div>
    </a>
  );
}
