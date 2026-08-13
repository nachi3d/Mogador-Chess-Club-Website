-- ════════════════════════════════════════════════════════════════════════════
-- 0006 — the public agenda reads from `sessions`, and the git collection retires
--
-- v2-S4 part 1 built `/admin/seances` and left `/agenda/` reading a git content
-- collection, so a session a prof published appeared nowhere. Two sources of
-- truth, and the one the prof was typing into was the one nobody could see.
--
-- ⚠️ THE PUBLIC READ WAS ALREADY PERMITTED. 0001 shipped
-- `grant select on public.sessions to anon` and a `status = 'published'`
-- policy, deliberately. Nothing here opens a new surface; it widens that
-- policy by exactly one status and inserts the one entry the git collection
-- held.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. A CANCELLED SESSION MUST STAY VISIBLE, WITH ITS STATE
--
-- `cancelSession()` sets `status = 'cancelled'` and never deletes, because
-- deleting cascades the register away and leaves students who were told it was
-- happening wondering whether they misremembered (Critical Feature 46). That
-- rule was only half true in public: the row survived, and then vanished from
-- every surface a student could reach, because the select policy named
-- 'published' alone.
--
-- ⚠️ A CANCELLED SESSION IS NOT A DRAFT. `draft` is "not announced yet" and
-- stays staff-only; `cancelled` is "announced, then called off", which is
-- precisely the state a reader most needs to see.
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists sessions_select_published on public.sessions;

create policy sessions_select_public on public.sessions
  for select using (status in ('published', 'cancelled'));

comment on table public.sessions is
  'Club sessions. `published` and `cancelled` are readable by anon — this is '
  'the public agenda, and the site bakes it in at build time. `draft` is '
  'staff-only.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The one entry the git collection held
--
-- `src/content/agenda/2026-09-12.json` — 16:00 local, and the club is on
-- Africa/Casablanca (UTC+01:00), so 15:00Z. ⚠️ The offset is written out rather
-- than left to the server's zone: a migration applied from a laptop in another
-- country would otherwise move the session by an hour, silently, and nobody
-- would find it until a parent arrived at the wrong time.
--
-- ⚠️ A FIXED id, NOT `gen_random_uuid()`. The committed fallback snapshot in
-- `src/data/agenda.json` carries this row so a build with no credentials still
-- renders it, and `/admin/seances` compares the deployed agenda to the database
-- BY id. A random id would make the migrated entry look like a pending change
-- on every project it was applied to, forever.
--
-- Idempotent on that id rather than `on conflict`: it reads as the condition it
-- is, and there is deliberately no unique constraint on `starts_at` — two
-- sessions can legitimately start at the same moment once the club runs
-- parallel groups.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.sessions (id, starts_at, duration_minutes, level, note_fr, note_en, status)
select
  uuid '5e5e0912-0000-4000-8000-000000000912',
  timestamptz '2026-09-12 16:00:00+01:00',
  90,
  'debutant',
  'Séance d''ouverture de la saison — initiation, matériel fourni. Venez comme vous êtes.',
  'Season opening session — beginners welcome, sets provided. Just turn up.',
  'published'
where not exists (
  select 1 from public.sessions where id = uuid '5e5e0912-0000-4000-8000-000000000912'
);
