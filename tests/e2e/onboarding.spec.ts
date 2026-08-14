import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isSupabaseConfigured } from './env';
import {
  adminClient,
  createConfirmedUser,
  deleteUser,
  e2eEmail,
  magicLinkFor,
} from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';

/**
 * `/bienvenue/` — the first-run screen.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE THREE CLAIMS THIS FILE EXISTS TO KEEP HONEST, all of which are easy to
 * write and easy to break silently:
 *
 *   1. It is shown ONCE — and "once" means per ACCOUNT, not per browser. The
 *      bookmark case is the one that would rot first: a parent who returns to
 *      the URL must be sent away, not re-guided.
 *   2. SKIPPING LEAVES A USABLE ACCOUNT. Guidance, not a gate. If skipping ever
 *      leaves a half-made account this is the file that says so.
 *   3. THE PLACEHOLDER IS NOT PRE-FILLED. `handle_new_user()` seeds
 *      `display_name` from the email local part and `resolveChild()` copies it
 *      into the first child, so a brand-new account contains a student called
 *      `mcc-e2e-…`. Prefilling that string invites a parent to press Save and
 *      ship it to the attendance sheet — the exact outcome the screen exists to
 *      prevent.
 *
 * ⚠️ EVERY TEST MINTS ITS OWN ACCOUNT. They all mutate `onboarded_at` and the
 * roster they assert on, and `fullyParallel` is free to interleave them.
 *
 * ⚠️ THE ASSERTIONS ARE AGAINST THE DATABASE WHERE IT MATTERS, not against the
 * painting of it. A screen that renames a child in the DOM and never writes the
 * row would pass every visual check here.
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
   * child rows, `onboarded_at` null.
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
    await page.goto(await magicLinkFor(email));
  }

  async function storedNames(accountId: string): Promise<string[]> {
    const { data } = await adminClient()
      .from('child_profiles')
      .select('display_name')
      .eq('account_id', accountId)
      .order('created_at');
    return (data ?? []).map((row) => String(row['display_name']));
  }

  async function onboardedAt(accountId: string): Promise<string | null> {
    const { data } = await adminClient()
      .from('profiles')
      .select('onboarded_at')
      .eq('id', accountId)
      .single();
    return (data?.['onboarded_at'] as string | null) ?? null;
  }

  /* ── 1. The landing rule ───────────────────────────────────────────────── */

  /**
   * ⚠️ THE WHOLE FEATURE IN ONE ASSERTION. Before this change the callback sent
   * every sign-in to `/compte/`, where nothing ever suggested the auto-named
   * child could be renamed.
   */
  test('a first sign-in lands on /bienvenue/, and a later one does not', async ({ page }) => {
    const account = await freshAccount('onb-first');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await expect(page.getByTestId('welcome-form')).toBeVisible();

    /* Dismiss, which is the cheapest way to reach the "already guided" state. */
    await page.getByTestId('welcome-skip').click();
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });
    expect(await onboardedAt(account.id), 'skipping did not record the visit').not.toBeNull();

    /* A SECOND sign-in on the same account. */
    await follow(page, account.email);
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });
    await expect(page.getByTestId('account-panel')).toBeVisible();
    expect(page.url()).not.toContain('/bienvenue/');
  });

  /**
   * ⚠️ THE BOOKMARK CASE, WHICH THE CALLBACK'S REDIRECT DOES NOT COVER. "Never
   * shown again" has to be true of the URL itself, or a parent who saved the
   * page during signup is walked through naming an already-named child.
   */
  test('/bienvenue/ sends an already-onboarded account straight to /compte/', async ({ page }) => {
    const account = await freshAccount('onb-book');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await page.getByTestId('welcome-skip').click();
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });

    /* Straight back to the URL, as a bookmark would. */
    await page.goto('/bienvenue/');
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });
    await expect(page.getByTestId('account-panel')).toBeVisible();
  });

  /* ── 2. Skipping leaves a usable account ───────────────────────────────── */

  /**
   * ⚠️ "GUIDANCE, NOT A GATE" IS A CLAIM ABOUT WHAT IS LEFT BEHIND. A skipped
   * onboarding must leave exactly the account a completed one would, minus the
   * names — including the add form, which was unreachable for every real account
   * for two releases and is the regression this site has already shipped once.
   */
  test('a skipped onboarding leaves a fully usable account', async ({ page }) => {
    const account = await freshAccount('onb-skip');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await page.getByTestId('welcome-skip').click();
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });

    /* The family section renders, and the add form is reachable and works. */
    await expect(page.getByTestId('family')).toBeVisible();
    await page.getByTestId('child-name').fill('Rania');
    await page.getByTestId('child-add-submit').click();
    await expect(page.getByTestId('child-roster')).toContainText('Rania');

    /* The auto-created child still exists — skipping erases nothing. */
    const names = await storedNames(account.id);
    expect(names).toContain('Rania');
    expect(names.length, 'the auto-created child vanished when onboarding was skipped').toBe(2);
  });

  /* ── 3. The placeholder ────────────────────────────────────────────────── */

  test('the email-derived placeholder is NOT pre-filled, and is called out', async ({ page }) => {
    const account = await freshAccount('onb-holder');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });

    /* The auto-created child really is named after the email — if this ever
       stops being true the rest of the test is meaningless, so it is asserted
       rather than assumed. */
    await expect
      .poll(() => storedNames(account.id), { timeout: 15_000 })
      .toEqual([account.localPart]);

    const field = page.getByTestId('welcome-name-0');
    await expect(field).toHaveValue('');
    /* And the copy says why the field is empty, rather than leaving a parent to
       wonder what is being asked of them. */
    await expect(page.getByTestId('welcome-name-body')).toContainText(/adresse e-mail|email address/i);
  });

  /**
   * ⚠️ A REAL NAME IS PRE-FILLED — the mirror of the test above. Emptying the
   * field for somebody whose provider DID supply a first name would be a worse
   * experience than the bug being fixed.
   */
  test('a real name is pre-filled rather than blanked', async ({ page }) => {
    const account = await freshAccount('onb-named', 'Yasmine');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await expect(page.getByTestId('welcome-name-0')).toHaveValue('Yasmine');
  });

  /* ── 4. Completing it ──────────────────────────────────────────────────── */

  test('naming the child renames the row, and never leaves the placeholder', async ({ page }) => {
    const account = await freshAccount('onb-name');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await page.getByTestId('welcome-name-0').fill('Imane');
    await page.getByTestId('welcome-save').click();
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });

    await expect.poll(() => storedNames(account.id), { timeout: 15_000 }).toEqual(['Imane']);
    expect(await onboardedAt(account.id)).not.toBeNull();
  });

  /**
   * ⚠️ THE SIBLING PATH, WHICH IS THE OTHER HALF OF THE BRIEF. A parent of two
   * must be able to say so at the moment they are thinking about it, not by
   * discovering a form on another page later.
   */
  test('"Ajouter un autre enfant" adds a sibling in the same step', async ({ page }) => {
    const account = await freshAccount('onb-sib');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });

    await page.getByTestId('welcome-name-0').fill('Omar');
    await page.getByTestId('welcome-add-another').click();
    await expect(page.getByTestId('welcome-slot-1')).toBeVisible();
    await page.getByTestId('welcome-name-1').fill('Lina');
    await page.getByTestId('welcome-save').click();
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });

    await expect
      .poll(() => storedNames(account.id), { timeout: 15_000 })
      .toEqual(['Omar', 'Lina']);

    /* And the account now reads as a family: the picker appears, and the intro
       counts. Both are the one-child/several branch under test in family.spec. */
    await expect(page.getByTestId('child-picker')).toBeVisible();
  });

  /* ── 5. Not signed in, and accessibility ───────────────────────────────── */

  test('a signed-out visitor is offered sign-in, not a form', async ({ page }) => {
    await page.goto('/bienvenue/');
    await expect(page.getByTestId('welcome-signed-out')).toBeVisible();
    await expect(page.getByTestId('welcome-form')).toBeHidden();
  });

  /**
   * ⚠️ AXE ON THE REAL SCREEN, WITH THE FORM OPEN. The welcome page is the first
   * thing a new parent sees and it is seen on a phone; a contrast or label
   * defect here greets every single family exactly once.
   */
  test('the welcome screen has no axe violations, FR and EN', async ({ page }) => {
    const account = await freshAccount('onb-axe');

    await follow(page, account.email);
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await expect(page.getByTestId('welcome-form')).toBeVisible();
    /* Open a sibling slot too — a hidden field cannot have a contrast defect,
       and revealing one is a normal thing to do on this screen. */
    await page.getByTestId('welcome-add-another').click();

    const fr = await new AxeBuilder({ page }).analyze();
    expect(fr.violations).toEqual([]);

    await page.goto('/en/bienvenue/');
    await expect(page.getByTestId('welcome-form')).toBeVisible();
    const en = await new AxeBuilder({ page }).analyze();
    expect(en.violations).toEqual([]);
  });
});
