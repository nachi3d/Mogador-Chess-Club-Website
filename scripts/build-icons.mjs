/**
 * Mogador Chess Club — PWA icon generation.
 *
 *   node scripts/build-icons.mjs
 *
 * Run it by hand after changing any brand asset; the outputs are committed so a
 * clean `npm ci && npm run build` needs no image toolchain and no reach to the
 * network. Same rule as `scripts/fetch-video-posters.mjs`.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ TWO SOURCES, AND THE SPLIT IS THE WHOLE DESIGN. THIS USED TO BE ONE.
 *
 * The commissioned mark is a rook with a Souiri dome: two shoulder windows, a
 * central arch, an eight-point star and a thin gold band. Rendered and looked
 * at, rather than assumed:
 *
 *   180px  every detail reads — ship the artwork
 *    48px  the star's points have gone, the windows have closed, the band is
 *          a smear
 *    32px  a dark blob with a gold speck
 *
 * It is also TALL (0.59 w/h), so a square icon is mostly margin: at 32px the
 * rook is only ~19px wide, which is less than the nominal size suggests.
 *
 * So the small sizes get a SIMPLIFIED mark — `mark.svg`, hand-authored from a
 * row-profile of the artwork, keeping the silhouette and the star, dropping
 * what measurably closes up, and sitting squarer. The large sizes get the real
 * thing. Neither is a compromise at the size it serves.
 *
 * ⚠️ THE HEADER IS A SMALL SIZE TOO — 36px desktop, 28px mobile — and it sits
 * on `.surface-inverse`, which is a DARK colour in all eight theme/mode
 * combinations. That is why `mark-light.svg` exists and is published.
 *
 * ⚠️ THE PLATE IS CREAM, NOT GREEN, AND THAT IS A FIX. The maskable icon used
 * to flood with `themeColor` (green-800), which was right for a mark that
 * carried its own green frame. The new rook is DARK GREEN with no frame — on a
 * green flood it disappears. Cream is the logo's own field and is already the
 * manifest's `background_color`, so the two now agree.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const brand = (f) => fileURLToPath(new URL('../src/assets/brand/' + f, import.meta.url));
const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));

/** The commissioned artwork, exactly as delivered: cream baked in, no alpha. */
const SOURCE = fileURLToPath(new URL('../docs/direction/logo-rook-mogador.png', import.meta.url));

/** Small sizes: the simplified mark. Large sizes: the commissioned artwork. */
const SIMPLE = brand('mark.svg');
const SIMPLE_LIGHT = brand('mark-light.svg');
const DETAILED = brand('mark-detailed.png');

/**
 * cream-100 — the logo's own field, and `site.pwa.backgroundColor`.
 * ⚠️ NOT `themeColor`: see the header.
 */
const PLATE = '#faf4e6';

mkdirSync(OUT, { recursive: true });

/**
 * Key the cream out of the delivered artwork and square it up.
 *
 * ⚠️ THIS RUNS HERE RATHER THAN HAVING BEEN DONE ONCE BY HAND, so that
 * `mark-detailed.png` is a DERIVED file with a pipeline rather than a binary
 * nobody can rebuild. The delivered file is the source of record.
 *
 * ⚠️ THE KEYING IS NOT A COLOUR MATCH. The artwork has been through a lossy
 * encoder, so "cream" is a cloud of near values and every edge is anti-aliased
 * toward it. Keying on an exact colour leaves a halo; keying on distance alone
 * makes the GOLD semi-transparent, because gold is far closer to cream than
 * green is. So: find the nearest ink, then take alpha from how far the pixel
 * has travelled from cream TOWARD that ink, and write the pure ink back. Flat
 * ink is opaque, flat cream is clear, and an edge gets a real coverage value.
 */
const CREAM = [250, 241, 224];
const GREEN = [29, 59, 44];
const GOLD = [198, 155, 78];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

async function deriveDetailed(size = 1024, coverage = 0.92) {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const rgba = Buffer.alloc(w * h * 4);
  let minX = w, minY = h, maxX = 0, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const px = [data[i], data[i + 1], data[i + 2]];
      const ink = d2(px, GOLD) < d2(px, GREEN) ? GOLD : GREEN;
      const span = Math.sqrt(d2(ink, CREAM));
      let a = span === 0 ? 0 : Math.round((Math.sqrt(d2(px, CREAM)) / span) * 255);
      a = a > 255 ? 255 : a < 8 ? 0 : a; // 8 kills the encoder's cream noise
      const o = (y * w + x) * 4;
      rgba[o] = ink[0];
      rgba[o + 1] = ink[1];
      rgba[o + 2] = ink[2];
      rgba[o + 3] = a;
      if (a > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const cropped = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .png()
    .toBuffer();

  /* Fit the LONGEST side, so the mark's own 0.59 aspect is preserved and the
     square is padded rather than the artwork distorted. */
  const scale = Math.round(size * coverage) / Math.max(bw, bh);
  const rw = Math.max(1, Math.round(bw * scale));
  const rh = Math.max(1, Math.round(bh * scale));
  const art = await sharp(cropped).resize(rw, rh).png().toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, top: Math.round((size - rh) / 2), left: Math.round((size - rw) / 2) }])
    .png()
    .toFile(DETAILED);
  console.log(`  mark-detailed.png  (keyed from the delivered artwork, ${bw}x${bh} of ink)`);
}

await deriveDetailed();

const simple = readFileSync(SIMPLE);
const simpleLight = readFileSync(SIMPLE_LIGHT);

/** The detailed mark, centred on an opaque cream plate at `size`. */
async function plated(size, coverage = 1) {
  const inner = Math.round(size * coverage);
  const art = await sharp(DETAILED).resize(inner, inner).png().toBuffer();
  const pad = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: PLATE } })
    .composite([{ input: art, top: pad, left: pad }])
    .png()
    .toBuffer();
}

/* Plain icons — `purpose: "any"`. ⚠️ Opaque rather than transparent: a launcher
   that puts a transparent dark-green rook on a dark chrome shows nothing, and
   we do not get to choose the chrome. */
for (const size of [192, 512]) {
  writeFileSync(`${OUT}icon-${size}.png`, await plated(size));
  console.log(`  icon-${size}.png`);
}

/** Apple touch icon — iOS ignores the manifest and reads this tag instead. */
writeFileSync(`${OUT}apple-touch-icon.png`, await plated(180));
console.log('  apple-touch-icon.png');

/**
 * Maskable — the mark inside the ~80% safe zone, the rest flooded with the
 * plate so any launcher mask crops into solid cream, never into artwork.
 */
writeFileSync(`${OUT}icon-maskable-512.png`, await plated(512, 0.8));
console.log('  icon-maskable-512.png');

/* The <head> favicon, and the header mark. Both are the SIMPLIFIED mark, and
   both ship as SVG so they stay sharp at whatever the browser asks for.
   `favicon.svg` carries its own `prefers-color-scheme` rule — the site's theme
   cannot reach a favicon, and a dark rook vanishes in a dark tab strip. */
writeFileSync(`${OUT}favicon.svg`, simple);
writeFileSync(`${OUT}mark-light.svg`, simpleLight);
await sharp(simple, { density: 384 }).resize(32, 32).png().toFile(`${OUT}favicon-32.png`);
console.log('  favicon.svg, mark-light.svg, favicon-32.png');

console.log('\nIcons written to public/icons/.\n');
