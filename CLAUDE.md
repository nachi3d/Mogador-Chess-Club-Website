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
**Domain (planned):** `mogadorchess.ma` — not yet registered
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
- Update CHANGELOG.md on every merge to dev
- **Back-merge convention:** after each release, merge `main` → `dev` to keep histories aligned
- Claude Code merges to `dev` only; **`dev` → `main` requires Seàn's explicit approval per release**

#### Session finish routine

Every session that reaches a merge updates all three, in the same commit as the work:

1. **`CHANGELOG.md`** — what changed, and the reasoning behind anything surprising.
2. **`CLAUDE.md`** — any decision, rule or gotcha that the next session would otherwise rediscover.
3. **`docs/MANUAL-TESTS.md`** — **whenever the session adds or changes anything a visitor can see.** New feature, new page, new failure mode, new regression worth watching: it goes in the checklist. This is the one most easily skipped and the one whose absence is least visible — a checklist that lags the site makes an incomplete test pass feel complete.

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

### ⚠️ The level presets are Skill Level, NOT Elo

**The vendored build exposes no `UCI_LimitStrength` and no `UCI_Elo`** — verified by reading the `uci` option list out of the running worker. The only strength dial it has is `Skill Level` (0–20), alongside `Skill Level Maximum Error` and `Skill Level Probability`.

So the three presets in `LEVELS` (`src/lib/engine/stockfish.ts`) are a skill level plus a depth and a movetime cap, set by hand:

| Preset | Skill Level | depth | movetime | design target |
|---|---|---|---|---|
| Débutant | 0 | 2 | 300 ms | ~800 |
| Intermédiaire | 5 | 6 | 800 ms | ~1400 |
| Avancé | 13 | 12 | 2000 ms | ~2000 |

**The UI names the levels and does not print a rating.** The design targets are recorded here; they have not been measured against rated opposition, and an Elo number the engine does not enforce and nobody has verified would be a fact we invented. If a real rating is ever wanted it has to be measured, not asserted.

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
  cours/        les-bases.json
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

Decided in Session 2. Course *bodies* will be **per-locale Markdown pairs** — `les-bases.fr.md` and `les-bases.en.md` — not more `*_fr` / `*_en` frontmatter fields.

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
| `/` | `/en/` | Home — hero, CTAs into cours and pièges |
| `/cours/` | `/en/cours/` | Course index (cards) |
| `/pieges/` | `/en/pieges/` | Trap index (cards, ECO + theme chips) — **no board mounted here** |
| `/pieges/[slug]/` | `/en/pieges/[slug]/` | Trap detail — the replayer, commentary, outbound WhatsApp share |
| `/exercices/` | `/en/exercices/` | Exercise index — **no board mounted here**; solved ticks from `localStorage` |
| `/exercices/[slug]/` | `/en/exercices/[slug]/` | Exercise detail — the interactive board, hint, attempts, outbound WhatsApp share |
| `/jouer/` | `/en/jouer/` | Play the computer. Engine loaded on a click, never before. |
| `/agenda/` | `/en/agenda/` | Sessions; venue falls back to site config |
| `/contact/` | `/en/contact/` | WhatsApp CTA, venue, socials |
| `/mentions-legales/` | `/en/mentions-legales/` | Legal notice + credits. **Footer only, not in the nav.** |
| `/parametres/` | `/en/parametres/` | Appearance settings. Footer only; the header carries a quick toggle. |
| `/manifest.webmanifest` | — | Generated from `src/config/site.ts` |

Each route file is a two-line shell that renders a shared component from `src/components/pages/` with a `locale` prop, so the two locales cannot drift apart structurally.

Detail routes take their URL from the content's **`slug` field, not the filename**, so renaming a file can never silently move a published URL. `/cours/[slug]/` is still to come.

⚠️ **The EN legal notice is `/en/mentions-legales/`, not `/en/legal-notice/`.** The Session 3 brief asked for the translated segment; it is deliberately not implemented that way, because the no-translated-segments rule above is what makes the switcher a pure prefix swap that *cannot* fail to find its counterpart. A translated segment needs a lookup map, and a missing entry 404s a reader mid-visit — on the one page whose whole job is to be findable. The visible link label **is** translated ("Mentions légales" / "Legal notice"); the URL is structural. Flagged for Seàn: it is a one-line change in `paths.ts` plus a map if he wants the English URL, and the site is unlaunched so it is still cheap to reverse.

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

## Theming — three tiers, one source of truth each

`/parametres/` (+ `/en/parametres/`). Everything is device-local, in `localStorage`, under the same rules as progress.

| Tier | What | Where the values live |
|---|---|---|
| 1 | Light / dark / system | `:root[data-theme='dark']` in `tokens.css` |
| 2 | Five board presets | `.board-<id>` in `board-themes.css` |
| 3 | The reader's own two square colours | inline properties on `<html>` |

Each layer overrides the one above it by ordinary cascade — class beats `:root`, inline beats class. There is no specificity fight and no `!important`.

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

Scripts: `npm run test:e2e` (full matrix), `npm run test:e2e:chromium` (branch default).

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

### Driving Chessground's drag from a spec needs a real animation frame

Chessground marks a drag as *started* inside a `requestAnimationFrame` loop (`processDrag` in `drag.ts`), and its `end()` only emits a move when that flag is set. Playwright dispatches `mouse.move(..., { steps })` back to back with no delay, so an entire synthetic drag can begin and finish **inside a single frame**. Chessground then reads it as a click-select: the piece sits there selected with its legal-move dots showing, no move is emitted, and nothing errors.

**So specs TAP instead: `movePiece()` clicks the piece, then clicks the square.** That goes through `selectSquare` on plain mousedown/mouseup with no rAF anywhere, lands in the same `userMove` → `onMove` handler, and is what people actually do on a phone. Same code under test, none of the fragility. `dragPiece()` still exists and is exercised, but only on desktop Chromium — the drag is a real user path worth covering, just not one a synthetic instantaneous drag can cover reliably under load.

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

### Verification policy

- **Default (every feature branch):** `npx playwright test --project=chromium <touched specs>` — sufficient to merge to `dev`.
- **Full matrix (Chromium, Firefox, WebKit, Pixel 5, iPhone 13) REQUIRED for:**
  - any merge to `main` (release gate);
  - any change touching **i18n routing**, the **board island**, the **exercise validator**, or the **service worker** (this project's critical paths).
- Everything else (copy, styling, new content entries) merges to `dev` on chromium-only.

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
□ npx playwright test — green (full matrix; see the known environmental flakes above)
□ docs/MANUAL-TESTS.md — worked through on desktop AND a real phone
□ Lighthouse ≥ 90 (Performance, Accessibility, SEO)
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
- ✅ Dark mode, five board presets, custom board colours, `/parametres/`
- ✅ The contrast audit parses the real CSS and covers both palettes

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
