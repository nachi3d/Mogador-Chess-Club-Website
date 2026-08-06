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
  'nav.agenda': 'Agenda',
  'nav.contact': 'Contact',
  'nav.label': 'Navigation principale',
  'nav.skipToContent': 'Aller au contenu principal',

  'lang.switchTo': 'English',
  'lang.label': 'Changer de langue',

  'home.title': 'Mogador Chess Club',
  'home.intro':
    "Le club d'échecs d'Essaouira. Des cours progressifs, une bibliothèque de pièges d'ouverture, et des exercices pour s'entraîner — en français comme en anglais.",
  'home.cta.courses': 'Commencer les cours',
  'home.cta.traps': 'Explorer les pièges',

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
  /* onlyMove: false — see the validation rule in CLAUDE.md. We do NOT say
     "faux": another move may well win, and we cannot yet prove otherwise. */
  'exercise.offLine': "Ce n'est pas la ligne que nous avions en tête. Réessayez.",
  'exercise.offLine.note':
    "D'autres coups gagnent peut-être aussi : le site ne sait pas encore les vérifier, et ne les comptera donc jamais comme des fautes.",
  'exercise.solved': 'Exercice résolu',
  'exercise.solved.again': 'Déjà résolu — vous pouvez le refaire.',
  'exercise.retry': 'Recommencer',
  'exercise.solution.heading': 'La solution',
  'exercise.solution.hint': 'Cliquez un coup pour revoir la position.',

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

  'venue.heading': 'Où nous trouver',
  'venue.map': 'Voir sur la carte',
  'footer.credit': 'Site créé par',
  'footer.association': 'En partenariat avec',
  'footer.legalHeading': 'Le site',
  'footer.legal': 'Mentions légales',
  'footer.source': 'Source (GPL)',
  'footer.pieces': 'Pièces : cburnett',

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
  'nav.agenda': 'Schedule',
  'nav.contact': 'Contact',
  'nav.label': 'Main navigation',
  'nav.skipToContent': 'Skip to main content',

  'lang.switchTo': 'Français',
  'lang.label': 'Change language',

  'home.title': 'Mogador Chess Club',
  'home.intro':
    "Essaouira's chess club. Progressive courses, an opening-trap library, and exercises to practise on — in English as well as French.",
  'home.cta.courses': 'Start the courses',
  'home.cta.traps': 'Explore the traps',

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
  'exercise.offLine': 'That is not the line we had in mind. Try again.',
  'exercise.offLine.note':
    'Other moves may well win too: the site cannot check them yet, so it will never count them as mistakes.',
  'exercise.solved': 'Exercise solved',
  'exercise.solved.again': 'Already solved — you can play it again.',
  'exercise.retry': 'Start again',
  'exercise.solution.heading': 'The solution',
  'exercise.solution.hint': 'Click a move to see the position again.',

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

  'venue.heading': 'Where to find us',
  'venue.map': 'View on the map',
  'footer.credit': 'Site by',
  'footer.association': 'In partnership with',
  'footer.legalHeading': 'The site',
  'footer.legal': 'Legal notice',
  'footer.source': 'Source (GPL)',
  'footer.pieces': 'Pieces: cburnett',

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

/** The nav, in render order. Route + its label key — one list, both locales. */
export const NAV_ITEMS = [
  { path: '/', key: 'nav.home' },
  { path: '/cours/', key: 'nav.courses' },
  { path: '/pieges/', key: 'nav.traps' },
  { path: '/exercices/', key: 'nav.exercises' },
  { path: '/agenda/', key: 'nav.agenda' },
  { path: '/contact/', key: 'nav.contact' },
] as const satisfies readonly { path: string; key: UIKey }[];

/** Level → its label key. Keeps the badge component free of a switch statement. */
export const LEVEL_KEYS = {
  debutant: 'level.debutant',
  intermediaire: 'level.intermediaire',
  avance: 'level.avance',
} as const satisfies Record<string, UIKey>;
