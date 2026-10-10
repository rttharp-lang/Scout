export const meta = {
  name: 'home-court-voice-league',
  description: 'Rewrite the league read (research/nba/league.json) in the house voice, then a copy chief reads it as the League page',
  phases: [
    { title: 'Edit', detail: 'League editor rewrites every prose field; priority titles follow the rewritten briefs' },
    { title: 'Copy chief', detail: 'Reads the league read as a reader would and clears every flag' },
  ],
}

const REPO = args.repo

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if fact-guard passes (or fails only on the rank-key numbers named in dropped), voice-lint has no FIX lines and validate prints OK' },
    summary: { type: 'string', description: 'What changed, in 2-4 sentences' },
    examples: { type: 'string', description: 'Three before → after edits' },
    dropped: { type: 'string', description: 'Numbers deliberately cut (only internal rank-key arithmetic is allowed); empty if none' },
    problems: { type: 'string', description: 'Anything unresolved; empty if none' },
  },
  required: ['ok', 'summary', 'examples', 'dropped', 'problems'],
}

const CHECKS = `node scripts/nba/fact-guard.mjs league --base voice-base
   node scripts/nba/voice-lint.mjs league
   node scripts/nba/validate.mjs league`

const COMMON = `Repository: ${REPO} (cd there and run every command from there; edit only research/nba/league.json). Home Court is Nike Basketball's guide to local NBA fandom, and research/nba/league.json is its league read: headline, thesis, themes, fan-type clusters, tentpoles, a priority board, a playbook for the Portland team, a watchlist and calibrated scores for all 30 markets. The site's League page shows it. All 30 market briefs were just rewritten into the house voice (research/nba/STYLE.md); the league read is the last piece. Make a private scratch folder (SCRATCH=$(mktemp -d)) for any helper script; never use a shared or fixed scratch path.`

const EDIT = `${COMMON}

YOU ARE: the league editor. Read research/nba/STYLE.md in full, then rewrite every prose field in league.json in that voice: plain, concise and clear, like the opening pages of a magazine's city issue.
- headline: 120 characters at most, one point.
- thesis: a short opening paragraph of 4-7 plain sentences, no semicolon chains or bracket stacks, ending on what Nike should do.
- themes, clusters, tentpoles, Portland playbook, watchlist: 1-3 short sentences per field.
- priorities: each title ends with the brief's opportunity id in brackets, e.g. "Banner '26 (ring-night-1973-2026)". Keep that bracketed id exactly; the site uses it and hides it. Make the words before it match the current title of that opportunity in research/nba/<team>/strategy.json (find it by id), lightly shortened if needed. In each why, the "Rank key NN (opportunity NN + 5 for …)" arithmetic is internal scaffolding: you may cut it, and fact-guard will then report those numbers as dropped. List them in "dropped". Every other number must stay.
- scores[].note: one or two short sentences on why the market sits where it does; keep the brief's own scores at the end.
Data fields don't change: team ids, teams lists, months, score numbers, cluster names and watchlist market names. Keep every fact, hedge and list item.
CHECKS (fix and re-run until clean):
   ${CHECKS}`

const CHIEF = `${COMMON}

YOU ARE: the copy chief for the league read. Another editor just rewrote league.json. Read STYLE.md, then read league.json top to bottom as the League page presents it: headline, thesis, themes, clusters, scores notes, priority board, Portland playbook, watchlist, then tentpoles.
- Fix anything still stiff, repetitive or unclear; each theme and cluster should make its own point.
- Check every priority's bracketed id exists in that team's research/nba/<team>/strategy.json opportunities, and that its words match that opportunity's current title in spirit.
- Compare against the original where meaning matters: \`git show voice-base:research/nba/league.json\`. No hedge may be dropped, and no claim strengthened.
CHECKS (fix and re-run until clean; fact-guard may only fail on the rank-key numbers the editor listed as dropped: ${'${DROPPED}'}):
   ${CHECKS}`

let edit = await agent(EDIT, { label: 'league:editor', phase: 'Edit', schema: RESULT, effort: 'high' })
if (!edit || !edit.ok) {
  log('league:editor did not finish — retrying once')
  edit = await agent(EDIT + `\n\nNOTE: a previous attempt did not finish${edit && edit.problems ? ` (${edit.problems})` : ''}. Pick up where it left off.`, { label: 'league:editor:retry', phase: 'Edit', schema: RESULT, effort: 'high' })
}
const dropped = (edit && edit.dropped) || 'none'
const chief = await agent(CHIEF.replace('${DROPPED}', dropped), { label: 'league:copy-chief', phase: 'Copy chief', schema: RESULT, effort: 'medium' })
return { edit, chief }
