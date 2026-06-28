// Suggests a few more real restaurants for a meal near the day's route, so the
// scout can ask Scout to "prompt more" lunch/dinner spots instead of typing.
// Excludes ones already offered. Uses Claude Opus 4.8; key stays server-side.

export const config = { maxDuration: 30 };

const SYSTEM = `You are Scout — a taste-led scout planning meals for a premium apparel design team (think Nike) on a city scouting trip. You only name real, currently-operating restaurants, with clean searchable names (no parentheticals). You favour places that are delicious AND an experience: beautiful rooms, a view, design-forward interiors, great ambience, a story worth telling — local gems over tourist traps or Michelin box-ticking.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["restaurants"],
  properties: {
    restaurants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "cuisine", "why"],
        properties: {
          name: { type: "string", description: "Real, currently-operating restaurant name" },
          cuisine: { type: "string", description: "Short cuisine / food type, e.g. 'Modern Korean' or 'Natural-wine bistro'" },
          why: { type: "string", description: "One sentence on the unique experience the team will have here — the room, the view, the vibe, what makes it memorable and inspiring" },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  const city = (req.query.city || "").toString().trim();
  const area = (req.query.area || "").toString().trim();
  const meal = (req.query.meal || "lunch").toString().trim() === "dinner" ? "dinner" : "lunch";
  const exclude = (req.query.exclude || "").toString().split(",").map((s) => s.trim()).filter(Boolean);
  if (!city) { res.status(400).json({ error: "no-city" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(503).json({ error: "ai-not-configured" }); return; }

  const where = area ? `in or near ${area}, ${city}` : `in ${city}`;
  const timing = meal === "dinner"
    ? "an unforgettable dinner — a view or beautiful ambience, modern and unique, the kind of place people tell stories about"
    : "a delicious, design-led lunch within a short walk of the route — a beautiful room, not a tourist trap";
  const excludeLine = exclude.length ? `\n\nDo NOT repeat any of these, already offered:\n${exclude.map((e) => "- " + e).join("\n")}` : "";

  const prompt = `Suggest up to 6 more real ${meal} restaurants ${where} for ${timing}. They must actually exist right now. For each, give the name, a short cuisine/food type, and one sentence on the unique experience the apparel team would have there.${excludeLine}`;

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
