import { test, expect } from '@playwright/test';

/**
 * PWA plumbing.
 *
 * These run against the built output, which is the only place the generated
 * manifest and the Workbox service worker exist at all.
 *
 * The Stockfish assertion is the important one. The engine is not in the repo
 * yet; this test exists so that when it lands, sweeping it into the precache
 * manifest fails CI instead of quietly adding megabytes to every first visit.
 * See the block comment in scripts/build-sw.mjs.
 */

test('the manifest is served and carries the token theme colours', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(manifest.name).toBe('Mogador Chess Club');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');

  // green-800 / cream-100 — must stay in lockstep with src/styles/tokens.css.
  expect(manifest.theme_color).toBe('#163425');
  expect(manifest.background_color).toBe('#faf4e6');

  // Installability needs a 192 and a 512, and Android needs a maskable.
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
});

test('the page links the manifest and declares the theme colour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#163425');
});

test.describe('service worker precache', () => {
  test('is generated and includes the shell', async ({ request }) => {
    const response = await request.get('/sw.js');
    expect(response.ok()).toBeTruthy();

    const source = await response.text();
    expect(source).toContain('workbox');
    // The precache manifest is inlined into sw.js as a URL/revision array.
    expect(source).toContain('index.html');
  });

  test('NEVER precaches Stockfish or any wasm — the engine is lazy-loaded', async ({ request }) => {
    const source = await (await request.get('/sw.js')).text();

    expect(source.toLowerCase()).not.toContain('stockfish');
    expect(source).not.toContain('.wasm');
  });

  test('precaches the self-hosted latin fonts but not the unused subsets', async ({ request }) => {
    const source = await (await request.get('/sw.js')).text();

    expect(source).toContain('fraunces-latin-wght-normal.woff2');
    expect(source).toContain('inter-latin-wght-normal.woff2');
    // We never ship Cyrillic/Greek/Vietnamese Inter — see scripts/build-fonts.mjs.
    expect(source).not.toContain('cyrillic');
    expect(source).not.toContain('greek');
  });
});

test('no third-party requests are made when Umami is unconfigured', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(request.url());
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(external, `unexpected third-party requests:\n${external.join('\n')}`).toEqual([]);
});
