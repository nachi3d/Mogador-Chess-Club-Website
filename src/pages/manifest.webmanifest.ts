/**
 * The web app manifest, generated from src/config/site.ts.
 *
 * An endpoint rather than a static file in public/ so the club name and the
 * theme colours cannot drift from the config and the tokens they came from —
 * `site.pwa.themeColor` IS green-800, and there is exactly one place to change
 * it. Astro pre-renders this to dist/manifest.webmanifest at build time; the
 * output is a plain static file, no runtime involved.
 */

import type { APIRoute } from 'astro';
import { site } from '@config/site';

export const prerender = true;

export const GET: APIRoute = () => {
  const manifest = {
    name: site.name,
    short_name: site.shortName,
    description: site.description.fr,
    // FR is the default locale and is served from the root.
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: site.pwa.themeColor,
    background_color: site.pwa.backgroundColor,
    categories: ['education', 'games'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
