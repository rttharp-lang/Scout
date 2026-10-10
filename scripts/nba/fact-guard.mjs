// Fact guard for copy edits (research/nba/STYLE.md). Compares a rewritten
// research file with its pre-rewrite version at a git ref and fails if:
//   - the shape changed (keys, list lengths, order),
//   - any data field changed (ids, enums, hex, months, names, URLs…),
//   - a number or hex code in the prose vanished from the file.
// Proper nouns that vanished are listed as CHECK lines for an editor to resolve.
//   node scripts/nba/fact-guard.mjs <team> <name> | <team> | league | pulse [east|west] | --all
//   options: --base <git ref> (default: $HC_BASE, else a2e7372, the last commit
//   before the October 2026 voice rewrite)
import { targets, walk, readJSON, readAt, sentences } from "./prose.mjs";

const argv = process.argv.slice(2);
const bi = argv.indexOf("--base");
const base = bi >= 0 ? argv[bi + 1] : process.env.HC_BASE || "a2e73726a45a";
const positional = bi >= 0 ? argv.filter((a, i) => i !== bi && i !== bi + 1) : argv;

// Common words that turn up capitalized mid-sentence (after a colon or a quote)
// without being names.
const STOP = new Set(("The A An And But Or Nor If When Then This That These Those It Its In On At For From To With By Of As Not No Yes All " +
  "Each Every Most Some One Do Don't Never Only Also Use Make Keep Build Ship Pay Sell Tell Run Give Put Add Avoid Skip Open Start Lead " +
  "Treat Pitch Hold Sign Ask Plan Fans Locals What Who Why How Where Here There They We You He She His Her Their Our Your Before After " +
  "Now Today Rather Instead Still Even So Yet Because Though Although While Both Either Neither Just Once Over Under Up Down Out Off " +
  "Into Onto Than Very More Less Many Much Few Other Another Such Same New Old Big Small First Last Next Is Are Was Were Be Been " +
  "Has Have Had Can Could Will Would Should May Might Must Let Go Get See Say Says Said Call Called Note Verdict Confirmed Corrected " +
  "Removed Unverifiable Checked Live Fixed Move Drop Cut Replace Label Pull Shift Name Credit Show Sell Stock Push Wait Time Target").split(" "));

const leaves = (data, schema) => {
  const m = new Map();
  walk(data, schema, (kind, at, key, value) => m.set(at, { kind, value }));
  return m;
};
const nums = (s) => (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, ""));
const hexes = (s) => (String(s).match(/#[0-9A-Fa-f]{6}\b/g) || []).map((h) => h.toUpperCase());
const clean = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/['’]s$/u, "");

function names(text) {
  const out = new Set();
  for (const s of sentences(text)) {
    const ws = s.split(/\s+/);
    ws.forEach((raw, i) => {
      if (i === 0) return;
      const w = clean(raw);
      if (w.length < 2 || !/^\p{Lu}/u.test(w) || STOP.has(w)) return;
      out.add(w);
    });
  }
  return out;
}

function guard(t) {
  const before = readAt(base, t.rel);
  if (!before) return { errors: [`no version of ${t.rel} at ${base}`], checks: [] };
  let after;
  try { after = readJSON(t.file); } catch (e) { return { errors: [`invalid JSON: ${e.message}`], checks: [] }; }
  const a = leaves(before, t.schema), b = leaves(after, t.schema);
  const errors = [];
  for (const p of a.keys()) if (!b.has(p)) errors.push(`${p}: missing (keep every key and list item, in order)`);
  for (const p of b.keys()) if (!a.has(p)) errors.push(`${p}: new (don't add keys or list items)`);
  let oldProse = "";
  for (const [p, { kind, value }] of a) {
    if (!b.has(p)) continue;
    if (kind === "fixed" && b.get(p).value !== value) errors.push(`${p}: data field changed (${JSON.stringify(value)} → ${JSON.stringify(b.get(p).value)})`);
    if (kind === "prose") oldProse += `${value}\n`;
  }
  const newAll = [...b.values()].map((x) => String(x.value)).join("\n");
  const newNums = new Set(nums(newAll)), newHex = new Set(hexes(newAll));
  const lostNums = [...new Set(nums(oldProse))].filter((n) => !newNums.has(n));
  if (lostNums.length) errors.push(`numbers dropped from the file: ${lostNums.join(", ")} (keep every number, as numerals)`);
  const lostHex = [...new Set(hexes(oldProse))].filter((h) => !newHex.has(h));
  if (lostHex.length) errors.push(`hex codes dropped: ${lostHex.join(", ")}`);
  const checks = [...names(oldProse)].filter((w) => !newAll.includes(w));
  return { errors, checks };
}

let failed = 0, checked = 0;
const list = targets(positional.length ? positional : ["--all"]);
for (const t of list) {
  const { errors, checks } = guard(t);
  checked++;
  if (errors.length) {
    failed++;
    console.log(`FAIL ${t.label}\n  ${errors.slice(0, 30).join("\n  ")}${errors.length > 30 ? `\n  …and ${errors.length - 30} more` : ""}`);
  } else if (list.length === 1 || checks.length) console.log(`OK ${t.label}`);
  if (checks.length) console.log(`  CHECK names no longer in the file: ${checks.join(", ")}\n  Restore each one that was a fact (a place, person, event, product, day or month). Ignore ordinary words.`);
}
if (list.length > 1) console.log(`\n${checked - failed}/${checked} files pass the fact guard (base ${base}).`);
process.exit(failed ? 1 : 0);
