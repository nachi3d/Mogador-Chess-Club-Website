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

/**
 * The published exercises, in THE order — the index lists them in it and
 * prev/next walks them in it.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE ORDER IS: LEVEL, THEN PRIMARY THEME, THEN SLUG. Decided rather than
 * inherited, so it is written down here.
 *
 * It used to be slug alphabetical, which put `attraction-avec-sacrifice` — an
 * INTERMEDIATE exercise — first on the index, and interleaved the two levels
 * all the way down. A beginner reading the list top to bottom met a
 * queen-sacrifice combination before a one-move fork.
 *
 * ⚠️ ONE ORDER, NOT TWO, AND THAT IS THE LOAD-BEARING PART. A pager that
 * walked a different sequence from the list the reader had just been looking
 * at would be its own small betrayal: they chose an exercise from a list, and
 * "next" would take them somewhere the list did not imply. The comment that
 * used to sit here already asked for this ("in the SAME order the index lists
 * them"); making the pager use the same function is what keeps it true.
 *
 * ⚠️ "PRIMARY THEME" IS `themes[0]`, AND THAT IS A REAL CONVENTION IN THE
 * CONTENT RATHER THAN AN ASSUMPTION ABOUT ARRAY ORDER. Checked across all 27:
 * the first theme is always the MOTIF — `fourchette`, `mat`, `clouage`,
 * `decouverte`, `surcharge` — with the pieces and `tactique` after it. The
 * result groups the five forks, then the nine mates, then each intermediate
 * motif in turn. ⚠️ **Reordering a `themes` array therefore moves an exercise
 * in the sequence**, which is worth knowing before tidying one.
 *
 * ⚠️ ALPHABETICAL BY MOTIF IS DETERMINISTIC, NOT PEDAGOGICAL. `attraction`
 * before `clouage` before `decouverte` is an accident of French spelling, not
 * a claim about which is easier. The upgrade is a curated motif sequence — a
 * list somebody maintains — and it is deliberately not done here, because an
 * uncurated order that is stable beats a curated one that silently rots when
 * a new theme arrives and nobody adds it to the list.
 * ═════════════════════════════════════════════════════════════════════════
 */
const LEVEL_RANK: Readonly<Record<string, number>> = {
  debutant: 0,
  intermediaire: 1,
  avance: 2,
};

export const sortExercises = (entries: Exercise[]): Exercise[] =>
  [...entries].sort((a, b) => {
    /* An unknown level sorts last rather than first: a typo should not put an
       exercise at the top of a beginner's list. */
    const level =
      (LEVEL_RANK[a.data.level] ?? 99) - (LEVEL_RANK[b.data.level] ?? 99);
    if (level !== 0) return level;
    const theme = (a.data.themes[0] ?? '').localeCompare(b.data.themes[0] ?? '');
    if (theme !== 0) return theme;
    return a.data.slug.localeCompare(b.data.slug);
  });

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
