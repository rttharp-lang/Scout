// Builds each agent's brief from the roster. Two modes share the same mission
// text so offline research and live runs ask the same questions:
//   mode "workflow" → a Claude Code agent with web search + file tools that
//                     writes research/nba/<team>/<agent>.json and validates it
//   mode "api"      → a Claude API call with the web_search server tool that
//                     returns the same JSON via structured outputs
import { STANDARDS, KNOWLEDGE_MODE, SEASON, AGENT_BY_ID, LENS_AGENTS, LENS_IDS, schemaFor } from "./roster.js";

const teamLine = (t) => `${t.city} ${t.name} (${t.abbr}) — ${t.conference}ern Conference, ${t.division} Division. Home arena: ${t.arena}.`;

// Knowledge mode drops the live-web CURRENT and SOURCES rules for KNOWLEDGE_MODE.
const standardsFor = (knowledge) => (knowledge
  ? `${STANDARDS.split("\n").filter((l) => !/^- (CURRENT|SOURCES):/.test(l)).join("\n")}\n\n${KNOWLEDGE_MODE}`
  : STANDARDS);

function header(agent, team, today, knowledge) {
  return `You are the ${agent.name} agent on Home Court, Nike Basketball's local-fandom intelligence system.

MARKET: ${teamLine(team)}
MARKET FOCUS: ${team.focus}
TODAY: ${today}. The ${SEASON} NBA season tips off in late October 2026; the 2027 playoffs run April–June 2027.

${standardsFor(knowledge)}`;
}

const dossierPath = (teamId, name) => `research/nba/${teamId}/${name}.json`;

// ── Lens agents ───────────────────────────────────────────────────
function lensTask(agent, team, knowledge) {
  const extraNotes = {
    rhythm: `The "extra.months" array must have exactly 12 entries in order (1 = January … 12 = December). Score intensity relative to THIS fan base's own year (100 = its peak month). "extra.keyDates" holds verifiable 2026-27 dates (home opener, rivalry and national-TV games, NBA Cup, Christmas, heritage nights, City Edition debut, All-Star, trade deadline, playoffs, draft) plus the local moments that matter.`,
    fanbase: `"extra" carries segments, traditions, icons, rivalries, the current sentiment and the gameday look.`,
    uniform: `"extra.palette" is the official team palette with exact hex codes. "extra.cityEditions" lists every City Edition you can verify (concept + how fans received it), most recent first.`,
    "retail-landscape": `"extra.districts" and "extra.doors" must be real and currently operating — verify each door. Include the arena team store and any Nike-owned doors in the market.`,
    "retail-behavior": `"extra.calendar" is the retail calendar for this market (month 1-12). Note state/provincial sales tax and any tax-free weekends precisely.`,
  };
  return `YOUR LENS: ${agent.name}
MISSION: ${agent.mission}

ANSWER THESE:
${agent.questions.map((q) => `- ${q}`).join("\n")}

OUTPUT FIELDS (team = "${team.id}", lens = "${agent.id}"):
- headline, summary — the essence of this lens for this market.
- insights (4-7) — each with a market-specific detail and its implication for Nike Basketball.
- places, people, moments, vocabulary — real and current; moments carry a month (0 if year-round).
- designCues (3-8) — concrete enough to brief a designer; colors carry hex.
- productHooks (2-6), watchouts, ${knowledge ? "sources (canonical reference pages to verify against), confidence, provenance (mode \"knowledge\" + the verify list)" : "sources (URLs you used), confidence"}.${extraNotes[agent.id] ? `\n- ${extraNotes[agent.id]}` : ""}`;
}

// ── Synthesis agents ──────────────────────────────────────────────
const DOSSIER_LIST = (teamId) => LENS_IDS.map((id) => dossierPath(teamId, id)).join(", ");

function synthesisTask(agent, team, knowledge) {
  if (knowledge && agent.id === "factcheck") {
    return `YOUR JOB: Fact-Check Critic, knowledge mode. You cannot browse, so audit instead of verifying. Be adversarial — assume some claims are wrong.
- Remove or correct what you are confident is wrong: businesses or venues you know closed or moved, departed players or coaches, renamed arenas, wrong dates, wrong City Edition history, anything that contradicts another dossier.
- Flag likely hallucinations: oddly specific details (exact addresses, dates, quotes, statistics, small businesses) with no well-known basis. Soften or remove them.
- Build the market's verification queue: log the 15-25 highest-risk remaining claims across the dossiers and the brief as verdicts with verdict "unverifiable" and a note saying what a live check must confirm. Use "corrected" or "removed" for what you changed and "confirmed" only for long-established facts.
- Brief problems go in as verdicts with lens "strategy" so the editor fixes them.`;
  }
  switch (agent.id) {
    case "strategist":
      return `YOUR JOB: Market Strategist. Synthesize the eleven lens dossiers into the Nike Basketball brief for ${team.city}.

Rules:
- topInsights (5-7): cross-lens synthesis, not a summary of one dossier. Each lists the lens ids that support it. Each must pass the swap test.
- opportunities (5-8): each answers WHERE (neighborhoods, doors, venues, channels), WHEN (window + months 1-12), HOW (mechanics, partners, storytelling) and WHICH PRODUCTS. Priority 1 = do first.
- collection: 2-4 themes grounded in the dossiers' design cues, each with a palette (hex), materials and 2-6 pieces (category + tier).
- uniform: a City Edition brief. It must NOT repeat a recent City Edition concept (check the uniform dossier), must tell a story locals will feel, and must respect the communities it draws from. Say what to avoid.
- calendar (8-14): an activation calendar across the year, synced to the fan rhythm and the retail calendar; each entry names products and a channel.
- partners (3-8): only local creatives, brands, venues and institutions named in the dossiers.
- scorecard: calibrate to the whole league — 50 is an average NBA market on each axis.
- Do not introduce new factual claims that aren't in the dossiers unless you verify them with web search.`;
    case "factcheck":
      return `YOUR JOB: Fact-Check Critic. Be adversarial — assume some claims are wrong.
Pick the 20-30 highest-risk factual claims across the dossiers and the brief: specific venues, stores and restaurants that may have closed or moved; event dates and timing; 2026-27 roster, coach, ownership and arena facts; City Edition history and reception; Nike door names and locations; player hometowns; anything suspiciously convenient. Verify each with web search.`;
    case "authenticity":
      return `YOUR JOB: Authenticity & Specificity Critic. Attack the brief (strategy) using the dossiers as evidence:
- GENERIC: run the swap test on every insight, opportunity, theme and the uniform concept.
- STEREOTYPE / APPROPRIATION: caricature, sacred or ceremonial imagery, community cues used without a partnership and credit plan.
- WEAK LINK: products or activations not grounded in an insight.
- TIMING: activation windows that conflict with the fan rhythm or retail calendar.
- MISSED OPPORTUNITY: strong signals in the dossiers the brief ignored (a segment, a scene, a moment, a door).
- FEASIBILITY: things Nike can't realistically do (licensing, NBA uniform rules, unrealistic lead times).
Rate severity honestly; say what's strong too.`;
    case "editor":
      return `YOUR JOB: Brief Editor. Revise the brief so every high- and medium-severity critique issue is resolved and nothing depends on a claim the fact-check corrected or removed. Keep what is strong; sharpen, don't pad.`;
    default:
      return "";
  }
}

// Workflow-mode I/O contract per agent.
function workflowIO(agent, team, knowledge) {
  const out = (name) => dossierPath(team.id, name);
  const validate = (name) => `node scripts/nba/validate.mjs ${team.id} ${name}`;
  const schemaCmd = (name) => `node scripts/nba/brief.mjs --schema ${name}`;
  const research = knowledge
    ? `Knowledge mode: do not use WebSearch or WebFetch. Every file you write carries "provenance" (mode "knowledge").`
    : `Use the WebSearch tool (mode "standard"; "extended" only for hard-to-find or very recent facts) and WebFetch to research and verify.`;
  const common = `${research} Write valid JSON only — no comments, no trailing commas. Run the validator and fix every error until it prints OK.`;
  if (LENS_IDS.includes(agent.id)) {
    return `${common}

OUTPUT: write your dossier to ${out(agent.id)}${knowledge ? `
KEEP LIVE WORK: if ${out(agent.id)} already exists, validates, and has no "provenance" field or provenance.mode "live", it was verified on the live web — keep it exactly as is and finish.` : ""}
SCHEMA: run \`${schemaCmd(agent.id)}\` to print the exact JSON Schema.
VALIDATE: \`${validate(agent.id)}\``;
  }
  switch (agent.id) {
    case "strategist":
      return `${common}

INPUTS: read every dossier: ${DOSSIER_LIST(team.id)}
OUTPUT: write the brief to ${out("strategy")} (team = "${team.id}")
SCHEMA: \`${schemaCmd("strategy")}\`
VALIDATE: \`${validate("strategy")}\``;
    case "factcheck":
      return `${common}

INPUTS: every dossier (${DOSSIER_LIST(team.id)}) and the brief ${out("strategy")}.
FIX IN PLACE: when a dossier claim fails, edit that dossier file directly — correct it when you can source the right fact, otherwise remove the item (respect each array's minimum; replace rather than leave it short). Re-run its validator after every edit. Do NOT edit ${out("strategy")} — log brief problems as verdicts with lens "strategy" so the editor fixes them.
OUTPUT: write your log to ${out("factcheck")}
SCHEMA: \`${schemaCmd("factcheck")}\`
VALIDATE: \`${validate("factcheck")}\` and each dossier you edited.`;
    case "authenticity":
      return `${common}

INPUTS: the brief ${out("strategy")} and the dossiers (${DOSSIER_LIST(team.id)}). Do not edit them.
OUTPUT: write your critique to ${out("critique")}
SCHEMA: \`${schemaCmd("critique")}\`
VALIDATE: \`${validate("critique")}\``;
    case "editor":
      return `${common}

INPUTS: ${out("strategy")}, ${out("critique")}, ${out("factcheck")} and the (fact-checked) dossiers.
OUTPUT: rewrite ${out("strategy")} in place with the revised brief.
VALIDATE: \`${validate("strategy")}\``;
    default:
      return "";
  }
}

export function buildBrief(agentId, team, { mode = "workflow", today, knowledge = false } = {}) {
  const agent = AGENT_BY_ID[agentId];
  if (!agent) throw new Error(`unknown agent: ${agentId}`);
  const day = today || new Date().toISOString().slice(0, 10);
  const task = LENS_IDS.includes(agentId) ? lensTask(agent, team, knowledge) : synthesisTask(agent, team, knowledge);
  const io = mode === "workflow"
    ? workflowIO(agent, team, knowledge)
    : `When web search is available, use it to verify anything that could have changed. When asked for output, return only the JSON object described by the output schema.`;
  const prov = knowledge && ["strategist", "editor"].includes(agentId)
    ? `\n\nPROVENANCE: the brief carries provenance (mode "knowledge") whose verify list holds the claims the brief depends on that a live check must confirm before Nike acts on them.`
    : "";
  return `${header(agent, team, day, knowledge)}\n\n${task}${prov}\n\n${io}\n`;
}

// API mode: which schema an agent returns.
export function apiSchemaFor(agentId) {
  if (LENS_IDS.includes(agentId)) return schemaFor(agentId);
  if (agentId === "strategist" || agentId === "editor") return schemaFor("strategy");
  if (agentId === "factcheck") return schemaFor("factcheck");
  if (agentId === "authenticity") return schemaFor("critique");
  return null;
}

export { LENS_AGENTS };
