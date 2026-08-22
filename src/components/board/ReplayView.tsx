/**
 * ReplayView — the `mode="replay"` half of the board island.
 *
 * Rendered by `ChessBoard.tsx`, which is THE island; this file is a view, not a
 * second board. There is still exactly one Chessground component in the
 * codebase (`BoardSurface.tsx`) and exactly one hydrated entry point.
 *
 * It hydrates with `client:visible` from `ReplayBoard.astro`. Never
 * `client:load` — Chessground plus its piece sprites is the heaviest thing on a
 * trap page, and a reader may never scroll to it.
 *
 * ── Transport-agnostic, per the Session 1 rule ──────────────────────────────
 * This component is handed positions and moves. It does not know, and must not
 * learn, where they come from. Replay reads a PGN parsed at build time; the
 * exercise view diffs a dragged move against a stored line; v2's online play
 * will receive moves over a Durable Object socket. All three hand the same
 * shape down to `BoardSurface`. Nothing here may fetch, subscribe, or poll.
 *
 * ── No chess.js ────────────────────────────────────────────────────────────
 * Replay's PGN is parsed at BUILD time and arrives as plain positions, so
 * chess.js must never be imported here — not even for a type. `SerializedPly`
 * comes in as a type-only import, which TypeScript erases; a value import from
 * `@lib/chess/replay` would drag chess.js into every trap page's bundle.
 *
 * ── Strings ────────────────────────────────────────────────────────────────
 * Labels arrive pre-translated in `labels`, resolved on the server from
 * `src/i18n/ui.ts`. The island deliberately does NOT import the i18n layer:
 * doing so would pull `src/config/site.ts` and both string tables into the
 * client bundle to render eight button labels.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import BoardSurface, { type BoardArrow } from './BoardSurface';
import { REPLAY_ANIMATION_MS } from '@lib/motion';
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

export interface ReplayLabels {
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
  /** Shown only before the demonstration has been started. */
  readonly launch: string;
}

export interface ReplayViewProps {
  readonly startFen: string;
  readonly plies: readonly SerializedPly[];
  readonly orientation?: 'white' | 'black';
  readonly coordinates?: boolean;
  readonly comments?: readonly ReplayComment[];
  readonly shapes?: readonly ReplayShapes[];
  readonly labels: ReplayLabels;
}

/** Cursor value for "before any move". Mirrors START_PLY in the pure module. */
const START = -1;

export default function ReplayView(props: ReplayViewProps) {
  const {
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
  /** Carries `data-keys="bound"` once the document key handler is attached. */
  const rootRef = useRef<HTMLDivElement | null>(null);

  /**
   * ⚠️ FALSE UNTIL THIS ISLAND HAS HYDRATED, AND EVERY CONTROL BELOW DEPENDS
   * ON IT.
   *
   * Astro server-renders this whole component, so the launch button, the four
   * transport controls and all thirteen move-list buttons are in the HTML
   * before any JavaScript arrives — with their `onClick` handlers attached to
   * nothing. Measured on the built page (`dist/pieges/legal/index.html`):
   * sixteen enabled, live-looking, inert buttons.
   *
   * ⚠️ THIS IS A READER'S DEFECT BEFORE IT IS A TEST'S. `client:visible` means
   * hydration is not even REQUESTED until the board scrolls into view, so on a
   * phone the window sits exactly where a student arrives, looks at the
   * diagram, and presses the one big named control that was designed to
   * attract their eye. The press does nothing at all: no move, no error, no
   * acknowledgement. Only a fast local build hides it.
   *
   * The keyboard half of this same fault was already found and fixed — see
   * `data-keys` below, whose comment describes the identical window for
   * ArrowRight. The pointer half was left, and this closes it.
   *
   * ⚠️ `data-keys` IS NOT A SUBSTITUTE AND THE TWO MEAN DIFFERENT THINGS:
   * `data-ready` says the CONTROLS are live, `data-keys` says the document key
   * listener is bound. Both are needed; neither implies the other.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

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
    /*
     * ⚠️ THE ONLY HONEST SIGNAL THAT THE ARROW KEYS ARE LIVE.
     *
     * `<cg-board>` existing proves the BOARD hydrated, and a spec waiting on it
     * to then press ArrowRight is testing a different thing than it thinks:
     * BoardSurface is a CHILD of this component, so its mount effect runs
     * BEFORE this one. There is a real window in which the board is fully
     * rendered and this listener is not yet attached, and a key pressed in that
     * window is silently dropped.
     *
     * It is narrow enough to never appear in isolation and wide enough to
     * appear under a loaded machine — which is exactly the shape of a "flaky"
     * test that is actually a racy one. Set here, in the same effect that binds
     * the listener, so it cannot claim to be bound when it is not.
     *
     * Same pattern as `data-ready` / `data-busy` on the exercise board.
     */
    rootRef.current?.setAttribute('data-keys', 'bound');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      rootRef.current?.removeAttribute('data-keys');
    };
  }, [plies.length, step]);

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
        /* Thirteen of these ship in the HTML of a trap page, every one of them
           inert until hydration. Jumping to a move is the second thing a
           reader tries after the launch button. */
        disabled={!hydrated}
        onClick={() => step(() => index, true)}
      >
        {ply.san}
      </button>
    );
  };

  return (
    <div
      class="mcc-replayer"
      data-testid="replayer"
      ref={rootRef}
      /* The island's own readiness signal — see `hydrated` above. A spec that
         waits on `[data-testid="replayer"]` is waiting on the SERVER's HTML
         and has proved nothing; this is the attribute to wait on. */
      data-ready={hydrated ? 'true' : 'false'}
    >
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
          animationMs={REPLAY_ANIMATION_MS}
        />

        {/*
          ⚠️ THE FIRST CONTROL A READER SEES IS A NAMED BUTTON, NOT AN ICON.

          Four small glyph buttons did not attract the eye at all: the site's
          own author reached for the pieces instead of pressing play. Before
          the demonstration has been started there is exactly ONE thing worth
          doing, so it is offered as one filled, named, full-size control. Once
          started it collapses to the compact set, which is the right shape for
          stepping back and forth.

          Keyboard behaviour is untouched: the arrow keys still drive the
          replayer whether or not this button has been used.
        */}
        {plies.length > 0 && atStart ? (
          <button
            type="button"
            class="mcc-replay-launch"
            /* ⚠️ THE MOST-PRESSED CONTROL ON THE PAGE, AND THE ONE THE COMMENT
               ABOVE SAYS WAS BUILT TO ATTRACT THE EYE — so it is also the one
               most likely to be pressed inside the hydration window. Disabled
               is the honest state: it says "not yet" instead of lying. */
            disabled={!hydrated}
            onClick={() => step((p) => p + 1, false)}
            data-testid="replay-launch"
          >
            <span aria-hidden="true">▶</span>
            {labels.launch}
          </button>
        ) : null}

        {/* ⚠️ The compact set is NOT hidden before the first move.
            "Collapsing to the compact controls" happens by the launch button
            going away, not by taking the others out. Hiding them made "jump to
            the end" unreachable as a first action, and broke eight existing
            navigation specs that legitimately expect the controls to be there
            on arrival. The launch button adds a prominent entry point; it does
            not gate the rest. */}
        {/* ⚠️ EVERY ONE OF THESE CARRIES `!hydrated`, INCLUDING THE TWO THAT
            LOOK ALREADY COVERED. `atStart` is true on arrival, so "start" and
            "prev" ship disabled — but by ACCIDENT of cursor state, not because
            anything checked readiness. Left on `atStart` alone, the guard
            disappears silently the day this ever renders at a non-zero
            cursor. */}
        <div class="mcc-controls" role="group" aria-label={labels.controls} hidden={plies.length === 0}>
          <button
            type="button"
            onClick={() => step(() => START, true)}
            disabled={atStart || !hydrated}
            aria-label={labels.start}
            data-testid="replay-start"
          >
            <span aria-hidden="true">⏮</span>
          </button>
          <button
            type="button"
            onClick={() => step((p) => p - 1, false)}
            disabled={atStart || !hydrated}
            aria-label={labels.prev}
            data-testid="replay-prev"
          >
            <span aria-hidden="true">◀</span>
          </button>
          <button
            type="button"
            onClick={() => step((p) => p + 1, false)}
            disabled={atEnd || !hydrated}
            aria-label={labels.next}
            data-testid="replay-next"
          >
            <span aria-hidden="true">▶</span>
          </button>
          <button
            type="button"
            onClick={() => step(() => plies.length - 1, true)}
            disabled={atEnd || !hydrated}
            aria-label={labels.end}
            data-testid="replay-end"
          >
            <span aria-hidden="true">⏭</span>
          </button>
        </div>

        {plies.length > 0 && <p class="mcc-replayer-hint">{labels.intro}</p>}
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
