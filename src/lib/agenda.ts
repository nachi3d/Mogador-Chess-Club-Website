/**
 * The public agenda — the one reader of the baked session snapshot.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ BUILD-TIME ONLY, AND IT MUST STAY THAT WAY. Every function here is called
 * from `.astro` frontmatter, which runs in Node during `astro build` and ships
 * nothing. The module imports a JSON file and `@config/site` — no Supabase, no
 * `localStorage`, no DOM — so it is safe to import from a public page, and the
 * guest zero-request rule is untouched.
 *
 * ⚠️ THE SNAPSHOT IS WRITTEN BY `scripts/fetch-agenda.mjs`, WHICH READS THE
 * DATABASE. Why the read happens at build rather than in the page — Critical
 * Features 9 and 18, and the fact that gating it on the auth flag would fix
 * nothing in the state production actually ships — is argued once, in the
 * header of that script. Read it before proposing a runtime fetch.
 *
 * ⚠️ THE GIT COLLECTION IS GONE. `src/content/agenda/` and its Zod schema were
 * removed in this change: two sources of truth for one list, and the one a prof
 * could edit was the one nobody could see.
 * ═════════════════════════════════════════════════════════════════════════
 */
import snapshot from '../data/agenda.json';
import { site } from '@config/site';

export type SessionStatus = 'published' | 'cancelled';

/** Mirrored from the CHECK constraint in migration 0001, and from `level` in
    `src/content.config.ts` — the same three words the whole site uses. */
export type SessionLevel = 'debutant' | 'intermediaire' | 'avance';

const LEVELS: readonly string[] = ['debutant', 'intermediaire', 'avance'];

export interface PublicSession {
  readonly id: string;
  /** The raw instant, canonicalised. What the staleness fingerprint compares. */
  readonly startsAt: string;
  /** Local calendar date in the club's zone, `YYYY-MM-DD`. */
  readonly date: string;
  /** Local clock time in the club's zone, `HH:MM`. */
  readonly time: string;
  readonly status: SessionStatus;
  /** ⚠️ Narrowed, not passed through. `sessions.level` is nullable and free of
      any FK, so an unrecognised value would reach `LevelBadge` and render an
      empty chip. An unknown level is treated as no level. */
  readonly level: SessionLevel | null;
  readonly venue: string | null;
  readonly titleFr: string | null;
  readonly noteFr: string | null;
  readonly noteEn: string | null;
  /**
   * Places the prof intends to seat, plus the overbooking margin (0013).
   *
   * ⚠️ THESE ARE SESSION PROPERTIES, AND THE LIVE BOOKING COUNT IS NOT HERE ON
   * PURPOSE. Baking "places restantes" would put a number in a static file that
   * every booking invalidates — and since a booking deliberately fires no
   * rebuild (0013 §2), the deployed agenda would be permanently, uselessly
   * stale, which is exactly how a staleness warning stops being read.
   *
   * So the baked page never claims a remaining count. A signed-in member reads
   * the live number from `session_availability()`; a signed-out reader sees the
   * capacity and an invitation to sign in, and causes no request at all.
   */
  readonly capacity: number | null;
  readonly overbookMargin: number | null;
}

interface Snapshot {
  readonly source?: string;
  readonly fetchedAt?: string;
  readonly timezone?: string;
  readonly sessions?: readonly Record<string, unknown>[];
}

const data = snapshot as Snapshot;

/**
 * ⚠️ A REAL CHECK, NOT A MIRROR.
 *
 * `fetch-agenda.mjs` cannot import this file (it is a plain Node script and
 * this is TypeScript), so the club's zone is necessarily written down twice.
 * Rather than trust the two to stay equal, the snapshot records the zone it was
 * computed in and the build fails here if it disagrees with `site.timezone`.
 *
 * The failure it prevents is nasty and quiet: every date and time in the file
 * is already resolved, so a zone change would move sessions by an hour — or a
 * midnight session by a day — with nothing rendering wrong.
 */
if (data.timezone && data.timezone !== site.timezone) {
  throw new Error(
    `agenda snapshot was baked in ${data.timezone} but site.timezone is ${site.timezone}. ` +
      'Re-run `node scripts/fetch-agenda.mjs` after changing the zone.',
  );
}

function normalise(row: Record<string, unknown>): PublicSession | null {
  const id = typeof row['id'] === 'string' ? row['id'] : '';
  const date = typeof row['date'] === 'string' ? row['date'] : '';
  const time = typeof row['time'] === 'string' ? row['time'] : '';
  const status = row['status'] === 'cancelled' ? 'cancelled' : 'published';
  /* A row missing any of the three fields the card is built from is dropped
     rather than rendered half-blank. It came out of a JSON file that a person
     can edit, so it is normalised field by field like every other store. */
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const text = (key: string) => (typeof row[key] === 'string' && row[key] ? String(row[key]) : null);
  const rawLevel = text('level');
  const startsAt = text('startsAt');
  /* Normalised field by field like every other stored value, never cast: a
     hand-edited snapshot can carry a string, a null or nothing at all, and a
     NaN capacity would render "NaN places". */
  const count = (key: string): number | null => {
    const raw = row[key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  return {
    id,
    /* Absent only in a hand-written snapshot; the fingerprint then falls back
       to the local pair, which is stable within one zone. */
    startsAt: startsAt ?? `${date}T${time}`,
    date,
    time,
    status,
    level: rawLevel && LEVELS.includes(rawLevel) ? (rawLevel as SessionLevel) : null,
    venue: text('venue'),
    titleFr: text('titleFr'),
    noteFr: text('noteFr'),
    noteEn: text('noteEn'),
    capacity: count('capacity'),
    overbookMargin: count('overbookMargin'),
  };
}

/** Everything the public agenda shows, soonest first. Cancelled sessions included. */
export function publicSessions(): PublicSession[] {
  return (data.sessions ?? [])
    .map(normalise)
    .filter((s): s is PublicSession => s !== null)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

/**
 * The next session a reader could still turn up to.
 *
 * ⚠️ A CANCELLED SESSION IS NOT "NEXT". It stays on the agenda so nobody
 * wonders whether they misremembered, but the home dashboard's one line is an
 * answer to "when is the next session", and "one that is not happening" is the
 * wrong answer to that question.
 *
 * `today` is passed in rather than read here so the caller decides what "now"
 * means — and so a spec can ask this a question with a known answer.
 */
export function nextSession(today: string): PublicSession | null {
  return publicSessions().find((s) => s.status === 'published' && s.date >= today) ?? null;
}

/** When the deployed agenda was read out of the database. */
export function bakedAt(): string | null {
  return typeof data.fetchedAt === 'string' ? data.fetchedAt : null;
}

/**
 * ⚠️ THE ONE DEFINITION, USED ON BOTH SIDES OF THE STALENESS CHECK.
 *
 * `/admin/seances` bakes a fingerprint per session at build time and recomputes
 * it from the live database in the browser; a difference means the deployed
 * agenda no longer matches the database, which is exactly the question a prof
 * needs answered after publishing.
 *
 * ⚠️ IT MUST COVER EVERY FIELD A READER CAN SEE, AND NOTHING ELSE. Add a field
 * to the agenda card and it belongs here in the same commit — otherwise a prof
 * edits that field, publishes, and is told the site is up to date. Fields a
 * reader cannot see must stay out, or a staff-only note would raise a false
 * alarm that trains people to ignore the real one. `duration_minutes` is out
 * for exactly that reason: the public card does not show it.
 *
 * ⚠️ IT COMPARES THE RAW INSTANT, NOT THE RENDERED DATE AND TIME. Those are
 * derived in `site.timezone` by the build script, and asking the browser to
 * re-derive them would put a second copy of that logic in the comparison — one
 * that would agree right up until a Ramadan offset change, then quietly report
 * every session as pending.
 *
 * ⚠️ `capacity` AND `overbookMargin` ARE IN, AND THE BOOKING COUNT IS OUT, AND
 * THE TWO HALVES OF THAT ARE DECIDED BY THE SAME RULE. Capacity is a field a
 * prof edits and a reader sees, so editing it must raise the banner. The live
 * count is not a session field at all — it changes when a parent books, which
 * deliberately triggers no rebuild, so including it would mark every deployed
 * agenda stale forever and train a prof to ignore the warning.
 */
export interface FingerprintableSession {
  readonly id: string;
  readonly startsAt: string;
  readonly status: string;
  readonly level: string | null;
  readonly venue: string | null;
  readonly titleFr: string | null;
  readonly noteFr: string | null;
  readonly noteEn: string | null;
  readonly capacity: number | null;
  readonly overbookMargin: number | null;
}

export function sessionFingerprint(s: FingerprintableSession): string {
  return [
    s.id,
    s.startsAt,
    s.status,
    s.level ?? '',
    s.venue ?? '',
    s.titleFr ?? '',
    s.noteFr ?? '',
    s.noteEn ?? '',
    s.capacity ?? '',
    s.overbookMargin ?? '',
  ].join('|');
}

/** The fingerprints of what this build baked, for the admin comparison. */
export function bakedFingerprints(): string[] {
  return publicSessions().map(sessionFingerprint).sort();
}
