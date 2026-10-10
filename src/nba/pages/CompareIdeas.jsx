// Compare ideas: up to three opportunities side by side, measured the same
// way, with a pick for whichever goal matters most for the next investment.
// Every number here is from the briefs (editorial estimates and desk
// research), so the pick ranks what the research says, not a sales forecast.
import React, { useState } from "react";
import { Chip, Priority, Status, Strength, Route, SectionHead, href } from "../ui.jsx";
import { DEPENDENCIES } from "../agents/review-schema.js";
import { STRENGTH_RANK, ROUTE_LABEL, tierOf, fmtDate } from "../review.js";
import { placeOf } from "../teams.js";

export const MAX_IDEAS = 3;
export const ideaKey = (o) => `${o.m.id}:${o.id}`;

const SIZE_RANK = { high: 0, medium: 1, low: 2 };
// How much has to be built before an idea can ship, easiest first.
const ROUTE_EASE = { "existing-inventory": 0, "quick-turn-graphics": 1, "no-product": 2, "new-development": 3, "future-uniform": 4 };
const easeOf = (o) => (o.handoff ? Math.min(...o.handoff.routes.map((r) => ROUTE_EASE[r] ?? 5)) : 9);
const cap = (x = "") => x.charAt(0).toUpperCase() + x.slice(1);

// Each measure: how to show it, and a sort key where lower is better.
const MEASURES = [
  { id: "upside", label: "Upside (estimate)", key: (o) => SIZE_RANK[o.size], show: (o) => `${cap(o.size)}` },
  { id: "evidence", label: "Evidence", key: (o) => STRENGTH_RANK[o.support.strength] * 100 - (o.support.verified || 0), show: (o) => <Strength support={o.support} /> },
  { id: "market", label: "Market opportunity", key: (o) => -(o.m.scorecard?.opportunity ?? 0), show: (o) => tierOf(o.m.scorecard?.opportunity).label },
  { id: "priority", label: "Priority in its brief", key: (o) => o.priority, show: (o) => <Priority p={o.priority} /> },
  { id: "speed", label: "First in market", key: (o) => (o.handoff ? o.handoff.firstInMarket : "9999"), show: (o) => (o.handoff ? fmtDate(o.handoff.firstInMarket) : "Not reviewed") },
  { id: "deps", label: "Dependencies to clear", key: (o) => (o.handoff ? o.handoff.dependencies.length : 99), show: (o) => (o.handoff ? String(o.handoff.dependencies.length || "None") : "Not reviewed") },
  { id: "ease", label: "How it gets made", key: easeOf, show: (o) => (o.handoff ? <span className="hc-row" style={{ gap: 4 }}>{o.handoff.routes.map((r) => <Route key={r} route={r} />)}</span> : "Not reviewed") },
];
const BY_ID = Object.fromEntries(MEASURES.map((x) => [x.id, x]));

// What to optimize for. Each goal ranks by its measures in order; "balanced"
// ranks by how many measures an idea leads on.
const GOALS = [
  ["balanced", "Best overall", "Leads on the most measures, then upside, then evidence.", null],
  ["upside", "Biggest result", "Largest upside estimate, then the strongest market, then evidence.", ["upside", "market", "evidence"]],
  ["evidence", "Safest bet", "Best-supported by checked facts, then upside.", ["evidence", "upside", "priority"]],
  ["speed", "Fastest to market", "Earliest first date in market, then fewest dependencies.", ["speed", "deps", "ease"]],
  ["ease", "Easiest to start", "Fewest dependencies and the lightest way to make it, then speed.", ["deps", "ease", "speed"]],
];

// Which ideas lead on a measure (ties share the lead; no lead if all tie).
const leadersOf = (ideas, m) => {
  const ks = ideas.map(m.key), best = Math.min(...ks);
  return ks.every((k) => k === best) ? new Set() : new Set(ideas.filter((o, i) => ks[i] === best).map(ideaKey));
};

function pick(ideas, goal) {
  const leads = Object.fromEntries(ideas.map((o) => [ideaKey(o), MEASURES.filter((m) => leadersOf(ideas, m).has(ideaKey(o))).length]));
  const order = GOALS.find((g) => g[0] === goal)[3] || ["upside", "evidence"];
  const cmp = (a, b) => (goal === "balanced" ? leads[ideaKey(b)] - leads[ideaKey(a)] : 0) || order.reduce((d, id) => d || BY_ID[id].key(a) - BY_ID[id].key(b) || String(BY_ID[id].key(a)).localeCompare(String(BY_ID[id].key(b))), 0);
  return { ranked: [...ideas].sort(cmp), leads };
}

export default function CompareIdeas({ all, sel, setSel }) {
  const [goal, setGoal] = useState("balanced");
  const ideas = sel.map((k) => all.find((o) => ideaKey(o) === k)).filter(Boolean);
  const byMarket = [...new Set(all.map((o) => o.m.id))].map((id) => all.filter((o) => o.m.id === id)).sort((a, b) => placeOf(a[0].m.team).localeCompare(placeOf(b[0].m.team)));
  const setAt = (i, k) => setSel((s) => { const n = [...s]; n[i] = k; return n.filter((x, j) => x && n.indexOf(x) === j); });
  const g = GOALS.find((x) => x[0] === goal);
  const { ranked, leads } = ideas.length >= 2 ? pick(ideas, goal) : { ranked: ideas, leads: {} };
  const top = ranked[0];
  const leaders = Object.fromEntries(MEASURES.map((m) => [m.id, ideas.length >= 2 ? leadersOf(ideas, m) : new Set()]));

  const Picker = ({ value, i }) => (
    <select className="hc-select" value={value} onChange={(e) => setAt(i, e.target.value)} aria-label={`Idea ${i + 1}`}>
      {i >= sel.length && <option value="">Choose an idea…</option>}
      {byMarket.map((list) => (
        <optgroup key={list[0].m.id} label={`${placeOf(list[0].m.team)} ${list[0].m.team.name}`}>
          {list.map((o) => <option key={ideaKey(o)} value={ideaKey(o)} disabled={ideaKey(o) !== value && sel.includes(ideaKey(o))}>{o.title}</option>)}
        </optgroup>
      ))}
    </select>
  );

  return (
    <section className="hc-section" id="compare-ideas">
      <SectionHead eyebrow="If we invest in one new idea" title="Compare ideas" />
      <p className="hc-lede" style={{ marginTop: -6, maxWidth: "75ch" }}>Put up to three ideas side by side, choose what matters most, and see which one comes out ahead. Add ideas from the board above with “Compare”, or pick them here.</p>

      <div className="hc-row" style={{ marginTop: 18, gap: 10 }}>
        {sel.map((k, i) => (
          <span key={k} className="hc-compare-pick">
            <Picker value={k} i={i} />
            <button className="hc-pill-btn" onClick={() => setSel((s) => s.filter((x) => x !== k))} aria-label={`Remove idea ${i + 1}`}>×</button>
          </span>
        ))}
        {sel.length < MAX_IDEAS && <span className="hc-compare-pick"><Picker value="" i={sel.length} /></span>}
      </div>

      {ideas.length < 2 ? (
        <div className="hc-empty" style={{ marginTop: 18 }}>Add {ideas.length ? "one more idea" : "two or three ideas"} to compare.</div>
      ) : (
        <>
          <div className="hc-row" role="group" aria-label="What matters most" style={{ marginTop: 22, gap: 6 }}>
            <span className="hc-kv-label" style={{ marginRight: 6 }}>What matters most</span>
            {GOALS.map(([id, label]) => <button key={id} className="hc-pill-btn" aria-pressed={goal === id} onClick={() => setGoal(id)}>{label}</button>)}
          </div>

          <div className="hc-card-invert hc-stack" style={{ marginTop: 16 }} aria-live="polite">
            <div className="hc-eyebrow" style={{ color: "var(--text-muted-invert)" }}>{g[1]} · the pick</div>
            <h3 className="hc-h2" style={{ fontSize: "clamp(1.4rem, 2.6vw, 2rem)" }}>{top.title}</h3>
            <p className="hc-small">{placeOf(top.m.team)} {top.m.team.name} · leads on {leads[ideaKey(top)]} of {MEASURES.length} measures. {g[2]}</p>
            <p className="hc-tiny" style={{ opacity: 0.75 }}>Upside, priority and market scores are editorial estimates from desk research, so this ranks what the briefs say, not a forecast of sales. Test it before anyone commits.</p>
          </div>

          <div className="hc-grid" style={{ marginTop: 16, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))` }}>
            {ranked.map((o, rank) => (
              <article key={ideaKey(o)} className="hc-card hc-stack" style={rank === 0 ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : undefined}>
                <div className="hc-row" style={{ justifyContent: "space-between" }}>
                  <a href={href("m", o.m.id)} className="hc-row" style={{ textDecoration: "none", fontWeight: 700 }}><span className="hc-dot" style={{ background: o.m.team.colors[0] }} />{placeOf(o.m.team)} {o.m.team.name}</a>
                  <Chip tone={rank === 0 ? "pop" : "line"}>{rank === 0 ? "The pick" : `#${rank + 1}`}</Chip>
                </div>
                <h4 className="hc-h3">{o.title}</h4>
                <p className="hc-small">{o.summary}</p>
                <dl className="hc-compare-rows">
                  {MEASURES.map((m) => (
                    <div key={m.id} className={leaders[m.id].has(ideaKey(o)) ? "is-lead" : ""}>
                      <dt>{m.label}</dt>
                      <dd>{m.show(o)}{leaders[m.id].has(ideaKey(o)) && <span className="hc-lead-mark">Leads</span>}</dd>
                    </div>
                  ))}
                </dl>
                {o.handoff && (
                  <div className="hc-stack" style={{ gap: 8 }}>
                    <div><div className="hc-kv-label">For</div><span className="hc-small">{o.handoff.consumer}</span></div>
                    <div><div className="hc-kv-label">First step · act by {fmtDate(o.handoff.actBy)}</div><span className="hc-small">{o.handoff.actNote}</span></div>
                    {o.handoff.dependencies.length > 0 && <div><div className="hc-kv-label">Depends on</div><div className="hc-row" style={{ gap: 4 }}>{o.handoff.dependencies.map((x) => <Chip key={x} tone="warn">{DEPENDENCIES[x]}</Chip>)}</div></div>}
                    <div className="hc-row" style={{ gap: 6 }}><Status status={o.handoff.status} /><span className="hc-tiny hc-muted">Proposed owner: {o.handoff.owner}</span></div>
                  </div>
                )}
                <div><div className="hc-kv-label">How we'd know it worked</div><span className="hc-small">{o.kpi}</span></div>
              </article>
            ))}
          </div>
          <p className="hc-tiny hc-muted" style={{ marginTop: 10 }}>“Leads” marks the best of the ideas on that line; ties share it. Routes from easiest to hardest: {Object.keys(ROUTE_EASE).map((r) => ROUTE_LABEL[r].toLowerCase()).join(", ")}.</p>
        </>
      )}
    </section>
  );
}
