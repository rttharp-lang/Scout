// Scout Mood — image download proxy.
// GET /api/mood-image?u=<image url>&name=<file name>&track=<Unsplash download_location>
// Streams an image from an ALLOW-LISTED source host back as a same-origin
// attachment, so the browser can save it (cross-origin <a download> is ignored)
// and the zip export can read it. Only https URLs on the source hosts are
// fetched, redirects are re-checked against the allow-list, and size/type are
// capped — this can never be used to reach arbitrary or internal hosts.
// When `track` is an Unsplash download_location, it is pinged server-side
// (Unsplash API guidelines require it whenever a user downloads a photo).
import { fetchAllowedImage, isAllowedImageUrl, sniffImageType, trackUnsplashDownload } from "../server/mood/sources.js";

// Vercel caps a function response at 4.5 MB; stay under it.
const MAX_BYTES = 4_400_000;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

// Keep file names boring: letters, digits, dash, underscore, dot.
const safeName = (s) => String(s || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "scout-mood";

export default async function handler(req, res) {
  const u = (req.query.u || "").toString();
  if (!isAllowedImageUrl(u)) { res.status(400).json({ error: "bad-url" }); return; }
  try {
    const track = (req.query.track || "").toString();
    // Awaited (not fire-and-forget): a serverless function may be frozen the
    // moment the response is sent. Failures never block the download.
    const [buf] = await Promise.all([
      fetchAllowedImage(u, { timeoutMs: 20000, maxBytes: MAX_BYTES }),
      track ? trackUnsplashDownload(track).catch(() => {}) : null,
    ]);
    const type = sniffImageType(buf);
    if (!type) { res.status(415).json({ error: "not-an-image" }); return; }
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Content-Disposition", `attachment; filename="${safeName(req.query.name)}.${EXT[type]}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: "image-failed", detail: String(e?.message || e) });
  }
}
