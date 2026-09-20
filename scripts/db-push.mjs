#!/usr/bin/env node
/**
 * Apply `supabase/migrations/` to the TEST project.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ TEST ONLY, AND IT FAILS CLOSED — this is DDL, and DDL is the one thing on
 * this project that no cascade check and no purge can walk back.
 *
 * Credentials come from `.env.test` through `assertNotProduction()`, the same
 * interlock `playwright.config.ts`, `seed-test.mjs` and `demo:accounts` use.
 * There is deliberately NO flag, argument or environment variable that points
 * this at production: promoting a migration to the live project is a deliberate
 * act performed by a person against a ref they typed themselves. If a future
 * session adds a `--production` switch to this file, that is the bug.
 *
 * ⚠️ THE REF IS IN THE POOLER USERNAME (`postgres.<ref>`), which is what makes
 * the region probe below safe: a connection to the wrong region does not reach
 * a different project, it fails to authenticate. There is no region for which a
 * test-project username reaches production.
 *
 * ⚠️ `supabase link` IS NOT USABLE HERE. It calls the management API, which
 * needs a personal access token nobody has put on this machine — it fails with
 * `LegacyLinkProjectStatusError` and a privileges message that reads like a
 * permissions bug in the project. `--db-url` skips the management API entirely.
 *
 * ⚠️ THE PASSWORD IS IN THE ARGUMENT LIST, AND THAT IS A REAL TRADE. `--db-url`
 * is the only path that avoids the access token, so the URL is visible in a
 * process listing for the life of the command. It is redacted from everything
 * this script prints, and it is the TEST project's password. Do not paste the
 * command by hand; run the script.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadE2EEnv, assertNotProduction } from '../tests/e2e/env.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/**
 * Where the project's pooler lives. The direct `db.<ref>.supabase.co` host does
 * not resolve at all on a project without a dedicated IPv4 address, which is
 * every project created recently — so the region has to be known or found.
 *
 * `TEST_SUPABASE_DB_HOST` in `.env.test` short-circuits the probe. Without it
 * the list is tried in order, cheapest-first for a Moroccan club: the test
 * project is on eu-central-1.
 */
const REGIONS = [
  'aws-0-eu-central-1',
  'aws-0-eu-west-3',
  'aws-0-eu-west-1',
  'aws-0-eu-west-2',
  'aws-1-eu-central-1',
  'aws-1-eu-west-3',
  'aws-0-us-east-1',
];

/* Aborts on anything ambiguous — refs equal, production ref undeclared, an
   unparseable URL, an adapted template. Nothing below runs otherwise. */
assertNotProduction();

const env = loadE2EEnv();
if (!env?.testRef || !env.dbPassword) {
  console.error(
    red('\ndb:push — .env.test is missing TEST_PUBLIC_SUPABASE_URL or TEST_SUPABASE_PASSWORD.'),
  );
  console.error('⚠️ Copy .env.test.example (NOT .env.example) to .env.test.\n');
  process.exit(1);
}

/* Belt and braces over `assertNotProduction()`: that check is about the file,
   this one is about the ref this process is one syscall away from writing DDL
   to. Cheap, and the failure it prevents is unrecoverable. */
if (env.testRef === env.productionRef) {
  console.error(red(`\ndb:push — refusing: "${env.testRef}" is the PRODUCTION ref.\n`));
  process.exit(1);
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ ARGUMENTS ARE PARSED, AND ANYTHING UNRECOGNISED IS A REFUSAL.
 *
 * This script used to read `process.argv` NOT AT ALL. It ran a `--dry-run`
 * probe to find the pooler host, then applied unconditionally — so
 * `npm run db:push -- --dry-run` printed `"dryRun":false`, applied the
 * migration, and reported success. The flag was accepted, ignored, and
 * contradicted by the script's own output.
 *
 * ⚠️ A DRY-RUN FLAG THAT LIES IS WORSE THAN NO FLAG. The whole point of this
 * wrapper is that it refuses production; a flag someone learns to trust for
 * "just checking" is the one they will reach for when they are least sure
 * what they are pointed at. Caught at the 0013 gate, where the migration was
 * wanted anyway — which is exactly the kind of luck that lets a defect like
 * this survive.
 *
 * ⚠️ AND UNKNOWN ARGUMENTS NOW FAIL CLOSED. Silently discarding an argument
 * is what caused this, so `--dryrun`, `--dry` or a typo'd flag stops the run
 * rather than quietly applying. There is no argument this script accepts that
 * is safe to get wrong.
 * ═════════════════════════════════════════════════════════════════════════
 */
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length > 0) {
  console.error(red(`\ndb:push — refusing: unrecognised argument(s) ${unknown.join(' ')}.`));
  console.error(
    dim(
      '\n  The only accepted flag is --dry-run. An argument this script does not\n' +
        '  understand is not ignored, because ignoring one is how --dry-run came\n' +
        '  to apply migrations while reporting that it had not.\n',
    ),
  );
  process.exit(1);
}

const password = encodeURIComponent(env.dbPassword);
const redact = (text) => String(text ?? '').split(password).join('***').split(env.dbPassword).join('***');
const urlFor = (host) => `postgresql://postgres.${env.testRef}:${password}@${host}:5432/postgres`;

function run(host, extra) {
  const result = spawnSync(
    'npx',
    ['--yes', 'supabase', 'db', 'push', '--db-url', urlFor(host), ...extra],
    { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 300_000 },
  );
  return { status: result.status, output: redact((result.stdout ?? '') + (result.stderr ?? '')) };
}

console.log(`\n${bold('▸ db:push')} ${dim(`— migrations → TEST project "${env.testRef}"`)}`);
console.log(dim(`  production is "${env.productionRef}" and is not reachable from this script.\n`));

/* The probe is a DRY RUN, so a wrong guess costs a failed login and never a
   half-applied migration. */
const configured = process.env.TEST_SUPABASE_DB_HOST;
const candidates = configured ? [configured] : REGIONS.map((r) => `${r}.pooler.supabase.com`);

let host = null;
for (const candidate of candidates) {
  const probe = run(candidate, ['--dry-run']);
  if (probe.status === 0) {
    host = candidate;
    console.log(green(`  ✓ ${candidate}`));
    const pending = probe.output.match(/^ • .*$/gm) ?? [];
    console.log(
      pending.length
        ? dim(`  pending:\n${pending.join('\n')}\n`)
        : dim('  nothing pending — already up to date.\n'),
    );
    if (pending.length === 0) process.exit(0);
    break;
  }
  console.log(dim(`  ..  ${candidate} — no`));
}

if (!host) {
  console.error(red('\n  ✗ no reachable pooler host for this project.'));
  console.error(
    '\n    Set TEST_SUPABASE_DB_HOST in .env.test to the project\'s pooler host\n' +
      '    (Supabase dashboard → Connect → Session pooler).\n',
  );
  process.exit(1);
}

/* ⚠️ THE DRY RUN STOPS HERE, HAVING CHANGED NOTHING. The probe above is
   itself `supabase db push --dry-run`, so the pending list printed a moment
   ago is the real answer to "what would this apply?" — and no `--include-all`
   has been run. */
if (DRY_RUN) {
  console.log(green('  ✓ dry run — NOTHING was applied.\n'));
  console.log(dim(`  Re-run without --dry-run to apply the above to "${env.testRef}".\n`));
  process.exit(0);
}

console.log(yellow('  applying…\n'));
const push = run(host, ['--include-all']);
console.log(push.output);
if (push.status !== 0) {
  console.error(red('\n  ✗ push failed.\n'));
  process.exit(push.status ?? 1);
}

console.log(green(`  ✓ migrations applied to "${env.testRef}".\n`));
console.log(
  dim(
    '  ⚠️ PRODUCTION IS NOT TOUCHED. Promoting these to the live project is a\n' +
      '  deliberate act — see docs/ADMIN.md.\n',
  ),
);
