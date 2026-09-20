/**
 * Exercise progress — device-local, by design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY localStorage AND NOT A DATABASE (CLAUDE.md → "Why static, and why no
 * Supabase"): lesson progress is one visitor's private state. A server for it
 * would mean auth, a privacy policy and a monthly bill in exchange for nothing
 * a visitor can perceive.
 *
 * THE CONSEQUENCE TO RESPECT: progress is device-local and the browser may
 * clear it at any time. Never build a feature whose value depends on progress
 * surviving — no streaks that punish loss, no "resume where you left off" as
 * the ONLY route back to a lesson.
 *
 * IF ACCOUNTS EVER ARRIVE, THIS MODULE IS THE SINGLE MIGRATION POINT. Nothing
 * outside it may touch `localStorage` or know the key. Read/write go through
 * the functions below, so swapping the backing store is a rewrite of this file
 * and nothing else — the same containment trick as `BoardSurface.tsx`.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * EVERY ACCESS IS GUARDED. Safari private mode throws on `setItem`, a full
 * quota throws, an embedded context can throw on `localStorage` itself, and a
 * hand-edited value can be any garbage at all. None of that may break the app:
 * a reader whose storage is unavailable still gets a fully working exercise,
 * just without a tick on the index. Failures are silent on purpose — there is
 * nothing a visitor could do about them.
 */

/**
 * The key carries its schema version. A future shape change writes
 * `mcc:progress:v2` and may migrate v1 across; it never reinterprets v1 bytes
 * under new rules, because a half-migrated record is worse than a lost one.
 */
import { queueExercise, queueGame } from '@lib/progress-sync';

const STORAGE_KEY = 'mcc:progress:v1';

/**
 * ⚠️ THERE IS NO LONGER A MAXIMUM SINGLE AWARD — `AWARD_MAX` IS GONE.
 *
 * Migration 0014 removed the `points <= 50` CHECK; Seàn's call. The size of an
 * award is a teaching judgement about a particular student on a particular day,
 * and a schema constant took that judgement away from the person in the room.
 * What replaces the ceiling is what this project uses everywhere else a number
 * is trusted: every row carries `awarded_by` and a required `reason`, and every
 * award is visible on the student's own page. A prof who awards 5,000 points
 * has not found a hole — they have signed their name to it.
 *
 * ⚠️ THE FLOOR STAYS, AND IT IS NOT A TYPO GUARD. `points > 0` is still a CHECK
 * in the database and still enforced on read below. This site records losses
 * and charges nothing for them (Critical Feature 35); an award that could be
 * NEGATIVE would turn the ledger into a disciplinary instrument, which is a
 * different product.
 *
 * ⚠️ AND THE READ-SIDE BOUND HAD TO GO WITH IT, WHICH IS THE HALF THAT WOULD
 * HAVE BEEN MISSED. `normalizeAwards` used to DISCARD any mirrored row over 50.
 * Left in place after the migration, the first award a prof made above the old
 * cap would have been written to the database, synced down, and then silently
 * dropped on read — a number that exists, is attributed, and does not appear.
 */

/** What we remember about one exercise. */
export interface ExerciseProgress {
  readonly solved: boolean;
  /** Wrong / off-line moves, counted across all sessions. */
  readonly attempts: number;
  readonly hintUsed: boolean;
  /** ISO 8601, or null if never solved. */
  readonly solvedAt: string | null;
}

/**
 * Results against the engine, per level (E3).
 *
 * ⚠️ LOSSES AND DRAWS ARE RECORDED AND NEVER COST ANYTHING. They are here
 * because a record of what happened is worth keeping and because v2-S3 will
 * sync it; they are read by no scoring rule at all. This is a teaching tool —
 * see `src/lib/points.ts`, where only `wins` is summed. If a future feature
 * ever wants to show a win RATE, it must not be allowed to read as a
 * reprimand.
 */
export interface GameRecord {
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

export type GameOutcome = 'win' | 'draw' | 'loss';

export const EMPTY_GAMES: GameRecord = { wins: 0, draws: 0, losses: 0 };

/**
 * One finished game, as a ROW — date, level, outcome.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE COUNTERS CANNOT PRODUCE A HISTORY, WHICH IS WHY THIS EXISTS.
 *
 * `games` is three numbers per level. It answers "how many wins at Avancé"
 * — which is all the ledger needs — and cannot answer "what did I play, and
 * when", because the moment a game is folded into a counter its date is gone.
 * Games were being recorded and never shown; this is the row the history reads.
 *
 * ⚠️ IT IS A SECOND RECORD OF THE SAME EVENT, AND THE COUNTER STAYS THE ONE
 * THAT SCORES. Points are derived from `games` exactly as before — nothing in
 * `points.ts` reads this log, and it must stay that way. Two sources that both
 * fed the ledger would be two sources to disagree, and the counter is the one
 * the cloud sync already merges.
 *
 * ⚠️ BOUNDED, BECAUSE `localStorage` IS NOT INFINITE and a page that renders
 * every game a student ever played is not a page anybody reads. The oldest
 * entries fall off; nothing that scores is lost when they do, because the
 * counters are separate.
 * ═════════════════════════════════════════════════════════════════════════
 */
export interface GameLogEntry {
  /** ISO timestamp, or null for a row written before this was recorded. */
  readonly at: string | null;
  readonly level: string;
  readonly outcome: GameOutcome;
}

/**
 * How many finished games are remembered.
 *
 * 50 is roughly a term of weekly play for an enthusiastic student — long
 * enough that the history is a history rather than a glimpse, short enough
 * that the record stays a few kilobytes.
 */
export const GAME_LOG_MAX = 50;

/**
 * One point award from a prof (v2-S4).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ MIRRORED FROM THE CLOUD, AND NEVER WRITTEN BY THIS DEVICE.
 *
 * These rows are the local copy of `point_awards`, pulled on sign-in exactly as
 * exercise records are. Three things about that are load-bearing:
 *
 *  * **It is still not a balance.** A row carries what happened and why; the
 *    total is recomputed from the rows by the ledger, like everything else. If
 *    anyone is ever tempted to cache the sum here, the whole anti-cheat posture
 *    of E3 goes with it.
 *  * **Nothing local ever creates one.** There is no `recordAward()` and there
 *    must not be. A student who edits this array gives themselves points on
 *    their own screen until the next sign-in overwrites it, and gives
 *    themselves nothing at all anywhere else — the database has no INSERT
 *    policy for them, which is where the refusal actually lives.
 *  * **A guest has none, and that is not a degraded state.** Awards exist only
 *    where a prof and an account do.
 *
 * ⚠️ THE KEY STAYS `v1`. This ADDS a namespace and reinterprets nothing: a
 * record written before v2-S4 has no `awards`, which normalises to empty — the
 * true statement "no prof has awarded this reader anything". Same no-op shape
 * change as `games`/`announced` in E3 and `boardTheme` in E6.
 * ═════════════════════════════════════════════════════════════════════════
 */
export interface AwardRecord {
  /** Positive. The database enforces it; see migrations 0004 and 0014. */
  readonly points: number;
  /** Required, and shown to the student. A point with no reason is arbitrary. */
  readonly reason: string;
  /** ISO 8601, or null when the cloud row carried nothing usable. */
  readonly awardedAt: string | null;
}

export interface Progress {
  readonly exercises: Readonly<Record<string, ExerciseProgress>>;
  /**
   * Keyed by engine level id. A plain record rather than a typed one: the value
   * came off disk and may name a level this build has never heard of.
   */
  readonly games: Readonly<Record<string, GameRecord>>;
  /**
   * Achievements already ANNOUNCED to the reader — a UI bookmark, not the
   * achievement itself.
   *
   * ⚠️ EARNING IS DERIVED; ANNOUNCING IS STORED. Whether an achievement is
   * earned is recomputed from the work every time (see points.ts). This list
   * only stops the toast firing again on every page load for ever. Clearing it
   * re-announces things the reader already earned, which is harmless; it can
   * never grant anything, because it is not consulted when deciding what is
   * earned.
   */
  readonly announced: readonly string[];
  /** Teacher awards, mirrored from the cloud. Rows, never a total. */
  readonly awards: readonly AwardRecord[];
  /**
   * Finished games, newest first, bounded to `GAME_LOG_MAX`.
   *
   * ⚠️ NOT WHAT SCORES. See `GameLogEntry` — `games` is still the ledger’s
   * only source, and this is the history beside it.
   */
  readonly log: readonly GameLogEntry[];
}

export const EMPTY_EXERCISE: ExerciseProgress = {
  solved: false,
  attempts: 0,
  hintUsed: false,
  solvedAt: null,
};

const EMPTY_PROGRESS: Progress = { exercises: {}, games: {}, announced: [], awards: [], log: [] };

/** `localStorage`, or null when it is unavailable for any reason. */
function storage(): Storage | null {
  try {
    // SSR has no `window`; some embedded contexts THROW on property access
    // rather than returning undefined, which is why this is inside the try.
    if (typeof globalThis.localStorage === 'undefined') return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * Coerce one stored record into a valid shape.
 *
 * Deliberately field-by-field rather than a cast: the value came from disk and
 * may have been written by an older build, a different tab, or a person with
 * devtools open. A bad field falls back to its default instead of poisoning
 * the whole store.
 */
function normalizeEntry(value: unknown): ExerciseProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const attempts = typeof raw['attempts'] === 'number' && Number.isFinite(raw['attempts'])
    ? Math.max(0, Math.floor(raw['attempts']))
    : 0;
  return {
    solved: raw['solved'] === true,
    attempts,
    hintUsed: raw['hintUsed'] === true,
    solvedAt: typeof raw['solvedAt'] === 'string' ? raw['solvedAt'] : null,
  };
}

/** A non-negative whole number, or 0. Same defensive posture as `attempts`. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Coerce the awards array, field by field and row by row.
 *
 * ⚠️ A ROW THAT DOES NOT MAKE SENSE IS DROPPED, NOT REPAIRED. `points` is
 * clamped to the range the database enforces (1–50) rather than trusted: this
 * array is the one part of the store whose contents a student never earned
 * locally, so a hand-edited 5000 must not become 5000 points on their own
 * screen either. The clamp is a mirror of the CHECK in migration 0004, not a
 * second policy — the database remains the place the rule lives.
 *
 * A row with no reason is dropped outright. The reason is required precisely
 * because a point nobody can explain reads as arbitrary; showing one with a
 * blank explanation would be the failure the constraint exists to prevent.
 */
/**
 * The game history, normalised field by field like everything else here.
 *
 * ⚠️ AN UNKNOWN LEVEL SURVIVES, exactly as it does in `normalizeGames`: a
 * record written by a build with a fourth engine preset must not lose its
 * history when read by this one. Only the OUTCOME is validated against the
 * union, because the page branches on it and an unknown value would render as
 * nothing.
 *
 * ⚠️ TRUNCATED ON READ AS WELL AS ON WRITE. A hand-edited record could carry
 * ten thousand rows; the page should not try to render them.
 */
function normalizeLog(value: unknown): GameLogEntry[] {
  if (!Array.isArray(value)) return [];
  const out: GameLogEntry[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const outcome = raw['outcome'];
    if (outcome !== 'win' && outcome !== 'draw' && outcome !== 'loss') continue;
    const level = typeof raw['level'] === 'string' ? raw['level'] : '';
    if (level === '') continue;
    out.push({
      at: typeof raw['at'] === 'string' ? raw['at'] : null,
      level,
      outcome,
    });
    if (out.length >= GAME_LOG_MAX) break;
  }
  return out;
}

function normalizeAwards(value: unknown): AwardRecord[] {
  if (!Array.isArray(value)) return [];
  const out: AwardRecord[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const points = count(raw['points']);
    const reason = typeof raw['reason'] === 'string' ? raw['reason'].trim() : '';
    /* ⚠️ NO UPPER BOUND — see the note where AWARD_MAX used to be. A row over
       the old ceiling is a legitimate award since migration 0014, and dropping
       it here would make a prof's decision disappear between the database and
       the page. */
    if (points < 1 || reason.length === 0) continue;
    out.push({
      points,
      reason,
      awardedAt: typeof raw['awardedAt'] === 'string' ? raw['awardedAt'] : null,
    });
  }
  return out;
}

function normalizeGames(value: unknown): Record<string, GameRecord> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, GameRecord> = {};
  for (const [level, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    out[level] = {
      wins: count(raw['wins']),
      draws: count(raw['draws']),
      losses: count(raw['losses']),
    };
  }
  return out;
}

/** The whole store. Returns an empty one rather than throwing, always. */
export function readProgress(): Progress {
  const store = storage();
  if (!store) return EMPTY_PROGRESS;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS;
    const record = parsed as Record<string, unknown>;

    /**
     * ⚠️ THE KEY STAYS `v1`, AND THAT IS BY CONSTRUCTION RATHER THAN BY HOPE.
     *
     * E3 ADDED two top-level fields and reinterpreted none. A pre-E3 record has
     * no `games` and no `announced`; both normalise to empty, which is the true
     * statement "this reader has played no recorded games and been told about
     * no achievements". Nothing stored under v1 is read under new rules — the
     * exact test the version-in-the-key rule asks (CLAUDE.md), and the same
     * no-op migration `boardTheme` made in E6.
     */
    const exercises = record['exercises'];
    if (typeof exercises !== 'object' || exercises === null) return EMPTY_PROGRESS;

    const out: Record<string, ExerciseProgress> = {};
    for (const [slug, entry] of Object.entries(exercises as Record<string, unknown>)) {
      const normalized = normalizeEntry(entry);
      if (normalized) out[slug] = normalized;
    }

    const announced = Array.isArray(record['announced'])
      ? (record['announced'] as unknown[]).filter((id): id is string => typeof id === 'string')
      : [];

    return {
      exercises: out,
      games: normalizeGames(record['games']),
      announced,
      awards: normalizeAwards(record['awards']),
      log: normalizeLog(record['log']),
    };
  } catch {
    // Unparseable JSON, a thrown getItem — either way, start from empty. We do
    // NOT delete the bad value: a future version may be able to salvage it, and
    // destroying a reader's data to tidy up is the wrong trade.
    return EMPTY_PROGRESS;
  }
}

/** One exercise's record, defaulted. Never returns undefined. */
export function readExercise(slug: string): ExerciseProgress {
  return readProgress().exercises[slug] ?? EMPTY_EXERCISE;
}

/**
 * Persist a whole store.
 *
 * ⚠️ IT WRITES EVERY NAMESPACE, ALWAYS. Before E3 this was inlined into the
 * exercise writer and spelled `{ exercises: ... }` — which was complete then
 * and would have SILENTLY DELETED `games` and `announced` the moment they
 * existed: solve one exercise after winning a game and the game is gone, with
 * no error anywhere. Every writer goes through here so there is one place that
 * knows what a complete record is.
 */
function persist(next: Progress): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Private mode, quota exceeded, storage disabled. The exercise still
       works; only the tick on the index is lost. Nothing to tell the reader. */
  }
}

/**
 * Read-modify-write one exercise. Returns the value the caller should render —
 * which is the NEW value even when the write failed, so the UI stays consistent
 * within the session on a device that cannot persist anything.
 */
function update(
  slug: string,
  mutate: (previous: ExerciseProgress) => ExerciseProgress,
): ExerciseProgress {
  const current = readProgress();
  const next = mutate(current.exercises[slug] ?? EMPTY_EXERCISE);
  persist({ ...current, exercises: { ...current.exercises, [slug]: next } });
  /**
   * ⚠️ WRITE-THROUGH, AND STRICTLY AFTER THE LOCAL WRITE (v2-S3).
   *
   * The local record is already persisted by the line above, so a failed or
   * slow cloud write can never lose it — the queue simply retries. This call
   * returns immediately and does nothing at all for a guest: `queueExercise`
   * checks the auth flag first, so a signed-out reader's write path never
   * reaches any Supabase code. See `progress-sync.ts`.
   */
  queueExercise(slug, next);
  return next;
}

/** A wrong or off-line move. Counts on every attempt, solved or not. */
export function recordAttempt(slug: string): ExerciseProgress {
  return update(slug, (p) => ({ ...p, attempts: p.attempts + 1 }));
}

/** The reader revealed the hint. Sticky — revealing it once is the fact. */
export function recordHintUsed(slug: string): ExerciseProgress {
  return update(slug, (p) => ({ ...p, hintUsed: true }));
}

/**
 * Solved.
 *
 * `solvedAt` keeps the FIRST solve, not the latest: re-solving an exercise is a
 * good thing and must not look like starting over. `solvedAt` is passed in
 * rather than read from the clock here so the module stays trivially testable.
 */
export function recordSolved(slug: string, at: string = new Date().toISOString()): ExerciseProgress {
  return update(slug, (p) => ({ ...p, solved: true, solvedAt: p.solvedAt ?? at }));
}

/**
 * "Recommencer" — reset the ATTEMPT count for a fresh run.
 *
 * Completion is deliberately NOT cleared: having solved something once is a
 * fact about the reader, and a retry button that silently takes back a tick
 * would punish curiosity. `hintUsed` stays for the same reason.
 */
export function resetAttempts(slug: string): ExerciseProgress {
  return update(slug, (p) => ({ ...p, attempts: 0 }));
}

/* ═══════════════════════ teacher awards (v2-S4) ══════════════════════════ */

/**
 * Replace the mirrored awards with what the cloud says.
 *
 * ⚠️ REPLACE, NEVER MERGE — and this is the one place in the store where that
 * is the right verb. Everything else here is the reader's own work and merges
 * by max/OR/union, because two devices can both be right. Awards are not the
 * reader's work at all: the server is the only author, so the server's list is
 * simply the list. Merging would make a withdrawn award immortal on whichever
 * device saw it first.
 *
 * ⚠️ CALLED ONLY BY `progress-sync.ts`, and only for a signed-in reader. There
 * is deliberately no public "add an award" — see `AwardRecord`.
 */
export function mirrorAwards(awards: readonly AwardRecord[]): readonly AwardRecord[] {
  const current = readProgress();
  const next = normalizeAwards(awards);
  persist({ ...current, awards: next });
  return next;
}

/** What a prof has awarded, newest first. Empty for a guest, always. */
export function awards(): readonly AwardRecord[] {
  return [...readProgress().awards].sort((a, b) => (b.awardedAt ?? '').localeCompare(a.awardedAt ?? ''));
}

/**
 * The ISO week a timestamp falls in, as `2026-W34`.
 *
 * ⚠️ ISO WEEKS, WHICH START ON MONDAY, and that is the right choice here rather
 * than a pedantic one: the club meets at the weekend, so a Sunday session and
 * the Saturday before it must land in the SAME week. A Sunday-start week would
 * split a single weekend across two marks and make one visit look like two.
 *
 * ⚠️ COMPUTED FROM THE DEVICE'S OWN CLOCK, like every other date on this page.
 * A wrong clock costs a mark in the wrong column; nothing scores off it.
 */
function isoWeek(date: Date): string {
  /* Thursday decides the year — the ISO rule, and the reason a 1 January can
     belong to the previous year's week 52. */
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The ISO week containing today, on this device. */
export function currentWeek(): string {
  return isoWeek(new Date());
}

/**
 * Every week in which this reader did SOMETHING — newest first.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ DERIVED, NOT BANKED, AND THAT IS WHY IT NEEDED NO NEW STORAGE. The
 * timestamps already exist: `solvedAt` on every solved exercise and tutorial
 * step, `at` on every logged game. A stored "weeks active" counter would be a
 * number a console can edit and a number that can disagree with the records
 * behind it — the same reasoning as Critical Feature 33.
 *
 * ⚠️ IT IS A COUNT OF PRESENCES AND NEVER A STREAK. There is deliberately no
 * "consecutive weeks" here and there must not be: the club meets weekly, and a
 * consecutive-week counter punishes a missed holiday exactly the way Critical
 * Feature 34 forbids a daily one from punishing a normal Tuesday. A missed week
 * is simply a week that is not in this list — it costs a mark, not a run.
 *
 * ⚠️ WHAT IT CANNOT SEE, STATED RATHER THAN HIDDEN: `solvedAt` keeps the FIRST
 * solve, so a week spent re-solving old exercises leaves no trace, and the game
 * log is bounded (`GAME_LOG_MAX`), so weeks fall off the far end eventually.
 * Both make this an UNDERCOUNT. That is the safe direction — it can fail to
 * credit a week, and it can never invent one.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function activeWeeks(): readonly string[] {
  const progress = readProgress();
  const weeks = new Set<string>();

  const add = (iso: string | null) => {
    if (!iso) return;
    const stamp = Date.parse(iso);
    if (Number.isNaN(stamp)) return;
    weeks.add(isoWeek(new Date(stamp)));
  };

  for (const entry of Object.values(progress.exercises)) add(entry.solvedAt);
  for (const game of progress.log) add(game.at);

  /* Lexicographic sort is chronological for `YYYY-Www`, which is the whole
     reason the key is shaped that way. */
  return [...weeks].sort((a, b) => b.localeCompare(a));
}

/**
 * The finished games, newest first — what `/progres/` draws its history from.
 *
 * ⚠️ ALREADY IN ORDER, because `recordGame` prepends. Sorting on read would
 * work today and would quietly become the wrong answer for any entry whose
 * `at` is null — a row written before timestamps existed, or by a device with
 * no usable clock. Insertion order is the truth we actually have.
 */
export function gameLog(): readonly GameLogEntry[] {
  return readProgress().log;
}

/** The slugs solved at least once — what the index needs to draw its ticks. */
export function solvedSlugs(): readonly string[] {
  return Object.entries(readProgress().exercises)
    .filter(([, entry]) => entry.solved)
    .map(([slug]) => slug);
}

/**
 * What an index card should say about one slug (M3).
 *
 * Three states, and the middle one is the point: an index that only marks
 * solved work tells a returning reader nothing about where they stopped, which
 * is the single most useful thing an index can carry.
 *
 * ⚠️ `started` means the reader ATTEMPTED something — a move judged, or a hint
 * opened. Merely opening the page leaves no trace and is deliberately not
 * progress, exactly as the E5 "Reprendre" resolver defines `touched`. The two
 * must agree, or a card can say "in progress" for something Reprendre will not
 * offer to resume.
 */
export type ProgressState = 'solved' | 'started' | 'none';

export function progressState(slug: string): ProgressState {
  const entry = readExercise(slug);
  if (entry.solved) return 'solved';
  if (entry.attempts > 0 || entry.hintUsed) return 'started';
  return 'none';
}

/**
 * Every tracked slug's state in one read.
 *
 * An index has many cards, and `progressState()` per card would parse the
 * store once per card. One parse, one map.
 */
export function progressStates(): ReadonlyMap<string, ProgressState> {
  const out = new Map<string, ProgressState>();
  for (const [slug, entry] of Object.entries(readProgress().exercises)) {
    if (entry.solved) out.set(slug, 'solved');
    else if (entry.attempts > 0 || entry.hintUsed) out.set(slug, 'started');
  }
  return out;
}

/* ═══════════════════════ games against the engine (E3) ═══════════════════ */

/**
 * Record one finished game.
 *
 * ⚠️ NOTHING RECORDED THIS BEFORE E3, which is why the point ledger needed it:
 * `/jouer/` announced a result and forgot it the moment the reader pressed
 * "new game". A win at Avancé is the strongest single piece of evidence this
 * site can gather about a student, and it was being thrown away.
 *
 * `level` is the engine preset id. It is written as given rather than validated
 * against a union, for the same reason the read path tolerates unknown levels:
 * a record written by a build with a fourth preset must survive this one.
 */
export function recordGame(level: string, outcome: GameOutcome): GameRecord {
  const current = readProgress();
  const previous = current.games[level] ?? EMPTY_GAMES;
  const next: GameRecord = {
    wins: previous.wins + (outcome === 'win' ? 1 : 0),
    draws: previous.draws + (outcome === 'draw' ? 1 : 0),
    losses: previous.losses + (outcome === 'loss' ? 1 : 0),
  };
  /**
   * ⚠️ NEWEST FIRST, AND TRIMMED HERE RATHER THAN ON READ. The page renders the
   * front of this array, so prepending keeps "most recent" free of a sort; and
   * trimming at the moment of writing is what stops the record growing without
   * bound on a device that never reloads.
   *
   * ⚠️ The timestamp is the DEVICE's clock and is presentational only. Nothing
   * scores off it (see `GameLogEntry`), so a wrong clock costs a wrong date in
   * a list — not a wrong ledger.
   */
  const entry: GameLogEntry = { at: new Date().toISOString(), level, outcome };
  const log = [entry, ...current.log].slice(0, GAME_LOG_MAX);

  persist({ ...current, games: { ...current.games, [level]: next }, log });
  /**
   * ⚠️ ONE ROW PER GAME, WITH AN ID — the local shape stays a counter, but the
   * durable copy is a row, because two counters cannot be merged and rows with
   * ids can. A random id makes the union exact for every game from here on;
   * only the counters that predate v2-S3 need the deterministic fallback in
   * `progress-sync.ts`.
   */
  queueGame(newGameId(), level, outcome);
  return next;
}

/**
 * A fresh id for one game. `crypto.randomUUID` where it exists — it is in every
 * browser this site supports — with a random fallback so a write can never
 * throw on a platform that lacks it.
 */
function newGameId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Wins per level — what the ledger sums. Losses are deliberately not here. */
export function winsByLevel(): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [level, record] of Object.entries(readProgress().games)) {
    out[level] = record.wins;
  }
  return out;
}

/* ═════════════════════ achievements: announced, not earned ═══════════════ */

/** Mark achievements as told-to-the-reader. Returns the full announced set. */
export function markAnnounced(ids: readonly string[]): readonly string[] {
  const current = readProgress();
  const merged = [...new Set([...current.announced, ...ids])];
  persist({ ...current, announced: merged });
  return merged;
}

/* ═══════════════════════════ the session streak ══════════════════════════ */

/**
 * THE STREAK LIVES IN `sessionStorage`, AND THAT IS THE FEATURE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THERE IS NO DAILY STREAK AND THERE IS NOT GOING TO BE ONE.
 *
 * Recorded so it is not re-proposed: the club meets WEEKLY. A consecutive-day
 * streak would break every single week by design, for every student, through no
 * fault of theirs — it would punish the normal rhythm of the people it is meant
 * to motivate. The direction doc raises the same worry (§ B2: *une série de
 * jours qui se casse peut décourager plutôt que motiver*) and this is the
 * answer to it.
 *
 * A SESSION streak is the honest version: it measures accuracy right now, it
 * cannot be "lost" by living your life, and it disappears on its own when the
 * tab closes rather than sitting in storage as a record of a lapse.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `sessionStorage` is exactly "this tab, until it closes", which is what
 * "within the current session" means — and it survives navigating from one
 * exercise to the next, which an in-memory counter would not. It is web storage
 * and therefore belongs to this module: nothing else in the codebase touches
 * either store or knows either key.
 *
 * ⚠️ IT IS NOT SYNCED, EVER. v2-S3 syncs `mcc:progress:v1`; a session streak is
 * meaningless on another device by construction, so keeping it under its own
 * key in a store that does not outlive the tab is what keeps it out.
 */
const STREAK_KEY = 'mcc:streak:v1';

function sessionStore(): Storage | null {
  try {
    if (typeof globalThis.sessionStorage === 'undefined') return null;
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/** The current run of correct solves. 0 when there is none, always. */
export function readStreak(): number {
  const store = sessionStore();
  if (!store) return 0;
  try {
    return count(Number(store.getItem(STREAK_KEY)));
  } catch {
    return 0;
  }
}

function writeStreak(value: number): number {
  const store = sessionStore();
  if (store) {
    try {
      store.setItem(STREAK_KEY, String(value));
    } catch {
      /* Same silence as everywhere else here. A streak that cannot be stored
         simply reads as zero, and a zero streak shows nothing at all. */
    }
  }
  return value;
}

/**
 * A correct solve. Extends the run and returns the new length.
 *
 * ⚠️ A RE-SOLVE EXTENDS IT, even though it awards no points. The streak is a
 * statement about this session's accuracy, not about new ground covered — and
 * with sixteen solvable things on the site, a streak that only counted firsts
 * would be unreachable for a returning student, which is the reader most likely
 * to have one.
 */
export function extendStreak(): number {
  return writeStreak(readStreak() + 1);
}

/**
 * A wrong or off-line move. The run resets.
 *
 * ⚠️ RESETTING IS NOT A PUNISHMENT AND MUST NEVER BE PRESENTED AS ONE. There is
 * no "streak lost" message anywhere and there must not be: the number simply
 * stops being shown when it is below two. A student who sees their own mistake
 * announced twice — once as a wrong move, once as a forfeited streak — learns
 * that trying is expensive.
 */
export function resetStreak(): number {
  return writeStreak(0);
}

/* ══ v2-S3 — the durable copy ═══════════════════════════════════════════════
 *
 * ⚠️ THE ONLY DOOR. Components import `progress.ts` and nothing else; the
 * Supabase-touching module stays behind these three lines so "progress.ts is
 * the single reader" survives the arrival of a backend. Re-exports rather than
 * wrappers: a wrapper would be a second place for the state to be wrong.
 */
export { syncState, startSync, SYNC_EVENT, type SyncState } from '@lib/progress-sync';
export type { ImportReport } from '@lib/progress-sync';

/**
 * The first sign-in merge. Reads what this device knows, merges it with what
 * the cloud knows, writes the union back to BOTH, and reports what this device
 * contributed.
 *
 * ⚠️ IT IS `progress.ts` THAT PERSISTS THE RESULT, not the sync module — the
 * store has exactly one writer and this keeps it that way. `importGuestProgress`
 * is handed a callback rather than the key.
 */
export async function importFromCloud(): Promise<import('@lib/progress-sync').ImportReport> {
  const { importGuestProgress } = await import('@lib/progress-sync');
  return importGuestProgress(readProgress(), (merged) => persist(merged));
}
