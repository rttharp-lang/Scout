// Unit tests for the Scout Mood server code (api/mood-*.js, server/mood/*).
// No network: global fetch is replaced per test, and Claude is mocked at the
// HTTP layer (the SDK's request to api.anthropic.com is intercepted).
// Source fixtures in scripts/fixtures/mood/ are real captured API responses.
//
// Run with:  node --test scripts/mood-api-test.mjs   (or npm run test:mood)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeUnsplash, normalizePexels, normalizeMet, normalizeCleveland, normalizeSmithsonian, normalizeCommons, normalizeArena,
  isAllowedImageUrl, fetchAllowedImage, sniffImageType, planQueries, searchAll, trackUnsplashDownload,
} from "../server/mood/sources.js";
import { scoreDecision, cleanQuery, describeSeason, BRIEF_SCHEMA, CURATE_SCHEMA } from "../server/mood/prompts.js";
import briefHandler, { normalizeBrief } from "../api/mood-brief.js";
import curateHandler from "../api/mood-curate.js";
import searchHandler from "../api/mood-search.js";
import imageHandler from "../api/mood-image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", "mood", name), "utf8"));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

const realFetch = globalThis.fetch;
const ENV_KEYS = ["ANTHROPIC_API_KEY", "UNSPLASH_ACCESS_KEY", "PEXELS_API_KEY", "SMITHSONIAN_API_KEY", "ARENA_ACCESS_TOKEN", "UNSPLASH_APP_NAME"];
let savedEnv;
beforeEach(() => { savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])); ENV_KEYS.forEach((k) => delete process.env[k]); });
afterEach(() => { globalThis.fetch = realFetch; ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }); });

// Minimal fetch mock: route(url, init) → Response | undefined (→ 404).
function mockFetch(route) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const headers = new Headers(init.headers || (typeof input === "object" ? input.headers : undefined));
    const body = init.body ?? null;
    calls.push({ url, init: { ...init, headers }, body: typeof body === "string" ? body : null });
    const res = await route(url, { ...init, headers, body });
    return res || new Response("not found", { status: 404 });
  };
  return calls;
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const image = (buf = JPEG, type = "image/jpeg") => new Response(buf, { status: 200, headers: { "content-type": type, "content-length": String(buf.length) } });

// A Claude Messages API response whose text block is `obj` as JSON.
const claudeReply = (obj, extra = {}) => json({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(obj) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 }, ...extra,
});

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  return res;
}
const post = (body) => ({ method: "POST", body, query: {} });

// ── Normalizers (real fixtures) ──────────────────────────────────────────────
test("Unsplash: hotlinked imgix sizes, utm links, credit, download tracking", () => {
  const r = fx("unsplash-search.json").results[0];
  const c = normalizeUnsplash(r);
  assert.equal(c.id, `unsplash:${r.id}`);
  assert.ok(c.thumb.startsWith(r.urls.raw) && /[?&]w=600/.test(c.thumb), "thumb is raw + w=600 (keeps ixid)");
  assert.ok(c.thumb.includes("ixid="), "ixid must be preserved");
  assert.equal(c.width, r.width);
  assert.equal(c.attribution, `Photo by ${r.user.name} on Unsplash`);
  assert.match(c.creatorUrl, /utm_source=scout_mood&utm_medium=referral/);
  assert.match(c.pageUrl, /utm_medium=referral/);
  assert.equal(c.downloadTrack, r.links.download_location);
  assert.equal(c.license.commercial, true);
  assert.ok(isAllowedImageUrl(c.thumb) && isAllowedImageUrl(c.full));
  assert.equal(normalizeUnsplash({ ...r, sponsorship: { tagline: "ad" } }), null, "sponsored results dropped");
  assert.equal(normalizeUnsplash({ ...r, asset_type: "illustration" }), null, "illustrations dropped");
});

test("Pexels: sized src.original URLs and credit", () => {
  const p = fx("pexels-search.json").photos[0];
  const c = normalizePexels(p);
  assert.equal(c.id, `pexels:${p.id}`);
  assert.match(c.thumb, /auto=compress&cs=tinysrgb&w=600$/);
  assert.equal(c.color, p.avg_color);
  assert.equal(c.attribution, `Photo by ${p.photographer} on Pexels`);
  assert.equal(c.pageUrl, p.url);
  assert.ok(isAllowedImageUrl(c.src));
});

test("The Met: only public-domain objects with an image; no pixel size", () => {
  const o = fx("met-object.json");
  const c = normalizeMet(o);
  assert.equal(c.id, `met:${o.objectID}`);
  assert.equal(c.thumb, o.primaryImageSmall);
  assert.equal(c.width, null);
  assert.equal(c.license.code, "cc0");
  assert.match(c.attribution, /The Metropolitan Museum of Art/);
  assert.ok(normalizeMet(fx("met-object-costume.json")), "costume subset normalizes");
  assert.equal(normalizeMet({ ...o, isPublicDomain: false }), null);
  assert.equal(normalizeMet({ ...o, primaryImageSmall: "" }), null);
});

test("Cleveland: CC0 only, string sizes parsed, print copy only when small enough", () => {
  const [textile, vase] = fx("cleveland-search.json").data;
  const c = normalizeCleveland(textile);
  assert.equal(c.width, 900);
  assert.equal(c.height, 802);
  assert.equal(c.full, textile.images.print.url, "2.4MB print file is the export copy");
  assert.equal(normalizeCleveland(vase).full, vase.images.web.url, "4.5MB print file falls back to web");
  assert.equal(normalizeCleveland({ ...textile, share_license_status: "Copyrighted" }), null);
});

test("Smithsonian / Cooper Hewitt: CC0 media via IIIF", () => {
  const row = fx("smithsonian-search.json").response.rows[0];
  const c = normalizeSmithsonian(row);
  assert.ok(c.thumb.startsWith("https://ids.si.edu/ids/iiif/"));
  assert.equal(c.width, 7037);
  assert.equal(c.pageUrl, row.content.descriptiveNonRepeating.record_link);
  const restricted = structuredClone(row);
  restricted.content.descriptiveNonRepeating.online_media.media.forEach((m) => { m.usage.access = "Usage conditions apply"; });
  assert.equal(normalizeSmithsonian(restricted), null);
});

test("Wikimedia Commons: standard thumb widths, TASL attribution, trademark restriction dropped", () => {
  const page = fx("commons-search.json").query.pages[0];
  const c = normalizeCommons(page);
  assert.match(c.thumb, /\/500px-/);
  assert.match(c.src, /\/960px-|\/1280px-|upload\.wikimedia\.org/);
  assert.match(c.attribution, /CC BY 2\.0, via Wikimedia Commons/);
  assert.equal(c.license.commercial, true);
  assert.ok(isAllowedImageUrl(c.thumb));
  const tm = structuredClone(page);
  tm.imageinfo[0].extmetadata.Restrictions = { value: "trademarked" };
  assert.equal(normalizeCommons(tm), null);
});

test("Are.na: image blocks only, labelled reference-only", () => {
  const data = fx("arena-search.json").data;
  const c = normalizeArena(data[0]);
  assert.equal(c.id, `arena:${data[0].id}`);
  assert.equal(c.license.code, "reference-only");
  assert.equal(c.license.commercial, false);
  assert.match(c.attribution, /saved by Jon-Kyle Mohr on Are\.na/);
  assert.equal(c.title, null, "UUID-looking filenames are not titles");
  assert.equal(normalizeArena(data[1]), null, "Link blocks are skipped");
});

// ── Allow-list / SSRF guard ──────────────────────────────────────────────────
test("isAllowedImageUrl only accepts https on the source CDNs", () => {
  assert.ok(isAllowedImageUrl("https://images.unsplash.com/photo-1?w=600"));
  assert.ok(isAllowedImageUrl("https://openaccess-cdn.clevelandart.org/1/1_web.jpg"));
  for (const bad of [
    "http://images.unsplash.com/x", "https://evil.com/x.jpg", "https://images.unsplash.com.evil.com/x",
    "https://user:pw@images.unsplash.com/x", "https://images.unsplash.com:8443/x", "https://169.254.169.254/latest",
    "file:///etc/passwd", "javascript:alert(1)", "not a url", "",
  ]) assert.equal(isAllowedImageUrl(bad), false, bad);
});

test("fetchAllowedImage re-checks every redirect hop and caps size", async () => {
  mockFetch((url) => (url.includes("images.pexels.com/a")
    ? new Response(null, { status: 302, headers: { location: "https://169.254.169.254/secret" } })
    : url.includes("images.pexels.com/b") ? new Response(null, { status: 302, headers: { location: "/c" } })
      : url.includes("images.pexels.com/c") ? image() : undefined));
  await assert.rejects(fetchAllowedImage("https://images.pexels.com/a"), /host-not-allowed/);
  const buf = await fetchAllowedImage("https://images.pexels.com/b");
  assert.equal(sniffImageType(buf), "image/jpeg");
  await assert.rejects(fetchAllowedImage("https://images.pexels.com/c", { maxBytes: 4 }), /too-large/);
});

test("sniffImageType recognises the four Claude-supported formats only", () => {
  assert.equal(sniffImageType(JPEG), "image/jpeg");
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImageType(Buffer.from("GIF89a")), "image/gif");
  assert.equal(sniffImageType(Buffer.from("RIFF0000WEBPVP8 ")), "image/webp");
  assert.equal(sniffImageType(Buffer.from("<svg xmlns=")), null);
});

// ── Query routing + search ───────────────────────────────────────────────────
test("planQueries spreads photo/archive queries across configured sources", () => {
  const qs = [{ q: "a", kind: "photo" }, { q: "b", kind: "photo" }, { q: "c", kind: "photo" }, { q: "d", kind: "archive" }, { q: "e", kind: "archive" }];
  assert.deepEqual(planQueries(qs, 1).map((x) => x.source), ["commons", "commons", "commons", "met", "cma"], "keyless: Commons + museums");
  process.env.UNSPLASH_ACCESS_KEY = "u";
  process.env.PEXELS_API_KEY = "p";
  assert.deepEqual(planQueries(qs, 1).map((x) => x.source), ["unsplash", "pexels", "commons", "met", "cma"]);
  assert.deepEqual(planQueries(qs, 2).map((x) => x.source), ["pexels", "commons", "unsplash", "cma", "met"], "page 2 rotates sources");
});

test("searchAll: one failing source is reported, never fatal; unconfigured sources flagged", async () => {
  process.env.UNSPLASH_ACCESS_KEY = "u";
  const calls = mockFetch((url) => {
    if (url.startsWith("https://api.unsplash.com/search/photos")) return json(fx("unsplash-search.json"));
    if (url.startsWith("https://openaccess-api.clevelandart.org/")) return json(fx("cleveland-search.json"));
    if (url.startsWith("https://collectionapi.metmuseum.org/")) return new Response("<html>blocked</html>", { status: 200, headers: { "content-type": "text/html" } });
    if (url.startsWith("https://commons.wikimedia.org/")) return json(fx("commons-search.json"));
    return undefined;
  });
  const out = await searchAll([
    { q: "wet asphalt night", kind: "photo", storyId: "s1" }, { q: "rope macro", kind: "photo", storyId: "s1" },
    { q: "boro jacket", kind: "archive", storyId: "s1" }, { q: "lace collar", kind: "archive", storyId: "s1" },
  ], { perQuery: 8, page: 1 });
  assert.equal(out.sources.unsplash, "ok");
  assert.equal(out.sources.pexels, "not-configured");
  assert.equal(out.sources.met, "error", "WAF HTML page counts as a failure");
  assert.equal(out.sources.cma, "ok");
  assert.ok(out.candidates.length >= 4);
  assert.ok(out.candidates.every((c) => c.storyId === "s1" && c.query && isAllowedImageUrl(c.thumb)));
  assert.equal(new Set(out.candidates.map((c) => c.id)).size, out.candidates.length, "deduped");
  const u = calls.find((c) => c.url.startsWith("https://api.unsplash.com"));
  assert.equal(u.init.headers.get("authorization"), "Client-ID u");
  assert.match(u.url, /content_filter=high/);
  const met = calls.find((c) => c.url.includes("metmuseum"));
  assert.match(met.url, /\/v1\.1\/search\?/, "uses the v1.1 search endpoint (v1 is retired)");
  assert.ok(calls.every((c) => c.init.headers.get("user-agent")?.startsWith("ScoutMood/")), "sends a contact User-Agent");
});

test("mood-search handler validates input", async () => {
  const res = fakeRes();
  await searchHandler(post({ queries: [] }), res);
  assert.equal(res.statusCode, 400);
  const res2 = fakeRes();
  await searchHandler({ method: "GET", query: {} }, res2);
  assert.equal(res2.statusCode, 405);
});

// ── Prompts helpers ─────────────────────────────────────────────────────────
test("cleanQuery strips cliché words and caps length", () => {
  assert.equal(cleanQuery("minimalist luxury fashion model outfit", 6), "");
  assert.equal(cleanQuery("wet asphalt night aesthetic vibes", 6), "wet asphalt night");
  assert.equal(cleanQuery("gorpcore fishing trawler deck crew at dawn light", 4), "fishing trawler deck crew");
});

test("describeSeason resolves Nike-style and fashion codes with lead time", () => {
  const now = new Date(2026, 9, 7);
  assert.deepEqual([describeSeason("SU28", now).code, describeSeason("SU28", now).monthsAhead], ["SU28", 18]);
  assert.equal(describeSeason("FW2027", now).code, "FW27");
  assert.equal(describeSeason("HO26", now).monthsAhead, 0);
  assert.equal(describeSeason("weird", now).monthsAhead, null);
});

test("scoreDecision applies the rubric threshold in code", () => {
  const s = (o) => ({ brief_fit: 4, specificity: 4, material: 4, palette: 4, craft: 4, lateral: 3, ...o });
  assert.equal(scoreDecision({ reject: [], scores: s(), role: "material" }).keep, true);
  assert.equal(scoreDecision({ reject: ["watermark"], scores: s(), role: "material" }).keep, false, "any hard reject cuts");
  assert.equal(scoreDecision({ reject: [], scores: s({ brief_fit: 2, craft: 5, specificity: 5 }), role: "material" }).keep, false, "brief fit < 3 cuts");
  assert.equal(scoreDecision({ reject: [], scores: s({ lateral: 1 }), role: "material" }).keep, false, "a dimension ≤ 1 cuts");
  assert.equal(scoreDecision({ reject: [], scores: s({ material: 0, brief_fit: 5, palette: 5 }), role: "place" }).keep, true, "material exempt for place");
  assert.equal(scoreDecision({ reject: [], scores: { brief_fit: 3, specificity: 3, material: 3, palette: 3, craft: 3, lateral: 3 }, role: "people" }).keep, false, "3.0 weighted is below 3.6");
  assert.equal(scoreDecision({ reject: [], scores: s(), role: "material" }).score, 78);
});

test("structured-output schemas avoid unsupported JSON-schema keywords", () => {
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    for (const k of ["minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength", "pattern"]) assert.equal(node[k], undefined, `unsupported keyword ${k}`);
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false, "objects must set additionalProperties: false");
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), "all properties required");
    }
    Object.values(node).forEach(walk);
  };
  walk(BRIEF_SCHEMA);
  walk(CURATE_SCHEMA);
});

// ── mood-brief handler (Claude mocked) ───────────────────────────────────────
const RAW_BRIEF = {
  title: "Salt & Signal", tagline: "Harbour work meets night running.", concept: "Concept text.",
  macro: { shift: "Shift.", drivers: [{ pillar: "Society", signal: "Run crews", implication: "Visibility" }], consumer: { name: "Night Crew", mindset: "Mindset." }, stage: "growing", confidence: "Evidence vs provocation." },
  stories: [
    { id: "Salt Line", name: "Salt Line", role: "anchor", narrative: "N.", keywords: ["Salt"], queries: { photo: ["sun-faded nylon fishing boat", "minimalist fashion outfit", "harbour crane dusk", "frayed rope macro"], archive: ["fisherman sweater wool", "oilskin coat"] } },
    { id: "salt-line", name: "Signal", role: "edge", narrative: "N2.", keywords: ["neon"], queries: { photo: ["flare smoke night"], archive: [] } },
  ],
  palette: [{ name: "Salt", hex: "#eeeeee", role: "neutral", source: "salt crust" }, { name: "Bad", hex: "red", role: "core", source: "" }],
  materials: ["waxed cotton, dry hand"], silhouettes: ["boxy smock"], details: ["bar-tacks"], graphics: ["signal flags"], references: ["Bernd and Hilla Becher"], avoid: ["nautical stripes"],
};

test("mood-brief: 503 without a key, 400 without a direction", async () => {
  const r1 = fakeRes();
  await briefHandler(post({ direction: "x" }), r1);
  assert.equal(r1.statusCode, 503);
  assert.equal(r1.body.error, "ai-not-configured");
  process.env.ANTHROPIC_API_KEY = "k";
  const r2 = fakeRes();
  await briefHandler(post({ direction: "   " }), r2);
  assert.equal(r2.statusCode, 400);
});

test("mood-brief: calls Opus 5.5 with structured output + fallbacks, then normalizes", async () => {
  process.env.ANTHROPIC_API_KEY = "k";
  const calls = mockFetch((url) => (url.startsWith("https://api.anthropic.com/") ? claudeReply(RAW_BRIEF) : undefined));
  const res = fakeRes();
  await briefHandler(post({ direction: "Harbour workwear for night runners", season: "SU28", categories: ["Running"] }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const req = JSON.parse(calls[0].body);
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.fallbacks, "default");
  assert.equal(req.thinking, undefined, "Opus 5.5 thinking cannot be configured off");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.match(calls[0].init.headers.get("anthropic-beta"), /server-side-fallback-2026-07-01/);
  assert.match(req.messages[0].content, /SEASON: Summer \(SU\) 2028/);
  const b = res.body.brief;
  assert.equal(b.season, "SU28");
  assert.deepEqual(b.stories.map((s) => s.id), ["salt-line", "salt-line-2"], "story ids unique");
  assert.deepEqual(b.stories[0].queries.photo, ["sun-faded nylon fishing boat", "harbour crane dusk", "frayed rope macro"], "cliché query dropped");
  assert.deepEqual(b.palette.map((c) => c.hex), ["#EEEEEE"], "invalid hex dropped");
  assert.equal(b.stories[0].keywords[0], "salt");
});

test("mood-brief: a refusal maps to 422", async () => {
  process.env.ANTHROPIC_API_KEY = "k";
  mockFetch(() => claudeReply({}, { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: "nope" } }));
  const res = fakeRes();
  await briefHandler(post({ direction: "x" }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, "refused");
});

test("normalizeBrief survives garbage", () => {
  const b = normalizeBrief({ stories: "nope", palette: null, macro: 3 }, "FA28");
  assert.equal(b.title, "Untitled direction");
  assert.deepEqual(b.stories, []);
  assert.deepEqual(b.macro.drivers, []);
});

// ── mood-curate handler (Claude + image hosts mocked) ────────────────────────
test("mood-curate: fetches thumbs server-side, applies threshold + photographer cap", async () => {
  process.env.ANTHROPIC_API_KEY = "k";
  const good = { brief_fit: 5, specificity: 4, material: 4, palette: 4, craft: 4, lateral: 4 };
  const weak = { brief_fit: 2, specificity: 2, material: 2, palette: 2, craft: 2, lateral: 2 };
  const calls = mockFetch((url) => {
    if (url.startsWith("https://api.anthropic.com/")) {
      return claudeReply({ decisions: [
        { index: 1, reject: [], scores: good, role: "material", note: "Take the waxed hand." },
        { index: 2, reject: ["watermark"], scores: good, role: "place", note: "" },
        { index: 3, reject: [], scores: weak, role: "people", note: "" },
        { index: 4, reject: [], scores: good, role: "people", note: "Crew at dawn." },
        { index: 5, reject: [], scores: good, role: "place", note: "Harbour light." },
        { index: 99, reject: [], scores: good, role: "place", note: "bogus index" },
      ] });
    }
    if (url.includes("/dead")) return new Response("gone", { status: 404 });
    if (url.startsWith("https://images.unsplash.com/")) return image();
    return undefined;
  });
  const cand = (i, creator = "Ana") => ({ id: `unsplash:${i}`, thumb: `https://images.unsplash.com/${i}?w=600`, alt: `alt ${i}`, source: "unsplash", creator });
  const res = fakeRes();
  await curateHandler(post({
    brief: { title: "Salt & Signal", concept: "c", palette: [{ name: "Salt", hex: "#EEEEEE" }], avoid: ["stripes"] },
    story: { id: "s", name: "Salt Line", role: "anchor", narrative: "n", keywords: ["salt"] },
    candidates: [cand(1), cand(2), cand(3), cand("dead"), cand(4), cand(5), { id: "x:evil", thumb: "https://evil.com/a.jpg", source: "x" }],
    keep: 10,
  }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  // Labels are 1..5 over the 5 fetchable allowed images: 1,2,3,4,5 → ids 1,2,3,4,5
  assert.deepEqual(res.body.picks.map((p) => p.id), ["unsplash:1", "unsplash:4"], "two from photographer Ana, third capped");
  const reasons = Object.fromEntries(res.body.rejected.map((r) => [r.id, r.reason]));
  assert.equal(reasons["unsplash:dead"], "unavailable");
  assert.equal(reasons["x:evil"], "unavailable", "non-allow-listed thumb never fetched");
  assert.equal(reasons["unsplash:2"], "watermark");
  assert.match(reasons["unsplash:3"], /below the bar/);
  assert.match(reasons["unsplash:5"], /photographer/);
  assert.ok(!calls.some((c) => c.url.includes("evil.com")), "SSRF: evil host never requested");
  const req = JSON.parse(calls.find((c) => c.url.startsWith("https://api.anthropic.com/")).body);
  const imgs = req.messages[0].content.filter((b) => b.type === "image");
  assert.equal(imgs.length, 5);
  assert.equal(imgs[0].source.type, "base64");
  assert.equal(imgs[0].source.media_type, "image/jpeg");
});

test("mood-curate: no fetchable images → empty picks without calling Claude", async () => {
  process.env.ANTHROPIC_API_KEY = "k";
  const calls = mockFetch(() => new Response("gone", { status: 404 }));
  const res = fakeRes();
  await curateHandler(post({ story: { name: "s" }, candidates: [{ id: "a", thumb: "https://images.pexels.com/a" }] }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.picks, []);
  assert.ok(!calls.some((c) => c.url.includes("anthropic")));
});

// ── mood-image proxy ─────────────────────────────────────────────────────────
test("mood-image: rejects non-allow-listed URLs, streams allowed ones as attachments", async () => {
  const r1 = fakeRes();
  await imageHandler({ method: "GET", query: { u: "https://evil.com/x.jpg" } }, r1);
  assert.equal(r1.statusCode, 400);

  process.env.UNSPLASH_ACCESS_KEY = "u";
  const calls = mockFetch((url) => {
    if (url.startsWith("https://images.unsplash.com/")) return image();
    if (url.startsWith("https://api.unsplash.com/photos/abc/download")) return json({ url: "x" });
    return undefined;
  });
  const r2 = fakeRes();
  await imageHandler({ method: "GET", query: { u: "https://images.unsplash.com/photo-1?w=2400", name: "../../etc/passwd", track: "https://api.unsplash.com/photos/abc/download?ixid=1" } }, r2);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.headers["content-type"], "image/jpeg");
  assert.match(r2.headers["content-disposition"], /^attachment; filename="[a-z0-9._-]+\.jpg"$/i);
  assert.ok(!r2.headers["content-disposition"].includes("/"), "no path separators in file name");
  const track = calls.find((c) => c.url.startsWith("https://api.unsplash.com/"));
  assert.ok(track, "Unsplash download was tracked");
  assert.equal(track.init.headers.get("authorization"), "Client-ID u");
});

test("trackUnsplashDownload ignores anything that isn't an Unsplash download endpoint", async () => {
  process.env.UNSPLASH_ACCESS_KEY = "u";
  const calls = mockFetch(() => json({}));
  await trackUnsplashDownload("https://evil.com/photos/a/download");
  await trackUnsplashDownload("https://api.unsplash.com/me");
  assert.equal(calls.length, 0);
});
