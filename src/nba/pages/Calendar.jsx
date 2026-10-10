// League calendar: when each fan base is most engaged. All teams opens on a
// year map of who peaks when; pick a team for its own year of peaks and quiet
// months. Year and Month views; moments are filtered by season and real year
// so 2027 plans never read as this month's.
import React, { useMemo } from "react";
import { markets, league, review, today, seasonMonths, ymLabel, MONTHS, MONTHS_LONG, SEASON_ORDER, heroColor, inkOn } from "../data.js";
import { PeakMap, PeakChart } from "../charts.jsx";
import { TEAM_BY_ID, placeOf, shortLabel } from "../teams.js";
import { Chip, Priority, SectionHead, href, When, Certainty, EvidenceTag } from "../ui.jsx";
import { seasonOf, runsIn, fmtDate } from "../review.js";

const STATUS_TONE = { confirmed: "pop", "announced-tentative": "line", "not-announced": "warn" };
const STATUS_LABEL = { confirmed: "Confirmed", "announced-tentative": "Tentative", "not-announced": "Not announced" };

// A team's peaks: its hottest months, within 8 points of its own top, at most
// three. Quiet: up to three months at or under 55% of its top.
const maxOf = (m) => Math.max(...m.rhythm.map((r) => r.intensity));
export const peaksOf = (m) => new Set(SEASON_ORDER.filter((mo) => m.rhythm[mo - 1].intensity >= maxOf(m) - 8).sort((a, b) => m.rhythm[b - 1].intensity - m.rhythm[a - 1].intensity).slice(0, 3));
export const quietOf = (m) => new Set(SEASON_ORDER.filter((mo) => m.rhythm[mo - 1].intensity <= maxOf(m) * 0.55).sort((a, b) => m.rhythm[a - 1].intensity - m.rhythm[b - 1].intensity).slice(0, 3));

const ymFor = (season, mo) => seasonMonths(season)[SEASON_ORDER.indexOf(mo)];
// Moments (not work windows) for one team in one month of a season, most important first.
const momentsIn = (m, season, mo) => m.calendar.filter((c) => c.timing && c.timing.kind !== "action" && seasonOf(c.timing.start) === season && runsIn(c.timing, ymFor(season, mo))).sort((a, b) => a.priority - b.priority);

// Calendar state lives in the URL: #/calendar[/<team|all>[/<year|month>[/<1-12>]]]
const go = (team, view, mo) => { window.location.hash = `#/calendar/${team || "all"}/${view}${view === "month" ? `/${mo}` : ""}`; };

function TeamChip({ m, onClick, faded }) {
  const bg = heroColor(m.team);
  return (
    <button className="hc-team-chip" style={{ background: bg, color: inkOn(bg), opacity: faded ? 0.55 : 1 }} onClick={onClick} title={`${placeOf(m.team)} ${m.team.name}`} aria-label={`${placeOf(m.team)} ${m.team.name}: open its year`}>{m.team.abbr}</button>
  );
}

export default function Calendar({ args = [] }) {
  const now = today();
  const all = useMemo(() => markets.filter((m) => m.status === "complete").sort((a, b) => placeOf(a.team).localeCompare(placeOf(b.team))), []);
  const seasons = useMemo(() => [...new Set(all.flatMap((m) => m.calendar.map((c) => seasonOf(c.timing.start))))].sort(), [all]);
  const [teamArg, viewArg, moArg] = args;
  const team = all.find((m) => m.id === teamArg) || null;
  const view = viewArg === "month" ? "month" : "year";
  const nowMo = now.month;
  const mo = Number(moArg) >= 1 && Number(moArg) <= 12 ? Number(moArg) : nowMo;
  const [season, setSeason] = React.useState(seasons.includes(now.season) ? now.season : seasons[0]);
  const nowInSeason = season === now.season ? nowMo : null;

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>When fans are most engaged</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>League<br />calendar</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>Every team's fan year, October to September. See where each fan base peaks, when it goes quiet, and which teams to focus on in any month.</p>

      <div className="hc-cal-controls">
        <label className="hc-cal-team">
          <span className="hc-kv-label">Team</span>
          <select className="hc-select" value={team ? team.id : "all"} onChange={(e) => go(e.target.value === "all" ? null : e.target.value, view, mo)} aria-label="Team">
            <option value="all">All teams</option>
            {all.map((m) => <option key={m.id} value={m.id}>{placeOf(m.team)} {m.team.name}</option>)}
          </select>
        </label>
        <span className="hc-row" role="group" aria-label="View" style={{ gap: 6 }}>
          <button className="hc-pill-btn" aria-pressed={view === "year"} onClick={() => go(team && team.id, "year", mo)}>Year</button>
          <button className="hc-pill-btn" aria-pressed={view === "month"} onClick={() => go(team && team.id, "month", mo)}>Month</button>
        </span>
        {seasons.length > 1 && (
          <span className="hc-row" role="group" aria-label="Season" style={{ gap: 6 }}>
            {seasons.map((x) => <button key={x} className="hc-pill-btn" aria-pressed={season === x} onClick={() => setSeason(x)}>{x}{x === now.season ? " (now)" : ""}</button>)}
          </span>
        )}
      </div>

      {view === "month" && (
        <div className="hc-tabs hc-cal-months" role="group" aria-label="Month">
          {SEASON_ORDER.map((x) => <button key={x} className={`hc-pill-btn${x === nowInSeason ? " is-now" : ""}`} aria-pressed={x === mo} aria-label={x === nowInSeason ? `${MONTHS_LONG[x - 1]}, this month` : MONTHS_LONG[x - 1]} onClick={() => go(team && team.id, "month", x)}>{MONTHS[x - 1]}</button>)}
        </div>
      )}

      {!team && view === "year" && <AllYear all={all} season={season} now={nowInSeason} />}
      {!team && view === "month" && <AllMonth all={all} season={season} mo={mo} />}
      {team && view === "year" && <TeamYear m={team} season={season} now={nowInSeason} />}
      {team && view === "month" && <TeamMonth m={team} season={season} mo={mo} />}

      <BigDates season={season} now={now} />
    </div>
  );
}

// All teams, the whole year: how many peak each month, then who.
function AllYear({ all, season, now }) {
  const peaks = useMemo(() => Object.fromEntries(all.map((m) => [m.id, peaksOf(m)])), [all]);
  const counts = Object.fromEntries(SEASON_ORDER.map((mo) => [mo, all.filter((m) => peaks[m.id].has(mo)).length]));
  return (
    <section className="hc-section" style={{ paddingTop: 20 }}>
      <SectionHead eyebrow={`Season ${season} · all ${all.length} teams`} title="Who peaks when" />
      <div className="hc-card">
        <PeakMap counts={counts} now={now} onSelect={(mo) => go(null, "month", mo)} />
        <p className="hc-tiny hc-muted" style={{ marginTop: 8 }}>Teams at their own peak in each month. The tallest columns are where the most fan bases are at full heat at once. Tap a month to see every team that month.</p>
      </div>
      <ol className="hc-cal-journey">
        {SEASON_ORDER.map((mo) => {
          const hot = all.filter((m) => peaks[m.id].has(mo)).sort((a, b) => b.rhythm[mo - 1].intensity - a.rhythm[mo - 1].intensity);
          return (
            <li key={mo} className={mo === now ? "is-now" : ""}>
              <button className="hc-cal-month" onClick={() => go(null, "month", mo)}><b>{MONTHS_LONG[mo - 1]}</b><span>{hot.length ? `${hot.length} at peak` : "No peaks"}{mo === now ? " · now" : ""}</span></button>
              <div className="hc-cal-chips">{hot.length ? hot.map((m) => <TeamChip key={m.id} m={m} onClick={() => go(m.id, "year")} />) : <span className="hc-small hc-muted">A quieter month across the league.</span>}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// All teams in one month: ranked by heat, with peak and quiet tags and each
// team's biggest moment that month.
function AllMonth({ all, season, mo }) {
  const rows = all.map((m) => ({ m, v: m.rhythm[mo - 1].intensity, peak: peaksOf(m).has(mo), quiet: quietOf(m).has(mo), top: momentsIn(m, season, mo)[0] })).sort((a, b) => (b.peak - a.peak) || b.v - a.v);
  const focus = rows.filter((r) => r.peak).length, quiet = rows.filter((r) => r.quiet).length;
  return (
    <section className="hc-section" style={{ paddingTop: 20 }}>
      <SectionHead eyebrow={`${ymLabel(ymFor(season, mo))} · ${focus} at peak · ${quiet} quiet`} title={`${MONTHS_LONG[mo - 1]} across the league`} />
      <ol className="hc-cal-rank">
        {rows.map(({ m, v, peak, quiet: q, top }) => (
          <li key={m.id}>
            <TeamChip m={m} onClick={() => go(m.id, "month", mo)} />
            <div className="hc-cal-rank-body">
              <div className="hc-row" style={{ justifyContent: "space-between", gap: 8 }}>
                <a href={`#/calendar/${m.id}/month/${mo}`} style={{ fontWeight: 700, textDecoration: "none" }}>{placeOf(m.team)}</a>
                {peak ? <Chip tone="pop">Peak</Chip> : q ? <Chip tone="line">Quiet</Chip> : null}
              </div>
              <div className="hc-cal-bar" aria-label={`Fan heat ${v} of its own peak`}><i style={{ width: `${v}%`, background: peak ? "var(--accent)" : q ? "var(--seq-2)" : "var(--seq-4)" }} /></div>
              <div className="hc-small hc-muted">{m.rhythm[mo - 1].phase}{top ? <> · <span style={{ color: "var(--text)" }}>{top.moment}</span></> : null}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="hc-tiny hc-muted" style={{ marginTop: 10 }}>Bars show each team's heat as a share of its own peak month, so they compare timing, not size.</p>
    </section>
  );
}

// One team, the whole year: its rhythm, peaks and quiet months.
function TeamYear({ m, season, now }) {
  const peaks = peaksOf(m), quiet = quietOf(m);
  const moments = Object.fromEntries(SEASON_ORDER.map((mo) => [mo, momentsIn(m, season, mo).map((c) => c.moment)]));
  return (
    <section className="hc-section" style={{ paddingTop: 20 }}>
      <SectionHead eyebrow={`Season ${season} · fan heat by month`} title={`${placeOf(m.team)} ${m.team.name}`}>
        <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("m", m.id)}>City brief →</a>
      </SectionHead>
      <div className="hc-card">
        <PeakChart rhythm={m.rhythm} peaks={peaks} quiet={quiet} moments={moments} now={now} onSelect={(mo) => go(m.id, "month", mo)} />
      </div>
      <h3 className="hc-h3" style={{ margin: "26px 0 12px" }}>The peaks: where to focus</h3>
      <div className="hc-grid hc-grid-3">
        {SEASON_ORDER.filter((mo) => peaks.has(mo)).map((mo) => (
          <article key={mo} className="hc-card-invert hc-stack">
            <div className="hc-row" style={{ justifyContent: "space-between" }}><span className="hc-eyebrow" style={{ color: "var(--text-muted-invert)" }}>{MONTHS_LONG[mo - 1]}</span><Chip tone="pop">Peak · {m.rhythm[mo - 1].intensity}</Chip></div>
            <h4 className="hc-h3">{m.rhythm[mo - 1].phase}</h4>
            {moments[mo].length ? <ul className="hc-bullets hc-small">{moments[mo].slice(0, 3).map((t, k) => <li key={k}>{t}</li>)}</ul> : <p className="hc-small" style={{ opacity: 0.75 }}>No moment dated to {MONTHS_LONG[mo - 1]} in {season}.</p>}
            <a className="hc-cal-open" href={`#/calendar/${m.id}/month/${mo}`}>Open {MONTHS_LONG[mo - 1]} →</a>
          </article>
        ))}
      </div>
      {quiet.size > 0 && (
        <div className="hc-card" style={{ marginTop: 16 }}>
          <div className="hc-kv-label">Quiet months: focus on another team</div>
          <ul className="hc-list" style={{ marginTop: 8 }}>
            {SEASON_ORDER.filter((mo) => quiet.has(mo)).map((mo) => <li key={mo} className="hc-small"><b>{MONTHS_LONG[mo - 1]}</b> · heat {m.rhythm[mo - 1].intensity} · {m.rhythm[mo - 1].phase}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

// One team in one month: how hot, why, and what's on.
function TeamMonth({ m, season, mo }) {
  const r = m.rhythm[mo - 1], peak = peaksOf(m).has(mo), q = quietOf(m).has(mo);
  const list = momentsIn(m, season, mo);
  const others = markets.filter((x) => x.status === "complete" && x.id !== m.id && peaksOf(x).has(mo)).slice(0, 8);
  return (
    <section className="hc-section" style={{ paddingTop: 20 }}>
      <SectionHead eyebrow={ymLabel(ymFor(season, mo))} title={`${placeOf(m.team)} in ${MONTHS_LONG[mo - 1]}`}>
        <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={`#/calendar/${m.id}/year`}>The whole year →</a>
      </SectionHead>
      <div className="hc-grid hc-grid-2">
        <div className={peak ? "hc-card-invert hc-stack" : "hc-card hc-stack"}>
          <div className="hc-row" style={{ justifyContent: "space-between" }}><span className="hc-kv-label">Fan heat</span>{peak ? <Chip tone="pop">Peak</Chip> : q ? <Chip tone="line">Quiet</Chip> : <Chip tone="line">Steady</Chip>}</div>
          <div className="hc-display" style={{ fontSize: "clamp(3rem, 8vw, 4.5rem)", lineHeight: 1 }}>{r.intensity}</div>
          <p className="hc-small" style={{ opacity: 0.8 }}>of this team's peak month (100)</p>
          <h3 className="hc-h3">{r.phase}</h3>
          {q && others.length > 0 && <div><div className="hc-kv-label" style={{ marginBottom: 6 }}>At their peak instead</div><div className="hc-cal-chips">{others.map((x) => <TeamChip key={x.id} m={x} onClick={() => go(x.id, "month", mo)} />)}</div></div>}
        </div>
        <div className="hc-stack">
          <h3 className="hc-h3">Moments in {MONTHS_LONG[mo - 1]}</h3>
          {list.length ? list.map((c, i) => (
            <a key={i} href={href("m", m.id)} className="hc-card hc-stack" style={{ textDecoration: "none", display: "block" }}>
              <div className="hc-row" style={{ justifyContent: "space-between" }}><b>{c.moment}</b><Priority p={c.priority} /></div>
              <div className="hc-row"><When timing={c.timing} /><Certainty timing={c.timing} /></div>
              <p className="hc-small">{c.play}</p>
            </a>
          )) : <div className="hc-card hc-muted">Nothing dated to {MONTHS_LONG[mo - 1]} in {season}.</div>}
        </div>
      </div>
    </section>
  );
}

// The league's big nights and the checked league dates (2026-27).
function BigDates({ season, now }) {
  const tentpoles = season === "2026-27" && league ? [...league.tentpoles].map((t) => ({ ...t, ym: `${t.month >= 10 ? 2026 : 2027}-${String(t.month).padStart(2, "0")}` })).sort((a, b) => a.ym.localeCompare(b.ym)) : [];
  return (
    <>
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
                  <div className="hc-row" style={{ gap: 6 }}>{t.teams.filter((id) => TEAM_BY_ID[id]).map((id) => <a key={id} href={`#/calendar/${id}/year`} className={`hc-chip${t.ym === now.ym ? "" : " hc-chip-line"}`} style={{ textDecoration: "none" }}>{shortLabel(TEAM_BY_ID[id])}</a>)}</div>
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
    </>
  );
}
