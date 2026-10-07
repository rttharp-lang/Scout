// Assembles validated agent research into the site's data:
//   research/nba/<team>/*.json  →  src/nba/data/markets/<team>.json  (one per market, lazy-loaded)
//                               →  src/nba/data/summary.json         (small index for overview + calendar)
//   research/nba/league.json    →  src/nba/data/league.json          (cross-market synthesis)
// A market is published only when all eleven dossiers and the brief validate.
//   node scripts/nba/assemble.mjs [--strict]   (--strict exits 1 if any market is incomplete)
import fs from "node:fs";
import path from "node:path";
import { TEAMS } from "../../src/nba/teams.js";
import { LENS_IDS } from "../../src/nba/agents/roster.js";
import { validateFile, validateLeague, validatePulse } from "./validate.mjs";
import { verificationOf } from "../../src/nba/agents/provenance.js";

const here = path.dirname(new URL(import.meta.url).pathname);
const RESEARCH = path.resolve(here, "../../research/nba");
const OUT = path.resolve(here, "../../src/nba/data");
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

const summary = [];
for (const t of TEAMS) {
  const dir = path.join(RESEARCH, t.id);
  const required = [...LENS_IDS, "strategy"];
  const bad = required.map((n) => ({ n, r: validateFile(t.id, n) })).filter((x) => x.r.errors.length);
  if (bad.length) {
    problems.push(`${t.id}: ${bad.map((b) => `${b.n} (${b.r.errors[0]})`).join("; ")}`);
    summary.push({ id: t.id, status: "pending" });
    continue;
  }
  const dossiers = Object.fromEntries(LENS_IDS.map((n) => [n, read(path.join(dir, `${n}.json`))]));
  const strategy = read(path.join(dir, "strategy.json"));
  strategy.scorecard = scorecardFor(t.id, strategy.scorecard);
  const optional = (n) => (fs.existsSync(path.join(dir, `${n}.json`)) && !validateFile(t.id, n).errors.length ? read(path.join(dir, `${n}.json`)) : null);
  const review = { factcheck: optional("factcheck"), critique: optional("critique") };
  const updated = fs.statSync(path.join(dir, "strategy.json")).mtime.toISOString().slice(0, 10);

  const verification = verificationOf({ dossiers, strategy, review });
  fs.writeFileSync(path.join(OUT, "markets", `${t.id}.json`), JSON.stringify({ id: t.id, updated, strategy, dossiers, review, pulse: pulse[t.id] || null }));

  const rhythm = dossiers.rhythm.extra.months;
  const sources = new Set(Object.values(dossiers).flatMap((d) => d.sources.map((s) => s.url)));
  const verdicts = review.factcheck ? review.factcheck.verdicts : [];
  summary.push({
    id: t.id,
    status: "complete",
    updated,
    headline: strategy.headline,
    archetype: strategy.archetype,
    pulse: strategy.pulse,
    verifiedMoment: pulse[t.id] ? pulse[t.id].teamMoment : null,
    scorecard: strategy.scorecard,
    palette: dossiers.uniform.extra.palette,
    opportunities: strategy.opportunities.map((o) => ({ id: o.id, title: o.title, summary: o.summary, where: o.where, when: o.when, how: o.how, segment: o.segment, priority: o.priority, size: o.size, months: o.months, products: o.products })),
    calendar: strategy.calendar.map((c) => ({ month: c.month, window: c.window, moment: c.moment, play: c.play, products: c.products, priority: c.priority })),
    rhythm: rhythm.map((m) => ({ intensity: m.intensity, phase: m.phase })),
    sources: sources.size,
    verification: { live: verification.live.length, knowledge: verification.knowledge.length, briefMode: verification.briefMode, queue: verification.queue.length },
    checks: { checked: review.factcheck ? review.factcheck.checked : 0, corrected: verdicts.filter((v) => v.verdict === "corrected").length, removed: verdicts.filter((v) => v.verdict === "removed").length },
  });
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));

if (league) fs.writeFileSync(path.join(OUT, "league.json"), JSON.stringify(league));

const done = summary.filter((s) => s.status === "complete").length;
console.log(`Assembled ${done}/${TEAMS.length} markets → src/nba/data/`);
if (problems.length) console.log(`Incomplete:\n  ${problems.join("\n  ")}`);
if (process.argv.includes("--strict") && problems.length) process.exit(1);
