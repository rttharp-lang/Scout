// Runs ONE Home Court agent live via the Claude API, so the site can refresh a
// market's intelligence on demand. The browser orchestrates the full workflow
// (eleven lens agents in parallel → strategist → two critics → editor) by
// calling this endpoint once per agent stage; each call fits the project's 60s
// function ceiling. Agents are the same roster the offline research used
// (src/nba/agents), so live runs ask the same questions as the published data.
//
//   POST /api/homecourt-agent
//   { agent, team, stage: "research" | "compose", notes?, inputs? }
//
// stage "research": web search on, returns { notes } — verified facts + URLs.
// stage "compose":  no tools, structured output against the agent's schema,
//                   returns { data, warnings } (warnings = the same checks the
//                   build runs, from src/nba/agents/validate-core.js). Send
//                   { previous, problems } to have the agent repair its output.
// agent "planner" (compose only) writes the plan: timing and hand-off for the
// brief in inputs.strategy, with inputs.leagueCalendar.
// Anthropic key stays server-side (ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_BY_ID, LENS_IDS } from "../src/nba/agents/roster.js";
import { buildBrief, planBrief, apiSchemaFor, outputNameFor } from "../src/nba/agents/prompts.js";
import { validateData } from "../src/nba/agents/validate-core.js";
import { TEAM_BY_ID } from "../src/nba/teams.js";

export const config = { maxDuration: 60 };

const MODEL = "claude-opus-5-5";
// Agents that research the live web before composing.
const RESEARCHERS = new Set([...LENS_IDS, "factcheck"]);
const MAX_INPUT_CHARS = 400000;

// Structured outputs accept a subset of JSON Schema; drop the numeric, length,
// array-size and pattern constraints (re-checked against the full schema after).
const UNSUPPORTED = new Set(["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern"]);
function apiSchema(node) {
  if (Array.isArray(node)) return node.map(apiSchema);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) if (!UNSUPPORTED.has(k)) out[k] = k === "enum" ? v : apiSchema(v);
  return out;
}

const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

// One request, resuming server-tool pauses (web search can pause long turns).
async function complete(client, params) {
  let messages = params.messages;
  for (let i = 0; i < 3; i++) {
    const msg = await client.beta.messages.stream({
      ...params,
      messages,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    }).finalMessage();
    if (msg.stop_reason !== "pause_turn") return msg;
    messages = [...params.messages, { role: "assistant", content: msg.content }];
  }
  throw new Error("paused-too-long");
}

function inputsBlock(inputs) {
  if (!inputs || typeof inputs !== "object") return "";
  const json = JSON.stringify(inputs);
  if (json.length > MAX_INPUT_CHARS) throw new Error("inputs-too-large");
  return `\n\nINPUTS (JSON):\n${json}`;
}

// A repair pass: the agent's previous output and the checks it failed.
function repairBlock(body) {
  if (!body.previous || !Array.isArray(body.problems) || !body.problems.length) return "";
  const prev = JSON.stringify(body.previous);
  if (prev.length > MAX_INPUT_CHARS) throw new Error("inputs-too-large");
  return `\n\nREPAIR: your previous output failed these checks. Return the full corrected JSON, changing only what the checks require:\n- ${body.problems.slice(0, 20).map(String).join("\n- ")}\n\nPREVIOUS OUTPUT:\n${prev}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "post-only" }); return; }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { agent: agentId, team: teamId, stage, notes } = body;
  const agent = agentId === "planner" ? { id: "planner" } : AGENT_BY_ID[agentId];
  const team = TEAM_BY_ID[teamId];
  if (!agent || !team) { res.status(400).json({ error: "bad-agent-or-team" }); return; }
  if (stage !== "research" && stage !== "compose") { res.status(400).json({ error: "bad-stage" }); return; }
  if (stage === "research" && !RESEARCHERS.has(agentId)) { res.status(400).json({ error: "agent-does-not-research" }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: "ai-not-configured" }); return; }

  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const system = agentId === "planner" ? planBrief(team, today) : buildBrief(agentId, team, { mode: "api", today });

  try {
    if (stage === "research") {
      const msg = await complete(client, {
        model: MODEL,
        max_tokens: 16000,
        system,
        output_config: { effort: "low" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: agentId === "factcheck" ? 6 : 4 }],
        messages: [{ role: "user", content: `RESEARCH PHASE. Use web search to gather and verify what your brief asks for in ${team.city}. Return concise research notes — the specific facts, names, places, dates and design cues you would put in your output, each with the source URL. No JSON yet.${inputsBlock(body.inputs)}` }],
      });
      if (msg.stop_reason === "refusal") { res.status(422).json({ error: "refused" }); return; }
      res.status(200).json({ notes: textOf(msg.content) });
      return;
    }

    const schema = apiSchemaFor(agentId);
    const msg = await complete(client, {
      model: MODEL,
      max_tokens: 16000,
      system,
      output_config: { effort: "low", format: { type: "json_schema", schema: apiSchema(schema) } },
      messages: [{ role: "user", content: `COMPOSE PHASE. Produce your output for ${team.city} (team id "${team.id}"${LENS_IDS.includes(agentId) ? `, lens "${agentId}"` : ""}). This is a live run: if you include provenance, set mode "live" and asOf "Live web, ${today}", and list in verify only claims your research could not confirm.${notes ? `\n\nYOUR RESEARCH NOTES:\n${String(notes).slice(0, 60000)}` : ""}${inputsBlock(body.inputs)}${repairBlock(body)}` }],
    });
    if (msg.stop_reason === "refusal") { res.status(422).json({ error: "refused" }); return; }
    if (msg.stop_reason === "max_tokens") { res.status(502).json({ error: "truncated" }); return; }
    const data = JSON.parse(textOf(msg.content));
    const ctx = agentId === "planner" ? { strategy: body.inputs && body.inputs.strategy } : {};
    res.status(200).json({ data, warnings: validateData(team.id, outputNameFor(agentId), data, ctx).slice(0, 20) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) { res.status(429).json({ error: "rate-limited" }); return; }
    if (e instanceof Anthropic.APIError) { res.status(502).json({ error: "agent-request-failed", status: e.status, detail: e.message }); return; }
    res.status(500).json({ error: "agent-failed", detail: String(e && e.message ? e.message : e) });
  }
}
