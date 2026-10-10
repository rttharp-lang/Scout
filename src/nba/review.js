// The review model, shared by the build script and every page, so a date, a
// score or an evidence label means the same thing everywhere on the site.
//
//   Timing    each calendar entry has a real year, a kind (event, action,
//             launch, season), a certainty and an optional act-by month.
//   Evidence  four types: verified fact, interpretation, product hypothesis,
//             unverified claim. Insights and opportunities carry an evidence
//             strength computed from the live-checked claims behind them.
//   Scores    editorial estimates shown as broad tiers, never as measurements.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

// ── Timing ─────────────────────────────────────────────────────────
// A planning season runs October to September: Oct 2026–Sep 2027 is 2026-27.
export const SEASON_START = 10;
export const seasonOf = (date) => {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return m >= SEASON_START ? `${y}-${pad((y + 1) % 100)}` : `${y - 1}-${pad(y % 100)}`;
};
// The twelve YYYY-MM keys of a season, October first.
export const seasonMonths = (season) => {
  const y = Number(season.slice(0, 4));
  return [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => `${m >= SEASON_START ? y : y + 1}-${pad(m)}`);
};
export const ymOf = (date) => (date || "").slice(0, 7);
export const ymLabel = (ym, long = false) => `${(long ? MONTHS_LONG : MONTHS)[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function today(d = new Date()) {
  const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return { ym, month: d.getMonth() + 1, year: d.getFullYear(), season: seasonOf(ym), date: `${ym}-${pad(d.getDate())}` };
}
export const nextYM = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; };

// Does a timed entry run during the month ym?
export const runsIn = (t, ym) => !!t && ymOf(t.start) <= ym && ym <= ymOf(t.end || t.start);
// Has it finished before the month ym?
export const endedBefore = (t, ym) => !!t && ymOf(t.end || t.start) < ym;

// "Oct 20, 2026", "Oct 2026", "Oct 30 – Nov 27, 2026"
export function fmtDate(date) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return d ? `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}` : `${MONTHS[Number(m) - 1]} ${y}`;
}
export function fmtSpan(t) {
  if (!t) return "";
  if (!t.end || t.end === t.start) return fmtDate(t.start);
  const [y1, m1, d1] = t.start.split("-"), [y2, m2, d2] = t.end.split("-");
  const a = d1 ? `${MONTHS[Number(m1) - 1]} ${Number(d1)}` : MONTHS[Number(m1) - 1];
  const b = d2 ? `${MONTHS[Number(m2) - 1]} ${Number(d2)}` : MONTHS[Number(m2) - 1];
  return y1 === y2 ? `${a} – ${b}, ${y1}` : `${a}, ${y1} – ${b}, ${y2}`;
}

export const KIND_LABEL = { event: "Event", action: "Action window", launch: "Launch", season: "Season" };
export const CERTAINTY_LABEL = { confirmed: "Date confirmed", tentative: "Date tentative", unknown: "Date unknown" };
export const ROUTE_LABEL = {
  "existing-inventory": "Existing inventory",
  "quick-turn-graphics": "Quick-turn graphics",
  "new-development": "New development",
  "future-uniform": "Future uniform concept",
  "no-product": "No product",
};

// Fallback when a market has no reviewed plan: give each calendar entry a year
// from the brief's own order (it runs forward from October 2026), or from a
// year written in the window. Certainty stays "unknown" and the entry is
// flagged unreviewed, so nothing looks more certain than it is.
export function inferTiming(calendar, startYear = 2026) {
  let y = startYear, prev = null;
  return calendar.map((c) => {
    if (prev != null && c.month < prev) y++;
    prev = c.month;
    const text = `${c.window} ${c.moment}`;
    const season = /\b(20\d\d)-(\d\d)\b/.exec(text);
    const year = /\b(20\d\d)\b/.exec(text);
    let yr = y;
    if (season) yr = c.month >= SEASON_START ? Number(season[1]) : Number(season[1]) + 1;
    else if (year) yr = Number(year[1]);
    return { kind: "event", start: `${yr}-${pad(c.month)}`, end: "", recurring: false, certainty: "unknown", basis: "none", basisNote: "", actBy: "", actNote: "", route: "no-product", targetSeason: "", dependencies: ["date-confirmation"], reviewed: false };
  });
}

// ── Evidence ───────────────────────────────────────────────────────
export const EVIDENCE_KIND = {
  fact: { label: "Verified fact", detail: "Stated by a dated source that a live search returned on the date shown." },
  interpretation: { label: "Interpretation", detail: "An analytical read drawn from the research. It can be well or poorly supported; see its evidence strength." },
  hypothesis: { label: "Product hypothesis", detail: "An idea that still needs consumer, commercial and operational testing." },
  unverified: { label: "Unverified claim", detail: "Written from desk research or model knowledge and not yet checked against a live source." },
};

// Evidence strength is about how well-supported a read is, never about how big
// the opportunity is. Agent agreement and agent confidence don't count.
export const STRENGTH = {
  sourced: { label: "Sourced", detail: "Two or more supporting facts checked against live sources." },
  partial: { label: "Partly sourced", detail: "One supporting fact checked against a live source." },
  unchecked: { label: "Not yet checked", detail: "Desk research only. No supporting fact has been checked live yet." },
};
export const strengthOf = (verified) => (verified >= 2 ? "sourced" : verified === 1 ? "partial" : "unchecked");
export const STRENGTH_RANK = { sourced: 0, partial: 1, unchecked: 2 };

// ── Scores ─────────────────────────────────────────────────────────
// The four market scores were set by the league calibration agent from the 30
// briefs (Oct 9, 2026). They are editorial estimates on a 0-100 scale where 50
// is an average market among the 30, so the site shows them as tiers.
export const SCORE_TIERS = [
  { min: 75, label: "Top tier", bars: 5 },
  { min: 60, label: "Above average", bars: 4 },
  { min: 41, label: "Average", bars: 3 },
  { min: 26, label: "Below average", bars: 2 },
  { min: 0, label: "Bottom tier", bars: 1 },
];
export const tierOf = (v) => SCORE_TIERS.find((t) => (Number(v) || 0) >= t.min);

export const SCORE_DEFS = {
  opportunity: {
    label: "Opportunity",
    what: "How much room there is for new local product this season and next: open stories, empty uniform slots, timing and demand signals.",
    inputs: "The market brief's insights, calendar and retail read, weighed across all 30 briefs.",
    kind: "Editorial estimate",
    baseline: "League-calibrated. 50 is an average market among the 30.",
    updated: "Oct 9, 2026 (league calibration)",
  },
  fandom: {
    label: "Fandom",
    what: "How intense and loyal the team's following is, as described in the research.",
    inputs: "The fan base and fan rhythm dossiers and the strategist's read of the 2026 offseason. No attendance, ratings or survey data.",
    kind: "Editorial estimate",
    baseline: "League-calibrated. 50 is an average market among the 30.",
    updated: "Oct 9, 2026 (league calibration)",
  },
  culture: {
    label: "Culture",
    what: "How much distinct local culture there is to design from: music, art, food, hoops and street style.",
    inputs: "The six city dossiers.",
    kind: "Editorial estimate",
    baseline: "League-calibrated. 50 is an average market among the 30.",
    updated: "Oct 9, 2026 (league calibration)",
  },
  retail: {
    label: "Retail",
    what: "How ready the market's stores and shopping habits are for local product.",
    inputs: "The retail landscape and shopping behavior dossiers. Store lists are largely unverified, and no sales data was used.",
    kind: "Editorial estimate",
    baseline: "League-calibrated. 50 is an average market among the 30.",
    updated: "Oct 9, 2026 (league calibration)",
  },
  heat: {
    label: "Fan mood",
    what: "How warm the fan base felt heading into 2026-27.",
    inputs: "The market strategist's read of the offseason, from the verified 2026-27 team facts and the fan base dossier.",
    kind: "Editorial estimate, not measured",
    baseline: "Local only: not calibrated across markets.",
    updated: "Oct 2026 (market brief)",
  },
  rhythm: {
    label: "Fan heat by month",
    what: "How engaged the fan base is in each month of the year, relative to its own busiest month.",
    inputs: "The fan rhythm dossier: schedule, weather, local calendar and shopping habits.",
    kind: "Editorial estimate, not measured",
    baseline: "Each city's own peak month is 100. A 90 in one city and a 90 in another are not the same size.",
    updated: "Oct 2026 (fan rhythm dossier)",
  },
};
export const MOOD_TIERS = [
  { min: 80, label: "Hot" },
  { min: 65, label: "Warm" },
  { min: 50, label: "Steady" },
  { min: 0, label: "Cool" },
];
export const moodOf = (v) => MOOD_TIERS.find((t) => (Number(v) || 0) >= t.min);
