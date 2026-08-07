-- ============================================================================
-- 0002 — restore service_role privileges, and give it a sanctioned way to set
--        a role.
--
-- WHY THIS EXISTS
--
-- Migration 0001 did this, to stop a browser from promoting itself:
--
--     revoke all on public.profiles from anon, authenticated;
--     grant select on public.profiles to authenticated;
--     grant update (display_name, locale) on public.profiles to authenticated;
--
-- That achieved its goal, and took something else with it. Supabase's default
-- privileges hand `service_role` full DML on new tables in `public`; the
-- explicit grant/revoke block above replaced that arrangement, and every table
-- in this schema ended up with `service_role` holding only REFERENCES, TRIGGER
-- and TRUNCATE — no SELECT, INSERT, UPDATE or DELETE.
--
-- Nothing in the browser noticed, because the browser is `authenticated` and
-- its grants are correct. It surfaced the first time a trusted caller tried to
-- work: seeding the test project failed with
--
--     permission denied for table profiles
--
-- and the e2e purge and admin helpers would have failed the same way.
--
-- ⚠️ This is NOT a security relaxation. `service_role` bypasses RLS by design,
-- never ships to a browser (it is not `PUBLIC_`-prefixed and lives only in
-- `.env.test`), and is the credential Supabase's own admin API already uses.
-- Restoring its DML restores the intended arrangement.
-- ============================================================================

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.exercise_progress to service_role;
grant select, insert, update, delete on public.lesson_progress to service_role;
grant select, insert, update, delete on public.sessions to service_role;
grant select, insert, update, delete on public.attendance to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- A sanctioned path for setting a role.
--
-- Grants alone are not enough: `profiles_forbid_role_self_change` fires for
-- EVERY caller and permits a role change only when `is_admin_direct()` is true,
-- which reads `auth.uid()`. A service-role call through PostgREST has no
-- end-user session, so `auth.uid()` is NULL and the trigger refuses — the same
-- mechanism that makes a plain UPDATE fail in the SQL editor (docs/ADMIN.md).
--
-- Rather than weaken the trigger for service_role (which would remove a genuine
-- layer of defence if that key ever leaked), the guard now honours a
-- TRANSACTION-LOCAL flag that only this function sets. The escape hatch is
-- therefore named, auditable, and impossible to trip accidentally: a leaked
-- service key still cannot change a role by writing to the table directly.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.forbid_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Set only by admin_set_role(), and only for the life of one transaction.
  if coalesce(current_setting('mcc.allow_role_change', true), '') = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin_direct() then
    raise exception 'role may not be changed by the client (see docs/ADMIN.md)';
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new_role not in ('admin', 'prof', 'eleve') then
    raise exception 'invalid role: %', new_role;
  end if;

  -- Transaction-local: it cannot leak into another statement or session.
  perform set_config('mcc.allow_role_change', 'on', true);
  update public.profiles set role = new_role where id = target_id;
  perform set_config('mcc.allow_role_change', 'off', true);
end;
$$;

-- ⚠️ Reachable by the trusted backend role ONLY. `authenticated` must never be
-- able to call this — it would be a one-line privilege escalation.
revoke all on function public.admin_set_role(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_role(uuid, text) to service_role;

comment on function public.admin_set_role(uuid, text) is
  'Sets a profile role from a trusted backend caller. service_role only; humans use docs/ADMIN.md.';
