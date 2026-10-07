# Home Court research corpus

This directory holds the agent research behind Home Court, for all 30 NBA markets in the 2026-27 season. It was researched on the live web in October 2026.

```
research/nba/
  league-calendar.json        verified 2026-27 league dates and structural facts (ground truth for audits)
  league.json                 cross-market synthesis: themes, clusters, tentpoles, priority board,
                              Portland playbook, calibrated scores
  league-critique.json        completeness critic's review of league.json
  <team>/                     one folder per market (atl … was)
    music.json                ┐
    art.json                  │
    food.json                 │  six culture dossiers
    culture.json              │
    underground.json          │
    hoops.json                ┘
    fanbase.json              fan base identity: segments, traditions, icons, rivalries, gameday look
    rhythm.json               12-month engagement curve + 2026-27 key dates
    uniform.json              official palette, uniform eras, City Edition history and reception
    retail-landscape.json     where to shop / where they shop: districts and doors
    retail-behavior.json      when and how they shop: retail calendar, channels, price, jerseys
    strategy.json             the Nike Basketball brief (edited after both critiques)
    factcheck.json            fact-check log; dossiers were corrected in place
    critique.json             authenticity critique the editor resolved
```

Every file follows an output contract in `src/nba/agents/roster.js`. To check them:

```bash
node scripts/nba/validate.mjs --all     # every market file
node scripts/nba/validate.mjs league    # league.json
node scripts/nba/assemble.mjs           # publish to src/nba/data/ for the site
```

## Reading it responsibly

Agents verified current facts with web search, and the Fact-Check Critic audited the riskiest claims. Before you commit spend, still re-confirm three things: venues and stores, which open, close and move; event dates, which shift year to year; and third-party IP and talent conflicts, which every dossier flags under `watchouts`.

Partnership ideas name real creators and institutions only as candidates to approach. None of them implies an existing relationship.
