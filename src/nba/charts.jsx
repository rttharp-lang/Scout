// Charts for NBA Fandom, built to the dataviz rules: one sequential hue (Scout
// ultramarine) for magnitude, thin capped columns with 4px rounded data-ends,
// hairline recessive grid, a hover/focus tooltip on every mark, text in ink
// tokens (never the series color), and a table/labels path that doesn't gate
// on hover.
import React, { useLayoutEffect, useRef, useState } from "react";
import { MONTHS, MONTHS_LONG, SEASON_ORDER } from "./data.js";


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

// ── Fan rhythm: 12 columns (season order), play dots underneath ──────
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
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fan heat by month relative to this city's own peak, October to September">
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
                aria-label={`${MONTHS_LONG[m - 1]}: fan heat ${v} of this city's peak 100${d ? `, ${d.phase}` : ""}${a.length ? `, ${a.length} play${a.length > 1 ? "s" : ""}` : ""}`}
                onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(m)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hc-tooltip" style={{ left: Math.max(130, Math.min(W - 130, hx)), top: Math.max(70, y(tip.intensity)) }}>
          <div><strong>{tip.intensity}</strong> <span className="hc-muted">of this city's peak · {MONTHS_LONG[tip.month - 1]}</span></div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{tip.phase}</div>
          {tip.team.length > 0 && <div className="hc-muted" style={{ marginTop: 4 }}>{tip.team.join(" · ")}</div>}
          {tip.local.length > 0 && <div style={{ marginTop: 4 }}>In town: {tip.local.join(" · ")}</div>}
          {tip.retailSignal && <div style={{ marginTop: 4 }}>Shopping: {tip.retailSignal}</div>}
          {acts(tip.month).length > 0 && <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 6 }}>{acts(tip.month).map((c, k) => <div key={k}>● {c.moment}</div>)}</div>}
        </div>
      )}
      <div className="hc-legend" style={{ marginTop: 6 }}>
        <span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--accent)" /></svg> Fan heat as a share of this city's own peak month (100). An editorial estimate, not comparable across cities.</span>
        <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="var(--pop)" /></svg> Top-priority play</span>
        <span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="var(--text)" /></svg> Other play</span>
      </div>
    </div>
  );
}

// ── Month pickers: twelve columns, October to September ────────────────
// Tap a column (or focus it and press Enter) to pick its month. The picked
// month sits on a white band with its value above it. No axis or tooltip:
// the panel under the chart carries the detail.
function MonthColumns({ label, values, max, fillFor, markFor, selected, now, onSelect, describe }) {
  const [ref, W] = useWidth();
  const H = 190, padX = 2, padT = 36, axisH = 30;
  const plotH = H - padT - axisH;
  const band = (W - padX * 2) / 12;
  const barW = Math.min(34, band * 0.6);
  const top = Math.max(1, max);
  const y = (v) => padT + plotH - (plotH * v) / top;
  return (
    <div className="hc-chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label}>
        <line x1={padX} x2={W - padX} y1={padT + plotH + 0.5} y2={padT + plotH + 0.5} stroke="var(--border)" />
        {SEASON_ORDER.map((m, i) => {
          const v = values[m] || 0, x0 = padX + band * i, x = x0 + (band - barW) / 2, sel = m === selected, mark = markFor && markFor(m);
          return (
            <g key={m}>
              {sel && <rect x={x0 + 1} y={1} width={band - 2} height={H - 2} rx={Math.min(12, band / 3)} fill="var(--hc-card)" />}
              {v > 0 && <path d={colPath(x, y(v), barW, padT + plotH - y(v))} fill={fillFor(m, v)} />}
              {mark && <path d={`M${x + barW / 2},${y(v) - 5} l-5,-8 h10 z`} fill="var(--pop)" stroke="var(--text)" strokeWidth="1" />}
              {sel && <text x={x + barW / 2} y={y(v) - (mark ? 18 : 8)} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>}
              <text x={x + barW / 2} y={H - 12} textAnchor="middle" fontSize="11.5" fontWeight={sel ? 700 : 500} fill={sel ? "var(--text)" : "var(--text-muted)"}>{band < 36 ? MONTHS[m - 1][0] : MONTHS[m - 1]}</text>
              {m === now && <circle cx={x + barW / 2} cy={H - 4} r="2.5" fill={sel ? "var(--text)" : "var(--text-muted)"} />}
              <rect className="hc-col-hit" x={x0} y={0} width={band} height={H} fill="transparent" tabIndex={0} role="button" aria-pressed={sel}
                aria-label={`${describe(m, v)}${m === now ? " (this month)" : ""}`}
                onClick={() => onSelect(m)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(m); } }} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// The league's year: how many teams are at their own peak each month.
export function PeakMap({ counts, selected, now, onSelect }) {
  const max = Math.max(0, ...SEASON_ORDER.map((m) => counts[m] || 0));
  return (
    <MonthColumns label="Teams at their peak by month. Pick a month." values={counts} max={max} selected={selected} now={now} onSelect={onSelect}
      fillFor={(m, v) => (v === max ? "var(--accent)" : "var(--seq-4)")}
      describe={(m, v) => `${MONTHS_LONG[m - 1]}: ${v} team${v === 1 ? "" : "s"} at their peak`} />
  );
}

// One team's year: fan heat by month, peaks in the accent with a marker,
// quiet months pale.
export function PeakChart({ rhythm, peaks, quiet, selected, now, onSelect }) {
  const values = Object.fromEntries(SEASON_ORDER.map((m) => [m, rhythm[m - 1].intensity]));
  return (
    <div>
      <MonthColumns label="Fan heat by month. Pick a month." values={values} max={100} selected={selected} now={now} onSelect={onSelect}
        fillFor={(m) => (peaks.has(m) ? "var(--accent)" : quiet.has(m) ? "var(--seq-2)" : "var(--seq-4)")}
        markFor={(m) => peaks.has(m)}
        describe={(m, v) => `${MONTHS_LONG[m - 1]}: fan heat ${v}${peaks.has(m) ? ", a peak" : quiet.has(m) ? ", a quiet month" : ""}`} />
      <div className="hc-legend hc-cal-legend">
        <span><svg width="10" height="10" aria-hidden="true"><path d="M5,9 L0,1 H10 Z" fill="var(--pop)" stroke="var(--text)" strokeWidth="1" /></svg> Peak</span>
        <span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--seq-2)" /></svg> Quiet</span>
        <span className="hc-muted">Heat is a share of this team's own best month</span>
      </div>
    </div>
  );
}
