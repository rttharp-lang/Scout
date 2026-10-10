export const meta = {
  name: 'home-court-league',
  description: 'League stage: division audits against the verified league calendar, league synthesis with calibrated scores, completeness critic, editor',
  phases: [
    { title: 'Audit', detail: '6 division auditors fix league-date drift and cross-file inconsistencies' },
    { title: 'Synthesize', detail: 'League Strategist writes research/nba/league.json' },
    { title: 'Critique', detail: 'Completeness critic attacks the league read' },
    { title: 'Edit', detail: 'League Editor resolves the critique' },
  ],
}

// Home Court league stage: run with Claude Code's Workflow tool once all 30 markets validate, e.g.
//   Workflow({ scriptPath: 'scripts/nba/workflows/home-court-league.js',
//              args: { today: '2026-10-09', only: 'audit' | 'league', divisions: [{ name: 'Atlantic', teams: ['bos', 'bkn', 'nyk', 'phi', 'tor'] }, ...] } })

const TODAY = args.today
const DIVISIONS = args.divisions // [{ name, teams: [ids] }]
// The 30-market digest the league agents start from (node scripts/nba/digest.mjs > <path>).
const DIGEST = args.digest || '/tmp/home-court-digest.md'
const ALL = args.all || DIVISIONS.flatMap((d) => d.teams)
// Stages to run: 'audit' (division auditors only), 'league' (strategist, critic, editor), or both.
const ONLY = args.only || 'all'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    summary: { type: 'string', description: '2-5 sentences: what you changed or concluded' },
    problems: { type: 'string', description: 'Anything unresolved; empty if none' },
  },
  required: ['ok', 'summary', 'problems'],
}

const COMMON = `Repository: /home/user/Scout (run commands from there). Today is ${TODAY}; it's the 2026-27 NBA season.
Home Court is Nike Basketball's local-fandom intelligence site. Each market has eleven agent dossiers plus a brief in research/nba/<team>/ (music, art, food, culture, underground, hoops, fanbase, rhythm, uniform, retail-landscape, retail-behavior, strategy, factcheck, critique). Print any output contract with \`node scripts/nba/brief.mjs --schema <name>\` and validate with \`node scripts/nba/validate.mjs <team> <name>\`.
Research mode is KNOWLEDGE for this stage: do not call WebSearch or WebFetch (the turn's search budget is spent and most sites are blocked). Files carrying provenance.mode "knowledge" were written from model knowledge; files without provenance were verified live.`

function auditPrompt(div) {
  return `${COMMON}

YOU ARE: the ${div.name} Division auditor. Markets: ${div.teams.join(', ')}.
GROUND TRUTH (verified live today): research/nba/league-calendar.json entries with status "confirmed" (2026-27 league dates: opening night, NBA Cup, Christmas, trade deadline, All-Star 2027, play-in, playoffs, draft, Summer League) and research/nba/league-pulse-east.json / league-pulse-west.json (each team's 2026-27 situation: last season, coach, roster, offseason moves, City Edition, marquee games). Entries not "confirmed" are unverified: never state them as fact.
NO WEB: do not call WebSearch or WebFetch — this turn's search budget is spent and most sites are blocked. Work from the files and your own knowledge (current to mid-2026).

FOR EACH MARKET, check and fix in place (edit the JSON, then re-run its validator until OK):
1. Drift from ground truth: every league-wide date in rhythm.json (extra.keyDates, extra.months), strategy.json (calendar, opportunities.when/months, pulse) and retail-behavior.json must agree with the confirmed league calendar, and every team fact (roster, coach, last season, offseason moves, arena, City Edition, marquee games) with the League Pulse. Fix contradictions; soften unconfirmed specifics.
2. Cross-file consistency within the market: the same coach, star players, arena name, ownership, team colors and City Edition facts across all files. If two files disagree, fix the one that's wrong by your knowledge, or soften both and queue the claim in provenance.verify.
3. Brief integrity: strategy.json must not rely on anything the fact-check (factcheck.json) removed or corrected; partners named in strategy must appear in the dossiers; calendar months must match the windows described.
4. Specificity: if a strategy insight or opportunity could be about any city (swap test), sharpen it using the market's own dossiers.
Do not rewrite what is already right. Keep every file valid.

Return ok=true with a summary of the fixes per market.`
}

const LEAGUE = `${COMMON}

YOU ARE: the League Strategist. Start with the 30-market digest at ${DIGEST} (if it's missing, create it with \`node scripts/nba/digest.mjs > ${DIGEST}\`; about 37k tokens, so Read it in chunks: every brief's archetype, thesis, pulse, strategist scores, rhythm peaks, fan segments, collection and opportunity list). Read all of it. Then open the full briefs (research/nba/<team>/strategy.json) and dossiers (fanbase, rhythm, uniform, retail-behavior especially) wherever you need evidence for a theme, cluster or score, plus research/nba/league-calendar.json for tentpole dates.

Write research/nba/league.json following \`node scripts/nba/brief.mjs --schema league\`:
- headline + thesis: what local fandom means for Nike Basketball across the league.
- themes (4-8): patterns that recur across markets, each naming the team ids that share it and what it means for product. No generic sports-marketing truisms — each theme must be visible in the specific dossiers.
- clusters (3-7): group ALL 30 markets into fandom archetype clusters (every team id appears in exactly one cluster), each with a design + activation playbook.
- tentpoles (6-14): league-wide moments from the verified league calendar plus cross-market cultural moments, with the national play and how markets localize it.
- priorities (8-15): the league-wide priority board — the highest-value market opportunities ranked, each referencing a real opportunity from that market's brief.
- portland (3-6): operating principles for the Portland-based Nike Basketball team (how to run 30 markets from Portland: travel cadence keyed to the calendar, local partner models, lead times vs. uniform/product calendars, using the Blazers/Portland home market as a lab).
- watchlist (0-4): expansion or in-flux markets worth watching — state facts as of your knowledge and say what to confirm.
- scores: re-calibrate EVERY market's four scores (opportunity, culture, retail, fandom) so they compare across the league — 50 = league average on each axis, use the full range, and be consistent: a giant global market and a small loyal market should differ where the evidence says they do. Exactly 30 entries, one per team id: ${ALL.join(', ')}. Each note says why the market sits where it does relative to the others.

Validate: \`node scripts/nba/validate.mjs league\` (checks the schema, all 30 teams scored once, every team in exactly one cluster, valid ids). Fix until it prints OK. Return ok=true with a summary.`

const CRITIC = `${COMMON}

YOU ARE: the League Completeness Critic. Be adversarial. Read research/nba/league.json, the 30-market digest (${DIGEST}; Read it in chunks), the league calendar, and the full briefs (research/nba/<team>/strategy.json) wherever you need to check a claim.
Find what's missing or wrong: markets mis-clustered or absent; scores that are inconsistent across markets (compare like with like) or that contradict the briefs; themes that are generic or unsupported; tentpoles with wrong dates; priority-board items that don't exist in the market briefs; Portland principles that are vague; any market whose brief is clearly weaker than the rest (name it and why).
Write research/nba/league-critique.json as {"issues":[{"target":string,"severity":"high"|"medium"|"low","problem":string,"fix":string}],"weakMarkets":[{"team":string,"why":string}],"summary":string} (valid JSON). Return ok=true with a summary.`

const EDITOR = `${COMMON}

YOU ARE: the League Editor. Read research/nba/league.json and research/nba/league-critique.json, and use the 30-market digest (${DIGEST}) and the full briefs to check fixes. Resolve every high and medium issue in league.json, keep what is strong, and re-run \`node scripts/nba/validate.mjs league\` until it prints OK.
Return ok=true with a summary of changes, and list any weak markets the critic named in problems.`

// Auditors do careful but bounded file edits: Sonnet at medium effort. The
// league strategist, whose read the whole team works from, gets high effort.
const TIER = { Audit: { model: 'sonnet', effort: 'medium' }, Synthesize: { effort: 'high' }, Critique: { effort: 'medium' }, Edit: { effort: 'medium' } }

async function run(prompt, label, phase) {
  const opts = { label, phase, schema: RESULT, ...TIER[phase] }
  let r = await agent(prompt, opts)
  if (!r || !r.ok) {
    log(`${label} did not finish — retrying once`)
    r = await agent(prompt + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. Repair partial work rather than starting over.`, { ...opts, label: `${label}:retry` })
  }
  return r || { ok: false, summary: '', problems: 'null' }
}

const out = {}
if (ONLY !== 'league') {
  phase('Audit')
  const audits = await parallel(DIVISIONS.map((d) => () => run(auditPrompt(d), `audit:${d.name}`, 'Audit')))
  out.audits = audits.map((a, i) => ({ division: DIVISIONS[i].name, ok: a && a.ok, summary: a && a.summary, problems: a && a.problems }))
}
if (ONLY !== 'audit') {
  phase('Synthesize')
  const league = await run(LEAGUE, 'league:strategist', 'Synthesize')
  phase('Critique')
  const critic = await run(CRITIC, 'league:critic', 'Critique')
  phase('Edit')
  const editor = await run(EDITOR, 'league:editor', 'Edit')
  out.league = { ok: league.ok, summary: league.summary }
  out.critic = { ok: critic.ok, summary: critic.summary }
  out.editor = { ok: editor.ok, summary: editor.summary, problems: editor.problems }
}
return out
