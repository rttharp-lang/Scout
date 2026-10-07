// Shared Home Court UI: brand lockup, header/footer, tiny hash router, and the
// small building blocks (chips, meters, swatches, month strips) every page uses.
import React, { useEffect, useState } from "react";
import { MONTHS, SEASON_ORDER } from "./data.js";

// ── Router ────────────────────────────────────────────────────────
// Hash routes so the site works on any static host: #/, #/m/por, #/opportunities, #/calendar, #/agents
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
// Same lockup as Scout (wordmark + swoosh riding the cap line), then HOME COURT.
export function ScoutMark({ size = 22, color = "var(--accent)" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: "0.12em", fontSize: size }}>
      <span style={{ fontFamily: "var(--font-wordmark)", fontSize: "1em", fontWeight: 400, letterSpacing: "-0.01em", color, textTransform: "uppercase", lineHeight: 1 }}>Scout</span>
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
      <a className="hc-brand" href={href()} aria-label="Home Court — all markets">
        <ScoutMark />
        <span className="hc-brand-divider" />
        <span className="hc-brand-name">Home Court</span>
      </a>
      <nav className="hc-nav" aria-label="Primary">
        {link(href(), "Markets", section === "" || section === "m")}
        {link(href("opportunities"), "Opportunities", section === "opportunities")}
        {link(href("calendar"), "Calendar", section === "calendar")}
        {link(href("agents"), "Agents", section === "agents")}
        <a href="/">Scout ↗</a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="hc-footer">
      <span>Home Court · Local fandom intelligence for Nike Basketball, Portland OR</span>
      <span>Researched by Home Court agents · Powered by Anthropic</span>
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
export function Scorecard({ scorecard }) {
  if (!scorecard) return null;
  return <div className="hc-stack" style={{ display: "grid", gap: 7 }}>{SCORE_LABELS.map(([k, l]) => <Meter key={k} label={l} value={scorecard[k]} />)}</div>;
}

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
    <div className="hc-months" aria-label={`Active months: ${SEASON_ORDER.filter((m) => on.has(m)).map((m) => MONTHS[m - 1]).join(", ") || "none"}`}>
      {SEASON_ORDER.map((m) => <span key={m} className={on.has(m) ? "on" : ""}>{MONTHS[m - 1][0]}</span>)}
    </div>
  );
}

export const Priority = ({ p }) => <span className="hc-priority" data-p={p}>P{p}</span>;

export function Confidence({ level }) {
  const tone = { high: "ink", medium: "line", low: "line" }[level] || "line";
  return <Chip tone={tone} title="Agent confidence">{level} confidence</Chip>;
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
