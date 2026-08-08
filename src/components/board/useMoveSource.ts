/**
 * Which door the last move came through — pointer or text.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ FOCUS FOLLOWS THE MODALITY OF THE MOVE, NOT THE DEVICE.
 *
 * `MoveInput` pulls focus back to the field when it becomes the reader's turn
 * again, so a keyboard player is never left on a dead control with no sign
 * that the opponent has replied. That was specified for a keyboard user and it
 * is right for one.
 *
 * On a phone it was actively harmful: every tapped move re-focused a text
 * field, which opens the virtual keyboard, which shrinks the visual viewport,
 * which scrolls the board out of sight. Playing by tapping became unusable —
 * found by Seàn on a real phone, which is exactly the class of defect the
 * automated suite cannot see, because a headless browser has no soft keyboard.
 *
 * ⚠️ THE SIGNAL IS THE MOVE, NOT THE HARDWARE. Deliberately NOT a user-agent
 * sniff, NOT `pointer: coarse`, NOT a touch-capability check:
 *
 *   - a phone user with a Bluetooth keyboard who TYPES a move still gets the
 *     field back, because they are in the typing flow;
 *   - a desktop user with a mouse who DRAGS a piece does not get the field
 *     focused, because they never asked for it.
 *
 * A device test would get both of those backwards. What the reader just did is
 * the only honest evidence of what they want next.
 *
 * The board and the field still converge on the same `onMove(from, to)` — this
 * records how it arrived WITHOUT branching the game logic, which is the
 * one-path rule in CLAUDE.md. Nothing downstream of `onMove` reads this; only
 * the focus decision does.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef } from 'preact/hooks';

export type MoveSource = 'pointer' | 'text';

export interface MoveSourceTracker {
  /** Wrap the handler given to the BOARD. Records a pointer move, then calls it. */
  readonly viaPointer: <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void;
  /** Wrap the handler given to `MoveInput`. Records a typed move, then calls it. */
  readonly viaText: <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void;
  /**
   * True when the last move came from the text field.
   *
   * Read it at the moment focus would be pulled — which is normally a timer or
   * two after the move, once the opponent has replied. A ref rather than state
   * on purpose: this must never cause a render, and the value that matters is
   * the one at read time, not the one captured when the timer was scheduled.
   */
  readonly lastWasText: () => boolean;
}

export function useMoveSource(): MoveSourceTracker {
  /* Starts as `pointer`, so nothing focuses the field before the reader has
     typed anything at all. The safe default is the one that leaves focus
     where the reader put it. */
  const source = useRef<MoveSource>('pointer');

  const viaPointer = useCallback(
    <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        source.current = 'pointer';
        fn(...args);
      },
    [],
  );

  const viaText = useCallback(
    <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        source.current = 'text';
        fn(...args);
      },
    [],
  );

  const lastWasText = useCallback(() => source.current === 'text', []);

  return { viaPointer, viaText, lastWasText };
}
