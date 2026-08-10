/**
 * The islands' door onto the score (E3).
 *
 * ⚠️ IT COMPUTES NOTHING. `ScoreResolver.astro` owns the one computation, and
 * this is a typed accessor onto what it published. An island that summed the
 * catalogue itself would be a second implementation of the ledger — the exact
 * thing the resolver exists to prevent, and the failure would be silent: the
 * board would award a number the progress page disagrees with.
 *
 * ⚠️ EVERYTHING HERE TOLERATES THE RESOLVER BEING ABSENT. A board can appear on
 * a page that mounts no resolver (and did, before this session), and a reader
 * with `localStorage` unavailable gets no score at all. Both must leave the
 * exercise fully playable — a progression display is the least important thing
 * on a page whose job is teaching a position.
 */

export interface ScoreState {
  readonly points: number;
  readonly sources: Readonly<Record<'basics' | 'lessons' | 'exercises' | 'games', number>>;
  readonly rank: string;
  readonly rankLabel: string;
  readonly next: string | null;
  readonly nextLabel: string | null;
  readonly remaining: number;
  readonly progress: number;
  readonly streak: number;
  readonly earned: readonly string[];
  /** Earned by THIS refresh — what the toast just announced. */
  readonly fresh?: readonly string[];
}

interface ScoreGlobal extends ScoreState {
  refresh(): ScoreState;
}

function global(): ScoreGlobal | null {
  const value = (globalThis as { MCC_SCORE?: ScoreGlobal }).MCC_SCORE;
  return value && typeof value.refresh === 'function' ? value : null;
}

/** The state as last computed, or null when no resolver is on the page. */
export function readScore(): ScoreState | null {
  return global();
}

/**
 * Recompute, re-bind every surface, and announce anything newly earned.
 *
 * Called after a solve or a win — the moment the underlying records changed.
 * Returns the new state so a caller can show the delta it just caused.
 */
export function refreshScore(): ScoreState | null {
  const value = global();
  if (!value) return null;
  try {
    return value.refresh();
  } catch {
    /* A resolver that throws must cost nothing: the board carries on. */
    return null;
  }
}
