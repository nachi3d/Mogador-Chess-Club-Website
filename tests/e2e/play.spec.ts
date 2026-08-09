import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dragPiece, movePiece, typeMove as typeMoveHelper } from './helpers/board';

/**
 * Play against the computer.
 *
 * The engine is 3.6 MB and lazy. Two things matter most here, and neither is
 * about chess: that NOTHING is fetched until the reader presses the button, and
 * that the worker actually answers once they do.
 */

const FR = '/jouer/';
const EN = '/en/jouer/';

/** Engine boot + first search on a cold cache is genuinely slow. */
const ENGINE_TIMEOUT = 60_000;

/**
 * Playwright's default 30s per test is not enough here, and raising the
 * per-assertion timeout alone does not help — the TEST timeout fires first.
 *
 * Booting the engine means downloading 3.6 MB, compiling the WASM, completing
 * the UCI handshake and then running a search, on a machine already running
 * five browser projects in parallel. On desktop Chromium alone it is ~3s; under
 * the full matrix it has been seen well past 30. This is the cost of testing a
 * real engine rather than a mock, which is the right trade for the one feature
 * whose whole risk is "does the worker actually answer".
 */
test.beforeEach(() => {
  test.setTimeout(120_000);
});

/**
 * ⚠️ THIS FILE RUNS ITS TESTS ONE AT A TIME.
 *
 * Every test here boots a real engine: 3.6 MB fetched, 1.4 MB of WASM compiled,
 * and a **fixed 64 MiB** linear memory allocated. Under the global
 * `fullyParallel: true` that happens in six browser contexts at once, and the
 * machine simply runs out of room — the handshake misses its window and the
 * view correctly falls back to "could not load", so tests fail with
 * `data-phase="setup"` and nothing in the log looks like a bug.
 *
 * Raising the timeouts does NOT fix it; it only moves which assertion gives up
 * first. Reducing the concurrency does.
 *
 * `mode: 'default'` (not `'serial'`) is the one wanted: tests run sequentially
 * in one worker, but a failure does not skip the rest — so a genuine break is
 * still reported on its own terms. Other spec FILES keep running in parallel
 * alongside this one.
 *
 * `retries: 1` covers what that cannot: the five PROJECTS still run
 * concurrently, so a full-matrix run can have five engines booting at once
 * across five browsers. When one loses the race its view correctly shows
 * "could not load" and the test fails with `data-phase="setup"`. The retry runs
 * once the crowd has thinned. This absorbs contention, not bugs — a real break
 * is deterministic and fails the retry too, exactly as for the WebKit and
 * Firefox browser crashes documented in CLAUDE.md.
 */
test.describe.configure({ mode: 'default', retries: 1 });

async function openPlay(page: Page, path: string) {
  await page.goto(path);
  // `client:visible`: on a phone the board starts below the fold.
  await page.getByTestId('play').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('play')).toHaveAttribute('data-phase', 'setup', {
    timeout: 15_000,
  });
}

/** Start a game and wait until the board is live. */
async function startGame(page: Page, opts: { colour?: 'white' | 'black'; level?: string } = {}) {
  if (opts.colour === 'black') await page.getByRole('radio', { name: /noirs|Black/i }).check();
  if (opts.level) await page.getByRole('radio', { name: opts.level }).check();

  await page.getByTestId('play-start').click();
  await expect(page.getByTestId('play')).toHaveAttribute('data-phase', 'playing', {
    timeout: ENGINE_TIMEOUT,
  });

  /* The board does not exist until the game starts — the setup form was there
     instead — so it can land below the fold. The board helpers work in page
     coordinates, and a mouse event aimed past the bottom of the viewport
     silently hits nothing: the interaction "succeeds" and no move appears. */
  await page.locator('[data-testid="chessboard"] cg-board').scrollIntoViewIfNeeded();
}

/** Type a move — the engine can be slow, so the field wait is generous here. */
const typeMove = (page: Page, text: string) => typeMoveHelper(page, text, ENGINE_TIMEOUT);

/**
 * FOCUS FOLLOWS THE MODALITY OF THE MOVE, NOT THE DEVICE.
 *
 * ⚠️ THESE LIVE HERE, NOT IN `touch-focus.spec.ts`, BECAUSE THEY BOOT AN
 * ENGINE. This file runs its tests one at a time for that reason (see the note
 * above); the same test in a parallel file timed out at 60s waiting for the
 * handshake, which is the contention this file's configuration exists to
 * avoid rather than a failure of the thing under test.
 *
 * The rest of the rule is covered in `touch-focus.spec.ts`. See
 * `src/components/board/useMoveSource.ts`.
 */
test.describe('play — focus follows the modality of the move', () => {
  /** Is focus currently inside a text field? */
  const focusIsInInput = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
    });

  test('starting the game by pointer does not focus the move field', async ({ page }) => {
    await page.goto(FR);
    await startGame(page);
    /* The setup form — and the button the reader just pressed — is replaced by
       the board, so SOMETHING has to happen to focus for a keyboard player.
       Doing it unconditionally opened the phone keyboard before the reader had
       even seen the position. */
    expect(
      await focusIsInInput(page),
      'starting by tap/click focused the move field',
    ).toBe(false);
  });

  test('a tapped move does not focus the field, even after the engine replies', async ({
    page,
  }) => {
    await page.goto(FR);
    await startGame(page);

    await page
      .locator('[data-testid="chessboard"]')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await movePiece(page, 'e2', 'e4');
    // The engine's reply is what used to pull focus back.
    await expect(page.getByTestId('play-move-list').locator('li')).not.toHaveCount(0, {
      timeout: ENGINE_TIMEOUT,
    });
    await expect(page.getByTestId('play')).toHaveAttribute('data-thinking', 'false', {
      timeout: ENGINE_TIMEOUT,
    });

    expect(await focusIsInInput(page), 'the engine reply pulled focus into the field').toBe(false);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(
      Math.abs(scrollAfter - scrollBefore),
      'the page scrolled after a tapped move',
    ).toBeLessThanOrEqual(2);
  });

  test('a TYPED move still brings focus back after the reply', async ({ page }) => {
    await page.goto(FR);
    await startGame(page);
    await typeMove(page, 'e4');
    await expect(page.getByTestId('move-input-field')).toBeFocused({ timeout: ENGINE_TIMEOUT });
  });
});

test.describe('play — the engine is not fetched without a click', () => {
  /**
   * ⚠️ THE RULE THIS PAGE MOST EASILY BREAKS (CLAUDE.md → "No third-party
   * request without an explicit click", and the lazy-engine rule).
   *
   * Hydrating the island must render a form and fetch nothing. If someone ever
   * hoists the engine import to the top of `PlayView.tsx`, or lets
   * `PlayBoard.astro` reference the engine module, Vite pulls 3.6 MB into the
   * page graph and this fails.
   */
  test('opening the page requests neither the wasm nor the worker', async ({ page }) => {
    const engineRequests: string[] = [];
    page.on('request', (request) => {
      if (/stockfish|\.wasm/i.test(request.url())) engineRequests.push(request.url());
    });

    await openPlay(page, FR);
    await page.waitForLoadState('networkidle');
    // Scrolled to, hydrated, form on screen — and still nothing.
    await expect(page.getByTestId('play-start')).toBeVisible();

    expect(
      engineRequests,
      `the engine was fetched before any click:\n${engineRequests.join('\n')}`,
    ).toEqual([]);
  });

  test('pressing start is what fetches it', async ({ page }) => {
    const engineRequests: string[] = [];
    page.on('request', (request) => {
      if (/stockfish/i.test(request.url())) engineRequests.push(request.url());
    });

    await openPlay(page, FR);
    await startGame(page);

    expect(engineRequests.some((u) => u.includes('stockfish.js'))).toBe(true);
    expect(engineRequests.some((u) => u.includes('stockfish.wasm'))).toBe(true);
  });

  test('no third-party origin is contacted at any point', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(request.url());
    });

    await openPlay(page, FR);
    await startGame(page);

    expect(external, `unexpected third-party requests:\n${external.join('\n')}`).toEqual([]);
  });
});

test.describe('play — a game', () => {
  test('as black at débutant, the engine opens and the game runs', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { colour: 'black', level: 'Débutant' });

    // Playing black means White moves first — the engine has to have moved
    // before it is the reader's turn at all.
    await expect(page.getByTestId('play-move-list')).toContainText(/[a-hKQRBN]/, {
      timeout: ENGINE_TIMEOUT,
    });
    await expect(page.getByTestId('play')).toHaveAttribute('data-turn', 'black', {
      timeout: ENGINE_TIMEOUT,
    });

    // And the reader can answer, by keyboard.
    await typeMove(page, 'e5');
    await expect(page.getByTestId('play-move-list')).toContainText('e5');
  });

  test('as white, a move is answered by the engine', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });

    await typeMove(page, 'e4');
    await expect(page.getByTestId('play-move-list')).toContainText('e4');

    // The engine replies and hands the move back.
    await expect(page.getByTestId('play')).toHaveAttribute('data-turn', 'white', {
      timeout: ENGINE_TIMEOUT,
    });
    const moves = await page.getByTestId('play-move-list').textContent();
    // "1." plus White's and Black's move — the engine has answered.
    expect((moves ?? '').replace(/\s+/g, ' ').trim().length).toBeGreaterThan(4);
  });

  /**
   * PACING (Session 6). The engine must appear to think.
   *
   * At Débutant the search is depth 2 and returns in single-digit milliseconds,
   * so without the floor in `src/lib/motion.ts` the reply lands in the same
   * frame as the reader's own move — which reads as a glitch, not an opponent.
   *
   * The assertion is a LOWER bound only, and deliberately so. The floor is a
   * floor, not a fixed wait: a slower level may legitimately take much longer,
   * and asserting an upper bound here would turn "Stockfish thought hard about
   * a sharp position" into a test failure.
   *
   * 400ms against a 500ms minimum leaves room for timer coalescing and a loaded
   * CI machine, while still being far above the ~0ms this measures if the floor
   * is ever removed — the failure it exists to catch is a collapse to instant,
   * not a 20% drift.
   */
  test('the engine appears to think before it answers', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });

    const startedAt = Date.now();
    await typeMove(page, 'e4');
    // The reader's own move renders immediately — that is not what we time.
    await expect(page.getByTestId('play-move-list')).toContainText('e4');
    // Hand-back is the observable end of the engine's turn.
    await expect(page.getByTestId('play')).toHaveAttribute('data-turn', 'white', {
      timeout: ENGINE_TIMEOUT,
    });
    const elapsed = Date.now() - startedAt;

    expect(
      elapsed,
      `the engine answered in ${elapsed}ms — the thinking floor looks collapsed`,
    ).toBeGreaterThanOrEqual(400);
  });

  /**
   * ⚠️ THE BLUNDER PATH, EXERCISED IN A REAL BROWSER.
   *
   * Débutant plays a uniformly random legal move 40% of the time, and that
   * move comes from a SECOND kind of UCI exchange: `MultiPV 500` at depth 1 to
   * enumerate the root moves, then a restore to `MultiPV 1`. Two things could
   * break and neither would look like a chess bug — the sweep could return
   * something unplayable, or the restore could fail and leave every subsequent
   * search reporting 500 lines.
   *
   * Over five replies the chance of never taking that path is 0.6^5 ≈ 8%, and
   * the other tests in this file play at Débutant too, so across the file it
   * is exercised with near certainty. What this one adds is REPETITION inside
   * a single game, which is what would expose a leaked `MultiPV`.
   *
   * ⚠️ The reader's moves are CANDIDATE LISTS, not a fixed line. The engine's
   * replies are partly random, so a scripted opening would be illegal most
   * runs. The move list is the app's own record of what it accepted, so it is
   * the thing to test against.
   */
  test('débutant keeps answering legally across several plies', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });

    const view = page.getByTestId('play');
    const list = page.getByTestId('play-move-list');

    const plies = [
      ['e4', 'd4', 'Nf3'],
      ['Nf3', 'Nc3', 'd4', 'a3', 'h3'],
      ['Bc4', 'Bb5', 'd3', 'h3', 'a3'],
      ['d3', 'a3', 'h3', 'Be2', 'Nc3'],
      ['Nc3', 'a3', 'h3', 'd3', 'Be2'],
    ];

    for (const candidates of plies) {
      /* A random opponent can walk into mate in a handful of moves. The game
         ending is a legitimate outcome, not a failure of the thing under
         test. */
      if ((await view.getAttribute('data-phase')) !== 'playing') break;

      const before = (await list.textContent()) ?? '';
      let played = false;
      for (const move of candidates) {
        await typeMove(page, move);
        try {
          // An accepted move reaches the list; a refused one leaves it alone.
          await expect(list).not.toHaveText(before, { timeout: 3_000 });
          played = true;
          break;
        } catch {
          /* not legal in this position — try the next candidate */
        }
      }
      expect(played, `none of ${candidates.join('/')} was legal here`).toBe(true);

      // The engine has to answer and hand the move back — every single time.
      await expect(view).toHaveAttribute('data-turn', 'white', { timeout: ENGINE_TIMEOUT });
    }

    // Still a game: the engine never returned something that broke it.
    await expect(view).toHaveAttribute('data-phase', /playing|over/);
  });

  /**
   * The POINTER path, which the rest of this file does not exercise — every
   * other test here types. Without it, a break in the board's move handling on
   * `/jouer/` would surface only when a human tried it.
   */
  test('a move can be played on the board, not only typed', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });

    await movePiece(page, 'e2', 'e4');
    await expect(page.getByTestId('play-move-list')).toContainText('e4');
    await expect(page.getByTestId('play')).toHaveAttribute('data-turn', 'white', {
      timeout: ENGINE_TIMEOUT,
    });
  });

  /**
   * Playing black flips the board, so the square geometry flips with it. Worth
   * its own test: every other pointer test here plays White, and an
   * orientation bug would be invisible to all of them.
   */
  test('playing on the board works from the black side too', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { colour: 'black', level: 'Débutant' });
    await expect(page.getByTestId('play')).toHaveAttribute('data-turn', 'black', {
      timeout: ENGINE_TIMEOUT,
    });

    await movePiece(page, 'e7', 'e5', 'black');
    await expect(page.getByTestId('play-move-list')).toContainText('e5');
  });

  /**
   * DRAGGING specifically, as opposed to tapping — a different Chessground code
   * path, and a real one for anyone on a mouse.
   *
   * Pinned to desktop Chromium. A synthetic drag is instantaneous, and
   * Chessground only registers one once a `requestAnimationFrame` has run; the
   * mobile-emulation projects starve rAF under the full matrix and lose the
   * move entirely. That is an artefact of the harness, not of the site — a
   * human's drag spans many frames — so the drag is covered where it is
   * meaningful rather than deleted or papered over with retries. Every other
   * pointer test above runs matrix-wide through the same `userMove` handler.
   */
  test('a move can be dragged with the mouse', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'synthetic drags are rAF-fragile under mobile emulation; tap covers the same handler',
    );

    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });

    await dragPiece(page, 'd2', 'd4');
    await expect(page.getByTestId('play-move-list')).toContainText('d4');
  });

  test('resigning ends the game and says so', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });

    await page.getByTestId('play-resign').click();
    await expect(page.getByTestId('play')).toHaveAttribute('data-phase', 'over');
    await expect(page.getByTestId('play-result')).toContainText('abandonné');
    // Resigning removes the move field: there is nothing left to play.
    await expect(page.getByTestId('move-input')).toHaveCount(0);
  });

  test('a new game returns to the setup form', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });
    await page.getByTestId('play-resign').click();
    await page.getByTestId('play-new').click();

    await expect(page.getByTestId('play')).toHaveAttribute('data-phase', 'setup');
    await expect(page.getByTestId('play-start')).toBeVisible();
  });

  test('the level and colour choices are real form controls', async ({ page }) => {
    await openPlay(page, FR);
    // Not a custom widget: radios in labelled fieldsets, reachable by keyboard
    // and announced as a group.
    await expect(page.getByRole('group', { name: 'Vos pièces' })).toBeVisible();
    await expect(page.getByRole('group', { name: /Niveau/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Débutant' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Avancé' })).toBeVisible();
  });
});

test.describe('play — English', () => {
  test('runs in English', async ({ page }) => {
    await openPlay(page, EN);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('radio', { name: 'Beginner' })).toBeVisible();

    await startGame(page, { level: 'Beginner' });
    await typeMove(page, 'e4');
    await expect(page.getByTestId('play-move-list')).toContainText('e4');
  });
});

test.describe('play — accessibility', () => {
  for (const [name, path] of [
    ['play FR', FR],
    ['play EN', EN],
  ] as const) {
    test(`${name} setup has no axe violations`, async ({ page }) => {
      await openPlay(page, path);
      await expectNoAxeViolations(page);
    });
  }

  test('a live game has no axe violations', async ({ page }) => {
    await openPlay(page, FR);
    await startGame(page, { level: 'Débutant' });
    await expectNoAxeViolations(page);
  });
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}
