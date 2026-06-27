// Serverless proxy for the Google Maps Static API, used by the neighborhood
// picker to show where each candidate neighborhood sits relative to the hotel.
// Unlike /api/staticmap this draws no route line — just labelled neighborhood
// pins plus a green "H" for the hotel — and emphasises the active neighborhood
// (the one currently in view as you scroll) with a larger accent marker.
//
//   /api/areamap?m=1,lat,lng|2,lat,lng&home=lat,lng&active=1

const ACCENT = "0xE1565C";
const MUTED = "0x9AA0A6";

const isLatLng = (s) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(s);

export default async function handler(req, res) {
  const raw = (req.query.m || "").toString();
  const active = (req.query.active || "").toString().trim();

  // Parse "label,lat,lng" entries.
  const items = raw.split("|").map((chunk) => {
    const parts = chunk.split(",");
    if (parts.length !== 3) return null;
    const [label, lat, lng] = parts.map((x) => x.trim());
    if (!isLatLng(`${lat},${lng}`)) return null;
    return { label, pt: `${lat},${lng}` };
  }).filter(Boolean);

  if (!items.length) { res.status(400).json({ error: "no-points" }); return; }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) { res.status(503).json({ error: "maps-not-configured" }); return; }

  // Active neighborhood: large accent pin. Others: muted, smaller.
  const markers = items.map(({ label, pt }) => {
    const isActive = label === active;
    const color = isActive ? ACCENT : MUTED;
    const size = isActive ? "mid" : "small";
    return `markers=${encodeURIComponent(`size:${size}|color:${color}|label:${label}|${pt}`)}`;
  }).join("&");

  const home = (req.query.home || "").toString().trim();
  const homeMarker = isLatLng(home) ? `&markers=${encodeURIComponent(`color:0x1A8A52|label:H|${home}`)}` : "";

  const url = `https://maps.googleapis.com/maps/api/staticmap?size=640x300&scale=2&maptype=roadmap&${markers}${homeMarker}&key=${key}`;

  try {
    const r = await fetch(url);
    if (!r.ok) { const detail = await r.text(); res.status(502).json({ error: "areamap-failed", detail }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: "areamap-error", detail: String(e) });
  }
}
