# Mogador Chess Club — Direction esthétique

**Statut : proposition, en attente de validation de Seàn. Aucune ligne de code avant accord.**

Objectif : que le site se ressente comme un jeu, l'apprentissage passant par le jeu plutôt qu'à côté de lui. Priorité retenue : **le ressenti d'abord (C), la progression ensuite (B), l'habillage en dernier (A)**.

---

## Principe directeur

> Un site donne l'impression d'un jeu quand il **répond**, pas quand il est déguisé.

Tout ce qui suit découle de là. Une animation qui n'est pas la réponse à une action de l'élève est une décoration ; elle passe en dernier, ou elle ne passe pas.

**Et la contrainte qui ne bouge pas : l'échiquier reste sobre.** Le mouvement vit *autour* du plateau — boutons, cartes, transitions, fond, retours. Un plateau qui scintille est un plateau qu'on lit mal, et le public ne sait pas encore où est f7.

---

## C — Le ressenti (socle, priorité 1)

### C1. Vocabulaire de mouvement

Un langage d'animation cohérent, défini une fois dans `src/lib/motion.ts` (qui existe déjà et possède toutes les durées) et réutilisé partout. Trois familles seulement :

| Famille | Durée | Courbe | Usage |
|---|---|---|---|
| **Réponse** | 120–180 ms | sortie rapide (`cubic-bezier(.2,.8,.3,1)`) | Ce qui suit un clic : bouton enfoncé, carte saisie, onglet basculé |
| **Transition** | 250–350 ms | douce | Changement d'état visible : révélation d'indice, ouverture de panneau, apparition de résultat |
| **Ambiance** | 4–20 s | linéaire, en boucle | Fond, dérive lente, respiration — jamais lié à une action |

Rien entre 180 et 250 ms : c'est la zone où une animation cesse d'être ressentie comme une réponse sans devenir une transition lisible.

### C2. Retour d'action (le cœur)

Chaque action de l'élève produit une réponse immédiate et distincte :

- **Bouton** — enfoncement réel (translation + ombre qui se resserre), pas seulement un changement de couleur. Zone tactile ≥ 44 px déjà respectée.
- **Coup juste** — la case de destination pulse brièvement dans la couleur d'accent, le compteur de coup avance avec un petit saut. Pas de confettis : la satisfaction vient de la précision, pas du bruit visuel.
- **Coup faux** — secousse courte (existante), mais accompagnée d'une raison quand elle existe : « ce coup est légal, mais il ne fait pas ce qu'on cherche ». L'échec doit informer.
- **Exercice résolu** — l'état de résolution se pose visiblement (le cadre s'anime vers son état final, le badge apparaît en deux temps). Aujourd'hui il apparaît d'un bloc.
- **Série** — plusieurs bonnes réponses consécutives font monter un indicateur discret (voir B2). L'animation s'intensifie légèrement avec la série : c'est le seul endroit où l'on autorise une escalade.

### C3. Le son

Le levier d'immersion le plus rentable, et absent aujourd'hui.

**Approche recommandée : synthèse via Web Audio API, aucun fichier audio.** Des oscillateurs courts (20–80 ms) produisent le clic de pièce, le choc de prise, l'accord de réussite, la note basse d'erreur. Avantages décisifs pour ce projet :

- 0 octet ajouté au précache PWA, 0 requête réseau
- aucune dépendance, aucune question de licence (contrainte GPL)
- entièrement paramétrable (hauteur, durée, volume) depuis le code

**Règles :**
- **Désactivé par défaut.** Un site qui fait du bruit sans prévenir est un site qu'on referme. Activation dans `/parametres`, mémorisée comme le thème.
- Une invitation discrète et unique à l'activer, la première fois qu'un exercice est résolu.
- Jamais de son sur une action passive (scroll, survol, navigation).
- Le contexte audio ne se crée qu'au premier geste de l'élève (contrainte navigateur, et cohérent avec la règle « rien avant un clic »).

---

## B — La progression (structure, priorité 2)

L'élève doit avoir une raison de revenir, et voir ce qu'il a construit.

### B1. Niveaux réels, pas cosmétiques

Un rang qui monte en résolvant des exercices et en terminant des leçons. **La condition non négociable : le rang doit refléter une vraie compétence.** Un rang gagné en cliquant ne dure pas deux minutes face à un ado.

Proposition de nommage, ancré dans les échecs plutôt qu'inventé :
`Pion → Cavalier → Fou → Tour → Dame` — cinq rangs, la valeur des pièces devient l'échelle de progression, et la leçon « la valeur des pièces » du Cours 1 prend un sens supplémentaire.

### B2. Séries et régularité

- Une **série** : nombre d'exercices résolus d'affilée sans erreur, visible pendant la session
- Une **régularité** : jours consécutifs avec au moins un exercice. Attention — à doser : une série de jours qui se casse peut décourager plutôt que motiver. Recommandation : afficher la régularité en cours, ne jamais afficher une série perdue comme une punition.

### B3. Accomplissements

Calculés depuis la progression (aucune table, aucune synchronisation — décision déjà prise en v2) : premier mat, dix exercices, un cours terminé, un piège maîtrisé, série de cinq, tous les mats élémentaires.

Ils apparaissent **au moment où ils sont gagnés**, pas dans une liste qu'il faut aller chercher.

### B4. Ce qu'on ne fait pas

- **Aucun classement public entre élèves.** Décision déjà actée dans le plan v2 et je la maintiens : comparer des débutants entre eux décourage exactement ceux qu'on veut garder. Le prof compare, les élèves non.
- Aucune monnaie virtuelle, aucun déblocage payant, aucune mécanique de rareté.
- Aucun contenu verrouillé derrière la progression : un élève doit pouvoir aller lire ce qui l'intéresse. La progression récompense, elle n'emprisonne pas.

---

## A — L'habillage (peau, priorité 3)

Le moins de code, et déjà à moitié en place dans la palette actuelle.

### A1. Vocabulaire

Les **libellés affichés** changent ; les **routes ne changent pas** (règle établie : les segments d'URL ne sont jamais traduits ni renommés, sinon les liens partagés meurent).

| Route | Libellé actuel | Proposition |
|---|---|---|
| `/cours` | Cours | **La salle d'étude** |
| `/pieges` | Pièges | **Le cabinet des pièges** |
| `/exercices` | Exercices | **Les épreuves** |
| `/jouer` | Jouer | **La salle de jeu** |
| `/agenda` | Agenda | **Le tableau d'affichage** |
| `/apprendre-les-bases` | Les bases | **Première partie** |

À valider par Seàn : c'est un parti pris fort, et il doit survivre à la traduction anglaise sans devenir ridicule.

### A2. Atmosphère

- Lumière de lampe plutôt qu'éclairage uniforme : un léger dégradé radial sur les surfaces principales, laiton chaud sur les accents
- Le fond en mode sombre existe déjà et fonctionne — c'est le mode clair qui est le plus plat aujourd'hui
- Les silhouettes de pièces en dérive (déjà en place, opacité plafonnée à 0,055) gagnent une seconde couche plus lente pour donner de la profondeur, dans le même plafond

---

## Contraintes qui ne bougent pas

Toute proposition ci-dessus s'y plie, sans exception :

1. **Pas de GSAP** — licence non-OSI incompatible avec la GPL du dépôt. CSS + JS natif, comme la session 6 l'a prouvé faisable.
2. **`prefers-reduced-motion`** — toute ambiance coupée, toute réponse ramenée à l'instantané, aucun son.
3. **Contraste AA** — `check-contrast.mjs` reste la porte du build, dans les deux palettes et les cinq presets.
4. **Lighthouse ≥ 90** sur mobile. Le Speed Index se dégrade avec l'ambiance permanente (98 aujourd'hui, expliqué et accepté) — mais Performance ne doit pas descendre plus bas.
5. **Zéro requête tierce**, aucune police ou son distant, rien avant un clic.
6. **L'invité reste complet** — toute la progression fonctionne sans compte, en localStorage.
7. **L'échiquier reste sobre.**

---

## Décisions attendues de Seàn

1. Le vocabulaire A1 — on y va, on l'adoucit, ou on garde les libellés actuels ?
2. Les rangs `Pion → Dame` — d'accord, ou tu préfères autre chose (rangs de tournoi, titres arabes/marocains, autre) ?
3. La régularité par jours consécutifs — utile pour ton public, ou source de découragement ?
4. Le son : synthèse Web Audio (recommandé) ou tu veux de vrais échantillons enregistrés ?

---

## Découpage proposé

| Session | Contenu | Dépendance |
|---|---|---|
| **E1** | Vocabulaire de mouvement + retours d'action (C1, C2) | aucune |
| **E2** | Son synthétisé + réglage dans `/parametres` (C3) | E1 |
| **E3** | Rangs, séries, accomplissements (B1–B3) | aucune, mais mieux après E1 |
| **E4** | Vocabulaire et atmosphère (A1, A2) | après validation de A1 |

E1 est la session qui change le plus le ressenti pour le moins de risque. Si une seule session doit être faite, c'est celle-là.
