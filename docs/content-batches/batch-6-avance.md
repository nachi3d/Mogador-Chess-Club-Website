# Mogador Chess Club — Content Batch 6: 16 advanced exercises

The first `avance` content on the site. Before it, `/exercices/niveau/avance/`
404'd by design — the level routes are derived from the content — and now it
exists in both locales because the content does.

---

## Method — unchanged from batch 5, plus a tablebase

The brief supplied motifs, not FENs. Every position was **built, then
interrogated**: legality, side to move, the solution, the claim, uniqueness at
every player move, and the status of every stored reply. Three kinds of proof,
and each exercise's `manual` claim names the one it rests on:

| Proof | Used for | Strength |
|---|---|---|
| **Syzygy tablebase** (tablebase.lichess.ovh, queried 2026-10-08) | 1, 2, 3, 4, 5, 14, 16 — every position of ≤ 7 pieces | exact verdict for **every** legal move |
| **Exhaustive search** (chess.js, all replies) | 7, 8, 9, 10, 11, 12, 13 — every forced mate | exact |
| **Stockfish 11** (vendored, MultiPV, depth 22) | 6, 15 — the two non-mating middlegames | engine judgement, stated as such |

What the workbench caught before anything shipped:

- **An illegal rook-lift position.** The b2 bishop was already checking h8 with
  White to move. chess.js loaded it, every check was green, and Black's only
  "reply" was a king move. → The build now refuses this for exercises
  (`check-content.mjs`), and on its first run that guard found a **published**
  batch-5 exercise with the same defect: `mat-dame-soutenue`. Fixed (queen b3 →
  b1, same `Qb8#`, still the only mate, same slug).
- **Saavedra was not unique.** Stockfish called the king moves "+60"; the
  tablebase confirmed `Kb3` and `Kc3` also win. Replaced by a knight-fork
  underpromotion that *is* the only win.
- **The underpromotion could not be taught by the board as it was.** The judge
  adopted the expected promotion piece, so a drag solved `e8=N` without a
  choice, and a typed `e8=Q` was called **correct**. → A promotion picker, and
  `judgeMove` now judges the piece the reader chose. See
  `docs/reference/board.md`.
- A Philidor whose third-rank move is the **sole** draw does not exist in the
  searched family — distant side checks also hold.

---

## The position table

All White to move. `onlyMove: true` means every stored White move was proved
to be the only one achieving the task at that point (mate in the stated number,
or the only win / the only draw).

| # | Slug | Position | Solution | onlyMove | forcedReplies | Claims |
|---|---|---|---|---|---|---|
| 1 | `opposition-diagonale` | W: Kc4 e4 · B: Kf7 | 1.Kd5 | true | — | line, manual (TB) |
| 2 | `course-de-pions` | W: Ke3 b4 · B: Kg6 h4 | 1.b5 | true | — | line, manual (TB) |
| 3 | `lucena-le-pont` | W: Kd8 Re1 d7 · B: Kf7 Rc2 | 1.Rf1+ Kg7 2.Rf4 | **false** | — | line, manual (TB) |
| 4 | `philidor-la-defense` | W: Ke1 Rh1 · B: Kd4 Rb2 e4 | 1.Rh3 e3 2.Rh8 | **false** | — | line, manual (TB) |
| 5 | `zugzwang-coup-d-attente` | W: Kd5 e4 a3 · B: Kf4 a5 e5 | 1.a4 | true | — | line, manual (TB) |
| 6 | `sacrifice-grec` | W: Kg1 Qd1 Bd3 Bc1 Nf3 e5 h4 f2 g2 · B: Kg8 Qb6 Re8 Bf8 f7 g7 h7 e6 d5 | 1.Bxh7+ Kxh7 2.Ng5+ Kg8 3.Qh5 | true | — | line, manual (SF) |
| 7 | `ouvrir-la-colonne-h` | W: Kc1 Rh1 Nf4 h5 f2 g2 · B: Kh8 Rg8 g7 h7 | 1.Ng6+ hxg6 2.hxg6# | true | **yes** | line, discovery |
| 8 | `casser-le-fianchetto` | W: Kg1 Qh6 Rh1 h5 f2 g2 · B: Kg8 Rf8 f7 h7 g6 | 1.hxg6 Ra8 2.gxh7+ Kh8 3.Qf6# | **false** | — | 3 × line, manual |
| 9 | `transfert-de-tour` | W: Kg1 Re1 Bc4 g6 e4 a2 f2 g2 h2 · B: Kh8 Ra8 a7 b7 g7 | 1.Re3 Rg8 2.Rh3# | true | — | line, manual |
| 10 | `mat-en-3-force` | W: Kg1 Qb3 Nf7 g2 h2 · B: Kg8 Ra8 Rf8 g7 h7 | 1.Nh6+ Kh8 2.Qg8+ Rxg8 3.Nf7# | true | **yes** | line, discovery, manual |
| 11 | `le-coup-tranquille` | W: Kg1 Qd2 Re1 f6 a2 b2 f2 g2 h2 · B: Kg8 Qa4 Rf8 a7 b7 f7 h7 g6 | 1.Qh6 Qd1 2.Qg7# | true | — | 2 × line, manual |
| 12 | `interception` | W: Kh1 Qg1 Rf1 Bb2 Nd5 h2 · B: Kh8 Ra7 Bb4 g7 h7 | 1.Ne7 Bxe7 2.Qxg7# | true | — | 2 × line, manual |
| 13 | `rayons-x` | W: Kg1 Qd2 Rd1 f2 g2 h2 · B: Kg8 Qc7 Rd8 f7 g7 h7 | 1.Qxd8+ Qxd8 2.Rxd8# | true | **yes** | line |
| 14 | `etude-de-reti` | W: Kh8 c6 · B: Ka6 h5 | 1.Kg7 | true | — | line, manual (TB) |
| 15 | `echec-perpetuel` | W: Kh1 Qd1 f5 g2 h2 · B: Kg8 Qb2 Re2 f7 g7 | 1.Qd8+ Kh7 2.Qh4+ Kg8 3.Qd8+ | true | — | line, manual (SF) |
| 16 | `sous-promotion` | W: Kh1 e7 g2 · B: Kc7 Qd6 | 1.e8=N+ Kd7 2.Nxd6 | true | — | fork, line, manual (TB) |

FENs are in each JSON file; the table above was generated from them.

### What each verdict rests on, in one line

1. **Kd5** is the only win; e5 and the seven other king moves draw.
2. **b5** is the only win; five king moves draw, and Kd2/Kd3/Kd4 — towards
   your own pawn — **lose** to the h-pawn.
3. Both stored moves win, but so do most rook moves → `onlyMove: false`.
4. Rh3 draws, as do Rh5–Rh8; Rh4, Rh2, Rg1, Rf1, Kf1, Kd1 lose → `false`.
5. **a4** is the only win; all five king moves **lose** (mutual zugzwang).
6. Each White move is the only one keeping a winning advantage (next best
   ≈ +1, −1.6, −1.5). Declining with 1…Kh8 also loses (+8.1).
7. Ng6+ is the only mate in 2; each Black reply is the only legal move.
8. hxg6 is the only first move mating in 3; at move 2 Qxh7+ also mates →
   `false`. The stored reply …Ra8 is Black's best defence.
9. Re3 is the only mate in 2; after **each** of Black's ten replies, Rh3# is
   the only mate. The g6 pawn takes h7 and blocks g7, so there is no luft.
10. Nh6+ (double check) is the only mate in 3; both replies are forced.
11. Qh6 — **no check** — is the only mate in 2; after each of 29 replies Qg7#.
12. Ne7 is the only mate in 2; whichever piece captures on e7 blocks the
    other's line (two line claims).
13. Qxd8+ is the only mate in 2; …Qxd8 is the only legal reply.
14. **Kg7** is the only move that does not lose (Réti, 1921).
15. Qd8+ is the only non-losing move (every other loses to mate); likewise
    Qh4+ and the return. The repetition is the draw.
16. **e8=N+** is the only win; e8=Q only draws; after …Kd7, Nxd6 is the only
    win.

---

## Pieces, and why some positions are not minimal

The brief asked for as few pieces as the motif needs. Every supporting piece
below was checked by REMOVING it and re-running the proof — which is how two
drafts lost a bishop each. Two positions are still heavier than a textbook
diagram, deliberately:

- **6 (Greek gift)** is a real French structure (d5/e6 vs e5, Bf8, Re8),
  found by searching variations of the classic set-up for one where Bxh7+ is
  the only decisive move. Most of the stripped-down versions tried were not
  winning for White at all — the sacrifice depends on exactly which defenders
  are missing, which is the lesson.
- **9 (rook lift)** needs the c4 bishop (without it there is no mate in 2) and
  the e4 pawn (without it Re4 and Re5 mate too, so the lift would not be the
  point).

Removed after that test: a **b2 bishop in 9** (it "pinned" g7, but the white g6
pawn already blocks it — the pin was never what held the net) and a **b1
bishop in 12** (Ne7 is still the only mate in 2 without it).

## Themes

`themes[0]` is the motif, which decides the order on `/exercices/`. New tags:
`attaque-du-roque`, `regle-du-carre`, `lucena`, `philidor`, `zugzwang`,
`colonne-h`, `fianchetto`, `coup-tranquille`, `interception`, `rayons-x`,
`echec-perpetuel`, `sous-promotion`, `defense`, `roi`. Tags render raw, the
same in both locales, as before.
