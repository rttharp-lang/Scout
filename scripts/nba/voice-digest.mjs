// League-wide digest of Home Court headlines and titles, for spotting tics that
// repeat across markets. node scripts/nba/voice-digest.mjs <repo> [team ...]
import fs from "node:fs";
import path from "node:path";

const repo = process.argv[2];
const only = process.argv.slice(3);
const { TEAMS } = await import(path.join(repo, "src/nba/teams.js"));
const LENSES = ["music", "art", "food", "culture", "underground", "hoops", "fanbase", "rhythm", "uniform", "retail-landscape", "retail-behavior"];
const read = (t, f) => JSON.parse(fs.readFileSync(path.join(repo, `research/nba/${t}/${f}.json`), "utf8"));

const lines = [], heads = [], titles = [];
for (const t of TEAMS) {
  const s = read(t.id, "strategy");
  heads.push(s.headline);
  const mine = !only.length || only.includes(t.id);
  if (mine) lines.push(`\n## ${t.id}\nBRIEF: ${s.headline}\n  archetype: ${s.archetype.name}\n  insights: ${s.topInsights.map((i) => i.title).join(" | ")}\n  opportunities: ${s.opportunities.map((o) => o.title).join(" | ")}`);
  titles.push(...s.topInsights.map((i) => i.title), ...s.opportunities.map((o) => o.title));
  for (const f of LENSES) {
    const d = read(t.id, f);
    heads.push(d.headline);
    titles.push(...d.insights.map((i) => i.title));
    if (mine) lines.push(`${f.padEnd(16)} ${d.headline}  [dek ${d.summary.split(/\s+/).length}w]`);
  }
}

// Patterns that turn into tics when every market uses them.
const PATTERNS = [
  [/, not /, '", not …" contrast'], [/\bnot\b/i, '"not"'], [/\bNike\b/, '"Nike"'], [/\bbuys?\b/i, '"buy(s)"'],
  [/\bthe city\b/i, '"the city"'], [/\bfirst\b/i, '"first"'], [/\bown(s)?\b/i, '"own(s)"'], [/\bwhole\b/i, '"whole"'],
  [/:/, "colon"], [/\.\s+\S/, "two sentences"], [/\bwear(s)?\b/i, '"wear(s)"'], [/\bcarr(y|ies)\b/i, '"carry"'],
];
const count = (arr) => PATTERNS.map(([re, label]) => [label, arr.filter((h) => re.test(h)).length]);
console.log(`# Voice digest: ${heads.length} headlines, ${titles.length} titles across ${TEAMS.length} markets`);
console.log("\nHow often headlines use each pattern (a tic if it's in more than about a fifth of them):");
for (const [label, n] of count(heads)) console.log(`  ${label.padEnd(22)} ${String(n).padStart(4)} of ${heads.length} headlines (${Math.round((n / heads.length) * 100)}%)`);
console.log("\nTitles:");
for (const [label, n] of count(titles)) console.log(`  ${label.padEnd(22)} ${String(n).padStart(4)} of ${titles.length} titles (${Math.round((n / titles.length) * 100)}%)`);
const opener = new Map();
for (const h of heads) { const w = h.split(/\s+/).slice(0, 2).join(" "); opener.set(w, (opener.get(w) || 0) + 1); }
console.log("\nMost common two-word headline openings:");
for (const [w, n] of [...opener].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(3)}  ${w}`);
console.log(lines.join("\n"));
