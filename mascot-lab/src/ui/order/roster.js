// Mascot Lab — roster helpers (pure): new rows, number/size normalisation,
// validation, and the "Paste roster" parser.
//
// parseRoster(text) understands what coaches actually paste:
//   · "Name, Number, Size[, Bottom size]" lines
//   · CSV (quoted fields), TSV straight out of Google Sheets / Excel, semicolons
//   · a header row in any order ("Player", "#", "Jersey No.", "Shirt", "Shorts",
//     "First name" + "Last name"…) — when present, columns are mapped by header
//   · no header → each cell is classified: sizes look like sizes, numbers like
//     0–99/00, everything else is the name
//   · sizes written out ("Large", "XXL", "Youth Medium", "Adult XL", "x-large")
import { ALL_SIZES, PRODUCTS } from "../../order/catalog.js";
import { isBlankRow, rowIncludes } from "../../order/pricing.js";

let seq = 0;
/** newRowId() → a unique-enough row id ("r-…"). */
export function newRowId() {
  seq = (seq + 1) % 1e6;
  return `r-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/** blankRow(garmentIds) → an empty roster row with every garment checked. */
export function blankRow(garmentIds = Object.keys(PRODUCTS), patch = {}) {
  return {
    id: newRowId(),
    name: "",
    number: "",
    top: "",
    bottom: "",
    items: Object.fromEntries(garmentIds.map((g) => [g, true])),
    ...patch,
  };
}

/* ───────────────────────── numbers ───────────────────────── */

const NUMBER_RE = /^(?:0|00|[1-9]\d?)$/;

/** cleanNumber("#07 ") → "07" (strip #, "No.", spaces; keep digits only). */
export function cleanNumber(raw) {
  return String(raw ?? "").replace(/^(?:no\.?|#)\s*/i, "").replace(/\s+/g, "").replace(/[^0-9]/g, "").slice(0, 2);
}

/** isValidNumber("00") → true for 0–99 and 00 (no other leading zeros). */
export function isValidNumber(n) {
  return NUMBER_RE.test(String(n ?? ""));
}

/* ───────────────────────── sizes ───────────────────────── */

const SIZE_WORDS = {
  xxs: "XS", "2xs": "XS",
  xs: "XS", "x-small": "XS", xsmall: "XS", "extra small": "XS", "extra-small": "XS",
  s: "S", sm: "S", small: "S",
  m: "M", md: "M", med: "M", medium: "M",
  l: "L", lg: "L", large: "L",
  xl: "XL", "x-large": "XL", xlarge: "XL", "extra large": "XL", "extra-large": "XL",
  "2xl": "2XL", xxl: "2XL", "2x": "2XL", "xx-large": "2XL", xxlarge: "2XL", "2x-large": "2XL",
  "3xl": "3XL", xxxl: "3XL", "3x": "3XL", "xxx-large": "3XL", xxxlarge: "3XL", "3x-large": "3XL",
};

/** normalizeSize("Youth Medium" | "xxl" | "L") → catalog size ("YM", "2XL", "L") or null. */
export function normalizeSize(raw) {
  let s = String(raw ?? "").trim().toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\s/g, "");
  if (ALL_SIZES.includes(upper)) return upper;
  let youth = false;
  const y = /^(youth|yth|y|kids?)\s*-?\s*(.+)$/.exec(s);
  if (y && y[2]) { youth = true; s = y[2].trim(); }
  const a = /^(adult|adt|a|mens?|men's|unisex)\s*-?\s*(.+)$/.exec(s);
  if (!youth && a && a[2]) s = a[2].trim();
  const base = SIZE_WORDS[s] || SIZE_WORDS[s.replace(/\s/g, "")];
  if (!base) return null;
  if (!youth) return base;
  const ys = { S: "YS", M: "YM", L: "YL", XL: "YXL" }[base];
  return ys || null;
}

/** looksLikeSize(cell) → true if the cell is a recognizable size. */
const looksLikeSize = (c) => normalizeSize(c) != null;
const looksLikeNumber = (c) => /^(?:no\.?\s*|#\s*)?\d{1,2}$/i.test(String(c).trim());
/** size-shaped but maybe not in the catalog ("XLT", "LT", "4XL") — used to split loose lines. */
const sizeShaped = (c) => looksLikeSize(c) || /^(?:Y|A)?[0-9]?X{0,4}[SML]T?$/i.test(String(c).trim());

/* ───────────────────────── CSV / TSV splitting ───────────────────────── */

/** splitLine(line, delim) → cells, honouring "quoted, fields" and "" escapes. */
function splitLine(line, delim) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"' && cur.trim() === "") { q = true; cur = ""; }
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function pickDelimiter(lines) {
  const sample = lines.slice(0, 20).join("\n");
  if (sample.includes("\t")) return "\t";
  const count = (ch) => (sample.match(new RegExp(ch === "|" ? "\\|" : ch, "g")) || []).length;
  const scores = [",", ";", "|"].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : null;
}

/** "Carter 23 L" (no delimiter) → ["Carter", "23", "L"] by peeling sizes/numbers off the end. */
function splitLoose(line) {
  const words = line.trim().split(/\s+/);
  const tail = [];
  while (words.length > 1) {
    const w = words[words.length - 1];
    const prev = words[words.length - 2];
    // two-word sizes: "Adult XL", "Youth M"
    if (words.length > 2 && sizeShaped(w) && /^(youth|yth|adult|kids?|mens?|men's)$/i.test(prev) && looksLikeSize(`${prev} ${w}`)) {
      words.splice(-2, 2);
      tail.unshift(`${prev} ${w}`);
    } else if (sizeShaped(w) || looksLikeNumber(w)) tail.unshift(words.pop());
    else break;
  }
  // a leading number ("23 Carter L")
  const head = [];
  if (words.length > 1 && looksLikeNumber(words[0])) head.push(words.shift());
  return [...head, words.join(" "), ...tail];
}

/* ───────────────────────── header mapping ───────────────────────── */

const HEADER_TESTS = [
  ["first", /^(first( ?name)?|given( ?name)?|fname)$/],
  ["last", /^(last( ?name)?|surname|family( ?name)?|lname)$/],
  ["name", /^(name|player|player ?name|athlete|full ?name|names|lettering|back ?name|name on (jersey|back))$/],
  ["number", /^(#|no\.?|num(ber)?|jersey( ?(#|no\.?|num(ber)?))?|uniform( ?(#|no\.?|num(ber)?))?|player ?(#|no\.?|num(ber)?))$/],
  ["bottom", /^(bottoms?|bottom ?size|shorts?( ?size)?|pants?( ?size)?|waist)$/],
  ["top", /^(size|sizes|tops?|top ?size|shirt( ?size)?|jersey ?size|hoodie( ?size)?|tee( ?size)?|t-?shirt( ?size)?)$/],
];

function headerRole(cell) {
  const c = String(cell).trim().toLowerCase().replace(/[:*]/g, "").replace(/\s+/g, " ");
  for (const [role, re] of HEADER_TESTS) if (re.test(c)) return role;
  return null;
}

function mapHeader(cells) {
  const roles = cells.map(headerRole);
  const known = roles.filter(Boolean).length;
  // a header row: at least two recognized titles, and no cell that looks like a size/number value
  if (known >= 2 || (known >= 1 && cells.length === 1)) {
    if (cells.some((c, i) => !roles[i] && (looksLikeNumber(c)))) return null;
    return roles;
  }
  return null;
}

/* ───────────────────────── parse ───────────────────────── */

function rowFromCells(cells, roles) {
  const r = { name: "", number: "", top: "", bottom: "", raw: cells.join(" · "), issues: [] };
  if (roles) {
    let first = "", last = "";
    cells.forEach((c, i) => {
      const role = roles[i];
      if (!role || !c) return;
      if (role === "first") first = c;
      else if (role === "last") last = c;
      else if (role === "name") r.name = r.name ? `${r.name} ${c}` : c;
      else if (role === "number") r.number = c;
      else if (role === "top" && !r.top) r.top = c;
      else if (role === "bottom") r.bottom = c;
    });
    if (!r.name && (first || last)) r.name = [first, last].filter(Boolean).join(" ");
  } else {
    // classify each cell; the first non-size, non-number text cells form the name
    const names = [];
    const sizes = [];
    for (const c of cells) {
      if (!c) continue;
      if (!r.number && looksLikeNumber(c) && !(sizes.length === 0 && names.length === 0 && cells.length === 1)) r.number = c;
      else if (sizeShaped(c) && (names.length > 0 || r.number)) sizes.push(c);
      else names.push(c);
    }
    r.name = names.join(" ");
    r.top = sizes[0] || "";
    r.bottom = sizes[1] || "";
  }
  // normalise
  const rawNumber = r.number;
  r.number = cleanNumber(r.number);
  if (rawNumber && !r.number) r.issues.push(`"${rawNumber}" isn't a number`);
  else if (r.number && !isValidNumber(r.number)) r.issues.push(`#${r.number} isn't 0–99 or 00`);
  const topRaw = r.top, bottomRaw = r.bottom;
  r.top = normalizeSize(topRaw) || "";
  r.bottom = normalizeSize(bottomRaw) || "";
  if (topRaw && !r.top) r.issues.push(`Unknown size "${topRaw}"`);
  if (bottomRaw && !r.bottom) r.issues.push(`Unknown size "${bottomRaw}"`);
  if (r.top && !bottomRaw) { r.bottom = r.top; r.bottomFromTop = true; }
  r.name = r.name.replace(/\s+/g, " ").trim();
  // "Carter, Jamal" (a quoted spreadsheet cell) → "Jamal Carter", so lettering uses the surname
  const lf = /^([^,]+),\s*([^,]+)$/.exec(r.name);
  if (lf) r.name = `${lf[2].trim()} ${lf[1].trim()}`;
  r.name = r.name.slice(0, 40);
  return r;
}

/**
 * parseRoster(text) → { rows: [{ name, number, top, bottom, raw, issues[], bottomFromTop? }],
 *   header: string[] | null, skipped: number }.
 * Blank lines and lines with nothing usable are skipped (counted).
 */
export function parseRoster(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return { rows: [], header: null, skipped: 0 };
  const delim = pickDelimiter(lines);
  // a line without the paste's delimiter ("Theo Nguyen 4 S" among CSV lines) is split loosely
  const split = (l) => (delim && l.includes(delim) ? splitLine(l, delim) : splitLoose(l));
  let roles = mapHeader(split(lines[0]));
  const header = roles ? split(lines[0]) : null;
  const body = roles ? lines.slice(1) : lines;
  if (roles && !roles.some((r) => r === "name" || r === "first" || r === "last" || r === "number")) roles = null;
  const rows = [];
  let skipped = 0;
  for (const line of body) {
    const cells = split(line);
    if (!cells.some((c) => c)) { skipped++; continue; }
    const r = rowFromCells(cells, roles);
    if (!r.name && !r.number && !r.top) { skipped++; continue; }
    rows.push(r);
  }
  return { rows, header, skipped };
}

/** parsedToRows(parsed.rows, garmentIds) → roster rows ready for setRoster. */
export function parsedToRows(parsedRows, garmentIds) {
  return parsedRows.map((p) => blankRow(garmentIds, { name: p.name, number: p.number, top: p.top, bottom: p.bottom }));
}

/* ───────────────────────── validation ───────────────────────── */

/**
 * rosterIssues(roster, garmentIds, { numbersMatter }) → {
 *   byRow: { [rowId]: { name?, number?, top?, bottom? } }  // "missing" | "invalid" | "duplicate"
 *   duplicates: { [number]: rowId[] },
 *   counts: { invalid, duplicate, missingTop, missingBottom, missingName, missingNumber },
 * }
 * Sizes are only required when the row includes a garment of that fit; numbers are
 * flagged "missing" only when numbersMatter (a garment carries numbers).
 */
export function rosterIssues(roster, garmentIds = [], { numbersMatter = true } = {}) {
  const byRow = {};
  const counts = { invalid: 0, duplicate: 0, missingTop: 0, missingBottom: 0, missingName: 0, missingNumber: 0 };
  const seen = new Map();
  const rows = (roster || []).filter((r) => !isBlankRow(r));
  for (const r of rows) {
    const n = String(r.number ?? "").trim();
    if (n && isValidNumber(n)) {
      if (!seen.has(n)) seen.set(n, []);
      seen.get(n).push(r.id);
    }
  }
  const duplicates = {};
  for (const [n, ids] of seen) if (ids.length > 1) duplicates[n] = ids;
  for (const r of rows) {
    const issues = {};
    const n = String(r.number ?? "").trim();
    const fits = new Set(garmentIds.filter((g) => rowIncludes(r, g)).map((g) => PRODUCTS[g]?.fit));
    if (!String(r.name ?? "").trim()) { issues.name = "missing"; counts.missingName++; }
    if (!n) { if (numbersMatter) { issues.number = "missing"; counts.missingNumber++; } }
    else if (!isValidNumber(n)) { issues.number = "invalid"; counts.invalid++; }
    else if (duplicates[n]) { issues.number = "duplicate"; counts.duplicate++; }
    if (fits.has("top") && !ALL_SIZES.includes(r.top)) { issues.top = "missing"; counts.missingTop++; }
    if (fits.has("bottom") && !ALL_SIZES.includes(r.bottom)) { issues.bottom = "missing"; counts.missingBottom++; }
    if (Object.keys(issues).length) byRow[r.id] = issues;
  }
  return { byRow, duplicates, counts };
}

/** sortRoster(rows) → by number (00 before 0, then numeric), blank numbers last. Stable. */
export function sortRoster(rows) {
  const key = (r) => {
    const n = String(r.number ?? "").trim();
    if (!n) return 1000;
    if (n === "00") return -1;
    const v = Number(n);
    return Number.isFinite(v) ? v : 999;
  };
  return rows.map((r, i) => [r, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(([r]) => r);
}
