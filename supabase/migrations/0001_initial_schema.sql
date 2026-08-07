-- ============================================================================
-- 0001 — identities, roles, progress, sessions, attendance
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. If something here is
-- wrong, the fix is 0002. Editing a merged migration means two databases that
-- both claim to be at 0001 and disagree about what that means.
--
-- ⚠️ ALL SECURITY IS RLS. The site is static and the anon key ships to every
-- browser by design. Every policy below is a real boundary; nothing in the
-- client is. If a rule is not expressed here, it does not exist.
--
-- Pedagogical content stays in git. This database holds identities, roles,
-- progress, sessions and attendance — nothing a lesson is made of.
--
-- ⚠️ ORDERING MATTERS HERE. A `language sql` function body is parsed and its
-- object references RESOLVED at CREATE time (check_function_bodies is on by
-- default), so `is_staff()` cannot be declared before `profiles` exists. Tables
-- first, then functions, then the policies that call them.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles
--
-- One row per auth user. `on delete cascade` from auth.users is the root of the
-- erasure chain: deleting the user removes the profile, and the FKs further
-- down carry that through progress and attendance. The right to erasure
-- depends on this and nothing else.
-- ────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'eleve' check (role in ('admin', 'prof', 'eleve')),
  display_name text,
  -- Clamped to the locales the site actually has; see handle_new_user().
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  -- ⚠️ A PARENT CONTACT FIELD, NOT AN AUTH CHANNEL. Nothing signs in with this
  -- and nothing is sent to it. SMS/WhatsApp OTP was considered and rejected.
  guardian_phone text,
  created_at timestamptz not null default now()
);

comment on column public.profiles.display_name is
  'First name only. Minors: minimum viable identification, never a full name.';
comment on column public.profiles.guardian_phone is
  'Optional parent contact. NOT an authentication channel — no SMS/OTP, ever.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Role helpers
--
-- ⚠️ SECURITY DEFINER, AND THAT IS NOT OPTIONAL. A policy on `profiles` that
-- checks staffness by SELECTing `profiles` re-enters the same policy and
-- Postgres raises "infinite recursion detected in policy for relation
-- profiles". Running as owner bypasses RLS for this one lookup and breaks the
-- cycle. Every project that adds role-based RLS meets this once.
--
-- `search_path` is pinned: a SECURITY DEFINER function without it can be
-- subverted by a caller-controlled search_path.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'prof')
  );
$$;

comment on function public.is_staff() is
  'True when the caller is prof or admin. SECURITY DEFINER to avoid RLS recursion on profiles.';

create or replace function public.is_admin_direct()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. profiles — RLS, privileges, and the role guard
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Owner reads own row.
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- Staff read every row. v2.0: all profs see all students; groups are v2.1.
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());

-- Owner updates own row. WHICH COLUMNS is decided by the grants below, not
-- here — a USING/WITH CHECK clause cannot restrict columns.
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Staff may update rows (needed for prof-created accounts in v2-S2).
create policy profiles_update_staff on public.profiles
  for update using (public.is_staff()) with check (public.is_staff());

-- ⚠️ NO INSERT POLICY, DELIBERATELY. Rows arrive only via handle_new_user(),
-- which is SECURITY DEFINER. A client cannot mint a profile, so it cannot mint
-- itself one with role = 'admin'.

-- ⚠️ role IS NEVER CLIENT-UPDATABLE — enforced twice, on purpose.
--
-- RLS policies operate on ROWS. `profiles_update_own` above would happily let a
-- reader set their own role to 'admin', because the row IS theirs. Column-level
-- privileges are the actual mechanism; the trigger is the second line.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, locale) on public.profiles to authenticated;

create or replace function public.forbid_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin_direct() then
    raise exception 'role may not be changed by the client (see docs/ADMIN.md)';
  end if;
  return new;
end;
$$;

create trigger profiles_forbid_role_self_change
  before update on public.profiles
  for each row execute function public.forbid_role_self_change();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Progress
--
-- ⚠️ SLUGS ARE FREE TEXT AND DELIBERATELY NOT FOREIGN KEYS. The content lives
-- in git, not in this database, so there is nothing to point at. The failure
-- mode is orphaned rows after a lesson is renamed or removed, which is harmless
-- — a row nobody reads. The alternative (mirroring every slug into a table on
-- each deploy) makes the database a second, lagging source of truth for
-- content, and a content rename starts failing writes in production.
-- ────────────────────────────────────────────────────────────────────────────
create table public.exercise_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  exercise_slug text not null,
  solved boolean not null default false,
  attempts integer not null default 0,
  hint_used boolean not null default false,
  solved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, exercise_slug)
);

alter table public.exercise_progress enable row level security;

create policy exercise_progress_own on public.exercise_progress
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy exercise_progress_select_staff on public.exercise_progress
  for select using (public.is_staff());

create table public.lesson_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  lesson_slug text not null,
  completed_at timestamptz not null default now(),
  primary key (profile_id, lesson_slug)
);

alter table public.lesson_progress enable row level security;

create policy lesson_progress_own on public.lesson_progress
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy lesson_progress_select_staff on public.lesson_progress
  for select using (public.is_staff());

grant select, insert, update, delete on public.exercise_progress to authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. sessions — when the club meets
--
-- Published sessions are readable by `anon`: the agenda must stay visible
-- without an account, exactly as it is today. Drafts and cancellations stay
-- staff-only.
-- ────────────────────────────────────────────────────────────────────────────
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  duration_minutes integer not null default 90,
  title_fr text,
  title_en text,
  venue text,
  level text check (level is null or level in ('debutant', 'intermediaire', 'avance')),
  note_fr text,
  note_en text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy sessions_select_published on public.sessions
  for select using (status = 'published');

create policy sessions_staff_all on public.sessions
  for all using (public.is_staff()) with check (public.is_staff());

grant select on public.sessions to anon, authenticated;
grant insert, update, delete on public.sessions to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. attendance
-- ────────────────────────────────────────────────────────────────────────────
create table public.attendance (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'excuse')),
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

alter table public.attendance enable row level security;

-- A student sees their own attendance and cannot write it.
create policy attendance_select_own on public.attendance
  for select using (auth.uid() = profile_id);

create policy attendance_staff_all on public.attendance
  for all using (public.is_staff()) with check (public.is_staff());

grant select on public.attendance to authenticated;
grant insert, update, delete on public.attendance to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. handle_new_user — a profile for every signup
--
-- ⚠️ THE LOCALE CLAMP IS NOT DEFENSIVE PROGRAMMING, IT IS A KNOWN BUG BEING
-- PREVENTED IN ADVANCE. An OAuth provider (Google, arriving in v2-S2) supplies
-- a locale claim like `en-GB`, `fr-CA` or `en_US`. Written through verbatim it
-- violates the CHECK constraint, the trigger raises, and the whole signup fails
-- — surfacing to the reader as an opaque "Database error saving new user" with
-- nothing pointing at the locale. Take the primary subtag, lowercase, fall back.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  raw_locale text;
  clean_locale text;
  name_guess text;
begin
  raw_locale := coalesce(
    new.raw_user_meta_data ->> 'locale',
    new.raw_user_meta_data ->> 'preferred_locale',
    'fr'
  );
  -- 'en-GB' → 'en', 'fr_CA' → 'fr', anything unrecognised → 'fr'.
  clean_locale := lower(split_part(replace(raw_locale, '_', '-'), '-', 1));
  if clean_locale not in ('fr', 'en') then
    clean_locale := 'fr';
  end if;

  -- An explicit first name if the provider gave one, otherwise the email local
  -- part. Never the full email — this is rendered in the site header.
  name_guess := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'given_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Joueur'
  );

  insert into public.profiles (id, display_name, locale)
  values (new.id, name_guess, clean_locale)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Indexes for the reads S3/S4 will actually make.
-- ────────────────────────────────────────────────────────────────────────────
create index exercise_progress_profile_idx on public.exercise_progress (profile_id);
create index lesson_progress_profile_idx on public.lesson_progress (profile_id);
create index sessions_starts_at_idx on public.sessions (starts_at desc);
create index sessions_status_idx on public.sessions (status);
create index attendance_profile_idx on public.attendance (profile_id);
