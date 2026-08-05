/**
 * The Chessground adapter — the ONLY file in the codebase that imports
 * Chessground.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ LICENCE. Chessground is **GPL-3.0-or-later**, and its README states
 * plainly: "When you use Chessground for your website, your combined work may
 * be distributed only under the GPL. You must release your source code to the
 * users of your website."
 *
 * That is a project-level decision, not a component-level one — see CLAUDE.md
 * → "Third-party licences". The containment here is deliberate: every other
 * module talks to `BoardProps` below, so replacing Chessground with a
 * permissively-licensed board (or a hand-rolled one) is a rewrite of THIS FILE
 * and nothing else.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Preact + a library that owns its own DOM: Chessground mutates everything
 * inside its container, so Preact must never diff that subtree. We render one
 * empty <div>, hand it over on mount, and push updates through `api.set()`.
 * The container div has no children in the VDOM and therefore no reconciliation
 * ever reaches it.
 */

import { useEffect, useRef } from 'preact/hooks';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './board.css';

export interface BoardArrow {
  readonly from: string;
  readonly to: string;
}

export interface BoardProps {
  /** The position to show. */
  readonly fen: string;
  readonly orientation: 'white' | 'black';
  /** Highlighted origin/destination of the move that produced `fen`. */
  readonly lastMove?: readonly [string, string] | undefined;
  /** Side currently in check, if any. */
  readonly check?: 'white' | 'black' | undefined;
  readonly turnColor: 'white' | 'black';
  readonly coordinates: boolean;
  readonly arrows: readonly BoardArrow[];
  readonly circles: readonly string[];
  /**
   * Disable the move animation for this update. Used when the cursor JUMPS
   * (clicking a move, or Home/End) rather than stepping: animating a nine-ply
   * leap produces a meaningless scramble of sliding pieces.
   */
  readonly instant?: boolean;
  /** Accessible name for the board region. */
  readonly label: string;
}

/**
 * Brand brushes. Chessground's defaults are lichess green/red/blue/yellow,
 * which fight the palette. `--mcc-*` tokens cannot be read from JS here without
 * a getComputedStyle round-trip on every draw, so the two brushes we use are
 * mirrored from tokens.css — keep them in sync (there is only one pair).
 */
const BRUSHES = {
  green: { key: 'mccg', color: '#1d4230', opacity: 0.75, lineWidth: 10 }, // green-700
  red: { key: 'mccr', color: '#9f3c2d', opacity: 0.8, lineWidth: 10 },
  blue: { key: 'mccb', color: '#6e5419', opacity: 0.75, lineWidth: 10 }, // brass-700
  yellow: { key: 'mccy', color: '#8d6c26', opacity: 0.9, lineWidth: 10 }, // brass-600
} as const;

/** Arrows use the brass brush; circles mark a square in deep green. */
const ARROW_BRUSH = 'yellow';
const CIRCLE_BRUSH = 'green';

function toShapes(arrows: readonly BoardArrow[], circles: readonly string[]): DrawShape[] {
  return [
    ...arrows.map((a) => ({ orig: a.from as Key, dest: a.to as Key, brush: ARROW_BRUSH })),
    ...circles.map((square) => ({ orig: square as Key, brush: CIRCLE_BRUSH })),
  ];
}

export default function BoardSurface(props: BoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);

  // Mount / unmount. Runs once: Chessground owns the element from here on.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const config: Config = {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: props.coordinates,
      // Replay is a viewer. When the exercise and play modes land they will
      // pass `movable`/`events` through, and this flag becomes a prop.
      viewOnly: true,
      addDimensionsCssVarsTo: host,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      drawable: {
        // The reader does not draw; we supply shapes from content.
        enabled: false,
        visible: true,
        brushes: BRUSHES,
        autoShapes: toShapes(props.arrows, props.circles),
      },
    };
    if (props.lastMove) config.lastMove = [...props.lastMove] as Key[];
    if (props.check) config.check = props.check;

    apiRef.current = Chessground(host, config);

    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Mount-only on purpose — subsequent updates go through api.set() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Updates.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    api.set({
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: props.coordinates,
      // `lastMove: undefined` does NOT clear an existing highlight in
      // Chessground — the config merge skips undefined keys. An empty array does.
      lastMove: props.lastMove ? ([...props.lastMove] as Key[]) : [],
      check: props.check ?? false,
      animation: { enabled: !props.instant, duration: 220 },
    });
    api.setAutoShapes(toShapes(props.arrows, props.circles));
  }, [
    props.fen,
    props.orientation,
    props.turnColor,
    props.coordinates,
    props.lastMove,
    props.check,
    props.instant,
    props.arrows,
    props.circles,
  ]);

  return (
    <div class="mcc-board">
      <div
        class="mcc-board-host"
        ref={hostRef}
        role="img"
        aria-label={props.label}
        data-testid="chessboard"
      />
    </div>
  );
}
