-- ════════════════════════════════════════════════════════════════════════════
-- 0009 — first-run onboarding, and admin account hygiene
--
-- Accounts are about to be switched on for real families. Three gaps close
-- here, and none of them is a new capability for a student:
--
--   1. `profiles.onboarded_at` — the record that a parent has been guided once.
--   2. `admin_list_accounts()` — an admin can SEE who has signed up. `auth.users`
--      is not readable by `authenticated` at all, so this needs a function.
--   3. `admin_delete_account()` + `account_deletions` — an admin can REMOVE a
--      junk sign-up, and the removal is auditable.
--
-- ⚠️ NEW TABLE, SO THE FOUR-LINE CHECKLIST APPLIES — plus step 0, which 0008
-- added: `revoke all … from anon, authenticated` BEFORE granting, or the
-- project's default privileges hand `anon` the whole set on `create table`.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. `onboarded_at` — SERVER-SIDE, AND THAT IS THE POINT
--
-- "Shown once and never again" is a claim about a PERSON, not about a browser.
-- Kept in `localStorage` it would be a claim about a device: a parent who signs
-- up on a phone and later opens the site on the family tablet would be walked
-- through naming a child who is already named. The account is the only place
-- that knows.
--
-- ⚠️ NULL MEANS "NEVER GUIDED", AND IT IS SET BY BOTH OUTCOMES — completing the
-- screen and dismissing it. The column deliberately does not record WHICH: a
-- parent who skipped has made a choice, and re-asking them because we wrote
-- down that they said no is the behaviour this column exists to prevent.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists onboarded_at timestamptz;

comment on column public.profiles.onboarded_at is
  'When the first-run onboarding was completed OR dismissed. Null means never '
  'guided. Deliberately does not record which of the two — see migration 0009.';

-- ⚠️ ADDITIVE, AND THE COLUMN LIST IS THE SECURITY. 0001 grants
-- `update (display_name, locale)` and nothing else, which is what actually
-- stops a client writing `role` (RLS operates on ROWS and would happily allow
-- it). This adds exactly one column to that list. ⚠️ A future session must not
-- "tidy" these into `grant update on public.profiles` — that single edit hands
-- every reader their own `role` column.
grant update (onboarded_at) on public.profiles to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. account_deletions — WHAT AN AUDIT MAY HOLD WHEN ERASURE IS ABSOLUTE
--
-- ⚠️ THIS TABLE RECORDS THE ADMINISTRATOR'S ACTION, NOT THE DELETED PERSON.
-- There is no target id, no email, no display name and no counts. That is a
-- deliberate reading of Critical Feature 51 — "nothing is retained: no
-- statistics, no archive, no anonymised copy" — which was written for
-- self-service erasure and binds just as hard when a volunteer presses the
-- button instead of the parent. An "anonymised" reference to somebody who
-- exercised their erasure right is exactly the copy CF51 forbids.
--
-- What survives is therefore: an admin deleted an account, at this time, for
-- this stated reason. That is enough to notice twenty deletions nobody
-- authorised, which is what an audit is for here. It is NOT enough to restore
-- anything, and nothing on this site is.
--
-- ⚠️ IF A FULLER TRAIL IS EVER WANTED, IT IS A PRIVACY DECISION AND NOT A
-- SCHEMA ONE. Recorded in BACKLOG rather than left as a column somebody adds
-- because it seemed useful.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  -- Null once the acting admin's own account is gone. The FK is `set null`
  -- rather than `cascade`: an admin leaving must not erase the record that
  -- other accounts were removed.
  deleted_by uuid references public.profiles (id) on delete set null,
  -- Mirrored by the client so a bad reason fails before a round trip; this is
  -- the copy that actually refuses. Same arrangement as `point_awards`.
  reason text not null check (length(btrim(reason)) >= 3)
);

comment on table public.account_deletions is
  'Audit of ADMIN-initiated account deletions. Deliberately holds no reference '
  'to the deleted account — see migration 0009 and Critical Feature 51.';

-- ⚠️ STEP 0 — before any grant. See 0008: the project's default privileges
-- have already handed `anon` the full set by the time this line is reached.
revoke all on public.account_deletions from anon, authenticated;

alter table public.account_deletions enable row level security;

-- Admins read it. Nobody writes it from a client at all: the only INSERT is
-- inside `admin_delete_account()`, which runs as owner.
create policy account_deletions_select_admin on public.account_deletions
  for select using (public.is_admin_direct());

grant select on public.account_deletions to authenticated;

-- ⚠️ STEP 4, FORGOTTEN TWICE BEFORE. Default privileges do NOT hand this over.
grant select, insert, update, delete on public.account_deletions to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. admin_list_accounts() — seeing the sign-ups
--
-- ⚠️ A FUNCTION BECAUSE `auth.users` IS NOT REACHABLE. `authenticated` holds no
-- privilege on the `auth` schema and must not be given one — the email address
-- and the confirmation state live there, and a grant would expose them to every
-- signed-in reader with RLS nowhere in the picture.
--
-- ⚠️ IT RAISES RATHER THAN RETURNING NOTHING. A non-admin getting an empty list
-- is indistinguishable from a club with no members, and the UI would show
-- "aucun compte" to a prof who is simply not allowed. Fail loudly, in the one
-- direction where the caller needs to tell the two apart.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_accounts()
returns table (
  account_id uuid,
  email text,
  created_at timestamptz,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  display_name text,
  role text,
  children integer,
  solved integer
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin_direct() then
    raise exception 'admin_list_accounts is reserved to administrators';
  end if;

  return query
    select
      u.id,
      u.email::text,
      u.created_at,
      -- `email_confirmed_at`, not the generated `confirmed_at`: the generated
      -- column folds in phone confirmation, which this project never uses and
      -- which would read as "confirmed" for a state that cannot occur here.
      u.email_confirmed_at,
      u.last_sign_in_at,
      p.display_name,
      p.role,
      (select count(*)::int from public.child_profiles c where c.account_id = u.id),
      (select count(*)::int
         from public.exercise_progress e
         join public.child_profiles c2 on c2.id = e.child_id
        where c2.account_id = u.id and e.solved)
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_accounts() from public, anon, authenticated;
grant execute on function public.admin_list_accounts() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. admin_delete_account() — removing a junk sign-up
--
-- ⚠️⚠️ THIS TAKES A TARGET AND `delete_own_account()` MUST NEVER GROW ONE.
--
-- Critical Feature 51 says the parameter list of `delete_own_account()` IS its
-- security design, and warns in as many words that "a `delete_account(target
-- uuid)` with an ownership check inside is one refactor away from deleting
-- anybody". That warning is about THAT function. This is a second, differently
-- named function for a different actor, and the two must stay apart:
--
--   * `delete_own_account()`  — no argument, `authenticated`, any reader.
--   * `admin_delete_account()` — a target, `authenticated`, ADMINS ONLY, and it
--     refuses `auth.uid()`.
--
-- ⚠️ REFUSING THE CALLER'S OWN ID IS NOT A COURTESY. It is what keeps the
-- no-target rule true: an admin erasing themselves has exactly one route, the
-- zero-argument function, with the typed-word confirmation in front of it. If
-- this function accepted `auth.uid()` it would be a second, weaker path to the
-- same irreversible act.
--
-- ⚠️ `is_admin_direct()`, NOT `is_staff()`. A prof marks a register; removing a
-- family's account is not the same class of act, and profs already hold SELECT
-- on children and write on none of them.
--
-- The delete is on `auth.users`, which is where the erasure chain starts:
-- users → profiles → child_profiles → progress, games, attendance, awards, all
-- `on delete cascade`. Deleting the profile alone would leave the auth user and
-- would not honour the right this implements.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_delete_account(target uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin_direct() then
    raise exception 'admin_delete_account is reserved to administrators';
  end if;

  if target is null then
    raise exception 'a target account is required';
  end if;

  if target = auth.uid() then
    raise exception 'use delete_own_account() to erase your own account';
  end if;

  if length(btrim(coalesce(reason, ''))) < 3 then
    raise exception 'a reason is required';
  end if;

  -- ⚠️ THE AUDIT ROW IS WRITTEN FIRST, AND IT NAMES NOBODY. If the delete then
  -- fails the transaction takes the row with it, so the log cannot claim a
  -- deletion that did not happen.
  insert into public.account_deletions (deleted_by, reason)
  values (auth.uid(), btrim(reason));

  delete from auth.users where id = target;
end;
$$;

revoke all on function public.admin_delete_account(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_account(uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — after applying, against the catalog. See docs/reference/supabase.md.
--
--   -- `authenticated` may write exactly three columns of `profiles`.
--   select column_name from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles'
--      and grantee='authenticated' and privilege_type='UPDATE';
--   -- → display_name, locale, onboarded_at   (⚠️ NEVER `role`)
--
--   -- `anon` still holds exactly one grant in the whole schema.
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='public' and grantee='anon';
--   -- → sessions / SELECT, and nothing else
--
--   -- Both delete functions exist, and only one of them takes a target.
--   select proname, pronargs from pg_proc p
--     join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname like '%delete%account%';
--   -- → delete_own_account 0, admin_delete_account 2
-- ────────────────────────────────────────────────────────────────────────────
