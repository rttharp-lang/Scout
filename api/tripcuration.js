// Single-pass trip curation. ONE Claude call returns the COMPLETE trip payload
// as structured JSON: day-grouped neighborhoods (each with its curated apparel
// stores), citywide dining (lunch + dinner options), and date-aware
// experiences/events. The client caches this payload for the trip and only uses
// the places/photo APIs to HYDRATE details (addresses, photos, hours) for items
// the AI already named — never to source the lists. Anthropic key stays
// server-side (ANTHROPIC_API_KEY).

// 60s is the known-deployable ceiling on this project (Hobby without Fluid
// Compute fails the whole build above it). The payload sizes below are tuned to
// fit one generation inside it; if Fluid Compute is enabled on the Vercel
// project this can go to 300 and the counts can grow.
export const config = { maxDuration: 60 };

const TIER_GUIDE = {
  aspirational: "Aspirational — luxury & designer flagships: construction, theatre, top of the range.",
  department: "Department store — luxury & multi-brand department stores: curation, merchandising mastery.",
  competitor: "Competitor — athletic & adjacent brands (adidas, On, Arc'teryx, Lululemon, New Balance, Salomon).",
  streetwear: "Streetwear — hype, drops & especially LOCAL/independent street labels, not just global hype names.",
  underground: "Underground — vintage, archive, concept and insider-only stores: the deep cuts.",
  culture: "Culture — apparel-led retail-as-culture: concept stores where clothing is the core.",
  core: "Core — commercial & value at scale: where culture meets the high street.",
};

// The curation standard (Stage 1B): insider, experiential, apparel-first.
const SYSTEM = `You are the most discerning culture, retail, and food editor alive — the insider a Nike apparel executive would text for the real list. This tool exists for industry insiders who can already find the obvious stuff themselves; every recommendation must carry insider, experiential value — the if-you-know-you-know picks. For the given city, hotel, and dates, curate:

RETAIL (apparel-first, hard rule): only clothing/footwear/apparel destinations — leading luxury, streetwear, concept, elevated multi-brand, and genuinely notable vintage (curated/archival, NOT generic thrift). EXCLUDE general stores, lifestyle/home-goods shops, markets, souvenir shops, and any store whose main identity isn't apparel. Quality bar (New York calibration): Dover Street Market, Patron of the New, Bluegreen, Kith. Vary the mix across vintage / multi-brand / concept / streetwear / luxury. If a neighborhood has only 2 truly leading spots, return 2 — never pad.

DINING (lunch + dinner): the spots locals and industry people actually eat — standout independents, chef-driven rooms, iconic institutions that still deliver, quietly-great neighborhood gems. NO tourist traps, NO hotel-lobby defaults, NO chains, NO "highest-rated app filler." Lunch picks suit a midday route break; dinner picks suit a memorable evening. Vary cuisine, price, format.

EXPERIENCES/EVENTS: culturally relevant things happening or worth doing during THESE dates — gallery/museum shows, archives, design destinations, courts/sport culture, music, markets worth it, studio/showroom visits. Insider-grade, not tourist checklist. Use the trip dates to prefer what's actually on.

NEIGHBORHOODS: only include neighborhoods that genuinely contain curated picks. A neighborhood with no qualifying stores must not appear. Group each day's neighborhoods so they cluster geographically, and make different days cover different parts of the city.

For every item: a real, currently-operating place named cleanly and searchably (no parentheticals, qualifiers or "(nearby)" hedges), its neighborhood, a one-line editor's take (why it matters), and a category tag. Fewer excellent picks always beats more mediocre ones. Apply this bar identically in secondary markets — Las Vegas must read like an insider's list, not a Strip tourist guide.`;

const STORE = {
  type: "object",
  additionalProperties: false,
  required: ["name", "tier", "category", "why"],
  properties: {
    name: { type: "string", description: "Real, currently-operating APPAREL store" },
    tier: { type: "string", enum: ["aspirational", "department", "competitor", "streetwear", "underground", "culture", "core"] },
    category: { type: "string", enum: ["vintage", "multi-brand", "concept", "streetwear", "luxury"], description: "Editorial type tag" },
    why: { type: "string", description: "One-line editor's take: why it matters" },
  },
};

const MEAL = {
  type: "object",
  additionalProperties: false,
  required: ["name", "cuisine", "neighborhood", "why"],
  properties: {
    name: { type: "string", description: "Real, currently-operating restaurant" },
    cuisine: { type: "string" },
    neighborhood: { type: "string", description: "Its neighborhood" },
    why: { type: "string", description: "One-line editor's take" },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days", "dining", "experiences"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["neighborhoods"],
        properties: {
          neighborhoods: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "blurb", "stores"],
              properties: {
                name: { type: "string", description: "Real neighborhood/district name" },
                blurb: { type: "string", description: "One vivid line on what this neighborhood is" },
                stores: { type: "array", items: STORE },
              },
            },
          },
        },
      },
    },
    dining: {
      type: "object",
      additionalProperties: false,
      required: ["lunch", "dinner"],
      properties: {
        lunch: { type: "array", items: MEAL },
        dinner: { type: "array", items: MEAL },
      },
    },
    experiences: {
      type: "array",
      description: "Ordered best-first; the FIRST item is the single editor's pick.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "neighborhood", "category", "why", "during"],
        properties: {
          name: { type: "string", description: "Real venue, show or event" },
          neighborhood: { type: "string" },
          category: { type: "string", description: "e.g. gallery, museum, archive, design, sport, music, market, studio" },
          why: { type: "string", description: "One-line editor's take" },
          during: { type: "boolean", description: "true only if it is actually on during the trip dates" },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  const city = (req.query.city || "").toString().trim();
  const tiers = (req.query.tiers || "").toString().split(",").map((t) => t.trim()).filter((t) => TIER_GUIDE[t]);
  const days = Math.max(1, Math.min(6, parseInt(req.query.days, 10) || 1));
  const hotel = (req.query.hotel || "").toString().trim();
  const dates = (req.query.dates || "").toString().trim();
  if (!city) { res.status(400).json({ error: "no-city" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: "ai-not-configured" }); return; }

  const focus = tiers.length
    ? `Retail focus tiers:\n${tiers.map((t) => "- " + TIER_GUIDE[t]).join("\n")}`
    : "Retail focus: premium, culturally relevant apparel across luxury, streetwear, concept, vintage and multi-brand.";

  const prompt = `Curate a complete ${days}-day trip to ${city}.${hotel ? ` The traveler is staying at ${hotel}.` : ""}${dates ? ` Trip dates: ${dates}.` : ""}

${focus}

Return ONE payload with:
1. DAYS — for each of the ${days} day(s): 2–3 real neighborhoods (clustered geographically within the day; different days cover different parts of the city), each with its 3 best qualifying apparel stores (a 4th only when it truly clears the bar; fewer when only fewer are leading; omit any neighborhood that has no qualifying stores).
2. DINING — 3 lunch options and 3 dinner options across the city, near where the retail routes run, each ordered best-first.
3. EXPERIENCES — 4–5 experiences/events worth an insider's time${dates ? ` during ${dates}` : ""}, ordered best-first (the FIRST is your single editor's pick). Set "during" to true only for things actually on during the dates.

Every place must exist in ${city} right now. Keep every "why" to one sharp sentence.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 6000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) { const detail = await r.text(); res.status(502).json({ error: "curation-request-failed", detail }); return; }
    const data = await r.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) { res.status(502).json({ error: "no-output" }); return; }
    res.status(200).json(JSON.parse(textBlock.text));
  } catch (e) {
    res.status(500).json({ error: "curation-failed", detail: String(e) });
  }
}
