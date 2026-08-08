/**
 * Mogador Chess Club — piece-set stylesheets.
 *
 *   node scripts/build-pieces.mjs
 *
 * Reads the vendored SVGs in `vendor/pieces/<set>/` and writes one stylesheet
 * per set into `public/pieces/`, plus a small `preview.css` for the settings
 * page. Outputs are committed, so `npm ci && npm run build` needs nothing from
 * this script — same contract as build-fonts / build-icons / build-engine.
 *
 * `vendor/pieces/README.md` records each set's provenance and licence. Read it
 * before adding one; most of Lichess's sets are non-commercial and unusable in
 * a GPL repository.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY ONE FILE PER SET, RATHER THAN ONE FILE WITH ALL FOUR
 *
 * Measured, not assumed. As a single stylesheet bundled into the board island
 * chunk the four sets come to ~110 KB raw / ~32 KB brotli — and a reader uses
 * exactly ONE of them. That is three quarters of the payload wasted on every
 * board page, on the mobile data this site is explicitly built for.
 *
 * Split, a reader fetches only their theme's set (2.3–12 KB brotli), once,
 * cached thereafter. The link is injected by the anti-FOUC head script and
 * only on pages that carry a board (`<html data-board>`) — so an index page,
 * the agenda or the legal notice fetch nothing at all.
 *
 * It is a same-origin request, so the zero-third-party-request rule is intact.
 *
 * WHY NOT BASE64. The obvious encoding for an SVG data URI is base64, and it
 * is the wrong one here: it inflates the bytes by a third AND destroys the
 * repetition brotli feeds on, because twelve pieces of one set share most of
 * their markup. Percent-encoded plain text keeps that repetition visible.
 * Measured on merida: 46.0 KB raw / 13.6 KB brotli base64, against
 * 36.7 KB raw / 6.7 KB brotli here — half the transfer, same pixels.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'vendor/pieces');
const OUT_DIR = join(ROOT, 'public/pieces');

/**
 * Chessground names its pieces `piece.<role>.<colour>`, and the vendored files
 * are named the way Lichess names them. This is the whole mapping.
 */
const ROLES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const COLOURS = { w: 'white', b: 'black' };

/** The twelve, in a stable order so a regenerated file diffs cleanly. */
const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/**
 * An SVG as a CSS `url()` payload.
 *
 * Percent-encoding rather than base64 — see the header. Only four characters
 * genuinely have to be escaped inside `url('…')`: the percent sign (first, or
 * it would double-encode the rest), `#` (a fragment delimiter), the single
 * quote we are wrapping in, and the newline. Double quotes are left alone
 * precisely BECAUSE the wrapper is a single quote — that keeps every SVG
 * attribute readable in the output and costs nothing.
 */
function encodeSvg(svg) {
  return (
    svg
      // An XML prolog and any comment are dead weight in a data URI.
      .replace(/<\?xml[\s\S]*?\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // Collapse the formatting whitespace BETWEEN attributes and tags. Text
      // content is not touched — none of these files have any.
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/%/g, '%25')
      .replace(/#/g, '%23')
      .replace(/'/g, '%27')
  );
}

function readSet(id) {
  const dir = join(SRC_DIR, id);
  const found = readdirSync(dir).filter((f) => f.endsWith('.svg'));

  /*
   * ⚠️ Fail loudly on a set that is not twelve separate files.
   *
   * Some Lichess sets (`mono`) ship SIX SVGs and colour one shared shape per
   * side in CSS. Emitting whatever happened to be in the directory would
   * produce a board missing half its pieces, silently — the failure mode this
   * project keeps having to design against. So it is an error, and adding
   * support for that shape is a deliberate change, not an accident.
   */
  const missing = PIECES.filter((p) => !found.includes(`${p}.svg`));
  if (missing.length > 0) {
    throw new Error(
      `vendor/pieces/${id}: missing ${missing.join(', ')} — ` +
        `expected all twelve of ${PIECES.join(' ')}. ` +
        `A six-file set (one shape per role, coloured in CSS) is not supported.`,
    );
  }

  return PIECES.map((piece) => {
    const colour = COLOURS[piece[0]];
    const role = ROLES[piece[1]];
    const data = encodeSvg(readFileSync(join(dir, `${piece}.svg`), 'utf8'));
    return { piece, colour, role, url: `url('data:image/svg+xml,${data}')` };
  });
}

const SETS = readdirSync(SRC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (SETS.length === 0) throw new Error('vendor/pieces holds no set directories');

mkdirSync(OUT_DIR, { recursive: true });

const HEADER = (what) =>
  [
    '/* GENERATED by scripts/build-pieces.mjs — do not edit by hand.',
    ` * ${what}`,
    ' *',
    ' * The artwork is third-party and separately licensed. See',
    ' * vendor/pieces/README.md for provenance, and /mentions-legales/ for the',
    ' * credits this project is obliged to render.',
    ' */',
    '',
  ].join('\n');

const previewRules = [];
let total = 0;

for (const id of SETS) {
  const pieces = readSet(id);

  /*
   * `.pieces-<id>` sits on <html>, so it is an ancestor of every board on the
   * page. The rest of the selector is Chessground's own — this file replaces
   * `chessground.cburnett.css`, which had exactly the same shape without the
   * set prefix.
   */
  const css =
    HEADER(`Piece set: ${id}`) +
    pieces
      .map((p) => `.pieces-${id} .cg-wrap piece.${p.role}.${p.colour}{background-image:${p.url}}`)
      .join('\n') +
    '\n';

  writeFileSync(join(OUT_DIR, `${id}.css`), css);
  total += css.length;
  const brotli = brotliCompressSync(Buffer.from(css)).length;
  console.log(
    `  public/pieces/${id}.css`.padEnd(34) +
      `${(css.length / 1024).toFixed(1).padStart(6)} KB raw` +
      `${(brotli / 1024).toFixed(1).padStart(8)} KB brotli`,
  );

  /* One knight per set for the theme previews on /parametres/. A knight
     because it is the piece whose silhouette differs most between sets — a
     preview showing four pawns would show four near-identical circles. */
  const knight = pieces.find((p) => p.piece === 'wN');
  previewRules.push(`.mcc-piece-sample[data-set='${id}']{background-image:${knight.url}}`);
}

/*
 * The previews are NOT the per-set stylesheets. /parametres/ shows all four
 * themes at once and has no board, so it needs four knights and nothing else —
 * loading four full sets there would cost ~32 KB brotli to draw four glyphs.
 */
writeFileSync(
  join(OUT_DIR, 'preview.css'),
  HEADER('One knight per set, for the theme previews on /parametres/.') +
    previewRules.join('\n') +
    '\n',
);
console.log(`  public/pieces/preview.css`.padEnd(34) + `${SETS.length} knights`);

console.log(`\n  ${SETS.length} sets, ${(total / 1024).toFixed(1)} KB of CSS in total.`);
console.log('  A reader downloads ONE of them, on board pages only.\n');
