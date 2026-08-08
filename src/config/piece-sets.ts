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

export interface PieceSet {
  readonly id: string;
  /** Key into the UI string tables — `pieces.merida`, etc. */
  readonly labelKey: `pieces.${string}`;
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
   * outlines, maximum silhouette clarity — which is why it carries Marbre.
   */
  {
    id: 'cburnett',
    labelKey: 'pieces.cburnett',
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
    attribution: {
      author: 'Alexis Luengas',
      licence: 'Apache-2.0',
      licenceUrl: 'https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt',
      sourceUrl: 'https://github.com/LexLuengas/chessnut-pieces',
    },
  },
  /** Minimal, geometric, no shading at all. Schematic — Terminal. */
  {
    id: 'kiwen-suwi',
    labelKey: 'pieces.kiwen-suwi',
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
