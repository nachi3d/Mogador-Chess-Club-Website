/**
 * THE SCORE CATALOGUE — content turned into award values, at BUILD time (E3).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE POLICY IS EVALUATED HERE AND SHIPPED AS PLAIN NUMBERS.
 *
 * `ScoreResolver.astro` sums the reader's points in an inline script, because
 * the total has to be in the first paint (see that file). An inline script
 * cannot import a module — so the obvious shape would be to reimplement the
 * award rules inside it, which is a second copy of the one thing in this
 * feature that is a judgement call.
 *
 * Instead every rule in `points.ts` is applied HERE, and each entry ships with
 * its award already computed. The script adds up numbers it was handed and
 * knows no rules at all. Same trick as `MCC_THEMES` in BaseLayout: serialise
 * the DATA, duplicate only what must be duplicated — and here that is nothing.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ BUILD-TIME ONLY. It imports `astro:content` and chess.js. Nothing here may
 * be imported from an island — the whole content graph would follow it into the
 * client bundle, which is the rule `journey.ts` carries for the same reason.
 */
import { getCollection } from 'astro:content';
import { Chess } from 'chess.js';
import type { Achievement, Level, PointSource } from '@lib/points';
import {
  AWARD_EXERCISE,
  AWARD_LESSON,
  AWARD_MATE_BONUS,
  AWARD_TUTORIAL_STEP,
  AWARD_WIN,
  COUNTED_WINS_PER_LEVEL,
  RANKS,
  STREAK_ACHIEVEMENT,
  TEN_EXERCISES,
  withHint,
} from '@lib/points';

/**
 * One scoreable unit.
 *
 * ⚠️ FIELD NAMES ARE ONE LETTER, for the same reason `JourneyStep`'s are: this
 * is serialised into the HTML of every page that shows a score, including the
 * home page.
 */
export interface ScoreEntry {
  /** Progress keys. ALL must be solved before anything is awarded. */
  readonly k: readonly string[];
  /** Award when solved with no hint. */
  readonly p: number;
  /** Award when any of the keys had its hint revealed. Never zero. */
  readonly h: number;
  /** Which bucket the breakdown puts it in. */
  readonly s: PointSource;
  /** 1 when the position ends in checkmate — feeds the `first-mate` condition. */
  readonly m?: 1;
}

export interface ScoreCatalogue {
  readonly entries: readonly ScoreEntry[];
  /** Points per win, and how many wins per level are counted. */
  readonly wins: Readonly<Record<Level, number>>;
  readonly winCap: number;
  readonly ranks: readonly { readonly id: string; readonly min: number }[];
  readonly achievements: readonly Achievement[];
}

/**
 * Does this line finish in checkmate?
 *
 * Replayed rather than inferred from a `mat` theme: a theme is free text a
 * human typed, and the mate bonus is the one difficulty signal on an exercise
 * that is supposed to be a fact. `scripts/check-content.mjs` already replays
 * every line for legality, so an illegal one never reaches this.
 *
 * ⚠️ FAILS CLOSED. An unreplayable line scores as "not a mate" rather than
 * throwing the build: the award is a bonus, and losing five points is a far
 * better failure than a content edit taking the site down.
 */
function endsInMate(
  fen: string,
  solution: readonly string[],
  replies: readonly string[],
): boolean {
  try {
    const game = new Chess(fen);
    for (let i = 0; i < solution.length; i += 1) {
      const move = solution[i]!;
      game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? 'q' });
      if (game.isCheckmate()) return true;
      const reply = replies[i];
      if (reply) {
        game.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] ?? 'q' });
      }
    }
    return game.isCheckmate();
  } catch {
    return false;
  }
}

/** The lesson key format. Mirrors `journey.ts` — see the note there. */
function lessonKeys(
  course: string,
  lesson: string,
  boards: readonly { readonly kind: string }[],
): string[] {
  return boards
    .map((board, index) => ({ board, index }))
    .filter(({ board }) => board.kind === 'exercise')
    .map(({ index }) => `lesson:${course}:${lesson}:${index}`);
}

/**
 * Build the catalogue for one locale.
 *
 * ⚠️ PER LOCALE, because lessons are per-locale documents and their keys are
 * built from the boards of the locale's own file. The two locales' key sets are
 * identical in practice — `check-content.mjs` asserts the pair agrees on every
 * board — but deriving them separately means a divergence shows up as a
 * different catalogue rather than as a silently mis-scored English reader.
 */
export async function scoreCatalogue(locale: 'fr' | 'en'): Promise<ScoreCatalogue> {
  const entries: ScoreEntry[] = [];
  /* entry index → course slug. The catalogue no longer carries an `i` field
     (it duplicated the very keys sitting beside it, ~1.5 KB per page), so the
     course an entry belongs to is tracked here while it is being built. */
  const lessonCourse = new Map<number, string>();

  /* ── The tutorial: flat, small, one entry per step ──────────────────── */
  const tutorial = (await getCollection('tutoriel'))
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.order - b.data.order);

  for (const step of tutorial) {
    const mate = endsInMate(step.data.fen, step.data.solution, step.data.opponentReplies);
    entries.push({
      k: [`tutorial:${step.data.slug}`],
      p: AWARD_TUTORIAL_STEP,
      h: withHint(AWARD_TUTORIAL_STEP),
      s: 'basics',
      ...(mate ? { m: 1 as const } : {}),
    });
  }

  /* ── Course lessons: ONE entry per lesson, not per board ────────────── */
  const lessons = (await getCollection('lessons')).filter(
    (entry) => !entry.data.draft && entry.data.lang === locale,
  );

  for (const lesson of lessons) {
    const keys = lessonKeys(lesson.data.course, lesson.data.slug, lesson.data.boards);
    /* A lesson of pure prose records nothing and can never be completed —
       exactly the rule `journey.ts` applies. Including it would put an
       unreachable award in the ceiling and make 100% impossible. */
    if (keys.length === 0) continue;

    const mate = lesson.data.boards.some(
      (board) =>
        board.kind === 'exercise' &&
        endsInMate(board.fen, board.solution, board.opponentReplies),
    );

    lessonCourse.set(entries.length, lesson.data.course);
    entries.push({
      k: keys,
      p: AWARD_LESSON,
      h: withHint(AWARD_LESSON),
      s: 'lessons',
      ...(mate ? { m: 1 as const } : {}),
    });
  }

  /* ── Standalone exercises: by level, plus the mate bonus ────────────── */
  const exercises = (await getCollection('exercices'))
    .filter((entry) => !entry.data.draft)
    .sort((a, b) => a.data.slug.localeCompare(b.data.slug));

  for (const exercise of exercises) {
    const mate = endsInMate(
      exercise.data.fen,
      exercise.data.solution,
      exercise.data.opponentReplies,
    );
    const award = AWARD_EXERCISE[exercise.data.level] + (mate ? AWARD_MATE_BONUS : 0);
    entries.push({
      k: [exercise.data.slug],
      p: award,
      h: withHint(award),
      s: 'exercises',
      ...(mate ? { m: 1 as const } : {}),
    });
  }

  return {
    entries,
    wins: AWARD_WIN,
    winCap: COUNTED_WINS_PER_LEVEL,
    ranks: RANKS.map((rank) => ({ id: rank.id, min: rank.min })),
    achievements: buildAchievements(entries, lessonCourse),
  };
}

/**
 * The achievement conditions, with their key lists resolved from content.
 *
 * ⚠️ EVERY CONDITION IS DATA. The resolver evaluates three shapes and knows
 * nothing about what any of them mean, which is what keeps "what counts as a
 * mate" here rather than in an inline script.
 */
function buildAchievements(
  entries: readonly ScoreEntry[],
  lessonCourse: ReadonlyMap<number, string>,
): Achievement[] {
  const achievements: Achievement[] = [
    { id: 'first-mate', condition: { kind: 'mate' } },
    { id: 'ten-exercises', condition: { kind: 'solved', n: TEN_EXERCISES } },
    { id: 'streak-five', condition: { kind: 'streak', n: STREAK_ACHIEVEMENT } },
    { id: 'first-win-debutant', condition: { kind: 'wins', level: 'debutant' } },
    { id: 'first-win-intermediaire', condition: { kind: 'wins', level: 'intermediaire' } },
    { id: 'first-win-avance', condition: { kind: 'wins', level: 'avance' } },
  ];

  /** Entry INDEXES for one course — see the `entries` condition. */
  const indexesOf = (course: string) =>
    [...lessonCourse.entries()].filter(([, slug]) => slug === course).map(([index]) => index);

  /* "Tous les mats élémentaires" — only offered when that course exists. An
     achievement with an empty condition would be earned by doing nothing at
     all, which is the one way a badge can be actively insulting. */
  const mates = indexesOf('les-mats-elementaires');
  if (mates.length > 0) {
    achievements.push({ id: 'all-elementary-mates', condition: { kind: 'entries', ids: mates } });
  }

  /* "Un cours terminé" — any ONE course finished. One condition per course, so
     whichever the reader finishes first is the one that fires. */
  for (const course of new Set(lessonCourse.values())) {
    const ids = indexesOf(course);
    if (ids.length > 0) {
      achievements.push({ id: `course-complete:${course}`, condition: { kind: 'entries', ids } });
    }
  }

  return achievements;
}

/**
 * The ceiling — every point the site can currently award.
 *
 * Used by `/progres/` to say "x of y", and by nothing else. It exists so the
 * page never has to hardcode a total that content growth would falsify.
 */
export function ceilingOf(catalogue: ScoreCatalogue): number {
  const learning = catalogue.entries.reduce((sum, entry) => sum + entry.p, 0);
  const games =
    catalogue.winCap *
    (catalogue.wins.debutant + catalogue.wins.intermediaire + catalogue.wins.avance);
  return learning + games;
}
