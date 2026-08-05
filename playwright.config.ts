import { defineConfig, devices } from '@playwright/test';

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
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Club members will overwhelmingly arrive on a phone.
    { name: 'pixel-5', use: { ...devices['Pixel 5'] } },
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
