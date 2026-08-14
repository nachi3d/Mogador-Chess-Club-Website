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
 * ⚠️ NO WRITE IN THIS FILE INVENTS A RULE. `points > 0 and points <= 50`, the
 * required reason and the attendance statuses are CHECK constraints in
 * migrations 0004 and 0001. What is here is a mirror so the form can say no
 * before a round trip; the database is what actually refuses, and the spec
 * proves the database refuses even when this file is bypassed.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { getProfile, getSupabase } from '@lib/supabase';
import { AWARD_MAX } from '@lib/progress';

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

/* ── sessions ──────────────────────────────────────────────────────────── */

export async function listSessions(): Promise<AdminSession[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('sessions')
    .select('id,starts_at,duration_minutes,title_fr,venue,level,status,note_fr,note_en')
    .order('starts_at', { ascending: false });
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
  }));
}

export interface SessionInput {
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly titleFr: string | null;
  readonly venue: string | null;
  readonly level: string | null;
  readonly status: SessionStatus;
}

export async function createSession(input: SessionInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('sessions').insert([
    {
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      title_fr: input.titleFr,
      venue: input.venue,
      level: input.level,
      status: input.status,
    },
  ]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateSession(
  id: string,
  patch: Partial<SessionInput>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.startsAt !== undefined) row['starts_at'] = patch.startsAt;
  if (patch.durationMinutes !== undefined) row['duration_minutes'] = patch.durationMinutes;
  if (patch.titleFr !== undefined) row['title_fr'] = patch.titleFr;
  if (patch.venue !== undefined) row['venue'] = patch.venue;
  if (patch.level !== undefined) row['level'] = patch.level;
  if (patch.status !== undefined) row['status'] = patch.status;
  const { error } = await supabase.from('sessions').update(row).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * ⚠️ A CANCELLED SESSION IS SET TO `cancelled`, NEVER DELETED.
 *
 * Students were told it was happening; a session that vanishes leaves them
 * wondering whether they misremembered, and it takes its attendance rows with
 * it (`on delete cascade`) — so a register marked before a cancellation would
 * be destroyed by tidying up. Deletion is deliberately not offered anywhere in
 * this UI.
 */
export async function cancelSession(id: string): Promise<{ ok: boolean; error?: string }> {
  return updateSession(id, { status: 'cancelled' });
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
 * ⚠️ THIS IS A MIRROR OF THE DATABASE, NOT THE RULE ITSELF. Migration 0004
 * carries `points > 0 and points <= 50` and `length(btrim(reason)) >= 3` as
 * CHECK constraints, and `role-separation.spec.ts` proves the database refuses
 * a blank reason when this function is not involved at all. Client-side
 * validation exists so a prof gets a useful message instantly; it is the half
 * a future admin script would skip, which is exactly why it is not the only
 * place the rules live.
 */
export function validateAward(points: number, reason: string): string | null {
  if (!Number.isFinite(points) || Math.floor(points) !== points) return 'Un nombre entier de points.';
  if (points < 1) return 'Les points attribués sont positifs.';
  if (points > AWARD_MAX) return `Maximum ${AWARD_MAX} points par attribution.`;
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
