import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Board coordinate alignment, and the grouped navigation.
 *
 * ⚠️ Scope: the coordinate fix is CSS-only (`board.css`). `BoardSurface.tsx`
 * and `ChessBoard.tsx` are untouched, so CLAUDE.md's full-matrix trigger does
 * not fire and chromium is the correct scope.
 */

/**
 * Measure each file label's centre against its file's centre.
 *
 * This is the regression guard for the bug this spec exists for: Chessground's
 * default `coords.files { left: 24px; width: 100% }` displaced every label by a
 * CONSTANT 24px and pushed "h" off the board. A constant offset is invisible in
 * a screenshot review and obvious in arithmetic.
 */
async function coordinateDeltas(page: Page, index = 0) {
  return page.evaluate((idx) => {
    const host = document.querySelectorAll('[data-testid="chessboard"]')[idx] as HTMLElement;
    const bb = host.querySelector('cg-board')!.getBoundingClientRect();
    const sq = bb.width / 8;
    const black = host.classList.contains('orientation-black');

    const files = [...host.querySelector('coords.files')!.children];
    const ranks = [...host.querySelector('coords.ranks')!.children];

    const fileDeltas = files.map((c, i) => {
      const r = c.getBoundingClientRect();
      const col = black ? 7 - i : i;
      return r.left + r.width / 2 - bb.left - sq * (col + 0.5);
    });
    const rankDeltas = ranks.map((c, i) => {
      const r = c.getBoundingClientRect();
      const rowFromBottom = black ? 7 - i : i;
      return r.top + r.height / 2 - bb.top - (bb.height - sq * (rowFromBottom + 0.5));
    });

    const filesBox = host.querySelector('coords.files')!.getBoundingClientRect();
    return {
      boardWidth: bb.width,
      orientation: black ? 'black' : 'white',
      maxFileDelta: Math.max(...fileDeltas.map(Math.abs)),
      maxRankDelta: Math.max(...rankDeltas.map(Math.abs)),
      overflowRight: filesBox.right - bb.right,
      overflowLeft: bb.left - filesBox.left,
    };
  }, index);
}

/** A quarter of a square: visibly wrong before this is exceeded, and generous. */
const tolerance = (boardWidth: number) => (boardWidth / 8) * 0.25;

test.describe('board coordinates align with their files and ranks', () => {
  for (const [name, width] of [
    ['desktop', 1280],
    ['phone', 390],
  ] as const) {
    test(`white orientation, ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/pieges/legal/');
      await page.locator('[data-testid="chessboard"]').first().scrollIntoViewIfNeeded();
      await page.locator('[data-testid="chessboard"] cg-board').first().waitFor();

      const m = await coordinateDeltas(page);
      const tol = tolerance(m.boardWidth);
      expect(m.orientation).toBe('white');
      expect(m.maxFileDelta, `file labels off by ${m.maxFileDelta.toFixed(1)}px`).toBeLessThan(tol);
      expect(m.maxRankDelta, `rank labels off by ${m.maxRankDelta.toFixed(1)}px`).toBeLessThan(tol);
      // "h" fell off the right edge; neither side may overhang.
      expect(m.overflowRight, 'the file row overhangs the right edge').toBeLessThan(1);
      expect(m.overflowLeft, 'the file row overhangs the left edge').toBeLessThan(1);
    });
  }

  /**
   * Black orientation reverses the flex row, so an offset that happens to look
   * right from White's side can still be wrong from Black's.
   */
  test('black orientation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/cours/bien-ouvrir-une-partie/ne-pas-sortir-la-dame-trop-tot/');
    const boards = page.locator('[data-testid="chessboard"]');
    await boards.nth(1).scrollIntoViewIfNeeded();
    await boards.nth(1).locator('cg-board').waitFor();

    const m = await coordinateDeltas(page, 1);
    expect(m.orientation).toBe('black');
    const tol = tolerance(m.boardWidth);
    expect(m.maxFileDelta).toBeLessThan(tol);
    expect(m.maxRankDelta).toBeLessThan(tol);
    expect(m.overflowRight).toBeLessThan(1);
  });
});

test.describe('grouped navigation', () => {
  test('groups are closed on load and open on click, with no layout shift', async ({ page }) => {
    await page.goto('/cours/');
    const toggle = page.getByRole('button', { name: /Apprendre/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const before = await page.evaluate(() => document.querySelector('#main')!.getBoundingClientRect().top);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const after = await page.evaluate(() => document.querySelector('#main')!.getBoundingClientRect().top);

    expect(after, 'opening a panel moved the page').toBe(before);
    await expect(page.getByRole('link', { name: 'Cours', exact: true })).toBeVisible();
  });

  test('the current section is marked without needing the panel open', async ({ page }) => {
    await page.goto('/jouer/');
    await expect(page.getByRole('button', { name: /entraîner/ })).toHaveClass(/is-current/);
    await expect(page.getByRole('button', { name: /Apprendre/ })).not.toHaveClass(/is-current/);
  });

  test('only one panel is open at a time', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Apprendre/ }).click();
    await page.getByRole('button', { name: /Le club/ }).click();
    await expect(page.getByRole('button', { name: /Apprendre/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  /** Escape must also return focus, or a keyboard reader is dropped. */
  test('escape closes and returns focus to the toggle', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /Le club/ });
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  /**
   * ⚠️ Deliberately does NOT assert Tab order into the panel.
   *
   * WebKit/Safari ships with "Press Tab to highlight each item on a webpage"
   * OFF, so Tab moves between form controls and SKIPS links — across the whole
   * web, not just here. Asserting `Tab` lands on the first link passes in
   * Chromium and Firefox and fails in WebKit for a reason that has nothing to
   * do with this menu. (Observed: focus jumped past the panel to the theme
   * toggle, and the focusin handler then correctly closed the panel.)
   *
   * What matters and is asserted: the toggle is operable from the keyboard, and
   * the revealed links are real, focusable links. Escape + focus return is
   * covered by the test above.
   */
  test('a panel is keyboard operable and reveals focusable links', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Le club/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Le club/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const agenda = page.getByRole('link', { name: 'Agenda', exact: true });
    await expect(agenda).toBeVisible();
    await agenda.focus();
    await expect(agenda).toBeFocused();
  });

  test('the English nav is in English', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.getByRole('button', { name: 'Learn' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Practise' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'The club' })).toBeVisible();
  });

  for (const path of ['/', '/en/']) {
    test(`the menu has no axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('button', { name: /Apprendre|Learn/ }).click();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('header')
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});

test.describe('step and lesson navigation', () => {
  test('a tutorial step names its destinations', async ({ page }) => {
    await page.goto('/apprendre-les-bases/le-fou/');
    await expect(page.getByTestId('tutorial-next')).toContainText('Suivant');
    await expect(page.getByTestId('tutorial-next')).toContainText('La dame');
    await expect(page.getByTestId('tutorial-prev')).toContainText('La tour');
    await expect(page.getByTestId('tutorial-index')).toBeVisible();
  });

  test('a lesson names its destinations and links back to the course', async ({ page }) => {
    await page.goto('/cours/bien-ouvrir-une-partie/roquer-tot/');
    await expect(page.getByTestId('lesson-next')).toContainText('Ne pas sortir la dame');
    await expect(page.getByTestId('lesson-prev')).toContainText('Développer ses pièces');
    await expect(page.getByTestId('lesson-index')).toBeVisible();
  });

  /** The end of a sequence must lead somewhere, not stop dead. */
  test('the last lesson offers somewhere to go next', async ({ page }) => {
    await page.goto('/cours/bien-ouvrir-une-partie/recapitulatif/');
    await expect(page.getByTestId('lesson-next')).toHaveCount(0);
    const panel = page.locator('.lesson-next-up');
    await expect(panel.locator('a[href*="exercices"]')).toBeVisible();
    await expect(panel.locator('a[href*="pieges"]')).toBeVisible();
  });
});
