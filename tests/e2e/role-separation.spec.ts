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

/**
 * ⚠️ ONE AT A TIME — these tests SHARE DATABASE ROWS.
 *
 * Every test here works on the same student, the same child profiles and the
 * same session, and several of them write and then clean up: the attendance
 * register for `sessionId`, the awards on `studentChild`, that session's own
 * status. Under the global `fullyParallel: true` they interleave, and then
 * "the award bounds hold" can assert zero awards while another test has two of
 * its own in flight.
 *
 * That is not a hypothetical: v2-S4 part 2 added five more mutating tests to a
 * file that already had two, and the collision surface went from small to
 * certain. They passed on the first run, which is exactly how this kind of
 * flake gets shipped — it fails later, on a matrix run, and reads as a real
 * regression in an RLS policy.
 *
 * Same fix and same reasoning as `play.spec.ts`: sequential in one worker,
 * other spec files still parallel alongside. `mode: 'default'` rather than
 * `'serial'` so a genuine failure is reported on its own terms instead of
 * skipping everything after it.
 */
test.describe.configure({ mode: 'default' });

test.describe('v2-S4 — a student cannot cross a role boundary', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  const created: string[] = [];
  let student = { id: '', email: '', password: '' };
  let other = { id: '', email: '', password: '' };
  let prof = { id: '', email: '', password: '' };
  /* Named `superadmin` rather than `admin` so it cannot be confused with
     `adminClient()`, which is the SERVICE ROLE and bypasses every policy. */
  let superadmin = { id: '', email: '', password: '' };
  let sessionId = '';
  /* ⚠️ Since 0005 the LEARNER is a child profile, not the account, so every
     assertion below addresses a child id. A student account is an account
     holding exactly one child — the same shape a family account has with three.
     Created here with the service role because the client path that mints one
     (`resolveChild()`) is not what is under test. */
  let studentChild = '';
  let otherChild = '';

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
    /* ⚠️ A THIRD ROLE, because `/admin/comptes/` is narrower than the rest of
       `/admin*`: seeing every family's email address and erasing an account is
       admin-only, and "a prof is refused" is the assertion that proves it. */
    superadmin = await mk('admin');

    /* ⚠️ Promoted via `admin_set_role`, the ONLY sanctioned path — column
       grants and a trigger refuse everything else, including the service role
       going direct. */
    const { error } = await adminClient().rpc('admin_set_role', {
      target_id: prof.id,
      new_role: 'prof',
    });
    expect(error, `admin_set_role failed: ${error?.message}`).toBeNull();
    const { error: adminError } = await adminClient().rpc('admin_set_role', {
      target_id: superadmin.id,
      new_role: 'admin',
    });
    expect(adminError, `admin_set_role (admin) failed: ${adminError?.message}`).toBeNull();

    const kid = async (account: string, name: string) => {
      const { data, error } = await adminClient()
        .from('child_profiles')
        .insert([{ account_id: account, display_name: name }])
        .select('id');
      expect(error, `could not create a child for ${name}: ${error?.message}`).toBeNull();
      return String(data![0]!['id']);
    };
    studentChild = await kid(student.id, 'Élève');
    otherChild = await kid(other.id, 'Autre');

    /* A published session and some progress for the student to not-see. */
    const { data } = await adminClient()
      .from('sessions')
      .insert([{ starts_at: '2026-10-01T16:00:00Z', title_fr: 'Séance', status: 'published' }])
      .select();
    sessionId = String(data?.[0]?.['id']);
    await adminClient().from('exercise_progress').insert([
      { child_id: otherChild, exercise_slug: 'mat-du-couloir', kind: 'exercise', solved: true },
    ]);
  });

  test.afterAll(async () => {
    if (sessionId) await adminClient().from('sessions').delete().eq('id', sessionId);
    for (const id of created) await deleteUser(id);
  });

  test("another student's progress returns 0 rows", async () => {
    const c = await clientFor(student);
    const { data } = await c.from('exercise_progress').select('*').eq('child_id', otherChild);
    expect(data?.length ?? 0).toBe(0);
    const { data: games } = await c.from('game_results').select('*').eq('child_id', otherChild);
    expect(games?.length ?? 0).toBe(0);
  });

  test('attendance cannot be written by a student', async () => {
    const c = await clientFor(student);
    const { error } = await c
      .from('attendance')
      .insert([{ session_id: sessionId, child_id: studentChild, status: 'present' }]);
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
      .insert([{ child_id: studentChild, points: 50, reason: 'moi', awarded_by: student.id }]);
    expect(error?.code).toBe('42501');

    const { data } = await adminClient().from('point_awards').select('*').eq('child_id', studentChild);
    expect(data?.length ?? 0).toBe(0);
  });

  /**
   * ⚠️ THE RULE CHANGED IN 0006, DELIBERATELY, AND THIS TEST CHANGED WITH IT.
   *
   * It used to assert that a student sees ONLY `published`. That made Critical
   * Feature 46 half true: `cancelSession()` never deletes, precisely so a
   * student who was told a session was happening is not left wondering — and
   * then the select policy hid the cancelled row from every surface they could
   * reach, which produces exactly the vanishing the rule exists to prevent.
   *
   * The boundary that matters is unchanged and is still asserted here: a DRAFT
   * is an unannounced session and must never leak.
   */
  test('a student sees published and cancelled sessions, never drafts', async () => {
    const { data: seeded } = await adminClient()
      .from('sessions')
      .insert([
        { starts_at: '2027-01-01T16:00:00Z', title_fr: 'Brouillon', status: 'draft' },
        { starts_at: '2027-01-08T16:00:00Z', title_fr: 'Annulée', status: 'cancelled' },
      ])
      .select();
    const ids = (seeded ?? []).map((s) => String(s['id']));

    const c = await clientFor(student);
    const { data } = await c.from('sessions').select('id,status');
    const visible = data ?? [];

    expect(
      visible.some((s) => s['status'] === 'draft'),
      'a DRAFT leaked to a student — an unannounced session was published by accident',
    ).toBe(false);

    /* And the cancellation IS visible — asserted on the row this test seeded,
       not on "some cancelled row exists", so it cannot pass on someone else's
       leftovers. */
    expect(
      visible.some((s) => ids.includes(String(s['id'])) && s['status'] === 'cancelled'),
      'a cancelled session was hidden from a student — CF46 only holds if they can see it',
    ).toBe(true);

    await adminClient().from('sessions').delete().in('id', ids);
  });

  /**
   * ⚠️ AND THE PROF SIDE — a boundary that is too tight is also a bug. If the
   * prof cannot do their job the feature is not shipped, it is broken.
   */
  test('a prof can do the job, and only the job', async () => {
    const c = await clientFor(prof);

    const { error: mark } = await c
      .from('attendance')
      .upsert([{ session_id: sessionId, child_id: studentChild, status: 'present', marked_by: prof.id }]);
    expect(mark, `a prof could not mark attendance: ${mark?.message}`).toBeNull();

    const { error: award } = await c
      .from('point_awards')
      .insert([{ child_id: studentChild, points: 10, reason: 'A aidé un camarade', awarded_by: prof.id }]);
    expect(award, `a prof could not award points: ${award?.message}`).toBeNull();

    const { data: seen } = await c.from('exercise_progress').select('*');
    expect((seen?.length ?? 0) > 0, 'a prof cannot see the class').toBe(true);

    /* But a prof is not an admin: they cannot promote anyone. */
    const { error: promote } = await c.rpc('admin_set_role', {
      target_id: student.id,
      new_role: 'prof',
    });
    expect(promote, 'a prof could promote a student').not.toBeNull();

    await adminClient().from('point_awards').delete().eq('child_id', studentChild);
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
        .insert([{ child_id: studentChild, points: 5, reason, awarded_by: prof.id }]);
      expect(error, `a reason of ${JSON.stringify(reason)} was accepted`).not.toBeNull();
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     v2-S4 PART 2 — the boundaries the ADMIN SURFACES lean on.
     ═══════════════════════════════════════════════════════════════════════
     ⚠️ EVERY ONE OF THESE IS ASSERTED THROUGH PostgREST WITH THE USER'S OWN
     TOKEN, never by driving `/admin`. The pages hide what a student may not
     have; hiding is UX, and a student who opens devtools does not use the
     pages. If any assertion below is ever made to pass by changing the UI, the
     thing it was protecting has already been lost.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * ⚠️ THE CLASS LIST IS THE WHOLE POINT OF `/admin/eleves/`, and a student
   * must not be able to read it. Before 0005 this row did not exist; now it is
   * the roster.
   */
  test('the class list is staff-only — a student sees only their own child', async () => {
    const c = await clientFor(student);
    const { data } = await c.from('child_profiles').select('id,display_name,account_id');
    const ids = (data ?? []).map((row) => String(row['id']));
    expect(ids, 'a student read another family’s child profile').not.toContain(otherChild);
    expect(
      ids.every((id) => id === studentChild),
      'a student read a child profile that is not theirs',
    ).toBe(true);
  });

  /**
   * ⚠️ AND A STUDENT MAY NOT RENAME A CHILD THEY DO NOT HOLD. `owns_child()`
   * decides; the admin UI never enters into it.
   */
  test("a student cannot rename another family's child", async () => {
    const c = await clientFor(student);
    await c.from('child_profiles').update({ display_name: 'Piraté' }).eq('id', otherChild);
    const { data } = await adminClient()
      .from('child_profiles')
      .select('display_name')
      .eq('id', otherChild);
    expect(data?.[0]?.['display_name'], 'a student renamed someone else’s child').toBe('Autre');
  });

  /**
   * ⚠️ A PROF READS THE CLASS AND CANNOT REWRITE IT. Staff hold SELECT on
   * `child_profiles` and nothing else — a teacher renaming a child is
   * indistinguishable from a teacher inventing one, and the class list is
   * built on that being impossible.
   */
  test('a prof reads every child and can write none of them', async () => {
    const c = await clientFor(prof);

    const { data } = await c.from('child_profiles').select('id');
    const ids = (data ?? []).map((row) => String(row['id']));
    expect(ids, 'a prof cannot see the class').toContain(studentChild);
    expect(ids).toContain(otherChild);

    await c.from('child_profiles').update({ display_name: 'Renommé' }).eq('id', studentChild);
    const { data: after } = await adminClient()
      .from('child_profiles')
      .select('display_name')
      .eq('id', studentChild);
    expect(after?.[0]?.['display_name'], 'a prof renamed a child').toBe('Élève');

    const { error: invent } = await c
      .from('child_profiles')
      .insert([{ account_id: null, display_name: 'Inventé' }]);
    expect(invent, 'a prof invented a child profile').not.toBeNull();
  });

  /**
   * ⚠️ THE MARKER'S WRITE IS AN UPSERT ON `(session_id, child_id)`, and this
   * asserts the key that makes it one. Marking is a toggle a prof will hit
   * twice in a noisy room; without the primary key 0005 rebuilt, the second tap
   * would insert a second row and the register would count everyone twice.
   */
  test('marking the same child twice corrects rather than duplicates', async () => {
    const c = await clientFor(prof);

    for (const status of ['present', 'absent', 'present'] as const) {
      const { error } = await c
        .from('attendance')
        .upsert([{ session_id: sessionId, child_id: studentChild, status, marked_by: prof.id }]);
      expect(error, `re-marking failed: ${error?.message}`).toBeNull();
    }

    const { data } = await adminClient()
      .from('attendance')
      .select('status')
      .eq('session_id', sessionId)
      .eq('child_id', studentChild);
    expect(data?.length, 'the register holds more than one row for one child').toBe(1);
    expect(data?.[0]?.['status'], 'the last mark did not win').toBe('present');

    await adminClient().from('attendance').delete().eq('session_id', sessionId);
  });

  /**
   * ⚠️ A CANCELLED SESSION IS A STATE, NOT A DELETION — and the register it
   * already carries must survive it. `on delete cascade` means deleting the
   * session would destroy the attendance rows, which is precisely why the admin
   * UI offers no delete at all.
   */
  test('cancelling a session keeps it, and keeps its register', async () => {
    const c = await clientFor(prof);
    await c
      .from('attendance')
      .upsert([{ session_id: sessionId, child_id: studentChild, status: 'present', marked_by: prof.id }]);

    const { error } = await c.from('sessions').update({ status: 'cancelled' }).eq('id', sessionId);
    expect(error, `a prof could not cancel a session: ${error?.message}`).toBeNull();

    const { data: session } = await adminClient()
      .from('sessions')
      .select('status')
      .eq('id', sessionId);
    expect(session?.[0]?.['status']).toBe('cancelled');

    const { data: register } = await adminClient()
      .from('attendance')
      .select('child_id')
      .eq('session_id', sessionId);
    expect(register?.length, 'cancelling took the register with it').toBe(1);

    await adminClient().from('attendance').delete().eq('session_id', sessionId);
    await adminClient().from('sessions').update({ status: 'published' }).eq('id', sessionId);
  });

  /**
   * ⚠️ THE AWARD BOUNDS ARE THE DATABASE'S, and the admin form's copy of them
   * is a convenience. This drives the values the form would refuse straight
   * past it, so a future refactor that loosens `validateAward()` cannot loosen
   * what is actually possible.
   */
  test('the award bounds hold with the form nowhere in the picture', async () => {
    const c = await clientFor(prof);
    for (const points of [0, -10, 51, 1000]) {
      const { error } = await c
        .from('point_awards')
        .insert([{ child_id: studentChild, points, reason: 'contournement', awarded_by: prof.id }]);
      expect(error, `${points} points were accepted`).not.toBeNull();
    }
    const { data } = await adminClient()
      .from('point_awards')
      .select('id')
      .eq('child_id', studentChild);
    expect(data?.length ?? 0, 'an out-of-range award was stored').toBe(0);
  });

  /**
   * ⚠️ A STUDENT READS THEIR AWARDS AND NOBODY ELSE'S. `/progres/` prints them
   * with their reasons, so this is also the boundary that stops one student
   * reading what a prof wrote about another.
   */
  test('a student reads their own awards and no one else’s', async () => {
    await adminClient()
      .from('point_awards')
      .insert([
        { child_id: studentChild, points: 5, reason: 'A aidé un camarade', awarded_by: prof.id },
        { child_id: otherChild, points: 7, reason: 'Beau sacrifice', awarded_by: prof.id },
      ]);

    const c = await clientFor(student);
    const { data } = await c.from('point_awards').select('child_id,points,reason');
    expect(data?.length, 'a student saw the wrong number of awards').toBe(1);
    expect(String(data?.[0]?.['child_id'])).toBe(studentChild);
    expect(Number(data?.[0]?.['points'])).toBe(5);

    /* And they cannot delete the ones they do have. */
    await c.from('point_awards').delete().eq('child_id', studentChild);
    const { data: after } = await adminClient()
      .from('point_awards')
      .select('id')
      .eq('child_id', studentChild);
    expect(after?.length, 'a student deleted an award').toBe(1);

    await adminClient().from('point_awards').delete().in('child_id', [studentChild, otherChild]);
  });

  /* ── /admin/comptes — the narrower gate (0009) ─────────────────────────── */

  /**
   * ⚠️ THE ACCOUNT LIST IS ADMIN-ONLY, AND A PROF IS THE INTERESTING CASE.
   *
   * A student being refused proves little — they are refused everywhere. The
   * boundary this asserts is the new one: `auth.users` holds every family's
   * email address, and a prof who marks registers has no business reading it.
   * `AdminShell`'s `requires="admin"` decides what to DRAW; this is the part
   * that actually refuses, called with each person's own token and the page
   * nowhere in the picture.
   */
  test('admin_list_accounts is refused to a student and to a prof, and answers an admin', async () => {
    for (const [who, user] of [
      ['a student', student],
      ['a prof', prof],
    ] as const) {
      const c = await clientFor(user);
      const { data, error } = await c.rpc('admin_list_accounts');
      /* ⚠️ IT RAISES RATHER THAN RETURNING NOTHING, deliberately: an empty list
         is indistinguishable from a club with no members, and the UI would then
         show "aucun compte" to somebody who is simply not allowed. */
      expect(error, `${who} was not refused the account list`).not.toBeNull();
      expect(data ?? null, `${who} received account rows`).toBeNull();
    }

    const admin = await clientFor(superadmin);
    const { data, error } = await admin.rpc('admin_list_accounts');
    expect(error, `an admin was refused: ${error?.message}`).toBeNull();
    expect(Array.isArray(data), 'the account list was not an array').toBe(true);
    /* The three accounts this file created are in there, with their addresses —
       which is precisely why the two refusals above matter. */
    const emails = (data ?? []).map((row: Record<string, unknown>) => String(row['email']));
    expect(emails).toContain(student.email);
  });

  /**
   * ⚠️ ERASING SOMEBODY ELSE'S ACCOUNT IS ADMIN-ONLY. A prof holds SELECT on
   * children and writes none of them; this is the same line drawn one step
   * further out.
   */
  test('admin_delete_account is refused to a student and to a prof', async () => {
    for (const [who, user] of [
      ['a student', student],
      ['a prof', prof],
    ] as const) {
      const c = await clientFor(user);
      const { error } = await c.rpc('admin_delete_account', {
        target: other.id,
        reason: 'tentative',
      });
      expect(error, `${who} was allowed to delete an account`).not.toBeNull();
    }

    /* And the target is untouched — the refusal has to be real, not cosmetic. */
    const { data } = await adminClient().auth.admin.listUsers();
    expect(
      data.users.some((u) => u.id === other.id),
      'the account was deleted by somebody who should have been refused',
    ).toBe(true);
  });

  /**
   * ⚠️ THE FUNCTION REFUSES `auth.uid()`, AND THAT IS WHAT KEEPS CRITICAL
   * FEATURE 51 TRUE.
   *
   * `delete_own_account()` takes no target precisely so it cannot be aimed;
   * an admin function that accepted its own caller's id would be a second,
   * weaker route to the same irreversible act, with no typed-word confirmation
   * in front of it. The admin's own account must go through `/compte/`.
   */
  test('an admin cannot delete their OWN account through the admin function', async () => {
    const admin = await clientFor(superadmin);
    const { error } = await admin.rpc('admin_delete_account', {
      target: superadmin.id,
      reason: 'auto-suppression',
    });
    expect(error, 'the admin function accepted its own caller as a target').not.toBeNull();

    const { data } = await adminClient().auth.admin.listUsers();
    expect(data.users.some((u) => u.id === superadmin.id), 'the admin erased themselves').toBe(true);
  });

  /**
   * ⚠️ A BLANK REASON IS REFUSED BY THE DATABASE, WITH THE FORM NOWHERE IN THE
   * PICTURE. `validateDeletion()` in `admin.ts` is a mirror so the UI can say no
   * before a round trip; this is the copy that actually decides — same
   * arrangement as the award bounds above.
   */
  test('a deletion with no reason is refused, and writes no audit row', async () => {
    const before = (await adminClient().from('account_deletions').select('id')).data?.length ?? 0;

    const admin = await clientFor(superadmin);
    const { error } = await admin.rpc('admin_delete_account', { target: other.id, reason: '  ' });
    expect(error, 'a blank reason was accepted').not.toBeNull();

    const after = (await adminClient().from('account_deletions').select('id')).data?.length ?? 0;
    expect(after, 'a refused deletion still wrote to the audit log').toBe(before);
  });

  /**
   * ⚠️ THE AUDIT IS ADMIN-READABLE AND NAMES NOBODY.
   *
   * Critical Feature 51 says erasure retains no statistic, no archive and no
   * anonymised copy — written for the self-service button, and binding just as
   * hard when a volunteer presses this one. So the row records the ACT and holds
   * no reference to the account that was removed. This asserts the SHAPE of the
   * table rather than trusting the migration's comment: a future session adding
   * a `target_id` column "because it would be useful" fails here.
   */
  test('the deletion audit is admin-only and holds no reference to the deleted account', async () => {
    const student_ = await clientFor(student);
    const { data: denied } = await student_.from('account_deletions').select('id');
    expect(denied?.length ?? 0, 'a student read the deletion audit').toBe(0);

    const admin = await clientFor(superadmin);
    /* Do a real deletion so there is a row to inspect. `other` is expendable —
       it is recreated per run and its id is already in `created`. */
    const { error } = await admin.rpc('admin_delete_account', {
      target: other.id,
      reason: 'inscription de test',
    });
    expect(error, `the admin deletion failed: ${error?.message}`).toBeNull();

    const { data: rows } = await admin
      .from('account_deletions')
      .select('*')
      .order('deleted_at', { ascending: false })
      .limit(1);
    const row = rows?.[0] as Record<string, unknown> | undefined;
    expect(row, 'no audit row was written').toBeTruthy();
    expect(String(row!['reason'])).toBe('inscription de test');
    expect(String(row!['deleted_by'])).toBe(superadmin.id);

    /* ⚠️ THE COLUMN LIST IS THE ASSERTION. Nothing here may identify the erased
       account — not an id, not an address, not a count. */
    expect(Object.keys(row!).sort()).toEqual(['deleted_at', 'deleted_by', 'id', 'reason']);
    const serialised = JSON.stringify(row);
    expect(serialised, 'the audit row carries the deleted account id').not.toContain(other.id);
    expect(serialised, 'the audit row carries the deleted email').not.toContain(other.email);

    /* And the deletion really happened — the audit must not be the only effect. */
    const { data: users } = await adminClient().auth.admin.listUsers();
    expect(users.users.some((u) => u.id === other.id), 'the account survived').toBe(false);
  });
});
