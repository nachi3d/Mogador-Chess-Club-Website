/**
 * The site themes — the top level of the appearance hierarchy.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THREE LEVELS, IN DECREASING PROMINENCE (E6, decided with Seàn):
 *
 *   1. Thème      — Bois / Marbre / Souiri / Terminal. Sets background,
 *                   surfaces, heading typeface, DEFAULT board preset and
 *                   piece set. The control almost everyone will touch.
 *   2. Plateau    — the six board presets, behind a collapsed disclosure.
 *                   For a player with a board preference independent of the
 *                   site's mood.
 *   3. Couleurs   — the reader's own two square colours, at the bottom of
 *                   that same disclosure.
 *
 * ⚠️ NEVER present 4 themes × 6 presets as twenty-four equivalent choices.
 * Each theme NAMES its default preset, and choosing a theme is one decision.
 *
 * ⚠️ LIGHT/DARK LIVES INSIDE EACH THEME — "Bois de jour" and "Bois de nuit",
 * not an independent axis. Every theme therefore declares BOTH palettes in
 * `src/styles/site-themes.css`, and the existing light/dark toggle now
 * switches within the active theme rather than across one global pair.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THIS FILE IS THE LIST, NOT THE COLOURS — exactly as
 * `src/config/board-themes.ts` is. Every hex lives in
 * `src/styles/site-themes.css`, which `scripts/check-contrast.mjs` parses and
 * audits. Duplicating a value here would create a second source of truth for
 * the one thing that must never drift: what the auditor checks versus what the
 * browser paints.
 *
 * The heading font is the E7 half of this session. `fontKey` names the family
 * as `--font-display-<key>`, declared in `src/styles/fonts.css` (generated) and
 * selected per theme in `site-themes.css`. A theme loads ONLY its own heading
 * font: the browser fetches a `@font-face` file solely when something rendered
 * actually uses that family, so declaring all four costs nothing but the rules.
 */

import { DEFAULT_BOARD_THEME, type BoardThemeId } from '@config/board-themes';
import { DEFAULT_PIECE_SET, type PieceSetId } from '@config/piece-sets';

export interface SiteTheme {
  readonly id: string;
  /** Key into the UI string tables — `theme.bois`, etc. */
  readonly labelKey: `theme.${string}`;
  /** One line, shown under the name in the picker. `theme.<id>.hint`. */
  readonly hintKey: `theme.${string}.hint`;
  /** The board preset this theme uses unless the reader has pinned one. */
  readonly defaultBoard: BoardThemeId;
  /** The piece artwork this theme uses. See `src/config/piece-sets.ts`. */
  readonly pieceSet: PieceSetId;
  /**
   * The heading typeface, as the suffix of `--font-display-<key>`.
   *
   * ⚠️ HEADINGS ONLY. The body face never changes — that is the E7 safety
   * rule, and it is why a characterful theme cannot cost a beginner their
   * ability to read a lesson on the en-passant rule.
   */
  readonly fontKey: string;
  /** The woff2 the head script preloads for this theme. See BaseLayout. */
  readonly fontFile: string;
}

export const SITE_THEMES = [
  /**
   * Oak and walnut, parchment page, warm Staunton pieces.
   *
   * ⚠️ BOIS IS THE DEFAULT, AND ITS VALUES LIVE IN `tokens.css`, NOT IN
   * `site-themes.css`. The palette this site has always had — the wood-panelled
   * room with a green baize table and brass lamps — IS Bois. Keeping it as the
   * base means a reader with no stored preference, or with JavaScript off, gets
   * a complete and correct theme from the base tokens alone.
   */
  {
    id: 'bois',
    labelKey: 'theme.bois',
    hintKey: 'theme.bois.hint',
    defaultBoard: 'bois',
    pieceSet: 'merida',
    fontKey: 'fraunces',
    fontFile: '/fonts/fraunces-latin-wght-normal.woff2',
  },
  /** Veined white and slate. Cool, sober, and the crispest pieces we have. */
  {
    id: 'marbre',
    labelKey: 'theme.marbre',
    hintKey: 'theme.marbre.hint',
    defaultBoard: 'glace',
    pieceSet: 'cburnett',
    fontKey: 'playfair',
    fontFile: '/fonts/playfair-latin-wght-normal.woff2',
  },
  /**
   * Zellige, Essaouira blue and lime white.
   *
   * The identity theme: no other chess site has this one, and it is the reason
   * E6 was worth a dedicated session. Its background is a real zellige tiling
   * drawn in CSS gradients — see the `.theme-souiri` block in site-themes.css.
   */
  {
    id: 'souiri',
    labelKey: 'theme.souiri',
    hintKey: 'theme.souiri.hint',
    defaultBoard: 'bleu',
    pieceSet: 'chessnut',
    fontKey: 'outfit',
    fontFile: '/fonts/outfit-latin-wght-normal.woff2',
  },
  /** Phosphor green on black — the retro nod that accompanies the E5 menu. */
  {
    id: 'terminal',
    labelKey: 'theme.terminal',
    hintKey: 'theme.terminal.hint',
    defaultBoard: 'phosphore',
    pieceSet: 'kiwen-suwi',
    fontKey: 'jetbrains',
    fontFile: '/fonts/jetbrains-latin-wght-normal.woff2',
  },
] as const satisfies readonly SiteTheme[];

export type SiteThemeId = (typeof SITE_THEMES)[number]['id'];

export const DEFAULT_SITE_THEME: SiteThemeId = 'bois';

/** The class that carries a theme's variables. Applied to `:root`. */
export const siteThemeClass = (id: string): string => `theme-${id}`;

/**
 * `unknown`, not `string` — this narrows values arriving from BOTH boundaries:
 * a radio's `value` (a string) and a parsed `localStorage` record (anything at
 * all). A `string` signature would force `normaliseTheme` to cast before
 * validating, which is the one thing that file exists not to do.
 */
export function isSiteThemeId(value: unknown): value is SiteThemeId {
  return SITE_THEMES.some((theme) => theme.id === value);
}

/** The theme record for an id, defaulted. Never undefined. */
export function siteTheme(id: string): (typeof SITE_THEMES)[number] {
  return SITE_THEMES.find((theme) => theme.id === id) ?? SITE_THEMES[0];
}

/**
 * The board preset that applies right now.
 *
 * ⚠️ `pinned` is the reader's EXPLICIT preset choice, and it survives a theme
 * change. That is deliberate and it is the answer to "does deviating to another
 * preset survive a theme change?" — yes.
 *
 * The reasoning: level 2 of the hierarchy exists precisely for a player with a
 * board preference *independent of the site's mood*. Resetting it whenever they
 * try a theme would destroy the one preference that level is for, and it would
 * do so silently. The escape hatch is an explicit "follow the theme" option in
 * the preset list, so un-pinning is a choice too.
 */
export function resolveBoard(themeId: string, pinned: BoardThemeId | undefined): BoardThemeId {
  return pinned ?? siteTheme(themeId).defaultBoard ?? DEFAULT_BOARD_THEME;
}

/** The piece set that applies right now. Follows the theme, always. */
export function resolvePieces(themeId: string): PieceSetId {
  return siteTheme(themeId).pieceSet ?? DEFAULT_PIECE_SET;
}
