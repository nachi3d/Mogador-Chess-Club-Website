# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Per CLAUDE.md → Conventions, this file is updated on **every merge to `dev`**.

---

## [Unreleased]

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

[Unreleased]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/releases/tag/v0.1.0
