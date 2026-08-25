#!/usr/bin/env node
/**
 * `npm run test:branch` — THE per-session verification command.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ CHROMIUM ONLY, AND THAT IS NOT A SHORTCUT — IT IS THE POLICY.
 *
 * CLAUDE.md has always said feature branches run chromium only. In practice
 * sessions kept reaching for the full matrix "to be safe", and a 30-45 minute
 * five-browser run became the default cost of touching anything. That is not
 * caution; it is a tax that discourages small fixes, and unfixed small things
 * are what a visitor actually sees.
 *
 * The matrix answers ONE question: does this work in Firefox and WebKit. That
 * question is asked ONCE, at promotion to main, by the `gate` workflow on
 * GitHub Actions (`.github/workflows/gate.yml`).
 *
 * ⚠️ CI IS THE GATE OF RECORD SINCE v0.24.0, NOT A LOCAL RUN. Smart App
 * Control blocked WebKit on the only machine that could run the matrix here —
 * twice — and both releases shipped on transferred evidence. A Linux runner
 * has no such policy. `npm run test:release` still runs the whole matrix
 * locally and is still the right thing for a developer who wants it; it is
 * simply no longer what a promotion is allowed to rest on.
 *
 * Asking the question on every branch does not make the answer truer — it just
 * moves the cost from one run per release to one run per session.
 *
 * ⚠️ THERE IS NO "CRITICAL PATH" ESCAPE HATCH ANY MORE, DELIBERATELY.
 * The old rule said the board island, the exercise validator, i18n routing and
 * the service worker triggered the matrix on any branch. It sounded prudent
 * and it was the loophole through which the matrix became the default: almost
 * everything on this site touches one of those four. Those paths now get
 * PRECISE chromium coverage from `scripts/spec-map.mjs` — which lists more
 * specs for BoardSurface than the old rule ever ran deliberately — and their
 * cross-browser pass at the release gate, like everything else.
 *
 * If you are reading this because you are about to run the matrix on a feature
 * branch: don't. Run this. If you believe you have found the exception, the
 * honest move is to change the policy in CLAUDE.md in the same commit, not to
 * make a one-off exception no future session will know about.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `--all` runs every chromium spec rather than the mapped subset. For a
 * sweeping refactor where the mapping cannot be trusted to have caught
 * everything. Still one browser.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { specsFor } from './spec-map.mjs';
import { NEEDS_ACCOUNTS_ON, NEEDS_ACCOUNTS_OFF } from './lanes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'gate-logs');

/* ⚠️ STAMPED, so a second red run does not erase the first's evidence — the
   same lesson matrix-<shape>-<stamp>.log learned at the v0.17.0 gate. */
const RUN_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ KEEP THE FAILURE ARTEFACTS — AND THIS RUNNER NEEDED IT MORE THAN THE
 * GATE DID, WHICH IS NOT WHERE THE FIX LANDED FIRST.
 *
 * `test-release.mjs` got this because it runs six times and clears
 * `test-results/` between projects. This runner runs ONE project, so nothing
 * clears the directory mid-run — and that made it look safe. It is not: the
 * artefacts survive only until the NEXT run, and the next run is the most
 * natural thing anybody does after a red branch gate.
 *
 * ⚠️ THAT HAPPENED IN THE SESSION THAT SHIPPED THE GATE FIX. A branch run
 * failed two `tutorial.spec.ts` axe checks; the very next command was another
 * `test:branch`, and the `error-context.md` naming the violation was gone
 * before anyone read it. Two later runs passed, so the failure was written up
 * as a theory rather than a finding — which is precisely the outcome this
 * whole line of work exists to stop.
 *
 * ⚠️ IT NEVER FAILS THE RUN. A copy that throws is reported and the exit code
 * is whatever Playwright decided; evidence-keeping must not change a verdict.
 * ═════════════════════════════════════════════════════════════════════════
 */
function preserveArtefacts() {
  const from = join(ROOT, 'test-results');
  if (!existsSync(from)) return 0;
  /* A clean run leaves the directory with no failure subdirectories in it. */
  const dirs = readdirSync(from, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (dirs.length === 0) return 0;

  const to = join(LOG_DIR, `branch-${RUN_ID}`);
  try {
    mkdirSync(to, { recursive: true });
    for (const d of dirs) cpSync(join(from, d.name), join(to, d.name), { recursive: true });
  } catch (error) {
    console.error(dim(`  (could not preserve artefacts: ${error.message})`));
    return 0;
  }
  return dirs.length;
}

const BASE = process.env.BRANCH_BASE ?? 'dev';

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

const all = process.argv.includes('--all');

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

/* Committed changes against the base, plus anything still in the working tree
   — a session usually runs this before committing, and testing only what is
   committed would silently skip the edit just made. */
const changed = new Set(
  [
    ...git(['diff', '--name-only', `${BASE}...HEAD`]).split('\n'),
    ...git(['diff', '--name-only', 'HEAD']).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ].filter(Boolean),
);

const specs = all ? [] : specsFor([...changed], ROOT);

console.log(`\n${bold('▸ test:branch')}  ${dim(`— chromium only, branch ${branch} vs ${BASE}`)}`);

if (branch === 'main') {
  console.log(
    yellow(
      '\n  You are on main. Promotion is verified by the `gate` workflow on\n' +
        '  GitHub Actions, which runs the matrix and is the gate of record.\n' +
        '  This command is for feature branches.\n',
    ),
  );
}

if (all) {
  console.log(dim('  --all: every chromium spec, mapping ignored.\n'));
} else if (changed.size === 0) {
  console.log(yellow(`\n  Nothing differs from ${BASE}. Running the smoke net only.\n`));
} else {
  console.log(dim(`  ${changed.size} changed file(s) → ${specs.length} spec file(s):`));
  for (const spec of specs) console.log(dim(`    ${spec}`));
  console.log('');
}

const target = all ? '' : specs.map((s) => `tests/e2e/${s}`).join(' ');

/**
 * ⚠️ AUTH-HEAVY SELECTIONS RUN AT TWO WORKERS, AND THAT IS A RATE LIMIT, NOT A
 * MEMORY LIMIT.
 *
 * Every signed-in spec mints its own account and verifies its own magic link,
 * and `/auth/v1/verify` is rate limited per IP in a short rolling window —
 * measured against the test project at **22 verifications in 7 seconds**, clear
 * again a couple of minutes later. At the default six workers a selection that
 * happens to include several auth files goes over, Supabase serves a bare
 * `{"code":429,"error_code":"over_request_rate_limit"}`, and the browsers park
 * on it: the report then shows plain navigation timeouts on a DIFFERENT set of
 * tests every run, all of which pass when the file is run on its own.
 *
 * ⚠️ THE BACKOFF IN `followMagicLink()` IS THE SECOND LINE, NOT THE FIRST. It
 * recovers a burst; it cannot recover a sustained overload, and every second it
 * spends waiting is a second added to the gate. Not creating the burst is
 * cheaper than surviving it.
 *
 * ⚠️ TWO IS NOT A TUNING KNOB — it is roughly a third of the verification rate
 * six workers produce, which is the difference between green and red. Raising
 * it back reintroduces the whole problem, exactly as `--workers=3` does for
 * memory in `test-release.mjs`. The cost is paid ONLY on branches that touch
 * auth; everything else keeps the full fan-out.
 */
/* ⚠️ ONE LIST, IN `lanes.mjs`. The copy that used to live here was missing
   `booking`, `booking-ui` and `recurring-sessions` — the drift that a second
   copy always produces, and the reason the spec map lives in its own module
   too. */
const AUTH_SPECS = new Set(NEEDS_ACCOUNTS_ON.map((n) => `${n}.spec.ts`));
const authSpecs = all ? AUTH_SPECS.size : specs.filter((s) => AUTH_SPECS.has(s)).length;
const workers = authSpecs > 2 ? ' --workers=2' : '';
if (workers) {
  console.log(
    dim(`  ${authSpecs} auth spec(s) selected → --workers=2 (Supabase verify rate limit)`),
  );
}

/**
 * ⚠️⚠️ THE BRANCH BUILD FOLLOWS THE SELECTION'S SHAPE, AND UNTIL NOW IT DID NOT.
 *
 * The release gate runs accounts-ON, because that is what production serves.
 * This script set no flag, so every branch build was OFF and every spec in
 * `NEEDS_ACCOUNTS_ON` SKIPPED — a session touching the booking UI got no
 * coverage at all until promotion. That is a hole in the DAILY loop, which is
 * where a defect is cheapest to catch.
 *
 * ⚠️ THE COST IS PAID ONLY BY BRANCHES THAT TOUCH ACCOUNT CODE. A selection
 * with none of those specs still builds OFF and is unchanged. One that has them
 * pays a slightly longer build and some of Supabase's per-IP verify quota,
 * which is what `--workers=2` above already exists to survive.
 *
 * ⚠️ AN EXPLICIT `PUBLIC_AUTH_ENABLED` IN THE ENVIRONMENT WINS. Someone
 * deliberately testing the other shape is not overruled by a heuristic.
 */
const offSpecs = all ? NEEDS_ACCOUNTS_OFF.length
  : specs.filter((s) => NEEDS_ACCOUNTS_OFF.includes(s.replace('.spec.ts', ''))).length;
const explicit = process.env['PUBLIC_AUTH_ENABLED'];
const shapeOn = explicit === undefined ? authSpecs > 0 : explicit === 'true';

if (explicit === undefined && shapeOn) {
  console.log(dim(`  ${authSpecs} spec(s) need accounts ON → building with PUBLIC_AUTH_ENABLED=true`));
}
/* ⚠️ ONE RUN CANNOT BE BOTH SHAPES. Said out loud rather than silently
   half-covered: the OFF-only spec skips here, and the release gate's
   accounts-OFF sliver is what proves it. */
if (shapeOn && offSpecs > 0) {
  console.log(
    yellow(
      `  ! the selection also wants the accounts-OFF shape (${NEEDS_ACCOUNTS_OFF.join(', ')}).\n` +
        '    Running ON; those skip. The release gate proves them in its sliver,\n' +
        '    or run them by hand with PUBLIC_AUTH_ENABLED= (empty).',
    ),
  );
}

const command = `npx playwright test --project=chromium${workers} ${target}`.trim();

console.log(dim(`  ${command}\n`));
const result = spawnSync(command, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PUBLIC_AUTH_ENABLED: shapeOn ? 'true' : '' },
});

if (result.status !== 0) {
  console.error(red('\n  ✗ test:branch FAILED.\n'));
  /* ⚠️ THE ARTEFACTS FIRST, BEFORE THE ADVICE. The next thing anybody does
     after a red branch run is run it again — which is what destroys them. */
  const kept = preserveArtefacts();
  console.error(
    '  Fix it here. Do NOT reach for the matrix to see whether it is\n' +
      '  "really" broken — a chromium failure is a failure.\n',
  );
  if (kept > 0) {
    console.error(
      yellow(`  ⚠️ ${kept} failure artefact dir(s) kept — READ THESE BEFORE RE-RUNNING:`) +
        `\n  ${join(LOG_DIR, `branch-${RUN_ID}`)}\n` +
        '  error-context.md there carries the page state at the moment it failed.\n' +
        '  Re-running first is what deleted the last three gates\' evidence.\n',
    );
  }
  process.exit(result.status ?? 1);
}

console.log(green('\n  ✓ test:branch passed — enough to merge to dev.\n'));
console.log(
  dim(
    '  The matrix is NOT run here and is not needed here. It runs once, at\n' +
      '  promotion, as the `gate` workflow on GitHub Actions — that is the\n' +
      '  gate of record, not a local run. It starts on a push to dev or main,\n' +
      '  or on a pull request into either.\n',
  ),
);
