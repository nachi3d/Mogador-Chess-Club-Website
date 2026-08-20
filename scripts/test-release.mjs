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
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ⚠️ THE GATE'S EVIDENCE DOES NOT LIVE UNDER `node_modules/`. IT USED TO, AND
 * THAT IS EXACTLY HOW A SET OF MATRIX LOGS WAS LOST.
 *
 * This was `node_modules/.cache`, which is not a cache in any sense that
 * matters here: it is the only record of which tests failed on a gate that
 * blocks promotion, and it sits inside the one directory every setup routine
 * deletes and rebuilds. `npm ci` removes `node_modules/` outright before
 * installing, so a dependency bump, a corrupted install, or moving the project
 * to another machine silently takes every matrix log and memory trace with it.
 *
 * ⚠️ WHAT THAT COST: the three unadjudicated failures carried over from the
 * previous machine — one webkit in the OFF shape, one webkit and one iphone-13
 * in the ON shape — could not be re-read, because the logs naming them went
 * with that machine's `node_modules/`. They had to be re-run from scratch on
 * the new machine, both shapes, ~4.8 hours, to establish that none of the
 * three reproduced.
 *
 * `gate-logs/` is gitignored but REAL: nothing in the toolchain deletes it, and
 * it survives `npm ci`, a reinstall and a checkout. It is not committed —
 * evidence is per machine and per run, and a log in git is a merge conflict
 * waiting to happen.
 */
const LOG_DIR = join(ROOT, 'gate-logs');

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ EVERY RUN GETS ITS OWN LOG. A SECOND RUN MUST NEVER ERASE THE FIRST'S
 * EVIDENCE — AND IT USED TO.
 *
 * This wrote to a single `matrix.log` and began with `rmSync(LOG)`. That is
 * fine for one run and catastrophic for the gate, which runs TWICE, once per
 * flag shape (see the verification policy in CLAUDE.md): the accounts-ON run
 * deleted the accounts-OFF run's log the moment it started.
 *
 * ⚠️ WHAT THAT COST, ONCE, AT THE v0.17.0 GATE: the OFF matrix came back with
 * FOUR failures — three firefox, one webkit — and by the time anyone looked,
 * the log naming them was gone, along with `test-results/`, which Playwright
 * clears on its next run. Four failures that could not be adjudicated, on a
 * gate that blocks promotion, and the only remedy was to re-run the whole 90
 * minute shape. The summary survived; the evidence did not.
 *
 * ⚠️ THE SHAPE IS IN THE NAME, NOT JUST THE TIMESTAMP. "Which run was this?"
 * is asked months later, from a filename, and `matrix-off-…` answers it where
 * two timestamps do not. The shape is read from the same variable the gate
 * itself branches on, so it cannot disagree with what actually ran.
 *
 * ⚠️ AND THE MEMORY TRACES ARE NAMESPACED THE SAME WAY. They had the identical
 * bug for the identical reason: `freemem-firefox.txt` is per PROJECT, so the
 * second shape's firefox overwrote the first's, and the troughs that decide
 * whether a failure was starvation or real were lost with everything else.
 * ═════════════════════════════════════════════════════════════════════════
 */
const SHAPE = process.env['PUBLIC_AUTH_ENABLED'] === 'true' ? 'on' : 'off';
const STAMP = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace('T', '-')
  .slice(0, 15);
const RUN_ID = `${SHAPE}-${STAMP}`;
const LOG = join(LOG_DIR, `matrix-${RUN_ID}.log`);
const JSON_OUT = join(LOG_DIR, `matrix-${RUN_ID}.json`);

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

/**
 * ⚠️ FREE RAM, SAMPLED PER PROJECT — BECAUSE THE DIAGNOSIS ABOVE IS UNTESTABLE
 * WITHOUT IT.
 *
 * Everything this file says about memory exhaustion rests on ONE hand-sampling
 * (`minimum free RAM 2.08 GB`, in MEASUREMENTS above) taken during a single
 * investigation and never repeated. The failure message at the foot of this
 * script has been telling readers to "check free RAM during the run" ever
 * since — advice nobody could act on, because by the time the summary prints
 * the run is over and the trough is gone.
 *
 * ⚠️ WHAT IT COST: the v0.16.0 accounts-ON gate came back with 9 firefox
 * failures. The memory hypothesis was the leading explanation, it could not be
 * confirmed or ruled out, and a session went on the question with nothing to
 * read. That is the gap this closes — the number is now recorded whether or
 * not anybody suspects it, which is the only version that is there when you
 * need it.
 *
 * ⚠️ IT IS A SEPARATE PROCESS, AND THAT IS FORCED, NOT STYLE. `runPlaywright`
 * uses `spawnSync`, which blocks this script's event loop for the entire
 * project — 10 to 40 minutes. A `setInterval` here would not fire once in that
 * window; it would sample before the run and after it and miss every value
 * that matters. So the sampler is its own node process, polling on its own
 * loop, appending one figure per line to a file the parent reads afterwards.
 *
 * Sampling is deliberately cheap and deliberately dumb: `os.freemem()` every
 * two seconds, no aggregation in the child. A truncated final line from the
 * kill is dropped by the parse rather than guarded against.
 *
 * ⚠️ `os.EOL`, NOT A `\n` LITERAL. This string is source code for another
 * process, so a newline inside it needs a DOUBLE backslash here — and a
 * single-backslash version is still valid JavaScript in this file, produces a
 * real line break inside the child's string literal, and kills the child with
 * a syntax error it has no way to report. The sampler would then simply never
 * write, and `stopMemorySampler` would say "not sampled" forever. Caught in
 * exactly that state while this was being written; `os.EOL` has no escape to
 * get wrong.
 *
 * ⚠️ IT MEASURES THE MACHINE, NOT THE BROWSERS. Anything else running on
 * Seàn's desktop counts against the same figure — which is the right number
 * for "could Firefox allocate", and the wrong one for "how much did Playwright
 * use". Read it as the headroom the run actually had.
 */
const SAMPLER = `
  const fs = require('fs'), os = require('os');
  const out = process.argv[1];
  setInterval(() => {
    try { fs.appendFileSync(out, os.freemem() + os.EOL); } catch {}
  }, 2000);
`;

const GB = (bytes) => (bytes / 1024 ** 3).toFixed(2);

function startMemorySampler(label) {
  /* ⚠️ NAMESPACED BY RUN, not just by project — see the RUN_ID block at the
     top. `freemem-firefox.txt` was overwritten by the second flag shape, which
     is exactly how the troughs that decide "starved or real" went missing. */
  const file = join(LOG_DIR, `freemem-${RUN_ID}-${label}.txt`);
  rmSync(file, { force: true });
  const child = spawn(process.execPath, ['-e', SAMPLER, file], { cwd: ROOT, stdio: 'ignore' });
  child.on('error', () => {}); // a sampler that cannot start must never fail the gate
  return { child, file };
}

/** Stop the sampler and return the trough, or null if it produced nothing. */
function stopMemorySampler(handle) {
  handle.child.kill();
  let samples = [];
  try {
    samples = readFileSync(handle.file, 'utf8')
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    /* No file ⇒ the sampler never started. Reported as absent, never as 0 —
       the same rule as the per-project counts: an unmeasured number and a
       measured zero must not look alike. */
  }
  if (samples.length === 0) return null;
  return { min: Math.min(...samples), max: Math.max(...samples), samples: samples.length };
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

/* ⚠️ NO `rmSync(LOG)` HERE, AND THAT IS THE FIX. The name is unique per run, so
   there is nothing to clear — and clearing anything is precisely what destroyed
   the other shape's evidence. If this line ever comes back, read the RUN_ID
   block above first. */

const started = Date.now();

console.log(
  `\n${bold('▸ test:release')}  ${dim(
    `— the full matrix, ${PROJECTS.length} projects, ${MODE}, ${WORKERS} workers.`,
  )}`,
);
/* The shape is stated rather than implied: the gate runs twice and a log that
   does not say which shape it is cannot be read six weeks later. */
console.log(
  dim(`  Shape: accounts ${SHAPE.toUpperCase()}  ${SHAPE === 'on' ? '(PUBLIC_AUTH_ENABLED=true)' : '(repo default)'}`),
);
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
/** project ⇒ { min, max, samples }, or null where the sampler produced nothing. */
const memory = new Map();
let worstStatus = 0;

if (MODE === 'pooled') {
  const sampler = startMemorySampler('pooled');
  const run = runPlaywright(`--workers=${WORKERS}`, 'pooled');
  memory.set('pooled', stopMemorySampler(sampler));
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
    const sampler = startMemorySampler(project);
    const run = runPlaywright(`--project=${project} --workers=${WORKERS}`, project);
    const trough = stopMemorySampler(sampler);
    memory.set(project, trough);
    appendLog(
      `\n--- free RAM during ${project} ---\n` +
        (trough
          ? `min ${GB(trough.min)} GB, max ${GB(trough.max)} GB, ` +
            `of ${GB(totalmem())} GB total (${trough.samples} samples)\n`
          : 'not sampled\n'),
    );
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
  /**
   * ⚠️ THE TROUGH IS PRINTED BESIDE THE RESULT, NOT IN A SECTION OF ITS OWN.
   * The question it answers is always "was THIS project starved", and a figure
   * three lines away from the failure count does not get read.
   */
  const trough = memory.get(project);
  const ram = trough
    ? dim(`  ${GB(trough.min)} GB free at the trough`)
    : dim('  RAM not sampled');

  const line =
    `${project.padEnd(11)} ${String(entry.passed).padStart(4)} passed` +
    `${entry.failed ? red(`  ${entry.failed} failed`) : ''}` +
    `${entry.flaky ? yellow(`  ${entry.flaky} flaky`) : ''}` +
    `${entry.skipped ? dim(`  ${entry.skipped} skipped`) : ''}` +
    ram;
  console.log(`    ${line}`);

  /**
   * ⚠️ A WARNING, NEVER A FAILURE. The 2.08 GB in MEASUREMENTS is where
   * Firefox's compositor was measured to stop allocating; 3 GB is that with a
   * little room. Crossing it does not mean the run is invalid — it means a
   * bare timeout in this project has a likely cause, and that is a hint for a
   * reader, not a verdict this script is entitled to reach.
   */
  if (trough && trough.min < 3 * 1024 ** 3) {
    console.log(
      `    ${yellow(`  ! ${project} ran with under 3 GB free — see MEASUREMENTS in this script.`)}`,
    );
  }

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
        '  should no longer happen now the projects run one at a time.\n' +
        '\n' +
        '  ⚠️ FREE RAM IS NOW MEASURED, so do not guess at it: the trough is printed\n' +
        '  beside each project above and written to the log per project. Under\n' +
        '  ~2 GB, believe the browser was starved. Comfortably above it, the memory\n' +
        '  explanation is RULED OUT and the failure needs a real diagnosis.\n',
    ),
  );
  process.exit(worstStatus || 1);
}

console.log(green(`\n  ✓ Matrix green — ${passed} passed${flaky ? `, ${flaky} flaky` : ''}, ${minutes} min.\n`));
/* ⚠️ NAMED ON THE GREEN PATH TOO. A promotion records which two runs it rested
   on, and "matrix.log" was never enough to identify either of them. */
console.log(dim(`  accounts ${SHAPE.toUpperCase()} — evidence kept at ${LOG}\n`));
