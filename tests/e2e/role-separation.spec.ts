import { test, expect } from '@playwright/test';
import { adminClient, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';

/**
 * v2-S4 — role separation, asserted rather than assumed.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THESE RUN AGAINST THE DATABASE, NOT THE UI, AND THAT IS THE POINT.
 *
 * RLS is the security boundary; the UI check is only UX. A spec that drove the
 * admin pages would prove the buttons are hidden, which is worth very little —
 * a student who opens devtools does not use the buttons. So every assertion
 * here is a real signed-in student calling PostgREST directly with their own
 * token, exactly as a curious teenager would.
 *
 * The prof is promoted through `admin_set_role`, the only sanctioned path, so
 * the test cannot accidentally prove something a hand-edited role would.
 * ═════════════════════════════════════════════════════════════════════════
 */

test.describe('v2-S4 — a student cannot cross a role boundary', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  const created: string[] = [];
  let student = { id: '', email: '', password: '' };
  let other = { id: '', email: '', password: '' };
  let prof = { id: '', email: '', password: '' };
  let sessionId = '';

  /** A PostgREST client signed in as this user — the student's own token. */
  async function clientFor(user: { email: string; password: string }) {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv();
    expect(env, 'no .env.test — these tests need the TEST project').not.toBeNull();
    const c = createClient(env!.supabaseUrl, env!.anonKey, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(error, 'the test user could not sign in').toBeNull();
    return c;
  }

  test.beforeAll(async () => {
    /* ⚠️ Created WITH A PASSWORD rather than through `createConfirmedUser`,
       which mints a magic link. These tests need to sign in repeatedly as three
       different people to call PostgREST with each one's own token, and a
       password is the only way to do that without following a link per call. */
    const mk = async (tag: string) => {
      const email = e2eEmail(`s4-${tag}`);
      const password = `S4-${Date.now()}-${tag}-aA1!`;
      const { data, error } = await adminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: tag },
      });
      expect(error, `could not create ${tag}: ${error?.message}`).toBeNull();
      const id = data.user?.id;
      expect(id, `no user id came back for ${tag}`).toBeTruthy();
      created.push(id!);
      return { id: id!, email, password };
    };
    student = await mk('student');
    other = await mk('other');
    prof = await mk('prof');

    /* ⚠️ Promoted via `admin_set_role`, the ONLY sanctioned path — column
       grants and a trigger refuse everything else, including the service role
       going direct. */
    const { error } = await adminClient().rpc('admin_set_role', {
      target_id: prof.id,
      new_role: 'prof',
    });
    expect(error, `admin_set_role failed: ${error?.message}`).toBeNull();

    /* A published session and some progress for the student to not-see. */
    const { data } = await adminClient()
      .from('sessions')
      .insert([{ starts_at: '2026-10-01T16:00:00Z', title_fr: 'Séance', status: 'published' }])
      .select();
    sessionId = String(data?.[0]?.['id']);
    await adminClient().from('exercise_progress').insert([
      { profile_id: other.id, exercise_slug: 'mat-du-couloir', kind: 'exercise', solved: true },
    ]);
  });

  test.afterAll(async () => {
    if (sessionId) await adminClient().from('sessions').delete().eq('id', sessionId);
    for (const id of created) await deleteUser(id);
  });

  test("another student's progress returns 0 rows", async () => {
    const c = await clientFor(student);
    const { data } = await c.from('exercise_progress').select('*').eq('profile_id', other.id);
    expect(data?.length ?? 0).toBe(0);
    const { data: games } = await c.from('game_results').select('*').eq('profile_id', other.id);
    expect(games?.length ?? 0).toBe(0);
  });

  test('attendance cannot be written by a student', async () => {
    const c = await clientFor(student);
    const { error } = await c
      .from('attendance')
      .insert([{ session_id: sessionId, profile_id: student.id, status: 'present' }]);
    expect(error?.code, 'a student marked themselves present').toBe('42501');
  });

  test('sessions cannot be created by a student', async () => {
    const c = await clientFor(student);
    const { error } = await c
      .from('sessions')
      .insert([{ starts_at: '2026-12-01T16:00:00Z', status: 'published' }]);
    expect(error?.code).toBe('42501');
  });

  test('a student cannot change their role, by table or by function', async () => {
    const c = await clientFor(student);
    const { error: byTable } = await c
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', student.id);
    expect(byTable, 'a student promoted themselves through the table').not.toBeNull();

    const { error: byRpc } = await c.rpc('admin_set_role', {
      target_id: student.id,
      new_role: 'admin',
    });
    expect(byRpc, 'a student reached admin_set_role').not.toBeNull();

    const { data } = await adminClient().from('profiles').select('role').eq('id', student.id);
    expect(data?.[0]?.['role'], 'the stored role changed').toBe('eleve');
  });

  /**
   * ⚠️ THE ONE THAT MINTS POINTS. Every other boundary here costs a student
   * privacy or tidiness; this one would let them award themselves a rank.
   */
  test('a student cannot award themselves points', async () => {
    const c = await clientFor(student);
    const { error } = await c
      .from('point_awards')
      .insert([{ profile_id: student.id, points: 50, reason: 'moi', awarded_by: student.id }]);
    expect(error?.code).toBe('42501');

    const { data } = await adminClient().from('point_awards').select('*').eq('profile_id', student.id);
    expect(data?.length ?? 0).toBe(0);
  });

  test('a student sees only published sessions, never drafts or cancellations', async () => {
    const { data: hidden } = await adminClient()
      .from('sessions')
      .insert([
        { starts_at: '2027-01-01T16:00:00Z', title_fr: 'Brouillon', status: 'draft' },
        { starts_at: '2027-01-08T16:00:00Z', title_fr: 'Annulée', status: 'cancelled' },
      ])
      .select();

    const c = await clientFor(student);
    const { data } = await c.from('sessions').select('id,status');
    expect(
      (data ?? []).every((s) => s['status'] === 'published'),
      'a draft or a cancellation leaked to a student',
    ).toBe(true);

    await adminClient()
      .from('sessions')
      .delete()
      .in('id', (hidden ?? []).map((s) => s['id']));
  });

  /**
   * ⚠️ AND THE PROF SIDE — a boundary that is too tight is also a bug. If the
   * prof cannot do their job the feature is not shipped, it is broken.
   */
  test('a prof can do the job, and only the job', async () => {
    const c = await clientFor(prof);

    const { error: mark } = await c
      .from('attendance')
      .upsert([{ session_id: sessionId, profile_id: student.id, status: 'present', marked_by: prof.id }]);
    expect(mark, `a prof could not mark attendance: ${mark?.message}`).toBeNull();

    const { error: award } = await c
      .from('point_awards')
      .insert([{ profile_id: student.id, points: 10, reason: 'A aidé un camarade', awarded_by: prof.id }]);
    expect(award, `a prof could not award points: ${award?.message}`).toBeNull();

    const { data: seen } = await c.from('exercise_progress').select('*');
    expect((seen?.length ?? 0) > 0, 'a prof cannot see the class').toBe(true);

    /* But a prof is not an admin: they cannot promote anyone. */
    const { error: promote } = await c.rpc('admin_set_role', {
      target_id: student.id,
      new_role: 'prof',
    });
    expect(promote, 'a prof could promote a student').not.toBeNull();

    await adminClient().from('point_awards').delete().eq('profile_id', student.id);
    await adminClient().from('attendance').delete().eq('session_id', sessionId);
  });

  /**
   * ⚠️ A REQUIRED REASON IS A DATABASE RULE, NOT A FORM RULE. A point that
   * appears with no explanation destroys trust faster than no point at all, and
   * a form check is the half that a future admin script would skip.
   */
  test('an award with no reason is refused by the database', async () => {
    const c = await clientFor(prof);
    for (const reason of ['', '  ', 'x']) {
      const { error } = await c
        .from('point_awards')
        .insert([{ profile_id: student.id, points: 5, reason, awarded_by: prof.id }]);
      expect(error, `a reason of ${JSON.stringify(reason)} was accepted`).not.toBeNull();
    }
  });
});
