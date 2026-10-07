// Reusable market-page parts: a generic dossier renderer (any lens agent's
// output renders the same way) and the jersey palette study.
import React from "react";
import { AGENT_BY_ID } from "../agents/roster.js";
import { MONTHS } from "../data.js";
import { Chip, Confidence, KV } from "../ui.jsx";

export function LensView({ dossier: d, compact = false }) {
  if (!d) return null;
  const agent = AGENT_BY_ID[d.lens];
  return (
    <div className="hc-stack" style={{ display: "grid", gap: "var(--grid-gap)" }}>
      {!compact && (
        <div className="hc-card-invert hc-stack">
          <div className="hc-row" style={{ justifyContent: "space-between" }}>
            <span className="hc-eyebrow">{agent ? `${agent.name} agent` : d.lens}</span>
            <Confidence level={d.confidence} />
          </div>
          <h3 className="hc-h2" style={{ textTransform: "none", fontFamily: "var(--font-sans)", fontWeight: 700, letterSpacing: "-0.01em", fontSize: "var(--step-h2)", lineHeight: 1.15 }}>{d.headline}</h3>
          <p className="hc-muted">{d.summary}</p>
        </div>
      )}

      <div className={compact ? "hc-card hc-stack" : "hc-grid hc-grid-2"}>
        {compact && <div className="hc-row" style={{ justifyContent: "space-between" }}><span className="hc-eyebrow">{agent ? `${agent.name} agent` : d.lens} · insights</span><Confidence level={d.confidence} /></div>}
        {d.insights.map((x, i) => (
          compact
            ? <div key={i}><b>{x.title}</b><p className="hc-small" style={{ marginTop: 2 }}>{x.detail}</p><p className="hc-small hc-implication" style={{ marginTop: 6 }}>{x.implication}</p></div>
            : <article key={i} className="hc-card hc-stack"><h4 className="hc-h3">{x.title}</h4><p>{x.detail}</p><p className="hc-implication">{x.implication}</p></article>
        ))}
      </div>

      {!compact && (
        <div className="hc-card">
          <div className="hc-kv-label">Design cues</div>
          <div className="hc-grid hc-grid-2" style={{ marginTop: 10 }}>
            {d.designCues.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {c.type === "color" && c.hex ? <span className="hc-dot" style={{ background: c.hex, width: 28, height: 28, borderRadius: 8, marginTop: 2 }} title={c.hex} /> : <Chip tone="ink">{c.type}</Chip>}
                <div>
                  <b>{c.cue}</b>{c.hex ? <span className="hc-muted hc-small"> · {c.hex}</span> : null}
                  <div className="hc-small hc-muted">From: {c.source}</div>
                  <div className="hc-small" style={{ marginTop: 2 }}>{c.use}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(d.places.length > 0 || d.people.length > 0) && !compact && (
        <div className="hc-grid hc-grid-2">
          {d.places.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">Places</div>
              <ul className="hc-list">{d.places.map((p, i) => <li key={i}><div className="hc-row" style={{ justifyContent: "space-between" }}><b>{p.name}</b><Chip tone="line">{p.kind}</Chip></div><div className="hc-small hc-muted">{p.neighborhood}</div><div className="hc-small" style={{ marginTop: 2 }}>{p.why}</div></li>)}</ul>
            </div>
          )}
          {d.people.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">People, collectives & brands</div>
              <ul className="hc-list">{d.people.map((p, i) => <li key={i}><b>{p.name}</b> <span className="hc-small hc-muted">· {p.role}</span><div className="hc-small" style={{ marginTop: 2 }}>{p.why}</div></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!compact && (d.moments.length > 0 || d.vocabulary.length > 0) && (
        <div className="hc-grid hc-grid-2">
          {d.moments.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">Moments</div>
              <ul className="hc-list">{[...d.moments].sort((a, b) => (a.month || 13) - (b.month || 13)).map((m, i) => <li key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10 }}><b>{m.month ? MONTHS[m.month - 1] : "All yr"}</b><span><b>{m.name}</b> <span className="hc-small hc-muted">· {m.timing}</span><div className="hc-small">{m.why}</div></span></li>)}</ul>
            </div>
          )}
          {d.vocabulary.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">Speak like a local</div>
              <ul className="hc-list">{d.vocabulary.map((v, i) => <li key={i}><b>“{v.term}”</b><div className="hc-small hc-muted">{v.meaning}</div></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div className="hc-grid hc-grid-2">
          <div className="hc-card" style={{ background: "var(--pop)", color: "var(--pop-ink)" }}>
            <div className="hc-kv-label" style={{ color: "var(--pop-ink)", opacity: 0.7 }}>Product hooks</div>
            <ul className="hc-bullets" style={{ fontWeight: 600 }}>{d.productHooks.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
          {d.watchouts.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">Watch-outs</div><ul className="hc-bullets">{d.watchouts.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
          )}
        </div>
      )}
    </div>
  );
}

// A tank-top silhouette painted with the brief's palette: base body, trim on
// the neck and armholes, side panels and numbers in the accent. It's a palette
// study to make the colors legible together, not a uniform design.
export function Jersey({ palette, team }) {
  const pick = (re, fallback) => (palette.find((p) => re.test(p.role || "")) || palette[fallback] || palette[0]).hex;
  const base = pick(/base|body|primary/i, 0);
  const trim = pick(/trim|secondary/i, 1);
  const accent = pick(/accent|number|tertiary/i, Math.min(2, palette.length - 1));
  const wordmark = team.city.length > 9 ? team.abbr : team.city.toUpperCase();
  return (
    <svg className="hc-jersey" viewBox="0 0 200 250" role="img" aria-label={`Jersey palette study: base ${base}, trim ${trim}, accent ${accent}`}>
      <path d="M62 10 L82 10 Q100 44 118 10 L138 10 L141 40 Q150 72 173 80 L173 236 Q100 246 27 236 L27 80 Q50 72 59 40 Z" fill={base} />
      <path d="M27 96 L27 236 Q31 236.6 36 237.2 L36 96 Z M173 96 L173 236 Q169 236.6 164 237.2 L164 96 Z" fill={accent} />
      <path d="M82 10 Q100 44 118 10" fill="none" stroke={trim} strokeWidth="6" strokeLinecap="round" />
      <path d="M141 40 Q150 72 173 80 M59 40 Q50 72 27 80" fill="none" stroke={trim} strokeWidth="6" strokeLinecap="round" />
      <text x="100" y="92" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize={wordmark.length > 8 ? 17 : 22} fill={trim} letterSpacing="0.5">{wordmark}</text>
      <text x="100" y="168" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize="74" fill={accent} stroke={trim} strokeWidth="1.5">00</text>
    </svg>
  );
}
