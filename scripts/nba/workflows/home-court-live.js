export const meta = {
  name: 'nba-live-atlantic',
  description: 'Live re-research of the Atlantic Division (BOS, BKN, NYK, PHI, TOR): Haiku lens researchers, then strategist, critics, editor and planner',
  phases: [
    { title: 'Research', detail: '11 Haiku lens agents per market, live web search, dated 2026-10-10', model: 'haiku' },
    { title: 'Synthesize', detail: 'Market Strategist writes the brief' },
    { title: 'Verify', detail: 'Fact-check (live) + authenticity critics' },
    { title: 'Edit', detail: 'Brief Editor resolves both critiques' },
    { title: 'Plan', detail: 'Timing and hand-off for the new brief (plan.json)' },
  ],
}

// Live refresh of whole markets: Haiku lens researchers with a capped search
// budget, then strategist, critics, editor and planner. Run with Claude Code's
// Workflow tool, e.g.
//   Workflow({ scriptPath: 'scripts/nba/workflows/home-court-live.js',
//              args: { today: '2026-10-10', teams: ['nyk', 'phi', 'tor'] } })
// The session's web search allowance is shared by every agent: when it runs
// out, researchers keep knowledge-mode provenance. Check each dossier's
// provenance.mode before publishing, and restore markets that got no searches.
const TODAY = (args && args.today) || '2026-10-10'
const TEAMS = (args && args.teams) || ['bos', 'bkn', 'nyk', 'phi', 'tor']
const LENSES = ['music', 'art', 'food', 'culture', 'underground', 'hoops', 'fanbase', 'rhythm', 'uniform', 'retail-landscape', 'retail-behavior']

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if your output file(s) validate OK' },
    searches: { type: 'integer', description: 'WebSearch calls you made' },
    summary: { type: 'string', description: '1-2 sentences: the most important findings or changes' },
    problems: { type: 'string', description: 'Anything you could not verify or finish; empty if none' },
  },
  required: ['ok', 'searches', 'summary', 'problems'],
}

function researchPrompt(agentId, team, budget) {
  return `You are one agent in NBA Fandom's multi-agent research workflow. Repository: /home/user/Scout (run commands from there).

STEP 1 - get your brief: run \`cd /home/user/Scout && node scripts/nba/brief.mjs ${agentId} ${team} --today ${TODAY}\`. It prints your complete brief: the market, the quality bar, your mission, the output file, the schema command and the validator. Follow it exactly. The CURRENT FACTS at the end are verified and authoritative.

THIS IS A LIVE REFRESH dated ${TODAY}. The file you will write already exists from an earlier desk-research edition written from model knowledge. Read it first, then rewrite it from live research: keep what you can confirm, correct what has changed, drop what you can't support, and add what's new. Set provenance for live research (not knowledge mode), with real source URLs from your searches.

TOOLS: load WebSearch with ToolSearch (query "select:WebSearch,WebFetch") if it isn't loaded. Opening pages directly (WebFetch) is usually blocked by the network proxy; verify through search results instead and don't retry blocked fetches.

SEARCH BUDGET: about ${budget} searches, never more than ${budget + 5}. Run independent searches in parallel batches. Spend them on the specific places, businesses, people, events and dates you name, especially anything that could have changed in 2026. Don't spend searches re-confirming well-established history. If the budget runs out, keep only items you could support and list the rest in provenance.verify.

ISOLATION: other agents are writing sibling files in research/nba/${team}/ at the same time. Only write the file(s) your brief names. Do not commit.

FINISH: when the validator prints OK, return ok=true, the number of searches, and a 1-2 sentence summary of your sharpest findings. If you could not finish, return ok=false and say why in problems.`
}

function synthesisPrompt(agentId, team) {
  const search = agentId === 'factcheck'
    ? `\n\nSEARCH BUDGET: about 15 searches, never more than 20, on the riskiest claims (stores, partners, dates, people, anything a planner would act on). Load WebSearch with ToolSearch if needed; WebFetch is usually blocked, so verify through search results.`
    : `\n\nNo web searches: work from the dossiers in research/nba/${team}/ (refreshed live on ${TODAY}) and the CURRENT FACTS in your brief.`
  return `You are one agent in NBA Fandom's multi-agent research workflow. Repository: /home/user/Scout (run commands from there).

STEP 1 - get your brief: run \`cd /home/user/Scout && node scripts/nba/brief.mjs ${agentId} ${team} --today ${TODAY}\` and follow it exactly.

THIS IS A LIVE REFRESH dated ${TODAY}: the eleven dossiers were just re-researched on the live web. Where your output file already exists from an earlier desk-research edition, rewrite it from the refreshed dossiers rather than patching the old text. Write in the house voice described in research/nba/STYLE.md (plain, specific, short sentences).${search}

Only write the file(s) your brief names. Do not commit.

FINISH: when the validator prints OK, return ok=true with a 1-2 sentence summary. If you could not finish, return ok=false and say why in problems.`
}

function planPrompt(team) {
  return `You are the Planner in NBA Fandom's research workflow. Repository: /home/user/Scout (run commands from there).

The brief research/nba/${team}/strategy.json was just rewritten from live research dated ${TODAY}. The old review files annotate the previous brief and no longer line up with it.

STEP 1: delete research/nba/${team}/evidence.json and research/nba/${team}/plan.json if they exist (rm -f). Do not touch any other file except the plan.json you write.

STEP 2: open scripts/nba/workflows/home-court-review.js, find the function planPrompt, and follow its instructions for team "${team}" with TODAY = ${TODAY}. Differences: there is no evidence.json for this market now, so never use basis "checked-live"; a date can be confirmed only from research/nba/league-calendar.json (status "confirmed") or a fixed holiday. No web searches.

STEP 3: run \`node scripts/nba/validate.mjs ${team}\` until every file for the team prints OK. Do not commit.

FINISH: return ok=true when everything validates, with a 1-2 sentence summary (how many dates are confirmed, tentative, unknown). Otherwise ok=false with problems.`
}

const TIER = {
  lens: { model: 'haiku', effort: 'medium' },
  strategist: { effort: 'high' },
  factcheck: { effort: 'medium' },
  authenticity: { model: 'sonnet', effort: 'medium' },
  editor: { effort: 'medium' },
  plan: { model: 'sonnet', effort: 'medium' },
}

async function run(label, prompt, phase, tier) {
  let r = await agent(prompt, { label, phase, schema: RESULT, ...tier })
  if (!r || !r.ok) {
    log(`${label} did not validate, retrying once`)
    r = await agent(prompt + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. Its work may be on disk: repair the file rather than starting over, and don't repeat searches it already made.`, { label: `${label}:retry`, phase, schema: RESULT, ...tier })
  }
  return { label, ok: !!(r && r.ok), searches: r ? r.searches || 0 : 0, summary: r ? r.summary : '', problems: r ? r.problems : 'agent returned null' }
}

// One market at a time, end to end, so a usage limit leaves finished markets.
async function market(team) {
  const lenses = await parallel(LENSES.map((l) => () => run(`${team}:${l}`, researchPrompt(l, team, 12), 'Research', TIER.lens)))
  const lensOk = lenses.filter((x) => x && x.ok).length
  log(`${team}: ${lensOk}/${LENSES.length} dossiers refreshed live, ${lenses.reduce((s, x) => s + (x ? x.searches : 0), 0)} searches`)
  const strategist = await run(`${team}:strategist`, synthesisPrompt('strategist', team), 'Synthesize', TIER.strategist)
  if (!strategist.ok) { log(`${team}: brief did not validate, skipping the rest of this market`); return { team, lenses, strategist } }
  const [factcheck, authenticity] = await parallel([
    () => run(`${team}:factcheck`, synthesisPrompt('factcheck', team), 'Verify', TIER.factcheck),
    () => run(`${team}:authenticity`, synthesisPrompt('authenticity', team), 'Verify', TIER.authenticity),
  ])
  const editor = await run(`${team}:editor`, synthesisPrompt('editor', team), 'Edit', TIER.editor)
  const plan = await run(`${team}:plan`, planPrompt(team), 'Plan', TIER.plan)
  log(`${team}: brief ${editor.ok ? 'edited' : 'NOT edited'}, plan ${plan.ok ? 'written' : 'NOT written'}`)
  return { team, lenses, strategist, factcheck, authenticity, editor, plan }
}

const results = []
for (const team of TEAMS) results.push(await market(team))

return results.map((r) => ({
  team: r.team,
  lensesOk: r.lenses.filter((x) => x && x.ok).length,
  searches: [...r.lenses, r.factcheck].filter(Boolean).reduce((s, x) => s + (x.searches || 0), 0),
  lensFailures: r.lenses.filter((x) => !x || !x.ok).map((x) => (x ? `${x.label}: ${x.problems}` : 'null')),
  strategist: r.strategist && r.strategist.ok,
  factcheck: r.factcheck ? `${r.factcheck.ok ? 'ok' : 'FAILED'}: ${r.factcheck.summary}` : 'skipped',
  authenticity: r.authenticity ? `${r.authenticity.ok ? 'ok' : 'FAILED'}: ${r.authenticity.summary}` : 'skipped',
  editor: r.editor ? `${r.editor.ok ? 'ok' : 'FAILED'}: ${r.editor.summary}` : 'skipped',
  plan: r.plan ? `${r.plan.ok ? 'ok' : 'FAILED'}: ${r.plan.summary}` : 'skipped',
}))
