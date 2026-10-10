// Home Court agent roster — the single source of truth for every agent that
// researches an NBA market. Three consumers read it:
//   1. scripts/nba/brief.mjs   → prints an agent's full brief for the offline
//                                research workflow (research/nba/<team>/*.json)
//   2. api/homecourt-agent.js  → runs the same agents live via the Claude API
//   3. the site's Agents page  → shows the roster and the pipeline
// Each LENS agent owns one slice of a market and writes a dossier. The
// SYNTHESIS agents turn eleven dossiers into the Nike Basketball brief.

import { PLAN_SCHEMA, EVIDENCE_SCHEMA } from "./review-schema.js";

export const SEASON = "2026-27";

// The shared bar every agent is held to. Mirrors Scout's curation standard:
// insider, specific, current, and translated into product.
export const STANDARDS = `WHO THIS IS FOR: the Nike Basketball apparel and uniform design team in Portland, Oregon. They need to know every NBA team's local fandom inside out: where the openings are, when to move, and which products to make for each (apparel collections, City Edition uniforms, team and city product).

THE BAR: every claim must pass all of these.
- SWAP TEST: if the sentence would still be true with another city's name in it, it's generic. Sharpen it until it fits only this market, or cut it.
- INSIDER TEST: name the real places, people, collectives, events, dishes, phrases and moments a plugged-in local would know and respect. Skip the first page of the tourist guide.
- CURRENT: it's the ${SEASON} NBA season. Places must be open and facts true now. Use web search to check anything that could have changed: closures, moves, rebrands, rosters, coaches, arena names, owners, event dates. If you can't confirm something is real and current, drop it.
- PRODUCT LENS: turn culture into what a designer can use. Give colors (with hex), motifs, textures, typography, silhouettes, materials, graphics and stories, plus concrete product ideas.
- RESPECT: no stereotypes or caricature. When a cue comes from a specific community (Black, Latino, Indigenous, Asian, Pacific Islander, LGBTQ+ or immigrant), say how to work with it honestly. Partner with its creators, credit them and pay them. Never lift sacred or ceremonial imagery. Flag third-party IP that would need a license.
- PEOPLE: name public figures, artists, athletes, chefs, designers, collectives and businesses. Never name private individuals.
- TIGHT: one to three sentences per field. No filler and no boilerplate hedging. A few strong items beat a padded list.
- VOICE: write like a good city guide or magazine, not a strategy deck. Use short sentences (aim for under 16 words), plain words, the active voice and the imperative for advice. No consultant-speak (leverage, unlock, activate against, ecosystem, touchpoint) and no brochure filler (vibrant, nestled, rich history).
- OWN WORDS: never copy song lyrics, poems or passages from articles, or quote slogans beyond a few words. Describe and name the work instead.
- SOURCES: list the URLs you actually used.`;

// Swapped in for the CURRENT and SOURCES rules when live web research is
// unavailable (e.g. the session's search budget is spent). The draft stays
// useful but every time-sensitive claim is queued for live verification.
export const KNOWLEDGE_MODE = `RESEARCH MODE: KNOWLEDGE. Live web research is unavailable for this run. Do not call WebSearch or WebFetch. Write from your own knowledge, current to roughly mid-2026, and be rigorous about the edge of what you know:
- Name places, businesses, people and events only when you are confident they exist and were operating (or recurring) as of 2025-26. Prefer long-standing institutions over new or fragile ones; leave out anything you're unsure is still open.
- State time-sensitive facts as of your knowledge — the 2026-27 roster, coach, ownership and arena name, 2026-27 dates, the current City Edition, recent openings and closures, current fan sentiment — and add each one to provenance.verify: the claims a live check must confirm before anyone acts, most important first (max 12).
- Set provenance to { "mode": "knowledge", "asOf": "Model knowledge, mid-2026", "verify": [...] }. Set confidence honestly: "medium" at most unless the lens rests on long-established history.
- sources: list only canonical reference pages you are confident exist (official team, venue and organization sites; Wikipedia articles) as where to verify. Never invent deep links.`;

// ── Lens agents ───────────────────────────────────────────────────
// group: how the site clusters them. questions: what the agent must answer.
export const LENS_AGENTS = [
  {
    id: "music", name: "Music Scene", group: "Culture", icon: "music",
    mission: "Find the city's sound and how it shows up around the team.",
    questions: [
      "Which genres, sounds and movements started here, and which define the city now?",
      "Which local artists, producers, DJs and collectives do locals rep, old and new? Which have real ties to the team or its players?",
      "Which venues matter: legendary rooms, DIY spaces, club nights, radio stations, record stores?",
      "Which festivals and regular music nights happen, and when?",
      "Where does music meet the team: anthems, the arena DJ and halftime shows, walkout songs, lyrics that name the team, players' friendships with artists?",
      "What visual language comes out of the scene (album art, flyers, gig posters, merch) that a designer could borrow from with respect?",
    ],
  },
  {
    id: "art", name: "Art & Design Scene", group: "Culture", icon: "palette",
    mission: "Map the walls, studios, signs and makers that give the city its look.",
    questions: [
      "Which murals, mural districts and street artists define the city's walls today?",
      "Which galleries, artist-run spaces, design studios and schools drive the scene?",
      "What does the city's own lettering look like: signage, neon, hand-painted signs, transit graphics, license plates, flags, buildings?",
      "Which local illustrators, designers, photographers or tattoo artists have done sports, sneaker or streetwear work, or would make credible collaborators?",
      "Which art events, fairs and festivals happen, and when?",
      "Which palettes, patterns, textures and letterforms could only be this city?",
    ],
  },
  {
    id: "food", name: "Food Scene", group: "Culture", icon: "utensils",
    mission: "Read the city through what it eats, where it gathers and what it's proud of.",
    questions: [
      "What are the signature dishes and regional food identity, and which institutions carry them?",
      "Which immigrant food corridors and newer chef-driven spots define the city now?",
      "What are the game-day food rituals: pre-game spots, tailgates, watch-party bars, local vendors in the arena?",
      "Which restaurants or food brands have cult merch or a look that locals wear?",
      "Which chefs and food figures speak for the city's culture? Which food festivals happen, and when?",
      "Which food references could become respectful insider details on product: colorways, graphics, packaging, names?",
    ],
  },
  {
    id: "culture", name: "Culture & Heritage", group: "Culture", icon: "landmark",
    mission: "Capture the city's history, communities, symbols, language and self-image.",
    questions: [
      "How does the city see itself, and how does it think the rest of the country sees it? What chip on the shoulder or point of pride drives it?",
      "Which moments in history, movements and communities shape local pride today?",
      "Which neighborhoods have their own identity that people rep?",
      "Which symbols do locals use: flags, area codes, skylines, bridges, nicknames, landmarks, state shapes?",
      "What slang and phrases do people actually say?",
      "How do climate and lifestyle shape what people wear? Which civic moments, like parades and heritage celebrations, fill the year?",
    ],
  },
  {
    id: "underground", name: "Subculture & Underground", group: "Culture", icon: "radio",
    mission: "Find the scenes that set taste before the mainstream catches on.",
    questions: [
      "Which subcultures are strongest here: skate, BMX, car culture (lowriders, slab, sideshows, tuners), sneakers and streetwear, vintage, ballroom and queer nightlife, raves and DIY, zines, gaming and anime, dance styles?",
      "Who are the tastemakers, collectives, crews, shops and spaces at the center of each?",
      "What is coming up in 2025-26 that the mainstream hasn't caught yet?",
      "What do these scenes wear, and how do they customize, thrift or remix sportswear and team gear?",
      "Which regular events or gatherings matter, and when?",
      "Which scenes could Nike work with credibly, and which should it leave alone?",
    ],
  },
  {
    id: "hoops", name: "Grassroots Hoops", group: "Basketball", icon: "dribbble",
    mission: "Map the courts, leagues and legends outside the arena that feed the fandom.",
    questions: [
      "Which outdoor courts, parks and gyms are legendary, and what happens there?",
      "Which pro-am, summer and streetball leagues run, and when?",
      "Which high school, AAU/EYBL and college programs carry local pride, and who are their rivals?",
      "Which WNBA, G League or other pro basketball teams share the market?",
      "Which NBA and WNBA players and streetball legends come from here, and how do locals claim them?",
      "What do local hoopers wear on and off the court? Which basketball media and creators come from here?",
    ],
  },
  {
    id: "fanbase", name: "Fan Base Identity", group: "Fandom", icon: "users",
    mission: "Profile who the fans are, how they show up and what they wear.",
    questions: [
      "Who is this fan base and how loyal is it? What's the mood heading into the 2026-27 season (roster, ownership, expectations)?",
      "Which fan groups exist (diehards, families, Gen Z online fans, regional and rural fans, diaspora and international fans, corporate, bandwagon), and what does each wear and value?",
      "Which traditions, rituals, chants, signs and game-day habits define them?",
      "Which legends and eras do they worship, which current players do they embrace, and who are their rivals?",
      "What do fans wear on game day and around town: which jerseys, eras, throwbacks and local brands?",
      "Where do fans gather (supporter groups, podcasts, Reddit, bars, watch parties)? How do they feel about Nike, Jordan and team merch?",
    ],
  },
  {
    id: "rhythm", name: "Fan Rhythm", group: "Fandom", icon: "activity",
    mission: "Chart, month by month, how fans follow the team across a full year, and what else the city is doing.",
    questions: [
      "For each month, January to December, how engaged are fans (0-100), and what phase is it (offseason, draft, free agency, Summer League, media day, preseason, opener, NBA Cup, Christmas, trade deadline, All-Star, playoff push, playoffs)?",
      "Which local rhythms compete or combine each month: weather, the school calendar, other pro and college seasons, festivals, holidays, tourism?",
      "What are the team's main 2026-27 dates, where you can verify them (home opener, rivalry games, national TV games, heritage nights, City Edition debut)?",
      "When do fans buy (which months spike for jerseys, gifts and playoff gear), and when do they tune out?",
    ],
  },
  {
    id: "uniform", name: "Uniform & Merch Archive", group: "Fandom", icon: "shirt",
    mission: "Know every uniform the team has worn, how fans took it and what story is still untold.",
    questions: [
      "What is the team's official color palette (with hex codes), and what are its wordmark and lettering traditions?",
      "What are the defining uniform eras and most famous looks?",
      "What has each City Edition been, as far back as you can verify? What was the idea, and how did fans take it?",
      "Which throwbacks and Classic Editions do fans most want or wear? What is the 2026-27 uniform set, if announced?",
      "Which local brands, bootlegs and fan-made merch riff on the team, who makes them, and what sells best?",
      "Which local stories haven't been told on a uniform yet but would land?",
    ],
  },
  {
    id: "retail-landscape", name: "Retail Landscape", group: "Retail", icon: "store",
    mission: "Map where this market actually shops for basketball, sneakers and team gear.",
    questions: [
      "Which shopping districts, streets and malls matter, and who shops each?",
      "Where do fans actually buy team gear: the arena team store, a flagship, big-box stores, Fanatics or Lids, local shops?",
      "Which Nike-owned stores (Nike Well Collective, community and factory stores) and main partners (Foot Locker, House of Hoops, JD, Dick's, local boutiques) operate here?",
      "Which independent sneaker boutiques, streetwear shops, consignment and vintage stores have real standing in the community?",
      "Which local apparel brands have big followings, and where do pop-ups happen?",
      "Which stores set taste, and which move volume?",
    ],
  },
  {
    id: "retail-behavior", name: "Retail Rhythm & Behavior", group: "Retail", icon: "calendar-clock",
    mission: "Explain when and how this market shops: the calendar, channels, prices and habits.",
    questions: [
      "What is the local retail calendar: back-to-school dates, sales-tax holidays (or no sales tax), holiday peaks, heritage and religious calendars, tourist seasons, conventions and events?",
      "How does weather shape what sells, and when (outerwear, shorts, layers)?",
      "What is the channel mix: in-store, online, social commerce, resale, raffles, lines, drops?",
      "How price-sensitive is the market, and how much does income vary across it? How do fans buy jerseys (authentic, swingman, kids, knockoffs)?",
      "Which gifting moments, local paydays and seasonal economies matter?",
      "Which cross-border, tourist or regional shoppers matter, and how do they shop?",
    ],
  },
];

export const SYNTHESIS_AGENTS = [
  { id: "strategist", name: "Market Strategist", group: "Synthesis", icon: "target",
    mission: "Turn eleven dossiers into the Nike Basketball brief: insights, opportunities, collection, uniform and launch calendar." },
  { id: "factcheck", name: "Fact-Check Critic", group: "Verification", icon: "shield-check",
    mission: "Check the riskiest claims in every dossier as a skeptic would, then fix or cut whatever fails." },
  { id: "authenticity", name: "Authenticity Critic", group: "Verification", icon: "scale",
    mission: "Attack the brief for generic insights, stereotypes, appropriation, weak product links and missed chances." },
  { id: "editor", name: "Brief Editor", group: "Synthesis", icon: "pen-tool",
    mission: "Revise the brief against both critiques so every recommendation is specific and ready to test." },
];

export const ALL_AGENTS = [...LENS_AGENTS, ...SYNTHESIS_AGENTS];
export const AGENT_BY_ID = Object.fromEntries(ALL_AGENTS.map((a) => [a.id, a]));
export const LENS_IDS = LENS_AGENTS.map((a) => a.id);

// ── Output contracts ──────────────────────────────────────────────
// Plain JSON Schema (the subset the Claude API's structured outputs accepts),
// also enforced offline by scripts/nba/validate.mjs.
const str = (description) => ({ type: "string", description });
const arr = (items, min, max, description) => ({ type: "array", items, ...(min != null ? { minItems: min } : {}), ...(max != null ? { maxItems: max } : {}), ...(description ? { description } : {}) });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const CONFIDENCE = { type: "string", enum: ["high", "medium", "low"] };
const HEX = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
const MONTH = { type: "integer", minimum: 1, maximum: 12 };

const SOURCE = obj({ title: str("Page title"), url: str("URL used (live research) or canonical reference page to verify against (knowledge mode)") });
// Optional on every dossier and brief; absent means researched live on the web.
const PROVENANCE = obj({
  mode: { type: "string", enum: ["live", "knowledge"], description: "live = verified on the web; knowledge = written from model knowledge" },
  asOf: str("e.g. 'Live web, Oct 2026' or 'Model knowledge, mid-2026'"),
  verify: arr(str("A time-sensitive claim a live check must confirm, most important first"), 0, 12),
});
const CUE_TYPES = ["color", "motif", "texture", "typography", "silhouette", "material", "graphic", "pattern", "story"];

// Fields every lens dossier shares, so the site can render any lens the same way.
const LENS_BASE = {
  team: str("Team id, e.g. por"),
  lens: str("Lens agent id"),
  headline: str("A magazine headline for this lens in this market, 90 characters at most"),
  summary: str("3-5 sentences of synthesis"),
  insights: arr(obj({ title: str("Short title"), detail: str("1-3 sentences, specific to this market"), implication: str("What it means for Nike Basketball product or activation") }), 4, 7),
  places: arr(obj({ name: str("Real, currently-operating place, venue, court, store, event space"), kind: str("e.g. venue, court, gallery, restaurant, shop, district"), neighborhood: str("Neighborhood or suburb"), why: str("Why it matters, one sentence") }), 0, 10),
  people: arr(obj({ name: str("Public figure, artist, athlete, collective, brand or business"), role: str("What they do"), why: str("Why they matter here") }), 0, 8),
  moments: arr(obj({ name: str("Recurring event, festival, ritual or date"), timing: str("When, e.g. 'Late May' or 'Every home game'"), month: { type: "integer", minimum: 0, maximum: 12, description: "1-12 for the main month, 0 if year-round" }, why: str("Why it matters") }), 0, 8),
  vocabulary: arr(obj({ term: str("Local word, phrase, nickname"), meaning: str("What it means / how it's used") }), 0, 8),
  designCues: arr(obj({ cue: str("The cue, concrete enough to brief a designer"), type: { type: "string", enum: CUE_TYPES }, hex: { type: "string", description: "Hex like #E03A3E if type is color, else empty string" }, source: str("Where it comes from in the culture"), use: str("How to use it on product, respectfully") }), 3, 8),
  productHooks: arr(str("A concrete product idea rooted in this lens"), 2, 6),
  watchouts: arr(str("Sensitivity, licensing or authenticity risk"), 0, 5),
  sources: arr(SOURCE, 2, 14),
  confidence: CONFIDENCE,
};

// Lens-specific structure, added on top of LENS_BASE under `extra`.
const LENS_EXTRA = {
  rhythm: obj({
    months: arr(obj({
      month: MONTH,
      intensity: { type: "integer", minimum: 0, maximum: 100, description: "Fan engagement with the team, 0-100" },
      phase: str("Team/league phase this month"),
      team: arr(str("Team or league moment"), 0, 5),
      local: arr(str("Local city moment competing or combining"), 0, 5),
      fanBehavior: str("How fans behave this month"),
      retailSignal: str("What fans buy (or don't) this month"),
    }), 12, 12, "Exactly 12 entries, months 1-12 in order"),
    keyDates: arr(obj({ name: str("Moment"), date: str("Date or window, e.g. 'Oct 22, 2026' or 'mid-Feb 2027'"), month: MONTH, type: { type: "string", enum: ["team", "league", "local"] }, why: str("Why it matters for activation") }), 4, 16),
  }),
  fanbase: obj({
    segments: arr(obj({ name: str("Segment name"), description: str("Who they are"), share: str("Rough size, e.g. 'largest', '~20%', 'small but loud'"), wears: str("What they wear / buy"), reach: str("Where and how to reach them") }), 3, 6),
    traditions: arr(obj({ name: str("Tradition, chant, ritual"), detail: str("What it is") }), 2, 8),
    icons: arr(obj({ name: str("Player/coach/figure"), era: str("Era"), why: str("Why fans revere them") }), 2, 8),
    rivalries: arr(obj({ opponent: str("Rival team"), heat: { type: "string", enum: ["red-hot", "strong", "simmering", "historic"] }, why: str("Why") }), 1, 5),
    sentiment: str("Current fan mood heading into 2026-27 and why"),
    gamedayLook: str("What a typical fan wears to a home game right now"),
  }),
  uniform: obj({
    palette: arr(obj({ name: str("Official color name"), hex: HEX }), 2, 6),
    eras: arr(obj({ era: str("Years"), look: str("Defining look"), legacy: str("How it's remembered") }), 1, 6),
    cityEditions: arr(obj({ season: str("e.g. 2023-24"), concept: str("Concept"), reception: { type: "string", enum: ["loved", "liked", "mixed", "disliked", "unknown"] }, note: str("Why / what fans said") }), 0, 10),
    fanFavorites: arr(str("Throwback or look fans most want/wear"), 1, 6),
    untoldStories: arr(obj({ story: str("A local story not yet told on a uniform"), why: str("Why it would resonate") }), 2, 6),
  }),
  "retail-landscape": obj({
    districts: arr(obj({ name: str("District, street or mall"), profile: str("What it is"), shopper: str("Who shops here"), role: { type: "string", enum: ["tastemaker", "volume", "tourist", "community", "mixed"] } }), 3, 8),
    doors: arr(obj({ name: str("Real, currently-operating store"), type: { type: "string", enum: ["nike-owned", "team-store", "sneaker-boutique", "streetwear", "athletic-chain", "department", "resale", "vintage", "local-brand", "big-box", "other"] }, neighborhood: str("Where"), why: str("Why it matters for Nike Basketball") }), 4, 14),
  }),
  "retail-behavior": obj({
    calendar: arr(obj({ window: str("When, e.g. 'early Aug'"), month: MONTH, driver: str("What drives spend"), impact: { type: "string", enum: ["high", "medium", "low"] } }), 4, 12),
    channels: arr(obj({ channel: str("Channel"), role: str("How this market uses it") }), 3, 7),
    priceProfile: str("Price sensitivity and income spread, with what it means for tiering"),
    jerseyBehavior: str("How fans buy jerseys and team apparel"),
  }),
};

export function lensSchema(id) {
  const props = { ...LENS_BASE };
  if (LENS_EXTRA[id]) props.extra = LENS_EXTRA[id];
  return obj({ ...props, provenance: PROVENANCE }, Object.keys(props));
}

const PRODUCT_CATEGORY = { type: "string", enum: ["jersey", "tee", "fleece", "outerwear", "shorts", "pants", "headwear", "footwear", "accessory", "kids", "other"] };

// The Nike Basketball brief for one market (written by the strategist, revised
// by the editor).
const STRATEGY_PROPS = {
  team: str("Team id"),
  headline: str("The market's story in one line, 120 characters at most"),
  thesis: str("3-5 sentences: what makes this fandom distinct and where Nike wins"),
  archetype: obj({ name: str("Fandom archetype name, e.g. 'The Loyal Underdog'"), description: str("1-2 sentences") }),
  pulse: obj({ teamMoment: str("The team's 2026-27 situation in one or two sentences"), sentiment: str("Fan mood now"), heat: { type: "integer", minimum: 0, maximum: 100, description: "Current fan engagement heat" } }),
  topInsights: arr(obj({ title: str("Short title"), insight: str("The insight, 1-3 sentences"), evidence: arr(str("Lens id that supports it"), 1, 6), implication: str("What it means for product"), confidence: CONFIDENCE }), 5, 7),
  opportunities: arr(obj({
    id: str("kebab-case id"),
    title: str("Opportunity name"),
    summary: str("What the opportunity is"),
    where: arr(str("Neighborhood, door, channel or venue"), 1, 5),
    when: str("Activation window in words"),
    months: arr(MONTH, 1, 12),
    how: str("How to activate — mechanics, partners, storytelling"),
    products: arr(str("Specific product"), 1, 6),
    segment: str("Fan segment it serves"),
    size: { type: "string", enum: ["high", "medium", "low"] },
    priority: { type: "integer", minimum: 1, maximum: 3, description: "1 = do first" },
    kpi: str("How to measure it"),
  }), 5, 8),
  collection: obj({
    name: str("Collection name"),
    story: str("2-3 sentence story"),
    themes: arr(obj({
      name: str("Theme name"),
      story: str("1-2 sentences"),
      segment: str("Who it's for"),
      graphics: str("Graphic direction"),
      palette: arr(obj({ name: str("Color name"), hex: HEX }), 2, 5),
      materials: str("Materials, trims, finishes"),
      pieces: arr(obj({ item: str("Product"), category: PRODUCT_CATEGORY, tier: { type: "string", enum: ["entry", "core", "premium", "limited"] }, detail: str("Design detail") }), 2, 6),
    }), 2, 4),
  }),
  uniform: obj({
    concept: str("City Edition concept name"),
    narrative: str("2-3 sentences: the story and why this city will feel it"),
    palette: arr(obj({ name: str("Color name"), hex: HEX, role: str("base / trim / accent / number") }), 2, 5),
    motifs: arr(str("Motif"), 2, 6),
    typography: str("Wordmark and number direction"),
    details: arr(str("Detail: waistband, neck tape, jock tag, side panel, court tie-in"), 2, 6),
    avoid: arr(str("What not to do"), 1, 5),
    alternates: arr(obj({ name: str("Alternate concept"), idea: str("One sentence") }), 1, 3),
  }),
  calendar: arr(obj({
    month: MONTH,
    window: str("Dates or window"),
    moment: str("The moment"),
    play: str("The activation"),
    products: arr(str("Product"), 1, 5),
    channel: str("Where it happens: door, digital, arena, community"),
    priority: { type: "integer", minimum: 1, maximum: 3 },
  }), 8, 14),
  partners: arr(obj({ name: str("Local creative, brand, venue, collective or institution"), type: str("Type"), why: str("Why them"), idea: str("Collaboration idea") }), 3, 8),
  retailPlaybook: obj({ where: arr(str("Where to win"), 2, 5), when: arr(str("When to win"), 2, 5), how: arr(str("How to win"), 2, 5) }),
  risks: arr(obj({ risk: str("Risk"), mitigation: str("Mitigation") }), 2, 5),
  scorecard: obj({
    opportunity: { type: "integer", minimum: 0, maximum: 100, description: "Size of the Nike opportunity" },
    culture: { type: "integer", minimum: 0, maximum: 100, description: "Depth of distinct local culture to design from" },
    retail: { type: "integer", minimum: 0, maximum: 100, description: "Retail readiness / infrastructure" },
    fandom: { type: "integer", minimum: 0, maximum: 100, description: "Fan intensity" },
    rationale: str("One or two sentences explaining the scores"),
  }),
};
export const STRATEGY_SCHEMA = obj({ ...STRATEGY_PROPS, provenance: PROVENANCE }, Object.keys(STRATEGY_PROPS));

// Critic outputs (written to research/nba/<team>/factcheck.json, critique.json).
export const FACTCHECK_SCHEMA = obj({
  team: str("Team id"),
  checked: { type: "integer", minimum: 0, description: "How many claims were checked" },
  verdicts: arr(obj({
    lens: str("Lens id or 'strategy'"),
    claim: str("The claim checked"),
    verdict: { type: "string", enum: ["confirmed", "corrected", "removed", "unverifiable"] },
    note: str("What was found / changed"),
    source: str("URL used, or empty string"),
  }), 0, 40),
  summary: str("One-paragraph summary of accuracy across the dossiers"),
});

export const CRITIQUE_SCHEMA = obj({
  team: str("Team id"),
  issues: arr(obj({
    target: str("Which part of the brief, e.g. 'topInsights[2]', 'uniform', 'calendar'"),
    type: { type: "string", enum: ["generic", "stereotype", "appropriation", "weak-link", "timing", "missed-opportunity", "inaccurate", "other"] },
    severity: { type: "string", enum: ["high", "medium", "low"] },
    problem: str("What's wrong"),
    fix: str("Specific fix"),
  }), 0, 20),
  strengths: arr(str("What the brief gets right"), 0, 6),
  summary: str("Overall verdict"),
});

// Cross-market synthesis across all 30 briefs (research/nba/league.json).
export const LEAGUE_SCHEMA = obj({
  headline: str("The league-wide thesis in one line"),
  thesis: str("3-5 sentences on what local fandom means for Nike Basketball across the league"),
  themes: arr(obj({ title: str("Pattern seen across markets"), insight: str("1-3 sentences"), teams: arr(str("Team id"), 2, 30), implication: str("What it means for product") }), 4, 8),
  clusters: arr(obj({ name: str("Fandom archetype cluster"), description: str("What unites these markets"), teams: arr(str("Team id"), 1, 30), playbook: str("How to design and activate for this cluster") }), 3, 7),
  tentpoles: arr(obj({ month: MONTH, window: str("Dates"), moment: str("League or cross-market moment"), play: str("The national play and how markets localize it"), teams: arr(str("Team id"), 0, 30) }), 6, 14),
  priorities: arr(obj({ team: str("Team id"), title: str("Opportunity"), why: str("Why it ranks"), months: arr(MONTH, 1, 12) }), 8, 15),
  portland: arr(obj({ title: str("Operating principle for the Portland-based team"), detail: str("1-3 sentences") }), 3, 6),
  watchlist: arr(obj({ market: str("Market not yet in the NBA or a market in flux"), why: str("Why to watch it") }), 0, 4),
  // Each strategist scored its market alone; one agent that sees all 30
  // re-calibrates so the scores compare across markets (50 = league average).
  scores: arr(obj({
    team: str("Team id"),
    opportunity: { type: "integer", minimum: 0, maximum: 100 },
    culture: { type: "integer", minimum: 0, maximum: 100 },
    retail: { type: "integer", minimum: 0, maximum: 100 },
    fandom: { type: "integer", minimum: 0, maximum: 100 },
    note: str("One sentence on why this market sits where it does relative to the league"),
  }), 30, 30),
});

// League Pulse: each team's verified 2026-27 situation, researched live once per
// conference (research/nba/league-pulse-<east|west>.json) and injected into
// every market agent's brief as authoritative current facts.
export const PULSE_SCHEMA = obj({
  asOf: str("Date researched, YYYY-MM-DD"),
  conference: { type: "string", enum: ["East", "West"] },
  teams: arr(obj({
    team: str("Team id"),
    teamMoment: str("1-2 sentences: the team's 2026-27 situation and storyline"),
    lastSeason: str("2025-26 record and how it ended"),
    headCoach: str("Head coach for 2026-27"),
    stars: arr(str("Key player on the 2026-27 roster"), 1, 6),
    keyMoves: arr(str("2026 offseason move: trade, signing, draft pick, departure"), 0, 8),
    expectations: str("Expectations for 2026-27"),
    ownershipArena: str("Ownership and arena facts or news (empty string if none)"),
    cityEdition: str("2026-27 City Edition status if announced, else empty string"),
    marquee: arr(str("Marquee 2026-27 game: opening night, Christmas, rivalry, NBA Cup"), 0, 6),
    sources: arr(SOURCE, 1, 8),
  }), 15, 15),
});

export const SCHEMAS = {
  plan: PLAN_SCHEMA,
  evidence: EVIDENCE_SCHEMA,
  pulse: PULSE_SCHEMA,
  strategy: STRATEGY_SCHEMA,
  factcheck: FACTCHECK_SCHEMA,
  critique: CRITIQUE_SCHEMA,
  league: LEAGUE_SCHEMA,
};

// Resolve the schema for any output file name in research/nba/<team>/.
export function schemaFor(name) {
  if (SCHEMAS[name]) return SCHEMAS[name];
  if (LENS_IDS.includes(name)) return lensSchema(name);
  return null;
}
