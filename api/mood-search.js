// Scout Mood — story queries → normalized, openly licensed image candidates.
// POST { queries: [{ q, kind: "photo"|"archive", storyId }] (≤12), perQuery?: 4..30, page?: 1..10 }
// → 200 { candidates: Candidate[], sources: { [source]: "ok"|"error"|"not-configured" } }
// Photo queries go to the configured photography APIs, archive queries to the
// open-access museum APIs (see server/mood/sources.js). A failing source is
// reported, never fatal.
import { searchAll } from "../server/mood/sources.js";
import { sendError } from "../server/mood/claude.js";
import { body, str, int } from "../server/mood/validate.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  try {
    const b = body(req);
    const queries = (Array.isArray(b.queries) ? b.queries : [])
      .map((q) => ({ q: str(q?.q, 100), kind: q?.kind === "archive" ? "archive" : "photo", storyId: str(q?.storyId, 60) }))
      .filter((q) => q.q)
      .slice(0, 12);
    if (!queries.length) { res.status(400).json({ error: "no-queries" }); return; }
    const out = await searchAll(queries, { perQuery: int(b.perQuery, 4, 30, 8), page: int(b.page, 1, 10, 1) });
    res.status(200).json(out);
  } catch (e) {
    sendError(res, e);
  }
}
