// Image sources for Scout Mood. Each adapter searches one API server-side and
// normalizes results to the shared Candidate shape (see the README):
//   photography — Unsplash (UNSPLASH_ACCESS_KEY), Pexels (PEXELS_API_KEY),
//                 Wikimedia Commons Featured/Quality images (keyless,
//                 community-juried, per-file free licenses)
//   reference   — Are.na (optional, ARENA_ACCESS_TOKEN): images saved by
//                 designers and creatives into themed channels. Rights stay
//                 with the original creators, so these are labelled
//                 reference-only.
//   archives    — The Met Open Access (keyless), Cleveland Museum of Art Open
//                 Access (keyless), Cooper Hewitt / Smithsonian Open Access
//                 (optional, SMITHSONIAN_API_KEY)
// Every image carries its real credit, license and source link.
//
// Deliberately NOT used: Art Institute of Chicago (its image host challenges
// server-side requests since 2026-08, which breaks the vision cull), the V&A
// (API terms are non-commercial), Pixabay (forbids hotlinking).

const UA = "ScoutMood/1.0 (+https://github.com/rttharp-lang/scout)";
const APP = () => (process.env.UNSPLASH_APP_NAME || "scout_mood").replace(/[^a-z0-9_-]/gi, "");
const SEARCH_TIMEOUT = 8000;

export const utm = (url) => (url ? `${url}${url.includes("?") ? "&" : "?"}utm_source=${APP()}&utm_medium=referral` : null);
const withParams = (url, params) => (url ? `${url}${url.includes("?") ? "&" : "?"}${params}` : null);
const clip = (s, n) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

// ── Image host allow-list (shared by the curate fetch and the download proxy) ──
export const IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "images.pexels.com",
  "images.metmuseum.org",
  "openaccess-cdn.clevelandart.org",
  "ids.si.edu",
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  "images.are.na",
  "d2w9rnfcy7mm78.cloudfront.net",
]);

export function isAllowedImageUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname) && !url.username && !url.password && (url.port === "" || url.port === "443");
  } catch {
    return false;
  }
}

// Magic-byte sniffing: servers often send octet-stream or image/jpg; Claude
// and browsers need one of these four.
export function sniffImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Fetch image bytes from an allow-listed host only. Redirects are followed by
// hand so every hop is re-checked; the body is streamed with a hard size cap.
export async function fetchAllowedImage(u, { timeoutMs = 8000, maxBytes = 4_000_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let url = u;
    for (let hop = 0; hop < 4; hop++) {
      if (!isAllowedImageUrl(url)) throw new Error("host-not-allowed");
      // Prefer JPEG/PNG: Miro and some desktop tools reject WebP.
      const r = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "image/jpeg,image/png;q=0.9,image/*;q=0.5" } });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) throw new Error("bad-redirect");
        url = new URL(loc, url).toString();
        continue;
      }
      if (!r.ok) throw new Error(`http-${r.status}`);
      if (Number(r.headers.get("content-length") || 0) > maxBytes) throw new Error("too-large");
      const chunks = [];
      let total = 0;
      for await (const chunk of r.body) {
        total += chunk.length;
        if (total > maxBytes) { ctrl.abort(); throw new Error("too-large"); }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    throw new Error("too-many-redirects");
  } finally {
    clearTimeout(timer);
  }
}

// Unsplash API guidelines: ping the photo's download_location whenever a user
// downloads it. Only genuine api.unsplash.com download endpoints are called.
export async function trackUnsplashDownload(track) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return;
  let url;
  try { url = new URL(track); } catch { return; }
  if (url.protocol !== "https:" || url.hostname !== "api.unsplash.com" || !/^\/photos\/[A-Za-z0-9_-]+\/download\/?$/.test(url.pathname)) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(url.toString(), { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getJson(url, headers = {}, timeoutMs = SEARCH_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`http-${r.status}`);
    // Some WAFs answer 200 with an HTML block page — treat that as a failure.
    if (!/json/i.test(r.headers.get("content-type") || "")) throw new Error("not-json");
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── Unsplash ────────────────────────────────────────────────────────────────
export function normalizeUnsplash(r) {
  if (!r?.id || (r.asset_type && r.asset_type !== "photo") || r.sponsorship) return null;
  const raw = r.urls?.raw;
  const name = clip(r.user?.name, 80) || "Unknown";
  return {
    id: `unsplash:${r.id}`,
    source: "unsplash",
    sourceLabel: "Unsplash",
    sourceHome: utm("https://unsplash.com/"),
    thumb: raw ? withParams(raw, "w=600&q=75&fm=jpg&fit=max") : r.urls?.small,
    src: raw ? withParams(raw, "w=1600&q=80&fm=jpg&fit=max") : r.urls?.regular,
    full: raw ? withParams(raw, "w=2400&q=85&fm=jpg&fit=max") : r.urls?.full,
    width: Number(r.width) || null,
    height: Number(r.height) || null,
    color: /^#[0-9a-f]{6}$/i.test(r.color || "") ? r.color : null,
    alt: clip(r.alt_description || r.description, 300),
    title: null,
    date: null,
    creator: name,
    creatorUrl: utm(r.user?.links?.html),
    pageUrl: utm(r.links?.html) || utm("https://unsplash.com/"),
    license: { code: "unsplash", label: "Unsplash License — free to use", commercial: true, url: "https://unsplash.com/license" },
    attribution: `Photo by ${name} on Unsplash`,
    downloadTrack: r.links?.download_location || null,
  };
}

async function searchUnsplash(q, { perQuery, page }) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const p = new URLSearchParams({ query: q, per_page: String(Math.min(30, perQuery)), page: String(page), content_filter: "high", order_by: "relevant" });
  const data = await getJson(`https://api.unsplash.com/search/photos?${p}`, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" });
  return (data.results || []).map(normalizeUnsplash).filter(Boolean);
}

// ── Pexels ──────────────────────────────────────────────────────────────────
export function normalizePexels(p) {
  const o = p?.src?.original;
  if (!p?.id || !o) return null;
  const name = clip(p.photographer, 80) || "Unknown";
  return {
    id: `pexels:${p.id}`,
    source: "pexels",
    sourceLabel: "Pexels",
    sourceHome: "https://www.pexels.com",
    thumb: withParams(o, "auto=compress&cs=tinysrgb&w=600"),
    src: withParams(o, "auto=compress&cs=tinysrgb&w=1600"),
    full: withParams(o, "auto=compress&cs=tinysrgb&w=2400"),
    width: Number(p.width) || null,
    height: Number(p.height) || null,
    color: /^#[0-9a-f]{6}$/i.test(p.avg_color || "") ? p.avg_color : null,
    alt: clip(p.alt, 300),
    title: null,
    date: null,
    creator: name,
    creatorUrl: p.photographer_url || null,
    pageUrl: p.url || "https://www.pexels.com",
    license: { code: "pexels", label: "Pexels License — free to use", commercial: true, url: "https://www.pexels.com/license/" },
    attribution: `Photo by ${name} on Pexels`,
    downloadTrack: null,
  };
}

async function searchPexels(q, { perQuery, page }) {
  const key = process.env.PEXELS_API_KEY;
  const p = new URLSearchParams({ query: q, per_page: String(Math.min(80, perQuery)), page: String(page), size: "medium" });
  const data = await getJson(`https://api.pexels.com/v1/search?${p}`, { Authorization: key });
  return (data.photos || []).map(normalizePexels).filter(Boolean);
}

// ── The Met (Open Access, CC0) ──────────────────────────────────────────────
// Search (v1.1 — v1/search was retired 2026-10-01) returns ids only; each
// object is fetched separately, so keep the fan-out small (Imperva throttles).
export function normalizeMet(o) {
  if (!o?.objectID || o.isPublicDomain !== true || !o.primaryImageSmall) return null;
  const title = clip(o.title, 160) || clip(o.objectName, 80) || "Untitled";
  const date = clip(o.objectDate, 60) || null;
  return {
    id: `met:${o.objectID}`,
    source: "met",
    sourceLabel: "The Met",
    sourceHome: "https://www.metmuseum.org/art/collection",
    thumb: o.primaryImageSmall,
    src: o.primaryImageSmall,
    full: o.primaryImageSmall, // originals can exceed the download proxy's size cap
    width: null, // the API has no pixel sizes; the client measures on load
    height: null,
    color: null,
    alt: clip([o.title, o.objectName, o.medium, o.culture, o.objectDate].filter(Boolean).join(", "), 300),
    title,
    date,
    creator: clip(o.artistDisplayName, 120) || clip(o.culture, 80) || null,
    creatorUrl: o.artistWikidata_URL || null,
    pageUrl: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
    license: { code: "cc0", label: "Public domain (CC0) — The Met Open Access", commercial: true, url: "https://www.metmuseum.org/policies/image-resources" },
    attribution: `${title}${date ? `, ${date}` : ""}. The Metropolitan Museum of Art${o.creditLine ? `, ${clip(o.creditLine, 160)}` : ""}`,
    downloadTrack: null,
  };
}

async function searchMet(q, { perQuery, page }) {
  const take = Math.min(12, perQuery + 4); // ~half of hits are not open access / imageless
  const p = new URLSearchParams({ q, hasImages: "true", offset: String((page - 1) * take), limit: String(take) });
  const data = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?${p}`);
  const ids = (data.objectIDs || []).slice(0, take);
  const objects = await mapLimit(ids, 4, (id) => getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${encodeURIComponent(id)}`, {}, 6000));
  return objects.map(normalizeMet).filter(Boolean).slice(0, perQuery);
}

// ── Cleveland Museum of Art (Open Access, CC0) ──────────────────────────────
export function normalizeCleveland(a) {
  const web = a?.images?.web;
  if (!a?.id || a.share_license_status !== "CC0" || !web?.url) return null;
  const print = a.images?.print;
  const title = clip(a.title, 160) || "Untitled";
  const date = clip(a.creation_date, 60) || null;
  return {
    id: `cma:${a.id}`,
    source: "cma",
    sourceLabel: "Cleveland Museum of Art",
    sourceHome: "https://www.clevelandart.org/open-access",
    thumb: web.url,
    src: web.url,
    // The ~3400px print file is the export copy unless it's too big for the proxy.
    full: print?.url && Number(print.filesize || 0) > 0 && Number(print.filesize) < 4_000_000 ? print.url : web.url,
    width: parseInt(web.width, 10) || null,
    height: parseInt(web.height, 10) || null,
    color: null,
    alt: clip(a.tombstone || [a.title, a.type, a.technique, a.creation_date].filter(Boolean).join(", "), 300),
    title,
    date,
    creator: clip(a.creators?.[0]?.description, 120) || clip(a.culture?.[0], 80) || null,
    creatorUrl: null,
    pageUrl: a.url || `https://clevelandart.org/art/${encodeURIComponent(a.accession_number || a.id)}`,
    license: { code: "cc0", label: "Public domain (CC0) — Cleveland Museum of Art Open Access", commercial: true, url: "https://www.clevelandart.org/open-access" },
    attribution: `${title}${date ? `, ${date}` : ""}. The Cleveland Museum of Art${a.creditline ? `, ${clip(a.creditline, 160)}` : ""}`,
    downloadTrack: null,
  };
}

async function searchCleveland(q, { perQuery, page }) {
  const p = new URLSearchParams({ q, cc0: "1", has_image: "1", limit: String(perQuery), skip: String((page - 1) * perQuery) });
  const data = await getJson(`https://openaccess-api.clevelandart.org/api/artworks/?${p}`);
  return (data.data || []).map(normalizeCleveland).filter(Boolean);
}

// ── Cooper Hewitt, Smithsonian Design Museum (Open Access, CC0; optional) ───
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
export function normalizeSmithsonian(row) {
  const d = row?.content?.descriptiveNonRepeating;
  const media = asArray(d?.online_media?.media).find((m) => m?.idsId && m?.usage?.access === "CC0" && (!m.type || m.type === "Images"));
  if (!row?.id || !media) return null;
  const f = row.content?.freetext || {};
  const iiif = (box) => `https://ids.si.edu/ids/iiif/${encodeURIComponent(media.idsId)}/full/!${box},${box}/0/default.jpg`;
  const jpeg = asArray(media.resources).find((r) => r?.width && r?.height);
  const title = clip(row.title || d?.title?.content, 160) || "Untitled";
  const date = clip(f.date?.[0]?.content, 60) || null;
  return {
    id: `si:${d?.record_ID || row.id}`,
    source: "smithsonian",
    sourceLabel: "Cooper Hewitt, Smithsonian Design Museum",
    sourceHome: "https://collection.cooperhewitt.org/",
    thumb: iiif(600),
    src: iiif(1600),
    full: iiif(2400),
    width: Number(jpeg?.width) || null,
    height: Number(jpeg?.height) || null,
    color: null,
    alt: clip([title, f.objectType?.[0]?.content, f.physicalDescription?.[0]?.content, date].filter(Boolean).join(", "), 300),
    title,
    date,
    creator: clip(f.name?.[0]?.content, 120) || null,
    creatorUrl: null,
    pageUrl: d?.record_link || "https://collection.cooperhewitt.org/",
    license: { code: "cc0", label: "Public domain (CC0) — Smithsonian Open Access", commercial: true, url: "https://www.si.edu/openaccess" },
    attribution: `${title}${date ? `, ${date}` : ""}. Cooper Hewitt, Smithsonian Design Museum`,
    downloadTrack: null,
  };
}

async function searchSmithsonian(q, { perQuery, page }) {
  const key = process.env.SMITHSONIAN_API_KEY;
  const safe = q.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  const p = new URLSearchParams({ q: `${safe} AND unit_code:CHNDM AND online_media_type:Images`, start: String((page - 1) * perQuery), rows: String(perQuery), api_key: key });
  const data = await getJson(`https://api.si.edu/openaccess/api/v1.0/search?${p}`);
  return (data.response?.rows || []).map(normalizeSmithsonian).filter(Boolean);
}

// ── Wikimedia Commons (Featured + Quality images only) ──────────────────────
const stripHtml = (h) => (typeof h === "string" ? h.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ") : "");
// Commons' CDN only serves standard thumbnail widths.
const commonsWidth = (thumbUrl, w) => (thumbUrl ? thumbUrl.replace(/\/(\d+)px-([^/?]+)(\?|$)/, `/${w}px-$2$3`) : null);
export function normalizeCommons(page) {
  const info = page?.imageinfo?.[0];
  const meta = info?.extmetadata || {};
  const restrictions = String(meta.Restrictions?.value || "");
  if (!page?.pageid || !info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime || "image/jpeg") || /trademark/i.test(restrictions)) return null;
  const name = String(page.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
  const title = clip(stripHtml(meta.ObjectName?.value) || name, 160) || "Untitled";
  const creator = clip(stripHtml(meta.Artist?.value), 120) || null;
  const lic = clip(meta.LicenseShortName?.value, 40) || "See source";
  const pd = /^(pd|cc0)/i.test(String(meta.License?.value || "")) || /public domain|cc0/i.test(lic);
  const big = info.width >= 1920 ? commonsWidth(info.thumburl, 1920) : info.size > 0 && info.size < 4_000_000 ? info.url : commonsWidth(info.thumburl, 1280);
  return {
    id: `commons:${page.pageid}`,
    source: "commons",
    sourceLabel: "Wikimedia Commons",
    sourceHome: "https://commons.wikimedia.org/wiki/Commons:Featured_pictures",
    thumb: commonsWidth(info.thumburl, 500),
    src: info.width >= 1280 ? commonsWidth(info.thumburl, 1280) : big,
    full: big,
    width: Number(info.width) || null,
    height: Number(info.height) || null,
    color: null,
    alt: clip(stripHtml(meta.ImageDescription?.value) || title, 300),
    title,
    date: clip(stripHtml(meta.DateTimeOriginal?.value), 40) || null,
    creator,
    creatorUrl: null,
    pageUrl: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
    license: pd
      ? { code: "public-domain", label: `Public domain (${lic}) — Wikimedia Commons`, commercial: true, url: meta.LicenseUrl?.value || null }
      : { code: "cc", label: `${lic} — attribution required`, commercial: !/NC/i.test(lic), url: meta.LicenseUrl?.value || null },
    attribution: `"${title}"${creator ? ` by ${creator}` : ""}, ${lic}, via Wikimedia Commons`,
    downloadTrack: null,
  };
}

async function searchCommons(q, { perQuery, page }) {
  const p = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", generator: "search", gsrnamespace: "6",
    gsrsearch: `${q} filetype:bitmap incategory:Featured_pictures_on_Wikimedia_Commons|Quality_images`,
    gsrlimit: String(Math.min(30, perQuery)), gsroffset: String((page - 1) * perQuery),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "500", iiextmetadatalanguage: "en",
    iiextmetadatafilter: "ObjectName|ImageDescription|Artist|LicenseShortName|License|LicenseUrl|Restrictions|DateTimeOriginal",
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${p}`);
  return (data.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0)).map(normalizeCommons).filter(Boolean);
}

// ── Are.na (designer-saved references; optional, Premium token) ─────────────
export function normalizeArena(b) {
  const img = b?.image;
  if (!b?.id || b.type !== "Image" || !img?.small?.src) return null;
  const saver = clip(b.user?.name, 80) || "an Are.na user";
  const origin = clip(b.source?.provider?.name, 80);
  const title = clip(b.description?.plain || (/^[0-9A-F-]{20,}$/i.test(b.title || "") ? "" : b.title), 160) || null;
  return {
    id: `arena:${b.id}`,
    source: "arena",
    sourceLabel: "Are.na",
    sourceHome: "https://www.are.na",
    thumb: img.small.src_2x || img.small.src,
    src: img.large?.src || img.medium?.src || img.small.src,
    full: img.large?.src_2x || img.large?.src || img.medium?.src || img.small.src,
    width: Number(img.width) || Number(img.large?.width) || null,
    height: Number(img.height) || Number(img.large?.height) || null,
    color: null,
    alt: clip(img.alt_text || title || "", 300),
    title,
    date: null,
    creator: origin || null,
    creatorUrl: b.source?.url || null,
    pageUrl: `https://www.are.na/block/${b.id}`,
    license: { code: "reference-only", label: "Reference only — rights stay with the original creator", commercial: false, url: b.source?.url || null },
    attribution: `${origin || "Unknown source"} · saved by ${saver} on Are.na`,
    downloadTrack: null,
  };
}

async function searchArena(q, { perQuery, page }) {
  const p = new URLSearchParams({ query: q, type: "Image", per: String(Math.min(50, perQuery)), page: String(page), sort: "score_desc" });
  const data = await getJson(`https://api.are.na/v3/search?${p}`, { Authorization: `Bearer ${process.env.ARENA_ACCESS_TOKEN}` });
  return (data.data || []).map(normalizeArena).filter(Boolean);
}

// ── Registry ────────────────────────────────────────────────────────────────
export const SOURCES = {
  unsplash: { kind: "photo", search: searchUnsplash, enabled: () => Boolean(process.env.UNSPLASH_ACCESS_KEY), optional: false },
  pexels: { kind: "photo", search: searchPexels, enabled: () => Boolean(process.env.PEXELS_API_KEY), optional: false },
  commons: { kind: "photo", search: searchCommons, enabled: () => true, optional: true },
  arena: { kind: "photo", search: searchArena, enabled: () => Boolean(process.env.ARENA_ACCESS_TOKEN), optional: true },
  met: { kind: "archive", search: searchMet, enabled: () => true, optional: false },
  cma: { kind: "archive", search: searchCleveland, enabled: () => true, optional: false },
  smithsonian: { kind: "archive", search: searchSmithsonian, enabled: () => Boolean(process.env.SMITHSONIAN_API_KEY), optional: true },
};

// Route each query to ONE source of its kind, rotating by query index and page
// so a story spreads across sources and "load more" visits different ones.
export function planQueries(queries, page) {
  const live = (kind) => Object.keys(SOURCES).filter((k) => SOURCES[k].kind === kind && SOURCES[k].enabled());
  const pools = { photo: live("photo"), archive: live("archive") };
  const counters = { photo: 0, archive: 0 };
  const plan = [];
  for (const q of queries) {
    const pool = pools[q.kind];
    if (!pool?.length) continue;
    const source = pool[(counters[q.kind]++ + page - 1) % pool.length];
    plan.push({ ...q, source });
  }
  return plan;
}

export async function searchAll(queries, { perQuery = 8, page = 1 } = {}) {
  const plan = planQueries(queries, page);
  const ok = new Set();
  const failed = new Set();
  const results = await Promise.all(plan.map(async (job) => {
    try {
      const items = await SOURCES[job.source].search(job.q, { perQuery, page });
      ok.add(job.source);
      return items.map((c) => ({ ...c, query: job.q, storyId: job.storyId }));
    } catch {
      // One failing source never fails the board; report it so the UI can say so.
      failed.add(job.source);
      return [];
    }
  }));
  const status = {};
  for (const [k, s] of Object.entries(SOURCES)) if (!s.enabled() && !s.optional) status[k] = "not-configured";
  failed.forEach((k) => { status[k] = "error"; });
  ok.forEach((k) => { status[k] = "ok"; }); // any success for a source counts as up
  const seen = new Set();
  const candidates = results.flat().filter((c) => c.thumb && c.pageUrl && isAllowedImageUrl(c.thumb) && !seen.has(c.id) && seen.add(c.id));
  return { candidates, sources: status };
}
