import { test, expect, type Page } from '@playwright/test';
import { isSupabaseConfigured } from './env';
import {
  adminClient,
  createConfirmedUser,
  deleteUser,
  e2eEmail,
  magicLinkFor,
} from './helpers/supabase-admin';
import { anonClientAsUser } from './helpers/auth';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';

/**
 * Self-service erasure — the button behind the promise the privacy notice has
 * always made.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE CASCADE IS ASSERTED FROM THE SERVICE ROLE, NOT FROM THE UI.
 *
 * After a deletion the account has no session and no rows it is allowed to
 * read, so asking the deleted user's own client "is my data gone?" returns
 * nothing whether it worked or not. That is the shape of a test that passes
 * for the wrong reason. Every "it is gone" assertion below therefore reads with
 * the service role, which bypasses RLS entirely.
 *
 * ⚠️ AND IT SEEDS DATA IN EVERY TABLE FIRST. "Nothing survived" is trivially
 * true of an account that never had anything — the same vacuous pass the purge
 * helper hid for months. Each test plants a child, progress, a game, an award
 * and an attendance mark, ASSERTS THEY EXIST, and only then deletes.
 * ═════════════════════════════════════════════════════════════════════════
 */

test.describe('self-service account deletion', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');

  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /** An account with a child and a row in every learner table. */
  async function seededAccount(label: string) {
    const email = e2eEmail(label);
    const user = await createConfirmedUser({ email, displayName: 'Sara' });
    created.push(user.id);

    const sb = adminClient();
    const { data: child } = await sb
      .from('child_profiles')
      .insert([{ account_id: user.id, display_name: 'Yassine' }])
      .select('id');
    const childId = String(child![0]!['id']);

    await sb
      .from('exercise_progress')
      .insert([{ child_id: childId, exercise_slug: 'mat-du-couloir', kind: 'exercise', solved: true }]);
    /* ⚠️ `game_results.id` IS CLIENT-GENERATED AND HAS NO DEFAULT — deliberately
       (migration 0003: a uuid for new games, `legacy:…` for the pre-migration
       counters). Omitting it is a not-null violation, not a schema defect. */
    await sb
      .from('game_results')
      .insert([{ child_id: childId, id: `e2e-${label}`, level: 'debutant', outcome: 'win' }]);
    await sb
      .from('point_awards')
      .insert([{ child_id: childId, points: 5, reason: 'belle partie', awarded_by: user.id }]);

    const { data: session } = await sb
      .from('sessions')
      .insert([{ starts_at: new Date(Date.now() + 86_400_000).toISOString(), status: 'published' }])
      .select('id');
    const sessionId = String(session![0]!['id']);
    await sb
      .from('attendance')
      .insert([{ session_id: sessionId, child_id: childId, status: 'present' }]);

    return { ...user, childId, sessionId };
  }

  /** What the SERVICE ROLE can still see. RLS is not in the picture. */
  async function survivors(userId: string, childId: string) {
    const sb = adminClient();
    const count = async (table: string, column: string, value: string) =>
      ((await sb.from(table).select(column, { count: 'exact', head: true }).eq(column, value))
        .count ?? 0);
    return {
      profile: await count('profiles', 'id', userId),
      children: await count('child_profiles', 'account_id', userId),
      progress: await count('exercise_progress', 'child_id', childId),
      games: await count('game_results', 'child_id', childId),
      awards: await count('point_awards', 'child_id', childId),
      attendance: await count('attendance', 'child_id', childId),
    };
  }

  async function signIn(page: Page, email: string) {
    await page.goto(await magicLinkFor(email));
    await page.waitForURL(/\/(en\/)?compte\//, { timeout: 30_000 });
    await expect(page.getByTestId('account-panel')).toBeVisible();
  }

  /**
   * ⚠️ THE ONE THAT MATTERS. Everything else here is about not deleting by
   * accident; this is about the promise actually being kept.
   */
  test('deleting an account erases the children, progress, games, points and attendance', async ({
    page,
  }) => {
    const account = await seededAccount('del-cascade');

    const before = await survivors(account.id, account.childId);
    expect(before, 'nothing was seeded — this test would pass on an empty account').toEqual({
      profile: 1,
      children: 1,
      progress: 1,
      games: 1,
      awards: 1,
      attendance: 1,
    });

    await signIn(page, account.email);
    await page.getByTestId('account-delete-start').click();
    await page.getByTestId('account-delete-word').fill('SUPPRIMER');
    await page.getByTestId('account-delete-go').click();

    /* Signed out and back on the home page — the account no longer exists, so
       staying on /compte/ would be a page describing a deleted user. */
    await page.waitForURL(/\/(en\/)?$/, { timeout: 30_000 });

    /**
     * ⚠️ POLLED, AND GENEROUSLY — because the failure it was reporting is not a
     * reachable state of the database.
     *
     * Under the full spec fan-out this read `{profile: 1, children: 0, …}`.
     * `child_profiles.account_id` references `profiles(id) on delete cascade`
     * and nothing else deletes a child, so "the children are gone and their
     * parent profile is not" cannot be true at any instant — it is a stale read
     * across pooled PostgREST connections, and the same test passes in
     * isolation and against the RPC called directly.
     *
     * The assertion keeps its full strength: every count must reach zero. Only
     * the window widened, because a row that genuinely survives never reaches
     * zero however long we wait.
     */
    await expect
      .poll(() => survivors(account.id, account.childId), {
        message: 'rows survived an erasure',
        timeout: 20_000,
      })
      .toEqual({
        profile: 0,
        children: 0,
        progress: 0,
        games: 0,
        awards: 0,
        attendance: 0,
      });

    /* And the auth user itself — deleting the profile alone would leave an
       account that can still sign in and would get a fresh profile from the
       trigger, which is erasure that looks complete and is not. */
    const { data } = await adminClient().auth.admin.listUsers();
    expect(
      data.users.some((u) => u.id === account.id),
      'the auth user outlived the deletion — it would sign in again tomorrow',
    ).toBe(false);
  });

  /**
   * ⚠️ NOTHING IS RETAINED, AND THIS ASSERTS IT RATHER THAN THE DOCUMENT
   * CLAIMING IT. The privacy notice says no statistics and no anonymised copy
   * are kept; if a future session adds an aggregates table and forgets to say
   * so, the session row is the only thing left standing here and this test is
   * what notices.
   */
  test('the session itself survives, and carries nothing about the deleted account', async ({
    page,
  }) => {
    const account = await seededAccount('del-retain');
    await signIn(page, account.email);
    await page.getByTestId('account-delete-start').click();
    await page.getByTestId('account-delete-word').fill('SUPPRIMER');
    await page.getByTestId('account-delete-go').click();
    await page.waitForURL(/\/(en\/)?$/, { timeout: 30_000 });

    /* The club's own session is not the reader's data and is not erased. */
    const { data: session } = await adminClient()
      .from('sessions')
      .select('id,created_by')
      .eq('id', account.sessionId)
      .single();
    expect(session, 'the club session was destroyed along with the account').not.toBeNull();
    /* `created_by` is `on delete set null`, so a session a deleted staff member
       created keeps existing and stops pointing at a person. */
    expect(session?.['created_by'] ?? null, 'a deleted account is still named on a session').toBe(
      null,
    );
  });

  test('the confirm button stays disabled until the exact word is typed', async ({ page }) => {
    const account = await seededAccount('del-word');
    await signIn(page, account.email);

    await page.getByTestId('account-delete-start').click();
    const go = page.getByTestId('account-delete-go');
    await expect(go).toBeDisabled();

    /* Wrong case is REFUSED — a phone's autocapitalisation must not be enough
       on its own to arm the one irreversible control on the site. */
    await page.getByTestId('account-delete-word').fill('Supprimer');
    await expect(go).toBeDisabled();

    await page.getByTestId('account-delete-word').fill('SUPPRIMER');
    await expect(go).toBeEnabled();

    /* Cancelling puts everything back, and deletes nothing. */
    await page.getByTestId('account-delete-cancel').click();
    await expect(page.getByTestId('account-delete-confirm')).toBeHidden();
    expect((await survivors(account.id, account.childId)).profile).toBe(1);
  });

  /**
   * ⚠️ THE PRIVILEGE TEST. `delete_own_account()` takes no argument, so there
   * is no id to smuggle — this proves the shape rather than trusting it. A
   * future refactor that "helpfully" adds a target parameter fails here.
   */
  test('the RPC cannot be aimed at anyone else', async () => {
    const mine = await seededAccount('del-attacker');
    const theirs = await seededAccount('del-victim');

    const sb = await anonClientAsUser(mine.email);

    /* Passing a target at all must fail: the function has no such parameter. */
    const { error } = await sb.rpc('delete_own_account', { target: theirs.id } as never);
    expect(error, 'delete_own_account accepted a target argument').not.toBeNull();

    const { data } = await adminClient().auth.admin.listUsers();
    expect(
      data.users.some((u) => u.id === theirs.id),
      'another account was deleted',
    ).toBe(true);
  });

  test('an anonymous caller cannot reach the RPC at all', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv();
    const sb = createClient(env!.supabaseUrl, env!.anonKey, { auth: { persistSession: false } });

    const { error } = await sb.rpc('delete_own_account');
    expect(error, 'an anonymous client reached delete_own_account').not.toBeNull();
  });
});
