// Scout Mood — the design director's cull (one Claude vision call per story).
// POST { brief: { title, tagline, concept, palette, avoid }, story: { id, name, role, narrative, keywords },
//        candidates: [{ id, thumb, alt, title, source, creator }] (≤24), keep?: 2..16, reference?: { thumb, alt } }
// → 200 { picks: [{ id, score, role, note }], rejected: [{ id, reason }] }
// Claude returns hard-reject codes + six 0-5 sub-scores per image; the keep
// threshold is applied here (scoreDecision), not left to the model.
//
// Thumbnails are fetched HERE (allow-listed image hosts only) and sent to
// Claude as base64, so a dead or slow link drops out as "unavailable" instead
// of failing the whole request — and the browser can never make this function
// fetch an arbitrary URL.
import { callStructured, sendError, MoodError } from "../server/mood/claude.js";
import { CURATE_SYSTEM, CURATE_SCHEMA, ROLES, scoreDecision } from "../server/mood/prompts.js";
import { body, str, strList, int } from "../server/mood/validate.js";
import { fetchAllowedImage, sniffImageType } from "../server/mood/sources.js";

export const config = { maxDuration: 60 };

const MAX_CANDIDATES = 24; // sized so one vision pass fits the 60s ceiling
const PER_PHOTOGRAPHER = 2; // board rhythm: no photographer dominates a story
const THUMB_BYTES = 3 * 1024 * 1024;

async function loadThumb(url) {
  try {
    const buf = await fetchAllowedImage(url, { timeoutMs: 6000, maxBytes: THUMB_BYTES });
    const media_type = sniffImageType(buf);
    if (!media_type) return null;
    return { type: "image", source: { type: "base64", media_type, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

const describe = (c) => [c.source, c.title, c.alt].map((x) => str(x, 160)).filter(Boolean).join(" — ");

export default async function handler(req, res) {
  try {
    const b = body(req);
    const story = b.story && typeof b.story === "object" ? b.story : null;
    if (!story) throw new MoodError(400, "no-story");
    const seen = new Set();
    const candidates = (Array.isArray(b.candidates) ? b.candidates : [])
      .map((c) => ({ id: str(c?.id, 120), thumb: str(c?.thumb, 1000), alt: str(c?.alt, 300), title: str(c?.title, 200), source: str(c?.source, 40), creator: str(c?.creator, 120) }))
      .filter((c) => c.id && c.thumb && !seen.has(c.id) && seen.add(c.id))
      .slice(0, MAX_CANDIDATES);
    if (!candidates.length) throw new MoodError(400, "no-candidates");
    const keep = int(b.keep, 2, 16, 10);
    const brief = b.brief && typeof b.brief === "object" ? b.brief : {};

    const [refImage, ...thumbs] = await Promise.all([
      b.reference?.thumb ? loadThumb(str(b.reference.thumb, 1000)) : Promise.resolve(null),
      ...candidates.map((c) => loadThumb(c.thumb)),
    ]);
    const rejected = [];
    const shown = []; // candidates actually sent, in label order (1-based)
    thumbs.forEach((img, i) => (img ? shown.push({ c: candidates[i], img }) : rejected.push({ id: candidates[i].id, reason: "unavailable" })));
    if (!shown.length) { res.status(200).json({ picks: [], rejected }); return; }

    const palette = (Array.isArray(brief.palette) ? brief.palette : []).slice(0, 8).map((p) => `${str(p?.name, 40)} ${str(p?.hex, 7)}`).join(", ");
    const context = [
      `BOARD: ${str(brief.title, 80)}${brief.tagline ? ` — ${str(brief.tagline, 200)}` : ""}`,
      brief.concept ? `CONCEPT: ${str(brief.concept, 1200)}` : null,
      palette ? `PALETTE: ${palette}` : null,
      `STORY BEING CURATED: ${str(story.name, 60)}${story.role ? ` (${str(story.role, 20)} story)` : ""} — ${str(story.narrative, 600)}`,
      `STORY KEYWORDS: ${strList(story.keywords, 6, 40).join(", ")}`,
      strList(brief.avoid, 5, 140).length ? `CLICHÉS TO AVOID: ${strList(brief.avoid, 5, 140).join("; ")}` : null,
    ].filter(Boolean).join("\n");

    const content = [{ type: "text", text: context }];
    if (refImage) {
      content.push(
        { type: "text", text: `REFERENCE — the design team pinned this image and wants MORE LIKE IT (${str(b.reference.alt, 200) || "no caption"}). Weigh closeness to its colour, material, light and attitude inside "brief fit". Do not score the reference itself.` },
        refImage,
      );
    }
    content.push({ type: "text", text: `CANDIDATES — ${shown.length} images, numbered 1 to ${shown.length}:` });
    shown.forEach(({ c, img }, i) => {
      content.push({ type: "text", text: `Image ${i + 1}${describe(c) ? ` (${describe(c)})` : ""}` }, img);
    });
    content.push({ type: "text", text: `Return exactly one decision for every image number 1-${shown.length}. Keep at most ${keep}; only images that clear the bar.` });

    const out = await callStructured({ system: CURATE_SYSTEM, content, schema: CURATE_SCHEMA, maxTokens: 8000, effort: "low" });

    const decided = new Set();
    const picks = [];
    for (const d of Array.isArray(out?.decisions) ? out.decisions : []) {
      const n = Number(d?.index);
      if (!Number.isInteger(n) || n < 1 || n > shown.length || decided.has(n)) continue;
      decided.add(n);
      const { c } = shown[n - 1];
      const verdict = scoreDecision(d);
      if (verdict.keep) {
        picks.push({ id: c.id, score: verdict.score, role: ROLES.includes(d.role) ? d.role : "lateral", note: str(d.note, 300), creator: c.creator, source: c.source });
      } else {
        rejected.push({ id: c.id, reason: verdict.rejects.length ? verdict.rejects.join(", ") : `below the bar (${verdict.weighted.toFixed(1)}/5)` });
      }
    }
    // Anything the model skipped is treated as not kept.
    shown.forEach(({ c }, i) => { if (!decided.has(i + 1)) rejected.push({ id: c.id, reason: "not reviewed" }); });
    picks.sort((a, b2) => b2.score - a.score);
    const perCreator = new Map();
    const kept = [];
    for (const p of picks) {
      const who = ["unsplash", "pexels", "arena"].includes(p.source) && p.creator ? p.creator.toLowerCase() : null;
      if (who && (perCreator.get(who) || 0) >= PER_PHOTOGRAPHER) { rejected.push({ id: p.id, reason: "photographer already on this story twice" }); continue; }
      if (kept.length >= keep) { rejected.push({ id: p.id, reason: "over the per-story limit" }); continue; }
      if (who) perCreator.set(who, (perCreator.get(who) || 0) + 1);
      kept.push({ id: p.id, score: p.score, role: p.role, note: p.note });
    }
    res.status(200).json({ picks: kept, rejected });
  } catch (e) {
    sendError(res, e);
  }
}
