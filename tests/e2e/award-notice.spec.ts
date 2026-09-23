import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './env';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { AUTH_ENABLED, AUTH_OFF_REASON, AUTH_ON_REASON } from './helpers/auth-mode';
import { followMagicLink, reachAccountPage } from './helpers/auth';
import { settleReveals } from './helpers/reveal';
import { asNotice, groupNotices, newestOf, type AwardNotice } from '../../src/lib/award-notice';

/**
 * The award notice (0017) — a prof's jetons, announced with the reason and the prof.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THREE CLAIMS, PROVED THREE WAYS:
 *
 *  1. IT READS THE LEDGER AND STORES NOTHING THAT CAN DISAGREE WITH IT — proved
 *     against the real database with each account's OWN token: marking read
 *     leaves `jeton_balances()` untouched, and a withdrawn award leaves the
 *     notice exactly as it leaves the balance.
 *  2. "READ" IS PER CHILD PROFILE, OWNED BY THE ACCOUNT, AND ONLY MOVES
 *     FORWARD — another account, and a prof, get `forbidden`; a stale tab
 *     cannot re-open what was acknowledged.
 *  3. A READER CAN ACTUALLY SEE IT AND CLEAR IT (Critical Feature 48) — on the
 *     home page at both sides of 768px and on /boutique/, in FR and EN, with
 *     the reason and the prof's name on screen.
 *
 * ⚠️ AND A GUEST MAKES NO REQUEST, WHILE AN OFF BUILD HAS NO NOTICE AT ALL.
 * ═════════════════════════════════════════════════════════════════════════
 */

const isSupabaseRequest = (url: string): boolean => /supabase\.(co|in)|supabase-js/i.test(url);

/* ── The pure half, with no database ─────────────────────────────────────── */

test.describe('grouping the notices', () => {
  const n = (id: string, child: string, at: string, by: string | null = 'Prof'): AwardNotice => ({
    id,
    childId: child,
    childName: child.toUpperCase(),
    jetons: 1,
    reason: 'r',
    awardedAt: at,
    givenBy: by,
  });

  test('each child is a group, newest award first — the one "Compris" sends', () => {
    const groups = groupNotices([
      n('a1', 'a', '2026-09-01T10:00:00.000001+00:00'),
      n('b1', 'b', '2026-09-02T10:00:00+00:00'),
      n('a2', 'a', '2026-09-03T10:00:00.5+00:00'),
    ]);
    expect(groups.map((g) => [g.childId, g.awards.map((x) => x.id)])).toEqual([
      ['a', ['a2', 'a1']],
      ['b', ['b1']],
    ]);
    expect(newestOf(groups[0]!)?.id).toBe('a2');
  });

  test('a blank giver is null, so the page says "le club" rather than "Donné par "', () => {
    expect(asNotice({ award_id: 'x', child_id: 'c', given_by: '   ' }).givenBy).toBeNull();
    expect(asNotice({ award_id: 'x', child_id: 'c', given_by: null }).givenBy).toBeNull();
    expect(asNotice({ award_id: 'x', child_id: 'c', given_by: ' Karim ' }).givenBy).toBe('Karim');
  });
});

/* ── The database, with each account's own token ────────────────────────── */

test.describe('award notices against the real database', () => {
  test.skip(!isSupabaseConfigured(), 'no .env.test — visible skip, never a silent pass');
  test.describe.configure({ mode: 'serial' });

  const users: string[] = [];
  let student: { id: string; client: SupabaseClient; child: string };
  let other: { id: string; client: SupabaseClient; child: string };
  let prof: { id: string; client: SupabaseClient };

  async function tokenClient(email: string): Promise<SupabaseClient> {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv()!;
    const { data: link } = await adminClient().auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'http://localhost:4321/auth/callback' },
    });
    const fresh = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
    const { data: sess } = await fresh.auth.verifyOtp({
      token_hash: link!.properties!.hashed_token,
      type: 'magiclink',
    });
    return createClient(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${sess!.session!.access_token}` } },
    });
  }

  async function makeAccount(tag: string, displayName?: string, role?: 'prof') {
    const email = e2eEmail(`award-${tag}`);
    const user = await createConfirmedUser({
      email,
      ...(displayName ? { displayName } : {}),
      ...(role ? { role } : {}),
    });
    users.push(user.id);
    return { id: user.id, client: await tokenClient(email) };
  }

  async function makeChild(accountId: string, name: string): Promise<string> {
    const { data, error } = await adminClient()
      .from('child_profiles')
      .insert({ account_id: accountId, display_name: name })
      .select('id')
      .single();
    if (error) throw new Error(`child: ${error.message}`);
    return String(data!['id']);
  }

  /** A prof awards with their OWN token — the path /admin/jetons/ takes. */
  async function award(child: string, points: number, reason: string): Promise<string> {
    const { data, error } = await prof.client
      .from('point_awards')
      .insert([{ child_id: child, points, reason, awarded_by: prof.id }])
      .select('id')
      .single();
    expect(error, `a prof could not award jetons: ${error?.message}`).toBeNull();
    return String(data!['id']);
  }

  async function notices(client: SupabaseClient): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.rpc('award_notices');
    if (error) throw new Error(`award_notices: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  }

  async function seen(client: SupabaseClient, child: string, through: string) {
    const { data, error } = await client.rpc('mark_awards_seen', { child, through_award: through });
    if (error) throw new Error(`mark_awards_seen: ${error.message}`);
    return (Array.isArray(data) ? data[0] : data) as { ok: boolean; code: string };
  }

  async function balanceOf(client: SupabaseClient, child: string): Promise<number | null> {
    const { data, error } = await client.rpc('jeton_balances');
    if (error) throw new Error(`jeton_balances: ${error.message}`);
    const mine = (data ?? []).find((r: Record<string, unknown>) => r['child_id'] === child);
    return mine ? Number(mine['balance']) : null;
  }

  test.beforeAll(async () => {
    const s = await makeAccount('student');
    student = { ...s, child: await makeChild(s.id, 'notice-élève') };
    const o = await makeAccount('other');
    other = { ...o, child: await makeChild(o.id, 'notice-autre') };
    prof = await makeAccount('prof', 'Prof Karim e2e', 'prof');
  });

  test.afterAll(async () => {
    for (const id of users) await deleteUser(id);
  });

  test('a new child starts with nothing unread', async () => {
    expect(await notices(student.client)).toEqual([]);
  });

  test('an award is unread for its own family only, with its reason and its prof', async () => {
    await award(student.child, 7, 'e2e — belle ouverture');

    const mine = await notices(student.client);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      child_id: student.child,
      child_name: 'notice-élève',
      jetons: 7,
      reason: 'e2e — belle ouverture',
      given_by: 'Prof Karim e2e',
    });

    /* Another family sees nothing of it. */
    expect(await notices(other.client)).toEqual([]);
    /* ⚠️ STAFF GET NO EXEMPTION: a prof is shown their OWN children's news,
       like any parent, never the room's. */
    expect(await notices(prof.client)).toEqual([]);
  });

  test('a signed-out caller cannot ask at all', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv()!;
    const anon = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc('award_notices');
    expect(error, 'anon was allowed to call award_notices()').not.toBeNull();
  });

  test('nobody but the owning account can mark it read — not another family, not a prof', async () => {
    const [row] = await notices(student.client);
    const id = String(row!['award_id']);

    expect((await seen(other.client, student.child, id)).code).toBe('forbidden');
    expect((await seen(prof.client, student.child, id)).code).toBe('forbidden');
    /* An award that is not this child's cannot move this child's cursor. */
    const theirs = await award(other.child, 1, 'e2e — pour l’autre');
    expect((await seen(student.client, student.child, theirs)).code).toBe('no_award');

    expect(await notices(student.client)).toHaveLength(1);
  });

  test('reading it clears it and leaves the balance exactly where it was', async () => {
    const before = await balanceOf(student.client, student.child);
    expect(before).toBe(7);

    const [row] = await notices(student.client);
    expect(await seen(student.client, student.child, String(row!['award_id']))).toEqual({
      ok: true,
      code: 'ok',
    });

    expect(await notices(student.client)).toEqual([]);
    /* ⚠️ NOTHING STORED CAN DISAGREE WITH THE BALANCE — the cursor is not an input to it. */
    expect(await balanceOf(student.client, student.child)).toBe(before);
  });

  test('the cursor only moves forward, and news after it is news again', async () => {
    const older = await award(student.child, 2, 'e2e — présent à l’heure');
    const newer = await award(student.child, 3, 'e2e — a aidé un camarade');
    expect((await notices(student.client)).map((r) => r['award_id'])).toEqual([newer, older]);

    expect((await seen(student.client, student.child, newer)).code).toBe('ok');
    expect(await notices(student.client)).toEqual([]);

    /* A stale tab acknowledging the OLDER one must not re-open the newer. */
    expect((await seen(student.client, student.child, older)).code).toBe('ok');
    expect(await notices(student.client)).toEqual([]);

    const later = await award(student.child, 4, 'e2e — mat en deux trouvé');
    expect((await notices(student.client)).map((r) => r['award_id'])).toEqual([later]);
  });

  test('an award a prof takes back leaves the notice as it leaves the balance', async () => {
    const [row] = await notices(student.client);
    const id = String(row!['award_id']);
    const before = await balanceOf(student.client, student.child);

    const { error } = await prof.client.from('point_awards').delete().eq('id', id);
    expect(error, `the prof could not undo: ${error?.message}`).toBeNull();

    expect(await notices(student.client)).toEqual([]);
    expect(await balanceOf(student.client, student.child)).toBe((before ?? 0) - 4);
  });

  test('an award with no named giver still arrives — the page supplies "le club"', async () => {
    const { error } = await adminClient()
      .from('point_awards')
      .insert({ child_id: student.child, points: 1, reason: 'e2e — sans nom' });
    expect(error).toBeNull();
    const [row] = await notices(student.client);
    expect(row).toMatchObject({ jetons: 1, given_by: null });
  });
});

/* ── What a reader sees ─────────────────────────────────────────────────── */

test.describe('the award notice, on the page', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);
  test.skip(!isSupabaseConfigured(), 'no .env.test — see .env.test.example (visible skip)');
  test.describe.configure({ mode: 'serial' });

  const created: string[] = [];
  let profId = '';

  test.beforeAll(async () => {
    const p = await createConfirmedUser({
      email: e2eEmail('award-ui-prof'),
      displayName: 'Prof Nadia e2e',
      role: 'prof',
    });
    created.push(p.id);
    profId = p.id;
  });

  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  async function signIn(page: Page, label: string, displayName: string): Promise<string> {
    const email = e2eEmail(label);
    const user = await createConfirmedUser({ email, displayName });
    created.push(user.id);
    await followMagicLink(page, email);
    await reachAccountPage(page);
    return user.id;
  }

  /** The child onboarding produced — read back, never seeded (booking-ui's lesson). */
  async function firstChild(accountId: string): Promise<{ id: string; name: string }> {
    for (let i = 0; i < 20; i += 1) {
      const { data } = await adminClient()
        .from('child_profiles')
        .select('id,display_name')
        .eq('account_id', accountId)
        .order('created_at')
        .limit(1);
      if (data?.[0]) return { id: String(data[0]['id']), name: String(data[0]['display_name']) };
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('no child profile was ever created');
  }

  async function award(childId: string, points: number, reason: string) {
    const { error } = await adminClient()
      .from('point_awards')
      .insert({ child_id: childId, points, reason, awarded_by: profId });
    if (error) throw new Error(`award failed: ${error.message}`);
  }

  /** Load a page and wait for the notice's own read to come back. */
  async function visit(page: Page, path: string) {
    const answered = page.waitForResponse((r) => r.url().includes('/rpc/award_notices'), {
      timeout: 20_000,
    });
    await page.goto(path);
    await answered;
  }

  test('home shows it at both sides of 768px, with amount, reason and prof — then "Compris" clears it everywhere', async ({ page }) => {
    const user = await signIn(page, 'award-ui-member', 'Salma');
    const child = await firstChild(user);
    await award(child.id, 7, 'Belle ouverture au club');

    /* ── A phone: above the dashboard, and inside the screen width. ── */
    await page.setViewportSize({ width: 360, height: 780 });
    await visit(page, '/');
    const notice = page.getByTestId('award-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Jetons reçus');
    await expect(notice).toContainText('Nouveau');
    await expect(notice).toContainText(`Pour ${child.name}`);
    const row = notice.getByTestId('award-notice-item');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('+7 jetons');
    await expect(row).toContainText('« Belle ouverture au club »');
    await expect(row).toContainText('Donné par Prof Nadia e2e');

    const noticeBox = await notice.boundingBox();
    const dashBox = await page.getByTestId('dash-primary').boundingBox();
    expect(noticeBox!.y, 'the notice sits above the dashboard').toBeLessThan(dashBox!.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `home scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);

    /* ── A laptop: the same notice, no mobile-only surface (CF36). ── */
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(notice).toBeVisible();
    await expect(notice.getByTestId('award-notice-shop')).toHaveAttribute('href', '/boutique/');

    /* ── And on /boutique/, above the balance, before anything is read. ── */
    await visit(page, '/boutique/');
    const shopNotice = page.getByTestId('award-notice');
    await expect(shopNotice).toBeVisible();
    await expect(shopNotice).toContainText('Belle ouverture au club');
    await expect(shopNotice.getByTestId('award-notice-shop')).toHaveCount(0);

    await shopNotice.getByTestId('award-notice-read').click();
    await expect(shopNotice.locator('[data-award-message]')).toHaveText('C’est noté.');
    await expect(shopNotice.getByTestId('award-notice-group')).toHaveCount(0);
    await expect(shopNotice.locator('[data-award-badge]')).toBeHidden();

    /* Read on one page is read on every page — the cursor is on the child. */
    await visit(page, '/');
    await expect(page.getByTestId('award-notice')).toBeHidden();
  });

  test('EN names the prof and the reason too', async ({ page }) => {
    const user = await signIn(page, 'award-ui-en', 'Omar');
    const child = await firstChild(user);
    await award(child.id, 1, 'Great endgame');

    await visit(page, '/en/');
    const notice = page.getByTestId('award-notice');
    await expect(notice).toContainText('Tokens received');
    await expect(notice).toContainText('+1 token');
    await expect(notice).toContainText('“Great endgame”');
    await expect(notice).toContainText('Given by Prof Nadia e2e');
    await expect(notice.getByTestId('award-notice-read')).toHaveAccessibleName(
      `Got it — mark ${child.name}’s tokens as read`,
    );
  });

  test('the notice has no axe violations, in the state a reader meets it', async ({ page }) => {
    const user = await signIn(page, 'award-ui-axe', 'Ines');
    const child = await firstChild(user);
    await award(child.id, 3, 'A aidé un camarade');
    for (const path of ['/', '/boutique/']) {
      await visit(page, path);
      await expect(page.getByTestId('award-notice')).toBeVisible();
      await settleReveals(page);
      const results = await new AxeBuilder({ page }).include('[data-award-notice]').analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, `${path}\n${summary.join('\n')}`).toEqual([]);
    }
  });
});

test.describe('the award notice, signed out', () => {
  test.skip(!AUTH_ENABLED, AUTH_OFF_REASON);

  for (const path of ['/', '/en/', '/boutique/']) {
    test(`${path} keeps it hidden and asks Supabase nothing`, async ({ page }) => {
      const asked: string[] = [];
      page.on('request', (r) => {
        if (isSupabaseRequest(r.url())) asked.push(r.url());
      });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('award-notice')).toBeHidden();
      expect(asked, asked.join('\n')).toEqual([]);
    });
  }
});

test.describe('the award notice with accounts OFF', () => {
  test.skip(AUTH_ENABLED, AUTH_ON_REASON);

  for (const path of ['/', '/boutique/']) {
    test(`${path} does not build it at all (Critical Feature 18)`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('[data-award-notice]')).toHaveCount(0);
    });
  }
});
