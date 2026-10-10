// Every opportunity across all published markets on one board. Filter by
// month, priority, upside, conference and product to plan a
// league-wide line or a travel calendar.
import React, { useMemo, useState } from "react";
import { markets, currentMonth, MONTHS, MONTHS_LONG, SEASON_ORDER } from "../data.js";
import { Chip, Priority, MonthStrip, KV, href } from "../ui.jsx";

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

export default function Opportunities() {
  const [month, setMonth] = useState(0);
  const [priority, setPriority] = useState(0);
  const [size, setSize] = useState("all");
  const [conf, setConf] = useState("All");
  const [family, setFamily] = useState("all");
  const [q, setQ] = useState("");
  const now = currentMonth();

  const all = useMemo(() => markets.filter((m) => m.status === "complete").flatMap((m) => m.opportunities.map((o) => ({ ...o, m }))), []);
  const rows = useMemo(() => {
    const fam = FAMILIES.find((f) => f[0] === family)[2];
    const ql = q.trim().toLowerCase();
    return all
      .filter((o) => (!month || o.months.includes(month)) && (!priority || o.priority === priority) && (size === "all" || o.size === size)
        && (conf === "All" || o.m.team.conference === conf) && (!fam || o.products.some((p) => fam.test(p)))
        && (!ql || `${o.title} ${o.summary} ${o.how} ${o.products.join(" ")} ${o.where.join(" ")} ${o.segment} ${o.m.team.place || o.m.team.city} ${o.m.team.name}`.toLowerCase().includes(ql)))
      .sort((a, b) => a.priority - b.priority || ({ high: 0, medium: 1, low: 2 }[a.size] - { high: 0, medium: 1, low: 2 }[b.size]) || a.m.team.city.localeCompare(b.m.team.city));
  }, [all, month, priority, size, conf, family, q]);

  return (
    <div>
      <div className="hc-eyebrow" style={{ marginBottom: 12 }}>Every opportunity, every market</div>
      <h1 className="hc-display" style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}>Opportunity<br />board</h1>
      <p className="hc-lede" style={{ marginTop: 18 }}>All {all.length} opportunities from {new Set(all.map((o) => o.m.id)).size} market briefs, in one place. Filter by the month you're planning for, the product you own or the size of the bet.</p>

      <div className="hc-row" style={{ marginTop: 26, gap: 10 }}>
        <input className="hc-input" placeholder="Search opportunities, products, places" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search opportunities" style={{ flex: "1 1 240px", maxWidth: 340 }} />
        <select className="hc-select" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
          <option value={0}>Any month</option>
          {SEASON_ORDER.map((m) => <option key={m} value={m}>{MONTHS_LONG[m - 1]}{m === now ? " (now)" : ""}</option>)}
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
      <p className="hc-small hc-muted" style={{ margin: "14px 0 18px" }} role="status">{rows.length} match{rows.length === 1 ? "" : "es"}</p>

      <div className="hc-grid hc-grid-2">
        {rows.map((o) => (
          <article key={`${o.m.id}-${o.id}`} className="hc-card hc-opp">
            <div className="hc-row" style={{ justifyContent: "space-between" }}>
              <a href={href("m", o.m.id)} className="hc-row" style={{ textDecoration: "none", fontWeight: 700 }}><span className="hc-dot" style={{ background: o.m.team.colors[0] }} />{o.m.team.place || o.m.team.city} {o.m.team.name}</a>
              <span className="hc-row"><Priority p={o.priority} /><Chip tone="line">{o.size} upside</Chip></span>
            </div>
            <h3 className="hc-h2" style={{ fontSize: "clamp(1.3rem, 2vw, 1.7rem)" }}>{o.title}</h3>
            <p className="hc-small">{o.summary}</p>
            <div className="hc-opp-grid">
              <KV label="Where"><span className="hc-small">{o.where.join(" · ")}</span></KV>
              <KV label="When"><p className="hc-small" style={{ marginBottom: 6 }}>{o.when}</p><MonthStrip months={o.months} /></KV>
            </div>
            <KV label="How"><p className="hc-small">{o.how}</p></KV>
            <div className="hc-row">{o.products.map((p, i) => <Chip key={i}>{p}</Chip>)}</div>
            <div className="hc-tiny hc-muted">For {o.segment} · Runs {o.months.map((x) => MONTHS[x - 1]).join(", ")}</div>
          </article>
        ))}
      </div>
      {!rows.length && <div className="hc-empty">Nothing matches these filters.</div>}
    </div>
  );
}
