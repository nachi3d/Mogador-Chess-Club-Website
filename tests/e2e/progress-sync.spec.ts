import { test, expect, type Page } from '@playwright/test';
import { createConfirmedUser, deleteUser, e2eEmail, magicLinkFor, adminClient } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { reachAccountPage } from './helpers/auth';

/**
 * v2-S3 — progress sync, the first-sign-in merge and the offline queue.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE MERGE IS THE PART THAT CANNOT BE GOT WRONG. It runs ONCE, on a real
 * student's real work, and there is no undo. So it is tested with CONFLICTING
 * state seeded on BOTH sides — not just empty-into-full, which is the case that
 * passes even when the rules are backwards.
 *
 * Everything here needs a live TEST Supabase project and `PUBLIC_AUTH_ENABLED`.
 * When either is missing the tests SKIP VISIBLY, naming the reason: a suite
 * that appears to cover the merge and does not is worse than one that admits
 * it.
 * ═════════════════════════════════════════════════════════════════════════
 */

const PROGRESS_KEY = 'mcc:progress:v1';
const SYNC_KEY = 'mcc:sync:v1';
const AUTH_FLAG = 'mcc:auth:v1';

test.describe('v2-S3 — progress sync', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  const created: string[] = [];
  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /** Seed the local store before any page script runs. */
  async function seedLocal(page: Page, progress: unknown) {
    await page.addInitScript(
      ([key, flag, value]) => {
        try {
          window.localStorage.setItem(key as string, value as string);
          window.localStorage.setItem(flag as string, '1');
        } catch {
          /* nothing to do */
        }
      },
      [PROGRESS_KEY, AUTH_FLAG, JSON.stringify(progress)],
    );
  }

  const readLocal = (page: Page) =>
    page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '{}'), PROGRESS_KEY);

  async function signIn(page: Page, email: string) {
    const link = await magicLinkFor(email);
    await page.goto(link);
    await reachAccountPage(page);
  }

  const solved = (at: string) => ({ solved: true, attempts: 0, hintUsed: false, solvedAt: at });

  /* ═══ Merge case 1 — empty cloud, full device ═════════════════════════ */

  /**
   * ⚠️ SINCE 0005 THE ROWS BELONG TO A CHILD, NOT TO THE ACCOUNT.
   *
   * A fresh account holds none until the client's `resolveChild()` mints one on
   * first sync — which is exactly the path under test, so a spec that SEEDS the
   * cloud has to create the child first, and one that READS it has to wait for
   * the client to have created it. `childOf` does both: it returns the existing
   * child, or makes the one the client would have made.
   *
   * It is deliberately not a fixture. Making it eager would create the child
   * before sign-in in every test, and the "a new account gets one" behaviour
   * would then never be exercised by anything.
   */
  async function childOf(accountId: string, create = true): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const { data } = await adminClient()
        .from('child_profiles')
        .select('id')
        .eq('account_id', accountId);
      if (data?.[0]) return String(data[0]['id']);
      if (create) {
        const { data: made } = await adminClient()
          .from('child_profiles')
          .insert([{ account_id: accountId, display_name: 'Élève' }])
          .select('id');
        if (made?.[0]) return String(made[0]['id']);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`no child profile ever appeared for ${accountId}`);
  }

  test('empty → full: a guest month is carried up, and reported', async ({ page }) => {
    const email = e2eEmail('merge-empty');
    const user = await createConfirmedUser({ email, displayName: 'Sara' });
    created.push(user.id);

    await seedLocal(page, {
      exercises: {
        'mat-du-couloir': solved('2026-01-01T10:00:00.000Z'),
        'tutorial:la-tour': solved('2026-01-02T10:00:00.000Z'),
        'lesson:bien-ouvrir-une-partie:occuper-le-centre:0': solved('2026-01-03T10:00:00.000Z'),
        'lesson:bien-ouvrir-une-partie:occuper-le-centre:1': solved('2026-01-03T10:05:00.000Z'),
      },
      games: { avance: { wins: 2, draws: 0, losses: 1 } },
      announced: [],
    });
    await signIn(page, email);

    /* The account page runs the import itself; wait for it to settle. */
    await expect(page.getByTestId('sync-import')).toBeVisible({ timeout: 30_000 });

    const { data: rows } = await adminClient()
      .from('exercise_progress')
      .select('exercise_slug, kind, solved')
      .eq('child_id', await childOf(user.id, false));
    expect(rows?.length, 'all four boards reached the cloud').toBe(4);
    expect(new Set(rows?.map((r) => r['kind']))).toEqual(new Set(['exercise', 'tutorial', 'lesson']));

    const { data: games } = await adminClient()
      .from('game_results')
      .select('id, outcome')
      .eq('child_id', await childOf(user.id, false));
    expect(games?.length, 'three games (2 wins + 1 loss) became three rows').toBe(3);

    /* ⚠️ The reader is TOLD. Silent success is indistinguishable from silent
       loss, which is the whole reason this message exists. */
    await expect(page.getByTestId('sync-import')).toContainText(/\d/);
  });

  /* ═══ Merge case 2 — full cloud, empty device ═════════════════════════ */

  test('full → empty: a new device receives everything', async ({ page }) => {
    const email = e2eEmail('merge-newdevice');
    const user = await createConfirmedUser({ email, displayName: 'Omar' });
    created.push(user.id);
    const childId = await childOf(user.id);

    await adminClient()
      .from('exercise_progress')
      .insert([
        { child_id: childId, exercise_slug: 'mat-du-couloir', kind: 'exercise', solved: true, attempts: 4, hint_used: true, solved_at: '2025-12-01T09:00:00.000Z' },
        { child_id: childId, exercise_slug: 'tutorial:le-fou', kind: 'tutorial', solved: true, attempts: 1, hint_used: false, solved_at: '2025-12-02T09:00:00.000Z' },
      ]);

    await seedLocal(page, { exercises: {}, games: {}, announced: [] });
    await signIn(page, email);
    await expect(page.getByTestId('sync-import')).toBeVisible({ timeout: 30_000 });

    const local = await readLocal(page);
    expect(Object.keys(local.exercises ?? {}).sort()).toEqual([
      'mat-du-couloir',
      'tutorial:le-fou',
    ]);
    expect(local.exercises['mat-du-couloir'].attempts).toBe(4);
    expect(local.exercises['mat-du-couloir'].hintUsed).toBe(true);
  });

  /* ═══ Merge case 3 — CONFLICT on the same exercise ════════════════════ */

  /**
   * ⚠️ THE CASE THAT CATCHES A BACKWARDS RULE. Both sides know the same
   * exercise and disagree about every field. Empty-into-full passes even when
   * `solvedAt` takes the latest and `attempts` takes the minimum; this does not.
   */
  test('conflict: solved wins, attempts max, hint OR, solvedAt EARLIEST', async ({ page }) => {
    const email = e2eEmail('merge-conflict');
    const user = await createConfirmedUser({ email, displayName: 'Yasmine' });
    created.push(user.id);

    const childId = await childOf(user.id);

    /* Cloud: solved LATER, fewer attempts, hint not used. */
    await adminClient().from('exercise_progress').insert([
      {
        child_id: childId,
        exercise_slug: 'mat-du-couloir',
        kind: 'exercise',
        solved: true,
        attempts: 2,
        hint_used: false,
        solved_at: '2026-03-01T00:00:00.000Z',
      },
      /* Cloud has it UNSOLVED; the device solved it. */
      {
        child_id: childId,
        exercise_slug: 'tutorial:la-dame',
        kind: 'tutorial',
        solved: false,
        attempts: 9,
        hint_used: true,
        solved_at: null,
      },
    ]);

    /* Device: solved EARLIER, more attempts, hint used. */
    await seedLocal(page, {
      exercises: {
        'mat-du-couloir': {
          solved: true,
          attempts: 7,
          hintUsed: true,
          solvedAt: '2026-01-15T00:00:00.000Z',
        },
        'tutorial:la-dame': {
          solved: true,
          attempts: 1,
          hintUsed: false,
          solvedAt: '2026-02-01T00:00:00.000Z',
        },
      },
      games: {},
      announced: [],
    });
    await signIn(page, email);
    await expect(page.getByTestId('sync-import')).toBeVisible({ timeout: 30_000 });

    const local = await readLocal(page);
    const a = local.exercises['mat-du-couloir'];
    expect(a.solved, 'solved anywhere is solved').toBe(true);
    expect(a.attempts, 'attempts takes the MAX').toBe(7);
    expect(a.hintUsed, 'hintUsed is an OR').toBe(true);
    expect(a.solvedAt, 'solvedAt takes the EARLIEST').toBe('2026-01-15T00:00:00.000Z');

    const b = local.exercises['tutorial:la-dame'];
    expect(b.solved, 'solved on the device wins over unsolved in the cloud').toBe(true);
    expect(b.attempts).toBe(9);
    expect(b.hintUsed).toBe(true);
    expect(b.solvedAt).toBe('2026-02-01T00:00:00.000Z');

    /* And the cloud now agrees with the union. */
    const { data: rows } = await adminClient()
      .from('exercise_progress')
      .select('exercise_slug, solved, attempts, hint_used, solved_at')
      .eq('child_id', await childOf(user.id, false))
      .eq('exercise_slug', 'mat-du-couloir');
    expect(rows?.[0]?.['attempts']).toBe(7);
    expect(rows?.[0]?.['solved_at']).toBe('2026-01-15T00:00:00+00:00');
  });

  /* ═══ Merge case 4 — idempotency ══════════════════════════════════════ */

  test('running the merge twice changes nothing', async ({ page }) => {
    const email = e2eEmail('merge-twice');
    const user = await createConfirmedUser({ email, displayName: 'Nadia' });
    created.push(user.id);

    await seedLocal(page, {
      exercises: { 'mat-du-couloir': solved('2026-01-01T10:00:00.000Z') },
      games: { debutant: { wins: 1, draws: 0, losses: 2 } },
      announced: [],
    });
    await signIn(page, email);
    await expect(page.getByTestId('sync-import')).toBeVisible({ timeout: 30_000 });

    const first = await readLocal(page);
    const { data: g1 } = await adminClient().from('game_results').select('id').eq('child_id', await childOf(user.id, false));

    /* Run it again — a reload re-enters the account page and re-imports. */
    await page.reload();
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const second = await readLocal(page);
    const { data: g2 } = await adminClient().from('game_results').select('id').eq('child_id', await childOf(user.id, false));

    expect(second, 'the local store is byte-identical after a second run').toEqual(first);
    expect(g2?.length, 'no duplicate games — the union is by id').toBe(g1?.length);
    expect(g2?.length).toBe(3);
  });

  /* ═══ The offline queue ═══════════════════════════════════════════════ */

  /**
   * ⚠️ THE CLASSROOM CASE. A student works a whole session on bad wifi and
   * reconnects later; everything must arrive. This is the reason the PWA
   * exists, and the reason the queue survives a reload.
   */
  test('a whole session offline survives a reload and arrives on reconnect', async ({ page, context }) => {
    const email = e2eEmail('offline');
    const user = await createConfirmedUser({ email, displayName: 'Karim' });
    created.push(user.id);

    await seedLocal(page, { exercises: {}, games: {}, announced: [] });
    await signIn(page, email);
    await expect(page.getByTestId('sync-import')).toBeVisible({ timeout: 30_000 });

    /* ⚠️ LOAD THE PAGE FIRST, THEN GO OFFLINE. Navigating while offline fails
       with ERR_INTERNET_DISCONNECTED and tests nothing about the queue — the
       student in the classroom already has the page open. */
    await page.goto('/exercices/mat-du-couloir/');
    await page.locator('cg-board').waitFor({ timeout: 20_000 });
    await context.setOffline(true);

    await page.evaluate(
      ([syncKey]) => {
        /* The built site has no module URL to import, so the queue is written
           in exactly the shape `queueExercise` produces. The SHAPE is the
           contract under test here; the write path itself is covered by the
           merge tests, which go through `progress.ts` end to end. */
        const rec = JSON.parse(
          window.localStorage.getItem(syncKey as string) ?? '{"queue":[],"imported":[]}',
        );
        for (const slug of ['offline-a', 'offline-b', 'tutorial:offline-c']) {
          rec.queue.push({
            t: 'exercise',
            slug,
            p: { solved: true, attempts: 1, hintUsed: false, solvedAt: '2026-04-01T00:00:00.000Z' },
          });
        }
        window.localStorage.setItem(syncKey as string, JSON.stringify(rec));
      },
      [SYNC_KEY],
    );

    const queuedOffline = await page.evaluate(
      (k) => JSON.parse(window.localStorage.getItem(k) ?? '{}').queue?.length ?? 0,
      SYNC_KEY,
    );
    expect(queuedOffline, 'the session was queued while offline').toBe(3);

    /**
     * ⚠️ RELOAD WHILE STILL OFFLINE — a phone that sleeps, a tab the OS
     * discards. The navigation itself fails and tears down the context, which
     * is exactly what a student's device does; what matters is that nothing was
     * being held in memory.
     *
     * Survival is then proved by ARRIVAL rather than by reading the queue back:
     * after the reload the only copy of that session is in `localStorage`, so
     * if the rows reach the cloud after reconnecting, the queue survived. That
     * is also the assertion that matters to the student.
     */
    await page.reload().catch(() => {});
    await context.setOffline(false);
    await page.goto('/progres/');
    await expect
      .poll(
        async () => {
          const { data } = await adminClient()
            .from('exercise_progress')
            .select('exercise_slug')
            .eq('child_id', await childOf(user.id, false));
          return data?.length ?? 0;
        },
        { timeout: 30_000, message: 'the offline session never arrived after reconnect' },
      )
      .toBe(3);

    const empty = await page.evaluate(
      (k) => JSON.parse(window.localStorage.getItem(k) ?? '{}').queue?.length ?? 0,
      SYNC_KEY,
    );
    expect(empty, 'the queue drained once it had been pushed').toBe(0);
  });

  /* ═══ Signing out keeps the work ══════════════════════════════════════ */

  test('signing out does NOT delete local progress', async ({ page }) => {
    const email = e2eEmail('signout');
    const user = await createConfirmedUser({ email, displayName: 'Leïla' });
    created.push(user.id);

    await seedLocal(page, {
      exercises: { 'mat-du-couloir': solved('2026-01-01T10:00:00.000Z') },
      games: {},
      announced: [],
    });
    await signIn(page, email);
    await expect(page.getByTestId('sync-import')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('account-signout').click();
    await page.waitForURL(/\/(en\/)?$|connexion/, { timeout: 20_000 });

    const local = await readLocal(page);
    expect(
      local.exercises?.['mat-du-couloir']?.solved,
      'the student keeps working as a guest, with their work',
    ).toBe(true);

    /* And the site still shows it. */
    await page.goto('/progres/');
    await expect(page.locator('[data-score-points]').first()).not.toHaveText('0');
  });
});
