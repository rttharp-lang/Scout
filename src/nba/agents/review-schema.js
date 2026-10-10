// Contracts for the review layer that sits on top of each market's research:
//   research/nba/<team>/plan.json      timing for every calendar entry, and the
//                                      hand-off fields for every opportunity
//   research/nba/<team>/evidence.json  claims checked live, observed fan evidence
//                                      and sourced visual references
// The site reads the vocabularies below, so a label means the same thing on
// every page.

const str = (description) => ({ type: "string", description });
const int = (description) => ({ type: "integer", minimum: 0, description });
const arr = (items, min, max, description) => ({ type: "array", items, ...(min != null ? { minItems: min } : {}), ...(max != null ? { maxItems: max } : {}), ...(description ? { description } : {}) });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const oneOf = (values, description) => ({ type: "string", enum: values, description });
const DATE = { type: "string", pattern: "^20\\d\\d-(0[1-9]|1[0-2])(-(0[1-9]|[12]\\d|3[01]))?$", description: "YYYY-MM, or YYYY-MM-DD when the day is known" };
const DATE_OR_EMPTY = { type: "string", pattern: "^(20\\d\\d-(0[1-9]|1[0-2])(-(0[1-9]|[12]\\d|3[01]))?)?$", description: "YYYY-MM or YYYY-MM-DD, or empty string" };
const PUBLISHED = { type: "string", pattern: "^((19|20)\\d\\d(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\\d|3[01]))?)?)?$", description: "Publication date as shown by the source (YYYY, YYYY-MM or YYYY-MM-DD), or empty string if none was shown" };

// What kind of thing a calendar entry is.
export const TIMING_KINDS = {
  event: "Event: something that happens on a date (a game, festival, holiday or anniversary)",
  action: "Action window: work the team must do (sign partners, open rights talks, brief a product)",
  launch: "Launch: a product drop or release",
  season: "Season: a stretch of weeks with its own mood (the first freeze, gifting season)",
};

// How sure we are of a date.
export const CERTAINTY = {
  confirmed: "Confirmed: checked against a retrieved source or the verified league calendar, or fixed by the calendar itself",
  tentative: "Tentative: a date written in the brief but not checked, or marked expected or to confirm",
  unknown: "Unknown: no date beyond a month or season",
};
export const DATE_BASIS = ["checked-live", "league-calendar", "fixed-holiday", "brief-unchecked", "none"];

// How a product would get made. Lead times are not assumed: each route lists
// what has to be true before it can ship.
export const ROUTES = {
  "existing-inventory": "Existing inventory: styles already in the line. Needs stock confirmed.",
  "quick-turn-graphics": "Quick-turn graphics: new prints on existing blanks. Needs art approval, licensing and print capacity.",
  "new-development": "New apparel development: a new style, fabric or fit. Runs on the product calendar.",
  "future-uniform": "Future uniform concept: a City Edition or uniform idea that runs through the NBA and team uniform program.",
  "no-product": "No product: a partnership, event or community investment.",
};

export const DEPENDENCIES = {
  "league-or-team-rights": "NBA or team marks and approvals",
  "player-or-estate-rights": "Player, alumni or estate likeness",
  "third-party-ip": "Third-party marks, artwork or names",
  "partner-agreement": "A signed partner agreement",
  "stock-availability": "Stock confirmed in the right sizes",
  "production-capacity": "Production or print capacity",
  "nike-calendar-approval": "A slot on Nike's product calendar",
  "retailer-agreement": "A retailer agreeing to carry it",
  "venue-or-permit": "A venue booking or city permit",
  "brand-safety": "Brand-safety sign-off",
  "date-confirmation": "The date itself, still to confirm",
};

export const FIT = ["men's", "women's", "unisex adult", "youth", "kids", "infant and toddler", "to define"];

export const OWNERS = [
  "Licensed team apparel",
  "Design",
  "Merchandising",
  "Marketing",
  "Nike retail",
  "Partnerships and community",
  "Licensing and legal",
  "NBA uniform program",
];

// Where an idea stands. Nothing on the site is approved; only people can
// move an idea past "hypothesis", and no one has yet.
export const STATUSES = {
  hypothesis: "Hypothesis: an idea from the research, not yet tested",
  validating: "Validating: a named owner is testing it",
  "ready-to-brief": "Ready to brief: tested, with owner and dependencies cleared",
  deferred: "Deferred: parked by a named owner",
};

export const SEASONS = ["2026-27", "2027-28", "2028-29", "2029-30"];

const CATEGORY = oneOf(["jersey", "tee", "fleece", "outerwear", "shorts", "pants", "headwear", "footwear", "accessory", "kids", "uniform", "event", "other"]);
const DEPENDENCY = oneOf(Object.keys(DEPENDENCIES));
const ROUTE = oneOf(Object.keys(ROUTES));

export const PLAN_SCHEMA = obj({
  team: str("Team id"),
  calendar: arr(obj({
    i: int("Index of the entry in strategy.json calendar"),
    window: str("The entry's window text, copied exactly"),
    kind: oneOf(Object.keys(TIMING_KINDS)),
    start: DATE,
    end: DATE_OR_EMPTY,
    recurring: { type: "boolean", description: "True when the moment comes round every year at about the same time" },
    certainty: oneOf(Object.keys(CERTAINTY)),
    basis: oneOf(DATE_BASIS),
    basisNote: str("Ledger claim id, league-calendar event, the holiday rule, or empty string"),
    actBy: DATE_OR_EMPTY,
    actNote: str("What must happen by actBy, from the brief; empty string when actBy is empty"),
    route: ROUTE,
    targetSeason: { type: "string", enum: [...SEASONS, ""] },
    dependencies: arr(DEPENDENCY, 0, 6),
  })),
  opportunities: arr(obj({
    id: str("Opportunity id from strategy.json"),
    consumer: str("Who it's for, in one line, drawn from the brief"),
    insights: arr({ type: "integer", minimum: 0 }, 0, 3, "Indexes into strategy.json topInsights that support this idea"),
    categories: arr(CATEGORY, 1, 6),
    fit: arr(oneOf(FIT), 1, 6),
    targetSeason: oneOf(SEASONS),
    firstInMarket: DATE,
    actBy: DATE,
    actNote: str("The first decision or step due by actBy, from the brief"),
    routes: arr(ROUTE, 1, 4),
    validation: arr(str("What has to be tested before anyone briefs it: consumer, commercial or operational"), 1, 4),
    dependencies: arr(DEPENDENCY, 0, 8),
    owner: oneOf(OWNERS),
    partners: arr(str("External organization or person the idea names as a partner. All are prospects."), 0, 8),
    status: oneOf(Object.keys(STATUSES)),
  })),
});

const SOURCE = obj({
  title: str("Page or article title as shown"),
  url: str("URL returned by the search"),
  publisher: str("Publisher or site"),
  published: PUBLISHED,
});
const SUPPORTS = obj({
  insights: arr({ type: "integer", minimum: 0 }, 0, 7),
  opportunities: arr(str("Opportunity id"), 0, 8),
  calendar: arr({ type: "integer", minimum: 0 }, 0, 20),
});

export const EVIDENCE_TYPES = {
  styling: "Observed outfits and styling",
  "fan-comment": "Dated fan comments (directional only)",
  "uniform-reaction": "Reactions to a uniform",
  retailer: "Retailer observations",
  "commercial-signal": "Commercial signals",
  conflict: "Conflicting evidence",
  segment: "Segment differences",
};

export const REFERENCE_KINDS = {
  "fan-styling": "Fan styling",
  "historic-uniform": "Historical uniforms",
  "lettering-art-materials": "Local lettering, art and materials",
  "court-store-space": "Courts, stores and community spaces",
};

export const CLAIM_STATUS = {
  verified: "Verified: a dated source returned by a live search states it",
  contradicted: "Contradicted: a live source says otherwise; corrected at the source",
  unclear: "Unclear: searched, but nothing settled it",
};

export const EVIDENCE_SCHEMA = obj({
  team: str("Team id"),
  checkedOn: str("YYYY-MM-DD"),
  searches: int("Live searches used"),
  claims: arr(obj({
    id: str("<team>-c1, <team>-c2, …"),
    claim: str("The claim as the research states it"),
    topic: oneOf(["store-or-venue", "history", "partner", "team", "uniform", "event-date", "other"]),
    status: oneOf(Object.keys(CLAIM_STATUS)),
    sources: arr(SOURCE, 0, 3),
    evidence: str("What the sources say, in your own words"),
    action: str("What changed in the research files, or 'No change needed'"),
    supports: SUPPORTS,
  })),
  observations: arr(obj({
    type: oneOf(Object.keys(EVIDENCE_TYPES)),
    observation: str("What was observed, paraphrased; no invented quotes"),
    audience: str("Whose behavior or view this reflects"),
    timeframe: str("When it was observed or published"),
    limitations: str("Why it can't be generalized"),
    source: SOURCE,
    supports: SUPPORTS,
  })),
  references: arr(obj({
    kind: oneOf(Object.keys(REFERENCE_KINDS)),
    title: str("What the reference shows"),
    note: str("What to look at and which insight it supports"),
    credit: str("Rights holder, photographer or publisher as shown, or 'See source'"),
    source: SOURCE,
    supports: SUPPORTS,
  })),
  corrections: arr(obj({
    claim: str("What the research said"),
    correction: str("What is true, per the sources"),
    files: arr(str("File name changed, e.g. strategy.json"), 1, 14),
    claimId: str("The claims[] id with the sources"),
  })),
});
