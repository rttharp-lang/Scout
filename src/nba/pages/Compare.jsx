// Side-by-side comparison of up to three markets: archetype, score tiers, the
// shape of each fan year (each scaled to its own peak), the best-supported
// insights and top opportunities, and the City Edition direction. The league
// read (themes, fan types, scores, top opportunities) follows underneath.
import React, { useEffect, useState } from "react";
import { markets, loadMarket, MONTHS, SEASON_ORDER } from "../data.js";
import { Chip, Scorecard, PaletteRow, Priority, TeamBand, href, Strength, Status, EvidenceTag } from "../ui.jsx";
import { STRENGTH_RANK } from "../review.js";
import { placeOf } from "../teams.js";
import League from "./League.jsx";

const MAX = 3;

export default function Compare({ ids, anchor }) {
  const published = markets.filter((m) => m.status === "complete");
  const initial = (ids || "").split(",").filter((id) => published.some((m) => m.id === id)).slice(0, MAX);
  const [sel, setSel] = useState(initial.length ? initial : published.slice(0, 2).map((m) => m.id));
  const [data, setData] = useState({});

  useEffect(() => {
    sel.forEach((id) => { if (!data[id]) loadMarket(id).then((m) => m && setData((d) => ({ ...d, [id]: m }))); });
    const want = `#/compare/${sel.join(",")}`;
    if (window.location.hash !== want) window.history.replaceState(null, "", want);
  }, [sel]);

  const setAt = (i, id) => setSel((s) => { const n = [...s]; n[i] = id; return n.filter((x, k) => x && n.indexOf(x) === k); });
  const remove = (i) => setSel((s) => s.filter((_, k) => k !== i));
  // Old #/league links land here; scroll again once the market cards above have loaded.
  useEffect(() => {
    if (!anchor) return;
    const go = () => document.getElementById(anchor)?.scrollIntoView();
    const t = [setTimeout(go, 50), setTimeout(go, 700)];
    return () => t.forEach(clearTimeout);
  }, [anchor]);
  const cols = sel.map((id) => ({ id, m: markets.find((x) => x.id === id), d: data[id] }));

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>Side by side</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Compare<br />markets</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>Up to three markets side by side, then the patterns, fan types and scores that run across all 30. Scores are editorial tiers ranked across all 30. Each fan-year chart is scaled to its own city's peak, so compare when a city peaks, not how big it is.</p>

      {published.length < 2 ? <div className="hc-empty">Compare needs at least two published markets.</div> : (
        <>
          <div className="hc-row" style={{ marginTop: 24, marginBottom: 20, gap: 10 }}>
            {sel.map((id, i) => (
              <span key={i} className="hc-row" style={{ gap: 4 }}>
                <select className="hc-select" value={id} onChange={(e) => setAt(i, e.target.value)} aria-label={`Market ${i + 1}`}>
                  {published.map((m) => <option key={m.id} value={m.id} disabled={m.id !== id && sel.includes(m.id)}>{placeOf(m.team)} {m.team.name}</option>)}
                </select>
                {sel.length > 1 && <button className="hc-pill-btn" onClick={() => remove(i)} aria-label={`Remove market ${i + 1}`}>×</button>}
              </span>
            ))}
            {sel.length < MAX && <button className="hc-pill-btn" onClick={() => setSel((s) => [...s, published.find((m) => !s.includes(m.id)).id])}>+ Add a market</button>}
          </div>

          <div className="hc-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 300px), 1fr))` }}>
            {cols.map(({ id, m, d }) => (
              <div key={id} className="hc-card" style={{ padding: 0, overflow: "hidden" }}>
                <TeamBand colors={m.team.colors} />
                <div style={{ padding: "18px 20px 22px" }} className="hc-stack">
                  <a href={href("m", id)} style={{ textDecoration: "none" }}><h2 className="hc-market-city">{placeOf(m.team)}</h2><div style={{ fontWeight: 700 }}>{m.team.name}</div></a>
                  <Chip tone="ink">{m.archetype.name}</Chip>
                  <p className="hc-small">{m.headline}</p>
                  <Scorecard scorecard={m.scorecard} />
                  <MiniRhythm rhythm={m.rhythm} />
                  {!d ? <p className="hc-muted hc-small">Loading…</p> : (
                    <>
                      <div><div className="hc-kv-label">Best-supported insights</div><ol className="hc-bullets hc-small">{d.strategy.topInsights.map((t, i) => ({ ...t, i })).sort((a, b) => STRENGTH_RANK[a.support.strength] - STRENGTH_RANK[b.support.strength] || a.i - b.i).slice(0, 3).map((t) => <li key={t.i}><b>{t.title}.</b> {t.insight} <Strength support={t.support} /></li>)}</ol></div>
                      <div><div className="hc-kv-label">Top opportunities · hypotheses</div><ul className="hc-list">{[...d.strategy.opportunities].sort((a, b) => a.priority - b.priority).slice(0, 4).map((o) => <li key={o.id} className="hc-small"><span className="hc-row"><Priority p={o.priority} /><b>{o.title}</b></span><div className="hc-muted" style={{ marginTop: 4 }}>{o.handoff ? `Target ${o.handoff.targetSeason} · ` : ""}{o.products.slice(0, 3).join(", ")}</div></li>)}</ul></div>
                      <div><div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-kv-label">The City Edition idea</div><EvidenceTag kind="hypothesis" /></div><b>{d.strategy.uniform.concept}</b><p className="hc-small" style={{ margin: "4px 0 10px" }}>{d.strategy.uniform.narrative}</p><PaletteRow palette={d.strategy.uniform.palette} /></div>
                      <div><div className="hc-row" style={{ justifyContent: "space-between" }}><div className="hc-kv-label">The gameday look</div><EvidenceTag kind="unverified" /></div><p className="hc-small">{d.dossiers.fanbase.extra.gamedayLook}</p></div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <League />
    </div>
  );
}

// Twelve thin columns, season order. Each market is scaled to its own peak
// month (100), so compare the shape of the year, not the height of the bars.
function MiniRhythm({ rhythm }) {
  const W = 240, H = 64, band = W / 12, bw = Math.min(12, band * 0.6);
  return (
    <div>
      <div className="hc-kv-label">The fan year, Oct to Sep · scaled to this city's own peak</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`Fan heat by month, as a share of this city's own peak: ${SEASON_ORDER.map((m) => `${MONTHS[m - 1]} ${rhythm[m - 1].intensity}`).join(", ")}`}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" />
        {SEASON_ORDER.map((m, i) => {
          const v = rhythm[m - 1].intensity, h = (H - 4) * v / 100, x = band * i + (band - bw) / 2;
          return (
            <g key={m}>
              <rect x={x} y={H - h} width={bw} height={h} rx="2" fill="var(--accent)"><title>{`${MONTHS[m - 1]}: ${v} · ${rhythm[m - 1].phase}`}</title></rect>
              <text x={x + bw / 2} y={H + 11} textAnchor="middle" fontSize="8" fill="var(--text-muted)">{MONTHS[m - 1][0]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
