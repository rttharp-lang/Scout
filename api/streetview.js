// Serverless proxy for the Google Street View Static API. Used by the
// neighborhood picker to show a street-level view — the road with its stores
// along it — rather than a tight crop of a single storefront. The browser
// requests /api/streetview?loc=lat,lng&heading=H and this fetches the image
// server-side so the API key is never exposed. `radius` snaps to the nearest
// road-level panorama; `return_error_code` makes "no imagery" a 404 so the
// client can quietly drop it instead of showing a grey placeholder.

const isLatLng = (s) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(s);
const clamp = (v, lo, hi, dflt) => { const n = parseInt(v, 10); return Number.isNaN(n) ? dflt : Math.max(lo, Math.min(hi, n)); };

export default async function handler(req, res) {
  const loc = (req.query.loc || "").toString().trim();
  if (!isLatLng(loc)) { res.status(400).json({ error: "bad-loc" }); return; }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) { res.status(503).json({ error: "maps-not-configured" }); return; }

  const heading = clamp(req.query.heading, 0, 360, 0);
  const fov = clamp(req.query.fov, 40, 120, 90);
  const pitch = clamp(req.query.pitch, -30, 30, 0);

  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x400&location=${encodeURIComponent(loc)}&heading=${heading}&fov=${fov}&pitch=${pitch}&radius=80&source=outdoor&return_error_code=true&key=${key}`;

  try {
    const r = await fetch(url);
    if (!r.ok) { res.status(r.status === 404 ? 404 : 502).json({ error: "streetview-failed" }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: "streetview-error", detail: String(e) });
  }
}
