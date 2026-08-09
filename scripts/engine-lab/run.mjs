/**
 * Mogador Chess Club — the difficulty lab.
 *
 *   node scripts/engine-lab/run.mjs --probe        what the build exposes, and
 *                                                  whether skill is applied
 *   node scripts/engine-lab/run.mjs --bots         validate the yardstick
 *   node scripts/engine-lab/run.mjs --verify       measure the SHIPPED presets
 *   node scripts/engine-lab/run.mjs --candidates   measure a candidate table
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
    // Round 2. Round 1 established: debutant d1/skill0 lands at 33% (blunder
    // 30) and 30% (blunder 40) against `novice`; intermediaire d4/skill3 was
    // still 90% at blunder 15, i.e. nowhere near "an accurate student beats it".
    ['debutant  skill 0 d1 mt50', { skill: 0, depth: 1, movetimeMs: 50 }, [0.35, 0.4], 'greedy'],
    ['intermed. skill 3 d4 mt500', { skill: 3, depth: 4, movetimeMs: 500 }, [0.25, 0.3], 'novice'],
    ['intermed. skill 2 d3 mt400', { skill: 2, depth: 3, movetimeMs: 400 }, [0.2], 'novice'],
  ];
  for (const [label, base, rates, botKey] of cases) {
    log(`\n=== blunder sweep: ${label} vs ${botKey}, ${GAMES} games each ===\n`);
    for (const b of rates) {
      const r = await measure(e, { ...base, blunderChance: b }, botKey, GAMES);
      log(report(`blunder ${String((b * 100).toFixed(0)).padStart(2)}%`, botKey, r, GAMES));
    }
  }
}

const e = boot();
await e.ask('uci', (l) => l === 'uciok', 'uciok');
const log = e.realLog;

if (has('--probe')) await probe(e);
if (has('--bots')) botSanity(log);
if (has('--verify')) await table(e, shippedLevels(), 'SHIPPED presets', log);
if (has('--candidates')) await table(e, CANDIDATES, 'CANDIDATE presets', log);
if (has('--sweep')) await sweep(e, log);
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
if (!argv.length) log('nothing to do — pass --probe, --bots, --verify, --candidates, --sweep or --ladder');

process.exit(0);
