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
import { followMagicLink, reachAccountPage } from './helpers/auth';

/**
 * The family section of `/compte/` — REACHABILITY, through the browser.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS IS THE UI SPEC, AND THAT IS WHY IT IS NOT IN
 * `child-profiles.spec.ts`. That file asserts the BOUNDARY through PostgREST,
 * deliberately, because RLS is the security and a parent with devtools does not
 * use the buttons. Nothing there can see a form that a browser cannot reach —
 * and RLS permitted every one of these writes throughout the whole time the
 * add form was invisible.
 *
 * ⚠️ AN UNREACHABLE FORM IS A BUG, NOT A STATE. The section used to hide
 * itself whenever the account held one child or none, and `resolveChild()`
 * gives a brand-new account exactly one — so "Ajouter un élève" was reachable
 * only by an account that had already had a second child inserted by SQL. The
 * markup was correct, the policy was correct, the build was clean, and the
 * feature did not exist for any real parent. The first test below is the one
 * that would have caught it, so it is written to fail loudly on the shape of
 * account that every signup produces.
 *
 * Each test mints its OWN account. These tests mutate the roster they assert
 * on, and `fullyParallel` is free to interleave them.
 * ═════════════════════════════════════════════════════════════════════════
 */

test.describe('the family section on /compte/', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');

  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /**
   * A brand-new account, signed in — i.e. ZERO children in the database until
   * the page loads, exactly as a real signup produces. `resolveChild()` then
   * adopts one from the profile name, which is the state under test.
   */
  async function signInFresh(page: Page, label: string, displayName: string) {
    const email = e2eEmail(label);
    const user = await createConfirmedUser({ email, displayName });
    created.push(user.id);
    await followMagicLink(page, email);
    await reachAccountPage(page);
    await expect(page.getByTestId('family')).toBeVisible();
    return user;
  }

  /** What the DATABASE holds — the row, not the painting of it. */
  async function storedNames(accountId: string): Promise<string[]> {
    const { data } = await adminClient()
      .from('child_profiles')
      .select('display_name')
      .eq('account_id', accountId)
      .order('created_at');
    return (data ?? []).map((row) => String(row['display_name']));
  }

  const names = (page: Page) => page.getByTestId('child-roster').getByTestId('child-row-name');

  /**
   * ⚠️ THE REGRESSION. One child is the shape of every account that has ever
   * signed up; if the add form is not reachable here it is not reachable at
   * all.
   */
  test('an account with exactly ONE child can reach and submit the add form', async ({ page }) => {
    const user = await signInFresh(page, 'family-add', 'Sara');

    await expect(names(page)).toHaveText(['Sara']);
    /* The picker is the CONDITIONAL half, and it stays conditional — there is
       genuinely nothing to ask an account holding one child. */
    await expect(page.getByTestId('child-picker')).toBeHidden();

    await expect(page.getByTestId('child-name')).toBeVisible();
    await page.getByTestId('child-name').fill('Yassine');
    await page.getByTestId('child-add-submit').click();

    await expect(names(page)).toHaveText(['Sara', 'Yassine']);
    /* ⚠️ Asserted against the database, not the list. A painted row proves the
       script ran; the row proves the insert happened. */
    expect(await storedNames(user.id), 'the second child was painted but not stored').toEqual([
      'Sara',
      'Yassine',
    ]);

    /* And now, and only now, there is something to ask. */
    await expect(page.getByTestId('child-picker')).toBeVisible();
    await expect(page.getByTestId('child-list').getByRole('button')).toHaveText([
      'Sara',
      'Yassine',
    ]);
  });

  test('a parent can rename one of their own children', async ({ page }) => {
    const user = await signInFresh(page, 'family-rename', 'Sara');
    await expect(names(page)).toHaveText(['Sara']);

    await page.getByTestId('child-rename').click();
    const field = page.getByTestId('child-rename-input');
    await expect(field).toBeFocused();
    await field.fill('Sara B.');
    await page.getByTestId('child-rename-save').click();

    await expect(names(page)).toHaveText(['Sara B.']);
    expect(await storedNames(user.id)).toEqual(['Sara B.']);
  });

  test('a rename can be abandoned and changes nothing', async ({ page }) => {
    const user = await signInFresh(page, 'family-rename-cancel', 'Omar');

    await page.getByTestId('child-rename').click();
    await page.getByTestId('child-rename-input').fill('Quelqu’un d’autre');
    await page.getByTestId('child-rename-cancel').click();

    await expect(names(page)).toHaveText(['Omar']);
    expect(await storedNames(user.id)).toEqual(['Omar']);
  });

  /**
   * ⚠️ REMOVAL IS THE ONE CONTROL HERE THAT DESTROYS WHAT A CHILD EARNED —
   * `child_profiles` is the FK target of progress, games, attendance and
   * awards, all `on delete cascade`. So: two steps, the child named, and never
   * offered for the last one.
   */
  test('a parent can remove a child, and is never offered the last one', async ({ page }) => {
    const user = await signInFresh(page, 'family-remove', 'Sara');

    /* With one child there is no remove button AT ALL — a disabled control
       with no explanation reads as a bug, and removing the only child is a lie
       anyway: `resolveChild()` recreates one from the profile name. */
    await expect(page.getByTestId('child-remove')).toHaveCount(0);
    await expect(page.getByTestId('child-only')).toBeVisible();

    await page.getByTestId('child-name').fill('Yassine');
    await page.getByTestId('child-add-submit').click();
    await expect(names(page)).toHaveText(['Sara', 'Yassine']);

    /* First click asks, naming the child and what goes with them. */
    await page.getByTestId('child-remove').nth(1).click();
    await expect(page.getByTestId('child-remove-question')).toContainText('Yassine');
    await page.getByTestId('child-remove-confirm').click();

    /**
     * ⚠️ WAIT FOR THE CONFIRM ROW TO GO, NOT FOR THE NAME COUNT.
     *
     * While the confirm is open, Yassine's row shows the QUESTION in place of
     * the name — so the roster already has exactly one `child-row-name`
     * ("Sara") the instant the button is clicked, and a name assertion passes
     * before the delete has left the browser. This test read the database in
     * that window and found two rows; it had been passing on timing.
     */
    await expect(page.getByTestId('child-remove-question')).toHaveCount(0);
    await expect(names(page)).toHaveText(['Sara']);
    /* Polled, because the row disappearing from the roster is a repaint and the
       delete is a round trip — the UI is allowed to be first. */
    await expect.poll(() => storedNames(user.id)).toEqual(['Sara']);
    /* Back below the threshold, the picker goes away again — and the remove
       button with it. */
    await expect(page.getByTestId('child-picker')).toBeHidden();
    await expect(page.getByTestId('child-remove')).toHaveCount(0);
  });

  test('cancelling a removal removes nothing', async ({ page }) => {
    const user = await signInFresh(page, 'family-remove-cancel', 'Sara');

    await page.getByTestId('child-name').fill('Yassine');
    await page.getByTestId('child-add-submit').click();
    await expect(names(page)).toHaveText(['Sara', 'Yassine']);

    await page.getByTestId('child-remove').nth(1).click();
    await page.getByTestId('child-remove-cancel').click();

    await expect(names(page)).toHaveText(['Sara', 'Yassine']);
    expect(await storedNames(user.id)).toEqual(['Sara', 'Yassine']);
  });

  /**
   * The section is revealed and populated by script, so nothing on the
   * server-rendered page can be axe-checked into covering it. The existing
   * `/compte/` axe check in `auth.spec.ts` runs SIGNED OUT, where this whole
   * section is `hidden` and invisible to axe.
   */
  test('the populated family section has no axe violations, FR and EN', async ({ page }) => {
    await signInFresh(page, 'family-axe', 'Sara');
    await page.getByTestId('child-name').fill('Yassine');
    await page.getByTestId('child-add-submit').click();
    await expect(names(page)).toHaveText(['Sara', 'Yassine']);

    for (const path of ['/compte/', '/en/compte/']) {
      await page.goto(path);
      await expect(page.getByTestId('family')).toBeVisible();
      await expect(names(page)).toHaveText(['Sara', 'Yassine']);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, `${path}\n${summary.join('\n')}`).toEqual([]);
    }
  });

  /* ── The model, in words a parent can act on ───────────────────────────── */

  /**
   * ⚠️ THE ONE-CHILD SENTENCE MUST BE TRUE FOR TWO DIFFERENT PEOPLE.
   *
   * An account holding exactly one child is the SAME OBJECT whether it belongs
   * to a parent who enrolled one child or to a teenager who signed up for
   * themselves — Critical Feature 40 makes that deliberate, and there is no flag
   * to branch on. So the copy names the structure ("this account has a single
   * student profile") and covers both readings in one clause, and it must never
   * regress to a possessive like "your child", which is simply false for the
   * autonomous teenager reading about themselves.
   */
  test('one profile reads structurally, never as "your child" and never "élève"', async ({
    page,
  }) => {
    await signInFresh(page, 'family-one', 'Sara');
    await expect(names(page)).toHaveText(['Sara']);

    /* ⚠️ NO ANSWER WAS GIVEN — `signInFresh` skips `/bienvenue/` — so the
       neutral register is the correct one and anything else is a guess. */
    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'unknown');

    const intro = page.getByTestId('family-intro');
    await expect(intro).toContainText(/un seul profil de joueur/i);
    /* The picker has nothing to ask at one profile — `resolveChild()` adopts a
       lone profile silently, which is the autonomous-teenager path. */
    await expect(page.getByTestId('child-picker')).toBeHidden();

    /* ⚠️ The heading is structural in both locales. "Mes élèves" was the old
       wording and is wrong for a teenager; a regression to it fails here. */
    await expect(page.getByTestId('profiles-heading')).toHaveText(/Les profils de ce compte/i);

    /* ⚠️ "ÉLÈVE" IS GONE FROM PARENT-FACING COPY, AND STAYS ON THE STAFF SIDE.
       « votre élève : Seàn » is meaningless for somebody who plays themselves,
       and the word was doing real damage on a page a parent reads once.
       `/admin*` is untouched — that audience really is looking at a class of
       students. Asserted on this account rather than a fresh one: every extra
       sign-in is a magic-link verification against a rate limit the suite
       genuinely reaches. See `waitForSignedInUrl` in helpers/auth.ts. */
    await expect(page.getByTestId('family')).not.toContainText(/élèves?/i);
    await expect(page.getByTestId('child-add-label')).not.toContainText(/élève/i);

    await page.goto('/en/compte/');
    await expect(page.getByTestId('family-intro')).toContainText(/a single player profile/i);
    await expect(page.getByTestId('profiles-heading')).toHaveText(/The profiles on this account/i);
    await expect(page.getByTestId('family')).not.toContainText(/students?/i);
  });

  /**
   * ⚠️ SEVERAL PROFILES IS A DIFFERENT SENTENCE, NOT A PLURAL "s" — and it
   * carries the count, because "how many players does this account hold" is the
   * question the block exists to answer at a glance.
   */
  test('several profiles read as a count, in both locales', async ({ page }) => {
    const user = await signInFresh(page, 'family-many', 'Sara');
    await page.getByTestId('child-name').fill('Yassine');
    await page.getByTestId('child-add-submit').click();
    await expect(names(page)).toHaveText(['Sara', 'Yassine']);
    expect(await storedNames(user.id)).toEqual(['Sara', 'Yassine']);

    await expect(page.getByTestId('family-intro')).toContainText(/2 profils de joueur/i);
    await expect(page.getByTestId('child-picker')).toBeVisible();

    await page.goto('/en/compte/');
    await expect(page.getByTestId('family-intro')).toContainText(/2 player profiles/i);
  });

  /* ── The three blocks ──────────────────────────────────────────────────── */

  /**
   * ⚠️ THE ORDER IS THE FEATURE. `/compte/` was one flat column in which the
   * interface language and PERMANENT DELETION carried exactly the same weight as
   * the children's progress. A test that only checked the blocks exist would
   * pass on the old page too, so this one asserts the ORDER and the fact that
   * only the first is open.
   */
  test('/compte/ is three blocks: profiles first, settings and danger collapsed', async ({ page }) => {
    await signInFresh(page, 'family-blocks', 'Sara');

    const order = await page.evaluate(() => {
      const ids = ['family', 'account-settings', 'account-advanced'];
      const nodes = ids.map((id) => document.querySelector(`[data-testid="${id}"]`));
      if (nodes.some((n) => !n)) return null;
      return nodes.map((n) => ({
        id: n!.getAttribute('data-testid'),
        top: n!.getBoundingClientRect().top + window.scrollY,
      }));
    });
    expect(order, 'a block is missing from /compte/').not.toBeNull();
    expect(order!.map((o) => o.id)).toEqual(['family', 'account-settings', 'account-advanced']);
    expect(order![0]!.top).toBeLessThan(order![1]!.top);
    expect(order![1]!.top).toBeLessThan(order![2]!.top);

    /* ⚠️ COLLAPSED BY DEFAULT. Deletion competing with the roster is the whole
       complaint; an `open` attribute here would restore it silently. */
    await expect(page.getByTestId('account-advanced')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('account-delete-start')).toBeHidden();

    /* And they really open — a disclosure that does not is worse than none. */
    await page.getByTestId('account-advanced').locator('summary').click();
    await expect(page.getByTestId('account-delete-start')).toBeVisible();

    /**
     * ⚠️ WHOSE ACCOUNT IS THIS? The page has to say so in a label, not leave a
     * parent to infer it from an email address sitting under "Prénom affiché".
     * The explainer moved into the settings disclosure when `/bienvenue/`
     * started asking the question directly — so it is OPENED here rather than
     * assumed visible, which is exactly the regression this would otherwise
     * hide.
     */
    await page.getByTestId('account-settings').locator('summary').click();
    const model = page.getByTestId('account-model');
    await expect(model).toBeVisible();
    await expect(model).toContainText(/titulaire de ce compte/i);
    /* The teenager case is named out loud rather than left ambiguous. */
    await expect(model).toContainText(/adolescent/i);
    await expect(page.getByTestId('account-panel')).toContainText(/Titulaire du compte/i);

    /**
     * ⚠️ EVERY NUMBER ON A CARD IS DERIVED, AND ITS ABSENCE SAYS SO. A card
     * reading "0 points" while the rows are still in flight is a lie a parent
     * cannot tell from the truth, and Critical Feature 30 is the same rule for
     * `/progres/`: never print a number nothing computed. A brand-new profile
     * has solved nothing, so the honest answer is the bottom rank and zero —
     * but it must be COMPUTED, not printed as markup.
     */
    await expect(page.getByTestId('child-rank')).toHaveText(/\S/);
    await expect(page.getByTestId('child-points')).toHaveText(/^\d+ points$/);

    await page.goto('/en/compte/');
    await page.getByTestId('account-settings').locator('summary').click();
    await expect(page.getByTestId('account-model')).toContainText(/you hold this account/i);
    await expect(page.getByTestId('account-model')).toContainText(/teenager/i);
  });

  /**
   * ⚠️ THE ANSWER GIVEN AT SIGN-UP IS NOT A LIFE SENTENCE. `/bienvenue/` is
   * shown once per account, deliberately, so a reader who said "mon enfant" and
   * later starts playing has no other way to say so. One control, on the row
   * that is theirs, and the vocabulary follows it.
   */
  test('“C’est moi” claims a profile and switches the vocabulary', async ({ page }) => {
    const user = await signInFresh(page, 'family-self', 'Sara');
    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'unknown');
    await expect(page.getByTestId('child-you')).toHaveCount(0);

    await page.getByTestId('child-mark-self').click();

    await expect(page.getByTestId('child-you')).toHaveCount(1);
    await expect(page.getByTestId('family')).toHaveAttribute('data-shape', 'self');
    await expect(page.getByTestId('profiles-heading')).toHaveText(/votre profil/i);

    /* Asserted against the row, not the badge. */
    const { data } = await adminClient()
      .from('child_profiles')
      .select('is_self')
      .eq('account_id', user.id);
    expect((data ?? []).filter((r) => r['is_self'] === true).length).toBe(1);

    /* ⚠️ AND IT IS NOT OFFERED TWICE. At most one profile per account may be
       the holder's — `child_profiles_one_self_idx` refuses the second write, so
       the control that would attempt it must not be there to press. */
    await expect(page.getByTestId('child-mark-self')).toHaveCount(0);
  });
});
