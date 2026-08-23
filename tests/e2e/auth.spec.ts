import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isSupabaseConfigured, loadE2EEnv } from './env';
import { createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_FLAG, atSiteRoot, followMagicLink, reachAccountPage } from './helpers/auth';
import { AUTH_ENABLED, AUTH_OFF_REASON, GOOGLE_AUTH_ENABLED } from './helpers/auth-mode';
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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ SECOND GATE, ADDED IN v0.3.0: `PUBLIC_AUTH_ENABLED`.
 *
 * Production ships with accounts OFF — the routes are not emitted at all. Every
 * describe below that navigates to `/connexion/` or `/compte/` therefore skips
 * VISIBLY in the default build, naming the flag in its reason. Without that
 * they would fail on a 404 and read as a regression, or worse, be quietly
 * deleted by someone tidying up.
 *
 * The GUEST specs are the exception and run in BOTH shapes. "A reader browsing
 * a lesson contacts no Supabase origin" is true of every build and is the rule
 * most easily broken, so it is never gated on anything.
 * ─────────────────────────────────────────────────────────────────────────
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

  /* ⚠️ Gated, unlike the six zero-request specs above. Those assert something
     true of EVERY build ("a reader browsing a lesson contacts no Supabase
     origin") and must never be skipped. These two assert the header CONTROL,
     which only exists when accounts are on — with the flag off there is no
     markup to find, and `auth-disabled.spec.ts` asserts that absence instead. */
  test('a guest header offers sign-in and never an account link', async ({ page }) => {
    test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
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
    test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
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
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
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
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
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

  /* ── The honeypot ──────────────────────────────────────────────────────── */

  /**
   * ⚠️ THE FIELD MUST BE INVISIBLE TO A HUMAN AND TO ASSISTIVE TECH ALIKE.
   *
   * A honeypot that a screen-reader user meets as a mystery input, or that a
   * keyboard user tabs into, has traded a real accessibility defect for a small
   * amount of bot noise. `aria-hidden` keeps it out of the accessibility tree
   * and `tabindex="-1"` out of the tab order; neither is what hides it visually,
   * which is deliberate — it is positioned off-screen rather than `display:
   * none`, because the scrapers worth catching skip what is explicitly hidden.
   */
  test('the honeypot is out of sight, out of the tab order and out of the a11y tree', async ({
    page,
  }) => {
    await page.goto('/connexion/');
    const hp = page.getByTestId('login-hp');

    /**
     * ⚠️ NOT `toBeHidden()`, AND THE REASON IS THE FEATURE. Playwright calls an
     * element hidden when it is `display: none`, `visibility: hidden` or has no
     * box — and this one deliberately has all three of those the other way
     * round, because a scraper worth catching skips a field the page has
     * explicitly hidden. It is pushed off-screen instead, so the honest
     * assertion is about its POSITION, not about Playwright's visibility model.
     */
    const box = await hp.boundingBox();
    expect(box, 'the honeypot has no box at all — it would be skipped by a bot').not.toBeNull();
    expect(box!.x + box!.width, 'the honeypot is on screen').toBeLessThan(0);

    await expect(hp).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.auth-hp')).toHaveAttribute('aria-hidden', 'true');

    /* Tabbing from the email field must reach the submit button, not the trap. */
    await page.getByTestId('login-email').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('login-submit')).toBeFocused();
  });

  /**
   * ⚠️ THE ONE BEHAVIOUR THAT MATTERS: IT FAILS VISIBLY AND CLEARS ITSELF.
   *
   * Standard honeypot advice is to fake success, which denies the bot its
   * signal — and leaves a parent whose password manager filled the field
   * waiting forever for an email that was never sent, while the page tells them
   * to check their inbox. On a site for a twenty-family club that trade goes the
   * other way: show the error, empty the field, and let the second press
   * through. A bot re-fills and loops; a human presses twice.
   *
   * ⚠️ AND NOTHING IS SENT ON THE REFUSED ATTEMPT — the "check your inbox" panel
   * must stay hidden, or the message is a lie in the other direction.
   */
  test('a filled honeypot is refused visibly, and the retry succeeds', async ({ page }) => {
    await page.goto('/connexion/');
    await page.getByTestId('login-email').fill('parent@example.test');
    /* Filled the way a password manager would — the element is off-screen, so a
       real click is not available and is not what is being simulated. */
    await page.getByTestId('login-hp').evaluate((el) => {
      (el as HTMLInputElement).value = 'https://spam.example';
    });
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page.getByTestId('login-sent'), 'a refused attempt claimed to have sent a link').toBeHidden();
    /* ⚠️ CLEARED — this is what makes the second press work for a human. */
    await expect(page.getByTestId('login-hp')).toHaveValue('');
  });
});

test.describe('signed in', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!configured, 'no .env.test — see .env.test.example (visible skip, not silent)');

  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /** Sign in by following an admin-minted magic link, as a browser would. */
  async function signIn(page: Page, email: string) {
    await followMagicLink(page, email);
    await reachAccountPage(page);
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
    await page.waitForURL(atSiteRoot, { timeout: 15_000 });

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
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
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

/* ═══ Google sign-in — the FLAG, which is what production ships ══════════ */

/**
 * ⚠️⚠️ THE DEFAULT SHAPE IS "NO BUTTON", AND THAT IS THE ONE UNDER TEST HERE.
 *
 * Google sign-in needs the provider switched on in the Supabase dashboard and
 * an OAuth client in Google Cloud with this origin in its redirect list.
 * NEITHER LIVES IN THIS REPOSITORY, so nothing in a build can check them. A
 * button shipped ahead of that configuration is present, looks live, and fails
 * when pressed — Critical Feature 76 wearing a different hat, and worse than
 * the hydration case it was written for, because that one resolves on its own
 * after a second and this one never does. `disabled` would be a lie too: it
 * says "not yet", and without the configuration there is no "yet".
 *
 * So the button is ABSENT until `PUBLIC_GOOGLE_AUTH_ENABLED=true`, and this
 * asserts the absence rather than the presence — the presence is proved by the
 * build that turns it on, in the same way `auth-disabled.spec.ts` proves the
 * accounts-OFF artefact.
 *
 * ⚠️ AND THE MAGIC LINK MUST SURVIVE IT. The failure this would most plausibly
 * ship is a Google button that quietly replaces the email form rather than
 * joining it — leaving every reader without a Google account locked out of a
 * site that had been letting them in.
 */
test.describe('Google sign-in is behind its own flag', () => {
  /**
   * ⚠️ BOTH SHAPES ARE ASSERTED, RATHER THAN ONE PLUS A SPEED BUMP.
   *
   * The first version of this asserted absence unconditionally. It was watched
   * to fail correctly against a flag-on build (`Expected: 0 / Received: 1`) —
   * and that is precisely the problem: it would have gone red on the day
   * somebody enabled the feature, which trains a person to edit the test rather
   * than read it. Gated on the same flag the build reads, it proves the right
   * thing in either shape and is never in the way.
   */
  test('the button matches the build shape — absent when off, present when on', async ({
    page,
  }) => {
    await page.goto('/connexion/');

    const button = page.getByTestId('login-google');
    const separator = page.getByTestId('login-or');
    const note = page.getByTestId('login-google-note');

    if (GOOGLE_AUTH_ENABLED) {
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      /* Two ways in must read as alternatives, not as steps. */
      await expect(separator).toBeVisible();

      /**
       * ⚠️ THE SAME-ADDRESS NOTE TRAVELS WITH THE BUTTON, AND IT IS NOT
       * DECORATION.
       *
       * Automatic linking keys on the email address. Without this line a
       * reader who signed up as one address and presses Google while signed
       * into another silently gets a second account with an empty ledger,
       * while their real progress — a child's points and attendance — sits
       * intact and invisible on the first. It looks like data loss and is not,
       * which is precisely why nothing else on the page would tell them.
       *
       * ⚠️ ASSERTED VISIBLE, NOT MERELY PRESENT: a note the reader cannot see
       * before pressing prevents nothing, and it is the only thing standing
       * between the button and the fork until the detection work lands.
       */
      await expect(note).toBeVisible();
      await expect(note).not.toBeEmpty();
    } else {
      /* Absent, not hidden: a hidden control is still in the DOM for a script
         or a determined reader to reach, and this one cannot work. */
      await expect(button).toHaveCount(0);
      await expect(separator).toHaveCount(0);
      /* And the note goes with it — a warning about a button that is not there
         is noise on the page every reader actually sees today. */
      await expect(note).toHaveCount(0);
    }
  });

  test('the email magic link is untouched by it', async ({ page }) => {
    await page.goto('/connexion/');

    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeEnabled();
  });
});
