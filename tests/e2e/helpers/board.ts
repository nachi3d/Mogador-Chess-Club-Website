import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Driving a Chessground board from a spec.
 *
 * Shared by `exercise.spec.ts` and `play.spec.ts` so the subtleties below are
 * stated once. Every one of them cost a matrix run to find, and none is obvious
 * from the failure it produces.
 *
 * (Not collected as a spec — Playwright only picks up `*.spec.ts`.)
 */

const BOARD = '[data-testid="chessboard"] cg-board';

export const boardLocator = (page: Page): Locator => page.locator(BOARD);

/**
 * Where a square sits WITHIN the board, as an offset from its top-left corner.
 *
 * ⚠️ Offsets, not page coordinates, and that is the whole point. Chessground
 * positions pieces with transforms rather than a DOM node per square, so the
 * geometry has to be computed either way — but computing it in PAGE space and
 * firing `page.mouse.click(x, y)` breaks the moment anything scrolls between
 * the two clicks of a tap. It does scroll: on a phone viewport, the second
 * click lands on the move-entry field instead of the board, focusing an input
 * scrolls it into view, and the failure looks like "the board ignored me" with
 * a screenshot showing the piece selected and the page halfway down.
 *
 * Handing an offset to `locator.click({ position })` makes Playwright scroll
 * the board into view itself and resolve the point against the element. Scroll
 * position stops mattering at all.
 *
 * `orientation` decides which corner is a1 — it flips when playing Black.
 */
function squareOffset(
  box: { width: number; height: number },
  square: string,
  orientation: 'white' | 'black',
) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;

  return { x: ((col + 0.5) * box.width) / 8, y: ((row + 0.5) * box.height) / 8 };
}

/** The centre of a square, in offsets within the board element. */
async function offsetOf(page: Page, square: string, orientation: 'white' | 'black') {
  const box = await boardLocator(page).boundingBox();
  if (!box) throw new Error(`the board has no layout box; cannot locate ${square}`);
  return squareOffset(box, square, orientation);
}

/**
 * Move a piece by TAPPING: click the piece, then click its destination.
 *
 * ⚠️ THIS, NOT `dragPiece`, IS THE DEFAULT FOR SPECS — worth knowing before
 * anyone "improves" it back into a drag.
 *
 * Chessground registers a drag only once `cur.started` is set, and that happens
 * inside a `requestAnimationFrame` loop. A synthetic drag is instantaneous,
 * unlike a human's, so under the full matrix the mobile-emulation projects
 * starve rAF badly enough that the whole drag completes before any frame runs
 * and the move silently never happens. It cannot be waited out — starvation
 * needs a *frame*, not wall-clock, which is why raising the fallback from 150ms
 * to a second made the failure count go UP.
 *
 * Tap-to-move goes through `selectSquare` on plain mousedown/mouseup with no
 * rAF anywhere, lands in the same `userMove` → `onMove` handler, and is what
 * people actually do on the phones most club members will arrive on. Same code
 * under test, none of the fragility.
 */
/**
 * ⚠️ A PRESS NEEDS A DURATION, OR CHESSGROUND IGNORES IT.
 *
 * `click()` with no `delay` sends mousedown and mouseup with nothing in
 * between, so both land in the same animation frame. Chessground does its drag
 * bookkeeping inside a `requestAnimationFrame` loop (`processDrag`), and a
 * press that is already released before that frame runs is not a press it can
 * act on — it silently emits no move. CLAUDE.md documents the same mechanism
 * for synthetic drags; this is the tap-shaped version of it.
 *
 * MEASURED on `/apprendre-les-bases/le-cavalier/`, 8 fresh contexts each:
 *
 *     click delay = 0ms   → solved 1/8
 *     click delay = 60ms  → solved 8/8
 *
 * ⚠️ It was never a product bug. Driven at any human pace the same board picks
 * up and solves every time, verified by hand before this line was written — a
 * 0ms press is simply not something a person can produce.
 *
 * `tap()` takes no `delay` and the touch projects have never shown this, so the
 * touch path is left alone.
 */
const PRESS_MS = 60;

export async function movePiece(
  page: Page,
  from: string,
  to: string,
  orientation: 'white' | 'black' = 'white',
) {
  const board = boardLocator(page);
  /**
   * ⚠️ TOUCH DEVICES GET REAL TOUCH EVENTS, not synthetic mouse clicks.
   *
   * Chessground binds `touchstart` AND `mousedown`, and on a touch-enabled
   * context the touch path is the one a real reader exercises. Sending mouse
   * events there is not merely unfaithful, it is unreliable: the Pixel 5
   * project (Chromium with touch emulation) selects the piece on the first
   * mouse click and then ignores the second, so the move never happens and the
   * board looks like it is refusing legal input. `tap()` works on both mobile
   * projects; `click()` is right for the desktop ones, where `tap()` would
   * throw because the context has no touch at all.
   */
  const touch = await page.evaluate(() => 'ontouchstart' in window);
  const press = async (square: string) => {
    const position = await offsetOf(page, square, orientation);
    // Recomputed per press: selecting a piece renders the move-destination
    // dots, and the board can move or resize under them.
    if (touch) await board.tap({ position });
    else await board.click({ position, delay: PRESS_MS });
  };

  await press(from);
  await press(to);
}

/**
 * Let at least one animation frame run. Only `dragPiece` needs this.
 *
 * The `setTimeout` is ONLY a guard against hanging forever. An eager fallback
 * is worse than none: resolving early lets the drag proceed with `cur.started`
 * still unset, which is exactly the failure it was meant to prevent.
 */
async function nextFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        setTimeout(resolve, 1000);
      }),
  );
}

/**
 * Drag a piece with the mouse — a different Chessground path from tapping, and
 * a real one for anyone using a mouse.
 *
 * Specs using this are pinned to desktop Chromium; see the note on `movePiece`
 * for why, and `play.spec.ts` for where. `hover()` first so Playwright scrolls
 * the board into view before any raw mouse coordinate is computed.
 */
export async function dragPiece(
  page: Page,
  from: string,
  to: string,
  orientation: 'white' | 'black' = 'white',
) {
  const board = boardLocator(page);
  await board.hover({ position: await offsetOf(page, from, orientation) });

  const box = await board.boundingBox();
  if (!box) throw new Error('the board has no layout box');
  const at = (square: string) => {
    const offset = squareOffset(box, square, orientation);
    return { x: box.x + offset.x, y: box.y + offset.y };
  };
  const origin = at(from);
  const target = at(to);

  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  // Chessground starts a drag on movement, not on press — going straight to
  // mouseup would register as a click-select instead.
  await page.mouse.move((origin.x + target.x) / 2, (origin.y + target.y) / 2, { steps: 6 });
  await nextFrame(page);
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await nextFrame(page);
  await page.mouse.up();
}

/** Type a move into the keyboard field — the input both board modes share. */
export async function typeMove(page: Page, text: string, timeout = 10_000) {
  const field = page.getByTestId('move-input-field');
  await expect(field).toBeEnabled({ timeout });
  await field.fill(text);
  await field.press('Enter');
}
