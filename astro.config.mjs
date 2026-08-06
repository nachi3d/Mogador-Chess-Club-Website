// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

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
  // TODO(domain): mogadorchess.ma is planned, not yet registered. Keep in sync
  // with `site.url` in src/config/site.ts.
  site: 'https://mogadorchess.ma',

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
    optimizeDeps: {
      // Chessground is ESM-only and ships untranspiled; pre-bundling it keeps
      // the dev server from re-optimising on every board mount.
      include: ['chessground', 'chess.js'],
    },
  },
});
