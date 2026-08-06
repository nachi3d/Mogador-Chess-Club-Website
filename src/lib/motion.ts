/**
 * Motion policy — the single place that decides how long anything moves or waits.
 *
 * Every duration on the site is one of the constants below. They are here rather
 * than inline at each call site because the numbers only make sense **relative to
 * each other**: a board move must read slower than a replay step, and the engine
 * must appear to think for longer than either. Scattered magic numbers drift out
 * of that relationship one commit at a time.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GAMEPLAY vs NAVIGATION — the distinction the two board durations encode
 *
 * A move played on a board is an EVENT: something happened, and the reader needs
 * to see which piece went where. That wants ~250ms.
 *
 * Stepping through a replay is NAVIGATION: the reader is scrubbing a game they
 * are reading, and every extra millisecond is latency between them and the next
 * position. That wants ~200ms, and jumping (Home/End, clicking a move) wants no
 * animation at all — see `instant` on BoardProps.
 *
 * They are close together because they are the same gesture at different intents,
 * not because one of them is a rounding error.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This module reads `matchMedia`, so it is not pure in the way `src/lib/chess/*`
 * is. It is guarded and total: a missing or throwing `matchMedia` reports "no
 * preference" rather than propagating, because motion is a presentation detail
 * and no board should fail to move because a media query was unavailable.
 */

/** A move played on a board — gameplay. Exercise and play modes. */
export const BOARD_ANIMATION_MS = 250;

/** A step through a replay — navigation. Deliberately snappier than gameplay. */
export const REPLAY_ANIMATION_MS = 200;

/**
 * The opponent's apparent thinking time, randomised per move within this range.
 *
 * ⚠️ This is a FLOOR, NOT A FIXED WAIT. Stockfish at "Avancé" may legitimately
 * search for longer than 800ms, and when it does we do not add this on top — we
 * play the move as soon as it arrives. The floor exists because the engine is
 * often much FASTER than a human reads: at "Débutant" (depth 2) a reply comes
 * back in single-digit milliseconds, and a move that appears in the same frame
 * as your own does not read as an opponent responding. It reads as a glitch.
 */
export const THINK_FLOOR_MIN_MS = 500;
export const THINK_FLOOR_MAX_MS = 800;

/**
 * The floor under `prefers-reduced-motion`.
 *
 * NOT zero, and that is the point. Reduced motion means "do not animate", not
 * "do not pace". A reader on a screen reader gets their own move announced and
 * then the opponent's; collapsing the gap to nothing makes the two announcements
 * overlap or interrupt each other, so the reply is heard as part of their own
 * move. 150ms is enough to separate them and short enough not to feel like a wait.
 */
export const REDUCED_MOTION_FLOOR_MS = 150;

/**
 * Whether the reader has asked for reduced motion. Read at CALL time, never
 * cached: the preference can change mid-session (an OS toggle, or a spec calling
 * `emulateMedia`), and a value captured at module load would be wrong for the
 * rest of the visit.
 */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* An embedded context can throw on matchMedia. Motion is not worth an error. */
    return false;
  }
}

/**
 * How long a board move should animate, honouring the reader's preference.
 * Zero means "no animation" — Chessground takes `enabled: false` alongside it.
 */
export function boardAnimationMs(base: number = BOARD_ANIMATION_MS): number {
  return prefersReducedMotion() ? 0 : base;
}

/**
 * A fresh thinking floor for ONE move. Randomised so a game does not develop a
 * metronome: a fixed delay is more obviously artificial than a variable one.
 */
export function thinkingFloorMs(): number {
  if (prefersReducedMotion()) return REDUCED_MOTION_FLOOR_MS;
  return THINK_FLOOR_MIN_MS + Math.random() * (THINK_FLOOR_MAX_MS - THINK_FLOOR_MIN_MS);
}

/**
 * How much of `floorMs` is left, given something started at `startedAt`.
 * Zero when the work already outlasted the floor — the floor is never additive.
 */
export function remainingFloorMs(startedAt: number, floorMs: number): number {
  return Math.max(0, floorMs - (Date.now() - startedAt));
}

/** A cancellable-by-convention delay. Callers re-check their generation after it. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) resolve();
    else window.setTimeout(resolve, ms);
  });
}
