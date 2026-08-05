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
    fail(file, 'PGN contains {...} commentary — bilingual prose belongs in `notes` (see CLAUDE.md)');
  }

  for (const note of data.notes ?? []) {
    if (note.ply >= plies) {
      fail(file, `notes[].ply ${note.ply} is past the end of the game (${plies} plies)`);
    }
  }

  console.log(`  ok  ${file} — ${plies} plies, ${(data.notes ?? []).length} note(s)`);
}

/* ─────────────────────────── exercices ─────────────────────────── */

for (const { file, data } of readCollection('exercices')) {
  let game;
  try {
    game = new Chess(data.fen);
  } catch (error) {
    fail(file, `FEN does not parse — ${error.message}`);
    continue;
  }

  const solution = data.solution ?? [];
  const replies = data.opponentReplies ?? [];

  // Mirrors the .refine() in src/content.config.ts.
  if (replies.length > solution.length) {
    fail(file, `opponentReplies (${replies.length}) cannot exceed solution (${solution.length})`);
    continue;
  }

  /** UCI → the {from,to,promotion} object chess.js wants. */
  const uci = (m) => ({
    from: m.slice(0, 2),
    to: m.slice(2, 4),
    ...(m.length > 4 ? { promotion: m[4] } : {}),
  });

  let broke = false;
  for (let i = 0; i < solution.length; i++) {
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

  // RULE 2 sanity: a forced mate is the canonical onlyMove:true case. Not an
  // error either way — just worth surfacing, since the default is permissive.
  const note = mates
    ? `ends in mate, onlyMove=${data.onlyMove === true}`
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
