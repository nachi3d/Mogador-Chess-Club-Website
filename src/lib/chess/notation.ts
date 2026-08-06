/**
 * Typed move text → a concrete move on a position.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS MODULE IS PURE. No DOM, no Preact, no Chessground, no async.
 *
 * It exists so that a reader who cannot use a mouse can play. The board takes
 * pointer input only — Chessground has no keyboard interface — which until now
 * meant a solver could read an exercise and not answer it. This is the other
 * input, and it feeds the SAME judge/apply path as a drag: it resolves text to
 * a `{ from, to }` pair and hands that over. Nothing downstream can tell which
 * input a move arrived from, which is the whole point (CLAUDE.md → the game
 * logic must not know how moves arrive).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT ACCEPTS
 *   SAN            Bc4, Nxe5, exd5, O-O, O-O-O, e8=Q, Qh4+, Rxf7#
 *   French SAN     Fc4, Cxe5, O-O, e8=D  (R roi, D dame, T tour, F fou, C cavalier)
 *   Coordinates    f1c4, e7e8q          (what the board itself emits)
 *
 * Also tolerated, because people type them: `0-0` for castling, lowercase
 * `o-o`, trailing `!?`, and stray spaces.
 */

import { Chess } from 'chess.js';

export interface ParsedMove {
  readonly from: string;
  readonly to: string;
  readonly promotion?: string | undefined;
  /** Standard English SAN of the resolved move — for announcing it back. */
  readonly san: string;
}

/**
 * Three outcomes, deliberately distinct.
 *
 * `illegal` means "I understood you, that move is not available here";
 * `unreadable` means "I could not read that as a move at all". Collapsing them
 * into one error makes the site tell a beginner their legal-looking move is
 * illegal when in fact it was a typo — the same class of lie the `onlyMove`
 * rule exists to prevent.
 */
export type MoveTextResult =
  | { readonly kind: 'ok'; readonly move: ParsedMove }
  | { readonly kind: 'illegal' }
  | { readonly kind: 'unreadable' };

/**
 * French piece letters → English. Uppercase only, which is what makes this
 * safe: SAN piece letters are uppercase and file letters are lowercase, so
 * mapping `F` (fou) can never eat the f-file in `fxe5`.
 */
const FRENCH_PIECES: Readonly<Record<string, string>> = {
  R: 'K', // roi
  D: 'Q', // dame
  T: 'R', // tour
  F: 'B', // fou
  C: 'N', // cavalier
};

/** Anything that looks like it was MEANT to be a move. See `unreadable`. */
const SAN_SHAPE = /^(?:[KQRBNPRDTFC]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTF])?|O-O(?:-O)?)$/;
const COORDINATE_SHAPE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Trim, unify castling, drop decorations chess.js does not need. */
function normalise(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '')
    // 0-0 and o-o are what people actually type; SAN wants capital letter O.
    .replace(/[0o]-[0o]-[0o]/i, 'O-O-O')
    .replace(/[0o]-[0o]/i, 'O-O')
    // Annotation glyphs and the check/mate marks: never load-bearing for
    // resolving a move, and a wrong one should not make a good move unreadable.
    .replace(/[+#?!]+$/, '');
}

/** Swap French piece letters for English ones. Leaves everything else alone. */
function toEnglishPieces(san: string): string {
  return san.replace(/[RDTFC]/g, (letter) => FRENCH_PIECES[letter] ?? letter);
}

/** Try one candidate string on a throwaway board. */
function attempt(fen: string, candidate: string): ParsedMove | null {
  try {
    const board = new Chess(fen);
    const move = board.move(candidate);
    return {
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      san: move.san,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve typed text against a position.
 *
 * ⚠️ LOCALE CHANGES THE MEANING OF `R`, and there is no way around it: in
 * English SAN `R` is a rook, in French it is the king (roi). So the reader's
 * own language wins first, and the other reading is tried only if the first is
 * not legal here. On the French page `Rf1` is the king if the king can go
 * there, and the rook otherwise — which is what a French speaker means, while
 * still not rejecting someone typing English notation out of habit.
 */
export function resolveMoveText(fen: string, text: string, locale: 'fr' | 'en'): MoveTextResult {
  const cleaned = normalise(text);
  if (cleaned.length === 0) return { kind: 'unreadable' };

  if (COORDINATE_SHAPE.test(cleaned)) {
    const from = cleaned.slice(0, 2);
    const to = cleaned.slice(2, 4);
    const promotion = cleaned.length > 4 ? cleaned[4] : undefined;
    const move = tryObject(fen, from, to, promotion);
    return move ? { kind: 'ok', move } : { kind: 'illegal' };
  }

  const english = toEnglishPieces(cleaned);
  // Case matters to chess.js, but people type `bc4` meaning `Bc4`. Only try the
  // capitalised variant as a fallback: `bc4` is also a legal pawn move spelling.
  const capitalised = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const candidates =
    locale === 'fr'
      ? [english, cleaned, toEnglishPieces(capitalised), capitalised]
      : [cleaned, english, capitalised, toEnglishPieces(capitalised)];

  for (const candidate of candidates) {
    const move = attempt(fen, candidate);
    if (move) return { kind: 'ok', move };
  }

  // Understood the shape, could not play it — versus genuine gibberish.
  const looksLikeAMove = candidates.some((c) => SAN_SHAPE.test(c));
  return looksLikeAMove ? { kind: 'illegal' } : { kind: 'unreadable' };
}

/** Coordinate form: chess.js takes the object, not a string. */
function tryObject(
  fen: string,
  from: string,
  to: string,
  promotion: string | undefined,
): ParsedMove | null {
  try {
    const board = new Chess(fen);
    const move = board.move(promotion ? { from, to, promotion } : { from, to });
    return { from: move.from, to: move.to, promotion: move.promotion, san: move.san };
  } catch {
    // A pawn landing on the last rank with no piece named: chess.js rejects it
    // outright rather than assuming. Queen is the only sane default.
    if (promotion) return null;
    try {
      const board = new Chess(fen);
      const move = board.move({ from, to, promotion: 'q' });
      return { from: move.from, to: move.to, promotion: move.promotion, san: move.san };
    } catch {
      return null;
    }
  }
}
