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

// Look up coordinates for a stop that doesn't have them (e.g. the curated
// sample stops), reusing the same search endpoint. Results are cached per
// name+address so each store is only ever looked up once. Returns
// { lat, lng } or null; callers treat null as "no coordinates available".
const coordCache = new Map();
export async function lookupCoords(name, address) {
  const key = (name + "|" + address).toLowerCase();
  if (coordCache.has(key)) return coordCache.get(key);

  let coords = null;
  try {
    const results = await searchPlaces(`${name} ${address}`);
    const hit = results.find((r) => r.lat != null && r.lng != null);
    if (hit) coords = { lat: hit.lat, lng: hit.lng };
  } catch {
    coords = null;
  }
  coordCache.set(key, coords);
  return coords;
}
