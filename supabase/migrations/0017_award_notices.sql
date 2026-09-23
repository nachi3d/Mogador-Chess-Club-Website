-- ════════════════════════════════════════════════════════════════════════════
-- 0017 — telling a student a prof gave them jetons
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. A fix is 0018.
--
-- Until now an award appeared silently: the student saw it only if they opened
-- /boutique/ and happened to compare. 0004 made the reason REQUIRED because
-- "points that appear with no explanation destroy trust" — and a reason nobody
-- reads is the same as no reason. Since 0016 jetons buy real objects, so an
-- unexplained balance change is worse than it was.
--
-- ═══ ⚠️ WHAT THIS STORES, AND WHAT IT DOES NOT ══════════════════════════════
--
--   A READ CURSOR, PER CHILD PROFILE. Nothing else.
--
--   `child_profiles.awards_seen_at` is "the newest award this child has been
--   shown and acknowledged". An award is UNREAD when its `awarded_at` is later.
--   There is no notification table, no copy of the amount, no copy of the
--   reason and no unread COUNT: the notice is a query over `point_awards`, the
--   same rows `jeton_balances()` sums. So nothing stored here can disagree with
--   the balance — a withdrawn award (the "undo" on /admin/jetons/) simply stops
--   being in the notice, exactly as it stops being in the balance.
--
--   ⚠️ A CURSOR, NOT A SET OF READ IDS, because "read" only ever moves one way
--   and a timestamp cannot grow without bound. It never feeds a total.
--
-- ═══ ⚠️ WHY IT LIVES ON THE CHILD AND NOT IN localStorage ═══════════════════
--
--   The brief says "per child profile", and the device is the wrong owner: a
--   student reads it on the club tablet and a parent's phone must not announce
--   it again, and a cleared browser must not re-announce a whole term of
--   awards at once. The account is the caller (a child profile never is —
--   0005), so the write is the account acting for its own child.
--
-- ═══ ⚠️ THE BACKFILL IS "EVERYTHING BEFORE TODAY IS READ" ═══════════════════
--
--   `default now()` on an existing table stamps every existing row with the
--   moment this migration runs. That is deliberate: without it the first visit
--   after release would present every award since 0004 as news. What a student
--   has already been given is not new; what a prof gives from now on is.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.child_profiles
  add column if not exists awards_seen_at timestamptz not null default now();

comment on column public.child_profiles.awards_seen_at is
  'Read cursor for jeton awards: an award with a later awarded_at is unread. '
  'Moved only forward, only by mark_awards_seen(). Never a count, never a '
  'balance — the notice is a query over point_awards (0017).';

-- ⚠️ THE OWNER CAN ALREADY WRITE THIS COLUMN DIRECTLY — `child_profiles_own`
-- is `for all` and the table grant is not per-column (0005). That is accepted,
-- not overlooked: the only thing a family can do with it is hide or re-show
-- their OWN notices. It grants nothing, it is read by no summation, and staff
-- cannot write it at all. `mark_awards_seen()` is the path the site uses
-- because it is the one that cannot move the cursor backwards.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. award_notices — the unread awards, with the prof's name
--
-- ⚠️ SECURITY DEFINER BECAUSE OF ONE COLUMN: the prof's `display_name`. A
-- member cannot read another account's `profiles` row (0001: own or staff),
-- and "who gave it" is the point — a teacher award exists so that the
-- judgement is visible. The function returns that one field of the giver and
-- nothing else of theirs: not the pseudo (a login name), not the email.
--
-- ⚠️ `c.account_id = auth.uid()` — THE CALLER'S OWN CHILDREN ONLY, STAFF
-- INCLUDED. A prof opening the home page is not shown every child's awards;
-- they are shown their own children's, like any parent. Staff have
-- /admin/jetons/ for the room.
--
-- ⚠️ A GIVER WITH NO NAME IS NULL, NEVER A PLACEHOLDER. `awarded_by` is `on
-- delete set null` (0004) and a prof may never have set a display name. The
-- member surface owns the wording for that case ("le club"), in both locales
-- (Critical Feature 74's reasoning: the database returns data, not sentences).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.award_notices()
returns table (
  award_id uuid,
  child_id uuid,
  child_name text,
  jetons integer,
  reason text,
  awarded_at timestamptz,
  given_by text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    w.id,
    w.child_id,
    c.display_name,
    w.points,
    w.reason,
    w.awarded_at,
    nullif(btrim(p.display_name), '')
  from public.point_awards w
  join public.child_profiles c on c.id = w.child_id
  left join public.profiles p on p.id = w.awarded_by
  where c.account_id = auth.uid()
    and w.awarded_at > c.awards_seen_at
  order by c.display_name, w.awarded_at desc;
$$;

comment on function public.award_notices() is
  'Unread jeton awards for the caller''s OWN children (staff included — no '
  'exemption), with the giving prof''s display name or NULL. A query over '
  'point_awards and the per-child read cursor; stores nothing (0017).';

-- ⚠️ NOT TO `anon`: a signed-out reader makes no request at all.
revoke all on function public.award_notices() from public, anon;
grant execute on function public.award_notices() to authenticated;
grant execute on function public.award_notices() to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. mark_awards_seen — "Compris", for one child
--
-- ⚠️ IT TAKES THE NEWEST AWARD THE READER WAS SHOWN, NOT A TIMESTAMP AND NOT
-- "NOW". Two reasons:
--
--   • "now()" would swallow an award a prof gave while the page was open — the
--     reader acknowledged what was on screen, not what arrived after.
--   • a timestamp would round-trip through JavaScript, whose Date keeps
--     milliseconds while Postgres keeps microseconds. The cursor would land
--     just BEFORE the award it meant, and that award would stay unread forever.
--     Resolving the id here uses the stored value, so there is nothing to round.
--
-- ⚠️ `greatest()` — THE CURSOR ONLY MOVES FORWARD. Acknowledging an old notice
-- in a stale tab must not re-open newer ones.
--
-- ⚠️ IT RETURNS A CODE (CF74) AND IS A WRITE, SO IT FAILS LOUDLY: the page
-- keeps the notice and says it was not saved rather than pretending.
-- `child_profiles` carries no trigger, so this fires nothing (compare CF67).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_awards_seen(child uuid, through_award uuid)
returns table (ok boolean, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stamp timestamptz;
begin
  -- Ownership first, and ownership by the ACCOUNT: staff get no exemption here
  -- either — a prof cannot mark a student's notice read on their behalf.
  if child is null or not exists (
    select 1 from public.child_profiles c where c.id = child and c.account_id = auth.uid()
  ) then
    return query select false, 'forbidden'::text;
    return;
  end if;

  select w.awarded_at into stamp
  from public.point_awards w
  where w.id = through_award and w.child_id = child;

  if stamp is null then
    return query select false, 'no_award'::text;
    return;
  end if;

  update public.child_profiles
     set awards_seen_at = greatest(awards_seen_at, stamp)
   where id = child;

  return query select true, 'ok'::text;
end;
$$;

comment on function public.mark_awards_seen(uuid, uuid) is
  'Moves one child''s award read cursor forward to the given award''s own '
  'awarded_at. Owner account only; never backwards; returns a code (0017).';

revoke all on function public.mark_awards_seen(uuid, uuid) from public, anon;
grant execute on function public.mark_awards_seen(uuid, uuid) to authenticated;
grant execute on function public.mark_awards_seen(uuid, uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Verification against the catalog (production is asked per migration, never
-- via schema_migrations — see docs/reference/deployment.md):
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'child_profiles'
--      and column_name = 'awards_seen_at';                 -- one row
--   select proname from pg_proc
--    where proname in ('award_notices', 'mark_awards_seen'); -- two rows
-- ────────────────────────────────────────────────────────────────────────────
