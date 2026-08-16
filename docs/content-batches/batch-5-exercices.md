# Mogador Chess Club — Content Batch 5: 24 exercises

`/exercices/` has three entries for three courses. This batch takes it to 27 and gives every course a matching drill set.

---

## ⚠️ Method — read this first

**This brief supplies NO FENs and NO solution moves.** That is deliberate and it is not caution for its own sake:

- Batch 3 shipped eight hand-written positions; **four were legal and wrong** — the prose described a mechanism the board did not contain. A pin that wasn't a pin, a bishop off its diagonal, a combination refuted by a pawn capture, a mate that didn't exist.
- Batch 4 supplied lines in notation instead, and every line was sound.

So: **you construct every position, and you prove every claim.** For each exercise below, the brief gives the motif, the level, the teaching point and the shape the position must have. Build a position that satisfies it, verify it, and author the copy.

For each one you must:
1. Build the position and verify it is legal, with the correct side to move.
2. Verify the solution is legal and achieves what the exercise claims.
3. **Verify uniqueness.** If more than one move achieves the stated task, set `onlyMove: false`. Never tell a student that a correct move is wrong — that rule outranks the brief.
4. Declare `claims[]` so the build proves the mechanism. Use `kind: 'manual'` with a note where the claim needs a forcing-line search, and say so rather than overstating what is proved.
5. Keep it **clean**: as few pieces as the motif needs. A cluttered position teaches nothing to a beginner — the pattern must be visible at a glance.

**Report every position you built**, in a table: slug, the position in plain algebraic (White: … / Black: …), side to move, solution, `onlyMove`, and the claim kind. Seàn reviews chess accuracy, and he cannot review what he cannot see.

---

## Shared requirements

- Existing exercise schema: `title_fr/_en`, `slug`, `fen`, `solution` (UCI), `opponentReplies` where the exercise has more than one step, `onlyMove`, `hint_fr/_en`, `level`, `themes[]`.
- **Hints teach, they don't reveal.** A hint names the idea ("deux pièces sur la même diagonale"), never the move. Compare the existing three for tone.
- FR written natively for a teenager; EN written natively too, not translated-sounding.
- Titles name the motif, not the answer: "Mat en 1 — le couloir", not "Tour en e8".
- Each exercise carries the theme tags that connect it to its course lesson.
- Slugs in French, kebab-case, no duplicates across the collection.

---

## The 24

### A. Mats en 1 — 6 exercises, `debutant`
The pattern must be recognisable in under five seconds. These are for a student who has just finished course 2.

1. **Mat du couloir, une tour** — king boxed on the back rank by his own three pawns; a rook arrives. The plainest form.
2. **Mat du couloir, une dame** — same idea, queen instead, so the student sees the pattern rather than the piece.
3. **Mat de l'escalier, le dernier pas** — two rooks, king on the edge, one move from mate. Ties to course 2 lesson 2.
4. **Mat avec dame soutenue par le roi** — the queen adjacent to the enemy king, protected by her own king. The endgame mate every student needs.
5. **Mat étouffé** — knight mates a king surrounded by his own pieces. Course 2 lesson 5.
6. **Mat de Boden ou deux fous** — crossing diagonals, king castled queenside. Course 2 lesson 6.

### B. Mats en 2 — 4 exercises, `debutant` → `intermediaire`
Each needs `opponentReplies`: the first move must be forcing enough that the reply is unique, or the exercise becomes ambiguous. **Verify the reply is forced** — if Black has two answers, rebuild the position.

7. **Sacrifice puis mat** — give a piece to open a line or drag the king, mate follows.
8. **Échec, le roi fuit, mat** — a quiet-looking first move that removes every square.
9. **Déviation puis mat** — remove the one defender of the mating square. Course 3 lesson 5.
10. **Attraction puis mat** — drag a piece onto a square where it blocks its own king. Course 3 lesson 6.

### C. Fourchettes — 4 exercises, `debutant`
11. **Fourchette royale** — knight forks king and queen.
12. **Fourchette roi + tour** — the same shape, lesser prize, so the student generalises.
13. **Fourchette de pion** — a pawn forks two pieces. Beginners never see this one coming.
14. **Fourchette de dame** — queen attacks two undefended pieces at once.

### D. Clouages et enfilades — 4 exercises, `intermediaire`
15. **Clouage absolu, puis gain** — pin a defender, then take what it was defending. The real profit of a pin, per course 3 lesson 2.
16. **Exploiter une pièce clouée** — attack a pinned piece a second time; it cannot run.
17. **Enfilade roi puis dame** — check the king on a line, win what stands behind.
18. **Enfilade dame puis tour** — the same motif without check, so the student sees the geometry rather than the check.

### E. Découvertes — 3 exercises, `intermediaire`
19. **Découverte simple** — the front piece captures while the piece behind gives check.
20. **Échec double** — both pieces check; the king must move, nothing can be captured or blocked. Course 3 lesson 4.
21. **Découverte qui gagne la dame** — the moving piece attacks the queen while uncovering check.

### F. Motifs avancés — 3 exercises, `intermediaire`
22. **Surcharge** — a defender with two jobs; take one and the other falls. Course 3 lesson 7.
23. **Déviation en finale** — remove the king or a piece from a critical square in a simple endgame.
24. **Attraction avec sacrifice** — a sacrifice that only works because of where it puts the enemy piece.

---

## Cross-links
Each exercise links to the lesson that teaches its motif. Each of the three courses' final lessons should link to the exercises tagged with its themes — check whether that reverse link exists and add it if not.

## /exercices/ index
27 entries needs more than a flat grid. Add filtering by level and by theme, server-side (`?niveau=`, `?theme=`), with a clear empty state. Reuse the card and chip components that already exist — do not add a seventh definition of either.

## Checker
Extend `check-content.mjs` as needed. Every FEN legal with the right side to move; every solution legal and achieving the stated task; every `opponentReplies` legal and, where the exercise claims a forced reply, verified as the only legal answer; mate-in-1 verified as mate; `onlyMove: true` verified unique; claims declared and passing; no duplicate slugs; fr/en pairs agree.

## Finish
Commit this brief as `docs/content-batches/batch-5-exercices.md`. CHANGELOG, BACKLOG, MANUAL-TESTS.md. `npm run test:branch`, both flag shapes. `claude/content-exercices` → dev `--no-ff`. No promotion.

**Report:** the position table described above, any exercise where uniqueness forced `onlyMove: false`, every `manual` claim with its note, and anything you could not build cleanly and why. If a motif cannot be shown in a clean position, say so rather than shipping a cluttered one.
