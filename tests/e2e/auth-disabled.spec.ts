import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AUTH_ENABLED, AUTH_ON_REASON } from './helpers/auth-mode';

/**
 * v0.3.0 — what "accounts are disabled" has to MEAN.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * OFF IS NOT "HIDDEN". The routes are not emitted, and the Supabase project ref
 * is nowhere in the shipped JavaScript. This file asserts both, because both
 * were wrong at some point during the change that introduced them:
 *
 *   1. `getStaticPaths()` returning `[]` stops the PAGES being emitted — but
 *      Astro collects a page's `<script>` blocks from the module graph rather
 *      than from what renders, so the first build still shipped **216 KB of
 *      unreachable `@supabase/supabase-js`, precached by the service worker**.
 *      Fixed by aliasing `@lib/supabase` to a stub (see `astro.config.mjs`).
 *
 *   2. `import.meta.env['PUBLIC_AUTH_ENABLED']` — BRACKET access — made Vite
 *      emit the ENTIRE env object into the chunk, anon key included. The anon
 *      key is a JWT carrying the project ref, so the flag meant to keep the ref
 *      out was itself what put it in. Fixed by dot access (see `src/env.d.ts`).
 *
 * Neither was visible from the page. Both were obvious in `dist/`. That is why
 * this spec reads the BUILT OUTPUT and not the running site alone.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Skips VISIBLY when the build has accounts on — these guarantees are about the
 * default build and asserting them against an ON build would be meaningless.
 */

test.describe('accounts disabled — the default build', () => {
  test.skip(AUTH_ENABLED, AUTH_ON_REASON);

  const DIST = join(process.cwd(), 'dist');

  /** Every file under `dist/`, so nothing can hide in a directory nobody listed. */
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  }

  test('the auth routes are not emitted at all', () => {
    /* ⚠️ v2-S4 part 2 added four more, and they belong in the SAME list rather
       than in a second test: "off means not built" is one guarantee, and a
       route with its own private assertion is a route that can quietly drop out
       of it. */
    for (const route of [
      'connexion',
      'compte',
      'en/connexion',
      'en/compte',
      'auth/callback',
      'admin',
      'admin/eleves',
      'admin/eleve',
      'admin/seances',
    ]) {
      const page = join(DIST, route, 'index.html');
      expect(
        () => statSync(page),
        `${route}/index.html was emitted — "off" must mean not built, not hidden`,
      ).toThrow();
    }
  });

  /**
   * ⚠️ 404, NOT A REDIRECT AND NOT A HIDDEN PAGE. Asserted over HTTP as well as
   * on disk: the disk check proves the file is absent, this proves the served
   * site agrees. `not_found_handling` is `"none"` today (CLAUDE.md → Deployment)
   * so a missing route is a bare 404, which is the correct answer for a URL that
   * does not exist.
   */
  for (const route of [
    '/connexion/',
    '/compte/',
    '/en/connexion/',
    '/en/compte/',
    '/auth/callback/',
    '/admin/',
    '/admin/eleves/',
    '/admin/eleve/',
    '/admin/seances/',
  ]) {
    test(`${route} is not served`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status(), `${route} responded ${response.status()}`).toBe(404);
    });
  }

  /**
   * THE ONE THAT MATTERS. A grep over every shipped byte.
   *
   * `supabase.co` catches the API host, the two refs catch the specific
   * projects, and `eyJhbGciOi` catches any JWT at all — the anon key is a JWT
   * and that prefix is its constant header, so this fires even if a future
   * project ref is one nobody thought to add to the list.
   */
  test('no Supabase project reference survives anywhere in dist/', () => {
    const NEEDLES = [
      'supabase.co',
      'supabase.in',
      'vtestpaufxmrvdhgrrsy', // the production project — see the TRAP note in CLAUDE.md
      'eyJhbGciOi', // any JWT header, base64
      'PUBLIC_SUPABASE_ANON_KEY',
    ];

    const offenders: string[] = [];
    for (const file of walk(DIST)) {
      // Source maps are not shipped to a reader, but they are in dist/ and
      // would be served; hold them to the same rule.
      if (!/\.(js|mjs|html|json|map|webmanifest|txt)$/i.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const needle of NEEDLES) {
        if (text.includes(needle)) offenders.push(`${relative(DIST, file)} contains "${needle}"`);
      }
    }

    expect(offenders, `Supabase leaked into the disabled build:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  /**
   * The 216 KB regression, guarded by size rather than by name — a renamed
   * chunk would slip past a filename check. Nothing auth-shaped should be more
   * than a few KB in a build with no auth in it.
   */
  test('no large orphan auth chunk is shipped or precached', () => {
    const suspects = walk(join(DIST, '_astro'))
      .filter((f) => /supabase/i.test(f) && f.endsWith('.js'))
      .map((f) => ({ name: relative(DIST, f), kb: statSync(f).size / 1024 }));

    for (const { name, kb } of suspects) {
      expect(kb, `${name} is ${kb.toFixed(0)} KB — the client is being bundled again`).toBeLessThan(
        8,
      );
    }

    const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
    expect(sw, 'the service worker is precaching a Supabase chunk').not.toMatch(
      /precacheAndRoute[\s\S]*?@supabase/,
    );
  });

  /** No door in the header either — not a hidden one, not a disabled one. */
  for (const [locale, path] of [
    ['fr', '/'],
    ['en', '/en/'],
  ] as const) {
    test(`the header offers no account control in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId('header-sign-in')).toHaveCount(0);
      await expect(page.getByTestId('header-account')).toHaveCount(0);
      await expect(page.locator('[data-account-button]')).toHaveCount(0);
    });
  }

  /**
   * ⚠️ The flag is a BUILD switch, not a permission check. Setting the
   * localStorage hint by hand must not conjure a link to a page that is not
   * there — the markup is simply absent, so there is nothing for the script to
   * reveal, and the script is not shipped either.
   */
  test('a hand-set auth flag reveals nothing', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('mcc:auth:v1', '1'));
    await page.goto('/');
    await expect(page.locator('[data-account-button]')).toHaveCount(0);
    await expect(page.getByTestId('header-account')).toHaveCount(0);
  });
});
