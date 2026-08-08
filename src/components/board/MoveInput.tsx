/**
 * Keyboard move entry — the board's other input.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS. Chessground takes pointer input only. Until this landed, a
 * reader who cannot use a mouse or a touchscreen could read an exercise, read
 * the hint, and had no way to answer it. axe never flagged it, because there
 * was no unlabelled control — there was no control at all. That is exactly the
 * kind of exclusion automated checks cannot see.
 *
 * It is ADDITIVE. The board stays fully pointer-operable; this is a second door
 * into the same room. Both doors lead to the same `onMove(from, to)` — nothing
 * downstream can tell which was used, and there is no "accessible variant" of
 * the game logic to drift out of sync.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { MoveTextResult } from '@lib/chess/notation';
import './move-input.css';

export interface MoveInputLabels {
  readonly label: string;
  readonly placeholder: string;
  readonly submit: string;
  readonly help: string;
  readonly errorUnreadable: string;
  readonly errorIllegal: string;
  readonly errorEmpty: string;
}

export interface MoveInputProps {
  /** Distinguishes the label/help/error ids when a page grows a second one. */
  readonly id: string;
  readonly labels: MoveInputLabels;
  /** Resolve typed text against the CURRENT position. Supplied by the parent. */
  readonly resolve: (text: string) => MoveTextResult;
  /** The same entry point the pointer path calls. */
  readonly onMove: (from: string, to: string, promotion?: string | undefined) => void;
  /** True while it is not the reader's turn, or the game is over. */
  readonly disabled: boolean;
  /**
   * Bump to pull focus back into the field — after the opponent has replied,
   * so a keyboard player is never left with focus on a dead control and no
   * idea that it is their move again.
   */
  readonly focusSignal: number;
}

export default function MoveInput(props: MoveInputProps) {
  const { id, labels, resolve, onMove, disabled, focusSignal } = props;

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const firstRender = useRef(true);

  /* Focus follows the turn — but never on mount. Stealing focus on page load
     would drag a reader past the board and the hint they had not read yet.

     ⚠️ `focusSignal` IS THE ONLY DEPENDENCY, AND `disabled` MUST NOT BE ONE.

     It used to be, and that quietly defeated the whole "never on mount" rule.
     `disabled` starts true — the exercise board is view-only until its
     lazily-imported chess.js chunk lands — and flips to false when the chunk
     arrives, a few hundred milliseconds after load. That flip re-ran this
     effect with `firstRender` already spent, so the field grabbed focus on
     its own, scrolled the reader down to it, and (on a lesson page, where a
     replayer sits above the exercise) swallowed the replayer's arrow keys,
     because ReplayView's document handler ignores keys aimed at an INPUT.

     It presented as a flaky spec rather than as a bug: whether the chunk won
     the race against the reader's first keypress depended on machine load,
     so it failed in full-suite runs and passed every time in isolation.

     `disabled` is still READ here — a signal arriving while the field is
     disabled must not focus it — it simply must not TRIGGER this. */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!disabled) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  const submit = (event: Event) => {
    event.preventDefault();
    if (disabled) return;

    const value = text.trim();
    if (value.length === 0) {
      setError(labels.errorEmpty);
      return;
    }

    const result = resolve(value);
    if (result.kind === 'ok') {
      setText('');
      setError(null);
      onMove(result.move.from, result.move.to, result.move.promotion);
      return;
    }

    /* "I could not read that" and "that move is not available" are different
       things to be told, and the text is kept either way so the reader can fix
       a typo rather than retype the whole move. */
    setError(result.kind === 'illegal' ? labels.errorIllegal : labels.errorUnreadable);
  };

  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <form class="mcc-move-input" onSubmit={submit} data-testid="move-input">
      <label class="mcc-move-input-label" for={id}>
        {labels.label}
      </label>
      <div class="mcc-move-input-row">
        <input
          ref={inputRef}
          id={id}
          type="text"
          class="mcc-move-input-field"
          value={text}
          placeholder={labels.placeholder}
          disabled={disabled}
          // A phone keyboard will happily capitalise and autocorrect chess
          // notation into prose. All four of these are load-bearing on mobile.
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck={false}
          aria-describedby={error ? `${errorId} ${helpId}` : helpId}
          aria-invalid={error ? 'true' : undefined}
          onInput={(event) => {
            setText((event.target as HTMLInputElement).value);
            // Clearing on edit stops a stale complaint sitting under a move the
            // reader has already corrected.
            if (error) setError(null);
          }}
          data-testid="move-input-field"
        />
        <button type="submit" class="mcc-move-input-submit" disabled={disabled}>
          {labels.submit}
        </button>
      </div>

      {/* `role="alert"` is assertive on purpose: this answers something the
          reader just did, and a polite region would queue behind the board's
          own status and arrive after they had started retyping. */}
      <p
        class="mcc-move-input-error"
        id={errorId}
        role="alert"
        data-testid="move-input-error"
      >
        {error ?? ''}
      </p>
      <p class="mcc-move-input-help" id={helpId}>
        {labels.help}
      </p>
    </form>
  );
}
