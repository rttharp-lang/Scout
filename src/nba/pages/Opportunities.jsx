// Every opportunity across all published markets. Two views: a shortlist of
// the best-supported ideas per planning window, and the full board with
// filters for season, decision date, route, evidence, owner and product.
// Every idea is a hypothesis; nothing here is approved.
import React, { useMemo, useState } from "react";
import { markets, today, ymLabel, nextYM } from "../data.js";
import { OWNERS, STATUSES, SEASONS } from "../agents/review-schema.js";
import { STRENGTH, STRENGTH_RANK, ROUTE_LABEL, ymOf } from "../review.js";
import { SectionHead, href } from "../ui.jsx";
import { Opportunity } from "./parts.jsx";

// Product families matched against the free-text product names agents wrote.
const FAMILIES = [
  ["all", "All products", null],
  ["jersey", "Jerseys & uniforms", /jersey|uniform|city edition|swingman|authentic|warm-?up|shooting shirt/i],
  ["tee", "Tees & tops", /\btee|t-shirt|shirt|top|tank|long ?sleeve|crew\b/i],
  ["fleece", "Fleece & hoodies", /hoodie|fleece|crewneck|sweat|pullover|quarter-zip/i],
  ["outerwear", "Outerwear", /jacket|coat|parka|outerwear|shell|anorak|windbreaker|vest|puffer/i],
  ["bottoms", "Shorts & pants", /shorts|pants|jogger|trouser|bottoms/i],
  ["headwear", "Headwear", /hat|cap|beanie|headband|headwear|bucket|toque/i],
  ["footwear", "Footwear", /shoe|sneaker|footwear|\bpe\b|colorway|slide|sock/i],
  ["kids", "Kids & family", /kid|youth|toddler|infant|family|baby/i],
];
const SIZE_RANK = { high: 0, medium: 1, low: 2 };
// Best-supported first, then the brief's priority, then its size estimate.
const credible = (a, b) => STRENGTH_RANK[a.support.strength] - STRENGTH_RANK[b.support.strength] || a.priority - b.priority || SIZE_RANK[a.size] - SIZE_RANK[b.size] || a.m.team.city.localeCompare(b.m.team.city);

export default function Opportunities() {
  const now = today();
  const [view, setView] = useState("shortlist");
  const [season, setSeason] = useState("all");
  const [due, setDue] = useState("all");
  const [route, setRoute] = useState("all");
  const [strength, setStrength] = useState("all");
  const [owner, setOwner] = useState("all");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState(0);
  const [size, setSize] = useState("all");
  const [conf, setConf] = useState("All");
  const [family, setFamily] = useState("all");
  const [q, setQ] = useState("");

  const all = useMemo(() => markets.filter((m) => m.status === "complete").flatMap((m) => m.opportunities.map((o) => ({ ...o, m }))), []);
  const dueMonths = useMemo(() => { const out = [now.ym]; while (out.length < 6) out.push(nextYM(out[out.length - 1])); return out; }, [now.ym]);
  const seasonOfOpp = (o) => (o.handoff ? o.handoff.targetSeason : "unreviewed");

  const rows = useMemo(() => {
    const fam = FAMILIES.find((f) => f[0] === family)[2];
    const ql = q.trim().toLowerCase();
    return all
      .filter((o) => (season === "all" || seasonOfOpp(o) === season)
        && (due === "all" || (o.handoff && ymOf(o.handoff.actBy) <= due))
        && (route === "all" || (o.handoff && o.handoff.routes.includes(route)))
        && (strength === "all" || o.support.strength === strength)
        && (owner === "all" || (o.handoff && o.handoff.owner === owner))
        && (status === "all" || (o.handoff ? o.handoff.status : "hypothesis") === status)
        && (!priority || o.priority === priority) && (size === "all" || o.size === size)
        && (conf === "All" || o.m.team.conference === conf) && (!fam || o.products.some((p) => fam.test(p)))
        && (!ql || `${o.title} ${o.summary} ${o.how} ${o.products.join(" ")} ${o.where.join(" ")} ${o.segment} ${o.handoff ? `${o.handoff.consumer} ${o.handoff.partners.join(" ")}` : ""} ${o.m.team.place || o.m.team.city} ${o.m.team.name}`.toLowerCase().includes(ql)))
      .sort(credible);
  }, [all, season, due, route, strength, owner, status, priority, size, conf, family, q]);

  const windows = SEASONS.filter((x) => all.some((o) => seasonOfOpp(o) === x));
  const reviewed = all.filter((o) => o.handoff).length;

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>Every idea, every market · all hypotheses</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Opportunity<br />board</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>{all.length} product and business ideas from {new Set(all.map((o) => o.m.id)).size} market briefs. Each shows who it's for, the season it targets, how it would get made, what it depends on and who might own it. None is approved: every one is a hypothesis until a named owner tests it.</p>
      {reviewed < all.length && <p className="hc-small hc-muted" style={{ marginTop: 10 }}>{all.length - reviewed} ideas don't have reviewed hand-off fields yet.</p>}

      <div className="hc-row" style={{ marginTop: 22 }} role="group" aria-label="View">
        <button className="hc-pill-btn" aria-pressed={view === "shortlist"} onClick={() => setView("shortlist")}>Shortlist by planning window</button>
        <button className="hc-pill-btn" aria-pressed={view === "board"} onClick={() => setView("board")}>Full board and filters</button>
      </div>

      {view === "shortlist" ? (
        <>
          <p className="hc-small hc-muted" style={{ marginTop: 14, maxWidth: "85ch" }}>For each target season, the six ideas with the most live-checked support, then the brief's priority, then its size estimate. Evidence strength is about support, not size. <a href={href("method", "evidence")}>How it's worked out</a>.</p>
          {windows.map((w) => {
            const pick = all.filter((o) => seasonOfOpp(o) === w).sort(credible).slice(0, 6);
            return (
              <section key={w} className="hc-section" style={{ marginTop: 40 }}>
                <SectionHead eyebrow={`${all.filter((o) => seasonOfOpp(o) === w).length} ideas target this season`} title={`Season ${w}`}>
                  <button className="hc-pill-btn" onClick={() => { setView("board"); setSeason(w); }}>See all for {w} →</button>
                </SectionHead>
                <div className="hc-grid hc-grid-2">{pick.map((o) => <Opportunity key={`${o.m.id}-${o.id}`} o={o} market={o.m} />)}</div>
              </section>
            );
          })}
          {!windows.length && <div className="hc-empty">No ideas have a reviewed target season yet. Use the full board.</div>}
        </>
      ) : (
        <>
          <div className="hc-row" style={{ marginTop: 18, gap: 10 }}>
            <input className="hc-input" placeholder="Search ideas, products, places, partners" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search opportunities" style={{ flex: "1 1 240px", maxWidth: 340 }} />
            <select className="hc-select" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Target season">
              <option value="all">Any target season</option>
              {SEASONS.map((x) => <option key={x} value={x}>Target {x}{x === now.season ? " (now)" : ""}</option>)}
            </select>
            <select className="hc-select" value={due} onChange={(e) => setDue(e.target.value)} aria-label="First decision due">
              <option value="all">Any decision date</option>
              {dueMonths.map((x) => <option key={x} value={x}>Decision due by {ymLabel(x)}</option>)}
            </select>
            <select className="hc-select" value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Route">
              <option value="all">Any route</option>
              {Object.entries(ROUTE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="hc-select" value={strength} onChange={(e) => setStrength(e.target.value)} aria-label="Evidence strength">
              <option value="all">Any evidence strength</option>
              {Object.entries(STRENGTH).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="hc-select" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Proposed owner">
              <option value="all">Any proposed owner</option>
              {OWNERS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="hc-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">Any status</option>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.split(":")[0]}</option>)}
            </select>
            <select className="hc-select" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Product family">
              {FAMILIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="hc-select" value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Conference">
              <option value="All">Both conferences</option><option value="East">Eastern</option><option value="West">Western</option>
            </select>
            <span className="hc-row" role="group" aria-label="Priority">
              {[0, 1, 2, 3].map((p) => <button key={p} className="hc-pill-btn" aria-pressed={priority === p} onClick={() => setPriority(p)}>{p ? `P${p}` : "All priorities"}</button>)}
            </span>
            <span className="hc-row" role="group" aria-label="Upside">
              {["all", "high", "medium", "low"].map((s) => <button key={s} className="hc-pill-btn" aria-pressed={size === s} onClick={() => setSize(s)}>{s === "all" ? "Any upside" : `${s[0].toUpperCase()}${s.slice(1)} upside`}</button>)}
            </span>
          </div>
          <p className="hc-small hc-muted" style={{ margin: "14px 0 18px" }} role="status">{rows.length} match{rows.length === 1 ? "" : "es"}, best-supported first</p>
          <div className="hc-grid hc-grid-2">
            {rows.map((o) => <Opportunity key={`${o.m.id}-${o.id}`} o={o} market={o.m} />)}
          </div>
          {!rows.length && <div className="hc-empty">Nothing matches these filters.</div>}
        </>
      )}
    </div>
  );
}
