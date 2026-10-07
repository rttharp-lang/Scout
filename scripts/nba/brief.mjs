// Prints an agent's brief (or an output schema) from the shared roster.
//   node scripts/nba/brief.mjs <agent> <team> [--today YYYY-MM-DD]
//   node scripts/nba/brief.mjs --schema <name>   (music … retail-behavior, strategy, factcheck, critique)
import { buildBrief } from "../../src/nba/agents/prompts.js";
import { schemaFor } from "../../src/nba/agents/roster.js";
import { TEAM_BY_ID } from "../../src/nba/teams.js";

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
  console.log(buildBrief(agent, t, { mode: "workflow", today: ti > -1 ? args[ti + 1] : undefined }));
}
