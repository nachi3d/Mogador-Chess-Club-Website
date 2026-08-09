/**
 * Stockfish, in a Web Worker, as a `MoveProvider`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOT PURE, and deliberately the only file that is. It owns a Worker and
 * speaks UCI down a message channel. Everything above it sees `MoveProvider`
 * (see `@lib/chess/opponent`) and cannot tell Stockfish from a scripted list
 * or, in v2, from another human on a socket.
 *
 * LOADED ONLY ON DEMAND. This module is reached by `await import()` from inside
 * the "start the game" handler — never at page load, never on `client:visible`.
 * The engine is 3.6 MB; a reader who opens `/jouer/` to see what it is must not
 * pay for it, and a reader who never opens `/jouer/` at all certainly must not.
 * `scripts/build-sw.mjs` keeps it out of the precache for the same reason and
 * caches it at runtime instead, so the SECOND game is instant and the first
 * costs what it costs.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY STOCKFISH 11 — see `scripts/build-engine.mjs`. Short version: the NNUE
 * builds ship a 90–250 MB network and this one is 1.4 MB.
 */

import type { MoveProvider, Uci } from '@lib/chess/opponent';

/** Where `build-engine.mjs` vendors the engine. */
const WORKER_URL = '/engine/stockfish.js';
/**
 * The glue resolves its `.wasm` relative to its own URL, which is right here
 * anyway — but it also honours a path passed in the worker URL's hash, and
 * saying it explicitly means a future move of these files cannot silently
 * break WASM loading while the worker still starts.
 */
const WASM_URL = '/engine/stockfish.wasm';

export type LevelId = 'debutant' | 'intermediaire' | 'avance';

export interface EngineLevel {
  /** Stockfish's own 0–20 weakening dial. */
  readonly skill: number;
  /** Search depth cap. */
  readonly depth: number;
  /** Wall-clock cap, whichever comes first. Bounds latency on a slow phone. */
  readonly movetimeMs: number;
  /**
   * Probability (0–1) of playing a uniformly random legal move instead of the
   * searched one.
   *
   * ⚠️ THIS IS NOT A HACK — IT IS THE ONLY THING THAT MAKES THE ENGINE HANG A
   * PIECE. `Skill Level` picks among the engine's OWN top candidates, and a
   * Stockfish search of any depth ends in a quiescence search that resolves
   * every capture. So even `skill 0, depth 1` never leaves a piece en prise to
   * a one-move capture, and never misses a free one. Measured: at the shipped
   * `skill 0, depth 2` the engine played its top choice in 23 of 24 searches
   * of one position — MORE deterministic than either higher level.
   *
   * A beginner needs an opponent that sometimes gives material away. That
   * cannot come from a dial that only ever chooses between good moves.
   */
  readonly blunderChance: number;
}

/**
 * ⚠️ THESE ARE MEASURED, AND THEY ARE STILL NOT ELO.
 *
 * The vendored build exposes NO `UCI_LimitStrength` and NO `UCI_Elo` — verified
 * by reading the `uci` option list out of the running worker. The only strength
 * dials are `Skill Level` (0–20) and two companions, `Skill Level Maximum
 * Error` and `Skill Level Probability`.
 *
 * ⚠️ AND `Skill Level` ALONE CANNOT MAKE THIS ENGINE BEATABLE. Two measured
 * facts, both from `scripts/engine-lab`:
 *
 *  1. It only ever chooses among the engine's OWN top candidates, and every
 *     Stockfish search — at any depth — ends in a quiescence search that
 *     resolves all captures. So no (skill, depth) pair ever hangs a piece or
 *     misses a free one. "depth 2" is not "sees one move ahead".
 *  2. At the old `skill 0, depth 2` the engine played its top choice in 23 of
 *     24 searches of one position — MORE deterministic than either higher
 *     level. Débutant was the least random preset on the ladder.
 *
 * Setting `Skill Level Maximum Error` to 5000 and `Probability` to 1000 — both
 * extremes — made it MORE deterministic, not less. Not a usable dial here.
 *
 * The result was a ladder that was not a ladder. Measured over 16 games per
 * pairing against two reference opponents, the presets that shipped up to
 * v0.5.0 scored:
 *
 *     debutant      vs greedy   97%      vs novice   100%
 *     intermediaire vs greedy  100%      vs novice    97%
 *     avance        vs greedy  100%      vs novice   100%
 *
 * Three names, one opponent, and a club player who had not won a single game.
 *
 * ⚠️ RE-MEASURE, DO NOT RE-REASON. `node scripts/engine-lab/run.mjs --verify`
 * plays these exact values and prints the table. The numbers below are the
 * output of that, not a guess that sounded about right. See CLAUDE.md → "Play
 * mode — the level presets are MEASURED".
 *
 * The UI still names the levels and prints no rating: these are win rates
 * against two crude reference bots, which is evidence of ORDER and of
 * beatability, and is not a rating. Claiming an Elo would still be inventing a
 * fact.
 */
export const LEVELS: Readonly<Record<LevelId, EngineLevel>> = {
  /**
   * Loses about two games in three to an opponent that simply never hangs a
   * piece. Measured: 30% against `novice`, 70% against `greedy`.
   *
   * The blunder rate is what does the work, and 0.4 is a deliberate ceiling —
   * at 0.5 it fell to 13% but half its moves were noise and the games stopped
   * resembling chess. Beatable is the goal; incoherent is not.
   */
  debutant: { skill: 0, depth: 1, movetimeMs: 50, blunderChance: 0.4 },
  /**
   * Favoured but genuinely losable: 63% against `novice`, so an accurate
   * opponent takes better than one game in three.
   */
  intermediaire: { skill: 3, depth: 4, movetimeMs: 500, blunderChance: 0.25 },
  /**
   * Never blunders on purpose, and punishes anything that does: ~100% against
   * both reference opponents, and it beats Intermédiaire head to head.
   */
  avance: { skill: 14, depth: 12, movetimeMs: 1500, blunderChance: 0 },
};

/**
 * How long to wait for `uciok`/`readyok` before deciding the engine is dead.
 *
 * Generous on purpose. This window has to cover fetching 3.6 MB, compiling the
 * WASM and the UCI round trip — and the reader most likely to need it is on
 * Essaouira mobile data, where the fetch alone can take most of a minute. A
 * timeout here shows "could not be loaded, try again" to someone whose engine
 * was merely still arriving, which is the worst possible answer.
 */
const HANDSHAKE_TIMEOUT_MS = 90_000;
/** Safety net per move. Well above `movetimeMs`; only fires if something hangs. */
const MOVE_TIMEOUT_MS = 20_000;

/** A line of UCI output. */
type Listener = (line: string) => void;

class StockfishProvider implements MoveProvider {
  readonly name = 'stockfish-11';

  #worker: Worker | null;
  #listeners = new Set<Listener>();
  /** Rejects every in-flight request once disposed. */
  #disposed = false;
  #level: EngineLevel = LEVELS.intermediaire;

  constructor(worker: Worker) {
    this.#worker = worker;
    worker.onmessage = (event: MessageEvent) => {
      // A Worker wraps the payload; the engine also runs un-wrapped in some
      // contexts, hence the fallback.
      const line = String((event as MessageEvent).data ?? event ?? '');
      for (const listener of [...this.#listeners]) listener(line);
    };
  }

  #send(command: string): void {
    this.#worker?.postMessage(command);
  }

  /**
   * Collect every line until `match`, then resolve with all of them.
   *
   * `#await` throws its lines away, which is right for `bestmove` and wrong for
   * a MultiPV sweep, where the answer IS the accumulated `info` lines.
   */
  #collect(
    match: (line: string) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<readonly string[]> {
    return new Promise<readonly string[]>((resolve, reject) => {
      if (this.#disposed || !this.#worker) {
        reject(new Error('engine disposed'));
        return;
      }
      const lines: string[] = [];
      const timer = setTimeout(() => {
        this.#listeners.delete(listener);
        reject(new Error(`stockfish: timed out waiting for ${label}`));
      }, timeoutMs);

      const listener: Listener = (line) => {
        lines.push(line);
        if (!match(line)) return;
        clearTimeout(timer);
        this.#listeners.delete(listener);
        resolve(lines);
      };
      this.#listeners.add(listener);
    });
  }

  /**
   * A uniformly random legal move, obtained from the engine itself.
   *
   * `MultiPV 500` at `depth 1` makes Stockfish report EVERY root move (its
   * MultiPV is clamped to the number of legal moves), so the reported set is
   * exactly the legal move list — verified against chess.js: 20 from the start
   * position, 31 in the test position.
   *
   * ⚠️ Done this way ON PURPOSE, rather than importing chess.js to generate
   * moves. chess.js in this module would land in the engine chunk, and the
   * whole point of that chunk is that only a reader who presses "start" ever
   * downloads it. The engine already knows the legal moves; asking it costs one
   * shallow search and no bytes.
   */
  async #randomLegalMove(fen: string): Promise<Uci | null> {
    this.#send('setoption name MultiPV value 500');
    this.#send(`position fen ${fen}`);
    this.#send('go depth 1');
    let lines: readonly string[];
    try {
      lines = await this.#collect((l) => l.startsWith('bestmove'), MOVE_TIMEOUT_MS, 'bestmove');
    } finally {
      // Restore in a finally: leaving MultiPV at 500 would make every later
      // search report 500 lines and search measurably slower.
      this.#send('setoption name MultiPV value 1');
    }

    const moves = new Map<number, string>();
    for (const line of lines) {
      const m = /^info .*\bmultipv (\d+)\b.*\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line);
      if (m?.[1] && m[2]) moves.set(Number(m[1]), m[2]);
    }
    const list = [...moves.values()];
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)] ?? null;
  }

  /** Resolve when `match` returns true for a line. Always cleans up. */
  #await(match: (line: string) => boolean, timeoutMs: number, label: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (this.#disposed || !this.#worker) {
        reject(new Error('engine disposed'));
        return;
      }
      const timer = setTimeout(() => {
        this.#listeners.delete(listener);
        reject(new Error(`stockfish: timed out waiting for ${label}`));
      }, timeoutMs);

      const listener: Listener = (line) => {
        if (!match(line)) return;
        clearTimeout(timer);
        this.#listeners.delete(listener);
        resolve(line);
      };
      this.#listeners.add(listener);
    });
  }

  async handshake(level: EngineLevel): Promise<void> {
    this.#send('uci');
    await this.#await((l) => l === 'uciok', HANDSHAKE_TIMEOUT_MS, 'uciok');
    this.setLevel(level);
    this.#send('isready');
    await this.#await((l) => l === 'readyok', HANDSHAKE_TIMEOUT_MS, 'readyok');
  }

  setLevel(level: EngineLevel): void {
    this.#level = level;
    this.#send(`setoption name Skill Level value ${level.skill}`);
  }

  async nextMove(fen: string): Promise<Uci | null> {
    if (this.#disposed || !this.#worker) return null;

    // The blunder is decided BEFORE the search, so a blundering move costs one
    // shallow sweep rather than a full search plus a sweep.
    if (this.#level.blunderChance > 0 && Math.random() < this.#level.blunderChance) {
      const random = await this.#randomLegalMove(fen);
      if (random) return random;
      // Fall through: an empty sweep means the position has no moves, or the
      // engine answered oddly. Better a good move than none.
    }

    // `ucinewgame` is deliberately NOT sent per move: it clears the hash, and
    // the hash is the only thing making the engine quick on a phone.
    this.#send(`position fen ${fen}`);
    this.#send(`go depth ${this.#level.depth} movetime ${this.#level.movetimeMs}`);

    const line = await this.#await(
      (l) => l.startsWith('bestmove'),
      MOVE_TIMEOUT_MS,
      'bestmove',
    );

    const best = line.split(/\s+/)[1];
    // Stockfish says `bestmove (none)` in a finished position. chess.js has
    // already told us the game is over by then, but never trust that ordering.
    if (!best || best === '(none)' || best === '0000') return null;
    return best;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    // Stop first so a search in flight does not keep a phone's CPU busy for
    // another two seconds after the reader has navigated away.
    try {
      this.#send('stop');
      this.#send('quit');
    } catch {
      /* the worker may already be gone; terminating is what matters */
    }
    this.#worker?.terminate();
    this.#worker = null;
    this.#listeners.clear();
  }
}

/**
 * Boot the engine and complete the UCI handshake.
 *
 * Throws if the worker cannot start or does not answer — the caller is expected
 * to show a retry, not to pretend there is an opponent. A failed engine load on
 * a bad connection is the most likely failure this feature has.
 */
export async function createStockfish(level: EngineLevel): Promise<MoveProvider> {
  const worker = new Worker(`${WORKER_URL}#${WASM_URL}`);
  const provider = new StockfishProvider(worker);
  try {
    await provider.handshake(level);
  } catch (error) {
    provider.dispose();
    throw error;
  }
  return provider;
}

/** Narrowing helper so callers can change level without re-booting the worker. */
export function setEngineLevel(provider: MoveProvider, level: EngineLevel): void {
  if (provider instanceof StockfishProvider) provider.setLevel(level);
}
