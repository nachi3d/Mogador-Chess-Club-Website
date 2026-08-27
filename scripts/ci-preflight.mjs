#!/usr/bin/env node
/**
 * CI preflight — the credentials are really there, and they are really NOT
 * production.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ THIS EXISTS BECAUSE A MISSING `.env.test` IS DELIBERATELY *NOT* AN
 * ABORT, AND THAT IS EXACTLY RIGHT LOCALLY AND A TRAP IN CI.
 *
 * `assertNotProduction()` treats an absent file as safe, for a good reason
 * written out in `tests/e2e/env.ts`: with no file there is no reachable
 * Supabase project of any kind, so there is nothing to protect against, and
 * aborting would brick ~750 specs for every checkout without a test project.
 * The auth specs then skip VISIBLY.
 *
 * In CI that same behaviour is a silent hole. A mistyped secret name, or a
 * secret nobody set, produces no file — and the gate then runs everything that
 * is not auth, skips everything that is, and REPORTS SUCCESS. That is the same
 * class of failure as the accounts-OFF sliver running zero tests, which
 * `test-release.mjs` already makes fatal for the identical reason: a gate that
 * quietly stops proving something is worse than one that fails.
 *
 * So CI asserts, before a browser starts, that the file exists, is complete,
 * and names a project that is not production.
 *
 * ⚠️ IT DOES NOT WIDEN `env.ts`. CLAUDE.md forbids letting the loader fall back
 * to `process.env` or `.env.local` — that single edit is what would let
 * production credentials into a suite that deletes by pattern. The workflow
 * WRITES `.env.test` from secrets instead, and this checks the result. The
 * loader is untouched.
 *
 * ⚠️ IT PRINTS NO SECRET. Only refs (which are in the project URL and are not
 * credentials) and booleans.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { loadE2EEnv, assertNotProduction, isSupabaseConfigured } from '../tests/e2e/env.ts';

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function die(why, fix) {
  console.error(red('\n  ✗ CI PREFLIGHT FAILED — refusing to start the gate.\n'));
  console.error(`  ${why}\n`);
  if (fix) console.error(dim(`  ${fix}\n`));
  process.exit(1);
}

const env = loadE2EEnv();

if (!env) {
  die(
    '.env.test is absent or unusable, so every auth spec would SKIP and the gate\n' +
      '  would still go green — a gate that has quietly stopped proving anything.',
    'The workflow writes .env.test from repository secrets. Check the five are set:\n' +
      '  TEST_PUBLIC_SUPABASE_URL, TEST_PUBLIC_SUPABASE_ANON_KEY,\n' +
      '  TEST_SUPABASE_SERVICE_ROLE, TEST_SUPABASE_PASSWORD, SUPABASE_PRODUCTION_REF.',
  );
}

/* Each checked on its own so the message names the one that is missing, rather
   than saying "something is wrong with your secrets". */
const required = [
  ['TEST_PUBLIC_SUPABASE_URL', env.supabaseUrl],
  ['TEST_PUBLIC_SUPABASE_ANON_KEY', env.anonKey],
  ['TEST_SUPABASE_SERVICE_ROLE', env.serviceRoleKey],
  ['SUPABASE_PRODUCTION_REF', env.productionRef],
];
const missing = required.filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  die(
    `these repository secrets are missing or empty: ${missing.join(', ')}.`,
    'A present-but-incomplete file is the dangerous state — someone mid-setup is\n' +
      '  exactly when a stray production ref gets pasted in.',
  );
}

/* ⚠️ THE INTERLOCK ITSELF, called rather than reimplemented. If this ever
   diverges from what Playwright's config enforces, the check is worthless. */
try {
  assertNotProduction();
} catch {
  /* It has already printed its own banner naming the reason. */
  console.error(red('  ✗ the production-safety interlock refused this configuration.\n'));
  process.exit(1);
}

if (!isSupabaseConfigured()) {
  die('the credentials are present but incomplete — auth specs would skip silently.');
}

console.log(green('\n  ✓ CI preflight passed.'));
console.log(dim(`      test project:       ${env.testRef}`));
console.log(dim(`      production ref:     ${env.productionRef}`));
console.log(dim(`      they differ:        yes`));
console.log(dim(`      auth specs will:    RUN (not skip)\n`));
