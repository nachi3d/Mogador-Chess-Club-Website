import { test, expect, type Page } from '@playwright/test';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { followMagicLink, reachAccountPage } from './helpers/auth';

/**
 * v2-S4 part 2 — marking a class of twenty, measured rather than asserted.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS IS THE DESIGN CONSTRAINT OF THE WHOLE FEATURE, SO IT IS MEASURED.
 *
 * "One tap per child, no modal, no save button" is a claim about how long a
 * real register takes in a real room. Claims like that decay quietly: someone
 * adds a confirmation, someone makes the row a link to a detail page, and the
 * design note in the file header goes on saying two minutes while the job
 * takes six. So this signs in a real prof, creates twenty real children and a
 * real session, and drives twenty real marks against the TEST project.
 *
 * ⚠️ WHAT THE NUMBER IS AND IS NOT. It is one browser, on a developer machine,
 * against Supabase eu-west-1 from Ireland-adjacent latency — NOT a phone on
 * Essaouira mobile data. It measures the two things the DESIGN controls: the
 * number of interactions (exactly twenty) and whether the UI ever blocks
 * between them (it must not, because the write is optimistic). Real-world
 * latency moves the write times and cannot move either of those.
 *
 * The bound is deliberately generous. A tight one would fail on a slow morning
 * and teach the next session to delete the test; what is actually being
 * guarded is that marking stayed O(one tap per child) and never became
 * O(tap, wait, dismiss).
 *
 * ── Measured, 2026-08-12, chromium against the TEST project ─────────────
 *   interaction time, 20 children ... 1 175 ms  (59 ms per child)
 *   all 20 rows durable in Postgres . 1 470 ms
 *
 * ⚠️ THAT IS THE UI'S COST, NOT A HUMAN'S PACE. Playwright taps as fast as it
 * can; a prof looking up, finding the name and tapping runs nearer a second
 * per student, so a real class of twenty is roughly half a minute. The useful
 * reading is the ratio: the interface contributes ~59 ms per child and the
 * writes finish 300 ms after the last tap, so the software is nowhere near the
 * bottleneck — the prof is, which is the correct place for it to be. If this
 * number ever climbs into the hundreds of ms, something started blocking
 * between taps.
 * ═════════════════════════════════════════════════════════════════════════
 */

const CLASS_SIZE = 20;

test.describe('v2-S4 — marking a class of twenty', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  /* One browser, one register — and it writes twenty rows. */
  test.describe.configure({ mode: 'default' });

  const createdUsers: string[] = [];
  const createdChildren: string[] = [];
  let sessionId = '';
  let profEmail = '';

  test.beforeAll(async () => {
    profEmail = e2eEmail('s4-timing-prof');
    const prof = await createConfirmedUser({ email: profEmail, displayName: 'Prof', locale: 'fr' });
    createdUsers.push(prof.id);

    const { error } = await adminClient().rpc('admin_set_role', {
      target_id: prof.id,
      new_role: 'prof',
    });
    expect(error, `admin_set_role failed: ${error?.message}`).toBeNull();

    /* Twenty children with no account — exactly the shape a prof-created
       roster will have, and the shape 0005 made possible by leaving
       `account_id` nullable. */
    const rows = Array.from({ length: CLASS_SIZE }, (_, i) => ({
      account_id: null,
      display_name: `Élève ${String(i + 1).padStart(2, '0')}`,
    }));
    const { data: kids, error: kidError } = await adminClient()
      .from('child_profiles')
      .insert(rows)
      .select('id');
    expect(kidError, `could not create the class: ${kidError?.message}`).toBeNull();
    for (const kid of kids ?? []) createdChildren.push(String(kid['id']));

    const { data: session } = await adminClient()
      .from('sessions')
      .insert([
        {
          starts_at: new Date(Date.now() + 3_600_000).toISOString(),
          title_fr: 'Séance chronométrée',
          status: 'published',
        },
      ])
      .select('id');
    sessionId = String(session?.[0]?.['id']);
  });

  test.afterAll(async () => {
    if (sessionId) {
      await adminClient().from('attendance').delete().eq('session_id', sessionId);
      await adminClient().from('sessions').delete().eq('id', sessionId);
    }
    if (createdChildren.length > 0) {
      await adminClient().from('child_profiles').delete().in('id', createdChildren);
    }
    for (const id of createdUsers) await deleteUser(id);
  });

  async function signIn(page: Page) {
    await followMagicLink(page, profEmail);
    await reachAccountPage(page);
  }

  test('twenty children, twenty taps, no modal and no save button', async ({ page }) => {
    await signIn(page);

    /* ⚠️ The prof reaches /admin from their account page, which is the only
       entry point — see AccountPage. Following the real link rather than
       navigating directly also proves the entry point works. */
    await expect(page.getByTestId('account-staff')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('account-admin-link').click();
    await page.waitForURL(/\/admin\/$/);
    await expect(page.getByTestId('admin')).toHaveAttribute('data-state', 'staff', {
      timeout: 15_000,
    });

    await page.goto('/admin/seances/');
    await expect(page.getByTestId('admin')).toHaveAttribute('data-state', 'staff', {
      timeout: 15_000,
    });

    /* Pick the session by value rather than by position — the preselection
       chooses the nearest, and another spec's session could be nearer. */
    await page.locator('[data-mark-session]').selectOption(sessionId);

    /* ⚠️ THE REGISTER LISTS THE WHOLE CLASS, which on the TEST project means
       this run's twenty PLUS whatever other specs have left behind. That is
       the marker behaving correctly — a prof marks everyone — so the rows are
       addressed by the ids this test created rather than by position. Marking
       by `nth()` would measure a different twenty on every run and would go
       wrong the moment another spec added a child. */
    const rows = page.locator('.mark-row[data-child]');
    await expect
      .poll(async () => rows.count(), { timeout: 20_000, message: 'the register never loaded' })
      .toBeGreaterThanOrEqual(CLASS_SIZE);

    const mine = createdChildren.map((id) => page.locator(`.mark-row[data-child="${id}"]`));
    for (const row of mine) await expect(row).toHaveCount(1);

    /* ── The measurement ──────────────────────────────────────────────── */
    const started = Date.now();
    for (const row of mine) {
      /* ⚠️ ONE CLICK. Not open-choose-confirm. If this ever needs a second
         interaction per child, this loop is where it shows up. */
      await row.locator('.mark-button[data-status="present"]').click();
      /* The state flips optimistically, so the next tap never waits on a
         round trip — that is what makes twenty taps take twenty taps. */
      await expect(row.locator('.mark-button[data-status="present"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
    const elapsedMs = Date.now() - started;

    /* Then wait for the register to actually land in the database. Counted
       against THIS test's children, for the same reason the taps were. */
    await expect
      .poll(
        async () => {
          const { data } = await adminClient()
            .from('attendance')
            .select('child_id')
            .eq('session_id', sessionId)
            .in('child_id', createdChildren);
          return data?.length ?? 0;
        },
        { timeout: 30_000, message: 'the twenty marks never reached the database' },
      )
      .toBe(CLASS_SIZE);
    const settledMs = Date.now() - started;

    /* eslint-disable no-console */
    console.log(
      `\n  ATTENDANCE — ${CLASS_SIZE} children:\n` +
        `    interaction time (tap → state visible, ×${CLASS_SIZE}): ${elapsedMs} ms ` +
        `(${Math.round(elapsedMs / CLASS_SIZE)} ms per child)\n` +
        `    all twenty rows durable in Postgres:                   ${settledMs} ms\n`,
    );
    /* eslint-enable no-console */

    /* ⚠️ A GENEROUS BOUND, ON PURPOSE. See the header: this guards the SHAPE
       (one tap per child, never blocking), not the network. */
    expect(
      elapsedMs,
      `marking ${CLASS_SIZE} children took ${elapsedMs}ms — the one-tap flow has regressed`,
    ).toBeLessThan(20_000);

    /* No modal appeared at any point, and nothing was left to save. */
    expect(await page.locator('dialog[open], [role="dialog"]').count()).toBe(0);

    /* And the summary tracked the pass, so a prof always knows how many are
       left — the thing that stops them losing their place in the room. It
       counts the WHOLE register, which is more than this test's twenty. */
    const total = await rows.count();
    await expect(page.locator('[data-mark-summary]')).toContainText(
      `${CLASS_SIZE} sur ${total} marqués`,
    );

    /* ⚠️ Re-marking corrects rather than duplicating. The database-level proof
       is in role-separation.spec.ts; this is the same thing through the UI a
       prof actually uses, because the upsert key and the UI's optimistic flip
       are two different ways to get this wrong. */
    await mine[0]!.locator('.mark-button[data-status="absent"]').click();
    await expect
      .poll(
        async () => {
          const { data } = await adminClient()
            .from('attendance')
            .select('child_id,status')
            .eq('session_id', sessionId)
            .in('child_id', createdChildren);
          return { rows: data?.length ?? 0, absent: (data ?? []).filter((r) => r['status'] === 'absent').length };
        },
        { timeout: 15_000, message: 're-marking duplicated a row instead of correcting it' },
      )
      .toEqual({ rows: CLASS_SIZE, absent: 1 });
  });
});
