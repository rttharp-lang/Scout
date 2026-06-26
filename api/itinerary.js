// Serverless endpoint that generates a city-specific scouting itinerary with
// Claude (Opus 4.8). The model acts as a senior retail scout and returns a
// structured list of real neighborhoods + stores per day; the client then
// enriches each store with live Google Places data. The Anthropic API key
// stays server-side (ANTHROPIC_API_KEY env var) and is never sent to the
// browser. Calls the Messages API over HTTPS directly to avoid adding a build
// dependency to the project.

export const config = { maxDuration: 60 };

const TIER_GUIDE = {
  aspirational: "Aspirational — luxury & designer flagships: construction, theatre, top of the range.",
  competitor: "Competitor — athletic & adjacent brands (adidas, On, Arc'teryx, Lululemon, New Balance, Salomon).",
  core: "Core — commercial & streetwear: value, fabric, scale, where culture meets the high street.",
  culture: "Culture — lifestyle & retail-as-culture: concept stores, bookshops, galleries-as-retail.",
};

const SYSTEM = `You are Scout — a senior retail scout for a premium basketball apparel brand. You think like a design-led, concept-store-obsessed merchant hunting the most premium, unique, culturally and consumer-relevant apparel experiences in a city, the kind that inspire an aspirational basketball apparel line.

You know the actual retail landscape of major cities: which real, currently-operating stores matter, which neighborhoods they cluster in, and why each one is worth a scout's time. You only name real stores that genuinely exist in the requested city. You group them into real, walkable neighborhoods so a day flows geographically. Each "why" is one sharp sentence on what this store teaches a premium basketball apparel brand — construction, merchandising, material, cultural signal — never generic.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "hubs", "lunch"],
        properties: {
          label: { type: "string", description: "Short route label, e.g. 'Aoyama → Shibuya'" },
          hubs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["hub", "stores"],
              properties: {
                hub: { type: "string", description: "Real neighborhood / district name" },
                stores: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "tier", "why"],
                    properties: {
                      name: { type: "string", description: "Real, currently-operating store name" },
                      tier: { type: "string", enum: ["aspirational", "competitor", "core", "culture"] },
                      why: { type: "string", description: "One sharp sentence: what it teaches a premium basketball apparel brand" },
                    },
                  },
                },
              },
            },
          },
          lunch: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "cuisine", "why"],
              properties: {
                name: { type: "string", description: "Real restaurant near the day's route" },
                cuisine: { type: "string" },
                why: { type: "string", description: "Why it's a memorable team meal, not a tourist trap" },
              },
            },
          },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  const city = (req.query.city || "").toString().trim();
  const tiers = (req.query.tiers || "").toString().split(",").map((t) => t.trim()).filter((t) => TIER_GUIDE[t]);
  const days = Math.max(1, Math.min(6, parseInt(req.query.days, 10) || 1));

  if (!city) { res.status(400).json({ error: "no-city" }); return; }
  if (!tiers.length) { res.status(400).json({ error: "no-tiers" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Not configured yet — the client falls back to the curated sample.
    res.status(503).json({ error: "ai-not-configured" });
    return;
  }

  const prompt = `Plan a ${days}-day store-scouting route in ${city}.

Only include these tiers:
${tiers.map((t) => "- " + TIER_GUIDE[t]).join("\n")}

For each day: 2–3 real neighborhoods, each with 4–6 real stores from the tiers above, ordered so the day flows geographically. Add 3–4 real lunch options near that day's route. Every store and restaurant must actually exist in ${city} right now. Keep each "why" to one sharp, specific sentence.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 6000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "medium" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "itinerary-request-failed", detail });
      return;
    }

    const data = await r.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) { res.status(502).json({ error: "no-itinerary" }); return; }

    res.status(200).json(JSON.parse(textBlock.text));
  } catch (e) {
    res.status(500).json({ error: "itinerary-failed", detail: String(e) });
  }
}
