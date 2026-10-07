// Client for the Scout Mood functions + the board-generation pipeline.
// Keys never reach the browser: everything goes through /api/mood/*.

export class ApiError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function post(path, body, signal) {
  let r;
  try {
    r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError(0, "network", String(e?.message || e));
  }
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new ApiError(r.status, data?.error || `http-${r.status}`, data?.detail);
  return data;
}

// Human copy for the error codes the functions return.
export function explainError(e) {
  const code = e?.code || "";
  if (code === "ai-not-configured") return "The AI curator isn't configured on this deployment yet (ANTHROPIC_API_KEY).";
  if (code === "ai-rate-limited") return "The curator is busy right now — give it a few seconds and try again.";
  if (code === "ai-timeout" || e?.status === 504) return "That took too long to curate. Try again — a tighter direction also helps.";
  if (code === "refused") return "The curator declined this direction. Try rephrasing it.";
  if (code === "network") return "Couldn't reach Scout Mood — check your connection.";
  if (code === "no-direction") return "Describe the creative direction first.";
  if (code === "sources-unavailable") return "The image sources didn't respond (rate limits are the usual cause). Try again in a minute.";
  if (code === "no-queries") return "There's nothing to search for with this image — try another one.";
  if (code === "cross-site" || code === "json-required") return "This request was blocked by Scout Mood's security checks. Reload the page and try again.";
  return "Something went wrong curating this. Try again.";
}

export const fetchBrief = (input, refine, signal) =>
  post("/api/mood/brief", { ...input, refine: refine || undefined }, signal).then((d) => d.brief);

export const searchImages = (queries, { page = 1, perQuery = 8 } = {}, signal) =>
  post("/api/mood/search", { queries, page, perQuery }, signal);

export const curateImages = (payload, signal) => post("/api/mood/curate", payload, signal);

// What the source itself says an image is (used before every approval).
export const resolveImages = (ids, signal) => post("/api/mood/resolve", { ids }, signal).then((d) => d.images || {});

// The slice of the brief the curator needs (keeps request bodies small).
export const briefSummary = (b) => ({ title: b.title, tagline: b.tagline, concept: b.concept, palette: b.palette, avoid: b.avoid });
export const storySummary = (s) => ({ id: s.id, name: s.name, role: s.role, narrative: s.narrative, keywords: s.keywords });

export function storyQueries(story, extra = []) {
  return [
    ...extra.map((q) => ({ q, kind: "photo", storyId: story.id })),
    ...(story.queries?.photo || []).map((q) => ({ q, kind: "photo", storyId: story.id })),
    ...(story.queries?.archive || []).map((q) => ({ q, kind: "archive", storyId: story.id })),
  ];
}

// Interleave candidates across queries (and so across sources) before
// truncating, so one prolific query can't crowd out the rest of the story.
export function roundRobin(items, keyOf, limit) {
  const groups = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const lists = [...groups.values()];
  const out = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < limit) out.push(l[i]);
  }
  return out;
}

// One vision pass looks at ≤20 images including any reference (requests with
// more than 20 images get a much smaller per-image size limit) and fits the
// 60s function ceiling; a story's round over-fetches ~40 and culls them in two
// parallel passes.
const MAX_IMAGES = 20;
const MAX_BATCHES = 2;
const PER_PHOTOGRAPHER = 2; // per story, across batches and rounds
const CAPPED_SOURCES = new Set(["unsplash", "pexels", "arena"]);
const creatorKey = (p) => (CAPPED_SOURCES.has(p.source) && p.creator ? `${p.source}:${p.creator.toLowerCase()}` : null);

// One story, one round: search → cull. Returns the kept pins (curated
// metadata merged onto the normalized image), the per-source status, and
// whether the story is genuinely out of new images (only when every source
// answered and still nothing new came back — a failed search is retryable).
export async function curateStory({ brief, story, page = 1, exclude = new Set(), existing = [], keep = 12, extraQueries = [], reference = null, onStatus, signal }) {
  onStatus?.({ phase: "searching" });
  const queries = storyQueries(story, extraQueries);
  if (!queries.length) throw new ApiError(400, "no-queries");
  const { candidates = [], sources = {} } = await searchImages(queries, { page, perQuery: 8 }, signal);
  const sourcesFailed = Object.values(sources).some((v) => v === "error");
  const batchSize = MAX_IMAGES - (reference ? 1 : 0);
  const fresh = candidates.filter((c) => !exclude.has(c.id));
  const pool = roundRobin(fresh, (c) => c.query, batchSize * MAX_BATCHES);
  if (!pool.length) {
    if (sourcesFailed) throw new ApiError(502, "sources-unavailable");
    return { pins: [], sources, exhausted: page > 1, considered: 0 };
  }
  onStatus?.({ phase: "curating", considered: pool.length });
  const batches = [];
  for (let i = 0; i < pool.length; i += batchSize) batches.push(pool.slice(i, i + batchSize));
  const perBatch = Math.max(2, Math.ceil(keep / batches.length));
  const results = await Promise.allSettled(batches.map((batch) => curateImages({
    brief: briefSummary(brief),
    story: storySummary(story),
    candidates: batch.map((c) => ({ id: c.id, thumb: c.thumb, alt: c.alt, title: c.title, source: c.source, creator: c.creator })),
    keep: perBatch,
    reference: reference ? { thumb: reference.thumb, alt: reference.alt || reference.title || "" } : undefined,
  }, signal)));
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) throw results[0].reason; // every pass failed: surface the error
  const byId = new Map(pool.map((c) => [c.id, c]));
  // The server caps photographers per batch; re-apply it across both batches
  // and the story's earlier rounds.
  const perCreator = new Map();
  existing.forEach((p) => { const k = creatorKey(p); if (k) perCreator.set(k, (perCreator.get(k) || 0) + 1); });
  const pins = [];
  for (const pick of ok.flatMap((r) => r.picks || []).filter((p) => byId.has(p.id)).sort((a, b) => b.score - a.score)) {
    if (pins.length >= keep) break;
    const c = byId.get(pick.id);
    const k = creatorKey(c);
    if (k && (perCreator.get(k) || 0) >= PER_PHOTOGRAPHER) continue;
    if (k) perCreator.set(k, (perCreator.get(k) || 0) + 1);
    pins.push({ ...c, storyId: story.id, score: pick.score, role: pick.role, note: pick.note });
  }
  return { pins, sources, exhausted: false, considered: pool.length };
}
