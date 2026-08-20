# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Per CLAUDE.md → Conventions, this file is updated on **every merge to `dev`**.

---

## [Unreleased]

Nothing yet.

---

## [0.17.0] — 2026-08-20

**Recurring sessions with `series_id`, single-statement bulk writes so a
thirteen-session creation triggers ONE rebuild, and migrations 0011 (the rebuild
trigger, with a vault-supplied hook) and 0012 (session series).**

A term of sessions programmed in one action, and one Cloudflare build to show
for it — plus the rebuild trigger finally written down as a migration instead of
living only in the production database.

### Added

- **Migration 0011 — the site rebuild trigger, captured from production.**
  Publishing a session now asks Cloudflare to rebuild, so the staleness banner
  goes green on its own instead of waiting for somebody to deploy.
  - ⚠️ **It already existed on production, hand-applied, and that is the defect
    this repairs.** A trigger that lives only in the live database is one the
    test project does not have, nobody can review, and `db:push` does not carry.
    Everything in 0011 is idempotent so it can be run **over** the hand-applied
    objects; running it is what makes the two agree.
  - ⚠️ **The Supabase Database Webhooks UI cannot be used on this project**, and
    the hour spent proving it is now recorded rather than repeatable. It fails
    with `schema supabase_functions does not exist`, then with
    `function supabase_functions.http_request() does not exist` — enabling
    `pg_net` does not fix it, because pg_net puts its functions in `net` and the
    UI wants a `supabase_functions` shim this project does not have. The UI is a
    convenience over exactly this trigger.
  - **`public.rebuild_requests`** logs one row per firing, with the row count
    taken from a transition table. It is the instrument that makes "thirteen
    sessions, one build" **countable rather than asserted**. Staff-readable, no
    insert policy, `service_role` granted explicitly (the 0002 lesson).
  - ⚠️ **The trigger may never fail a write** (Critical Feature 70). Every
    failure path — missing vault, unreachable `net.http_post`, Cloudflare down —
    logs a `note` and returns. A trigger that can raise makes `/admin/seances`
    unable to save, turning somebody else's outage into a database outage in
    front of a room of children. At **migration** time the converse holds: a
    missing `pg_net` raises and names the dashboard page that enables it.
- **Migration 0012 — `sessions.series_id`**, a nullable, partially-indexed
  label. See the recurrence entry below for what it is and is not.
- **Recurring sessions in `/admin/seances`.** Create a session, choose *chaque
  semaine* or *toutes les deux semaines*, give an end date, and get the whole
  term in one action.
  - **The preview lists every date before anything is created**, in full, and
    the submit button says the number — "Créer" and "Créer les 13 séances" are
    different promises. ⚠️ **The cap (52) REFUSES rather than truncating**:
    creating the first 52 of 523 silently would leave a prof believing the rest
    exist, in the public agenda, where nobody would check.
  - **A *Séries* block** offers "publier les N brouillons" and "annuler les N
    séances à venir" — never the past ones, because a session that happened
    happened.
- **`src/lib/recurrence.ts`** — pure, importable, no DOM and no Supabase, so its
  arithmetic is checkable without a browser and its spec runs in both flag
  shapes and with no credentials at all.
- **`tests/e2e/recurring-sessions.spec.ts`** — six arithmetic tests plus two that
  drive the real UI against the real database and **count the trigger firings**.
- **`docs/SETUP-NEW-MACHINE.md` — bringing the project up on a fresh Windows
  machine, in order, with a verification after each step.** Written because the
  project is moving to another PC and four things live on this machine and not
  in the repository: the toolchain, `node_modules/`, the Playwright browsers,
  and the two gitignored env files — of which **only the env files cannot be
  regenerated**.
  - It records **which secrets come from where**: the `PUBLIC_*` pair from the
    Supabase dashboards, the Cloudflare **build variables** from the Cloudflare
    dashboard (where `PUBLIC_AUTH_ENABLED=true` lives, and nothing in this
    repository says so), and the **deploy hook URL from Supabase Vault only** —
    never a table, never `.env`, never a migration, because this repository is
    public (Critical Feature 68).
  - ⚠️ **It names three variables in the old `.env.local` that MUST NOT be
    copied**: `SUPABASE_SERVICE_ROLE`, `SUPABASE_PASSWORD` and `WEBHOOK_URL`.
    **Nothing in the repository reads any of them** — the suite and `db:push`
    take the `TEST_`-prefixed pair out of `.env.test`, and the deploy hook lives
    in the vault. Two of the three are production credentials and the first
    **bypasses RLS entirely**; `.env.example` says in its own header that the
    service role key "is NOT here and must never be", so the file on this
    machine contradicts its own template. They are fetched from the dashboard
    when a hand-run task needs them and deleted after.
  - ⚠️ **A credential nothing depends on is the hard one to notice**, because
    nothing ever fails to remind you it is there.
  - Also records what is **per-machine rather than copied** (SSH key, browsers,
    `node_modules/`, `wrangler` login, the non-default
    `PLAYWRIGHT_BROWSERS_PATH` — which is a preference, not a requirement, since
    `scripts/demo.mjs` already reads it first and falls back), and that the
    committed generated assets (icons, fonts, `fonts.css`, piece sets, the
    vendored engine, `agenda.fallback.json`) are **checked, never regenerated**.
- **`docs/SETUP-NEW-MACHINE.md` §9a — "Before a matrix run: quiet the machine
  first", with the cost of each background process MEASURED rather than
  asserted.** Added after the gate was re-run on the new laptop and **all ten
  project-runs tripped the under-3 GB warning**. The list names what to close
  (OneDrive pause, Dell TechHub, SupportAssist, Waves, a Defender path
  exclusion) with the working set each was holding, so it can be **argued with
  and re-measured** rather than followed as superstition.
  - ⚠️ **`ServiceShell.exe` (973 MB) is listed as UNIDENTIFIED**, deliberately:
    it is the largest single consumer and its path was unreadable without
    elevation. The instruction is to identify it before acting, because
    "close the biggest thing" is how a machine gets broken.
  - ⚠️ **`--workers=3` is explicitly NOT the knob to turn** — the alternatives
    are already measured in `scripts/test-release.mjs`, and lowering it trades
    one slow run for a slower one without fixing the baseline.

### Changed

- ⚠️ **Every matrix run keeps its own log** — `matrix-<shape>-<stamp>.log`,
  `matrix-<shape>-<stamp>.json` and `freemem-<shape>-<stamp>-<project>.txt`,
  with the `rmSync(LOG)` at startup removed. **Found by it biting at this
  release's own gate.** `test-release.mjs` wrote to one `matrix.log` and cleared
  it on startup, which is correct for one run and wrong for a gate that runs
  TWICE, once per flag shape: the accounts-ON run deleted the accounts-OFF run's
  log the moment it started. The OFF matrix had come back red with four failures
  — three firefox, one webkit — and the log naming them was gone, along with
  `test-results/`, which Playwright clears on its next run. Four failures that
  could not be adjudicated, on a gate that blocks promotion, and the only remedy
  was re-running the whole 90-minute shape.
  ⚠️ **The memory traces had the identical bug** — `freemem-firefox.txt` is
  keyed by project, so the second shape overwrote the first's troughs, which are
  the numbers that decide whether a failure was a starved browser or a real
  defect. ⚠️ **No pruning was added**: putting a deleter into the script that
  just lost data is how the bug returns wearing a different hat.
- ⚠️ **`createSession()` (singular) no longer exists.** `createSessions()` takes
  an array and sends one multi-row insert; `updateSessions()` takes ids and
  sends one `update … in (…)`. `updateSession()` and `cancelSession()` are
  one-id conveniences **over** those, not second call sites. This is Critical
  Feature 67, and the reason is the statement-level trigger: a create-one
  function's only misuse is a `for` loop, and the loop costs one Cloudflare
  build per iteration.
- `AdminSession` carries `seriesId`; `listSessions()` selects `series_id`.
  ⚠️ **It is deliberately NOT in `sessionFingerprint()`** — the public agenda
  card does not render it, so it cannot make the deployed site wrong.
- **`SESSION_COLUMNS` — a second explicit-select ladder**, on the
  `PROFILE_COLUMNS` precedent. `listSessions()` names `series_id`, and PostgREST
  answers a missing column with `42703`, which this layer turns into an empty
  array — indistinguishable from "no sessions". Without the ladder, one
  unapplied migration would not degrade `/admin/seances`, it would silently
  EMPTY it, taking the register and the staleness banner with it.
  ⚠️ **Reads degrade; writes fail loudly.** `createSessions()` omits
  `series_id` when there is none rather than sending null, so ordinary session
  creation survives a pre-0012 database and only a *repeat* create fails — with
  a message, rather than by quietly making thirteen rows nobody can act on as a
  set.
- `docs/MANUAL-TESTS.md` §7d-5 no longer says the agenda is "still the git
  collection"; it has not been since v0.15.0, and since this release publishing
  asks for a rebuild rather than waiting for one.
- ⚠️⚠️ **The release gate's evidence moved OUT of `node_modules/.cache` into
  `gate-logs/`** — gitignored, but real. Per-run naming (added earlier in this
  release) stopped a second *run* erasing the first's log; it did nothing about
  the directory the logs lived in, and that is the half that actually bit.
  **`npm ci` deletes `node_modules/` outright**, so a dependency bump, a broken
  install or a move to another machine takes every matrix log and memory trace
  with it.
  - ⚠️ **What it cost:** the three unadjudicated failures carried over from the
    previous machine — one webkit in the OFF shape, one webkit and one
    iphone-13 in the ON shape — **could not be re-read**, because the logs
    naming them went with that machine's `node_modules/`. Establishing that
    none of the three reproduced meant re-running both shapes from scratch,
    ~4.8 hours.
  - `gate-logs/` is ignored rather than committed: evidence is per machine and
    per run, and a log in git is a merge conflict waiting to happen.
- **CLAUDE.md split — 120,226 → 112,903 characters (75% of the limit, down from
  80%).** It had crossed the size guard's warning threshold. Per the rule, the
  remedy is to **split, not to trim**: fourteen blocks of reasoning, measurement
  and incident narrative moved **verbatim** into the reference file for their
  area, each leaving the rule and a pointer behind.
  - Moved: the `progress.ts` migration-point detail → `progression.md`; the
    `onlyMove` implementation and policing → `content.md`; the test-fixture
    mechanism → `video.md`; the matrix worker-cap, feature-branch and
    "critical path" policies, the environment-symptom table and
    `quick.mjs`'s refusal → `testing.md`; the release gate and the two
    configuration invariants → `deployment.md`; the long-lived-process sweep →
    `dev-environment.md`; the v2 locked decisions and the superseded
    2026-08-15 schema reading → `supabase.md`; the EN legal-notice segment
    rationale → `ui-navigation.md`.
  - ⚠️ **`node scripts/check-split.mjs` is green: 1,209 lines stayed, 171 moved,
    nothing lost, and NO new obsolete declarations were needed.**
    `docs/reference/.split-obsolete.txt` is unchanged — the ten entries in it
    are from the previous split.
  - ⚠️ **Two contradictory claims about production's schema were standing three
    lines apart** — "current through 0009" (2026-08-15) and "current through
    0012" (2026-08-18). The superseded one is **moved, not deleted**, because
    the *technique* in it is still the answer: the error code PostgREST returns
    tells a missing table (`PGRST205`) from a forbidden one (`42501`).
  - ⚠️ **A verbatim move keeps the block's original relative links**, which were
    written from the repository root, so inside a reference file a
    `./docs/reference/…` path and the occasional pointer back to the file you
    are already reading are the seam showing. Each moved block now carries a
    preamble saying so — the preamble is new text, so it may be worded freely;
    the block may not.
  - **Declined deliberately**, because a session could break each without going
    looking: the Critical Features list, the board file-role table, the
    add-a-table migration checklist, the admin-surface rules, and the PLY 0
    warning.
- **CLAUDE.md's reference index gains a row for `docs/SETUP-NEW-MACHINE.md`** —
  added *after* the split, on the principle the split exists to serve: a
  document nobody is pointed at is not read.

### Fixed

- ⚠️⚠️ **The "Créer" button did nothing on Safari and every iPhone** — found by
  this release's own gate, on the two WebKit projects, and it would have shipped
  otherwise.
  `paintPreview()` rewrote `submitButton.textContent` unconditionally on the
  form's `change` event. Pressing the button while the caret was still in
  "Jusqu'au" **blurs** that field → `change` fires → the handler rewrites the
  button **between the `mousedown` and the `mouseup` of the press** → WebKit
  declines to synthesise the `click`. No click, no `submit`, no write, **no
  error**. A second tap worked, because the field was already blurred.
  ⚠️ **Chromium and Firefox synthesise the click regardless**, so this passed
  `test:branch` and would have passed any amount of manual desktop checking.
  **The fix: `paintPreview()` is idempotent** — `setText`/`setHtml`/`setHidden`
  write only when the value differs, so the blur-time repaint touches nothing.
  The general rule (*a paint function is idempotent*) is in CLAUDE.md; the full
  diagnosis, including the three hypotheses that were wrong, is in
  `docs/reference/testing.md`.
  ⚠️ **The regression test's first version had the same failure mode as the
  bug** — it read the table once, immediately after the confirm, and failed
  against a correctly fixed build with `Expected: 3, Received: 0`. A guard whose
  failure looks like the defect sends the next reader hunting for a cause that
  does not exist. It polls now.

### Decided

- ⚠️ **NO RRULE ENGINE AND NO RECURRENCE TABLE** (Critical Feature 69). The
  expansion happens once, in the browser, and what is stored is thirteen
  ordinary rows. Same decision BabyClub took, for the same reason: **one
  cancelled week must not require reasoning about a rule.** The cost is honest —
  moving the whole term an hour later is not one edit — and it is the right way
  round, because the rare bulk edit paying more is what keeps the common single
  edit free.
- ⚠️ **The generated rows DO carry a shared marker, and it is a LABEL.**
  `series_id` may be read only to **select rows the prof is already looking at**,
  never to decide what a session *is*. It earned its column twice over: bulk
  publish and bulk cancel become **one statement** (which is what keeps the
  rebuild trigger firing once per prof action), and the list can say
  `série · 3/13` instead of showing thirteen indistinguishable cards.
- ⚠️ **The deploy hook URL is supplied through Supabase Vault**
  (`cloudflare_deploy_hook`), by a documented one-line manual step, and is in no
  file in this repository (Critical Feature 68). It is the credential: anyone
  holding it spends the club's build minutes, and this repo is public under the
  GPL. A config table was rejected (readable by any service-role holder, lands
  in `pg_dump`, and would be the eighth table here to ship with the `anon`
  grants Supabase hands out by default); a GUC was rejected (nothing lists it,
  nothing can audit it); `.env` cannot be read from inside Postgres at all.
  ⚠️ **No secret means no dispatch, not an error** — which is what makes it safe
  to count firings on a test project whose sibling is production.
- **The suppression seam is documented, not used.** `set local mcc.rebuild =
  'off'` silences every firing in a transaction, and
  `select public.request_site_rebuild('manual: …')` re-fires once at the end. It
  exists for hand-run SQL maintenance. ⚠️ **No application path uses it** —
  every one of them is already a single statement, which is the better answer
  wherever it is available.

### Measured

Firing counts against the test project, 2026-08-18 — the claim is about a
trigger, so it was counted rather than reasoned about:

```
insert of 13 rows       -> 1 firing   (rows_changed 13)
bulk update of 13 rows  -> 1 firing   (rows_changed 13)
single update of 1 row  -> 1 firing   (rows_changed 1)
bulk delete of 13 rows  -> 1 firing   (rows_changed 13)
drafts-only insert of 3 -> 1 firing   (dispatched false — nothing public changed)
```

⚠️ **The spec's assertion is "exactly one firing says it touched 13 rows", not
"one firing happened".** `fullyParallel` is on, so other spec files write
sessions in other workers throughout. A loop of thirteen inserts cannot produce
a `rows_changed = 13` row at all, so the assertion cannot be satisfied by the
failure it exists to catch, and cannot be broken by an unrelated write.

### Verification

| Run | Result |
|---|---|
| `npm run test:branch`, accounts **OFF** | green — 159 passed, 53 skipped |
| `npm run test:branch`, accounts **ON** (first) | 191 passed, **1 failed** — `attendance-timing` |
| the identical set at `--workers=1`, accounts **ON** | **green — 192 passed, 0 failed** |
| `attendance-timing.spec.ts` alone, accounts **ON** | green |
| `npm run test:branch`, accounts **OFF** (final) | **green** |
| `npm run test:branch`, accounts **ON** (final) | **green — 192 passed, 0 failed** |

⚠️ **The single failure was the documented fan-out symptom, not a regression,
and it was checked rather than assumed.** `attendance-timing.spec.ts` read
`19 sur 28 marqués` after twenty successful taps whose rows were all durable in
Postgres. Per CLAUDE.md → Testing, `--workers=1` is the arbiter, and the serial
re-run of the identical thirteen spec files passed 192/192; the file also passes
alone. It is logged in BACKLOG with the likely mechanism (a second, legitimately
newer `loadRegister()` repainting from a read that predates some taps) rather
than left as folklore.

#### ⚠️ THE FULL MATRIX WAS RE-RUN ON A SECOND MACHINE, BOTH SHAPES, AT THE GATE

The promotion gate for this release ran on a **different laptop** from the one
the release was developed on, from a clean `npm ci` and a fresh Playwright
install. Both flag shapes, as the verification policy requires:

| Shape | Result | Duration |
|---|---|---|
| `npm run test:release` (accounts **OFF**) | 3163 passed, **1 failed**, 4 flaky | 115.6 min |
| the failing spec at `--workers=1`, **OFF** | **green — 31 passed** | 2.3 min |
| the four flaky specs at `--workers=1`, **OFF** | **green — 85 passed, 0 flaky** | 2.6 min |
| `PUBLIC_AUTH_ENABLED=true npm run test:release` (accounts **ON**) | **green — 3525 passed**, 8 flaky, 0 failed | 172.1 min |

⚠️ **THE THREE FAILURES CARRIED OVER FROM THE FIRST MACHINE DID NOT REPRODUCE.**
Those were one webkit failure in the OFF shape (3166 passed) and one webkit plus
one iphone-13 in the ON shape (3523 passed). On the second machine the ON shape
came back **green on all five projects**, and 3525 passed is exactly the earlier
3523 plus those two. The OFF shape reproduced the *shape* — 3163 passed, one
webkit failure — and the arbiter cleared it: the failing test
(`exercise.spec.ts` → "exercise EN has no axe violations once solved") ran in
**4.6 s** against its 30 s timeout when re-run serially.

⚠️ **MEMORY STARVATION IS DOCUMENTED AS THIS MACHINE'S BASELINE, NOT A DEFECT.**
All ten project-runs tripped the under-3 GB warning — troughs of **0.39–2.14 GB**
against the first machine's **3.85–6.43 GB**, on comparable total RAM (15.69 vs
15.85 GB). Every failure and flake in both shapes was a **bare timeout** or a
`browserContext.close` protocol error; **not one named a value**, which is the
signature `scripts/test-release.mjs` already calls a starved browser. The tell
that the box was thrashing rather than merely loaded: the memory sampler, a
2-second `setInterval`, was firing **once every ~23 seconds** during the ON
firefox project — which itself took **2.1 hours** against 23.2 minutes in the OFF
shape. The remedy is `docs/SETUP-NEW-MACHINE.md` §9a, not a code change.

⚠️ **`ENGINE_TIMEOUT` (60 s) WAS CHECKED AND IS NOT MARGINAL ON THIS CPU.** Two
`play.spec.ts` tests flaked under `test:branch --all`, which raised the question.
The distribution answers it: the failing attempts took **exactly 60.0 s** (the
ceiling) and their retries **2.2 s and 4.1 s**, with every other play test in the
same run at 0.7–3.1 s and iphone-13 across both matrices at **max 9.9 s, mean
4.3 s, zero over 60 s**. A marginal timeout produces creep — 45 s, 55 s, 62 s.
This is bimodal, so it is a **stall in engine boot, not slow boot**, and raising
the number would not fix it. It never occurred in either matrix (ten
project-runs, zero play.spec failures or flakes); it is specific to the
`test:branch` path, and it is logged rather than absorbed.

### Documentation

- `docs/reference/deployment.md` — a new section: the webhook-UI dead end, the
  vault decision with the rejected alternatives, why the trigger may never
  raise, the `FOR EACH STATEMENT` rule as a constraint on the *client*, the
  measured firing counts, the suppression seam, and the exact catalog query and
  `schema_migrations` registration SQL for applying 0011 and 0012 to production.
- `docs/reference/supabase.md` — the recurrence decision in full, the series
  label, the cap, and the two timezone traps (local calendar days, and
  `new Date()` reading a date-only string as UTC).
- `docs/MANUAL-TESTS.md` — §7d-5b (thirteen rows, one rebuild, checked against
  the Cloudflare build list *and* `rebuild_requests`) and §7d-5c (the Ramadan
  DST check).

### ⚠️ CLAUDE.md was split — and nothing was lost silently

Four new Critical Features (67–70) pushed the file past the 120,000-character
warning line, so the account-erasure detail moved **verbatim** to
`docs/reference/supabase.md`, leaving behind the two rules that bind unrelated
work (the function must never gain a parameter; anything exported from
`supabase.ts` must also be exported by `supabase.disabled.ts`) and a pointer.
119,746 characters, 80% of the hard limit.

`node scripts/check-split.mjs` is green. **Two blocks are declared obsolete in
`docs/reference/.split-obsolete.txt` rather than moved**, and per the rule they
are reported here:

1. **The "0010 is the one production is missing" paragraph** — rewritten in
   place, because it became false in this release: production is now three
   migrations behind, and 0011 is the special case that is already there,
   hand-applied. Keeping the old sentences would leave CLAUDE.md asserting the
   wrong count.
2. **One line of a two-line pointer** — the sentence was re-flowed to name four
   more subjects and a second reference file. Nothing it pointed at was removed.

⚠️ **The headroom is now one session deep.** The next area-sized addition to
CLAUDE.md must be preceded by a split, not followed by one.

### ⚠️ Production's schema — asked of the catalog at the gate, not assumed

The promotion checklist demands this per migration, against the catalog rather
than `supabase_migrations.schema_migrations`, which has already been wrong here
in the dangerous direction. Probed read-only on 2026-08-18, before the deploy:

| | evidence |
|---|---|
| **0010** applied | `profiles?select=account_shape` answers **200**, not `42703` |
| **0011** applied | `rebuild_requests` answers **`42501`** to `anon` (permission denied — the table exists) where a missing table answers `PGRST205` |
| **0012** applied | `sessions?select=series_id` answers **200**, not `42703` |

⚠️ **AND THE VAULT ENTRY IS LIVE, WHICH IS THE HALF NO SCHEMA QUERY CAN SHOW.**
`rebuild_requests` on production carries firings from 2026-08-18 with
**`dispatched = true`** — so `cloudflare_deploy_hook` is in the vault, `pg_net`
reached Cloudflare, and the trigger is doing its job end to end. That is the
first evidence the feature works outside a test project, and it is a log row
rather than a claim.

⚠️ **Still outstanding, and it does NOT block a deploy:** registering 0010–0012
in `supabase_migrations.schema_migrations`. Production's ledger has listed
`0001, 0002` since long before this release while the schema demonstrably holds
far more, so a future `supabase db push` would try to replay everything in
between — including 0005's unguarded `drop constraint`. **Registering is
bookkeeping, not proof**; the table above is the proof. The backfill SQL is in
`docs/reference/deployment.md` and the item is in BACKLOG.

---

## [0.16.0] — 2026-08-17

**Twenty-four exercises whose chess is checked by the build, a video that
contacts nobody until you ask it to, and a CLAUDE.md that fits in a session
again.**

### ⚠️ HOW THIS RELEASE'S GATE ACTUALLY WENT — read this before trusting it

Recorded because a release that shipped on a partly-red gate should be
auditable later, not reconstructed from memory.

| Shape | Result |
|---|---|
| accounts **OFF** matrix | green — 3,138 passed, 65.9 min, no project short |
| accounts **ON** matrix | 3,475 passed, **9 failed**, 4 flaky, 107.1 min |

**All 9 failures were on firefox**; chromium, webkit, pixel-5 and iphone-13 were
clean, and all nine bottomed out in a 30-second test timeout. They are **not one
cause but three**, which is worth recording because "9 firefox failures" reads
like a single event and is not:

- **Six on the magic-link sign-in path** (`onboarding` ×4, `progress-sync` ×2) —
  `page.waitForURL` and `page.goto` hanging against
  `…supabase.co/auth/v1/verify`. ⚠️ **The rate-limit detector in
  `helpers/auth.ts` never fired**, which is the tell: the verify request
  *stalled*, it did not come back `over_request_rate_limit`. Four of these
  present as an assertion naming a value (`welcome-question` / `sync-import`
  Expected `visible`, Received `hidden`), but each names an element gated on the
  sign-in that never landed, and the same test's other attempt died at the bare
  network timeout — so the assertion is downstream, not an independent claim.
- **One lost browser context** — `progress-sync.spec.ts:279` retried into
  `browserContext.setOffline: Protocol error … browserContextForId(...) is
  undefined`. The context itself was gone.
- **⚠️ One already on the BACKLOG, and predicted there by name.**
  `progression.spec.ts:428` is the "axe samples before the page has settled"
  entry, which says in as many words that this spec "has the identical shape and
  stayed flaky in the green run… it is the next one to bite." It bit. The two
  flaky `wayfinding.spec.ts` axe checks are the same shape. **This one is a
  known defect with a one-line fix (`await settleAnimations(page)`) and is not
  an environmental stall** — it is the item that should be picked up first.

The ninth (`auth.spec.ts:65`, a guest zero-Supabase check) timed out in
`waitForLoadState('networkidle')` on both attempts, with no Supabase involvement
at all.

**All nine were cleared by a serial re-run**: `--project=firefox --workers=1`
over the four affected spec files, **81 passed, 0 failed, 0 flaky, 0 skipped,
12.0 min**. Per the standing rule, a genuine failure is deterministic and fails
a serial re-run too. None of these did.

⚠️ **What that does NOT establish**: a serial re-run does not reproduce the load
condition, so it proves the failures are not deterministic — not that the next
accounts-ON matrix will be green at three workers.

The session-leak cause behind the v0.16.0 agenda failures was ruled out by
counting rather than assuming: the test project holds **7 `sessions` rows, 0
matching the leak predicate**, exactly the post-clean state, and `agenda.spec.ts`
was not among the failures.

### Free RAM is now measured per project, instead of being guessed at

`scripts/test-release.mjs` has been telling readers to "check free RAM during
the run" since v0.11.1, and nothing measured it — by the time the summary
prints, the trough is gone. The whole memory diagnosis rested on **one**
hand-sampling (`2.08 GB`) taken once and never repeated, and this release's gate
spent a session on a memory hypothesis nobody could confirm or rule out.

It now samples `os.freemem()` every two seconds for the length of each project,
prints the trough beside that project's result, writes it to the log, and warns
under 3 GB. The failure message says what to conclude from the number in both
directions — under ~2 GB believe the browser was starved, comfortably above it
the memory explanation is **ruled out**.

⚠️ **The sampler is a separate process, and that is forced rather than stylistic.**
`runPlaywright` uses `spawnSync`, which blocks the script's event loop for the
entire project; a `setInterval` in the parent would not fire once in that window
and would miss every value that matters.

⚠️ **It measures the machine, not the browsers** — anything else running counts
against the same figure. That is the right number for "could Firefox allocate"
and the wrong one for "how much did Playwright use".

### 4321 is a shared port, and the sweep now says so

The process-hygiene rules covered our own orphans — kill what this session
started, sweep by repo path so an out-of-range `--port` is still found. They
said nothing about the opposite mistake: `N:\Nachi3D-Labs` holds several Astro
sites on the same defaults, `Caracol-Adventures-Website` foremost, so a listener
on 4321 is evidence of *a* server, not of ours. A blind `kill-port` takes down
whatever the session in the next window was mid-way through.

The same repo-path match already written for the sweep is now also a
precondition for killing, and a collision is resolved by moving this suite to an
alternate port (4331) through a temporary config rather than by claiming 4321.
Rule in CLAUDE.md, reasoning in
[`docs/reference/dev-environment.md`](./docs/reference/dev-environment.md).

Three pieces of work, and the thread between them is the same one: **a claim
this repository makes about itself should be checked by something, not
remembered by someone.**

- The exercises' chess is proved by `check-content.mjs` rather than by review.
- The video's "no third-party request" promise is proved by a spec that was
  watched to go red before it was trusted.
- CLAUDE.md's "nothing was deleted" is proved by `check-split.mjs`.

### CLAUDE.md — split, and proved lossless

**127,968 → 115,276 characters (85% → 77% of the hard limit).** It had been
over the guard's warn line for three sessions.

Five detail blocks moved into the reference set **verbatim**, each under a
**Read when** line: the environment-symptom table and the four board-driving
gates to `testing.md`, the migration checklist and the account surfaces to
`supabase.md`, the two configuration invariants to `deployment.md`. The binding
rules stayed in CLAUDE.md with a pointer.

⚠️ **`check-split.mjs` proves the move lost nothing: 222 lines moved, 1,251
stayed, and NOTHING was newly declared obsolete.** That last part matters — the
whole hazard of splitting is that a line dropped mid-move is indistinguishable
from a line that was moved, which is the same silent failure the size guard
exists for. Nothing was re-worded on the way out; the condensed summaries left
behind are additions, not rewrites.

---

**24 exercises, and every position built against chess.js rather than by hand.**

`/exercices/` had three entries for three courses. It has 27, and every course
has a matching drill set.

⚠️ **The brief supplied motifs, not FENs, and that was the point.** Batch 3
shipped eight hand-written positions of which **four were legal and wrong** —
the prose described a mechanism the board did not contain. So every position
here was constructed and then interrogated by a workbench built for the job:
legality, side to move, solution legality, mate/material actually achieved,
mate uniqueness, and whether a claimed-forced reply really is Black's only move.

⚠️ **It caught nine errors I would otherwise have shipped** — an illegal
knight move, a bishop pair that did not cover the escape squares, **three
positions where the side not to move was already in check** (chess.js loads
those happily and only dies later), and **three "mate in 2" claims that were
mate in 1**. None of them would have been visible on screen.

### Added

- **24 exercises** — 6 mates in 1, 4 mates in 2, 4 forks, 4 pins/skewers,
  3 discoveries, 3 advanced motifs. FR and EN written natively; hints name the
  idea and never the move.
- **`claims[]` on the `exercices` collection**, the same union the lesson boards
  use, so the build proves each position's mechanism. All 24 declare one, and
  the three pre-existing exercises were retrofitted — the exercise review queue
  is now empty.
- **`forcedReplies`** — an exercise may claim its stored reply is Black's ONLY
  legal move, and `check-content.mjs` proves it. Without it a mate-in-2 whose
  first move is not forcing "works" against the reply we happened to store, and
  nothing on screen ever looks wrong.
- **Filtering on `/exercices/`** by level and by theme, plus reverse links from
  the final lesson of courses 2 and 3 to the matching drill set.

### Changed

- `check-content.mjs` also fails on an empty `title_fr`/`title_en` (the same
  half-a-page-for-half-the-readers gap the hint check already covered), and
  rejects a `ply` on an exercise claim — an exercise carries its own FEN, so a
  ply indexes nothing.

### ⚠️ Deviation — the filters are ROUTES, not `?niveau=`

The brief asked for **server-side** filtering on `?niveau=` and `?theme=`.
**This site cannot do it**: `output: 'static'`, no adapter, no SSR — a hard
rule in CLAUDE.md, not a setting. There is no server to read a query string.

Reading the query string in the browser was rejected: the chips would be dead
without JavaScript, and a control that visibly does nothing is worse than no
control. So each filter is a real page — `/exercices/niveau/debutant/`,
`/exercices/theme/fourchette/` — linkable, bookmarkable, crawlable, and
**tested with JavaScript disabled**, which is the property the whole decision
was made for.

⚠️ **There is no empty state because an empty filter page cannot exist.** The
values are derived from the content, so a route is emitted only where something
matches; anything else 404s. A hand-written list of themes would have needed the
empty state — and would have been the thing that rots.

### Uniqueness — where `onlyMove` had to be false

All six mates in 1 have a **unique** mating move, verified by brute force, so
they are `onlyMove: true`. Three of the four mates in 2 are unique too. One is
not: **`sacrifice-puis-mat` has two mates in 2** (`Qd8+` and `Rd8+`, both
sacrifices, both mating), so it is `onlyMove: false` — the rule that a correct
move must never be called wrong outranks the tidier flag.

Every tactical (non-mating) exercise is `onlyMove: false` by default, per
CLAUDE.md: where we cannot prove uniqueness, we implement the behaviour that
cannot lie to a student.

---

**A video you have to ask for.**

The `youtube` field has sat on `traps` and `cours` since Session 2, validating an
eleven-character id and rendering nothing. Michael's workshop videos are coming,
so it renders now — as a **facade**, because the obvious implementation is not
available to this site.

⚠️ **A plain `<iframe src="https://www.youtube.com/…">` contacts Google on page
load.** Not on play — on load, for every reader, including the ones who never
press anything: youtube.com, google.com, googlevideo.com and doubleclick.net,
plus cookies. On a site for children that is a data-protection question rather
than a performance one, and Critical Feature 9 already forbade it.

### Added

- **`src/components/VideoFacade.astro`** — a still, a play button and the title.
  Nothing leaves the reader's device until they press it; then, and only then, an
  iframe is built pointing at **`youtube-nocookie.com`**. Absent field ⇒ absent
  component: no empty box, no reserved hole.
- **`scripts/fetch-video-posters.mjs`** — the still is **self-hosted**, and that
  is the half of this that is easy to get wrong. `<img src="https://i.ytimg.com/…">`
  is the same third-party request wearing a different hostname: a Google origin,
  the reader's IP and Referer, on page load, for everyone. So every poster is a
  WebP in `public/video/`, at 640w and 1280w, produced by this script and
  committed — the same "run it by hand, commit the output" shape as
  `build-icons.mjs`, and deliberately **not** part of `npm run build` (a
  Cloudflare build must need no image toolchain and no reach to Google).
  Three sources in order: an author-supplied still under `src/assets/video/`,
  then YouTube's own thumbnail fetched once here in Node, then a generated
  **house plate** — the brand mark on the site's dark ground, drawn with its
  centre clear because the facade's play badge lands there.
  ⚠️ **The plate is deliberately not green-800**, which was the first choice and
  is also exactly `--mcc-primary-hover`: the badge went one shade darker on
  hover and vanished into its own background. A photographic still would never
  collide like that, so the plate — the one still we control — is what moved.
- **`/mentions-legales/#video`** — what a click sends, in plain language, in both
  locales: IP address, device and browser, which video, and the site's address
  (origin only, not the page). ⚠️ **It deliberately undersells
  `youtube-nocookie.com`** — the domain name invites the reader to conclude "no
  data", which is false, and saying so ourselves is worth the sentence it costs.
  Every facade links to it, before the click, not only after.
- **`tests/e2e/video.spec.ts`** — 29 tests. Zero third-party requests on a page
  that HAS a video (`pwa.spec.ts` could only ever prove it on `/`, which has
  none); the iframe appearing only after a click, on the nocookie domain, with
  the id from the collection; Enter and Space; focus landing in the player; the
  facade absent where the field is; the board keeping its size at 360px; and the
  legal notice still naming the specifics.
  ⚠️ **The guarantee was watched to FAIL before it was trusted** — pointing the
  poster at `i.ytimg.com` turned three tests red, which is the only reason to
  believe the green ones.
- **A build-time guard.** `check-content.mjs` fails, naming the id and the
  command, when a `youtube` id has no committed poster. The tempting repair for a
  missing poster is to hot-link it, which reinstates exactly what the facade
  exists to prevent and looks perfect on screen.

### Changed

- **`src/styles/video.css` is imported by `global.css`, not by the component** —
  the same decision as `score.css`, and measured. `VideoFacade` is imported by
  every trap and course page (twenty documents) and Astro collects a component's
  CSS from the module *graph*, not from what renders: imported by the component
  it inlined 1.4 KB into all twenty, eighteen of which carry no video. The
  precache manifest fell 6363 → 6322 KiB when it moved.
- ⚠️ **It is not a scoped `<style>` for a second, independent reason:** the player
  iframe is created by script at click time and carries no `data-astro-cid`
  attribute, so every scoped rule would silently miss it. Same trap as
  `admin.css` and `family.css`.
- ⚠️ **The exercised path is a FIXTURE, not live content.** The facade was first
  wired to a placeholder id (`TODOvideo00`) on `/pieges/legal/` — a real trap, on
  the real index, whose play button handed a reader YouTube's *"video
  unavailable"*. That bought the specs a page to drive at the cost of a dead
  video on published content, which is the wrong way round: **the test harness's
  needs must not reach the reader.** Reverted before this ever shipped.
  **No published trap or course carries a `youtube` id today.**

### Added — test fixtures as a mechanism

- **`src/config/fixtures.ts`** and a `fixture` flag on the `traps` schema.
  `src/content/traps/fixture-video-facade.json` is a full trap page — board,
  replayer, facade — that exists only so `video.spec.ts` has something real to
  drive. It is a whole page rather than a bare component harness on purpose:
  that is what keeps the *integration* in scope, the field travelling from the
  collection through `TrapPage.astro` and landing below the board.
- ⚠️ **TWO PREDICATES, AND THE SPLIT IS THE DESIGN.** `isRoutable()` decides
  whether the page is emitted — fixtures only when `PUBLIC_FIXTURES=true`.
  `isListed()` decides whether a reader can find it, and **does not consult the
  flag at all**: a fixture is off every index and every count in *every* build.
  Collapsing them would put it on `/pieges/` in each test build, where
  `index-cards.spec.ts` draws a card for it and `/apprendre/`'s trap count goes
  one too high — neither of which looks wrong on the page.
- ⚠️ **`fixture` is a separate field from `draft`.** A draft is content being
  written that will one day be published; a fixture must never be. Overloading
  `draft` makes "unpublish this for a week" and "this is not real content" the
  same edit, and only one of those should be easy to undo.
- ⚠️ **The flag defaults OFF, because the default must be what production
  ships** — the discipline `auth.ts` is written to, for the recorded reason that
  production's flags live in a dashboard this repository cannot see.
  `playwright.config.ts` sets `PUBLIC_FIXTURES: 'true'` for the build it tests,
  **hardcoded and in both auth shapes**, so the facade gets full cross-browser
  coverage and **no third matrix shape is added**.
- ⚠️ **`smoke:prod` now fails if a fixture route answers anything but 404 on the
  live site.** No local spec can prove the OFF shape — the build under test is by
  construction the ON one, the same limitation `auth-disabled.spec.ts` has — so
  the guarantee is checked where it is true. Added to the promotion checklist.
- **Four more tests in `video.spec.ts`**: the fixture is on no index in either
  locale, linked from nowhere reader-facing, absent from `/apprendre/`'s trap
  count, and — the one that matters for next time — **real published content
  carries no video**, so a placeholder cannot creep back unnoticed.

### Placement, and why

The video sits **below** the page's primary content and above the way onward —
after the replayer on a trap, after the lesson list on a course. One rule, both
pages.

⚠️ **A 16:9 facade above the board costs ~200px on a phone before the reader
reaches the position the page is named after** — the same defect M3 measured in
the exercise control stack, arriving from the other direction. A course page is a
chooser (Critical Feature 65), and a video above the list puts a video between a
reader and the lesson they came to start. `video.spec.ts` asserts the ordering at
390px and 360px rather than trusting it.

### Measured

Lighthouse, mobile, `/pieges/legal/`, three runs each, same page before and after:

| | Perf | A11y | BP | SEO | weight | CLS |
|---|---|---|---|---|---|---|
| before | 99 | 100 | 100 | 100 | 161.0 KB | 0 |
| after (placeholder plate) | 99 | 100 | 100 | 100 | 165.8 KB | 0 |
| after (real photographic still) | 99 | 100 | 100 | 100 | 187.0 KB | 0 |

⚠️ **The third row is the honest one.** The placeholder is a flat plate and
compresses to 3 KB, which would understate the real cost; a genuine 1280×720
thumbnail re-encoded at q78 measures 25.7 KB (640w: 12.0 KB), and that build was
measured too. No score moves, CLS stays 0 — the frame holds 16:9 before and after
the click, so pressing play shifts nothing — and the poster is `loading="lazy"`
below the fold, so it is never the LCP element. Net: **+1 request, the poster.**

---

## [0.15.0] — 2026-08-16

**Five sections instead of four shortcuts, and a way back that says where it
goes.**

Two problems, and the second is the one that mattered. The bar was the wrong
shape — four entries, one of them ("Progrès") a leaf page with nothing beneath
it, sitting there because M3 needed a fourth destination. And you lost your
place: the person who built this site repeatedly could not tell where he was, or
get back to a page he had just seen, without the browser's own back button.

⚠️ **Nothing was broken.** Every page rendered, every link worked, every spec
passed. The defect was ABSENCE — the same class as `/progres/` existing on one
layout only, and invisible for exactly the same reason.

### Added

- **Five sections in the bottom bar** — Accueil, Apprendre, Jouer, Moi,
  Réglages — each with a **landing screen**. That is what makes a fifth entry
  defensible where M1 capped it at four: the bar stopped being a row of links to
  leaf pages and became a map of the site. Réglages earned its slot by becoming
  a section; Progrès lost its slot by being a leaf, and now lives inside Moi.
- **`/apprendre/`** — a chooser: Les bases, Leçons, Exercices, Pièges. Before
  this, "Apprendre" pointed at `/cours/`, so the bar quietly claimed Apprendre
  *was* the courses and four of the five teaching surfaces had no mobile entry
  point of their own.
- **`/moi/`** — a chooser: Ma progression, Mon compte, Réglages.
- **The trail** (`src/components/nav/Trail.astro`) on **54 of 59 public routes**
  — a back affordance that NAMES ITS PARENT. A lesson three levels down reads
  « ‹ Bien ouvrir une partie », not « Retour » and not « Toutes les leçons ».
  The five landings and the home page deliberately have none: the bar is already
  their way out.
- `wayfinding.spec.ts` — coverage assertions rather than component ones. "Every
  route below a landing has a named way up" is the claim; a test that checked
  the trail renders on one page somebody remembered would have passed throughout
  the bug.

### Changed

- **The bar's active section is now correct at every depth.** A lesson inside a
  course inside Apprendre lights Apprendre; so do traps, exercises and tutorial
  steps. Previously the active tab was right on the four indexes and silent
  everywhere below them — which, since it was the *only* location signal, is
  most of why the site felt like it lost you.
- **The four collection-named back links became parent-named.** "Tous les
  pièges" is not wrong, it just does not answer the question a reader three
  levels deep is asking. The end-of-page links keep the collection wording,
  because those are a way ONWARD rather than a way up (Critical Feature 31).
- **The lesson and tutorial step counters lost their inline parent link.** It
  named the right thing at 17px inside a metadata line; two links to one place,
  one of them impossible to hit, is how the way up got missed.
- **Desktop:** the Apprendre group gained "Vue d'ensemble" → `/apprendre/`, and
  the header's plain "Progrès" link became "Moi" → `/moi/` (Critical Feature 36
  — every bar destination reachable on desktop). Nothing else moved.

### Measured

M1 capped the bar at four because "five targets across 390px is 78px each, which
is where labels start truncating". The arithmetic was right and the conclusion
was a guess:

```
           cell        longest label        headroom
 390px  78.0 × 52   "Apprendre" 56.6px       21.4px
 360px  72.0 × 52   "Apprendre" 56.6px       15.4px
 (EN)               "Settings"  43.9px
```

Nothing truncates in either locale; every target clears 48px in **both**
dimensions. ⚠️ **When a label does stop fitting, the rule is to shorten the
WORD** — never shrink the target, never ellipsise.

⚠️ **The first version of that assertion was circular and "failed" at 49.0px of
text in a 49px box** — which is not truncation, it is the same number twice. The
label is a span in a centred flex column, so it shrink-wraps its own text. It now
compares `scrollWidth` against `clientWidth`, which is what overflow actually
means.

### Documentation

- ⚠️ **CLAUDE.md split: 133 387 → 118 837 characters** (89% → 79% of the hard
  limit). Four sessions overdue. Past 150 000 the tail of the file simply stops
  being read — the rules are in the repository and absent from the session, with
  nothing anywhere reporting it, which is how it once reached 247 KB.

  Moved **verbatim**, each under a **Read when** line: the admin surfaces, the
  public agenda and its fourteen-hour outage, the migration GRANT audit and the
  account surfaces → `docs/reference/supabase.md`; the matrix measurements, the
  four-red-gate diagnosis and the critical-path assertion list →
  `docs/reference/testing.md`. Kept in CLAUDE.md: every rule a session could
  break **without knowing the area exists** — the migration checklist itself,
  the FR-only admin decision, the agenda's build-time rule, the two-shape gate,
  the worker cap.

- **`scripts/check-split.mjs`** makes "nothing was deleted silently" a CHECK
  rather than a claim: every non-trivial line leaving CLAUDE.md must be findable
  verbatim under `docs/`, and anything else must be declared by hand in
  `docs/reference/.split-obsolete.txt` with its reason. **402 lines moved, 1169
  stayed, 2 declared.** It caught the two lines I had rewritten rather than
  moved, which is exactly what it is for — a line dropped mid-move is
  indistinguishable from a line that was moved.

### Fixed — found while verifying the split

- ⚠️ **CLAUDE.md contradicted itself about `/progres/`.** The Routes table said
  "Rank and points say *bientôt* and print no number — nothing computes one",
  while Critical Feature 30 in the same file said the opposite ("Since E3
  something computes rank and points, so it prints them"). The page has carried
  `data-score-points` and `data-score-rank` since E3. Declared obsolete.
- **The Routes table never gained `/apprendre/` and `/moi/`** when M4 added
  them — the two section landings were missing from the one table that is
  supposed to be the route vocabulary.
- **`Header.astro` still claimed its plain nav link says `nav.progress`.** M4
  moved it to `nav.me` and repointed it at `/moi/`; the comment above it did
  not follow.
- The `/` row described only the E5 retro menu, omitting that home is the
  dashboard below 768px. Declared obsolete.

### Deviations

- **Traps carry a fact, not a tally.** The brief asked for "traps read", and
  nothing in this codebase records that a trap has been READ — `progress.ts`
  tracks *solving*, which is a different thing. The card says how many traps
  exist. Inventing a "read" key to fill the slot would be a new progress
  semantic smuggled in through a navigation change; it is in BACKLOG with the
  question that has to be answered first (opened? scrolled? stepped to the end?).
- **Language is not on `/parametres/`.** The brief lists Réglages as theme,
  language and sound; theme and sound are there, and the language switcher is in
  the header on every page including mobile. Adding a second control would be a
  duplicate rather than a gain — flagged rather than silently skipped.

---

### Fixed

- ⚠️ **`verify:deploy` compared build fingerprints, and would have failed on
  every correct deploy.** It shipped in v0.14.0 comparing the content-hashed
  `/_astro/*.HASH.js` names on three documents against `dist/` — reasoning that
  Astro fingerprints by content, so equal names must mean equal source. It
  reported a mismatch on the v0.14.0 deploy, which was in fact correct and live.

  Cloudflare builds on Linux; this repository is developed on Windows. Rollup
  emits a chunk's imports in filesystem order, so identical source yields
  different minified identifiers and a different hash:

  ```
  live   import{t as e}from"./preload-helper…";import{a as t,i as n,n as r}from"./preact.module…"
  local  import{a as e,i as t,n}from"./preact.module…";import{t as r}from"./preload-helper…"
  ```

  Partially, too — the chunks either side hashed **identically**, which is what
  made it look like a genuine partial deploy rather than a measurement artefact.

  It now compares the **rendered HTML** with the fingerprints normalised away,
  which is a pure function of the source: 183 KB across three documents,
  matching byte for byte. ⚠️ **A check that fails on every correct deploy is
  worse than no check** — it trains whoever runs it to ignore the one signal
  meant to catch a silent regression. The residual gap is now stated rather than
  hidden: a release changing only island JS, with identical HTML, is invisible
  here, and needs a behaviour verified instead. The rewrite was confirmed to
  still FAIL on a single injected line before being trusted.

---

---

## [0.14.0] — 2026-08-15

**The site now asks who the account is for, and `/compte/` answers in their
words rather than in ours.**

### ⚠️ Why v0.13.0's onboarding never appeared — it was never deployed

Seàn signed up on production and the welcome screen did not fire. It is not a
condition, a redirect or a migration: **production has been serving a build that
predates v0.13.0 entirely.**

- `/bienvenue/` and `/admin/comptes/` — both added in the v0.13.0 merge — return
  **404** on the live site.
- The deployed callback chunk hard-codes `window.location.replace('/compte/')`
  and contains no reference to `onboarded_at` or `bienvenue` at all.
- `/compte/` still renders "Prénom affiché" and carries neither "Titulaire du
  compte" nor "Les élèves de ce compte", both of which shipped in that merge.

The last deployment is **2026-08-14T22:02:45Z — 67 minutes after the v0.13.0
merge**, and it replaced the Workers Build that the `main` push triggered 115
seconds after it. That is exactly the two-deploy-paths hazard already written up
in CLAUDE.md: **last writer wins, and the later writer was building an older
tree.**

Two things this corrected along the way, both of which had been stated as fact
and were not:

- **Accounts are already ON in production.** `/connexion/`, `/compte/` and
  `/admin/` all answer 200. The flag is a Cloudflare dashboard build variable;
  the repository default stays `false`.
- **Production's schema is current through 0009**, not missing 0008 and 0009.
  Verified against the catalog rather than the ledger — `account_deletions`
  answers `42501` (permission denied, so the table exists) where a missing table
  answers `PGRST205`.

⚠️ **Nothing in this release fixes the deployment.** Applying migration 0010 and
verifying that the next deploy actually lands are both in BACKLOG, and both are
Seàn's.

### Added

- **`/bienvenue/` asks « Qui va utiliser ce compte ? »** — one screen, three
  answers: **Moi, je joue** / **Mon enfant (ou mes enfants)** / **Les deux**.
  v0.13.0 asked for "le prénom de l'élève", which quietly assumes the account
  holder is not one of the players. For the club's typical family that is false:
  a parent brings two children to the workshop **and plays**, and was being
  filed under a heading about their children. Nothing in the database
  distinguishes that parent from a teenager who signed up alone, so the only
  honest way to know is to ask. **"Les deux" is presented as the ordinary case,
  in its own words**, not as an edge case.
- The answer drives the vocabulary everywhere afterwards — « votre profil » /
  « vos enfants » / both, with the account holder's own card badged **VOUS**.
- **Migration 0010**: `profiles.account_shape` (what they answered; `null` means
  never answered) and `child_profiles.is_self` (which profile is the holder's
  own), with a partial unique index so an account has at most one.
- **`src/lib/account-shape.ts`** — the single place the stored answer and the
  actual roster meet. The roster wins wherever it can speak, so an account that
  answered "moi" and later adds a child reads as "both" without anybody
  rewriting a column.
- **Profile cards on `/compte/`** carrying each profile's rank, points, solved
  count and progress through the current rank — derived by `computeLedger()`,
  the one summation a prof's screen also uses, from three queries for the whole
  account rather than three per profile.
- **« C'est moi »** on a roster row. `/bienvenue/` is shown once per account, so
  without it a reader whose situation changed had no way to say so.
- **`followMagicLink()`** in the test helpers — a measured, bounded retry for
  Supabase's auth burst limit.

### Changed

- **`/compte/` is three blocks instead of one flat column**: the profiles first
  and open, **Réglages du compte** collapsed, **Options avancées** (deletion
  only) collapsed at the bottom. Everything used to carry the same weight —
  which meant the button that permanently erases a child's progress sat in the
  flow like a language preference. Native `<details>`, so it works with no
  JavaScript and is keyboard- and screen-reader-operable for free.
- **Signing out and the staff link stay outside both disclosures.** Signing out
  is ordinary and frequent; a prof at Dar Souiri must not have to guess that the
  register lives behind "Réglages du compte".
- **« élève » is gone from parent-facing copy** — "vos enfants", "Ajouter un
  enfant", "Le prénom de votre enfant". « votre élève : Seàn » is meaningless
  for somebody who plays themselves. `/admin*` keeps the word, because that
  audience really is looking at a class of students.
- **"Prénom affiché" is now "Votre prénom"**, with a sentence saying it is the
  *account holder's* name and appears on no player profile. The old label told a
  parent nothing — displayed where, and whose? — and reading it at the top of a
  flat page, the reasonable conclusion was that it was their child's.
- **The settings block opens itself when the name is still the email local
  part.** That is the remedy for a skipped welcome screen, and a warning inside
  a collapsed disclosure is a warning nobody reads.
- `getProfile()` now walks a **ladder of column lists** rather than one explicit
  select. An unapplied migration used to turn every profile read into `null`,
  which is indistinguishable from "not signed in" — so a single missing column
  did not degrade the account, it silently emptied it and sent every first
  sign-in past the welcome screen. It now degrades to the neutral copy instead.

### Fixed

- ⚠️ **A stale register load silently discarded a prof's attendance taps.** The
  accounts-ON matrix caught the summary reading `18 sur 26 marqués` immediately
  after twenty successful taps whose rows were **already durable in Postgres**.
  The marks were safe; the count a teacher reads to know who is left was wrong.
  Two `loadRegister()` calls are routinely in flight — the page preselects the
  nearest session on `mcc:admin-ready`, and anything touching the picker before
  that settles starts a second — and both end in `renderMarkList()`, which
  begins by clearing `marks`. Whichever answers *last* wins, and a stale answer
  discards taps already made. Same bug and same remedy as `FamilySection.astro`,
  which has carried a generation counter for exactly this since v0.12.0: the
  lesson was written down in this codebase and never applied to the register.
  The init preselect also no longer steals a session the reader has already
  chosen out from under them.
- **`/compte/` printed a rank and a point total that nothing computed.**
  `data-score-points` and `data-score-rank` sat in the markup with **no
  `ScoreResolver` on the page**, so every account read "0 points" and a blank
  rank, permanently. Critical Feature 30 forbids exactly this on `/progres/`;
  the profile cards now derive their numbers or say they are still loading.
- **The e2e suite could exhaust Supabase's auth rate limit and blame the
  application.** The browser parks on a bare
  `{"code":429,"error_code":"over_request_rate_limit"}` body, so every waiting
  spec died of a plain navigation timeout — on a *different* set of tests each
  run, all passing when run file-by-file. Measured at **22 verifications in 7
  seconds**, no `Retry-After`. Three things now hold it: `test-branch.mjs` caps
  an auth-heavy selection at `--workers=2` so the burst is not created,
  `followMagicLink()` and `anonClientAsUser()` back off 10s then 30s on a
  **positively identified** 429, and a failure past that names the cause instead
  of reporting a navigation timeout. ⚠️ **A longer backoff was tried and made it
  worse** — when the project quota is genuinely exhausted every test waits out
  the ladder before failing anyway, turning a 2-minute gate into a 10-minute one
  that still went red. Raising the TEST project’s limit is the real fix and is in
  BACKLOG.

### Release engineering

- **`npm run verify:deploy`** — the check v0.13.0 did not have. It compares the
  **content-hashed** `/_astro/*` asset names on three live documents against the
  same documents in `dist/`, so it answers the one question nothing else could:
  *is the live site running the tree I just cut?* `smoke:prod` passed all 14
  routes throughout the day production served a pre-v0.13.0 build, because it
  asserts each page is reachable and correct — not which build made it, and
  `wrangler deployments list` showed something recent, which it was and which
  proved nothing. A per-release sentinel was rejected deliberately: the release
  you forget to bump it on is the release you needed it for, and Astro already
  fingerprints every bundle by content for free.
- ⚠️ **The release gate now runs the matrix TWICE — once per flag shape.** The
  policy said it runs once, on the default build, because that was "what
  production ships". That premise has been false since accounts were switched on
  in the Cloudflare dashboard: the default matrix skips every auth spec, so the
  whole account stack was reaching production with **chromium coverage only**.
  Neither shape subsumes the other — OFF is the only one that can prove Critical
  Feature 18 (no route emitted, no Supabase ref in the bundle), ON is the only
  one that exercises `/bienvenue/`, `/compte/` and `/admin*` at all. Recorded in
  CLAUDE.md with the reason, so it can be removed honestly if the flag ever goes
  back off.
- `docs/ADMIN.md` carries the migration 0010 procedure for production: paste the
  file rather than `db push`, which reads a ledger known to under-report here and
  would replay 0005's unguarded `drop constraint`. Then verify against the
  catalog, never against the ledger.

### Documentation

- CLAUDE.md: Critical Features 57–61; the account-model section rewritten around
  the question; the accounts-in-production section corrected on both counts; the
  429 signature added to the environment-symptoms table.
- `docs/reference/supabase.md`: migration 0010 in full, the `effectiveShape()`
  derivation table, the copy per answer, the `PROFILE_COLUMNS` reasoning, and
  the rate-limit measurements.
- `docs/MANUAL-TESTS.md`: the three answers walked separately, the three-block
  shape, the skipped-onboarding remedy, and both theme extremes.
- BACKLOG: apply 0010 to production; verify the next deploy actually lands;
  split CLAUDE.md (the size guard is warning at 84%).

---

## [0.13.0] — 2026-08-14

**A parent can now be handed this site, and the account they get explains
itself.**

Accounts are built, tested and still switched OFF — this release is the work
that has to be true *before* the flag is turned on, which is a separate and
explicit decision. Until now a parent would have signed up, silently received one
student profile named from the local part of their email address, and been left
to discover on their own that it could be renamed or that a sibling could be
added. The account page said "Rien d'autre n'est stocké ici" while storing
children, points, games and attendance, and the privacy notice predated every one
of those. None of that was a bug any check could see; the pages rendered
perfectly throughout.

Alongside it, three repairs from a production audit that had nothing to do with
onboarding and everything to do with the same habit: a documented invariant that
had quietly stopped being true, and nothing anywhere reporting it.

⚠️ **`PUBLIC_AUTH_ENABLED` stays OFF in this release.** No auth route is in
`dist/`, no Supabase ref, host or anon key is in any bundle, and
`@supabase/supabase-js` is not bundled at all — asserted, not assumed.

⚠️ **Migrations 0008 and 0009 are NOT applied to production**, deliberately:
nothing in this release needs them, because everything they serve is behind the
flag. They are a prerequisite for turning it on — see BACKLOG → Accounts.

### Added — parent onboarding, before accounts open to real families (v2-S5)

**`/bienvenue/` — one screen, once per account, skippable.** A parent signed up,
silently received one child profile **named from the local part of their email
address**, and nothing anywhere suggested it could be renamed — so `nachiketas3d`
was on course for a prof's attendance sheet. The welcome screen asks the one
question the site cannot answer for itself, and offers "Ajouter un autre enfant"
at the moment a parent of two is thinking about it.

- ⚠️ **"ONCE" IS RECORDED ON THE ACCOUNT** — `profiles.onboarded_at`, migration
  0009 — **not on the device.** In `localStorage` it would mean once per browser,
  and the same parent would be walked through naming an already-named child the
  first time they opened the family tablet. Set by **both** outcomes, and
  deliberately not recording which: writing down "they skipped" is an invitation
  for a later session to re-ask them.
- ⚠️ **GUIDANCE, NOT A GATE.** Everything on the screen is also on `/compte/`,
  "Passer" is a real button rather than small grey text, and a spec asserts that
  a skipped onboarding leaves the family section doing the whole job.
- ⚠️ **THE PLACEHOLDER IS NEVER PRE-FILLED.** Detection is an **exact match
  against the email local part**, not a guess about what names look like — the
  guess is the version that tells someone genuinely called `Alex99` that their
  name is not a name.
- ⚠️ **The sibling fields are server-rendered and hidden, not built by script.**
  Astro stamps its scoping attribute at build time, so a runtime-created element
  misses every scoped rule — a trap this project has already paid for twice.

**The account model is now stated rather than inferred.** `/compte/` opens with
who holds the account and what the students are, and the email is labelled
« Titulaire du compte ».

- ⚠️ **THE COPY NAMES THE STRUCTURE, NEVER THE RELATIONSHIP.** An account holding
  exactly one child is the **same object** whether it belongs to a parent or to a
  teenager who signed up alone (Critical Feature 40) — the site cannot tell and
  must not guess. The heading is « Les élèves de ce compte », never « Mes
  élèves »; the one-child sentence is « Ce compte porte **un seul profil
  d'élève** … le vôtre si c'est vous qui jouez, celui de votre enfant si vous
  l'inscrivez »; several children get a **count**, not a plural "s". The teenager
  case is named out loud in the model block rather than left to vague copy.

**Sign-up hygiene — and an honest account of what it is not.**

- ⚠️ **The honeypot on `/connexion/` is NOISE REDUCTION, NOT SECURITY**, and the
  code says so. The anon key ships to every browser by design, so the sign-up
  endpoint is reachable with `curl` and never touches the form.
- ⚠️ **A CAPTCHA is not a drop-in here.** It is a third-party script on a public
  page, which Critical Feature 9 forbids outright — adopting one is a policy
  decision, not a wiring task, and it would be the site's only third-party
  request.
- ⚠️ **It fails VISIBLY and CLEARS ITSELF — never a fake success.** The usual
  advice denies the bot its signal and leaves a parent whose password manager
  filled the field waiting for an email that was never sent. Here the trade goes
  the other way: show the error, empty the field, let the second press through.
- **`/admin/comptes/` is the actual answer** — sign-ups newest first with
  confirmation state and activity, and a two-step removal requiring a typed
  reason. **Admin only, not prof**: a prof marks a register; seeing every
  family's address and erasing an account is not the same class of act.
- ⚠️ **`admin_delete_account()` IS NOT A SECOND ROUTE TO `delete_own_account()`.**
  Different name, `is_admin_direct()` only, and it **refuses `auth.uid()`** —
  which is what keeps Critical Feature 51's "the parameter list is the guarantee"
  true for the function that rule is about. An admin erasing themselves goes
  through `/compte/` and the typed word like everybody else.
- ⚠️ **THE AUDIT RECORDS THE ACT, NOT THE PERSON.** `account_deletions` holds
  `deleted_at`, `deleted_by`, `reason` and **no reference at all** to the removed
  account. CF51's "no statistics, no archive, no anonymised copy" was written for
  the self-service button and binds a volunteer pressing this one just as hard.
  A spec asserts the **column list**, so a helpful `target_id` fails a test
  rather than quietly changing what erasure means.

### Changed — the privacy notice caught up with what the site does

It was written before child profiles, points and games existed and did not
mention any of them. **A notice that under-declares is inaccurate in the only
direction that matters**, and nothing in a build can catch it — the page
rendered perfectly throughout. Re-read against `supabase/migrations/`; every
table now has a line.

The minors section is now four claims in their own paragraphs, because they are
the four questions a parent asks before enrolling a child: **what is stored about
a child** (first name, progress, attendance, points — no surname, no date of
birth, no address), **that the parent holds the account** and the child is a
profile beneath it, **that deletion removes everything**, and **that no
photograph is ever stored, published or requested.**

`account.intro` on `/compte/` also stopped claiming "Rien d'autre n'est stocké
ici", which became false the moment child profiles landed.

### Verified — the deletion cascade, live, with two children

⚠️ **Two rather than one, because one proves less than it looks.** An
implementation that deleted "the child" rather than "the children" — a
`.single()`, a `limit(1)`, a loop that stopped early — passes the one-child test
perfectly and leaves a real family's second child in the database forever.

A real parent account with two children and every learner table seeded for each,
erased through `delete_own_account()` with the parent's own token:

```
BEFORE  profiles 1 · child_profiles 2 · auth.users 1
        Amine  progress 2 · games 1 · awards 1 · attendance 1
        Salma  progress 2 · games 1 · awards 1 · attendance 1
delete_own_account() → 198 ms, no arguments passed
AFTER   every count 0 · auth user gone · club session kept with created_by nulled
        account_deletions rows mentioning the account: 0
```

`account-deletion.spec.ts` now carries both shapes.

### Fixed — a WebKit flake that turned the release gate red

`feel.spec.ts` → "a button translates and tightens its shadow while held" sampled
the computed transform **once**, after a fixed `RESPONSE_MS * 2` wait. On WebKit
it intermittently read `matrix(1, 0, 0, 1, 0, 0)` — the identity, meaning
`:active` had **never been applied**, rather than the press being caught
mid-travel. It failed first-attempt at `--workers=1` and passed on retry, and in
this release's matrix it exhausted WebKit's single retry and failed the gate — on
a test whose subject, the home CTA, this release does not touch.

Two changes, both about *when* the state is read rather than what is asserted:
`hover()` instead of a hand-computed `mouse.move()` to a once-read bounding box
(a press landing one pixel outside sets no `:active` at all), and **polling while
held** instead of a single sample. ⚠️ **The assertion keeps its full teeth** — the
transform must become a real translate while the pointer is down — only the
deadline moved, and a button that never presses never satisfies it however long
we wait. 3/3 green at `--retries=0` where it previously failed first-attempt.

### Fixed — the three findings from the production audit

**Migration 0008 — `anon` gets nothing, in the grants and not only in effect.**
The invariant has been written in CLAUDE.md since 0001 and was false on seven of
the eight public tables. ⚠️ **No migration granted them**: a Supabase project
ships `alter default privileges in schema public grant all on tables to anon,
authenticated`, which fires on `create table` *before* a migration's own
`grant select` is reached — so the narrow grant narrowed nothing, it added to a
set that already contained it. `profiles` was clean only because 0001 happens to
`revoke all` first.

- ⚠️ **`grant select on public.sessions to anon` is restored in the same
  migration and is not optional.** `fetch-agenda.mjs` bakes the public agenda
  with the anon key; a bare `revoke all` there would empty `/agenda/` on every
  future build — the exact production failure this release spent a day on.
- ⚠️ **The default-privilege entry is cancelled too**, so the next table cannot
  inherit the set. Without it the sweep has to be remembered again, and
  "remember to write the revoke" is the discipline that failed seven times.
- ⚠️ **`authenticated` is deliberately untouched** and still inherits
  `TRUNCATE`. It is a different question with a different answer; it is in
  BACKLOG rather than bundled into a migration about guests.
- **Verified by exercise, not by reading ACLs.** `anon` now appears exactly once
  in the whole schema — `sessions`, `SELECT`. A throwaway table created as
  `postgres` grants it nothing. ⚠️ Auditing the default-privilege half by
  reading `pg_default_acl` is misleading: two entries govern `public`, and the
  `supabase_admin` one still lists `anon`, correctly and permanently.
- ⚠️ **Applied to the TEST project only.** Production is a hand-run act, as
  always. 28 accounts-on specs pass, including the whole RLS boundary suite.

**`npm run smoke:prod` now fails on a blank agenda.** The `/agenda/` sentinel
accepted `/class="(sessions|empty)"/` — the list *or* the empty state — which is
how it passed green on all 14 routes while the club's one session was off the
site. Now `/<li class="session\b/`, with the count printed and a failure message
naming the real cause rather than claiming the list is "missing" from a page
that rendered its empty state perfectly. ⚠️ **Zero sessions is never correct for
a club that meets weekly**, which is why this needed no database access to fix.

**The `schema_migrations` backfill is written and waiting in `docs/ADMIN.md`.**
Production's ledger lists `0001,0002` on a database holding all seven, so a
future `supabase db push` would replay 0003–0007 including 0005's unguarded
`drop constraint`. The SQL records history and executes nothing — `statements`
left NULL, deliberately, because this database has no true account of those
executions. Seàn's to run, alongside 0008.

**And the agenda is live.** Deployment `d580b90c` at `2026-08-14T13:15:08Z`;
`smoke:prod` reports `1 session(s)`.

### Verified — production audited end to end, and two invariants written down that no check in this repo can see

Migrations 0003–0007 were applied to production and the whole surface was audited
against the live catalog rather than against the migration files. **26 of 29
checks passed and the three misses are all findings, not regressions.** The
queries are now recorded in `docs/reference/supabase.md` so the next promotion
does not reinvent them.

⚠️ **The public agenda is still blank, and no code change will fix it.** The
serving version `45e06d08` was created `2026-08-13T23:41:11Z`; the `sessions` row
was inserted `2026-08-14T12:29:54Z`. A build baked thirteen hours before a row
exists cannot contain it — **a production build needs to run**, which is Seàn's
call and is now the top entry in BACKLOG → Deployment.

⚠️ **A `dev` push was reaching production, and this is how it was proved.**
Workers Builds was set to deploy *every* branch: `dev`'s `61030c4`, a
documentation-only commit, became the live site **108 seconds after its push** —
and, carrying the dashboard's Supabase credentials against a database that was
still missing 0006, it is what baked the empty agenda and overwrote two CLI
restores. `dev` → `main` needing Seàn's approval was worth nothing for as long as
that setting held. Non-`main` branches now run `npx wrangler versions upload`.

✅ **The fix was verified by pushing.** `dev` ← `07465fb` at `12:48:42Z`, built
into version `1a687f0c` at `12:49:56Z`, and the deployment stayed on `45e06d08`
from the night before. ⚠️ Cloudflare still **builds** every branch, with
production credentials — the protection lives entirely in the command, so it is
checked by output at every promotion rather than trusted once.

- ⚠️ **The 12 September card CANNOT tell the deploy paths apart.** 0006 seeds it
  with the same fixed id and text as `agenda.fallback.json`, deliberately, so it
  is byte-identical from either source. What discriminates is **emptiness** —
  only a credentialed build can bake zero sessions — plus the row's `created_at`
  against the deployment timestamp. Recorded, because reaching for the card's
  text is the obvious first move and it answers nothing.
- ⚠️ **`npm run smoke:prod` passes on a blank agenda.** Its `/agenda/` sentinel
  is `/class="(sessions|empty)"/`; it ran green on all 14 routes while the club's
  only session was off the site.
- ⚠️ **`supabase_migrations.schema_migrations` is not a record of what production
  holds** — it lists `0001,0002` on a database containing all seven. A future
  `supabase db push` would try to replay 0003–0007, including 0005's unguarded
  `drop constraint`.
- ⚠️ **`anon` holds `TRUNCATE`, `REFERENCES` and `TRIGGER` on every public table
  except `profiles`** — never granted by a migration, inherited from the
  project's `alter default privileges … grant all … to anon, authenticated`,
  which fires on `create table`. `TRUNCATE` is not filtered by RLS. Not reachable
  through PostgREST, so defence-in-depth rather than an incident; the new-table
  checklist now starts with `revoke all … from anon, authenticated`.

Everything 0003–0007 declares is present and correct: tables, RLS, policies,
every `child_id` FK cascading, `graduate_child()` `service_role`-only,
`delete_own_account()` at `pronargs = 0` with `authenticated`-only EXECUTE and a
pinned `search_path`, `sessions_select_public` admitting published and cancelled
but not draft, and `role` still absent from `authenticated`'s column privileges
on `profiles`.

### Fixed — the v0.12.0 deploy notes were wrong, and production proved it within the hour

⚠️ **`docs/reference/deployment.md` shipped in v0.12.0 asserting "nothing on
Cloudflare builds this site".** That is false. **Workers Builds is connected**,
and the evidence behind the claim — `npx wrangler deployments list` labelling
every deployment `Source: Unknown (deployment)`, wrangler's label for a CLI
upload — turns out not to distinguish the two paths at all.

The site falsified it immediately. Pushing `main` triggered a Cloudflare build at
`23:29:19Z`; `npx wrangler deploy` landed at `23:30:51Z`; **a second Cloudflare
build at `23:31:12Z` overwrote it 21 seconds later.** The served page carried
this release's `<p class="empty">` markup with **zero sessions** — a v0.12.0
build holding production credentials, which is a combination only Cloudflare
could produce.

⚠️⚠️ **The consequence was live: the public agenda went blank.** "Aucune séance
programmée pour le moment" replaced the club's one published session, because
production is missing migrations 0005–0007 and its `sessions` table is empty.
Restored by redeploying the local fallback build and re-verified end to end —
**and the restoration is fragile, because the next push to `main` undoes it.**

- **Tell the deploy paths apart by OUTPUT, never by the source label**: the
  fallback's 12 September session means a local build; an empty or
  database-shaped agenda means a Cloudflare one.
- ⚠️ **Workers Builds silently changed what production is.** The deployed tree is
  now "whatever `main` holds" rather than "the tree that was tested and
  uploaded" — a promotion-policy change wearing the clothes of a settings change.
- **The ordering rule is now load-bearing rather than advisory:** migrations to
  production first, credentialed builds second.

---

## [0.12.0] — 2026-08-13

**The agenda a prof edits is the agenda a visitor reads, and an account can
erase itself without asking anybody.**

Two promises that were being kept by a person remembering to do something are
now kept by the software. `/admin/seances` had let a prof publish a session
since v2-S4 part 1, and `/agenda/` had gone on rendering a git collection that
only a developer could change — so the surface that could be edited was the one
nobody could see. And the privacy notice had always offered erasure, which in
practice meant a volunteer running SQL. Both are closed here, and both closures
are shaped by the same two constraints as everything else on this site: the
build is static, and a public page makes no third-party request.

⚠️ **Accounts remain built and switched off.** `PUBLIC_AUTH_ENABLED` is
unchanged, so nothing in the account half of this release is in front of a
reader yet — including the deletion button. The agenda half ships regardless,
because its read happens at build time with the build's own credentials and
puts nothing in the bundle.

The release also makes the gate honest again: `npm run test:release` runs its
projects one at a time under a worker cap and is **expected to be green**, after
two promotions that shipped on failures everybody had a good explanation for.

### Fixed — the new agenda spec was measuring an animation, and it turned the gate red

The v0.12.0 release matrix came back **5 failed across four projects**, every
one of them in `agenda.spec.ts`. Neither cause was an application defect — both
were checked against the source before anything was touched — and both are the
same shape: **a spec asserting a value while the thing producing it was still
moving.**

**`a cancelled session renders as cancelled, in words` — `expected >= 1,
received 0.999974`.** `.session-cancelled` sets `border-left-color` and
`background-color` and nothing else: no opacity, no `text-decoration`. The card
was not dimmed, it was mid-reveal. Three things had to line up, and the spec had
already anticipated one of them:

- `[data-reveal-stagger]` delays each card by `60ms × --reveal-i`, capped at
  six — so cards settle up to **300ms apart**, and the two being compared are
  the first card and one far down the list;
- ⚠️ **`settleReveals` waited a flat 450ms**, described in its own comment as
  "the transition itself". It had forgotten the stagger, so the tail of a long
  list was still moving when it returned;
- and the list is long because the **test project has accumulated 26 sessions**
  from past suite runs, 21 of them junk rows created seconds apart. The
  fixture grew until the race started losing.

⚠️ **The first fix was wrong in an instructive way** and the re-run caught it:
waiting for the opacities to stop *changing* read `0` on a card whose transition
had not *started*. An element waiting out its stagger delay is perfectly stable.
**Stability and settledness are different questions.** Reveals are one-shot
(`io.unobserve`), so the helper now waits for the resolved end state — every
target carrying `is-revealed` **and** every opacity at 1 — bounded at ~240
frames, which strengthens every axe check that uses it.

⚠️ **And WebKit then failed differently**, at `0`: its IntersectionObserver
never fired for a card the page-wide scroll pass had swept past, so no amount of
waiting would settle it. The spec now brings **each card into view on its own**
and asserts `is-revealed` with its own message before reading any opacity — "the
card never revealed" and "the card is dimmed" are different defects and must not
share an error.

⚠️⚠️ **AND THE FIX ITSELF THEN BROKE THE GATE, WHICH IS THE ENTRY WORTH
KEEPING.** The settle loop counted 240 `requestAnimationFrame`s inside a
`page.evaluate`. **WebKit stalls rAF** — so the loop never advanced, and a raw
`evaluate` carries no Playwright-side deadline, so it hung until the **30s test
timeout**. That took down every home-page spec that calls the helper: **13
failures across webkit and iphone-13**, in three spec files with nothing to do
with the agenda. The `240` cap looked like a bound and was worthless, because
reaching it required the very clock that had stopped.

**The rule that comes out of it: a wait is bounded by Playwright or it is not
bounded.** `waitForFunction` takes `polling: 100` (a timer, not the animation
clock) and a deadline the harness enforces however dead the page is; where a
page-side loop is genuinely needed it runs on `setTimeout` against a wall clock.
The old flat `waitForTimeout` was immune to all of this for one reason nobody
had written down — **it waits outside the page** — and that is why replacing it
needed more care than it got.

**The two zero-third-party-request tests, timing out at 30s on `networkidle`.**
⚠️ **The cause is this file's name.** `agenda.spec.ts` sorts first, so its two
tests are the first page loads of every project run — the ones that pay for the
service worker's cold precache, **150 files and ~6 MB of first-party assets**.
The network is genuinely not idle, and waiting for it proved nothing whatever
about third parties. Replaced with a bounded grace after `load`; the listener
has been recording since before navigation, so nothing is missed.

⚠️ **No timeout was raised to make a red gate green.** Verified serially on all
five projects — 45 passed, and the two intermediate failures above were each
watched to fail first.

**Not fixed, and flagged rather than folded in:** those 21 leftover session rows
in the test project. They are created by the suite and never purged, and they
will keep growing.

### Documented — the agenda's credentials had nowhere to be set, and the docs said otherwise

Found at this promotion, while confirming that the newly-configured Cloudflare
build variables had been picked up. **They had not, and structurally could not
have been.** Two independent facts, both verified rather than reasoned:

- ⚠️ **Nothing on Cloudflare builds this site.** `npx wrangler deployments list`
  reports every deployment this project has ever had as `Source: Unknown
  (deployment)` — a **CLI upload**. `npm run build` runs here and
  `npx wrangler deploy` uploads the finished `dist/`, so Cloudflare never runs a
  build command and a variable in its build-variables panel is never read.
- ⚠️ **`.env.local` does not fill the gap either**, which is the part most likely
  to be assumed away. `scripts/fetch-agenda.mjs` is a plain Node script reading
  `process.env` in its **own process**, before `astro build`; Astro's dotenv
  loading feeds `import.meta.env` inside the Astro build and reaches it never.
  A normal build on this machine bakes the committed fallback and says so in
  yellow — which is what every production build to date has shipped.

**And production's database is behind the repo.** Read-only probes against the
live project: `sessions` is empty to `anon` *and* to `service_role` (so it is
genuinely empty, not RLS hiding rows), and `child_profiles` **404s — the table
does not exist**. Migrations 0005–0007 have never been applied there.

⚠️ **So switching the credentials on today would have shipped an EMPTY
`/agenda/`**, replacing the season-opening session a visitor can currently see,
with no `/admin/seances` in production to restore it because accounts are off.
**v0.12.0 therefore deploys from the committed fallback, deliberately** — the
database-backed agenda is *dormant* in production rather than broken, and
nothing is lost while accounts are off, because no prof can publish there
anyway. The order when it is switched on is **migrations first, credentials
second**; reversed, the agenda empties.

`docs/reference/deployment.md` said "set them in the Cloudflare dashboard",
which was wrong in a way that would read as done. It now carries the deployment
topology, the probe results and both routes to a live agenda.

### Changed — `/agenda` reads the database, and the git collection is retired

v2-S4 part 1 built `/admin/seances` and left `/agenda/` reading a git content
collection. Two sources of truth for one list, and **the one a prof could edit
was the one nobody could see**: publishing a session changed nothing a visitor
could reach, and nothing said so.

⚠️ **THE READ IS AT BUILD TIME, AND THAT IS FORCED RATHER THAN CHOSEN.** The
three options were weighed and two are unavailable to this site:

- a **runtime read** would have every anonymous visitor contact supabase.co on
  page load — Critical Feature 9, on a page that tells children when a club
  meets — and needs the ref, host and anon key in a bundle that Critical
  Feature 18 says carries none of them;
- **gating that read on `PUBLIC_AUTH_ENABLED`** fixes nothing where it matters,
  because production ships with accounts OFF: `/admin/seances` would go on
  silently doing nothing in exactly the state it is broken in.

Static output plus "no third-party request" leaves one answer, so the content is
fixed at build. `scripts/fetch-agenda.mjs` reads `sessions` over plain PostgREST
and writes `src/data/agenda.json`; `src/lib/agenda.ts` is its only reader. ⚠️ The
credentials are the **build's** and are never shipped — the bundle is
byte-for-byte as clean as before, and `auth-disabled.spec.ts` still proves it.

⚠️ **THE FAILURE MODE IS STALENESS, AND THE WORK WAS MAKING IT LOUD.** A session
published after the last deploy is not on the site, and the public page cannot
know. `/admin/seances` can: it is built in the same build, so it knows what was
baked, compares it against the live table by fingerprint, and tells the prof — in
French, on the screen they published from, with the date of the last build.
Without that, the failure is exactly as silent as the bug being fixed.

- **Migration 0006** widens the public select policy to `published, cancelled`.
  ⚠️ **Critical Feature 46 was only half kept**: `cancelSession()` never deletes
  so a student is not left wondering — and the policy then hid the cancelled row
  from every surface they could reach, producing the vanishing the rule exists
  to prevent. `role-separation.spec.ts` changed with the rule and still proves
  a **draft** never leaks.
- The one git entry is migrated with a **fixed uuid**, so the committed fallback
  and the database agree and it never reads as a pending change.
- ⚠️ **`seed-test.mjs` was deleting it.** The seed cleared every session row,
  including the one 0006 had just inserted. Caught only because `agenda.spec.ts`
  asserts that session is on the page.
- ⚠️ **`src/data/agenda.json` is generated and gitignored**; the committed source
  is `agenda.fallback.json`. One file would be a footgun with a short fuse: a
  Playwright run builds against the TEST project, so `git add -A` would have
  shipped "Séance découverte" to the real club.
- ⚠️ **`site.timezone` is an IANA name, never `+01:00`** — Morocco drops to UTC+0
  for Ramadan. The snapshot records the zone it was baked in and the build fails
  if it disagrees with the config.
- **No credentials is a dev build; broken credentials is a fatal build.**
  Shipping a stale agenda while believing it fresh is the whole defect.

**What is not in the repo, because it is dashboard configuration:** the Supabase
webhook → Cloudflare deploy hook that makes the wait minutes rather than "the
next deploy", a nightly rebuild as the self-healing floor, and
`PUBLIC_SUPABASE_*` as Cloudflare **build** variables — without which every
production build falls back to the committed snapshot and no prof can change the
agenda at all. All three in `docs/reference/deployment.md`.

### Added — an account can delete itself

The privacy notice has always promised erasure; `docs/ADMIN.md` has always had
the SQL; there has never been a button, so the promise was kept by a volunteer
remembering to run a statement.

**Migration 0007** adds `delete_own_account()`. ⚠️ **It takes no target, and the
parameter list is the security design** — the id can only come from
`auth.uid()`. A `delete_account(target uuid)` with an ownership check inside is
one refactor away from a function that deletes anybody. `authenticated` only,
and deliberately not `service_role`, which has no `auth.uid()` and could only
raise.

- **Two steps, the second a typed word** (`SUPPRIMER` / `DELETE`, case-exact).
  Two buttons in one place is one mis-tap on a family tablet, on the only action
  on the site nobody can undo — and a phone's autocapitalisation must not be
  enough on its own to arm it.
- **The confirmation names what goes**: children, progress, games, points,
  attendance. "Are you sure?" tells a reader nothing.
- ⚠️ **Local state is cleared only after the server confirms** — the opposite of
  `signOut()`, which clears first. Wiping a device for a delete that did not
  happen destroys data the account still holds.
- ⚠️ **Nothing is retained**: no statistics, no archive, no anonymised copy — and
  `account-deletion.spec.ts` asserts that rather than the notice claiming it.
  Device-local progress is untouched on purpose: it is the reader's own copy, it
  is what a guest has, and erasing it is not what the request asks for.
- `/politique-confidentialite` changed in the same commit: it said "you can
  **ask** for your account to be deleted", which stopped being what the site
  does. The link to `/compte/` renders only where that page is emitted.

**Live audit, test project, 2026-08-13.** One row seeded in every table, deleted
through the RPC as the signed-in user: `auth.users`, `profiles`,
`child_profiles`, `exercise_progress`, `game_results`, `point_awards`,
`attendance` and `lesson_progress` all **1 → 0 in 453 ms**. The club's own
`sessions` row survived with `created_by` nulled — correct, because a session is
club data and not the reader's.

### Added — `npm run db:push`, so migrations reach the test project at all

Applying a migration needed `supabase link`, which needs a personal access token
nobody has on this machine and fails with a privileges error that reads like a
broken project. `scripts/db-push.mjs` goes through `--db-url` instead, takes its
credentials from `.env.test` through `assertNotProduction()`, refuses if the ref
matches production, probes for the project's pooler host (the direct
`db.<ref>.supabase.co` no longer resolves on IPv4-less projects) with a **dry
run**, and redacts the password from everything it prints. ⚠️ There is no flag
that points it at production, and adding one would be the bug.

### Fixed — the accounts-OFF build broke on a missing stub export

`deleteOwnAccount()` was added to `supabase.ts` and not to
`supabase.disabled.ts`, and the accounts-OFF build failed outright with
`[MISSING_EXPORT]`. ⚠️ **The alias replaces the module for page scripts that are
still BUILT behind routes that are never emitted**, so anything exported from
one belongs in the other. The stub returns `{ ok: false }` rather than the empty
answer every other stub returns: a stubbed success would tell a reader their
data had been erased.

### Fixed — two specs that were passing on timing

Both found by the new suites, both mine, and neither a flake:

- `family.spec.ts` read the database immediately after confirming a removal.
  While the confirm is open the row shows the QUESTION in place of the name, so
  the roster already has exactly one name the instant the button is clicked —
  the assertion passed before the delete had left the browser.
- `account-deletion.spec.ts` read `{profile: 1, children: 0, …}` under the full
  fan-out. ⚠️ **That is not a reachable state**: `child_profiles` cascades from
  `profiles` and nothing else deletes a child, so the parent cannot outlive
  them. A stale read across pooled connections, confirmed by the same test
  passing in isolation and against the RPC called directly.

### Fixed — the add-a-child form existed, was permitted, and could not be reached

`/compte/` carried an **Ajouter un élève** form that inserted into
`child_profiles`. RLS permitted the insert. The markup was correct. And one line
hid the **whole section**, form included, whenever the account held one child or
none — while `resolveChild()` gives every brand-new account exactly one:

```js
if (children.length <= 1 && active) { root.hidden = true; return; }
```

A parent with two children could add a third; a parent with one could add none,
and the only way onto the other side of that was SQL. ⚠️ **Two rules had been
written as one**: "there is nothing to *ask*" and "there is nothing to *manage*"
are different claims, and only the first is true at one child.

⚠️ **Every check in the project passed the entire time.** `child-profiles.spec.ts`
was green and could not have been otherwise — it asserts the boundary through
PostgREST, where a form does not exist. Nothing rendered wrong, nothing 404'd,
and nothing was missing from the page for a test to notice. **A permission model
that says yes proves nothing about whether a reader can get there.**

- **`ChildPicker.astro` → `FamilySection.astro`**, and the two rules are now
  spelled separately: the section renders for every signed-in account; only the
  **Qui joue ?** picker is conditional on holding more than one child.
- **Rename and remove**, which did not exist in any form. The roster is a
  **second list**, deliberately not the picker: the picker is what a child taps
  on a shared tablet, and "Retirer" must not sit beside the button they aim for.
- ⚠️ **Removal is never offered for the last child.** `resolveChild()` creates
  one from the profile name the instant an account has none, so the control
  would be a lie — the child returns, renamed, with its history gone by cascade.
  The button is absent rather than disabled, and a sentence says why.
- ⚠️ **Removal asks first, in place, naming the child and what goes with them.**
  It is the one control on the site that destroys what a child earned:
  `child_profiles` is the FK target of progress, games, attendance and awards,
  all `on delete cascade`. That is not in tension with "Qui joue ? is a choice,
  not a password" — one is about choosing, the other about erasing.
- **`tests/e2e/family.spec.ts`** drives the browser as an account with exactly
  one child and asserts against the row afterwards. ⚠️ It was verified by
  restoring the coupled rule and watching all six tests fail on
  `expect(family).toBeVisible() — unexpected value "hidden"`.
- **Critical Feature 48** and a spec-map entry, so the file runs when the code
  it covers moves.

⚠️ **And the new spec immediately found a second defect, which is the argument
for having written it.** Two `load()` calls are routinely in flight —
`resolveChild()` fires `CHILD_EVENT`, whose listener re-enters `load()` — and
they can land out of order. Passing alone, the family spec was green; run
alongside the other ten mapped specs it failed twice, and neither was a flake:

- a removal left **one name on screen and two rows in the table**, because a
  read issued before the delete committed repainted the roster afterwards.
  **Last to finish is not most recent**; a generation counter now drops the
  older answer.
- a rename input was **detached from the DOM under the typing** by a background
  repaint. A repaint now never touches a row that is mid-edit — worse than lost
  keystrokes would have been the removal confirm being swapped for a fresh
  "Retirer" in the same place, under a thumb already moving.

### Fixed — the picker's own styling had never applied to the picker

Two defects that had lived in the same file for the same reason: nobody had
looked at it in a browser signed in with one child, because they could not.

⚠️ **A scoped `<style>` cannot reach an element the script created.** Astro
stamps `data-astro-cid-*` at build time onto the elements a component declares,
so `.child-choice` compiled to `.child-choice[data-astro-cid-hcrewwfn]` — and
the choice buttons are built in JS, carrying the class and not the attribute.
Every rule missed. Verified by building the previous commit and reading the
emitted CSS. Same trap as `admin.css`; the styles are now
`src/styles/family.css`, prefixed with `.family` so the cascade is settled by
specificity rather than by stylesheet order.

⚠️ **And two of those declarations named tokens that do not exist** —
`--mcc-text` and `--mcc-text-muted`, against the real `--mcc-text-primary` and
`--mcc-text-secondary`. An unknown custom property invalidates the whole
declaration silently; this is the fourth and fifth entry in that table in
CLAUDE.md. The add button, meanwhile, took its border from a scoped rule
belonging to a *different* component and so had none at all.

### Added — testing accounts by hand is one command

`npm run demo:accounts` builds and serves the site with `PUBLIC_AUTH_ENABLED=true`
against the **test** Supabase project, then hands off to `npm run demo` so the
port sweep, the orphan sweep and the Ctrl+C cleanup stay in one place.

⚠️ **It is a script rather than a documented shell line because the failure mode
is not a broken build.** `.env.local` holds the PRODUCTION project — that is what
a deploy build needs — so omitting or fat-fingering the override produces a build
that *succeeds* and is wired to the live database, where signing in on localhost
creates a real account. Nothing would announce it. The script reads the test
credentials through the same interlock the e2e suite uses and **fails closed**:
missing config, a missing production ref, an unparseable URL, or a match against
production all abort before anything is built.

- **`docs/LOCAL-ACCOUNTS.md`** — the whole procedure: seed, sign in, become a
  prof, and walk the picker, `/compte/` and the three admin surfaces. Its last
  section is what is **not** built, which is the part most worth reading first.
- **`supabase/seed/magic-link.mjs`** — mints a magic link for a seeded account
  without email. The seeded accounts live on a domain with no inbox anywhere, so
  the sign-in form can never reach them; `generateLink` skips the *delivery* and
  leaves the real flow (verify → callback → tokens in the fragment) intact.
- **`seed-test.mjs` now seeds child profiles**, and gives one family **two**
  children. `child_profiles` was first populated by the one-off backfill in
  migration 0005, so an account created afterwards has none until someone signs
  in as them — a freshly seeded project came up with an **empty class list** at
  `/admin/eleves/`, which reads as a broken surface rather than an unpopulated
  one. And "Qui joue ?" only renders above one child, so with one child per
  account the picker was untestable by construction.

### Fixed — the e2e purge aborted every run that had anything to delete

`tests/e2e/helpers/purge.ts` checked the delete cascade by querying `profile_id`
on `exercise_progress` and `attendance`. ⚠️ **Migration 0005 repointed both at
`child_profiles` and dropped that column**, so PostgREST answered `42703` and the
helper threw — blaming the cascade for what was a stale query. Any run that
actually deleted an e2e user aborted in global setup or teardown.

⚠️ **It was invisible while the test project happened to be empty**, because the
whole block is skipped when nothing was deleted. Found while setting up local
account testing, and reproduced deliberately: a planted user with a child and an
`exercise_progress` row made the next run abort, and passes on the fix.

The check now follows the column — `child_id` on `exercise_progress`,
`game_results`, `attendance` and `point_awards`, collected **before** the delete
because afterwards there is nothing left to ask — and adds `child_profiles`
itself, so the chain under test is the full one:
`auth.users → profiles → child_profiles → progress/games/attendance/awards`.
`lesson_progress` stays on `profile_id`: it is the deprecated 0001 table, it was
never repointed, and it still hangs off the account.

### Fixed — the release gate is green again, and the cause was the machine

**`npm run test:release` now runs one project at a time under a worker cap:
0 failures in 66.8 minutes**, against **v0.11.0's 4 failures in 43.9m** and
**v0.11.1's 7 in 58.3m**. No test and no application code changed.

⚠️ **The failures were MEMORY EXHAUSTION — not a browser bug, not a test bug.**
Playwright shares **one worker pool across every project**, so at its default of
six workers this machine was running six *mixed* browsers side by side.
Sampled during a run: **80 browser processes, 6.68 GB of browser memory, 2.08 GB
free of 15.8 GB.** At roughly 2 GB free, Firefox's software compositor cannot
allocate its framebuffer, the browser stops answering, and whatever test was in
flight dies of a bare timeout. That is the whole explanation for the two
signatures this project has been documenting for several sessions: the failure
**moves between specs and projects each run**, and **every one of them passes
serially**.

**Why this was worth a session at all, given both promotions were sound.** They
were: the diagnosis was right each time, and the serial re-runs were green. But
a gate that is *expected* to be red teaches the next session to wave failures
through, and the reader of the fifth red gate cannot tell it from the first
four. ⚠️ **The trend was the defect, not the individual runs.**

### The three candidates, and why the cheap-looking one lost

| | Change | Result |
|---|---|---|
| **A** | per-project runs, 3 workers | 5 projects, **0 failures, 66.8 min** — **shipped** |
| **B** | `fullyParallel: false` on firefox | **rejected without a run** |
| **C** | pooled, 3 workers | 3 projects, 0 failures, 51.7 min |

⚠️ **C's 51.7 minutes is the trap in that table, not the winner.** It ran only
firefox, webkit and iphone-13 — the three projects that produced every failure
in both red gates — and still spent 51.7 of A's 66.8 minutes. The two projects
it skipped are ~1190 further test executions with no idle capacity to absorb
them at the same worker count, so pooled-over-five lands **above** A. It looked
cheaper because it did less.

⚠️ **B was rejected on evidence already in the repository, not on a hunch.**
`fullyParallel: false` is what **webkit and iphone-13 already carry** — and they
were two of the three projects failing both gates. A setting already in force on
the failing projects cannot be the thing that would have saved them. Measuring
it would have bought an hour of confirming what `playwright.config.ts` states in
its own source.

⚠️ **The caveat is recorded rather than glossed:** C came back green, and both
red gates ran at **six** workers — so the **worker cap** is very likely the half
of A that does the work, and the per-project split may not be load-bearing for
stability at all. That is one pooled run and not a proof. The split is kept
regardless, because it buys something the cap does not — see below.

### Added — the gate proves every project actually ran

Counts are read from Playwright's **JSON reporter** and compared **project
against project**, so a project that contributes **zero tests** fails the gate by
name.

⚠️ **This replaces a check that could not see that hole.** The old rule was "the
total must be a multiple of 5" — but four projects of 100 and one of 0 divides
just as neatly as five of 80, and a project silently dropped from the config
divides perfectly. A silent zero is the worst possible pass: the summary says
green and a fifth of the matrix never happened.

### Changed — the numbers in the docs

- The release gate now costs **~65-70 min**, not 30-45. ⚠️ That makes *"do not
  run the matrix on a feature branch"* matter **more** than when it was written,
  not less.
- The pre-PR checklist now reads **"green, meaning ZERO failures"**, and says
  plainly that **a red matrix is a finding to chase, not a known flake to wave
  through**.
- The two browser-crash rows in *"Symptoms that are the ENVIRONMENT"* still
  describe a raw `npx playwright test`, which pools everything at full fan-out.
  ⚠️ **From `test:release` they are now a finding**: it means the cap has
  stopped being enough, and the next step is to check free RAM during the run,
  not to re-run and hope.
- The measurements live in `scripts/test-release.mjs` → **MEASUREMENTS** and the
  narrative in `docs/reference/testing.md`. ⚠️ `--workers=3` **is not a tuning
  knob** — it is roughly half the peak memory, which is the measured difference
  between green and red. Re-measure before re-arguing; do not re-reason.
- ⚠️ **Not fixed by loosening timeouts.** That was tried on `play.spec.ts` and
  the failure count went **up**: a starved browser given longer to answer is
  still starved, and every test now waits longer to find out.

---

## [0.11.1] — 2026-08-12

**The service worker no longer precaches unreachable chunks: 162 → 150 files,
5983 → 5953 KiB.**

A patch release with no visible change and one measurable one. Every first visit
was pushing **29.9 KB across 12 files** into the service-worker cache to support
nine routes that answer 404 — the scripts behind `/connexion/`, `/compte/`,
`/auth/callback/` and the four `/admin*` surfaces, which Astro builds because it
collects `<script>` blocks from the **module graph, not from what renders**.

What is excluded is **computed from build reachability, not from a list of chunk
names** — and that distinction is the whole fix rather than an implementation
detail. See below.

### Fixed — switched-off code is no longer precached

**29.9 KB across 12 files** was being pushed into every visitor's service-worker
cache to support nine routes that answer 404. Astro collects a page's `<script>`
blocks from the **module graph, not from what renders**, so the scripts behind
the routes `getStaticPaths()` declines to emit are still built, still hashed into
`_astro/`, and were still swept into the precache.

⚠️ **Same mechanism as the 216 KB `@supabase/supabase-js` leak the
`supabase.disabled` alias was written to fix** — the alias cut the *client* out
of the graph and left the *callers* behind. v2-S4's admin surfaces then roughly
doubled what remained. Found while verifying the v0.11.0 artefact.

⚠️ **THE OBVIOUS FIX WOULD HAVE BEEN WRONG, AND MEASURABLY SO.** A `globIgnores`
list naming the admin and auth chunks looks right and breaks two live modules:
`child.js` and `supabase.disabled.js` *look* like auth chunks and are genuinely
reachable — `progress.ts` → `progress-sync.ts` → `child.ts` runs on every board
page, and the stub is what that path dynamically imports. Naming them would have
pulled both out of the offline cache.

So the question is asked of the **build** instead of a human: start from every
emitted HTML file, follow every asset filename mentioned, transitively, and
precache what that reaches. Nothing to keep in step, no flag to read, and it
cannot disagree with the build because it *is* the build. With accounts ON it
finds nothing to exclude — the same code proving itself against the case where
nothing is orphaned. It errs towards **including** (a plain substring scan over
each chunk's whole text), because over-inclusion costs a few bytes while
under-inclusion costs a file offline, and exclusion is not deletion: an excluded
file is still served on request, just not pushed into every cache up front.

Precache: **162 → 150 files, 5983 → 5953 KiB.**

⚠️ **This also corrects the figure in the original BACKLOG entry** — 29.9 KB
across 12 files, not 31.9 across 13. The first count included `child.js`, which
is exactly the module the reachability analysis proved was live.

Guarded twice, and both were verified to **fail on the old behaviour** before
being trusted:

- **The build fails** if an exclusion did not take effect — a `globIgnores` entry
  that matches nothing is otherwise silent, the log looks identical and the bytes
  go on shipping.
- **`pwa.spec.ts` asserts it in both flag states**, and ⚠️ **asserts the chunks
  exist first**. "No admin chunk appears in the manifest" passes perfectly on a
  build that contains no admin chunks — the same vacuous-match failure that once
  reported a v0.11.0 artefact clean by grepping zero files. With accounts ON the
  spec asserts the opposite, because these chunks are reachable then and belong
  in the cache; that is what makes the rule "unreachable" rather than "auth".

---

## [0.11.0] — 2026-08-12

**The whole account stack — sync, roles, the register — is built, and it is
still switched off.**

This release is v2 arriving in one piece: progress that follows a student
between devices (v2-S3), a proven role boundary with teacher-awarded points
(v2-S4 part 1), the admin surfaces a prof actually uses (v2-S4 part 2), and
underneath all of it the parent/child model that makes the learner a person
rather than a login.

⚠️ **AND NONE OF IT IS REACHABLE. `PUBLIC_AUTH_ENABLED` REMAINS UNSET.**

That is deliberate and it is the most important line in this entry.
`/connexion/`, `/compte/`, `/auth/callback/` and the four `/admin*` routes are
**not emitted into `dist/` at all**, and there is **no Supabase project ref, host
or anon key in any shipped bundle** — off means *not built*, not hidden. Nine
routes' worth of feature ships as zero bytes a reader can reach. Turning it on is
one build variable and a release decision, and it is Seàn's, not a side effect of
a session. What changed in v0.11.0 is that it is now worth making.

What a reader of the live site gets from this release: nothing they can see —
which is the point. What the project gets is that the next decision is a switch
rather than a build.

- **v2-S3 — progress sync.** Signed in, `localStorage` stays the source of truth
  for the UI and the cloud is the durable copy; reads never touch the network, so
  a dead Supabase cannot block a board. The **first-sign-in import** merges a
  guest's work rather than replacing it — `solved` OR, `attempts` MAX, `hintUsed`
  OR, `solvedAt` EARLIEST, games unioned by id — chosen so the merge is
  commutative and idempotent, because it runs once, on real work, with no undo.
  An **offline queue** (`mcc:sync:v1`, one entry per row, bounded at 500) retries
  on reconnect and on the tab becoming visible, with no polling and no spinner.
- **v2-S4 — the role boundary and the surfaces on top of it.** `admin` / `prof` /
  `eleve`, with `role` unreachable from any client (column privileges, a trigger,
  and no INSERT policy). **Teacher-awarded points** as rows with a required
  reason, positive and capped at 50 — all three enforced in the database, not the
  form. Then the surfaces: a dashboard, a class list, session CRUD and the
  attendance register, French only, mobile-first, needing **no new migration**
  because the schema was already there.
- **The parent/child profile model.** A parent holds the account; each child is a
  profile beneath it carrying the progress, the points and the attendance. An
  autonomous teenager is an account holding exactly one child — one code path,
  not two. Graduation into their own account is **one foreign-key update** and
  copies no rows, which was the design's own test for whether the shape was right.
- **Tooling.** `npm run demo` now sweeps orphaned Playwright browsers as well as
  orphaned preview servers — ~60 were found on this machine, and they had cost
  three red release gates that were not defects. CLAUDE.md was split into the
  rules that bind every session plus `docs/reference/`, with a size guard that
  fails the build past 150 000 characters; it had reached 247 KB, past which its
  tail was silently no longer read.

### Added — v2-S4 part 2: the admin surfaces

`/admin/` (dashboard), `/admin/eleves/` (the class), `/admin/eleve/?id=…` (one
learner) and `/admin/seances/` (sessions + the attendance register), reached from
`/compte/`. ⚠️ **`PUBLIC_AUTH_ENABLED` stays OFF.** This session makes accounts
worth turning on; it does not turn them on.

**No new migration was needed**, which is the payoff from doing 0005 first:
0001, 0004 and 0005 already carried every table, policy and grant these surfaces
use. The one thing that would have needed a migration — a prof creating a student
— is deliberately not built, because staff hold `SELECT` on `child_profiles` and
nothing else, and a teacher renaming a child is indistinguishable from a teacher
inventing one.

⚠️ **The class list is CHILDREN, not accounts.** A parent with three children is
three rows and one row in `auth.users`. Built the other way round, the table, the
marker and the foreign key would all have had to be rewritten together.

⚠️ **THE REGISTER IS THE DESIGN CONSTRAINT, AND IT IS MEASURED.** Twenty
teenagers in a room, a prof standing up with a phone: one tap per child, no modal
per row, **no save button anywhere**. The write is optimistic — the state flips on
the tap, because nobody waits for twenty round trips on mobile data — and a failed
write is **loud and does not revert**, since a mark that silently undoes itself is
worse than one that never happened. Nothing re-sorts or changes height after a
tap: a list that moves under a thumb is how the next student gets marked wrong.

`attendance-timing.spec.ts` signs in a real prof, creates twenty real children and
drives twenty real marks: **1 175 ms for twenty taps (59 ms per child), all twenty
rows durable 1 470 ms after the first.** That is the interface's cost, not a
human's pace — a real class is bounded by reading the names, around half a minute.
The useful reading is that the software is nowhere near the bottleneck.

⚠️ **A cancelled session is a STATE, never a deletion.** `on delete cascade` means
deleting one destroys a register that may already have been marked, so the UI
offers no delete at all.

### Added — teacher-awarded points reach the student, as rows

Migration 0004 built `point_awards` and E3 built `PointEntry` with `origin` and
`source` so a second producer could arrive without a migration. This is that
producer.

⚠️ **STILL NOT A BALANCE.** Awards are mirrored into `mcc:progress:v1` as ROWS
with their reasons and summed by the ledger, exactly like solves. They are pulled
on sign-in and **never pushed** — the client has no INSERT policy and must not act
as though it might. `mirrorAwards()` **replaces** rather than merges, because the
server is the only author; merging would make a withdrawn award immortal on
whichever device saw it first. The key stays `v1`: a record written before this
has no `awards`, which normalises to empty.

⚠️ **The student sees "gagnés" and "attribués par ton prof" as different kinds of
thing, not a bigger number** — its own block, its own heading, an accent edge, and
**the reason printed next to every award**. The reason is why the database
requires one. A student nobody has awarded sees no block at all, rather than an
empty "0 from your teacher", which reads as a mark against them.

### Added — `src/lib/ledger.ts`, the one summation

E3 put the computation in `ScoreResolver`'s inline script, which is right for the
reader (it must land in the first paint, so it cannot import). v2-S4 adds a second
caller asking the same question over cloud rows: a prof reading a student's total.

⚠️ **A prof and a student reading different totals is the worst failure a
progression display can have** — both numbers look plausible and the student is
the one who has to argue about it. So the summation moved to a pure function over
rows, the inline copy stays for the first-paint reason, and `admin.spec.ts` seeds
a store, reads `window.MCC_SCORE` off the live page, runs the shared function over
the same records and catalogue, and asserts every number matches — including that
the teacher bucket is non-zero, so the test cannot pass vacuously.

### Added — `singleLocale` on BaseLayout

⚠️ **The admin UI is FRENCH ONLY, and that is a decision** (now Critical Feature
43). Same as BabyClub, same reason: a single-operator context. The FR/EN rule is
about readers, and an admin screen has no such audience. A future session must not
"fix" it by adding translations.

The prop suppresses the hreflang alternates **and** the language switcher, and both
halves are needed: left on, the alternates advertise a 404 to search engines and
the switcher offers a reader a one-way trip to it. It is not an escape hatch for
public pages, and a spec asserts a public page still carries both.

### Changed — `role-separation.spec.ts`: 8 assertions → 15, and serialised

Everything new is asserted **through PostgREST with the user's own token**, never
by driving the admin pages — hiding a table is UX, and a student who opens
devtools does not use the table. Added: a student cannot read the class list or
rename another family's child; a prof reads every child and can **write none**;
re-marking corrects rather than duplicating (the upsert key 0005 rebuilt);
cancelling keeps the session and its register; the award bounds hold with
`validateAward()` nowhere in the picture; a student reads their own awards and
cannot delete them.

⚠️ **And the file now runs one at a time.** Its tests share the same student,
session and awards, and this session took it from two mutating tests to seven.
They passed first time in parallel — which is exactly how that flake ships, and it
would later read as a real regression in an RLS policy.

### Verified

- **Both flag states, with a clean rebuild between** (the documented stale-`dist/`
  tell): accounts ON — 123 pages, 417 passed; accounts OFF — 114 pages, 379
  passed. The 9-page delta is exactly the gated routes. No Supabase ref, host or
  anon key anywhere in the OFF build.
- **Live RLS audit** against the TEST project: 15/15, with real tokens for a
  student, a second family and a prof.
- The four `/admin*` routes joined the existing "off means not built" list rather
  than getting a private assertion of their own.

### Changed — CLAUDE.md split into rules + `docs/reference/`, with a size guard

**CLAUDE.md had reached 247 KB against a 150 000-character context limit**, past
which the tail of the file is silently no longer read. That is the worst shape a
rules file can fail in: the rules were present in the repository, correct and
reviewed, and **absent from the sessions that needed them** — roughly the last
third, including the whole deployment and testing policy. Nothing reported it.

**247 KB → 84 KB (56% of the limit).** The split is by **when you need it**, not
by importance:

- **CLAUDE.md keeps what constrains work you might do without knowing the area
  exists** — the conventions, the 42 Critical Features, the promotion routine,
  the ply/content-authoring rules, the migration checklist, the verification and
  quick-change policy, and the architectural decisions that bind.
- **`docs/reference/` (14 files) holds the reasoning, the measurements and the
  incident narratives**, one file per area, each opening with a **Read when**
  line. CLAUDE.md links every one of them with a line saying when it matters.

⚠️ **NOTHING WAS DELETED, and that was verified rather than asserted.** The
reference files were sliced **verbatim** from the original, and a check confirms
**2 398 of 2 409 substantive lines are present character-for-character**
elsewhere; the 11 exceptions are the rewritten opening paragraph and the
migration checklist, which was reworded when it was hoisted into CLAUDE.md and
replaced in `supabase.md` with a pointer so it has exactly one home.

**Incident narratives keep their rule in CLAUDE.md and move the story out**, but
only where the story is not itself the rule. Where recognising the symptom *is*
the rule — the WebKit fan-out signature, the stale-`dist/` tell of all five
projects failing identically, the `42501`-from-`service_role` tell — enough stays
to identify it from the failure alone. `docs/reference/incidents.md` indexes them
all, grouped by how they failed; the common thread is that most failed silently
and several looked green.

### Removed — the superseded on-square coordinates section

The one thing deliberately **not** carried across intact. It was headed
SUPERSEDED and described coordinates drawn **on the squares**, which the outer-
gutter reversal replaced — including the "two inks exist" reasoning, which the
one-colour-per-palette change had already retired. ⚠️ **A section marked
SUPERSEDED is a trap, not an archive:** a future session reads a confident,
detailed passage and has only a parenthetical standing between it and treating it
as current.

What survives is the half that is still live, folded into the gutter section as
"The alignment is GEOMETRIC, never a nudge" — pin each track with `inset`, divide
it with **`flex: 1 1 0`, never Chessground's `1 1 auto`**, and put aesthetic
insets on the `coord` child rather than the track. Checked against
`src/components/board/board.css` before cutting rather than assumed: both rules
are in the live CSS, and `tests/e2e/nav-coords.spec.ts` still guards them. The
+24px default-offset measurement is kept as the illustration of why the fix is
geometric.

### Added — `scripts/check-claude-md.mjs`, the size guard

Fails at **150 000 characters**, warns from **120 000**, and runs as the **first
step of `npm run build`** (so `npm run quick` and the release gate inherit it).
It also asserts the pointers resolve **both ways**: every `docs/reference/*.md`
is linked from CLAUDE.md, and CLAUDE.md links nothing that does not exist — a
pointer is the whole mechanism holding the split together.

Both halves were verified to **fail on a broken tree** before being trusted: an
80 KB pad tripped the limit, and a renamed reference file tripped both pointer
checks. ⚠️ The message says **split, do not trim** — a rule deleted to save bytes
comes back as a bug.

### Added — the parent/child profile model (migration 0005)

⚠️ **REORDERED AHEAD OF THE ADMIN SURFACES, DELIBERATELY.** v2-S4 part 2 was
next; this went first because it changes what an admin surface is a surface
*of*. `/admin/eleves` lists children, not accounts, and attendance attaches to a
child — building the marker against "one account = one student" and repointing
it later means rewriting the table, the marker and the foreign key together.
`PUBLIC_AUTH_ENABLED` remains OFF, so none of this is reachable by a reader.

**The learner stops being the login.** `profiles.id` was `auth.users.id`:
identity and person were one row, so a child with no credentials had nowhere to
live. `child_profiles` gives the learner its **own primary key** plus a nullable
`account_id` — who holds them right now.

⚠️ **ONE CODE PATH, NOT TWO.** An autonomous teenager is not a special case:
they are an account holding exactly **one** child profile. Every learner is a
`child_profiles` row, always, so nothing downstream branches on "is this a
family". The client half is the same rule: `resolveChild()` adopts a single
child silently and only asks when the count genuinely makes it ambiguous.

**What moved.** `exercise_progress`, `game_results`, `attendance` and
`point_awards` now reference the child. The primary keys moved with the column —
`(profile_id, exercise_slug)` → `(child_id, exercise_slug)` and so on — because
dropping the column without rebuilding the key would leave those tables with no
uniqueness at all and let the sync layer insert a duplicate row on every write.
Actor columns (`sessions.created_by`, `attendance.marked_by`,
`point_awards.awarded_by`) deliberately still point at the **account**: a prof
who marks a register is a person with a login, not a learner.

Exercised against the test project with real seeded data — 4 progress rows, 3
games, 2 attendance rows and 1 award across two accounts. All followed; the
backfill created one child per `eleve` account and none for staff.

**Graduation is one FK update, and it is proved rather than asserted.**
`graduate_child()` is a `SECURITY DEFINER` function granted to `service_role`
only. Run against the test project: the child key was unchanged, the row counts
were identical either side, the new account read all of it and the old account
read none. That is the backlog's own test for this shape — *if graduating
requires copying rows between tables, the shape is wrong.*

**"Qui joue ?" — a choice, not a password.** No PIN, no lock. These are children
in the same room as the parent who signed in; the account is the security
boundary and which child is playing is a preference, like the board theme. The
choice is remembered **per device**, so a child's own phone asks once and the
family tablet asks when the answer is genuinely unknown. An account with one
child never sees the picker at all.

**`progress.ts` is still the single reader, and its public API did not change
shape.** `recordSolved(slug)` still takes a slug and nothing else. The child id
is **context**, resolved once in `src/lib/child.ts` and read by the sync layer —
threading it through every caller would have put the account model into
`ExerciseView`, `PlayView`, four page components and every spec, for a value
none of them has any business knowing.

**Live RLS + GRANT audit against the running test database**, with a real
parent, a real prof, a real anon client and the service role — 27 checks, clean.
The one that matters: **a parent cannot take over another family's child**, and
cannot write progress for one. A parent also cannot mint points for their own
child, which keeps the teacher-award anti-cheat story intact under the new
model. `service_role` DML is granted explicitly on `child_profiles` — the line
0002 exists for and 0003 forgot.

### Fixed

- **`role-separation.spec.ts` and `progress-sync.spec.ts` addressed
  `profile_id`** and were repointed at the child. Nothing about the boundaries
  they assert changed; they were asserting them against a column that no longer
  exists.
- **The graduation spec depended on a sibling test's write**, which
  `fullyParallel` is free to break — and did, in a way that made it measure zero
  rows and then assert zero equalled zero. It now seeds its own child and its
  own progress. A proof that passes on an empty set proves nothing.

### Added — v2-S4 (part 1): the role boundary, proven

⚠️ **FOUNDATION ONLY. The admin surfaces are NOT built** — `/admin`,
`/admin/eleves`, `/admin/seances`, the attendance marker and the award form are
a follow-up session. Nothing was half-built: a present-but-inert admin page is
worse than an absent one. `PUBLIC_AUTH_ENABLED` remains OFF.

**Migration 0004 — `point_awards`.** Teacher-awarded points for what the
software cannot see: effort, attendance, helping another student. E3 built
`PointEntry` with `origin` and `source` so a second producer could arrive
without a migration, and this is that producer. One row per award; still no
balance stored anywhere.

Three rules live in the **database**, not in a form, because a form is the half
a future admin script skips:

- `reason` is **required**, checked on the trimmed length — points that appear
  with no explanation destroy trust faster than no points at all;
- points are **positive and capped at 50** — a prof who could award −50 would
  turn the ledger into a disciplinary instrument, and the cap sits under the
  tutorial's own 65 so no award outweighs the work;
- a student has **no INSERT policy at all** — the one table where a client write
  would mint points directly.

**Live RLS/GRANT audit, 22 assertions, clean.** Exercised with a real student, a
real prof and a real anon client against the running database — not read from
the migration, which is what produced the `service_role` bug twice. `anon` sees
only published sessions and cannot create one; a student cannot mark attendance,
create a session, mint points, read another student's progress, change their
role by table **or** by `admin_set_role`; a prof can do the job and **cannot
promote anyone**; `service_role` can reach all five tables.

Both `profiles.role` protections re-verified live: `authenticated` holds
`UPDATE` on `display_name` and `locale` only, and `admin_set_role` is execute-
granted to `service_role` alone.

**`role-separation.spec.ts`** (8 tests) asserts the same boundaries through
PostgREST with each user's own token — deliberately not through the UI, because
a spec that drove admin pages would only prove the buttons are hidden, and a
student who opens devtools does not use the buttons.

**Decisions recorded ahead of the build:** the admin UI is **French only** (a
single-operator context — a future session must not add i18n scaffolding), and
the agenda will move to the database as a **build-time read**, because with
accounts off there is no Supabase client in the bundle and `/agenda` must still
render.

### Added — v2-S3: progress sync, and the first-sign-in merge

⚠️ **`PUBLIC_AUTH_ENABLED` IS STILL OFF.** All of this is built, migrated and
verified against the TEST project with the flag on locally; flipping it is a
release decision, not a side effect of a session. The database is now ahead of
the site, which is the safe ordering.

**Migration 0003 — a `kind` discriminator, not three tables.** The local store
has one map for every judged board: an exercise, a tutorial step and a lesson
board all produce the same record. One local map → one table makes the sync a
mirror rather than a translation, and keeps the merge from branching on
namespace. `game_results` is a **row per game, not a counter**, because two
counters cannot be merged — 3 wins here and 2 there might mean 5 games or 3, and
neither `sum` nor `max` is right in both cases. `lesson_progress` is deprecated
and deliberately not dropped.

**RLS audited live**, against the running database with real users rather than
by re-reading the migration: owner CRUD, another signed-in user reads **0** rows
and cannot forge one (42501), `anon` reads nothing and writes nothing, a prof
reads all and **cannot write**, and deleting the auth user cascades progress and
games away.

⚠️ **The `service_role` grant is the trap migration 0002 exists for, and 0003
walked into it again** — default privileges do not give `service_role` DML on a
new table, so the admin client got `42501` on a table whose RLS was perfect. Any
future migration adding a table needs the grant.

**`progress.ts` is still the single reader.** No component gained a Supabase
call; `progress-sync.ts` is a backend it writes through to. Reads never touch
the network — `localStorage` remains the source of truth for the UI — and writes
go local first, so a failed cloud write cannot lose anything.

**The merge**, run at sign-in and idempotent by construction: `solved` OR,
`attempts` MAX, `hintUsed` OR, `solvedAt` EARLIEST, games UNION by id. Tested
with conflicting state seeded on **both** sides, not just empty-into-full — the
case that passes even when the rules are backwards.

⚠️ **A real bug the idempotency test caught: Postgres and JavaScript disagree
about the timestamp STRING.** `timestamptz` returns `...+00:00`, JS writes
`...000Z`. Comparing lexicographically is wrong, not untidy: `+` sorts before
`.`, so a cloud value would win every "earliest" test whatever date it held, and
a student's first-solved date would drift. Everything is canonicalised now.

**The offline queue** is bounded at 500, survives reload, holds one entry per
row (state, not a replayable history), retries on reconnect and on the tab
becoming visible — no polling, no spinner. Tested explicitly: a whole session
worked offline, a reload while still offline, then reconnect, and everything
arrives.

**Surfaces:** `/compte` gains the real progress section with the import report
("12 exercices et 3 leçons récupérés" — silent success is indistinguishable from
silent loss); `/progres` shows one discreet sync line, hidden for a guest.
**Signing out keeps local progress** — the student carries on as a guest, and
that is asserted.

**Anti-cheat is documented, not built.** The database records what was DONE and
points stay derived, so a server-side recomputation is possible later with no
migration. CLAUDE.md records what such a check would need and why client-side
validation is not it.

### Fixed — `npm run demo` now sweeps orphaned Playwright browsers too

A killed `test:release` leaves its browsers running, and neither existing probe
could see them: an orphaned browser holds no port and its command line says
nothing about this repo. **~60 of them accumulated on the machine** during the
v0.10.0 promotion, and the next full matrix failed on five unrelated specs
across four projects — all of which passed when re-run serially once the machine
was clear. Three red gates in a row, none of them a defect.

`orphanedBrowsers()` lives in the **same `sweep()`** as the preview cleanup, so
it runs on startup and on Ctrl+C with no second routine to remember.

Four rules hold it, and each was verified against a live machine rather than
reasoned about:

- ⚠️ **Match on the executable path, never on the process name.** `chrome.exe`
  is also Seàn's own browser. The Windows filter is `ExecutablePath` — the real
  image path, which `Name` and `CommandLine` are not — and it must sit under a
  directory Playwright installs into. **25 browser-named processes outside the
  cache were spared** while the orphan was taken.
- ⚠️ **`PLAYWRIGHT_BROWSERS_PATH` first.** On this machine it is
  `D:\AppData\ms-playwright`, nowhere near the documented `%LOCALAPPDATA%`
  default — a sweep that assumed the default would search an empty directory,
  find nothing, and report success.
- ⚠️ **Orphans only.** A live launcher means a run in progress, possibly another
  project's, since the cache is machine-wide. With the launcher alive **3
  browsers were spared**; once it was gone, the same shape was swept.
- ⚠️ **Tree roots only, `taskkill /T`.** Chromium is a process tree; killing the
  top alone leaves renderers reparented and running. One orphan reported, **four
  processes gone**.

Known limit, erring the safe way: Windows reuses pids, so a dead launcher's pid
may belong to something live, and the orphan is then left alone. Under-killing
is the right direction for a routine that runs unattended.

---

## [0.10.0] — 2026-08-11

**The site can make a sound, and says nothing until asked.** Six short voices,
synthesised by oscillators — no audio files, so nothing is added to the precache
and nothing is fetched. Off by default, because a site that makes noise unasked
is a site people close.

The voice worth arguing about is the wrong move: a synth makes a buzzer
trivially easy, and a buzzer is the wrong instrument for a tool that teaches
children. An error has to inform without scolding, so it is the only voice that
fades in rather than striking, at the lowest gain in the palette.

One decision is recorded rather than assumed: **`prefers-reduced-motion` does
not silence the site.** It is a preference about vestibular discomfort, not
hearing. It does suppress the unprompted invitation, which is a different
judgement about being interrupted.

Nothing else changes: still static, still no account, still no third-party
request, and every sound still accompanies a visual that fires without it.

#### ⚠️ This release was promoted on a RED `test:release`, deliberately

Recorded here rather than left in a terminal, because a release that skipped its
own gate must be auditable. **Seàn approved it on the evidence below.**

Final run: **2614 passed, 5 failed, 9 flaky, 117 skipped**
(2614 + 5 + 9 + 117 = 2745 = 5 × 549, so nothing vanished from any project).

Every one of the 5 was re-run on its own project with `--workers=1`, which is
the procedure CLAUDE.md prescribes, and **all 111 tests passed**:

| project | spec | serial result |
|---|---|---|
| firefox | `progression`, `replayer` | 59 passed |
| webkit | `replayer` | 19 passed |
| pixel-5 | `play` | 19 passed |
| iphone-13 | `nav-coords` | 14 passed |

What made it defensible rather than a shrug: **not one failure touched the sound
change** — all five were in specs this session never edited — and the failing
SET was different on every attempt, which is the signature of contention rather
than of a defect. A real break is deterministic and fails serially too.

Contributing cause, found and fixed mid-way: **~60 orphaned Playwright browser
processes** had accumulated on the machine from a killed run, alongside a stray
preview server. `npm run demo` sweeps previews for this repo but nothing sweeps
orphaned browsers, so a killed matrix leaves the machine slower for the next
one. Worth a sweep before any release run — see BACKLOG.

### Added — E2: sound, synthesised and off by default

Six short voices, generated by oscillators in `src/lib/sound.ts`. **No audio
files**: 0 bytes in the precache, 0 requests, and no licence question in a GPL
repo — a synthesised waveform has no author to credit.

`src/lib/sound.ts` is the single source, exactly as `motion.ts` is for
durations: no other file may build an `AudioContext`, an oscillator or a gain
node. Islands call `play(event)` and nothing else.

| voice | shape |
|---|---|
| `place` | triangle 240→170 Hz, 45ms, lowpass 2.2k — a piece meeting wood |
| `capture` | sawtooth 150→90 Hz, 75ms, lowpass 900 — a thud, not a rasp |
| `check` | triangle 440 + 622 Hz, 70ms — a tritone. A warning, not an alarm |
| `solved` | sine 587 → 880 Hz, 70+80ms — a rising fifth, not a fanfare |
| `wrong` | sine 175→150 Hz, 150ms, 18ms attack |
| `achievement` | the solve plus 1175 Hz and a faint octave — "that, but more" |

⚠️ **The wrong-move voice is the one that mattered.** A synth makes a buzzer
trivially easy, and that is the wrong instrument for a tool that teaches
children: an error must inform, not scold. It is a pure sine with no harmonics
to bite, the lowest gain in the palette, and the only voice that fades **in**
rather than striking. Both refused verdicts share it — under `onlyMove: false`
we do not know the reader was wrong, so we must not sound as though we do.

Nothing sounds for navigation, hover, scroll or page load.

#### Off by default, and its own key

`mcc:sound:v1`, not a field on `mcc:theme:v1` — the theme record is parsed by
the **blocking inline head script** before first paint, and sound cannot matter
before a gesture. Adding a field there would grow the parse surface of the one
script that runs before anything is on screen, to carry a value it never reads.
⚠️ **Any doubt resolves to OFF**: a corrupt record must never make a silent site
start making noise.

A three-step volume (`doux` / `moyen` / `fort`), not a slider. The steps are
disabled while sound is off — a volume control that changes nothing audible is a
control that lies.

#### The invitation, once

Offered at the first solve and retired by **either** answer: declining writes
`invited: true` too, because an offer that returns after a "no thanks" is
nagging. It renders outside the verdict's `aria-live` region — buttons inside a
live region get re-announced on every update.

#### ⚠️ `prefers-reduced-motion` does not silence the site

This **departs from the direction doc**, which lists *"aucun son"* under that
preference (§ Contraintes 2). The two are different senses: the preference
exists for vestibular discomfort, not hearing, and switching sound off for those
readers decides something they never asked about. It does suppress the unprompted
**offer**, which is a different judgement — a reader who asked for calm should
not be interrupted with a question. Both halves have specs, and the conflict is
recorded in CLAUDE.md so it is not re-litigated.

#### Cost

The `AudioContext` does not exist until a gesture, proven by a spec that patches
the constructor and counts. The module itself is a **separate 3.2 KB raw chunk**
fetched only by pages that can make a sound.

Lighthouse mobile, three runs each on `/exercices/mat-du-couloir/`:
**before 98 / 98 / 97, after 96 / 97 / 97**. The spreads overlap, so the ~1
point is at the edge of run-to-run noise rather than a clear regression;
`/parametres/` went 92 → 90 on single runs. Both stay well above the ≥90 floor,
and accessibility, best-practices and SEO are 100 throughout.

#### ⚠️ Playwright's headless WebKit has no Web Audio at all

Found by the release matrix, which went red on `webkit` and `iphone-13`. Probed:
`AudioContext` and `webkitAudioContext` are **both `undefined`** in that build,
and constructing one reports "no constructor".

Not a Safari fact — real Safari has had unprefixed Web Audio since 14.1 — and
not a product bug: the site degrades exactly as designed, giving up quietly and
carrying on. The three tests that need a context to exist now **skip on those
projects, visibly and with the reason**, rather than passing vacuously.

The limitation became coverage instead: a new test deletes both constructors
and asserts an exercise still solves with no `pageerror`, on **all five**
projects — so the degradation path cannot stop being covered when a browser
build changes.

#### What no machine verified

`sound.spec.ts` (24 tests) asserts the contract — no context before a gesture,
off by default, persistence, exactly one context across many moves, oscillators
built when on and none when off or when the tab is hidden, the invitation
offered once, broken storage falling back to silence, axe clean on
`/parametres/` in both states and on the invitation panel.

⚠️ **Playwright cannot hear.** Whether the sounds are pleasant, whether the
wrong-move note reads as corrective rather than punishing, and whether anything
grates after twenty exercises are in `docs/MANUAL-TESTS.md` and only Seàn can
answer them.

---

## [0.9.0] — 2026-08-10

**The teaching release.** v0.8.0 gave the site something to say about the
reader; this one gives it something to teach them. Course 3 adds seven lessons
on the tactical motifs, `/pieges/` goes from one trap to seven, and every one
of those traps teaches its refutation rather than just its trick.

Underneath both: **claim-level content checking.** A board or a trap now
declares what its prose asserts — a pin, a fork, a discovery, a line — and the
build proves it. That exists because course 3 shipped four positions that were
legal, solvable, passed every check, and described a mechanism the board did
not contain. Two of them were the exact beginner misconceptions the lessons
were written to correct.

And `/progres/` is reachable on desktop, which it had not been since M3 put it
in the mobile bottom bar and nowhere else.

Nothing here changes what the site is: still static, still no account, still no
in-app communication.

### Fixed — the pointer helpers pressed for 0ms, and Chessground ignored it

The v0.9.0 release matrix went red on two chromium specs, both reporting that a
tutorial board refused every pointer move — `data-attempts` still 0, so no move
was even attempted. Indistinguishable from a real regression.

It was the harness. `click()` with no `delay` sends `mousedown` and `mouseup`
with nothing between them, so both land in **one animation frame**; Chessground
does its drag bookkeeping inside a `requestAnimationFrame` loop and a press
already released before that frame runs emits nothing at all. The same
mechanism CLAUDE.md documents for synthetic drags, in tap shape.

Measured on `/apprendre-les-bases/le-cavalier/`, 8 fresh contexts each:

```
click delay = 0ms   → solved 1/8
click delay = 60ms  → solved 8/8
```

`movePiece()` now presses for 60ms, and the two specs that hand-roll their
clicks do the same. `pointTo` additionally waits for the pick-up to render
before clicking the destination, which makes the sequence deterministic and
asserts something the old helper never checked — that the piece was actually
picked up. `board-frame` gained the same wait plus an explicit
`data-attempts: 1` after the refused move, because its `data-busy` check had
been passing **vacuously** on a board that never became busy.

⚠️ **The application was never broken**, and that was established before any
harness code was touched: driven by hand at human pace the board picks up and
solves every time. Two further tells, both worth recognising next time — the
failure **bisected clean to the v0.8.0 tag**, whose own matrix had been green,
and it survived `--workers=1`, so the usual "contention flake" reading was
wrong in both directions.

Verified with four consecutive full runs of `board-pointer`, `board-frame` and
`exercise` (45 tests each): 45/45 every time.

### Added — six opening traps (content batch 4), built from notation

`/pieges/` goes from one trap to seven: **le mat du berger**, **l'attaque
Fegatello**, **le piège de l'éléphant**, **le gambit Blackburne-Shilling**,
**le piège de l'Arche de Noé** and **le mat étouffé de la Caro-Kann**.

⚠️ **The brief supplied no FENs, deliberately** — batch 3 shipped four
positions that were legal and wrong. Every line here was built from algebraic
notation, replayed through chess.js, and each mechanism the copy asserts was
checked before a file existed. **All six lines verified sound as given.**

#### Two corrections

- **The QGD trap is the Elephant Trap, not the Lasker Trap.** The brief called
  it `piege-de-lasker`. The line — `1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Nbd7 5.cxd5
  exd5 6.Nxd5?? Nxd5!` — is universally the **Elephant Trap**; the *Lasker
  Trap* is a different thing entirely, in the Albin Counter-Gambit
  (`1.d4 d5 2.c4 e5 3.dxe5 d4 4.e3?? Bb4+`), and is famous for an
  under-promotion. Shipped as `piege-de-l-elephant`. The line itself is correct
  and unchanged.
- **"Black emerges a piece up" overstates it by a pawn.** Counted with
  chess.js: white 23, black 25 — Black is **+2, a knight for a pawn**. The copy
  says that, and walks the reader through the count, rather than rounding it up.

#### The sixth trap: the Caro-Kann smothered mate

`1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7 5.Qe2 Ngf6?? 6.Nd6#`

Chosen over the Englund and Scandinavian candidates because of what it teaches
rather than what it is: the mate happens because **5.Qe2 is a quiet move that
sets up a discovery** — when the knight leaves e4 the queen's line opens onto
e7, pinning that pawn so it cannot capture on d6. So it ties course 2's
smothered mate to course 3's pin in six moves, in an opening beginners really
play, and its refutation is a single move (`5...Ndf6`). The gap it fills: it is
the only trap in the batch whose mate is *enabled by a pin*, and the mechanism
is asserted three ways (`line`, `discovery`, `pin`) rather than described.

#### Claims on traps — anchored to a ply

The trap schema gained `claims[]`, and a trap's claims carry a **`ply`**: the
position after that half-move, same 0-based scheme as `moveComments`, `-1` for
the start. `after`/`moves` continue from there, which is what lets a claim prove
a **refutation the PGN does not contain** — `mat-du-berger` asserts that at
ply 4, `3...Qe7 4.Qxe5?? Qxe5` wins the queen.

18 claims across the six: **7 `line`**, **2 `pin`**, **1 `discovery`**,
**6 `manual`**. Every `manual` note says what a human must check and why no
machine can — a trapped bishop's exhaustiveness, modern theory's verdict on a
defence, a material total, an evaluation of alternatives.

Both new rules were verified to fail: a trap claim with **no** `ply`, one with
an **out-of-range** ply, one anchored **one ply off** (*"move[0] 'h5f7' is not
legal in …"*), a false `pin`, and a lesson claim that wrongly carried a `ply`.

#### Verification

`check-content` green. **Every one of the six replayers was stepped through in
a browser**, ply by ply, with each move printed beside the commentary that
renders on it — the check the brief asks for and the checker structurally
cannot do. All 24 comments land on the move they describe. One French notation
typo found that way and fixed (`Dé7` → `De7`).

### Fixed — `/progres/` was reachable on mobile and nowhere on desktop

M3 added the bottom bar with **Progrès** as its fourth entry, and never added a
desktop counterpart. The page built, rendered and passed every one of its own
specs; a desktop reader had no way to reach it short of typing the URL.

Same defect as an index card with no destination (Critical Feature 32),
inverted — there a way in that leads nowhere, here a page with no way in. Both
are invisible to a suite full of "this element does the right thing"
assertions, because **nothing is broken, only absent**.

#### It is a top-level nav entry, not a group item and not a tools icon

Stated because two of the three placements are wrong:

- **Not inside a nav group.** Not "Apprendre" (nothing to read), not
  "S'entraîner" (nothing to do) — it is about the *reader*. Filing it under a
  content section repeats the category error CLAUDE.md already rejects for
  putting settings under "Le club".
- **Not in the header-tools cluster.** Theme, language and settings are
  **preference controls**, and icon-only. Progress is a destination you return
  to and read; it needs a name, not a glyph.
- **Top-level, last, after the three groups.** The nav root already carries one
  plain link (Accueil), so this is not a new shape; it is a link rather than a
  disclosure, so it adds no fourth panel; and it sits where the bar puts it.

Label is `nav.progress`, **the same key the bar uses** (Critical Feature 20).
That key having exactly one caller was itself the smell: a destination named
nowhere else is usually reachable from nowhere else.

#### The rule, and a spec that reads the bar rather than a list

New **Critical Feature 36**: no route may exist on one layout only. Every
bottom-bar destination must be reachable from the desktop header, asserted in
both locales — and ⚠️ **the list is read off the bar at phone width, never
hard-coded**, so a fifth entry fails until it has a desktop home. A spec naming
four known paths would have passed throughout this bug.

Verified to have teeth: with the entry removed the spec fails with *"the bottom
bar reaches /progres/, but the desktop header has no link to it"* in FR and EN,
plus the `aria-current` test.

`scripts/spec-map.mjs` mapped `Header.astro` to **nothing at all**, so editing
the site navigation selected no specs — part of how this survived. It now maps
to `mobile-app`, `main-menu` and `smoke`.

#### E3 on desktop, in all four themes

Rank, points, session streak and achievements are now asserted to render at a
desktop viewport in **4 themes × both modes**. The existing axe sweep proved
those pages were *accessible* in every theme; it could not prove the resolver
had filled anything in, because a blank rank and a zero total are perfectly
accessible.

⚠️ One assertion had to be strengthened after it was written: `data-score-rank`
is **server-rendered with "Pion" as a seed**, so "the rank is non-empty" passes
with the resolver dead. It now asserts the rank label *agrees with the points
beside it*, computed from the catalogue on the page — no threshold hardcoded,
and only the resolver can make it true.

⚠️ **Measured cost: the header wraps to two rows between 768px and 1023px** —
77px tall becomes 129px. The fifth entry adds 72px of nav width. Verified
against `dev` that the same header already wraps at 768px without the change,
so this widens an existing designed behaviour rather than introducing one;
1024px and up are unchanged. Not fixable by trimming the gap (four gaps hold
16px at most), so it is accepted and recorded rather than papered over.

### Added — the checker now asserts the MECHANISM, not just the legality

Course 3 shipped four boards that were legal, six-field, solvable and **wrong**:
they described a mechanism the position did not contain. Every one passed
`check-content.mjs`. They were caught by replaying each position by hand and
asserting the specific claim its caption makes — so that by-hand pass is now
part of the build.

A `position` or `exercise` board may declare `claims[]`, and each is proved:

| kind | what is asserted |
|---|---|
| `pin` | the named piece has **zero** legal moves, **and** removing it exposes its own king — the second half is what separates a pin from a piece merely blocked in |
| `fork` | the piece on `from` attacks **every** `target`, and each holds an enemy piece |
| `discovery` | `by` does **not** attack `target` now and **does** once `screen` is lifted, so the screen is load-bearing |
| `line` | the moves are legal in sequence and the position ends `mate`/`check`/`quiet`/`stalemate`, optionally capturing a stated piece |

`after: [...]` replays moves before asserting, because a caption usually
describes the position the diagram is *about* to reach ("le cavalier saute en
c7 …"). Claims are language-neutral, so the fr/en pair must agree — `claims`
joined the `NEUTRAL` list.

**Each assertion was verified to FAIL on the real broken position before being
trusted**, using throwaway fixtures carrying the original values: the Ruy Lopez
FEN (*"the piece on c6 has 5 legal move(s) (Nb8 Nce7 Nd4 Nb4 Na5) — it is NOT
pinned"*), the b3 bishop (*"with e5 removed, the piece on b3 still does not
attack h8"*), a wrong fork target, and the g1-king overload (*"move[2] 'e1e8'
is not legal"*). Fixtures deleted.

#### ⚠️ `manual` is the honest escape, and it is PRINTED

Some claims are genuinely not properties of a position. "The king must step
aside and then the queen falls" and "if she recaptures it is mate in two" need
a forcing-line search over every legal reply — a small engine, not an
assertion. Inventing a check that appears to cover them would be worse than the
gap, so those declare `kind: 'manual'` with a **required** `note` saying what a
human must verify, and the checker prints them as a **review queue**. A board
with no claims at all is printed there too: the goal is that nothing passes
silently, not that everything passes.

Course 3 lands 5 machine-checked claims (both clouage boards, la fourchette, la
découverte, la surcharge) and 3 manual ones (l'enfilade, la déviation,
l'attraction) whose notes name exactly what to look at.

⚠️ **The queue does not fail the build, deliberately.** 17 of its entries are
boards from courses 1 and 2 that predate claims. Failing would force either a
retrofit in one sitting or switching the check off, and a visible list that
shrinks is worth more than a red build somebody disables.

### Added — course 3, "Les motifs tactiques" (content batch 3)

Seven lessons, both locales, `intermediaire`, `order: 3`: la fourchette, le
clouage, l'enfilade, l'attaque à la découverte, la déviation, l'attraction, la
surcharge. Fourteen Markdown files plus the course index record, in the shape
courses 1 and 2 already use — no schema change, no new component, no new route.

Six lessons carry a still diagram plus a judged exercise; lesson 6 carries the
replayer (`1. Rh8+ Kxh8 2. Ng6+ Kg8 3. Nxe7+`) plus its exercise. Cross-links
to `/exercices/fourchette-de-cavalier/`, `/pieges/legal/` and two course-2
lessons, locale-correct on both sides.

#### ⚠️ FOUR OF THE EIGHT POSITIONS DID NOT DO WHAT THE PROSE SAID

The brief warned about the two error classes batch 2 shipped, and **not one of
this batch's errors was either of them.** Every position was legal, parsed, had
six fields and a legal solution — `check-content.mjs` passed all eight without
complaint. They were wrong in the one way no checker can see: **the prose
described a mechanism the position did not contain.** Found by replaying each
one through chess.js and asserting the specific claim the sentence makes.

- **Lesson 2, le clouage — there was no pin.** The FEN was the Ruy Lopez after
  `1.e4 e5 2.Nf3 Nc6 3.Bb5`, and the lesson said the c6 knight "ne peut pas
  bouger". The black **d7 pawn** stands on the b5–e8 diagonal, so the knight
  had **five** legal moves. This is the single most common beginner
  misconception about that opening, and the lesson would have taught it as
  fact. Both boards moved to positions where d7 is empty and the pin is real —
  the Steinitz (`3...d6`) for the diagram, and `1.e4 e5 2.Nf3 Nc6 3.Nc3 d6` for
  the exercise, where `Bb5` is the **unique** pinning move. A short paragraph
  was added to both locales naming the d7 pawn, because the trap is worth
  teaching once the position is honest.
- **Lesson 4, la découverte — the bishop was on the wrong square.** `Bb3` does
  not see h8 (b3–g8 is the diagonal), and `Ne5` was not on its line either, so
  `Nxd7` discovered nothing. Bishop to **b2** puts the knight on the a1–h8
  diagonal, where removing it uncovers check exactly as described. Verified by
  deleting the knight and asserting the bishop then reaches h8.
- **Lesson 6, l'attraction — the combination was refuted by `2...fxg6`.** With
  a black pawn on f7, `Ng6+` is simply captured, and White has thrown away a
  rook and a knight. The f7 pawn is **removed**: `Ne5` already covers f7, so
  the king is still sealed on g8 and `Rh8+` still forces `Kxh8`. Asserted:
  after `Rh8+` Black has exactly one legal reply, and after `Ng6+` nothing can
  take the knight. The ply-0 comment changed with it — f7 is now named as
  covered by the knight rather than occupied by a pawn, which is a better
  teaching point anyway.
- **Lesson 7, la surcharge — the mate did not exist, twice over.** With the
  white king on g1 the recapture `Qxc5` arrived **with check**, so White never
  got the free move; and even without that, a queen on c5 covers f8 along the
  a3–f8 diagonal and simply blocks `Re8+`. The deflection square has to be one
  the queen cannot bounce back from: the knight moved to **g5**, the bishop to
  **d2**, the white king to **h1**. `Bxg5` is now the unique knight-winning
  move, `Qxg5` is not check, and `Re8` is mate — all three asserted.

#### One `onlyMove` flipped to `false`

**Lesson 5, la déviation.** `Ra8+` forces mate in two (`Ra8+ Qd8 Rxd8#`, and
`Qc8` loses the same way), so `Rxd7` is not the only right answer — it is not
even the best one. Under `onlyMove: true` a student who found the **mate**
would have been told they were wrong, which is precisely what the rule in
CLAUDE.md forbids. Flipped to `false`, so that reader now gets "not the line we
had in mind".

⚠️ The position cannot be repaired without destroying the lesson: the mate
exists *because* the back rank is weak and the queen is the only blocker, which
is the very thing the lesson teaches. Flagged for Seàn in BACKLOG.md rather
than papered over.

#### The checker's teeth were re-proved, not assumed

Both batch-2 classes were re-tested with throwaway fixtures before anything was
written, and both were rejected: a `[SetUp]` FEN contradicting the first move
(*"PGN rejected — Invalid move in PGN: Qb3+"*) and a finished mate written with
the wrong side to move (*"the side NOT to move is in check — impossible
position"*). The fixtures were removed; `git status` confirmed nothing was left
behind.

#### Verification

`check-content.mjs` green on all seven pairs. The **lesson 6 replayer was
stepped through in a browser** on the built site: each of the five plies renders
the expected position (read back off Chessground's own transforms), and the
three comments land on `Rh8+`, `Ng6+` and `Nxe7+` — plies 0, 2 and 4, the
0-indexed numbering the brief insisted on. `npm run test:branch` selected
`index-cards`, `lessons` and `smoke`: **48 passed**, including the check that
the new course card on `/cours/` resolves.

---

## [0.8.0] — 2026-08-10

**Progression, and a real address.** The site can now say what a reader has
earned — ranks, points, session streaks and achievements, all derived from the
work behind them and never banked — and it has a production hostname,
`mogadorchess.nachi3dlabs.com`, with the one check the local gate structurally
cannot do: `npm run smoke:prod`, which asks the deployed origin rather than a
build on disk.

Also here: the `/cours/` card that rendered fully and did nothing when clicked
is gone, and `CardItem.href` is required so the state cannot be constructed
again.

Nothing here changes what the site is: still static, still no account, still no
in-app communication, and every point is recomputed rather than stored.

### Added — the production domain, and a check that can see it

**`mogadorchess.nachi3dlabs.com`.** A subdomain of the Labs domain, which is
already a Cloudflare zone — so no registrar, and nothing to wait for. All three
config touch points moved off the unregistered `mogadorchess.ma`:

- **`src/config/site.ts` → `url`**, which is the one that matters: `BaseLayout`
  builds the canonical link, every `hreflang` alternate and `og:url` from it. A
  wrong value here breaks nothing on screen and quietly tells Google and every
  share preview to use a hostname that may not resolve.
- **`astro.config.mjs` → `site`**, the same fact in a second file.
- **`wrangler.jsonc` → `routes[0]`**, with `custom_domain: true`. A bare
  `routes` pattern attaches a Worker to a hostname that must *already* resolve;
  `custom_domain` makes wrangler create the DNS record and issue the
  certificate. Without it the deploy succeeds and the hostname 522s.
  ⚠️ **Still no `main`** — a Worker with `assets` and no entry script is served
  entirely by the assets runtime, and that file exists to stop wrangler
  installing the Cloudflare adapter.

`mogadorchess.ma` stays a separate later option and blocks nothing — including
custom SMTP, which needs *a domain you control* rather than that specific one.

#### `scripts/smoke-prod.mjs` + `npm run smoke:prod`

**The check the local gate structurally cannot do.** Everything else tests a
build on disk served by `astro preview` on localhost — right, and blind to a
whole class of failure: the Worker deployed but the domain never attached;
`site.url` naming a host that is not the one answering; `sw.js` or the generated
manifest not reachable, so the PWA silently stops being installable.

Twelve routes across both locales, each asserting HTTP 200, the right `lang`, a
structural sentinel, the **GPL source link in the footer** (Critical Feature 8),
canonical and `og:url` agreeing, and **no third-party subresource**. Plus the
manifest parses and has icons, and `sw.js` is the generated worker with **no
engine in its precache**. `--url` points it anywhere.

Three things it does deliberately:

- **The origin is parsed from `src/config/site.ts`, not retyped.** A fourth copy
  of the hostname would be the one that goes stale, and this script would then
  smoke-test the wrong site and report success. Same reasoning as
  `check-contrast.mjs` parsing the real stylesheets.
- **It compares `site.ts` and `astro.config.mjs` before touching the network**,
  so the two-files-one-fact drift is caught without a deploy. Verified to fail.
- **Sentinels are structural, never prose** — every one is a `data-testid` or a
  component class the Playwright suite already relies on. Pinning a sentence
  would make this fail on a typo fix, which is the tax that gets a check
  switched off.

⚠️ It is **not** part of `npm run build` and must not become part of it: it needs
the network and a deployed site.

#### One bug found by testing the checker

The first subresource scan reported the site's **own `canonical` and `hreflang`
links as third-party subresources on all twelve pages.** A `<link>` is only a
request for some values of `rel` — `canonical`, `alternate`, `author` and
`license` are metadata the browser never fetches. It now filters on `rel`, and
`<a href>` is excluded entirely: the site links out on purpose (the GPL text,
Chessground, Wikimedia, `wa.me`), and the rule is "no third-party REQUEST
without an explicit click".

Both halves were then verified to have teeth rather than assumed: a CDN
`<script>` injected into a built page is caught by origin, and a deliberate
`site.ts` / `astro.config.mjs` mismatch fails before any fetch.

### Added — E3: ranks, points, session streaks and achievements

Direction: `docs/direction/mcc-direction-esthetique.md` §§ B1–B3. Everything is
local — `localStorage`, guest-first, and nothing here depends on accounts.

#### Points are DERIVED, never banked

No total is stored anywhere. Every figure is recomputed from the records behind
it, every time it is read. A stored balance is a number a student types into a
console in three clicks; a derived one is exactly as good as the work behind it.

Two properties fall out of that with no code at all, which is the point:
re-solving an exercise awards nothing (the record is a boolean), and a lesson
with three boards awards on the last one (a lesson is one catalogue entry).
`ExerciseView` shows the *delta in the total*, so neither case needed a branch.

| Source | Award |
|---|---|
| Tutorial step | 5 |
| Course lesson, all boards solved | 10 |
| Standalone exercise | 15 / 25 / 40 by level, +5 if the line ends in mate |
| Hint used | ×0.6, rounded up, never zero |
| Game won | 5 / 15 / 40 by level, first **two** wins per level counted |

**Losses and draws cost nothing** and are read by no scoring rule. They are
recorded because the record is worth keeping and v2-S3 will sync it. Losing to a
2000-strength engine is the normal outcome and must never subtract.

#### The ranks

Pion → Cavalier → Fou → Tour → Dame, at 0 / 20 / 70 / 150 / 220. The full
reasoning is in CLAUDE.md; the two that carry it are **Cavalier at 20**, which
is four tutorial steps and therefore inside a beginner's first sitting, and
**Dame at 220 against a 230 learning ceiling**, which means the top rank cannot
be reached without doing very nearly all of the teaching. Dame does not require
playing the engine at all.

#### Session streaks — and no daily streak, permanently

Consecutive exercises solved with no wrong move, in `sessionStorage`, gone when
the tab closes. **There is no daily streak and there will not be one:** the club
meets weekly, so a consecutive-day streak would break every week by design for
every student. Now Critical Feature 34 so it is not re-proposed.

A broken run is never presented as a loss — no message, no zero, simply not
shown below two. A reader whose move was refused is already being told once.

#### Achievements, announced at the moment they are earned

First mate, ten exercises, a course finished, every elementary mate, five in a
row, and a first win at each engine level. Earned is derived; **announced** is a
stored bookmark that stops the toast firing again on every page load for ever.

⚠️ **"A trap mastered" is deliberately not shipped.** A trap page is a replayer
and records nothing, because stepping through a game someone else played is
reading rather than competence. Awarding it for scrubbing to the end is exactly
the "rank earned by clicking" the direction forbids. It lands when a trap
carries an exercise — BACKLOG.md.

#### Surfaces

- **`/progres/`** — rank with progress to the next, the total with its breakdown
  by source, every achievement earned and remaining, the current run. Both
  "bientôt" placeholders are gone.
- **The home dashboard stats line** — real rank and total, in the first paint.
- **The solve moment** — the award rides the existing second beat rather than
  adding a third. Nothing renders at zero: "+0 points" would read as a mark out
  of ten rather than as the absence of a reward.

#### Where the code lives, and what is duplicated

`points.ts` (policy, pure, island-safe) → `scoreboard.ts` (build time, content →
award values) → `ScoreResolver.astro` (one computation, inline, first paint) →
`score.ts` (the islands' accessor, which computes nothing).

⚠️ **No policy is duplicated in the inline script.** Every award value,
threshold and condition ships as data with the awards already computed, so the
script sums numbers and knows no rules — the same trick as `MCC_THEMES`. Only
the two storage keys are duplicated, because an inline script cannot import.

### Changed

- **`progress.ts` gains two namespaces** (`games`, `announced`) plus the session
  streak. The key stays `v1` by construction: two fields were added and none
  reinterpreted, so a pre-E3 record normalises to "no games, nothing announced",
  which is true. Same no-op migration `boardTheme` made in E6.
- ⚠️ **Its writer now persists the whole record.** The old one spelled
  `{ exercises: ... }`, which was complete when it was written and would have
  **silently deleted a game on the next solve**. Every writer goes through one
  function that knows what a complete record is.
- **`/jouer/` records results at all.** Nothing did before: a win over Avancé —
  the strongest single piece of evidence this site can gather about a student —
  was thrown away the moment the reader pressed "new game".
- **`check-contrast.mjs`: 275 → 315 assertions.** Three new pairs on the sunken
  surface (accent as text, primary text, the rank bar's fill), audited in all
  eight theme/mode combinations.

### Fixed

- **`--mcc-border-strong` on `--mcc-surface-sunken` measured exactly 3.00
  against a 3.0 floor in Marbre light** — found by the new pair, on the
  achievement star's first draft. Fixed the way the E6 rule prescribes: the
  outlier is removed, not excepted. Nothing on the site now draws a strong
  border on a sunken surface, and the near-miss is recorded in the auditor so
  anything that starts to knows what to expect.
- **`board-pointer.spec.ts` still required an unlinked course card** — left over
  from the index-card work, and only surfaced now because that spec was not in
  the changed-file mapping last session. It asserts the opposite now.


### Fixed — a card on `/cours/` that could not be opened

"Les bases : le plateau et les pièces" rendered the full card — surface, title,
summary, level badge — and did nothing when clicked. The course had no lesson
pages, and courses without lessons were deliberately rendered unlinked so the
card could not point at a 404.

**Unlinked was the wrong trade.** An absent card tells a reader nothing is
there; a present, inert one, identical to its working neighbours, tells them the
site is broken. It was also close to invisible to testing — nothing was
*missing* from the page, only the behaviour.

#### The record was removed, not linked

`src/content/cours/les-bases.json` is deleted. The obvious fix was to point it
at `/apprendre-les-bases/`, and it is wrong for a specific reason:

- **That content IS the tutorial.** The summary named the board, how each piece
  moves, castling, en passant and promotion — exactly the thirteen tutorial
  steps, checked one by one. There was no course waiting to be written; there
  was a duplicate index record for content that already ships.
- **`/cours/` already links the tutorial at the top**, deliberately, as the
  named prerequisite. A card pointing at the same place under a different title
  puts one destination on one page under two names — the thing Critical Feature
  20 forbids.
- **Writing real lessons** would have meant a second, drift-prone copy of
  thirteen steps of shipped teaching, in both locales, for readers who already
  have a better route to it.

It also carried `order: 1`, the same as `bien-ouvrir-une-partie`, so the course
list's sort was already ambiguous. Nobody had maintained it.

### Added — the index rule: a card that renders has a destination

Stated in CLAUDE.md as Critical Feature 32, and enforced twice rather than
written down once:

- **`CardItem.href` is required** (`string`, not `string | undefined`), and
  `CardGrid` no longer has a non-link branch. `CardGrid`'s three callers cannot
  construct the state.
- **`tests/e2e/index-cards.spec.ts`** — every card on `/cours/`, `/pieges/` and
  `/exercices/`, both locales, has a `.card-link` whose href **resolves 200**.
  The type binds this file's callers; the spec binds what a reader can click,
  and would catch an index that drew its own markup.

Two details the spec is deliberate about: it asserts the destination *resolves*
rather than merely exists (a dead card pointed at a 404 satisfies the letter and
nothing else), and it asserts the index is non-empty first, since every
per-card assertion passes vacuously on a list with no cards.

**A course with no lessons now fails the build**, naming the slug and both ways
out. Dropping it silently was the other candidate and is worse: content that
vanishes with no signal sends the next session to debug the index. `draft: true`
remains the way to park a course that is genuinely being written, so the states
are "openable" and "deliberately parked", with nothing between them.

Also mapped in `scripts/spec-map.mjs`: content under `traps/`, `exercices/`,
`cours/` and `lessons/` now runs `index-cards.spec.ts` alongside its own spec —
adding or removing an entry is exactly when a card can end up with nowhere to
go.

---

## [0.7.0] — 2026-08-09

**Mobile density on the internal pages.** v0.6.0 fixed the home screen and the
card indexes; this one fixes the pages a student actually works in. The exercise
block no longer shares a phone screen with 466px of chrome, "Reprendre" is one
rule serving four surfaces instead of two-and-a-half copies of itself,
`/progres/` has real content, and the board frame is centred on what it encloses.

Nothing here changes what the site is: still static, still no account, still no
in-app communication — and the board itself was not touched to win back a single
pixel.

### M3 (suite) — the board fits the phone, and there is one answer to "where did I stop"

Three items were left from M3. The board no longer shares a screen with 466px
of chrome, "Reprendre" is one rule instead of two-and-a-half copies, and
`/progres/` says something.

#### Fixed — the exercise fits a phone, and the board was not touched to do it

Measured at 360×640 before this: the exercise component was **796px against
587px of usable viewport, and the board was only 330px of it**. The rest was
the control stack — two stacked meters, a reserved verdict panel, a four-part
move-entry form and a standalone hint button, each a full-width block with
20px between them.

The controls compact; the board keeps its size and its touch targets.

| | 390×844 | 360×640 |
|---|---|---|
| exercise component | 799 → **618** *(usable 791 — now fits)* | 796 → **615** *(usable 587)* |
| control stack | 403 → **244** | 403 → **244** |
| board | 333 → **333** | 330 → **330** |
| scroll to reach prev/next | 815 → **618** | 1 079 → **882** |
| page height, tutorial step | 2 431 → **2 219** | 2 491 → **2 279** |

Below 768px the meters, the hint button and *Recommencer* sit on **one dense
row** under the board; the verdict panel, the hint and the move field stay full
width beneath it.

- ⚠️ **360×640 still does not fit one screen — 615 against 587**, and the spec
  bounds it at 660 rather than pretending otherwise. The remaining 28px is one
  short nudge instead of the 209px scroll it was. Closing it would have cost
  either the board's size or the verdict panel's reserved height.
- ⚠️ **It is CSS only.** The row is built with flex `order` from elements that
  are not adjacent in the DOM, so the markup — and therefore the screen-reader
  reading order and the ≥768px layout — is untouched. A JSX restructure would
  have moved the hint button above the verdict panel on desktop too, and
  `mobile-fit.spec.ts` guards that side at a named viewport.
- The verdict panel's reserve shrinks (6.5rem → 5.25rem) because the panel is
  full-page-width on a phone, **not** because reserving stopped mattering.
- ⚠️ **The move-entry help line is clipped until the field has focus, never
  `display: none`** — the field points at it with `aria-describedby`, and a
  clipped element is in the accessibility tree with certainty. The visible
  label stays: hiding it and leaning on the placeholder saves 22px and is the
  trap where the field's only visible name vanishes as you type.
- `main`'s block padding drops 2.5rem → 1.5rem below 768px: 80px of a 640px
  screen, on every page, spent before the reader reaches anything.

#### Fixed — a pre-existing frame bug found on the way

`board-frame.spec.ts` was **already failing on `dev`** — three tests, confirmed
by stashing this session's work and rebuilding.

`updateBounds()` floors the board to a whole number of 8 device pixels so the
squares stay crisp, and pins `cg-container` top-left, so the whole remainder
sat at the right and the bottom. Measured on a tutorial step at 1000px: host
279.44px, board 272px, frame gaps **6.4px left/top against 13.8px right/bottom**.

`.cg-wrap cg-container { inset: 0; margin: auto }` splits the remainder. The
4px tolerance in the spec is untouched — the asymmetry is removed rather than
excused. Safe for hit-testing because Chessground takes `bounds` from the
`cg-board` element itself, which `board-pointer.spec.ts` proves by tapping.

#### Added — every long route ends with a way onward

Trap and exercise detail pages had a back link at the top only, so finishing
one on a phone meant scrolling ~2 300px back up to leave. Both now end with the
same link, from the **same i18n key** as the one at the top.

#### Changed — one resume rule, four journeys

The E5 resolver lived inside `HomePage.astro`, with a near-copy in
`ProgressPage.astro` and a third copy of just the key scheme in
`CoursPage.astro`.

- **`src/lib/journey.ts`** — the only place `tutorial:<slug>`,
  `lesson:<course>:<lesson>:<boardIndex>` and the bare exercise slug are
  written.
- **`ResumeResolver.astro`** — the rule, the inline script, and a declarative
  binding contract.
- **`ResumeCard.astro`** — the card `/cours/`, `/exercices/` and `/progres/`
  show, hidden until there is genuinely something to resume.

Each call site resolves its own journey, and they may legitimately differ: `/`
walks the tutorial then the lessons, `/cours/` the lessons, `/exercices/` the
exercises, `/progres/` all three.

- ⚠️ **The home page is unchanged, and that was the constraint.**
  `tests/e2e/resume.spec.ts` was written FIRST, run green against the old code
  and green against the new. It pins CLS in both branches, that the script
  carries no `type="module"` / `src` / `defer` / `async`, and both directions of
  the dashboard's adaptive swap. Its `journeyOf()` accepts either the old or the
  new data attribute so that **not one assertion had to move** — only the handle
  did.
- ⚠️ **The CLS assertion was verified to have teeth**: deferring the resolver to
  `DOMContentLoaded` in a built `dist/index.html` produced **CLS 0.0057** and
  failed it.
- ⚠️ **The declarative contract has two halves.** Counts and bars are filled
  whether or not there is a step; the link, the title and the un-hiding happen
  only when there is one. That is what lets one contract serve a statistic
  ("2 sur 13", true at zero) and an offer ("Reprendre — La tour", which must not
  appear until it is true).
- ⚠️ **A level and a theme are just journeys**, so the `/progres/` breakdowns are
  extra tables rather than extra logic. `journeys` is a record precisely so one
  component instance resolves all of them with one copy of the script.

#### Changed — `/progres/` says something

It was three bars and an empty-state button. It now carries the resume card,
the three group bars, **exercises by level** and **by theme** (only buckets that
actually contain an exercise — an empty "Avancé — 0 sur 0" is a fact about the
content, not about the reader), and **La suite**: the first three unfinished
steps, as links.

- ⚠️ **Rank and points say "bientôt" and print no number.** Nothing computes
  one. Inventing a figure would be the site telling a student something it does
  not know.
- The empty state is gone as a sentence: with nothing stored the page shows real
  counts at zero and names the first three things to do — server-rendered, so it
  works with no JavaScript. `progress.empty`, `progress.emptyCta`,
  `progress.continue` and `progress.done` were removed with it.
- "La suite" can name a different step from the resume card, and both are right:
  one answers *what is left*, the other *where did you stop* (furthest, not
  earliest).

#### Fixed — `npm run demo` sweeps by repo, not by a port list

**26 orphaned `astro preview --port 4399` processes** for this repo were found
on the machine at the end of the session, one still listening — entirely
outside the 4321-4325 range the script swept, and therefore invisible to every
previous run of it and to every session that "checked the ports".

`scripts/demo.mjs` now asks the real question — *is anything previewing THIS
repo?* — on startup **and on Ctrl+C**, matching the process command line
against the repo path **and** `preview`. Either condition alone is wrong: the
path alone kills `astro dev`, a Playwright run and the editor's TypeScript
server; `preview` alone kills another project's server.

- ⚠️ **The wrapper does not carry the path; the server does.** `npx astro
  preview` shows the repo only as its cwd, which `Win32_Process` does not
  expose, while the process holding the socket is
  `node …/<repo>/…/astro.mjs preview`. The path match targets the one that owns
  the port.
- ⚠️ **The parent is taken too when its own command line mentions `preview`.**
  Without that the wrappers accumulate: one sweep that killed only the servers
  left **13** husks behind.
- PowerShell rather than `wmic`, which is deprecated and gone from recent
  Windows 11 builds — it would fail silently exactly where this matters.

Verified against a live server on port 4477: `killed pid 30452 previewing this
repo on 4477`, and the port was free afterwards.

#### Verification

`npm run test:branch --all` — **446 passed, 0 failed**, 18 skipped (auth, off by
default). Two new spec files: `resume.spec.ts` and `mobile-fit.spec.ts`, both
mapped in `scripts/spec-map.mjs`.

#### ⚠️ The release matrix was NOT green, and this release shipped anyway

Stated plainly because a release note that implied a clean gate would be worse
than the red gate itself.

| run | failed | flaky | passed |
|---|---|---|---|
| 1 | 9 | 12 | 2 190 |
| 2 | 5 | 10 | 2 196 |

**Exactly one failure appears in both runs**: `feel.spec.ts:263` — the
correct-move pulse — on `webkit` and `iphone-13`. Everything else differed
between the two, which is the signature of the documented Windows
browser flakiness (Firefox's `RenderCompositorSWGL` crash appears verbatim in
run 1's log). All of those re-ran clean serially: firefox 90 passed,
iphone-13 43 passed, webkit passed on retry.

The repeating one was **proved pre-existing**, by running both WebKit projects
with the M3-suite `board.css` change reverted:

| | webkit | iphone-13 |
|---|---|---|
| with the change | fail | fail |
| reverted | **fail** | **fail** |

And it is a **test** defect rather than a product one: the same test passes on
WebKit at `--workers=1`, so the pulse is genuinely drawn. Under load both of
its samplers miss it. Logged in BACKLOG.md with the likely cause and the fix to
try — the MutationObserver is probably watching a `cg-board` that Chessground
has since replaced.

Promotion was Seàn's explicit call on that evidence, not an automated pass.

Lighthouse mobile, five routes, on the built site:

| route | Perf | A11y | Best practices | SEO | CLS |
|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 0.000 |
| `/cours/` | 98 | 100 | 100 | 100 | 0.000 |
| `/exercices/` | 100 | 100 | 100 | 100 | 0.000 |
| `/exercices/mat-du-couloir/` | 99 | 100 | 100 | 100 | 0.003 |
| `/progres/` | 100 | 100 | 100 | 100 | 0.000 |

⚠️ **No before-figures are quoted, because no baseline artefact exists in the
repo** — the previous session captured one in conversation and did not write it
down. These are recorded here so the next session has one. The only failing
audit anywhere is `label-content-name-mismatch`, the pre-existing language
switcher issue already in BACKLOG.md; it is zero-weight, which is why
Accessibility still reads 100.

### Changed — the testing policy, because the matrix had become the default

Sessions were running the full five-browser matrix routinely, at **30-45
minutes each**. CLAUDE.md already said feature branches run chromium only; the
rule was not being followed, and one clause explains why.

The old policy required the matrix on **any branch** for changes touching the
board island, the exercise validator, i18n routing or the service worker. It
read as prudence and functioned as a loophole: almost everything on this site
touches one of those four, so the exception became the rule.

**That trigger is removed.** The matrix answers exactly one question — does
this work in Firefox and WebKit — and asking it every session does not make the
answer truer. It runs **once**, at promotion.

Those paths did not lose coverage, they gained precision: `scripts/spec-map.mjs`
selects **seven** spec files for a `BoardSurface.tsx` change, more than any
session ever picked by hand, and runs them in seconds.

#### Added

- **`npm run test:branch`** — chromium, only the specs mapped from what
  actually changed (committed, working-tree and untracked). `--all` runs every
  chromium spec for a sweeping refactor, still on one browser. **This is the
  per-session command.**
- **`npm run test:release`** — the full matrix. Promotion only. It redirects to
  a log and checks the exit code itself, because `npx playwright test | tail`
  reports **tail's** status: a run with 14 failures reads as "196 passed", exit
  0. It also flags a passed count that is not a multiple of 5, which is the
  arithmetic tell that specs never ran on some project.
- **`scripts/spec-map.mjs`** — the ONE path→spec mapping. `quick.mjs` had its
  own copy and `test-branch` would have been a second; the mapping now has one
  home and two readers.

#### Fixed

- **A preview server had been running for 4h28m.** Stopping the `npm run
  preview` wrapper does **not** stop the `astro preview` child that holds the
  port — which is the documented stale-server trap that has already cost real
  debugging time twice, because Playwright's `reuseExistingServer` then skips
  its own build and tests whatever is on disk. The session finish routine now
  requires every long-lived process to be terminated **and the port verified
  free**, with the kill-by-PID recipe beside it.

### Changed — M3: app density on the internal pages (partial, see below)

Direction: `docs/direction/mcc-direction-mobile-app.md` § 3. M1/M2 made the
home page and navigation app-shaped; the internal pages still used the site
layout, and the inconsistency was the first thing visible on a phone.

#### One card, one definition

The card was written **five times** — `CardGrid.card`, `CourseDetailPage.lesson-card`,
`TutorialIndexPage.step`, `Dashboard.dash-card`, `LoginPage.auth-card` — with
drifts between every pair. Two of them had no shadow at all, so a lesson list
and a course list looked like two different sites. `.chip` existed **three**
times with two different paddings.

- **`src/styles/cards.css`** — the one card surface vocabulary: border, radius,
  shadow, hover, press, focus, the stretched link, `.chip`, `.chip-list` and
  the numbered disc. Same bargain `controls.css` struck for buttons — structure
  global, page-specific colour and margins scoped — and for the same reason:
  Astro scoped styles carry an attribute selector and beat any global rule of
  the same class specificity.
- **The card press moved out of `controls.css`.** A card was described across
  two files with neither saying so. A card is a different gesture from a button
  (it starts *raised* and is pushed flat), so it owns its whole vocabulary next
  to its surface; `controls.css` now points here.
- **`NumberedCard.astro`** — `CourseDetailPage.lesson-card` and
  `TutorialIndexPage.step` were pixel-identical copies. Now one component.
- **Cards take the M2 app radius below 768px** and the stationery radius above.
  Moving from the dashboard to `/cours` used to change the shape of every
  object on screen. **Desktop is untouched.**

#### Progress became information rather than decoration

The indexes marked *solved* and nothing else, so a step attempted and not
solved looked identical to one never opened — which is the single most useful
thing an index can tell a returning reader.

- Three states — **not started / in progress / solved** — on `/cours`,
  `/exercices`, `/apprendre-les-bases` and `/cours/[slug]`.
- **`progressState()` / `progressStates()` in `src/lib/progress.ts`**, so
  nothing else learns the storage key. `started` means *attempted* — a move
  judged or a hint opened — which is deliberately the same definition the E5
  "Reprendre" resolver uses for `touched`. If the two diverged, a card could
  say "in progress" for something Reprendre refuses to resume.
- A course card aggregates **every** exercise key in its lessons: solved only
  when all are, started when any is.
- **`ProgressStates.astro`** — one reader of the store for every card type,
  rather than a copy per index. It is a plain module script, **not** `is:inline`:
  the three inline duplications on this site exist because they must run before
  first paint, and this one must not — it fills a row whose height is already
  reserved.
- ⚠️ **The server renders "not started" and means it.** It is true of every
  first-time visitor, so a storage failure degrades to a correct statement
  rather than to a blank. The spec for a broken `localStorage` asserts exactly
  that.
- One full-width column below 768px. `auto-fill` already collapsed at 390px but
  not at 640px, where a large phone in landscape got two ~300px cards.

#### Fixed — a spec that was getting away with the documented anti-pattern

`tutorial.spec.ts` scrolled its board with `scrollIntoViewIfNeeded()` alone.
CLAUDE.md has warned since the board-pointer session that this guarantees only
**partial** visibility, so a tap aimed at an off-screen square is silently
dropped and the board looks dead — `data-ready` true, `data-busy` false,
`data-attempts` stuck at 0, state never leaving `idle`, because no move was ever
produced to judge.

It surfaced on `le-cavalier`, whose solution starts at **g1** — near the bottom
edge of the board and therefore the first square to fall off. The tell that it
was the harness and not the application: `board-pointer.spec.ts` plays the
**same g1-f3 move on the same page** and passed in the same run, because it does
the centring scroll. Both call sites now use `scrollIntoView({ block: 'center' })`.

#### Measured, and NOT yet fixed

The board-fit hazard M3 names is real, and it is the **block** — board plus
tag, controls, move field and verdict — not the squares, which fit easily:

| 390×844 (791px usable) | block | |
|---|---|---|
| lesson demonstration board | 552-691px | fits |
| exercise block | **833px** | 42px over |
| trap replayer block | **895px** | 104px over |

At 360×640 (587px usable) everything except a bare demonstration block
overflows — the exercise block by **241px**, the replayer by **278px**. The
M1 one-line mobile header is also 61px at 390px but **97px at 360px**, where it
wraps to two lines.

**Recorded rather than half-fixed** at the time: the board is 335px of an 833px
block, and compressing the rest is a design decision about what an exercise
shows at once, not a CSS tweak.

#### Closed later in this release

That decision was taken — **compact the controls, leave the board alone** — and
the measurements above are the "before" column of the M3 (suite) table at the
top of v0.7.0. Also closed: the shared resume resolver across four surfaces,
`/progres` substance, and end-of-content navigation clear of the bottom bar.

#### Still open

- **The 360px header wrap** (97px against 61px at 390px). Untouched.
- **The exercise block at 360×640** is 615px against 587px usable — 28px, down
  from 209px. One short nudge rather than a scroll; see the note in the M3
  (suite) section for why the last 28px were not taken.

---

## [0.6.0] — 2026-08-09

The engine difficulty ladder, rebuilt. The three levels were **one opponent
under three names** — measured, not suspected — and weakness now comes from a
**measured blunder frequency** rather than from `Skill Level`.

v0.5.0 decided what the site is on a phone. This one fixes the thing a club
member notices first and fastest: that the computer cannot be beaten. Débutant
is now genuinely a beginner's opponent, and the three levels are a ladder in
the only sense that matters — each one beats the one below it.

The load-bearing finding is that `Skill Level` **cannot** produce a weak
opponent here, because it only ever chooses among the engine's own top
candidates and every search ends in a quiescence pass that resolves all
captures. A dial that never hangs a piece cannot make a beginner's opponent, at
any depth. That is why the fix is a blunder rate and not a re-tune, and why the
numbers below were measured against reference bots instead of chosen.

### Fixed — the computer was unbeatable at every level

Reported by Seàn, who plays chess and had **not won a single game** against
**Débutant**.

It was worse than one bad preset. Measured against two reference opponents, the
three levels that shipped up to v0.5.0 were **one opponent with three names**:

```
debutant      vs greedy   97%      vs novice   100%
intermediaire vs greedy  100%      vs novice    97%
avance        vs greedy  100%      vs novice   100%
```

#### The diagnosis, and why the obvious fix does not work

The presets were applied correctly — `depth` genuinely caps the search, and
`Skill Level` is honoured. The problem is what `Skill Level` *is*:

- **It only ever chooses among the engine's own top candidates**, and every
  Stockfish search — at any depth — ends in a **quiescence search that resolves
  all captures**. No `(skill, depth)` pair will ever hang a piece or miss a free
  one. **"depth 2" is not "sees one move ahead".**
- At the old `skill 0, depth 2` the engine played its top choice in **23 of 24**
  searches of one position — **more deterministic than either higher level**.
  Débutant was the *least* random preset on the ladder.
- `Skill Level Maximum Error` and `Skill Level Probability` at both extremes
  made it *more* deterministic, not less. Not a usable dial.

So weakness now comes from a **deliberate blunder rate**: `blunderChance` on
`EngineLevel`, the probability of playing a uniformly random legal move instead
of the searched one. A beginner needs an opponent that sometimes gives material
away, and that cannot come from a dial that only chooses between good moves.

⚠️ The random move is drawn **from the engine**, via `MultiPV 500` at depth 1
(Stockfish clamps MultiPV to the legal move count, so the reported set *is* the
legal move list — verified against chess.js: 20 from the start position, 31 in
the test position). Importing chess.js here would land it in the engine chunk,
and that chunk exists so a reader who never presses "start" never downloads it.

#### The new presets — measured, not chosen

| Preset | Skill | depth | movetime | blunder | vs `greedy` | vs `novice` |
|---|---|---|---|---|---|---|
| Débutant | 0 | 1 | 50 ms | 40% | 60% | **38%** |
| Intermédiaire | 3 | 4 | 500 ms | 25% | 98% | **65%** |
| Avancé | 14 | 12 | 1500 ms | 0% | 100% | 98% |

Head-to-head, which is what proves the order (both bots saturate at the top):
Avancé beats Intermédiaire **100%**, Intermédiaire beats Débutant **85%**.

Débutant now **loses** to an opponent that merely never hangs a piece.

⚠️ **0.4 is a ceiling, not a dial to turn up.** At 0.5 Débutant fell to 13%, but
half its moves were noise and the games stopped resembling chess. Beatable is
the goal; incoherent is not.

**The UI still names the levels and prints no rating** — these are win rates
against two crude bots, which is evidence of order and beatability, not an Elo.

#### Added

- **`scripts/engine-lab/`** — the measurement harness: `--probe` (what the build
  exposes, and whether skill is applied), `--bots` (validate the yardstick),
  `--verify` (play the shipped presets), `--ladder`, `--sweep`. Not part of
  `npm run build`; nothing calls it automatically.
  ⚠️ `--verify` **parses `LEVELS` out of the TypeScript source** rather than
  keeping its own copy — a lab that measures its own private numbers proves
  nothing about what the reader plays against.
- **`tests/e2e/engine-levels.spec.ts`** — guards the ladder's **order and
  shape**, deliberately **not** the measured values. It reads the table in Node,
  so it costs no engine boot.
- A `play.spec.ts` test that plays five plies at Débutant using **candidate move
  lists** rather than a fixed line, because the replies are now partly random.
  It exists to catch the two ways the new UCI exchange could break invisibly: a
  sweep returning something unplayable, or `MultiPV` leaking at 500.

### Changed

- **`package.json` `version` now tracks the release tags** — it had read `0.2.0`
  since that release, so v0.3.0, v0.4.0 and v0.5.0 all shipped a manifest
  disagreeing with their tag. Set to `0.5.0`, and CLAUDE.md's new **promotion
  routine** makes the bump part of every release commit rather than a
  follow-up, so it cannot drift again.

  ⚠️ The tree tagged `v0.5.0` still reads `0.2.0` and always will — retagging a
  published release would be worse than the inconsistency. The manifest is
  correct from this commit forward, and first *true* at v0.6.0.

#### Notes

- `npm run quick` **refuses** this change: `package.json` is on its FORBIDDEN
  list under "dependencies", and its pattern cannot tell a `version` string
  from a dependency edit. That exclusion is correct and stays — guessing the
  other way is how a dependency change reaches production on a shortened gate.
  Verified instead by content check, full build, and by confirming `dist/`
  built from this branch is byte-identical to the deployed v0.5.0, which had
  just passed the full matrix.

---

## [0.5.0] — 2026-08-09

The mobile release. v0.4.0 decided what the teaching looks like; this one
decides what it *is* on a phone — an app, with a bar at the bottom and a home
screen that knows whether you have started.

Club members will overwhelmingly arrive on a phone, and until now they arrived
at a desktop layout that had been made narrower. The retro menu was designed
for a large screen; at 390px it was a list of links on a dark background, under
a header that already repeated every one of them. That is the format being
wrong rather than the execution, so the answer is a **second layout** — not a
tidier version of the first.

### Highlights

- **A fixed bottom navigation bar** — Accueil, Apprendre, Jouer, Progrès.
  Exactly four entries, ≥48px targets, `aria-current` on the active one, the
  active state carried by a rule as well as by colour, and it **never hides on
  scroll**. Settings is deliberately not among them: it is visited twice and
  then never again, and five targets across 390px is 78px each.
- **A one-line mobile header** — club name, theme, language. The three rows it
  replaces were repeating the menu directly beneath them.
- **An adaptive home dashboard.** One dominant card that reads **"Jouer une
  partie"** before there is any progress and **"Reprendre — <lesson>"** with a
  progress bar once there is, then two tiles, a stats line and the next
  session. It reuses the E5 "Reprendre" resolver unchanged — same journey, same
  furthest-not-earliest rule.
- **`/progres/`** (+ `/en/progres/`) — a local progress view, read from
  `localStorage`, no account required. The bar's fourth entry needs a
  destination, and `/compte/` is not emitted at all while accounts are off.
- **A settings entry in the desktop header**, beside the theme and language
  controls. It was footer-only, which meant scrolling to the bottom of whatever
  page you were on.
- **Card craft** — full-width cards, a themed app radius, a real shadow,
  left-aligned text, hierarchy by size, and E1's press feedback extended from
  buttons to cards.

### Three fixes, one of which the whole suite passed

- **A contrast regression** (Lighthouse accessibility 100 → 96): text over the
  primary fill carried `opacity: 0.9`, which blends it toward the fill and
  drops an audited token pair to **4.42:1**. The tokens were right; the
  rendering weakened them, and **`check-contrast.mjs` cannot see an alpha
  applied on top of a pair it has already proved.** It hid from the specs
  because every axe test **seeded progress**, and the resolver removes that
  element once it resolves — so the never-seeded state was the one state nobody
  audited. axe now runs on both branches, and in dark mode.
- **The fixed bar could cover whatever was scrolled into view** — an `#anchor`
  link, a Tab to a control near the bottom, a `scrollIntoView` on a form field.
  The footer padding only stops it covering the *end of the document*;
  `scroll-padding-block-end` on the root below 768px covers the rest. Found by
  two settings specs that passed on a phone before the bar existed.
- **Specs that assert desktop chrome now name their viewport.** The phone
  projects run every spec, so a block asserting the grouped header was asserting
  it at 390px, where it deliberately no longer renders. Running only chromium
  hid this completely: it surfaced as **37 failures** the first time the phone
  projects ran.

### Verification

Gate green: `check-content.mjs`, `check-contrast.mjs` (291 assertions), the
build, and the full five-project matrix run the documented way — **four stable
projects together plus WebKit serially**, because the Windows WebKit build
crashes under the five-project fan-out for reasons that belong to the browser
and not to the site.

`tests/e2e/mobile-app.spec.ts` pins **both sides of the 768px breakpoint**, at
767px and 768px explicitly. The divergence is the feature; a future session
tidying the two layouts into one finds out there.

---

### M1 + M2 — the site becomes an app on a phone

Direction: `docs/direction/mcc-direction-mobile-app.md`, which **supersedes the
E5 retro menu on mobile only**. Desktop keeps the retro menu and the grouped
header, and that divergence is now a tested regression guard.

On a phone the header ate a third of the screen, the centred menu below it
repeated the same entries, and five entries of identical weight gave no
hierarchy — two stacked menus before any useful content. The retro menu was
designed for a large screen; at 390px it was a list of links on a dark
background.

#### Added

- **A fixed bottom navigation bar** with exactly four entries — Accueil,
  Apprendre, Jouer, Progrès — ≥48px targets, `aria-current` on the active one,
  `env(safe-area-inset-bottom)` respected, and it never hides on scroll.
  ⚠️ **Settings is deliberately not one of them**: it is visited twice and then
  never again, and five targets across 390px is 78px each.
- **A one-line mobile header**: club name, theme, language. Nothing else.
- **The home page becomes a dashboard on mobile.** One dominant card that
  adapts — "Jouer une partie" with no progress, "Reprendre — <lesson>" with a
  progress bar once there is some — then two tiles, a stats line and the next
  session. It reuses the E5 resolver unchanged.
- **`/progres/`** (+ `/en/progres/`) — a local progress view read from
  `localStorage`. The bar's fourth entry needs a destination and `/compte/` is
  not emitted at all while accounts are off.
- **A settings entry in the desktop header**, beside the theme and language
  controls. It was footer-only, which meant scrolling to the bottom of whatever
  page you were on.
- `tests/e2e/mobile-app.spec.ts` — the bar, the header, both dashboard
  branches, the progress view, and **both sides of the 768px breakpoint**
  (767px and 768px explicitly), so a future "unification" fails there.

#### Changed

- Card craft on the dashboard: full-width, generous radius, real shadow,
  **left-aligned** text, hierarchy by size, and E1's press feedback applied to
  cards rather than only to buttons.
- `--radius-app` / `--mcc-radius-app` — a separate, **themed** radius for the
  app surfaces. Terminal squares it off; rounded corners on a phosphor terminal
  are the one detail that would say "phone app".
- Two `main-menu.spec.ts` tests that asserted the menu's behaviour **at 390px**
  now run at 900px, because below 768px the menu deliberately no longer renders.
  Their mobile counterparts moved to the new spec.
- **Specs that assert desktop chrome now say which viewport they mean.** The
  phone projects run every spec, so `nav-coords`' grouped-navigation block,
  `motion`'s home-CTA block, `smoke`'s home-renders block and all of
  `main-menu` set a desktop viewport. Running only chromium hid this: it
  surfaced as 37 failures the first time the phone projects ran.
- `scroll-padding-block-end` on the root below 768px. The footer padding stops
  the fixed bar covering the **end of the document**; this stops it covering
  whatever anything **scrolls into view** — an `#anchor` link, Tab-ing to a
  control near the bottom, `scrollIntoView` on a form field. Found by two
  settings specs that passed on a phone before the bar existed: a theme radio
  was scrolled flush to the bottom edge and the tap landed on the bar.
- The lazy-hydration spec now **asserts its own premise**. It put the board
  below the fold at 380×620; M1 cut the mobile header from three rows to one,
  the board moved up into view, and the test failed for the right reason about
  the wrong thing. A test whose setup has stopped creating the condition it
  tests is worse than a failing one — it goes green while checking nothing.

#### Fixed

- **An accessibility regression the whole suite passed** (Lighthouse a11y
  100 → 96): text over the primary fill carried `opacity: 0.9`, which blends it
  toward the background and drops an audited token pair to 4.42:1.
  ⚠️ **`check-contrast.mjs` cannot see this** — it proves the token pair, and
  the pair was correct; the CSS weakened the rendering. Same class as the
  ambient-layer ceiling. Hierarchy is now size, weight and letter-spacing.

  The specs missed it because every axe test **seeded progress**, and the
  resolver removes that element when it resolves — the never-seeded state was
  the one nobody audited. axe now runs on both branches and in dark mode.

#### Known, and not introduced here

- The language switcher fails WCAG 2.5.3 (Label in Name): it shows "English"
  but its accessible name is "Changer de langue", so voice control cannot reach
  it by its visible text. Present on `dev` before this work, zero-weight in
  Lighthouse's score. Recorded in BACKLOG.md rather than fixed in an unrelated
  session.

---

## [0.4.0] — 2026-08-08

The appearance release. v0.3.0 taught; this one decides what the teaching looks
like — and gives the reader the choice. The home page becomes a main menu, the
palette becomes four coherent themes with their own pieces and typefaces, and a
defect that made the site unusable by tapping on a phone is fixed.

### Highlights

- **A retro main menu on the home page** (E5) — club title, a centred stack, a
  small knight marking the active line, arrow-key navigation. **"Reprendre"**
  appears only when there is progress to resume, and resumes at the *furthest*
  step you reached, not the first gap you skipped.
- **Four complete themes** (E6/E7) — **Bois**, **Marbre**, **Souiri** and
  **Terminal**. Each brings its own **piece set**, **heading typeface** and
  **default board**, in a full light *and* dark palette. Light/dark lives inside
  a theme rather than beside it, so all eight combinations ship and all eight
  are audited.
- **A sixth board preset, `phosphore`** — phosphor green on black, so Terminal
  has an honest board rather than a borrowed one.
- **A three-level settings hierarchy** — theme → board → your own colours, in
  decreasing prominence. One decision for almost everyone; the rest is one
  gesture away.
- **Reading craft** — a drop cap on the first paragraph of a lesson, chess
  notation set as a **visual object** (fixed pitch, light ground, a hairline),
  French guillemets with the narrow no-break space, a 65-character measure and
  subheads that breathe.
- **A touch fix** — the move input no longer steals focus after a tapped move.
  On a phone that was opening the virtual keyboard and scrolling the board out
  of view, which made playing by tapping unusable.
- **A quick-change path** — `npm run quick`, so a typo no longer costs the full
  release gate. It shortens verification only; promotion still needs approval.

### Three pre-existing bugs fixed on the way

None was introduced by this release; all three had been shipping quietly.

- The exercise **move input stole focus** when its lazily-imported chess.js
  chunk landed, scrolling the reader down and swallowing the replayer's arrow
  keys on lesson pages.
- Lesson `<code>` referenced **`--font-mono`, a token that has never existed**,
  so every inline notation in every lesson rendered in the body font instead of
  monospace. An unknown custom property invalidates the declaration silently.
- The solved-state **axe check sampled the badge mid-fade**, because
  `data-state="solved"` flips at the start of the two-beat animation and
  Playwright counts an `opacity: 0` element as visible.

### Verification

`check-contrast.mjs` grew from 67 assertions to **291** — 4 themes × 2 modes ×
27 pairs, 6 board presets against all 8 theme pages, plus a new **piece-on-board
legibility audit**. That audit exists because the first draft of Terminal paired
a monochrome piece set with a near-black board and lost half the position at
1.03:1, with every other check green.

The full matrix is run as **four stable projects together plus WebKit
serially** — the Windows WebKit build hangs under the full five-project
fan-out, which is a browser problem rather than an application one.

---

### Touch focus, and a quick-change path

#### Fixed

- **Playing by tapping was unusable on a phone.** After every move focus
  returned to the move-entry field, which opens the virtual keyboard, which
  shrinks the visual viewport, which scrolls the board out of view. Found by
  Seàn on a real phone; the automated suite could not have found it, because a
  headless browser has no soft keyboard.

  The a11y session specified "after the opponent reply, focus returns to the
  input" — correct for a keyboard user. The brief was incomplete, not the
  implementation.

  **Focus now follows the modality of the MOVE, not the device**
  (`src/components/board/useMoveSource.ts`). Deliberately not a user-agent
  sniff or a `pointer: coarse` query, both of which get it backwards: a phone
  user with a Bluetooth keyboard who *types* still gets the field back, and a
  desktop user who *drags* does not. Applies everywhere `MoveInput` appears —
  tutorial steps, course lessons, `/exercices/`, `/jouer/`.

  Two related cases fixed with it: tapping **"Commencer"** on `/jouer/` used to
  focus the field before the reader had seen the position (game start is not a
  move, so the modality of the *activation* decides), and `focus()` now passes
  `preventScroll` as a second line of defence.

  The field is never hidden or disabled on touch — some students will prefer
  typing, and it is the accessible path. It just stops grabbing focus unasked.

#### Added

- **A quick-change path** — `npm run quick`, and a section in CLAUDE.md. A typo
  used to cost the full release gate: five browser projects, half an hour. That
  is a tax that discourages fixing small things, and unfixed small things are
  what a visitor sees.

  ⚠️ It shortens **verification only**. `dev` → `main` still needs Seàn.

  `scripts/quick.mjs` **refuses rather than advises**: it diffs the branch
  against `dev` and exits non-zero naming any file that is out of bounds, with
  the reason. Enforcing the exclusion list in code rather than in a document is
  the only version that survives a Friday afternoon. It then runs the content
  check, the build (which carries `check-contrast` as its own first step), and
  **only the chromium specs covering what changed**.

- `tests/e2e/touch-focus.spec.ts` — the tapped-move rule on desktop and both
  mobile projects, including the scroll assertion, which is the closest a
  headless run gets to the symptom. It states which of its tests actually fail
  on the old code, verified by rebuilding without the fix rather than assumed.
- `docs/MANUAL-TESTS.md` gains "play a whole exercise on a phone by tapping
  only" and an "after a quick change lands on `main`" list.

### E6 + E7 — four complete themes, and typography that follows them

Direction: `docs/direction/mcc-direction-esthetique-addendum.md` §§ E6, E7.
Combined into one session deliberately: both touch the same tokens, and split
they would have done the same work twice.

**Bois**, **Marbre**, **Souiri** and **Terminal**. A theme sets the background,
the surfaces, the heading typeface, the default board preset and the piece set
— one decision, four coherent moods.

#### Added

- **Four site themes**, each with a full light AND dark palette. Light/dark
  lives *inside* a theme ("Bois de jour", "Bois de nuit") rather than as a
  second axis, so the existing toggle now switches within the active theme.
  All eight combinations ship and all eight are audited.
- **`/parametres/` restructured into three levels** of decreasing prominence:
  Thème (four live previews) → Apparence (light/dark) → **Personnaliser**, one
  collapsed disclosure holding the board presets *and* the reader's own
  colours. Twenty-four equivalent swatches is not more choice; it is the same
  choice made unusable.
- **Theme previews painted by the themes' own rules.** Each tile is
  `.theme-preview .theme-<id>`, and `site-themes.css` scopes every block to
  `:is(:root, .theme-preview)` — so a tile shows the real tokens. There is no
  second copy of any colour, and a preview that looks wrong means the *theme*
  is wrong. Same trick the preset swatches already used.
- **Four piece sets**, one per theme: merida (Bois), kiwen-suwi (Marbre),
  chessnut (Souiri), cburnett (Terminal). Vendored under `vendor/pieces/`
  with provenance and licences recorded, and credited on `/mentions-legales/`.
- **`check-contrast.mjs` audits each theme's piece set against the board that
  theme uses.** The first draft of Terminal paired a monochrome set with the
  near-black phosphor board and **lost half the position** — 1.03:1, no error,
  every existing assertion green, found by looking at a screenshot. The rule is
  "at least one of the piece's two inks clears 3:1", because a white piece on a
  light square is always low-contrast and it is the outline that separates it.
  Verified to fail on the old pairing.
- **A sixth board preset, `phosphore`** — phosphor green on black. Terminal had
  no honest default among the five, and a cream board inside a terminal is the
  single thing that would have made that theme read as a background swap.
- **Three heading typefaces** (Playfair Display, Outfit, JetBrains Mono)
  alongside Fraunces, self-hosted and subset by the existing script. **A theme
  loads only its own.**
- **Reading craft**: a 65-character measure, generous leading, subheads that
  breathe, a drop cap on the first paragraph of a lesson, small caps for
  mentions, French guillemets with the narrow no-break space, and chess
  notation set as a small badge — fixed pitch, light ground, a hairline.
- **CSS-generated textures** per theme: wood grain, marble veining, a zellige
  lattice, terminal scanlines. Gradients, never images — no request, nothing to
  precache, and they scale to any viewport for free.
- `tests/e2e/themes.spec.ts` — 51 specs covering the themes, the pin rule, the
  migration, the no-flash path, what is actually fetched, and the E7 craft.

#### Changed

- **`boardTheme` is now optional, and absence is a real state.** Absent means
  "follow the theme"; present means the reader **pinned** a preset — and a pin
  **survives a theme change**. Level 2 exists precisely for a player with a
  board preference independent of the site's mood, so a theme change silently
  destroying it would destroy the only preference that level is for. "Suivre le
  thème" is the escape hatch, named and offered first.
- **The v1 migration is lossless by construction.** The key is unchanged
  (`mcc:theme:v1`) because the shape is unchanged: a field was added and a
  field became optional. Every pre-E6 record carries a `boardTheme`, so every
  returning reader is pinned to exactly the board they last saw, on the Bois
  palette that record was written under.
- **`check-contrast.mjs` audits the whole matrix**: 4 themes × 2 modes × 6
  presets, **275 assertions, up from 67**. It resolves each theme through the
  same cascade the browser does. Default output is now one line per
  combination; `--verbose` prints the full table.
- **`.text-brass` resolves `--mcc-accent-text`** instead of naming a scale step.
  Two hardcoded steps became eight the moment there were four themes; the
  semantic token already means "the accent, at whichever step clears AA against
  *this* surface", so the rule is one line and follows themes not yet written.
- `::selection` and the level-badge fills are themed tokens rather than raw
  scale steps — a brass selection was a visible foreign object on a phosphor
  page.
- **Piece artwork is one stylesheet per set**, fetched only on pages that
  declare a board and only for the active theme. Measured: bundling all four
  into the island chunk cost ~32 KB brotli on every board page to use ~9 KB.
  Percent-encoded rather than base64 — half the transfer for the same pixels.
- **The heading font is preloaded by the head script**, for the active theme
  only. A preload fetches unconditionally, so the previous static Fraunces
  preload would now make three themes out of four download two faces and use
  one. Inter stays static: every theme uses it.
- The service worker precaches **only the default theme's** piece set and
  heading face; the rest are runtime-cached, the same argument as the engine.
- The inline theme script was trimmed from 8.4 KB to 5.7 KB per page. An
  `is:inline` script ships verbatim, comments and all, in all 84 documents —
  the rationale moved to BaseLayout's frontmatter, which is compiled away.
- `.prose` typography moved out of `LessonPage`'s scoped `<style>` into
  `src/styles/typography.css`. Scoped rules carry an attribute selector and
  beat any global rule of the same class specificity, so the shared craft
  styles could not have extended them.

#### Fixed

- **Lesson `<code>` has been rendering in Inter, not monospace, since lessons
  landed.** The rule read `var(--font-mono)` — a token this project has never
  had. An unknown custom property invalidates the whole declaration silently,
  so every inline notation in every lesson quietly lost its face. Exactly the
  `--mcc-border` failure again. The token is `--font-notation`.
- **The exercise's move input stole focus a moment after page load.**
  `MoveInput` deliberately never focuses on mount — "stealing focus on page load
  would drag a reader past the board and the hint they had not read yet" — but
  `disabled` was in the effect's dependency array, and it flips from true to
  false when the lazily-imported chess.js chunk lands. So the effect re-ran with
  `firstRender` already spent and the field focused itself anyway, scrolling the
  reader down to it. On a lesson page with a replayer above the exercise it also
  swallowed the replayer's arrow keys, because `ReplayView`'s document handler
  ignores keys aimed at an `INPUT` by design.

  Found by chasing a "flaky" spec: whether the chunk won the race against the
  first keypress depended on machine load, so it failed in full-suite runs and
  passed every time in isolation. Not an E6 regression — it has been there since
  the lazy chunk was introduced.
- `ReplayView` now sets `data-keys="bound"` in the same effect that binds its
  document key listener, so a spec can wait on the handler rather than on
  `<cg-board>` — which belongs to a child component and proves nothing about it.
- The correct-move pulse spec gained a second sampler that reads a
  `MutationObserver`'s **records** alongside the rAF loop. rAF is starved under
  load on WebKit, which had been producing intermittent "the pulse never
  happened" failures in full-matrix runs. Reading records is not the pattern the
  existing rule warns against — that one re-queries the live DOM.

#### Deliberately not done

- **Most of Lichess's piece sets could not be used.** The majority are
  `CC BY-NC-SA`, "freeware", or unlicensed; the GPL forbids the added
  restrictions, so they are undistributable here regardless of quality. `alpha`
  — named in the brief — is "free for personal non commercial use" and was
  **dropped**. The AGPL sets (`letter`, `pirouetti`, `pixel`) were also
  declined: not a conflict, but §13 adds an obligation the repo does not carry,
  and taking it on is a project-level decision. `pixel` would have suited
  Terminal; it is left on the table rather than quietly adopted.
- **Old-style figures are declared but inert on body text.** Inter ships no
  `onum`. The declaration is harmless, correct the moment a face that has them
  is used, and a spec *reports* whether it took effect so the comment saying so
  can never quietly become false.

### E5 — the home page becomes a main menu

Direction: `docs/direction/mcc-direction-esthetique-addendum.md` § E5. A 1990s
PC-chess-game main menu — club title, a centred vertical stack, a small knight
marking the active line. CSS and a roving tabindex; no new dependency, no island.

#### Added

- **The main menu**, both locales: Reprendre (conditional), Jouer, Apprendre,
  S'entraîner, Pièges d'ouverture, Le club. Arrow keys move the selection, Home
  and End jump, Enter follows the link, and the selection wraps like a game menu.
- **"Reprendre"** — the detail that makes it feel like a game. It appears only
  when there is progress in `mcc:progress:v1`, and resolves to the **furthest**
  incomplete step: the tutorial if it was started, otherwise the last course
  lesson touched. A game's Continue resumes where you stopped, not at the first
  gap you skipped — both branches have a spec.
- **A descriptive section below the menu** (`#a-propos`) carrying an `<h2>`, real
  prose and a start-here button, plus an explicit meta description. The menu owns
  the first screen; this is what Google and a parent actually read.
- `tests/e2e/main-menu.spec.ts` — 22 specs.

#### Changed

- **The home page's two CTA buttons and the beginner line are gone**, replaced by
  the menu. The three pillar cards stay, below the fold.
- The meta description on `/` is now set explicitly instead of falling back to
  the site-wide one — six words of menu do not index.

#### Notes

- ⚠️ **The menu's labels are the NAV's labels**, from the same `nav.*` keys. The
  spec reads the header's own labels off the page and requires the menu's to be a
  subset, so a rename on one side fails there rather than shipping two names for
  one destination. A side effect: an unscoped `getByRole('link', …)` on the home
  page now matches two elements and fails strict mode. That collision is the
  guarantee working; `smoke.spec.ts` scopes to `.site-nav`.
- ⚠️ **With no JavaScript there are five entries, not six.** "Reprendre" is a
  claim about stored progress, which cannot be read without JS; rendering it
  anyway would assert something we do not know. The five standing entries are
  real links and all work. The roving tabindex is applied *by* the script, so a
  no-JS reader gets the ordinary tab order rather than five links stranded behind
  `tabindex="-1"`.
- ⚠️ **The resolver is `is:inline` and duplicates the progress key** — the third
  such duplication after the theme head script and `AccountButton`, for the same
  reason. A deferred module script would show "Reprendre" one frame late and push
  a vertically-centred menu down under the reader's eyes. Measured: CLS 0.000
  before and after.
- `feel.spec.ts` retargeted from `home-cta-play` to the new below-fold button:
  the former is now a menu entry rather than a button, and has neither a press
  nor a shadow to assert.

#### Performance

Lighthouse mobile on `/`, median of three, before → after: **Performance
100 → 100**, Accessibility 100 → 100, SEO 100 → 100. Speed Index 1108ms →
1073ms, LCP 1663 → 1662, TBT 0, **CLS 0.000 → 0.000**.

---

## [0.3.0] — 2026-08-07

The teaching release. v0.2.0 had a board, a handful of traps and three
exercises; this one has a course structure, a path in for someone who has never
played, and a site that answers when you touch it.

### Accounts are built, and switched OFF

`PUBLIC_AUTH_ENABLED` defaults to `false`, and **off means not built**: the
account routes are not emitted into `dist/`, no Supabase project ref appears in
any bundle, and `@supabase/supabase-js` is not shipped at all. The header
carries no sign-in control — not a hidden one, not a disabled one.

Nothing is deleted. The whole v2-S1 stack, its specs and its migrations stay
exactly where they are; **v2-S3 sets the variable to `true` and it returns
unchanged.** The reason for the delay is that there is nothing to sync yet: an
account today is a door into an empty room, and opening it would ask parents to
hand over a child's email address in exchange for nothing.

The database stays at migrations 0001/0002 — schema ahead of the site, which is
the safe ordering.

### Added

- **The beginner tutorial** — `/apprendre-les-bases/`, 13 guided steps for
  someone who has never played, sitting below `debutant`. It adds no new board
  and no new mode: exercise mode already lights every legal destination, so the
  board that demonstrates a rule is the board that checks it.
- **Course 1 — "Bien ouvrir une partie"**, six lessons in both languages, and
  with it the per-locale Markdown lesson bodies deferred since Session 2.
- **Course 2 — "Les mats élémentaires"**, six lessons in both languages: the
  back-rank, the ladder, queen-and-king, rook-and-king, Philidor's legacy and
  Boden's mate. Introduces still diagrams as a board kind.
- **Grouped navigation** — seven flat links became three disclosure groups
  (Apprendre / S'entraîner / Le club) plus Accueil. Built as the WAI disclosure
  pattern, not `role="menu"`; opens on click at every viewport, because the
  phone is the primary device and hover does not exist there.
- **Board affordance labels** — every board now says whether you may touch it:
  *Démonstration — utilise les flèches* or *À toi de jouer*, as real text, plus
  a named full-size control to start a demonstration.
- **E1 motion and feedback** — three motion families (Réponse / Transition /
  Ambiance) with `src/lib/motion.ts` as the single source; a real button press;
  a brief accent pulse on the destination square of a correct move; a reason on
  a refused move; the solve landing in two beats; a second ambient layer.

### Changed

- **Board coordinates moved into an outer gutter**, off the squares. Readable on
  a desktop before, poor on a phone — small text over a wood-toned square,
  competing with the piece standing on it. Costs about 4.5% of the board on a
  390px phone, which was judged worth it.
- The board frame now encloses the whole component, coordinates included.
- Scroll reveals, the replay step and every other duration moved onto the motion
  vocabulary; nothing now sits between 180ms and 250ms.

### Fixed

- **Course cards were not clickable.** They had no `href` at all.
- **`--mcc-border` never existed** — twelve occurrences across seven files had
  been rendering borderless, because an unknown custom property invalidates the
  whole `border` shorthand and the width computes to zero.
- **Buttons were ~40px tall**, under the 44px touch target, on every phone.
- **Reduced motion did not stop the far ambient layer** — a two-class selector
  in an `@supports` block beat the one-class off-switch.
- **`parseReplay` discarded the `[FEN]` header on move-less PGNs**, so every
  still diagram silently rendered the standard opening position.
- **`import.meta.env['X']` shipped the entire env object**, anon key included —
  found in the build that was meant to prove accounts were disabled. Every read
  is now dot access, and `src/env.d.ts` exists so it type-checks.
- **216 KB of unreachable `@supabase/supabase-js` was still being bundled and
  precached** in the disabled build, because Astro collects a page's scripts
  from the module graph rather than from what renders.

### Known gaps

- Course 3 is referenced by course 2's last lesson and is not written.
- The FR pedagogy of the tutorial and both courses is machine-verified for chess
  legality only. **A human has not reviewed the teaching**, and lesson 5 of
  course 1 has English that no human has read. Tracked in BACKLOG.md.
- `onlyMove: false` still cannot accept a winning alternative; the engine-backed
  validator is the remaining half of that rule.

---

### Session detail

Everything above, session by session, with the reasoning behind anything
surprising. Kept in full rather than summarised: the "why" is the part that is
expensive to recover later.

### E1 — motion vocabulary and action feedback

First session of the aesthetic rework. The direction, approved by Seàn and now
in `docs/direction/mcc-direction-esthetique.md`: **the site should feel like a
game because it RESPONDS, not because it is dressed up.** This session is the
feel layer only — progression (E3) and vocabulary/atmosphere (E4) come later.

#### Added

- **Three motion families**, with `src/lib/motion.ts` extended from "the board
  and pacing numbers" into the single source for every duration on the site:
  **Réponse** (120–180ms, fast-out — what follows a click), **Transition**
  (250–350ms, gentle — a visible state change), **Ambiance** (4–20s, linear
  loop — background drift only).
- **`src/styles/controls.css`** — the press, in one place. A button now moves
  toward the page and its shadow closes up, like a key; cards settle flat.
- **A reason on a refused move.** Under `onlyMove: true` the verdict now carries
  *"Ce coup est légal, mais il ne fait pas ce qu'on cherche ici."* / *"That move
  is legal, but it isn't what we're looking for here."* Failure must inform: a
  beginner who cannot tell "illegal" from "not the point" learns the wrong
  lesson from the same red text. **It counts exactly the same attempt** — the
  `onlyMove` rule is that the two verdicts differ in wording only, and a spec
  asserts the count and that the two panels stay the same shape.
- **A correct-move pulse** — one Transition, one square, no loop, exercise mode
  only. Uses Chessground's own `highlight.custom` rather than an overlay, so the
  square is located by the board including after a flip. **Play mode
  deliberately does not use it**: there is no "correct" there.
- **A second ambient layer** — queen, knight and a second pawn, drifting a third
  as far over a longer cycle. Depth comes from the *rate*, not the period.
- `tests/e2e/feel.spec.ts` — 23 specs covering all of the above.

#### Changed

- **The solve lands in two beats.** The frame settles, *then* the badge arrives
  one Transition later. It was a single 900ms block in which everything happened
  at once, which read as "a thing appeared" rather than as an event with a
  shape. The beat of stillness between them is the whole effect. Still no
  confetti — precision is the reward, not visual noise.
- **`REPLAY_ANIMATION_MS` 200 → 180.** 200ms sat squarely inside the forbidden
  180–250ms gap; it was the clearest thing the audit turned up. Navigation is
  still faster than gameplay (250ms), which is the relationship that mattered.
- **Ambient drift 47–71s → 13–20s.** The old periods were slow enough that a
  reader saw no motion at all in their first five seconds: the layer was paying
  its full cost and delivering nothing.
- **Scroll reveals 600ms → 300ms** (Transition). `--duration-slow` fitted no
  family and is gone; `--duration-fast`/`--duration-base`/`--ease-soft` were
  renamed to say which family they are.
- **The shake and the solve are spelled as arithmetic on a family constant**
  (`SHAKE_MS = RESPONSE_MS * 4 + 20`, `calc(var(--motion-response) * 4)`), so a
  composite cannot drift into being a fourth family.
- Nav panels fade and drop in on a Transition; the chevron answers on a Réponse.
- The hint reveal and the verdict text are on the Transition family.

#### Fixed

- ⚠️ **Reduced motion did not stop the far ambient layer.** The
  `@supports (animation-timeline: scroll())` block sets `animation-name` through
  `.layer-far .piece` — two classes — so the single-class `.piece { animation:
  none }` off-switch **lost the specificity fight**, and a reader who had asked
  for stillness got three drifting pieces. The near layer was unaffected, which
  is exactly why an eyeball would not have caught it. Found by the spec written
  for it, in the same session that introduced it.
- ⚠️ **Buttons were ~40px tall, under the 44px touch target, on every phone.**
  `.btn-primary`/`.btn-ghost` were defined **seven times** across page
  components' scoped `<style>` blocks, and nothing measured any of them. The
  structure is now in `controls.css` with `min-height: 2.75rem`, and
  `feel.spec.ts` measures every button on three routes. Pre-existing; found
  while working out where the press could live.

#### Notes — the audit, and what did not fit a family

Three kinds of duration legitimately fit no family, and are documented as
exceptions rather than given a fourth band:

- **Pacing** — the engine's thinking floor (500–800ms) and the scripted
  opponent's reply. Nothing *moves*; they are a wait before motion starts, with
  no curve.
- **Offsets** — the 60ms reveal stagger, and the ambient layer's negative
  `animation-delay`s (−3s to −30s). A delay is *when* a duration starts.
- **Composites** — the shake (4 × Réponse) and the two-beat solve. Now spelled
  as arithmetic rather than as new numbers.

Nothing else was left outside the vocabulary. `feel.spec.ts` sweeps every
element on three routes and fails on any computed duration inside the 180–250ms
gap, so this is enforced rather than asserted.

#### Performance

Lighthouse mobile on `/`, median of three, before → after:
**Performance 100 → 100**, Accessibility 100 → 100, SEO 100 → 100.
Speed Index 1069ms → 1076ms, LCP 1662 → 1663, TBT 0, CLS 0. The faster ambient
motion did not cost the Speed Index that was budgeted for — at 0.055 opacity the
drift is below what the metric resolves.

#### Decisions recorded (see CLAUDE.md → Motion)

- Nav labels stay functional; evocative names go on **page titles only**, in E4.
- Ranks will be Pion → Cavalier → Fou → Tour → Dame (E3).
- **No daily or consecutive-day streak** — the club meets weekly, so a daily
  streak would punish the normal rhythm of the people it is for. Session
  streaks only (E3).
- Sound is synthesised via Web Audio and off by default (E2).

### Course 2 — "Les mats élémentaires"

Six lessons on the basic checkmates, both locales. Authored brief now lives in
`docs/content-batches/`.

#### Added

- `/cours/les-mats-elementaires/` — back-rank, ladder, queen-and-king,
  rook-and-king, smothered mate (Philidor's legacy) and Boden's mate
- **Still diagrams** — a new `position` board kind, rendered as a move-less
  replay. Batch 1 had to convert its two diagrams into short replays that
  *reached* them; batch 2's are terminal states (a stalemate, a finished mate)
  that no legal line arrives at, so they had to be shown as they are
- `docs/content-batches/` — the authored briefs are the provenance of the
  content and belong in the repo

#### Fixed

- ⚠️ **`parseReplay` discarded the `[FEN]` header when a PGN had no moves.**
  `moves[0]?.before ?? new Chess().fen()` — with zero moves there is no
  `moves[0]`, so every still diagram silently rendered the **standard opening
  position**, 32 pieces in their starting squares. It looks like a chessboard,
  so only a piece count catches it. Now falls back to `game.fen()`, which is the
  SetUp position in both cases. A spec asserts a diagram has fewer than twelve
  pieces.

#### Notes — two errors in the brief, both corrected

- **Lesson 5's PGN could not be played.** The start FEN already had the white
  queen on b3, so `1. Qb3+` — the queen moving *to* b3 — was impossible and
  chess.js rejected the whole line. The queen starts on **d1** instead, from
  which the full nine-ply Philidor's legacy is legal and ends in checkmate.
- **Lesson 4's diagram was an impossible position.** It showed a finished mate
  with **White** to move, i.e. with Black in check on Black's opponent's turn —
  unreachable in a real game, and chess.js accepts it silently. Flipped to Black
  to move, it is a genuine checkmate, which is what the copy describes.
  `check-content.mjs` now rejects any `position` board whose side-not-to-move is
  in check; verified to fail on the original FEN.
- All six `onlyMove: true` positions were checked for mate uniqueness and all
  six are genuinely unique. **None had to be flipped.**
- Both replayers were stepped through move by move: every comment lands on the
  move it describes. The plies in the brief were already 0-indexed and correct —
  batch 1's off-by-one did not recur.

---

### The board frame encloses the whole component again

#### Fixed

- **The gold frame was drawn on the playing surface, not on the component.** It
  had always been on `.mcc-board-host`, which was correct until the coordinates
  moved into gutters living in `.mcc-board`'s padding — outside the host. The
  frame then enclosed the squares and excluded both gutters.

  Measured rather than eyeballed: the frame was inset 18.4px on the left and
  bottom, cut across the rank labels, left the file labels 19px below it, and
  overhung the component's right edge by exactly **6px** — its own 2×3px border,
  added outside a content box the left padding had already narrowed.

  The frame now sits on `.mcc-board`, the box that contains everything the
  component draws. Padding is uniform on all four sides plus the gutter on the
  two sides that carry coordinates: without the uniform part the rank labels sat
  flush against the frame while the opposite side had a full gutter of space —
  enclosed, but visibly off-centre. Gaps now agree within ~1.4px, which is
  sub-pixel rounding of an 8-square grid.

#### Notes

- The new spec asserts the surface **and** both coordinate tracks lie inside the
  frame, and that the four gaps agree — in idle, refused and solved states, at
  two sizes. It deliberately does **not** assert that a border exists, which
  would have passed throughout the bug. **Verified to fail on the old geometry**
  before being kept.
- CSS only — `BoardSurface.tsx` untouched, so the full-matrix trigger did not
  fire. Chromium (240 passed) plus iPhone 13 (239 passed) were run, one project
  at a time.

---

### Telling a demonstration board from one you play on

#### Added

- **Every board now carries a tag**: *Démonstration — utilise les flèches* or
  *À toi de jouer*. The exercise board takes the visual weight (accent border,
  accent text, filled dot); the demonstration stays a quiet hairline. Real text
  in both cases, so a screen reader can answer "may I move these pieces?" —
  which is exactly the question the change exists to settle.
- **A named launch control on the replayer** — *Lancer la démonstration*,
  filled, ≥44px — shown until the first move, then it disappears. Four small
  glyph buttons did not read as "press me": the site's own author reached for
  the pieces instead.

#### Fixed

- ⚠️ **`--mcc-border` has never existed, and had silently removed twelve
  borders.** The tokens are `--mcc-border-subtle` / `--mcc-border-strong`. An
  unknown custom property invalidates the whole `border: 2px solid var(...)`
  shorthand, so `border-style` falls back to `none` and the width computes to
  0px — no error, no warning, no border. The home pillars, tutorial cards,
  lesson cards, course cards and the login panel had all been rendering
  borderless since the sessions that introduced them. Found because the new
  demonstration border also failed to appear; all twelve now use
  `--mcc-border-subtle`, and the spec asserts the border **rendered** rather
  than that a rule exists.

#### Notes

- **Labels go on single-board pages too**, which departs from the brief's
  suggestion. The confusion is not "which of these two?" but "may I touch
  this?", and that question is just as live on a trap page whose only board is a
  replayer — which is precisely the mistake that prompted the work.
- **The compact controls are not hidden before launch.** Doing so broke eight
  existing navigation specs and, more importantly, made "jump to the end"
  unreachable as a first action. "Collapsing to the compact set" is achieved by
  the launch button going away.
- **The cursor was already correct and was not changed.** Chessground scopes
  `cursor: pointer` to `.cg-wrap.manipulable`, which a `viewOnly` board never
  gets: replay computes `auto`, exercise `pointer`. Verified, and now pinned by
  a spec.

---

### Board coordinates outside the squares, and clickable course cards

#### Fixed

- **Course cards on `/cours/` were not clickable at all.** `CoursPage` built its
  cards with no `href`, so `CardGrid` rendered a plain card and the title was not
  a link — the only way into a course was to type the URL. My omission from the
  course-1 session: the detail routes were added and the index was never linked
  to them. A course with no lessons stays unlinked, since it has no page to
  reach.

#### Changed

- **Coordinates moved OUT of the squares into a gutter** — ranks left, files
  below. On-square text over a wood-toned square, next to the piece standing on
  it, was hard to read on a phone. The two-ink rule is gone with the design that
  needed it: one `--mcc-board-coord` per palette, checked against the page
  surface in both (5.13:1 light, 7.79:1 dark). The old per-preset on-square
  pairs were removed from the checker.

#### Notes

- ⚠️ **Task 3 — "course exercises are not playable with the mouse" — does NOT
  reproduce.** Ten combinations were exercised by pointer (mouse *and* real
  touch) across course lessons, the tutorial and `/exercices/`: every one selects
  a piece, shows its legal destinations, and completes the move. What DID
  reproduce was a false positive in the test harness: `scrollIntoViewIfNeeded()`
  left the board half above the fold, so the destination tap landed off-screen
  and was dropped. That is also a genuine hazard for a reader on a phone, and it
  is now on the manual checklist. **Pointer specs were added regardless** — every
  existing lesson-exercise spec solved by typing, which bypasses the board
  entirely, so a real pointer regression could have shipped unseen.
- **The gutter costs board width, not page width:** on a 390px phone the playing
  surface goes 352px → 336px (~4.5%), a square from 44px to 42px — still well
  above a 24px touch target, in exchange for legible coordinates.
- Two CSS traps found by measurement and written down: padding must go on the
  wrapper, never on the Chessground host (it inflates the surface *and*
  double-counts every inset); and the `translateY(39%)` rank nudge must be reset
  at Chessground's own specificity or the reset silently does nothing — that one
  cost exactly 16.4px, being 39% of a 42px cell.
- **WebKit skips links when tabbing** (Safari's "Tab highlights each item" is off
  by default), so the menu spec asserts the links are focusable rather than
  asserting Tab order — it failed in WebKit alone for a reason unrelated to the
  menu.

---

### Navigation, board coordinates, and step-to-step links

#### Fixed

- **Board file coordinates were displaced by a constant 24px**, pushing "h" off
  the board entirely. Cause found by measurement, not by eye: Chessground's
  default `coords.files { left: 24px; width: 100% }` shifts the whole label row
  right while keeping it a full board wide. Those numbers suit lichess's layout,
  where coordinates live in an outer margin; we draw them on the squares, so the
  offset has nothing to sit in. Each track is now pinned to the board box with
  `inset` and divided by `flex: 1 1 0`, so a label's centre is its file's centre
  at every size and in both orientations — measured 0px error at 544px and
  352px, White and Black. A spec asserts it within a quarter-square tolerance.

#### Added

- **Grouped navigation** — Apprendre / S'entraîner / Le club, plus Accueil.
  Click-based disclosures (never hover: the phone is the primary device), one
  panel at a time, Escape closes and returns focus, current *section* marked
  without opening anything, and **0px layout shift** because open panels are
  absolutely positioned.
- **Prev/next controls that name their destination** on every tutorial step and
  lesson — "Suivant : Le fou", not "Suivant →" — plus a permanent link back to
  the index. The last lesson of course 1 now offers the exercises and the traps
  rather than stopping dead.

#### Notes

- **`role="menu"` was deliberately NOT used**, despite the brief asking for menu
  semantics. That role describes an application menu: screen readers announce
  "menu", expect arrow-key roving focus, and stop announcing the contents as
  links. These are navigation links, so the WAI disclosure pattern is correct.
- **The a1 shade is not a bug and was not "fixed".** On the tutorial steps that
  solve with `a1a8` or `a1h1`, a1 is the origin square of the move just played
  and correctly carries the `last-move` highlight. Verified against the DOM:
  `la-tour` highlights a1+a8, `le-cavalier` highlights g1+f3 and leaves a1
  alone. Clearing it would delete the feedback showing what the reader played.
- The coordinate fix is **CSS-only** — `BoardSurface.tsx` is untouched, so the
  full-matrix trigger did not fire and chromium was the correct scope.
- `smoke.spec.ts` was updated rather than worked around: it asserted a nav link
  was visible on load, and those now sit inside a collapsed panel. It opens the
  group first, which checks the string table *and* that the menu reveals links.

---

### Course 1 — "Bien ouvrir une partie"

Six lessons on the opening, both locales. Content batch; no architecture change.

#### Added

- **Per-locale Markdown lesson bodies** — deferred since Session 2, implemented
  here. `src/content/lessons/<course>/<lesson>.<locale>.md`, a `lessons`
  collection, and routes at `/cours/<course>/` and `/cours/<course>/<lesson>/`.
- Course 1's six lessons: occupying the centre, developing, castling early,
  keeping the queen home, three openings to start with, and a recap with three
  exercises. Nine boards in total — five replayers and eight exercises across
  the course.
- `check-content.mjs` extended for the batch.

#### Notes

- ⚠️ **Every `moveComments` ply in the brief was off by one**, and this is the
  finding that mattered most. The copy numbered plies from 1; the schema numbers
  from 0 (`ply 0` is the first half-move). Two overflowed the PGN and would have
  failed the build — the other **eleven would have attached silently to the
  wrong move**, so "the knight comes out and attacks e5" would have appeared on
  Black's `Nc6`. All thirteen were shifted by −1; the prose is untouched. The
  checker now catches this class of error with a message that names the cause.
- **The fr/en pair collided in the glob loader.** `.fr` / `.en` are treated as
  part of the extension, so both files reduced to the same id and one language
  silently overwrote the other — surfacing only as a build *warning*. A custom
  `generateId` keeps the locale in the id; a spec asserts each locale renders
  its own prose.
- **Boards are placed inline** by splitting the rendered HTML on a
  `<!--board-->` marker. MDX would be the "proper" answer and was NOT added —
  it is an integration, and this batch was scoped to content.
- The two authored **static positions became short replays** that reach them
  (verified to land on the exact FENs). There is no static-FEN renderer, and
  adding one would have meant changing the board components.
- Lesson 5 mounts **three replayers on one page**. The "not N live boards" rule
  targets index pages and diagram galleries; a long-form lesson needs a board
  per idea, and each is `client:visible`.

#### Fixed after review

- **Lesson 6, Exercise C replaced.** Its task and its accepted answer
  contradicted each other — titled "the move you must NOT play" while accepting
  only the move you *should* play. It now asks for a developing move.
- **`onlyMove` relaxed to `false` on every developing-move exercise.** After
  1.e4 e5, `Nc3`, `Bc4` and `Bb5` are all perfectly good; telling a beginner
  they are wrong is exactly what the exercise-validation rule exists to prevent,
  and that rule outranks authored metadata. Only lesson 3 keeps
  `onlyMove: true`, and correctly — castling really is the one move that puts
  that king safe. Exactly one `true` in the course; the batch is now consistent.
- The **ply-indexing convention** is now stated at the top of CLAUDE.md's
  content model section, so a batch authored elsewhere cannot repeat the
  off-by-one.

⚠️ **Chess accuracy is Seàn's review.** The checker proves legality and ply
bounds, nothing more — see the report and `docs/MANUAL-TESTS.md`. Lesson 5's
**English prose was written by Claude** (the brief supplied an instruction
rather than copy) and has had no human read.

---

### Beginner tutorial — `/apprendre-les-bases/`

Thirteen guided steps for someone who has never played chess. Touches none of
the v2 auth work.

#### Added

- **`/apprendre-les-bases/`** (both locales): an index of 13 steps, plus one
  route per step — the board, the coordinates, each piece in turn, check/mate/
  stalemate, castling, en passant, promotion, piece values, and reading notation
- A `tutoriel` content collection under the existing CC BY-NC-ND licence
- Entry points: a quiet line on the home page below the two CTAs, and a
  prerequisite link at the top of `/cours/`
- `BACKLOG.md` consolidated into the single list of everything not yet built;
  CLAUDE.md's open-questions section now points at it instead of duplicating it

#### Notes

- **No new board, and no new mode — none was needed.** The brief asked whether to
  add a lightweight "sandbox" sub-mode where tapping a piece shows its legal
  destinations. Exercise mode already does precisely that: `destsOf()` builds
  `dests` from *every* legal move in the position, so Chessground lights all of
  them when a piece is picked up. The board that demonstrates a rule is the same
  board that checks it, through the same `judgeMove` path, with the same keyboard
  input and the same progress store. `BoardSurface.tsx` and `ChessBoard.tsx` are
  untouched, so this merged on **chromium** rather than the full matrix.
- **Progress is namespaced, not special-cased.** Steps record under
  `tutorial:<slug>` in the same `mcc:progress:v1` store, so v2-S3's sync collects
  them with no branching.
- **The index mounts no board.** Thirteen live boards would be thirteen hydrated
  islands on the page a beginner opens first, usually on a phone. A spec asserts
  zero islands there.
- **No nav slot, deliberately.** The nav is already seven items and tight on a
  phone, and the tutorial is a journey you finish rather than a destination you
  return to — a permanent slot would keep advertising it to people who completed
  it. Home and `/cours/` reach the people who need it.
- **`check-content.mjs` now validates the tutorial**: FEN parses with six fields,
  the solution is legal, `onlyMove: true` on a mate-in-1 is genuinely unique, no
  duplicate slugs, `order` is contiguous 1..N (a gap strands a reader, since
  prev/next walks it), and neither language of any prose field is empty. All 13
  positions verified.
- One position was rewritten during authoring: step 1 originally ended in
  **check**, putting a red check highlight on the tutorial's first board seven
  steps before check is explained. The black king moved off the h-file.

⚠️ **The FR pedagogy needs Seàn's review.** The chess is machine-verified; the
teaching is not. `docs/MANUAL-TESTS.md` has the specific things to read for.

---

### v2-S1 — Supabase foundation and email magic-link auth

v2 begins. **Nothing about v1 changes**: the site is still fully static, guests
are still first-class, and every lesson, trap and exercise works with no account.
Accounts add sync and teacher oversight; they gate nothing.

#### Added

**Plumbing**
- `@supabase/supabase-js` behind `src/lib/supabase.ts` — a lazy singleton, and
  the only file that imports the client
- `src/lib/auth-flag.ts` — the "has this browser signed in?" hint, which knows
  nothing about Supabase so the header can ask it for free
- `supabase/` — `config.toml`, numbered migrations, and a test-only seed script
- `.env.example`, `.env.test.example`; `.env.test` is gitignored (service-role key)

**Schema and RLS (migration 0001)**
- `profiles`, `exercise_progress`, `lesson_progress`, `sessions`, `attendance`
- Published sessions readable by `anon`, so the agenda stays visible without an
  account
- `handle_new_user()` creates the profile, falls back to the email local part
  for a display name, and **clamps the locale** (`en-GB` → `en`)
- Deletion cascades `auth.users` → profile → progress → attendance

**Auth UI**
- `/connexion`, `/compte` (both locales) and `/auth/callback`
- An auth-aware header account link that is **not** an island and costs a guest
  nothing

**Privacy**
- `/politique-confidentialite` (both locales): what is stored, why, retention,
  erasure, a minors paragraph, and Supabase named as processor with the EU
  region stated. Linked from the footer and the legal notice

**Test infrastructure**
- `assertNotProduction()` at Playwright config load, purge-by-pattern before and
  after the suite, and an auth spec covering the trigger, the header, sign-out,
  guest zero-requests, and two RLS attacks
- `docs/ADMIN.md` (role promotion SQL), `BACKLOG.md` (custom SMTP)

#### Notes

- **The magic-link flow is implicit, not PKCE, and that is what makes a static
  host work.** Tokens come back in the URL fragment, which is never sent to the
  origin — so `/auth/callback` is a plain static HTML file. PKCE would keep a
  verifier in the requesting browser and break every link opened from a phone or
  an in-app mail browser. Verified: the callback is emitted as a static file and
  no adapter, Function or SSR is involved.
- **`role` is not client-updatable, and RLS alone would not achieve that.**
  Policies act on rows, and the row is the reader's own — so the owner-update
  policy would permit it. Column-level `GRANT`s are the real mechanism, with a
  trigger as the second line and no INSERT policy at all. A spec attempts the
  escalation with a genuine anon-key client holding a real session.
- **Migration ordering is load-bearing.** A `language sql` body has its
  references resolved at `CREATE` time, so `is_staff()` cannot precede the
  `profiles` table. Caught before first apply; the file is ordered tables →
  functions → policies.
- **The interlock fails closed** on equal refs, an undeclared production ref, an
  absent service key, or an unparseable URL — verified against all four failure
  modes plus both passing cases. The one exception is a completely absent
  `.env.test`, where nothing is reachable and auth specs skip visibly rather
  than bricking the ~750 unrelated specs.
- **Email delivery is not covered by automation, and the suite says so.** Users
  and links are minted through the admin API, so the tested flow starts at "the
  link resolves". A real-inbox check is in `docs/MANUAL-TESTS.md`.
- Fixed a real accessibility defect found by axe on the new privacy page: the
  inline WhatsApp link was distinguished by colour alone (`link-in-text-block`).

#### Fixed (carried over from Session 6)

- **Scroll reveals were making index-page axe checks fail.** A `[data-reveal]`
  card below the fold stays at `opacity: 0` until scrolled to, and axe measures
  the contrast of text it can still find — `color-contrast (19×)` on
  `/exercices/`. It had been presenting as intermittent flakiness on the phone
  projects for two matrix runs, because it depends on viewport height and
  transition timing; a serial Firefox run is what finally failed hard enough to
  show the actual violation rather than a timeout.

  `tests/e2e/helpers/reveal.ts` settles the reveals before any axe check on such
  a page. Not a weakened assertion: a card nobody has scrolled to is a card
  nobody is reading.

---

## [0.2.0] — 2026-08-06

Home **Play** CTA, animation pacing with a bot thinking floor, CSS ambient
motion, and a written motion policy.

Three UX changes from Seàn's first real-device pass. No architecture changes.

#### Added

**The home page now says what to do**
- A primary **Jouer** / **Play** CTA into `/jouer/`, with **Découvrir les pièges** /
  **Explore traps** beside it. Playing was previously reachable only from the nav
- Three pillar cards — Apprendre, S'entraîner, Jouer — in learning order rather
  than nav order. One link per card, the whole card made clickable by a `::after`
  overlay, so the a11y tree still has exactly one entry per card
- `/jouer/` was already in the nav with clear labels in both locales; verified,
  not changed

**Ambient motion, CSS-only**
- Drifting chess-piece silhouettes behind the home hero — original geometric
  shapes, not the cburnett set (which is CC BY-SA and would drag an attribution
  obligation onto page decoration)
- Scroll parallax via `animation-timeline: scroll()` behind `@supports`. Where
  unsupported the pieces still drift and simply do not parallax
- Section reveals on home and the four index pages, **opt-in per page** and
  fail-visible: three conditions must all hold before anything is transparent, so
  a page that forgets to opt in, a reader without JS, and a crashed observer all
  show content

**`src/lib/motion.ts`** — every duration on the site, in one place

#### Changed

- **Board moves now animate at 250ms** (was 220ms), set through the one island so
  replay, exercise and play all inherit it. Replay steps take **200ms**: stepping
  is navigation, not gameplay — the distinction is documented in CLAUDE.md
- **The engine appears to think.** A randomised 500–800ms **floor** before its
  move appears — a floor, not an added wait, so a genuinely long search is never
  padded. At Débutant the search returns in single-digit milliseconds and the
  reply used to land in the same frame as the reader's own move
- Scripted `opponentReplies` in exercises draw from the same range, so a student
  cannot feel which page has a real engine behind it
- Under `prefers-reduced-motion` the opponent delay drops to **150ms rather than
  0**. This reverses the note that previously stood in `ExerciseView`: reduced
  motion means "do not animate", not "do not pace", and with a screen reader the
  two move announcements must not overlap

#### Notes

- **GSAP was evaluated and rejected — on licensing, not taste.** `npm view gsap
  license` reports GreenSock's "Standard 'no charge' license", not an OSI one.
  This project is GPL-3.0-or-later because of Chessground, and the GPL forbids
  additional restrictions; bundling GSAP would make the combined work
  undistributable under the licence the repo claims. The visual result was the
  requirement, so it is CSS plus ~20 lines of vanilla JS: **≈1.3 KB gzip** and no
  new request, against ~36 KB gzip for GSAP core + ScrollTrigger.
- **Lighthouse home mobile: 100 → 98 Performance.** The whole delta is Speed
  Index (2.1s → 3.6s); FCP, LCP, TBT and CLS are byte-identical. Isolated by
  re-running with `--force-prefers-reduced-motion`, which disables the drift and
  returns the score to 100 and Speed Index to 2.1s — Speed Index measures visual
  *settling*, and a page with a permanent animation never settles. Accessibility,
  best-practices and SEO stay at 100.
- ⚠️ **A `<script is:inline>` does NOT evaluate `{...}` expressions inside it.**
  The reveal script was first written as `<script is:inline>{\`…\`}</script>` and
  shipped the braces and backticks verbatim — valid JavaScript (a block
  containing a string literal) that does nothing, with no console error and every
  card left at opacity 0. It is a `set:html` of a frontmatter constant instead.
- The ambient layer's opacity has a hard ceiling that no automated check
  enforces: the light lede drops below AA at ~0.075 and we ship 0.055. The
  arithmetic is in CLAUDE.md.

---

## [0.1.1] — 2026-08-06

Patch: deployment configuration only. No application code changed, and nothing a
visitor can see is different.

### Fixed

- **The Cloudflare deploy no longer rewrites the project on its way out.** The CI
  runs `npm run build` then `npx wrangler deploy`; with no wrangler config present,
  wrangler detected an Astro project and ran `astro add cloudflare`, installing the
  `@astrojs/cloudflare` adapter — incompatible with Astro 7, and the wrong shape for
  a static site in any case. The build died at *deploy* time rather than at *build*
  time, which is where nobody was looking.

  `wrangler.jsonc` at the repo root fixes it by being explicit: `name`,
  `compatibility_date` and an `assets` block pointing at `dist/`, and nothing else.
  No `main`, so there is no Worker script and the assets runtime serves the site
  directly. **The file's job is to stop wrangler helping — deleting it brings the
  trap back.**

  `wrangler` stays out of `package.json`, invoked via `npx`. Session 1 removed it to
  drop its transitive advisories (`undici` via `miniflare`), and a static site needs
  it only at deploy time.

  `not_found_handling` is `"none"` because there is no 404 page yet; it becomes
  `"404-page"` in the same commit as the first `src/pages/404.astro`.

### Changed

- `astro.config.mjs` and CLAUDE.md said "Cloudflare Pages" throughout. The target is
  Workers static assets; the comments now say so rather than describing the previous
  plan.

---

## [0.1.0] — 2026-08-06

First release. The headings below are the development milestones that make it up,
in reverse order; their numbers are internal build milestones, not published
versions. Everything in this section ships as `v0.1.0`.

#### Contact

- The club's real WhatsApp number is now in `site.contact.whatsapp`, replacing the
  placeholder that had stood since the scaffold. It is still the only number on the
  site and is still reached solely through `whatsappUrl()`, so `/contact/` and every
  share button picked it up without a component change — which was the point of the
  rule. The outbound-only share link is unaffected: it carries **no** recipient.

### 0.5.0 — Themes

Dark mode, five board presets, and the reader's own colours. The last session
before the v0.1.0 promotion.

#### Added

**Tier 1 — dark mode**
- A full dark palette derived from the brand, not a grey inversion: the baize goes
  almost black but stays green, cream carries the text, and brass gets *brighter*
  because it is the thing still catching the light
- `:root[data-theme='dark']` overrides the `--mcc-*` semantic layer only; the raw
  `--color-*` scales are the palette and never change
- `.text-brass` gains a dark variant — brass-700 was chosen to be readable on cream
  and sits at 2.5:1 on a green-black page. Fills keep their ink labels in both
  palettes, because a fill is the same colour at night

**Tier 2 — board presets**
- Classique, Bois, Vert tournoi, Bleu, Glace. One `.board-<id>` class each in
  `src/styles/board-themes.css`, applied to `<html>` and to the settings previews —
  so the swatch you pick from is painted by the rule that paints your board
- Coordinate inks stated per preset and proved per preset. Two of the five take the
  dark ink on *both* squares; that is derived from the colour, not a house style

**Tier 3 — custom colours**
- Two pickers, board only. Coordinate inks are derived, never chosen
- Live contrast readout per square, and a **"Lisibilité réduite"** warning below AA
  that does not block — it is the reader's board; an unreadable one should be a
  choice rather than an accident, so the warning persists while it is in use
- Reset returns to the preset underneath, and choosing a preset drops the custom pair

**Infrastructure**
- `src/lib/theme.ts` — `mcc:theme:v1`, version in the key, guarded, normalised field
  by field, silent on failure. The single migration point, same rules as `progress.ts`
- **No FOUC**: an `is:inline` head script applies the theme before first paint, and a
  spec records the attribute at the moment `<body>` appears to prove it
- `/parametres/` + `/en/parametres/`, and a cycling sun/moon/auto button in the header

#### Changed

- **`check-contrast.mjs` now parses the real stylesheets** instead of keeping its own
  copy of every hex, and runs the full matrix against **both palettes and all five
  presets**. It is the first step of `npm run build`, so a regression stops the build
  before anything else is spent. Adding a preset to the CSS audits it automatically.
- Components that reached past the semantic layer for a raw `--color-*` now go through
  `--mcc-danger-text`, `--mcc-accent-strong` or `--mcc-border-on-inverse` — each one
  would otherwise have stayed light-mode-only at night.

#### Fixed

- **The "avancé" level badge has been below AA all along.** `ink-950` on `wood-400`
  measured 4.39:1; the old audit checked the brass fills but never the level fills.
  `--color-wood-400` lightened to `#a87850` (4.87:1). Found by the rewritten auditor
  on its first run, which is the entire argument for rewriting it.
- The audit read only the **first** block for a selector. `:root` is declared several
  times in `tokens.css`, as the cascade allows, so `--mcc-danger-text` looked
  unresolved — the audit failing safe, which is what it is for.

#### Notes

- **Theming needs JavaScript**, deliberately. `data-theme` only ever holds a concrete
  `light`/`dark` — `system` is resolved before it is written — which keeps ONE dark
  block instead of the same thirty declarations duplicated into a media query. Without
  JS the site renders light and is fully usable, and the toggle never appears rather
  than appearing inert.
- **The head script duplicates `applyTheme()` on purpose.** It cannot import the module
  without reintroducing the fetch it exists to avoid. The no-flash spec is what keeps
  the two in step.
- **Site-wide custom colours are out of scope and not planned.** Two square colours are
  bounded and checkable; letting a reader recolour every surface would need validating
  pair by pair across both modes, and the failure mode is an unreadable site.
- Board themes are independent of light/dark: a board is a board, and coupling them
  would double the validation matrix for no gain.

### 0.4.1 — `npm run demo`

Tooling only. Nothing a visitor can see changed.

#### Added

- **`npm run demo`** (`scripts/demo.mjs`) — one command to test the built site by hand:
  clears any stale preview server on 4321–4325, builds, serves, and prints the branch,
  the last commit, the URL and the path to the checklist. `npm run demo -- --host`
  exposes it on the LAN for a real phone, and surfaces the network URL.
  Warns in yellow when you are not on `dev`, but does not block — testing a feature
  branch is the normal case. Stops dead if the build fails, serving nothing, so the
  previous build cannot be tested by accident. No new dependencies.
- **`docs/MANUAL-TESTS.md`** — the manual checklist as a living document, grouped by
  feature with expected results: smoke/i18n, legal and licence, the replayer (including
  the `1..` move-number and rapid-arrow-mash regressions), exercises (wrong / illegal /
  hint / solve / badge / reload / incognito), keyboard entry in both notations,
  `/jouer/` (engine loads **only** on click — a Network-tab check), zero third-party
  requests, PWA, phone, and the accessibility checks axe cannot make.

#### Notes — Windows gotchas the script had to survive

- **`netstat -ano -p tcp` cannot see the preview server.** On Windows `-p tcp` means
  IPv4 only; Node binds `[::1]`, which is `tcpv6`. The first version used `-p tcp`,
  reported "nothing was running", and astro then landed on 4322 — the script
  reintroducing the exact stale-server trap it exists to remove. Plain `netstat -ano`
  sees both, and a failed probe is now reported instead of silently reading as "clean".
- **Kill by PORT, never by a remembered PID.** `npm run preview` leaves the real server
  in a grandchild process; killing the pid we spawned takes down the wrapper and leaves
  the port held.
- **`shell: true` with an args array mangles arguments.** `git log -1 --format=%h %s`
  arrived as two arguments and exited 128, which is why the first run printed
  "(no commits)". It also raises DEP0190 on every call. Real executables are spawned
  without a shell; npm — a `.cmd` shim that Node will not spawn shell-less — is passed
  as a single command string.

### 0.4.0 — Content licence, keyboard play, and Stockfish

#### Added

**Licensing — the content is now a separate work**
- `LICENSE-CONTENT` — CC BY-NC-ND 4.0 (verbatim legal code) over the *pedagogical
  substance* of `src/content/`: the FR/EN prose, the commentary, the chosen lines, the
  exercise design. © Seàn McGannon / Mogador Chess Club
- The split is **substance vs structure**: the schemas, field names, JSON format, ply
  scheme, UCI encoding and checker stay GPL. You may take this engine, write your own
  lessons against the same schemas and sell them — just not ours
- Stated on `/mentions-legales/` in both locales, in `README.md`, and in `site.legal.content`

**Keyboard move entry — the pointer-only exclusion is closed**
- `MoveInput.tsx` on both the exercise and play boards, feeding the **same**
  `onMove(from, to)` a drag does; there is no accessible variant of the game logic
- `src/lib/chess/notation.ts` — SAN (`Bc4`), French SAN (`Fc4`, `Cxe5`), and plain
  coordinates (`f1c4`), plus `0-0`, lowercase and trailing `!?`
- `R` is the rook in English and the king in French, so the reader's locale is tried
  first and the other reading only if it is not legal here
- "Could not read that" and "that move is not available" are different messages, and
  neither counts as an attempt — only a real, legal, wrong move does
- Focus returns to the field after the opponent replies

**Play mode — `/jouer/` + `/en/jouer/`**
- Stockfish 11 WASM, self-hosted, vendored by `scripts/build-engine.mjs` (3.6 MB)
- **Loaded on a click and never before**: hydrating the page renders a form and fetches
  nothing; the engine module is `await import()`ed inside the start handler
- Excluded from the precache, cached at runtime (`mcc-engine`), so the first game costs
  3.6 MB and every game after it costs nothing
- Colour + three levels, a Web Worker so the main thread never blocks, move list,
  resign, new game, all chess.js end states announced in a live region
- `src/lib/chess/opponent.ts` — the `MoveProvider` interface `PlayView` talks to.
  Stockfish is just an implementation; **v2's online play is another one, not a rewrite**

#### Fixed

- **`astro check` ran out of memory** once the engine was vendored: `public/engine` was
  inside the TypeScript project and Stockfish's 2.28 MB of minified glue took the program
  past the V8 heap limit. The build died 2m30s in with "Ineffective mark-compacts near
  heap limit", naming no file. `tsconfig.json` now excludes it.
- **The "never precaches Stockfish" test had become a tautology.** "The word stockfish
  does not appear in sw.js" was only true while the engine did not exist; the runtime
  cache rule legitimately names it. It now parses the array out of `precacheAndRoute([…])`
  and asserts against *that* — plus a new test that the runtime rule exists at all.
- Play specs get a 120s timeout and run **one at a time**. Every one boots a real engine
  (3.6 MB, 64 MiB of WASM memory); six at once exhausts the machine, the handshake misses
  its window, and the view correctly shows "could not load" — so tests fail looking like
  nothing. Raising timeouts made it *worse*; reducing concurrency fixed it, and made the
  file faster.
- **Dragging on `/jouer/` was untested and would have stayed that way.** Every play test
  was written with the keyboard because typing is easier than computing board geometry.
  Two `dragMove` tests now cover the pointer path, one of them from the black side, where
  the geometry flips. Writing them immediately found that the board — which does not exist
  until the game starts — lands below the fold, so the drag was aimed past the viewport.
- The engine handshake window is 90s, not 30s: it has to cover fetching 3.6 MB on
  Essaouira mobile data, and timing out on someone whose engine was merely still arriving
  is the worst possible answer.
- Board-driving helpers moved to `tests/e2e/helpers/board.ts`, and **specs now tap rather
  than drag**. Chessground only registers a drag once a `requestAnimationFrame` has run,
  and a synthetic drag is instantaneous, so under the full matrix the mobile projects
  starved rAF and lost moves outright. Tapping goes through the same `userMove` handler
  with no rAF involved. Three separate bugs fell out of fixing this properly:
  page-absolute mouse coordinates broke when the page scrolled between the two taps (the
  second one landed on the move-entry field, whose focus then scrolled the page — the
  screenshot showed the piece selected and the board ignoring input); touch-emulated
  Chromium needs real `tap()` events, not mouse clicks; and the drag path, still worth
  covering, is now pinned to desktop Chromium where it is meaningful.

#### Notes

- ⚠️ **The level presets are `Skill Level`, not Elo.** The vendored build exposes no
  `UCI_LimitStrength` and no `UCI_Elo` — verified by reading the `uci` option list out of
  the running worker. Débutant/Intermédiaire/Avancé are hand-set skill+depth+movetime; the
  ~800/~1400/~2000 design targets are recorded in CLAUDE.md and **not printed in the UI**,
  because a rating the engine does not enforce and nobody has measured is an invented fact.
- **Memory: a fixed 64 MiB.** The build declares `INITIAL_MEMORY = 67108864` with
  `initial === maximum`, so the WASM heap does not grow; `Hash` is pinned at 16 MB and
  `Threads` at 1. The worker is disposed on unmount. (`performance.memory` will not show
  you this — it is quantised and ignores WASM linear memory.)
- **Stockfish 11, not 16/17/18** — those ship a 91/183/251 MB NNUE network. This one is
  1.38 MB, and an engine nobody on mobile data can download is worth nothing.
- **Pass-and-play was skipped**, not forgotten: it is a separate small mode rather than a
  flag on `PlayView`. See the open questions.
- Island cost: the shared board chunk is **47.1 KB raw / 14.9 KB brotli** (was 39.8/12.8)
  now that all three views and `MoveInput` share it — **72.1 KB / 24.5 KB** for everything
  a board page loads up front. chess.js and the chess logic are a further **39.3 KB /
  12.4 KB** in lazy chunks, and the engine is **3.57 MB** fetched on a click. `/jouer/`
  loads none of the last two until you press start.

### 0.3.0 — GPL, and the exercise engine

The licence question is answered, and the board learned to be answered back.

#### Added

**Licence & legal**
- `LICENSE` — the verbatim GPL-3.0 text; `package.json` declares `GPL-3.0-or-later`
- `/mentions-legales/` + `/en/mentions-legales/` — publisher, host, licence and source link,
  the cburnett CC BY-SA credit in full, a credits table, and the privacy/third-party notes.
  Every name and URL is data in `site.legal`; every sentence is a string in `ui.ts`, so the
  notice cannot drift from the config it describes
- **The GPL source link renders in the footer of every page**, not only on the legal notice —
  the requirement is that the source reach *the users of the website*. `legal.spec.ts` asserts
  it on four routes, so tidying it away fails the suite

**Exercise engine** (`ChessBoard` mode `exercise`)
- `src/lib/chess/exercise.ts` — pure position/verdict logic, and the **client-side chess.js
  boundary**: `ExerciseView` pulls it in with `await import()`, so chess.js ships in its own
  36 KB chunk that only an exercise page downloads. Replay stays chess.js-free
- `BoardSurface` gained input — `interactive`, `movableColor`, `dests`, `onMove`, `revision` —
  and is still the only file that imports Chessground
- `ChessBoard.tsx` is now a dispatcher over `ReplayView` / `ExerciseView`. Two views, still one
  island and one Chessground adapter
- Drag or tap to move, legality from chess.js via Chessground's `dests`, scripted
  `opponentReplies` played back with a beat between them, hint on demand, attempt counter,
  replayable solution list after the solve, and "Recommencer"
- Shake on a refused move and a brass settle on a solve, both reduced-motion safe — the
  reduced-motion branch swaps travel for a colour change rather than removing the feedback

**Progress** (`src/lib/progress.ts`)
- `mcc:progress:v1` — version in the key, `{ solved, attempts, hintUsed, solvedAt }` per slug
- The single migration point: nothing else touches `localStorage`. Every access is guarded and
  fails silent, records are normalised field-by-field on read, and a bad stored value is never
  deleted
- Solved ticks on `/exercices/`, drawn by a plain script (not an island) into a row that
  already reserves its height, so nothing reflows

**Pages & content**
- `/exercices/[slug]/` in both locales; the index cards now link and carry a solved tick
- Three real débutant exercises replacing the placeholder: a back-rank mate in one, a
  king-and-rook mate in two with a forced reply, and a knight fork that wins the queen

**Checks**
- `check-content.mjs` now polices `onlyMove: true`, catches a colour drift between `solution`
  and `opponentReplies`, requires six FEN fields, and rejects duplicate slugs or half-translated
  hints

#### Fixed

- **`viewOnly` is bind-time only in Chessground, and failing it is silent.** `bindBoard()`
  returns early when it is true and never re-runs, so `api.set({ viewOnly: false })` flips a flag
  on a board with no `mousedown` listener. The exercise board mounted view-only while its engine
  chunk loaded and then ignored every drag, with no error anywhere. `BoardSurface` now takes a
  separate mount-time `interactive` prop; `movableColor`/`dests` gate the current move.
- **A rejected move needed a `revision` bump, not a new FEN.** Chessground has already moved the
  piece by the time the callback fires, so on rejection `fen` is unchanged, the update effect does
  not re-run, and the board keeps showing a move the engine refused.
- **`link-in-text-block` on the legal notice.** Tailwind's preflight resets `text-decoration` on
  anchors, so the site's links are distinguished by colour alone — nowhere near 3:1 against body
  ink. Links inside legal prose are underlined; axe keeps it that way.

#### Decided

- **GPL-3.0-or-later, repository public.** Chessground's copyleft reaches the combined work, and
  for a free community club project that is the right fit.
- **cburnett** is credited in full on `/mentions-legales/` plus a one-line footer link.
- **No third-party request without an explicit reader click** — now a standing, tested rule. When
  the `youtube` field is rendered it will be a click-to-load facade on `youtube-nocookie`; a plain
  iframe sets third-party cookies at load and would break the posture the legal page states.
- **Course lesson ordering:** `order: number` in the course frontmatter. To be implemented with
  `/cours/[slug]/`.

#### Notes

- **`onlyMove: false` still validates against the stored line only, and that is deliberate.**
  Winning-alternative acceptance is deferred until Stockfish can adjudicate it — not faked. The
  permissive verdict says "not the line we had in mind", never "wrong", in both languages, and a
  spec holds that copy in place.
- The new `onlyMove` check earned its keep immediately: `opposition-et-mat` was authored as
  `onlyMove: true` and the checker proved that `1. Kf7` mates as surely as `1. Kg6`. It is `false`.
- ⚠️ **The exercise board takes pointer input only.** A solver who cannot use a mouse or touch can
  read the puzzle but not answer it, and axe cannot see the gap. Logged as an open question.
- Island cost: the replay bundle grew **58.7 → 64.8 KB raw / 20.5 → 22.4 KB brotli**, because both
  views and `progress.ts` share the island chunk. The 36 KB chess.js chunk is *not* in it.

### 0.2.0 — The board

Preact island, Chessground replayer, and the first real trap.

#### Added

**Board**
- `@astrojs/preact` + `preact`, present solely so the board can hydrate with
  `client:visible`; the board is the only hydrated component on the site
- `src/lib/chess/replay.ts` — pure PGN → plies. No DOM, no Chessground, no Preact,
  per the transport-agnostic rule
- `src/components/board/BoardSurface.tsx` — the **only** file importing Chessground,
  so the library is swappable in one place
- `src/components/board/ChessBoard.tsx` — THE board island. `mode: replay` implemented;
  `exercise` and `play` reserved and rendering a static position
- Board theme from the tokens: a `repeating-conic-gradient` checker in the two real
  board colours (the stock theme uses a black-at-20% overlay, which cannot produce
  `--mcc-board-dark`), plus per-square-colour coordinate ink for AA

**Replayer**
- Start / prev / next / end controls, arrow keys, Home/End
- Move list as an `<ol>` with the current move highlighted by fill and weight,
  click to jump, auto-scrolled into view
- Per-ply bilingual commentary in a polite live region, plus a checkmate flag
- Per-ply arrows and circles via Chessground's drawable API, in brand brushes
- Jumps render instantly; single steps animate (a nine-ply leap animates into
  a meaningless scramble)

**Content**
- Schema: `moveComments[]{ply,fr,en}` (replaces `notes[]`), `shapes[]{ply,arrows,circles}`,
  and an optional `youtube` video-ID field on `traps` and `cours` (field only, nothing
  renders it yet)
- Légal's mate written properly: the historical line, eight commentary plies, four
  shape groups, and a summary that teaches development over greed
- `check-content.mjs` now validates comment/shape ply bounds, empty translations, and
  arrows starting from empty squares

**Pages**
- `/pieges/` cards gain theme chips and link to the detail page
- `/pieges/[slug]/` in both locales — replayer, summary, outbound WhatsApp share,
  OG title/description from the content

#### Fixed

- **Hydration mismatch in the move list.** `{n}.` server-renders as one text node;
  Preact hydrated expecting two children and appended the missing `"."`, so move
  numbers read `1..` in the browser and `1.` in the HTML.
- **`client:visible` is now proved, not assumed.** A spec asserts that on a small
  viewport the board markup is present but Chessground has *not* run, and that it
  hydrates once scrolled to. Switching the island to `client:load` fails the suite.
- **Rapid arrow presses dropped moves.** The keydown handler computed its target
  from the closed-over cursor, so two presses in the same frame both resolved to the
  same ply and the second was swallowed. Now a functional state update; the listener
  binds once. Covered by a regression test.

#### Decided (not implemented)

- Course long-form bodies will be **per-locale Markdown pairs** (`x.fr.md` / `x.en.md`),
  not more `*_fr` / `*_en` frontmatter fields. The JSON entry stays the index record.
- **No in-app communication, ever** — no chat, comments, forum or reactions, and this
  does not expire with v2's online play. The club teaches children; a message channel
  would create moderation, safeguarding and data-protection duties a volunteer club
  cannot staff. Sharing is outbound only.

#### Notes

- ⚠️ **Chessground is GPL-3.0-or-later.** Its README: *"When you use Chessground for
  your website, your combined work may be distributed only under the GPL. You must
  release your source code to the users of your website."* Flagged for Seàn's decision;
  the dependency is contained to one file so a swap stays cheap. The cburnett piece set
  is CC BY-SA 3.0 (Colin M.L. Burnett) and needs a visible credit.
- The PGN is parsed at **build time**, so chess.js never enters the client bundle for
  replay mode. Island total: **58.7 KB raw / 20.5 KB brotli**.

### 0.1.0 — Scaffold

Foundation only: no real content, no interactive board yet.

#### Added

**Scaffold**
- Astro 7 (static output, Cloudflare Pages target) + TypeScript strict + Tailwind v4
- FR/EN i18n: FR at the root, EN under `/en/...`, path-preserving language switcher
- `chess.js` and `chessground` installed; Chessground's exact import paths and
  theme-override surface documented in CLAUDE.md for the Phase 2 board
- Playwright + `@axe-core/playwright`, five-project matrix, served by `astro preview`
  over the real build
- WebKit projects (`webkit`, `iphone-13`) pinned to file-level parallelism with one
  retry: the Windows WebKit build crashes under the default fan-out with
  "browser has been closed". Diagnosed as a browser-build issue, not an app bug —
  the same specs pass 24/24 on a single worker. Documented in CLAUDE.md.

**Design**
- `src/styles/tokens.css` — the "old chess club" palette: deep green (baize),
  cream (paper), brass (lamp), wood (panelling), warm ink
- Board tokens `--mcc-board-light` / `--mcc-board-dark` harmonised with the palette,
  each with its own coordinate ink so both clear AA
- Fraunces Variable (display) + Inter Variable (body), self-hosted, latin subsets only
- `scripts/check-contrast.mjs` — WCAG AA audit of every rendered pair; fails the
  run on a regression, and also asserts the deep-variant rules are still needed
- **Brass contrast rule**: brass fails AA as text on cream, so it renders in
  `brass-700` as type and carries ink labels as a fill (global unlayered override,
  same pattern as Baby Club's terracotta)

**Config & content**
- `src/config/site.ts` — single source of truth; venue is fully nullable data so
  the club stays portable off Dar Souiri
- Content collections with Zod schemas: `traps`, `cours`, `exercices`, `agenda`,
  one placeholder entry each
- `scripts/check-content.mjs` — replays every PGN and exercise line through
  chess.js, because a schema cannot prove a move is legal

**Pages**
- Six routes in both locales: `/`, `/cours/`, `/pieges/`, `/exercices/`,
  `/agenda/`, `/contact/`; each route file is a shell over one shared component

**PWA**
- `manifest.webmanifest` generated from `src/config/site.ts` so name and theme
  colours cannot drift from the tokens
- Workbox precache via `scripts/build-sw.mjs`, run after `astro build`
- PWA icons generated from a single placeholder brand mark
- **Stockfish and `.wasm` are excluded from the precache**, enforced before the
  engine exists and asserted in `tests/e2e/pwa.spec.ts`

**Analytics**
- Umami snippet, env-driven; omitted entirely when `PUBLIC_UMAMI_WEBSITE_ID` is unset

**Docs**
- `CLAUDE.md` — conventions, stack rationale, the one-board-island rule, the
  `onlyMove` exercise-validation rule, the PGN language rule, content model,
  routes, tokens, testing policy

#### Notes

- `wrangler` was removed from the dependency tree: this project ships fully static
  output with no Pages Functions, so `astro preview` is the correct test server.
  It also cleared three transitive advisories (`undici` via `miniflare`).
- Fontsource package CSS is **not** imported directly — Vite leaves its relative
  `url()` references unresolved and the fonts silently 404 into a Georgia
  fallback. `scripts/build-fonts.mjs` self-hosts them instead. See CLAUDE.md.

[Unreleased]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.17.0...HEAD
[0.17.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/releases/tag/v0.1.0
