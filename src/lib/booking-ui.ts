/**
 * The booking controls on `/agenda/` — painting only.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ SPLIT FROM `booking.ts` ON PURPOSE. That module is the data layer and
 * touches no DOM; this one touches the DOM and invents no rule. The split is
 * what lets the cutoff arithmetic and the code mapping be tested without a
 * browser.
 *
 * ⚠️ IT MUST DO NOTHING AT ALL FOR A SIGNED-OUT READER. `/agenda/` is a public
 * page and Critical Feature 9 means an anonymous visitor makes no third-party
 * request. `hasStoredSession()` reads `localStorage` and imports nothing, so
 * the Supabase client is never even constructed unless a token exists.
 *
 * ⚠️ EVERY PAINT IS IDEMPOTENT. Writing to the DOM unconditionally from a
 * handler is what killed the admin "Créer" button on WebKit: a `change` fired
 * between `mousedown` and `mouseup` rewrote the element under the pointer and
 * the browser never synthesised the `click`. `setText` and `setHidden` below
 * write only when the value differs.
 * ═════════════════════════════════════════════════════════════════════════
 */
import {
  cancellable,
  createBooking,
  cancelBooking,
  hasStoredSession,
  loadAvailability,
  loadMyBookings,
  type Availability,
  type BookingCode,
  type MyBooking,
} from '@lib/booking';

/** ⚠️ Idempotent — see the header. */
function setText(el: Element | null, value: string): void {
  if (el && el.textContent !== value) el.textContent = value;
}

function setHidden(el: Element | null, hidden: boolean): void {
  if (el instanceof HTMLElement && el.hidden !== hidden) el.hidden = hidden;
}

/**
 * The strings, read off the page rather than duplicated here.
 *
 * ⚠️ THE PAGE IS RENDERED IN ONE LOCALE AND THIS FILE SHIPS TO BOTH. Importing
 * `@i18n/ui` into a client script would bundle both tables and still leave the
 * question of which one to use; instead the server writes what this script
 * needs into a `<script type="application/json">` block. One source of strings
 * (`ui.ts`), one locale resolved at build time, no second table.
 */
interface Strings {
  readonly [key: string]: string;
}

let strings: Strings = {};

function s(key: string, fallback = ''): string {
  return strings[key] ?? fallback;
}

function codeMessage(code: BookingCode): string {
  /* ⚠️ A CODE WITH NO STRING FALLS BACK TO THE GENERIC REFUSAL, NEVER TO
     SILENCE. If the database grows a code this build predates, the reader is
     told the booking did not go through — which is recoverable — rather than
     watching a button do nothing. */
  return s(`booking.code.${code}`, s('booking.code.error', ''));
}

interface Child {
  readonly id: string;
  readonly name: string;
}

/**
 * The account's own children.
 *
 * ⚠️ THROUGH `fetchChildren()`, NEVER A SECOND QUERY. That function owns the
 * column ladder (`is_self` is 0009 and an older database lacks it) and the
 * rule that a failed read returns null rather than an empty list — because
 * "no children" is what makes `resolveChild()` create a duplicate learner.
 * A local copy of this query would be a second place for both to be wrong.
 */
async function ownChildren(): Promise<Child[]> {
  try {
    const { getSupabase, getUser } = await import('@lib/supabase');
    const user = await getUser();
    if (!user) return [];
    const supabase = await getSupabase();
    const { fetchChildren } = await import('@lib/child');
    const kids = await fetchChildren(supabase, user.id);
    return (kids ?? []).map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
  }
}

export async function renderBooking(): Promise<void> {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-booking]'));
  if (panels.length === 0) return;

  const bag = document.querySelector('[data-booking-strings]');
  if (bag?.textContent) {
    try {
      strings = JSON.parse(bag.textContent) as Strings;
    } catch {
      strings = {};
    }
  }

  /* ⚠️ THE GUEST GATE. No token, no import, no request — the server-rendered
     sign-in invitation is already on screen and stays there. */
  if (!hasStoredSession()) return;

  /* Signed in but the roster has not arrived, or the account holds nobody:
     say so rather than rendering an empty list of buttons. */
  const [children, availability, bookings] = await Promise.all([
    ownChildren(),
    loadAvailability(),
    loadMyBookings(),
  ]);

  for (const panel of panels) {
    paintPanel(panel, children, availability, bookings);
  }
}

/**
 * ⚠️ A GENERATION COUNTER, BECAUSE TWO LOADS CAN BE IN FLIGHT AT ONCE.
 *
 * A reader who books and immediately cancels starts two refreshes; the older
 * one can land last and repaint a stale state. The admin register lost a
 * prof's taps to exactly this. Each panel keeps its own counter.
 */
const generation = new WeakMap<HTMLElement, number>();

function paintPanel(
  panel: HTMLElement,
  children: readonly Child[],
  availability: readonly Availability[],
  bookings: readonly MyBooking[],
): void {
  const sessionId = panel.dataset['sessionId'] ?? '';
  const startsAt = panel.dataset['startsAt'] ?? '';
  const avail = availability.find((a) => a.sessionId === sessionId) ?? null;

  const placesEl = panel.querySelector('[data-booking-places]');
  const signedOutEl = panel.querySelector('[data-booking-signedout]');
  const listEl = panel.querySelector<HTMLElement>('[data-booking-children]');
  const cutoffEl = panel.querySelector('[data-booking-cutoff]');
  const messageEl = panel.querySelector('[data-booking-message]');

  setHidden(signedOutEl, true);
  setHidden(listEl, false);

  /* The LIVE count replaces the baked capacity hint the server wrote. */
  if (avail && placesEl) {
    const left = avail.placesLeft;
    setText(
      placesEl,
      left <= 0
        ? s('booking.full', 'Complet')
        : `${left} ${left === 1 ? s('booking.places.one') : s('booking.places')}`,
    );
    placesEl.classList.toggle('booking-places-full', left <= 0);
  }

  if (!listEl) return;

  if (children.length === 0) {
    setText(listEl, '');
    const note = document.createElement('li');
    note.className = 'booking-state';
    note.textContent = s('booking.noChildren');
    listEl.replaceChildren(note);
    return;
  }

  const canCancel = cancellable(startsAt);
  setHidden(cutoffEl, false);

  const rows = children.map((child) => {
    const live = bookings.find(
      (b) => b.sessionId === sessionId && b.childId === child.id && b.status === 'confirmed',
    );
    return renderRow(panel, child, live ?? null, {
      sessionId,
      full: avail ? avail.placesLeft <= 0 : false,
      canCancel,
      messageEl,
    });
  });

  listEl.replaceChildren(...rows);
}

interface RowContext {
  readonly sessionId: string;
  readonly full: boolean;
  readonly canCancel: boolean;
  readonly messageEl: Element | null;
}

function renderRow(
  panel: HTMLElement,
  child: Child,
  live: MyBooking | null,
  ctx: RowContext,
): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'booking-child';
  row.dataset['childId'] = child.id;

  const name = document.createElement('span');
  name.className = 'booking-state';
  name.textContent = child.name;
  row.append(name);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'booking-button';

  if (live) {
    button.classList.add('booking-button-cancel');
    button.dataset['bookingCancel'] = live.id;
    button.textContent = s('booking.cancel');
    /* ⚠️ DISABLED WITH A REASON, NEVER A SILENT NO-OP. Past the cutoff the
       control says why in its own accessible name — the database refuses it
       too, which is the actual rule. */
    if (!ctx.canCancel) {
      button.disabled = true;
      button.title = s('booking.cutoffPassed');
      button.setAttribute('aria-label', `${child.name} — ${s('booking.cutoffPassed')}`);
    }
    const state = document.createElement('span');
    state.className = 'booking-state';
    state.textContent = s('booking.booked');
    row.append(state);
  } else {
    button.dataset['bookingCreate'] = child.id;
    button.textContent = ctx.full ? s('booking.full') : s('booking.book');
    if (ctx.full) {
      button.disabled = true;
      button.setAttribute('aria-label', `${child.name} — ${s('booking.full')}`);
    } else {
      button.setAttribute('aria-label', `${s('booking.book')} — ${child.name}`);
    }
  }

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    setText(button, live ? s('booking.cancelling') : s('booking.booking'));

    const result = live
      ? await cancelBooking(live.id)
      : await createBooking(child.id, ctx.sessionId);

    setText(ctx.messageEl, codeMessage(result.code));

    /* ⚠️ REFRESH FROM THE DATABASE RATHER THAN GUESSING. A refusal means this
       page was out of date, so the repair is to re-read — not to decrement a
       number the server never agreed to. This is the whole staleness answer:
       the baked page is a hint, the function is the truth, and the truth is
       what gets painted next. */
    const next = (generation.get(panel) ?? 0) + 1;
    generation.set(panel, next);
    const [children, availability, bookings] = await Promise.all([
      ownChildren(),
      loadAvailability(),
      loadMyBookings(),
    ]);
    /* An older load landing last would repaint a stale state — drop it. */
    if (generation.get(panel) !== next) return;

    paintPanel(panel, children, availability, bookings);
    /* Repainted after the refresh, because `paintPanel` rebuilds the row and
       the outcome must survive it. */
    setText(ctx.messageEl, codeMessage(result.code));
  });

  row.append(button);
  return row;
}
