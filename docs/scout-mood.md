# Scout Mood — the apparel mood-board generator

`/moodboard/` — type the creative direction for a season, get a complete,
designer-grade mood board: the macro view, three stories, a named palette,
product language (CMF), and a Pinterest-style masonry board of curated images
you can save, refine and export into your own boards.

It runs alongside the Scout trip planner (`/`) in the same Vite app and Vercel
project, and shares its design system and optional Supabase project.

## How a board is made

1. **Brief** (`/api/mood/brief`, one Claude call). An AI creative director /
   trend forecaster turns the direction into a point of view that traces
   macro driver → consumer mindset → story → colour, material, silhouette and
   detail:
   - **macro view**: the shift, 3 STEPIC drivers (each a real signal plus its
     product implication), a consumer archetype, the trend stage, and a
     confidence note separating evidence from provocation;
   - **3 stories** (anchor / directional / edge) that differ on at least two
     axes, each with 4 stock-photo queries (people, material, place,
     lateral) and 2 museum queries;
   - **palette** chips (core / seasonal / accent / neutral, each with where
     the colour comes from in the world), plus materials with hand-feel,
     silhouettes, details, graphics, references (at least half from outside
     fashion) and clichés to avoid.

   The season code (SP/SU/FA/HO, SS/FW, Resort, Pre-Fall) is resolved to a
   delivery window and lead time. The default is the season about 18 months
   out.
2. **Search** (`/api/mood/search`). Each story's queries are spread across
   the configured sources (below). Every result is normalized with its real
   credit, license and source link. One failing source never fails the board.
3. **Cull** (`/api/mood/curate`, Claude vision). Candidate thumbnails are
   fetched server-side from allow-listed hosts and scored like a design
   director would score them:
   - **hard rejects**: watermarks, text, logos, stock clichés, AI artefacts,
     over-processing, packshots, sensitive content, duplicates, off-brief;
   - **six 0–5 scores**: brief fit, specificity, material legibility, palette,
     craft, lateral originality.

   The keep threshold is applied in code, not by the model: weighted ≥ 3.6/5,
   brief fit ≥ 3, no dimension ≤ 1, and at most 2 images per photographer per
   story. Roughly one candidate in four survives. Each story's ~48 candidates
   are culled in two parallel passes.
4. **Board.** The masonry grid fills in story by story, interleaved. From
   there you can:
   - **Save** pins to your own boards;
   - **More like this**: a new search seeded by the image, culled against it
     as a visual reference;
   - **Refine**: a note to the creative director gives a revised brief and a
     new version of the board;
   - **Export**: a .zip of the images plus `credits.txt` and `brief.md`; a
     print/PDF board; or the brief as Markdown.

## Designer approval: what is real, and what isn't

The product requirement is that images be curated and approved by leading
apparel designers. Software can't create that approval, and Scout Mood never
fakes it:

- Everything the pipeline picks is labelled **AI-curated · not yet
  designer-reviewed**, and every image carries its real credit and license.
- The **Approved** badge appears only on images that a **verified
  designer-curator** has approved. That rule is enforced by Supabase
  row-level security, not by the browser (see `supabase/mood.sql`):
  - only accounts an admin adds to `mood_curators` with `verified = true`
    can approve, and only in their own name;
  - un-verifying a curator immediately withdraws all of their approvals.
- Approved images join a shared library. New boards whose story keywords
  match an image's tags pull it in first, with the curator's name and note.
- **Request designer review** sends a board snapshot to the curators' queue
  in the Curator Studio (`#/curate`). Curators approve or pass on each image,
  and approvals flow back to the board.

To make the requirement true in practice, you need to recruit the designers
and add them as curators (below). Until then the app shows, honestly, that
designer review isn't set up.

## Image sources

| Source | Kind | Key | License shown | Notes |
|---|---|---|---|---|
| Unsplash | photography | `UNSPLASH_ACCESS_KEY` | Unsplash License (free, commercial OK) | Hotlinked; downloads ping `download_location` (guideline); `content_filter=high`; demo keys get 50 req/hour, so apply for production |
| Pexels | photography | `PEXELS_API_KEY` | Pexels License (free, commercial OK) | 200 req/hour; "Photos provided by Pexels" link in the footer |
| Wikimedia Commons | photography | none | per file (CC BY / BY-SA / PD) with full attribution | Featured + Quality images only (community-juried); trademark-restricted files dropped |
| Are.na | designer-saved references | `ARENA_ACCESS_TOKEN` (Premium) | **Reference only**, rights stay with the original creator | Optional. Images saved by designers into themed channels |
| The Met | museum archive | none | CC0 (Open Access) | `v1.1` search (the v1 search was retired 2026-10-01); objects fetched with concurrency 4 because Imperva throttles bursts |
| Cleveland Museum of Art | museum archive | none | CC0 | One call returns images; the ~3400px print file is the export copy |
| Cooper Hewitt (Smithsonian) | museum archive | `SMITHSONIAN_API_KEY` (api.data.gov) | CC0 | Optional |

Deliberately not used:

- **Art Institute of Chicago**: since 2026-08 its image host challenges
  server-side requests, which breaks the vision cull.
- **V&A**: its API terms are non-commercial.
- **Pixabay**: it forbids hotlinking.
- **Pinterest, Behance, Cosmos**: no usable public search API.

With **no image keys at all**, boards draw on Wikimedia Commons plus the
museum archives. Add Unsplash and/or Pexels for contemporary photography.

## Configuration

Vercel → Project → Settings → Environment Variables:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | Briefs and the vision cull (model `claude-opus-5-5`, server-side fallback enabled) |
| `UNSPLASH_ACCESS_KEY` | recommended | Unsplash search + download tracking |
| `UNSPLASH_APP_NAME` | optional | `utm_source` for Unsplash attribution links (default `scout_mood`) |
| `PEXELS_API_KEY` | recommended | Pexels search |
| `SMITHSONIAN_API_KEY` | optional | Cooper Hewitt archive |
| `ARENA_ACCESS_TOKEN` | optional | Are.na designer-saved references (Premium token) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | optional | Sign-in, cross-device boards, designer approval (already used by the trip planner) |

### Supabase (for sync + designer approval)

1. Run `supabase/mood.sql` in the SQL editor. It is idempotent.
2. Under Authentication → URL configuration, add
   `https://<your-domain>/moodboard/` to the redirect allow-list (sign-in
   returns there).
3. Add each designer-curator after they have signed in once:

   ```sql
   insert into public.mood_curators (user_id, display_name, title, house, verified)
   select id, 'Jane Doe', 'Design Director, Outerwear', 'Example House', true
   from auth.users where email = 'jane@example.com';
   ```

   To revoke: `update public.mood_curators set verified = false where user_id = '…';`

## Limits worth knowing

- **Vercel plan.** Hobby allows at most 12 serverless functions per
  deployment, and the trip planner already uses 10. That is why Scout Mood
  serves all four operations from one dynamic route, `api/mood/[op].js`.
  Hobby is also limited to non-commercial use, so a tool for a brand's design
  team belongs on Pro, which lifts both limits and allows longer
  `maxDuration`.
- **Function time.** Every Claude call is sized to fit Vercel Hobby's 60s
  ceiling (`maxDuration: 60`). With Fluid Compute or Pro you can raise
  `maxDuration` and the batch sizes in `server/mood/*` / `src/mood/api.js`.
- **Response size.** Vercel caps function responses at 4.5 MB, so downloads
  use ~2400px copies, not originals.
- **Rate limits.** A first board costs about 18 image-API searches and 6–8
  Claude calls. On Unsplash's demo tier that is roughly 12 boards an hour.
- **Licensing.** Unsplash, Pexels, Commons and museum images are cleared for
  commercial use as licensed. Are.na images are not: they're labelled
  reference-only. No source clears trademarks, or model and property rights,
  in what's pictured, so treat boards as internal reference.

## Development

```bash
npm run dev            # Vite dev server: / and /moodboard/ (API routes need `vercel dev`)
npm run test:mood      # server unit tests (fixtures are real captured API responses; no network)
npm run smoke:mood     # build + Playwright walk-through with all APIs mocked
npm run smoke          # every smoke test (trip planner + Scout Mood)
```

Code map:

- `api/mood/[op].js`: the single Vercel function. It routes `/api/mood/brief`,
  `/api/mood/search`, `/api/mood/curate` and `/api/mood/image` to
  `server/mood/handlers/`.
- `server/mood/`: shared server code, outside `/api` so it isn't deployed as
  functions. It holds the Claude client, prompts and schemas, the source
  adapters, and validation.
- `src/mood/`: the React page (`App.jsx`, `api.js` for the generation
  pipeline, `store.js` for persistence, `library.js` for designer approval,
  `exportBoard.js`, `components/`).
- `supabase/mood.sql`: tables and RLS.
- `supabase/tests/mood_rls_test.sql`: 32 assertions. Users can't make
  themselves curators, and can't approve or sign a review in someone else's
  name. Revoked curators' approvals disappear. Boards stay private.
