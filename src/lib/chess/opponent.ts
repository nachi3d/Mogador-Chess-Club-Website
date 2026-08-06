/**
 * Where the opponent's moves come from.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS THE v2 SEAM, and it is the whole reason the interface exists before
 * there are two implementations of it.
 *
 * CLAUDE.md, since Session 1: "the game logic must not know how moves arrive."
 * A view asks for the opponent's move and applies it. It must not know whether
 * that move came from a script in a JSON file, from Stockfish in a Web Worker,
 * or — in v2 — from another human over a Durable Object socket. All three are
 * the same shape: *a position goes in, a move comes out, eventually.*
 *
 * `PlayView` talks to this and nothing else. When online play lands it is a new
 * implementation of `MoveProvider` plus a lobby, not a rewrite of the board.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** A move in UCI: `e2e4`, `e7e8q`. What the board emits and chess.js accepts. */
export type Uci = string;

export interface MoveProvider {
  /** For diagnostics and the status line — never for branching on. */
  readonly name: string;
  /**
   * The opponent's reply to `fen`.
   *
   * Resolves to null when there is no move to make (a finished game), or when
   * the request was superseded — a caller that has moved on must be able to
   * ignore a late answer rather than apply it to a position that no longer
   * exists.
   */
  nextMove(fen: string): Promise<Uci | null>;
  /** Release whatever backs this — a worker, a socket. Must be idempotent. */
  dispose(): void;
}

/**
 * A fixed list of replies, handed out in order.
 *
 * Not used in production: the exercise view interleaves its scripted replies
 * itself, because it also has to align them with the solution it is judging.
 * This exists so the interface has a second, trivially-correct implementation —
 * it keeps `PlayView` honest about depending on the CONTRACT rather than on
 * Stockfish's timing, and it lets a test drive a whole game with no engine.
 */
export function scriptedProvider(moves: readonly Uci[]): MoveProvider {
  let index = 0;
  return {
    name: 'scripted',
    nextMove: (_fen: string) => Promise.resolve(moves[index++] ?? null),
    dispose: () => {
      index = moves.length;
    },
  };
}
