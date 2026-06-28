// Suggests a few more real stores within one neighborhood, so the scout can ask
// Scout to "prompt more options" instead of searching by name. Excludes stores
// already on the day. Uses Claude Opus 4.8; the Anthropic key stays server-side.

export const config = { maxDuration: 30 };

const TIER_GUIDE = {
  aspirational: "luxury & designer flagships",
  department: "luxury & multi-brand department stores",
  competitor: "athletic & adjacent brands",
  streetwear: "hype & local/independent streetwear labels",
  underground: "vintage, archive & concept stores",
  culture: "lifestyle & retail-as-culture",
  core: "commercial & value at scale",
};

const SYSTEM = `You are Scout — a senior retail scout for a premium basketball apparel brand with deep, in-the-know knowledge of a city's retail geography. You only name real, currently-operating stores that genuinely exist in the requested neighborhood, using clean searchable names (no parentheticals). Favour insider local gems over names everyone already knows.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stores"],
  properties: {
    stores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "tier", "why"],
        properties: {
          name: { type: "string", description: "Real, currently-operating store name in the neighborhood" },
          tier: { type: "string", enum: ["aspirational", "department", "competitor", "streetwear", "underground", "culture", "core"] },
          why: { type: "string", description: "One sharp sentence: what it teaches a premium basketball apparel brand" },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  const city = (req.query.city || "").toString().trim();
  const area = (req.query.area || "").toString().trim();
  const tiers = (req.query.tiers || "").toString().split(",").map((t) => t.trim()).filter((t) => TIER_GUIDE[t]);
  const exclude = (req.query.exclude || "").toString().split(",").map((s) => s.trim()).filter(Boolean);
  if (!city || !area) { res.status(400).json({ error: "missing-params" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: "ai-not-configured" }); return; }

  const focus = tiers.length ? tiers.map((t) => TIER_GUIDE[t]).join(", ") : "premium, culturally relevant apparel";
  const excludeLine = exclude.length ? `\n\nDo NOT include any of these, which are already on the list:\n${exclude.map((e) => "- " + e).join("\n")}` : "";
  const prompt = `Suggest up to 6 more real stores in ${area}, ${city} worth a retail scout's time, focused on: ${focus}. They must actually exist in ${area} right now. Favour insider local picks a connected scout would know.${excludeLine}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1500,
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
