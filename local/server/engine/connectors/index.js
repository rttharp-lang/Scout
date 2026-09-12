// Modular connector layer. Each connector declares its access state honestly;
// a platform is only shown "connected" after a verified check. Fallbacks are
// open-web evidence and manual uploads.
import { fetchPublic, parseRss, htmlToText, extractTitle, extractMeta } from "./fetcher.js";
import { q, run, now, J, rows } from "../../db.js";

const has = (k) => Boolean(process.env[k]);

export const CONNECTORS = [
  { id: "web", name: "Open web (public pages)", kind: "web", check: async () => {
      const r = await fetchPublic("https://www.nba.com/robots.txt", { ttlHours: 1 });
      if (r.ok) return { state: "connected", detail: "Public fetch succeeded; robots.txt and rate limits respected. No paywall or login bypass." };
      return { state: r.limitation === "egress_blocked" ? "unavailable" : "failed", detail: `Outbound fetch failed (${r.limitation || r.status}). Live source retrieval is not possible from this host.` };
    }, capabilities: { search: false, fetch: true, fields: ["title", "text", "published_at(meta)"], commercial_use: "per-site terms" } },
  { id: "rss", name: "RSS / Atom feeds (local media, podcasts)", kind: "feed", check: async () => {
      const r = await fetchPublic("https://www.nba.com/robots.txt", { ttlHours: 1 });
      return r.ok ? { state: "connected", detail: "Feed parsing available; feed URLs are configured per team source map." } : { state: "unavailable", detail: "Depends on outbound web access." };
    }, capabilities: { fields: ["title", "link", "published", "summary"] } },
  { id: "nba_schedule", name: "NBA official schedule (cdn.nba.com)", kind: "league", check: async () => {
      const r = await fetchPublic("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", { ttlHours: 6 });
      return r.ok ? { state: "connected", detail: "League schedule JSON reachable." } : { state: r.limitation === "egress_blocked" ? "unavailable" : "failed", detail: `Schedule endpoint unreachable (${r.limitation || r.status}).` };
    }, capabilities: { fields: ["games", "dates", "arena", "broadcast"], note: "Verify terms of use before commercial redistribution." } },
  { id: "wnba_schedule", name: "WNBA official schedule", kind: "league", check: async () => {
      const r = await fetchPublic("https://www.wnba.com/schedule", { ttlHours: 6 });
      return r.ok ? { state: "limited", detail: "Schedule page reachable; structured JSON endpoint must be confirmed per season." } : { state: r.limitation === "egress_blocked" ? "unavailable" : "failed", detail: `Unreachable (${r.limitation || r.status}).` };
    }, capabilities: { fields: ["games", "dates"] } },
  { id: "wikipedia", name: "Wikipedia / Wikimedia (history, uniforms, arenas)", kind: "reference", check: async () => {
      const r = await fetchPublic("https://en.wikipedia.org/api/rest_v1/page/summary/Chicago_Bulls", { ttlHours: 6 });
      return r.ok ? { state: "connected", detail: "REST summary API reachable. CC BY-SA content; cite and attribute." } : { state: r.limitation === "egress_blocked" ? "unavailable" : "failed", detail: `Unreachable (${r.limitation || r.status}).` };
    }, capabilities: { fields: ["summary", "extract", "history sections"], license: "CC BY-SA 4.0" } },
  { id: "reddit", name: "Reddit (team subreddits)", kind: "social", check: async () => {
      if (!has("REDDIT_CLIENT_ID") || !has("REDDIT_CLIENT_SECRET")) return { state: "credentials_required", detail: "Reddit Data API requires an approved app and terms acceptance; unauthenticated JSON is not used for automated collection." };
      return { state: "limited", detail: "Credentials present; OAuth flow and quota must be verified against current Reddit Data API terms." };
    }, capabilities: { fields: ["posts", "comments", "scores(at collection time)"], locality: "subreddit membership is not proof of residence" } },
  { id: "youtube", name: "YouTube Data API (video metadata, transcripts when permitted)", kind: "video", check: async () => has("YOUTUBE_API_KEY")
      ? { state: "limited", detail: "API key present; quota and terms to verify." } : { state: "credentials_required", detail: "Set YOUTUBE_API_KEY. Transcripts only where captions are public and terms permit." },
    capabilities: { fields: ["title", "views(at collection)", "published", "channel"] } },
  { id: "x", name: "X (Twitter)", kind: "social", check: async () => ({ state: "credentials_required", detail: "Requires paid API access with explicit commercial terms; not configured." }), capabilities: {} },
  { id: "tiktok", name: "TikTok", kind: "social", check: async () => ({ state: "unavailable", detail: "No approved research/commercial API access configured; automated collection not attempted." }), capabilities: {} },
  { id: "instagram", name: "Instagram", kind: "social", check: async () => ({ state: "unavailable", detail: "Graph API access limited to owned accounts; public listening requires a licensed provider." }), capabilities: {} },
  { id: "listening", name: "Licensed social listening provider", kind: "social", check: async () => ({ state: "credentials_required", detail: "Evaluate providers against NBA/WNBA coverage, historic depth, locality signals, exports, licensing, and cost before integrating. None connected." }), capabilities: {} },
  { id: "upload", name: "Uploaded research (interviews, fan council notes, decks, first-party analytics)", kind: "internal", check: async () => ({ state: "connected", detail: "Manual uploads with provenance, permissions, and retention metadata." }), capabilities: { fields: ["text", "provenance", "consent", "retention"] } },
];

export async function checkConnectors() {
  const out = [];
  for (const c of CONNECTORS) {
    let r;
    try { r = await c.check(); } catch (e) { r = { state: "failed", detail: String(e.message || e) }; }
    run("INSERT OR REPLACE INTO connectors(id,name,kind,state,detail,capabilities,last_checked_at,last_error) VALUES(?,?,?,?,?,?,?,?)",
      [c.id, c.name, c.kind, r.state, r.detail, J(c.capabilities || {}), now(), r.state === "failed" ? r.detail : null]);
    out.push({ id: c.id, ...r });
  }
  return out;
}
export function listConnectors() { return rows(q("SELECT * FROM connectors ORDER BY name")); }
export function connectorState(id) { return listConnectors().find((c) => c.id === id)?.state || "unavailable"; }

// Fetch helpers used by specialists -----------------------------------------
export async function fetchArticle(url) {
  const r = await fetchPublic(url);
  if (!r.ok) return { ok: false, url, limitation: r.limitation || `http_${r.status}`, retrievedAt: r.retrievedAt };
  const isJson = /json/.test(r.contentType);
  const html = r.body;
  return { ok: true, url: r.url, title: isJson ? null : extractTitle(html), text: isJson ? html.slice(0, 20000) : htmlToText(html).slice(0, 20000),
    published_at: isJson ? null : (extractMeta(html, "article:published_time") || extractMeta(html, "datePublished") || null),
    author: isJson ? null : extractMeta(html, "author"), site: extractMeta(html, "og:site_name"), retrievedAt: r.retrievedAt, contentType: r.contentType };
}
export async function fetchFeed(url) {
  const r = await fetchPublic(url);
  if (!r.ok) return { ok: false, url, limitation: r.limitation || `http_${r.status}` };
  return { ok: true, url, items: parseRss(r.body), retrievedAt: r.retrievedAt };
}
export async function fetchWikipediaSummary(title) {
  const r = await fetchPublic(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!r.ok) return { ok: false, limitation: r.limitation || `http_${r.status}` };
  try { const j = JSON.parse(r.body); return { ok: true, title: j.title, extract: j.extract, url: j.content_urls?.desktop?.page, retrievedAt: r.retrievedAt }; } catch { return { ok: false, limitation: "parse_error" }; }
}
export async function fetchNbaSchedule(teamTricode) {
  const r = await fetchPublic("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", { ttlHours: 6 });
  if (!r.ok) return { ok: false, limitation: r.limitation || `http_${r.status}` };
  try {
    const j = JSON.parse(r.body);
    const games = [];
    for (const d of j.leagueSchedule?.gameDates || []) for (const g of d.games || []) {
      if (!teamTricode || g.homeTeam?.teamTricode === teamTricode || g.awayTeam?.teamTricode === teamTricode)
        games.push({ id: g.gameId, date: g.gameDateTimeUTC || g.gameDateUTC, home: g.homeTeam?.teamTricode, away: g.awayTeam?.teamTricode, arena: g.arenaName, city: g.arenaCity, label: g.gameLabel || g.gameSubLabel || null, status: g.gameStatusText });
    }
    return { ok: true, games, retrievedAt: r.retrievedAt, season: j.leagueSchedule?.seasonYear };
  } catch { return { ok: false, limitation: "parse_error" }; }
}
