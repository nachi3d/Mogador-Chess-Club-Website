# Reference — progression, points and index cards

**Read when:** touching points, ranks, achievements, the session streak, or a card on an index page.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## Progression — ranks, points, streaks, achievements (E3)

Direction: `docs/direction/mcc-direction-esthetique.md` §§ B1–B3, and the
addendum § E8 for the anti-cheat note. Everything is LOCAL: `localStorage`,
guest-first, no account anywhere in it.

| File | What it owns |
|---|---|
| `src/lib/points.ts` | **Policy.** Award values, rank thresholds, achievement shapes. Pure — an island may import it |
| `src/lib/scoreboard.ts` | **Build time.** Content → a catalogue with every award already computed. Imports `astro:content` + chess.js, so no island may touch it |
| `src/components/progress/ScoreResolver.astro` | The one computation, inline, in the first paint. Publishes `window.MCC_SCORE` and owns the toast |
| `src/lib/score.ts` | The islands' typed accessor. **It computes nothing** |
| `src/styles/score.css` | The toast, in the shared sheet rather than scoped — see the size note below |

### ⚠️ POINTS ARE DERIVED, NEVER BANKED — the rule of the whole feature

There is no `points` number in `localStorage` and there must never be one. A
total is recomputed from the work behind it every time it is read.

A stored balance is a number a student types into a console in three clicks, and
once stored the site cannot tell an earned 400 from a typed one. A derived total
is exactly as good as the records behind it: to fake it you have to fake the
solves.

Two consequences that fall out for free, and are worth knowing before anyone
"optimises" this into a cached balance:

- **No farming, with no anti-farming code.** Re-solving awards nothing because
  `solved` is a boolean. There is no "have they done this before" branch
  anywhere — `ExerciseView` shows the *delta in the total*, which is 0.
- **A multi-board lesson awards on its LAST board**, for the same reason: a
  lesson is one catalogue entry, and the delta is 0 until every key is solved.

### ⚠️ NO POLICY LIVES IN THE INLINE SCRIPT

`ScoreResolver`'s script sums numbers and compares them. Every award value,
threshold and achievement condition arrives as **data**, computed at build time
by `scoreboard.ts` from `points.ts`. The script contains no award rule and no
notion of what a mate is worth — so the policy cannot drift from what a reader
is shown, because there is no second copy of it. Same trick as `MCC_THEMES`.

What IS duplicated is the two storage keys (`mcc:progress:v1`,
`mcc:streak:v1`), because an inline script cannot import a bare specifier —
the fourth such duplication, same trade, and `progression.spec.ts` seeds both
keys directly so a divergence fails there.

### The thresholds, and why these numbers

Content today, at full marks and no hints: 13 tutorial steps × 5 = 65, 11
lessons × 10 = 110, 3 standalone exercises = 55. **230 of learning**, plus 120
from games (two counted wins at each of 5/15/40) = a 350 ceiling.

| Rank | Points | What it takes |
|---|---|---|
| Pion | 0 | arriving |
| Cavalier | 20 | four tutorial steps — ten minutes, inside the first sitting |
| Fou | 70 | the whole tutorial (65) **plus one lesson** |
| Tour | 150 | the tutorial and most of a course |
| Dame | 220 | essentially all the teaching content |

- **Cavalier at 20** is the brief's "achievable in one session" taken literally.
  It has to land in the first sitting or the ladder is invisible to the reader
  it is for.
- **Fou at 70 sits deliberately just ABOVE the finished tutorial (65).**
  Finishing the basics is the prerequisite, not a destination; one lesson
  completes the step, which says "now start learning" at the moment it is true.
- **Dame at 220 against a 230 learning ceiling** is the direction's
  non-negotiable — *un rang gagné en cliquant ne dure pas deux minutes face à un
  ado*. The 10-point gap is slack for a couple of hints, and games can cover it.
- **Dame does not require games** (230 > 220). A student who only wants to study
  can still reach the top rank.

⚠️ **These are absolute numbers and the content will grow**, so every threshold
silently gets easier. Re-tuning is expected — but it may only move in the
direction that does **not demote** anyone who already holds a rank. A rank taken
back is worse than a rank that was slightly cheap.

### ⚠️ NO DAILY STREAK. NOT NOW, NOT LATER.

**The club meets weekly.** A consecutive-day streak would break every week by
design, for every student, through no fault of theirs — it would punish exactly
the rhythm of the people it is meant to motivate. The direction doc raises the
same worry (§ B2) and this is the answer to it.

The session streak is the honest version: consecutive exercises solved with no
wrong move, in `sessionStorage` under `mcc:streak:v1`, gone when the tab closes.

- **It is never presented as a loss.** There is no "streak lost" message and
  there must not be — a reader whose move was refused is already being told;
  charging twice for one mistake teaches a beginner that trying is expensive.
  Below two it is simply not shown.
- **A re-solve extends it.** It measures this session's accuracy, not new
  ground. With sixteen solvable things on the site a streak that counted only
  firsts would be unreachable for a returning student.
- **It is never synced.** A session streak is meaningless on another device,
  which is why it lives in a store that does not outlive the tab.

### Achievements — computed, with one stored bookmark

Earned is **derived** from progress; **announced** is stored (`announced` in
`mcc:progress:v1`). Without the bookmark the toast fires again on every page
load for ever. Clearing it re-announces, which is harmless; it can never grant
anything, because it is not consulted when deciding what is earned.

The toast is `role="status"` / `aria-live="polite"` — never `alert`. Good news
arriving while a reader is mid-thought about a position must not interrupt.

⚠️ **"A trap mastered" is DELIBERATELY NOT SHIPPED.** A trap page is a
*replayer*: nothing on it records anything, because stepping through a game
someone else played is reading, not competence — and the resolver's own rule is
that opening a page leaves no trace. The only way to ship it today would be to
award it for scrubbing a replay to the end, which is precisely the "rank earned
by clicking" the direction forbids. It lands when a trap carries an exercise.
In BACKLOG.md.

### ⚠️ ANTI-CHEAT — what changes when accounts land

`localStorage` is editable in three clicks. **While points are local they are
declarative**, and the site says so on `/progres/` rather than pretending
otherwise.

> **Once accounts land (v2-S3), the balance must be computed SERVER-SIDE from
> actually-solved exercises, and never accepted from the client.** No endpoint
> may take a total, a rank or an achievement list as input. The client may send
> *what it solved*; the server decides what that is worth.

Nothing in `points.ts` may become a wire format for a client-supplied total.
This matters more than it looks: E8's shop turns points into real objects
produced by Nachi3D, and a declarative balance that buys a physical keyring is
a different problem from one that colours a badge.

The ledger already carries `origin` and `source` per entry so **teacher-awarded
points (v2-S4) are a new producer rather than a migration.** They are NOT built.

### ⚠️ An inline script on 62 pages is a size decision, not a detail

The resolver is mounted on the home page, `/progres/`, and every page with a
judged board or the engine — ~62 of 86 documents. Written in this codebase's
usual commented style the script measured **9.5 KB per page** and the catalogue
5.2 KB, for +1033 KiB of precache. That is the trap CLAUDE.md already records
for the theme head script (8.4 KB → 5.7 KB), walked into a second time.

Three things brought it to +744 KiB, and each is worth keeping:

- **the script is terse** — rationale in frontmatter, which compiles away;
- **catalogue entries carry no `i` field** and achievement conditions reference
  entries **by index**. Both alternatives (repeating progress keys inside
  conditions; giving each entry a string id) duplicated the very keys sitting
  beside them;
- **the toast CSS is in `src/styles/score.css`, not a scoped `<style>`**. Astro
  inlines a small scoped block into every document that uses it — measured at
  1.4–4.5 KB per page.

Still on the table if it needs to shrink further: serve the catalogue as one
same-origin JSON file and inline it only on the two pages that need it in the
first paint. It costs a request on board pages and was judged not worth the
complexity yet. In BACKLOG.md.

---

## ⚠️ A CARD THAT RENDERS HAS A DESTINATION — an index entry with no href is a bug

`CardItem.href` on `src/components/CardGrid.astro` is **required**. There is no
unlinked card state on `/cours/`, `/pieges/` or `/exercices/`, and there is not
going to be one.

`/cours/` shipped one. "Les bases : le plateau et les pièces" rendered the full
card — surface, title, summary, level badge — and did nothing when clicked,
because the course had no lesson pages and `href` was optional. **That is worse
than the card being absent.** An absent card tells a reader nothing is there; a
present, inert one tells them the site is broken. It is also close to invisible
to testing: nothing is *missing* from the page, so only an absence of behaviour
gives it away.

Two halves hold it now, and both are needed:

- **The type** — `href: string`, not `string | undefined`. `CardGrid`'s three
  callers cannot construct the state.
- **`tests/e2e/index-cards.spec.ts`** — every card on all three indexes, both
  locales, has a `.card-link` whose href **resolves 200**. The type binds this
  file's callers; the spec binds what a reader can click, and would catch an
  index that drew its own markup. It asserts the link resolves rather than
  merely exists, because pointing a dead card at a 404 satisfies the letter and
  nothing else. It also asserts the index is non-empty first — every assertion
  below that passes vacuously on a list with no cards, which is how this class
  of bug survives.

### A course with no lessons FAILS THE BUILD

`CoursPage.astro` throws, naming the slug and both ways out. The three options
were "render it unlinked" (the bug), "drop it silently" (content that vanishes
with no signal — the next session writes a course, sees no card, and debugs the
index) and "say so at build time". Only the last one tells the person who can
fix it, before a reader sees it.

`draft: true` is the way to park a course that is genuinely being written. It is
filtered out before the check, so the states are **openable** and **deliberately
parked**, with nothing in between.

### The `les-bases` record was removed, not linked

Deleted (`src/content/cours/les-bases.json`), and the reasoning matters because
the obvious fix was to point it at `/apprendre-les-bases/`:

- **That content IS the tutorial.** The summary named the board, how each piece
  moves, castling, en passant and promotion — which is exactly the thirteen
  steps of `/apprendre-les-bases/`, verified step by step. There was never a
  course to write; there was a duplicate index record for content that ships.
- **Linking it would put one destination on one page under two names.**
  `/cours/` already links the tutorial at the TOP, deliberately, as the named
  prerequisite (`tutorial.prerequisite`). A card titled "Les bases : le plateau
  et les pièces" pointing at the same place is the exact thing Critical Feature
  20 forbids — two names for one destination reads as two different sites.
- **Writing real lessons for it** would have meant a second, parallel copy of
  thirteen steps of shipped teaching in both locales, free to drift from the
  original, for readers who already have a better route to it.

Corroborating detail, in case anyone is tempted to restore it: it carried
`order: 1`, the same as `bien-ouvrir-une-partie`, so the course list's sort was
already ambiguous. It was a record nobody had maintained.

The tutorial keeps its own entry points — the prerequisite line here, the home
CTA and the dashboard tile — and gains nothing from a course card.

---

---

## `src/lib/progress.ts` — the single migration point

**Read when:** touching stored progress, the exercise ticks, or anything that
reads or writes `localStorage`. Moved out of CLAUDE.md at v0.17.1; the rule and
the pointer stay there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

#### `src/lib/progress.ts` — the single migration point

All of it lives behind that one module. **Nothing else in the codebase may touch `localStorage` or know the key.** If accounts ever arrive, swapping the backing store is a rewrite of that file and nothing else — the same containment trick as `BoardSurface.tsx`.

- Key: `mcc:progress:v1`. The **version is in the key**. A future shape change writes `v2` and may migrate `v1` across; it never reinterprets `v1` bytes under new rules, because a half-migrated record is worse than a lost one.
- Shape: `{ exercises: { [slug]: { solved, attempts, hintUsed, solvedAt } } }`.
- **Every access is guarded and fails silent.** Safari private mode throws on `setItem`, a full quota throws, an embedded context can throw on `localStorage` itself, and a hand-edited value can be any garbage at all. A reader whose storage is unavailable still gets a fully working exercise — just no tick on the index. There is nothing they could do about it, so we do not tell them. A bad stored value is **not deleted**: destroying a reader's data to tidy up is the wrong trade.
- Records are normalised **field by field** on read, never cast. The value came off disk and may have been written by an older build or a person with devtools open.
- `resetAttempts()` ("Recommencer") clears the counter and **never the solve**. Having solved something once is a fact about the reader; a retry button that silently takes back a tick would punish curiosity.

The solved ticks on `/exercices/` are drawn by a plain `<script>`, **not an island** — ~1 KB of vanilla JS that reads the module and removes a `hidden` attribute. The one-board-island rule is about hydrated framework components, and this must stay on the right side of that line. The card reserves the marker's height (`.card-status`), so revealing it cannot reflow the grid.
