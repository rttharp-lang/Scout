// Serverless proxy for the Google Place Photos API. The browser requests
// /api/photo?name=places/.../photos/...&w=800 and this streams the image
// server-side so the API key is never exposed.

export default async function handler(req, res) {
  const name = (req.query.name || "").toString();
  const w = Math.min(1600, Math.max(200, parseInt(req.query.w, 10) || 800));

  // Only allow well-formed photo resource names (guards against SSRF).
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    res.status(400).json({ error: "bad-photo-name" });
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) { res.status(503).json({ error: "not-configured" }); return; }

  try {
    const r = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&key=${key}`);
    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "photo-failed", detail });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: "photo-error", detail: String(e) });
  }
}
