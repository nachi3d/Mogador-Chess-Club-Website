---
course: "les-motifs-tactiques"
slug: "lenfilade"
order: 3
lang: "en"
title: "The skewer"
summary: "A pin in reverse: the big piece in front, the small one behind — the motif that wins the most queens in endgames."
boards: [{"kind":"position","fen":"4k2q/8/8/8/8/8/8/R5K1 w - - 0 1","claims":[{"kind":"manual","note":"skewer: proving the queen falls means proving EVERY legal king reply loses her, which is a forcing-line search, not a property of the position."}],"caption":"The skewer. The rook arrives on a8: check. The black king has to step off the 8th rank — he has no choice. And the queen on h8, who was behind him, is left alone facing the rook."},{"kind":"exercise","fen":"4k2q/8/8/8/8/8/8/R5K1 w - - 0 1","claims":[{"kind":"manual","note":"skewer: proving the queen falls means proving EVERY legal king reply loses her, which is a forcing-line search, not a property of the position."}],"solution":["a1a8"],"opponentReplies":[],"onlyMove":true,"task":"Win the queen.","hint":"Give check on the rank they are both standing on."}]
draft: false
---

The skewer is a pin in reverse — which is exactly why beginners confuse the two.

- **Pin**: the front piece is the less valuable one. It cannot move.
- **Skewer**: the front piece is **the more** valuable one. It must move — and as it goes, it uncovers what was behind it.

Remember it this way: in a pin you attack the small piece to reach the big one. In a skewer you attack the big one, and the small one falls when it steps aside.

<!--board-->

**Where it really happens:** king and queen on the same rank, file or diagonal. In endgames this is the motif that wins the most queens — a badly aligned king and queen, a rook arriving with check, and the game is over.

## Your turn

<!--board-->
