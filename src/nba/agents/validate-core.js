// The rules a research file has to meet beyond its JSON schema. Pure (no file
// access), so scripts/nba/validate.mjs and anything that checks research in
// memory apply exactly the same checks. plan and evidence are checked against the brief they annotate,
// passed in as ctx.strategy (and ctx.evidence for plan).
import { check } from "./jsonschema.js";
import { schemaFor, LENS_IDS } from "./roster.js";

// research/nba/<team>/published.json: metadata for research published from a live run (none yet).
export const PUBLISHED_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["team", "mode", "ranAt", "publishedAt", "files", "replaced"],
  properties: {
    team: { type: "string" },
    mode: { type: "string", enum: ["live"] },
    ranAt: { type: "string", pattern: "^20\\d\\d-\\d\\d-\\d\\dT" },
    publishedAt: { type: "string", pattern: "^20\\d\\d-\\d\\d-\\d\\dT" },
    files: { type: "array", items: { type: "string" } },
    replaced: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
};

export function validateData(team, name, data, ctx = {}) {
  const schema = name === "published" ? PUBLISHED_SCHEMA : schemaFor(name);
  if (!schema) return [`no schema for "${name}"`];
  const errs = check(schema, data);
  if (name === "published") return errs.length ? errs : data.team === team ? [] : [`$.team: expected "${team}", got "${data.team}"`];
  return [...errs, ...semantic(team, name, data, ctx)];
}

// Checks the schema can't express.
function semantic(team, name, data, ctx) {
  const errs = [];
  if (data.team !== team) errs.push(`$.team: expected "${team}", got "${data.team}"`);
  if (LENS_IDS.includes(name) && data.lens !== name) errs.push(`$.lens: expected "${name}", got "${data.lens}"`);
  (data.designCues || []).forEach((c, i) => {
    if (c.type === "color" && !/^#[0-9A-Fa-f]{6}$/.test(c.hex || "")) errs.push(`$.designCues[${i}].hex: color cues need a #RRGGBB hex`);
  });
  (data.sources || []).forEach((s, i) => { if (!/^https?:\/\//.test(s.url || "")) errs.push(`$.sources[${i}].url: not an http(s) URL`); });
  if (name === "rhythm" && data.extra) {
    const ms = (data.extra.months || []).map((m) => m.month);
    if (ms.join(",") !== "1,2,3,4,5,6,7,8,9,10,11,12") errs.push(`$.extra.months: months must be 1..12 in order (got ${ms.join(",")})`);
  }
  if (name === "strategy") {
    const ids = (data.opportunities || []).map((o) => o.id);
    if (new Set(ids).size !== ids.length) errs.push(`$.opportunities: duplicate ids`);
    (data.topInsights || []).forEach((t, i) => t.evidence.forEach((e) => { if (!LENS_IDS.includes(e)) errs.push(`$.topInsights[${i}].evidence: unknown lens "${e}"`); }));
    if ((data.headline || "").length > 140) errs.push(`$.headline: keep it under ~120 characters`);
  }
  if (name === "plan" || name === "evidence") errs.push(...reviewChecks(team, name, data, ctx));
  return errs;
}

// The review layer has to line up with the brief it annotates, and a date or
// claim can only be called confirmed when a verified source sits behind it.
function reviewChecks(team, name, data, { strategy, evidence: ev } = {}) {
  const errs = [];
  if (!strategy) return ["strategy.json is missing or unreadable"];
  const evidence = name === "evidence" ? data : ev;
  const verified = new Set((evidence?.claims || []).filter((c) => c.status === "verified" && c.sources.length).map((c) => c.id));
  if (name === "evidence") {
    const ids = data.claims.map((c) => c.id);
    if (new Set(ids).size !== ids.length) errs.push("$.claims: duplicate ids");
    data.claims.forEach((c, i) => {
      if (c.status !== "unclear" && !c.sources.length) errs.push(`$.claims[${i}]: a ${c.status} claim needs at least one source`);
    });
    const oppIds = new Set(strategy.opportunities.map((o) => o.id));
    const supports = [...data.claims, ...data.observations, ...data.references].map((x) => x.supports);
    supports.forEach((s, i) => {
      s.insights.filter((k) => k >= strategy.topInsights.length).forEach((k) => errs.push(`supports[${i}]: no topInsights[${k}]`));
      s.opportunities.filter((id) => !oppIds.has(id)).forEach((id) => errs.push(`supports[${i}]: unknown opportunity "${id}"`));
      s.calendar.filter((k) => k >= strategy.calendar.length).forEach((k) => errs.push(`supports[${i}]: no calendar[${k}]`));
    });
    data.corrections.forEach((c, i) => { if (!ids.includes(c.claimId)) errs.push(`$.corrections[${i}].claimId: no claim "${c.claimId}"`); });
    return errs;
  }
  const cal = strategy.calendar;
  if (data.calendar.length !== cal.length) errs.push(`$.calendar: ${data.calendar.length} entries for ${cal.length} in strategy.json`);
  data.calendar.forEach((t, k) => {
    const at = `$.calendar[${k}]`;
    if (t.i !== k) errs.push(`${at}.i: expected ${k}`);
    const c = cal[t.i];
    if (!c) return;
    if (c.window !== t.window) errs.push(`${at}.window: does not match strategy.json`);
    // The entry's month has to fall inside start..end (a window can open the month before).
    const months = []; for (let y = +t.start.slice(0, 4), m = +t.start.slice(5, 7), stop = (t.end || t.start).slice(0, 7); ; ) { const k = `${y}-${String(m).padStart(2, "0")}`; months.push(m); if (k >= stop || months.length > 24) break; m = m === 12 ? 1 : m + 1; if (m === 1) y++; }
    if (!months.includes(c.month)) errs.push(`${at}: the entry is month ${c.month}, outside ${t.start}..${t.end || t.start}`);
    if (t.end && t.end < t.start) errs.push(`${at}.end: before start`);
    if (t.certainty === "confirmed" && !["checked-live", "league-calendar", "fixed-holiday"].includes(t.basis)) errs.push(`${at}: confirmed needs basis checked-live, league-calendar or fixed-holiday`);
    if (t.basis === "checked-live" && !verified.has(t.basisNote)) errs.push(`${at}.basisNote: "${t.basisNote}" is not a verified claim in evidence.json`);
    if (t.certainty !== "confirmed" && ["checked-live", "league-calendar", "fixed-holiday"].includes(t.basis)) errs.push(`${at}: basis ${t.basis} should be confirmed`);
    if (t.actNote && !t.actBy) errs.push(`${at}.actNote: set actBy or leave the note empty`);
  });
  const opps = strategy.opportunities.map((o) => o.id);
  const got = data.opportunities.map((o) => o.id);
  if (got.join() !== opps.join()) errs.push(`$.opportunities: ids must match strategy.json in order (${opps.join(", ")})`);
  data.opportunities.forEach((o, k) => {
    o.insights.filter((n) => n >= strategy.topInsights.length).forEach((n) => errs.push(`$.opportunities[${k}].insights: no topInsights[${n}]`));
    if (o.status !== "hypothesis") errs.push(`$.opportunities[${k}].status: only a named person can move an idea past "hypothesis"`);
  });
  return errs;
}

