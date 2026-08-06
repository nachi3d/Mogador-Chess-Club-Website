import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The legal notice, and the licence obligations it discharges.
 *
 * These are not cosmetic assertions. The site ships Chessground under the GPL
 * and the cburnett piece set under CC BY-SA 3.0; both licences REQUIRE what is
 * being checked here. If someone tidies the source link out of the footer to
 * clean it up, this suite is what says no.
 */

const REPO = 'https://github.com/nachi3d/Mogador-Chess-Club-Website';

test.describe('the GPL source link', () => {
  /**
   * Every page, not only the legal notice. The GPL's requirement is that the
   * source reach "the users of your website", and a reader who never opens the
   * legal page is still a user.
   */
  for (const path of ['/', '/en/', '/pieges/legal/', '/exercices/mat-du-couloir/'] as const) {
    test(`${path} links the source in the footer`, async ({ page }) => {
      await page.goto(path);
      const link = page.locator(`footer a[href="${REPO}"]`);
      await expect(link).toHaveCount(1);
      // Named so a reader can tell what it is without following it.
      await expect(link).toContainText(/GPL/);
    });
  }
});

test.describe('the legal notice', () => {
  for (const [locale, path, heading] of [
    ['fr', '/mentions-legales/', 'Mentions légales'],
    ['en', '/en/mentions-legales/', 'Legal notice'],
  ] as const) {
    test(`renders in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    });

    /**
     * CC BY-SA 3.0 requires the author's name and a link to the licence. Both,
     * on the page, in both languages.
     */
    test(`credits cburnett properly in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toContainText('Colin M. L. Burnett');
      await expect(page.locator('body')).toContainText('cburnett');
      await expect(
        page.locator('a[href="https://creativecommons.org/licenses/by-sa/3.0/"]'),
      ).toHaveCount(1);
    });

    test(`credits Chessground and names the GPL in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toContainText('Chessground');
      await expect(
        page.locator('a[href="https://github.com/lichess-org/chessground"]'),
      ).toHaveCount(1);
      await expect(page.locator('a[href="https://www.gnu.org/licenses/gpl-3.0.html"]')).not.toHaveCount(
        0,
      );
    });

    test(`names the publisher and the host in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toContainText('Nachi3D Labs');
      await expect(page.locator('body')).toContainText('Cloudflare');
    });

    test(`the footer "pieces" link lands on the credit in ${locale}`, async ({ page }) => {
      await page.goto(path);
      // The footer link points at #cburnett; the anchor has to exist or the
      // link silently drops the reader at the top of the page.
      await expect(page.locator('#cburnett')).toHaveCount(1);
    });
  }
});

test('the analytics note does not promise something we do not do', async ({ page }) => {
  await page.goto('/mentions-legales/');
  // The page says "no cookies"; the site must actually set none.
  const cookies = await page.context().cookies();
  expect(cookies, `unexpected cookies: ${JSON.stringify(cookies)}`).toEqual([]);
});

/**
 * The privacy posture the legal page states in words, asserted in behaviour.
 * `pwa.spec.ts` covers the home page; this covers the pages that came with the
 * board, which are the ones most likely to grow an embed later.
 */
test('no third-party requests from a board page', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(request.url());
  });

  await page.goto('/exercices/mat-du-couloir/');
  await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');

  expect(external, `unexpected third-party requests:\n${external.join('\n')}`).toEqual([]);
});

test.describe('accessibility', () => {
  for (const [name, path] of [
    ['legal FR', '/mentions-legales/'],
    ['legal EN', '/en/mentions-legales/'],
  ] as const) {
    test(`${name} has no axe violations`, async ({ page }: { page: Page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
