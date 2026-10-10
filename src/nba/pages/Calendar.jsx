// League calendar: every market's fan rhythm on one heatmap, the league's big
// dates, and a month-by-month view of what happens and what needs action,
// filtered by season and real year so 2027 plans never read as this month's.
import React, { useMemo, useState } from "react";
import { markets, league, review, today, seasonMonths, ymLabel, MONTHS } from "../data.js";
import { LeagueHeatmap } from "../charts.jsx";
import { TEAM_BY_ID, shortLabel } from "../teams.js";
import { Chip, Priority, SectionHead, href, When, Certainty, ActBy, Route, EvidenceTag } from "../ui.jsx";
import { happeningIn, actionIn } from "../plan.js";
import { seasonOf, SCORE_DEFS, fmtDate } from "../review.js";

const STATUS_TONE = { confirmed: "pop", "announced-tentative": "line", "not-announced": "warn" };
const STATUS_LABEL = { confirmed: "Confirmed", "announced-tentative": "Tentative", "not-announced": "Not announced" };

export default function Calendar() {
  const now = today();
  const all = markets.filter((m) => m.status === "complete");
  const seasons = useMemo(() => [...new Set(all.flatMap((m) => m.calendar.map((c) => seasonOf(c.timing.start))))].sort(), []);
  const [season, setSeason] = useState(seasons.includes(now.season) ? now.season : seasons[0]);
  const months = seasonMonths(season);
  const [ym, setYm] = useState(months.includes(now.ym) ? now.ym : months[0]);
  const [mode, setMode] = useState("intensity");
  const [order, setOrder] = useState("peak");
  const month = Number(ym.slice(5, 7));

  const pickSeason = (x) => { setSeason(x); const ms = seasonMonths(x); setYm(ms.includes(now.ym) ? now.ym : ms[0]); };

  // Each row keeps only the plays dated to the chosen season.
  const rows = useMemo(() => {
    const list = all.map((m) => ({ ...m, calendar: m.calendar.filter((c) => seasonOf(c.timing.start) === season) }));
    if (order === "az") return list.sort((a, b) => a.team.city.localeCompare(b.team.city));
    return list.sort((a, b) => b.rhythm[month - 1].intensity - a.rhythm[month - 1].intensity);
  }, [order, month, season]);

  const happening = useMemo(() => happeningIn(ym), [ym]);
  const action = useMemo(() => actionIn(ym), [ym]);
  const tentpoles = season === "2026-27" && league ? [...league.tentpoles].map((t) => ({ ...t, ym: `${t.month >= 10 ? 2026 : 2027}-${String(t.month).padStart(2, "0")}` })).sort((a, b) => a.ym.localeCompare(b.ym)) : [];

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>When to show up</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>League<br />calendar</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>Every market's fan year and every dated play, one season at a time. Pick a season and a month to see what happens then, and what has to start then for something later.</p>

      <div className="hc-row" style={{ marginTop: 26, marginBottom: 14, gap: 10 }}>
        <span className="hc-row" role="group" aria-label="Season">
          {seasons.map((x) => <button key={x} className="hc-pill-btn" aria-pressed={season === x} onClick={() => pickSeason(x)}>Season {x}{x === now.season ? " (now)" : ""}</button>)}
        </span>
        <span className="hc-row" role="group" aria-label="Shade by">
          <button className="hc-pill-btn" aria-pressed={mode === "intensity"} onClick={() => setMode("intensity")}>Fan heat vs own peak</button>
          <button className="hc-pill-btn" aria-pressed={mode === "load"} onClick={() => setMode("load")}>Plays dated in {season}</button>
        </span>
        <span className="hc-row" role="group" aria-label="Order rows">
          <button className="hc-pill-btn" aria-pressed={order === "peak"} onClick={() => setOrder("peak")}>Closest to own peak in {MONTHS[month - 1]}</button>
          <button className="hc-pill-btn" aria-pressed={order === "az"} onClick={() => setOrder("az")}>A–Z</button>
        </span>
      </div>

      <div className="hc-card">
        <LeagueHeatmap rows={rows} mode={mode} now={season === now.season ? now.month : null} onSelect={(m) => setYm(months.find((x) => Number(x.slice(5, 7)) === m))} />
        <p className="hc-tiny hc-muted" style={{ marginTop: 10, maxWidth: "90ch" }}>Fan heat: {SCORE_DEFS.rhythm.kind.toLowerCase()}. {SCORE_DEFS.rhythm.baseline} Sorting by heat shows which cities are nearest their own peak that month, not which are biggest. Dots mark top-priority plays dated to {season}.</p>
      </div>

      <section className="hc-section">
        <SectionHead eyebrow={`Season ${season}`} title={ymLabel(ym, true)}>
          <div className="hc-tabs" style={{ marginBottom: 0 }} role="group" aria-label="Month">
            {months.map((x) => <button key={x} className="hc-pill-btn" aria-pressed={x === ym} onClick={() => setYm(x)}>{MONTHS[Number(x.slice(5, 7)) - 1]} {x.slice(2, 4)}</button>)}
          </div>
        </SectionHead>
        <div className="hc-grid hc-grid-2">
          <div>
            <h3 className="hc-h3" style={{ marginBottom: 4 }}>Happening in {ymLabel(ym)}</h3>
            <p className="hc-small hc-muted" style={{ marginBottom: 12 }}>Events, launches and seasons dated to this month.</p>
            {happening.length ? <div className="hc-grid">{happening.map((c, i) => <Play key={i} c={c} />)}</div> : <div className="hc-card hc-muted">Nothing dated to {ymLabel(ym)}.</div>}
          </div>
          <div>
            <h3 className="hc-h3" style={{ marginBottom: 4 }}>Act in {ymLabel(ym)} for later</h3>
            <p className="hc-small hc-muted" style={{ marginBottom: 12 }}>Action windows open this month, and moments whose act-by month has arrived.</p>
            {action.calendar.length ? <div className="hc-grid">{action.calendar.map((c, i) => <Play key={i} c={c} act />)}</div> : <div className="hc-card hc-muted">No action windows in {ymLabel(ym)}.</div>}
            {action.opportunities.length > 0 && <a className="hc-btn hc-btn-ghost" style={{ display: "inline-block", marginTop: 14, textDecoration: "none" }} href={href("opportunities")}>{action.opportunities.length} opportunities have a first decision due →</a>}
          </div>
        </div>
      </section>

      {tentpoles.length > 0 && (
        <section className="hc-section">
          <SectionHead eyebrow="Nights across the league · from the league read" title="The big dates" />
          <div className="hc-grid hc-grid-3">
            {tentpoles.map((t, i) => (
              <article key={i} className={t.ym === now.ym ? "hc-card-invert hc-stack" : "hc-card hc-stack"}>
                <div className="hc-row" style={{ justifyContent: "space-between" }}><span className="hc-eyebrow">{ymLabel(t.ym)}</span>{t.ym === now.ym && <Chip tone="pop">Now</Chip>}</div>
                <h3 className="hc-h3">{t.moment}</h3>
                <p className="hc-small hc-muted">{t.window}</p>
                <p className="hc-small">{t.play}</p>
                {t.teams && t.teams.length > 0 && (
                  <div className="hc-row" style={{ gap: 6 }}>{t.teams.filter((id) => TEAM_BY_ID[id]).map((id) => <a key={id} href={href("m", id)} className={`hc-chip${t.ym === now.ym ? "" : " hc-chip-line"}`} style={{ textDecoration: "none" }}>{shortLabel(TEAM_BY_ID[id])}</a>)}</div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {review.leagueCalendar && season === "2026-27" && (
        <section className="hc-section">
          <SectionHead eyebrow={`Checked live on ${fmtDate(review.leagueCalendar.verifiedAt)}`} title="League dates" />
          <div className="hc-card">
            <div className="hc-row" style={{ marginBottom: 10 }}><EvidenceTag kind="fact" /><span className="hc-small hc-muted">{review.leagueCalendar.confirmed} of {review.leagueCalendar.events} dates confirmed by a live source. The rest are tentative or not announced.</span></div>
            <ul className="hc-list">
              {review.leagueCalendar.list.map((e, i) => (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 210px) minmax(0, 1fr) auto", gap: 12, alignItems: "start" }}>
                  <span className="hc-small" style={{ fontWeight: 700 }}>{e.date}</span>
                  <span className="hc-small">{e.name}{e.source ? <> · <a href={e.source} target="_blank" rel="noreferrer">source</a></> : null}</span>
                  <Chip tone={STATUS_TONE[e.status] || "line"}>{STATUS_LABEL[e.status] || e.status}</Chip>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function Play({ c, act }) {
  const t = c.timing;
  return (
    <a href={href("m", c.m.id)} className="hc-card hc-stack" style={{ textDecoration: "none", display: "block" }}>
      <div className="hc-row" style={{ justifyContent: "space-between" }}>
        <span className="hc-row"><span className="hc-dot" style={{ background: c.m.team.colors[0] }} /><b>{shortLabel(c.m.team)}</b></span>
        <Priority p={c.priority} />
      </div>
      <h3 className="hc-h3">{c.moment}</h3>
      <div className="hc-row"><When timing={t} /><Certainty timing={t} /></div>
      {act && t.actBy ? <ActBy timing={t} /> : null}
      <p className="hc-small">{c.play}</p>
      <div className="hc-row">{t.reviewed && <Route route={t.route} />}{c.products.slice(0, 3).map((p, k) => <Chip key={k} tone="line">{p}</Chip>)}</div>
    </a>
  );
}
