import { defineConfig, devices } from '@playwright/test';
import { assertNotProduction, loadE2EEnv } from './tests/e2e/env';

/**
 * ⚠️ THE PRODUCTION-SAFETY INTERLOCK, AT CONFIG LOAD.
 *
 * Runs before a single test is collected. The auth suite creates users and
 * PURGES BY PATTERN; pointed at production it would delete real accounts, so
 * this aborts the ENTIRE run rather than letting one spec decide.
 *
 * It fails CLOSED on every ambiguity — refs equal, production ref undeclared,
 * service key absent, URL unparseable. The single exception is a completely
 * absent .env.test, where no Supabase project is reachable at all and the auth
 * specs skip visibly; see the note in tests/e2e/env.ts.
 *
 * Never wrap this in a try/catch and never make it conditional on CI.
 */
assertNotProduction();

/**
 * Mogador Chess Club — end-to-end test matrix.
 *
 * CLAUDE.md → Testing → Verification policy:
 *   - feature branches merge to `dev` on `--project=chromium` alone;
 *   - the FULL matrix is the release gate for any merge to `main`, and is
 *     required for any change touching i18n routing, the board island, the
 *     exercise validator or the service worker.
 *
 * SERVER: `astro preview` over the real `dist/` build.
 * This project ships FULLY STATIC output — no SSR, no Pages Functions — so
 * `astro preview` serves exactly what Cloudflare Pages will. (Claraloha needs
 * `wrangler pages dev` because it has a Function; we deliberately do not, which
 * is why wrangler is not a dependency here.)
 *
 * Testing the BUILD rather than the dev server is not optional for this site:
 * the service worker, the generated manifest and the self-hosted fonts only
 * exist after `astro build` + the post-build scripts run.
 */

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },

    /**
     * FIREFOX GETS ONE LOCAL RETRY — same reason as WebKit below, different
     * crash.
     *
     * Under the full fan-out the Windows Firefox build loses its compositor:
     * the log fills with `RenderCompositorSWGL failed mapping default
     * framebuffer` and `VideoBridgeParent receives IPC close with
     * reason=AbnormalShutdown`, and whichever test was mid-flight dies with a
     * `mouse.move` or `page.reload` timeout — the browser simply stops
     * answering. It lands on a DIFFERENT test each run, including specs that
     * predate the exercise board entirely, which is the tell: a resource
     * problem in the browser build, not an application bug.
     *
     * Confirmed by running `--workers=1`, where the same specs pass 21/21 in
     * ~2.5 minutes.
     *
     * The retry does not mask anything real: a genuine failure is
     * deterministic and fails the retry too. If a Firefox spec fails twice,
     * believe it.
     *
     * ⚠️ THE RETRY IS NOT THE FIX, AND IT WAS NEVER ENOUGH. It absorbs one
     * lost browser; it cannot absorb a machine that has run out of memory,
     * which is what two consecutive release gates actually hit. That is fixed
     * in `scripts/test-release.mjs` — the matrix runs one project at a time
     * under a worker cap — and NOT here. ⚠️ `fullyParallel: false` on this
     * project was measured and REJECTED: see MEASUREMENTS in that file.
     */
    /**
     * ⚠️ FIREFOX RUNS FILE-PARALLEL TOO, FOR THE SAME REASON AS WEBKIT (v0.16.0).
     *
     * The Windows Firefox compositor dies when several heavy contexts are live
     * at once. The tell is verbatim in the log:
     *
     *   Crash Annotation GraphicsCriticalError:
     *   |[0][GFX1-]: RenderCompositorSWGL failed mapping default framebuffer
     *
     * followed by a bare `browserContext.newPage` or `page.evaluate` TIMEOUT —
     * never an assertion naming a value, which is what tells it apart from a
     * defect.
     *
     * ⚠️ MEASURED AT THE v0.16.0 GATE, not guessed. `agenda.spec.ts`'s three
     * axe checks failed at **3 workers AND at 2**, the same two tests each time,
     * and passed **8/8 serially**. Lowering the worker count did not help
     * because the problem is CONCURRENT CONTEXTS, not total load — which is
     * exactly the WebKit finding above, on a second browser.
     *
     * `fullyParallel: false` keeps spec FILES concurrent and serialises the
     * tests inside each one, so the three 40-second axe runs in a single file
     * can never be live together. Shard 1 went from 2 failed / 5.3 min to
     * green / 3.2 min.
     */
    {
      name: 'firefox',
      fullyParallel: false,
      retries: process.env['CI'] ? 2 : 1,
      use: { ...devices['Desktop Firefox'] },
    },

    /**
     * WEBKIT RUNS FILE-PARALLEL, NOT TEST-PARALLEL.
     *
     * The Windows WebKit build crashes under the default fan-out: with six
     * workers, roughly a quarter of the specs die with "Target page, context or
     * browser has been closed" — the browser process itself goes away
     * mid-test. The same specs pass 24/24 in ~15s on a single worker, so this
     * is a WebKit-on-Windows resource problem and NOT an application bug.
     *
     * `fullyParallel: false` here overrides the global setting for these two
     * projects only: spec FILES still run concurrently, but tests within a file
     * run in sequence, which keeps the number of live WebKit contexts low
     * enough to be stable. Chromium and Firefox keep the full fan-out.
     *
     * They also get a retry locally (the other projects get none), because two
     * WebKit projects running side by side still lose a context now and then.
     * This does not mask application bugs: a real failure is deterministic and
     * fails the retry too. Only the crash-on-startup flake is absorbed.
     *
     * If a WebKit spec ever fails with a "browser has been closed" message,
     * suspect this before suspecting the site — and re-check with
     * `--workers=1` before changing any application code.
     */
    {
      name: 'webkit',
      fullyParallel: false,
      retries: process.env['CI'] ? 2 : 1,
      use: { ...devices['Desktop Safari'] },
    },

    // Club members will overwhelmingly arrive on a phone.
    { name: 'pixel-5', use: { ...devices['Pixel 5'] } },
    // WebKit-based — same constraint as above.
    {
      name: 'iphone-13',
      fullyParallel: false,
      retries: process.env['CI'] ? 2 : 1,
      use: { ...devices['iPhone 13'] },
    },
  ],

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    /**
     * ⚠️ THE SITE UNDER TEST MUST NEVER POINT AT PRODUCTION.
     *
     * `PUBLIC_*` variables are baked into the bundle at build time, and Astro
     * reads them from `.env.local` — which holds the PRODUCTION project, because
     * that is what a real deploy build needs. Without this override, every
     * Playwright run would serve a site whose Supabase client is wired to the
     * live database. Nothing exploits that today (the signed-in specs are gated
     * on `.env.test`), but a single future spec that signs in through the UI
     * would create a real account in production, and the interlock would not
     * catch it: `assertNotProduction()` inspects `.env.test`, and knows nothing
     * about what the BUILD embedded.
     *
     * Vite gives an existing `process.env` entry precedence over a `.env` file
     * for the same prefixed key, so passing them here wins over `.env.local`.
     * `tests/e2e/auth.spec.ts` asserts the built bundle carries the test ref —
     * the mechanism is verified rather than assumed.
     *
     * Empty strings when `.env.test` is absent: the build then has no Supabase
     * config at all, which is strictly safer than inheriting production.
     */
    env: (() => {
      const e = loadE2EEnv();
      return {
        PUBLIC_SUPABASE_URL: e?.supabaseUrl ?? '',
        PUBLIC_SUPABASE_ANON_KEY: e?.anonKey ?? '',
        /* Passed through so the BUILD and the SPECS agree about which shape of
           site is under test. Default (unset ⇒ '') is OFF, which is what
           production ships — so a plain `npx playwright test` exercises the
           real artefact, and the auth specs skip visibly rather than passing
           against a site that has no auth in it. Set PUBLIC_AUTH_ENABLED=true
           to build and test the ON path. See tests/e2e/helpers/auth-mode.ts. */
        PUBLIC_AUTH_ENABLED: process.env['PUBLIC_AUTH_ENABLED'] ?? '',
        /**
         * ⚠️ TEST FIXTURES ARE ON FOR EVERY RUN, AND OFF EVERYWHERE ELSE.
         *
         * Fixtures are content that exists only so a spec has something real
         * to drive — today, the video facade, which would otherwise need a
         * placeholder video id on a page a reader can reach. They are emitted
         * only when this is `'true'`, and `src/config/fixtures.ts` keeps them
         * off every index and every count even then.
         *
         * ⚠️ HARDCODED, NOT `process.env[...] ?? ''` LIKE THE FLAG ABOVE, and
         * the difference is deliberate. `PUBLIC_AUTH_ENABLED` selects between
         * two real product shapes, so the release gate runs the matrix once for
         * each. Fixtures are a property of the HARNESS: constant across both
         * shapes, so they add no third matrix run — and forcing them on here is
         * what gives the facade cross-browser coverage without putting a test
         * page anywhere near a build a reader sees.
         *
         * ⚠️ NOTHING LOCAL CAN PROVE THE OFF SHAPE, because the build under
         * test is by construction the ON one. `npm run smoke:prod` asserts a
         * fixture route 404s on the live site; that is where the guarantee is
         * checked, and it is on the promotion checklist.
         */
        PUBLIC_FIXTURES: 'true',
      };
    })(),
  },
});
