# CLAUDE.md — Mogador Chess Club

This file is the operational reference for working on this codebase with Claude
Code. It holds the rules that bind **every** session: the conventions, the
Critical Features, the content-authoring rules, the testing and promotion
policy, and the architectural decisions that constrain new work.

## ⚠️ THIS FILE HOLDS THE RULES. `docs/reference/` HOLDS THE DETAIL.

CLAUDE.md is loaded into context on every session and has a hard size limit
(150 000 characters — see "The size guard" below). It reached **247 KB** once,
past which the tail was silently no longer being read: rules were present in the
file and absent from the session, which is worse than not having written them.

So the split is by **when you need it**, not by importance:

- a rule that constrains work you might do *without knowing this area exists*
  stays here;
- the reasoning, the measurements and the incident narratives behind it live in
  `docs/reference/`, one file per area, each with a **Read when** line at the top.

**Nothing was deleted.** Every reference file names when it matters; read it
before touching that area, not speculatively.

| Read before touching | File |
|---|---|
| The board island, views, `MoveInput`, board CSS/geometry/coordinates | [`docs/reference/board.md`](./docs/reference/board.md) |
| Content: traps, lessons, exercises, tutorial steps, claims | [`docs/reference/content.md`](./docs/reference/content.md) |
| Deploying, wrangler, the domain, the SW, the manifest, generated assets | [`docs/reference/deployment.md`](./docs/reference/deployment.md) |
| Starting or ending a long-lived process; a test run that smells stale | [`docs/reference/dev-environment.md`](./docs/reference/dev-environment.md) |
| Stockfish, `/jouer/`, the level presets | [`docs/reference/engine.md`](./docs/reference/engine.md) |
| Adding a dependency, piece set, font or any third-party asset | [`docs/reference/licence.md`](./docs/reference/licence.md) |
| Any animation, duration, pacing delay or sound | [`docs/reference/motion-sound.md`](./docs/reference/motion-sound.md) |
| Points, ranks, achievements, streaks, index cards | [`docs/reference/progression.md`](./docs/reference/progression.md) |
| Auth, migrations, RLS, sync, the child-profile model | [`docs/reference/supabase.md`](./docs/reference/supabase.md) |
| Writing or debugging a spec; explaining a browser-specific failure | [`docs/reference/testing.md`](./docs/reference/testing.md) |
| Tokens, themes, board presets, piece sets, fonts, the head script | [`docs/reference/theming.md`](./docs/reference/theming.md) |
| The header, the mobile bottom bar, the home page, the resume resolver | [`docs/reference/ui-navigation.md`](./docs/reference/ui-navigation.md) |
| Planning a phase, or checking whether something is built | [`docs/reference/roadmap.md`](./docs/reference/roadmap.md) |
| Why a rule exists — the incident behind it | [`docs/reference/incidents.md`](./docs/reference/incidents.md) |

⚠️ **A rule that belongs here must not be "tidied" into a reference file.** The
test is whether a session could break it *without going looking* — if yes, it
stays here. Conversely, a new incident narrative goes to the reference file, and
only its lesson comes back.

---

## Project context

**Project:** Mogador Chess Club — a chess *teaching* platform: courses, an opening-trap library, interactive exercises, and play against Stockfish.
**Developer:** Nachi3D (Seàn McGannon) — Nachi3D Labs credited in footer
**Location:** Essaouira, Morocco
**Venue:** Dar Souiri — **held in config, never in components** (see the portability rule below)
**Association:** Association Essaouira Mogador (`@associationessaouiramogador`), credited in the footer
**Project root:** `N:\Nachi3D-Labs\Mogador-Chess-Club-Website`
**Domain:** `mogadorchess.nachi3dlabs.com` — a subdomain of the Labs domain, already a Cloudflare zone, so no registrar step. `mogadorchess.ma` is a separate, later option and blocks nothing. See "Deployment".
**Hosting:** Cloudflare Workers static assets, fully static output — see "Deployment"
**Staging:** Cloudflare preview deployments on `dev`
**Languages:** FR (default, at the root) + EN (under `/en/...`)

**Footer credit:** "Site créé par [Nachi3D Labs](https://www.nachi3dlabs.com)" — same pattern as other Labs projects.

### Venue portability — a hard rule

The club currently meets at Dar Souiri. It must remain **portable** to another venue, or to independent classes with no fixed venue at all. Therefore:

- Every venue string lives in `site.venue` in `src/config/site.ts`. **No component may contain a venue name, an address or a map link.**
- Every venue field is nullable. `hasVenue()` and `venueAddress()` return null when there is nothing publishable, and the venue blocks in the footer and on `/contact` disappear rather than rendering an empty heading.
- An agenda entry may carry its own `venue`, which overrides the site default for that session only. A session can move without touching site config, and site config can move without rewriting past sessions.

Changing venue is a one-commit change in one file. Keep it that way.

---

## What this site is

1. **Cours** — progressive lessons, from piece movement to rook endgames.
2. **Pièges** — a library of classic opening traps: how to set them, how not to fall for them.
3. **Exercices** — positions to solve on an interactive board, with hints and solutions.
4. **Jouer** — a game against Stockfish, in the browser. (Phase 2.)
5. **Agenda + contact** — when the club meets, and how to reach it.

## What this site is NOT (v1)

- ❌ **No backend, no Supabase, no accounts.** Progress is stored in `localStorage`. See the stack rationale below.
- ❌ **No online play between humans** in v1. That is v2 — see "Online play (v2)".
- ❌ No CMS. Content lives in the repo as typed content collections.
- ❌ No payments, no memberships.
- ❌ **No in-app communication. Ever.** See the rule below.

### No in-app communication — a permanent rule, not a v1 limitation

The site carries **no chat, no comments, no forum, no reactions, no user-submitted content of any kind**. This is not a "later" item; it is a standing decision and it does not expire with v2's online play (which carries moves between two players in a room, and nothing else — no message channel alongside it).

Why it is written as a hard rule: this is a club that teaches **children**. Any channel where a stranger can send a message to a minor turns a static teaching site into a moderation obligation, a safeguarding obligation, and a GDPR/Law 09-08 data-processing obligation — none of which a volunteer club can staff. There is no version of "just a small comment box" that avoids this.

**Sharing is outbound only.** The WhatsApp share button hands the *reader's own* device a prefilled message and gets out of the way — `wa.me/?text=…` with **no recipient number**. We never post anything, store anything, or receive anything. Any future share follows the same shape.

Anything that looks like an inbox belongs off-site: the club's own WhatsApp number in `src/config/site.ts`, or the association's Instagram.

---

## Stack overview

- **Astro 7** + TypeScript strict — static-first, content collections for traps/courses/exercises
  - `output: 'static'`. There is **no SSR, no adapter and no server-side code at all.** That is why `wrangler` is not a dependency (it is invoked with `npx` at deploy time — see "Deployment") and why Playwright serves the build with `astro preview` rather than a wrangler dev server (Claraloha needs the latter because it has a Function; we deliberately do not).
  - Requires **Node ≥ 22.12** (declared in `package.json` `engines`).
  - Astro 7 runs **Vite 8** and a Rust compiler that rejects invalid/unclosed HTML instead of silently repairing it. Keep `.astro` markup well-formed.
- **Tailwind v4** (`@tailwindcss/postcss`)
  - `src/styles/global.css` imports `tailwindcss/index.css`, **not** the bare `tailwindcss` specifier. Vite resolves CSS `@import` before the Tailwind PostCSS plugin runs and its resolver ignores the package `exports` map, so the bare specifier fails the build. Don't "tidy" it back. (Lesson imported from Claraloha.)
- **chess.js** — rules, legality, SAN/FEN/PGN parsing. The single source of chess truth; never hand-roll move legality.
- **Chessground** (lichess's board) — rendering and input only. It knows nothing about rules.
  **GPL-3.0-or-later** — see "Third-party licences" before assuming this is settled.
- **Preact** (`@astrojs/preact`) — present solely so the board can be a `client:visible` island.
  The board is the ONLY hydrated component on the site; everything else is static `.astro`.
- **Stockfish** — Phase 2, **lazy-loaded, never precached**. See "Service worker".
- **PWA** — generated manifest + Workbox precache.
- **Cloudflare Workers** static-assets hosting (see "Deployment") + **Umami** analytics (env-driven; omitted entirely when unset).
- **Playwright** + **axe-core** tests.

### Why static, and why no Supabase (v1)

The whole v1 product is *content plus a chess engine in the browser*. There is no per-user data worth a server: lesson progress is one visitor's private state, so it lives in `localStorage`. There are no capacity-constrained bookings (Baby Club's reason for Supabase), no transactions, no roles. Adding a database would mean auth, a privacy policy, and a monthly bill in exchange for nothing a visitor can perceive.

Consequence to respect: **progress is device-local and can be cleared by the browser.** Never build a feature whose value depends on progress surviving — no streaks that punish loss, no "resume where you left off" as the only way to reach a lesson.

#### `src/lib/progress.ts` — the single migration point

All of it lives behind that one module. **Nothing else in the codebase may touch `localStorage` or know the key.** If accounts ever arrive, swapping the backing store is a rewrite of that file and nothing else — the same containment trick as `BoardSurface.tsx`.

- Key: `mcc:progress:v1`. The **version is in the key**. A future shape change writes `v2` and may migrate `v1` across; it never reinterprets `v1` bytes under new rules, because a half-migrated record is worse than a lost one.
- Shape: `{ exercises: { [slug]: { solved, attempts, hintUsed, solvedAt } } }`.
- **Every access is guarded and fails silent.** Safari private mode throws on `setItem`, a full quota throws, an embedded context can throw on `localStorage` itself, and a hand-edited value can be any garbage at all. A reader whose storage is unavailable still gets a fully working exercise — just no tick on the index. There is nothing they could do about it, so we do not tell them. A bad stored value is **not deleted**: destroying a reader's data to tidy up is the wrong trade.
- Records are normalised **field by field** on read, never cast. The value came off disk and may have been written by an older build or a person with devtools open.
- `resetAttempts()` ("Recommencer") clears the counter and **never the solve**. Having solved something once is a fact about the reader; a retry button that silently takes back a tick would punish curiosity.

The solved ticks on `/exercices/` are drawn by a plain `<script>`, **not an island** — ~1 KB of vanilla JS that reads the module and removes a `hidden` attribute. The one-board-island rule is about hydrated framework components, and this must stay on the right side of that line. The card reserves the marker's height (`.card-status`), so revealing it cannot reflow the grid.

### Online play (v2) — keep game logic transport-agnostic

v2 adds human-vs-human play over **room codes backed by Cloudflare Durable Objects**. It is not built yet, and the point of writing it down now is a constraint on v1 code:

> **The game logic must not know how moves arrive.** A module that applies a move, validates it and computes the resulting position takes a position and a move, and returns a new position. It must not read from the DOM, call Stockfish directly, or assume a local opponent.

Concretely: keep `src/lib/` chess logic pure and synchronous. The board island, the Stockfish worker and (later) the Durable Object socket are all just *callers*. If v1 wires "the opponent" straight into the board component, v2 becomes a rewrite instead of an addition.

---

## Conventions (NEVER deviate)

### Git
- Branches: `claude/<feature>` → `dev` → `main`
- `--no-ff` merges always (preserves branch history)
- Conventional commit format: `feat(scope): description`
- **Commits are authored as `nachi3D` only. NEVER add `Co-Authored-By` lines for Claude or anyone else.**
- Tag releases: `git tag -a vX.Y.Z -m "..."` on main after merge
- **Bump `package.json` `version` to match the tag, in the release commit.** See the promotion routine below.
- Update CHANGELOG.md on every merge to dev
- **Back-merge convention:** after each release, merge `main` → `dev` to keep histories aligned
- Claude Code merges to `dev` only; **`dev` → `main` requires Seàn's explicit approval per release**

#### Session finish routine

Every session that reaches a merge updates all three, in the same commit as the work:

1. **`CHANGELOG.md`** — what changed, and the reasoning behind anything surprising.
2. **`CLAUDE.md`** — any decision, rule or gotcha that the next session would otherwise rediscover. ⚠️ **The RULE lands here; the reasoning, the measurements and the story land in the `docs/reference/` file for that area.** Both, not one — a rule with no recorded reason is re-litigated, and reasoning nobody is pointed at is not read. The size guard fails the build if this file outgrows its limit again; when it warns, **split, do not trim**.
3. **`docs/MANUAL-TESTS.md`** — **whenever the session adds or changes anything a visitor can see.** New feature, new page, new failure mode, new regression worth watching: it goes in the checklist. This is the one most easily skipped and the one whose absence is least visible — a checklist that lags the site makes an incomplete test pass feel complete.

---

#### ⚠️ KILL EVERY LONG-LIVED PROCESS THE SESSION STARTED

A session that starts a server **terminates it when the task that needed it
ends** — `astro preview`, `npm run demo`, a watch, anything holding a port.

This is not tidiness. A stale listener makes Playwright's `reuseExistingServer`
skip its own build and test **whatever is on disk from before**, so a fixed bug
keeps "failing". One preview ran for 4h28m before anyone noticed; 26 orphaned
previews on an out-of-range port and ~60 orphaned Playwright browsers have each
been found on this machine, and the browsers cost three red gates in a row.

⚠️ **A port list is not the sweep — sweep by repo path**, and sweep the browsers
too, because an orphaned browser holds no port and its command line never
mentions this repo. `scripts/demo.mjs` does all three on startup **and** on
Ctrl+C. ⚠️ **Stopping the npm wrapper does not stop the server**; verify the port
is free and kill by PID.

**➡️ The exact probes, the load-bearing details of each one, and the
verification behind them: [`docs/reference/dev-environment.md`](./docs/reference/dev-environment.md).**
Read it before writing or changing any sweep — matching on `chrome.exe` by name
rather than by executable path would kill Seàn's own browser.

---

#### Promotion routine — `dev` → `main`

Every promotion does all four, and the version bump is **part of the release
commit, not a follow-up**:

1. **Bump `package.json` `version` to the release version** — `0.5.0` ships as
   `"version": "0.5.0"`. It is the one machine-readable statement of what this
   tree *is*, and it is what `npm version`, tooling and a future consumer read.
2. **Stamp `CHANGELOG.md`** — move `[Unreleased]` to `[X.Y.Z] — <date>` and add
   the compare-link pair at the bottom.
3. **Merge `--no-ff`, then `git tag -a vX.Y.Z`** on main.
4. **Back-merge `main` → `dev`.**

⚠️ **The bump belongs in the release commit because a promotion already runs
the full gate.** Doing it afterwards means either a second gate for a one-line
change or an untested tree — and `package.json` is deliberately on
`scripts/quick.mjs`'s FORBIDDEN list, so it cannot take the fast path on its
own. That exclusion is correct and stays: its pattern cannot tell a `version`
string from a dependency edit, and guessing wrong in that direction is how a
dependency change reaches production on a shortened gate.

⚠️ **This drifted for three releases.** v0.3.0, v0.4.0 and v0.5.0 all shipped
with `"version": "0.2.0"`, because nothing named the file and nothing checked
it. Tags said one thing and the manifest said another.

### Shell
- NO chained `&&` commands — git and cd run as separate steps
- No PowerShell
- One task per prompt OR large batched prompts for related changes
- All prompts in a single copyable block
- No confirmation questions for standard commands

### Code
- TypeScript strict mode, no `as any` to bypass types
- All public user-facing strings through the i18n layer — no hardcoded FR/EN in components. The layer lives in `src/i18n/`: `ui.ts` (string tables — **FR is the reference table and EN is typed against it, so a missing translation is a compile error**) and `paths.ts` (locale-aware path building + the switcher's path-preserving counterpart lookup). Paths are emitted with a trailing slash to match `build.format: 'directory'`.
- Astro content collections with Zod schemas — content is typed data, not loose markdown
- Components never hardcode a colour or a font: they consume the tokens in `src/styles/tokens.css`

### Approach
- Recon-first for complex features (audit before changing)
- Two-step diagnosis + fix for bugs
- CLAUDE.md maintained across sessions — update it when decisions land

---

## Critical Features — NEVER BREAK

1. **Venue portability.** No venue string outside `src/config/site.ts`. See the rule above.
2. **i18n FR/EN.** Every public page in both languages; the switcher preserves the path; FR default at root with no `/fr/` prefix.
3. **One board island, lazily hydrated.** See the architecture rule below.
4. **Exercise validation never calls a correct move wrong.** See the `onlyMove` rule below.
5. **PGN stays language-neutral.** See the PGN rule below.
6. **Stockfish is never precached.** See "Service worker".
7. **WhatsApp number correctness** — always via `whatsappUrl()` from `src/config/site.ts`, never hardcoded per page.
8. **The GPL source link is in the footer of every page.** It is how the licence's distribution requirement is met, not decoration. See "Licence".
9. **No third-party request without an explicit reader click.** See the rule below. The engine obeys the same rule for its own 3.6 MB.
10. **`localStorage` never breaks the page.** Every access goes through `src/lib/progress.ts` or `src/lib/theme.ts` and fails silent.
11. **Every board is playable without a pointer.** `MoveInput` feeds the same path as a drag; see "Both inputs, one path".
12. **Code and content are licensed separately.** Substance vs structure — see "Licence".
13. **Both palettes clear AA.** `check-contrast.mjs` runs light AND dark, plus every board preset, as the first step of the build.
14. **No flash of the wrong theme.** The head script applies it before `<body>` exists; a spec proves it.
15. **Every animation belongs to one of three motion families, and nothing sits between 180ms and 250ms.** `src/lib/motion.ts` is the single source; a spec sweeps every element for violations. See "Motion".
16. **The board stays sober.** Motion lives around it. The one exception is the correct-move pulse — one Transition, one square, exercise mode only.
17. **Reduced motion means OFF for decoration and INSTANT for feedback** — never "the same show, slower". Both halves are tested.
18. **Accounts are OFF in production, and OFF means NOT BUILT.** No auth route in `dist/`, no Supabase ref in any bundle. See the account-flag section.
19. **`import.meta.env.NAME`, never `import.meta.env['NAME']`.** Bracket access ships the whole env object, anon key included.
20. **The home menu's labels ARE the nav's labels**, from the same `nav.*` keys. Never a second string for the same destination.
21. **The home menu works with no JavaScript**, and fits one screen on a phone. Both are tested.
22. **Every theme clears AA in BOTH its modes, against every board preset.** 275 assertions, and a failing combination is fixed or dropped — never shipped with an exception.
23. **The body typeface never changes with the theme.** Headings do; body does not. Tested by comparing the computed family across all four.
24. **A theme loads only its own heading font and its own piece set.** Asserted against the network log, not against appearance.
25. **Every piece set is licence-checked individually and credited on `/mentions-legales/`.** For three of the four it is a condition of use, not a courtesy.
26. **Mobile and desktop diverge at 768px, deliberately.** Bottom bar + one-line header + dashboard below; grouped header + retro menu above. Both sides are pinned by specs.
27. **The bottom bar has exactly four entries and never hides on scroll**, and no page may hide content behind it.
28. **Below 768px the exercise controls compact; the board never does.** See the M3 section — the board is the thing being taught with.
29. **There is ONE resume rule, in `ResumeResolver.astro`, and ONE key scheme, in `src/lib/journey.ts`.** Four surfaces read them. A second copy of either is how two pages come to disagree about what a reader has done.
30. **The progress page never prints a number nothing computed.** Since E3 something computes rank and points, so it prints them — derived, never banked. See the progression section.
31. **Every long route ends with a way onward**, clear of the bottom bar.
32. **A card that renders has a destination.** `CardItem.href` is required and every card's link resolves 200. See the index rule below.
33. **Points are DERIVED, never banked.** No total is ever stored. See the progression section.
34. **No daily or consecutive-day streak. Ever.** The club meets weekly; a daily streak would punish the normal rhythm of these students.
35. **A loss costs nothing.** Losses and draws are recorded and read by no scoring rule at all.
36. **No route may exist on one layout only.** Every destination the mobile bottom bar reaches is reachable from the desktop header, and the spec reads the list off the bar rather than hard-coding it. See the section below.
37. **Sound is OFF by default, and `src/lib/sound.ts` is the only file that may make one.** No other module constructs an `AudioContext`, an oscillator or a gain node. See "Sound".
38. **No `AudioContext` before a user gesture**, and exactly one for the life of the page. Asserted against a patched constructor, not assumed.
39. **Sound is never the only signal.** Every voice accompanies a visual that fires independently — a reader on silent, or with no audio device, loses nothing.
40. **The LEARNER is a child profile, never the account.** Progress, points, attendance and game results reference `child_profiles.id`. An autonomous teenager is an account holding exactly one child — one code path, not two. See "The parent/child model".
41. **Graduation is one FK update.** Moving a learner between accounts must never copy rows between tables. `graduate_child()` is the proof, and it is `service_role` only.
42. **"Qui joue ?" is a choice, not a password.** No PIN, no lock on a child profile. The account is the security boundary; which child is playing is a preference.
43. **The admin UI is FRENCH ONLY, and that is a decision.** No `t()`, no `/en/admin/`, no i18n scaffolding under `/admin*`. A future session must not "fix" it — see the admin section.
44. **RLS is the security; the admin UI's role check is UX.** Every boundary is asserted through PostgREST with the user's own token, never by driving the pages.
45. **The register is one tap per child, no modal, no save button.** Marking twenty teenagers in a room is the constraint the whole surface is shaped by, and it is measured rather than claimed.
46. **A cancelled session is a STATE, never a deletion.** Deleting one cascades its register away; students who were told it was happening are left wondering.
47. **There is ONE ledger summation** — `computeLedger()` — and the inline resolver's copy is pinned equal to it by a spec. A prof and a student must never read different totals.
48. **A control a signed-in reader is entitled to use is REACHABLE, and a spec drives it.** The family section renders for every signed-in account; only the picker inside it is conditional. RLS saying yes is not the same as the reader being able to get there — see the family-section rule below.
49. **The public agenda is BAKED at build time, never fetched at runtime.** Static output plus Critical Features 9 and 18 leave no other answer; the staleness that follows is made loud on `/admin/seances`, not hidden. See the agenda rule.
50. **A cancelled session stays publicly visible with its state, and a draft never leaks.** CF46 is only half kept if the student who was told it was happening cannot see the cancellation.
51. **`delete_own_account()` takes no target, and nothing is retained.** The parameter list is the security design; erasure leaves no statistics, no archive and no anonymised copy.

---

## Architecture rule — ONE board island

There is **exactly one** Chessground component in the codebase. Courses, traps, exercises and play-vs-engine all mount that same component with different props. Never a second board implementation, never a copy "just for exercises".

**It hydrates with `client:visible`, never `client:load`.** Chessground plus chess.js is the heaviest thing on any page that has a board; hydrating eagerly makes a lesson page block on JS the reader may never scroll to.

Corollaries:
- **Index/list pages never mount a board.** `/exercices/` is a list of cards; the board lives on the detail route.
- If a page needs several diagrams, they are static images or a single board the reader steps through — not N live boards.
- Chessground renders and takes input. **chess.js owns legality.** Never let the board decide whether a move is legal.

**Preact is the island framework** (decided Session 2, approved by Seàn). Astro's `client:*` directives only apply to framework components — a plain `.astro` component cannot take `client:visible` at all, which is the entire reason `@astrojs/preact` is installed. It is **not** a licence to write the site in Preact: everything that can be static HTML stays `.astro`, and the board is the only hydrated component on the site.

### The files, and what each is allowed to know

| File | Role | Must NOT |
|---|---|---|
| `src/lib/chess/replay.ts` | Pure PGN → plies. No DOM, no Preact, no Chessground. | reach for a board or a network |
| `src/lib/chess/exercise.ts` | Pure position + verdict logic. The **client-side chess.js boundary**. | be imported statically from anything a replay page reaches |
| `src/lib/progress.ts` | The **only** file that touches `localStorage` | be read during render (see below) |
| `src/components/board/BoardSurface.tsx` | The **only** file importing Chessground | know about PGN, commentary, modes or progress |
| `src/components/board/ChessBoard.tsx` | THE island. Dispatches on `mode`, nothing else. | import the i18n layer, chess.js, or fetch anything |
| `src/lib/chess/notation.ts` | Pure. Typed text → a move on a position. | know about a field or a component |
| `src/lib/chess/opponent.ts` | Pure. The `MoveProvider` interface — the v2 seam. | import an implementation |
| `src/lib/engine/stockfish.ts` | The Worker + UCI. The **only** non-pure lib file. | be imported anywhere but a click handler |
| `src/components/board/ReplayView.tsx` | `mode="replay"` — the viewer | import chess.js, even for a type |
| `src/components/board/ExerciseView.tsx` | `mode="exercise"` — the solver | import chess.js **statically** |
| `src/components/board/PlayView.tsx` | `mode="play"` — a game vs the engine | import the engine module statically, or know it is an engine |
| `src/components/board/MoveInput.tsx` | Keyboard move entry, shared by exercise and play | judge or apply anything itself |
| `src/components/board/ReplayBoard.astro` | Server side: parses the PGN, resolves labels, mounts `client:visible` | render a board itself |
| `src/components/board/ExerciseBoard.astro` | Server side: resolves labels, mounts `client:visible` | precompute the position (it can't — see below) |

The views are **views, not islands**: one hydration entry point (`ChessBoard`), one Chessground adapter (`BoardSurface`). Splitting them keeps neither mode's state machine growing into the other's.

**The PGN is parsed at BUILD time**, and the island receives a plain array of positions. chess.js therefore never enters the client bundle for replay mode, and a malformed PGN fails `npm run build` instead of rendering an empty board in production.

---

### Both inputs, one path — the board is not the only way to move

Chessground takes **pointer input only**. `MoveInput.tsx` is the second door:
SAN, French SAN (`Fc4`, `Cxe5`, `e8=D`), and coordinates. Two rules hold it
together, and both are Critical Features:

1. **The typed path and the dragged path converge on the same `onMove(from, to)`.**
   There is no accessible *variant* of the game logic to drift out of sync.
2. **"I could not read that" and "that move is not available" are different
   messages.** An unreadable or illegal entry never reaches the judge and is
   **not** counted as an attempt.

⚠️ `R` is the rook in English and the king in French. The reader's own locale is
tried first, the other reading only if the first is not legal here.

⚠️ **Focus follows the modality of the last move, not the device** — typing
returns focus to the field, tapping does not. `useMoveSource.ts` owns it. A
device test gets this backwards in both directions; see
[`docs/reference/testing.md`](./docs/reference/testing.md).

### ⚠️ AN UNKNOWN CUSTOM PROPERTY FAILS SILENTLY — and it has bitten three times

`var(--does-not-exist)` invalidates the **whole declaration** at computed-value
time. No error, no warning, no visible red — just a border that computes to
`0px` or a font that falls back to Inter.

| Written | Real token | Damage |
|---|---|---|
| `--mcc-border` | `--mcc-border-subtle` / `--mcc-border-strong` | 12 borderless elements across 7 files |
| `--font-mono` | `--font-notation` | every inline notation in every lesson set in Inter |
| `--font-display` | `--mcc-font-display` | a heading that never follows the theme |
| `--mcc-text`, `--mcc-text-muted` | `--mcc-text-primary` / `--mcc-text-secondary` | the child picker's buttons and intro drew no colour at all |

**The rule: assert the RESOLVED value, never that a rule exists.** A spec
asserting the rule would have passed throughout all four bugs.

### ⚠️ A SCOPED `<style>` DOES NOT REACH AN ELEMENT THE SCRIPT CREATED

Astro stamps `data-astro-cid-*` at **build** time onto the elements a component
declares, and compiles `.child-choice` to `.child-choice[data-astro-cid-…]`. An
element built at runtime carries the class and not the attribute, so **every
rule silently misses it.** Nothing errors; the tell is a control that looks like
it belongs to a different website.

**Anything painted by script is styled from a real stylesheet** — `admin.css`,
`family.css` — imported by the component, and structure still comes from
`controls.css`. ⚠️ Prefix those rules with the section class (`.family .child-…`)
so the cascade is settled by **specificity, not by stylesheet order**, which is
not guaranteed for a component-imported sheet.

### The rest of the board

Board geometry is unforgiving and every part of it was measured rather than
guessed — the frame belongs on the component box and not the playing surface,
Chessground leaves up to 8px of the host unused, the coordinates live in an
outer gutter, and a demonstration board must be visibly distinguishable from a
board you play on.

**➡️ [`docs/reference/board.md`](./docs/reference/board.md)** — the Preact
gotchas that have already cost sessions (hydration, stale closures, `viewOnly`
being bind-time only, rejected moves needing a `revision` bump), the Chessground
import paths and theme selectors, the frame/gutter geometry with its
measurements, and the board-affordance tags. **Read it before touching any board
component or board CSS.**

---

## Licence — TWO of them. DECIDED (Sessions 3 and 4, by Seàn).

**The code is GPL-3.0-or-later. The teaching content is CC BY-NC-ND 4.0.** Two
works aggregated in one public repository, which the GPL expressly permits.

**The line is SUBSTANCE vs STRUCTURE.** The prose, the commentary, which lines a
trap shows, what an arrow says and the design of each exercise are CC. Everything
else — including content *structure*: `content.config.ts`, the Zod schemas, every
field name, the ply-numbering scheme, the UCI encoding, and every component that
renders any of it — is GPL. Someone may take this engine and write their own
content against the same schemas; they may not republish *these* lessons.

The GPL is forced by **Chessground** (GPL-3.0-or-later). Three consequences that
are Critical Features, not decoration:

1. `LICENSE` holds the **verbatim** GPL text. Do not edit or "modernise" it.
2. **The source link renders in the footer of EVERY page** — the requirement is
   that the source reach the *users of the website*, and a reader who never opens
   the legal notice is still a user. Four routes assert it.
3. `/mentions-legales/` carries the credits table and the CC BY-SA attribution to
   **Colin M.L. Burnett**. Every name and URL behind it is **data** in
   `site.legal`; every sentence is a string in `src/i18n/ui.ts`.

⚠️ **Check the licence BEFORE adding any dependency or asset.** GSAP was rejected
on these grounds ("no charge" licence, not OSI — see
[`docs/reference/motion-sound.md`](./docs/reference/motion-sound.md)), and most
lichess piece sets are unusable here.

**➡️ [`docs/reference/licence.md`](./docs/reference/licence.md)** — the full
dependency table and what each licence obliges.

---

## Play mode — Stockfish in a Worker

`/jouer/`. A full game against the engine, entirely in the browser. Nothing is
sent anywhere. The rules that bind other work:

- ⚠️ **The engine loads on a CLICK.** `@lib/engine/stockfish` is reached by
  `await import()` **inside the start handler**. Never hoist it, and never let
  `PlayBoard.astro` reference it — Vite would pull 3.6 MB into the page's module
  graph. `tests/e2e/play.spec.ts` asserts it against the network log.
- ⚠️ **Stockfish is NEVER precached** (Critical Feature 6). `globIgnores` keeps it
  out; a runtime `CacheFirst` rule caches it after the first game.
- ⚠️ **The level presets are MEASURED, not reasoned.** `Skill Level` alone cannot
  make a beatable opponent — every Stockfish search ends in a quiescence search,
  so no `(skill, depth)` pair will ever hang a piece. Weakness comes from
  `blunderChance`, and **0.4 is a ceiling, not a dial to turn up**. Re-measure
  with `scripts/engine-lab`; do not re-reason.
- ⚠️ **The engine is just a `MoveProvider`** (`src/lib/chess/opponent.ts`) — a
  position goes in, a move comes out. That interface is the v2 online-play seam,
  and `PlayView` must talk to nothing else.
- `stockfish` is **not** a project dependency; the engine is vendored under
  `public/engine`, which must stay **out of the TypeScript project** (it kills
  `astro check` with a V8 heap OOM naming no file).

**➡️ [`docs/reference/engine.md`](./docs/reference/engine.md)** — why Stockfish 11,
the measured preset table and the reference bots, the fixed 64 MiB memory, and
the random-move implementation. **Read it before re-tuning a level.**

---

## Exercise validation rule — `onlyMove` semantics

`onlyMove` is a boolean on every exercise, defaulting to **false**.

| Value | Meaning |
|---|---|
| `true` | The stored `solution` is the **only** accepted line. Anything else is wrong, even if it also wins. Forced mates, single-tactic puzzles. |
| `false` *(default)* | The stored `solution` is the **model** line. Any move that also wins **should** be accepted once the engine-backed validator lands. |

**Until that validator exists, `onlyMove: false` must not tell the player they are wrong.** It accepts the stored line and, for anything else, says *"not the line we had in mind"* — not *"incorrect"*.

This is not pedantry. A beginner who plays a different winning move and is told it is an error learns that correct moves are mistakes, which is worse than shipping no validation at all. If you are ever unsure which behaviour to implement, implement the one that cannot lie to the student.

#### How this is implemented, and how it is policed

**Both verdicts count an attempt, both shake, both reset the board, and both look identical on the board.** The *only* difference is which sentence renders — `exercise.wrong` vs `exercise.offLine` — plus the caveat line that only the permissive verdict carries. `.mcc-message-wrong` and `.mcc-message-off-line` share a colour on purpose: under `onlyMove: false` we do not know that the reader was wrong, so we must not paint them as wrong either.

**Winning-alternative acceptance is DEFERRED, not faked.** v1 validates against the stored `solution[]` and nothing else. There is no heuristic, no "close enough", no material count pretending to be judgement. When Stockfish lands (Phase 2) it can adjudicate an alternative properly, and that is the only thing that will change this. Do not ship a fake in the meantime — a validator that is wrong 5% of the time is worse than one that admits it does not know.

**`scripts/check-content.mjs` polices `onlyMove: true`.** For a mating line of ≤ 2 player moves it brute-forces every first move that also forces mate in the same number, and **fails the build** if there is more than one. `onlyMove: true` makes the site tell a student that any other move is wrong; that claim has to be true.

This is not hypothetical — it fired during Session 3 on `opposition-et-mat`, where `1. Kf7` mates as surely as `1. Kg6` does. That exercise is `onlyMove: false` for exactly that reason, and `tests/e2e/exercise.spec.ts` asserts it never says "wrong" in either language. **If that test ever fails because the copy changed, it is not a test to update. It is a regression.**

`opponentReplies` is aligned index-for-index with `solution`: `opponentReplies[i]` is played after `solution[i]`. It is normally `solution.length - 1` long, because the last player move ends the exercise. The schema enforces `opponentReplies.length <= solution.length`.

Moves are stored as **UCI** (`e2e4`, `e7e8q`), not SAN: UCI is unambiguous without a board, and it maps 1:1 onto what Chessground emits and chess.js accepts.

---

## PGN language rule

`pgn` fields hold **standard, language-neutral notation.** No `{...}` commentary inside the PGN, ever.

Two reasons:
1. A PGN can carry only one language of commentary and this site ships two.
2. A clean PGN stays paste-able into Lichess, SCID or a printed handout, unchanged.

All prose lives in the frontmatter `moveComments` array, keyed to a **ply index** with `fr` / `en`. **Ply 0 is the first half-move** (`1. e4`); `-1` is the starting position. `src/lib/chess/replay.ts`, the schemas and `scripts/check-content.mjs` all use that one scheme.

`scripts/check-content.mjs` fails the check if a PGN contains braces, if a comment or shape points past the end of the game, if either language of a comment is empty, or if an arrow starts from an empty square. That last one is not theoretical — it caught an arrow drawn `f3→e5` on the ply where the knight had *already left* f3 (shapes are drawn on the position **after** the ply, and the move highlight shows the move itself anyway). Circles **may** sit on empty squares: marking a weak square is normal teaching.

Piece letters in the notation stay English (`N`, `B`, `Q`) — that is what "standard" means. If French piece letters are ever wanted for display (`C`, `F`, `D`), that is a **rendering** transform applied from the parsed move list, never a second stored PGN.

---

## Content model (Astro content collections)

> ### ⚠️ PLY 0 IS THE FIRST HALF-MOVE. READ THIS BEFORE WRITING ANY COMMENTARY.
>
> Every `ply` in this repo — `moveComments`, `shapes`, lesson board `comments` —
> is **0-based**:
>
> | ply | move |
> |---|---|
> | `0` | `1. e4` — White's first |
> | `1` | `1... e5` — Black's reply |
> | `2` | `2. Nf3` |
> | `-1` | the starting position, before any move |
>
> **A comment on White's *n*-th move is at ply `2(n-1)`; on Black's, `2(n-1)+1`.**
>
> This is the single most repeated authoring error in the project. A batch
> written elsewhere used 1-based numbering throughout: two comments overflowed
> the PGN and failed the build, and **eleven attached silently to the wrong
> move** — "the knight comes out and attacks e5" rendered on Black's reply
> instead. It looks completely normal on the page.
>
> `scripts/check-content.mjs` catches an overflow. **It cannot catch an
> off-by-one that still lands inside the game** — only reading the replayer can.
> So: count from zero, and step through the board once before merging.

```
src/content.config.ts   # ⚠️ Astro 7 location — NOT src/content/config.ts
src/content/
  traps/        legal.json
  cours/        bien-ouvrir-une-partie.json
  exercices/    mat-de-l-escalier.json
```

**All content is `.json`, not `.md`.** A Markdown body can only be in one language; this site has two. Keeping every field in typed frontmatter means the FR/EN pair is visible to the schema, and a missing translation is a validation error rather than a page that silently renders French to an English reader.

Astro 7 deltas to remember: config lives at `src/content.config.ts`, each collection declares an explicit `loader: glob({...})` from `astro/loaders`, and Zod is imported from `astro/zod` (v4) rather than the deprecated re-export from `astro:content`.

| Collection | Key fields |
|---|---|
| `traps` | `title_fr/_en`, `slug`, `eco?`, `level`, `themes[]`, `pgn`, `notes[]{ply,text_fr,text_en}`, `summary_fr/_en` |
| `cours` | `title_fr/_en`, `slug`, `level`, `order`, `summary_fr/_en` |
| `exercices` | `title_fr/_en`, `slug`, `fen`, `solution[]` (UCI), `opponentReplies[]` (UCI), `onlyMove`, `hint_fr/_en`, `level`, `themes[]` |

`level` is `debutant | intermediaire | avance` everywhere. Every collection has `draft: boolean` (default false) so an entry can be parked without deleting it.

---

### Content validity is checked, not assumed

`node scripts/check-content.mjs` replays every line through chess.js. A Zod
schema proves an entry is well-*shaped*; it cannot prove it is legal chess —
`"e2e5"` is a valid UCI string and an illegal move. It checks PGNs parse, plies
exist, solutions and opponent replies interleave legally, `onlyMove: true` is not
a lie, the student always plays the same colour, the FEN has all six fields, and
that nothing is half-translated.

#### ⚠️ A LEGAL POSITION IS NOT A CORRECT ONE — verify the CLAIM, not the chess

`check-content.mjs` proves a position is *possible*. It cannot read the sentence
next to the board, and that is where content actually goes wrong. Content batch 3
shipped **four** positions that passed every check and each described a mechanism
the position did not contain — including a "pin" blocked by the d7 pawn, which is
the single most common wrong idea about the Ruy Lopez and would have shipped as
fact.

**THE RULE — every diagram is replayed and its claim asserted BEFORE merge.** No
board merges on "it parses". Since batch 3 that is **data, not discipline**: a
board carries a `claims[]` array (`pin`, `fork`, `discovery`, `line`) and
`check-content.mjs` proves each one on every build.

- ⚠️ **A trap's claims carry a `ply`; a lesson board's must not.** Both mistakes
  fail the build.
- ⚠️ **`kind: 'manual'` is the honest escape and REQUIRES a `note`.** Manual
  claims and boards with no claims at all print as a **review queue**, which
  deliberately does not fail the build.
- ⚠️ Anything added to `assertClaim` gets the same treatment as the originals:
  **write the fixture that must fail, watch it fail, then delete it.**

**➡️ [`docs/reference/content.md`](./docs/reference/content.md)** — the four
positions that shipped wrong, the claim kinds in full, the deferred per-locale
Markdown decision for course bodies, and the beginner tutorial
(`/apprendre-les-bases/`, which adds no new board and no new mode, and namespaces
its progress under `tutorial:<slug>`). **Read it before writing any content.**

---

## Routes

FR at the root, EN under `/en/...`. **Route segments are not translated** (`/en/pieges/`, not `/en/traps/`) — one segment vocabulary means the language switcher is a pure prefix swap that can never fail to find its counterpart. Visible nav labels are translated; URLs are structural.

| Route | EN | Notes |
|---|---|---|
| `/` | `/en/` | Home — the **main menu** (E5); descriptive content below the fold |
| `/cours/` | `/en/cours/` | Course index (cards) |
| `/pieges/` | `/en/pieges/` | Trap index (cards, ECO + theme chips) — **no board mounted here** |
| `/pieges/[slug]/` | `/en/pieges/[slug]/` | Trap detail — the replayer, commentary, outbound WhatsApp share |
| `/exercices/` | `/en/exercices/` | Exercise index — **no board mounted here**; solved ticks from `localStorage` |
| `/exercices/[slug]/` | `/en/exercices/[slug]/` | Exercise detail — the interactive board, hint, attempts, outbound WhatsApp share |
| `/jouer/` | `/en/jouer/` | Play the computer. Engine loaded on a click, never before. |
| `/agenda/` | `/en/agenda/` | Sessions, **from the `sessions` table, baked at build**. Venue falls back to site config. See the agenda rule below |
| `/contact/` | `/en/contact/` | WhatsApp CTA, venue, socials |
| `/mentions-legales/` | `/en/mentions-legales/` | Legal notice + credits. **Footer only, not in the nav.** |
| `/parametres/` | `/en/parametres/` | Appearance settings. Reachable from the **desktop header** (gear, beside the theme toggle) and the footer. |
| `/progres/` | `/en/progres/` | Local progress: three group bars, exercises by level and by theme, what is left, and a resume card. Read from `localStorage`, no account. **Rank and points say "bientôt" and print no number** — nothing computes one. |
| `/connexion/` | `/en/connexion/` | **NOT EMITTED by default** — see the account flag below |
| `/compte/` | `/en/compte/` | **NOT EMITTED by default** — see the account flag below |
| `/auth/callback/` | — | **NOT EMITTED by default.** The only unlocalised route |
| `/admin/` | — | **NOT EMITTED by default.** Staff dashboard. **FR only** — see Critical Feature 43 |
| `/admin/eleves/` | — | **NOT EMITTED by default.** The class list — **children, not accounts** |
| `/admin/eleve/` | — | **NOT EMITTED by default.** One learner, by `?id=` — a query param, not a segment, and forced by the static build |
| `/admin/seances/` | — | **NOT EMITTED by default.** Sessions + the attendance register |
| `/manifest.webmanifest` | — | Generated from `src/config/site.ts` |

⚠️ **`/auth/callback/` is no longer the only unlocalised route** — the four
`/admin*` routes are unlocalised too, for a different reason. The callback is
machinery a reader never navigates to; `/admin*` is French **content** for a
single-operator audience. Neither is a precedent for a public page.

Each route file is a two-line shell that renders a shared component from `src/components/pages/` with a `locale` prop, so the two locales cannot drift apart structurally.

Detail routes take their URL from the content's **`slug` field, not the filename**, so renaming a file can never silently move a published URL. `/cours/[slug]/` is still to come.

⚠️ **The EN legal notice is `/en/mentions-legales/`, not `/en/legal-notice/`.** The Session 3 brief asked for the translated segment; it is deliberately not implemented that way, because the no-translated-segments rule above is what makes the switcher a pure prefix swap that *cannot* fail to find its counterpart. A translated segment needs a lookup map, and a missing entry 404s a reader mid-visit — on the one page whose whole job is to be findable. The visible link label **is** translated ("Mentions légales" / "Legal notice"); the URL is structural. Flagged for Seàn: it is a one-line change in `paths.ts` plus a map if he wants the English URL, and the site is unlaunched so it is still cheap to reverse.

---

## Progression — ranks, points, streaks, achievements (E3)

Everything is LOCAL: `localStorage`, guest-first, no account anywhere in it.
Ranks are **Pion → Cavalier → Fou → Tour → Dame**.

- ⚠️ **POINTS ARE DERIVED, NEVER BANKED** (Critical Feature 33). There is no
  `points` number in `localStorage` and there must never be one. A stored balance
  is a number a student types into a console in three clicks; a derived total is
  exactly as good as the records behind it. Two things fall out for free: **no
  farming, with no anti-farming code**, and a multi-board lesson awarding on its
  last board.
- ⚠️ **NO POLICY LIVES IN THE INLINE SCRIPT.** Every award value, threshold and
  condition arrives as **data**, computed at build time by `scoreboard.ts` from
  `points.ts`.
- ⚠️ **NO DAILY OR CONSECUTIVE-DAY STREAK. EVER** (Critical Feature 34). The club
  meets weekly; a daily streak would punish the normal rhythm of the people it is
  for. The session streak (`sessionStorage`) is the honest version, and it is
  **never presented as a loss**.
- ⚠️ **A loss costs nothing** (Critical Feature 35). Losses and draws are recorded
  and read by no scoring rule at all.
- ⚠️ Thresholds are absolute numbers and the content will grow, so re-tuning is
  expected — but it may only move in the direction that does **not demote**
  anyone who already holds a rank.
- ⚠️ **When accounts land, the balance must be computed SERVER-SIDE.** No endpoint
  may take a total, a rank or an achievement list as input. The client may send
  *what it solved*; the server decides what that is worth. Nothing in `points.ts`
  may become a wire format for a client-supplied total.

### ⚠️ A CARD THAT RENDERS HAS A DESTINATION

`CardItem.href` is **required**. There is no unlinked card state on `/cours/`,
`/pieges/` or `/exercices/`, and there is not going to be one. `/cours/` shipped
one: a full card that did nothing when clicked. **That is worse than the card
being absent** — an absent card tells a reader nothing is there; a present, inert
one tells them the site is broken, and nothing is *missing* from the page for a
test to notice.

Two halves hold it: the type (`href: string`), and `index-cards.spec.ts`, which
asserts every card's link **resolves 200** and that the index is non-empty first.

**A course with no lessons FAILS THE BUILD**, naming the slug and both ways out.
`draft: true` is how you park a course that is genuinely being written.

**➡️ [`docs/reference/progression.md`](./docs/reference/progression.md)** — the
thresholds and why those numbers, the achievement bookmark, the inline-script
size decision, and why the `les-bases` record was removed rather than linked.

---

## ⚠️ MOBILE AND DESKTOP DIVERGE AT 768px — ON PURPOSE (M1 + M2)

| | below 768px | 768px and above |
|---|---|---|
| Navigation | fixed **bottom bar**, four entries | grouped header, unchanged |
| Header | **one line**: name + theme + language | logo, nav groups, settings, theme, language |
| Home | **dashboard** | the E5 retro menu |

⚠️ **DO NOT "UNIFY" THESE. THE DIVERGENCE IS THE FEATURE.** The retro menu was
designed for a large screen; at 390px it was two stacked menus before any useful
content. That is not an execution defect — the design was wrong for the format.
`mobile-app.spec.ts` pins **both sides** of the breakpoint, 767px and 768px
explicitly.

The rules that bind work elsewhere:

- **The bottom bar has exactly four entries and never hides on scroll.** Settings
  is deliberately not one of them. No page may hide content behind the bar —
  `env(safe-area-inset-bottom)` is needed in **two** places.
- ⚠️ **NO ROUTE MAY EXIST ON ONE LAYOUT ONLY** (Critical Feature 36). Every
  destination the bar reaches must be reachable from the desktop header, and the
  spec **reads the list off the bar** rather than hard-coding it. `/progres/`
  shipped reachable from the bar and from nothing at all on desktop: the page
  built, rendered and passed every one of its own specs.
- **Below 768px the exercise controls compact; the board never does.** The board
  is the thing being taught with. It is **CSS only** — the dense row is built with
  flex `order`, so the DOM (and the screen-reader reading order, and the ≥768px
  layout) is untouched.
- **Every long route ends with a way onward**, clear of the fixed bar, from the
  **same i18n key** as the link at the top.
- **The home menu's labels ARE the nav's labels**, from the same `nav.*` keys
  (Critical Feature 20). Never a second string for one destination. The spec reads
  the header's own labels off the page rather than hard-coding words.
- **The home menu works with no JavaScript** (five entries, not six — "Reprendre"
  is a claim about stored progress) and fits one screen on a phone.
- ⚠️ **There is ONE resume rule** (`ResumeResolver.astro`) **and ONE key scheme**
  (`src/lib/journey.ts`). Four surfaces read them; a second copy of either is how
  two pages come to disagree about what a reader has done.
- ⚠️ **NEVER PUT `opacity` ON TEXT OVER AN AUDITED FILL.** `check-contrast.mjs`
  proves the token pair and cannot see an alpha applied on top of it: 0.9 dropped
  a proved pair to 4.42:1 and cost a Lighthouse regression the whole Playwright
  suite passed. Differentiate by size, weight and letter-spacing.
- Navigation is **disclosure semantics, not `role="menu"`**; panels open on
  **click, never hover**; the `html.js` gate means no layout shift and no no-JS
  trap.

**➡️ [`docs/reference/ui-navigation.md`](./docs/reference/ui-navigation.md)** —
the measurements behind the M3 compaction, how the two home pages coexist, the
"Reprendre" resolution rule in full, where `/progres/` went and why, and the
disclosure-nav details. **Read it before touching the header, the bar or home.**

---

## Motion — THE THREE FAMILIES (E1)

`src/lib/motion.ts` is the single source for every duration on the site. The
site should feel like a game because it **responds**, not because it is dressed
up: an animation that is not the answer to something the reader did is
decoration, and decoration goes last or not at all.

| Family | Band | What belongs in it |
|---|---|---|
| **Réponse** | 120–180ms | what follows a **click** |
| **Transition** | 250–350ms | a **state change** the reader should watch land |
| **Ambiance** | 4–20s | background drift **only**, never carrying information |

- ⚠️ **NOTHING SITS BETWEEN 180ms AND 250ms.** The gap keeps "the site heard me"
  and "watch this change" legible as two different things. A duration that wants
  to live in the gap is a **design question, not a tuning question**.
  `feel.spec.ts` **sweeps every element** on three routes — a list would miss the
  `220ms` that appears in a component nobody thought to add to it.
- **Pacing, offsets and composites are not families** and must not be forced into
  one. A shake is four Réponse beats, spelled as arithmetic on the constant.
- **CSS mirrors the numbers and the spec reads them off the live document** and
  asserts they equal the imported constants. Mirrors drift; this one is checked.
- ⚠️ **THE BOARD STAYS SOBER** (Critical Feature 16). Motion lives *around* it.
  The one exception is the correct-move pulse — one Transition, one square,
  exercise mode only.
- ⚠️ **Reduced motion means OFF for decoration and INSTANT for feedback** — never
  "the same show, slower". Ambiance is switched off entirely; Réponse and
  Transition collapse to 1ms (not 0 — a transition that can never complete is a
  trap). **Feedback is never removed.**
- **The thinking delay is a FLOOR, not a fixed wait**, and reduced motion drops it
  to 150ms rather than 0: collapsing it makes a screen reader announce the
  opponent's reply as part of the reader's own move.
- ⚠️ **GSAP was evaluated and REJECTED — do not add it.** Its licence is not OSI
  and this repo is GPL. The visual result was delivered in CSS + ~20 lines of
  vanilla JS at ≈1.3 KB gzip.
- ⚠️ **The ambient opacity ceiling is enforced by the GROUP, not by each piece**,
  and `check-contrast.mjs` cannot see it. The light lede drops below AA at ~0.075;
  we ship 0.055. Raising it means re-running the arithmetic by hand.

## Sound — SYNTHESISED, OFF BY DEFAULT (E2)

- ⚠️ **`src/lib/sound.ts` is the ONLY file that may make a sound** (Critical
  Feature 37). No other module constructs an `AudioContext`, an oscillator or a
  gain node. Islands call `play(event)`.
- ⚠️ **No `AudioContext` before a user gesture, and exactly one for the life of
  the page** (Critical Feature 38). One per sound exhausts the browser's limit
  inside a single exercise, after which every later sound fails silently.
- ⚠️ **Sound is never the only signal** (Critical Feature 39). Every voice
  accompanies a visual that fires independently, which is what makes it safe for
  `play()` to give up quietly.
- **No audio files** — 0 bytes precached, no licence question, one file to tune.
- ⚠️ **The wrong-move voice is the one to get right.** A buzzer is trivially easy
  and would be the wrong instrument for a teaching tool used by children: an error
  must inform, not scold.
- **Nothing sounds for navigation, hover, scroll or page load.**
- `prefers-reduced-motion` does **not** silence the site — different sense — but
  it does suppress the one-time *offer*.

**➡️ [`docs/reference/motion-sound.md`](./docs/reference/motion-sound.md)** — the
six voices with their waveforms, the E1 audit decisions, the ambient layer's two
layers, `controls.css`, and the note that **Playwright's headless WebKit has no
Web Audio at all** (so three specs skip visibly, and the degradation path is
itself covered on all five projects).

---

## Design tokens, themes and typography

`src/styles/tokens.css` is the source of record. Direction: **"old chess club"**
— wood panelling, green baize, brass lamps, yellowing score sheets. Components
never hardcode a colour or a font; they consume tokens.

- ⚠️ **Contrast is proved, not eyeballed.** `scripts/check-contrast.mjs` parses
  the real CSS (it keeps no copy of the hexes), runs **275 assertions** — 4 themes
  × 2 modes × 27 pairs, plus every board preset — and is the **first step of
  `npm run build`**, so a regression stops the build before anything else is
  spent. Its colour maths is a deliberate **second implementation**: an auditor
  sharing a formula with the code it audits agrees with its own bugs.
- ⚠️ **A failing combination is fixed or dropped, never excepted.**
- ⚠️ **Brass as text fails on cream.** `.text-brass` resolves `--mcc-accent-text`;
  brass **fills** carry ink labels, never white. This is an **unlayered** override,
  and unlayered CSS beats Tailwind's layered utilities regardless of specificity —
  so `text-white` on `.bg-brass-500` **silently does nothing**. That is intentional
  (it enforces AA app-wide); opt out with `text-cream-50!`, never with a second
  unlayered rule.
- ⚠️ **Only the `--mcc-*` layer flips with the theme.** A component reaching past
  it for a raw `--color-*` step will stay light-mode-only.
- **Four themes** (Bois, Marbre, Souiri, Terminal), each declaring both light and
  dark. **Light/dark is not a fourth axis.** Bois is the base and its values stay
  in `tokens.css`, so a reader with no stored preference — **or no JavaScript** —
  gets a complete theme.
- ⚠️ **Every theme clears AA in BOTH modes against every board preset** (Critical
  Feature 22). **The body typeface never changes with the theme** (23) — headings
  do. **A theme loads only its own heading font and piece set** (24), asserted
  against the network log. **Every piece set is licence-checked individually and
  credited** (25) — for three of the four that is a condition of use.
- ⚠️ **A piece set is only legible on SOME boards**, and that is audited too: a
  monochrome set on a dark board measured **1.03:1** with nothing erroring and
  every contrast assertion passing.
- ⚠️ **`boardTheme` is optional and absence is a real state** — absent means
  "follow the theme", present means the reader **pinned** a preset, and a pin
  survives a theme change.
- ⚠️ **`src/lib/theme.ts` is the single migration point**, on the same rules as
  `src/lib/progress.ts`. The head script duplicates `applyTheme()` **deliberately**
  — it must run before first paint, so it cannot import — and a no-flash spec
  fails if it is ever moved out of the head, made a module, or made async.
- ⚠️ **An `is:inline` script ships VERBATIM, comments and all.** Written in this
  codebase's usual commented style the head script measured 8.4 KB × 84 documents.
  Rationale goes in the frontmatter, which compiles away. Anything added to an
  inline script follows the same rule.

**➡️ [`docs/reference/theming.md`](./docs/reference/theming.md)** — the theme
cascade arithmetic (where a tie decided by source order paints white on white),
the piece-set licence table and which sets are unusable here, the
`background-size` cycling bug, the typography rules, and the four theming layers.
**Read it before adding a theme, a preset, a piece set or a font.**

---

## ⚠️ ACCOUNTS ARE SWITCHED OFF IN PRODUCTION

`PUBLIC_AUTH_ENABLED`, read once in `src/config/auth.ts`. **Default `false`.**
The whole auth stack — including v2-S3 sync and the v2-S4 role foundation — is
built, tested and merged; it is simply not shipped. Turning it on is a release
decision and **Seàn's call**, not a side effect of a session.

**OFF means NOT BUILT** (Critical Feature 18): the routes are not in `dist/`,
there is **no Supabase ref, host or anon key anywhere in the bundle**,
`@supabase/supabase-js` is not bundled at all, and `AccountButton` renders
nothing. Nothing is deleted — v2-S3 sets the variable and the feature returns.

- ⚠️ **`getStaticPaths()` returning `[]` is not enough on its own.** Astro
  collects a page's `<script>` blocks from the **module graph**, not from what
  renders, so the first disabled build shipped 216 KB of unreachable Supabase and
  precached it. The fix is an **alias** in `astro.config.mjs` cutting the graph at
  the module.
- ⚠️⚠️ **`import.meta.env.NAME`, NEVER `import.meta.env['NAME']`** (Critical
  Feature 19). Vite statically replaces dot access only; given a computed key it
  emits **the whole env object**, anon key included. The build meant to prove
  accounts were disabled contained the production JWT — the guarantee was false
  while looking true, and only reading `dist/` showed it.

### v2 — the locked decisions

**Still static** (no adapter, no SSR, non-negotiable). Supabase is **client-side
only**; **all** security is RLS. **Guests are first-class forever** — accounts add
sync and teacher oversight, and **gate nothing**. Content **stays in git**. Auth is
magic-link + Google, **no passwords**; **SMS is rejected**, do not reintroduce it.

- ⚠️ **The guest zero-request rule wins every conflict.** A visitor reading a
  lesson causes **zero** requests to any Supabase origin and does not download the
  client at all. `supabase.ts` is the only file importing it, every caller uses
  `await import()`, and **`auth-flag.ts`, `progress-sync.ts` and `child.ts` must
  never statically import it** — one static import puts 207 KB into every page
  with a board. Asserted against the network log on six content routes.
- **The magic-link flow is IMPLICIT**, deliberately: PKCE keeps a verifier in the
  browser that *requested* the link, and email is routinely opened elsewhere.
- ⚠️ **`progress.ts` is still the single reader** and its public API did not
  change shape. Signed out is `localStorage` only; signed in, **reads never touch
  the network** and writes go local first, then queue.
- ⚠️ **Canonicalise timestamps through `Date.parse` → `toISOString` before
  comparing.** Postgres returns `+00:00` and JS writes `Z`; `+` sorts before `.`,
  so a lexicographic compare is *wrong*, not merely untidy.
- ⚠️ **The learner is a child profile, never the account** (Critical Feature 40).
  An autonomous teenager is an account holding exactly **one** child — one code
  path, not two. **Graduation is one FK update** (41); if it ever requires copying
  rows between tables, the shape is wrong. **"Qui joue ?" is a choice, not a
  password** (42) — the account is the security boundary.
### The admin surfaces (v2-S4 part 2) — BUILT, and the flag is still OFF

`/admin/` (dashboard), `/admin/eleves/` (the class), `/admin/eleve/?id=…` (one
learner), `/admin/seances/` (sessions + the register). Reached from `/compte/`,
which is the only entry point. **No new migration** — 0001/0004/0005 already
carried every table and policy these needed, which is what "the boundary
underneath is already proven" in BACKLOG meant.

- ⚠️ **FRENCH ONLY** (Critical Feature 43). No `t()`, no `/en/admin/`, no i18n
  scaffolding. Same decision as BabyClub, same reason: a single-operator context
  — Seàn and one or two profs, in French, in a room in Essaouira. The FR/EN rule
  is about **readers**, and an admin screen has no such audience. **A future
  session must not "fix" this by adding translations; the missing English is the
  decision.** `admin.spec.ts` asserts `/en/admin*` 404s.
- ⚠️ **`singleLocale` on BaseLayout suppresses the hreflang alternates AND the
  language switcher.** Both halves are needed: left on, the alternates advertise
  a 404 to search engines and the switcher offers a reader a one-way trip to it.
  It is **not** an escape hatch for public pages, and a spec asserts a public
  page still carries both.
- ⚠️ **RLS is the security; the role check is UX** (Critical Feature 44). The gate
  in `AdminShell` decides what to DRAW. `role-separation.spec.ts` proves the real
  boundary through PostgREST with a real student's token — including that a
  student cannot read the class list, a prof can read every child and **write
  none**, and the award bounds hold with the form nowhere in the picture. **If an
  assertion about who may see what ever lands in `admin.spec.ts`, it is in the
  wrong file.** ⚠️ The gate **fails closed**: a thrown fetch denies.
- ⚠️ **The class list is CHILDREN, not accounts.** A parent with three children is
  three rows. This is why 0005 landed first.
- ⚠️ **The child id is a QUERY PARAMETER, not a route segment**, and that is
  forced: a static build would have to enumerate real students at build time to
  emit `/admin/eleve/<uuid>/`, which means publishing the class list in `dist/`.
- ⚠️ **The register is one tap per child, no modal, no save button** (Critical
  Feature 45). The write is **optimistic** — the state flips on the tap, because
  a prof cannot wait for a round trip twenty times on mobile data — and a failed
  write is **loud and does not revert**, because a mark that silently undoes
  itself is worse than one that never happened. **Nothing moves after a tap**: a
  list that reorders under a thumb is how the next student gets marked wrong.
  Measured at **59 ms of UI per child** — see `attendance-timing.spec.ts`.
- ⚠️ **A cancelled session is a STATE, never a deletion** (Critical Feature 46).
  `on delete cascade` means deleting one destroys a register that may already
  have been marked, so the UI offers no delete at all.
- ⚠️ **Teacher awards are ROWS mirrored into the local store, never a balance.**
  They are pulled on sign-in and **never pushed** — the client has no INSERT
  policy and must not act as though it might. `mirrorAwards()` **replaces**
  rather than merges, because the server is the only author; merging would make
  a withdrawn award immortal on whichever device saw it first.
- ⚠️ **`computeLedger()` in `src/lib/ledger.ts` is the ONE summation** (Critical
  Feature 47). `ScoreResolver`'s inline copy stays because it must run before
  first paint, and `admin.spec.ts` pins the two equal — a prof and a student
  reading different totals is the worst failure a progression display can have,
  and both numbers would look plausible.
- ⚠️ **Admin button colours live in `admin.css`, not a scoped `<style>`.** The
  session cards are built with `innerHTML` at runtime and Astro stamps its
  scoping attribute at **build** time, so a scoped rule would style the template's
  buttons and silently skip every identical one the script creates.
- ⚠️ **`src/lib/admin.ts` may be imported ONLY from `/admin*`.** It imports
  `@lib/supabase` statically, which is safe there and would break the guest
  zero-request rule anywhere else. A spec greps the built public pages for an
  admin chunk.
- ⚠️ **`role-separation.spec.ts` runs ONE AT A TIME.** Its tests share the same
  student, session and awards, and v2-S4 part 2 took it from two mutating tests
  to seven. They passed first time in parallel, which is exactly how that flake
  ships.

**Not built, deliberately:** creating a student from the admin UI (staff hold
SELECT on `child_profiles` and nothing else — a teacher renaming a child is
indistinguishable from a teacher inventing one). ✅ **The agenda now reads the
database** — see the rule below.

### ⚠️ THE PUBLIC AGENDA IS BAKED AT BUILD TIME — AND THAT IS FORCED

`/agenda/` reads the `sessions` table. **The git collection is retired and must
not come back** (`src/content/agenda/` is gone; `content.config.ts` says why).

The read happens in `scripts/fetch-agenda.mjs` at build, writing
`src/data/agenda.json`, which `src/lib/agenda.ts` is the only reader of.
**A runtime read is not available to this site** and the reasoning is closed:

- static output, no adapter, no SSR — there is no server to ask;
- **Critical Feature 9** — a public page makes no third-party request, so an
  anonymous visitor would otherwise contact supabase.co to find out when a club
  for children meets;
- **Critical Feature 18** — accounts OFF ships no Supabase ref, host or anon key
  at all, and a runtime read needs all three;
- and gating it on `PUBLIC_AUTH_ENABLED` fixes nothing, because production
  ships with accounts OFF — `/admin/seances` would go on silently doing nothing
  in exactly the state it is broken in.

⚠️ **THE FAILURE MODE IS STALENESS, AND IT IS MADE LOUD RATHER THAN SOLVED.** A
session published after the last deploy is not on the site. The public page
cannot know that; `/admin/seances` can, and says so — it is built in the same
build, so it knows what was baked, and it compares that against the live table
by fingerprint. **Anything added to the public agenda card must be added to
`sessionFingerprint()` in the same commit**, or a prof edits that field,
publishes, and is told the site is up to date.

- ⚠️ **The credentials are the BUILD's, never the bundle's.** The script runs in
  Node and exits; `anon` has held `select` on published sessions since 0001, so
  the anon key is enough and the service role is not wanted.
- ⚠️ **`src/data/agenda.json` is a GENERATED ARTEFACT and is gitignored.** The
  committed source is `agenda.fallback.json`. One committed file would be a
  footgun: a Playwright run builds against the TEST project, so `git add -A`
  would ship test sessions to the club as the production fallback.
- ⚠️ **No credentials is a dev build; broken credentials is a fatal build.**
  Shipping a stale agenda while believing it fresh is the failure the feature
  exists to remove, so that case exits non-zero.
- ⚠️ **`site.timezone` is an IANA name, never `+01:00`** — Morocco drops to
  UTC+0 for Ramadan and back. The snapshot records the zone it was baked in and
  the build FAILS if it disagrees with the config.
- ⚠️ **A cancelled session stays PUBLICLY visible with its state** (0006 widened
  the select policy). Critical Feature 46 is only half kept if a student cannot
  see the cancellation. **A draft never leaks.**
- ⚠️ **The seed must not delete migrated rows.** `seed-test.mjs` cleared every
  session, including the one 0006 inserted, moments after the migration created
  it.

### ⚠️ AN ACCOUNT DELETES ITSELF, AND THE FUNCTION TAKES NO TARGET

`delete_own_account()` (migration 0007), reached from `/compte/`. The privacy
notice always promised erasure; until now that promise was a volunteer
remembering to run SQL.

- ⚠️ **NO ARGUMENT, AND IT MUST NEVER GAIN ONE.** The id can only come from
  `auth.uid()`. A `delete_account(target uuid)` with an ownership check inside
  is one refactor away from deleting anybody — **the parameter list is the
  guarantee, not the body.** `authenticated` only; not `service_role`.
- ⚠️ **Two steps, and the second is a TYPED WORD** (`SUPPRIMER` / `DELETE`,
  case-exact). Two buttons in one place is one mis-tap on a family tablet, on
  the only action here nobody can undo.
- ⚠️ **The confirmation NAMES what goes** — children, progress, games, points,
  attendance. "Are you sure?" tells a reader nothing.
- ⚠️ **NOTHING IS RETAINED.** No statistics, no archive, no anonymised copy —
  and a spec asserts that rather than the notice claiming it. Device-local
  progress is deliberately untouched: it is the reader's own copy, it is what a
  guest has, and erasing it is not what the request asks for.
- ⚠️ **Local state is cleared only AFTER the server confirms** — the opposite of
  `signOut()`, which clears first. Wiping a device for a delete that did not
  happen destroys data the account still holds.
- ⚠️ **Anything exported from `supabase.ts` and imported by a page script must
  also be exported by `supabase.disabled.ts`**, or the accounts-OFF build fails
  outright — the alias replaces the module for scripts that are still *built*
  behind unemitted routes. The stub returns `{ ok: false }`: a stubbed success
  would tell a reader their data was erased.

### ⚠️ THE CHECKLIST FOR A MIGRATION THAT ADDS A TABLE

Four lines, and the last one has been forgotten **twice**. Work down it before a
migration ships:

```sql
create table public.<t> (...);                      -- 1. the table
alter table public.<t> enable row level security;   -- 2. RLS ON
create policy ... on public.<t> ...;                -- 3. the policies
grant select, insert, update, delete on public.<t> to authenticated;
grant select, insert, update, delete on public.<t> to service_role;  -- ⚠️ 4
```

⚠️ **EVERY NEW TABLE MUST GRANT `service_role` DML EXPLICITLY.** Default
privileges here do **not** hand it over; migration 0002 exists solely to repair
that across every existing table, and **0003 reproduced the bug anyway**.

⚠️ **RLS BEING CORRECT DOES NOT MEAN THE TABLE IS REACHABLE.** `GRANT` decides
whether a role may touch the table at all; RLS decides which rows. They fail
independently. **The tell is a `42501` from a caller that bypasses RLS entirely**
— `service_role` never hits a policy, so a permission error from it is *always* a
missing grant and never a policy bug.

⚠️ **Audit by exercising the table with a real trusted client after pushing**, not
by re-reading the migration. Reading the file is what produced the bug both times.

⚠️ **`anon` gets nothing** — deliberate: a guest writes to their own device only.

Migrations are numbered and **never edited after merge** — a fix is the next
number. Also binding:

- **Slugs are free text, deliberately not foreign keys.** Content lives in git.
- **`is_staff()` must be `SECURITY DEFINER` with a pinned `search_path`**, or a
  policy on `profiles` re-enters itself: *"infinite recursion detected in policy"*.
- **Ordering matters**: tables → functions → policies.
- **`role` is never client-updatable, and RLS alone does not achieve that** — the
  mechanism is **column-level privileges**. Promotion is SQL only (`docs/ADMIN.md`).
- ⚠️ **Dropping a column drops its primary key and its indexes, silently**, and a
  policy naming the column blocks the drop entirely (`2BP01`) — so policies come
  off **before** the column and are recreated after.
- **Deletion cascades from `auth.users`** — delete the *auth user*, never just the
  profile, or the erasure right is not honoured.
- **`handle_new_user()` clamps the locale** (a Google claim arrives as `en-GB`).

### ⚠️ The test-environment interlock

`assertNotProduction()` runs at **Playwright config load** and aborts the whole
run. The suite creates users and **purges by pattern**; pointed at production it
would delete real accounts. It **fails closed**.

⚠️ **Never widen `tests/e2e/env.ts` to fall back to `.env` or `.env.local`.** That
single edit is what would let production credentials into a suite that deletes by
pattern.

⚠️ **`.env.test` comes from `.env.test.example`, never from `.env.example`** — the
wrong template has cost `SUPABASE_PRODUCTION_REF` twice. And ⚠️ **the production
ref begins with `vtest`** (`vtestpaufxmrvdhgrrsy`) — it reads like the test
project and is the **live database**. Read the ref, never the vibe of the ref.

**➡️ [`docs/reference/supabase.md`](./docs/reference/supabase.md)** — the schema
decisions and their reasoning, the offline queue, the anti-cheat position and what
a real fix would need, the parent/child model in full, the RLS/GRANT audit, the
env-var table and both `.env.test` traps. **Read it before any migration or auth
work.**

---

## Analytics

Umami, env-driven. `PUBLIC_UMAMI_WEBSITE_ID` is read at build time from the Cloudflare **build** variables. When unset the snippet is **omitted entirely** — no empty `<script>`, no request to umami.is. That is also why dev, CI and the Playwright run make no third-party network calls at all, which `tests/e2e/pwa.spec.ts` asserts.

---

## Testing

Playwright + axe-core. Specs live in `tests/e2e/` and run against the **built** site served by `astro preview` — not the dev server. The service worker, the generated manifest and the self-hosted fonts only exist after `astro build` plus the post-build step, so testing the dev server would be testing a different application.

**Scripts — use these two, not the raw playwright commands:**

| | |
|---|---|
| `npm run test:branch` | chromium, specs mapped from what changed. **The per-session command.** |
| `npm run test:release` | the full matrix. **Promotion only** — see the verification policy. |

`test:e2e` and `test:e2e:chromium` still exist as thin escape hatches for
debugging a single project by hand. They are **not** the session commands: they
do no spec mapping, and `test:e2e` in particular is the raw matrix with none of
the exit-code and arithmetic checking `test:release` does for you.

---

### Manual testing — `npm run demo`, and nothing else

```sh
npm run demo              # build + serve the production build on localhost
npm run demo -- --host    # also expose it on the LAN, for a real phone
```

It clears the ports and sweeps orphaned previews and browsers first, **stops dead
if the build fails**, and prints the branch, the last commit, the URL and the path
to `docs/MANUAL-TESTS.md`. Do not hand-run `build && preview` any more.

#### Accounts ON — `npm run demo:accounts`, and never a hand-typed env line

```sh
npm run demo:accounts     # + `-- --host` for a real phone
```

⚠️ **`.env.local` HOLDS THE PRODUCTION PROJECT**, because that is what a deploy
build needs. So the dangerous mistake is not a build that fails — it is one that
**succeeds** while wired to the live database, where signing in on localhost
creates a real account and nothing announces it. `demo:accounts` reads the test
credentials through the same interlock as the e2e suite and **fails closed**;
never reconstruct it as `PUBLIC_SUPABASE_URL=… npm run demo`.

⚠️ **Never put `PUBLIC_AUTH_ENABLED` in `.env.local`.** The default build on this
machine must stay the shape production ships.

**➡️ [`docs/LOCAL-ACCOUNTS.md`](./docs/LOCAL-ACCOUNTS.md)** — seeding, the
no-email magic link, becoming a prof, and the walkthrough of the picker,
`/compte/` and the admin surfaces. **Read it before testing anything behind the
flag** — and its §7, which is what is *not* built.

#### ⚠️ THE FAMILY SECTION AND THE PICKER ARE TWO RULES, NOT ONE

`FamilySection.astro` on `/compte/`. Coupling these is what made "Ajouter un
élève" unreachable for every account that had never had a second child inserted
by SQL — see Critical Feature 48 and
[`docs/reference/supabase.md`](./docs/reference/supabase.md).

1. **The section renders for every signed-in account.** Adding, renaming and
   removing a student are things a parent does with one child exactly as much as
   with three.
2. **Only the "Qui joue ?" picker is conditional** — hidden at one child or
   fewer, because `resolveChild()` adopts a lone child silently and there is
   genuinely nothing to ask.

- ⚠️ **The roster and the picker are two lists of the same names, deliberately.**
  The picker is tapped by a child on a shared tablet; "Retirer" must not sit
  beside the button they are aiming for.
- ⚠️ **Removal is never offered for the last child.** `resolveChild()` creates
  one from the profile name the instant an account has none, so the control
  would be a lie: the child returns, renamed, with its history gone by cascade.
  The button is **absent**, not disabled, and a sentence says why.
- ⚠️ **Removal is the one control on the site that destroys what a child
  earned** — `child_profiles` is the FK target of progress, games, attendance
  and awards, all `on delete cascade`. Two steps, in place, naming the child and
  what goes with them. That is not the same thing as the picker's no-PIN rule
  (Critical Feature 42), which is about *choosing*, not *erasing*.
- ⚠️ **A removal or a rename must update the device's remembered choice.** Left
  behind, resolution keeps handing progress to a child id RLS now refuses and
  the offline queue never drains.
- ⚠️ **TWO LOADS ARE ROUTINELY IN FLIGHT AND CAN LAND OUT OF ORDER.**
  `resolveChild()` fires `CHILD_EVENT`, whose listener re-enters `load()`, so
  the first paint already has a second read behind it. **Last to finish is not
  most recent** — a generation counter drops the older answer, and a repaint
  never touches a row that is mid-edit. Both were measured failures, not
  precautions: a removal left one name on screen and two rows in the table, and
  a rename input was detached from under the typing.
- ⚠️ **`family.spec.ts` is the UI spec and `child-profiles.spec.ts` is the
  boundary spec.** RLS permitted every one of these writes throughout the whole
  time the form was invisible, so an assertion about *reachability* belongs in
  the first and can never live in the second.

### ⚠️ Symptoms that are the ENVIRONMENT, not the application

Each of these has cost real debugging time. **Recognise the signature before
touching application code.**

| Symptom | Almost certainly |
|---|---|
| A fixed bug still "fails"; the fix is in the source but not in `dist/_astro/*.js` | **A stale preview server** — Playwright's `reuseExistingServer` skipped its own build. `astro preview` also moves quietly to 4322 |
| **Every project fails identically**, chromium included, on a Critical Feature | **A stale `dist/`** from an experiment. Reverting source does not rebuild. `grep` the built HTML for the string you expect, then rebuild |
| WebKit: *"Target page, context or browser has been closed"* | **The Windows WebKit build crashing under fan-out.** Re-check with `--workers=1` |
| Firefox: `RenderCompositorSWGL failed`, then a `mouse.move`/`reload` **timeout**, on a **different test each run** | **The Windows Firefox compositor** under fan-out |
| `auth.spec.ts`: `createConfirmedUser: fetch failed` — the error comes from **Node**, not from a page | **Network contention** minting users, not the browser. Not absorbed by the retry |
| A board spec fails on a tree that already shipped green | **A harness assumption**, not the app. **Drive the page by hand before believing it** |

**A genuine failure is deterministic and fails A SERIAL RE-RUN too, and it fails
with an assertion naming a value.** WebKit and Firefox carry one local retry;
chromium has none. A run reporting `N passed, 1 flaky` on WebKit is green.

⚠️ **THE TWO BROWSER-CRASH ROWS ARE NOW A FINDING WHEN THEY COME FROM
`test:release`.** They belong to a raw `npx playwright test`, which still pools
every project at the default fan-out. The matrix caps its workers and runs one
project at a time precisely so it never reaches that state — so a compositor
death *from the gate* means the cap has stopped being enough, and the next step
is to check free RAM during the run, not to re-run and hope.

⚠️ **THE LOCAL RETRY IS NOT THE ARBITER — `--workers=1` IS.** The v0.11.0 gate
failed four Firefox specs that also failed their retries, in four unrelated
files, and all 102 tests in those files then passed serially first time: when the
compositor has died the retry runs inside the same broken process, so it proves
nothing. Read the errors rather than counting them — bare timeouts and
`browserContext.close` protocol errors are a dead browser; an assertion naming a
value is a defect. See [`docs/reference/testing.md`](./docs/reference/testing.md).

⚠️ **Never pipe the test run into `tail`** — it reports tail's exit code, so 14
failures read as "196 passed, exit 0". Redirect to a file and check the status.
`test:release` does both for you, and it also **compares the projects against
each other** and fails if one ran zero tests — a hole the old "the total must be
a multiple of 5" check could not see, since four projects of 100 and one of 0
divides just as neatly as five of 80.

### ⚠️ Driving a board from a spec — the four gates

1. **Scroll the board fully into view** — `scrollIntoView({ block: 'center' })`,
   never `scrollIntoViewIfNeeded()`, which guarantees only *partly* visible. A tap
   at an off-screen square is silently dropped and the board looks dead.
2. **Wait on `<cg-board>`** — it is created inside a `useEffect`, so it is a
   genuine hydration signal. `[data-testid="replayer"]` is **not**: Astro
   server-renders it whether or not any JS ran.
3. **Wait on `data-ready="true"` and `data-busy="false"`** before interacting.
4. **Tap, and press for a DURATION.** `click()` with no `delay` sends mousedown
   and mouseup in **one animation frame**, and Chessground does its drag
   bookkeeping in a `requestAnimationFrame` loop — measured **1/8 solved at 0ms
   against 8/8 at 60ms**. Use `movePiece()` from `tests/e2e/helpers/board.ts`:
   element-relative positions, and `tap()` on touch projects.

⚠️ **Test the pointer path BY POINTER.** Every exercise spec that solved by typing
into `MoveInput` bypassed Chessground entirely and would stay green if the board
refused every tap.

⚠️ **Never assert a short-lived class with a MutationObserver alone** — callbacks
are batched, and one that re-queries the **live DOM** can run after the window has
closed. Sample from a `requestAnimationFrame` loop, and if you keep an observer,
read its **records**. The tell that this is your bug rather than the browser's: a
`length` of 0 on a collection that should be non-empty, moving between projects.

⚠️ **Every axe check on a reveal-bearing page must call `settleReveals(page)`** —
a `[data-reveal]` element sits at `opacity: 0` and is transparent text axe can
still find. It presents as **flakiness, not breakage**, so a flaky `color-contrast`
on an index page should be investigated rather than retried.

⚠️ **`play.spec.ts` runs ONE AT A TIME** — every test boots a real engine with
64 MiB of linear memory. Raising the timeouts was tried and made it **worse**.

**➡️ [`docs/reference/testing.md`](./docs/reference/testing.md)** — each of these
in full, with the measurements and the false positives they produced, plus the
focus-modality rule, the `disabled`-in-deps trap, and the board-driving helpers.

---

## Quick change — a SHORTER GATE, NOT A SHORTER RULE

```sh
npm run quick
```

Fixing a typo used to cost the full release gate: five browser projects, half
an hour. That is not caution, it is a tax that discourages fixing small
things — and unfixed small things are what a visitor actually sees.

⚠️ **It shortens VERIFICATION ONLY.** `dev` → `main` still needs Seàn's
explicit approval, exactly as before. Nothing about the fast path touches the
promotion rule.

### What qualifies — EXHAUSTIVE. Anything not on this list takes the normal path.

- A typo or wording fix in existing content or UI strings, **both locales**
- A value change with no structural effect: a duration, a colour **already in
  the token set**, a link URL, a contact detail
- **ONE** entry added to an **existing** collection using an **existing** shape
  (one trap or one exercise). ⚠️ **An agenda entry is no longer content** — it
  is a row a prof creates in `/admin/seances`, and it never touches this repo
- Reverting a single previous commit

### What NEVER qualifies

- The board components, the exercise validator, auth, i18n routing, the service
  worker, or the build
- New routes, new schema, new dependencies
- Anything a **Critical Feature** above covers
- ⚠️ **Anything where "I'll just check quickly" is the reason it seems small.**
  That sentence is the tell, not the reassurance.

### The path

1. Branch `quick/<what>` off `dev`
2. Make the change
3. **`npm run quick`** — content check, then the build (which runs
   `check-contrast` as its own first step, then types, then the service
   worker), then **only the chromium specs covering what changed**. Not the
   whole suite. Not the matrix.
4. Merge to `dev` with `--no-ff`, plus a CHANGELOG entry under Unreleased
5. Promotion to `main` still requires Seàn
6. Patch bump (`0.x.Y`) on release, **batched** — several quick changes can
   share one patch release

### ⚠️ THE RULE THAT KEEPS IT HONEST

**If a quick change breaks anything in `npm run quick`, it stops being a quick
change.** Revert, open a normal branch, run the full gate. **No fixing forward
on the fast path** — a change that needed debugging was never a quick change,
and the second attempt is exactly where a fast path starts hiding real
breakage.

### ⚠️ The script REFUSES, it does not advise

`scripts/quick.mjs` diffs the branch against `dev` and **exits non-zero naming
any file that is out of bounds**, with the reason. The exclusion list is
enforced in code rather than written in a document nobody re-reads under time
pressure — which is the only version of this that survives a Friday afternoon.

It also picks the specs from what changed (a trap → `replayer.spec.ts`, a UI
string → smoke + nav + main menu, and `smoke.spec.ts` always). `QUICK_BASE`
overrides the comparison branch; it exists for testing the script itself.

---

### ⚠️ VERIFICATION POLICY — TWO COMMANDS, AND THE MATRIX RUNS ONCE

| | Command | When | Cost |
|---|---|---|---|
| **Every feature branch** | `npm run test:branch` | every session, before merging to `dev` | ~1-3 min |
| **Promotion only** | `npm run test:release` | once, when promoting `dev` → `main` | ~65-70 min |

`npm run test:branch` is **chromium only** and runs the specs mapped from what
actually changed (`scripts/spec-map.mjs`). `--all` runs every chromium spec for
a sweeping refactor — still one browser.

#### ⚠️ THE MATRIX RUNS ONE PROJECT AT A TIME, UNDER A WORKER CAP

`test:release` does **not** hand the whole matrix to Playwright at once. It runs
each project on its own, sequentially, at **three** workers. That is slower than
the old single pooled run and it is the reason the gate is green.

**Why: the red gates were MEMORY EXHAUSTION, not browser bugs and not test
bugs.** Playwright shares one worker pool across every project, so at the
default six workers this machine ran six *mixed* browsers side by side — 80
processes, 6.68 GB of browser memory, 2.08 GB of 15.8 GB free. At that point
Firefox's software compositor cannot allocate, the browser stops answering, and
whatever test was in flight dies of a bare timeout. That is why it landed on a
different spec every run and why every one of them passed serially.

- ⚠️ **`--workers=3` IS NOT A TUNING KNOB.** Three is roughly half the peak
  memory, which is the difference between green and red. Raising it back
  towards six reintroduces the entire problem.
- ⚠️ **DO NOT "FIX" A RED MATRIX BY RAISING TIMEOUTS.** Tried on
  `play.spec.ts`; the failure count went **up**. A starved browser given longer
  to answer is still starved, and every test now waits longer to find out.
- ⚠️ **A GATE THAT IS EXPECTED TO BE RED IS WORTH NOTHING.** v0.11.0 shipped on
  4 waved-through failures and v0.11.1 on 7. Both diagnoses were right and both
  promotions were sound — and that is exactly the habit that lets a real
  regression through. The trend was the defect, not the individual runs.
- **It proves every project actually ran.** Counts come from the JSON reporter
  and are compared **project against project**, because the old "is the total a
  multiple of five" check passes perfectly on four projects of 100 and one of 0.
- ⚠️ **The alternatives were MEASURED and the numbers are in
  `scripts/test-release.mjs` → MEASUREMENTS.** Pooling at three workers was
  green too but not cheaper, and `fullyParallel: false` on firefox was rejected
  without a run — webkit and iphone-13 already carry it and were two of the
  three projects failing both gates. Re-measure before re-arguing; do not
  re-reason.

#### ⚠️ DO NOT RUN THE MATRIX ON A FEATURE BRANCH. EVER. NOT "TO BE SAFE".

This is the rule most likely to be reasoned away, so here is the reasoning
already done:

- **The matrix answers exactly one question** — does this work in Firefox and
  WebKit. Asking it on every branch does not make the answer truer. It moves
  the cost from one run per release to one run per session.
- **It was costing 30-45 minutes per session**, routinely, because it *felt*
  prudent. That is not caution. It is a tax that discourages small fixes, and
  unfixed small things are what a visitor actually sees. ⚠️ **The tax is now
  ~65-70 minutes**, since the matrix runs its projects one at a time — so this
  rule matters more than when it was written, not less.
- **A chromium failure is a failure.** If `test:branch` fails, fix it. Do not
  run the matrix to find out whether it is "really" broken.
- **A chromium pass is enough to merge to `dev`.** `dev` is not production.
  Nothing reaches a reader without passing through `test:release` first.

#### ⚠️ THE "CRITICAL PATH" TRIGGER IS GONE, AND ITS REMOVAL IS THE POINT

The old policy said the **board island**, the **exercise validator**, **i18n
routing** and the **service worker** required the matrix *on any branch*. It
read as prudence and it functioned as a loophole: almost everything on this
site touches one of those four, so the exception quietly became the default.

Those paths did not lose coverage — they gained precision. `scripts/spec-map.mjs`
runs **seven** spec files for a `BoardSurface.tsx` change, which is more than
any session ever selected by hand, and it runs them in seconds. Their
cross-browser pass happens at the release gate, like everything else on the
site.

**If you believe you have found the exception:** change this policy in
CLAUDE.md in the same commit, with the reason. Do not make a one-off exception
no future session will know about — that is precisely how the last policy
eroded.

### Critical-path tests (never skip)

- Home renders in FR and EN; the switcher preserves the path on **every** route, round-tripping to the exact starting path
- axe-core: zero violations on all public pages
- Generated manifest carries the token theme colours and an installable icon set
- `sw.js` mentions neither `stockfish` nor `.wasm`
- No third-party requests when Umami is unconfigured
- **No `astro-island` and no `cg-board` on any index page** — the one-board rule, enforced rather than trusted
- The replayer: next/prev/jump/keyboard all move the highlight; **rapid** arrow presses drop nothing
- Légal's mate ends in checkmate, in both locales — if the PGN or the parser drifts, this fails rather than teaching a wrong pattern
- The WhatsApp share link is `wa.me` with **no recipient** (outbound-only rule)
- **`onlyMove: false` never reports an off-line move as wrong**, in either language — the rule this whole feature exists to honour
- An exercise solves end to end by dragging; a scripted `opponentReplies` move plays in between; a wrong move is refused, counted and reset
- Progress survives a reload and marks the index; a **broken `localStorage` does not break the page**
- The GPL source link is in the footer of **every** page; `/mentions-legales/` credits Colin M.L. Burnett and links CC BY-SA 3.0
- The site sets **no cookies**
- **An exercise is solvable from the keyboard alone**, in both notations and by coordinates; an unreadable or illegal entry is refused *without* being counted as an attempt
- **Opening `/jouer/` fetches neither `stockfish.js` nor `stockfish.wasm`**; pressing start fetches both — asserted against the network log
- The precache manifest contains no engine, and a runtime rule caches it instead
- The engine actually answers: a game as black at Débutant gets an opening move, and resigning ends it
- **Every theme brings its whole kit** — palette, board preset, piece set and heading face — and the **body face is identical in all four**
- **A pinned board preset survives a theme change**; "Suivre le thème" un-pins it. Both branches have a spec
- **A pre-E6 stored record leaves the reader on exactly the board they had**
- A board page fetches **one** piece stylesheet, its own theme's; a boardless page fetches **none** — asserted against the network log
- **Exactly one heading font is preloaded**, and it is the active theme's
- The theme class is on `<html>` **before `<body>` exists**, alongside `data-theme`
- axe on `/parametres/` in **all four themes × both modes**
- Lesson notation resolves to a **monospace** family — asserting the rule rather than the resolved value would have passed throughout the `--font-mono` bug

---

### Manual checklist before PR to `main`

**The checklist lives in [`docs/MANUAL-TESTS.md`](./docs/MANUAL-TESTS.md)** — grouped by feature, with expected results, including the regressions that have bitten before (the `1..` move number, the rapid-arrow mash, the `onlyMove: false` wording, the engine's no-fetch-before-click rule).

Run `npm run demo`, which prints its path, and work down it. The release gate is:

```
□ npm run demo — builds clean, no new warnings
□ node scripts/check-claude-md.mjs — green (CLAUDE.md under the size limit)
□ node scripts/check-contrast.mjs — green
□ node scripts/check-content.mjs — green
□ npm run test:release — green, meaning ZERO failures. ⚠️ It runs its projects
  one at a time and it is EXPECTED TO BE GREEN now; a red matrix is a finding
  to chase, not a known flake to wave through. This is the ONE place it runs.
□ docs/MANUAL-TESTS.md — worked through on desktop AND a real phone
□ Lighthouse ≥ 90 (Performance, Accessibility, SEO)
□ package.json "version" matches the tag about to be cut
□ CHANGELOG.md stamped, [Unreleased] emptied, compare-links updated
```

It is a **living document**: keep it in step with the site, in the same commit as the feature. See the session finish routine under Conventions.

---

## Deployment — Cloudflare Workers static assets

`dist/` is uploaded and served directly. Build `npm run build`, deploy
`npx wrangler deploy`, config `wrangler.jsonc`. Production domain:
**`mogadorchess.nachi3dlabs.com`**.

- ⚠️ **`wrangler.jsonc` exists to stop wrangler helping.** With no config present
  wrangler detects an Astro project and runs `astro add cloudflare`, installing an
  adapter that is incompatible with Astro 7 — and it fails during *deploy* rather
  than during *build*, where nobody is looking. **Deleting or emptying that file
  reintroduces the trap.** If a deploy fails mentioning the Cloudflare adapter,
  check the file exists before debugging anything else.
- ⚠️ **Adding a domain must NOT add a `main`.** A Worker with `assets` and no
  entry script is served entirely by the assets runtime.
- ⚠️ **The hostname lives in three files** (`src/config/site.ts`,
  `astro.config.mjs`, `wrangler.jsonc`) and cannot be imported between them. A
  mismatch produces a site that works perfectly while telling Google and every
  share preview to use a hostname that may not resolve. `npm run smoke:prod`
  compares them **before it touches the network**.
- **`npm run smoke:prod` is the one check the local gate structurally cannot do** —
  it asserts, per route, 200 + `lang` + a **structural** sentinel + the GPL footer
  link + canonical agreement + no third-party subresource, plus the manifest and
  `sw.js`. ⚠️ It is **not** part of `npm run build` and must not become part of it.
- **`wrangler` stays out of `package.json`** — invoked with `npx`, to keep its
  transitive advisories out of every install.
- `not_found_handling` is `"none"` because there is no `404.astro`. When one
  lands, change it in the same commit.
- ⚠️ **The fix must reach `main` before the next production deploy** — production
  deploys run from `main`, whatever `dev` holds.

**Service worker:** generated by Workbox **after** `astro build` (it fingerprints
the real `dist/`). ⚠️ **Stockfish is never precached** — `globIgnores` excludes it
and a runtime `CacheFirst` rule caches it instead. The spec parses the array out of
`precacheAndRoute([...])` rather than grepping for the word "stockfish", which was
only ever true while the engine did not exist.

⚠️ **AND NEITHER IS ANYTHING NO EMITTED PAGE CAN REACH.** Astro collects a page's
`<script>` blocks from the **module graph, not from what renders**, so the scripts
behind a route `getStaticPaths()` declined to emit are still built and were still
precached — 29.9 KB across 12 files with accounts off. `unreachableAssets()` in
`build-sw.mjs` walks from every emitted HTML file through the asset graph and
excludes what it never reaches.

- ⚠️ **DERIVED, NEVER A LIST OF NAMES.** A `globIgnores` list naming "the auth
  chunks" would have excluded `child.js` and `supabase.disabled.js`, which *look*
  like auth chunks and are live on every board page via `progress.ts` →
  `progress-sync.ts`. Ask the build, not a human.
- It errs towards **including**: over-inclusion costs bytes, under-inclusion
  costs a file offline. **Exclusion is not deletion** — the file is still served.
- ⚠️ **A `globIgnores` entry that matches nothing is silent**, so the build
  re-reads `sw.js` and **fails** if an exclusion did not take effect.
- ⚠️ **The spec asserts the chunks EXIST before asserting they are absent.** "No
  admin chunk in the manifest" passes perfectly on a build that has none. With
  accounts ON it asserts the opposite — the rule is *unreachable*, not *auth*.

**Generated assets** (icons, fonts, piece CSS, the vendored engine) are committed
artefacts produced by scripts that are **run by hand when their input changes** —
none of them run as part of `npm run build`. ⚠️ **`public/engine` must stay out of
the TypeScript project**, or `astro check` dies of a V8 heap OOM naming no file.

**➡️ [`docs/reference/deployment.md`](./docs/reference/deployment.md)** — the
domain setup steps, what Seàn does in the dashboard, dry-run verification, the
PWA manifest endpoint, and why the fonts are copied rather than imported.

---

## The size guard — this file has a hard limit

`node scripts/check-claude-md.mjs` fails at **150 000 characters** and warns from
**120 000**. It runs as a step of `npm run build` and of `npm run quick`, so the
limit is enforced where it will actually be seen rather than remembered.

⚠️ **The failure mode it exists to prevent is silent.** Past the limit the tail of
this file simply stops being read: the rules are in the repository and absent from
the session, and nothing anywhere reports it. That is how it reached **247 KB**.

**When it warns, split — do not trim.** Move the reasoning to the reference file
for that area and leave the rule here with a pointer saying when the detail
matters. A rule deleted to save bytes is a rule that comes back as a bug.

---

## Open questions and everything not yet built

**➡️ [`BACKLOG.md`](./BACKLOG.md) is the single list.** Every deferred item,
conditional decision, dormant field and open question for Seàn lives there with a
status, and this section deliberately keeps no second copy — a list that exists
twice is a list that disagrees with itself.

Add new items there, not here.

## Key Contacts

| Role | Name | Contact |
|---|---|---|
| Developer / IT | Nachi3D (Seàn McGannon) | nachiketas3d@gmail.com |
| Association | Association Essaouira Mogador | `@associationessaouiramogador` |
