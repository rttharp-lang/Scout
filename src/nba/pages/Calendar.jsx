// League calendar, built as an infographic: one chart of the year and, under
// it, the month you tap. All teams shows who peaks when; pick a team for its
// own year, with peaks and quiet months, and each month's key moments as
// short headlines (tap one for its play). Moments are filtered by season and
// real year so 2027 plans never read as this month's.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { markets, league, review, today, ymLabel, MONTHS_LONG, SEASON_ORDER, heroColor, inkOn } from "../data.js";
import { PeakMap, PeakChart } from "../charts.jsx";
import { placeOf } from "../teams.js";
import { Chip, SectionHead, href, EvidenceTag } from "../ui.jsx";
import { seasonOf, seasonMonths, runsIn, fmtDate } from "../review.js";
import { headline, whenShort } from "../moments.js";

const STATUS_TONE = { confirmed: "pop", "announced-tentative": "line", "not-announced": "warn" };
const STATUS_LABEL = { confirmed: "Confirmed", "announced-tentative": "Tentative", "not-announced": "Not announced" };

// A team's peaks: its hottest months, within 8 points of its own top, at most
// three. Quiet: up to three months at or under 55% of its top.
const maxOf = (m) => Math.max(...m.rhythm.map((r) => r.intensity));
export const peaksOf = (m) => new Set(SEASON_ORDER.filter((mo) => m.rhythm[mo - 1].intensity >= maxOf(m) - 8).sort((a, b) => m.rhythm[b - 1].intensity - m.rhythm[a - 1].intensity).slice(0, 3));
export const quietOf = (m) => new Set(SEASON_ORDER.filter((mo) => m.rhythm[mo - 1].intensity <= maxOf(m) * 0.55).sort((a, b) => m.rhythm[a - 1].intensity - m.rhythm[b - 1].intensity).slice(0, 3));

const ymFor = (season, mo) => seasonMonths(season)[SEASON_ORDER.indexOf(mo)];
// Moments (not work windows) for one team in one month of a season: key ones
// first, then by date.
const momentsIn = (m, season, mo) => m.calendar
  .filter((c) => c.timing && c.timing.kind !== "action" && seasonOf(c.timing.start) === season && runsIn(c.timing, ymFor(season, mo)))
  .sort((a, b) => a.priority - b.priority || a.timing.start.localeCompare(b.timing.start));
const listMonths = (set) => SEASON_ORDER.filter((mo) => set.has(mo)).map((mo) => MONTHS_LONG[mo - 1]);
const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// #/calendar/<team|all>/<1-12>. Older #/calendar/<team>/month/<m> and /year links still work.
function monthFromArgs([, a, b]) {
  const n = Number(a === "month" ? b : a);
  return n >= 1 && n <= 12 ? n : null;
}

function TeamChip({ m, onClick }) {
  const bg = heroColor(m.team);
  return <button className="hc-team-chip" style={{ background: bg, color: inkOn(bg) }} onClick={onClick} title={`${placeOf(m.team)} ${m.team.name}`} aria-label={`${placeOf(m.team)} ${m.team.name}`}>{m.team.abbr}</button>;
}

export default function Calendar({ args = [] }) {
  const now = today();
  const all = useMemo(() => markets.filter((m) => m.status === "complete").sort((a, b) => placeOf(a.team).localeCompare(placeOf(b.team))), []);
  const seasons = useMemo(() => [...new Set(all.flatMap((m) => m.calendar.map((c) => seasonOf(c.timing.start))))].sort(), [all]);
  const team = all.find((m) => m.id === args[0]) || null;
  const [season, setSeason] = useState(seasons.includes(now.season) ? now.season : seasons[0]);
  const nowMo = season === now.season ? now.month : null;
  const argMo = monthFromArgs(args);
  const [mo, setMo] = useState(argMo || nowMo || 10);
  useEffect(() => { if (argMo) setMo(argMo); }, [argMo]);

  // Switching team brings its chart into view (a fresh visit starts at the top).
  const teamId = team ? team.id : "all";
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (args[0]) window.scrollTo(0, 0); return; }
    document.getElementById("cal-view")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [teamId]);

  // Picking a month swaps the panel in place; the URL follows without a jump.
  const pick = (m) => { setMo(m); window.history.replaceState(null, "", `#/calendar/${team ? team.id : "all"}/${m}`); };
  const openTeam = (id) => { window.location.hash = `#/calendar/${id || "all"}/${mo}`; };
  const step = (d) => { const i = SEASON_ORDER.indexOf(mo) + d; if (i >= 0 && i < 12) pick(SEASON_ORDER[i]); };

  return (
    <div>
      <h1 className="hc-display" style={{ fontSize: "clamp(2.5rem, 8vw, 5.5rem)" }}>League calendar</h1>
      <p className="hc-lede" style={{ marginTop: 10 }}>Tap a month to see who's at their peak and what fans turn out for.</p>

      <div className="hc-cal-controls">
        <label className="hc-cal-team">
          <span className="hc-kv-label">Team</span>
          <select className="hc-select" value={team ? team.id : "all"} onChange={(e) => openTeam(e.target.value === "all" ? null : e.target.value)} aria-label="Team">
            <option value="all">All teams</option>
            {all.map((m) => <option key={m.id} value={m.id}>{placeOf(m.team)} {m.team.name}</option>)}
          </select>
        </label>
        {seasons.length > 1 && (
          <span className="hc-row" role="group" aria-label="Season" style={{ gap: 6 }}>
            {seasons.map((x) => <button key={x} className="hc-pill-btn" aria-pressed={season === x} onClick={() => setSeason(x)}>{x}{x === now.season ? " (now)" : ""}</button>)}
          </span>
        )}
      </div>

      {team
        ? <TeamYear m={team} all={all} season={season} mo={mo} now={nowMo} pick={pick} step={step} openTeam={openTeam} />
        : <LeagueYear all={all} season={season} mo={mo} now={nowMo} pick={pick} step={step} openTeam={openTeam} />}
    </div>
  );
}

// The month heading inside a panel, with steps to the months either side.
function MonthHead({ mo, step, tag, sub }) {
  const i = SEASON_ORDER.indexOf(mo);
  return (
    <div className="hc-cal-head">
      <button className="hc-cal-step" onClick={() => step(-1)} disabled={i === 0} aria-label={i > 0 ? `Previous month, ${MONTHS_LONG[SEASON_ORDER[i - 1] - 1]}` : "Previous month"}>‹</button>
      <div className="hc-cal-head-text" aria-live="polite">
        <div className="hc-row" style={{ gap: 10 }}><h3 className="hc-cal-mname">{MONTHS_LONG[mo - 1]}</h3>{tag}</div>
        {sub && <div className="hc-cal-sub">{sub}</div>}
      </div>
      <button className="hc-cal-step" onClick={() => step(1)} disabled={i === 11} aria-label={i < 11 ? `Next month, ${MONTHS_LONG[SEASON_ORDER[i + 1] - 1]}` : "Next month"}>›</button>
    </div>
  );
}

// One moment as a headline and a short date; tap for the full title and the play.
function Moment({ title, when, detail, extra, link, key1 }) {
  const short = headline(title);
  return (
    <li>
      <details className="hc-mo">
        <summary>
          <span className={`hc-mo-dot${key1 ? " is-key" : ""}`} aria-hidden="true" />
          <span className="hc-mo-title">{short}{key1 && <span className="hc-sr"> (key moment)</span>}</span>
          {when && <span className="hc-mo-when">{when}</span>}
        </summary>
        <div className="hc-mo-more">
          {short !== title && <p className="hc-mo-full">{title}</p>}
          {extra && <p className="hc-small hc-muted">{extra}</p>}
          {detail && <p className="hc-small">{detail}</p>}
          {link}
        </div>
      </details>
    </li>
  );
}

// All teams: how many teams peak each month, and for the picked month who
// they are and what's on across the league.
function LeagueYear({ all, season, mo, now, pick, step, openTeam }) {
  const peaks = useMemo(() => Object.fromEntries(all.map((m) => [m.id, peaksOf(m)])), [all]);
  const counts = Object.fromEntries(SEASON_ORDER.map((x) => [x, all.filter((m) => peaks[m.id].has(x)).length]));
  const atPeak = all.filter((m) => peaks[m.id].has(mo)).sort((a, b) => b.rhythm[mo - 1].intensity - a.rhythm[mo - 1].intensity);
  const hottest = atPeak.length ? [] : [...all].sort((a, b) => b.rhythm[mo - 1].intensity - a.rhythm[mo - 1].intensity).slice(0, 5);
  const tentpoles = season === "2026-27" && league ? league.tentpoles.filter((t) => t.month === mo) : [];

  return (
    <section className="hc-section" id="cal-view" style={{ marginTop: 28, paddingTop: 0, scrollMarginTop: 12 }}>
      <SectionHead title="Who peaks when" />
      <div className="hc-card hc-cal-card">
        <PeakMap counts={counts} selected={mo} now={now} onSelect={pick} />
        <div className="hc-cal-panel">
          <MonthHead mo={mo} step={step} sub={ymLabel(ymFor(season, mo))}
            tag={<Chip tone={atPeak.length ? "pop" : "line"}>{atPeak.length ? `${atPeak.length} at their peak` : "No team at its peak"}</Chip>} />
          <div className="hc-kv-label" style={{ margin: "16px 0 8px" }}>{atPeak.length ? "At their peak · tap a team" : "Running hottest · tap a team"}</div>
          <div className="hc-cal-chips">{(atPeak.length ? atPeak : hottest).map((m) => <TeamChip key={m.id} m={m} onClick={() => openTeam(m.id)} />)}</div>
          {tentpoles.length > 0 && (
            <>
              <div className="hc-kv-label" style={{ margin: "20px 0 2px" }}>Across the league</div>
              <ul className="hc-mo-list">
                {tentpoles.map((t, i) => <Moment key={i} title={t.moment} key1 extra={t.window} detail={t.play} />)}
              </ul>
            </>
          )}
        </div>
      </div>

      {review.leagueCalendar && season === "2026-27" && (
        <details className="hc-cal-dates">
          <summary>League dates checked live · {review.leagueCalendar.confirmed} of {review.leagueCalendar.events} confirmed</summary>
          <div className="hc-row" style={{ margin: "12px 0 10px" }}><EvidenceTag kind="fact" /><span className="hc-small hc-muted">Checked on {fmtDate(review.leagueCalendar.verifiedAt)}. The rest are tentative or not announced.</span></div>
          <ul className="hc-list">
            {review.leagueCalendar.list.map((e, i) => (
              <li key={i} className="hc-cal-date-row">
                <span className="hc-small" style={{ fontWeight: 700 }}>{e.date}</span>
                <span className="hc-small">{e.name}{e.source ? <> · <a href={e.source} target="_blank" rel="noreferrer">source</a></> : null}</span>
                <Chip tone={STATUS_TONE[e.status] || "line"}>{STATUS_LABEL[e.status] || e.status}</Chip>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// One team: its fan year, and for the picked month how hot it runs and the
// moments fans turn out for. In a quiet month, who to look at instead.
function TeamYear({ m, all, season, mo, now, pick, step, openTeam }) {
  const peaks = useMemo(() => peaksOf(m), [m]);
  const quiet = useMemo(() => quietOf(m), [m]);
  const r = m.rhythm[mo - 1];
  const isPeak = peaks.has(mo), isQuiet = quiet.has(mo);
  const list = momentsIn(m, season, mo);
  const instead = isQuiet ? all.filter((x) => x.id !== m.id && peaksOf(x).has(mo)).slice(0, 8) : [];
  const summary = [`Peaks in ${andList(listMonths(peaks))}.`, quiet.size ? `Quiet in ${andList(listMonths(quiet))}.` : ""].join(" ");

  return (
    <section className="hc-section" id="cal-view" style={{ marginTop: 28, paddingTop: 0, scrollMarginTop: 12 }}>
      <SectionHead title={`${placeOf(m.team)} ${m.team.name}`}>
        <a className="hc-pill-btn" style={{ textDecoration: "none" }} href={href("m", m.id)}>City brief →</a>
      </SectionHead>
      <p className="hc-cal-summary">{summary}</p>
      <div className="hc-card hc-cal-card">
        <PeakChart rhythm={m.rhythm} peaks={peaks} quiet={quiet} selected={mo} now={now} onSelect={pick} />
        <div className="hc-cal-panel">
          <MonthHead mo={mo} step={step} sub={r.phase}
            tag={<Chip tone={isPeak ? "pop" : "line"}>{isPeak ? "Peak" : isQuiet ? "Quiet" : "Steady"} · {r.intensity}</Chip>} />
          {list.length ? (
            <ul className="hc-mo-list" style={{ marginTop: 12 }}>
              {list.map((c, i) => (
                <Moment key={i} title={c.moment} when={whenShort(c.timing)} key1={c.priority === 1} detail={c.play}
                  link={<a className="hc-small" href={href("m", m.id)}>More in the city brief →</a>} />
              ))}
            </ul>
          ) : <p className="hc-small hc-muted" style={{ marginTop: 14 }}>No dated moments in {MONTHS_LONG[mo - 1]} {ymFor(season, mo).slice(0, 4)}.</p>}
          {isQuiet && instead.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="hc-kv-label" style={{ marginBottom: 8 }}>A quiet month · at their peak instead</div>
              <div className="hc-cal-chips">{instead.map((x) => <TeamChip key={x.id} m={x} onClick={() => openTeam(x.id)} />)}</div>
            </div>
          )}
        </div>
      </div>
      <p className="hc-tiny hc-muted" style={{ marginTop: 10 }}><span className="hc-mo-dot is-key" aria-hidden="true" style={{ display: "inline-block", marginRight: 6, verticalAlign: "-1px" }} />Key moment. Tap any moment for the play.</p>
    </section>
  );
}
