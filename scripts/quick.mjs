/**
 * Mogador Chess Club — the QUICK CHANGE gate.
 *
 *   npm run quick
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR. Fixing a typo used to cost the full release gate: the
 * whole matrix, five browser projects, half an hour. That is not caution, it
 * is a tax that discourages fixing small things — and unfixed small things are
 * what a visitor actually sees.
 *
 * So: a shorter verification for a SMALL, ENUMERATED set of changes. It
 * shortens VERIFICATION only. It does not shorten the promotion rule —
 * `dev` → `main` still needs Seàn's explicit approval, exactly as before.
 *
 * ⚠️ THIS SCRIPT REFUSES, IT DOES NOT ADVISE. The list of what may not take
 * the fast path is enforced here rather than written in a document nobody
 * re-reads under time pressure. If a changed file is out of bounds the script
 * exits non-zero and names it. That is the whole point: the moment a "quick"
 * change turns out to touch the board, the validator, auth, routing, the
 * service worker or the build, it stops being a quick change while it is
 * still cheap to find that out.
 *
 * ⚠️ AND IF ANY STEP FAILS: revert, open a normal branch, run the full gate.
 * NO FIXING FORWARD ON THE FAST PATH. A quick change that needed debugging was
 * never a quick change, and the second attempt is exactly where the fast path
 * would start hiding real breakage.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { specsFor } from './spec-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env['QUICK_BASE'] ?? 'dev';

const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;
const yellow = (s) => `\u001b[33m${s}\u001b[0m`;
const bold = (s) => `\u001b[1m${s}\u001b[0m`;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** Every file this branch touches: committed since `dev`, plus uncommitted. */
function changedFiles() {
  let base;
  try {
    base = git('merge-base', 'HEAD', BASE);
  } catch {
    console.error(red(`\n  Cannot find a merge base with "${BASE}".`));
    console.error('  A quick change branches off dev. Set QUICK_BASE to override.\n');
    process.exit(1);
  }
  const committed = git('diff', '--name-only', base, 'HEAD');
  const working = git('status', '--porcelain');
  const files = new Set();
  for (const line of committed.split('\n')) if (line.trim()) files.add(line.trim());
  for (const line of working.split('\n')) {
    const path = line.slice(3).trim();
    if (path) files.add(path.replace(/^"|"$/g, ''));
  }
  return [...files].sort();
}

/**
 * ⚠️ THE EXCLUSION LIST. Anything matching takes the NORMAL path.
 *
 * It mirrors "What NEVER qualifies" in CLAUDE.md, and each entry is a Critical
 * Feature, a thing with its own dedicated spec suite, or a thing whose blast
 * radius is the whole site. `reason` is printed, because "no" without "why"
 * gets worked around.
 */
const FORBIDDEN = [
  [/^src\/components\/board\//, 'the board island — one component, every mode depends on it'],
  [/^src\/lib\/chess\//, 'chess logic and the exercise validator'],
  [/^src\/lib\/engine\//, 'the Stockfish worker'],
  [/^src\/lib\/(supabase|auth-flag)\./, 'auth'],
  [/^src\/config\/auth\./, 'the account flag — OFF means NOT BUILT'],
  [/^src\/pages\//, 'a route (new routes never qualify)'],
  [/^src\/content\.config\.ts$/, 'the content schema'],
  [/^src\/i18n\/paths\./, 'i18n routing — the switcher must never lose its counterpart'],
  [/^src\/layouts\//, 'the page shell, including the anti-FOUC theme script'],
  [/^scripts\/build-sw\./, 'the service worker'],
  [/^scripts\/(build-|check-|quick)/, 'the build and its gates'],
  /* ⚠️ WHAT THE GATE RUNS IS NOT A QUICK CHANGE, AND THE LANES MADE THIS
     REACHABLE. Removing one name from `lanes.mjs` is a one-line edit that
     looks like a tidy-up and silently deletes a browser's worth of coverage —
     the fast path must never be able to shorten the gate that polices it. */
  [/^scripts\/(lanes|test-release|test-branch|spec-map)\./, 'what the release gate runs'],
  [/^(astro|playwright|tsconfig|wrangler|postcss)\./, 'build configuration'],
  [/^package(-lock)?\.json$/, 'dependencies'],
  [/^supabase\//, 'the database'],
  [/^vendor\//, 'vendored third-party assets'],
];

/* ⚠️ THE SPEC MAPPING MOVED TO scripts/spec-map.mjs.
   This script and `test-branch.mjs` both need "what covers what moved", and
   they answered it with identical copies until it was extracted — the same
   drift that produced three `.chip` definitions. One mapping, two readers. */

/**
 * ⚠️ ONE COMMAND STRING, NOT `(command, argsArray, { shell: true })`.
 *
 * Node warns (DEP0190) that an args array alongside `shell: true` is
 * concatenated without escaping — a real footgun, and it printed on every run.
 * `shell: true` itself is not optional here: `npm` and `npx` are `.cmd` shims
 * on Windows and do not spawn directly. Every string passed in below is a
 * literal from this file, so there is nothing to escape.
 */
function run(label, command) {
  process.stdout.write(`\n${bold(`▸ ${label}`)}\n`);
  const result = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(red(`\n  ✗ ${label} FAILED.\n`));
    console.error(
      '  A quick change that breaks anything stops being a quick change.\n' +
        '  Revert it, open a normal branch, and run the full gate. Do NOT fix\n' +
        '  forward on the fast path.\n',
    );
    process.exit(1);
  }
}

/* ── 1. Is this eligible at all? ──────────────────────────────────────────── */

const files = changedFiles().filter((f) => !f.startsWith('dist/'));

if (files.length === 0) {
  console.error(yellow('\n  Nothing has changed against ' + BASE + '. Nothing to verify.\n'));
  process.exit(1);
}

console.log(bold('\n  Quick change — files touched\n'));
for (const file of files) console.log(`    ${file}`);

const blocked = [];
for (const file of files) {
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(file)) blocked.push([file, reason]);
  }
}

if (blocked.length > 0) {
  console.error(red('\n  ✗ THIS IS NOT A QUICK CHANGE.\n'));
  for (const [file, reason] of blocked) console.error(`    ${file}\n      → ${reason}`);
  console.error(
    '\n  Take the normal path: a `claude/<feature>` branch and the full gate.\n' +
      '  See CLAUDE.md → Quick change. The list is not advisory.\n',
  );
  process.exit(1);
}

/* ── 2. The gates ─────────────────────────────────────────────────────────── */

// Content first: it is the fastest thing that can be wrong about a new entry,
// and it fails in under a second rather than after a full type-check.
run('content is legal chess', 'node scripts/check-content.mjs');

// `npm run build` runs the CLAUDE.md size guard and check-contrast as its FIRST
// two steps, then astro check, then the build, then the service worker. Both
// checks are therefore covered here rather than being run twice.
run('build (CLAUDE.md size → contrast → types → build → service worker)', 'npm run build');

/* ── 3. The specs that cover what moved ───────────────────────────────────── */

const present = specsFor(files, ROOT);

console.log(
  yellow(`\n  Chromium only, ${present.length} spec file(s) — NOT the matrix.`) +
    '\n  ' +
    present.join(', ') +
    '\n  The matrix runs ONCE, at promotion, via `npm run test:release`.\n',
);

run(
  'chromium specs',
  `npx playwright test --project=chromium ${present.map((s) => `tests/e2e/${s}`).join(' ')}`,
);

console.log(green('\n  ✓ Quick change verified.\n'));
console.log(
  '  Next: merge to dev with --no-ff and add a CHANGELOG entry under Unreleased.\n' +
    '  Promotion to main still needs Seàn. Patch bumps (0.x.Y) are batched —\n' +
    '  several quick changes can share one release.\n',
);
