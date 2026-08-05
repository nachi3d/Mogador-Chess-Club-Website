/**
 * Mogador Chess Club — PWA icon generation.
 *
 *   node scripts/build-icons.mjs
 *
 * One source of record (src/assets/brand/mark.svg) → every raster the manifest
 * and the <head> need. Run it after replacing the mark; the outputs are
 * committed so a clean `npm ci && npm run build` needs no image toolchain.
 *
 * `maskable` gets extra padding: Android crops maskable icons to whatever
 * shape the launcher uses, and an un-padded mark loses its brass frame to the
 * circle mask.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../src/assets/brand/mark.svg', import.meta.url));
const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));

/** green-800 — matches `site.pwa.themeColor` and the manifest background. */
const FRAME = '#163425';

mkdirSync(OUT, { recursive: true });

const svg = readFileSync(SRC);

/** Plain icons — `purpose: "any"`. Rendered edge to edge. */
for (const size of [192, 512]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`${OUT}icon-${size}.png`);
  console.log(`  icon-${size}.png`);
}

/** Apple touch icon — iOS ignores the manifest and reads this tag instead. */
await sharp(svg, { density: 384 }).resize(180, 180).png().toFile(`${OUT}apple-touch-icon.png`);
console.log('  apple-touch-icon.png');

/**
 * Maskable — the mark shrunk to the ~80% safe zone, the rest flooded with the
 * frame colour so any launcher mask crops into solid green, never into artwork.
 */
const MASKABLE = 512;
const SAFE = Math.round(MASKABLE * 0.8);
const pad = Math.round((MASKABLE - SAFE) / 2);
const inner = await sharp(svg, { density: 384 }).resize(SAFE, SAFE).png().toBuffer();
await sharp({
  create: {
    width: MASKABLE,
    height: MASKABLE,
    channels: 4,
    background: FRAME,
  },
})
  .composite([{ input: inner, top: pad, left: pad }])
  .png()
  .toFile(`${OUT}icon-maskable-512.png`);
console.log('  icon-maskable-512.png');

/** The <head> favicon. SVG scales; browsers that can't read it fall back to the PNG. */
writeFileSync(`${OUT}favicon.svg`, svg);
await sharp(svg, { density: 384 }).resize(32, 32).png().toFile(`${OUT}favicon-32.png`);
console.log('  favicon.svg, favicon-32.png');

console.log('\nIcons written to public/icons/.\n');
