import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * THE EXERCISE INDEX'S FILTERS — 27 entries, narrowed without JavaScript.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE FILTERS ARE STATIC ROUTES, NOT `?niveau=`, AND THAT IS FORCED.
 *
 * Batch 5's brief asked for server-side query filtering. This site is
 * `output: 'static'` with no adapter — a hard rule in CLAUDE.md, not a setting
 * — so there is no server to read a query string, and a browser-side filter
 * would leave every control dead with JS off. `src/lib/exercise-filters.ts`
 * records the decision; this file proves the property that made it worth
 * taking: **the filters work with JavaScript disabled.**
 * ═════════════════════════════════════════════════════════════════════════
 */

const INDEX = '/exercices/';
const INDEX_EN = '/en/exercices/';

const chips = (page: Page) => page.locator('[data-exercise-filters] .chip-link');
const cards = (page: Page) =>
  page.locator('a[href*="/exercices/"]').filter({ hasNot: page.locator('[data-exercise-filters]') });

/** Links to an exercise DETAIL page — never a filter link or the index itself. */
async function cardHrefs(page: Page): Promise<string[]> {
  const all = await page
    .locator('main a[href]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
  return all.filter((h) => /^\/(en\/)?exercices\/[a-z0-9-]+\/$/.test(h));
}

/* ═══ The corpus ════════════════════════════════════════════════════════ */

test('the index lists every exercise and offers both filter axes', async ({ page }) => {
  await page.goto(INDEX);

  const hrefs = await cardHrefs(page);
  /* Batch 5 took the collection to 27. Asserted as a floor rather than an
     exact number so adding an exercise does not fail an unrelated test — but
     high enough that a filter accidentally applied to the index would trip. */
  expect(hrefs.length, `the index drew ${hrefs.length} exercise cards`).toBeGreaterThanOrEqual(27);

  await expect(page.locator('[data-exercise-filters]')).toHaveCount(1);
  expect(await chips(page).count(), 'no filter chips rendered').toBeGreaterThan(5);
});

/* ═══ The filters actually filter ═══════════════════════════════════════ */

test.describe('a level filter', () => {
  test('shows fewer exercises than the index, and all of them match', async ({ page }) => {
    await page.goto(INDEX);
    const total = (await cardHrefs(page)).length;

    await page.goto('/exercices/niveau/debutant/');
    const filtered = await cardHrefs(page);

    expect(filtered.length, 'the level filter showed nothing').toBeGreaterThan(0);
    expect(
      filtered.length,
      'the filtered page shows as many cards as the index — is the filter applied?',
    ).toBeLessThan(total);

    /* ⚠️ AND EVERY CARD REALLY IS AT THAT LEVEL. A filter that merely shows
       a subset is not a filter; it is a coincidence. Read the level off each
       detail page rather than trusting the index's own badge. */
    for (const href of filtered.slice(0, 6)) {
      await page.goto(href);
      const badge = (await page.locator('.level-badge, [data-level]').first().innerText()).trim();
      expect(badge.toLowerCase(), `${href} is not débutant`).toContain('débutant');
    }
  });
});

test('a theme filter shows only exercises carrying that theme', async ({ page }) => {
  await page.goto('/exercices/theme/fourchette/');
  const filtered = await cardHrefs(page);
  expect(filtered.length, 'the theme filter showed nothing').toBeGreaterThan(2);

  for (const href of filtered) {
    await page.goto(href);
    const chipText = (await page.locator('.chip-list').first().innerText()).toLowerCase();
    expect(chipText, `${href} does not carry the "fourchette" theme`).toContain('fourchette');
  }
});

/* ═══ No JavaScript ═════════════════════════════════════════════════════ */

test.describe('with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  /**
   * ⚠️ THIS IS THE TEST THE WHOLE DESIGN EXISTS FOR. A query-string filter
   * applied in the browser would pass every other test in this file and fail
   * this one — the chips would render, be clickable, and do nothing.
   */
  test('the chips are real links and the filter still filters', async ({ page }) => {
    await page.goto(INDEX);
    const total = (await cardHrefs(page)).length;
    expect(total, 'no cards without JS').toBeGreaterThanOrEqual(27);

    /* Every chip is an anchor with a real href — not a button, not a span. */
    const hrefs = await chips(page).evaluateAll((els) =>
      els.map((el) => ({ tag: el.tagName.toLowerCase(), href: el.getAttribute('href') })),
    );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const { tag, href } of hrefs) {
      expect(tag, 'a filter chip is not an anchor').toBe('a');
      expect(href, 'a filter chip has no href').toMatch(/^\/(en\/)?exercices\/(niveau|theme)\//);
    }

    await page.goto('/exercices/niveau/intermediaire/');
    const filtered = await cardHrefs(page);
    expect(filtered.length, 'the filter did nothing without JS').toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(total);
  });
});

/* ═══ Getting back out ══════════════════════════════════════════════════ */

test('a filtered page marks its own chip and offers a way back to everything', async ({ page }) => {
  await page.goto('/exercices/theme/mat/');

  const current = page.locator('[data-exercise-filters] .chip-link[aria-current="page"]');
  await expect(current, 'the active filter is not marked').toHaveCount(1);
  await expect(current).toHaveText(/mat/i);

  /* ⚠️ A READER WHO FILTERS MUST BE ABLE TO UNFILTER without the browser's
     back button — the same rule as every long route ending with a way onward. */
  const clear = page.locator('[data-testid="exercise-filter-clear"]');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(page).toHaveURL(/\/exercices\/$/);
  expect((await cardHrefs(page)).length).toBeGreaterThanOrEqual(27);
});

test('the index marks no chip as current', async ({ page }) => {
  await page.goto(INDEX);
  await expect(page.locator('[data-exercise-filters] .chip-link[aria-current="page"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-testid="exercise-filter-clear"]')).toHaveCount(0);
});

/* ═══ Both locales, and the segments are NOT translated ═════════════════ */

test('the English index carries the same filters under the same segments', async ({ page }) => {
  await page.goto(INDEX_EN);
  const hrefs = await chips(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? ''),
  );
  expect(hrefs.length).toBeGreaterThan(5);
  /* ⚠️ `/en/exercices/niveau/…`, never `/en/exercices/level/…`. One segment
     vocabulary is what makes the language switcher a pure prefix swap. */
  for (const href of hrefs) expect(href).toMatch(/^\/en\/exercices\/(niveau|theme)\//);

  await page.goto('/en/exercices/niveau/debutant/');
  expect((await cardHrefs(page)).length).toBeGreaterThan(0);
});

/* ═══ Every filter route that is linked actually exists ═════════════════ */

test('every chip on the index resolves 200', async ({ page, request }) => {
  await page.goto(INDEX);
  const hrefs = await chips(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? ''),
  );
  expect(hrefs.length).toBeGreaterThan(5);

  for (const href of hrefs) {
    const response = await request.get(href);
    expect(response.status(), `${href} does not resolve`).toBe(200);
  }
});

/**
 * ⚠️ A FILTER WITH NO MATCHES IS NEVER EMITTED, which is why there is no empty
 * state to test. The values are derived from the content, so an unknown one
 * 404s like any unwritten URL — asserted rather than assumed, because the
 * alternative (a hand-written list of themes) would rot into exactly this.
 */
test('an unknown filter value 404s rather than rendering an empty page', async ({ request }) => {
  for (const path of ['/exercices/theme/pas-un-theme/', '/exercices/niveau/expert/']) {
    const response = await request.get(path);
    expect(response.status(), `${path} should not exist`).toBe(404);
  }
});

/* ═══ Accessibility ═════════════════════════════════════════════════════ */

test.describe('accessibility', () => {
  for (const path of [INDEX, '/exercices/theme/mat/', '/en/exercices/niveau/debutant/']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      const { settleReveals } = await import('./helpers/reveal');
      await settleReveals(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
