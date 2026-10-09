export const meta = {
  name: 'home-court-strengthen',
  description: 'Strengthen the briefs the league critic named as weakest (lac, cle, uta), then check each revision',
  phases: [
    { title: 'Strengthen', detail: 'Market Strategist revises the brief against the league critic\'s notes' },
    { title: 'Check', detail: 'Reviewer confirms the revision fixes the named weaknesses without new errors' },
  ],
}

// Revise the briefs a league critic named as weakest, then check each revision:
//   Workflow({ scriptPath: 'scripts/nba/workflows/home-court-strengthen.js',
//              args: { today: '2026-10-09', weak: research/nba/league-critique.json's weakMarkets } })

const TODAY = args.today
const WEAK = args.weak // [{ team, why }]

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if strategy.json validates OK' },
    summary: { type: 'string', description: '2-5 sentences: what changed and why' },
    problems: { type: 'string', description: 'Anything unresolved; empty if none' },
  },
  required: ['ok', 'summary', 'problems'],
}

const COMMON = (team) => `Repository: /home/user/Scout (run commands from there). Today is ${TODAY}; it's the 2026-27 NBA season.
Home Court is Nike Basketball's local-fandom intelligence site. Market ${team} has eleven dossiers plus a brief in research/nba/${team}/ (music, art, food, culture, underground, hoops, fanbase, rhythm, uniform, retail-landscape, retail-behavior, strategy, factcheck, critique).
Research mode is KNOWLEDGE: do not call WebSearch or WebFetch. research/nba/league-pulse-east.json / league-pulse-west.json and the "confirmed" entries of research/nba/league-calendar.json were verified live on 2026-10-07 and are authoritative; anything else time-sensitive must be hedged and queued in provenance.verify.
Print the brief's output contract with \`node scripts/nba/brief.mjs --schema strategy\`; the quality bar is in \`node scripts/nba/brief.mjs strategist ${team} --today ${TODAY} --knowledge\` (read its STANDARDS). Validate with \`node scripts/nba/validate.mjs ${team} strategy\`.
Only edit research/nba/${team}/strategy.json.`

function strengthen(w) {
  return `${COMMON(w.team)}

YOU ARE: the ${w.team} Market Strategist, revising your brief. The League Completeness Critic, comparing all 30 briefs, named this one among the weakest:
"${w.why}"

Read research/nba/${w.team}/strategy.json, critique.json and factcheck.json, then every dossier you need, plus this market's League Pulse entry and research/nba/league.json (its cluster, themes and tentpoles that name ${w.team}).
Revise strategy.json so the brief is as specific and decisive as the strongest briefs in the league:
- Fix every weakness the critic names, concretely. If priorities are inflated, re-rank so at most 2-3 opportunities are priority 1. If an idea is generic (would survive the swap test in another city), replace it with something only this market's dossiers support. If a plan depends on an unverified event, give it a fallback that still works if the event doesn't happen. If the brief misses a league tentpole or a 2026 roster-change moment that the League Pulse confirms for this market, add it.
- Keep what is already strong and keep opportunity ids stable for opportunities you keep. Every partner you name must appear in this market's dossiers.
- Keep provenance.mode "knowledge" and add newly introduced time-sensitive claims to provenance.verify.
Validate until OK. Return ok=true with a summary of what changed.`
}

function check(w) {
  return `${COMMON(w.team)}

YOU ARE: the reviewer. research/nba/${w.team}/strategy.json was just revised to fix this weakness the League Completeness Critic named:
"${w.why}"

Check the revision adversarially: does it actually fix each point? Did it introduce anything that contradicts the League Pulse, the confirmed league calendar, factcheck.json removals/corrections, or the dossiers? Is any new idea generic (swap test) or disrespectful? Are there at most 2-3 priority-1 opportunities, each with a fallback if it depends on something unverified?
Fix any remaining problem directly in strategy.json (small, targeted edits; don't rewrite what works), then validate until OK. Return ok=true with a verdict and the fixes you made.`
}

async function run(prompt, label, phase, opts) {
  let r = await agent(prompt, { label, phase, schema: RESULT, ...opts })
  if (!r || !r.ok) {
    log(`${label} did not finish — retrying once`)
    r = await agent(prompt + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. Repair partial work rather than starting over.`, { label: `${label}:retry`, phase, schema: RESULT, ...opts })
  }
  return r || { ok: false, summary: '', problems: 'null' }
}

const results = await parallel(WEAK.map((w) => async () => {
  const s = await run(strengthen(w), `${w.team}:strengthen`, 'Strengthen', { effort: 'high' })
  const c = await run(check(w), `${w.team}:check`, 'Check', { model: 'sonnet', effort: 'medium' })
  return { team: w.team, strengthen: s, check: c }
}))
return results.map((r) => ({ team: r.team, ok: r.strengthen.ok && r.check.ok, strengthened: r.strengthen.summary, check: r.check.summary, problems: [r.strengthen.problems, r.check.problems].filter(Boolean).join(' | ') }))
