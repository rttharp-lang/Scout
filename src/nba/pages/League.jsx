// The league read, shown on the Compare page under the side-by-side view:
// the League Strategist's cross-market synthesis — thesis,
// themes, fandom clusters, calibrated scores, the priority board, the Portland
// playbook and the watchlist. Tentpoles live on the Calendar page.
import React, { useMemo, useState } from "react";
import { markets, league, MONTHS } from "../data.js";
import { TEAM_BY_ID, placeOf, shortLabel } from "../teams.js";
import { SCORE_LABELS, href, SectionHead, Tier, EvidenceTag, Chip } from "../ui.jsx";
import { SCORE_DEFS, tierOf } from "../review.js";

const SORTS = [...SCORE_LABELS, ["az", "A–Z"]];
// Priority titles end with the brief's opportunity id, e.g. "Banner '26 (ring-night-1973-2026)".
const priorityTitle = (t) => t.replace(/\s*\([a-z0-9]+(?:-[a-z0-9]+)+\)\s*$/, "");

const SECTIONS = [["themes", "Themes"], ["clusters", "Fan types"], ["scores", "Scores"], ["priorities", "Top opportunities"], ["portland", "For Portland"], ["watchlist", "Ones to watch"]];

export default function League() {
  if (!league) {
    return <div className="hc-empty">The league read isn't ready yet. It's written once all 30 markets are researched.</div>;
  }
  const name = (id) => (TEAM_BY_ID[id] ? shortLabel(TEAM_BY_ID[id]) : id);

  return (
    <div>
      <section className="hc-section" id="league">
        <div className="hc-eyebrow" style={{ marginBottom: 12 }}>Across the league · 30 markets · 2026-27 · an interpretation of desk research</div>
        <h2 className="hc-h1" style={{ maxWidth: "32ch", fontSize: "clamp(2rem, 4.2vw, 3.4rem)" }}>{league.headline}</h2>
        <p className="hc-lede" style={{ marginTop: 18, maxWidth: "75ch" }}>{league.thesis}</p>
        <nav className="hc-row" aria-label="On this page" style={{ marginTop: 20 }}>
          {SECTIONS.filter(([id]) => id !== "watchlist" || league.watchlist.length).map(([id, label]) => (
            <a key={id} className="hc-pill-btn" style={{ textDecoration: "none" }} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }}>{label}</a>
          ))}
          <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("calendar")}>Big dates →</a>
        </nav>
      </section>

      <section className="hc-section">
        <SectionHead id="themes" eyebrow={`${league.themes.length} patterns across the briefs`} title="What the cities share" />
        <p className="hc-small hc-muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: "85ch" }}>Each pattern shows up in the briefs listed under it. That's agreement between research agents working mostly from the same model knowledge, not independent proof. Treat each as an interpretation to test.</p>
        <div className="hc-grid hc-grid-2">
          {league.themes.map((t, i) => (
            <article key={i} className="hc-card hc-stack">
              <div className="hc-row"><EvidenceTag kind="interpretation" /><Chip tone="line">{t.teams.length} of 30 briefs</Chip></div>
              <h3 className="hc-h3">{t.title}</h3>
              <p>{t.insight}</p>
              <p className="hc-implication">{t.implication}</p>
              <div className="hc-row">{t.teams.map((id) => <a key={id} href={href("m", id)} className="hc-chip hc-chip-line" style={{ textDecoration: "none" }}>{name(id)}</a>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="hc-section">
        <SectionHead id="clusters" eyebrow="Every market, sorted by the kind of fan base it has · an interpretation" title="Fan types" />
        <div className="hc-grid hc-grid-3">
          {league.clusters.map((c, i) => (
            <article key={i} className="hc-card-invert hc-stack">
              <h3 className="hc-h3">{c.name}</h3>
              <p className="hc-small hc-muted">{c.description}</p>
              <div className="hc-row">{c.teams.map((id) => <a key={id} href={href("m", id)} className="hc-chip" style={{ textDecoration: "none" }}>{name(id)}</a>)}</div>
              <p className="hc-small" style={{ borderLeft: "3px solid var(--pop)", paddingLeft: 10 }}>{c.playbook}</p>
            </article>
          ))}
        </div>
      </section>

      <Scores />

      <section className="hc-section">
        <div className="hc-grid hc-grid-2">
          <div className="hc-card" id="priorities">
            <h2 className="hc-h2">The top opportunities</h2>
            <p className="hc-small hc-muted" style={{ marginTop: 6 }}>The league strategist's ranking of the strongest ideas across the 30 briefs. All are hypotheses; none is approved.</p>
            <ol className="hc-list" style={{ marginTop: 12 }}>
              {league.priorities.map((p, i) => (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10 }}>
                  <b className="hc-insight-num" style={{ fontSize: 22 }}>{i + 1}</b>
                  <span><a href={href("m", p.team)} style={{ fontWeight: 700 }}>{name(p.team)}</a> — {priorityTitle(p.title)}<div className="hc-small hc-muted">{p.why} · {p.months.map((x) => MONTHS[x - 1]).join(", ")}</div></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="hc-card-invert" id="portland">
            <h2 className="hc-h2">For the team in Portland</h2>
            <p className="hc-small hc-muted" style={{ marginTop: 6 }}>Proposals for how to work, not decisions. Owners named here are suggestions.</p>
            <ul className="hc-list" style={{ marginTop: 12 }}>{league.portland.map((p, i) => <li key={i}><b>{p.title}</b><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{p.detail}</div></li>)}</ul>
          </div>
        </div>
      </section>

      {league.watchlist.length > 0 && (
        <section className="hc-section">
          <SectionHead id="watchlist" eyebrow="Expansion, and markets in flux" title="Ones to watch" />
          <div className="hc-grid hc-grid-2">
            {league.watchlist.map((w, i) => (
              <article key={i} className="hc-card hc-stack">
                <h3 className="hc-h3">{w.market}</h3>
                <p className="hc-small">{w.why}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Calibrated scores: every market on the four axes, shown as tiers because
// they are editorial estimates. Each row opens to the League Strategist's note.
function Scores() {
  const [sort, setSort] = useState("opportunity");
  const rows = useMemo(() => {
    const list = league.scores.map((s) => ({ ...s, team: markets.find((m) => m.id === s.team)?.team })).filter((s) => s.team);
    return list.sort((a, b) => (sort === "az" ? placeOf(a.team).localeCompare(placeOf(b.team)) : b[sort] - a[sort] || placeOf(a.team).localeCompare(placeOf(b.team))));
  }, [sort]);
  return (
    <section className="hc-section">
      <SectionHead id="scores" eyebrow="Editorial estimates, ranked across all 30 markets" title="The scores">
        <span className="hc-row" role="group" aria-label="Sort by">
          {SORTS.map(([k, l]) => <button key={k} className="hc-pill-btn" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
        </span>
      </SectionHead>
      <p className="hc-small hc-muted" style={{ marginTop: -8, marginBottom: 14, maxWidth: "90ch" }}>The league calibration agent set these from the 30 briefs on {SCORE_DEFS.opportunity.updated.split(" (")[0]}. No sales, attendance or survey data went in, so each shows as one of five tiers rather than a precise number. Open a market for the note on why it sits there. <a href={href("method", "scores")}>What each score measures</a>.</p>
      <div className="hc-card hc-scores">
        <div className="hc-scores-row hc-scores-head" aria-hidden="true">
          <span>Market</span>
          {SCORE_LABELS.map(([k, l]) => <span key={k}><span className="hc-scores-long">{l}</span><span className="hc-scores-short">{k === "opportunity" ? "Opp." : l}</span></span>)}
        </div>
        {rows.map((s) => (
          <details key={s.team.id} className="hc-scores-item">
            <summary className="hc-scores-row">
              <span className="hc-scores-name"><span className="hc-dot" style={{ background: s.team.colors[0] }} />{placeOf(s.team)} {s.team.name}</span>
              {SCORE_LABELS.map(([k, l]) => (
                <span key={k} className="hc-scores-cell" aria-label={`${l}: ${tierOf(s[k]).label}`} data-sorted={sort === k || undefined}>
                  <span className="hc-tier-pips" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= tierOf(s[k]).bars ? "on" : ""} />)}</span>
                  <b className="hc-tiny">{tierOf(s[k]).label}</b>
                </span>
              ))}
            </summary>
            <p className="hc-small hc-scores-note">{s.note} <a href={href("m", s.team.id)}>Go to the market →</a></p>
          </details>
        ))}
      </div>
    </section>
  );
}
