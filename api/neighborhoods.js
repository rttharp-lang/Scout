// Suggests real neighborhoods/districts for a city, tailored to the scout's
// selected tiers, each with a short description of what it's known for. The
// user picks which to visit, then /api/itinerary generates stores within them.
// Anthropic key stays server-side (ANTHROPIC_API_KEY).

export const config = { maxDuration: 30 };

const TIER_GUIDE = {
  aspirational: "luxury & designer flagships",
  department: "luxury & multi-brand department stores",
  competitor: "athletic & adjacent brands",
  streetwear: "hype & local streetwear labels",
  underground: "vintage, archive & concept stores",
  culture: "lifestyle & retail-as-culture",
  core: "commercial & value at scale",
};

const SYSTEM = `You are Scout — a senior retail scout for a premium basketball apparel brand who knows the retail geography of cities worldwide: which neighborhoods matter, and what each is genuinely known for (e.g. in Tokyo, Shimokitazawa is famous for vintage; Harajuku for concept stores). You name only real, current districts and describe each in one vivid, specific sentence about its retail scene.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["neighborhoods"],
  properties: {
    neighborhoods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "blurb"],
        properties: {
          name: { type: "string", description: "Real neighborhood / district name" },
          blurb: { type: "string", description: "One vivid sentence on what this neighborhood is known for" },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  const city = (req.query.city || "").toString().trim();
  const tiers = (req.query.tiers || "").toString().split(",").map((t) => t.trim()).filter((t) => TIER_GUIDE[t]);
  if (!city) { res.status(400).json({ error: "no-city" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: "ai-not-configured" }); return; }

  const focus = tiers.length ? tiers.map((t) => TIER_GUIDE[t]).join(", ") : "premium, culturally relevant apparel";
  const prompt = `List 6–10 real neighborhoods in ${city} worth a retail scout's time, for someone focused on: ${focus}. Favour the insider districts a connected local would name, not just the obvious ones. For each, give the neighborhood name and one specific sentence on what it's known for.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 2000,
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
