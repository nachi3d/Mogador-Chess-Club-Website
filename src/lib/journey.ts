/**
 * THE JOURNEY — the ordered thing a reader works through, built at build time.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS EXISTS BECAUSE THE KEY SCHEME WAS WRITTEN OUT FOUR TIMES.
 *
 * `mcc:progress:v1` is keyed by strings that only this project understands —
 * `tutorial:<slug>`, `lesson:<course>:<lesson>:<boardIndex>`, and a bare slug
 * for a standalone exercise. Before M3 that scheme was spelled out in
 * `HomePage.astro`, `ProgressPage.astro` and `CoursPage.astro`, each with its
 * own copy of the same `.filter(kind === 'exercise').map(index)` walk.
 *
 * Three copies of a key format is three chances to disagree about what a
 * reader has done, and the failure is silent: the page renders, the counts
 * are simply wrong. So the scheme is written ONCE, here, and every surface
 * asks for it.
 *
 * ⚠️ THE BOARD INDEX IS THE POSITION IN THE FULL `boards` ARRAY, never the
 * position among the exercises. That is what `LessonPage.astro` uses to build
 * the slug it records under (`data.boards.indexOf(board)`), so filtering
 * before indexing would key off a different number and match nothing at all —
 * a progress page that is permanently empty, with no error anywhere.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ BUILD-TIME ONLY. It imports `astro:content` and is reached from `.astro`
 * frontmatter. Nothing here may be imported by an island — the whole content
 * graph would follow it into the client bundle.
 */
import { getCollection } from 'astro:content';
import type { Locale } from '@config/site';
import { localizePath } from '@i18n/paths';

/**
 * One resumable step.
 *
 * ⚠️ THE FIELD NAMES ARE ONE LETTER, AND THAT IS DELIBERATE. This array is
 * serialised into the HTML of the site's most-visited page and read by an
 * inline script; `url`/`title`/`keys` would be pure weight on every visit.
 */
export interface JourneyStep {
  /** Where to send the reader. Already localised. */
  readonly u: string;
  /** The step's own name, in the reader's language. */
  readonly t: string;
  /**
   * Every progress key this step covers.
   *
   * ⚠️ A STEP WITH NO KEYS IS NOT A STEP. A lesson of pure prose records
   * nothing, so it can be neither touched nor completed — including it would
   * block the forward scan on it forever. The builders below drop them.
   */
  readonly k: readonly string[];
}

/** The thirteen beginner steps, in `order`. */
export async function tutorialJourney(locale: Locale): Promise<JourneyStep[]> {
  return (await getCollection('tutoriel'))
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.order - b.data.order)
    .map((entry) => ({
      u: localizePath(`/apprendre-les-bases/${entry.data.slug}/`, locale),
      t: locale === 'fr' ? entry.data.title_fr : entry.data.title_en,
      k: [`tutorial:${entry.data.slug}`],
    }));
}

/** Every course lesson that has at least one exercise board, in course order. */
export async function lessonJourney(locale: Locale): Promise<JourneyStep[]> {
  const courses = (await getCollection('cours'))
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.order - b.data.order);

  const lessons = (await getCollection('lessons')).filter(
    (entry) => !entry.data.draft && entry.data.lang === locale,
  );

  return courses.flatMap((course) =>
    lessons
      .filter((lesson) => lesson.data.course === course.data.slug)
      .sort((a, b) => a.data.order - b.data.order)
      .map((lesson) => ({
        u: localizePath(`/cours/${course.data.slug}/${lesson.data.slug}/`, locale),
        t: lesson.data.title,
        k: lessonKeys(course.data.slug, lesson.data.slug, lesson.data.boards),
      }))
      .filter((step) => step.k.length > 0),
  );
}

/** The standalone exercises, in the order `/exercices/` lists them. */
export async function exerciseJourney(locale: Locale): Promise<JourneyStep[]> {
  return (await getCollection('exercices'))
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.slug.localeCompare(b.data.slug))
    .map((entry) => ({
      u: localizePath(`/exercices/${entry.data.slug}/`, locale),
      t: locale === 'fr' ? entry.data.title_fr : entry.data.title_en,
      k: [entry.data.slug],
    }));
}

/**
 * THE canonical order: the tutorial first, then the courses.
 *
 * This is what "Reprendre" walks, and the order is a claim about teaching —
 * you learn how the pieces move before you learn a mating pattern.
 */
export async function fullJourney(locale: Locale): Promise<JourneyStep[]> {
  const [tutorial, lessons] = await Promise.all([
    tutorialJourney(locale),
    lessonJourney(locale),
  ]);
  return [...tutorial, ...lessons];
}

/** Every exercise-board key in one course — what a `/cours/` card stands for. */
export async function courseKeys(locale: Locale, courseSlug: string): Promise<string[]> {
  const lessons = (await getCollection('lessons')).filter(
    (entry) => !entry.data.draft && entry.data.lang === locale && entry.data.course === courseSlug,
  );
  return lessons.flatMap((lesson) =>
    lessonKeys(courseSlug, lesson.data.slug, lesson.data.boards),
  );
}

/** The one place the lesson key format is written. See the header. */
function lessonKeys(
  courseSlug: string,
  lessonSlug: string,
  boards: readonly { readonly kind: string }[],
): string[] {
  return boards
    .map((board, index) => ({ board, index }))
    .filter(({ board }) => board.kind === 'exercise')
    .map(({ index }) => `lesson:${courseSlug}:${lessonSlug}:${index}`);
}
