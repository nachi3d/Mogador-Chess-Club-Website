// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import preact from '@astrojs/preact';

/**
 * The account flag, read here the SAME WAY Astro reads it for `import.meta.env`.
 *
 * `loadEnv` walks `.env`, `.env.local` and the mode-specific files and lets a
 * real `process.env` entry win, which is exactly Vite's own precedence. Reading
 * `process.env` alone would be wrong locally: a developer who sets
 * `PUBLIC_AUTH_ENABLED=true` in `.env.local` would get the routes emitted (that
 * flag comes from `import.meta.env`) while the alias below still stubbed the
 * client out — a build with sign-in pages that cannot sign anyone in. The two
 * must be decided from one source.
 */
const { PUBLIC_AUTH_ENABLED } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const AUTH_ENABLED = PUBLIC_AUTH_ENABLED === 'true';

// https://astro.build/config
export default defineConfig({
  /**
   * Preact is here for EXACTLY ONE REASON: Astro's `client:*` directives only
   * work on framework components, and the board island must hydrate lazily
   * with `client:visible`. A plain `.astro` component cannot take that
   * directive at all.
   *
   * It is not a licence to write the site in Preact. Everything that can be
   * static HTML stays `.astro`; the ONLY hydrated component is the board.
   * See CLAUDE.md → "Architecture rule — ONE board island".
   */
  integrations: [preact()],
  // ⚠️ KEEP IN SYNC WITH `site.url` IN src/config/site.ts, which carries the
  // full note. Two files, one fact — and the mismatch is invisible locally,
  // because nothing on localhost ever compares them. `npm run smoke:prod`
  // does, against the deployed origin.
  site: 'https://mogadorchess.nachi3dlabs.com',

  // Fully static output — Cloudflare Workers serves `dist/` as static assets and
  // nothing else. No SSR, no adapter: v1 has no server-side state.
  // See CLAUDE.md → Stack and → Deployment.
  output: 'static',

  // i18n plumbing — FR is the default locale served at the root, EN under /en/...
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  build: {
    // Directory format ⇒ every route emits `index.html` in its own folder, so
    // hrefs carry a trailing slash. src/i18n/paths.ts matches this exactly.
    format: 'directory',
  },

  vite: {
    resolve: {
      /**
       * ⚠️ WITH ACCOUNTS OFF, `@lib/supabase` RESOLVES TO A STUB.
       *
       * `getStaticPaths()` returning `[]` stops the auth PAGES being emitted,
       * but Astro collects a page's `<script>` blocks from the module graph
       * rather than from what renders — so the client was still bundled. The
       * v0.3.0 build shipped **216 KB of unreachable `@supabase/supabase-js`,
       * precached by the service worker**, until this alias was added.
       *
       * Cutting the graph at the module is what makes "off means not built"
       * true of the JavaScript as well as of the routes.
       * `tests/e2e/auth-disabled.spec.ts` greps `dist/` to keep it true.
       */
      alias: AUTH_ENABLED
        ? {}
        : {
            '@lib/supabase': fileURLToPath(
              new URL('./src/lib/supabase.disabled.ts', import.meta.url),
            ),
          },
    },
    optimizeDeps: {
      // Chessground is ESM-only and ships untranspiled; pre-bundling it keeps
      // the dev server from re-optimising on every board mount.
      include: ['chessground', 'chess.js'],
    },
  },
});
