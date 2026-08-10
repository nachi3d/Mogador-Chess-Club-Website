import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * THE MOBILE APP SHELL — bottom bar, reduced header, dashboard (M1 + M2).
 *
 * Direction: `docs/direction/mcc-direction-mobile-app.md`, which SUPERSEDES
 * the E5 retro menu **on mobile only**.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THE BREAKPOINT IS 768px, AND HALF THIS FILE EXISTS TO PIN THE DIVERGENCE.
 *
 * Below it: bottom bar, one-line header, dashboard.
 * At and above: grouped header, retro menu, no bar.
 *
 * The desktop half is a REGRESSION GUARD. A future session tidying the two
 * layouts into one would be undoing a deliberate decision, and the guard is
 * how it finds that out — see the `desktop is untouched` block at the end.
 *
 * Viewports rather than projects for the desktop checks, so the whole file
 * runs meaningfully on every project: the phone projects confirm the app
 * shell, and the desktop assertions re-check the breakpoint from the other
 * side wherever they run.
 * ─────────────────────────────────────────────────────────────────────────
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

/** A store with two tutorial steps solved and a third merely attempted. */
const SEEDED = JSON.stringify({
  exercises: {
    'tutorial:lechiquier-et-les-coordonnees': {
      solved: true,
      attempts: 0,
      hintUsed: false,
      solvedAt: '2026-08-01T10:00:00.000Z',
    },
    'tutorial:la-tour': {
      solved: true,
      attempts: 1,
      hintUsed: false,
      solvedAt: '2026-08-02T10:00:00.000Z',
    },
    'tutorial:le-cavalier': { solved: false, attempts: 2, hintUsed: true, solvedAt: null },
  },
});

async function seedProgress(page: Page, raw: string) {
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem('mcc:progress:v1', value);
    } catch {
      /* the broken-storage test installs a throwing localStorage */
    }
  }, raw);
}

/* ═══ Task 1 — the bottom bar ═══════════════════════════════════════════ */

test.describe('the bottom navigation bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test('renders four entries, and exactly four', async ({ page }) => {
    await page.goto('/');
    const bar = page.locator('[data-mobile-nav]');
    await expect(bar).toBeVisible();

    const links = bar.locator('.mobile-nav-link');
    /* ⚠️ FOUR. Five targets across 390px is 78px each, which is where labels
       truncate — and settings is deliberately NOT one of them: it is a
       preference, not a destination, so it lives in the header. If this ever
       reads five, that decision has been quietly reversed. */
    await expect(links).toHaveCount(4);
    await expect(links).toHaveText([/Accueil/, /Apprendre/, /Jouer/, /Progrès/]);
  });

  test('every target clears 48px', async ({ page }) => {
    await page.goto('/');
    const links = page.locator('[data-mobile-nav] .mobile-nav-link');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const box = (await links.nth(i).boundingBox())!;
      expect(box.height, `bar entry ${i} is ${box.height}px tall`).toBeGreaterThanOrEqual(48);
    }
  });

  for (const [path, expected] of [
    ['/', 'Accueil'],
    ['/cours/', 'Apprendre'],
    ['/pieges/', 'Apprendre'],
    ['/jouer/', 'Jouer'],
    ['/progres/', 'Progrès'],
    ['/exercices/', 'Progrès'],
  ] as const) {
    test(`${path} marks "${expected}" as the current section`, async ({ page }) => {
      await page.goto(path);
      const active = page.locator('[data-mobile-nav] .mobile-nav-link.is-active');
      await expect(active).toHaveCount(1);
      await expect(active).toContainText(expected);
      /* Not colour alone — a screen reader gets it too. */
      await expect(active).toHaveAttribute('aria-current', 'page');
    });
  }

  /**
   * ⚠️ THE BAR IS `position: fixed`, SO IT TAKES NO SPACE. Every page has to
   * reserve it, or the last line of every page hides underneath. Scroll to the
   * very bottom and check the footer's final content clears the bar.
   */
  test('nothing is hidden behind it at the bottom of a page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    const barTop = (await page.locator('[data-mobile-nav]').boundingBox())!.y;
    const lastLink = page.locator('footer a').last();
    const box = (await lastLink.boundingBox())!;
    expect(
      box.y + box.height,
      'the last footer link is underneath the bottom bar',
    ).toBeLessThanOrEqual(barTop);
  });

  /**
   * The iOS gesture-bar inset. `env()` is 0 in a headless browser, so this
   * cannot assert the real inset — what it CAN assert is that the rule exists
   * and resolves, which is what stops someone deleting it as noise.
   */
  test('it reserves the safe-area inset', async ({ page }) => {
    await page.goto('/');
    const padding = await page
      .locator('[data-mobile-nav]')
      .evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(padding, 'the safe-area padding rule is missing').toMatch(/px$/);
  });

  test('it never hides on scroll', async ({ page }) => {
    await page.goto('/');
    const before = (await page.locator('[data-mobile-nav]').boundingBox())!;
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    const after = (await page.locator('[data-mobile-nav]').boundingBox())!;
    expect(after.y, 'the bar moved on scroll — stability beats the pixels').toBe(before.y);
  });

  test('it is on every page, not just the home page', async ({ page }) => {
    for (const path of ['/cours/', '/exercices/', '/agenda/', '/mentions-legales/']) {
      await page.goto(path);
      await expect(page.locator('[data-mobile-nav]')).toBeVisible();
    }
  });
});

/* ═══ Task 2 — the reduced header ═══════════════════════════════════════ */

test.describe('the mobile header is one line', () => {
  test('the grouped nav is gone and the two tools remain', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');

    await expect(page.locator('.site-nav')).toBeHidden();
    await expect(page.locator('.brand-name')).toBeVisible();
    await expect(page.getByRole('button', { name: /apparence|appearance/i })).toBeVisible();
    await expect(page.locator('.header-tools a[hreflang], .lang-switcher')).toBeVisible();
    /* Settings is desktop-only in the header: on a phone it would be a fourth
       icon on the one line M1 exists to clear. */
    await expect(page.getByTestId('header-settings')).toBeHidden();
  });

  test('the header is a small fraction of the screen', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    const box = (await page.locator('.site-header').boundingBox())!;
    /* It used to eat about a third. One line is well under a fifth. */
    expect(box.height, `the header is ${box.height}px tall`).toBeLessThan(PHONE.height * 0.2);
  });
});

/* ═══ Task 4 — the dashboard ════════════════════════════════════════════ */

test.describe('the dashboard replaces the menu on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test('the retro menu is not shown, and the dashboard is', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-main-menu]')).toBeHidden();
    await expect(page.locator('[data-dashboard]')).toBeVisible();
  });

  /** Branch A — nothing stored. The server-rendered default. */
  test('with no progress: Play is the dominant card, basics beside it', async ({ page }) => {
    await page.goto('/');

    const primary = page.getByTestId('dash-primary');
    await expect(primary).toBeVisible();
    await expect(primary).toContainText(/Jouer une partie/);
    await expect(primary).toHaveAttribute('href', /\/jouer\/$/);
    /* No bar: there is nothing to be part-way through. */
    await expect(page.locator('[data-dash-progress]')).toBeHidden();

    await expect(page.getByTestId('dash-secondary')).toContainText(/Apprendre les bases/);
    await expect(page.getByTestId('dash-secondary')).toHaveAttribute(
      'href',
      /apprendre-les-bases/,
    );
  });

  /** Branch B — progress exists. Rewritten in place by the E5 resolver. */
  test('with progress: Resume is dominant, with a bar, and Play moves beside it', async ({
    page,
  }) => {
    await seedProgress(page, SEEDED);
    await page.goto('/');

    const primary = page.getByTestId('dash-primary');
    await expect(primary).toContainText(/Reprendre/i);
    /* It names the STEP, not a generic word — that is what makes it a resume
       rather than a link. The seed stops mid-tutorial. */
    await expect(primary).not.toHaveAttribute('href', /\/jouer\/$/);
    await expect(primary).toHaveAttribute('href', /apprendre-les-bases/);

    const bar = page.locator('[data-dash-progress]');
    await expect(bar).toBeVisible();
    await expect(page.locator('[data-dash-progress-label]')).toHaveText(/\d+ \/ \d+/);
    const width = await page
      .locator('[data-dash-progress-fill]')
      .evaluate((el) => (el as HTMLElement).style.inlineSize);
    expect(width, 'the bar is empty despite two solved steps').not.toBe('0%');

    // The secondary tile becomes Play.
    await expect(page.getByTestId('dash-secondary')).toContainText(/Jouer/);
    await expect(page.getByTestId('dash-secondary')).toHaveAttribute('href', /\/jouer\/$/);
  });

  test('the stats line counts what is actually stored', async ({ page }) => {
    await seedProgress(page, SEEDED);
    await page.goto('/');
    // Two solved records in the seed.
    await expect(page.locator('[data-dash-solved]')).toHaveText('2');
    await expect(page.locator('[data-dash-lessons]')).toHaveText('2');
  });

  /**
   * ⚠️ ONE PRIMARY ACTION, AND IT IS TWICE THE SIZE OF THE OTHERS.
   * "If there are two, neither is primary" — the direction doc's own words,
   * and the defect it describes on the old menu (five entries, identical
   * weight, nothing guiding).
   */
  test('the dominant card is the only element of its size', async ({ page }) => {
    await page.goto('/');
    const primary = (await page.getByTestId('dash-primary').boundingBox())!;
    const tile = (await page.getByTestId('dash-practise').boundingBox())!;

    /* ⚠️ AREA, NOT HEIGHT. "Twice the size" is about how much of the screen a
       card claims, and the primary is FULL WIDTH while a tile is half — so
       comparing heights understates it badly and fails a card that is in fact
       three times the size. (It did: 136px against 125px, while the areas were
       68,640 against 21,875.) */
    const area = (b: { width: number; height: number }) => b.width * b.height;
    expect(
      area(primary) / area(tile),
      'the dominant card no longer dominates',
    ).toBeGreaterThanOrEqual(2);

    // And it really is the tallest single thing on the screen.
    expect(primary.height).toBeGreaterThan(tile.height);
    /* It is the first thing on screen and it is fully visible without
       scrolling — the mobile counterpart of E5's one-screen rule. */
    expect(primary.y + primary.height).toBeLessThanOrEqual(PHONE.height);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the descriptive sentence is one scroll away, not gone', async ({ page }) => {
    await page.goto('/');
    /* M2 moved it BELOW the dominant card on purpose. It must still exist and
       still be reachable — a returning student should not reread it, a
       first-time visitor must still find it. */
    const tagline = page.locator('.menu-tagline');
    await expect(tagline).toBeVisible();
    const box = (await tagline.boundingBox())!;
    expect(box.y, 'the sentence is more than one screen down').toBeLessThan(PHONE.height * 2);
  });

  test('the next session is shown with its venue', async ({ page }) => {
    await page.goto('/');
    const next = page.getByTestId('dash-next');
    await expect(next).toBeVisible();
    await expect(next).toContainText(/Prochaine séance/i);
    await expect(next.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
  });

  test('a broken localStorage leaves a working dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException('QuotaExceededError');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
      });
    });
    await page.goto('/');
    // Falls back to the server-rendered branch rather than erroring.
    await expect(page.getByTestId('dash-primary')).toContainText(/Jouer une partie/);
    await expect(page.locator('[data-dash-progress]')).toBeHidden();
  });
});

/* ═══ The progress view ═════════════════════════════════════════════════ */

/**
 * ⚠️ THE SHAPE OF THIS PAGE CHANGED IN M3, AND THESE TESTS CHANGED WITH IT.
 *
 * `[data-group-done]`, `[data-progress-empty]` and `[data-progress-continue]`
 * are gone. The counts are now `data-resume-for` surfaces bound by the shared
 * resolver, the way back in is the shared `ResumeCard`, and the empty state is
 * no longer a sentence plus a button — the page shows real counts at zero and
 * names the first three things to do, which is both truer and the same markup
 * a returning reader sees.
 *
 * That is a deliberate redesign (M3 task 4), not a relaxation: every assertion
 * below still says what its predecessor said. Only the handles moved.
 */
test.describe('the local progress view', () => {
  for (const path of ['/progres/', '/en/progres/']) {
    test(`${path} renders and reads the local store`, async ({ page }) => {
      await seedProgress(page, SEEDED);
      await page.goto(path);
      // Two tutorial steps solved in the seed.
      await expect(page.locator('[data-group="basics"] [data-resume-count]')).toHaveText(/^2 /);
      // Something was started, so the way back in is offered.
      await expect(page.getByTestId('resume-progres')).toBeVisible();
      await expect(page.getByTestId('resume-progres')).toHaveAttribute('data-resolved', 'true');
    });
  }

  test('with nothing stored it names what to do first, and claims nothing', async ({ page }) => {
    await page.goto('/progres/');

    // No offer to resume — there is nothing to resume.
    await expect(page.getByTestId('resume-progres')).toBeHidden();
    await expect(page.locator('[data-group="basics"] [data-resume-count]')).toHaveText(/^0 /);

    /* ⚠️ AND YET THERE IS SOMEWHERE TO GO. The old page said "you have not
       started anything" and offered one button; this one names the first three
       steps, server-rendered, so it works with no JavaScript at all. */
    const next = page.locator('[data-progress-next] .progress-next-item:not([hidden]) a');
    await expect(next).toHaveCount(3);
    await expect(next.first()).toHaveAttribute('href', /apprendre-les-bases/);
  });

  test('the breakdowns count only what exists, and the rank is computed', async ({ page }) => {
    await seedProgress(page, SEEDED);
    await page.goto('/progres/');

    /* Only levels that actually hold an exercise are rendered — an empty
       "Avancé — 0 of 0" row is a fact about the content, not about the
       reader. */
    const levels = page.locator('[data-resume-for^="level-"]');
    expect(await levels.count()).toBeGreaterThan(0);
    for (const text of await levels.allTextContents()) {
      expect(text).toMatch(/\d+\s+\w+\s+\d+/);
    }

    await expect(page.locator('[data-resume-for^="theme-"]').first()).toBeVisible();

    /**
     * ⚠️ THIS ASSERTION FLIPPED IN E3, AND THE RULE BEHIND IT DID NOT.
     *
     * It used to require the word "bientôt", because nothing computed a rank
     * and printing one would have been the site inventing a fact. Something
     * computes one now — a derived total, summed from records that exist — so
     * the page prints it. What is asserted is the same principle from the other
     * side: a real rank name and a real number, and NOT the placeholder.
     *
     * The deeper coverage (every threshold, the breakdown adding up, no award
     * on a re-solve) is in `progression.spec.ts`.
     */
    await expect(page.locator('.progress-soon')).toHaveCount(0);
    await expect(page.locator('[data-score-rank]').first()).toHaveText(/\S/);
    await expect(page.locator('[data-score-rank]').first()).not.toContainText(/bient[oô]t|soon/i);
    await expect(page.locator('[data-score-points]').first()).toHaveText(/^\d+$/);
  });
});

/* ═══ Task 3 — settings in the desktop header ═══════════════════════════ */

test.describe('settings are reachable from the desktop header', () => {
  test('the header carries a settings entry', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    const link = page.getByTestId('header-settings');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/parametres\/$/);
    /* Icon-only, so the accessible name has to carry it. */
    await expect(link).toHaveAttribute('aria-label', /paramètres|settings/i);

    /* ⚠️ WITHOUT SCROLLING. The whole point: it used to be footer-only. */
    const box = (await link.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('it marks itself current on the settings page', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/parametres/');
    await expect(page.getByTestId('header-settings')).toHaveAttribute('aria-current', 'page');
  });

  test('the footer link stays — two ways in is not redundancy here', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expect(page.locator('footer a[href$="/parametres/"]')).toHaveCount(1);
  });
});

/* ═══ The regression guard ══════════════════════════════════════════════ */

test.describe('desktop is untouched', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test('the retro menu still renders and the dashboard does not', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-main-menu]')).toBeVisible();
    await expect(page.locator('[data-dashboard]')).toBeHidden();
    await expect(page.locator('[data-mobile-nav]')).toBeHidden();
  });

  test('the grouped header still renders its three groups', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.site-nav')).toBeVisible();
    await expect(page.locator('.site-nav [data-nav-toggle]')).toHaveCount(3);
  });

  /**
   * The breakpoint itself, from both sides. 767px is the app; 768px is the
   * desktop. If someone "unifies" the two layouts, this is what says no.
   */
  test('the switch happens at exactly 768px', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-mobile-nav]')).toBeVisible();
    await expect(page.locator('[data-dashboard]')).toBeVisible();
    await expect(page.locator('[data-main-menu]')).toBeHidden();

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.locator('[data-mobile-nav]')).toBeHidden();
    await expect(page.locator('[data-dashboard]')).toBeHidden();
    await expect(page.locator('[data-main-menu]')).toBeVisible();
  });
});

/* ═══ Accessibility ═════════════════════════════════════════════════════ */

test.describe('accessibility', () => {
  /**
   * ⚠️ BOTH BRANCHES, AND THE FRESH ONE IS NOT OPTIONAL.
   *
   * Every axe test here originally SEEDED progress — and the resolver removes
   * the dominant card's explanatory line when it resolves, so that element was
   * never audited by any of them. It was carrying `opacity: 0.9` over the
   * primary fill, which drops an audited token pair to 4.42:1, and Lighthouse
   * found it (a11y 100 → 96) after the whole suite was green.
   *
   * `seeded` is the parameter that would have caught it. A state that only
   * exists before the reader has done anything is still a state a reader sees.
   */
  for (const seeded of [false, true]) {
    test(`the fresh dashboard (seeded: ${seeded}) has no axe violations`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      if (seeded) await seedProgress(page, SEEDED);
      await page.goto('/');
      await expect(page.locator('[data-dashboard]')).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }

  for (const theme of ['bois', 'marbre', 'souiri', 'terminal'] as const) {
    for (const [locale, path] of [
      ['fr', '/'],
      ['en', '/en/'],
    ] as const) {
      test(`dashboard ${locale} in ${theme} has no axe violations`, async ({ page }) => {
        await page.setViewportSize(PHONE);
        await page.addInitScript((id) => {
          try {
            window.localStorage.setItem(
              'mcc:theme:v1',
              JSON.stringify({ mode: 'light', theme: id }),
            );
          } catch {
            /* ignore */
          }
        }, theme);
        await seedProgress(page, SEEDED);
        await page.goto(path);
        await expect(page.locator('[data-dashboard]')).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }
  }

  /* Dark mode moves `--mcc-primary` to a lighter green, which is where the
     opacity bug actually failed — the light-mode fill had enough headroom to
     absorb it. */
  test('the fresh dashboard in DARK mode has no axe violations', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('mcc:theme:v1', JSON.stringify({ mode: 'dark', theme: 'bois' }));
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');
    await expect(page.locator('[data-dashboard]')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  for (const path of ['/progres/', '/en/progres/']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await seedProgress(page, SEEDED);
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}
