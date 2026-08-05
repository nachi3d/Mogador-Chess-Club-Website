/**
 * ChessBoard — THE board island.
 *
 * There is exactly one of these in the codebase (CLAUDE.md → "Architecture
 * rule — ONE board island"). Every feature that shows a position mounts this
 * component with a different `mode`; there is never a second board.
 *
 * It hydrates with `client:visible` from `ReplayBoard.astro`. Never
 * `client:load` — Chessground plus its piece sprites is the heaviest thing on a
 * trap page, and a reader may never scroll to it.
 *
 * ── Transport-agnostic, per the Session 1 rule ──────────────────────────────
 * This component is handed positions and moves. It does not know, and must not
 * learn, where they come from. Replay reads a PGN parsed at build time; the
 * exercise mode will diff a dragged move against a stored line; v2's online
 * play will receive moves over a Durable Object socket. All three hand this
 * component the same shape. Nothing here may fetch, subscribe, or poll.
 *
 * ── Strings ────────────────────────────────────────────────────────────────
 * Labels arrive pre-translated in `labels`, resolved on the server from
 * `src/i18n/ui.ts`. The island deliberately does NOT import the i18n layer:
 * doing so would pull `src/config/site.ts` and both string tables into the
 * client bundle to render eight button labels.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import BoardSurface, { type BoardArrow } from './BoardSurface';
import type { SerializedPly } from '@lib/chess/replay';
import './replayer.css';

/** Commentary for one ply, already resolved to the reader's language. */
export interface ReplayComment {
  readonly ply: number;
  readonly text: string;
}

/** Arrows/circles to draw at one ply. */
export interface ReplayShapes {
  readonly ply: number;
  readonly arrows?: readonly (readonly [string, string])[];
  readonly circles?: readonly string[];
}

export interface BoardLabels {
  readonly board: string;
  readonly start: string;
  readonly prev: string;
  readonly next: string;
  readonly end: string;
  readonly moveList: string;
  readonly controls: string;
  readonly commentary: string;
  readonly checkmate: string;
  readonly startLabel: string;
  readonly intro: string;
}

export interface ChessBoardProps {
  /** `replay` is implemented. `exercise` and `play` are reserved — see below. */
  readonly mode: 'replay' | 'exercise' | 'play';
  readonly startFen: string;
  readonly plies: readonly SerializedPly[];
  readonly orientation?: 'white' | 'black';
  readonly coordinates?: boolean;
  readonly comments?: readonly ReplayComment[];
  readonly shapes?: readonly ReplayShapes[];
  readonly labels: BoardLabels;
}

/** Cursor value for "before any move". Mirrors START_PLY in the pure module. */
const START = -1;

export default function ChessBoard(props: ChessBoardProps) {
  const {
    mode,
    startFen,
    plies,
    orientation = 'white',
    coordinates = true,
    comments = [],
    shapes = [],
    labels,
  } = props;

  const [cursor, setCursor] = useState(START);
  // Whether the LAST cursor change was a jump rather than a step. A jump
  // animates into nonsense (nine pieces sliding at once), so it renders instantly.
  const [instant, setInstant] = useState(true);
  const listRef = useRef<HTMLOListElement | null>(null);

  const last = plies.length - 1;
  const atStart = cursor <= START;
  const atEnd = cursor >= last;

  /**
   * Move the cursor.
   *
   * Takes a FUNCTION of the previous cursor, never an absolute target computed
   * from the render's `cursor`. Two arrow presses landing in the same frame
   * both read the same stale `cursor` if the target is precomputed, so the
   * second press is silently swallowed — holding the key drops moves. The
   * functional update is applied against the live value, so every press counts.
   */
  const step = useCallback(
    (next: (prev: number) => number, isJump: boolean) => {
      setInstant(isJump);
      setCursor((prev) => Math.max(START, Math.min(next(prev), plies.length - 1)));
    },
    [plies.length],
  );

  /* ── Keyboard ────────────────────────────────────────────────────────────
     Bound to the document rather than the component, so a reader can step
     through without first clicking the board — the common case on a lesson
     page. Guarded against stealing keys from form fields. There is one
     replayer per page by design; if that ever changes, this becomes a
     focus-scoped handler. */
  useEffect(() => {
    if (mode !== 'replay') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          step((p) => p + 1, false);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          step((p) => p - 1, false);
          break;
        case 'Home':
          event.preventDefault();
          step(() => START, true);
          break;
        case 'End':
          event.preventDefault();
          step(() => plies.length - 1, true);
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, plies.length, step]);

  /* Keep the highlighted move visible in a scrolling move list. */
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-current="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor]);

  const current = cursor >= 0 ? plies[cursor] : undefined;
  const fen = current?.fenAfter ?? startFen;
  const turnColor: 'white' | 'black' = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const check = current?.isCheck ? turnColor : undefined;
  const lastMove: readonly [string, string] | undefined = current
    ? [current.from, current.to]
    : undefined;

  const activeShapes = useMemo(() => shapes.find((s) => s.ply === cursor), [shapes, cursor]);
  const arrows: BoardArrow[] = useMemo(
    () => (activeShapes?.arrows ?? []).map(([from, to]) => ({ from, to })),
    [activeShapes],
  );
  const circles = useMemo(() => activeShapes?.circles ?? [], [activeShapes]);
  const comment = comments.find((c) => c.ply === cursor);

  /* Reserved modes. They render a static position rather than throwing, so an
     early integration cannot take a page down. Interaction lands with them. */
  if (mode !== 'replay') {
    return (
      <BoardSurface
        fen={fen}
        orientation={orientation}
        turnColor={turnColor}
        coordinates={coordinates}
        arrows={arrows}
        circles={circles}
        label={labels.board}
      />
    );
  }

  const rows: { moveNumber: number; white?: SerializedPly; black?: SerializedPly }[] = [];
  for (let i = 0; i < plies.length; i += 2) {
    const white = plies[i];
    const black = plies[i + 1];
    const row: { moveNumber: number; white?: SerializedPly; black?: SerializedPly } = {
      moveNumber: Math.floor(i / 2) + 1,
    };
    if (white) row.white = white;
    if (black) row.black = black;
    rows.push(row);
  }

  const moveButton = (ply: SerializedPly | undefined, index: number) => {
    if (!ply) return <span class="mcc-move mcc-move-empty" aria-hidden="true" />;
    const isCurrent = index === cursor;
    return (
      <button
        type="button"
        class="mcc-move"
        data-current={isCurrent ? 'true' : 'false'}
        aria-current={isCurrent ? 'true' : undefined}
        onClick={() => step(() => index, true)}
      >
        {ply.san}
      </button>
    );
  };

  return (
    <div class="mcc-replayer" data-testid="replayer">
      <div class="mcc-replayer-board">
        <BoardSurface
          fen={fen}
          orientation={orientation}
          turnColor={turnColor}
          coordinates={coordinates}
          arrows={arrows}
          circles={circles}
          label={labels.board}
          {...(lastMove ? { lastMove } : {})}
          {...(check ? { check } : {})}
          instant={instant}
        />

        <div class="mcc-controls" role="group" aria-label={labels.controls}>
          <button
            type="button"
            onClick={() => step(() => START, true)}
            disabled={atStart}
            aria-label={labels.start}
            data-testid="replay-start"
          >
            <span aria-hidden="true">⏮</span>
          </button>
          <button
            type="button"
            onClick={() => step((p) => p - 1, false)}
            disabled={atStart}
            aria-label={labels.prev}
            data-testid="replay-prev"
          >
            <span aria-hidden="true">◀</span>
          </button>
          <button
            type="button"
            onClick={() => step((p) => p + 1, false)}
            disabled={atEnd}
            aria-label={labels.next}
            data-testid="replay-next"
          >
            <span aria-hidden="true">▶</span>
          </button>
          <button
            type="button"
            onClick={() => step(() => plies.length - 1, true)}
            disabled={atEnd}
            aria-label={labels.end}
            data-testid="replay-end"
          >
            <span aria-hidden="true">⏭</span>
          </button>
        </div>

        <p class="mcc-replayer-hint">{labels.intro}</p>
      </div>

      <div class="mcc-replayer-side">
        <h2 class="mcc-side-heading">{labels.moveList}</h2>
        <ol class="mcc-movelist" ref={listRef} data-testid="move-list">
          {rows.map((row, rowIndex) => (
            <li key={row.moveNumber} class="mcc-move-row">
              {/* ONE text node, not `{n}.` — adjacent JSX text children are a
                  hydration hazard. The server serialises them into a single
                  "1." text node; Preact hydrates expecting two children, finds
                  one, and APPENDS the missing "." — the move number renders
                  "1.." in the browser and "1." in the HTML. Interpolate instead. */}
              <span class="mcc-move-number">{`${row.moveNumber}.`}</span>
              {moveButton(row.white, rowIndex * 2)}
              {moveButton(row.black, rowIndex * 2 + 1)}
            </li>
          ))}
        </ol>

        {/* Polite live region: stepping with the keyboard must announce the new
            commentary without stealing focus from the control being used. */}
        <div class="mcc-commentary" aria-live="polite" data-testid="commentary">
          {current?.isCheckmate && (
            <p class="mcc-mate" data-testid="checkmate-flag">
              {labels.checkmate}
            </p>
          )}
          {comment ? (
            <p data-testid="commentary-text">{comment.text}</p>
          ) : (
            <p class="mcc-commentary-empty" data-testid="commentary-text">
              {cursor === START ? labels.startLabel : current?.san}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
