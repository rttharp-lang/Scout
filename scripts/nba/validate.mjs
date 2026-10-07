// Validates Home Court research files against the roster's output contracts.
//   node scripts/nba/validate.mjs <team> <name>   one file (research/nba/<team>/<name>.json)
//   node scripts/nba/validate.mjs <team>          every file present for a team
//   node scripts/nba/validate.mjs --all           every team
//   node scripts/nba/validate.mjs league          the league synthesis
//   node scripts/nba/validate.mjs pulse east|west the League Pulse
// Prints OK or the errors; exits 1 on any error. Agents run this after writing.
import fs from "node:fs";
import path from "node:path";
import { check } from "../../src/nba/agents/jsonschema.js";
import { schemaFor, LENS_IDS } from "../../src/nba/agents/roster.js";
import { TEAM_BY_ID, TEAMS } from "../../src/nba/teams.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../research/nba");

// Checks the schema can't express.
function semantic(team, name, data) {
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
  return errs;
}

export function validateFile(team, name) {
  const file = path.join(ROOT, team, `${name}.json`);
  if (!fs.existsSync(file)) return { file, errors: ["file does not exist"] };
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return { file, errors: [`invalid JSON: ${e.message}`] }; }
  const schema = schemaFor(name);
  if (!schema) return { file, errors: [`no schema for "${name}"`] };
  return { file, errors: [...check(schema, data), ...semantic(team, name, data)] };
}

function report({ file, errors }) {
  const rel = path.relative(process.cwd(), file);
  if (!errors.length) { console.log(`OK ${rel}`); return true; }
  console.log(`FAIL ${rel}\n  ${errors.slice(0, 40).join("\n  ")}${errors.length > 40 ? `\n  …and ${errors.length - 40} more` : ""}`);
  return false;
}

// research/nba/league.json — the cross-market synthesis.
export function validateLeague() {
  const file = path.join(ROOT, "league.json");
  if (!fs.existsSync(file)) return { file, errors: ["file does not exist"] };
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return { file, errors: [`invalid JSON: ${e.message}`] }; }
  const errors = check(schemaFor("league"), data);
  if (errors.length) return { file, errors };
  const ids = TEAMS.map((t) => t.id);
  const unknown = (where, list) => list.filter((id) => !TEAM_BY_ID[id]).forEach((id) => errors.push(`${where}: unknown team id "${id}"`));
  const scored = data.scores.map((s) => s.team);
  ids.filter((id) => !scored.includes(id)).forEach((id) => errors.push(`$.scores: missing "${id}"`));
  if (new Set(scored).size !== scored.length) errors.push("$.scores: duplicate team ids");
  unknown("$.scores", scored);
  const clustered = data.clusters.flatMap((c) => c.teams);
  ids.filter((id) => !clustered.includes(id)).forEach((id) => errors.push(`$.clusters: "${id}" is in no cluster`));
  if (new Set(clustered).size !== clustered.length) errors.push("$.clusters: a team appears in more than one cluster");
  unknown("$.clusters", clustered);
  data.themes.forEach((t, i) => unknown(`$.themes[${i}].teams`, t.teams));
  data.tentpoles.forEach((t, i) => unknown(`$.tentpoles[${i}].teams`, t.teams));
  unknown("$.priorities", data.priorities.map((p) => p.team));
  return { file, errors };
}

// research/nba/league-pulse-<east|west>.json — verified 2026-27 team facts.
export function validatePulse(conf) {
  const file = path.join(ROOT, `league-pulse-${conf}.json`);
  if (!fs.existsSync(file)) return { file, errors: ["file does not exist"] };
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return { file, errors: [`invalid JSON: ${e.message}`] }; }
  const errors = check(schemaFor("pulse"), data);
  if (errors.length) return { file, errors };
  const want = TEAMS.filter((t) => t.conference.toLowerCase() === conf).map((t) => t.id);
  const got = data.teams.map((t) => t.team);
  want.filter((id) => !got.includes(id)).forEach((id) => errors.push(`$.teams: missing "${id}"`));
  got.filter((id) => !want.includes(id)).forEach((id) => errors.push(`$.teams: "${id}" is not in the ${conf} conference`));
  if (new Set(got).size !== got.length) errors.push("$.teams: duplicate team ids");
  return { file, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b] = process.argv.slice(2);
  if (a === "league") process.exit(report(validateLeague()) ? 0 : 1);
  if (a === "pulse") process.exit(["east", "west"].includes(b) && report(validatePulse(b)) ? 0 : 1);
  let ok = true;
  const teams = a === "--all" ? TEAMS.map((t) => t.id) : [a];
  if (!a || (a !== "--all" && !TEAM_BY_ID[a])) { console.error("usage: validate.mjs <team> [name] | --all"); process.exit(2); }
  for (const team of teams) {
    const names = b ? [b] : fs.existsSync(path.join(ROOT, team)) ? fs.readdirSync(path.join(ROOT, team)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
    if (!names.length && a !== "--all") { console.log(`no files for ${team}`); ok = false; }
    for (const n of names) ok = report(validateFile(team, n)) && ok;
  }
  process.exit(ok ? 0 : 1);
}
