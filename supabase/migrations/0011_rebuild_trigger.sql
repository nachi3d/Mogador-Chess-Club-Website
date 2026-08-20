-- ════════════════════════════════════════════════════════════════════════════
-- 0011 — a session change asks Cloudflare to rebuild the site
--
-- `/agenda/` is BAKED AT BUILD TIME and that is forced: static output with no
-- adapter, Critical Feature 9 (no third-party request from a public page) and
-- Critical Feature 18 (accounts OFF ships no Supabase reference at all) each
-- rule out a runtime read on their own. The unavoidable consequence is
-- staleness — a prof publishes a session and the public page does not move
-- until somebody deploys.
--
-- v0.16.0 made that failure LOUD (the sync banner on `/admin/seances`). This
-- makes it SHORT: publishing a session pokes a Cloudflare deploy hook, the site
-- rebuilds, and the banner goes green on its own.
--
-- ═══ ⚠️ WHY THIS IS A HAND-WRITTEN TRIGGER AND NOT A DATABASE WEBHOOK ═══════
--
-- Supabase's Database Webhooks UI cannot be used on this project. It fails with
-- `schema supabase_functions does not exist`, and once that is worked around,
-- with `function supabase_functions.http_request() does not exist` — even with
-- pg_net enabled, because pg_net installs into `extensions` (its own functions
-- live in `net`) and the UI expects a `supabase_functions` shim this project
-- does not have. An hour was spent on that; the answer is that the UI is a
-- convenience over exactly the trigger below, and writing the trigger by hand
-- is both shorter and reviewable in git.
--
-- ⚠️ THIS WAS APPLIED BY HAND ON PRODUCTION FIRST, AND THAT IS THE DEFECT THIS
-- MIGRATION REPAIRS. A trigger that exists only in the live database is one the
-- test project does not have, nobody can review, and the next `db:push` does
-- not carry. Everything here is idempotent so it can be run over the
-- hand-applied objects; running it is what makes production and the repository
-- agree.
--
-- ═══ ⚠️ THE HOOK URL IS A SECRET AND THIS REPOSITORY IS PUBLIC ══════════════
--
-- The URL *is* the credential — anyone holding it can spend the account's build
-- minutes. It is therefore NOT in this file, NOT in `.env`, and NOT in a table.
-- It lives in **Supabase Vault**, under the name `cloudflare_deploy_hook`, put
-- there by a documented one-line manual step (see section 6 at the bottom of
-- this file, and `docs/reference/deployment.md`).
--
-- Why the vault rather than a config table:
--   • a table is readable by anything holding the service-role key, appears in
--     `pg_dump`, and would be the EIGHTH table on this project to ship with the
--     `anon` grants Supabase hands out by default (see 0008). The vault sits in
--     a schema PostgREST does not expose, and is encrypted at rest.
--   • a GUC (`alter database … set`) survives neither a pooled connection nor
--     an audit — nothing lists it and nothing can check it.
--   • an `.env` variable cannot be read from inside Postgres at all.
--
-- ⚠️ NO SECRET MEANS NO DISPATCH, NOT AN ERROR. A project without the vault
-- entry — every test project, every local database — logs the firing and sends
-- nothing. That is what lets `recurring-sessions.spec.ts` COUNT firings against
-- a project that must never be able to trigger a production build.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. pg_net
--
-- ⚠️ LOUD HERE, SOFT AT RUNTIME. Applying a migration is a deliberate act with
-- somebody watching, so a missing extension must stop it. A prof pressing
-- "Publier" at 16:00 in Dar Souiri is not, so the trigger below swallows every
-- failure — see the rule above section 4.
--
-- pg_net's control file pins its own schema (`net`); it must not be given one,
-- which is why there is no `with schema` clause here.
-- ────────────────────────────────────────────────────────────────────────────
do $ext$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      execute 'create extension pg_net';
    exception when others then
      raise exception
        'pg_net is not installed and could not be created (%). Enable it in the '
        'Supabase dashboard (Database → Extensions → pg_net) and re-run 0011.',
        sqlerrm;
    end;
  end if;
end
$ext$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. rebuild_requests — the LOG, and the reason a firing can be counted
--
-- ⚠️ THIS TABLE IS THE INSTRUMENT, NOT DECORATION. "The trigger fires once for
-- a thirteen-session insert" is a claim about `FOR EACH STATEMENT`, and the
-- only honest way to hold it is to count. Every firing writes exactly one row
-- here — including the ones that dispatch nothing — so the count is of the
-- TRIGGER, not of the network.
--
-- `rows_changed` comes from a transition table, which is why the triggers in
-- section 5 are declared one per event: Postgres permits `REFERENCING` on a
-- single-event trigger only.
--
-- Volume: a handful of session edits a week, one row each. No pruning is
-- provided, because at that rate the table is measured in kilobytes a decade;
-- if that ever stops being true, `delete … where requested_at < …` is the whole
-- fix and the index below already supports it.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.rebuild_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  -- `sessions.insert`, `sessions.update`, `sessions.delete`, or `manual: …`.
  source text not null,
  -- How many rows the ONE statement touched. 13 here, against a single row in
  -- this table, is the whole point of the feature.
  rows_changed integer not null default 0,
  -- Did a request actually go out? False on a project with no vault entry, and
  -- false when nothing publicly visible changed.
  dispatched boolean not null default false,
  -- pg_net's handle, for correlating with `net._http_response`.
  net_request_id bigint,
  -- Why nothing was sent, when nothing was sent. ⚠️ Never holds the URL.
  note text
);

comment on table public.rebuild_requests is
  'One row per firing of the site-rebuild trigger. The count is of the TRIGGER, '
  'not of the network: a firing that dispatches nothing still writes a row. '
  'Never holds the deploy hook URL.';

create index if not exists rebuild_requests_requested_at_idx
  on public.rebuild_requests (requested_at desc);

-- ⚠️ THE REVOKE IS NOT BELT AND BRACES (0008). A Supabase project ships
-- `alter default privileges … grant all on tables to anon, authenticated`, so
-- the `create table` above has ALREADY handed `anon` the full set.
revoke all on public.rebuild_requests from anon, authenticated;

alter table public.rebuild_requests enable row level security;

drop policy if exists rebuild_requests_select_staff on public.rebuild_requests;
create policy rebuild_requests_select_staff on public.rebuild_requests
  for select using (public.is_staff());

-- ⚠️ NO INSERT POLICY, DELIBERATELY — the same shape as `profiles`. Rows arrive
-- only from the SECURITY DEFINER function below, which bypasses RLS. A client
-- cannot manufacture a rebuild record, so it cannot manufacture a rebuild.
grant select on public.rebuild_requests to authenticated;
-- ⚠️ EVERY NEW TABLE GRANTS service_role EXPLICITLY. 0002 exists solely to
-- repair the absence of this line across every table, and 0003 reproduced the
-- bug anyway.
grant select, insert, update, delete on public.rebuild_requests to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. request_site_rebuild() — the ONE dispatcher
--
-- The trigger calls it; a person can call it. Nothing else pokes the hook, so
-- there is one place where the secret is read and one place that decides
-- whether a request goes out.
--
-- ⚠️ SECURITY DEFINER, `search_path` PINNED. It reads `vault.decrypted_secrets`,
-- on which `authenticated` holds no privilege and must never be given any.
--
-- ⚠️ IT IS `service_role` ONLY. There is no staff-facing "reconstruire
-- maintenant" button and this is not the place to grow one: build minutes are
-- billable, and a control that spends them belongs behind a decision rather
-- than behind a tap.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.request_site_rebuild(
  source text,
  rows_changed integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  hook text;
  request_id bigint;
  log_id bigint;
  failure text;
begin
  -- ⚠️ The vault may not exist at all (a local Postgres, a stripped project). A
  -- plpgsql body is not resolved at CREATE time — unlike a `language sql` one,
  -- see the ordering note in 0001 — so naming a possibly-missing schema here is
  -- safe; catching the lookup is what keeps it safe at RUNTIME too.
  begin
    select decrypted_secret into hook
      from vault.decrypted_secrets
     where name = 'cloudflare_deploy_hook'
     limit 1;
  exception when others then
    hook := null;
    failure := 'vault unreadable: ' || sqlerrm;
  end;

  if hook is null or btrim(hook) = '' then
    insert into public.rebuild_requests (source, rows_changed, dispatched, note)
    values (source, rows_changed, false,
            coalesce(failure, 'no cloudflare_deploy_hook in the vault — nothing sent'))
    returning id into log_id;
    return log_id;
  end if;

  begin
    select net.http_post(
      url := hook,
      body := jsonb_build_object('source', source, 'rows', rows_changed),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 5000
    ) into request_id;
  exception when others then
    -- ⚠️ A BROKEN HOOK MUST NEVER STOP A PROF SAVING A SESSION. The write has
    -- already happened; this is only the poke.
    insert into public.rebuild_requests (source, rows_changed, dispatched, note)
    values (source, rows_changed, false, 'http_post failed: ' || sqlerrm)
    returning id into log_id;
    return log_id;
  end;

  insert into public.rebuild_requests (source, rows_changed, dispatched, net_request_id)
  values (source, rows_changed, true, request_id)
  returning id into log_id;
  return log_id;
end
$fn$;

comment on function public.request_site_rebuild(text, integer) is
  'Ask Cloudflare to rebuild the static site. Reads the hook URL from Vault '
  '(cloudflare_deploy_hook) and logs every call to rebuild_requests. Also the '
  're-fire half of the `mcc.rebuild = off` suppression seam.';

revoke all on function public.request_site_rebuild(text, integer) from public;
revoke all on function public.request_site_rebuild(text, integer) from anon, authenticated;
grant execute on function public.request_site_rebuild(text, integer) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. The trigger function
--
-- ═══ ⚠️ FOR EACH STATEMENT, AND EVERY WRITE PATH MUST BE ONE STATEMENT ══════
--
-- A row-level trigger would fire thirteen times for a term of weekly sessions,
-- and cost thirteen Cloudflare builds for one prof action. Statement-level
-- fires once per statement — which moves the requirement into the CLIENT:
-- `createSessions()` sends one multi-row `insert`, and the bulk publish/cancel
-- send one `update … in (…)`. See `src/lib/admin.ts`, where that is written
-- down as a rule rather than as an optimisation.
--
-- ⚠️ NOTHING HERE MAY RAISE. Every failure path in section 3 returns a log row
-- instead of an exception, and this function adds no new one. A trigger that
-- can throw is a trigger that can make `/admin/seances` unable to save —
-- turning a Cloudflare outage into a database outage, on the screen a prof is
-- standing in front of with a room full of children.
--
-- ⚠️ A DRAFT CHANGES NOTHING THE PUBLIC CAN SEE, so it dispatches nothing — but
-- it still LOGS, which is what keeps the firing count honest. An UPDATE reads
-- BOTH transition tables: pulling a published session back to draft is
-- invisible in `new_rows`, and is exactly the case the public agenda most needs
-- rebuilt for.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.sessions_rebuild_hook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $trg$
declare
  n_total integer := 0;
  n_public integer := 0;
begin
  -- ⚠️ THE SUPPRESSION SEAM. `set local mcc.rebuild = 'off'` inside a
  -- transaction silences every firing in it; the caller then fires ONCE with
  -- `select public.request_site_rebuild('manual: …')`. It exists for hand-run
  -- SQL maintenance, where a loop is sometimes genuinely the clearest thing to
  -- write. No application code path uses it — every one of them is already a
  -- single statement, which is the better answer where it is available.
  if coalesce(current_setting('mcc.rebuild', true), '') = 'off' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select count(*), count(*) filter (where status in ('published', 'cancelled'))
      into n_total, n_public
      from new_rows;
  elsif tg_op = 'UPDATE' then
    select count(*) into n_total from new_rows;
    select
        (select count(*) from new_rows where status in ('published', 'cancelled'))
      + (select count(*) from old_rows where status in ('published', 'cancelled'))
      into n_public;
  else
    select count(*), count(*) filter (where status in ('published', 'cancelled'))
      into n_total, n_public
      from old_rows;
  end if;

  if n_public > 0 then
    perform public.request_site_rebuild('sessions.' || lower(tg_op), n_total);
  else
    insert into public.rebuild_requests (source, rows_changed, dispatched, note)
    values ('sessions.' || lower(tg_op), n_total, false,
            'nothing publicly visible changed — drafts only');
  end if;

  return null;
exception when others then
  -- Belt and braces over the handlers inside the dispatcher: whatever happens
  -- out here, the prof's write stands.
  return null;
end
$trg$;

comment on function public.sessions_rebuild_hook() is
  'AFTER STATEMENT trigger on sessions. Fires ONCE per statement, which is why '
  'every bulk write in src/lib/admin.ts is a single statement. Never raises.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. The triggers — one per event, because transition tables demand it
-- ────────────────────────────────────────────────────────────────────────────
drop trigger if exists sessions_rebuild_insert on public.sessions;
create trigger sessions_rebuild_insert
  after insert on public.sessions
  referencing new table as new_rows
  for each statement execute function public.sessions_rebuild_hook();

drop trigger if exists sessions_rebuild_update on public.sessions;
create trigger sessions_rebuild_update
  after update on public.sessions
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.sessions_rebuild_hook();

drop trigger if exists sessions_rebuild_delete on public.sessions;
create trigger sessions_rebuild_delete
  after delete on public.sessions
  referencing old table as old_rows
  for each statement execute function public.sessions_rebuild_hook();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ⚠️ THE MANUAL STEP — run ONCE per project, and never from this file
--
-- The value below is a placeholder. The real URL comes from the Cloudflare
-- dashboard and is pasted straight into the Supabase SQL editor; it must not be
-- written into this repository, a commit message, a CHANGELOG entry, or a
-- screenshot.
--
--   select vault.create_secret(
--     'https://api.cloudflare.com/client/v4/…/deploy_hooks/PASTE_HERE',
--     'cloudflare_deploy_hook',
--     'Cloudflare deploy hook — poked by public.request_site_rebuild()'
--   );
--
-- To rotate it:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'cloudflare_deploy_hook'),
--     'https://…new…'
--   );
--
-- To check it is there WITHOUT printing it:
--
--   select name, created_at from vault.secrets where name = 'cloudflare_deploy_hook';
--
-- ⚠️ A project with no entry is fully functional and dispatches nothing. That
-- is the correct state for every test project, and `db:push` refuses production
-- by design, so the two never meet.
-- ────────────────────────────────────────────────────────────────────────────
