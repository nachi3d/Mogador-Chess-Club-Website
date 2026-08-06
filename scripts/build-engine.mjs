/**
 * Mogador Chess Club — vendor the Stockfish engine into `public/engine/`.
 *
 *   npm install --no-save stockfish@11.0.0
 *   node scripts/build-engine.mjs
 *
 * Run BY HAND when the engine version changes. Its outputs are committed, so a
 * Cloudflare Pages build needs no extra step and `stockfish` is not a project
 * dependency at all — same convention as `build-fonts.mjs` and `build-icons.mjs`
 * (CLAUDE.md → "Generated assets").
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY STOCKFISH 11 AND NOT 16/17/18
 *
 * The modern NNUE builds ship their neural network inside the package:
 *   stockfish@16 ...  91 MB unpacked
 *   stockfish@17 ... 183 MB
 *   stockfish@18 ... 251 MB
 * Stockfish 11 is the last hand-crafted-evaluation release, and its WASM build
 * is 1.4 MB. This site teaches beginners on Essaouira mobile data; a 2000-Elo
 * ceiling from a 1.4 MB engine is the right trade, and an engine nobody can
 * afford to download is worth nothing. Revisit only if a strength ceiling
 * above ~2000 is ever actually wanted.
 *
 * WHY NOT THE asm.js FALLBACK
 * `stockfish.asm.js` is another 4.8 MB and exists for browsers without WASM.
 * Every browser this site supports (and every project in the Playwright matrix)
 * has had WASM for years. Shipping it would nearly triple the engine payload to
 * serve nobody.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * LICENCE. Stockfish is GPL-3.0 — the same copyleft the rest of this site is
 * already under, so there is no conflict, but it MUST be credited. The licence
 * text and AUTHORS file are copied alongside the binary for that reason; do not
 * "tidy" them out of `public/engine/`.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'node_modules/stockfish';
const DEST = 'public/engine';

/** [source, destination] — everything the browser worker actually needs. */
const FILES = [
  [`${SOURCE}/src/stockfish.js`, 'stockfish.js'],
  [`${SOURCE}/src/stockfish.wasm`, 'stockfish.wasm'],
  // Shipped for the GPL, not for the runtime.
  [`${SOURCE}/license.txt`, 'LICENSE.txt'],
  [`${SOURCE}/AUTHORS`, 'AUTHORS.txt'],
];

if (!existsSync(SOURCE)) {
  console.error(
    `\n  ${SOURCE} not found.\n\n` +
      '  The engine is deliberately NOT a project dependency — it is vendored.\n' +
      '  Install it transiently first:\n\n' +
      '    npm install --no-save stockfish@11.0.0\n',
  );
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

for (const [from, name] of FILES) {
  if (!existsSync(from)) {
    console.error(`  MISSING  ${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(DEST, name));
}

let total = 0;
console.log(`\nEngine vendored into ${DEST}/`);
for (const file of readdirSync(DEST).sort()) {
  const bytes = statSync(join(DEST, file)).size;
  total += bytes;
  console.log(`  ${file.padEnd(20)} ${(bytes / 1024).toFixed(0).padStart(6)} KiB`);
}
console.log(`  ${'total'.padEnd(20)} ${(total / 1024).toFixed(0).padStart(6)} KiB`);
console.log(
  '\nReminder: this is NEVER precached. `scripts/build-sw.mjs` excludes\n' +
    '`**/stockfish*` and `**/*.wasm` from the manifest and caches them at\n' +
    'runtime instead, and `tests/e2e/pwa.spec.ts` asserts it.\n',
);
