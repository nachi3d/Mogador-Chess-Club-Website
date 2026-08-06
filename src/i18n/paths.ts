/**
 * Locale-aware path building.
 *
 * CLAUDE.md Critical Feature: "every public page in both languages; the
 * switcher preserves the path; FR default at root." That last part is the whole
 * reason this module exists — FR lives at `/pieges/`, EN at `/en/pieges/`, and
 * the switcher has to map between them without dumping the visitor on the home
 * page.
 *
 * Paths are emitted WITH a trailing slash to match `build.format: 'directory'`,
 * so the href and the emitted file agree exactly and no redirect hop is needed.
 *
 * NOTE: route SEGMENTS are not translated — `/en/pieges/`, not `/en/traps/`.
 * One segment vocabulary means the switcher is a pure prefix swap and can never
 * fail to find its counterpart. The visible nav labels are translated; the URLs
 * are structural.
 */

import { DEFAULT_LOCALE, LOCALES, type Locale } from '@config/site';

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Which locale is this URL serving? `/en/pieges/` → 'en', `/pieges/` → 'fr'. */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0];
  return first !== undefined && isLocale(first) && first !== DEFAULT_LOCALE ? first : DEFAULT_LOCALE;
}

/** `/en/pieges/fried-liver/` → `/pieges/fried-liver/`. The locale-free form. */
export function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first !== undefined && isLocale(first) && first !== DEFAULT_LOCALE) {
    segments.shift();
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

/**
 * Canonical URL for a locale-free path.
 * FR (the default) is served from the root — no `/fr/` prefix, ever.
 */
export function localizePath(path: string, locale: Locale): string {
  const clean = stripLocale(path.startsWith('/') ? path : `/${path}`);
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
}

/** The same page in the other language — what the switcher links to. */
export function alternatePath(pathname: string, target: Locale): string {
  return localizePath(pathname, target);
}

/** The other locale, for a two-language switcher. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'fr' ? 'en' : 'fr';
}

/**
 * The site's route vocabulary. The nav, the sitemap and the smoke tests all
 * read this, so a new route is added in exactly one place.
 */
export const ROUTES = [
  '/',
  '/cours/',
  '/pieges/',
  '/exercices/',
  '/jouer/',
  '/agenda/',
  '/contact/',
  /**
   * The legal notice is NOT in the nav (it lives in the footer), but it is a
   * public page in both locales and therefore part of the route vocabulary the
   * switcher test walks.
   *
   * ⚠️ The EN counterpart is `/en/mentions-legales/`, NOT `/en/legal-notice/`.
   * Route segments are never translated here — see the note at the top of this
   * file. One segment vocabulary is what makes the switcher a pure prefix swap
   * that cannot fail to find its counterpart; a translated segment would have
   * to be looked up in a map, and a missing entry would 404 a reader mid-visit.
   * The visible link label IS translated ("Mentions légales" / "Legal notice").
   */
  '/mentions-legales/',
  /** Appearance settings. Footer only, like the legal notice — and the same
      no-translated-segments rule applies: `/en/parametres/`. */
  '/parametres/',
] as const;
export type Route = (typeof ROUTES)[number];

/** Home in either locale. */
export const homePath = (locale: Locale): string => localizePath('/', locale);

/** A trap detail page in either locale. Slugs are content data, never translated. */
export const trapPath = (slug: string, locale: Locale): string =>
  localizePath(`/pieges/${slug}/`, locale);

/** The traps index in either locale. */
export const trapsPath = (locale: Locale): string => localizePath('/pieges/', locale);

/** An exercise detail page in either locale. Slugs are content data. */
export const exercisePath = (slug: string, locale: Locale): string =>
  localizePath(`/exercices/${slug}/`, locale);

/** The exercises index in either locale. */
export const exercisesPath = (locale: Locale): string => localizePath('/exercices/', locale);

/** The legal notice in either locale. See the ROUTES note on the EN segment. */
export const legalPath = (locale: Locale): string => localizePath('/mentions-legales/', locale);

/** The privacy policy in either locale. Segment is structural, not translated. */
export const privacyPath = (locale: Locale): string =>
  localizePath('/politique-confidentialite/', locale);

/** Appearance settings in either locale. */
export const settingsPath = (locale: Locale): string => localizePath('/parametres/', locale);
