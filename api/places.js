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
  "places.utcOffsetMinutes",
  "places.location",
  "places.photos",
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
      ...hoursForToday(p.regularOpeningHours, p.utcOffsetMinutes),
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      photos: (p.photos || []).slice(0, 10).map((ph) => ph.name).filter(Boolean),
    }));

    res.status(200).json({ results });
  } catch (e) {
    res.status(500).json({ error: "search-failed", detail: String(e), results: [] });
  }
}

const pad = (n) => String(n).padStart(2, "0");

// Read today's opening hours from the STRUCTURED periods (exact open/close
// numbers, in the store's local time via utcOffsetMinutes) — not the display
// text, which can drop the AM/PM and make a 1 PM open look like 1 AM. Returns
// { hours: "13:00-19:00", openAt: 780 } where openAt is minutes after midnight
// (null when unknown/closed, so the scheduler treats it as no constraint).
function hoursForToday(openingHours, utcOffsetMinutes) {
  if (!openingHours) return { hours: "", openAt: null };
  const periods = Array.isArray(openingHours.periods) ? openingHours.periods : null;
  const offset = typeof utcOffsetMinutes === "number" ? utcOffsetMinutes : 0;
  const day = new Date(Date.now() + offset * 60000).getUTCDay(); // place-local day, 0=Sun

  if (periods && periods.length) {
    if (periods.length === 1 && periods[0].open && !periods[0].close) {
      return { hours: "Open 24 hours", openAt: 0 };
    }
    const today = periods.find((p) => p.open && p.open.day === day);
    if (!today) return { hours: "Closed", openAt: null };
    const o = today.open, c = today.close;
    const openAt = o.hour * 60 + (o.minute || 0);
    const hours = c
      ? `${pad(o.hour)}:${pad(o.minute || 0)}–${pad(c.hour)}:${pad(c.minute || 0)}`
      : `${pad(o.hour)}:${pad(o.minute || 0)}`;
    return { hours, openAt };
  }

  const lines = openingHours.weekdayDescriptions;
  if (Array.isArray(lines) && lines.length >= 7) {
    const idx = day === 0 ? 6 : day - 1; // weekdayDescriptions is Mon..Sun
    const line = lines[idx] || "";
    const colon = line.indexOf(":");
    return { hours: (colon >= 0 ? line.slice(colon + 1) : line).trim(), openAt: null };
  }
  return { hours: "", openAt: null };
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
