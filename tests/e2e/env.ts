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
  /**
   * Unprefixed `PUBLIC_SUPABASE_*` keys present in `.env.test` — the signature
   * of a file adapted from `.env.example`. Non-empty means the interlock aborts.
   */
  readonly adaptedTemplateKeys: readonly string[];
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
 * The one sentence every failure here ends with. Kept as a constant so the
 * three different ways of getting this wrong all give the same instruction —
 * a reader who has just been stopped needs the fix, not a diagnosis.
 */
export const FIX_MESSAGE =
  'copy .env.test.example, do not adapt .env.example';

/**
 * Unprefixed build-time keys. Their presence in `.env.test` is the SIGNATURE of
 * a file adapted from `.env.example`, which is how `SUPABASE_PRODUCTION_REF`
 * went missing twice — that template has no such key, so it vanishes silently.
 */
const ADAPTED_TEMPLATE_KEYS = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'] as const;

/**
 * Read the first key that is actually present.
 *
 * `TEST_`-prefixed names are the ONLY supported spelling for the credentials: a
 * file in which every credential literally says TEST cannot be confused with
 * `.env.local`.
 *
 * ⚠️ The unprefixed fallback that used to live here has been REMOVED on purpose.
 * It existed for backwards compatibility with the original example file, and it
 * was actively harmful: it let a `.env.test` adapted from `.env.example` load
 * far enough to look configured, which is exactly the state that kept losing the
 * production ref. The shape it was compatible with is now the failure signature,
 * so accepting it would defeat the guard in `assertNotProduction()`.
 *
 * ⚠️ `SUPABASE_PRODUCTION_REF` is deliberately NOT prefixed and NOT derived from
 * anything. It is the one value here that describes production, and the
 * interlock's entire judgement rests on it being stated explicitly.
 */
function pick(raw: Record<string, string>, ...names: string[]): string {
  for (const n of names) if (raw[n]) return raw[n];
  return '';
}

export function loadE2EEnv(): E2EEnv | null {
  if (!existsSync(ENV_TEST_PATH)) return null;
  const raw = parseEnvFile(readFileSync(ENV_TEST_PATH, 'utf8'));

  const supabaseUrl = pick(raw, 'TEST_PUBLIC_SUPABASE_URL');
  const testRef = projectRefFromUrl(supabaseUrl);
  if (!testRef) return null;

  return {
    supabaseUrl,
    anonKey: pick(raw, 'TEST_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: pick(raw, 'TEST_SUPABASE_SERVICE_ROLE_KEY', 'TEST_SUPABASE_SERVICE_ROLE'),
    dbPassword: pick(raw, 'TEST_SUPABASE_PASSWORD'),
    productionRef: raw.SUPABASE_PRODUCTION_REF ?? '',
    emailDomain: pick(raw, 'E2E_EMAIL_DOMAIN') || 'mcc-e2e.test',
    testRef,
    /** Unprefixed build-time keys found — the adapted-template signature. */
    adaptedTemplateKeys: ADAPTED_TEMPLATE_KEYS.filter((k) => Boolean(raw[k])),
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
    console.error('  point at production.');
    console.error('');
    console.error('  FIX: ' + FIX_MESSAGE + '.');
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

  /**
   * ⚠️ GUARD: the adapted-template signature.
   *
   * An unprefixed `PUBLIC_SUPABASE_URL` or `PUBLIC_SUPABASE_ANON_KEY` in
   * `.env.test` means the file came from `.env.example`, which carries no
   * `SUPABASE_PRODUCTION_REF` — the exact way that key went missing twice.
   *
   * Checked BEFORE anything else, and checked even when the file happens to be
   * otherwise complete: someone may have adapted the wrong template AND pasted
   * the production ref in by hand, which is how it once ended up naming the TEST
   * project as production. The shape is wrong, so the file is wrong.
   *
   * This is read straight from the raw file rather than through `loadE2EEnv()`,
   * because the loader no longer accepts those spellings at all.
   */
  const rawFile = parseEnvFile(readFileSync(ENV_TEST_PATH, 'utf8'));
  const adapted = ADAPTED_TEMPLATE_KEYS.filter((k) => Boolean(rawFile[k]));
  if (adapted.length > 0) {
    fail(
      [
        `.env.test contains ${adapted.join(' and ')} without the TEST_ prefix.`,
        '',
        '  That is the signature of a file adapted from .env.example, which has',
        '  no SUPABASE_PRODUCTION_REF — the exact way that key went missing twice.',
        '  Credentials here must be TEST_PUBLIC_SUPABASE_URL,',
        '  TEST_PUBLIC_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE.',
      ].join('\n'),
    );
    return;
  }

  const env = loadE2EEnv();
  if (!env) {
    fail('.env.test exists but has no usable TEST_PUBLIC_SUPABASE_URL.');
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
