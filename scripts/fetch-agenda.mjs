#!/usr/bin/env node
/**
 * Bake the public agenda into the build.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHY THE AGENDA IS BAKED AND NOT FETCHED — the reasoning, once, here.
 *
 * The obvious fix for "a published session does not appear" is to read the
 * database from the page. It is not available to this site:
 *
 *   - The site is `output: 'static'` with no adapter and no SSR. There is no
 *     server to ask.
 *   - Critical Feature 9: no third-party request without an explicit reader
 *     click. A runtime read would have every anonymous visitor contact
 *     supabase.co on page load — a request that leaks their IP to a processor,
 *     on a site for children, to find out when a club meets.
 *   - Critical Feature 18: accounts OFF means no Supabase ref, host or anon
 *     key anywhere in the bundle. A runtime read needs all three.
 *   - And gating that read on `PUBLIC_AUTH_ENABLED` would fix nothing where it
 *     matters: production ships with accounts OFF, so `/admin/seances` would
 *     go on silently doing nothing in exactly the state it is broken in.
 *
 * So the content of the public agenda is necessarily fixed at build time. That
 * is arithmetic, not a preference — static plus no third-party request leaves
 * no other answer.
 *
 * ⚠️ THE CREDENTIALS ARE USED BY THE BUILD AND NEVER SHIPPED, which is the
 * whole trick. This script runs in Node, writes JSON, and exits. The bundle is
 * byte-for-byte as clean as before; `auth-disabled.spec.ts` still proves it.
 * `anon` has held `select` on published sessions since 0001, so no secret is
 * needed here — the anon key is enough, and the service role is not wanted.
 *
 * ⚠️ THE FAILURE MODE, STATED: a session published without a deploy does not
 * appear, and the public site cannot know it is stale. That is handled where
 * it can be — `/admin/seances` compares what this script baked against what the
 * database says and tells the prof, loudly, on the screen where they published.
 * See `docs/reference/deployment.md` for the deploy hook that makes the wait
 * minutes rather than "whenever somebody next deploys".
 * ═════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ⚠️ TWO FILES, AND THE SPLIT IS LOAD-BEARING.
 *
 * `agenda.json` is a BUILD ARTEFACT and is gitignored. `agenda.fallback.json`
 * is COMMITTED and is what a build with no credentials renders.
 *
 * One committed file would be a footgun with a short fuse: a Playwright run
 * builds with the TEST project's credentials, so it would rewrite the committed
 * file with test sessions — and the next `git add -A` would ship "Séance
 * découverte" to the real club as the production fallback. Nothing would fail.
 */
const OUT = join(ROOT, 'src', 'data', 'agenda.json');
const FALLBACK = join(ROOT, 'src', 'data', 'agenda.fallback.json');

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

/**
 * ⚠️ THE CLUB'S ZONE, EXPLICITLY, AND NEVER THE BUILD MACHINE'S.
 *
 * Cloudflare builds in UTC and Seàn's laptop is on Africa/Casablanca, so a
 * naive `toISOString().slice(0,10)` gives two different dates for the same
 * 00:30 session depending on where the build ran. Morocco also drops to UTC+0
 * for Ramadan and back afterwards; the IANA database knows the exact dates and
 * a hardcoded `+01:00` does not.
 *
 * Mirrored from `site.timezone` — this file cannot import a TS module, and a
 * spec pins the two equal.
 */
const TIMEZONE = 'Africa/Casablanca';

/** How far back a finished session stays on the public list. */
const KEEP_PAST_DAYS = 1;

/**
 * `starts_at` (an instant) → the local date and clock time the club reads it
 * as. Both are stored as strings so nothing downstream ever reasons about a
 * zone again: the page renders what is in this file.
 */
function localParts(iso) {
  const at = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  /* `hour12: false` yields "24" for midnight in some ICU versions. */
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

/* ⚠️ NO FINGERPRINT HERE, DELIBERATELY. `/admin/seances` compares what was
   baked against what the database says, and both halves of that comparison are
   TypeScript — so the fingerprint has exactly ONE definition, in
   `src/lib/agenda.ts`. A copy in this file could not be imported by either
   caller and would exist only to drift. */

function normalise(row) {
  const { date, time } = localParts(row.starts_at);
  return {
    id: String(row.id),
    /**
     * ⚠️ THE RAW INSTANT IS KEPT ALONGSIDE THE DERIVED DATE AND TIME, and it is
     * what `/admin/seances` fingerprints against — so the staleness comparison
     * never has to re-derive a local time, and the zone logic in this file has
     * no second implementation to drift from.
     *
     * Canonicalised through `Date` first: PostgREST answers `+00:00` and JS
     * writes `Z`, and the two sides of that comparison must be byte-equal. Same
     * rule as the sync layer's timestamps (CLAUDE.md).
     */
    startsAt: new Date(row.starts_at).toISOString(),
    date,
    time,
    status: String(row.status),
    level: row.level ? String(row.level) : null,
    venue: row.venue ? String(row.venue) : null,
    titleFr: row.title_fr ? String(row.title_fr) : null,
    noteFr: row.note_fr ? String(row.note_fr) : null,
    noteEn: row.note_en ? String(row.note_en) : null,
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function write(sessions, source) {
  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    /* ⚠️ NOT A DECORATION. `/admin/seances` reads this to say how old the
       deployed agenda is, and a human reading a diff needs to know whether a
       change came from the database or from an edit. */
    source,
    fetchedAt: new Date().toISOString(),
    timezone: TIMEZONE,
    sessions,
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

async function main() {
  console.log(`\n${bold('▸ fetch-agenda')} ${dim('— baking the public agenda into the build')}`);

  const url = process.env.PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

  /**
   * ⚠️ TWO DIFFERENT FAILURES, AND THEY MUST NOT BE TREATED ALIKE.
   *
   * No credentials at all is a dev, CI or contributor build — there is nothing
   * to reach and the committed snapshot is the right answer. Credentials that
   * are present and do not work is a broken production build: shipping a stale
   * agenda while believing it fresh is the failure this whole feature exists to
   * remove, so that one is fatal.
   */
  if (!url || !anonKey) {
    const fallback = readJson(FALLBACK);
    if (!fallback) {
      console.error(red('\n  ✗ no Supabase config AND no src/data/agenda.fallback.json.'));
      console.error('    The agenda would build empty. Restore the fallback or set the env.\n');
      process.exit(1);
    }
    /* ⚠️ COPIED, NOT SYMLINKED OR IMPORTED. `src/lib/agenda.ts` imports exactly
       one path, so the artefact must always exist — including on a fresh clone
       where nothing has ever been fetched. */
    writeFileSync(OUT, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
    console.log(
      yellow('  ! no PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY — using the committed fallback'),
    );
    console.log(
      dim(
        `    ${fallback.sessions?.length ?? 0} session(s) from src/data/agenda.fallback.json.\n` +
          '    ⚠️ A PRODUCTION build MUST have these set, or the public agenda\n' +
          '    freezes at whatever is committed and no prof can change it.\n' +
          '    See docs/reference/deployment.md.\n',
      ),
    );
    return;
  }

  /* Plain PostgREST over `fetch` — deliberately not `@supabase/supabase-js`.
     A build script has no session to manage, and keeping the dependency out of
     the build path means it cannot be dragged anywhere near a bundle. */
  const since = new Date(Date.now() - KEEP_PAST_DAYS * 86_400_000).toISOString();
  const query =
    `${url.replace(/\/$/, '')}/rest/v1/sessions` +
    '?select=id,starts_at,status,level,venue,title_fr,note_fr,note_en' +
    `&starts_at=gte.${encodeURIComponent(since)}` +
    '&status=in.(published,cancelled)' +
    '&order=starts_at.asc';

  let rows;
  try {
    const response = await fetch(query, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} — ${await response.text()}`);
    }
    rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('PostgREST did not return an array');
  } catch (error) {
    console.error(red(`\n  ✗ the agenda read FAILED: ${error.message}`));
    console.error(
      '\n    Credentials are configured, so this is not a dev build. Shipping the\n' +
        '    committed snapshot here would put a stale agenda in front of readers\n' +
        '    while every check went green — which is the exact failure this\n' +
        '    feature exists to remove. Fix the connection, or unset\n' +
        '    PUBLIC_SUPABASE_URL to build deliberately from the snapshot.\n',
    );
    process.exit(1);
  }

  const sessions = rows.map(normalise);
  const payload = write(sessions, url.replace(/^https?:\/\//, '').split('.')[0]);

  const cancelled = sessions.filter((s) => s.status === 'cancelled').length;
  console.log(
    green(`  ✓ ${sessions.length} session(s) baked`) +
      dim(` — ${cancelled} cancelled, zone ${payload.timezone}`),
  );
  for (const s of sessions) {
    console.log(dim(`      ${s.date} ${s.time}  ${s.status}${s.level ? ` · ${s.level}` : ''}`));
  }
  console.log('');
}

await main();
