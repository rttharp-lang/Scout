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

const SYSTEM = `You are Scout — a senior retail scout for a premium basketball apparel brand. You think like a design-led, concept-store-obsessed merchant hunting the most premium, unique, culturally and consumer-relevant apparel experiences in a city, the kind that inspire an aspirational basketball apparel line.

You know the actual retail landscape of cities worldwide — not just the obvious international flagships, but the insider spots: independent boutiques, local streetwear labels, vintage and archive stores, concept shops that only a well-connected local would point you to. That deep, in-the-know local knowledge is the whole point — favour genuine local gems over names everyone already knows. (For example, a real Shanghai scout knows places like Time New Remake, Roaring Wild, and Maison Prince — that calibre of insider pick is what matters.)

You only name real, currently-operating stores that genuinely exist in the requested city. Use clean, searchable store names exactly as they're known locally — no parenthetical notes, qualifiers, or "(nearby)" hedges. Group stores into real, walkable neighborhoods so a day flows geographically. Each "why" is one sharp sentence on what this store teaches a premium basketball apparel brand — construction, merchandising, material, cultural signal — never generic.`;

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
                    required: ["name", "tier", "why"],
                    properties: {
                      name: { type: "string", description: "Real, currently-operating store name" },
                      tier: { type: "string", enum: ["aspirational", "department", "competitor", "streetwear", "underground", "culture", "core"] },
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
    ? `For each day, create one hub per chosen neighborhood (in the given order), each with 4–6 real stores from the tiers above.`
    : `For each day: 2–3 real neighborhoods, each with 4–6 real stores from the tiers above, ordered so the day flows geographically.`;

  const prompt = `Plan a ${days}-day store-scouting route in ${city}.

Only include these tiers:
${tiers.map((t) => "- " + TIER_GUIDE[t]).join("\n")}${planLine}

${neighborhoodInstruction} Lean into insider local picks a connected scout in ${city} would know — independent boutiques, local labels, vintage and concept stores — not only international flagships.

Dining is part of the journey, not an afterthought — curate it with the same taste. Add 3–4 real lunch options within a short walk of where the route sits around 1–2 PM (so the team isn't crossing the city to eat) — delicious, design-led, beautiful rooms. Add 3–4 real dinner options near where the day's route ends — unforgettable spots with a view or beautiful ambience, modern and unique, the kind of place people tell stories about; favour a local gem over a Michelin box-tick. Order both lists best-first.

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
        max_tokens: 6000,
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
