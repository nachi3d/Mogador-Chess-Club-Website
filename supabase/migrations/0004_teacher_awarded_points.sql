-- ============================================================================
-- 0004 — teacher-awarded points
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. A fix is 0005.
--
-- Written against the migration checklist in CLAUDE.md: table, RLS on,
-- policies, grant to `authenticated`, GRANT TO `service_role`. That last line
-- has been forgotten twice (0002 exists to repair it; 0003 repeated it), and
-- RLS being correct does not make a table reachable.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS FOR. A prof awards points for what the software cannot see:
-- effort, turning up, helping another student, a good move played over the
-- board. E3 built the ledger to carry a second producer — `PointEntry` already
-- has `origin` and `source` — so this EXTENDS the producer rather than
-- migrating anything.
--
-- ⚠️ POINTS ARE STILL NOT STORED AS A BALANCE. This table records AWARDS, the
-- same way `exercise_progress` records solves: one row per thing that happened.
-- The total is still recomputed from the rows every time it is read. Nothing
-- here is a number a student could type into a console, and nothing here is a
-- number the client may send.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.point_awards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- ⚠️ POSITIVE AND BOUNDED. Not a typo guard — a policy. This site records
  -- losses and charges nothing for them, and a prof who could award -50 would
  -- turn the ledger into a disciplinary instrument. The upper bound is what
  -- stops a slipped keystroke minting a rank; 50 is a little under the whole
  -- tutorial (65), so no single award can outweigh the work.
  points integer not null check (points > 0 and points <= 50),

  -- ⚠️ REQUIRED, AND CHECKED IN THE DATABASE RATHER THAN THE FORM.
  -- Points that appear with no explanation destroy trust faster than no points
  -- at all: a student who cannot tell why a number moved learns that the number
  -- is arbitrary. A NOT NULL alone would accept ' ', so the check is on the
  -- trimmed length.
  reason text not null check (length(btrim(reason)) >= 3),

  -- Auditable: who, and when. `on delete set null` rather than cascade — a
  -- teacher leaving the club must not delete the students' points.
  awarded_by uuid references public.profiles (id) on delete set null,
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.point_awards is
  'Points awarded by a prof for what the software cannot see. One row per '
  'award, never a balance — the total stays derived, as in E3.';
comment on column public.point_awards.reason is
  'Required. Shown to the student. A point with no reason reads as arbitrary.';

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- ⚠️ A STUDENT MAY READ THEIRS AND WRITE NOTHING. This is the one table where
-- a client-side write would mint points directly, so the absence of a student
-- INSERT policy is the whole anti-cheat story for teacher awards: RLS refuses
-- it at the database, not the form.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.point_awards enable row level security;

create policy point_awards_select_own on public.point_awards
  for select using (auth.uid() = profile_id);

create policy point_awards_staff_all on public.point_awards
  for all using (public.is_staff()) with check (public.is_staff());

-- RLS is the boundary; the grant only opens the door to it, exactly as on
-- `attendance`. A student's INSERT is refused by the missing policy above.
grant select, insert, update, delete on public.point_awards to authenticated;

-- ⚠️ THE LINE THAT HAS BEEN FORGOTTEN TWICE. Default privileges here do not
-- give `service_role` DML on a new table, and a 42501 from service_role is
-- always a missing grant — it never reaches a policy at all.
grant select, insert, update, delete on public.point_awards to service_role;

-- ⚠️ Nothing to `anon`. A signed-out visitor has no points and no student to be.

create index if not exists point_awards_profile_idx
  on public.point_awards (profile_id, awarded_at desc);
