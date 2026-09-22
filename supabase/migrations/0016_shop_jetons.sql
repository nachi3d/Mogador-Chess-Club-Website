-- ════════════════════════════════════════════════════════════════════════════
-- 0016 — the shop: jetons, a catalogue the database can price, and redemptions
--
-- ⚠️ MIGRATIONS ARE NUMBERED AND NEVER EDITED AFTER MERGE. A fix is 0017.
--
-- Points become worth a real object, and that changes the threat model before
-- it changes the UI. A point bought nothing, so a declarative total was a
-- colour on a badge. A jeton buys a keyring, so a declarative total is theft.
--
-- ═══ ⚠️ THE RULE THIS MIGRATION EXISTS TO HOLD ══════════════════════════════
--
--   JETONS ARE EARNED ONLY FROM ROWS A STUDENT CANNOT WRITE.
--
--   The first draft of the brief said "compute the balance in Postgres from
--   exercise_progress, game_results and point_awards". That proves nothing:
--   `exercise_progress` and `game_results` are `for all using owns_child()`
--   (0005), so a student with their own token can PATCH `solved = true` onto
--   every real exercise key, and Postgres would value those rows exactly like
--   real solves. Moving the SUM server-side stops a client sending a total; it
--   does nothing about a client sending fake ROWS. Seàn's decision (2026-09-22):
--
--     • POINTS stay the rank and the progress — derived, declarative, as E3.
--     • JETONS (FR) / TOKENS (EN) are what the shop spends. They come from
--       `point_awards` ONLY: a prof wrote the row, a student gets `42501`
--       (0004, re-proved by shop.spec.ts). The table keeps its name; its ROLE
--       in the copy is now "jetons given by a prof".
--     • `point_awards` NO LONGER FEED THE POINTS TOTAL (computeLedger and the
--       inline resolver, same commit), so the two numbers never read as one.
--
--   ⚠️ A FUTURE SESSION MUST NOT ADD A CLIENT-WRITABLE SOURCE TO
--   `jeton_balances()`. "Also count solved exercises, it's only fair" is the
--   exact regression this header exists to stop: it re-opens the 900-point
--   hole the whole feature was built to close.
--
--   ⚠️ JETONS ARE NEVER PURCHASABLE WITH MONEY. Nothing here, and nothing in
--   the site, turns dirhams into a `point_awards` row. The WhatsApp path uses
--   jetons AS a discount on a cash price; it never sells them.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. shop_items — the database's copy of what each item COSTS
--
-- ⚠️ THE CATALOGUE LIVES IN GIT (src/content/boutique/) AND THE PRICE MUST BE
-- TRUSTED BY THE DATABASE. Those two facts force a second copy: if `redeem()`
-- took the price from the caller, a student would redeem a figurine for one
-- jeton. So an admin PUBLISHES the git catalogue into this table from
-- `/admin/boutique/` (whose page is built from the same git content), and the
-- page says loudly when the two disagree — the same staleness-made-loud answer
-- the baked agenda uses. Names, descriptions and images stay in git only: the
-- database needs the numbers it enforces and nothing else.
--
-- ⚠️ STOCK IS A FLAG, NOT A COUNT, AND IT LIVES HERE RATHER THAN IN GIT.
-- Seàn and Michael manage stock in the room. A flag in git would make "we ran
-- out of keyrings" a commit and a Cloudflare build; a flag here is one tap on
-- `/admin/boutique/`. A COUNT was considered and rejected: nobody at the club
-- counts inventory, a count that drifts from the shelf refuses a child an item
-- that is sitting in the box, and a pending order is already the reservation.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.shop_items (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  price_jetons integer check (price_jetons is null or price_jetons > 0),
  price_mad integer check (price_mad is null or price_mad > 0),
  allow_jetons boolean not null default false,
  allow_whatsapp boolean not null default false,
  in_stock boolean not null default true,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  constraint shop_items_jetons_priced check (not allow_jetons or price_jetons is not null),
  constraint shop_items_whatsapp_priced check (not allow_whatsapp or price_mad is not null)
);

comment on table public.shop_items is
  'What each shop item costs, as the DATABASE enforces it. Published from the '
  'git catalogue by an admin; redeem() reads prices from here, never from the '
  'caller. Stock is a flag toggled in /admin/boutique/, not a count.';

-- ⚠️ THE REVOKE IS NOT BELT AND BRACES (0008): `create table` has already
-- handed `anon` and `authenticated` the full set via default privileges.
revoke all on public.shop_items from anon, authenticated;
alter table public.shop_items enable row level security;

-- Members read prices and stock (the product page greys an out-of-stock item
-- live). No write policy for anybody: writes are the two admin functions below.
drop policy if exists shop_items_select_members on public.shop_items;
create policy shop_items_select_members on public.shop_items
  for select to authenticated using (true);

grant select on public.shop_items to authenticated;
-- ⚠️ EVERY NEW TABLE GRANTS service_role EXPLICITLY (0002, and 0003 again).
grant select, insert, update, delete on public.shop_items to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. redemptions — one order, spending jetons
--
-- ⚠️ SPENT JETONS ARE RECORDED, NEVER SUBTRACTED FROM A STORED TOTAL. There is
-- no balance column anywhere: balance = awarded − redeemed, both summed from
-- rows every time (CF33's rule, applied to the second currency).
--
-- ⚠️ ROWS ARRIVE ONLY FROM `redeem()`. `authenticated` holds SELECT and
-- nothing else on this table — not even staff write it directly — so every
-- redemption passed through the lock and the recomputation below.
--
-- ⚠️ CANCELLED ROWS ARE KEPT (CF46's reasoning). A cancelled order stops
-- counting against the balance and stays visible, so "where did my jetons go"
-- always has an answer on the page.
--
-- ⚠️ THE CARD PATH HAS NO ROW HERE. Paying by card is a link out to
-- nachi3dlabs.com: no jetons, no order, no payment code on this site, ever.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.child_profiles (id) on delete cascade,
  item_slug text not null,
  path text not null check (path in ('jetons', 'whatsapp')),
  jetons integer not null check (jetons >= 0),
  -- The price as it was at the moment of the order. The item's price may
  -- change later; what this child agreed to pay may not.
  price_jetons integer,
  price_mad integer,
  status text not null default 'pending'
    check (status in ('pending', 'handed_over', 'cancelled')),
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  handed_over_at timestamptz,
  handed_over_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or cancel_reason in ('member', 'staff')),
  -- A points-only order must spend something; a WhatsApp order may use none.
  constraint redemptions_jetons_path_spends check (path <> 'jetons' or jetons > 0)
);

comment on table public.redemptions is
  'One shop order. Rows arrive ONLY from redeem(), which locks the child and '
  'recomputes the balance in the same transaction. Cancelled rows are kept and '
  'stop counting. No balance is stored anywhere.';

create index if not exists redemptions_child_idx on public.redemptions (child_id, created_at desc);
create index if not exists redemptions_pending_idx on public.redemptions (status, created_at)
  where status = 'pending';

revoke all on public.redemptions from anon, authenticated;
alter table public.redemptions enable row level security;

drop policy if exists redemptions_select_own on public.redemptions;
create policy redemptions_select_own on public.redemptions
  for select using (public.owns_child(child_id));

drop policy if exists redemptions_select_staff on public.redemptions;
create policy redemptions_select_staff on public.redemptions
  for select using (public.is_staff());

-- ⚠️ SELECT ONLY. No insert, update or delete for `authenticated`, staff
-- included: the functions below are the only writers.
grant select on public.redemptions to authenticated;
grant select, insert, update, delete on public.redemptions to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. jeton_balances — THE ONE SUMMATION
--
-- ⚠️ ONE FUNCTION FOR THE MEMBER AND THE STAFF, so a prof and a child never
-- read different balances (CF47's rule for the second currency). It returns
-- the caller's own children for a member and every child for staff.
--
-- ⚠️ ITS INPUTS ARE `point_awards` AND `redemptions`, AND NOTHING ELSE. Both
-- are unwritable by a student. See the header before adding a third.
--
-- ⚠️ NOT GRANTED TO `anon`. A signed-out reader on /boutique/ makes no request
-- at all (the guest zero-request rule).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.jeton_balances()
returns table (child_id uuid, earned integer, spent integer, balance integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    coalesce(a.n, 0)::integer,
    coalesce(r.n, 0)::integer,
    (coalesce(a.n, 0) - coalesce(r.n, 0))::integer
  from public.child_profiles c
  left join (
    select w.child_id, sum(w.points) as n from public.point_awards w group by w.child_id
  ) a on a.child_id = c.id
  left join (
    select x.child_id, sum(x.jetons) as n
    from public.redemptions x
    where x.status <> 'cancelled'
    group by x.child_id
  ) r on r.child_id = c.id
  where c.account_id = auth.uid() or public.is_staff();
$$;

comment on function public.jeton_balances() is
  'Jetons per child: awarded (point_awards) minus redeemed (live redemptions). '
  'The caller''s own children, or every child for staff. The ONLY summation. '
  'Its inputs are rows a student cannot write — never add one they can.';

revoke all on function public.jeton_balances() from public, anon;
grant execute on function public.jeton_balances() to authenticated;
grant execute on function public.jeton_balances() to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. redeem — the only way a redemption is born
--
-- ⚠️ SECURITY DEFINER, SO IT CHECKS OWNERSHIP ITSELF. `owns_child()` is the
-- whole authorisation: without it any account could spend any child's jetons.
-- Staff get no exemption — a prof redeems for their OWN profile or not at all.
--
-- ⚠️ THE LOCK IS TAKEN BEFORE THE BALANCE IS READ, ON THE CHILD ROW — the
-- create_booking() pattern. Two tabs spending the same jetons serialise: the
-- second blocks until the first commits and then sums a balance that already
-- includes the first order. Summing first and locking after would let both
-- read 30 and both spend it.
--
-- ⚠️⚠️ `FOR NO KEY UPDATE`, NOT `FOR UPDATE`. A prof inserting a
-- `point_awards` row takes `FOR KEY SHARE` on the child through the foreign
-- key; `FOR UPDATE` conflicts with that and would make a prof's tap in the
-- room wait on a child's order. `FOR NO KEY UPDATE` still conflicts with
-- itself — which is the serialisation this needs — and not with the FK check.
-- It is a lock, not a write: `child_profiles` carries no trigger.
--
-- ⚠️ THE PRICE COMES FROM `shop_items`, NEVER FROM THE CALLER. The only number
-- a caller supplies is how many jetons to put toward a WhatsApp order, and it
-- is checked against the cap computed here.
--
-- ⚠️ THE DISCOUNT CAP IS 25% OF THE DIRHAM PRICE, AT 1 JETON = 1 DH, ROUNDED
-- DOWN. Seàn's brief allowed 20–30%; 25% is the middle, and at the club's
-- rhythm (a few jetons a session) it means a 150 DH figurine can take 37 DH
-- off after a couple of months of Saturdays — real, and never most of the
-- price. `src/lib/shop.ts` mirrors both numbers for display only.
--
-- ⚠️ IT RETURNS A CODE, NEVER A SENTENCE (CF74): the member surface is FR/EN
-- and `src/i18n/ui.ts` owns both wordings.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.redeem(
  child uuid,
  item text,
  via text,
  discount integer default null
)
returns table (ok boolean, code text, redemption_id uuid, balance integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it public.shop_items%rowtype;
  have integer;
  cost integer;
  cap integer;
  new_id uuid;
begin
  -- Ownership first: nothing below may leak state about somebody else's child.
  if child is null or not public.owns_child(child) then
    return query select false, 'forbidden'::text, null::uuid, 0;
    return;
  end if;

  -- ⚠️ THE LOCK, BEFORE ANY SUM. See the header.
  perform 1 from public.child_profiles where id = child for no key update;

  select * into it from public.shop_items where slug = item;
  if not found then
    return query select false, 'unknown_item'::text, null::uuid, 0;
    return;
  end if;

  if not it.in_stock then
    return query select false, 'out_of_stock'::text, null::uuid, 0;
    return;
  end if;

  if via = 'jetons' then
    if not it.allow_jetons then
      return query select false, 'path_not_allowed'::text, null::uuid, 0;
      return;
    end if;
    cost := it.price_jetons;
  elsif via = 'whatsapp' then
    if not it.allow_whatsapp then
      return query select false, 'path_not_allowed'::text, null::uuid, 0;
      return;
    end if;
    cap := floor(it.price_mad * 25 / 100.0)::integer;
    cost := coalesce(discount, 0);
    if cost < 0 or cost > cap then
      return query select false, 'discount_too_large'::text, null::uuid, 0;
      return;
    end if;
  else
    return query select false, 'path_not_allowed'::text, null::uuid, 0;
    return;
  end if;

  -- ⚠️ RECOMPUTED HERE, INSIDE THE LOCK, FROM ROWS — never read from a column.
  select
    coalesce((select sum(w.points) from public.point_awards w where w.child_id = child), 0)
    - coalesce((
        select sum(x.jetons) from public.redemptions x
        where x.child_id = child and x.status <> 'cancelled'
      ), 0)
  into have;

  if cost > have then
    return query select false, 'insufficient'::text, null::uuid, have;
    return;
  end if;

  insert into public.redemptions
    (child_id, item_slug, path, jetons, price_jetons, price_mad, requested_by)
  values (child, it.slug, via, cost, it.price_jetons, it.price_mad, auth.uid())
  returning id into new_id;

  return query select true, 'ok'::text, new_id, (have - cost);
end;
$$;

comment on function public.redeem(uuid, text, text, integer) is
  'The ONLY way a redemption is created. Checks ownership, locks the child '
  'row (FOR NO KEY UPDATE), prices from shop_items, recomputes the balance '
  'from rows inside the lock and refuses if short. WhatsApp discount capped at '
  '25% of the dirham price, 1 jeton = 1 DH. Returns a code, never a sentence.';

revoke all on function public.redeem(uuid, text, text, integer) from public, anon;
grant execute on function public.redeem(uuid, text, text, integer) to authenticated;
grant execute on function public.redeem(uuid, text, text, integer) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. cancel_redemption — a member while pending, an admin always-while-pending
--
-- ⚠️ ONLY A PENDING ORDER CANCELS. An order that was handed over is a keyring
-- in a child's pocket; cancelling it would hand the jetons back as well.
-- Idempotent on an already-cancelled row, like cancel_booking().
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_redemption(redemption uuid)
returns table (ok boolean, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.redemptions%rowtype;
  admin boolean;
begin
  select * into r from public.redemptions where id = redemption for update;
  if not found then
    return query select false, 'no_order'::text;
    return;
  end if;

  admin := public.is_admin_direct();
  if not (public.owns_child(r.child_id) or admin) then
    return query select false, 'forbidden'::text;
    return;
  end if;

  if r.status = 'cancelled' then
    return query select true, 'ok'::text;
    return;
  end if;

  if r.status <> 'pending' then
    return query select false, 'already_handed_over'::text;
    return;
  end if;

  update public.redemptions
    set status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = case when public.owns_child(r.child_id) then 'member' else 'staff' end
  where id = redemption;

  return query select true, 'ok'::text;
end;
$$;

revoke all on function public.cancel_redemption(uuid) from public, anon;
grant execute on function public.cancel_redemption(uuid) to authenticated;
grant execute on function public.cancel_redemption(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. The admin functions — publish, stock, hand over
--
-- ⚠️ `is_admin_direct()`, NOT `is_staff()`. The brief gives the catalogue and
-- the handover to admins (Seàn and Michael). A prof awards jetons; deciding
-- what they buy and confirming an object left the box is the admin's act.
-- Each raises for a non-admin, so "not allowed" never reads as "nothing to do".
-- ────────────────────────────────────────────────────────────────────────────

-- Publish the git catalogue. ONE statement per table touched, whatever the
-- item count. An item the payload no longer carries is marked out of stock
-- rather than deleted: past orders still name it.
create or replace function public.admin_publish_shop(items jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not public.is_admin_direct() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' then
    raise exception 'items must be a json array';
  end if;

  insert into public.shop_items
    (slug, price_jetons, price_mad, allow_jetons, allow_whatsapp, published_at, published_by)
  select
    e->>'slug',
    nullif(e->>'price_jetons', '')::integer,
    nullif(e->>'price_mad', '')::integer,
    coalesce((e->>'allow_jetons')::boolean, false),
    coalesce((e->>'allow_whatsapp')::boolean, false),
    now(),
    auth.uid()
  from jsonb_array_elements(items) e
  on conflict (slug) do update
    set price_jetons = excluded.price_jetons,
        price_mad = excluded.price_mad,
        allow_jetons = excluded.allow_jetons,
        allow_whatsapp = excluded.allow_whatsapp,
        published_at = excluded.published_at,
        published_by = excluded.published_by;
  get diagnostics n = row_count;

  update public.shop_items
    set in_stock = false
  where in_stock
    and slug not in (select e->>'slug' from jsonb_array_elements(items) e);

  return n;
end;
$$;

revoke all on function public.admin_publish_shop(jsonb) from public, anon;
grant execute on function public.admin_publish_shop(jsonb) to authenticated;
grant execute on function public.admin_publish_shop(jsonb) to service_role;

create or replace function public.admin_set_stock(item text, available boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_direct() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.shop_items set in_stock = available where slug = item;
  if not found then
    raise exception 'no such item: %', item;
  end if;
end;
$$;

revoke all on function public.admin_set_stock(text, boolean) from public, anon;
grant execute on function public.admin_set_stock(text, boolean) to authenticated;
grant execute on function public.admin_set_stock(text, boolean) to service_role;

create or replace function public.admin_hand_over(redemption uuid)
returns table (ok boolean, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.redemptions%rowtype;
begin
  if not public.is_admin_direct() then
    return query select false, 'forbidden'::text;
    return;
  end if;
  select * into r from public.redemptions where id = redemption for update;
  if not found then
    return query select false, 'no_order'::text;
    return;
  end if;
  if r.status = 'handed_over' then
    return query select true, 'ok'::text;
    return;
  end if;
  if r.status <> 'pending' then
    return query select false, 'cancelled'::text;
    return;
  end if;
  update public.redemptions
    set status = 'handed_over', handed_over_at = now(), handed_over_by = auth.uid()
  where id = redemption;
  return query select true, 'ok'::text;
end;
$$;

revoke all on function public.admin_hand_over(uuid) from public, anon;
grant execute on function public.admin_hand_over(uuid) to authenticated;
grant execute on function public.admin_hand_over(uuid) to service_role;

comment on function public.admin_hand_over(uuid) is
  'An admin confirms a pending order left the box. Admin only; idempotent.';
