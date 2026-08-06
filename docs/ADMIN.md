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

Run this in the **Supabase SQL editor** for the project concerned (it executes
as the table owner and bypasses RLS). Substitute the address:

```sql
-- Promote to professeur
update public.profiles
set role = 'prof'
where id = (select id from auth.users where email = 'person@example.com');
```

```sql
-- Promote to administrateur
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'person@example.com');
```

```sql
-- Demote back to élève
update public.profiles
set role = 'eleve'
where id = (select id from auth.users where email = 'person@example.com');
```

Check the result rather than assuming:

```sql
select u.email, p.role, p.display_name, p.created_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;
```

### Why an email lookup rather than a uuid

The uuid is the real key, but nobody knows it by heart and pasting the wrong one
promotes the wrong child. The subquery makes the statement self-checking: a
typo'd address matches nothing and updates zero rows, which is a safe failure.

## Deleting an account (the erasure right)

Delete the **auth user**, not the profile. Everything else follows by cascade —
profile, exercise progress, lesson progress, attendance.

```sql
-- Deletes the user; profiles/progress/attendance cascade from here.
delete from auth.users where email = 'person@example.com';
```

Deleting only the profile row would leave an auth user that can still sign in
and would silently get a fresh profile from the trigger on next login. The
cascade direction is the one that matters, and
`tests/e2e/helpers/purge.ts` checks it holds on every run.

## First admin

A brand-new project has no admin, and there is no bootstrap UI. Sign in once
through the normal magic link, then promote yourself with the SQL above.
