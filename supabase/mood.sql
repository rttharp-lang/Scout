-- Scout Mood — Supabase schema + row-level security.
--
-- Run once in the Supabase SQL editor (safe to re-run). Requires the same
-- project as the Scout trip planner (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
--
-- What this enables in /moodboard/:
--   * mood_boards          — each signed-in user's explorations + boards, synced across devices (private).
--   * mood_curators        — the designer-curator roster. ONLY an admin (SQL editor / service role) can
--                            add or verify a curator; no browser client can make itself a curator.
--   * mood_approvals       — the designer-approved image library. Anyone can read it; only VERIFIED
--                            curators can approve (insert) or revoke (delete) — and only their own rows.
--   * mood_review_requests — "Request designer review": a user submits a board snapshot; verified
--                            curators see the queue and record approve/reject decisions per image.
--
-- Adding a curator (after they have signed in to /moodboard/ once, so they exist in auth.users):
--   insert into public.mood_curators (user_id, display_name, title, house, verified)
--   select id, 'Jane Doe', 'Design Director, Outerwear', 'Example House', true
--   from auth.users where email = 'jane@example.com';
-- Revoking: update public.mood_curators set verified = false where user_id = '…';

-- ── Boards (private, per user) ────────────────────────────────────────────
create table if not exists public.mood_boards (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,                       -- client-generated id (stable across devices)
  kind       text not null check (kind in ('exploration', 'board')),
  name       text not null default '',
  data       jsonb not null,                      -- the full exploration/board object
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.mood_boards enable row level security;

drop policy if exists "mood_boards owner read"   on public.mood_boards;
drop policy if exists "mood_boards owner insert" on public.mood_boards;
drop policy if exists "mood_boards owner update" on public.mood_boards;
drop policy if exists "mood_boards owner delete" on public.mood_boards;
create policy "mood_boards owner read"   on public.mood_boards for select to authenticated using (user_id = (select auth.uid()));
create policy "mood_boards owner insert" on public.mood_boards for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mood_boards owner update" on public.mood_boards for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mood_boards owner delete" on public.mood_boards for delete to authenticated using (user_id = (select auth.uid()));

-- ── Curators (admin-managed roster) ───────────────────────────────────────
create table if not exists public.mood_curators (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  title        text not null default '',          -- e.g. "Design Director, Running Apparel"
  house        text not null default '',          -- brand / studio they design for
  bio          text not null default '',
  verified     boolean not null default false,    -- only verified curators can approve
  created_at   timestamptz not null default now()
);
alter table public.mood_curators enable row level security;

-- Public can see verified curators (their names appear on approved images);
-- a signed-in user can also see their own row (to know whether they're pending).
drop policy if exists "mood_curators public read" on public.mood_curators;
create policy "mood_curators public read" on public.mood_curators for select to anon, authenticated
  using (verified or user_id = (select auth.uid()));
-- Deliberately NO insert/update/delete policies: with RLS on, browser clients
-- cannot write this table at all. Admins write it from the SQL editor / service role.

-- Belt and braces: browser roles can never write the roster.
revoke insert, update, delete on public.mood_curators from anon, authenticated;

-- Security-definer helper so policies can check curator status without
-- tripping over mood_curators' own RLS. It lives in a schema that is NOT
-- exposed through the Data API, with an empty search_path (Supabase guidance).
create schema if not exists private;
grant usage on schema private to anon, authenticated;
create or replace function private.mood_is_curator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mood_curators c
    where c.user_id = (select auth.uid()) and c.verified
  );
$$;
revoke all on function private.mood_is_curator() from public;
grant execute on function private.mood_is_curator() to anon, authenticated;

-- ── Approved image library ────────────────────────────────────────────────
create table if not exists public.mood_approvals (
  id         uuid primary key default gen_random_uuid(),
  image_id   text not null,                       -- normalized id, e.g. "unsplash:Ab12"
  image      jsonb not null,                      -- the normalized image (urls, credit, license)
  tags       text[] not null default '{}',        -- lower-case keywords used to match future briefs
  story      text not null default '',            -- story / context it was approved for
  note       text not null default '',            -- the curator's note
  curator_id uuid not null default auth.uid() references public.mood_curators (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (image_id, curator_id)
);
create index if not exists mood_approvals_tags_idx on public.mood_approvals using gin (tags);
create index if not exists mood_approvals_image_idx on public.mood_approvals (image_id);
create index if not exists mood_approvals_curator_idx on public.mood_approvals (curator_id);
alter table public.mood_approvals enable row level security;

drop policy if exists "mood_approvals public read"     on public.mood_approvals;
drop policy if exists "mood_approvals curator insert"  on public.mood_approvals;
drop policy if exists "mood_approvals curator update"  on public.mood_approvals;
drop policy if exists "mood_approvals curator delete"  on public.mood_approvals;
-- Approvals are visible only while their curator is verified: revoking a
-- curator immediately withdraws every image they approved.
create policy "mood_approvals public read" on public.mood_approvals for select to anon, authenticated
  using (exists (select 1 from public.mood_curators c where c.user_id = curator_id and c.verified));
create policy "mood_approvals curator insert" on public.mood_approvals for insert to authenticated
  with check (curator_id = (select auth.uid()) and (select private.mood_is_curator()));
create policy "mood_approvals curator update" on public.mood_approvals for update to authenticated
  using (curator_id = (select auth.uid()) and (select private.mood_is_curator()))
  with check (curator_id = (select auth.uid()) and (select private.mood_is_curator()));
create policy "mood_approvals curator delete" on public.mood_approvals for delete to authenticated
  using (curator_id = (select auth.uid()) and (select private.mood_is_curator()));

-- ── Review requests (user → curator queue) ────────────────────────────────
create table if not exists public.mood_review_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board        jsonb not null,                    -- snapshot: { title, season, concept, stories, pins[] }
  message      text not null default '',
  status       text not null default 'open' check (status in ('open', 'done')),
  decisions    jsonb not null default '{}',       -- { [image_id]: { verdict: 'approved'|'rejected', note } }
  reviewed_by  uuid references public.mood_curators (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.mood_review_requests enable row level security;

drop policy if exists "mood_reviews requester insert" on public.mood_review_requests;
drop policy if exists "mood_reviews read"             on public.mood_review_requests;
drop policy if exists "mood_reviews curator update"   on public.mood_review_requests;
drop policy if exists "mood_reviews requester delete" on public.mood_review_requests;
-- Requesters create open requests for themselves only (they cannot pre-fill decisions).
create policy "mood_reviews requester insert" on public.mood_review_requests for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'open' and decisions = '{}'::jsonb and reviewed_by is null);
-- Requesters read their own; verified curators read the whole queue.
create policy "mood_reviews read" on public.mood_review_requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.mood_is_curator()));
-- Only verified curators record decisions, and only in their own name.
create policy "mood_reviews curator update" on public.mood_review_requests for update to authenticated
  using ((select private.mood_is_curator()))
  with check ((select private.mood_is_curator()) and reviewed_by = (select auth.uid()));
-- Curators may only touch the review columns — never the requester or snapshot.
revoke update on public.mood_review_requests from anon, authenticated;
grant update (status, decisions, reviewed_by, updated_at) on public.mood_review_requests to authenticated;
-- Requesters may withdraw their own request.
create policy "mood_reviews requester delete" on public.mood_review_requests for delete to authenticated
  using (requester_id = (select auth.uid()));

-- Earlier versions of this file put the helper in the exposed public schema.
drop function if exists public.mood_is_curator();
