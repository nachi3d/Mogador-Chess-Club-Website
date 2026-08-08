import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleReveals } from './helpers/reveal';

/**
 * E5 — the retro main menu on the home page.
 *
 * The menu owns the first screen; the descriptive content that Google and a
 * parent both need lives below it. "Reprendre" is the detail that makes it feel
 * like a game, and the only part that depends on the reader's own state.
 *
 * ⚠️ The progress key is written here as a LITERAL, exactly as the inline
 * resolver in `HomePage.astro` writes it. That duplication is the point: this
 * spec is the contract between the two, and a divergence from
 * `src/lib/progress.ts` fails here rather than in production.
 */
const PROGRESS_KEY = 'mcc:progress:v1';

interface Step {
  readonly u: string;
  readonly t: string;
  readonly k: readonly string[];
}

/** The build-time journey table the resolver reads. */
async function journeyOf(page: Page): Promise<Step[]> {
  const raw = await page.locator('[data-menu-journey]').textContent();
  return JSON.parse(raw ?? '[]') as Step[];
}

/** Seed the store the way the site itself would have written it. */
async function seed(page: Page, records: Record<string, Partial<Record<string, unknown>>>) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [PROGRESS_KEY, JSON.stringify({ exercises: records })],
  );
}

const solved = { solved: true, attempts: 1, hintUsed: false, solvedAt: '2026-01-01T00:00:00.000Z' };
const attempted = { solved: false, attempts: 2, hintUsed: false, solvedAt: null };

function keysOf(steps: Step[], record: typeof solved | typeof attempted) {
  const out: Record<string, unknown> = {};
  for (const step of steps) for (const key of step.k) out[key] = record;
  return out as Record<string, Partial<Record<string, unknown>>>;
}

test.describe('the main menu', () => {
  for (const [locale, path, expected] of [
    ['fr', '/', ['Jouer', 'Apprendre', "S'entraîner", "Pièges d'ouverture", 'Le club']],
    ['en', '/en/', ['Play', 'Learn', 'Practise', 'Opening traps', 'The club']],
  ] as const) {
    test(`renders the five standing entries in ${locale}`, async ({ page }) => {
      await page.goto(path);

      const links = page.locator('[data-main-menu] .menu-entry:not([hidden]) .menu-link');
      await expect(links).toHaveCount(5);
      expect((await links.allTextContents()).map((s) => s.trim())).toEqual([...expected]);

      // Real links, with real destinations — not buttons and not JS handlers.
      for (const id of ['home-cta-play', 'menu-learn', 'menu-practise', 'menu-traps', 'menu-club']) {
        await expect(page.getByTestId(id)).toHaveAttribute('href', /\/.+\//);
      }
    });
  }

  /**
   * ⚠️ TENSION 3. Two different names for the same destination reads as two
   * different sites. Rather than hard-coding the strings twice, this reads the
   * HEADER's own labels and requires the menu's to be a subset — so renaming a
   * nav item without renaming its menu entry fails here.
   */
  for (const [locale, path] of [
    ['fr', '/'],
    ['en', '/en/'],
  ] as const) {
    test(`menu labels are identical to the header nav's in ${locale}`, async ({ page }) => {
      await page.goto(path);

      const navLabels = new Set(
        (
          await page
            .locator('.site-nav .nav-toggle, .site-nav .nav-panel a, .site-nav .nav-root > li > a')
            .allTextContents()
        ).map((s) => s.trim()),
      );

      const menuLabels = (
        await page.locator('[data-main-menu] .menu-entry:not([hidden]) .menu-text').allTextContents()
      ).map((s) => s.trim());

      expect(menuLabels.length).toBe(5);
      for (const label of menuLabels) {
        expect(
          navLabels.has(label),
          `menu says "${label}", the header nav does not use that word — ` +
            `known nav labels: ${[...navLabels].join(' | ')}`,
        ).toBe(true);
      }
    });
  }

  /**
   * ⚠️ 900×840, NOT 390×844 — CHANGED BY M1/M2, AND ON PURPOSE.
   *
   * This test was written for a phone, because that is where the E5 menu had
   * to fit one screen. Below 768px the menu no longer renders at all: the
   * dashboard replaces it (mcc-direction-mobile-app.md, which supersedes E5 on
   * mobile only). Asserting the menu's phone layout now would be asserting
   * something the site deliberately does not do.
   *
   * The RULE it protects is still live, so it is checked at the narrowest
   * viewport the menu actually appears at — one screen, no scrolling, 44px
   * targets. Its mobile counterpart moved to `mobile-app.spec.ts`, where the
   * dashboard's primary action is asserted to be above the fold at 390px.
   */
  test('the whole menu fits one screen at its narrowest viewport, with 44px targets', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 840 });
    // Seeded so the SIXTH entry is present — the tightest case, and the one a
    // returning reader actually sees.
    await page.goto('/');
    const journey = await journeyOf(page);
    await seed(page, keysOf([journey[0]!], attempted));
    await page.reload();

    const entries = page.locator('[data-main-menu] .menu-entry:not([hidden])');
    await expect(entries).toHaveCount(6);

    const viewport = page.viewportSize()!;
    const count = await entries.count();
    for (let i = 0; i < count; i++) {
      const box = (await entries.nth(i).locator('.menu-link').boundingBox())!;
      expect(box.height, `entry ${i} is ${box.height}px tall`).toBeGreaterThanOrEqual(43.5);
      expect(
        box.y + box.height,
        `entry ${i} needs scrolling to reach — the menu must fit one screen`,
      ).toBeLessThanOrEqual(viewport.height);
    }

    // And nothing was scrolled to achieve that.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('keyboard — roving tabindex', () => {
  test('arrow keys move the selection and Enter follows the link', async ({ page }) => {
    await page.goto('/');

    const entries = page.locator('[data-main-menu] .menu-entry:not([hidden])');
    // First entry selected on arrival — which is why "Reprendre" is first.
    await expect(entries.nth(0)).toHaveAttribute('data-selected', 'true');

    await page.getByTestId('home-cta-play').focus();
    await page.keyboard.press('ArrowDown');
    await expect(entries.nth(1)).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('menu-learn')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('menu-practise')).toBeFocused();

    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('menu-learn')).toBeFocused();

    // Wraps, like a game menu.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('menu-club')).toBeFocused();

    await page.keyboard.press('Home');
    await expect(page.getByTestId('home-cta-play')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/jouer\/$/);
  });

  /**
   * The roving pattern: the menu is ONE tab stop, not five. Asserted by
   * counting tabindex rather than by pressing Tab — WebKit skips links when
   * tabbing (see CLAUDE.md), so a Tab-order assertion would fail there for a
   * reason that has nothing to do with the menu.
   */
  test('the menu is a single tab stop', async ({ page }) => {
    await page.goto('/');
    const tabIndexes = await page
      .locator('[data-main-menu] .menu-entry:not([hidden]) .menu-link')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));

    expect(tabIndexes.filter((i) => i === 0)).toHaveLength(1);
    expect(tabIndexes.filter((i) => i === -1)).toHaveLength(4);
  });
});

test.describe('Reprendre', () => {
  test('does not render when there is no progress at all', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-menu-resume]')).toBeHidden();
    await expect(page.locator('[data-main-menu] .menu-entry:not([hidden])')).toHaveCount(5);
  });

  test('does not render when the store is missing or corrupt', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('mcc:progress:v1', '{{ not json'));
    await page.goto('/');
    await expect(page.locator('[data-menu-resume]')).toBeHidden();
    // ⚠️ And the rest of the menu is untouched. A bad stored value must never
    // cost the reader the page — the same contract as src/lib/progress.ts.
    await expect(page.locator('[data-main-menu] .menu-entry:not([hidden])')).toHaveCount(5);
  });

  test('resumes the step in progress when one was left unfinished', async ({ page }) => {
    await page.goto('/');
    const journey = await journeyOf(page);
    expect(journey.length).toBeGreaterThan(2);

    // Attempted but not solved ⇒ the reader is still on it.
    await seed(page, keysOf([journey[0]!], attempted));
    await page.reload();

    const resume = page.getByTestId('menu-resume');
    await expect(resume).toBeVisible();
    await expect(resume).toHaveAttribute('href', journey[0]!.u);
    // The destination is announced even though the label stays one word.
    await expect(resume).toHaveAttribute('aria-label', new RegExp(journey[0]!.t.slice(0, 12)));
  });

  test('advances to the next step once one is finished', async ({ page }) => {
    await page.goto('/');
    const journey = await journeyOf(page);

    await seed(page, keysOf([journey[0]!], solved));
    await page.reload();

    await expect(page.getByTestId('menu-resume')).toHaveAttribute('href', journey[1]!.u);
  });

  /**
   * ⚠️ FURTHEST, NOT EARLIEST. A game's Continue resumes where you stopped, not
   * at the first gap you skipped. A reader who finished step 1, skipped 2 and
   * is mid-way through 3 resumes at 3.
   */
  test('resumes the furthest point reached, not the earliest gap', async ({ page }) => {
    await page.goto('/');
    const journey = await journeyOf(page);
    expect(journey.length).toBeGreaterThan(3);

    await seed(page, {
      ...keysOf([journey[0]!], solved),
      ...keysOf([journey[2]!], attempted),
    });
    await page.reload();

    await expect(page.getByTestId('menu-resume')).toHaveAttribute('href', journey[2]!.u);
  });

  /** Everything after the furthest point is done ⇒ fall back to the gap. */
  test('falls back to a skipped step when the tail is complete', async ({ page }) => {
    await page.goto('/');
    const journey = await journeyOf(page);

    const all = keysOf(journey, solved);
    // Un-solve step 1 only: the reader skipped it and finished everything else.
    for (const key of journey[1]!.k) delete all[key];
    await seed(page, all);
    await page.reload();

    await expect(page.getByTestId('menu-resume')).toHaveAttribute('href', journey[1]!.u);
  });

  test('disappears again once every step is complete', async ({ page }) => {
    await page.goto('/');
    const journey = await journeyOf(page);

    await seed(page, keysOf(journey, solved));
    await page.reload();

    // Nothing left to resume is not the same as nothing started.
    await expect(page.locator('[data-menu-resume]')).toBeHidden();
  });

  test('resolves against the EN journey on the EN home', async ({ page }) => {
    await page.goto('/en/');
    const journey = await journeyOf(page);
    expect(journey[0]!.u).toMatch(/^\/en\//);

    await seed(page, keysOf([journey[0]!], attempted));
    await page.reload();
    await expect(page.getByTestId('menu-resume')).toHaveAttribute('href', journey[0]!.u);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  /**
   * ⚠️ FIVE entries, not six — and that is correct rather than a shortfall.
   * "Reprendre" is a claim about the reader's own stored progress, which cannot
   * be read without JavaScript. Rendering it anyway would either point nowhere
   * useful or assert something we do not know. The five standing entries are
   * real links and all of them work.
   */
  test('the standing entries are visible, and they navigate', async ({ page }) => {
    await page.goto('/');

    const links = page.locator('[data-main-menu] .menu-entry:not([hidden]) .menu-link');
    await expect(links).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(links.nth(i)).toBeVisible();

    // No roving tabindex was applied, so every link keeps the natural tab order
    // rather than being stranded behind a tabindex nothing will ever move.
    const tabIndexes = await links.evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
    expect(tabIndexes.every((i) => i === 0)).toBe(true);

    await page.getByTestId('menu-traps').click();
    await expect(page).toHaveURL(/\/pieges\/$/);
  });

  test('the descriptive content is still there for a crawler', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText(/Mogador Chess Club/);
    await expect(page.locator('#a-propos h2')).toBeVisible();
  });
});

test.describe('the page below the menu', () => {
  test('carries the h1, a real description and structured content', async ({ page }) => {
    await page.goto('/');

    // Exactly one h1, and it is the club — not a menu entry.
    await expect(page.locator('h1')).toHaveCount(1);

    /* ⚠️ The meta description must NOT be the site-wide fallback. Six words of
       menu do not index; this is the sentence that does. */
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length ?? 0).toBeGreaterThan(120);
    expect(description).toMatch(/Essaouira/);

    await settleReveals(page);
    await expect(page.locator('#a-propos h2')).toBeVisible();
    await expect(page.getByTestId('home-cta-tutorial')).toBeVisible();
    for (const href of ['/cours/', '/exercices/', '/jouer/']) {
      await expect(page.locator(`.pillar a[href="${href}"]`)).toHaveCount(1);
    }
  });

  /**
   * ⚠️ THE VIEWPORT CHANGED, AND SO DID WHAT "ABOVE THE FOLD" MEANS HERE.
   *
   * E5 put this sentence under the menu and above the fold at 390px, so an
   * adult would not have to scroll for it. M2 moves it BELOW the dominant card
   * on mobile — deliberately: "a first-time visitor finds it in one scroll; a
   * returning student doesn't reread it every time"
   * (mcc-direction-mobile-app.md § 2).
   *
   * So on a phone the guarantee is now "one scroll", asserted in
   * `mobile-app.spec.ts`. Here it keeps its original meaning at the viewport
   * where the menu still lives.
   */
  test('the tagline an adult reads is above the fold, where the menu renders', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 840 });
    await page.goto('/');

    const tagline = page.locator('.menu-tagline');
    await expect(tagline).toBeVisible();
    const box = (await tagline.boundingBox())!;
    expect(
      box.y + box.height,
      'the descriptive sentence is below the fold — an adult must not have to scroll for it',
    ).toBeLessThanOrEqual(840);
  });
});

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('the cursor still marks the line, without travelling', async ({ page }) => {
    await page.goto('/');

    /* The SELECTED entry's cursor — the first `.menu-entry` in the DOM is the
       hidden "Reprendre" slot, whose cursor is legitimately transparent. */
    const cursor = page.locator('[data-main-menu] .menu-entry[data-selected="true"] .menu-cursor');
    await expect(cursor).toHaveCount(1);
    const style = await cursor.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transition: cs.transitionDuration, transform: cs.transform, opacity: cs.opacity };
    });

    expect(style.transition).toBe('0s');
    expect(style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
    // Removing the cursor entirely would take away the menu's only state.
    expect(parseFloat(style.opacity)).toBe(1);
  });
});

test.describe('accessibility', () => {
  for (const [locale, path] of [
    ['fr', '/'],
    ['en', '/en/'],
  ] as const) {
    test(`home ${locale} has no axe violations, menu included`, async ({ page }) => {
      await page.goto(path);
      const journey = await journeyOf(page);
      // With the sixth entry present — the state the suite would otherwise
      // never measure.
      await seed(page, keysOf([journey[0]!], attempted));
      await page.reload();
      await settleReveals(page);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
