/**
 * UI string tables.
 *
 * FR is the REFERENCE table. EN is typed against it (`Record<keyof typeof fr, string>`),
 * so a missing or misspelled English key is a compile error rather than a
 * French word surfacing on the English site.
 *
 * No component may hardcode a user-facing FR/EN string — everything public
 * goes through `t()`. Content strings (lesson titles, trap summaries) live in
 * the content collections' `*_fr` / `*_en` fields instead; this table is for
 * chrome only.
 */

import { DEFAULT_LOCALE, type Locale } from '@config/site';

const fr = {
  'nav.home': 'Accueil',
  'nav.courses': 'Cours',
  'nav.traps': "Pièges d'ouverture",
  'nav.exercises': 'Exercices',
  'nav.play': 'Jouer',
  'nav.agenda': 'Agenda',
  'nav.contact': 'Contact',
  'nav.group.learn': 'Apprendre',
  'nav.group.practise': "S'entraîner",
  'nav.group.club': 'Le club',
  'nav.basics': 'Les bases',
  'nav.label': 'Navigation principale',
  'nav.skipToContent': 'Aller au contenu principal',

  'lang.switchTo': 'English',
  'lang.label': 'Changer de langue',

  'home.title': 'Mogador Chess Club',
  'home.intro':
    "Le club d'échecs d'Essaouira. Des cours progressifs, une bibliothèque de pièges d'ouverture, et des exercices pour s'entraîner — en français comme en anglais.",
  /* ── The beginner tutorial ───────────────────────────────────────── */
  'tutorial.title': 'Apprendre les bases',
  'tutorial.intro':
    "Tu n'as jamais joué aux échecs ? Commence ici. Treize étapes courtes, un échiquier à chaque fois, et tu sauras jouer une partie complète.",
  'tutorial.homeCta': 'Nouveau aux échecs ? Commence ici',
  'tutorial.prerequisite': 'Jamais joué ? Commence par apprendre les bases.',
  'tutorial.step': 'Étape',
  'tutorial.of': 'sur',
  'tutorial.prev': 'Précédent',
  'tutorial.next': 'Suivant',
  'tutorial.backToIndex': 'Toutes les étapes',
  'nav.backToCourse': 'Toutes les leçons',
  'nav.whatNext': 'Et maintenant ?',
  'nav.toTraps': 'Les pièges d’ouverture',
  'tutorial.yourTurn': 'Essaie toi-même',
  'tutorial.done': 'Terminé',
  'tutorial.finished.title': 'Tu connais les règles.',
  'tutorial.finished.body':
    'Tu peux maintenant jouer une partie complète. La suite : les exercices pour t’entraîner, ou une partie contre l’ordinateur.',
  'tutorial.toExercises': "Passer aux exercices",
  'tutorial.toPlay': "Jouer contre l'ordinateur",

  'home.cta.play': 'Jouer',
  'home.cta.traps': 'Découvrir les pièges',

  /* The three pillars. Order is the learning path, not the nav order:
     you learn, then you drill, then you play. */
  /* ── The main menu (E5) ──────────────────────────────────────────
     ⚠️ The menu entries themselves DO NOT get their own strings. They reuse
     `nav.*` verbatim, because two different names for the same destination
     reads as two different sites. Only the entries with no nav counterpart
     are declared here. */
  /* ── Mobile app shell (M1/M2) ────────────────────────────────────────
     ⚠️ The bottom bar reuses `nav.*` labels wherever one exists, for the same
     reason the E5 menu does: two names for one destination reads as two
     sites. Only "Progrès", which has no nav counterpart, is declared here. */
  'nav.progress': 'Progrès',
  'nav.mobile': 'Navigation principale',

  /* ── The mobile dashboard (M2) ───────────────────────────────────────
     These are CARD titles, not menu labels: a card has room for a verb and a
     line of explanation, and the E5 identical-labels rule is about the menu.
     The bar above still borrows the nav's words. */
  'home.dash.play.title': 'Jouer une partie',
  'home.dash.play.text': "Contre l'ordinateur, dans le navigateur. Trois niveaux.",
  'home.dash.resume.title': 'Reprendre',
  'home.dash.resume.progress': '%s / %s étapes',
  'home.dash.basics.title': 'Apprendre les bases',
  'home.dash.basics.text': 'Treize étapes courtes, depuis zéro.',
  'home.dash.playShort.title': 'Jouer',
  'home.dash.playShort.text': "Une partie contre l'ordinateur.",
  'home.dash.practise.title': "S'entraîner",
  'home.dash.practise.text': 'Des positions à résoudre.',
  'home.dash.stats.solved': 'résolus',
  'home.dash.stats.lessons': 'leçons',
  'home.dash.stats.rank': 'Rang',
  'home.dash.stats.soon': 'bientôt',
  'home.dash.next.title': 'Prochaine séance',
  'home.dash.next.none': "Aucune séance annoncée pour l'instant.",

  /* ── The local progress view ─────────────────────────────────────── */
  'progress.title': 'Progrès',
  'progress.intro':
    "Ce que vous avez terminé. Tout est enregistré sur cet appareil uniquement — rien n'est envoyé nulle part.",
  'progress.basics': 'Les bases',
  'progress.courses': 'Cours',
  'progress.exercises': 'Exercices',
  'progress.of': 'sur',
  /* ── The section headings (M3) ──────────────────────────────────────
     `progress.empty`, `progress.emptyCta`, `progress.continue` and
     `progress.done` were removed with the old shape. The empty state is no
     longer a sentence and a button: the page now shows real counts at zero
     and names the first three things to do, which is a truer answer than
     "vous n'avez rien commencé" and is the same markup a returning reader
     sees. The way back in is the shared resume card. */
  'progress.sections.done': 'Ce que vous avez terminé',
  'progress.sections.byLevel': 'Exercices par niveau',
  'progress.sections.byTheme': 'Exercices par thème',
  'progress.sections.next': 'La suite',
  'progress.allDone': 'Vous avez tout terminé. Bravo.',
  'progress.rank': 'Rang et points',

  /* ══ E3 — rangs, points, séries, accomplissements ════════════════════════
     The ranks are the piece values, which is the direction's own proposal
     (§ B1) and is why the Cours 1 lesson "la valeur des pièces" gains a second
     meaning. They are NOT translated as words — a "Pion" is a "Pawn" — because
     these are the pieces, and the English page says so. */
  'score.rank.pion': 'Pion',
  'score.rank.cavalier': 'Cavalier',
  'score.rank.fou': 'Fou',
  'score.rank.tour': 'Tour',
  'score.rank.dame': 'Dame',

  'score.title': 'Rang',
  'score.points': 'points',
  'score.pointsLabel': 'Points',
  /* "encore %s points avant Tour" — the gap, never a percentage. A number of
     points maps onto something the reader can DO; a percentage does not. */
  'score.next': 'encore %s points avant %s',
  'score.top': 'Rang le plus élevé atteint.',
  'score.breakdown': 'D’où viennent les points',
  'score.source.basics': 'Les bases',
  'score.source.lessons': 'Leçons',
  'score.source.exercises': 'Exercices',
  'score.source.games': 'Parties gagnées',
  'score.streak.title': 'Série en cours',
  /* ⚠️ "dans cette session" is load-bearing wording. It tells the reader the
     number is not a record being kept about them, which is exactly why there
     is no daily streak — see progress.ts. */
  'score.streak.value': '%s exercices d’affilée dans cette session',
  'score.achievements': 'Accomplissements',
  'score.achievements.count': '%s sur %s',
  'score.achievements.locked': 'Pas encore',
  'score.toast.earned': 'Accomplissement',

  'score.ach.firstMate': 'Premier mat',
  'score.ach.tenExercises': 'Dix exercices résolus',
  'score.ach.streakFive': 'Cinq d’affilée',
  'score.ach.allMates': 'Tous les mats élémentaires',
  'score.ach.courseComplete': 'Un cours terminé',
  'score.ach.winDebutant': 'Première victoire — Débutant',
  'score.ach.winIntermediaire': 'Première victoire — Intermédiaire',
  'score.ach.winAvance': 'Première victoire — Avancé',

  /* ⚠️ THE HONESTY NOTE, AND IT STAYS. Points are derived from local records
     and localStorage is editable — see CLAUDE.md → anti-cheat. Saying so is
     cheaper than pretending otherwise, and it is the same posture as
     `progress.cleared` directly below it. */
  'score.local':
    'Rang et points sont calculés sur cet appareil, à partir de ce que vous avez résolu.',
  'progress.noJs':
    "L'affichage de la progression a besoin de JavaScript : elle est lue depuis cet appareil.",
  'progress.cleared':
    'Si vous videz les données du navigateur, cette progression disparaît. Elle ne vit que sur cet appareil.',

  /* The three card states (M3). "none" is deliberately the quietest wording on
     the card: it is what every first visitor sees, and an index that shouts it
     reads as a list of failures rather than a list of things to do. */
  'progress.state.none': 'Pas encore commencé',
  'progress.state.started': 'En cours',
  'progress.state.solved': 'Résolu',
  'progress.state.lessonDone': 'Terminé',

  /* The tally under a resume card. Deliberately units-free — the same card
     stands for tutorial steps on one page, lessons on another and exercises
     on a third, and `home.dash.resume.progress` already says "étapes" where
     the journey really is the steps. */
  'progress.countPattern': '%s / %s terminés',

  'menu.label': 'Menu principal',
  'menu.resume': 'Reprendre',
  /* Announced instead of the bare label once resolved, so a screen-reader user
     hears WHERE they are being resumed to. `%s` is the step title. */
  'menu.resume.aria': 'Reprendre — %s',
  'menu.more': 'En savoir plus',
  'home.about.title': 'Un club, et un site pour apprendre entre les séances',
  'home.about.lede':
    "Le Mogador Chess Club enseigne les échecs à Essaouira, aux enfants comme aux adultes. Ce site prolonge les séances : des cours progressifs, une bibliothèque de pièges d'ouverture, des exercices interactifs et une partie contre l'ordinateur — gratuitement, en français comme en anglais, sans compte et sans publicité.",
  'home.about.cta': 'Commencer par les bases',
  'home.pillars.title': 'Trois façons de progresser',
  'home.pillar.learn.title': 'Apprendre',
  'home.pillar.learn.text':
    "Des leçons progressives, du déplacement des pièces jusqu'aux finales.",
  'home.pillar.practise.title': "S'entraîner",
  'home.pillar.practise.text':
    'Des positions à résoudre sur un échiquier interactif, avec indice et solution.',
  'home.pillar.play.title': 'Jouer',
  'home.pillar.play.text':
    "Une partie contre l'ordinateur, directement dans le navigateur. Trois niveaux.",

  'courses.title': 'Cours',
  'courses.intro': "Des leçons progressives, du premier déplacement de pièce à la finale de tours.",

  'traps.title': "Pièges d'ouverture",
  'traps.intro':
    "Les pièges classiques : comment les poser, et surtout comment ne pas tomber dedans.",
  'traps.themes': 'Thèmes',
  'traps.share': 'Partager sur WhatsApp',
  'traps.backToIndex': 'Tous les pièges',

  'replay.board': "Échiquier — position après le coup affiché",
  'replay.start': 'Position de départ',
  'replay.prev': 'Coup précédent',
  'replay.next': 'Coup suivant',
  'replay.end': 'Position finale',
  'replay.moveList': 'Liste des coups',
  'replay.controls': 'Navigation dans la partie',
  'replay.jumpTo': 'Aller au coup',
  'replay.commentary': 'Commentaire',
  'replay.intro': "Utilisez les flèches ← et → du clavier, ou cliquez un coup dans la liste.",
  'replay.launch': 'Lancer la démonstration',
  'board.tag.demo': 'Démonstration — utilise les flèches',
  'board.tag.exercise': 'À toi de jouer',
  'replay.checkmate': 'Échec et mat',
  'replay.startLabel': 'Départ',

  'exercises.title': 'Exercices',
  'exercises.intro': "Des positions à résoudre sur l'échiquier, avec indice et correction.",
  'exercises.moveCount.one': 'coup',
  'exercises.moveCount.other': 'coups',
  'exercises.solved': 'Résolu',
  'exercises.unsolved': 'À résoudre',
  'exercises.backToIndex': 'Tous les exercices',
  'exercises.share': 'Partager sur WhatsApp',

  'exercise.board': 'Échiquier — position à résoudre',
  'exercise.loading': "Chargement de l'échiquier…",
  'exercise.status': 'État de la résolution',
  'exercise.turn.white': 'Aux blancs de jouer',
  'exercise.turn.black': 'Aux noirs de jouer',
  'exercise.instructions':
    "Jouez votre coup sur l'échiquier : glissez une pièce, ou touchez-la puis touchez sa case d'arrivée.",
  'exercise.step': 'Coup',
  'exercise.attempts': 'Essais',
  'exercise.hint.show': "Afficher l'indice",
  'exercise.hint.heading': 'Indice',
  'exercise.correct': 'Bien joué.',
  /* onlyMove: true — the stored line really is the only one that works. */
  'exercise.wrong': "Ce n'est pas le bon coup. Réessayez.",
  /* WHY, not just THAT. The move reached the judge, so it was legal — the site
     knows that and should say it, rather than leaving a beginner to wonder
     whether they attempted something the rules forbid. */
  'exercise.wrong.reason':
    "Ce coup est légal, mais il ne fait pas ce qu'on cherche ici.",
  /* onlyMove: false — see the validation rule in CLAUDE.md. We do NOT say
     "faux": another move may well win, and we cannot yet prove otherwise. */
  'exercise.offLine': "Ce n'est pas la ligne que nous avions en tête. Réessayez.",
  'exercise.offLine.note':
    "D'autres coups gagnent peut-être aussi : le site ne sait pas encore les vérifier, et ne les comptera donc jamais comme des fautes.",
  'exercise.solved': 'Exercice résolu',
  'exercise.solved.again': 'Déjà résolu — vous pouvez le refaire.',
  /* ── The one-time sound invitation (E2) ───────────────────────────────
     Offered once, at the first solve, and never again whichever button is
     pressed. The wording says what it costs ("courts") and where to undo it,
     because an offer that hides its off switch is not discreet, it is sly. */
  'sound.invite.question': 'Activer les sons ?',
  'sound.invite.detail':
    "Des sons courts pendant les exercices. Vous pouvez les couper à tout moment dans Paramètres.",
  'sound.invite.accept': 'Activer',
  'sound.invite.decline': 'Non merci',
  'sound.invite.accepted': 'Son activé. Réglable dans Paramètres.',
  /* E3. Shown only when there is something to show: a re-solve awards nothing
     and prints nothing, rather than "+0 points" — which would read as a mark
     out of ten rather than as the absence of a reward. */
  'exercise.points': '+%s points',
  'exercise.streak': '%s d’affilée',
  'exercise.retry': 'Recommencer',
  'exercise.solution.heading': 'La solution',
  'exercise.solution.hint': 'Cliquez un coup pour revoir la position.',

  /* Keyboard move entry — the alternative to dragging a piece. */
  'move.label': 'Jouer un coup au clavier',
  'move.placeholder': 'Fc4, Cxe5, O-O, f1c4…',
  'move.submit': 'Jouer',
  /* R roi, D dame, T tour, F fou, C cavalier — the French piece letters. */
  'move.help':
    "Notation française (Fc4, Cxe5, O-O), anglaise (Bc4, Nxe5) ou par cases (f1c4). Majuscules : R roi, D dame, T tour, F fou, C cavalier.",
  'move.error.unreadable': "Coup non compris. Essayez « Fc4 », « Cxe5 » ou « f1c4 ».",
  'move.error.illegal': "Ce coup n'est pas possible dans cette position.",
  'move.error.empty': 'Écrivez un coup avant de valider.',

  'play.title': "Jouer contre l'ordinateur",
  'play.intro':
    "Une partie complète contre Stockfish, dans votre navigateur. Rien n'est envoyé nulle part : le moteur tourne sur votre appareil.",
  'play.setup.heading': 'Votre partie',
  'play.colour.legend': 'Vos pièces',
  'play.colour.white': 'Les blancs',
  'play.colour.black': 'Les noirs',
  'play.level.legend': 'Niveau de l’ordinateur',
  'play.start': 'Commencer la partie',
  /* The engine is ~3,6 Mo and is fetched only when this button is pressed. */
  'play.start.note':
    "Le moteur (environ 3,6 Mo) est téléchargé au moment où vous commencez, jamais avant.",
  'play.loading': 'Chargement du moteur…',
  'play.loadError':
    "Le moteur n'a pas pu être chargé. Vérifiez votre connexion et réessayez.",
  'play.retryLoad': 'Réessayer',
  'play.thinking': "L'ordinateur réfléchit…",
  'play.yourTurn': 'À vous de jouer',
  'play.board': 'Échiquier — partie contre l’ordinateur',
  'play.moveList': 'Les coups',
  'play.resign': 'Abandonner',
  'play.newGame': 'Nouvelle partie',
  'play.status': 'État de la partie',
  'play.result.youWin': 'Vous gagnez.',
  'play.result.youLose': 'L’ordinateur gagne.',
  'play.result.checkmate': 'Échec et mat',
  'play.result.stalemate': 'Pat — la partie est nulle.',
  'play.result.draw': 'Partie nulle.',
  'play.result.repetition': 'Nulle par répétition.',
  'play.result.material': 'Nulle : matériel insuffisant pour mater.',
  'play.result.fiftyMove': 'Nulle par la règle des cinquante coups.',
  'play.result.resigned': 'Vous avez abandonné.',
  'play.check': 'Échec',

  'agenda.title': 'Agenda',
  'agenda.intro': 'Les prochaines séances du club.',
  'agenda.empty': 'Aucune séance programmée pour le moment.',

  'contact.title': 'Contact',
  'contact.intro': 'Une question, une inscription, une envie de jouer ? Écrivez-nous.',
  'contact.whatsapp': 'Écrire sur WhatsApp',

  'level.debutant': 'Débutant',
  'level.intermediaire': 'Intermédiaire',
  'level.avance': 'Avancé',
  'level.label': 'Niveau',

  'settings.title': 'Paramètres',
  'settings.intro':
    "L'apparence du site et de l'échiquier. Tout est enregistré sur cet appareil uniquement — rien n'est envoyé nulle part.",
  'settings.mode.heading': 'Apparence',
  'settings.mode.light': 'Clair',
  'settings.mode.dark': 'Sombre',
  'settings.mode.system': 'Comme le système',
  'settings.mode.systemHint': "Suit le réglage de votre téléphone ou de votre ordinateur.",
  /* ── Son (E2) ─────────────────────────────────────────────────────────
     Désactivé par défaut. Le libellé du réglage dit ce que le son fait —
     des sons courts sur les coups — pour qu'on sache ce qu'on active. */
  'settings.sound.heading': 'Son',
  'settings.sound.toggle': 'Sons courts pendant les exercices',
  'settings.sound.hint':
    "Un petit son quand une pièce se pose, quand une prise a lieu, et quand un exercice est réussi. Rien pendant la navigation. Désactivé par défaut.",
  'settings.sound.volume': 'Volume',
  'settings.sound.volume.doux': 'Doux',
  'settings.sound.volume.moyen': 'Moyen',
  'settings.sound.volume.fort': 'Fort',
  'settings.sound.on': 'Son activé.',
  'settings.sound.off': 'Son désactivé.',
  /* ── Level 2 and 3, behind one disclosure ─────────────────────────────
     "Personnaliser" is deliberately ONE control hiding TWO sections. The
     hierarchy is about how many decisions a reader is offered at once, and
     two collapsed panels side by side is two decisions again. */
  'settings.advanced.heading': 'Personnaliser',
  'settings.advanced.hint':
    "Le thème choisit déjà un damier. Ouvrez ceci seulement si vous voulez le vôtre.",
  'settings.board.heading': "Échiquier",
  'settings.board.hint': 'Choisissez un damier. Les coordonnées restent lisibles sur chacun.',
  'settings.board.follow': 'Suivre le thème',
  'settings.board.followHint':
    "Le damier change avec le thème. C'est le réglage par défaut.",
  'settings.board.pinned': 'Ce damier est conservé quand vous changez de thème.',
  'settings.custom.heading': 'Vos propres couleurs',
  'settings.custom.hint':
    "Choisissez les deux couleurs des cases. La couleur des coordonnées est calculée automatiquement pour rester la plus lisible possible.",
  'settings.custom.light': 'Cases claires',
  'settings.custom.dark': 'Cases sombres',
  'settings.custom.apply': 'Appliquer mes couleurs',
  'settings.custom.reset': 'Revenir au damier choisi',
  'settings.custom.active': 'Vos couleurs sont actives.',
  'settings.custom.contrast': 'Contraste des coordonnées',
  'settings.warning.low': 'Lisibilité réduite',
  'settings.warning.detail':
    "Les coordonnées passent sous le seuil de lisibilité recommandé (4,5:1) sur au moins une des deux couleurs. Vous pouvez les garder — l'avertissement restera affiché tant qu'elles sont actives.",
  'settings.preview.label': 'Aperçu du damier',
  'settings.saved': 'Réglage enregistré.',
  'settings.noJs':
    "Les réglages d'apparence ont besoin de JavaScript. Sans lui, le site s'affiche en thème clair et reste entièrement utilisable.",

  'board.classique': 'Classique',
  'board.bois': 'Bois',
  'board.tournoi': 'Vert tournoi',
  'board.bleu': 'Bleu',
  'board.glace': 'Glace',
  'board.phosphore': 'Phosphore',

  /* ── Level 1: the themes (E6) ────────────────────────────────────────
     The hint is one line and says what the theme IS, not what it does —
     a reader picking an appearance is choosing a mood, not a feature. */
  'theme.heading': 'Thème',
  'theme.hint':
    "Le thème règle le fond, les couleurs, le titrage, l'échiquier et les pièces d'un seul coup.",
  'theme.bois': 'Bois',
  'theme.bois.hint': 'Chêne et noyer, fond parchemin, pièces chaleureuses.',
  'theme.marbre': 'Marbre',
  'theme.marbre.hint': 'Blanc veiné et ardoise. Froid, sobre, très net.',
  'theme.souiri': 'Souiri',
  'theme.souiri.hint': "Zellige, bleu d'Essaouira et blanc de chaux.",
  'theme.terminal': 'Terminal',
  'theme.terminal.hint': 'Vert phosphore sur noir. Le clin d’œil rétro.',
  'theme.preview.label': 'Aperçu du thème',

  /* ── The piece sets ──────────────────────────────────────────────── */
  'pieces.heading': 'Pièces',
  'pieces.cburnett': 'Cburnett',
  'pieces.merida': 'Merida',
  'pieces.chessnut': 'Chessnut',
  'pieces.kiwen-suwi': 'Kiwen Suwi',

  'theme.toggle': "Changer l'apparence",
  'theme.now.light': 'Apparence : claire',
  'theme.now.dark': 'Apparence : sombre',
  'theme.now.system': 'Apparence : comme le système',

  'venue.heading': 'Où nous trouver',
  'venue.map': 'Voir sur la carte',
  'footer.credit': 'Site créé par',
  'footer.association': 'En partenariat avec',
  'footer.legalHeading': 'Le site',
  'footer.legal': 'Mentions légales',
  'footer.privacy': 'Confidentialité',
  'footer.source': 'Source (GPL)',
  'footer.pieces': 'Pièces : cburnett',

  /* ── Auth (v2-S1). Accounts add sync; they gate nothing. ─────────────── */
  'auth.signIn': 'Se connecter',
  'auth.account': 'Mon compte',
  'auth.signOut': 'Se déconnecter',
  'login.title': 'Se connecter',
  'login.intro':
    "Recevez un lien par e-mail — pas de mot de passe. Un compte sert à retrouver votre progression sur tous vos appareils ; tout le site reste accessible sans compte.",
  'login.emailLabel': 'Adresse e-mail',
  'login.submit': 'Recevoir le lien',
  'login.sending': 'Envoi…',
  'login.sent.title': 'Vérifiez votre boîte e-mail',
  'login.sent.body':
    "Nous avons envoyé un lien de connexion. Ouvrez-le sur cet appareil ou sur un autre — il fonctionne partout.",
  'login.error': "Le lien n'a pas pu être envoyé. Réessayez dans un instant.",
  'login.invalidEmail': 'Cette adresse e-mail ne semble pas valide.',
  'login.unconfigured': "La connexion n'est pas encore disponible sur cette version du site.",
  'login.guestNote': 'Continuer sans compte',
  'callback.title': 'Connexion…',
  'callback.working': 'Connexion en cours…',
  'callback.failed': "Ce lien n'est plus valide. Demandez-en un nouveau.",
  'callback.retry': 'Retourner à la connexion',
  'child.heading': 'Qui joue ?',
  'child.intro':
    'Choisissez l’élève. Ce choix est retenu sur cet appareil : le téléphone d’un enfant ne le demande qu’une fois.',
  'child.addLabel': 'Ajouter un élève',
  'child.add': 'Ajouter',
  'child.addError': 'Impossible d’ajouter cet élève. Réessayez.',
  'account.title': 'Mon compte',
  'account.intro': 'Votre nom affiché et votre langue. Rien d’autre n’est stocké ici.',
  'account.displayName': 'Prénom affiché',
  'account.locale': 'Langue',
  'account.save': 'Enregistrer',
  'account.saved': 'Enregistré.',
  'account.saveError': "Impossible d'enregistrer. Réessayez.",
  'account.email': 'Adresse e-mail',
  'account.role': 'Rôle',
  'account.role.admin': 'Administrateur',
  'account.role.prof': 'Professeur',
  'account.role.eleve': 'Élève',
  'account.progress.heading': 'Progression',
  /* ── v2-S3 — the import report and the sync state ─────────────────────
     ⚠️ THE REPORT IS NOT DECORATION. A student who worked as a guest for a
     month needs to be TOLD their work arrived: silent success reads exactly
     like silent loss, and the second one is unrecoverable. */
  'account.import.recovered': '%s exercices et %s leçons récupérés depuis cet appareil.',
  'account.import.upToDate': 'Votre progression est à jour.',
  'account.sync.ok': 'Synchronisé.',
  'account.sync.pending': 'En attente de synchronisation.',
  'account.progress.soon': 'À venir',
  'account.progress.body':
    'La synchronisation de votre progression entre appareils arrive prochainement.',
  'account.attendance.heading': 'Présence',
  'account.attendance.soon': 'À venir',
  'account.attendance.body': 'Votre historique de présence aux séances arrivera avec l’agenda.',
  'account.signedOut': 'Vous n’êtes pas connecté.',
  'account.goSignIn': 'Se connecter',

  /* ── Privacy (v2-S1) ─────────────────────────────────────────────────── */
  'privacy.title': 'Politique de confidentialité',
  'privacy.intro':
    "Ce que le club conserve, pourquoi, et comment tout effacer. Le site s'utilise entièrement sans compte.",
  'privacy.guest.heading': 'Sans compte, rien n’est conservé',
  'privacy.guest.body':
    "Vous pouvez lire les cours, les pièges et résoudre les exercices sans créer de compte. Votre progression est alors enregistrée uniquement dans votre navigateur (localStorage) : elle ne quitte jamais votre appareil et nous ne pouvons pas la consulter.",
  'privacy.stored.heading': 'Avec un compte, ce que nous stockons',
  'privacy.stored.name': 'Un prénom d’affichage — jamais le nom complet.',
  'privacy.stored.email': "Votre adresse e-mail, qui sert uniquement à vous envoyer le lien de connexion.",
  'privacy.stored.guardian':
    "Éventuellement un numéro de téléphone de parent, à titre de contact du club. Il ne sert jamais à se connecter et ne reçoit aucun message automatique.",
  'privacy.stored.progress': 'Votre progression : exercices résolus, tentatives, indices utilisés.',
  'privacy.stored.attendance': 'Votre présence aux séances, saisie par un professeur.',
  'privacy.why.heading': 'Pourquoi',
  'privacy.why.body':
    "Retrouver votre progression sur tous vos appareils, et permettre aux professeurs de suivre l’avancement du groupe et la présence. Rien n’est utilisé à d’autres fins : pas de publicité, pas de revente, pas de profilage.",
  'privacy.no.heading': 'Ce que nous ne faisons jamais',
  'privacy.no.photos': 'Aucune photo, jamais.',
  'privacy.no.messaging':
    "Aucune messagerie, aucun commentaire, aucun contenu publié par les utilisateurs. Personne ne peut contacter un enfant via ce site.",
  'privacy.no.tracking':
    "Aucun cookie publicitaire et aucun traceur tiers. La mesure d’audience, quand elle est activée, est anonyme et sans cookie.",
  'privacy.no.passwords': 'Aucun mot de passe n’est créé ni stocké : la connexion se fait par lien e-mail.',
  'privacy.minors.heading': 'Mineurs',
  'privacy.minors.body':
    "Le club enseigne à des enfants. Les données sont réduites au strict minimum : un prénom, une adresse e-mail, la progression. Pour un élève sans adresse personnelle, le compte est créé par un professeur avec l’adresse d’un parent, qui reste le point de contact. Aucune photo n’est publiée et aucun échange direct n’est possible sur le site.",
  'privacy.retention.heading': 'Durée de conservation',
  'privacy.retention.body':
    "Les données sont conservées tant que le compte existe. Un compte inactif depuis deux ans est supprimé. La progression enregistrée localement dans votre navigateur reste sous votre contrôle et peut être effacée à tout moment en vidant les données du site.",
  'privacy.erasure.heading': 'Effacement',
  'privacy.erasure.body':
    "Vous pouvez demander la suppression de votre compte à tout moment. La suppression est en cascade : le compte, le profil, la progression et les présences sont effacés ensemble — il ne reste rien à récupérer.",
  'privacy.processor.heading': 'Hébergement des données',
  'privacy.processor.body':
    "Les comptes et la progression sont hébergés par Supabase, en tant que sous-traitant, sur une infrastructure située dans l’Union européenne. Le site lui-même est servi par Cloudflare. Aucune donnée n’est transmise à d’autres tiers.",
  'privacy.contact.heading': 'Contact',
  'privacy.contact.body':
    'Pour toute question ou demande de suppression, écrivez au club via WhatsApp.',
  'privacy.updated': 'Dernière mise à jour',

  'legal.title': 'Mentions légales',
  'legal.intro':
    "Éditeur, hébergeur, licence du code et crédits des ressources utilisées par ce site.",
  'legal.editor.heading': 'Éditeur',
  'legal.editor.role': 'Développement et publication',
  'legal.host.heading': 'Hébergeur',
  'legal.host.note':
    "Le site est entièrement statique : il n'y a ni base de données, ni compte utilisateur, ni traitement de données personnelles côté serveur.",
  'legal.licence.heading': 'Licence et code source',
  'legal.licence.body':
    "Ce site utilise Chessground, la bibliothèque d'échiquier de Lichess, publiée sous licence GNU GPL v3. L'œuvre combinée ne peut donc être distribuée que sous cette même licence, et son code source doit être mis à la disposition de ses utilisateurs. Le dépôt est public : le lien ci-dessous est cette mise à disposition.",
  'legal.licence.source': 'Code source du site',
  'legal.licence.text': 'Texte de la licence GNU GPL v3',
  'legal.content.heading': 'Le code et le contenu ont deux licences',
  'legal.content.body':
    "Le logiciel de ce site est sous licence GNU GPL v3 ou ultérieure. Le contenu pédagogique — les textes français et anglais, les commentaires de coups, le choix des lignes montrées et la conception des exercices — est une œuvre distincte, simplement réunie avec le code dans le même dépôt.",
  'legal.content.terms':
    "Ce contenu est mis à disposition sous licence Creative Commons Attribution – Pas d'Utilisation Commerciale – Pas de Modification 4.0. Vous pouvez le partager tel quel, gratuitement, en citant le club. Vous ne pouvez ni le vendre, ni en publier une version modifiée ou traduite.",
  'legal.content.structure':
    "La distinction porte sur le fond, pas sur la forme : les schémas, les noms de champs et le format des fichiers restent du logiciel sous GPL. Vous pouvez donc reprendre ce site, écrire vos propres leçons et les publier, y compris commercialement — ce sont nos leçons à nous qui ne sont pas réutilisables ainsi.",
  'legal.content.link': 'Licence du contenu (CC BY-NC-ND 4.0)',
  'legal.content.ask': "Pour tout usage que cette licence n'autorise pas, écrivez-nous : la réponse est très probablement oui pour une école ou un club.",
  'legal.credits.heading': 'Crédits et licences des ressources',
  'legal.credits.intro':
    "Les ressources marquées d'un astérisque sont sous licence à réciprocité (GPL, CC BY-SA) : leur crédit est une obligation, pas une politesse.",
  'legal.credits.pieces.heading': 'Jeu de pièces',
  'legal.credits.pieces.body':
    "Les pièces affichées sur les échiquiers sont le jeu « cburnett », dessiné par Colin M. L. Burnett et diffusé sous licence Creative Commons Attribution-ShareAlike 3.0. Il est utilisé tel quel, sans modification.",
  'legal.table.work': 'Ressource',
  'legal.table.author': 'Auteur',
  'legal.table.licence': 'Licence',
  'legal.privacy.heading': 'Données et mesure d’audience',
  'legal.privacy.body':
    "Le site ne dépose aucun cookie et ne collecte aucune donnée personnelle. La progression dans les exercices est enregistrée dans le stockage local de votre navigateur, sur votre appareil uniquement : elle ne nous est jamais transmise et disparaît si vous videz votre navigateur.",
  'legal.privacy.analytics':
    "Si une mesure d'audience est activée, elle utilise Umami, sans cookie et sans identifiant permettant de vous reconnaître d'un site à l'autre. Elle est désactivée tant qu'elle n'est pas configurée.",
  'legal.thirdParty.heading': 'Requêtes vers des tiers',
  'legal.thirdParty.body':
    "Aucune ressource n'est chargée depuis un service tiers sans une action explicite de votre part. Les polices et les images sont servies par ce site. Une vidéo intégrée ne se charge qu'après un clic sur son aperçu.",
} as const;

const en: Record<keyof typeof fr, string> = {
  'nav.home': 'Home',
  'nav.courses': 'Courses',
  'nav.traps': 'Opening traps',
  'nav.exercises': 'Exercises',
  'nav.play': 'Play',
  'nav.agenda': 'Schedule',
  'nav.contact': 'Contact',
  'nav.group.learn': 'Learn',
  'nav.group.practise': 'Practise',
  'nav.group.club': 'The club',
  'nav.basics': 'The basics',
  'nav.label': 'Main navigation',
  'nav.skipToContent': 'Skip to main content',

  'lang.switchTo': 'Français',
  'lang.label': 'Change language',

  'home.title': 'Mogador Chess Club',
  'home.intro':
    "Essaouira's chess club. Progressive courses, an opening-trap library, and exercises to practise on — in English as well as French.",
  'tutorial.title': 'Learn the basics',
  'tutorial.intro':
    'Never played chess? Start here. Thirteen short steps, a board on every one, and you will know how to play a full game.',
  'tutorial.homeCta': 'New to chess? Start here',
  'tutorial.prerequisite': 'Never played? Start by learning the basics.',
  'tutorial.step': 'Step',
  'tutorial.of': 'of',
  'tutorial.prev': 'Previous',
  'tutorial.next': 'Next',
  'tutorial.backToIndex': 'All steps',
  'nav.backToCourse': 'All lessons',
  'nav.whatNext': 'What next?',
  'nav.toTraps': 'Opening traps',
  'tutorial.yourTurn': 'Your turn',
  'tutorial.done': 'Done',
  'tutorial.finished.title': 'You know the rules.',
  'tutorial.finished.body':
    'You can now play a full game. Next: the exercises to practise on, or a game against the computer.',
  'tutorial.toExercises': 'Go to the exercises',
  'tutorial.toPlay': 'Play the computer',

  'home.cta.play': 'Play',
  'home.cta.traps': 'Explore traps',

  'nav.progress': 'Progress',
  'nav.mobile': 'Main navigation',

  'home.dash.play.title': 'Play a game',
  'home.dash.play.text': 'Against the computer, in your browser. Three levels.',
  'home.dash.resume.title': 'Resume',
  'home.dash.resume.progress': '%s / %s steps',
  'home.dash.basics.title': 'Learn the basics',
  'home.dash.basics.text': 'Thirteen short steps, from scratch.',
  'home.dash.playShort.title': 'Play',
  'home.dash.playShort.text': 'A game against the computer.',
  'home.dash.practise.title': 'Practise',
  'home.dash.practise.text': 'Positions to solve.',
  'home.dash.stats.solved': 'solved',
  'home.dash.stats.lessons': 'lessons',
  'home.dash.stats.rank': 'Rank',
  'home.dash.stats.soon': 'soon',
  'home.dash.next.title': 'Next session',
  'home.dash.next.none': 'No session announced yet.',

  'progress.title': 'Progress',
  'progress.intro':
    'What you have finished. Everything is saved on this device only — nothing is sent anywhere.',
  'progress.basics': 'The basics',
  'progress.courses': 'Courses',
  'progress.exercises': 'Exercises',
  'progress.of': 'of',
  'progress.sections.done': 'What you have finished',
  'progress.sections.byLevel': 'Exercises by level',
  'progress.sections.byTheme': 'Exercises by theme',
  'progress.sections.next': 'What comes next',
  'progress.allDone': 'You have finished everything. Well played.',
  'progress.rank': 'Rank and points',

  /* E3. The rank names are the PIECES, so they translate as pieces. */
  'score.rank.pion': 'Pawn',
  'score.rank.cavalier': 'Knight',
  'score.rank.fou': 'Bishop',
  'score.rank.tour': 'Rook',
  'score.rank.dame': 'Queen',

  'score.title': 'Rank',
  'score.points': 'points',
  'score.pointsLabel': 'Points',
  'score.next': '%s more points to reach %s',
  'score.top': 'Highest rank reached.',
  'score.breakdown': 'Where the points come from',
  'score.source.basics': 'The basics',
  'score.source.lessons': 'Lessons',
  'score.source.exercises': 'Exercises',
  'score.source.games': 'Games won',
  'score.streak.title': 'Current run',
  'score.streak.value': '%s exercises in a row this session',
  'score.achievements': 'Achievements',
  'score.achievements.count': '%s of %s',
  'score.achievements.locked': 'Not yet',
  'score.toast.earned': 'Achievement',

  'score.ach.firstMate': 'First checkmate',
  'score.ach.tenExercises': 'Ten exercises solved',
  'score.ach.streakFive': 'Five in a row',
  'score.ach.allMates': 'Every elementary mate',
  'score.ach.courseComplete': 'A course finished',
  'score.ach.winDebutant': 'First win — Beginner',
  'score.ach.winIntermediaire': 'First win — Intermediate',
  'score.ach.winAvance': 'First win — Advanced',

  'score.local': 'Rank and points are worked out on this device, from what you have solved.',
  'progress.noJs': 'Showing your progress needs JavaScript: it is read from this device.',
  'progress.cleared':
    'If you clear your browser data this progress disappears. It lives on this device only.',

  'progress.state.none': 'Not started',
  'progress.state.started': 'In progress',
  'progress.state.solved': 'Solved',
  'progress.state.lessonDone': 'Completed',

  'progress.countPattern': '%s / %s done',

  'menu.label': 'Main menu',
  'menu.resume': 'Resume',
  'menu.resume.aria': 'Resume — %s',
  'menu.more': 'Find out more',
  'home.about.title': 'A club, and a site to learn between sessions',
  'home.about.lede':
    'Mogador Chess Club teaches chess in Essaouira, to children and adults alike. This site carries on between sessions: progressive courses, a library of opening traps, interactive exercises and a game against the computer — free, in English as well as French, with no account and no advertising.',
  'home.about.cta': 'Start with the basics',
  'home.pillars.title': 'Three ways to get better',
  'home.pillar.learn.title': 'Learn',
  'home.pillar.learn.text': 'Step-by-step lessons, from moving the pieces to endgames.',
  'home.pillar.practise.title': 'Practise',
  'home.pillar.practise.text':
    'Positions to solve on an interactive board, with a hint and a solution.',
  'home.pillar.play.title': 'Play',
  'home.pillar.play.text': 'A game against the computer, right in your browser. Three levels.',

  'courses.title': 'Courses',
  'courses.intro': 'Step-by-step lessons, from your first piece move to rook endgames.',

  'traps.title': 'Opening traps',
  'traps.intro': 'The classic traps: how to set them, and above all how not to fall for them.',
  'traps.themes': 'Themes',
  'traps.share': 'Share on WhatsApp',
  'traps.backToIndex': 'All traps',

  'replay.board': 'Chessboard — position after the displayed move',
  'replay.start': 'Starting position',
  'replay.prev': 'Previous move',
  'replay.next': 'Next move',
  'replay.end': 'Final position',
  'replay.moveList': 'Move list',
  'replay.controls': 'Game navigation',
  'replay.jumpTo': 'Go to move',
  'replay.commentary': 'Commentary',
  'replay.intro': 'Use the ← and → arrow keys, or click a move in the list.',
  'replay.launch': 'Play the demonstration',
  'board.tag.demo': 'Demonstration — use the arrows',
  'board.tag.exercise': 'Your turn',
  'replay.checkmate': 'Checkmate',
  'replay.startLabel': 'Start',

  'exercises.title': 'Exercises',
  'exercises.intro': 'Positions to solve on the board, with a hint and a solution.',
  'exercises.moveCount.one': 'move',
  'exercises.moveCount.other': 'moves',
  'exercises.solved': 'Solved',
  'exercises.unsolved': 'To solve',
  'exercises.backToIndex': 'All exercises',
  'exercises.share': 'Share on WhatsApp',

  'exercise.board': 'Chessboard — the position to solve',
  'exercise.loading': 'Loading the board…',
  'exercise.status': 'Solving status',
  'exercise.turn.white': 'White to move',
  'exercise.turn.black': 'Black to move',
  'exercise.instructions':
    'Play your move on the board: drag a piece, or tap it and then tap its destination square.',
  'exercise.step': 'Move',
  'exercise.attempts': 'Attempts',
  'exercise.hint.show': 'Show the hint',
  'exercise.hint.heading': 'Hint',
  'exercise.correct': 'Well played.',
  'exercise.wrong': 'That is not the right move. Try again.',
  'exercise.wrong.reason': "That move is legal, but it isn't what we're looking for here.",
  'exercise.offLine': 'That is not the line we had in mind. Try again.',
  'exercise.offLine.note':
    'Other moves may well win too: the site cannot check them yet, so it will never count them as mistakes.',
  'exercise.solved': 'Exercise solved',
  'exercise.solved.again': 'Already solved — you can play it again.',
  /* ── The one-time sound invitation (E2). See the FR note above. */
  'sound.invite.question': 'Turn sound on?',
  'sound.invite.detail':
    'Short sounds during exercises. You can switch them off at any time in Settings.',
  'sound.invite.accept': 'Turn on',
  'sound.invite.decline': 'No thanks',
  'sound.invite.accepted': 'Sound on. Adjustable in Settings.',
  'exercise.points': '+%s points',
  'exercise.streak': '%s in a row',
  'exercise.retry': 'Start again',
  'exercise.solution.heading': 'The solution',
  'exercise.solution.hint': 'Click a move to see the position again.',

  'move.label': 'Play a move with the keyboard',
  'move.placeholder': 'Bc4, Nxe5, O-O, f1c4…',
  'move.submit': 'Play',
  'move.help':
    'Standard notation (Bc4, Nxe5, O-O) or plain squares (f1c4). French piece letters work too: R king, D queen, T rook, F bishop, C knight.',
  'move.error.unreadable': 'Move not understood. Try "Bc4", "Nxe5" or "f1c4".',
  'move.error.illegal': 'That move is not possible in this position.',
  'move.error.empty': 'Type a move before playing it.',

  'play.title': 'Play the computer',
  'play.intro':
    'A full game against Stockfish, in your browser. Nothing is sent anywhere: the engine runs on your own device.',
  'play.setup.heading': 'Your game',
  'play.colour.legend': 'Your pieces',
  'play.colour.white': 'White',
  'play.colour.black': 'Black',
  'play.level.legend': 'Computer level',
  'play.start': 'Start the game',
  'play.start.note':
    'The engine (about 3.6 MB) is downloaded when you start, never before.',
  'play.loading': 'Loading the engine…',
  'play.loadError': 'The engine could not be loaded. Check your connection and try again.',
  'play.retryLoad': 'Try again',
  'play.thinking': 'The computer is thinking…',
  'play.yourTurn': 'Your move',
  'play.board': 'Chessboard — game against the computer',
  'play.moveList': 'Moves',
  'play.resign': 'Resign',
  'play.newGame': 'New game',
  'play.status': 'Game state',
  'play.result.youWin': 'You win.',
  'play.result.youLose': 'The computer wins.',
  'play.result.checkmate': 'Checkmate',
  'play.result.stalemate': 'Stalemate — the game is drawn.',
  'play.result.draw': 'The game is drawn.',
  'play.result.repetition': 'Draw by repetition.',
  'play.result.material': 'Draw: not enough material to mate.',
  'play.result.fiftyMove': 'Draw by the fifty-move rule.',
  'play.result.resigned': 'You resigned.',
  'play.check': 'Check',

  'agenda.title': 'Schedule',
  'agenda.intro': "The club's upcoming sessions.",
  'agenda.empty': 'No sessions scheduled at the moment.',

  'contact.title': 'Contact',
  'contact.intro': 'A question, a sign-up, or just want a game? Get in touch.',
  'contact.whatsapp': 'Message us on WhatsApp',

  'level.debutant': 'Beginner',
  'level.intermediaire': 'Intermediate',
  'level.avance': 'Advanced',
  'level.label': 'Level',

  'settings.title': 'Settings',
  'settings.intro':
    'How the site and the board look. Everything is saved on this device only — nothing is sent anywhere.',
  'settings.mode.heading': 'Appearance',
  'settings.mode.light': 'Light',
  'settings.mode.dark': 'Dark',
  'settings.mode.system': 'Match the system',
  'settings.mode.systemHint': 'Follows the setting on your phone or computer.',
  /* ── Sound (E2) — off by default. See the FR note above. */
  'settings.sound.heading': 'Sound',
  'settings.sound.toggle': 'Short sounds during exercises',
  'settings.sound.hint':
    'A small sound when a piece lands, when something is captured, and when an exercise is solved. Nothing while you browse. Off by default.',
  'settings.sound.volume': 'Volume',
  'settings.sound.volume.doux': 'Soft',
  'settings.sound.volume.moyen': 'Medium',
  'settings.sound.volume.fort': 'Loud',
  'settings.sound.on': 'Sound on.',
  'settings.sound.off': 'Sound off.',
  'settings.advanced.heading': 'Customise',
  'settings.advanced.hint':
    'The theme already picks a board. Open this only if you want your own.',
  'settings.board.heading': 'Board',
  'settings.board.hint': 'Pick a board. The coordinates stay legible on every one of them.',
  'settings.board.follow': 'Follow the theme',
  'settings.board.followHint': 'The board changes with the theme. This is the default.',
  'settings.board.pinned': 'This board is kept when you change theme.',
  'settings.custom.heading': 'Your own colours',
  'settings.custom.hint':
    'Choose the two square colours. The coordinate colour is worked out automatically to stay as legible as possible.',
  'settings.custom.light': 'Light squares',
  'settings.custom.dark': 'Dark squares',
  'settings.custom.apply': 'Use my colours',
  'settings.custom.reset': 'Back to the chosen board',
  'settings.custom.active': 'Your colours are in use.',
  'settings.custom.contrast': 'Coordinate contrast',
  'settings.warning.low': 'Reduced legibility',
  'settings.warning.detail':
    'The coordinates fall below the recommended legibility threshold (4.5:1) on at least one of the two colours. You may keep them — this warning will stay while they are in use.',
  'settings.preview.label': 'Board preview',
  'settings.saved': 'Setting saved.',
  'settings.noJs':
    'Appearance settings need JavaScript. Without it the site renders in the light theme and stays fully usable.',

  'board.classique': 'Classic',
  'board.bois': 'Wood',
  'board.tournoi': 'Tournament green',
  'board.bleu': 'Blue',
  'board.glace': 'Ice',
  'board.phosphore': 'Phosphor',

  'theme.heading': 'Theme',
  'theme.hint':
    'A theme sets the background, the colours, the headings, the board and the pieces in one go.',
  /* ⚠️ "Bois" and "Souiri" are NOT translated, and that is deliberate.
     "Souiri" is what someone from Essaouira is called — translating it to
     "Essaouira style" would turn the identity theme into a description of
     itself. "Bois" becomes "Wood" because it names a material, not a place.
     "Marbre"/"Marble" likewise. */
  'theme.bois': 'Wood',
  'theme.bois.hint': 'Oak and walnut, parchment background, warm pieces.',
  'theme.marbre': 'Marble',
  'theme.marbre.hint': 'Veined white and slate. Cool, sober, very crisp.',
  'theme.souiri': 'Souiri',
  'theme.souiri.hint': 'Zellige, Essaouira blue and lime white.',
  'theme.terminal': 'Terminal',
  'theme.terminal.hint': 'Phosphor green on black. The retro nod.',
  'theme.preview.label': 'Theme preview',

  'pieces.heading': 'Pieces',
  'pieces.cburnett': 'Cburnett',
  'pieces.merida': 'Merida',
  'pieces.chessnut': 'Chessnut',
  'pieces.kiwen-suwi': 'Kiwen Suwi',

  'theme.toggle': 'Change the appearance',
  'theme.now.light': 'Appearance: light',
  'theme.now.dark': 'Appearance: dark',
  'theme.now.system': 'Appearance: match the system',

  'venue.heading': 'Where to find us',
  'venue.map': 'View on the map',
  'footer.credit': 'Site by',
  'footer.association': 'In partnership with',
  'footer.legalHeading': 'The site',
  'footer.legal': 'Legal notice',
  'footer.privacy': 'Privacy',
  'footer.source': 'Source (GPL)',
  'footer.pieces': 'Pieces: cburnett',

  'auth.signIn': 'Sign in',
  'auth.account': 'My account',
  'auth.signOut': 'Sign out',
  'login.title': 'Sign in',
  'login.intro':
    'Get a link by email — no password. An account keeps your progress across your devices; the whole site stays available without one.',
  'login.emailLabel': 'Email address',
  'login.submit': 'Send the link',
  'login.sending': 'Sending…',
  'login.sent.title': 'Check your email',
  'login.sent.body':
    'We have sent a sign-in link. Open it on this device or another — it works anywhere.',
  'login.error': 'The link could not be sent. Try again in a moment.',
  'login.invalidEmail': 'That email address does not look valid.',
  'login.unconfigured': 'Signing in is not available yet on this version of the site.',
  'login.guestNote': 'Continue without an account',
  'callback.title': 'Signing in…',
  'callback.working': 'Signing you in…',
  'callback.failed': 'This link is no longer valid. Request a new one.',
  'callback.retry': 'Back to sign in',
  'child.heading': 'Who is playing?',
  'child.intro':
    'Choose the student. The choice is remembered on this device: a child’s own phone only asks once.',
  'child.addLabel': 'Add a student',
  'child.add': 'Add',
  'child.addError': 'Could not add this student. Please try again.',
  'account.title': 'My account',
  'account.intro': 'Your display name and language. Nothing else is stored here.',
  'account.displayName': 'Display first name',
  'account.locale': 'Language',
  'account.save': 'Save',
  'account.saved': 'Saved.',
  'account.saveError': 'Could not save. Try again.',
  'account.email': 'Email address',
  'account.role': 'Role',
  'account.role.admin': 'Administrator',
  'account.role.prof': 'Teacher',
  'account.role.eleve': 'Student',
  'account.progress.heading': 'Progress',
  /* ── v2-S3. See the FR note above. */
  'account.import.recovered': '%s exercises and %s lessons recovered from this device.',
  'account.import.upToDate': 'Your progress is up to date.',
  'account.sync.ok': 'Synced.',
  'account.sync.pending': 'Waiting to sync.',
  'account.progress.soon': 'Coming soon',
  'account.progress.body': 'Syncing your progress across devices is coming shortly.',
  'account.attendance.heading': 'Attendance',
  'account.attendance.soon': 'Coming soon',
  'account.attendance.body': 'Your session attendance history will arrive with the schedule.',
  'account.signedOut': 'You are not signed in.',
  'account.goSignIn': 'Sign in',

  'privacy.title': 'Privacy policy',
  'privacy.intro':
    'What the club keeps, why, and how to erase all of it. The site works entirely without an account.',
  'privacy.guest.heading': 'Without an account, we keep nothing',
  'privacy.guest.body':
    'You can read the courses and traps and solve the exercises without creating an account. Your progress is then stored only in your browser (localStorage): it never leaves your device and we cannot see it.',
  'privacy.stored.heading': 'With an account, what we store',
  'privacy.stored.name': 'A display first name — never a full name.',
  'privacy.stored.email': 'Your email address, used only to send you the sign-in link.',
  'privacy.stored.guardian':
    'Optionally a parent phone number, as a contact for the club. It is never used to sign in and receives no automated messages.',
  'privacy.stored.progress': 'Your progress: exercises solved, attempts, hints used.',
  'privacy.stored.attendance': 'Your attendance at sessions, recorded by a teacher.',
  'privacy.why.heading': 'Why',
  'privacy.why.body':
    'To keep your progress across your devices, and to let teachers follow the group and attendance. Nothing is used for anything else: no advertising, no resale, no profiling.',
  'privacy.no.heading': 'What we never do',
  'privacy.no.photos': 'No photographs, ever.',
  'privacy.no.messaging':
    'No messaging, no comments, no user-submitted content of any kind. Nobody can contact a child through this site.',
  'privacy.no.tracking':
    'No advertising cookies and no third-party trackers. Audience measurement, when enabled, is anonymous and cookie-free.',
  'privacy.no.passwords': 'No password is created or stored: signing in is by email link.',
  'privacy.minors.heading': 'Minors',
  'privacy.minors.body':
    'The club teaches children. Data is kept to the strict minimum: a first name, an email address, progress. For a student without their own address, a teacher creates the account using a parent’s address, and that parent remains the point of contact. No photographs are published and no direct contact is possible on the site.',
  'privacy.retention.heading': 'How long we keep it',
  'privacy.retention.body':
    'Data is kept for as long as the account exists. An account inactive for two years is deleted. Progress stored locally in your browser stays under your control and can be cleared at any time by clearing the site’s data.',
  'privacy.erasure.heading': 'Erasure',
  'privacy.erasure.body':
    'You can ask for your account to be deleted at any time. Deletion cascades: the account, the profile, the progress and the attendance records are erased together — nothing is left behind to recover.',
  'privacy.processor.heading': 'Where the data lives',
  'privacy.processor.body':
    'Accounts and progress are hosted by Supabase, acting as a processor, on infrastructure located in the European Union. The site itself is served by Cloudflare. No data is passed to any other third party.',
  'privacy.contact.heading': 'Contact',
  'privacy.contact.body': 'For any question or deletion request, message the club on WhatsApp.',
  'privacy.updated': 'Last updated',

  'legal.title': 'Legal notice',
  'legal.intro':
    'Publisher, host, source licence, and credits for the resources this site uses.',
  'legal.editor.heading': 'Publisher',
  'legal.editor.role': 'Development and publication',
  'legal.host.heading': 'Host',
  'legal.host.note':
    'The site is fully static: there is no database, no user account, and no personal data processed on any server.',
  'legal.licence.heading': 'Licence and source code',
  'legal.licence.body':
    "This site uses Chessground, Lichess's chessboard library, released under the GNU GPL v3. The combined work may therefore be distributed only under that same licence, and its source code must be made available to its users. The repository is public: the link below is that availability.",
  'legal.licence.source': 'Source code of this site',
  'legal.licence.text': 'Text of the GNU GPL v3',
  'legal.content.heading': 'The code and the content are licensed separately',
  'legal.content.body':
    'The software behind this site is licensed under the GNU GPL v3 or later. The teaching content — the French and English text, the move commentary, the choice of lines shown and the design of the exercises — is a separate work, merely gathered together with the code in one repository.',
  'legal.content.terms':
    'That content is available under the Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 licence. You may share it as it is, free of charge, crediting the club. You may not sell it, nor publish a modified or translated version of it.',
  'legal.content.structure':
    'The distinction is substance, not shape: the schemas, the field names and the file format remain GPL software. You are free to take this site, write your own lessons and publish them, commercially if you like — it is our lessons specifically that cannot be reused that way.',
  'legal.content.link': 'Content licence (CC BY-NC-ND 4.0)',
  'legal.content.ask':
    'For anything this licence does not allow, just ask — for a school or a community club the answer is very likely yes.',
  'legal.credits.heading': 'Credits and resource licences',
  'legal.credits.intro':
    'Resources marked with an asterisk are under share-alike licences (GPL, CC BY-SA): crediting them is an obligation, not a courtesy.',
  'legal.credits.pieces.heading': 'Piece set',
  'legal.credits.pieces.body':
    'The pieces shown on the boards are the "cburnett" set, drawn by Colin M. L. Burnett and released under the Creative Commons Attribution-ShareAlike 3.0 licence. It is used as-is, unmodified.',
  'legal.table.work': 'Resource',
  'legal.table.author': 'Author',
  'legal.table.licence': 'Licence',
  'legal.privacy.heading': 'Data and analytics',
  'legal.privacy.body':
    'The site sets no cookies and collects no personal data. Exercise progress is stored in your browser’s local storage, on your device only: it is never sent to us, and it disappears if you clear your browser.',
  'legal.privacy.analytics':
    'If analytics are enabled, they use Umami — no cookies, and no identifier that could recognise you across sites. They stay switched off until configured.',
  'legal.thirdParty.heading': 'Third-party requests',
  'legal.thirdParty.body':
    'No resource is loaded from a third-party service without an explicit action from you. Fonts and images are served by this site. An embedded video loads only after you click its preview.',
};

export type UIKey = keyof typeof fr;

const TABLES: Record<Locale, Record<UIKey, string>> = { fr, en };

/** Translator bound to one locale — `const t = useTranslations(locale)`. */
export function useTranslations(locale: Locale): (key: UIKey) => string {
  const table = TABLES[locale] ?? TABLES[DEFAULT_LOCALE];
  return (key: UIKey) => table[key];
}

/**
 * The nav, grouped.
 *
 * Seven flat items had outgrown a single row — especially on a phone, where
 * they wrapped into an unreadable block. Three groups follow how the site is
 * actually used: you learn something, you practise it, or you want the club
 * itself.
 *
 *  stays a top-level link rather than joining a group: home is where the
 * logo already goes, and burying it would be worse than the wrap.
 */
export const NAV_GROUPS = [
  {
    key: 'nav.group.learn',
    id: 'learn',
    items: [
      { path: '/apprendre-les-bases/', key: 'nav.basics' },
      { path: '/cours/', key: 'nav.courses' },
      { path: '/pieges/', key: 'nav.traps' },
    ],
  },
  {
    key: 'nav.group.practise',
    id: 'practise',
    items: [
      { path: '/exercices/', key: 'nav.exercises' },
      { path: '/jouer/', key: 'nav.play' },
    ],
  },
  {
    key: 'nav.group.club',
    id: 'club',
    items: [
      { path: '/agenda/', key: 'nav.agenda' },
      { path: '/contact/', key: 'nav.contact' },
    ],
  },
] as const satisfies readonly {
  key: UIKey;
  id: string;
  items: readonly { path: string; key: UIKey }[];
}[];

/** Level → its label key. Keeps the badge component free of a switch statement. */
export const LEVEL_KEYS = {
  debutant: 'level.debutant',
  intermediaire: 'level.intermediaire',
  avance: 'level.avance',
} as const satisfies Record<string, UIKey>;
