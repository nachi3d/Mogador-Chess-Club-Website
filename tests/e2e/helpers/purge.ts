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
/**
 * ⚠️ SESSIONS LEAK, AND THEY LEAK INTO THE PUBLIC AGENDA (v0.16.0).
 *
 * `sessions` rows are club sessions, not user-owned, so deleting the e2e users
 * cascades nothing to them. Specs that create one delete it on the way out —
 * and a spec that is interrupted does not. They accumulate forever.
 *
 * ⚠️ WHAT THAT ACTUALLY COSTS: `fetch-agenda.mjs` bakes every future session
 * into `/agenda/` at build time, so a test build renders one card per leak.
 * **318 had accumulated by the v0.16.0 gate, 312 of them leaked**, and axe
 * scanning 277 rendered cards in Firefox blew the 30-second test timeout.
 * `agenda.spec.ts` failed, and it looked exactly like a browser problem — two
 * sessions were spent on the wrong diagnosis before anyone counted the cards.
 *
 * ⚠️ "UNTITLED" IS NOT ENOUGH, AND THAT WAS PROVED THE HARD WAY. Deleting
 * every `title_fr IS NULL` row also removed the session migration 0006 inserts
 * — it carries NOTES but no title — and two agenda specs went red immediately
 * ('the session migrated out of the git collection is still published', 'the
 * English agenda carries the English note'). It had to be restored by hand.
 *
 * So a leak is a row with NO title AND NO notes in either language: the specs
 * create bare rows, and everything seeded or migrated says something in at
 * least one field. The migrated uuid is excluded explicitly as well — belt and
 * braces on the one row whose loss breaks the suite.
 *
 * ⚠️ A SPEC THAT STARTS CREATING SESSIONS WITH NOTES MUST DELETE THEM ITSELF.
 * Widening this predicate again is how a seeded row gets eaten a second time.
 *
 * ⚠️⚠️ AND THIS DELETE IS GLOBAL — IT IS NOT SCOPED BY `E2E_EMAIL_DOMAIN`.
 * That per-job domain isolates USERS. Sessions have no owner, so every
 * concurrent run's setup and teardown can delete every other run's bare
 * sessions, and `booking.spec.ts` creates bare sessions while it runs.
 * `booking-ui.spec.ts` drives the BAKED agenda, so it can be holding a panel
 * for a row another job is about to remove — which is what turned CI gate runs
 * #8 and #10 red, looking exactly like a WebKit bug.
 *
 * ⚠️ THE OTHER HALF OF THIS RULE LIVES IN `booking-ui.spec.ts`'s
 * `bookablePanel()`, which refuses to book any row matching the predicate
 * below. **Change one and you must change the other.**
 *
 * Runs in BOTH phases, like the user purge: before, because a crashed run left
 * residue; after, because this one might crash too.
 */
/** Migration 0006's row — untitled, note-bearing, and load-bearing for the suite. */
const MIGRATED_SESSION_ID = '5e5e0912-0000-4000-8000-000000000912';

async function purgeLeakedSessions(phase: 'before' | 'after'): Promise<void> {
  const sb = adminClient();
  const { error } = await sb
    .from('sessions')
    .delete()
    .is('title_fr', null)
    .is('note_fr', null)
    .is('note_en', null)
    .neq('id', MIGRATED_SESSION_ID);
  if (error) {
    throw new Error(`purge(${phase}): could not delete leaked sessions — ${error.message}`);
  }
}

export async function purgeE2EData(phase: 'before' | 'after'): Promise<void> {
  const env = loadE2EEnv();
  if (!env || !env.serviceRoleKey) return; // unconfigured ⇒ auth specs skip anyway

  const sb = adminClient();
  await purgeLeakedSessions(phase);
  const users = await findE2EUsers();
  const deletedIds: string[] = [];

  /**
   * ⚠️ THE CHILD IDS ARE COLLECTED BEFORE THE DELETE, because afterwards there
   * is nothing left to ask. Since migration 0005 the learner tables reference
   * `child_profiles.id`, and the chain under test is now two links long:
   * `auth.users` → `profiles` → `child_profiles` → progress/games/attendance/
   * awards. Reading the children first is what lets the check below prove the
   * whole chain rather than its first link.
   */
  const childIds: string[] = [];
  if (users.length > 0) {
    const { data, error } = await sb
      .from('child_profiles')
      .select('id')
      .in(
        'account_id',
        users.map((u) => u.id),
      );
    if (error) throw new Error(`purge(${phase}): could not read child profiles — ${error.message}`);
    for (const row of data ?? []) childIds.push(String(row.id));
  }

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
   * `on delete cascade` chain is not doing its job — and the erasure right
   * depends on exactly that chain.
   *
   * Checked against the ids we deleted, not with a subquery: PostgREST's `in`
   * takes a literal list, and an earlier draft of this passed it a SQL subquery
   * that simply errored — which, with the error swallowed, made the whole check
   * pass vacuously forever.
   *
   * ⚠️ THE OWNER COLUMN IS `child_id`, NOT `profile_id`, ON EVERY LEARNER TABLE.
   * Migration 0005 repointed `exercise_progress`, `game_results`, `attendance`
   * and `point_awards` at `child_profiles` and DROPPED `profile_id` from each.
   * This check went on asking for the dropped column, so PostgREST answered
   * `42703` and the throw below fired on every purge that had anything to
   * delete — aborting the run in global setup or teardown, with an error that
   * blamed the cascade rather than the query. The failure was invisible while
   * the project happened to be empty, because the whole block is skipped when
   * nothing was deleted.
   *
   * `lesson_progress` is deliberately still checked on `profile_id`: it is the
   * deprecated 0001 table (see 0003), it was never repointed, and it still
   * hangs off the account.
   */
  if (deletedIds.length > 0) {
    const { count: orphanChildren, error: childError } = await sb
      .from('child_profiles')
      .select('id', { count: 'exact', head: true })
      .in('account_id', deletedIds);
    if (childError) {
      throw new Error(`purge(${phase}): cascade check on child_profiles failed — ${childError.message}`);
    }
    if ((orphanChildren ?? 0) > 0) {
      throw new Error(
        `purge(${phase}): ${orphanChildren} child profile(s) survived their deleted account — ` +
          'the delete cascade is broken and erasure would be incomplete.',
      );
    }

    if (childIds.length > 0) {
      for (const table of [
        'exercise_progress',
        'game_results',
        'attendance',
        'point_awards',
      ] as const) {
        const { count, error } = await sb
          .from(table)
          .select('child_id', { count: 'exact', head: true })
          .in('child_id', childIds);
        if (error) {
          throw new Error(`purge(${phase}): cascade check on ${table} failed — ${error.message}`);
        }
        if ((count ?? 0) > 0) {
          throw new Error(
            `purge(${phase}): ${count} ${table} row(s) survived their deleted child profile — ` +
              'the delete cascade is broken and erasure would be incomplete.',
          );
        }
      }
    }

    const { count: lessons, error: lessonError } = await sb
      .from('lesson_progress')
      .select('profile_id', { count: 'exact', head: true })
      .in('profile_id', deletedIds);
    if (lessonError) {
      throw new Error(`purge(${phase}): cascade check on lesson_progress failed — ${lessonError.message}`);
    }
    if ((lessons ?? 0) > 0) {
      throw new Error(
        `purge(${phase}): ${lessons} lesson_progress row(s) survived their deleted profile — ` +
          'the delete cascade is broken and erasure would be incomplete.',
      );
    }
  }
}
