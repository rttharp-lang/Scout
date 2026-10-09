# Home Court research corpus

This directory holds the agent research behind Home Court, for all 30 NBA markets in the 2026-27 season. It was produced in October 2026.

## Provenance: what was checked live and what wasn't

The research session ran out of web-search budget early, so most of this corpus is a **knowledge draft**:

- **Live-verified:** the League Pulse (`league-pulse-east.json`, `league-pulse-west.json`) was checked on the live web on 2026-10-07. It covers each team's 2026-27 situation: last season, coach, stars, offseason moves, arena, City Edition and marquee games. The confirmed entries in `league-calendar.json` (15 of 24) were also checked live, as were Portland's music, art and food dossiers.
- **Knowledge drafts:** the other 357 dossiers and briefs were written from model knowledge, with the League Pulse given to every agent as authoritative current facts. Each file carries `provenance.mode: "knowledge"` and a `provenance.verify` list of time-sensitive claims to confirm before use (3,858 claims in all).
- **Fact-checked:** every market's Fact-Check Critic logged 35-40 verdicts and corrected dossiers in place, with up to three live spot-checks per market.

The site labels every dossier "Live-verified" or "Knowledge draft". Each market's Agent review tab lists its verification queue.

```
research/nba/
  league-calendar.json        2026-27 league dates and structural facts; "confirmed" entries were verified live
  league-pulse-east.json      ┐ each team's 2026-27 situation, verified live on 2026-10-07; injected into
  league-pulse-west.json      ┘ every agent's brief as CURRENT FACTS
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
node scripts/nba/digest.mjs             # one-page-per-market digest the league agents start from
```

## Reading it responsibly

Treat knowledge drafts as a well-informed starting point, not as verified research: work through a market's verification queue before acting on it. Even for live-verified material, re-confirm three things before you commit spend: venues and stores, which open, close and move; event dates, which shift year to year; and third-party IP and talent conflicts, which every dossier flags under `watchouts`.

Partnership ideas name real creators and institutions only as candidates to approach. None of them implies an existing relationship.
