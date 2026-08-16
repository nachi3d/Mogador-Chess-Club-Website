import { test, expect, type Page } from '@playwright/test';

/**
 * Pointer play, and course-index card links.
 *
 * ⚠️ WHY THIS FILE EXISTS. Every existing exercise spec that solves a position
 * on a COURSE LESSON does it by typing into `MoveInput`. That is how a
 * pointer-only regression could ship unnoticed: the keyboard path bypasses
 * Chessground entirely and calls `onMove` directly, so it stays green even if
 * the board refuses every tap. These tests use the pointer, and only the
 * pointer.
 *
 * ⚠️ SCROLL THE BOARD FULLY INTO VIEW FIRST. `scrollIntoViewIfNeeded()` only
 * guarantees the element is *partly* visible: on a phone viewport a 336px board
 * can end up with its top half above the fold, and a tap aimed at an off-screen
 * square is silently dropped. That produced a convincing false "the board is
 * dead" during this session's investigation. `block: 'center'` is the fix.
 */

async function openBoard(page: Page, path: string, index = 0) {
  await page.goto(path);
  const board = page.locator('[data-testid="chessboard"]').nth(index);
  await board.scrollIntoViewIfNeeded();
  await board.locator('cg-board').waitFor({ timeout: 20_000 });
  await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const exercise = page.locator('.mcc-exercise').nth(0);
  await expect(exercise).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return board;
}

/**
 * Tap or click a square, choosing whichever the context actually supports.
 *
 * ⚠️ THE PICK-UP MUST BE RENDERED BEFORE THE DROP IS CLICKED.
 *
 * Two `click()`s back to back with no gap is not a person tapping a piece and
 * then its destination — it is two synthetic events inside one frame, and
 * Chessground drops the second often enough to fail a run. Measured on
 * `/apprendre-les-bases/le-cavalier/` with the old helper: **solved 1 time in
 * 3** at a zero gap, with `data-attempts` still 0, i.e. the second click never
 * became a move at all.
 *
 * ⚠️ It was NOT a product bug, and the difference matters. Driven by hand at
 * any human pace the same board picks up and solves every time; the app was
 * verified working before this helper was touched. What follows is the harness
 * modelling a reader instead of outrunning one.
 *
 * Waiting on `square.selected` rather than on a timeout is what makes it
 * deterministic — and it also asserts the pick-up actually happened, which the
 * old helper never checked.
 */
async function pointTo(page: Page, board: ReturnType<Page['locator']>, file: number, rank: number) {
  const cg = board.locator('cg-board');
  const box = await cg.boundingBox();
  if (!box) throw new Error('board has no box');
  const sq = box.width / 8;
  const position = { x: sq * (file + 0.5), y: sq * (7 - rank + 0.5) };
  const selectedBefore = await cg.locator('square.selected').count();
  const touch = await page.evaluate(() => 'ontouchstart' in window);
  /* The press needs a real duration — see PRESS_MS in helpers/board.ts.
     A 0ms press is released inside the same frame it began, and Chessground
     silently emits no move: measured 1/8 at 0ms against 8/8 at 60ms. */
  if (touch) await cg.tap({ position });
  else await cg.click({ position, delay: 60 });

  /* A pick-up highlights the square; a drop clears it. Either way the board
     has to have reacted before the next pointer event is sent. */
  await expect
    .poll(async () => (await cg.locator('square.selected').count()) !== selectedBefore, {
      timeout: 5_000,
    })
    .toBe(true);
}

const solvedState = (page: Page, index = 0) =>
  expect(page.locator('.mcc-exercise').nth(index)).toHaveAttribute('data-state', 'solved', {
    timeout: 15_000,
  });

test.describe('a judged position is playable BY POINTER everywhere it appears', () => {
  test('course lesson — first lesson (e2-e4)', async ({ page }) => {
    const board = await openBoard(page, '/cours/bien-ouvrir-une-partie/occuper-le-centre/', 1);
    await pointTo(page, board, 4, 1);
    // Picking a piece up must light its legal destinations.
    await expect(page.locator('[data-testid="chessboard"] .move-dest').first()).toBeVisible();
    await pointTo(page, board, 4, 3);
    await solvedState(page);
  });

  test('course lesson — recap, an exercise below two others (Bf1-c4)', async ({ page }) => {
    const board = await openBoard(page, '/cours/bien-ouvrir-une-partie/recapitulatif/', 0);
    await pointTo(page, board, 5, 0);
    await pointTo(page, board, 2, 3);
    await solvedState(page);
  });

  test('tutorial step (g1-f3)', async ({ page }) => {
    const board = await openBoard(page, '/apprendre-les-bases/le-cavalier/', 0);
    await pointTo(page, board, 6, 0);
    await pointTo(page, board, 5, 2);
    await solvedState(page);
  });

  test('standalone exercise (a1-a8)', async ({ page }) => {
    const board = await openBoard(page, '/exercices/mat-du-couloir/', 0);
    await pointTo(page, board, 0, 0);
    await pointTo(page, board, 0, 7);
    await solvedState(page);
  });
});

test.describe('course index cards are links', () => {
  for (const [locale, path, slug] of [
    ['fr', '/cours/', '/cours/bien-ouvrir-une-partie/'],
    ['en', '/en/cours/', '/en/cours/bien-ouvrir-une-partie/'],
  ] as const) {
    test(`the whole card navigates in ${locale}`, async ({ page }) => {
      await page.goto(path);
      const card = page.locator('.card-linked').first();
      await expect(card).toBeVisible();

      /**
       * Click well away from the title — the WHOLE card must be the hit area,
       * not just the heading. The overlay is a `::after` on the single link.
       *
       * ⚠️ `click({ position })` RATHER THAN RAW `page.mouse.click()` COORDINATES.
       * The old form read `boundingBox()` and clicked those numbers, which does
       * three unsafe things at once: it does not scroll, it does not wait for
       * the element to stop moving, and it does not hit-test. On this page the
       * cards carry `[data-reveal]`, which animates them 12px vertically — so
       * the coordinates were read mid-transition and the click landed 12px away
       * from where it was aimed.
       *
       * That was survivable while there was ~63px between the card and the
       * fixed bottom bar. M4's trail costs 44px at the top of every page below
       * a section landing, leaving 19px on the shortest phone (iphone-13,
       * 390×664) — and the miss started landing on the bar's fifth entry, so
       * the test failed with `Received: /parametres/`, which reads like a
       * routing bug and is not one.
       *
       * `position` is measured from the element's own box, so "away from the
       * title" is unchanged; Playwright scrolls, waits for stability and
       * refuses to click through an overlay.
       */
      const box = await card.boundingBox();
      if (!box) throw new Error('no card box');
      await card.click({ position: { x: box.width - 12, y: box.height - 12 } });
      await expect(page).toHaveURL(new RegExp(`${slug.replace(/\//g, '\\/')}$`));
    });
  }

  test('one tab stop per card, and Enter follows it', async ({ page }) => {
    await page.goto('/cours/');
    const link = page.locator('.card-linked a').first();
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cours\/bien-ouvrir-une-partie\/$/);
  });

  /**
   * ⚠️ THE OPPOSITE OF WHAT THIS ONCE ASSERTED, AND DELIBERATELY.
   *
   * It used to require exactly one UNLINKED card — a course with no lessons,
   * rendered inert so it could not 404. That state is gone: an index entry with
   * no destination is a bug, not a state, and `les-bases` (the record that
   * produced it) was removed because its content ships as the tutorial. See
   * CLAUDE.md → "a card that renders has a destination".
   *
   * Kept here rather than deleted because this file is the POINTER suite, and
   * "every card on this index can actually be clicked" is exactly its subject.
   * The full sweep — all three indexes, both locales, hrefs resolving 200 —
   * lives in `index-cards.spec.ts`.
   */
  test('no card on the course index is unlinked', async ({ page }) => {
    await page.goto('/cours/');
    await expect(page.locator('.card-grid > .card')).not.toHaveCount(0);
    await expect(page.locator('.card-grid > .card:not(.card-linked)')).toHaveCount(0);
  });
});
