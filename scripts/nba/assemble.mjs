// Assembles validated agent research into the site's data:
//   research/nba/<team>/*.json  →  src/nba/data/markets/<team>.json  (one per market, lazy-loaded)
//                               →  src/nba/data/summary.json         (small index for overview, calendar, board)
//   research/nba/league.json    →  src/nba/data/league.json          (cross-market synthesis)
//   corrections, live checks    →  src/nba/data/review.json          (what was checked, what changed, who owns it)
// A market is published only when all eleven dossiers and the brief validate.
// The review layer (plan.json timing and hand-off, evidence.json live checks)
// is merged in when it validates; without it, dates get a year from the brief's
// order and are marked unreviewed.
//   node scripts/nba/assemble.mjs [--strict]   (--strict exits 1 if any market is incomplete)
import fs from "node:fs";
import path from "node:path";
import { TEAMS } from "../../src/nba/teams.js";
import { LENS_IDS } from "../../src/nba/agents/roster.js";
import { validateFile, validateLeague, validatePulse } from "./validate.mjs";
import { verificationOf } from "../../src/nba/agents/provenance.js";
import { inferTiming, strengthOf } from "../../src/nba/review.js";

const here = path.dirname(new URL(import.meta.url).pathname);
const RESEARCH = path.resolve(here, "../../research/nba");
const OUT = path.resolve(here, "../../src/nba/data");
const LEAGUE_ID = "nba";
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

fs.mkdirSync(path.join(OUT, "markets"), { recursive: true });

// League synthesis (optional until all markets exist). Its calibrated scores
// replace each strategist's self-assessed scorecard so markets compare fairly.
const problems = [];
const leagueFile = path.join(RESEARCH, "league.json");
let league = null;
if (fs.existsSync(leagueFile)) {
  const { errors } = validateLeague();
  if (errors.length) problems.push(`league: ${errors.slice(0, 5).join("; ")}`);
  else league = read(leagueFile);
}
const calibrated = Object.fromEntries((league ? league.scores : []).map((s) => [s.team, s]));
function scorecardFor(id, own) {
  const c = calibrated[id];
  if (!c) return { ...own, calibrated: false };
  return { opportunity: c.opportunity, culture: c.culture, retail: c.retail, fandom: c.fandom, rationale: `${c.note} ${own.rationale}`.trim(), calibrated: true, self: { opportunity: own.opportunity, culture: own.culture, retail: own.retail, fandom: own.fandom } };
}

// League Pulse: each team's 2026-27 situation, verified on the live web.
const pulse = {};
for (const conf of ["east", "west"]) {
  if (validatePulse(conf).errors.length) continue;
  const p = read(path.join(RESEARCH, `league-pulse-${conf}.json`));
  p.teams.forEach((t) => { pulse[t.team] = { ...t, asOf: p.asOf }; });
}

const stewardship = fs.existsSync(path.join(RESEARCH, "review-status.json")) ? read(path.join(RESEARCH, "review-status.json")).markets : {};
const editorCorrections = fs.existsSync(path.join(RESEARCH, "corrections.json")) ? read(path.join(RESEARCH, "corrections.json")).corrections : [];

// How many live-checked facts stand behind an insight or an opportunity.
// Contradicted claims were corrected at the source, so they're counted apart.
function supportFor(evidence, match) {
  if (!evidence) return { verified: 0, corrected: 0, observed: 0, ids: [], strength: "unchecked" };
  const claims = evidence.claims.filter((c) => match(c.supports));
  const verified = claims.filter((c) => c.status === "verified");
  const corrected = claims.filter((c) => c.status === "contradicted");
  const observed = evidence.observations.filter((o) => match(o.supports));
  const n = verified.length + observed.length;
  return { verified: verified.length, corrected: corrected.length, observed: observed.length, ids: [...verified, ...corrected].map((c) => c.id), strength: strengthOf(n) };
}

const summary = [];
const allCorrections = editorCorrections.map((c) => ({ ...c, by: "editor" }));
const totals = { claims: 0, verified: 0, contradicted: 0, unclear: 0, observations: 0, references: 0, searches: 0, markets: 0, plans: 0, checkedSources: new Set() };

for (const t of TEAMS) {
  const dir = path.join(RESEARCH, t.id);
  const required = [...LENS_IDS, "strategy"];
  const bad = required.map((n) => ({ n, r: validateFile(t.id, n) })).filter((x) => x.r.errors.length);
  if (bad.length) {
    problems.push(`${t.id}: ${bad.map((b) => `${b.n} (${b.r.errors[0]})`).join("; ")}`);
    summary.push({ id: t.id, league: LEAGUE_ID, status: "pending" });
    continue;
  }
  const dossiers = Object.fromEntries(LENS_IDS.map((n) => [n, read(path.join(dir, `${n}.json`))]));
  // Segment sizes ("largest share of the seats") were never measured. They stay
  // in the research for the record but are not published.
  (dossiers.fanbase.extra.segments || []).forEach((sg) => { delete sg.share; });
  const strategy = read(path.join(dir, "strategy.json"));
  strategy.scorecard = scorecardFor(t.id, strategy.scorecard);
  const optional = (n) => {
    const f = path.join(dir, `${n}.json`);
    if (!fs.existsSync(f)) return null;
    const { errors } = validateFile(t.id, n);
    if (errors.length) { problems.push(`${t.id}/${n}.json not published: ${errors[0]}`); return null; }
    return read(f);
  };
  const review = { factcheck: optional("factcheck"), critique: optional("critique") };
  const evidence = optional("evidence");
  const plan = optional("plan");

  // Timing and hand-off.
  const inferred = inferTiming(strategy.calendar);
  strategy.calendar.forEach((c, i) => {
    const p = plan && plan.calendar[i];
    c.timing = p ? { ...p, reviewed: true } : inferred[i];
    delete c.timing.i;
    delete c.timing.window;
  });
  strategy.topInsights.forEach((ins, i) => { ins.support = supportFor(evidence, (s) => s.insights.includes(i)); });
  strategy.opportunities.forEach((o) => {
    const h = plan && plan.opportunities.find((x) => x.id === o.id);
    o.handoff = h ? { ...h, reviewed: true } : null;
    const via = new Set(h ? h.insights : []);
    o.support = supportFor(evidence, (s) => s.opportunities.includes(o.id) || s.insights.some((k) => via.has(k)));
  });

  const ver = verificationOf({ dossiers, strategy, review });
  const updated = evidence ? evidence.checkedOn : fs.statSync(path.join(dir, "strategy.json")).mtime.toISOString().slice(0, 10);
  const steward = { owner: null, reviewer: null, signedOff: null, notes: "", ...(stewardship[t.id] || {}) };
  const checkedUrls = new Set([
    ...(evidence ? [...evidence.claims.flatMap((c) => c.sources), ...evidence.observations.map((o) => o.source), ...evidence.references.map((r) => r.source)].map((s) => s.url) : []),
    ...(pulse[t.id] ? pulse[t.id].sources.map((s) => s.url) : []),
  ]);
  checkedUrls.forEach((u) => totals.checkedSources.add(u));
  if (evidence) {
    totals.markets++;
    totals.searches += evidence.searches;
    totals.claims += evidence.claims.length;
    for (const k of ["verified", "contradicted", "unclear"]) totals[k] += evidence.claims.filter((c) => c.status === k).length;
    totals.observations += evidence.observations.length;
    totals.references += evidence.references.length;
    evidence.corrections.forEach((c) => {
      const claim = evidence.claims.find((x) => x.id === c.claimId);
      allCorrections.push({ id: `${t.id}-${c.claimId}`, market: t.id, found: evidence.checkedOn, was: c.claim, now: c.correction, sources: claim ? claim.sources : [], files: c.files, status: "applied", by: "agent" });
    });
  }
  if (plan) totals.plans++;

  fs.writeFileSync(path.join(OUT, "markets", `${t.id}.json`), JSON.stringify({ id: t.id, league: LEAGUE_ID, updated, strategy, dossiers, review, evidence, pulse: pulse[t.id] || null, stewardship: steward }));

  const rhythm = dossiers.rhythm.extra.months;
  const readingList = new Set(Object.values(dossiers).flatMap((d) => d.sources.map((s) => s.url)));
  const verdicts = review.factcheck ? review.factcheck.verdicts : [];
  summary.push({
    id: t.id,
    league: LEAGUE_ID,
    status: "complete",
    updated,
    headline: strategy.headline,
    archetype: strategy.archetype,
    pulse: strategy.pulse,
    verifiedMoment: pulse[t.id] ? pulse[t.id].teamMoment : null,
    scorecard: strategy.scorecard,
    palette: dossiers.uniform.extra.palette,
    opportunities: strategy.opportunities.map((o) => ({ id: o.id, title: o.title, summary: o.summary, where: o.where, when: o.when, how: o.how, segment: o.segment, priority: o.priority, size: o.size, months: o.months, products: o.products, kpi: o.kpi, handoff: o.handoff, support: o.support })),
    calendar: strategy.calendar.map((c) => ({ month: c.month, window: c.window, moment: c.moment, play: c.play, products: c.products, priority: c.priority, channel: c.channel, timing: c.timing })),
    rhythm: rhythm.map((m) => ({ intensity: m.intensity, phase: m.phase })),
    readingList: readingList.size,
    checkedSources: checkedUrls.size,
    verification: { live: ver.live.length, knowledge: ver.knowledge.length, briefMode: ver.briefMode, queue: ver.queue.length },
    evidence: evidence ? { checkedOn: evidence.checkedOn, claims: evidence.claims.length, verified: evidence.claims.filter((c) => c.status === "verified").length, contradicted: evidence.claims.filter((c) => c.status === "contradicted").length, unclear: evidence.claims.filter((c) => c.status === "unclear").length, observations: evidence.observations.length, references: evidence.references.length } : null,
    planReviewed: !!plan,
    checks: { checked: review.factcheck ? review.factcheck.checked : 0, corrected: verdicts.filter((v) => v.verdict === "corrected").length, removed: verdicts.filter((v) => v.verdict === "removed").length },
    stewardship: steward,
  });
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
if (league) fs.writeFileSync(path.join(OUT, "league.json"), JSON.stringify(league));

const leagueCalendar = fs.existsSync(path.join(RESEARCH, "league-calendar.json")) ? read(path.join(RESEARCH, "league-calendar.json")) : null;
const pulseAsOf = [...new Set(Object.values(pulse).map((p) => p.asOf))];
fs.writeFileSync(path.join(OUT, "review.json"), JSON.stringify({
  league: LEAGUE_ID,
  season: "2026-27",
  corrections: allCorrections,
  totals: { ...totals, checkedSources: totals.checkedSources.size },
  pulse: { asOf: pulseAsOf[0] || null, teams: Object.keys(pulse).length },
  leagueCalendar: leagueCalendar ? { verifiedAt: leagueCalendar.verifiedAt, events: leagueCalendar.events.length, confirmed: leagueCalendar.events.filter((e) => e.status === "confirmed").length, list: leagueCalendar.events.map((e) => ({ name: e.name, date: e.date, status: e.status, source: e.source || "" })) } : null,
}, null, 1));

const done = summary.filter((s) => s.status === "complete").length;
console.log(`Assembled ${done}/${TEAMS.length} markets → src/nba/data/ · review layer: ${totals.markets} evidence, ${totals.plans} plans · ${allCorrections.length} corrections`);
if (problems.length) console.log(`Notes:\n  ${problems.join("\n  ")}`);
if (process.argv.includes("--strict") && problems.length) process.exit(1);
