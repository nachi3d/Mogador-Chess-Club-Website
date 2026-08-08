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

    /*
     * ── THEME ASSETS (E6/E7) — THE SAME ARGUMENT AS THE ENGINE ───────────
     *
     * A reader uses ONE theme, which means one piece set and one heading
     * face. Precaching all of them charges every first visit for three sets
     * and three faces it will never draw:
     *
     *     piece sets      4 × ~2–9 KB brotli   ⇒ ~32 KB, ~23 KB wasted
     *     heading fonts   4 × ~31–40 KB        ⇒ ~144 KB, ~108 KB wasted
     *
     * ~130 KB on the first visit of a phone on Essaouira mobile data, to
     * support a theme nobody has chosen. The runtime rules below cache each
     * on first use instead, so switching theme costs one fetch, once, ever.
     *
     * ⚠️ THE DEFAULT THEME'S ASSETS ARE DELIBERATELY *NOT* EXCLUDED. Bois's
     * merida pieces and Fraunces are in the precache, because they are what
     * an offline first-time reader will actually be shown. Excluding them to
     * make the rule uniform would trade a real offline guarantee for a tidier
     * ignore list.
     */
    'pieces/!(merida).css',
    'fonts/!(inter|fraunces)-*.woff2',

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
      /**
       * Self-hosted fonts are immutable and content-hashed by fontsource.
       *
       * This rule now covers the three non-default HEADING faces as well
       * (see `globIgnores`): a reader who switches to Marbre fetches Playfair
       * once and never again, on any page or visit.
       *
       * `maxEntries` is 12 rather than the 10 files that ship, so a stale
       * entry from a previous build cannot evict a live one mid-session.
       */
      urlPattern: /\.woff2$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'mcc-fonts',
        expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    {
      /**
       * THE PIECE SETS — cached at runtime, precached only for the default
       * theme. Same reasoning as the engine and the heading fonts.
       *
       * `cacheableResponse` matters here for the same reason it does for the
       * engine: a truncated stylesheet cached as if it were whole gives a
       * board with some pieces missing, on every later visit, with no way
       * back short of clearing site data.
       */
      urlPattern: /\/pieces\/[\w-]+\.css$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'mcc-pieces',
        expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [200] },
      },
    },
    {
      /**
       * THE ENGINE — cached at RUNTIME, never precached. Landed Session 4.
       *
       * The first game costs 3.6 MB because it has to; every game after that,
       * and every visit after that, costs nothing. Putting these two files in
       * the precache manifest instead would charge that 3.6 MB to every first
       * visit, including a phone on Essaouira mobile data that only ever reads
       * one lesson — which is the whole reason `globIgnores` above excludes
       * them, before the engine even existed.
       */
      urlPattern: /\/engine\/stockfish.*\.(js|wasm)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'mcc-engine',
        expiration: { maxEntries: 4 },
        // A failed or partial fetch must not be cached as if it were the
        // engine: the next visit would load a truncated WASM and fail with no
        // way back short of clearing site data.
        cacheableResponse: { statuses: [200] },
      },
    },
  ],
});

for (const warning of warnings) console.warn(`  workbox: ${warning}`);
console.log(`\nService worker: precached ${count} file(s), ${(size / 1024).toFixed(0)} KiB.\n`);
