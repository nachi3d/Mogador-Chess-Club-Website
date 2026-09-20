#!/usr/bin/env node
/**
 * `npm run test:release` — the WHOLE matrix, locally, in one command.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ THIS IS NO LONGER THE GATE OF RECORD — THE `gate` WORKFLOW ON GITHUB
 * ACTIONS IS, SINCE v0.24.0. Smart App Control blocked WebKit on this machine
 * twice, and both releases shipped on transferred evidence; a Linux runner has
 * no such policy. A promotion rests on `.github/workflows/gate.yml`.
 *
 * ⚠️ THIS SCRIPT IS STILL CORRECT AND STILL MAINTAINED. It is the right thing
 * for a developer who wants the matrix on their own machine — it is simply not
 * what a promotion is allowed to rest on any more.
 *
 * ⚠️ IT SERIALISES THE FIVE PROJECTS FOR MEMORY, and that is why CI can run
 * them in parallel without contradicting it: each runner has its own RAM.
 * ⚠️ THE SERIALISATION ALSO GAVE THE SHARED TEST SUPABASE PROJECT ONE RUN AT A
 * TIME — never the reason, never written down, and load-bearing anyway. See
 * `docs/reference/testing.md` before parallelising anything that runs the suite.
 *
 * Chromium over the WHOLE suite, then four LANES on the other four projects,
 * then a two-minute accounts-OFF sliver. One flag shape. Feature branches run
 * `npm run test:branch`.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ IT USED TO BE FIVE PROJECTS × EVERY SPEC × BOTH FLAG SHAPES, AND THAT WAS
 * MEASURED AT 4.8 HOURS FOR A STATIC TEACHING SITE.
 *
 * The gate audit (`docs/reference/testing.md`) found three things:
 *
 *   - 29 of the 41 spec files run IDENTICALLY in both flag shapes, proved by
 *     run/skip status — so the second matrix re-ran ~3,000 tests that could
 *     not answer anything new;
 *   - four spec files never open a browser at all, yet spawned 255 browser
 *     contexts per release between them;
 *   - chromium runs the whole suite in 7.1 minutes and proves every spec once.
 *
 * ⚠️ WHAT WAS KEPT IS WHAT HAS ACTUALLY CAUGHT DEFECTS. Each lane is pinned to
 * the engine that found a real, user-facing bug — WebKit's "Créer" click
 * synthesis, Gecko's agenda axe violation, the iPhone tap-versus-bar collision.
 * The lanes and the reasoning live in `scripts/lanes.mjs`; do not re-derive
 * them here.
 *
 * ⚠️ THE COST NOW: measured GREEN end to end at 21.9 min, 1,277 passed, on a
 * machine whose troughs were 0.51-2.03 GB free — i.e. the bad case, not the
 * good one. Do not let it drift back by adding specs to lanes without a named
 * reason.
 * ═════════════════════════════════════════════════════════════════════════
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
 * tests is the worst possible pass: the summary says "green" and a whole lane
 * never happened. Per-project counts are read from Playwright's JSON reporter,
 * and under the lanes the check is "nobody ran ZERO, and chromium — the
 * superset — is never the smaller run", because a mistyped lane matches
 * nothing. See the `── Report ──` section at the foot of this file.
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
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  cpSync,
} from 'node:fs';
import { totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OFF_SLIVER, missingLaneSpecs } from './lanes.mjs';

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

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ KEEP THE FAILURE ARTEFACTS. THE GATE USED TO DESTROY THE ONE THING IT
 * TELLS YOU TO READ.
 *
 * Playwright clears `test-results/` at the START of every run, and this gate
 * runs six times (five projects plus the sliver). So by the time it finished,
 * only the LAST run's artefacts existed — measured at the v0.20.0 gate, which
 * ended with `test-results/` holding **0 entries** after four flaky tests
 * across firefox and webkit.
 *
 * ⚠️ THAT DIRECTLY DEFEATS THE PROJECT'S OWN RULE. CLAUDE.md says "THE
 * DISCRIMINATOR IS THE FAILURE ARTEFACT, NOT THE RE-RUN" — established after
 * `error-context.md` was what finally separated a real hydration race from
 * machine contention, three gates late. The gate made that impossible to
 * follow for every project but one, and THREE CONSECUTIVE GATES then ended in
 * "probably environmental" with nothing left to check.
 *
 * ⚠️ `preserveOutput` ALONE IS NOT THE FIX, and it is the obvious one. It
 * governs whether Playwright keeps output for PASSING tests; it does not stop
 * the next run clearing the directory, and six runs share one directory. The
 * artefacts have to LEAVE `test-results/` between runs, which is what this
 * does.
 *
 * ⚠️ VERIFIED, NOT ASSUMED, that the sweep is not also eating them: the
 * backlog row warned that `demo.mjs --sweep-only` runs between projects and
 * might remove an artefact directory. It does not — it kills processes and
 * touches no files. Checked before relying on it, because a copy into a
 * directory that the next sweep deletes would be no better than what it
 * replaced.
 *
 * Namespaced by RUN_ID exactly like the logs and the memory traces, for the
 * identical reason: a second run must never erase the first's evidence, and
 * "which run was this?" is asked months later from a filename.
 * ═════════════════════════════════════════════════════════════════════════
 */
function preserveArtefacts(label) {
  const from = join(ROOT, 'test-results');
  if (!existsSync(from)) return 0;

  /* Playwright leaves the directory in place with only a `.last-run.json` in
     it after a clean run. Copying that is noise; the point is failures. */
  const entries = readdirSync(from, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (entries.length === 0) return 0;

  const to = join(LOG_DIR, `artefacts-${RUN_ID}`, label);
  try {
    mkdirSync(to, { recursive: true });
    for (const e of entries) cpSync(join(from, e.name), join(to, e.name), { recursive: true });
  } catch (error) {
    /* ⚠️ NEVER FAIL THE GATE OVER EVIDENCE-KEEPING. A copy that throws — a
       locked file, a full disk — must not turn a green matrix red or mask a
       real result. It is reported and the run continues. */
    appendLog(`\n--- could not preserve ${label} artefacts: ${error.message} ---\n`);
    return 0;
  }

  appendLog(`\n--- kept ${entries.length} artefact dir(s) for ${label} -> ${to} ---\n`);
  return entries.length;
}

/** Per-project artefact counts, so the summary can point at real evidence. */
const artefacts = new Map();

/**
 * ⚠️⚠️ NAMED IN THE SUMMARY, ON BOTH PATHS, AND THE FAILURE PATH IS THE ONE
 * THAT MATTERS.
 *
 * The artefacts exist to be READ at the moment a failing or flaky row is being
 * adjudicated — which is right here, minutes after the run, by whoever is
 * deciding whether to promote. A directory nobody is told about is only
 * marginally better than one that was deleted: three consecutive gates were
 * waved through as "probably environmental" while the evidence would have sat
 * unread anyway.
 *
 * ⚠️ THE FIRST VERSION OF THIS PRINTED ONLY ON THE GREEN PATH, which is
 * exactly backwards — the gate exits before it when something fails, so the
 * pointer was missing precisely when it was needed. Caught by running the real
 * script against a deliberate failure rather than by reading it.
 */
function reportArtefacts() {
  const keptTotal = [...artefacts.values()].reduce((a, b) => a + b, 0);
  if (keptTotal === 0) {
    console.log(dim('  no failure artefacts — nothing failed or retried.\n'));
    return;
  }
  const per = [...artefacts]
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${name} ${n}`)
    .join(', ');
  console.log(dim(`  ${keptTotal} failure artefact dir(s) kept — ${per}`));
  console.log(dim(`  ${join(LOG_DIR, `artefacts-${RUN_ID}`)}`));
  console.log(
    yellow('  ⚠️ Read error-context.md there BEFORE calling a row environmental.\n'),
  );
}

const PROJECTS = ['chromium', 'firefox', 'webkit', 'pixel-5', 'iphone-13'];

/** The OFF-shape run is reported beside the projects, never mixed into one. */
const SLIVER_LABEL = 'chromium (OFF)';

/* ⚠️ PREFLIGHT, AND IT REFUSES. A lane naming a spec that does not exist makes
   `testMatch` match nothing, so the project runs zero tests and the gate goes
   green having proved less than it claims. Checked before a single browser
   starts, because finding it 20 minutes in is finding it too late. */
const missing = missingLaneSpecs(ROOT);
if (missing.length > 0) {
  console.error(red('\n  ✗ scripts/lanes.mjs names spec files that do not exist:'));
  for (const m of missing) console.error(red(`      ${m.project}: ${m.name}.spec.ts`));
  console.error(dim('\n  Fix the names — a lane that matches nothing runs nothing.\n'));
  process.exit(1);
}

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
    `— chromium over the whole suite + ${PROJECTS.length - 1} lanes, ` +
      `${MODE}, ${WORKERS} workers.`,
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
function runPlaywright(args, label, envOverride = {}) {
  rmSync(JSON_OUT, { force: true });
  const command =
    `npx playwright test ${args} --reporter=line,json >> "${LOG}" 2>&1`;
  const result = spawnSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    /* ⚠️ MCC_ARTEFACTS_HANDLED tells `preserve-artefacts.ts` to stand down:
       this script keeps the artefacts itself, labelled by shape and project.
       Today the `--reporter=` above already means the config's reporters do not
       load at all, so this is belt and braces — and it is the belt that keeps
       working if that flag is ever dropped. */
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_OUT,
      MCC_ARTEFACTS_HANDLED: '1',
      ...envOverride,
    },
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
    /* ⚠️ IMMEDIATELY, AND BEFORE THE NEXT PROJECT RUNS. The next
       `runPlaywright` clears `test-results/` as it starts; anything still in
       there at that moment is gone. This is the whole fix. */
    artefacts.set(project, preserveArtefacts(project));
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

/* ── The accounts-OFF sliver ──────────────────────────────────────────── */

/**
 * ⚠️ TWO SPECS THAT ONLY AN ACCOUNTS-OFF BUILD CAN PROVE — AND IT IS NOT A
 * SECOND MATRIX.
 *
 * The gate used to run the entire matrix twice, once per flag shape, at a
 * measured 4.8 hours. 29 of the 41 spec files run IDENTICALLY in both shapes,
 * so almost all of that second run could not answer anything new. What the OFF
 * shape uniquely proves is small and exact: `auth-disabled.spec.ts` (Critical
 * Feature 18 — no route emitted, no Supabase ref anywhere in the bundle) and
 * `admin.spec.ts`'s "the admin surfaces are NOT BUILT" describe.
 *
 * ⚠️ THE SECOND BUILD IS IRREDUCIBLE, and it is the whole cost here: these are
 * claims about the ARTEFACT the other shape produces, and you cannot inspect a
 * build you did not make. The tests themselves take seconds.
 *
 * ⚠️ THE SWEEP BEFORE IT IS LOAD-BEARING, not tidiness. The ON preview server
 * is still listening on 4321 and `reuseExistingServer` is true, so without the
 * sweep Playwright would attach to it and run the OFF specs against the ON
 * build — which would fail confusingly, or worse, pass.
 */
if (SHAPE === 'on' && process.env['MCC_SKIP_OFF_SLIVER'] !== 'true') {
  const banner = `\n########## accounts-OFF sliver ##########\n`;
  appendLog(banner);
  console.log(bold(`\n  ▸ accounts-OFF sliver`) + dim('  — the shape this run cannot prove'));
  sweepMachine('accounts-OFF sliver');
  const files = OFF_SLIVER.map((n) => `tests/e2e/${n}.spec.ts`).join(' ');
  const run = runPlaywright(
    `--project=chromium --workers=${WORKERS} ${files}`,
    'off-sliver',
    /* ⚠️ EMPTY, NOT DELETED — `playwright.config.ts` reads it with `?? ''` and
       passes it to the build, so an empty string IS the OFF shape. */
    { PUBLIC_AUTH_ENABLED: '' },
  );
  /* The sliver is last, so nothing would clear its artefacts — but it is kept
     for the same reason anyway: evidence that lives somewhere other than the
     rest of the evidence is the one nobody finds. */
  artefacts.set(SLIVER_LABEL, preserveArtefacts('off-sliver'));
  if (run.status !== 0) worstStatus = run.status;
  const entry = run.tally.get('chromium') ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  totals.set(SLIVER_LABEL, entry);
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
 * ⚠️ THE SLIVER IS REPORTED ON ITS OWN LINE, NEVER FOLDED INTO CHROMIUM'S.
 *
 * It is a different BUILD of the site, and a summary that adds the two together
 * would make "chromium" mean two artefacts at once — which is precisely the
 * confusion the shape suffix in the log filename exists to prevent.
 */
const sliver = totals.get(SLIVER_LABEL);
if (sliver) {
  const ran = sliver.passed + sliver.failed + sliver.flaky + sliver.skipped;
  console.log(
    `    ${SLIVER_LABEL.padEnd(18)} ${String(sliver.passed).padStart(4)} passed` +
      `${sliver.failed ? red(`, ${sliver.failed} failed`) : ''}` +
      `${sliver.skipped ? dim(`, ${sliver.skipped} skipped`) : ''}` +
      `  ${dim(`(${ran} run — Critical Feature 18)`)}`,
  );
  if (ran === 0) {
    problems.push(
      'the accounts-OFF sliver ran ZERO tests — Critical Feature 18 is UNPROVEN ' +
        'by this gate. It is the one thing the ON shape structurally cannot show.',
    );
  }
} else if (SHAPE === 'on' && process.env['MCC_SKIP_OFF_SLIVER'] !== 'true') {
  problems.push('the accounts-OFF sliver did not run at all — Critical Feature 18 is unproven.');
}

/**
 * ⚠️ THE ARITHMETIC CHECK, REWRITTEN FOR THE LANES.
 *
 * It used to compare the projects to EACH OTHER — "they must all have run the
 * same number of tests" — which was the right check while every project ran
 * every spec. Under the lanes that premise is gone: chromium runs the whole
 * suite and each lane runs a named subset, so disagreement is now the DESIGN
 * rather than the symptom.
 *
 * ⚠️ WHAT REPLACES IT IS AIMED AT THE FAILURE THE LANES INTRODUCED. A misspelt
 * `testMatch` entry matches nothing, the project runs zero tests, and the gate
 * goes green having proved less than it claims. So: every project must have run
 * something, and chromium — the superset — must have run at least as much as
 * any lane. `missingLaneSpecs()` catches the same mistake earlier and by name;
 * this catches it if it ever arrives another way.
 */
const executed = PROJECTS.map((p) => {
  const e = totals.get(p);
  return { project: p, ran: e ? e.passed + e.failed + e.flaky + e.skipped : 0 };
});
const empty = executed.filter((e) => e.ran === 0);
if (empty.length > 0) {
  problems.push(
    `${empty.map((e) => e.project).join(', ')} ran ZERO tests — a lane matched ` +
      'nothing. Check the names in scripts/lanes.mjs against tests/e2e/.',
  );
}
const backbone = executed.find((e) => e.project === 'chromium')?.ran ?? 0;
const bigger = executed.filter((e) => e.project !== 'chromium' && e.ran > backbone);
if (bigger.length > 0) {
  problems.push(
    `chromium ran ${backbone} tests but ` +
      bigger.map((e) => `${e.project} ran ${e.ran}`).join(', ') +
      ' — chromium is the superset and cannot be the smaller run.',
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
  console.log(dim(`  accounts ${SHAPE.toUpperCase()} — evidence kept at ${LOG}`));
  /* ⚠️ ON THE FAILURE PATH FIRST. This is the branch where somebody is about
     to decide whether a row is real, and the artefacts are the thing that
     answers it. See the note on the function. */
  reportArtefacts();
  process.exit(worstStatus || 1);
}

console.log(green(`\n  ✓ Matrix green — ${passed} passed${flaky ? `, ${flaky} flaky` : ''}, ${minutes} min.\n`));
/* ⚠️ NAMED ON THE GREEN PATH TOO. A promotion records which two runs it rested
   on, and "matrix.log" was never enough to identify either of them. */
console.log(dim(`  accounts ${SHAPE.toUpperCase()} — evidence kept at ${LOG}`));

reportArtefacts();
