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
 * question is asked ONCE, at promotion to main, by `npm run test:release`.
 * Asking it on every branch does not make the answer truer — it just moves the
 * cost from one run per release to one run per session.
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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { specsFor } from './spec-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
      '\n  You are on main. Promotion is verified by `npm run test:release`,\n' +
        '  which runs the matrix. This command is for feature branches.\n',
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
const command = `npx playwright test --project=chromium ${target}`.trim();

console.log(dim(`  ${command}\n`));
const result = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });

if (result.status !== 0) {
  console.error(red('\n  ✗ test:branch FAILED.\n'));
  console.error(
    '  Fix it here. Do NOT reach for the matrix to see whether it is\n' +
      '  "really" broken — a chromium failure is a failure.\n',
  );
  process.exit(result.status ?? 1);
}

console.log(green('\n  ✓ test:branch passed — enough to merge to dev.\n'));
console.log(
  dim(
    '  The matrix is NOT run here and is not needed here. It runs once, at\n' +
      '  promotion, via `npm run test:release`.\n',
  ),
);
