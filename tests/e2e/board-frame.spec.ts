import { test, expect, type Page } from '@playwright/test';

/**
 * The frame must enclose the whole component.
 *
 * ⚠️ WHAT WENT WRONG, so the shape of this test makes sense.
 *
 * The frame was drawn on `.mcc-board-host` — the playing surface alone. That was
 * right until the coordinates moved into gutters, which live in `.mcc-board`'s
 * padding, OUTSIDE the host. The frame then enclosed the squares and excluded
 * both gutters: it cut across the rank labels, the file labels hung below it,
 * and it overhung the component's right edge by exactly 6px (its own 2×3px
 * border, added outside a content box the left padding had already narrowed).
 *
 * So this does not check "is there a border". It checks that everything the
 * component draws — surface AND both coordinate tracks — lies INSIDE the frame,
 * and that the frame sits evenly around them. Those are the two properties that
 * broke, and either can break again the next time the box model moves.
 */

interface FrameMetrics {
  frameW: number;
  frameH: number;
  squareness: number;
  ranksInside: boolean;
  filesInside: boolean;
  surfaceInside: boolean;
  gapL: number;
  gapR: number;
  gapT: number;
  gapB: number;
}

async function frameMetrics(page: Page, index = 0): Promise<FrameMetrics> {
  return page.evaluate((i) => {
    const host = document.querySelectorAll('[data-testid="chessboard"]')[i] as HTMLElement;
    const outer = host.closest('.mcc-board') as HTMLElement;
    const surface = host.querySelector('cg-board')!.getBoundingClientRect();
    const files = host.querySelector('coords.files')!.getBoundingClientRect();
    const ranks = host.querySelector('coords.ranks')!.getBoundingClientRect();
    const o = outer.getBoundingClientRect();
    const bw = parseFloat(getComputedStyle(outer).borderLeftWidth);

    /* The frame's inner edge — everything drawn must be within it. Half a pixel
       of slack for sub-pixel layout, and no more. */
    const inner = { l: o.left + bw, r: o.right - bw, t: o.top + bw, b: o.bottom - bw };
    const within = (box: DOMRect) =>
      box.left >= inner.l - 0.5 &&
      box.right <= inner.r + 0.5 &&
      box.top >= inner.t - 0.5 &&
      box.bottom <= inner.b + 0.5;

    return {
      frameW: o.width,
      frameH: o.height,
      squareness: Math.abs(o.width - o.height),
      ranksInside: within(ranks),
      filesInside: within(files),
      surfaceInside: within(surface),
      gapL: ranks.left - inner.l,
      gapR: inner.r - surface.right,
      gapT: surface.top - inner.t,
      gapB: inner.b - files.bottom,
    };
  }, index);
}

async function openBoard(page: Page, path: string, index = 0) {
  await page.goto(path);
  const board = page.locator('[data-testid="chessboard"]').nth(index);
  await board.scrollIntoViewIfNeeded();
  await board.locator('cg-board').waitFor({ timeout: 20_000 });
  await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  return board;
}

/** Sub-pixel rounding of an 8-square grid inside the content box, and no more. */
const EVENNESS_TOLERANCE = 4;

function expectWellFramed(m: FrameMetrics, where: string) {
  expect(m.ranksInside, `${where}: the rank labels fall outside the frame`).toBe(true);
  expect(m.filesInside, `${where}: the file labels fall outside the frame`).toBe(true);
  expect(m.surfaceInside, `${where}: the playing surface falls outside the frame`).toBe(true);
  expect(m.squareness, `${where}: the frame is not square`).toBeLessThan(1.5);

  const gaps = [m.gapL, m.gapR, m.gapT, m.gapB];
  for (const g of gaps) {
    expect(g, `${where}: negative gap — something overhangs the frame`).toBeGreaterThanOrEqual(-0.5);
  }
  expect(
    Math.max(...gaps) - Math.min(...gaps),
    `${where}: frame is off-centre — gaps L${m.gapL.toFixed(1)} R${m.gapR.toFixed(1)} ` +
      `T${m.gapT.toFixed(1)} B${m.gapB.toFixed(1)}`,
  ).toBeLessThan(EVENNESS_TOLERANCE);
}

test.describe('the frame encloses the whole component', () => {
  for (const [name, width] of [
    ['desktop', 1000],
    ['phone', 390],
  ] as const) {
    test(`a replayer is well framed on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openBoard(page, '/pieges/legal/');
      expectWellFramed(await frameMetrics(page), `replayer ${name}`);
    });

    test(`an exercise board is well framed on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openBoard(page, '/apprendre-les-bases/le-cavalier/');
      expectWellFramed(await frameMetrics(page), `exercise ${name}`);
    });
  }

  test('both boards on a lesson page are well framed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await openBoard(page, '/cours/bien-ouvrir-une-partie/occuper-le-centre/', 0);
    expectWellFramed(await frameMetrics(page, 0), 'lesson demonstration');
    await openBoard(page, '/cours/bien-ouvrir-une-partie/occuper-le-centre/', 1);
    expectWellFramed(await frameMetrics(page, 1), 'lesson exercise');
  });
});

/**
 * The report said it was "most visible in the solved state", so every exercise
 * state is measured — the board redraws on each, and a frame that only holds
 * while idle is not fixed.
 */
test.describe('the frame holds in every exercise state', () => {
  test('idle, wrong, and solved', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 1000 });
    const board = await openBoard(page, '/apprendre-les-bases/le-cavalier/');
    const exercise = page.locator('.mcc-exercise').first();
    await expect(exercise).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });

    expectWellFramed(await frameMetrics(page), 'idle');

    const box = (await board.locator('cg-board').boundingBox())!;
    const sq = box.width / 8;
    const at = (f: number, r: number) => ({ x: sq * (f + 0.5), y: sq * (7 - r + 0.5) });

    /**
     * ⚠️ WAIT FOR THE PICK-UP BEFORE CLICKING THE DESTINATION.
     *
     * Two clicks in the same frame is not a person tapping a piece and then a
     * square: Chessground drops the second often enough to fail a run, with
     * `data-attempts` still 0 because no move was ever attempted. The board is
     * fine when driven at any human pace — this is the harness modelling one.
     * Same fix and same reasoning as `pointTo` in board-pointer.spec.ts.
     */
    const cg = board.locator('cg-board');
    const pickUp = async (square: { x: number; y: number }) => {
      await cg.click({ position: square, delay: 60 });
      await expect(cg.locator('square.selected')).toHaveCount(1, { timeout: 5_000 });
    };

    // A legal but off-line move: the board shakes and resets.
    await pickUp(at(6, 0));
    await cg.click({ position: at(7, 2), delay: 60 });
    await expect(exercise).toHaveAttribute('data-attempts', '1', { timeout: 15_000 });
    await expect(exercise).toHaveAttribute('data-busy', 'false', { timeout: 15_000 });
    expectWellFramed(await frameMetrics(page), 'after a refused move');

    // Then solve it.
    await pickUp(at(6, 0));
    await cg.click({ position: at(5, 2), delay: 60 });
    await expect(exercise).toHaveAttribute('data-state', 'solved', { timeout: 15_000 });
    expectWellFramed(await frameMetrics(page), 'solved');
  });
});
