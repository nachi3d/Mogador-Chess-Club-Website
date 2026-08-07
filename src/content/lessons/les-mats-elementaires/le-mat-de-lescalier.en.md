---
course: "les-mats-elementaires"
slug: "le-mat-de-lescalier"
order: 2
lang: "en"
title: "The ladder mate"
summary: "Two rooks, and a king pushed back step by step. The mate you can play without thinking."
boards: [{"kind":"replay","pgn":"[SetUp \"1\"]\n[FEN \"8/8/8/4k3/R7/8/8/1R5K w - - 0 1\"]\n\n1. Rb5+ Ke6 2. Ra6+ Kf7 3. Rb7+ Kg8 4. Ra8#","caption":"The ladder in four moves.","comments":[{"ply":0,"text":"The rook lands right in front of the king and forbids rank 5. He has to go up."},{"ply":2,"text":"The other rook takes the next rank. Notice how far it is from the king — that is deliberate, he must never be able to take it."},{"ply":4,"text":"Same motion, one rank higher. You are not thinking any more, you are repeating."},{"ply":6,"text":"The king is on the last rank with no step left. Mate."}]},{"kind":"exercise","fen":"k7/7R/8/8/8/8/8/2R4K w - - 0 1","solution":["c1c8"],"opponentReplies":[],"onlyMove":true,"task":"Mate in one.","hint":"One rook already holds rank 7. Take rank 8."}]
draft: false
---

You have two rooks and the enemy king is wandering in the middle of the board. How do you mate him? You do not chase him: you build a wall and push.

The principle is simple. **A rook controls a whole rank.** The king cannot cross it. You place your first rook on the rank in front of him, then check with the second — the king must step back one rank. Then you repeat. The king climbs step by step to the edge, where there is no step left. Hence the name: **the ladder**.

<!--board-->

**The classic error:** putting a rook next to the king. He eats it. Keep your rooks far away — they control the entire rank anyway, so distance costs nothing.

## Your turn

<!--board-->
