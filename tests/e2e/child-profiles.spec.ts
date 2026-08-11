import { test, expect } from '@playwright/test';
import { adminClient, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';

/**
 * 0005 — the parent/child model, asserted against the database.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ AGAINST POSTGREST, NOT THE UI, for the same reason `role-separation.spec`
 * is: RLS is the boundary and the picker is only UX. A parent who opens
 * devtools does not use the buttons.
 *
 * ⚠️ THE ONE THAT MATTERS IS "a parent cannot take over another family's
 * child". Every other boundary here costs privacy; that one would hand a
 * stranger a child's whole record.
 * ═════════════════════════════════════════════════════════════════════════
 */

test.describe('0005 — child profiles', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  const created: string[] = [];
  let parent = { id: '', email: '', password: '' };
  let stranger = { id: '', email: '', password: '' };
  let mine: { id: string; name: string }[] = [];
  let theirs = { id: '', name: '' };

  async function clientFor(user: { email: string; password: string }) {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv();
    expect(env, 'no .env.test — these tests need the TEST project').not.toBeNull();
    const c = createClient(env!.supabaseUrl, env!.anonKey, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: user.email, password: user.password });
    expect(error, 'the test user could not sign in').toBeNull();
    return c;
  }

  test.beforeAll(async () => {
    const mk = async (tag: string) => {
      const email = e2eEmail(`s5-${tag}`);
      const password = `S5-${Date.now()}-${tag}-aA1!`;
      const { data, error } = await adminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(error, `could not create ${tag}: ${error?.message}`).toBeNull();
      created.push(data.user!.id);
      return { id: data.user!.id, email, password };
    };
    parent = await mk('parent');
    stranger = await mk('stranger');

    const pc = await clientFor(parent);
    const { data } = await pc
      .from('child_profiles')
      .insert([
        { account_id: parent.id, display_name: 'Yasmine' },
        { account_id: parent.id, display_name: 'Adam' },
      ])
      .select('id,display_name');
    mine = (data ?? []).map((r) => ({ id: String(r['id']), name: String(r['display_name']) }));

    const sc = await clientFor(stranger);
    const { data: other } = await sc
      .from('child_profiles')
      .insert([{ account_id: stranger.id, display_name: 'Ilyas' }])
      .select('id,display_name');
    theirs = { id: String(other?.[0]?.['id']), name: String(other?.[0]?.['display_name']) };
  });

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  test('a parent holds several children and sees only their own', async () => {
    const c = await clientFor(parent);
    const { data } = await c.from('child_profiles').select('id,display_name');
    expect(data?.length).toBe(2);
    expect(data?.map((r) => r['display_name']).sort()).toEqual(['Adam', 'Yasmine']);
  });

  test("⚠️ a parent cannot take over another family's child", async () => {
    const c = await clientFor(parent);
    const { data } = await c
      .from('child_profiles')
      .update({ account_id: parent.id })
      .eq('id', theirs.id)
      .select();
    expect(data?.length ?? 0, 'a child was abducted').toBe(0);

    const { data: still } = await adminClient()
      .from('child_profiles')
      .select('account_id')
      .eq('id', theirs.id);
    expect(still?.[0]?.['account_id']).toBe(stranger.id);
  });

  test('a parent cannot create a child under someone else’s account', async () => {
    const c = await clientFor(parent);
    const { error } = await c
      .from('child_profiles')
      .insert([{ account_id: stranger.id, display_name: 'Fantôme' }]);
    expect(error?.code).toBe('42501');
  });

  test('progress attaches to the child, and only to one the caller holds', async () => {
    const c = await clientFor(parent);
    const { error: okWrite } = await c.from('exercise_progress').insert([
      { child_id: mine[0]!.id, exercise_slug: 'mat-du-couloir', kind: 'exercise', solved: true },
    ]);
    expect(okWrite, `a parent could not write their own child's progress: ${okWrite?.message}`).toBeNull();

    const { error: badWrite } = await c.from('exercise_progress').insert([
      { child_id: theirs.id, exercise_slug: 'triche', kind: 'exercise', solved: true },
    ]);
    expect(badWrite?.code, "a parent wrote another family's progress").toBe('42501');

    const sc = await clientFor(stranger);
    const { data } = await sc.from('exercise_progress').select('*');
    expect(data?.length ?? 0, 'progress leaked across families').toBe(0);
  });

  /**
   * ⚠️ THE BACKLOG'S OWN TEST FOR THIS SHAPE: if graduating requires copying
   * rows between tables, the shape is wrong. So this asserts the child KEY is
   * unchanged and the row counts are identical — not merely that the new
   * account can see something.
   */
  test('graduation is one FK update and the progress follows', async () => {
    /* ⚠️ SEEDS ITS OWN PROGRESS AND ITS OWN CHILD. It originally leaned on the
       row written by the test above, which is a dependency between tests that
       `fullyParallel` is free to break — and did: the two ran in different
       workers and this one measured zero rows to move, then asserted that zero
       equalled zero. A proof that passes on an empty set proves nothing. */
    const c = await clientFor(parent);
    const { data: made } = await c
      .from('child_profiles')
      .insert([{ account_id: parent.id, display_name: 'Sofia' }])
      .select('id,display_name');
    const child = { id: String(made![0]!['id']), name: String(made![0]!['display_name']) };
    await c.from('exercise_progress').insert([
      { child_id: child.id, exercise_slug: 'grad-a', kind: 'exercise', solved: true },
      { child_id: child.id, exercise_slug: 'grad-b', kind: 'tutorial', solved: true },
    ]);

    const countFor = async (id: string) =>
      ((await adminClient().from('exercise_progress').select('child_id').eq('child_id', id)).data ?? [])
        .length;
    const before = await countFor(child.id);
    expect(before, 'nothing to prove — seed progress first').toBe(2);

    const grown = await (async () => {
      const email = e2eEmail('s5-grown');
      const password = `S5-${Date.now()}-grown-aA1!`;
      const { data } = await adminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      created.push(data.user!.id);
      return { id: data.user!.id, email, password };
    })();

    const { error } = await adminClient().rpc('graduate_child', {
      child: child.id,
      new_account: grown.id,
    });
    expect(error, `graduate_child failed: ${error?.message}`).toBeNull();

    const { data: held } = await adminClient()
      .from('child_profiles')
      .select('id,account_id')
      .eq('id', child.id);
    expect(held?.[0]?.['account_id']).toBe(grown.id);
    expect(held?.[0]?.['id'], 'the child key changed — rows were copied').toBe(child.id);
    expect(await countFor(child.id), 'progress did not follow').toBe(before);

    /* And the old account is genuinely cut off. */
    const { data: oldSees } = await c.from('exercise_progress').select('*').eq('child_id', child.id);
    expect(oldSees?.length ?? 0, 'the old account still reads the graduated child').toBe(0);

    /* The new one reads it. */
    const grownC = await clientFor(grown);
    const { data: grownSees } = await grownC
      .from('exercise_progress')
      .select('*')
      .eq('child_id', child.id);
    expect(grownSees?.length).toBe(before);
  });

  test('graduate_child is not reachable by a signed-in account', async () => {
    const c = await clientFor(parent);
    const { error } = await c.rpc('graduate_child', {
      child: theirs.id,
      new_account: parent.id,
    });
    expect(error, 'a parent reached graduate_child').not.toBeNull();
  });

  test('deleting the account takes the child with it', async () => {
    const email = e2eEmail('s5-doomed');
    const password = `S5-${Date.now()}-doomed-aA1!`;
    const { data } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
    const id = data.user!.id;
    const { data: kid } = await adminClient()
      .from('child_profiles')
      .insert([{ account_id: id, display_name: 'Éphémère' }])
      .select('id');
    await deleteUser(id);
    const { data: left } = await adminClient()
      .from('child_profiles')
      .select('id')
      .eq('id', kid?.[0]?.['id']);
    expect(left?.length ?? 0, 'the child profile outlived its account').toBe(0);
  });
});
