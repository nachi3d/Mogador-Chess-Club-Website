import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './env';
import { adminClient, createConfirmedUser, deleteUser, e2eEmail } from './helpers/supabase-admin';
import { discountCap, MAD_PER_JETON, DISCOUNT_CAP } from '../../src/lib/shop';

/**
 * The shop's balance (0016) — THE LIVE PROOF that fake progress buys nothing.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ EVERY CLAIM HERE IS MADE WITH THE STUDENT'S OWN TOKEN, AGAINST THE REAL
 * DATABASE. The threat is a student with a console and a PostgREST URL; a spec
 * that clicked through `/boutique/` would stay green while the hole was open.
 *
 * ⚠️ THE FAKE PROGRESS IS WRITTEN, AND ASSERTED WRITTEN, BEFORE THE BALANCE IS
 * READ. A proof that "fake progress does not raise the balance" is worthless
 * if the fake progress was quietly refused — it would then prove nothing about
 * what the balance is computed from. So the student marks every real exercise
 * key solved and plays forty "wins", the rows are counted by the service role,
 * and only then is the balance asked for.
 *
 * ⚠️ THE CONCURRENCY TEST CANNOT FORCE AN INTERLEAVING — no client can — but
 * it asserts the invariant that matters: however six overlapping redemptions
 * land, the database never holds more spending than the jetons that exist.
 * Remove the lock in `redeem()` and it fails.
 * ═════════════════════════════════════════════════════════════════════════
 */

/* ── The display mirror, with no database ─────────────────────────────────── */

test.describe('the discount cap is arithmetic before it is a rule', () => {
  test('25% of the dirham price, one jeton per dirham, rounded down', () => {
    expect(DISCOUNT_CAP).toBe(0.25);
    expect(MAD_PER_JETON).toBe(1);
    expect(discountCap(100)).toBe(25);
    expect(discountCap(150)).toBe(37);
    expect(discountCap(3)).toBe(0);
  });
});

/* ── The database, with real clients ─────────────────────────────────────── */

const EXERCISE_KEYS = readdirSync(join(process.cwd(), 'src/content/exercices'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => String(JSON.parse(readFileSync(join(process.cwd(), 'src/content/exercices', f), 'utf8'))['slug']));

const ITEM = 'e2e-shop-porte-cles';
const PRICEY = 'e2e-shop-figurine';
/**
 * ⚠️ `admin_publish_shop()` WITHDRAWS EVERY ITEM ITS PAYLOAD LEAVES OUT — that
 * is the feature. `shop-ui.spec.ts` may be running in another worker against
 * the same project with the fixture item seeded, so every publish here carries
 * that row unchanged; otherwise this file would mark it out of stock mid-test.
 */
const FIXTURE_ROW = {
  slug: 'fixture-porte-cles',
  price_jetons: 10,
  price_mad: 40,
  allow_jetons: true,
  allow_whatsapp: true,
};

test.describe('jetons against the real database', () => {
  test.skip(!isSupabaseConfigured(), 'no .env.test — visible skip, never a silent pass');
  test.describe.configure({ mode: 'serial' });

  const users: string[] = [];
  let student: { id: string; client: SupabaseClient; child: string };
  let other: { id: string; client: SupabaseClient; child: string };
  let prof: { id: string; client: SupabaseClient };
  let admin: { id: string; client: SupabaseClient };

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

  async function makeAccount(tag: string, role?: 'prof' | 'admin') {
    const email = e2eEmail(`shop-${tag}`);
    const user = await createConfirmedUser({ email, ...(role ? { role } : {}) });
    users.push(user.id);
    return { id: user.id, client: await tokenClient(email) };
  }

  async function makeChild(accountId: string, name: string): Promise<string> {
    const { data } = await adminClient()
      .from('child_profiles')
      .insert({ account_id: accountId, display_name: name })
      .select('id')
      .single();
    return String(data!['id']);
  }

  const row = (res: { data: unknown }) =>
    (Array.isArray(res.data) ? res.data[0] : res.data) as Record<string, unknown> | null;
  const code = (res: { data: unknown }) => row(res)?.['code'] as string | undefined;

  async function balanceOf(client: SupabaseClient, child: string): Promise<number | null> {
    const { data, error } = await client.rpc('jeton_balances');
    if (error) throw new Error(`jeton_balances: ${error.message}`);
    const mine = (data ?? []).find((r: Record<string, unknown>) => r['child_id'] === child);
    return mine ? Number(mine['balance']) : null;
  }

  async function award(child: string, points: number) {
    const { error } = await prof.client
      .from('point_awards')
      .insert([{ child_id: child, points, reason: 'e2e — belle séance', awarded_by: prof.id }]);
    expect(error, `a prof could not award jetons: ${error?.message}`).toBeNull();
  }

  test.beforeAll(async () => {
    const s = await makeAccount('student');
    student = { ...s, child: await makeChild(s.id, 'shop-élève') };
    const o = await makeAccount('other');
    other = { ...o, child: await makeChild(o.id, 'shop-autre') };
    prof = await makeAccount('prof', 'prof');
    admin = await makeAccount('admin', 'admin');

    /* Published by the admin through the real function, not seeded by the
       service role: publishing is part of what is being proved. */
    const { error } = await admin.client.rpc('admin_publish_shop', {
      items: [
        { slug: ITEM, price_jetons: 10, price_mad: null, allow_jetons: true, allow_whatsapp: false },
        { slug: PRICEY, price_jetons: null, price_mad: 100, allow_jetons: false, allow_whatsapp: true },
        FIXTURE_ROW,
      ],
    });
    expect(error, `admin could not publish: ${error?.message}`).toBeNull();
  });

  test.afterAll(async () => {
    const sb = adminClient();
    await sb.from('shop_items').delete().in('slug', [ITEM, PRICEY]);
    for (const id of users) await deleteUser(id);
  });

  test('⚠️ THE PROOF: a student who fakes every solve and forty wins can spend nothing', async () => {
    expect(EXERCISE_KEYS.length, 'no exercise keys found to fake').toBeGreaterThan(10);

    /* The fake progress, through the student's OWN token — exactly what a
       console and a PostgREST URL can do. */
    const now = new Date().toISOString();
    const { error: progressError } = await student.client.from('exercise_progress').upsert(
      EXERCISE_KEYS.map((slug) => ({
        child_id: student.child,
        exercise_slug: slug,
        kind: 'exercise',
        solved: true,
        attempts: 1,
        hint_used: false,
        solved_at: now,
      })),
      { onConflict: 'child_id,exercise_slug' },
    );
    expect(progressError, `the fake progress was refused: ${progressError?.message}`).toBeNull();

    const { error: gamesError } = await student.client.from('game_results').insert(
      Array.from({ length: 40 }, (_v, i) => ({
        child_id: student.child,
        id: `e2e-fake-win-${i}`,
        level: 'avance',
        outcome: 'win',
      })),
    );
    expect(gamesError, `the fake wins were refused: ${gamesError?.message}`).toBeNull();

    /* ⚠️ Asserted WRITTEN, by the service role — see the header. */
    const sb = adminClient();
    const { count: solved } = await sb
      .from('exercise_progress')
      .select('exercise_slug', { count: 'exact', head: true })
      .eq('child_id', student.child)
      .eq('solved', true);
    expect(solved).toBe(EXERCISE_KEYS.length);
    const { count: wins } = await sb
      .from('game_results')
      .select('id', { count: 'exact', head: true })
      .eq('child_id', student.child)
      .eq('outcome', 'win');
    expect(wins).toBe(40);

    /* And none of it is spendable. */
    expect(await balanceOf(student.client, student.child)).toBe(0);
    const attempt = await student.client.rpc('redeem', {
      child: student.child,
      item: ITEM,
      via: 'jetons',
    });
    expect(code(attempt)).toBe('insufficient');
    const { count: orders } = await sb
      .from('redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('child_id', student.child);
    expect(orders).toBe(0);
  });

  test('every direct write that would mint or fake spending power is refused', async () => {
    const c = student.client;

    /* Minting jetons directly: no insert policy for a student (0004). */
    const minted = await c
      .from('point_awards')
      .insert([{ child_id: student.child, points: 900, reason: 'moi', awarded_by: student.id }]);
    expect(minted.error, 'a student inserted their own jetons').not.toBeNull();

    /* A negative order to raise the balance: no insert grant at all (0016). */
    const negative = await c.from('redemptions').insert([
      { child_id: student.child, item_slug: ITEM, path: 'whatsapp', jetons: -500 },
    ]);
    expect(negative.error?.code, 'a student wrote a redemption directly').toBe('42501');

    /* Repricing an item to one jeton. */
    const repriced = await c.from('shop_items').update({ price_jetons: 1 }).eq('slug', ITEM);
    expect(repriced.error?.code, 'a student repriced an item').toBe('42501');

    /* The admin functions. */
    const publish = await c.rpc('admin_publish_shop', {
      items: [{ slug: ITEM, price_jetons: 1, allow_jetons: true }],
    });
    expect(publish.error, 'a student published the catalogue').not.toBeNull();
    const stock = await c.rpc('admin_set_stock', { item: ITEM, available: true });
    expect(stock.error, 'a student toggled stock').not.toBeNull();

    /* A negative discount is a refund by another name. */
    const refund = await c.rpc('redeem', {
      child: student.child,
      item: PRICEY,
      via: 'whatsapp',
      discount: -50,
    });
    expect(code(refund)).toBe('discount_too_large');

    /* And after all of it the price and the balance are what they were. */
    const { data: item } = await adminClient()
      .from('shop_items')
      .select('price_jetons')
      .eq('slug', ITEM)
      .single();
    expect(item!['price_jetons']).toBe(10);
    expect(await balanceOf(c, student.child)).toBe(0);
  });

  test('a prof’s award is spendable; spending is recorded, never subtracted', async () => {
    await award(student.child, 25);
    expect(await balanceOf(student.client, student.child)).toBe(25);

    const first = await student.client.rpc('redeem', { child: student.child, item: ITEM, via: 'jetons' });
    expect(code(first)).toBe('ok');
    expect(Number(row(first)?.['balance'])).toBe(15);

    const second = await student.client.rpc('redeem', { child: student.child, item: ITEM, via: 'jetons' });
    expect(code(second)).toBe('ok');
    const third = await student.client.rpc('redeem', { child: student.child, item: ITEM, via: 'jetons' });
    expect(code(third)).toBe('insufficient');

    /* ⚠️ The balance is the difference of two SUMS of rows — the award row is
       untouched, and the spending is two rows of its own. */
    const { data: awards } = await adminClient()
      .from('point_awards')
      .select('points')
      .eq('child_id', student.child);
    expect(awards!.map((a) => a['points'])).toEqual([25]);
    expect(await balanceOf(student.client, student.child)).toBe(5);

    /* The prof reads the same number the student does (one summation). */
    expect(await balanceOf(prof.client, student.child)).toBe(5);
  });

  test('six concurrent redemptions for three items’ worth of jetons leave exactly three', async () => {
    const child = await makeChild(student.id, 'shop-course');
    await award(child, 30);

    const settled = await Promise.all(
      Array.from({ length: 6 }, () =>
        student.client.rpc('redeem', { child, item: ITEM, via: 'jetons' }),
      ),
    );
    const codes = settled.map(code);
    expect(codes.filter((c) => c === 'ok')).toHaveLength(3);
    expect(codes.filter((c) => c === 'insufficient')).toHaveLength(3);

    /* ⚠️ The database is asked, not the responses. */
    const { count } = await adminClient()
      .from('redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('child_id', child)
      .neq('status', 'cancelled');
    expect(count).toBe(3);
    expect(await balanceOf(student.client, child)).toBe(0);
  });

  test('the WhatsApp discount is capped at 25% of the dirham price', async () => {
    const child = await makeChild(student.id, 'shop-remise');
    await award(child, 60);

    const over = await student.client.rpc('redeem', {
      child,
      item: PRICEY,
      via: 'whatsapp',
      discount: discountCap(100) + 1,
    });
    expect(code(over)).toBe('discount_too_large');

    const atCap = await student.client.rpc('redeem', {
      child,
      item: PRICEY,
      via: 'whatsapp',
      discount: discountCap(100),
    });
    expect(code(atCap)).toBe('ok');
    expect(await balanceOf(student.client, child)).toBe(60 - 25);

    /* A path the item does not offer is refused, not silently re-routed. */
    expect(code(await student.client.rpc('redeem', { child, item: PRICEY, via: 'jetons' }))).toBe(
      'path_not_allowed',
    );
  });

  test('another family’s child can be neither spent nor read', async () => {
    await award(other.child, 20);
    expect(
      code(await student.client.rpc('redeem', { child: other.child, item: ITEM, via: 'jetons' })),
    ).toBe('forbidden');
    /* jeton_balances() lists the caller's own children only. */
    expect(await balanceOf(student.client, other.child)).toBeNull();

    expect(code(await other.client.rpc('redeem', { child: other.child, item: ITEM, via: 'jetons' }))).toBe('ok');
    const { data: visible } = await student.client
      .from('redemptions')
      .select('id')
      .eq('child_id', other.child);
    expect(visible ?? []).toHaveLength(0);
  });

  test('a signed-out caller reaches none of it', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { loadE2EEnv } = await import('./env');
    const env = loadE2EEnv()!;
    const anon = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
    expect((await anon.rpc('jeton_balances')).error?.code).toBe('42501');
    expect((await anon.from('redemptions').select('id')).error?.code).toBe('42501');
    expect((await anon.from('shop_items').select('slug')).error?.code).toBe('42501');
  });

  test('stock, cancellation and handover', async () => {
    const child = await makeChild(student.id, 'shop-remise-main');
    await award(child, 20);

    /* Out of stock refuses; back in stock accepts. */
    expect((await admin.client.rpc('admin_set_stock', { item: ITEM, available: false })).error).toBeNull();
    expect(code(await student.client.rpc('redeem', { child, item: ITEM, via: 'jetons' }))).toBe(
      'out_of_stock',
    );
    expect((await admin.client.rpc('admin_set_stock', { item: ITEM, available: true })).error).toBeNull();

    const a = row(await student.client.rpc('redeem', { child, item: ITEM, via: 'jetons' }));
    const b = row(await student.client.rpc('redeem', { child, item: ITEM, via: 'jetons' }));
    expect(await balanceOf(student.client, child)).toBe(0);

    /* A member cancels a pending order and the jetons come back. */
    expect(code(await student.client.rpc('cancel_redemption', { redemption: a!['redemption_id'] }))).toBe('ok');
    expect(await balanceOf(student.client, child)).toBe(10);

    /* A prof cannot hand over; an admin can; a handed-over order no longer cancels. */
    expect(code(await prof.client.rpc('admin_hand_over', { redemption: b!['redemption_id'] }))).toBe('forbidden');
    expect(code(await admin.client.rpc('admin_hand_over', { redemption: b!['redemption_id'] }))).toBe('ok');
    expect(code(await student.client.rpc('cancel_redemption', { redemption: b!['redemption_id'] }))).toBe(
      'already_handed_over',
    );
    expect(await balanceOf(student.client, child)).toBe(10);

    /* An unknown item is a code, not an exception. */
    expect(code(await student.client.rpc('redeem', { child, item: 'e2e-shop-absent', via: 'jetons' }))).toBe(
      'unknown_item',
    );
  });

  test('publishing withdraws an item the catalogue no longer carries', async () => {
    const { error } = await admin.client.rpc('admin_publish_shop', {
      items: [{ slug: ITEM, price_jetons: 10, allow_jetons: true, allow_whatsapp: false }, FIXTURE_ROW],
    });
    expect(error).toBeNull();
    const { data } = await adminClient().from('shop_items').select('slug,in_stock').in('slug', [ITEM, PRICEY]);
    const bySlug = Object.fromEntries((data ?? []).map((r) => [r['slug'], r['in_stock']]));
    expect(bySlug[PRICEY], 'a withdrawn item stayed purchasable').toBe(false);
    expect(bySlug[ITEM]).toBe(true);
  });
});
