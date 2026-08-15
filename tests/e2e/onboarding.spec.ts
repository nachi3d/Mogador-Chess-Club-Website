import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isSupabaseConfigured } from './env';
import {
  adminClient,
  createConfirmedUser,
  deleteUser,
  e2eEmail,
} from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { followMagicLink, waitForSignedInUrl } from './helpers/auth';

/**
 * `/bienvenue/` — the first-run screen.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE CLAIMS THIS FILE EXISTS TO KEEP HONEST, all of which are easy to write
 * and easy to break silently:
 *
 *   1. IT FIRES AT ALL. This is not a hypothetical: v0.13.0 built the whole
 *      screen and a real first sign-in on production never saw it, because the
 *      release was never deployed. A spec cannot catch an undeployed build — but
 *      it can make sure the branch itself is exercised on a genuinely new
 *      account rather than assumed, which is what every test here does.
 *   2. It is shown ONCE — and "once" means per ACCOUNT, not per browser. The
 *      bookmark case would rot first: a parent who returns to the URL must be
 *      sent away, not re-guided.
 *   3. EACH OF THE THREE ANSWERS PRODUCES THE RIGHT VOCABULARY afterwards. That
 *      is the entire reason the question is asked instead of inferred, so an
 *      answer that saved correctly and then read as somebody else's account
 *      would defeat the feature while passing every write assertion.
 *   4. SKIPPING LEAVES A USABLE ACCOUNT. Guidance, not a gate.
 *   5. THE PLACEHOLDER IS NOT PRE-FILLED. `handle_new_user()` seeds
 *      `display_name` from the email local part and `resolveChild()` copies it
 *      into the first profile, so a brand-new account contains a player called
 *      `mcc-e2e-…`. Prefilling that string invites a parent to press Save and
 *      ship it to the attendance sheet.
 *
 * ⚠️ EVERY TEST MINTS ITS OWN ACCOUNT. They all mutate `onboarded_at`, the
 * stored answer and the roster they assert on, and `fullyParallel` is free to
 * interleave them.
 *
 * ⚠️ THE ASSERTIONS ARE AGAINST THE DATABASE WHERE IT MATTERS, not against the
 * painting of it. A screen that renames a profile in the DOM and never writes
 * the row would pass every visual check here.
 * ═════════════════════════════════════════════════════════════════════════
 */
test.describe('first-run onboarding', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');

  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /**
   * A brand-new account, exactly as a real sign-up produces it: confirmed, no
   * child rows, `onboarded_at` null, `account_shape` null.
   *
   * ⚠️ `displayName` IS LEFT UNSET ON PURPOSE for the placeholder tests, so the
   * trigger falls through to the email local part — which is the state the
   * screen is built around. Passing a name here would quietly test the easy
   * branch and never the one that matters.
   */
  async function freshAccount(label: string, displayName?: string) {
    const email = e2eEmail(label);
    const user = await createConfirmedUser(displayName ? { email, displayName } : { email });
    created.push(user.id);
    return { ...user, email, localPart: email.split('@')[0]! };
  }

  async function follow(page: Page, email: string) {
    await followMagicLink(page, email);
  }

  /** The roster as the database holds it: name plus the holder flag. */
  async function storedProfiles(accountId: string): Promise<{ name: string; self: boolean }[]> {
    const { data } = await adminClient()
      .from('child_profiles')
      .select('display_name,is_self')
      .eq('account_id', accountId)
      .order('created_at');
    return (data ?? []).map((row) => ({
      name: String(row['display_name']),
      self: row['is_self'] === true,
    }));
  }

  async function storedNames(accountId: string): Promise<string[]> {
    return (await storedProfiles(accountId)).map((row) => row.name);
  }

  async function profileRow(accountId: string) {
    const { data } = await adminClient()
      .from('profiles')
      .select('onboarded_at,account_shape,display_name')
      .eq('id', accountId)
      .single();
    return {
      onboardedAt: (data?.['onboarded_at'] as string | null) ?? null,
      shape: (data?.['account_shape'] as string | null) ?? null,
      displayName: (data?.['display_name'] as string | null) ?? null,
    };
  }

  /** Land on the welcome screen and answer step one. */
  async function answer(page: Page, email: string, which: 'self' | 'children' | 'both') {
    await follow(page, email);
    await waitForSignedInUrl(page, /\/bienvenue\//);
    await expect(page.getByTestId('welcome-question')).toBeVisible();
    await page.getByTestId(`welcome-who-${which}`).click();
    await expect(page.getByTestId('welcome-form')).toBeVisible();
  }

  /* ── 1. The landing rule ───────────────────────────────────────────────── */

  /**
   * ⚠️ THE WHOLE FEATURE IN ONE ASSERTION. Before v0.13.0 the callback sent
   * every sign-in to `/compte/`, where nothing ever suggested the auto-named
   * profile could be renamed.
   */
  test('shown once per ACCOUNT — the callback, the bookmark, and a later sign-in', async ({
    page,
  }) => {
    const account = await freshAccount('onb-first');

    await follow(page, account.email);
    await waitForSignedInUrl(page, /\/bienvenue\//);
    /* The QUESTION first — not the name fields. Step one is the feature. */
    await expect(page.getByTestId('welcome-question')).toBeVisible();
    await expect(page.getByTestId('welcome-form')).toBeHidden();

    /* Dismiss, which is the cheapest way to reach the "already guided" state. */
    await page.getByTestId('welcome-skip').click();
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);
    const after = await profileRow(account.id);
    expect(after.onboardedAt, 'skipping did not record the visit').not.toBeNull();
    /* ⚠️ AND SKIPPING IS NOT AN ANSWER. Recording one would manufacture a claim
       the reader never made, and `/compte/` would then address them as
       something they never said they were. */
    expect(after.shape, 'skipping invented an answer').toBeNull();

    /* ⚠️ THE BOOKMARK CASE, WHICH THE CALLBACK'S REDIRECT DOES NOT COVER.
       "Never shown again" has to be true of the URL itself, or a parent who
       saved the page during signup is walked through naming an already-named
       profile. Asserted on this account rather than on a second one: every
       extra account is another magic-link verification against a rate limit
       the suite genuinely reaches — see `waitForSignedInUrl`. */
    await page.goto('/bienvenue/');
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);
    await expect(page.getByTestId('account-panel')).toBeVisible();

    /* And a SECOND sign-in goes straight there too — the callback's branch, as
       opposed to the welcome screen's own. */
    await follow(page, account.email);
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);
    await expect(page.getByTestId('account-panel')).toBeVisible();
    expect(page.url()).not.toContain('/bienvenue/');
  });

  /* ── 2. The three answers ──────────────────────────────────────────────── */

  /**
   * ⚠️ "MOI, JE JOUE" — the case v0.13.0 could not express at all. The account
   * holder is a learner, their own profile is flagged, and `/compte/` addresses
   * them in the first person rather than about their children.
   */
  test('“Moi, je joue” names the holder’s own profile and says so', async ({ page }) => {
    const account = await freshAccount('onb-self');

    /* ⚠️ THE WRONG ANSWER FIRST, ON PURPOSE. A mis-tap on step one is one
       thumb-width away, and without "Changer de réponse" the only escape is
       skipping — which silently records "we asked and they declined". Driving
       the recovery here rather than in a test of its own keeps the account
       count down; see `waitForSignedInUrl` for why that matters. */
    await answer(page, account.email, 'children');
    await expect(page.getByTestId('welcome-child-section')).toBeVisible();
    await page.getByTestId('welcome-back').click();
    await expect(page.getByTestId('welcome-question')).toBeVisible();
    await expect(page.getByTestId('welcome-form')).toBeHidden();

    await page.getByTestId('welcome-who-self').click();
    /* Only the "your name" step — no child fields to wade through. */
    await expect(page.getByTestId('welcome-self-section')).toBeVisible();
    await expect(page.getByTestId('welcome-child-section')).toBeHidden();

    await page.getByTestId('welcome-self-name').fill('Seàn');
    await page.getByTestId('welcome-save').click();
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);

    await expect
      .poll(() => storedProfiles(account.id), { timeout: 15_000 })
      .toEqual([{ name: 'Seàn', self: true }]);

    const row = await profileRow(account.id);
    expect(row.shape).toBe('self');
    /* ⚠️ THE HOLDER'S OWN NAME IS ALSO THEIR ACCOUNT NAME. Somebody who said
       "moi, je joue" told us their first name; leaving the email fragment in
       `profiles.display_name` puts it straight back in front of them. */
    expect(row.displayName).toBe('Seàn');

    /* And the vocabulary follows — first person, no mention of children. */
    await expect(page.getByTestId('profiles-heading')).toHaveText(/votre profil/i);
    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'self');
    await expect(page.getByTestId('child-you')).toBeVisible();
  });

  test('“Mon enfant” names the child, and flags nobody as the holder', async ({ page }) => {
    const account = await freshAccount('onb-child');

    await answer(page, account.email, 'children');
    await expect(page.getByTestId('welcome-child-section')).toBeVisible();
    await expect(page.getByTestId('welcome-self-section')).toBeHidden();

    await page.getByTestId('welcome-name-0').fill('Imane');
    await page.getByTestId('welcome-save').click();
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);

    await expect
      .poll(() => storedProfiles(account.id), { timeout: 15_000 })
      .toEqual([{ name: 'Imane', self: false }]);
    expect((await profileRow(account.id)).shape).toBe('children');

    await expect(page.getByTestId('profiles-heading')).toHaveText(/vos enfants|your children/i);
    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'children');
    /* Nobody is "you" — the holder does not play on this account. */
    await expect(page.getByTestId('child-you')).toHaveCount(0);
  });

  /**
   * ⚠️ "LES DEUX" IS THE TYPICAL CASE, NOT AN EDGE CASE — a parent who comes to
   * the workshop with two children and plays as well. The auto-created profile
   * becomes THEIRS and every child is a new row, which is the ordering that
   * makes the parent's own progress survive.
   */
  test('“Les deux” gives the holder a profile alongside their children', async ({ page }) => {
    const account = await freshAccount('onb-both');

    await answer(page, account.email, 'both');
    await expect(page.getByTestId('welcome-self-section')).toBeVisible();
    await expect(page.getByTestId('welcome-child-section')).toBeVisible();

    await page.getByTestId('welcome-self-name').fill('Karim');
    await page.getByTestId('welcome-name-0').fill('Omar');
    await page.getByTestId('welcome-add-another').click();
    await expect(page.getByTestId('welcome-slot-1')).toBeVisible();
    await page.getByTestId('welcome-name-1').fill('Lina');
    await page.getByTestId('welcome-save').click();
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);

    await expect
      .poll(() => storedProfiles(account.id), { timeout: 15_000 })
      .toEqual([
        { name: 'Karim', self: true },
        { name: 'Omar', self: false },
        { name: 'Lina', self: false },
      ]);
    expect((await profileRow(account.id)).shape).toBe('both');

    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'both');
    await expect(page.getByTestId('child-you')).toHaveCount(1);
    /* Three profiles means the picker has something to ask. */
    await expect(page.getByTestId('child-picker')).toBeVisible();
  });

  /* ── 3. Skipping leaves a usable account ───────────────────────────────── */

  /**
   * ⚠️ "GUIDANCE, NOT A GATE" IS A CLAIM ABOUT WHAT IS LEFT BEHIND. A skipped
   * onboarding must leave exactly the account a completed one would, minus the
   * names — including the add form, which was unreachable for every real account
   * for two releases and is the regression this site has already shipped once.
   */
  test('a skipped onboarding leaves a fully usable account', async ({ page }) => {
    const account = await freshAccount('onb-skip');

    await follow(page, account.email);
    await waitForSignedInUrl(page, /\/bienvenue\//);
    await page.getByTestId('welcome-skip').click();
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);

    /* The profiles block renders, and the add form is reachable and works. */
    await expect(page.getByTestId('family')).toBeVisible();
    await page.getByTestId('child-name').fill('Rania');
    await page.getByTestId('child-add-submit').click();
    await expect(page.getByTestId('child-roster')).toContainText('Rania');

    /* The auto-created profile still exists — skipping erases nothing. */
    const names = await storedNames(account.id);
    expect(names).toContain('Rania');
    expect(names.length, 'the auto-created profile vanished when onboarding was skipped').toBe(2);

    /* ⚠️ AND THE COPY STAYS NEUTRAL. No answer was given, so naming the
       relationship would be the guess Critical Feature 54 forbids. */
    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'unknown');

    /* ⚠️ THE OTHER HALF OF "SKIPPING LEAVES A USABLE ACCOUNT": the placeholder
       name the screen would have fixed is still there, so `/compte/` has to
       point at it. Otherwise skipping quietly ships `mcc-e2e-…` to the
       attendance sheet with nothing anywhere suggesting it could be changed.

       Visible, and the settings disclosure opened ITSELF to show it — a warning
       inside a collapsed block is a warning nobody reads. */
    await expect(page.getByTestId('account-name-placeholder')).toBeVisible();
    await expect(page.getByTestId('account-settings')).toHaveAttribute('open', '');
  });

  /* ── 4. The placeholder ────────────────────────────────────────────────── */

  test('the email-derived placeholder is NOT pre-filled, and is called out', async ({ page }) => {
    const account = await freshAccount('onb-holder');

    await answer(page, account.email, 'children');

    /* The auto-created profile really is named after the email — if this ever
       stops being true the rest of the test is meaningless, so it is asserted
       rather than assumed. */
    await expect
      .poll(() => storedNames(account.id), { timeout: 15_000 })
      .toEqual([account.localPart]);

    await expect(page.getByTestId('welcome-name-0')).toHaveValue('');
    /* And the copy says why the field is empty, rather than leaving a parent to
       wonder what is being asked of them. */
    await expect(page.getByTestId('welcome-placeholder-note')).toBeVisible();
    await expect(page.getByTestId('welcome-placeholder-note')).toContainText(
      /adresse e-mail|email address/i,
    );
  });

  /**
   * ⚠️ A REAL NAME IS PRE-FILLED — the mirror of the test above. Emptying the
   * field for somebody whose provider DID supply a first name would be a worse
   * experience than the bug being fixed.
   */
  test('a real name is pre-filled rather than blanked', async ({ page }) => {
    const account = await freshAccount('onb-named', 'Yasmine');

    await answer(page, account.email, 'children');
    await expect(page.getByTestId('welcome-name-0')).toHaveValue('Yasmine');
    await expect(page.getByTestId('welcome-placeholder-note')).toBeHidden();
  });

  /* ── 5. Not signed in, and accessibility ───────────────────────────────── */

  test('a signed-out visitor is offered sign-in, not a form', async ({ page }) => {
    await page.goto('/bienvenue/');
    await expect(page.getByTestId('welcome-signed-out')).toBeVisible();
    await expect(page.getByTestId('welcome-form')).toBeHidden();
    await expect(page.getByTestId('welcome-question')).toBeHidden();
  });

  /**
   * ⚠️ AXE ON THE REAL SCREEN, AT BOTH STEPS. The welcome page is the first
   * thing a new parent sees and it is seen on a phone; a contrast or label
   * defect here greets every single family exactly once. Step one is three
   * large custom buttons and step two is a form — different failure modes, so
   * both are analysed rather than only whichever happens to be showing.
   */
  test('the welcome screen has no axe violations at either step, FR and EN', async ({ page }) => {
    const account = await freshAccount('onb-axe');

    await follow(page, account.email);
    await waitForSignedInUrl(page, /\/bienvenue\//);
    await expect(page.getByTestId('welcome-question')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    /* "Les deux" draws every section this screen has. */
    await page.getByTestId('welcome-who-both').click();
    await expect(page.getByTestId('welcome-form')).toBeVisible();
    /* Open a sibling slot too — a hidden field cannot have a contrast defect,
       and revealing one is a normal thing to do on this screen. */
    await page.getByTestId('welcome-add-another').click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto('/en/bienvenue/');
    await expect(page.getByTestId('welcome-question')).toBeVisible();
    await page.getByTestId('welcome-who-both').click();
    await expect(page.getByTestId('welcome-form')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
