#!/usr/bin/env node
/**
 * Mogador Chess Club — video poster generation.
 *
 *   node scripts/fetch-video-posters.mjs
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHY THIS SCRIPT EXISTS AT ALL: THE POSTER IS SELF-HOSTED.
 *
 * `VideoFacade.astro` renders a still, a play button and a title, and contacts
 * nothing until the reader clicks (Critical Feature 9). A facade whose still is
 * an `<img src="https://i.ytimg.com/vi/…">` breaks that rule by another name:
 * i.ytimg.com is a Google origin, the request carries the reader's IP and
 * Referer, and it fires on page load for every visitor — including the ones who
 * never press play. "No third-party request without a click" has to mean the
 * poster too, or it means nothing.
 *
 * So every poster is a file in `public/video/`, served by this site.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ── THE COST, STATED ─────────────────────────────────────────────────────
 * Three things are paid for this:
 *
 *   1. A MANUAL STEP. Adding a `youtube` id to a trap or a course is no longer
 *      a one-field edit: the poster has to be generated too, and committed.
 *      `scripts/check-content.mjs` FAILS THE BUILD when an id has no poster,
 *      naming the id and this command — the alternative is a facade with a
 *      broken image, which is worse than no video.
 *
 *   2. STALENESS. A creator who changes their thumbnail does not change ours.
 *      For a teaching video that is a feature rather than a bug (the still we
 *      chose is the still we keep), and re-running this script is the fix.
 *
 *   3. ~60 KB per video in the repository. Committed, like the icons and the
 *      fonts — see the note in `.gitignore`.
 *
 * ⚠️ IT IS NOT PART OF `npm run build`, for the same reason `build-icons.mjs`
 * is not: a Cloudflare build must need no image toolchain and no network reach
 * to Google. Run it by hand when a `youtube` id changes; commit what it writes.
 * (`fetch-agenda.mjs` IS in the build — but a session list goes stale in days,
 * and a video still does not go stale at all.)
 *
 * ── THREE SOURCES, IN ORDER ──────────────────────────────────────────────
 *
 *   1. AN AUTHOR-SUPPLIED STILL at `src/assets/video/<id>.(jpg|jpeg|png|webp)`.
 *      Wins over everything. This is the escape hatch for a video whose own
 *      thumbnail is a title card, and the only correct source for a video whose
 *      thumbnail we have no licence to redistribute.
 *
 *   2. YOUTUBE'S OWN THUMBNAIL, fetched once, here, in Node — never by a
 *      reader's browser. ⚠️ COPYRIGHT: a thumbnail is a frame of the video, so
 *      this path is for videos the CLUB publishes. For anybody else's video,
 *      supply a still under (1) or ask.
 *
 *   3. THE HOUSE PLATE — the brand mark on the site's own green. Used when
 *      neither of the above is available, and printed as a WARNING naming the
 *      id, because that is the state a placeholder id is in.
 *
 * ⚠️ (3) IS A REAL OUTPUT, NOT AN ERROR PATH. `TODOvideo00` on `/pieges/legal/`
 * is a placeholder waiting for Michael's video; the facade around it must still
 * render correctly, be styled, be measurable and be testable. A missing file
 * would make the page look broken while the feature is merely pending.
 */

import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONTENT = join(ROOT, 'src', 'content');
const SUPPLIED = join(ROOT, 'src', 'assets', 'video');
const OUT = join(ROOT, 'public', 'video');
/**
 * ⚠️ THE LIGHT MARK, BECAUSE `HOUSE` IS ALMOST BLACK (#101a14).
 *
 * This was `mark.svg` and had to change with the logo. The placeholder mark
 * carried its own green panel behind a light board, so it read on any ground.
 * The commissioned mark is dark-green ink on transparency — on the house plate
 * that is about 1.3:1, i.e. invisible, and nothing would have failed: the
 * poster would simply have shipped with an empty corner.
 */
const MARK = join(ROOT, 'src', 'assets', 'brand', 'mark-light.svg');

/**
 * ⚠️ THESE TWO WIDTHS ARE MIRRORED IN `src/components/VideoFacade.astro`'s
 * `srcset` AND IN `scripts/check-content.mjs`'s existence check. Three places,
 * one fact — so each names the other two. Changing the set means changing all
 * three in the same commit, and the content check is what fails if you don't.
 *
 * 640 and 1280 rather than one middle size: the facade's box is capped at the
 * board's own 34rem (544px), so 640 is the 1× file a phone actually downloads
 * and 1280 is the retina file. A single 960 would be ~2.6× on a 390px phone —
 * paid for by every reader, seen by none of them.
 */
const WIDTHS = [640, 1280];

/** 16:9, which is what every YouTube player is. */
const RATIO = 9 / 16;

/**
 * The house plate's ground — the dark theme's page colour, "the room".
 *
 * ⚠️ NOT green-800 (`#163425`), which is what the PWA icons are flooded with
 * and was the obvious first choice. It is also exactly `--mcc-primary-hover` in
 * the light themes, so the play badge DISAPPEARED into the plate on hover and
 * on focus — the badge went one shade darker and landed on its own background.
 * A real photographic still would never collide like that; the house plate is
 * the one still we control, so it is the one that moves. This ground is deeper
 * than any theme's primary, so every badge reads against it.
 */
const HOUSE = '#101a14';

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

/**
 * Every `youtube` id in the content, with what carries it — so a warning can
 * name the trap rather than an opaque eleven characters.
 *
 * ⚠️ READ AS JSON, NOT THROUGH `astro:content`. A build script cannot load the
 * content layer, and reaching for it would put Astro in the dependency path of
 * a tool whose whole job is to run outside the build. The collections that can
 * carry the field are `traps` and `cours`; both are JSON by the rule in
 * CLAUDE.md ("All content is .json, not .md").
 */
function videoIds() {
  const found = new Map();
  for (const collection of ['traps', 'cours']) {
    const dir = join(CONTENT, collection);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (!data.youtube) continue;
      const where = `${collection}/${name}`;
      found.set(data.youtube, [...(found.get(data.youtube) ?? []), where]);
    }
  }
  return found;
}

/** An author-supplied still, if there is one. */
function suppliedStill(id) {
  for (const extension of ['jpg', 'jpeg', 'png', 'webp']) {
    const path = join(SUPPLIED, `${id}.${extension}`);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * YouTube's own still, largest first.
 *
 * `maxresdefault` does not exist for every video (it needs a 720p+ source), and
 * YouTube answers a missing one with a 404 rather than a redirect, so the
 * ladder is walked rather than guessed. `hqdefault` always exists — it is
 * 480×360 with 4:3 letterbox bars, which is why it is last: cropping it to 16:9
 * loses real picture.
 */
async function youtubeStill(id) {
  for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const url = `https://i.ytimg.com/vi/${id}/${name}.jpg`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      /* ⚠️ YouTube serves a 120×90 grey placeholder with a 200 for an id that
         does not exist. Size is the only tell, so it is the check. */
      const { width } = await sharp(buffer).metadata();
      if (!width || width < 320) continue;
      return { buffer, name, width };
    } catch {
      /* Network or decode failure on one rung is not fatal — try the next. */
    }
  }
  return null;
}

/**
 * The brand mark on the house green, at the largest width. Deterministic.
 *
 * ⚠️ THE MARK IS IN THE LOWER LEFT, NOT THE CENTRE, AND THAT IS NOT TASTE.
 * The facade draws its play badge dead centre, over whatever the poster is. A
 * centred mark sits directly behind it and its corners peek out around the
 * disc — which reads as a rendering fault rather than as a placeholder. The
 * centre of any poster belongs to the badge; the house plate is the one still
 * we control, so it is the one that can be drawn to respect that.
 */
async function housePlate() {
  const width = WIDTHS[WIDTHS.length - 1];
  const height = Math.round(width * RATIO);
  const markWidth = Math.round(width * 0.16);
  const inset = Math.round(width * 0.045);
  const mark = await sharp(readFileSync(MARK), { density: 384 })
    .resize(markWidth, markWidth, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({ create: { width, height, channels: 4, background: HOUSE } })
    .composite([{ input: mark, top: height - markWidth - inset, left: inset }])
    .png()
    .toBuffer();
}

/**
 * One still → every width, as WebP.
 *
 * `cover` with `position: 'attention'` rather than a centre crop: `hqdefault`
 * carries 4:3 letterbox bars, and a centre crop of a letterboxed frame keeps
 * the bars and throws away the picture. sharp's attention strategy finds the
 * busiest region, which on a chess thumbnail is the board or the face.
 */
async function encode(id, still) {
  mkdirSync(OUT, { recursive: true });
  const written = [];
  for (const width of WIDTHS) {
    const height = Math.round(width * RATIO);
    const suffix = width === WIDTHS[0] ? '' : '@2x';
    const path = join(OUT, `${id}${suffix}.webp`);
    const info = await sharp(still)
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 78 })
      .toFile(path);
    written.push({ path: `public/video/${id}${suffix}.webp`, kb: info.size / 1024 });
  }
  return written;
}

async function main() {
  console.log(`\n${bold('▸ fetch-video-posters')} ${dim('— self-hosting every video still')}`);

  const ids = videoIds();
  if (ids.size === 0) {
    console.log(dim('  no `youtube` id in src/content/ — nothing to do.\n'));
    return;
  }

  let placeholders = 0;

  for (const [id, where] of ids) {
    const supplied = suppliedStill(id);
    let still;
    let source;

    if (supplied) {
      still = readFileSync(supplied);
      source = `src/assets/video/${supplied.split(/[\\/]/).pop()}`;
    } else {
      const fetched = await youtubeStill(id);
      if (fetched) {
        still = fetched.buffer;
        source = `i.ytimg.com/${fetched.name}.jpg (${fetched.width}px)`;
      } else {
        still = await housePlate();
        source = 'the house plate';
        placeholders += 1;
      }
    }

    const written = await encode(id, still);
    const label = `${id}  ${dim(where.join(', '))}`;
    if (source === 'the house plate') {
      console.log(`  ${yellow('!')}  ${label}`);
      console.log(
        yellow(`      no still available — wrote the house plate instead.`) +
          dim('\n      Either the id is a placeholder, or the video is private/removed.'),
      );
    } else {
      console.log(`  ${green('✓')}  ${label}`);
      console.log(dim(`      from ${source}`));
    }
    for (const { path, kb } of written) console.log(dim(`      ${path}  ${kb.toFixed(1)} KB`));
  }

  if (placeholders > 0) {
    console.log(
      yellow(`\n  ${placeholders} poster(s) are the house plate, not a real still.`) +
        dim('\n  The facade renders and is fully testable; the picture is pending.\n'),
    );
  }

  console.log(dim('  Posters are COMMITTED artefacts. `git add public/video/`.\n'));
}

try {
  await main();
} catch (error) {
  console.error(red(`\n  ✗ ${error.message}\n`));
  process.exit(1);
}
