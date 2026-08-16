/**
 * The exercise index's filters — ONE definition, four routes and one page.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE FILTERS ARE STATIC ROUTES, NOT `?niveau=` QUERY PARAMETERS, AND THAT
 * IS FORCED RATHER THAN PREFERRED.
 *
 * Batch 5's brief asked for server-side filtering on `?niveau=` and `?theme=`.
 * This site cannot do it: `output: 'static'`, no adapter, no SSR — a hard rule
 * in CLAUDE.md, not a setting. There is no server to read a query string.
 *
 * The two alternatives were:
 *
 *   1. Read the query string in the browser and hide cards that do not match.
 *      ⚠️ REJECTED: the filter controls would be dead without JavaScript — a
 *      row of links that visibly do nothing. This site has a standing rule
 *      that its navigation works with no JS (the home menu is tested for it),
 *      and a control that does nothing is worse than no control.
 *
 *   2. Emit a real page per filter value. Works with no JS, is linkable,
 *      bookmarkable and crawlable, and costs a few dozen tiny HTML files.
 *
 * (2) ships. The URL shape differs from the brief — `/exercices/niveau/debutant/`
 * rather than `/exercices/?niveau=debutant` — and everything the brief wanted
 * from it is delivered.
 *
 * ⚠️ AN EMPTY FILTER PAGE IS STRUCTURALLY IMPOSSIBLE, which is why there is no
 * empty state. `getStaticPaths` derives its values FROM the content, so a
 * filter route exists only where at least one exercise matches; anything else
 * 404s like any other unwritten URL. A hand-written list of themes would have
 * needed the empty state — and would have been the thing that rots.
 * ═════════════════════════════════════════════════════════════════════════
 */
import type { CollectionEntry } from 'astro:content';
import type { Locale } from '@config/site';
import { localizePath } from '@i18n/paths';

export type Exercise = CollectionEntry<'exercices'>;

/** Which axis a filter page is filtering on. */
export type FilterKind = 'niveau' | 'theme';

export interface ExerciseFilter {
  readonly kind: FilterKind;
  readonly value: string;
}

/**
 * ⚠️ THE SEGMENTS ARE NOT TRANSLATED — `/en/exercices/niveau/…`, never
 * `/en/exercices/level/…`. Same rule as every other route on this site: one
 * segment vocabulary is what makes the language switcher a pure prefix swap
 * that cannot fail to find its counterpart. See CLAUDE.md → Routes.
 */
export const filterPath = (filter: ExerciseFilter, locale: Locale): string =>
  localizePath(`/exercices/${filter.kind}/${filter.value}/`, locale);

/** The published exercises, in the SAME order the index lists them. */
export const sortExercises = (entries: Exercise[]): Exercise[] =>
  [...entries].sort((a, b) => a.data.slug.localeCompare(b.data.slug));

/** Does this exercise belong on that filter's page? */
export function matches(entry: Exercise, filter: ExerciseFilter): boolean {
  return filter.kind === 'niveau'
    ? entry.data.level === filter.value
    : entry.data.themes.includes(filter.value);
}

/**
 * Every level that at least one exercise actually uses, in teaching order —
 * NOT alphabetical, because "avancé, débutant, intermédiaire" is nonsense as a
 * row of chips.
 */
const LEVEL_ORDER = ['debutant', 'intermediaire', 'avance'] as const;

export function levelsIn(entries: Exercise[]): string[] {
  const used = new Set(entries.map((e) => e.data.level));
  return LEVEL_ORDER.filter((level) => used.has(level));
}

/**
 * Every theme, commonest first, then alphabetically.
 *
 * ⚠️ SORTED BY COUNT ON PURPOSE. 27 exercises carry ~20 distinct tags; ordered
 * alphabetically the row opens with whichever motif happens to start with "a"
 * and buries the four big families. Commonest-first makes the row a map of
 * what is actually on the site.
 */
export function themesIn(entries: Exercise[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const theme of entry.data.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
