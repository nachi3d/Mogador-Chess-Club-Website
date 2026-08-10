import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { typeMove } from './helpers/board';

/**
 * E3 — ranks, points, session streaks and achievements.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ NOTHING HERE HARDCODES A THRESHOLD, AN AWARD OR A KEY LIST.
 *
 * Every one of those is content-derived and will move as courses are written.
 * A spec that pinned "Tour = 150" would fail on the day someone adds an
 * exercise, for no reason a reader could perceive — and worse, a spec that
 * pinned the AWARD VALUES would just restate `points.ts` back to itself and
 * prove nothing about what the page does with them.
 *
 * So the catalogue is read off the page (it is already serialised there, for
 * the resolver) and the expectations are computed from it. What is asserted is
 * the BEHAVIOUR: that crossing a threshold changes the rank, that a re-solve
 * awards nothing, that a wrong move ends a run, that a loss costs nothing, and
 * that an achievement is announced exactly once.
 * ═════════════════════════════════════════════════════════════════════════
 */

const PROGRESS_KEY = 'mcc:progress:v1';
const STREAK_KEY = 'mcc:streak:v1';

interface Entry {
  k: string[];
  p: number;
  h: number;
  s: 'basics' | 'lessons' | 'exercises' | 'games';
  m?: 1;
}

interface Catalogue {
  entries: Entry[];
  wins: Record<string, number>;
  winCap: number;
  ranks: { id: string; min: number }[];
  achievements: { id: string; condition: Record<string, unknown> }[];
  rankLabels: Record<string, string>;
  labels: Record<string, string>;
}

async function catalogueOf(page: Page, path = '/progres/'): Promise<Catalogue> {
  await page.goto(path);
  const raw = await page.locator('[data-score-catalogue]').textContent();
  return JSON.parse(raw ?? '{}') as Catalogue;
}

/** Seed a whole store — exercises, games and the announced list together. */
async function seed(
  page: Page,
  store: { exercises?: Record<string, unknown>; games?: unknown; announced?: string[] },
) {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key as string, value as string);
      } catch {
        /* nothing to do; the page must work anyway, which other specs assert */
      }
    },
    [PROGRESS_KEY, JSON.stringify({ exercises: {}, games: {}, announced: [], ...store })],
  );
}

const SOLVED = { solved: true, attempts: 0, hintUsed: false, solvedAt: '2026-01-01T00:00:00.000Z' };

/**
 * `/exercices/mat-du-couloir/` — FEN `6k1/5ppp/8/8/8/8/6PP/R5K1 w`, solution
 * `a1a8`, and it ENDS IN CHECKMATE, which is why it is the fixture for both the
 * award tests and the `first-mate` announcement.
 */
const EXERCISE = '/exercices/mat-du-couloir/';
/** The solution, in French notation — T is the rook. */
const SOLUTION = 'Ta8';
/** Legal, and not the solution: the same rook, one rank short. */
const OFF_LINE = 'Ta7';

/**
 * ⚠️ THE READINESS GATE IS NOT OPTIONAL. The board is `client:visible` AND its
 * judge arrives on a lazily-imported chess.js chunk, so a move typed before
 * `data-ready` simply vanishes — the failure looks exactly like a broken
 * validator. Same helper shape as `openExercise` in exercise.spec.ts.
 */
async function openExercise(page: Page, path = EXERCISE) {
  await page.goto(path);
  await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="chessboard"] cg-board').waitFor({ timeout: 15_000 });
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

/**
 * Solve catalogue entries, in order, until at least `target` points are earned.
 *
 * Returns the exercise records to seed AND the exact total they are worth — the
 * total is what the assertions compare against, so a rounding disagreement
 * between this helper and the page shows up as a failure rather than being
 * papered over by a tolerance.
 */
function solveUntil(catalogue: Catalogue, target: number) {
  const exercises: Record<string, unknown> = {};
  let points = 0;
  for (const entry of catalogue.entries) {
    if (points >= target) break;
    for (const key of entry.k) exercises[key] = SOLVED;
    points += entry.p;
  }
  return { exercises, points };
}

test.describe('E3 — points and rank', () => {
  test('a reader with nothing is Pion with zero points', async ({ page }) => {
    const catalogue = await catalogueOf(page);
    const bottom = catalogue.ranks[0]!;

    await expect(page.locator('[data-score-points]').first()).toHaveText('0');
    await expect(page.locator('[data-score-rank]').first()).toHaveText(
      catalogue.rankLabels[bottom.id]!,
    );
  });

  /**
   * ⚠️ EVERY THRESHOLD, COMPUTED FROM THE TABLE THE PAGE SHIPPED.
   *
   * The loop below is what makes this survive a re-tune: change a number in
   * `points.ts` and this still asserts the same thing — that at `min` points
   * the reader holds that rank and not the one below it.
   */
  test('each rank threshold is exactly where the table says', async ({ page }) => {
    const catalogue = await catalogueOf(page);

    for (const rank of catalogue.ranks) {
      const { exercises, points } = solveUntil(catalogue, rank.min);
      /* Content must actually be able to reach the threshold. If it cannot,
         the rank is unreachable and that is a real defect, not a skip. */
      expect(
        points,
        `no combination of content reaches ${rank.id} (${rank.min} points)`,
      ).toBeGreaterThanOrEqual(rank.min);

      const fresh = await page.context().newPage();
      await seed(fresh, { exercises });
      await fresh.goto('/progres/');

      await expect(fresh.locator('[data-score-points]').first()).toHaveText(String(points));
      await expect(
        fresh.locator('[data-score-rank]').first(),
        `${points} points should be ${rank.id}`,
      ).toHaveText(catalogue.rankLabels[rank.id]!);
      await fresh.close();
    }
  });

  test('the breakdown adds up to the total', async ({ page }) => {
    const catalogue = await catalogueOf(page);
    const { exercises, points } = solveUntil(catalogue, Number.MAX_SAFE_INTEGER);

    await seed(page, { exercises });
    await page.goto('/progres/');

    const parts = await Promise.all(
      (['basics', 'lessons', 'exercises', 'games'] as const).map(async (source) =>
        Number(await page.locator(`[data-score-source="${source}"]`).first().textContent()),
      ),
    );
    expect(parts.reduce((a, b) => a + b, 0)).toBe(points);
    await expect(page.locator('[data-score-points]').first()).toHaveText(String(points));
  });
});

test.describe('E3 — games', () => {
  /**
   * ⚠️ THE ONE THAT MATTERS MOST. This is a teaching tool: losing to a
   * 2000-strength engine is the normal outcome and must never subtract from
   * anything, or the site punishes the students it is for.
   */
  test('losses and draws cost nothing', async ({ page }) => {
    await seed(page, {
      games: {
        debutant: { wins: 0, draws: 4, losses: 40 },
        intermediaire: { wins: 0, draws: 0, losses: 12 },
        avance: { wins: 0, draws: 1, losses: 9 },
      },
    });
    await page.goto('/progres/');

    await expect(page.locator('[data-score-source="games"]').first()).toHaveText('0');
    await expect(page.locator('[data-score-points]').first()).toHaveText('0');
  });

  test('a win is worth more at a harder level', async ({ page }) => {
    const catalogue = await catalogueOf(page);
    expect(catalogue.wins.avance).toBeGreaterThan(catalogue.wins.intermediaire!);
    expect(catalogue.wins.intermediaire).toBeGreaterThan(catalogue.wins.debutant!);

    for (const level of ['debutant', 'intermediaire', 'avance'] as const) {
      const fresh = await page.context().newPage();
      await seed(fresh, { games: { [level]: { wins: 1, draws: 0, losses: 0 } } });
      await fresh.goto('/progres/');
      await expect(fresh.locator('[data-score-source="games"]').first()).toHaveText(
        String(catalogue.wins[level]),
      );
      await fresh.close();
    }
  });

  /** Farming: a game is repeatable where an exercise is not, so wins are capped. */
  test('wins past the cap award nothing', async ({ page }) => {
    const catalogue = await catalogueOf(page);
    const capped = catalogue.winCap * catalogue.wins.debutant!;

    await seed(page, { games: { debutant: { wins: catalogue.winCap + 25, draws: 0, losses: 0 } } });
    await page.goto('/progres/');
    await expect(page.locator('[data-score-source="games"]').first()).toHaveText(String(capped));
  });
});

test.describe('E3 — the solve moment', () => {
  test('a first solve shows the points it earned', async ({ page }) => {
    await openExercise(page);
    await typeMove(page, SOLUTION);

    await expect(page.getByTestId('exercise-solved')).toBeVisible();
    const points = page.getByTestId('exercise-points');
    await expect(points).toBeVisible();
    /* A real award, not a zero dressed up as one. */
    await expect(points).toContainText(/[1-9]/);
  });

  /**
   * ⚠️ NO FARMING. The record is a boolean, so the ledger being DERIVED gives
   * this for free — there is no "have they done this before" branch anywhere.
   * The spec exists because that is an easy property to lose the day someone
   * adds a stored balance.
   */
  test('re-solving an already-solved exercise awards nothing', async ({ page }) => {
    await seed(page, { exercises: { 'mat-du-couloir': SOLVED } });
    await openExercise(page);

    const before = await page.evaluate(() => (window as never as { MCC_SCORE: { points: number } }).MCC_SCORE.points);
    await typeMove(page, SOLUTION);

    await expect(page.getByTestId('exercise-solved')).toBeVisible();
    await expect(page.getByTestId('exercise-points')).toHaveCount(0);

    const after = await page.evaluate(() => (window as never as { MCC_SCORE: { points: number } }).MCC_SCORE.points);
    expect(after).toBe(before);
  });
});

test.describe('E3 — the session streak', () => {
  test('a wrong move ends the run, and says nothing about it', async ({ page }) => {
    await page.addInitScript(
      ([key]) => {
        try {
          window.sessionStorage.setItem(key as string, '4');
        } catch {
          /* nothing to do */
        }
      },
      [STREAK_KEY],
    );
    await openExercise(page);

    /* A legal move that is not the solution. */
    await typeMove(page, OFF_LINE);
    await expect(page.getByTestId('exercise-status')).toContainText(/\S/);

    const streak = await page.evaluate(
      ([key]) => window.sessionStorage.getItem(key as string),
      [STREAK_KEY],
    );
    expect(streak).toBe('0');

    /* ⚠️ AND NOTHING TELLS THE READER THEY LOST IT. Being told twice about one
       mistake — once as a refused move, once as a forfeited streak — teaches a
       beginner that trying is expensive. */
    await expect(page.getByTestId('exercise-streak')).toHaveCount(0);
  });

  test('a solve extends the run and it shows from two upward', async ({ page }) => {
    await page.addInitScript(
      ([key]) => {
        try {
          window.sessionStorage.setItem(key as string, '3');
        } catch {
          /* nothing to do */
        }
      },
      [STREAK_KEY],
    );
    await openExercise(page);
    await typeMove(page, SOLUTION);

    await expect(page.getByTestId('exercise-streak')).toContainText('4');
  });

  test('/progres/ hides the run below two and shows it above', async ({ page }) => {
    await page.goto('/progres/');
    await expect(page.locator('[data-score-streak-wrap]')).toBeHidden();

    const withRun = await page.context().newPage();
    await withRun.addInitScript(
      ([key]) => {
        try {
          window.sessionStorage.setItem(key as string, '6');
        } catch {
          /* nothing to do */
        }
      },
      [STREAK_KEY],
    );
    await withRun.goto('/progres/');
    await expect(withRun.locator('[data-score-streak-wrap]')).toBeVisible();
    await expect(withRun.locator('[data-score-streak-wrap]')).toContainText('6');
    await withRun.close();
  });
});

test.describe('E3 — achievements', () => {
  test('every achievement is listed, earned or not', async ({ page }) => {
    const catalogue = await catalogueOf(page);
    for (const achievement of catalogue.achievements) {
      await expect(page.getByTestId(`achievement-${achievement.id}`)).toHaveCount(1);
    }
    /* Nothing earned yet, so nothing is marked. */
    await expect(page.locator('[data-score-achievement][data-earned]')).toHaveCount(0);
  });

  test('a first win marks its achievement and only its own', async ({ page }) => {
    await seed(page, { games: { avance: { wins: 1, draws: 0, losses: 3 } } });
    await page.goto('/progres/');

    await expect(page.getByTestId('achievement-first-win-avance')).toHaveAttribute(
      'data-earned',
      'true',
    );
    await expect(page.getByTestId('achievement-first-win-debutant')).not.toHaveAttribute(
      'data-earned',
      'true',
    );
  });

  /**
   * ⚠️ EXACTLY ONCE. The toast fires at the moment of earning and never again —
   * `announced` in the store is the bookmark that makes that true. Without it
   * every page load for the rest of the reader's life is a small celebration of
   * something they did in March.
   */
  test('an achievement is announced once, and not again on the next visit', async ({ page }) => {
    await openExercise(page);
    await typeMove(page, SOLUTION);

    /* mat-du-couloir ends in checkmate, so this earns `first-mate`. */
    const toast = page.locator('[data-score-toast]');
    await expect(toast).toBeVisible();
    await expect(page.locator('[data-score-toast-name]')).toHaveText(/\S/);

    const announced = await page.evaluate(
      ([key]) => JSON.parse(window.localStorage.getItem(key as string) ?? '{}').announced ?? [],
      [PROGRESS_KEY],
    );
    expect(announced).toContain('first-mate');

    /* Reload: still earned, and NOT announced a second time. */
    await page.reload();
    await expect(page.locator('[data-score-toast]')).toBeHidden();
  });

  test('a seeded-as-announced achievement never toasts', async ({ page }) => {
    await seed(page, {
      exercises: { 'mat-du-couloir': SOLVED },
      announced: ['first-mate'],
    });
    await page.goto('/progres/');
    await expect(page.locator('[data-score-toast]')).toBeHidden();
    await expect(page.getByTestId('achievement-first-mate')).toHaveAttribute('data-earned', 'true');
  });
});

test.describe('E3 — the home dashboard', () => {
  /**
   * ⚠️ NAMES ITS VIEWPORT. The dashboard is the MOBILE home page: at 768px and
   * above it is `display: none` and the E5 retro menu is on screen instead
   * (CLAUDE.md → the 768px rule). A spec that did not pin the width would pass
   * on the phone projects and fail on the desktop ones for a reason that has
   * nothing to do with what it is testing.
   */
  test.use({ viewport: { width: 390, height: 844 } });

  test('the stats line shows a real rank and total, not a placeholder', async ({ page }) => {
    const catalogue = await catalogueOf(page, '/');
    const { exercises, points } = solveUntil(catalogue, catalogue.ranks[2]!.min);

    await seed(page, { exercises });
    await page.goto('/');

    const stat = page.getByTestId('dash-rank');
    await expect(stat).toBeVisible();
    await expect(stat).toContainText(String(points));
    /* The word the placeholder used to be. If it comes back, so has the bug. */
    await expect(stat).not.toContainText(/bient[oô]t|soon/i);
  });
});

test.describe('E3 — accessibility', () => {
  const THEME_KEY = 'mcc:theme:v1';

  /**
   * ⚠️ FOUR THEMES × BOTH MODES × BOTH LOCALES, and with progress SEEDED.
   *
   * The never-seeded state and the seeded state render different things here —
   * earned achievements swap to primary text on the same surface, and the
   * streak pill only exists above a run of two. Auditing one branch is how the
   * M1 regression survived a whole suite (CLAUDE.md), so both are audited.
   */
  for (const theme of ['bois', 'marbre', 'souiri', 'terminal']) {
    for (const mode of ['light', 'dark']) {
      for (const [locale, path] of [
        ['fr', '/progres/'],
        ['en', '/en/progres/'],
      ] as const) {
        test(`/progres/ ${locale} — ${theme} ${mode} has no axe violations`, async ({ page }) => {
          await page.addInitScript(
            ([key, value]) => {
              try {
                window.localStorage.setItem(key as string, value as string);
              } catch {
                /* nothing to do */
              }
            },
            [THEME_KEY, JSON.stringify({ theme, mode })],
          );
          await seed(page, {
            exercises: { 'mat-du-couloir': SOLVED, 'tutorial:la-tour': SOLVED },
            games: { avance: { wins: 1, draws: 0, losses: 2 } },
          });
          await page.goto(path);
          await expect(page.locator('[data-score-achievement][data-earned]').first()).toBeVisible();

          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(results.violations).toEqual([]);
        });
      }
    }
  }
});
