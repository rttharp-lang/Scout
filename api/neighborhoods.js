// Pre-curates a day-by-day neighborhood plan for a city: which districts to
// scout each day, grouped so each day flows geographically and different days
// cover different parts of the city. Each neighborhood comes with what it's
// known for and why an apparel design team would benefit from scouting it.
// The scout reviews/adjusts, then /api/itinerary fills in stores. Anthropic key
// stays server-side (ANTHROPIC_API_KEY).

export const config = { maxDuration: 45 };

const TIER_GUIDE = {
  aspirational: "luxury & designer flagships",
  department: "luxury & multi-brand department stores",
  competitor: "athletic & adjacent brands",
  streetwear: "hype & local streetwear labels",
  underground: "vintage, archive & concept stores",
  culture: "lifestyle & retail-as-culture",
  core: "commercial & value at scale",
};

const SYSTEM = `You are Scout — a senior retail scout for a premium basketball apparel brand who knows the retail geography of cities worldwide: which neighborhoods matter, what each is genuinely known for, and how they sit relative to each other (e.g. in New York, SoHo, Nolita and the Lower East Side cluster together, while Williamsburg is a separate Brooklyn day). You favour design-led, concept, vintage and independent districts that inspire a premium apparel team — not the obvious tourist retail. You name only real, current districts.`;

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
        required: ["neighborhoods"],
        properties: {
          neighborhoods: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "blurb", "apparelWhy"],
              properties: {
                name: { type: "string", description: "Real neighborhood / district name" },
                blurb: { type: "string", description: "One vivid, specific sentence on what this neighborhood is known for" },
                apparelWhy: { type: "string", description: "One sentence: why an apparel design team would benefit from scouting here — what they'd see, learn or be inspired by" },
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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: "ai-not-configured" }); return; }

  const focus = tiers.length ? tiers.map((t) => TIER_GUIDE[t]).join(", ") : "premium, culturally relevant apparel";
  const prompt = `Plan ${days} day(s) of neighborhood scouting in ${city} for an apparel design team focused on: ${focus}.

Rules:
- Each day must have AT LEAST 3 real neighborhoods (a morning one, then two for the afternoon and early evening).
- The neighborhoods within a single day must be geographically close to each other so the day flows without crossing the city. Order them morning → evening.
- Different days must cover DIFFERENT parts of the city — don't repeat areas, and spread the days so the team sees as much of the city as possible. (E.g. in New York one day might be SoHo → Lower East Side → Nolita; another day Williamsburg → Greenpoint → Dumbo.)
- Favour the design-led, concept, vintage, independent and insider districts that inspire a premium apparel brand — skip generic tourist retail.

For each neighborhood give: name, a vivid sentence on what it's known for, and one sentence on why an apparel design team specifically would benefit from scouting it.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) { const detail = await r.text(); res.status(502).json({ error: "request-failed", detail }); return; }
    const data = await r.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) { res.status(502).json({ error: "no-output" }); return; }
    res.status(200).json(JSON.parse(textBlock.text));
  } catch (e) {
    res.status(500).json({ error: "failed", detail: String(e) });
  }
}
