// City autocomplete via the Google Places Autocomplete API (New). The browser
// calls /api/citysearch?q=... and gets back a short list of city suggestions.
// Key stays server-side, reusing GOOGLE_PLACES_API_KEY.

export default async function handler(req, res) {
  const input = (req.query.q || "").toString().trim();
  if (input.length < 2) { res.status(200).json({ cities: [] }); return; }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) { res.status(503).json({ error: "search-not-configured", cities: [] }); return; }

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.text",
      },
      body: JSON.stringify({ input, includedPrimaryTypes: ["locality", "administrative_area_level_3"] }),
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "autocomplete-failed", detail, cities: [] });
      return;
    }

    const data = await r.json();
    const cities = (data.suggestions || [])
      .map((s) => s.placePrediction?.text?.text)
      .filter(Boolean)
      .slice(0, 5);
    res.status(200).json({ cities });
  } catch (e) {
    res.status(500).json({ error: "autocomplete-error", detail: String(e), cities: [] });
  }
}
