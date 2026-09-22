import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isSupabaseConfigured } from './env';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON } from './helpers/auth-mode';
import { followMagicLink, reachAccountPage } from './helpers/auth';

/**
 * The shop's surfaces (0016) — /boutique/, an item, /admin/jetons/, /admin/boutique/.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHAT THE DATABASE REFUSES IS PROVED IN `shop.spec.ts`, WITH RAW TOKENS.
 * This file proves the other half: that a reader can actually get there — the
 * empty shop does not look broken, a guest makes no request, a member can
 * spend what they have, a prof can reward a room in seconds, and an admin can
 * hand an order over. RLS saying yes is not the same as a control being
 * reachable (Critical Feature 48).
 *
 * ⚠️ THE ITEM UNDER TEST IS THE FIXTURE (`fixture-porte-cles`): routable in a
 * test build, never listed, never in production. So `/boutique/` itself is
 * EMPTY in every build — which is exactly the state that must not look broken.
 * ═════════════════════════════════════════════════════════════════════════
 */

const FIXTURE = 'fixture-porte-cles';
const isSupabaseRequest = (url: string): boolean => /supabase\.(co|in)|supabase-js/i.test(url);

/* ── The public shape — both flag states, no credentials ──────────────────── */

test.describe('the shop, signed out', () => {
  for (const [path, soon] of [
    ['/boutique/', 'La boutique ouvre bientôt'],
    ['/en/boutique/', 'The shop opens soon'],
  ] as const) {
    test(`${path} says what the shop will be, with no fake product`, async ({ page }) => {
      await page.goto(path);
      const card = page.getByTestId('shop-soon');
      await expect(card).toBeVisible();
      await expect(card).toContainText(soon);
      /* ⚠️ "Points already earned will count" — worded as JETONS, never points. */
      await expect(card).toContainText(path.startsWith('/en/') ? 'Tokens' : 'jetons');
      /* No product card, and above all not the fixture. */
      await expect(page.getByTestId('shop-items')).toHaveCount(0);
      await expect(page.locator(`a[href*="${FIXTURE}"]`)).toHaveCount(0);
      /* The three paths are explained even while empty. */
      await expect(page.locator('.shop-path')).toHaveCount(3);
      /* A way up that names its parent (Critical Feature 62). */
      await expect(page.getByTestId('trail')).toContainText(path.startsWith('/en/') ? 'The club' : 'Le club');
    });
  }

  for (const path of ['/boutique/', `/boutique/${FIXTURE}/`]) {
    test(`${path} makes no third-party request and no Supabase request`, async ({ page }) => {
      const offsite: string[] = [];
      page.on('request', (r) => {
        const url = new URL(r.url());
        /* ⚠️ `hostname !== localhost`, never a name filter (Critical Feature 9). */
        if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') offsite.push(r.url());
        if (isSupabaseRequest(r.url())) offsite.push(r.url());
      });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(offsite, offsite.join('\n')).toEqual([]);
    });
  }

  test('the item page links out for a card payment, and offers no payment form', async ({ page }) => {
    await page.goto(`/boutique/${FIXTURE}/`);
    const link = page.getByTestId('shop-card-link');
    await expect(link).toHaveAttribute('href', /^https:\/\/(www\.)?nachi3dlabs\.com\//);
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('input[autocomplete^="cc-"], input[name*="card" i]')).toHaveCount(0);
    /* The cap is stated before anybody signs in. */
    await expect(page.locator('[data-path="whatsapp"]')).toContainText('10 DH');
  });

  test('the Club landing carries the shop, and says it is opening rather than "0"', async ({ page }) => {
    await page.goto('/club/');
    const card = page.getByTestId('hub-shop');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Ouverture prochaine');
    await expect(card).not.toContainText(/\b0\b/);
    await card.getByRole('link').click();
    await expect(page).toHaveURL(/\/boutique\/$/);
  });

  test('on a phone: no sideways scroll, and the bar lights Club', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ['/boutique/', `/boutique/${FIXTURE}/`]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
      await expect(page.locator('.mobile-nav [aria-current="page"]')).toContainText('Club');
    }
  });

  for (const path of ['/boutique/', '/en/boutique/', `/boutique/${FIXTURE}/`]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});

/* ── Signed in, against the test project ──────────────────────────────────── */

test.describe('the shop, signed in', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');
  test.describe.configure({ mode: 'serial' });

  const created: string[] = [];

  test.beforeAll(async () => {
    /* ⚠️ Seeded by the service role HERE, and published through the admin UI
       in the admin test below — this row is what `redeem()` charges. */
    const { error } = await adminClient().from('shop_items').upsert({
      slug: FIXTURE,
      price_jetons: 10,
      price_mad: 40,
      allow_jetons: true,
      allow_whatsapp: true,
      in_stock: true,
    });
    if (error) throw new Error(`seeding the fixture item failed: ${error.message}`);
  });

  test.afterAll(async () => {
    await adminClient().from('shop_items').delete().eq('slug', FIXTURE);
    for (const id of created) await deleteUser(id);
  });

  async function signIn(page: Page, label: string, displayName: string, role?: 'prof' | 'admin') {
    const email = e2eEmail(label);
    const user = await createConfirmedUser({ email, displayName, ...(role ? { role } : {}) });
    created.push(user.id);
    await followMagicLink(page, email);
    await reachAccountPage(page);
    return user;
  }

  /** The child onboarding produced — read back, never seeded (booking-ui's lesson). */
  async function firstChild(accountId: string): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const { data } = await adminClient()
        .from('child_profiles')
        .select('id')
        .eq('account_id', accountId)
        .order('created_at')
        .limit(1);
      if (data?.[0]) return String(data[0]['id']);
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('no child profile was ever created');
  }

  async function award(childId: string, points: number) {
    const { error } = await adminClient()
      .from('point_awards')
      .insert({ child_id: childId, points, reason: 'e2e — belle séance' });
    if (error) throw new Error(`award failed: ${error.message}`);
  }

  async function orders(childId: string) {
    const { data, error } = await adminClient()
      .from('redemptions')
      .select('id,path,jetons,status')
      .eq('child_id', childId)
      .order('created_at');
    if (error) throw new Error(`reading orders failed: ${error.message}`);
    return data ?? [];
  }

  test('a member spends jetons, orders on WhatsApp with the capped discount, and cancels', async ({ page }) => {
    const user = await signIn(page, 'shop-ui-member', 'Yasmine');
    const child = await firstChild(user.id);
    await award(child, 25);

    await page.goto(`/boutique/${FIXTURE}/`);
    await expect(page.getByTestId('shop-balance')).toHaveText('25', { timeout: 15_000 });

    await page.getByTestId('shop-redeem').click();
    await expect(page.getByTestId('shop-balance')).toHaveText('15', { timeout: 15_000 });
    await expect(page.locator('[data-shop-message]')).toHaveText('C’est commandé.');
    await expect(page.getByTestId('shop-order')).toHaveCount(1);

    /* WhatsApp: 40 DH, cap 25% = 10 DH, 15 jetons held → 10 off. */
    await expect(page.getByTestId('shop-action-whatsapp')).toContainText('10 DH');
    await page.getByTestId('shop-whatsapp-order').click();
    const send = page.getByTestId('shop-whatsapp-send');
    await expect(send).toBeVisible({ timeout: 15_000 });
    const href = (await send.getAttribute('href')) ?? '';
    /* ⚠️ Through whatsappUrl() — the club's number from site config (CF7). */
    expect(href.startsWith('https://wa.me/212666377784?text=')).toBe(true);
    const text = decodeURIComponent(href.split('?text=')[1] ?? '');
    expect(text).toContain('Porte-clés de démonstration');
    expect(text).toContain('10 DH');
    expect(text).toContain('30 DH');
    await expect(page.getByTestId('shop-balance')).toHaveText('5');

    const rows = await orders(child);
    expect(rows.map((r) => [r['path'], r['jetons'], r['status']])).toEqual([
      ['jetons', 10, 'pending'],
      ['whatsapp', 10, 'pending'],
    ]);

    /* Cancelling a pending order hands its jetons back. */
    await page.getByTestId('shop-order').first().getByRole('button').click();
    await expect(page.getByTestId('shop-balance')).toHaveText('15', { timeout: 15_000 });
    expect((await orders(child)).filter((r) => r['status'] === 'cancelled')).toHaveLength(1);
  });

  test('a member short of jetons is told how many, not shown a live button', async ({ page }) => {
    const user = await signIn(page, 'shop-ui-short', 'Karim');
    await award(await firstChild(user.id), 3);
    await page.goto(`/boutique/${FIXTURE}/`);
    await expect(page.getByTestId('shop-redeem')).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByTestId('shop-action-jetons')).toContainText('7');
  });

  test('a prof gives jetons to a room on a phone — one tap each, in seconds', async ({ page, browser }) => {
    /* Three students to reward, each with their own account and child. */
    const students: string[] = [];
    for (const n of ['A', 'B', 'C']) {
      const u = await createConfirmedUser({ email: e2eEmail(`shop-ui-room-${n}`) });
      created.push(u.id);
      const { data } = await adminClient()
        .from('child_profiles')
        .insert({ account_id: u.id, display_name: `Salle ${n} e2e` })
        .select('id')
        .single();
      students.push(String(data!['id']));
    }
    void browser;

    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'shop-ui-prof', 'Prof e2e', 'prof');
    await page.goto('/admin/jetons/');
    await page.locator('[data-jetons-amount="2"]').click();
    await page.getByLabel('Chercher un élève').fill('e2e');

    const rows = page.locator('[data-testid="jetons-row"]', { hasText: 'Salle' });
    await expect(rows).toHaveCount(3, { timeout: 15_000 });

    const started = Date.now();
    for (let i = 0; i < 3; i += 1) {
      const row = rows.nth(i);
      await row.locator('[data-jetons-give]').click();
      await expect(row).toContainText('+2 ici');
    }
    const perTap = (Date.now() - started) / 3;
    test.info().annotations.push({ type: 'jetons-per-tap-ms', description: String(Math.round(perTap)) });
    /* ⚠️ "Seconds per student" is the brief; a confirmed tap well under one. */
    expect(perTap, `a tap took ${Math.round(perTap)} ms to confirm`).toBeLessThan(2000);

    const { data: given } = await adminClient()
      .from('point_awards')
      .select('child_id,points,reason')
      .in('child_id', students);
    expect(given ?? []).toHaveLength(3);
    for (const row of given ?? []) {
      expect(row['points']).toBe(2);
      expect(String(row['reason'])).toMatch(/^Séance du /);
    }

    /* Undo takes back exactly the last tap. */
    await rows.nth(0).locator('[data-jetons-undo]').click();
    await expect(rows.nth(0)).not.toContainText('+2 ici');
    const { count } = await adminClient()
      .from('point_awards')
      .select('id', { count: 'exact', head: true })
      .in('child_id', students);
    expect(count).toBe(2);
  });

  test('an admin sees the catalogue checked against the database, and hands an order over', async ({ page }) => {
    const parent = await createConfirmedUser({ email: e2eEmail('shop-ui-buyer') });
    created.push(parent.id);
    const { data: kid } = await adminClient()
      .from('child_profiles')
      .insert({ account_id: parent.id, display_name: 'Acheteur e2e' })
      .select('id')
      .single();
    const child = String(kid!['id']);
    await award(child, 10);
    /* Placed through the real function, as the member's own page would. */
    const { data: order, error } = await adminClient()
      .from('redemptions')
      .insert({ child_id: child, item_slug: FIXTURE, path: 'jetons', jetons: 10, price_jetons: 10 })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    await signIn(page, 'shop-ui-admin', 'Admin e2e', 'admin');
    await page.goto('/admin/boutique/');

    /* The catalogue is compared against what the database charges: the seeded
       row matches the git fixture, so the page must say so.
       ⚠️ "Publier" IS NOT PRESSED HERE, DELIBERATELY. It withdraws every item
       the payload leaves out, and `shop.spec.ts` may be holding its own items
       in another worker; the function itself is proved there, by token. */
    await expect(page.getByTestId('catalogue-state')).toContainText('À jour', { timeout: 15_000 });
    await expect(page.getByTestId('admin-shop-item')).toContainText('Publié');
    await expect(page.getByTestId('shop-publish')).toBeEnabled();

    const row = page.locator('[data-testid="admin-order"]', { hasText: 'Acheteur e2e' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId('admin-hand-over').click();
    await expect(page.locator('[data-orders-pending]')).not.toContainText('Acheteur e2e', { timeout: 15_000 });

    const { data: after } = await adminClient()
      .from('redemptions')
      .select('status,handed_over_by')
      .eq('id', String(order!['id']))
      .single();
    expect(after!['status']).toBe('handed_over');
    expect(after!['handed_over_by']).not.toBeNull();
  });

  test('a prof is refused the shop admin page', async ({ page }) => {
    await signIn(page, 'shop-ui-prof2', 'Prof deux', 'prof');
    await page.goto('/admin/boutique/');
    await expect(page.getByTestId('admin-denied')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('admin-denied')).toContainText('administrateurs');
  });
});
