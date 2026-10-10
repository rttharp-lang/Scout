// The front door: what NBA Fandom is, a team search, the 30 markets at a
// glance, what you'll find inside, this month's moments across the league,
// and every market as a card. How the research was done lives on the Method
// page, one click from the footer.
import React, { useMemo, useRef, useState } from "react";
import { markets, today, ymLabel, heroColor, inkOn } from "../data.js";
import { DIVISIONS, placeOf } from "../teams.js";
import { Tier, TeamBand, href, SectionHead } from "../ui.jsx";
import { happeningIn, published } from "../plan.js";
import { MONTHS, fmtDate } from "../review.js";

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

  const moments = useMemo(() => monthMoments(happeningIn(now.ym)), [now.ym]);

  return (
    <div>
      <section className="hc-home-hero">
        <div>
          <div className="hc-eyebrow" style={{ marginBottom: 14 }}>Nike Basketball · Local NBA fandom intelligence</div>
          <h1 className="hc-display" style={{ fontSize: "clamp(3.6rem, 12vw, 10rem)" }}>NBA<br />Fandom</h1>
          <p className="hc-lede" style={{ marginTop: 22 }}>What's true about each NBA city's fans, when it matters, and which product ideas are worth testing.</p>
          <TeamSearch />
          <p className="hc-small hc-muted" style={{ marginTop: 14 }}>All {markets.length} markets · updated {fmtDate(latestUpdate())}</p>
        </div>
        <MarketWall />
      </section>

      <Inside />

      <ThisMonth now={now} moments={moments} />

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
        <p className="hc-tiny hc-muted" style={{ marginTop: -6, marginBottom: 14 }}>Scores are editorial estimates, ranked across all 30 markets. <a href={href("method", "scores")}>How we score</a>.</p>
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
  const input = useRef(null);
  const ql = q.trim().toLowerCase();
  const hits = ql ? markets.filter((m) => `${placeOf(m.team)} ${m.team.city} ${m.team.name} ${m.team.abbr}`.toLowerCase().includes(ql)).slice(0, 6) : [];
  const go = (id) => { window.location.hash = href("m", id); };
  return (
    <form className="hc-search" role="search" onSubmit={(e) => {
      e.preventDefault();
      if (hits[0]) go(hits[0].id);
      else if (!ql) document.getElementById("markets")?.scrollIntoView({ behavior: "smooth" });
      else input.current?.focus();
    }}>
      <input ref={input} className="hc-input" placeholder="Find a team or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a team or city" aria-autocomplete="list" aria-controls="hc-team-suggest" />
      <button className="hc-btn" type="submit">Open</button>
      {hits.length > 0 && (
        <ul className="hc-suggest" id="hc-team-suggest">
          {hits.map((m) => <li key={m.id}><a href={href("m", m.id)}><span className="hc-dot" style={{ background: m.team.colors[0] }} />{placeOf(m.team)} {m.team.name}</a></li>)}
        </ul>
      )}
    </form>
  );
}

// All 30 markets as team-color tiles, East and West: the scope of the site at
// a glance, and a one-tap way in.
function MarketWall() {
  return (
    <nav className="hc-wall" aria-label="All 30 markets">
      {["East", "West"].map((c) => (
        <div key={c}>
          <div className="hc-eyebrow hc-wall-label">{c}ern Conference</div>
          <div className="hc-wall-grid">
            {markets.filter((m) => m.team.conference === c).sort((a, b) => a.team.city.localeCompare(b.team.city)).map((m) => {
              const bg = heroColor(m.team);
              return (
                <a key={m.id} href={href("m", m.id)} className="hc-wall-tile" style={{ background: bg, color: inkOn(bg) }} title={`${placeOf(m.team)} ${m.team.name}`} aria-label={`${m.team.abbr}, ${placeOf(m.team)} ${m.team.name}`}>
                  <span>{m.team.abbr}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

// What's inside, in four doors.
function Inside() {
  const pub = published();
  const ideas = pub.reduce((n, m) => n + (m.opportunities || []).length, 0);
  const moments = pub.reduce((n, m) => n + (m.calendar || []).length, 0);
  const doors = [
    ["City briefs", `What sets each of the ${pub.length} fan bases apart, on one screen.`, "#markets"],
    ["League read", "The patterns that run across markets, and the fan types they add up to.", href("league")],
    ["Opportunity board", `${ideas} product ideas, sorted by the season they're for.`, href("opportunities")],
    ["League calendar", `${moments} moments across the season, from tip-off to the summer runs.`, href("calendar")],
  ];
  const jump = (e, to) => { if (to === "#markets") { e.preventDefault(); document.getElementById("markets")?.scrollIntoView({ behavior: "smooth" }); } };
  return (
    <section className="hc-section hc-inside" aria-label="What's inside">
      {doors.map(([title, line, to]) => (
        <a key={title} href={to} className="hc-door" onClick={(e) => jump(e, to)}>
          <span className="hc-door-title">{title} <span aria-hidden="true">→</span></span>
          <span className="hc-small hc-muted">{line}</span>
        </a>
      ))}
    </section>
  );
}

// The newest research date across the markets.
const latestUpdate = () => markets.map((m) => m.updated).filter(Boolean).sort().pop();

// One moment per market for this month, the clearest one each brief has: top
// priority first, real events before seasons, a dated day before a vague one,
// then the bigger fan base. A game that names another team already shown is
// skipped so the same night doesn't appear twice, and each conference gets at
// most half the row.
const MAX_MOMENTS = 8;
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function monthMoments(list) {
  const rank = (c) => (c.priority === 1 ? 0 : 10) + ({ event: 0, launch: 1, season: 2 }[c.timing.kind] ?? 3)
    + (dayOf(c) ? 0 : 3) + (c.moment.length > 80 ? 2 : 0);
  const best = new Map();
  for (const c of list) { const b = best.get(c.m.id); if (!b || rank(c) < rank(b)) best.set(c.m.id, c); }
  const order = [...best.values()].sort((a, b) => rank(a) - rank(b) || (b.m.scorecard?.fandom ?? 0) - (a.m.scorecard?.fandom ?? 0) || a.m.team.city.localeCompare(b.m.team.city));
  const names = published().map((m) => ({ id: m.id, re: new RegExp(`\\b(${[m.team.city, placeOf(m.team), m.team.name].map(escapeRe).join("|")})\\b`) }));
  const picked = [], covered = new Set(), per = { East: 0, West: 0 };
  for (const c of order) {
    const conf = c.m.team.conference;
    if (picked.length >= MAX_MOMENTS || covered.has(c.m.id) || per[conf] >= MAX_MOMENTS / 2) continue;
    picked.push(c);
    per[conf]++;
    covered.add(c.m.id);
    for (const n of names) if (n.re.test(c.moment)) covered.add(n.id);
  }
  return picked.sort((a, b) => (dayOf(a) || "9").localeCompare(dayOf(b) || "9") || a.m.team.city.localeCompare(b.m.team.city));
}
const dayOf = (c) => (c.timing.certainty === "confirmed" && c.timing.start.length === 10 ? c.timing.start : "");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Tue Oct 20", "Oct 20–30", "Oct 30 – Nov 27", "Apr 11 – Jun", or simply
// "This month" when the brief has no fixed day.
function momentDate(c) {
  const t = c.timing;
  if (!dayOf(c)) return "This month";
  const mon = (s) => MONTHS[Number(s.slice(5, 7)) - 1];
  const d = (s) => `${mon(s)} ${Number(s.slice(8, 10))}`;
  if (t.end && t.end !== t.start) {
    if (t.end.length === 7) return t.end > t.start.slice(0, 7) ? `${d(t.start)} – ${mon(t.end)}` : d(t.start);
    return t.end.slice(0, 7) === t.start.slice(0, 7) ? `${d(t.start)}–${Number(t.end.slice(8, 10))}` : `${d(t.start)} – ${d(t.end)}`;
  }
  return `${WEEKDAYS[new Date(`${t.start}T12:00:00`).getDay()]} ${d(t.start)}`;
}

function ThisMonth({ now, moments }) {
  const label = ymLabel(now.ym, true).split(" ")[0];
  if (!moments.length) return null;
  return (
    <section className="hc-section">
      <SectionHead eyebrow="This month · across the league" title={`${label} moments`}>
        <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("calendar")}>The full calendar →</a>
      </SectionHead>
      <div className="hc-moments">
        {moments.map((c) => (
          <a key={c.m.id} href={href("m", c.m.id)} className="hc-moment">
            <span className="hc-moment-band" style={{ background: heroColor(c.m.team) }} aria-hidden="true" />
            <span className="hc-moment-team">{placeOf(c.m.team)} {c.m.team.name}</span>
            <span className="hc-moment-title">{c.moment}</span>
            <span className="hc-moment-date">{momentDate(c)}</span>
          </a>
        ))}
      </div>
    </section>
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
          <span className="hc-eyebrow">{t.abbr} · {t.conference} · {t.division}</span>
        </div>
        <div>
          <h3 className="hc-market-city">{placeOf(t)}</h3>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{t.name}</div>
        </div>
        {m.status === "complete" ? (
          <>
            <span className="hc-chip hc-chip-ink">{m.archetype.name}</span>
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
