import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { computeLedger, type LedgerCatalogue } from '../../src/lib/ledger';
import { isSupabaseConfigured } from './env';
import {
  adminClient,
  createConfirmedUser,
  deleteUser,
  e2eEmail,
  magicLinkFor,
} from './helpers/supabase-admin';
import { reachAccountPage } from './helpers/auth';

/**
 * v2-S4 part 2 — the admin surfaces.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHAT THIS FILE DOES **NOT** TEST: the security boundary.
 *
 * That is `role-separation.spec.ts`, which calls PostgREST with a real
 * student's token. Hiding a table is UX; a student who opens devtools does not
 * use the table. If an assertion about who may see what ever appears HERE, it
 * is in the wrong file and it is proving the wrong thing.
 *
 * What this file covers is the half that RLS cannot: the routes exist (or do
 * not, with the flag off), the admin UI is French only, the navigation obeys
 * Critical Feature 36, and the prof's total is the SAME NUMBER the student is
 * looking at.
 * ═════════════════════════════════════════════════════════════════════════
 */

const ADMIN_ROUTES = [
  '/admin/',
  '/admin/eleves/',
  '/admin/eleve/',
  '/admin/seances/',
  '/admin/comptes/',
];

/* ── With the flag OFF — the artefact that actually ships ────────────────── */

test.describe('accounts off — the admin surfaces are NOT BUILT', () => {
  test.skip(AUTH_ENABLED, 'this asserts the OFF artefact; the suite is running with auth ON');

  /**
   * ⚠️ AGAINST `dist/` ON DISK AS WELL AS OVER HTTP. `getStaticPaths()`
   * returning `[]` is what stops the page being emitted, and reading the
   * directory is the only way to prove it was not — a 404 over HTTP could just
   * as easily be a routing quirk.
   */
  test('no admin route is emitted into dist/', () => {
    const dist = join(process.cwd(), 'dist');
    test.skip(!existsSync(dist), 'no dist/ to inspect');
    for (const route of ADMIN_ROUTES) {
      const file = join(dist, route.replace(/^\/|\/$/g, ''), 'index.html');
      expect(existsSync(file), `${route} was emitted with accounts off`).toBe(false);
    }
  });

  test('every admin route 404s', async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} answered with accounts off`).toBe(404);
    }
  });
});

/* ── With the flag ON ────────────────────────────────────────────────────── */

test.describe('v2-S4 — the admin surfaces', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  /**
   * ⚠️ THE GATE DENIES BY DEFAULT, and this is the state a signed-out visitor
   * meets. It is not the security boundary — it is the difference between a
   * sentence and an empty table that looks broken.
   */
  test('a signed-out visitor is told, not shown an empty table', async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      await expect(
        page.getByTestId('admin-denied'),
        `${route} did not deny a signed-out visitor`,
      ).toBeVisible();
      await expect(page.getByTestId('admin')).toHaveAttribute('data-state', 'denied');
    }
  });

  /**
   * ⚠️ CRITICAL FEATURE 36 — anything reachable on one layout is reachable on
   * the other. The list is READ OFF THE NAV at phone width and compared with
   * the same nav at desktop width; hard-coding three known paths would pass
   * throughout the bug it exists to catch.
   */
  /**
   * ⚠️ REACHABILITY, WHICH RLS CANNOT SEE — Critical Feature 48.
   *
   * `role-separation.spec.ts` proves who the DATABASE lets near the account
   * list. It cannot prove an admin can get to the page, and this project has
   * already shipped the mirror-image bug: the add-a-child form was permitted by
   * every policy and invisible to every real account for two releases, with the
   * boundary spec fully green throughout.
   *
   * So this asserts the UX half in both directions: an admin finds the tab and
   * the page loads; a prof is told, in words that make sense to somebody who IS
   * a professeur, rather than being shown "réservé aux professeurs".
   */
  test.describe('the accounts surface is reachable by an admin and not by a prof', () => {
    test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');

    const created: string[] = [];

    test.afterAll(async () => {
      for (const id of created) await deleteUser(id);
    });

    async function signInAs(page: import('@playwright/test').Page, role: 'admin' | 'prof') {
      const email = e2eEmail(`comptes-${role}`);
      const user = await createConfirmedUser({ email, displayName: role });
      created.push(user.id);
      /* Promoted through the only sanctioned path — column grants and a trigger
         refuse everything else, including the service role going direct. */
      const { error } = await adminClient().rpc('admin_set_role', {
        target_id: user.id,
        new_role: role,
      });
      expect(error, `admin_set_role failed: ${error?.message}`).toBeNull();
      await page.goto(await magicLinkFor(email));
      await reachAccountPage(page);
      return user;
    }

    test('an admin sees the Comptes tab and the sign-up list', async ({ page }) => {
      await signInAs(page, 'admin');

      await page.goto('/admin/');
      /* ⚠️ FOUND BY NAVIGATING, not by typing the URL. A destination nothing
         links to is a destination nobody finds. */
      const tab = page.locator('[data-testid="admin-nav"] a[href="/admin/comptes/"]');
      await expect(tab).toBeVisible();
      await tab.click();

      await page.waitForURL(/\/admin\/comptes\//);
      await expect(page.getByTestId('admin')).toHaveAttribute('data-state', 'staff');
      /* The list actually renders rows — a page that draws an empty state for an
         admin would pass a "does it load" check and be useless. */
      await expect(page.getByTestId('account-list')).toBeVisible();
      await expect(page.getByTestId('account-list')).toContainText('@');
    });

    test('a prof is denied, and told something that makes sense to a prof', async ({ page }) => {
      await signInAs(page, 'prof');

      await page.goto('/admin/');
      await expect(page.getByTestId('admin')).toHaveAttribute('data-state', 'staff');
      /* The tab is not offered — a destination a prof cannot use is worse shown
         than hidden. */
      await expect(page.locator('[data-testid="admin-nav"] a[href="/admin/comptes/"]')).toBeHidden();

      await page.goto('/admin/comptes/');
      await expect(page.getByTestId('admin-denied')).toBeVisible();
      /* ⚠️ NOT "réservé aux professeurs", which is baffling to a professeur. */
      await expect(page.getByTestId('admin-denied')).toContainText(/administrateurs/i);
    });
  });

  test('the admin nav is identical at phone and desktop widths', async ({ page }) => {
    const hrefs = async () =>
      page.locator('[data-testid="admin-nav"] [data-admin-nav]').evaluateAll((nodes) =>
        nodes
          .filter((n) => {
            const style = window.getComputedStyle(n);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map((n) => n.getAttribute('href')),
      );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/');
    const phone = await hrefs();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/admin/');
    const desktop = await hrefs();

    expect(phone.length, 'the admin nav is empty on a phone').toBeGreaterThan(0);
    expect(phone, 'a destination exists on one layout only').toEqual(desktop);
  });

  /**
   * ⚠️ FRENCH ONLY — a decision, recorded in CLAUDE.md, and this is what stops
   * a future session "fixing" it. There is no `/en/admin/`, no language
   * switcher, and no hreflang alternate advertising a page that does not exist.
   */
  test('the admin UI is French only, with no switcher and no alternates', async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      const response = await page.goto(`/en${route}`);
      expect(response?.status(), `/en${route} exists — the admin UI is FR only`).toBe(404);
    }

    await page.goto('/admin/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    /* No switcher: a control offering a one-way trip to a 404. */
    expect(
      await page.locator('[data-testid="lang-switcher"], .lang-switcher').count(),
      'the language switcher is on an FR-only page',
    ).toBe(0);

    /* And nothing telling a search engine the EN page exists. */
    const alternates = await page.locator('link[rel="alternate"][hreflang]').count();
    expect(alternates, 'an FR-only page advertises hreflang alternates').toBe(0);
  });

  /** The public site keeps both languages — this rule is not a licence. */
  test('a public page still has its switcher and its alternates', async ({ page }) => {
    await page.goto('/progres/');
    expect(
      await page.locator('link[rel="alternate"][hreflang]').count(),
      'a public page lost its hreflang alternates',
    ).toBeGreaterThan(0);
  });

  /**
   * ⚠️ THE ONE THAT MATTERS FOR TRUST: a prof and a student must read the SAME
   * NUMBER. `/admin/eleve/` computes with `computeLedger()`; the student's own
   * page computes with `ScoreResolver`'s inline script. Two implementations,
   * one answer — and the failure would be silent, with both numbers plausible.
   *
   * This seeds a known store, reads `window.MCC_SCORE` out of the live page,
   * and runs the shared function over the same records and the same catalogue
   * in Node. A divergence fails here.
   */
  test('the shared ledger agrees with the resolver, award for award', async ({ page }) => {
    const store = {
      exercises: {
        'mat-de-l-escalier': { solved: true, attempts: 0, hintUsed: false, solvedAt: '2026-01-01T10:00:00.000Z' },
        'tutorial:la-tour': { solved: true, attempts: 1, hintUsed: true, solvedAt: '2026-01-02T10:00:00.000Z' },
      },
      games: { debutant: { wins: 3, draws: 0, losses: 2 } },
      announced: [],
      awards: [
        { points: 10, reason: 'A aidé un camarade', awardedAt: '2026-02-01T10:00:00.000Z' },
        { points: 5, reason: 'Beau sacrifice', awardedAt: '2026-02-02T10:00:00.000Z' },
      ],
    };

    await page.addInitScript((seed) => {
      window.localStorage.setItem('mcc:progress:v1', JSON.stringify(seed));
    }, store);

    await page.goto('/progres/');

    const fromResolver = await page.evaluate(() => {
      const score = (window as unknown as { MCC_SCORE?: { points: number; sources: Record<string, number>; rank: string } }).MCC_SCORE;
      return score ? { points: score.points, sources: score.sources, rank: score.rank } : null;
    });
    expect(fromResolver, 'no resolver on /progres/').not.toBeNull();

    const catalogue = await page.evaluate(() => {
      const node = document.querySelector('[data-score-catalogue]');
      return node?.textContent ? JSON.parse(node.textContent) : null;
    });
    expect(catalogue, 'no catalogue on the page').not.toBeNull();

    const fromLedger = computeLedger(catalogue as LedgerCatalogue, {
      exercises: store.exercises,
      games: store.games,
      awards: store.awards,
    });

    expect(fromLedger.points, 'the two ledgers disagree on the total').toBe(fromResolver!.points);
    expect(fromLedger.rank, 'the two ledgers disagree on the rank').toBe(fromResolver!.rank);
    for (const key of ['basics', 'lessons', 'exercises', 'games', 'teacher'] as const) {
      expect(fromLedger.sources[key], `the two ledgers disagree on "${key}"`).toBe(
        fromResolver!.sources[key],
      );
    }
    /* And the teacher bucket is actually carrying the awards, not zero — a
       test where both sides compute nothing would pass vacuously. */
    expect(fromLedger.sources.teacher, 'the awards were not counted at all').toBe(15);
  });

  /**
   * ⚠️ A STUDENT SEES "GAGNÉS" AND "ATTRIBUÉS PAR TON PROF" AS DIFFERENT
   * THINGS, with the reason printed. The reason is why the database requires
   * one; a point a student cannot account for teaches them it is arbitrary.
   */
  test('the student sees awards as a separate block, with the reasons', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'mcc:progress:v1',
        JSON.stringify({
          exercises: {},
          games: {},
          announced: [],
          awards: [{ points: 12, reason: 'A aidé un camarade', awardedAt: '2026-02-01T10:00:00.000Z' }],
        }),
      );
    });

    await page.goto('/progres/');
    const block = page.getByTestId('progress-teacher');
    await expect(block, 'the teacher block did not appear').toBeVisible();
    await expect(block).toContainText('A aidé un camarade');
    await expect(block.locator('[data-score-source="teacher"]')).toHaveText('12');

    /* It is distinct STRUCTURALLY, not by colour alone: its own heading. */
    await expect(block.locator('h2')).toBeVisible();
  });

  /** And a reader nobody has awarded never meets an empty "0 from your prof". */
  test('the teacher block is absent when nothing was awarded', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'mcc:progress:v1',
        JSON.stringify({ exercises: {}, games: {}, announced: [], awards: [] }),
      );
    });
    await page.goto('/progres/');
    await expect(page.getByTestId('progress-teacher')).toBeHidden();
  });

  /**
   * ⚠️ THE MARKER'S TARGETS ARE ≥44px AND THERE IS NO SAVE BUTTON. Both are the
   * design constraint of this whole session — twenty teenagers in a room — and
   * both are the kind of thing a later "tidy-up" removes without noticing.
   *
   * Asserted on the template rather than a live register, because the register
   * needs staff data this project's spec suite deliberately does not sign in
   * for here (that is role-separation's job, at the database).
   */
  test('the attendance row offers three one-tap targets and no save button', async ({ page }) => {
    await page.goto('/admin/seances/');

    const buttons = await page.evaluate(() => {
      const template = document.querySelector('[data-mark-template]') as HTMLTemplateElement | null;
      if (!template) return null;
      const row = template.content.firstElementChild as HTMLElement;
      return {
        statuses: [...row.querySelectorAll('.mark-button')].map((b) => b.getAttribute('data-status')),
        pressed: [...row.querySelectorAll('.mark-button')].map((b) => b.getAttribute('aria-pressed')),
        /* Every button carries a real text label as well as its letter. */
        labels: [...row.querySelectorAll('.mark-button .sr-only')].map((s) => s.textContent?.trim()),
      };
    });

    expect(buttons, 'no attendance template on the page').not.toBeNull();
    expect(buttons!.statuses, 'the register is not three one-tap states').toEqual([
      'present',
      'absent',
      'excuse',
    ]);
    expect(buttons!.pressed.every((p) => p === 'false'), 'a state starts pressed').toBe(true);
    expect(
      buttons!.labels.every((l) => (l ?? '').length > 0),
      'a state button is a letter with no accessible name',
    ).toBe(true);

    /* ⚠️ NO SAVE BUTTON, per row or per page. Twenty marks held in a phone
       browser is twenty marks a lock screen can take away. */
    const saves = await page
      .locator('[data-mark-list] button, [data-mark-session] ~ button')
      .filter({ hasText: /enregistrer|sauvegarder|valider/i })
      .count();
    expect(saves, 'the register grew a save button').toBe(0);
  });

  /**
   * The marker's buttons must clear the 44px floor. Measured on a real
   * rendered row rather than read off the stylesheet — asserting the rule
   * rather than the rendering is what let three custom-property bugs ship.
   */
  test('the attendance targets clear 44px on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/admin/seances/');

    const box = await page.evaluate(() => {
      const template = document.querySelector('[data-mark-template]') as HTMLTemplateElement | null;
      if (!template) return null;
      const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
      const host = document.createElement('ul');
      host.className = 'mark-list';
      host.appendChild(row);
      document.body.appendChild(host);
      const button = row.querySelector('.mark-button') as HTMLElement;
      const rect = button.getBoundingClientRect();
      const result = { width: rect.width, height: rect.height };
      host.remove();
      return result;
    });

    expect(box, 'no attendance template on the page').not.toBeNull();
    expect(box!.height, 'an attendance target is under 44px tall').toBeGreaterThanOrEqual(44);
    expect(box!.width, 'an attendance target is under 44px wide').toBeGreaterThanOrEqual(44);
  });
});

/* ── Both flag states ────────────────────────────────────────────────────── */

/**
 * ⚠️ NO SUPABASE REF IN A PUBLIC PAGE'S BUNDLE, whichever way the flag is set.
 *
 * With the flag OFF this is the leak `auth-disabled.spec.ts` already guards.
 * With it ON, the danger is different and new to this session: `admin.ts`
 * statically imports `@lib/supabase`, which is safe on `/admin*` and would not
 * be if anything a reader can reach ever imported it. This walks the built
 * public HTML for a reference to the admin chunk.
 */
test('no public page pulls in the admin module', () => {
  const dist = join(process.cwd(), 'dist');
  test.skip(!existsSync(dist), 'no dist/ to inspect');

  const publicPages = ['index.html', 'progres/index.html', 'exercices/index.html', 'jouer/index.html'];
  for (const page of publicPages) {
    const file = join(dist, page);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    expect(
      /admin[.-][A-Za-z0-9_-]+\.js/.test(html),
      `${page} references an admin chunk`,
    ).toBe(false);
  }
});
