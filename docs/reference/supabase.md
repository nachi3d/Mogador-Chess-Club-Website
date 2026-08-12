# Reference — accounts, Supabase, RLS and the parent/child model

**Read when:** touching auth, a migration, RLS, progress sync, the child-profile model, or the test-environment interlock.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## ⚠️ ACCOUNTS ARE SWITCHED OFF IN PRODUCTION (v0.3.0)

`PUBLIC_AUTH_ENABLED`, read once in `src/config/auth.ts`. **Default `false`.**
Everything below in the v2 section is built, tested and merged; it is simply not
shipped yet.

**Why:** v2-S1 delivered the whole auth stack, but there is nothing to sync
until v2-S3. An account is currently a door into an empty room, and opening it
would ask parents to hand over a child's email address in exchange for nothing.

### OFF means NOT BUILT — five things, all tested

| | |
|---|---|
| Routes | `/connexion/`, `/compte/` (both locales) and `/auth/callback/` are **not in `dist/`**. They 404 like any unwritten URL. |
| Bundle | **No Supabase project ref, host or anon key anywhere in `dist/`.** |
| Client | `@supabase/supabase-js` is not bundled at all. |
| Header | `AccountButton` renders nothing — not a hidden link, not a disabled one. |
| Nothing deleted | Every page, spec, migration and RLS policy stays. v2-S3 sets the variable to `true` and the feature returns unchanged. |

`tests/e2e/auth-disabled.spec.ts` asserts all of it, against **`dist/` on disk**
as well as over HTTP. The auth specs skip **visibly**, naming the flag, so a
build with no auth in it can never read as "auth works".

### ⚠️ `getStaticPaths()` RETURNING `[]` IS NOT ENOUGH ON ITS OWN

That is what stops a **page** being emitted (and it is why those five routes are
named `[...slug].astro` — a static `.astro` route has no way to opt out, a
dynamic one decides for itself).

But **Astro collects a page's `<script>` blocks from the module graph, not from
what actually renders.** The first disabled build therefore shipped **216 KB of
unreachable `@supabase/supabase-js`, precached by the service worker** — every
first visit on Essaouira mobile data paying for a switched-off feature.

The fix is in `astro.config.mjs`: when the flag is off, `@lib/supabase` is
**aliased to `src/lib/supabase.disabled.ts`**, cutting the graph at the module.
The config reads the flag through Vite's `loadEnv` rather than `process.env`, so
the alias and `import.meta.env` can never disagree — a build with sign-in pages
that cannot sign anyone in would be worse than either state.

### ⚠️⚠️ `import.meta.env['X']` LEAKS THE ENTIRE ENV. USE DOT ACCESS.

Vite statically replaces **`import.meta.env.FOO` only**. Given a computed key it
cannot know what to substitute, so it emits the **whole env object** into the
chunk — every `PUBLIC_*` variable, including `PUBLIC_SUPABASE_ANON_KEY`.

That is not a style nit. The first version of the flag was
`import.meta.env['PUBLIC_AUTH_ENABLED']`, and the build meant to prove accounts
were disabled contained:

```js
r={ASSETS_PREFIX:void 0,…,PUBLIC_SUPABASE_ANON_KEY:`eyJhbGciOi…`}
```

The anon key is a JWT whose payload carries the project ref, so **one bracket
access put the production ref into a shipped file while the flag it implemented
was supposed to keep it out.** It also meant `AUTH_ENABLED` was never folded to
a constant, so none of the dead-branch elimination happened either.

Nothing was exploitable — the anon key is public by design and RLS is the real
boundary. The lesson is that **the guarantee was false while looking true**, and
only reading `dist/` showed it.

`src/env.d.ts` now declares every `PUBLIC_*` variable so dot access type-checks,
and `src/config/site.ts` was switched over too (it had the same pattern for
Umami). The grep in `auth-disabled.spec.ts` is what makes this enforced rather
than remembered.

### Turning accounts back on

Set `PUBLIC_AUTH_ENABLED=true` in the Cloudflare build variables. Nothing else
changes: the database is already at 0001/0002, ahead of the site, which is the
safe ordering. Run the suite with the same variable set to exercise the ON path
— `npx playwright test` alone tests the OFF artefact, which is the one that
ships.

---

## v2 architecture — Supabase, and what it is NOT allowed to change

v2 adds accounts. It does **not** change what this site is.

### Locked decisions

| | |
|---|---|
| Hosting | **Still static.** Astro + Workers assets, `output: 'static'`, no adapter, no SSR, no server. **Non-negotiable.** |
| Supabase | Called **client-side only** |
| Security | **ALL of it is RLS.** The anon key is public by design |
| Guests | **First-class forever.** Every lesson, trap and exercise works with no account |
| Content | **Stays in git.** The database holds identities, roles, progress, sessions, attendance — nothing a lesson is made of |
| Roles | `admin` / `prof` / `eleve`. All profs see all students (v2.0); groups are v2.1 |
| Auth | Magic link (v2-S1) + Google OAuth and prof-created accounts (v2-S2). **NO passwords, anywhere** |
| SMS | **Rejected.** No Twilio, no SMS/WhatsApp OTP. Do not reintroduce |

**Accounts add sync and teacher oversight. They gate nothing.** If a feature ever
requires an account to read content, it is the wrong feature.

### ⚠️ The guest zero-request rule wins every conflict

A visitor reading a lesson must cause **zero** requests to any Supabase origin
and must not download `@supabase/supabase-js` at all. Three mechanisms:

1. **`src/lib/supabase.ts` is the only file importing the client**, and it is a
   lazy singleton — importing the module constructs nothing.
2. **Every caller reaches it through `await import()`**, so Vite gives it its
   own chunk. At v2-S1 that chunk is **207 KB raw**, fetched only by an auth
   page or a submitted sign-in form.
3. **`src/lib/auth-flag.ts` knows nothing about Supabase.** The header asks it
   whether showing an account link is worth it, and never asks Supabase.

⚠️ **`auth-flag.ts` must never import `supabase.ts`, directly or transitively.**
One static import and Vite hoists the client into every page's graph. The header
script in `AccountButton.astro` duplicates the key string `mcc:auth:v1` verbatim
for the same reason the theme head script duplicates `applyTheme()` — importing
would reintroduce the request it exists to avoid. Three copies exist
(`auth-flag.ts`, the inline script, and `tests/e2e/helpers/auth.ts`); the spec
pins the contract.

`tests/e2e/auth.spec.ts` asserts this against the **network log** on six content
routes, so it holds however the chunking changes.

**The flag is a HINT, never authorisation.** A hand-edited `true` buys one
wasted module fetch and a page that says "you are not signed in".

### The magic-link flow is IMPLICIT, and that is what makes a static host work

`flowType: 'implicit'` is set explicitly in `supabase.ts`.

The link returns tokens in the URL **fragment** (`#access_token=…`). A fragment
is never transmitted to the origin, so `/auth/callback` is served as an ordinary
static HTML file and the exchange happens entirely in the browser. **Verified:
`dist/auth/callback/index.html` is a plain static file; no server, no adapter,
no Function.**

⚠️ **PKCE would break magic links here.** It keeps a `code_verifier` in the
localStorage of the browser that *requested* the link — and email is routinely
opened somewhere else (a phone when the request came from a laptop, a mail app's
in-app browser). Every one of those fails with an opaque error. The cost of
implicit is tokens briefly in the address bar, so `completeSignIn()` scrubs the
fragment as soon as it is consumed.

`/auth/callback` is the **only unlocalised route on the site**. Supabase holds
one redirect allow-list per project, and this page renders a spinner and
redirects — the reader's locale comes from their profile. The
no-translated-segments rule is about pages a reader navigates to; this is
machinery.

### v2-S3 — progress sync (BUILT, and the flag is still OFF)

⚠️ **`PUBLIC_AUTH_ENABLED` IS READY TO FLIP AND WAS NOT FLIPPED.** Everything
below is built, migrated and verified against the TEST project with the flag on
locally. Turning accounts public is a release decision and Seàn's call, not a
side effect of a session. When it happens: set the variable in the Cloudflare
build vars, and nothing else changes — the database is already ahead of the
site, which is the safe ordering.

#### The schema decision: a `kind` discriminator, not three tables

Migration **0003**. The local store has exactly ONE map for every judged board —
a standalone exercise, a tutorial step and a lesson board all produce the same
`{solved, attempts, hintUsed, solvedAt}`, keyed by a namespaced slug. So one
local map maps to one table and the sync is a **mirror rather than a
translation**. Three tables would have meant the same four columns declared
three times, and a merge that branches on namespace — and this merge runs once,
on real student work, with no undo.

`kind` is stored (not derived in SQL) so v2-S4's teacher dashboard can count
tutorial steps without the database parsing slug prefixes. **The client
classifies**, because the client owns the convention.

`game_results` is a **row per game, not a counter**, and that is forced: two
counters cannot be merged. A guest with 3 wins and a cloud with 2 might mean 5
games or 3, and neither `sum` nor `max` is right in both cases. Rows with ids
can be unioned, which is the only operation that is idempotent.

⚠️ **`lesson_progress` from 0001 is DEPRECATED and deliberately not dropped.**
It has `completed_at` and nothing else, so it cannot hold a lesson board's
attempts or hint flag; and "this lesson is complete" is DERIVED from its boards,
exactly as points are. Storing it would be a second source of truth. Dropping it
is irreversible and buys nothing.

⚠️ **THE `service_role` GRANT IS THE TRAP 0002 EXISTS FOR, AND 0003 WALKED INTO
IT AGAIN.** Default privileges here do NOT give `service_role` DML on a *new*
table in `public`, so every new table must say so explicitly or trusted callers
get `42501 permission denied` on a table whose RLS is perfect. It cost a red
test run. Any future migration adding a table must include the grant.

#### The sync model

⚠️ **`progress.ts` IS STILL THE SINGLE READER**, and no component gained a
Supabase call. `progress-sync.ts` is a backend it writes through to; the two
surfaces that show sync state import `progress.ts`, which re-exports.

- **Signed out → `localStorage` only**, exactly as before. `hasAuthFlag()` gates
  every path, so a guest's write never reaches any Supabase code.
- **Signed in → `localStorage` is still the source of truth for the UI**, and
  the cloud is the durable copy. ⚠️ **Reads never touch the network.** A dead
  Supabase or a captive-portal wifi can never block a board.
- **Writes go local first, then queue.** A failed cloud write cannot lose the
  local record, because the local record is already written.

⚠️ **NO STATIC `@lib/supabase` IMPORT IN `progress-sync.ts`.** Every touch is
`await import()`. One static import would pull 207 KB of client into every page
with a board; `auth.spec.ts` asserts against the network log that a guest fetches
none of it.

#### The offline queue

`mcc:sync:v1`, bounded at 500 entries, surviving reload. **One entry per row**,
so the queue holds STATE rather than a history to replay — a later write of the
same row supersedes the earlier, which is what makes both a dropped entry and a
repeated flush survivable. Retries on `online` and on the tab becoming visible;
⚠️ **no polling and no spinner** — nobody is waiting on it.

⚠️ **The flush RE-READS before clearing.** A write that happened while the flush
was in flight is in the queue now, and clearing the whole thing is how an
offline session loses its last few moves.

#### ⚠️ Timestamps: Postgres and JavaScript disagree about the STRING

`timestamptz` comes back as `2026-01-01T10:00:00+00:00`; JavaScript writes
`...000Z`. Same instant, different string — and comparing them lexicographically
is **wrong**, not merely untidy: `+` (0x2B) sorts before `.` (0x2E), so a cloud
value would always win an "earliest" test whatever date it held, and a student's
first-solved date would drift to whatever the cloud last returned. Everything is
canonicalised through `Date.parse` → `toISOString` before comparison or storage.

Found by the idempotency test, which is exactly what that test is for.

#### ⚠️ ANTI-CHEAT — what is true now, and what a fix would need

**While progress is written from the client, a determined student can edit it.**
`localStorage` is three clicks away in a console, and so is a `PATCH` to
PostgREST with their own token. This is stated rather than defended against,
because the plausible defences are worse than the problem.

The mitigation is **not client-side validation** — the student controls that
too. It is that the database records **what was done**, and points are derived
from it. `game_results` holds a result, never a score; `exercise_progress` holds
solves and attempts, never a total. So a **server-side recomputation is possible
later with no migration**: the raw material is already there in the right shape.

⚠️ **Do not build server-side validation now.** What it would need, when it is
wanted: a Postgres function or Edge Function that recomputes the ledger from
`exercise_progress` + `game_results` using the same award table as `points.ts`
(which means that table moving to a place both can read, or being duplicated
with a test that pins them equal); a way to distinguish a *plausible* solve from
a typed one, which needs something the client cannot forge — a server-checked
move sequence, or a timing envelope — and that is a much larger feature than it
looks. Until then the honest position is the one `/progres/` already takes:
these numbers are local and declarative.

⚠️ **Nothing in `points.ts` may become a wire format for a client-supplied
total.** No endpoint may accept a total, a rank or an achievement list. The
client may send what it *did*; the server decides what that is worth.

### v2-S4 — teacher roles (FOUNDATION SHIPPED, SURFACES NOT YET)

⚠️ **WHAT EXISTS AND WHAT DOES NOT.** Migration 0004, the RLS/GRANT audit and
the role-separation specs are done and verified against the TEST project. The
**admin surfaces are not built** — `/admin`, `/admin/eleves`, `/admin/seances`,
the attendance marker and the award form. The agenda still reads the git
collection. A future session builds the UI on top of a boundary that is already
proven; nothing was half-built, because a present-but-inert admin page is worse
than an absent one (Critical Feature 32's lesson).

#### The role model, re-verified this session

`admin` / `prof` / `eleve`. All profs see all students; groups are v2.1.

Both protections on `profiles.role` were re-checked **live**, not re-read:

- `authenticated` holds `UPDATE` on **`display_name` and `locale` only** — a
  column grant, so `role` is unreachable even through a row the student owns;
- `admin_set_role()` is `EXECUTE`-granted to `postgres` and `service_role`
  **only**, so a student cannot reach it and neither can a prof.

⚠️ **A prof is not an admin.** The spec asserts a prof can mark attendance and
award points and **cannot promote anyone** — a boundary that is too tight is
also a bug, so the prof's own abilities are asserted alongside the student's
inabilities.

#### `point_awards` — teacher-awarded points (migration 0004)

E3 built `PointEntry` with `origin` and `source` precisely so a second producer
could arrive without a migration, and this is that producer. **One row per
award; still no balance anywhere.**

Three rules live in the DATABASE rather than in a form, because a form is the
half a future admin script skips:

- ⚠️ **`reason` is REQUIRED**, checked on the trimmed length. Points that appear
  with no explanation destroy trust faster than no points at all: a student who
  cannot tell why a number moved learns the number is arbitrary.
- ⚠️ **Points are POSITIVE and capped at 50.** Not a typo guard, a policy. This
  site records losses and charges nothing for them; a prof who could award −50
  would turn the ledger into a disciplinary instrument. The cap sits under the
  tutorial's own 65 so no single award can outweigh the work.
- ⚠️ **A student has no INSERT policy at all.** This is the one table where a
  client-side write would mint points directly, so the refusal is at the
  database — verified by a real student token getting `42501`.

#### ⚠️ THE ADMIN UI IS FRENCH ONLY — decided, and not to be undone

`/admin*` carries **no i18n scaffolding**, no `t()`, no `/en/` counterpart.
Same decision as BabyClub, and for the same reason: it is a single-operator
context. Seàn and one or two profs use it, in French, in a room in Essaouira.

The public site's FR/EN rule is about *readers* — students and parents who may
arrive in either language. An admin screen has no such audience, and running it
through the i18n layer would double every string in `ui.ts`, double the review
surface, and buy nothing. ⚠️ **A future session must not "fix" this by adding
translations** — the missing EN is the decision, not an omission.

#### The agenda moves to the database — DECIDED, NOT YET DONE

⚠️ **BUILD-TIME READ, NOT A RUNTIME FETCH, and that is forced by the
architecture.** With `PUBLIC_AUTH_ENABLED` off there is no Supabase client in
the bundle at all, and `/agenda` must still render — so the only design that
works in both flag states is fetching published sessions at BUILD time and
emitting them statically. That also keeps the guest rule absolutely intact: zero
requests, not merely zero *auth* requests.

The cost, and it is real: **a session a prof publishes does not appear until the
site rebuilds.** That needs a deploy hook or a scheduled rebuild, and it is in
BACKLOG rather than hand-waved. The alternative — a runtime anon read on
`/agenda` — was rejected because it cannot work with accounts off and would put
a Supabase request on a public content route.

Migrating the content is one row: `src/content/agenda/` holds a single entry
(`2026-09-12.json`), so it is an `insert` in the migration that retires the
collection, not a script.

### The parent/child model — the learner stops being the login (0005)

Decision: BACKLOG → "Modèle parent + profils enfants", taken by Seàn. **A parent
holds the account; each child is a profile beneath it with no credentials**,
carrying progress, points, rank and attendance. Most students at Dar Souiri
arrive with a parent.

⚠️ **THIS LANDED BEFORE THE ADMIN SURFACES, AND THE ORDER IS THE POINT.**
v2-S4 part 2 was next in the queue and was deliberately pushed behind it,
because it changes what an admin surface is a surface *of*: `/admin/eleves`
lists children, not accounts, and the attendance marker marks a child. Built the
other way round, the fix is a rewrite of the class table, the marker and the
foreign key at the same time.

| Table | Owner column | Why |
|---|---|---|
| `child_profiles` | `account_id` → `profiles` (**nullable**) | who holds this learner right now |
| `exercise_progress`, `game_results`, `attendance`, `point_awards` | `child_id` | the work belongs to the PERSON |
| `sessions.created_by`, `attendance.marked_by`, `point_awards.awarded_by` | `profiles` | an ACTOR has a login; a learner does not |

#### ⚠️ ONE CODE PATH, NOT TWO

**An autonomous teenager is an account holding exactly ONE child profile.** They
are not a second shape with its own branch — they are the family case with a
list of one. `resolveChild()` adopts a single child silently and never shows a
picker; a parent with three sees one. Nothing anywhere asks "is this a family
account", because there is no such property: the count decides, and a family
that shrinks to one child stops being asked without any code knowing.

A brand-new account holds none, so `resolveChild()` creates one from the profile
name. That keeps "every learner is a `child_profiles` row" true from the first
second of the first session — the alternative is progress with nowhere to go,
which is the state this migration exists to make impossible.

#### ⚠️ GRADUATION IS ONE FK UPDATE, AND THAT IS THE WHOLE TEST OF THE SHAPE

The backlog states it as a design test: *if graduating a child into their own
account requires copying rows between tables, the shape is wrong.* It passes
because the child has its own primary key and everything hangs off **that**, not
off the account — so `graduate_child()` is a single `update child_profiles set
account_id = …` and touches no other table.

Proved on the test project rather than argued: the child key was unchanged, the
row counts identical either side, the new account read all of it and the old
account read none.

`SECURITY DEFINER`, `service_role` only, like `admin_set_role` — a parent who
could point someone else's child at their own account is the worst hole this
schema could have.

#### ⚠️ THE CHILD ID IS CONTEXT, NOT A PARAMETER

`progress.ts` is still the single reader and **its public API did not change
shape**: `recordSolved(slug)` takes a slug and nothing else, exactly as it did
for a guest. `src/lib/child.ts` resolves the active child once; the sync layer
reads it.

Threading the id through every caller would have put the account model into
`ExerciseView`, `PlayView`, four page components and every spec, for a value
none of them has any business knowing. Same containment as `BoardSurface.tsx`
and `src/lib/progress.ts`.

⚠️ **The import bookmark keys on the CHILD, not the account.** Two siblings on
one tablet each get their own first-sign-in merge; keying on the account would
give the second one silently nothing.

⚠️ **`child.ts` may not statically import `@lib/supabase`**, same rule as
`progress-sync.ts` — one static import puts 207 KB of client into every page
with a board, and `auth.spec.ts` asserts against the network log that a guest
fetches none of it.

#### ⚠️ "Qui joue ?" IS A CHOICE, NOT A PASSWORD

No PIN, no lock, no "are you sure". These are children in the same room as the
parent who signed in; a lock buys nothing and puts a credential in front of an
eight-year-old who wants to solve a mate in one. **The account is the security
boundary.** Which child is playing is a preference, exactly like the board theme.

Remembered **per device** (`mcc:child:v1`, keyed by account — one device may be
shared by two parents), so a child's own phone answers once and the family
tablet asks when the answer is genuinely unknown. The remembered choice is
re-validated against what the account actually holds: a child who was graduated
away must not keep receiving this device's progress, or the queue would fill
with rows RLS then refuses and never drain.

#### ⚠️ DROPPING A COLUMN DROPS ITS PRIMARY KEY AND ITS INDEXES, SILENTLY

`exercise_progress` was keyed `(profile_id, exercise_slug)`. Dropping the column
without rebuilding the key leaves the table with **no uniqueness at all**, and
the sync layer's upsert becomes an insert on every write. The composite indexes
from 0001/0003/0004 go the same way, and their loss reports as nothing worse
than "the class list got slow" months later. 0005 rebuilds all of them.

And **a policy naming the column blocks the drop entirely** — `2BP01`, *"cannot
drop column profile_id because other objects depend on it"*. Postgres will not
silently loosen a policy, which is correct; the consequence is that the owner
policies come off **before** the column and are recreated after. That ordering
is not cosmetic and it is what the first attempt at 0005 got wrong.

### Schema and RLS

`supabase/migrations/`, numbered, **never edited after merge** — a fix is 0002.

#### ⚠️ THE CHECKLIST FOR A MIGRATION THAT ADDS A TABLE

> **The checklist itself lives in [CLAUDE.md](../../CLAUDE.md) § "THE CHECKLIST
> FOR A MIGRATION THAT ADDS A TABLE"** — four lines, the last of which has been
> forgotten twice — and it is deliberately kept there rather than repeated here:
> it must be in context for a session that does not know this file exists. What
> follows is the history behind it.

⚠️ **It has now bitten twice.** 0002 was written to repair it across every
existing table, and **0003 reproduced it on `game_results`** anyway: the RLS
audit passed in full, and the e2e admin client then failed on a plain `select`.
The tell is a `42501` from a caller that is supposed to bypass RLS entirely —
`service_role` never hits a policy, so a permission error from it is *always* a
missing grant and never a policy bug.

⚠️ **`anon` gets nothing**, and that is a deliberate line rather than an
omission: a guest writes progress to their own device only, which is the whole
of the guest-first promise.

And the audit that catches it: **exercise the table with a real trusted client
after pushing**, not by re-reading the migration. See the live RLS audit under
v2-S3 — reading the file is what produced the bug both times.

⚠️ **Slugs are free text, deliberately not foreign keys.** Content lives in git,
so there is nothing to point at. Orphaned progress after a lesson is renamed is
harmless; the alternative makes the database a second, lagging source of truth
and turns a content rename into failing writes in production.

⚠️ **`is_staff()` must be `SECURITY DEFINER` with a pinned `search_path`.** A
policy on `profiles` that checks staffness by selecting `profiles` re-enters
itself and Postgres raises *"infinite recursion detected in policy"*.

⚠️ **Ordering inside a migration matters.** A `language sql` function body has
its object references resolved at `CREATE` time, so `is_staff()` cannot precede
the `profiles` table. Tables → functions → policies.

⚠️ **`role` is never client-updatable, and RLS alone does not achieve that.**
Policies operate on rows, and the row *is* the reader's own — so
`profiles_update_own` would happily allow it. The actual mechanism is
**column-level privileges** (`grant update (display_name, locale)`), with
`forbid_role_self_change()` as a second line and no INSERT policy at all.
Promotion is SQL only — `docs/ADMIN.md` holds the exact statements.

**Deletion cascades** from `auth.users` → profile → progress → attendance. The
erasure right depends on that chain and nothing else, so delete the *auth user*,
never just the profile. `tests/e2e/helpers/purge.ts` re-checks the cascade on
every run.

⚠️ **`handle_new_user()` clamps the locale, and that is a bug prevented in
advance.** A Google claim arrives as `en-GB` / `fr_CA`; written verbatim it
violates the CHECK, the trigger raises, and signup fails as an opaque *"Database
error saving new user"* with nothing pointing at the locale.

### Test infrastructure — the interlock

`assertNotProduction()` runs at **Playwright config load**, before a test is
collected, and aborts the whole run. The suite creates users and **purges by
pattern**; pointed at production it would delete real accounts.

It **fails closed**: refs equal, production ref undeclared, service key absent,
or an unparseable URL all abort. The single exception is a completely **absent**
`.env.test` — no credentials are reachable at all then (the loader never reads
`process.env`), and aborting would instead brick the ~750 specs that have
nothing to do with auth. Auth specs skip **visibly** in that case.

⚠️ **Never widen `tests/e2e/env.ts` to fall back to `.env` or `.env.local`.**
That single edit is what would let a developer's production credentials into a
suite that deletes by pattern.

**The known gap, stated rather than hidden:** nothing automated proves Supabase
*delivers* email. Users and links are minted through the admin API, so the flow
under test begins at "the link resolves". Real delivery is a manual check in
`docs/MANUAL-TESTS.md`. It is written at the top of `auth.spec.ts` because a
suite that appears to cover email and does not is worse than one that admits it.

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `PUBLIC_AUTH_ENABLED` | Cloudflare build vars | **Unset in production.** `'true'` — exactly that string — emits the account routes. Anything else is off. |
| `PUBLIC_SUPABASE_URL` | Cloudflare build vars + `.env` | Public by design |
| `PUBLIC_SUPABASE_ANON_KEY` | Cloudflare build vars + `.env` | Public by design; RLS is the boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | **`.env.test` only** | Bypasses RLS. Never in a build |
| `SUPABASE_PRODUCTION_REF` | `.env.test` | Feeds the interlock — **see the trap below** |
| `E2E_EMAIL_DOMAIN` | `.env.test` | The purge pattern |

`.env.test` is gitignored because it carries a service-role key. Local
development uses **`.env.local`**, not `.env` — Vite loads both and `.env.local`
wins, so keeping two is a way to lose an hour.

### Setup — which template goes where

> **`.env.test` comes from `.env.test.example`, never from `.env.example`.**

| Copy | To | For |
|---|---|---|
| `.env.example` | `.env.local` | local development / the real build |
| `.env.test.example` | `.env.test` | the e2e suite |

Adapting `.env.example` into `.env.test` is what lost `SUPABASE_PRODUCTION_REF`
twice. The interlock now refuses that file on sight — an unprefixed
`PUBLIC_SUPABASE_*` key in `.env.test` is the signature, and it aborts even when
the rest of the file looks complete, because the shape being wrong means the
file's provenance is wrong.

### ⚠️ TRAP: .env.test copied from the WRONG template

`SUPABASE_PRODUCTION_REF` went missing from `.env.test` twice, aborting the whole
suite both times. Root cause, found by comparing the file against its own comment
header: **it had been created by copying `.env.example`** — the build-time
template — **instead of `.env.test.example`**. `.env.example` has no such key, so
it disappears by construction on every recreation.

- **The tell**: a commented-out `PUBLIC_UMAMI_WEBSITE_ID` inside `.env.test`.
  Analytics has nothing to do with testing; that line exists only in the wrong
  template.
- **local development** → copy `.env.example` → `.env.local`
- **e2e suite** → copy `.env.test.example` → `.env.test`

Three things now make a third occurrence self-diagnosing:

1. `.env.test.example` carries the **real** production ref rather than a
   placeholder, so a straight copy is already correct. The ref is not a secret —
   it is the subdomain of the public project URL and already ships in the bundle.
2. `.env.example` opens with a warning that it is NOT the test template.
3. The interlock error names this cause when the TEST_ values are present but the
   production ref is not.

### ⚠️ TRAP: the production project ref begins with "vtest"

```
SUPABASE_PRODUCTION_REF=vtestpaufxmrvdhgrrsy
```

**That is PRODUCTION.** Supabase refs are random strings and this one happens to
start with the letters `vtest`, which reads exactly like "the test project". It
is not. It is the live database, in EU (`aws-1-eu-west-1`), holding real
accounts.

Why this specific string is dangerous rather than merely unfortunate: the
interlock in `tests/e2e/env.ts` decides "am I about to delete real data?" by
comparing the resolved test ref against `SUPABASE_PRODUCTION_REF`. Put the wrong
value there — or leave it out because "that one is obviously the test project" —
and the guard compares against nothing useful. The e2e suite **purges by
pattern**.

So when the test project is created:

- `SUPABASE_PRODUCTION_REF` in `.env.test` **must be `vtestpaufxmrvdhgrrsy`**;
- `PUBLIC_SUPABASE_URL` in `.env.test` must be the *other* ref, whatever it is;
- if the two are ever equal, the run aborts — which is the interlock working.

Read the ref, never the vibe of the ref.

---
