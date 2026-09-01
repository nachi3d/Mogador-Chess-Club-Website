import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * THE EXERCISE FITS A PHONE — the M3 compaction, pinned.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THE MEASURED PROBLEM. At 360×640 the exercise component was 796px
 * against 587px of usable viewport, and the BOARD was only 330px of it. The
 * other 466px was the control stack: two stacked meters, a reserved verdict
 * panel, a four-part move-entry form and a standalone hint button, each a
 * full-width block with 20px between them.
 *
 * ⚠️ THE FIX COMPACTS THE CONTROLS AND LEAVES THE BOARD ALONE. That is the
 * decision, and the first test here is what stops a future session winning
 * back pixels the cheap way. The board is the thing being taught with.
 *
 * Measured, before → after:
 *
 *                      390×844                 360×640
 *   exercise      799px → 618px (fits)    796px → 615px
 *   side column   403px → 244px           403px → 244px
 *   scroll to next  815px → 618px          1079px → 882px
 *
 * ⚠️ 360×640 STILL DOES NOT FIT IN ONE SCREEN — 615px against 587px usable.
 * The remaining 28px is one short nudge rather than the 209px scroll it was,
 * and the bound below says 660 rather than pretending otherwise. Closing it
 * completely would have cost either the board's size or the verdict panel's
 * reserved height, and both are worse than a nudge.
 *
 * ⚠️ EVERY VIEWPORT HERE IS SET EXPLICITLY, including the desktop guard. This
 * file runs on all five projects; a test that inherited the project's size
 * would assert the phone layout on Desktop Chrome and the desktop layout on
 * a Pixel 5.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The two phone projects' own sizes, plus the small Android M3 measured. */
const PHONE_SIZES = [
  { name: '390x844 (iPhone 13)', width: 390, height: 844, exerciseMax: 700 },
  { name: '393x851 (Pixel 5)', width: 393, height: 851, exerciseMax: 700 },
  { name: '360x640 (small Android)', width: 360, height: 640, exerciseMax: 660 },
] as const;

const DESKTOP = { width: 1280, height: 900 };

/**
 * ⚠️ SCROLL THE BOARD INTO VIEW AND WAIT FOR `data-ready`.
 *
 * The island is `client:visible` and then lazy-imports chess.js; before that
 * lands it renders an extra "loading" line and the block measures 25px taller
 * than the one a reader sees. Measuring early reports a number nobody has —
 * which is exactly what the harness that produced these figures did on its
 * first run.
 */
async function openExercise(page: Page, path: string) {
  await page.goto(path);
  const exercise = page.locator('[data-testid="exercise"]').first();
  await exercise.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(exercise).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

function box(page: Page, selector: string) {
  return page.locator(selector).first().boundingBox();
}

/* ═══ The board is untouched ════════════════════════════════════════════ */

test.describe('the board keeps its size', () => {
  for (const size of PHONE_SIZES) {
    test(`the playing surface still fills the column at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openExercise(page, '/exercices/mat-du-couloir/');

      const board = (await box(page, '.mcc-board'))!;
      /* ⚠️ THE COMPACTION MUST NEVER HAVE COME OUT OF THE BOARD. At 360px the
         frame measures 330px and at 390px it measures 335px — within a few
         pixels of the column, as it was before M3. A future session that
         shrinks the board to make the page fit fails here. */
      expect(
        board.height,
        `the board is only ${board.height}px — the controls were compacted, not the board`,
      ).toBeGreaterThan(size.width * 0.8);
    });
  }
});

/* ═══ Nothing scrolls sideways ══════════════════════════════════════════ */

/**
 * ⚠️⚠️ THIS FILE MEASURED HEIGHT AND NOTHING ELSE, WHICH IS WHY A SIDEWAYS
 * SCROLL SHIPPED AND SURVIVED SEVERAL RELEASES.
 *
 * Every assertion above is about how TALL the exercise is. At 360px a tutorial
 * step scrolled sideways by 26px and a lesson by 5px, on a file whose entire
 * subject is "does this fit a phone", running at exactly that width.
 *
 * ⚠️ THE CAUSE WAS THREE IMPLICIT `auto` GRID TRACKS — `.mcc-exercise`,
 * `.mcc-exercise-side` and `.mcc-move-input`. An `auto` track is sized by its
 * item's MIN-CONTENT, so the move-entry row (a field plus a "Jouer" button,
 * min-content 330px) widened the column past the screen and the board, being
 * `width: 100%`, stretched to match. `min-width: 0` on the ITEM does not
 * constrain the TRACK — that needs `minmax(0, …)`, which all three now declare.
 *
 * ⚠️ THE PAGES MATTER AS MUCH AS THE WIDTHS. `/exercices/` alone never
 * overflowed: it has the widest column on the site. The tutorial step has the
 * narrowest — a card's padding inside the page gutter — so it is the one that
 * breaks first, and it was not being measured.
 */
const OVERFLOW_PAGES = [
  { name: 'a tutorial step', path: '/apprendre-les-bases/la-tour/' },
  { name: 'a lesson', path: '/cours/bien-ouvrir-une-partie/occuper-le-centre/' },
  { name: 'an exercise', path: '/exercices/mat-du-couloir/' },
] as const;

test.describe('no horizontal overflow on a phone', () => {
  for (const size of PHONE_SIZES) {
    for (const target of OVERFLOW_PAGES) {
      test(`${target.name} does not scroll sideways at ${size.name}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(target.path);
        /* The board is `client:visible` and resizes itself once it hydrates, so
           a measurement taken before that is of a layout nobody sees — the same
           trap `openExercise` exists for. Wait for it where there is one. */
        const exercise = page.locator('[data-testid="exercise"]').first();
        if ((await exercise.count()) > 0) {
          await exercise.evaluate((el) => el.scrollIntoView({ block: 'center' }));
          await expect(exercise).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
        }
        await page.waitForLoadState('networkidle');

        const { over, widest } = await page.evaluate(() => {
          const de = document.documentElement;
          const overflow = de.scrollWidth - de.clientWidth;
          /* Name the culprit in the failure, or the next person starts from
             "something is wide" and bisects the DOM by hand. */
          let widest = '';
          let worst = de.clientWidth;
          document.querySelectorAll('*').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.right > worst) {
              worst = r.right;
              widest = `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')} (right=${Math.round(r.right)})`;
            }
          });
          return { over: overflow, widest };
        });

        expect(over, `${target.path} overflows by ${over}px — widest: ${widest || 'none'}`).toBe(0);
      });
    }
  }
});

/* ═══ The controls are one dense row ════════════════════════════════════ */

test.describe('the controls compact below 768px', () => {
  for (const size of PHONE_SIZES) {
    test(`the control stack stays small at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openExercise(page, '/exercices/mat-du-couloir/');

      const side = (await box(page, '.mcc-exercise-side'))!;
      /* 403px before M3, 244px after. 300 leaves room for a longer
         translation without leaving room for the old stacked layout. */
      expect(
        side.height,
        `the control stack is ${side.height}px — it was 244px when M3 measured it`,
      ).toBeLessThan(300);
    });

    test(`the whole exercise clears its bound at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openExercise(page, '/exercices/mat-du-couloir/');

      const exercise = (await box(page, '[data-testid="exercise"]'))!;
      expect(
        exercise.height,
        `the exercise is ${exercise.height}px — it was 796-801px before M3`,
      ).toBeLessThanOrEqual(size.exerciseMax);
    });
  }

  test('the meters and the hint button share one row at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openExercise(page, '/exercices/mat-du-couloir/');

    const meters = (await box(page, '.mcc-exercise-meters'))!;
    const hint = (await box(page, '[data-testid="exercise-hint-button"]'))!;

    /* One row: their vertical centres agree. This is what "a single dense row
       under the board" means, and it is the difference between the compaction
       and merely tightening the gaps. */
    const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(
      Math.abs(centre(meters) - centre(hint)),
      'the hint button is not on the meters row',
    ).toBeLessThan(8);
  });

  test('the dense row keeps 44px targets at 360x640', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openExercise(page, '/exercices/mat-du-couloir/');

    /* ⚠️ DENSE IS ABOUT LAYOUT, NEVER ABOUT TOUCH TARGETS. The row is tighter;
       the things you press are not. */
    for (const selector of [
      '[data-testid="exercise-hint-button"]',
      '.mcc-move-input-field',
      '.mcc-move-input-submit',
    ]) {
      const b = (await box(page, selector))!;
      expect(b.height, `${selector} is ${b.height}px tall`).toBeGreaterThanOrEqual(43.5);
    }
  });
});

/* ═══ The move-entry help ═══════════════════════════════════════════════ */

test.describe('the move-entry help line', () => {
  /**
   * ⚠️ IT IS CLIPPED, NEVER `display: none`.
   *
   * The field points at it with `aria-describedby`. A clipped element is in
   * the accessibility tree with certainty; a `display: none` target is
   * honoured by most screen readers and guaranteed by none. This control
   * exists so that a reader who cannot use the board can still move a piece —
   * telling them the notation is the whole point of it.
   */
  test('is in the accessibility tree even while hidden at 360x640', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openExercise(page, '/exercices/mat-du-couloir/');

    const help = page.locator('.mcc-move-input-help');
    const described = await page
      .locator('.mcc-move-input-field')
      .getAttribute('aria-describedby');
    expect(described, 'the field no longer points at the help text').toContain(
      (await help.getAttribute('id'))!,
    );

    const display = await help.evaluate((el) => getComputedStyle(el).display);
    expect(display, 'the help text is display:none — it must be clipped instead').not.toBe('none');
  });

  test('appears when the field is focused, and it is what pays for the compaction', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openExercise(page, '/exercices/mat-du-couloir/');

    const help = page.locator('.mcc-move-input-help');
    const before = (await help.boundingBox())!;
    expect(before.height, 'the help line is not clipped before focus').toBeLessThan(4);

    await page.locator('.mcc-move-input-field').focus();
    const after = (await help.boundingBox())!;
    expect(after.height, 'focusing the field did not reveal the notation help').toBeGreaterThan(12);
  });

  test('is plainly visible on a desktop, at 1280x900', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openExercise(page, '/exercices/mat-du-couloir/');
    const help = (await box(page, '.mcc-move-input-help'))!;
    expect(help.height, 'the desktop help line was collapsed too').toBeGreaterThan(12);
  });
});

/* ═══ The desktop regression guard ══════════════════════════════════════ */

test.describe('desktop is untouched, at 1280x900', () => {
  test('the controls are still a stack, not a row', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openExercise(page, '/exercices/mat-du-couloir/');

    const meters = (await box(page, '.mcc-exercise-meters'))!;
    const hint = (await box(page, '[data-testid="exercise-hint-button"]'))!;

    /* ⚠️ THE DIVERGENCE IS THE FEATURE, and this is the side of it that is
       easiest to lose by "tidying the two layouts into one". Above 768px the
       hint button sits well below the meters, exactly as it did before M3. */
    expect(
      hint.y,
      'the hint button moved onto the meters row on a desktop',
    ).toBeGreaterThan(meters.y + meters.height);
  });

  test('the verdict panel keeps its full reserved height', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openExercise(page, '/exercices/mat-du-couloir/');
    const min = await page
      .locator('.mcc-exercise-status')
      .evaluate((el) => getComputedStyle(el).minHeight);
    expect(min, 'the desktop reserve was reduced along with the mobile one').toBe('104px');
  });
});

/* ═══ Task 2 — the way out, at the end of the page ══════════════════════ */

test.describe('end-of-content navigation', () => {
  const ROUTES = [
    { path: '/apprendre-les-bases/la-tour/', nav: '[data-testid="tutorial-next"]' },
    { path: '/cours/les-mats-elementaires/le-mat-du-couloir/', nav: '[data-testid="lesson-next"]' },
    { path: '/pieges/legal/', nav: '[data-testid="trap-back-bottom"]' },
    { path: '/exercices/mat-du-couloir/', nav: '[data-testid="exercise-back-bottom"]' },
  ] as const;

  for (const size of PHONE_SIZES) {
    for (const route of ROUTES) {
      test(`${route.path} ends with a way onward, clear of the bar — ${size.name}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(route.path);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(300);

        const nav = page.locator(route.nav);
        await expect(nav).toBeVisible();

        /* ⚠️ THE BAR IS `position: fixed`, SO IT TAKES NO SPACE. A link that
           renders "at the bottom of the page" renders underneath it unless
           the page reserves the room. Trap and exercise pages had no
           end-of-content link at all before M3 — the only way back to the
           index was to scroll the whole page up. */
        const bar = (await box(page, '[data-mobile-nav]'))!;
        const b = (await nav.boundingBox())!;
        expect(
          b.y + b.height,
          `${route.nav} is underneath the bottom bar`,
        ).toBeLessThanOrEqual(bar.y + 1);

        // And it is a real destination, not a footnote.
        expect(b.height, `${route.nav} is only ${b.height}px tall`).toBeGreaterThanOrEqual(43.5);
      });
    }
  }
});

/* ═══ Accessibility, on the pages this touched ══════════════════════════ */

test.describe('accessibility', () => {
  for (const [locale, path] of [
    ['fr', '/exercices/mat-du-couloir/'],
    ['en', '/en/exercices/mat-du-couloir/'],
    ['fr', '/pieges/legal/'],
    ['en', '/en/pieges/legal/'],
  ] as const) {
    test(`${path} (${locale}) has no axe violations at 390x844`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      /* Board pages carry no scroll reveals, so there is nothing to settle —
         but the exercise island must have hydrated, or the panel axe reads is
         not the one the reader gets. */
      if (path.includes('/exercices/')) {
        const exercise = page.locator('[data-testid="exercise"]').first();
        await exercise.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await expect(exercise).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
      }

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
