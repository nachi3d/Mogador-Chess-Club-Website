/**
 * The award notice — the data half (0017).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ IT READS THE LEDGER AND STORES NOTHING THAT COULD DISAGREE WITH IT.
 *
 * `award_notices()` is a query over `point_awards` — the rows
 * `jeton_balances()` sums — filtered by a per-child read cursor. There is no
 * notification row, no cached amount and no unread count anywhere. A prof who
 * undoes a tap removes the award from the notice for the same reason it leaves
 * the balance: it is no longer a row.
 *
 * ⚠️ THE CURSOR IS MOVED BY AWARD ID, NEVER BY A TIMESTAMP FROM HERE. A
 * JavaScript Date keeps milliseconds and Postgres keeps microseconds, so a
 * timestamp round-tripped through this file would land just before the award
 * it meant and leave that award unread for ever. The function resolves the id
 * to the stored value itself. See migration 0017.
 *
 * ⚠️ `@lib/supabase` IS IMPORTED LAZILY, like `shop.ts`: the notice sits on
 * the home page, the most-visited public page on the site, and a signed-out
 * visitor must make ZERO Supabase requests (the guest zero-request rule).
 * ═════════════════════════════════════════════════════════════════════════
 */

export interface AwardNotice {
  readonly id: string;
  readonly childId: string;
  readonly childName: string;
  /** Positive — the database enforces it (0004, 0014). */
  readonly jetons: number;
  /** Required and never blank (0004). Shown verbatim, as text. */
  readonly reason: string;
  /** ISO 8601, as the database sent it. Displayed only; never sent back. */
  readonly awardedAt: string;
  /** The prof's display name, or null — the page owns the fallback wording. */
  readonly givenBy: string | null;
}

/** One child's unread awards, newest first. */
export interface NoticeGroup {
  readonly childId: string;
  readonly childName: string;
  readonly awards: readonly AwardNotice[];
}

/** What `mark_awards_seen()` can answer. An unknown one is 'error' (CF74). */
export type SeenCode = 'ok' | 'forbidden' | 'no_award' | 'error';

export function asNotice(row: Record<string, unknown>): AwardNotice {
  const giver = typeof row['given_by'] === 'string' ? row['given_by'].trim() : '';
  return {
    id: String(row['award_id']),
    childId: String(row['child_id']),
    childName: String(row['child_name'] ?? ''),
    jetons: Number(row['jetons'] ?? 0),
    reason: String(row['reason'] ?? ''),
    awardedAt: String(row['awarded_at'] ?? ''),
    givenBy: giver === '' ? null : giver,
  };
}

/**
 * Group by child, keeping each child's awards newest first and the children in
 * the order the database returned them.
 *
 * ⚠️ `through` IS THE NEWEST AWARD OF THE GROUP — the one whose id is sent
 * when the reader presses "Compris". Sorting here rather than trusting the
 * database's order means a change to the SQL `order by` cannot quietly make
 * the cursor stop short of what was on screen.
 */
export function groupNotices(notices: readonly AwardNotice[]): NoticeGroup[] {
  const groups = new Map<string, { childName: string; awards: AwardNotice[] }>();
  for (const notice of notices) {
    const group = groups.get(notice.childId) ?? { childName: notice.childName, awards: [] };
    group.awards.push(notice);
    groups.set(notice.childId, group);
  }
  return [...groups].map(([childId, g]) => ({
    childId,
    childName: g.childName,
    awards: [...g.awards].sort((a, b) => Date.parse(b.awardedAt) - Date.parse(a.awardedAt)),
  }));
}

/** The award whose id moves the cursor: the newest one shown for that child. */
export function newestOf(group: NoticeGroup): AwardNotice | null {
  return group.awards[0] ?? null;
}

/**
 * The account's unread awards.
 *
 * ⚠️ NULL MEANS "COULD NOT ASK", NEVER "NOTHING NEW". A database without 0017
 * answers `PGRST202`; a dead project answers nothing. Either way the page
 * renders no notice — reads degrade — but the caller can tell the two apart.
 */
export async function loadNotices(): Promise<AwardNotice[] | null> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('award_notices');
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map(asNotice);
  } catch {
    return null;
  }
}

/** "Compris" — move one child's cursor to the newest award they were shown. */
export async function markSeen(childId: string, throughAwardId: string): Promise<SeenCode> {
  try {
    const { getSupabase } = await import('@lib/supabase');
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('mark_awards_seen', {
      child: childId,
      through_award: throughAwardId,
    });
    if (error) return 'error';
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    const code = row?.['code'];
    return code === 'ok' || code === 'forbidden' || code === 'no_award' ? code : 'error';
  } catch {
    return 'error';
  }
}
