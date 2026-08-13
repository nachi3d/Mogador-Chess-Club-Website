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
