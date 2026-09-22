/**
 * The shop — the member's side (0016).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ `redeem()` IN POSTGRES IS THE SECURITY. NOTHING HERE IS.
 *
 * The balance is `jeton_balances()`, the price comes from `shop_items`, and the
 * only writer of an order is a SECURITY DEFINER function that locks the child
 * and recomputes inside the lock. What is here decides what to DRAW, and a
 * student who bypasses this file entirely spends exactly what they could have
 * spent through it — `shop.spec.ts` proves that with a real token.
 *
 * ⚠️ JETONS ARE NOT POINTS. Points are the rank, derived from client-written
 * progress and therefore declarative. Jetons come ONLY from `point_awards`,
 * which a student cannot write. Nothing in this file may read progress.
 *
 * ⚠️ `@lib/supabase` IS IMPORTED LAZILY, like `booking.ts`: `/boutique/` is a
 * public page and a signed-out visitor must make ZERO Supabase requests.
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠️ MIRRORS OF THE RULE IN `redeem()`, FOR DISPLAY ONLY. The database computes
 * `floor(price_mad * 25 / 100)` itself and refuses anything above it. If these
 * ever disagree the database wins and the reader sees `discount_too_large` —
 * a sentence, not a silence. `shop.spec.ts` pins the numbers.
 */
export const DISCOUNT_CAP = 0.25;
export const MAD_PER_JETON = 1;

/** The most jetons a WhatsApp order may put toward a price in dirhams. */
export function discountCap(priceMad: number): number {
  if (!Number.isFinite(priceMad) || priceMad <= 0) return 0;
  return Math.floor((priceMad * 25) / 100);
}

/** What a WhatsApp order will actually take off: capped, and never more than is held. */
export function discountFor(priceMad: number, balance: number): number {
  return Math.max(0, Math.min(discountCap(priceMad), Math.floor(balance / MAD_PER_JETON)));
}

/**
 * Every outcome the shop functions return.
 *
 * ⚠️ A CODE NOT IN THIS LIST RENDERS AS THE GENERIC REFUSAL, NEVER AS SILENCE
 * (Critical Feature 74).
 */
export const SHOP_CODES = [
  'ok',
  'insufficient',
  'out_of_stock',
  'unknown_item',
  'path_not_allowed',
  'discount_too_large',
  'forbidden',
  'no_order',
  'already_handed_over',
] as const;

export type ShopCode = (typeof SHOP_CODES)[number] | 'error';

export type OrderPath = 'jetons' | 'whatsapp';
export type OrderStatus = 'pending' | 'handed_over' | 'cancelled';

export interface Balance {
  readonly childId: string;
  readonly earned: number;
  readonly spent: number;
  readonly balance: number;
}

export interface LiveItem {
  readonly slug: string;
  readonly priceJetons: number | null;
  readonly priceMad: number | null;
  readonly allowJetons: boolean;
  readonly allowWhatsapp: boolean;
  readonly inStock: boolean;
}

export interface Order {
  readonly id: string;
  readonly childId: string;
  readonly itemSlug: string;
  readonly path: OrderPath;
  readonly jetons: number;
  readonly priceMad: number | null;
  readonly status: OrderStatus;
  readonly createdAt: string;
}

export interface RedeemResult {
  readonly ok: boolean;
  readonly code: ShopCode;
  readonly orderId: string | null;
  readonly balance: number | null;
}

function asCode(raw: unknown): ShopCode {
  const s = typeof raw === 'string' ? raw : '';
  return (SHOP_CODES as readonly string[]).includes(s) ? (s as ShopCode) : 'error';
}

function first(data: unknown): Record<string, unknown> | undefined {
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
}

export function asOrder(row: Record<string, unknown>): Order {
  const status = String(row['status']);
  return {
    id: String(row['id']),
    childId: String(row['child_id']),
    itemSlug: String(row['item_slug']),
    path: row['path'] === 'whatsapp' ? 'whatsapp' : 'jetons',
    jetons: Number(row['jetons'] ?? 0),
    priceMad: row['price_mad'] == null ? null : Number(row['price_mad']),
    status: status === 'handed_over' || status === 'cancelled' ? status : 'pending',
    createdAt: String(row['created_at'] ?? ''),
  };
}

/**
 * Balances for the account's own children.
 *
 * ⚠️ NULL MEANS "COULD NOT ASK", NEVER ZERO. A dead Supabase or a database
 * without 0016 must not print "0 jetons" to a child who has thirty — the page
 * prints a dash instead (Critical Feature 30's rule).
 */
export async function loadBalances(): Promise<Balance[] | null> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('jeton_balances');
    if (error) return null;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      childId: String(r['child_id']),
      earned: Number(r['earned'] ?? 0),
      spent: Number(r['spent'] ?? 0),
      balance: Number(r['balance'] ?? 0),
    }));
  } catch {
    return null;
  }
}

/** Live prices and stock, as the database will enforce them. */
export async function loadLiveItems(): Promise<LiveItem[] | null> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('shop_items')
      .select('slug,price_jetons,price_mad,allow_jetons,allow_whatsapp,in_stock');
    if (error) return null;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      slug: String(r['slug']),
      priceJetons: r['price_jetons'] == null ? null : Number(r['price_jetons']),
      priceMad: r['price_mad'] == null ? null : Number(r['price_mad']),
      allowJetons: r['allow_jetons'] === true,
      allowWhatsapp: r['allow_whatsapp'] === true,
      inStock: r['in_stock'] === true,
    }));
  } catch {
    return null;
  }
}

/** This account's orders, newest first. RLS limits it to their own children. */
export async function loadMyOrders(): Promise<Order[] | null> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('redemptions')
      .select('id,child_id,item_slug,path,jetons,price_mad,status,created_at')
      .order('created_at', { ascending: false });
    if (error) return null;
    return (data ?? []).map(asOrder);
  } catch {
    return null;
  }
}

export async function redeem(
  childId: string,
  itemSlug: string,
  via: OrderPath,
  discount?: number,
): Promise<RedeemResult> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('redeem', {
      child: childId,
      item: itemSlug,
      via,
      ...(via === 'whatsapp' ? { discount: discount ?? 0 } : {}),
    });
    if (error) return { ok: false, code: 'error', orderId: null, balance: null };
    const row = first(data);
    return {
      ok: row?.['ok'] === true,
      code: asCode(row?.['code']),
      orderId: row?.['redemption_id'] ? String(row['redemption_id']) : null,
      balance: row?.['balance'] == null ? null : Number(row['balance']),
    };
  } catch {
    return { ok: false, code: 'error', orderId: null, balance: null };
  }
}

export async function cancelOrder(orderId: string): Promise<ShopCode> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('cancel_redemption', { redemption: orderId });
    if (error) return 'error';
    return asCode(first(data)?.['code']);
  } catch {
    return 'error';
  }
}

/** A short, human-readable order reference — the first block of the UUID. */
export function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}
