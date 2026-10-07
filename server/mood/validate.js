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

// Vercel parses JSON bodies for us; a raw string body (e.g. a client that
// forgot the content-type) is parsed here as a fallback.
export function body(req) {
  if (req.method !== "POST") throw new MoodError(405, "method-not-allowed");
  const b = req.body;
  if (b && typeof b === "object") return b;
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch { throw new MoodError(400, "bad-json"); }
  }
  throw new MoodError(400, "no-body");
}
