#!/usr/bin/env node
/**
 * Mogador Chess Club — DID THE BUILD I JUST CUT ACTUALLY REACH THE SITE?
 *
 *   npm run verify:deploy
 *   npm run verify:deploy -- --url https://staging.example.com
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS EXISTS BECAUSE v0.13.0 WAS MERGED, TAGGED, AND NEVER SERVED.
 *
 * The release was on `main` at 2026-08-14 20:55Z. Cloudflare Workers Builds
 * picked the push up 115 seconds later and deployed it. Then, 67 minutes after
 * the merge, a second deployment landed and replaced it with an OLDER tree —
 * and production went on serving a pre-v0.13.0 build for a day. `/bienvenue/`
 * 404'd, the callback chunk had no onboarding branch in it, and every check
 * anybody ran was green:
 *
 *   - `wrangler deployments list` showed a recent deployment. It was recent.
 *     It was also the wrong build, and the list cannot tell you that.
 *   - `Source: Unknown (deployment)` does NOT discriminate between a Workers
 *     Build and a CLI upload — this project has already published that
 *     conclusion once and had to retract it.
 *   - `npm run smoke:prod` passed all 14 routes. It asserts each page is
 *     reachable and is the right page; it has no idea WHICH BUILD it is.
 *
 * So the question "is the live site running the tree I am standing in?" had no
 * check at all. This is that check.
 *
 * ⚠️ IT COMPARES CONTENT-HASHED ASSET NAMES, NOT A VERSION STRING. A per-release
 * sentinel would need editing every release, and the release it was forgotten on
 * is exactly the release it was needed for. Astro fingerprints every bundle by
 * content, so the set of `/_astro/*.js` a page pulls IS the identity of the
 * build that produced it: if `dist/index.html` and the live `/` name the same
 * hashed files, they came from the same source. Nothing to maintain, and it
 * cannot drift.
 *
 * ⚠️ IT REQUIRES A LOCAL `dist/` BUILT FROM THE TREE YOU ARE ASKING ABOUT, and
 * it says so rather than guessing. Comparing against a stale `dist/` would
 * answer a question nobody asked.
 *
 * ⚠️ IT DOES NOT ASSERT THE BUILD IS *GOOD* — `smoke:prod` and the suite do
 * that. It asserts it is THE ONE. Both matter, and neither substitutes.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/* ⚠️ PARSED, NOT RETYPED — same rule as `smoke-prod.mjs`. The hostname lives in
   three files already; a fourth copy is the one that goes stale, and this script
   would then verify the wrong site and report success. */
function parse(file, pattern, what) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const match = pattern.exec(source);
  if (!match) {
    console.error(red(`\nverify-deploy: could not find ${what} in ${file} — did it move?\n`));
    process.exit(1);
  }
  return match[1];
}

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--url');
const origin =
  flagIndex >= 0 && args[flagIndex + 1]
    ? args[flagIndex + 1].replace(/\/$/, '')
    : parse('src/config/site.ts', /^\s*url:\s*'([^']+)'/m, '`url`').replace(/\/$/, '');

/** Every fingerprinted asset a document references, as a sorted set. */
function assetsOf(html) {
  const found = new Set();
  for (const m of html.matchAll(/\/_astro\/([A-Za-z0-9._-]+\.(?:js|css))/g)) found.add(m[1]);
  return [...found].sort();
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * The documents compared.
 *
 * ⚠️ `/` ALONE IS NOT ENOUGH. The home page's bundle changes on almost every
 * release, so it is a good identity probe — but a release that only touches a
 * route the home page never loads would match on `/` and be wrong everywhere
 * else. Three documents with different module graphs, so a partial deploy
 * cannot pass by luck.
 */
const DOCUMENTS = [
  { path: '/', file: 'dist/index.html' },
  { path: '/exercices/mat-du-couloir/', file: 'dist/exercices/mat-du-couloir/index.html' },
  { path: '/progres/', file: 'dist/progres/index.html' },
];

console.log(`\n${bold('▸ verify:deploy')}  ${dim(`— is ${origin} serving THIS tree?`)}\n`);

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error(red('  No dist/index.html — build first, from the tree you are asking about.\n'));
  process.exit(1);
}

let failures = 0;
let compared = 0;

for (const doc of DOCUMENTS) {
  const localPath = join(ROOT, doc.file);
  if (!existsSync(localPath)) {
    console.log(yellow(`  ?  ${doc.path.padEnd(34)} not in dist/ — skipped`));
    continue;
  }
  const local = assetsOf(readFileSync(localPath, 'utf8'));
  if (local.length === 0) {
    console.log(yellow(`  ?  ${doc.path.padEnd(34)} no fingerprinted assets — skipped`));
    continue;
  }

  let live;
  try {
    live = assetsOf(await fetchText(`${origin}${doc.path}`));
  } catch (error) {
    console.log(red(`  ✗  ${doc.path.padEnd(34)} fetch failed: ${error.message}`));
    failures += 1;
    continue;
  }

  compared += 1;
  const missing = local.filter((a) => !live.includes(a));
  const extra = live.filter((a) => !local.includes(a));

  if (missing.length === 0 && extra.length === 0) {
    console.log(green(`  ok ${doc.path.padEnd(34)} ${local.length} asset(s) match`));
    continue;
  }

  failures += 1;
  console.log(red(`  ✗  ${doc.path.padEnd(34)} the live build is NOT this tree`));
  for (const a of missing) console.log(dim(`       local only: ${a}`));
  for (const a of extra) console.log(dim(`       live  only: ${a}`));
}

if (compared === 0) {
  console.error(red('\n  Nothing could be compared — this proves nothing. Failing.\n'));
  process.exit(1);
}

if (failures > 0) {
  console.error(
    red(`\n  ✗ ${origin} is serving a DIFFERENT build from your dist/.\n`) +
      dim(
        '  This is the v0.13.0 failure: merged, tagged, and never served.\n' +
          '  ⚠️ Do NOT reach for `wrangler deployments list` — a recent deployment\n' +
          '     can be an older tree, and `Source: Unknown` does not tell the two\n' +
          '     paths apart. Check which build actually won:\n' +
          '       • a Cloudflare Workers Build, from a push to `main`, or\n' +
          '       • an `npx wrangler deploy` uploading a local dist/.\n' +
          '     Last writer wins. See CLAUDE.md → Deployment.\n',
      ),
  );
  process.exit(1);
}

console.log(green(`\n  ✓ ${origin} is serving this exact build.\n`));
console.log(
  dim(
    '  This says the live site is THE build you cut. It does not say the build\n' +
      '  is good — that is `npm run smoke:prod` and the suite.\n',
  ),
);
