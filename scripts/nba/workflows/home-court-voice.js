export const meta = {
  name: 'home-court-voice',
  description: 'Rewrite Home Court market research in a city-guide voice: editors per file group, then a copy chief per market',
  whenToUse: 'Copy-edit research/nba/<team>/*.json into the house style (research/nba/STYLE.md) without changing facts',
  phases: [
    { title: 'Edit', detail: 'Six editors per market rewrite the prose in their files; fact guard, voice lint and validator must pass' },
    { title: 'Copy chief', detail: 'Reads the market as a reader would, evens out the voice, clears every remaining flag' },
  ],
}

// Rewrite Home Court research into the house voice, market by market:
//   Workflow({ scriptPath: 'scripts/nba/workflows/home-court-voice.js',
//              args: { teams: ['bos', 'nyk', { id: 'por', files: ['rhythm'], chief: false }],
//                      base: '<git ref of the pre-rewrite text>', repo: '/path/to/checkout' } })
// A team is an id (all 14 files, then a copy chief) or { id, files, chief }.

const TEAMS = args.teams
const BASE = args.base || 'a2e73726a45a' // the last commit before the October 2026 rewrite
const REPO = args.repo || '/home/user/Scout'

const GROUPS = [
  { files: ['strategy'], opts: { effort: 'medium' } },
  { files: ['music', 'art', 'food'], opts: { model: 'sonnet', effort: 'medium' } },
  { files: ['culture', 'underground', 'hoops'], opts: { model: 'sonnet', effort: 'medium' } },
  { files: ['fanbase', 'rhythm', 'uniform'], opts: { model: 'sonnet', effort: 'medium' } },
  { files: ['retail-landscape', 'retail-behavior'], opts: { model: 'sonnet', effort: 'medium' } },
  { files: ['factcheck', 'critique'], opts: { model: 'sonnet', effort: 'medium' } },
]

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if every file passes fact-guard, voice-lint (no FIX lines) and validate' },
    summary: { type: 'string', description: 'One or two sentences on what changed' },
    examples: { type: 'string', description: 'Two of your best before → after edits, quoted briefly' },
    problems: { type: 'string', description: 'Anything left unresolved; empty if none' },
  },
  required: ['ok', 'summary', 'examples', 'problems'],
}

const CHECKS = (team, f) => `node scripts/nba/fact-guard.mjs ${team} ${f} --base ${BASE}
   node scripts/nba/voice-lint.mjs ${team} ${f}
   node scripts/nba/validate.mjs ${team} ${f}`

function editPrompt(team, files) {
  const review = files.includes('factcheck')
  return `You are a copy editor on Home Court, Nike Basketball's guide to local NBA fandom. Repository: ${REPO} (cd there and run every command from there; edit files only under it).

THE JOB: rewrite the prose in ${files.map((f) => `research/nba/${team}/${f}.json`).join(', ')} so it reads like a good city guide or a magazine's city issue: human, concise and clear. You are editing words, not doing research.${review ? ' These two files are the agents\' review notes (fact-check verdicts and a critique). Make them clear, plain review notes, not magazine copy: say what was checked or wrong and what changed, in one or two sentences.' : ''}${files.includes('rhythm') ? ' In rhythm.json, extra.months holds twelve monthly write-ups (phase, team and local moments, fanBehavior, retailSignal): those are prose too, so rewrite them like everything else (month and intensity are data).' : ''}

1. Read research/nba/STYLE.md in full first. It is the house style, and its "Rules that never bend" are absolute. Study its before/after examples: that is the target voice. Don't just chop long sentences into short ones; rewrite them the way a good editor would say them.
2. For each file: read it, then rewrite every prose string. Prose means all text except the data fields STYLE.md lists (ids, team, lens, target, hex, months, scores, enum values, evidence, sources and URLs, provenance mode/asOf, and every name, term, season, era and date). Keep the JSON shape identical: same keys, same number of list items, same order. The easiest safe method for a big file is a small node script that loads the JSON, sets the new strings, and writes it back with JSON.stringify(data, null, 2) plus a trailing newline.
3. Headline: a magazine headline, 90 characters at most (120 for strategy.json), making one point. Summary: a dek of 2-4 sentences, about 60 words; facts covered elsewhere in the file can leave it, and a fact found only in the summary moves to the field where it belongs. Keep every fact somewhere in the file: every name, number (as numerals), date, place, price, hex code and hedge. Add nothing new. If a line is already short and clear, leave it alone.
4. After each file, run:
   ${CHECKS(team, '<file>')}
   fact-guard must print OK; resolve every CHECK line by restoring the fact (ignore ordinary words it flags). voice-lint must show no FIX lines; aim for an average under 16 words a sentence and treat its notes as prompts to tighten. validate must print OK. Fix and re-run until all three pass.

ISOLATION: other editors are rewriting this market's other files right now. Only write your own files. Don't commit.
Return ok=true only when all your files pass all three checks.`
}

function chiefPrompt(team) {
  return `You are the copy chief for the ${team} market on Home Court, Nike Basketball's guide to local NBA fandom. Repository: ${REPO} (cd there and run every command from there; edit files only under it). Editors have just rewritten all 14 research files in research/nba/${team}/ into the house style.

1. Read research/nba/STYLE.md in full first.
2. Run the market-wide checks:
   node scripts/nba/fact-guard.mjs ${team} --base ${BASE}
   node scripts/nba/voice-lint.mjs ${team}
   node scripts/nba/validate.mjs ${team}
   Fix every FAIL, every FIX line, and every CHECK name that was a fact.
3. Read the market the way a reader of the site would: the brief (strategy.json: headline, thesis, archetype, pulse, top insights, opportunity titles and summaries, collection story, uniform concept and narrative), then every dossier's headline, summary and insight titles. Make it read as one publication with one voice:
   - Every dossier summary is a dek of 2-4 sentences, about 60 words. Cut longer ones; a fact that would be lost moves to an insight detail or the field where it belongs.
   - The same thing is called the same thing everywhere.
   - Each headline makes a different point, and none repeats the brief's headline.
   - No consultant-speak, brochure filler or AI tells are left (see STYLE.md).
   - Rhythm varies: not every field opens the same way, and not every implication starts with a verb.
   Tighten anything still stiff, and leave what already reads well. The rules that never bend still apply: every fact stays, the shape stays, data fields don't change.
4. Re-run all three checks until fact-guard and validate print OK and voice-lint shows no FIX lines. Don't commit.
Return ok=true when the market is clean. In examples, give the three weakest lines you fixed (before → after).`
}

async function run(prompt, label, phase, opts) {
  let r = await agent(prompt, { label, phase, schema: RESULT, ...opts })
  if (!r || !r.ok) {
    log(`${label} did not finish — retrying once`)
    r = await agent(prompt + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. Your files may already be partly rewritten: run the checks, then finish the job rather than starting over.`, { label: `${label}:retry`, phase, schema: RESULT, ...opts })
  }
  return r || { ok: false, summary: '', examples: '', problems: 'agent returned null' }
}

const spec = (t) => (typeof t === 'string' ? { id: t, files: null, chief: true } : { chief: true, files: null, ...t })

const results = await pipeline(
  TEAMS.map(spec),
  (s) => {
    const groups = s.files ? GROUPS.map((g) => ({ ...g, files: g.files.filter((f) => s.files.includes(f)) })).filter((g) => g.files.length) : GROUPS
    return parallel(groups.map((g) => () => run(editPrompt(s.id, g.files), `${s.id}:${g.files.join('+')}`, 'Edit', g.opts).then((r) => ({ files: g.files, ...r }))))
  },
  async (edits, s) => {
    const chief = s.chief ? await run(chiefPrompt(s.id), `${s.id}:copy-chief`, 'Copy chief', { effort: 'medium' }) : { ok: true, summary: 'no copy chief for this partial run', examples: '', problems: '' }
    log(`${s.id}: ${edits.filter((e) => e && e.ok).length}/${edits.length} edit groups clean; copy chief ${chief.ok ? 'clean' : 'NOT clean'}`)
    return { team: s.id, edits, chief }
  },
)

return results.filter(Boolean).map((r) => ({
  team: r.team,
  edits: r.edits.filter(Boolean).map((e) => ({ files: e.files.join('+'), ok: e.ok, problems: e.problems })),
  chief: { ok: r.chief.ok, summary: r.chief.summary, examples: r.chief.examples, problems: r.chief.problems },
}))
