export const meta = {
  name: 'home-court-meaning-check',
  description: 'After the voice rewrite: one reader per market checks every changed line against the original for meaning drift and fixes it',
  phases: [
    { title: 'Meaning check', detail: 'Old vs new for the brief and the high-stakes dossier fields; restore meaning, keep the voice' },
  ],
}

// Meaning check after the Home Court voice rewrite:
//   Workflow({ scriptPath: 'scripts/nba/workflows/home-court-meaning-check.js',
//              args: { teams: ['bos', 'nyk'], repo: '/path/to/checkout', tools: '/path/to/checkout/scripts/nba/meaning-diff.mjs' } })

const TEAMS = args.teams
const REPO = args.repo
const DIFF = args.tools
const LENSES = ['music', 'art', 'food', 'culture', 'underground', 'hoops', 'fanbase', 'rhythm', 'uniform', 'retail-landscape', 'retail-behavior']
const FIELDS = 'summary|implication|detail|watchouts|productHooks|verify|sentiment|gamedayLook|priceProfile|jerseyBehavior|fanBehavior|retailSignal|\\.why$|\\.use$'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if every file still passes fact-guard, voice-lint (no FIX lines) and validate' },
    checked: { type: 'integer', description: 'How many changed fields you read' },
    fixed: { type: 'integer', description: 'How many you corrected' },
    summary: { type: 'string', description: 'What kinds of drift you found, in 2-3 sentences' },
    examples: { type: 'string', description: 'Up to three corrections: OLD meaning → bad NEW → fixed NEW' },
    problems: { type: 'string', description: 'Anything unresolved; empty if none' },
  },
  required: ['ok', 'checked', 'fixed', 'summary', 'examples', 'problems'],
}

function prompt(team) {
  return `You are the meaning checker for the ${team} market on Home Court, Nike Basketball's guide to local NBA fandom. Repository: ${REPO} (cd there and run every command from there; edit files only under research/nba/${team}/).

Every research file in research/nba/${team}/ was just rewritten into a plain, magazine-style house voice (research/nba/STYLE.md; read it first). A fact guard already confirmed that no name, number or data field was lost. What it can't see is meaning. Your job is to make sure every rewritten line still says what the original said.

1. Make a private scratch folder first (SCRATCH=$(mktemp -d)) and keep any helper script there. Other agents are working in parallel, so never use a shared or fixed scratch path.
2. Read the old/new pairs:
   node ${DIFF} ${REPO} ${team} strategy
   for f in ${LENSES.join(' ')}; do node ${DIFF} ${REPO} ${team} $f "${FIELDS}"; done
   Each block shows the field path, the OLD text and the NEW text.
3. For every pair, ask: does NEW say the same thing as OLD? Fix NEW in place when it:
   - drops or adds a hedge ("reportedly", "if confirmed", "to verify", "likely"), or turns a hedged claim into a fact
   - changes sequence, cause or condition (an added "then", "after that", "so" or "because" that wasn't there, or an "if" that disappeared)
   - changes who does what, who owns or wears what, or which team or date something belongs to
   - flips or loses a negation ("not", "never", "avoid", "don't")
   - merges or splits items so a list now says something different, or turns a recommendation into a statement of fact (or the reverse)
   - is garbled: a fragment that doesn't parse, a chopped sentence that lost its verb, or a word repeated by accident ("only logo-only")
   When you fix a line, keep the house voice: short, plain sentences. Change as little as you can. Do NOT revert good edits just because the wording differs; most pairs will be fine.
4. Edit the JSON safely: load it in node, set the string, and write it back with JSON.stringify(data, null, 2) plus a trailing newline.
5. Run, and fix until clean:
   node scripts/nba/fact-guard.mjs ${team} --base voice-base    (must print OK on all 14)
   node scripts/nba/voice-lint.mjs ${team}                      (no FIX lines)
   node scripts/nba/validate.mjs ${team}                        (all OK)
Don't commit. Return ok=true when the checks pass, with how many changed fields you read and how many you fixed.`
}

const results = await parallel(TEAMS.map((team) => async () => {
  let r = await agent(prompt(team), { label: `${team}:meaning`, phase: 'Meaning check', schema: RESULT, effort: 'medium' })
  if (!r || !r.ok) {
    log(`${team}:meaning did not finish — retrying once`)
    r = await agent(prompt(team) + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. Some lines may already be fixed: re-run the diff and finish the job.`, { label: `${team}:meaning:retry`, phase: 'Meaning check', schema: RESULT, effort: 'medium' })
  }
  return { team, ...(r || { ok: false, checked: 0, fixed: 0, summary: '', examples: '', problems: 'agent returned null' }) }
}))
return results
