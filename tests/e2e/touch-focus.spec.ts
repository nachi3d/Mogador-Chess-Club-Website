import { test, expect, type Page } from '@playwright/test';
import { movePiece, typeMove } from './helpers/board';

/**
 * FOCUS FOLLOWS THE MODALITY OF THE MOVE, NOT THE DEVICE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The defect this pins was found by Seàn on a real phone, and the suite could
 * not have found it on its own: every tapped move re-focused the move-entry
 * field, which opens the virtual keyboard, which shrinks the visual viewport,
 * which scrolls the board out of sight. Playing by tapping became unusable.
 *
 * ⚠️ A HEADLESS BROWSER HAS NO SOFT KEYBOARD, so the symptom itself is not
 * reproducible here. What IS reproducible is its cause and its other half:
 *
 *   1. focus landing in the text field after a tapped move — the cause;
 *   2. the page scrolling, because `focus()` scrolls its target into view
 *      unless asked not to — the same displacement, minus the keyboard.
 *
 * The scroll assertion is the one that matters. It is the closest a headless
 * run gets to what actually happened to him, and it fails on the old code.
 *
 * The rule is NOT "phones behave differently" — see `useMoveSource.ts`. A
 * phone user who types still gets the field back; a desktop user who drags
 * does not. So the desktop tests below are as much a part of this as the
 * mobile ones: they prove the gate did not simply switch the feature off.
 * ─────────────────────────────────────────────────────────────────────────
 */

const EXERCISE = '/exercices/mat-du-couloir/'; // mate in one, a1-a8

const LESSON = '/cours/bien-ouvrir-une-partie/occuper-le-centre/';

async function openExercise(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-testid="chessboard"]').first().scrollIntoViewIfNeeded();
  await page.locator('[data-testid="chessboard"] cg-board').first().waitFor({ timeout: 20_000 });
  await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-ready', 'true', {
    timeout: 20_000,
  });
}

/**
 * Tap or click a square on a SPECIFIC board, choosing whichever the context
 * supports. Same shape as the helper in `board-pointer.spec.ts`: needed here
 * because a lesson page carries two boards and the shared `movePiece` helper
 * takes no board argument.
 */
async function pointTo(page: Page, board: ReturnType<Page['locator']>, file: number, rank: number) {
  const cg = board.locator('cg-board');
  const box = await cg.boundingBox();
  if (!box) throw new Error('board has no box');
  const sq = box.width / 8;
  const position = { x: sq * (file + 0.5), y: sq * (7 - rank + 0.5) };
  const touch = await page.evaluate(() => 'ontouchstart' in window);
  if (touch) await cg.tap({ position });
  else await cg.click({ position });
}

/**
 * Wait for the exercise's move sequence to actually finish.
 *
 * ⚠️ WAITING FOR `data-busy="false"` ALONE IS A BUG. It is ALSO the resting
 * state, so Playwright's first poll can observe the pre-tap value and the
 * assertion passes instantly — long before the opponent has replied and long
 * before the focus signal would have fired. That is why the correct-move test
 * below passed against the UNFIXED build on the first attempt: it was
 * measuring nothing. Wait for the transition, not the destination.
 */
async function settleAfterMove(page: Page) {
  const exercise = page.locator('.mcc-exercise').first();
  await expect(exercise).toHaveAttribute('data-busy', 'true', { timeout: 10_000 });
  await expect(exercise).toHaveAttribute('data-busy', 'false', { timeout: 20_000 });
  /* The focus effect runs after the render that clears `busy`; give it a frame
     rather than racing it. */
  await page.waitForTimeout(300);
}

/** Is focus currently inside a text field? */
const focusIsInInput = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
  });

/**
 * ⚠️ THESE USE A TWO-STEP EXERCISE, AND THAT IS NOT INCIDENTAL.
 *
 * Focus is pulled back at the moment it becomes the reader's turn AGAIN — so
 * only an exercise with an opponent reply, or a refused move, ever reaches the
 * code under test. The first draft of this file tapped through `mat-du-couloir`
 * (mate in one) and passed against the UNFIXED build, because solving on the
 * last step never bumped the signal in the first place.
 *
 * ⚠️ WHICH OF THESE ACTUALLY HAVE TEETH, verified by rebuilding without the
 * fix and re-running — not assumed:
 *
 *   fails on old code · a tapped move, after the opponent reply
 *   fails on old code · a tapped move that is REFUSED
 *   fails on old code · a tapped move following a typed one
 *   guard only ······· · solving a one-move exercise (never reaches the path)
 *   guard only ······· · the course lesson (its exercise is one move too)
 *
 * The "guard only" two cannot fail on the old code and are kept deliberately:
 * they pin the paths where focus must never START being pulled. Saying so
 * matters, because a file that claims every test has teeth and does not is
 * worse than one that admits which is which.
 *
 * `opposition-et-mat`: `f6g6`, black replies `h8g8`, then `a1a8` mates.
 */
const TWO_STEP = '/exercices/opposition-et-mat/';

test.describe('a tapped move leaves focus alone', () => {
  test('a tapped move: the opponent reply does not pull focus into the field', async ({ page }) => {
    await openExercise(page, TWO_STEP);

    /* Put the board where a reader would be looking at it, and note where that
       is. Anything that moves the page after this is the bug. */
    await page
      .locator('[data-testid="chessboard"]')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const boardBefore = await page.locator('[data-testid="chessboard"]').first().boundingBox();

    await movePiece(page, 'f6', 'g6');
    /* Wait past the reply AND the step advance — that is where the old code
       bumped the focus signal. */
    await settleAfterMove(page);

    expect(
      await focusIsInInput(page),
      'a tapped move put focus in a text field — on a phone that opens the keyboard',
    ).toBe(false);

    /* ⚠️ THE ASSERTION THAT MATTERS. `focus()` scrolls its target into view by
       default, and the field sits below the board. */
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const boardAfter = await page.locator('[data-testid="chessboard"]').first().boundingBox();
    expect(
      Math.abs(scrollAfter - scrollBefore),
      'the page scrolled after a tapped move',
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs((boardAfter?.y ?? 0) - (boardBefore?.y ?? 0)),
      'the board moved in the viewport after a tapped move',
    ).toBeLessThanOrEqual(2);
  });

  /** A refused move is the other path that hands the turn back. */
  test('a tapped move that is refused does not pull focus either', async ({ page }) => {
    await openExercise(page, TWO_STEP);
    await page
      .locator('[data-testid="chessboard"]')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Legal, and not the line — the king steps the wrong way.
    await movePiece(page, 'f6', 'f5');
    await settleAfterMove(page);

    expect(await focusIsInInput(page), 'a refused tap focused the field').toBe(false);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(2);
  });

  /** A single-move exercise never reaches the focus path — kept as a guard
      that solving outright does not grow one. It does NOT fail on old code. */
  test('solving a one-move exercise by tap leaves focus alone', async ({ page }) => {
    await openExercise(page, EXERCISE);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    expect(await focusIsInInput(page)).toBe(false);
  });

  /**
   * A lesson is the harsher case: the exercise sits low on a long page, so
   * there is plenty of room above it for a stray focus to scroll into.
   */
  test('course lesson: tapping does not scroll the board away', async ({ page }) => {
    await page.goto(LESSON);
    /* ⚠️ Index 1: the lesson carries a REPLAYER first and the exercise below
       it, so the shared `movePiece` helper — which uses an unscoped board
       locator — resolves to two elements here. Scoping is also what makes this
       the harshest scroll case on the site: the exercise sits far down a long
       page, with plenty of room above it for a stray focus to scroll into. */
    const board = page.locator('[data-testid="chessboard"]').nth(1);
    await board.scrollIntoViewIfNeeded();
    await board.locator('cg-board').waitFor({ timeout: 20_000 });
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-ready', 'true', {
      timeout: 20_000,
    });
    await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await pointTo(page, board, 4, 1); // e2
    await pointTo(page, board, 4, 3); // e4
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    await page.waitForTimeout(300);

    expect(await focusIsInInput(page)).toBe(false);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore), 'the lesson scrolled after a tapped move').toBeLessThanOrEqual(2);
  });

});

/**
 * The other half. If these fail, the fix has not gated the behaviour — it has
 * deleted it, and a keyboard player is back to being stranded on a disabled
 * control with no sign that the opponent has moved.
 */
test.describe('a typed move still brings focus back', () => {
  test('a typed move returns focus to the field', async ({ page }) => {
    await openExercise(page, '/exercices/opposition-et-mat/'); // two steps, has a reply

    await typeMove(page, 'Kg6');
    /* The opponent replies, then it is the reader's turn again — that is the
       moment focus is pulled back, and the reader asked for it by typing. */
    await expect(page.locator('[data-testid="move-input-field"]')).toBeFocused({
      timeout: 15_000,
    });
  });

  test('a tapped move after a typed one does NOT bring it back', async ({ page }) => {
    await openExercise(page, '/exercices/opposition-et-mat/');

    // Establish the typing flow first…
    await typeMove(page, 'Kg6');
    await expect(page.locator('[data-testid="move-input-field"]')).toBeFocused({ timeout: 15_000 });

    // …then switch to tapping. The modality of the LAST move decides.
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-busy', 'false', {
      timeout: 15_000,
    });
    await movePiece(page, 'g6', 'f6');
    await page.waitForTimeout(1200);

    expect(
      await focusIsInInput(page),
      'the field was re-focused after a TAPPED move, because an earlier move had been typed',
    ).toBe(false);
  });
});

/**
 * The field is never taken away on touch. Some students will prefer typing,
 * and it is the accessible path — it just stops grabbing focus unasked.
 */
test('the move field stays present and usable on every device', async ({ page }) => {
  await openExercise(page, EXERCISE);

  const field = page.locator('[data-testid="move-input-field"]');
  await expect(field).toBeVisible();
  await expect(field).toBeEnabled();

  // And it still works when the reader chooses it.
  await typeMove(page, 'Ta8');
  await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
    timeout: 15_000,
  });
});
