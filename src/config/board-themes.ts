/**
 * The board presets.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS FILE IS THE LIST, NOT THE COLOURS.
 *
 * The actual square and ink values live in `src/styles/board-themes.css`, one
 * `.board-<id>` class per preset, because that is where they are *used*:
 * Chessground reads `--mcc-board-*` and nothing in the hot path touches JS.
 * `scripts/check-contrast.mjs` parses that CSS and proves every preset's
 * coordinate legibility and square separation on every build.
 *
 * Duplicating the hexes here would create two sources of truth for the one
 * thing that must never drift — the values the auditor checks and the values
 * the browser paints. So this file carries identifiers and ordering only, and
 * the swatches in the settings grid are drawn by applying the same class.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Names are French (the default locale) with English labels resolved through
 * `src/i18n/ui.ts` under `board.<id>`.
 */

export interface BoardTheme {
  readonly id: string;
  /** Key into the UI string tables — `board.classique`, etc. */
  readonly labelKey: `board.${string}`;
}

export const BOARD_THEMES = [
  /** The site's own tokens: cream squares, baize green. The default. */
  { id: 'classique', labelKey: 'board.classique' },
  /** Warm wood, the panelling of the club room. */
  { id: 'bois', labelKey: 'board.bois' },
  /** The green-and-buff of a tournament hall. */
  { id: 'tournoi', labelKey: 'board.tournoi' },
  /** Cool slate blue. */
  { id: 'bleu', labelKey: 'board.bleu' },
  /** Pale, high-key, for bright rooms and low-vision comfort. */
  { id: 'glace', labelKey: 'board.glace' },
  /**
   * Phosphor green on black. Added with the themes (E6) because the Terminal
   * theme had no honest default among the other five — see the block comment
   * in board-themes.css.
   */
  { id: 'phosphore', labelKey: 'board.phosphore' },
] as const satisfies readonly BoardTheme[];

export type BoardThemeId = (typeof BOARD_THEMES)[number]['id'];

export const DEFAULT_BOARD_THEME: BoardThemeId = 'classique';

/**
 * Narrow a string from the DOM (a radio's `value`) to a known preset.
 *
 * A cast would compile and then happily write `board-<whatever>` onto <html>
 * the first time the markup and this list disagree. Validating at the boundary
 * is the same discipline `normaliseTheme` applies to stored values.
 */
export function isBoardThemeId(value: string): value is BoardThemeId {
  return BOARD_THEMES.some((theme) => theme.id === value);
}

/** The class that carries a preset's variables. Used on `:root` and on previews. */
export const boardThemeClass = (id: string): string => `board-${id}`;
