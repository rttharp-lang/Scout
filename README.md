# Scout
Travel Planning

## Home Court — local NBA fandom intelligence (`/nba/`)

Home Court helps the Nike Basketball team, based in Portland, become experts in every NBA team's local fandom. Each market page covers:

- **Where the opportunities are**: the brief, its top insights, and 5–8 opportunities, each with where, when, how and which products.
- **When to activate**: the fan base's month-by-month rhythm, the activation calendar, and key 2026-27 dates.
- **What to make**: a collection direction (themes, palettes, key pieces), a City Edition brief, and the uniform archive.
- **The evidence**: dossiers from six culture agents (music, art & design, food, culture & heritage, subculture & underground, grassroots hoops), the fan base and its rhythm, the uniform archive, and retail (where and when people shop, and how).

League views:

- **League read** (`#/league`): the League Strategist's cross-market synthesis, with themes, fandom clusters, calibrated scores for all 30 markets, the priority board, the Portland team's playbook and the watchlist.
- **Opportunity board** (`#/opportunities`): every opportunity across the league, filterable by month, product family, priority and upside.
- **League calendar** (`#/calendar`): a heatmap of all 30 fan rhythms and every activation, broken down by month.
- **Agents** (`#/agents`): the roster, the workflow, and a console that runs it live.

### The agents

Every market is researched by 15 agents, defined once in `src/nba/agents/roster.js` with their missions, questions and JSON output contracts:

1. **Research (in parallel).** Eleven lens agents research the live web, and each writes a dossier to `research/nba/<team>/<lens>.json`. In knowledge mode, used when search is unavailable, they write from model knowledge instead. Live-verified team facts (the League Pulse) are injected as ground truth, and every time-sensitive claim is queued for verification.
2. **Synthesize.** The Market Strategist turns the eleven dossiers into the Nike Basketball brief (`strategy.json`).
3. **Verify (in parallel).** The Fact-Check Critic checks the riskiest claims and corrects dossiers in place. The Authenticity Critic attacks the brief for generic, stereotyped or unfounded recommendations.
4. **Edit.** The Brief Editor resolves every high- and medium-severity issue.

A league stage then audits each division against the verified league calendar and League Pulse. It reads all 30 briefs, calibrates scores across markets and writes `research/nba/league.json`. A completeness critic and an editor review it.

The published corpus is mostly knowledge drafts. Every dossier is labelled on the site, and [research/nba/README.md](research/nba/README.md) explains what was verified live and how to work through the verification queues.

The orchestration lives in `scripts/nba/workflows/`. `home-court-research.js` runs markets end to end, and can resume a market from any stage. `home-court-league.js` runs the division audits and the league synthesis. Both run under Claude Code's Workflow tool.

```bash
node scripts/nba/brief.mjs music por        # print an agent's full brief
node scripts/nba/brief.mjs --schema strategy # print an output contract
npm run research:validate                    # validate every research file
npm run research:assemble                    # research/ → src/nba/data/ (what the site loads)
```

### Live runs

`api/homecourt-agent.js` runs any agent through the Claude API, using the same roster and prompts. Agents that research use the `web_search` server tool first, then compose to their schema with structured outputs. The Agents page orchestrates the full 15-agent workflow from the browser, one function call per agent stage. Results are saved in that browser and can be compared against the published research on the market page.

This requires `ANTHROPIC_API_KEY` on the server. Without it, the published research still works and the console explains why live runs are unavailable.

### Checks

`npm run smoke` builds the app and runs the Scout smoke tests plus `scripts/homecourt-smoke.mjs`. The Home Court test opens every route at phone and desktop widths. It fails on runtime errors, missing content or horizontal overflow.
