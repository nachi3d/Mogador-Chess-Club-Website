import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleReveals } from './helpers/reveal';

/**
 * The trap replayer.
 *
 * Note on hydration: `<cg-board>` is created by Chessground in a `useEffect`,
 * so it exists ONLY after the island has hydrated. Waiting on it is therefore a
 * genuine hydration signal — waiting on `[data-testid="replayer"]` would not be,
 * because Astro server-renders the Preact markup too.
 */

const TRAP_FR = '/pieges/legal/';
const TRAP_EN = '/en/pieges/legal/';

/** Légal's mate, as stored in src/content/traps/legal.json. */
const MOVES = [
  'e4',
  'e5',
  'Nf3',
  'd6',
  'Bc4',
  'Bg4',
  'Nc3',
  'g6',
  'Nxe5',
  'Bxd1',
  'Bxf7+',
  'Ke7',
  'Nd5#',
];

async function openReplayer(page: Page, path: string) {
  await page.goto(path);
  // The island is `client:visible`, so on a phone viewport — where the board
  // starts well below the fold — it will NOT hydrate until it is scrolled to.
  // That is the intended behaviour, not a bug, so the spec has to do what a
  // reader does. (This is exactly what the iPhone 13 project caught.)
  await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
  // Hydration + Chessground mount.
  await page.locator('[data-testid="chessboard"] cg-board').waitFor({ timeout: 15_000 });
  /**
   * ⚠️ AND THEN THE ISLAND'S OWN SIGNAL, WHICH `<cg-board>` DOES NOT IMPLY.
   *
   * `BoardSurface` is a CHILD, so its mount effect — the one that creates
   * `<cg-board>` — runs BEFORE this component's. `data-ready` is set from a
   * state update in the parent's mount effect, so it lands a render LATER
   * than the board does. Waiting on the board alone leaves a window in which
   * every control is still carrying the `disabled` it shipped with.
   *
   * Playwright's actionability checks happen to cover a `click()` here, but
   * an immediate `toBeDisabled()`/`toBeEnabled()` read is not covered by
   * anything, and neither is a spec that reads the DOM directly. Wait on the
   * declared signal rather than on a proxy for it.
   */
  await expect(page.getByTestId('replayer').first()).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

/** The SAN of the currently highlighted move, or null at the starting position. */
async function currentMove(page: Page): Promise<string | null> {
  const active = page.locator('[data-testid="move-list"] [data-current="true"]');
  return (await active.count()) === 0 ? null : ((await active.first().textContent()) ?? null);
}

test.describe('replayer — rendering', () => {
  test('the board hydrates and shows the starting position', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    // 32 pieces on the board before any move is played.
    await expect(page.locator('[data-testid="chessboard"] cg-board piece')).toHaveCount(32);
    // Nothing highlighted at the start.
    expect(await currentMove(page)).toBeNull();
  });

  test('the move list is a list and holds every ply', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    const list = page.locator('[data-testid="move-list"]');
    await expect(list).toHaveJSProperty('tagName', 'OL');
    await expect(list.locator('button')).toHaveCount(MOVES.length);
    await expect(list.locator('button').first()).toHaveText(MOVES[0]!);
    await expect(list.locator('button').last()).toHaveText(MOVES.at(-1)!);
  });

  /**
   * The architecture rule from CLAUDE.md: an index page never mounts a board.
   * This is the test that keeps a future "preview board on each card" from
   * quietly landing.
   */
  test('the traps INDEX mounts no board', async ({ page }) => {
    await page.goto('/pieges/');
    await expect(page.locator('astro-island')).toHaveCount(0);
    await expect(page.locator('cg-board')).toHaveCount(0);
  });

  /**
   * `client:visible`, proved rather than assumed.
   *
   * The whole point of the lazy directive is that a reader who never scrolls to
   * the board never downloads or runs Chessground. A viewport small enough to
   * put the board below the fold makes that observable: nothing before the
   * scroll, a live board after it. If someone switches the island to
   * `client:load`, this test fails.
   */
  test('the board does NOT hydrate until scrolled into view', async ({ page }) => {
    /* ⚠️ 420px TALL, NOT 620. M1 cut the mobile header from three rows to one,
       which pulled the board UP into a 620px viewport — so the test started
       failing because the board was legitimately visible on load, not because
       lazy hydration had broken.

       The premise is now ASSERTED rather than assumed. A test whose setup has
       silently stopped creating the condition it tests is worse than a failing
       one: it goes green while checking nothing. */
    await page.setViewportSize({ width: 380, height: 420 });
    await page.goto(TRAP_FR);

    // The markup is server-rendered, so the host div is present...
    const host = page.locator('[data-testid="chessboard"]');
    await expect(host).toHaveCount(1);

    const box = (await host.boundingBox())!;
    expect(
      box.y,
      'the board is not below the fold — this test can no longer observe lazy hydration',
    ).toBeGreaterThanOrEqual(420);

    // ...but Chessground has not run.
    await expect(page.locator('cg-board')).toHaveCount(0);

    await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
    await expect(page.locator('cg-board')).toHaveCount(1, { timeout: 15_000 });
  });
});

test.describe('replayer — navigation', () => {
  test('next and prev move the cursor and the highlight', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    await page.getByTestId('replay-next').click();
    expect(await currentMove(page)).toBe('e4');

    await page.getByTestId('replay-next').click();
    expect(await currentMove(page)).toBe('e5');

    await page.getByTestId('replay-prev').click();
    expect(await currentMove(page)).toBe('e4');

    await page.getByTestId('replay-prev').click();
    expect(await currentMove(page)).toBeNull();
  });

  test('clicking a move jumps straight to it', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    await page.locator('[data-testid="move-list"] button', { hasText: 'Bxd1' }).click();
    expect(await currentMove(page)).toBe('Bxd1');

    // And back up the list again — jumping must work in both directions.
    await page.locator('[data-testid="move-list"] button', { hasText: 'Bc4' }).click();
    expect(await currentMove(page)).toBe('Bc4');
  });

  test('the arrow keys step through the game', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    await page.keyboard.press('ArrowRight');
    expect(await currentMove(page)).toBe('e4');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await currentMove(page)).toBe('Nf3');

    await page.keyboard.press('ArrowLeft');
    expect(await currentMove(page)).toBe('e5');

    // End / Home jump to the extremes.
    await page.keyboard.press('End');
    expect(await currentMove(page)).toBe('Nd5#');

    await page.keyboard.press('Home');
    expect(await currentMove(page)).toBeNull();
  });

  /**
   * Regression: the keydown handler used to close over the current cursor, so
   * two presses arriving in the same frame both computed the same target and
   * the second was swallowed — holding the arrow key dropped moves. Pressing
   * without awaiting between presses is what reproduces it.
   */
  test('rapid arrow presses do not drop moves', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    await Promise.all(
      Array.from({ length: MOVES.length }, () => page.keyboard.press('ArrowRight')),
    );
    expect(await currentMove(page)).toBe(MOVES.at(-1)!);

    await Promise.all(
      Array.from({ length: MOVES.length }, () => page.keyboard.press('ArrowLeft')),
    );
    expect(await currentMove(page)).toBeNull();
  });

  test('start and end buttons disable at the boundaries', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    await expect(page.getByTestId('replay-start')).toBeDisabled();
    await expect(page.getByTestId('replay-prev')).toBeDisabled();
    await expect(page.getByTestId('replay-next')).toBeEnabled();

    await page.getByTestId('replay-end').click();

    await expect(page.getByTestId('replay-next')).toBeDisabled();
    await expect(page.getByTestId('replay-end')).toBeDisabled();
    await expect(page.getByTestId('replay-start')).toBeEnabled();
  });
});

test.describe('replayer — content', () => {
  /**
   * The whole point of this trap: the final position IS checkmate. If the PGN
   * or the parser ever drifts, this fails rather than teaching a wrong pattern.
   */
  test("Légal's mate ends in checkmate", async ({ page }) => {
    await openReplayer(page, TRAP_FR);
    await page.getByTestId('replay-end').click();

    expect(await currentMove(page)).toBe('Nd5#');
    await expect(page.getByTestId('checkmate-flag')).toBeVisible();
    await expect(page.getByTestId('checkmate-flag')).toHaveText('Échec et mat');
    // Chessground marks the mated king's square.
    await expect(page.locator('[data-testid="chessboard"] cg-board square.check')).toHaveCount(1);
  });

  test('commentary follows the cursor', async ({ page }) => {
    await openReplayer(page, TRAP_FR);

    // Ply 8 (Nxe5) carries the "fake sacrifice" note — 9 steps from the start.
    for (let i = 0; i < 9; i++) await page.getByTestId('replay-next').click();
    expect(await currentMove(page)).toBe('Nxe5');
    await expect(page.getByTestId('commentary-text')).toContainText('offre la dame');

    // Ply 9 (Bxd1) explains why taking loses, and names the correct move.
    await page.getByTestId('replay-next').click();
    await expect(page.getByTestId('commentary-text')).toContainText('dxe5');
  });

  test('the English page shows English commentary and moves', async ({ page }) => {
    await openReplayer(page, TRAP_EN);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // SAN is language-neutral by the PGN rule — identical in both locales.
    await expect(page.locator('[data-testid="move-list"] button').first()).toHaveText('e4');

    await page.getByTestId('replay-end').click();
    await expect(page.getByTestId('checkmate-flag')).toHaveText('Checkmate');
    await expect(page.getByTestId('commentary-text')).toContainText('Three minor pieces');
  });

  test('the WhatsApp share link is outbound and prefilled', async ({ page }) => {
    await page.goto(TRAP_FR);

    const href = await page.getByRole('link', { name: 'Partager sur WhatsApp' }).getAttribute('href');
    expect(href).toBeTruthy();
    const url = new URL(href!);
    // No recipient: this opens the READER's WhatsApp for them to choose. The
    // club never posts anything — see CLAUDE.md, "No in-app communication".
    expect(url.host).toBe('wa.me');
    expect(url.pathname).toBe('/');

    const text = url.searchParams.get('text') ?? '';
    expect(text).toContain('Le mat de Légal');
    expect(text).toContain('/pieges/legal/');
  });
});

async function expectNoAxeViolations(page: Page) {
  /* Reveal pages hide below-fold content at opacity 0 until scrolled to; axe
     would otherwise measure the contrast of text no reader is looking at.
     See tests/e2e/helpers/reveal.ts. */
  await settleReveals(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('replayer — accessibility', () => {
  for (const [name, path] of [
    ['traps index FR', '/pieges/'],
    ['traps index EN', '/en/pieges/'],
  ] as const) {
    test(`${name} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }

  for (const [name, path] of [
    ['trap page FR', TRAP_FR],
    ['trap page EN', TRAP_EN],
  ] as const) {
    test(`${name} has no axe violations, board hydrated`, async ({ page }) => {
      await openReplayer(page, path);
      await expectNoAxeViolations(page);
    });

    test(`${name} has no axe violations mid-game`, async ({ page }) => {
      // The mate position adds a check highlight, arrows, circles and the
      // checkmate flag — more DOM than the starting position, so it is worth
      // its own pass rather than assuming ply 0 covers everything.
      await openReplayer(page, path);
      await page.getByTestId('replay-end').click();
      await expectNoAxeViolations(page);
    });
  }
});

/**
 * ⚠️ NO CONTROL IN THIS ISLAND MAY LOOK USABLE BEFORE IT IS.
 *
 * Astro server-renders the whole replayer, so until its JS lands the launch
 * button, the transport controls and every move-list button are markup with
 * their handlers attached to nothing. Measured on the built page before this
 * was fixed — `dist/pieges/legal/index.html` carried SIXTEEN enabled buttons
 * that did nothing: `replay-launch`, `replay-next`, `replay-end` and all
 * thirteen moves.
 *
 * ⚠️ THIS IS A READER'S DEFECT, NOT A TEST'S, and the distinction matters
 * because the tests were never failing on it: they wait on `<cg-board>`, which
 * is created in a child effect and so is a genuine hydration signal. A student
 * has no such wait. `client:visible` puts the window exactly where they arrive
 * — the board scrolls into view, the big named button invites the press it was
 * designed to invite, and nothing happens.
 *
 * Same shape and same fix as the `/jouer/` start button (see play.spec.ts).
 * The delay is what makes this a test rather than a hope: at natural speed the
 * window is too narrow to observe.
 */
test.describe('the replayer controls are honest about being ready', () => {
  const HYDRATION_DELAY_MS = 3000;

  const throttleIslandJs = (page: Page) =>
    page.route('**/_astro/*.js', async (route) => {
      await new Promise((r) => setTimeout(r, HYDRATION_DELAY_MS));
      await route.continue();
    });

  test('before hydration every control is disabled rather than inert', async ({ page }) => {
    await throttleIslandJs(page);
    await page.goto(TRAP_FR, { waitUntil: 'domcontentloaded' });
    /* Scrolled to, so hydration is genuinely REQUESTED and the only thing
       holding it back is the chunk. Without this the test would prove that an
       island which was never asked to hydrate has not hydrated. */
    await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();

    const replayer = page.getByTestId('replayer').first();
    // The diagram is readable — this is not a blank page — but not working.
    await expect(replayer).toHaveAttribute('data-ready', 'false');

    await expect(page.getByTestId('replay-launch')).toBeDisabled();
    await expect(page.getByTestId('replay-next')).toBeDisabled();
    await expect(page.getByTestId('replay-end')).toBeDisabled();

    /* ⚠️ THE MOVE LIST IS THE HALF MOST EASILY MISSED — thirteen buttons,
       each one a jump to that ply, and the second thing a reader reaches for
       after the launch button. */
    const moves = page.locator('[data-testid="move-list"] button.mcc-move');
    await expect(moves).toHaveCount(MOVES.length);
    for (let i = 0; i < MOVES.length; i++) await expect(moves.nth(i)).toBeDisabled();
  });

  test('once hydrated the controls work, and the launch button launches', async ({ page }) => {
    await throttleIslandJs(page);
    await page.goto(TRAP_FR, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();

    await expect(page.getByTestId('replayer').first()).toHaveAttribute('data-ready', 'true', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('replay-launch')).toBeEnabled();

    await page.getByTestId('replay-launch').click();
    expect(await currentMove(page)).toBe(MOVES[0]);
  });
});
