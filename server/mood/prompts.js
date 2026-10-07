// Prompts + JSON schemas for Scout Mood. Two Claude passes:
//   1. BRIEF  — creative direction → a forecaster-grade art-direction brief
//               (the macro view the user doesn't have) with concrete,
//               searchable image queries per story.
//   2. CURATE — a design director's vision cull of candidate images against
//               that brief: hard rejects, six weighted sub-scores, and a keep
//               threshold applied in code (see scoreDecision).
// Structured outputs can't express counts/lengths (no minItems/maxLength), so
// counts live in the descriptions and the handlers clamp server-side.

export const SEASONS = {
  SP: { label: "Spring (SP)", months: [0, 2], feel: "transitional layers, first light, rain, renewal" },
  SU: { label: "Summer (SU)", months: [3, 5], feel: "heat, water, light, skin, ventilation, sun-bleached colour" },
  FA: { label: "Fall (FA)", months: [6, 8], feel: "weight returns: layering, texture, weatherproofing, back-to-sport" },
  HO: { label: "Holiday (HO)", months: [9, 11], feel: "cold, celebration, gifting, nightlife, insulation and shine" },
  SS: { label: "Spring/Summer (SS)", months: [1, 6], feel: "light, heat, transparency, ease, outdoors" },
  FW: { label: "Fall/Winter (FW/AW)", months: [7, 12], feel: "weight, warmth, protection, layering, darker light" },
  RS: { label: "Resort/Cruise (RS)", months: [10, 13], feel: "travel, escape, pre-season newness" },
  PF: { label: "Pre-Fall (PF)", months: [6, 7], feel: "the commercial bridge into autumn: refined, wearable, early layering" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "FA28" → { code, year, label, window, monthsAhead }. Unknown codes pass through.
export function describeSeason(raw, now = new Date()) {
  const m = /^([A-Z]{2})\s*'?(\d{2}|\d{4})$/.exec(String(raw || "").toUpperCase().trim());
  if (!m || !SEASONS[m[1]]) return { code: String(raw || "").slice(0, 12), label: String(raw || ""), monthsAhead: null };
  const s = SEASONS[m[1]];
  const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  const start = new Date(year, s.months[0], 1);
  const end = new Date(year, s.months[1], 1);
  const monthsAhead = (start.getFullYear() - now.getFullYear()) * 12 + start.getMonth() - now.getMonth();
  const window = `${MONTHS[start.getMonth()]}–${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  return {
    code: `${m[1]}${String(year).slice(2)}`,
    year,
    monthsAhead,
    label: `${s.label} ${year} — in store ~${window}, about ${monthsAhead} months from now (${s.feel})`,
  };
}

export const BRIEF_SYSTEM = `You are the creative director and trend forecaster that the world's leading apparel houses brief before a season — the person who hands a Nike-, Arc'teryx- or Prada-level design team its point of view. The people using you design and merchandise at top apparel brands, but they are NOT forecasters: they rely on you for the macro view of consumer aesthetics and for a visionary, specific, buildable direction. Your brief drives the search for every image on their mood board, so it must be concrete enough to find real photographs and museum objects.

THE CHAIN — make every choice traceable: macro driver → consumer mindset → story → colour, material, silhouette, detail.

MACRO VIEW (always fill it, even when the direction is thin — say what you assumed)
- The shift: the cultural/consumer change that makes this direction right for this season, and why now.
- 3 drivers, each tagged with a STEPIC pillar (Society, Technology, Environment, Politics, Industry, Creativity), a concrete real-world signal you could point to (a named community, scene, place, practice, technology or event — never vague "Gen Z wants authenticity" filler), and the product implication.
- The consumer: name the mindset (your own archetype name) and describe how they live, what they value and how they dress.
- Trend stage (emerging, growing or peaking) and a one-line confidence note separating evidenced signals from provocation. Never invent statistics or quote paid forecasting content as your own.

POINT OF VIEW
- Sharpen a vague or derivative direction into an original one; keep everything the user asked for and push it one step further than they would.
- Build on a tension (e.g. hand-made vs engineered, still vs kinetic). Lateral references beat fashion-on-fashion: at least half of your references must come from outside fashion (art, architecture, landscape, craft, sport history, science, industrial objects, film, music, archives). Name real things only.
- Respect what the season physically demands and what the category needs (performance → function, materials, body in motion; lifestyle → attitude and styling; outdoor → terrain and protection; tailoring → cut and cloth).
- Kill clichés: lazy trend labels ("quiet luxury", "Y2K", "-core" aesthetics, "cyberpunk neon", "dopamine dressing") only if the user named them, and then make them specific. List what the direction must avoid, including references every board on this theme already uses.

STORIES — exactly 3 by default (4 only if the direction clearly needs it), one concept seen three ways:
- roles: ANCHOR (the commercial core), DIRECTIONAL (the season's newness), EDGE (forward, small-volume);
- each story must differ from the others on at least two axes: palette temperature, material family, era/place, still vs kinetic energy, rural vs urban;
- each has a name (2-3 words, evocative, not punny), a 40-70 word narrative with its light, setting and era, and 4-6 single-word keywords.

IMAGE QUERIES — the most important craft in the brief. Per story: 4 PHOTO queries for stock-photography search and 2 ARCHIVE queries for museum collections.
- PHOTO: 2-5 words of concrete nouns: [subject/object] + [material or surface] + [place or era] + optional light/photo quality (overcast, dusk, raking light, macro, flash at night, 35mm, film grain, aerial, documentary). Cover four kinds: one PEOPLE/attitude (an activity + community + place, documentary), one MATERIAL macro, one PLACE/light, one LATERAL (art, architecture, object, craft, science).
  Good: "frayed climbing rope macro", "terrace crowd 1980s documentary", "brutalist stairwell overcast", "sun-faded nylon fishing boat", "lichen granite boulder", "track athletes warm-up 35mm".
  Banned words (they pull stock clichés): aesthetic, vibe(s), fashion, stylish, trendy, beautiful, minimalist, luxury, model, outfit, lifestyle, happy, team, -core. No brand names, no people's names.
- ARCHIVE: museum vocabulary, 2-4 words — object type + material/technique + culture/era: "boro jacket", "quilted cotton Japan", "felt hat 1930s", "Bauhaus textile sample", "naval signal flag", "Inuit parka".

PALETTE — 6-9 chips: a precise evocative name (not "Blue"), a hex value, a role (core carries the range, seasonal is the season's newness, accent is the sparing pop, neutral grounds it; at least one neutral and one accent), and where the colour comes from in the world ("wet granite after rain"). Leave out Pantone/Coloro codes.

PRODUCT LANGUAGE (CMF) — materials & finishes with hand-feel (4-8), silhouettes & proportions (3-6), details & trims (3-6), graphic / print / typography direction (2-5), named references (4-8), avoid (3-6). Write like a design director: specific nouns, no filler adjectives, no marketing copy. Never name or imitate a specific competitor's product, logo or campaign.`;

const STORY = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "role", "narrative", "keywords", "queries"],
  properties: {
    id: { type: "string", description: "kebab-case slug of the name, unique within the brief" },
    name: { type: "string", description: "2-3 word story name" },
    role: { type: "string", enum: ["anchor", "directional", "edge"] },
    narrative: { type: "string", description: "40-70 words: the story's world — light, setting, era, energy — and why it matters" },
    keywords: { type: "array", items: { type: "string" }, description: "4-6 single lower-case keywords (mood, material, colour)" },
    queries: {
      type: "object",
      additionalProperties: false,
      required: ["photo", "archive"],
      properties: {
        photo: { type: "array", items: { type: "string" }, description: "exactly 4 stock-photo queries, 2-5 words: people, material, place, lateral" },
        archive: { type: "array", items: { type: "string" }, description: "exactly 2 museum-collection queries, 2-4 words" },
      },
    },
  },
};

export const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "tagline", "concept", "macro", "stories", "palette", "materials", "silhouettes", "details", "graphics", "references", "avoid"],
  properties: {
    title: { type: "string", description: "2-4 word concept title built on a tension — never a -core microtrend or brand name" },
    tagline: { type: "string", description: "the thesis in one sentence: X meets Y, so the product does Z" },
    concept: { type: "string", description: "60-110 words: why now, what it feels like, what changes in product" },
    macro: {
      type: "object",
      additionalProperties: false,
      required: ["shift", "drivers", "consumer", "stage", "confidence"],
      properties: {
        shift: { type: "string", description: "the consumer / cultural shift and why now (1-2 sentences)" },
        drivers: {
          type: "array",
          description: "exactly 3 drivers",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["pillar", "signal", "implication"],
            properties: {
              pillar: { type: "string", enum: ["Society", "Technology", "Environment", "Politics", "Industry", "Creativity"] },
              signal: { type: "string", description: "a concrete, real, observable signal (one sentence)" },
              implication: { type: "string", description: "what it means for product (one line)" },
            },
          },
        },
        consumer: {
          type: "object",
          additionalProperties: false,
          required: ["name", "mindset"],
          properties: {
            name: { type: "string", description: "your own 2-3 word archetype name" },
            mindset: { type: "string", description: "how they live, what they value, how they dress (1-2 sentences)" },
          },
        },
        stage: { type: "string", enum: ["emerging", "growing", "peaking"] },
        confidence: { type: "string", description: "one line: what is evidenced vs what is a provocation" },
      },
    },
    stories: { type: "array", items: STORY, description: "3 stories (4 only if needed): anchor, directional, edge" },
    palette: {
      type: "array",
      description: "6-9 colour chips",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "hex", "role", "source"],
        properties: {
          name: { type: "string", description: "precise, evocative, 1-3 words" },
          hex: { type: "string", description: "#RRGGBB" },
          role: { type: "string", enum: ["core", "seasonal", "accent", "neutral"] },
          source: { type: "string", description: "where the colour comes from in the world, 2-6 words" },
        },
      },
    },
    materials: { type: "array", items: { type: "string" }, description: "4-8 materials & finishes, each with its hand-feel" },
    silhouettes: { type: "array", items: { type: "string" }, description: "3-6 silhouettes & proportions" },
    details: { type: "array", items: { type: "string" }, description: "3-6 details & trims" },
    graphics: { type: "array", items: { type: "string" }, description: "2-5 graphic / print / typography directions" },
    references: { type: "array", items: { type: "string" }, description: "4-8 real, named references, at least half from outside fashion" },
    avoid: { type: "array", items: { type: "string" }, description: "3-6 clichés and over-exposed references to avoid" },
  },
};

// Words that pull stock clichés and influencer content into search results.
// "-core" only as a microtrend label (gorpcore, blokecore, cottage-core…),
// never "score" or "albacore"; "model" only in stock queries ("ship model" is
// museum vocabulary).
const BANNED = /\b(aesthetics?|vibes?|fashion(able)?|stylish|trendy|beautiful|minimalist|luxury|luxurious|outfits?|lifestyle|happy|team|\w+-core|(?:gorp|norm|cottage|bloke|blok|barbie|ballet|mob|office|coastal|goblin|fairy)core)\b/gi;
const STOCK_ONLY = /\b(models?)\b/gi;
export function cleanQuery(q, maxWords, { archive = false } = {}) {
  let out = String(q || "").replace(BANNED, " ");
  if (!archive) out = out.replace(STOCK_ONLY, " ");
  return out.replace(/[^\p{L}\p{N}\s'&-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

export const ROLES = ["people", "material", "garment", "place", "color", "lateral", "archive", "graphic"];
export const REJECT_CODES = ["watermark", "text_heavy", "brand_logo", "stock_cliche", "ai_artifact", "low_quality", "overprocessed", "generic_product", "sensitive", "duplicate", "off_brief"];

export const CURATE_SYSTEM = `You are the design director at a top sportswear / luxury house making the final edit of references for a seasonal concept review. A team of designers will build a collection from the images you keep, in front of the brand's creative leadership — so you reject anything a junior would pull from page one of Pinterest. You are shown numbered candidate images found by search for ONE story of the brief. Most search results are not good enough; culling hard is the job. Expect to keep roughly one in four.

STAGE A — HARD REJECTS. List every code that applies (an image with any code is cut):
- watermark: watermark, stock-site branding, burned-in caption or credit.
- text_heavy: overlaid text, UI, screenshot, meme, infographic (real-world signage inside a documentary photo is fine).
- brand_logo: a prominent current brand logo or monogram, or recognisable current branded product as the subject (archival garments are fine when the logo isn't the focus).
- stock_cliche: posed smiles to camera, thumbs-up, high-fives, laughing friend groups, jumps on the beach, sunrise-yoga silhouettes, gym-mirror selfies, staged "diverse team" or laptop-lifestyle shots.
- ai_artifact: waxy skin, malformed hands, gibberish lettering, incoherent light or backgrounds, impossible garment construction.
- low_quality: accidental blur, heavy compression, bad exposure, too small to use.
- overprocessed: HDR halos, oversaturated or teal-orange grade, heavy vignette, preset filters, lens-flare cliché.
- generic_product: catalogue packshots on white, marble flat-lays, clip-art, glossy 3D renders.
- sensitive: minors as the focal subject, nudity, private people in vulnerable moments, tragedy used as aesthetic, sacred or ceremonial objects used as costume.
- duplicate: a near-duplicate of a better image in this set.
- off_brief: matches the search word but not this story's world.

STAGE B — SCORE every image 0-5 on each dimension:
- brief_fit: expresses the story's narrative, keywords, light, setting, era and energy — not just the literal search noun. 5 = it could caption the story.
- specificity: a concrete time, place, material, community or technique; documentary truth; real people in real activity. 5 = you could name where/when/what.
- material: a designer can read the surface — weave, nap, sheen, wrinkle, wear, construction, hardware. (Pure place/colour images may score low here.)
- palette: its dominant colours sit within the board palette, or it deliberately carries the accent.
- craft: light, composition, negative space, tonal range, survives a 4:5 crop, editorial not commercial. Film grain, flash, overcast light and off-centre framing are positives when on-brief.
- lateral: a non-obvious source (art, architecture, landscape, industrial object, sport archive, craft, science) that isn't on every board for this theme.

For each image also give the single role it plays (people, material, garment, place, color, lateral, archive, graphic) and a note. For an image that clears the bar, the note is the caption a design director writes under the pin: 8-16 words in designer language about what to take from it ("Felted boiled-wool surface, pilled, oatmeal to ash — reads as cocoon outerwear."). For a cut image, the note can be empty.`;

const SCORE = { type: "integer", description: "0-5" };
export const CURATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      description: "one entry per candidate image, by its number",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "reject", "scores", "role", "note"],
        properties: {
          index: { type: "integer", description: "the image number as labelled" },
          reject: { type: "array", items: { type: "string", enum: REJECT_CODES }, description: "hard-reject codes; empty if none" },
          scores: {
            type: "object",
            additionalProperties: false,
            required: ["brief_fit", "specificity", "material", "palette", "craft", "lateral"],
            properties: { brief_fit: SCORE, specificity: SCORE, material: SCORE, palette: SCORE, craft: SCORE, lateral: SCORE },
          },
          role: { type: "string", enum: ROLES },
          note: { type: "string", description: "kept-quality images: 8-16 word designer caption; otherwise may be empty" },
        },
      },
    },
  },
};

// Weights from the rubric (sum to 1). Keep threshold applied in code so it
// can't drift with the model's mood: weighted ≥ 3.6/5, brief fit ≥ 3, no
// dimension ≤ 1 (material is exempt for place/colour images), no hard reject.
const WEIGHTS = { brief_fit: 0.25, specificity: 0.2, material: 0.15, palette: 0.15, craft: 0.15, lateral: 0.1 };
export const KEEP_WEIGHTED = 3.6;

export function scoreDecision(d) {
  const s = d?.scores || {};
  const v = (k) => Math.max(0, Math.min(5, Math.round(Number(s[k]) || 0)));
  const weighted = Object.entries(WEIGHTS).reduce((t, [k, w]) => t + v(k) * w, 0);
  const exempt = d?.role === "place" || d?.role === "color";
  const floorOk = Object.keys(WEIGHTS).every((k) => (exempt && k === "material") || v(k) > 1);
  const rejects = (Array.isArray(d?.reject) ? d.reject : []).filter((c) => REJECT_CODES.includes(c));
  const keep = rejects.length === 0 && weighted >= KEEP_WEIGHTED && v("brief_fit") >= 3 && floorOk;
  return { keep, weighted, score: Math.round(weighted * 20), rejects };
}
