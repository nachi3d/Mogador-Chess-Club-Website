/**
 * Reference opponents of graded strength, to measure the presets against.
 *
 * Material-only and cheap, so a few hundred games cost seconds rather than
 * minutes. They are YARDSTICKS, not products — `--bots` checks that
 * random < greedy < novice actually holds before any of them is used to judge
 * the engine.
 *
 * ⚠️ Use move/undo on ONE `Chess`, never `new Chess(fen)` per candidate.
 * The obvious version allocates a board per reply — 2-ply over ~30 moves is
 * ~900 constructions per decision, and a 60-game match did not finish in ten
 * minutes.
 */

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CHAR_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Material from `colour`'s point of view, read off the FEN's placement field.
 * A string scan beats walking `chess.board()`, which allocates 8 arrays.
 */
export function material(chess, colour) {
  const fen = chess.fen();
  let score = 0;
  for (let i = 0; i < fen.length; i++) {
    const c = fen[i];
    if (c === ' ') break;
    const lower = c.toLowerCase();
    const v = CHAR_VALUE[lower];
    if (v === undefined) continue;
    const isWhite = c !== lower;
    const mine = (colour === 'w') === isWhite;
    score += mine ? v : -v;
  }
  return score;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Seeded so a match is reproducible: the same seed replays the same games. */
export const rngFor = (seed) => mulberry32(seed);

const pickRandom = (list, rng) => list[Math.floor(rng() * list.length)];

/** The floor: a uniformly random legal move. */
export function botRandom(chess, rng) {
  return pickRandom(chess.moves({ verbose: true }), rng);
}

/**
 * A club beginner. Grabs the biggest capture on offer, otherwise plays at
 * random. 1-ply — it does NOT check whether the capture loses to a recapture,
 * which is exactly the mistake this level of player makes.
 */
export function botGreedy(chess, rng) {
  const moves = chess.moves({ verbose: true });
  const captures = moves.filter((m) => m.captured);
  if (captures.length === 0) return pickRandom(moves, rng);
  let best = -Infinity;
  let bestMoves = [];
  for (const m of captures) {
    const gain = VALUE[m.captured];
    if (gain > best) {
      best = gain;
      bestMoves = [m];
    } else if (gain === best) bestMoves.push(m);
  }
  return pickRandom(bestMoves, rng);
}

/**
 * An improving student who plays accurately: 2-ply material minimax. Takes
 * what is free and does not leave a piece hanging to a single capture.
 */
export function botNovice(chess, rng) {
  const moves = chess.moves({ verbose: true });
  let best = -Infinity;
  let bestMoves = [];

  /* Material swing of a single move, from the mover's side. Read off the move
     object — no board walk and no FEN. */
  const swing = (m) =>
    (m.captured ? VALUE[m.captured] : 0) + (m.promotion ? VALUE[m.promotion] - 1 : 0);

  for (const m of moves) {
    const gain = swing(m);
    chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });

    /* ⚠️ Generate the replies but never PLAY them: their `captured` field
       already says what they would win. Playing each one was 900 move/undo
       pairs per decision and made a match un-runnable. */
    const replies = chess.moves({ verbose: true });
    let score;
    if (replies.length === 0) {
      score = chess.isCheck() ? 1000 : 0; // mate, or stalemate we should avoid
    } else {
      let worst = 0;
      for (const r of replies) {
        const loss = swing(r);
        if (loss > worst) worst = loss;
      }
      score = gain - worst;
    }
    chess.undo();

    if (score > best) {
      best = score;
      bestMoves = [m];
    } else if (score === best) bestMoves.push(m);
  }
  return pickRandom(bestMoves, rng);
}

export const BOTS = {
  random: { name: 'random', play: botRandom, note: 'uniformly random legal move' },
  greedy: { name: 'greedy', play: botGreedy, note: 'club beginner — grabs material, else random' },
  novice: { name: 'novice', play: botNovice, note: 'accurate student — 2-ply material minimax' },
};
