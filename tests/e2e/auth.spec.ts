import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isSupabaseConfigured, loadE2EEnv } from './env';
import { createConfirmedUser, deleteUser, e2eEmail, magicLinkFor } from './helpers/supabase-admin';
import { AUTH_FLAG } from './helpers/auth';
import { settleReveals } from './helpers/reveal';

/**
 * v2-S1 — email magic link, profiles, RLS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THE KNOWN GAP, STATED RATHER THAN HIDDEN.
 *
 * Nothing here proves that Supabase's mailer DELIVERS. Users are created and
 * links minted through the admin API, so the flow under test starts at "the
 * link resolves" and ends at "the reader is signed in". Delivery, the email
 * template, and a link opened from a real inbox are covered by a MANUAL check
 * in docs/MANUAL-TESTS.md before any release.
 *
 * This is written down because a suite that appears to cover email and does not
 * is worse than one that admits it. It is NOT a silent skip.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Specs needing a project are gated on `isSupabaseConfigured()` and skip
 * VISIBLY with a reason. The guest and a11y specs below need nothing and always
 * run — which matters, because the guest zero-request rule is the one this
 * session is most likely to break.
 */

const configured = isSupabaseConfigured();

/** Any request that looks like Supabase, whether or not a project is configured. */
function isSupabaseRequest(url: string): boolean {
  return /supabase\.(co|in)|supabase-js/i.test(url);
}

test.describe('guest — zero Supabase requests', () => {
  /**
   * ⚠️ THE RULE THIS SESSION MOST EASILY BREAKS.
   *
   * One static `import` from a shared component to `@lib/supabase` and Vite
   * hoists the client into every page's chunk graph. A reader browsing a lesson
   * on Essaouira mobile data would then download ~30 KB of auth client to look
   * at a chessboard.
   *
   * Asserted against the NETWORK LOG, not against the bundle, so it holds
   * regardless of how the chunking changes.
   */
  for (const path of ['/', '/cours/', '/pieges/', '/pieges/legal/', '/exercices/', '/jouer/']) {
    test(`${path} contacts no Supabase origin and loads no client`, async ({ page }) => {
      const hits: string[] = [];
      page.on('request', (r) => {
        if (isSupabaseRequest(r.url())) hits.push(r.url());
      });

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      expect(hits, `guest page ${path} touched Supabase:\n${hits.join('\n')}`).toEqual([]);
    });
  }

  test('a guest header offers sign-in and never an account link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('header-sign-in')).toBeVisible();
    await expect(page.getByTestId('header-account')).toBeHidden();
  });

  /**
   * The flag is what the header reads INSTEAD of loading the client. Driving it
   * directly is deliberate: it is the contract between `auth-flag.ts` and the
   * duplicated key in `AccountButton.astro`, and a divergence must fail here.
   */
  test('the local flag alone flips the header, with no Supabase request', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => {
      if (isSupabaseRequest(r.url())) hits.push(r.url());
    });

    await page.goto('/');
    await page.evaluate((key) => window.localStorage.setItem(key, '1'), AUTH_FLAG);
    await page.reload();

    await expect(page.getByTestId('header-account')).toBeVisible();
    await expect(page.getByTestId('header-sign-in')).toBeHidden();
    expect(hits, 'showing the account link cost a Supabase request').toEqual([]);
  });
});

test.describe('the build under test', () => {
  /**
   * ⚠️ THE SITE UNDER TEST MUST CARRY TEST CREDENTIALS, NOT PRODUCTION ONES.
   *
   * `PUBLIC_*` values are baked into the bundle at build time from `.env.local`,
   * which holds PRODUCTION because that is what a deploy needs. The webServer in
   * `playwright.config.ts` overrides them; this asserts the override actually
   * took, by reading the built JavaScript rather than trusting the mechanism.
   *
   * Without it, a future spec that signs in through the UI would create a real
   * account in the live database — and `assertNotProduction()` would not catch
   * it, because that guard inspects `.env.test` and knows nothing about what the
   * build embedded.
   */
  test('the built bundle carries the TEST project ref, never production', async () => {
    test.skip(!configured, 'no .env.test — nothing to compare against');

    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const env = loadE2EEnv();
    const dir = 'dist/_astro';

    const bundles = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));
    expect(bundles.length, 'no built JS found — was the site built?').toBeGreaterThan(0);

    const withTest = bundles.filter((b) => b.text.includes(env!.testRef)).map((b) => b.name);
    const withProd = bundles.filter((b) => b.text.includes(env!.productionRef)).map((b) => b.name);

    expect(
      withProd,
      `the PRODUCTION ref "${env!.productionRef}" is baked into: ${withProd.join(', ')}`,
    ).toEqual([]);
    expect(
      withTest.length,
      `the TEST ref "${env!.testRef}" is in no bundle — the webServer override did not apply`,
    ).toBeGreaterThan(0);
  });
});

test.describe('the sign-in page', () => {
  test('renders a form and asks for nothing until submitted', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => {
      if (isSupabaseRequest(r.url())) hits.push(r.url());
    });

    await page.goto('/connexion/');
    await expect(page.getByTestId('login-email')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(hits, 'opening the sign-in page already talked to Supabase').toEqual([]);
  });

  test('an obviously invalid address is refused locally', async ({ page }) => {
    await page.goto('/connexion/');
    await page.getByTestId('login-email').fill('not-an-email');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toBeVisible();
    // Still on the form; nothing was sent.
    await expect(page.getByTestId('login-sent')).toBeHidden();
  });

  test('the English page exists and is in English', async ({ page }) => {
    await page.goto('/en/connexion/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('login-submit')).toHaveText(/Send the link/i);
  });
});

test.describe('signed in', () => {
  test.skip(!configured, 'no .env.test — see .env.test.example (visible skip, not silent)');

  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /** Sign in by following an admin-minted magic link, as a browser would. */
  async function signIn(page: Page, email: string) {
    const link = await magicLinkFor(email);
    await page.goto(link);
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });
  }

  test('signup creates a profile via the trigger, with a clamped locale', async () => {
    const email = e2eEmail('trigger');
    const user = await createConfirmedUser({
      email,
      displayName: 'Sara',
      /* ⚠️ The exact shape a Google claim arrives in. Written through verbatim
         it violates the CHECK constraint and the whole signup fails. */
      locale: 'en-GB',
    });
    created.push(user.id);

    const { adminClient } = await import('./helpers/supabase-admin');
    const { data, error } = await adminClient()
      .from('profiles')
      .select('id, role, display_name, locale')
      .eq('id', user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.role).toBe('eleve');
    expect(data?.display_name).toBe('Sara');
    expect(data?.locale, 'en-GB must be clamped to en, not stored verbatim').toBe('en');
  });

  test('a display name falls back to the email local part', async () => {
    const email = e2eEmail('fallback');
    const user = await createConfirmedUser({ email });
    created.push(user.id);

    const { adminClient } = await import('./helpers/supabase-admin');
    const { data } = await adminClient()
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    expect(data?.display_name).toBe(email.split('@')[0]);
    expect(data?.display_name, 'the full email must never become the display name').not.toContain(
      '@',
    );
  });

  test('the header shows the account link and the state survives a reload', async ({ page }) => {
    const email = e2eEmail('session');
    const user = await createConfirmedUser({ email, displayName: 'Omar' });
    created.push(user.id);

    await signIn(page, email);
    await expect(page.getByTestId('header-account')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('header-account')).toBeVisible();
    await expect(page.getByTestId('account')).toHaveAttribute('data-state', 'signed-in');
  });

  test('signing out clears the session AND the flag', async ({ page }) => {
    const email = e2eEmail('signout');
    const user = await createConfirmedUser({ email, displayName: 'Sara' });
    created.push(user.id);

    await signIn(page, email);
    await page.getByTestId('account-signout').click();
    await page.waitForURL(/\/(en\/)?$/, { timeout: 15_000 });

    const flag = await page.evaluate((key) => window.localStorage.getItem(key), AUTH_FLAG);
    expect(flag, 'the auth flag survived sign-out — the header would keep lying').toBeNull();
    await expect(page.getByTestId('header-sign-in')).toBeVisible();
  });

  /**
   * ⚠️ THE PRIVILEGE-ESCALATION TEST. This is the one that matters.
   *
   * The client is untrusted by design and the anon key is public, so "the UI
   * does not offer it" is worth nothing. A reader with devtools can call
   * PostgREST directly. Column-level GRANTs plus a trigger must refuse.
   */
  test('a client cannot promote itself to admin', async () => {
    const email = e2eEmail('escalate');
    const user = await createConfirmedUser({ email, displayName: 'Sara' });
    created.push(user.id);

    /* An anon-key client holding this user's own session — precisely what a
       reader with devtools has. No UI is involved, so "the form did not offer
       it" cannot make this pass. */
    const { anonClientAsUser } = await import('./helpers/auth');
    const sb = await anonClientAsUser(email);

    const { error } = await sb.from('profiles').update({ role: 'admin' }).eq('id', user.id);

    /* The write must be refused. Column-level GRANTs make PostgREST reject the
       column outright; the trigger is the second line if a grant is ever
       widened by accident. Either way there must be an error. */
    expect(error, 'PostgREST accepted a role update from an ordinary client').not.toBeNull();

    /* And the stored truth must be unchanged — read back with the service role,
       because the anon client's own view could itself be filtered. */
    const { adminClient } = await import('./helpers/supabase-admin');
    const { data } = await adminClient()
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    expect(data?.role, `role became ${data?.role} — privilege escalation is possible`).toBe(
      'eleve',
    );
  });

  test('a student cannot read another student’s profile', async () => {
    const mineEmail = e2eEmail('rls-self');
    const otherEmail = e2eEmail('rls-other');
    const mine = await createConfirmedUser({ email: mineEmail, displayName: 'Sara' });
    const other = await createConfirmedUser({ email: otherEmail, displayName: 'Omar' });
    created.push(mine.id, other.id);

    const { anonClientAsUser } = await import('./helpers/auth');
    const sb = await anonClientAsUser(mineEmail);

    const { data } = await sb.from('profiles').select('id').eq('id', other.id);
    /* RLS filters rather than errors: the row is simply not visible. An empty
       result is the pass; a row would mean every child's record is readable by
       every other child. */
    expect(data ?? [], 'another student’s profile was visible').toEqual([]);
  });
});

test.describe('auth — accessibility', () => {
  for (const path of ['/connexion/', '/en/connexion/', '/compte/', '/en/compte/']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  for (const path of ['/politique-confidentialite/', '/en/politique-confidentialite/']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      /* The privacy page opts into reveals, so its below-fold sections sit at
         opacity 0 until scrolled to. A single scrollTo is not enough — the
         transition has to finish too, or axe measures half-faded text. Same
         trap as the index pages; see tests/e2e/helpers/reveal.ts. */
      await settleReveals(page);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
