// Prints every prose field the voice rewrite changed, old above new, so a reader
// can check meaning: hedges kept, negations intact, nothing misattributed.
//   node scripts/nba/meaning-diff.mjs <repo> <team> <file> [field-regex]
// file: strategy, a lens id, factcheck or critique. field-regex filters paths,
// e.g. "summary|implication|how" for the action fields of a dossier.
import path from "node:path";

const [repo, team, file, filter] = process.argv.slice(2);
const { walk, readJSON, readAt } = await import(path.join(repo, "scripts/nba/prose.mjs"));
const { schemaFor } = await import(path.join(repo, "src/nba/agents/roster.js"));
const rel = `research/nba/${team}/${file}.json`;
const before = readAt(process.env.HC_BASE || "a2e73726a45a", rel), after = readJSON(path.join(repo, rel));
const old = new Map();
walk(before, schemaFor(file), (kind, at, key, value) => { if (kind === "prose") old.set(at, value); });
const re = filter ? new RegExp(filter) : null;
let n = 0;
walk(after, schemaFor(file), (kind, at, key, value) => {
  if (kind !== "prose" || (re && !re.test(at))) return;
  const was = old.get(at);
  if (was === undefined || was === value) return;
  n++;
  console.log(`\n${at}\n  OLD: ${was}\n  NEW: ${value}`);
});
console.log(`\n${n} changed field(s) in ${rel}${filter ? ` matching /${filter}/` : ""}.`);
