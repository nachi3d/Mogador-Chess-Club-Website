# CLAUDE.md — Mogador Chess Club

This file is the operational reference for working on this codebase with Claude Code. It contains conventions, architectural decisions, content structure, and the prompt workflow.

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
2. **`CLAUDE.md`** — any decision, rule or gotcha that the next session would otherwise rediscover.
3. **`docs/MANUAL-TESTS.md`** — **whenever the session adds or changes anything a visitor can see.** New feature, new page, new failure mode, new regression worth watching: it goes in the checklist. This is the one most easily skipped and the one whose absence is least visible — a checklist that lags the site makes an incomplete test pass feel complete.

#### ⚠️ KILL EVERY LONG-LIVED PROCESS THE SESSION STARTED

A session that starts a server **terminates it when the task that needed it
ends** — `astro preview`, `npm run demo`, a watch, anything holding a port.

**This is not tidiness.** A stale listener on 4321 is the documented trap that
has already cost real debugging time twice: Playwright's `reuseExistingServer`
silently skips its own build and tests **whatever is on disk from before**, and
`astro preview` quietly moves to 4322 and serves the old build to anyone who
opens the URL they expected. A fixed bug then keeps "failing".

One ran for **4h28m** during the M3 session before anyone noticed.

⚠️ **Stopping the npm wrapper does NOT stop the server.** `npm run preview`
spawns `astro preview` as a child; killing the parent leaves the child holding
the port. Verify the port is actually free, and kill by PID if it is not:

```sh
netstat -ano | grep -E ':432[1-5]'    # NOT `-p tcp` — that is IPv4 only, and
                                      # node binds [::1]. See the note below.
```

```powershell
Stop-Process -Id <pid> -Force
```

#### ⚠️ A PORT LIST IS NOT THE SWEEP. SWEEP BY REPO PATH.

`netstat` on 4321-4325 only answers "is anything on the ports astro walks to
on its own". It says nothing about a server someone started with an explicit
`--port`, and nothing stops anyone doing that.

**Found at the end of the M3-suite session: 26 orphaned
`astro preview --port 4399` processes for this repo, one still listening** —
entirely outside the swept range, and therefore invisible to every previous
run of `npm run demo` and to every session that "checked the ports".

So the real question is *"is anything previewing THIS repo?"*:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*Mogador-Chess-Club-Website*' -and
                 $_.CommandLine -like '*preview*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

`scripts/demo.mjs` now does both on startup **and on Ctrl+C** — the port walk,
then `previewsForRepo()`. Three details in that function are load-bearing:

- **Match the repo path AND `preview`.** The path alone kills `astro dev`, a
  Playwright run and the editor's TypeScript server; `preview` alone kills
  another project's server, which is not ours to touch.
- **The wrapper does not carry the path; the server does.** `npx astro preview`
  shows as `…/npx-cli.js astro preview` with the repo only as its cwd, which
  `Win32_Process` does not expose. The path match finds the process that owns
  the socket — which is the one that matters.
- **Its PARENT is taken too, when the parent's own command line also mentions
  `preview`.** Both conditions together mean the pair is one invocation. Without
  this the wrappers pile up: one sweep that killed only the servers left **13**
  husks behind, and a husk per run is how a machine reaches dozens of processes
  nobody can account for.

**PowerShell, not `wmic`** — wmic is deprecated and absent from recent Windows
11 builds, so it fails silently exactly where this matters. And the matching is
done in JS rather than in the query: a path is far easier to compare there than
to quote correctly through two layers of shell.

`npm run demo` doing this on startup is a safety net rather than a substitute:
it protects the next session, not this one.

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

### Both inputs, one path — the board is not the only way to move

Chessground takes **pointer input only**. Until Session 4 that meant a reader who cannot use a mouse or a touchscreen could read an exercise, read the hint, and had no way at all to answer it. axe never flagged it, because there was no unlabelled control — **there was no control**. That is the class of exclusion automated checking cannot see, and the reason it is written down here rather than trusted to a linter.

`MoveInput.tsx` is the second door. It accepts:

- **SAN** — `Bc4`, `Nxe5`, `exd5`, `O-O`, `e8=Q`, `Qh4+`
- **French SAN** — `Fc4`, `Cxe5`, `e8=D` (**R** roi, **D** dame, **T** tour, **F** fou, **C** cavalier)
- **Coordinates** — `f1c4`, `e7e8q` (what the board itself emits)

plus `0-0`, lowercase, trailing `!?`, and stray spaces, because people type those.

⚠️ **`R` means the rook in English and the king in French, and there is no way around it.** So the reader's own locale is tried first and the other reading only if the first is not legal here. On the French page `Rf1` is the king if the king can go there and the rook otherwise — what a French speaker means, without rejecting someone typing English out of habit.

Two rules hold this together:

1. **The typed path and the dragged path converge on the same `onMove(from, to)`.** `resolveMoveText` produces a `{from, to}` and hands it over; nothing downstream can tell which input was used. There is no accessible *variant* of the game logic to drift out of sync.
2. **"I could not read that" and "that move is not available" are different messages.** Collapsing them tells a beginner their legal-looking move is illegal when in fact they made a typo — the same class of lie the `onlyMove` rule exists to prevent. An unreadable or illegal entry never reaches the judge and is **not** counted as an attempt.

Focus returns to the field after the opponent's reply (`focusSignal`), so a keyboard player is never left on a disabled control with no sign that it is their turn.

**Exercise mode genuinely needs chess.js in the browser** — the legality of an arbitrary dragged move cannot be precomputed — so `ExerciseView` pulls `@lib/chess/exercise` in with `await import()` inside an effect. Vite splits it into its own chunk (36 KB raw / 10.8 KB brotli) that only an exercise page ever downloads. **Never convert that to a static import**; it would put chess.js back in the shared island chunk and make every trap page pay for a feature it does not have. Until the chunk lands the board renders view-only from the starting FEN — the real position, not a spinner, so only the dragging waits.

### Preact gotchas that have already bitten (continued)

5. **`viewOnly` is bind-time only, and failing it is silent.** Chessground's `bindBoard()` returns early when `viewOnly` is true, and `bindDocument()` skips its move/end listeners the same way. Neither is ever re-run, so `api.set({ viewOnly: false })` flips a flag on a board that has **no `mousedown` listener** — the board looks movable and ignores every drag, with no error anywhere. `BoardSurface` therefore takes a separate `interactive` prop that is read **once, at mount**; `movableColor`/`dests` are what gate whether a move is allowed *right now*. The exercise board mounts interactive even though its engine chunk has not loaded yet, precisely because of this. (Cost: most of a debugging session, and every move-playing spec failing identically.)
6. **A rejected move needs a `revision` bump, not a new FEN.** Chessground has already slid the piece by the time `movable.events.after` fires. On rejection the position we want is the one already in `props.fen` — so `fen` is unchanged, the update effect does not re-run, and the board sits there showing a move the engine refused. `BoardSurface.revision` exists solely to force that re-set.
7. **Never read `localStorage` during render.** Progress is loaded in an effect, so the first client render matches the server-rendered HTML. Reading it during render is the same class of bug as the `{n}.` move number: a hydration mismatch, just a subtler one.
8. **The move handler must go through a ref.** It is registered once, inside Chessground's mount config; a closure captured there goes stale the moment the exercise advances a step and would judge every later move against the first position forever.

### Preact gotchas that have already bitten

1. **Adjacent JSX text children break hydration.** `{n}.` server-renders as one text node `"1."`; Preact hydrates expecting two children, finds one, and **appends** the missing `"."` — the browser shows `1..` while the HTML says `1.`. Interpolate into a single node instead: `` {`${n}.`} ``.
2. **Never compute a state target from the closed-over value in an event handler.** The keyboard handler originally did `step(cursor + 1)`; two arrow presses in the same frame both read the same stale `cursor`, so the second was silently swallowed and holding the key dropped moves. Use functional updates — `setCursor(prev => …)` — and keep the listener bound once. `tests/e2e/replayer.spec.ts` has a rapid-press regression test.
3. **Chessground owns its DOM.** Render one empty `<div>` and hand it over; never give that element VDOM children, or Preact will diff away Chessground's work. Updates go through `api.set()`.
4. `lastMove: undefined` does **not** clear an existing highlight — Chessground's config merge skips undefined keys. Pass `[]`.

### Licence — TWO of them. DECIDED (Sessions 3 and 4, by Seàn).

**The code is GPL-3.0-or-later. The teaching content is CC BY-NC-ND 4.0.** They are two works aggregated in one repository, which the GPL expressly permits. The repository is public.

#### The line is SUBSTANCE vs STRUCTURE — get this right

| | Licence | What |
|---|---|---|
| **Content substance** | CC BY-NC-ND 4.0 (`LICENSE-CONTENT`) | The prose (FR + EN), the move commentary, which lines a trap shows, where an arrow goes and what it says, the design of each exercise — position, solution, scripted replies, and what it is meant to teach |
| **Everything else, including content STRUCTURE** | GPL-3.0-or-later (`LICENSE`) | `content.config.ts`, the Zod schemas, every field name, the JSON format, the ply-numbering scheme, the UCI encoding, `check-content.mjs`, and every component that renders any of it |

Why it is drawn there: copyleft on code invites the reuse we want; copyleft on lessons would let anyone repackage a volunteer club's teaching commercially. So **someone may take this engine, write their own content against the same schemas, and sell it** — that is fine and intended. What they may not do is republish *these* lessons.

Standard notation is nobody's property. A PGN of a historical game and the fact that Légal's mate exists are facts; what is licensed is the selection, arrangement and explanation of them.

`site.legal.content` in `src/config/site.ts` holds the data, `/mentions-legales/` states it in both languages, and `README.md` gives the one-line version ("you may deploy this engine; you may not republish the teaching content commercially"). If you add a content field that is *structure* rather than substance, it is GPL — say so in `LICENSE-CONTENT` rather than leaving it to be argued.

#### The GPL side

**This project is published under the GNU GPL v3 or later, and the repository is public.**

| Dependency | Licence | Consequence |
|---|---|---|
| **Chessground** | **GPL-3.0-or-later** | ⇒ the whole site is GPL. See below. |
| **Stockfish 11** (`stockfish.js`) | **GPL-3.0** | same copyleft, no conflict — but it must be credited |
| cburnett piece set | CC BY-SA 3.0 — by **Colin M.L. Burnett**, via Wikimedia Commons | attribution + share-alike |
| chess.js | BSD-2-Clause | permissive |
| Preact, Astro | MIT | permissive |
| Fraunces, Inter | SIL OFL 1.1 | permissive, attribution kept |

Chessground's README states it plainly: *"When you use Chessground for your website, your combined work may be distributed only under the GPL. You must release your source code to the users of your website."* Shipping it means the combined work is GPL — accepted, because this is a free community club project and copyleft is the right fit for it.

**What that obligation actually requires of the code:**

1. `LICENSE` at the repo root holds the **verbatim** GPL-3.0 text. Do not edit it, reflow it, or "modernise" the FSF address.
2. `package.json` declares `"license": "GPL-3.0-or-later"`.
3. **The source link renders in the footer of EVERY page** — not only on `/mentions-legales/`. The requirement is that the source reach *the users of the website*, and a reader who never opens the legal notice is still a user. `tests/e2e/legal.spec.ts` asserts this on four different routes; if someone tidies it away to clean up the footer, that suite says no.
4. `/mentions-legales/` carries the full credits table, plus the CC BY-SA attribution to **Colin M.L. Burnett** in prose with a link to the licence (the piece set arrives inside `chessground.cburnett.css`, so it ships on every page with a board).

Every name and URL behind that page is **data** in `site.legal` in `src/config/site.ts`; every sentence is a string in `src/i18n/ui.ts`. Nothing legal is hardcoded in a component, so the notice cannot drift from the config it describes.

The containment is still deliberate and still worth keeping: `BoardSurface.tsx` is the only file that imports Chessground, and everything else talks to its `BoardProps`. If the board is ever swapped for a permissively-licensed one, that is a rewrite of **that one file** — and only then do the `chessground` and `cburnett` entries in `site.legal.attributions` come out. Do not prune them to tidy the page up.

---

## Play mode — Stockfish in a Worker

`/jouer/` (+ `/en/jouer/`). A full game against the engine, entirely in the browser. Nothing is sent anywhere.

### Why Stockfish 11, and why that is not a compromise to "fix" later

The modern NNUE builds ship their neural network inside the package:

| | unpacked |
|---|---|
| `stockfish@16` | 91 MB |
| `stockfish@17` | 183 MB |
| `stockfish@18` | 251 MB |
| **`stockfish@11`** | **8.8 MB** (of which we ship 3.6 MB) |

Stockfish 11 is the last hand-crafted-evaluation release. Its WASM binary is 1.38 MB. This site teaches beginners on Essaouira mobile data; an engine nobody can afford to download is worth exactly nothing, and nothing in a teaching context needs a 3000-Elo opponent. Revisit only if a ceiling above ~2000 is genuinely wanted.

We ship `stockfish.js` (2.28 MB glue) + `stockfish.wasm` (1.38 MB) and **not** `stockfish.asm.js` (another 4.8 MB), which exists for browsers without WASM — none of which this site supports.

### The engine loads on a CLICK, and the whole design serves that

- `PlayView` hydrates and renders **a form**. It fetches nothing.
- `@lib/engine/stockfish` is reached by `await import()` **inside the start handler**. Never hoist it, and never let `PlayBoard.astro` reference it — Vite would follow the import and pull 3.6 MB into the page's module graph.
- `globIgnores` in `scripts/build-sw.mjs` keeps it out of the precache; a runtime `CacheFirst` rule (`mcc-engine`) caches it after the first game, so game two is instant and first-visit cost is unchanged.
- `tests/e2e/play.spec.ts` asserts against the **network log** that opening `/jouer/` requests neither the worker nor the wasm, and that pressing start requests both.

### ⚠️ The level presets are MEASURED — and `Skill Level` alone does not work

**The vendored build exposes no `UCI_LimitStrength` and no `UCI_Elo`** — verified by reading the `uci` option list out of the running worker. The only strength dials are `Skill Level` (0–20), `Skill Level Maximum Error` and `Skill Level Probability`.

#### The bug this section exists to prevent coming back

Up to v0.5.0 the presets were **hand-set and never measured**, and they were not a ladder at all. Measured over 16 games per pairing against two reference opponents:

```
debutant      vs greedy   97%      vs novice   100%
intermediaire vs greedy  100%      vs novice    97%
avance        vs greedy  100%      vs novice   100%
```

Three names, one opponent. Seàn, who plays chess, had not won a single game against **Débutant**.

#### ⚠️ WHY `Skill Level` CANNOT FIX IT — the load-bearing finding

Two facts, both measured with `scripts/engine-lab`:

1. **`Skill Level` only ever chooses among the engine's OWN top candidates**, and every Stockfish search — at *any* depth — ends in a **quiescence search that resolves all captures**. So no `(skill, depth)` pair will ever hang a piece or miss a free one. **"depth 2" is not "sees one move ahead".**
2. At the old `skill 0, depth 2`, the engine played its top choice in **23 of 24** searches of one position — **more deterministic than either higher level**. Débutant was the *least* random preset on the ladder.

`Skill Level Maximum Error 5000` + `Probability 1000` — both extremes — made it **more** deterministic, not less. Not a usable dial here.

**So weakness has to come from somewhere Stockfish does not provide: a deliberate blunder rate.** `blunderChance` on `EngineLevel` is the probability of playing a **uniformly random legal move** instead of the searched one. A beginner needs an opponent that sometimes gives material away, and that cannot come from a dial that only ever chooses between good moves.

#### ⚠️ The random move comes from the ENGINE, not from chess.js

`#randomLegalMove()` sets `MultiPV 500`, searches `depth 1`, reads every `info … multipv N … pv <move>` line, then **restores `MultiPV 1` in a `finally`**. Stockfish clamps MultiPV to the number of legal moves, so the reported set *is* the legal move list — verified against chess.js: 20 from the start position, 31 in the test position.

Done this way because **importing chess.js here would land it in the engine chunk**, and that chunk exists precisely so a reader who never presses "start" never downloads it. The engine already knows the legal moves; asking costs one shallow search and no bytes.

⚠️ Leaving `MultiPV` at 500 would make every later search report 500 lines and run measurably slower — hence the `finally`.

#### The shipped presets, and what they measured

| Preset | Skill | depth | movetime | blunder | vs `greedy` | vs `novice` |
|---|---|---|---|---|---|---|
| Débutant | 0 | 1 | 50 ms | **40%** | 60% | **38%** |
| Intermédiaire | 3 | 4 | 500 ms | **25%** | 98% | **65%** |
| Avancé | 14 | 12 | 1500 ms | 0% | 100% | 98% |

Head-to-head, which is what proves the **order** (both bots saturate at the top):

```
avance        vs intermediaire   100%
intermediaire vs debutant         85%
avance        vs debutant        100%
```

The reference opponents are in `scripts/engine-lab/bots.mjs`:

- **`greedy`** — grabs the biggest capture available, otherwise plays a *random* move. Below a real club beginner: it does not develop, it wanders.
- **`novice`** — 2-ply material minimax. Takes what is free and will not leave a piece hanging to one capture. **This is the yardstick that matters**; it is roughly "a club beginner who plays accurately".

`--bots` validates the yardstick before it is used to judge anything (`random` scores 28% vs `greedy`, `greedy` 1% vs `novice`).

#### ⚠️ 0.4 IS A CEILING, NOT A DIAL TO TURN UP

At `blunderChance 0.5` Débutant fell to **13%** against `novice` — but half its moves were noise and the games stopped resembling chess. **Beatable is the goal; incoherent is not.** `tests/e2e/engine-levels.spec.ts` caps it at 0.5 for that reason.

#### ⚠️ RE-MEASURE, DO NOT RE-REASON

```sh
node scripts/engine-lab/run.mjs --probe        # what the build exposes; is skill applied
node scripts/engine-lab/run.mjs --bots         # validate the yardstick first
node scripts/engine-lab/run.mjs --verify       # play the SHIPPED presets
node scripts/engine-lab/run.mjs --ladder --shipped
```

`--verify` **parses `LEVELS` out of `src/lib/engine/stockfish.ts`** rather than keeping its own copy: a lab that measures its own private numbers proves nothing about what the reader plays against. Budget ~30 minutes for a full pass; it is not part of `npm run build` and nothing calls it automatically.

`tests/e2e/engine-levels.spec.ts` guards the **order and shape** (skill/depth/movetime increasing, blunder rate decreasing, Débutant > 0, Avancé = 0) and deliberately **does not pin the measured values** — those belong to the measurement, and pinning them would make every re-tune a two-file change with a test that only restates the source.

Three environment quirks bit while building the lab, all documented in `scripts/engine-lab/engine.mjs`: Node's global `fetch` makes the Emscripten glue abort (it must stay removed for the *whole* run, not just the constructor); `public/engine/stockfish.js` is CommonJS inside a `"type": "module"` package, so it needs a `.cjs` alias **in the OS temp dir, never in the repo** — a copy under `scripts/` would walk straight into the `astro check` heap death that `public/engine` is excluded to avoid; and `postMessage(cmd, true)` is **synchronous**, so a listener registered after `send()` misses the reply and looks like a hang.

**The UI still names the levels and prints no rating.** These are win rates against two crude bots — evidence of *order* and of *beatability*, not a rating. Claiming an Elo would still be inventing a fact.

The movetime cap is what bounds latency on a slow phone — depth alone would let Avancé think for a long time on a complicated middlegame.

### Memory: a fixed 64 MiB

The build declares `INITIAL_MEMORY = 67108864` and creates its `WebAssembly.Memory` with `initial === maximum`, so the linear memory is **64 MiB, fixed, non-growing** — allocated once the engine starts, not before. `Hash` is pinned at 16 MB (`min = max = 16`) inside it, and `Threads` at 1.

That is the number that matters on a low-end Android, and it is why `PlayView` disposes the worker on unmount: a 64 MiB heap and a possibly-still-searching engine must not survive the reader navigating away. (Note that `performance.memory` will NOT show you this — it is quantised in modern Chromium and does not count WASM linear memory. Read the binary, not the API.)

### Stockfish is just a `MoveProvider` — this is the v2 seam

`src/lib/chess/opponent.ts` defines the interface; `PlayView` talks to that and nothing else:

```ts
interface MoveProvider {
  nextMove(fen: string): Promise<Uci | null>;
  dispose(): void;
}
```

A position goes in, a move comes out, eventually. The view does not know whether it is talking to an engine in a Worker, a scripted list, or — in v2 — another human over a Durable Object socket. **When online play lands it is a new implementation of this interface plus a lobby, not a rewrite of the board.** `scriptedProvider()` exists in that file to keep the interface honest: a second, trivially-correct implementation means `PlayView` depends on the contract rather than on Stockfish's timing.

A search cannot be un-asked, so `PlayView` holds a `generation` counter and drops answers that arrive after a new game, a resign or an unmount. Without it, "New game" mid-think drops the previous game's move onto the new board.

### No third-party requests without an explicit click — a tested rule

The site makes **zero** requests to any third-party origin on load. Fonts are self-hosted, there are no CDN scripts, and Umami is omitted entirely when unconfigured. `tests/e2e/pwa.spec.ts` and `tests/e2e/legal.spec.ts` both assert it — on the home page and on a board page.

This is now a **standing rule, not an accident of not having added anything yet**: any embed that talks to another origin must be a click-to-load facade, and must make no request at all until the reader clicks.

The concrete case is the `youtube` field on `traps` and `cours` (Session 3 decision): when it lands it renders a **facade on `youtube-nocookie.com`** — a static poster plus a play button, with the iframe injected only on click. A plain iframe sets third-party cookies at page load, which would break both the privacy posture stated on `/mentions-legales/` and the specs above.

### Chessground integration notes (verified at scaffold time)

Chessground is ESM and ships its CSS as package assets. Exact import paths:

```ts
import { Chessground } from 'chessground';              // exports["."] → dist/chessground.js
import 'chessground/assets/chessground.base.css';        // REQUIRED — layout/geometry
import 'chessground/assets/chessground.cburnett.css';    // piece sprites
// DO NOT import chessground.brown.css — we ship our own theme from the tokens.
```

`chessground.brown.css` is the board *theme*, and we replace it. Our theme drives these selectors from `src/styles/tokens.css`:

| Chessground selector | Our token |
|---|---|
| `cg-board` background | `--mcc-board-light` + a checker overlay in `--mcc-board-dark` |
| `square.last-move` | `--mcc-board-last-move` |
| `square.selected` | `--mcc-board-selected` |
| `square.move-dest` | `--mcc-board-hint` |
| `square.check` | `--mcc-board-check` |
| coordinate labels | `--mcc-board-light-ink` / `--mcc-board-dark-ink` |

Note the brown theme paints dark squares as *black at 20% opacity over the light colour*. To get our exact `--mcc-board-dark` we use our own checker — a `repeating-conic-gradient` of the two flat token colours in `src/components/board/board.css` — not an opacity overlay.

Arrow/circle **brush colours cannot be read from the tokens at draw time** (Chessground wants literal colours in its config, and a `getComputedStyle` round-trip per draw is not worth it). The four brushes in `BoardSurface.tsx` are mirrored from `tokens.css` by hand — there is exactly one pair to keep in sync.

Coordinates are real text and Chessground already alternates their colour by square. Feed it **both** inks — `ink-950` on light squares (13.7:1) and `cream-50` on dark squares (5.5:1). One ink for both fails AA on one of them; that is exactly why two tokens exist.

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
  agenda/       2026-09-12.json
```

**All content is `.json`, not `.md`.** A Markdown body can only be in one language; this site has two. Keeping every field in typed frontmatter means the FR/EN pair is visible to the schema, and a missing translation is a validation error rather than a page that silently renders French to an English reader.

Astro 7 deltas to remember: config lives at `src/content.config.ts`, each collection declares an explicit `loader: glob({...})` from `astro/loaders`, and Zod is imported from `astro/zod` (v4) rather than the deprecated re-export from `astro:content`.

| Collection | Key fields |
|---|---|
| `traps` | `title_fr/_en`, `slug`, `eco?`, `level`, `themes[]`, `pgn`, `notes[]{ply,text_fr,text_en}`, `summary_fr/_en` |
| `cours` | `title_fr/_en`, `slug`, `level`, `order`, `summary_fr/_en` |
| `exercices` | `title_fr/_en`, `slug`, `fen`, `solution[]` (UCI), `opponentReplies[]` (UCI), `onlyMove`, `hint_fr/_en`, `level`, `themes[]` |
| `agenda` | `date`, `time`, `venue?`, `level`, `note_fr/_en?` |

`level` is `debutant | intermediaire | avance` everywhere. Every collection has `draft: boolean` (default false) so an entry can be parked without deleting it.

### `cours` long-form bodies → per-locale Markdown (DECIDED, not yet implemented)

Decided in Session 2. Course *bodies* will be **per-locale Markdown pairs** — `roquer-tot.fr.md` and `roquer-tot.en.md` — not more `*_fr` / `*_en` frontmatter fields.

A lesson is prose: headings, lists, diagrams, worked examples. That is what Markdown is for, and a `summary_fr`-style string field is the wrong shape for three screens of teaching. One file per language keeps each body in exactly one language, which is the same reason the rest of the content is JSON — the constraint is honoured, just at file granularity instead of field granularity.

The JSON entry stays as the course **index record** (title, level, order, summary). **Do not add body fields to the `cours` schema in the meantime.**

Lesson *ordering within* a course is still open — see the open questions. When lessons become their own documents, add a `lessons` collection with a `reference('cours')` back-link rather than reshaping this one.

### Content validity is checked, not assumed

`node scripts/check-content.mjs` replays every line through chess.js. A Zod schema proves an entry is well-*shaped*; it cannot prove it is legal chess — `"e2e5"` is a valid UCI string and an illegal move.

The script checks that PGNs parse, that note plies exist, that solutions and opponent replies interleave legally from the FEN, and that anything tagged `mat` actually ends in checkmate. As of Session 3 it also checks:

- **`onlyMove: true` is not a lie** — for a mating line of ≤ 2 player moves, that no *other* first move forces mate in the same number. See the `onlyMove` rule; this one has already fired for real.
- **the student always plays the same colour** — if `solution` and `opponentReplies` fall out of step, the moves stay individually legal while the board hands the student their opponent's pieces to move.
- **the FEN has all six fields** — a four-field FEN parses in chess.js and silently assumes White, quietly changing whose puzzle it is.
- **no duplicate slugs**, and **no half-translated hints** (same rule as `moveComments`).

#### ⚠️ A LEGAL POSITION IS NOT A CORRECT ONE — verify the CLAIM, not the chess

`check-content.mjs` proves a position is *possible* and a line is *legal*. It
cannot read the sentence next to the board, and that is where content actually
goes wrong.

Content batch 3 (course 3) shipped **four** positions that passed every check —
legal, six fields, solution legal, plies in range — and each described a
mechanism the position did not contain:

| Lesson | The prose said | The board had |
|---|---|---|
| le clouage | the c6 knight "cannot move" | a **d7 pawn** blocking the diagonal; the knight had 5 legal moves |
| la découverte | `Bb3` aims at h8 through `Ne5` | b3–h8 is not a diagonal, and e5 was not on the bishop's line |
| l'attraction | `Ng6+` forks king and queen | `2...fxg6` — a pawn on f7 simply takes the knight |
| la surcharge | the recapture allows `Re8#` | the recapture came **with check**, and a queen on c5 covers f8 anyway |

Two of those are the classic beginner misconceptions they were meant to teach
*against* — a "pin" that is blocked by the d7 pawn is the single most common
wrong idea about the Ruy Lopez, and it would have shipped as fact.

Two of those are the classic beginner misconceptions they were meant to teach
*against*. A "pin" blocked by the d7 pawn is the single most common wrong idea
about the Ruy Lopez, and it would have shipped as fact.

#### THE RULE — every diagram is replayed and its claim asserted BEFORE merge

**No board merges on "it parses".** For each one, replay the position and
assert the specific thing the sentence beside it says: *is the knight actually
unable to move; does the bishop actually reach h8 once the screen leaves; can
anything capture the forking piece; is that actually mate.* If the sentence
makes a claim you have not asserted, you have not checked the board.

Since batch 3 that is **data, not discipline**: a `position` or `exercise`
board carries a `claims[]` array, and `check-content.mjs` proves each one on
every build. The claim is language-neutral, so the fr/en pair must agree on it.

| kind | what is asserted |
|---|---|
| `pin` | the named piece has **zero** legal moves, **and** removing it exposes its own king — the second half is what separates a pin from a piece that is merely blocked in |
| `fork` | the piece on `from` attacks **every** square in `targets`, and each holds an enemy piece |
| `discovery` | `by` does **not** attack `target` now, and **does** once `screen` is lifted — so the screen is load-bearing |
| `line` | the moves are legal in sequence and the final position is the stated `ends` (`mate`/`check`/`quiet`/`stalemate`), optionally capturing a stated piece |

`after: [...]` replays moves first, because a caption usually describes the
position the diagram is *about* to reach ("le cavalier saute en c7 …").

#### ⚠️ A TRAP'S CLAIMS CARRY A `ply`; A LESSON BOARD'S MUST NOT

A trap has a PGN, not a FEN, so a claim has to say **which position** it is
about — on the same 0-based scheme as `moveComments`: the position AFTER that
half-move, with `-1` for the start. `after`/`moves` continue from there, and
that is what lets a claim prove a **refutation the PGN does not contain** —
`mat-du-berger` asserts that at ply 4 the line `3...Qe7 4.Qxe5?? Qxe5` wins the
queen, which is the lesson rather than the trap.

Both mistakes fail the build, and both were verified to:

| | |
|---|---|
| trap claim with no `ply` | it would silently pick a base position and prove something true about the **wrong move** |
| lesson claim **with** a `ply` | the board has its own FEN, so the ply indexes nothing and the author believes an anchor that does not exist |

⚠️ **Zod cannot express "required here, forbidden there"** across two
collections sharing one union without duplicating the union, so `ply` is
structurally optional and the rule lives in `check-content.mjs`. A claim
anchored one ply off fails loudly — verified with a fixture whose `line` claim
was anchored at ply 4 instead of 5 (*"move[0] 'h5f7' is not legal in …"*).

⚠️ **`kind: 'manual'` is the honest escape and REQUIRES a `note`.** Some claims
genuinely are not properties of a position — "the king must step aside and then
the queen falls", "if she recaptures it is mate in two" need a forcing-line
search over every legal reply. Those are **not** machine-stated, and pretending
otherwise would be worse than the gap. They declare `manual` with a note saying
what a human must verify, and `check-content.mjs` prints them as a **review
queue**. A board with **no** claims at all is printed there too — the point is
that nothing passes silently, not that everything passes.

⚠️ **The queue does not fail the build, deliberately.** Most of it is content
written before claims existed (17 boards across courses 1 and 2 at the time of
writing). Failing would force either a retrofit in one sitting or switching the
check off, and a visible list that shrinks is worth more than a red build
somebody disables. Retrofit opportunistically, when touching a lesson anyway.

⚠️ **Each assertion was verified to FAIL on the real broken position** before
being trusted — the original Ruy Lopez FEN, the b3 bishop, a wrong fork target,
and the g1-king overload. The two older mechanical classes (`[SetUp]` FEN
contradicting the PGN's first move; side-not-to-move in check) were re-proved
the same way. Anything added to `assertClaim` gets the same treatment: **write
the fixture that must fail, watch it fail, then delete it.**

---

## The beginner tutorial — `/apprendre-les-bases/`

Thirteen steps for someone who has never played, sitting **below** `debutant`.
Index at `/apprendre-les-bases/`, one route per step, both locales.

### ⚠️ It adds NO new board and NO new mode — and here is why none was needed

The brief asked whether to build a lightweight "sandbox" sub-mode where tapping a
piece highlights its legal destinations. **Exercise mode already does exactly
that**, and it is worth knowing so nobody builds the second thing later:

> `destsOf()` in `src/lib/chess/exercise.ts` builds `dests` from
> `game.moves({ verbose: true })` — **every legal move in the position**, not the
> expected one. Chessground lights all of them when a piece is picked up.

So the board that demonstrates a rule *is* the board that checks it, judged
through the same `judgeMove` path as every other exercise, with `MoveInput` for
keyboard entry and `mcc:progress:v1` for progress. `BoardSurface.tsx` and
`ChessBoard.tsx` are untouched by this feature, which is why it merged on
chromium rather than the full matrix.

### Progress is namespaced, not special-cased

Each step records under **`tutorial:<slug>`** in the same `mcc:progress:v1` store
as every exercise. v2-S3's sync therefore picks the tutorial up with no branching
at all — the namespace is the only thing distinguishing it, and it is only there
so a tutorial step and an exercise can never collide on a slug.

### The index mounts no board

Thirteen live boards on one page would be thirteen hydrated islands on the page a
complete beginner opens first, usually on a phone. The index is a list; the board
lives on each step's route, exactly as `/exercices/` works. A spec asserts zero
`astro-island` and zero `cg-board` on the index.

### Entry points — and why it gets no nav slot

- **Home**: a quiet underlined line *below* the two CTAs. A beginner must find it
  instantly; everyone else must not have it competing with Jouer and Pièges.
- **`/cours/`**: named at the TOP as the prerequisite — a beginner who scrolls
  past it has already started the wrong thing.
- **Nav: deliberately not.** The nav already carries seven items and is tight on
  a phone. More importantly the tutorial is a *journey you finish*, not a
  destination you return to; a permanent slot would keep advertising it to people
  who completed it months ago. Home and `/cours/` reach the people who need it.

### `onlyMove: true` is honest here

Elsewhere `onlyMove: true` is a claim that must be proven (see the exercise
validation rule). Tutorial tasks name a destination — "bring the rook to h8" — so
a different move genuinely is not the task, and saying so is accurate rather than
a lie about correctness. `check-content.mjs` still brute-forces uniqueness for
any step that ends in mate.

### Content is checked, not trusted

`scripts/check-content.mjs` validates the `tutoriel` collection on every build:
FEN parses and has six fields, the solution is legal, `onlyMove: true` on a
mate-in-1 is genuinely unique, no duplicate slugs, **`order` is contiguous
1..N** (a gap strands a reader mid-sequence, because prev/next walks that order),
and neither language of any prose field is empty.

⚠️ **The chess is machine-verified. The teaching is not.** The FR pedagogy is
flagged for Seàn's review — see BACKLOG.md.

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
| `/agenda/` | `/en/agenda/` | Sessions; venue falls back to site config |
| `/contact/` | `/en/contact/` | WhatsApp CTA, venue, socials |
| `/mentions-legales/` | `/en/mentions-legales/` | Legal notice + credits. **Footer only, not in the nav.** |
| `/parametres/` | `/en/parametres/` | Appearance settings. Reachable from the **desktop header** (gear, beside the theme toggle) and the footer. |
| `/progres/` | `/en/progres/` | Local progress: three group bars, exercises by level and by theme, what is left, and a resume card. Read from `localStorage`, no account. **Rank and points say "bientôt" and print no number** — nothing computes one. |
| `/connexion/` | `/en/connexion/` | **NOT EMITTED by default** — see the account flag below |
| `/compte/` | `/en/compte/` | **NOT EMITTED by default** — see the account flag below |
| `/auth/callback/` | — | **NOT EMITTED by default.** The only unlocalised route |
| `/manifest.webmanifest` | — | Generated from `src/config/site.ts` |

Each route file is a two-line shell that renders a shared component from `src/components/pages/` with a `locale` prop, so the two locales cannot drift apart structurally.

Detail routes take their URL from the content's **`slug` field, not the filename**, so renaming a file can never silently move a published URL. `/cours/[slug]/` is still to come.

⚠️ **The EN legal notice is `/en/mentions-legales/`, not `/en/legal-notice/`.** The Session 3 brief asked for the translated segment; it is deliberately not implemented that way, because the no-translated-segments rule above is what makes the switcher a pure prefix swap that *cannot* fail to find its counterpart. A translated segment needs a lookup map, and a missing entry 404s a reader mid-visit — on the one page whose whole job is to be findable. The visible link label **is** translated ("Mentions légales" / "Legal notice"); the URL is structural. Flagged for Seàn: it is a one-line change in `paths.ts` plus a map if he wants the English URL, and the site is unlaunched so it is still cheap to reverse.

---

## Progression — ranks, points, streaks, achievements (E3)

Direction: `docs/direction/mcc-direction-esthetique.md` §§ B1–B3, and the
addendum § E8 for the anti-cheat note. Everything is LOCAL: `localStorage`,
guest-first, no account anywhere in it.

| File | What it owns |
|---|---|
| `src/lib/points.ts` | **Policy.** Award values, rank thresholds, achievement shapes. Pure — an island may import it |
| `src/lib/scoreboard.ts` | **Build time.** Content → a catalogue with every award already computed. Imports `astro:content` + chess.js, so no island may touch it |
| `src/components/progress/ScoreResolver.astro` | The one computation, inline, in the first paint. Publishes `window.MCC_SCORE` and owns the toast |
| `src/lib/score.ts` | The islands' typed accessor. **It computes nothing** |
| `src/styles/score.css` | The toast, in the shared sheet rather than scoped — see the size note below |

### ⚠️ POINTS ARE DERIVED, NEVER BANKED — the rule of the whole feature

There is no `points` number in `localStorage` and there must never be one. A
total is recomputed from the work behind it every time it is read.

A stored balance is a number a student types into a console in three clicks, and
once stored the site cannot tell an earned 400 from a typed one. A derived total
is exactly as good as the records behind it: to fake it you have to fake the
solves.

Two consequences that fall out for free, and are worth knowing before anyone
"optimises" this into a cached balance:

- **No farming, with no anti-farming code.** Re-solving awards nothing because
  `solved` is a boolean. There is no "have they done this before" branch
  anywhere — `ExerciseView` shows the *delta in the total*, which is 0.
- **A multi-board lesson awards on its LAST board**, for the same reason: a
  lesson is one catalogue entry, and the delta is 0 until every key is solved.

### ⚠️ NO POLICY LIVES IN THE INLINE SCRIPT

`ScoreResolver`'s script sums numbers and compares them. Every award value,
threshold and achievement condition arrives as **data**, computed at build time
by `scoreboard.ts` from `points.ts`. The script contains no award rule and no
notion of what a mate is worth — so the policy cannot drift from what a reader
is shown, because there is no second copy of it. Same trick as `MCC_THEMES`.

What IS duplicated is the two storage keys (`mcc:progress:v1`,
`mcc:streak:v1`), because an inline script cannot import a bare specifier —
the fourth such duplication, same trade, and `progression.spec.ts` seeds both
keys directly so a divergence fails there.

### The thresholds, and why these numbers

Content today, at full marks and no hints: 13 tutorial steps × 5 = 65, 11
lessons × 10 = 110, 3 standalone exercises = 55. **230 of learning**, plus 120
from games (two counted wins at each of 5/15/40) = a 350 ceiling.

| Rank | Points | What it takes |
|---|---|---|
| Pion | 0 | arriving |
| Cavalier | 20 | four tutorial steps — ten minutes, inside the first sitting |
| Fou | 70 | the whole tutorial (65) **plus one lesson** |
| Tour | 150 | the tutorial and most of a course |
| Dame | 220 | essentially all the teaching content |

- **Cavalier at 20** is the brief's "achievable in one session" taken literally.
  It has to land in the first sitting or the ladder is invisible to the reader
  it is for.
- **Fou at 70 sits deliberately just ABOVE the finished tutorial (65).**
  Finishing the basics is the prerequisite, not a destination; one lesson
  completes the step, which says "now start learning" at the moment it is true.
- **Dame at 220 against a 230 learning ceiling** is the direction's
  non-negotiable — *un rang gagné en cliquant ne dure pas deux minutes face à un
  ado*. The 10-point gap is slack for a couple of hints, and games can cover it.
- **Dame does not require games** (230 > 220). A student who only wants to study
  can still reach the top rank.

⚠️ **These are absolute numbers and the content will grow**, so every threshold
silently gets easier. Re-tuning is expected — but it may only move in the
direction that does **not demote** anyone who already holds a rank. A rank taken
back is worse than a rank that was slightly cheap.

### ⚠️ NO DAILY STREAK. NOT NOW, NOT LATER.

**The club meets weekly.** A consecutive-day streak would break every week by
design, for every student, through no fault of theirs — it would punish exactly
the rhythm of the people it is meant to motivate. The direction doc raises the
same worry (§ B2) and this is the answer to it.

The session streak is the honest version: consecutive exercises solved with no
wrong move, in `sessionStorage` under `mcc:streak:v1`, gone when the tab closes.

- **It is never presented as a loss.** There is no "streak lost" message and
  there must not be — a reader whose move was refused is already being told;
  charging twice for one mistake teaches a beginner that trying is expensive.
  Below two it is simply not shown.
- **A re-solve extends it.** It measures this session's accuracy, not new
  ground. With sixteen solvable things on the site a streak that counted only
  firsts would be unreachable for a returning student.
- **It is never synced.** A session streak is meaningless on another device,
  which is why it lives in a store that does not outlive the tab.

### Achievements — computed, with one stored bookmark

Earned is **derived** from progress; **announced** is stored (`announced` in
`mcc:progress:v1`). Without the bookmark the toast fires again on every page
load for ever. Clearing it re-announces, which is harmless; it can never grant
anything, because it is not consulted when deciding what is earned.

The toast is `role="status"` / `aria-live="polite"` — never `alert`. Good news
arriving while a reader is mid-thought about a position must not interrupt.

⚠️ **"A trap mastered" is DELIBERATELY NOT SHIPPED.** A trap page is a
*replayer*: nothing on it records anything, because stepping through a game
someone else played is reading, not competence — and the resolver's own rule is
that opening a page leaves no trace. The only way to ship it today would be to
award it for scrubbing a replay to the end, which is precisely the "rank earned
by clicking" the direction forbids. It lands when a trap carries an exercise.
In BACKLOG.md.

### ⚠️ ANTI-CHEAT — what changes when accounts land

`localStorage` is editable in three clicks. **While points are local they are
declarative**, and the site says so on `/progres/` rather than pretending
otherwise.

> **Once accounts land (v2-S3), the balance must be computed SERVER-SIDE from
> actually-solved exercises, and never accepted from the client.** No endpoint
> may take a total, a rank or an achievement list as input. The client may send
> *what it solved*; the server decides what that is worth.

Nothing in `points.ts` may become a wire format for a client-supplied total.
This matters more than it looks: E8's shop turns points into real objects
produced by Nachi3D, and a declarative balance that buys a physical keyring is
a different problem from one that colours a badge.

The ledger already carries `origin` and `source` per entry so **teacher-awarded
points (v2-S4) are a new producer rather than a migration.** They are NOT built.

### ⚠️ An inline script on 62 pages is a size decision, not a detail

The resolver is mounted on the home page, `/progres/`, and every page with a
judged board or the engine — ~62 of 86 documents. Written in this codebase's
usual commented style the script measured **9.5 KB per page** and the catalogue
5.2 KB, for +1033 KiB of precache. That is the trap CLAUDE.md already records
for the theme head script (8.4 KB → 5.7 KB), walked into a second time.

Three things brought it to +744 KiB, and each is worth keeping:

- **the script is terse** — rationale in frontmatter, which compiles away;
- **catalogue entries carry no `i` field** and achievement conditions reference
  entries **by index**. Both alternatives (repeating progress keys inside
  conditions; giving each entry a string id) duplicated the very keys sitting
  beside them;
- **the toast CSS is in `src/styles/score.css`, not a scoped `<style>`**. Astro
  inlines a small scoped block into every document that uses it — measured at
  1.4–4.5 KB per page.

Still on the table if it needs to shrink further: serve the catalogue as one
same-origin JSON file and inline it only on the two pages that need it in the
first paint. It costs a request on board pages and was judged not worth the
complexity yet. In BACKLOG.md.

---

## ⚠️ A CARD THAT RENDERS HAS A DESTINATION — an index entry with no href is a bug

`CardItem.href` on `src/components/CardGrid.astro` is **required**. There is no
unlinked card state on `/cours/`, `/pieges/` or `/exercices/`, and there is not
going to be one.

`/cours/` shipped one. "Les bases : le plateau et les pièces" rendered the full
card — surface, title, summary, level badge — and did nothing when clicked,
because the course had no lesson pages and `href` was optional. **That is worse
than the card being absent.** An absent card tells a reader nothing is there; a
present, inert one tells them the site is broken. It is also close to invisible
to testing: nothing is *missing* from the page, so only an absence of behaviour
gives it away.

Two halves hold it now, and both are needed:

- **The type** — `href: string`, not `string | undefined`. `CardGrid`'s three
  callers cannot construct the state.
- **`tests/e2e/index-cards.spec.ts`** — every card on all three indexes, both
  locales, has a `.card-link` whose href **resolves 200**. The type binds this
  file's callers; the spec binds what a reader can click, and would catch an
  index that drew its own markup. It asserts the link resolves rather than
  merely exists, because pointing a dead card at a 404 satisfies the letter and
  nothing else. It also asserts the index is non-empty first — every assertion
  below that passes vacuously on a list with no cards, which is how this class
  of bug survives.

### A course with no lessons FAILS THE BUILD

`CoursPage.astro` throws, naming the slug and both ways out. The three options
were "render it unlinked" (the bug), "drop it silently" (content that vanishes
with no signal — the next session writes a course, sees no card, and debugs the
index) and "say so at build time". Only the last one tells the person who can
fix it, before a reader sees it.

`draft: true` is the way to park a course that is genuinely being written. It is
filtered out before the check, so the states are **openable** and **deliberately
parked**, with nothing in between.

### The `les-bases` record was removed, not linked

Deleted (`src/content/cours/les-bases.json`), and the reasoning matters because
the obvious fix was to point it at `/apprendre-les-bases/`:

- **That content IS the tutorial.** The summary named the board, how each piece
  moves, castling, en passant and promotion — which is exactly the thirteen
  steps of `/apprendre-les-bases/`, verified step by step. There was never a
  course to write; there was a duplicate index record for content that ships.
- **Linking it would put one destination on one page under two names.**
  `/cours/` already links the tutorial at the TOP, deliberately, as the named
  prerequisite (`tutorial.prerequisite`). A card titled "Les bases : le plateau
  et les pièces" pointing at the same place is the exact thing Critical Feature
  20 forbids — two names for one destination reads as two different sites.
- **Writing real lessons for it** would have meant a second, parallel copy of
  thirteen steps of shipped teaching in both locales, free to drift from the
  original, for readers who already have a better route to it.

Corroborating detail, in case anyone is tempted to restore it: it carried
`order: 1`, the same as `bien-ouvrir-une-partie`, so the course list's sort was
already ambiguous. It was a record nobody had maintained.

The tutorial keeps its own entry points — the prerequisite line here, the home
CTA and the dashboard tile — and gains nothing from a course card.

---

## Demonstration boards vs boards you play on

A lesson can carry a replayer that DEMONSTRATES and an exercise board that
EXPECTS A MOVE. Nothing distinguished them, and the site's own author reached
for the pieces on a demonstration board. A twelve-year-old will do it every time.

Every board now carries a tag above it:

| Board | Tag | Weight |
|---|---|---|
| replay | *Démonstration — utilise les flèches* | 2px hairline, secondary text |
| exercise | *À toi de jouer* | 3px accent border, accent text, filled dot |

### ⚠️ The tag is REAL TEXT, and that is the point

An icon or a colour alone leaves a screen-reader user with exactly the question
the change exists to answer — "may I move these pieces?" — and no way to answer
it. `board-affordance.spec.ts` asserts both tags have non-empty text, so a
future "tidy-up" into pseudo-element content fails there.

Colour is the LAST of four signals: the sentence, the border weight, the accent
colour, and the dot. Someone who cannot distinguish brass from a hairline still
reads *À toi de jouer*.

### Scope: labelled EVERYWHERE, including single-board pages

The tags live in `ReplayBoard.astro` and `ExerciseBoard.astro`, so every call
site gets them: lessons, tutorial steps, `/pieges/[slug]`, `/exercices/[slug]`.

That is a deliberate choice over labelling only pages that hold both. The
confusion is not "which of these two is mine?" — it is **"may I touch this?"**,
and that question exists just as much on a trap page whose only board is a
replayer. That is precisely the mistake that prompted this work.

### The launch control

Four small glyph buttons did not read as "press me". Before the demonstration
has been started there is one useful action, so it is offered as one filled,
named, ≥44px control — *Lancer la démonstration* — which disappears once the
first move is made.

⚠️ **The compact controls are NOT hidden beforehand.** "Collapsing to the compact
set" happens by the launch button going away, not by removing the others. Hiding
them made "jump to the end" unreachable as a first action and broke eight
existing navigation specs that legitimately expect the controls on arrival. The
launch button is an additional entry point, never a gate.

Keyboard behaviour is untouched: the arrow keys drive the replayer whether or not
the button has been used, and its handler is bound to the document.

### Cursor: already correct, deliberately unchanged

Chessground scopes `cursor: pointer` to `.cg-wrap.manipulable cg-board`, and it
only adds `manipulable` when the board is not `viewOnly`. Verified: a replay
board computes `auto`, an exercise board `pointer`. No change was needed; a spec
now pins it so it cannot drift.

### ⚠️ `--mcc-border` DOES NOT EXIST — and silently kills a border

The tokens are `--mcc-border-subtle` and `--mcc-border-strong`. There has never
been a plain `--mcc-border`.

An unknown custom property makes the whole `border-left: 2px solid var(...)`
shorthand invalid at computed-value time, so `border-style` falls back to `none`
and the width computes to **0px** — no error, no warning, just no border. Twelve
occurrences across seven files had been rendering borderless since the sessions
that introduced them: the home pillars, tutorial cards, lesson cards, course
cards, the login panel, and more.

All twelve now use `--mcc-border-subtle`. The affordance spec asserts both board
borders have a non-zero width, which is the general shape of a guard against
this: **assert the border RENDERED, not that the rule exists.**
---

## ⚠️ The frame belongs on the COMPONENT box, not the playing surface

`.mcc-board` carries the frame (border, radius, shadow). `.mcc-board-host` — the
Chessground element — carries none.

It used to be on the host, which was correct until the coordinates moved into
gutters living in `.mcc-board`'s padding, **outside** the host. The frame then
enclosed the squares and excluded both gutters. Measured: it cut across the rank
labels, the file labels hung 19px below it, and it overhung the component's right
edge by exactly 6px — its own 2×3px border, added outside a content box that the
left padding had already narrowed.

**The rule: the frame goes on the box that contains everything the component
draws.** If a later change adds anything outside `.mcc-board`, the frame moves
with it.

Padding is uniform on all four sides (`--mcc-board-inset`) **plus** the gutter on
the two sides carrying coordinates. Without the uniform part the rank labels sit
flush against the frame while the opposite side has a full gutter of space —
enclosed, but visibly off-centre.

`tests/e2e/board-frame.spec.ts` asserts the surface **and** both coordinate
tracks lie inside the frame's inner edge, and that the four gaps agree within
4px — in idle, refused and solved states, at two sizes.

⚠️ It deliberately does **not** assert "a border exists": that would have passed
throughout the bug. Verified to fail on the old geometry, with the message *"the
file labels fall outside the frame"*.

### ⚠️ Chessground leaves up to 8px of the host unused — CENTRE IT (M3)

`updateBounds()` in `chessground/src/render.ts` sizes the board by flooring the
host's width to a whole number of **8 device pixels**:

```js
width = Math.floor((bounds.width * devicePixelRatio) / 8) * 8 / devicePixelRatio;
```

so an 8×8 grid always lands on whole device pixels and the squares stay crisp.
`cg-container` is then `position: absolute; top: 0` with no `left`, which puts
the entire remainder at the **right and the bottom**.

Measured on a tutorial step at 1000px: host 279.44px, board 272px — and the
frame's gap was **6.4px left/top against 13.8px right/bottom**. The frame was
drawn correctly; it simply was not centred on what it encloses, which is the
rule above. `.cg-wrap cg-container { inset: 0; margin: auto }` centres an
absolutely-positioned box with a definite width and height — which this one has,
set inline by the JS — so the remainder is split and all four gaps agree.

⚠️ **Safe for hit-testing, and worth stating because it looks risky.**
Chessground derives every square from `bounds`, which is
`elements.board.getBoundingClientRect()` — the `cg-board` element itself, not
the wrapper. Moving the container moves the board and the bounds with it.
`board-pointer.spec.ts` is what actually proves it.

⚠️ **This was a PRE-EXISTING failure of `board-frame.spec.ts` on `dev`**, found
during M3-suite and confirmed by stashing that session's work and rebuilding —
it failed identically. The spec's 4px tolerance encoded "sub-pixel rounding of
an 8-square grid"; the real quantum is 8px. The fix removes the asymmetry rather
than widening the tolerance, which is why the tolerance is untouched.

---

## Board coordinates live in an OUTER GUTTER (reversal)

They used to be drawn on the squares. Readable on a desktop, poor on a phone:
small text over a wood-toned square, competing with the piece standing on it.

They now sit outside the playing surface — ranks in a left gutter, files in a
bottom gutter. This is the layout Chessground was built for, which is why its
defaults carried `left: 24px` / `top: -20px`: those offsets were reserving
exactly this gutter. We now provide it.

### ⚠️ The gutter goes on the WRAPPER, never on the Chessground host

Chessground sizes `cg-container` from the host element, and absolutely
positioned children resolve insets against the host's **padding box**. Padding
on the host therefore does two wrong things at once: it inflates the playing
surface and double-counts into every coordinate inset. Measured when it was
tried: labels 12–26px out, and the board overflowing a 390px viewport.

`.mcc-board` (the wrapper) carries the padding; the coordinates are projected
into that reserved space with negative insets. The playing surface stays
**exactly square** — verified Δ0.0px at every size.

### ⚠️ Specificity, not just the declaration

Chessground nudges ranks with `.cg-wrap coords.ranks coord { transform:
translateY(39%) }`. Resetting that from `.cg-wrap coords coord` **loses** — one
class fewer — and the reset silently does nothing. Measured when it did: every
rank label 16.4px low, which is exactly 39% of a 42px cell. Match their selector.

### One coordinate colour per palette

Coordinates are on the page background now, so there is no light/dark square
parity to satisfy. The two-ink rule is **gone**: `--mcc-board-coord`, one per
palette, checked against `--mcc-surface-page` in `check-contrast.mjs` for both.
The old per-preset on-square pairs were removed — they audited a relationship
the site no longer has. Measured 5.13:1 light, 7.79:1 dark.

### The mobile cost, and why it was accepted

The gutter comes out of the board, not out of the page: on a 390px phone the
playing surface goes **352px → 336px**, about 4.5%. A square drops from 44px to
42px. That was judged worth it — a 42px square is still comfortably above the
24px minimum touch target, and the coordinates went from barely legible to
plainly legible, which is the entire point of the change.

---

## ⚠️ Pointer play must be tested BY POINTER

Every exercise spec that solved a position on a course lesson did it by typing
into `MoveInput`. That path bypasses Chessground entirely and calls `onMove`
directly, so it stays green even if the board refuses every tap. A pointer-only
regression could therefore ship completely unnoticed.

`tests/e2e/board-pointer.spec.ts` solves a position with taps/clicks in all four
contexts a judged board appears in: course lesson, a lesson with several boards,
tutorial step, and `/exercices/[slug]`.

### ⚠️ Scroll the board FULLY into view, not merely "if needed"

`scrollIntoViewIfNeeded()` guarantees only that the element is PARTLY visible. On
a phone viewport a 336px board can end up with its top half above the fold, and a
tap aimed at an off-screen square is silently dropped — the board looks dead.

This produced a completely convincing false positive during this session: an
apparent reproduction of "course exercises are not playable", which was the test
harness scrolling the board half off-screen. Use
`el.scrollIntoView({ block: 'center' })`.

It is also a real hazard for a reader: a board embedded mid-way through a long
lesson may not fit on a phone screen with room to spare.

### ⚠️ WebKit skips links when tabbing — do not assert Tab order into a menu

Safari ships with "Press Tab to highlight each item on a webpage" OFF, so Tab
moves between form controls and **skips links**, across the whole web. A test
asserting that Tab from a menu button lands on the first link passes in Chromium
and Firefox and fails in WebKit for a reason unrelated to the menu. Assert that
the links are present and focusable instead.
---

## Navigation — grouped disclosures, not a dropdown

Seven flat links had outgrown one row, badly on a phone. The nav is now three
groups plus a home link:

| Group | Contents |
|---|---|
| **Apprendre** | Les bases, Cours, Pièges |
| **S'entraîner** | Exercices, Jouer |
| **Le club** | Agenda, Contact |

`/` stays a top-level link — home is where the logo already goes, and burying it
would be worse than the wrap. The language switcher, account button and theme
toggle are untouched.

### ⚠️ Disclosure semantics, NOT `role="menu"`

The brief asked for "menu semantics". It is deliberately **not** built that way.

`role="menu"` / `menuitem` describes an APPLICATION menu: screen readers announce
"menu", expect arrow-key roving focus with a single tab stop, and stop announcing
the contents as links. These are site navigation links. The WAI **disclosure
navigation** pattern is the correct semantics — a `<button>` with `aria-expanded`
and `aria-controls` revealing a plain `<ul>` of links, walked with Tab, which is
what every reader already expects of a website.

### ⚠️ Click, never hover

The phone is the primary device and hover does not exist there. The panels open
on click at every viewport; there is no hover behaviour to be unreachable.

### ⚠️ The `html.js` gate — no layout shift, and no no-JS trap

Panels are hidden by CSS gated on `html.js`, exactly as the theme toggle and the
scroll reveals are:

```css
:global(html.js) .nav-panel { display: none; }
:global(html.js) .nav-group[data-open] .nav-panel { display: flex; position: absolute; }
```

Because the inline head script sets `js` before `<body>` exists, panels are
closed from the FIRST paint — nothing flashes open and collapses. Without JS the
rule never applies and every link renders, visible. Open panels are absolutely
positioned, so opening one cannot move the page: **measured 0px shift of
`<main>`**.

Escape closes and **returns focus to the toggle** — without that a keyboard
reader is dropped at the top of the document. Opening one group closes the
others; two open panels overlap on a narrow screen.

**Current section, not current page.** The toggle carries `is-current` when the
reader is anywhere inside its group, so the section is visible without opening
anything.

---

## ⚠️ Board coordinates: the track must BE the board box (SUPERSEDED — see the gutter section above; the alignment principle still holds, the on-square placement does not)

Fixed in `board.css`. Chessground's defaults are wrong for how we draw
coordinates, and not subtly:

```css
coords.files { left: 24px; width: 100%; }   /* ← 24px right, still full width */
coords.ranks { left: 4px; top: -20px; }
```

`left: 24px` with `width: 100%` shifts the whole row of eight labels 24px right
while keeping it a board wide, so it overhangs the right edge and the **"h" falls
off the board**. Measured: every label off by exactly **+24px**, identical at
544px and at 352px — a CONSTANT, so on a phone it is more than half a square.

Those numbers are tuned for lichess's layout, where the board sits inside a
wrapper with a margin and the coordinates live in that margin. We draw
coordinates ON the squares (which is why two inks exist), so the offsets have
nothing to sit in and simply displace everything.

**The fix is geometric, never a nudge:** pin each track to the board box with
`inset`, and let the eight children divide it with `flex: 1 1 0`. One cell is then
exactly one square, and a label's centre is its file's centre at every size and in
both orientations.

⚠️ **`flex: 1 1 0`, not Chessground's `flex: 1 1 auto`.** With an `auto` basis the
cells are content-sized first, so a wide glyph steals space from its neighbours
and the labels drift apart.

⚠️ **Aesthetic insets go on the `coord` child, never on the track.** Padding on a
child cannot move a label off its file; padding on the track moves all eight.

`tests/e2e/nav-coords.spec.ts` measures label centres against file centres at two
viewports and in both orientations, so a constant offset — invisible in a
screenshot review, obvious in arithmetic — cannot come back.

### a1 looking different is NOT a bug

Investigated and closed. On the tutorial steps that solve with `a1a8` or `a1h1`,
a1 is the **origin square of the move just played**, so it correctly carries
Chessground's `last-move` highlight — brass at 55% opacity, which reads as gold.
Verified: on `la-tour` the highlighted squares are `a1` and `a8`; on
`le-cavalier` they are `g1` and `f3` and a1 is untouched. The element stacks over
a1 and c1 are identical, and the checker is a deterministic conic gradient, so the
two cannot differ in background.

**Do not "clear board state on solve" to make it go away** — that highlight is
the feedback telling the reader which move they just made.

---

## Sound — SYNTHESISED, OFF BY DEFAULT (E2)

Direction: `docs/direction/mcc-direction-esthetique.md` § C3. **`src/lib/sound.ts`
is the single source**, exactly as `motion.ts` is for durations and for the same
reason: these numbers only mean anything relative to each other. A capture must
read heavier than a placement and a wrong move softer than either, and scattered
oscillators drift out of that relationship one commit at a time.

⚠️ **NO OTHER FILE MAY BUILD AN `AudioContext`, AN OSCILLATOR OR A GAIN NODE.**
Islands call `play(event)`; the settings page calls it for a preview. That is
the whole public surface.

### No audio files — three decisions at once

0 bytes in the precache and 0 requests, so a phone on Essaouira mobile data pays
nothing for a feature it may never switch on; no licence question in a GPL repo,
because a synthesised waveform has no author to credit; and every parameter is
tunable from one file, so "the capture is too harsh" is a one-line change rather
than a re-recording.

### The palette — six voices, and deliberately no more

| voice | shape | why |
|---|---|---|
| `place` | triangle 240→170 Hz, 45ms, lowpass 2.2k | a piece meeting wood: fast fall, no sustain |
| `capture` | sawtooth 150→90 Hz, 75ms, lowpass 900 | heavier and lower; the low corner makes it a thud, not a rasp |
| `check` | triangle 440 + 622 Hz, 70ms | a tritone — the most unstable interval there is. A warning, not an alarm |
| `solved` | sine 587 → 880 Hz, 70+80ms | a rising fifth. Open and resolved **without** being a fanfare |
| `wrong` | sine 175→150 Hz, 150ms, 18ms attack | see below |
| `achievement` | the solve plus a third note (1175 Hz) and a faint octave | "that, but more" — recognisably the solve, since it is rarer |

⚠️ **THE WRONG-MOVE VOICE IS THE ONE TO GET RIGHT.** A synth makes a buzzer
trivially easy and that would be the wrong instrument entirely: this is a
teaching tool for children, and an error must inform rather than scold. So it is
a pure sine (no harmonics to bite), the lowest gain in the palette, and the only
voice that fades **in** rather than striking. Both refused verdicts share it —
under `onlyMove: false` we do not know the reader was wrong, so we must not
sound as though we do, which is the `onlyMove` rule applied to a second sense.

⚠️ **Nothing sounds for navigation, hover, scroll or page load.** A site that
chirps as you scroll is a site you mute — and then the sounds that carry meaning
are muted too.

⚠️ **Every tone is 20–80ms except `wrong`.** The two SEQUENCES are longer only
because they are several short tones in a row — the same distinction motion.ts
draws between a family duration and a composite built from one. `wrong` is the
deliberate exception at 150ms because softness is an **envelope**, and an
envelope needs time; a 60ms sine is a blip, and a blip reads as a buzzer however
quiet it is.

⚠️ **One sound per move.** `voiceForMove()` owns the priority — check beats
capture beats place — so the two islands cannot disagree. A capture that gives
check is a check: the more urgent fact, and stacking both reads as a bug.

### `mcc:sound:v1` — its own key, and why not the theme record

Considered and rejected. The theme record is parsed by the **blocking inline
head script** before first paint; sound cannot possibly matter before first
paint, because it cannot exist before a gesture. Putting it there would grow the
parse surface of the one script that runs before anything is on screen, to carry
a value it will never read. Two keys also version independently — a change to
the sound shape must not force a theme migration on readers who never turned it
on.

Everything else follows `theme.ts` and `progress.ts`: versioned key, guarded
access, normalised field by field, single migration point. ⚠️ **Any doubt
resolves to OFF** — a corrupt record must never make a silent site start making
noise, so the parser is biased towards silence rather than towards preserving
intent.

### The context: one, and never before a gesture

Browsers refuse to start an `AudioContext` without user activation and leave it
`suspended`, so building one earlier buys a broken object — and it is the
project's standing "nothing before a click" rule, the same one that keeps
Stockfish's 3.6 MB behind a button. `initSound()` only arms two one-shot passive
listeners.

⚠️ **ONE context for the life of the page, not one per sound.** An
`AudioContext` is backed by a real audio device; creating one per move exhausts
the browser's limit inside a single exercise and then every later sound fails
silently. `sound.spec.ts` patches the constructor and counts.

### `prefers-reduced-motion` DOES NOT SILENCE THE SITE

⚠️ **This departs from the direction doc**, which lists *"aucun son"* under
`prefers-reduced-motion` (§ Contraintes 2). The E2 brief overrules it, and the
reason is that the two are different senses: the preference exists for
vestibular discomfort, not for hearing, and switching sound off for those
readers decides something they did not ask about.

⚠️ **But it does suppress the OFFER**, which is a different judgement. A reader
who has told their OS they want things calmer has said something about being
interrupted, and an unprompted invitation is an interruption. `/parametres/`
stays exactly as reachable for them as for anyone. Both halves have specs.

### The one-time invitation

Offered once, at the first solve, and retired by **either** answer — declining
writes `invited: true` too. An invitation that returns after a "no thanks" is
not an invitation, it is nagging.

⚠️ It renders **outside** the verdict's `aria-live` region. Buttons inside a
live region are re-announced on every update and make the panel a moving target
for anyone tabbing; the offer follows the verdict, it is not part of it.

### Sound is never the only signal

Every voice accompanies a visual that fires independently — the piece moves, the
piece disappears, Chessground paints the check highlight, the verdict text
changes, the board shakes, the toast appears. That is what makes it safe for
`play()` to give up quietly on a hidden tab, a missing audio device or a refused
context, and it is why a reader on silent loses nothing.

⚠️ **Suppressed when the tab is hidden** — a sound from a tab nobody is looking
at is unattributable noise.

### The achievement event

`ScoreResolver`'s script is `is:inline` and cannot import a bare specifier, so it
**dispatches** `mcc:achievement` and the sound module listens. The name is
duplicated there in one string — the same trade the storage keys get — and
`sound.spec.ts` pins the pair.

## Motion — THE THREE FAMILIES (E1)

`src/lib/motion.ts` is the single source for every duration on the site. It was already the home of the board and pacing numbers; E1 made it the whole vocabulary.

Direction, approved by Seàn and recorded in `docs/direction/mcc-direction-esthetique.md`: **the site should feel like a game because it RESPONDS, not because it is dressed up.** An animation that is not the answer to something the reader did is decoration, and decoration goes last or not at all.

| Family | Band | Curve | What belongs in it |
|---|---|---|---|
| **Réponse** | 120–180ms | `--ease-response`, fast-out | What follows a **click**. Button press, card grab, tab switch, replay step, the chevron on a nav group, the move counter's hop. |
| **Transition** | 250–350ms | `--ease-transition`, gentle | A visible **state change** the reader should watch land. Hint reveal, panel open, verdict text, a piece moving, a scroll reveal, the solve's two beats, the correct-move pulse. |
| **Ambiance** | 4–20s | linear, looping | Background drift **only**. Never tied to an action, never carrying information. |

### ⚠️ NOTHING SITS BETWEEN 180ms AND 250ms

The gap is the point. It is what keeps *"the site heard me"* and *"watch this change"* legible as two different things rather than one smear of vaguely-quick. A duration that wants to live in the gap is a **design question, not a tuning question**: decide which family it is and take that family's number.

`tests/e2e/feel.spec.ts` sweeps **every element** on three routes and fails on any computed transition or animation duration inside the gap. It is a sweep rather than a list because the failure it guards against is a `220ms` appearing in a component nobody thought to add to a list.

### What is NOT a family — and must not be forced into one

Three things came out of the audit that legitimately fit no family. They are documented as exceptions rather than given a fourth band:

- **Pacing.** `THINK_FLOOR_MIN_MS`/`MAX_MS` (500–800ms) and the scripted opponent's reply delay. Nothing *moves* for these — they are a wait before motion starts, they have no curve, so they have no family.
- **Offsets.** `REVEAL_STEP_MS` (60ms stagger) and the ambient layer's negative `animation-delay`s. A delay is *when* a duration starts, not how long it runs; the family governs the duration it offsets.
- **Composites.** A shake is four Réponse beats, not a 600ms animation. A solve is two Transitions with a gap. Both are spelled as **arithmetic on a family constant** (`SHAKE_MS = RESPONSE_MS * 4 + 20`, `calc(var(--motion-response) * 4)` in CSS) so they cannot drift into being a fourth family.

### The CSS mirror, and how it is kept honest

CSS cannot import TypeScript, so `tokens.css` restates the numbers as `--motion-response` / `--motion-transition` / `--motion-ambient-min|max`. That is a mirror, and mirrors drift — so **`feel.spec.ts` reads the custom properties off the live document and asserts they equal the imported constants.** Change a number in one place and the spec says so. Same trick as the `BRUSHES` mirror in `BoardSurface.tsx`, but checked rather than trusted.

`--duration-fast` / `--duration-base` / `--duration-slow` and `--ease-soft` are **gone**. `--duration-slow` (600ms) fitted no family at all; the other two were renamed to say which family they are.

### `src/styles/controls.css` — the press, in one place

A button that only changes colour on `:active` reads as a link doing something, not as a control being pushed. The press is a **translate plus a shadow tightening**: the control moves toward the page and the gap beneath it closes. Both together.

⚠️ **`.btn-primary` and `.btn-ghost` were defined seven times**, once per page component's scoped `<style>`, with drifts between them. Astro scoped styles carry an attribute selector, so they beat any global rule of the same class specificity — a press defined globally would have been **silently ignored** on whichever properties a scoped block happened to also set. So the *structure* moved to `controls.css` and the scoped blocks keep only colours and page-specific margins.

That refactor also fixed a **pre-existing miss**: the old definitions came out at ~40px tall, under the 44px touch target, and nothing was measuring it. `min-height: 2.75rem` is now in one place and `feel.spec.ts` measures every button on three routes.

Island CSS (`exercise.css`, `play.css`, `replayer.css`) spells the same declarations locally, because those are separate chunks whose cascade order against the global sheet is not guaranteed. One vocabulary, two places it is written, with a comment in each pointing at the other.

### ⚠️ THE BOARD STAYS SOBER

Motion lives **around** the board — buttons, cards, transitions, background. A shimmering board is a board that reads badly, and the audience does not yet know where f7 is.

The single exception is the **correct-move pulse**: one Transition, one square, no loop, and only in exercise mode. It uses Chessground's own `highlight.custom` (a `Map<Key, string>` of extra square classes) rather than an overlay of our own, because Chessground already knows where a square is — including after a flip. `pulseSquare` on `BoardSurface` always passes a Map, never `undefined`: an empty Map is unambiguous in both directions, where `undefined` would depend on the same config-merge behaviour that `lastMove: undefined` already gets wrong.

**Play mode deliberately does not use it.** There is no "correct" there, and a board that flashes on every engine reply is a board that is hard to read.

### The ambient layer is TWO layers, and the ceiling is enforced by the group

`HeroAmbient.astro` has a near layer (4 pieces) and a far layer (3). Depth comes from the **rate**, not the period: the far pieces travel about a third as far over a longer cycle, so they move roughly four times slower in px/s — which is what the eye reads as distance. A longer period alone would just have made them lazier.

The drift periods were **47–71s before E1**, which is slow enough that a reader sees no motion at all in their first five seconds; the layer was paying its full cost and delivering nothing. They are now 13–20s, inside the Ambiance band and mutually non-multiple.

⚠️ **The 0.075 opacity ceiling is enforced by the GROUP, not by each piece.** `.ambient` carries `--mcc-ambient-opacity`, and group opacity is applied to the *flattened* group — so two overlapping pieces composite to the group's alpha and **not** to the sum of their own. That is the only reason a second layer could be added without re-auditing the hero text against a new worst case. **Do not move the opacity down onto the pieces.** `--mcc-ambient-far` is the far layer's share of that already-capped budget, and light mode takes the larger share (0.7 vs 0.55) because it starts flatter.

⚠️ **The reduced-motion off-switch needs BOTH selectors.** The `@supports (animation-timeline: scroll())` block sets `animation-name` via `.layer-far .piece` — two classes — so the single-class `.piece { animation: none }` lost the specificity fight and **the far layer kept drifting for a reader who had asked for stillness.** The near layer was unaffected, which is exactly why this needed a spec rather than an eyeball. Anything added to that `@supports` block needs a matching selector in the reduced-motion block.

### Reduced motion: off for decoration, instant for feedback

- **Ambiance is switched OFF**, not shortened. There is no version of decorative drift that a reader who asked for stillness wants at a different speed. It is the one family with no reduced-motion value at all.
- **Réponse and Transition collapse to 1ms** (not 0 — a transition that can never complete is a trap to leave lying around).
- **Feedback is never removed.** The press still reports itself through its shadow; the correct-move pulse still marks the square as a static ring; the verdict still changes the frame's colour. Only the travel goes.
- **The solve's two beats collapse.** A reader who asked for reduced motion asked for the outcome, not a choreographed arrival of it — staging a delay they did not ask to wait through would be treating "reduced motion" as "the same show, slower".

### Decisions taken in E1 (recorded, not re-litigated)

- **Nav labels stay functional** — Cours, Exercices, Jouer. Evocative names go on **page titles only**, in E4.
- **Ranks are Pion → Cavalier → Fou → Tour → Dame.** ✅ Built in E3 — see the progression section for the thresholds and the reasoning.
- **NO daily or consecutive-day streak.** The club meets *weekly*, so a daily streak would punish the normal rhythm of the people it is for. Session streaks only. ✅ Built in E3, and the rule is now Critical Feature 34.
- **Sound is synthesised via Web Audio and off by default.** E2, not built.
- **No confetti on a solve.** Precision is the reward, not visual noise.

---

## ⚠️ MOBILE AND DESKTOP DIVERGE AT 768px — ON PURPOSE (M1 + M2)

Direction: `docs/direction/mcc-direction-mobile-app.md`. It **supersedes the E5
retro menu on mobile only**.

| | below 768px | 768px and above |
|---|---|---|
| Navigation | fixed **bottom bar**, four entries | grouped header, unchanged |
| Header | **one line**: name + theme + language | logo, three nav groups, settings, theme, language |
| Home | **dashboard** (dominant card, tiles, stats, next session) | the E5 retro menu, unchanged |

### ⚠️ DO NOT "UNIFY" THESE. THE DIVERGENCE IS THE FEATURE.

The retro menu was designed for a large screen. At 390px it was a list of links
on a dark background, under a header that already repeated every one of them:
two stacked menus before any useful content, five entries of identical weight,
nothing saying where to start. That is not an execution defect — the design was
wrong for the format.

`tests/e2e/mobile-app.spec.ts` pins **both sides of the breakpoint**, including
767px and 768px explicitly. A future session tidying the two layouts into one
finds out there.

### How the two home pages coexist

Both are in the DOM; CSS decides which is on screen. Three details are
load-bearing:

- **The dashboard comes FIRST in the DOM.** Below 768px the menu screen hides
  everything of its own *except the tagline*, so the phone reading order is:
  dominant card → tiles → stats → next session → that sentence. It is ONE
  element, shared. A second copy in the same file is a sentence that will
  eventually disagree with itself.
- **The `<h1>` goes `sr-only` on mobile, never `display: none`.** The club name
  is already visible in the reduced header, so repeating it is the redundancy
  M1 exists to remove — but `display: none` takes the page's only `<h1>` out of
  the accessibility tree and leaves the document with no top-level heading.
- **The desktop menu markup and CSS are untouched.** Everything mobile lives in
  a `max-width: 767.98px` query.

### The bottom bar

**Exactly four entries: Accueil, Apprendre, Jouer, Progrès.** Not five.

⚠️ **Settings is deliberately not one of them.** It is visited twice and then
never again, so it does not earn a slot in the one element visible on every
screen — and five targets across 390px is 78px each, where labels truncate.
Pièges, exercices, agenda and contact live *inside* these four sections.

- ≥48px targets, `aria-current="page"` on the active entry, and the active
  state is colour **plus** a rule above it, never colour alone.
- **It never hides on scroll.** Stability beats the pixels.
- ⚠️ **`env(safe-area-inset-bottom)` in TWO places**: as the bar's own bottom
  padding (so its background reaches into the iOS gesture area) and in the
  footer's bottom padding (so the bar does not cover the last line of every
  page). The bar is `position: fixed` and therefore takes no space — the page
  has to reserve it. `--mcc-bottom-nav` is the shared row height; `env()`
  cannot live inside a custom property and still resolve per device.

### ⚠️ BELOW 768px THE EXERCISE CONTROLS COMPACT. THE BOARD DOES NOT. (M3)

Measured at 360×640: the exercise component was **796px against 587px of
usable viewport, and the board was only 330px of it.** The other 466px was the
control stack — two stacked meters, a reserved verdict panel, a four-part
move-entry form and a standalone hint button, each a full-width block with
20px between them.

**The decision is to compact the controls and leave the board alone.** The
board is the thing being taught with; winning back pixels by shrinking it
would be solving the wrong problem. Measured after:

| | 390×844 | 360×640 |
|---|---|---|
| exercise component | 799 → **618** (usable 791 — fits) | 796 → **615** (usable 587) |
| control stack | 403 → **244** | 403 → **244** |
| board | 333 → **333** | 330 → **330** |
| scroll to reach prev/next | 815 → **618** | 1079 → **882** |

⚠️ **360×640 still does not fit in one screen — 615 against 587.** The
remaining 28px is one short nudge rather than the 209px scroll it was, and
`mobile-fit.spec.ts` bounds it at 660 rather than pretending otherwise.
Closing it completely would have cost either the board's size or the verdict
panel's reserved height.

**It is CSS only, and that is what keeps the desktop safe.** The dense row is
built with flex `order` from elements that are *not* adjacent in the DOM, so
the markup — and therefore the screen-reader reading order and the ≥768px
layout — is untouched. A JSX restructure would have moved the hint button
above the verdict panel on desktop too.

Three things pay for it, and each has a rule:

- **The meters go inline.** Label-above-value costs two lines for four words.
- **The verdict panel's reserve shrinks, it does not go.** 6.5rem → 5.25rem,
  because the panel is full-page-width here rather than a 15rem side column,
  so the same sentences take fewer lines. Removing the reserve would put the
  move field back to jumping under the reader's thumb between attempts.
- **The move-entry help line is `sr-only` until the field has focus.**
  ⚠️ Clipped, NEVER `display: none` — the field points at it with
  `aria-describedby`, and a clipped element is in the accessibility tree with
  certainty where a `display: none` target is honoured by most screen readers
  and guaranteed by none. It is safe to let it grow because the form is the
  LAST element in the column below 768px (`order: 6`); anything placed after
  it makes the reveal shift content again.
  **The visible label stays.** Hiding it and leaning on the placeholder saves
  another 22px and is the well-known trap: a placeholder disappears the moment
  the reader types.

`main`'s block padding also drops 2.5rem → 1.5rem below 768px — 80px of a
640px screen spent before the reader reaches anything, on every page.

### ⚠️ Every long route ends with a way onward (M3)

Trap and exercise detail pages carried a back link at the **top only**. A
reader who finished one on a phone was ~2 300px down, with the bottom bar
offering "Apprendre" (the courses) and nothing pointing at the index they came
from, and had to scroll the whole page back up to leave.

Both now end with the same link, from the **same i18n key** as the one at the
top — one destination, one name. `mobile-fit.spec.ts` asserts on four routes
and three phone sizes that the end-of-content navigation is visible, clears
the fixed bar, and is ≥44px.

### `/progres/` exists because the bar needs a fourth destination

The direction doc points "Progrès" at `/compte/` *or a local view while
accounts are off*. Accounts are off and `/compte/` is **not emitted at all**, so
pointing there would 404 from the one navigation element on every mobile screen.
When accounts land (v2-S3) the synced view goes here, in the same shape.

It is the **fourth** duplication of `mcc:progress:v1` in an inline script, after
the theme head script, `AccountButton` and the home resolver — same trade, same
reason, and the spec seeds the key directly so a divergence from
`src/lib/progress.ts` fails there.

### ⚠️ A ROUTE THAT EXISTS ON ONE LAYOUT ONLY IS A BUG

`/progres/` shipped in M3 reachable from the mobile bottom bar and **from
nothing at all on desktop**. The page built, rendered, and passed every one of
its own specs; a desktop reader simply had no way to reach it except by typing
the URL.

This is the same defect as an index card with no destination (Critical Feature
32), inverted: there, a way in that leads nowhere; here, a page with no way in.
Both are invisible to testing for the same reason — **nothing is broken, only
absent**, and absence is what a suite full of "this element does the right
thing" assertions cannot see.

So the rule is Critical Feature 36: **every destination the bottom bar reaches
must be reachable from the desktop header.** `mobile-app.spec.ts` reads the
bar's hrefs at phone width, then demands each one of the desktop header — in
both locales. ⚠️ **The list is read off the bar, never hard-coded**: that is the
whole value, because a fifth entry added to the bar then fails until it has a
desktop home. A spec listing four known paths would have passed throughout the
bug.

#### Where `/progres/` went, and why not the other two places

**Its own top-level entry in the nav root**, last, after the three groups.

- **Not inside a nav group.** It is not "Apprendre" (nothing to read) and not
  "S'entraîner" (nothing to do) — it is about the *reader*. Filing it under a
  content section is the same category error this file already rejects for
  putting settings under "Le club".
- **Not in the header-tools cluster.** Those are **preference controls** —
  theme, language, settings — and they are icon-only. Progress is not a
  preference; it is a destination you return to and read, and it needs a name
  rather than a glyph.
- **Top-level works** because the nav root already carries one plain link
  (Accueil), so it is not a new shape; it is a link rather than a disclosure,
  so it adds no fourth panel; and it sits where the bar puts it.

The label is `nav.progress` — **the same key the bar uses**, per Critical
Feature 20. Until this change that key had exactly one caller, which is a
smell worth noticing: a destination named nowhere else is usually a destination
reachable from nowhere else.

⚠️ **Measured cost: the header wraps to two rows between 768px and 1023px.**
The fifth entry adds 72px of nav width, which pushes `header-inner` past its
single line at those widths — 77px tall becomes 129px. Verified against `dev`:
the same header wraps at 768px *without* the change, so wrapping is existing
designed behaviour (`flex-wrap: wrap` is deliberate) and this widens the band
rather than introducing it. 1024px and up are unchanged. Not fixable by
trimming the gap — the four gaps only hold 16px at 0.25rem — so it was accepted
rather than papered over. In BACKLOG.

### Settings in the desktop header — beside the tools, not in a nav group

Chosen over "inside Le club", and the reasoning is in `SettingsLink.astro`: it
is a **preference control**, so it belongs with the other two preference
controls; the theme toggle beside it is a shortcut to one of these very
settings; and the nav groups are **content sections** that a reader walks
looking for something to read. "Le club" is about the organisation — filing a
personal display preference under it is exactly where nobody would look.

Desktop only. On a phone it would be a fourth icon on the single line M1 exists
to clear. The footer link stays.

### ⚠️ NEVER PUT `opacity` ON TEXT OVER AN AUDITED FILL

It cost a Lighthouse accessibility regression (100 → 96) that the entire
Playwright suite passed. `--mcc-primary-contrast` on `--mcc-primary` is proved
by `check-contrast.mjs` in all eight theme/mode combinations — and then CSS set
the text to `opacity: 0.9`, which blends it toward the fill and drops the real
ratio to **4.42:1**. The tokens were right; the rendering was not.

**The auditor cannot see an alpha applied on top of a pair it has proved.**
Same class as the ambient-layer ceiling, which is why that one is computed by
hand in a comment. Differentiate by size, weight and letter-spacing.

⚠️ And the reason the specs missed it: every axe test **seeded progress**, and
the resolver *removes* that element when it resolves. The never-seeded state
was the one state nobody audited. **A state that only exists before the reader
has done anything is still a state a reader sees** — axe now runs on both
branches, and in dark mode, where the lighter primary fill has less headroom.

---

## The home page is a MAIN MENU (E5) — ⚠️ ON DESKTOP ONLY SINCE M2

**Everything in this section applies at 768px and above.** Below it the menu is
replaced by the dashboard — see the divergence section above. The rules here
(identical labels, one screen, no-JS shape, the Reprendre resolution) are all
still live at desktop widths, and the resolver is shared with the dashboard.

Direction: `docs/direction/mcc-direction-esthetique-addendum.md` § E5. The home
page is a 1990s PC-game main menu — club title, a centred vertical stack, a small
**knight** marking the active line. It is CSS plus a roving tabindex; no new
dependency, no island.

### The three tensions, and where each is resolved

| Tension | Resolution |
|---|---|
| **SEO** — six words do not index | The menu owns the first screen; the descriptive content lives BELOW it and carries the markup. `<h1>` stays at the top, the meta description is **set explicitly** rather than falling back to `site.description`, and `#a-propos` is real prose under a real `<h2>`. |
| **Adults** — a parent must understand in five seconds | One descriptive sentence sits directly under the menu, **above the fold**, and a spec measures that it is. |
| **Redundancy with the grouped nav** | Not a defect — games have a main menu *and* shortcuts. |

### ⚠️ THE LABELS ARE THE NAV'S LABELS. NOT COPIES OF THEM.

Every menu entry takes its label from the **same `nav.*` key** the header uses.
There is deliberately no `menu.play` string, and adding one is the exact mistake
the rule exists to prevent: two different names for one destination reads as two
different sites.

`main-menu.spec.ts` does not hard-code the words. It reads the **header's own
labels** off the page and requires the menu's to be a subset — so renaming a nav
item without renaming its menu entry fails there.

A consequence worth knowing: an unscoped `getByRole('link', { name: … })` on the
home page now matches **two** elements and fails Playwright's strict mode. That
collision is the guarantee working. Scope to `.site-nav`; do not rename anything
to make it go away.

### Where the entries point

Two of the six labels are nav **groups**, which are toggles rather than links, so
each is pointed at the destination a reader most wants from it:

| Entry | Target |
|---|---|
| Reprendre | resolved in the browser — see below |
| Jouer | `/jouer/` |
| Apprendre | `/cours/` |
| S'entraîner | `/exercices/` |
| Pièges d'ouverture | `/pieges/` |
| Le club | `/agenda/` — "when does it meet" is asked far more than "how do I write to it", and the agenda links contact |

### "Reprendre" — the resolution rule

The **journey** is built at build time (content) and resolved in the browser
(the reader's own `localStorage`).

Journey order: the 13 tutorial steps by `order`, then every course lesson by
course `order` then lesson `order`. **A lesson with no exercise board is
excluded** — it records nothing in `mcc:progress:v1`, so it can be neither
touched nor completed, and including it would block the scan forever.

- **touched** — any of the step's keys has `solved`, `attempts > 0` or `hintUsed`. Opening a page leaves no trace; reading is not progress.
- **complete** — every one of the step's keys is `solved`.

Then, and this is the part that makes it feel like a game:

1. find the **last** touched step;
2. from there forward, take the first step that is not complete — which is that same step when the reader stopped mid-way through it;
3. if everything after it is complete, fall back to the earliest incomplete step anywhere (one they skipped);
4. if nothing is incomplete, or nothing was ever touched, **render nothing**.

⚠️ **FURTHEST, not earliest.** A game's Continue resumes where you stopped, not
at the first gap you skipped past. Both branches have a spec.

### ⚠️ THE RESOLVER IS SHARED, AND THE JOURNEY IS A PARAMETER (M3)

It used to live inside `HomePage.astro`'s inline script, with a near-copy of
the same rule in `ProgressPage.astro` and a third copy of just the key scheme
in `CoursPage.astro`. Two answers to "where did this reader stop" is one too
many, and the failure is silent — the pages name different lessons and neither
looks broken.

| File | What it owns |
|---|---|
| `src/lib/journey.ts` | The **only** place the `mcc:progress:v1` key scheme is written. Build-time; imports `astro:content`, so no island may touch it |
| `src/components/progress/ResumeResolver.astro` | The rule, the inline script, and the declarative binding |
| `src/components/progress/ResumeCard.astro` | The card `/cours/`, `/exercices/` and `/progres/` show |

**Each call site resolves its own journey, and they may legitimately differ:**

| Page | Journey |
|---|---|
| `/` | tutorial, then lessons — the course sequence |
| `/cours/` | lessons alone |
| `/exercices/` | exercises alone |
| `/progres/` | all three |

So `/progres/` can name a different step from `/` once a reader has touched a
standalone exercise. That is four answers to four questions, not a drift.

⚠️ **`journeys` is a RECORD, one component instance per page.** `/progres/`
needs a table for the whole journey, one per group bar, and one per level and
theme bucket. Five instances would emit five copies of the inline script, four
of them no-ops; one instance resolves every table in a single pass.

⚠️ **A level and a theme are just journeys.** `done / total` over an ordered
set of steps is exactly what the resolver computes, so the by-level and
by-theme breakdowns on `/progres/` are extra tables rather than extra logic.
Their steps carry no `u` or `t` — a statistic has nowhere to send anyone.

⚠️ **The declarative contract has two halves, and collapsing them breaks it.**
`[data-resume-count]` and `[data-resume-fill]` are filled **whether or not
there is a step to resume**; the link, the title and the un-hiding happen
**only when there is one**. That is what lets one contract serve a statistic
("2 sur 13", true and worth showing at zero) and an offer ("Reprendre — La
tour", which must not appear until it is true). `ResumeCard` is `hidden` by
default and stays hidden; a group bar is not and always gets its numbers.

**The home dashboard stays bespoke**, reading `window.MCC_RESUME.home` from a
plain inline script that runs *after* the resolver. It swaps a card's eyebrow,
title, bar, secondary tile and stats line — too specific to describe in
attributes. Document order is the whole of the ordering guarantee; both are
inline and synchronous, so there is no race to lose but there is an order to
keep.

**`tests/e2e/resume.spec.ts` was written BEFORE the extraction**, run green
against the old code and green against the new. It pins CLS, the script's
non-deferred attributes, and both dashboard branches. Its `journeyOf()`
accepts `[data-menu-journey]` *or* `[data-resume-journey]` precisely so that
not one assertion had to move — only the handle did.

⚠️ **The CLS assertion has teeth, and was verified to.** Wrapping the resolver
in `DOMContentLoaded` in a built `dist/index.html` produced **CLS 0.0057** and
failed the test.

### ⚠️ The resolver is `is:inline`, and it duplicates the progress key

Both deliberate, and this is the **third** such duplication on the site after the
theme head script and `AccountButton`.

**Inline**, because it runs synchronously during parsing, before first paint. A
bundled module script is deferred, so "Reprendre" would appear one frame late and
push a vertically-centred menu down under the reader's eyes — a visible jump on
the most-visited page and a CLS regression on the page least able to afford one.
Measured: **CLS 0.000 before and after.**

**Duplicating `mcc:progress:v1`**, because an inline script cannot import a bare
specifier. The general rule in "the single migration point" still stands;
`main-menu.spec.ts` seeds the key directly, so a divergence from
`src/lib/progress.ts` fails there rather than in production. It only ever READS,
and it fails silent — a corrupt store leaves five entries and no error.

### ⚠️ With no JavaScript there are FIVE entries, not six

"Reprendre" is a claim about stored progress, which cannot be read without
JavaScript. Rendering it anyway would either point nowhere useful or assert
something we do not know. The five standing entries are real links and all work.

The roving tabindex is applied **by the script**, never in the server markup —
otherwise a no-JS reader would meet five links marked `tabindex="-1"` that
nothing will ever move focus to. Progressive enhancement means the enhanced state
is the one that is *added*.

### One screen, and how it is held

`min-block-size: calc(100svh - 9rem)` on the menu screen. **`svh`, not `vh`**: on
mobile Safari `vh` is the *largest* viewport, so `100vh` is taller than what is
visible while the address bar shows, and the last entry would sit under it. Every
size is a `clamp()` against viewport height so six entries, a title and a
sentence all clear a short phone. A spec measures every entry's bottom edge
against the viewport at 390×844 **with the sixth entry present**, and asserts
nothing was scrolled to achieve it.

The cursor sits in **reserved space to the left of the label**, and the rows are
left-aligned inside a centred, width-limited list. A centred row would re-centre
itself every time the cursor appeared — the label would twitch sideways on every
arrow press.

### Motion: one Réponse, and nothing else

The cursor is `opacity` + a small `translateX`, both on `--motion-response`. No
new family. Under `prefers-reduced-motion` the cursor **still marks the line** —
it is the menu's only state — it simply arrives without travel.

---

## Design tokens

`src/styles/tokens.css` is the source of record. Direction: **"old chess club"** — a wood-panelled room with a green baize table, brass lamps and yellowing score sheets. Deliberately distinct from the other Labs projects.

| Role | Scale | Notes |
|---|---|---|
| Primary — the baize | `green` 50–950 | `green-700` CTA fill, `green-800` header/footer |
| Page — the paper | `cream` 50–400 | `cream-100` page background |
| Accent — the lamp | `brass` 100–900 | fills + focus rings; **see the brass rule** |
| Panelling | `wood` 200–800 | secondary accent |
| Text — the pencil | `ink` 400–950 | warm-shifted neutrals |

Semantic aliases are `--mcc-*` in `:root`. Board colours are `--mcc-board-light` `#e8dcbe` and `--mcc-board-dark` `#4f7053` — a light square stepped off the page cream toward wood, and the baize lifted until it separates from it (4.1:1) while staying in the same green family.

Type: **Fraunces Variable** (display) + **Inter Variable** (body) + a system mono stack for notation, FEN and PGN. Self-hosted; see "Generated assets".

### Contrast is proved, not eyeballed

`node scripts/check-contrast.mjs` audits every rendered pair against WCAG AA and **exits non-zero on failure**. It is the FIRST step of `npm run build`, so a regression stops the build before anything else is spent.

It parses `tokens.css` and `board-themes.css` rather than keeping its own copy of the hexes, and runs the whole matrix against **both palettes** and **every board preset**. It also asserts that the pairs behind the deep-variant rules still fail — so a rule can never quietly become stale. See "Theming" for the details and for the pre-existing bug it caught.

### Brass contrast rule — global unlayered override (gotcha)

Brass is a mid-tone metallic. It works as a **fill** and as a **focus ring**, and fails as **text** on cream:

```
brass-500 on cream-100 ...  3.12:1  ✗
brass-600 on cream-100 ...  4.45:1  ✗   ← just under; the dangerous one
brass-700 on cream-100 ...  6.50:1  ✓   ← the deep variant
```

So, exactly as Baby Club does with terracotta:

- `.text-brass { color: var(--color-brass-700) }` — brass **as text** renders in the deep variant.
- `.bg-brass-* { color: var(--color-ink-950) }` — brass **fills** carry ink labels, never white.
- Use `--mcc-accent-text` (= `brass-700`) whenever the accent is type.

**Why this bites:** Tailwind v4 emits utilities inside the `utilities` cascade layer, and **unlayered CSS always beats layered CSS regardless of order or specificity**. So on a `.bg-brass-500` element, `text-white` **silently does nothing** — the utility loses to the unlayered rule. Intentional (it enforces AA app-wide without per-component vigilance), but non-obvious.

**Opt out** (rare — prefer the AA-safe default): Tailwind's important modifier, e.g. `text-cream-50!`. Do **not** add a second unlayered `.bg-brass-500` rule.

Level badges follow the same logic: the three level colours are mid-tones, used as fills with `ink-950` labels, never as text.

---

## Themes — FOUR of them, and light/dark lives INSIDE each one (E6+E7)

Direction: `docs/direction/mcc-direction-esthetique-addendum.md` §§ E6, E7.
**Bois, Marbre, Souiri, Terminal.** A theme sets the surfaces, the heading
typeface, the default board preset and the piece set.

### The hierarchy, and why flattening it is the mistake

| Level | Control | Where |
|---|---|---|
| 1 | **Thème** — four moods, four live previews | top of `/parametres/` |
| 2 | **Plateau** — the six presets | inside "Personnaliser" |
| 3 | **Couleurs libres** — the reader's own two squares | same disclosure |

⚠️ **Never present 4 themes × 6 presets as twenty-four equivalent choices.**
Each theme names its own board; a reader who wants a different one asks for it.
Levels 2 and 3 share **one** disclosure — two collapsed panels side by side is
two decisions again, which is the thing the hierarchy exists to prevent.

**Light/dark is not a fourth axis.** Every theme declares both palettes ("Bois
de jour", "Bois de nuit") and the existing toggle now switches within the
active theme. Eight combinations ship; all eight are audited.

### ⚠️ BOIS IS THE BASE, AND ITS VALUES STAY IN `tokens.css`

The palette this site has always had *is* Bois. It did not move into
`site-themes.css` with the other three, for two reasons about failure modes:

- a reader with no stored preference, **or with no JavaScript**, gets a
  complete theme from the base tokens alone — no class, no cascade, no gap;
- the other three override it, so anything a theme forgets to restate falls
  back to something coherent rather than to nothing.

Consequence: **a token added to `:root` is a token every other theme may need
to override.** The auditor catches the omission; nothing else will.

In practice each theme restates all 34 surface/text/border/accent/level/
selection/ambient tokens, in both modes. Four are deliberately left inherited
everywhere — `--mcc-board-last-move`, `-selected`, `-check`, `-hint` — because
they are alpha washes chosen to read over **any** preset's squares, which is a
property of the overlay rather than of the theme. The square colours themselves
are absent for the opposite reason: they belong to the `.board-<id>` preset,
which is level 2 and outranks the theme.

### ⚠️ The cascade is `:is(:root, .theme-preview)`, and the `:not()` is load-bearing

Writing S for `:is(:root, .theme-preview)`:

```css
S.theme-X:not([data-theme='dark'])   /* X, light  (0,3,0) */
S.theme-X[data-theme='dark']         /* X, dark   (0,3,0) */
S.theme-X                            /* X, either (0,2,0) */
```

`site-themes.css` is imported **after** `tokens.css`, so a bare
`:root.theme-marbre` (0,2,0) would tie with `:root[data-theme='dark']` (0,2,0)
and win on source order — painting Marbre's **light** values over Bois's dark
ones. A dark-mode reader on Marbre would get white text on a white page. The
`:not()` lifts both mode blocks to (0,3,0) and makes them mutually exclusive,
so neither can be decided by source order.

`:is(:root, .theme-preview)` rather than `:root` alone is what lets
`/parametres/` paint a theme it is not wearing: a tile is
`<div class="theme-preview theme-souiri">` and gets the real tokens. `:is()`
takes the specificity of its most specific argument, and both arguments are
(0,1,0), so the arithmetic above is unchanged — which is why it is `:is()` and
not a selector list. The base dark block never competes on a preview element at
all, because `:root[data-theme='dark']` cannot match a div.

### ⚠️ `boardTheme` IS OPTIONAL, AND ABSENCE IS A REAL STATE

Absent ⇒ **follow the theme**. Present ⇒ the reader **pinned** a preset.

**A pin survives a theme change.** Decided this session, and it is the answer
to "does deviating to another preset survive?" — yes. Level 2 exists for a
player with a board preference *independent of the site's mood*; resetting it
whenever they try a theme would destroy the only preference that level is for,
silently. `followThemeBoard()` and the "Suivre le thème" option are the escape
hatch, named and offered first in the list.

A non-optional field plus a `pinned` boolean would let the two contradict each
other. Absence carries the meaning instead.

**The v1 migration is a no-op by construction.** The key stays `mcc:theme:v1`
because the *shape* is unchanged — a field was added, a field became optional —
so nothing stored under v1 is reinterpreted. Every pre-E6 record has a
`boardTheme`, so every returning reader is pinned to exactly the board they
last saw, on Bois, which is the palette that record was written under.

⚠️ That pins readers who never actively chose a preset (everyone who touched
the page at all had `classique` persisted by the old non-optional default).
Accepted deliberately: the alternative is changing what a returning reader sees
without being asked, and "no loss" beats "probably what they'd have wanted".

### Piece sets — one stylesheet each, fetched on board pages only

`vendor/pieces/<set>/*.svg` → `scripts/build-pieces.mjs` → `public/pieces/<set>.css`.

⚠️ **`chessground.cburnett.css` is no longer imported by `BoardSurface.tsx`.**
Four sets in the island chunk measured ~110 KB raw / ~32 KB brotli, of which a
reader uses one. Split, they cost 2.3–12 KB brotli each. `BoardSurface` is
still the only file importing Chessground; the pieces simply stopped being
Chessground's business and became the theme's.

- The head script injects `<link rel="stylesheet" href="/pieces/<set>.css">`
  **only when `<html data-board>` is present**, which BaseLayout's `board` prop
  sets. Appended during head parsing, so it blocks render exactly as a static
  stylesheet does and the pieces paint *with* the board. Injecting from the
  island's mount effect would show empty squares first — worse than a theme
  flash, because it reads as the position having failed to load.
- ⚠️ **A board page that forgets `board` renders squares with no pieces, and
  nothing errors.** `themes.spec.ts` walks every board route and asserts it.
  `LessonPage` computes it (`pairs.some(p => p.board)`) because a lesson may be
  pure prose.
- ⚠️ **Percent-encoded data URIs, not base64.** Base64 inflates by a third AND
  destroys the repetition brotli feeds on, since twelve pieces share most of
  their markup. Measured on merida: 46.0 KB raw / 13.6 KB brotli base64 against
  36.7 KB / 6.7 KB percent-encoded.
- `/pieces/preview.css` is four knights, for the settings tiles. Loading four
  full sets there would be ~32 KB brotli to draw four glyphs.

### ⚠️ MOST LICHESS PIECE SETS ARE UNUSABLE HERE — check before adding one

The repo is **GPL-3.0-or-later**, which forbids added restrictions. Verified
against `lila/COPYING.md` and, where linked, the upstream licence:

| Shipped | Theme | Author | Licence |
|---|---|---|---|
| `merida` | Bois | Armando Hernandez Marroquin | GPLv2+ |
| `kiwen-suwi` | Marbre | neverRare | CC BY 4.0 |
| `chessnut` | Souiri | Alexis Luengas | Apache-2.0 |
| `cburnett` | Terminal | Colin M.L. Burnett | GPLv2+ (also CC BY-SA 3.0 on Wikimedia) |

**Rejected:** every `CC BY-NC-SA` set (the majority), "freeware" (`chess7`,
`companion`, `leipzig`), unlicensed (`reillycraig`, `riohacha`), no-derivatives
(`shahi-ivory-brown`), and **`alpha`** — named in the E6 brief, but "free for
personal non commercial use". Also declined: the **AGPLv3+** sets (`letter`,
`pirouetti`, `pixel`). Not a conflict, but §13 adds an obligation the repo does
not carry, and accepting it is a project-level decision. `pixel` would have
suited Terminal; it is left on the table rather than quietly adopted.

Apache-2.0 is compatible with GPLv3 but **not** GPLv2 — which is why the repo
being GPL-3.0-**or-later** matters here rather than being a formality.

⚠️ `mono` ships **six** SVGs (one shape per role, coloured in CSS), not twelve.
`build-pieces.mjs` fails loudly on that shape rather than emitting half a set.

Every set needs its own entry in `site.legal.attributions`. For three of the
four, attribution is a **condition of use**, not a courtesy.

### ⚠️ A PIECE SET IS ONLY LEGIBLE ON SOME BOARDS — and it is now audited

The first draft of Terminal shipped `kiwen-suwi` on `phosphore` and **lost half
the position**. That set is MONOCHROME — both sides are one flat `#262626`,
distinguished by shape — so against phosphore's `#082a16` dark square it
measures **1.03:1**. Nothing errored, no declared colour was wrong, and every
contrast assertion passed. It was found by looking at a screenshot.

`check-contrast.mjs` now audits **each theme's piece set against the board that
theme uses**. The inks are declared in `src/config/piece-sets.ts` (`body` +
`outline`, read off the SVGs by hand) — a copy, deliberately, because parsing
arbitrary SVG fills fails OPEN: an auditor that quietly finds no colours reports
success.

⚠️ **The rule is "at least one ink clears 3:1", not "the piece contrasts".** A
white piece on a light square is always low-contrast — that is true of every
chess set ever made — and it is the OUTLINE that separates it. A monochrome set
has one ink and no second chance, which is precisely what makes it unsafe on a
dark board and fine on a pale one.

Consequence: **`cburnett` is not interchangeable on Terminal.** It is the only
shipped set whose black pieces carry a light outline (`#ececec`, 13.14:1 on that
square). Verified to fail with the message *"MONOCHROME set, no outline to fall
back on"* if the old assignment is restored.

### ⚠️ `background-size` CYCLES — it broke Souiri's board into a 2×2 checker

The theme texture was stacked as a second `background-image` layer on
`cg-board`, with `background-size: auto, 25% 25%`. That is correct for a
one-gradient texture and silently wrong for a two-gradient one: with three
layers and two sizes the list cycles, the checker lands on `auto`, and the
board renders as **one giant 2×2 checker** instead of 8×8.

Souiri's texture is two gradients. The real board was broken, not only the
preview — and it survived a screenshot review, because a giant checker still
reads as "a chessboard" until you count the squares.

The texture is now a `cg-board::before` layer. That decouples it from the
checker entirely (a theme may use as many gradients as it likes) and paints
below the squares and pieces, so the wash never tints a piece.

**The general lesson: never rely on positional `background-*` lists when one of
the layers comes from a variable a theme controls.** The count is not yours.

### The sixth board preset

`phosphore` — phosphor green on black — exists because Terminal had no honest
default among the five. Both squares are dark, so it carries the tightest
separation on the site (3.81:1 against a 3.0 floor). **Do not darken the light
square to make it "more terminal".**

### ⚠️ The contrast matrix is now 275 assertions, and that growth is the point

4 themes × 2 modes × 27 pairs, plus 6 presets × (separation + 8 theme pages).
Up from 67. Seven of the eight theme/mode combinations are ones nobody on this
project uses day to day, and an eyeball does not scale to that.

- The auditor **discovers themes by parsing the CSS**, so adding one audits it.
- It resolves each theme through the **same merge order as the cascade**
  (`:root` → base dark → theme common → theme mode). Getting that order wrong
  would prove a palette the site never paints, which is worse than not auditing.
- The board-edge check runs each preset against **all eight pages**: a preset is
  independent of the theme, so a pinned `glace` must still read on Terminal.
- Default output is one line per combination; `--verbose` prints the table.
- **A failing combination is fixed or dropped, never excepted.** Terminal's
  light page moved from `#e8eee8` to `#f1f6f1` because `glace` measured a 3.08
  edge against it — passing, and the tightest ratio on the site. The fix was to
  remove the outlier, not to grant it one.

### `.text-brass` now resolves `--mcc-accent-text`

It used to name `brass-700`, with a second rule flipping to `brass-300` in
dark. Two hardcoded steps become **eight** with four themes, and seven would be
wrong the day a page colour moved. `--mcc-accent-text` already means "the
accent, at whichever step clears AA against *this* surface", every theme
declares it, and MUST_PASS proves it in all eight. The unlayered-beats-layered
mechanism is unchanged and still the point.

`::selection` and the level fills became themed tokens for the same reason — a
brass selection was a visible foreign object on a phosphor page.

---

## Typography follows the theme — HEADINGS ONLY (E7)

| Theme | Heading face |
|---|---|
| Bois | Fraunces (warm old-style serif) |
| Marbre | Playfair Display (high-contrast classical) |
| Souiri | Outfit (open, geometric — echoes zellige construction) |
| Terminal | JetBrains Mono (readable, not a pixel face) |

⚠️ **THE BODY FACE NEVER CHANGES.** That is the E7 safety rule and it is
tested: a spec collects the computed body family in all four themes and asserts
there is exactly one. Rhythm may vary; family may not. A beginner learning the
en-passant rule must not have to fight the page.

### ⚠️ A theme loads only its own heading font — and the preload is the trap

Declaring four `@font-face` families costs nothing: a browser fetches a font
file only when something rendered actually uses that family, and each theme
sets `--mcc-font-display` to one.

**A `<link rel="preload">` fetches unconditionally** — that is what preload
means. So the heading preload is **injected by the head script for the active
theme**. The static Fraunces preload that used to sit in `BaseLayout` would now
make three themes out of four download two faces and use one. Inter stays a
static preload: every theme uses it.

⚠️ `--mcc-font-display`, never `--font-display`. The raw `--font-*` entries are
the palette of faces and do not follow the theme — same trap as a component
reading `--color-wood-600` and staying light-mode-only.

Upstream fontsource filenames are the **package** name
(`playfair-display-latin-…`); we serve short names (`/fonts/playfair-latin-…`).
`build-fonts.mjs` derives the source stem from `pkg` so a rename fails loudly at
generation time instead of leaving a stale literal.

### Reading craft — `src/styles/typography.css`

65ch measure, 1.7 leading, subheads with more space above than below, a drop cap
on the **first** prose chunk only, small caps for mentions, French guillemets
with U+202F, and notation set as a badge.

- The drop cap is `::first-letter` on real text — a screen reader reads the word
  normally. **Never split the letter into its own element**: that turns "Une
  pièce" into "U" + "ne pièce" for anyone listening. It disappears below 26rem,
  where it would sit beside two words.
- `.prose` rules moved **out of `LessonPage`'s scoped `<style>`**. Astro scoped
  rules carry `[data-astro-cid-…]` and beat any global rule of the same class
  specificity, so shared styles could only lose to them. `.prose` is used by the
  privacy notice too; there is one definition now.
- ⚠️ **Old-style figures are declared and currently INERT.** Inter ships no
  `onum`. Kept because it is harmless, correct the moment a face that has them
  is used, and documents intent. A spec **reports** whether it took effect
  (rather than asserting) so this note cannot quietly become false.

### ⚠️ `--font-mono` HAS NEVER EXISTED — and it silently killed lesson notation

`LessonPage`'s `<code>` rule read `var(--font-mono)`. An unknown custom property
invalidates the whole `font-family` declaration at computed-value time, so
**every inline notation in every lesson rendered in Inter**, from the commit
that introduced lessons until this session. No warning, no error.

Third occurrence of this exact class (`--mcc-border`, `--font-mono`). The token
is `--font-notation`. The spec asserts the **resolved** family, never that a
rule exists — asserting the rule would have passed throughout the bug.

---

## ⚠️ An `is:inline` script ships VERBATIM, comments and all

Astro does not process `is:inline` — that is the whole point of it. Written the
way the rest of this codebase is commented, the theme head script measured
**8.4 KB per page across 84 documents**, before the first paint it is blocking.

The rationale now lives in **BaseLayout's frontmatter**, which is compiled away;
the script keeps short pointers back to it. 8.4 KB → 5.7 KB, and 251 KiB off the
precache. Anything added to that script follows the same rule.

The *data* it needs is not duplicated at all: `MCC_THEMES` is serialised in from
`@config/site-themes` by `define:vars`, so which board and which pieces each
theme defaults to cannot drift even in principle. **Only the logic is
duplicated, and only because it must be.**

---

## Theming — the layers, one source of truth each

`/parametres/` (+ `/en/parametres/`). Everything is device-local, in `localStorage`, under the same rules as progress.

| Layer | What | Where the values live |
|---|---|---|
| 0 | **Four site themes** (E6) | `.theme-<id>` in `site-themes.css`; Bois is the base in `tokens.css` |
| 1 | Light / dark / system, **within** the active theme | `[data-theme='dark']` blocks in `tokens.css` and `site-themes.css` |
| 2 | Six board presets | `.board-<id>` in `board-themes.css` |
| 3 | The reader's own two square colours | inline properties on `<html>` |

Each layer overrides the one above it by ordinary cascade — theme class beats `:root`, board class beats the theme's board defaults, inline beats class. There is no `!important` anywhere, but layer 0 **does** need the specificity arithmetic set out in the E6 section above; it is the one place where a tie would be decided by source order.

### `src/lib/theme.ts` is the single migration point

`mcc:theme:v1`, version in the key, guarded access, normalised field by field on read, silent on failure — the same file-for-file conventions as `src/lib/progress.ts`, for the same reasons. **Nothing else may touch `localStorage` or know the key.**

A malformed record falls back to the defaults rather than to a half-applied theme: a custom pair with one valid colour is not a board, so it is discarded whole.

### ⚠️ The head script duplicates `applyTheme()`, deliberately

`BaseLayout.astro` carries an `is:inline` script that reads the stored theme and sets `data-theme`, the board class and any custom properties **before first paint**. It cannot import `src/lib/theme.ts` — that would reintroduce the module fetch it exists to avoid, and a dark-mode reader would get a white flash on every navigation.

So the two must be kept in step by hand. `tests/e2e/theme.spec.ts` has a **no-flash test** that records the attribute at the moment `<body>` first appears; if the script is ever moved out of the head, made a module, or made async, that is what fails.

The script also adds `js` to `<html>`, which is how the header toggle is revealed without a frame of visible-but-inert button, and re-applies on `astro:after-swap` so the theme cannot silently break on the commit that adds view transitions.

### System mode is resolved in JS, so `data-theme` is always concrete

`data-theme` only ever holds `light` or `dark` — `system` is resolved before it is written, and a `matchMedia` listener re-resolves it live. That keeps ONE dark block instead of the same thirty declarations duplicated into a `prefers-color-scheme` media query, which is the kind of duplication that drifts.

**The trade: theming needs JavaScript.** Without it the site renders light and is fully usable; the toggle simply never appears. That is a deliberate choice, not an oversight — a no-JS dark mode costs a second copy of the whole palette.

### Only the `--mcc-*` layer flips

The raw `--color-*` scales are the palette and never change. **A component that reaches past the semantic layer for a raw scale step will not follow the theme** — that is exactly why `--mcc-danger-text`, `--mcc-accent-strong` and `--mcc-border-on-inverse` were added: each one replaced a hardcoded `var(--color-wood-600)` or similar that would have stayed light-mode-only at night.

Fills are the exception and are correct as-is: a brass or wood fill is the same colour at night, so its ink label is too. That is why the unlayered `.bg-*` rules have no dark variant — but `.text-brass` does, because brass-700 was chosen to be readable on *cream* and is nearly invisible on a green-black page (2.5:1). The rule is "brass as text takes whichever step clears AA against the surface"; the surface changed.

### Custom colours are board-only. DECIDED, v1.

Two pickers: light square and dark square. **Site-wide custom colours are not offered and are not planned.** A reader choosing their own page and text colours would have to be validated pair by pair across every surface the site has, in both modes — and the failure mode is an unreadable site rather than an unusual board. The board is bounded: two colours, two derived inks, one thing to check.

Coordinate inks are **derived, never chosen**: `bestInkFor()` picks whichever of the two inks clears the higher ratio against each square, exactly as the presets do explicitly. The settings page shows the resulting ratio live and warns below AA — and **lets the reader proceed**. It is their board; an unreadable one should be a choice rather than an accident, so the warning stays visible while the colours are in use.

### The contrast audit parses the real CSS

`scripts/check-contrast.mjs` no longer keeps its own copy of the palette. It reads `tokens.css` and `board-themes.css`, resolves the `var()` chains, and runs the full pair matrix against **both** palettes plus every board preset. Add a preset to the CSS and it is audited on the next build; there is no list to remember to update.

It runs as the **first** step of `npm run build`, so a contrast regression fails the build before anything else is spent.

Two things it does that are worth keeping:

- It reads **all** blocks for a selector, not the first. `:root` is declared several times in `tokens.css`, as the cascade allows; reading only the first reported `--mcc-danger-text` as unresolved.
- The colour maths is a **second, independent implementation** of the one in `theme.ts`. An auditor sharing its formula with the code it audits would agree with its own bugs.

Its first run in this shape found a **real pre-existing bug**: the `ink-950` label on an "avancé" level badge sat at 4.39:1, under AA, because the old script checked the brass fills but never the level fills. `--color-wood-400` was lightened to fix it.

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

### Schema and RLS

`supabase/migrations/`, numbered, **never edited after merge** — a fix is 0002.

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

## Animation policy (Session 6)

Every duration on the site is a constant in **`src/lib/motion.ts`**, and nothing
else may invent one. The numbers only mean anything relative to each other, so
scattering them is how they drift apart.

| Constant | Value | What it paces |
|---|---|---|
| `BOARD_ANIMATION_MS` | 250ms | a move played on a board — exercise, play |
| `REPLAY_ANIMATION_MS` | 200ms | a step through a replay |
| `THINK_FLOOR_MIN_MS` / `MAX` | 500–800ms | the opponent's apparent thinking time |
| `REDUCED_MOTION_FLOOR_MS` | 150ms | the floor under `prefers-reduced-motion` |

### Gameplay vs navigation — why two board durations

A move **played** is an event: something happened and the reader must see which
piece went where. A **step** through a replay is navigation — the reader is
scrubbing a game they are reading, and every extra millisecond is latency between
them and the next position. Jumping (Home/End, clicking a move) animates not at
all; that is the existing `instant` prop.

They are close together because they are the same gesture at different intents,
not because the difference is a rounding error.

### ⚠️ The thinking delay is a FLOOR, not a fixed wait

`thinkingFloorMs()` is the **minimum** time before the engine's move appears. If
the search takes longer — and at Avancé it legitimately will — nothing is added
on top. The floor exists because Stockfish is usually far *faster* than a human
reads: at Débutant (depth 2) a reply returns in single-digit milliseconds, and a
move landing in the same frame as your own reads as a glitch, not an opponent.

Implemented in `PlayView.opponentMove()` as: stamp the time, take a floor, run
the search, then wait out whatever remains. **The `generation` check runs again
after that wait** — the floor introduces a second `await`, so a new game, a
resign or an unmount during it could otherwise drop the previous game's move onto
the new board. That is the same class of bug `generation` already existed for,
reachable through a new door.

`ExerciseView` draws from the same range for its scripted `opponentReplies`, so a
student cannot feel which page has a real engine behind it. There the reply is
known at build time, so the floor *is* the whole delay.

**The test asserts a lower bound only.** An upper bound would turn "the engine
thought hard about a sharp position" into a failing test.

### `prefers-reduced-motion` reduces motion, not pacing

Board moves become instant and all ambient motion stops. The opponent delay drops
to **150ms rather than 0** — a reader on a screen reader has their own move
announced and then the opponent's, and collapsing the gap makes the two
announcements overlap so the reply is heard as part of their own move. Reduced
motion means "do not animate", not "do not pace".

The preference is read **at call time, never cached**: it can change mid-session,
and `BoardSurface` re-reads it on every update as well as at mount, which is what
lets a spec emulate it after the island has already mounted.

### ⚠️ Scroll reveals break axe unless the page is settled first

Found in v2-S1, caused by Session 6. A `[data-reveal]` element sits at
`opacity: 0` until the observer sees it, so **every card below the fold is fully
transparent text that axe can still find** — and it reports `color-contrast` for
each one. On `/exercices/` under Firefox that was `color-contrast (19×)`.

It presents as **flakiness, not breakage**, because it depends on viewport
height (worse on the phone projects, where more cards start below the fold) and
on transition timing. It flaked on iPhone 13 for two matrix runs before a serial
Firefox run finally failed hard enough to show the real violation — which is why
"a flaky axe test" on an index page should be investigated rather than retried.

**Every axe check on a reveal-bearing page must call `settleReveals(page)`**
(`tests/e2e/helpers/reveal.ts`) first. That is not weakening the assertion: a
card nobody has scrolled to is a card nobody is reading, and the helper measures
the page in the state a reader actually experiences.

### Where ambient motion is allowed

- **Yes:** home hero (drifting silhouettes + scroll parallax), and section
  reveals on home and the four index pages.
- **No:** board detail pages — `/pieges/[slug]/`, `/exercices/[slug]/`, `/jouer/`.
  The board is the content there; fading it in delays the one thing the reader
  came for. `tests/e2e/motion.spec.ts` asserts those three carry neither.

Reveals are **opt-in per page** via BaseLayout's `reveals` prop, and the CSS gate
is `html.js body[data-reveals] [data-reveal]` — three conditions, all of which
must hold before anything is transparent. Miss any one and content renders
normally. **The failure mode of a decorative effect must never be an invisible
page.**

### ⚠️ GSAP was evaluated and REJECTED — do not add it

The Session 6 brief called for GSAP. It is not here, and the reason is not taste:

> `npm view gsap license` → **"Standard 'no charge' license"** — GreenSock's own
> licence, not an OSI one.

This project is **GPL-3.0-or-later** (forced by Chessground). The GPL forbids
adding restrictions beyond its own, and GSAP's licence restricts redistribution
and fields of use. Bundling it would make the combined work undistributable under
the licence the repo claims, contradict the dependency table on
`/mentions-legales/`, and undercut the README's invitation to take this engine and
run your own club with it.

The visual result was the requirement, so it is delivered in **CSS + ~20 lines of
vanilla JS**: keyframe drift, `animation-timeline: scroll()` parallax behind
`@supports`, and an IntersectionObserver for reveals. Cost **≈1.3 KB gzip** and
zero new requests, against ~36 KB gzip for GSAP core + ScrollTrigger.

If a future session genuinely needs a timeline library, it must clear the licence
question first. A permissive one (MIT/BSD) is fine; GSAP is not.

### The ambient layer has an opacity ceiling

`--mcc-ambient` / `--mcc-ambient-opacity` in `tokens.css`, per palette:
green-800 at **0.055** (light), brass-300 at **0.07** (dark).

`check-contrast.mjs` **cannot see this** — it audits token pairs, not decorative
SVG sitting behind text. Computed by hand, worst case being text over a fully
covered silhouette:

| | clean | over a silhouette |
|---|---|---|
| light `h1` | 17.06 | 15.45 |
| light lede | 5.13 | **4.65** |
| dark `h1` | 17.50 | 15.40 |
| dark lede | 7.79 | 6.85 |

**The light lede is the constraint, and it drops below AA at ambient opacity
~0.075.** We ship 0.055. If anyone raises it "just a little", that is the number
that breaks, and no automated check will catch it — re-run the arithmetic.

---

## PWA

- **Manifest** is an endpoint (`src/pages/manifest.webmanifest.ts`) generated from `src/config/site.ts`, not a static file, so the club name and theme colours cannot drift from the config and tokens they came from. Astro prerenders it to a plain static file.
- **Icons** are generated from one source mark — see "Generated assets".
- **Service worker** is generated by Workbox in `scripts/build-sw.mjs`, which runs **after** `astro build` (it fingerprints the real `dist/`; running it first would precache the previous build's hashes).

### Service worker — Stockfish is NEVER precached

The engine is a multi-megabyte WASM bundle that only the play-the-computer feature needs, so it is **lazy-loaded on demand**. Precaching it would make every first visit — including a phone on Essaouira mobile data that only ever reads one lesson — pay for it up front.

`globIgnores` in `scripts/build-sw.mjs` excludes `**/stockfish*` and `**/*.wasm`, and a runtime `CacheFirst` rule (`mcc-engine`) caches them after the first game instead — so the first game costs 3.6 MB because it must, and every game and visit after it costs nothing.

⚠️ **The test that guards this had to get sharper when the engine landed.** "The word *stockfish* does not appear in `sw.js`" was true only while the engine did not exist; the runtime rule legitimately names `/engine/stockfish...` in `registerRoute`. `tests/e2e/pwa.spec.ts` now parses the array out of `precacheAndRoute([...])` and asserts against **that**, plus a second test that the runtime rule exists at all. Note Workbox emits `precacheAndRoute([...],{})` — with a second argument, so the array does not close with `])`.

`skipWaiting` / `clientsClaim` are on. That is safe here because this is a multi-page app: every navigation is a full document load, so a worker taking over mid-session cannot leave a half-updated SPA shell talking to newly-hashed chunks.

---

## Generated assets

Several scripts produce committed artefacts. **None of them run as part of `npm run build`** — they are run by hand when their input changes, and their outputs are versioned, so the CI build needs no image toolchain and no extra step.

| Script | Produces | Re-run when |
|---|---|---|
| `scripts/build-icons.mjs` | `public/icons/*` | the brand mark changes |
| `scripts/build-fonts.mjs` | `public/fonts/*`, `src/styles/fonts.css` | the families or subset list change |
| `scripts/build-pieces.mjs` | `public/pieces/*.css` | a piece set is added or re-vendored |
| `scripts/build-engine.mjs` | `public/engine/*` (3.6 MB) | the Stockfish version changes |
| `scripts/build-sw.mjs` | `dist/sw.js` | **automatic** — part of `npm run build` |

`stockfish` is deliberately **not** a project dependency — the engine is vendored. Install it transiently first: `npm install --no-save stockfish@11.0.0`, then run the script. That keeps an 8.8 MB package out of every CI install while the 3.6 MB we actually ship stays versioned like every other artefact.

### ⚠️ `public/engine` must stay OUT of the TypeScript project

`tsconfig.json` excludes it, and that is not tidiness. `astro check` type-checks everything in the project, and Stockfish's 2.28 MB of minified glue takes the TypeScript program past the V8 heap limit: the build dies **two and a half minutes in** with `FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory`, naming no file. `public/sw.js` is excluded for the same reason. Anything else vendored into `public/` needs the same treatment.

### Why the fonts are copied instead of imported

`@import '@fontsource-variable/inter/index.css'` **does not work here.** Vite resolves CSS `@import` before rewriting `url()` references and does not rebase them for CSS pulled out of a package: the build emits `@font-face` rules pointing at `./files/...woff2` relative to `/_astro/`, copies no woff2 into `dist/`, and **warns rather than fails**. The site then silently falls back to Georgia and system-ui — the typography is simply gone and nothing is red.

It is also wasteful: `index.css` declares every subset the family ships (Inter carries Cyrillic, Greek and Vietnamese), all of which would land in `dist/` and get swept into the **precache**, which is not lazy.

So `scripts/build-fonts.mjs` copies exactly the `latin` and `latin-ext` woff2 files into `public/fonts/` and generates `src/styles/fonts.css` with absolute `/fonts/...` URLs. Four files instead of fourteen. The two latin files are `<link rel="preload">`ed in `BaseLayout.astro`; the latin-ext pair deliberately is not, being the rare-glyph fallback.

---

## Deployment — Cloudflare Workers static assets

The site deploys as a **Workers static-assets** project. There is no Worker script,
no adapter and no server-side code: `dist/` is uploaded and served directly.

| | |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Output directory | `dist/` |
| Config | `wrangler.jsonc` at the repo root |
| Build variables | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` (public by design), optional `PUBLIC_UMAMI_WEBSITE_ID` — set in the Cloudflare dashboard. **Never** `SUPABASE_SERVICE_ROLE_KEY`. |

`wrangler.jsonc` declares `name`, `compatibility_date` and an `assets` block, and
**nothing else**. There is deliberately no `main`: a Worker with `assets` and no
entry script is served entirely by the assets runtime.

### ⚠️ The config file exists to stop wrangler helping

**With no config present, wrangler detects an Astro project and runs
`astro add cloudflare`** — installing the `@astrojs/cloudflare` adapter on the fly.
That adapter is incompatible with Astro 7 and is the wrong shape for a static site
regardless, so the CI build fails, and it fails during *deploy* rather than during
*build*, which is where nobody is looking.

`wrangler.jsonc` is what prevents it. **Deleting or emptying it reintroduces the
trap.** If a future session sees a deploy failure mentioning the Cloudflare adapter,
check that this file still exists before debugging anything else.

### `wrangler` stays out of `package.json`

It is invoked through `npx` and is **not** a dependency. Session 1 removed it
precisely to drop its transitive advisories (`undici` via `miniflare`), and a static
site needs it only at deploy time — CI installs it on demand. Adding it back to
`devDependencies` to "make the deploy reproducible" trades a real advisory tree for
a convenience nobody needs; pin a version in the deploy command instead if pinning
is ever wanted.

For the same reason `wrangler.jsonc` carries no `$schema` key: the conventional
value points into `node_modules/wrangler/`, which does not exist here.

### The production domain — `mogadorchess.nachi3dlabs.com`

A subdomain of the Labs domain, which is **already a zone on the Cloudflare
account**, so there was no registrar step and nothing to wait for. `.ma` needs a
Moroccan registrar and possibly paperwork; it remains a separate later option
and blocks nothing.

**The hostname exists in three files and cannot be imported into any of them
from the others:**

| File | Field | What it feeds |
|---|---|---|
| `src/config/site.ts` | `url` | **canonical, every `hreflang` alternate, `og:url`** — via BaseLayout |
| `astro.config.mjs` | `site` | `Astro.site`, and anything built on it |
| `wrangler.jsonc` | `routes[0].pattern` | which hostname the Worker answers on |

⚠️ **Two of those are one fact in two files, and nothing local has ever compared
them.** A mismatch produces a site that works perfectly while telling Google and
every share preview to use a hostname that may not resolve — no error, no
visible symptom. `npm run smoke:prod` compares them **before it touches the
network**, so that half is caught without a deploy.

⚠️ **`routes` carries `custom_domain: true`, and that word is doing the work.**
A bare `routes` pattern attaches a Worker to a hostname that must ALREADY
resolve through Cloudflare; `custom_domain` makes wrangler create the DNS record
and issue the certificate. Without it the deploy succeeds and the hostname
522s, because nothing ever pointed at it.

⚠️ **ADDING A DOMAIN MUST NOT ADD A `main`.** A Worker with `assets` and no
entry script is served entirely by the assets runtime. The whole reason
`wrangler.jsonc` exists is to stop wrangler helping (see above); adding `main`
turns this into a script deployment and changes what is served.

#### What Seàn does in the Cloudflare dashboard

Only one thing is genuinely manual, and only once:

1. **Workers & Pages → `mogador-chess-club-website` → Settings → Domains &
   Routes → Add → Custom domain**, enter `mogadorchess.nachi3dlabs.com`, save.
   Cloudflare creates the DNS record and issues the certificate itself —
   there is no DNS record to add by hand, and adding a CNAME manually is the
   common way to get this wrong.
2. Wait for the certificate (usually a minute or two; the row says *Active*).
3. `npm run smoke:prod` — it fails loudly and specifically until step 2 lands.

`npx wrangler deploy` will also provision it from `wrangler.jsonc`, so the
dashboard step is belt-and-braces for the first deploy rather than a
prerequisite for every one. **Whoever does it, the config file stays the source
of truth** — a domain attached only in the dashboard is a domain the next
`wrangler deploy` knows nothing about.

⚠️ **`PUBLIC_AUTH_ENABLED` stays unset.** Accounts are off (v0.3.0) and a domain
does not change that.

### Production smoke — `npm run smoke:prod`

```sh
npm run smoke:prod                              # the configured origin
npm run smoke:prod -- --url https://staging...  # anywhere else
```

**This is the one check the local gate structurally cannot do.** Everything else
tests a build on disk served by `astro preview` on localhost, which is right —
and leaves a whole class of failure invisible until a reader meets it: the
Worker deployed but the domain never attached; `site.url` naming a host that is
not the one answering; `sw.js` or the generated manifest not reachable at its
URL, so the PWA quietly stops being installable.

It asserts, per route: HTTP 200, the right `lang`, a structural sentinel, the
**GPL source link in the footer** (Critical Feature 8), canonical and `og:url`
agreeing with the origin the page was built for, and **no third-party
subresource**. Plus the manifest parses and has icons, and `sw.js` is the
generated worker with **no engine in its precache**.

⚠️ **Sentinels are structural, never prose.** Every one is a `data-testid` or a
component class the Playwright suite already relies on. Pinning a sentence would
make this fail on a typo fix, which is the tax that gets a check switched off.

⚠️ **`<a href>` IS NOT A SUBRESOURCE.** The site links out on purpose — the GPL
text, Chessground, Wikimedia, Instagram, `wa.me`, nachi3dlabs.com. The rule is
"no third-party REQUEST without an explicit click", so only fetching tags count,
and a `<link>` only counts for fetching `rel` values. The first version flagged
the site's own `canonical` and `hreflang` links as third-party on all twelve
pages — wrong, and backwards, since those pointing at production is what the
canonical check wants to see.

⚠️ **It is NOT part of `npm run build` and must not become part of it.** It needs
the network and a deployed site; wiring it in would make every local build
depend on production being up.

### `not_found_handling` tracks whether a 404 page exists

Currently `"none"` — **there is no `src/pages/404.astro`**. When one lands, change
this to `"404-page"` in the same commit, or a bad URL will keep returning a bare
response while a perfectly good 404 page sits unused in `dist/`.

### Verifying a config change without deploying

```sh
npx wrangler deploy --dry-run
```

Parses the config, walks `dist/` and exits without uploading. Expect `No bindings
found` and a sub-kilobyte upload total — that figure is the assets-only Worker stub,
not the site. Note its file count includes **directory entries**, so it reads higher
than `find dist -type f | wc -l` (91 vs 62 at v0.1.0); that gap is normal and not a
sign of a stale build.

### The fix must reach `main` before the next production deploy

Production deploys run from `main`. A deploy from a `main` that predates
`wrangler.jsonc` will hit the auto-config trap again regardless of what `dev` holds.

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

### Manual testing — `npm run demo`, and nothing else

```sh
npm run demo              # build + serve the production build on localhost
npm run demo -- --host    # also expose it on the LAN, for a real phone
```

**This is THE way to test by hand.** Do not hand-run `npm run build && npm run preview` any more — `scripts/demo.mjs` does that plus the three things people forget:

1. **Clears ports 4321–4325 first.** The stale-server trap below is the whole reason it exists.
2. **Stops dead if the build fails**, and says so — nothing is served, so you cannot accidentally test the previous build.
3. **Prints the branch, the last commit, the URL, and the path to the checklist**, so a testing session starts from facts rather than assumptions.

It warns (in yellow) but does **not** block when you are off `dev` — testing a feature branch is the normal case; not knowing which one is the problem.

The checklist it points at is **`docs/MANUAL-TESTS.md`**, and that file is a living document: **any session that changes something a visitor can see must update it in the same commit, alongside `CHANGELOG.md`.** A checklist that lags the site is worse than none, because an incomplete pass feels complete.

### ⚠️ A stale preview server will serve you a stale build

`webServer.reuseExistingServer` is `!CI`, so if **anything** is already listening on 4321, Playwright skips its `npm run build && npm run preview` entirely and tests whatever is on disk from before. This has already cost real debugging time: a fixed bug kept "failing" because the old bundle was still being served.

`astro preview` has its own version of the same trap: when 4321 is taken it prints one quiet line — `Port 4321 is in use, trying another one...` — and serves on **4322**. Open the URL you expected rather than the one it printed and you are reading the old build.

If a test fails in a way that contradicts the source, **kill stray preview servers and re-run** before touching code (`npm run demo` does it for you). Confirm the fix is actually in `dist/_astro/*.js` — `grep` the built bundle.

#### ⚠️ A STALE `dist/` IS THE SAME TRAP WITHOUT A STALE SERVER

Reverting source is not reverting the build. Anything that ran `npm run build`
while a file was temporarily modified — an experiment, a "does this test have
teeth?" check, a `npm run quick` dry run — leaves `dist/` holding the modified
output, and `git checkout` of the source does **not** undo that.

It has already cost a full matrix run: a one-word i18n change made to prove the
quick-change script accepted it was reverted in source but not rebuilt, and the
next matrix reported the **WhatsApp share link missing on all five projects**.
Five projects failing identically looks exactly like a real regression in a
Critical Feature — which is what makes this expensive rather than merely
annoying.

**The tell is a failure that is identical on every project, including
chromium.** The documented Firefox/WebKit flakes are per-project and move
between runs; a deterministic five-project failure is either a real defect or a
stale artefact, and the artefact is cheaper to rule out first:

```sh
grep -o "the string you expect" dist/<page>/index.html
```

Rebuild before any matrix run that follows an experiment.

#### Finding the stale server on Windows: `netstat -ano`, never `-p tcp`

On Windows `-p tcp` means **IPv4 TCP only**. Node — and therefore `astro preview` — binds `[::1]`, which is `tcpv6`, so `netstat -ano -p tcp` shows **nothing at all** for a running preview server.

This is not theory: the first version of `demo.mjs` used `-p tcp`, cheerfully reported "nothing was running", and astro then landed on 4322 — the script reintroducing the exact trap it was written to remove. Plain `netstat -ano` sees both.

### Never pipe the test run into `tail`

`npx playwright test | tail -12` reports **tail's** exit code, not Playwright's, and truncates the failure summary — a run with 14 failures reads as "196 passed", exit 0. Redirect to a file and check the status explicitly:

```sh
npx playwright test --reporter=line > /tmp/full.log 2>&1
echo "EXIT: $?"
grep -E "passed|failed|flaky" /tmp/full.log | tail -5
```

Sanity check the arithmetic too: the matrix is 5 projects, so the total must be `5 ×` the per-project count. A passed count that is not the full total means tests failed or never ran.

### Hydration is what the board specs wait on

`<cg-board>` is created by Chessground inside a `useEffect`, so it exists **only after the island has hydrated**. Waiting on it is a genuine hydration signal. Waiting on `[data-testid="replayer"]` is **not** — Astro server-renders the Preact markup, so that element is in the HTML whether or not any JS ran.

**A board spec must scroll the board into view before waiting on it.** The island is `client:visible`; on the phone projects the board starts below the fold and legitimately never hydrates until scrolled. The iPhone 13 project caught exactly this — 14 failures that were the *application behaving correctly* and the spec being wrong. `openReplayer()` in `replayer.spec.ts` does the scroll; use it rather than hand-rolling a `goto`.

### WebKit on Windows is flaky — read this before debugging a WebKit failure

The Windows WebKit build crashes under Playwright's default fan-out. With six
workers, roughly a quarter of the specs die with **"Target page, context or
browser has been closed"** — the browser process itself disappears mid-test. The
same specs pass 24/24 on `--workers=1` in about 15 seconds, so this is a browser
build problem, **not** an application bug.

The `webkit` and `iphone-13` projects therefore carry `fullyParallel: false`
(spec files still run concurrently; tests within a file run in sequence) plus one
local retry. Chromium keeps the full fan-out and no retries.

**If you see "browser has been closed" in a WebKit run, suspect this first.**
Re-check with `--workers=1` before touching any application code. A genuine
failure is deterministic and fails the retry too; only the startup crash is
absorbed. A run reporting `N passed, 1 flaky` on WebKit is green.

### Firefox on Windows loses its compositor under fan-out — read this too

Same shape, different browser, found in Session 3. Under the full fan-out the Windows Firefox build fills the log with `RenderCompositorSWGL failed mapping default framebuffer` and `VideoBridgeParent receives IPC close with reason=AbnormalShutdown`, and whatever test was in flight dies with a **`mouse.move` or `page.reload` timeout** — the browser has stopped answering, so it presents as a hang rather than a failed assertion.

The tell is that it lands on a **different test each run**, including specs that predate whatever you are working on. Confirmed with `--workers=1`, where the same specs pass 21/21 in ~2.5 minutes. Firefox therefore carries one local retry, exactly as WebKit does. A genuine failure still fails the retry — **if a Firefox spec fails twice, believe it.**

### `auth.spec.ts` hard-fails under the Firefox fan-out — and it is the NETWORK, not the browser

Found in E1's full-matrix run. Six `auth.spec.ts` "signed in" tests failed on
Firefox with **`createConfirmedUser: fetch failed`**, and every one of them
passed on `--workers=1`.

⚠️ **This is a different mechanism from the compositor flake above, and the tell
is that the error comes from Node rather than from a page.** `createConfirmedUser`
calls the Supabase **admin API over the network** from the test process. Under the
full fan-out, six Firefox contexts each want a freshly-minted user at once, and the
outbound requests contend hard enough that some simply fail to connect. Nothing in
the browser is involved — which is why it presents as `fetch failed` rather than as
a timeout or an assertion.

**These do NOT get absorbed by the local retry**, because the retry runs while the
crowd is still there. Unlike the compositor crashes, they surface as hard failures
in the summary.

If a full-matrix run reports failures confined to `auth.spec.ts` on one project,
re-run that project with `--workers=1` before touching anything. As always: a
genuine failure is deterministic and fails serially too.

### ⚠️ FOCUS FOLLOWS THE MODALITY OF THE MOVE, NOT THE DEVICE

`MoveInput` pulls focus back to the field when it becomes the reader's turn
again, so a keyboard player is never left on a dead control with no sign that
the opponent has replied. Specified for a keyboard user in the a11y session,
and right for one.

On a phone it was **actively harmful**: every tapped move re-focused a text
field, which opens the virtual keyboard, which shrinks the visual viewport,
which scrolls the board out of sight. Playing by tapping became unusable.
Found by Seàn on a real phone — the brief was incomplete, not the
implementation.

`src/components/board/useMoveSource.ts` holds the rule. The board and the field
still converge on the same `onMove`; the tracker records **how it arrived**
without branching the game logic, and only the focus decision reads it.

⚠️ **NOT a device test.** Not user-agent, not `pointer: coarse`, not a
touch-capability check. A device test gets both of these backwards:

- a phone user with a Bluetooth keyboard who **types** still gets the field
  back, because they are in the typing flow;
- a desktop user with a mouse who **drags** does not, because they never asked.

**What the reader just did is the only honest evidence of what they want next.**

Two corollaries that are easy to miss:

- **Game start is not a move**, so `moveSource` says nothing about it — but it
  had the same symptom on `/jouer/`. The whole setup form is replaced by the
  board, so a keyboard player genuinely needs focus placed somewhere. The
  modality of the **activation** decides: `pointerdown` fires before submit for
  a tap or click and never for Enter/Space on the button.
- `focus()` **scrolls its target into view** by default. `preventScroll: true`
  is the second line of defence — the modality gate is the fix, but this is
  what would have limited the damage.

The field is never hidden or disabled on touch. Some students will prefer
typing, and it is the accessible path. It just stops grabbing focus unasked.

⚠️ **The suite could not have found this on its own: a headless browser has no
soft keyboard.** `tests/e2e/touch-focus.spec.ts` tests the *cause* (focus
landing in the field) and the *other half* of the symptom (the page scrolling),
and it names which of its tests actually fail on the old code — because a file
claiming every test has teeth when two do not is worse than one that admits it.
The engine cases live in `play.spec.ts`, which is already serialised for engine
contention.

### ⚠️ A `disabled` flag in an effect's deps can defeat a "never on mount" rule

`MoveInput` focuses the field when the turn comes back to the reader, and
**deliberately never on mount** — grabbing focus on load drags a reader past
the board and the hint they had not read yet.

`disabled` was in that effect's dependency array. It starts `true` (the
exercise board is view-only until its lazily-imported chess.js chunk lands) and
flips to `false` a few hundred milliseconds later, which re-ran the effect with
the `firstRender` guard already spent. The field focused itself anyway.

On a lesson page with a replayer above an exercise it also killed the
replayer's arrow keys, because `ReplayView`'s document handler ignores keys
aimed at an `INPUT`.

**The general shape: a guard that fires once is defeated by any dependency that
changes later.** If an effect must run only in response to X, X must be its
only dependency — other values may be *read*, they must not *trigger*.

It presented as a flaky spec for months rather than as a bug, because whether
the chunk won the race against the reader's first keypress depended on machine
load. **A spec that fails only in full-suite runs is not automatically the
documented browser flake** — this one was the application.

### ⚠️ Never assert a short-lived class with a MutationObserver — use rAF

The correct-move pulse lasts one Transition (300ms) and is then removed, so a
spec has to catch it in flight. The obvious tool is a `MutationObserver`, and it
is the wrong one.

Observer callbacks are **batched at the end of a microtask checkpoint**, and a
callback that re-queries the LIVE DOM (rather than reading the `MutationRecord`s
it was handed) can run after the window has already closed — finding nothing and
reporting that the thing never happened. It failed the v0.3.0 matrix on WebKit
and passed on `--workers=1`, which looks exactly like the documented WebKit flake
and was not: it was a racy test.

Sample from a `requestAnimationFrame` loop started before the action instead.
That is ~18 looks inside one Transition and cannot be batched past the window.

⚠️ **rAF alone is not enough on WebKit under load**, where it is starved and the
loop simply does not run often enough. The pulse spec now runs the rAF loop AND
a `MutationObserver` that reads its **records** — `record.addedNodes` and
`record.target` describe the DOM as it was when the mutation happened, however
late the callback fires. That is the distinction the rule above is really about:
re-querying the live DOM is what fails, not the observer itself. The two
samplers have opposite blind spots, so together they close the window.
The tell that you have this bug rather than a browser one: the failure is
`length` being 0 on a collection that should be non-empty, and it moves between
projects rather than being deterministic on one.

### Driving Chessground's drag from a spec needs a real animation frame

Chessground marks a drag as *started* inside a `requestAnimationFrame` loop (`processDrag` in `drag.ts`), and its `end()` only emits a move when that flag is set. Playwright dispatches `mouse.move(..., { steps })` back to back with no delay, so an entire synthetic drag can begin and finish **inside a single frame**. Chessground then reads it as a click-select: the piece sits there selected with its legal-move dots showing, no move is emitted, and nothing errors.

**So specs TAP instead: `movePiece()` clicks the piece, then clicks the square.** That goes through `selectSquare` on plain mousedown/mouseup with no rAF anywhere, lands in the same `userMove` → `onMove` handler, and is what people actually do on a phone. Same code under test, none of the fragility. `dragPiece()` still exists and is exercised, but only on desktop Chromium — the drag is a real user path worth covering, just not one a synthetic instantaneous drag can cover reliably under load.

#### ⚠️ A PRESS NEEDS A DURATION — `click()` with no `delay` is not a tap

Same mechanism as the drag above, and it cost a red release gate to find.

`click()` with no `delay` sends `mousedown` and `mouseup` with nothing between
them, so both land in **one animation frame**. Chessground does its drag
bookkeeping inside a `requestAnimationFrame` loop, and a press already released
before that frame runs is not a press it can act on — it emits **no move, no
error, and no attempt**. The board looks dead.

Measured on `/apprendre-les-bases/le-cavalier/`, 8 fresh contexts each:

```
click delay = 0ms   → solved 1/8
click delay = 60ms  → solved 8/8
```

So `movePiece()` presses for `PRESS_MS` (60ms). ⚠️ **`tap()` takes no `delay`**
and the touch projects have never shown this, so the touch path is unchanged.

⚠️ **THIS WAS NEVER A PRODUCT BUG, and the distinction is the whole point.**
Driven at any human pace the same board picks up and solves every time —
verified by hand, twice, before a line of harness code was touched. A 0ms press
is not something a person can produce. The failure presented as *"the tutorial
board refuses every pointer move"*, which is indistinguishable from a real
regression until you drive it yourself.

⚠️ **It also bisected clean to a tree that had already shipped green** — the
v0.8.0 tag failed the same way — which is the tell that a harness assumption
has become false rather than the app breaking. If a board spec starts failing
on a tree you did not touch: **drive the page by hand before believing it.**

Two more things `tests/e2e/helpers/board.ts` gets right, both learned the hard way:

1. **Element-relative positions, never page coordinates.** `locator.click({ position })` makes Playwright scroll the board into view and resolve the point against the element. `page.mouse.click(x, y)` breaks the moment anything scrolls between the two taps — and it does: on a phone viewport the second click landed on the move-entry field instead, focusing an input scrolled it into view, and the failure looked like *the board ignoring legal input*, with a screenshot showing the piece dutifully selected and the page halfway down.
2. **Touch devices get `tap()`, not `click()`.** Chessground binds `touchstart` as well as `mousedown`, and on a touch-enabled context the touch path is the one a reader exercises. Mouse events there are unreliable as well as unfaithful: Pixel 5 selects the piece on the first mouse click and ignores the second. The helper detects `'ontouchstart' in window` and picks — `tap()` would throw on the desktop projects, which have no touch at all.

### The play specs run ONE AT A TIME, and raising timeouts will not help

Every test in `play.spec.ts` boots a real engine: 3.6 MB fetched, 1.4 MB of WASM compiled, **64 MiB** of linear memory allocated. Under the global `fullyParallel: true` that happens in six browser contexts at once and the machine runs out of room — the handshake misses its window, the view *correctly* falls back to "could not load", and the test fails with `data-phase="setup"` and nothing in the log that looks like a bug.

Raising the timeouts only changes which assertion gives up first; it was tried, and the failure count went **up**. `test.describe.configure({ mode: 'default', retries: 1 })` at the top of the file is the fix: sequential in one worker, other spec files still parallel alongside. It is also *faster* — 14 tests in 57s instead of thrashing.

`mode: 'default'`, not `'serial'`: serial would skip the remaining tests after a failure, and a genuine break deserves to be reported on its own terms.

`retries: 1` covers what sequencing cannot — the five **projects** still run concurrently, so a full-matrix run can have five engines booting at once across five browsers. The retry runs once the crowd has thinned. As with the WebKit and Firefox crashes above, this absorbs contention and not bugs: a real break is deterministic and fails the retry too.

### A board that only appears later has to be scrolled to

`openExercise` scrolls the board into view because the island is `client:visible`. `/jouer/` needs it for a second reason: **the board does not exist until the game starts** — the setup form was there instead — so it can land below the fold. `dragMove` works in page coordinates, and a mouse event aimed past the bottom of the viewport hits nothing at all: the drag appears to succeed and no move is made. `startGame` scrolls after the phase flips.

### Test the pointer path even when the keyboard path is easier to write

Every play-mode test was written with `typeMove` because typing is simpler than computing board geometry. That left dragging on `/jouer/` completely uncovered — a break would have surfaced only when a human tried it. The two `dragMove` tests exist for that reason, and one of them plays from the **black** side, because the geometry flips with the orientation and nothing else would catch it.

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
  (one trap, one exercise, one agenda entry)
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
| **Promotion only** | `npm run test:release` | once, when promoting `dev` → `main` | 30-45 min |

`npm run test:branch` is **chromium only** and runs the specs mapped from what
actually changed (`scripts/spec-map.mjs`). `--all` runs every chromium spec for
a sweeping refactor — still one browser.

#### ⚠️ DO NOT RUN THE MATRIX ON A FEATURE BRANCH. EVER. NOT "TO BE SAFE".

This is the rule most likely to be reasoned away, so here is the reasoning
already done:

- **The matrix answers exactly one question** — does this work in Firefox and
  WebKit. Asking it on every branch does not make the answer truer. It moves
  the cost from one run per release to one run per session.
- **It was costing 30-45 minutes per session**, routinely, because it *felt*
  prudent. That is not caution. It is a tax that discourages small fixes, and
  unfixed small things are what a visitor actually sees.
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

### Driving the board from a spec

`<cg-board>` holds no DOM node per square — Chessground positions pieces with transforms — so there is nothing to select by name and **the square geometry has to be computed** from the board's bounding box. `squareCenter()` / `playMove()` in `tests/e2e/exercise.spec.ts` do it; use them rather than hand-rolling.

Two gates before a spec may interact, and skipping either produces an identical, confusing symptom (the move silently vanishes):

1. `data-ready="true"` — the lazily-imported engine chunk has landed. Before that the board is deliberately view-only.
2. `data-busy="false"` — no scripted reply or shake is in flight. `playMove()` waits on this itself.

Chessground starts a drag on **movement**, not on press: `mouse.down()` then straight to `mouse.up()` registers as a click-select, not a move.

### Manual checklist before PR to `main`

**The checklist lives in [`docs/MANUAL-TESTS.md`](./docs/MANUAL-TESTS.md)** — grouped by feature, with expected results, including the regressions that have bitten before (the `1..` move number, the rapid-arrow mash, the `onlyMove: false` wording, the engine's no-fetch-before-click rule).

Run `npm run demo`, which prints its path, and work down it. The release gate is:

```
□ npm run demo — builds clean, no new warnings
□ node scripts/check-contrast.mjs — green
□ node scripts/check-content.mjs — green
□ npm run test:release — green (the full matrix; see the known environmental
  flakes above. This is the ONE place it runs.)
□ docs/MANUAL-TESTS.md — worked through on desktop AND a real phone
□ Lighthouse ≥ 90 (Performance, Accessibility, SEO)
□ package.json "version" matches the tag about to be cut
□ CHANGELOG.md stamped, [Unreleased] emptied, compare-links updated
```

It is a **living document**: keep it in step with the site, in the same commit as the feature. See the session finish routine under Conventions.

---

## Roadmap — Phases

### Phase 1 — Foundation
- ✅ Scaffold Astro 7 + Tailwind v4, design tokens (AA-audited), i18n plumbing
- ✅ Content collections + Zod schemas, one placeholder entry each, chess-validity checker
- ✅ PWA plumbing (generated manifest, Workbox precache, icons)
- ✅ Playwright + axe-core foundation
- ✅ First real trap (Légal's mate); courses still to write

### Phase 2 — The board
- ✅ Preact island framework (`@astrojs/preact`), `client:visible`
- ✅ The one Chessground island + our token-driven board theme
- ✅ Replay mode: controls, keyboard, move list, per-ply commentary and arrows/circles
- ✅ Trap detail pages + outbound WhatsApp share; first real trap (Légal's mate)
- ✅ Exercise mode: interactive board, `onlyMove`-respecting validation, hints, attempts, replayable solution; three real exercises
- ✅ `localStorage` progress (`src/lib/progress.ts`), solved ticks on the index
- ✅ GPL-3.0-or-later, `/mentions-legales/`, sitewide source link
- ✅ Stockfish, lazy-loaded on a click, runtime-cached; `/jouer/` with colour + three levels
- ✅ Keyboard move entry on every board — the pointer-only exclusion is closed
- ✅ Content licensed separately from the code (CC BY-NC-ND 4.0)
- Course detail pages (per-locale Markdown bodies — see the content model)
- **The engine-backed validator that finally lets `onlyMove: false` accept a winning alternative.** The engine is now here; this is the remaining half of the exercise-validation rule.

**Theming** (Session 5)
- ✅ Dark mode, board presets, custom board colours, `/parametres/`
- ✅ The contrast audit parses the real CSS and covers both palettes

**Themes and typography** (E6 + E7)
- ✅ Four site themes (Bois, Marbre, Souiri, Terminal), each with a full light and dark palette
- ✅ Four licence-checked piece sets, fetched per theme on board pages only
- ✅ Heading typeface per theme; the body face never changes
- ✅ The contrast audit covers 4 themes × 2 modes × 6 presets — 275 assertions

### Phase 3 — Growth
- Online play via room codes + Durable Objects (v2)
- OG images per trap/exercise, sitemap/SEO
- Printable handouts from the PGN

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
