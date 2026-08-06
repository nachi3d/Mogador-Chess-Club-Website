/**
 * Mogador Chess Club — chess validity check for the content collections.
 *
 *   node scripts/check-content.mjs
 *
 * The Zod schemas in src/content.config.ts prove a trap or exercise is
 * well-SHAPED. They cannot prove it is legal chess: "e2e5" is a perfectly valid
 * UCI string and a perfectly illegal move. This script replays every line
 * through chess.js and fails loudly if it does not hold up.
 *
 * What it checks:
 *   traps      — the PGN parses and every `notes[].ply` points at a real move.
 *   exercices  — the FEN parses; solution and opponentReplies interleave into a
 *                legal game; the alignment invariant from the schema holds; and
 *                if the line ends in mate, the last move actually IS mate.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';

const CONTENT = new URL('../src/content/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const problems = [];
const fail = (file, message) => problems.push(`${file}: ${message}`);

const readCollection = (name) => {
  const dir = join(CONTENT, name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: `${name}/${f}`, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
};

/* ───────────────────────────── traps ───────────────────────────── */

for (const { file, data } of readCollection('traps')) {
  const game = new Chess();
  try {
    game.loadPgn(data.pgn);
  } catch (error) {
    fail(file, `PGN does not parse — ${error.message}`);
    continue;
  }

  const plies = game.history().length;
  if (plies === 0) {
    fail(file, 'PGN parsed but contains no moves');
    continue;
  }

  // RULE 1: commentary must live in frontmatter, never inside the PGN.
  if (data.pgn.includes('{') || data.pgn.includes('}')) {
    fail(
      file,
      'PGN contains {...} commentary — bilingual prose belongs in `moveComments` (see CLAUDE.md)',
    );
  }

  /**
   * Ply bounds. A comment or an arrow pointing past the end of the game is
   * invisible in the replayer — it simply never fires. Silence is the worst
   * failure mode for content: the author believes the note shipped.
   * Numbering: ply 0 is the FIRST half-move. See src/lib/chess/replay.ts.
   */
  const checkPly = (value, where) => {
    if (!Number.isInteger(value) || value < 0) {
      fail(file, `${where} ply ${JSON.stringify(value)} is not a non-negative integer`);
      return false;
    }
    if (value >= plies) {
      fail(file, `${where} ply ${value} is past the end of the game (${plies} plies, 0-based)`);
      return false;
    }
    return true;
  };

  const comments = data.moveComments ?? [];
  for (const comment of comments) {
    if (!checkPly(comment.ply, 'moveComments[].')) continue;
    // A half-translated comment renders an empty box in one language only,
    // which is exactly the kind of gap nobody notices until a reader reports it.
    if (!comment.fr?.trim()) fail(file, `moveComments[ply ${comment.ply}].fr is empty`);
    if (!comment.en?.trim()) fail(file, `moveComments[ply ${comment.ply}].en is empty`);
  }

  const shapes = data.shapes ?? [];
  const board = new Chess();
  const history = game.history({ verbose: true });

  for (const shape of shapes) {
    if (!checkPly(shape.ply, 'shapes[].')) continue;

    /**
     * Shapes are checked against the position the replayer actually DISPLAYS
     * at this ply — the one *after* the move. This is the check that caught
     * an arrow drawn f3→e5 at the ply where the knight had already left f3:
     * the move highlight shows that move anyway, so the arrow was both wrong
     * and redundant.
     *
     * An ARROW must start on a piece: an arrow means "this piece acts on that
     * square", and one starting from thin air is an authoring mistake.
     * A CIRCLE may sit on an empty square — marking a weak or key square
     * (f7 before anything lands there, an escape square that is covered) is a
     * normal teaching device, not an error.
     */
    board.load(history[shape.ply].after);

    for (const [from, to] of shape.arrows ?? []) {
      if (!board.get(from)) {
        fail(
          file,
          `shapes[ply ${shape.ply}] arrow starts on empty square "${from}" ` +
            '(shapes are drawn on the position AFTER this ply)',
        );
      }
      if (from === to) fail(file, `shapes[ply ${shape.ply}] arrow "${from}" points at itself`);
    }
  }

  console.log(
    `  ok  ${file} — ${plies} plies, ${comments.length} comment(s), ${shapes.length} shape group(s)`,
  );
}

/* ─────────────────────────── exercices ─────────────────────────── */

/** UCI → the {from,to,promotion} object chess.js wants. */
const uci = (m) => ({
  from: m.slice(0, 2),
  to: m.slice(2, 4),
  ...(m.length > 4 ? { promotion: m[4] } : {}),
});

/**
 * Every first move that forces mate in `depth` of the side-to-move's own moves.
 *
 * Used to police `onlyMove: true`. Depth is capped by the caller because this
 * is a plain minimax over legal moves — fine at depth 2 for the puzzle-sized
 * positions we ship, and not something to point at a middlegame.
 */
function forcedMateMoves(fen, depth) {
  const game = new Chess(fen);
  const winners = [];
  for (const move of game.moves({ verbose: true })) {
    const after = new Chess(fen);
    after.move(move.san);

    if (after.isCheckmate()) {
      if (depth === 1) winners.push(move.san);
      continue;
    }
    if (depth === 1 || after.isStalemate() || after.isDraw()) continue;

    const defences = after.moves({ verbose: true });
    if (defences.length === 0) continue;
    const everyDefenceLoses = defences.every((defence) => {
      const next = new Chess(after.fen());
      next.move(defence.san);
      return forcedMateMoves(next.fen(), depth - 1).length > 0;
    });
    if (everyDefenceLoses) winners.push(move.san);
  }
  return winners;
}

const exerciseSlugs = new Map();

for (const { file, data } of readCollection('exercices')) {
  // A duplicate slug silently overwrites a published URL — one of the two
  // exercises would simply stop existing, with no error anywhere.
  const seen = exerciseSlugs.get(data.slug);
  if (seen) fail(file, `slug "${data.slug}" is already used by ${seen}`);
  else exerciseSlugs.set(data.slug, file);

  // A hint missing in one language renders an empty box for that reader only —
  // the gap nobody notices until someone reports it. Same rule as moveComments.
  if (!data.hint_fr?.trim()) fail(file, 'hint_fr is empty');
  if (!data.hint_en?.trim()) fail(file, 'hint_en is empty');

  // Six fields, because the side to move and the castling rights are part of
  // the puzzle. A four-field FEN parses in chess.js and silently assumes white.
  const fenFields = String(data.fen ?? '').trim().split(/\s+/);
  if (fenFields.length !== 6) {
    fail(file, `FEN has ${fenFields.length} field(s), expected 6 — side to move matters`);
  }

  let game;
  try {
    game = new Chess(data.fen);
  } catch (error) {
    fail(file, `FEN does not parse — ${error.message}`);
    continue;
  }

  const startFen = game.fen();
  const playerColor = game.turn();
  const solution = data.solution ?? [];
  const replies = data.opponentReplies ?? [];

  // Mirrors the .refine() in src/content.config.ts.
  if (replies.length > solution.length) {
    fail(file, `opponentReplies (${replies.length}) cannot exceed solution (${solution.length})`);
    continue;
  }

  let broke = false;
  for (let i = 0; i < solution.length; i++) {
    /**
     * The student always plays the SAME colour. If the two arrays fall out of
     * step — a missing reply, an extra one — the moves stay individually legal
     * while the board hands the student their opponent's pieces to move. The
     * board would then be asking for a move the exercise never described.
     */
    if (game.turn() !== playerColor) {
      fail(
        file,
        `solution[${i}] is played by the wrong side: the student is ${
          playerColor === 'w' ? 'white' : 'black'
        }, but it is ${game.turn() === 'w' ? "white's" : "black's"} turn. ` +
          'opponentReplies is probably one short.',
      );
      broke = true;
      break;
    }
    try {
      game.move(uci(solution[i]));
    } catch {
      fail(file, `solution[${i}] "${solution[i]}" is not legal in ${game.fen()}`);
      broke = true;
      break;
    }
    const reply = replies[i];
    if (reply === undefined) continue;
    try {
      game.move(uci(reply));
    } catch {
      fail(file, `opponentReplies[${i}] "${reply}" is not legal in ${game.fen()}`);
      broke = true;
      break;
    }
  }
  if (broke) continue;

  const mates = game.isCheckmate();
  const themed = (data.themes ?? []).includes('mat');

  // A puzzle tagged as mate that doesn't mate is the worst kind of wrong: it
  // teaches the beginner the wrong pattern with full confidence.
  if (themed && !mates) {
    fail(file, 'themed "mat" but the line does not end in checkmate');
  }

  /**
   * ⚠️ THE onlyMove POLICE — see CLAUDE.md → "Exercise validation rule".
   *
   * `onlyMove: true` makes the validator tell a student that any other move is
   * WRONG. That claim has to be true. For a short forced mate we can prove it:
   * if a second first move also mates in the same number of player moves, the
   * flag is a lie waiting to be told to whoever finds the other one.
   *
   * This is not hypothetical — it caught exactly that on `opposition-et-mat`,
   * where 1. Kf7 mates as surely as 1. Kg6 does. That exercise is `false` and
   * says "not the line we had in mind" for a reason.
   *
   * Only short mating lines are checkable, so only they are policed. A quiet
   * or longer line with onlyMove:true is left to the author's judgement.
   */
  let onlyMoveNote = '';
  if (data.onlyMove === true && mates && solution.length <= 2 && solution.length > 0) {
    const alternatives = forcedMateMoves(startFen, solution.length);
    if (alternatives.length > 1) {
      fail(
        file,
        `onlyMove is true, but ${alternatives.length} different first moves force mate in ` +
          `${solution.length} (${alternatives.join(', ')}). Set onlyMove:false, or change the ` +
          'position — telling a student that a move which also mates is "wrong" is exactly ' +
          'what the rule in CLAUDE.md forbids.',
      );
    } else {
      onlyMoveNote = `, mate is unique (${alternatives.join('') || 'none found'})`;
    }
  }

  const note = mates
    ? `ends in mate, onlyMove=${data.onlyMove === true}${onlyMoveNote}`
    : `ends quiet (${game.turn() === 'w' ? 'white' : 'black'} to move)`;

  console.log(`  ok  ${file} — ${solution.length} player move(s), ${note}`);
}

/* ─────────────────────────── agenda ────────────────────────────── */

for (const { file, data } of readCollection('agenda')) {
  if (Number.isNaN(new Date(data.date).getTime())) fail(file, `unparseable date "${data.date}"`);
  console.log(`  ok  ${file} — ${data.date} ${data.time}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} content problem(s):`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error('');
  process.exit(1);
}
console.log('\nAll content is legal chess.\n');
