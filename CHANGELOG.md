# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Per CLAUDE.md → Conventions, this file is updated on **every merge to `dev`**.

---

## [Unreleased]

### [0.3.0] — GPL, and the exercise engine

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

### [0.2.0] — The board

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

### [0.1.0] — Scaffold

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
