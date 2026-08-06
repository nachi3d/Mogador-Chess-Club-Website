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

  /**
   * NEVER PRECACHED — but now genuinely present, so the assertion has to be
   * sharper than "the word stockfish does not appear".
   *
   * Session 4 landed the engine, and its runtime `CacheFirst` rule legitimately
   * names `/engine/stockfish...` in `registerRoute`. The thing that must never
   * happen is the engine appearing in the PRECACHE MANIFEST — that would charge
   * 3.6 MB to every first visit, including a phone on Essaouira mobile data
   * that only ever reads one lesson.
   *
   * So: parse the manifest out of `precacheAndRoute([...])` and check THAT.
   */
  test('NEVER precaches Stockfish or any wasm — the engine is lazy-loaded', async ({ request }) => {
    const source = await (await request.get('/sw.js')).text();

    // Workbox emits `precacheAndRoute([...],{})` — note the SECOND argument, so
    // the array does not close with `])`.
    const manifest = source.match(/precacheAndRoute\(\[(.*?)\]\s*[,)]/s)?.[1];
    expect(manifest, 'no precache manifest found in sw.js').toBeTruthy();

    expect(manifest!.toLowerCase()).not.toContain('stockfish');
    expect(manifest!).not.toContain('.wasm');
    // Sanity: we are looking at a real manifest and not an empty match that
    // would pass the two assertions above for the wrong reason.
    expect(manifest!).toContain('index.html');
  });

  /**
   * The other half of the same decision: excluded from the precache AND cached
   * at runtime. Without this, the first game would cost 3.6 MB and so would
   * every game after it.
   */
  test('caches the engine at runtime instead', async ({ request }) => {
    const source = await (await request.get('/sw.js')).text();

    expect(source).toMatch(/registerRoute\(\/\\\/engine\\\/stockfish/);
    expect(source).toContain('mcc-engine');
    expect(source).toContain('CacheFirst');
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
