import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Session 6 — the home CTA, ambient motion, and the reduced-motion contract.
 *
 * No engine is booted here, so this file runs under the normal fan-out. The
 * thinking-floor test lives in `play.spec.ts` instead, because it needs that
 * file's one-at-a-time engine configuration.
 */

/** Scroll reveals hide their targets until observed — get them on screen. */
async function settle(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('home — the Jouer CTA', () => {
  for (const [locale, home, target, label] of [
    ['fr', '/', '/jouer/', 'Jouer'],
    ['en', '/en/', '/en/jouer/', 'Play'],
  ] as const) {
    test(`the hero CTA reaches ${target} in ${locale}`, async ({ page }) => {
      await page.goto(home);

      const cta = page.getByTestId('home-cta-play');
      await expect(cta).toBeVisible();
      await expect(cta).toHaveText(label);

      await cta.click();
      await expect(page).toHaveURL(new RegExp(`${target.replace(/\//g, '\\/')}$`));
      // Arrived at the real page, not a 404 shell.
      await expect(page.getByTestId('play')).toBeVisible();
    });
  }

  test('the three pillars link to the three sections', async ({ page }) => {
    await page.goto('/');
    await settle(page);

    for (const href of ['/cours/', '/exercices/', '/jouer/']) {
      await expect(page.locator(`.pillar a[href="${href}"]`)).toHaveCount(1);
    }
  });
});

test.describe('ambient motion', () => {
  test('the home hero has an ambient layer, and it is hidden from assistive tech', async ({
    page,
  }) => {
    await page.goto('/');
    const ambient = page.locator('.ambient');
    await expect(ambient).toHaveCount(1);
    // Decoration must not be announced, and must never eat a click.
    await expect(ambient).toHaveAttribute('aria-hidden', 'true');
    expect(await ambient.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  });

  /**
   * The board is the content on a detail page. An ambient layer there would
   * compete with the one thing the reader came for, and reveals would delay it.
   */
  test('board detail pages carry no ambient layer and no reveals', async ({ page }) => {
    for (const path of ['/pieges/legal/', '/exercices/mat-du-couloir/', '/jouer/']) {
      await page.goto(path);
      await expect(page.locator('.ambient')).toHaveCount(0);
      await expect(page.locator('body[data-reveals]')).toHaveCount(0);
    }
  });

  test('index pages reveal their cards rather than leaving them hidden', async ({ page }) => {
    await page.goto('/pieges/');
    await settle(page);
    // The gate is real (the page opted in) AND the observer ran.
    await expect(page.locator('body[data-reveals]')).toHaveCount(1);
    const cards = page.locator('.card[data-reveal]');
    await expect(cards.first()).toHaveClass(/is-revealed/);
    await expect(cards.first()).toBeVisible();
  });
});

test.describe('prefers-reduced-motion', () => {
  /**
   * Emulated per test via the page API rather than `test.use({ reducedMotion })`
   * — the fixture form is not in this Playwright's option types, and emulating
   * explicitly also documents the thing under test at the point of use.
   *
   * It must be set BEFORE `goto`: the board reads the preference when the island
   * mounts, so emulating afterwards would test a board that had already decided.
   */
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('ambient silhouettes do not animate', async ({ page }) => {
    await page.goto('/');
    const piece = page.locator('.piece').first();
    await expect(piece).toHaveCount(1);
    expect(await piece.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('reveals are instant, and nothing is left invisible', async ({ page }) => {
    await page.goto('/pieges/');
    const card = page.locator('.card[data-reveal]').first();
    // No transition to wait on, and fully opaque from the start.
    expect(await card.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await expect(card).toBeVisible();
  });

  /**
   * The board's own animation is configured in JS, not CSS, so a media query
   * alone would not have covered it — `motion.ts` is consulted at mount AND on
   * every update precisely so this holds.
   */
  test('board moves are instant', async ({ page }) => {
    await page.goto('/pieges/legal/');
    const board = page.locator('[data-testid="chessboard"]');
    await board.scrollIntoViewIfNeeded();
    await expect(page.locator('[data-testid="chessboard"] cg-board')).toBeVisible();

    await page.getByTestId('replay-next').click();

    /* Chessground marks pieces mid-transit with `.anim` (its render.js adds the
       class for the duration of the animation). With animation off the class is
       never applied at all, so sampling right after the click is the check: a
       250ms animation would still be in flight here.

       Sampled repeatedly over ~180ms rather than once, because a single sample
       could land in a gap and pass vacuously — the guard below proves the
       selector is live by confirming the move actually happened. */
    let sawAnimating = 0;
    for (let i = 0; i < 6; i++) {
      sawAnimating += await page.evaluate(
        () => document.querySelectorAll('[data-testid="chessboard"] piece.anim').length,
      );
      await page.waitForTimeout(30);
    }
    expect(sawAnimating, 'a piece was animating despite prefers-reduced-motion').toBe(0);

    // Guard against a vacuous pass: the move must genuinely have been made.
    await expect(page.locator('[data-testid="move-list"] [data-current="true"]')).toHaveCount(1);
  });
});

test.describe('accessibility — the reshaped home', () => {
  for (const [locale, path] of [
    ['fr', '/'],
    ['en', '/en/'],
  ] as const) {
    test(`home ${locale} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
