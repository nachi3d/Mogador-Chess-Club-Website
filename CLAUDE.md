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
**Hosting:** Cloudflare Pages, fully static output
**Staging:** Cloudflare Pages preview deployments on `dev`
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
  - `output: 'static'`. There is **no SSR and there are no Pages Functions.** That is why `wrangler` is not a dependency and why Playwright serves the build with `astro preview` rather than `wrangler pages dev` (Claraloha needs the latter because it has a Function; we deliberately do not).
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
- **Cloudflare Pages** hosting + **Umami** analytics (env-driven; omitted entirely when unset).
- **Playwright** + **axe-core** tests.

### Why static, and why no Supabase (v1)

The whole v1 product is *content plus a chess engine in the browser*. There is no per-user data worth a server: lesson progress is one visitor's private state, so it lives in `localStorage`. There are no capacity-constrained bookings (Baby Club's reason for Supabase), no transactions, no roles. Adding a database would mean auth, a privacy policy, and a monthly bill in exchange for nothing a visitor can perceive.

Consequence to respect: **progress is device-local and can be cleared by the browser.** Never build a feature whose value depends on progress surviving — no streaks that punish loss, no "resume where you left off" as the only way to reach a lesson.

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
| `src/components/board/BoardSurface.tsx` | The **only** file importing Chessground | know about PGN, commentary or modes |
| `src/components/board/ChessBoard.tsx` | THE island. Dispatches on `mode`. | import the i18n layer or fetch anything |
| `src/components/board/ReplayBoard.astro` | Server side: parses the PGN, resolves labels, mounts with `client:visible` | render a board itself |

**The PGN is parsed at BUILD time**, and the island receives a plain array of positions. chess.js therefore never enters the client bundle for replay mode (~40 KB saved), and a malformed PGN fails `npm run build` instead of rendering an empty board in production. The exercise and play modes *will* need chess.js in the browser for legality checking — they should **lazy-import** it then, not make the replayer pay for it now.

### Preact gotchas that have already bitten

1. **Adjacent JSX text children break hydration.** `{n}.` server-renders as one text node `"1."`; Preact hydrates expecting two children, finds one, and **appends** the missing `"."` — the browser shows `1..` while the HTML says `1.`. Interpolate into a single node instead: `` {`${n}.`} ``.
2. **Never compute a state target from the closed-over value in an event handler.** The keyboard handler originally did `step(cursor + 1)`; two arrow presses in the same frame both read the same stale `cursor`, so the second was silently swallowed and holding the key dropped moves. Use functional updates — `setCursor(prev => …)` — and keep the listener bound once. `tests/e2e/replayer.spec.ts` has a rapid-press regression test.
3. **Chessground owns its DOM.** Render one empty `<div>` and hand it over; never give that element VDOM children, or Preact will diff away Chessground's work. Updates go through `api.set()`.
4. `lastMove: undefined` does **not** clear an existing highlight — Chessground's config merge skips undefined keys. Pass `[]`.

### Third-party licences — READ THIS

| Dependency | Licence | Consequence |
|---|---|---|
| **Chessground** | **GPL-3.0-or-later** | ⚠️ See below |
| cburnett piece set | CC BY-SA 3.0 — by **Colin M.L. Burnett**, via Wikimedia Commons | attribution + share-alike |
| chess.js | BSD-2-Clause | permissive |
| Preact, Astro | MIT | permissive |

⚠️ **Chessground is GPL.** Its README states it plainly: *"When you use Chessground for your website, your combined work may be distributed only under the GPL. You must release your source code to the users of your website."* Shipping Chessground in the bundle therefore points at publishing this repository under the GPL.

That is Seàn's call, not a code decision — and for a free community club project it is a very plausible yes. It is written down here so it is a **choice** and not an accident.

The containment is deliberate: `BoardSurface.tsx` is the only file that imports Chessground, and everything else talks to its `BoardProps`. If the answer turns out to be no, swapping in a permissively-licensed board (or hand-rolling one — a board is a CSS grid and a piece sprite sheet) is a rewrite of **that one file**. The cburnett sprites would have to go too, since they arrive inside `chessground.cburnett.css`.

Wherever the piece set is used, credit **Colin M.L. Burnett (CC BY-SA 3.0)** in the site's legal/credits page.

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

`node scripts/check-content.mjs` replays every line through chess.js. A Zod schema proves an entry is well-*shaped*; it cannot prove it is legal chess — `"e2e5"` is a valid UCI string and an illegal move. The script checks that PGNs parse, that note plies exist, that solutions and opponent replies interleave legally from the FEN, and that anything tagged `mat` actually ends in checkmate.

---

## Routes

FR at the root, EN under `/en/...`. **Route segments are not translated** (`/en/pieges/`, not `/en/traps/`) — one segment vocabulary means the language switcher is a pure prefix swap that can never fail to find its counterpart. Visible nav labels are translated; URLs are structural.

| Route | EN | Notes |
|---|---|---|
| `/` | `/en/` | Home — hero, CTAs into cours and pièges |
| `/cours/` | `/en/cours/` | Course index (cards) |
| `/pieges/` | `/en/pieges/` | Trap index (cards, ECO + theme chips) — **no board mounted here** |
| `/pieges/[slug]/` | `/en/pieges/[slug]/` | Trap detail — the replayer, commentary, outbound WhatsApp share |
| `/exercices/` | `/en/exercices/` | Exercise index — **no board mounted here** |
| `/agenda/` | `/en/agenda/` | Sessions; venue falls back to site config |
| `/contact/` | `/en/contact/` | WhatsApp CTA, venue, socials |
| `/manifest.webmanifest` | — | Generated from `src/config/site.ts` |

Each route file is a two-line shell that renders a shared component from `src/components/pages/` with a `locale` prop, so the two locales cannot drift apart structurally.

Detail routes take their URL from the content's **`slug` field, not the filename**, so renaming a file can never silently move a published URL. `/exercices/[slug]/` and `/cours/[slug]/` are still to come.

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

`node scripts/check-contrast.mjs` audits every rendered pair against WCAG AA and **exits non-zero on failure**. Run it after touching any hex. It also asserts that the pairs behind the deep-variant rules still fail — so a rule can never quietly become stale.

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

## PWA

- **Manifest** is an endpoint (`src/pages/manifest.webmanifest.ts`) generated from `src/config/site.ts`, not a static file, so the club name and theme colours cannot drift from the config and tokens they came from. Astro prerenders it to a plain static file.
- **Icons** are generated from one source mark — see "Generated assets".
- **Service worker** is generated by Workbox in `scripts/build-sw.mjs`, which runs **after** `astro build` (it fingerprints the real `dist/`; running it first would precache the previous build's hashes).

### Service worker — Stockfish is NEVER precached

The engine is a multi-megabyte WASM bundle that only the play-the-computer feature needs, so it is **lazy-loaded on demand**. Precaching it would make every first visit — including a phone on Essaouira mobile data that only ever reads one lesson — pay for it up front.

`globIgnores` in `scripts/build-sw.mjs` excludes `**/stockfish*` and `**/*.wasm` **already**, before the engine exists, so it cannot be swept in later by accident. `tests/e2e/pwa.spec.ts` asserts the generated `sw.js` mentions neither. When the engine lands, cache it with a runtime `CacheFirst` rule (there is a commented block in place), never in the precache manifest.

`skipWaiting` / `clientsClaim` are on. That is safe here because this is a multi-page app: every navigation is a full document load, so a worker taking over mid-session cannot leave a half-updated SPA shell talking to newly-hashed chunks.

---

## Generated assets

Three scripts produce committed artefacts. **None of them run as part of `npm run build`** — they are run by hand when their input changes, and their outputs are versioned, so a Cloudflare Pages build needs no image toolchain and no extra step.

| Script | Produces | Re-run when |
|---|---|---|
| `scripts/build-icons.mjs` | `public/icons/*` | the brand mark changes |
| `scripts/build-fonts.mjs` | `public/fonts/*`, `src/styles/fonts.css` | the families or subset list change |
| `scripts/build-sw.mjs` | `dist/sw.js` | **automatic** — part of `npm run build` |

### Why the fonts are copied instead of imported

`@import '@fontsource-variable/inter/index.css'` **does not work here.** Vite resolves CSS `@import` before rewriting `url()` references and does not rebase them for CSS pulled out of a package: the build emits `@font-face` rules pointing at `./files/...woff2` relative to `/_astro/`, copies no woff2 into `dist/`, and **warns rather than fails**. The site then silently falls back to Georgia and system-ui — the typography is simply gone and nothing is red.

It is also wasteful: `index.css` declares every subset the family ships (Inter carries Cyrillic, Greek and Vietnamese), all of which would land in `dist/` and get swept into the **precache**, which is not lazy.

So `scripts/build-fonts.mjs` copies exactly the `latin` and `latin-ext` woff2 files into `public/fonts/` and generates `src/styles/fonts.css` with absolute `/fonts/...` URLs. Four files instead of fourteen. The two latin files are `<link rel="preload">`ed in `BaseLayout.astro`; the latin-ext pair deliberately is not, being the rare-glyph fallback.

---

## Analytics

Umami, env-driven. `PUBLIC_UMAMI_WEBSITE_ID` is read at build time from the Cloudflare Pages **build** variables. When unset the snippet is **omitted entirely** — no empty `<script>`, no request to umami.is. That is also why dev, CI and the Playwright run make no third-party network calls at all, which `tests/e2e/pwa.spec.ts` asserts.

---

## Testing

Playwright + axe-core. Specs live in `tests/e2e/` and run against the **built** site served by `astro preview` — not the dev server. The service worker, the generated manifest and the self-hosted fonts only exist after `astro build` plus the post-build step, so testing the dev server would be testing a different application.

Scripts: `npm run test:e2e` (full matrix), `npm run test:e2e:chromium` (branch default).

### ⚠️ A stale preview server will serve you a stale build

`webServer.reuseExistingServer` is `!CI`, so if **anything** is already listening on 4321, Playwright skips its `npm run build && npm run preview` entirely and tests whatever is on disk from before. This has already cost real debugging time: a fixed bug kept "failing" because the old bundle was still being served.

If a test fails in a way that contradicts the source, **kill stray preview servers and re-run** before touching code. Confirm the fix is actually in `dist/_astro/*.js` — `grep` the built bundle.

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
local retry. Chromium and Firefox keep the full fan-out and no retries.

**If you see "browser has been closed" in a WebKit run, suspect this first.**
Re-check with `--workers=1` before touching any application code. A genuine
failure is deterministic and fails the retry too; only the startup crash is
absorbed. A run reporting `N passed, 1 flaky` on WebKit is green.

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
- *(as it lands)* `onlyMove: false` never reports a winning alternative as wrong

### Manual checklist before PR to `main`

```
□ npm run build — no errors, no warnings
□ node scripts/check-contrast.mjs — green
□ node scripts/check-content.mjs — green
□ npx playwright test — green (full matrix)
□ FR + EN both display correctly, switcher preserves path
□ Install the PWA on a real phone; confirm icon, name and offline shell
□ Lighthouse ≥ 90 (Performance, Accessibility, SEO)
□ Real mobile device test — a board must be usable one-handed
```

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
- Course detail pages (per-locale Markdown bodies — see the content model)
- Exercise detail pages + the validator (respecting `onlyMove`)
- Stockfish, lazy-loaded, runtime-cached
- `localStorage` progress

### Phase 3 — Growth
- Online play via room codes + Durable Objects (v2)
- OG images per trap/exercise, sitemap/SEO
- Printable handouts from the PGN

---

## Open questions for Seàn

- **⚠️ Chessground's GPL:** are we publishing this repository under the GPL? Shipping Chessground points that way (see "Third-party licences"). A "no" means swapping `BoardSurface.tsx` for a permissively-licensed or hand-rolled board — contained, but best decided before more is built on top.
- **Credits page:** the cburnett piece set needs a visible **Colin M.L. Burnett / CC BY-SA 3.0** attribution. Where does it live — `/mentions-legales`, or the footer?
- **Domain:** is `mogadorchess.ma` registered / registrable? `.ma` needs a Moroccan registrar and can require paperwork.
- **WhatsApp number** — currently a placeholder (`+212 6 00 00 00 00`). Must be real before launch.
- **Club email** — create one, or route to Seàn's inbox?
- **Socials** — does the club have its own Instagram, or does it post through the association's account? A Lichess team for v2?
- **Brand mark** — the current one is an explicit placeholder (a board in a brass frame). Commission a real one?
- **Dar Souiri address** — what exact street line may be published?
- **Lesson granularity** — is a course one page, or a course with N lesson pages? The body format is settled (per-locale Markdown); the ordering model is not.
- **`youtube` field** — now on `traps` and `cours` but nothing renders it. When it does: privacy-preserving facade (click-to-load, `youtube-nocookie`), or a plain iframe? A plain iframe sets third-party cookies on page load, which would break the "no third-party requests" test and the current privacy posture.
- **Arabic / Darija** — a third locale is a real question in Essaouira. The i18n layer supports it structurally, but RTL would need design work. Worth it?

---

## Key Contacts

| Role | Name | Contact |
|---|---|---|
| Developer / IT | Nachi3D (Seàn McGannon) | nachiketas3d@gmail.com |
| Association | Association Essaouira Mogador | `@associationessaouiramogador` |
