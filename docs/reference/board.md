# Reference — the board island

**Read when:** touching `BoardSurface.tsx`, `ChessBoard.tsx`, a view (`ReplayView` / `ExerciseView` / `PlayView`), `MoveInput`, board CSS, board geometry or the coordinate gutter.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

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

---

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

### ⚠️ The alignment is GEOMETRIC, never a nudge

Whatever track the coordinates sit in, a label's centre must be its file's centre
at every size and in **both** orientations. That is achieved by pinning each
track with `inset` and letting the eight children divide it — never by offsetting
a track by a measured number of pixels, which is exactly how Chessground's own
defaults (`coords.files { left: 24px; width: 100% }`) put every label out by a
constant **+24px** and pushed the "h" off the board.

⚠️ **`flex: 1 1 0`, not Chessground's `flex: 1 1 auto`.** With an `auto` basis the
cells are content-sized first, so a wide glyph steals space from its neighbours
and the labels drift off their files.

⚠️ **Aesthetic insets go on the `coord` child, never on the track.** Padding on a
child cannot move a label off its file; padding on the track moves all eight.

`tests/e2e/nav-coords.spec.ts` measures label centres against file centres at two
viewports and in both orientations, so a constant offset — invisible in a
screenshot review, obvious in arithmetic — cannot come back.

---

## a1 looking different is NOT a bug

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
