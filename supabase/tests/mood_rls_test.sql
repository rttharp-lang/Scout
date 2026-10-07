-- RLS tests for supabase/mood.sql, runnable on plain Postgres (no Supabase
-- needed): it recreates the bits of Supabase the policies rely on — the anon /
-- authenticated roles with Supabase's default table grants, auth.users, and
-- auth.uid() reading the request's JWT subject — then applies mood.sql and
-- checks that only verified designer-curators can approve, in their own name.
--
-- Run: scripts/mood-rls-test.sh   (creates a throwaway database)
\set ON_ERROR_STOP on
\set QUIET on

-- ── Supabase stand-ins ───────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase's defaults: API roles get table privileges in public; RLS is the gate.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

set client_min_messages = warning;
\i supabase/mood.sql
-- Run it twice: the file must be idempotent.
\i supabase/mood.sql
set client_min_messages = notice;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'user-a@example.com'),   -- ordinary user
  ('00000000-0000-0000-0000-00000000000b', 'user-b@example.com'),   -- ordinary user
  ('00000000-0000-0000-0000-00000000000c', 'curator-c@example.com'),-- verified curator
  ('00000000-0000-0000-0000-00000000000d', 'curator-d@example.com'),-- verified curator
  ('00000000-0000-0000-0000-00000000000e', 'pending-e@example.com');-- unverified curator
-- Only an admin (here: the superuser running this file) can add curators.
insert into public.mood_curators (user_id, display_name, title, house, verified) values
  ('00000000-0000-0000-0000-00000000000c', 'Curator C', 'Design Director', 'House C', true),
  ('00000000-0000-0000-0000-00000000000d', 'Curator D', 'Head of Design', 'House D', true),
  ('00000000-0000-0000-0000-00000000000e', 'Pending E', 'Designer', 'House E', false);

-- Helpers: act as a user / as anon, and assert that a statement fails.
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.must_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok   — blocked: %', what;
    return;
  end;
  raise exception 'FAIL — allowed: %', what;
end $$;
create function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL — %', what; end if;
  raise notice 'ok   — %', what;
end $$;

-- ── Curator roster ───────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.must_fail($$insert into public.mood_curators (user_id, display_name, verified) values ('00000000-0000-0000-0000-00000000000a', 'Me', true)$$, 'a user making themselves a curator');
select pg_temp.must_fail($$update public.mood_curators set verified = true where user_id = '00000000-0000-0000-0000-00000000000e'$$, 'a user verifying a pending curator');
select pg_temp.check((select count(*) from public.mood_curators) = 2, 'users see only verified curators');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check((select count(*) from public.mood_curators where user_id = '00000000-0000-0000-0000-00000000000e') = 1, 'a pending curator can see their own row');
select pg_temp.must_fail($$update public.mood_curators set verified = true where user_id = '00000000-0000-0000-0000-00000000000e'$$, 'a pending curator verifying themselves');
reset role;
select pg_temp.check((select verified from public.mood_curators where user_id = '00000000-0000-0000-0000-00000000000e') = false, 'pending curator still unverified');

-- ── Approvals ────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.must_fail($$insert into public.mood_approvals (image_id, image) values ('unsplash:1', '{}')$$, 'an ordinary user approving an image');
select pg_temp.must_fail($$insert into public.mood_approvals (image_id, image, curator_id) values ('unsplash:1', '{}', '00000000-0000-0000-0000-00000000000c')$$, 'an ordinary user approving in a curator''s name');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.must_fail($$insert into public.mood_approvals (image_id, image) values ('unsplash:1', '{}')$$, 'an unverified curator approving');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.mood_approvals (image_id, image, tags, note) values ('unsplash:1', '{"id":"unsplash:1"}', '{wet,amber}', 'Take the glow.');
select pg_temp.check(true, 'a verified curator approves in their own name');
-- Upsert path (insert ... on conflict do update) works for their own row.
insert into public.mood_approvals (image_id, image, note) values ('unsplash:1', '{"id":"unsplash:1"}', 'Updated note')
  on conflict (image_id, curator_id) do update set note = excluded.note;
select pg_temp.check((select note from public.mood_approvals where image_id = 'unsplash:1') = 'Updated note', 'a curator updates their own approval via upsert');
select pg_temp.must_fail($$insert into public.mood_approvals (image_id, image, curator_id) values ('unsplash:2', '{}', '00000000-0000-0000-0000-00000000000d')$$, 'a curator approving in another curator''s name');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.mood_approvals (image_id, image) values ('pexels:9', '{"id":"pexels:9"}');
delete from public.mood_approvals where image_id = 'unsplash:1';  -- C's row: must not be deleted by D
update public.mood_approvals set note = 'hijacked' where image_id = 'unsplash:1';
reset role;
select pg_temp.check((select count(*) from public.mood_approvals where image_id = 'unsplash:1') = 1, 'a curator cannot delete another curator''s approval');
select pg_temp.check((select note from public.mood_approvals where image_id = 'unsplash:1') = 'Updated note', 'a curator cannot edit another curator''s approval');

set role anon;
select pg_temp.check((select count(*) from public.mood_approvals) = 2, 'anyone (anon) can read approvals by verified curators');
select pg_temp.must_fail($$insert into public.mood_approvals (image_id, image) values ('x', '{}')$$, 'anon approving');
reset role;
-- Revoking a curator withdraws every approval they made.
update public.mood_curators set verified = false where user_id = '00000000-0000-0000-0000-00000000000d';
set role anon;
select pg_temp.check((select count(*) from public.mood_approvals) = 1, 'a revoked curator''s approvals disappear');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.must_fail($$insert into public.mood_approvals (image_id, image) values ('pexels:10', '{}')$$, 'a revoked curator approving');
reset role;
update public.mood_curators set verified = true where user_id = '00000000-0000-0000-0000-00000000000d';

-- ── Review requests ─────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.must_fail($$insert into public.mood_review_requests (board, status, decisions) values ('{}', 'done', '{"x":{"verdict":"approved"}}')$$, 'a requester pre-filling decisions');
select pg_temp.must_fail($$insert into public.mood_review_requests (board, requester_id) values ('{}', '00000000-0000-0000-0000-00000000000b')$$, 'requesting review in someone else''s name');
insert into public.mood_review_requests (board, message, created_at) values ('{"title":"Night Shift","pins":[{"id":"unsplash:1"}]}', 'please review', '2099-01-01');
select pg_temp.check((select created_at < now() + interval '1 minute' from public.mood_review_requests limit 1), 'created_at is stamped by the server, not the requester');
select pg_temp.must_fail($$insert into public.mood_review_requests (board) values ('{"pins":[]}')$$, 'a review request with no images');
select pg_temp.must_fail($$insert into public.mood_review_requests (board) values (jsonb_build_object('pins', (select jsonb_agg(jsonb_build_object('id', g)) from generate_series(1, 61) g)))$$, 'a review request with more than 60 images');
do $$ begin for i in 1..9 loop insert into public.mood_review_requests (board) values ('{"pins":[{"id":"x"}]}'); end loop; end $$;
select pg_temp.must_fail($$insert into public.mood_review_requests (board) values ('{"pins":[{"id":"x"}]}')$$, 'an eleventh open review request from one user');
delete from public.mood_review_requests where board = '{"pins":[{"id":"x"}]}'::jsonb;
update public.mood_review_requests set decisions = '{"x":{"verdict":"approved"}}', status = 'done';
reset role;
select pg_temp.check((select status from public.mood_review_requests limit 1) = 'open', 'a requester cannot mark their own request reviewed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.mood_review_requests) = 0, 'other users cannot see someone''s review request');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.mood_review_requests) = 1, 'verified curators see the queue');
select pg_temp.must_fail($$update public.mood_review_requests set board = '{"title":"tampered"}'$$, 'a curator tampering with the board snapshot');
select pg_temp.must_fail($$update public.mood_review_requests set decisions = '{}', status = 'done', reviewed_by = '00000000-0000-0000-0000-00000000000d'$$, 'a curator signing a review as someone else');
update public.mood_review_requests set decisions = '{"unsplash:1":{"verdict":"approved","note":"","by":"00000000-0000-0000-0000-00000000000c"}}', status = 'done', reviewed_by = '00000000-0000-0000-0000-00000000000c';
reset role;
select pg_temp.check((select reviewed_by from public.mood_review_requests limit 1) = '00000000-0000-0000-0000-00000000000c', 'a verified curator records decisions in their own name');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check((select count(*) from public.mood_review_requests) = 0, 'an unverified curator cannot see the queue');
reset role;

-- Curators can dismiss spam; ordinary users can't delete others' requests.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.mood_review_requests (board) values ('{"pins":[{"id":"spam"}]}');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.mood_review_requests where board = '{"pins":[{"id":"spam"}]}'::jsonb;
reset role;
select pg_temp.check((select count(*) from public.mood_review_requests where board = '{"pins":[{"id":"spam"}]}'::jsonb) = 1, 'a user cannot delete someone else''s request');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
delete from public.mood_review_requests where board = '{"pins":[{"id":"spam"}]}'::jsonb;
reset role;
select pg_temp.check((select count(*) from public.mood_review_requests where board = '{"pins":[{"id":"spam"}]}'::jsonb) = 0, 'a verified curator can dismiss a request');

-- ── Boards ───────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.mood_boards (id, kind, name, data) values ('b1', 'board', 'SP28 Final', '{"pins":[]}')
  on conflict (user_id, id) do update set data = excluded.data;
insert into public.mood_boards (id, kind, name, data) values ('b1', 'board', 'SP28 Final', '{"pins":[1]}')
  on conflict (user_id, id) do update set data = excluded.data;
select pg_temp.check((select data from public.mood_boards where id = 'b1') = '{"pins":[1]}', 'a user upserts their own board');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.mood_boards) = 0, 'another user cannot read it');
-- Same client id, different user: a separate row, never an overwrite of A's.
insert into public.mood_boards (id, kind, name, data) values ('b1', 'board', 'Mine', '{}')
  on conflict (user_id, id) do update set data = excluded.data;
update public.mood_boards set name = 'pwned' where id = 'b1';
delete from public.mood_boards where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.must_fail($$insert into public.mood_boards (user_id, id, kind, data) values ('00000000-0000-0000-0000-00000000000a', 'b2', 'board', '{}')$$, 'writing a board into someone else''s account');
reset role;
select pg_temp.check((select name from public.mood_boards where id = 'b1' and user_id = '00000000-0000-0000-0000-00000000000a') = 'SP28 Final', 'another user cannot rename or delete it');

-- The security-definer helper is not in an API-exposed schema.
select pg_temp.check(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mood_is_curator'), 'no security-definer helper in the public schema');

\echo 'ALL RLS TESTS PASSED'
