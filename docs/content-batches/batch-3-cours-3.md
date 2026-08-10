# Mogador Chess Club — Content Batch 3: Cours 3 "Les motifs tactiques"

Content-only session. Same structure as courses 1 and 2 (per-locale Markdown pairs, `order` in frontmatter, `<!--board-->` marker).

**⚠️ PLY INDEXING — 0-indexed** (ply 0 = White's first half-move), per the CLAUDE.md blockquote. Batch 1 shipped with all thirteen off by one. Verify each comment against the move it describes.

**⚠️ Two errors shipped in batch 2 and were caught by the checker, both mine:** a PGN whose start FEN contradicted its first move, and a "mate" position written with the wrong side to move. Every FEN below was built move by move, but check them anyway — the checker now rejects both classes.

**All copy is authored — use it verbatim.** Verify every `onlyMove: true` for uniqueness where the task claims a unique solution; flip to `false` and report if not.

---

## Course meta

```
slug: les-motifs-tactiques
title_fr: Les motifs tactiques
title_en: Tactical motifs
level: intermediaire
order: 3
summary_fr: Presque toutes les parties se décident sur un motif que l'on connaît ou que l'on ignore. Sept motifs à reconnaître d'un coup d'œil.
summary_en: Nearly every game is decided by a pattern you either know or don't. Seven motifs to recognise at a glance.
```

---

## Leçon 1 — La fourchette

```
slug: la-fourchette
order: 1
```

### FR

Une pièce, deux cibles. L'adversaire ne peut en sauver qu'une.

Le cavalier est le roi de la fourchette, pour une raison précise : **il attaque des cases qu'aucune autre pièce ne peut défendre depuis sa position**. Une tour attaquée par une tour peut être protégée ; une tour attaquée par un cavalier doit fuir.

La fourchette la plus rentable s'appelle la **fourchette royale** : le cavalier attaque le roi et une pièce lourde en même temps. Le roi doit répondre à l'échec — il n'a pas le choix — et la pièce tombe au coup suivant.

**Board (position) :** la fourchette royale
FEN: `r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1`

Le cavalier saute en c7 : échec au roi en e8, et la tour en a8 est attaquée. Le roi doit bouger, la tour tombe.

**Comment les repérer :** cherche les cases d'où un cavalier toucherait deux pièces adverses. Avec l'habitude, tu les vois avant même de calculer. Et surtout — **regarde les cases où l'adversaire pourrait faire la même chose à tes pièces**. Un roi et une dame sur des cases de même couleur, séparées par un saut de cavalier, c'est une fourchette qui attend.

**Essaie toi-même :** gagne la tour.
FEN: `r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1`
solution: `b5c7`
onlyMove: true
hint_fr: Une case, deux pièces. Et l'une des deux est le roi.
hint_en: One square, two pieces. And one of them is the king.

### EN

One piece, two targets. Your opponent can only save one.

The knight is the king of forks, for a precise reason: **it attacks squares no other piece can defend from where it stands**. A rook attacked by a rook can be protected; a rook attacked by a knight has to run.

The most profitable fork is called the **family fork**: the knight attacks the king and a heavy piece at the same time. The king must answer the check — he has no choice — and the piece falls next move.

**How to spot them:** look for squares from which a knight would touch two enemy pieces. With practice you see them before calculating. And above all — **look for the squares where your opponent could do the same to you**. A king and a queen on the same colour, a knight's jump apart, is a fork waiting to happen.

---

## Leçon 2 — Le clouage

```
slug: le-clouage
order: 2
```

### FR

Une pièce clouée est une pièce qui ne peut pas bouger, parce que derrière elle se trouve quelque chose de plus précieux.

**Le clouage absolu** : derrière la pièce, il y a le roi. La pièce ne peut **pas** bouger — c'est la règle, pas un conseil. Elle est morte sur place tant que le clouage dure.

**Le clouage relatif** : derrière la pièce, il y a une dame ou une tour. La pièce **peut** bouger, mais ce serait une catastrophe. C'est un clouage qu'un bon joueur brise parfois volontairement, si le gain compense.

**Board (position) :** le clouage absolu
FEN: `r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4`

Le fou en b5 cloue le cavalier c6 contre le roi e8. Ce cavalier ne défend plus rien : s'il bouge, le roi est en échec, donc il ne peut pas bouger.

**Ce que ça t'apprend :** une pièce clouée n'est pas seulement immobile, elle est **un mauvais défenseur**. Si le cavalier c6 défendait quelque chose, il ne le défend plus vraiment. C'est le vrai profit du clouage : attaquer ce que la pièce clouée est censée protéger.

**Essaie toi-même :** cloue le cavalier.
FEN: `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 3`
solution: `f1b5`
onlyMove: true
hint_fr: Ton fou, sur la diagonale qui mène au roi noir.
hint_en: Your bishop, on the diagonal that leads to the black king.

### EN

A pinned piece is a piece that cannot move, because something more valuable stands behind it.

**Absolute pin**: the king is behind. The piece **cannot** move — that is the rule, not advice. It is dead where it stands for as long as the pin lasts.

**Relative pin**: a queen or rook is behind. The piece **can** move, but it would be a disaster. A strong player will sometimes break a relative pin deliberately, if the gain is worth it.

**What this teaches you:** a pinned piece is not merely stuck, it is **a bad defender**. If that knight was guarding something, it is not really guarding it any more. That is the real profit of a pin: attack whatever the pinned piece is supposed to protect.

---

## Leçon 3 — L'enfilade

```
slug: lenfilade
order: 3
```

### FR

L'enfilade est un clouage à l'envers — et c'est exactement pour ça que les débutants confondent les deux.

- **Clouage** : la pièce de devant est la moins précieuse. Elle ne peut pas bouger.
- **Enfilade** : la pièce de devant est **la plus** précieuse. Elle doit bouger — et en partant, elle découvre celle de derrière.

Retiens-le comme ça : dans un clouage, tu attaques la petite pour atteindre la grande. Dans une enfilade, tu attaques la grande, et la petite tombe quand elle s'écarte.

**Board (position) :** l'enfilade
FEN: `4k2q/8/8/8/8/8/8/R5K1 w - - 0 1`

La tour arrive en a8 : échec. Le roi noir doit s'écarter de la rangée 8 — c'est obligatoire. Et la dame en h8, qui était derrière lui, se retrouve seule face à la tour.

**Où ça arrive vraiment :** roi et dame sur la même rangée, la même colonne ou la même diagonale. Dans les finales, c'est le motif qui gagne le plus de dames — un roi et une dame mal alignés, une tour qui arrive avec échec, et la partie est finie.

**Essaie toi-même :** gagne la dame.
FEN: `4k2q/8/8/8/8/8/8/R5K1 w - - 0 1`
solution: `a1a8`
onlyMove: true
hint_fr: Donne l'échec sur la rangée où ils sont tous les deux.
hint_en: Give check on the rank they are both standing on.

### EN

The skewer is a pin in reverse — which is exactly why beginners confuse the two.

- **Pin**: the front piece is the less valuable one. It cannot move.
- **Skewer**: the front piece is **the more** valuable one. It must move — and as it goes, it uncovers what was behind it.

Remember it this way: in a pin you attack the small piece to reach the big one. In a skewer you attack the big one, and the small one falls when it steps aside.

**Where it really happens:** king and queen on the same rank, file or diagonal. In endgames this is the motif that wins the most queens — a badly aligned king and queen, a rook arriving with check, and the game is over.

---

## Leçon 4 — L'attaque à la découverte

```
slug: lattaque-a-la-decouverte
order: 4
```

### FR

Deux de tes pièces sont alignées avec une cible adverse. Celle de devant s'écarte — et celle de derrière attaque, sans avoir bougé.

C'est le motif le plus rentable des échecs, parce que **la pièce qui part peut faire ce qu'elle veut**. Elle peut capturer, elle peut menacer autre chose, elle peut aller n'importe où : pendant ce temps, la pièce de derrière donne l'échec. L'adversaire ne peut pas répondre aux deux.

**Board (position) :** la découverte
FEN: `7k/3q4/8/4N3/8/1B6/8/6K1 w - - 0 1`

Le fou en b3 vise le roi h8, mais le cavalier e5 est sur la diagonale. Si le cavalier prend la dame en d7, il découvre l'échec du fou : les Noirs doivent parer l'échec, et le cavalier repart tranquillement au coup suivant.

**L'échec double** est la forme la plus violente : la pièce qui part donne elle aussi l'échec. Contre un échec double, on ne peut **ni capturer, ni intercaler** — le roi doit bouger, quoi qu'il arrive. C'est le seul motif des échecs contre lequel il n'existe aucune parade autre que fuir.

**Essaie toi-même :** gagne la dame.
FEN: `7k/3q4/8/4N3/8/1B6/8/6K1 w - - 0 1`
solution: `e5d7`
onlyMove: true
hint_fr: Prends la dame. L'échec, c'est le fou qui s'en charge.
hint_en: Take the queen. The bishop takes care of the check.

### EN

Two of your pieces line up with an enemy target. The front one steps aside — and the back one attacks, without having moved.

It is the most profitable motif in chess, because **the piece that leaves can do whatever it likes**. It can capture, it can threaten something else, it can go anywhere: meanwhile the piece behind is giving check. Your opponent cannot answer both.

**Double check** is the most violent form: the departing piece gives check too. Against a double check you can **neither capture nor block** — the king must move, whatever else is happening. It is the only motif in chess with no answer but flight.

---

## Leçon 5 — La déviation

```
slug: la-deviation
order: 5
```

### FR

Une pièce adverse défend quelque chose d'important. Tu la fais partir — et ce qu'elle défendait tombe.

C'est un motif de chasseur : tu ne regardes pas ce que tu peux attaquer, tu regardes **ce qui défend**. Souvent, une seule pièce tient toute la position adverse debout.

**Board (position) :** le défenseur unique
FEN: `6k1/3q1ppp/8/8/8/8/8/R2R2K1 w - - 0 1`

Les Blancs veulent la dernière rangée : la tour a1 rêve d'arriver en a8. Mais la dame d7 peut s'intercaler en d8. Elle est le seul obstacle — alors on l'élimine : la tour d1 prend en d7, et la rangée s'ouvre.

**Comment chercher :** repère la case que tu veux occuper, puis demande-toi *qui la défend ?* Si la réponse est « une seule pièce », tu tiens ta déviation.

**Essaie toi-même :** élimine le défenseur de la dernière rangée.
FEN: `6k1/3q1ppp/8/8/8/8/8/R2R2K1 w - - 0 1`
solution: `d1d7`
onlyMove: true
hint_fr: Une seule pièce noire peut s'intercaler sur la rangée 8. Enlève-la.
hint_en: Only one black piece can block on the back rank. Remove it.

### EN

An enemy piece is defending something important. You make it leave — and what it was defending falls.

This is a hunter's motif: you do not look at what you can attack, you look at **what is defending**. Often a single piece is holding an entire position together.

**How to look:** find the square you want to occupy, then ask yourself *who defends it?* If the answer is "one piece only", you have your deflection.

---

## Leçon 6 — L'attraction

```
slug: lattraction
order: 6
```

### FR

L'inverse de la déviation : au lieu de chasser une pièce, tu l'attires — sur une case où elle sera mal.

C'est presque toujours un sacrifice, et c'est ce qui le rend difficile à voir : il faut accepter de donner du matériel pour placer une pièce adverse là où elle te sert.

**Board (replayer) :** la tour se donne pour attirer le roi
FEN de départ: `5rk1/4qpp1/8/4N3/8/8/8/6KR w - - 0 1`
PGN:
```
[SetUp "1"]
[FEN "5rk1/4qpp1/8/4N3/8/8/8/6KR w - - 0 1"]

1. Rh8+ Kxh8 2. Ng6+ Kg8 3. Nxe7+
```
moveComments (0-indexed):
- ply 0 — FR: « La tour se donne. Le roi noir n'a aucune case : f8 est occupée par sa tour, f7 et g7 par ses pions, h7 est tenue. Il doit prendre. » / EN: "The rook offers itself. The black king has no square: f8 is his own rook, f7 and g7 his own pawns, h7 is covered. He must take."
- ply 2 — FR: « Voilà pourquoi la tour est morte : depuis g6, le cavalier attaque le roi en h8 **et** la dame en e7. Une fourchette que le roi en g8 rendait impossible. » / EN: "Here is why the rook died: from g6 the knight attacks the king on h8 **and** the queen on e7. A fork that was impossible while the king stood on g8."
- ply 4 — FR: « Le cavalier encaisse. Une tour donnée, une dame gagnée. » / EN: "The knight collects. A rook given, a queen won."

**Ce qu'il faut retenir :** avant de sacrifier, pose-toi une seule question — *sur quelle case est-ce que je veux voir cette pièce ?* Si la réponse rend un motif possible (une fourchette, un mat, une enfilade), le sacrifice se calcule. Sinon c'est juste une pièce donnée.

**Essaie toi-même :** attire le roi.
FEN: `5rk1/4qpp1/8/4N3/8/8/8/6KR w - - 0 1`
solution: `h1h8`
onlyMove: true
hint_fr: Le roi n'a qu'une case de fuite : celle que tu vas occuper.
hint_en: The king has one escape square, and you are about to stand on it.

### EN

The opposite of deflection: instead of chasing a piece away, you drag it — onto a square where it will be badly placed.

It is almost always a sacrifice, and that is what makes it hard to see: you have to accept giving up material in order to place an enemy piece where it suits you.

**What to remember:** before sacrificing, ask one question — *which square do I want that piece to be on?* If the answer makes a motif possible (a fork, a mate, a skewer), the sacrifice can be calculated. If not, it is just a piece given away.

---

## Leçon 7 — La surcharge

```
slug: la-surcharge
order: 7
```

### FR

Une pièce a deux missions. Elle ne peut en assurer qu'une.

C'est le motif le plus discret des sept, et probablement le plus fréquent en partie réelle. Personne ne place volontairement une pièce en surcharge : ça arrive tout seul, quand la position se resserre.

**Board (position) :** la dame a deux missions
FEN: `6k1/4qppp/8/2n5/1B6/8/8/4R1K1 w - - 0 1`

La dame e7 défend deux choses : le cavalier en c5, et la case e8 qui protège la dernière rangée. Les Blancs prennent le cavalier. Si la dame reprend, elle quitte la colonne e — et la tour arrive en e8 avec mat.

Les Noirs perdent donc une pièce, non pas parce qu'elle était mal défendue, mais parce que **son défenseur avait autre chose à faire**.

**Comment la repérer :** quand tu comptes les défenseurs d'une case, ne compte pas seulement *combien* — regarde ce que chacun fait **par ailleurs**. Un défenseur occupé n'est pas un défenseur.

**Essaie toi-même :** gagne le cavalier.
FEN: `6k1/4qppp/8/2n5/1B6/8/8/4R1K1 w - - 0 1`
solution: `b4c5`
onlyMove: true
hint_fr: Prends-le. Si la dame reprend, regarde ce qu'elle abandonne.
hint_en: Take it. If the queen recaptures, look at what she leaves behind.

### EN

One piece has two jobs. It can only do one.

This is the quietest of the seven motifs, and probably the most common in real games. Nobody deliberately overloads a piece: it happens on its own, as the position tightens.

Black loses a piece not because it was badly defended, but because **its defender had something else to do**.

**How to spot it:** when you count the defenders of a square, do not just count *how many* — look at what each one is doing **elsewhere**. A busy defender is not a defender.

---

## Cross-links

- Leçon 1 (fourchette) → `/exercices/fourchette-de-cavalier/`
- Leçon 4 (découverte) → `/pieges/legal/` — Légal's mate is a discovered attack dressed as a queen sacrifice
- Leçon 6 (attraction) → course 2, leçon 5 (le mat étouffé) — Philidor's legacy ends with exactly this motif: the queen is given to drag the rook onto g8
- Leçon 7 (surcharge) → course 2, leçon 1 (le mat du couloir) — the threat that makes the overload bite

## Checker

Same validations as batches 1 and 2, plus: every position's side-to-move consistent with the text; `onlyMove: true` verified for uniqueness where the task claims one solution; the lesson 6 PGN plays legally from its `[SetUp]` FEN and its final position wins the queen.

## Finish

CHANGELOG, BACKLOG.md, MANUAL-TESTS.md, `docs/content-batches/batch-3-cours-3.md`, `claude/content-cours-3` → dev `--no-ff`. No promotion.
Report: any position rejected, any `onlyMove` flipped, deviations. Step through the lesson 6 replayer before merging — the checker proves plies are in range, never that the words match the move.
