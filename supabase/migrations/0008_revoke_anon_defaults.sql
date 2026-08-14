-- ════════════════════════════════════════════════════════════════════════════
-- 0008 — `anon` gets nothing, in the GRANTS and not only in effect
--
-- CLAUDE.md has said "⚠️ `anon` gets nothing — deliberate: a guest writes to
-- their own device only" since 0001. Auditing production's catalog on
-- 2026-08-14 found that false on **seven of the eight** public tables: `anon`
-- held `TRUNCATE`, `REFERENCES` and `TRIGGER` on `attendance`,
-- `child_profiles`, `exercise_progress`, `game_results`, `lesson_progress`,
-- `point_awards` and `sessions`.
--
-- ⚠️ NO MIGRATION GRANTED THEM. A Supabase project ships
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated;
--
-- so every `create table` hands `anon` the full set **before** the migration's
-- own `grant select …` line is reached. Adding a narrow grant does not narrow
-- anything — it is a no-op on top of a set that already contains it. `profiles`
-- is clean for one reason only: 0001 happens to write
-- `revoke all … from anon, authenticated` before granting. Nothing else did.
--
-- ⚠️ `TRUNCATE` IS NOT FILTERED BY ROW-LEVEL SECURITY. Every policy in this
-- schema is irrelevant to it. What has actually been preventing it is that
-- PostgREST exposes no verb that reaches `TRUNCATE` — so the site was never
-- exposed, and **reachability is not authorisation**. A privilege nobody can
-- currently use is still a privilege that is wrong to hold, and the next thing
-- to gain a database connection as `anon` inherits it.
--
-- Not an incident, therefore. Defence in depth, and making a documented
-- invariant true where it claims to be true.
--
-- ⚠️ THIS MIGRATION REMOVES ONLY. It creates nothing, so the new-table
-- checklist's `service_role` step does not apply here — but it is why that
-- checklist now opens with `revoke all … from anon, authenticated;` as step 0.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. THE SIX TABLES `anon` MUST NOT TOUCH AT ALL
--
-- Learner data and staff data. A signed-out visitor keeps progress on their own
-- device and has no business reaching any of it, which is the v2 architecture
-- decision, not a tightening of it.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on public.attendance        from anon;
revoke all on public.child_profiles    from anon;
revoke all on public.exercise_progress from anon;
revoke all on public.game_results      from anon;
revoke all on public.lesson_progress   from anon;
revoke all on public.point_awards      from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. `sessions` — REVOKE EVERYTHING, THEN GIVE BACK THE ONE GRANT THAT IS REAL
--
-- ⚠️ THE ORDER IS LOAD-BEARING AND THE `grant` IS NOT OPTIONAL. `anon` holding
-- `select` on `sessions` is what `scripts/fetch-agenda.mjs` uses to bake the
-- public agenda at build time — with the anon key, in Node, deliberately not the
-- service role. A bare `revoke all` here would leave every future build reading
-- zero rows and `/agenda/` rendering "Aucune séance programmée", which is
-- precisely the production failure this project spent 2026-08-14 diagnosing.
--
-- Which rows `anon` may see is still decided by `sessions_select_public`
-- (published and cancelled, never draft — migration 0006). This changes the
-- table privilege, not the policy.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on public.sessions from anon;
grant select on public.sessions to anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. AND STOP THE NEXT TABLE INHERITING THE SAME SET
--
-- Sections 1 and 2 sweep what exists. This is the half that stops it coming
-- back: without it, `create table` in a future migration silently re-grants
-- everything to `anon` and the sweep has to be remembered again — and "remember
-- to write the revoke" is exactly the discipline that failed seven times here.
--
-- ⚠️ `authenticated` IS DELIBERATELY UNTOUCHED. It legitimately holds DML on
-- most of these tables and is confined by RLS, which is the design. Its own
-- inherited `TRUNCATE` is a separate question with a different answer, recorded
-- in BACKLOG rather than bundled into a migration about `anon`.
--
-- ⚠️ `alter default privileges` WITHOUT `for role` APPLIES TO THE ROLE RUNNING
-- IT. Supabase's defaults belong to `postgres`, and migrations run as
-- `postgres`, so this cancels the right entry. Run as anything else it creates
-- a second, inert entry and changes nothing — silently. Verify with the query
-- below rather than assuming; a default-privilege statement that missed is
-- indistinguishable from one that worked until the next table is created.
-- ────────────────────────────────────────────────────────────────────────────
alter default privileges in schema public revoke all on tables from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run after applying, against the catalog, not this file.
--
--   -- `anon` must appear exactly once, on `sessions`, holding SELECT alone.
--   select table_name, grantee,
--          string_agg(privilege_type, ',' order by privilege_type) as privs
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'anon'
--    group by 1, 2 order by 1;
--
--   -- ⚠️ DO NOT AUDIT SECTION 3 BY READING `pg_default_acl`. There are TWO
--   -- entries for tables in `public`: one owned by `supabase_admin` and one by
--   -- `postgres`. Only the second governs what a migration creates, and the
--   -- first still lists `anon` — correctly, and forever. Reading the table and
--   -- finding `anon=` there says nothing and looks alarming.
--   --
--   -- Exercise it instead. Verified this way on the test project 2026-08-14:
--   -- anon inherited NOTHING (authenticated and service_role still inherit
--   -- REFERENCES,TRIGGER,TRUNCATE, which is out of scope here).
--   create table public.zz_defpriv_probe (id int);
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'zz_defpriv_probe'
--    group by 1;                      -- `anon` must not appear at all
--   drop table public.zz_defpriv_probe;
--
--   -- And the agenda read must still work, which is the one thing this
--   -- migration could plausibly break:
--   --   curl "$PUBLIC_SUPABASE_URL/rest/v1/sessions?select=id,status" \
--   --     -H "apikey: $PUBLIC_SUPABASE_ANON_KEY"
--   -- must return the published rows, not `42501`.
-- ────────────────────────────────────────────────────────────────────────────
