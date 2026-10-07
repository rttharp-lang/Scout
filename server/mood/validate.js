// Input validation for the Scout Mood handlers. Everything arriving from the
// browser is untrusted: clamp lengths and counts, coerce types, and reject
// anything that would make an upstream call unbounded.
import { MoodError } from "./claude.js";

export const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const int = (v, lo, hi, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
export const strList = (v, maxItems, maxLen) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);

// JSON bodies only. A cross-site page can send text/plain or form bodies
// without a CORS preflight; requiring application/json forces one, and this
// API never answers preflights with CORS headers — so other sites can't spend
// its Claude or image-API quota from their visitors' browsers.
export function body(req) {
  if (req.method !== "POST") throw new MoodError(405, "method-not-allowed");
  if (!/^application\/json\b/i.test(String(req.headers?.["content-type"] || ""))) throw new MoodError(415, "json-required");
  const b = req.body;
  if (b && typeof b === "object" && !Array.isArray(b)) return b;
  throw new MoodError(400, "no-body");
}

// Browsers label every request with Sec-Fetch-Site; refuse other sites' pages.
// (Non-browser clients can omit it — rate limiting belongs at the edge; see
// docs/scout-mood.md.)
export function crossSite(req) {
  const site = String(req.headers?.["sec-fetch-site"] || "");
  return Boolean(site) && site !== "same-origin" && site !== "none";
}
