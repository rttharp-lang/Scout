// Serverless proxy for the Google Maps Static API. The browser requests
// /api/staticmap?pts=lat,lng;lat,lng;... and this fetches the map image
// server-side so the API key is never exposed. Renders the day's stops as
// numbered pins joined by a route line, in the app's accent color.

const ACCENT = "0xE1565C";
const isLatLng = (s) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(s);
const clampNum = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isNaN(n) ? null : Math.max(lo, Math.min(hi, n)); };

export default async function handler(req, res) {
  const raw = (req.query.pts || "").toString().trim();
  const pairs = raw.split(";").map((s) => s.trim()).filter(isLatLng);
  if (pairs.length < 1) {
    res.status(400).json({ error: "no-points" });
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    res.status(503).json({ error: "maps-not-configured" });
    return;
  }

  const home = (req.query.home || "").toString().trim();
  const homeValid = isLatLng(home);
  const pathPts = homeValid ? [home, ...pairs] : pairs;
  const path = pathPts.length > 1
    ? `&path=${encodeURIComponent(`color:${ACCENT}cc|weight:3|${pathPts.join("|")}`)}`
    : "";

  // Basemap mode: the client supplies an explicit center/zoom and pixel size,
  // draws the route line, and overlays its own numbered pins in HTML — so the
  // map markers can show real numbers (10, 11, …) that match the store cards,
  // instead of Google's single-character label limit (1–9 then A, B, …).
  const center = (req.query.center || "").toString().trim();
  const zoom = clampNum(req.query.zoom, 1, 20);
  const w = clampNum(req.query.w, 100, 640);
  const h = clampNum(req.query.h, 100, 640);

  let url;
  if (isLatLng(center) && zoom != null && w && h) {
    url = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${w}x${h}&scale=2&maptype=roadmap${path}&key=${key}`;
  } else {
    // Legacy auto-fit mode with Google's own labelled markers.
    const LABELS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const markers = pairs
      .map((p, i) => `markers=${encodeURIComponent(`size:mid|color:${ACCENT}|label:${LABELS[i] || ""}|${p}`)}`)
      .join("&");
    const homeMarker = homeValid ? `&markers=${encodeURIComponent(`color:0x1A8A52|label:H|${home}`)}` : "";
    url = `https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2&maptype=roadmap&${markers}${homeMarker}${path}&key=${key}`;
  }

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
