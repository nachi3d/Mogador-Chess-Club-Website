/**
 * Session booking — the member's side.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ RLS AND `create_booking()` ARE THE SECURITY. NOTHING HERE IS.
 *
 * Every function below is a PostgREST call with the caller's own token. A
 * parent who bypasses this file entirely cannot overbook a session, cannot
 * book another family's child and cannot cancel a stranger's reservation —
 * because `bookings` has no insert policy at all and both writes go through
 * SECURITY DEFINER functions that check ownership themselves (migration 0013).
 * What is here decides what to DRAW.
 *
 * ⚠️ IT IMPORTS `@lib/supabase` LAZILY, LIKE EVERY OTHER MEMBER SURFACE. A
 * static import would put ~207 KB of Supabase into any page that touches
 * booking — and this one is reached from `/agenda/`, which a signed-out
 * visitor must load with ZERO requests to any Supabase origin. The dynamic
 * import is the whole reason that rule survives this feature.
 *
 * ⚠️ THE DATABASE RETURNS A CODE, NEVER A SENTENCE. The member surface is
 * FR/EN; `src/i18n/ui.ts` owns both wordings. A French string handed out by
 * Postgres could not be rendered for an English reader, and a code that no
 * page knows how to render is exactly the silent failure the brief forbids —
 * so `BOOKING_CODES` below is the closed set, and the i18n table is keyed by
 * it.
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * Every outcome `create_booking()` and `cancel_booking()` can return.
 *
 * ⚠️ A CODE THAT ARRIVES AND IS NOT IN THIS LIST IS RENDERED AS A GENERIC
 * REFUSAL, NEVER SWALLOWED. A silent no-op is the one behaviour the brief
 * rules out, and "the database grew a code the page predates" is precisely
 * when that would otherwise happen.
 */
export const BOOKING_CODES = [
  'ok',
  'full',
  'already',
  'past',
  'too_late',
  'not_published',
  'forbidden',
  'no_session',
  'no_booking',
] as const;

export type BookingCode = (typeof BOOKING_CODES)[number] | 'error';

export interface BookingResult {
  readonly ok: boolean;
  readonly code: BookingCode;
  readonly bookingId: string | null;
  readonly placesLeft: number;
}

export interface Availability {
  readonly sessionId: string;
  readonly capacity: number;
  readonly overbookMargin: number;
  readonly booked: number;
  readonly placesLeft: number;
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface MyBooking {
  readonly id: string;
  readonly sessionId: string;
  readonly childId: string;
  readonly status: BookingStatus;
  readonly cancelReason: string | null;
}

function asCode(raw: unknown): BookingCode {
  const s = typeof raw === 'string' ? raw : '';
  return (BOOKING_CODES as readonly string[]).includes(s) ? (s as BookingCode) : 'error';
}

/**
 * ⚠️ THE CUTOFF IS MIRRORED HERE AND ENFORCED IN POSTGRES.
 *
 * This is what greys the button out and says why; `cancel_booking()` is what
 * actually refuses. Both exist on purpose: a page rendered three hours ago
 * would otherwise offer a control that fails, and a client-only rule would be
 * no rule at all. If these two ever disagree the database wins, and the member
 * reads `too_late` — which is a sentence, not a silence.
 */
export const CANCEL_CUTOFF_MS = 2 * 60 * 60 * 1000;

export function cancellable(startsAt: string, now: number = Date.now()): boolean {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return false;
  return start - now > CANCEL_CUTOFF_MS;
}

/**
 * ⚠️⚠️ THE GUEST GATE, AND IT IS WHY `/agenda/` STILL MAKES ZERO REQUESTS.
 *
 * A signed-out visitor must cause NO request to any Supabase origin on a
 * public page. Importing `@lib/supabase` at all constructs a client that can
 * refresh a token on its own, so "ask Supabase whether we are signed in" is
 * already too late — the question is the violation.
 *
 * So this reads `localStorage` directly for supabase-js's own token key
 * (`sb-<ref>-auth-token`) and imports nothing. No stored token, no import, no
 * request, no booking UI — the reader sees the baked agenda and an invitation
 * to sign in.
 *
 * ⚠️ GUARDED AND FAILS SILENT, like every other `localStorage` read on this
 * site (Critical Feature 10): a browser that throws on storage access gets the
 * signed-out surface, never a broken page.
 */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return true;
    }
  } catch {
    /* Storage unavailable — treat as signed out. */
  }
  return false;
}

/** Places left, live, for every publicly visible session. Signed-in only. */
export async function loadAvailability(): Promise<Availability[]> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data } = await supabase.rpc('session_availability');
    return (data ?? []).map((row: Record<string, unknown>) => ({
      sessionId: String(row['session_id']),
      capacity: Number(row['capacity'] ?? 0),
      overbookMargin: Number(row['overbook_margin'] ?? 0),
      booked: Number(row['booked'] ?? 0),
      placesLeft: Number(row['places_left'] ?? 0),
    }));
  } catch {
    /* Fails silent and the surface shows the baked capacity instead: a member
       who cannot reach Supabase must still be able to read the agenda. */
    return [];
  }
}

/** This account's bookings, live. RLS limits it to their own children. */
export async function loadMyBookings(): Promise<MyBooking[]> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data } = await supabase
      .from('bookings')
      .select('id,session_id,child_id,status,cancel_reason');
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row['id']),
      sessionId: String(row['session_id']),
      childId: String(row['child_id']),
      status: row['status'] === 'cancelled' ? 'cancelled' : 'confirmed',
      cancelReason: row['cancel_reason'] ? String(row['cancel_reason']) : null,
    }));
  } catch {
    return [];
  }
}

export async function createBooking(childId: string, sessionId: string): Promise<BookingResult> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('create_booking', {
      child: childId,
      session: sessionId,
    });
    if (error) return { ok: false, code: 'error', bookingId: null, placesLeft: 0 };
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return {
      ok: row?.['ok'] === true,
      code: asCode(row?.['code']),
      bookingId: row?.['booking_id'] ? String(row['booking_id']) : null,
      placesLeft: Number(row?.['places_left'] ?? 0),
    };
  } catch {
    return { ok: false, code: 'error', bookingId: null, placesLeft: 0 };
  }
}

export async function cancelBooking(bookingId: string): Promise<BookingResult> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('cancel_booking', { booking: bookingId });
    if (error) return { ok: false, code: 'error', bookingId: null, placesLeft: 0 };
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return {
      ok: row?.['ok'] === true,
      code: asCode(row?.['code']),
      bookingId,
      placesLeft: 0,
    };
  } catch {
    return { ok: false, code: 'error', bookingId: null, placesLeft: 0 };
  }
}
