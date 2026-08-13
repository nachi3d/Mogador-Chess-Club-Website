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

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
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

/**
 * Lessons are Markdown pairs in per-course subdirectories, not flat JSON, so
 * they need their own reader.
 *
 * The frontmatter is written with JSON scalars (which YAML accepts), so each
 * value parses with `JSON.parse`. A hand-edited plain-YAML value falls back to
 * the trimmed string rather than throwing — the schema is the real validator;
 * this reader only has to get far enough to check the chess.
 */
const readLessons = () => {
  const root = join(CONTENT, 'lessons');
  if (!existsSync(root)) return [];
  const out = [];
  for (const course of readdirSync(root)) {
    const dir = join(root, course);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).filter((f) => /\.mdx?$/.test(f))) {
      const text = readFileSync(join(dir, name), 'utf8');
      const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!m) {
        fail(`lessons/${course}/${name}`, 'no frontmatter block');
        continue;
      }
      const data = {};
      for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i === -1) continue;
        const key = line.slice(0, i).trim();
        const raw = line.slice(i + 1).trim();
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw.replace(/^["']|["']$/g, '');
        }
      }
      out.push({ file: `lessons/${course}/${name}`, data, body: text.slice(m[0].length) });
    }
  }
  return out;
};

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

/* ─────────────────────────── claims ───────────────────────────── */

/**
 * ⚠️ ASSERT THE MECHANISM THE PROSE CLAIMS — see CLAUDE.md → content authoring.
 *
 * Everything above proves a position is POSSIBLE and a line is LEGAL. None of
 * it can read the sentence printed beside the board, and that is where authored
 * content actually goes wrong. Content batch 3 shipped four boards that passed
 * every check here and each described a mechanism the position did not contain:
 *
 *   le clouage     "the knight cannot move" — a pawn on d7 blocked the pinning
 *                  diagonal and the knight had five legal moves. That is the
 *                  commonest wrong idea about the Ruy Lopez, about to ship as
 *                  fact to beginners.
 *   la découverte  the bishop was on b3, which does not see h8 at all, and the
 *                  "screen" knight was not on its diagonal either.
 *   l'attraction   the forking knight could simply be captured by a pawn.
 *   la surcharge   the recapture came with check, and the recaptured queen
 *                  covered the mating square anyway.
 *
 * So a board may declare what it claims, and the claim is checked. Each
 * assertion is a property OF THE POSITION — no search, no evaluation.
 *
 * Returns an array of human-readable problems; empty means the claim holds.
 */
function assertClaim(fen, claim) {
  const bad = [];
  let game;
  try {
    game = new Chess(fen);
  } catch (error) {
    return [`FEN rejected before the claim could be checked — ${error.message}`];
  }

  /* `after` lets a caption describe the position it is ABOUT to reach. */
  for (const [i, move] of (claim.after ?? []).entries()) {
    try {
      game.move(uci(move));
    } catch {
      return [`claim.after[${i}] "${move}" is not legal in ${game.fen()}`];
    }
  }
  const at = game.fen();

  /** Does anything of `colour` attack `sq`? Works for kings and empty squares. */
  const attackedFrom = (position, sq, colour) => new Chess(position).attackers(sq, colour);

  if (claim.kind === 'pin') {
    const piece = game.get(claim.piece);
    if (!piece) return [`claim pin: no piece on ${claim.piece}`];

    /* Mobility has to be judged as the OWNER of the pinned piece, which is
       usually not the side to move in a diagram. */
    const owned = at.replace(/ (w|b) /, ` ${piece.color} `);
    let mobile;
    try {
      mobile = new Chess(owned).moves({ verbose: true }).filter((m) => m.from === claim.piece);
    } catch (error) {
      return [`claim pin: could not evaluate ${claim.piece} — ${error.message}`];
    }
    if (mobile.length > 0) {
      bad.push(
        `claim pin: the piece on ${claim.piece} has ${mobile.length} legal move(s) ` +
          `(${mobile.map((m) => m.san).join(' ')}) — it is NOT pinned. An intervening ` +
          'pawn on the pinning line is the usual cause, and is exactly the mistake ' +
          'this check exists to catch.',
      );
    }

    /* A piece with no moves might merely be blocked in. What makes it a PIN is
       that removing it exposes its own king. */
    const exposed = new Chess(owned);
    exposed.remove(claim.piece);
    const king = exposed
      .board()
      .flat()
      .find((s) => s && s.type === 'k' && s.color === piece.color);
    if (!king) {
      bad.push(`claim pin: no ${piece.color} king on the board`);
    } else if (attackedFrom(exposed.fen(), king.square, piece.color === 'w' ? 'b' : 'w').length === 0) {
      bad.push(
        `claim pin: removing the piece on ${claim.piece} leaves the ${piece.color} king ` +
          'unattacked, so nothing is pinned — the piece is merely blocked in.',
      );
    }
  }

  if (claim.kind === 'fork') {
    const forker = game.get(claim.from);
    if (!forker) return [`claim fork: no piece on ${claim.from}`];
    for (const target of claim.targets) {
      const hits = attackedFrom(at, target, forker.color);
      if (!hits.includes(claim.from)) {
        bad.push(
          `claim fork: the piece on ${claim.from} does NOT attack ${target} ` +
            `(attackers of ${target}: ${hits.join(', ') || 'none'})`,
        );
        continue;
      }
      const victim = game.get(target);
      if (!victim) {
        bad.push(`claim fork: ${target} is empty — a fork attacks two PIECES`);
      } else if (victim.color === forker.color) {
        bad.push(`claim fork: the piece on ${target} is the forker's own`);
      }
    }
  }

  if (claim.kind === 'discovery') {
    const by = game.get(claim.by);
    if (!by) return [`claim discovery: no piece on ${claim.by}`];
    if (!game.get(claim.screen)) return [`claim discovery: no piece on ${claim.screen}`];

    if (attackedFrom(at, claim.target, by.color).includes(claim.by)) {
      bad.push(
        `claim discovery: the piece on ${claim.by} ALREADY attacks ${claim.target} ` +
          'with the screen still there — nothing is discovered.',
      );
    }
    const lifted = new Chess(at);
    lifted.remove(claim.screen);
    if (!attackedFrom(lifted.fen(), claim.target, by.color).includes(claim.by)) {
      bad.push(
        `claim discovery: with ${claim.screen} removed, the piece on ${claim.by} still ` +
          `does not attack ${claim.target} — it is not on that line at all.`,
      );
    }
  }

  if (claim.kind === 'line') {
    let last;
    for (const [i, move] of claim.moves.entries()) {
      try {
        last = game.move(uci(move));
      } catch {
        bad.push(`claim line: move[${i}] "${move}" is not legal in ${game.fen()}`);
        return bad;
      }
    }
    const ends =
      game.isCheckmate() ? 'mate'
      : game.isStalemate() ? 'stalemate'
      : game.isCheck() ? 'check'
      : 'quiet';
    if (ends !== claim.ends) {
      bad.push(`claim line: the line ends "${ends}", not "${claim.ends}"`);
    }
    if (claim.captures && last?.captured !== claim.captures) {
      bad.push(
        `claim line: the last move captures ${last?.captured ?? 'nothing'}, not ` +
          `"${claim.captures}"`,
      );
    }
  }

  return bad;
}

/** Boards a machine could not vouch for. Printed, never silently skipped. */
const manualReview = [];
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

  /**
   * ⚠️ TRAP CLAIMS ARE ANCHORED TO A PLY.
   *
   * A trap has a PGN, not a FEN, so a claim has to say WHICH position it is
   * about — on the same 0-based scheme as `moveComments`, meaning the position
   * AFTER that half-move, with -1 for the start. `after`/`moves` then continue
   * from there, which is what lets a claim prove a refutation the PGN does not
   * contain.
   *
   * A claim with no `ply` is rejected rather than defaulted: guessing a base
   * position would prove something true about the wrong move, which is the
   * exact failure mode claims exist to remove.
   */
  for (const claim of data.claims ?? []) {
    if (claim.kind === 'manual') {
      if (!String(claim.note ?? '').trim()) {
        fail(file, 'a manual claim needs a note saying what a human must check');
      } else {
        manualReview.push(`${file} (trap) — ${claim.note}`);
      }
      continue;
    }
    if (!Number.isInteger(claim.ply)) {
      fail(file, `claim ${claim.kind}: needs a "ply" naming the position it is about`);
      continue;
    }
    if (claim.ply < -1 || claim.ply >= plies) {
      fail(
        file,
        `claim ${claim.kind}: ply ${claim.ply} is outside the game (0..${plies - 1}, or -1 for the start)`,
      );
      continue;
    }
    const base = claim.ply === -1 ? new Chess().fen() : history[claim.ply].after;
    for (const problem of assertClaim(base, claim)) {
      fail(file, `claim at ply ${claim.ply}: ${problem}`);
    }
  }

  const claimCount = (data.claims ?? []).length;
  console.log(
    `  ok  ${file} — ${plies} plies, ${comments.length} comment(s), ${shapes.length} shape group(s)` +
      (claimCount ? `, ${claimCount} claim(s)` : ''),
  );
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

/* ──────────────────────────── lessons ──────────────────────────── */

/**
 * Course lesson pairs — `<lesson>.fr.md` / `<lesson>.en.md`.
 *
 * Everything checkable is checked, because these files are hand-authored and a
 * wrong FEN or a mis-numbered ply produces a page that looks right and teaches
 * something false:
 *
 *   - every FEN parses, has six fields, and matches the side to move implied
 *     by whose move the exercise asks for;
 *   - every solution is legal from its FEN;
 *   - every PGN parses, and every comment ply is INSIDE the game;
 *   - `order` is contiguous 1..N per course and per language;
 *   - the fr/en pair agrees on every language-NEUTRAL board field, which is the
 *     price of one-language-per-file and therefore has to be enforced;
 *   - no half-translated pair (a lesson present in one language only).
 */
const lessonFiles = readLessons();
const byKey = new Map();

for (const { file, data } of lessonFiles) {
  const key = `${data.course}/${data.slug}`;
  if (!byKey.has(key)) byKey.set(key, {});
  const slot = byKey.get(key);
  if (slot[data.lang]) fail(file, `duplicate ${data.lang} file for ${key}`);
  slot[data.lang] = { file, data };

  for (const [i, board] of (data.boards ?? []).entries()) {
    const where = `board ${i} (${board.kind})`;

    /**
     * ⚠️ The claim check runs on the FR file only. The claims are
     * language-neutral and the pair check below proves the two agree, so
     * running both would double every message for one fact.
     */
    if (board.kind === 'position' || board.kind === 'exercise') {
      const claims = board.claims ?? [];
      if (data.lang === 'fr') {
        if (claims.length === 0) {
          manualReview.push(`${file} ${where} — no claim declared`);
        }
        for (const claim of claims) {
          /* A lesson board has its own FEN, so a ply indexes nothing. Silently
             ignoring it would leave the author believing a claim was anchored
             somewhere it was not. */
          if (claim.ply !== undefined) {
            fail(
              file,
              `${where}: claim ${claim.kind} carries a "ply", which only a trap ` +
                'claim may have — this board has its own FEN, so there is nothing to index',
            );
            continue;
          }
          if (claim.kind === 'manual') {
            manualReview.push(`${file} ${where} — ${claim.note}`);
            continue;
          }
          for (const problem of assertClaim(board.fen, claim)) {
            fail(file, `${where}: ${problem}`);
          }
        }
      }
    }

    if (board.kind === 'replay') {
      const game = new Chess();
      try {
        game.loadPgn(board.pgn);
      } catch (error) {
        fail(file, `${where}: PGN rejected — ${error.message}`);
        continue;
      }
      const plies = game.history().length;
      for (const c of board.comments ?? []) {
        if (c.ply >= plies) {
          fail(
            file,
            `${where}: comment ply ${c.ply} is past the end (last ply is ${plies - 1}). ` +
              'Ply 0 is the FIRST half-move — 1-based numbering silently attaches ' +
              'commentary to the wrong move.',
          );
        }
        if (!String(c.text ?? '').trim()) fail(file, `${where}: empty comment at ply ${c.ply}`);
      }
    }

    /**
     * A still diagram. It illustrates a claim in the prose, so the position has
     * to be legal AND has to be the thing the prose says it is — a "this is
     * what mate looks like" board that is not actually mate teaches the wrong
     * picture, and nothing else would catch it.
     *
     * ⚠️ chess.js accepts a position where the side NOT to move is in check,
     * which is impossible in a real game. Batch 2 shipped one: a finished mate
     * written with White to move. It renders, it looks right, and it is not a
     * position that can occur.
     */
    if (board.kind === 'position') {
      if (board.fen.trim().split(/\s+/).length !== 6) {
        fail(file, `${where}: FEN must have all six fields`);
        continue;
      }
      let game;
      try {
        game = new Chess(board.fen);
      } catch (error) {
        fail(file, `${where}: FEN rejected — ${error.message}`);
        continue;
      }
      /* Is the side that is NOT to move in check? Then the position is
         unreachable: the previous player left their own king attacked. */
      const flipped = board.fen.replace(/ (w|b) /, (m, c) => ` ${c === 'w' ? 'b' : 'w'} `);
      try {
        if (new Chess(flipped).isCheck()) {
          fail(
            file,
            `${where}: the side NOT to move is in check — impossible position. ` +
              'If this is meant to show a finished mate, the mated side must be to move.',
          );
        }
      } catch {
        /* If the flip does not load, the original already told us what we need. */
      }
      if (!String(board.caption ?? '').trim()) fail(file, `${where}: caption is empty`);
    }

    if (board.kind === 'exercise') {
      if (board.fen.trim().split(/\s+/).length !== 6) {
        fail(file, `${where}: FEN must have all six fields`);
        continue;
      }
      let game;
      try {
        game = new Chess(board.fen);
      } catch (error) {
        fail(file, `${where}: FEN rejected — ${error.message}`);
        continue;
      }
      /* The orientation, when stated, must match whose move it is — otherwise
         the reader is shown the board from the wrong side and asked to move
         pieces they are not playing. */
      if (board.orientation) {
        const turn = game.turn() === 'w' ? 'white' : 'black';
        if (board.orientation !== turn) {
          fail(file, `${where}: orientation "${board.orientation}" but ${turn} is to move`);
        }
      }
      for (const move of board.solution) {
        try {
          game.move(uci(move));
        } catch {
          fail(file, `${where}: solution move "${move}" is illegal`);
          break;
        }
      }
      for (const f of ['task', 'hint']) {
        if (!String(board[f] ?? '').trim()) fail(file, `${where}: ${f} is empty`);
      }
    }
  }

  for (const f of ['title', 'summary']) {
    if (!String(data[f] ?? '').trim()) fail(file, `${f} is empty`);
  }
}

/** Language-neutral board fields must agree across the pair. */
const NEUTRAL = [
  'kind',
  'fen',
  'pgn',
  'solution',
  'opponentReplies',
  'onlyMove',
  'orientation',
  /* A claim is an assertion about the CHESS, so the pair must agree on it —
     otherwise one language ships a board nothing ever checked. */
  'claims',
];
for (const [key, pair] of byKey) {
  if (!pair.fr || !pair.en) {
    fail(pair.fr?.file ?? pair.en?.file ?? key, `missing the ${pair.fr ? 'en' : 'fr'} half of the pair`);
    continue;
  }
  if (pair.fr.data.order !== pair.en.data.order) {
    fail(pair.fr.file, `order differs across the pair (${pair.fr.data.order} vs ${pair.en.data.order})`);
  }
  const a = pair.fr.data.boards ?? [];
  const b = pair.en.data.boards ?? [];
  if (a.length !== b.length) {
    fail(pair.fr.file, `board count differs across the pair (${a.length} vs ${b.length})`);
    continue;
  }
  for (let i = 0; i < a.length; i++) {
    for (const f of NEUTRAL) {
      if (JSON.stringify(a[i][f]) !== JSON.stringify(b[i][f])) {
        fail(
          pair.fr.file,
          `board ${i}: "${f}" differs across the fr/en pair — language-neutral ` +
            'board data must be identical, or the two languages teach different chess',
        );
      }
    }
    const ca = (a[i].comments ?? []).map((c) => c.ply).join(',');
    const cb = (b[i].comments ?? []).map((c) => c.ply).join(',');
    if (ca !== cb) fail(pair.fr.file, `board ${i}: comment plies differ across the pair`);
  }
  console.log(`  ok  lessons/${key} — pair complete, ${a.length} board(s)`);
}

/** Order must be contiguous 1..N within each course, per language. */
const byCourseLang = new Map();
for (const { data } of lessonFiles) {
  const k = `${data.course}:${data.lang}`;
  if (!byCourseLang.has(k)) byCourseLang.set(k, []);
  byCourseLang.get(k).push(data.order);
}
for (const [k, orders] of byCourseLang) {
  const sorted = [...orders].sort((x, y) => x - y);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      fail(`lessons/${k}`, `order must be 1..${sorted.length} with no gaps — found ${sorted.join(', ')}`);
      break;
    }
  }
}

/* ─────────────────────────── tutoriel ──────────────────────────── */

/**
 * The beginner tutorial ships 13 hand-written positions, which is exactly the
 * kind of content where a typo in a FEN produces a page that looks fine and
 * teaches something false. Everything checkable is checked:
 *
 *   - the FEN parses and carries all six fields;
 *   - the solution is legal from it;
 *   - `onlyMove: true` on a mate-in-1 is genuinely unique;
 *   - the steps form a contiguous ordered sequence with no duplicate slugs,
 *     because the prev/next navigation walks that order and a gap or a repeat
 *     silently strands a reader mid-tutorial;
 *   - neither language of any prose field is empty.
 */
const tutorialSlugs = new Map();
const tutorialOrders = [];

for (const { file, data } of readCollection('tutoriel')) {
  const seen = tutorialSlugs.get(data.slug);
  if (seen) fail(file, `slug "${data.slug}" is already used by ${seen}`);
  else tutorialSlugs.set(data.slug, file);

  if (data.fen.trim().split(/\s+/).length !== 6) {
    fail(file, 'FEN must have all six fields — a four-field FEN silently assumes White');
  }

  let game;
  try {
    game = new Chess(data.fen);
  } catch (error) {
    fail(file, `FEN rejected: ${error.message}`);
    continue;
  }

  let legal = true;
  for (const move of data.solution) {
    try {
      game.move(uci(move));
    } catch {
      fail(file, `solution move "${move}" is not legal from the position it arrives at`);
      legal = false;
      break;
    }
  }
  if (!legal) continue;

  /* A tutorial that says "wrong" when the reader found another mate would be
     the exact lie the onlyMove rule exists to prevent. */
  if (data.onlyMove === true && data.solution.length === 1 && game.isCheckmate()) {
    const mates = forcedMateMoves(data.fen, 1);
    if (mates.length > 1) {
      fail(file, `onlyMove:true but ${mates.length} different moves mate: ${mates.join(', ')}`);
    }
  }

  for (const field of ['title', 'summary', 'task', 'hint']) {
    for (const lang of ['fr', 'en']) {
      if (!String(data[`${field}_${lang}`] ?? '').trim()) {
        fail(file, `${field}_${lang} is empty — a half-translated step ships one language`);
      }
    }
  }
  for (const lang of ['fr', 'en']) {
    const body = data[`body_${lang}`] ?? [];
    if (!body.length || body.some((p) => !String(p).trim())) {
      fail(file, `body_${lang} is empty or has a blank paragraph`);
    }
  }

  tutorialOrders.push({ file, order: data.order });
  const end = game.isCheckmate() ? 'mate' : game.isStalemate() ? 'stalemate' : 'quiet';
  console.log(`  ok  ${file} — step ${data.order}, ${data.solution.join(' ')} → ${end}`);
}

if (tutorialOrders.length > 0) {
  const orders = tutorialOrders.map((t) => t.order).sort((a, b) => a - b);
  const dupes = orders.filter((o, i) => i > 0 && o === orders[i - 1]);
  if (dupes.length) {
    fail('tutoriel', `duplicate order value(s): ${[...new Set(dupes)].join(', ')}`);
  }
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      fail(
        'tutoriel',
        `steps must be numbered 1..${orders.length} with no gaps — found ${orders.join(', ')}`,
      );
      break;
    }
  }
}

/* ─────────────────────────── agenda ──────────────────────────────

   ⚠️ NO LONGER A COLLECTION. Sessions come from the database, baked into
   `src/data/agenda.json` by `scripts/fetch-agenda.mjs`. What is checkable here
   is the SNAPSHOT — a file a person can hand-edit, that no Zod schema guards,
   and that the whole public agenda is rendered from. */

{
  /* ⚠️ THE COMMITTED FILE, NOT THE ARTEFACT. `src/data/agenda.json` is
     generated at build time and gitignored — checking it would mean checking
     whatever the last build happened to fetch, which is not a property of this
     repository. The fallback is what a person edits and what ships when a build
     has no credentials. */
  const snapshotPath = new URL('../src/data/agenda.fallback.json', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1',
  );
  const file = 'src/data/agenda.fallback.json';
  let snapshot = null;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (error) {
    fail(file, `unreadable or invalid JSON — ${error.message}`);
  }
  if (snapshot) {
    if (!Array.isArray(snapshot.sessions)) {
      fail(file, 'no `sessions` array — the agenda would render empty');
    } else {
      const seen = new Set();
      for (const s of snapshot.sessions) {
        const where = `${file} [${s?.id ?? '?'}]`;
        if (!s?.id) fail(where, 'a session with no id');
        else if (seen.has(s.id)) fail(where, 'duplicate session id');
        else seen.add(s.id);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.date ?? '')) fail(where, `bad date "${s?.date}"`);
        if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s?.time ?? '')) fail(where, `bad time "${s?.time}"`);
        /* ⚠️ `draft` must never reach this file. The snapshot is public — it is
           compiled into every visitor's HTML — so a draft here is an unannounced
           session published by accident. */
        if (!['published', 'cancelled'].includes(s?.status)) {
          fail(where, `status "${s?.status}" is not publishable`);
        }
      }
      console.log(`  ok  ${file} — ${snapshot.sessions.length} session(s), zone ${snapshot.timezone}`);
    }
  }
}

/* ───────────────────── the manual review queue ─────────────────── */

/**
 * ⚠️ NOT A WARNING TO SCROLL PAST — it is the list of diagrams whose meaning
 * no machine vouched for.
 *
 * A claim like "the king must step aside and then the queen falls" needs a
 * forcing-line search, which is not a property of a position and is therefore
 * not something `assertClaim` can honestly state. Those boards declare
 * `kind: 'manual'` with a note, and land here. So does a board with no claim at
 * all — silence is the failure mode this whole section exists to remove.
 *
 * It does NOT fail the build: most of it is content that predates claims, and
 * failing would mean either retrofitting every board in one go or switching the
 * check off. A visible queue that shrinks is worth more than a red build
 * somebody disables.
 */
if (manualReview.length > 0) {
  console.log(`\n  ${manualReview.length} board(s) a machine cannot vouch for — read these by hand:`);
  for (const entry of manualReview) console.log(`  ..    ${entry}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} content problem(s):`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error('');
  process.exit(1);
}
console.log('\nAll content is legal chess, and every declared claim holds.\n');
