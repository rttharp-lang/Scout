// Home Court agent roster — the single source of truth for every agent that
// researches an NBA market. Three consumers read it:
//   1. scripts/nba/brief.mjs   → prints an agent's full brief for the offline
//                                research workflow (research/nba/<team>/*.json)
//   2. api/homecourt-agent.js  → runs the same agents live via the Claude API
//   3. the site's Agents page  → shows the roster and the pipeline
// Each LENS agent owns one slice of a market and writes a dossier. The
// SYNTHESIS agents turn eleven dossiers into the Nike Basketball brief.

export const SEASON = "2026-27";

// The shared bar every agent is held to. Mirrors Scout's curation standard:
// insider, specific, current, and translated into product.
export const STANDARDS = `WHO THIS IS FOR: the Nike Basketball apparel and uniform design team, based in Portland, Oregon. They need to become experts in every NBA team's local fandom — where the opportunities are, when to activate, and how to activate them against which products (apparel collections, City Edition uniforms, team-specific and city-specific product).

THE BAR — every claim must pass all of these:
- SWAP TEST: if you could replace the city name with another city and the sentence would still be true, it is generic. Cut it or sharpen it until it could only be about this market.
- INSIDER TEST: name the real places, people, collectives, events, dishes, phrases and moments a plugged-in local would recognize and respect — not the first page of a tourist guide.
- CURRENT: it is the ${SEASON} NBA season. Places must be operating and facts must be true now. Use web search to verify anything that could have changed (closures, moves, rebrands, rosters, coaches, arena names, ownership, event dates). If you cannot confirm something is real and current, drop it.
- PRODUCT LENS: always translate culture into what a designer can use — colors (with hex), motifs, textures, typography, silhouettes, materials, graphics, stories — and into concrete product hooks.
- RESPECT: no stereotypes or caricature. When a cue comes from a specific community (Black, Latino, Indigenous, Asian, Pacific Islander, LGBTQ+, immigrant communities), say how to engage authentically: partner with, credit and pay its creators; never lift sacred or ceremonial imagery. Flag third-party IP that would need licensing.
- PEOPLE: name public figures, artists, athletes, chefs, designers, collectives and businesses. Never name private individuals.
- TIGHT: one to three sentences per field. No filler, no hedging boilerplate. Fewer, stronger items beat padded lists.
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
    mission: "Decode the sound of the market and how it shows up around the team.",
    questions: [
      "Which genres, sounds and movements were born here or define the city now (historic and current)?",
      "Who are the established and rising local artists, producers, DJs and collectives that locals rep — and which have real ties to the team or its players?",
      "Which venues matter: legendary rooms, DIY spaces, club nights, radio stations, record stores?",
      "Which festivals and recurring music moments happen, and when?",
      "Where does music meet the team: anthems, arena DJ/halftime culture, walkout songs, lyrics that name-check the team, player-artist relationships?",
      "What visual language comes from the scene — album art, flyers, gig posters, merch — that a designer could borrow from respectfully?",
    ],
  },
  {
    id: "art", name: "Art & Design Scene", group: "Culture", icon: "palette",
    mission: "Map the visual culture — the walls, studios, signage and makers that give the city its look.",
    questions: [
      "Which murals, mural districts and street artists define the city's walls today?",
      "Which galleries, artist-run spaces, design studios and schools drive the scene?",
      "What is the local graphic and typographic vernacular — signage, neon, hand-painted signs, transit graphics, license plates, flags, architecture?",
      "Which local illustrators, designers, photographers or tattoo artists have done sports, sneaker or streetwear work (or would be credible collaborators)?",
      "Which art events, fairs and festivals happen, and when?",
      "What palettes, patterns, textures and letterforms are unmistakably this city?",
    ],
  },
  {
    id: "food", name: "Food Scene", group: "Culture", icon: "utensils",
    mission: "Read the city through what it eats, where it gathers, and what it is proud of.",
    questions: [
      "What are the signature dishes and the regional food identity — and the institutions that carry them?",
      "Which immigrant food corridors and newer chef-driven spots define the city now?",
      "What are the game-day food rituals: pre-game spots, tailgates, watch-party bars, local vendors inside the arena?",
      "Which restaurants or food brands have cult merch or design language that locals wear?",
      "Which chefs and food figures are cultural voices, and which food festivals happen when?",
      "What food references could become respectful, insider product details (colorways, graphics, packaging, names)?",
    ],
  },
  {
    id: "culture", name: "Culture & Heritage", group: "Culture", icon: "landmark",
    mission: "Capture the civic identity: history, communities, symbols, language and self-image.",
    questions: [
      "How does the city see itself (and how does it think the rest of the country sees it)? What chip on the shoulder or point of pride drives it?",
      "Which history moments, movements and communities shape local pride today?",
      "Which neighborhoods have distinct identities that people rep?",
      "What symbols are used by locals: flags, area codes, skylines, bridges, nicknames, landmarks, state shapes?",
      "What local slang and phrases do people actually say?",
      "How do climate and lifestyle shape what people wear, and what civic moments (parades, heritage celebrations) fill the year?",
    ],
  },
  {
    id: "underground", name: "Subculture & Underground", group: "Culture", icon: "radio",
    mission: "Find the scenes beneath the surface that set taste before the mainstream catches up.",
    questions: [
      "Which subcultures are strongest here: skate, BMX, car culture (lowriders, slab, sideshows, tuners), sneaker and streetwear communities, vintage circles, ballroom and queer nightlife, rave/DIY, zines, gaming/anime, dance styles?",
      "Who are the tastemakers, collectives, crews, shops and spaces at the center of each?",
      "What is emerging in 2025-26 that the mainstream hasn't caught yet?",
      "What do these scenes wear, and how do they customize, thrift or remix sportswear and team gear?",
      "Which recurring events or gatherings matter, and when?",
      "Which scenes could Nike engage credibly, and which should be left alone?",
    ],
  },
  {
    id: "hoops", name: "Grassroots Hoops", group: "Basketball", icon: "dribbble",
    mission: "Map the basketball culture outside the arena — the courts, leagues and legends that feed the fandom.",
    questions: [
      "Which outdoor courts, parks and gyms are legendary, and what happens there?",
      "Which pro-am, summer and streetball leagues run, and when?",
      "Which high schools, AAU/EYBL programs and college programs carry local pride, and what are the rivalries?",
      "Which WNBA, G League or other pro basketball teams share the market?",
      "Which NBA/WNBA players and streetball legends come from here, and how do locals claim them?",
      "How do local hoopers dress and what do they wear on court? Which basketball media and creators come from here?",
    ],
  },
  {
    id: "fanbase", name: "Fan Base Identity", group: "Fandom", icon: "users",
    mission: "Profile who the fans are, how they show up, and what they wear.",
    questions: [
      "What is the fan base's identity and loyalty profile, and what is the current mood heading into the 2026-27 season (roster, ownership, expectations)?",
      "Which distinct fan segments exist (diehards, families, Gen Z digital fans, regional/rural fans, diaspora/international, corporate, bandwagon) and what does each wear and value?",
      "What traditions, rituals, chants, signs and gameday habits define them?",
      "Which legends and eras do they worship, which current players do they embrace, and who are their rivals?",
      "What do fans wear on gameday and around town — which jerseys, eras, throwbacks and local brands?",
      "Where do fans gather — supporter groups, podcasts, Reddit, bars, watch parties — and how do they relate to Nike, Jordan and team merch?",
    ],
  },
  {
    id: "rhythm", name: "Fan Rhythm", group: "Fandom", icon: "activity",
    mission: "Map, month by month, how this fan base interacts with its team across a full year — and what the city is doing at the same time.",
    questions: [
      "For each month Jan–Dec: how intensely is the fan base engaged (0-100), what phase is it (offseason, draft, free agency, Summer League, media day, preseason, opener, NBA Cup, Christmas, trade deadline, All-Star, playoff push, playoffs)?",
      "What local rhythms compete or combine in each month — weather, school calendar, other pro and college sports seasons, festivals, holidays, tourism?",
      "What are the specific 2026-27 key dates for this team where verifiable (home opener, rivalry games, national TV games, heritage nights, City Edition debut)?",
      "When do fans buy — which months spike for jerseys, gifts, playoff gear — and when do they disengage?",
    ],
  },
  {
    id: "uniform", name: "Uniform & Merch Archive", group: "Fandom", icon: "shirt",
    mission: "Know every uniform the team has worn, what fans loved or hated, and what story is still untold.",
    questions: [
      "What is the team's official color palette (with hex codes) and the typographic/wordmark heritage?",
      "What are the defining uniform eras and iconic looks?",
      "What has each City Edition been (as far back as you can verify), what was its concept, and how did fans receive it?",
      "Which throwbacks/Classic Editions do fans most want or most wear, and what is the current 2026-27 uniform set (if announced)?",
      "What local brands, bootleg/fan-made merch and creators riff on the team, and what sells best?",
      "Which local stories have NOT been told on a uniform yet but would resonate?",
    ],
  },
  {
    id: "retail-landscape", name: "Retail Landscape", group: "Retail", icon: "store",
    mission: "Map where to shop and where this market actually shops for basketball, sneakers and team gear.",
    questions: [
      "Which retail districts, streets and malls matter, and who shops each?",
      "Where do fans actually buy team gear — arena team store, flagship, big box, Fanatics/Lids, local shops?",
      "Which Nike-owned doors (Nike Well Collective / community / factory stores) and key partners (Foot Locker, House of Hoops, JD, Dick's, local boutiques) operate here?",
      "Which independent sneaker boutiques, streetwear shops, consignment and vintage stores have real community credibility?",
      "Which local apparel brands have big followings, and where do pop-ups happen?",
      "Which doors are culturally important (set taste) versus volume drivers?",
    ],
  },
  {
    id: "retail-behavior", name: "Retail Rhythm & Behavior", group: "Retail", icon: "calendar-clock",
    mission: "Explain when this market shops and how — the calendar, channels, price points and habits.",
    questions: [
      "What is the local retail calendar: back-to-school dates, sales-tax holidays (or no sales tax), holiday peaks, heritage and religious calendars, tourism seasons, conventions and events?",
      "How does weather shape what sells and when (outerwear, shorts, layering)?",
      "What is the channel mix — in-store, online, social commerce, resale, raffles, line culture, drops?",
      "How price-sensitive is the market, how does income vary across it, and how do fans buy jerseys (authentic, swingman, kids, knockoffs)?",
      "What gifting moments and local paydays/seasonal economies matter?",
      "What cross-border, tourist or regional shopper behaviors matter?",
    ],
  },
];

export const SYNTHESIS_AGENTS = [
  { id: "strategist", name: "Market Strategist", group: "Synthesis", icon: "target",
    mission: "Turn eleven dossiers into the Nike Basketball brief: insights, opportunities, collection, uniform, activation calendar." },
  { id: "factcheck", name: "Fact-Check Critic", group: "Verification", icon: "shield-check",
    mission: "Adversarially verify the highest-risk claims across every dossier and correct or remove what fails." },
  { id: "authenticity", name: "Authenticity Critic", group: "Verification", icon: "scale",
    mission: "Attack the brief for generic insights, stereotypes, appropriation risk, weak product links and missed opportunities." },
  { id: "editor", name: "Brief Editor", group: "Synthesis", icon: "pen-tool",
    mission: "Revise the brief against both critiques so every recommendation is specific, verified and actionable." },
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
  headline: str("One sharp sentence: the essence of this lens for this market"),
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
  headline: str("The market thesis in one line (≤ 120 characters)"),
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

export const SCHEMAS = {
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
