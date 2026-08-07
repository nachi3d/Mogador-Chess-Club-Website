# Mogador Chess Club — Content Batch 2: Cours 2 "Les mats élémentaires"

Content-only session. Same structure as Course 1 (per-locale Markdown pairs, `order` in frontmatter, `<!--board-->` marker for inline boards).

**⚠️ PLY INDEXING — read the CLAUDE.md blockquote first.** All `moveComments` plies below are written **0-indexed** (ply 0 = White's first half-move). Batch 1 shipped with all thirteen off by one; do not assume, verify each one against the move it describes.

**All copy below is authored — use it verbatim.** Where `onlyMove: true` is stated, have `check-content.mjs` verify mate uniqueness; if a position has more than one mate, flip it to `false` and report it. Never tell a student a real mate is wrong.

---

## Course meta

```
slug: les-mats-elementaires
title_fr: Les mats élémentaires
title_en: Basic checkmates
level: debutant
order: 2
summary_fr: Savoir attaquer ne sert à rien si tu ne sais pas finir. Six mats à connaître par cœur — ce sont eux qui transforment un avantage en victoire.
summary_en: Knowing how to attack is useless if you cannot finish. Six checkmates worth knowing by heart — they are what turns an advantage into a win.
```

---

## Leçon 1 — Le mat du couloir

```
slug: le-mat-du-couloir
order: 1
```

### FR

Après le roque, ton roi est bien à l'abri derrière trois pions. Sauf qu'il y a un défaut : ces trois pions lui bouchent aussi la sortie.

Un roi coincé sur sa dernière rangée par ses propres pions n'a nulle part où aller. Une tour ou une dame qui arrive sur cette rangée donne mat immédiatement. C'est le **mat du couloir** — et c'est de très loin le mat le plus fréquent chez les débutants, dans les deux sens : ceux qui le donnent et ceux qui le prennent.

**Board (position) :** le mat en un coup
FEN: `6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1`

Le roi noir est enfermé par ses propres pions f7, g7 et h7. La tour arrive en e8 et c'est terminé.

**La parade s'appelle le trou d'air.** Il suffit d'avancer un pion — souvent h7-h6 — pour ouvrir une case de fuite au roi. Un seul coup, et le mat du couloir ne marche plus jamais.

**Board (position) :** la même position avec le trou d'air
FEN: `6k1/5pp1/7p/8/8/8/8/4R1K1 w - - 0 1`

Ici la tour peut toujours arriver en e8, mais le roi s'échappe en h7. Échec, pas mat.

**Le conseil :** dans presque toutes tes parties, une fois roqué et les pièces développées, joue le trou d'air. C'est un coup qui ne sert à rien pendant vingt coups, puis qui sauve la partie.

**Essaie toi-même :** mate en un coup.
FEN: `6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1`
solution: `e1e8`
onlyMove: true
hint_fr: La dernière rangée est vide. Va l'occuper.
hint_en: The back rank is empty. Go and take it.

### EN

After castling your king sits safely behind three pawns. There is just one flaw: those three pawns also block his exit.

A king stuck on his back rank by his own pawns has nowhere to go. A rook or queen arriving on that rank is mate on the spot. This is the **back-rank mate** — by far the most common mate among beginners, in both directions: those who deliver it and those who walk into it.

**The cure is called luft** (German for "air"). Push one pawn — usually h7-h6 — and the king has an escape square. One move, and back-rank mate never works on you again.

**The advice:** in almost every game, once you have castled and developed, make luft. It is a move that does nothing for twenty moves, and then saves the game.

---

## Leçon 2 — Le mat de l'escalier

```
slug: le-mat-de-lescalier
order: 2
```

### FR

Tu as deux tours et le roi adverse se promène au milieu de l'échiquier. Comment le mater ? Tu ne cours pas après lui : tu construis un mur et tu le pousses.

Le principe est simple. **Une tour contrôle une rangée entière.** Le roi ne peut pas la traverser. Tu poses ta première tour sur la rangée juste devant lui, puis tu donnes échec avec la seconde — le roi doit reculer d'une rangée. Puis tu recommences. Le roi monte marche par marche jusqu'au bord, où il n'a plus de marche à monter. D'où le nom : **l'escalier**.

**Board (replayer) :** l'escalier en quatre coups
FEN de départ: `8/8/8/4k3/R7/8/8/1R5K w - - 0 1`
PGN:
```
[SetUp "1"]
[FEN "8/8/8/4k3/R7/8/8/1R5K w - - 0 1"]

1. Rb5+ Ke6 2. Ra6+ Kf7 3. Rb7+ Kg8 4. Ra8#
```
moveComments (0-indexed):
- ply 0 — FR: « La tour arrive juste devant le roi et lui interdit la rangée 5. Il doit monter. » / EN: "The rook lands right in front of the king and forbids rank 5. He has to go up."
- ply 2 — FR: « L'autre tour prend la rangée suivante. Remarque qu'elle est loin du roi : c'est volontaire, il ne doit jamais pouvoir la manger. » / EN: "The other rook takes the next rank. Notice how far it is from the king — that is deliberate, he must never be able to take it."
- ply 4 — FR: « Même mouvement, une rangée plus haut. Tu ne réfléchis plus, tu répètes. » / EN: "Same motion, one rank higher. You are not thinking any more, you are repeating."
- ply 6 — FR: « Le roi est sur la dernière rangée, il n'a plus de marche. Mat. » / EN: "The king is on the last rank with no step left. Mate."

**L'erreur classique :** poser une tour à côté du roi. Il la mange. Garde tes tours loin de lui — elles contrôlent la rangée entière de toute façon, la distance ne coûte rien.

**Essaie toi-même :** mate en un coup.
FEN: `k7/7R/8/8/8/8/8/2R4K w - - 0 1`
solution: `c1c8`
onlyMove: true
hint_fr: Une tour tient déjà la rangée 7. Occupe la 8.
hint_en: One rook already holds rank 7. Take rank 8.

### EN

You have two rooks and the enemy king is wandering in the middle of the board. How do you mate him? You do not chase him: you build a wall and push.

The principle is simple. **A rook controls a whole rank.** The king cannot cross it. You place your first rook on the rank in front of him, then check with the second — the king must step back one rank. Then you repeat. The king climbs step by step to the edge, where there is no step left. Hence the name: **the ladder**.

**The classic error:** putting a rook next to the king. He eats it. Keep your rooks far away — they control the entire rank anyway, so distance costs nothing.

---

## Leçon 3 — Dame et roi contre roi

```
slug: dame-et-roi-contre-roi
order: 3
```

### FR

C'est la fin de partie que tu rencontreras le plus souvent : tu as promu un pion, tu as une dame contre un roi tout seul. Attention, c'est aussi la fin de partie que les débutants ratent le plus.

**La méthode de la boîte.** Ne cherche pas le mat tout de suite. La dame contrôle une immense zone : place-la à distance de cavalier du roi adverse, et sa boîte rétrécit à chaque coup. Le roi n'a plus qu'un carré de plus en plus petit. Quand il est acculé au bord, tu amènes ton propre roi, et le mat vient tout seul.

**⚠️ Le piège du pat.** Si le roi adverse n'a plus aucun coup légal **et qu'il n'est pas en échec**, la partie est nulle. Tu avais une dame de plus et tu ne gagnes pas. Ça arrive à tout le monde une fois — et une seule fois, parce qu'on s'en souvient.

**Board (position) :** le pat à éviter
FEN: `k7/8/1Q6/8/8/8/8/6K1 b - - 0 1`

Les Noirs doivent jouer. Le roi ne peut aller ni en a7, ni en b7, ni en b8 : la dame couvre tout. Il n'est pas en échec. **Partie nulle.**

**La règle qui te protège :** avant de jouer ton coup de dame, regarde ce qui reste au roi adverse. S'il ne lui reste rien, c'est que ton coup est mauvais — sauf s'il est en échec.

**Board (position) :** le mat, avec le roi qui aide
FEN: `k7/8/1QK5/8/8/8/8/8 w - - 0 1`

Ici la dame donne mat parce que le roi blanc la protège. Retiens ça : **la dame seule ne mate jamais**, il faut toujours que ton roi participe.

**Essaie toi-même :** mate en un coup.
FEN: `k7/8/1QK5/8/8/8/8/8 w - - 0 1`
solution: `b6b7`
onlyMove: false
hint_fr: Colle-toi au roi adverse. Ton propre roi te protège.
hint_en: Get right next to the enemy king. Your own king protects you.

### EN

This is the endgame you will meet most often: you promoted a pawn and you have a queen against a lone king. Careful — it is also the endgame beginners botch most.

**The box method.** Do not hunt for mate straight away. The queen controls an enormous area: place her a knight's move away from the enemy king, and his box shrinks with every move. He is left with a smaller and smaller square. Once he is against the edge, bring your own king up and the mate arrives by itself.

**⚠️ The stalemate trap.** If the enemy king has no legal move **and is not in check**, the game is a draw. You were a queen up and you do not win. It happens to everyone once — and only once, because you remember it.

**The rule that protects you:** before you play a queen move, look at what the enemy king has left. If he has nothing, your move is wrong — unless he is in check.

Remember this too: **a lone queen never mates.** Your king always has to take part.

---

## Leçon 4 — Tour et roi contre roi

```
slug: tour-et-roi-contre-roi
order: 4
```

### FR

Même situation qu'avec la dame, mais en plus difficile : la tour contrôle beaucoup moins de cases. Ici ton roi ne se contente pas d'aider, il fait la moitié du travail.

**Deux outils, et seulement deux.**

La **barrière** : ta tour se pose sur une rangée ou une colonne et le roi adverse ne peut plus la franchir. Il est enfermé d'un côté de l'échiquier.

L'**opposition** : tes deux rois se font face avec une case entre eux. Celui qui doit jouer recule — il perd du terrain. Comme c'est l'adversaire qui doit jouer, c'est lui qui recule.

Tu alternes : je resserre la barrière, tu recules ; je prends l'opposition, tu recules encore. Le roi finit sur la dernière rangée, et là ta tour donne échec une dernière fois.

**Board (position) :** la position de mat
FEN: `k6R/8/1K6/8/8/8/8/8 w - - 0 1`

Regarde bien qui fait quoi : le roi blanc en b6 couvre a7 et b7, la tour couvre toute la rangée 8. À eux deux, ils ne laissent rien.

**Essaie toi-même :** mate en un coup.
FEN: `k7/8/1K6/8/8/8/8/7R w - - 0 1`
solution: `h1h8`
onlyMove: true
hint_fr: Ton roi tient déjà les cases de fuite. La tour n'a qu'à donner l'échec.
hint_en: Your king already holds the escape squares. The rook just has to give the check.

### EN

Same situation as with the queen, but harder: a rook controls far fewer squares. Here your king does not just help, he does half the work.

**Two tools, and only two.**

The **cut-off**: your rook sits on a rank or a file and the enemy king cannot cross it. He is shut into one side of the board.

The **opposition**: the two kings face each other with one square between them. Whoever has to move must step back — he loses ground. Since it is the opponent's turn, he is the one stepping back.

You alternate: I tighten the cut-off, you step back; I take the opposition, you step back again. The king ends up on the last rank, and there your rook gives one final check.

---

## Leçon 5 — Le mat étouffé

```
slug: le-mat-etouffe
order: 5
```

### FR

Le plus beau mat des échecs, et le seul où l'adversaire est tué par ses propres pièces.

Un roi entouré de ses défenseurs n'a aucune case de fuite. Le cavalier, lui, saute par-dessus tout le monde. Un cavalier qui donne échec à un roi complètement entouré donne mat, même si toute l'armée adverse est autour.

Le mécanisme complet s'appelle le **legs de Philidor**, et il vaut la peine d'être vu en entier : il finit par un sacrifice de dame.

**Board (replayer) :** le legs de Philidor
FEN de départ: `5rk1/6pp/8/6N1/8/1Q6/8/6K1 w - - 0 1`
PGN:
```
[SetUp "1"]
[FEN "5rk1/6pp/8/6N1/8/1Q6/8/6K1 w - - 0 1"]

1. Qb3+ Kh8 2. Nf7+ Kg8 3. Nh6+ Kh8 4. Qg8+ Rxg8 5. Nf7#
```
moveComments (0-indexed):
- ply 0 — FR: « La dame donne échec sur la grande diagonale. Le roi part dans le coin — c'est exactement là qu'on le veut. » / EN: "The queen checks on the long diagonal. The king goes to the corner — exactly where we want him."
- ply 2 — FR: « Le cavalier attaque. Les Noirs pourraient prendre avec la tour, mais la dame reprendrait en f7 et le mat suivrait quand même. » / EN: "The knight attacks. Black could take with the rook, but the queen recaptures on f7 and mate follows anyway."
- ply 4 — FR: « Échec double : le cavalier ET la dame attaquent le roi. Contre un échec double, on ne peut ni prendre ni parer — le roi doit bouger. » / EN: "Double check: the knight AND the queen attack the king. Against a double check you can neither capture nor block — the king must move."
- ply 6 — FR: « Le sacrifice. La dame se donne pour attirer la tour en g8 — la dernière case libre du roi. » / EN: "The sacrifice. The queen gives herself up to drag the rook to g8 — the king's last free square."
- ply 8 — FR: « Le cavalier revient. Le roi est entouré de son propre pion, de sa propre tour, et il est mat. » / EN: "The knight returns. The king is surrounded by his own pawn and his own rook — and he is mated."

**Essaie toi-même :** mate en un coup.
FEN: `6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1`
solution: `h6f7`
onlyMove: true
hint_fr: Le roi n'a plus une seule case. Il ne reste qu'à donner l'échec.
hint_en: The king has no square left. All that remains is to give the check.

### EN

The prettiest mate in chess, and the only one where the loser is killed by his own pieces.

A king surrounded by his defenders has no escape square. The knight, meanwhile, jumps over everybody. A knight checking a fully surrounded king is mate, even with the whole enemy army standing around him.

The full mechanism is called **Philidor's legacy**, and it is worth seeing end to end: it finishes with a queen sacrifice.

---

## Leçon 6 — Le mat de Boden

```
slug: le-mat-de-boden
order: 6
```

### FR

Deux fous qui se croisent. C'est tout, mais il faut le voir venir.

Quand ton adversaire a roqué du grand côté, son roi se retrouve en c8 avec ses propres pièces autour. Deux fous sur des diagonales qui se croisent couvrent alors toutes ses cases : l'un donne l'échec, l'autre bouche la fuite.

**Board (position) :** le mat en un coup
FEN: `2kr4/B1pn4/8/1B6/8/8/8/6K1 w - - 0 1`

Le fou en a7 tient déjà b8. Il ne reste qu'à amener l'autre fou sur la diagonale a6-c8, et le roi n'a plus rien : d7 est occupé par son propre cavalier, b8 est tenu, b7 sera attaqué.

**Ce que ça t'apprend, au-delà du mat :** les fous ne valent pas grand-chose seuls, mais **une paire de fous sur des diagonales croisées est une arme**. Quand tu as les deux fous et que l'adversaire a roqué du grand côté, regarde toujours si ces deux diagonales mènent quelque part.

**Essaie toi-même :** mate en un coup.
FEN: `2kr4/B1pn4/8/1B6/8/8/8/6K1 w - - 0 1`
solution: `b5a6`
onlyMove: true
hint_fr: Une diagonale mène droit au roi. Va la prendre.
hint_en: One diagonal leads straight to the king. Go and take it.

### EN

Two bishops crossing. That is all there is to it — but you have to see it coming.

When your opponent castles queenside, his king ends up on c8 with his own pieces around him. Two bishops on crossing diagonals then cover every square he has: one gives the check, the other blocks the escape.

**What this teaches you beyond the mate:** bishops are not worth much alone, but **a pair of bishops on crossing diagonals is a weapon**. Whenever you have both bishops and your opponent has castled queenside, check whether those two diagonals lead somewhere.

---

## Cross-links

- Leçon 1 links to `/exercices/mat-du-couloir/`
- Leçon 5 links to `/pieges/legal/` — Légal's mate is the same idea: a knight mating a king who has too many of his own pieces around him
- Leçon 6 links forward to course 3 (tactical motifs) when it exists

## Checker

Same validations as batch 1, plus: every position claiming mate actually mates; every `onlyMove: true` position verified to have exactly one mate (flip to `false` and report any that do not); PGNs with `[SetUp]`/`[FEN]` headers parse from their start position.

## Finish

CHANGELOG, BACKLOG.md, MANUAL-TESTS.md, `claude/content-cours-2` → dev `--no-ff`. No promotion.
Report: any position the checker rejected, any `onlyMove` flipped, deviations. Seàn reviews chess accuracy — step through both replayers before merging, since the checker cannot catch a comment on the wrong move that still lands inside the game.
