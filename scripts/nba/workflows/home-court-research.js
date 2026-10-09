export const meta = {
  name: 'home-court-research',
  description: 'Research NBA markets: 11 lens agents per market, Nike Basketball strategist, fact-check + authenticity critics, editor',
  whenToUse: 'Build or refresh Home Court market dossiers under research/nba/<team>/',
  phases: [
    { title: 'Research', detail: '11 lens agents per market (music, art, food, culture, underground, hoops, fanbase, rhythm, uniform, retail x2)' },
    { title: 'Synthesize', detail: 'Market Strategist writes the Nike Basketball brief' },
    { title: 'Verify', detail: 'Fact-check critic (edits dossiers) + authenticity critic (critiques brief)' },
    { title: 'Edit', detail: 'Brief Editor resolves both critiques' },
  ],
}

// Home Court research workflow: run with Claude Code's Workflow tool, e.g.
//   Workflow({ scriptPath: 'scripts/nba/workflows/home-court-research.js',
//              args: { today: '2026-10-09', teams: ['por', { id: 'den', from: 'synthesize' }], knowledge: false } })

const TODAY = args.today
const TEAMS = args.teams
// Knowledge mode: live web research unavailable (search budget spent) — agents
// write from model knowledge and queue time-sensitive claims for verification.
const KNOWLEDGE = !!args.knowledge
const LENSES = ['music', 'art', 'food', 'culture', 'underground', 'hoops', 'fanbase', 'rhythm', 'uniform', 'retail-landscape', 'retail-behavior']

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if your output file(s) validate OK' },
    summary: { type: 'string', description: '1-2 sentences: the most important findings' },
    problems: { type: 'string', description: 'Anything you could not verify or finish; empty if none' },
  },
  required: ['ok', 'summary', 'problems'],
}

function prompt(agentId, team) {
  if (KNOWLEDGE) {
    return `You are one agent in Home Court's multi-agent research workflow. Repository: /home/user/Scout (run commands from there).

STEP 1 — get your brief: run \`cd /home/user/Scout && node scripts/nba/brief.mjs ${agentId} ${team} --today ${TODAY} --knowledge\`. It prints your complete brief: the market, the quality bar, KNOWLEDGE research mode, your mission, the output file, the schema command and the validator. Follow it exactly.

NO WEB: the session's web search budget is reserved, and most sites are blocked, so do not call WebSearch or WebFetch${agentId === 'factcheck' ? ' — except the at-most-3 live spot-checks your brief allows' : ' at all'}. Write from your own knowledge exactly as the knowledge-mode rules say, use the CURRENT FACTS section at the end of your brief (verified live today) as authoritative, queue every other time-sensitive claim in provenance.verify, and set confidence honestly.

ISOLATION: other agents are writing sibling files in research/nba/${team}/ at the same time. Only write the file(s) your brief names.

FINISH: when the validator prints OK, return ok=true with a 1-2 sentence summary of your sharpest findings. If you could not finish, return ok=false and say why in problems.`
  }
  return `You are one agent in Home Court's multi-agent research workflow. Repository: /home/user/Scout (run commands from there).

STEP 1 — get your brief: run \`cd /home/user/Scout && node scripts/nba/brief.mjs ${agentId} ${team} --today ${TODAY}\`. It prints your complete brief: the market, the quality bar, your mission, the output file, the schema command and the validator. Follow it exactly.

TOOLS: if WebSearch / WebFetch are not loaded yet, load them with ToolSearch (query "select:WebSearch,WebFetch"). Research and verify on the live web — do not rely on memory for anything that could have changed by ${TODAY}. Some sites are blocked by the network proxy; when a fetch is blocked, verify through search results or another source instead of retrying.

EFFICIENCY: issue independent searches in parallel batches. Verify every specific place, business, person, event and date you name, but don't spend searches re-confirming well-established history. 25-45 searches is typical; stop researching once every item you'll keep is verified, then write the file.

ISOLATION: other agents are writing sibling files in research/nba/${team}/ at the same time. Only write the file(s) your brief names.

FINISH: when the validator prints OK, return ok=true with a 1-2 sentence summary of your sharpest findings. If you could not finish, return ok=false and say why in problems.`
}

// Right-size each stage (usage limits): research and critique on Sonnet at
// medium effort; the strategist, whose brief the Nike team acts on, on the
// session model at high effort; the editor on the session model at medium.
const TIER = {
  strategist: { effort: 'high' },
  editor: { effort: 'medium' },
}
const tier = (agentId) => TIER[agentId] || { model: 'sonnet', effort: 'medium' }

async function run(agentId, team, phase) {
  let r = await agent(prompt(agentId, team), { label: `${team}:${agentId}`, phase, schema: RESULT, ...tier(agentId) })
  if (!r || !r.ok) {
    log(`${team}:${agentId} did not validate — retrying once`)
    r = await agent(prompt(agentId, team) + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. If research/nba/${team}/ already holds a partial file of yours, repair it rather than starting over.`, { label: `${team}:${agentId}:retry`, phase, schema: RESULT, ...tier(agentId) })
  }
  return { agent: agentId, ok: !!(r && r.ok), summary: r ? r.summary : '', problems: r ? r.problems : 'agent returned null' }
}

// One market at a time, end to end, so an interruption (usage limit, restart)
// leaves finished markets rather than many half-researched ones. A team can be
// a plain id (full run) or { id, lenses, from } to resume an interrupted market:
// `lenses` = only the missing dossiers, `from` = 'research' | 'synthesize' | 'verify'.
const STAGES = ['research', 'synthesize', 'verify']
const SKIPPED = { ok: true, summary: 'already done', problems: '' }
async function market(spec) {
  const team = typeof spec === 'string' ? spec : spec.id
  const from = STAGES.indexOf((spec && spec.from) || 'research')
  const want = (spec && spec.lenses) || LENSES
  const lenses = from <= 0 ? await parallel(want.map((l) => () => run(l, team, 'Research'))) : []
  const strategist = from <= 1 ? await run('strategist', team, 'Synthesize') : SKIPPED
  const [factcheck, authenticity] = await parallel([
    () => run('factcheck', team, 'Verify'),
    () => run('authenticity', team, 'Verify'),
  ])
  const editor = await run('editor', team, 'Edit')
  log(`${team}: ${lenses.filter((l) => l.ok).length}/${lenses.length} dossiers run, brief ${editor.ok ? 'edited' : 'NOT edited'}`)
  return { team, lenses, strategist, factcheck, authenticity, editor }
}
const results = []
for (const team of TEAMS) results.push(await market(team))

return results.filter(Boolean).map((r) => ({
  team: r.team,
  lensesOk: r.lenses.filter((l) => l && l.ok).length,
  lensFailures: r.lenses.filter((l) => !l || !l.ok).map((l) => l ? `${l.agent}: ${l.problems}` : 'null'),
  strategist: r.strategist && r.strategist.ok,
  factcheck: r.factcheck && r.factcheck.summary,
  authenticity: r.authenticity && r.authenticity.summary,
  editor: r.editor && r.editor.summary,
}))
