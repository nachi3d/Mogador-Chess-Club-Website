/**
 * The admin data layer — every query the staff surfaces make (v2-S4 part 2).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ RLS IS THE SECURITY. NOTHING HERE IS.
 *
 * Every function below is a plain PostgREST call with the caller's own token.
 * A student who runs them gets zero rows or `42501`, because
 * `child_profiles_select_staff`, `sessions_staff_all`, `attendance_staff_all`
 * and `point_awards_staff_all` decide that — not this file, and not the pages
 * that call it. `isStaff()` exists to decide what to DRAW; it is UX, and it is
 * not a gate. `role-separation.spec.ts` asserts the real boundary through
 * PostgREST with a real student token, never through these functions.
 *
 * ⚠️ THIS MODULE IS ONLY EVER IMPORTED FROM `/admin*`, which is emitted only
 * when `PUBLIC_AUTH_ENABLED` is `true`. It imports `@lib/supabase` statically,
 * which is safe HERE and would not be from a content route — see the guest
 * zero-request rule. Do not import it from anything a reader can reach.
 *
 * ⚠️ NO WRITE IN THIS FILE INVENTS A RULE. `points > 0`, the
 * required reason and the attendance statuses are CHECK constraints in
 * migrations 0004 and 0001. What is here is a mirror so the form can say no
 * before a round trip; the database is what actually refuses, and the spec
 * proves the database refuses even when this file is bypassed.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { getProfile, getSupabase } from '@lib/supabase';

export type SessionStatus = 'draft' | 'published' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'excuse';

export interface AdminChild {
  readonly id: string;
  readonly displayName: string;
  readonly accountId: string | null;
}

export interface AdminSession {
  readonly id: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly titleFr: string | null;
  readonly venue: string | null;
  readonly level: string | null;
  readonly status: SessionStatus;
  /** ⚠️ Carried so `/admin/seances` can fingerprint what the PUBLIC agenda
      would show. Every field the public card renders has to be here, or the
      staleness check tells a prof their edit shipped when it did not. */
  readonly noteFr: string | null;
  readonly noteEn: string | null;
  /**
   * Places, and the margin above them (0013).
   *
   * ⚠️ THEY ARE FINGERPRINTED, so a prof who changes capacity is told the
   * deployed agenda is stale — the public card shows the number.
   *
   * ⚠️ NULL MEANS "THIS DATABASE PREDATES 0013", not "no limit" and not zero.
   * The surface prints "—" for it; nothing computes with it.
   */
  readonly capacity: number | null;
  readonly overbookMargin: number | null;
  /**
   * ⚠️ A LABEL ON ROWS CREATED TOGETHER, NEVER A RULE ABOUT THEM (0012).
   *
   * It may be used to SELECT rows the prof is already looking at — publish
   * these twelve, cancel the rest of the term — and for nothing else. Null is
   * the common case and is not a lesser state.
   *
   * ⚠️ IT IS NOT IN `sessionFingerprint()`, and that is correct: the public
   * agenda card does not render it, so a change to it cannot make the deployed
   * site wrong. Anything the card DOES render goes in the fingerprint in the
   * same commit — see `@lib/agenda`.
   */
  readonly seriesId: string | null;
}

export interface AdminAward {
  readonly id: string;
  readonly childId: string;
  readonly points: number;
  readonly reason: string;
  readonly awardedAt: string;
}

export interface AdminProgressRow {
  readonly childId: string;
  readonly slug: string;
  readonly kind: string;
  readonly solved: boolean;
  readonly hintUsed: boolean;
  readonly attempts: number;
  readonly solvedAt: string | null;
}

export interface AdminGameRow {
  readonly childId: string;
  readonly level: string;
  readonly outcome: string;
}

/** Is the signed-in account staff? A UX question, never an authorisation. */
export async function isStaff(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.role === 'admin' || profile?.role === 'prof';
}

export async function currentRole(): Promise<string | null> {
  return (await getProfile())?.role ?? null;
}

/**
 * Is the signed-in account an ADMIN specifically?
 *
 * ⚠️ A DIFFERENT QUESTION FROM `isStaff()`, AND THE DIFFERENCE IS THE POINT. A
 * prof marks a register and reads the class; seeing every family's email address
 * and removing an account is not the same class of act. `/admin/comptes/` is the
 * one surface gated on this. Still UX — `is_admin_direct()` inside the two
 * functions below is what actually refuses.
 */
export async function isAdmin(): Promise<boolean> {
  return (await getProfile())?.role === 'admin';
}

/* ── accounts (admin only) ─────────────────────────────────────────────── */

export interface AdminAccount {
  readonly accountId: string;
  readonly email: string;
  readonly createdAt: string;
  /** Null when the magic link was never opened — the shape a junk sign-up has. */
  readonly confirmedAt: string | null;
  readonly lastSignInAt: string | null;
  readonly displayName: string | null;
  readonly role: string | null;
  readonly children: number;
  readonly solved: number;
}

/**
 * Every sign-up, newest first.
 *
 * ⚠️ THROUGH AN RPC BECAUSE `auth.users` IS NOT READABLE BY A CLIENT, and must
 * not become readable: the email address and the confirmation state live in the
 * `auth` schema, where `authenticated` holds no privilege at all. See migration
 * 0009 — the function raises for a non-admin rather than returning an empty
 * list, so "not allowed" and "no accounts" cannot be confused.
 */
export async function listAccounts(): Promise<AdminAccount[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('admin_list_accounts');
  if (error) return [];
  return (data ?? []).map((row: Record<string, unknown>) => ({
    accountId: String(row['account_id']),
    email: String(row['email'] ?? ''),
    createdAt: String(row['created_at'] ?? ''),
    confirmedAt: row['confirmed_at'] ? String(row['confirmed_at']) : null,
    lastSignInAt: row['last_sign_in_at'] ? String(row['last_sign_in_at']) : null,
    displayName: row['display_name'] ? String(row['display_name']) : null,
    role: row['role'] ? String(row['role']) : null,
    children: Number(row['children'] ?? 0),
    solved: Number(row['solved'] ?? 0),
  }));
}

/**
 * What the form may refuse before a round trip — a mirror of the CHECK
 * constraint and the guards inside `admin_delete_account()`, never the rule.
 */
export function validateDeletion(reason: string): string | null {
  if (reason.trim().length < 3) return 'Une raison est obligatoire — elle est journalisée.';
  return null;
}

/**
 * Erase another account, with a reason, as an admin.
 *
 * ⚠️ THIS IS NOT A SECOND ROUTE TO `delete_own_account()`. The function refuses
 * `auth.uid()`: an admin erasing themselves goes through `/compte/` and the
 * typed-word confirmation like everybody else, which is what keeps Critical
 * Feature 51's "the parameter list is the guarantee" true for the function that
 * rule is about.
 *
 * ⚠️ THE REASON IS AUDITED AND THE ACCOUNT IS NOT. `account_deletions` records
 * who acted, when and why — and holds no reference to the deleted account at
 * all, because CF51's "nothing is retained" binds a volunteer pressing the
 * button exactly as hard as it binds the parent.
 */
export async function deleteAccount(
  target: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = validateDeletion(reason);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('admin_delete_account', {
    target,
    reason: reason.trim(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface AccountDeletion {
  readonly id: string;
  readonly deletedAt: string;
  readonly reason: string;
}

/** The audit trail. Admin-only by policy, not by this function. */
export async function listDeletions(): Promise<AccountDeletion[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('account_deletions')
    .select('id,deleted_at,reason')
    .order('deleted_at', { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => ({
    id: String(row['id']),
    deletedAt: String(row['deleted_at'] ?? ''),
    reason: String(row['reason'] ?? ''),
  }));
}

/* ── the class ─────────────────────────────────────────────────────────── */

/**
 * Every learner, as CHILDREN.
 *
 * ⚠️ CHILDREN, NOT ACCOUNTS. A parent with three children is three rows here
 * and one row in `auth.users`. This is the whole reason 0005 landed before
 * these surfaces: built against "one account is one student", the class table,
 * the marker and the foreign key would all have had to be rewritten together.
 */
export async function listChildren(): Promise<AdminChild[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('child_profiles')
    .select('id,display_name,account_id')
    .order('display_name');
  return (data ?? []).map((row) => ({
    id: String(row['id']),
    displayName: String(row['display_name'] ?? ''),
    accountId: row['account_id'] ? String(row['account_id']) : null,
  }));
}

/**
 * Every progress row for the whole class, in ONE request.
 *
 * ⚠️ NOT ONE REQUEST PER CHILD. Twenty children on a phone on Essaouira mobile
 * data is twenty round trips before the table can be drawn, and the class list
 * is the first thing a prof opens. RLS filters the rows either way; the shape
 * of the query is a latency decision, not a security one.
 */
export async function listProgress(): Promise<AdminProgressRow[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('exercise_progress')
    .select('child_id,exercise_slug,kind,solved,hint_used,attempts,solved_at');
  return (data ?? []).map((row) => ({
    childId: String(row['child_id']),
    slug: String(row['exercise_slug']),
    kind: String(row['kind'] ?? 'exercise'),
    solved: row['solved'] === true,
    hintUsed: row['hint_used'] === true,
    attempts: Number(row['attempts'] ?? 0),
    solvedAt: typeof row['solved_at'] === 'string' ? row['solved_at'] : null,
  }));
}

export async function listGames(): Promise<AdminGameRow[]> {
  const supabase = await getSupabase();
  const { data } = await supabase.from('game_results').select('child_id,level,outcome');
  return (data ?? []).map((row) => ({
    childId: String(row['child_id']),
    level: String(row['level']),
    outcome: String(row['outcome']),
  }));
}

export async function listAwards(childId?: string): Promise<AdminAward[]> {
  const supabase = await getSupabase();
  let query = supabase
    .from('point_awards')
    .select('id,child_id,points,reason,awarded_at')
    .order('awarded_at', { ascending: false });
  if (childId) query = query.eq('child_id', childId);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: String(row['id']),
    childId: String(row['child_id']),
    points: Number(row['points'] ?? 0),
    reason: String(row['reason'] ?? ''),
    awardedAt: String(row['awarded_at'] ?? ''),
  }));
}

/* ── sessions ──────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ EVERY WRITE IN THIS SECTION REACHES POSTGRES AS **ONE STATEMENT**, AND
 * THAT IS A CORRECTNESS RULE, NOT A PERFORMANCE ONE.
 *
 * Migration 0011 hangs an `AFTER … FOR EACH STATEMENT` trigger on `sessions`
 * that pokes the Cloudflare deploy hook. Statement-level means it fires ONCE
 * per statement — so a loop of thirteen inserts is thirteen production builds
 * for one prof action, and a "cancel the rest of the term" that iterates is
 * twelve more.
 *
 * Therefore:
 *
 *   • creating N sessions is `insert([...N rows])`, never N calls to a
 *     create-one function. That is why `createSession()` (singular) NO LONGER
 *     EXISTS — a one-row create is `createSessions([one])`, and there is no
 *     function available to put in a `for` loop.
 *   • changing N sessions is `update(patch).in('id', ids)`, never N `.eq()`
 *     calls.
 *
 * ⚠️ IF A FUTURE PATH GENUINELY CANNOT BE ONE STATEMENT, the seam is in 0011:
 * `set local mcc.rebuild = 'off'` for the transaction, then one
 * `select public.request_site_rebuild('manual: …')` at the end. It is a
 * hand-run-SQL escape hatch. Nothing here needs it, and reaching for it from
 * application code means the single statement was not tried hard enough.
 *
 * ⚠️ AND IT IS MEASURED, NOT ASSERTED. `rebuild_requests` logs one row per
 * firing and `recurring-sessions.spec.ts` counts them: thirteen sessions, one
 * row. A claim about a trigger that nobody counts is a claim that quietly stops
 * being true.
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠️ A LADDER, FOR THE SAME REASON `PROFILE_COLUMNS` IS ONE.
 *
 * PostgREST answers a select naming a column the database does not have with a
 * `42703`, and this function turns an error into an empty array — which is
 * indistinguishable from "no sessions" to every caller. So one unapplied
 * migration would not degrade `/admin/seances`; it would silently EMPTY it,
 * taking the register, the session list and the staleness banner with it, on
 * the one screen a prof uses weekly.
 *
 * That hazard is written down for `getProfile()` after it bit once, and 0012
 * adds a column to a second explicit select. The line stops being fragile
 * instead.
 *
 * ⚠️ IT DEGRADES, IT DOES NOT REPAIR. A database without 0012 comes back with
 * `seriesId: null` on every row, which is exactly what a one-off session
 * carries — so the series block simply does not appear, and everything else
 * works. ⚠️ **ANYTHING ADDED TO THIS SELECT GETS A NEW RUNG IN THE SAME
 * COMMIT.**
 *
 * The cost is one extra round trip on a misconfigured deployment only.
 */
const SESSION_COLUMNS: readonly string[] = [
  /* 0013 — capacity and the overbooking margin. */
  'id,starts_at,duration_minutes,title_fr,venue,level,status,note_fr,note_en,series_id,capacity,overbook_margin',
  /* Pre-0013 — before a session could be booked. */
  'id,starts_at,duration_minutes,title_fr,venue,level,status,note_fr,note_en,series_id',
  /* Pre-0012 — before a repeat action could label the rows it created. */
  'id,starts_at,duration_minutes,title_fr,venue,level,status,note_fr,note_en',
] as const;

export async function listSessions(): Promise<AdminSession[]> {
  const supabase = await getSupabase();
  let data: Record<string, unknown>[] | null = null;
  for (const columns of SESSION_COLUMNS) {
    const result = await supabase
      .from('sessions')
      .select(columns)
      .order('starts_at', { ascending: false });
    if (!result.error) {
      data = (result.data ?? []) as unknown as Record<string, unknown>[];
      break;
    }
  }
  return (data ?? []).map((row) => ({
    id: String(row['id']),
    /* ⚠️ Canonicalised, not passed through: PostgREST answers `+00:00` and the
       baked snapshot writes `Z`, and the staleness check compares them as
       strings. Same rule as the sync layer's timestamps. */
    startsAt: new Date(String(row['starts_at'])).toISOString(),
    durationMinutes: Number(row['duration_minutes'] ?? 90),
    titleFr: row['title_fr'] ? String(row['title_fr']) : null,
    venue: row['venue'] ? String(row['venue']) : null,
    level: row['level'] ? String(row['level']) : null,
    status: String(row['status'] ?? 'draft') as SessionStatus,
    noteFr: row['note_fr'] ? String(row['note_fr']) : null,
    noteEn: row['note_en'] ? String(row['note_en']) : null,
    seriesId: row['series_id'] ? String(row['series_id']) : null,
    /* ⚠️ Null on a pre-0013 database, via the ladder above — and null is a
       real state the surface renders as "—", never as 0. A capacity of 0
       would mean a session nobody can book. */
    capacity: Number.isFinite(Number(row['capacity'])) ? Number(row['capacity']) : null,
    overbookMargin: Number.isFinite(Number(row['overbook_margin']))
      ? Number(row['overbook_margin'])
      : null,
  }));
}

export interface SessionInput {
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly titleFr: string | null;
  readonly venue: string | null;
  readonly level: string | null;
  readonly status: SessionStatus;
  /** Null for a one-off. See `AdminSession.seriesId` — a label, never a rule. */
  readonly seriesId?: string | null;
  /**
   * ⚠️ OPTIONAL, AND OMITTED RATHER THAN SENT AS NULL WHEN ABSENT — the same
   * rule `seriesId` follows. `capacity` is `not null default 12` in 0013, so
   * sending an explicit null would violate the constraint and fail the write;
   * omitting the key lets the default apply. READS degrade, WRITES fail loudly.
   */
  readonly capacity?: number;
  readonly overbookMargin?: number;
}

/**
 * A fresh series label.
 *
 * ⚠️ MINTED ON THE CLIENT, DELIBERATELY. A database default would need the rows
 * to be inserted before the id existed, or a round trip to fetch one — and the
 * whole point is that the thirteen rows go out in ONE statement, which means
 * the client has to know the label before it sends them.
 *
 * `crypto.randomUUID` is available in every browser this site supports and in
 * Node ≥ 19; there is no polyfill and there should not be one, because a
 * fallback that is not a uuid would collide silently.
 */
export function newSeriesId(): string {
  return crypto.randomUUID();
}

/**
 * Create one session or thirteen — in ONE statement, always.
 *
 * ⚠️ THERE IS NO SINGULAR VERSION OF THIS FUNCTION, AND THAT IS THE POINT. See
 * the section header: a `createSession(one)` is a function whose only misuse is
 * putting it in a loop, and the loop costs a Cloudflare build per iteration.
 * PostgREST turns a multi-row insert into a single `INSERT … SELECT`, so the
 * statement-level trigger fires once no matter how long the array is.
 */
export async function createSessions(
  inputs: readonly SessionInput[],
): Promise<{ ok: boolean; error?: string; created: number }> {
  if (inputs.length === 0) return { ok: true, created: 0 };
  const supabase = await getSupabase();
  const { error } = await supabase.from('sessions').insert(
    inputs.map((input) => ({
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      title_fr: input.titleFr,
      venue: input.venue,
      level: input.level,
      status: input.status,
      /* ⚠️ OMITTED WHEN THERE IS NO SERIES, NOT SENT AS NULL — the write-side
         half of the `SESSION_COLUMNS` ladder. A database without 0012 answers
         `42703` for any payload naming the column, so sending `series_id: null`
         on a ONE-OFF create would take ordinary session creation down with a
         migration that only the repeat feature needs.

         ⚠️ AND A REPEAT CREATE STILL FAILS LOUDLY THERE, deliberately. Reads
         degrade because an empty admin page explains nothing; a WRITE that
         quietly dropped the label would create thirteen rows the prof could
         never act on as a set, with nothing on screen saying so. */
      ...(input.seriesId ? { series_id: input.seriesId } : {}),
      /* ⚠️ SAME RULE AS `series_id`, AND FOR THE SAME REASON: omitted when the
         prof left the defaults alone, so a pre-0013 database still creates
         ordinary sessions instead of answering `42703` for every create. When
         a value IS given, the write fails loudly there rather than silently
         seating a number nobody chose. */
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.overbookMargin !== undefined ? { overbook_margin: input.overbookMargin } : {}),
    })),
  );
  return error ? { ok: false, error: error.message, created: 0 } : { ok: true, created: inputs.length };
}

function sessionPatchRow(patch: Partial<SessionInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.startsAt !== undefined) row['starts_at'] = patch.startsAt;
  if (patch.durationMinutes !== undefined) row['duration_minutes'] = patch.durationMinutes;
  if (patch.titleFr !== undefined) row['title_fr'] = patch.titleFr;
  if (patch.venue !== undefined) row['venue'] = patch.venue;
  if (patch.level !== undefined) row['level'] = patch.level;
  if (patch.status !== undefined) row['status'] = patch.status;
  if (patch.seriesId !== undefined) row['series_id'] = patch.seriesId;
  if (patch.capacity !== undefined) row['capacity'] = patch.capacity;
  if (patch.overbookMargin !== undefined) row['overbook_margin'] = patch.overbookMargin;
  return row;
}

/**
 * Change one session or twelve — in ONE statement, always.
 *
 * ⚠️ `.in('id', ids)` AND NEVER A LOOP OF `.eq()`. Same rule, same reason as
 * `createSessions()`. `updateSession()` below is a one-id convenience over this
 * and must stay that way: if it ever grows its own `.eq()` call, a future bulk
 * path will be written as a loop over it.
 */
export async function updateSessions(
  ids: readonly string[],
  patch: Partial<SessionInput>,
): Promise<{ ok: boolean; error?: string; changed: number }> {
  if (ids.length === 0) return { ok: true, changed: 0 };
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('sessions')
    .update(sessionPatchRow(patch))
    .in('id', [...ids]);
  return error ? { ok: false, error: error.message, changed: 0 } : { ok: true, changed: ids.length };
}

export async function updateSession(
  id: string,
  patch: Partial<SessionInput>,
): Promise<{ ok: boolean; error?: string }> {
  const { ok, error } = await updateSessions([id], patch);
  return ok ? { ok } : { ok, error };
}

/**
 * ⚠️ A CANCELLED SESSION IS SET TO `cancelled`, NEVER DELETED.
 *
 * Students were told it was happening; a session that vanishes leaves them
 * wondering whether they misremembered, and it takes its attendance rows with
 * it (`on delete cascade`) — so a register marked before a cancellation would
 * be destroyed by tidying up. Deletion is deliberately not offered anywhere in
 * this UI.
 *
 * ⚠️ THAT IS EQUALLY TRUE OF A WHOLE SERIES. `cancelSessions()` sets the state
 * on every row it names; there is no "delete the rest of the term".
 */
export async function cancelSession(id: string): Promise<{ ok: boolean; error?: string }> {
  return updateSession(id, { status: 'cancelled' });
}

/**
 * Every session in a series, from a list already in hand.
 *
 * ⚠️ FILTERED IN MEMORY RATHER THAN RE-QUERIED, because the caller is acting on
 * the cards on screen. Re-reading would open the door to acting on a row the
 * prof cannot see — and `series_id` may only ever be used to select rows they
 * are already looking at (migration 0012).
 */
export function sessionsInSeries(
  sessions: readonly AdminSession[],
  seriesId: string,
): AdminSession[] {
  return sessions.filter((s) => s.seriesId === seriesId);
}

/* ── bookings (0013) ───────────────────────────────────────────────────── */

/**
 * Who is booked into a session — the list a prof reads before the door opens.
 *
 * ⚠️ STAFF SEE EVERY BOOKING BECAUSE `bookings_staff_all` SAYS SO, not because
 * this function asks nicely. A prof token gets the rows; a parent token gets
 * their own children's and nothing else, from this identical call.
 *
 * ⚠️ THE PARENT CONTACT IS THE POINT OF THE JOIN. "Which children are booked"
 * is answerable from `bookings` alone; "who do I ring when one does not turn
 * up" is not, and that is the question a prof actually has at 16:05. It is
 * pulled through `child_profiles → profiles` in ONE request rather than N.
 *
 * ⚠️ CANCELLED ROWS ARE RETURNED, NOT FILTERED. A prof needs to see that a
 * place was released — that is the difference between a no-show and a child
 * who is not coming, and only one of those needs a phone call.
 */
export interface AdminBooking {
  readonly id: string;
  readonly sessionId: string;
  readonly childId: string;
  readonly childName: string;
  readonly status: 'confirmed' | 'cancelled';
  readonly cancelReason: string | null;
  /** ⚠️ Null when the account was deleted, or when it simply has no phone. */
  readonly guardianPhone: string | null;
  readonly guardianName: string | null;
}

export async function listBookings(sessionId: string): Promise<AdminBooking[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id,session_id,child_id,status,cancel_reason,' +
        'child_profiles(display_name,profiles(display_name,guardian_phone))',
    )
    .eq('session_id', sessionId);
  /* An error here means 0013 is not applied. Degrade to "no bookings" rather
     than emptying the whole sessions screen — the register still works. */
  if (error) return [];
  /* ⚠️ The same `as unknown as` step `listSessions()` uses: PostgREST's
     generated types model an embedded resource as a union with an error
     shape, which no runtime check can narrow. The rows are normalised field
     by field below, which is where the real safety is. */
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((row) => {
    const child = (row['child_profiles'] ?? {}) as Record<string, unknown>;
    const account = (child['profiles'] ?? {}) as Record<string, unknown>;
    return {
      id: String(row['id']),
      sessionId: String(row['session_id']),
      childId: String(row['child_id']),
      childName: child['display_name'] ? String(child['display_name']) : '—',
      status: row['status'] === 'cancelled' ? 'cancelled' : 'confirmed',
      cancelReason: row['cancel_reason'] ? String(row['cancel_reason']) : null,
      guardianPhone: account['guardian_phone'] ? String(account['guardian_phone']) : null,
      guardianName: account['display_name'] ? String(account['display_name']) : null,
    };
  });
}

/**
 * How many places are taken, per session — for the list, in ONE request.
 *
 * ⚠️ THE SAME `session_availability()` THE MEMBER SURFACE CALLS, deliberately.
 * A prof and a parent must never read different occupancy for one session, and
 * the way that happens is two summations — the lesson `computeLedger()` already
 * carries (Critical Feature 47).
 *
 * ⚠️ IT RETURNS ONLY `published` AND `cancelled` SESSIONS, so a draft is absent
 * from this map. That is correct rather than a gap: `create_booking()` refuses
 * a draft, so a draft's count is not "unknown", it is zero by construction —
 * and the card prints nothing rather than a number for it.
 *
 * Returns an empty map on a pre-0013 database, which the caller renders as "—".
 */
export async function listSessionAvailability(): Promise<Map<string, number>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('session_availability');
  if (error) return new Map();
  const out = new Map<string, number>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    out.set(String(row['session_id']), Number(row['booked'] ?? 0));
  }
  return out;
}

/* ── attendance ────────────────────────────────────────────────────────── */

export interface AttendanceRow {
  readonly childId: string;
  readonly status: AttendanceStatus;
}

export async function listAttendance(sessionId: string): Promise<AttendanceRow[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('attendance')
    .select('child_id,status')
    .eq('session_id', sessionId);
  return (data ?? []).map((row) => ({
    childId: String(row['child_id']),
    status: String(row['status']) as AttendanceStatus,
  }));
}

/**
 * Mark one child.
 *
 * ⚠️ AN UPSERT ON `(session_id, child_id)`, WHICH IS THE PRIMARY KEY. Marking
 * is a toggle a prof will hit twice by accident in a noisy room, and the second
 * press must correct the first rather than fail on a duplicate. 0005 rebuilt
 * that key when the column moved to `child_id`; without it this would insert a
 * second row every tap and the register would count everyone twice.
 *
 * ⚠️ IT IS DELIBERATELY ONE ROW PER CALL. Batching the whole class into one
 * request would mean the prof's twentieth tap decides when the first is saved,
 * and a dropped connection loses the lot. One tap, one write, one row.
 */
export async function markAttendance(
  sessionId: string,
  childId: string,
  status: AttendanceStatus,
  markedBy: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('attendance').upsert(
    [
      {
        session_id: sessionId,
        child_id: childId,
        status,
        marked_by: markedBy,
        marked_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'session_id,child_id' },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ── awards ────────────────────────────────────────────────────────────── */

/**
 * What the FORM may refuse before a round trip.
 *
 * ⚠️ THIS IS A MIRROR OF THE DATABASE, NOT THE RULE ITSELF. Migrations 0004
 * and 0014 carry `points > 0` and `length(btrim(reason)) >= 3` as
 * CHECK constraints, and `role-separation.spec.ts` proves the database refuses
 * a blank reason when this function is not involved at all. Client-side
 * validation exists so a prof gets a useful message instantly; it is the half
 * a future admin script would skip, which is exactly why it is not the only
 * place the rules live.
 */
export function validateAward(points: number, reason: string): string | null {
  if (!Number.isFinite(points) || Math.floor(points) !== points) return 'Un nombre entier de points.';
  if (points < 1) return 'Les points attribués sont positifs.';
  /* ⚠️ NO CEILING SINCE 0014. Deliberately not replaced with a large one —
     a number nobody chose is a number nobody can defend, and the reason field
     plus `awarded_by` are what make a big award accountable. */
  if (reason.trim().length < 3) return 'Une raison est obligatoire — l’élève la verra.';
  return null;
}

export async function awardPoints(
  childId: string,
  points: number,
  reason: string,
  awardedBy: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = validateAward(points, reason);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('point_awards')
    .insert([{ child_id: childId, points, reason: reason.trim(), awarded_by: awardedBy }]);
  return error ? { ok: false, error: error.message } : { ok: true };
}
