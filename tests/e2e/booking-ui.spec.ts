import { test, expect, type Page, type Locator } from '@playwright/test';
import { isSupabaseConfigured } from './env';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { followMagicLink, reachAccountPage } from './helpers/auth';

/**
 * The booking controls on `/agenda/` — THROUGH A BROWSER.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS SPEC EXISTS BECAUSE THE AUDIT THAT SHRANK THE GATE FOUND THAT IT
 * DID NOT.
 *
 * v0.18.0 shipped session booking with `booking.spec.ts` covering it — and that
 * file never opens a page. It is 14 tests of `rpc()` calls and cutoff
 * arithmetic: capacity under concurrency, the partial unique index, RLS, the
 * rebuild-trigger count. All of it worth having, none of it able to see a
 * button.
 *
 * So the per-child controls on `/agenda/` reached production untested on EVERY
 * engine, and they are **painted by script** — the same surface class as the
 * admin "Créer" button, which did nothing at all on WebKit for a whole release
 * (956b05a). `booking.spec.ts` would have stayed green throughout.
 *
 * ⚠️ THE DIVISION OF LABOUR, AND WHY IT IS NOT ARBITRARY. `booking.spec.ts`
 * asserts the RULE, in the database, with real tokens — because capacity is
 * enforced in Postgres and a parent with devtools does not use the buttons.
 * This file asserts that a parent can REACH the rule with a tap, and that what
 * they are told afterwards is true. Neither can see the other's failures.
 *
 * ⚠️ IT DRIVES THE BAKED AGENDA RATHER THAN A SESSION IT CREATED. `/agenda/` is
 * baked at build time (Critical Feature 49), so a session inserted at runtime is
 * not on the page and never will be. The panels are therefore read OFF THE PAGE
 * and chosen by their `data-starts-at`, which also means this spec keeps working
 * as the seed moves.
 * ═════════════════════════════════════════════════════════════════════════
 */

/** Any request that looks like Supabase — same test as `auth.spec.ts`. */
const isSupabaseRequest = (url: string): boolean => /supabase\.(co|in)|supabase-js/i.test(url);

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

interface Panel {
  readonly sessionId: string;
  readonly startsAt: number;
  readonly root: Locator;
}

/** Every booking panel the baked page carries, with the instant it is for. */
async function panels(page: Page): Promise<Panel[]> {
  const found = await page.locator('[data-booking]').evaluateAll((nodes) =>
    nodes.map((n, i) => ({
      index: i,
      sessionId: (n as HTMLElement).dataset['sessionId'] ?? '',
      startsAt: (n as HTMLElement).dataset['startsAt'] ?? '',
    })),
  );
  return found.map((f) => ({
    sessionId: f.sessionId,
    startsAt: Date.parse(f.startsAt),
    root: page.locator('[data-booking]').nth(f.index),
  }));
}

/**
 * A panel far enough out that `cancel_booking()`'s two-hour cutoff cannot
 * interfere, so booking AND cancelling are both available.
 *
 * ⚠️ SKIPS RATHER THAN GUESSES when the baked agenda holds nothing suitable.
 * A vacuous pass here would read as "booking works".
 */
async function bookablePanel(page: Page): Promise<Panel> {
  const all = await panels(page);
  const cutoff = Date.now() + TWO_HOURS_MS;
  const usable = all.find((p) => Number.isFinite(p.startsAt) && p.startsAt > cutoff);
  test.skip(
    !usable,
    'the baked agenda carries no session more than two hours out — re-seed the ' +
      'test project and rebuild; a pass here would be vacuous',
  );
  return usable!;
}

test.describe('the booking controls on /agenda/', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');

  const created: string[] = [];

  /* ⚠️ THE SEEDED SESSION IS SHARED, so a place left held leaks into the next
     run's capacity and would eventually make every booking test fail with
     `full`. The booking rows cascade with the child, which cascades with the
     account, so deleting the user frees the place. */
  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  /**
   * Signed in, and SETTLED.
   *
   * ⚠️ `followMagicLink()` ALONE IS NOT ENOUGH — navigating away before the
   * callback has written the session leaves `/agenda/` looking signed-out, and
   * the failure arrives as "the booking button never appeared", which points at
   * the wrong file entirely. `reachAccountPage()` is the house wait, and it
   * also clears `/bienvenue/` for a first sign-in.
   */
  async function signIn(page: Page, label: string, displayName: string) {
    const email = e2eEmail(label);
    const user = await createConfirmedUser({ email, displayName });
    created.push(user.id);
    await followMagicLink(page, email);
    await reachAccountPage(page);
    return user;
  }

  /** The roster as `fetchChildren()` sees it: by `created_at`, oldest first. */
  async function roster(accountId: string): Promise<{ id: string; name: string }[]> {
    const { data } = await adminClient()
      .from('child_profiles')
      .select('id,display_name')
      .eq('account_id', accountId)
      .order('created_at');
    return (data ?? []).map((r) => ({ id: String(r['id']), name: String(r['display_name']) }));
  }

  /**
   * Signed in, on `/agenda/`, with the child the UI will actually use.
   *
   * ⚠️⚠️ IT READS THE ROSTER BACK RATHER THAN SEEDING ONE, AND THAT IS THE
   * WHOLE POINT. Seeding first produced a spec that failed while the feature
   * worked: `/compte/` runs `resolveChild()`, which ADOPTS a child for an
   * account that has none — asynchronously. Deleting and re-inserting around it
   * raced the adoption and left TWO children of the same name, so the page
   * booked the adopted one and the assertion looked at the seeded one. The page
   * said "C’est réservé." and the database agreed; only the spec was wrong.
   *
   * ⚠️ SO THE CHILD IS WHATEVER ONBOARDING PRODUCED, and the first booking row
   * belongs to the first child by `created_at` — which is the order
   * `fetchChildren()` uses, so `.first()` on the page and `[0]` here are the
   * same learner by construction rather than by luck.
   */
  async function signInWithChild(page: Page, label: string, childName: string) {
    const user = await signIn(page, label, childName);
    await page.goto('/agenda/');

    /* The adoption is in flight when /compte/ hands over; poll rather than
       assume it has landed. */
    let kids = await roster(user.id);
    for (let i = 0; i < 20 && kids.length === 0; i += 1) {
      await page.waitForTimeout(500);
      kids = await roster(user.id);
    }
    expect(kids.length, `no child profile was ever created for ${label}`).toBeGreaterThan(0);
    return { user, childId: kids[0]!.id, childName: kids[0]!.name };
  }

  /**
   * What the DATABASE holds for this child — the row, never the painting.
   *
   * ⚠️ IT THROWS ON A QUERY ERROR RATHER THAN RETURNING 0. A failed count and
   * "the booking did not happen" are the same number, and the first one masked
   * the second for a whole debugging pass while this spec was being written.
   */
  async function confirmedBookings(childId: string, sessionId: string): Promise<number> {
    const { data, error } = await adminClient()
      .from('bookings')
      .select('id,status,session_id,child_id')
      .eq('child_id', childId)
      .eq('status', 'confirmed');
    if (error) throw new Error(`counting bookings failed: ${error.message}`);
    const rows = data ?? [];
    const here = rows.filter((r) => String(r['session_id']) === sessionId);
    if (rows.length && !here.length) {
      throw new Error(
        `the child has ${rows.length} confirmed booking(s), none for the session under ` +
          `test (${sessionId}): ${JSON.stringify(rows)}`,
      );
    }
    return here.length;
  }

  const bookButton = (panel: Panel) => panel.root.locator('[data-booking-create]');
  const cancelButton = (panel: Panel) => panel.root.locator('[data-booking-cancel]');
  const message = (panel: Panel) => panel.root.locator('[data-booking-message]');

  /**
   * ⚠️ THE GUEST RULE, ON THE ONE PUBLIC PAGE THAT NOW HAS AN ACCOUNT FEATURE
   * ON IT. `/agenda/` is where the zero-request rule is easiest to lose: the
   * booking script wants to know whether anyone is signed in, and asking
   * Supabase that question is already the violation, because constructing the
   * client can refresh a token.
   */
  for (const path of ['/agenda/', '/en/agenda/']) {
    test(`${path} signed out: an invitation, and NO Supabase request`, async ({ page }) => {
      const hits: string[] = [];
      page.on('request', (r) => {
        if (isSupabaseRequest(r.url())) hits.push(r.url());
      });

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      expect(hits, `signed-out ${path} touched Supabase:\n${hits.join('\n')}`).toEqual([]);

      const all = await panels(page);
      expect(all.length, 'the baked agenda rendered no booking panel at all').toBeGreaterThan(0);
      await expect(all[0]!.root.locator('[data-booking-signedout]')).toBeVisible();
      /* Nothing was painted, because nothing ran. */
      await expect(all[0]!.root.locator('[data-booking-create]')).toHaveCount(0);
    });
  }

  test('an account with NO child is told to add one, not shown a dead button', async ({ page }) => {
    const user = await signIn(page, 'booking-ui-nokid', 'Sans enfant');
    /* ⚠️ THE DELETE COMES AFTER A FULL LOAD, NOT BEFORE ONE. `resolveChild()`
       adopts asynchronously from /compte/, so emptying the roster too early
       races the adoption and the child reappears. Load once to let it land,
       empty the roster, then reload — /agenda/ itself only READS children. */
    await page.goto('/agenda/');
    await page.waitForLoadState('networkidle');
    await adminClient().from('child_profiles').delete().eq('account_id', user.id);
    await page.reload();

    const panel = await bookablePanel(page);
    await expect(panel.root.locator('[data-booking-children]')).toContainText(/profil/i, {
      timeout: 15_000,
    });
    await expect(bookButton(panel)).toHaveCount(0);
  });

  test('a parent books a place with one press, and the database agrees', async ({ page }) => {
    const { childId, childName } = await signInWithChild(page, 'booking-ui-book', 'Amina');
    const panel = await bookablePanel(page);

    const button = bookButton(panel).first();
    await expect(button).toBeVisible({ timeout: 15_000 });
    /* The accessible name carries the child, because a row of identical
       "Réserver" buttons is unusable by voice or by screen reader.
       ⚠️ Compared as a STRING, not built into a RegExp — the name comes from
       the database and a `(` in it would turn this into a pattern error. */
    expect(
      await button.getAttribute('aria-label'),
      'the button must name which child it books for',
    ).toContain(childName);

    expect(await confirmedBookings(childId, panel.sessionId)).toBe(0);
    await button.click();

    await expect(cancelButton(panel).first()).toBeVisible();
    await expect(message(panel)).not.toBeEmpty();
    expect(
      await confirmedBookings(childId, panel.sessionId),
      `the page said "${await message(panel).textContent()}"`,
    ).toBe(1);
  });

  /**
   * ⚠️⚠️ THE REGRESSION THIS FILE EXISTS FOR — THE "CRÉER" CLASS.
   *
   * Every press here lands on a control that the PREVIOUS press rebuilt:
   * `renderRow()` is called again from the click handler's own refresh, so the
   * button under the pointer is replaced between actions. That is one step away
   * from the shape that killed the admin submit on WebKit, where a DOM write
   * between `mousedown` and `mouseup` stopped the click being synthesised at
   * all.
   *
   * ⚠️ NO RELOAD BETWEEN THE PRESSES, AND DO NOT ADD ONE. A reload would rebuild
   * the page from HTML and the test would pass against a build where the
   * repaint path is broken — which is exactly the bug it is here to catch.
   *
   * ⚠️ EACH STEP IS CONFIRMED AGAINST THE DATABASE, not against the button's own
   * label. The label is painted by the same code under test.
   */
  test('the control survives its own repaint — book, cancel, book, no reload', async ({ page }) => {
    const { childId } = await signInWithChild(page, 'booking-ui-repaint', 'Yassine');
    const panel = await bookablePanel(page);

    await expect(bookButton(panel).first()).toBeVisible({ timeout: 15_000 });
    await bookButton(panel).first().click();
    await expect(cancelButton(panel).first()).toBeVisible({ timeout: 15_000 });
    expect(await confirmedBookings(childId, panel.sessionId), 'first press did not book').toBe(1);

    await cancelButton(panel).first().click();
    await expect(bookButton(panel).first()).toBeVisible();
    expect(
      await confirmedBookings(childId, panel.sessionId),
      'the cancel press did nothing — the repainted control is dead',
    ).toBe(0);

    await bookButton(panel).first().click();
    await expect(cancelButton(panel).first()).toBeVisible();
    expect(
      await confirmedBookings(childId, panel.sessionId),
      're-booking after a cancellation failed — the partial unique index or the repaint',
    ).toBe(1);
  });

  /**
   * ⚠️ A REFUSAL IS A SENTENCE, NEVER A SILENT NO-OP (Critical Feature 74).
   *
   * The baked page is a hint and `create_booking()` is the truth, so a reader
   * looking at a stale agenda is the NORMAL case rather than an edge one. A
   * session that has already started is the one stale state the baked page
   * reliably produces, and it exercises the whole path: a code comes back from
   * Postgres, `ui.ts` turns it into the reader's own language, and it lands in
   * the live region.
   */
  test('a session that has already started refuses in words', async ({ page }) => {
    const { childId } = await signInWithChild(page, 'booking-ui-stale', 'Karim');

    const all = await panels(page);
    const past = all.find((p) => Number.isFinite(p.startsAt) && p.startsAt <= Date.now());
    test.skip(
      !past,
      'the baked agenda carries no session in the past — nothing stale to press ' +
        '(re-seed and rebuild to restore this coverage)',
    );

    const button = bookButton(past!).first();
    await expect(button).toBeVisible({ timeout: 15_000 });
    await button.click();

    /* Something readable, and the booking did NOT happen. */
    await expect(message(past!)).not.toBeEmpty();
    expect(await confirmedBookings(childId, past!.sessionId)).toBe(0);
  });
});
