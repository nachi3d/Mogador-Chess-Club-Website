import { test, expect } from '@playwright/test';
import { isSupabaseConfigured } from './env';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { cancellable, CANCEL_CUTOFF_MS } from '../../src/lib/booking';

/**
 * Session booking (0013) — capacity is a property of POSTGRES, not of the UI.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THESE TESTS DRIVE THE DATABASE DIRECTLY, WITH REAL TOKENS, ON PURPOSE.
 *
 * Every claim this feature makes is a claim about what happens when the page
 * is bypassed: two parents booking the last place at the same instant, a
 * parent inserting a row by hand, a cancellation arriving after the cutoff.
 * None of that is reachable by clicking, and a spec that only clicked would
 * stay green while the lock was removed.
 *
 * ⚠️ RLS IS ASSERTED THROUGH POSTGREST WITH THE USER'S OWN TOKEN, never by
 * driving the pages — the rule `role-separation.spec.ts` already follows.
 *
 * ⚠️ THE CONCURRENCY TEST FIRES SIX REQUESTS WITHOUT AWAITING BETWEEN THEM.
 * It cannot force two transactions to interleave — no client can — but it can
 * assert the invariant that matters: whatever the interleaving, the database
 * ends up holding exactly the number of places that exist. A missing
 * `for update` fails this, because the count-then-insert window is wide open
 * across six overlapping requests.
 * ═════════════════════════════════════════════════════════════════════════
 */

/* ── The cutoff arithmetic, with no browser and no database ──────────────── */

test.describe('the two-hour cutoff is arithmetic before it is a rule', () => {
  /**
   * ⚠️ NO SKIP ON THIS BLOCK — it needs neither the auth flag nor `.env.test`,
   * so it runs in BOTH flag shapes. `cancellable()` is what greys the button
   * out; `cancel_booking()` is what actually refuses. Both exist, and this is
   * the half that can be checked anywhere.
   */
  const now = Date.parse('2030-01-01T12:00:00.000Z');

  test('three hours out is cancellable', () => {
    expect(cancellable('2030-01-01T15:00:00.000Z', now)).toBe(true);
  });

  test('one hour out is not', () => {
    expect(cancellable('2030-01-01T13:00:00.000Z', now)).toBe(false);
  });

  test('exactly two hours out is not — the boundary is closed against the member', () => {
    /* ⚠️ Deliberately NOT cancellable at exactly the cutoff. A boundary that
       flips on the millisecond would let a member cancel at 1h59m59s and be
       refused by the database a moment later, which is the disagreement
       between button and rule this mirror exists to avoid. */
    expect(cancellable(new Date(now + CANCEL_CUTOFF_MS).toISOString(), now)).toBe(false);
  });

  test('a session already past is not cancellable', () => {
    expect(cancellable('2029-12-31T12:00:00.000Z', now)).toBe(false);
  });

  test('an unparseable date is not cancellable rather than throwing', () => {
    expect(cancellable('not a date', now)).toBe(false);
  });
});

/* ── The database, with real clients ─────────────────────────────────────── */

test.describe('booking against the real database', () => {
  test.skip(!isSupabaseConfigured(), 'no .env.test — visible skip, never a silent pass');

  /* ⚠️ ONE AT A TIME. These share a rebuild-request count and create sessions
     that other tests in this file book against. */
  test.describe.configure({ mode: 'serial' });

  const made: { users: string[]; sessions: string[] } = { users: [], sessions: [] };

  test.afterAll(async () => {
    const admin = adminClient();
    for (const id of made.sessions) await admin.from('sessions').delete().eq('id', id);
    for (const id of made.users) await deleteUser(id);
  });

  async function tokenClient(userId: string, email: string) {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv()!;
    const admin = adminClient();
    const { data: link } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'http://localhost:4321/auth/callback' },
    });
    const fresh = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
    const { data: sess } = await fresh.auth.verifyOtp({
      token_hash: link!.properties!.hashed_token,
      type: 'magiclink',
    });
    void userId;
    return createClient(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${sess!.session!.access_token}` } },
    });
  }

  async function makeParent(tag: string) {
    const email = e2eEmail(`book-${tag}`);
    const user = await createConfirmedUser({ email });
    made.users.push(user.id);
    return { id: user.id, email, client: await tokenClient(user.id, email) };
  }

  async function makeChild(accountId: string, name: string): Promise<string> {
    const { data } = await adminClient()
      .from('child_profiles')
      .insert({ account_id: accountId, display_name: name })
      .select('id')
      .single();
    return String(data!['id']);
  }

  async function makeSession(hoursFromNow: number, capacity: number, margin: number) {
    const { data } = await adminClient()
      .from('sessions')
      .insert({
        starts_at: new Date(Date.now() + hoursFromNow * 3600_000).toISOString(),
        duration_minutes: 90,
        status: 'published',
        capacity,
        overbook_margin: margin,
      })
      .select('id')
      .single();
    const id = String(data!['id']);
    made.sessions.push(id);
    return id;
  }

  const code = (res: { data: unknown }) => {
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    return (row as Record<string, unknown> | null)?.['code'] as string | undefined;
  };

  test('capacity plus the overbooking margin is the real limit', async () => {
    const parent = await makeParent('cap');
    /* 2 places + a margin of 1 accepts THREE. ⚠️ The margin is deliberate and
       is not a bug to fix — cancellations are frequent and the venue absorbs
       the overflow. See migration 0013. */
    const session = await makeSession(48, 2, 1);
    const kids = await Promise.all(
      ['A', 'B', 'C', 'D'].map((n) => makeChild(parent.id, `cap-${n}`)),
    );

    for (const child of kids.slice(0, 3)) {
      const res = await parent.client.rpc('create_booking', { child, session });
      expect(code(res)).toBe('ok');
    }
    const fourth = await parent.client.rpc('create_booking', { child: kids[3]!, session });
    expect(code(fourth)).toBe('full');
  });

  test('six concurrent bookings for three places leave exactly three', async () => {
    const one = await makeParent('race1');
    const two = await makeParent('race2');
    const session = await makeSession(48, 3, 0);

    const prepared = await Promise.all(
      Array.from({ length: 6 }, async (_v, i) => {
        const acct = i % 2 === 0 ? one : two;
        return { acct, child: await makeChild(acct.id, `race-${i}`) };
      }),
    );

    /* Fired together, nothing awaited in between. */
    const settled = await Promise.all(
      prepared.map((p) => p.acct.client.rpc('create_booking', { child: p.child, session })),
    );
    const codes = settled.map(code);
    expect(codes.filter((c) => c === 'ok')).toHaveLength(3);
    expect(codes.filter((c) => c === 'full')).toHaveLength(3);

    /* ⚠️ AND THE DATABASE IS ASKED, NOT THE RESPONSES. Six replies saying the
       right thing while four rows exist would be the failure this catches. */
    const { count } = await adminClient()
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session)
      .eq('status', 'confirmed');
    expect(count).toBe(3);
  });

  test('cancelling frees the place, and the child can book again', async () => {
    const parent = await makeParent('cancel');
    const session = await makeSession(48, 1, 0);
    const child = await makeChild(parent.id, 'cancel-A');

    expect(code(await parent.client.rpc('create_booking', { child, session }))).toBe('ok');

    const { data: mine } = await parent.client
      .from('bookings')
      .select('id')
      .eq('session_id', session)
      .eq('child_id', child)
      .single();

    expect(code(await parent.client.rpc('cancel_booking', { booking: mine!['id'] }))).toBe('ok');

    /* ⚠️ THE PARTIAL UNIQUE INDEX IS WHAT MAKES THIS PASS. A plain
       `unique (session_id, child_id)` would keep the cancelled row occupying
       the key and this second booking would fail forever. */
    expect(code(await parent.client.rpc('create_booking', { child, session }))).toBe('ok');
  });

  test('the cutoff refuses a member and lets a prof through', async () => {
    const parent = await makeParent('cut');
    const prof = await makeParent('cutprof');
    await adminClient().rpc('admin_set_role', { target_id: prof.id, new_role: 'prof' });
    const profClient = await tokenClient(prof.id, prof.email);

    const session = await makeSession(1, 5, 0);
    const child = await makeChild(parent.id, 'cut-A');
    expect(code(await parent.client.rpc('create_booking', { child, session }))).toBe('ok');

    const { data: row } = await adminClient()
      .from('bookings')
      .select('id')
      .eq('session_id', session)
      .eq('child_id', child)
      .single();

    expect(code(await parent.client.rpc('cancel_booking', { booking: row!['id'] }))).toBe(
      'too_late',
    );
    /* "After that, the prof handles it" — which means the prof CAN. */
    expect(code(await profClient.rpc('cancel_booking', { booking: row!['id'] }))).toBe('ok');
  });

  test('RLS: a parent cannot book, read or cancel another family', async () => {
    const one = await makeParent('rls1');
    const two = await makeParent('rls2');
    const session = await makeSession(48, 5, 0);
    const mine = await makeChild(one.id, 'rls-mine');
    const theirs = await makeChild(two.id, 'rls-theirs');

    expect(code(await one.client.rpc('create_booking', { child: theirs, session }))).toBe(
      'forbidden',
    );

    expect(code(await two.client.rpc('create_booking', { child: theirs, session }))).toBe('ok');
    const { data: theirRow } = await adminClient()
      .from('bookings')
      .select('id')
      .eq('child_id', theirs)
      .single();
    expect(code(await one.client.rpc('cancel_booking', { booking: theirRow!['id'] }))).toBe(
      'forbidden',
    );

    /* A parent sees their own children's rows and no one else's. */
    expect(code(await one.client.rpc('create_booking', { child: mine, session }))).toBe('ok');
    const { data: visible } = await one.client.from('bookings').select('id').eq('session_id', session);
    expect(visible ?? []).toHaveLength(1);
  });

  test('a parent cannot write bookings directly — capacity is not client-side', async () => {
    const parent = await makeParent('direct');
    const session = await makeSession(48, 1, 0);
    const child = await makeChild(parent.id, 'direct-A');

    /* ⚠️ THE POINT OF THE WHOLE DESIGN. There is no insert policy for a
       parent, so bypassing `create_booking()` cannot overbook anything. */
    const { error } = await parent.client
      .from('bookings')
      .insert({ session_id: session, child_id: child, status: 'confirmed' });
    expect(error).not.toBeNull();
  });

  test('anonymous reads nothing, and it is a refusal rather than an empty list', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv()!;
    const anon = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
    const { error } = await anon.from('bookings').select('id').limit(1);
    /* ⚠️ `42501` (GRANT) and not an empty array (policy): an empty list reads
       to a caller as "no bookings", which is a different and misleading fact. */
    expect(error?.code).toBe('42501');
  });

  /**
   * ⚠️⚠️ THE CLAIM THAT DECAYS QUIETLY, SO IT IS WATCHED.
   *
   * A booking must write nothing to `sessions`, and therefore fire NO rebuild.
   * It is true today because `bookings` is a different table and
   * `create_booking()` only ever takes a `select … for update` lock — a lock is
   * not a write. The way this stops being true is somebody caching a count on
   * `sessions`, which looks like an optimisation and turns every reservation
   * into a Cloudflare build.
   *
   * ⚠️⚠️ IT WATCHES THE SESSION ROW, NOT THE GLOBAL REBUILD LOG — AND THAT
   * CHANGED AFTER THE LOG VERSION FAILED A GATE WHILE THE RULE WAS INTACT.
   *
   * The first version counted `rebuild_requests` before and after. That table
   * is ONE log for the whole database, and `test.describe.configure({ mode:
   * 'serial' })` only serialises the tests in THIS file — `recurring-sessions`,
   * `admin` and `attendance-timing` all create and cancel sessions in other
   * files, concurrently, and every one of those legitimately fires a rebuild.
   *
   * ⚠️ IT FAILED AT THE GATE AT `1868` vs `1870`: two firings this test did not
   * cause, on a run where a booking had written nothing at all. A serial re-run
   * of the file passed 14/14. **An assertion that cannot be isolated will fail
   * for reasons the reader then has to rule out by hand**, which is the same
   * cost as a flake and teaches the same lesson — wave it through.
   *
   * The row IS isolated, and it tests the rule more directly than the log did:
   * Critical Feature 72 says a booking must never WRITE to `sessions`, and the
   * regression it names — somebody caching a `bookings_count` there — changes
   * this row. `select … for update` is a lock, and a lock leaves no trace here.
   *
   * ⚠️ WHAT THIS GIVES UP, STATED RATHER THAN HIDDEN: an UPDATE that wrote the
   * same values back would fire the trigger and leave the row equal. Nothing
   * plausible does that, and nothing isolated can see it — the log could, and
   * the log cannot be isolated.
   */
  test('a booking and a cancellation write NOTHING to the session row', async () => {
    const admin = adminClient();
    const parent = await makeParent('trig');
    const session = await makeSession(48, 5, 0);
    const child = await makeChild(parent.id, 'trig-A');

    const sessionRow = async () =>
      (await admin.from('sessions').select('*').eq('id', session).single()).data;

    const before = await sessionRow();
    expect(before, 'the session under test disappeared').not.toBeNull();

    expect(code(await parent.client.rpc('create_booking', { child, session }))).toBe('ok');
    const { data: row } = await admin
      .from('bookings')
      .select('id')
      .eq('session_id', session)
      .eq('child_id', child)
      .single();
    expect(code(await parent.client.rpc('cancel_booking', { booking: row!['id'] }))).toBe('ok');

    expect(
      await sessionRow(),
      'a booking or a cancellation changed the session row — that fires 0011’s ' +
        'rebuild trigger, so every reservation becomes a Cloudflare build (CF72)',
    ).toEqual(before);
  });

  test('cancelling a session cancels its bookings, visibly and not orphaned', async () => {
    const parent = await makeParent('sesscancel');
    const session = await makeSession(48, 5, 0);
    const child = await makeChild(parent.id, 'sesscancel-A');
    expect(code(await parent.client.rpc('create_booking', { child, session }))).toBe('ok');

    await adminClient().from('sessions').update({ status: 'cancelled' }).eq('id', session);

    const { data: rows } = await adminClient()
      .from('bookings')
      .select('status,cancel_reason')
      .eq('session_id', session);

    expect(rows ?? []).toHaveLength(1);
    expect(rows![0]!['status']).toBe('cancelled');
    /* ⚠️ THE REASON IS THE "VISIBLY" HALF. "You cancelled" and "the club
       cancelled" are not the same news to a parent. */
    expect(rows![0]!['cancel_reason']).toBe('session_cancelled');
  });
});
