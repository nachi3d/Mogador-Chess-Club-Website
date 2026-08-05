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
export const ROUTES = ['/', '/cours/', '/pieges/', '/exercices/', '/agenda/', '/contact/'] as const;
export type Route = (typeof ROUTES)[number];

/** Home in either locale. */
export const homePath = (locale: Locale): string => localizePath('/', locale);
