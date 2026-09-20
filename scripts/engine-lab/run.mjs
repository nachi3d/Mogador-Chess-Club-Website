/**
 * Mogador Chess Club — the difficulty lab.
 *
 *   node scripts/engine-lab/run.mjs --probe        what the build exposes, and
 *                                                  whether skill is applied
 *   node scripts/engine-lab/run.mjs --bots         validate the yardstick
 *   node scripts/engine-lab/run.mjs --verify       measure the SHIPPED presets
 *   node scripts/engine-lab/run.mjs --candidates   measure a candidate table
 *   node scripts/engine-lab/run.mjs --accuracy     best-move agreement per skill
 *     [--games N]
 *
 * ⚠️ This is a MEASUREMENT tool, not part of the build. Nothing in `npm run
 * build` calls it. It exists so that "Débutant is beatable" is a number
 * somebody produced, not an adjective somebody chose. See CLAUDE.md → "Play
 * mode — the level presets are MEASURED".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { boot, configure, bestMove, allRootMoves, ROOT } from './engine.mjs';
import { measure, report, ladder } from './match.mjs';
import { BOTS, material, rngFor } from './bots.mjs';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const num = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const GAMES = num('--games', 40);

/**
 * ⚠️ Read the SHIPPED presets out of the TypeScript source rather than keeping
 * a second copy here. A lab that measures its own private numbers proves
 * nothing about what the reader plays against.
 */
function shippedLevels() {
  const src = readFileSync(join(ROOT, 'src', 'lib', 'engine', 'stockfish.ts'), 'utf8');
  const block = /export const LEVELS[^{]*\{([\s\S]*?)\n\};/.exec(src);
  if (!block) throw new Error('could not find LEVELS in stockfish.ts');
  const levels = {};
  const entry = /(\w+):\s*\{([^}]*)\}/g;
  let m;
  while ((m = entry.exec(block[1]))) {
    const fields = {};
    for (const [, k, v] of m[2].matchAll(/(\w+):\s*([\d.]+)/g)) fields[k] = Number(v);
    levels[m[1]] = {
      skill: fields.skill,
      depth: fields.depth,
      movetimeMs: fields.movetimeMs,
      blunderChance: fields.blunderChance ?? 0,
    };
  }
  return levels;
}

/** Candidate table under test. Edit, run --candidates, read the numbers. */
const CANDIDATES = {
  debutant: { skill: 0, depth: 1, movetimeMs: 50, blunderChance: 0.35 },
  intermediaire: { skill: 3, depth: 4, movetimeMs: 500, blunderChance: 0.08 },
  avance: { skill: 14, depth: 12, movetimeMs: 1500, blunderChance: 0 },
};

const out = console.log;

async function probe(e) {
  const log = e.realLog;
  log('\n=== UCI OPTIONS THE VENDORED BUILD ACTUALLY EXPOSES ===');
  for (const l of e.seen) if (l.startsWith('option name')) log('  ' + l);

  const POS = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  log('\n=== is `Skill Level` applied? 24 searches of ONE position ===');
  log('    weak settings should SPREAD; skill 20 should be deterministic\n');
  for (const [label, cfg, search] of [
    ['skill 0  d2  mt300 ', { skill: 0 }, { depth: 2, movetimeMs: 300 }],
    ['skill 5  d6  mt800 ', { skill: 5 }, { depth: 6, movetimeMs: 800 }],
    ['skill 13 d12 mt2000', { skill: 13 }, { depth: 12, movetimeMs: 2000 }],
    ['skill 20 d12 mt2000', { skill: 20 }, { depth: 12, movetimeMs: 2000 }],
    ['skill 0  d1  mt50  ', { skill: 0 }, { depth: 1, movetimeMs: 50 }],
  ]) {
    await configure(e, cfg);
    const counts = new Map();
    let maxDepth = 0;
    for (let i = 0; i < 24; i++) {
      const before = e.seen.length;
      const mv = await bestMove(e, POS, search);
      for (const l of e.seen.slice(before)) {
        const d = /^info .*\bdepth (\d+)/.exec(l);
        if (d) maxDepth = Math.max(maxDepth, Number(d[1]));
      }
      counts.set(mv, (counts.get(mv) ?? 0) + 1);
    }
    const spread = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m, c]) => `${m}:${c}`).join(' ');
    log(`  ${label}  distinct=${counts.size} maxdepth=${maxDepth}`);
    log(`      ${spread}`);
  }

  log('\n=== does `depth` cap the search, or does movetime override it? ===');
  await configure(e, { skill: 20 });
  for (const d of [1, 2, 4, 6, 12]) {
    const before = e.seen.length;
    const t0 = Date.now();
    await bestMove(e, POS, { depth: d, movetimeMs: 3000 });
    const ms = Date.now() - t0;
    let maxDepth = 0;
    for (const l of e.seen.slice(before)) {
      const m = /^info .*\bdepth (\d+)/.exec(l);
      if (m) maxDepth = Math.max(maxDepth, Number(m[1]));
    }
    log(`  go depth ${String(d).padStart(2)} movetime 3000  ->  reached ${maxDepth} in ${ms}ms`);
  }

  log('\n=== MultiPV 500 at depth 1 enumerates every legal move? ===');
  for (const [name, fen] of [
    ['startpos (20 legal)', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['test position', POS],
  ]) {
    const all = await allRootMoves(e, fen);
    const truth = new Chess(fen).moves().length;
    log(`  ${name.padEnd(22)} MultiPV=${all.length}  chess.js=${truth}  ${all.length === truth ? 'MATCH' : 'MISMATCH'}`);
  }
}

function botSanity(log) {
  log('\n=== yardstick: random < greedy < novice must hold ===');
  const N = 60;
  const one = (a, b, seed) => {
    const rng = rngFor(seed);
    const chess = new Chess();
    let plies = 0;
    while (!chess.isGameOver() && plies < 300) {
      const bot = chess.turn() === 'w' ? a : b;
      const m = bot.play(chess, rng);
      if (!m) break;
      chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
      plies++;
    }
    if (chess.isCheckmate()) return chess.turn() === 'w' ? 'b' : 'w';
    if (chess.isStalemate() || chess.isDraw()) return 'draw';
    const diff = material(chess, 'w');
    return diff >= 5 ? 'w' : diff <= -5 ? 'b' : 'draw';
  };
  for (const [x, y] of [['random', 'greedy'], ['greedy', 'novice'], ['random', 'novice']]) {
    let xw = 0, yw = 0, d = 0;
    for (let i = 0; i < N; i++) {
      const xFirst = i % 2 === 0;
      const r = xFirst ? one(BOTS[x], BOTS[y], i * 31 + 5) : one(BOTS[y], BOTS[x], i * 31 + 5);
      if (r === 'draw') d++;
      else if ((r === 'w') === xFirst) xw++;
      else yw++;
    }
    log(`  ${x.padEnd(7)} vs ${y.padEnd(7)}  ${String(xw).padStart(2)}W ${String(d).padStart(2)}D ${String(yw).padStart(2)}L   ${x} scores ${(((xw + d / 2) / N) * 100).toFixed(0)}%`);
  }
}

async function table(e, levels, title, log) {
  log(`\n=== ${title} — ${GAMES} games per pairing, colours alternating ===\n`);
  for (const [name, preset] of Object.entries(levels)) {
    log(`  ${name}: skill ${preset.skill}, depth ${preset.depth}, movetime ${preset.movetimeMs}ms, blunder ${(preset.blunderChance * 100).toFixed(0)}%`);
  }
  log('');
  for (const [name, preset] of Object.entries(levels)) {
    for (const botKey of ['greedy', 'novice']) {
      const r = await measure(e, preset, botKey, GAMES);
      log(report(name, botKey, r, GAMES));
    }
  }
}

/** Find the blunder rate that makes a given search genuinely beatable. */
async function sweep(e, log) {
  const cases = [
    // Round 4 — tightening the chosen point. Two 40-game samples of the SAME
    // configuration (blunder 15% vs novice) came out 76% and 86%, so 40 games
    // is not enough to separate neighbouring rates. 120 games per point.
    ['intermed. skill 3 d4 mt500', { skill: 3, depth: 4, movetimeMs: 500 }, [0.15, 0.2], 'novice'],
    ['intermed. skill 3 d4 mt500', { skill: 3, depth: 4, movetimeMs: 500 }, [0.15, 0.2], 'greedy'],
  ];
  for (const [label, base, rates, botKey] of cases) {
    log(`\n=== blunder sweep: ${label} vs ${botKey}, ${GAMES} games each ===\n`);
    for (const b of rates) {
      const r = await measure(e, { ...base, blunderChance: b }, botKey, GAMES);
      log(report(`blunder ${String((b * 100).toFixed(0)).padStart(2)}%`, botKey, r, GAMES));
    }
  }
}

/**
 * ⚠️ HOW OFTEN DOES A LEVEL PLAY THE BEST MOVE? — the metric a win rate cannot
 * give you.
 *
 * Avancé scores ~100% against both reference bots. That saturates: it cannot
 * tell "strong" from "stronger", so it cannot answer the one question Seàn
 * actually asked, which is whether Avancé makes mistakes OF ITS OWN.
 *
 * ⚠️ AND ITS `blunderChance` IS ALREADY 0, so there is nothing there to turn
 * down. Any error it makes comes from Stockfish's own `Skill Level`, which
 * below 20 deliberately picks a WORSE root move — bounded by `Skill Level
 * Maximum Error`, which this build defaults to 200 CENTIPAWNS. That is two
 * pawns of licence to go wrong, per move.
 *
 * So: take a set of real positions, ask a strong reference (skill 20, deeper)
 * what the move is, then ask the candidate and count agreement. A level that
 * "punishes real mistakes rather than making its own" agrees with the
 * reference nearly always.
 *
 * ⚠️ THE REFERENCE IS THE SAME ENGINE, DELIBERATELY. Agreement with a
 * different engine would measure taste as well as accuracy. This measures only
 * "did the weakening change the move".
 */
const ACCURACY_POSITIONS = [
  // Opening, quiet: many reasonable moves, so a weak setting spreads.
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  // Middlegame with a concrete tactic available.
  'r2q1rk1/ppp2ppp/2n1bn2/2bpp3/4P3/2PP1N2/PP1NBPPP/R1BQ1RK1 w - - 0 9',
  // An opponent has just hung material — this is the "punish it" case.
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4',
  // Sharp, unbalanced middlegame.
  'r1b1k2r/ppppqppp/2n2n2/2b5/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 7',
  // A simple endgame: one accurate move, many losing ones.
  '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1',
  // Rook endgame — technique, where a 200cp error is a lost half point.
  '8/8/8/4k3/8/8/4KP2/4R3 w - - 0 1',
];

async function accuracy(e, log) {
  const REPEATS = 8;
  /* ⚠️ THE REFERENCE SEARCHES TO THE SAME DEPTH AS THE CANDIDATES, ON PURPOSE.
     A deeper reference (16) disagrees with a depth-12 candidate for reasons
     that have nothing to do with skill — the extra plies simply find a
     different move — and that confound inflated the first run's error rate.
     Same depth, more time, skill 20: now the ONLY difference is the deliberate
     weakening, so disagreement IS injected error. */
  const REFERENCE = { skill: 20, depth: 12, movetimeMs: 4000 };

  log('\n=== BEST-MOVE AGREEMENT — how often a level plays the reference move ===');
  log(`    reference: skill 20, depth 16, 3000ms · ${ACCURACY_POSITIONS.length} positions × ${REPEATS} searches\n`);

  const best = [];
  for (const fen of ACCURACY_POSITIONS) {
    await configure(e, { skill: REFERENCE.skill });
    best.push(await bestMove(e, fen, REFERENCE));
  }

  const rows = [];
  for (const [label, cfg] of Object.entries(SKILLS_UNDER_TEST)) {
    await configure(e, { skill: cfg.skill });
    let agree = 0;
    let total = 0;
    const distinct = [];
    for (const [i, fen] of ACCURACY_POSITIONS.entries()) {
      const seen = new Set();
      for (let r = 0; r < REPEATS; r++) {
        const mv = await bestMove(e, fen, cfg);
        seen.add(mv);
        if (mv === best[i]) agree += 1;
        total += 1;
      }
      distinct.push(seen.size);
    }
    const pct = ((agree / total) * 100).toFixed(0);
    rows.push(
      `  ${label.padEnd(26)} agrees ${String(pct).padStart(3)}%   distinct moves per position: ${distinct.join(' ')}`,
    );
  }
  for (const r of rows) log(r);
  log('\n    100% and all-ones means it never invents an error of its own.');
}

/** Candidate searches for the accuracy run. Edit and re-run. */
const SKILLS_UNDER_TEST = {
  'avance NOW  skill 14 d12': { skill: 14, depth: 12, movetimeMs: 1500 },
  'candidate   skill 17 d12': { skill: 17, depth: 12, movetimeMs: 1500 },
  'candidate   skill 19 d12': { skill: 19, depth: 12, movetimeMs: 1500 },
  'candidate   skill 20 d12': { skill: 20, depth: 12, movetimeMs: 1500 },
  'intermed NOW skill 3 d4 ': { skill: 3, depth: 4, movetimeMs: 500 },
};

const e = boot();
await e.ask('uci', (l) => l === 'uciok', 'uciok');
const log = e.realLog;

if (has('--probe')) await probe(e);
if (has('--bots')) botSanity(log);
if (has('--verify')) await table(e, shippedLevels(), 'SHIPPED presets', log);
if (has('--candidates')) await table(e, CANDIDATES, 'CANDIDATE presets', log);
if (has('--sweep')) await sweep(e, log);
if (has('--accuracy')) await accuracy(e, log);
if (has('--ladder')) {
  const levels = has('--shipped') ? shippedLevels() : CANDIDATES;
  const e2 = boot();
  await e2.ask('uci', (l) => l === 'uciok', 'uciok');
  log(`\n=== ladder: preset vs preset, ${GAMES} games each ===`);
  log('    the bots saturate at the top; this is what proves the ORDER\n');
  log(await ladder(e, 'avance', levels.avance, e2, 'intermediaire', levels.intermediaire, GAMES));
  log(await ladder(e, 'intermediaire', levels.intermediaire, e2, 'debutant', levels.debutant, GAMES));
  log(await ladder(e, 'avance', levels.avance, e2, 'debutant', levels.debutant, GAMES));
}
if (!argv.length) log('nothing to do — pass --probe, --bots, --verify, --candidates, --sweep, --accuracy or --ladder');

process.exit(0);
