-- ════════════════════════════════════════════════════════════════════════════
-- 0010 — who is this account for, and which profile is the holder's own
--
-- v0.13.0 asked a parent to name "the student". That question has a hidden
-- premise: that the account holder is NOT one of the students. For the club's
-- typical family it is false — a parent comes to the workshop with two children
-- and plays as well, earns their own points, and is penalised for being the one
-- who holds the account.
--
-- The welcome screen now asks the question directly, and two columns record the
-- answer:
--
--   1. `profiles.account_shape`  — what the holder SAID. Drives vocabulary.
--   2. `child_profiles.is_self`  — WHICH profile is the holder's own.
--
-- ⚠️ NEITHER IS A NEW KIND OF ACCOUNT, AND THAT IS THE POINT. Critical Feature
-- 40 stands untouched: the learner is a child profile, an autonomous teenager is
-- an account holding exactly one child, and there is still exactly ONE code path
-- for resolution. `is_self` marks a row; it does not branch one.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles.account_shape — THE ANSWER, AND NULL IS A REAL THIRD STATE
--
-- ⚠️ NULL MEANS "NEVER ANSWERED", not "no children". A skipped onboarding lands
-- here, and it must NOT be rewritten as one of the three: the whole reason
-- Critical Feature 54 forbids naming the relationship is that an account with
-- one child is the same object for a parent and for a teenager who signed up
-- alone. Guessing is exactly what that rule forbids — so an unanswered account
-- keeps the neutral, structure-naming copy it has always had.
--
-- ⚠️ AND IT IS THE ANSWER, NOT THE TRUTH. The effective vocabulary is derived
-- from this column AND the roster, in `src/lib/account-shape.ts`: a reader who
-- said "moi" and later adds a child reads as "both" without anybody rewriting
-- the column, because `is_self` is the load-bearing fact and this is only what
-- distinguishes "they told us: children" from "they never told us".
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists account_shape text;

-- Added separately and guarded, so re-running the file on a database that
-- already has the column does not fail on a duplicate constraint name.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_account_shape_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_shape_check
      check (account_shape is null or account_shape in ('self', 'children', 'both'));
  end if;
end
$$;

comment on column public.profiles.account_shape is
  'What the holder answered at first sign-in: self | children | both. NULL means '
  'never answered (skipped) and must not be guessed — see migration 0010 and '
  'Critical Feature 54.';

-- ⚠️ ADDITIVE TO 0001's COLUMN GRANT LIST, WHICH IS WHAT STOPS A CLIENT WRITING
-- `role`. RLS operates on ROWS and would happily allow a `role` update; the
-- column-level privilege is the actual mechanism. 0009 added `onboarded_at` to
-- this list for the same reason. ⚠️ A future session must NOT "tidy" these into
-- `grant update on public.profiles` — that single edit hands every reader their
-- own `role` column.
grant update (account_shape) on public.profiles to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. child_profiles.is_self — the holder's own player profile
--
-- ⚠️ A FLAG ON A ROW, NOT A SECOND TABLE AND NOT A SECOND CODE PATH. The
-- account holder who plays is a learner like any other: same progress rows, same
-- points, same attendance, same `child_profiles.id` as the FK target everywhere.
-- Critical Feature 40 says the LEARNER is a child profile, never the account —
-- giving the holder their own learner row is that rule being kept, not bent.
--
-- ⚠️ DEFAULT FALSE, so every existing row keeps its current meaning and no
-- backfill is needed. An account that never answers the question has no
-- `is_self` row, which reads as "we do not know" — the honest state.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.child_profiles
  add column if not exists is_self boolean not null default false;

comment on column public.child_profiles.is_self is
  'True for the ONE profile that belongs to the account holder themselves. '
  'False for everyone else. See migration 0010.';

-- ⚠️ AT MOST ONE PER ACCOUNT, ENFORCED HERE RATHER THAN IN THE CLIENT. The
-- welcome screen and the roster both write this flag, and "the holder's profile"
-- is singular by definition — two of them would make `holderProfile()` pick one
-- arbitrarily and the page would name a different person on different loads.
--
-- A PARTIAL index: only the true rows are constrained, so an account may hold
-- any number of ordinary children. `account_id` is nullable (graduation is one
-- FK update — Critical Feature 41), and Postgres allows repeated NULLs in a
-- unique index, so an orphaned row in flight never blocks another account.
create unique index if not exists child_profiles_one_self_idx
  on public.child_profiles (account_id)
  where is_self;

-- ⚠️ NO GRANT LINE HERE, AND THAT IS CHECKED RATHER THAN ASSUMED. 0005 grants
-- `select, insert, update, delete` on the whole of `child_profiles` to
-- `authenticated` and to `service_role` — table-level, not column-level — so a
-- new column is already covered. Contrast `profiles` above, which is
-- column-level precisely so that `role` is unreachable.

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — after applying, against the catalog. NEVER against
-- `supabase_migrations.schema_migrations`, which is not a record of what
-- production holds (see CLAUDE.md → Deployment).
--
--   -- The column exists and the check accepts exactly three values.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.profiles'::regclass and conname like '%account_shape%';
--
--   -- `authenticated` may write exactly FOUR columns of `profiles`.
--   select column_name from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles'
--      and grantee='authenticated' and privilege_type='UPDATE';
--   -- → display_name, locale, onboarded_at, account_shape   (⚠️ NEVER `role`)
--
--   -- One holder profile per account, at most.
--   select indexdef from pg_indexes
--    where schemaname='public' and indexname='child_profiles_one_self_idx';
-- ────────────────────────────────────────────────────────────────────────────
