/**
 * Purge AFTER the suite.
 *
 * A test project that accumulates accounts eventually changes how the tests
 * behave — pagination, rate limits, "why are there 4000 users". Residue fails
 * the run so that rot is visible on the commit that caused it.
 */
import { isSupabaseConfigured } from './env';
import { purgeE2EData } from './helpers/purge';

export default async function globalTeardown(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await purgeE2EData('after');
}
