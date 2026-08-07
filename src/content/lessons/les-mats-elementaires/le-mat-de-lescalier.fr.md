---
course: "les-mats-elementaires"
slug: "le-mat-de-lescalier"
order: 2
lang: "fr"
title: "Le mat de l'escalier"
summary: "Deux tours, un roi qui recule marche par marche. Le mat que tu peux jouer sans réfléchir."
boards: [{"kind":"replay","pgn":"[SetUp \"1\"]\n[FEN \"8/8/8/4k3/R7/8/8/1R5K w - - 0 1\"]\n\n1. Rb5+ Ke6 2. Ra6+ Kf7 3. Rb7+ Kg8 4. Ra8#","caption":"L'escalier en quatre coups.","comments":[{"ply":0,"text":"La tour arrive juste devant le roi et lui interdit la rangée 5. Il doit monter."},{"ply":2,"text":"L'autre tour prend la rangée suivante. Remarque qu'elle est loin du roi : c'est volontaire, il ne doit jamais pouvoir la manger."},{"ply":4,"text":"Même mouvement, une rangée plus haut. Tu ne réfléchis plus, tu répètes."},{"ply":6,"text":"Le roi est sur la dernière rangée, il n'a plus de marche. Mat."}]},{"kind":"exercise","fen":"k7/7R/8/8/8/8/8/2R4K w - - 0 1","solution":["c1c8"],"opponentReplies":[],"onlyMove":true,"task":"Mate en un coup.","hint":"Une tour tient déjà la rangée 7. Occupe la 8."}]
draft: false
---

Tu as deux tours et le roi adverse se promène au milieu de l'échiquier. Comment le mater ? Tu ne cours pas après lui : tu construis un mur et tu le pousses.

Le principe est simple. **Une tour contrôle une rangée entière.** Le roi ne peut pas la traverser. Tu poses ta première tour sur la rangée juste devant lui, puis tu donnes échec avec la seconde — le roi doit reculer d'une rangée. Puis tu recommences. Le roi monte marche par marche jusqu'au bord, où il n'a plus de marche à monter. D'où le nom : **l'escalier**.

<!--board-->

**L'erreur classique :** poser une tour à côté du roi. Il la mange. Garde tes tours loin de lui — elles contrôlent la rangée entière de toute façon, la distance ne coûte rien.

## Essaie toi-même

<!--board-->
