// Client helper for live store search. Calls the serverless proxy at
// /api/places (which holds the API key) and returns results already shaped
// like the app's store objects. Callers should treat a thrown error or an
// empty array as "fall back to the sample set".

export async function searchPlaces(query) {
  const q = (query || "").trim();
  if (q.length < 2) return [];

  const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`places ${r.status}`);

  const data = await r.json();
  return Array.isArray(data.results) ? data.results : [];
}
