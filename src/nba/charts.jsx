// Charts for NBA Fandom, built to the dataviz rules: one sequential hue (Scout
// ultramarine) for magnitude, thin capped columns with 4px rounded data-ends,
// hairline recessive grid, a hover/focus tooltip on every mark, text in ink
// tokens (never the series color), and a table/labels path that doesn't gate
// on hover.
import React, { useLayoutEffect, useRef, useState } from "react";
import { MONTHS, MONTHS_LONG, SEASON_ORDER } from "./data.js";
import { placeOf } from "./teams.js";


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

// ── Year map: how many teams peak in each month, October to September ──
// One column per month; the tallest columns are where the league is most
// saturated. Tap a month to open it.
export function PeakMap({ counts, now, onSelect }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 200, padL = 6, padR = 6, padT = 24, axisH = 26;
  const plotH = H - padT - axisH;
  const band = (W - padL - padR) / 12;
  const barW = Math.min(30, band * 0.62);
  const max = Math.max(1, ...SEASON_ORDER.map((m) => counts[m] || 0));
  const top = Math.max(...SEASON_ORDER.map((m) => counts[m] || 0));
  const y = (v) => padT + plotH - (plotH * v) / max;
  return (
    <div className="hc-chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Teams at their peak by month: ${SEASON_ORDER.map((m) => `${MONTHS[m - 1]} ${counts[m] || 0}`).join(", ")}`}>
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="var(--border)" />
        {SEASON_ORDER.map((m, i) => {
          const v = counts[m] || 0, x = padL + band * i + (band - barW) / 2, isTop = v === top && v > 0;
          return (
            <g key={m}>
              <path d={colPath(x, y(v), barW, padT + plotH - y(v))} fill={isTop ? "var(--accent)" : hover === m ? "var(--seq-6)" : "var(--seq-4)"} />
              {v > 0 && <text x={x + barW / 2} y={y(v) - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight={m === now ? 700 : 500} fill={m === now ? "var(--text)" : "var(--text-muted)"}>{band < 34 ? MONTHS[m - 1][0] : MONTHS[m - 1]}</text>
              <rect x={padL + band * i} y={0} width={band} height={H} fill="transparent" tabIndex={0} role="button" style={{ cursor: "pointer" }}
                aria-label={`${MONTHS_LONG[m - 1]}: ${v} team${v === 1 ? "" : "s"} at their peak. Open the month.`}
                onClick={() => onSelect && onSelect(m)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect && onSelect(m); } }}
                onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(m)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── One team's year: fan heat by month with its peaks and quiet months ──
// Peaks in the accent color with a marker above; quiet months pale. Tap a
// month to open it.
export function PeakChart({ rhythm, peaks, quiet, moments = {}, now, onSelect }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 250, padL = 30, padR = 6, padT = 30, axisH = 30;
  const plotH = H - padT - axisH;
  const band = (W - padL - padR) / 12;
  const barW = Math.min(30, band * 0.62);
  const y = (v) => padT + plotH - (plotH * v) / 100;
  const tip = hover != null ? rhythm[hover - 1] : null;
  const hx = hover != null ? padL + band * SEASON_ORDER.indexOf(hover) + band / 2 : 0;
  return (
    <div className="hc-chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fan heat by month, October to September: ${SEASON_ORDER.map((m) => `${MONTHS[m - 1]} ${rhythm[m - 1].intensity}${peaks.has(m) ? " peak" : quiet.has(m) ? " quiet" : ""}`).join(", ")}`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--border)" />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{g}</text>
          </g>
        ))}
        {SEASON_ORDER.map((m, i) => {
          const v = rhythm[m - 1].intensity, x = padL + band * i + (band - barW) / 2;
          const fill = peaks.has(m) ? "var(--accent)" : quiet.has(m) ? "var(--seq-2)" : hover === m ? "var(--seq-6)" : "var(--seq-4)";
          return (
            <g key={m}>
              <path d={colPath(x, y(v), barW, padT + plotH - y(v))} fill={fill} />
              {peaks.has(m) && <path d={`M${x + barW / 2},${y(v) - 6} l-5,-9 h10 z`} fill="var(--pop)" stroke="var(--text)" strokeWidth="1" />}
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="11" fontWeight={peaks.has(m) || m === now ? 700 : 500} fill={peaks.has(m) || m === now ? "var(--text)" : "var(--text-muted)"}>{band < 34 ? MONTHS[m - 1][0] : MONTHS[m - 1]}</text>
              <rect x={padL + band * i} y={0} width={band} height={H} fill="transparent" tabIndex={0} role="button" style={{ cursor: "pointer" }}
                aria-label={`${MONTHS_LONG[m - 1]}: fan heat ${v}${peaks.has(m) ? ", a peak" : quiet.has(m) ? ", a quiet month" : ""}. Open the month.`}
                onClick={() => onSelect && onSelect(m)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect && onSelect(m); } }}
                onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(m)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hc-tooltip" style={{ left: Math.max(130, Math.min(W - 130, hx)), top: Math.max(70, y(tip.intensity)) }}>
          <div><strong>{tip.intensity}</strong> <span className="hc-muted">of this team's peak · {MONTHS_LONG[hover - 1]}</span></div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{tip.phase}</div>
          {(moments[hover] || []).slice(0, 3).map((t, k) => <div key={k} style={{ marginTop: 4 }}>● {t}</div>)}
        </div>
      )}
      <div className="hc-legend" style={{ marginTop: 6 }}>
        <span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--accent)" /></svg> Peak</span>
        <span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--seq-4)" /></svg> Steady</span>
        <span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--seq-2)" /></svg> Quiet: focus elsewhere</span>
        <span>Heat is a share of this team's own peak month (100), an editorial estimate.</span>
      </div>
    </div>
  );
}
