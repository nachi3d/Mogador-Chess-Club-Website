# Reference — testing practice

**Read when:** writing or debugging a spec, driving a board from a test, or trying to explain a browser-specific failure.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

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

---

### Driving the board from a spec

`<cg-board>` holds no DOM node per square — Chessground positions pieces with transforms — so there is nothing to select by name and **the square geometry has to be computed** from the board's bounding box. `squareCenter()` / `playMove()` in `tests/e2e/exercise.spec.ts` do it; use them rather than hand-rolling.

Two gates before a spec may interact, and skipping either produces an identical, confusing symptom (the move silently vanishes):

1. `data-ready="true"` — the lazily-imported engine chunk has landed. Before that the board is deliberately view-only.
2. `data-busy="false"` — no scripted reply or shake is in flight. `playMove()` waits on this itself.

Chessground starts a drag on **movement**, not on press: `mouse.down()` then straight to `mouse.up()` registers as a click-select, not a move.
