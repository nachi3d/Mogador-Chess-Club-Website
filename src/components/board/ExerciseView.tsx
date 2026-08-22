/**
 * ExerciseView — the `mode="exercise"` half of the board island.
 *
 * Rendered by `ChessBoard.tsx`. It is a view over the same single Chessground
 * component (`BoardSurface.tsx`), not a second board.
 *
 * ── chess.js is LAZY here, and that is the point ────────────────────────────
 * Replay parses its PGN at build time and ships plain positions, so a trap page
 * never downloads chess.js. An exercise genuinely needs it in the browser: the
 * legality of an arbitrary dragged move cannot be precomputed. So the engine
 * module is pulled in with `await import()` inside an effect, which Vite splits
 * into its own chunk. Never convert that to a static import — it would put
 * chess.js back into the shared island chunk and make every trap page pay for a
 * feature it does not have.
 *
 * Until the chunk lands, the board renders view-only from the starting FEN. It
 * is the real position, not a spinner over an empty grid, so a reader on a slow
 * connection sees the puzzle immediately and only the dragging waits.
 *
 * ── The validation rule this file exists to honour ──────────────────────────
 * `onlyMove: false` MUST NOT tell a student their move is wrong. It says "not
 * the line we had in mind". See CLAUDE.md → "Exercise validation rule"; the two
 * verdicts differ only in which label renders. A beginner told that a winning
 * move is an error learns that correct moves are mistakes, which is worse than
 * shipping no validation at all.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import BoardSurface from './BoardSurface';
import { useMoveSource } from './useMoveSource';
import MoveInput, { type MoveInputLabels } from './MoveInput';
import { PULSE_MS, SHAKE_MS, thinkingFloorMs } from '@lib/motion';
import type { ExerciseDefinition, ExerciseMove, ResolvedExercise } from '@lib/chess/exercise';
import type { MoveTextResult } from '@lib/chess/notation';
import {
  readExercise,
  extendStreak,
  recordAttempt,
  recordHintUsed,
  recordSolved,
  resetStreak,
  resetAttempts,
} from '@lib/progress';
import { readScore, refreshScore } from '@lib/score';
/**
 * ⚠️ EVERY SOUND ON THE SITE COMES FROM THIS ONE MODULE — no oscillator is
 * built here or anywhere else. `play` is a no-op unless the reader switched
 * sound on, so the calls below cost nothing in the default case.
 */
import {
  acceptInvitation,
  declineInvitation,
  initSound,
  play as playSound,
  shouldInvite,
  voiceForMove,
} from '@lib/sound';
/* `.mcc-side-heading` and `.mcc-move` are defined in replayer.css and reused
   here — same controls, same look, one definition. Imported EXPLICITLY rather
   than relying on ReplayView happening to be in the same chunk: that is true
   today only because ChessBoard imports both views, which is a fact about the
   dispatcher, not a contract. ES modules dedupe, so this costs nothing. */
import './replayer.css';
import './exercise.css';

export interface ExerciseLabels {
  readonly board: string;
  readonly loading: string;
  readonly status: string;
  readonly turnWhite: string;
  readonly turnBlack: string;
  readonly instructions: string;
  readonly step: string;
  readonly attempts: string;
  readonly hintShow: string;
  readonly hintHeading: string;
  readonly correct: string;
  readonly wrong: string;
  /**
   * WHY the move was refused, when there is a why worth giving.
   *
   * It shows under `wrong` — the verdict where the reader played something legal
   * that is not the solution. "That is not the right move" tells them the result;
   * this tells them what the site actually knows, which is that their move was
   * playable and simply is not the one this position is about. Failure must
   * inform (E1), and a beginner who cannot tell "illegal" from "not the point"
   * learns the wrong lesson from the same red text.
   *
   * It is the exact counterpart of `offLineNote` under the permissive verdict —
   * one caveat per verdict, never both, never neither.
   */
  readonly wrongReason: string;
  readonly offLine: string;
  readonly offLineNote: string;
  readonly solved: string;
  readonly solvedAgain: string;
  /** "+%s points" — the award, in the solve moment (E3). */
  readonly points: string;
  /** "%s d'affilée" — the session run, shown from two upward (E3). */
  readonly streak: string;
  readonly retry: string;
  readonly solutionHeading: string;
  readonly solutionHint: string;
  readonly checkmate: string;
  readonly move: MoveInputLabels;
  /** The one-time sound invitation (E2). Resolved on the server like the rest. */
  readonly sound: SoundInviteLabels;
}

export interface SoundInviteLabels {
  readonly question: string;
  readonly detail: string;
  readonly accept: string;
  readonly decline: string;
  readonly accepted: string;
}

export interface ExerciseViewProps {
  /** Content slug — the key progress is stored under. */
  readonly slug: string;
  /** The reader's language — decides whether `R` means rook or roi. */
  readonly locale: 'fr' | 'en';
  readonly definition: ExerciseDefinition;
  /** Hint text, already resolved to the reader's language on the server. */
  readonly hint: string;
  readonly orientation?: 'white' | 'black';
  readonly coordinates?: boolean;
  readonly labels: ExerciseLabels;
}

/**
 * How long a correct move sits on the board before the opponent answers.
 *
 * Long enough to read as a consequence rather than a glitch, short enough not to
 * feel like waiting. Drawn from the SAME range as the engine's thinking floor on
 * `/jouer/` (see `src/lib/motion.ts`) and randomised per reply, so a scripted
 * opponent and a real one are paced identically — a student moving between the
 * two pages should not be able to feel which is which.
 *
 * Unlike the engine there is nothing to wait for here: the reply is known at
 * build time, so the floor IS the whole delay.
 *
 * ⚠️ Under `prefers-reduced-motion` this drops to a minimal floor rather than to
 * zero (Session 6). The earlier note here said reduced motion should not shorten
 * it at all, on the grounds that this is pacing rather than decoration. That
 * still holds — which is why it becomes 150ms and not 0. What changed is the
 * recognition that a reader who has asked for less motion has usually also asked
 * for less waiting, and 150ms is enough to keep the two move announcements from
 * overlapping for a screen reader, which is the thing the gap actually protects.
 */
function replyDelayMs(): number {
  return thinkingFloorMs();
}

/** The verdict currently being shown. Drives the message and the board tint. */
type Feedback = 'idle' | 'correct' | 'wrong' | 'off-line';

/* Hoisted so they keep one identity across renders. BoardSurface's update
   effect is keyed on these props; fresh `[]` and `new Map()` literals would
   make it re-run `api.set()` on every render, including in the middle of a
   move animation. An exercise draws no arrows or circles. */
const NO_ARROWS: readonly never[] = [];
const NO_CIRCLES: readonly string[] = [];
const NO_DESTS: ReadonlyMap<string, readonly string[]> = new Map();

export default function ExerciseView(props: ExerciseViewProps) {
  const {
    slug,
    locale,
    definition,
    hint,
    // A puzzle is shown from the solver's side of the board by default —
    // reading a mate from behind the mated king is needlessly hard.
    orientation = definition.fen.split(' ')[1] === 'b' ? 'black' : 'white',
    coordinates = true,
    labels,
  } = props;

  /** null until the lazily-imported engine chunk has resolved. */
  const [engine, setEngine] = useState<ResolvedExercise | null>(null);
  const judgeRef = useRef<typeof import('@lib/chess/exercise').judgeMove | null>(null);
  /* The notation parser rides in on the same lazy chunk — it needs chess.js
     too, so making it a second dynamic import would only add a round trip. */
  const resolveRef = useRef<typeof import('@lib/chess/notation').resolveMoveText | null>(null);
  /** Bumped whenever it becomes the reader's turn again — pulls focus back. */
  const [focusSignal, setFocusSignal] = useState(0);
  /* Which door the last move came through. See useMoveSource.ts — focus
     follows the modality of the MOVE, never the device. */
  const moveSource = useMoveSource();
  /**
   * Pull focus back to the field, but ONLY if the reader typed the last move.
   *
   * After a tapped move this must do nothing: focusing a text field opens the
   * virtual keyboard, which shrinks the viewport and scrolls the board away.
   * Every `setFocusSignal` in this component goes through here.
   */
  const refocusIfTyped = useCallback(() => {
    if (moveSource.lastWasText()) setFocusSignal((prev) => prev + 1);
  }, [moveSource]);

  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  /**
   * Separate from `feedback` on purpose. The shake is over in ~600ms, but the
   * sentence explaining it must stay on screen until the reader tries again —
   * a message that vanishes before it can be read is not feedback.
   */
  const [shaking, setShaking] = useState(false);
  /** True while a scripted sequence is playing out. The board is not movable. */
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [solved, setSolved] = useState(false);
  /** True only when the reader had already solved this on a previous visit. */
  const [solvedBefore, setSolvedBefore] = useState(false);
  /**
   * Points this solve added to the total, or 0 (E3).
   *
   * ⚠️ ZERO IS A REAL AND COMMON ANSWER — a re-solve, or a lesson board that is
   * not the last one of its lesson. It renders NOTHING rather than "+0 points",
   * which would read as a mark out of ten.
   */
  const [awarded, setAwarded] = useState(0);
  /** The session run, for the small indicator beside the solve. */
  const [streak, setStreak] = useState(0);
  /** A move being shown AHEAD of the current step's position, or null. */
  const [shown, setShown] = useState<ExerciseMove | null>(null);
  /** Bumped to push the board back to a position it has drifted from. */
  const [revision, setRevision] = useState(0);
  /** Cursor into the full solution list, once solved. */
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  /**
   * The square to pulse, or null. Set on a correct move and cleared one
   * Transition later — it is an acknowledgement, not a state, so it must not
   * survive into the next step and sit there as a second highlight.
   */
  const [pulse, setPulse] = useState<string | null>(null);
  /**
   * The one-time sound invitation (E2), shown beside the solve.
   *
   * ⚠️ Local state, not derived on render: `shouldInvite()` reads
   * `localStorage`, and reading storage during render is the hydration-mismatch
   * bug this file already documents for progress. It is consulted once, in the
   * solve handler, which is an event.
   */
  const [inviting, setInviting] = useState(false);
  /** Set when the reader accepts, so the panel can confirm rather than vanish. */
  const [inviteAccepted, setInviteAccepted] = useState(false);

  /* Pending timers, cleared on unmount and on retry so nothing fires late into
     a state it was not scheduled for. */
  const timers = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  /**
   * ⚠️ THE PULSE'S CLOCK STARTS WHEN IT IS PAINTED, NOT WHEN IT IS REQUESTED.
   *
   * ── THE DEFECT THIS FIXES ────────────────────────────────────────────────
   * This used to be `after(PULSE_MS, () => setPulse(null))` on the line right
   * after `setPulse(square)` in the move handler, so the 300ms was pure
   * wall-clock, measured from before anything had rendered.
   *
   * Chessground's redraw is rAF-debounced AND coalescing
   * (`debounceRedraw` in `chessground/src/chessground.ts`):
   *
   *     if (redrawing) return;          // a second set() is DROPPED
   *     redrawing = true;
   *     requestAnimationFrame(() => { redrawNow(); redrawing = false; });
   *
   * So on a main thread starved of frames — a cheap Android, or five browsers
   * on one CI box — the sequence was:
   *
   *     api.set({custom:{a8}})   schedules a frame
   *     …no frame for >300ms…
   *     api.set({custom:{}})     DROPPED, a redraw is already pending
   *     the frame finally runs   renders the CURRENT state: no pulse
   *
   * The intermediate state was never painted, so the square was never marked
   * at all. Not marked briefly — never. **The reader on the slowest phone,
   * the one who most needs to be told their move was accepted, was the one
   * guaranteed not to be.**
   *
   * Waiting one animation frame before starting the clock fixes it: rAF
   * callbacks run in registration order, and BoardSurface's effect (a child,
   * so it runs first) has already queued Chessground's redraw by the time
   * this queues its own. When ours runs, the pulse is on screen — and only
   * then does the 300ms begin.
   *
   * ── HOW IT WAS FOUND, so nobody re-derives it ────────────────────────────
   * As a "flaky test". `feel.spec.ts`'s pulse test failed WebKit matrix runs
   * from v0.3.0 to v0.7.0 and was twice patched as a SAMPLING problem. It was
   * not. A diagnostic with four independent samplers recorded 35 mutation
   * records and zero sightings of the class, while a `data-pulse` probe on
   * this component showed the state being committed and cleared normally —
   * which put the failure below Preact and above the DOM, i.e. exactly here.
   *
   * The cleanup replaces what `clearTimers()` used to do: `retry()` sets
   * `pulse` to null, which runs this cleanup, which cancels both handles.
   */
  useEffect(() => {
    if (pulse === null) return undefined;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setPulse(null), PULSE_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pulse]);

  /**
   * ⚠️ ARMS THE GESTURE LATCH — IT DOES NOT CREATE AN AudioContext.
   *
   * `initSound` only attaches two one-shot passive listeners and subscribes to
   * the achievement event. The context is built on the first `play()` that
   * follows a real gesture, and never before: a spec asserts that loading an
   * exercise page constructs no `AudioContext` at all.
   */
  useEffect(() => {
    initSound();
  }, []);

  /* ── Lazy engine, and the stored progress ──────────────────────────────── */
  useEffect(() => {
    let live = true;
    void (async () => {
      const [engineModule, notationModule] = await Promise.all([
        import('@lib/chess/exercise'),
        import('@lib/chess/notation'),
      ]);
      if (!live) return;
      judgeRef.current = engineModule.judgeMove;
      resolveRef.current = notationModule.resolveMoveText;
      setEngine(engineModule.resolveExercise(definition));
    })();

    /* Progress is read in an EFFECT, not in the initial state. Reading
       localStorage during render would make the hydrated DOM disagree with the
       server-rendered HTML — the same class of bug as the `{n}.` move number. */
    const stored = readExercise(slug);
    setAttempts(stored.attempts);
    setHintShown(stored.hintUsed);
    setSolvedBefore(stored.solved);

    return () => {
      live = false;
    };
  }, [definition, slug]);

  const step = engine?.steps[stepIndex];
  const total = engine?.steps.length ?? definition.solution.length;

  /* ── The reader played a move ──────────────────────────────────────────── */
  const onMove = useCallback(
    (from: string, to: string) => {
      const judge = judgeRef.current;
      if (!engine || !step || !judge || solved || busy) return;

      const verdict = judge(step, from, to, engine.onlyMove);

      if (verdict.kind === 'illegal') {
        /* Unreachable through the board — Chessground is holding `dests` — but
           if it ever happens, put the piece back and say nothing. A student who
           could not have made this move must not be blamed for it. */
        setRevision((prev) => prev + 1);
        return;
      }

      if (verdict.kind !== 'correct') {
        /* ⚠️ ONE VOICE FOR BOTH VERDICTS, exactly as one message colour serves
           both: under `onlyMove: false` we do not KNOW the reader was wrong, so
           we must not sound as though we do. See the rule at the top of this
           file — a harsher tone for `wrong` would say in sound what the copy
           is careful not to say in words. */
        playSound('wrong');
        /* Wrong, or merely off our line. Both count an attempt and both reset
           the board; ONLY THE WORDING differs, and that is the `onlyMove` rule
           (CLAUDE.md). Nothing below this line branches on which it was. */
        setFeedback(verdict.kind);
        setShaking(true);
        setBusy(true);
        setAttempts(recordAttempt(slug).attempts);
        /* The run ends here (E3).
           ⚠️ SILENTLY. There is no "streak lost" message and there must not be
           — the reader is already being told their move was refused, and
           announcing a forfeited streak on top of it charges twice for one
           mistake. The counter simply stops being shown below two. */
        resetStreak();
        after(SHAKE_MS, () => {
          setShaking(false);
          setBusy(false);
          // Chessground has already slid the piece; `fen` is unchanged, so only
          // a revision bump puts it back. See BoardSurface's `revision` prop.
          setRevision((prev) => prev + 1);
          refocusIfTyped();
        });
        return;
      }

      const isLastStep = stepIndex >= engine.steps.length - 1;
      const reply = step.reply;

      setFeedback('correct');
      setBusy(true);
      setShown(verdict.move);
      /* The reader's own move. `voiceForMove` owns the priority — a capture
         that gives check sounds as a check, because that is the more urgent
         fact and stacking both reads as a mistake. */
      playSound(voiceForMove(verdict.move));
      /* The board's share of the feedback: one Transition on the square the
         piece landed on. Cleared by the effect near the top of this component
         rather than here — the clock must not start until the pulse has been
         PAINTED. See the note there; starting it on this line silently drops
         the whole acknowledgement on a slow phone. */
      setPulse(verdict.move.to);

      const advance = () => {
        setFeedback('idle');
        setBusy(false);
        setShown(null);
        if (!isLastStep) {
          setStepIndex((prev) => prev + 1);
          /* It is the reader's turn again. A player who TYPED must not be left
             with focus on a control that was disabled while the opponent
             moved; a player who TAPPED must not have a keyboard thrown over
             the board they are looking at. */
          refocusIfTyped();
          return;
        }
        setSolved(true);
        setReviewIndex(engine.line.length - 1);
        /* ⚠️ The solve voice REPLACES the move voice here rather than stacking
           on it: the last correct move already sounded, and a second sound
           50ms later reads as a stutter. `playSound` is a no-op when sound is
           off, so the ordering below costs nothing in the default case. */
        playSound('solved');
        /* The one-time offer, at the moment the direction doc names: the first
           solve. `shouldInvite` owns every condition — already on, already
           asked, or reduced motion requested. */
        if (shouldInvite()) setInviting(true);

        /**
         * ⚠️ THE AWARD IS THE DELTA IN THE TOTAL, NOT A NUMBER THIS FILE KNOWS.
         *
         * Read the total, record the solve, recompute, subtract. That is the
         * only way to be right in all three cases at once, and each of them
         * would need its own rule if the award were passed in as a prop:
         *
         *   - a RE-SOLVE awards nothing, because the record is already `solved`
         *     and the ledger is derived from it — no "have they done this
         *     before" branch needed here (the no-farming rule, for free);
         *   - a LESSON board awards nothing until the LAST board of that lesson
         *     is solved, because a lesson is one catalogue entry;
         *   - a hint reduces the award, and the reduction is already in the
         *     catalogue value the resolver picked.
         *
         * It also means the number shown here and the number on `/progres/`
         * cannot disagree: they are the same computation, one subtraction
         * apart. See `ScoreResolver.astro`.
         */
        const before = readScore()?.points ?? null;
        recordSolved(slug);
        /* Extended BEFORE the recompute, so a fifth consecutive solve can fire
           `streak-five` in the same pass that awards the points. */
        setStreak(extendStreak());
        const after = refreshScore();
        setAwarded(before !== null && after ? Math.max(0, after.points - before) : 0);
      };

      if (reply) {
        // The reply lands first and the step advances with it; advancing early
        // would swap the next position in underneath the reply's animation.
        // Each leg draws its own delay, so the pair does not beat in time.
        after(replyDelayMs(), () => {
          setShown(reply);
          /* The opponent's move gets the same voices as the reader's. A silent
             opponent would make the board feel one-sided — and a capture the
             reader did not make is exactly the event worth hearing. */
          playSound(voiceForMove(reply));
          after(replyDelayMs(), advance);
        });
        return;
      }
      after(replyDelayMs(), advance);
    },
    [after, busy, engine, slug, solved, step, stepIndex],
  );

  /**
   * Typed text → a move, against the step the reader is actually looking at.
   *
   * The result goes to the SAME `onMove` the board calls, so a typed move and a
   * dragged move are indistinguishable from here on — including how they are
   * judged, counted and announced.
   */
  const resolveText = useCallback(
    (text: string): MoveTextResult => {
      const resolve = resolveRef.current;
      if (!resolve || !step) return { kind: 'unreadable' };
      return resolve(step.fen, text, locale);
    },
    [locale, step],
  );

  const revealHint = useCallback(() => {
    setHintShown(true);
    recordHintUsed(slug);
  }, [slug]);

  const retry = useCallback(() => {
    clearTimers();
    setStepIndex(0);
    setShown(null);
    setFeedback('idle');
    setShaking(false);
    setBusy(false);
    setSolved(false);
    setPulse(null);
    // Having solved it once is a fact about the reader; the retry button must
    // not take that back. `resetAttempts` clears the counter and nothing else.
    setSolvedBefore((was) => was || solved);
    setReviewIndex(null);
    setAttempts(resetAttempts(slug).attempts);
    setRevision((prev) => prev + 1);
  }, [clearTimers, slug, solved]);

  /* ── What the board should display right now ───────────────────────────── */

  /* The move that produced the CURRENT step's position, so the highlight
     survives after `shown` is cleared. A step's position is exactly the
     previous step's reply-after (or its expected-after when the line has no
     reply there), so no extra bookkeeping is needed. */
  const previous = stepIndex > 0 ? engine?.steps[stepIndex - 1] : undefined;
  const priorMove = previous?.reply ?? previous?.expected;
  const reviewMove = reviewIndex !== null ? engine?.line[reviewIndex] : undefined;
  const displayed = reviewMove ?? shown ?? priorMove;

  const fen = displayed?.fenAfter ?? step?.fen ?? definition.fen;
  const turnColor: 'white' | 'black' = fen.split(' ')[1] === 'b' ? 'black' : 'white';

  /* Movable only at a step's start position: not while a correct move is being
     answered, not during the shake, and not after the solve. */
  const interactive = Boolean(engine && step) && !solved && !busy && shown === null;

  const message =
    feedback === 'correct'
      ? labels.correct
      : feedback === 'wrong'
        ? labels.wrong
        : feedback === 'off-line'
          ? labels.offLine
          : null;

  const state = solved ? 'solved' : feedback;

  return (
    <div
      class="mcc-exercise"
      data-testid="exercise"
      data-state={state}
      data-step={stepIndex}
      data-attempts={attempts}
      data-ready={engine ? 'true' : 'false'}
      /* The board looks identical while it is playing out a reply or running
         the shake, but it ignores input — which is correct, and invisible.
         Exposing it keeps that observable: without it a test (or a reader
         watching the console) cannot tell "refused" from "not listening yet". */
      data-busy={interactive ? 'false' : 'true'}
      /* Exposed for the same reason as `data-busy`: the pulse is applied below
         Preact, inside Chessground, and without this there is no way to tell
         "the state was never set" from "the state was set and never painted".
         That distinction is what located the rAF-debounce defect above, after
         two confident wrong diagnoses. Keep it. */
      data-pulse={pulse ?? ''}
    >
      <div class="mcc-exercise-board">
        {/* The shake lives on this wrapper, never on the Chessground host:
            transforming the host would carry the coordinate overlay and the drag
            layer with it, and Chessground measures that element on resize. */}
        <div
          class={`mcc-exercise-surface mcc-fb-${state}`}
          data-shake={shaking ? 'true' : 'false'}
        >
          <BoardSurface
            fen={fen}
            orientation={orientation}
            turnColor={turnColor}
            coordinates={coordinates}
            arrows={NO_ARROWS}
            circles={NO_CIRCLES}
            label={labels.board}
            revision={revision}
            /* Constant, and it must be: Chessground binds its input listeners
               once, at init, and only when the board is not view-only. Deriving
               this from `interactive` below would leave a board that never
               binds anything, because the engine chunk has not loaded yet on
               the first render. See the prop's comment in BoardSurface. */
            interactive={true}
            {...(pulse ? { pulseSquare: pulse } : {})}
            {...(displayed ? { lastMove: [displayed.from, displayed.to] as const } : {})}
            {...(displayed?.isCheck ? { check: turnColor } : {})}
            {...(interactive && step
              ? { movableColor: step.turn, dests: step.dests, onMove: moveSource.viaPointer(onMove) }
              : { dests: NO_DESTS })}
          />
        </div>

        <p class="mcc-exercise-turn" data-testid="exercise-turn">
          {solved
            ? labels.solved
            : (step?.turn ?? orientation) === 'white'
              ? labels.turnWhite
              : labels.turnBlack}
        </p>
        {!engine && <p class="mcc-exercise-loading">{labels.loading}</p>}
      </div>

      <div class="mcc-exercise-side">
        <div class="mcc-exercise-meters">
          <p class="mcc-meter">
            <span class="mcc-meter-label">{labels.step}</span>
            {/* ONE interpolated text node, never adjacent children — see the
                hydration note in ReplayView.tsx. */}
            {/* `key` remounts this span whenever the step advances, which is
                what restarts the hop animation. Restarting a CSS animation on a
                surviving node needs a reflow hack; remounting one <span> does
                not. `data-hop` is only true after the first step, so the counter
                does not hop on arrival — nothing has happened yet. */}
            <span
              key={stepIndex}
              class="mcc-meter-value"
              data-hop={stepIndex > 0 ? 'true' : 'false'}
            >{`${Math.min(stepIndex + 1, total)} / ${total}`}</span>
          </p>
          <p class="mcc-meter">
            <span class="mcc-meter-label">{labels.attempts}</span>
            <span class="mcc-meter-value" data-testid="exercise-attempts">{`${attempts}`}</span>
          </p>
        </div>

        {/* Polite: a move played with the mouse must not steal focus, and the
            verdict is the one thing a screen-reader user cannot see happen. */}
        <div
          class="mcc-exercise-status"
          role="status"
          aria-live="polite"
          aria-label={labels.status}
          data-testid="exercise-status"
        >
          {solved ? (
            <>
              <p class="mcc-exercise-solved" data-testid="exercise-solved">{labels.solved}</p>
              {engine?.endsInMate && <p class="mcc-exercise-mate">{labels.checkmate}</p>}
              {/* ⚠️ PART OF THE EXISTING TWO-BEAT SOLVE, NOT A THIRD BEAT.
                  It renders inside the panel that already arrives on the second
                  beat, so the reward lands WITH the verdict rather than
                  interrupting it with a new thing to look at. E1's rule holds:
                  a solve is two Transitions, and this does not add one.
                  ⚠️ Nothing renders at zero — see `awarded`. */}
              {(awarded > 0 || streak >= 2) && (
                <p class="mcc-exercise-reward" data-testid="exercise-reward">
                  {awarded > 0 && (
                    <span class="mcc-exercise-points" data-testid="exercise-points">
                      {labels.points.replace('%s', String(awarded))}
                    </span>
                  )}
                  {streak >= 2 && (
                    <span class="mcc-exercise-streak" data-testid="exercise-streak">
                      {labels.streak.replace('%s', String(streak))}
                    </span>
                  )}
                </p>
              )}
            </>
          ) : message ? (
            <>
              <p class={`mcc-exercise-message mcc-message-${feedback}`}>{message}</p>
              {/* Only the permissive verdict carries the caveat. Under
                  onlyMove:true the move really IS wrong, and softening that
                  would be its own kind of lie. */}
              {feedback === 'off-line' && (
                <p class="mcc-exercise-note" data-testid="exercise-offline-note">
                  {labels.offLineNote}
                </p>
              )}
              {/* The reason, under the strict verdict. Both verdicts now carry
                  exactly one line of explanation — which keeps the two panels
                  the same shape, so the reader cannot read "more text" as
                  "worse mistake". */}
              {feedback === 'wrong' && (
                <p class="mcc-exercise-note" data-testid="exercise-wrong-reason">
                  {labels.wrongReason}
                </p>
              )}
            </>
          ) : (
            <p class="mcc-exercise-instructions">
              {solvedBefore ? labels.solvedAgain : labels.instructions}
            </p>
          )}
        </div>

        {/* ── The one-time sound invitation (E2) ──────────────────────────
            ⚠️ OUTSIDE the status region above, deliberately. That region is
            `aria-live="polite"`, and putting buttons inside a live region gets
            them re-announced on every update and makes the whole panel a
            moving target for anyone tabbing. This is a small offer that follows
            the verdict; it is not part of it.

            ⚠️ It renders only after a solve, only once ever, and never for a
            reader who has asked for reduced motion — every one of those
            conditions lives in `shouldInvite()`, not here. */}
        {inviting && (
          <div class="mcc-sound-invite" data-testid="sound-invite">
            {inviteAccepted ? (
              <p class="mcc-sound-invite-done" data-testid="sound-invite-accepted">
                {labels.sound.accepted}
              </p>
            ) : (
              <>
                <p class="mcc-sound-invite-question">{labels.sound.question}</p>
                <p class="mcc-sound-invite-detail">{labels.sound.detail}</p>
                <div class="mcc-sound-invite-actions">
                  <button
                    type="button"
                    class="mcc-exercise-button"
                    data-testid="sound-invite-accept"
                    onClick={() => {
                      acceptInvitation();
                      setInviteAccepted(true);
                      /* Answering IS the gesture, so the reader hears the thing
                         they just agreed to instead of having to solve another
                         exercise to find out what they said yes to. */
                      playSound('solved');
                    }}
                  >
                    {labels.sound.accept}
                  </button>
                  <button
                    type="button"
                    class="mcc-exercise-button"
                    data-testid="sound-invite-decline"
                    onClick={() => {
                      /* Records that it was ASKED. That is what makes it
                         one-time — see `declineInvitation`. */
                      declineInvitation();
                      setInviting(false);
                    }}
                  >
                    {labels.sound.decline}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* The other way in. Hidden once solved — there is nothing left to
            play — but present and enabled for every move before that. */}
        {!solved && (
          <MoveInput
            id={`move-${slug}`}
            labels={labels.move}
            resolve={resolveText}
            onMove={moveSource.viaText(onMove)}
            disabled={!interactive}
            focusSignal={focusSignal}
          />
        )}

        {hintShown ? (
          <div class="mcc-exercise-hint" data-testid="exercise-hint">
            <h2 class="mcc-side-heading">{labels.hintHeading}</h2>
            <p>{hint}</p>
          </div>
        ) : (
          <button
            type="button"
            class="mcc-exercise-button"
            /* ⚠️ THE ONE CONTROL ON THIS PAGE THAT SHIPPED LIVE-LOOKING AND
               INERT. `MoveInput` was already covered — it takes
               `disabled={!interactive}`, which is false until the engine
               chunk lands — and retry, the solution list and the sound offer
               are not server-rendered at all, because their conditions are
               false on the first render. This one is not: `hintShown` starts
               false, so the button is in the HTML with no handler behind it,
               and a student who taps for a hint during hydration is ignored
               in silence.

               Gated on `engine`, not on a separate mount flag, because that
               is what this island already publishes as `data-ready` — one
               island, one meaning of ready. The wait is a few ms longer than
               strict hydration and the page already says "chargement…" next
               to the board throughout it. */
            disabled={!engine}
            onClick={revealHint}
            data-testid="exercise-hint-button"
          >
            {labels.hintShow}
          </button>
        )}

        {solved && engine && (
          <div class="mcc-exercise-solution" data-testid="exercise-solution">
            <h2 class="mcc-side-heading">{labels.solutionHeading}</h2>
            <ol class="mcc-solution-list">
              {engine.line.map((move, index) => (
                <li key={`${index}-${move.uci}`}>
                  <button
                    type="button"
                    class="mcc-move"
                    data-current={index === reviewIndex ? 'true' : 'false'}
                    data-by={move.by}
                    aria-current={index === reviewIndex ? 'true' : undefined}
                    onClick={() => setReviewIndex(index)}
                  >
                    {move.san}
                  </button>
                </li>
              ))}
            </ol>
            <p class="mcc-exercise-note">{labels.solutionHint}</p>
          </div>
        )}

        {(solved || attempts > 0) && (
          <button
            type="button"
            class="mcc-exercise-button"
            onClick={retry}
            data-testid="exercise-retry"
          >
            {labels.retry}
          </button>
        )}
      </div>
    </div>
  );
}
