// Short forms for the calendar: a headline for each moment and a compact date,
// so a month reads at a glance. The full title and play stay in the city brief.
import { MONTHS } from "./data.js";

// Sentence ends, skipping abbreviations like "vs." and "p.m.". (No regex
// lookbehind: older iOS Safari can't parse it.)
const ABBR = /(?:^|\s)(?:vs|st|no|mt|ft|dr|jr|sr|[a-z])$/i;
function sentenceEnd(s, from) {
  const re = /\. (?=[A-Z0-9'"])/g;
  re.lastIndex = from;
  for (let m; (m = re.exec(s)); ) if (!ABBR.test(s.slice(0, m.index))) return m.index;
  return -1;
}

// Where to cut a long title, in order of preference, and the shortest lead each may leave.
const SPLITS = [
  [/ (?:with|as|plus|after|during|ahead of|while|once|including|into) /, 12],
  [/, then |; | — | – |, /, 12],
  [/: /, 6],
  [/ and /, 16],
];

// "MLK Day: Pistons at Cavaliers on NBC/Peacock, a 2026 East semifinal rematch"
// → "MLK Day: Pistons at Cavaliers on NBC/Peacock"
export function headline(title = "") {
  let s = title.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (s.length > 50) { const e = sentenceEnd(s, 12); if (e >= 0) s = s.slice(0, e); }
  for (const [re, min] of SPLITS) {
    if (s.length <= 50) break;
    const i = s.slice(min).search(re);
    if (i >= 0) s = s.slice(0, i + min);
  }
  s = s.replace(/[\s,;:.\-–—]+$/, "");
  if (s.length > 56) s = s.slice(0, 54).replace(/\s+\S*$/, "").replace(/[\s,;:\-–—]+$/, "") + "…";
  return s;
}

const md = (iso) => { const [, m, d] = iso.split("-"); return `${MONTHS[Number(m) - 1]} ${Number(d)}`; };
const mon = (iso) => MONTHS[Number(iso.split("-")[1]) - 1];

// "Oct 21", "Oct 21–30", "Oct 30–Nov 27", "All month", "Jul–Aug", or "" when
// only the month is known (the month heading already says it).
export function whenShort(t) {
  if (!t || !t.start) return "";
  const s = t.start, e = t.end && t.end !== t.start ? t.end : "";
  const sDay = s.length === 10, eDay = e.length === 10;
  if (sDay) {
    if (!e) return md(s);
    if (eDay) return s.slice(0, 7) === e.slice(0, 7) ? `${md(s)}–${Number(e.slice(8))}` : `${md(s)}–${md(e)}`;
    return `${md(s)}–${mon(e)}`;
  }
  if (eDay && t.kind === "event") return md(e);
  if (e && e.slice(0, 7) !== s.slice(0, 7)) return `${mon(s)}–${mon(e)}`;
  return t.kind === "season" ? "All month" : "";
}
