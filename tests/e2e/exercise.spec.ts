import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The exercise board.
 *
 * Hydration, as in replayer.spec.ts: `<cg-board>` is created by Chessground in
 * a `useEffect`, so it exists only after the island has hydrated. Waiting on
 * `[data-testid="exercise"]` would NOT be a hydration signal — Astro
 * server-renders the Preact markup too.
 *
 * There is a SECOND gate here that the replayer does not have. The exercise
 * engine (and chess.js with it) is lazy-imported, so the board is view-only
 * until that chunk lands. `data-ready="true"` is set when it has; interacting
 * before then silently does nothing, which would read as a flaky test.
 */

const MATE_IN_1 = { fr: '/exercices/mat-du-couloir/', en: '/en/exercices/mat-du-couloir/' };
const MATE_IN_2 = { fr: '/exercices/opposition-et-mat/', en: '/en/exercices/opposition-et-mat/' };
const FORK = { fr: '/exercices/fourchette-de-cavalier/', en: '/en/exercices/fourchette-de-cavalier/' };

async function openExercise(page: Page, path: string) {
  await page.goto(path);
  // `client:visible`: on a phone viewport the board starts below the fold and
  // legitimately does not hydrate until scrolled to. Do what a reader does.
  await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="chessboard"] cg-board').waitFor({ timeout: 15_000 });
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

/**
 * The centre of a square in page coordinates.
 *
 * Chessground positions pieces with transforms rather than putting a DOM node
 * per square, so there is nothing to select by name — the geometry has to be
 * computed. The board is always 8×8 of its own box; `orientation` decides which
 * corner is a1.
 */
async function squareCenter(page: Page, square: string, orientation: 'white' | 'black' = 'white') {
  const box = await page.locator('[data-testid="chessboard"] cg-board').boundingBox();
  if (!box) throw new Error(`the board has no layout box; cannot locate ${square}`);

  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;

  return {
    x: box.x + ((col + 0.5) * box.width) / 8,
    y: box.y + ((row + 0.5) * box.height) / 8,
  };
}

/**
 * Let at least one animation frame run.
 *
 * ⚠️ THIS IS LOAD-BEARING, NOT A "let things settle" sleep. Chessground marks a
 * drag as *started* inside a `requestAnimationFrame` loop (`processDrag` in
 * drag.ts), and `end()` only produces a move when `cur.started` is set. Playwright
 * dispatches `mouse.move(..., { steps })` back to back with no delay, so a whole
 * synthetic drag can begin and finish inside a single frame — Chessground then
 * treats it as a click-select and the piece just sits there, selected, with the
 * legal-move dots showing and no move emitted.
 *
 * It cost a full-matrix run to find: deterministic on iPhone 13, intermittent on
 * Firefox, invisible on desktop Chromium where the frames happen to fall right.
 *
 * The `setTimeout` is a floor, not a race to win — rAF can be throttled hard in
 * an emulated mobile context, and this must never hang.
 */
async function nextFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        setTimeout(resolve, 150);
      }),
  );
}

/**
 * Drag a piece from one square to another, the way a reader does.
 *
 * Waits for the board to be accepting input first. It ignores moves while a
 * scripted reply is playing out or the shake is running — correct behaviour,
 * and invisible from the outside, so a spec that drags straight through it just
 * sees its move vanish. `data-busy` is what makes that waitable.
 */
async function playMove(page: Page, from: string, to: string) {
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-busy', 'false', {
    timeout: 10_000,
  });

  const origin = await squareCenter(page, from);
  const target = await squareCenter(page, to);

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

test.describe('exercise — solving', () => {
  test('a mate in one solves end to end', async ({ page }) => {
    await openExercise(page, MATE_IN_1.fr);

    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('exercise-solved')).toHaveCount(0);

    await playMove(page, 'a1', 'a8');

    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('exercise-solved')).toBeVisible();
    // The line ends in mate, and the exercise says so rather than leaving the
    // student to work out whether it was over.
    await expect(page.getByTestId('exercise-status')).toContainText('Échec et mat');
    // No wrong turns: the attempt counter stays at zero.
    await expect(page.getByTestId('exercise-attempts')).toHaveText('0');
  });

  /**
   * The multi-step path: a correct move, a SCRIPTED OPPONENT REPLY played for
   * the student, then the second correct move. This is the one that proves
   * `opponentReplies` interleaves rather than just parsing.
   */
  test('a two-move solution plays the opponent reply in between', async ({ page }) => {
    await openExercise(page, MATE_IN_2.fr);

    await expect(page.getByTestId('exercise')).toHaveAttribute('data-step', '0');

    await playMove(page, 'f6', 'g6');
    // The board advances to step 1 only after the opponent's Kg8 has landed.
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-step', '1', {
      timeout: 10_000,
    });

    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 10_000,
    });
  });

  test('the solved line is replayable afterwards', async ({ page }) => {
    await openExercise(page, MATE_IN_1.fr);
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise-solution')).toBeVisible({ timeout: 10_000 });
    // SAN, language-neutral by the PGN rule — the same in both locales.
    await expect(page.getByTestId('exercise-solution').locator('button')).toHaveText(['Ra8#']);
  });
});

test.describe('exercise — feedback', () => {
  /**
   * `onlyMove: true`. Ra8# is the ONLY mate here — `check-content.mjs` proves it
   * on every build — so calling anything else wrong is a claim we can defend.
   */
  test('a wrong move is refused, counted, and the board resets', async ({ page }) => {
    await openExercise(page, MATE_IN_1.fr);

    await playMove(page, 'a1', 'a7');

    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'wrong');
    await expect(page.getByTestId('exercise-status')).toContainText("Ce n'est pas le bon coup");
    await expect(page.getByTestId('exercise-attempts')).toHaveText('1');
    // Still solvable: the board went back and takes the right move.
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 10_000,
    });
  });

  /**
   * ⚠️ THE RULE THIS WHOLE FEATURE IS BUILT AROUND (CLAUDE.md → Exercise
   * validation rule).
   *
   * `opposition-et-mat` is `onlyMove: false` because 1. Kf7 mates just as
   * surely as 1. Kg6 does. A student who finds Kf7 has found a mate in two, and
   * the site must NOT tell them they are wrong — it says the move is not the
   * line we had in mind, and adds that other moves may well win too.
   *
   * If this test ever fails because the copy changed to "wrong", that is not a
   * test to update. It is a regression.
   */
  test('onlyMove:false never calls an off-line move wrong', async ({ page }) => {
    await openExercise(page, MATE_IN_2.fr);

    await playMove(page, 'f6', 'f7');

    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'off-line');
    const status = page.getByTestId('exercise-status');
    await expect(status).toContainText("pas la ligne que nous avions en tête");
    await expect(page.getByTestId('exercise-offline-note')).toBeVisible();
    // The word we must never use for a move we cannot prove wrong.
    await expect(status).not.toContainText('Ce n’est pas le bon coup');
    await expect(status).not.toContainText("Ce n'est pas le bon coup");
    // It still counts as an attempt — the counter is a tally, not a verdict.
    await expect(page.getByTestId('exercise-attempts')).toHaveText('1');
  });

  test('an illegal move is not even counted', async ({ page }) => {
    await openExercise(page, MATE_IN_1.fr);
    // A rook cannot go diagonally; Chessground holds the legal-move map and
    // refuses it outright, so nothing reaches the validator.
    await playMove(page, 'a1', 'c3');

    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('exercise-attempts')).toHaveText('0');
  });

  test('the hint reveals on demand and stays revealed', async ({ page }) => {
    await openExercise(page, FORK.fr);

    await expect(page.getByTestId('exercise-hint')).toHaveCount(0);
    await page.getByTestId('exercise-hint-button').click();
    await expect(page.getByTestId('exercise-hint')).toBeVisible();
    await expect(page.getByTestId('exercise-hint')).toContainText('cavalier');

    // Sticky across a reload: having seen the hint is a fact, not a UI state.
    await page.reload();
    await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('exercise-hint')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('exercise — progress', () => {
  test('a solve survives a reload and marks the index', async ({ page }) => {
    await openExercise(page, MATE_IN_1.fr);
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 10_000,
    });

    // The tick appears on the index, on the right card and only on it.
    await page.goto('/exercices/');
    const solved = page.locator('[data-solved-for="mat-du-couloir"]');
    await expect(solved).toBeVisible();
    await expect(solved).toContainText('Résolu');
    await expect(page.locator('[data-solved-for="fourchette-de-cavalier"]')).toBeHidden();

    // And the detail page greets a returning solver differently.
    await openExercise(page, MATE_IN_1.fr);
    await expect(page.getByTestId('exercise-status')).toContainText('Déjà résolu');
  });

  test('"recommencer" clears the attempts but never the solve', async ({ page }) => {
    await openExercise(page, MATE_IN_1.fr);
    await playMove(page, 'a1', 'a7');
    await expect(page.getByTestId('exercise-attempts')).toHaveText('1');
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 10_000,
    });

    await page.getByTestId('exercise-retry').click();
    await expect(page.getByTestId('exercise-attempts')).toHaveText('0');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-step', '0');

    // The tick on the index is untouched — solving it once happened.
    await page.goto('/exercices/');
    await expect(page.locator('[data-solved-for="mat-du-couloir"]')).toBeVisible();
  });

  /**
   * Safari private mode throws on `setItem`; a full quota throws; an embedded
   * context can throw on `localStorage` itself. None of that may break the
   * page — a reader who cannot persist anything still gets a working exercise,
   * just without a tick. See the guards in `src/lib/progress.ts`.
   */
  test('a broken localStorage does not break the exercise', async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException('QuotaExceededError');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
      });
    });

    await openExercise(page, MATE_IN_1.fr);
    await playMove(page, 'a1', 'a7');
    await expect(page.getByTestId('exercise-attempts')).toHaveText('1');
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
      timeout: 10_000,
    });

    // The index still renders; it simply knows nothing.
    await page.goto('/exercices/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-solved-for="mat-du-couloir"]')).toBeHidden();
  });
});

test.describe('exercise — the English side', () => {
  test('solves in English and speaks English', async ({ page }) => {
    await openExercise(page, MATE_IN_1.en);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await playMove(page, 'a1', 'a7');
    await expect(page.getByTestId('exercise-status')).toContainText('not the right move');

    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise-solved')).toContainText('Exercise solved', {
      timeout: 10_000,
    });
  });

  test('onlyMove:false is just as careful in English', async ({ page }) => {
    await openExercise(page, MATE_IN_2.en);
    await playMove(page, 'f6', 'f7');
    await expect(page.getByTestId('exercise-status')).toContainText(
      'not the line we had in mind',
    );
    await expect(page.getByTestId('exercise-status')).not.toContainText('not the right move');
  });
});

test.describe('exercise — architecture', () => {
  /**
   * The one-board rule, enforced rather than trusted: an index page never
   * mounts a board. The solved ticks are a plain script, NOT an island — if
   * they ever become a component, this fails.
   */
  for (const path of ['/exercices/', '/en/exercices/'] as const) {
    test(`the exercises index at ${path} mounts no board`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('astro-island')).toHaveCount(0);
      await expect(page.locator('cg-board')).toHaveCount(0);
    });
  }

  test('the WhatsApp share link is outbound and has no recipient', async ({ page }) => {
    await page.goto(MATE_IN_1.fr);

    const href = await page
      .getByRole('link', { name: 'Partager sur WhatsApp' })
      .getAttribute('href');
    expect(href).toBeTruthy();
    const url = new URL(href!);
    expect(url.host).toBe('wa.me');
    // No number: this opens the READER's WhatsApp for them to choose. The club
    // never posts anything — CLAUDE.md, "No in-app communication".
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('text') ?? '').toContain('/exercices/mat-du-couloir/');
  });
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('exercise — accessibility', () => {
  for (const [name, path] of [
    ['exercises index FR', '/exercices/'],
    ['exercises index EN', '/en/exercices/'],
  ] as const) {
    test(`${name} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }

  for (const [name, path] of [
    ['exercise FR', MATE_IN_1.fr],
    ['exercise EN', MATE_IN_1.en],
  ] as const) {
    test(`${name} has no axe violations, board hydrated`, async ({ page }) => {
      await openExercise(page, path);
      await expectNoAxeViolations(page);
    });

    test(`${name} has no axe violations once solved`, async ({ page }) => {
      // The solved state adds the solution list, the retry button and the
      // checkmate flag — more DOM than the start, so it gets its own pass.
      await openExercise(page, path);
      await playMove(page, 'a1', 'a8');
      await expect(page.getByTestId('exercise')).toHaveAttribute('data-state', 'solved', {
        timeout: 10_000,
      });
      await expectNoAxeViolations(page);
    });
  }
});
