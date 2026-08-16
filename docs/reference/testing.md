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

The tell is that it lands on a **different test each run**, including specs that predate whatever you are working on. Confirmed with `--workers=1`, where the same specs pass 21/21 in ~2.5 minutes. Firefox therefore carries one local retry, exactly as WebKit does.

#### ⚠️ "IF IT FAILS TWICE, BELIEVE IT" IS TOO STRONG — the retry can land inside the same crash

That sentence used to end this section, and the **v0.11.0 release gate falsified
it**: four Firefox specs failed *and failed their retry*, in four unrelated files
(`index-cards`, `progression`, `replayer`, `theme`), and all 102 tests in those
four files then passed **serially, first time**.

The reason is the same one the `auth.spec.ts` section gives for its own hard
failures: **the retry runs while the crowd is still there.** When the compositor
has died, the immediate re-run meets a browser that is still broken — the crash
is a property of the *process*, not of the test, so retrying inside it proves
nothing. The evidence in that run was unambiguous once read rather than counted:

- the log carried `RenderCompositorSWGL failed mapping default framebuffer` and
  `VideoBridgeParent receives IPC close with reason=AbnormalShutdown`;
- the errors were bare `Test timeout of 30000ms exceeded`, a
  `browserContext.close: Protocol error … can't access property
  '_maybeDontRestoreTabs'`, and `Tearing down "context" exceeded the test
  timeout` — **not one failed assertion between them**;
- two of the four files had not been touched for several sessions.

**So the rule is: the retry is not the arbiter — a serial re-run is.** A genuine
failure is deterministic and fails at `--workers=1` too, and it fails with an
*assertion*, naming a value. ⚠️ Do not shorten this back to "failed twice means
real": that reading blocks a release on a browser bug, and the pressure at that
moment is to skip the check rather than to do it.

⚠️ And the converse still holds and matters more: **a serial re-run that fails is
a real defect**, whatever the log says about compositors.

#### ⚠️ AND THEN THE DIAGNOSIS STOPPED BEING GOOD ENOUGH — the matrix runs one project at a time

Two consecutive gates were promoted on the reasoning above: **v0.11.0, 4
failures in 43.9m; v0.11.1, 7 failures in 58.3m.** Every one a bare timeout with
no failed assertion, on a different spec each run, across firefox, webkit and
iphone-13 — and every one green on a serial re-run (v0.11.1: 335 tests across
the three projects, first time). The diagnosis was right both times and both
promotions were sound.

**The trend was the defect, not the runs.** A gate that is expected to be red
teaches the next session to wave failures through, and that is precisely how a
real regression ships — the reader of the fifth red gate has no way to tell it
from the first four.

**The cause was measured rather than argued.** Playwright shares **one worker
pool across every project**, so at its default six workers this machine was
running six *mixed* browsers side by side. Sampled during a run:

| | |
|---|---|
| peak browser processes | 80 |
| peak browser memory | 6.68 GB |
| minimum free RAM | 2.08 GB of 15.8 GB |

At roughly 2 GB free, Firefox's software compositor cannot allocate its
framebuffer. ⚠️ **The failure is MEMORY EXHAUSTION — not a browser bug and not a
test bug**, which is exactly why it moved between specs and projects and why
every one of them passed serially.

##### The three candidates, and what each measured

| | Change | Result |
|---|---|---|
| **A** | per-project runs, 3 workers | 5 projects, **0 failures, 66.8 min** — **shipped** |
| **B** | `fullyParallel: false` on firefox | **rejected without a run** |
| **C** | pooled, 3 workers | 3 projects, 0 failures, 51.7 min |

⚠️ **C's 51.7 minutes is not a win, and the row is the trap.** It ran only
firefox, webkit and iphone-13 — the three projects that produced every failure
in both red gates — and still spent 51.7 of A's 66.8 minutes. The two it skipped
are ~1190 further test executions with no idle capacity to absorb them at the
same worker count, so pooled-over-five lands **above** A. It looked cheaper
because it did less.

⚠️ **B was rejected on evidence already in the repository.** `fullyParallel:
false` is what **webkit and iphone-13 already carry**, and they were two of the
three projects failing both gates. A setting already in force on the failing
projects cannot be the thing that would have saved them; measuring it would have
bought an hour of confirming what `playwright.config.ts` states in its own
source.

⚠️ **The honest caveat, recorded so nobody has to rediscover it:** C came back
green, and both red gates ran at **six** workers. So the **worker cap** is very
likely the half of A that does the work, and the per-project split is very
likely not load-bearing for stability at all. That is one pooled run and not a
proof. The split is kept anyway, because it buys something the cap does not:
**per-project accounting** — the gate reads counts off the JSON reporter and
compares the projects against each other, so a project that runs zero tests is
caught. The old check ("the total must divide by 5") could not see that: four
projects of 100 and one of 0 divides just as neatly as five of 80.

Peak load under C, for comparison with the table above: **59 processes, 5.55 GB,
4.33 GB free at the floor** — about half the pressure, and never near the ~2 GB
where the compositor starts failing.

⚠️ **Do not "fix" a red matrix by raising timeouts.** It was tried on
`play.spec.ts` and the failure count went **up**: a starved browser given longer
to answer is still starved, and every test now waits longer to find out.

⚠️ **`--workers=3` is not a tuning knob.** It is roughly half the peak memory,
which is the measured difference between green and red. The numbers live in
`scripts/test-release.mjs` → MEASUREMENTS; re-measure before re-arguing.

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

---

## The release matrix — the measurements behind the policy (moved from CLAUDE.md, v0.15.0)

**Read when:** a release matrix goes red, or before changing the worker cap, the per-project ordering, or the two-shape rule. ⚠️ The POLICY stays in CLAUDE.md; this is the evidence.

#### ⚠️⚠️ THE GATE RUNS TWICE NOW, AND THE OLD PREMISE IS WHY (v0.14.0)

The policy said the matrix runs once, on the default build, because **"a plain
`npx playwright test` exercises the real artefact"** — the default build being
what production ships. **That premise is FALSE and has been since the flag was
turned on in the Cloudflare dashboard.** Production serves the accounts-**ON**
build; the default matrix skips every auth spec, so the entire account stack was
reaching production with **chromium coverage only**.

The two shapes are not redundant — they test different things, and neither
subsumes the other:

- **OFF** is the only shape that can prove Critical Feature 18 (`auth-disabled
  .spec.ts`: no route emitted, no Supabase ref, host or anon key in the bundle).
  Those specs skip in the ON build.
- **ON** is the only shape that exercises `/connexion/`, `/auth/callback/`,
  `/bienvenue/`, `/compte/` and `/admin*` at all. Those specs skip in the OFF
  build, **visibly and with a reason** — which is what stops the gate passing
  vacuously, and is exactly why the hole was survivable long enough to matter.

⚠️ **THE ON MATRIX HAMMERS SUPABASE'S AUTH RATE LIMIT — five projects at ~40
magic-link verifications each.** `followMagicLink()` backs off and names a 429,
but a project the limit takes out is **re-run on its own**, not waved through.
See [`docs/reference/supabase.md`](./docs/reference/supabase.md).

⚠️ **IF THE FLAG EVER GOES BACK OFF IN PRODUCTION, THIS ROW GOES WITH IT** —
and the reason is recorded here rather than left as a habit, because a gate that
runs twice for no current reason is the kind of cost a future session deletes
without knowing what it was for.

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

---

## The critical-path assertions — the list in full (moved from CLAUDE.md, v0.15.0)

**Read when:** deleting, weakening or rewriting ANY spec — this is the list of claims the suite exists to keep, and each line names a way the site has been or could be wrong. ⚠️ The RULE (never skip these, and a failure here is a regression rather than a test to update) stays in CLAUDE.md.

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

---

## ⚠️ Symptoms that are the ENVIRONMENT, not the application

**Read when:** a spec fails and you are not yet sure whether the application is wrong — read the signature BEFORE touching code.

> Moved verbatim out of CLAUDE.md at the v0.16.0 split. The binding
> rule stayed there; this is the detail behind it.

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
| Several auth specs die of a bare `waitForURL` timeout on a **different set each run**, and pass when run file-by-file | **Supabase's auth burst limit.** The browser is parked on `{"code":429,"error_code":"over_request_rate_limit"}` — **measured at ~22 verifications in 7s**, clearing within minutes. `followMagicLink()` now retries and names it; if you see a raw timeout, check the page body before touching the callback |
| `net::ERR_CONNECTION_REFUSED at https://<ref>.supabase.co/…` from the BROWSER, while `curl` from Node reaches the same project fine | ⚠️ **SUSTAINED rate-limit abuse, escalated.** After a couple of hours of back-to-back auth runs the project stops answering the browser altogether. **Read the host in the error** — this looks identical to a dead preview server until you notice the refusals are to supabase.co, not to `localhost:4321`. Nothing in the repo fixes it: **stop running, wait, then run ONCE.** Raising the TEST project's limit is in BACKLOG |
| A run collapses part-way, and everything after a certain point fails `ERR_CONNECTION_REFUSED at http://localhost:4321/` | **The preview server went away mid-run.** ⚠️ **Often self-inflicted: piping a run into `head`/`grep -m1` SIGPIPEs it**, killing the runner while its `astro preview` teardown races the next run's server. CLAUDE.md already says never pipe a test run — this is the failure it produces. **Redirect to a file and read the file** |
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

---

## ⚠️ Driving a board from a spec — the four gates

**Read when:** writing or debugging any spec that touches a board — all four gates have produced false failures that looked like application bugs.

> Moved verbatim out of CLAUDE.md at the v0.16.0 split. The binding
> rule stayed there; this is the detail behind it.

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
