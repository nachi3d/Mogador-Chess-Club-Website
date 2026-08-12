/**
 * THE LEDGER — one summation, two callers (v2-S4 part 2).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS. E3 put the one computation in `ScoreResolver.astro`,
 * which is `is:inline` and reads the reader's own `localStorage`. That is still
 * right for the reader — it has to land in the first paint, so it cannot import
 * a module.
 *
 * v2-S4 adds a SECOND caller with the same question and a different source of
 * rows: `/admin/eleve/` shows a prof what a student has, and those records come
 * from Supabase rather than from this device. A prof looking at a total that
 * disagrees with the total the student is looking at is the worst possible
 * failure of a progression display — both numbers look plausible, and the
 * student is the one who has to argue about it.
 *
 * So the summation moves here, as a pure function over ROWS, and the inline
 * resolver keeps its own copy for the first-paint reason above.
 *
 * ⚠️ THAT DUPLICATION IS DELIBERATE AND IT IS PINNED. `progression.spec.ts`
 * seeds a store, reads `window.MCC_SCORE` out of the live page, runs THIS
 * function over the same records and the same catalogue, and asserts every
 * number matches. A divergence fails there rather than in a room at Dar Souiri.
 * It is the same trade the storage keys make, with the same remedy.
 *
 * ⚠️ NO POLICY LIVES HERE EITHER. Every award value, threshold and condition
 * arrives in the `catalogue` argument, computed at build time by
 * `scoreboard.ts` from `points.ts`. This file sums numbers and compares them.
 *
 * ⚠️ PURE, AND IT MUST STAY PURE. No DOM, no `localStorage`, no Supabase, no
 * `astro:content`. The admin page imports it, a spec imports it in Node, and
 * neither may drag a backend in behind it.
 * ═════════════════════════════════════════════════════════════════════════
 */

/** The engine levels, in ladder order. Mirrors `points.ts`. */
const LEVELS = ['debutant', 'intermediaire', 'avance'] as const;

/** The award buckets a total is broken into. */
export type LedgerSource = 'basics' | 'lessons' | 'exercises' | 'games' | 'teacher';

/**
 * One scoreable unit, exactly as `scoreboard.ts` serialises it.
 *
 * Restated structurally rather than imported, because `scoreboard.ts` imports
 * `astro:content` and chess.js — pulling it in here would make this file
 * unimportable from a spec and would put the content collections into the admin
 * bundle. The field names are one letter for the reason given there.
 */
export interface LedgerEntry {
  readonly k: readonly string[];
  readonly p: number;
  readonly h: number;
  readonly s: 'basics' | 'lessons' | 'exercises' | 'games';
  readonly m?: 1;
}

export interface LedgerCatalogue {
  readonly entries: readonly LedgerEntry[];
  readonly wins: Readonly<Record<string, number>>;
  readonly winCap: number;
  readonly ranks: readonly { readonly id: string; readonly min: number }[];
}

/** What one board's record looks like, from either source. */
export interface LedgerRecord {
  readonly solved?: boolean;
  readonly hintUsed?: boolean;
}

/**
 * A teacher award, as a ROW.
 *
 * ⚠️ NEVER A BALANCE. This is the same shape as `point_awards` and carries its
 * reason with it, because a point a student cannot explain reads as arbitrary —
 * which is why the database requires the reason rather than the form.
 */
export interface LedgerAward {
  readonly points: number;
  readonly reason?: string;
  readonly awardedAt?: string | null;
}

export interface LedgerInput {
  readonly exercises: Readonly<Record<string, LedgerRecord>>;
  readonly games: Readonly<Record<string, { readonly wins?: number }>>;
  readonly awards?: readonly LedgerAward[];
}

export interface LedgerResult {
  readonly points: number;
  readonly sources: Readonly<Record<LedgerSource, number>>;
  /** Catalogue entries fully solved — what "10 exercises" counts. */
  readonly solvedEntries: number;
  /** True when any completed entry ends in checkmate. */
  readonly mate: boolean;
  readonly rank: string;
  readonly next: string | null;
  readonly remaining: number;
  /** 0–1 through the current rank's band; 1 at the top rank. */
  readonly progress: number;
}

/** A non-negative whole number, or 0 — the same posture as `progress.ts`. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Sum a set of records against a catalogue.
 *
 * ⚠️ AN ENTRY PAYS ONLY WHEN ALL ITS KEYS ARE SOLVED, and pays the reduced
 * award if ANY of them used a hint. That is what makes a multi-board lesson
 * award on its last board, and what makes re-solving worth nothing — `solved`
 * is a boolean, so there is no "have they done this before" branch anywhere and
 * no anti-farming code to write.
 */
export function computeLedger(
  catalogue: LedgerCatalogue,
  input: LedgerInput,
): LedgerResult {
  const sources: Record<LedgerSource, number> = {
    basics: 0,
    lessons: 0,
    exercises: 0,
    games: 0,
    teacher: 0,
  };

  const solved = (key: string) => input.exercises[key]?.solved === true;
  const hinted = (key: string) => input.exercises[key]?.hintUsed === true;

  let solvedEntries = 0;
  let mate = false;

  for (const entry of catalogue.entries) {
    let all = true;
    let usedHint = false;
    for (const key of entry.k) {
      if (!solved(key)) all = false;
      if (hinted(key)) usedHint = true;
    }
    if (!all) continue;
    solvedEntries += 1;
    if (entry.m) mate = true;
    sources[entry.s] += usedHint ? entry.h : entry.p;
  }

  /* ⚠️ Wins only. Losses and draws are recorded and cost nothing, ever. */
  for (const level of LEVELS) {
    const wins = count(input.games[level]?.wins);
    sources.games += Math.min(wins, catalogue.winCap) * (catalogue.wins[level] ?? 0);
  }

  /* ⚠️ Teacher awards are summed from their ROWS, exactly like everything else
     here. Nothing anywhere stores what they add up to. */
  for (const award of input.awards ?? []) sources.teacher += count(award.points);

  const points =
    sources.basics + sources.lessons + sources.exercises + sources.games + sources.teacher;

  let index = 0;
  for (let i = 0; i < catalogue.ranks.length; i += 1) {
    if (points >= catalogue.ranks[i]!.min) index = i;
  }
  const rank = catalogue.ranks[index]!;
  const next = catalogue.ranks[index + 1] ?? null;
  const span = next ? next.min - rank.min : 0;

  return {
    points,
    sources,
    solvedEntries,
    mate,
    rank: rank.id,
    next: next ? next.id : null,
    remaining: next ? Math.max(0, next.min - points) : 0,
    progress: next && span > 0 ? Math.min(1, (points - rank.min) / span) : 1,
  };
}
