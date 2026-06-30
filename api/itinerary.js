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
  department: "Department store — luxury & multi-brand department stores: curation, merchandising mastery, depachika energy.",
  competitor: "Competitor — athletic & adjacent brands (adidas, On, Arc'teryx, Lululemon, New Balance, Salomon).",
  streetwear: "Streetwear — hype, drops & especially LOCAL/independent street labels and homegrown brands, not just global hype names.",
  underground: "Underground — vintage, archive, concept and insider-only stores: the deep cuts only a well-connected local would know.",
  culture: "Culture — lifestyle & retail-as-culture: concept stores, bookshops, galleries-as-retail.",
  core: "Core — commercial & value at scale: where culture meets the high street.",
};

const SYSTEM = `You are the most discerning apparel retail editor — a senior editor at the level of Hypebeast or Highsnobiety, curating a shopping/scouting route for an industry insider building a premium apparel line. You recommend the BEST apparel retail destinations in a city: leading luxury, streetwear, concept, vintage and multi-brand stores.

EVERY store you name MUST be:
- APPAREL-FOCUSED — clothing, footwear, and apparel-driven concept/multi-brand stores ONLY. NEVER general markets, souvenir or trinket shops, electronics, homeware/home goods, furniture, beauty-only, bookstores, galleries, or any non-apparel retail.
- LEADING, NOT GENERIC — only destinations a knowledgeable industry insider would actually route to. No mall basics and no chains for the sake of it; a flagship that genuinely matters is fine, a generic outpost is not. Favour genuine local gems and insider picks over names everyone already knows.
- REAL and currently operating, named cleanly and searchably (no parentheticals, qualifiers or "(nearby)" hedges).

Across a neighborhood, VARY the types — mix vintage, multi-brand, concept, streetwear and luxury so the route has range, not five of the same thing.

QUALITY BAR — match this calibre and taste. In New York that means the level of Dover Street Market, Patron of the New (a more forward Dover Street), Bluegreen in SoHo (considered, "capital" clothing), and Kith. Apply this SAME editorial taste to EVERY city — including non-major markets like Las Vegas — finding the genuine best apparel retail there, not filler. If a place has few true destinations, name FEWER high-quality ones rather than padding with mediocre stores.

Group stores into real, walkable neighborhoods so a day flows geographically. Each "why" is one sharp editor's-take sentence on what makes this store worth the trip for a premium apparel brand — construction, merchandising, material, cultural signal — never generic.`;

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
        required: ["label", "hubs", "lunch", "dinner"],
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
                    required: ["name", "tier", "category", "why"],
                    properties: {
                      name: { type: "string", description: "Real, currently-operating APPAREL store name" },
                      tier: { type: "string", enum: ["aspirational", "department", "competitor", "streetwear", "underground", "culture", "core"] },
                      category: { type: "string", enum: ["vintage", "multi-brand", "concept", "streetwear", "luxury"], description: "Editorial type tag" },
                      why: { type: "string", description: "One sharp editor's-take sentence on why this apparel store is worth the trip" },
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
                name: { type: "string", description: "Real lunch restaurant within a short walk of the day's route, around 1–2 PM" },
                cuisine: { type: "string" },
                why: { type: "string", description: "Why it's a delicious, design-led, aesthetically beautiful lunch — the kind that makes the day feel special, not a tourist trap" },
              },
            },
          },
          dinner: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "cuisine", "why"],
              properties: {
                name: { type: "string", description: "Real dinner restaurant near where the day's route ends" },
                cuisine: { type: "string" },
                why: { type: "string", description: "Why it's an unforgettable dinner — a great view, beautiful ambience, modern and unique; the kind of place people tell stories about. Local gem over Michelin box-ticking." },
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
  // Optional pre-curated plan: a per-day array of neighborhood names.
  let plan = null;
  try { const p = JSON.parse(req.query.plan || "null"); if (Array.isArray(p)) plan = p; } catch {}

  if (!city) { res.status(400).json({ error: "no-city" }); return; }
  if (!tiers.length) { res.status(400).json({ error: "no-tiers" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Not configured yet — the client falls back to the curated sample.
    res.status(503).json({ error: "ai-not-configured" });
    return;
  }

  const planLine = plan
    ? `\n\nThe scout has chosen these exact neighborhoods per day. Use EXACTLY these, in this order, one "hub" per neighborhood — do not add, drop or reorder neighborhoods:\n${plan.map((hoods, i) => `Day ${i + 1}: ${hoods.join(", ")}`).join("\n")}\n`
    : "";

  const neighborhoodInstruction = plan
    ? `For each day, create one hub per chosen neighborhood (in the given order), each with the 4 best real APPAREL stores in it (give 3 only if the neighborhood genuinely doesn't have 4 worth routing to).`
    : `For each day: 2–3 real neighborhoods, each with the 4 best real APPAREL stores in it, ordered so the day flows geographically.`;

  const prompt = `Plan a ${days}-day store-scouting route in ${city}.

Only include these tiers:
${tiers.map((t) => "- " + TIER_GUIDE[t]).join("\n")}${planLine}

${neighborhoodInstruction} Apparel only — clothing, footwear and apparel-driven concept/multi-brand stores; absolutely NO markets, souvenir/trinket shops, electronics, homeware, beauty-only, or bookstores. Lean into the insider apparel picks a connected ${city} editor would route to — independent boutiques, local labels, vintage, concept and the multi-brand destinations that matter — not generic flagships, and tag each store's category (vintage / multi-brand / concept / streetwear / luxury).

Dining is part of the journey, not an afterthought — curate it with the same taste. Add 3 real lunch options within a short walk of where the route sits around 1–2 PM (so the team isn't crossing the city to eat) — delicious, design-led, beautiful rooms. Add 3 real dinner options near where the day's route ends — unforgettable spots with a view or beautiful ambience, modern and unique, the kind of place people tell stories about; favour a local gem over a Michelin box-tick. Order both lists best-first.

Every store and restaurant must actually exist in ${city} right now, named cleanly with no parentheticals. Keep each "why" to one sharp, specific sentence.`;

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
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "low" },
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
