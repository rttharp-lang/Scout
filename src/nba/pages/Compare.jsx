// Side-by-side comparison of up to three markets: archetype, scores, fan
// rhythm (small multiples on one shared 0–100 scale), top insights and
// opportunities, and the City Edition direction.
import React, { useEffect, useState } from "react";
import { markets, loadMarket, MONTHS, SEASON_ORDER } from "../data.js";
import { Chip, Scorecard, PaletteRow, Priority, TeamBand, href } from "../ui.jsx";

const MAX = 3;

export default function Compare({ ids }) {
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
  const cols = sel.map((id) => ({ id, m: markets.find((x) => x.id === id), d: data[id] }));

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>Side by side</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Compare<br />markets</h1>

      {published.length < 2 ? <div className="hc-empty">Compare needs at least two published markets.</div> : (
        <>
          <div className="hc-row" style={{ marginTop: 24, marginBottom: 20, gap: 10 }}>
            {sel.map((id, i) => (
              <span key={i} className="hc-row" style={{ gap: 4 }}>
                <select className="hc-select" value={id} onChange={(e) => setAt(i, e.target.value)} aria-label={`Market ${i + 1}`}>
                  {published.map((m) => <option key={m.id} value={m.id} disabled={m.id !== id && sel.includes(m.id)}>{m.team.city} {m.team.name}</option>)}
                </select>
                {sel.length > 1 && <button className="hc-pill-btn" onClick={() => remove(i)} aria-label={`Remove ${id}`}>×</button>}
              </span>
            ))}
            {sel.length < MAX && <button className="hc-pill-btn" onClick={() => setSel((s) => [...s, published.find((m) => !s.includes(m.id)).id])}>+ Add market</button>}
          </div>

          <div className="hc-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 300px), 1fr))` }}>
            {cols.map(({ id, m, d }) => (
              <div key={id} className="hc-card" style={{ padding: 0, overflow: "hidden" }}>
                <TeamBand colors={m.team.colors} />
                <div style={{ padding: "18px 20px 22px" }} className="hc-stack">
                  <a href={href("m", id)} style={{ textDecoration: "none" }}><h2 className="hc-market-city">{m.team.city}</h2><div style={{ fontWeight: 700 }}>{m.team.name}</div></a>
                  <Chip tone="ink">{m.archetype.name}</Chip>
                  <p className="hc-small">{m.headline}</p>
                  <Scorecard scorecard={m.scorecard} />
                  <MiniRhythm rhythm={m.rhythm} />
                  {!d ? <p className="hc-muted hc-small">Loading…</p> : (
                    <>
                      <div><div className="hc-kv-label">Top insights</div><ol className="hc-bullets hc-small">{d.strategy.topInsights.slice(0, 3).map((t, i) => <li key={i}><b>{t.title}.</b> {t.insight}</li>)}</ol></div>
                      <div><div className="hc-kv-label">Opportunities</div><ul className="hc-list">{[...d.strategy.opportunities].sort((a, b) => a.priority - b.priority).slice(0, 4).map((o) => <li key={o.id} className="hc-small"><span className="hc-row"><Priority p={o.priority} /><b>{o.title}</b></span><div className="hc-muted" style={{ marginTop: 4 }}>{o.when} · {o.products.slice(0, 3).join(", ")}</div></li>)}</ul></div>
                      <div><div className="hc-kv-label">City Edition direction</div><b>{d.strategy.uniform.concept}</b><p className="hc-small" style={{ margin: "4px 0 10px" }}>{d.strategy.uniform.narrative}</p><PaletteRow palette={d.strategy.uniform.palette} /></div>
                      <div><div className="hc-kv-label">Gameday look</div><p className="hc-small">{d.dossiers.fanbase.extra.gamedayLook}</p></div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Twelve thin columns, season order, shared 0–100 scale so markets compare.
function MiniRhythm({ rhythm }) {
  const W = 240, H = 64, band = W / 12, bw = Math.min(12, band * 0.6);
  return (
    <div>
      <div className="hc-kv-label">Fan rhythm (Oct → Sep)</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`Fan engagement by month: ${SEASON_ORDER.map((m) => `${MONTHS[m - 1]} ${rhythm[m - 1].intensity}`).join(", ")}`}>
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
