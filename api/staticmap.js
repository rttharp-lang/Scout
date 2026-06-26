// Serverless proxy for the Google Maps Static API. The browser requests
// /api/staticmap?pts=lat,lng;lat,lng;... and this fetches the map image
// server-side so the API key is never exposed. Renders the day's stops as
// numbered pins joined by a route line, in the app's accent color.

const ACCENT = "0xE1565C";

export default async function handler(req, res) {
  const raw = (req.query.pts || "").toString().trim();
  const pairs = raw.split(";").map((s) => s.trim()).filter((s) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(s));
  if (pairs.length < 1) {
    res.status(400).json({ error: "no-points" });
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    res.status(503).json({ error: "maps-not-configured" });
    return;
  }

  const markers = pairs
    .map((p, i) => `markers=${encodeURIComponent(`color:${ACCENT}|label:${i + 1}|${p}`)}`)
    .join("&");
  const path = pairs.length > 1
    ? `&path=${encodeURIComponent(`color:${ACCENT}cc|weight:3|${pairs.join("|")}`)}`
    : "";
  const url = `https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2&maptype=roadmap&${markers}${path}&key=${key}`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "staticmap-failed", detail });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: "staticmap-error", detail: String(e) });
  }
}
