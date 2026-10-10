// Reusable market-page parts: a generic dossier renderer (any lens agent's
// output renders the same way) and the jersey palette study.
import React from "react";
import { AGENT_BY_ID } from "../agents/roster.js";
import { DEPENDENCIES } from "../agents/review-schema.js";
import { MONTHS } from "../data.js";
import { fmtDate } from "../review.js";
import { Chip, Confidence, Provenance, Priority, Status, Strength, Route, KV, href } from "../ui.jsx";

// fold: show the headline, summary and insights, and put the rest of the
// dossier (cues, places, people, dates, words, product hooks) behind a disclosure.
export function LensView({ dossier: d, compact = false, fold = false }) {
  if (!d) return null;
  const agent = AGENT_BY_ID[d.lens];
  const Rest = fold ? FoldRest : React.Fragment;
  return (
    <div className="hc-stack" style={{ display: "grid", gap: "var(--grid-gap)" }}>
      {!compact && (
        <div className="hc-card-invert hc-stack">
          <div className="hc-row" style={{ justifyContent: "space-between" }}>
            <span className="hc-eyebrow">{agent ? `From the ${agent.name} agent` : d.lens}</span>
            <span className="hc-row"><Provenance of={d} /><Confidence level={d.confidence} /></span>
          </div>
          <h3 className="hc-h2" style={{ textTransform: "none", fontFamily: "var(--font-sans)", fontWeight: 700, letterSpacing: "-0.01em", fontSize: "var(--step-h2)", lineHeight: 1.15 }}>{d.headline}</h3>
          <p className="hc-muted">{d.summary}</p>
        </div>
      )}

      <div className={compact ? "hc-card hc-stack" : "hc-grid hc-grid-2"}>
        {compact && <div className="hc-row" style={{ justifyContent: "space-between" }}><span className="hc-eyebrow">{agent ? `From the ${agent.name} agent` : d.lens}</span><span className="hc-row"><Provenance of={d} /><Confidence level={d.confidence} /></span></div>}
        {d.insights.map((x, i) => (
          compact
            ? <div key={i}><b>{x.title}</b><p className="hc-small" style={{ marginTop: 2 }}>{x.detail}</p><p className="hc-small hc-implication" style={{ marginTop: 6 }}>{x.implication}</p></div>
            : <article key={i} className="hc-card hc-stack"><h4 className="hc-h3">{x.title}</h4><p>{x.detail}</p><p className="hc-implication">{x.implication}</p></article>
        ))}
      </div>

      <Rest>
      {!compact && (
        <div className="hc-card">
          <div className="hc-kv-label">What to borrow</div>
          <div className="hc-grid hc-grid-2" style={{ marginTop: 10 }}>
            {d.designCues.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {c.type === "color" && c.hex ? <span className="hc-dot" style={{ background: c.hex, width: 28, height: 28, borderRadius: 8, marginTop: 2 }} title={c.hex} /> : <Chip tone="ink">{c.type}</Chip>}
                <div>
                  <b>{c.cue}</b>{c.hex ? <span className="hc-muted hc-small"> · {c.hex}</span> : null}
                  <div className="hc-small hc-muted">Source: {c.source}</div>
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
            <div className="hc-card"><div className="hc-kv-label">People, crews and brands</div>
              <ul className="hc-list">{d.people.map((p, i) => <li key={i}><b>{p.name}</b> <span className="hc-small hc-muted">· {p.role}</span><div className="hc-small" style={{ marginTop: 2 }}>{p.why}</div></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!compact && (d.moments.length > 0 || d.vocabulary.length > 0) && (
        <div className="hc-grid hc-grid-2">
          {d.moments.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">Dates</div>
              <ul className="hc-list">{[...d.moments].sort((a, b) => (a.month || 13) - (b.month || 13)).map((m, i) => <li key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10 }}><b>{m.month ? MONTHS[m.month - 1] : "Year-round"}</b><span><b>{m.name}</b> <span className="hc-small hc-muted">· {m.timing}</span><div className="hc-small">{m.why}</div></span></li>)}</ul>
            </div>
          )}
          {d.vocabulary.length > 0 && (
            <div className="hc-card"><div className="hc-kv-label">Local words</div>
              <ul className="hc-list">{d.vocabulary.map((v, i) => <li key={i}><b>“{v.term}”</b><div className="hc-small hc-muted">{v.meaning}</div></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div className="hc-grid hc-grid-2">
          <div className="hc-card" style={{ background: "var(--pop)", color: "var(--pop-ink)" }}>
            <div className="hc-kv-label" style={{ color: "var(--pop-ink)", opacity: 0.7 }}>What to make · product hypotheses</div>
            <ul className="hc-bullets" style={{ fontWeight: 600 }}>{d.productHooks.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
          {(d.watchouts.length > 0 || (d.provenance && d.provenance.verify.length > 0)) && (
            <div className="hc-card hc-stack">
              {d.watchouts.length > 0 && <div><div className="hc-kv-label">Watch out for</div><ul className="hc-bullets">{d.watchouts.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
              {d.provenance && d.provenance.verify.length > 0 && <div><div className="hc-kv-label">Check before you act</div><ul className="hc-bullets hc-small">{d.provenance.verify.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
            </div>
          )}
        </div>
      )}
      </Rest>
    </div>
  );
}

function FoldRest({ children }) {
  return (
    <details className="hc-fold" style={{ marginTop: 0 }}>
      <summary>The full dossier: what to borrow, places, people, dates, words and product hooks</summary>
      <div style={{ display: "grid", gap: "var(--grid-gap)" }}>{children}</div>
    </details>
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
    <svg className="hc-jersey" viewBox="0 0 200 250" role="img" aria-label={`Palette study on a jersey: base ${base}, trim ${trim}, accent ${accent}`}>
      <path d="M62 10 L82 10 Q100 44 118 10 L138 10 L141 40 Q150 72 173 80 L173 236 Q100 246 27 236 L27 80 Q50 72 59 40 Z" fill={base} />
      <path d="M27 96 L27 236 Q31 236.6 36 237.2 L36 96 Z M173 96 L173 236 Q169 236.6 164 237.2 L164 96 Z" fill={accent} />
      <path d="M82 10 Q100 44 118 10" fill="none" stroke={trim} strokeWidth="6" strokeLinecap="round" />
      <path d="M141 40 Q150 72 173 80 M59 40 Q50 72 27 80" fill="none" stroke={trim} strokeWidth="6" strokeLinecap="round" />
      <text x="100" y="92" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize={wordmark.length > 8 ? 17 : 22} fill={trim} letterSpacing="0.5">{wordmark}</text>
      <text x="100" y="168" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize="74" fill={accent} stroke={trim} strokeWidth="1.5">00</text>
    </svg>
  );
}

// ── Opportunity card with the hand-off fields ──────────────────────
export function Opportunity({ o, insights, market, compare }) {
  const h = o.handoff;
  return (
    <article className="hc-card hc-opp" id={market ? undefined : `opp-${o.id}`}>
      {market && <a href={href("m", market.id)} className="hc-row" style={{ textDecoration: "none", fontWeight: 700 }}><span className="hc-dot" style={{ background: market.team.colors[0] }} />{market.team.place || market.team.city} {market.team.name}</a>}
      <div className="hc-row" style={{ justifyContent: "space-between" }}>
        <div className="hc-row"><Priority p={o.priority} /><Status status={h ? h.status : "hypothesis"} /><Strength support={o.support} /></div>
        <span className="hc-row" style={{ gap: 6 }}>
          <Chip tone="line" title="The brief's editorial estimate of size, separate from evidence strength">{o.size} upside (estimate)</Chip>
          {compare && <button className="hc-pill-btn" aria-pressed={compare.on} disabled={!compare.on && compare.full} title={!compare.on && compare.full ? "Compare holds three ideas. Remove one first." : undefined} onClick={compare.toggle}>{compare.on ? "✓ Comparing" : "+ Compare"}</button>}
        </span>
      </div>
      <h3 className="hc-h2" style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.8rem)" }}>{o.title}</h3>
      <p>{o.summary}</p>
      {h ? (
        <div className="hc-opp-grid">
          <KV label="For"><span className="hc-small">{h.consumer}</span><div className="hc-tiny hc-muted" style={{ marginTop: 4 }}>Sizing and fit: {h.fit.join(", ")}</div></KV>
          <KV label="Target and route"><span className="hc-small"><b>{h.targetSeason}</b> · first in market {fmtDate(h.firstInMarket)}</span><div className="hc-row" style={{ marginTop: 6 }}>{h.routes.map((r) => <Route key={r} route={r} />)}</div></KV>
          <KV label="First step"><span className="hc-actby">Act by {fmtDate(h.actBy)}</span><div className="hc-small hc-muted" style={{ marginTop: 4 }}>{h.actNote}</div></KV>
          <KV label="Proposed owner"><span className="hc-small">{h.owner}</span><div className="hc-tiny hc-muted" style={{ marginTop: 4 }}>A suggestion. No one is assigned.</div></KV>
        </div>
      ) : <p className="hc-small hc-muted">Hand-off fields not reviewed for this idea yet.</p>}
      <details className="hc-more">
        <summary>Validation, dependencies, where, when and how</summary>
        <div className="hc-stack">
          {h && <KV label="Test before briefing"><ul className="hc-bullets hc-small">{h.validation.map((v, i) => <li key={i}>{v}</li>)}</ul></KV>}
          {h && h.dependencies.length > 0 && <KV label="Depends on (none confirmed)"><div className="hc-row">{h.dependencies.map((x) => <Chip key={x} tone="warn">{DEPENDENCIES[x]}</Chip>)}</div></KV>}
          {h && h.insights.length > 0 && insights && <KV label="Built on"><ul className="hc-bullets hc-small">{h.insights.map((k) => insights[k] && <li key={k}>{insights[k].title}</li>)}</ul></KV>}
          {h && h.insights.length > 0 && !insights && <KV label="Built on"><span className="hc-small">{h.insights.length} of the market's top insights · <a href={href("m", market.id)}>read them</a></span></KV>}
          {h && h.partners.length > 0 && <KV label="Prospective partners (no agreements)"><div className="hc-row">{h.partners.map((p) => <Chip key={p} tone="line">{p}</Chip>)}</div></KV>}
          <KV label="Where"><ul className="hc-bullets hc-small">{o.where.map((w, i) => <li key={i}>{w}</li>)}</ul></KV>
          <KV label="When"><p className="hc-small">{o.when}</p></KV>
          <KV label="How"><p className="hc-small">{o.how}</p></KV>
          <KV label="Products"><div className="hc-row">{o.products.map((p, i) => <Chip key={i}>{p}</Chip>)}</div>{h && <div className="hc-tiny hc-muted" style={{ marginTop: 6 }}>Categories: {h.categories.join(", ")}</div>}</KV>
          <div className="hc-small hc-muted"><b style={{ color: "var(--text)" }}>How we'd know it worked:</b> {o.kpi}</div>
        </div>
      </details>
    </article>
  );
}
