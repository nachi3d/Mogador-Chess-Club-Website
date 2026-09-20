import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Telling a demonstration board from a board you play on.
 *
 * A lesson can carry both, and nothing distinguished them — the site's own
 * author reached for the pieces on a replayer. These tests pin the signals that
 * fix it, and the one that matters most is the TEXT: a screen reader must be
 * able to answer "which board am I on?" without seeing a colour.
 */

const TWO_BOARDS = '/cours/bien-ouvrir-une-partie/occuper-le-centre/';

async function readyBoards(page: Page, path: string) {
  await page.goto(path);
  const boards = page.locator('[data-testid="chessboard"]');
  const n = await boards.count();
  for (let i = 0; i < n; i++) {
    await boards.nth(i).scrollIntoViewIfNeeded();
    await boards.nth(i).locator('cg-board').waitFor({ timeout: 20_000 });
  }
  /* `<cg-board>` proves the CHILD mounted; the views publish their own
     readiness a render later, and their controls are disabled until then.
     Wait on whichever signals this page has — see the note in
     `replayer.spec.ts`'s `openReplayer`. */
  for (const view of ['replayer', 'exercise'] as const) {
    const island = page.getByTestId(view);
    for (let i = 0, n2 = await island.count(); i < n2; i++) {
      await expect(island.nth(i)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    }
  }
  return boards;
}

test.describe('the two board types are labelled', () => {
  for (const [locale, path, demo, exercise] of [
    ['fr', TWO_BOARDS, 'Démonstration — utilise les flèches', 'À toi de jouer'],
    ['en', `/en${TWO_BOARDS}`, 'Demonstration — use the arrows', 'Your turn'],
  ] as const) {
    test(`both labels are real text in ${locale}`, async ({ page }) => {
      await readyBoards(page, path);
      await expect(page.locator('.mcc-board-block-demo .mcc-board-tag')).toHaveText(demo);
      await expect(page.locator('.mcc-board-block-exercise .mcc-board-tag')).toHaveText(exercise);
    });
  }

  /**
   * The signal must not be colour alone. If the tags ever become icons or
   * pseudo-element content, a screen reader loses the distinction entirely —
   * which is the whole point of the change.
   */
  test('the labels are announced, not painted', async ({ page }) => {
    await readyBoards(page, TWO_BOARDS);
    const texts = await page.locator('.mcc-board-tag').allInnerTexts();
    expect(texts.filter((t) => t.trim().length > 0)).toHaveLength(2);
  });

  test('the exercise board carries the heavier accent', async ({ page }) => {
    await readyBoards(page, TWO_BOARDS);
    const widths = await page.evaluate(() =>
      [...document.querySelectorAll('.mcc-board-block')].map((b) => ({
        kind: b.className.includes('exercise') ? 'exercise' : 'demo',
        w: parseFloat(getComputedStyle(b).borderLeftWidth),
      })),
    );
    const demo = widths.find((w) => w.kind === 'demo')!;
    const ex = widths.find((w) => w.kind === 'exercise')!;
    // Both must actually render — a missing custom property silently kills the
    // whole border shorthand, which is how these were invisible before.
    expect(demo.w, 'the demonstration border did not render').toBeGreaterThan(0);
    expect(ex.w, 'the exercise border did not render').toBeGreaterThan(demo.w);
  });
});

test.describe('the demonstration board refuses input', () => {
  test('tapping a piece on the replayer offers no destinations', async ({ page }) => {
    const boards = await readyBoards(page, TWO_BOARDS);
    const demo = boards.nth(0);
    await demo.evaluate((el) => el.scrollIntoView({ block: 'center' }));

    const box = await demo.locator('cg-board').boundingBox();
    if (!box) throw new Error('no box');
    const sq = box.width / 8;
    await demo.locator('cg-board').click({ position: { x: sq * 4.5, y: sq * 6.5 } });
    await page.waitForTimeout(300);

    await expect(demo.locator('.move-dest')).toHaveCount(0);
    await expect(demo.locator('square.selected')).toHaveCount(0);
  });

  /** A board that takes no input must not invite one with a pointer cursor. */
  test('the replayer shows no interactive cursor; the exercise does', async ({ page }) => {
    await readyBoards(page, TWO_BOARDS);
    const cursors = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="chessboard"]')].map((h) => ({
        kind: h.closest('.mcc-exercise') ? 'exercise' : 'demo',
        cursor: getComputedStyle(h.querySelector('cg-board')!).cursor,
      })),
    );
    expect(cursors.find((c) => c.kind === 'demo')!.cursor).not.toBe('pointer');
    expect(cursors.find((c) => c.kind === 'exercise')!.cursor).toBe('pointer');
  });
});

test.describe('the demonstration is easy to start', () => {
  test('a named, full-size control appears before it is started', async ({ page }) => {
    await readyBoards(page, TWO_BOARDS);
    const launch = page.getByTestId('replay-launch');
    await expect(launch).toBeVisible();
    await expect(launch).toContainText(/Lancer la démonstration/);

    const box = await launch.boundingBox();
    expect(box!.height, 'touch target below 44px').toBeGreaterThanOrEqual(44);

    /* The compact set stays available — the launch button is an additional,
       prominent entry point, not a gate. Hiding the others made 'jump to the
       end' unreachable as a first action. */
    await expect(page.locator('.mcc-controls').first()).toBeVisible();
  });

  test('pressing it starts the demonstration and reveals the compact controls', async ({ page }) => {
    await readyBoards(page, TWO_BOARDS);
    await page.getByTestId('replay-launch').click();

    // The launch button collapses away; the compact set remains.
    await expect(page.getByTestId('replay-launch')).toHaveCount(0);
    await expect(page.locator('.mcc-controls').first()).toBeVisible();
    const next = await page.getByTestId('replay-next').boundingBox();
    expect(next!.height, 'compact control below 44px').toBeGreaterThanOrEqual(44);
  });

  /** The keyboard path must be unchanged by the new button. */
  test('the arrow keys still drive the replayer', async ({ page }) => {
    await readyBoards(page, TWO_BOARDS);
    /* Wait for the HANDLER, not for the board. `<cg-board>` is created by
       BoardSurface, a CHILD of ReplayView, so its mount effect runs first and
       proves nothing about the document key listener. `data-keys` is set in
       the same effect that binds it. */
    await page.locator('[data-testid="replayer"][data-keys="bound"]').first().waitFor();

    /* ⚠️ AND WAIT FOR THE EXERCISE BELOW TO SETTLE, which is the part that
       actually made this fail. This lesson carries a replayer AND an exercise;
       the exercise's move-input used to steal focus the moment its lazy chess.js
       chunk landed, and a key aimed at an INPUT is ignored by the replayer's
       handler by design. That was a real bug (fixed in MoveInput.tsx), and it
       surfaced here as a spec that failed only under full-suite load.

       Waiting on `data-ready` keeps the test honest about ordering rather than
       relying on the exercise being slow. */
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-ready', 'true', {
      timeout: 20_000,
    });
    await expect(page.locator('input:focus')).toHaveCount(0);

    /* No click first: the replayer's key handler is bound to the document, and
       clicking into the page can put focus somewhere that swallows the key. */
    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator('[data-testid="move-list"] [data-current="true"]').first(),
    ).toHaveText(/e4/);
  });
});

test.describe('a judged board is still playable', () => {
  test('the exercise board still solves by pointer', async ({ page }) => {
    const boards = await readyBoards(page, TWO_BOARDS);
    const ex = boards.nth(1);
    await ex.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-ready', 'true', {
      timeout: 20_000,
    });
    const box = await ex.locator('cg-board').boundingBox();
    const sq = box!.width / 8;
    await ex.locator('cg-board').click({ position: { x: sq * 4.5, y: sq * 6.5 } });
    await ex.locator('cg-board').click({ position: { x: sq * 4.5, y: sq * 4.5 } });
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
  });
});

test.describe('accessibility', () => {
  for (const path of [TWO_BOARDS, `/en${TWO_BOARDS}`]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await readyBoards(page, path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
