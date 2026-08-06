/**
 * PlayView — the `mode="play"` third of the board island.
 *
 * A full game against Stockfish, in the browser, on the same single Chessground
 * component (`BoardSurface.tsx`) as the replayer and the exercises.
 *
 * ── The engine is loaded ON A CLICK, and nothing sooner ────────────────────
 * Hydrating this view renders a form. It fetches nothing. The 3.6 MB engine is
 * `await import()`ed inside the start handler, so:
 *   - a reader who opens /jouer/ to see what it is pays nothing;
 *   - a reader who never opens /jouer/ certainly pays nothing;
 *   - the site's "no request without an explicit click" rule holds here too,
 *     and `tests/e2e/play.spec.ts` asserts it against the network log.
 * Never hoist that import to the top of the file.
 *
 * ── Stockfish is just a MoveProvider ───────────────────────────────────────
 * This view asks `provider.nextMove(fen)` and applies what comes back. It does
 * not know it is talking to an engine, and must not learn: v2's online play is
 * a different `MoveProvider` (a Durable Object socket) behind the same call.
 * That is the seam — see `@lib/chess/opponent`.
 *
 * ── Both inputs, one path ──────────────────────────────────────────────────
 * Dragging a piece and typing "Cf3" both land in `playMove`. There is no
 * accessible variant of the game to drift out of sync.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import BoardSurface from './BoardSurface';
import MoveInput, { type MoveInputLabels } from './MoveInput';
import { delay, remainingFloorMs, thinkingFloorMs } from '@lib/motion';
import type { MoveProvider } from '@lib/chess/opponent';
import type { EngineLevel, LevelId } from '@lib/engine/stockfish';
import type { MoveTextResult } from '@lib/chess/notation';
import './replayer.css';
import './play.css';

export interface PlayLabels {
  readonly board: string;
  readonly setupHeading: string;
  readonly colourLegend: string;
  readonly white: string;
  readonly black: string;
  readonly levelLegend: string;
  /** Level id → its translated name. */
  readonly levels: Readonly<Record<LevelId, string>>;
  readonly start: string;
  readonly startNote: string;
  readonly loading: string;
  readonly loadError: string;
  readonly retryLoad: string;
  readonly thinking: string;
  readonly yourTurn: string;
  readonly moveList: string;
  readonly resign: string;
  readonly newGame: string;
  readonly status: string;
  readonly youWin: string;
  readonly youLose: string;
  readonly checkmate: string;
  readonly stalemate: string;
  readonly draw: string;
  readonly repetition: string;
  readonly material: string;
  readonly fiftyMove: string;
  readonly resigned: string;
  readonly check: string;
  readonly move: MoveInputLabels;
}

export interface PlayViewProps {
  readonly locale: 'fr' | 'en';
  readonly labels: PlayLabels;
  readonly coordinates?: boolean;
}

type Phase = 'setup' | 'loading' | 'playing' | 'over';

/** Everything the view needs about the position, recomputed after each move. */
interface Snapshot {
  readonly fen: string;
  readonly turn: 'white' | 'black';
  readonly dests: ReadonlyMap<string, readonly string[]>;
  readonly lastMove: readonly [string, string] | undefined;
  readonly inCheck: boolean;
  readonly history: readonly { san: string; color: 'w' | 'b' }[];
  readonly over: boolean;
}

const NO_ARROWS: readonly never[] = [];
const NO_CIRCLES: readonly string[] = [];
const NO_DESTS: ReadonlyMap<string, readonly string[]> = new Map();

const LEVEL_IDS: readonly LevelId[] = ['debutant', 'intermediaire', 'avance'];

export default function PlayView(props: PlayViewProps) {
  const { locale, labels, coordinates = true } = props;

  const [phase, setPhase] = useState<Phase>('setup');
  const [colour, setColour] = useState<'white' | 'black'>('white');
  const [levelId, setLevelId] = useState<LevelId>('debutant');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);

  /* chess.js and the engine arrive lazily and live in refs: they are mutable
     objects, not render state. The view re-renders off `snapshot` instead. */
  const gameRef = useRef<import('chess.js').Chess | null>(null);
  const providerRef = useRef<MoveProvider | null>(null);
  const chessModuleRef = useRef<typeof import('chess.js') | null>(null);
  const notationRef = useRef<typeof import('@lib/chess/notation') | null>(null);
  const levelsRef = useRef<Readonly<Record<LevelId, EngineLevel>> | null>(null);

  /**
   * Bumped on every new game and on unmount. A search already in flight cannot
   * be un-asked, so its answer is checked against this and dropped if stale —
   * otherwise "New game" mid-think drops the previous game's move onto the new
   * board.
   */
  const generation = useRef(0);

  /* The engine is a Worker with a WASM heap. Leaving one running after the
     reader has navigated away costs a phone real battery. */
  useEffect(() => {
    return () => {
      generation.current += 1;
      providerRef.current?.dispose();
      providerRef.current = null;
    };
  }, []);

  const snapshotOf = useCallback((game: import('chess.js').Chess): Snapshot => {
    const dests = new Map<string, string[]>();
    for (const move of game.moves({ verbose: true })) {
      const list = dests.get(move.from);
      if (list) list.push(move.to);
      else dests.set(move.from, [move.to]);
    }
    const history = game.history({ verbose: true });
    const last = history.at(-1);
    return {
      fen: game.fen(),
      turn: game.turn() === 'w' ? 'white' : 'black',
      dests,
      lastMove: last ? ([last.from, last.to] as const) : undefined,
      inCheck: game.isCheck(),
      history: history.map((m) => ({ san: m.san, color: m.color })),
      over: game.isGameOver(),
    };
  }, []);

  /** Translate a finished position into something to announce. */
  const describeEnd = useCallback(
    (game: import('chess.js').Chess): string => {
      if (game.isCheckmate()) {
        // The side to move is the side that has been mated.
        const loser = game.turn() === 'w' ? 'white' : 'black';
        const readerLost = loser === colour;
        return `${labels.checkmate}. ${readerLost ? labels.youLose : labels.youWin}`;
      }
      if (game.isStalemate()) return labels.stalemate;
      if (game.isInsufficientMaterial()) return labels.material;
      if (game.isThreefoldRepetition()) return labels.repetition;
      if (game.isDraw()) return labels.fiftyMove;
      return labels.draw;
    },
    [colour, labels],
  );

  /** Ask the opponent for a move and play it. */
  const opponentMove = useCallback(async () => {
    const game = gameRef.current;
    const provider = providerRef.current;
    if (!game || !provider || game.isGameOver()) return;

    const mine = generation.current;
    setThinking(true);

    /* The apparent thinking time is a FLOOR, not an added wait — see motion.ts.
       Fixed per move, before the search starts, so the randomisation cannot be
       influenced by how long the engine happened to take. */
    const startedAt = Date.now();
    const floorMs = thinkingFloorMs();

    let uci: string | null = null;
    try {
      uci = await provider.nextMove(game.fen());
    } catch {
      // A dead engine must not look like a thinking one. The game freezes with
      // the board intact rather than pretending a move happened.
      uci = null;
    }
    // Superseded by a new game, a resign, or an unmount.
    if (mine !== generation.current) return;

    /* Hold the "thinking" state for whatever is left of the floor. At Débutant
       the search returns in single-digit ms, so without this the reply lands in
       the same frame as the reader's own move and reads as a glitch rather than
       as an opponent. When the search outlasts the floor this is zero and the
       move plays immediately. */
    const remaining = remainingFloorMs(startedAt, floorMs);
    if (remaining > 0) {
      await delay(remaining);
      /* Re-checked AFTER the wait, not only before it. A new game, a resign or
         an unmount during the floor would otherwise drop the previous game's
         move onto the new board — the same class of bug `generation` exists for,
         reachable through a second await. */
      if (mine !== generation.current) return;
    }

    setThinking(false);
    if (!uci) return;

    try {
      game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {}),
      });
    } catch {
      return;
    }
    setSnapshot(snapshotOf(game));
    if (game.isGameOver()) {
      setResult(describeEnd(game));
      setPhase('over');
      return;
    }
    // Back to the reader — pull focus to the field for a keyboard player.
    setFocusSignal((prev) => prev + 1);
  }, [describeEnd, snapshotOf]);

  /**
   * A move by the reader — from a drag OR from the text field. Both arrive here.
   */
  const playMove = useCallback(
    (from: string, to: string, promotion?: string | undefined) => {
      const game = gameRef.current;
      if (!game || thinking || game.isGameOver()) return;
      if ((game.turn() === 'w' ? 'white' : 'black') !== colour) return;

      try {
        game.move({ from, to, ...(promotion ? { promotion } : { promotion: 'q' }) });
      } catch {
        // Chessground holds `dests` so a drag cannot get here illegally, and the
        // text field resolves against chess.js before calling. Belt and braces.
        return;
      }

      setSnapshot(snapshotOf(game));
      if (game.isGameOver()) {
        setResult(describeEnd(game));
        setPhase('over');
        return;
      }
      void opponentMove();
    },
    [colour, describeEnd, opponentMove, snapshotOf, thinking],
  );

  /** Start: this is the click that is allowed to fetch 3.6 MB. */
  const start = useCallback(async () => {
    setLoadError(false);
    setPhase('loading');
    generation.current += 1;
    const mine = generation.current;

    try {
      const [chessModule, notationModule, engineModule] = await Promise.all([
        import('chess.js'),
        import('@lib/chess/notation'),
        import('@lib/engine/stockfish'),
      ]);
      if (mine !== generation.current) return;

      chessModuleRef.current = chessModule;
      notationRef.current = notationModule;
      levelsRef.current = engineModule.LEVELS;

      const level = engineModule.LEVELS[levelId];
      if (providerRef.current) {
        // Reuse the running worker across games — the download is the expensive
        // part and it has already happened.
        engineModule.setEngineLevel(providerRef.current, level);
      } else {
        providerRef.current = await engineModule.createStockfish(level);
      }
      if (mine !== generation.current) return;

      const game = new chessModule.Chess();
      gameRef.current = game;
      setSnapshot(snapshotOf(game));
      setResult(null);
      setPhase('playing');

      // Playing black means the engine opens.
      if (colour === 'black') void opponentMove();
      else setFocusSignal((prev) => prev + 1);
    } catch {
      if (mine !== generation.current) return;
      setLoadError(true);
      setPhase('setup');
    }
  }, [colour, levelId, opponentMove, snapshotOf]);

  const resign = useCallback(() => {
    // Bump first: a search in flight must not land on a resigned game.
    generation.current += 1;
    setThinking(false);
    setResult(`${labels.resigned} ${labels.youLose}`);
    setPhase('over');
  }, [labels]);

  const newGame = useCallback(() => {
    generation.current += 1;
    setThinking(false);
    setSnapshot(null);
    setResult(null);
    gameRef.current = null;
    setPhase('setup');
  }, []);

  const resolveText = useCallback(
    (text: string): MoveTextResult => {
      const notation = notationRef.current;
      const game = gameRef.current;
      if (!notation || !game) return { kind: 'unreadable' };
      return notation.resolveMoveText(game.fen(), text, locale);
    },
    [locale],
  );

  const myTurn =
    phase === 'playing' && !thinking && snapshot !== null && snapshot.turn === colour;

  /* ── Setup ─────────────────────────────────────────────────────────────── */
  if (phase === 'setup' || phase === 'loading') {
    const busy = phase === 'loading';
    return (
      <div class="mcc-play mcc-play-setup" data-testid="play" data-phase={phase}>
        <form
          class="mcc-play-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void start();
          }}
        >
          <fieldset class="mcc-play-fieldset" disabled={busy}>
            <legend>{labels.colourLegend}</legend>
            <div class="mcc-play-options">
              {(['white', 'black'] as const).map((side) => (
                <label key={side} class="mcc-play-option">
                  <input
                    type="radio"
                    name="colour"
                    value={side}
                    checked={colour === side}
                    onChange={() => setColour(side)}
                  />
                  <span>{side === 'white' ? labels.white : labels.black}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset class="mcc-play-fieldset" disabled={busy}>
            <legend>{labels.levelLegend}</legend>
            <div class="mcc-play-options">
              {LEVEL_IDS.map((id) => (
                <label key={id} class="mcc-play-option">
                  <input
                    type="radio"
                    name="level"
                    value={id}
                    checked={levelId === id}
                    onChange={() => setLevelId(id)}
                  />
                  <span>{labels.levels[id]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" class="mcc-play-start" disabled={busy} data-testid="play-start">
            {busy ? labels.loading : labels.start}
          </button>
          {/* Said before the click, not after: a reader on metered data is
              entitled to know what pressing this will cost them. */}
          <p class="mcc-play-note">{labels.startNote}</p>

          <p class="mcc-play-error" role="alert" data-testid="play-error">
            {loadError ? labels.loadError : ''}
          </p>
        </form>
      </div>
    );
  }

  /* ── Playing ───────────────────────────────────────────────────────────── */
  const fen = snapshot?.fen ?? '';
  const rows: { n: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < (snapshot?.history.length ?? 0); i += 2) {
    const row: { n: number; white?: string; black?: string } = { n: Math.floor(i / 2) + 1 };
    const w = snapshot?.history[i];
    const b = snapshot?.history[i + 1];
    if (w) row.white = w.san;
    if (b) row.black = b.san;
    rows.push(row);
  }

  return (
    <div
      class="mcc-play"
      data-testid="play"
      data-phase={phase}
      data-thinking={thinking ? 'true' : 'false'}
      data-turn={snapshot?.turn ?? ''}
    >
      <div class="mcc-play-board">
        <BoardSurface
          fen={fen}
          orientation={colour}
          turnColor={snapshot?.turn ?? 'white'}
          coordinates={coordinates}
          arrows={NO_ARROWS}
          circles={NO_CIRCLES}
          label={labels.board}
          interactive={true}
          {...(snapshot?.lastMove ? { lastMove: snapshot.lastMove } : {})}
          {...(snapshot?.inCheck ? { check: snapshot.turn } : {})}
          {...(myTurn && snapshot
            ? { movableColor: colour, dests: snapshot.dests, onMove: playMove }
            : { dests: NO_DESTS })}
        />

        <p class="mcc-play-turn" data-testid="play-turn">
          {phase === 'over' ? '' : thinking ? labels.thinking : labels.yourTurn}
        </p>
      </div>

      <div class="mcc-play-side">
        {/* Polite: the result and the check announcement must reach a screen
            reader without interrupting a move the reader is mid-way through. */}
        <div
          class="mcc-play-status"
          role="status"
          aria-live="polite"
          aria-label={labels.status}
          data-testid="play-status"
        >
          {result ? (
            <p class="mcc-play-result" data-testid="play-result">
              {result}
            </p>
          ) : snapshot?.inCheck ? (
            <p class="mcc-play-check">{labels.check}</p>
          ) : (
            <p class="mcc-play-quiet">{thinking ? labels.thinking : labels.yourTurn}</p>
          )}
        </div>

        {phase === 'playing' && (
          <MoveInput
            id="play-move"
            labels={labels.move}
            resolve={resolveText}
            onMove={playMove}
            disabled={!myTurn}
            focusSignal={focusSignal}
          />
        )}

        <h2 class="mcc-side-heading">{labels.moveList}</h2>
        <ol class="mcc-movelist" data-testid="play-move-list">
          {rows.map((row) => (
            <li key={row.n} class="mcc-move-row">
              {/* ONE interpolated text node — see the hydration note in
                  ReplayView.tsx. */}
              <span class="mcc-move-number">{`${row.n}.`}</span>
              <span class="mcc-move">{row.white ?? ''}</span>
              <span class="mcc-move">{row.black ?? ''}</span>
            </li>
          ))}
        </ol>

        <div class="mcc-play-actions">
          {phase === 'playing' && (
            <button type="button" class="mcc-play-button" onClick={resign} data-testid="play-resign">
              {labels.resign}
            </button>
          )}
          <button type="button" class="mcc-play-button" onClick={newGame} data-testid="play-new">
            {labels.newGame}
          </button>
        </div>
      </div>
    </div>
  );
}
