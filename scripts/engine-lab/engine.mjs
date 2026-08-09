/**
 * Mogador Chess Club — driving the vendored Stockfish 11 from Node.
 *
 * This exists so the difficulty presets can be MEASURED rather than asserted.
 * See `scripts/engine-lab/run.mjs` and CLAUDE.md → "Play mode — the level
 * presets are MEASURED".
 *
 * Three environment quirks are handled here, each of which cost real time:
 */

import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ⚠️ (1) Node ≥18 ships a global `fetch`, and this Emscripten build chooses
 * streaming instantiation over its own `fs` reader by testing
 * `typeof fetch === "function"`. Handed a filesystem path, that fetch fails and
 * the module aborts with `abort(TypeError: fetch failed)`.
 *
 * Instantiation is ASYNC, so `fetch` must stay removed for the whole run —
 * restoring it straight after the constructor returns is too early and the
 * abort comes back.
 */
globalThis.fetch = undefined;
WebAssembly.instantiateStreaming = undefined;

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');

/**
 * ⚠️ (2) `public/engine/stockfish.js` is CommonJS, but this package is
 * `"type": "module"`, so Node treats a bare `.js` as ESM and the glue dies on
 * `require is not defined`.
 *
 * The copy goes to the OS temp directory and NOT into the repo, deliberately:
 * `tsconfig.json` includes every file in the project, and 2.3 MB of minified
 * glue takes `astro check` past the V8 heap limit — which is exactly why
 * `public/engine` is excluded there. A `.cjs` copy committed under `scripts/`
 * would walk straight back into that trap.
 */
const GLUE = join(mkdtempSync(join(tmpdir(), 'mcc-engine-')), 'stockfish.cjs');
copyFileSync(join(ROOT, 'public', 'engine', 'stockfish.js'), GLUE);
const STOCKFISH = require(GLUE);

/** Captured before anything silences it. See the note inside `boot()`. */
const REAL_LOG = console.log;

export function boot() {
  const sf = STOCKFISH(join(ROOT, 'public', 'engine', 'stockfish.wasm'));
  const waiters = new Set();
  const seen = [];
  sf.onmessage = (line) => {
    const s = String(line);
    seen.push(s);
    for (const w of [...waiters]) w(s);
  };

  /**
   * Emscripten mirrors every UCI line to `console.log` as well as to
   * `onmessage`. Unsilenced that is megabytes of `info depth ...` per run. We
   * read everything through `onmessage`, so the console copy is pure noise —
   * `realLog` is kept for the harness's own output.
   *
   * ⚠️ `REAL_LOG` is captured at MODULE level, not here. A second `boot()` —
   * which the ladder needs, to run two presets against each other — would
   * otherwise capture the first boot's no-op and silence the harness itself.
   */
  console.log = () => {};
  const realLog = REAL_LOG;

  /**
   * ⚠️ (3) `postMessage(cmd, true)` runs the command SYNCHRONOUSLY: the reply
   * is delivered from inside the call. A waiter registered *after* `send()`
   * therefore misses it entirely and times out — which presents as the engine
   * hanging, not as a harness bug. Always register, then send.
   */
  const ask = (command, match, label, ms = 120_000) => {
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(w);
        reject(new Error(`timeout waiting for ${label}`));
      }, ms);
      const w = (s) => {
        if (!match(s)) return;
        clearTimeout(timer);
        waiters.delete(w);
        resolve(s);
      };
      waiters.add(w);
    });
    sf.postMessage(command, true);
    return p;
  };

  const send = (c) => sf.postMessage(c, true);
  return { sf, ask, send, seen, realLog };
}

/** Apply a configuration and wait for the engine to acknowledge it. */
export async function configure(e, { skill, maxError, probability, contempt = 0, multiPV = 1 }) {
  e.send(`setoption name Skill Level value ${skill}`);
  if (maxError !== undefined) e.send(`setoption name Skill Level Maximum Error value ${maxError}`);
  if (probability !== undefined) e.send(`setoption name Skill Level Probability value ${probability}`);
  e.send(`setoption name Contempt value ${contempt}`);
  e.send(`setoption name MultiPV value ${multiPV}`);
  await e.ask('isready', (l) => l === 'readyok', 'readyok');
}

/** One search, exactly as `src/lib/engine/stockfish.ts` issues it. */
export async function bestMove(e, fen, { depth, movetimeMs }) {
  e.send(`position fen ${fen}`);
  const parts = ['go'];
  if (depth) parts.push(`depth ${depth}`);
  if (movetimeMs) parts.push(`movetime ${movetimeMs}`);
  const line = await e.ask(parts.join(' '), (l) => l.startsWith('bestmove'), 'bestmove');
  const best = line.split(/\s+/)[1];
  return !best || best === '(none)' || best === '0000' ? null : best;
}

/**
 * Every legal root move, via `MultiPV` at depth 1.
 *
 * This is how the shipped provider draws a random move without importing
 * chess.js into the engine chunk — see `randomLegalMove()` in
 * `src/lib/engine/stockfish.ts`. Mirrored here so the lab measures the same
 * distribution the product produces.
 */
export async function allRootMoves(e, fen) {
  e.send('setoption name MultiPV value 500');
  e.send(`position fen ${fen}`);
  const before = e.seen.length;
  await e.ask('go depth 1', (l) => l.startsWith('bestmove'), 'bestmove');
  const moves = new Map();
  for (const l of e.seen.slice(before)) {
    const m = /^info .*\bmultipv (\d+)\b.*\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(l);
    if (m) moves.set(Number(m[1]), m[2]);
  }
  e.send('setoption name MultiPV value 1');
  return [...moves.values()];
}
