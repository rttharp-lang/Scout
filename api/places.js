// Serverless proxy for the Google Places API (New).
//
// The browser only ever calls /api/places?q=... — the API key stays here on
// the server (read from the GOOGLE_PLACES_API_KEY environment variable) and is
// never shipped to the client. Deployed automatically by Vercel as a function.

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours",
  "places.location",
].join(",");

export default async function handler(req, res) {
  const query = (req.query.q || "").toString().trim();
  if (query.length < 2) {
    res.status(200).json({ results: [] });
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    // No key configured yet — the client falls back to the sample set.
    res.status(503).json({ error: "search-not-configured", results: [] });
    return;
  }

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 8 }),
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "places-request-failed", detail, results: [] });
      return;
    }

    const data = await r.json();
    const results = (data.places || []).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text || "",
      address: p.formattedAddress || "",
      rating: typeof p.rating === "number" ? Math.round(p.rating * 10) / 10 : null,
      reviews: p.userRatingCount ?? null,
      hours: hoursForToday(p.regularOpeningHours),
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
    }));

    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: "search-failed", detail: String(e), results: [] });
  }
}

// Pull today's opening hours out of the structured response and normalize to
// the app's compact 24-hour style, e.g.
// "Monday: 11:00 AM – 8:00 PM" -> "11:00–20:00".
function hoursForToday(openingHours) {
  const lines = openingHours?.weekdayDescriptions;
  if (!Array.isArray(lines) || lines.length < 7) return "";
  // weekdayDescriptions is ordered Monday..Sunday; JS getDay() is Sun..Sat.
  const jsDay = new Date().getDay();
  const idx = jsDay === 0 ? 6 : jsDay - 1;
  const line = lines[idx] || "";
  const colon = line.indexOf(":");
  const times = (colon >= 0 ? line.slice(colon + 1) : line).trim();
  return formatHours(times);
}

// Convert "10:00 AM – 9:00 PM" -> "10:00–21:00". Leaves non-time text
// (e.g. "Closed", "Open 24 hours") untouched, and falls back to the original
// string if there's nothing to convert.
function formatHours(times) {
  if (!times) return "";
  const normalized = times
    .replace(/[  ]/g, " ") // narrow/non-breaking spaces -> normal
    .replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (_, h, m, ap) => {
      let hr = parseInt(h, 10) % 12;
      if (/pm/i.test(ap)) hr += 12;
      return String(hr).padStart(2, "0") + ":" + m;
    })
    .replace(/\s*[–-]\s*/g, "–"); // tidy the range dash
  return normalized.trim();
}
