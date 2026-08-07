# Mogador Chess Club — Direction esthétique, addendum

**Suite du document `mcc-direction-esthetique.md`. Statut : proposition, en attente de validation. Aucun code avant accord.**

Quatre ajouts issus de la session de travail avec Seàn : le menu d'accueil, les thèmes complets, la typographie thématique et la boutique. Ils prolongent la direction validée (ressenti → progression → habillage) sans la contredire.

---

## E5 — Le menu d'accueil « vieux jeu PC »

L'accueil devient un menu principal centré, façon jeu d'échecs sur PC des années 90.

### Forme
- Titre du club en grand, pile verticale de six entrées centrées, curseur marquant la ligne active — **un petit cavalier plutôt qu'une flèche**
- Navigation aux flèches haut/bas, Entrée valide. Rétro et excellent en accessibilité à la fois : c'est du `roving tabindex` sur une liste de liens, pattern standard
- Entrées : **Reprendre** (uniquement si une progression existe — c'est le détail qui fait vraiment « jeu »), Jouer, Apprendre, S'entraîner, Pièges, Le club
- Un seul écran, pas de scroll pour l'atteindre

### Les trois tensions, et comment on les résout
1. **SEO** — la home est la principale porte d'entrée depuis Google et six mots ne s'indexent pas. → Le menu occupe le premier écran ; le contenu descriptif reste **dessous, au scroll**, et porte le balisage.
2. **Les adultes** — parents, Dar Souiri, l'association doivent comprendre en cinq secondes ce qu'est ce site. → Même réponse : une phrase de description sous le menu, visible sans effort.
3. **Redondance avec la nav groupée** — le menu central et le header disent la même chose. Ce n'est pas un défaut (les jeux ont un menu principal *et* des raccourcis) mais **les libellés doivent être identiques**, sous peine de donner l'impression de deux sites.

### Contraintes
- Le menu doit fonctionner sans JavaScript (liens réels, la navigation clavier avancée est l'amélioration progressive)
- `prefers-reduced-motion` : le curseur se déplace sans animation
- Mobile : la pile verticale marche telle quelle, cible tactile ≥ 44 px

---

## E6 — Thèmes complets (fond + plateau + pièces)

Les cinq presets de plateau existants s'élargissent en **thèmes cohérents** : fond, surfaces, plateau et pièces changent ensemble.

### Les pièces — la décision qui compte
Trois options ont été pesées :

| Option | Verdict |
|---|---|
| Un seul jeu, teinté par CSS | Gratuit, mais l'effet plafonne : des pièces plus chaudes, pas des pièces *en* bois |
| **Plusieurs jeux SVG libres** (merida, alpha, staunton… publiés par Lichess sous licences libres) | **Retenu.** ~12 SVG légers par jeu, chargés à la demande. C'est ce que font les vrais sites d'échecs et ça pèse lourd dans le ressenti |
| Pièces texturées bois/marbre (matriciel) | **Écarté.** Lourd, et surtout **moins lisible** : la texture mange la silhouette, or le public doit reconnaître un cavalier d'un coup d'œil |

**Texture sur le plateau et le fond uniquement**, et générée en CSS (dégradés, motifs) plutôt qu'en images — le zéro-requête tient, le précache reste léger.

Chaque jeu de pièces ajouté implique **sa propre attribution de licence** sur `/mentions-legales`, au même titre que cburnett aujourd'hui. À vérifier jeu par jeu avant intégration : licence libre confirmée, auteur crédité.

### Quatre thèmes proposés
- **Bois** — chêne et noyer, pièces staunton chaudes, fond parchemin
- **Marbre** — blanc veiné et ardoise, pièces nettes, fond froid et sobre
- **Souiri** — zellige, bleu d'Essaouira et blanc de chaux. **Aucun autre site d'échecs n'aura celui-là.**
- **Terminal** — vert phosphore sur noir, le clin d'œil rétro qui accompagne E5

### Contrainte bloquante
Chaque thème passe `check-contrast.mjs` sur **toutes** ses paires, dans les deux palettes. Une combinaison qui échoue est corrigée ou abandonnée — jamais publiée avec une exception. À vérifier en conception, pas en fin de session.

---

## E7 — Typographie thématique

Aujourd'hui : Fraunces en titre, Inter en corps, quel que soit le thème. Correct, neutre.

### Ce qui change
- **Le titrage suit le thème** — c'est là que se joue 90 % de l'effet, et sans risque : un titre se lit d'un coup d'œil. Bois → serif chaleureuse ; Marbre → serif classique à fort contraste ; Souiri → ouverte et arrondie ; Terminal → monospace.
- **Le corps de texte ne change pas de famille.** Il peut varier en rythme (interlignage, longueur de ligne) mais reste la même police lisible partout. C'est la règle de sécurité.

### Ce qui rend un texte agréable — et qui ne coûte rien
Plus une affaire de mise en page que de police :
- ligne de 60–70 caractères, interlignage généreux, intertitres qui respirent
- une lettrine sur le premier paragraphe d'une leçon
- chiffres à l'ancienne dans le texte courant, petites capitales pour les mentions
- guillemets français corrects
- **la notation d'échecs (`Cf3`, `Fc4`) traitée comme un objet visuel** — fond léger, chasse fixe, presque un badge. Ce seul détail transforme l'aspect d'une page de leçon.

### Contraintes
- Chaque police auto-hébergée et sous-réglée (leçon de la Session 1 : script d'installation, sous-ensembles latin uniquement)
- **Un thème ne charge que sa police de titrage**, jamais les quatre
- Le texte des leçons reste sobre même dans le thème le plus typé : un élève qui apprend la prise en passant ne doit pas se battre contre la mise en forme

---

## E8 — La boutique

Les points gagnés en apprenant deviennent des objets réels produits par Nachi3D. L'effort a une contrepartie tangible.

### Trois scénarios d'achat
1. **Échange contre points** — l'élève a assez de points, il échange
2. **Commande WhatsApp, paiement espèces** — les points servent alors de **code de réduction**
3. **Renvoi vers Nachi3D** pour paiement par carte

### Décisions d'architecture
- **Catalogue en git**, comme le contenu pédagogique. Peu de produits, changements rares, pas de CMS.
- **Aucun paiement sur le site club, jamais.** Trois raisons : aucune obligation légale de e-commerce, le site reste statique, et Nachi3D Labs a déjà l'infrastructure. Le club présente, Nachi3D encaisse.
- **Les points ne s'achètent pas. Jamais.** Une seule vente de points transforme un système pédagogique en mécanique de jeu mobile, et les élèves qui ont les moyens l'emportent sur ceux qui travaillent. Ligne rouge.

### Deux catégories de produits
- **Échangeables contre points** — petits objets produits par Seàn : porte-clés, pion imprimé, marque-page gravé. **Le prix en points doit être atteignable en un mois de travail régulier**, sinon la boutique est décorative.
- **Achetables** — jeux complets, Tour de Hanoï, figurines. Les points n'y font qu'une réduction, **plafonnée à 20–30 %** : sans plafond, un élève assidu obtient un jeu gratuitement et l'économie ne tient pas.

### Remise en présentiel
À Dar Souiri, de la main à la main. Pas d'expédition, pas de logistique — et une raison de plus de venir au club.

### ⚠️ Blocage à respecter
Les points vivent en localStorage tant que les comptes sont désactivés. Un élève qui change de téléphone perd tout — et ce n'est plus une progression perdue, c'est une **récompense** perdue.

**La boutique par points ne peut donc pas ouvrir avant que les comptes soient actifs (v2-S3).** L'affichage du catalogue peut exister avant ; l'échange non.

### ⚠️ Anti-triche
Le localStorage se modifie en trois clics dans une console. Tant que les points sont locaux, ils sont **déclaratifs**. Une fois les comptes en place, le solde doit être **calculé côté base** à partir des exercices réellement résolus, jamais accepté depuis le client.

---

## Découpage mis à jour

| Session | Contenu | Dépendance |
|---|---|---|
| ~~E1~~ | ~~Vocabulaire de mouvement + retours d'action~~ | ✅ fait |
| **E2** | Son synthétisé + réglage | E1 |
| **E3** | Rangs, séries, accomplissements, points | aucune (points locaux, non dépensables) |
| **E4** | Vocabulaire et atmosphère | validation A1 |
| **E5** | Menu d'accueil rétro | aucune |
| **E6** | Thèmes complets (fond + plateau + pièces) | aucune, mais lourde — session dédiée |
| **E7** | Typographie thématique | E6 (les deux touchent les tokens) |
| **E8** | Boutique — catalogue seul, puis échange | catalogue : aucune · échange : **v2-S3** |

**Ordre recommandé :** E5 (fort effet, faible risque) → E6+E7 ensemble (elles se recouvrent) → E3 → E2 → E8.

E4 peut disparaître : E5 et E7 en absorbent l'essentiel.
