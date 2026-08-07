/**
 * e2e environment — resolves the TEST Supabase project, and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS FILE LOADS `.env.test` AND ONLY `.env.test`.
 *
 * Not `.env`, not `.env.local`, not `process.env` inheritance from a dev shell.
 * The e2e suite creates users and PURGES BY PATTERN; if it can silently inherit
 * a developer's production credentials, it deletes real accounts. Widening this
 * to "fall back to .env if .env.test is missing" is the single most dangerous
 * edit anyone could make to this repository.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ENV_TEST_PATH = resolve(here, '../../.env.test');

export interface E2EEnv {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  /** Direct Postgres password, for `supabase db push` / seeding. */
  readonly dbPassword: string;
  readonly productionRef: string;
  readonly emailDomain: string;
  readonly testRef: string;
}

/** Minimal dotenv: `KEY=value`, optional quotes, `#` comments, no interpolation. */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The project ref is the first label of a `*.supabase.co` host.
 * Returns null rather than guessing — an unparseable URL must fail the
 * interlock, not slip past it.
 */
export function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const first = host.split('.')[0];
    return first && first.length > 0 ? first : null;
  } catch {
    return null;
  }
}

/**
 * Read the first key that is actually present.
 *
 * `TEST_`-prefixed names are preferred and are the documented convention: a
 * file where every credential literally says TEST is much harder to misread
 * than one whose keys are indistinguishable from `.env.local`'s. The unprefixed
 * spellings are still accepted so an older `.env.test` keeps working.
 *
 * ⚠️ `SUPABASE_PRODUCTION_REF` is deliberately NOT prefixed and NOT derived from
 * anything. It is the one value here that describes production, and the
 * interlock's entire judgement rests on it being stated explicitly by a human.
 */
function pick(raw: Record<string, string>, ...names: string[]): string {
  for (const n of names) if (raw[n]) return raw[n];
  return '';
}

export function loadE2EEnv(): E2EEnv | null {
  if (!existsSync(ENV_TEST_PATH)) return null;
  const raw = parseEnvFile(readFileSync(ENV_TEST_PATH, 'utf8'));

  const supabaseUrl = pick(raw, 'TEST_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL');
  const testRef = projectRefFromUrl(supabaseUrl);
  if (!testRef) return null;

  return {
    supabaseUrl,
    anonKey: pick(raw, 'TEST_PUBLIC_SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: pick(
      raw,
      'TEST_SUPABASE_SERVICE_ROLE_KEY',
      'TEST_SUPABASE_SERVICE_ROLE',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE',
    ),
    dbPassword: pick(raw, 'TEST_SUPABASE_PASSWORD', 'SUPABASE_PASSWORD'),
    productionRef: raw.SUPABASE_PRODUCTION_REF ?? '',
    emailDomain: pick(raw, 'E2E_EMAIL_DOMAIN') || 'mcc-e2e.test',
    testRef,
  };
}

/** True when auth specs can run at all. Used to skip, never to weaken. */
export function isSupabaseConfigured(): boolean {
  const env = loadE2EEnv();
  return Boolean(env && env.supabaseUrl && env.anonKey && env.serviceRoleKey);
}

/**
 * ⚠️ THE INTERLOCK. Runs at Playwright config load, before a single test.
 *
 * Aborts the entire run when the resolved test project is (or might be) the
 * production project. It FAILS CLOSED in every ambiguous case:
 *
 *   - `.env.test` missing or unparseable  → abort
 *   - production ref not declared         → abort
 *   - refs equal                          → abort
 *   - URL not parseable to a ref          → abort
 *
 * "Not configured" is treated exactly like "pointed at production", because an
 * unconfigured run is precisely when someone is most likely to have exported
 * production credentials into their shell.
 *
 * The one allowed exit is: both refs present, both parse, and they differ.
 */
export function assertNotProduction(): void {
  const fail = (why: string): never => {
    /* eslint-disable no-console */
    console.error('\n' + '='.repeat(72));
    console.error('  E2E ABORTED — the production-safety interlock refused to run.');
    console.error('  ' + why);
    console.error('');
    console.error('  The e2e suite creates users and purges by pattern. It must never');
    console.error('  point at production. See .env.test.example.');
    console.error('='.repeat(72) + '\n');
    /* eslint-enable no-console */
    throw new Error(`assertNotProduction: ${why}`);
  };

  /**
   * ⚠️ THE ONE CASE THAT IS NOT AN ABORT, AND EXACTLY WHY.
   *
   * No `.env.test` file at all ⇒ `loadE2EEnv()` returns null ⇒ the admin client
   * and the purge have no credentials and this module NEVER reads `process.env`
   * — so there is no reachable Supabase project of any kind, production
   * included. There is nothing to protect against, and aborting here would
   * instead brick the ~750 specs that have nothing to do with auth for every
   * checkout without a test project.
   *
   * The auth specs skip VISIBLY in this case (see `isSupabaseConfigured()`);
   * they are never silently reported as passing.
   *
   * Note the asymmetry: a MISSING file is safe, a PRESENT-BUT-INCOMPLETE file
   * is not — that is someone mid-setup, which is precisely when a stray
   * production ref gets pasted in. Everything below fails closed.
   */
  if (!existsSync(ENV_TEST_PATH)) return;

  const env = loadE2EEnv();
  if (!env) {
    fail('.env.test exists but is unreadable or has no usable PUBLIC_SUPABASE_URL.');
    return;
  }
  if (!env.productionRef) {
    /**
     * ⚠️ THE OBSERVED FAILURE, TWICE — so the message names its own cause.
     *
     * Both times, `.env.test` had been recreated by copying `.env.example` (the
     * build-time template) instead of `.env.test.example`. `.env.example` has no
     * `SUPABASE_PRODUCTION_REF`, so the key vanishes silently and the suite
     * aborts with a message that, on its own, reads like a mystery.
     *
     * The tell is a commented-out `PUBLIC_UMAMI_WEBSITE_ID` in `.env.test`:
     * analytics has nothing to do with testing, and that line exists only in the
     * wrong template.
     */
    const looksMidSetup = Boolean(env.supabaseUrl && env.anonKey);
    fail(
      'SUPABASE_PRODUCTION_REF is not set, so "is this production?" cannot be answered.' +
        (looksMidSetup
          ? '\n\n  The TEST_ values ARE present, so this is a half-configured .env.test.' +
            '\n  This has happened twice, and both times the file had been copied from' +
            '\n  .env.example (which has no such key) instead of .env.test.example.' +
            '\n  Check for a stray PUBLIC_UMAMI_WEBSITE_ID line — that is the tell.' +
            '\n  Fix: copy .env.test.example, which now carries the real value.'
          : ''),
    );
    return;
  }
  if (env.testRef === env.productionRef) {
    fail(`the test project ref "${env.testRef}" IS the production ref. Refusing.`);
    return;
  }
  if (!env.serviceRoleKey) {
    fail('SUPABASE_SERVICE_ROLE_KEY is not set; the purge could not clean up after itself.');
  }
}
