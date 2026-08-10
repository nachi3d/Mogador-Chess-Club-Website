import { test, expect, type Page } from '@playwright/test';

/**
 * THE RESUME RESOLVER — the contract, not the implementation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS FILE WAS WRITTEN BEFORE THE RESOLVER WAS EXTRACTED, AND THAT IS
 * THE POINT.
 *
 * M3 moved the E5 resolver out of `HomePage.astro`'s inline script and into
 * one shared component so `/cours/`, `/exercices/` and `/progres/` could use
 * the same rule. The brief's non-negotiable was that the home page behave
 * EXACTLY as before — so the properties an extraction could plausibly break
 * were pinned first, run green against the old code, and then run green
 * against the new. Anything asserted here failed for real on at least one
 * intermediate version.
 *
 * `main-menu.spec.ts` already covers the resolution RULE itself (furthest
 * point, the skipped-step fallback, corrupt storage, the EN journey). It is
 * deliberately not repeated. What lives here is everything about HOW the
 * result reaches the page:
 *
 *   1. it is resolved before the first paint, so nothing moves;
 *   2. the script is INLINE — not a module, not fetched;
 *   3. the dashboard's adaptive branch swaps in place, both directions;
 *   4. the same rule now drives the other three surfaces.
 * ─────────────────────────────────────────────────────────────────────────
 */

const PROGRESS_KEY = 'mcc:progress:v1';

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

interface Step {
  readonly u: string;
  readonly t: string;
  readonly k: readonly string[];
}

const solved = { solved: true, attempts: 1, hintUsed: false, solvedAt: '2026-01-01T00:00:00.000Z' };
const attempted = { solved: false, attempts: 2, hintUsed: false, solvedAt: null };

/**
 * The build-time journey table.
 *
 * ⚠️ BOTH SELECTORS, ON PURPOSE. M3 renamed the tag from `data-menu-journey`
 * (home-only) to `data-resume-journey="<id>"` (any surface). Accepting either
 * is what let this file run UNCHANGED against the code before the extraction
 * and the code after it — which is the only way its green run on the old build
 * meant anything. Not one assertion moved; only the handle did.
 */
async function journeyOf(page: Page): Promise<Step[]> {
  const raw = await page.locator('[data-menu-journey], [data-resume-journey]').first().textContent();
  return JSON.parse(raw ?? '[]') as Step[];
}

async function seed(page: Page, records: Record<string, unknown>) {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key as string, value as string);
      } catch {
        /* the broken-storage cases install a throwing localStorage */
      }
    },
    [PROGRESS_KEY, JSON.stringify({ exercises: records })],
  );
}

function keysOf(steps: readonly Step[], record: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const step of steps) for (const key of step.k) out[key] = record;
  return out;
}

/**
 * Cumulative layout shift, excluding shifts the reader caused themselves.
 *
 * ⚠️ `buffered: true` IS LOAD-BEARING. The observer is installed by an init
 * script, which still runs after the very first entries can be recorded; a
 * non-buffered observer would report 0.000 for a page that visibly jumped —
 * a green test for the exact defect it exists to catch.
 */
async function watchCls(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) (window as unknown as { __cls: number }).__cls += shift.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* not Chromium — the tests that read this skip */
    }
  });
}

async function readCls(page: Page): Promise<number> {
  // One frame past load, so a shift caused by a late script has been recorded.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

/* ═══ 1. Resolved before the first paint ════════════════════════════════ */

test.describe('the resolution is invisible', () => {
  /* `layout-shift` is a Chromium entry type. The property is not
     browser-specific, but the instrument is. */
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout-shift is Chromium-only');

  for (const seeded of [false, true]) {
    for (const [name, viewport] of [
      ['desktop', DESKTOP],
      ['phone', PHONE],
    ] as const) {
      test(`CLS is 0 on the home page — ${name}, seeded: ${seeded}`, async ({ page }) => {
        await page.setViewportSize(viewport);

        if (seeded) {
          /* Read the journey from an unseeded visit first, so the seed is
             built from the real build-time table rather than from a guess. */
          await page.goto('/');
          const journey = await journeyOf(page);
          await seed(page, keysOf([journey[0]!], attempted));
        }

        await watchCls(page);
        await page.goto('/', { waitUntil: 'load' });

        /* ⚠️ THE RESOLVER MUST HAVE ALREADY RUN. If it ever becomes a deferred
           module the sixth menu entry appears a frame late and pushes a
           vertically-centred menu down under the reader's eyes — which is the
           regression this number exists to catch. */
        if (seeded && name === 'desktop') {
          await expect(page.locator('[data-menu-resume]')).toHaveAttribute('data-resolved', 'true');
        }

        const cls = await readCls(page);
        expect(cls, `the home page shifted by ${cls} — the resolver ran too late`).toBeLessThan(
          0.001,
        );
      });
    }
  }
});

/* ═══ 2. Inline, never fetched ══════════════════════════════════════════ */

test.describe('the resolver ships inline', () => {
  /**
   * ⚠️ A STRUCTURAL ASSERTION, AND IT SURVIVES THE EXTRACTION.
   *
   * The whole anti-FOUC design rests on the resolver being parsed and run
   * synchronously with the document. `type="module"` and `src=` are both
   * deferred by definition, so either would reintroduce the late frame. This
   * reads the served HTML rather than the live DOM, because by the time the
   * DOM exists the distinction has already been erased.
   */
  for (const path of ['/', '/en/']) {
    test(`${path} carries the progress key in a non-deferred inline script`, async ({ request }) => {
      const html = await (await request.get(path)).text();

      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
      const resolvers = scripts.filter(([, , body]) => (body ?? '').includes(PROGRESS_KEY));

      expect(resolvers.length, 'no inline script reads the progress store').toBeGreaterThan(0);
      for (const [, attrs] of resolvers) {
        expect(attrs, `the resolver is deferred: <script${attrs}>`).not.toMatch(/\btype=["']module/);
        expect(attrs, `the resolver is fetched: <script${attrs}>`).not.toMatch(/\bsrc=/);
        expect(attrs, `the resolver is deferred: <script${attrs}>`).not.toMatch(/\b(defer|async)\b/);
      }
    });
  }
});

/* ═══ 3. The dashboard's adaptive branch, both directions ═══════════════ */

test.describe('the dashboard adapts in place', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  /**
   * ⚠️ THE SERVER RENDERS THE "NOTHING YET" BRANCH, AND IT MUST STAY THAT WAY.
   * It is the branch that is true for a first-time visitor and the only one
   * that works with no JavaScript at all. Asserted against the HTML, so a
   * refactor that moved the default to the client would fail here even though
   * the rendered page still looked right.
   */
  test('the served HTML is the no-progress branch', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/data-dash-primary\b/);
    expect(html, 'the server pre-empted the resolver').toMatch(/\/jouer\/"[^>]*data-dash-primary/);
  });

  test('with nothing stored, Play stays dominant and no bar is shown', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('dash-primary')).toHaveAttribute('href', /\/jouer\/$/);
    await expect(page.locator('[data-dash-progress]')).toBeHidden();
    /* The explanatory line is only removed when a specific step takes over. */
    await expect(page.locator('[data-dash-primary-text]')).toBeVisible();
  });

  test('with progress, Resume takes over and Play moves to the tile', async ({ page }) => {
    await page.goto('/');
    const journey = await journeyOf(page);
    await seed(page, keysOf([journey[1]!], attempted));
    await page.reload();

    const primary = page.getByTestId('dash-primary');
    await expect(primary).toHaveAttribute('href', journey[1]!.u);
    await expect(primary).toContainText(journey[1]!.t);
    await expect(page.locator('[data-dash-progress]')).toBeVisible();
    await expect(page.getByTestId('dash-secondary')).toHaveAttribute('href', /\/jouer\/$/);
    /* Removed, not merely hidden — the card names a lesson now. */
    await expect(page.locator('[data-dash-primary-text]')).toHaveCount(0);
    await expect(page.locator('[data-dashboard]')).toHaveAttribute('data-resolved', 'true');
  });

  /**
   * The menu and the dashboard are two surfaces over ONE resolution. They
   * cannot be allowed to name different steps — that is precisely the class
   * of bug that having two copies of the rule would produce, and the reason
   * the extraction happened.
   */
  test('the menu entry and the dashboard card resolve to the same step', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    const journey = await journeyOf(page);
    await seed(page, {
      ...keysOf([journey[0]!], solved),
      ...keysOf([journey[2]!], attempted),
    });
    await page.reload();

    const menuHref = await page.getByTestId('menu-resume').getAttribute('href');
    const dashHref = await page.getByTestId('dash-primary').getAttribute('href');
    expect(menuHref).toBe(journey[2]!.u);
    expect(dashHref, 'the two surfaces disagree about where the reader stopped').toBe(menuHref);
  });

  test('a throwing localStorage leaves both surfaces on the server branch', async ({ page }) => {
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
    await expect(page.getByTestId('dash-primary')).toHaveAttribute('href', /\/jouer\/$/);
    await expect(page.locator('[data-menu-resume]')).toBeHidden();
  });
});

/* ═══ 4. The other three surfaces ═══════════════════════════════════════ */

/**
 * ⚠️ EACH CALL SITE RESOLVES ITS OWN JOURNEY, and that is the whole reason
 * the resolver was parameterised rather than merely moved:
 *
 *   /            the tutorial then the lessons — the course sequence
 *   /cours/      the lessons alone
 *   /exercices/  the exercises alone
 *   /progres/    all three, because that page is the whole picture
 *
 * So `/progres/` legitimately names a different step from `/` once a reader
 * has touched a standalone exercise. That is four answers to four questions,
 * not four answers to one.
 */
test.describe('the index pages offer the same resume', () => {
  const CARDS = [
    { path: '/cours/', card: 'resume-cours' },
    { path: '/exercices/', card: 'resume-exercices' },
    { path: '/progres/', card: 'resume-progres' },
  ] as const;

  for (const { path, card } of CARDS) {
    test(`${path} shows no resume card when nothing is stored`, async ({ page }) => {
      await page.goto(path);
      /* ⚠️ NOT A LOADING STATE. "Reprendre" pointing at a lesson nobody has
         opened would be the site claiming something it does not know. */
      await expect(page.getByTestId(card)).toBeHidden();
    });
  }

  test('/cours/ resumes the lesson the reader stopped in', async ({ page }) => {
    await page.goto('/cours/');
    const journey = await journeyOf(page);
    test.skip(journey.length === 0, 'no lessons with exercises in this build');

    await seed(page, keysOf([journey[0]!], attempted));
    await page.reload();

    const card = page.getByTestId('resume-cours');
    await expect(card).toBeVisible();
    await expect(card.locator('a')).toHaveAttribute('href', journey[0]!.u);
    await expect(card.locator('[data-resume-title]')).toHaveText(journey[0]!.t);
  });

  test('/exercices/ resumes an exercise, and counts the solved ones', async ({ page }) => {
    await page.goto('/exercices/');
    const journey = await journeyOf(page);
    test.skip(journey.length < 2, 'needs at least two exercises');

    await seed(page, {
      ...keysOf([journey[0]!], solved),
      ...keysOf([journey[1]!], attempted),
    });
    await page.reload();

    const card = page.getByTestId('resume-exercices');
    await expect(card).toBeVisible();
    await expect(card.locator('a')).toHaveAttribute('href', journey[1]!.u);
    // One of them is solved, and the tally says so rather than guessing.
    await expect(card.locator('[data-resume-count]')).toHaveText(
      new RegExp(`^1 / ${journey.length}\\b`),
    );
  });

  /**
   * ⚠️ COUNTS ARE FILLED WHETHER OR NOT THERE IS ANYTHING TO RESUME, and the
   * card is hidden whether or not the counts are filled. Those two halves of
   * the declarative contract are easy to collapse into one another, and doing
   * so breaks either the statistics at zero or the offer before it is true.
   */
  test('/progres/ fills its counts with nothing stored, and offers nothing', async ({ page }) => {
    await page.goto('/progres/');
    await expect(page.getByTestId('resume-progres')).toBeHidden();
    await expect(page.locator('[data-group="basics"] [data-resume-count]')).toHaveText(/^0 /);
    await expect(page.locator('[data-group="basics"] [data-resume-fill]')).toHaveAttribute(
      'style',
      /inline-size:\s*0%/,
    );
  });

  test('/progres/ counts every group and names what is left', async ({ page }) => {
    await page.goto('/progres/');
    const journey = await journeyOf(page);
    await seed(page, keysOf(journey.slice(0, 2), solved));
    await page.reload();

    await expect(page.locator('[data-group="basics"] [data-resume-count]')).toHaveText(/^2 /);
    await expect(page.getByTestId('resume-progres')).toBeVisible();

    /* "La suite" names the first three INCOMPLETE steps — so the two solved
       ones must not be in it. */
    const next = page.locator('[data-progress-next] .progress-next-item:not([hidden]) a');
    await expect(next).toHaveCount(3);
    const hrefs = await next.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs).not.toContain(journey[0]!.u);
    expect(hrefs).toContain(journey[2]!.u);
  });

  test('the CLS on the index pages is 0 in both branches', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'layout-shift is Chromium-only');
    await page.setViewportSize(PHONE);

    await page.goto('/exercices/');
    const journey = await journeyOf(page);
    await seed(page, keysOf([journey[0]!], attempted));

    await watchCls(page);
    await page.goto('/exercices/', { waitUntil: 'load' });
    /* Revealing a card ABOVE the list would push the list down — unless
       nothing has painted yet, which is what the inline resolver buys. */
    await expect(page.getByTestId('resume-exercices')).toBeVisible();

    const cls = await readCls(page);
    expect(cls, `/exercices/ shifted by ${cls} when the resume card appeared`).toBeLessThan(0.001);
  });

  test('the resume card never appears without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/exercices/');
    /* It is a shortcut, never the only way in — every card below is a real
       link, exactly as the E5 menu's sixth entry is optional. */
    await expect(page.getByTestId('resume-exercices')).toBeHidden();
    await expect(page.locator('.card-grid .card-link').first()).toBeVisible();
    await context.close();
  });
});

