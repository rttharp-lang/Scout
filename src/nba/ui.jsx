// Shared NBA Fandom UI: brand lockup, header/footer, tiny hash router, and the
// small building blocks (chips, meters, swatches, month strips) every page uses.
import React, { useEffect, useState } from "react";
import { MONTHS, SEASON_ORDER, markets } from "./data.js";
import { SCORE_DEFS, tierOf, moodOf, STRENGTH, EVIDENCE_KIND, KIND_LABEL, CERTAINTY_LABEL, ROUTE_LABEL, fmtSpan, fmtDate } from "./review.js";
import { STATUSES } from "./agents/review-schema.js";

// ── Router ────────────────────────────────────────────────────────
// Hash routes so the site works on any static host: #/, #/m/por, #/opportunities, #/calendar, #/agents, #/league
export function useRoute() {
  const parse = () => (window.location.hash.replace(/^#\/?/, "") || "").split("?")[0].split("/").filter(Boolean);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
export const href = (...parts) => `#/${parts.filter(Boolean).join("/")}`;

// ── Brand ─────────────────────────────────────────────────────────
// Research lockup (wordmark + swoosh riding the cap line), then NBA FANDOM.
export function ResearchMark({ size = 22, color = "var(--accent)" }) {
  return (
    <span className="hc-mark" style={{ display: "inline-flex", alignItems: "flex-start", gap: "0.12em", fontSize: size }}>
      <span style={{ fontFamily: "var(--font-wordmark)", fontSize: "1em", fontWeight: 400, letterSpacing: "-0.01em", color, textTransform: "uppercase", lineHeight: 1 }}>Research</span>
      <svg viewBox="0 0 413.62 144.78" aria-hidden="true" style={{ display: "block", height: "0.68em", width: "auto", transform: "translateY(0.06em)" }}>
        <path fill={color} transform="translate(-49.19 -183.61)" d="M462.81,183.61,160.21,312.47Q122.57,328.39,97,328.39q-29,0-42-20.27-8.2-13-4.83-33.06T68,232.35Q80.1,214,107.61,184.09a105.53,105.53,0,0,0-13.51,31.85q-7.24,30.89,13,45.37,9.65,6.76,26.54,6.76a123.37,123.37,0,0,0,30.4-4.34Z" />
      </svg>
    </span>
  );
}

export function Header({ route }) {
  const section = route[0] || "";
  const link = (to, label, active) => <a href={to} aria-current={active ? "page" : undefined}>{label}</a>;
  return (
    <header className="hc-header">
      <a className="hc-brand" href={href()} aria-label="Research NBA Fandom Insights: home">
        <ResearchMark />
        <span className="hc-brand-divider" />
        <span className="hc-brand-name">NBA Fandom Insights</span>
      </a>
      <nav className="hc-nav" aria-label="Primary">
        {link(href(), "Markets", section === "" || section === "m")}
        {link(href("opportunities"), "Opportunities", section === "opportunities" || section === "compare")}
        {link(href("calendar"), "Calendar", section === "calendar")}
        {link(href("agents"), "Agents", section === "agents" || section === "method")}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="hc-footer">
      <span>NBA Fandom by Research · Built for Nike Basketball · <a href="/?app=scout">Scout trip planner ↗</a></span>
      <span>Updated {fmtDate(markets.map((m) => m.updated).filter(Boolean).sort().pop())} · <a href={href("method")}>How it was researched and checked</a></span>
    </footer>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────
export const Chip = ({ children, tone, title }) => <span className={`hc-chip${tone ? ` hc-chip-${tone}` : ""}`} title={title}>{children}</span>;

export function Meter({ label, value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="hc-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <span>{label}</span>
      <span className="hc-meter-track"><span className="hc-meter-fill" style={{ display: "block", width: `${v}%` }} /></span>
      <span className="hc-meter-value">{v}</span>
    </div>
  );
}

export const SCORE_LABELS = [["opportunity", "Opportunity"], ["fandom", "Fandom"], ["culture", "Culture"], ["retail", "Retail"]];

// Scores are editorial estimates, so they show as one of five broad tiers.
export function Tier({ label, value, title }) {
  const t = tierOf(value);
  return (
    <div className="hc-tier" title={title} aria-label={`${label}: ${t.label} (editorial estimate)`}>
      <span>{label}</span>
      <span className="hc-tier-pips" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= t.bars ? "on" : ""} />)}</span>
      <span className="hc-tier-label">{t.label}</span>
    </div>
  );
}
export function Scorecard({ scorecard, note = true }) {
  if (!scorecard) return null;
  return (
    <div>
      <div style={{ display: "grid", gap: 7 }}>{SCORE_LABELS.map(([k, l]) => <Tier key={k} label={l} value={scorecard[k]} title={`${SCORE_DEFS[k].what} ${SCORE_DEFS[k].kind}. ${SCORE_DEFS[k].baseline}`} />)}</div>
      {note && <div className="hc-tiny" style={{ marginTop: 8, opacity: 0.75 }}>Editorial estimates, ranked against all 30 markets. <a href={href("method", "scores")} style={{ color: "inherit" }}>What the tiers mean</a></div>}
    </div>
  );
}
export function Mood({ value }) {
  const m = moodOf(value);
  return <Chip tone="line" title={`${SCORE_DEFS.heat.what} ${SCORE_DEFS.heat.kind}. ${SCORE_DEFS.heat.baseline}`}>Fan mood: {m.label} · editorial read</Chip>;
}

// ── Evidence, timing and status labels ────────────────────────────
export function EvidenceTag({ kind }) {
  const k = EVIDENCE_KIND[kind];
  const tone = { fact: "pop", interpretation: "line", hypothesis: "ink", unverified: "warn" }[kind];
  return <Chip tone={tone} title={k.detail}>{k.label}</Chip>;
}
export function Strength({ support }) {
  if (!support) return null;
  const s = STRENGTH[support.strength];
  const extra = [support.verified ? `${support.verified} verified` : "", support.corrected ? `${support.corrected} corrected` : "", support.conflicting ? `${support.conflicting} conflicting` : ""].filter(Boolean).join(", ");
  const obs = support.observed ? ` ${support.observed} fan observation${support.observed > 1 ? "s" : ""} bear on it; see Evidence.` : "";
  return <Chip tone={support.strength === "sourced" ? "pop" : "line"} title={`Evidence strength. ${s.detail}${obs}`}>{s.label}{extra ? ` · ${extra}` : ""}</Chip>;
}
export function Certainty({ timing }) {
  if (!timing) return null;
  const tone = { confirmed: "pop", tentative: "line", unknown: "warn" }[timing.certainty];
  const why = timing.basis === "checked-live" ? "Checked against a live source" : timing.basis === "league-calendar" ? "On the verified league calendar" : timing.basis === "fixed-holiday" ? "Fixed by the calendar" : timing.reviewed === false ? "Year inferred from the brief's order; not reviewed" : "As written in the brief; not checked";
  return <Chip tone={tone} title={why}>{CERTAINTY_LABEL[timing.certainty]}</Chip>;
}
export function When({ timing, kind = true }) {
  if (!timing) return null;
  // "Every year" describes a recurring window, not a dated game in it.
  const yearly = timing.recurring && !(timing.kind === "event" && /^\d{4}-\d{2}-\d{2}$/.test(timing.start));
  return <span className="hc-when">{kind ? `${KIND_LABEL[timing.kind]} · ` : ""}{fmtSpan(timing)}{yearly ? " · recurs yearly" : ""}</span>;
}
export function ActBy({ timing }) {
  if (!timing || !timing.actBy) return null;
  return <span className="hc-actby" title={timing.actNote}>Act by {fmtDate(timing.actBy)}{timing.actNote ? `: ${timing.actNote}` : ""}</span>;
}
export const Route = ({ route }) => <Chip tone="line" title="How it would get made">{ROUTE_LABEL[route] || route}</Chip>;
export function Status({ status = "hypothesis" }) {
  return <Chip tone="ink" title={STATUSES[status]}>{STATUSES[status].split(":")[0]}</Chip>;
}
export function SourceLink({ s }) {
  if (!s || !s.url) return null;
  return <a href={s.url} target="_blank" rel="noreferrer">{s.title}{s.publisher ? ` (${s.publisher}${s.published ? `, ${fmtPublished(s.published)}` : ""})` : ""}</a>;
}
const fmtPublished = (p) => (/^\d{4}-\d{2}/.test(p) ? fmtDate(p) : p);

export function Swatch({ name, hex, sub }) {
  return (
    <span className="hc-swatch">
      <i style={{ background: hex }} />
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span className="hc-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{hex}{sub ? ` · ${sub}` : ""}</span>
    </span>
  );
}

export const PaletteRow = ({ palette }) => (
  <div className="hc-swatch-row">{(palette || []).map((p, i) => <Swatch key={i} name={p.name} hex={p.hex} sub={p.role} />)}</div>
);

// 12 cells in season order (Oct → Sep), the given months lit.
export function MonthStrip({ months }) {
  const on = new Set(months || []);
  return (
    <div className="hc-months" aria-label={`Runs in: ${SEASON_ORDER.filter((m) => on.has(m)).map((m) => MONTHS[m - 1]).join(", ") || "none"}`}>
      {SEASON_ORDER.map((m) => <span key={m} className={on.has(m) ? "on" : ""}>{MONTHS[m - 1][0]}</span>)}
    </div>
  );
}

export const Priority = ({ p }) => <span className="hc-priority" data-p={p}>P{p}</span>;

// Checked live vs written from agent knowledge (see agents/provenance.js).
export function Provenance({ of }) {
  const knowledge = of && of.provenance && of.provenance.mode === "knowledge";
  return knowledge
    ? <Chip tone="warn" title="Written from the agents' own knowledge, current to mid-2026. Unverified: check anything dated before you act on it.">Desk research, unverified</Chip>
    : <Chip tone="pop" title="Researched with live web search">Researched live</Chip>;
}

// The agent's self-rating. Shown for transparency; it is not evidence.
export function Confidence({ level }) {
  return <Chip tone="line" title="The research agent's own rating of its work. It is not evidence and doesn't affect evidence strength.">Agent's confidence: {level}</Chip>;
}

export function SectionHead({ id, eyebrow, title, children }) {
  return (
    <div className="hc-section-head" id={id}>
      <div>
        {eyebrow && <div className="hc-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h2 className="hc-h1">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export const KV = ({ label, children }) => (
  <div>
    <div className="hc-kv-label">{label}</div>
    <div>{children}</div>
  </div>
);

// Simple team color band (overview cards, compare).
export const TeamBand = ({ colors }) => (
  <div className="hc-market-band" aria-hidden="true">{colors.map((c, i) => <span key={i} style={{ background: c }} />)}</div>
);
