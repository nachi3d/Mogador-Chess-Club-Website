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

  'exercises.title': 'Exercices',
  'exercises.intro': "Des positions à résoudre sur l'échiquier, avec indice et correction.",
  'exercises.moveCount.one': 'coup',
  'exercises.moveCount.other': 'coups',

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

  'exercises.title': 'Exercises',
  'exercises.intro': 'Positions to solve on the board, with a hint and a solution.',
  'exercises.moveCount.one': 'move',
  'exercises.moveCount.other': 'moves',

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
