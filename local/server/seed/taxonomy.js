// Shared first-principles taxonomy, version 1. Layers are separately searchable
// and linkable; a finding may carry many nodes across layers. Team-local child
// nodes (scope "team:<id>") are added through the taxonomy editor workflow.
const node = (id, layer, name, definition, extra = {}) => ({
  id, layer, name, definition, parent_id: extra.parent || null,
  inclusion: extra.inc || "", exclusion: extra.exc || "", synonyms: extra.syn || [], examples: extra.ex || [],
  counterexamples: extra.cex || [], evidence_requirements: extra.req || "", owner: extra.owner || "taxonomy-steward",
  scope: extra.scope || "shared", team_id: extra.team_id || null, status: "active",
});

export const TAXONOMY_V1 = [
  // Layer: motivation --------------------------------------------------------
  node("mot", "motivation", "Motivation", "Proposed need, desired experience, or practical reason behind fan behavior. A working taxonomy, not a claim of established basic needs.",
    { req: "Every motivation code must state whether it rests on established theory, locally supported explanation, or untested hypothesis." }),
  node("mot.connection", "motivation", "Connection and belonging", "Who are my people, and where am I accepted?",
    { parent: "mot", inc: "Relationships, gathering places, invitations, mutual support, shared language", exc: "Attendance alone; co-presence without evidence of relationship", syn: ["belonging", "relatedness", "community"], ex: ["A watch-party group that texts between games"], cex: ["Sold-out attendance figures used as proof of connection"], req: "Behavior or testimony showing relationship or acceptance; corroborate with a second independent source", }),
  node("mot.identity", "motivation", "Identity and expression", "What does this allegiance express about me?",
    { parent: "mot", inc: "Self-described values, style, symbols, civic allegiance, desired distinctions", exc: "Assuming everyone in a city shares one identity", syn: ["self-expression", "civic pride"], ex: ["Fan explains wearing a specific edition to signal neighborhood loyalty"], req: "Stated motive or repeated symbolic behavior with the fan's own framing" }),
  node("mot.continuity", "motivation", "Continuity and inheritance", "What connects my past to my future?",
    { parent: "mot", inc: "Family stories, inherited rituals, memories, traditions passed to children", exc: "Older product preference read as nostalgia without testimony", syn: ["heritage", "legacy", "intergenerational"], req: "Testimony of inheritance or a documented repeated practice across years" }),
  node("mot.recognition", "motivation", "Recognition and significance", "Do I matter and feel represented here?",
    { parent: "mot", inc: "Fan contribution, community recognition, representation, overlooked voices", exc: "Public visibility equated with feeling valued", syn: ["representation", "mattering"], req: "Evidence that fans notice or respond to being recognized, or express its absence" }),
  node("mot.agency", "motivation", "Agency and mastery", "Can I contribute, learn, and have a role?",
    { parent: "mot", inc: "Organizing, creating, team knowledge, mentoring, participation", exc: "A highly active poster taken to represent everyone", syn: ["competence", "contribution", "autonomy"], req: "Observed contribution or self-described role" }),
  node("mot.emotion", "motivation", "Emotional experience", "What do I want to feel?",
    { parent: "mot", inc: "Anticipation, suspense, joy, release, defiance, shared disappointment", exc: "High arousal or negative attention taken as positive affinity", syn: ["excitement", "catharsis"], req: "Stated feelings or behavior consistent with seeking the feeling; separate valence from intensity" }),
  node("mot.other", "motivation", "Other and practical reasons", "Entertainment, convenience, aesthetic preference, habit, price, athlete attraction, social obligation, or explanations that do not fit a need category.",
    { parent: "mot", inc: "Any supported practical or alternative explanation", req: "Code when supported; do not force into a need category" }),
  node("mot.other.entertainment", "motivation", "Entertainment", "Wanting a good show or a good time.", { parent: "mot.other" }),
  node("mot.other.convenience", "motivation", "Convenience and access", "Participation because it is easy, near, cheap, or available.", { parent: "mot.other" }),
  node("mot.other.aesthetic", "motivation", "Aesthetic preference", "Liking how something looks independent of allegiance.", { parent: "mot.other" }),
  node("mot.other.habit", "motivation", "Habit", "Repeated behavior sustained by routine rather than active motive.", { parent: "mot.other" }),
  node("mot.other.price", "motivation", "Price and value", "Decisions driven by cost.", { parent: "mot.other" }),
  node("mot.other.athlete", "motivation", "Athlete attraction", "Following a player rather than the team.", { parent: "mot.other", req: "Distinguish durable team identity from athlete-specific attention" }),
  node("mot.other.obligation", "motivation", "Social obligation", "Participation because someone else expects it.", { parent: "mot.other" }),
  node("mot.unresolved", "motivation", "Unresolved or emergent motivation", "Observation whose motive is unknown or does not fit; preserved for review.", { parent: "mot", req: "Keep the observation; add the open question" }),

  // Layer: local context -----------------------------------------------------
  node("ctx", "local_context", "Local context", "Place, history, relationships, conditions, tensions, and community meanings."),
  node("ctx.place", "local_context", "Place", "Neighborhoods, venues, landmarks, routes and gathering places with demonstrated fan meaning.", { parent: "ctx", exc: "Generic city trivia without fan connection" }),
  node("ctx.history", "local_context", "History", "Civic, team and community history that fans reference.", { parent: "ctx" }),
  node("ctx.relationships", "local_context", "Relationships", "Ties between team, athletes, institutions, businesses and communities.", { parent: "ctx" }),
  node("ctx.conditions", "local_context", "Conditions", "Economic, transit, climate, media and ticketing conditions that shape participation.", { parent: "ctx" }),
  node("ctx.tension", "local_context", "Tension", "Contested narratives, rivalries within the fan base, or symbols requiring stewardship.", { parent: "ctx" }),
  node("ctx.meaning", "local_context", "Community meaning", "What a symbol or practice means to a specific community, in their terms.", { parent: "ctx", req: "Self-described group context or credible aggregate evidence; never inferred traits" }),

  // Layer: fan community and circumstance ------------------------------------
  node("com", "community", "Fan community and circumstance", "Relationship to team, participation pattern, life context, entry route, and missing voices."),
  node("com.relationship", "community", "Relationship to team", "Established, newer, casual, lapsed, prospective, rival-adjacent.", { parent: "com" }),
  node("com.relationship.established", "community", "Established", "Long-tenured participation.", { parent: "com.relationship" }),
  node("com.relationship.newer", "community", "Newer", "Recently entered fandom.", { parent: "com.relationship" }),
  node("com.relationship.casual", "community", "Casual", "Intermittent participation.", { parent: "com.relationship" }),
  node("com.relationship.lapsed", "community", "Lapsed", "Formerly active, now disengaged.", { parent: "com.relationship" }),
  node("com.relationship.prospective", "community", "Prospective", "Not yet participating; plausibly reachable.", { parent: "com.relationship" }),
  node("com.participation", "community", "Participation pattern", "Attending, watching, wearing, creating, collecting, organizing.", { parent: "com" }),
  node("com.life", "community", "Life context", "Family stage, work, mobility, language, and circumstances that shape access.", { parent: "com", exc: "Sensitive traits inferred about individuals" }),
  node("com.entry", "community", "Entry route", "How someone first came in: person, athlete, game, neighborhood, product, or cultural moment.", { parent: "com" }),
  node("com.missing", "community", "Missing voices", "Communities not represented in the current evidence.", { parent: "com", req: "State who is missing and why the access gap exists" }),

  // Layer: expression --------------------------------------------------------
  node("exp", "expression", "Expression", "Ritual, language, behavior, visual code, object, gathering place, or creative practice."),
  node("exp.ritual", "expression", "Ritual", "Repeated game-day or seasonal practices.", { parent: "exp", req: "Evidence of repetition across occasions" }),
  node("exp.language", "expression", "Language", "Chants, nicknames, humor, memes, slogans.", { parent: "exp" }),
  node("exp.behavior", "expression", "Behavior", "Observable actions in and around fandom.", { parent: "exp" }),
  node("exp.visual", "expression", "Visual code", "Colors, typography, patterns, symbols, gestures, apparel styling.", { parent: "exp" }),
  node("exp.object", "expression", "Object", "Jerseys, DIY merchandise, signs, collectibles.", { parent: "exp" }),
  node("exp.place", "expression", "Gathering place", "Bars, courts, blocks, sections, online spaces where fans meet.", { parent: "exp" }),
  node("exp.creative", "expression", "Creative practice", "Fan art, music, video, customization, storytelling.", { parent: "exp" }),

  // Layer: moment ------------------------------------------------------------
  node("mom", "moment", "Moment", "Trigger, recurrence, emotional function, participation mode, intensity, and duration."),
  node("mom.trigger", "moment", "Trigger", "What sets the moment off: schedule, rivalry, athlete news, civic event, promotion.", { parent: "mom" }),
  node("mom.trigger.schedule", "moment", "Schedule", "League or team calendar event.", { parent: "mom.trigger" }),
  node("mom.trigger.rivalry", "moment", "Rivalry", "Opponent-driven intensity.", { parent: "mom.trigger" }),
  node("mom.trigger.athlete", "moment", "Athlete news", "Player-driven attention.", { parent: "mom.trigger" }),
  node("mom.trigger.civic", "moment", "Civic event", "City or community calendar.", { parent: "mom.trigger" }),
  node("mom.trigger.promotion", "moment", "Promotion", "Paid or team-driven activation.", { parent: "mom.trigger" }),
  node("mom.trigger.fan", "moment", "Fan-initiated", "Started by fans without team direction.", { parent: "mom.trigger" }),
  node("mom.recurrence", "moment", "Recurrence", "One-off, annual, per-game, contingent.", { parent: "mom" }),
  node("mom.function", "moment", "Emotional and social function", "Pride, anticipation, anger, belonging, grief, relief, celebration.", { parent: "mom" }),
  node("mom.mode", "moment", "Participation mode", "In-arena, at home, online, in public space, wearing, creating.", { parent: "mom" }),
  node("mom.intensity", "moment", "Intensity and duration", "How strong and how long; separate attention volume from significance.", { parent: "mom", exc: "Summing likes, views and attendance into one total" }),

  // Layer: growth outcome ----------------------------------------------------
  node("gro", "growth", "Growth outcome", "Awareness, trial, repeat participation, attachment, advocacy, disengagement, or reactivation."),
  node("gro.awareness", "growth", "Awareness", "A reason to notice the team exists and could matter.", { parent: "gro" }),
  node("gro.trial", "growth", "Trial", "First participation.", { parent: "gro" }),
  node("gro.repeat", "growth", "Repeat participation", "Coming back.", { parent: "gro", req: "Consented first-party cohort or longitudinal data for measurement; otherwise a plausible driver" }),
  node("gro.attachment", "growth", "Attachment", "Sustained connection through losses and change.", { parent: "gro" }),
  node("gro.advocacy", "growth", "Advocacy", "Introducing others.", { parent: "gro" }),
  node("gro.disengagement", "growth", "Disengagement", "Leaving or fading.", { parent: "gro" }),
  node("gro.reactivation", "growth", "Reactivation", "Credible return after lapse.", { parent: "gro" }),
  node("gro.stage", "growth", "Journey stage", "Relevance, access, welcome, reward, continuity, advocacy, disengagement/reactivation (non-linear).", { parent: "gro" }),
  node("gro.stage.relevance", "growth", "Relevance", "What creates a reason to care?", { parent: "gro.stage" }),
  node("gro.stage.access", "growth", "Access", "What makes first participation possible?", { parent: "gro.stage" }),
  node("gro.stage.welcome", "growth", "Welcome", "What makes someone feel accepted?", { parent: "gro.stage" }),
  node("gro.stage.reward", "growth", "Reward", "What makes the experience meaningful enough to repeat?", { parent: "gro.stage" }),
  node("gro.stage.continuity", "growth", "Continuity", "What sustains connection through change?", { parent: "gro.stage" }),

  // Layer: product role ------------------------------------------------------
  node("prod", "product_role", "Product role", "Expression of allegiance, recognition, memory, participation, collecting, accessibility, or unresolved role."),
  node("prod.allegiance", "product_role", "Expression of allegiance", "Wearing to declare a side.", { parent: "prod" }),
  node("prod.recognition", "product_role", "Recognition", "Product that makes a community or contribution visible.", { parent: "prod" }),
  node("prod.memory", "product_role", "Memory", "Product tied to remembered moments or people.", { parent: "prod" }),
  node("prod.participation", "product_role", "Participation", "Product as part of a ritual or role.", { parent: "prod" }),
  node("prod.collecting", "product_role", "Collecting", "Acquisition, scarcity, completeness.", { parent: "prod", exc: "Listings and asking prices treated as transactions" }),
  node("prod.accessibility", "product_role", "Accessibility", "Price, fit, availability, and entry-level product.", { parent: "prod" }),
  node("prod.unresolved", "product_role", "Unresolved role", "Product relevance unclear or contested.", { parent: "prod" }),

  // Layer: evidence status ---------------------------------------------------
  node("evs", "evidence_status", "Evidence status", "Observed behavior, stated motivation, interpretation, hypothesis, contradiction, or creative proposal."),
  node("evs.observed", "evidence_status", "Observed behavior", "Directly documented action.", { parent: "evs" }),
  node("evs.stated", "evidence_status", "Stated motivation", "A fan's own account of why.", { parent: "evs" }),
  node("evs.interpretation", "evidence_status", "Interpretation", "A researcher's reading of evidence.", { parent: "evs" }),
  node("evs.hypothesis", "evidence_status", "Hypothesis", "Proposed explanation awaiting evidence.", { parent: "evs" }),
  node("evs.contradiction", "evidence_status", "Contradiction", "Evidence that conflicts with a claim.", { parent: "evs" }),
  node("evs.proposal", "evidence_status", "Creative proposal", "A design idea, not a finding.", { parent: "evs" }),
];

export const LAYERS = [
  { id: "motivation", label: "Motivation" }, { id: "local_context", label: "Local context" }, { id: "community", label: "Fan community and circumstance" },
  { id: "expression", label: "Expression" }, { id: "moment", label: "Moment" }, { id: "growth", label: "Growth outcome" },
  { id: "product_role", label: "Product role" }, { id: "evidence_status", label: "Evidence status" },
];
