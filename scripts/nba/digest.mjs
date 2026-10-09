// Prints a compact cross-market digest of all 30 briefs for league-stage agents:
// each market's brief headline, pulse, scores, opportunities, collection, fan
// segments and rhythm peaks. Full files stay in research/nba/<team>/.
//   node scripts/nba/digest.mjs > digest.md
import { readFileSync, existsSync } from "node:fs";
import { TEAMS } from "../../src/nba/teams.js";

const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const read = (t, f) => {
  const p = `research/nba/${t}/${f}.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

const out = [`# Home Court — 30-market digest (${TEAMS.length} markets)`, ""];
for (const team of TEAMS) {
  const s = read(team.id, "strategy");
  if (!s) continue;
  const fan = read(team.id, "fanbase");
  const rhythm = read(team.id, "rhythm");
  const months = rhythm?.extra?.months || [];
  const peaks = [...months].sort((a, b) => b.intensity - a.intensity).slice(0, 3).map((m) => `${MON[m.month]} ${m.intensity}`);
  const lows = [...months].sort((a, b) => a.intensity - b.intensity).slice(0, 2).map((m) => `${MON[m.month]} ${m.intensity}`);
  const sc = s.scorecard || {};
  out.push(`## ${team.id} — ${team.city} ${team.name} (${team.conference}, ${team.division})`);
  out.push(`Archetype: ${s.archetype?.name}: ${s.archetype?.description}`);
  out.push(`Headline: ${s.headline}`);
  out.push(`Thesis: ${s.thesis}`);
  out.push(`Moment: ${s.pulse?.teamMoment} | Heat ${s.pulse?.heat}`);
  out.push(`Strategist scores: opportunity ${sc.opportunity}, culture ${sc.culture}, retail ${sc.retail}, fandom ${sc.fandom}. ${sc.rationale || ""}`);
  out.push(`Rhythm peaks: ${peaks.join(", ")}; lows: ${lows.join(", ")}`);
  if (fan?.extra?.segments) out.push(`Fan segments: ${fan.extra.segments.map((x) => x.name).join("; ")}`);
  out.push(`Collection: "${s.collection?.name}": ${(s.collection?.themes || []).map((t) => t.name).join(" / ")}`);
  out.push(`Uniform concept: ${s.uniform?.concept}`);
  out.push("Opportunities:");
  for (const o of s.opportunities || []) {
    out.push(`- [${o.id}] ${o.title} (priority ${o.priority}, size ${o.size}; months ${(o.months || []).map((m) => MON[m]).join(" ")}; products: ${(o.products || []).join(", ")})`);
  }
  out.push(`Top insights: ${(s.topInsights || []).map((i) => i.title || i.insight || i.headline).join(" | ")}`);
  out.push("");
}
console.log(out.join("\n"));
