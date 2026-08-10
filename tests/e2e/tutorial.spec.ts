import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { movePiece, typeMove } from './helpers/board';
import { settleReveals } from './helpers/reveal';

/**
 * `/apprendre-les-bases/` — the beginner tutorial.
 *
 * ⚠️ Scope note: this feature adds NO new board and NO new mode. It mounts the
 * existing `ExerciseBoard` (the one island, `mode="exercise"`) with tutorial
 * content, so `BoardSurface.tsx` and `ChessBoard.tsx` are untouched and
 * CLAUDE.md's full-matrix trigger does not fire. Chromium is the correct scope.
 */

const FIRST = '/apprendre-les-bases/lechiquier-et-les-coordonnees/';
const KNIGHT = '/apprendre-les-bases/le-cavalier/';

/**
 * The board is `client:visible`; on a phone viewport it starts below the fold.
 *
 * ⚠️ `scrollIntoViewIfNeeded()` IS NOT ENOUGH ON ITS OWN, and this file was
 * getting away with it. It guarantees only that the element is PARTLY visible,
 * so a board can sit with half its ranks above the fold — and a tap aimed at an
 * off-screen square is silently dropped. The board then looks dead: `data-ready`
 * is true, `data-busy` is false, `data-attempts` stays at 0 and the state never
 * leaves `idle`, because no move was ever produced to judge.
 *
 * That is exactly what failed here, on the one step whose solution starts at
 * g1 — near the bottom edge of the board, and therefore the first square to
 * fall off. `board-pointer.spec.ts` plays the SAME g1-f3 move on this SAME page
 * and passed in the same run, because it does the centring scroll below.
 *
 * Follow the rule CLAUDE.md already states: centre it.
 */
async function openStep(page: Page, path: string) {
  await page.goto(path);
  const board = page.locator('[data-testid="chessboard"]');
  await board.scrollIntoViewIfNeeded();
  await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.locator('[data-testid="chessboard"] cg-board').waitFor({ timeout: 15_000 });
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-ready', 'true', {
    timeout: 20_000,
  });
}

test.describe('tutorial — the guided sequence', () => {
  for (const [locale, path, heading] of [
    ['fr', '/apprendre-les-bases/', 'Apprendre les bases'],
    ['en', '/en/apprendre-les-bases/', 'Learn the basics'],
  ] as const) {
    test(`the index renders in ${locale} and lists every step`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await settleReveals(page);
      // 13 steps, in order, each linking to its own route.
      /* M3: the tutorial step card and the course lesson card were the same
         card written twice and are now one component, so both render
         `.lesson-card`. */
      await expect(page.locator('.lesson-card')).toHaveCount(13);
    });
  }

  /**
   * The index is a list, and CLAUDE.md forbids mounting a board on one. Thirteen
   * live boards would also be thirteen hydrated islands on a page a beginner
   * opens first, on a phone.
   */
  test('the index mounts no board at all', async ({ page }) => {
    await page.goto('/apprendre-les-bases/');
    await expect(page.locator('astro-island')).toHaveCount(0);
    await expect(page.locator('cg-board')).toHaveCount(0);
  });

  test('a step links forward and back through the sequence', async ({ page }) => {
    await page.goto(KNIGHT);
    await expect(page.getByTestId('tutorial-prev')).toBeVisible();
    await page.getByTestId('tutorial-next').click();
    await expect(page).toHaveURL(/\/apprendre-les-bases\/le-pion\/$/);
  });

  test('the last step offers a way onward and has no next', async ({ page }) => {
    await page.goto('/apprendre-les-bases/lire-la-notation/');
    await expect(page.getByTestId('tutorial-next')).toHaveCount(0);
    /* Scoped to the finishing panel: the site nav also links to /exercices/,
       so an unscoped role query matches more than one link. */
    await expect(page.locator('.step-finished a[href*="exercices"]')).toBeVisible();
  });
});

test.describe('tutorial — the board', () => {
  /**
   * THE SANDBOX BEHAVIOUR, which is why no new mode was needed: picking a piece
   * up in exercise mode lights every square it may legally reach, because
   * `dests` is built from all legal moves in the position.
   */
  test('tapping a piece shows where it can go', async ({ page }) => {
    await openStep(page, KNIGHT);
    const board = page.locator('[data-testid="chessboard"] cg-board');
    const box = await board.boundingBox();
    if (!box) throw new Error('no board box');

    // g1 — file g (index 6), rank 1 (bottom row) from White's side.
    await board.click({ position: { x: (box.width / 8) * 6.5, y: (box.height / 8) * 7.5 } });

    /* Chessground marks reachable squares with `.move-dest`. The knight on g1
       has THREE: e2, f3 and h3 — e2 is empty because the white king is on e1.
       Counting them is the point: the reader sees every square the piece may
       reach, not just the one the task wants. */
    await expect(page.locator('[data-testid="chessboard"] .move-dest')).toHaveCount(3);
  });

  test('a micro-exercise solves end to end by tapping', async ({ page }) => {
    await openStep(page, KNIGHT);
    await movePiece(page, 'g1', 'f3');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
  });

  test('a step can be solved from the keyboard alone', async ({ page }) => {
    await openStep(page, '/apprendre-les-bases/lire-la-notation/');
    // The step that teaches notation, solved the way it teaches.
    await typeMove(page, 'Cf3');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
  });

  /**
   * Progress goes into `mcc:progress:v1` under a `tutorial:` slug, so v2-S3's
   * sync collects it with no special-casing. This asserts both halves: that it
   * survives a reload, and that it is stored under the namespaced key.
   */
  test('progress persists across a reload and is namespaced', async ({ page }) => {
    await openStep(page, KNIGHT);
    await movePiece(page, 'g1', 'f3');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });

    const stored = await page.evaluate(() => window.localStorage.getItem('mcc:progress:v1'));
    expect(stored, 'nothing was written to the shared progress store').toBeTruthy();
    expect(
      JSON.parse(stored as string).exercises,
      'the tutorial must store under a tutorial: slug so v2-S3 syncs it unchanged',
    ).toHaveProperty('tutorial:le-cavalier');

    /* A reload resets the BOARD (so the step can be replayed) but not the
       RECORD. The persisted fact surfaces as the returning-solver greeting —
       asserting 'data-state=solved' here would be asserting a bug. */
    await page.reload();
    await page
      .locator('[data-testid="chessboard"]')
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByTestId('exercise-status')).toContainText('Déjà résolu', {
      timeout: 20_000,
    });

    /* And the index shows the tick. M3 replaced the bare ✓ with the same
       three-state row the exercise index uses — the old marker could only say
       "done", so a step attempted and not solved looked identical to one never
       opened. */
    await page.goto('/apprendre-les-bases/');
    await settleReveals(page);
    await expect(page.locator('[data-status-for="tutorial:le-cavalier"]')).toHaveAttribute(
      'data-state',
      'solved',
    );
  });
});

test.describe('tutorial — entry points', () => {
  test('the home page points a beginner at it', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByTestId('home-cta-tutorial');
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/apprendre-les-bases\/$/);
  });

  test('the courses index names it as the prerequisite', async ({ page }) => {
    await page.goto('/cours/');
    await expect(page.getByTestId('cours-tutorial-link')).toBeVisible();
  });
});

test.describe('tutorial — accessibility', () => {
  for (const path of [
    '/apprendre-les-bases/',
    '/en/apprendre-les-bases/',
    FIRST,
    '/en/apprendre-les-bases/lechiquier-et-les-coordonnees/',
  ]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await settleReveals(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
