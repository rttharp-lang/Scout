// Data access for NBA Fandom. The overview + calendar read the small summary
// index; each market's full dossier set is a separate JSON chunk loaded on
// demand. A live agent run (see live.js) is kept per market in localStorage
// and can be shown in place of the published research.
import summaryData from "./data/summary.json";
import { TEAMS, TEAM_BY_ID } from "./teams.js";

const marketLoaders = import.meta.glob("./data/markets/*.json");
const leagueModule = import.meta.glob("./data/league.json", { eager: true });
const reviewModule = import.meta.glob("./data/review.json", { eager: true });

export const league = Object.values(leagueModule)[0]?.default || null;
// What was checked live, what was corrected, and when (scripts/nba/assemble.mjs).
export const review = Object.values(reviewModule)[0]?.default || { corrections: [], totals: {}, pulse: {}, leagueCalendar: null };
// The league this edition covers. The data carries a league id so a WNBA
// edition, with its own segments and calendar, can sit beside it later.
export const LEAGUE = { id: "nba", name: "NBA", season: "2026-27" };

// Summary rows joined to static team identity, in registry order.
const SUMMARY_BY_ID = Object.fromEntries(summaryData.map((s) => [s.id, s]));
export const markets = TEAMS.map((t) => ({ team: t, ...(SUMMARY_BY_ID[t.id] || { id: t.id, status: "pending" }) }));
export const publishedCount = markets.filter((m) => m.status === "complete").length;

export async function loadMarket(id) {
  const load = marketLoaders[`./data/markets/${id}.json`];
  if (!load) return null;
  const mod = await load();
  return mod.default;
}

export const teamById = (id) => TEAM_BY_ID[id];

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// The NBA year reads October → September (season tip-off first).
export const SEASON_ORDER = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const currentMonth = () => new Date().getMonth() + 1;
export { today, seasonOf, seasonMonths, runsIn, endedBefore, ymLabel, nextYM } from "./review.js";

// Text color that clears contrast on a given background hex.
export function inkOn(hex) {
  const h = (hex || "#000000").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? "#0A0A0A" : "#FFFFFF";
}

// A team's hero color: the first palette color that isn't near-white/near-black-on-black-site.
export function heroColor(team) {
  const c = team.colors.find((x) => !/^#(FFFFFF|F[0-9A-F]F[0-9A-F]F[0-9A-F])$/i.test(x)) || team.colors[0];
  return c;
}

// Live runs (per market) persisted in this browser only. They are experiments:
// never shared with teammates and never part of the reviewed build.
const LIVE_KEY = (id) => `homecourt.live.${id}`;
export function loadLiveRun(id) {
  try { const raw = localStorage.getItem(LIVE_KEY(id)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveLiveRun(id, run) {
  try { localStorage.setItem(LIVE_KEY(id), JSON.stringify(run)); } catch {}
}
export function clearLiveRun(id) {
  try { localStorage.removeItem(LIVE_KEY(id)); } catch {}
}
