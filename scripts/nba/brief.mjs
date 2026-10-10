// Prints an agent's brief (or an output schema) from the shared roster.
//   node scripts/nba/brief.mjs <agent> <team> [--today YYYY-MM-DD] [--knowledge]
//   node scripts/nba/brief.mjs --schema <name>   (music … retail-behavior, strategy, factcheck, critique)
import fs from "node:fs";
import path from "node:path";
import { buildBrief } from "../../src/nba/agents/prompts.js";
import { schemaFor } from "../../src/nba/agents/roster.js";
import { TEAM_BY_ID } from "../../src/nba/teams.js";
import { validatePulse } from "./validate.mjs";

const RESEARCH = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../research/nba");

// Live-verified current facts (League Pulse + confirmed league dates) for one
// team, appended to every market agent's brief when available.
function currentFacts(team) {
  const conf = team.conference.toLowerCase();
  const out = [];
  if (!validatePulse(conf).errors.length) {
    const pulse = JSON.parse(fs.readFileSync(path.join(RESEARCH, `league-pulse-${conf}.json`), "utf8"));
    const entry = pulse.teams.find((t) => t.team === team.id);
    if (entry) out.push(`${team.place || team.city} ${team.name}, verified ${pulse.asOf}:\n${JSON.stringify(entry, null, 1)}`);
  }
  const calFile = path.join(RESEARCH, "league-calendar.json");
  if (fs.existsSync(calFile)) {
    try {
      const cal = JSON.parse(fs.readFileSync(calFile, "utf8"));
      const confirmed = (cal.events || []).filter((e) => e.status === "confirmed");
      if (confirmed.length) out.push(`Confirmed 2026-27 league dates:\n${confirmed.map((e) => `- ${e.name}: ${e.date}${e.location ? ` (${e.location})` : ""}${e.notes ? ` — ${e.notes}` : ""}`).join("\n")}`);
    } catch {}
  }
  if (!out.length) return "";
  return `\n\nCURRENT FACTS — verified on the live web today. They are authoritative over your own knowledge (which ends mid-2026 and misses the 2026 offseason): use them, never contradict them, and don't add them to provenance.verify.\n${out.join("\n\n")}\n`;
}

const args = process.argv.slice(2);
if (args[0] === "--schema") {
  const s = schemaFor(args[1]);
  if (!s) { console.error(`no schema for ${args[1]}`); process.exit(2); }
  console.log(JSON.stringify(s, null, 2));
} else {
  const [agent, team] = args;
  const ti = args.indexOf("--today");
  const t = TEAM_BY_ID[team];
  if (!agent || !t) { console.error("usage: brief.mjs <agent> <team> | --schema <name>"); process.exit(2); }
  console.log(buildBrief(agent, t, { mode: "workflow", today: ti > -1 ? args[ti + 1] : undefined, knowledge: args.includes("--knowledge") }) + currentFacts(t));
}
