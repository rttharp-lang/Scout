// Cross-market contamination check for the voice rewrite. For every prose field
// in a market's rewritten files, find capitalized words that never appeared in
// that market's original files but do appear in exactly one other market's
// originals. Two or more such words from the same other market flag the field.
//   node scripts/nba/cross-market.mjs <repo> [team ...]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2];
const only = process.argv.slice(3);
const { walk, MARKET_FILES } = await import(path.join(repo, "scripts/nba/prose.mjs"));
const { schemaFor } = await import(path.join(repo, "src/nba/agents/roster.js"));
const { TEAMS } = await import(path.join(repo, "src/nba/teams.js"));

const tokens = (s) => new Set((String(s).match(/\b\p{Lu}[\p{L}'’-]{2,}/gu) || []).map((w) => w.replace(/['’]s$/, "")));
const original = (team, f) => JSON.parse(execFileSync("git", ["show", `${process.env.HC_BASE || "a2e73726a45a"}:research/nba/${team}/${f}.json`], { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 }));

const vocab = {};
for (const t of TEAMS) {
  const v = new Set();
  for (const f of MARKET_FILES) for (const w of tokens(JSON.stringify(original(t.id, f)))) v.add(w);
  vocab[t.id] = v;
}
const owners = new Map();
for (const [id, v] of Object.entries(vocab)) for (const w of v) owners.set(w, [...(owners.get(w) || []), id]);

let flagged = 0;
for (const t of TEAMS.filter((x) => !only.length || only.includes(x.id))) {
  for (const f of MARKET_FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(repo, `research/nba/${t.id}/${f}.json`), "utf8"));
    walk(data, schemaFor(f), (kind, at, key, value) => {
      if (kind !== "prose") return;
      const foreign = {};
      for (const w of tokens(value)) {
        if (vocab[t.id].has(w)) continue;
        const o = owners.get(w) || [];
        if (o.length === 1) (foreign[o[0]] ||= []).push(w);
      }
      for (const [other, ws] of Object.entries(foreign)) {
        if (ws.length >= 2) { flagged++; console.log(`${t.id}/${f} ${at}: words from ${other} (${ws.join(", ")}): "${String(value).slice(0, 110)}…"`); }
      }
    });
  }
}
console.log(flagged ? `\n${flagged} field(s) flagged.` : "No cross-market text found.");
