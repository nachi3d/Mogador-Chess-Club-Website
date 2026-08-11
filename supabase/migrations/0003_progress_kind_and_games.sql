-- ============================================================================
-- 0003 — what E3 writes that the database did not hold
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. If something here is
-- wrong, the fix is 0004.
--
-- ⚠️ ALL SECURITY IS RLS, exactly as in 0001. The site is static and the anon
-- key ships to every browser by design; every policy below is a real boundary
-- and nothing in the client is.
--
-- ────────────────────────────────────────────────────────────────────────────
-- THE SCHEMA DECISION: A `kind` DISCRIMINATOR, NOT THREE TABLES.
--
-- The local store (`mcc:progress:v1`) has exactly ONE map for every judged
-- board on the site — a standalone exercise, a tutorial step and a lesson board
-- all produce the same record, `{solved, attempts, hintUsed, solvedAt}`, keyed
-- by a namespaced slug (`mat-du-couloir`, `tutorial:la-tour`,
-- `lesson:<course>:<lesson>:<index>`).
--
-- So one local map maps to one table, and the sync is a MIRROR rather than a
-- translation. Three tables would mean:
--   - the same four columns declared three times, free to drift apart;
--   - a merge that branches on namespace, which is exactly where merges go
--     wrong — and this merge runs once, on real student work, and cannot be
--     re-run to fix a mistake;
--   - a client that has to know which table a slug belongs in, i.e. the site's
--     naming convention leaking into the database.
--
-- `kind` is stored rather than derived in SQL so that a future teacher
-- dashboard (v2-S4) can ask "how many tutorial steps has this student done"
-- without the database knowing anything about slug prefixes. The CLIENT
-- classifies, because the client owns the convention.
--
-- ⚠️ `lesson_progress` FROM 0001 IS DEPRECATED AND DELIBERATELY NOT DROPPED.
-- Two reasons. It cannot hold what a lesson board needs — it has
-- `completed_at` and nothing else, no attempts and no hint flag — so writing
-- lesson boards into it would mean altering it into a copy of
-- `exercise_progress`. And "this lesson is complete" is DERIVED from its
-- boards, exactly as points are derived from solves; storing it would be a
-- second source of truth that can disagree with the first. Dropping it is
-- irreversible and buys nothing, so it stays, empty and commented.
--
-- ⚠️ POINTS AND RANKS ARE STILL NOT STORED, and there is no column here for
-- them. E3's rule holds: a stored balance is a number a student can type into a
-- console. The database records WHAT WAS DONE; the total is recomputed from it.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. exercise_progress gains `kind`
--
-- `default 'exercise'` is what makes this safe on a table that already has
-- rows: every existing row is a standalone exercise, because that is all the
-- client ever wrote before E3.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.exercise_progress
  add column if not exists kind text not null default 'exercise'
    check (kind in ('exercise', 'tutorial', 'lesson'));

comment on column public.exercise_progress.kind is
  'Which surface the slug belongs to. Classified by the CLIENT from the slug '
  'namespace — the database does not know the naming convention. Lets v2-S4 '
  'count tutorial steps without parsing slugs.';

comment on table public.lesson_progress is
  'DEPRECATED as of 0003 and intentionally unused. A lesson''s completion is '
  'DERIVED from its boards, which live in exercise_progress with kind = '
  '''lesson''. Kept rather than dropped: dropping is irreversible and buys '
  'nothing. Do not write to it.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. game_results — one row per game, not a counter
--
-- ⚠️ ROWS, NOT TOTALS, AND THE MERGE IS WHY. The local store keeps aggregate
-- counters per level (`{wins, draws, losses}`), and two counters cannot be
-- merged correctly: a guest with 3 wins and a cloud with 2 might mean 5 games
-- or 3, and neither `max` nor `sum` is right in both cases. Rows with ids can
-- be unioned, which is the only operation that is idempotent — and this merge
-- must be safe to run twice.
--
-- ⚠️ `id` IS CLIENT-GENERATED AND THAT IS FINE. It is not a security boundary:
-- RLS pins `profile_id` to `auth.uid()`, so the worst a hostile client can do
-- with an id is collide with its own row. The primary key is (profile_id, id)
-- for exactly that reason — one student's ids can never touch another's.
--
-- ⚠️ NO SCORE COLUMN. Points are derived from wins by `points.ts`; losses and
-- draws are recorded and read by no scoring rule at all (a teaching tool must
-- not make losing expensive). Keeping the raw result rather than a score is
-- also what makes a future server-side recomputation possible with no
-- migration — see the anti-cheat note in CLAUDE.md.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.game_results (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Client-generated. `legacy:<level>:<outcome>:<n>` for games that existed as
  -- counters before this migration; a UUID for everything since.
  id text not null,
  -- Free text for the same reason slugs are: engine levels live in git, and a
  -- renamed level must not start failing writes in production.
  level text not null,
  outcome text not null check (outcome in ('win', 'draw', 'loss')),
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (profile_id, id)
);

comment on table public.game_results is
  'One row per game against the engine. Rows rather than counters so the '
  'first-sign-in merge can UNION by id and stay idempotent.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS — the same shape as exercise_progress in 0001
--
-- Owner does everything to their own rows; staff may READ. Staff cannot write
-- a student's progress: a teacher correcting a record by hand would be
-- indistinguishable from a student faking one, and neither belongs here.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.game_results enable row level security;

create policy game_results_own on public.game_results
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy game_results_select_staff on public.game_results
  for select using (public.is_staff());

grant select, insert, update, delete on public.game_results to authenticated;

-- ⚠️ AND `service_role`, WHICH IS THE TRAP 0002 EXISTS FOR — walked into again
-- while writing this migration. Default privileges in this project do NOT hand
-- `service_role` DML on a NEW table in `public`, so every new table has to say
-- so explicitly or the trusted callers (the e2e suite's admin client, any
-- future back-office job) get `42501 permission denied` on a table whose RLS is
-- perfect. It cost a red test run here, exactly as 0002 records it costing one
-- before. NOT a security relaxation: `service_role` bypasses RLS by design and
-- never reaches a browser.
grant select, insert, update, delete on public.game_results to service_role;

-- ⚠️ NOTHING IS GRANTED TO `anon`. A guest never writes progress anywhere but
-- their own device, which is the whole of the guest-first promise.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
--
-- Both queries the client actually makes: "everything for this profile" on
-- sign-in, and (v2-S4) "this profile's games by level".
-- ────────────────────────────────────────────────────────────────────────────
create index if not exists game_results_profile_idx on public.game_results (profile_id);
create index if not exists game_results_profile_level_idx
  on public.game_results (profile_id, level);
create index if not exists exercise_progress_profile_kind_idx
  on public.exercise_progress (profile_id, kind);
