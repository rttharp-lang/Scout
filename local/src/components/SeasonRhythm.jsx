import React, { useMemo, useState } from "react";
import { fmtDate } from "../lib/api.js";
import { Drawer, DateKind, Label, Empty } from "./ui.jsx";

const LANES = [["schedule", "Official schedule & league"], ["engagement", "Team engagement & programs"], ["fan_ritual", "Fan rituals & local moments"], ["attention", "Observed attention & response"], ["opportunity", "Product & storytelling opportunities"], ["gate", "Product gates & deadlines"]];
const day = 864e5;

export function SeasonRhythm({ team, moments, milestones, seasons, metrics, claims, tz }) {
  const [view, setView] = useState("month");
  const [seasonId, setSeasonId] = useState(() => (seasons.find((s) => s.kind === "competition" && s.ends_on >= new Date().toISOString().slice(0, 10)) || seasons[0])?.id);
  const [compareId, setCompareId] = useState("");
  const [filter, setFilter] = useState({ motivation: "", community: "", growth: "" });
  const [open, setOpen] = useState(null);
  const season = seasons.find((s) => s.id === seasonId); const compare = seasons.find((s) => s.id === compareId);
  const claimById = useMemo(() => Object.fromEntries((claims || []).map((c) => [c.id, c])), [claims]);
  const codesOf = (m) => (m.data.claim_ids || []).flatMap((id) => (claimById[id]?.codes || []).map((k) => k.node_id));
  const communitiesOf = (m) => [m.data.who, ...(m.data.claim_ids || []).map((id) => claimById[id]?.data?.community)].filter(Boolean).join(" ");
  const motivations = useMemo(() => [...new Set(moments.flatMap((m) => codesOf(m).filter((n) => n.startsWith("mot."))))], [moments, claims]);
  const growths = useMemo(() => [...new Set(moments.flatMap((m) => codesOf(m).filter((n) => n.startsWith("gro."))))], [moments, claims]);
  const items = useMemo(() => {
    const ms = moments.filter((m) => m.starts_at).map((m) => ({ ...m, at: Date.parse(m.starts_at) }));
    const gates = (milestones || []).map((g) => ({ id: g.id, title: g.label, starts_at: g.on, at: Date.parse(g.on), data: { lane: "gate", date_kind: "confirmed", recurrence: "product", uncertainty: "User-configured milestone", passed: g.passed } }));
    return [...ms, ...gates].filter((m) => { const codes = codesOf(m); return (!filter.motivation || codes.includes(filter.motivation)) && (!filter.growth || codes.includes(filter.growth)) && (!filter.community || communitiesOf(m).toLowerCase().includes(filter.community.toLowerCase())); });
  }, [moments, milestones, filter, claims]);
  if (!season) return <Empty>No season configured for this league.</Empty>;
  const start = Date.parse(season.starts_on), end = Date.parse(season.ends_on); const span = end - start;
  const pct = (t) => `${Math.max(0, Math.min(100, ((t - start) / span) * 100))}%`;
  const evPos = (t) => `${Math.max(7, Math.min(93, ((t - start) / span) * 100))}%`;
  const shift = compare ? Date.parse(season.starts_on) - Date.parse(compare.starts_on) : 0;
  const ticks = []; { const d = new Date(start); d.setDate(1); while (d.getTime() < end) { ticks.push(new Date(d)); if (view === "week") d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); } }
  const today = Date.now();
  const spikeItems = (metrics || []).flatMap((s) => s.points.filter((p) => p.spike).map((p) => ({ id: `${s.platform}-${p.at}`, title: `${s.platform} ${s.metric}: ${p.value} (baseline median ${p.baseline.median}, ${p.baseline.samples} samples)`, at: Date.parse(p.at), spike: true, data: { lane: "attention", date_kind: "confirmed", metric: s } })));
  const laneItems = (lane) => [...items.filter((m) => (m.data.lane || "fan_ritual") === lane), ...(lane === "attention" ? spikeItems : [])].filter((m) => m.at >= start - 7 * day && m.at <= end + 7 * day);
  const missingCoverage = (lane) => lane === "attention" && !(metrics || []).length && !items.some((m) => m.data.lane === "attention");
  return (
    <div className="rhythm">
      <div className="toolbar">
        <select className="input" style={{ width: "auto" }} value={seasonId} onChange={(e) => setSeasonId(e.target.value)} aria-label="Season">{seasons.map((s) => <option key={s.id} value={s.id}>{s.kind === "product" ? "Product · " : ""}{s.label}{s.kind === "competition" ? ` (${s.starts_on} → ${s.ends_on})` : ""}</option>)}</select>
        <select className="input" style={{ width: "auto" }} value={compareId} onChange={(e) => setCompareId(e.target.value)} aria-label="Compare with"><option value="">Compare: none</option>{seasons.filter((s) => s.id !== seasonId && s.kind === "competition").map((s) => <option key={s.id} value={s.id}>vs {s.label}</option>)}</select>
        <div className="row" role="group" aria-label="View">{["week", "month"].map((v) => <button key={v} className={`btn sm ${view === v ? "" : "ghost"}`} onClick={() => setView(v)}>{v}</button>)}</div>
        <select className="input" style={{ width: "auto" }} value={filter.motivation} onChange={(e) => setFilter({ ...filter, motivation: e.target.value })} aria-label="Filter by motivation"><option value="">All motivations</option>{motivations.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select className="input" style={{ width: "auto" }} value={filter.growth} onChange={(e) => setFilter({ ...filter, growth: e.target.value })} aria-label="Filter by growth outcome"><option value="">All growth outcomes</option>{growths.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <input className="input" style={{ width: 180 }} placeholder="Filter by community" value={filter.community} onChange={(e) => setFilter({ ...filter, community: e.target.value })} aria-label="Filter by community" />
        <span className="small">Team-local time: {tz}. Solid = confirmed · dashed = predicted · dotted = contingent · team-color border = recurring window.</span>
      </div>
      <div className="scroll">
        <div className="axis"><div /><div className="ticks">{ticks.map((t) => <div key={t.toISOString()} className="tick" style={{ left: pct(t.getTime()) }}>{view === "week" ? t.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : t.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</div>)}</div></div>
        <div className="lanes">
          {LANES.map(([lane, label]) => <React.Fragment key={lane}>
            <div className="lane-label">{label}</div>
            <div className="lane" style={{ minHeight: lane === "attention" ? 90 : 64 }}>
              {ticks.map((t) => <div key={t.toISOString()} className="gridline" style={{ left: pct(t.getTime()) }} />)}
              {today >= start && today <= end && <div className="today" style={{ left: pct(today) }} title="Today" />}
              {missingCoverage(lane) && <div className="missing">No observations collected for this lane — missing, not zero.</div>}
              {laneItems(lane).map((m) => <button key={m.id} className={`ev ${m.data.date_kind || "unknown"} ${m.spike ? "spike" : ""} ${m.data.passed || (m.data.lane === "gate" && m.at < today) ? "passed" : ""}`} style={{ left: evPos(m.at) }} onClick={() => setOpen(m)} title={`${m.title} · ${fmtDate(m.starts_at || new Date(m.at).toISOString())}`}><span className="dot" />{m.title.length > 42 ? m.title.slice(0, 40) + "…" : m.title}</button>)}
              {compare && lane !== "gate" && moments.filter((m) => m.starts_at && (m.data.lane || "fan_ritual") === lane).map((m) => { const at = Date.parse(m.starts_at); if (at < Date.parse(compare.starts_on) - 7 * day || at > Date.parse(compare.ends_on) + 7 * day) return null; return <div key={`cmp-${m.id}`} className="ev" style={{ left: evPos(at + shift), top: 40, opacity: 0.45, borderStyle: "dashed" }} title={`${compare.label}: ${m.title}`}>{compare.label}: {m.title.slice(0, 26)}</div>; })}
            </div>
          </React.Fragment>)}
        </div>
      </div>
      {(metrics || []).length > 0 && <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
        <div className="eyebrow">Observed attention (per platform, per metric; never summed)</div>
        {metrics.map((s) => <div key={`${s.platform}${s.metric}`} className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
          <div style={{ minWidth: 240 }}><b>{s.platform}</b> · {s.metric}<div className="small">{s.definition || "definition not recorded"} · n={s.sample_size} · collection: {s.collection_methods.join(", ") || "unknown"} · baseline: 28-day rolling median + 3·MAD, min 7 samples</div></div>
          <div className="spark" aria-label={`${s.platform} ${s.metric} series`}>{s.points.map((p) => { const max = Math.max(...s.points.map((x) => x.value || 0)) || 1; return <div key={p.at} className={`bar ${p.spike ? "spike" : ""} ${p.baseline ? "" : "nobase"}`} style={{ height: `${Math.max(3, (p.value / max) * 60)}px` }} title={`${fmtDate(p.at)}: ${p.value}${p.baseline ? ` (threshold ${Math.round(p.baseline.threshold)})` : ` (${p.reason})`}`} />; })}</div>
        </div>)}
        <p className="small">Spikes are flagged against a transparent rolling baseline per team and platform. A spike is attention, not affinity or significance; suggested reasons are hypotheses.</p>
      </div>}
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title}>
        {open && <div className="stack">
          <div className="row"><DateKind kind={open.data.date_kind} /><span className="chip state">{open.data.lane || "fan_ritual"}</span><span className="small">{fmtDate(open.starts_at || new Date(open.at).toISOString())}{open.ends_at ? ` → ${fmtDate(open.ends_at)}` : ""}</span></div>
          {open.data.metric ? <div><p>{open.title}</p><p className="small">Definition: {open.data.metric.definition}; collection methods: {open.data.metric.collection_methods.join(", ")}. Attention volume is shown separately from sentiment, cultural significance and product relevance.</p></div> :
            <dl className="kv">
              {[["What happens", open.data.trigger], ["Who participates", open.data.who], ["Why it matters locally", open.data.why_local], ["Recurrence", open.data.recurrence], ["Emotional / social function", open.data.emotional_function], ["Participation mode", open.data.participation_mode], ["Entry barriers", open.data.entry_barriers], ["Repeat engagement after", open.data.repeat_engagement], ["Observed response", open.data.observed_response || "none observed (not zero)"], ["Date confidence", `${open.data.date_kind}${open.data.uncertainty ? ` — ${open.data.uncertainty}` : ""}`], ["Product relevance", open.data.product_relevance]].filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
            </dl>}
          {open.data.claim_ids?.length > 0 && <div><div className="eyebrow">Supporting findings</div><ul>{open.data.claim_ids.map((id) => claimById[id] ? <li key={id}><Label kind={claimById[id].label} /> {claimById[id].headline}</li> : null)}</ul></div>}
          <p className="small">Hypothesis structure: trigger → community and circumstance → proposed motivation → participation mechanism → observed response → subsequent behavior. This is not proof of causality.</p>
        </div>}
      </Drawer>
    </div>
  );
}
