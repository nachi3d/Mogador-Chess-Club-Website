import { test, expect, type Page } from '@playwright/test';
import { isSupabaseConfigured } from './env';
import { adminClient, deleteUser, e2ePseudo } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { PSEUDO_EMAIL_DOMAIN, pseudoEmail } from '../../src/lib/pseudo';

/**
 * Signing in with a pseudo and a password (migration 0013).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHY THIS FILE IS NOT OPTIONAL COVERAGE.
 *
 * `register_with_pseudo()` writes `auth.users` and `auth.identities` directly,
 * because the alternative — `supabase.auth.signUp()` with the synthetic
 * address — sends a confirmation mail to an address that can never receive one
 * and leaves the account locked. Writing those tables is Supabase-internal, so
 * a GoTrue schema change could break sign-up or sign-in with nothing in this
 * repository to warn us. These tests register and sign in through the REAL
 * endpoints on every gate: that is the mitigation, and it is the reason the
 * risk was acceptable.
 *
 * ⚠️ THE BOUNDARIES ARE NOT HERE. Who may reset whose password, and who may
 * read the journal, live in `role-separation.spec.ts` with every other claim
 * about RLS — asserted through PostgREST with each person's own token, never by
 * driving a page.
 *
 * ⚠️ EVERY TEST MINTS ITS OWN ACCOUNT, and every pseudo comes from
 * `e2ePseudo()` so `purge.ts` can find it: a pseudo account's address cannot
 * carry the e2e email domain, so the prefix is the only thing that makes these
 * rows cleanable.
 * ═════════════════════════════════════════════════════════════════════════
 */
test.describe('pseudo + password', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');

  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /** The account id behind a pseudo, and a note to delete it afterwards. */
  async function trackPseudo(pseudo: string): Promise<string> {
    const { data } = await adminClient().from('profiles').select('id').eq('pseudo', pseudo).single();
    const id = String(data?.['id'] ?? '');
    if (id) created.push(id);
    return id;
  }

  /** Register through the real form, and stop wherever the site sends us. */
  async function registerVia(
    page: Page,
    fields: { pseudo: string; password: string; name?: string; whatsapp?: string; email?: string },
  ): Promise<void> {
    await page.goto('/inscription/');
    await page.getByTestId('signup-name').fill(fields.name ?? 'Yassine');
    await page.getByTestId('signup-pseudo').fill(fields.pseudo);
    await page.getByTestId('signup-password').fill(fields.password);
    await page.getByTestId('signup-whatsapp').fill(fields.whatsapp ?? '06 12 34 56 78');
    if (fields.email) await page.getByTestId('signup-email').fill(fields.email);
    await page.getByTestId('signup-submit').click();
  }

  /**
   * ⚠️ THE MIRROR, PINNED — THE ONE DUPLICATION THIS FEATURE COULD NOT AVOID.
   *
   * The browser builds the synthetic address itself (`src/lib/pseudo.ts`),
   * because it has to sign in before there is any session to call a function
   * with. The database builds the same address inside `register_with_pseudo()`.
   * If those two ever disagree, every existing account stops opening with
   * correct credentials — the worst failure this feature can have, and one no
   * other test would notice. Same arrangement as `computeLedger()` and the
   * inline score resolver.
   */
  test('the address the browser builds is the address the database builds', async () => {
    const { data: domain } = await adminClient().rpc('pseudo_email_domain');
    expect(String(domain), 'the synthetic domain drifted').toBe(PSEUDO_EMAIL_DOMAIN);

    for (const sample of ['yassine', 'a-b.c_d', 'e2e-test01']) {
      const { data } = await adminClient().rpc('pseudo_email', { p_pseudo: sample });
      expect(String(data), `pseudo_email('${sample}') drifted`).toBe(pseudoEmail(sample));
    }

    /* ⚠️ RESERVED BY RFC 6761: a domain that cannot resolve is what makes "no
       mail is ever sent anywhere" a property of the internet rather than a
       promise about our configuration. A future session moving this to a real
       domain reintroduces deliverability, bounces and the possibility that a
       pseudo collides with somebody's actual mailbox. */
    expect(PSEUDO_EMAIL_DOMAIN.endsWith('.invalid'), 'the synthetic domain must be .invalid').toBe(
      true,
    );
  });

  test('a teenager with no email address gets an account, and never sees the address we made', async ({
    page,
  }) => {
    const pseudo = e2ePseudo('new');
    await registerVia(page, { pseudo, password: 'cavalier7', name: 'Yassine' });

    /* A fresh account has never been guided, so the landing rule sends it to
       the welcome screen — the same first stop a magic link produces. */
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    const id = await trackPseudo(pseudo);
    expect(id, 'no profile was created for the new pseudo').not.toBe('');

    await page.getByTestId('welcome-skip').click();
    await page.waitForURL(/\/compte\//, { timeout: 30_000 });

    /* ⚠️ THE ACCOUNT IS NAMED BY ITS PSEUDO, AND THE SYNTHETIC ADDRESS APPEARS
       NOWHERE IN THE DOCUMENT. Not in the holder row, not in a hidden field,
       not in a data attribute — the assertion is on the whole page text and the
       whole HTML, because "we did not print it" is easy to get right in one
       place and wrong in another. */
    await expect(page.getByTestId('account-pseudo')).toHaveText(pseudo);
    await expect(page.getByTestId('account-fact-email')).toBeHidden();
    expect(await page.content(), 'the synthetic address reached the page').not.toContain(
      PSEUDO_EMAIL_DOMAIN,
    );

    /* ⚠️ AND THE WHATSAPP NUMBER WAS NORMALISED BY POSTGRES. `06 12 34 56 78`
       typed at a table in Dar Souiri has to become the E.164 string the
       `wa.me/` link dials, or the recovery channel works for some rows only. */
    const { data: row } = await adminClient()
      .from('profiles')
      .select('guardian_phone,display_name,contact_email,must_change_password')
      .eq('id', id)
      .single();
    expect(String(row!['guardian_phone'])).toBe('+212612345678');
    expect(String(row!['display_name'])).toBe('Yassine');
    expect(row!['contact_email'], 'an email was invented for an account that gave none').toBeNull();
    expect(row!['must_change_password']).toBe(false);
  });

  test('the pseudo signs back in, and a wrong password says exactly what an unknown pseudo says', async ({
    page,
  }) => {
    const pseudo = e2ePseudo('signin');
    await registerVia(page, { pseudo, password: 'tourfou12' });
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await trackPseudo(pseudo);
    await page.getByTestId('welcome-skip').click();
    await page.waitForURL(/\/compte\//, { timeout: 30_000 });

    await page.getByTestId('account-signout').click();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/en/');

    /* Wrong password on a real pseudo. */
    await page.goto('/connexion/');
    await page.getByTestId('login-pseudo').fill(pseudo);
    await page.getByTestId('login-password').fill('pas-le-bon');
    await page.getByTestId('login-pseudo-submit').click();
    await expect(page.getByTestId('login-pseudo-error')).toBeVisible();
    const wrongPassword = await page.getByTestId('login-pseudo-error').textContent();

    /* A pseudo nobody has. */
    await page.getByTestId('login-pseudo').fill(e2ePseudo('ghost'));
    await page.getByTestId('login-password').fill('tourfou12');
    await page.getByTestId('login-pseudo-submit').click();
    await expect(page.getByTestId('login-pseudo-error')).toBeVisible();
    const noSuchAccount = await page.getByTestId('login-pseudo-error').textContent();

    /* ⚠️ ONE MESSAGE FOR BOTH. A form that distinguishes them is a form that
       answers "does this person have an account here?" for anyone who asks —
       about children, from a public page. */
    expect(noSuchAccount, 'the form says which half was wrong').toBe(wrongPassword);

    /* And the right password still works. */
    await page.getByTestId('login-pseudo').fill(pseudo);
    await page.getByTestId('login-password').fill('tourfou12');
    await page.getByTestId('login-pseudo-submit').click();
    await page.waitForURL(/\/compte\//, { timeout: 30_000 });
    await expect(page.getByTestId('account-pseudo')).toHaveText(pseudo);
  });

  test('a pseudo is claimed once — the second person is told, and nothing is created', async ({
    page,
  }) => {
    const pseudo = e2ePseudo('twice');
    await registerVia(page, { pseudo, password: 'gambit99' });
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    await trackPseudo(pseudo);

    await registerVia(page, { pseudo, password: 'autre-mot' });
    await expect(page.getByTestId('signup-error')).toBeVisible();
    await expect(page.getByTestId('signup-error')).toContainText(/déjà pris|taken/i);

    const { count } = await adminClient()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('pseudo', pseudo);
    expect(count, 'the pseudo was handed out twice').toBe(1);
  });

  test('the form refuses what the database refuses — short password, no number', async ({
    page,
  }) => {
    await page.goto('/inscription/');
    await page.getByTestId('signup-name').fill('Amine');
    await page.getByTestId('signup-pseudo').fill(e2ePseudo('short'));
    await page.getByTestId('signup-password').fill('court');
    await page.getByTestId('signup-whatsapp').fill('06 12 34 56 78');
    await page.getByTestId('signup-submit').click();
    await expect(page.getByTestId('signup-error')).toBeVisible();
    await expect(page.getByTestId('signup-error')).toContainText(/6/);

    /* ⚠️ THE NUMBER IS REQUIRED, and this is the assertion that keeps it so.
       It is the ONLY recovery channel: an account without one is an account
       nobody can ever help. Somebody will want to make it optional. */
    await page.getByTestId('signup-password').fill('assez-long');
    await page.getByTestId('signup-whatsapp').fill('');
    await page.getByTestId('signup-submit').click();
    await expect(page.getByTestId('signup-error')).toBeVisible();

    /* ⚠️ AND THE DATABASE REFUSES IT TOO, with the form nowhere in the picture.
       Every rule this site enforces is enforced where the client cannot reach
       it — the same posture as the award bounds. */
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv();
    const anon = createClient(env!.supabaseUrl, env!.anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc('register_with_pseudo', {
      p_pseudo: e2ePseudo('direct'),
      p_password: 'assez-long',
      p_display_name: 'Direct',
      p_whatsapp: '',
      p_email: null,
      p_locale: 'fr',
    });
    expect(error?.message ?? '', 'the database accepted an account with no number').toContain(
      'whatsapp_invalid',
    );
  });

  /**
   * ⚠️ THE NAMESPACE IS RESERVED AT THE `auth.users` DOOR.
   *
   * Without the guard trigger, anybody holding the published anon key could
   * call `signInWithOtp({ email: 'yassine@pseudo.mogadorchess.invalid' })`;
   * GoTrue would create that user, and the pseudo would be permanently taken by
   * an account nobody can sign into. A free, scriptable denial of service on
   * the club's own names.
   */
  test('a magic link cannot be requested for a synthetic address', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv();
    const anon = createClient(env!.supabaseUrl, env!.anonKey, { auth: { persistSession: false } });

    const squatted = e2ePseudo('squat');
    const { error } = await anon.auth.signInWithOtp({ email: pseudoEmail(squatted) });
    expect(error, 'GoTrue created a user in the reserved namespace').not.toBeNull();

    const { data } = await adminClient().from('profiles').select('id').eq('pseudo', squatted);
    expect((data ?? []).length, 'a squatted pseudo now exists').toBe(0);
  });

  /**
   * The whole recovery story, end to end, because it is the part that will be
   * used in anger: a student forgets, Seàn resets, the student comes back.
   */
  test('a reset password forces a change, and the student chooses their own', async ({ page }) => {
    const pseudo = e2ePseudo('forgot');
    await registerVia(page, { pseudo, password: 'premier12' });
    await page.waitForURL(/\/bienvenue\//, { timeout: 30_000 });
    const id = await trackPseudo(pseudo);
    await page.getByTestId('welcome-skip').click();
    await page.waitForURL(/\/compte\//, { timeout: 30_000 });
    await page.getByTestId('account-signout').click();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/en/');

    /* Seàn's half. The admin UI is driven in `admin.spec.ts`; here the act
       itself is what matters, so it goes through the function with the service
       role standing in for an admin's token. */
    const { data: temporary } = await adminClient().rpc('admin_reset_password', { p_target: id });
    expect(typeof temporary, 'no temporary password came back').toBe('string');

    /* ⚠️ THE OLD PASSWORD IS DEAD IMMEDIATELY. A reset that leaves the previous
       one working means two credentials for one account, one of which the club
       believes it has revoked. */
    await page.goto('/connexion/');
    await page.getByTestId('login-pseudo').fill(pseudo);
    await page.getByTestId('login-password').fill('premier12');
    await page.getByTestId('login-pseudo-submit').click();
    await expect(page.getByTestId('login-pseudo-error')).toBeVisible();

    /* The temporary one gets in — and lands on the change screen, not on the
       account. */
    await page.getByTestId('login-pseudo').fill(pseudo);
    await page.getByTestId('login-password').fill(String(temporary));
    await page.getByTestId('login-pseudo-submit').click();
    await page.waitForURL(/\/mot-de-passe\//, { timeout: 30_000 });
    await expect(page.getByTestId('password-forced')).toBeVisible();

    /* ⚠️ THE CURRENT PASSWORD IS STILL REQUIRED, even here. The family phone
       left signed in is the normal case; without this check the screen is a
       "take this account" button for whoever picks it up next. */
    await page.getByTestId('password-current').fill('pas-le-bon');
    await page.getByTestId('password-new').fill('mon-choix1');
    await page.getByTestId('password-confirm').fill('mon-choix1');
    await page.getByTestId('password-submit').click();
    await expect(page.getByTestId('password-status')).toContainText(/incorrect|wrong/i);

    await page.getByTestId('password-current').fill(String(temporary));
    await page.getByTestId('password-new').fill('mon-choix1');
    await page.getByTestId('password-confirm').fill('mon-choix1');
    await page.getByTestId('password-submit').click();
    /* The flag is cleared in the same statement as the new hash, so the landing
       rule now sends them on rather than back here. */
    await page.waitForURL(/\/compte\//, { timeout: 30_000 });

    const { data: row } = await adminClient()
      .from('profiles')
      .select('must_change_password')
      .eq('id', id)
      .single();
    expect(row!['must_change_password'], 'the forced-change flag survived the change').toBe(false);

    /* And the new password is the one that works now. */
    await page.getByTestId('account-signout').click();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/en/');
    await page.goto('/connexion/');
    await page.getByTestId('login-pseudo').fill(pseudo);
    await page.getByTestId('login-password').fill('mon-choix1');
    await page.getByTestId('login-pseudo-submit').click();
    await page.waitForURL(/\/compte\//, { timeout: 30_000 });
  });
});

/**
 * The part of this feature a browser can prove with no database at all.
 *
 * ⚠️ A SEPARATE DESCRIBE BECAUSE IT SKIPS ON A DIFFERENT CONDITION. Everything
 * above needs `.env.test`; these need only a build with accounts on — so they
 * keep running (and keep this page honest) on a machine with no credentials,
 * which is most of the ways this repository gets checked out.
 */
test.describe('the pseudo path — what needs no database', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  /**
   * ⚠️ THE MAGIC LINK IS NOT COLLATERAL DAMAGE. It is how Seàn and Michael
   * sign in, and the point of this release is that the club GAINS a door rather
   * than swapping one. The form has moved into a `<details>` below the pseudo
   * form — exactly the sort of change that quietly breaks it.
   */
  test('the email path is still there, still second, and still reachable', async ({ page }) => {
    await page.goto('/connexion/');

    /* First in the document, and usable without opening anything. */
    await expect(page.getByTestId('pseudo-form')).toBeVisible();
    await expect(page.getByTestId('login-form')).toBeHidden();

    await page.getByTestId('login-email-block').locator('summary').click();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('login-email')).toBeEditable();
    await expect(page.getByTestId('login-submit')).toBeEnabled();
  });

  /**
   * ⚠️ RECOVERY IS A PERSON, AND THE PAGE HAS TO SAY SO BEFORE ANYBODY NEEDS
   * IT. There is no reset link and there never will be — no inbox to send one
   * to. A student who cannot get in and is not told how simply stops coming, so
   * the WhatsApp route is on the sign-in page itself, not in a FAQ.
   */
  test('the sign-in page says how to recover a forgotten password', async ({ page }) => {
    await page.goto('/connexion/');
    const link = page.getByTestId('login-forgot-whatsapp');
    await expect(link).toBeVisible();

    /* ⚠️ OUTBOUND ONLY, AND NO RECIPIENT IS EVER US RECEIVING ANYTHING: the
       club's own number with a prefilled message, on the reader's device. Same
       shape as every other share on this site. */
    const href = await link.getAttribute('href');
    expect(href ?? '', 'the recovery link is not a wa.me link').toContain('https://wa.me/');
    expect(href ?? '', 'the recovery link carries no prefilled message').toContain('?text=');
  });

  /**
   * ⚠️ THIS FORM IS FILLED ON A PHONE, STANDING UP, AT DAR SOUIRI. Five fields
   * and four hints is the longest form on the site, and a horizontal scrollbar
   * at 360px is how a required field ends up off-screen and unfilled.
   */
  for (const width of [390, 360]) {
    test(`/inscription/ fits ${width}px with no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/inscription/');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'the sign-up form scrolls sideways').toBeLessThanOrEqual(0);

      /* And the control at the bottom is reachable rather than under the fixed
         bar — the same rule every long route on this site follows. */
      const submit = page.getByTestId('signup-submit');
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeVisible();
    });
  }
});
