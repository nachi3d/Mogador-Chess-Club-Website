# Testing accounts by hand, locally

Accounts are **off in production** and off by default in every build
(`PUBLIC_AUTH_ENABLED`, see `src/config/auth.ts`). Off means **not built**: the
routes are not in `dist/`, and there is no Supabase ref anywhere in the bundle.
This document is how to build the *other* shape of the site and walk through it.

It covers sign-in, the "Qui joue ?" picker, `/compte/`, the three admin
surfaces, marking a register, and awarding points as a prof — plus, at the
bottom, **what is not built yet**, which is the part most worth reading before
you conclude something is broken.

> Companion documents. `docs/ADMIN.md` is the authority on role changes and
> account deletion; `docs/reference/supabase.md` on the schema and RLS;
> `docs/MANUAL-TESTS.md` on everything a visitor can see. This file does not
> repeat them — it links.

---

## ⚠️ 0. The one thing that can go wrong, and it is not a broken build

`.env.local` holds the **production** project (`vtestpaufxmrvdhgrrsy`), because
that is what a real deploy build needs. So the dangerous mistake is not a build
that fails — it is a build that **succeeds** and is wired to the live club's
database. Signing in on `localhost` would then create a real account in
production. Nothing would announce it, and the site would look completely
normal.

⚠️ **Read the ref, not the vibe of the ref.** The production ref begins with
`vtest`. The actual test project is `puhhrqbgcobblowengii`.

This is why the command below is a script rather than a line of shell with three
variables in it. `npm run demo:accounts` reads the test credentials from
`.env.test` through the same interlock the e2e suite uses, and **fails closed**:
missing config, a missing production ref, an unparseable URL, or a match against
production all abort before anything is built. It prints which project it built
against; that line is worth reading every time.

---

## 1. One-time setup

### 1a. `.env.test` must exist

```sh
cp .env.test.example .env.test    # ⚠️ .env.test.example, NEVER .env.example
```

⚠️ **The wrong template has cost `SUPABASE_PRODUCTION_REF` twice**, and without
it every one of these commands aborts with "is this production? cannot be
answered". The tell that a `.env.test` came from the wrong file is a
commented-out `PUBLIC_UMAMI_WEBSITE_ID` at the bottom.

Fill in `TEST_PUBLIC_SUPABASE_URL`, `TEST_PUBLIC_SUPABASE_ANON_KEY` and
`TEST_SUPABASE_SERVICE_ROLE` from the **test** project's dashboard. It is
already populated on this machine.

### 1b. The redirect URL must be allow-listed

Supabase holds **one redirect allow-list per project**. If the target is not on
it, Supabase silently substitutes the project's Site URL and the browser lands
somewhere that is not the site you are testing — with nothing explaining why.

`http://localhost:4321/auth/callback` is **already allowed** on the test
project. Add `http://<your-lan-ip>:4321/auth/callback` too if you intend to test
on a real phone over the LAN (Authentication → URL Configuration → Redirect
URLs).

---

## 2. Seed the test project

```sh
node supabase/seed/seed-test.mjs
```

Idempotent — run it as often as you like. It refuses to run against anything but
the test project. It creates:

| Account | Role | Children |
|---|---|---|
| `seed-admin@mcc-seed.test` (Amina) | `admin` | — |
| `seed-prof@mcc-seed.test` (Youssef) | `prof` | — |
| `seed-eleve-1@mcc-seed.test` (Sara) | `eleve` | **Sara, Yassine** |
| `seed-eleve-2@mcc-seed.test` (Omar) | `eleve` | **Omar** |

plus three sessions (two published, one draft).

⚠️ **The child profiles are seeded on purpose, and one family deliberately has
two.** `child_profiles` got its first rows from the one-off backfill in migration
0005; an account created afterwards has no child until somebody signs in as them.
A freshly seeded project therefore used to come up with an **empty class list**
at `/admin/eleves/`, which reads as a broken surface rather than an unpopulated
one. And "Qui joue ?" only renders for an account holding **more than one** child
— a lone child is adopted silently (that is the autonomous-teenager path). With
one child per account the picker is unreachable and cannot be tested at all.

⚠️ **The seed domain `@mcc-seed.test` is deliberately outside the e2e purge
pattern** (`@mcc-e2e.test`). They have different lifecycles: the suite deletes
its own users before and after every run, and seeding into that domain means the
first test run silently destroys your sample data.

---

## 3. Build and serve, with accounts on

```sh
npm run demo:accounts              # localhost
npm run demo:accounts -- --host    # also on the LAN, for a real phone
```

It prints `accounts ON — building against TEST project "puhhrqbgcobblowengii"`
before it builds anything. Then it hands off to `npm run demo`, so you keep the
port sweep, the orphaned-browser sweep and the Ctrl+C cleanup.

⚠️ **Ctrl+C in the terminal that owns it.** Stopping the npm wrapper another way
does not stop the server — the real process is a grandchild, and it keeps
holding 4321. A stale preview is how a fixed bug goes on "failing": Playwright's
`reuseExistingServer` skips its own build and tests whatever is already there.

**What proves it worked** — all of this was verified on the build this document
was written against:

- `/connexion/`, `/compte/`, `/en/compte/`, `/auth/callback/`, `/admin/`,
  `/admin/eleves/`, `/admin/seances/` all return **200**
- `/en/admin/` returns **404** — the admin surfaces are French only, and that is
  Critical Feature 43, not an omission
- exactly one file in `dist/` carries the **test** ref, and **zero** carry the
  production ref

To go back to the normal, production-shaped site: `npm run demo`.

---

## 4. Sign in

### 4a. As a seeded account — no email involved

The seeded accounts live on `@mcc-seed.test`, a domain with no inbox anywhere,
so the `/connexion/` form can never sign you in as one of them.

```sh
node supabase/seed/magic-link.mjs seed-prof@mcc-seed.test
```

It prints a link. Paste it into the browser. The browser then walks the **real**
path — Supabase `/auth/v1/verify`, redirect to `/auth/callback`, tokens in the
URL fragment, the client exchanging them. Only the delivery is skipped, never the
flow.

Run with no arguments to list the seeded accounts. For a phone on the LAN, pass
the redirect explicitly:

```sh
node supabase/seed/magic-link.mjs seed-prof@mcc-seed.test http://192.168.1.20:4321/auth/callback
```

⚠️ **The link is single-use and short-lived.** Following it consumes the token;
mint a fresh one rather than reusing one from scrollback.

### 4b. As yourself, through the real form

Go to `/connexion/`, type your own address, submit, open the email, click the
link. This is the path a parent actually walks, and it is worth doing **once** so
you have seen it — including the wait, which is the part no test can judge.

⚠️ Supabase's built-in email sender is rate-limited (a couple per hour) and, on a
project with no custom SMTP, will generally only deliver to addresses attached to
the project's organisation. If nothing arrives, that is the sender, not the site
— use 4a and move on.

**What to expect:** `/auth/callback/` shows a brief "working" state, the tokens
are scrubbed out of the address bar, and you are redirected to `/compte/` — or
`/en/compte/` if your profile's locale is English. A failure shows a message and
a link back to `/connexion/`, never a blank page.

---

## 5. Make yourself a prof (or admin) on the TEST project

Everyone starts as `eleve`. There is **no UI for this and there never will be** —
see `docs/ADMIN.md`, which is the authority. The short version:

1. **Sign in once first** (4a or 4b), so the signup trigger creates your profile.
2. Run this in the **test project's** SQL editor, whole, `begin`/`commit`
   included:

```sql
begin;

alter table public.profiles disable trigger profiles_forbid_role_self_change;

update public.profiles
set role = 'prof'   -- 'admin' | 'prof' | 'eleve'
where id = (select id from auth.users where email = 'nachiketas3d@gmail.com');

alter table public.profiles enable trigger profiles_forbid_role_self_change;

commit;
```

3. Verify, never assume:

```sql
select u.email, p.role, p.display_name
from public.profiles p join auth.users u on u.id = p.id
order by p.created_at desc;
```

⚠️ **A plain `UPDATE` does not work, and that is the guard doing its job.** Being
the table owner bypasses RLS but **not triggers**;
`profiles_forbid_role_self_change` allows a role change only when the caller is
already an admin, and in the SQL editor `auth.uid()` is NULL. Standing the
trigger down for one transaction is the only way in — which means gaining a role
always requires database access, never a session.

⚠️ **`disable trigger` takes the TRIGGER name**, not the function name.

⚠️ **Run it as one transaction.** Without `begin`/`commit`, a failed update
between the two `alter` statements leaves the guard switched off on a live table,
and nothing announces it.

Then **sign out and back in**, or reload `/compte/` — the staff link is drawn
from the profile the page fetched.

---

## 6. The walkthrough

Sign in as **`seed-eleve-1@mcc-seed.test`** for the family half, then as
**`seed-prof@mcc-seed.test`** (or yourself, once promoted) for the staff half.

### 6a. **Mes élèves** — the family section, and "Qui joue ?" inside it

⚠️ **Two rules, and they used to be one.** The family section renders for
**every** signed-in account; only the **Qui joue ?** picker inside it is
conditional on holding more than one child. Coupling them is what made
"Ajouter un élève" unreachable for every normal account — see §7a, which is now
a record of a fixed bug rather than an open gap.

Sign in as `seed-eleve-2` (holds **one** child) first, because that is the shape
every real signup produces:

- **Mes élèves** is there, with *Omar* in it, an **Ajouter un élève** field, and
  a **Renommer** button
- **Qui joue ?** is **not** there, and that is correct — a lone child is adopted
  silently, so an autonomous teenager is the family case with a list of one. One
  code path, not two
- There is no **Retirer** button either, and a sentence says why: an account
  always keeps at least one student. Removing the only one is a lie — the
  resolver would create a replacement from the profile name, renamed, with the
  history gone
- Add a second child. The picker appears. Remove them again: the first tap
  **asks**, naming the child and saying the progress goes with them, and the
  picker disappears again

Now sign in as `seed-eleve-1` (holds **two**). The **Qui joue ?** block lists
*Sara* and *Yassine* as buttons.

- Tapping one marks it `aria-pressed="true"` — chosen by **weight and border**,
  never colour alone
- The choice is remembered **per device, per account**. A child's own phone
  answers once, ever; the family tablet asks when the answer is genuinely unknown
- ⚠️ **There is no PIN and there will not be one.** The account is the security
  boundary; which child is playing is a preference, exactly like the board theme.
  ⚠️ The two-step confirm on **Retirer** is a different thing entirely — that one
  erases a child's whole history by cascade
- ⚠️ **The picker and the roster are two lists of the same names, on purpose.**
  The picker is what a child taps on a shared tablet; **Retirer** must not sit
  beside the button they are aiming for
- Rename a child from the roster and check the picker follows. The device's
  remembered choice carries the name as well as the id, and a rename that did not
  refresh it would leave the old name on that button
- Nothing syncs until the question is answered, when it has to be asked. Writing
  a solved exercise to the wrong sibling is worse than waiting

**What to watch for:** solve an exercise as Sara, switch to Yassine, and check
`/progres/` — the two purses are separate. One purse per child is the whole point
of the model.

### 6b. `/compte/`

- **Adresse e-mail** and **Rôle** (Élève / Professeur / Administrateur), read from
  the profile
- **Prénom affiché** and **Langue**, both editable and saved to the profile.
  ⚠️ `role` is *not* in that form and cannot be — `authenticated` holds UPDATE on
  those two columns only, so a `PATCH` carrying `role` is refused by PostgREST
  before any policy even runs
- **Progression** — the sync line. On first sign-in after working as a guest it
  should say what was **recovered** ("12 exercices et 3 leçons récupérés"). ⚠️ If
  it says your progress is up to date when you know you brought a month's work,
  **stop** — that is the failure that looks like success
- **Espace encadrants** — a link to `/admin/`, revealed only for `prof` and
  `admin`. ⚠️ Hidden is UX, not security: un-hide it in devtools as a student and
  every query behind it returns nothing, because RLS is what actually refuses
- **Se déconnecter** — clears the session *and* the local flag. Your progress is
  still there afterwards, and still works. You are a guest again, with your work

### 6c. `/admin/` — the dashboard

French only, at every width. Three blocks: **Prochaines séances**, **Activité
récente**, and **Raccourcis** (*Marquer les présences*, *Voir la classe*).

A student who reaches it gets a sentence, not an empty table that looks broken.

### 6d. `/admin/eleves/` — the class

⚠️ **This lists CHILDREN, not accounts.** A parent with three children is three
rows here and one row in `auth.users`. After seeding you should see **three**:
Sara, Yassine, Omar.

Clicking a row opens `/admin/eleve/?id=<uuid>`. ⚠️ The id is a **query
parameter, not a route segment**, and that is forced rather than chosen: a static
build would have to enumerate real students at build time to emit
`/admin/eleve/<uuid>/`, which means publishing the class list in `dist/`.

### 6e. `/admin/seances/` — sessions and the register

Session CRUD, plus the attendance register underneath.

⚠️ **A cancelled session is a STATE, never a deletion**, so the UI offers no
delete at all. `on delete cascade` means deleting one destroys a register that
may already have been marked.

**Marking attendance** — this is the surface shaped entirely by one constraint:
twenty teenagers, in a room, on a phone, standing up.

- Three buttons per child: **P** / **A** / **E** (Présent, Absent, Excusé). One
  tap. **No modal, no save button**
- The write is **optimistic** — the state flips on the tap, because a prof cannot
  wait for a round trip twenty times on mobile data
- ⚠️ **A failed write is loud and does not revert.** A mark that silently undoes
  itself is worse than one that never happened
- ⚠️ **Nothing moves after a tap.** A list that reorders under a thumb is how the
  next student gets marked wrong
- A running summary reads "*n* sur *m* marqués · *p* présents"

Measured at **59 ms of UI per child, 1.18 s for twenty taps**
(`attendance-timing.spec.ts`). ⚠️ The check that actually matters cannot be run
here: **mark a real class, at Dar Souiri, during a real session, and time it.**

### 6f. Awarding points as a prof

On `/admin/eleve/?id=…` there is **Attribuer des points**: a number (default 5)
and a reason, then *Attribuer*. Above it, **D'où viennent les points** lists what
has been awarded.

- ⚠️ **Bounds are 1 to 50 points, and the reason must be at least 3 characters** —
  and they are `CHECK` constraints in the database, not just form validation. The
  form is convenience; the constraint is the rule. Try 0, try 500, try an empty
  reason
- ⚠️ **Awards are ROWS, never a balance.** Points are *derived*, never banked —
  there is no stored total anywhere, on purpose. A stored balance is a number a
  student edits in a console in three clicks
- They are pulled on sign-in and **never pushed**: the client holds no INSERT
  policy on `point_awards` and must not behave as though it might. The mirror
  **replaces** rather than merges, because the server is the only author —
  merging would make a withdrawn award immortal on whichever device saw it first
- ⚠️ **A prof and a student must never read different totals.** There is one
  summation, `computeLedger()`, and a spec pins the resolver's inline copy equal
  to it. Cross-check the number on `/admin/eleve/` against `/progres/` signed in
  as that child's account — both plausible and different is the worst failure a
  progression display can have

**The boundary itself is not tested by clicking.** `role-separation.spec.ts`
drives it through PostgREST with real tokens: a student cannot read the class
list, a prof can read every child and **write none**, and the award bounds hold
with the form nowhere in the picture.

---

## 7. ⚠️ What is NOT built

Read this before concluding something is broken.

### 7a. ✅ A parent adding their own children — FIXED, and worth reading anyway

**This was the gap that mattered most, and it was not "no UI" — it was worse,
because the UI existed and could not be reached.** It is fixed; the entry stays
because the *shape* of the failure is the useful part.

`ChildPicker.astro` contained an **Ajouter un élève** form that inserted into
`child_profiles`, and RLS permitted it. But one line hid the whole `<section>`,
form included, whenever the account held **one child or none** — and a brand-new
account is given exactly one by `resolveChild()`. A parent with two children
could add a third; a parent with one could add none.

The fix is the design decision this entry used to ask for: **the family section
always renders for a signed-in account, and only the picker is conditional.**
`FamilySection.astro`, plus rename and remove on the roster, plus
`tests/e2e/family.spec.ts` — which drives the browser as an account with exactly
one child, the shape every signup produces.

⚠️ **Every check in the project passed the whole time.** `child-profiles.spec.ts`
was green and could not have been otherwise: it asserts the boundary through
PostgREST, where a form does not exist. **A permission model that says yes proves
nothing about whether a reader can get there.** Full narrative in
`docs/reference/supabase.md`.

The seed still gives one family two children — not to work around anything now,
but so both sides of the picker's threshold are walkable without clicking.

### 7b. Creating a student from the admin UI — deliberately absent

Staff hold `SELECT` on `child_profiles` and **nothing else**. This is a decision,
not an oversight: a teacher renaming a child is indistinguishable from a teacher
inventing one. It is what the "guest attendance" backlog item needs, and it
should be designed with that.

### 7c. Everything else currently missing

| | State |
|---|---|
| Self-service account deletion | The cascade works and `docs/ADMIN.md` has the SQL. What is missing is a button and a confirmation a child cannot trip over |
| Attendance history on `/compte/` | Shows "À venir". The register writes it; the family-facing view is not built |
| The agenda | Still reads the git collection, not `sessions`. `/admin/seances/` and `/agenda/` are **two different sources of truth** today |
| Points/rank on `/progres/` for a signed-in child | Derived and shown; but the balance is still computed **client-side**. ⚠️ When accounts go live it must be computed server-side — no endpoint may ever accept a total, a rank or an achievement list as input |
| Graduating a child to their own account | `graduate_child()` exists, is proven, and is `service_role` only. There is no UI, by design |
| The shop (E8) | Not started. One purse per child, never a shared family wallet |

---

## 8. Cleaning up

```sh
npm run demo          # the normal, accounts-off site — and it sweeps the ports
```

- ⚠️ **Kill the preview server** when you are done. `npm run demo` sweeps stale
  previews *and* orphaned test browsers on startup, so running it is itself the
  cleanup
- The seeded accounts persist. Re-run the seed to restore them; nothing else
  touches them
- To wipe a seeded account entirely, delete the **auth user**, never just the
  profile — everything else follows by cascade, and that cascade *is* the erasure
  right (`docs/ADMIN.md`)

⚠️ **`PUBLIC_AUTH_ENABLED` is never set in `.env.local`.** Keep the flag on the
command, so the default build on this machine stays the shape production ships.
Turning accounts on in production is one Cloudflare build variable and your call
alone — see `BACKLOG.md`.
