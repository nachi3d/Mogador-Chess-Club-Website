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
 * ⚠️ IT COMPARES RENDERED HTML WITH THE FINGERPRINTS NORMALISED AWAY, NOT A
 * VERSION STRING. A per-release sentinel would need editing every release, and
 * the release it was forgotten on is exactly the release it was needed for. The
 * rendered HTML is a pure function of the source, so comparing it against
 * `dist/` answers the question with nothing to maintain.
 *
 * ⚠️⚠️ AND IT DELIBERATELY IGNORES THE HASHES, WHICH IS THE OPPOSITE OF WHAT
 * THIS SCRIPT DID WHEN IT WAS FIRST WRITTEN. Comparing `/_astro/*.HASH.js`
 * names looked like the obvious identity check — Astro fingerprints by content,
 * so equal names must mean equal source. It is wrong, and it failed on the very
 * first real deploy it was used for.
 *
 * Cloudflare builds on Linux; this repository is developed on Windows. Rollup
 * emits a chunk's imports in filesystem order, so the same source produces:
 *
 *     live   import{t as e}from"./preload-helper…";import{a as t,i as n,n as r}from"./preact.module…"
 *     local  import{a as e,i as t,n}from"./preact.module…";import{t as r}from"./preload-helper…"
 *
 * Identical semantics, different bytes, different hash — while the chunks either
 * side of it (`preact.module.Bl7PEaKa.js`, `preload-helper.CxFQXtKk.js`) hash
 * IDENTICALLY. So the mismatch is partial, systematic, and has nothing to do
 * with which tree is deployed. A check that reports failure on every correct
 * deploy is worse than no check: it teaches the operator to ignore it.
 *
 * ⚠️ THE RESIDUAL GAP IS REAL AND IS NOT PAPERED OVER. A release that changes
 * ONLY island JavaScript, leaving every byte of rendered HTML identical, is
 * invisible here — the normalisation that removes the toolchain noise removes
 * that signal with it. This site is content-heavy and that case is rare, but it
 * exists: for a JS-only release, verify a BEHAVIOUR on the live site instead.
 * Nothing in this script should be read as covering it.
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

/**
 * A document with its content fingerprints removed.
 *
 * `/_astro/ChessBoard.14xj4iqu.js` → `/_astro/ChessBoard.js`. Everything that
 * comes from the SOURCE — text, structure, attributes, inline scripts, the
 * order assets are referenced in — survives; only the toolchain-dependent hash
 * is dropped. See the header for why the hash cannot be trusted across build
 * environments.
 */
/**
 * ⚠️ THE HOME PAGE'S NEXT-SESSION BLOCK, WHICH IS BUILD *INPUT* AND NOT TREE.
 *
 * `/` prints "Prochaine séance" from the baked agenda. A Cloudflare build reads
 * the live `sessions` table; a local build cannot — `.env.local` never reaches
 * `fetch-agenda.mjs` — so it bakes `agenda.fallback.json` instead. The two
 * therefore disagree about a date and a time whenever the fallback has drifted
 * from the table, which is most of the time.
 *
 * ⚠️ THAT MADE THIS CHECK FAIL ON EVERY CORRECT DEPLOY FROM THIS MACHINE, which
 * is precisely the failure the header warns about one paragraph up: measured at
 * the v0.20.0 deploy, where `/` reported "the live build is NOT this tree"
 * while the other two documents matched byte-for-byte and every marker the
 * release introduced was confirmed live by hand. **A check that cries wolf is a
 * check somebody learns to skip**, and this is the one standing between us and
 * shipping v0.13.0 again.
 *
 * ⚠️ WHAT IS DROPPED IS ONLY THE VALUE, NEVER THE STRUCTURE. The surrounding
 * markup — the label, the classes, the venue span, the `<a>` around it — is
 * still compared, so a release that changes how the block is BUILT is still
 * caught. Only the date, the time and the venue text go, and those come from
 * the database rather than from the tree.
 */
const NEXT_SESSION = /(<span class="dash-next-value"[^>]*>)[\s\S]*?(<\/span><\/a>)/g;

function normalise(html) {
  return html
    .replace(/(\/_astro\/[^"'\s)]*?)\.[A-Za-z0-9_-]{8}(\.(?:js|css))/g, '$1$2')
    .replace(NEXT_SESSION, '$1<!--agenda-derived-->$2')
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * How many next-session blocks a document contains.
 *
 * ⚠️ EXISTS SO THE NORMALISATION ABOVE CANNOT SILENTLY BECOME A NO-OP. If the
 * dashboard's markup is reworked and the pattern stops matching, the check does
 * not quietly go back to failing on every deploy (or, worse, quietly start
 * comparing a value it was told to ignore) — it says so. A normalisation nobody
 * has seen fire is a normalisation that may not work.
 */
const countNextSession = (html) => (html.match(NEXT_SESSION) ?? []).length;

/** The first line that differs, for a report that says something useful. */
function firstDifference(a, b) {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) {
      return {
        line: i + 1,
        local: (left[i] ?? '(end of file)').trim().slice(0, 140),
        live: (right[i] ?? '(end of file)').trim().slice(0, 140),
      };
    }
  }
  return null;
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
  /* ⚠️ `/` STAYS, and swapping it for a quieter document was considered and
     rejected: it is the page most releases touch, which makes it the most
     valuable of the three. Its agenda-derived value is normalised away instead
     — see NEXT_SESSION above. */
  { path: '/', file: 'dist/index.html', agendaDerived: true },
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
  const localRaw = readFileSync(localPath, 'utf8');
  const local = normalise(localRaw);

  let liveRaw;
  try {
    liveRaw = await fetchText(`${origin}${doc.path}`);
  } catch (error) {
    console.log(red(`  ✗  ${doc.path.padEnd(34)} fetch failed: ${error.message}`));
    failures += 1;
    continue;
  }
  const live = normalise(liveRaw);

  /* ⚠️ The normalisation must be seen to WORK, on both sides. A pattern that
     silently stops matching turns this back into a check that fails on every
     correct deploy — which is the state this fix exists to end. It warns rather
     than fails: the document is still compared, and a genuine mismatch is still
     reported by the comparison itself. */
  if (doc.agendaDerived) {
    const here = countNextSession(localRaw);
    const there = countNextSession(liveRaw);
    if (here === 0 || there === 0) {
      console.log(
        yellow(
          `  !  ${doc.path.padEnd(34)} the next-session normalisation matched ` +
            `${here} local / ${there} live — expected 1 of each.`,
        ),
      );
      console.log(
        dim('       The dashboard markup has probably changed; update NEXT_SESSION'),
      );
      console.log(
        dim('       in this script, or `/` will fail on every correct deploy again.'),
      );
    }
  }

  compared += 1;

  if (local === live) {
    console.log(green(`  ok ${doc.path.padEnd(34)} ${local.length} bytes match`));
    continue;
  }

  failures += 1;
  console.log(red(`  ✗  ${doc.path.padEnd(34)} the live build is NOT this tree`));
  const diff = firstDifference(local, live);
  if (diff) {
    console.log(dim(`       first difference, line ${diff.line}:`));
    console.log(dim(`       local: ${diff.local}`));
    console.log(dim(`       live : ${diff.live}`));
  }
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
    '  This says the live site renders byte-for-byte what your dist/ renders,\n' +
      '  with content fingerprints normalised away (they are not reproducible\n' +
      '  across build environments — see the header).\n' +
      '  ⚠️ It does NOT say the build is good — that is `npm run smoke:prod` and\n' +
      '     the suite. And it cannot see a release that changed island JS only,\n' +
      '     leaving every byte of HTML identical; verify a behaviour for those.\n',
  ),
);
