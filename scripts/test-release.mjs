#!/usr/bin/env node
/**
 * `npm run test:release` — the FULL matrix. Run ONCE, when promoting to main.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS IS THE ONLY PLACE THE MATRIX BELONGS.
 *
 * Five projects — chromium, firefox, webkit, pixel-5, iphone-13. That cost is
 * worth paying once per release and is not worth paying once per session, which
 * is what was happening. Feature branches run `npm run test:branch`.
 *
 * ⚠️ IT WRITES TO A LOG AND CHECKS THE EXIT CODE ITSELF.
 * `npx playwright test | tail -12` reports TAIL's exit code, not Playwright's:
 * a run with 14 failures reads as "196 passed", exit 0. That has already
 * happened on this project. The redirect and the explicit status check below
 * are why this is a script rather than a line in package.json.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHY THE PROJECTS RUN ONE AT A TIME (and the measurements behind it)
 *
 * Playwright shares ONE worker pool across every project, so at the default
 * six workers this machine ran six MIXED browsers at once — chromium and
 * firefox and webkit contexts side by side. Sampled during a run:
 *
 *     peak browser processes  80
 *     peak browser memory     6.68 GB
 *     minimum free RAM        2.08 GB   (of 15.8 GB)
 *
 * At that point Firefox's software compositor cannot allocate: the log fills
 * with `RenderCompositorSWGL failed mapping default framebuffer`, the browser
 * stops answering, and whatever test was in flight dies of a bare timeout.
 * ⚠️ THE FAILURE IS MEMORY EXHAUSTION, NOT A BROWSER BUG AND NOT A TEST BUG —
 * which is why it lands on a different spec every run and why every one of
 * them passes serially.
 *
 * Two consecutive release gates were promoted on that judgement (v0.11.0: 4
 * failures; v0.11.1: 7). ⚠️ A GATE THAT IS EXPECTED TO BE RED IS WORTH
 * NOTHING — it trains the next session to wave failures through, which is
 * exactly how a real regression ships. So the matrix now runs each project on
 * its own, sequentially, with a worker cap. It is slower and it is green.
 *
 * ⚠️ DO NOT "FIX" A RED MATRIX BY RAISING TIMEOUTS. It was tried on
 * `play.spec.ts` and the failure count went UP: a starved browser given longer
 * to answer is still starved, and every test now waits longer to find out.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IT PROVES EVERY PROJECT ACTUALLY RAN. A project that silently runs zero
 * tests is the worst possible pass: the summary says "green" and one fifth of
 * the matrix never happened. Per-project counts are read from Playwright's
 * JSON reporter and checked against each other — see the `── Report ──`
 * section at the foot of this file.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * MEASUREMENTS — the three candidates, and why this one won
 *
 * Measured on Seàn's machine (12 logical cores, 15.8 GB) against the tree at
 * v0.11.1. ⚠️ THESE ARE THE NUMBERS. Re-measure before re-arguing.
 *
 *   A  per-project, 3 workers   5 projects   0 failures   66.8 min   ← SHIPPED
 *   B  firefox fullyParallel:false          NOT MEASURED — see below
 *   C  pooled, 3 workers        3 projects   0 failures   51.7 min
 *
 * ⚠️ A AND C ARE NOT THE SAME ROW. C ran only firefox, webkit and iphone-13 —
 * the three projects that produced every failure in the two red gates — and
 * still cost 51.7 of A's 66.8 minutes. The two it skipped are ~1190 further
 * test executions, and at the same worker count there is no idle capacity for
 * them to absorb, so C over the full five lands ABOVE A. It is not cheaper; it
 * only looks cheaper because it did less.
 *
 * ⚠️ B WAS REJECTED WITHOUT A RUN, DELIBERATELY. `fullyParallel: false` is
 * what webkit and iphone-13 ALREADY carry, and they were two of the three
 * projects failing both red gates. A setting that is already in force on the
 * failing projects cannot be the thing that would have saved them. Measuring
 * it would have bought an hour of confirmation of something the config already
 * states.
 *
 * ⚠️ THE HONEST CAVEAT: C came back green. Both red gates ran at SIX workers,
 * so the worker cap — not the per-project split — is very likely the half that
 * does the work. That is ONE pooled run and not a proof, and the split is kept
 * regardless, because it buys something the cap does not: per-project
 * accounting, which is what catches a project that ran zero tests.
 *
 * Peak load during C (pooled, 3 workers), for comparison with the 6-worker
 * figures above: 59 processes, 5.55 GB, 4.33 GB free at the floor. Roughly
 * half the memory pressure, and it never approached the ~2 GB where the
 * compositor starts failing to allocate.
 *
 * The overrides exist so this table can be rebuilt on another machine, or on
 * this one when the suite has grown again. They are NOT tuning knobs:
 *   MCC_MATRIX_MODE=pooled|per-project   default per-project
 *   MCC_MATRIX_WORKERS=<n>               workers per run; default 3
 * ═════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'node_modules', '.cache');
const LOG = join(LOG_DIR, 'matrix.log');
const JSON_OUT = join(LOG_DIR, 'matrix.json');

/** ⚠️ Must match `projects` in playwright.config.ts. Verified below. */
/**
 * ⚠️ SWEEP BEFORE EVERY PROJECT — ADDED AT v0.16.0, AFTER A ZOMBIE ATE A GATE.
 *
 * `webServer.reuseExistingServer` is true locally, so Playwright serves
 * WHATEVER IS ALREADY LISTENING on 4321 rather than building. That is a
 * feature between projects here — the first run builds and the rest reuse it —
 * and a trap when the listener is not ours.
 *
 * ⚠️ WHAT ACTUALLY HAPPENED: a stray `node` held 4321 while matching NEITHER
 * hand-run probe. Its command line named neither this repo nor `preview`, so a
 * command-line grep missed it, and nobody asked the PORT who owned it. Firefox
 * then "failed" 37 tests at ONE worker — worse than at three, which is
 * impossible for a concurrency problem — because every page it loaded came
 * from the squatter. The diagnosis went to the browser instead of the socket,
 * and a release very nearly shipped on it.
 *
 * ⚠️ THE TWO PROBES CATCH DIFFERENT THINGS AND BOTH MUST RUN: a port walk by
 * PID misses a preview on an unswept port, and a repo-path match misses a
 * process whose command line does not name the repo. The zombie slipped
 * between them because only one of them was ever run here — this gate swept
 * nothing at all before v0.16.0.
 *
 * `scripts/demo.mjs --sweep-only` IS that sweep — the same implementation, not
 * a copy — and it exits non-zero when something survived. A dirty machine is
 * reported and the run continues: the per-project count comparison below is
 * what ultimately catches a project that tested nothing real.
 */
function sweepMachine(label) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'demo.mjs'), '--sweep-only'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  appendLog(`
--- sweep before ${label} ---
${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.status !== 0) {
    console.log(`    ${yellow('! the machine was NOT clean before this project')}`);
  }
}

const PROJECTS = ['chromium', 'firefox', 'webkit', 'pixel-5', 'iphone-13'];

const MODE = process.env['MCC_MATRIX_MODE'] ?? 'per-project';
/**
 * ⚠️ THREE, NOT SIX. Six is Playwright's default here (half of 12 logical
 * cores) and it is the number that exhausted the machine. Three keeps peak
 * browser memory to roughly half, which is what the measurements show is the
 * difference between green and red. Raising it is not a tuning knob — it is
 * the change that reintroduces the whole problem.
 */
const WORKERS = process.env['MCC_MATRIX_WORKERS'] ?? '3';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

mkdirSync(LOG_DIR, { recursive: true });
rmSync(LOG, { force: true });

const started = Date.now();

console.log(`\n${bold('▸ test:release')}  ${dim(`— the full matrix, ${PROJECTS.length} projects, ${MODE}, ${WORKERS} workers.`)}`);
console.log(dim(`  Log: ${LOG}\n`));

/** Append a chunk to the human log, so the whole run is in one file. */
function appendLog(text) {
  const previous = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  writeFileSync(LOG, previous + text);
}

/**
 * Run Playwright once and return its per-project tallies.
 *
 * ⚠️ THE COUNTS COME FROM THE JSON REPORTER, NOT FROM THE SUMMARY LINE. The
 * summary is a total; a total cannot tell you that one project contributed
 * nothing to it. The JSON carries the project name on every test result, which
 * is the only way to prove all five ran.
 */
function runPlaywright(args, label) {
  rmSync(JSON_OUT, { force: true });
  const command =
    `npx playwright test ${args} --reporter=line,json >> "${LOG}" 2>&1`;
  const result = spawnSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_OUT },
  });

  const tally = new Map();
  try {
    const report = JSON.parse(readFileSync(JSON_OUT, 'utf8'));
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const project = test.projectName ?? 'unknown';
          const entry = tally.get(project) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
          const status = test.status ?? 'unknown';
          if (status === 'expected') entry.passed += 1;
          else if (status === 'unexpected') entry.failed += 1;
          else if (status === 'flaky') entry.flaky += 1;
          else if (status === 'skipped') entry.skipped += 1;
          tally.set(project, entry);
        }
      }
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites ?? []) walk(suite);
  } catch {
    /* No parseable JSON — the exit code below is then the only truth, and
       the report below fails on the missing project rather than guessing. */
  }

  return { status: result.status ?? 1, tally, label };
}

/* ── Run ──────────────────────────────────────────────────────────────── */

const totals = new Map();
let worstStatus = 0;

if (MODE === 'pooled') {
  const run = runPlaywright(`--workers=${WORKERS}`, 'pooled');
  worstStatus = run.status;
  for (const [project, entry] of run.tally) totals.set(project, entry);
} else {
  /**
   * ⚠️ ONE PROJECT AT A TIME, AND THE SERVER IS BUILT ONCE.
   *
   * `webServer.reuseExistingServer` is true locally, so the first run builds
   * and serves and the remaining four attach to it. Without that this would be
   * five builds — and, worse, five chances to test a different artefact from
   * the one the first project saw.
   *
   * ⚠️ It also means the preview server outlives the first run, so the sweep
   * at the end is not tidiness. See CLAUDE.md → dev environment.
   */
  for (const project of PROJECTS) {
    const banner = `\n########## ${project} ##########\n`;
    appendLog(banner);
    console.log(bold(`\n  ▸ ${project}`));
    sweepMachine(project);
    const run = runPlaywright(`--project=${project} --workers=${WORKERS}`, project);
    if (run.status !== 0) worstStatus = run.status;
    for (const [name, entry] of run.tally) {
      const previous = totals.get(name) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      totals.set(name, {
        passed: previous.passed + entry.passed,
        failed: previous.failed + entry.failed,
        flaky: previous.flaky + entry.flaky,
        skipped: previous.skipped + entry.skipped,
      });
    }
  }
}

/* ── Report ───────────────────────────────────────────────────────────── */

const minutes = ((Date.now() - started) / 60_000).toFixed(1);
const problems = [];

console.log(`\n${bold('  Per project')}`);
for (const project of PROJECTS) {
  const entry = totals.get(project);
  if (!entry) {
    console.log(`    ${red(project.padEnd(11))} NO RESULTS AT ALL`);
    problems.push(`${project} produced no results — it did not run.`);
    continue;
  }
  const ran = entry.passed + entry.failed + entry.flaky;
  const line =
    `${project.padEnd(11)} ${String(entry.passed).padStart(4)} passed` +
    `${entry.failed ? red(`  ${entry.failed} failed`) : ''}` +
    `${entry.flaky ? yellow(`  ${entry.flaky} flaky`) : ''}` +
    `${entry.skipped ? dim(`  ${entry.skipped} skipped`) : ''}`;
  console.log(`    ${line}`);

  /**
   * ⚠️ THE ZERO-TEST CHECK. A project that ran nothing is not a pass, and the
   * old "is the total a multiple of five" heuristic could not see it: five
   * projects contributing 0, 0, 0, 0 and N still divides by nothing useful,
   * and a project silently dropped from the config divides perfectly.
   */
  if (ran === 0) problems.push(`${project} ran ZERO tests — a silent hole in the matrix.`);
}

/**
 * ⚠️ THE ARITHMETIC CHECK, KEPT AND MADE STRONGER.
 *
 * It used to be "the total must be a multiple of 5". That was a proxy for
 * "every project ran the same specs", and a weak one — it passes on 4 projects
 * of 100 and one of 0 only by coincidence, and fails on a legitimately skipped
 * spec. Comparing the projects to EACH OTHER is the thing that proxy was
 * reaching for, and it names the odd one out instead of asking you to go and
 * read the log.
 */
const executed = PROJECTS.map((p) => {
  const e = totals.get(p);
  return { project: p, ran: e ? e.passed + e.failed + e.flaky + e.skipped : 0 };
});
const expected = Math.max(...executed.map((e) => e.ran));
const odd = executed.filter((e) => e.ran !== expected);
if (expected > 0 && odd.length > 0) {
  problems.push(
    `projects disagree on how many tests exist: expected ${expected}, but ` +
      odd.map((e) => `${e.project} saw ${e.ran}`).join(', '),
  );
}

const passed = [...totals.values()].reduce((n, e) => n + e.passed, 0);
const failed = [...totals.values()].reduce((n, e) => n + e.failed, 0);
const flaky = [...totals.values()].reduce((n, e) => n + e.flaky, 0);

console.log(
  `\n  ${bold('Total')}  ${passed} passed` +
    `${failed ? red(`, ${failed} failed`) : ''}` +
    `${flaky ? yellow(`, ${flaky} flaky`) : ''}` +
    `  ${dim(`in ${minutes} min`)}`,
);

if (problems.length > 0) {
  console.error(red('\n  ✗ THE MATRIX DID NOT RUN AS EXPECTED:'));
  for (const problem of problems) console.error(red(`      ${problem}`));
  console.error(dim(`\n  Read ${LOG} before believing any summary above.\n`));
  process.exit(1);
}

if (worstStatus !== 0 || failed > 0) {
  console.error(red(`\n  ✗ MATRIX FAILED — ${failed} failure(s). Promotion is blocked.\n`));
  console.error(
    dim(
      '  A genuine failure is deterministic and fails a SERIAL re-run too, and it\n' +
        '  fails with an assertion naming a value. Bare timeouts and\n' +
        '  `browserContext.close` protocol errors are a starved browser — but that\n' +
        '  should no longer happen now the projects run one at a time. If it does,\n' +
        '  check free RAM during the run before touching application code.\n',
    ),
  );
  process.exit(worstStatus || 1);
}

console.log(green(`\n  ✓ Matrix green — ${passed} passed${flaky ? `, ${flaky} flaky` : ''}, ${minutes} min.\n`));
