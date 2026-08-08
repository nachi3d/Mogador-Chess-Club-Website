# Mogador Chess Club — Direction mobile : le site devient une app

**Statut : proposition, en attente de validation. Aucun code avant accord.**

Ce document annule le menu rétro centré sur mobile (E5). Il reste valable sur desktop ; sur téléphone il est remplacé.

---

## Le constat

Sur un téléphone aujourd'hui : un header qui occupe un tiers de l'écran (logo, quatre groupes de nav, deux boutons de réglage), puis un menu central qui répète exactement les mêmes entrées, puis une phrase de description. Deux menus empilés avant le premier contenu utile, cinq entrées de poids identique, aucune hiérarchie, rien qui dise par où commencer.

Ce n'est pas un défaut d'exécution — la conception était mauvaise pour ce format. Le menu rétro suppose un grand écran et de gros partis pris typographiques ; sur 390 px il devient une liste de liens sur fond sombre.

## Le parti pris

**Sur mobile, ce n'est pas un site, c'est une app.** Des ados vont l'ouvrir à répétition, en classe, dans la rue, pendant dix minutes. Le modèle de référence n'est pas une page d'accueil, c'est Lichess mobile ou Duolingo : on arrive, on voit ce qu'on peut faire, on tape.

---

## 1. La navigation passe en bas

**Barre de navigation fixe en bas de l'écran, quatre entrées maximum.** C'est la zone atteignable au pouce ; le haut de l'écran ne l'est pas sur un téléphone moderne.

| Entrée | Destination | Icône |
|---|---|---|
| **Accueil** | `/` | maison |
| **Apprendre** | `/cours` | livre |
| **Jouer** | `/jouer` | pièce |
| **Progrès** | `/compte` ou une vue locale tant que les comptes sont désactivés | courbe |

- Quatre, pas cinq ni six : au-delà, les cibles deviennent trop étroites et le choix se brouille. Pièges, exercices, agenda et contact vivent **à l'intérieur** de ces sections, pas au même niveau.
- L'entrée active est marquée (couleur d'accent + label). Cible tactile ≥ 48 px de haut.
- La barre respecte la zone sûre iOS (`env(safe-area-inset-bottom)`) — sinon elle passe sous la barre de gestes.
- Elle ne bouge jamais, ne se cache pas au scroll : la stabilité vaut mieux que les quelques pixels gagnés.

**Le header mobile se réduit à une seule ligne** : le nom du club à gauche, deux icônes à droite (thème, langue). Rien d'autre. Les réglages complets restent dans `/parametres`.

**Sur desktop, rien ne change** : le header groupé et le menu central restent. La barre basse est une adaptation mobile, pas un remplacement global.

---

## 2. L'accueil devient un tableau de bord

Plus de menu. Ce que l'élève voit en arrivant, dans cet ordre :

1. **Une carte de reprise, en pleine largeur, dominante.**
   « Reprendre — Le mat de l'escalier » avec une barre de progression et un bouton net.
   S'il n'a jamais rien commencé : « Commencer — Première partie ».
   **Cette carte est l'écran.** Elle occupe le premier tiers, elle est colorée, elle est la seule chose de cette taille.

2. **Deux cartes côte à côte** : *Jouer une partie* et *S'entraîner*. Carrées, tactiles, illustrées d'un motif de plateau.

3. **Une ligne de statistiques** — exercices résolus, série en cours, rang. Discrète, une seule ligne, elle devient intéressante quand les points arriveront (E3).

4. **Prochaine séance** — la date, le lieu, une ligne. C'est l'information que cherchent les parents et les élèves du club.

5. **Le pied de page** porte le reste : à propos, contact, mentions, crédits.

La phrase de description reste, mais **sous** la carte de reprise, pas au-dessus : un visiteur qui découvre le site la trouve en un scroll ; un élève qui revient n'a pas à la relire à chaque fois.

---

## 3. Ce qui rend une app agréable, et qui manque

- **Cartes pleine largeur, coins généreux, ombre franche.** Aujourd'hui tout est plat et centré ; il faut du relief et de l'alignement à gauche. Le texte centré sur plusieurs lignes est fatigant à lire sur mobile.
- **Hiérarchie par la taille, pas par la position.** L'action principale est deux fois plus grande que les secondaires. Sur la capture actuelle, les cinq entrées ont exactement le même poids : rien ne guide.
- **Une seule action principale par écran.** S'il y en a deux, aucune n'est principale.
- **Densité assumée** : moins de vide, plus de contenu utile. Le vide généreux marche sur desktop ; sur 390 px il donne l'impression d'un site inachevé.
- **Retour tactile immédiat** — E1 l'a construit, il faut qu'il s'applique aux cartes aussi, pas seulement aux boutons.

---

## 4. Ce qui ne change pas

- Les quatre thèmes, la typographie thématique, les six presets de plateau — E6/E7 reste entièrement valable
- L'échiquier reste sobre
- Contraste AA, `prefers-reduced-motion`, zéro requête tierce, pas de GSAP
- Lighthouse ≥ 90 sur mobile
- L'invité reste complet
- Le desktop conserve le menu rétro et le header groupé

---

## 5. Ce qu'on supprime

- **Le menu central sur mobile** — remplacé par le tableau de bord
- **Le header à quatre groupes sur mobile** — remplacé par une ligne + barre basse
- La redondance header/menu : elle passait sur desktop, elle est indéfendable sur téléphone

---

## 6. Décisions attendues de Seàn

1. Les quatre entrées de la barre basse — Accueil / Apprendre / Jouer / Progrès. Tu remplaces « Progrès » par autre chose tant que les comptes sont désactivés ?
2. Le point de bascule mobile/desktop : à quelle largeur la barre basse disparaît-elle au profit du header groupé ? (proposition : 768 px)
3. La carte de reprise dominante — d'accord pour qu'elle occupe autant de place, ou tu veux voir « Jouer » en premier ?

---

## 7. Découpage

| Session | Contenu |
|---|---|
| **M1** | Barre de navigation basse + header mobile réduit |
| **M2** | Accueil tableau de bord (carte de reprise, cartes d'action, statistiques, prochaine séance) |
| **M3** | Passe de densité sur les pages internes (cours, exercices, pièges) — cartes, alignement, hiérarchie |

M1 et M2 se font ensemble : la barre basse sans le tableau de bord laisserait un accueil bancal.
