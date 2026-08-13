-- ════════════════════════════════════════════════════════════════════════════
-- 0007 — an account can delete itself
--
-- The privacy notice has always promised erasure on request, `docs/ADMIN.md`
-- has always had the SQL, and there has never been a button. "Message the club
-- on WhatsApp and wait" is a promise kept by a volunteer remembering to run a
-- statement.
--
-- ⚠️ THIS SITE HAS NO SERVER. Deleting an `auth.users` row needs privileges the
-- browser must never hold, so the only honest mechanism on a static host is a
-- SECURITY DEFINER function that deletes exactly one row: the caller's own.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- delete_own_account() — no arguments, and that is the whole security design
--
-- ⚠️ IT TAKES NO TARGET, AND MUST NEVER TAKE ONE. `graduate_child(child,
-- new_account)` is service_role-only precisely because it names its victim;
-- this one is callable by every signed-in account, so the id it acts on can
-- only ever come from `auth.uid()`. A `delete_account(target uuid)` with an
-- ownership check inside would be one refactor away from a function that
-- deletes anybody — the parameter list is the guarantee, not the body.
--
-- ⚠️ NULL auth.uid() RAISES RATHER THAN DELETING. In the SQL editor, in a cron
-- job, or from service_role, `auth.uid()` is NULL — and `delete from
-- auth.users where id = null` deletes nothing, which is safe but silent. It
-- raises instead, so a caller that thought it was signed in is told.
--
-- ⚠️ SECURITY DEFINER with a pinned `search_path`, same rule as `is_staff()`
-- and `owns_child()`: without it a temp schema on the caller's search path can
-- shadow `auth.users`.
--
-- The cascade does the rest, and it is the cascade that IS the erasure right:
--   auth.users → profiles → child_profiles → exercise_progress
--                                          → game_results
--                                          → attendance
--                                          → point_awards
--                        → lesson_progress (deprecated 0001 table, on profile)
-- `tests/e2e/helpers/purge.ts` walks that whole chain on every suite run.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'delete_own_account: no authenticated caller';
  end if;

  delete from auth.users where id = caller;

  if not found then
    raise exception 'delete_own_account: no such user %', caller;
  end if;
end;
$$;

comment on function public.delete_own_account() is
  'Erase the CALLING account and everything that hangs off it, by cascade. '
  'Takes no target: the id can only come from auth.uid(). Nothing is retained '
  'and nothing is anonymised — there is no statistics table to anonymise into.';

-- ⚠️ `authenticated` ONLY. `anon` holds no session, so `auth.uid()` would be
-- NULL and the function would raise — but an anon EXECUTE grant on a function
-- that deletes from `auth.users` is the kind of thing that stops being safe the
-- moment somebody adds a parameter. Revoke first: `create or replace` keeps the
-- grants a previous definition had.
revoke all on function public.delete_own_account() from public, anon, authenticated;
grant execute on function public.delete_own_account() to authenticated;

-- ⚠️ NOT GRANTED TO service_role, AND THAT IS NOT AN OVERSIGHT. service_role has
-- no `auth.uid()`, so it could only ever hit the exception. An operator erasing
-- somebody else's account uses the statement in `docs/ADMIN.md`, which is
-- deliberately a different, deliberate act.
