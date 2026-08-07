import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleReveals } from './helpers/reveal';

/**
 * Course 1 — `/cours/bien-ouvrir-une-partie/`.
 *
 * Content-only batch: it composes the existing board island (replay + exercise)
 * and adds no new mode, so chromium is the correct scope.
 *
 * The one genuinely new mechanism is the per-locale Markdown pair, and the risk
 * it carries is a silent one — the glob loader treats `.fr` / `.en` as part of
 * the extension, so without a custom `generateId` the two files collide and one
 * language is overwritten with no error. That is what the locale tests below
 * actually guard.
 */

const COURSE = '/cours/bien-ouvrir-une-partie/';

test.describe('course 1 — structure', () => {
  test('the course index lists six lessons and mounts no board', async ({ page }) => {
    await page.goto(COURSE);
    await settleReveals(page);
    await expect(page.locator('.lesson-card')).toHaveCount(6);
    await expect(page.locator('astro-island')).toHaveCount(0);
  });

  test('lessons link forward and back', async ({ page }) => {
    await page.goto(`${COURSE}roquer-tot/`);
    await expect(page.getByTestId('lesson-prev')).toBeVisible();
    await page.getByTestId('lesson-next').click();
    await expect(page).toHaveURL(new RegExp(`${COURSE}ne-pas-sortir-la-dame-trop-tot/$`));
  });

  /**
   * ⚠️ The pair-collision guard. If `generateId` is ever removed, one locale
   * overwrites the other and BOTH of these render the same language.
   */
  test('each locale renders its own prose, not the other one', async ({ page }) => {
    await page.goto(`${COURSE}roquer-tot/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Roquer tôt');
    await expect(page.locator('.prose').first()).toContainText('Ton roi commence la partie');

    await page.goto(`/en${COURSE}roquer-tot/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Castle early');
    await expect(page.locator('.prose').first()).toContainText('Your king starts the game');
  });
});

test.describe('course 1 — boards', () => {
  /** Boards sit BETWEEN prose chunks, which is the whole point of the marker. */
  test('a lesson places its board inline, not after all the text', async ({ page }) => {
    await page.goto(`${COURSE}developper-ses-pieces/`);
    const proseCount = await page.locator('.lesson-body .prose').count();
    expect(proseCount, 'the body was not split — boards would all be at the end').toBeGreaterThan(1);
    await expect(page.locator('.lesson-board').first()).toBeVisible();
  });

  test('the three openings each get their own replayer', async ({ page }) => {
    await page.goto(`${COURSE}trois-ouvertures-pour-commencer/`);
    await expect(page.locator('.lesson-board')).toHaveCount(3);
  });

  test('a lesson exercise solves and records progress under a lesson: slug', async ({ page }) => {
    await page.goto(`${COURSE}recapitulatif/`);
    const board = page.locator('[data-testid="chessboard"]').first();
    await board.scrollIntoViewIfNeeded();
    await page.locator('[data-testid="chessboard"] cg-board').first().waitFor({ timeout: 15_000 });

    const exercise = page.getByTestId('exercise').first();
    await expect(exercise).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });

    // Exercise A: Bf1-c4.
    const box = await board.boundingBox();
    if (!box) throw new Error('no board box');
    const sq = (file: number, rank: number) => ({
      x: (box.width / 8) * (file + 0.5),
      y: (box.height / 8) * (7 - rank + 0.5),
    });
    await board.click({ position: sq(5, 0) }); // f1
    await board.click({ position: sq(2, 3) }); // c4

    await expect(exercise).toHaveAttribute('data-state', 'solved', { timeout: 15_000 });

    const stored = await page.evaluate(() => window.localStorage.getItem('mcc:progress:v1'));
    const keys = Object.keys(JSON.parse(stored as string).exercises);
    expect(
      keys.some((k) => k.startsWith('lesson:bien-ouvrir-une-partie:recapitulatif:')),
      `progress keys were ${keys.join(', ')} — lesson progress must be namespaced for v2-S3`,
    ).toBe(true);
  });
});

test.describe('course 1 — accessibility', () => {
  for (const path of [
    COURSE,
    `/en${COURSE}`,
    `${COURSE}occuper-le-centre/`,
    `/en${COURSE}occuper-le-centre/`,
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

test.describe('course 2 — still diagrams', () => {
  /**
   * ⚠️ A still diagram is a PGN carrying only `[SetUp]`/`[FEN]` and no moves.
   *
   * `parseReplay` fell back to `new Chess().fen()` when there were no moves, so
   * every diagram silently rendered the STANDARD OPENING POSITION — 32 pieces in
   * their starting squares — instead of the position it was written to show. No
   * error, and it looks like a chessboard, so nothing but a piece count catches it.
   */
  test('a still diagram shows its own position, not the starting position', async ({ page }) => {
    await page.goto('/cours/les-mats-elementaires/le-mat-du-couloir/');
    const boards = page.locator('[data-testid="chessboard"]');
    await boards.first().scrollIntoViewIfNeeded();
    await boards.first().locator('cg-board').waitFor({ timeout: 20_000 });

    const pieces = await boards.first().locator('piece').count();
    expect(pieces, 'the diagram rendered the standard opening position').toBeLessThan(12);
  });

  /** With no moves there is nothing to launch or step through. */
  test('a still diagram offers no playback controls', async ({ page }) => {
    await page.goto('/cours/les-mats-elementaires/le-mat-du-couloir/');
    await page.locator('[data-testid="chessboard"]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-testid="chessboard"] cg-board').first().waitFor({ timeout: 20_000 });
    await expect(page.getByTestId('replay-launch')).toHaveCount(0);
    await expect(page.locator('.mcc-controls').first()).toBeHidden();
  });

  /** A replay that DOES have moves keeps its launch control. */
  test('a replay with moves still offers playback', async ({ page }) => {
    await page.goto('/cours/les-mats-elementaires/le-mat-de-lescalier/');
    await page.locator('[data-testid="chessboard"]').first().scrollIntoViewIfNeeded();
    await page.locator('[data-testid="chessboard"] cg-board').first().waitFor({ timeout: 20_000 });
    await expect(page.getByTestId('replay-launch')).toBeVisible();
  });

  test('course 2 lists six lessons in both locales', async ({ page }) => {
    for (const path of ['/cours/les-mats-elementaires/', '/en/cours/les-mats-elementaires/']) {
      await page.goto(path);
      await settleReveals(page);
      await expect(page.locator('.lesson-card')).toHaveCount(6);
    }
  });
});
