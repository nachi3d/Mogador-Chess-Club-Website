/**
 * Mogador Chess Club — service worker generation (Workbox).
 *
 * Runs as the last step of `npm run build`, AFTER `astro build`, because it
 * fingerprints the real contents of dist/. Running it before would precache a
 * manifest of the previous build's hashes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STOCKFISH IS NEVER PRECACHED. The engine is a multi-megabyte WASM bundle and
 * only the "play the computer" feature needs it, so it is lazy-loaded on
 * demand. Precaching it would make every first visit — including a phone on
 * Essaouira mobile data that only ever reads a lesson — pay for it up front.
 * The `globIgnores` entry below enforces this now, before the engine exists,
 * so it cannot be silently swept in later. A runtime CacheFirst rule is the
 * right home for it when it lands (see the commented block).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { generateSW } from 'workbox-build';

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist',
  swDest: 'dist/sw.js',

  globPatterns: [
    '**/*.{html,css,js,woff2,svg,png,webmanifest,json}',
  ],

  globIgnores: [
    // See the block comment above — the engine is lazy-loaded, never precached.
    '**/stockfish*',
    '**/*.wasm',
    // Source maps are for us, not for visitors' storage quota.
    '**/*.map',
    'sw.js',
    'workbox-*.js',
  ],

  // Astro emits content-hashed asset filenames, so a URL change IS a content
  // change; Workbox does not need to add its own revision query parameter.
  dontCacheBustURLsMatching: /\.[0-9a-zA-Z_-]{8,}\./,

  cleanupOutdatedCaches: true,

  // Safe here because this is a multi-page app: every navigation is a full
  // document load, so a worker taking over mid-session cannot leave a
  // half-updated SPA shell talking to newly-hashed chunks.
  skipWaiting: true,
  clientsClaim: true,

  runtimeCaching: [
    {
      // Self-hosted fonts are immutable and content-hashed by fontsource.
      urlPattern: /\.woff2$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'mcc-fonts',
        expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    // TODO(stockfish): when the engine lands, cache it HERE, at runtime, not in
    // the precache manifest:
    //   {
    //     urlPattern: /\/engine\/stockfish.*\.(js|wasm)$/,
    //     handler: 'CacheFirst',
    //     options: {
    //       cacheName: 'mcc-engine',
    //       expiration: { maxEntries: 4 },
    //       // WASM responses are opaque-safe here (same origin) but large:
    //       // cacheableResponse keeps a failed/partial fetch out of the cache.
    //       cacheableResponse: { statuses: [200] },
    //     },
    //   },
  ],
});

for (const warning of warnings) console.warn(`  workbox: ${warning}`);
console.log(`\nService worker: precached ${count} file(s), ${(size / 1024).toFixed(0)} KiB.\n`);
