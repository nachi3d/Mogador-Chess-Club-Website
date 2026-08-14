# Administration — role changes

Roles are `admin`, `prof`, `eleve`. Everyone starts as `eleve`; the trigger in
migration `0001` gives every new signup that role and nothing else.

## ⚠️ Roles are never changed from the client. Ever.

There is no UI for this and there never will be. The site is static, the anon
key is public, and every visitor's browser is an untrusted caller — so "the
form does not offer it" protects nothing. Three things enforce it:

1. **Column-level privileges.** `authenticated` holds `UPDATE` on
   `display_name` and `locale` only. A `PATCH` carrying `role` is refused by
   PostgREST before any policy runs.
2. **A trigger.** `forbid_role_self_change()` raises if `role` changes and the
   caller is not already an admin — the second line if a future migration ever
   widens the grant by accident.
3. **No INSERT policy on `profiles`.** Rows arrive only through the
   `SECURITY DEFINER` signup trigger, so nobody can mint themselves a row with
   `role = 'admin'`.

`tests/e2e/auth.spec.ts` attempts the escalation with a real anon-key client
holding a real user session, and asserts the stored role is unchanged.

## Promoting somebody

### ⚠️ A plain UPDATE does NOT work, and the reason is worth knowing

The obvious statement fails, in the SQL editor, as `postgres`:

```
ERROR: role may not be changed by the client (see docs/ADMIN.md)
```

**Being the table owner bypasses RLS. It does not bypass TRIGGERS.**
`profiles_forbid_role_self_change` fires on every update regardless of who you
are, and it allows a role change only when `is_admin_direct()` is true — which
reads `auth.uid()`. In the SQL editor there is no logged-in user, so `auth.uid()`
is **NULL**, `is_admin_direct()` is false, and the trigger refuses.

That is the guard doing its job, not a bug. It has to be stood down deliberately
for the duration of the change.

### The working procedure

Run the whole block in the **Supabase SQL editor** for the project concerned.
Substitute the address in the two places it appears. Copy-paste it whole — the
`begin`/`commit` matters:

```sql
begin;

alter table public.profiles disable trigger profiles_forbid_role_self_change;

update public.profiles
set role = 'admin'   -- 'admin' | 'prof' | 'eleve'
where id = (select id from auth.users where email = 'person@example.com');

alter table public.profiles enable trigger profiles_forbid_role_self_change;

commit;
```

Then verify — never assume:

```sql
select u.email, p.role, p.display_name, p.created_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;
```

⚠️ **`disable trigger` takes the TRIGGER name, not the function name.** The
trigger is `profiles_forbid_role_self_change`; the function it calls is
`forbid_role_self_change()`. Passing the function name fails with
`trigger "forbid_role_self_change" for table "profiles" does not exist` — which
is what an earlier version of this document told people to do.

⚠️ **Run it as one transaction.** `alter table ... disable trigger` is
transactional in Postgres, so if the update fails the disable rolls back with it.
Without `begin`/`commit`, a failed update between the two `alter` statements
leaves **the guard switched off** on a live table, and nothing announces it.

To confirm the guard is armed again afterwards:

```sql
select tgname, tgenabled   -- tgenabled must be 'O' (enabled)
from pg_trigger
where tgname = 'profiles_forbid_role_self_change';
```

*Verified against the production database on 2026-08-07: the plain update was
reproduced failing, and the block above was run end-to-end inside a transaction
that was rolled back — promotion applied, trigger re-armed, a subsequent role
change correctly refused.*

### Why an email lookup rather than a uuid

The uuid is the real key, but nobody knows it by heart and pasting the wrong one
promotes the wrong child. The subquery makes the statement self-checking: a
typo'd address matches nothing and updates zero rows, which is a safe failure.

## Deleting an account (the erasure right)

⚠️ **THE READER DOES THIS THEMSELVES NOW.** Since migration 0007 there is a
**Supprimer mon compte** section on `/compte/`: two steps, the second a typed
`SUPPRIMER`, and the confirmation names what goes. It calls
`delete_own_account()`, which reads `auth.uid()` and takes **no target** — so
there is no id to pass and none to get wrong.

The SQL below is for the cases the button cannot cover: a request arriving by
WhatsApp from someone who cannot sign in, or an account you must remove on
their behalf.

Delete the **auth user**, not the profile. Everything else follows by cascade —
profile, child profiles, exercise progress, games, points, attendance.

```sql
-- Deletes the user; profiles/children/progress/attendance cascade from here.
delete from auth.users where email = 'person@example.com';
```

⚠️ **`delete_own_account()` is deliberately NOT granted to `service_role`.** It
has no `auth.uid()` there and could only raise. Erasing somebody else's account
is a different, deliberate act, and it is the statement above.

**Audited live on the test project** (2026-08-13), one row seeded in every
table: `auth.users`, `profiles`, `child_profiles`, `exercise_progress`,
`game_results`, `point_awards`, `attendance` and `lesson_progress` all went
1 → 0 in 453 ms. The club's own `sessions` row survived with `created_by` set to
`null`, which is correct: a session is club data, not the reader's.

Deleting only the profile row would leave an auth user that can still sign in
and would silently get a fresh profile from the trigger on next login. The
cascade direction is the one that matters, and
`tests/e2e/helpers/purge.ts` checks it holds on every run.

## First admin

A brand-new project has no admin, and there is no bootstrap UI.

1. Sign in once through the normal magic link, so the signup trigger creates your
   profile (it will be `eleve`).
2. Run the promotion block above with your own address, setting `role = 'admin'`.
3. Verify with the join.

⚠️ This is the step that fails if you reach for a plain `update` — see the note
above. There is no admin yet, so `is_admin_direct()` cannot be true for anybody,
which makes the trigger refuse **every** first promotion by construction.
Standing it down for the transaction is the only way in, and that is intentional:
it means gaining `admin` always requires database access, never a session.

---

## ⚠️ One-off repair — recording migrations 0003–0007 as applied

**Run once, on PRODUCTION only, in the Supabase SQL editor.** Skip it on the test
project, where the ledger is already correct.

### The problem

`supabase_migrations.schema_migrations` on production lists **`0001` and `0002`
only**, while the database demonstrably carries everything through `0007` —
0003–0007 were applied by a path that did not write the ledger. Audited against
the catalog on 2026-08-14; the queries are in
[`reference/supabase.md`](./reference/supabase.md).

The schema is right and the bookkeeping is wrong, so nothing is broken today.
What it breaks is the **next** person who runs `supabase db push` at production:
the CLI decides what to apply by reading this table, sees five migrations
missing, and replays them. Most statements are guarded (`create table if not
exists`, `create or replace function`, `drop policy if exists`) — but **0005 is
not**:

```sql
alter table public.exercise_progress drop constraint exercise_progress_pkey;
```

No `if exists`. On a second run that raises `42704` and aborts the transaction,
so the damage is a failed push rather than a mangled schema — but it fails
**halfway through a promotion**, on the one table the whole child-profile model
hangs off, and the person reading the error has no reason to suspect the ledger.

### The fix

⚠️ **This records history; it does not run anything.** Every statement 0003–0007
contains is already in the database — that is the finding. Running the
migrations again is exactly what this exists to prevent.

⚠️ **`statements` is left NULL, deliberately.** It is nullable, older CLI
versions wrote nothing there, and `db push` reads `version` to decide what to
apply. Inventing a statement array would be fabricating a record of an execution
that this database has no true account of.

```sql
-- Verify the starting state first. Expect exactly 0001 and 0002.
select version, name from supabase_migrations.schema_migrations order by version;

-- Record 0003–0007 as applied. Idempotent: re-running changes nothing.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0003', 'progress_kind_and_games'),
  ('0004', 'teacher_awarded_points'),
  ('0005', 'child_profiles'),
  ('0006', 'public_agenda'),
  ('0007', 'delete_own_account')
on conflict (version) do nothing;

-- Confirm. Expect seven rows, 0001 … 0007, and NOTHING else.
select version, name from supabase_migrations.schema_migrations order by version;
```

⚠️ **The `name` values are not cosmetic.** They must equal each migration's
filename with the `NNNN_` prefix and the `.sql` suffix removed — that is what
the CLI writes and what it prints when listing. Compare against
`supabase/migrations/` before running, and if a file has been renamed since,
the file wins.

⚠️ **Do not add a production path to `scripts/db-push.mjs` to do this.** That
script refuses production by construction and the refusal is the design; this is
a deliberate act against a ref typed by a human, which is the same rule.

### Afterwards

Re-run the per-migration verification in
[`reference/supabase.md`](./reference/supabase.md). Two independent things must
both hold: the **catalog** contains 0003–0007's objects (it already did), and the
**ledger** now says so. The ledger agreeing on its own has never been evidence —
that is the whole reason this section exists.
