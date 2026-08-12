# Reference — the incidents behind the rules

**Read when:** you are about to argue that a rule in CLAUDE.md is over-cautious,
or when a symptom here matches what you are seeing.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

Every rule in CLAUDE.md that reads as paranoid was paid for. This file is the
index: what happened, what it cost, and which rule came out of it. Where the
story is inseparable from the technical detail it produced, the full narrative
lives in that area's reference file and this page links to it rather than
keeping a second copy that would drift.

⚠️ **The pattern worth internalising is not any single incident.** It is that
**most of these failed silently, and several looked green.** A build that shipped
the anon key while proving it did not; twelve borders that had not rendered for
months; eleven comments attached to the wrong move; a card that rendered
perfectly and did nothing. The rules that feel excessive are the ones that make
those states loud.

---

## Silent failures — nothing errored, nothing was red

| What happened | Cost | Rule |
|---|---|---|
| **An unknown custom property killed a declaration.** `--mcc-border` (12 borderless elements, 7 files), `--font-mono` (every lesson's inline notation set in Inter, from the commit that introduced lessons). Both invalid at computed-value time: no error, no warning | months of shipping wrong | Assert the **resolved** value, never that a rule exists — CLAUDE.md § board, detail in [`board.md`](./board.md) and [`theming.md`](./theming.md) |
| **`import.meta.env['X']` emitted the whole env object**, putting the production Supabase JWT into the build whose entire purpose was proving accounts were disabled. Nothing was exploitable; the *guarantee was false while looking true* | found only by reading `dist/` | Critical Feature 19 — dot access only. [`supabase.md`](./supabase.md) |
| **`getStaticPaths()` returning `[]` shipped 216 KB of unreachable Supabase**, precached — Astro collects `<script>` blocks from the module graph, not from what renders | every first visit paid for a switched-off feature | Alias the module in `astro.config.mjs`. [`supabase.md`](./supabase.md) |
| **An index card rendered fully and did nothing when clicked.** Nothing was *missing* from the page, so nothing failed | shipped | Critical Feature 32 — `href` required, and the spec asserts it resolves 200. [`progression.md`](./progression.md) |
| **`/progres/` was reachable from the mobile bar and from nothing at all on desktop.** It built, rendered and passed every one of its own specs | shipped | Critical Feature 36 — and the spec reads the list **off the bar**, never hard-coded. [`ui-navigation.md`](./ui-navigation.md) |
| **`opacity: 0.9` on text over a contrast-audited fill** dropped a proved pair to 4.42:1. The auditor cannot see an alpha applied on top of a pair it has proved | Lighthouse 100 → 96, whole Playwright suite green | Never `opacity` on text over an audited fill. [`ui-navigation.md`](./ui-navigation.md) |
| **`background-size` cycling** rendered Souiri's board as one giant 2×2 checker. It survived a screenshot review, because a giant checker still reads as "a chessboard" until you count the squares | — | Never rely on positional `background-*` lists when a layer comes from a theme variable. [`theming.md`](./theming.md) |
| **A monochrome piece set on a dark board measured 1.03:1.** No declared colour was wrong and every contrast assertion passed | found by looking at a screenshot | Piece sets are audited against their theme's board. [`theming.md`](./theming.md) |
| **`package.json` `version` said `0.2.0` for three releases** (v0.3.0, v0.4.0, v0.5.0), because nothing named the file and nothing checked it | tags and manifest disagreed | The bump is part of the **release commit** — CLAUDE.md § Promotion routine |
| **CLAUDE.md reached 247 KB**, past which its tail was no longer read: rules present in the repository and absent from the session | unknown — by construction | The size guard, CLAUDE.md § The size guard |

---

## Content that passed every check and was wrong anyway

**Content batch 3 shipped four positions** that were legal, six-field, with legal
solutions and in-range plies — and each described a mechanism the position did not
contain. A "pin" blocked by the d7 pawn (the knight had five legal moves); a
bishop aiming "through" a screen along a diagonal that is not a diagonal; a fork
whose forking piece was simply captured by a pawn; a mate that was not mate. Two
of them were the exact beginner misconceptions the lesson existed to teach
*against*.

**A separate batch used 1-based ply numbering throughout.** Two comments
overflowed the PGN and failed the build; **eleven attached silently to the wrong
move** — "the knight comes out and attacks e5" rendered on Black's reply. It looks
completely normal on the page.

→ Rules: the ply-0 box and the claims system, CLAUDE.md § Content model; detail in
[`content.md`](./content.md).

---

## Environment failures that looked exactly like application bugs

| Signature | What it really was |
|---|---|
| A fixed bug keeps "failing"; the fix is in the source | **A stale preview server.** Playwright's `reuseExistingServer` skipped its own build; `astro preview` had also moved quietly to 4322 |
| **All five projects fail identically** on a Critical Feature (the WhatsApp share link "missing" everywhere) | **A stale `dist/`** from an experiment. Reverting source does not rebuild |
| A tutorial board "refuses every pointer move" — and it **bisected clean to a tree that had already shipped green** | **A 0ms `click()`**: mousedown and mouseup in one animation frame. Measured 1/8 solved at 0ms, 8/8 at 60ms. Driven at any human pace the board was always fine |
| "Course exercises are not playable" | **The harness scrolling the board half off-screen** — `scrollIntoViewIfNeeded()` guarantees only *partly* visible |
| Five specs across four projects fail, all pass serially on a clear machine | **~60 orphaned Playwright browsers** left by a killed matrix. Three red gates in a row, none of them a defect |
| A WebKit spec fails on a short-lived class, passes at `--workers=1` | **A racy test**, not the documented WebKit flake: a MutationObserver callback re-querying the live DOM after the window closed |
| A flaky `color-contrast` violation on an index page | **Scroll reveals at `opacity: 0`** — transparent text axe can still find |

Also found on this machine: **26 orphaned `astro preview --port 4399` processes**
for this repo, outside every swept port range, and one preview that had run for
**4h28m**.

→ Rules and signatures: CLAUDE.md § Symptoms that are the ENVIRONMENT; detail in
[`testing.md`](./testing.md) and [`dev-environment.md`](./dev-environment.md).

---

## Decisions that were measured rather than argued

- **Three engine levels were one opponent.** Débutant, Intermédiaire and Avancé
  each scored 97–100% against both reference bots; Seàn had not won a single game
  against *Débutant*. `Skill Level` cannot fix it — at skill 0 / depth 2 the engine
  played its top choice in 23 of 24 searches, making Débutant the *least* random
  preset on the ladder. → [`engine.md`](./engine.md)
- **A `2BP01` on a column drop, and a `42501` from `service_role` — twice.**
  Migration 0002 exists to repair the missing grants; 0003 reproduced the bug
  anyway, with the RLS audit passing in full. → [`supabase.md`](./supabase.md)
- **`.env.test` built from the wrong template, twice**, losing
  `SUPABASE_PRODUCTION_REF` — the interlock that stops the suite purging real
  accounts. The tell was a commented-out Umami line, which only exists in the
  build-time template. → [`supabase.md`](./supabase.md)
- **`viewOnly` is bind-time only and failing it is silent** — the board looks
  movable and ignores every drag, with no error anywhere. Cost most of a debugging
  session and every move-playing spec failing identically. → [`board.md`](./board.md)
- **A guard that fires once is defeated by any dependency that changes later.**
  `MoveInput`'s "never focus on mount" rule was defeated by `disabled` flipping
  when a lazy chunk landed; it presented as a flaky spec for months rather than as
  a bug. → [`testing.md`](./testing.md)
- **The coordinate tracks were off by exactly +24px** at every size, from
  Chessground defaults tuned for a layout we do not use. Invisible in a screenshot
  review, obvious in arithmetic. → [`board.md`](./board.md)
