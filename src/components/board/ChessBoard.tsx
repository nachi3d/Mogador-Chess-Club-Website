/**
 * ChessBoard — THE board island.
 *
 * There is exactly one of these in the codebase (CLAUDE.md → "Architecture
 * rule — ONE board island"). Every feature that shows a position mounts THIS
 * component with a different `mode`; there is never a second board.
 *
 * This file is the dispatcher and nothing else. The modes live beside it as
 * views (`ReplayView`, `ExerciseView`) so that neither grows into the other's
 * state machine — but they are views, not islands: they share one hydration
 * entry point and one Chessground adapter (`BoardSurface.tsx`).
 *
 * It hydrates with `client:visible`, never `client:load`. Chessground plus its
 * piece sprites is the heaviest thing on any page that has a board, and a
 * reader may never scroll to it.
 *
 * ── What this file may NOT do ──────────────────────────────────────────────
 *  - import the i18n layer (that would drag `src/config/site.ts` and both
 *    string tables into the bundle to render a handful of button labels);
 *  - import chess.js, statically, on any path a replay page can reach —
 *    `ExerciseView` pulls the engine in with `await import()` for exactly that
 *    reason;
 *  - fetch, subscribe or poll. Positions and moves are handed IN. Replay reads
 *    a PGN parsed at build time, the exercise diffs a dragged move against a
 *    stored line, and v2's online play will receive moves over a Durable Object
 *    socket — all three are callers, and this component must not learn which.
 */

import ReplayView, {
  type ReplayComment,
  type ReplayLabels,
  type ReplayShapes,
  type ReplayViewProps,
} from './ReplayView';
import ExerciseView, { type ExerciseLabels, type ExerciseViewProps } from './ExerciseView';

export type { ReplayComment, ReplayShapes, ReplayLabels, ExerciseLabels };

/**
 * A discriminated union rather than one wide props bag: the exercise needs a
 * slug, a definition and a hint that mean nothing to the replayer, and the
 * replayer needs plies that mean nothing to an exercise. Sharing one optional
 * everything would let a caller mount a replay board with no PGN and find out
 * at runtime.
 *
 * `play` is reserved for Stockfish (Phase 2) and deliberately absent from the
 * union: adding a mode should be a compile error at every call site until its
 * view exists, not a board that silently renders nothing.
 */
export type ChessBoardProps =
  | ({ readonly mode: 'replay' } & ReplayViewProps)
  | ({ readonly mode: 'exercise' } & ExerciseViewProps);

export default function ChessBoard(props: ChessBoardProps) {
  if (props.mode === 'exercise') {
    const { mode: _mode, ...rest } = props;
    return <ExerciseView {...rest} />;
  }
  const { mode: _mode, ...rest } = props;
  return <ReplayView {...rest} />;
}
