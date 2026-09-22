/**
 * The shop's member controls — painting only (0016).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ SPLIT FROM `shop.ts` ON PURPOSE, like `booking-ui.ts` from `booking.ts`:
 * that module is the data layer and touches no DOM; this one touches the DOM
 * and invents no rule. What a child can spend is `jeton_balances()`, what an
 * item costs is `shop_items`, and whether an order goes through is `redeem()`.
 *
 * ⚠️ IT DOES NOTHING AT ALL FOR A SIGNED-OUT READER. `hasStoredSession()` reads
 * `localStorage` and imports nothing, so the Supabase client is never built
 * unless a token exists (the guest zero-request rule).
 *
 * ⚠️ EVERY PAINT IS IDEMPOTENT. An unconditional write from a handler is what
 * killed the admin "Créer" button on WebKit; `setText` and `setHidden` write
 * only when the value differs.
 *
 * ⚠️ THE WHATSAPP MESSAGE IS A LINK THE READER TAPS, NOT A `window.open()`.
 * The order must exist before the message names it, so the link appears after
 * an `await` — and a popup opened after an await is exactly what a phone's
 * browser blocks. A second, visible tap is honest; a silently blocked window
 * is an order nobody was told about.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { hasStoredSession } from '@lib/booking';
import {
  cancelOrder,
  discountFor,
  loadBalances,
  loadLiveItems,
  loadMyOrders,
  orderRef,
  redeem,
  type Balance,
  type LiveItem,
  type Order,
  type ShopCode,
} from '@lib/shop';

interface Child {
  readonly id: string;
  readonly name: string;
}

interface Data {
  readonly strings: Record<string, string>;
  readonly names: Record<string, string>;
  readonly whatsappBase: string;
}

interface State {
  readonly children: readonly Child[] | null;
  readonly balances: readonly Balance[] | null;
  readonly orders: readonly Order[] | null;
  readonly items: readonly LiveItem[] | null;
}

let data: Data = { strings: {}, names: {}, whatsappBase: '' };
let selected: string | null = null;
/** The last WhatsApp order's link, kept across repaints — see the header. */
let whatsappLink: string | null = null;
let generation = 0;
/** The last state painted — what a picker change repaints from. */
let current: State = { children: null, balances: null, orders: null, items: null };

function setText(el: Element | null, value: string): void {
  if (el && el.textContent !== value) el.textContent = value;
}

function setHidden(el: Element | null, hidden: boolean): void {
  if (el instanceof HTMLElement && el.hidden !== hidden) el.hidden = hidden;
}

function s(key: string, n?: number | string): string {
  const raw = data.strings[key] ?? '';
  return n === undefined ? raw : raw.replace('{n}', String(n));
}

function codeMessage(code: ShopCode): string {
  /* ⚠️ AN UNKNOWN CODE IS THE GENERIC REFUSAL, NEVER SILENCE (CF74). */
  return data.strings[`shop.code.${code}`] ?? s('shop.code.error');
}

async function loadState(itemPage: boolean): Promise<State> {
  const [children, balances, orders, items] = await Promise.all([
    ownChildren(),
    loadBalances(),
    loadMyOrders(),
    itemPage ? loadLiveItems() : Promise.resolve(null),
  ]);
  return { children, balances, orders, items };
}

/**
 * ⚠️ THROUGH `fetchChildren()`, NEVER A SECOND QUERY — it owns the column
 * ladder and the rule that a failed read is null, not an empty account.
 */
async function ownChildren(): Promise<Child[] | null> {
  try {
    const { getSupabase, getUser } = await import('@lib/supabase');
    const user = await getUser();
    if (!user) return null;
    const supabase = await getSupabase();
    const { fetchChildren, rememberedChild } = await import('@lib/child');
    const kids = await fetchChildren(supabase, user.id);
    if (kids && selected === null) selected = rememberedChild(user.id)?.id ?? null;
    return kids ? kids.map((c) => ({ id: c.id, name: c.name })) : null;
  } catch {
    return null;
  }
}

export async function renderShop(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-shop]');
  if (!root) return;

  const bag = document.querySelector('[data-shop-data]');
  try {
    if (bag?.textContent) data = JSON.parse(bag.textContent) as Data;
  } catch {
    /* Strings missing: the codes still fall back to the generic refusal. */
  }

  /* ⚠️ THE GUEST GATE. No token, no import, no request. */
  if (!hasStoredSession()) return;

  const itemPage = document.querySelector('[data-shop-action]') !== null;
  const mine = ++generation;
  const state = await loadState(itemPage);
  if (mine !== generation) return;
  paint(root, state);

  const picker = root.querySelector<HTMLSelectElement>('[data-shop-child]');
  picker?.addEventListener('change', () => {
    selected = picker.value;
    whatsappLink = null;
    paint(root, current);
  });
}

/** Re-read everything after a write — the database is the truth. */
async function refresh(root: HTMLElement, message: string): Promise<void> {
  const mine = ++generation;
  const state = await loadState(document.querySelector('[data-shop-action]') !== null);
  /* An older load landing last would repaint a stale state — drop it. */
  if (mine !== generation) return;
  paint(root, state);
  setText(root.querySelector('[data-shop-message]'), message);
}

function paint(root: HTMLElement, state: State): void {
  current = state;
  setHidden(root.querySelector('[data-shop-signedout]'), true);
  setHidden(root.querySelector('[data-shop-live]'), false);

  const children = state.children ?? [];
  if (selected === null || !children.some((c) => c.id === selected)) {
    selected = children[0]?.id ?? null;
  }
  const child = children.find((c) => c.id === selected) ?? null;

  setHidden(root.querySelector('[data-shop-nochildren]'), !(state.children && children.length === 0));

  const picker = root.querySelector<HTMLSelectElement>('[data-shop-child]');
  setHidden(root.querySelector('[data-shop-picker]'), children.length < 2);
  if (picker && children.length > 1) {
    const wanted = children.map((c) => `${c.id}:${c.name}`).join('|');
    if (picker.dataset['options'] !== wanted) {
      picker.replaceChildren(
        ...children.map((c) => {
          const option = document.createElement('option');
          option.value = c.id;
          option.textContent = c.name;
          return option;
        }),
      );
      picker.dataset['options'] = wanted;
    }
    if (child && picker.value !== child.id) picker.value = child.id;
  }

  /* ⚠️ A DASH, NEVER A ZERO IT DID NOT COMPUTE (Critical Feature 30). */
  const balance = child ? state.balances?.find((b) => b.childId === child.id)?.balance ?? null : null;
  const known = state.balances !== null && child !== null;
  setText(root.querySelector('[data-shop-balance]'), known ? String(balance ?? 0) : '—');
  setText(
    root.querySelector('[data-shop-balance-unit]'),
    known && (balance ?? 0) === 1 ? s('shop.jeton') : s('shop.jetons'),
  );
  setText(root.querySelector('[data-shop-child-name]'), children.length === 1 && child ? `— ${child.name}` : '');

  paintOrders(root, state, children);

  for (const action of document.querySelectorAll<HTMLElement>('[data-shop-action]')) {
    paintAction(root, action, state, child, known ? balance ?? 0 : null);
  }
}

function paintOrders(root: HTMLElement, state: State, children: readonly Child[]): void {
  const wrap = root.querySelector('[data-shop-orders-wrap]');
  const list = root.querySelector<HTMLElement>('[data-shop-orders]');
  if (!list || state.orders === null) {
    setHidden(wrap, true);
    return;
  }
  setHidden(wrap, false);

  if (state.orders.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'shop-note';
    empty.textContent = s('shop.orders.empty');
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(
    ...state.orders.map((order) => {
      const row = document.createElement('li');
      row.className = 'shop-order';
      row.dataset['status'] = order.status;
      row.setAttribute('data-testid', 'shop-order');

      const what = document.createElement('span');
      what.className = 'shop-order-what';
      const who = children.length > 1 ? ` — ${children.find((c) => c.id === order.childId)?.name ?? ''}` : '';
      what.textContent = `${data.names[order.itemSlug] ?? order.itemSlug}${who}`;

      const cost = document.createElement('span');
      cost.className = 'shop-order-cost';
      cost.textContent = order.jetons > 0 ? s('shop.price.jetons', order.jetons) : '';

      const status = document.createElement('span');
      status.className = 'shop-order-status';
      status.textContent = `${s(`shop.status.${order.status}`)} · ${orderRef(order.id)}`;

      row.append(what, cost, status);

      if (order.status === 'pending') {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn-ghost shop-order-cancel';
        cancel.textContent = s('shop.cancel');
        cancel.setAttribute('aria-label', `${s('shop.cancel')} — ${what.textContent}`);
        cancel.addEventListener('click', async () => {
          if (cancel.disabled) return;
          cancel.disabled = true;
          setText(cancel, s('shop.cancelling'));
          const result = await cancelOrder(order.id);
          await refresh(root, codeMessage(result));
        });
        row.append(cancel);
      }
      return row;
    }),
  );
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'shop-note';
  p.textContent = text;
  return p;
}

function paintAction(
  root: HTMLElement,
  action: HTMLElement,
  state: State,
  child: Child | null,
  balance: number | null,
): void {
  const via = action.dataset['shopAction'] === 'whatsapp' ? 'whatsapp' : 'jetons';
  const slug = document.querySelector<HTMLElement>('[data-shop-item]')?.dataset['shopItem'] ?? '';
  const live = state.items?.find((i) => i.slug === slug) ?? null;

  if (!child) {
    action.replaceChildren();
    return;
  }

  /* ⚠️ NOT PUBLISHED, OR THIS PATH NOT OFFERED LIVE: say so, never a button the
     database will refuse. `state.items === null` (a failed read) falls through
     to the button — the function is the truth and will answer with a code. */
  if (state.items !== null) {
    if (!live || (via === 'jetons' ? !live.allowJetons : !live.allowWhatsapp)) {
      action.replaceChildren(note(s('shop.unavailable')));
      return;
    }
    if (!live.inStock) {
      action.replaceChildren(note(s('shop.outOfStock')));
      return;
    }
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-primary shop-button';
  const parts: Node[] = [];

  if (via === 'jetons') {
    const price = live?.priceJetons ?? Number(action.dataset['priceJetons'] ?? 0);
    button.textContent = s('shop.redeem', price);
    button.setAttribute('data-testid', 'shop-redeem');
    if (balance !== null && balance < price) {
      /* ⚠️ DISABLED WITH A REASON, NEVER A SILENT NO-OP. */
      button.disabled = true;
      parts.push(note(s('shop.short', price - balance)));
    }
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      setText(button, s('shop.redeeming'));
      const result = await redeem(child.id, slug, 'jetons');
      await refresh(root, codeMessage(result.code));
    });
  } else {
    const price = live?.priceMad ?? Number(action.dataset['priceMad'] ?? 0);
    const discount = balance === null ? 0 : discountFor(price, balance);
    parts.push(
      note(discount > 0 ? s('shop.whatsapp.discount', discount) : s('shop.whatsapp.noDiscount')),
    );
    button.textContent = s('shop.whatsapp.order');
    button.setAttribute('data-testid', 'shop-whatsapp-order');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      setText(button, s('shop.redeeming'));
      const result = await redeem(child.id, slug, 'whatsapp', discount);
      if (result.ok && result.orderId) {
        const text = s('shop.whatsapp.message')
          .replace('{item}', data.names[slug] ?? slug)
          .replace('{child}', child.name)
          .replace('{price}', String(price))
          .replace('{discount}', String(discount))
          .replace('{rest}', String(price - discount))
          .replace('{ref}', orderRef(result.orderId));
        whatsappLink = `${data.whatsappBase}${encodeURIComponent(text)}`;
      }
      await refresh(root, codeMessage(result.code));
    });
  }

  /* After a WhatsApp order the only next step is sending the message; a second
     "Commander" button beside it would make a second order one tap away. */
  const nodes: Node[] = via === 'whatsapp' && whatsappLink ? [] : [button, ...parts];
  if (via === 'whatsapp' && whatsappLink) {
    const link = document.createElement('a');
    link.className = 'btn-primary shop-whatsapp-send';
    link.href = whatsappLink;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = s('shop.whatsapp.send');
    link.setAttribute('data-testid', 'shop-whatsapp-send');
    nodes.push(link);
  }
  action.replaceChildren(...nodes);
}
