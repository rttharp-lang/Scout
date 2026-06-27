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

// City autocomplete suggestions for the input screen.
export async function searchCities(query) {
  const q = (query || "").trim();
  if (q.length < 2) return [];
  try {
    const r = await fetch(`/api/citysearch?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.cities) ? data.cities : [];
  } catch {
    return [];
  }
}

// Ask the scout endpoint for real neighborhoods in a city, tailored to the
// selected tiers, each with a blurb on what it's known for. The user picks
// which to visit before the itinerary is built. Returns an array of
// { name, blurb }; callers treat an empty array as "skip neighborhood choice".
export async function suggestNeighborhoods(city, tiers) {
  const params = new URLSearchParams({ city, tiers: tiers.join(",") });
  try {
    const r = await fetch(`/api/neighborhoods?${params.toString()}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.neighborhoods) ? data.neighborhoods : [];
  } catch {
    return [];
  }
}

// Ask the AI scout endpoint for a city-specific itinerary (neighborhoods +
// real stores + tiers + why). Returns { days: [...] }; callers fall back to
// the curated sample on error or when AI generation isn't configured.
// `areas` (optional) constrains the route to chosen neighborhoods.
export async function generateItinerary(city, tiers, days, areas = []) {
  const params = new URLSearchParams({ city, tiers: tiers.join(","), days: String(days) });
  if (areas.length) params.set("areas", areas.join(","));
  const r = await fetch(`/api/itinerary?${params.toString()}`);
  if (!r.ok) throw new Error(`itinerary ${r.status}`);
  return r.json();
}

// Look up coordinates for a stop that doesn't have them (e.g. the curated
// sample stops), reusing the same search endpoint. Results are cached per
// name+address so each store is only ever looked up once. Returns
// { lat, lng } or null; callers treat null as "no coordinates available".
// Look up listing photos for a place that doesn't already have them (the
// curated sample stops). Cached per name+address. Returns an array of photo
// resource names usable with /api/photo.
const photoCache = new Map();
export async function lookupPhotos(name, address) {
  const key = (name + "|" + address).toLowerCase();
  if (photoCache.has(key)) return photoCache.get(key);
  let photos = [];
  try {
    const results = await searchPlaces(`${name} ${address}`);
    photos = results[0]?.photos || [];
  } catch {
    photos = [];
  }
  photoCache.set(key, photos);
  return photos;
}

// For the neighborhood-picker: pull real storefront photos from actual stores
// in the neighborhood (so you can see whether it's big-box strip malls or
// small micro-retail), plus a representative coordinate at the heart of the
// retail so the overview map can place the neighborhood relative to the hotel.
// One search serves both; cached per neighborhood+city.
const areaCache = new Map();
export async function lookupAreaInfo(neighborhood, city) {
  const key = (neighborhood + "|" + city).toLowerCase();
  if (areaCache.has(key)) return areaCache.get(key);
  let info = { photos: [], coord: null };
  try {
    const results = await searchPlaces(`clothing boutique store ${neighborhood} ${city}`);
    // First photo from each of several stores → a montage of real storefronts.
    info.photos = results.slice(0, 12).map((r) => r.photos && r.photos[0]).filter(Boolean);
    const hit = results.find((r) => r.lat != null && r.lng != null);
    if (hit) info.coord = { lat: hit.lat, lng: hit.lng };
  } catch {
    info = { photos: [], coord: null };
  }
  areaCache.set(key, info);
  return info;
}

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
