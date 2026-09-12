// Polite public-web fetcher: robots.txt respect, per-host rate limits, timeout,
// size cap, cache, no auth/paywall bypass, plain-text extraction. Every result
// records access limitations so the evidence contract can carry them.
import { one, run, now } from "../../db.js";

const UA = process.env.LOCAL_FETCH_USER_AGENT || "LOCAL-research/0.1 (research tool; respects robots.txt)";
const PER_MIN = Number(process.env.LOCAL_FETCH_MAX_PER_HOST_PER_MIN || 20);
const hostWindow = new Map(); // host -> timestamps
const robotsCache = new Map(); // host -> {disallow: [], fetchedAt}

function rateOk(host) {
  const t = Date.now();
  const arr = (hostWindow.get(host) || []).filter((x) => t - x < 60_000);
  if (arr.length >= PER_MIN) return false;
  arr.push(t); hostWindow.set(host, arr); return true;
}
async function robotsAllows(url) {
  const u = new URL(url);
  let r = robotsCache.get(u.host);
  if (!r || Date.now() - r.fetchedAt > 6 * 3600e3) {
    r = { disallow: [], fetchedAt: Date.now() };
    try {
      const res = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const text = await res.text();
        let applies = false;
        for (const raw of text.split("\n")) {
          const line = raw.split("#")[0].trim();
          const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
          if (!m) continue;
          const [, k, v] = m;
          if (k.toLowerCase() === "user-agent") applies = v.trim() === "*" || UA.toLowerCase().includes(v.trim().toLowerCase());
          else if (applies && k.toLowerCase() === "disallow" && v.trim()) r.disallow.push(v.trim());
        }
      }
    } catch { /* unreachable robots => allow but record */ }
    robotsCache.set(u.host, r);
  }
  return !r.disallow.some((p) => u.pathname.startsWith(p.replace(/\*$/, "")));
}

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h\d|li|br|tr|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
export function extractTitle(html) { const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i); return m ? htmlToText(m[1]).slice(0, 200) : null; }
export function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = String(html).match(re); return m ? m[1] : null;
}

// Returns {ok, status, url, body, contentType, retrievedAt, fromCache, limitation}
export async function fetchPublic(url, { maxBytes = 1_500_000, ttlHours = 12, signal } = {}) {
  const cached = one("SELECT * FROM fetch_cache WHERE url=?", [url]);
  if (cached && Date.now() - Date.parse(cached.fetched_at) < ttlHours * 3600e3) {
    return { ok: cached.status >= 200 && cached.status < 300, status: cached.status, url, contentType: cached.content_type, body: cached.body, retrievedAt: cached.fetched_at, fromCache: true };
  }
  const host = new URL(url).host;
  if (!(await robotsAllows(url))) return { ok: false, status: 0, url, limitation: "disallowed_by_robots", retrievedAt: now() };
  if (!rateOk(host)) return { ok: false, status: 0, url, limitation: "rate_limited_locally", retryable: true, retrievedAt: now() };
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9,*/*;q=0.5" }, redirect: "follow", signal: signal || AbortSignal.timeout(20000) });
    const contentType = res.headers.get("content-type") || "";
    let body = "";
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      body = buf.subarray(0, maxBytes).toString("utf8");
    }
    const viaProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
    const limitation = res.status === 401 ? "access_restricted" : res.status === 403 ? (viaProxy ? "egress_blocked" : "access_restricted") : res.status === 402 ? "paywalled" : res.status === 429 ? "rate_limited_by_host" : null;
    run("INSERT OR REPLACE INTO fetch_cache(url,status,content_type,body,fetched_at) VALUES(?,?,?,?,?)", [url, res.status, contentType, body, now()]);
    return { ok: res.ok, status: res.status, url: res.url || url, contentType, body, retrievedAt: now(), fromCache: false, limitation };
  } catch (e) {
    const msg = String(e?.cause?.message || e.message || e);
    return { ok: false, status: 0, url, limitation: /403|407|CONNECT/.test(msg) ? "egress_blocked" : "network_error", error: msg, retrievedAt: now(), retryable: true };
  }
}

export function parseRss(xml) {
  const items = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi; let m;
  const pick = (s, tag) => { const r = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return r ? htmlToText(r[1].replace(/<!\[CDATA\[|\]\]>/g, "")) : null; };
  const linkOf = (s) => { const a = s.match(/<link[^>]*href=["']([^"']+)["']/i); if (a) return a[1]; const b = s.match(/<link>([\s\S]*?)<\/link>/i); return b ? b[1].trim() : null; };
  while ((m = re.exec(xml))) {
    const s = m[0];
    items.push({ title: pick(s, "title"), link: linkOf(s), published: pick(s, "pubDate") || pick(s, "published") || pick(s, "updated") || pick(s, "dc:date"), summary: pick(s, "description") || pick(s, "summary") || pick(s, "content") });
  }
  return items;
}
