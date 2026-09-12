# LOCAL — NBA & WNBA Fandom Intelligence

A private, collaborative research system for Nike's NBA and WNBA product management and design teams. LOCAL connects human motivations, their local expressions, the rhythm of fandom across a season, fan-base growth, and evidence-backed uniform opportunities, with a shared first-principles taxonomy underneath every screen.

**Status (honest):** this is a **partially connected system**. The application, backend, database, job runner, scheduler, taxonomy, evidence contract, collaboration, exports and tests are real and working. Live research depends on two things that were not available in the build environment: an Anthropic API key for the specialist agents, and outbound web access to source hosts. Both are configuration, not code. A separately labeled **demo workspace** with synthetic fixtures shows the full path from a local fan signal to a uniform brief; it never mixes with live research.

## What is here

| Layer | Implementation |
| --- | --- |
| Frontend | React 18 + Vite, one LOCAL design system, team color/typography per team (COLORS-inspired opening, Highsnobiety-inspired editorial structure) |
| Backend | Node 22 + Express, server-side sessions (httpOnly cookie, scrypt), workspace roles (admin / editor / viewer) enforced on every workspace route and export |
| Database | SQLite via `node:sqlite` (WAL). Durable, server-side. Tables cover workspaces, users, memberships, sessions, leagues, teams, seasons, sources, evidence, claims, claim_evidence, entities (fan communities, moments, metric observations, opportunities, brief versions, comments, decisions, fan profiles, motivation/growth hypotheses, outcome definitions, validation studies, research responses, uploads, media, notifications), links, taxonomy nodes/versions/changes, evidence codes, research runs, agent tasks, connectors, schedules, audit events, fetch cache |
| Research engine | Persistent orchestrator: intake/plan → discover + fan-out (parallel, bounded) → consolidate → challenge → follow-up → synthesize. Explicit run states, per-run budgets (tasks, sources, wall time, spend), idempotent tasks, leases, retries, resume after restart, cancellation |
| Specialists | 18-role roster (`server/engine/specialists/index.js`) with per-specialist question, source strategy, system rules, structured output schema (Ajv-validated), evidence obligations |
| Connectors | Open web (robots.txt, rate limits, no paywall/login bypass), RSS/Atom, NBA schedule JSON, WNBA schedule, Wikipedia REST, Reddit (credentials), YouTube (credentials), X / TikTok / Instagram / licensed listening (not connected), uploads (connected). States are verified by live checks: connected / limited / credentials required / unavailable / failed |
| Evidence contract | Stable IDs, locator/URL, type, origin (fan / team / paid / independent / league / internal), dates (published, event, retrieved), excerpt + position, locality (verified / contextual / unknown), evidence mode (behavior / testimony / interpretation), source families + duplicate collapsing, access and retention metadata, stance (supports / contradicts / context), taxonomy codes with version, alternatives, validation status. Confidence is computed deterministically from independence, locality, recency, coverage and contradiction, with the rationale shown |
| Taxonomy | v1 shared taxonomy (8 layers, 83 nodes) with definitions, inclusion/exclusion, synonyms, examples, evidence requirements, owner. Proposed changes → human review → new version with migration mappings; historical codes keep their version. Coding-agreement report is separate from confidence |
| Season Rhythm | Six synchronized lanes, weekly/monthly views, historical compare, team-local time, separate NBA/WNBA calendars, confirmed / recurring / predicted / contingent styling, filters by motivation, community and growth outcome, per-metric attention series with transparent rolling baseline spike detection, missing coverage rendered as missing |
| Collaboration | Saved teams, ownership, comments, research requests, brief version history, review states (draft → needs validation → validated → approved for brief → archived), human decisions recorded with a name, "what changed since last review", in-app notifications, audit log |
| Exports | Dossier, moment calendar, briefs (JSON) with citations, dates, taxonomy version and uncertainty; confidential records are excluded for viewers |
| Demo workspace | `ws_demo`: synthetic fixtures for Chicago Bulls (NBA) and Minnesota Lynx (WNBA). Every source uses a `demo://` locator and a `[DEMO]` title; the UI shows a persistent banner and "demo fixture" chips |

## Run it

```bash
cd local
npm install
cp .env.example .env        # fill in what you have; everything is optional for a first boot
npm run build               # builds the frontend into dist/
npm start                   # serves API + frontend + job runner + scheduler on :8787
```

Development (two processes, Vite proxies `/api`): `npm run dev` then open http://localhost:5173.

On first boot the server seeds the verified team registry, the taxonomy, the live workspace (`ws_live`), a bootstrap admin, and (unless `LOCAL_SEED_DEMO=false`) the demo workspace.

Default development logins (change or set `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD` before exposing anything):

| User | Password | Role |
| --- | --- | --- |
| admin@local.dev | local-admin | platform admin (all workspaces) |
| editor@local.dev | local-editor | editor in demo and live |
| viewer@local.dev | local-viewer | viewer in demo and live |

Routes: `/w/<workspace>` team directory, `/w/<workspace>/teams/<team-id>` team world with `/identity`, `/communities`, `/culture`, `/season`, `/growth`, `/uniform`, `/studio`, `/evidence`, `/ask`; plus `/portfolio`, `/across`, `/evidence`, `/taxonomy`, `/studio`, `/settings`.

## Configuration

See `.env.example`. The important ones:

- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — enables specialist findings, independent review and synthesis. Without it, runs still execute, gather reachable sources for human coding, and produce a neutral validation guide; findings/review/synthesis are marked *credentials required*.
- `LOCAL_ALLOW_INTERNAL_DOCS_TO_MODEL` — off by default. Uploaded/internal documents are never sent to the model provider unless this is `true`.
- `LOCAL_SESSION_SECRET`, `LOCAL_COOKIE_SECURE` — set in production behind HTTPS.
- `HTTPS_PROXY` / `NO_PROXY` — honored for all outbound fetches (corporate egress).
- `LOCAL_PRICE_IN_PER_MTOK`, `LOCAL_PRICE_OUT_PER_MTOK` — spend estimation inputs for budgets.

## Tests performed

```bash
npm test          # node:test — 16 tests: registry, auth, duplicate collapsing, confidence and contradictions,
                  # metrics (missing ≠ zero, baseline spikes), taxonomy versioning, run lifecycle (persist,
                  # idempotent, cancel, budget), brief flagging on contradiction, injection wrapper, demo isolation,
                  # HTTP authz (401/403), viewer vs editor exports, ask-with-citations, API run to terminal state
npm run smoke     # vite build + Playwright: real server on a temp DB, login, every screen desktop + mobile,
                  # drawers, Ask; fails on page errors; viewer cannot list research responses
```

Verified in this environment: research requests execute real backend tasks and persist across restarts; claims link to source passages and unsupported claims stay hypotheses; duplicated articles do not inflate corroboration; missing metrics remain missing and predicted moments render differently from observed ones; retrieved text is wrapped as untrusted data; two roles collaborate and unauthorized users cannot reach another workspace or confidential exports; failed connectors, cancellation, retries and budget exhaustion produce honest run states; briefs preserve evidence, contradictions, target season and unresolved validation; NBA and WNBA calendars are independent; one observation can carry several competing motivation codes; taxonomy edits preserve historical versions; profiles show no invented percentages; growth hypotheses stay separate from measured effects; a new contradictory source revises confidence and flags affected briefs; both pilot teams have motivation, growth, season and uniform coverage or explicit gaps.

Not verifiable here: live source retrieval and model-generated findings (egress to source hosts and the model API were unavailable in the build sandbox). The connector checks in Settings show the real state of whatever host you deploy to.

## Connector states as of this build

| Connector | State here | What it needs |
| --- | --- | --- |
| Open web, RSS, Wikipedia, NBA schedule, WNBA schedule | unavailable / failed (egress blocked) | Outbound HTTPS from the host; then re-check in Settings |
| Reddit, YouTube | credentials required | App credentials, terms acceptance, quota check |
| X, TikTok, Instagram | credentials required / unavailable | Paid or partner API access with commercial terms; or a licensed listening provider |
| Licensed social listening | credentials required | Provider evaluation against NBA/WNBA coverage, historic depth, locality signals, exports, licensing, cost |
| Uploads | connected | — |

No platform is displayed as connected unless its live check succeeded.

## Remaining production dependencies

1. A container host with a persistent volume (Dockerfile and example `fly.toml` included). The job runner and scheduler live in the server process; do not deploy as serverless functions.
2. `ANTHROPIC_API_KEY` for the specialist agents, plus a decision on `LOCAL_ALLOW_INTERNAL_DOCS_TO_MODEL`.
3. Outbound web access and per-team source maps (local media, fan sites, feeds) entered in Settings; specialists need real local sources to find local evidence.
4. Social/video platform credentials or a licensed listening provider, if social conversation coverage is required.
5. Approved, licensed media for team pages (Settings → media entities with rights metadata); the editorial fallback is used until then.
6. Production secrets: admin credentials, session secret, HTTPS, backups of the SQLite volume (or migration to Postgres if multi-instance scaling is needed).
7. Registry entries flagged "needs verification" (a few arena names and expansion-team colors) should be confirmed before targeting a product season.

## Repository layout

```
local/
  server/            Express app, auth, routes, engine (orchestrator, specialists, connectors, evidence, metrics), scheduler, seeds
  server/seed/demo/  Synthetic fixtures for the demo workspace (Bulls, Lynx)
  src/               React app: screens, components, design system (theme.css)
  tests/             node:test suites (engine + HTTP authz)
  scripts/smoke.mjs  Playwright end-to-end walk with screenshots
  Dockerfile, fly.toml, .env.example
```
