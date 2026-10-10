// Shared helpers for the copy tools (fact-guard, voice-lint): find a research
// file, and split its values into prose an editor may rewrite and data that
// must not change (ids, enums, colors, months, names, URLs…). See research/nba/STYLE.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { schemaFor, LENS_IDS } from "../../src/nba/agents/roster.js";
import { TEAMS } from "../../src/nba/teams.js";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const RESEARCH = path.join(ROOT, "research/nba");
export const MARKET_FILES = [...LENS_IDS, "strategy", "factcheck", "critique"];

// Keys whose values (and everything under them) are data, never prose.
const FIXED_KEYS = new Set([
  "team", "lens", "id", "target", "hex", "month", "months", "evidence", "sources", "url",
  "mode", "asOf", "name", "term", "season", "era", "date", "teams", "market", "stars", "conference",
]);

// Resolves CLI targets to { label, file, schema } entries.
//   <team> <name> | <team> | league | pulse east|west | --all
export function targets(args) {
  const out = [];
  const add = (label, rel, schemaName) => out.push({ label, rel, file: path.join(ROOT, rel), schema: schemaFor(schemaName) });
  const market = (team, name) => add(`${team}/${name}`, `research/nba/${team}/${name}.json`, name);
  const [a, b] = args.filter((x) => !x.startsWith("--"));
  if (args.includes("--all")) {
    for (const t of TEAMS) for (const n of MARKET_FILES) market(t.id, n);
    add("league", "research/nba/league.json", "league");
    for (const c of ["east", "west"]) add(`pulse-${c}`, `research/nba/league-pulse-${c}.json`, "pulse");
  } else if (a === "league") add("league", "research/nba/league.json", "league");
  else if (a === "pulse") for (const c of b ? [b] : ["east", "west"]) add(`pulse-${c}`, `research/nba/league-pulse-${c}.json`, "pulse");
  else if (a && b) market(a, b);
  else if (a) for (const n of MARKET_FILES) market(a, n);
  return out;
}

// Walks a value alongside its schema, calling visit(kind, path, key, value, base)
// for every leaf: kind is "prose" for rewritable text, "fixed" for data.
export function walk(value, schema, visit, at = "$", key = "", fixed = false) {
  // `teams` is a list of team ids in league.json but a list of entries in the pulse.
  const idList = key === "teams" && Array.isArray(value) && value.every((v) => typeof v === "string");
  const isFixed = fixed || (FIXED_KEYS.has(key) && (key !== "teams" || idList)) || !!(schema && schema.enum);
  if (Array.isArray(value)) { value.forEach((v, i) => walk(v, schema && schema.items, visit, `${at}[${i}]`, key, isFixed)); return; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, schema && schema.properties && schema.properties[k], visit, `${at}.${k}`, k, isFixed);
    return;
  }
  const prose = typeof value === "string" && !isFixed && !/^https?:\/\//.test(value);
  visit(prose ? "prose" : "fixed", at, key, value);
}

export const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// The file as it was at a git ref (default: the pre-rewrite tag).
export function readAt(ref, rel) {
  try { return JSON.parse(execFileSync("git", ["show", `${ref}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })); }
  catch { return null; }
}

export const sentences = (text) => text.split(/(?<=[.!?])\s+(?=["'“‘(]?[A-Z0-9])/).filter(Boolean);
export const words = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
