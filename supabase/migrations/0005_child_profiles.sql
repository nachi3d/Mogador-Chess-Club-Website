-- ============================================================================
-- 0005 — child profiles: the learner stops being the login
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. A fix is 0006.
--
-- Decision: BACKLOG → "Modèle parent + profils enfants" (taken by Seàn).
-- A parent holds the account; each child is a profile beneath it with no
-- credentials, carrying progress, points, rank and attendance.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY THIS HAS TO HAPPEN BEFORE ACCOUNTS GO LIVE
--
-- Until now `profiles.id` IS `auth.users.id`: identity and person are one row,
-- so a child with no login has nowhere to live. Every account opened before
-- this change is keyed to a credential with real progress hanging off it, and
-- moving it afterwards is a data rescue rather than a schema change.
--
-- ⚠️ ONE CODE PATH, NOT TWO. An autonomous teenager is not a special case: they
-- are an account holding exactly ONE child profile. Every learner in the system
-- is a `child_profiles` row, always, so nothing downstream ever branches on
-- "is this a family or a solo student".
--
-- ⚠️ ACTORS STAY ON `profiles`. `sessions.created_by`, `attendance.marked_by`
-- and `point_awards.awarded_by` point at the ACCOUNT and are deliberately NOT
-- moved: a prof who marks a register is a person with a login, not a learner.
-- Mixing the two is what makes a schema impossible to reason about later.
-- ────────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- 1. child_profiles
--
-- ⚠️ ITS OWN PRIMARY KEY, AND A NULLABLE LINK TO THE ACCOUNT. This is the whole
-- point of the migration and the thing that makes graduation cheap:
--
--   * own `id`      — progress attaches to the PERSON, so the person can move
--                     between accounts without any of it being rewritten;
--   * `account_id`  — who holds them RIGHT NOW. Graduating a sixteen-year-old
--                     into their own account is an UPDATE of this one column.
--   * nullable      — a child can exist between accounts, and (later) a prof
--                     can create one for a student who has never signed up.
--                     See "guest attendance" in BACKLOG.
--
-- If graduating a profile ever requires copying rows between tables, the shape
-- is wrong. That is the backlog's own test, and `graduate_child()` below is the
-- proof that this shape passes it.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.profiles (id) on delete cascade,
  display_name text not null,
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  created_at timestamptz not null default now()
);

comment on table public.child_profiles is
  'A learner. Has no credentials of its own: `account_id` is the account that '
  'holds it. An autonomous teenager is an account holding exactly one row here '
  '— one code path, never two.';
comment on column public.child_profiles.account_id is
  'Nullable, and an UPDATE of this column is the whole of graduation.';

create index if not exists child_profiles_account_idx
  on public.child_profiles (account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. owns_child() — the ownership test every learner policy uses
--
-- ⚠️ SECURITY DEFINER with a pinned search_path, for the same reason
-- `is_staff()` is: a policy on `exercise_progress` that reads `child_profiles`
-- would otherwise apply that table's RLS inside the check, which is both slower
-- and a second place for the rule to be wrong. One function, one definition of
-- "this row is mine".
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.owns_child(child uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.child_profiles
    where id = child and account_id = auth.uid()
  );
$$;

comment on function public.owns_child(uuid) is
  'True when the caller''s account holds this child profile. SECURITY DEFINER '
  'so learner policies do not re-enter child_profiles RLS.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. child_profiles RLS
--
-- A parent does everything to their own children. Staff read all — they need
-- the class list — and cannot write: a teacher renaming a child is
-- indistinguishable from a teacher inventing one.
--
-- ⚠️ A CHILD PROFILE IS NEVER A CALLER. It has no credentials, so there is no
-- "child reads their own row" policy and there must not be one; the account is
-- always the caller.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.child_profiles enable row level security;

create policy child_profiles_own on public.child_profiles
  for all using (auth.uid() = account_id) with check (auth.uid() = account_id);

create policy child_profiles_select_staff on public.child_profiles
  for select using (public.is_staff());

grant select, insert, update, delete on public.child_profiles to authenticated;
-- ⚠️ The line 0002 exists for and 0003 forgot. A 42501 from service_role is
-- always a missing grant — it never reaches a policy.
grant select, insert, update, delete on public.child_profiles to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Backfill — one child per existing learner
--
-- ⚠️ EVERY EXISTING ACCOUNT THAT HAS LEARNED ANYTHING BECOMES AN ACCOUNT
-- HOLDING ONE CHILD, which is exactly the solo-teenager shape. Staff accounts
-- with no learner data get no child profile: a prof is not a learner, and
-- inventing one for them would put them in the class list.
--
-- `display_name` falls back to 'Élève' rather than NULL — the column is NOT
-- NULL because a picker with a blank button is unusable, and a name the parent
-- can edit beats a constraint violation on a live migration.
--
-- ⚠️ NOT `on conflict do nothing`, WHICH WOULD BE A NO-OP HERE. There is no
-- unique constraint to conflict on, and there must not be one: a parent
-- legitimately holds several children. The guard is "this account has no child
-- yet", which is the actual condition — and it must never be replaced by a
-- UNIQUE index, or the second child in a family fails to insert.
--
-- The guard is belt-and-braces rather than a fix for an observed bug: the first
-- attempt at this file failed at the `drop column` in section 5 (2BP01) and the
-- CLI rolled the whole file back, so the retry backfilled exactly once.
-- Verified on the test project — four `eleve` accounts, four children, no
-- duplicates. Kept because a backfill that can be run twice safely costs one
-- `not exists` and removes a whole class of retry accident.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.child_profiles (account_id, display_name, locale)
select p.id, coalesce(nullif(btrim(p.display_name), ''), 'Élève'), p.locale
from public.profiles p
where not exists (select 1 from public.child_profiles c where c.account_id = p.id)
  and (
       p.role = 'eleve'
    or exists (select 1 from public.exercise_progress e where e.profile_id = p.id)
    or exists (select 1 from public.game_results g where g.profile_id = p.id)
    or exists (select 1 from public.attendance a where a.profile_id = p.id)
    or exists (select 1 from public.point_awards w where w.profile_id = p.id)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Repoint the learner tables
--
-- ⚠️ THE PRIMARY KEYS MOVE WITH THE COLUMN. `exercise_progress` was keyed
-- (profile_id, exercise_slug); dropping the column without rebuilding the key
-- would leave the table with no uniqueness at all and let the sync layer insert
-- a second row for the same board on every write.
--
-- ⚠️ AND THE POLICIES COME OFF FIRST. `drop column` refuses with 2BP01 —
-- "cannot drop column profile_id because other objects depend on it" — while
-- any policy still names it. Postgres will not silently loosen a policy, which
-- is the right behaviour and the reason the order below is not cosmetic. The
-- replacements are created in section 6, after the columns exist.
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists exercise_progress_own on public.exercise_progress;
drop policy if exists game_results_own on public.game_results;
drop policy if exists attendance_select_own on public.attendance;
drop policy if exists point_awards_select_own on public.point_awards;


-- exercise_progress ---------------------------------------------------------
alter table public.exercise_progress add column if not exists child_id uuid;
update public.exercise_progress e
set child_id = c.id
from public.child_profiles c
where c.account_id = e.profile_id and e.child_id is null;
delete from public.exercise_progress where child_id is null;
alter table public.exercise_progress
  alter column child_id set not null,
  add constraint exercise_progress_child_fk
    foreign key (child_id) references public.child_profiles (id) on delete cascade;
alter table public.exercise_progress drop constraint exercise_progress_pkey;
alter table public.exercise_progress
  add constraint exercise_progress_pkey primary key (child_id, exercise_slug);
alter table public.exercise_progress drop column profile_id;

-- game_results --------------------------------------------------------------
alter table public.game_results add column if not exists child_id uuid;
update public.game_results g
set child_id = c.id
from public.child_profiles c
where c.account_id = g.profile_id and g.child_id is null;
delete from public.game_results where child_id is null;
alter table public.game_results
  alter column child_id set not null,
  add constraint game_results_child_fk
    foreign key (child_id) references public.child_profiles (id) on delete cascade;
alter table public.game_results drop constraint game_results_pkey;
alter table public.game_results
  add constraint game_results_pkey primary key (child_id, id);
alter table public.game_results drop column profile_id;

-- attendance ----------------------------------------------------------------
alter table public.attendance add column if not exists child_id uuid;
update public.attendance a
set child_id = c.id
from public.child_profiles c
where c.account_id = a.profile_id and a.child_id is null;
delete from public.attendance where child_id is null;
alter table public.attendance
  alter column child_id set not null,
  add constraint attendance_child_fk
    foreign key (child_id) references public.child_profiles (id) on delete cascade;
alter table public.attendance drop constraint attendance_pkey;
alter table public.attendance
  add constraint attendance_pkey primary key (session_id, child_id);
alter table public.attendance drop column profile_id;

-- point_awards --------------------------------------------------------------
alter table public.point_awards add column if not exists child_id uuid;
update public.point_awards w
set child_id = c.id
from public.child_profiles c
where c.account_id = w.profile_id and w.child_id is null;
delete from public.point_awards where child_id is null;
alter table public.point_awards
  alter column child_id set not null,
  add constraint point_awards_child_fk
    foreign key (child_id) references public.child_profiles (id) on delete cascade;
alter table public.point_awards drop column profile_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Policies follow the column
--
-- Every "this row is mine" test becomes `owns_child()`. Staff policies are
-- unchanged — `is_staff()` never cared which column held the owner. The old
-- owner policies were dropped at the top of section 5; these are their
-- replacements.
-- ────────────────────────────────────────────────────────────────────────────
create policy exercise_progress_own on public.exercise_progress
  for all using (public.owns_child(child_id)) with check (public.owns_child(child_id));

create policy game_results_own on public.game_results
  for all using (public.owns_child(child_id)) with check (public.owns_child(child_id));

-- ⚠️ Attendance stays READ-ONLY for the family. A parent may see their child's
-- register and must not write it, exactly as the student could not before.
create policy attendance_select_own on public.attendance
  for select using (public.owns_child(child_id));

-- ⚠️ And point_awards stays read-only for the family, which is the whole
-- anti-cheat story for teacher awards: a parent must no more be able to mint
-- points for their child than the child could for themselves.
create policy point_awards_select_own on public.point_awards
  for select using (public.owns_child(child_id));

-- ⚠️ DROPPING A COLUMN DROPS EVERY INDEX ON IT, SILENTLY. The five below are
-- the 0001/0003/0004 indexes rebuilt on `child_id` — including the two
-- COMPOSITE ones, which are the queries the client actually makes ("everything
-- for this child on sign-in", "this child's games by level"). Leaving them out
-- is a performance regression that nothing would report.
create index if not exists exercise_progress_child_idx
  on public.exercise_progress (child_id);
create index if not exists exercise_progress_child_kind_idx
  on public.exercise_progress (child_id, kind);
create index if not exists game_results_child_idx on public.game_results (child_id);
create index if not exists game_results_child_level_idx
  on public.game_results (child_id, level);
create index if not exists attendance_child_idx on public.attendance (child_id);
create index if not exists point_awards_child_idx
  on public.point_awards (child_id, awarded_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. graduate_child() — the proof that the shape is right
--
-- ⚠️ ONE UPDATE, ONE COLUMN, NO ROWS COPIED. That is the backlog's own test for
-- this design: "if graduating requires copying rows between tables, the shape
-- is wrong". Progress, games, attendance and awards all reference the CHILD, so
-- none of them is touched and none of them can be lost in the move.
--
-- SECURITY DEFINER and service_role-only, like `admin_set_role`: moving a
-- learner between accounts is an administrative act with obvious potential for
-- abuse if a parent could point someone else's child at their own account.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.graduate_child(child uuid, new_account uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.profiles where id = new_account) then
    raise exception 'no such account: %', new_account;
  end if;
  update public.child_profiles set account_id = new_account where id = child;
  if not found then
    raise exception 'no such child profile: %', child;
  end if;
end;
$$;

revoke all on function public.graduate_child(uuid, uuid) from public, anon, authenticated;
grant execute on function public.graduate_child(uuid, uuid) to service_role;

comment on function public.graduate_child(uuid, uuid) is
  'Move a child profile to another account. ONE FK update — progress, games, '
  'attendance and awards reference the child and are not touched.';
