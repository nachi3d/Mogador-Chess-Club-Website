/**
 * Purge-by-pattern — runs BEFORE and AFTER the suite, and FAILS the run on
 * residue.
 *
 * Before, because a previous crashed run leaves users behind and a suite that
 * starts from unknown state proves nothing. After, because a test project that
 * accumulates thousands of accounts eventually changes how the tests behave.
 *
 * ⚠️ Residue is a FAILURE, not a warning. If the purge cannot clean up, the
 * next run starts dirty; letting that pass quietly is how a suite rots into
 * "it's always like that".
 *
 * The pattern is the e2e email domain. Nothing outside it is ever touched, so
 * this cannot delete a real account even if it were somehow pointed at a
 * populated project — which the interlock in `env.ts` already prevents.
 */

import { adminClient } from './supabase-admin';
import { loadE2EEnv } from '../env';

/** Users whose email is inside the e2e domain. */
async function findE2EUsers(): Promise<Array<{ id: string; email: string }>> {
  const env = loadE2EEnv();
  if (!env) return [];
  const sb = adminClient();

  const found: Array<{ id: string; email: string }> = [];
  /* The admin list API is paginated and there is no server-side email filter,
     so we page through and match locally. Bounded to keep a runaway project
     from turning teardown into an unbounded crawl. */
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`purge: listUsers failed — ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email && u.email.endsWith(`@${env.emailDomain}`)) {
        found.push({ id: u.id, email: u.email });
      }
    }
    if (users.length < 200) break;
  }
  return found;
}

/**
 * Delete every e2e user. Profiles, progress and attendance follow by cascade —
 * which is also a live check that the erasure chain in migration 0001 works:
 * if the cascade were broken, the residue check below would catch it.
 */
export async function purgeE2EData(phase: 'before' | 'after'): Promise<void> {
  const env = loadE2EEnv();
  if (!env || !env.serviceRoleKey) return; // unconfigured ⇒ auth specs skip anyway

  const sb = adminClient();
  const users = await findE2EUsers();
  const deletedIds: string[] = [];

  for (const u of users) {
    const { error } = await sb.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`purge(${phase}): could not delete ${u.email} — ${error.message}`);
    deletedIds.push(u.id);
  }

  // Verify rather than assume.
  const residue = await findE2EUsers();
  if (residue.length > 0) {
    throw new Error(
      `purge(${phase}): ${residue.length} e2e user(s) survived deletion — ` +
        residue.map((r) => r.email).join(', ') +
        '. Refusing to continue with a dirty test project.',
    );
  }

  /**
   * Cascade check. Any row still referencing a user we just deleted means the
   * `on delete cascade` chain in migration 0001 is not doing its job — and the
   * erasure right depends on exactly that chain.
   *
   * Checked against the ids we deleted, not with a subquery: PostgREST's `in`
   * takes a literal list, and an earlier draft of this passed it a SQL subquery
   * that simply errored — which, with the error swallowed, made the whole check
   * pass vacuously forever.
   */
  if (deletedIds.length > 0) {
    for (const table of ['exercise_progress', 'lesson_progress', 'attendance'] as const) {
      const { count, error } = await sb
        .from(table)
        .select('profile_id', { count: 'exact', head: true })
        .in('profile_id', deletedIds);
      if (error) {
        throw new Error(`purge(${phase}): cascade check on ${table} failed — ${error.message}`);
      }
      if ((count ?? 0) > 0) {
        throw new Error(
          `purge(${phase}): ${count} ${table} row(s) survived their deleted profile — ` +
            'the delete cascade is broken and erasure would be incomplete.',
        );
      }
    }
  }
}
