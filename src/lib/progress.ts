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
const STORAGE_KEY = 'mcc:progress:v1';

/** What we remember about one exercise. */
export interface ExerciseProgress {
  readonly solved: boolean;
  /** Wrong / off-line moves, counted across all sessions. */
  readonly attempts: number;
  readonly hintUsed: boolean;
  /** ISO 8601, or null if never solved. */
  readonly solvedAt: string | null;
}

export interface Progress {
  readonly exercises: Readonly<Record<string, ExerciseProgress>>;
}

export const EMPTY_EXERCISE: ExerciseProgress = {
  solved: false,
  attempts: 0,
  hintUsed: false,
  solvedAt: null,
};

const EMPTY_PROGRESS: Progress = { exercises: {} };

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

/** The whole store. Returns an empty one rather than throwing, always. */
export function readProgress(): Progress {
  const store = storage();
  if (!store) return EMPTY_PROGRESS;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS;

    const exercises = (parsed as Record<string, unknown>)['exercises'];
    if (typeof exercises !== 'object' || exercises === null) return EMPTY_PROGRESS;

    const out: Record<string, ExerciseProgress> = {};
    for (const [slug, entry] of Object.entries(exercises as Record<string, unknown>)) {
      const normalized = normalizeEntry(entry);
      if (normalized) out[slug] = normalized;
    }
    return { exercises: out };
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

  const store = storage();
  if (store) {
    try {
      store.setItem(
        STORAGE_KEY,
        JSON.stringify({ exercises: { ...current.exercises, [slug]: next } }),
      );
    } catch {
      /* Private mode, quota exceeded, storage disabled. The exercise still
         works; only the tick on the index is lost. Nothing to tell the reader. */
    }
  }
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

/** The slugs solved at least once — what the index needs to draw its ticks. */
export function solvedSlugs(): readonly string[] {
  return Object.entries(readProgress().exercises)
    .filter(([, entry]) => entry.solved)
    .map(([slug]) => slug);
}
