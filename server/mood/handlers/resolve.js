// Scout Mood — POST /api/mood/resolve: canonical image metadata by id.
// POST { ids: ["unsplash:Ab12", "met:45734", …] (≤20) } → 200 { images: { [id]: Candidate | null } }
// Used before every designer approval so the library stores what the source
// says the image is (credit, license, URLs) — never data a browser supplied.
import { resolveImage } from "../sources.js";
import { sendError } from "../claude.js";
import { body, str } from "../validate.js";

export default async function handler(req, res) {
  try {
    const b = body(req);
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => str(x, 80)).filter(Boolean))].slice(0, 20);
    if (!ids.length) { res.status(400).json({ error: "no-ids" }); return; }
    const found = await Promise.all(ids.map((id) => resolveImage(id).catch(() => null)));
    res.status(200).json({ images: Object.fromEntries(ids.map((id, i) => [id, found[i]])) });
  } catch (e) {
    sendError(res, e);
  }
}
