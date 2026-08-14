# Backlog

Everything decided but not built, in one place. CLAUDE.md points here rather
than keeping a second copy — a list that exists twice is a list that disagrees
with itself.

**Status vocabulary**

| Status | Meaning |
|---|---|
| `soon` | Agreed, no blocker, and wanted next — ahead of anything marked `backlog` |
| `backlog` | Agreed, unscheduled, no blocker |
| `blocked` | Cannot start until something external exists |
| `conditional` | Only happens if a specific judgement goes a particular way |
| `dormant` | Partly built already — schema or field exists, nothing renders it |
| `v3` | Explicitly beyond v2 |
| `seàn` | Waiting on a decision only Seàn can make |

---

## v2 sessions

| Item | Status | Note |
|---|---|---|
| **v2-S2** — Google OAuth, prof-created student accounts, Resend SMTP | `backlog` | SMTP needs a domain, and `mogadorchess.nachi3dlabs.com` is one — no longer blocked. OAuth and prof-created accounts could ship without it, but all three are one coherent "getting people in" session. `handle_new_user()` already clamps the locale for the Google claim. |
| **Turn accounts back on** | `seàn` | Set `PUBLIC_AUTH_ENABLED=true` in the Cloudflare build variables. ⚠️ **No longer blocked — v2-S3 shipped, so there is now something to sync.** The reason accounts were off (an account that does nothing is a child's email address collected for no reason) has gone. One variable, no code, and the database is already ahead of the site, which is the safe ordering. Seàn's call. ✅ **The parent/child blocker is CLEARED — migration 0005 shipped**, so an account opened now is already a parent account holding one child and needs no later rescue. See "Modèle parent + profils enfants" below. See CLAUDE.md → "Accounts are switched off in production". |
| **Modèle parent + profils enfants** | ✅ **BUILT** | Migration 0005 shipped: `child_profiles` with its own PK and a nullable `account_id`; progress, games, attendance and awards repointed to the child; `graduate_child()` proved on the test project (one FK update, progress followed, zero rows copied); live RLS audit clean, including "a parent cannot take over another family's child". Client side: `src/lib/child.ts` resolves the active child as CONTEXT — `progress.ts` kept its API shape — and the family section is on `/compte/`, with the "Qui joue ?" picker inside it. ⚠️ **A parent can now add, rename and remove their own children.** For two releases they could not: the section hid itself at one child or fewer and a new account is given exactly one, so the add form was unreachable for every real account while RLS permitted the insert and every spec stayed green. Fixed in `FamilySection.astro`, Critical Feature 48, `tests/e2e/family.spec.ts`. See CLAUDE.md → "The parent/child model". **What remains is the surfaces built on it**, below. |
| ~~**v2-S3** — progress sync + `localStorage` import~~ | **done** | Migration 0003 (`kind` discriminator + `game_results`), RLS audited live against the running database, `progress-sync.ts` behind `progress.ts`, an idempotent merge, a bounded offline queue, and the `/compte` + `/progres` surfaces. ⚠️ `PUBLIC_AUTH_ENABLED` is still OFF and is now the only thing between this and accounts being live. |
| **v2-S4 (part 1)** — the role boundary | **done** | Migration 0004 (`point_awards`), a 22-assertion live RLS/GRANT audit, and `role-separation.spec.ts`. The boundary is proven; the surfaces are not built. |
| ~~**v2-S4 (part 2)** — the admin surfaces~~ | **done** | `/admin` (dashboard), `/admin/eleves` (the class — **children, not accounts**), `/admin/eleve/?id=` (one learner: the student’s own progress, plus attendance and awards) and `/admin/seances` (session CRUD + the register). **No new migration was needed** — 0001/0004/0005 already carried every table and policy, which is what "the boundary underneath is already proven" meant. FR only, and now Critical Feature 43 so it stays that way. The register is one tap per child, optimistic, no modal and no save button; **measured at 59 ms of UI per child, 1.18 s for twenty taps, durable in 1.47 s** (`attendance-timing.spec.ts`). `role-separation.spec.ts` grew from 8 to 15 assertions, all through PostgREST with real tokens. ⚠️ **Creating a student from the admin UI is deliberately NOT built** — staff hold SELECT on `child_profiles` and nothing else; see "Guest attendance", which is the feature that needs it. |
| ~~**v2-S4 (part 3)** — the agenda moves to the database~~ | **done** | Build-time read, as decided: `scripts/fetch-agenda.mjs` → `src/data/agenda.json` → `src/lib/agenda.ts`. The git collection is retired and `content.config.ts` says why. Migration 0006 widened the public select policy so a **cancelled** session stays visible with its state (CF46 was only half kept), and migrated the single git entry with a fixed uuid. ⚠️ **The stated cost is real and is now made LOUD rather than solved**: `/admin/seances` knows what the deployed build baked, compares it to the live table by fingerprint, and tells the prof when the public agenda has not caught up. ⚠️ **Three dashboard steps remain and they are Seàn's** — `PUBLIC_SUPABASE_*` as Cloudflare BUILD variables (without them no prof can change the agenda at all), a Supabase webhook → Cloudflare deploy hook, and a nightly rebuild as the self-healing floor. All three in `docs/reference/deployment.md`. |
| **Guest attendance** | `backlog` | Attendance assumes a student with an account, so a teenager who has never signed in cannot be marked. BabyClub solved the same shape with **guest bookings** — a row keyed by a name rather than a profile — and that is the reference to look at when this is wanted. Not built here: it means attendance rows without a `profile_id`, which changes the FK and the RLS on a table that currently has a clean owner rule. |
| **v2-S5** — progress charts | `backlog` | Needs S3's data before it can show anything true. |
| **Student groups** (all profs currently see all students) | `backlog` | Deferred to v2.1 by decision, not oversight. |

### Modèle parent + profils enfants — ✅ DECIDED, and now BUILT (migration 0005)

✅ **Seàn's decision: parent-held accounts with child profiles beneath is THE
model.** Not one option among several, and not an open question — **most
students at Dar Souiri arrive with a parent**, so the family is the ordinary
case and the schema should say so.

**A parent holds the account.** `auth.users` is the parent: they sign in, they
receive the email, they enrol children in sessions. Each **child is a profile
beneath it**, with no credentials of its own, carrying progress, points, rank
and attendance. The same shape as BabyClub's `profiles → children`.

⚠️ **A DIRECT STUDENT ACCOUNT REMAINS THE SECONDARY CASE, not a deleted one.**
An autonomous teenager who signs up alone must still work — the model is
"parent-first", not "parent-only". Both shapes exist in the same schema.

⚠️ **AND IT STILL CANNOT WAIT, for a different reason now.** Today
`profiles.id` **is** `auth.users.id` — identity and person are one row, so a
child with no login has nowhere to live. Every account opened before the schema
changes is keyed to a login with real progress hanging off it. The decision is
made; what is left is doing it **before** accounts go live, or paying for it as
a data rescue afterwards.

- **Profile picker on app open — "Qui joue ?", Netflix-style.** A choice, not a
  password: a twelve-year-old should not be managing credentials, and the parent
  keeps oversight without standing over them. **Remembered per device**, so a
  child's own phone asks once and then stops asking.
- **One purse per child.** Individual merit stays visible — a child can see what
  *they* earned, which is the whole point of the ledger. ⚠️ **Do NOT invent a
  shared family wallet**: it blurs who earned what, which is exactly what E3's
  derived-not-banked rule exists to keep legible. A purchase may draw from
  **several purses**, with the split recorded on the order.
- **Attendance and exercises attach to the CHILD profile, not the parent.** A
  prof marks children, not accounts.
- ⚠️ **GRADUATION IS A REQUIREMENT, NOT A QUESTION.** A sixteen-year-old will
  not want to go through their mother's account. A child profile must be able to
  graduate into its own account **carrying its progress with it**, and the
  schema must make that **a migration of ONE FK, not a data rescue** — which in
  practice means a child profile needs its own primary key and a *nullable* link
  to the account that currently holds it, rather than being keyed on
  `auth.users.id` as profiles are today. If graduating a profile ever requires
  copying rows between tables, the shape is wrong.

#### ⚠️ WHAT THIS NOW BINDS — design against it, do not retrofit

The decision is taken, so these are no longer "interactions to consider". They
are constraints on work that has not been built yet, and each one is cheap to
honour now and expensive to retrofit:

| | |
|---|---|
| **v2-S4 part 2** (the admin surfaces) | ⚠️ **Must be designed against this model.** Attendance attaches to the CHILD profile; `/admin/eleves` lists children, not accounts; a parent with three children is three rows in the class table and one row in `auth.users`. Building it against "one account = one student" and fixing it later means rewriting the marker, the class table and the FK together. |
| **E8 shop** | One purse per child. A purchase may draw from **several purses**, with the split recorded on the order. ⚠️ Never a shared family wallet — it blurs who earned what, which is the same legibility E3's derived-not-banked rule protects. |
| **Points and rank** | One purse per child, so individual merit stays visible. A child sees what *they* earned. |
| The minors privacy paragraph | Already models a **guardian** email, so the policy is closer to this model than the schema is. |

**No longer blocked.** What remains is sequencing: the schema change should land
before accounts are turned on for families, because a club where parents enrol
is a different product from a club of teenagers with their own email addresses,
and the schema cannot straddle both after the fact.

## Deployment and domain

| Item | Status | Note |
|---|---|---|
| **Attach the custom domain in Cloudflare** | `seàn` | ⚠️ **The one manual step, and the only thing left.** Workers & Pages → `mogador-chess-club-website` → Settings → Domains & Routes → Add → **Custom domain** → `mogadorchess.nachi3dlabs.com`. Cloudflare creates the DNS record and issues the certificate itself — **do not add a CNAME by hand**, that is the usual way to get this wrong. `npx wrangler deploy` also provisions it from `wrangler.jsonc`, so this is belt-and-braces for the first deploy. Verify with `npm run smoke:prod`, which fails loudly and specifically until the certificate is active. |
| ~~Publish on `mogadorchess.nachi3dlabs.com`~~ | **done** | All four touch points landed: `site.url`, `astro.config.mjs` `site`, `routes[0]` with `custom_domain: true` in `wrangler.jsonc` (**still no `main`**), and `scripts/smoke-prod.mjs` + `npm run smoke:prod`, which did not exist before. See CLAUDE.md → Deployment. |
| **⚠️ The live `/agenda/` is BLANK and only a build will fix it** | `seàn` | ⚠️ **Production is currently telling readers "Aucune séance programmée pour le moment".** Everything underneath is now correct — 0003–0007 are applied and `anon` reads the 12 September session from the live database — but the **deployed build predates them**: the serving version is `45e06d08`, created `2026-08-13T23:41:11Z`, and the `sessions` row was inserted at `2026-08-14T12:29:54Z`, **13 hours later**. A build baked before a row exists cannot contain it. **Nothing in the repo needs to change; a production build needs to run.** Cleanest path is a Cloudflare rebuild of `main` from the dashboard (Deployments → Retry), which is also the path that proves the build variables and the branch setting together. A local `npx wrangler deploy` would work only with `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` exported into the build's own process — `.env.local` does not reach `fetch-agenda.mjs`. **Deploying is Seàn's call**, hence the status. |
| **⚠️ Verify the two configuration invariants at every promotion** | `process` | Neither lives in this repository, so nothing here goes red when one drifts, and **both were once correct and silently stopped being so**. **(1) Production's schema is not behind the repo** — it ran three migrations behind while `dev` advanced; ask the catalog per migration with the queries now in [`docs/reference/supabase.md`](./reference/supabase.md), and ⚠️ **not** `supabase_migrations.schema_migrations`, which lists `0001,0002` on a database holding all seven. **(2) Cloudflare deploys `main` only** — Workers Builds was set to deploy *every* branch, so `dev`'s `61030c4` (a docs commit) became the live site 108 s after its push; the non-`main` command is now `npx wrangler versions upload`. Both are on the release-gate checklist in CLAUDE.md. See [`docs/reference/deployment.md`](./reference/deployment.md) for the timeline. |
| **`npm run smoke:prod` passes on a blank agenda** | `backlog` | Its `/agenda/` sentinel is `/class="(sessions\|empty)"/`, so it went green on all 14 routes while the club's one session was off the site. Not a defect — a static probe cannot know how many sessions ought to exist — but it means the one check aimed at production is blind to production's known failure mode. **A real fix needs the database**, which would put credentials in a smoke check that currently needs none; the cheaper half is to have it *report* the session count and fail only on zero, since zero is never right for a club that meets weekly. Decide which before writing either. |

⚠️ **`mogadorchess.ma` stays a separate, later option and blocks nothing.** It
needs a Moroccan registrar and can require paperwork; the subdomain needed
neither. If it ever lands it is the same three config touch points again plus a
redirect — cheap, and no reason for anything to wait on it. That includes
**custom SMTP**, which needs *a domain you control* rather than that specific
one.

## Accounts and privacy

| Item | Status | Note |
|---|---|---|
| ~~**31.9 KB of switched-off code is precached**~~ | **done** | Fixed in `scripts/build-sw.mjs`. ⚠️ **The measurement in the original entry was wrong and the fix corrected it: 29.9 KB across 12 files, not 31.9 across 13.** `child.js` looks like an auth chunk and is genuinely reachable — `progress.ts` → `progress-sync.ts` → `child.ts` is live on every board page — so a hand-written `globIgnores` list naming "the auth chunks" would have pulled two live modules out of the offline cache. The fix therefore asks the BUILD which assets no emitted page can reach, transitively, and excludes those; with accounts ON it finds nothing, which is the same code proving itself. Precache went 162 → 150 files, 5983 → 5953 KiB. Guarded twice: the build fails if an exclusion did not take effect, and `pwa.spec.ts` asserts it in both flag states — **after** asserting the chunks exist, because "no admin chunk in the manifest" passes perfectly on a build that has none. |
| ~~**⚠️ The release matrix goes red on this machine, and it is getting worse**~~ | **done** | Fixed in `scripts/test-release.mjs`: the matrix now runs **one project at a time at three workers** — **0 failures in 66.8m**, against v0.11.0's 4 in 43.9m and v0.11.1's 7 in 58.3m. ⚠️ **The cause was memory exhaustion, not a browser bug and not a test bug.** Playwright shares **one worker pool across every project**, so the default six workers meant six *mixed* browsers side by side: **80 processes, 6.68 GB, 2.08 GB of 15.8 GB free** — the point at which Firefox's software compositor cannot allocate. That is why it landed on a different spec every run and why every one passed serially. All three options in the original entry were settled with numbers: **A** (per-project, 3 workers) shipped; **C** (pooled, 3 workers) was green but *not cheaper* — 51.7m for only the three failing projects, so pooled-over-five lands above A, and it looked cheap because it did less; **B** (`fullyParallel: false` on firefox) was **rejected without a run**, because webkit and iphone-13 already carry that setting and were two of the three projects failing both gates. ⚠️ **Honest caveat, recorded in `docs/reference/testing.md`:** C's green run suggests the **worker cap**, not the per-project split, is the half that does the work — the split is kept for the per-project accounting it enables (a project that runs zero tests is now caught; the old "total divides by 5" check could not see that). ⚠️ **Not fixed by loosening timeouts** — tried on `play.spec.ts`, the failure count went UP. **The gate is now expected to be GREEN: a red matrix is a finding, not a known flake.** |
| ~~**Self-service account deletion**~~ | **done** | Migration 0007 `delete_own_account()` — no target parameter, `authenticated` only. Two steps on `/compte/`, the second a typed `SUPPRIMER`, and the confirmation names children, progress, games, points and attendance. **Nothing is retained** — no statistics, no archive, no anonymised copy — and a spec asserts that rather than the notice claiming it. Audited live on the test project: every table 1 → 0 in 453 ms, auth user gone, the club's session kept with `created_by` nulled. `/politique-confidentialite` changed in the same commit. |
| **⚠️ `anon` holds `TRUNCATE` on every public table but `profiles`** | `bug` | Found auditing production's catalog on 2026-08-14, and true of the test project too. **No migration grants it** — a Supabase project ships `alter default privileges in schema public grant all on tables to anon, authenticated`, which fires on `create table` before a migration's own `grant select` line is reached. `profiles` escaped only because 0001 happens to `revoke all … from anon, authenticated` first; `sessions`, `child_profiles`, `exercise_progress`, `lesson_progress`, `game_results`, `attendance` and `point_awards` did not. ⚠️ **`TRUNCATE` is not filtered by RLS**, so the row-level design is not what is stopping it — what is stopping it is that PostgREST exposes no verb that reaches it, and *reachability is not authorisation*. **Not exploitable with the anon key**, so this is defence-in-depth, not an incident. The fix is a migration revoking the default-privilege set from `anon` on the seven tables; the rule (`revoke all` as step 0 of the new-table checklist) is already in CLAUDE.md so no *new* table can repeat it. |
| **⚠️ Production's migration ledger is five behind its schema** | `bug` | `supabase_migrations.schema_migrations` records `0001,0002`; the schema demonstrably holds everything through 0007. 0003–0007 were applied by a path that did not write the ledger (the SQL editor, most likely). **Harmless to the running site, dangerous to tooling:** a future `supabase db push` at production would attempt to **replay** five applied migrations, and 0005 carries `alter table … drop constraint exercise_progress_pkey` with no `if exists`. It would abort rather than corrupt — but discovering that mid-promotion is the wrong time. Fix is to backfill the ledger rows to match reality, as a deliberate act against a hand-typed ref; ⚠️ **do not add a production path to `scripts/db-push.mjs`** to do it. |
| **Two-year inactive-account rule** | `backlog` | Stated as policy, enforced by nothing. Needs a scheduled job — most likely a Supabase cron, since this architecture has nowhere else to put one. |
| **Custom SMTP (Resend)** | `backlog` | Needs **a domain you control**, not specifically `mogadorchess.ma` — `mogadorchess.nachi3dlabs.com` satisfies it, so this is no longer blocked (see Deployment and domain). Supabase's built-in mailer is rate-limited, sends from an unfamiliar domain, and its template is untranslated — all three matter when the recipient is a parent being asked to click a sign-in link. Verify SPF/DKIM/DMARC when it lands. |

## Design direction

| Item | Status | Note |
|---|---|---|
| **Refonte esthétique majeure** — make it feel like a GAME | `in progress` | Direction written and approved: `docs/direction/mcc-direction-esthetique.md`. Sequenced E1 → E4; see below. |
| **E1 — motion vocabulary + action feedback** | **done** | Three families, the press, the correct-move pulse, the wrong-move reason, the two-beat solve, a second ambient layer. |
| **E2 — sound** | **done** | Six synthesised voices in `src/lib/sound.ts`, off by default, own key `mcc:sound:v1`, three volume steps, one-time invitation at the first solve. No audio files: 0 precache bytes, 0 requests, no licence question. ⚠️ Departs from the direction doc on one point — `prefers-reduced-motion` does **not** silence the site, only the unprompted offer. See CLAUDE.md → Sound. |
| **Is the sound palette right?** | `seàn` | The suite proves the plumbing and cannot hear a thing. Three questions only a person can answer, all in `docs/MANUAL-TESTS.md`: does a correct move feel satisfying; does a wrong move feel **corrective rather than punishing** (the one that matters — it teaches children); and is anything grating after twenty exercises. Every voice is four numbers in one file, so re-tuning is cheap. |
| **E3 — progression** | **done** | Ranks Pion → Cavalier → Fou → Tour → Dame at 0/20/70/150/220, a derived point ledger, session streaks and seven achievement kinds. **Session streaks only — never a daily streak** (now Critical Feature 34). Still wants v2-S3 to mean anything across devices. |
| **E3 — "a trap mastered" achievement** | `blocked` | Deferred out of E3 on purpose. A trap page is a *replayer* and records nothing, because stepping through a game someone else played is reading rather than competence. Shipping it today would mean awarding it for scrubbing a replay to the end — the "rank earned by clicking" the direction forbids. **Blocked on a trap carrying an exercise**, which is content work plus a schema field, not progression work. |
| **E3 — serve the score catalogue as one file** | `backlog` | The resolver inlines a ~3.4 KB catalogue and a ~5 KB script on ~62 of 86 pages (+744 KiB precache, uncompressed). Already trimmed three ways — terse script, no entry ids, shared toast CSS. The remaining win is serving the catalogue as one same-origin JSON and inlining it only on `/` and `/progres/`, where it is needed in the first paint. Costs a request on board pages; judged not worth the complexity yet. |
| **E5 — retro main menu on the home page** | **done** | Six entries, roving tabindex, "Reprendre" resolving to the furthest incomplete step. |
| **E6 — complete themes** (background + board + pieces) | **done** | Four themes, each with both palettes, four licence-checked piece sets and a sixth board preset. The constraints it shipped under still bind anything added later: every piece set needs its own attribution on `/mentions-legales/`, verified set by set; texture in CSS only, never images; and every theme clears `check-contrast.mjs` on all its pairs in both modes **at design time**, not at the end. |
| **E7 — thematic typography** | **done** | Heading face per theme; **the body family never changes** (Critical Feature 23). One theme loads one display font, never four. |
| **E8 — the shop** | `blocked` | ⚠️ **One purse per CHILD, and an order records the split when a purchase draws from several** — the parent/child model is decided and the shop must be built against it, never against a shared family wallet. Catalogue display needs nothing; **the points exchange cannot open before v2-S3**. Points live in `localStorage` while accounts are off, so changing phone loses them — and that is a lost *reward*, not lost progress. Once accounts exist the balance must be computed in the database from exercises actually solved, never accepted from the client. **Points are never sold.** |
| **E4 — vocabulary and atmosphere** | `backlog` | Evocative names on **page titles only**; nav labels stay functional (Cours, Exercices, Jouer). ⚠️ Now constrained by E5 as well: the home menu takes its labels from the same `nav.*` keys, so renaming a nav label renames a menu entry too. May be absorbed by E5 + E7 — see the addendum. |

### Refonte esthétique majeure — a direction session, not a patch

The site should read as a **game first and a learning site second**: more motion
around buttons, boards and backgrounds — playful, alive, arcade-adjacent.

What it must NOT cost:

- **The "old chess club" identity.** Wood, baize, brass, yellowing score sheets.
  Arcade energy inside that world, not instead of it.
- **The AA contrast guarantees.** `check-contrast.mjs` runs first in the build,
  both palettes, every board preset. A livelier palette still has to clear it.
- **`prefers-reduced-motion`.** Every added motion needs its off switch, and
  "off" means off, not faster.
- **No GSAP.** Its licence is not OSI and conflicts with this project's
  GPL-3.0-or-later (see the note in CLAUDE.md). CSS and small vanilla JS have
  carried the ambient motion so far at ~1.3 KB; a new library must clear the
  same licence bar before it is even evaluated on merit.

~~⚠️ **This wants a written direction and Seàn's sign-off before any
implementation.**~~ RESOLVED — the direction is written, approved, and lives at
`docs/direction/mcc-direction-esthetique.md`. Its guiding line: *un site donne
l'impression d'un jeu quand il **répond**, pas quand il est déguisé.* Order of
work is **feel (E1) → sound (E2) → progression (E3) → dressing (E4)**, and the
board stays sober throughout.

---

## Teaching and content

| Item | Status | Note |
|---|---|---|
| **Lessons built around a YouTube video** | `dormant` | Seàn supplies a URL; a lesson is authored around it. The `youtube` field already exists on `traps` and `cours` and validates an 11-character ID — **nothing renders it**. Requires the click-to-load facade on `youtube-nocookie.com` (decided in Session 3, never built) so the zero-third-party-request posture holds: a plain iframe sets cookies at page load and would break the specs that assert it. Dormant until the first video exists. |
| ~~**Beginner tutorial** (`/apprendre-les-bases/`)~~ | **done** | 13 steps, both locales, shipped this session. |
| ~~**Course detail pages**~~ | **done** | Per-locale Markdown pairs shipped with course 1. A `lessons` collection keyed by `course` + `slug` + `lang`; routes are `/cours/<course>/<lesson>/`. |
| ~~**Course 3 — "Les motifs tactiques"**~~ | **done** | Seven lessons, both locales, shipped from content batch 3. Four of its eight positions had to be rebuilt first — see CHANGELOG. |
| **Courses 4+** | `backlog` | Courses 1, 2 and 3 are written. The structure is proven; the remaining work is authoring. |
| ~~**Author FENs need a claim-level check**~~ | **done** | `claims[]` on `position` and `exercise` boards, asserted by `check-content.mjs`: `pin`, `fork`, `discovery`, `line`, plus `manual` with a required note. Each assertion was verified to fail on the real broken position before being trusted. See CLAUDE.md → "A legal position is not a correct one". |
| **Retrofit `claims[]` onto courses 1 and 2** | `backlog` | 17 boards predate the check and sit on the manual review queue as *"no claim declared"*. Not urgent — they have been read by humans and shipped — but the queue is only useful while it shrinks. Do it opportunistically, when touching a lesson anyway. Only `position` and `exercise` boards are covered; **trap replayers and `tutoriel` steps are not** and would be a separate decision. |
| **A trap cannot show its own refutation** | `open` | Every trap teaches "how not to fall for this", but a trap has **one** `pgn` and the replayer walks a linear ply list, so the refutation can only be described in prose and asserted in `claims[]` — never played out on the board, which is what batch 4's brief asked for. PGN variations (RAV) would need parser and replayer support. The cheap version is an optional `refutation: { pgn, moveComments }` plus a second `ReplayBoard` on `TrapPage`; the batch-4 brief pinned the schema, so it was not done. |
| **Trap prose cannot carry a link** | `open` | `summary` and `moveComments[].text` both render as plain text (`<p>{summary}</p>`, `{comment.text}`), so batch 4's cross-links to the course-3 motifs are **named in prose rather than hyperlinked** — "relis la leçon « Le clouage »" instead of a link. Lessons link to traps fine (Markdown); only the reverse direction is stuck. An optional `related[]` of slugs rendered as links under the summary would fix it. |
| **Claim kinds a forcing search would unlock** | `backlog` | `skewer` and "wins the piece" need to prove something about *every legal reply*, which is a small search rather than a property of a position — deliberately left out so the checker cannot appear to cover what it does not. Three course-3 boards are on the manual queue for exactly this. Stockfish is already in the repo; if this is ever wanted, it is a lab-style script, not part of the build. |
| **MDX for lesson bodies** | `backlog` | Boards are currently placed with a `<!--board-->` marker split out of the rendered HTML. It works and costs nothing, but MDX would allow real components inline. Only worth it when a lesson needs something a marker cannot express. |
| **Engine-backed validator for `onlyMove: false`** | `backlog` | The remaining half of the exercise-validation rule. Stockfish is here now; this is what finally lets a winning alternative be accepted instead of "not the line we had in mind". |
| **Printable handouts from the PGN** | `backlog` | — |

## Board and interaction

| Item | Status | Note |
|---|---|---|
| **Promotion picker on the pointer path** | `backlog` | Currently backwards: the typed path honours `e8=D`, the pointer path auto-queens. A keyboard user therefore has strictly *more* control than a mouse user, which is the wrong way round. No shipped exercise promotes, and a queen is right ~99% of the time against the engine — so it is real but not urgent. |
| **Pass-and-play** (two players, one device) | `backlog` | Not free from `PlayView`: no engine, no thinking state, a board that flips or does not, and a second result vocabulary ("White wins" rather than "you win"). A small separate mode, not a flag. |
| **"Nocturne" board preset** | `resolved` | Superseded by E6. `phosphore` is the sixth preset, and every theme now names its own board — so "too bright in a dark room" is answered by choosing Terminal or Marbre rather than by another preset. Reopen only if a reader wants a dark board *inside* a light theme. |
| **AGPL piece sets** (`pixel`, `letter`, `pirouetti`) | `conditional` | Free software, and NOT a licence conflict — but AGPLv3 §13 adds a network-use obligation the repo does not currently carry, so adopting one changes the licence statement on `/mentions-legales/`. `pixel` would suit Terminal well. Needs Seàn's decision, not a session's. |
| **Old-style figures in body text** | `blocked` | Declared in `typography.css` and inert: Inter ships no `onum`. Only unblocked by changing the body face, which the E7 safety rule forbids doing per-theme. A spec reports whether it ever starts working. |
| **The board BLOCK overflows a phone screen** | `open` | **Measured in M3, not fixed.** At 390×844 (791px usable) the exercise block is **833px** and the trap replayer **895px**; at 360×640 (587px usable) they are 828px and 865px. The *board* is fine — 335px — so this is not a sizing bug: the other ~500px is the control stack (tag, move field, buttons, hint, verdict). Compressing it is a design decision about what an exercise shows at once, which is why M3 recorded it rather than tweaking CSS. Re-measure with `scripts/measure-board.mjs` (scratchpad, M3 session) or rebuild it — it walks `.mcc-board-block` at both viewports. |
| ~~**A killed matrix leaves orphaned Playwright browsers**~~ | **done** | `orphanedBrowsers()` in `scripts/demo.mjs`, inside the same `sweep()` as the preview cleanup, so it runs on startup and on Ctrl+C. Matches on `ExecutablePath` under a Playwright browsers root (`PLAYWRIGHT_BROWSERS_PATH` first — the documented default is wrong on this machine), **never on the process name**; kills tree roots only, with `taskkill /T`, and **only when orphaned** so a run in progress is never touched. Verified live: 25 outside-cache browsers spared, 3 spared while their launcher lived, 1 orphan reported and 4 processes gone. See CLAUDE.md → the sweep. |
| **The M1 mobile header wraps at 360px** | `open` | 61px at 390px, **97px at 360px** — the "one line" header becomes two, eating 36px of an already short screen. Found in M3. |
| **The desktop header wraps between 768px and 1023px** | `open` | **77px → 129px**, introduced by adding the fifth nav entry (`/progres/`) — it adds 72px of nav width and pushes `header-inner` past one line in that band. Verified against `dev` that the header already wrapped at 768px without it, so this widens an existing behaviour rather than creating one, and 1024px+ is untouched. **Not fixable by trimming the gap** — the four `nav-root` gaps hold 16px at 0.25rem against the 72px needed. The real options are a narrower brand (hiding the club name below 1024px, reclaiming ~150px) or accepting two rows; the first is a design decision, not a session's. Accepted for now and measured rather than papered over. |

## M3 — app density, unfinished items

M3 delivered the card consolidation and three-state progress. These were in the
brief and are **not** done:

| Item | Status | Note |
|---|---|---|
| **"Reprendre" card on `/cours` and `/exercices`** | `open` | Decided with Seàn during M3: extract the E5 resolver from `HomePage.astro` into one `ResumeCard.astro` (props: locale, journey, variant) with four call sites — Home, Dashboard, `/cours`, `/exercices`, `/progres`. It must stay `is:inline` (it runs before first paint; measured CLS 0.000) and `/exercices` needs its own journey, since standalone exercises are not in the E5 journey at all. |
| **Board fit and prev/next clearance** | `open` | See the two rows above. |
| **`/progres` substance** | `open` | Currently three bars. The brief wants exercises solved **by level and by theme**, lessons completed, tutorial progress, and what remains — all from data that exists today. Rank and points stay "bientôt" until E3, as the dashboard already does. |

## Beyond v2

| Item | Status | Note |
|---|---|---|
| **Online play** — room codes + Durable Objects | `v3` | `MoveProvider` in `src/lib/chess/opponent.ts` is already the seam: a new implementation plus a lobby, not a board rewrite. |
| **Spectate a room** | `v3` | Follows online play. |
| **Decorative 3D hero** | `v3` | Would have to clear the same bar the ambient motion did: no new dependency with a licence that conflicts with GPL-3.0, and Lighthouse ≥ 90 on home mobile. |

## Waiting on Seàn

| Item | Status | Note |
|---|---|---|
| **`mogadorchess.ma` domain** | `seàn` | ⚠️ **No longer blocks anything.** `mogadorchess.nachi3dlabs.com` gives the site a real address and unblocks custom SMTP with no registrar step (see Deployment and domain). `.ma` remains a separate, later option — a nicer name for a Moroccan club — and needs a Moroccan registrar and possibly paperwork. Decide it on its own merits, not under pressure. |
| **Club Instagram handle** | `seàn` | Does the club post through the association's account or its own? `site.socials` has the entry, unpublished. |
| **Brand mark** | `seàn` | The current one is an explicit placeholder — a board in a brass frame. |
| **Dar Souiri street line** | `seàn` | Which exact address may be published. |
| **Arabic / Darija locale** | `seàn` | A real question in Essaouira. The i18n layer supports a third locale structurally; RTL would need design work. |
| **FR pedagogy review of the tutorial** | `seàn` | Written this session — see the note in CHANGELOG. The chess is machine-verified; the *teaching* is not. |
| **Chess accuracy + FR pedagogy review of the six traps (batch 4)** | `seàn` | Every line is machine-verified legal and every declared mechanism is asserted on each build; the **judgements** are not, and they are the part that matters here. Four to look at. **(1)** The QGD trap was renamed from the brief's "piège de Lasker" to **le piège de l'éléphant** — the Lasker Trap is the Albin under-promotion line, a different opening. **(2)** `blackburne-shilling` is shipped as **unsound and says so in its own summary**; confirm that framing is the one you want in front of a twelve-year-old. **(3)** `fegatello` states that modern theory holds Black survives with best play — a verdict on a whole defence, not something any check proves. **(4)** ECO codes (C23, C57, D51, C50, C71, B17) are best-effort and unverified against a reference. |
| **FR pedagogy review of course 3 (les motifs tactiques)** | `seàn` | Same rule: every position and every line is now machine-verified, the *teaching* is not. Two specific things to look at. **(1) Lesson 5, la déviation** — `Ra8+` forces mate in two, so the "try it yourself" has a second, stronger right answer and `onlyMove` is `false`. The position cannot be fixed without removing the weak back rank the lesson is about, so the options are: accept it, replace the exercise, or let the engine-backed validator sort it out later. **(2) Lesson 2's added paragraph** — a short passage naming the d7 pawn was written by Claude (not in the brief) after the original position turned out to contain no pin at all; it is the most common beginner misconception about the Ruy Lopez and worth keeping, but it is unreviewed copy. |
| **Language switcher fails WCAG 2.5.3 (Label in Name)** | `bug` | PRE-EXISTING, found by Lighthouse during M1/M2 and not introduced by it. The switcher shows "English" but its accessible name is "Changer de langue", so the visible text is not in the name — voice control ("click English") cannot reach it. Zero-weight in Lighthouse's score, which is why it never surfaced. One-line fix in `LangSwitcher.astro`, but it touches a component with its own specs, so it was left rather than widened into an unrelated session. |
| **M3 — density pass on the inner pages** | **done** | Shipped across v0.6.0's M3 and v0.7.0's M3 (suite): one card definition, three-state progress, the compacted exercise controls, the shared resume resolver and `/progres` substance. |
| **⚠️ The correct-move pulse is dropped under fan-out load on WebKit** | `bug` | **ANNOTATED `fixme` ON `webkit` AND `iphone-13` ONLY (v0.7.0+).** It still runs with full teeth on chromium, firefox and pixel-5, which exercise the same code path — so a pulse that genuinely stops being drawn still fails the gate. **The feature works**: the test passes on both WebKit projects in isolation (`--workers=1`). ⚠️ **It is NOT a sampling artefact, and two sessions must not be spent proving that again.** Four independent samplers (rAF, `setInterval`, an observer on `cg-board`, an observer on the `.cg-wrap` host) recorded **35 mutation records and zero sightings**, including a `record.oldValue` check; a `data-pulse` probe showed ExerciseView's state committing and clearing normally (`'' → a8 → ''`). The break is therefore **below Preact and above the DOM**. **RULED OUT:** (a) the observer watching a `cg-board` Chessground had replaced — an identity tag proved the node was never replaced; (b) the clear-timer overtaking the apply in the move handler — fixing that did not resolve it. **CONFIRMED BUT INSUFFICIENT:** Chessground's `debounceRedraw` is rAF-scheduled *and* coalescing (`if (redrawing) return`), so a starved frame drops the intermediate state; the rAF gate added to `ExerciseView` moved `iphone-13` from hard failure to flaky but left `webkit` failing. **OPEN QUESTION, and where to start:** does `BoardSurface`'s update effect ever observe a non-empty `pulseSquare` under load, or does Preact's deferred effect flush coalesce the two values so `api.set()` is never called with the pulse at all? A probe for exactly this (`data-pulse-effect-saw` set inside the effect) was written and not run — the machine needed restarting. Answering it decides between a product fix and accepting the drop. |
| **Does Souiri feel like Essaouira?** | `seàn` | The identity theme, and the only part of E6 no machine can judge. `docs/MANUAL-TESTS.md` § Q3 has the questions; the last one is "show it to someone from Essaouira". |
| **Is Terminal readable or a gimmick?** | `seàn` | § Q4. The test is reading a whole lesson in it, on a phone, without switching away. If it fails, it is softened or dropped — it is the one theme that exists for fun rather than for legibility. |
