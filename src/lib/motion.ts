/**
 * Motion policy — the single place that decides how long anything moves or waits.
 *
 * Every duration on the site is one of the constants below. They are here rather
 * than inline at each call site because the numbers only make sense **relative to
 * each other**: a board move must read slower than a replay step, and the engine
 * must appear to think for longer than either. Scattered magic numbers drift out
 * of that relationship one commit at a time.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE THREE FAMILIES (E1). Every animation on the site belongs to exactly one.
 *
 *   Réponse    120–180ms, fast-out curve.
 *              What follows a CLICK. Button press, card grab, tab switch,
 *              stepping a replay. The reader did something; the site answers
 *              before they can wonder whether it heard.
 *
 *   Transition 250–350ms, gentle curve.
 *              A visible STATE CHANGE that the reader should watch land. Hint
 *              reveal, panel open, verdict appearing, a piece moving, a section
 *              revealing on scroll.
 *
 *   Ambiance   4–20s, linear, looping.
 *              Background drift ONLY. Never tied to an action, never carrying
 *              information. If removing it would lose meaning, it is not
 *              ambiance and it does not belong here.
 *
 * ⚠️ **NOTHING SITS BETWEEN 180ms AND 250ms.** The gap is the point: it is what
 * keeps "the site heard me" and "watch this change" legible as two different
 * things rather than one smear of vaguely-quick. A duration that wants to live in
 * the gap is a design question, not a tuning question — decide which family it is
 * in and take that family's number.
 *
 * ── What is NOT a family, and must not be forced into one ────────────────
 *
 *   Pacing    The engine's apparent thinking (`THINK_FLOOR_*`) and the scripted
 *             opponent's reply. Nothing moves for these; they are a WAIT before
 *             motion starts. They have no curve, so they have no family.
 *
 *   Offsets   Stagger delays (`REVEAL_STEP_MS`) and the ambient layer's negative
 *             `animation-delay`s. A delay is when a duration starts, not how long
 *             it runs. The family governs the duration it offsets.
 *
 *   Composites A shake is four Réponse beats in a row, not a single 600ms
 *             animation (`SHAKE_MS`). A solve is two Transitions with a gap
 *             between them (`SOLVE_*`). Both are spelled as arithmetic on a
 *             family constant below, so they cannot drift away from it.
 *
 * ── The CSS mirror ───────────────────────────────────────────────────────
 * CSS cannot import TypeScript, so `src/styles/tokens.css` carries the same three
 * numbers as `--motion-response` / `--motion-transition` / `--motion-ambient-*`.
 * That is a mirror, and mirrors drift — so `tests/e2e/motion.spec.ts` reads the
 * custom properties out of the live document and asserts they equal the constants
 * here. If you change a number, change it in both places; the spec will tell you
 * if you changed it in one.
 * ═════════════════════════════════════════════════════════════════════════
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

/* ── Family: Réponse ────────────────────────────────────────────────────── */

/** The Réponse band. Anything answering a click sits in here, inclusive. */
export const RESPONSE_MIN_MS = 120;
export const RESPONSE_MS = 150;
export const RESPONSE_MAX_MS = 180;

/* ── Family: Transition ─────────────────────────────────────────────────── */

/** The Transition band. Any visible state change sits in here, inclusive. */
export const TRANSITION_MIN_MS = 250;
export const TRANSITION_MS = 300;
export const TRANSITION_MAX_MS = 350;

/* ── Family: Ambiance ───────────────────────────────────────────────────── */

/** The Ambiance band, in SECONDS. Looping background drift only. */
export const AMBIENT_MIN_S = 4;
export const AMBIENT_MAX_S = 20;

/* ── Board ──────────────────────────────────────────────────────────────── */

/**
 * A move played on a board — gameplay. Exercise and play modes.
 * Transition: a piece changing square is a state change worth watching land.
 */
export const BOARD_ANIMATION_MS = TRANSITION_MIN_MS;

/**
 * A step through a replay — navigation. Deliberately snappier than gameplay.
 *
 * Réponse, at the top of its band: the reader pressed → and is waiting on the
 * next position. It was 200ms before E1, which is squarely inside the forbidden
 * 180–250 gap — the clearest case the audit turned up of a duration that had
 * drifted into meaning nothing in particular. Moving it to 180 keeps the
 * relationship that matters (navigation stays faster than gameplay) and puts it
 * in the family it always belonged to.
 */
export const REPLAY_ANIMATION_MS = RESPONSE_MAX_MS;

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

/* ── Composites and offsets — arithmetic on a family, never a new number ── */

/**
 * The rejected-move shake: FOUR Réponse beats, not one 600ms animation.
 *
 * A shake has to oscillate to read as a shake, and a single oscillation is a
 * Réponse. Spelling it as multiplication is what stops it being retuned into a
 * fourth family by someone reasonably observing that "600ms fits nothing".
 *
 * The extra 20ms is slack: the JS timer that ends the shake must outlast the CSS
 * animation, or the board snaps back mid-wobble.
 */
export const SHAKE_MS = RESPONSE_MS * 4 + 20;

/**
 * The solve, in TWO BEATS (E1). The frame settles first, then the badge arrives.
 *
 * It used to be one 900ms block in which everything happened at once, which is
 * why solving read as "a thing appeared" rather than as an event with a shape.
 * Beat one is the frame reaching its final state; beat two is the badge landing
 * on top of it. Both are Transitions, separated by a beat of stillness — the
 * stillness is what makes them read as two things instead of one long one.
 */
export const SOLVE_FRAME_MS = TRANSITION_MS;
export const SOLVE_BADGE_DELAY_MS = TRANSITION_MS;
export const SOLVE_BADGE_MS = TRANSITION_MS;

/** The accent pulse on the destination square of a correct move. */
export const PULSE_MS = TRANSITION_MS;

/** The move counter's hop as it advances. A Réponse: it follows the reader's move. */
export const HOP_MS = RESPONSE_MS;

/**
 * The stagger between revealed cards. An OFFSET, not a duration — see the header.
 *
 * Capped at six steps in CSS: past that the last card waits long enough to look
 * broken rather than choreographed.
 */
export const REVEAL_STEP_MS = 60;

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
