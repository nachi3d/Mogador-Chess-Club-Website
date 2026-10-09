/**
 * Which rows are THIS run's — the one question every shared-resource cleanup
 * has to answer, and the one it has got wrong twice.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE RULE: ANYTHING A RUN'S CLEANUP DELETES MUST BE IDENTIFIABLE AS THAT
 * RUN'S. A cleanup that matches by SHAPE ("duration 47, in 2029", "starts
 * `e2e-`") deletes every concurrent run's rows of the same shape, and counts
 * them as its own on the way.
 *
 * "Run" means one job of one gate run. Two of them share the test project in
 * two ways, and both have happened:
 *
 *   - the six JOBS of one gate run, in parallel (run 37904267059: webkit's
 *     teardown found the pseudo chromium had registered 0.6s earlier);
 *   - two whole GATE RUNS at once — every promotion pushes `main` and the
 *     `dev` back-merge seconds apart (runs 35834910255 + 35834927186: each
 *     `recurring-sessions` counted 26 sessions, then deleted the other's 13).
 *
 * So the scope comes from `E2E_EMAIL_DOMAIN`, which `gate.yml` makes unique
 * per job AND per run (`<job>-<run id>-<attempt>.mcc-e2e.test`). The domain
 * already scoped USERS; this tag carries the same scope to the resources that
 * cannot hold a domain:
 *
 *   - a PSEUDO account's address is `<pseudo>@pseudo.mogadorchess.invalid` —
 *     the tag goes in the pseudo;
 *   - a SESSION has no owner column at all — the tag goes in its title.
 *
 * ⚠️ A RESOURCE WITH NO OWNER COLUMN CANNOT BE ISOLATED BY A DOMAIN. It needs
 * a field the spec controls that can carry this tag, or it cannot be isolated
 * at all — `rebuild_requests` is that case, and `recurring-sessions.spec.ts`
 * says what it does about it instead.
 *
 * ⚠️ AND ABANDONED ROWS NEED A SECOND, AGE-GUARDED SWEEP. With a scope per run,
 * a crashed run's rows belong to a scope that will never run again, so nobody
 * would ever match them. `purge.ts` deletes ANY run's e2e rows once they are
 * older than `LEAK_AGE_MS` — longer than any job lasts, shorter than the gap
 * between gates. The age is what proves nobody is still using them.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { loadE2EEnv } from '../env';

/** Every e2e pseudo and every e2e session title starts with this. */
export const E2E_PREFIX = 'e2e-';

/**
 * How old an e2e row of ANOTHER scope must be before it counts as abandoned.
 * Comfortably longer than the slowest job in the matrix (webkit, ~20 min) and
 * far shorter than the gap between runs.
 */
export const LEAK_AGE_MS = 60 * 60 * 1000;

/** The cutoff as an ISO instant, for a `created_at < …` filter. */
export function abandonedBefore(): string {
  return new Date(Date.now() - LEAK_AGE_MS).toISOString();
}

/**
 * Four base-36 characters derived from the email domain — short, because a
 * pseudo is capped at 20 characters and this tag has to fit inside one.
 *
 * FNV-1a, 32-bit: deterministic, so a run's setup and teardown agree, and
 * spread well enough that two concurrent domains do not share a tag.
 */
export function scopeTag(): string {
  const domain = loadE2EEnv()?.emailDomain ?? 'mcc-e2e.test';
  let hash = 0x811c9dc5;
  for (let i = 0; i < domain.length; i++) {
    hash ^= domain.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(4, '0').slice(-4);
}

/** The prefix every pseudo and session title of THIS run starts with. */
export function scopePrefix(): string {
  return `${E2E_PREFIX}${scopeTag()}-`;
}
