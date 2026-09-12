// Specialist roster. Each specialist has its own question, source strategy,
// structured output schema and evidence obligations. Findings are mapped to
// the shared taxonomy, keep unclassified evidence, state alternatives, and
// separate behavior from stated or inferred motivation.
import { structured, untrusted, LLMError, llmStatus } from "../llm.js";
import { fetchArticle, fetchFeed, fetchWikipediaSummary, fetchNbaSchedule, connectorState } from "../connectors/index.js";
import { upsertSource, addEvidence, upsertClaim } from "../evidence.js";
import { q, rows, insertEntity, listEntities } from "../../db.js";

const LABELS = ["observed", "interpretation", "hypothesis", "proposal"];
const MODES = ["behavior", "testimony", "interpretation"];
const GEO = ["verified", "contextual", "unknown"];
const ORIGINS = ["fan", "team", "paid", "independent", "league", "internal", "unknown"];

// Shared structured output for research specialists.
export const FINDINGS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["findings", "unresolved_questions", "missing_voices", "coverage_note"],
  properties: {
    coverage_note: { type: "string", description: "What the retrieved sources do and do not cover; say plainly if evidence was insufficient." },
    findings: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false,
      required: ["headline", "statement", "label", "evidence", "taxonomy_codes", "alternatives", "disconfirming", "behavior_vs_motive"],
      properties: {
        headline: { type: "string" }, statement: { type: "string" }, label: { type: "string", enum: LABELS },
        section: { type: "string", enum: ["overview", "identity", "communities", "culture", "season", "growth", "uniform"] },
        behavior_vs_motive: { type: "string", description: "What was observed vs what is stated vs what is inferred." },
        evidence: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["source_index", "excerpt", "evidence_mode", "geo_relevance", "local_relevance_reason", "stance"],
          properties: { source_index: { type: "integer" }, excerpt: { type: "string", description: "Verbatim short excerpt from that source (max ~60 words)." }, evidence_mode: { type: "string", enum: MODES }, geo_relevance: { type: "string", enum: GEO },
            local_relevance_reason: { type: "string" }, stance: { type: "string", enum: ["supports", "contradicts", "context"] }, place: { type: "string" }, event_date: { type: "string" } } } },
        taxonomy_codes: { type: "array", items: { type: "string" }, description: "Taxonomy node IDs from the provided list. Use mot.unresolved when the motive is unknown." },
        community: { type: "string", description: "Fan community / circumstance this applies to, in the fans' own terms where possible." },
        alternatives: { type: "array", items: { type: "string" }, description: "Rival explanations that remain open." },
        disconfirming: { type: "string", description: "What evidence would disconfirm this." },
        uniform_relevance: { type: "string" },
      } } },
    unresolved_questions: { type: "array", items: { type: "string" } },
    missing_voices: { type: "array", items: { type: "string" } },
    proposed_followups: { type: "array", items: { type: "object", additionalProperties: false, required: ["specialist", "question", "why"], properties: { specialist: { type: "string" }, question: { type: "string" }, why: { type: "string" } } } },
  },
};

const S = (id, name, responsibility, system, sourceStrategy, extra = {}) => ({ id, name, responsibility, system, sourceStrategy, phase: extra.phase || "fanout", kind: extra.kind || "research", ...extra });

const BASE_RULES = `You are a specialist researcher inside LOCAL, a fandom intelligence system for basketball uniform design. Work from the retrieved sources only. Distinguish observed behavior, stated motivation and your interpretation. Prefer local specificity over generic city symbolism. Separate fan-originated evidence from team-published messaging, paid promotion and independent reporting. A platform community or hashtag is not proof members live locally. Never infer sensitive traits about individuals. Never invent population shares. If the sources are thin, return few or no findings and say so in coverage_note. Preserve minority views and disagreements. Map codes to the taxonomy IDs provided; use mot.unresolved for unknown motives.`;

function wikiTitles(team) {
  const t = [team.name];
  if (team.league_id === "nba" && team.id === "nba-chi") t.push("United Center", "Benny the Bull");
  t.push(`${team.arena}`);
  return t;
}
function officialUrls(team) {
  if (team.league_id === "nba") { const slug = team.nickname.toLowerCase().replace(/\s+/g, ""); return [`https://www.nba.com/${slug}/`, `https://www.nba.com/${slug}/community`, `https://www.nba.com/${slug}/schedule`]; }
  const slug = team.nickname.toLowerCase().replace(/\s+/g, "");
  return [`https://${slug}.wnba.com/`, `https://${slug}.wnba.com/community`, `https://www.wnba.com/schedule`];
}

export const SPECIALISTS = [
  S("taxonomy_steward", "First-principles and taxonomy steward", "Maintain definitions and coding consistency, distinguish theory from local evidence, surface uncategorized findings, propose reviewed taxonomy changes.",
    `${BASE_RULES} You are the taxonomy steward. Review the findings you are given for coding consistency: flag findings coded to a need category without behavioral or testimonial evidence, findings that conflate theory with local evidence, and uncategorized observations. Propose taxonomy changes only as reviewed proposals; never override contradictory local evidence to preserve consistency.`,
    () => [], { phase: "challenge", kind: "review" }),
  S("fan_motivation", "Fan motivation", "Investigate individual reasons for participating, variation within communities, competing explanations, and evidence-backed profiles.",
    `${BASE_RULES} Investigate what supporting this team gives individual fans that matters in their lives. Work backward from observable behavior to alternative explanations. Code proposed needs (connection, identity, continuity, recognition, agency, emotion) only with supporting testimony or behavior; otherwise code mot.unresolved and name the open question.`,
    (team, ws) => [...(ws.fan_sources || []), ...officialUrls(team).slice(0, 1)]),
  S("fandom_growth", "Fandom growth", "Investigate acquisition, repeat participation, retention, advocacy, barriers, disengagement, and reactivation against defined outcomes.",
    `${BASE_RULES} Investigate what attracts, converts, retains or loses fans in this market: relevance, access, welcome, reward, continuity, advocacy, disengagement, reactivation. Report plausible drivers, never demonstrated causes, unless measured cohort data is present. Distinguish what product could plausibly influence from access, performance, media, ticketing and community relationships.`,
    (team, ws) => [...(ws.media_sources || []), ...officialUrls(team).slice(1, 2)]),
  S("local_validation", "Local validation", "Design neutral research and sampling plans, process authorized interviews and surveys, and track how findings change hypotheses.",
    `${BASE_RULES} You design neutral, behavior-based validation research. Produce questions like "Tell us about the last time you wore a team jersey", never leading toward belonging or a preferred design story. Specify recruitment channels and limitations. Never simulate respondents.`,
    () => [], { phase: "synthesize", kind: "validation" }),
  S("local_history_place", "Local history and place", "Neighborhoods, venues, civic history, migration, landmarks, and their demonstrated connection to fandom; avoid generic city trivia.",
    `${BASE_RULES} Investigate neighborhoods, venues, civic history, migration and landmarks only where there is demonstrated connection to this team's fandom. Generic city trivia without fan meaning is not a finding.`,
    (team, ws) => [...wikiTitles(team).map((t) => ({ wiki: t })), ...(ws.history_sources || [])]),
  S("fan_communities", "Fan communities", "Supporter groups, season-ticket communities, casual and emerging audiences, watch parties, diaspora, underrepresented voices.",
    `${BASE_RULES} Identify distinct fan communities, where they gather, how they enter, and whose voices are missing from the sources. Report composition only with credible aggregate evidence or self-described group context.`,
    (team, ws) => [...(ws.fan_sources || []), ...(ws.community_sources || [])]),
  S("fan_language_rituals", "Fan language and rituals", "Chants, nicknames, humor, memes, gestures, superstitions, origin stories, repeated game-day practices.",
    `${BASE_RULES} Document chants, nicknames, humor, memes, gestures, superstitions and repeated practices with origin stories where sourced. Evidence of repetition across occasions is required to call something a ritual.`,
    (team, ws) => [...(ws.fan_sources || [])]),
  S("team_engagement", "Team engagement", "Official community programs, theme nights, partnerships, campaigns, outreach cadence, and evidence of fan response.",
    `${BASE_RULES} Catalog official community programs, theme nights, partnerships and campaigns. Label them team-published. Only report fan response where independent or fan-originated evidence exists.`,
    (team) => officialUrls(team)),
  S("independent_local_media", "Independent local media", "Beat reporting, newsletters, local radio, podcasts, community journalism, conflicting local perspectives.",
    `${BASE_RULES} Extract fan-relevant reporting from independent local media. Note syndication: a wire story reprinted is one source family.`,
    (team, ws) => [...(ws.media_sources || []), ...(ws.feeds || []).map((f) => ({ feed: f }))]),
  S("social_conversation", "Social conversation", "Available public fan discussion, emotional themes, recurring frustrations, changes over time, with explicit sample limitations.",
    `${BASE_RULES} Summarize public fan discussion only from the sources provided. State sample limitations explicitly. Negative attention is not positive affinity.`,
    (team, ws) => [...(ws.social_sources || [])], { requires: ["reddit", "youtube", "x", "listening"] }),
  S("season_moments", "Season and moments", "Games, rivalries, anniversaries, civic events, recurring rituals, playoffs, off-season moments.",
    `${BASE_RULES} Build the season rhythm: confirmed schedule events, historically recurring windows, predictions and contingent moments. For each, record trigger, community, proposed motivation, participation mechanism, observed response and subsequent behavior as a hypothesis structure.`,
    (team, ws) => [{ schedule: team.league_id }, ...(ws.event_sources || [])]),
  S("style_visual_culture", "Style and visual culture", "Fan-worn apparel, DIY merchandise, local creative scenes, typography, colors, patterns, and symbols grounded in evidence.",
    `${BASE_RULES} Document what fans actually wear and make, and local creative scenes with demonstrated fan connection. Visual codes need evidence of fan use, not designer preference.`,
    (team, ws) => [...(ws.style_sources || []), ...(ws.fan_sources || [])]),
  S("uniform_history_reception", "Uniform history and reception", "Previous editions, beloved and rejected details, repeated stories, reasons for reception, continuity expectations.",
    `${BASE_RULES} Document past uniform editions and their reception with reasons. Separate identity, execution, price and nostalgia explanations for any backlash.`,
    (team, ws) => [{ wiki: team.name }, ...(ws.uniform_sources || [])]),
  S("retail_collecting", "Retail and collecting", "Reviews, merchandise preferences, local retailers, collecting behavior, scarcity; listings vs transactions.",
    `${BASE_RULES} Report merchandise preferences and collecting behavior. Listings and asking prices are not transactions; say which you observed.`,
    (team, ws) => [...(ws.retail_sources || [])]),
  S("athlete_community", "Athlete–community relationships", "Evidence of players connecting to local fandom; durable team identity vs athlete-specific attention.",
    `${BASE_RULES} Document athlete–community connections with evidence. Distinguish durable team identity from athlete-specific attention that may leave with the player.`,
    (team, ws) => [...(ws.media_sources || []).slice(0, 2)]),
  S("community_stewardship", "Community meaning and stewardship", "Contested narratives, symbols requiring partnership, superficial appropriation, validation needs.",
    `${BASE_RULES} Identify symbols and narratives that require community partnership before product use, contested meanings, and appropriation risks. Do not stereotype communities; name validation needs.`,
    (team, ws) => [...(ws.community_sources || [])], { phase: "challenge" }),
  S("evidence_reviewer", "Evidence reviewer", "Unsupported claims, copied sources, national/local confusion, promotional bias, contradictions, weak measurement.",
    `${BASE_RULES} You are an independent reviewer. Test each claim for locality, representativeness, recency, causal overreach, promotional bias and uniform relevance. Downgrade labels where unsupported and record contradictions.`,
    () => [], { phase: "challenge", kind: "review" }),
  S("uniform_synthesizer", "Uniform opportunity synthesizer", "Convert supported insights into differentiated creative territories and research-led briefs.",
    `${BASE_RULES} Produce three to five differentiated uniform territories only where evidence supports them; do not force a quota. Each must pass a name-swap test and trace motivation → local context → community → expression → moment → proposed response. Design implications are proposals, not findings.`,
    () => [], { phase: "synthesize", kind: "synthesis" }),
];
export const byId = Object.fromEntries(SPECIALISTS.map((s) => [s.id, s]));

// Keyword routing for the planner: which specialists a question warrants.
const ROUTES = [
  [/chant|song|nickname|meme|ritual|superstition|gesture/i, ["fan_language_rituals", "fan_communities"]],
  [/backlash|reject|hate|complain|throwback|classic|retro|jersey|uniform|edition/i, ["uniform_history_reception", "style_visual_culture", "retail_collecting"]],
  [/grow|new fan|young|casual|lapsed|retention|attend|convert|reach/i, ["fandom_growth", "fan_communities", "team_engagement"]],
  [/neighborhood|place|arena|history|migration|landmark|west side|south side/i, ["local_history_place", "community_stewardship"]],
  [/player|athlete|star|rookie/i, ["athlete_community"]],
  [/season|playoff|rival|game day|schedule|moment|calendar/i, ["season_moments", "team_engagement"]],
  [/wear|style|fashion|outfit|streetwear|color|pattern|typograph/i, ["style_visual_culture", "retail_collecting"]],
  [/social|tiktok|instagram|reddit|twitter|online|discourse/i, ["social_conversation"]],
];
export function routeSpecialists(question, depth = "standard") {
  const core = ["fan_motivation", "fan_communities", "local_history_place", "season_moments"];
  const extra = new Set();
  for (const [re, ids] of ROUTES) if (re.test(question)) ids.forEach((i) => extra.add(i));
  const full = depth === "deep" ? ["team_engagement", "independent_local_media", "fan_language_rituals", "style_visual_culture", "uniform_history_reception", "athlete_community", "retail_collecting", "social_conversation"] : depth === "quick" ? [] : ["independent_local_media", "uniform_history_reception"];
  return [...new Set([...core, ...extra, ...full])];
}

// Resolve a specialist's source strategy into concrete retrievals.
async function gather(specialist, team, sourceMap, limits) {
  const targets = specialist.sourceStrategy(team, sourceMap).slice(0, limits.max_sources_per_task || 8);
  const retrieved = []; const limitations = []; const tools = new Set();
  for (const t of targets) {
    if (typeof t === "string") { tools.add("web"); const a = await fetchArticle(t); a.ok ? retrieved.push({ url: a.url, title: a.title, text: a.text, published_at: a.published_at, author: a.author, source_type: "web", origin: /nba\.com|wnba\.com/.test(a.url) ? "team" : "unknown", retrieved_at: a.retrievedAt }) : limitations.push({ target: t, limitation: a.limitation }); }
    else if (t.wiki) { tools.add("wikipedia"); const w = await fetchWikipediaSummary(t.wiki); w.ok ? retrieved.push({ url: w.url, title: w.title, text: w.extract, source_type: "reference", origin: "independent", publisher: "Wikipedia", retrieved_at: w.retrievedAt, access: { license: "CC BY-SA 4.0" } }) : limitations.push({ target: `wikipedia:${t.wiki}`, limitation: w.limitation }); }
    else if (t.feed) { tools.add("rss"); const f = await fetchFeed(t.feed); if (f.ok) for (const it of f.items.slice(0, 10)) retrieved.push({ url: it.link, title: it.title, text: it.summary, published_at: it.published, source_type: "feed", origin: "independent", retrieved_at: f.retrievedAt }); else limitations.push({ target: t.feed, limitation: f.limitation }); }
    else if (t.schedule === "nba") { tools.add("nba_schedule"); const s = await fetchNbaSchedule(team.tricode || null); s.ok ? retrieved.push({ url: "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", title: `NBA schedule ${s.season || ""}`, text: JSON.stringify(s.games.slice(0, 120)), source_type: "league", origin: "league", retrieved_at: s.retrievedAt, data: { games: s.games } }) : limitations.push({ target: "nba_schedule", limitation: s.limitation }); }
    else if (t.schedule === "wnba") { tools.add("wnba_schedule"); limitations.push({ target: "wnba_schedule", limitation: connectorState("wnba_schedule") === "limited" ? "structured_endpoint_unconfirmed" : connectorState("wnba_schedule") }); }
  }
  return { retrieved, limitations, tools: [...tools], targets: targets.length };
}

// Execute one research task end-to-end. Returns {output, tools_used, sources_found, unresolved, cost}.
export async function runResearchTask(task, ctx) {
  const specialist = byId[task.specialist];
  const { team, workspace, sourceMap, taxonomy, limits, signal } = ctx;
  const gathered = await gather(specialist, team, sourceMap, limits);
  // Persist sources first (idempotent by URL).
  const stored = [];
  for (const r of gathered.retrieved) {
    if (!r.url && !r.text) continue;
    const { source, created, is_duplicate } = upsertSource({ workspace_id: workspace.id, team_id: team.id, ...r, connector_id: r.source_type, data: r.data });
    stored.push({ source, created, is_duplicate, text: r.text, title: r.title });
  }
  const unresolved = [];
  if (gathered.limitations.length) unresolved.push(...gathered.limitations.map((l) => `Could not retrieve ${l.target}: ${l.limitation}`));
  if (!stored.length) {
    const state = gathered.targets === 0 ? "no_sources" : "blocked";
    const note = gathered.targets === 0 ? "No source strategy targets configured for this team (add feeds and local sources in the team source map, or upload research)." : "No sources were retrievable for this specialist. Findings withheld.";
    if (gathered.targets === 0) unresolved.push(`${specialist.id}: no configured sources for this team`);
    return { output: { coverage_note: note, findings: [], unresolved_questions: unresolved, missing_voices: [], limitations: gathered.limitations }, tools_used: gathered.tools, sources_found: 0, unresolved, cost: {}, state };
  }
  if (!llmStatus().configured) {
    return { output: { coverage_note: `${stored.length} source(s) retrieved and stored for human coding. Model provider not configured, so no agent findings were generated.`, findings: [], unresolved_questions: unresolved, missing_voices: [], limitations: gathered.limitations, sources: stored.map((s) => s.source.id) },
      tools_used: gathered.tools, sources_found: stored.length, unresolved, cost: {}, state: "credentials_required" };
  }
  const taxList = taxonomy.map((n) => `${n.id}: ${n.name} — ${n.definition}`).join("\n");
  const user = [
    `Team: ${team.name} (${team.league_id.toUpperCase()}), market ${team.market}. Research question: ${task.question}`,
    `Specialist responsibility: ${specialist.responsibility}`,
    `Taxonomy IDs you may use:\n${taxList}`,
    `Sources (index: title, url, origin, duplicate flag):`,
    ...stored.map((s, i) => `${i}: ${s.title || "(untitled)"} | ${s.source.url || s.source.locator} | origin=${s.source.origin} | duplicate_of_family=${s.is_duplicate}`),
    ...stored.map((s, i) => untrusted(`source ${i}`, s.text, Math.floor((limits.max_chars || 40000) / stored.length))),
  ].join("\n\n");
  const res = await structured({ system: specialist.system, user, schema: FINDINGS_SCHEMA, name: "emit_findings", signal });
  const out = res.output;
  // Persist evidence + claims with taxonomy codes.
  const claimIds = [];
  for (const f of out.findings) {
    const evidenceLinks = [];
    for (const e of f.evidence) {
      const s = stored[e.source_index]; if (!s) continue;
      const ev = addEvidence({ workspace_id: workspace.id, team_id: team.id, source_id: s.source.id, excerpt: e.excerpt, place: e.place, topic: f.headline, local_relevance_reason: e.local_relevance_reason,
        geo_relevance: e.geo_relevance, evidence_mode: e.evidence_mode, taxonomy_version: ctx.taxonomyVersion, alternatives: f.alternatives, run_id: task.run_id, task_id: task.id, codes: f.taxonomy_codes, coder: specialist.id,
        data: { event_date: e.event_date || null, specialist: specialist.id } });
      evidenceLinks.push({ evidence_id: ev.id, stance: e.stance, explanation: e.local_relevance_reason });
    }
    const claim = upsertClaim({ workspace_id: workspace.id, team_id: team.id, statement: f.statement, headline: f.headline, label: f.label, section: f.section || null, alternatives: f.alternatives, disconfirming: f.disconfirming,
      taxonomy_version: ctx.taxonomyVersion, run_id: task.run_id, evidence: evidenceLinks, codes: f.taxonomy_codes, coder: specialist.id,
      data: { specialist: specialist.id, community: f.community || null, behavior_vs_motive: f.behavior_vs_motive, uniform_relevance: f.uniform_relevance || null, model: res.model, prompt_version: res.prompt_version } });
    claimIds.push(claim.id);
  }
  return { output: { ...out, claim_ids: claimIds, limitations: gathered.limitations, sources: stored.map((s) => s.source.id) }, tools_used: [...gathered.tools, "anthropic"], sources_found: stored.length,
    unresolved: [...unresolved, ...out.unresolved_questions], cost: { usd: res.cost_usd, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }, state: "complete", followups: out.proposed_followups || [] };
}

// Challenge task: independent review of claims produced in this run.
export const REVIEW_SCHEMA = { type: "object", additionalProperties: false, required: ["reviews", "contradictions", "taxonomy_proposals"], properties: {
  reviews: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim_id", "verdict", "issues", "suggested_label"], properties: {
    claim_id: { type: "string" }, verdict: { type: "string", enum: ["supported", "downgrade", "unsupported", "needs_local_validation"] }, issues: { type: "array", items: { type: "string" } },
    suggested_label: { type: "string", enum: LABELS }, note: { type: "string" } } } },
  contradictions: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim_a", "claim_b", "description"], properties: { claim_a: { type: "string" }, claim_b: { type: "string" }, description: { type: "string" } } } },
  taxonomy_proposals: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "rationale", "payload"], properties: { kind: { type: "string", enum: ["add", "edit", "rename", "merge", "retire"] }, rationale: { type: "string" }, payload: { type: "object" } } } },
  followups: { type: "array", items: { type: "object", additionalProperties: false, required: ["specialist", "question", "why"], properties: { specialist: { type: "string" }, question: { type: "string" }, why: { type: "string" } } } },
} };

export async function runReviewTask(task, ctx) {
  const specialist = byId[task.specialist];
  const claims = rows(q("SELECT * FROM claims WHERE run_id=? ORDER BY created_at", [task.run_id]));
  if (!claims.length) return { output: { reviews: [], contradictions: [], taxonomy_proposals: [], note: "No claims to review in this run." }, tools_used: [], sources_found: 0, unresolved: [], cost: {}, state: "complete" };
  if (!llmStatus().configured) return { output: { reviews: [], contradictions: [], taxonomy_proposals: [], note: "Model provider not configured; review skipped." }, tools_used: [], sources_found: 0, unresolved: ["Independent review not performed (credentials required)"], cost: {}, state: "credentials_required" };
  const user = [`Team: ${ctx.team.name}. Review these claims (id | label | statement | alternatives | evidence summary):`,
    ...claims.map((c) => { const ev = rows(q("SELECT e.excerpt, e.geo_relevance, e.evidence_mode, s.origin, s.published_at, s.family_id FROM claim_evidence ce JOIN evidence e ON e.id=ce.evidence_id JOIN sources s ON s.id=e.source_id WHERE ce.claim_id=?", [c.id]));
      return `${c.id} | ${c.label} | ${c.statement} | alt: ${JSON.stringify(c.alternatives)} | evidence: ${JSON.stringify(ev).slice(0, 1500)}`; })].join("\n\n");
  const res = await structured({ system: specialist.system, user, schema: REVIEW_SCHEMA, name: "emit_review", signal: ctx.signal });
  for (const r of res.output.reviews) {
    const c = claims.find((x) => x.id === r.claim_id); if (!c) continue;
    const patch = { id: c.id, workspace_id: ctx.workspace.id, team_id: ctx.team.id, data: { review: { by: specialist.id, verdict: r.verdict, issues: r.issues, note: r.note || null, at: new Date().toISOString() } } };
    if (r.verdict === "downgrade" || r.verdict === "unsupported") patch.label = r.suggested_label === "observed" ? "interpretation" : r.suggested_label;
    upsertClaim(patch);
  }
  for (const p of res.output.taxonomy_proposals || []) insertEntity({ entity_type: "taxonomy_proposal_note", workspace_id: ctx.workspace.id, team_id: ctx.team.id, title: p.kind, status: "proposed", run_id: task.run_id, data: p });
  return { output: res.output, tools_used: ["anthropic"], sources_found: 0, unresolved: [], cost: { usd: res.cost_usd, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }, state: "complete", followups: res.output.followups || [] };
}

// Synthesis: fan profiles, growth hypotheses, moments, territories from reviewed claims.
export const SYNTH_SCHEMA = { type: "object", additionalProperties: false, required: ["dossier_summary", "what_changed", "uncertainty", "fan_profiles", "growth_hypotheses", "moments", "territories", "validation_plan"], properties: {
  dossier_summary: { type: "string" }, what_changed: { type: "string" }, uncertainty: { type: "string" },
  fan_profiles: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["title", "participation_pattern", "entry_routes", "relationships", "values_and_feelings", "barriers", "uniform_details", "competing_explanations", "open_questions", "claim_ids"], properties: {
    title: { type: "string" }, participation_pattern: { type: "string" }, entry_routes: { type: "array", items: { type: "string" } }, relationships: { type: "string" }, values_and_feelings: { type: "string" }, aesthetic: { type: "string" }, barriers: { type: "string" }, moments: { type: "string" }, uniform_details: { type: "string" }, competing_explanations: { type: "array", items: { type: "string" } }, open_questions: { type: "array", items: { type: "string" } }, claim_ids: { type: "array", items: { type: "string" } }, sample_note: { type: "string" } } } },
  growth_hypotheses: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["title", "target_community", "unmet_motivation_or_barrier", "mechanism", "stage", "outcome_metric", "alternative_explanations", "potential_action", "validation_plan", "claim_ids", "product_can_influence"], properties: {
    title: { type: "string" }, target_community: { type: "string" }, unmet_motivation_or_barrier: { type: "string" }, mechanism: { type: "string" }, stage: { type: "string" }, outcome_metric: { type: "string" }, alternative_explanations: { type: "array", items: { type: "string" } }, potential_action: { type: "string" }, validation_plan: { type: "string" }, claim_ids: { type: "array", items: { type: "string" } }, product_can_influence: { type: "string" } } } },
  moments: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["title", "lane", "date_kind", "recurrence", "trigger", "who", "why_local", "emotional_function", "participation_mode", "claim_ids"], properties: {
    title: { type: "string" }, lane: { type: "string", enum: ["schedule", "engagement", "fan_ritual", "attention", "opportunity", "gate"] }, date: { type: "string" }, date_kind: { type: "string", enum: ["confirmed", "recurring", "predicted", "contingent", "unknown"] }, recurrence: { type: "string" }, trigger: { type: "string" }, who: { type: "string" }, why_local: { type: "string" }, emotional_function: { type: "string" }, participation_mode: { type: "string" }, entry_barriers: { type: "string" }, repeat_engagement: { type: "string" }, product_relevance: { type: "string" }, claim_ids: { type: "array", items: { type: "string" } } } } },
  territories: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["title", "proposition", "human_truth", "community", "chain", "existing_fan_value", "new_fan_relevance", "tension", "why_this_team", "name_swap_test", "supporting_claim_ids", "conflicting_claim_ids", "durability", "design_implications", "preserve_avoid_validate", "next_question"], properties: {
    title: { type: "string" }, proposition: { type: "string" }, human_truth: { type: "string" }, community: { type: "string" }, chain: { type: "object", additionalProperties: false, required: ["motivation", "local_context", "community", "expression", "moment", "response"], properties: { motivation: { type: "string" }, local_context: { type: "string" }, community: { type: "string" }, expression: { type: "string" }, moment: { type: "string" }, response: { type: "string" } } },
    existing_fan_value: { type: "string" }, new_fan_relevance: { type: "string" }, tension: { type: "string" }, growth_contribution: { type: "string" }, why_this_team: { type: "string" }, name_swap_test: { type: "string" }, supporting_claim_ids: { type: "array", items: { type: "string" } }, conflicting_claim_ids: { type: "array", items: { type: "string" } }, moments: { type: "string" }, durability: { type: "string", enum: ["uniform", "activation", "unclear"] },
    design_implications: { type: "object", additionalProperties: false, properties: { color: { type: "string" }, typography: { type: "string" }, pattern: { type: "string" }, trim: { type: "string" }, placement: { type: "string" }, material: { type: "string" }, storytelling_hierarchy: { type: "string" } } }, existing_overlap: { type: "string" }, preserve_avoid_validate: { type: "string" }, next_question: { type: "string" } } } },
  validation_plan: { type: "object", additionalProperties: false, required: ["questions", "sampling", "limitations"], properties: { questions: { type: "array", items: { type: "string" } }, sampling: { type: "string" }, limitations: { type: "string" } } },
} };

export async function runSynthesisTask(task, ctx) {
  const specialist = byId[task.specialist];
  const claims = rows(q("SELECT * FROM claims WHERE workspace_id=? AND team_id=? AND review_state != 'archived' ORDER BY created_at DESC LIMIT 80", [ctx.workspace.id, ctx.team.id]));
  if (!claims.length) return { output: { note: "No claims available to synthesize; run produced source map and gaps only." }, tools_used: [], sources_found: 0, unresolved: ["No coded evidence yet"], cost: {}, state: "complete" };
  if (!llmStatus().configured) return { output: { note: "Model provider not configured; synthesis skipped. Claims remain available for human synthesis." }, tools_used: [], sources_found: 0, unresolved: ["Synthesis not performed (credentials required)"], cost: {}, state: "credentials_required" };
  const user = [`Team: ${ctx.team.name} (${ctx.team.league_id.toUpperCase()}), ${ctx.team.market}. Question: ${task.question}.`,
    `Reviewed claims (id | label | confidence | statement | alternatives | community):`,
    ...claims.map((c) => `${c.id} | ${c.label} | ${c.confidence} | ${c.statement} | ${c.alternatives} | ${JSON.parse(c.data).community || ""}`),
    `Existing profiles: ${JSON.stringify(listEntities(ctx.workspace.id, "fan_profile", { team_id: ctx.team.id }).map((p) => p.title))}`,
    `Season context: ${JSON.stringify(ctx.seasons || [])}`].join("\n\n");
  const res = await structured({ system: specialist.system, user, schema: SYNTH_SCHEMA, name: "emit_synthesis", maxTokens: 8000, signal: ctx.signal });
  const o = res.output;
  const mk = (type, title, data, extra = {}) => insertEntity({ entity_type: type, workspace_id: ctx.workspace.id, team_id: ctx.team.id, title, status: "draft", run_id: task.run_id, taxonomy_version: ctx.taxonomyVersion, data: { ...data, model: res.model, prompt_version: res.prompt_version }, ...extra });
  for (const p of o.fan_profiles) mk("fan_profile", p.title, p);
  for (const g of o.growth_hypotheses) mk("growth_hypothesis", g.title, g);
  for (const m of o.moments) mk("moment", m.title, m, { starts_at: m.date || null });
  for (const t of o.territories) mk("opportunity", t.title, t);
  mk("dossier_version", `Dossier ${new Date().toISOString().slice(0, 10)}`, { summary: o.dossier_summary, what_changed: o.what_changed, uncertainty: o.uncertainty, validation_plan: o.validation_plan });
  mk("validation_study", `Validation plan from run`, { questions: o.validation_plan.questions, sampling: o.validation_plan.sampling, limitations: o.validation_plan.limitations, kind: "discussion_guide", human_collection_required: true });
  return { output: o, tools_used: ["anthropic"], sources_found: 0, unresolved: [], cost: { usd: res.cost_usd, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }, state: "complete" };
}
