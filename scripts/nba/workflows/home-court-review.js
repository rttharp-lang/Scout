export const meta = {
  name: 'home-court-review',
  description: 'Per market: live-check the highest-stakes claims and fix them at the source, gather fan evidence for walkthrough markets, then add timing and hand-off fields',
  phases: [
    { title: 'Check', detail: 'Live search on stores, history, dates and partners; corrections at the source; evidence.json' },
    { title: 'Fan evidence', detail: 'Walkthrough markets only: observed styling, reactions, retailer and commercial signals, visual references' },
    { title: 'Plan', detail: 'plan.json: timing for each calendar entry, hand-off fields for each opportunity' },
  ],
}

// Workflow({ scriptPath: 'scripts/nba/workflows/home-court-review.js',
//            args: { teams: ['por', 'atl'], walkthrough: ['por'], repo: '/path/to/checkout', today: '2026-10-10',
//                    searches: 4, walkSearches: 10, fanSearches: 8 } })

const { teams: TEAMS, walkthrough: WALK = [], repo: REPO, today: TODAY } = args
const N = args.searches || 4
const NW = args.walkSearches || 10
const NF = args.fanSearches || 8

const CONTEXT = (team) => `Home Court is Nike Basketball's guide to local NBA fandom. Its readers are the licensed basketball apparel team and senior leadership, so every fact must hold up. Repository (a git worktree): ${REPO}. cd there and run every command from there. Edit files only under research/nba/${team}/.

Today is ${TODAY}. The 2026-27 NBA season opens Oct 20, 2026.

What you're working with: the research in research/nba/${team}/ was written mostly from model knowledge. Names, stores, dates and history in it have NOT been checked against live sources. The fact-check agents also worked from memory, and one of them introduced an error. The dossiers' "sources" URLs were listed from memory and never opened.

Ground rules (they don't bend):
- Never invent verification, sources, dates, reopenings, commercial data, stock, quotes or segment sizes.
- A claim counts as verified only when a result returned by your own WebSearch call in this session states it. Record the URL, title, publisher and publication date exactly as the result shows them (empty string when no date is shown).
- WebFetch and curl can't reach most sites from here; the network proxy blocks them. Don't try to route around a block. Use WebSearch with mode "standard"; its results include page excerpts. Load it with ToolSearch ("select:WebSearch") if it isn't loaded.
- Make a private scratch folder first (SCRATCH=$(mktemp -d)) for any helper script. Other agents work in parallel, so never use a shared or fixed path.
- Edit JSON safely: load it in node, change values, write it back with JSON.stringify(data, null, 2) + "\\n".
- Any prose you write follows research/nba/STYLE.md: plain, short sentences, no consultant-speak.
- The schema for a file: node scripts/nba/brief.mjs --schema evidence (or plan).`

function checkPrompt(team, n, walk) {
  return `${CONTEXT(team)}

YOUR JOB: check the highest-stakes claims in the ${team} brief with live search, fix anything wrong at the source, and log every check in research/nba/${team}/evidence.json.

1. Read the brief: node scripts/nba/plan-view.mjs ${team}
   Also read research/nba/league-calendar.json and this team's entry in research/nba/league-pulse-east.json or league-pulse-west.json. Both were live-verified on Oct 7, 2026 (league dates; roster, coach, City Edition status, marquee games), so don't spend searches on what they already settle.
2. Choose up to ${n} claims, in this order of priority:
   a. Stores, venues and doors the brief uses as launch or sales doors in priority-1 opportunities, calendar channels or the retail playbook. Above all any Nike-owned door (a Nike Community Store, Nike Well Collective, Nike Rise, Nike Unite or Nike Factory Store) and any small independent shop or venue that carries a whole idea. Is it open now, at that location? Closures do the most damage: Portland's brief recommended a Nike store that closed in 2023.
   b. History a top insight rests on: title dates and where they were won, anniversaries, uniform history. New York's brief put the 1973 clincher at the Garden; it was at the Forum.
   c. Dates of priority-1 events between now and March 2027 that league-calendar.json doesn't cover: home openers, local festivals, heritage nights.
   d. Whether the partners the brief leans on hardest exist and still run the program it names.${walk ? `
   e. As a walkthrough market, also cover the facts behind the first three top insights and the partners and doors in the top three opportunities.` : ''}
   HARD CAP: ${n} WebSearch calls. Count them. Write one focused query per claim; a good result can settle two related claims.
3. Add one claims[] entry per claim checked (ids ${team}-c1, ${team}-c2, …):
   - verified: a result states it. Cite it.
   - contradicted: a result says otherwise. Cite it and fix the research (step 4).
   - unclear: you searched and nothing settled it. Leave the research alone.
   evidence is what the source says, in your own words. supports lists the topInsights indexes, opportunity ids and calendar indexes (as plan-view prints them) that depend on the claim.
4. When a claim is contradicted, correct the research at the source:
   - grep every file in research/nba/${team}/ for it (names, addresses, dates) and fix every occurrence: strategy.json opportunities[].where, how and kpi, calendar channel and play, retailPlaybook, uniform, collection, the dossiers' places, doors, insights, productHooks and verify lists.
   - Replace a closed door only with a door a result shows is open. Otherwise remove it from the list, or reword the recommendation so it doesn't depend on it. Never invent a replacement.
   - Don't add facts the source doesn't state. Don't reorder or remove calendar entries or opportunities, because other files index them. Removing an item from a where, places or doors list is fine.
   - If a factcheck.json verdict covers the claim, set it to "corrected", start the note with "Checked live ${TODAY}:" and put the source URL in source.
   - Add a corrections[] entry (claim, correction, files, claimId).
   If you verify a claim that factcheck.json marked "unverifiable", update that verdict to "confirmed" with the same note prefix and source.
5. Write research/nba/${team}/evidence.json:
   { "team": "${team}", "checkedOn": "${TODAY}", "searches": <calls used>, "claims": [...], "observations": [], "references": [], "corrections": [...] }
6. Run until clean: node scripts/nba/validate.mjs ${team}
Don't commit. Return the summary fields.`
}

function fanPrompt(team, n) {
  return `${CONTEXT(team)}

YOUR JOB: add observed fan evidence and sourced visual references for ${team}, so a reader can see what fans actually wear and say, kept apart from what Home Court proposes. Write into research/nba/${team}/evidence.json. It already holds the claims from the verification pass: keep them, and keep the file valid.

1. Read the brief (node scripts/nba/plan-view.mjs ${team} insights) and research/nba/${team}/fanbase.json (segments and wardrobe), uniform.json and retail-behavior.json. Note claims that are universal ("every fan…", "the city wears…"), that give a whole city one look, or that leave out women, younger fans, families, heritage fans or style-led buyers.
2. With at most ${n} WebSearch calls (a hard cap; count them), look for dated, attributable evidence:
   - observed outfits and styling: street-style or game-night photo stories and fashion coverage of local fans
   - fan reactions to uniforms (City Edition, Specter, Classic) in dated coverage that reports the reaction
   - retailer observations: a shop owner or team-store executive in the news on what sells
   - commercial signals: published rankings such as the NBA's jersey and team merchandise sales lists, or reported sell-outs
   - evidence that conflicts with the brief, or shows segments differ
   - visual references: sourced pages showing historical uniforms, local lettering, art and materials, or the courts, stores and community spaces the brief relies on
3. observations[]: paraphrase what the source reports. No invented quotes. A quote is allowed only if it appears word for word in the search result, and only up to 12 words. Fill audience (whose behavior it reflects), timeframe (when published or observed) and limitations (sample, who's missing, why it can't be generalized). Social media and forum comments are directional only: say so in limitations. Add a conflict or segment entry when the evidence supports one; don't force it.
4. references[]: link cards only, no image files. title says what the page shows. note says what to look at and which insight it supports. credit is the photographer or publisher as shown, or "See source". Each must be something that exists, not a concept.
5. Fill supports for every item. Don't edit any other file. Add the calls you used to "searches".
6. Run until clean: node scripts/nba/validate.mjs ${team}
Don't commit. Return the summary fields.`
}

function planPrompt(team) {
  return `${CONTEXT(team)}

YOUR JOB: write research/nba/${team}/plan.json, which tells planners when each calendar moment happens, when they must act, how a product would get made, and who would own each opportunity. Use only what the brief says, plus the dated facts in evidence.json and league-calendar.json. No web searches for this job.

1. Read: node scripts/nba/plan-view.mjs ${team}
   Then research/nba/${team}/evidence.json (live checks; claims with status "verified" can confirm a date) and research/nba/league-calendar.json (live-verified Oct 7, 2026).
   Schema: node scripts/nba/brief.mjs --schema plan

2. calendar[]: one entry per strategy.json calendar entry, same order, i = its index, window copied exactly.
   - YEAR: the brief was written in October 2026 and lists moments in time order from October 2026. Use a year written in the window or moment first. Otherwise infer it from the order: months after the first entry run through 2027, and a later return to October or November means 2027 (next season). Example: "Bulls 2027-28 home opener" is October 2027, not 2026.
   - kind: event (a game, festival, holiday or anniversary on a date), action (work the team must do: sign partners, open rights talks, brief a product), launch (a product drop or release), season (a stretch of weeks with its own mood).
   - start / end: YYYY-MM-DD when the brief gives a day, else YYYY-MM. end is "" for a single day or month. The entry's month must fall within start..end.
   - certainty and basis:
     confirmed + checked-live: a verified claim in evidence.json states the date (basisNote = that claim id).
     confirmed + league-calendar: league-calendar.json lists it with status "confirmed" (basisNote = the event name).
     confirmed + fixed-holiday: the calendar fixes it, e.g. Juneteenth is June 19, Christmas is Dec 25, Black History Month is February (basisNote = the rule).
     tentative + brief-unchecked: the brief gives a date or narrow window that nobody has checked, or says expected, around, reportedly or to confirm.
     unknown + none: no date beyond a month, a season or "spring".
     Never call a date confirmed for any other reason.
   - recurring: true when the moment comes round every year (holidays, festivals, the first freeze, Black Friday), false for one-offs (an anniversary year, a specific launch).
   - actBy / actNote: only when the brief says when the work must happen ("open talks this month", "brief the FW27 shell now" = ${TODAY.slice(0, 7)}; "sign partners before February" = the month before). Otherwise "" and "". Don't invent lead times.
   - route, the most demanding route the entry needs:
     existing-inventory (styles already in the line: "existing", stock, gift bundles of current product),
     quick-turn-graphics (new prints or text on existing blanks: tees, hoodies, posters),
     new-development (a new style, fabric, fit or silhouette: coats, shells, cut-and-sew, new colorways of footwear),
     future-uniform (City Edition or other uniform concepts),
     no-product (meetings, partner deals, funds, court refurbishments, events without product).
   - targetSeason: the season product from this entry sells in (seasons run October to September: Oct 2026–Sep 2027 is "2026-27"); "" for no-product.
   - dependencies, only those the entry implies: stock-availability for existing-inventory; production-capacity for quick-turn and new-development; nike-calendar-approval for new-development and future-uniform; league-or-team-rights when team marks or uniforms are involved; player-or-estate-rights for player names, numbers or likenesses; third-party-ip for other marks, artworks or names; partner-agreement when a partner is named; retailer-agreement when it depends on a store carrying it; venue-or-permit for public spaces and events; brand-safety when the brief flags it; date-confirmation whenever certainty isn't confirmed.

3. opportunities[]: one per strategy.json opportunity, same ids, same order.
   - consumer: who it's for, one line built from the brief's segment.
   - insights: up to three topInsights indexes the idea builds on.
   - categories: from its products (jersey, tee, fleece, outerwear, shorts, pants, headwear, footwear, accessory, kids, uniform, event, other).
   - fit: the sizing audiences the brief names (men's, women's, unisex adult, youth, kids, infant and toddler). Use "to define" when the brief doesn't say. Don't assume.
   - targetSeason: the season its main product sells in. firstInMarket: the first month anything reaches fans (YYYY-MM). actBy / actNote: the first decision or step and when the brief says it's due (often ${TODAY.slice(0, 7)} for "now" or "this month").
   - routes: every route it uses, the gating one first (e.g. existing inventory this winter, new development for next season).
   - validation: 1-4 short checks to run before anyone briefs it, drawn from the brief's own risks, verify items and KPIs: consumer (will these fans buy it?), commercial (price, volume, margin), operational (stock, door, rights). Write them as tasks: "Test the tax-line price with entry buyers."
   - dependencies: as for the calendar.
   - owner: the function that would most naturally lead it (Licensed team apparel, Design, Merchandising, Marketing, Nike retail, Partnerships and community, Licensing and legal, NBA uniform program). It's a proposal; nobody has been assigned.
   - partners: external organizations or people the idea names as partners or collaborators. All are prospects; none has agreed to anything.
   - status: "hypothesis". Always. Only a named person can move an idea further, and no one has.

4. Run until clean: node scripts/nba/validate.mjs ${team}
Don't commit. Return the summary fields.`
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if validate.mjs passes for the team' },
    searches: { type: 'integer', description: 'WebSearch calls used (0 for the plan job)' },
    verified: { type: 'integer' },
    contradicted: { type: 'integer' },
    unclear: { type: 'integer' },
    summary: { type: 'string', description: 'What you did and found, 2-4 sentences. For corrections: what was wrong and what changed.' },
    problems: { type: 'string', description: 'Anything unresolved; empty if none' },
  },
  required: ['ok', 'searches', 'verified', 'contradicted', 'unclear', 'summary', 'problems'],
}

async function run(prompt, label, phase) {
  let r = await agent(prompt, { label, phase, schema: RESULT, effort: 'medium' })
  if (!r || !r.ok) {
    log(`${label} did not finish cleanly${r && r.problems ? `: ${r.problems}` : ''}; one retry, no new searches`)
    r = await agent(prompt + `\n\nNOTE: a previous attempt did not finish${r && r.problems ? ` (${r.problems})` : ''}. Its work may be on disk. Don't repeat searches it already logged, and use at most 2 more WebSearch calls. Finish the job and make validate.mjs pass.`, { label: `${label}:retry`, phase, schema: RESULT, effort: 'medium' })
  }
  return r || { ok: false, searches: 0, verified: 0, contradicted: 0, unclear: 0, summary: '', problems: 'agent returned null' }
}

const results = await pipeline(
  TEAMS,
  (team) => run(checkPrompt(team, WALK.includes(team) ? NW : N, WALK.includes(team)), `${team}:check`, 'Check'),
  async (check, team) => {
    const fan = WALK.includes(team) ? await run(fanPrompt(team, NF), `${team}:fans`, 'Fan evidence') : null
    return { check, fan }
  },
  async (prev, team) => ({ team, ...prev, plan: await run(planPrompt(team), `${team}:plan`, 'Plan') }),
)
return results.filter(Boolean)
