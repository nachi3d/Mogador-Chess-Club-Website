import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isSupabaseConfigured } from './env';
import { settleReveals } from './helpers/reveal';

/**
 * /agenda — the public session list, now baked from the database.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THESE RUN IN BOTH FLAG STATES, AND THAT IS THE POINT.
 *
 * The agenda is PUBLIC. Its whole design constraint is that it must work
 * identically for an anonymous visitor on a build with no accounts in it —
 * which is what production ships. A spec gated on `PUBLIC_AUTH_ENABLED` would
 * skip in exactly the shape the feature has to hold in.
 *
 * ⚠️ THE ZERO-REQUEST ASSERTION IS THE LOAD-BEARING ONE. The reason the list is
 * baked rather than fetched is Critical Feature 9 — no third-party request
 * without an explicit reader click — and the obvious "fix" a future session
 * will reach for is a client-side read. This is what says no.
 * ═════════════════════════════════════════════════════════════════════════
 */

function isThirdParty(url: string): boolean {
  return !url.startsWith('http://localhost:') && !url.startsWith('data:') && !url.startsWith('blob:');
}

test.describe('the public agenda', () => {
  for (const path of ['/agenda/', '/en/agenda/']) {
    test(`${path} renders sessions with no third-party request at all`, async ({ page }) => {
      const hits: string[] = [];
      page.on('request', (r) => {
        if (isThirdParty(r.url())) hits.push(r.url());
      });

      await page.goto(path);
      /* The list, not merely the page: an empty agenda would satisfy a
         zero-request assertion perfectly. */
      const sessions = page.locator('.sessions .session');
      expect(await sessions.count(), 'the agenda rendered no sessions at all').toBeGreaterThan(0);

      await page.waitForLoadState('networkidle');
      expect(
        hits,
        `the public agenda contacted a third party:\n${hits.join('\n')}`,
      ).toEqual([]);
    });
  }

  /**
   * ⚠️ THE MIGRATED ENTRY. `src/content/agenda/2026-09-12.json` was the whole
   * git collection; migration 0006 inserted it with a FIXED uuid so the
   * committed fallback and the database agree. If this fails, either the
   * migration did not run or the fallback was edited — both of which would take
   * a real session off the public site.
   */
  test('the session migrated out of the git collection is still published', async ({ page }) => {
    await page.goto('/agenda/');
    const migrated = page.locator('.session', { hasText: 'ouverture de la saison' });
    await expect(migrated).toHaveCount(1);
    await expect(migrated.locator('time')).toHaveAttribute('datetime', '2026-09-12');
    /* 16:00 LOCAL. The row is stored as an instant; a build that resolved it in
       the build machine's zone rather than the club's would print 15:00 here,
       and nothing else on the page would look wrong. */
    await expect(migrated.locator('.session-time')).toHaveText('16:00');
  });

  test('the English agenda carries the English note', async ({ page }) => {
    await page.goto('/en/agenda/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.session', { hasText: 'Season opening session' })).toHaveCount(1);
  });

  /**
   * ⚠️ A CANCELLED SESSION STAYS VISIBLE, WITH ITS STATE (Critical Feature 46's
   * public half). Migration 0006 widened the select policy for exactly this;
   * before it, a cancelled session survived in the table and vanished from
   * every surface a student could reach.
   *
   * The fixture is the RENDERED page rather than a live row, because this spec
   * must run in a build with no accounts and no Supabase client. Driving it
   * from the database would make it skip in production's shape.
   */
  test('a cancelled session renders as cancelled, in words', async ({ page }) => {
    /* ⚠️ NOT "skip if none found" — that is the vacuous pass this project has
       been bitten by, and it would read as coverage forever. The fixture is
       SEEDED (`seed-test.mjs`, a future cancelled session), so the only honest
       reason to skip is a build that had no project to read at all. */
    test.skip(
      !isSupabaseConfigured(),
      'no .env.test — the build used the committed fallback, which holds no cancelled session. ' +
        'Run `node supabase/seed/seed-test.mjs` and rebuild to exercise this.',
    );

    await page.goto('/agenda/');
    /* ⚠️ The session cards opt into reveals, so every one of them sits at
       `opacity: 0` until scrolled to. Measuring the opacity below without
       settling first reads the REVEAL and reports it as a dimmed card — the
       same trap that makes axe flake on index pages. */
    await settleReveals(page);
    const cancelled = page.locator('.session[data-status="cancelled"]');
    await expect(
      cancelled,
      'no cancelled session on the agenda — is the seed applied, and did 0006 widen the ' +
        'select policy? Before 0006 a cancelled session vanished from every public surface.',
    ).not.toHaveCount(0);

    /* Never opacity and never a strikethrough: the state has to survive being
       read aloud, and `check-contrast` cannot see an alpha laid over a proved
       pair. */
    await expect(cancelled.first().locator('.session-cancelled-tag')).toBeVisible();

    /**
     * ⚠️ COMPARED WITH A LIVE SESSION, NOT WITH THE LITERAL `1`.
     *
     * Every card carries `data-reveal`, so its opacity is a transition that
     * settles asymptotically — an exact check read `0.999775` and reported a
     * dimmed card that was not dimmed. The property under test is relative
     * anyway: a cancelled session must not be quieter than a live one.
     */
    const alpha = (loc: ReturnType<typeof page.locator>) =>
      loc.first().evaluate((el) => Number(getComputedStyle(el).opacity));
    const [cancelledAlpha, publishedAlpha] = await Promise.all([
      alpha(cancelled),
      alpha(page.locator('.session[data-status="published"]')),
    ]);
    expect(
      cancelledAlpha,
      'a cancelled session is dimmed rather than labelled',
    ).toBeGreaterThanOrEqual(publishedAlpha);
    /* And no strikethrough — read aloud, it would say nothing at all. */
    const decoration = await cancelled
      .first()
      .locator('.session-when time')
      .evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(decoration, 'the date is struck through rather than labelled').toBe('none');
  });

  /**
   * ⚠️ A DRAFT IS NOT PUBLIC. The bake asks for `status=in.(published,cancelled)`
   * and the policy allows only those two — belt and braces, because a draft
   * leaking here is an unannounced session published by accident, and it would
   * look completely normal on the page.
   */
  test('a draft session never reaches the public agenda', async ({ page }) => {
    test.skip(!isSupabaseConfigured(), 'no .env.test — no seeded draft to check against');
    await page.goto('/agenda/');
    await expect(page.locator('.session[data-status="draft"]')).toHaveCount(0);
    await expect(page.locator('.session', { hasText: 'Finales de tours' })).toHaveCount(0);
  });

  test('no board island is mounted on the agenda', async ({ page }) => {
    await page.goto('/agenda/');
    await expect(page.locator('astro-island')).toHaveCount(0);
    await expect(page.locator('cg-board')).toHaveCount(0);
  });

  for (const path of ['/agenda/', '/en/agenda/']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      /* The session list opts into reveals, so its cards sit at opacity 0 until
         scrolled to — transparent text axe can still find. */
      await settleReveals(page);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
