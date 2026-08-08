/**
 * The chess piece sets.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS FILE IS THE LIST AND THE CREDITS, NOT THE ARTWORK.
 *
 * The SVGs live in `vendor/pieces/<id>/`, and `scripts/build-pieces.mjs` turns
 * them into `public/pieces/<id>.css`. `vendor/pieces/README.md` records where
 * each set came from and quotes its licence verbatim — read it before adding
 * one, because most of Lichess's sets are NOT usable here (see below).
 *
 * ⚠️ EVERY SET IS A THIRD-PARTY WORK WITH ITS OWN LICENCE, and every one of
 * them must be credited on `/mentions-legales/`. That is not politeness: three
 * of the four carry attribution as an actual condition of use. The
 * `attribution` field below is what the legal page renders, so a set added
 * here is credited automatically and cannot be forgotten.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * The two inks a piece is drawn with: the body fill and the outline that
 * delineates it. Read off the vendored SVGs by hand.
 *
 * ⚠️ THIS IS WHAT MAKES A PIECE LEGIBLE ON A SQUARE, AND IT IS AUDITED.
 *
 * A white piece on a light square is always low-contrast — it is the OUTLINE
 * that separates it, not the fill. So the rule is not "the piece contrasts
 * with the square" but "for each square, AT LEAST ONE of the piece's two inks
 * clears 3:1". `scripts/check-contrast.mjs` asserts exactly that, for both
 * pieces against both squares of the board each theme uses.
 *
 * `outline: null` means the set is MONOCHROME — one ink, no second chance.
 * Those sets are only safe on light boards, which is not a stylistic
 * observation: kiwen-suwi's single `#262626` measures **1.03:1** against the
 * phosphore board's dark square. Both sides of the position vanish, and
 * nothing errors. That shipped in this session's first draft and was caught by
 * looking at a screenshot, which is why the check now exists.
 */
export interface PieceInk {
  readonly body: string;
  readonly outline: string | null;
}

export interface PieceSet {
  readonly id: string;
  /** Key into the UI string tables — `pieces.merida`, etc. */
  readonly labelKey: `pieces.${string}`;
  /** How the white and black pieces are drawn. See `PieceInk`. */
  readonly ink: {
    readonly white: PieceInk;
    readonly black: PieceInk;
  };
  /** Rendered on `/mentions-legales/`. Author and licence, quoted from source. */
  readonly attribution: {
    readonly author: string;
    readonly licence: string;
    readonly licenceUrl: string;
    readonly sourceUrl: string;
  };
}

export const PIECE_SETS = [
  /**
   * The set the site shipped with, via `chessground.cburnett.css`. Crisp
   * outlines and maximum silhouette clarity — and, uniquely here, a LIGHT
   * outline on the black pieces, which is what lets it carry Terminal's
   * near-black phosphor board when every other set dissolves into it.
   */
  {
    id: 'cburnett',
    labelKey: 'pieces.cburnett',
    /* The only shipped set whose BLACK pieces carry a light outline, which is
       what makes it the one that survives on a near-black board. */
    ink: {
      white: { body: '#ffffff', outline: '#000000' },
      black: { body: '#000000', outline: '#ececec' },
    },
    attribution: {
      author: 'Colin M.L. Burnett',
      licence: 'CC BY-SA 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
      sourceUrl: 'https://en.wikipedia.org/wiki/User:Cburnett/GFDL_images/Chess',
    },
  },
  /** Warm, softly shaded Staunton. The club-room set — Bois. */
  {
    id: 'merida',
    labelKey: 'pieces.merida',
    ink: {
      white: { body: '#ffffff', outline: '#1f1a17' },
      black: { body: '#1f1a17', outline: '#ffffff' },
    },
    attribution: {
      author: 'Armando Hernandez Marroquin',
      licence: 'GPL-2.0-or-later',
      licenceUrl: 'https://www.gnu.org/licenses/gpl-2.0.txt',
      sourceUrl: 'https://github.com/lichess-org/lila/tree/master/public/piece/merida',
    },
  },
  /** Flat, high-contrast, graphic. Reads like a printed diagram — Souiri. */
  {
    id: 'chessnut',
    labelKey: 'pieces.chessnut',
    ink: {
      white: { body: '#ffffff', outline: '#000000' },
      black: { body: '#000000', outline: '#f2f2f2' },
    },
    attribution: {
      author: 'Alexis Luengas',
      licence: 'Apache-2.0',
      licenceUrl: 'https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt',
      sourceUrl: 'https://github.com/LexLuengas/chessnut-pieces',
    },
  },
  /** Minimal, geometric, no shading at all. Schematic — Marbre. */
  {
    id: 'kiwen-suwi',
    labelKey: 'pieces.kiwen-suwi',
    /* ⚠️ MONOCHROME — both sides are one flat `#262626`, distinguished by
       SHAPE rather than by colour, and there is no outline to fall back on.
       Beautiful on a pale board, invisible on a dark one. Marbre's `glace`
       is the palest preset the site has, which is why it lives there. */
    ink: {
      white: { body: '#262626', outline: null },
      black: { body: '#262626', outline: null },
    },
    attribution: {
      author: 'neverRare',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://github.com/lichess-org/lila/tree/master/public/piece/kiwen-suwi',
    },
  },
] as const satisfies readonly PieceSet[];

export type PieceSetId = (typeof PIECE_SETS)[number]['id'];

export const DEFAULT_PIECE_SET: PieceSetId = 'merida';

/** The class that selects a set. Applied to `:root`, and to the settings previews. */
export const pieceSetClass = (id: string): string => `pieces-${id}`;

export function isPieceSetId(value: string): value is PieceSetId {
  return PIECE_SETS.some((set) => set.id === value);
}
