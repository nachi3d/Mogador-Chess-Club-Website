/**
 * Games between a configured engine preset and a reference bot.
 *
 * The blunder here draws uniformly from chess.js's legal moves. The shipped
 * provider draws uniformly from `MultiPV 500` at depth 1, which is verified to
 * be the SAME SET (20 from the start position, 31 in the test position) — so
 * the two are the same distribution and the lab measures what ships.
 */
import { Chess } from 'chess.js';
import { configure, bestMove } from './engine.mjs';
import { BOTS, material, rngFor } from './bots.mjs';

/** Long enough for a won endgame to be converted; short enough to stay cheap. */
const MAX_PLIES = 300;
/** Below this the position is not decisive, whatever the material says. */
const DECISIVE_MARGIN = 5;

async function engineMove(e, chess, preset, rng) {
  if (preset.blunderChance > 0 && rng() < preset.blunderChance) {
    const moves = chess.moves({ verbose: true });
    const pick = moves[Math.floor(rng() * moves.length)];
    return { uci: pick.from + pick.to + (pick.promotion ?? ''), blundered: true };
  }
  return { uci: await bestMove(e, chess.fen(), preset), blundered: false };
}

/** One game. Returns { result, plies, blunders }. */
export async function playGame(e, preset, bot, engineColour, seed) {
  const rng = rngFor(seed);
  const chess = new Chess();
  e.send('ucinewgame');
  await e.ask('isready', (l) => l === 'readyok', 'readyok');

  let plies = 0;
  let blunders = 0;
  while (!chess.isGameOver() && plies < MAX_PLIES) {
    if (chess.turn() === engineColour) {
      const { uci, blundered } = await engineMove(e, chess, preset, rng);
      if (!uci) break;
      if (blundered) blunders++;
      try {
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || 'q' });
      } catch {
        break;
      }
    } else {
      const m = bot.play(chess, rng);
      if (!m) break;
      chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
    }
    plies++;
  }

  let result;
  if (chess.isCheckmate()) {
    // The side to move is the mated one.
    result = chess.turn() === engineColour ? 'bot' : 'engine';
  } else if (chess.isStalemate() || chess.isDraw() || chess.isInsufficientMaterial()) {
    result = 'draw';
  } else {
    // Past the ply cap — adjudicate on what the position actually says.
    const diff = material(chess, engineColour);
    result = diff >= DECISIVE_MARGIN ? 'engine' : diff <= -DECISIVE_MARGIN ? 'bot' : 'draw';
  }
  return { result, plies, blunders };
}

/**
 * Preset against preset, on two independent engine instances.
 *
 * Needed because both reference bots SATURATE: every preset beats `novice`
 * ~100%, so the bots cannot tell Intermédiaire from Avancé. Head-to-head is
 * what proves the ladder is actually ordered.
 */
export async function playEngines(eA, presetA, eB, presetB, aColour, seed) {
  const rng = rngFor(seed);
  const chess = new Chess();
  for (const e of [eA, eB]) {
    e.send('ucinewgame');
    await e.ask('isready', (l) => l === 'readyok', 'readyok');
  }

  let plies = 0;
  while (!chess.isGameOver() && plies < MAX_PLIES) {
    const isA = chess.turn() === aColour;
    const { uci } = await engineMove(isA ? eA : eB, chess, isA ? presetA : presetB, rng);
    if (!uci) break;
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || 'q' });
    } catch {
      break;
    }
    plies++;
  }

  if (chess.isCheckmate()) return chess.turn() === aColour ? 'b' : 'a';
  if (chess.isStalemate() || chess.isDraw() || chess.isInsufficientMaterial()) return 'draw';
  const diff = material(chess, aColour);
  return diff >= DECISIVE_MARGIN ? 'a' : diff <= -DECISIVE_MARGIN ? 'b' : 'draw';
}

export async function ladder(eA, nameA, presetA, eB, nameB, presetB, games) {
  await configure(eA, presetA);
  await configure(eB, presetB);
  const tally = { a: 0, b: 0, draw: 0 };
  for (let i = 0; i < games; i++) {
    const r = await playEngines(eA, presetA, eB, presetB, i % 2 === 0 ? 'w' : 'b', 4242 + i * 7919);
    tally[r]++;
  }
  const pct = (((tally.a + tally.draw / 2) / games) * 100).toFixed(0);
  return `  ${nameA.padEnd(14)} vs ${nameB.padEnd(14)}  ${String(tally.a).padStart(3)}W ${String(tally.draw).padStart(3)}D ${String(tally.b).padStart(3)}L   ${nameA} scores ${String(pct).padStart(3)}%`;
}

/** `games` games against one bot, colours alternating. */
export async function measure(e, preset, botKey, games) {
  const bot = BOTS[botKey];
  await configure(e, preset);
  const tally = { engine: 0, bot: 0, draw: 0 };
  let plies = 0;
  let blunders = 0;
  for (let i = 0; i < games; i++) {
    const colour = i % 2 === 0 ? 'w' : 'b';
    const g = await playGame(e, preset, bot, colour, 1000 + i * 7919);
    tally[g.result]++;
    plies += g.plies;
    blunders += g.blunders;
  }
  return { tally, avgPlies: Math.round(plies / games), blunders };
}

/** Engine score as a percentage: a win is 1, a draw is a half. */
export const scorePct = (tally, games) =>
  ((tally.engine + tally.draw / 2) / games) * 100;

export function report(label, botKey, { tally, avgPlies }, games) {
  const pct = scorePct(tally, games).toFixed(0);
  return (
    `  ${label.padEnd(15)} vs ${botKey.padEnd(7)}  ` +
    `${String(tally.engine).padStart(3)}W ${String(tally.draw).padStart(3)}D ${String(tally.bot).padStart(3)}L` +
    `   engine scores ${String(pct).padStart(3)}%   (avg ${String(avgPlies).padStart(3)} plies)`
  );
}
