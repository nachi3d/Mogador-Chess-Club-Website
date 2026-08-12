/**
 * v2-S3 — the durable copy of progress.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ `progress.ts` STAYS THE SINGLE READER. Its public API does not change
 * shape, and no component gains a Supabase call. This file is a BACKEND that
 * progress.ts writes through to; nothing else may import it except the two
 * surfaces that display the sync state.
 *
 * ⚠️ `localStorage` REMAINS THE SOURCE OF TRUTH FOR THE UI. The cloud is the
 * durable copy, not the live one. Every read in the app is synchronous and
 * local, exactly as it was for a guest — so a slow network, a dead Supabase or
 * a captive-portal wifi can never make the site feel broken or block a board.
 *
 * ⚠️ NO STATIC `@lib/supabase` IMPORT ANYWHERE IN THIS FILE. Every touch is
 * `await import()` inside a function. A single static import would pull 207 KB
 * of client into every page that renders a board, and `auth.spec.ts` asserts
 * against the network log that a guest fetches none of it. `hasAuthFlag()` is
 * the cheap gate that keeps a guest from even reaching that import.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { hasAuthFlag } from '@lib/auth-flag';
import { resolveChild } from '@lib/child';
import type { ExerciseProgress, GameOutcome, Progress } from '@lib/progress';

/**
 * The queue and the import bookmark. Its own key, versioned like every other:
 * this is machinery, not the reader's work, and a shape change here must not
 * touch `mcc:progress:v1`.
 */
const SYNC_KEY = 'mcc:sync:v1';

/**
 * ⚠️ BOUNDED. An offline student in a classroom with no wifi generates one
 * entry per judged board; a queue that grows without limit eventually throws on
 * `setItem` and takes the whole write path down with it. At the cap the OLDEST
 * entries are dropped, because the newest state of a row is the one worth
 * keeping — every entry is a full upsert of one row, not a delta, so a dropped
 * entry is superseded rather than lost as long as a later one for the same row
 * survives. The next full sync repairs anything that did fall off.
 */
const QUEUE_CAP = 500;

export type SyncState = 'off' | 'synced' | 'pending' | 'offline';

/** Fired whenever the state changes, so a surface can render without polling. */
export const SYNC_EVENT = 'mcc:sync-state';

type QueueEntry =
  | { readonly t: 'exercise'; readonly slug: string; readonly p: ExerciseProgress }
  | { readonly t: 'game'; readonly id: string; readonly level: string; readonly o: GameOutcome };

interface SyncRecord {
  readonly queue: readonly QueueEntry[];
  /** Child ids whose guest import has already run. Makes the report once. */
  readonly imported: readonly string[];
}

const EMPTY: SyncRecord = { queue: [], imported: [] };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSync(): SyncRecord {
  const store = storage();
  if (!store) return EMPTY;
  try {
    const raw = store.getItem(SYNC_KEY);
    if (!raw) return EMPTY;
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      queue: Array.isArray(value['queue']) ? (value['queue'] as QueueEntry[]) : [],
      imported: Array.isArray(value['imported']) ? (value['imported'] as string[]) : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeSync(next: SyncRecord): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SYNC_KEY, JSON.stringify(next));
  } catch {
    /* Full or unavailable. The local progress record is already written and is
       what the reader sees; only the durable copy is at risk, and the next
       full sync repairs it. Never throw from a write path. */
  }
}

/* ── State, for the surfaces ─────────────────────────────────────────────── */

let state: SyncState = 'off';

export function syncState(): SyncState {
  if (!hasAuthFlag()) return 'off';
  if (state === 'off') state = readSync().queue.length > 0 ? 'pending' : 'synced';
  return state;
}

function setState(next: SyncState): void {
  if (state === next) return;
  state = next;
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { state: next } }));
  } catch {
    /* No CustomEvent: the state is still readable by `syncState()`. */
  }
}

/* ── Classification ──────────────────────────────────────────────────────── */

/**
 * ⚠️ THE CLIENT CLASSIFIES, BECAUSE THE CLIENT OWNS THE CONVENTION.
 *
 * `kind` exists so a future teacher dashboard can count tutorial steps without
 * the database parsing slug prefixes. Keeping the rule here means renaming a
 * namespace is a change in one file rather than a migration.
 */
export type ProgressKind = 'exercise' | 'tutorial' | 'lesson';

export function kindOf(slug: string): ProgressKind {
  if (slug.startsWith('tutorial:')) return 'tutorial';
  if (slug.startsWith('lesson:')) return 'lesson';
  return 'exercise';
}

/* ── The queue ───────────────────────────────────────────────────────────── */

/**
 * Record that a row needs pushing. Called by `progress.ts` AFTER the local
 * write has already happened.
 *
 * ⚠️ A GUEST NEVER ENQUEUES. `hasAuthFlag()` is a hint, not authorisation —
 * a hand-edited `true` buys a wasted module fetch and a 401, nothing more —
 * but it is what keeps a guest's write path free of any Supabase code at all.
 */
export function queueExercise(slug: string, progress: ExerciseProgress): void {
  if (!hasAuthFlag()) return;
  enqueue({ t: 'exercise', slug, p: progress });
}

export function queueGame(id: string, level: string, outcome: GameOutcome): void {
  if (!hasAuthFlag()) return;
  enqueue({ t: 'game', id, level, o: outcome });
}

function enqueue(entry: QueueEntry): void {
  const current = readSync();
  /* One entry per row: a later write of the same row supersedes the earlier,
     so the queue holds STATE rather than a history to replay. That is what
     makes a dropped entry survivable and the flush idempotent. */
  const key = entry.t === 'exercise' ? `e:${entry.slug}` : `g:${entry.id}`;
  const kept = current.queue.filter((q) => (q.t === 'exercise' ? `e:${q.slug}` : `g:${q.id}`) !== key);
  kept.push(entry);
  const queue = kept.length > QUEUE_CAP ? kept.slice(kept.length - QUEUE_CAP) : kept;
  writeSync({ ...current, queue });
  setState('pending');
  void flush();
}

/* ── The flush ───────────────────────────────────────────────────────────── */

let flushing: Promise<void> | null = null;

/**
 * Push whatever is queued. Safe to call at any time and from anywhere; calls
 * while one is in flight join it rather than starting a second.
 *
 * ⚠️ NEVER THROWS AND NEVER BLOCKS THE UI. Everything that can fail here —
 * offline, a dead session, a 500 — leaves the queue where it is and returns.
 * The local record is already correct; only the durable copy is behind.
 */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      if (!hasAuthFlag()) return;
      const current = readSync();
      if (current.queue.length === 0) {
        setState('synced');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setState('offline');
        return;
      }

      const { getSupabase, getUser } = await import('@lib/supabase');
      const user = await getUser();
      if (!user) {
        /* Signed out, or the session expired. The queue is kept: signing back
           in on this device must not lose the work done since. */
        setState('pending');
        return;
      }
      /* ⚠️ THE CHILD, NOT THE ACCOUNT. Resolution can legitimately answer null
         — a parent whose device has not yet been told which of three children
         is playing. Nothing is pushed until it has: writing a sibling's row is
         worse than a queue that waits, and the queue is durable. */
      const child = await resolveChild();
      if (!child) {
        setState('pending');
        return;
      }
      const supabase = await getSupabase();

      const exercises = current.queue.filter((q) => q.t === 'exercise');
      const games = current.queue.filter((q) => q.t === 'game');

      if (exercises.length > 0) {
        const rows = exercises.map((q) => ({
          child_id: child.id,
          exercise_slug: q.slug,
          kind: kindOf(q.slug),
          solved: q.p.solved,
          attempts: q.p.attempts,
          hint_used: q.p.hintUsed,
          solved_at: q.p.solvedAt,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase
          .from('exercise_progress')
          .upsert(rows, { onConflict: 'child_id,exercise_slug' });
        if (error) {
          setState(navigator?.onLine === false ? 'offline' : 'pending');
          return;
        }
      }

      if (games.length > 0) {
        const rows = games.map((q) => ({
          child_id: child.id,
          id: q.id,
          level: q.level,
          outcome: q.o,
        }));
        /* `ignoreDuplicates` because a game is immutable: the same id arriving
           twice is a retry, not a correction. */
        const { error } = await supabase
          .from('game_results')
          .upsert(rows, { onConflict: 'child_id,id', ignoreDuplicates: true });
        if (error) {
          setState(navigator?.onLine === false ? 'offline' : 'pending');
          return;
        }
      }

      /* ⚠️ RE-READ before clearing. A write that happened WHILE this flush was
         in flight is in the queue now and must not be dropped — clearing the
         whole thing here is how an offline session loses its last few moves. */
      const after = readSync();
      const pushed = new Set(
        current.queue.map((q) => (q.t === 'exercise' ? `e:${q.slug}` : `g:${q.id}`)),
      );
      const remaining = after.queue.filter(
        (q) => !pushed.has(q.t === 'exercise' ? `e:${q.slug}` : `g:${q.id}`),
      );
      writeSync({ ...after, queue: remaining });
      setState(remaining.length > 0 ? 'pending' : 'synced');
    } catch {
      setState('pending');
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/* ── The first sign-in merge ─────────────────────────────────────────────── */

export interface ImportReport {
  /** Exercises and tutorial steps recovered from this device. */
  readonly exercises: number;
  /** Distinct lessons recovered. */
  readonly lessons: number;
  /** Games recovered. */
  readonly games: number;
  /** False when the import had already run for this profile. */
  readonly ran: boolean;
}

const EMPTY_REPORT: ImportReport = { exercises: 0, lessons: 0, games: 0, ran: false };

/**
 * Merge whatever this device knows with whatever the cloud knows.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS IS THE MOMENT THAT MATTERS. A student who worked as a guest for a
 * month and then signs in must lose NOTHING. There is no undo: it runs once,
 * on real work.
 *
 * The rules, each chosen so that the merge is COMMUTATIVE and IDEMPOTENT —
 * running it twice, or in either direction, gives the same answer:
 *
 *   solved     OR      — solved anywhere is solved
 *   attempts   MAX     — the count is "how many times did this cost them"
 *   hintUsed   OR      — having seen the hint is a fact, not a state
 *   solvedAt   EARLIEST — the first time they did it is the true date
 *   games      UNION by id
 *
 * ⚠️ `solvedAt` TAKES THE EARLIEST AND NOT THE LATEST, and it is the one rule
 * that is easy to get backwards. It is the date they first solved it; a later
 * re-solve does not move it, or a student's history would drift forward every
 * time they revisited an exercise.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function importGuestProgress(
  local: Progress,
  apply: (merged: Progress) => void,
): Promise<ImportReport> {
  if (!hasAuthFlag()) return EMPTY_REPORT;
  try {
    const { getSupabase, getUser } = await import('@lib/supabase');
    const user = await getUser();
    if (!user) return EMPTY_REPORT;
    /* The merge is the child's, not the account's — a parent signing in on a
       shared tablet merges this device's guest work into whoever is playing. */
    const child = await resolveChild();
    if (!child) return EMPTY_REPORT;
    const supabase = await getSupabase();

    const [{ data: cloudRows }, { data: cloudGames }, { data: cloudAwards }] = await Promise.all([
      supabase.from('exercise_progress').select('*').eq('child_id', child.id),
      supabase.from('game_results').select('*').eq('child_id', child.id),
      /* ⚠️ AWARDS ARE PULLED, NEVER PUSHED (v2-S4). The client has no INSERT
         policy on this table and must not act as though it might: a prof is the
         only author, so this is a one-way mirror. See `AwardRecord`. */
      supabase
        .from('point_awards')
        .select('points,reason,awarded_at')
        .eq('child_id', child.id)
        .order('awarded_at', { ascending: false }),
    ]);

    /* ── Exercises ── */
    const merged: Record<string, ExerciseProgress> = { ...local.exercises };
    const recovered = new Set<string>();

    for (const row of cloudRows ?? []) {
      const slug = String(row['exercise_slug']);
      const cloud: ExerciseProgress = {
        solved: row['solved'] === true,
        attempts: Number(row['attempts'] ?? 0) || 0,
        hintUsed: row['hint_used'] === true,
        solvedAt: canonicalTime(typeof row['solved_at'] === 'string' ? row['solved_at'] : null),
      };
      const mine = merged[slug];
      /* ⚠️ Even with no local row the cloud value is canonicalised — otherwise
         a device that only RECEIVES would store the Postgres format and the
         next merge would see two formats again. */
      merged[slug] = mine
        ? mergeExercise(mine, cloud)
        : { ...cloud, solvedAt: canonicalTime(cloud.solvedAt) };
    }

    /* What this DEVICE contributed — the number the reader is shown. It is the
       local rows the cloud did not already have, because "recovered" means
       "would have been lost", not "now exists". */
    const cloudSlugs = new Set((cloudRows ?? []).map((r) => String(r['exercise_slug'])));
    for (const slug of Object.keys(local.exercises)) {
      if (!cloudSlugs.has(slug)) recovered.add(slug);
    }

    /* ── Games ── */
    const cloudIds = new Set((cloudGames ?? []).map((g) => String(g['id'])));
    const localEntries = gameEntriesFrom(local);
    const newGames = localEntries.filter((g) => !cloudIds.has(g.id));

    const games: Record<string, { wins: number; draws: number; losses: number }> = {};
    const all = [
      ...(cloudGames ?? []).map((g) => ({
        id: String(g['id']),
        level: String(g['level']),
        outcome: String(g['outcome']) as GameOutcome,
      })),
      ...newGames,
    ];
    for (const g of all) {
      const bucket = (games[g.level] ??= { wins: 0, draws: 0, losses: 0 });
      if (g.outcome === 'win') bucket.wins += 1;
      else if (g.outcome === 'draw') bucket.draws += 1;
      else bucket.losses += 1;
    }

    /* ⚠️ AWARDS ARE REPLACED, NOT MERGED — the server is the only author, so
       its list IS the list. Merging would make a withdrawn award immortal on
       whichever device happened to see it. See `mirrorAwards()`. */
    const mirrored = (cloudAwards ?? []).map((a) => ({
      points: Number(a['points']),
      reason: String(a['reason'] ?? ''),
      awardedAt: canonicalTime(typeof a['awarded_at'] === 'string' ? a['awarded_at'] : null),
    }));

    apply({ ...local, exercises: merged, games, awards: mirrored });

    /* ── Push the merge back up, so the cloud holds the union too ── */
    const rows = Object.entries(merged).map(([slug, p]) => ({
      child_id: child.id,
      exercise_slug: slug,
      kind: kindOf(slug),
      solved: p.solved,
      attempts: p.attempts,
      hint_used: p.hintUsed,
      solved_at: p.solvedAt,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      await supabase
        .from('exercise_progress')
        .upsert(rows, { onConflict: 'child_id,exercise_slug' });
    }
    if (newGames.length > 0) {
      await supabase.from('game_results').upsert(
        newGames.map((g) => ({
          child_id: child.id,
          id: g.id,
          level: g.level,
          outcome: g.outcome,
        })),
        { onConflict: 'child_id,id', ignoreDuplicates: true },
      );
    }

    /* ⚠️ THE BOOKMARK KEYS ON THE CHILD. Two siblings on one tablet each get
       their own first-sign-in merge; keying on the account would give the
       second one silently nothing. */
    const record = readSync();
    const already = record.imported.includes(child.id);
    if (!already) writeSync({ ...record, imported: [...record.imported, child.id] });
    setState('synced');

    let lessons = 0;
    let exercises = 0;
    const seenLessons = new Set<string>();
    for (const slug of recovered) {
      if (kindOf(slug) === 'lesson') {
        /* `lesson:<course>:<lesson>:<index>` — count the LESSON, not its
           boards, or a three-board lesson reads as three lessons. */
        const lesson = slug.split(':').slice(0, 3).join(':');
        if (!seenLessons.has(lesson)) {
          seenLessons.add(lesson);
          lessons += 1;
        }
      } else exercises += 1;
    }

    return { exercises, lessons, games: newGames.length, ran: !already };
  } catch {
    /* A failed import must never look like a successful empty one. Nothing is
       written, nothing is marked, and the next sign-in tries again. */
    return EMPTY_REPORT;
  }
}

/**
 * ⚠️ TIMESTAMPS ARE COMPARED AS INSTANTS AND STORED IN ONE FORMAT.
 *
 * Postgres returns `timestamptz` as `2026-01-01T10:00:00+00:00`; JavaScript
 * writes `2026-01-01T10:00:00.000Z`. Same instant, different STRING — and
 * comparing them lexicographically is not merely untidy, it is WRONG: `+`
 * (0x2B) sorts before `.` (0x2E), so a cloud value would always win an
 * "earliest" test whatever date it actually held. A student's first-solved
 * date would drift to whatever the cloud last returned.
 *
 * Found by the idempotency test, which is exactly what that test is for: the
 * round trip changed the stored string, so a second run was not a no-op.
 */
function canonicalTime(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function earliest(a: string | null, b: string | null): string | null {
  const x = canonicalTime(a);
  const y = canonicalTime(b);
  if (!x) return y;
  if (!y) return x;
  return Date.parse(x) <= Date.parse(y) ? x : y;
}

function mergeExercise(a: ExerciseProgress, b: ExerciseProgress): ExerciseProgress {
  return {
    solved: a.solved || b.solved,
    attempts: Math.max(a.attempts, b.attempts),
    hintUsed: a.hintUsed || b.hintUsed,
    solvedAt: earliest(a.solvedAt, b.solvedAt),
  };
}

/**
 * The local counters as individual games with stable ids.
 *
 * ⚠️ COUNTERS CANNOT BE MERGED, AND THIS IS THE COMPROMISE. Before v2-S3 the
 * client only ever kept `{wins, draws, losses}` per level, and two counters are
 * genuinely ambiguous: a guest with 3 wins and a cloud with 2 might mean 5
 * games or 3, and neither `sum` nor `max` is right in both cases.
 *
 * So legacy counters become DETERMINISTIC ids — `legacy:<level>:<outcome>:<n>`
 * — which makes the union idempotent: importing the same device twice adds
 * nothing. The cost is that two devices whose legacy counters overlap will
 * dedupe games that were genuinely different.
 *
 * ⚠️ That direction is chosen deliberately. Under-counting games costs a
 * student at most a few points, and wins are capped per level anyway;
 * over-counting would INFLATE a total, which is the failure mode the whole
 * derived-not-banked rule exists to prevent. Games recorded from now on carry a
 * random id and union exactly.
 */
function gameEntriesFrom(
  local: Progress,
): readonly { id: string; level: string; outcome: GameOutcome }[] {
  const out: { id: string; level: string; outcome: GameOutcome }[] = [];
  for (const [level, record] of Object.entries(local.games)) {
    const counts: readonly [GameOutcome, number][] = [
      ['win', record.wins],
      ['draw', record.draws],
      ['loss', record.losses],
    ];
    for (const [outcome, n] of counts) {
      for (let i = 0; i < n; i++) out.push({ id: `legacy:${level}:${outcome}:${i}`, level, outcome });
    }
  }
  return out;
}

/* ── Wake-ups ────────────────────────────────────────────────────────────── */

let listening = false;

/**
 * Retry on reconnect and when the tab comes back.
 *
 * ⚠️ NO POLLING AND NO SPINNER. The reader is never waiting on this: the board
 * they are looking at is driven entirely by `localStorage`. A timer would burn
 * a phone battery to hurry something nobody is watching.
 */
export function startSync(): void {
  if (typeof window === 'undefined' || listening) return;
  listening = true;
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });
  if (hasAuthFlag()) void flush();
}
