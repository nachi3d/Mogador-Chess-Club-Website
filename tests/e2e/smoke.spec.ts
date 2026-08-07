import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Scaffold smoke tests.
 *
 * Three things must hold before anything else is worth building on top:
 *   1. the home page renders in BOTH locales;
 *   2. the language switcher PRESERVES THE PATH on every route;
 *   3. the home page has no axe violations in either locale.
 *
 * The route list is imported from the app rather than retyped, so a new route
 * is covered by the switcher test the moment it is added to the nav.
 */

/** Mirrors ROUTES in src/i18n/paths.ts. Kept as a literal because the spec
 *  runs outside the Astro module graph and cannot use the `@i18n` alias.
 *
 *  `/mentions-legales/` keeps its FRENCH segment in English — route segments
 *  are never translated, which is what makes the switcher a pure prefix swap
 *  that can never fail to find its counterpart. See src/i18n/paths.ts. */
const ROUTES = [
  '/',
  '/cours/',
  '/pieges/',
  '/exercices/',
  '/agenda/',
  '/contact/',
  '/mentions-legales/',
] as const;

const enPath = (route: string) => (route === '/' ? '/en/' : `/en${route}`);

test.describe('home page renders in both locales', () => {
  test('FR at the root', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mogador Chess Club');
    /* A French nav label proves the FR string table is in use. Since the nav
       became grouped disclosures, the section links live inside a collapsed
       panel — so open it first. That checks the string table AND that the menu
       actually reveals its links. */
    await expect(page.getByRole('button', { name: 'Apprendre' })).toBeVisible();
    await page.getByRole('button', { name: 'Apprendre' }).click();
    /* ⚠️ Scoped to the header. Since E5 the home page also carries a main menu
       whose labels are IDENTICAL to the nav's by design, so an unscoped
       getByRole matches two elements and fails strict mode. That duplication is
       the feature, not the bug — see tests/e2e/main-menu.spec.ts. */
    await expect(
      page.locator('.site-nav').getByRole('link', { name: "Pièges d'ouverture" }),
    ).toBeVisible();
    // FR is the default locale and must NOT be served under a prefix.
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('EN under /en/', async ({ page }) => {
    await page.goto('/en/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mogador Chess Club');
    await expect(page.getByRole('button', { name: 'Learn' })).toBeVisible();
    await page.getByRole('button', { name: 'Learn' }).click();
    await expect(
      page.locator('.site-nav').getByRole('link', { name: 'Opening traps' }),
    ).toBeVisible();
  });

  test('the title falls back to the site name on home, not "Accueil — …"', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Mogador Chess Club');
  });
});

test.describe('language switcher preserves the path', () => {
  for (const route of ROUTES) {
    test(`FR ${route} → EN ${enPath(route)}`, async ({ page }) => {
      await page.goto(route);
      await page.getByTestId('lang-switch').click();
      await expect(page).toHaveURL(new RegExp(`${enPath(route).replace(/\//g, '\\/')}$`));
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });

    test(`EN ${enPath(route)} → FR ${route}`, async ({ page }) => {
      await page.goto(enPath(route));
      await page.getByTestId('lang-switch').click();
      await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    });
  }

  test('a round trip returns to the exact starting path', async ({ page }) => {
    await page.goto('/pieges/');
    await page.getByTestId('lang-switch').click();
    await page.getByTestId('lang-switch').click();
    expect(new URL(page.url()).pathname).toBe('/pieges/');
  });
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // Name the offending rules in the failure message — "expected 0, got 3" is
  // useless at 2am.
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('accessibility', () => {
  test('home FR has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expectNoAxeViolations(page);
  });

  test('home EN has no axe violations', async ({ page }) => {
    await page.goto('/en/');
    await expectNoAxeViolations(page);
  });
});
