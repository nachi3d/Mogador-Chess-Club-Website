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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateSW } from 'workbox-build';

/**
 * ── UNREACHABLE CHUNKS ARE NOT PRECACHED ─────────────────────────────────
 *
 * ⚠️ ASTRO COLLECTS A PAGE'S `<script>` BLOCKS FROM THE MODULE GRAPH, NOT FROM
 * WHAT RENDERS. So the scripts behind a route that `getStaticPaths()` declined
 * to emit are still built, still hashed into `_astro/`, and — until this
 * function existed — still swept into the precache. With `PUBLIC_AUTH_ENABLED`
 * off that was **29.9 KB across 12 files** charged to every first visit for
 * nine routes that answer 404: the four `/admin*` surfaces, `/connexion/`,
 * `/compte/` and `/auth/callback/`.
 *
 * ⚠️ THIS IS THE SAME MECHANISM AS THE 216 KB LEAK THE `supabase.disabled`
 * ALIAS WAS WRITTEN TO FIX. The alias cut the CLIENT out of the graph and left
 * the CALLERS behind; v2-S4's admin surfaces then roughly doubled what was
 * left. Found while verifying the v0.11.0 artefact, and fixed here rather than
 * in the flag, because the flag is not the general case — any orphaned chunk
 * from any cause is equally not worth a reader's bytes.
 *
 * ── WHY REACHABILITY AND NOT A LIST OF NAMES ────────────────────────────
 * The obvious fix is a `globIgnores` list naming the admin and auth chunks.
 * ⚠️ THAT LIST WOULD HAVE BEEN WRONG, and measurably so: `child.js` and
 * `supabase.disabled.js` LOOK like auth chunks and are genuinely reachable —
 * `progress.ts` → `progress-sync.ts` → `child.ts` is live on every board page,
 * and the disabled stub is what that path dynamically imports. Excluding them
 * by name would have pulled two live modules out of the offline cache.
 *
 * So the question is asked of the BUILD rather than of a human: start from
 * every emitted HTML file, follow every asset filename mentioned, transitively,
 * and precache what that reaches. Nothing to keep in step, no flag to read, and
 * it cannot disagree with the build because it IS the build. With accounts ON
 * it finds nothing to exclude, which is the same code proving itself.
 *
 * ⚠️ IT ERRS TOWARDS INCLUDING. The scan is a plain substring match over each
 * chunk's whole text, so a filename mentioned anywhere — a static import, a
 * `__vite__mapDeps` array, a string built for a dynamic import — counts as
 * reached. Over-inclusion costs a few precached bytes; under-inclusion would
 * cost a file offline. The failure directions are not symmetric and this picks
 * the harmless one.
 *
 * ⚠️ AND EXCLUSION IS NOT DELETION. An excluded file is still deployed and
 * still served on request; it is simply not pushed into every visitor's cache
 * up front. So the worst case for a mistake here is "not available offline",
 * never "missing".
 */
function unreachableAssets(dist) {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  const all = walk(dist);
  const assets = new Map();
  for (const file of all) {
    if (/[\\/]_astro[\\/]/.test(file) && /\.(js|css)$/.test(file)) {
      assets.set(file.split(/[\\/]/).pop(), file);
    }
  }

  const reached = new Set();
  const queue = [];
  const visit = (name) => {
    if (assets.has(name) && !reached.has(name)) {
      reached.add(name);
      queue.push(name);
    }
  };

  /* Seed from what a reader can actually open. */
  for (const page of all.filter((f) => f.endsWith('.html'))) {
    const text = readFileSync(page, 'utf8');
    for (const name of assets.keys()) if (text.includes(name)) visit(name);
  }

  /* Then follow the graph. A chunk names its own dependencies. */
  while (queue.length > 0) {
    const text = readFileSync(assets.get(queue.pop()), 'utf8');
    for (const name of assets.keys()) if (text.includes(name)) visit(name);
  }

  return [...assets.keys()]
    .filter((name) => !reached.has(name))
    .map((name) => ({ name, bytes: statSync(assets.get(name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const DIST = 'dist';
const orphans = unreachableAssets(DIST);

/**
 * ⚠️ Glob metacharacters in a filename would make the pattern match something
 * else, or nothing. Astro sanitises `[...slug]` to `_...slug_` so none ship
 * today — but a pattern that silently matches nothing is exactly the failure
 * this whole function exists to prevent, so it is checked rather than assumed.
 */
const escapeGlob = (name) => name.replace(/([[\]{}()!?*+@|])/g, '\\$1');

if (orphans.length > 0) {
  const kb = (orphans.reduce((sum, o) => sum + o.bytes, 0) / 1024).toFixed(1);
  console.log(
    `\n  Not precached — unreachable from any emitted page (${orphans.length} file(s), ${kb} KB):`,
  );
  for (const { name, bytes } of orphans) {
    console.log(`    ${(bytes / 1024).toFixed(1).padStart(6)} KB  ${name}`);
  }
}

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

    /*
     * ── CHUNKS NO EMITTED PAGE CAN REACH ─────────────────────────────────
     * Derived from the build, not listed by hand — see `unreachableAssets()`
     * above for why a hand-written list of "the auth chunks" would have been
     * wrong. Empty when accounts are enabled, which is the same code proving
     * itself against the case where nothing is orphaned.
     */
    ...orphans.map(({ name }) => `_astro/${escapeGlob(name)}`),
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

/**
 * ⚠️ VERIFY THE EXCLUSION ACTUALLY HAPPENED, AGAINST THE EMITTED MANIFEST.
 *
 * A `globIgnores` entry that matches nothing is silent: the build succeeds, the
 * log looks identical, and the bytes go on shipping. That is the same shape as
 * the vacuous grep that "proved" the v0.11.0 artefact clean by matching zero
 * files — so the claim is checked against the real output rather than trusted.
 *
 * This reads `dist/sw.js` back and asserts that every name we meant to exclude
 * is genuinely absent from `precacheAndRoute([...])`. It FAILS THE BUILD if not:
 * a precache that quietly regrew is exactly the regression this landed to fix.
 */
if (orphans.length > 0) {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const manifest = sw.match(/precacheAndRoute\(\[(.*?)\]\s*[,)]/s)?.[1];

  if (!manifest) {
    console.error('\n  ✗ No precache manifest found in dist/sw.js — cannot verify the exclusions.');
    process.exit(1);
  }
  /* Sanity FIRST: an empty or unparsed manifest would make every "absent"
     assertion below pass for the wrong reason. */
  if (!manifest.includes('index.html')) {
    console.error('\n  ✗ The precache manifest holds no index.html — it is empty or unparsed.');
    process.exit(1);
  }

  const leaked = orphans.filter(({ name }) => manifest.includes(name));
  if (leaked.length > 0) {
    console.error('\n  ✗ These unreachable chunks are STILL in the precache manifest:');
    for (const { name } of leaked) console.error(`      ${name}`);
    console.error('    The globIgnores pattern did not match. Check escapeGlob() and the path prefix.\n');
    process.exit(1);
  }
}

console.log(`\nService worker: precached ${count} file(s), ${(size / 1024).toFixed(0)} KiB.\n`);
