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

const SYSTEM = `You are the most discerning apparel retail editor — at the level of a Hypebeast or Highsnobiety senior editor — curating apparel destinations for an industry insider. Every store you name MUST be APPAREL-FOCUSED (clothing, footwear, apparel-driven concept/multi-brand stores ONLY — NEVER markets, souvenir/trinket shops, electronics, homeware, beauty-only, bookstores or galleries), LEADING not generic (only spots a knowledgeable insider would route to — no mall basics, no chains for the sake of it), and REAL and currently operating with clean searchable names (no parentheticals).

Match this quality bar and taste — in New York that's the level of Dover Street Market, Patron of the New, Bluegreen in SoHo, and Kith — applied to EVERY city, including non-major markets. Vary the types (vintage, multi-brand, concept, streetwear, luxury). If the neighborhood has few true destinations, return FEWER high-quality ones rather than padding with mediocre stores.`;

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
        required: ["name", "tier", "category", "why"],
        properties: {
          name: { type: "string", description: "Real, currently-operating APPAREL store name in the neighborhood" },
          tier: { type: "string", enum: ["aspirational", "department", "competitor", "streetwear", "underground", "culture", "core"] },
          category: { type: "string", enum: ["vintage", "multi-brand", "concept", "streetwear", "luxury"], description: "Editorial type tag" },
          why: { type: "string", description: "One sharp editor's-take sentence on why this apparel store is worth the trip" },
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
  const prompt = `Name up to 6 of the BEST real apparel retail destinations in ${area}, ${city} — the ones a Hypebeast/Highsnobiety editor would actually route an insider to, focused on: ${focus}. Apparel only (clothing, footwear, apparel-driven concept/multi-brand) — NO markets, souvenir/trinket shops, electronics, homeware, beauty-only or bookstores. They must actually exist in ${area} right now. Vary the types and tag each store's category (vintage / multi-brand / concept / streetwear / luxury). Return fewer than 6 if there genuinely aren't 6 worth the trip — never pad with mediocre stores.${excludeLine}`;

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
