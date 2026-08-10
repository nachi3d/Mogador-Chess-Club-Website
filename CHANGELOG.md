# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Per CLAUDE.md → Conventions, this file is updated on **every merge to `dev`**.

---

## [Unreleased]

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

[Unreleased]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/releases/tag/v0.1.0
