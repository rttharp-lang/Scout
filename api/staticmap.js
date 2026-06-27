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

  // Single-character labels only (Google limit): 1–9 then A–Z for the rest.
  const LABELS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const markers = pairs
    .map((p, i) => `markers=${encodeURIComponent(`size:mid|color:${ACCENT}|label:${LABELS[i] || ""}|${p}`)}`)
    .join("&");
  // Optional hotel/home base — a distinct green "H" marker and the route's start.
  const home = (req.query.home || "").toString().trim();
  const homeValid = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(home);
  const homeMarker = homeValid ? `&markers=${encodeURIComponent(`color:0x1A8A52|label:H|${home}`)}` : "";
  const pathPts = homeValid ? [home, ...pairs] : pairs;
  const path = pathPts.length > 1
    ? `&path=${encodeURIComponent(`color:${ACCENT}cc|weight:3|${pathPts.join("|")}`)}`
    : "";
  const url = `https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2&maptype=roadmap&${markers}${homeMarker}${path}&key=${key}`;

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
