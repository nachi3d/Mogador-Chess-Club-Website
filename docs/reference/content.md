# Reference — content authoring, claims and the tutorial

**Read when:** writing or editing a trap, lesson, exercise or tutorial step — especially any board whose caption makes a claim about the position.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

### `cours` long-form bodies → per-locale Markdown (DECIDED, not yet implemented)

Decided in Session 2. Course *bodies* will be **per-locale Markdown pairs** — `roquer-tot.fr.md` and `roquer-tot.en.md` — not more `*_fr` / `*_en` frontmatter fields.

A lesson is prose: headings, lists, diagrams, worked examples. That is what Markdown is for, and a `summary_fr`-style string field is the wrong shape for three screens of teaching. One file per language keeps each body in exactly one language, which is the same reason the rest of the content is JSON — the constraint is honoured, just at file granularity instead of field granularity.

The JSON entry stays as the course **index record** (title, level, order, summary). **Do not add body fields to the `cours` schema in the meantime.**

Lesson *ordering within* a course is still open — see the open questions. When lessons become their own documents, add a `lessons` collection with a `reference('cours')` back-link rather than reshaping this one.

### Content validity is checked, not assumed

`node scripts/check-content.mjs` replays every line through chess.js. A Zod schema proves an entry is well-*shaped*; it cannot prove it is legal chess — `"e2e5"` is a valid UCI string and an illegal move.

The script checks that PGNs parse, that note plies exist, that solutions and opponent replies interleave legally from the FEN, and that anything tagged `mat` actually ends in checkmate. As of Session 3 it also checks:

- **`onlyMove: true` is not a lie** — for a mating line of ≤ 2 player moves, that no *other* first move forces mate in the same number. See the `onlyMove` rule; this one has already fired for real.
- **the student always plays the same colour** — if `solution` and `opponentReplies` fall out of step, the moves stay individually legal while the board hands the student their opponent's pieces to move.
- **the FEN has all six fields** — a four-field FEN parses in chess.js and silently assumes White, quietly changing whose puzzle it is.
- **no duplicate slugs**, and **no half-translated hints** (same rule as `moveComments`).

#### ⚠️ A LEGAL POSITION IS NOT A CORRECT ONE — verify the CLAIM, not the chess

`check-content.mjs` proves a position is *possible* and a line is *legal*. It
cannot read the sentence next to the board, and that is where content actually
goes wrong.

Content batch 3 (course 3) shipped **four** positions that passed every check —
legal, six fields, solution legal, plies in range — and each described a
mechanism the position did not contain:

| Lesson | The prose said | The board had |
|---|---|---|
| le clouage | the c6 knight "cannot move" | a **d7 pawn** blocking the diagonal; the knight had 5 legal moves |
| la découverte | `Bb3` aims at h8 through `Ne5` | b3–h8 is not a diagonal, and e5 was not on the bishop's line |
| l'attraction | `Ng6+` forks king and queen | `2...fxg6` — a pawn on f7 simply takes the knight |
| la surcharge | the recapture allows `Re8#` | the recapture came **with check**, and a queen on c5 covers f8 anyway |

Two of those are the classic beginner misconceptions they were meant to teach
*against* — a "pin" that is blocked by the d7 pawn is the single most common
wrong idea about the Ruy Lopez, and it would have shipped as fact.

Two of those are the classic beginner misconceptions they were meant to teach
*against*. A "pin" blocked by the d7 pawn is the single most common wrong idea
about the Ruy Lopez, and it would have shipped as fact.

#### THE RULE — every diagram is replayed and its claim asserted BEFORE merge

**No board merges on "it parses".** For each one, replay the position and
assert the specific thing the sentence beside it says: *is the knight actually
unable to move; does the bishop actually reach h8 once the screen leaves; can
anything capture the forking piece; is that actually mate.* If the sentence
makes a claim you have not asserted, you have not checked the board.

Since batch 3 that is **data, not discipline**: a `position` or `exercise`
board carries a `claims[]` array, and `check-content.mjs` proves each one on
every build. The claim is language-neutral, so the fr/en pair must agree on it.

| kind | what is asserted |
|---|---|
| `pin` | the named piece has **zero** legal moves, **and** removing it exposes its own king — the second half is what separates a pin from a piece that is merely blocked in |
| `fork` | the piece on `from` attacks **every** square in `targets`, and each holds an enemy piece |
| `discovery` | `by` does **not** attack `target` now, and **does** once `screen` is lifted — so the screen is load-bearing |
| `line` | the moves are legal in sequence and the final position is the stated `ends` (`mate`/`check`/`quiet`/`stalemate`), optionally capturing a stated piece |

`after: [...]` replays moves first, because a caption usually describes the
position the diagram is *about* to reach ("le cavalier saute en c7 …").

#### ⚠️ A TRAP'S CLAIMS CARRY A `ply`; A LESSON BOARD'S MUST NOT

A trap has a PGN, not a FEN, so a claim has to say **which position** it is
about — on the same 0-based scheme as `moveComments`: the position AFTER that
half-move, with `-1` for the start. `after`/`moves` continue from there, and
that is what lets a claim prove a **refutation the PGN does not contain** —
`mat-du-berger` asserts that at ply 4 the line `3...Qe7 4.Qxe5?? Qxe5` wins the
queen, which is the lesson rather than the trap.

Both mistakes fail the build, and both were verified to:

| | |
|---|---|
| trap claim with no `ply` | it would silently pick a base position and prove something true about the **wrong move** |
| lesson claim **with** a `ply` | the board has its own FEN, so the ply indexes nothing and the author believes an anchor that does not exist |

⚠️ **Zod cannot express "required here, forbidden there"** across two
collections sharing one union without duplicating the union, so `ply` is
structurally optional and the rule lives in `check-content.mjs`. A claim
anchored one ply off fails loudly — verified with a fixture whose `line` claim
was anchored at ply 4 instead of 5 (*"move[0] 'h5f7' is not legal in …"*).

⚠️ **`kind: 'manual'` is the honest escape and REQUIRES a `note`.** Some claims
genuinely are not properties of a position — "the king must step aside and then
the queen falls", "if she recaptures it is mate in two" need a forcing-line
search over every legal reply. Those are **not** machine-stated, and pretending
otherwise would be worse than the gap. They declare `manual` with a note saying
what a human must verify, and `check-content.mjs` prints them as a **review
queue**. A board with **no** claims at all is printed there too — the point is
that nothing passes silently, not that everything passes.

⚠️ **The queue does not fail the build, deliberately.** Most of it is content
written before claims existed (17 boards across courses 1 and 2 at the time of
writing). Failing would force either a retrofit in one sitting or switching the
check off, and a visible list that shrinks is worth more than a red build
somebody disables. Retrofit opportunistically, when touching a lesson anyway.

⚠️ **Each assertion was verified to FAIL on the real broken position** before
being trusted — the original Ruy Lopez FEN, the b3 bishop, a wrong fork target,
and the g1-king overload. The two older mechanical classes (`[SetUp]` FEN
contradicting the PGN's first move; side-not-to-move in check) were re-proved
the same way. Anything added to `assertClaim` gets the same treatment: **write
the fixture that must fail, watch it fail, then delete it.**

---

## The beginner tutorial — `/apprendre-les-bases/`

Thirteen steps for someone who has never played, sitting **below** `debutant`.
Index at `/apprendre-les-bases/`, one route per step, both locales.

### ⚠️ It adds NO new board and NO new mode — and here is why none was needed

The brief asked whether to build a lightweight "sandbox" sub-mode where tapping a
piece highlights its legal destinations. **Exercise mode already does exactly
that**, and it is worth knowing so nobody builds the second thing later:

> `destsOf()` in `src/lib/chess/exercise.ts` builds `dests` from
> `game.moves({ verbose: true })` — **every legal move in the position**, not the
> expected one. Chessground lights all of them when a piece is picked up.

So the board that demonstrates a rule *is* the board that checks it, judged
through the same `judgeMove` path as every other exercise, with `MoveInput` for
keyboard entry and `mcc:progress:v1` for progress. `BoardSurface.tsx` and
`ChessBoard.tsx` are untouched by this feature, which is why it merged on
chromium rather than the full matrix.

### Progress is namespaced, not special-cased

Each step records under **`tutorial:<slug>`** in the same `mcc:progress:v1` store
as every exercise. v2-S3's sync therefore picks the tutorial up with no branching
at all — the namespace is the only thing distinguishing it, and it is only there
so a tutorial step and an exercise can never collide on a slug.

### The index mounts no board

Thirteen live boards on one page would be thirteen hydrated islands on the page a
complete beginner opens first, usually on a phone. The index is a list; the board
lives on each step's route, exactly as `/exercices/` works. A spec asserts zero
`astro-island` and zero `cg-board` on the index.

### Entry points — and why it gets no nav slot

- **Home**: a quiet underlined line *below* the two CTAs. A beginner must find it
  instantly; everyone else must not have it competing with Jouer and Pièges.
- **`/cours/`**: named at the TOP as the prerequisite — a beginner who scrolls
  past it has already started the wrong thing.
- **Nav: deliberately not.** The nav already carries seven items and is tight on
  a phone. More importantly the tutorial is a *journey you finish*, not a
  destination you return to; a permanent slot would keep advertising it to people
  who completed it months ago. Home and `/cours/` reach the people who need it.

### `onlyMove: true` is honest here

Elsewhere `onlyMove: true` is a claim that must be proven (see the exercise
validation rule). Tutorial tasks name a destination — "bring the rook to h8" — so
a different move genuinely is not the task, and saying so is accurate rather than
a lie about correctness. `check-content.mjs` still brute-forces uniqueness for
any step that ends in mate.

### Content is checked, not trusted

`scripts/check-content.mjs` validates the `tutoriel` collection on every build:
FEN parses and has six fields, the solution is legal, `onlyMove: true` on a
mate-in-1 is genuinely unique, no duplicate slugs, **`order` is contiguous
1..N** (a gap strands a reader mid-sequence, because prev/next walks that order),
and neither language of any prose field is empty.

⚠️ **The chess is machine-verified. The teaching is not.** The FR pedagogy is
flagged for Seàn's review — see BACKLOG.md.

---

---

## `onlyMove` — how it is implemented, and how it is policed

**Read when:** touching the exercise validator, either verdict's copy, or
`opponentReplies`. Moved out of CLAUDE.md at v0.17.1; the `onlyMove` rule itself
stays there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

#### How this is implemented, and how it is policed

**Both verdicts count an attempt, both shake, both reset the board, and both look identical on the board.** The *only* difference is which sentence renders — `exercise.wrong` vs `exercise.offLine` — plus the caveat line that only the permissive verdict carries. `.mcc-message-wrong` and `.mcc-message-off-line` share a colour on purpose: under `onlyMove: false` we do not know that the reader was wrong, so we must not paint them as wrong either.

**Winning-alternative acceptance is DEFERRED, not faked.** v1 validates against the stored `solution[]` and nothing else. There is no heuristic, no "close enough", no material count pretending to be judgement. When Stockfish lands (Phase 2) it can adjudicate an alternative properly, and that is the only thing that will change this. Do not ship a fake in the meantime — a validator that is wrong 5% of the time is worse than one that admits it does not know.

**`scripts/check-content.mjs` polices `onlyMove: true`.** For a mating line of ≤ 2 player moves it brute-forces every first move that also forces mate in the same number, and **fails the build** if there is more than one. `onlyMove: true` makes the site tell a student that any other move is wrong; that claim has to be true.

This is not hypothetical — it fired during Session 3 on `opposition-et-mat`, where `1. Kf7` mates as surely as `1. Kg6` does. That exercise is `onlyMove: false` for exactly that reason, and `tests/e2e/exercise.spec.ts` asserts it never says "wrong" in either language. **If that test ever fails because the copy changed, it is not a test to update. It is a regression.**

`opponentReplies` is aligned index-for-index with `solution`: `opponentReplies[i]` is played after `solution[i]`. It is normally `solution.length - 1` long, because the last player move ends the exercise. The schema enforces `opponentReplies.length <= solution.length`.

Moves are stored as **UCI** (`e2e4`, `e7e8q`), not SAN: UCI is unambiguous without a board, and it maps 1:1 onto what Chessground emits and chess.js accepts.

---

## Content validity is checked, not assumed

**Read when:** writing or reviewing ANY content entry — a trap, a lesson board, an exercise.


`node scripts/check-content.mjs` replays every line through chess.js. A Zod
schema proves an entry is well-*shaped*; it cannot prove it is legal chess —
`"e2e5"` is a valid UCI string and an illegal move. It checks PGNs parse, plies
exist, solutions and opponent replies interleave legally, `onlyMove: true` is not
a lie, the student always plays the same colour, the FEN has all six fields, and
that nothing is half-translated.

#### ⚠️ A LEGAL POSITION IS NOT A CORRECT ONE — verify the CLAIM, not the chess

`check-content.mjs` proves a position is *possible*. It cannot read the sentence
next to the board, and that is where content actually goes wrong. Content batch 3
shipped **four** positions that passed every check and each described a mechanism
the position did not contain — including a "pin" blocked by the d7 pawn, which is
the single most common wrong idea about the Ruy Lopez and would have shipped as
fact.

**THE RULE — every diagram is replayed and its claim asserted BEFORE merge.** No
board merges on "it parses". Since batch 3 that is **data, not discipline**: a
board carries a `claims[]` array (`pin`, `fork`, `discovery`, `line`) and
`check-content.mjs` proves each one on every build.

- ⚠️ **A trap's claims carry a `ply`; a lesson board's must not.** Both mistakes
  fail the build.
- ⚠️ **`kind: 'manual'` is the honest escape and REQUIRES a `note`.** Manual
  claims and boards with no claims at all print as a **review queue**, which
  deliberately does not fail the build.
- ⚠️ Anything added to `assertClaim` gets the same treatment as the originals:
  **write the fixture that must fail, watch it fail, then delete it.**

**➡️ [`docs/reference/content.md`](./docs/reference/content.md)** — the four
positions that shipped wrong, the claim kinds in full, the deferred per-locale
Markdown decision for course bodies, and the beginner tutorial
(`/apprendre-les-bases/`, which adds no new board and no new mode, and namespaces
its progress under `tutorial:<slug>`). **Read it before writing any content.**

---
