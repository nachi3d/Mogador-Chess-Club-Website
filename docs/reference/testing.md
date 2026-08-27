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

## ⚠️ The WebKit click that never happened — v0.17.0, and how it was found

**Read when:** a control "does nothing" on Safari or an iPhone and works
everywhere else; or before writing any handler that mutates the DOM on `change`.

### The symptom

`recurring-sessions.spec.ts:256` failed on **webkit and iphone-13 only**, in the
accounts-ON matrix, and survived a serial `--workers=1` re-run of the whole file
on both. Memory was ruled out — troughs 5.76 GB and 5.80 GB, far above the ~2 GB
starvation line. The assertion named values (`.series-card` expected 1, received
0) and the locator resolved to zero elements 30-odd times across a full 15 s, so
it was not a race a longer timeout would have papered over.

### The diagnosis, and the three wrong answers it went through

Written down because each was plausible, each was cheap to test, and each was
wrong — which is the useful part.

1. **`crypto.randomUUID()` unavailable in WebKit** (it is used by
   `newSeriesId()`, and it requires a secure context). **Wrong**: WebKit at
   `http://localhost` reports `isSecureContext: true` and returns real UUIDs.
2. **The `window.confirm` dialog racing Playwright's handler.** **Wrong**:
   `page.once('dialog', accept)` fires correctly in WebKit and `confirm` returns
   `true`, identically to Chromium.
3. **A native form submission navigating the page.** **Wrong**: no
   `framenavigated`, URL unchanged.

What actually settled it was instrumenting the page rather than reasoning about
it:

| measured | value |
|---|---|
| form validity | `true`, every field |
| button | in form, `type=submit`, not disabled |
| a dispatched `submit` | **was** `preventDefault`'d ⇒ the listener exists |
| `pointerdown` / `mousedown` / `mouseup` | **all on `button.btn-primary`** |
| `click` events on the button | **0** |
| `submit` events on the form | **0** |
| page errors | none |

Pointer events reach the button and no `click` is synthesised. That is the
signature of the DOM under the pointer being mutated mid-press.

### The cause

`paintPreview()` was wired to the form's `change` event and rewrote
`submitButton.textContent` unconditionally.

Pressing "Créer" while the caret is still in "Jusqu'au" **blurs** that field.
Blur fires `change`. `change` bubbles to the form. The handler rewrites the
button's text — **between the `mousedown` and the `mouseup` of the press**.
WebKit then declines to synthesise the `click`.

⚠️ **THE A/B THAT PROVED IT**, and it proved itself through an error message:
attempt A pressed the button directly and produced **no dialog**; attempt B
blurred first and pressed again, and Playwright threw `dialog.accept: Cannot
accept dialog which is already handled!` — because attempt A's handler was still
armed and unconsumed, and B's dialog fired both. Absence in A, presence in B, in
one run.

### What it cost a user

A prof on Safari or any iPhone fills in the end date, taps "Créer les 13
séances", and **nothing happens**. No message, no spinner, nothing to retry
against. Tapping a second time works, because the field is blurred by then.

That is the worst shape a bug can take on this surface: it looks like the site
being slow, so it does not get reported, and the workaround is invisible.

### The fix

`paintPreview()` is **idempotent**: `setText`/`setHtml`/`setHidden` write only
when the value actually differs. The blur-time repaint computes identical
content, touches nothing, and the press survives. It also removes a per-keystroke
DOM write that was never wanted.

⚠️ **THE GENERAL RULE, WHICH OUTLIVES THIS FORM: a paint function is
idempotent.** Running it twice with the same inputs must touch nothing the
second time. Any unconditional DOM write reachable from a `change` handler can
kill a button on WebKit.

### Why the release matrix earned its cost here

⚠️ **CHROMIUM AND FIREFOX SYNTHESISE THE CLICK REGARDLESS.** This shipped
through `test:branch` (chromium only) and would have shipped through any amount
of manual desktop checking. **Both WebKit projects caught it**, which is
precisely why the matrix runs five projects and precisely why a red matrix is a
finding to chase rather than a flake to wave through. v0.11.0 and v0.11.1 shipped
on waved-through failures; this is what that habit costs when the failure is
real.

### ⚠️ And the regression test had the same failure mode as the bug

The first version of the guard asserted the rows existed by reading the table
**once**, immediately after the confirm dialog fired. The dialog only means the
handler *started* — the insert is a round trip behind it. So the test failed
against a correctly fixed build, with `Expected: 3, Received: 0`, which is
indistinguishable at a glance from the bug it was written to catch.

⚠️ **A GUARD WHOSE FAILURE LOOKS LIKE THE DEFECT IS WORSE THAN NO GUARD**, because
the next session reads the red and goes hunting for a second cause that does not
exist. It now polls, like every other database assertion in that file.

⚠️ **AND THE TEST IS THE ABSENCE OF A BLUR.** Do not "tidy" it by clicking
elsewhere, pressing Tab or calling `.blur()` before the press — any of those
makes it pass against the broken build.

## ⚠️ Every matrix run keeps its own log — and the run that taught us why

**Read when:** changing `scripts/test-release.mjs`, or trying to work out why a
failed gate cannot be adjudicated.

### What happened, at the v0.17.0 gate

`test-release.mjs` wrote to one file, `node_modules/.cache/matrix.log`, and
started with `rmSync(LOG, { force: true })`. Correct for a single run. The gate
is **not** a single run — since v0.14.0 it runs **twice, once per flag shape**,
because neither shape subsumes the other.

So the sequence was:

1. the accounts-**OFF** matrix ran for 90.7 minutes and came back **red**: 3
   firefox failures, 1 webkit, `MATRIX FAILED — promotion is blocked`;
2. the accounts-**ON** matrix started immediately afterwards, as designed;
3. its first act was `rmSync(matrix.log)`.

By the time anyone read the summary, **the log naming those four tests was
gone.** `test-results/` was gone too — Playwright clears it at the start of its
next run — so the screenshots, traces and error contexts went with it. What
survived was the tally: *four failures, somewhere, in two browsers.*

⚠️ **THAT IS UNADJUDICABLE, AND UNADJUDICABLE MEANS RE-RUN.** The documented
arbiter for "is this failure real" is a serial re-run of *the failing tests*
(CLAUDE.md → Testing). You cannot re-run tests you cannot name. The only
remaining move was to re-run the entire 90-minute shape — the exact cost the
logging was supposed to avoid.

⚠️ **AND THE MEMORY TRACES HAD THE IDENTICAL BUG.** `freemem-<project>.txt` is
keyed by PROJECT, not by run, so the ON run's `freemem-firefox.txt` overwrote
the OFF run's. The trough is the number that decides whether a failure was a
starved browser or a real defect — the single most important piece of evidence
for a red matrix — and it was overwritten by the run that came next.

### The fix

Every run gets a unique name, and nothing is ever cleared:

```
node_modules/.cache/matrix-off-20260818-162210.log
node_modules/.cache/matrix-off-20260818-162210.json
node_modules/.cache/freemem-off-20260818-162210-firefox.txt
```

- **The shape is in the name, not just the timestamp.** "Which run was this?" is
  asked months later, from a filename. `matrix-off-…` answers it; two timestamps
  do not. `SHAPE` is derived from `PUBLIC_AUTH_ENABLED` — the same variable the
  gate branches on — so the label cannot disagree with what actually ran.
- **`rmSync(LOG)` is gone.** A unique name has nothing to clear, and clearing
  anything is what caused this.
- **The path is printed on the green path too**, not only on failure. A
  promotion should record which two runs it rested on, and `matrix.log` could
  never identify either.

⚠️ **THERE IS DELIBERATELY NO PRUNING.** Adding a deleter immediately after
fixing a deletion bug is how the bug comes back wearing a different hat. The
files live in `node_modules/.cache`, which is gitignored and disposable; a run
costs a few hundred KB. If the directory ever genuinely needs bounding, bound it
by age in a separate, obvious step — never inside the script that writes them.

### The general lesson

⚠️ **A LOG THAT A LATER RUN CAN ERASE IS NOT EVIDENCE, IT IS A CONVENIENCE.**
The failure mode is silent and perfectly timed: it destroys exactly the run you
needed, at exactly the moment you needed it, because the thing that destroys it
is the next step of the same procedure. Anything this repository writes to
diagnose a failure — logs, traces, memory samples, JSON reports — is named per
run, or it is not diagnostic.

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

### ⚠️⚠️ THE HYDRATION RACE — WHERE THAT RULE FAILED, THREE GATES RUNNING (2026-08-21)

The rule above is a filter for false positives. **It has no power against a race
that load merely WIDENS**, and this is the case that proved it.

**The symptom.** `play.spec.ts` reported one flaky test at each of three
consecutive gates. A different test each time — `:307` legality across plies,
`:153` typed focus, `:111` pointer focus — which is this project's own
definition of non-deterministic. Every serial `--workers=1` re-run passed, once
in **997 ms** against a 60 s timeout. It was written off as contention three
times.

⚠️ **THE "AREA" WAS A MIRAGE.** Two of the three failures were not in the
behaviour their test names describe: they failed inside `startGame()`, at the
shared wait for `data-phase="playing"`, before reaching any assertion of their
own. Reading the test NAMES suggested a focus-modality problem in
`useMoveSource.ts`; reading the STACKS said the tests had nothing in common but
their helper.

**What it actually was.** The setup form is server-rendered, and the island is
`client:visible`. Between the HTML arriving and Preact attaching, the start
button is markup with no handler. A click in that window does **nothing** — no
start, no error, no acknowledgement.

⚠️ **THE ONE LINE THAT SETTLED IT WAS IN THE ARTEFACT ALL ALONG.** The captured
page state showed `data-phase="setup"` with the error alert **EMPTY**. The
load-failure path cannot produce that: it sets `loadError` *before* returning to
`setup`, and the alert renders text. Empty alert ⇒ `start()` never ran ⇒ the
click was swallowed. `error-context.md` had said so at every gate.

**Reproduction, and why the first two attempts found nothing.**

| attempt | result | why |
|---|---|---|
| 15 rounds, one page reused | 0 failures | the island chunk is cached after round 1; the race needs a cold fetch |
| 15 rounds, fresh context each | 0 failures | Playwright's own actionability wait (~tens of ms) usually covers a ~500 ms hydration |
| `play.spec.ts --repeat-each=3` | **1 in 60** | the real thing, at its real rate — too rare to iterate against |
| **island JS delayed 4 s via `page.route`** | **100%** | the window is forced open; the race becomes an ordinary assertion |

⚠️ **FORCE THE WINDOW OPEN RATHER THAN CHASING THE RATE.** Throttling the chunk
turned a 1-in-60 ghost into something that fails every time and can be watched
to fail — which is also what made a regression test possible.

**What the same experiment proved about the helper.** `openPlay()` waited for
`data-phase="setup"`, which is in the SERVER's HTML — so it proves the document
arrived and nothing more. With hydration delayed it returned with the island
still un-hydrated and its click was swallowed too. ⚠️ **THE SEVENTEEN TESTS
USING IT WERE NOT PROTECTED, ONLY LUCKIER** than the three that called
`page.goto` directly: a scroll plus one locator round-trip bought a few tens of
milliseconds, and that accident was the entire difference.

**It is a READER's defect first.** With hydration late, a human pressing
"Commencer la partie" is ignored, and nothing on screen changes. Only a fast
local build hides it.

**The fix, both halves.**

- `PlayView` exposes `data-ready`, false until a mount effect sets it — the same
  convention as the exercise board — and the start button and both radio
  fieldsets are `disabled` until then. ⚠️ **The radios were the half nearly
  missed**: disabling only the button leaves the choices live, and a colour
  picked before hydration is discarded when Preact attaches, snapping back to
  "Les blancs" under the reader's hand. Visible rather than silent, so milder —
  but a form is either working or it is not.
- `openPlay()` waits on `data-ready="true"`, and the three tests that skipped
  it now use it.

⚠️ **THE REGRESSION TEST THROTTLES THE CHUNK ON PURPOSE.** Without that the
window is too narrow to observe, which is exactly how this survived three
gates. It was watched to fail on the un-fixed component first (`Received: ""` —
no such attribute).

**The lesson, and it is the general one:** *passing serially is not a clean bill
of health.* A hydration race, a resource race and machine contention share one
signature. The re-run cannot separate them; **the artefact can**.

⚠️ **NOT AUDITED: the exercise and replay islands.** They are the same shape —
server-rendered controls inside a `client:visible` island — and were not checked
in this session. Assume the defect until measured.

> ⚠️ **MEASURED IN v0.20.0, AND THE ASSUMPTION WAS RIGHT: 560 CONTROLS ON 132
> PAGES.** The replayer's launch button, its transport controls and every
> move-list button on every trap and lesson, plus the exercise hint button. The
> rule "no control inside a hydrating island may look usable before it is" was
> already written down at the time — it had been applied to the one control a
> flaking test happened to point at, and to nothing else. It is now **Critical
> Feature 76** and a build step, `scripts/check-island-controls.mjs`, which
> reads `dist/` and was watched to fail (560/132) before it was allowed to
> pass. **➡️ The per-island audit:
> [`board.md`](./board.md#️-island-readiness--the-per-island-audit-v0200).**
>
> ⚠️ **AND THE SECOND HALF OF THE LESSON: NO TEST WAS FAILING, AND NONE COULD.**
> Every spec waits for something a reader does not have. The suite is
> structurally blind to this class of defect, which is why enforcement is a
> check against the artefact and not another spec.

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
   ⚠️ **AND `<cg-board>` DOES NOT IMPLY `data-ready`, IN ANY VIEW.**
   `BoardSurface` is a **child**, and child effects run first, so the board
   element appears a render BEFORE the parent view publishes its readiness.
   Since v0.20.0 every view's controls ship `disabled` until that attribute
   flips (Critical Feature 76), so the gap is now observable rather than
   theoretical: a spec that waits only on the board can read a control that is
   still disabled. Wait on the declared signal, never on a proxy for it.
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

---

## ⚠️ The matrix runs one project at a time, under a worker cap

**Read when:** a red `test:release`, or before changing `scripts/test-release.mjs`
or its worker count. Moved out of CLAUDE.md at v0.17.1; the caps and the
"expected to be green" rule stay there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

#### ⚠️ THE MATRIX RUNS ONE PROJECT AT A TIME, UNDER A WORKER CAP

`test:release` runs each project on its own, sequentially, at **three** workers.
That is slower than one pooled run and it is the reason the gate is green: the
red gates were **memory exhaustion**, not browser bugs and not test bugs.

- ⚠️ **`--workers=3` IS NOT A TUNING KNOB.** Three is roughly half the peak
  memory. Raising it towards six reintroduces the entire problem.
- ⚠️ **DO NOT "FIX" A RED MATRIX BY RAISING TIMEOUTS.** Tried; the failure count
  went **up**. A starved browser given longer to answer is still starved.
- ⚠️ **EVERY RUN KEEPS ITS OWN LOG** — `matrix-<shape>-<stamp>.log`, never a
  shared `matrix.log`. The gate runs TWICE, and the second run used to delete
  the first's evidence on startup; four unadjudicable failures and a 90-minute
  re-run is what that cost. The memory traces are namespaced the same way.
- ⚠️ **A GATE THAT IS EXPECTED TO BE RED IS WORTH NOTHING.** v0.11.0 shipped on
  4 waved-through failures and v0.11.1 on 7. Both diagnoses were right, and that
  habit is exactly what lets a real regression through.
- **It proves every project actually ran**, comparing counts project against
  project — "is the total a multiple of five" passes on four projects of 100 and
  one of 0.
- ⚠️ **The alternatives were MEASURED** and the numbers are in
  `scripts/test-release.mjs` → MEASUREMENTS. Re-measure before re-arguing.

---

## ⚠️ Why the matrix does not run on a feature branch

**Read when:** tempted to run `test:release` outside a promotion, or wondering
what the old "critical path" trigger was. Moved out of CLAUDE.md at v0.17.1; the
rule and the amendment clause stay there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

#### ⚠️ DO NOT RUN THE MATRIX ON A FEATURE BRANCH. EVER. NOT "TO BE SAFE".

The reasoning is already done, so it is not re-litigated:

- **The matrix answers exactly one question** — does this work in Firefox and
  WebKit. Asking it every session does not make the answer truer; it moves the
  cost from one run per release to one run per session.
- **It was costing 30-45 minutes per session** because it *felt* prudent. That
  is a tax that discourages small fixes, and unfixed small things are what a
  visitor actually sees. ⚠️ **The tax is now ~65-70 minutes per shape.**
- **A chromium failure is a failure.** If `test:branch` fails, fix it.
- **A chromium pass is enough to merge to `dev`.** Nothing reaches a reader
  without passing `test:release` first.

---

## ⚠️ The "critical path" trigger is gone, and its removal is the point

**Read when:** proposing any rule that forces the matrix on a subsystem. Moved out
of CLAUDE.md at v0.17.1; the amendment clause stays there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

#### ⚠️ THE "CRITICAL PATH" TRIGGER IS GONE, AND ITS REMOVAL IS THE POINT

The old policy forced the matrix on any branch touching the board island, the
exercise validator, i18n routing or the service worker. It read as prudence and
functioned as a loophole: almost everything here touches one of those four, so
the exception quietly became the default. Those paths gained precision instead —
`scripts/spec-map.mjs` runs **seven** spec files for a `BoardSurface.tsx` change.

**If you believe you have found the exception:** change this policy in CLAUDE.md
in the same commit, with the reason. Do not make a one-off exception no future
session will know about — that is precisely how the last policy eroded.

**➡️ The measured memory numbers, the four-red-gate diagnosis and the rejected
alternatives: [`docs/reference/testing.md`](./docs/reference/testing.md).**

---

## ⚠️ `scripts/quick.mjs` refuses, it does not advise

**Read when:** changing the quick path's exclusion list or its spec mapping. Moved
out of CLAUDE.md at v0.17.1; the qualification lists stay there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

### ⚠️ The script REFUSES, it does not advise

`scripts/quick.mjs` diffs the branch against `dev` and **exits non-zero naming
any file that is out of bounds**, with the reason. The exclusion list is
enforced in code rather than written in a document nobody re-reads under time
pressure — which is the only version of this that survives a Friday afternoon.

It also picks the specs from what changed (a trap → `replayer.spec.ts`, a UI
string → smoke + nav + main menu, and `smoke.spec.ts` always). `QUICK_BASE`
overrides the comparison branch; it exists for testing the script itself.

---

## ⚠️ Symptoms that are the environment, not the application

**Read when:** a spec fails and you are about to change application code. Moved
out of CLAUDE.md at v0.17.1, which keeps the five tells and the arbiter rule.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

### ⚠️ Symptoms that are the ENVIRONMENT, not the application

Each of these has cost real debugging time. **Recognise the signature before
touching application code.** The full table — every symptom, what it actually
is, and the debugging it cost — is in the reference file; these are the tells:

- a fixed bug still "fails" and the fix is missing from `dist/` → **a stale
  preview server** (Playwright's `reuseExistingServer` skipped its own build);
- **every project fails identically** on a Critical Feature → **a stale `dist/`**;
- WebKit "target page… closed", or Firefox `RenderCompositorSWGL failed` on a
  **different test each run** → **the Windows browser dying under fan-out**;
- auth specs timing out on a **different set each run** → **Supabase's auth rate
  limit**, which is **per IP and per 5 minutes** — look at the ONE job's rate,
  not at how many jobs are running;
- `ERR_CONNECTION_REFUSED` → **read the HOST in the error**: `localhost:4321`
  is a dead preview server, `*.supabase.co` is sustained rate-limit abuse.

**A genuine failure is deterministic and fails A SERIAL RE-RUN too, and it fails
with an assertion naming a value.** WebKit and Firefox carry one local retry;
chromium has none. A run reporting `N passed, 1 flaky` on WebKit is green.

⚠️ **THE LOCAL RETRY IS NOT THE ARBITER — `--workers=1` IS.** When the
compositor has died the retry runs inside the same broken process, so it proves
nothing. Read the errors rather than counting them.

⚠️ **Never pipe the test run into `tail`** — it reports tail's exit code, so 14
failures read as "196 passed, exit 0". Redirect to a file and check the status.

⚠️ **A browser-crash row is a FINDING when it comes from `test:release`**,
which caps its workers precisely so it never reaches that state.

**➡️ The full symptom table and the diagnoses behind it:
[`docs/reference/testing.md`](./docs/reference/testing.md).**

---

## Symptoms that are the environment, not the application — the tells

**Read when:** a test run smells stale, flaky, or fails on a different set each time.

⚠️ **Moved verbatim out of CLAUDE.md at the v0.18.0 split.**
`scripts/check-split.mjs` compares normalised lines, so nothing inside the
block below may be reworded. Relative links like `./docs/reference/…` are
written from the repository root — CLAUDE.md's position, not this file's.

### ⚠️ Symptoms that are the ENVIRONMENT, not the application

Each of these has cost real debugging time. **Recognise the signature before
touching application code.** These are the tells:

- a fixed bug still "fails" and the fix is missing from `dist/` → **a stale
  preview server** (Playwright's `reuseExistingServer` skipped its own build);
- **every project fails identically** on a Critical Feature → **a stale `dist/`**;
- WebKit "target page… closed", or Firefox `RenderCompositorSWGL failed` on a
  **different test each run** → **the Windows browser dying under fan-out**;
- auth specs timing out on a **different set each run** → **Supabase's auth rate
  limit**, which is **per IP and per 5 minutes** — look at the ONE job's rate,
  not at how many jobs are running;
- `ERR_CONNECTION_REFUSED` → **read the HOST in the error**: `localhost:4321`
  is a dead preview server, `*.supabase.co` is sustained rate-limit abuse.

**A genuine failure is deterministic and fails A SERIAL RE-RUN too, and it fails
with an assertion naming a value.** ⚠️ **THE LOCAL RETRY IS NOT THE ARBITER —
`--workers=1` IS**; when the compositor has died the retry runs inside the same
broken process. ⚠️ **Never pipe the test run into `tail`** — it reports tail's
exit code, so 14 failures read as "196 passed, exit 0". ⚠️ **A browser-crash row
is a FINDING when it comes from `test:release`.**

**➡️ The full symptom table and the diagnoses behind it:
[`docs/reference/testing.md`](./docs/reference/testing.md).**


---

## Driving a board from a spec — the four gates

**Read when:** writing or debugging any spec that moves a piece.

⚠️ **Moved verbatim out of CLAUDE.md at the v0.18.0 split.**
`scripts/check-split.mjs` compares normalised lines, so nothing inside the
block below may be reworded. Relative links like `./docs/reference/…` are
written from the repository root — CLAUDE.md's position, not this file's.

### ⚠️ Driving a board from a spec — the four gates

**Scroll it into view** (`block: 'center'`, never `scrollIntoViewIfNeeded`),
**wait on `<cg-board>`** (not `[data-testid]`, which Astro server-renders),
**wait on `data-ready="true"` and `data-busy="false"`**, and **press for a
DURATION** — measured **1/8 solved at 0ms against 8/8 at 60ms**. Use
`movePiece()` from `tests/e2e/helpers/board.ts`.

⚠️ **Test the pointer path BY POINTER.** Every exercise spec that solved by
typing into `MoveInput` bypassed Chessground entirely and would stay green if
the board refused every tap.

⚠️ **Never assert a short-lived class with a MutationObserver alone**, and
⚠️ **every axe check on a reveal-bearing page must call `settleReveals(page)`**
— a `[data-reveal]` element is transparent text axe can still find, so it
presents as flakiness rather than breakage.

⚠️ **`play.spec.ts` runs ONE AT A TIME** — every test boots a real engine with
64 MiB of linear memory.

**➡️ Each gate in full, with the measurements and the false positives it
produced: [`docs/reference/testing.md`](./docs/reference/testing.md).**


---

## Why the gate runs twice — once per flag shape

**Read when:** promoting a release, or wondering whether one matrix run is enough.

⚠️ **Moved verbatim out of CLAUDE.md at the v0.18.0 split.**
`scripts/check-split.mjs` compares normalised lines, so nothing inside the
block below may be reworded. Relative links like `./docs/reference/…` are
written from the repository root — CLAUDE.md's position, not this file's.

#### ⚠️⚠️ THE GATE RUNS TWICE — ONCE PER FLAG SHAPE (v0.14.0)

The old policy ran the matrix once, on the default build, because that was "what
production ships". **That premise is false**: production serves the accounts-**ON**
build, and the default matrix skips every auth spec — so the whole account stack
was reaching production with **chromium coverage only**.

Neither shape subsumes the other. **OFF** is the only shape that can prove
Critical Feature 18 (`auth-disabled.spec.ts`: no route emitted, no Supabase ref
in the bundle); **ON** is the only shape that exercises `/connexion/`,
`/auth/callback/`, `/bienvenue/`, `/compte/` and `/admin*` at all.

⚠️ **THE ON MATRIX HAMMERS SUPABASE'S AUTH RATE LIMIT** — five projects at ~40
magic-link verifications each. A project the limit takes out is **re-run on its
own**, never waved through.

⚠️ **IF THE FLAG EVER GOES BACK OFF IN PRODUCTION, THE SECOND RUN GOES WITH IT**
— recorded so a future session can remove it honestly rather than deleting a
cost whose reason nobody remembers.


---

## Why the matrix runs one project at a time, under a worker cap

**Read when:** a matrix run goes red, or before changing `--workers`, a timeout, or where the logs live.

⚠️ **Moved verbatim out of CLAUDE.md at the v0.18.0 split.**
`scripts/check-split.mjs` compares normalised lines, so nothing inside the
block below may be reworded. Relative links like `./docs/reference/…` are
written from the repository root — CLAUDE.md's position, not this file's.

#### ⚠️ THE MATRIX RUNS ONE PROJECT AT A TIME, UNDER A WORKER CAP

`test:release` runs each project on its own, sequentially, at **three** workers.
That is slower than one pooled run and it is the reason the gate is green: the red
gates were **memory exhaustion**, not browser bugs and not test bugs.

- ⚠️ **`--workers=3` IS NOT A TUNING KNOB**, and ⚠️ **DO NOT "FIX" A RED MATRIX BY
  RAISING TIMEOUTS** — tried, and the failure count went **up**.
- ⚠️ **EVERY RUN KEEPS ITS OWN LOG** — `matrix-<shape>-<stamp>.log`, never a shared
  `matrix.log`, and the memory traces are namespaced the same way. The gate runs
  TWICE and the second run must not erase the first's evidence.
  ⚠️ **AND THEY LIVE IN `gate-logs/`, NEVER UNDER `node_modules/`** — gitignored
  but real. They were in `node_modules/.cache`, which `npm ci` deletes outright:
  three failures awaiting adjudication went with the old machine's
  `node_modules/` and cost a ~4.8-hour re-run of both shapes to replace.
- ⚠️ **A TROUGH UNDER ~2 GB MEANS THE BROWSER WAS STARVED, AND THE FAILURES WILL
  BE BARE TIMEOUTS NAMING NO VALUE.** On a machine with a heavy background
  baseline this manufactures failures that cost an arbiter pass each. Quiet the
  machine first — **[`docs/SETUP-NEW-MACHINE.md`](./docs/SETUP-NEW-MACHINE.md)
  §9a** measures what to close. `--workers=3` is not the knob.
- ⚠️ **A GATE THAT IS EXPECTED TO BE RED IS WORTH NOTHING.** A red matrix is a
  finding to chase, never a known flake to wave through.
- **It proves every project actually ran**, comparing counts project against
  project.
- ⚠️ **The alternatives were MEASURED** — `scripts/test-release.mjs` →
  MEASUREMENTS. Re-measure before re-arguing.


---

## The "critical path" matrix trigger, and why it was removed

**Read when:** you believe a feature branch needs the full matrix.

⚠️ **Moved verbatim out of CLAUDE.md at the v0.18.0 split.**
`scripts/check-split.mjs` compares normalised lines, so nothing inside the
block below may be reworded. Relative links like `./docs/reference/…` are
written from the repository root — CLAUDE.md's position, not this file's.

#### ⚠️ THE "CRITICAL PATH" TRIGGER IS GONE

The old policy forced the matrix on any branch touching the board island, the
exercise validator, i18n routing or the service worker. It read as prudence and
**functioned as a loophole** — almost everything here touches one of those four.
`scripts/spec-map.mjs` gained precision instead.

**If you believe you have found the exception:** change this policy in CLAUDE.md
in the same commit, with the reason. Do not make a one-off exception no future
session will know about — that is precisely how the last policy eroded.

**➡️ The measured memory numbers, the four-red-gate diagnosis, the per-session
cost the removal bought back and the rejected alternatives:
[`docs/reference/testing.md`](./docs/reference/testing.md).**

---

## The gate audit — 4.8 hours to ~25 minutes, and what it cost in risk

**Read when:** changing `scripts/lanes.mjs`, adding a spec, arguing about the
release gate's cost, or wondering why a spec runs on one browser.

⚠️ **THE CONCLUSION FIRST, BECAUSE IT IS THE PART THAT GETS RE-LITIGATED:** the
redundancy that had produced nothing was removed, and every lane that had ever
caught a defect was kept and pinned to the engine that caught it.

### What it cost before — measured, not estimated

The v0.17.0 gate, on this machine, both flag shapes:

| project | accounts OFF | accounts ON |
|---|---|---|
| chromium | 6.0 min | 6.0 min |
| firefox | 23.2 min | **126 min** |
| webkit | **66 min** | 17.3 min |
| pixel-5 | 5.3 min | 7.5 min |
| iphone-13 | 13.7 min | 15.4 min |
| **total** | **115.6 min** | **172.1 min** |

**4.8 hours and ~6,700 test executions per release**, for a static teaching
site. ⚠️ **The firefox/webkit volatility between shapes is memory starvation,
not browser cost** — see §9a of `docs/SETUP-NEW-MACHINE.md`. It is why the
figures either side of chromium cannot be read as intrinsic.

### The three findings

**1. 29 of the 41 spec files ran IDENTICALLY in both flag shapes.** Proved by
comparing run/skip status per spec across the two recorded gate JSONs, not
inferred from duration:

| class | files | which |
|---|---|---|
| identical in both shapes | **29** | everything not listed below |
| ON only (skip entirely in OFF) | 8 | `account-deletion`, `attendance-timing`, `booking`, `child-profiles`, `family`, `onboarding`, `progress-sync`, `role-separation` |
| OFF only | 1 | `auth-disabled` |
| partial | 3 | `admin` (3 of 15), `auth` (6 of 26), `recurring-sessions` (6 of 9) |

⚠️ **So the second matrix re-ran ~3,000 tests that could not answer anything
new.** What the OFF shape uniquely proves is `auth-disabled` plus three tests in
`admin` — which is now the sliver.

**2. Four spec files never open a browser at all.** `booking` (14 tests),
`child-profiles` (7), `engine-levels` (5), `role-separation` (20) take no `page`
fixture anywhere: they are `rpc()` calls, RLS assertions and arithmetic. Between
them they spawned **255 browser contexts per release**.

**3. Chromium runs the whole suite in 7.1 minutes** — 726 passed, 20 skipped,
accounts ON, including the new `booking-ui.spec.ts`. It proves all 41 once.

### Cost per spec file — chromium, accounts ON, CPU seconds

The ten most expensive, of 1,119 s total:

| spec | ran | cpu s | | spec | ran | cpu s |
|---|---|---|---|---|---|---|
| `themes` | 51 | 81.2 | | `sound` | 25 | 54.3 |
| `progression` | 40 | 76.5 | | `theme` | 29 | 46.2 |
| `family` | 10 | 63.1 | | `onboarding` | 9 | 45.1 |
| `exercise` | 31 | 62.8 | | `play` | 20 | 44.6 |
| `mobile-app` | 63 | 60.7 | | `account-deletion` | 6 | 43.9 |

⚠️ **`pwa` is 1.8 s and `engine-levels` is 0.0 s.** Six of `pwa`'s eight tests
take `{ request }` and inspect `sw.js`, the manifest and `dist/` — it never
registers a service worker in a browser. "The service worker needs cross-browser
coverage" is an intuition that does not survive reading the file.

### The lanes, and what each is earned by

`scripts/lanes.mjs` holds them. Measured at the gate audit on a machine with
**2.5 GB free** — the bad case, deliberately:

| lane | files | measured | earned by |
|---|---|---|---|
| webkit | 12 | 5.1 min | the **"Créer" click-synthesis bug** (`956b05a`) |
| firefox | 6 | 5.6 min | the **agenda axe violation** in Gecko's a11y tree |
| iphone-13 | 5 | 3.6 min | the **tap-versus-bottom-bar collision** |
| pixel-5 | 3 | 1.1 min | the same touch surface, other engine |

Plus chromium at 7.1 min over everything, and the sliver at ~2 min.
**1,279 test executions against ~6,700 — 81% fewer.**

⚠️ **Measured GREEN end to end: 21.9 min, 1,277 passed, 0 failed**, with the
accounts-OFF sliver inside it (21 passed, 11 skipped). Troughs across the five
projects were **0.51 to 2.03 GB free** — deep in the starvation regime §9a of
[`docs/SETUP-NEW-MACHINE.md`](../SETUP-NEW-MACHINE.md) describes — so **that is
the bad case**, and a quiet machine should beat it.

### What was cut, and the risk of each

- ⚠️ **`exercise` (31), `replayer` (19), `play` (20) and `tutorial` (15) dropped
  to chromium.** This is the biggest accepted risk. Their engine-sensitive
  surface is the **board**, which stays covered on webkit and both mobile
  projects through `board-pointer`, `board-frame`, `board-affordance` and
  `nav-coords`. What is no longer covered cross-browser is each mode's verdict
  wording, attempt counting and hint UI — DOM text, low engine sensitivity.
- ⚠️ **`progression` (40) and `wayfinding` (25) lost their Firefox axe run.**
  `agenda` and `main-menu` keep one, so a Gecko-specific axe rule would still
  surface somewhere in the gate.
- ⚠️ **Evidence in both directions, stated honestly.** The last two full
  matrices found **zero** genuine cross-browser defects — every failure and
  flake was memory starvation, cleared by a serial re-run. But the matrix caught
  a real, user-facing WebKit defect **one release earlier**. The lanes keep
  exactly what produced that.

### ⚠️ THE HEURISTIC'S BLIND SPOT CANNOT BE TUNED AWAY

`scripts/check-lanes.mjs` scores each spec for layout, touch, board, media
query, animation timing, axe and font signals. It is **advisory and always exits
0**, and the reason is a fact about this repository rather than caution:

> `recurring-sessions.spec.ts` scores **zero** on every signal — and it is the
> spec that caught the Créer bug.

The score measures what a spec **asserts**. The WebKit defect lived in how the
spec **drives** the page: a plain `fill()` followed by a plain `click()`, with
no blur in between. No pattern added to that list would find it, because the
signal is not in the file. ⚠️ **A gate on this would print a green tick meaning
"the lanes are complete", which is the exact false confidence that lets the next
one through.**

⚠️ **What DOES gate is `missingLaneSpecs()`.** A lane naming a spec that does
not exist makes `testMatch` match nothing, the project runs zero tests, and the
gate goes green having proved less than it claims — the one failure mode the
lane design introduced. That is a filesystem fact, so it is checked exactly and
`test-release.mjs` refuses before a browser starts.

### ⚠️ THE AUDIT'S REAL FINDING WAS A GAP, NOT A SAVING

`booking.spec.ts` is 14 excellent tests that never open a page. So the booking
controls on `/agenda/` — **painted by script, the same surface class as the
Créer button** — shipped in v0.18.0 with **no browser test on any engine**, and
`booking.spec.ts` would have stayed green throughout.

`booking-ui.spec.ts` was written with the lanes and put in the webkit lane. It
drives the real controls: the signed-out invitation with **zero Supabase
requests**, an account with no child, a booking confirmed against the database
rather than against the button's own label, a **stale past session refusing in
words**, and — the regression it exists for — **book, cancel, book with no
reload**, so every press lands on a control the previous press rebuilt.

⚠️ **A session that shrinks a gate does not get to leave a known untested
surface behind.** That is the rule this file would want back if it were ever
lost.

### ⚠️ AN ASSERTION ON A GLOBAL TABLE IS NOT ISOLATED, AND `mode: 'serial'` DOES NOT MAKE IT SO

The first run of the new gate went red on one chromium test:
`booking.spec.ts` → *"a booking and a cancellation fire no rebuild at all"*,
**`Expected: 1868, Received: 1870`**.

It took a before/after count of `rebuild_requests` — **one log for the whole
database**. The file carries `test.describe.configure({ mode: 'serial' })`,
which serialises the tests **in that file** and nothing else:
`recurring-sessions`, `admin` and `attendance-timing` create and cancel sessions
in other files, concurrently, and every one of those *legitimately* fires a
rebuild. A serial re-run of the file passed **14/14**.

⚠️ **THE RULE WAS NEVER IN QUESTION — THE MEASUREMENT WAS.** Critical Feature 72
held throughout; a booking had written nothing. What failed was an assertion
that could not tell its own effects from everybody else's.

⚠️ **THAT IS AS EXPENSIVE AS A FLAKE AND TEACHES THE SAME LESSON.** A reader has
to rule out four other spec files by hand before believing the gate, and the
habit that forms is "re-run it". The fix was to assert the thing the rule
actually names: **the session ROW is unchanged** across the booking and the
cancellation. That is isolated by construction, and it is closer to CF72 than
the log was — the regression CF72 names is a denormalised `bookings_count` on
`sessions`, which changes the row. `select … for update` is a lock and leaves no
trace.

⚠️ **WHAT IT GIVES UP IS WRITTEN IN THE SPEC RATHER THAN HIDDEN:** an UPDATE that
wrote the same values back would fire the trigger and leave the row equal.
Nothing plausible does that — and nothing isolated could see it, because the
only witness is the global log.

**The generalisation, for the next spec that reaches for a counter:** if an
assertion reads a table that any other spec file may write, it is not isolated,
and no `describe` option will make it so. Assert on a row you created.

---

## The gate, in full — the audit that made it ~22 minutes, and the lanes

**Read when:** changing `scripts/test-release.mjs`, `scripts/lanes.mjs`,
`scripts/check-lanes.mjs` or the worker cap; adding a spec to a lane; arguing
that the matrix should run more often or differently; or diagnosing a red
matrix.

> ⚠️ Moved out of CLAUDE.md **verbatim** at the v0.20.0 split — nothing inside
> this block was reworded. The binding RULES stayed behind, under
> "⚠️ VERIFICATION POLICY"; what is here is the measurement and the incident
> behind each of them. A phrase like "see below" may point at a neighbouring
> section here or at the rule it belongs to in CLAUDE.md.

#### ⚠️⚠️ THE GATE WAS 4.8 HOURS AND IS NOW ~22 MINUTES

It used to be **five projects × every spec × both flag shapes** — ~6,700 test
executions, **measured at 115.6 min + 172.1 min = 4.8 hours**. Three
measurements from the audit ended that, and they are recorded rather than
recalled:

- ⚠️ **29 of the 41 spec files ran IDENTICALLY in both flag shapes**, proved by
  run/skip status rather than inferred. The second matrix re-ran ~3,000 tests
  that **could not answer anything new**.
- ⚠️ **Four spec files never open a browser at all** — `booking`,
  `child-profiles`, `engine-levels`, `role-separation` take no `page` fixture.
  They spawned **255 browser contexts per release** to run `rpc()` calls and
  arithmetic.
- ⚠️ **Chromium runs the WHOLE suite in 7.1 minutes** — 42 spec files, 726
  passed, 20 skipped — and proves every one of them once.

**So chromium became the backbone and the other four projects became LANES.**

#### ⚠️ THE LANES ARE PINNED TO THE ENGINE THAT CAUGHT A REAL DEFECT

`scripts/lanes.mjs` is the **one** definition — `playwright.config.ts` turns it
into `testMatch` and `scripts/check-lanes.mjs` reads it. Never a second copy.

| lane | earned by |
|---|---|
| **webkit** | the **"Créer" click-synthesis bug** (`956b05a`, one release before this): a `change` handler rewrote the submit button between mousedown and mouseup and WebKit declined to synthesise the click. Silent on Safari and every iPhone; invisible in Blink and Gecko. |
| **firefox** | the **agenda axe violation** Gecko's accessibility tree produced. |
| **iphone-13** | the **tap-versus-bottom-bar collision**. |
| **pixel-5** | the same touch surface on the other mobile engine. |

⚠️ **A SPEC JOINS A LANE FOR A NAMED REASON, NEVER "TO BE SAFE."** The default
is chromium-only, so a new spec costs one run until somebody argues otherwise.
Write the reason beside it in `lanes.mjs`.

⚠️ **THE COST IS NOT ALLOWED TO DRIFT BACK.** Measured green end to end at
**21.9 min, 1,277 passed, 0 failed** — on a machine whose troughs were **0.51 to
2.03 GB free**, i.e. deep in the starvation regime §9a describes, so this is the
BAD case rather than the good one.

#### ⚠️ THE ACCOUNTS-OFF SLIVER IS NOT A SECOND MATRIX

Exactly two specs can only be proved by an accounts-**OFF build**, because they
are claims about the **artefact** that shape produces: `auth-disabled.spec.ts`
(Critical Feature 18 — no route emitted, no Supabase ref, host or anon key
anywhere in the bundle) and `admin.spec.ts`'s *"the admin surfaces are NOT
BUILT"* describe.

⚠️ **THE SECOND BUILD IS IRREDUCIBLE — you cannot inspect an artefact you did
not produce** — and it is the whole cost: the tests themselves take seconds, on
chromium alone, because neither is engine-sensitive. `test-release.mjs` runs it
last, **after a sweep**, because the ON preview server is still listening and
`reuseExistingServer` would otherwise run the OFF specs against the ON build.

⚠️ **IF THE SLIVER RUNS ZERO TESTS THE GATE FAILS**, naming Critical Feature 18.
A gate that quietly stops proving the flag still works is the failure this whole
change could most easily have introduced.

#### ⚠️ `check-lanes.mjs` ADVISES AND MUST NEVER GATE

It scores each spec for signals a different engine could answer differently and
reports the chromium-only ones. ⚠️ **It always exits 0, and promoting it to a
build step would be actively harmful** — `recurring-sessions.spec.ts` **scores
zero** and is the spec that caught the Créer bug, because the heuristic sees
what a spec *asserts* and that defect lived in how it *drives* the page. A green
tick would read as "the lanes are complete".

⚠️ **What DOES gate is `missingLaneSpecs()`**, before a browser starts: a lane
naming a spec that does not exist makes `testMatch` match **nothing**, so the
project runs zero tests and the gate goes green having proved less than it
claims. A fact about the filesystem, checked exactly, and it refuses.

**➡️ The full audit — the per-spec costs, the flag-shape table, the four
browserless specs and why the heuristic's blind spot cannot be tuned away:
[`docs/reference/testing.md`](./docs/reference/testing.md).**

#### ⚠️ THE MATRIX RUNS ONE PROJECT AT A TIME, UNDER A WORKER CAP

`test:release` runs each project on its own, sequentially, at **three** workers.
That is slower than one pooled run and it is the reason the gate is green: the
red gates were **memory exhaustion**, not browser bugs and not test bugs.

⚠️ **`--workers=3` IS NOT A TUNING KNOB**, and ⚠️ **DO NOT "FIX" A RED MATRIX BY
RAISING TIMEOUTS** — tried, and the failure count went **up**. ⚠️ **A TROUGH
UNDER ~2 GB MEANS THE BROWSER WAS STARVED**, and the failures will be bare
timeouts naming no value; quiet the machine first
(**[`docs/SETUP-NEW-MACHINE.md`](./docs/SETUP-NEW-MACHINE.md) §9a** measures what
to close). ⚠️ **A GATE THAT IS EXPECTED TO BE RED IS WORTH NOTHING** — a red
matrix is a finding to chase, never a known flake to wave through. It also
**proves every project actually ran** — under the lanes that is "nobody ran ZERO
  and chromium is never the smaller run", because a mistyped lane matches nothing.

⚠️ **EVERY RUN KEEPS ITS OWN LOG** — `matrix-<shape>-<stamp>.log`, never a shared
`matrix.log`. The shape is in the NAME because the gate ran twice per release
until the gate audit, and the second run used to erase the first's evidence; it still
names the shape, because a log that cannot say which build it tested is not
evidence. ⚠️ **AND THEY LIVE IN `gate-logs/`, NEVER UNDER `node_modules/`**,
which `npm ci` deletes outright — that cost a ~4.8-hour re-run of both shapes
once, which is also the run that produced the numbers behind the lanes.

⚠️ **The alternatives were MEASURED** — `scripts/test-release.mjs` →
MEASUREMENTS. Re-measure before re-arguing.
#### ⚠️ DO NOT RUN THE MATRIX ON A FEATURE BRANCH. EVER. NOT "TO BE SAFE".

The reasoning is already done, so it is not re-litigated. The matrix answers
exactly one question — does this work in Firefox and WebKit — and asking it every
session does not make the answer truer, it just moves the cost from one run per
release to one per session. **A chromium failure is a failure; a chromium pass is
enough to merge to `dev`**, and nothing reaches a reader without passing
`test:release` first.

#### ⚠️ THE "CRITICAL PATH" TRIGGER IS GONE

The old policy forced the matrix on any branch touching the board island, the
exercise validator, i18n routing or the service worker. It read as prudence and
**functioned as a loophole** — almost everything here touches one of those four.
`scripts/spec-map.mjs` gained precision instead.

**If you believe you have found the exception:** change this policy in CLAUDE.md
in the same commit, with the reason. Do not make a one-off exception no future
session will know about — that is precisely how the last policy eroded.

**➡️ The measured memory numbers, the four-red-gate diagnosis, the per-session
cost the removal bought back and the rejected alternatives:
[`docs/reference/testing.md`](./docs/reference/testing.md).**

---

## Passing serially is not a clean bill — the hydration-race diagnosis in full

**Read when:** a spec flakes and the serial re-run passes; or before concluding
that any intermittent failure is machine contention.

> ⚠️ Moved out of CLAUDE.md **verbatim** at the v0.20.0 split — nothing inside
> was reworded. The rules stayed behind under "⚠️ Symptoms that are the
> ENVIRONMENT"; this is the incident and the measurement behind them.

#### ⚠️⚠️ AND THE CONVERSE HAS NOW HAPPENED: PASSING SERIALLY IS **NOT** A CLEAN BILL

`play.spec.ts` flaked at **three consecutive gates**, passed every serial
re-run, and was waved through all three times on the rule above. It was a
**real defect in the application** the whole time — a
**server-rendered control that is live-looking and inert until its island
hydrates**, so a click aimed at it did nothing at all.

⚠️ **A HYDRATION RACE HAS EXACTLY THE SIGNATURE OF CONTENTION** — it needs load
to widen the window, it moves between tests, and it evaporates under
`--workers=1`. The serial re-run cannot distinguish the two, so it must not be
the last word.

⚠️ **THE DISCRIMINATOR IS THE FAILURE ARTEFACT, NOT THE RE-RUN.** `error-context.md`
carries the page state; read it before blaming the machine. Here the error alert
was **empty**, which the load-failure path cannot produce — that one line said
"the handler never ran", and it was sitting in the artefact at every one of the
three gates.

⚠️ **AN ISLAND'S READINESS MUST BE OBSERVABLE, AND `data-ready` IS THE
CONVENTION** — every view now carries it. A wait on server-rendered markup —
`data-phase="setup"`, `[data-testid="replayer"]` — proves the HTML arrived and
**nothing about whether anything is listening**. ⚠️ **A HELPER WAITS ON
READINESS, NEVER ON A PROXY FOR IT**: `<cg-board>` is created in
`BoardSurface`'s effect, and `BoardSurface` is a **child**, so it appears a
render BEFORE the parent view publishes `data-ready`.

### ⚠️⚠️ AND THE RULE ABOVE WAS TRUE, WRITTEN DOWN, AND BROKEN ON 132 PAGES

"No control inside a hydrating island may look usable before it is" shipped as
prose one release ago, having fixed exactly the one control that a flaking test
happened to point at. The audit that followed measured the rest against `dist/`:
⚠️ **560 controls on 132 pages** — the replayer's launch button, its transport
controls and **every move-list button** on every trap and every lesson, plus the
exercise **hint** button, the one a student presses precisely when stuck.

⚠️ **NO TEST WAS FAILING, AND NONE COULD.** Every spec waits for something a
reader does not have. This is a reader's defect that the suite is structurally
blind to, and two of the three instances were found only by accident.

⚠️ **SO IT IS NOW CRITICAL FEATURE 76 AND A BUILD STEP** —
`scripts/check-island-controls.mjs`, run after `astro build`, which reads the
artefact rather than the source. ⚠️ **It was watched to FAIL first** (560/132),
then pass. A prose rule that nothing checks is a rule that is already being
broken somewhere you have not looked.

**➡️ The full symptom table and the diagnoses behind it:
[`docs/reference/testing.md`](./docs/reference/testing.md). The per-island audit
and what each view had to change: [`docs/reference/board.md`](./docs/reference/board.md).**

---

## The gate keeps its failure artefacts, and a webkit re-run needs more than one file

**Read when:** adjudicating a failing or flaky gate row, or re-running one spec
to decide whether it is real.

### ⚠️⚠️ THE ARTEFACTS SURVIVE NOW — `gate-logs/artefacts-<shape>-<stamp>/<project>/`

Playwright clears `test-results/` at the START of every run, and the gate runs
six times (five projects plus the sliver). So only the LAST run's artefacts used
to exist. Measured at the v0.20.0 gate: `test-results/` held **0 entries** after
four flaky tests across firefox and webkit.

⚠️ **That directly defeated this project's own rule.** CLAUDE.md says *"THE
DISCRIMINATOR IS THE FAILURE ARTEFACT, NOT THE RE-RUN"* — a rule adopted after
`error-context.md` was the thing that finally separated a real hydration race
from machine contention, three gates late. The gate made it impossible to follow
for every project but one, and **three consecutive gates then ended in "probably
environmental" with nothing left to check**.

`test-release.mjs` now copies each project's artefacts out of `test-results/`
immediately after that project's run, before the next one clears it.

- ⚠️ **`preserveOutput` alone is NOT the fix**, and it is the obvious one. It
  governs whether Playwright keeps output for PASSING tests; it does not stop
  the next run clearing the directory, and six runs share one directory. The
  artefacts have to LEAVE `test-results/` between runs.
- ⚠️ **The sweep was checked, not assumed.** `demo.mjs --sweep-only` runs
  between projects and the concern was that it might remove the copy. It does
  not — it kills processes and touches no files. A copy into a directory the
  next sweep deletes would be no better than what it replaced.
- ⚠️ **Namespaced by `RUN_ID`**, exactly like the logs and the memory traces,
  for the identical reason: a second run must never erase the first's evidence.
- ⚠️ **It never fails the gate.** A copy that throws — locked file, full disk —
  is reported and the run continues. Evidence-keeping must not turn a green
  matrix red or mask a real result.
- ⚠️ **THE POINTER PRINTS ON THE FAILURE PATH, and that took two goes.** The
  first version printed it only on the green path — which is exactly backwards,
  because the gate exits before it when something fails, so the path was missing
  precisely when somebody needed it. Caught by running the real script against a
  deliberate failure rather than by reading it.

### ⚠️⚠️ A ONE-FILE WEBKIT RE-RUN CANNOT REPRODUCE THE GATE'S CONTENTION

This one has already produced a wrong conclusion, at the v0.22.0 gate, and it
looks completely convincing.

`playwright.config.ts` sets **`fullyParallel: false`** on `webkit` and
`iphone-13`. That means tests **within a file** run in sequence; only FILES run
concurrently. So:

```
npx playwright test --project=webkit --workers=3 tests/e2e/one-file.spec.ts
   -> "Running 6 tests using 1 worker"
```

⚠️ **`--workers=3` is silently irrelevant there.** One file is one worker no
matter what the flag says, so the re-run is SERIAL — which is the arbiter this
project has already learned not to trust on its own ("passing serially is not a
clean bill"). At the v0.22.0 gate that re-run was very nearly reported as strong
evidence that a flaky row was environmental.

**To reproduce the gate's conditions on webkit, pass SEVERAL spec files:**

```
PUBLIC_AUTH_ENABLED=true npx playwright test --project=webkit --workers=3 \
  tests/e2e/account-deletion.spec.ts tests/e2e/family.spec.ts \
  tests/e2e/onboarding.spec.ts tests/e2e/auth.spec.ts
```

⚠️ **And read the artefact first regardless.** Since the fix above, the evidence
is in `gate-logs/artefacts-*/`, and it answers the question a re-run only
circles around.

---

## ⚠️⚠️ THE SHARED TEST PROJECT NEEDS SERIALISED ACCESS — AND NOTHING SAID SO

**Read when:** parallelising ANY test run, adding a CI job, or removing the
per-project serialisation in `test-release.mjs`. Also when a suite fails
instantly with a purge or residue error.

### The guarantee, stated at last

**There is exactly ONE test Supabase project, and the suite assumes it has that
project to itself for the whole run.** Two things enforce that assumption and
both are destructive:

- `tests/e2e/global-setup.ts` purges e2e data **before** the suite, and treats
  residue as a **hard failure** — "a suite that starts from unknown state
  proves nothing about the state it ends in".
- `tests/e2e/global-teardown.ts` purges **after**.

So two concurrent runs against that project do this to each other: A's setup
deletes B's in-flight users; B's teardown deletes A's; and whichever starts
second sees the first's users as *residue* and dies **before a single test
runs**.

### ⚠️ WHY NOBODY KNEW: `test-release.mjs` PROVIDED IT BY ACCIDENT

The local matrix runs the five projects **one at a time**, and every line of
reasoning written about that says **memory** — 80 processes, 6.68 GB, four red
gates, the measured worker cap. All true, and all beside this point.

Running them one at a time also meant **only one run ever touched the Supabase
project at a time**. That was never the reason for the serialisation, was never
written down, and was load-bearing anyway. It is the classic shape of an
invisible dependency: a constraint satisfied as a side effect of a decision
taken for something else entirely.

⚠️ **It became visible the moment CI parallelised the projects**, which was
correct on the memory argument — each GitHub runner has its own RAM, so the
reason for serialising is genuinely absent there — and wrong on a guarantee
nobody had recorded. Measured, at gate run #2: `webkit` failed in **32 seconds**,
before any test, while `iphone-13` — **the same browser** — passed in 310s. Not
a browser problem; a landlord problem.

### The fix, and why it needed no code

`helpers/purge.ts` matches users by an **exact email domain**
(`u.email.endsWith('@' + env.emailDomain)`), and `e2eEmail()` mints addresses on
that same domain. So a **per-job `E2E_EMAIL_DOMAIN`** partitions the project:
each run only ever sees, and only ever deletes, its own users.

`.github/workflows/gate.yml` writes `E2E_EMAIL_DOMAIN=<job>.mcc-e2e.test` into
the `.env.test` it generates. These are `.test` addresses that nothing delivers
to — users are created and magic links minted through the admin API — so a
subdomain costs nothing and needs to resolve nowhere.

### ⚠️ THE RULE FOR THE NEXT PERSON

**Anything that runs the suite concurrently must either serialise access to the
test project or give each concurrent run its own `E2E_EMAIL_DOMAIN`.** The
failure mode if you forget is not subtle — it is an instant, confusing death in
whichever run started second.

### ⚠️⚠️ AND THE DOMAIN ONLY COVERS *USERS* — SESSIONS ARE STILL SHARED

The paragraph above originally ended "there is no third option", which read as
though a per-job domain isolated the whole project. **It isolates users.**
`sessions` rows have no owner column, so nothing about them is scoped by email
domain at all, and `purgeLeakedSessions()` deletes every bare row **globally**,
in both phases of **every** run.

That is a second collision, and it took two red gates to see because it wears a
completely different mask:

- `booking.spec.ts` creates **bare** sessions (no title, no notes) at runtime
  and deletes them by id when it finishes. It runs in **chromium only**.
- `booking-ui.spec.ts` drives the **baked** agenda (Critical Feature 49), so it
  books whatever the build captured — including another job's in-flight row.
  It runs in **chromium and webkit**.
- Split into separate jobs, webkit's build can bake one of chromium's transient
  sessions. chromium deletes it. webkit presses Réserver. The database answers
  truthfully that the session is gone.

⚠️ **IT PRESENTED AS A WEBKIT BUG AND WAS NOT ONE.** webkit-only, both booking
tests, all three attempts, chromium green on the same specs — the exact profile
of the "Créer" click-synthesis defect. **The click reached the handler and the
refusal was correct**; the page said « Cette séance n'existe plus. » the whole
time. ⚠️ **The `error-context.md` snapshot is what settled it**, which is the
second time this release that reading the artefact beat reasoning about the
symptom.

**The fix is in `bookablePanel()`:** never book a row that matches the purge
predicate. A seeded session says something in at least one of `title_fr`,
`note_fr`, `note_en`; a transient one says nothing in any of them.
⚠️ **Those two places are one rule in two files — change one and change the
other.**

⚠️ **THE GENERAL LESSON: ask what ELSE the shared project holds.** Users were
isolated and the job was declared done. Sessions, and anything else added later
without an owner, were not.

---

## ⚠️ THE AUTH RATE LIMIT IS PER PROJECT, NOT PER DOMAIN

**Read when:** auth specs fail across several jobs or several files at once,
especially with bare navigation timeouts and a different set each run.

Per-job email domains fix the PURGE collision above. They do **nothing** for
this, and the two are easy to confuse because both appear when runs go parallel.

### ⚠️ WHAT IS MEASURED — AND WHAT THE FIRST VERSION OF THIS SECTION GOT WRONG

The first version said the ceiling was **"22 verifications in 7 seconds,
clearing a couple of minutes later, enforced per IP and per project"**, as if
that one figure described the whole limit. **It describes the ONSET of a cold
burst and nothing else**, and gate run #5 disproved the rest of the sentence
within a day.

**MEASURED:**

- **ONSET** — ~22 verifications in ~7s returns
  `{"code":429,"error_code":"over_request_rate_limit"}`, with **no
  `Retry-After`**. An isolated probe cleared in ~2 minutes.
- **RECOVERY IS LONGER THAN 40s UNDER SUITE LOAD** — `followMagicLink()` backs
  off 0/10s/30s and **exhausts with the project still limited**. Observed at
  gate run #5 and reproduced locally twice on 2026-08-25.
- **THE SUSTAINED LOAD THAT CROSSED IT** — chromium runs **168** auth tests and
  webkit **89**. Concurrently that is **~257 verifications in ~14 minutes
  (~18/min)**. It failed at run #5 and survived at runs #3 and #4, which is what
  a threshold looks like from underneath.

**THE SCOPE — SETTLED, AND IT REVERSED THE CONCLUSION:**

⚠️⚠️ **THE LIMIT IS PER IP ADDRESS. The Supabase dashboard says so on the
setting itself**, which is where nobody looked while there was a theory to
support instead. The window and the budget are named there too:
**"Rate limit for token verifications", 30 per 5 minutes by default.**

**What that means, and why the first fix was aimed at the wrong thing:**

- **Two runners are two IPs and two buckets.** chromium and webkit were
  **never contending with each other.** Each was independently over the old
  default on its own — chromium peaks near **65** verifications per 5 minutes
  and webkit near **45**, against a ceiling of **30**.
- So runs #3 and #4 were over the line as well and survived on **Playwright's
  retries**; run #5 did not. That is retry luck, **not** a concurrency
  threshold.
- ⚠️ **Merging the two lanes into one job therefore fixed nothing that was
  broken.** It reduced project-wide concurrency, which a per-IP limit does not
  measure, and cost **9m 33s** of gate wall-clock. It was reverted.
- **The ceiling was the whole fix:** token verifications raised to **300 per 5
  minutes** on the TEST project, ~4.6× chromium's peak.

⚠️ **SO THE THING TO WATCH IS ONE JOB'S RATE, NEVER HOW MANY JOBS RUN.** A
single lane that grows enough auth specs can exhaust its own bucket with
nothing else running anywhere.

**Still unmeasured:** the highest sustained rate that is actually safe. 300 is
headroom over a measured peak, not a probed ceiling.

⚠️⚠️ **THE LESSON IS NOT ABOUT SUPABASE.** A figure was recorded without its
method, propagated to **six files**, and then a fix was designed against the
half of it that had never been checked — while the answer was printed on the
dashboard beside the setting. **Read the source of a limit before modelling
it.**

**Every signed-in spec mints its own account and verifies its own magic link**,
so the verification rate is roughly the number of concurrent workers across
every runner pointed at that project.

### How to recognise it

⚠️ **It does not look like a rate limit.** It looks like plain navigation
timeouts, on a **different set of tests every run**, all of which pass when the
file is run on its own. `ERR_CONNECTION_REFUSED` is read by its HOST:
`localhost:4321` is a dead preview server, `*.supabase.co` is this.

### What is already done, and what to do next

- **Locally:** `test-branch.mjs` caps auth-heavy selections at `--workers=2` —
  about a third of the verification rate six workers produce, which is the
  difference between green and red.
- **In CI:** `playwright.config.ts` sets `workers: 1` when `process.env.CI` is
  set, which keeps each job far below the ceiling on its own.
- ⚠️ **The remaining exposure is jobs running at the same time.** Four or five
  CI jobs each at one worker is well inside the ceiling today; it is not a
  guarantee, and it scales with however many jobs are added later.
- **If it fires: SERIALISE THE AUTH-HEAVY JOBS.** In the workflow that means a
  `max-parallel` on the matrix, or moving `SCRIPTED_FORMS`-carrying projects
  into a dependent stage. ⚠️ **Do NOT widen the email domains further** — that
  addresses the other problem and will look like it is not working.
- ⚠️ **The real fix is a bigger rate limit on the TEST project**, which is a
  dashboard setting and is already an open backlog item. Mitigation is not
  headroom.
