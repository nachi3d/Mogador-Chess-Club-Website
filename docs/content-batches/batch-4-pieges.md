# Mogador Chess Club — Content Batch 4: six pièges d'ouverture

**Method change, deliberate.** The previous three batches supplied hand-written FENs; four of batch 3's eight positions were legal and wrong — the prose described a mechanism the board did not contain. **This brief supplies NO FENs.** It gives the lines in algebraic notation and the teaching intent. You build every position, verify it, and declare `claims[]` so the build proves the mechanism.

If a line below is theoretically wrong, say so and correct it rather than shipping it. Verify each against standard theory.

Existing trap `legal` (Légal's mate) stays as it is. These six join it.

---

## Shared requirements for all six

- Trap schema as it exists: `title_fr/_en`, `slug`, `eco` where applicable, `level`, `themes[]`, `pgn`, `summary_fr/_en`, `moveComments[]` (**0-indexed plies**), `shapes[]` optional.
- **Every trap must teach the refutation, not just the trick.** A student who only learns the trap gets one cheap win and then loses to anyone who knows it. The refutation is the lesson; the trap is the hook.
- **Where a trap is objectively unsound, say so plainly in the summary.** Teaching a losing line as a winning trick is a pedagogical lie.
- `moveComments` on the instructive plies only — a comment on every move is noise. Comment where a beginner goes wrong.
- Arrows may not originate from nothing; circles may mark empty squares. Shapes render on the position **after** the ply.
- FR written natively for a teenager, EN natively too.
- Declare `claims[]` wherever the copy asserts a mechanism (mate, fork, pin, discovery, line). Use `kind: 'manual'` with a note where a claim needs a forcing-line search — do not overstate what the checker proves.
- Cross-link each trap to the course-3 motif it exploits.

---

## 1. Le mat du berger — `mat-du-berger`

**Line:** 1.e4 e5 2.Bc4 Bc5 3.Qh5 Nf6?? 4.Qxf7#

**Teaching intent — the refutation IS the lesson.** This is the trap every beginner meets and most fall for once. Frame it explicitly: *this works exactly once, and here is how it never works on you again.*

- The threat is Qxf7# — f7 is defended only by the king.
- The refutation to show: **3...Qe7** (defends f7, and if 4.Qxe5 Qxe5) or **3...g6** attacking the queen while developing. Show at least one refutation line played out.
- Make the point that White's queen is now badly placed: after the refutation, Black develops with tempo and White has lost time — the exact lesson of course 1, lesson 4.
- Level: `debutant`. Themes: mat, ouverture.
- Cross-link: course 1 lesson 4 (ne pas sortir la dame trop tôt).

## 2. L'attaque Fegatello (Fried Liver) — `fegatello`

**Line:** 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Nxd5?! 6.Nxf7 Kxf7 7.Qf3+

**Teaching intent.** A genuine sacrifice, not a swindle — White gives a knight to drag the king out. Black is not lost, but must defend precisely, which beginners cannot.

- Show why 5...Nxd5 is the mistake and **5...Na5** is the main correct answer (the Polerio defence, attacking the c4 bishop).
- Show the king dragged to f7 and why that is worth a piece: the king cannot castle, and White attacks with tempo.
- Be honest that modern theory holds Black survives with best play — this is a practical weapon, not a refutation.
- Level: `intermediaire`. Themes: sacrifice, attraction, ouverture.
- Cross-link: course 3 lesson 6 (l'attraction).

## 3. Le piège de Lasker (gambit dame) — `piege-de-lasker`

**Line:** 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Nbd7 5.cxd5 exd5 6.Nxd5?? Nxd5! 7.Bxd8 Bb4+ 8.Qd2 Bxd2+ 9.Kxd2 Kxd8

**Teaching intent — this one is a trap for WHITE, which makes it valuable.** It looks like White wins a pawn; in fact Black emerges a piece up.

- The point: 6.Nxd5 appears to win a pawn because the f6 knight is pinned by Bg5. It is a **relative** pin, not absolute — the knight may legally move, and here it must.
- After 6...Nxd5 7.Bxd8, Black plays **7...Bb4+**, and the check wins the piece back with interest.
- **This is the clearest illustration in the whole site of the absolute/relative pin distinction** — make that the lesson, and cross-link course 3 lesson 2 explicitly.
- Verify the final material count and state it plainly.
- Level: `intermediaire`. Themes: clouage, ouverture, gambit-dame.

## 4. Le gambit Blackburne-Shilling — `blackburne-shilling`

**Line:** 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4?! 4.Nxe5?? Qg5! 5.Nxf7 Qxg2 6.Rf1 Qxe4+ 7.Be2 Nf3#

**Teaching intent — and the honesty requirement is strongest here.** 3...Nd4 is objectively bad; 4.Nxe5 is the greedy mistake that loses.

- Say plainly in the summary: **this trap is unsound.** Against 4.Nxd4 or 4.O-O, Black is simply worse. It works on greedy opponents and on nobody else.
- The pedagogical value is the mate pattern at the end, and the broader lesson: *a "free" pawn in the opening is usually a hook*.
- Level: `debutant`. Themes: mat, ouverture, piege.
- Cross-link: course 1 lesson 1 (occuper le centre) — Black violates every opening principle and still wins, because White got greedy. Say why that is not a recipe.

## 5. Le piège de l'Arche de Noé — `arche-de-noe`

**Line (one standard version):** 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 d6 5.d4 b5 6.Bb3 Nxd4 7.Nxd4 exd4 8.Qxd4?? c5 9.Qd5 Be6 10.Qc6+ Bd7 11.Qd5 c4 — the b3 bishop is trapped by pawns and falls.

**Verify this line carefully and adjust to the soundest standard version if it differs.** The name refers to the queenside pawns closing around the bishop like a trap.

**Teaching intent.** A bishop can be caught by pawns — pieces get trapped, not just captured.

- The lesson: a long-range piece deep in enemy territory can run out of squares. Count a piece's escape squares before sending it somewhere profitable.
- Level: `intermediaire`. Themes: piece-piegee, ouverture, espagnole.
- Cross-link: course 3 lesson 5 (la déviation) if it fits; otherwise no cross-link rather than a forced one.

## 6. Sixth trap — your choice

Pick a sixth at `debutant` level that fills a gap the other five leave. Candidates worth considering: the Englund gambit trap, a Caro-Kann or Scandinavian trap, or a smothered-mate trap in the opening (which would tie back to course 2 lesson 5).

**State which you chose and why**, and what gap it fills. Prefer a trap that (a) arises from an opening a beginner actually plays, (b) has a clean refutation worth teaching, and (c) does not duplicate a motif already covered three times.

---

## Checker

Every PGN legal from the start position. Every claimed mate actually mates. `moveComments` plies in range and **verified against the move they describe** — the checker cannot catch a comment that lands on the wrong move inside the game, so step through each replayer before merging. `claims[]` declared and passing. No duplicate slugs. fr/en pairs agree.

## Finish

Commit the brief as `docs/content-batches/batch-4-pieges.md`. CHANGELOG, BACKLOG, MANUAL-TESTS. `npm run test:branch`. `claude/content-pieges` → dev `--no-ff`. No promotion.

**Report:** any line you found theoretically wrong and corrected, the sixth trap chosen and why, every `claims[]` kind used and every `manual` note, deviations. Seàn reviews chess accuracy and FR pedagogy — flag both.
