/**
 * A reporter that keeps failure artefacts, whatever started the run.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ THIS EXISTS BECAUSE PRESERVATION USED TO LIVE IN THE WRAPPERS, AND THE
 * GATE DOES NOT USE THE WRAPPERS.
 *
 * `test-branch.mjs` and `test-release.mjs` each copy `test-results/` into
 * `gate-logs/` when their run goes red. That covers the two commands a session
 * is *told* to use — and covers nothing at all when Playwright is invoked
 * directly, which is exactly what `.github/workflows/gate.yml` does
 * (`npx playwright test --project=…`) and exactly what anybody debugging a
 * single spec does.
 *
 * ⚠️ PLAYWRIGHT CLEARS `test-results/` AT THE START OF EVERY RUN. So on the
 * direct path the evidence survives only until the next invocation, and the
 * first instinct after a red run is to run it again. That is not hypothetical:
 * it destroyed the diagnosis of gate run #5 twice in one session, by the same
 * person who had just built the wrapper-side preservation.
 *
 * A reporter is the right home because it cannot be bypassed by how the run was
 * started — it is part of the run.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ONE MECHANISM PER RUN, NOT TWO. The wrappers label their copies by shape
 * and project and are better at it, so they set `MCC_ARTEFACTS_HANDLED=1` and
 * this stands down. Without that handshake every wrapper run would copy the
 * same directories twice under two different names — the "consolidate, never
 * add another" rule applies to evidence-keeping as much as to CSS.
 *
 * ⚠️⚠️ A `--reporter=` ON THE COMMAND LINE REPLACES THE CONFIG'S REPORTERS
 * ENTIRELY, so `npx playwright test --reporter=line` silently runs without this
 * and keeps nothing. Found by watching it fail, not by reading the docs. If you
 * are debugging a spec and want the artefacts kept, do not pass `--reporter`.
 * `test-release.mjs` passes one, which is why it still needs its own copy.
 *
 * ⚠️ IT MUST NEVER FAIL A RUN. Every path is caught and reported. A locked file
 * or a full disk turning a green suite red — or masking a real failure — would
 * be a worse bug than the one this fixes.
 */
import type { Reporter, FullConfig, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * ⚠️ `config.rootDir` IS THE TEST ROOT, NOT THE REPO ROOT — it is `tests/e2e`
 * here, and the first version of this reporter cheerfully created
 * `tests/e2e/gate-logs/`. Walk up to the directory that owns package.json
 * instead of assuming either one.
 */
function repoRootFrom(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

class PreserveArtefacts implements Reporter {
  private outputDir = '';
  private repoRoot = '';
  private readonly projects = new Set<string>();
  private failures = 0;

  onBegin(config: FullConfig): void {
    this.repoRoot = repoRootFrom(config.rootDir);
    /* Every project in this repo shares one outputDir; take the first that
       declares one rather than assuming the default has not been changed. */
    this.outputDir = config.projects[0]?.outputDir ?? join(config.rootDir, 'test-results');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed' || result.status === 'skipped') return;
    this.failures += 1;
    /* The project name is what makes a preserved directory readable later —
       "which browser was this?" is the first question asked of an artefact. */
    const project = test.parent.project()?.name;
    if (project) this.projects.add(project);
  }

  onEnd(result: FullResult): void {
    if (process.env['MCC_ARTEFACTS_HANDLED']) return;
    if (this.failures === 0 || result.status === 'passed') return;

    try {
      if (!existsSync(this.outputDir)) return;
      /* A clean run leaves only `.last-run.json` behind; directories are the
         per-test failure artefacts, and they are the entire point. */
      const dirs = readdirSync(this.outputDir, { withFileTypes: true }).filter((e) => e.isDirectory());
      if (dirs.length === 0) return;

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const label = [...this.projects].sort().join('+') || 'unknown';
      const to = join(this.repoRoot, 'gate-logs', `artefacts-${label}-${stamp}`);
      mkdirSync(to, { recursive: true });
      for (const d of dirs) cpSync(join(this.outputDir, d.name), join(to, d.name), { recursive: true });

      /* A pointer the wrappers and a human can both read without globbing. */
      writeFileSync(join(this.repoRoot, 'gate-logs', '.last-artefacts'), to + '\n', 'utf8');

      console.log(
        `\n  \x1b[33m⚠️ ${dirs.length} failure artefact dir(s) kept — READ BEFORE RE-RUNNING:\x1b[0m\n` +
          `  ${to}\n` +
          '  error-context.md carries the page state at the moment it failed.\n' +
          '  Re-running first is what deletes it: Playwright clears test-results/\n' +
          '  at the START of every run.\n',
      );
    } catch (error) {
      console.log(`  (could not preserve artefacts: ${(error as Error).message})`);
    }
  }
}

export default PreserveArtefacts;
