import { test, expect } from '@playwright/test';
import { settleReveals } from './helpers/reveal';

/**
 * THE INDEX RULE: a card that renders must have a destination.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ AN INDEX ENTRY WITH NO href IS A BUG, NOT A STATE.
 *
 * `/cours/` shipped a card — "Les bases : le plateau et les pièces" — that a
 * reader could not open. It carried the full card surface, the title, the
 * summary and the level badge, and clicking it did nothing, because the course
 * had no lesson pages and `CardItem.href` was optional.
 *
 * That is worse than the card being absent. An absent card tells the reader
 * nothing is there; a present, inert one tells them the site is broken — and
 * it is invisible to every other kind of test, because nothing is *missing*
 * from the page. It is only visible as an absence of behaviour.
 *
 * `CardItem.href` is now required, so the state cannot be constructed. This
 * spec is the other half: the type binds `CardGrid`'s callers, and this binds
 * what a reader can actually click. Both, because a future index that draws
 * its own markup rather than going through `CardGrid` would satisfy the type
 * and still be able to reintroduce the bug.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ IT ASSERTS THE LINK RESOLVES, NOT MERELY THAT AN href EXISTS. Pointing a
 * dead-end card at a 404 would satisfy "has a destination" while being no
 * better for the reader than the bug it replaced.
 */

const INDEXES = [
  '/cours/',
  '/pieges/',
  '/exercices/',
  '/en/cours/',
  '/en/pieges/',
  '/en/exercices/',
] as const;

for (const index of INDEXES) {
  test.describe(`index cards — ${index}`, () => {
    test('every card has a destination', async ({ page }) => {
      await page.goto(index);
      await settleReveals(page);

      const cards = page.locator('.card-grid > .card');
      const count = await cards.count();

      /* An index with no cards at all would pass every assertion below
         vacuously, which is exactly how this class of bug survives. */
      expect(count, `${index} rendered no cards`).toBeGreaterThan(0);

      for (let i = 0; i < count; i += 1) {
        const card = cards.nth(i);
        const title = (await card.locator('.card-head h2').innerText()).trim();
        const link = card.locator('a.card-link');

        await expect(link, `"${title}" on ${index} is not a link`).toHaveCount(1);

        const href = await link.getAttribute('href');
        expect(href, `"${title}" on ${index} has an empty href`).toBeTruthy();
      }
    });

    test('every card destination resolves', async ({ page, request }) => {
      await page.goto(index);
      await settleReveals(page);

      const links = page.locator('.card-grid > .card a.card-link');
      const hrefs = await links.evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLAnchorElement).href),
      );
      expect(hrefs.length).toBeGreaterThan(0);

      for (const href of hrefs) {
        const response = await request.get(href);
        expect(response.status(), `${href} (linked from ${index})`).toBe(200);
      }
    });
  });
}

/**
 * The `/cours/` case that produced the rule, pinned by name.
 *
 * The tutorial IS this content — the board, how each piece moves, castling, en
 * passant, promotion, which is precisely the thirteen steps of
 * `/apprendre-les-bases/`. It is reached from the top of `/cours/` as the named
 * prerequisite, and it must not ALSO appear as a course card: one destination
 * under two names on one page is the thing the E5 label rule forbids.
 */
test.describe('/cours/ — the tutorial is the prerequisite, not a course card', () => {
  for (const [locale, index, tutorial] of [
    ['fr', '/cours/', '/apprendre-les-bases/'],
    ['en', '/en/cours/', '/en/apprendre-les-bases/'],
  ] as const) {
    test(`${locale}: linked once, from the prerequisite line`, async ({ page }) => {
      await page.goto(index);
      await settleReveals(page);

      const prerequisite = page.getByTestId('cours-tutorial-link');
      await expect(prerequisite).toHaveAttribute('href', tutorial);

      /* No card may point at the tutorial — that would be the same destination
         twice on one page, under two different names. */
      await expect(page.locator(`.card-grid a.card-link[href="${tutorial}"]`)).toHaveCount(0);

      /* And the dead card itself is gone rather than merely unlinked. */
      await expect(page.locator('.card-grid')).not.toContainText('le plateau et les pièces');
      await expect(page.locator('.card-grid')).not.toContainText('the board and the pieces');
    });
  }
});
