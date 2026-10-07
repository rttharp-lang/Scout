// League activation calendar: every market's fan rhythm on one heatmap, the
// league tentpoles, and a month drill-down of every planned activation.
import React, { useMemo, useState } from "react";
import { markets, league, currentMonth, MONTHS_LONG, SEASON_ORDER, MONTHS } from "../data.js";
import { LeagueHeatmap } from "../charts.jsx";
import { Chip, Priority, SectionHead, href } from "../ui.jsx";

export default function Calendar() {
  const [mode, setMode] = useState("intensity");
  const [month, setMonth] = useState(currentMonth());
  const [order, setOrder] = useState("peak");
  const now = currentMonth();

  const rows = useMemo(() => {
    const list = markets.filter((m) => m.status === "complete");
    if (order === "az") return [...list].sort((a, b) => a.team.city.localeCompare(b.team.city));
    // Sort by intensity in the selected month (who's hottest when).
    return [...list].sort((a, b) => b.rhythm[month - 1].intensity - a.rhythm[month - 1].intensity);
  }, [order, month]);

  const acts = useMemo(() => markets.flatMap((m) => (m.calendar || []).filter((c) => c.month === month).map((c) => ({ ...c, m }))).sort((a, b) => a.priority - b.priority), [month]);
  const pending = markets.length - rows.length;

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>When to activate</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>League<br />calendar</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>Each row is one fan base's year, scored by its own Fan Rhythm agent (100 = that market's peak). Lime dots mark priority-1 activations from the market's brief. Pick a month to see every play.</p>

      <div className="hc-row" style={{ marginTop: 26, marginBottom: 14, gap: 10 }}>
        <span className="hc-row" role="group" aria-label="Color by">
          <button className="hc-pill-btn" aria-pressed={mode === "intensity"} onClick={() => setMode("intensity")}>Fan engagement</button>
          <button className="hc-pill-btn" aria-pressed={mode === "load"} onClick={() => setMode("load")}>Activation load</button>
        </span>
        <span className="hc-row" role="group" aria-label="Order rows">
          <button className="hc-pill-btn" aria-pressed={order === "peak"} onClick={() => setOrder("peak")}>Hottest in {MONTHS[month - 1]}</button>
          <button className="hc-pill-btn" aria-pressed={order === "az"} onClick={() => setOrder("az")}>A–Z</button>
        </span>
      </div>

      <div className="hc-card">
        {rows.length ? <LeagueHeatmap rows={rows} mode={mode} now={now} onSelect={setMonth} /> : <div className="hc-empty">No markets published yet.</div>}
        {pending > 0 && <p className="hc-tiny hc-muted" style={{ marginTop: 8 }}>{pending} market{pending > 1 ? "s" : ""} still being researched — not shown.</p>}
      </div>

      {league && (
        <section className="hc-section">
          <SectionHead eyebrow="Cross-market moments" title="League tentpoles" />
          <div className="hc-grid hc-grid-3">
            {[...league.tentpoles].sort((a, b) => SEASON_ORDER.indexOf(a.month) - SEASON_ORDER.indexOf(b.month)).map((t, i) => (
              <article key={i} className={t.month === now ? "hc-card-invert hc-stack" : "hc-card hc-stack"}>
                <div className="hc-row" style={{ justifyContent: "space-between" }}><span className="hc-eyebrow">{MONTHS_LONG[t.month - 1]} · {t.window}</span>{t.month === now && <Chip tone="pop">Now</Chip>}</div>
                <h3 className="hc-h3">{t.moment}</h3>
                <p className="hc-small">{t.play}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="hc-section">
        <SectionHead eyebrow="Month drill-down" title={MONTHS_LONG[month - 1]}>
          <div className="hc-tabs" style={{ marginBottom: 0 }} role="group" aria-label="Month">
            {SEASON_ORDER.map((m) => <button key={m} className="hc-pill-btn" aria-pressed={m === month} onClick={() => setMonth(m)}>{MONTHS[m - 1]}</button>)}
          </div>
        </SectionHead>
        {acts.length ? (
          <div className="hc-grid hc-grid-3">
            {acts.map((c, i) => (
              <a key={i} href={href("m", c.m.id)} className="hc-card hc-stack" style={{ textDecoration: "none", display: "block" }}>
                <div className="hc-row" style={{ justifyContent: "space-between" }}>
                  <span className="hc-row"><span className="hc-dot" style={{ background: c.m.team.colors[0] }} /><b>{c.m.team.city} {c.m.team.name}</b></span>
                  <Priority p={c.priority} />
                </div>
                <h3 className="hc-h3">{c.moment}</h3>
                <p className="hc-small hc-muted">{c.window}</p>
                <p className="hc-small">{c.play}</p>
                <div className="hc-row">{c.products.map((p, k) => <Chip key={k} tone="line">{p}</Chip>)}</div>
              </a>
            ))}
          </div>
        ) : <div className="hc-card hc-muted">No activations planned for {MONTHS_LONG[month - 1]}.</div>}
      </section>
    </div>
  );
}
