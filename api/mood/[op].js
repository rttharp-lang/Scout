// Scout Mood API — one Vercel function serving all four operations:
//   POST /api/mood/brief    creative direction → art-direction brief (Claude)
//   POST /api/mood/search   story queries → openly licensed image candidates
//   POST /api/mood/curate   the design director's vision cull (Claude)
//   POST /api/mood/resolve  canonical image metadata by id (before approvals)
//   GET  /api/mood/image    allow-listed image download proxy
// One dynamic route instead of five files because the Hobby plan allows at
// most 12 functions per deployment and the trip planner already uses 10. The
// handlers live in server/mood/handlers/.
import brief from "../../server/mood/handlers/brief.js";
import search from "../../server/mood/handlers/search.js";
import curate from "../../server/mood/handlers/curate.js";
import image from "../../server/mood/handlers/image.js";
import resolve from "../../server/mood/handlers/resolve.js";
import { crossSite } from "../../server/mood/validate.js";

// 60s is the known-deployable ceiling on this project (Hobby without Fluid
// Compute); every Claude call is sized to finish inside it.
export const config = { maxDuration: 60 };

const OPS = { brief, search, curate, resolve, image };

export default async function handler(req, res) {
  const op = String(req.query?.op || "");
  const fn = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!fn) { res.status(404).json({ error: "unknown-op" }); return; }
  if (crossSite(req)) { res.status(403).json({ error: "cross-site" }); return; }
  return fn(req, res);
}
