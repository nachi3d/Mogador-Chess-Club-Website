/**
 * Exercise logic — position, legality, and the verdict on a played move.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS MODULE IS PURE. No DOM, no Chessground, no Preact, no async, no fetch.
 *
 * Same rule as `replay.ts` (CLAUDE.md → "the game logic must not know how moves
 * arrive"). It is handed a position and a move and returns a verdict plus a new
 * position. The board island, a keyboard entry field, and — in v2 — a Durable
 * Object socket delivering an opponent's move are all just *callers*.
 *
 * ⚠️ IT IS ALSO THE chess.js BOUNDARY FOR THE CLIENT BUNDLE.
 * Replay mode parses its PGN at BUILD time, so chess.js never reaches the
 * browser for a trap page. Exercise mode genuinely needs it in the browser —
 * legality of an arbitrary dragged move cannot be precomputed. So the island
 * `await import()`s THIS module, and Vite splits it (and chess.js with it) into
 * its own chunk that only an exercise page ever downloads.
 *
 * Never import this module statically from anything the replayer renders, or
 * that split collapses and every trap page pays ~40 KB for nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Chess, type Square } from 'chess.js';

/** A move in UCI: from-square, to-square, optional promotion. `"e2e4"`, `"e7e8q"`. */
export type Uci = string;

/** The stored exercise, exactly as it comes out of the content collection. */
export interface ExerciseDefinition {
  readonly fen: string;
  /** The player's moves, in order. */
  readonly solution: readonly Uci[];
  /** `opponentReplies[i]` is played after `solution[i]`. See CLAUDE.md. */
  readonly opponentReplies: readonly Uci[];
  /** See the `onlyMove` rule — it decides the WORDING, not the acceptance. */
  readonly onlyMove: boolean;
}

/** One half-move of the solution, resolved for display. */
export interface ExerciseMove {
  readonly uci: Uci;
  readonly san: string;
  readonly from: Square;
  readonly to: Square;
  /** Whose move it is: the student, or the scripted opponent. */
  readonly by: 'player' | 'opponent';
  /** The position AFTER this move. */
  readonly fenAfter: string;
  readonly isCheck: boolean;
  readonly isCheckmate: boolean;
}

/** One step: the position the student is asked to move from. */
export interface ExerciseStep {
  /** 0-based index into `solution`. */
  readonly index: number;
  /** The position the student sees and plays from. */
  readonly fen: string;
  readonly turn: 'white' | 'black';
  /** Legal destinations from each occupied square — Chessground's `dests`. */
  readonly dests: ReadonlyMap<string, readonly string[]>;
  /** The expected player move at this step. */
  readonly expected: ExerciseMove;
  /** The scripted reply that follows it, if the line continues. */
  readonly reply: ExerciseMove | undefined;
}

/**
 * The verdict on a move the student played.
 *
 * `off-line` is NOT `wrong`, and the difference is the whole point of the
 * `onlyMove` rule. See CLAUDE.md:
 *
 *   onlyMove: true  → a non-matching move IS wrong. The stored line is the only
 *                     one that works (a forced mate, a single tactic).
 *   onlyMove: false → a non-matching move is merely off our line. It may well
 *                     win too; we cannot yet prove it does not, and telling a
 *                     beginner that a winning move is an error is worse than
 *                     shipping no validation at all.
 *
 * `illegal` should be unreachable through the board — Chessground is given
 * `dests` and refuses anything else — but the engine still checks, because
 * "the UI won't let that happen" is not a rule, it is a hope.
 */
export type Verdict =
  | { readonly kind: 'correct'; readonly move: ExerciseMove }
  | { readonly kind: 'wrong'; readonly san: string }
  | { readonly kind: 'off-line'; readonly san: string }
  | { readonly kind: 'illegal' };

/** UCI → the `{from,to,promotion}` object chess.js wants. */
function toMoveArg(uci: Uci): { from: string; to: string; promotion?: string } {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return promotion ? { from, to, promotion } : { from, to };
}

/** The legal-destination map Chessground consumes. */
function destsOf(game: Chess): Map<string, string[]> {
  const dests = new Map<string, string[]>();
  for (const move of game.moves({ verbose: true })) {
    const list = dests.get(move.from);
    if (list) list.push(move.to);
    else dests.set(move.from, [move.to]);
  }
  return dests;
}

function describe(game: Chess, uci: Uci, by: 'player' | 'opponent'): ExerciseMove {
  const move = game.move(toMoveArg(uci));
  return {
    uci,
    san: move.san,
    from: move.from,
    to: move.to,
    by,
    fenAfter: move.after,
    // Asked of the resulting position rather than sniffed off the SAN suffix,
    // for the same reason replay.ts does it: the board and the text must agree.
    isCheck: new Chess(move.after).isCheck(),
    isCheckmate: new Chess(move.after).isCheckmate(),
  };
}

/**
 * The whole exercise, resolved once.
 *
 * Throws if the stored line is not legal from the stored FEN. That is the
 * correct behaviour: `scripts/check-content.mjs` runs the same replay at build
 * time, so a throw here means content and validator have drifted, and a loud
 * failure beats a board that silently refuses every move a student plays.
 */
export interface ResolvedExercise {
  readonly steps: readonly ExerciseStep[];
  /** Every half-move of the line, player and opponent interleaved. */
  readonly line: readonly ExerciseMove[];
  readonly onlyMove: boolean;
  /** True when the line ends in mate — used for the completion message. */
  readonly endsInMate: boolean;
}

export function resolveExercise(definition: ExerciseDefinition): ResolvedExercise {
  const { fen, solution, opponentReplies, onlyMove } = definition;

  const game = new Chess(fen);
  const steps: ExerciseStep[] = [];
  const line: ExerciseMove[] = [];

  for (let index = 0; index < solution.length; index++) {
    const stepFen = game.fen();
    const turn: 'white' | 'black' = game.turn() === 'w' ? 'white' : 'black';
    const dests = destsOf(game);

    const expectedUci = solution[index];
    if (expectedUci === undefined) break;
    const expected = describe(game, expectedUci, 'player');
    line.push(expected);

    const replyUci = opponentReplies[index];
    const reply = replyUci === undefined ? undefined : describe(game, replyUci, 'opponent');
    if (reply) line.push(reply);

    steps.push({ index, fen: stepFen, turn, dests, expected, reply });
  }

  return { steps, line, onlyMove, endsInMate: game.isCheckmate() };
}

/**
 * Judge a move the student played, at `step`.
 *
 * PROMOTION. Chessground reports only from/to; the promotion piece is decided
 * here. When the expected move at this step is a promotion on the same squares
 * we adopt ITS piece, so a student who drags the pawn home is never failed for
 * an under-promotion they were never asked about. Otherwise it defaults to a
 * queen. v1 has no promotion picker — no exercise needs one yet, and a chooser
 * that appears once in the whole site is a worse first encounter than a
 * sensible default. Add one with the first under-promotion exercise.
 */
export function judgeMove(
  step: ExerciseStep,
  from: string,
  to: string,
  onlyMove: boolean,
): Verdict {
  const expected = step.expected;
  const isPromotion = expected.uci.length > 4 && expected.from === from && expected.to === to;
  const played: Uci = isPromotion ? `${from}${to}${expected.uci[4]}` : `${from}${to}`;

  if (played === expected.uci) return { kind: 'correct', move: expected };

  // Legality on a throwaway board: judging must never mutate the caller's state,
  // and an illegal move must not leave a half-applied position behind.
  const probe = new Chess(step.fen);
  let san: string;
  try {
    san = probe.move(toMoveArg(played)).san;
  } catch {
    // chess.js rejects a pawn reaching the last rank with no promotion piece.
    // Retry as a queen so a legal promotion is judged as a move, not as noise.
    try {
      san = probe.move({ ...toMoveArg(played), promotion: 'q' }).san;
    } catch {
      return { kind: 'illegal' };
    }
  }

  return onlyMove ? { kind: 'wrong', san } : { kind: 'off-line', san };
}
