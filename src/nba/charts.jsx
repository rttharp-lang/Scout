// Charts for Home Court, built to the dataviz rules: one sequential hue (Scout
// ultramarine) for magnitude, thin capped columns with 4px rounded data-ends,
// hairline recessive grid, a hover/focus tooltip on every mark, text in ink
// tokens (never the series color), and a table/labels path that doesn't gate
// on hover.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MONTHS, MONTHS_LONG, SEASON_ORDER } from "./data.js";

const RAMP = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)", "var(--seq-7)", "var(--seq-8)"];
export const rampFor = (v) => RAMP[Math.max(0, Math.min(7, Math.floor((Number(v) || 0) / 12.5)))];
const inkForStep = (v) => ((Number(v) || 0) >= 62.5 ? "#fff" : "var(--text)");

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(720);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Column path with a 4px rounded data-end and a square baseline.
function colPath(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// ── Fan rhythm: 12 columns (season order), activation dots underneath ──────
export function RhythmChart({ months, calendar = [], now }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 230, padL = 30, padR = 6, padT = 26, axisH = 46;
  const plotH = H - padT - axisH;
  const band = (W - padL - padR) / 12;
  const barW = Math.min(24, band * 0.56);
  const byMonth = Object.fromEntries((months || []).map((m) => [m.month, m]));
  const acts = (m) => calendar.filter((c) => c.month === m);
  const y = (v) => padT + plotH - (plotH * v) / 100;

  const tip = hover != null ? byMonth[hover] : null;
  const hx = hover != null ? padL + band * SEASON_ORDER.indexOf(hover) + band / 2 : 0;

  return (
    <div className="hc-chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fan engagement intensity by month, October to September">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{g}</text>
          </g>
        ))}
        {SEASON_ORDER.map((m, i) => {
          const d = byMonth[m];
          const v = d ? d.intensity : 0;
          const x = padL + band * i + (band - barW) / 2;
          const isNow = m === now;
          const a = acts(m);
          const p1 = a.filter((c) => c.priority === 1).length;
          return (
            <g key={m}>
              <path d={colPath(x, y(v), barW, plotH + padT - y(v))} fill={hover == null || hover === m ? "var(--accent)" : "var(--seq-3)"} />
              {isNow && <text x={x + barW / 2} y={y(v) - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">Now</text>}
              <text x={x + barW / 2} y={padT + plotH + 17} textAnchor="middle" fontSize="11.5" fontWeight={isNow ? 700 : 500} fill={isNow ? "var(--text)" : "var(--text-muted)"}>{band < 34 ? MONTHS[m - 1][0] : MONTHS[m - 1]}</text>
              {a.slice(0, 3).map((c, k) => (
                <circle key={k} cx={x + barW / 2 + (k - (Math.min(a.length, 3) - 1) / 2) * 10} cy={padT + plotH + 33} r="4" fill={k < p1 ? "var(--pop)" : "var(--text)"} stroke="var(--bg)" strokeWidth="2" />
              ))}
              <rect x={padL + band * i} y={0} width={band} height={H} fill="transparent" tabIndex={0}
                aria-label={`${MONTHS_LONG[m - 1]}: intensity ${v}${d ? `, ${d.phase}` : ""}${a.length ? `, ${a.length} activation${a.length > 1 ? "s" : ""}` : ""}`}
                onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(m)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hc-tooltip" style={{ left: Math.max(130, Math.min(W - 130, hx)), top: Math.max(70, y(tip.intensity)) }}>
          <div><strong>{tip.intensity}</strong> <span className="hc-muted">· {MONTHS_LONG[tip.month - 1]}</span></div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{tip.phase}</div>
          {tip.team.length > 0 && <div className="hc-muted" style={{ marginTop: 4 }}>{tip.team.join(" · ")}</div>}
          {tip.local.length > 0 && <div style={{ marginTop: 4 }}>City: {tip.local.join(" · ")}</div>}
          {tip.retailSignal && <div style={{ marginTop: 4 }}>Buying: {tip.retailSignal}</div>}
          {acts(tip.month).length > 0 && <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 6 }}>{acts(tip.month).map((c, k) => <div key={k}>● {c.moment}</div>)}</div>}
        </div>
      )}
      <div className="hc-legend" style={{ marginTop: 6 }}>
        <span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--accent)" /></svg> Fan engagement (0–100, this fan base's own peak = 100)</span>
        <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="var(--pop)" /></svg> Priority-1 activation</span>
        <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="var(--text)" /></svg> Other activation</span>
      </div>
    </div>
  );
}

// ── League heatmap: markets × months ─────────────────────────────────────
export function LeagueHeatmap({ rows, mode = "intensity", now, onSelect }) {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [tip]);

  const valueOf = (r, m) => {
    if (mode === "intensity") return r.rhythm ? r.rhythm[m - 1].intensity : null;
    const load = (r.calendar || []).filter((c) => c.month === m).reduce((s, c) => s + (4 - c.priority), 0);
    return Math.min(100, load * 20);
  };

  const show = (e, r, m) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top, r, m });
  };

  return (
    <div>
      <div className="hc-heat-scroll">
        <table className="hc-heat">
          <thead>
            <tr>
              <th scope="col" className="hc-heat-team">Market</th>
              {SEASON_ORDER.map((m) => <th key={m} scope="col" style={m === now ? { color: "var(--text)" } : undefined}>{MONTHS[m - 1]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="hc-heat-team">
                  <a href={`#/m/${r.id}`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="hc-dot" style={{ background: r.team.colors[0] }} />{r.team.city === "Los Angeles" || r.team.city === "New York" || r.team.city === "Brooklyn" ? `${r.team.name}` : r.team.city}
                  </a>
                </th>
                {SEASON_ORDER.map((m) => {
                  const v = valueOf(r, m);
                  const p1 = (r.calendar || []).some((c) => c.month === m && c.priority === 1);
                  if (v == null) return <td key={m} style={{ background: "var(--surface)" }} aria-label={`${r.team.city}: not yet researched`} />;
                  return (
                    <td key={m} tabIndex={0} style={{ background: rampFor(v) }}
                      aria-label={`${r.team.city} ${r.team.name}, ${MONTHS_LONG[m - 1]}: ${mode === "intensity" ? `fan intensity ${v}` : `activation load ${v}`}${p1 ? ", priority-1 activation" : ""}`}
                      onMouseEnter={(e) => show(e, r, m)} onMouseLeave={() => setTip(null)} onFocus={(e) => show(e, r, m)} onBlur={() => setTip(null)}
                      onClick={() => onSelect && onSelect(m)}>
                      {p1 && <span className="hc-heat-dot" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hc-legend" style={{ marginTop: 10 }}>
        <span>{mode === "intensity" ? "Fan engagement" : "Activation load"}: low</span>
        <span className="hc-legend-ramp">{RAMP.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
        <span>high</span>
        <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="var(--pop)" stroke="#0A0A0A" strokeWidth="1.5" /></svg> Priority-1 activation</span>
      </div>
      {tip && (() => {
        const { r, m } = tip;
        const d = r.rhythm ? r.rhythm[m - 1] : null;
        const acts = (r.calendar || []).filter((c) => c.month === m);
        return (
          <div className="hc-tooltip" style={{ position: "fixed", left: Math.max(150, Math.min(window.innerWidth - 150, tip.x)), top: tip.y }}>
            <div><strong>{valueOf(r, m)}</strong> <span className="hc-muted">· {r.team.city} {r.team.name}, {MONTHS_LONG[m - 1]}</span></div>
            {d && <div style={{ fontWeight: 600, marginTop: 2 }}>{d.phase}</div>}
            {acts.length > 0 && <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 6 }}>{acts.map((c, k) => <div key={k}>P{c.priority} · {c.moment}</div>)}</div>}
          </div>
        );
      })()}
    </div>
  );
}

export const cellInk = inkForStep;
