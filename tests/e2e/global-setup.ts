/**
 * Purge BEFORE the suite.
 *
 * A previous crashed run leaves users behind, and a suite that starts from
 * unknown state proves nothing about the state it ends in. Residue here is a
 * hard failure, not a warning — see `helpers/purge.ts`.
 *
 * Does nothing when there is no `.env.test`: the auth specs skip in that case,
 * so there is nothing to clean and no project to reach.
 */
import { isSupabaseConfigured } from './env';
import { purgeE2EData } from './helpers/purge';

export default async function globalSetup(): Promise<void> {
  if (!isSupabaseConfigured()) {
    // eslint-disable-next-line no-console
    console.log('[e2e] no .env.test — auth specs will skip; nothing to purge.');
    return;
  }
  await purgeE2EData('before');
}
