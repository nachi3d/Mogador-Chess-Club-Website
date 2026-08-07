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
import { BOARD_ANIMATION_MS, boardAnimationMs } from '@lib/motion';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Dests, Key } from 'chessground/types';

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
  /**
   * How long a move animates, in ms. Defaults to the gameplay duration.
   *
   * Replay mode passes the shorter navigation duration — see the gameplay-vs-
   * navigation note in `src/lib/motion.ts`. This is the ONLY knob: because every
   * mode mounts this one component, setting it here is what makes the pacing
   * consistent across replay, exercise and play without three copies of a number.
   *
   * `prefers-reduced-motion` overrides it to zero at read time; callers do not
   * need to check.
   */
  readonly animationMs?: number;
  /** Accessible name for the board region. */
  readonly label: string;
  /**
   * A square to mark with a brief accent pulse, or undefined for none.
   *
   * ⚠️ THE BOARD STAYS SOBER (CLAUDE.md → E1 motion). This is the ONLY motion
   * this component adds on top of piece movement, it lasts one Transition, it
   * fires only on a correct move in exercise mode, and it never loops. Play mode
   * deliberately does not use it: there is no "correct" there, and a board that
   * flashes on every engine reply is a board that is hard to read.
   *
   * Implemented with Chessground's own `highlight.custom` rather than an
   * overlay of our own, because Chessground already knows where a square is —
   * including after a flip. An overlay would need us to recompute file/rank
   * geometry against the orientation, which is a second source of truth for
   * something the board is authoritative about.
   *
   * It is purely decorative: the verdict is stated in words in the live region,
   * so a reader who cannot see this loses nothing.
   */
  readonly pulseSquare?: string | undefined;

  /* ── Interaction. Replay leaves all of this unset and stays a viewer. ──── */

  /**
   * Whether this board accepts input AT ALL. **Read once, at mount, and never
   * again** — changing it later has no effect.
   *
   * ⚠️ THIS CANNOT BE DERIVED FROM `movableColor`, AND THAT IS A CHESSGROUND
   * CONSTRAINT, NOT A STYLE CHOICE. `bindBoard()` returns early when
   * `viewOnly` is true, and `bindDocument()` skips its move/end listeners the
   * same way. Neither is ever re-run: `api.set({ viewOnly: false })` flips the
   * flag on a board that has no `mousedown` listener, so nothing happens and
   * the failure is completely silent.
   *
   * The exercise board therefore mounts interactive even though its engine
   * chunk has not loaded yet — it is `movableColor`/`dests` below that gate
   * whether a move is *currently* allowed, not this.
   */
  readonly interactive?: boolean;
  /**
   * Which colour the reader may move right now, or undefined for "no move
   * allowed at the moment". Safe to change on every render — Chessground
   * re-reads it per interaction, unlike `interactive` above.
   */
  readonly movableColor?: 'white' | 'black' | undefined;
  /**
   * Legal destinations per origin square. Chessground REFUSES anything not in
   * here, so illegal moves never reach the caller — but the caller still checks,
   * because "the UI won't allow it" is a hope, not a rule.
   *
   * chess.js is the source of legality; Chessground only enforces what it is
   * told. Never let the board decide (CLAUDE.md → ONE board island).
   */
  readonly dests?: ReadonlyMap<string, readonly string[]> | undefined;
  /**
   * Called after the reader completes a move. Chessground has ALREADY moved the
   * piece by the time this fires — the caller either confirms by pushing a new
   * `fen`, or rejects by pushing the same one back (see `forceFen` below).
   */
  readonly onMove?: ((from: string, to: string) => void) | undefined;
  /**
   * Bump to force the board back to `fen` even though `fen` itself has not
   * changed.
   *
   * This exists for exactly one case, and it is not optional: when a move is
   * REJECTED, Chessground has already slid the piece to its new square, but the
   * position we want is the one we were already showing. `fen` is therefore
   * identical to last render, the update effect below does not re-run, and the
   * board sits there displaying a move the engine refused. Incrementing this
   * puts the piece back.
   */
  readonly revision?: number;
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

/**
 * The custom-highlight map Chessground wants for `pulseSquare`.
 *
 * ⚠️ ALWAYS returns a Map, never undefined — even when there is nothing to
 * pulse. Chessground's config merge assigns non-plain-object values directly,
 * so an explicit empty Map clears the previous pulse while `undefined` would
 * rely on the same merge behaviour that `lastMove: undefined` already gets
 * wrong elsewhere in this file. An empty Map is unambiguous in both directions.
 */
function toPulse(square: string | undefined): Map<Key, string> {
  const out = new Map<Key, string>();
  if (square) out.set(square as Key, PULSE_CLASS);
  return out;
}

/** Styled in board.css. Chessground concatenates it onto the square's classes. */
const PULSE_CLASS = 'mcc-pulse';

/** Our readonly map → the mutable `Map<Key, Key[]>` Chessground mutates internally. */
function toDests(dests: ReadonlyMap<string, readonly string[]> | undefined): Dests {
  const out: Dests = new Map();
  if (dests) for (const [from, tos] of dests) out.set(from as Key, [...tos] as Key[]);
  return out;
}

export default function BoardSurface(props: BoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);

  /**
   * The move handler is registered ONCE, at mount, inside Chessground's config.
   * A closure captured there would go stale the moment the exercise advances a
   * step — it would keep judging against the first position forever. The ref is
   * re-pointed on every render, and the registered wrapper reads through it, so
   * the handler that runs is always the current one.
   */
  const onMoveRef = useRef(props.onMove);
  onMoveRef.current = props.onMove;

  // Mount / unmount. Runs once: Chessground owns the element from here on.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const mountAnimationMs = boardAnimationMs(props.animationMs ?? BOARD_ANIMATION_MS);

    const config: Config = {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: props.coordinates,
      // Replay is a viewer. Fixed for the component's lifetime — see the
      // `interactive` prop; this is the one flag api.set() cannot fix later.
      viewOnly: !props.interactive,
      addDimensionsCssVarsTo: host,
      // Resolved through motion.ts so reduced-motion is honoured without every
      // caller remembering to ask. Zero duration ⇒ disabled outright.
      animation: {
        enabled: mountAnimationMs > 0,
        duration: mountAnimationMs,
      },
      highlight: { lastMove: true, check: true, custom: toPulse(props.pulseSquare) },
      movable: {
        // `free: false` is what makes `dests` binding rather than advisory.
        free: false,
        color: props.movableColor ?? undefined,
        dests: toDests(props.dests),
        showDests: true,
        events: {
          after: (orig, dest) => onMoveRef.current?.(orig, dest),
        },
      },
      // No opponent is "thinking" — a premove would only queue a move the
      // student cannot see being judged.
      premovable: { enabled: false },
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

    /* Re-resolved per update rather than reused from mount: the preference can
       change mid-session, and a spec that calls `emulateMedia` after the board
       has mounted must still get instant moves. */
    const animateMs = boardAnimationMs(props.animationMs ?? BOARD_ANIMATION_MS);

    api.set({
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: props.coordinates,
      // `viewOnly` is deliberately NOT set here: it is bind-time only and
      // setting it would silently produce a board that looks movable and is not.
      // `lastMove: undefined` does NOT clear an existing highlight in
      // Chessground — the config merge skips undefined keys. An empty array does.
      lastMove: props.lastMove ? ([...props.lastMove] as Key[]) : [],
      check: props.check ?? false,
      highlight: { lastMove: true, check: true, custom: toPulse(props.pulseSquare) },
      animation: { enabled: !props.instant && animateMs > 0, duration: animateMs },
      movable: {
        free: false,
        color: props.movableColor ?? undefined,
        dests: toDests(props.dests),
      },
    });
    api.setAutoShapes(toShapes(props.arrows, props.circles));
  }, [
    props.fen,
    props.orientation,
    props.turnColor,
    props.coordinates,
    props.lastMove,
    props.check,
    props.pulseSquare,
    props.instant,
    props.animationMs,
    props.arrows,
    props.circles,
    props.movableColor,
    props.dests,
    // Not read in the body — it is the signal to re-run when `fen` is unchanged
    // but the board has drifted from it. See the prop's comment.
    props.revision,
  ]);

  return (
    <div class="mcc-board">
      {/* `role="img"` describes a diagram, which is exactly what a view-only
          board is. An exercise board is operated, not read, so it becomes a
          labelled group instead — announcing "image" over something a reader is
          expected to drag pieces on would be a lie. */}
      <div
        class="mcc-board-host"
        ref={hostRef}
        role={props.interactive ? 'group' : 'img'}
        aria-label={props.label}
        data-testid="chessboard"
      />
    </div>
  );
}
