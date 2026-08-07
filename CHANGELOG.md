# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Per CLAUDE.md → Conventions, this file is updated on **every merge to `dev`**.

---

## [Unreleased]

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

[Unreleased]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/nachi3d/Mogador-Chess-Club-Website/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/nachi3d/Mogador-Chess-Club-Website/releases/tag/v0.1.0
