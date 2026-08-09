#!/usr/bin/env node
/**
 * `npm run test:release` — the FULL matrix. Run ONCE, when promoting to main.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS IS THE ONLY PLACE THE MATRIX BELONGS.
 *
 * Five projects — chromium, firefox, webkit, pixel-5, iphone-13 — and 30-45
 * minutes. That cost is worth paying once per release and is not worth paying
 * once per session, which is what was happening. Feature branches run
 * `npm run test:branch`.
 *
 * ⚠️ IT WRITES TO A LOG AND CHECKS THE EXIT CODE ITSELF.
 * `npx playwright test | tail -12` reports TAIL's exit code, not Playwright's:
 * a run with 14 failures reads as "196 passed", exit 0. That has already
 * happened on this project. The redirect and the explicit status check below
 * are why this is a script rather than a line in package.json.
 *
 * ⚠️ IT PRINTS THE ARITHMETIC. The matrix is 5 projects, so the total must be
 * 5 × the per-project count. A passed count that is not the full total means
 * specs failed or never ran, and the summary line alone will not say so.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On the known Windows flakes — a WebKit "browser has been closed", a Firefox
 * compositor death, or `auth.spec.ts` `fetch failed` — re-run that ONE project
 * with `--workers=1` before touching application code. A genuine failure is
 * deterministic and fails serially too. CLAUDE.md → Testing has the detail.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'node_modules', '.cache');
const LOG = join(LOG_DIR, 'matrix.log');

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n${bold('▸ test:release')}  ${dim('— the full matrix, 5 projects. Expect 30-45 minutes.')}`);
console.log(dim(`  Log: ${LOG}\n`));

const result = spawnSync(`npx playwright test --reporter=line > "${LOG}" 2>&1`, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});

let log = '';
try {
  log = readFileSync(LOG, 'utf8');
} catch {
  /* The run died before writing anything; the exit code below is the truth. */
}

const tail = log.split('\n').filter((line) => /\d+ (passed|failed|flaky|skipped)/.test(line));
for (const line of tail) console.log(`  ${line.trim()}`);

const passed = Number(/(\d+) passed/.exec(log)?.[1] ?? 0);
const failed = Number(/(\d+) failed/.exec(log)?.[1] ?? 0);
const flaky = Number(/(\d+) flaky/.exec(log)?.[1] ?? 0);

if (passed > 0 && passed % 5 !== 0) {
  console.log(
    yellow(
      `\n  ⚠ ${passed} passed is not a multiple of 5. The matrix is 5 projects,\n` +
        '    so a total that does not divide evenly means specs failed or never\n' +
        '    ran on some project. Read the log before believing the summary.',
    ),
  );
}

if (result.status !== 0 || failed > 0) {
  console.error(red(`\n  ✗ MATRIX FAILED — ${failed} failure(s). Promotion is blocked.\n`));
  console.error(
    dim(
      '  Before changing code: if the failures are confined to one project and\n' +
        '  look like the documented Windows flakes, re-run that project with\n' +
        '  --workers=1. A real failure is deterministic and fails serially too.\n',
    ),
  );
  process.exit(result.status || 1);
}

console.log(green(`\n  ✓ Matrix green — ${passed} passed${flaky ? `, ${flaky} flaky` : ''}.\n`));
