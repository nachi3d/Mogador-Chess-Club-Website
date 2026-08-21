import { test, expect, type Page } from '@playwright/test';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { isSupabaseConfigured } from './env';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { followMagicLink, reachAccountPage } from './helpers/auth';
import { expandSeries, SERIES_MAX } from '../../src/lib/recurrence';

/**
 * Repeating a session — and the ONE thing that must not multiply with it.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE CLAIM UNDER TEST IS ABOUT A TRIGGER, SO IT IS COUNTED.
 *
 * Migration 0011 hangs an `AFTER … FOR EACH STATEMENT` trigger on `sessions`
 * that pokes a Cloudflare deploy hook. Statement-level fires ONCE per
 * statement — which makes "thirteen sessions cost one build" a property of the
 * CLIENT, not of the database: it holds only for as long as `createSessions()`
 * sends one multi-row insert instead of thirteen inserts.
 *
 * That is exactly the kind of claim that decays quietly. A future session
 * refactors the writer into a `for` loop, everything on screen looks identical,
 * every other spec stays green, and the club spends thirteen Cloudflare builds
 * every time a term is programmed. So the trigger writes a row per firing into
 * `rebuild_requests`, and this file counts them.
 *
 * ⚠️ THE COUNT IS CONTAMINATION-PROOF BY CONSTRUCTION, AND IT HAS TO BE:
 * `fullyParallel` is on, so `role-separation.spec.ts` and
 * `attendance-timing.spec.ts` are creating their own sessions in other workers
 * while this runs. The assertion is therefore never "N firings happened" — it
 * is "exactly one firing says it touched 13 rows". A loop of thirteen inserts
 * cannot produce that row at all (it produces thirteen rows each saying 1), and
 * no other spec touches thirteen rows in one statement. Extra unrelated firings
 * in the window cannot make it pass.
 *
 * ⚠️ THE TEST PROJECT HAS NO `cloudflare_deploy_hook` IN ITS VAULT, and must
 * never have one. The trigger logs the firing and sends nothing — which is what
 * makes counting firings safe against a project whose sibling is production.
 *
 * ⚠️ WHAT IS *NOT* COVERED HERE, STATED RATHER THAN IMPLIED: the suppression
 * seam (`set local mcc.rebuild = 'off'` + one `request_site_rebuild()` at the
 * end). PostgREST gives a spec no way to express a transaction, so a `set
 * local` cannot be reached from this suite at all. It is verified by hand in
 * the SQL editor, and the snippet is in `docs/reference/deployment.md`. It is
 * also used by NO application code path — every one of them is already a single
 * statement, which is the better answer wherever it is available.
 * ═════════════════════════════════════════════════════════════════════════
 */

/* ── The arithmetic, with no browser and no database ─────────────────────── */

test.describe('expandSeries — the expansion happens once, and it is arithmetic', () => {
  /**
   * ⚠️ NO SKIP ON THIS BLOCK. It needs neither the auth flag nor `.env.test`,
   * so it runs in BOTH flag shapes and on a machine with no credentials at all.
   * The rest of the file cannot, and a feature whose only coverage is behind a
   * flag is a feature that goes unchecked on the default build.
   */
  test('weekly until twelve weeks out is thirteen sessions, not twelve', () => {
    const result = expandSeries({
      startLocal: '2029-03-07T18:00',
      cadence: 'weekly',
      untilLocal: '2029-05-30',
    });
    expect(result.ok, 'a plain weekly term was refused').toBe(true);
    /* ⚠️ THIRTEEN, INCLUDING THE FIRST. The off-by-one here is the difference
       between a term that ends on the right day and one that quietly stops a
       week early — and nothing on screen would look wrong. */
    expect(result.ok && result.dates.length).toBe(13);
    expect(result.ok && result.dates[0]!.getDate()).toBe(7);
    expect(result.ok && result.dates[12]!.getDate()).toBe(30);
  });

  test('fortnightly over the same range is seven', () => {
    const result = expandSeries({
      startLocal: '2029-03-07T18:00',
      cadence: 'fortnightly',
      untilLocal: '2029-05-30',
    });
    expect(result.ok && result.dates.length).toBe(7);
  });

  test('no repetition is one session, and needs no end date', () => {
    const result = expandSeries({ startLocal: '2029-03-07T18:00', cadence: 'none', untilLocal: '' });
    expect(result.ok && result.dates.length).toBe(1);
  });

  /**
   * ⚠️ REFUSED, NEVER TRUNCATED. Creating the first 52 of 523 and saying
   * nothing would leave a prof believing the rest exist — and the rest are in
   * the public agenda, where nobody would check.
   */
  test('a mistyped year is refused and says how many were asked for', () => {
    const result = expandSeries({
      startLocal: '2029-03-07T18:00',
      cadence: 'weekly',
      untilLocal: '2039-03-07',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toBe('too-many');
    expect(!result.ok && (result.wanted ?? 0), 'the refusal did not say how many').toBeGreaterThan(
      SERIES_MAX,
    );
  });

  test('an end date before the start is refused rather than producing nothing', () => {
    const result = expandSeries({
      startLocal: '2029-03-07T18:00',
      cadence: 'weekly',
      untilLocal: '2029-01-01',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toBe('until-before-start');
  });

  /**
   * ⚠️ THE ONE THAT MATTERS IN MOROCCO. The country drops to UTC+0 for Ramadan
   * and back again, so stepping by `7 × 86 400 000` milliseconds moves an 18:00
   * session to 17:00 for part of the spring — with nothing on any screen
   * looking wrong, and a parent arriving an hour late.
   *
   * The invariant is asserted in whatever zone the runner happens to be in: the
   * local clock time and the weekday must be identical for every occurrence. In
   * a zone with a transition inside the range — which a full year has almost
   * everywhere — millisecond arithmetic fails this. In a fixed-offset zone it
   * is merely true, which costs nothing.
   */
  test('every occurrence keeps the same local clock time and weekday', () => {
    const result = expandSeries({
      startLocal: '2029-01-03T18:30',
      cadence: 'weekly',
      untilLocal: '2029-12-19',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dates.length).toBeGreaterThan(40);
    for (const date of result.dates) {
      expect(date.getHours(), 'a DST transition moved the hour').toBe(18);
      expect(date.getMinutes()).toBe(30);
      expect(date.getDay(), 'a DST transition moved the weekday').toBe(
        result.dates[0]!.getDay(),
      );
    }
  });
});

/* ── Through the real UI, against the real database ──────────────────────── */

/** Far enough out that nothing else in the suite is anywhere near these dates. */
const START_LOCAL = '2029-03-07T18:00';
const UNTIL_LOCAL = '2029-05-30';
const EXPECTED = 13;
/** A duration no other spec uses — the second half of "these rows are ours". */
const MARKER_DURATION = 47;

test.describe('a recurring set is ONE statement and thirteen ordinary rows', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');
  /* ⚠️ SERIAL. The second test acts on the series the first one created, and
     running it against a series that was never made would fail with a confusing
     "no session card" rather than pointing at the real failure. */
  test.describe.configure({ mode: 'serial' });

  const createdUsers: string[] = [];
  let profEmail = '';
  let seriesId = '';
  /** The last log row before this file did anything — the count's baseline. */
  let baselineLogId = 0;

  async function lastLogId(): Promise<number> {
    const { data, error } = await adminClient()
      .from('rebuild_requests')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    expect(error, `rebuild_requests unreadable: ${error?.message}`).toBeNull();
    return data?.[0] ? Number(data[0]['id']) : 0;
  }

  /** Firings logged since `sinceId`, optionally narrowed to a row count. */
  async function firings(sinceId: number, opts: { source?: string; rows?: number } = {}) {
    let query = adminClient()
      .from('rebuild_requests')
      .select('id,source,rows_changed,dispatched,note')
      .gt('id', sinceId);
    if (opts.source) query = query.eq('source', opts.source);
    if (opts.rows !== undefined) query = query.eq('rows_changed', opts.rows);
    const { data, error } = await query;
    expect(error, `rebuild_requests unreadable: ${error?.message}`).toBeNull();
    return data ?? [];
  }

  async function ourSessions() {
    const { data, error } = await adminClient()
      .from('sessions')
      .select('id,starts_at,status,series_id,duration_minutes')
      .eq('duration_minutes', MARKER_DURATION)
      .gte('starts_at', '2029-01-01T00:00:00Z')
      .lte('starts_at', '2029-12-31T00:00:00Z')
      .order('starts_at');
    expect(error, `sessions unreadable: ${error?.message}`).toBeNull();
    return data ?? [];
  }

  test.beforeAll(async () => {
    /* A previous crashed run could have left a series behind, and this file
       identifies its rows by shape rather than by id. Start from clean. */
    await adminClient()
      .from('sessions')
      .delete()
      .eq('duration_minutes', MARKER_DURATION)
      .gte('starts_at', '2029-01-01T00:00:00Z')
      .lte('starts_at', '2029-12-31T00:00:00Z');

    profEmail = e2eEmail('recurring-prof');
    const prof = await createConfirmedUser({ email: profEmail, displayName: 'Prof', locale: 'fr' });
    createdUsers.push(prof.id);
    const { error } = await adminClient().rpc('admin_set_role', {
      target_id: prof.id,
      new_role: 'prof',
    });
    expect(error, `admin_set_role failed: ${error?.message}`).toBeNull();

    baselineLogId = await lastLogId();
  });

  test.afterAll(async () => {
    /* ⚠️ THIS SPEC MUST CLEAN UP ITS OWN SESSIONS. The global purge only
       collects rows with no title AND no notes; these have neither, so it would
       catch them — but only at the end of the whole run, by which time a build
       could have baked thirteen of them into `/agenda/`. See the header of
       `tests/e2e/helpers/purge.ts` for what that cost once. */
    await adminClient()
      .from('sessions')
      .delete()
      .eq('duration_minutes', MARKER_DURATION)
      .gte('starts_at', '2029-01-01T00:00:00Z')
      .lte('starts_at', '2029-12-31T00:00:00Z');
    /* The log is diagnostic only and nothing else reads it, so clearing what
       this run added — including the firing the delete above just caused — is
       safe and keeps the table from growing a row per CI run forever. */
    if (baselineLogId > 0) {
      await adminClient().from('rebuild_requests').delete().gt('id', baselineLogId);
    }
    for (const id of createdUsers) await deleteUser(id);
  });

  async function signInAsProf(page: Page) {
    await followMagicLink(page, profEmail);
    await reachAccountPage(page);
    await page.goto('/admin/seances/');
    await expect(page.getByTestId('admin')).toHaveAttribute('data-state', 'staff', {
      timeout: 15_000,
    });
    await openNewSessionForm(page);
  }

  /**
   * Open the "Nouvelle séance" disclosure the creation form now lives behind.
   *
   * ⚠️ THE ASSERTIONS BELOW ARE UNCHANGED — this is reaching the form the way a
   * prof does, not weakening a check. The form moved behind a disclosure
   * because a prof opens this page to mark a register and read the list, and
   * ten fields sat permanently between the two.
   *
   * ⚠️ PRESSED, NOT `open = true`. A real press also proves the affordance is
   * operable, which is the half a `.open` assignment would skip — and it
   * happens BEFORE any field is filled, so the caret-still-in-the-end-date
   * test further down is untouched by it.
   */
  async function openNewSessionForm(page: Page) {
    const summary = page.locator('[data-new-session] > summary');
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.locator('#session-when')).toBeVisible();
  }

  test('thirteen sessions, shown before they are made, and ONE trigger firing', async ({ page }) => {
    await signInAsProf(page);

    const beforeCreate = await lastLogId();

    await page.fill('#session-when', START_LOCAL);
    await page.fill('#session-duration', String(MARKER_DURATION));
    await page.selectOption('#session-status', 'published');
    await page.selectOption('#session-cadence', 'weekly');
    await page.fill('#session-until', UNTIL_LOCAL);

    /* ⚠️ WHAT WILL BE CREATED IS ON SCREEN BEFORE IT IS CREATED, in full. The
       count, every date, and the submit button's own promise. */
    const preview = page.locator('[data-repeat-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(`${EXPECTED} séances`);
    await expect(
      preview.locator('.repeat-dates li'),
      'the preview summarised instead of listing every date',
    ).toHaveCount(EXPECTED);
    await expect(page.locator('[data-session-submit]')).toHaveText(`Créer les ${EXPECTED} séances`);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-session-submit]').click();

    /* The list repaints from a fresh read, so waiting on the series card is
       waiting on the write having landed. */
    await expect(page.locator('.series-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.series-card')).toContainText(`${EXPECTED} séances`);

    const rows = await ourSessions();
    expect(rows.length, 'the database does not hold thirteen sessions').toBe(EXPECTED);
    seriesId = String(rows[0]!['series_id'] ?? '');
    expect(seriesId, 'the generated rows carry no series label').not.toBe('');
    expect(
      rows.every((r) => String(r['series_id']) === seriesId),
      'the thirteen rows do not share one series label',
    ).toBe(true);
    expect(
      rows.every((r) => r['status'] === 'published'),
      'the generated rows did not take the status the form asked for',
    ).toBe(true);

    /* ⚠️ THE MEASUREMENT. Exactly one firing says it touched thirteen rows.
       A `for` loop over a create-one function produces thirteen firings each
       saying ONE, and no row saying thirteen — so this assertion cannot be
       satisfied by the failure it exists to catch, and cannot be broken by
       another spec's writes in another worker. */
    const bulk = await firings(beforeCreate, { source: 'sessions.insert', rows: EXPECTED });
    expect(
      bulk.length,
      'creating thirteen sessions did not reach the database as ONE statement',
    ).toBe(1);

    /* And the trigger sent nothing, because the test project holds no hook.
       If this ever flips, a spec is one vault entry away from spending the
       club's build minutes on every run. */
    expect(bulk[0]!['dispatched'], 'the TEST project dispatched a real rebuild').toBe(false);
  });

  test('each session is independently editable, and cancelling one leaves the rest', async ({
    page,
  }) => {
    await signInAsProf(page);

    const rows = await ourSessions();
    expect(rows.length, 'the series from the previous test is missing').toBe(EXPECTED);
    /* The middle one, deliberately: a first or last row can be cancelled by an
       off-by-one that a middle row cannot. */
    const victim = String(rows[6]!['id']);

    const card = page.locator(`.session-card[data-session="${victim}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    /* ⚠️ THE CARD KNOWS IT BELONGS TO A SET AND STILL ACTS ALONE. */
    await expect(card.locator('.session-series')).toContainText(`7/${EXPECTED}`);

    page.once('dialog', (dialog) => dialog.accept());
    await card.locator('[data-cancel]').click();

    await expect(
      page.locator(`.session-card[data-session="${victim}"] .session-status`),
    ).toHaveText('annulée', { timeout: 15_000 });

    const after = await ourSessions();
    const cancelled = after.filter((r) => r['status'] === 'cancelled');
    const published = after.filter((r) => r['status'] === 'published');
    expect(cancelled.length, 'cancelling one session cancelled more than one').toBe(1);
    expect(String(cancelled[0]!['id']), 'the wrong session was cancelled').toBe(victim);
    expect(published.length, 'the other sessions did not survive').toBe(EXPECTED - 1);
    /* ⚠️ AND IT IS STILL THERE. A cancelled session is a STATE, never a
       deletion — Critical Feature 46, which a bulk feature is exactly where
       somebody would be tempted to break. */
    expect(after.length, 'a cancelled session was deleted').toBe(EXPECTED);

    /* ── And the bulk action is one statement too ────────────────────────── */
    const beforeBulk = await lastLogId();
    const seriesCard = page.locator(`.series-card[data-series-card="${seriesId}"]`);
    await expect(seriesCard).toContainText(`${EXPECTED - 1} à venir`);

    page.once('dialog', (dialog) => dialog.accept());
    await seriesCard.locator('[data-series-cancel]').click();

    /* ⚠️ SCOPED TO THIS SERIES. The list holds every session the project has,
       and other specs cancel their own — an unscoped count of cancelled cards
       would pass or fail on somebody else's row. */
    await expect(
      page.locator(`.session-card[data-series="${seriesId}"][data-status="cancelled"]`),
    ).toHaveCount(EXPECTED, { timeout: 15_000 });

    const bulk = await firings(beforeBulk, { source: 'sessions.update', rows: EXPECTED - 1 });
    expect(
      bulk.length,
      'cancelling the rest of the series did not reach the database as ONE statement',
    ).toBe(1);

    const finished = await ourSessions();
    expect(
      finished.every((r) => r['status'] === 'cancelled'),
      'the series cancel left a session behind',
    ).toBe(true);
    expect(finished.length, 'the series cancel deleted rows').toBe(EXPECTED);
  });
  /**
   * ⚠️ THE PRESS MUST WORK WITH THE CARET STILL IN THE LAST FIELD — WEBKIT.
   *
   * v0.17.0 shipped a `paintPreview()` that rewrote `submitButton.textContent`
   * unconditionally on the form's `change` event. Pressing "Créer" straight
   * after typing the end date BLURS that field, which fires `change`, which
   * repainted the button BETWEEN the mousedown and the mouseup of the press —
   * and WebKit then declines to synthesise the `click`. The button silently did
   * nothing: no dialog, no write, no error, on Safari and on every iPhone.
   *
   * Measured at the v0.17.0 gate: pressing directly produced NO dialog;
   * blurring first and pressing again worked. Chromium and Firefox synthesise
   * the click regardless, so this is invisible outside the WebKit projects —
   * which is exactly why it must be asserted rather than assumed.
   *
   * ⚠️ THE TEST IS THE *ABSENCE OF A BLUR*. Do not "tidy" this by clicking
   * elsewhere, pressing Tab, or calling `.blur()` before the press — any of
   * those makes it pass against the broken build and the regression walks
   * straight back in.
   */
  test('the submit button works with the caret still in the end-date field', async ({ page }) => {
    await signInAsProf(page);

    await page.fill('#session-when', '2029-06-06T18:00');
    await page.fill('#session-duration', String(MARKER_DURATION));
    await page.selectOption('#session-status', 'draft');
    await page.selectOption('#session-cadence', 'fortnightly');
    /* ⚠️ LAST, AND NOTHING AFTER IT. Focus stays here, which is the whole point. */
    await page.fill('#session-until', '2029-07-04');

    await expect(page.locator('[data-repeat-preview]')).toContainText('3 séances');
    await expect(page.locator('[data-session-submit]')).toHaveText('Créer les 3 séances');

    let dialogSeen = false;
    page.once('dialog', (dialog) => {
      dialogSeen = true;
      void dialog.accept();
    });

    await page.locator('[data-session-submit]').click();

    /* The confirm is the first thing the handler does that is observable from
       here, so its absence is the failure this test exists to catch. */
    await expect
      .poll(() => dialogSeen, {
        timeout: 10_000,
        message: 'pressing Créer did nothing — the click was suppressed (see the header)',
      })
      .toBe(true);

    /* ⚠️ POLLED, NOT READ ONCE. The dialog firing means the handler STARTED;
       the insert is a round trip behind it. Reading the table immediately is a
       race that fails against a perfectly working build — it did, first time. */
    await expect
      .poll(
        async () => {
          const { data } = await adminClient()
            .from('sessions')
            .select('id')
            .eq('duration_minutes', MARKER_DURATION)
            .gte('starts_at', '2029-06-01T00:00:00Z')
            .lte('starts_at', '2029-08-01T00:00:00Z');
          return data?.length ?? 0;
        },
        { timeout: 15_000, message: 'the press produced no sessions' },
      )
      .toBe(3);

    await adminClient()
      .from('sessions')
      .delete()
      .eq('duration_minutes', MARKER_DURATION)
      .gte('starts_at', '2029-06-01T00:00:00Z')
      .lte('starts_at', '2029-08-01T00:00:00Z');
  });
});
