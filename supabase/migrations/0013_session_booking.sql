-- ════════════════════════════════════════════════════════════════════════════
-- 0013 — session booking: the agenda stops informing and starts enrolling
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. A fix is 0014.
--
-- A member reserves a place for a child in a published session. One row per
-- (session, child) — a parent with two attending children makes two bookings,
-- and a parent who plays alongside them books their OWN child profile the same
-- way (Critical Feature 57, the "les deux" case). There is no second shape for
-- an adult learner, because there is no second shape for a learner at all.
--
-- ═══ ⚠️ THE THREE RULES THIS MIGRATION EXISTS TO HOLD ═══════════════════════
--
--   1. CAPACITY IS ENFORCED IN POSTGRES, NEVER IN CLIENT CODE. There is no
--      INSERT policy on `bookings` for a parent at all: rows arrive only from
--      `create_booking()`, which takes a row lock before it counts. A client
--      that bypasses the UI gets `42501`, not an overbooked session.
--
--   2. ⚠️⚠️ A BOOKING MUST NEVER WRITE TO `sessions`. 0011 hangs statement-level
--      rebuild triggers on that table, so ANY update to a session row asks
--      Cloudflare to rebuild the site. A denormalised `bookings_count` column
--      on `sessions` — the obvious optimisation, and the one a future session
--      will reach for — would turn every booking into a production deploy.
--      The count is derived by counting, and `select … for update` is a LOCK,
--      not a write: it fires no trigger. See section 5.
--
--   3. THE PUBLIC AGENDA IS BAKED, SO THE BUILD-TIME NUMBER IS A HINT AND THIS
--      FUNCTION IS THE TRUTH. `/agenda/` can say "3 places" while the true
--      count is 0. `create_booking()` therefore returns a CODE the surface
--      renders, and a stale page produces a readable refusal rather than a
--      silent no-op. See section 4 on why a code and not a sentence.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. sessions.capacity and sessions.overbook_margin
--
-- ⚠️ THE MARGIN IS A FEATURE, NOT A BUG, AND IT WILL LOOK LIKE ONE. A session
-- with capacity 12 and margin 2 accepts FOURTEEN bookings. That is deliberate
-- and it is Seàn's decision: cancellations are frequent, the venue absorbs the
-- overflow, and turning a parent away from a session that will have empty
-- chairs is the worse failure. A future session reading "capacity 12" and
-- finding 14 confirmed bookings must not "fix" this.
--
-- Both are per session and editable, because a room is not always the same
-- room: an outdoor summer session and a Dar Souiri afternoon do not hold the
-- same number of children.
--
-- ⚠️ ADDING A COLUMN IS DDL AND FIRES NO ROW TRIGGER. `alter table … add
-- column … default` does not rewrite the table in PG11+ and does not enter
-- 0011's insert/update/delete triggers, so this migration does not itself ask
-- for a rebuild.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.sessions
  add column if not exists capacity integer not null default 12,
  add column if not exists overbook_margin integer not null default 2;

do $capacity_checks$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_capacity_positive'
  ) then
    alter table public.sessions
      add constraint sessions_capacity_positive check (capacity > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_overbook_margin_sane'
  ) then
    alter table public.sessions
      add constraint sessions_overbook_margin_sane
      check (overbook_margin >= 0 and overbook_margin <= 20);
  end if;
end
$capacity_checks$;

comment on column public.sessions.capacity is
  'Places the prof intends to seat. Default 12, editable per session.';
comment on column public.sessions.overbook_margin is
  'Bookings accepted ABOVE capacity. Default 2. NOT a bug: cancellations are '
  'frequent and the venue absorbs the overflow, so a session of 12 accepts 14 '
  'rather than turning a parent away. Decision taken by Seàn — see 0013.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. bookings
--
-- ⚠️ KEYED ON `child_id`, NOT `profile_id`. The learner is a child profile and
-- never the account (Critical Feature 40) — the same shape `attendance` was
-- rebuilt into by 0005, which is what lets the register pre-list booked
-- children without translating between two notions of "who".
--
-- ⚠️ `booked_by` IS AN ACCOUNT AND IS DELIBERATELY A DIFFERENT COLUMN. Actors
-- stay on `profiles` (0005): the person who made the reservation is a login,
-- the person attending is a learner. For an autonomous teenager they refer to
-- the same human and still to two different rows, and that is correct.
--
-- ⚠️ CANCELLED ROWS ARE KEPT, NEVER DELETED. Same reasoning as Critical
-- Feature 46 for sessions: a parent who cancelled and a parent who never
-- booked are different situations, and only one of them needs explaining when
-- a child turns up anyway.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  child_id uuid not null references public.child_profiles (id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  -- The ACCOUNT that made the reservation. Null once that account is deleted:
  -- the booking survives its booker, because the prof still needs the list.
  booked_by uuid references public.profiles (id) on delete set null,
  -- Why it is cancelled, when it is. Drives which sentence the member reads:
  -- "vous avez annulé" and "la séance a été annulée" are not the same news.
  cancel_reason text check (
    cancel_reason is null or cancel_reason in ('member', 'staff', 'session_cancelled')
  ),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

comment on table public.bookings is
  'One reservation: one child profile in one session. Cancelled rows are kept, '
  'never deleted. Rows arrive ONLY from create_booking() — there is no insert '
  'policy for a parent, because capacity is enforced in Postgres.';

-- ⚠️ THE PARTIAL UNIQUE INDEX IS WHAT MAKES CANCELLATION FREE THE PLACE.
-- A plain `unique (session_id, child_id)` would let a child cancel once and
-- never re-book, because the cancelled row would keep occupying the key. This
-- shape constrains only LIVE bookings, so the same child may cancel and book
-- again any number of times while never holding two places at once.
create unique index if not exists bookings_one_live_per_child
  on public.bookings (session_id, child_id)
  where status <> 'cancelled';

-- Every read is "the bookings for this session" (the prof's list, the count in
-- create_booking) or "the bookings for this child" (the member's own view).
create index if not exists bookings_session_idx on public.bookings (session_id);
create index if not exists bookings_child_idx on public.bookings (child_id);

-- ⚠️ THE REVOKE IS NOT BELT AND BRACES (0008). A Supabase project ships
-- `alter default privileges … grant all on tables to anon, authenticated`, so
-- the `create table` above has ALREADY handed `anon` the full set. Seven
-- tables shipped that way before 0008 repaired them.
revoke all on public.bookings from anon, authenticated;

alter table public.bookings enable row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. bookings RLS
--
-- ⚠️ NOTE WHAT IS ABSENT: there is NO insert policy for a parent, and no
-- update or delete policy either. That is the enforcement, not an oversight.
-- Booking and cancelling both go through SECURITY DEFINER functions that check
-- ownership themselves; a parent calling PostgREST directly can READ their own
-- children's bookings and can do nothing else. This is what makes "a parent
-- cannot exceed capacity by writing directly" true of the database rather than
-- true of the UI.
--
-- ⚠️ ANONYMOUS READS NOTHING. The revoke above already denies it at GRANT
-- level, which is the layer that produces `42501` rather than an empty list —
-- and an empty list is what a policy alone would give, which reads to a caller
-- like "this child has no bookings" rather than "you may not ask".
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select using (public.owns_child(child_id));

drop policy if exists bookings_staff_all on public.bookings;
create policy bookings_staff_all on public.bookings
  for all using (public.is_staff()) with check (public.is_staff());

grant select on public.bookings to authenticated;
-- Staff manage bookings directly (add a walk-in, correct a mistake); the
-- policy above is what limits these to staff. A parent holding the same grant
-- is still refused by RLS.
grant insert, update, delete on public.bookings to authenticated;
-- ⚠️ EVERY NEW TABLE GRANTS service_role EXPLICITLY. 0002 exists solely to
-- repair that omission across every table that already existed, and 0003
-- reproduced the bug anyway. The seed and the e2e purge run as service_role.
grant select, insert, update, delete on public.bookings to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. create_booking — the only way a booking row is born
--
-- ⚠️ IT RETURNS A CODE, NOT A SENTENCE, AND THAT IS A DELIBERATE DEPARTURE
-- from "the rejection must be readable in French". The member surface is
-- FR/EN (the admin surface is the French-only one), and a French string handed
-- out by Postgres cannot be rendered in English by the page that receives it.
-- So the database returns `full`, `already`, `past`, `not_published`,
-- `forbidden` or `ok`, and `src/i18n/ui.ts` owns both sentences. The rule the
-- brief was protecting — a stale page must never produce a silent or cryptic
-- failure — is kept, and kept in both languages.
--
-- ⚠️ SECURITY DEFINER, SO IT MUST CHECK OWNERSHIP ITSELF. Running as owner
-- bypasses RLS entirely; `owns_child()` is therefore not a nicety here, it is
-- the whole authorisation. A missing check would let any signed-in account
-- book any child in the club.
--
-- ⚠️ THE LOCK IS TAKEN BEFORE THE COUNT, AND ON THE SESSION ROW. Two parents
-- booking the last place must not both succeed. `select … for update` on
-- `public.sessions` serialises them: the second transaction blocks until the
-- first commits, and only then counts — by which time the first booking is
-- visible to it. Counting first and locking after would let both read 13 of
-- 14 and both insert.
--
-- ⚠️⚠️ AND THE LOCK IS NOT A WRITE. `for update` takes a row lock; it does not
-- UPDATE `sessions` and therefore does not enter 0011's rebuild triggers,
-- which are `after insert/update/delete on public.sessions`. This is the whole
-- reason capacity is counted rather than cached in a column.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.create_booking(child uuid, session uuid)
returns table (ok boolean, code text, booking_id uuid, places_left integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.sessions%rowtype;
  taken integer;
  limit_total integer;
  new_id uuid;
begin
  -- ⚠️ THE LOCK, FIRST. Everything below reads a session nobody else can
  -- change or book against until this transaction ends.
  select * into s from public.sessions where id = session for update;

  if not found then
    return query select false, 'no_session'::text, null::uuid, 0;
    return;
  end if;

  -- Ownership before anything else that could leak state about the session.
  if not (public.owns_child(child) or public.is_staff()) then
    return query select false, 'forbidden'::text, null::uuid, 0;
    return;
  end if;

  if s.status <> 'published' then
    -- Covers both a draft (never announced) and a cancelled session. A member
    -- can only ever have reached this through a stale baked page.
    return query select false, 'not_published'::text, null::uuid, 0;
    return;
  end if;

  if s.starts_at <= now() then
    return query select false, 'past'::text, null::uuid, 0;
    return;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.session_id = session and b.child_id = child and b.status <> 'cancelled'
  ) then
    return query select false, 'already'::text, null::uuid, 0;
    return;
  end if;

  limit_total := s.capacity + s.overbook_margin;

  select count(*) into taken
  from public.bookings b
  where b.session_id = session and b.status = 'confirmed';

  if taken >= limit_total then
    return query select false, 'full'::text, null::uuid, 0;
    return;
  end if;

  insert into public.bookings (session_id, child_id, status, booked_by)
  values (session, child, 'confirmed', auth.uid())
  returning id into new_id;

  return query select true, 'ok'::text, new_id, (limit_total - taken - 1);
end;
$$;

comment on function public.create_booking(uuid, uuid) is
  'The ONLY way a booking is created. Locks the session row before counting, '
  'so two parents cannot both take the last place. Returns a CODE for the '
  'surface to render in FR or EN — never a sentence. Never writes to '
  'sessions: a write there would fire 0011''s rebuild trigger.';

revoke all on function public.create_booking(uuid, uuid) from public, anon;
grant execute on function public.create_booking(uuid, uuid) to authenticated;
grant execute on function public.create_booking(uuid, uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. cancel_booking — and the two-hour cutoff, enforced HERE
--
-- ⚠️ THE CUTOFF IS A DATABASE RULE, NOT A DISABLED BUTTON. The surface greys
-- the control out and says why, which is the courtesy; this is the rule. A
-- member whose page was rendered three hours ago is exactly the person who
-- will press it at 1h59.
--
-- ⚠️ STAFF ARE NOT BOUND BY IT, deliberately: "after that, the prof handles
-- it" is the decision, and the prof handling it means the prof can cancel.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_booking(booking uuid)
returns table (ok boolean, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.bookings%rowtype;
  s public.sessions%rowtype;
  staff boolean;
begin
  select * into b from public.bookings where id = booking;
  if not found then
    return query select false, 'no_booking'::text;
    return;
  end if;

  staff := public.is_staff();

  if not (public.owns_child(b.child_id) or staff) then
    return query select false, 'forbidden'::text;
    return;
  end if;

  if b.status = 'cancelled' then
    -- Idempotent rather than an error: a double tap on a phone must not read
    -- as a failure.
    return query select true, 'ok'::text;
    return;
  end if;

  select * into s from public.sessions where id = b.session_id;

  if not staff and s.starts_at - interval '2 hours' <= now() then
    return query select false, 'too_late'::text;
    return;
  end if;

  update public.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = case when staff and not public.owns_child(b.child_id)
                             then 'staff' else 'member' end
  where id = booking;

  return query select true, 'ok'::text;
end;
$$;

comment on function public.cancel_booking(uuid) is
  'Cancels one booking, freeing its place via the partial unique index. The '
  'two-hour cutoff lives here, not in the button. Staff are exempt, because '
  '"after that the prof handles it" means the prof can.';

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. session_availability — how a member reads the LIVE count
--
-- ⚠️ A MEMBER CANNOT COUNT BOOKINGS THEMSELVES, BY DESIGN. `bookings_select_own`
-- shows a parent their own children's rows and nothing else, so
-- `select count(*)` would return their own booking count, not the session's.
-- That is the correct privacy boundary — who else booked is not a parent's
-- business — and it is why this function exists rather than a view over the
-- table.
--
-- It returns numbers only: a count and a remainder, never a name.
--
-- ⚠️ NOT GRANTED TO `anon`. A signed-out reader must cause ZERO requests to
-- any Supabase origin on `/agenda/` (the guest zero-request rule), so they see
-- the BAKED number and an invitation to sign in. Granting anon here would make
-- it tempting for the page to call it on load and break that rule silently.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.session_availability()
returns table (
  session_id uuid,
  capacity integer,
  overbook_margin integer,
  booked integer,
  places_left integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.capacity,
    s.overbook_margin,
    coalesce(b.n, 0)::integer,
    greatest(s.capacity + s.overbook_margin - coalesce(b.n, 0), 0)::integer
  from public.sessions s
  left join (
    select session_id, count(*)::integer as n
    from public.bookings
    where status = 'confirmed'
    group by session_id
  ) b on b.session_id = s.id
  where s.status in ('published', 'cancelled');
$$;

comment on function public.session_availability() is
  'Live places remaining per publicly visible session. Numbers only, never a '
  'name. Not granted to anon: the agenda is baked and a signed-out reader must '
  'make no request at all.';

revoke all on function public.session_availability() from public, anon;
grant execute on function public.session_availability() to authenticated;
grant execute on function public.session_availability() to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. A cancelled session cancels its bookings — visibly, never orphaned
--
-- ⚠️ ROW-LEVEL, AND ON `sessions`, WHICH IS ALREADY TRIGGERED. This adds a
-- second trigger to a table that carries 0011's rebuild hooks. That is safe
-- and worth stating plainly: 0011's triggers are FOR EACH STATEMENT and fire
-- once per statement regardless of how many other triggers exist, and this one
-- writes only to `bookings`, which has no rebuild trigger of its own. Bulk
-- cancelling a thirteen-session series therefore still asks for exactly one
-- rebuild.
--
-- ⚠️ IT MUST NEVER FAIL THE WRITE, for the same reason 0011's may not
-- (Critical Feature 70): a prof cancelling a session in front of a room of
-- children must not be blocked because something downstream objected.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.sessions_cancel_bookings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' then
    begin
      update public.bookings
        set status = 'cancelled',
            cancelled_at = now(),
            cancel_reason = 'session_cancelled'
      where session_id = new.id and status <> 'cancelled';
    exception when others then
      -- Swallow, like 0011. A booking left confirmed against a cancelled
      -- session is visible on the prof's list; a prof unable to cancel is not
      -- recoverable in the room.
      null;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists sessions_cancel_bookings on public.sessions;
create trigger sessions_cancel_bookings
  after update of status on public.sessions
  for each row execute function public.sessions_cancel_bookings();

comment on function public.sessions_cancel_bookings() is
  'When a session becomes cancelled, its live bookings become cancelled with '
  'reason session_cancelled — visible to the member, never orphaned. Swallows '
  'failures: it may never block a prof from cancelling.';
