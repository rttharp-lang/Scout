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

// Ask the scout for a pre-curated, day-by-day neighborhood plan: each day a set
// of geographically-clustered districts (3+), with what each is known for and
// why an apparel team would benefit. Returns an array of days, each
// { neighborhoods: [{ name, blurb, apparelWhy }] }; empty on error.
export async function suggestNeighborhoodPlan(city, tiers, days) {
  const params = new URLSearchParams({ city, tiers: tiers.join(","), days: String(days) });
  try {
    const r = await fetch(`/api/neighborhoods?${params.toString()}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.days) ? data.days : [];
  } catch {
    return [];
  }
}

// Ask the scout for a few more real stores in one neighborhood (for the
// "prompt more options" button), excluding ones already on the day. Returns
// an array of { name, tier, why }; empty on error / when AI isn't configured.
export async function suggestStores(city, tiers, area, exclude = []) {
  const params = new URLSearchParams({ city, area, tiers: tiers.join(",") });
  if (exclude.length) params.set("exclude", exclude.join(","));
  try {
    const r = await fetch(`/api/morestores?${params.toString()}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.stores) ? data.stores : [];
  } catch {
    return [];
  }
}

// Ask the scout for a few more real restaurants for a meal near an area (for the
// "prompt more" button on the lunch/dinner picker), excluding ones already
// offered. Returns an array of { name, cuisine, why }; empty on error.
export async function suggestMeals(city, area, meal, exclude = []) {
  const params = new URLSearchParams({ city, meal });
  if (area) params.set("area", area);
  if (exclude.length) params.set("exclude", exclude.join(","));
  try {
    const r = await fetch(`/api/morefood?${params.toString()}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.restaurants) ? data.restaurants : [];
  } catch {
    return [];
  }
}

// Ask the AI scout endpoint for a city-specific itinerary (neighborhoods +
// real stores + tiers + why). Returns { days: [...] }; callers fall back to
// the curated sample on error or when AI generation isn't configured.
// `plan` (optional): a per-day array of neighborhood-name arrays — fills stores
// into exactly those neighborhoods, per day, in that order.
export async function generateItinerary(city, tiers, days, plan = null) {
  const params = new URLSearchParams({ city, tiers: tiers.join(","), days: String(days) });
  if (plan && plan.length) params.set("plan", JSON.stringify(plan));
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

// For the neighborhood-picker. One search of the stores in a neighborhood gives
// us a representative coordinate (to place it on the overview map relative to
// the hotel) plus one photo per store. We use each store's FIRST listing photo,
// which on Google is usually the exterior/storefront shot — a better read on
// the retail than interior or close-up crops. Cached per neighborhood+city.
const areaCache = new Map();
export async function lookupAreaInfo(neighborhood, city) {
  const key = (neighborhood + "|" + city).toLowerCase();
  if (areaCache.has(key)) return areaCache.get(key);
  let info = { photos: [], coord: null, coords: [] };
  try {
    const results = await searchPlaces(`clothing boutique store ${neighborhood} ${city}`);
    info.photos = results.map((r) => r.photos && r.photos[0]).filter(Boolean).slice(0, 12);
    const pts = results.filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat, lng: r.lng }));
    info.coords = pts.slice(0, 8);
    info.coord = pts[0] || null;
  } catch {
    info = { photos: [], coord: null, coords: [] };
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
