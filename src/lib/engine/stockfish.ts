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
}

/**
 * ⚠️ THESE ARE HAND-SET, AND THEY ARE NOT ELO.
 *
 * The vendored build exposes NO `UCI_LimitStrength` and NO `UCI_Elo` — the only
 * strength dial it has is `Skill Level` (0–20), verified by reading the `uci`
 * option list out of the worker. So the three presets are a skill level plus a
 * depth cap, chosen by hand to feel like a beginner, a club player and a strong
 * club player.
 *
 * The design targets were ~800 / ~1400 / ~2000, and the UI therefore names the
 * levels rather than printing a rating: an Elo number the engine does not
 * enforce and nobody has measured would be a fact we invented. If a real rating
 * is ever wanted, it has to be measured against rated opposition, not asserted
 * here. (CLAUDE.md → "Play mode — the level mapping".)
 */
export const LEVELS: Readonly<Record<LevelId, EngineLevel>> = {
  // Skill 0 plus a shallow search: it sees one move ahead and takes the free
  // piece it is offered, which is what losing to a beginner looks like.
  debutant: { skill: 0, depth: 2, movetimeMs: 300 },
  intermediaire: { skill: 5, depth: 6, movetimeMs: 800 },
  avance: { skill: 13, depth: 12, movetimeMs: 2000 },
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
