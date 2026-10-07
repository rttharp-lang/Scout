// Client for the Scout Mood functions + the board-generation pipeline.
// Keys never reach the browser: everything goes through /api/mood-*.

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
  return "Something went wrong curating this. Try again.";
}

export const fetchBrief = (input, refine, signal) =>
  post("/api/mood-brief", { ...input, refine: refine || undefined }, signal).then((d) => d.brief);

export const searchImages = (queries, { page = 1, perQuery = 8 } = {}, signal) =>
  post("/api/mood-search", { queries, page, perQuery }, signal);

export const curateImages = (payload, signal) => post("/api/mood-curate", payload, signal);

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

// One vision pass looks at ≤24 images (sized for the 60s function ceiling);
// a story's round over-fetches ~48 and culls them in two parallel passes.
const BATCH = 24;
const MAX_BATCHES = 2;

// One story, one round: search → cull. Returns the kept pins (curated
// metadata merged onto the normalized image) and the per-source status.
export async function curateStory({ brief, story, page = 1, exclude = new Set(), keep = 12, extraQueries = [], reference = null, onStatus, signal }) {
  onStatus?.({ phase: "searching" });
  const { candidates = [], sources = {} } = await searchImages(storyQueries(story, extraQueries), { page, perQuery: 8 }, signal);
  const fresh = candidates.filter((c) => !exclude.has(c.id));
  const pool = roundRobin(fresh, (c) => c.query, BATCH * MAX_BATCHES);
  if (!pool.length) return { pins: [], sources, exhausted: true, considered: 0 };
  onStatus?.({ phase: "curating", considered: pool.length });
  const batches = [];
  for (let i = 0; i < pool.length; i += BATCH) batches.push(pool.slice(i, i + BATCH));
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
  const pins = ok.flatMap((r) => r.picks || [])
    .filter((p) => byId.has(p.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, keep)
    .map((p) => ({ ...byId.get(p.id), storyId: story.id, score: p.score, role: p.role, note: p.note }));
  return { pins, sources, exhausted: false, considered: pool.length };
}
