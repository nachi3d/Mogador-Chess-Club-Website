/**
 * PGN → a replayable list of plies.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS MODULE IS PURE. No DOM, no Chessground, no Preact, no async.
 *
 * That is the CLAUDE.md rule from Session 1: "the game logic must not know how
 * moves arrive." A replayer steps through a stored PGN, an exercise validates a
 * dragged move, and (v2) a Durable Object delivers an opponent's move over a
 * socket — all three are just *callers*. Anything in here that reached for the
 * board or the network would have to be rewritten for the next caller.
 *
 * It is also the reason the Chessground dependency lives in exactly one file
 * (`BoardSurface.tsx`) and not in here: nothing about a position or a move list
 * depends on which library eventually draws it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * PLY NUMBERING — used by content authors, so it must not drift:
 *   ply  0  = the FIRST half-move (1. e4)
 *   ply  1  = the reply          (1... e5)
 *   ply -1 = the starting position, before anything is played
 * `moveComments[].ply` and `shapes[].ply` in the content collections index into
 * this same scheme. `scripts/check-content.mjs` enforces the bounds.
 */

import { Chess, type Square } from 'chess.js';

export type { Square };

/** One half-move, with everything a view needs precomputed. */
export interface ReplayPly {
  /** 0-based half-move index. See the numbering note above. */
  readonly ply: number;
  /** 1, 1, 2, 2, 3, … — the number shown in the move list. */
  readonly moveNumber: number;
  readonly color: 'w' | 'b';
  /** Standard Algebraic Notation, e.g. "Nxe5". Language-neutral by the PGN rule. */
  readonly san: string;
  /** Long algebraic / UCI, e.g. "f3e5". What a board emits and consumes. */
  readonly uci: string;
  readonly from: Square;
  readonly to: Square;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly isCheck: boolean;
  readonly isCheckmate: boolean;
}

export interface Replay {
  /** Position before ply 0. Not always the standard opening (see `fenAt`). */
  readonly startFen: string;
  readonly plies: readonly ReplayPly[];
}

/** A move-list row: one move number, White's half-move and optionally Black's. */
export interface MoveRow {
  readonly moveNumber: number;
  readonly white: ReplayPly | undefined;
  readonly black: ReplayPly | undefined;
}

/** The cursor value meaning "before any move has been played". */
export const START_PLY = -1;

/**
 * Parses a PGN into plies. Throws if the PGN does not parse — a caller
 * rendering stored content should let that fail loudly at build time rather
 * than shipping a silently empty board.
 */
export function parseReplay(pgn: string): Replay {
  const game = new Chess();
  game.loadPgn(pgn);

  const moves = game.history({ verbose: true });
  /**
   * ⚠️ The fallback must be the LOADED game, not a fresh board.
   *
   * With moves, `moves[0].before` is the start position and everything is fine.
   * With NO moves — a still diagram, a PGN carrying only `[SetUp]`/`[FEN]` —
   * there is no `moves[0]`, and `new Chess().fen()` silently substitutes the
   * standard opening position. The diagram then renders 32 pieces in their
   * starting squares instead of the position it was written to show, with no
   * error anywhere. `game.fen()` after `loadPgn` is the SetUp position, which is
   * correct in both cases.
   */
  const startFen = moves[0]?.before ?? game.fen();

  const plies = moves.map((move, index): ReplayPly => {
    // Check state is asked of the resulting position rather than sniffed off
    // the SAN suffix: a PGN written without "+"/"#" is still a legal PGN, and
    // the replayer must not disagree with the board about a check.
    const after = new Chess(move.after);

    return {
      ply: index,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color,
      san: move.san,
      uci: move.lan,
      from: move.from,
      to: move.to,
      fenBefore: move.before,
      fenAfter: move.after,
      isCheck: after.isCheck(),
      isCheckmate: after.isCheckmate(),
    };
  });

  return { startFen, plies };
}

/** The position at a cursor. `START_PLY` (-1) gives the starting position. */
export function fenAt(replay: Replay, ply: number): string {
  if (ply < 0) return replay.startFen;
  const clamped = Math.min(ply, replay.plies.length - 1);
  return replay.plies[clamped]?.fenAfter ?? replay.startFen;
}

/**
 * The move to highlight at a cursor — Chessground's `lastMove`.
 * Undefined at the start, where no move has been played yet.
 */
export function lastMoveAt(replay: Replay, ply: number): readonly [Square, Square] | undefined {
  if (ply < 0) return undefined;
  const move = replay.plies[Math.min(ply, replay.plies.length - 1)];
  return move ? [move.from, move.to] : undefined;
}

/** Whose turn it is at a cursor — Chessground needs it to orient its own state. */
export function turnAt(replay: Replay, ply: number): 'white' | 'black' {
  const fen = fenAt(replay, ply);
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** True when the position at this cursor is checkmate. */
export function isCheckmateAt(replay: Replay, ply: number): boolean {
  if (ply < 0) return false;
  return replay.plies[Math.min(ply, replay.plies.length - 1)]?.isCheckmate ?? false;
}

/**
 * Which side is in check at this cursor, if any.
 * Returns a colour rather than a square because that is what a board wants:
 * it already knows where the kings are, and asking us for a square would mean
 * duplicating its own lookup.
 */
export function checkColorAt(replay: Replay, ply: number): 'white' | 'black' | undefined {
  if (ply < 0) return undefined;
  const move = replay.plies[Math.min(ply, replay.plies.length - 1)];
  if (!move?.isCheck) return undefined;
  // The side in check is the side to move in the resulting position.
  return turnAt(replay, ply);
}

/**
 * The subset of a ply the BROWSER needs, ready to be serialised into island
 * props.
 *
 * Why this exists: replay mode parses its PGN at BUILD time and ships the
 * result, so chess.js never enters the client bundle (~40 KB saved on every
 * page with a board). `fenBefore` is dropped because `fenAt` only ever reads
 * `fenAfter`, and a FEN is ~60 bytes of HTML per ply.
 *
 * The exercise and play modes will need chess.js in the browser for legality
 * checking; they should lazy-import it at that point rather than making the
 * replayer pay for it now.
 */
export interface SerializedPly {
  readonly moveNumber: number;
  readonly color: 'w' | 'b';
  readonly san: string;
  readonly uci: string;
  readonly from: string;
  readonly to: string;
  readonly fenAfter: string;
  readonly isCheck: boolean;
  readonly isCheckmate: boolean;
}

export interface SerializedReplay {
  readonly startFen: string;
  readonly plies: readonly SerializedPly[];
}

/** Build-time → island-props projection. */
export function serializeReplay(replay: Replay): SerializedReplay {
  return {
    startFen: replay.startFen,
    plies: replay.plies.map((p) => ({
      moveNumber: p.moveNumber,
      color: p.color,
      san: p.san,
      uci: p.uci,
      from: p.from,
      to: p.to,
      fenAfter: p.fenAfter,
      isCheck: p.isCheck,
      isCheckmate: p.isCheckmate,
    })),
  };
}

/** Groups plies into numbered rows for the move list. */
export function toMoveRows(plies: readonly ReplayPly[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 0; i < plies.length; i += 2) {
    const white = plies[i];
    rows.push({
      moveNumber: white?.moveNumber ?? Math.floor(i / 2) + 1,
      white,
      black: plies[i + 1],
    });
  }
  return rows;
}
