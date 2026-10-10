// Voice lint for Home Court copy (research/nba/STYLE.md). Reads the prose in
// research files and flags consultant-speak, brochure filler, AI tells, run-on
// sentences and long headlines. FIX lines must be fixed; notes are judgment calls.
//   node scripts/nba/voice-lint.mjs <team> <name> | <team> | league | pulse [east|west] | --all
//   options: --summary (one line per file type), --quiet (only files that need fixes)
import { targets, walk, readJSON, sentences, words } from "./prose.mjs";

const argv = process.argv.slice(2);
const SUMMARY = argv.includes("--summary"), QUIET = argv.includes("--quiet");

const HARD = [
  /\bleverag(?:e|es|ed|ing)\b/i, /\bunlock(?:s|ed|ing)?\b/i, /\btouchpoints?\b/i, /\becosystems?\b/i, /\bsynerg\w*/i, /\bholistic\b/i,
  /\bbest-in-class\b/i, /\bvalue proposition\b/i, /\bmove the needle\b/i, /\blean(?:s|ed|ing)? into\b/i, /\bdoubl(?:e|es|ed|ing) down\b/i,
  /\bat the intersection of\b/i, /\bvibrant\b/i, /\bbustling\b/i, /\bnestled\b/i, /\brich history\b/i, /\bhidden gems?\b/i, /\btapestry\b/i,
  /\bmelting pot\b/i, /\bworld-class\b/i, /\bmust-visit\b/i, /\ba testament to\b/i, /\bspeaks? to\b/i, /\bresonat\w*/i, /\btruly\b/i,
  /\bgenuinely\b/i, /\bmore than just\b/i, /\bnot just\b[^.]{0,80}\bbut\b/i, /\bit'?s not\b[^.]{1,60}[,;—–]\s*it'?s\b/i,
];
const SOFT = [
  /\bdeeply\b/i, /\bauthentic(?:ally|ity)?\b/, /\brobust\b/i, /\beclectic\b/i, /\bpivotal\b/i, /\bcrucial\b/i, /\bcritical\b/i,
  /\bkey (?!dates?\b)\w+/i, /\biconic\b/i, /\bstorytelling\b/i, /\bactivat(?:e|es|ed|ing|ion|ions)\b/i, /\bSKUs?\b/, /\bteam-marks\b/i,
  /\blandscape\b/i, /\bserves? as\b/i, /\bNike should\b/, /!/,
];
const HEADLINE_MAX = { lens: 90, strategy: 120, league: 140 };

function lint(t) {
  let data;
  try { data = readJSON(t.file); } catch (e) { return { fix: [`invalid JSON: ${e.message}`], notes: [], stats: null }; }
  const fix = [], notes = [];
  let sents = 0, wordsTotal = 0, long = 0;
  const kindOf = t.label.startsWith("league") ? "league" : t.label.endsWith("/strategy") ? "strategy" : "lens";
  walk(data, t.schema, (kind, at, key, value) => {
    if (kind !== "prose") return;
    if (at === "$.headline" && value.length > HEADLINE_MAX[kindOf] && !t.label.endsWith("factcheck") && !t.label.endsWith("critique")) {
      fix.push(`${at}: headline is ${value.length} characters (max ${HEADLINE_MAX[kindOf]})`);
    }
    for (const re of HARD) { const m = value.match(re); if (m) fix.push(`${at}: "${m[0]}"`); }
    for (const re of SOFT) { const m = value.match(re); if (m && !(re.source === "!" && /Rip City!/.test(value))) notes.push(`${at}: "${m[0]}"`); }
    const dashes = (value.match(/ — | – |—/g) || []).length;
    if (dashes > 1) notes.push(`${at}: ${dashes} em dashes`);
    const semis = (value.match(/;/g) || []).length;
    if (semis > 1) notes.push(`${at}: ${semis} semicolons`);
    const prose = words(value).length >= 15; // averages count paragraphs, not list items
    for (const s of sentences(value)) {
      const n = words(s).length;
      if (prose) { sents++; wordsTotal += n; }
      if (n > 45) fix.push(`${at}: ${n}-word sentence ("${s.slice(0, 60)}…")`);
      else if (n > 30) { long++; notes.push(`${at}: ${n}-word sentence`); }
      if ((s.match(/\(/g) || []).length > 1) notes.push(`${at}: ${(s.match(/\(/g) || []).length} brackets in one sentence`);
    }
  });
  return { fix, notes, stats: { sents, avg: sents ? wordsTotal / sents : 0, long } };
}

const list = targets(argv.filter((a) => !a.startsWith("--")).length ? argv.filter((a) => !a.startsWith("--")) : ["--all"]);
const byType = new Map();
let failing = 0;
for (const t of list) {
  const { fix, notes, stats } = lint(t);
  if (fix.length) failing++;
  if (stats) {
    const type = t.label.includes("/") ? t.label.split("/")[1] : t.label.replace(/-.*/, "");
    const agg = byType.get(type) || { files: 0, sents: 0, words: 0, long: 0, fix: 0, notes: 0 };
    agg.files++; agg.sents += stats.sents; agg.words += stats.avg * stats.sents; agg.long += stats.long; agg.fix += fix.length; agg.notes += notes.length;
    byType.set(type, agg);
  }
  if (SUMMARY || (QUIET && !fix.length)) continue;
  const avg = stats ? stats.avg.toFixed(1) : "?";
  console.log(`${fix.length ? "VOICE FIX" : "VOICE OK"} ${t.label} (avg ${avg} words a sentence, ${stats ? stats.long : 0} over 30)`);
  for (const f of fix.slice(0, 40)) console.log(`  FIX ${f}`);
  if (fix.length > 40) console.log(`  …and ${fix.length - 40} more to fix`);
  if (!QUIET) for (const n of notes.slice(0, 25)) console.log(`  note ${n}`);
  if (!QUIET && notes.length > 25) console.log(`  …and ${notes.length - 25} more notes`);
}
if (SUMMARY || list.length > 1) {
  console.log(`\n${"file".padEnd(18)} ${"avg words".padStart(9)} ${">30 words".padStart(9)} ${"fix".padStart(6)} ${"notes".padStart(6)}`);
  for (const [type, a] of byType) console.log(`${type.padEnd(18)} ${(a.words / Math.max(1, a.sents)).toFixed(1).padStart(9)} ${(a.long / Math.max(1, a.sents) * 100).toFixed(0).padStart(8)}% ${String(a.fix).padStart(6)} ${String(a.notes).padStart(6)}`);
  console.log(`\n${list.length - failing}/${list.length} files have nothing to fix.`);
}
process.exit(failing ? 1 : 0);
