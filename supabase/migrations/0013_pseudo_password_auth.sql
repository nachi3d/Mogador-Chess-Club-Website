-- ════════════════════════════════════════════════════════════════════════════
-- 0013 — signing in with a PSEUDO and a PASSWORD
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. A fix is 0014.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS AT ALL — the magic link was written for the wrong reader
--
-- The club teaches teenagers in Essaouira. Many of them have no active email
-- address; the ones who do read it on a shared phone, where a Supabase-branded
-- "Confirm your signup" lands next to nothing else they recognise. A parent who
-- receives it assumes it is spam. The flow that works beautifully for Seàn and
-- Michael — two adults with real inboxes — is unusable for the people the site
-- is actually for.
--
-- So the primary path becomes: a pseudo they choose, a password they remember,
-- and a WhatsApp number that is how a forgotten password gets fixed.
--
-- ⚠️ THE MAGIC LINK STAYS. It is not deprecated, not hidden behind a flag and
-- not "legacy": it is the path that works for anyone with a real inbox, and the
-- two staff accounts use it. Nothing here removes it and nothing here may.
--
-- ────────────────────────────────────────────────────────────────────────────
-- THE SYNTHETIC ADDRESS — `<pseudo>@pseudo.mogadorchess.invalid`
--
-- Supabase Auth has no username identity type. Every email/password user is
-- keyed by an email address, so a pseudo has to become one. Three properties
-- were wanted, and `.invalid` is the only choice that has all three:
--
--   1. ⚠️ IT CAN NEVER REACH ANYBODY. `.invalid` is reserved by RFC 6761 §6.4
--      and is guaranteed never to resolve. There is no MX record to find, so a
--      message to it is never delivered, never bounces off a real mailbox and
--      never damages the project's sending reputation. A domain we own
--      (`pseudo.mogadorchess.nachi3dlabs.com`) would satisfy this only for as
--      long as nobody adds an MX record to it — a guarantee held by a DNS
--      console rather than by a standard.
--   2. ⚠️ IT CAN NEVER COLLIDE WITH A REAL PERSON'S ADDRESS. Nobody can own a
--      mailbox under `.invalid`, so a pseudo can never be an address somebody
--      else controls, and a magic link can never be requested for one by its
--      "owner".
--   3. It is obviously synthetic on sight, in a log, in the dashboard.
--
-- ⚠️ IT IS NEVER SHOWN TO THE READER. Not on `/compte/`, not in an error, not
-- in the admin list — `admin_list_accounts()` below NULLs it at the source
-- rather than trusting four surfaces to remember. The reader has a pseudo; the
-- address is plumbing, and a student who is told their email is
-- `yassine@pseudo.mogadorchess.invalid` has been handed a fact that is both
-- confusing and useless.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ WHY SIGN-UP IS A FUNCTION AND NOT `supabase.auth.signUp()`
--
-- The obvious implementation is the client calling `signUp({ email, password })`
-- with the synthetic address. It does not work and must not be attempted:
--
--   * with email confirmations ON (this project's setting, and the setting the
--     magic link needs), GoTrue sends a confirmation message to the synthetic
--     address and refuses the sign-in until it is answered. Nobody can answer
--     it. The account is born locked.
--   * turning confirmations OFF to make that work would apply to the WHOLE
--     project — including real addresses — and would let anyone sign up as
--     somebody else's email and hold it.
--
-- So the account is minted here, in one transaction, already confirmed, with no
-- mail ever entering the picture. The cost is that this file writes `auth.users`
-- and `auth.identities` directly, which is Supabase-internal. That is a real
-- risk and it is accepted with its mitigation stated: `pseudo-auth.spec.ts`
-- registers and signs in through the real endpoints on every gate, so a GoTrue
-- schema change surfaces as a red test rather than as a Friday at Dar Souiri.
--
-- ⚠️ ALL SECURITY IS STILL RLS AND THE FUNCTION BODIES. Nothing in the client
-- is a boundary: `register_with_pseudo()` is callable by `anon` on purpose (a
-- reader signing up has no session), so every rule it enforces — uniqueness,
-- the password floor, the required WhatsApp number, the throttle — lives here.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The synthetic domain, stated ONCE
--
-- ⚠️ THE CLIENT HAS A COPY (`src/lib/pseudo.ts`) AND THE COPY IS CHECKED. The
-- browser has to build the same address to sign in with, and it cannot call a
-- function before it has a session. Mirrors drift, so `pseudo-auth.spec.ts`
-- asserts `pseudo_email()` from the database equals `pseudoEmail()` from the
-- module — the same arrangement as `computeLedger()` and the inline resolver.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.pseudo_email_domain()
returns text
language sql
immutable
as $$ select 'pseudo.mogadorchess.invalid'::text $$;

comment on function public.pseudo_email_domain() is
  'The reserved (RFC 6761) domain every pseudo account''s synthetic address sits '
  'under. Never shown to a reader, never able to receive mail.';

create or replace function public.pseudo_email(p_pseudo text)
returns text
language sql
immutable
as $$ select lower(btrim(p_pseudo)) || '@' || public.pseudo_email_domain() $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. profiles — the three new columns
--
-- ⚠️ `pseudo` IS UNIQUE AND IMMUTABLE ONCE SET, and the immutability is not
-- tidiness: the synthetic address is DERIVED from it. A pseudo that could be
-- changed would leave `auth.users.email` naming the old one, so the reader's
-- next sign-in would fail with correct credentials — the worst class of bug for
-- a fourteen-year-old who will conclude the site is broken and stop coming.
-- Renaming is possible, later, only as a function that rewrites BOTH.
--
-- ⚠️ NULL FOR EVERY MAGIC-LINK ACCOUNT, and that is the discriminator the whole
-- feature reads: `pseudo is not null` means "this account signs in with a
-- password", everywhere. No second column, no `auth_kind` enum to get out of
-- step with reality.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists pseudo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_pseudo_check' and conrelid = 'public.profiles'::regclass
  ) then
    -- Lowercase ASCII, 3–20, starting on a letter or a digit. Deliberately
    -- narrow: this string becomes the local part of an email address, and an
    -- address that needs quoting is one that will be typed wrong at a table in
    -- Dar Souiri. Mirrored in `src/lib/pseudo.ts` for the form's own message.
    alter table public.profiles
      add constraint profiles_pseudo_check
      check (pseudo is null or pseudo ~ '^[a-z0-9][a-z0-9._-]{2,19}$');
  end if;
end
$$;

create unique index if not exists profiles_pseudo_key on public.profiles (pseudo);

comment on column public.profiles.pseudo is
  'The name the reader signs in with. Lowercase, unique, IMMUTABLE once set — '
  'the synthetic auth address is derived from it. NULL on every magic-link '
  'account, and that null IS the discriminator. See migration 0013.';

-- ⚠️ SEPARATE FROM THE AUTH IDENTITY, WHICH IS THE WHOLE POINT OF THE FIELD.
-- A pseudo account's `auth.users.email` is the synthetic address; this is the
-- optional real one, for a parent who has an inbox and wants the club to be
-- able to reach them. Nothing signs in with it and nothing is sent to it today.
alter table public.profiles add column if not exists contact_email text;

comment on column public.profiles.contact_email is
  'Optional real address, for contact only. NOT an authentication channel: '
  'nothing signs in with it — same posture as guardian_phone.';

-- ⚠️ SET ONLY BY `admin_reset_password()`, CLEARED ONLY BY `change_own_password()`.
-- It is NOT in the column grant list below, so a client cannot clear it by
-- updating its own row and skipping the change it was set for.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True between an admin reset and the reader choosing their own password. '
  'Never client-writable — see the grant list in migration 0013.';

-- ⚠️ ADDITIVE TO 0001/0009/0010's COLUMN GRANT LIST, WHICH IS WHAT ACTUALLY
-- STOPS A CLIENT WRITING `role` (RLS operates on ROWS and would happily allow
-- it). ⚠️ A future session must NOT "tidy" these into `grant update on
-- public.profiles` — that single edit hands every reader their own `role`.
--
-- ⚠️ AND NOTE WHAT IS *NOT* HERE: `pseudo` (immutable), `guardian_phone` and
-- `contact_email` (written through `update_own_contact()` so one normaliser
-- decides what a phone number is), and `must_change_password`.
-- The grant list is the enforcement; the trigger below is the second line.
grant update (display_name, locale) on public.profiles to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The pseudo guard trigger — immutable once set, never invented client-side
--
-- ⚠️ TWO RULES IN ONE TRIGGER, AND BOTH ARE ABOUT THE SAME FACT: the pseudo and
-- `auth.users.email` must agree forever. `register_with_pseudo()` writes both,
-- as owner, inside one transaction; anything else must not write either.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.forbid_pseudo_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.pseudo is distinct from old.pseudo then
    if old.pseudo is not null then
      raise exception 'pseudo_immutable';
    end if;
    -- Setting a pseudo on an account that has none rewrites nothing in
    -- `auth.users`, so the two would disagree from that moment on. The only
    -- sanctioned writer is `register_with_pseudo()`, which sets the GUC.
    if coalesce(current_setting('mcc.pseudo_signup', true), '') <> 'on' then
      raise exception 'pseudo_not_settable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_forbid_pseudo_change on public.profiles;
create trigger profiles_forbid_pseudo_change
  before update on public.profiles
  for each row execute function public.forbid_pseudo_change();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ⚠️ THE SYNTHETIC NAMESPACE IS RESERVED AT THE `auth.users` DOOR
--
-- Without this, anybody can call `signInWithOtp({ email:
-- 'yassine@pseudo.mogadorchess.invalid' })` with the published anon key. GoTrue
-- would create that user, and the pseudo `yassine` would be permanently taken
-- by an account nobody can sign into — a free, scriptable denial of service on
-- the club's own name space, and one that leaves a mail attempt behind it.
--
-- The GUC is set by `register_with_pseudo()` and by nothing else. It is a
-- transaction-local setting (`is_local => true`), so it cannot leak into the
-- next statement on a pooled connection.
--
-- ⚠️ THIS TRIGGER IS *MEANT* TO FAIL A WRITE, unlike the rebuild trigger of
-- 0011 (Critical Feature 70). The write it fails is one that must not happen,
-- and the caller is GoTrue reporting "Database error saving new user" to a
-- scraper. A real reader can never reach it: the registration path sets the GUC
-- and no other path has any business creating an address in this domain.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_pseudo_namespace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is not null
     and new.email like ('%@' || public.pseudo_email_domain())
     and coalesce(current_setting('mcc.pseudo_signup', true), '') <> 'on' then
    raise exception 'the pseudo namespace is reserved (migration 0013)';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_guard_pseudo on auth.users;
create trigger on_auth_user_guard_pseudo
  before insert on auth.users
  for each row execute function public.guard_pseudo_namespace();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. normalize_whatsapp() — ONE normaliser, in the database
--
-- ⚠️ THE NUMBER IS THE RECOVERY CHANNEL, so "we have a number" has to mean "we
-- have a number somebody can actually message". A parent at Dar Souiri types
-- `06 12 34 56 78`; a French parent types `+33 6 …`; somebody pastes
-- `00212612345678`. All three are the same act and only one shape can be dialled
-- from `wa.me/`.
--
-- ⚠️ THE LOCAL-ZERO RULE ASSUMES MOROCCO, AND THAT IS A DECISION, NOT A
-- FALLBACK. A ten-digit number starting `0` is read as Moroccan (+212). The club
-- is in Essaouira and that is what its families type. Anybody else must type
-- their own `+` prefix, and the form says so in as many words.
--
-- ⚠️ IT IS NOT VALIDATION OF EXISTENCE. Nothing here proves the number reaches
-- the parent — only that it has the shape of a number. The actual proof is Seàn
-- sending the first temporary password and someone answering.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_whatsapp(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
  cleaned text;
begin
  if p_raw is null or btrim(p_raw) = '' then
    return null;
  end if;

  cleaned := btrim(p_raw);
  -- Everything a human puts between digits goes: spaces, dots, dashes,
  -- parentheses, non-breaking spaces.
  digits := regexp_replace(cleaned, '[^0-9+]', '', 'g');

  if digits like '00%' then
    digits := '+' || substring(digits from 3);
  elsif digits like '0%' then
    -- Moroccan local form. See the note above: this is a decision about where
    -- the club is, not a guess about the number.
    digits := '+212' || substring(digits from 2);
  elsif digits not like '+%' then
    digits := '+' || digits;
  end if;

  if digits !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;
  return digits;
end;
$$;

comment on function public.normalize_whatsapp(text) is
  'E.164 or NULL. A bare leading 0 is read as Moroccan (+212) — see 0013.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. password_resets — who reset, when, FOR WHOM
--
-- ⚠️ THIS AUDIT NAMES THE STUDENT, AND `account_deletions` (0009) DOES NOT.
-- The difference is not an inconsistency, it is the same rule applied honestly:
-- Critical Feature 51 forbids retaining anything ABOUT AN ERASED ACCOUNT. A
-- password reset erases nothing — the account is still there, still the
-- reader's, and "whose password did we reset three times this term" is the
-- question the log exists to answer. When the account IS erased, the FK below
-- takes these rows with it, so nothing survives the person.
--
-- ⚠️ IT HOLDS NO PASSWORD, TEMPORARY OR OTHERWISE, AND THERE IS NOWHERE IT
-- COULD. The generated password exists in exactly two places: the bcrypt hash
-- in `auth.users`, and the screen it is read off once.
--
-- ⚠️ NEW TABLE ⇒ THE FIVE-LINE CHECKLIST, INCLUDING STEP 0 (0008) AND STEP 4
-- (forgotten twice before).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  reset_at timestamptz not null default now(),
  -- Null once the acting admin's own account is gone: an admin leaving must not
  -- erase the record that resets happened. Same shape as `account_deletions`.
  reset_by uuid references public.profiles (id) on delete set null,
  -- ⚠️ CASCADE, not `set null`. When the student's account is erased there must
  -- be nothing left pointing at them, not even an orphan row saying somebody
  -- once forgot a password.
  account_id uuid not null references public.profiles (id) on delete cascade
);

comment on table public.password_resets is
  'Audit of ADMIN password resets: who reset, when, for whom. Never the '
  'password. Cascades away with the account — see migration 0013.';

-- ⚠️ STEP 0 — before any grant. The project's default privileges have already
-- handed `anon` the full set by the time this line is reached (see 0008).
revoke all on public.password_resets from anon, authenticated;

alter table public.password_resets enable row level security;

-- Admins read it. Nobody writes it from a client: the only INSERT is inside
-- `admin_reset_password()`, which runs as owner.
create policy password_resets_select_admin on public.password_resets
  for select using (public.is_admin_direct());

-- ⚠️ AND THE READER SEES THEIR OWN. "Your password was reset by the club on the
-- 4th" is the reader's own fact, and hiding it would make a surprise sign-in
-- failure unexplainable to the one person it happened to.
create policy password_resets_select_own on public.password_resets
  for select using (auth.uid() = account_id);

grant select on public.password_resets to authenticated;
-- ⚠️ STEP 4, FORGOTTEN TWICE BEFORE. Default privileges do NOT hand this over.
grant select, insert, update, delete on public.password_resets to service_role;

create index if not exists password_resets_account_idx
  on public.password_resets (account_id, reset_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. register_with_pseudo() — the sign-up, in one transaction
--
-- ⚠️ CALLABLE BY `anon`, WHICH IS THE POINT AND ALSO THE HAZARD. A reader
-- signing up has no session, so this is reachable by anyone holding the
-- published anon key — i.e. by anyone. Everything it refuses, it refuses here:
--
--   * the pseudo shape and its uniqueness (both against `profiles` AND against
--     `auth.users`, because the two can only be created together);
--   * a password floor of 6 characters and NOTHING ELSE. ⚠️ NO COMPLEXITY
--     RULES, DELIBERATELY: these are minors on shared phones, and a rule that
--     guarantees a forgotten password guarantees a WhatsApp message to Seàn.
--     A short password the student remembers beats a strong one that is reset
--     every week — and the threat model is a club roster, not a bank;
--   * a WhatsApp number that normalises, because it IS the recovery channel and
--     an account without one is an account nobody can ever help;
--   * a global throttle, see below.
--
-- ⚠️ THE THROTTLE IS GLOBAL AND THAT IS A KNOWN, ACCEPTED WEAKNESS. GoTrue's
-- own per-IP sign-up limit does not apply to a function call, so without this a
-- script could mint a hundred thousand rows. A global cap means somebody
-- determined can also DENY sign-ups for an hour by burning it — which for a club
-- of twenty families is an annoyance Seàn can see in `/admin/comptes/` and wait
-- out, where an unbounded table is not. The number is generous against a real
-- Saturday (a whole workshop registering at once is ~20) and mean against a
-- script.
--
-- ⚠️ THE PASSWORD IS NEVER LOGGED. It arrives as a bound parameter of a
-- PostgREST RPC (a POST body, not a URL), is hashed in the same statement, and
-- is never assigned to anything that outlives the call. `log_statement` is off
-- on Supabase, and `pg_stat_statements` normalises parameters away.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.register_with_pseudo(
  p_pseudo text,
  p_password text,
  p_display_name text,
  p_whatsapp text,
  p_email text default null,
  p_locale text default 'fr'
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_pseudo text := lower(btrim(coalesce(p_pseudo, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_phone text := public.normalize_whatsapp(p_whatsapp);
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_locale text := lower(coalesce(nullif(btrim(p_locale), ''), 'fr'));
  v_address text;
  v_id uuid := gen_random_uuid();
  v_recent integer;
begin
  if v_pseudo !~ '^[a-z0-9][a-z0-9._-]{2,19}$' then
    raise exception 'pseudo_invalid';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'password_too_short';
  end if;
  if v_name = '' or length(v_name) > 40 then
    raise exception 'name_required';
  end if;
  if v_phone is null then
    raise exception 'whatsapp_invalid';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalid';
  end if;
  if v_locale not in ('fr', 'en') then
    v_locale := 'fr';
  end if;

  select count(*) into v_recent
    from public.profiles
   where pseudo is not null and created_at > now() - interval '1 hour';
  if v_recent >= 40 then
    raise exception 'too_many_signups';
  end if;

  v_address := public.pseudo_email(v_pseudo);

  if exists (select 1 from public.profiles where pseudo = v_pseudo)
     or exists (select 1 from auth.users where email = v_address) then
    raise exception 'pseudo_taken';
  end if;

  -- ⚠️ THE GUC THE TWO GUARD TRIGGERS LOOK FOR. Transaction-local, so it cannot
  -- survive into the next statement on a pooled connection.
  perform set_config('mcc.pseudo_signup', 'on', true);

  -- ⚠️ EVERY TOKEN COLUMN IS `''` AND NOT NULL. GoTrue scans these into Go
  -- strings; a NULL makes every later sign-in fail with the opaque "Database
  -- error querying schema", which looks like a broken project rather than a bad
  -- row. This is the single most common way a hand-made auth user is wrong.
  --
  -- ⚠️ `email_confirmed_at` IS SET HERE because nothing can ever confirm this
  -- address. That is not a corner cut: the address is unreachable by
  -- construction, and the thing actually being confirmed — that a real person
  -- is at the other end — is the WhatsApp number, confirmed by Seàn when he
  -- messages it.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token,
    reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_address, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', v_name, 'locale', v_locale, 'pseudo', v_pseudo),
    now(), now(), '', '', '', '', '', '', '', ''
  );

  -- Without an identity row GoTrue's password grant finds no email provider for
  -- the user and refuses the sign-in.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_address, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- `handle_new_user()` (0001) has already created the profile from the
  -- metadata above. This adds what only this function knows.
  update public.profiles
     set pseudo = v_pseudo,
         display_name = v_name,
         locale = v_locale,
         guardian_phone = v_phone,
         contact_email = v_email
   where id = v_id;

  return v_address;
end;
$$;

revoke all on function public.register_with_pseudo(text, text, text, text, text, text)
  from public;
grant execute on function public.register_with_pseudo(text, text, text, text, text, text)
  to anon, authenticated;

comment on function public.register_with_pseudo(text, text, text, text, text, text) is
  'Create a pseudo+password account, already confirmed, with no mail ever sent. '
  'Returns the synthetic address the client signs in with — never shown to a reader.';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. change_own_password() — the reader chooses their own
--
-- ⚠️ IT TAKES NO TARGET, FOR THE SAME REASON `delete_own_account()` DOES NOT
-- (Critical Feature 51). The id can only come from `auth.uid()`. A
-- `set_password(target, …)` with an ownership check in the body is one refactor
-- away from setting anybody's.
--
-- ⚠️ THE CURRENT PASSWORD IS REQUIRED, AND VERIFIED HERE. A shared family phone
-- with a session left open is the normal case, not the exotic one; without this
-- check the "change password" screen is a "take this account" button for
-- whoever picks the phone up next.
--
-- ⚠️ CLEARING `must_change_password` HAPPENS IN THE SAME STATEMENT AS THE NEW
-- HASH. If the flag were a separate client write, a student could clear it and
-- keep the temporary password Seàn read out over WhatsApp — the one password
-- that is knowingly known by somebody else.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.change_own_password(p_current text, p_new text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_id uuid := auth.uid();
  v_hash text;
begin
  if v_id is null then
    raise exception 'not_signed_in';
  end if;
  if length(coalesce(p_new, '')) < 6 then
    raise exception 'password_too_short';
  end if;

  select encrypted_password into v_hash from auth.users where id = v_id;
  if v_hash is null or v_hash = '' then
    -- A magic-link account has no password to change, and giving it one here
    -- would be a second credential nobody asked for on an account that signs in
    -- by inbox.
    raise exception 'not_pseudo_account';
  end if;
  if extensions.crypt(coalesce(p_current, ''), v_hash) <> v_hash then
    raise exception 'wrong_password';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_id;

  update public.profiles set must_change_password = false where id = v_id;
end;
$$;

revoke all on function public.change_own_password(text, text) from public, anon;
grant execute on function public.change_own_password(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. update_own_contact() — the recovery channel stays editable
--
-- ⚠️ A FUNCTION RATHER THAN A COLUMN GRANT, SO ONE NORMALISER DECIDES WHAT A
-- PHONE NUMBER IS. `grant update (guardian_phone)` would let the client store
-- `06 12 34 56 78`, `0612345678` and `+212612345678` as three different values,
-- and the `wa.me` link would work for one of them.
--
-- ⚠️ A PSEUDO ACCOUNT MAY NOT EMPTY IT. It is the only way back in after a
-- forgotten password; an account with no number and no inbox is one Seàn cannot
-- help, and the reader would discover that at the worst possible moment.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.update_own_contact(p_whatsapp text, p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := auth.uid();
  v_phone text := public.normalize_whatsapp(p_whatsapp);
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_pseudo text;
begin
  if v_id is null then
    raise exception 'not_signed_in';
  end if;
  if v_phone is null and btrim(coalesce(p_whatsapp, '')) <> '' then
    raise exception 'whatsapp_invalid';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalid';
  end if;

  select pseudo into v_pseudo from public.profiles where id = v_id;
  if v_pseudo is not null and v_phone is null then
    raise exception 'whatsapp_required';
  end if;

  update public.profiles
     set guardian_phone = v_phone, contact_email = v_email
   where id = v_id;
end;
$$;

revoke all on function public.update_own_contact(text, text) from public, anon;
grant execute on function public.update_own_contact(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. admin_reset_password() — the whole recovery story, and it is MANUAL
--
-- ⚠️ THERE IS NO SELF-SERVICE RESET AND THAT IS THE DESIGN. A reset link needs
-- an inbox; an SMS code needs an SMS budget and was rejected long ago (CLAUDE.md
-- → locked decisions). What the club has instead is a person: Seàn generates a
-- temporary password here, reads it out or sends it on WhatsApp to the number
-- the account gave, and the student changes it on the next sign-in. That is
-- slower than a link and it is the only channel that actually reaches a
-- fourteen-year-old in Essaouira.
--
-- ⚠️ IT RETURNS THE PASSWORD EXACTLY ONCE, AND NOTHING STORES IT. The caller
-- shows it on screen; a reload does not bring it back, because the only copy
-- left is a bcrypt hash. If it is lost, reset again — which costs one tap and is
-- the honest behaviour.
--
-- ⚠️ `is_admin_direct()`, NOT `is_staff()`. A prof marks a register; handing out
-- a credential for somebody else's account is not the same class of act. If the
-- club ever wants Michael to do it during a workshop, that is a decision to take
-- deliberately in a later migration, not a default to drift into.
--
-- ⚠️ EXISTING SESSIONS ARE REVOKED. After a reset the temporary password is the
-- only way in — otherwise a phone left signed in elsewhere keeps the old state
-- alive and "reset" means something different on each device.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_reset_password(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_pseudo text;
  v_words text[] := array[
    'tour', 'fou', 'pion', 'dame', 'roi', 'cavalier', 'mat', 'pat',
    'case', 'trait', 'roque', 'gambit', 'echec', 'partie', 'clou', 'menace'
  ];
  v_temp text;
begin
  if not public.is_admin_direct() then
    raise exception 'admin_reset_password is reserved to administrators';
  end if;
  if p_target is null then
    raise exception 'a target account is required';
  end if;

  select pseudo into v_pseudo from public.profiles where id = p_target;
  if v_pseudo is null then
    -- Either no such account, or a magic-link one. Both are refusals: giving a
    -- password to an account with no pseudo creates a credential that cannot be
    -- used to sign in, which would read as a broken reset.
    raise exception 'not_pseudo_account';
  end if;

  -- ⚠️ READ ALOUD OVER A PHONE LINE, SO: one lowercase word and four digits, no
  -- punctuation and no ambiguous characters. Short-lived by construction — the
  -- account is flagged below and the reader replaces it at the next sign-in.
  v_temp := v_words[1 + floor(random() * array_length(v_words, 1))::int]
            || lpad((floor(random() * 10000))::int::text, 4, '0');

  update auth.users
     set encrypted_password = extensions.crypt(v_temp, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_target;

  update public.profiles set must_change_password = true where id = p_target;

  -- Everything signed in with the old password stops being signed in.
  delete from auth.sessions where user_id = p_target;

  -- ⚠️ WRITTEN LAST-BUT-ONE AND INSIDE THE SAME TRANSACTION: if anything above
  -- fails, the log cannot claim a reset that did not happen.
  insert into public.password_resets (reset_by, account_id) values (auth.uid(), p_target);

  return v_temp;
end;
$$;

revoke all on function public.admin_reset_password(uuid) from public, anon;
grant execute on function public.admin_reset_password(uuid) to authenticated;

comment on function public.admin_reset_password(uuid) is
  'Admin-only. Sets a temporary password, flags the account for a forced change, '
  'revokes sessions, audits the act, and returns the password ONCE.';

-- ────────────────────────────────────────────────────────────────────────────
-- 11. admin_list_accounts() — now says pseudo, number and reset state
--
-- ⚠️ THE RETURN TYPE CHANGES, SO THE FUNCTION IS DROPPED AND RECREATED, AND THE
-- GRANT COMES BACK WITH IT. `create or replace` cannot change a `returns table`
-- shape — it fails with "cannot change return type of existing function", which
-- is exactly the sort of migration failure that is only discovered in production
-- if this file is not run anywhere first.
--
-- ⚠️ THE SYNTHETIC ADDRESS IS NULLED AT THE SOURCE. "Never shown to the reader"
-- is a rule about four surfaces; making the data unavailable is a rule about
-- one. The admin sees the pseudo, which is the name Seàn will say out loud on
-- the phone anyway.
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_list_accounts();

create function public.admin_list_accounts()
returns table (
  account_id uuid,
  email text,
  created_at timestamptz,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  display_name text,
  role text,
  children integer,
  solved integer,
  pseudo text,
  whatsapp text,
  contact_email text,
  must_change_password boolean
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
      -- ⚠️ NULL for a pseudo account: the synthetic address leaves the database
      -- nowhere, so no surface can leak what it never received.
      case
        when u.email like ('%@' || public.pseudo_email_domain()) then null
        else u.email::text
      end,
      u.created_at,
      u.email_confirmed_at,
      u.last_sign_in_at,
      p.display_name,
      p.role,
      (select count(*)::int from public.child_profiles c where c.account_id = u.id),
      (select count(*)::int
         from public.exercise_progress e
         join public.child_profiles c2 on c2.id = e.child_id
        where c2.account_id = u.id and e.solved),
      p.pseudo,
      p.guardian_phone,
      p.contact_email,
      coalesce(p.must_change_password, false)
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_accounts() from public, anon, authenticated;
grant execute on function public.admin_list_accounts() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. admin_list_password_resets() — the journal, with names
--
-- A plain `select` on `password_resets` would answer with ids an admin cannot
-- read. This joins the two profiles the row points at. It is admin-only for the
-- same reason the table's policy is: knowing whose password was reset is knowing
-- something about a family, not about the club.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_password_resets()
returns table (
  id uuid,
  reset_at timestamptz,
  account_id uuid,
  pseudo text,
  display_name text,
  reset_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_direct() then
    raise exception 'admin_list_password_resets is reserved to administrators';
  end if;

  return query
    select r.id, r.reset_at, r.account_id, t.pseudo, t.display_name, b.display_name
      from public.password_resets r
      left join public.profiles t on t.id = r.account_id
      left join public.profiles b on b.id = r.reset_by
     order by r.reset_at desc
     limit 100;
end;
$$;

revoke all on function public.admin_list_password_resets() from public, anon;
grant execute on function public.admin_list_password_resets() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — after applying, against the catalog. NEVER against
-- `supabase_migrations.schema_migrations`, which is not a record of what
-- production holds (see CLAUDE.md → Deployment).
--
--   -- `authenticated` may still write exactly FOUR columns of `profiles`,
--   -- and `pseudo` / `guardian_phone` / `must_change_password` are NOT among them.
--   select column_name from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles'
--      and grantee='authenticated' and privilege_type='UPDATE';
--   -- → display_name, locale, onboarded_at, account_shape   (⚠️ NEVER role, NEVER pseudo)
--
--   -- `anon` holds exactly one table grant in the whole schema, still.
--   select table_name, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and grantee='anon';
--   -- → sessions / SELECT, and nothing else
--
--   -- `anon` may execute exactly one function of this migration's set.
--   select p.proname, array_agg(a.rolname order by a.rolname)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     cross join lateral (select rolname from pg_roles where rolname in ('anon','authenticated','service_role')) a
--    where n.nspname='public'
--      and p.proname in ('register_with_pseudo','change_own_password','update_own_contact',
--                        'admin_reset_password','admin_list_password_resets')
--      and has_function_privilege(a.rolname, p.oid, 'execute')
--    group by p.proname;
--   -- → register_with_pseudo: {anon, authenticated}; everything else: {authenticated}
--
--   -- The namespace guard is on the door.
--   select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;
--   -- → on_auth_user_created, on_auth_user_guard_pseudo
-- ────────────────────────────────────────────────────────────────────────────
